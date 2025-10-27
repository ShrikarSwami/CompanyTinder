"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// electron/preload.ts
const electron_1 = require("electron");
// Safely expose a tiny API surface to the renderer
electron_1.contextBridge.exposeInMainWorld('api', {
    // Settings (SQLite)
    getSettings: () => electron_1.ipcRenderer.invoke('settings:get'),
    updateSettings: (payload) => electron_1.ipcRenderer.invoke('settings:update', payload),
    // Secrets (Keytar)
    setSecret: (key, value) => electron_1.ipcRenderer.invoke('secrets:set', { key, value }),
    getSecret: (key) => electron_1.ipcRenderer.invoke('secrets:get', key),
    // Gmail
    gmailStatus: () => electron_1.ipcRenderer.invoke('gmail:status'),
    gmailConnect: () => electron_1.ipcRenderer.invoke('gmail:connect'),
    gmailSend: (payload) => electron_1.ipcRenderer.invoke('gmail:send', payload),
    gmailQuota: () => electron_1.ipcRenderer.invoke('gmail:quota'),
    // Google
    searchGoogle: (q) => electron_1.ipcRenderer.invoke('search:google', q),
    addCompany: (payload) => electron_1.ipcRenderer.invoke('companies:add', payload),
    listCompanies: () => electron_1.ipcRenderer.invoke('companies:list'),
});
electron_1.contextBridge.exposeInMainWorld('api', {
    googleSearch: (q) => electron_1.ipcRenderer.invoke('search:google', q),
    companyAdd: (input) => electron_1.ipcRenderer.invoke('companies:add', input),
    companyLike: (domain, v) => electron_1.ipcRenderer.invoke('companies:like', { domain, v }),
});
