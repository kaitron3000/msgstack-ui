'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight, Hash, Pencil, Settings, PlugZap } from 'lucide-react'
import { useStore } from '@/lib/store'
import { PLATFORMS, getPlatform } from '@/lib/platforms'
import IntegrationsPanel from './IntegrationsPanel'
import type { AppRoom } from '@/types'

function ChannelItem({ room, selected, onSelect, groupMode, inGroup, onToggle }: {
  room: AppRoom; selected: boolean; onSelect: () => void
  groupMode: boolean; inGroup: boolean; onToggle: () => void
}) {
  const p = getPlatform(room.platform)

  return (
    <div
      onClick={groupMode ? onToggle : onSelect}
      className={`group flex items-center gap-1.5 py-[5px] px-2 mx-2 rounded cursor-pointer transition-colors ${
        selected && !groupMode
          ? 'bg-[#404249] text-[#f2f3f5]'
          : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
      }`}
    >
      {room.isDM ? (
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 relative"
          style={{ backgroundColor: p?.color ?? '#5865f2' }}>
          {room.name.charAt(0).toUpperCase()}
          {p && (
            <div className="absolute -bottom-0.5 -right-0.5 w-[14px] h-[14px] rounded-full flex items-center justify-center border border-[#2b2d31]"
              style={{ backgroundColor: p.color }}>
              <svg viewBox="0 0 24 24" width="8" height="8" fill="white"><path d={p.svgPath} /></svg>
            </div>
          )}
        </div>
      ) : (
        <Hash size={18} className="shrink-0 opacity-60 group-hover:opacity-100" />
      )}

      <span className="flex-1 text-[15px] font-medium truncate">{room.name}</span>

      {groupMode ? (
        <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
          inGroup ? 'bg-indigo-600 border-indigo-600' : 'border-[#949ba4]'
        }`}>
          {inGroup && (
            <svg viewBox="0 0 12 12" width="10" height="10" fill="white">
              <path d="M1 6l3.5 3.5L11 2" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
          )}
        </div>
      ) : room.unreadCount > 0 ? (
        <div className="min-w-[16px] h-4 bg-white rounded-full text-[10px] font-extrabold text-black flex items-center justify-center px-1 shrink-0">
          {room.unreadCount > 99 ? '99+' : room.unreadCount}
        </div>
      ) : null}
    </div>
  )
}

function CategoryHeader({ label, count }: { label: string; count: number }) {
  const [open, setOpen] = useState(true)
  return (
    <button
      onClick={() => setOpen(o => !o)}
      className="w-full flex items-center gap-1 px-2 pt-4 pb-1 text-[#949ba4] hover:text-[#dbdee1] transition-colors group"
    >
      {open
        ? <ChevronDown size={12} className="shrink-0" />
        : <ChevronRight size={12} className="shrink-0" />}
      <span className="text-[11px] font-semibold uppercase tracking-[0.02em] truncate">
        {label}
      </span>
    </button>
  )
}

export default function ChatList() {
  const { selectedNav, selectedRoomId, rooms, groups, selectRoom, addToGroup, removeFromGroup, userId, logout } = useStore()
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [showIntegrations, setShowIntegrations] = useState(false)

  const platform = PLATFORMS.find(p => p.id === selectedNav)
  const currentGroup = groups.find(g => g.id === selectedNav)
  const isEditing = editingGroupId === selectedNav && !!currentGroup

  let allRooms: AppRoom[]
  if (selectedNav === 'all') {
    allRooms = [...rooms].sort((a, b) => b.lastMessageTs - a.lastMessageTs)
  } else if (platform) {
    allRooms = rooms.filter(r => r.platform === selectedNav)
  } else if (currentGroup) {
    allRooms = isEditing ? rooms : rooms.filter(r => currentGroup.roomIds.includes(r.id))
  } else {
    allRooms = []
  }

  const dms = allRooms.filter(r => r.isDM)
  const channels = allRooms.filter(r => !r.isDM)

  const headerName = selectedNav === 'all' ? 'All Messages'
    : platform?.name ?? currentGroup?.name ?? 'Messages'

  const headerColor = platform?.color ?? currentGroup?.color

  const shortId = userId.replace('@', '').split(':')[0]

  function toggle(roomId: string) {
    if (!currentGroup) return
    if (currentGroup.roomIds.includes(roomId)) removeFromGroup(currentGroup.id, roomId)
    else addToGroup(currentGroup.id, roomId)
  }

  return (
    <div className="w-60 bg-[#2b2d31] flex flex-col shrink-0">
      {/* Server name header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-[#1e1f22] shadow-[0_1px_0_rgba(4,4,5,0.2),0_1.5px_0_rgba(6,6,7,0.05),0_2px_0_rgba(4,4,5,0.05)] cursor-pointer hover:bg-[#35373c] transition-colors shrink-0">
        <span className="font-bold text-[#f2f3f5] text-[15px] truncate">{headerName}</span>
        <ChevronDown size={16} className="text-[#b5bac1] shrink-0" />
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto pb-2">
        {/* Group edit bar */}
        {currentGroup && (
          <div className="px-3 pt-3 pb-1">
            <button
              onClick={() => setEditingGroupId(isEditing ? null : selectedNav)}
              className={`w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded font-semibold transition-colors ${
                isEditing ? 'bg-[#5865f2] text-white' : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-white/5'
              }`}
            >
              <Pencil size={12} />
              {isEditing ? 'Done editing' : 'Edit group chats'}
            </button>
            {isEditing && <p className="text-[11px] text-[#949ba4] mt-1 px-1">Tap chats to add or remove</p>}
          </div>
        )}

        {/* DM section */}
        {dms.length > 0 && (
          <>
            <CategoryHeader label="Direct Messages" count={dms.length} />
            {dms.map(r => (
              <ChannelItem key={r.id} room={r} selected={selectedRoomId === r.id}
                onSelect={() => selectRoom(r.id)} groupMode={isEditing}
                inGroup={currentGroup?.roomIds.includes(r.id) ?? false}
                onToggle={() => toggle(r.id)} />
            ))}
          </>
        )}

        {/* Channels section */}
        {channels.length > 0 && (
          <>
            <CategoryHeader label="Text Channels" count={channels.length} />
            {channels.map(r => (
              <ChannelItem key={r.id} room={r} selected={selectedRoomId === r.id}
                onSelect={() => selectRoom(r.id)} groupMode={isEditing}
                inGroup={currentGroup?.roomIds.includes(r.id) ?? false}
                onToggle={() => toggle(r.id)} />
            ))}
          </>
        )}

        {allRooms.length === 0 && (
          <p className="text-[#6d6f78] text-sm text-center px-4 py-8">
            {isEditing ? 'No chats available' : 'No chats yet'}
          </p>
        )}
      </div>

      {/* User panel */}
      <div className="h-[52px] bg-[#232428] flex items-center px-2 gap-2 shrink-0">
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-sm font-bold text-white">
            {shortId.charAt(0).toUpperCase()}
          </div>
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#23a55a] rounded-full border-2 border-[#232428]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#f2f3f5] leading-tight truncate">{shortId}</p>
          <p className="text-[11px] text-[#949ba4] leading-tight">Online</p>
        </div>
        <div className="flex items-center gap-1 text-[#b5bac1]">
          <button title="Connect accounts" onClick={() => setShowIntegrations(true)} className="p-1.5 rounded hover:bg-white/10 transition-colors">
            <PlugZap size={16} />
          </button>
          <button title="Log out" onClick={logout} className="p-1.5 rounded hover:bg-white/10 transition-colors">
            <Settings size={16} />
          </button>
        </div>

        {showIntegrations && <IntegrationsPanel onClose={() => setShowIntegrations(false)} />}
      </div>
    </div>
  )
}
