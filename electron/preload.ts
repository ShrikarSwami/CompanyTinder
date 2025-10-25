import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Settings (SQLite)
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (payload: any) => ipcRenderer.invoke('settings:update', payload),

  // Secrets (Keytar)
  setSecret: (key: string, value: string) => ipcRenderer.invoke('secrets:set', { key, value }),
  getSecret: (key: string) => ipcRenderer.invoke('secrets:get', key),

  // Gmail
  gmailStatus: () => ipcRenderer.invoke('gmail:status'),
  gmailConnect: () => ipcRenderer.invoke('gmail:connect'),
})
