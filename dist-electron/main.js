"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// electron/main.ts
const electron_1 = require("electron");
const path_1 = require("path");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const keytar_1 = __importDefault(require("keytar"));
let win = null;
let db;
const SERVICE = 'CompanyTinder'; // keychain service name
function initDB() {
    const userData = electron_1.app.getPath('userData');
    db = new better_sqlite3_1.default((0, path_1.join)(userData, 'app.db'));
    db.pragma('journal_mode = WAL');
    db.exec(`
    CREATE TABLE IF NOT EXISTS settings(
      id INTEGER PRIMARY KEY CHECK (id=1),
      sender_name TEXT,
      sender_email TEXT,
      school TEXT,
      program TEXT,
      city TEXT,
      bcc_list TEXT,
      daily_cap INTEGER DEFAULT 25
    );
    INSERT OR IGNORE INTO settings(id) VALUES (1);
  `);
}
async function createWindow() {
    win = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: (0, path_1.join)(__dirname, 'preload.mjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    // open DevTools so we can see renderer logs
    win.webContents.openDevTools({ mode: 'detach' });
    // In dev, always load the Vite dev server
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    if (devUrl) {
        await win.loadURL(devUrl);
    }
    else {
        // prod build fallback
        await win.loadFile((0, path_1.join)(__dirname, '../renderer/index.html'));
    }
}
/* ---- IPC: Settings (SQLite) ---- */
electron_1.ipcMain.handle('settings:get', () => {
    return db.prepare('SELECT * FROM settings WHERE id=1').get();
});
electron_1.ipcMain.handle('settings:update', (_e, payload) => {
    console.log('[settings:update]', payload);
    db.prepare(`
    UPDATE settings SET
      sender_name=@sender_name,
      sender_email=@sender_email,
      school=@school,
      program=@program,
      city=@city,
      bcc_list=@bcc_list,
      daily_cap=@daily_cap
    WHERE id=1
  `).run(payload);
    return { ok: true };
});
/* ---- IPC: Secrets (Keytar) ---- */
electron_1.ipcMain.handle('secrets:set', async (_e, { key, value }) => {
    try {
        await keytar_1.default.setPassword(SERVICE, key, value);
        return { ok: true };
    }
    catch (err) {
        console.error('[secrets:set] failed:', err?.message || err);
        return { ok: false, error: String(err?.message || err) };
    }
});
electron_1.ipcMain.handle('secrets:get', async (_e, key) => {
    try {
        const v = await keytar_1.default.getPassword(SERVICE, key);
        return v || null;
    }
    catch (err) {
        console.error('[secrets:get] failed:', err?.message || err);
        return null;
    }
});
electron_1.app.whenReady().then(() => {
    initDB();
    createWindow();
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
