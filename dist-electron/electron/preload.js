"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// electron/preload.ts
const electron_1 = require("electron");
// All safe, typed calls the renderer is allowed to make.
const api = {
    // ----- Settings (SQLite) -----
    getSettings: () => electron_1.ipcRenderer.invoke('settings:get'),
    updateSettings: (payload) => electron_1.ipcRenderer.invoke('settings:update', payload),
    // ----- Secrets (Keytar) -----
    setSecret: (key, value) => electron_1.ipcRenderer.invoke('secrets:set', { key, value }),
    getSecret: (key) => electron_1.ipcRenderer.invoke('secrets:get', key),
    // ----- Gmail (we wire these in main.ts next) -----
    gmailStatus: () => electron_1.ipcRenderer.invoke('gmail:status'),
    gmailConnect: () => electron_1.ipcRenderer.invoke('gmail:connect'),
    gmailDisconnect: () => electron_1.ipcRenderer.invoke('gmail:disconnect'),
};
electron_1.contextBridge.exposeInMainWorld('api', api);
