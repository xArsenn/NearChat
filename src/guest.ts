import { gcm } from '@noble/ciphers/aes.js'
import { randomBytes } from '@noble/ciphers/utils.js'
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

type Locale = 'zh' | 'en'
type Packet = { kind: string; id: string; sender?: string; senderId?: string; text?: string; name?: string; size?: number; mime?: string; chunks?: number; hash?: string; createdAt?: number; index?: number; data?: string; ok?: boolean }
type Incoming = Packet & { parts: Map<number, Uint8Array>; state: HTMLElement; card: HTMLElement }

const params = new URLSearchParams(location.search)
const config = { roomId: params.get('roomId') || '', code: (params.get('code') || '').toUpperCase(), roomName: params.get('name') || 'NearChat Room' }
const words = {
  zh: { connecting: '等待加入', connected: '已安全连接', disconnected: '连接已断开', title: '手机免安装加入', intro: '消息和文件只在当前局域网内加密传输，不会上传到 NearChat 云端。', name: '你的名称', nameValue: '手机访客', join: '加入房间', joining: '正在连接…', invalid: '邀请无效，请让房主重新生成二维码。', failed: '连接失败，请确认手机与电脑连接同一个 Wi-Fi。', placeholder: '输入消息…', send: '发送', tooLarge: '单个文件不能超过 50 MB', verify: '正在接收', ready: '点击下载', corrupt: '文件校验失败' },
  en: { connecting: 'Ready to join', connected: 'Securely connected', disconnected: 'Disconnected', title: 'Join without installing', intro: 'Messages and files are encrypted and stay on this local network. Nothing is uploaded to NearChat.', name: 'Your name', nameValue: 'Mobile guest', join: 'Join room', joining: 'Connecting…', invalid: 'This invite is invalid. Ask the host to create a new QR code.', failed: 'Could not connect. Make sure the phone and computer use the same Wi-Fi.', placeholder: 'Type a message…', send: 'Send', tooLarge: 'Files must be 50 MB or smaller', verify: 'Receiving', ready: 'Download', corrupt: 'File verification failed' },
}

let locale: Locale = localStorage.getItem('nearchat.web.locale') === 'en' || (!localStorage.getItem('nearchat.web.locale') && !navigator.language.toLowerCase().startsWith('zh')) ? 'en' : 'zh'
let socket: WebSocket | null = null
let key: Uint8Array | null = null
let connected = false
let guestName = ''
const incoming = new Map<string, Incoming>()
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const text = () => words[locale]

function renderLanguage() {
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  $('lang').textContent = locale === 'zh' ? 'EN' : '中文'
  $('roomName').textContent = config.roomName
  $('connection').textContent = connected ? text().connected : text().connecting
  $('welcomeTitle') && ($('welcomeTitle').textContent = text().title)
  $('welcomeText') && ($('welcomeText').textContent = text().intro)
  $('nameLabel') && ($('nameLabel').textContent = text().name)
  const name = document.getElementById('name') as HTMLInputElement | null
  if (name && !name.value) name.value = text().nameValue
  $('join') && ($('join').textContent = text().join)
  const draft = document.getElementById('draft') as HTMLInputElement
  draft.placeholder = text().placeholder
  $('send').title = text().send
  document.title = `${config.roomName} · NearChat`
}

$('lang').onclick = () => {
  locale = locale === 'zh' ? 'en' : 'zh'
  localStorage.setItem('nearchat.web.locale', locale)
  renderLanguage()
}

function bytesToBase64(bytes: Uint8Array) {
  let value = ''
  for (let index = 0; index < bytes.length; index += 32768) value += String.fromCharCode(...bytes.subarray(index, index + 32768))
  return btoa(value)
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

async function deriveKey() {
  return pbkdf2Async(sha256, encoder.encode(config.code), encoder.encode(`NearChat:${config.roomId}`), { c: 180_000, dkLen: 32, asyncTick: 10 })
}

async function encrypt(packet: Packet) {
  if (!key) throw new Error('Missing room key')
  const iv = randomBytes(12)
  const cipher = gcm(key, iv).encrypt(encoder.encode(JSON.stringify(packet)))
  return JSON.stringify({ v: 1, iv: bytesToBase64(iv), data: bytesToBase64(cipher) })
}

async function decrypt(value: string): Promise<Packet> {
  if (!key) throw new Error('Missing room key')
  const parsed = JSON.parse(value) as { iv: string; data: string }
  return JSON.parse(decoder.decode(gcm(key, base64ToBytes(parsed.iv)).decrypt(base64ToBytes(parsed.data)))) as Packet
}

function digest(buffer: ArrayBuffer) {
  return bytesToHex(sha256(new Uint8Array(buffer)))
}

function addMessage(packet: Packet, mine = false) {
  const row = document.createElement('div')
  row.className = `row ${mine ? 'me' : 'peer'}`
  const bubble = document.createElement('div')
  bubble.className = 'bubble'
  const body = document.createElement('p')
  body.textContent = packet.text || ''
  const meta = document.createElement('small')
  meta.textContent = `${packet.sender || ''} · ${new Date(packet.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  bubble.append(body, meta)
  row.append(bubble)
  $('messages').append(row)
  row.scrollIntoView({ behavior: 'smooth' })
}

function addFile(packet: Packet) {
  const row = document.createElement('div')
  row.className = 'row peer'
  const bubble = document.createElement('div')
  bubble.className = 'bubble'
  const card = document.createElement('div')
  card.className = 'file'
  const icon = document.createElement('span')
  icon.textContent = '↓'
  const info = document.createElement('div')
  const name = document.createElement('strong')
  name.textContent = packet.name || text().ready
  const state = document.createElement('em')
  state.textContent = `${text().verify} 0%`
  info.append(name, state)
  card.append(icon, info)
  bubble.append(card)
  row.append(bubble)
  $('messages').append(row)
  row.scrollIntoView({ behavior: 'smooth' })
  return { state, card }
}

async function receive(packet: Packet) {
  if (packet.kind === 'chat') {
    addMessage(packet)
    return
  }
  if (packet.kind === 'file-meta') {
    const elements = addFile(packet)
    incoming.set(packet.id, { ...packet, parts: new Map(), ...elements })
    return
  }
  if (packet.kind !== 'file-chunk' || typeof packet.index !== 'number' || !packet.data) return
  const transfer = incoming.get(packet.id)
  if (!transfer) return
  transfer.parts.set(packet.index, base64ToBytes(packet.data))
  transfer.state.textContent = `${text().verify} ${Math.round((transfer.parts.size / Number(transfer.chunks)) * 100)}%`
  if (transfer.parts.size !== transfer.chunks) return
  const parts = Array.from({ length: Number(transfer.chunks) }, (_, index) => transfer.parts.get(index)!)
  const blob = new Blob(parts as BlobPart[], { type: transfer.mime })
  const ok = !transfer.hash || digest(await blob.arrayBuffer()) === transfer.hash
  if (ok) {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = transfer.name || 'NearChat-file'
    link.textContent = text().ready
    transfer.card.append(link)
    transfer.state.textContent = `${(blob.size / 1_048_576).toFixed(1)} MB`
  } else {
    transfer.state.textContent = text().corrupt
  }
  socket?.send(await encrypt({ kind: 'file-ack', id: packet.id, senderId: deviceId, ok }))
  incoming.delete(packet.id)
}

const storedDevice = localStorage.getItem('nearchat.web.device')
const deviceId = storedDevice || bytesToHex(randomBytes(16))
localStorage.setItem('nearchat.web.device', deviceId)

$('join').onclick = async () => {
  if (!config.roomId || config.code.length < 6) {
    $('status').textContent = text().invalid
    return
  }
  const joinButton = $('join') as HTMLButtonElement
  guestName = ($('name') as HTMLInputElement).value.trim() || text().nameValue
  joinButton.disabled = true
  joinButton.textContent = text().joining
  $('status').textContent = ''
  try {
    key = await deriveKey()
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss://' : 'ws://'}${location.host}`)
    socket.onopen = () => socket?.send(JSON.stringify({ type: 'hello', roomId: config.roomId, code: config.code, locale, device: { id: deviceId, name: guestName, fingerprint: `WEB-${deviceId.slice(0, 15).toUpperCase()}` } }))
    socket.onmessage = async (event) => {
      try {
        const control = JSON.parse(event.data as string)
        if (control.type === 'auth-ok') {
          connected = true
          $('welcome').remove()
          ;($('composer') as HTMLElement).hidden = false
          renderLanguage()
          return
        }
        if (control.type === 'auth-error') throw new Error(control.message)
        if (control.type === 'members') return
        await receive(await decrypt(event.data as string))
      } catch (error) {
        if (!connected) {
          $('status').textContent = error instanceof Error ? error.message : text().failed
          joinButton.disabled = false
          joinButton.textContent = text().join
        }
      }
    }
    socket.onerror = () => { if (!connected) $('status').textContent = text().failed }
    socket.onclose = () => {
      connected = false
      $('connection').textContent = text().disconnected
      ;($('composer') as HTMLElement).hidden = true
    }
  } catch {
    $('status').textContent = text().failed
    joinButton.disabled = false
    joinButton.textContent = text().join
  }
}

async function sendChat() {
  const draft = $('draft') as HTMLInputElement
  const value = draft.value.trim()
  if (!value || !connected) return
  const packet: Packet = { kind: 'chat', id: bytesToHex(randomBytes(16)), sender: guestName, senderId: deviceId, text: value, createdAt: Date.now() }
  socket?.send(await encrypt(packet))
  addMessage(packet, true)
  draft.value = ''
}

$('send').onclick = sendChat
;($('draft') as HTMLInputElement).onkeydown = (event) => { if (event.key === 'Enter') sendChat() }
;($('file') as HTMLInputElement).onchange = async (event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !connected) return
  if (file.size > 50 * 1024 * 1024) {
    alert(text().tooLarge)
    return
  }
  const id = bytesToHex(randomBytes(16))
  const chunkSize = 48 * 1024
  const chunks = Math.ceil(file.size / chunkSize)
  const hash = digest(await file.arrayBuffer())
  const createdAt = Date.now()
  socket?.send(await encrypt({ kind: 'file-meta', id, sender: guestName, senderId: deviceId, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', chunks, hash, createdAt }))
  for (let index = 0; index < chunks; index++) {
    const bytes = new Uint8Array(await file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize)).arrayBuffer())
    socket?.send(await encrypt({ kind: 'file-chunk', id, index, data: bytesToBase64(bytes) }))
  }
}

renderLanguage()
