'use client'
import { useEffect, useRef, useState } from 'react'
import { Hash, AtSign, Send, FileText, Download, Reply, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { getPlatform } from '@/lib/platforms'
import { mxcToHttp } from '@/lib/bridges'
import type { AppMessage } from '@/types'

const SENDER_COLORS = [
  '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
  '#2196f3', '#009688', '#4caf50', '#ff9800',
  '#ff5722', '#795548', '#00bcd4', '#8bc34a',
]

function senderColor(sender: string) {
  let hash = 0
  for (let i = 0; i < sender.length; i++) hash = sender.charCodeAt(i) + ((hash << 5) - hash)
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length]
}

function isSameMinute(a: number, b: number) {
  return Math.abs(a - b) < 60_000
}

function formatDate(ts: number) {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
}

function DateDivider({ ts }: { ts: number }) {
  return (
    <div className="flex items-center gap-4 px-4 my-4">
      <div className="flex-1 h-px bg-[#3f4147]" />
      <span className="text-xs font-semibold text-[#949ba4]">{formatDate(ts)}</span>
      <div className="flex-1 h-px bg-[#3f4147]" />
    </div>
  )
}

function MediaContent({ msg }: { msg: AppMessage }) {
  const { homeserver, accessToken } = useStore()
  if (!msg.mxcUrl) return null
  const src = mxcToHttp(msg.mxcUrl, homeserver, accessToken)

  if (msg.msgtype === 'm.image') {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="block mt-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={msg.fileName ?? 'image'} className="max-w-xs max-h-64 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity" />
      </a>
    )
  }
  if (msg.msgtype === 'm.video') {
    return (
      <video src={src} controls className="max-w-xs max-h-48 rounded-lg mt-1" />
    )
  }
  if (msg.msgtype === 'm.audio') {
    return <audio src={src} controls className="mt-1 w-60" />
  }
  // m.file or unknown
  return (
    <a href={src} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2 mt-1 bg-[#2b2d31] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#00a8fc] hover:underline max-w-xs">
      <FileText size={16} className="shrink-0 text-[#949ba4]" />
      <span className="truncate">{msg.fileName ?? 'File'}</span>
      <Download size={14} className="shrink-0 text-[#949ba4]" />
    </a>
  )
}

function MessageGroup({ messages, isMe }: { messages: AppMessage[]; isMe: boolean }) {
  const first = messages[0]
  const time = new Date(first.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const color = isMe ? '#5865F2' : senderColor(first.sender)

  const { setReplyTo } = useStore()

  return (
    <div className="group flex gap-4 px-4 py-0.5 hover:bg-[#2e3035] rounded relative">
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-sm font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {first.senderName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        {/* Name + timestamp */}
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold" style={{ color }}>{first.senderName}</span>
          <span className="text-[11px] text-[#949ba4]">{time}</span>
        </div>
        {/* Messages */}
        {messages.map(msg => (
          <div key={msg.id}>
            {msg.body && msg.msgtype !== 'm.image' && msg.msgtype !== 'm.video' && msg.msgtype !== 'm.audio' && msg.msgtype !== 'm.file' && (
              <p className="text-[#dbdee1] text-sm leading-[1.375] break-words">{msg.body}</p>
            )}
            <MediaContent msg={msg} />
          </div>
        ))}
      </div>
      {/* Reply button on hover */}
      <button
        onClick={() => setReplyTo(first)}
        className="absolute right-4 top-1 hidden group-hover:flex items-center gap-1 bg-[#313338] border border-white/10 text-[#949ba4] hover:text-white px-2 py-1 rounded text-xs transition-colors shadow"
      >
        <Reply size={12} /> Reply
      </button>
    </div>
  )
}

export default function ChatView() {
  const { selectedRoomId, rooms, messages, loadingMessages, sendMsg, setReplyTo, replyTo, userId } = useStore()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const room = rooms.find(r => r.id === selectedRoomId)
  const platform = room ? getPlatform(room.platform) : null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (selectedRoomId) inputRef.current?.focus()
  }, [selectedRoomId])

  async function handleSend() {
    const text = input.trim()
    if (!text || !selectedRoomId) return
    setInput('')
    await sendMsg(selectedRoomId, text)
  }

  if (!selectedRoomId || !room) {
    return (
      <div className="flex-1 bg-[#313338] flex flex-col items-center justify-center gap-4">
        <div className="w-20 h-20 rounded-full bg-[#2b2d31] flex items-center justify-center">
          <Hash size={40} className="text-[#4f545c]" />
        </div>
        <div className="text-center">
          <h2 className="text-white font-bold text-2xl mb-1">Select a channel</h2>
          <p className="text-[#949ba4] text-sm">Pick a conversation from the left to get started</p>
        </div>
      </div>
    )
  }

  // Group consecutive messages from the same sender within 1 minute
  type MsgGroup = { msgs: AppMessage[]; isMe: boolean; dayBreak?: number }
  const grouped: MsgGroup[] = []
  let lastDay = ''

  for (const msg of messages) {
    const dayStr = new Date(msg.ts).toDateString()
    const dayBreak = dayStr !== lastDay ? msg.ts : undefined
    lastDay = dayStr

    const prev = grouped[grouped.length - 1]
    if (prev && !dayBreak && prev.msgs[0].sender === msg.sender && isSameMinute(prev.msgs[prev.msgs.length - 1].ts, msg.ts)) {
      prev.msgs.push(msg)
    } else {
      grouped.push({ msgs: [msg], isMe: msg.isMe, dayBreak })
    }
  }

  return (
    <div className="flex-1 bg-[#313338] flex flex-col min-w-0">
      {/* Channel header */}
      <div className="h-12 border-b border-black/30 flex items-center px-4 gap-3 shrink-0 shadow-sm">
        {room.isDM ? (
          <>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ backgroundColor: platform?.color ?? '#5865F2' }}
            >
              {room.name.charAt(0).toUpperCase()}
            </div>
            <span className="font-bold text-white text-sm">{room.name}</span>
          </>
        ) : (
          <>
            <Hash size={20} className="text-[#949ba4] shrink-0" />
            <span className="font-bold text-white text-sm">{room.name}</span>
          </>
        )}
        {platform && (
          <div
            className="ml-2 flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: platform.color + '33', color: platform.color }}
          >
            <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor">
              <path d={platform.svgPath} />
            </svg>
            {platform.name}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto flex flex-col py-4 gap-0.5">
        {loadingMessages ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-start justify-end px-4 pb-4">
            <div className="w-16 h-16 rounded-full bg-[#404249] flex items-center justify-center mb-4" style={platform ? { backgroundColor: platform.color } : {}}>
              {room.isDM
                ? <AtSign size={32} className="text-white" />
                : <Hash size={32} className="text-white" />}
            </div>
            <h2 className="text-white font-extrabold text-2xl mb-1">
              {room.isDM ? room.name : `#${room.name}`}
            </h2>
            <p className="text-[#949ba4] text-sm">
              {room.isDM
                ? `This is the beginning of your conversation with ${room.name}.`
                : `This is the beginning of the #${room.name} channel.`}
            </p>
          </div>
        ) : (
          grouped.map((g, i) => (
            <div key={i}>
              {g.dayBreak && <DateDivider ts={g.dayBreak} />}
              <MessageGroup messages={g.msgs} isMe={g.isMe} />
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Message input */}
      <div className="px-4 pb-6 pt-2 shrink-0">
        {/* Reply preview */}
        {replyTo && (
          <div className="flex items-center gap-2 bg-[#2b2d31] border-l-4 border-[#5865f2] rounded-t-lg px-3 py-2 mb-0">
            <Reply size={14} className="text-[#5865f2] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#5865f2] leading-tight">{replyTo.senderName}</p>
              <p className="text-xs text-[#949ba4] truncate">{replyTo.body}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-[#949ba4] hover:text-white transition-colors shrink-0">
              <X size={14} />
            </button>
          </div>
        )}
        <div className={`bg-[#383a40] flex items-end px-4 gap-3 ${replyTo ? 'rounded-b-lg' : 'rounded-lg'}`}>
          <textarea
            ref={inputRef}
            rows={1}
            placeholder={`Message ${room.isDM ? room.name : '#' + room.name}`}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            className="flex-1 bg-transparent text-[#dbdee1] placeholder-[#6d6f78] text-sm outline-none resize-none py-[11px] max-h-[200px] leading-[1.375]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="text-[#b5bac1] hover:text-white disabled:opacity-30 pb-[11px] transition-colors"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}
