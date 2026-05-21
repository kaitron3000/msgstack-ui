'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { GROUP_COLORS } from '@/lib/platforms'

const EMOJIS = ['💬', '⭐', '🏢', '👥', '🎯', '🔥', '💼', '🌍', '🎮', '❤️', '🚀', '📌']

export default function GroupModal({ onClose }: { onClose: () => void }) {
  const { createGroup } = useStore()
  const [name, setName] = useState('')
  const [color, setColor] = useState(GROUP_COLORS[0])
  const [emoji, setEmoji] = useState('💬')

  async function handleCreate() {
    if (!name.trim()) return
    await createGroup(name.trim(), color, emoji)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#1e1f22] rounded-2xl p-6 w-80 shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-lg">Create Group</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>

        {/* Preview */}
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ backgroundColor: color }}>
            {emoji}
          </div>
        </div>

        {/* Emoji picker */}
        <div className="grid grid-cols-6 gap-2 mb-4">
          {EMOJIS.map(e => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={`text-xl w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${emoji === e ? 'bg-white/20' : 'hover:bg-white/10'}`}
            >
              {e}
            </button>
          ))}
        </div>

        {/* Color picker */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {GROUP_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Name input */}
        <input
          type="text"
          placeholder="Group name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
          autoFocus
          className="w-full bg-[#111214] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 outline-none focus:border-indigo-500 mb-4"
        />

        <button
          onClick={handleCreate}
          disabled={!name.trim()}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors"
        >
          Create Group
        </button>
      </div>
    </div>
  )
}
