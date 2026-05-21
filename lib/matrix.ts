import type { AppRoom, AppMessage, PlatformId } from '@/types'
import { detectPlatform } from './platforms'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MatrixClient = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MatrixRoom = any

let _client: MatrixClient | null = null

export function getClient(): MatrixClient | null {
  return _client
}

export async function loginWithPassword(
  homeserver: string,
  username: string,
  password: string
): Promise<{ client: MatrixClient; userId: string; accessToken: string }> {
  const { createClient } = await import('matrix-js-sdk')
  const tmp = createClient({ baseUrl: homeserver })
  const res = await tmp.login('m.login.password', {
    user: username,
    password,
    initial_device_display_name: 'msgstack',
  })
  const client = createClient({
    baseUrl: homeserver,
    userId: res.user_id,
    accessToken: res.access_token,
    deviceId: res.device_id,
  })
  _client = client
  return { client, userId: res.user_id, accessToken: res.access_token }
}

export async function restoreClient(
  homeserver: string,
  userId: string,
  accessToken: string
): Promise<MatrixClient> {
  const { createClient } = await import('matrix-js-sdk')
  const client = createClient({ baseUrl: homeserver, userId, accessToken })
  _client = client
  return client
}

export async function startSync(client: MatrixClient): Promise<void> {
  await client.startClient({ initialSyncLimit: 50, lazyLoadMembers: true })
  return new Promise(resolve => {
    client.once('sync', (state: string) => {
      if (state === 'PREPARED') resolve()
    })
  })
}

export function roomToAppRoom(room: MatrixRoom, userId: string): AppRoom {
  const memberIds: string[] = room.getMembers().map((m: { userId: string }) => m.userId)
  const platform = detectPlatform(memberIds)

  // Last message
  const timeline = room.getLiveTimeline().getEvents()
  let lastMessage = ''
  let lastMessageTs = room.getLastActiveTimestamp() ?? 0
  for (let i = timeline.length - 1; i >= 0; i--) {
    const ev = timeline[i]
    if (ev.getType() === 'm.room.message') {
      lastMessage = ev.getContent()?.body ?? ''
      lastMessageTs = ev.getTs()
      break
    }
  }

  const isDM = memberIds.length <= 3 && platform !== 'matrix'

  return {
    id: room.roomId,
    name: room.name || room.roomId,
    platform: platform as PlatformId | 'matrix',
    lastMessage,
    lastMessageTs,
    unreadCount: room.getUnreadNotificationCount() ?? 0,
    isDM,
  }
}

export function getAppRooms(client: MatrixClient, userId: string): AppRoom[] {
  return client
    .getRooms()
    .filter((r: MatrixRoom) => {
      // Skip spaces and rooms we've left
      const membership = r.getMyMembership()
      if (membership !== 'join') return false
      const isSpace = r.isSpaceRoom?.() ?? false
      return !isSpace
    })
    .map((r: MatrixRoom) => roomToAppRoom(r, userId))
    .sort((a: AppRoom, b: AppRoom) => b.lastMessageTs - a.lastMessageTs)
}

export async function getRoomMessages(
  client: MatrixClient,
  roomId: string,
  userId: string,
  limit = 50
): Promise<AppMessage[]> {
  const room = client.getRoom(roomId)
  if (!room) return []

  const timeline = room.getLiveTimeline().getEvents()
  const msgs: AppMessage[] = []

  for (const ev of timeline) {
    if (ev.getType() !== 'm.room.message') continue
    const content = ev.getContent()
    if (!content) continue
    msgs.push({
      id: ev.getId(),
      sender: ev.getSender(),
      senderName: room.getMember(ev.getSender())?.name ?? ev.getSender(),
      body: content.body ?? '',
      ts: ev.getTs(),
      msgtype: content.msgtype ?? 'm.text',
      isMe: ev.getSender() === userId,
      mxcUrl: content.url ?? content.file?.url,
      mimeType: content.info?.mimetype,
      fileName: content.filename ?? content.body,
    })
  }

  if (msgs.length < limit) {
    try {
      await client.scrollback(room, limit)
      const extended = room.getLiveTimeline().getEvents()
      msgs.length = 0
      for (const ev of extended) {
        if (ev.getType() !== 'm.room.message') continue
        const content = ev.getContent()
        if (!content) continue
        msgs.push({
          id: ev.getId(),
          sender: ev.getSender(),
          senderName: room.getMember(ev.getSender())?.name ?? ev.getSender(),
          body: content.body ?? '',
          ts: ev.getTs(),
          msgtype: content.msgtype ?? 'm.text',
          isMe: ev.getSender() === userId,
          mxcUrl: content.url ?? content.file?.url,
          mimeType: content.info?.mimetype,
          fileName: content.filename ?? content.body,
        })
      }
    } catch { /* scrollback failed, use what we have */ }
  }

  return msgs.slice(-limit)
}

export async function sendMessage(
  client: MatrixClient,
  roomId: string,
  text: string
): Promise<void> {
  await client.sendTextMessage(roomId, text)
}

const GROUPS_EVENT_TYPE = 'pro.msgstack.groups'

export async function loadGroups(client: MatrixClient, userId: string) {
  try {
    const data = await client.getAccountData(GROUPS_EVENT_TYPE)
    return (data?.getContent()?.groups ?? []) as import('@/types').Group[]
  } catch {
    return []
  }
}

export async function saveGroups(
  client: MatrixClient,
  groups: import('@/types').Group[]
) {
  await client.setAccountData(GROUPS_EVENT_TYPE, { groups })
}
