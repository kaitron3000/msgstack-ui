'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppRoom, AppMessage, Group, NavId } from '@/types'
import { GROUP_COLORS } from './platforms'
import {
  loginWithPassword,
  restoreClient,
  startSync,
  getAppRooms,
  getRoomMessages,
  sendMessage,
  loadGroups,
  saveGroups,
} from './matrix'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MatrixClient = any

interface AppState {
  // Auth
  client: MatrixClient | null
  userId: string
  accessToken: string
  homeserver: string
  synced: boolean

  // Navigation
  selectedNav: NavId
  selectedRoomId: string | null

  // Data
  rooms: AppRoom[]
  groups: Group[]
  messages: AppMessage[]
  messagesRoomId: string | null
  loadingMessages: boolean
  replyTo: AppMessage | null
  roomMessages: Record<string, AppMessage[]>   // pre-loaded per-room cache
  syncingPlatform: string | null               // platform currently syncing after connect
  bridgeConnections: Record<string, boolean>   // explicit connection state, source of truth for UI

  // Actions
  login: (homeserver: string, username: string, password: string) => Promise<void>
  logout: () => void
  initClient: () => Promise<void>
  setRooms: (rooms: AppRoom[]) => void
  selectNav: (id: NavId) => void
  selectRoom: (roomId: string | null) => void
  loadMessages: (roomId: string) => Promise<void>
  sendMsg: (roomId: string, text: string) => Promise<void>
  setReplyTo: (msg: AppMessage | null) => void
  createGroup: (name: string, color: string, emoji: string) => Promise<void>
  deleteGroup: (id: string) => Promise<void>
  addToGroup: (groupId: string, roomId: string) => Promise<void>
  removeFromGroup: (groupId: string, roomId: string) => Promise<void>
  appendMessage: (msg: AppMessage) => void
  syncPlatformMessages: (platformId: string) => Promise<void>
  setBridgeConnected: (platformId: string, connected: boolean) => void
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      client: null,
      userId: '',
      accessToken: '',
      homeserver: 'https://msgstack.pro',
      synced: false,
      selectedNav: 'all',
      selectedRoomId: null,
      rooms: [],
      groups: [],
      messages: [],
      messagesRoomId: null,
      loadingMessages: false,
      replyTo: null,
      roomMessages: {},
      syncingPlatform: null,
      bridgeConnections: {},

      login: async (homeserver, username, password) => {
        const { client, userId, accessToken } = await loginWithPassword(
          homeserver,
          username,
          password
        )
        set({ client, userId, accessToken, homeserver })
        await get().initClient()
      },

      logout: () => {
        const { client } = get()
        client?.stopClient()
        set({
          client: null, userId: '', accessToken: '', synced: false,
          rooms: [], groups: [], messages: [], selectedRoomId: null, selectedNav: 'all',
        })
        if (typeof window !== 'undefined') {
          localStorage.removeItem('msgstack-auth')
        }
      },

      initClient: async () => {
        const { client, userId } = get()
        if (!client) return

        await startSync(client)

        const rooms = getAppRooms(client, userId)
        const groups = await loadGroups(client, userId)
        set({ rooms, groups, synced: true })

        // Live updates
        client.on('Room.timeline', () => {
          set({ rooms: getAppRooms(client, userId) })
          const { selectedRoomId, messagesRoomId } = get()
          if (selectedRoomId && selectedRoomId === messagesRoomId) {
            get().loadMessages(selectedRoomId)
          }
        })

        client.on('Room', () => {
          set({ rooms: getAppRooms(client, userId) })
        })
      },

      setRooms: (rooms) => set({ rooms }),

      selectNav: (id) => set({ selectedNav: id, selectedRoomId: null, messages: [] }),

      selectRoom: async (roomId) => {
        set({ selectedRoomId: roomId })
        if (!roomId) return

        // Serve from cache instantly if available
        const cached = get().roomMessages[roomId]
        if (cached?.length) {
          set({ messages: cached, messagesRoomId: roomId })
        }

        // Always refresh in background
        await get().loadMessages(roomId)

        // Mark as read
        const { client } = get()
        if (client) {
          const room = client.getRoom(roomId)
          const lastEvent = room?.getLiveTimeline().getEvents().at(-1)
          if (lastEvent) {
            try { await client.sendReadReceipt(lastEvent) } catch { /* ignore */ }
          }
        }
      },

      loadMessages: async (roomId) => {
        const { client, userId } = get()
        if (!client) return
        set({ loadingMessages: true })
        const messages = await getRoomMessages(client, roomId, userId, 50)
        // Update both the active view and the cache
        set(s => ({
          messages: s.selectedRoomId === roomId ? messages : s.messages,
          messagesRoomId: roomId,
          loadingMessages: false,
          roomMessages: { ...s.roomMessages, [roomId]: messages },
        }))
      },

      syncPlatformMessages: async (platformId) => {
        const { client, userId } = get()
        if (!client) return

        set({ syncingPlatform: platformId })

        // Force an immediate re-sync to pull in new rooms from the bridge
        try { client.retryImmediately?.() } catch { /* ignore */ }

        // Wait a moment for new rooms to arrive
        await new Promise(r => setTimeout(r, 3000))

        const rooms = getAppRooms(client, userId)
        set({ rooms })

        // Load messages for every room on this platform (batched, 5 at a time)
        const platformRooms = rooms.filter(r => r.platform === platformId)
        const BATCH = 5
        for (let i = 0; i < platformRooms.length; i += BATCH) {
          const batch = platformRooms.slice(i, i + BATCH)
          await Promise.all(
            batch.map(async (room) => {
              try {
                const msgs = await getRoomMessages(client, room.id, userId, 50)
                set(s => ({ roomMessages: { ...s.roomMessages, [room.id]: msgs } }))
              } catch { /* ignore per-room errors */ }
            })
          )
          // Refresh room list after each batch so unread counts update
          set({ rooms: getAppRooms(client, userId) })
        }

        set({ syncingPlatform: null })
      },

      sendMsg: async (roomId, text) => {
        const { client, replyTo } = get()
        if (!client) return
        if (replyTo) {
          await client.sendMessage(roomId, {
            msgtype: 'm.text',
            body: `> ${replyTo.body}\n\n${text}`,
            format: 'org.matrix.custom.html',
            formatted_body: `<mx-reply><blockquote>${replyTo.body}</blockquote></mx-reply>${text}`,
            'm.relates_to': {
              'm.in_reply_to': { event_id: replyTo.id },
            },
          })
          set({ replyTo: null })
        } else {
          await sendMessage(client, roomId, text)
        }
      },

      setReplyTo: (msg) => set({ replyTo: msg }),

      setBridgeConnected: (platformId, connected) =>
        set(s => ({ bridgeConnections: { ...s.bridgeConnections, [platformId]: connected } })),

      appendMessage: (msg) => {
        set(s => ({ messages: [...s.messages, msg] }))
      },

      createGroup: async (name, color, emoji) => {
        const { client, userId, groups } = get()
        const newGroup: Group = {
          id: `group-${Date.now()}`,
          name, color, emoji, roomIds: [],
        }
        const updated = [...groups, newGroup]
        set({ groups: updated })
        if (client) await saveGroups(client, updated)
      },

      deleteGroup: async (id) => {
        const { client, groups } = get()
        const updated = groups.filter(g => g.id !== id)
        set({ groups: updated })
        if (client) await saveGroups(client, updated)
      },

      addToGroup: async (groupId, roomId) => {
        const { client, groups } = get()
        const updated = groups.map(g =>
          g.id === groupId && !g.roomIds.includes(roomId)
            ? { ...g, roomIds: [...g.roomIds, roomId] }
            : g
        )
        set({ groups: updated })
        if (client) await saveGroups(client, updated)
      },

      removeFromGroup: async (groupId, roomId) => {
        const { client, groups } = get()
        const updated = groups.map(g =>
          g.id === groupId
            ? { ...g, roomIds: g.roomIds.filter(r => r !== roomId) }
            : g
        )
        set({ groups: updated })
        if (client) await saveGroups(client, updated)
      },
    }),
    {
      name: 'msgstack-auth',
      partialize: (s) => ({
        userId: s.userId,
        accessToken: s.accessToken,
        homeserver: s.homeserver,
      }),
    }
  )
)
