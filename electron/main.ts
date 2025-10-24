import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import keytar from 'keytar'

let win: BrowserWindow | null = null
let db: Database.Database
const SERVICE = 'CompanyTinder'

function initDB() {
  const userData = app.getPath('userData')
  db = new Database(join(userData, 'app.db'))
  db.pragma('journal_mode = WAL')
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
  `)
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // inside new BrowserWindow({ webPreferences: { ... } })
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // open DevTools so we can see renderer logs
  win.webContents.openDevTools({ mode: 'detach' })

  // In dev, always load the Vite dev server
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
  if (devUrl) {
    await win.loadURL(devUrl)
  } else {
    // prod build fallback
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/* ---- IPC: Settings (SQLite) ---- */
ipcMain.handle('settings:get', () => {
  return db.prepare('SELECT * FROM settings WHERE id=1').get()
})
ipcMain.handle('settings:update', (_e, payload: any) => {
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
  `).run(payload)
  return { ok: true }
})

/* ---- IPC: Secrets (Keytar) ---- */
ipcMain.handle('secrets:set', async (_e, { key, value }) => {
  await keytar.setPassword(SERVICE, key, value)
  return { ok: true }
})
ipcMain.handle('secrets:get', async (_e, key: string) => {
  const v = await keytar.getPassword(SERVICE, key)
  return v || null
})

app.whenReady().then(() => {
  initDB()
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
