"use strict";
const electron = require("electron");
const path = require("path");
const Database = require("better-sqlite3");
const keytar = require("keytar");
let win = null;
let db;
const SERVICE = "CompanyTinder";
function initDB() {
  const userData = electron.app.getPath("userData");
  db = new Database(path.join(userData, "app.db"));
  db.pragma("journal_mode = WAL");
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
  win = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // inside new BrowserWindow({ webPreferences: { ... } })
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.webContents.openDevTools({ mode: "detach" });
  const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  {
    await win.loadURL(devUrl);
  }
}
electron.ipcMain.handle("settings:get", () => {
  return db.prepare("SELECT * FROM settings WHERE id=1").get();
});
electron.ipcMain.handle("settings:update", (_e, payload) => {
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
electron.ipcMain.handle("secrets:set", async (_e, { key, value }) => {
  await keytar.setPassword(SERVICE, key, value);
  return { ok: true };
});
electron.ipcMain.handle("secrets:get", async (_e, key) => {
  const v = await keytar.getPassword(SERVICE, key);
  return v || null;
});
electron.app.whenReady().then(() => {
  initDB();
  createWindow();
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
});
