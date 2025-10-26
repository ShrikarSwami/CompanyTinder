"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('api', {
    // Settings (SQLite)
    getSettings: () => electron_1.ipcRenderer.invoke('settings:get'),
    updateSettings: (payload) => electron_1.ipcRenderer.invoke('settings:update', payload),
    // Secrets (keytar)
    setSecret: (key, value) => electron_1.ipcRenderer.invoke('secrets:set', { key, value }),
    getSecret: (key) => electron_1.ipcRenderer.invoke('secrets:get', key),
    // Gmail
    gmailStatus: () => electron_1.ipcRenderer.invoke('gmail:status'),
    gmailConnect: () => electron_1.ipcRenderer.invoke('gmail:connect'),
    gmailSend: (payload) => electron_1.ipcRenderer.invoke('gmail:send', payload),
    gmailSend: (payload) => electron_1.ipcRenderer.invoke('gmail:send', payload),
    gmailQuota: () => electron_1.ipcRenderer.invoke('gmail:quota'),
});
