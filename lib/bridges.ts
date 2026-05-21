import { PLATFORMS } from './platforms'
import type { PlatformId } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MatrixClient = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MatrixRoom = any

export type BridgeStatus = 'connected' | 'disconnected' | 'unknown'

export interface BridgeState {
  platformId: PlatformId
  status: BridgeStatus
  managementRoomId: string | null
}

/** Find the DM management room between the user and a bridge bot */
export function findManagementRoom(client: MatrixClient, botUserId: string): MatrixRoom | null {
  const rooms: MatrixRoom[] = client.getRooms()
  for (const room of rooms) {
    if (room.getMyMembership() !== 'join') continue
    const members = room.getMembers().filter((m: any) => m.membership === 'join')
    const memberIds = members.map((m: any) => m.userId)
    if (memberIds.includes(botUserId) && memberIds.length <= 3) {
      return room
    }
  }
  return null
}

/** Get or create a DM room with the bridge bot */
export async function getOrCreateManagementRoom(
  client: MatrixClient,
  botUserId: string
): Promise<string> {
  const existing = findManagementRoom(client, botUserId)
  if (existing) return existing.roomId

  const res = await client.createRoom({
    invite: [botUserId],
    is_direct: true,
    preset: 'trusted_private_chat',
  })
  return res.room_id
}

/** Detect connection status from management room messages */
export function detectStatus(client: MatrixClient, botUserId: string): BridgeStatus {
  const room = findManagementRoom(client, botUserId)
  if (!room) return 'disconnected'

  const events = room.getLiveTimeline().getEvents()
  // Walk backwards to find latest bot message
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev.getSender() !== botUserId) continue
    if (ev.getType() !== 'm.room.message') continue
    const body: string = (ev.getContent()?.body ?? '').toLowerCase()
    if (body.includes('logged in') || body.includes('successfully') ||
        body.includes('connected') || body.includes('welcome') ||
        body.includes('you are now')) return 'connected'
    if (body.includes('not logged') || body.includes('logged out') ||
        body.includes('disconnected')) return 'disconnected'
  }

  // Fallback: if there are bridged rooms for this platform, assume connected
  return 'unknown'
}

export function getAllBridgeStates(client: MatrixClient): BridgeState[] {
  return PLATFORMS.map(p => {
    const room = findManagementRoom(client, p.botUserId)
    const status = detectStatus(client, p.botUserId)
    return { platformId: p.id as PlatformId, status, managementRoomId: room?.roomId ?? null }
  })
}

/** Convert mxc:// URL to https download URL */
export function mxcToHttp(mxcUrl: string, homeserver: string, accessToken: string): string {
  if (!mxcUrl?.startsWith('mxc://')) return ''
  const withoutPrefix = mxcUrl.slice(6)
  const [server, mediaId] = withoutPrefix.split('/')
  return `${homeserver}/_matrix/media/v3/download/${server}/${mediaId}?access_token=${encodeURIComponent(accessToken)}`
}

export interface BotMessage {
  id: string
  ts: number
  type: 'text' | 'image'
  body?: string
  mxcUrl?: string
}

export function parseBotMessages(room: MatrixRoom, botUserId: string, since: number): BotMessage[] {
  const events = room.getLiveTimeline().getEvents()
  const msgs: BotMessage[] = []
  for (const ev of events) {
    if (ev.getSender() !== botUserId) continue
    if (ev.getTs() <= since) continue
    const content = ev.getContent()
    if (ev.getType() === 'm.room.message') {
      if (content.msgtype === 'm.image') {
        msgs.push({ id: ev.getId(), ts: ev.getTs(), type: 'image', mxcUrl: content.url })
      } else if (content.msgtype === 'm.text' || content.msgtype === 'm.notice') {
        msgs.push({ id: ev.getId(), ts: ev.getTs(), type: 'text', body: content.body ?? '' })
      }
    }
  }
  return msgs
}
