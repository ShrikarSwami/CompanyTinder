// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron'

// Keep this single, centralized bridge. If you have any other file that calls
// contextBridge.exposeInMainWorld('api', ...), remove it to avoid the
// “Cannot bind an API on top of an existing property” error.
contextBridge.exposeInMainWorld('api', {
  /* Settings (SQLite) */
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (payload: any) => ipcRenderer.invoke('settings:update', payload),

  /* Secrets (Keytar) */
  setSecret: (key: string, value: string) => ipcRenderer.invoke('secrets:set', { key, value }),
  getSecret: (key: string) => ipcRenderer.invoke('secrets:get', key),

  /* Gmail */
  gmailStatus: () => ipcRenderer.invoke('gmail:status'),
  gmailConnect: () => ipcRenderer.invoke('gmail:connect'),
  gmailSend: (payload: { to: string; subject: string; text: string; bcc?: string }) =>
    ipcRenderer.invoke('gmail:send', payload),

  /* Quota / meter */
  gmailQuota: () => ipcRenderer.invoke('gmail:quota'),
})
