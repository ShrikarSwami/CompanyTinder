"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = require("path");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const keytar_1 = __importDefault(require("keytar"));
let win = null;
let db;
const SERVICE = 'CompanyTinder';
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
            // IMPORTANT: we compile to CJS .js files, not .mjs
            preload: (0, path_1.join)(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });
    win.webContents.openDevTools({ mode: 'detach' });
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    if (devUrl) {
        await win.loadURL(devUrl);
    }
    else {
        await win.loadFile((0, path_1.join)(__dirname, '../renderer/index.html'));
    }
}
/* ---- IPC: Settings (SQLite) ---- */
electron_1.ipcMain.handle('settings:get', () => {
    return db.prepare('SELECT * FROM settings WHERE id=1').get();
});
electron_1.ipcMain.handle('settings:update', (_e, payload) => {
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
    await keytar_1.default.setPassword(SERVICE, key, value);
    return { ok: true };
});
electron_1.ipcMain.handle('secrets:get', async (_e, key) => {
    const v = await keytar_1.default.getPassword(SERVICE, key);
    return v || null;
});
electron_1.app.whenReady().then(() => {
    initDB();
    createWindow();
});
electron_1.app.on('window-all-closed', () => { if (process.platform !== 'darwin')
    electron_1.app.quit(); });
electron_1.app.on('activate', () => { if (electron_1.BrowserWindow.getAllWindows().length === 0)
    createWindow(); });
