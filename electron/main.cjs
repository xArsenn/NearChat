const { app, BrowserWindow, clipboard, ipcMain, shell, Tray, Menu, Notification, nativeImage } = require('electron')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const dgram = require('dgram')
const fs = require('fs')
const http = require('http')
const { WebSocket, WebSocketServer } = require('ws')
const { autoUpdater } = require('electron-updater')

// A packaged GUI app can outlive the terminal or updater process that launched it.
// Ignore writes to those closed pipes instead of crashing the Electron main process.
for (const stream of [process.stdout, process.stderr]) {
  stream?.on?.('error', (error) => {
    if (error.code !== 'EPIPE') process.nextTick(() => { throw error })
  })
}

const DISCOVERY_PORT = 41234
let mainWindow = null
let tray = null
let isQuitting = false
let roomServer = null
let roomHttpServer = null
let roomInfo = null
let roomPeers = new Set()
let roomAdvertiser = null
let joinedSocket = null
let localDevice = null
let appLocale = 'zh'
const incomingFiles = new Map()

function localized(zh, en, locale = appLocale) {
  return locale === 'en' ? en : zh
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  mainWindow.show()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
}

function updateTrayMenu() {
  if (!tray) return
  tray.setToolTip(localized('NearChat · 局域网协作', 'NearChat · Local collaboration'))
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: localized('打开 NearChat', 'Open NearChat'), click: showMainWindow },
    { label: localized('打开接收文件夹', 'Open received files'), click: () => shell.openPath(path.join(app.getPath('downloads'), 'NearChat')) },
    { type: 'separator' },
    { label: localized('退出', 'Quit'), click: () => { isQuitting = true; app.quit() } },
  ]))
}

function createTray() {
  if (tray) return
  const iconPath = path.join(__dirname, '..', 'dist', 'icon.svg')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 })
  tray = new Tray(icon)
  tray.on('click', showMainWindow)
  updateTrayMenu()
}

function cleanDevice(device = {}, fallbackName = localized('匿名设备', 'Anonymous device')) {
  return {
    id: String(device.id || crypto.randomBytes(16).toString('hex')).slice(0, 64),
    name: String(device.name || fallbackName).slice(0, 40),
    fingerprint: String(device.fingerprint || '').slice(0, 80),
    platform: device.platform === 'web' ? 'web' : 'desktop',
  }
}

function currentMembers() {
  const members = localDevice ? [{ ...localDevice, role: 'host' }] : []
  for (const peer of roomPeers) {
    if (peer.nearChatDevice) members.push({ ...peer.nearChatDevice, role: 'guest' })
  }
  return members
}

function publishMembers() {
  const members = currentMembers()
  emit('members', { members })
  const message = JSON.stringify({ type: 'members', members })
  for (const peer of roomPeers) {
    if (peer.readyState === WebSocket.OPEN) peer.send(message)
  }
}

function emit(channel, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('lan:event', { channel, ...payload })
}

function emitUpdate(state, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:event', { state, ...payload })
}

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.disableWebInstaller = true
if (app.isPackaged) autoUpdater.logger = null
autoUpdater.on('checking-for-update', () => emitUpdate('checking'))
autoUpdater.on('update-available', (info) => emitUpdate('available', { version: info.version }))
autoUpdater.on('update-not-available', (info) => emitUpdate('current', { version: info.version }))
autoUpdater.on('download-progress', (progress) => emitUpdate('downloading', { percent: Math.round(progress.percent) }))
autoUpdater.on('update-downloaded', (info) => emitUpdate('downloaded', { version: info.version }))
autoUpdater.on('error', (error) => emitUpdate('error', { message: error.message }))

ipcMain.handle('clipboard:read', async () => {
  const text = (await clipboard.readText()).slice(0, 100_000)
  let imageDataUrl = ''
  for (const item of await clipboard.read()) {
    const imageType = item.types.find((type) => type.startsWith('image/'))
    if (!imageType) continue
    const blob = await item.getType(imageType)
    imageDataUrl = `data:${imageType};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`
    break
  }
  return { text, imageDataUrl }
})

ipcMain.handle('clipboard:write-text', async (_event, text) => {
  await clipboard.writeText(String(text || '').slice(0, 100_000))
  return true
})

function safeRelativePath(value) {
  const parts = String(value || 'NearChat-file')
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .map((part) => part.replace(/[<>:"|?*\x00-\x1f]/g, '_').slice(0, 120))
  return (parts.slice(-20).join(path.sep) || 'NearChat-file')
}

function uniqueFilePath(target) {
  const reserved = new Set(Array.from(incomingFiles.values(), (transfer) => transfer.finalPath))
  if (!fs.existsSync(target) && !reserved.has(target)) return target
  const extension = path.extname(target)
  const stem = target.slice(0, -extension.length || undefined)
  for (let index = 2; index < 10_000; index++) {
    const candidate = `${stem} (${index})${extension}`
    if (!fs.existsSync(candidate) && !reserved.has(candidate)) return candidate
  }
  return `${stem}-${Date.now()}${extension}`
}

ipcMain.handle('file:begin-receive', async (_event, options = {}) => {
  const transferId = String(options.id || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80)
  if (!transferId) throw new Error('Invalid transfer ID')
  const root = path.join(app.getPath('downloads'), 'NearChat')
  const finalPath = uniqueFilePath(path.join(root, safeRelativePath(options.name)))
  const tempPath = path.join(app.getPath('temp'), `nearchat-${transferId}.part`)
  await fs.promises.mkdir(path.dirname(finalPath), { recursive: true })
  await fs.promises.writeFile(tempPath, Buffer.alloc(0))
  incomingFiles.set(transferId, { tempPath, finalPath, size: Number(options.size) || 0, received: 0, hash: crypto.createHash('sha256') })
  return true
})

ipcMain.handle('file:append-chunk', async (_event, transferId, base64) => {
  const transfer = incomingFiles.get(String(transferId))
  if (!transfer) throw new Error('Transfer is not initialized')
  const bytes = Buffer.from(String(base64), 'base64')
  transfer.received += bytes.length
  if (transfer.received > transfer.size) throw new Error('Transfer exceeded its declared size')
  transfer.hash.update(bytes)
  await fs.promises.appendFile(transfer.tempPath, bytes)
  return transfer.received
})

ipcMain.handle('file:finish-receive', async (_event, transferId, expectedHash) => {
  const transfer = incomingFiles.get(String(transferId))
  if (!transfer) throw new Error('Transfer is not initialized')
  incomingFiles.delete(String(transferId))
  const actualHash = transfer.hash.digest('hex')
  if (transfer.received !== transfer.size || (expectedHash && actualHash !== String(expectedHash))) {
    await fs.promises.unlink(transfer.tempPath).catch(() => {})
    return { ok: false, hash: actualHash }
  }
  await fs.promises.rename(transfer.tempPath, transfer.finalPath).catch(async (error) => {
    if (error.code !== 'EXDEV') throw error
    await fs.promises.copyFile(transfer.tempPath, transfer.finalPath)
    await fs.promises.unlink(transfer.tempPath)
  })
  return { ok: true, hash: actualHash, path: transfer.finalPath }
})

ipcMain.handle('file:abort-receive', async (_event, transferId) => {
  const transfer = incomingFiles.get(String(transferId))
  incomingFiles.delete(String(transferId))
  if (transfer) await fs.promises.unlink(transfer.tempPath).catch(() => {})
  return true
})

ipcMain.handle('file:show-in-folder', (_event, filePath) => {
  shell.showItemInFolder(String(filePath || ''))
  return true
})

ipcMain.handle('app:get-preferences', () => ({
  launchAtLogin: app.getLoginItemSettings().openAtLogin,
  closeToTray: true,
}))

ipcMain.handle('app:set-launch-at-login', (_event, enabled) => {
  const args = app.isPackaged ? ['--hidden'] : [path.resolve(__dirname, '..'), '--hidden']
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: process.execPath, args })
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle('app:set-locale', (_event, locale) => {
  appLocale = locale === 'en' ? 'en' : 'zh'
  updateTrayMenu()
  return true
})

ipcMain.handle('app:notify', (_event, options = {}) => {
  if (!Notification.isSupported()) return false
  const notification = new Notification({
    title: String(options.title || 'NearChat').slice(0, 80),
    body: String(options.body || '').slice(0, 240),
    silent: Boolean(options.silent),
  })
  notification.on('click', showMainWindow)
  notification.show()
  return true
})

ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) {
    emitUpdate('error', { message: localized('开发版本不连接更新服务，请在安装版中检查更新', 'Development builds do not use the update service. Check again from an installed release.') })
    return false
  }
  await autoUpdater.checkForUpdates()
  return true
})

ipcMain.handle('update:download', async () => {
  await autoUpdater.downloadUpdate()
  return true
})

ipcMain.handle('update:install', async () => {
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
  return true
})

function localAddresses() {
  const result = []
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const item of entries || []) {
      if (item.family === 'IPv4' && !item.internal) result.push(item.address)
    }
  }
  return result
}

function preferredAddress() {
  const addresses = localAddresses()
  return addresses.find((value) => /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(value)) || addresses[0] || '127.0.0.1'
}

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join('')
}

function broadcastPayload(payload) {
  for (const peer of roomPeers) {
    if (peer.readyState === WebSocket.OPEN) peer.send(payload)
  }
}

async function waitForSocket(socket) {
  while (socket.readyState === WebSocket.OPEN && socket.bufferedAmount > 8 * 1024 * 1024) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function stopNetworking() {
  for (const transfer of incomingFiles.values()) fs.promises.unlink(transfer.tempPath).catch(() => {})
  incomingFiles.clear()
  if (roomAdvertiser) {
    clearInterval(roomAdvertiser.timer)
    try { roomAdvertiser.socket.close() } catch {}
    roomAdvertiser = null
  }
  for (const peer of roomPeers) {
    try { peer.close() } catch {}
  }
  roomPeers.clear()
  if (roomServer) {
    try { roomServer.close() } catch {}
    roomServer = null
  }
  if (roomHttpServer) {
    try { roomHttpServer.close() } catch {}
    roomHttpServer = null
  }
  if (joinedSocket) {
    try { joinedSocket.close() } catch {}
    joinedSocket = null
  }
  roomInfo = null
  localDevice = null
}

function advertiseRoom(info) {
  const socket = dgram.createSocket('udp4')
  const announce = () => {
    const message = Buffer.from(JSON.stringify({
      protocol: 'nearchat-lan-v1',
      roomId: info.roomId,
      name: info.name,
      address: info.address,
      port: info.port,
    }))
    try { socket.send(message, DISCOVERY_PORT, '255.255.255.255') } catch {}
  }
  socket.bind(0, () => {
    socket.setBroadcast(true)
    announce()
  })
  const timer = setInterval(announce, 1800)
  roomAdvertiser = { socket, timer }
}

ipcMain.handle('lan:start-room', async (_event, options = {}) => {
  stopNetworking()
  appLocale = options.locale === 'en' ? 'en' : 'zh'
  const address = preferredAddress()
  const code = makeCode()
  const roomId = crypto.randomBytes(12).toString('hex')
  const name = String(options.name || localized('NearChat 房间', 'NearChat Room')).slice(0, 40)
  localDevice = cleanDevice(options.device, localized('房主', 'Host'))

  return await new Promise((resolve, reject) => {
    const distDirectory = path.join(__dirname, '..', 'dist')
    const guestPage = fs.readFileSync(path.join(distDirectory, 'guest.html'))
    const httpServer = http.createServer((request, response) => {
      if (request.method !== 'GET') {
        response.writeHead(405).end()
        return
      }
      const pathname = new URL(request.url || '/', 'http://localhost').pathname
      if (pathname.startsWith('/assets/')) {
        const assetPath = path.join(distDirectory, 'assets', path.basename(pathname))
        if (!fs.existsSync(assetPath)) {
          response.writeHead(404).end()
          return
        }
        response.writeHead(200, {
          'Content-Type': pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        })
        response.end(fs.readFileSync(assetPath))
        return
      }
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      })
      response.end(guestPage)
    })
    const server = new WebSocketServer({ server: httpServer })
    roomHttpServer = httpServer
    roomServer = server
    httpServer.listen(0, '0.0.0.0', () => {
      const port = httpServer.address().port
      roomInfo = { roomId, name, address, port, code, owner: localDevice }
      advertiseRoom(roomInfo)
      emit('connected', { role: 'host', room: roomInfo, peers: 1 })
      publishMembers()
      resolve(roomInfo)
    })
    httpServer.on('error', (error) => {
      emit('error', { message: `${localized('无法创建房间', 'Could not create the room')}: ${error.message}` })
      reject(error)
    })
    server.on('connection', (socket) => {
      let authenticated = false
      const timer = setTimeout(() => socket.close(4001, localized('认证超时', 'Authentication timed out')), 8000)
      socket.on('message', (data) => {
        if (!authenticated) {
          try {
            const hello = JSON.parse(data.toString())
            if (hello.type !== 'hello' || hello.roomId !== roomId || hello.code !== code) {
              const message = localized('房间口令不正确', 'The room code is incorrect', hello.locale)
              socket.send(JSON.stringify({ type: 'auth-error', message }))
              socket.close(4003, message)
              return
            }
            authenticated = true
            clearTimeout(timer)
            socket.nearChatDevice = cleanDevice(hello.device)
            roomPeers.add(socket)
            socket.send(JSON.stringify({ type: 'auth-ok', room: roomInfo, members: currentMembers() }))
            emit('peer-count', { peers: roomPeers.size + 1 })
            publishMembers()
          } catch {
            socket.close(4002, localized('无效请求', 'Invalid request'))
          }
          return
        }
        const payload = data.toString()
        emit('payload', { payload })
        for (const peer of roomPeers) {
          if (peer !== socket && peer.readyState === WebSocket.OPEN) peer.send(payload)
        }
      })
      socket.on('close', () => {
        clearTimeout(timer)
        roomPeers.delete(socket)
        emit('peer-count', { peers: roomPeers.size + 1 })
        publishMembers()
      })
    })
  })
})

ipcMain.handle('lan:discover', async () => {
  const rooms = new Map()
  if (roomInfo) rooms.set(roomInfo.roomId, { ...roomInfo, code: undefined })
  return await new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    const finish = () => {
      try { socket.close() } catch {}
      resolve([...rooms.values()])
    }
    socket.on('message', (buffer) => {
      try {
        const item = JSON.parse(buffer.toString())
        if (item.protocol === 'nearchat-lan-v1' && item.roomId && item.address && item.port) rooms.set(item.roomId, item)
      } catch {}
    })
    socket.on('error', finish)
    socket.bind(DISCOVERY_PORT, '0.0.0.0', () => socket.setBroadcast(true))
    setTimeout(finish, 2600)
  })
})

ipcMain.handle('lan:join-room', async (_event, target) => {
  stopNetworking()
  appLocale = target.locale === 'en' ? 'en' : 'zh'
  localDevice = cleanDevice(target.device)
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://${target.address}:${Number(target.port)}`)
    let authenticated = false
    joinedSocket = socket
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error(localized('连接超时，请确认两台设备位于同一局域网', 'Connection timed out. Make sure both devices are on the same local network.')))
    }, 10000)
    socket.on('open', () => socket.send(JSON.stringify({ type: 'hello', roomId: target.roomId, code: String(target.code || '').toUpperCase(), device: localDevice, locale: appLocale })))
    socket.on('message', (data) => {
      const payload = data.toString()
      try {
        const control = JSON.parse(payload)
        if (control.type === 'auth-ok') {
          clearTimeout(timeout)
          authenticated = true
          roomInfo = { ...control.room, code: String(target.code || '').toUpperCase() }
          emit('connected', { role: 'guest', room: roomInfo, peers: 2 })
          emit('members', { members: control.members || [] })
          resolve(roomInfo)
          return
        }
        if (control.type === 'members') {
          emit('members', { members: control.members || [] })
          emit('peer-count', { peers: (control.members || []).length })
          return
        }
        if (control.type === 'auth-error') {
          clearTimeout(timeout)
          reject(new Error(control.message))
          return
        }
      } catch {}
      emit('payload', { payload })
    })
    socket.on('close', () => {
      clearTimeout(timeout)
      if (authenticated) emit('disconnected', { message: localized('与房间的连接已断开', 'The room connection was closed') })
    })
    socket.on('error', (error) => {
      clearTimeout(timeout)
      reject(new Error(`${localized('无法连接主机，请检查防火墙和局域网设置', 'Could not reach the host. Check the firewall and local network settings.')}: ${error.message}`))
    })
  })
})

ipcMain.handle('lan:send', async (_event, payload) => {
  if (roomServer) {
    await Promise.all(Array.from(roomPeers, (peer) => waitForSocket(peer)))
    broadcastPayload(String(payload))
    return true
  }
  if (joinedSocket?.readyState === WebSocket.OPEN) {
    await waitForSocket(joinedSocket)
    joinedSocket.send(String(payload))
    return true
  }
  throw new Error(localized('当前没有可用连接', 'There is no active connection'))
})

ipcMain.handle('lan:stop', async () => {
  stopNetworking()
  emit('disconnected', { message: localized('连接已断开', 'Disconnected') })
  return true
})

function createWindow() {
  const startHidden = process.argv.includes('--hidden')
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#080b0d',
    autoHideMenuBar: true,
    title: 'NearChat',
    show: !startHidden,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  mainWindow = window

  window.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    window.hide()
  })

  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()
  createTray()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // NearChat stays available in the tray so active rooms and transfers continue.
})

app.on('before-quit', () => {
  isQuitting = true
  stopNetworking()
})
