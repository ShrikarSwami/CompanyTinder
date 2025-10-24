"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('api', {
    getSettings: () => electron_1.ipcRenderer.invoke('settings:get'),
    updateSettings: (payload) => electron_1.ipcRenderer.invoke('settings:update', payload),
    setSecret: (key, value) => electron_1.ipcRenderer.invoke('secrets:set', { key, value }),
    getSecret: (key) => electron_1.ipcRenderer.invoke('secrets:get', key)
});
