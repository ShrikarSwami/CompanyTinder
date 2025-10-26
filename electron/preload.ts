import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Settings (SQLite)
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (payload: any) => ipcRenderer.invoke('settings:update', payload),

  // Secrets (keytar)
  setSecret: (key: string, value: string) => ipcRenderer.invoke('secrets:set', { key, value }),
  getSecret: (key: string) => ipcRenderer.invoke('secrets:get', key),

  // Gmail
  gmailStatus: () => ipcRenderer.invoke('gmail:status'),
  gmailConnect: () => ipcRenderer.invoke('gmail:connect'),
  gmailSend: (payload: { to: string; subject: string; text: string; bcc?: string }) =>
    ipcRenderer.invoke('gmail:send', payload),
})
