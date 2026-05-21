'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { restoreClient, startSync, getAppRooms, loadGroups } from '@/lib/matrix'
import { requestPermission, showNotification } from '@/lib/notifications'
import { PLATFORMS } from '@/lib/platforms'
import { detectStatus } from '@/lib/bridges'
import PlatformRail from '@/components/PlatformRail'
import ChatList from '@/components/ChatList'
import ChatView from '@/components/ChatView'

const BOT_USER_IDS = new Set(PLATFORMS.map(p => p.botUserId))

export default function ChatPage() {
  const router = useRouter()
  const store = useStore()
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    async function boot() {
      const { accessToken, userId, homeserver, client } = store

      if (!accessToken || !userId) {
        router.push('/login')
        return
      }

      try {
        let c = client
        if (!c) {
          c = await restoreClient(homeserver, userId, accessToken)
          useStore.setState({ client: c })
        }

        if (!store.synced) {
          await startSync(c)
          const rooms = getAppRooms(c, userId)
          const groups = await loadGroups(c, userId)

          // Detect initial bridge connection states from management room history
          const bridgeConnections: Record<string, boolean> = {}
          for (const p of PLATFORMS) {
            const status = detectStatus(c, p.botUserId)
            bridgeConnections[p.id] = status === 'connected'
          }

          useStore.setState({ rooms, groups, synced: true, bridgeConnections })
          requestPermission()

          // Bug 3 fix: auto-join rooms invited by bridge bots
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          c.on('RoomMember.membership', async (event: any, member: any) => {
            if (member.userId !== userId) return
            if (member.membership !== 'invite') return

            const room = c.getRoom(member.roomId)
            if (!room) return

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const memberIds = room.getMembers().map((m: any) => m.userId)
            const fromBridge = memberIds.some((id: string) => BOT_USER_IDS.has(id))
            if (!fromBridge) return

            console.log('[AutoJoin] Bridge room invite received:', member.roomId)
            try {
              await c.joinRoom(member.roomId)
              console.log('[AutoJoin] Joined bridge room:', member.roomId)
              useStore.setState({ rooms: getAppRooms(c, userId) })
            } catch (e) {
              console.error('[AutoJoin] Failed to join room:', member.roomId, e)
            }
          })

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          c.on('Room.timeline', (event: any, room: any) => {
            useStore.setState({ rooms: getAppRooms(c, userId) })

            if (!event || event.getType() !== 'm.room.message') return
            if (event.getSender() === userId) return
            const content = event.getContent()
            if (!content?.body) return

            const senderName = room?.getMember(event.getSender())?.name ?? event.getSender()
            const roomName = room?.name ?? 'New message'
            showNotification(roomName, `${senderName}: ${content.body}`)
          })

          c.on('Room', () => {
            useStore.setState({ rooms: getAppRooms(c, userId) })
          })
        }
      } catch {
        router.push('/login')
        return
      }

      setBooting(false)
    }

    boot()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (booting) {
    return (
      <div className="min-h-screen bg-[#313338] flex items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-gray-400 text-sm">Connecting…</span>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#313338]">
      <PlatformRail />
      <ChatList />
      <ChatView />
    </div>
  )
}
