// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron'

// Keep this in sync with src/types.ts
type Settings = {
  sender_name: string
  sender_email: string
  school: string
  program: string
  city: string
  bcc_list: string
  daily_cap: number
}

// Safely expose a tiny API surface to the renderer
contextBridge.exposeInMainWorld('api', {
  // Settings (SQLite)
  getSettings: () =>
    ipcRenderer.invoke('settings:get') as Promise<Settings>,
  updateSettings: (payload: Settings) =>
    ipcRenderer.invoke('settings:update', payload) as Promise<{ ok: true }>,

  // Secrets (Keytar)
  setSecret: (key: string, value: string) =>
    ipcRenderer.invoke('secrets:set', { key, value }) as Promise<{ ok: true }>,
  getSecret: (key: string) =>
    ipcRenderer.invoke('secrets:get', key) as Promise<string | null>,

  // Gmail
  gmailStatus: () =>
    ipcRenderer.invoke('gmail:status') as Promise<{
      connected: boolean
      email?: string
      error?: string
    }>,
  gmailConnect: () =>
    ipcRenderer.invoke('gmail:connect') as Promise<{
      ok: boolean
      email?: string
      error?: string
    }>,
  gmailSend: (payload: { to: string; subject: string; text: string; bcc?: string }) =>
    ipcRenderer.invoke('gmail:send', payload) as Promise<{
      ok: boolean
      id?: string
      error?: string
      remaining?: number
      cap?: number
    }>,
  gmailQuota: () =>
    ipcRenderer.invoke('gmail:quota') as Promise<{
      used: number
      cap: number
      remaining: number
    }>,
  
  // Google
  searchGoogle: (q: string) => ipcRenderer.invoke('search:google', q),
  addCompany: (payload: { id?: string; name: string; link: string; note?: string }) =>
    ipcRenderer.invoke('companies:add', payload),
  listCompanies: () => ipcRenderer.invoke('companies:list'),
})

contextBridge.exposeInMainWorld('api', {
  googleSearch: (q: string) => ipcRenderer.invoke('search:google', q),
  companyAdd: (input: { name: string; link: string; note?: string }) =>
    ipcRenderer.invoke('companies:add', input),
  companyLike: (domain: string, v: 1 | 0 | -1) =>
    ipcRenderer.invoke('companies:like', { domain, v }),
});
