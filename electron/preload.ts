import { contextBridge, ipcRenderer } from 'electron'

// Minimal API used by the React app
contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (payload: any) => ipcRenderer.invoke('settings:update', payload),

  setSecret: (key: string, value: string) => ipcRenderer.invoke('secrets:set', { key, value }),
  getSecret: (key: string) => ipcRenderer.invoke('secrets:get', key)
})
