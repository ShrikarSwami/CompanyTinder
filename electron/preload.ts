// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // settings (SQLite)
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (payload: any) => ipcRenderer.invoke('settings:update', payload),

  // secrets (Keytar)
  setSecret: (key: string, value: string) => ipcRenderer.invoke('secrets:set', { key, value }),
  getSecret: (key: string) => ipcRenderer.invoke('secrets:get', key),

  // gmail (OAuth)
  gmailStatus: () => ipcRenderer.invoke('gmail:status'),
  gmailConnect: () => ipcRenderer.invoke('gmail:connect'),
})
