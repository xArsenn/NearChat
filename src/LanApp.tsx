import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  Copy,
  Download,
  DownloadCloud,
  FileUp,
  FolderOpen,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Paperclip,
  Plus,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Unplug,
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
  createdAt: number
}

type WirePacket =
  | { kind: 'chat'; id: string; sender: string; text: string; createdAt: number }
  | { kind: 'file-meta'; id: string; sender: string; name: string; size: number; mime: string; chunks: number; createdAt: number }
  | { kind: 'file-chunk'; id: string; index: number; data: string }

type IncomingFile = {
  sender: string
  name: string
  size: number
  mime: string
  chunks: number
  createdAt: number
  parts: Map<number, Uint8Array>
}

const CHAT_KEY = 'nearchat.lan.messages.v1'
const PROFILE_KEY = 'nearchat.lan.name.v1'

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

function formatSize(size = 0) {
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 ** 2).toFixed(1)} MB`
}

function loadMessages(): ChatItem[] {
  try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '[]') as ChatItem[] } catch { return [] }
}

export default function LanApp() {
  const api = window.nearChat!
  const keyRef = useRef<CryptoKey | null>(null)
  const incomingRef = useRef(new Map<string, IncomingFile>())
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [displayName, setDisplayName] = useState(localStorage.getItem(PROFILE_KEY) || `设备-${Math.floor(1000 + Math.random() * 9000)}`)
  const [messages, setMessages] = useState<ChatItem[]>(loadMessages)
  const [draft, setDraft] = useState('')
  const [connected, setConnected] = useState(false)
  const [role, setRole] = useState<'host' | 'guest' | null>(null)
  const [room, setRoom] = useState<LanRoom | null>(null)
  const [peers, setPeers] = useState(1)
  const [modal, setModal] = useState<'closed' | 'menu' | 'created' | 'join'>('closed')
  const [roomName, setRoomName] = useState('临时协作房间')
  const [nearby, setNearby] = useState<LanRoom[]>([])
  const [selectedRoom, setSelectedRoom] = useState<LanRoom | null>(null)
  const [code, setCode] = useState('')
  const [manualAddress, setManualAddress] = useState('')
  const [manualPort, setManualPort] = useState('')
  const [manualRoomId, setManualRoomId] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'error'>('idle')
  const [updateVersion, setUpdateVersion] = useState('')
  const [updatePercent, setUpdatePercent] = useState(0)

  useEffect(() => {
    const unsubscribe = api.onEvent(async (event) => {
      if (event.channel === 'peer-count' && event.peers) setPeers(event.peers)
      if (event.channel === 'disconnected') {
        setConnected(false)
        setNotice(event.message || '连接已断开')
      }
      if (event.channel === 'error') setNotice(event.message || '网络发生错误')
      if (event.channel === 'payload' && event.payload && keyRef.current) {
        try {
          const packet = await decryptPacket(keyRef.current, event.payload)
          await receivePacket(packet)
        } catch {
          setNotice('收到无法解密的数据，可能使用了错误的房间口令')
        }
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => api.onUpdate((event) => {
    setUpdateState(event.state)
    if (event.version) setUpdateVersion(event.version)
    if (typeof event.percent === 'number') setUpdatePercent(event.percent)
    if (event.state === 'error') setNotice(event.message || '检查更新失败')
    if (event.state === 'current') setNotice('当前已经是最新版本')
  }), [])

  useEffect(() => {
    localStorage.setItem(CHAT_KEY, JSON.stringify(messages.filter((item) => !item.url).slice(-300)))
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function receivePacket(packet: WirePacket) {
    if (packet.kind === 'chat') {
      setMessages((items) => [...items, { ...packet, kind: 'chat', side: 'peer' }])
      return
    }
    if (packet.kind === 'file-meta') {
      incomingRef.current.set(packet.id, { ...packet, parts: new Map() })
      setMessages((items) => [...items, { id: packet.id, kind: 'file', side: 'peer', sender: packet.sender, name: packet.name, size: packet.size, progress: 0, createdAt: packet.createdAt }])
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
      const url = URL.createObjectURL(blob)
      setMessages((items) => items.map((item) => item.id === packet.id ? { ...item, progress: 100, url } : item))
      incomingRef.current.delete(packet.id)
    }
  }

  async function sendWire(packet: WirePacket) {
    if (!keyRef.current) throw new Error('房间密钥尚未建立')
    await api.send(await encryptPacket(keyRef.current, packet))
  }

  async function createRoom() {
    setBusy(true)
    setNotice('')
    try {
      localStorage.setItem(PROFILE_KEY, displayName.trim() || '匿名设备')
      const created = await api.startRoom({ name: roomName.trim() || 'NearChat 房间' })
      keyRef.current = await deriveRoomKey(created.roomId, created.code!)
      setRoom(created)
      setRole('host')
      setPeers(1)
      setConnected(true)
      setModal('created')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '创建房间失败')
    } finally { setBusy(false) }
  }

  async function discover() {
    setBusy(true)
    setNotice('正在扫描局域网…')
    try {
      const rooms = await api.discoverRooms()
      setNearby(rooms)
      setNotice(rooms.length ? `发现 ${rooms.length} 个房间` : '没有发现房间，可使用手动地址加入')
    } finally { setBusy(false) }
  }

  async function joinRoom() {
    const target = selectedRoom || {
      roomId: manualRoomId.trim(),
      name: '局域网房间',
      address: manualAddress.trim(),
      port: Number(manualPort),
    }
    if (!target.roomId || !target.address || !target.port || code.trim().length < 6) {
      setNotice('请填写房间地址、端口、房间 ID 和口令')
      return
    }
    setBusy(true)
    setNotice('正在连接房间…')
    try {
      localStorage.setItem(PROFILE_KEY, displayName.trim() || '匿名设备')
      const joined = await api.joinRoom({ ...target, code: code.trim().toUpperCase() })
      keyRef.current = await deriveRoomKey(joined.roomId, code.trim().toUpperCase())
      setRoom(joined)
      setRole('guest')
      setConnected(true)
      setPeers(2)
      setModal('closed')
      setNotice('已加入局域网房间')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '加入房间失败')
    } finally { setBusy(false) }
  }

  async function disconnect() {
    await api.stop()
    setConnected(false)
    setRole(null)
    setRoom(null)
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
    } catch (error) { setNotice(error instanceof Error ? error.message : '发送失败') }
  }

  async function sendFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !connected) return
    if (file.size > 50 * 1024 * 1024) {
      setNotice('当前版本单个文件上限为 50 MB')
      return
    }
    const transferId = id()
    const chunkSize = 48 * 1024
    const total = Math.ceil(file.size / chunkSize)
    const createdAt = Date.now()
    setMessages((items) => [...items, { id: transferId, kind: 'file', side: 'me', sender: displayName, name: file.name, size: file.size, progress: 0, createdAt }])
    try {
      await sendWire({ kind: 'file-meta', id: transferId, sender: displayName, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', chunks: total, createdAt })
      for (let index = 0; index < total; index++) {
        const bytes = new Uint8Array(await file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize)).arrayBuffer())
        await sendWire({ kind: 'file-chunk', id: transferId, index, data: bytesToBase64(bytes) })
        const progress = Math.round(((index + 1) / total) * 100)
        setMessages((items) => items.map((item) => item.id === transferId ? { ...item, progress } : item))
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : '文件发送失败') }
  }

  function openJoin(roomItem?: LanRoom) {
    setSelectedRoom(roomItem || null)
    setCode('')
    setModal('join')
    setNotice('')
  }

  async function handleUpdate() {
    try {
      if (updateState === 'available') await api.downloadUpdate()
      else if (updateState === 'downloaded') await api.installUpdate()
      else if (!['checking', 'downloading'].includes(updateState)) await api.checkForUpdates()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '更新操作失败')
      setUpdateState('error')
    }
  }

  const updateLabel = updateState === 'checking' ? '正在检查更新…'
    : updateState === 'available' ? `下载 v${updateVersion}`
      : updateState === 'downloading' ? `正在下载 ${updatePercent}%`
        : updateState === 'downloaded' ? '重启并安装更新'
          : '检查软件更新'

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><MessageCircle size={23} /></div><div><strong>NearChat</strong><span>离线局域网协作</span></div></div>
        <button className="new-chat" onClick={() => { setModal('menu'); setNotice('') }}><Plus size={18} /> 创建或加入房间</button>
        <div className="section-label">当前房间</div>
        <button className="conversation active">
          <span className="avatar"><Radio size={19} /></span>
          <span className="conversation-copy"><strong>{room?.name || '尚未连接'}</strong><small>{connected ? `${role === 'host' ? '房主' : '成员'} · ${peers} 台设备` : '等待加入局域网房间'}</small></span>
          <span className={`status-dot ${connected ? 'connected' : 'offline'}`} />
        </button>
        <button className={`update-button ${updateState}`} onClick={handleUpdate} disabled={updateState === 'checking' || updateState === 'downloading'}><DownloadCloud size={16} /><span>{updateLabel}</span></button>
        <div className="privacy-card"><ShieldCheck size={20} /><div><strong>消息与文件已加密</strong><span>内容使用房间口令派生的 AES-256 密钥加密，只在局域网设备间传输。</span></div></div>
        <div className="identity">我的名称 <code>{displayName}</code></div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div className="avatar large"><Radio size={21} /></div>
          <div className="header-copy"><strong>{room?.name || 'NearChat 局域网'}</strong><span><Users size={12} /> {connected ? `${peers} 台设备在线 · ${room?.address}:${room?.port}` : '未连接'}</span></div>
          {connected ? <button className="icon-button danger" title="断开连接" onClick={disconnect}><Unplug size={18} /></button> : <button className="connect-button" onClick={() => setModal('menu')}><Link2 size={17} /> 连接设备</button>}
        </header>

        <div className="messages">
          {!connected && messages.length === 0 && (
            <div className="empty-state"><div className="signal-rings"><Wifi size={32} /></div><h1>离线也能连接</h1><p>创建一个局域网房间，或扫描同一 Wi‑Fi 下的附近房间。无需账号，也不需要云服务器。</p><button onClick={() => setModal('menu')}><Plus size={18} /> 开始连接</button><div className="feature-row"><span><LockKeyhole size={15} /> AES-256</span><span><FolderOpen size={15} /> 文件直传</span><span><Wifi size={15} /> 断网可用</span></div></div>
          )}
          {messages.map((item) => item.kind === 'system' ? null : (
            <div className={`message-row ${item.side}`} key={item.id}>
              <div className={`bubble ${item.kind === 'file' ? 'file-bubble' : ''}`}>
                {item.kind === 'chat' ? <p>{item.text}</p> : <div className="file-card"><FileUp size={23} /><div><strong>{item.name}</strong><span>{formatSize(item.size)} · {item.progress === 100 ? '传输完成' : `${item.progress || 0}%`}</span><div className="file-progress"><i style={{ width: `${item.progress || 0}%` }} /></div></div>{item.url && <a href={item.url} download={item.name} title="保存文件"><Download size={18} /></a>}</div>}
                <time>{item.sender} · {new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <input ref={fileInputRef} className="hidden-file" type="file" onChange={sendFile} />
          <button type="button" className="attach-button" disabled={!connected} onClick={() => fileInputRef.current?.click()} title="发送文件"><Paperclip size={19} /></button>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={connected ? '输入消息…' : '加入房间后即可发送消息'} disabled={!connected} />
          <button disabled={!draft.trim() || !connected} aria-label="发送"><Send size={19} /></button>
        </form>
      </section>

      {modal !== 'closed' && (
        <div className="modal-backdrop">
          <section className="pair-modal lan-modal">
            <button className="modal-close" onClick={() => setModal('closed')}><X size={19} /></button>
            {modal === 'menu' && <>
              <div className="modal-icon"><Wifi size={24} /></div><h2>局域网连接</h2><p className="modal-intro">一台电脑创建房间，其他设备通过附近发现或地址加入。</p>
              <label>我的名称</label><input className="modal-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              <label>房间名称</label><input className="modal-input" value={roomName} onChange={(event) => setRoomName(event.target.value)} />
              <button className="primary wide" disabled={busy} onClick={createRoom}>{busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />} 创建房间</button>
              <div className="or"><span>或者加入附近房间</span></div>
              <button className="secondary wide" disabled={busy} onClick={discover}><RefreshCw className={busy ? 'spin' : ''} size={17} /> 扫描附近房间</button>
              <div className="nearby-list">{nearby.map((item) => <button key={item.roomId} onClick={() => openJoin(item)}><Radio size={17} /><span><strong>{item.name}</strong><small>{item.address}:{item.port}</small></span><span>加入</span></button>)}</div>
              <button className="text-button" onClick={() => openJoin()}>使用地址手动加入</button>
            </>}
            {modal === 'created' && room && <>
              <div className="modal-icon success"><CheckCircle2 size={24} /></div><h2>房间已经创建</h2><p className="modal-intro">让另一台电脑扫描附近房间，然后输入下面的房间口令。</p>
              <div className="room-code"><span>房间口令</span><strong>{room.code}</strong><button onClick={() => navigator.clipboard.writeText(room.code || '')}><Copy size={16} /></button></div>
              <div className="room-details"><span>地址 <code>{room.address}:{room.port}</code></span><span>房间 ID <code>{room.roomId}</code></span></div>
              <button className="primary wide" onClick={() => setModal('closed')}>进入房间</button>
            </>}
            {modal === 'join' && <>
              <div className="modal-icon"><Link2 size={24} /></div><h2>加入房间</h2><p className="modal-intro">{selectedRoom ? `正在加入“${selectedRoom.name}”` : '填写创建者界面上显示的连接信息。'}</p>
              <label>我的名称</label><input className="modal-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              {!selectedRoom && <div className="input-grid"><div><label>主机地址</label><input className="modal-input" placeholder="192.168.1.20" value={manualAddress} onChange={(event) => setManualAddress(event.target.value)} /></div><div><label>端口</label><input className="modal-input" placeholder="45678" value={manualPort} onChange={(event) => setManualPort(event.target.value)} /></div></div>}
              {!selectedRoom && <><label>房间 ID</label><input className="modal-input mono" value={manualRoomId} onChange={(event) => setManualRoomId(event.target.value)} /></>}
              <label>房间口令</label><input className="modal-input code-input" maxLength={8} placeholder="8 位口令" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
              <button className="primary wide" disabled={busy} onClick={joinRoom}>{busy ? <LoaderCircle className="spin" size={17} /> : <Link2 size={17} />} 加入房间</button>
            </>}
            {notice && <div className="notice">{notice}</div>}
          </section>
        </div>
      )}
      {notice && modal === 'closed' && <button className="toast" onClick={() => setNotice('')}>{notice}<X size={15} /></button>}
    </main>
  )
}
