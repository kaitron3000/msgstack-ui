'use client'
import { useState } from 'react'
import { Plus, MessageSquare, Loader2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { PLATFORMS } from '@/lib/platforms'
import type { NavId, Group } from '@/types'
import GroupModal from './GroupModal'

function Pill({ active }: { active: boolean }) {
  return (
    <span
      className="absolute -left-3 w-1 bg-white rounded-r-full transition-all duration-200 pointer-events-none"
      style={{ height: active ? 40 : 0 }}
    />
  )
}

function ServerBtn({
  id, label, color, active, unread, connected, onClick, children,
}: {
  id: NavId; label: string; color: string; active: boolean
  unread?: number; connected?: boolean; onClick: () => void; children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  const rounded = active || hovered ? '15px' : '50%'

  return (
    <div className="relative flex justify-center items-center mb-2 group">
      <Pill active={active} />
      {/* hover pill */}
      {!active && (
        <span
          className="absolute -left-3 w-1 bg-white rounded-r-full transition-all duration-200 pointer-events-none"
          style={{ height: hovered ? 20 : 0 }}
        />
      )}
      <button
        title={label}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="w-12 h-12 flex items-center justify-center text-white font-bold transition-all duration-200 overflow-hidden cursor-pointer"
        style={{
          backgroundColor: active ? color : hovered ? color : '#36393f',
          borderRadius: rounded,
        }}
      >
        {children}
      </button>
      {unread && unread > 0 ? (
        <div className="absolute bottom-0 right-0 min-w-[18px] h-[18px] bg-[#ed4245] rounded-full flex items-center justify-center text-[10px] font-extrabold text-white px-1 pointer-events-none border-2 border-[#1e1f22]">
          {unread > 99 ? '99+' : unread}
        </div>
      ) : connected ? (
        <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-[#23a55a] rounded-full border-2 border-[#1e1f22] pointer-events-none" />
      ) : null}
    </div>
  )
}

function Divider() {
  return (
    <div className="flex justify-center my-1">
      <div className="w-8 h-[2px] bg-[#35373c] rounded-full" />
    </div>
  )
}

export default function PlatformRail() {
  const { selectedNav, selectNav, rooms, groups, deleteGroup, syncingPlatform, bridgeConnections } = useStore()
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ group: Group; x: number; y: number } | null>(null)

  const totalUnread = rooms.reduce((s, r) => s + r.unreadCount, 0)
  const platformUnread = (id: string) =>
    rooms.filter(r => r.platform === id).reduce((s, r) => s + r.unreadCount, 0)

  return (
    <>
      <nav
        className="w-[72px] bg-[#1e1f22] flex flex-col items-center pt-3 pb-3 overflow-y-auto shrink-0"
        onClick={() => setCtxMenu(null)}
      >
        <ServerBtn id="all" label="All Messages" color="#5865f2" active={selectedNav === 'all'} unread={totalUnread} onClick={() => selectNav('all')}>
          <MessageSquare size={24} />
        </ServerBtn>

        <Divider />

        {PLATFORMS.map(p => (
          <ServerBtn key={p.id} id={p.id} label={p.name} color={p.color} active={selectedNav === p.id} unread={platformUnread(p.id)} connected={bridgeConnections[p.id]} onClick={() => selectNav(p.id)}>
            {syncingPlatform === p.id ? (
              <Loader2 size={22} className="animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" width="26" height="26" fill="white">
                <path d={p.svgPath} />
              </svg>
            )}
          </ServerBtn>
        ))}

        {groups.length > 0 && <Divider />}

        {groups.map(g => {
          const unread = rooms.filter(r => g.roomIds.includes(r.id)).reduce((s, r) => s + r.unreadCount, 0)
          return (
            <ServerBtn key={g.id} id={g.id} label={g.name} color={g.color} active={selectedNav === g.id} unread={unread} onClick={() => selectNav(g.id)}>
              <span
                className="text-2xl leading-none"
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ group: g, x: e.clientX, y: e.clientY }) }}
              >
                {g.emoji}
              </span>
            </ServerBtn>
          )
        })}

        <Divider />

        <ServerBtn id="__add" label="Create Group" color="#23a55a" active={false} onClick={() => setShowGroupModal(true)}>
          <Plus size={24} />
        </ServerBtn>
      </nav>

      {ctxMenu && (
        <div
          className="fixed z-50 bg-[#111214] border border-white/10 rounded-md py-1 shadow-2xl w-48"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={() => setCtxMenu(null)}
        >
          <button className="w-full text-left px-3 py-2 text-sm text-[#ed4245] hover:bg-[#ed4245] hover:text-white rounded-sm mx-0.5 transition-colors" onClick={() => deleteGroup(ctxMenu.group.id)}>
            Delete "{ctxMenu.group.name}"
          </button>
        </div>
      )}

      {showGroupModal && <GroupModal onClose={() => setShowGroupModal(false)} />}
    </>
  )
}
