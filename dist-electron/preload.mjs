"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  getSettings: () => electron.ipcRenderer.invoke("settings:get"),
  updateSettings: (payload) => electron.ipcRenderer.invoke("settings:update", payload),
  setSecret: (key, value) => electron.ipcRenderer.invoke("secrets:set", { key, value }),
  getSecret: (key) => electron.ipcRenderer.invoke("secrets:get", key)
});
