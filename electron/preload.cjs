const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nearChat', {
  startRoom: (options) => ipcRenderer.invoke('lan:start-room', options),
  discoverRooms: () => ipcRenderer.invoke('lan:discover'),
  joinRoom: (target) => ipcRenderer.invoke('lan:join-room', target),
  send: (payload) => ipcRenderer.invoke('lan:send', payload),
  stop: () => ipcRenderer.invoke('lan:stop'),
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
