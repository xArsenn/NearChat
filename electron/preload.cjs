const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nearChat', {
  startRoom: (options) => ipcRenderer.invoke('lan:start-room', options),
  discoverRooms: () => ipcRenderer.invoke('lan:discover'),
  joinRoom: (target) => ipcRenderer.invoke('lan:join-room', target),
  send: (payload) => ipcRenderer.invoke('lan:send', payload),
  stop: () => ipcRenderer.invoke('lan:stop'),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  beginFileReceive: (options) => ipcRenderer.invoke('file:begin-receive', options),
  appendFileChunk: (id, base64) => ipcRenderer.invoke('file:append-chunk', id, base64),
  finishFileReceive: (id, hash) => ipcRenderer.invoke('file:finish-receive', id, hash),
  abortFileReceive: (id) => ipcRenderer.invoke('file:abort-receive', id),
  showInFolder: (filePath) => ipcRenderer.invoke('file:show-in-folder', filePath),
  getPreferences: () => ipcRenderer.invoke('app:get-preferences'),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('app:set-launch-at-login', enabled),
  setLocale: (locale) => ipcRenderer.invoke('app:set-locale', locale),
  notify: (options) => ipcRenderer.invoke('app:notify', options),
  onEvent: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('lan:event', listener)
    return () => ipcRenderer.removeListener('lan:event', listener)
  },
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('update:event', listener)
    return () => ipcRenderer.removeListener('update:event', listener)
  },
})
