'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { restoreClient, startSync, getAppRooms, loadGroups } from '@/lib/matrix'
import { requestPermission, showNotification } from '@/lib/notifications'
import PlatformRail from '@/components/PlatformRail'
import ChatList from '@/components/ChatList'
import ChatView from '@/components/ChatView'

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
          useStore.setState({ rooms, groups, synced: true })

          // Request notification permission after first sync
          requestPermission()

          // Live updates
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          c.on('Room.timeline', (event: any, room: any) => {
            useStore.setState({ rooms: getAppRooms(c, userId) })

            // Fire notification for new incoming messages
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
