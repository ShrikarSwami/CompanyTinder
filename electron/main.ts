import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import keytar from 'keytar'

// ---- Globals ----
let win: BrowserWindow | null = null
let db: Database.Database
const SERVICE = 'CompanyTinder'

// ---- DB ----
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

// ---- Window ----
async function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.webContents.openDevTools({ mode: 'detach' })

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
  await win.loadURL(devUrl)
}

// ---- IPC: Settings ----
ipcMain.handle('settings:get', () => {
  try {
    return db.prepare('SELECT * FROM settings WHERE id=1').get()
  } catch (err) {
    console.error('settings:get failed:', err)
    return null
  }
})

ipcMain.handle('settings:update', (_e, payload: any) => {
  try {
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
  } catch (err) {
    console.error('settings:update failed:', err)
    return { ok: false, error: String(err) }
  }
})

// ---- IPC: Secrets ----
ipcMain.handle('secrets:set', async (_e, { key, value }: { key: string; value: string }) => {
  try {
    await keytar.setPassword(SERVICE, key, value)
    return { ok: true }
  } catch (err: any) {
    console.error('secrets:set failed:', err?.message || err)
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('secrets:get', async (_e, key: string) => {
  try {
    const v = await keytar.getPassword(SERVICE, key)
    return v || null
  } catch (err: any) {
    console.error('secrets:get failed:', err?.message || err)
    return null
  }
})

// ---- App ----
app.whenReady().then(() => {
  initDB()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
