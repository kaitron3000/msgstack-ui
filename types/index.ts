export type PlatformId = 'whatsapp' | 'telegram' | 'signal' | 'discord'
export type NavId = 'all' | PlatformId | string

export interface Group {
  id: string
  name: string
  color: string
  emoji: string
  roomIds: string[]
}

export interface AppRoom {
  id: string
  name: string
  platform: PlatformId | 'matrix'
  lastMessage: string
  lastMessageTs: number
  unreadCount: number
  avatarUrl?: string
  isDM: boolean
}

export interface AppMessage {
  id: string
  sender: string
  senderName: string
  body: string
  ts: number
  msgtype: string
  isMe: boolean
  mxcUrl?: string       // for m.image / m.video / m.file
  mimeType?: string
  fileName?: string
}
