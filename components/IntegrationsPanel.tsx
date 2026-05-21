'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { X, ArrowLeft, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { PLATFORMS } from '@/lib/platforms'
import { getOrCreateManagementRoom, mxcToHttp, findManagementRoom } from '@/lib/bridges'
import type { PlatformId } from '@/types'

// ── Helpers ────────────────────────────────────────────────────────────────

function extractUrl(t: string): string | null {
  const md = t.match(/\[.*?\]\(((?:https?|sgnl):\/\/[^)]+)\)/)
  if (md) return md[1]
  const plain = t.match(/((?:https?|sgnl):\/\/[^\s>]+)/)
  return plain ? plain[1] : null
}

const SUCCESS = ['logged in', 'successfully', 'welcome', 'connected', 'you are now', 'login successful']
const ERRORS  = ['failed', 'error', 'bad-request', 'invalid', 'try again', 'unknown', 'denied', 'timed out', 'timeout']
function isSuccess(t: string) { return SUCCESS.some(k => t.toLowerCase().includes(k)) }
function isError(t: string)   { return ERRORS.some(k => t.toLowerCase().includes(k)) && !isSuccess(t) }

/** Wait until the bot user has joined the room (max 15s) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForBotJoin(client: any, roomId: string, botUserId: string): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    const room = client.getRoom(roomId)
    if (room) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const member = room.getMember(botUserId)
      if (member && (member.membership === 'join' || member.membership === 'invite')) return true
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

/** Detect connection status by checking if rooms with this bot exist */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectConnected(client: any, botUserId: string, userId: string): boolean {
  // Check management room for a recent success message
  const mgmt = findManagementRoom(client, botUserId)
  if (!mgmt) return false
  const events = mgmt.getLiveTimeline().getEvents()
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev.getSender() !== botUserId) continue
    if (ev.getType() !== 'm.room.message') continue
    const body: string = (ev.getContent()?.body ?? '').toLowerCase()
    if (isSuccess(body)) return true
    if (body.includes('not logged') || body.includes('logged out') || body.includes('disconnected')) return false
  }
  // Fallback: any bridged rooms for this platform?
  const rooms = client.getRooms()
  return rooms.some((r: any) => {
    if (r.getMyMembership() !== 'join') return false
    const members = r.getMembers().map((m: any) => m.userId)
    return members.includes(botUserId) && members.includes(userId) && members.length > 2
  })
}

// ── QR image from mxc:// URL ───────────────────────────────────────────────

function MxcQR({ mxcUrl, homeserver, token }: { mxcUrl: string; homeserver: string; token: string }) {
  const src = mxcToHttp(mxcUrl, homeserver, token)
  return (
    <div className="rounded-2xl bg-white p-3 shadow-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="QR" className="w-52 h-52 object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
    </div>
  )
}

// ── QR from deep-link URL (Signal) ────────────────────────────────────────

function UrlQR({ url }: { url: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    import('qrcode').then(Q => Q.toDataURL(url, { width: 208, margin: 1 }).then(setSrc).catch(() => {}))
  }, [url])
  return src
    ? <div className="rounded-2xl bg-white p-3 shadow-lg"><img src={src} alt="QR" className="w-52 h-52" /></div>
    : <div className="w-52 h-52 rounded-2xl bg-[#2b2d31] flex items-center justify-center"><Loader2 size={24} className="animate-spin text-[#5865f2]" /></div>
}

// ── Generic hook: listen to bot messages in a room ─────────────────────────

type BotHandler = (body: string | null, mxcUrl: string | null, type: string) => void

function useBotMessages(roomId: string, botUserId: string, onMessage: BotHandler) {
  const { client } = useStore()
  useEffect(() => {
    if (!client || !roomId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function handler(event: any, room: any) {
      if (room?.roomId !== roomId) return
      if (event.getSender() !== botUserId) return
      if (event.getType() !== 'm.room.message') return
      const content = event.getContent()
      const mxc = content.msgtype === 'm.image' ? (content.url ?? null) : null
      onMessage(content.body ?? null, mxc, content.msgtype ?? 'm.text')
    }
    client.on('Room.timeline', handler)
    return () => client.removeListener('Room.timeline', handler)
  }, [client, roomId, botUserId, onMessage])
}

// ── WhatsApp ───────────────────────────────────────────────────────────────

function WhatsAppLogin({ onDone, onError }: { onDone: () => void; onError: (e: string) => void }) {
  const { client, homeserver, accessToken } = useStore()
  const p = PLATFORMS.find(pl => pl.id === 'whatsapp')!
  const [qrMxc, setQrMxc] = useState('')
  const [phase, setPhase] = useState<'starting' | 'qr' | 'done'>('starting')
  const [roomId, setRoomId] = useState('')

  useBotMessages(roomId, p.botUserId, useCallback((body, mxc) => {
    if (mxc) { setQrMxc(mxc); setPhase('qr'); return }
    if (body) {
      if (isSuccess(body)) { setPhase('done'); setTimeout(onDone, 1500) }
      if (isError(body)) onError(body)
    }
  }, [onDone, onError]))

  useEffect(() => {
    if (!client) return
    async function start() {
      const rid = await getOrCreateManagementRoom(client, p.botUserId)
      setRoomId(rid)
      await waitForBotJoin(client, rid, p.botUserId)
      await client.sendTextMessage(rid, 'login')
    }
    start().catch(e => onError(e.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase === 'done') return <SuccessView name="WhatsApp" />
  if (phase === 'starting') return <SpinnerView color={p.color} label="Starting login…" />

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <p className="font-bold text-white text-lg">Scan with WhatsApp</p>
      <ol className="text-sm text-[#949ba4] space-y-1 w-full list-decimal list-inside">
        <li>Open WhatsApp on your phone</li>
        <li>Tap <strong className="text-white">Settings → Linked Devices</strong></li>
        <li>Tap <strong className="text-white">Link a Device</strong> and scan below</li>
      </ol>
      {qrMxc
        ? <MxcQR mxcUrl={qrMxc} homeserver={homeserver} token={accessToken} />
        : <SpinnerView color={p.color} label="Generating QR code…" />
      }
      <WaitingLabel />
    </div>
  )
}

// ── Telegram ───────────────────────────────────────────────────────────────

function TelegramLogin({ onDone, onError }: { onDone: () => void; onError: (e: string) => void }) {
  const { client } = useStore()
  const p = PLATFORMS.find(pl => pl.id === 'telegram')!
  const [phase, setPhase] = useState<'phone' | 'sending' | 'code' | 'done'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [roomId, setRoomId] = useState('')
  const [codeHint, setCodeHint] = useState('Check your Telegram app for the code')

  useBotMessages(roomId, p.botUserId, useCallback((body) => {
    if (!body) return
    if (isSuccess(body)) { setPhase('done'); setTimeout(onDone, 1500); return }
    if (isError(body)) { onError(body); return }
    const b = body.toLowerCase()
    if (b.includes('code') || b.includes('verification') || b.includes('otp')) {
      setCodeHint(body); setPhase('code')
    }
  }, [onDone, onError]))

  async function submitPhone() {
    if (!phone.trim() || !client) return
    setPhase('sending')
    const rid = await getOrCreateManagementRoom(client, p.botUserId)
    setRoomId(rid)
    await waitForBotJoin(client, rid, p.botUserId)
    await client.sendTextMessage(rid, 'login phone')
    await new Promise(r => setTimeout(r, 1000))
    await client.sendTextMessage(rid, phone.trim())
  }

  async function submitCode() {
    if (!code.trim() || !roomId || !client) return
    await client.sendTextMessage(roomId, code.trim())
    setCode('')
  }

  if (phase === 'done') return <SuccessView name="Telegram" />
  if (phase === 'sending') return <SpinnerView color={PLATFORMS.find(p => p.id === 'telegram')!.color} label="Sending code…" />

  return (
    <div className="flex flex-col gap-5 py-4 w-full">
      {phase === 'phone' && (
        <>
          <div className="text-center">
            <p className="font-bold text-white text-lg mb-1">Your phone number</p>
            <p className="text-sm text-[#949ba4]">We'll send a code via Telegram</p>
          </div>
          <input type="tel" placeholder="+1 234 567 8900" value={phone}
            onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitPhone()}
            autoFocus
            className="w-full bg-[#1e1f22] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#6d6f78] text-center text-lg tracking-widest outline-none focus:border-[#26A5E4]" />
          <button onClick={submitPhone} disabled={!phone.trim()}
            className="w-full bg-[#26A5E4] hover:bg-[#1a94d3] disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors">
            Send Code
          </button>
        </>
      )}
      {phase === 'code' && (
        <>
          <div className="text-center">
            <p className="font-bold text-white text-lg mb-1">Enter verification code</p>
            <p className="text-sm text-[#949ba4]">{codeHint}</p>
          </div>
          <input type="text" placeholder="12345" value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitCode()}
            autoFocus
            className="w-full bg-[#1e1f22] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#6d6f78] text-center text-2xl tracking-[0.5em] outline-none focus:border-[#26A5E4]" />
          <button onClick={submitCode} disabled={!code.trim()}
            className="w-full bg-[#26A5E4] hover:bg-[#1a94d3] disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors">
            Verify
          </button>
          <button onClick={() => setPhase('phone')} className="text-sm text-[#949ba4] hover:text-white transition-colors text-center">
            ← Use different number
          </button>
        </>
      )}
    </div>
  )
}

// ── Signal ─────────────────────────────────────────────────────────────────

function SignalLogin({ onDone, onError }: { onDone: () => void; onError: (e: string) => void }) {
  const { client } = useStore()
  const p = PLATFORMS.find(pl => pl.id === 'signal')!
  const [deepUrl, setDeepUrl] = useState('')
  const [phase, setPhase] = useState<'starting' | 'qr' | 'done'>('starting')
  const [roomId, setRoomId] = useState('')

  useBotMessages(roomId, p.botUserId, useCallback((body) => {
    if (!body) return
    if (isSuccess(body)) { setPhase('done'); setTimeout(onDone, 1500); return }
    if (isError(body)) { onError(body); return }
    const url = extractUrl(body)
    if (url?.startsWith('sgnl://')) { setDeepUrl(url); setPhase('qr') }
  }, [onDone, onError]))

  useEffect(() => {
    if (!client) return
    async function start() {
      const rid = await getOrCreateManagementRoom(client, p.botUserId)
      setRoomId(rid)
      await waitForBotJoin(client, rid, p.botUserId)
      await client.sendTextMessage(rid, 'login')
    }
    start().catch(e => onError(e.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase === 'done') return <SuccessView name="Signal" />
  if (phase === 'starting' && !deepUrl) return <SpinnerView color={p.color} label="Generating link code…" />

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <p className="font-bold text-white text-lg">Link Signal Device</p>
      <ol className="text-sm text-[#949ba4] space-y-1 w-full list-decimal list-inside">
        <li>Open Signal on your phone</li>
        <li>Tap your profile → <strong className="text-white">Linked Devices</strong></li>
        <li>Tap <strong className="text-white">+</strong> and scan below</li>
      </ol>
      {deepUrl ? <UrlQR url={deepUrl} /> : <SpinnerView color={p.color} label="Generating QR…" />}
      {deepUrl && (
        <a href={deepUrl} className="flex items-center gap-2 text-sm text-[#3A76F0] hover:underline">
          Open in Signal app <ExternalLink size={13} />
        </a>
      )}
      <WaitingLabel />
    </div>
  )
}

// ── Discord ────────────────────────────────────────────────────────────────

function DiscordLogin({ onDone, onError }: { onDone: () => void; onError: (e: string) => void }) {
  const { client } = useStore()
  const p = PLATFORMS.find(pl => pl.id === 'discord')!
  const [oauthUrl, setOauthUrl] = useState('')
  const [phase, setPhase] = useState<'starting' | 'oauth' | 'done'>('starting')
  const [roomId, setRoomId] = useState('')

  useBotMessages(roomId, p.botUserId, useCallback((body) => {
    if (!body) return
    if (isSuccess(body)) { setPhase('done'); setTimeout(onDone, 1500); return }
    if (isError(body)) { onError(body); return }
    const url = extractUrl(body)
    if (url?.startsWith('http')) { setOauthUrl(url); setPhase('oauth') }
  }, [onDone, onError]))

  useEffect(() => {
    if (!client) return
    async function start() {
      const rid = await getOrCreateManagementRoom(client, p.botUserId)
      setRoomId(rid)
      await waitForBotJoin(client, rid, p.botUserId)
      await client.sendTextMessage(rid, 'login')
    }
    start().catch(e => onError(e.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase === 'done') return <SuccessView name="Discord" />
  if (phase === 'starting') return <SpinnerView color={p.color} label="Generating login link…" />

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <p className="font-bold text-white text-lg">Authorize Discord</p>
      <p className="text-sm text-[#949ba4]">Click below, log into Discord, then return here.</p>
      <a href={oauthUrl} target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold py-3 rounded-xl transition-colors">
        Open Discord Login <ExternalLink size={16} />
      </a>
      <WaitingLabel />
    </div>
  )
}

// ── Shared UI bits ─────────────────────────────────────────────────────────

function SuccessView({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <CheckCircle2 size={48} className="text-green-400" />
      <p className="font-bold text-white text-lg">{name} Connected!</p>
      <p className="text-sm text-[#949ba4]">Your chats will appear shortly</p>
    </div>
  )
}

function SpinnerView({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <Loader2 size={32} className="animate-spin" style={{ color }} />
      <p className="text-[#949ba4] text-sm">{label}</p>
    </div>
  )
}

function WaitingLabel() {
  return (
    <div className="flex items-center gap-2 text-xs text-[#949ba4]">
      <Loader2 size={12} className="animate-spin" /> Waiting…
    </div>
  )
}

// ── Login wrapper ──────────────────────────────────────────────────────────

const LOGIN_COMPONENTS: Record<PlatformId, React.ComponentType<{ onDone: () => void; onError: (e: string) => void }>> = {
  whatsapp: WhatsAppLogin,
  telegram: TelegramLogin,
  signal:   SignalLogin,
  discord:  DiscordLogin,
}

function LoginWrapper({ platformId, onBack, onDone }: {
  platformId: PlatformId; onBack: () => void; onDone: () => void
}) {
  const p = PLATFORMS.find(pl => pl.id === platformId)!
  const [error, setError] = useState('')
  const Component = LOGIN_COMPONENTS[platformId]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <button onClick={onBack} className="text-[#949ba4] hover:text-white p-1 rounded transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: p.color }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d={p.svgPath} /></svg>
          </div>
          <span className="font-semibold text-white text-sm">Connect {p.name}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5">
        {error ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <AlertCircle size={40} className="text-red-400" />
            <p className="text-sm text-red-400 text-center">{error}</p>
            <button onClick={() => setError('')}
              className="w-full rounded-xl bg-[#5865f2] py-3 text-sm font-bold text-white hover:bg-[#4752c4] transition-colors">
              Try again
            </button>
          </div>
        ) : (
          <Component onDone={onDone} onError={setError} />
        )}
      </div>
    </div>
  )
}

// ── Disconnect ─────────────────────────────────────────────────────────────

function DisconnectScreen({ platformId, onBack, onDone }: {
  platformId: PlatformId; onBack: () => void; onDone: () => void
}) {
  const { client } = useStore()
  const p = PLATFORMS.find(pl => pl.id === platformId)!
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function confirm() {
    if (!client) return
    setBusy(true)
    try {
      const room = findManagementRoom(client, p.botUserId)
      if (room) await client.sendTextMessage(room.roomId, 'logout')
    } catch { /* ignore */ }
    setBusy(false)
    setDone(true)
    setTimeout(onDone, 1000)
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 gap-5 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: p.color }}>
        <svg viewBox="0 0 24 24" width="32" height="32" fill="white"><path d={p.svgPath} /></svg>
      </div>
      {done ? (
        <><CheckCircle2 size={40} className="text-green-400" /><p className="font-bold text-white">Disconnected</p></>
      ) : busy ? (
        <><Loader2 size={32} className="animate-spin text-[#5865f2]" /></>
      ) : (
        <>
          <div>
            <p className="font-bold text-white text-lg mb-1">Disconnect {p.name}?</p>
            <p className="text-sm text-[#949ba4]">Messages will stop syncing. You can reconnect anytime.</p>
          </div>
          <div className="flex flex-col w-full gap-2">
            <button onClick={confirm}
              className="w-full rounded-xl border border-red-800/50 bg-red-900/20 py-3 text-sm font-bold text-red-400 hover:bg-red-900/30 transition-colors">
              Disconnect
            </button>
            <button onClick={onBack}
              className="w-full rounded-xl bg-white/8 py-3 text-sm text-white hover:bg-white/12 transition-colors">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Platform row ───────────────────────────────────────────────────────────

function PlatformRow({ platformId, connected, onConnect, onDisconnect }: {
  platformId: PlatformId; connected: boolean
  onConnect: () => void; onDisconnect: () => void
}) {
  const p = PLATFORMS.find(pl => pl.id === platformId)!
  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: p.color }}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d={p.svgPath} /></svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-white">{p.name}</p>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-[#4f545c]'}`} />
          <p className={`text-xs ${connected ? 'text-green-400' : 'text-[#949ba4]'}`}>
            {connected ? 'Connected' : 'Not connected'}
          </p>
        </div>
      </div>
      {connected ? (
        <button onClick={onDisconnect}
          className="text-xs px-3 py-1.5 rounded-full border border-red-800/50 bg-red-900/20 text-red-400 hover:bg-red-900/40 font-semibold transition-colors">
          Disconnect
        </button>
      ) : (
        <button onClick={onConnect}
          className="text-xs px-3 py-1.5 rounded-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-semibold transition-colors">
          Connect
        </button>
      )}
    </div>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────

type Screen =
  | { name: 'list' }
  | { name: 'login'; platformId: PlatformId }
  | { name: 'disconnect'; platformId: PlatformId }

export default function IntegrationsPanel({ onClose }: { onClose: () => void }) {
  const { client, userId } = useStore()
  const shortId = userId.replace('@', '').split(':')[0]

  // Track connected platforms locally so disconnect updates immediately
  const [connected, setConnected] = useState<Record<PlatformId, boolean>>(() => {
    const init = {} as Record<PlatformId, boolean>
    PLATFORMS.forEach(p => { init[p.id as PlatformId] = false })
    return init
  })
  const [screen, setScreen] = useState<Screen>({ name: 'list' })

  const refreshStatus = useCallback(() => {
    if (!client) return
    const next = {} as Record<PlatformId, boolean>
    PLATFORMS.forEach(p => { next[p.id as PlatformId] = detectConnected(client, p.botUserId, userId) })
    setConnected(next)
  }, [client, userId])

  useEffect(() => {
    refreshStatus()
    const t = setInterval(refreshStatus, 3000)
    return () => clearInterval(t)
  }, [refreshStatus])

  function handleDisconnectDone(platformId: PlatformId) {
    // Immediately mark as disconnected without waiting for polling
    setConnected(prev => ({ ...prev, [platformId]: false }))
    setScreen({ name: 'list' })
  }

  function handleLoginDone(platformId: PlatformId) {
    setConnected(prev => ({ ...prev, [platformId]: true }))
    setScreen({ name: 'list' })
    // Kick off background message sync for this platform
    const { syncPlatformMessages } = useStore.getState()
    syncPlatformMessages(platformId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm bg-[#1e1f22] rounded-2xl border border-white/10 shadow-2xl mx-4 h-[560px] flex flex-col overflow-hidden">

        {screen.name === 'list' && (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-sm font-bold text-white">
                  {shortId.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white leading-tight">{shortId}</p>
                  <p className="text-xs text-[#949ba4] leading-tight">Connected Accounts</p>
                </div>
              </div>
              <button onClick={onClose} className="text-[#949ba4] hover:text-white p-1 rounded transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
              {PLATFORMS.map(p => (
                <PlatformRow
                  key={p.id}
                  platformId={p.id as PlatformId}
                  connected={connected[p.id as PlatformId]}
                  onConnect={() => setScreen({ name: 'login', platformId: p.id as PlatformId })}
                  onDisconnect={() => setScreen({ name: 'disconnect', platformId: p.id as PlatformId })}
                />
              ))}
            </div>
          </>
        )}

        {screen.name === 'login' && (
          <LoginWrapper
            platformId={screen.platformId}
            onBack={() => setScreen({ name: 'list' })}
            onDone={() => handleLoginDone(screen.platformId as PlatformId)}
          />
        )}

        {screen.name === 'disconnect' && (
          <DisconnectScreen
            platformId={screen.platformId as PlatformId}
            onBack={() => setScreen({ name: 'list' })}
            onDone={() => handleDisconnectDone(screen.platformId as PlatformId)}
          />
        )}
      </div>
    </div>
  )
}
