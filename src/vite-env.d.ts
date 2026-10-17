/// <reference types="vite/client" />

declare module '*.css'

type LanRoom = {
  roomId: string
  name: string
  address: string
  port: number
  code?: string
  owner?: LanDevice
}

type LanDevice = {
  id: string
  name: string
  fingerprint: string
  platform?: 'desktop' | 'web'
  role?: 'host' | 'guest'
}

type LanEvent = {
  channel: 'connected' | 'disconnected' | 'peer-count' | 'members' | 'payload' | 'error'
  role?: 'host' | 'guest'
  room?: LanRoom
  peers?: number
  members?: LanDevice[]
  payload?: string
  message?: string
}

interface Window {
  nearChat?: {
    startRoom(options: { name: string; device: LanDevice; locale?: 'zh' | 'en' }): Promise<LanRoom>
    discoverRooms(): Promise<LanRoom[]>
    joinRoom(target: LanRoom & { code: string; device: LanDevice; locale?: 'zh' | 'en' }): Promise<LanRoom>
    send(payload: string): Promise<boolean>
    stop(): Promise<boolean>
    readClipboard(): Promise<{ text: string; imageDataUrl: string }>
    writeClipboardText(text: string): Promise<boolean>
    beginFileReceive(options: { id: string; name: string; size: number }): Promise<boolean>
    appendFileChunk(id: string, base64: string): Promise<number>
    finishFileReceive(id: string, hash?: string): Promise<{ ok: boolean; hash: string; path?: string }>
    abortFileReceive(id: string): Promise<boolean>
    showInFolder(filePath: string): Promise<boolean>
    getPreferences(): Promise<{ launchAtLogin: boolean; closeToTray: boolean }>
    setLaunchAtLogin(enabled: boolean): Promise<boolean>
    setLocale(locale: 'zh' | 'en'): Promise<boolean>
    notify(options: { title: string; body: string; silent?: boolean }): Promise<boolean>
    onEvent(callback: (event: LanEvent) => void): () => void
    checkForUpdates(): Promise<boolean>
    downloadUpdate(): Promise<boolean>
    installUpdate(): Promise<boolean>
    onUpdate(callback: (event: { state: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'error'; version?: string; percent?: number; message?: string }) => void): () => void
  }
}
