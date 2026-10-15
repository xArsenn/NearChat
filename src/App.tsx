import { FormEvent, useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  CircleDot,
  Copy,
  Link2,
  LockKeyhole,
  MessageCircle,
  Plus,
  Radio,
  Send,
  ShieldCheck,
  Unplug,
  UserRoundPlus,
  Wifi,
  X,
} from 'lucide-react'

type Message = {
  id: string
  text: string
  side: 'me' | 'peer'
  createdAt: number
}

type PairingPayload = {
  type: 'offer' | 'answer'
  sdp: string
}

type PairMode = 'home' | 'invite' | 'accept' | 'finish'
type ConnectionState = 'offline' | 'connecting' | 'connected' | 'failed'

const MESSAGE_KEY = 'nearchat.messages.v1'
const PROFILE_KEY = 'nearchat.profile.v1'

function makeId() {
  return crypto.randomUUID()
}

function encodePayload(payload: PairingPayload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let binary = ''
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)))
  return btoa(binary)
}

function decodePayload(code: string): PairingPayload {
  const binary = atob(code.trim())
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const value = JSON.parse(new TextDecoder().decode(bytes)) as PairingPayload
  if (!value.sdp || !['offer', 'answer'].includes(value.type)) throw new Error('配对码无效')
  return value
}

function waitForIceGathering(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise<void>((resolve) => {
    const done = () => {
      if (peer.iceGatheringState === 'complete') {
        peer.removeEventListener('icegatheringstatechange', done)
        resolve()
      }
    }
    peer.addEventListener('icegatheringstatechange', done)
    window.setTimeout(() => {
      peer.removeEventListener('icegatheringstatechange', done)
      resolve()
    }, 5000)
  })
}

function loadMessages(): Message[] {
  try {
    return JSON.parse(localStorage.getItem(MESSAGE_KEY) || '[]') as Message[]
  } catch {
    return []
  }
}

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || '') as { name: string; id: string }
  } catch {
    const profile = { name: '我', id: makeId().slice(0, 8) }
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    return profile
  }
}

export default function App() {
  const profile = useRef(loadProfile())
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const [messages, setMessages] = useState<Message[]>(loadMessages)
  const [draft, setDraft] = useState('')
  const [pairMode, setPairMode] = useState<PairMode>('home')
  const [connection, setConnection] = useState<ConnectionState>('offline')
  const [generatedCode, setGeneratedCode] = useState('')
  const [inputCode, setInputCode] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    localStorage.setItem(MESSAGE_KEY, JSON.stringify(messages))
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => () => peerRef.current?.close(), [])

  function configurePeer(peer: RTCPeerConnection) {
    peerRef.current?.close()
    peerRef.current = peer
    setConnection('connecting')
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState
      if (state === 'connected') {
        setConnection('connected')
        setNotice('点对点连接已建立')
      } else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        setConnection(state === 'failed' ? 'failed' : 'offline')
      }
    }
    peer.ondatachannel = (event) => configureChannel(event.channel)
  }

  function configureChannel(channel: RTCDataChannel) {
    channelRef.current = channel
    channel.onopen = () => {
      setConnection('connected')
      setNotice('点对点连接已建立')
    }
    channel.onclose = () => setConnection('offline')
    channel.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type: string; text?: string; id?: string; createdAt?: number }
        if (payload.type === 'message' && payload.text) {
          setMessages((current) => [
            ...current,
            {
              id: payload.id || makeId(),
              text: payload.text!,
              side: 'peer',
              createdAt: payload.createdAt || Date.now(),
            },
          ])
        }
      } catch {
        setNotice('收到了一条无法识别的消息')
      }
    }
  }

  async function createInvite() {
    try {
      setNotice('')
      setGeneratedCode('')
      setPairMode('invite')
      const peer = new RTCPeerConnection({ iceServers: [] })
      configurePeer(peer)
      const channel = peer.createDataChannel('nearchat', { ordered: true })
      configureChannel(channel)
      await peer.setLocalDescription(await peer.createOffer())
      await waitForIceGathering(peer)
      if (!peer.localDescription?.sdp) throw new Error('无法创建邀请')
      setGeneratedCode(encodePayload({ type: 'offer', sdp: peer.localDescription.sdp }))
    } catch (error) {
      setConnection('failed')
      setNotice(error instanceof Error ? error.message : '创建邀请失败')
    }
  }

  async function acceptInvite() {
    try {
      const payload = decodePayload(inputCode)
      if (payload.type !== 'offer') throw new Error('这不是邀请配对码')
      setNotice('')
      setGeneratedCode('')
      const peer = new RTCPeerConnection({ iceServers: [] })
      configurePeer(peer)
      await peer.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
      await peer.setLocalDescription(await peer.createAnswer())
      await waitForIceGathering(peer)
      if (!peer.localDescription?.sdp) throw new Error('无法创建回应')
      setGeneratedCode(encodePayload({ type: 'answer', sdp: peer.localDescription.sdp }))
      setPairMode('accept')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '接受邀请失败')
    }
  }

  async function finishPairing() {
    try {
      const payload = decodePayload(inputCode)
      if (payload.type !== 'answer') throw new Error('这不是回应配对码')
      if (!peerRef.current) throw new Error('原始邀请已经失效，请重新发起')
      await peerRef.current.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
      setPairMode('home')
      setNotice('正在建立点对点连接…')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '完成配对失败')
    }
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || connection !== 'connected' || channelRef.current?.readyState !== 'open') return
    const message: Message = { id: makeId(), text, side: 'me', createdAt: Date.now() }
    channelRef.current.send(JSON.stringify({ type: 'message', ...message }))
    setMessages((current) => [...current, message])
    setDraft('')
  }

  function disconnect() {
    channelRef.current?.close()
    peerRef.current?.close()
    channelRef.current = null
    peerRef.current = null
    setConnection('offline')
    setNotice('连接已断开')
  }

  async function copyCode() {
    await navigator.clipboard.writeText(generatedCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const statusLabel = {
    offline: '等待连接',
    connecting: '正在连接',
    connected: '点对点在线',
    failed: '连接失败',
  }[connection]

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><MessageCircle size={23} strokeWidth={2.4} /></div>
          <div><strong>NearChat</strong><span>没有服务器的聊天</span></div>
        </div>

        <button className="new-chat" onClick={() => { setPairMode('finish'); setInputCode(''); setNotice('') }}>
          <Plus size={18} /> 建立新连接
        </button>

        <div className="section-label">会话</div>
        <button className="conversation active">
          <span className="avatar"><Radio size={19} /></span>
          <span className="conversation-copy"><strong>临时点对点会话</strong><small>{statusLabel}</small></span>
          <span className={`status-dot ${connection}`} />
        </button>

        <div className="privacy-card">
          <ShieldCheck size={20} />
          <div><strong>数据留在设备上</strong><span>消息通过加密通道直达对方，不经过 NearChat 后台。</span></div>
        </div>

        <div className="identity">本机身份 <code>{profile.current.id}</code></div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div className="mobile-back"><ChevronLeft size={22} /></div>
          <div className="avatar large"><Radio size={21} /></div>
          <div className="header-copy"><strong>临时点对点会话</strong><span><CircleDot size={12} /> {statusLabel}</span></div>
          {connection === 'connected' ? (
            <button className="icon-button danger" title="断开连接" onClick={disconnect}><Unplug size={18} /></button>
          ) : (
            <button className="connect-button" onClick={() => { setPairMode('finish'); setInputCode(''); setNotice('') }}><Link2 size={17} /> 连接设备</button>
          )}
        </header>

        <div className="messages">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="signal-rings"><Wifi size={32} /></div>
              <h1>从附近开始</h1>
              <p>无需注册账号。让两台设备连接到同一网络，交换一次配对码，就可以直接聊天。</p>
              <button onClick={createInvite}><UserRoundPlus size={18} /> 发起连接</button>
              <div className="feature-row"><span><LockKeyhole size={15} /> 传输加密</span><span><Radio size={15} /> 设备直连</span><span><ShieldCheck size={15} /> 本地保存</span></div>
            </div>
          )}

          {messages.map((message) => (
            <div className={`message-row ${message.side}`} key={message.id}>
              <div className="bubble">
                <p>{message.text}</p>
                <time>{new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={connection === 'connected' ? '输入消息…' : '连接另一台设备后即可发送消息'}
            disabled={connection !== 'connected'}
          />
          <button disabled={!draft.trim() || connection !== 'connected'} aria-label="发送"><Send size={19} /></button>
        </form>
      </section>

      {pairMode !== 'home' && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPairMode('home')}>
          <section className="pair-modal">
            <button className="modal-close" onClick={() => setPairMode('home')}><X size={19} /></button>

            {pairMode === 'finish' && (
              <>
                <div className="modal-icon"><Link2 size={24} /></div>
                <h2>连接另一台设备</h2>
                <p className="modal-intro">双方最好连接同一个 Wi‑Fi。整个配对过程不需要账号或中心服务器。</p>
                <button className="primary wide" onClick={createInvite}>我是发起方</button>
                <div className="or"><span>或者</span></div>
                <label>粘贴对方发来的邀请配对码</label>
                <textarea value={inputCode} onChange={(event) => setInputCode(event.target.value)} placeholder="在这里粘贴邀请配对码" />
                <button className="secondary wide" disabled={!inputCode.trim()} onClick={acceptInvite}>接受邀请</button>
              </>
            )}

            {pairMode === 'invite' && (
              <>
                <div className="step">步骤 1 / 2</div>
                <h2>把邀请配对码发给对方</h2>
                <p className="modal-intro">对方打开 NearChat，选择“接受邀请”，粘贴这段配对码。</p>
                <textarea className="code" readOnly value={generatedCode || '正在生成安全配对码…'} />
                <button className="primary wide" disabled={!generatedCode} onClick={copyCode}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? '已复制' : '复制邀请配对码'}</button>
                <label>然后粘贴对方返回的回应配对码</label>
                <textarea value={inputCode} onChange={(event) => setInputCode(event.target.value)} placeholder="回应配对码" />
                <button className="secondary wide" disabled={!inputCode.trim()} onClick={finishPairing}>完成连接</button>
              </>
            )}

            {pairMode === 'accept' && (
              <>
                <div className="step">步骤 2 / 2</div>
                <h2>把回应配对码发回去</h2>
                <p className="modal-intro">发起方粘贴后，设备会直接建立连接。这个窗口随后会自动关闭。</p>
                <textarea className="code" readOnly value={generatedCode} />
                <button className="primary wide" onClick={copyCode}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? '已复制' : '复制回应配对码'}</button>
                <button className="secondary wide" onClick={() => setPairMode('home')}>我已发回，返回聊天</button>
              </>
            )}

            {notice && <div className="notice">{notice}</div>}
          </section>
        </div>
      )}

      {notice && pairMode === 'home' && <button className="toast" onClick={() => setNotice('')}>{notice}<X size={15} /></button>}
    </main>
  )
}
