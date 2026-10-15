import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import packageInfo from '../package.json'
import QRCode from 'qrcode'
import { getText, Language } from './i18n'
import {
  CheckCircle2,
  Copy,
  Download,
  DownloadCloud,
  FileUp,
  Fingerprint,
  FolderOpen,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Paperclip,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Unplug,
  UserRoundCheck,
  Users,
  Wifi,
  X,
} from 'lucide-react'

type ChatItem = {
  id: string
  kind: 'chat' | 'file' | 'system'
  side: 'me' | 'peer' | 'system'
  sender: string
  text?: string
  name?: string
  size?: number
  url?: string
  progress?: number
  status?: 'sending' | 'verifying' | 'complete' | 'failed' | 'corrupt'
  hash?: string
  createdAt: number
}

type WirePacket =
  | { kind: 'chat'; id: string; sender: string; text: string; createdAt: number }
  | { kind: 'file-meta'; id: string; sender: string; senderId?: string; name: string; size: number; mime: string; chunks: number; hash?: string; createdAt: number }
  | { kind: 'file-chunk'; id: string; index: number; data: string }
  | { kind: 'file-ack'; id: string; senderId: string; ok: boolean }

type IncomingFile = {
  sender: string
  name: string
  size: number
  mime: string
  chunks: number
  hash?: string
  createdAt: number
  parts: Map<number, Uint8Array>
}

const CHAT_KEY = 'nearchat.lan.messages.v1'
const PROFILE_KEY = 'nearchat.lan.name.v1'
const DEVICE_KEY = 'nearchat.device.id.v1'
const TRUST_KEY = 'nearchat.trusted.devices.v1'

function persistentDeviceId() {
  const stored = localStorage.getItem(DEVICE_KEY)
  if (stored) return stored
  const value = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  localStorage.setItem(DEVICE_KEY, value)
  return value
}

function deviceFingerprint(deviceId: string) {
  return deviceId.match(/.{1,4}/g)?.slice(0, 4).join('-').toUpperCase() || deviceId.toUpperCase()
}

function loadTrustedIds() {
  try { return JSON.parse(localStorage.getItem(TRUST_KEY) || '[]') as string[] } catch { return [] }
}

function id() { return crypto.randomUUID() }

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function deriveRoomKey(roomId: string, code: string) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode(`NearChat:${roomId}`), iterations: 180_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptPacket(key: CryptoKey, packet: WirePacket) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(packet))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain))
  return JSON.stringify({ v: 1, iv: bytesToBase64(iv), data: bytesToBase64(cipher) })
}

async function decryptPacket(key: CryptoKey, envelope: string): Promise<WirePacket> {
  const parsed = JSON.parse(envelope) as { iv: string; data: string }
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(parsed.iv) }, key, base64ToBytes(parsed.data))
  return JSON.parse(new TextDecoder().decode(plain)) as WirePacket
}

async function sha256(buffer: ArrayBuffer) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function formatSize(size = 0) {
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 ** 2).toFixed(1)} MB`
}

function fileStatus(item: ChatItem, language: Language) {
  if (item.status === 'complete') return getText(language, 'verified')
  if (item.status === 'verifying') return getText(language, 'verifying')
  if (item.status === 'failed') return getText(language, 'transferFailed')
  if (item.status === 'corrupt') return getText(language, 'verifyFailed')
  return getText(language, 'percent', { value: item.progress || 0 })
}

function loadMessages(): ChatItem[] {
  try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '[]') as ChatItem[] } catch { return [] }
}

function makeInvite(room: LanRoom) {
  const params = new URLSearchParams({ address: room.address, port: String(room.port), roomId: room.roomId, code: room.code || '', name: room.name })
  return `nearchat://join?${params.toString()}`
}

function makeWebInvite(room: LanRoom) {
  const params = new URLSearchParams({ roomId: room.roomId, code: room.code || '', name: room.name })
  return `http://${room.address}:${room.port}/?${params.toString()}`
}

function parseInvite(value: string): (LanRoom & { code: string }) | null {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'nearchat:' || url.hostname !== 'join') return null
    const address = url.searchParams.get('address') || ''
    const port = Number(url.searchParams.get('port'))
    const roomId = url.searchParams.get('roomId') || ''
    const code = (url.searchParams.get('code') || '').toUpperCase()
    if (!address || !port || !roomId || code.length < 6) return null
    return { address, port, roomId, code, name: url.searchParams.get('name') || 'NearChat Room' }
  } catch { return null }
}

export default function LanApp() {
  const api = window.nearChat!
  const keyRef = useRef<CryptoKey | null>(null)
  const incomingRef = useRef(new Map<string, IncomingFile>())
  const outgoingRef = useRef(new Map<string, File>())
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const addressInputRef = useRef<HTMLInputElement | null>(null)
  const portInputRef = useRef<HTMLInputElement | null>(null)
  const roomIdInputRef = useRef<HTMLInputElement | null>(null)
  const codeInputRef = useRef<HTMLInputElement | null>(null)
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem('nearchat.language') === 'en' || (!localStorage.getItem('nearchat.language') && !navigator.language.toLowerCase().startsWith('zh')) ? 'en' : 'zh')
  const [displayName, setDisplayName] = useState(localStorage.getItem(PROFILE_KEY) || getText(language, 'device', { number: Math.floor(1000 + Math.random() * 9000) }))
  const [deviceId] = useState(persistentDeviceId)
  const [trustedIds, setTrustedIds] = useState<string[]>(loadTrustedIds)
  const [members, setMembers] = useState<LanDevice[]>([])
  const [messages, setMessages] = useState<ChatItem[]>(loadMessages)
  const [draft, setDraft] = useState('')
  const [connected, setConnected] = useState(false)
  const [role, setRole] = useState<'host' | 'guest' | null>(null)
  const [room, setRoom] = useState<LanRoom | null>(null)
  const [peers, setPeers] = useState(1)
  const [modal, setModal] = useState<'closed' | 'menu' | 'created' | 'join'>('closed')
  const [roomName, setRoomName] = useState(getText(language, 'temporaryRoom'))
  const [nearby, setNearby] = useState<LanRoom[]>([])
  const [selectedRoom, setSelectedRoom] = useState<LanRoom | null>(null)
  const [code, setCode] = useState('')
  const [manualAddress, setManualAddress] = useState('')
  const [manualPort, setManualPort] = useState('')
  const [manualRoomId, setManualRoomId] = useState('')
  const [advancedJoin, setAdvancedJoin] = useState(false)
  const [joinAttempted, setJoinAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'error'>('idle')
  const [updateVersion, setUpdateVersion] = useState('')
  const [updatePercent, setUpdatePercent] = useState(0)
  const [qrDataUrl, setQrDataUrl] = useState('')

  const t = (key: Parameters<typeof getText>[1], values?: Record<string, string | number>) => getText(language, key, values)
  const localDevice: LanDevice = { id: deviceId, name: displayName.trim() || t('anonymous'), fingerprint: deviceFingerprint(deviceId) }

  useEffect(() => {
    localStorage.setItem('nearchat.language', language)
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }, [language])

  useEffect(() => {
    const unsubscribe = api.onEvent(async (event) => {
      if (event.channel === 'peer-count' && event.peers) setPeers(event.peers)
      if (event.channel === 'members' && event.members) {
        setMembers(event.members)
        setPeers(event.members.length)
      }
      if (event.channel === 'disconnected') {
        setConnected(false)
        setMembers([])
        setPeers(1)
        setNotice(language === 'en' ? t('disconnected') : event.message || t('disconnected'))
      }
      if (event.channel === 'error') setNotice(language === 'en' ? t('networkError') : event.message || t('networkError'))
      if (event.channel === 'payload' && event.payload && keyRef.current) {
        try {
          const packet = await decryptPacket(keyRef.current, event.payload)
          await receivePacket(packet)
        } catch {
          setNotice(t('decryptError'))
        }
      }
    })
    return unsubscribe
  }, [language])

  useEffect(() => api.onUpdate((event) => {
    setUpdateState(event.state)
    if (event.version) setUpdateVersion(event.version)
    if (typeof event.percent === 'number') setUpdatePercent(event.percent)
    if (event.state === 'error') setNotice(t('updateFailed'))
    if (event.state === 'current') setNotice(t('upToDate'))
  }), [language])

  useEffect(() => {
    localStorage.setItem(CHAT_KEY, JSON.stringify(messages.filter((item) => !item.url).slice(-300)))
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!room?.code) {
      setQrDataUrl('')
      return
    }
    QRCode.toDataURL(makeWebInvite(room), { width: 220, margin: 1, color: { dark: '#07110d', light: '#f5fff9' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [room])

  async function receivePacket(packet: WirePacket) {
    if (packet.kind === 'chat') {
      setMessages((items) => [...items, { ...packet, kind: 'chat', side: 'peer' }])
      return
    }
    if (packet.kind === 'file-ack') {
      setMessages((items) => items.map((item) => item.id === packet.id ? { ...item, status: packet.ok ? 'complete' : 'failed', progress: packet.ok ? 100 : item.progress } : item))
      return
    }
    if (packet.kind === 'file-meta') {
      incomingRef.current.set(packet.id, { ...packet, parts: new Map() })
      setMessages((items) => [...items.filter((item) => item.id !== packet.id), { id: packet.id, kind: 'file', side: 'peer', sender: packet.sender, name: packet.name, size: packet.size, hash: packet.hash, status: 'sending', progress: 0, createdAt: packet.createdAt }])
      return
    }
    const transfer = incomingRef.current.get(packet.id)
    if (!transfer) return
    transfer.parts.set(packet.index, base64ToBytes(packet.data))
    const progress = Math.round((transfer.parts.size / transfer.chunks) * 100)
    setMessages((items) => items.map((item) => item.id === packet.id ? { ...item, progress } : item))
    if (transfer.parts.size === transfer.chunks) {
      const buffers = Array.from({ length: transfer.chunks }, (_, index) => {
        const part = transfer.parts.get(index)!
        return part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer
      })
      const blob = new Blob(buffers, { type: transfer.mime })
      setMessages((items) => items.map((item) => item.id === packet.id ? { ...item, progress: 100, status: 'verifying' } : item))
      const actualHash = await sha256(await blob.arrayBuffer())
      const verified = !transfer.hash || actualHash === transfer.hash
      const url = verified ? URL.createObjectURL(blob) : undefined
      setMessages((items) => items.map((item) => item.id === packet.id ? { ...item, progress: 100, status: verified ? 'complete' : 'corrupt', url } : item))
      await sendWire({ kind: 'file-ack', id: packet.id, senderId: deviceId, ok: verified })
      incomingRef.current.delete(packet.id)
    }
  }

  async function sendWire(packet: WirePacket) {
    if (!keyRef.current) throw new Error(t('keyMissing'))
    await api.send(await encryptPacket(keyRef.current, packet))
  }

  async function createRoom() {
    setBusy(true)
    setNotice('')
    try {
      localStorage.setItem(PROFILE_KEY, displayName.trim() || t('anonymous'))
      const created = await api.startRoom({ name: roomName.trim() || t('hostFallback'), device: localDevice, locale: language })
      keyRef.current = await deriveRoomKey(created.roomId, created.code!)
      setRoom(created)
      setRole('host')
      setPeers(1)
      setMembers([{ ...localDevice, role: 'host' }])
      setConnected(true)
      setModal('created')
    } catch (error) {
      setNotice(language === 'zh' && error instanceof Error ? error.message : t('createFailed'))
    } finally { setBusy(false) }
  }

  async function discover() {
    setBusy(true)
    setNotice(t('scanning'))
    try {
      const rooms = await api.discoverRooms()
      setNearby(rooms)
      setNotice(rooms.length ? t('roomsFound', { count: rooms.length }) : t('noRooms'))
    } finally { setBusy(false) }
  }

  async function joinRoom() {
    const missing: string[] = []
    const roomId = selectedRoom?.roomId || manualRoomId.trim()
    const invalidPort = !Number.isInteger(Number(manualPort)) || Number(manualPort) < 1 || Number(manualPort) > 65535
    if (!selectedRoom && !roomId) missing.push(t('roomId'))
    if (code.trim().length < 6) missing.push(t('roomCode'))
    if (!selectedRoom && advancedJoin && !manualAddress.trim()) missing.push(t('hostAddress'))
    if (!selectedRoom && advancedJoin && invalidPort) missing.push(t('port'))
    if (missing.length) {
      setJoinAttempted(true)
      setNotice(t('missingFields', { fields: missing.join(language === 'zh' ? '、' : ', ') }))
      if (!roomId) roomIdInputRef.current?.focus()
      else if (code.trim().length < 6) codeInputRef.current?.focus()
      else if (advancedJoin && !manualAddress.trim()) addressInputRef.current?.focus()
      else if (advancedJoin && invalidPort) portInputRef.current?.focus()
      return
    }
    setBusy(true)
    setNotice(!selectedRoom && !advancedJoin ? t('autoSearching') : t('connecting'))
    try {
      let target = selectedRoom
      if (!target && advancedJoin) {
        target = { roomId, name: t('roomFallback'), address: manualAddress.trim(), port: Number(manualPort) }
      }
      if (!target) {
        const rooms = await api.discoverRooms()
        target = rooms.find((item) => item.roomId.toLowerCase() === roomId.toLowerCase()) || null
        if (!target) throw new Error(t('autoNotFound'))
      }
      localStorage.setItem(PROFILE_KEY, displayName.trim() || t('anonymous'))
      const joined = await api.joinRoom({ ...target, code: code.trim().toUpperCase(), device: localDevice, locale: language })
      keyRef.current = await deriveRoomKey(joined.roomId, code.trim().toUpperCase())
      setRoom(joined)
      setRole('guest')
      setConnected(true)
      setModal('closed')
      setAdvancedJoin(false)
      setJoinAttempted(false)
      setNotice(t('joined'))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('joinFailed'))
    } finally { setBusy(false) }
  }

  async function disconnect() {
    await api.stop()
    setConnected(false)
    setRole(null)
    setRoom(null)
    setMembers([])
    keyRef.current = null
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || !connected) return
    const packet: WirePacket = { kind: 'chat', id: id(), sender: displayName, text, createdAt: Date.now() }
    try {
      await sendWire(packet)
      setMessages((items) => [...items, { ...packet, side: 'me' }])
      setDraft('')
    } catch (error) { setNotice(error instanceof Error ? error.message : t('sendFailed')) }
  }

  async function sendFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !connected) return
    if (file.size > 50 * 1024 * 1024) {
      setNotice(t('fileTooLarge'))
      return
    }
    const transferId = id()
    outgoingRef.current.set(transferId, file)
    await transmitFile(file, transferId, Date.now())
  }

  async function transmitFile(file: File, transferId: string, createdAt: number) {
    const chunkSize = 48 * 1024
    const total = Math.ceil(file.size / chunkSize)
    setMessages((items) => [...items.filter((item) => item.id !== transferId), { id: transferId, kind: 'file', side: 'me', sender: displayName, name: file.name, size: file.size, status: 'sending', progress: 0, createdAt }])
    try {
      const hash = await sha256(await file.arrayBuffer())
      setMessages((items) => items.map((item) => item.id === transferId ? { ...item, hash } : item))
      await sendWire({ kind: 'file-meta', id: transferId, sender: displayName, senderId: deviceId, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', chunks: total, hash, createdAt })
      for (let index = 0; index < total; index++) {
        const bytes = new Uint8Array(await file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize)).arrayBuffer())
        await sendWire({ kind: 'file-chunk', id: transferId, index, data: bytesToBase64(bytes) })
        const progress = Math.round(((index + 1) / total) * 100)
        setMessages((items) => items.map((item) => item.id === transferId ? { ...item, progress } : item))
      }
      setMessages((items) => items.map((item) => item.id === transferId ? { ...item, status: 'verifying' } : item))
    } catch (error) {
      setMessages((items) => items.map((item) => item.id === transferId ? { ...item, status: 'failed' } : item))
      setNotice(error instanceof Error ? error.message : t('fileSendFailed'))
    }
  }

  async function retryFile(transferId: string) {
    const file = outgoingRef.current.get(transferId)
    const item = messages.find((message) => message.id === transferId)
    if (!file || !item) {
      setNotice(t('originalUnavailable'))
      return
    }
    await transmitFile(file, transferId, item.createdAt)
  }

  function toggleTrust(member: LanDevice) {
    if (member.id === deviceId) return
    setTrustedIds((current) => {
      const next = current.includes(member.id) ? current.filter((value) => value !== member.id) : [...current, member.id]
      localStorage.setItem(TRUST_KEY, JSON.stringify(next))
      return next
    })
  }

  async function pasteInvite() {
    try {
      const invitation = parseInvite(await navigator.clipboard.readText())
      if (!invitation) throw new Error(t('inviteInvalid'))
      setSelectedRoom(invitation)
      setCode(invitation.code)
      setAdvancedJoin(false)
      setJoinAttempted(false)
      setModal('join')
      setNotice(t('inviteReady'))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('inviteReadFailed'))
    }
  }

  function openJoin(roomItem?: LanRoom) {
    setSelectedRoom(roomItem || null)
    setCode('')
    setAdvancedJoin(false)
    setJoinAttempted(false)
    setModal('join')
    setNotice('')
  }

  function changeManualAddress(value: string) {
    const combined = value.trim().match(/^([^\s:]+):(\d{1,5})$/)
    if (combined) {
      setManualAddress(combined[1])
      setManualPort(combined[2])
      return
    }
    setManualAddress(value)
  }

  async function handleUpdate() {
    try {
      if (updateState === 'available') await api.downloadUpdate()
      else if (updateState === 'downloaded') await api.installUpdate()
      else if (!['checking', 'downloading'].includes(updateState)) await api.checkForUpdates()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('updateActionFailed'))
      setUpdateState('error')
    }
  }

  const updateLabel = updateState === 'checking' ? t('checkingUpdate')
    : updateState === 'available' ? t('downloadVersion', { version: updateVersion })
      : updateState === 'downloading' ? t('downloading', { percent: updatePercent })
        : updateState === 'downloaded' ? t('restartInstall')
          : t('checkUpdate')
  const manualPortInvalid = !Number.isInteger(Number(manualPort)) || Number(manualPort) < 1 || Number(manualPort) > 65535

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><MessageCircle size={23} /></div><div><strong>NearChat</strong><span>{t('brandSubtitle')}</span></div></div>
        <button className="new-chat" onClick={() => { setModal('menu'); setNotice('') }}><Plus size={18} /> {t('createOrJoin')}</button>
        <div className="section-label">{t('currentRoom')}</div>
        <button className="conversation active">
          <span className="avatar"><Radio size={19} /></span>
          <span className="conversation-copy"><strong>{room?.name || t('notConnected')}</strong><small>{connected ? `${role === 'host' ? t('host') : t('member')} · ${t('devices', { count: peers })}` : t('waitingRoom')}</small></span>
          <span className={`status-dot ${connected ? 'connected' : 'offline'}`} />
        </button>
        {connected && <>
          <div className="section-label members-label">{t('roomMembers')}</div>
          <div className="members-list">{members.map((member) => {
            const trusted = member.id === deviceId || trustedIds.includes(member.id)
            return <button key={member.id} onClick={() => toggleTrust(member)} title={`${member.fingerprint}${member.id === deviceId ? ` · ${t('currentDevice')}` : trusted ? ` · ${t('cancelTrust')}` : ` · ${t('trustDevice')}`}`}>
              <span className={`member-icon ${trusted ? 'trusted' : ''}`}>{trusted ? <UserRoundCheck size={15} /> : <Fingerprint size={15} />}</span>
              <span><strong>{member.name}</strong><small>{member.id === deviceId ? `${member.role === 'host' ? `${t('host')} · ` : ''}${t('currentDevice')}` : member.role === 'host' ? t('host') : trusted ? t('trustedDevice') : t('newDevice')}</small></span>
            </button>
          })}</div>
        </>}
        <button className={`update-button ${updateState}`} onClick={handleUpdate} disabled={updateState === 'checking' || updateState === 'downloading'}><DownloadCloud size={16} /><span>{updateLabel}</span></button>
        <div className="privacy-card"><ShieldCheck size={20} /><div><strong>{t('encryptedTitle')}</strong><span>{t('encryptedBody')}</span></div></div>
        <div className="identity"><span>v{packageInfo.version}</span><span>{t('myName')} <code>{displayName}</code></span></div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div className="avatar large"><Radio size={21} /></div>
          <div className="header-copy"><strong>{room?.name || t('hostFallback')}</strong><span><Users size={12} /> {connected ? t('onlineDevices', { count: peers, address: `${room?.address}:${room?.port}` }) : t('notConnected')}</span></div>
          <button className="language-switch" title={t('languageTitle')} onClick={() => setLanguage((value) => value === 'zh' ? 'en' : 'zh')}>{t('languageName')}</button>
          {connected && role === 'host' && <button className="icon-button invite-button" title={t('showQr')} onClick={() => setModal('created')}><QrCode size={18} /></button>}
          {connected ? <button className="icon-button danger" title={t('disconnect')} onClick={disconnect}><Unplug size={18} /></button> : <button className="connect-button" onClick={() => setModal('menu')}><Link2 size={17} /> {t('connectDevice')}</button>}
        </header>

        <div className="messages">
          {!connected && messages.length === 0 && (
            <div className="empty-state"><div className="signal-rings"><Wifi size={32} /></div><h1>{t('emptyTitle')}</h1><p>{t('emptyBody')}</p><button onClick={() => setModal('menu')}><Plus size={18} /> {t('startConnect')}</button><div className="feature-row"><span><LockKeyhole size={15} /> AES-256</span><span><FolderOpen size={15} /> {t('directFile')}</span><span><Wifi size={15} /> {t('offlineReady')}</span></div></div>
          )}
          {messages.map((item) => item.kind === 'system' ? null : (
            <div className={`message-row ${item.side}`} key={item.id}>
              <div className={`bubble ${item.kind === 'file' ? 'file-bubble' : ''}`}>
                {item.kind === 'chat' ? <p>{item.text}</p> : <div className={`file-card ${item.status || ''}`}><FileUp size={23} /><div><strong>{item.name}</strong><span>{formatSize(item.size)} · {fileStatus(item, language)}</span><div className="file-progress"><i style={{ width: `${item.progress || 0}%` }} /></div></div>{item.url ? <a href={item.url} download={item.name} title={t('saveFile')}><Download size={18} /></a> : item.side === 'me' && item.status === 'failed' ? <button onClick={() => retryFile(item.id)} title={t('retry')}><RotateCcw size={17} /></button> : null}</div>}
                <time>{item.sender} · {new Date(item.createdAt).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</time>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <input ref={fileInputRef} className="hidden-file" type="file" onChange={sendFile} />
          <button type="button" className="attach-button" disabled={!connected} onClick={() => fileInputRef.current?.click()} title={t('sendFile')}><Paperclip size={19} /></button>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={connected ? t('messagePlaceholder') : t('joinToMessage')} disabled={!connected} />
          <button disabled={!draft.trim() || !connected} aria-label={t('send')}><Send size={19} /></button>
        </form>
      </section>

      {modal !== 'closed' && (
        <div className="modal-backdrop">
          <section className="pair-modal lan-modal">
            <button className="modal-close" onClick={() => setModal('closed')}><X size={19} /></button>
            {modal === 'menu' && <>
              <div className="modal-icon"><Wifi size={24} /></div><h2>{t('lanConnect')}</h2><p className="modal-intro">{t('lanIntro')}</p>
              <label>{t('myName')}</label><input className="modal-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              <label>{t('roomName')}</label><input className="modal-input" value={roomName} onChange={(event) => setRoomName(event.target.value)} />
              <button className="primary wide" disabled={busy} onClick={createRoom}>{busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />} {t('createRoom')}</button>
              <div className="or"><span>{t('orNearby')}</span></div>
              <button className="secondary wide" disabled={busy} onClick={discover}><RefreshCw className={busy ? 'spin' : ''} size={17} /> {t('scanNearby')}</button>
              <div className="nearby-list">{nearby.map((item) => <button key={item.roomId} onClick={() => openJoin(item)}><Radio size={17} /><span><strong>{item.name}</strong><small>{item.address}:{item.port}</small></span><span>{t('join')}</span></button>)}</div>
              <button className="secondary wide" onClick={pasteInvite}><QrCode size={17} /> {t('readInvite')}</button>
              <button className="text-button" onClick={() => openJoin()}>{t('manualHint')}</button>
            </>}
            {modal === 'created' && room && <>
              <div className="modal-icon success"><CheckCircle2 size={24} /></div><h2>{t('roomCreated')}</h2><p className="modal-intro">{t('createdIntro')}</p>
              {qrDataUrl && <div className="invite-qr"><img src={qrDataUrl} alt={t('qrAlt')} /><span>{t('qrCaption')}</span></div>}
              <div className="room-code"><span>{t('roomCode')}</span><strong>{room.code}</strong><button onClick={() => navigator.clipboard.writeText(room.code || '')}><Copy size={16} /></button></div>
              <div className="room-details"><span>{t('address')} <code>{room.address}:{room.port}</code></span><span>{t('roomId')} <code>{room.roomId}</code></span></div>
              <button className="secondary wide" onClick={() => navigator.clipboard.writeText(makeInvite(room))}><Copy size={16} /> {t('copyInvite')}</button>
              <button className="primary wide" onClick={() => setModal('closed')}>{t('enterRoom')}</button>
            </>}
            {modal === 'join' && <>
              <div className="modal-icon"><Link2 size={24} /></div><h2>{t('joinRoom')}</h2><p className="modal-intro">{selectedRoom ? t('selectedIntro', { name: selectedRoom.name }) : t('manualIntro')}</p>
              <label>{t('myName')}</label><input className="modal-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              {!selectedRoom && <><label>{t('roomId')} <em>{t('required')}</em></label><input ref={roomIdInputRef} className={`modal-input mono ${joinAttempted && !manualRoomId.trim() ? 'invalid' : ''}`} aria-invalid={joinAttempted && !manualRoomId.trim()} placeholder={t('roomIdPlaceholder')} value={manualRoomId} onChange={(event) => setManualRoomId(event.target.value.trim())} /></>}
              <label>{t('roomCode')} <em>{t('required')}</em></label><input ref={codeInputRef} className={`modal-input code-input ${joinAttempted && code.trim().length < 6 ? 'invalid' : ''}`} aria-invalid={joinAttempted && code.trim().length < 6} maxLength={8} placeholder={t('codePlaceholder')} value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} />
              {!selectedRoom && <button className="text-button advanced-toggle" onClick={() => { setAdvancedJoin((value) => !value); setJoinAttempted(false); setNotice('') }}>{advancedJoin ? t('collapseAdvanced') : t('showAdvanced')}</button>}
              {!selectedRoom && advancedJoin && <div className="advanced-fields"><div className="input-grid"><div><label>{t('hostAddress')} <em>{t('required')}</em></label><input ref={addressInputRef} className={`modal-input ${joinAttempted && !manualAddress.trim() ? 'invalid' : ''}`} aria-invalid={joinAttempted && !manualAddress.trim()} placeholder={t('addressExample')} value={manualAddress} onChange={(event) => changeManualAddress(event.target.value)} /></div><div><label>{t('port')} <em>{t('required')}</em></label><input ref={portInputRef} className={`modal-input ${joinAttempted && manualPortInvalid ? 'invalid' : ''}`} aria-invalid={joinAttempted && manualPortInvalid} inputMode="numeric" placeholder={t('portExample')} value={manualPort} onChange={(event) => setManualPort(event.target.value.replace(/\D/g, '').slice(0, 5))} /></div></div><p className="field-help">{t('advancedHelp')}</p></div>}
              <button className="primary wide" disabled={busy} onClick={joinRoom}>{busy ? <LoaderCircle className="spin" size={17} /> : <Link2 size={17} />} {!selectedRoom && !advancedJoin ? t('autoFindJoin') : t('joinRoom')}</button>
            </>}
            {notice && <div className="notice">{notice}</div>}
          </section>
        </div>
      )}
      {notice && modal === 'closed' && <button className="toast" onClick={() => setNotice('')}>{notice}<X size={15} /></button>}
    </main>
  )
}
