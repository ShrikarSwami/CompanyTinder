import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("api", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (payload) => ipcRenderer.invoke("settings:update", payload),
  setSecret: (key, value) => ipcRenderer.invoke("secrets:set", { key, value }),
  getSecret: (key) => ipcRenderer.invoke("secrets:get", key)
});
