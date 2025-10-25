"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// electron/preload.ts
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('api', {
    // settings (SQLite)
    getSettings: () => electron_1.ipcRenderer.invoke('settings:get'),
    updateSettings: (payload) => electron_1.ipcRenderer.invoke('settings:update', payload),
    // secrets (Keytar)
    setSecret: (key, value) => electron_1.ipcRenderer.invoke('secrets:set', { key, value }),
    getSecret: (key) => electron_1.ipcRenderer.invoke('secrets:get', key),
    // gmail (OAuth)
    gmailStatus: () => electron_1.ipcRenderer.invoke('gmail:status'),
    gmailConnect: () => electron_1.ipcRenderer.invoke('gmail:connect'),
});
