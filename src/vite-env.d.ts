/// <reference types="vite/client" />

declare module '*.css'

type LanRoom = {
  roomId: string
  name: string
  address: string
  port: number
  code?: string
}

type LanEvent = {
  channel: 'connected' | 'disconnected' | 'peer-count' | 'payload' | 'error'
  role?: 'host' | 'guest'
  room?: LanRoom
  peers?: number
  payload?: string
  message?: string
}

interface Window {
  nearChat?: {
    startRoom(options: { name: string }): Promise<LanRoom>
    discoverRooms(): Promise<LanRoom[]>
    joinRoom(target: LanRoom & { code: string }): Promise<LanRoom>
    send(payload: string): Promise<boolean>
    stop(): Promise<boolean>
    onEvent(callback: (event: LanEvent) => void): () => void
    checkForUpdates(): Promise<boolean>
    downloadUpdate(): Promise<boolean>
    installUpdate(): Promise<boolean>
    onUpdate(callback: (event: { state: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'error'; version?: string; percent?: number; message?: string }) => void): () => void
  }
}
