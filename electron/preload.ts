// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron'

type Settings = {
  sender_name: string
  sender_email: string
  school: string
  program: string
  city: string
  bcc_list: string
  daily_cap: number
}

// All safe, typed calls the renderer is allowed to make.
const api = {
  // ----- Settings (SQLite) -----
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (payload: Settings): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('settings:update', payload),

  // ----- Secrets (Keytar) -----
  setSecret: (key: string, value: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('secrets:set', { key, value }),
  getSecret: (key: string): Promise<string | null> =>
    ipcRenderer.invoke('secrets:get', key),

  // ----- Gmail (we wire these in main.ts next) -----
  gmailStatus: (): Promise<{ connected: boolean; email?: string | null }> =>
    ipcRenderer.invoke('gmail:status'),
  gmailConnect: (): Promise<{ ok: boolean; email?: string | null }> =>
    ipcRenderer.invoke('gmail:connect'),
  gmailDisconnect: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('gmail:disconnect'),
}

contextBridge.exposeInMainWorld('api', api)
