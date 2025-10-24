import { ipcMain, app, BrowserWindow } from "electron";
import { join } from "path";
import Database from "better-sqlite3";
import keytar from "keytar";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
let win = null;
let db;
const SERVICE = "CompanyTinder";
function initDB() {
  const userData = app.getPath("userData");
  db = new Database(join(userData, "app.db"));
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
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.webContents.openDevTools({ mode: "detach" });
  const devUrl = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  try {
    await win.loadURL(devUrl);
  } catch {
    await win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
ipcMain.handle("settings:get", () => {
  return db.prepare("SELECT * FROM settings WHERE id=1").get();
});
ipcMain.handle("settings:update", (_e, payload) => {
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
ipcMain.handle("secrets:set", async (_e, { key, value }) => {
  await keytar.setPassword(SERVICE, key, value);
  return { ok: true };
});
ipcMain.handle("secrets:get", async (_e, key) => {
  const v = await keytar.getPassword(SERVICE, key);
  return v || null;
});
app.whenReady().then(() => {
  initDB();
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
