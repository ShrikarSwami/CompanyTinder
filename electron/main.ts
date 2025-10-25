import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import keytar from 'keytar'
import open from 'open'
import getPort from 'get-port'
import { google } from 'googleapis'


let win: BrowserWindow | null = null
let db: Database.Database

const SERVICE = 'CompanyTinder'
const TOKENS_KEY = 'GMAIL_TOKENS'

type Settings = {
  sender_name: string
  sender_email: string
  school: string
  program: string
  city: string
  bcc_list: string
  daily_cap: number
}

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
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, 'preload.js'),
    },
  })

  // devtools in dev so we can see Console logs
  win.webContents.openDevTools({ mode: 'detach' })

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
  if (devUrl) {
    await win.loadURL(devUrl)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/* -------------------- IPC: Settings + Secrets -------------------- */
ipcMain.handle('settings:get', () => {
  return db.prepare('SELECT * FROM settings WHERE id=1').get()
})

ipcMain.handle('settings:update', (_e, payload: Settings) => {
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

ipcMain.handle('secrets:set', async (_e, { key, value }: { key: string; value: string }) => {
  await keytar.setPassword(SERVICE, key, value)
  return { ok: true }
})

ipcMain.handle('secrets:get', async (_e, key: string) => {
  const v = await keytar.getPassword(SERVICE, key)
  return v || null
})

/* -------------------- IPC: Gmail OAuth -------------------- */
ipcMain.handle('gmail:status', async () => {
  const raw = await keytar.getPassword(SERVICE, TOKENS_KEY)
  if (!raw) return { connected: false }

  try {
    const tokens = JSON.parse(raw)
    const auth = new google.auth.OAuth2()
    auth.setCredentials(tokens)
    const gmail = google.gmail({ version: 'v1', auth })
    const me = await gmail.users.getProfile({ userId: 'me' })
    return { connected: true, email: me.data.emailAddress || null }
  } catch (err: any) {
    return { connected: false, error: String(err?.message || err) }
  }
})

ipcMain.handle('gmail:connect', async () => {
  const clientId = await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_ID')
  const clientSecret = await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('Missing Gmail OAuth keys. Fill them in the Setup screen first.')
  }

  const port = await getPort({ port: 0 })
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`
  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'openid',
    'email',
    'profile',
  ]

  const state = randomUUID()
  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state,
  })

  await shell.openExternal(authUrl)

  return await new Promise<{ ok: true }>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        if (!req.url) return
        const u = new URL(req.url, `http://127.0.0.1:${port}`)
        if (u.pathname !== '/oauth2callback') {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        const code = u.searchParams.get('code')
        const rstate = u.searchParams.get('state')
        if (!code || rstate !== state) {
          res.statusCode = 400
          res.end('Invalid OAuth response')
          throw new Error('Invalid OAuth response')
        }

        const { tokens } = await auth.getToken(code)
        await keytar.setPassword(SERVICE, TOKENS_KEY, JSON.stringify(tokens))

        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html')
        res.end('<b>Gmail connected!</b> You can close this tab.')
        resolve({ ok: true })
      } catch (err) {
        reject(err)
      } finally {
        server.close()
      }
    })

    server.listen(port, () => console.log(`[gmail] callback listening on ${port}`))
  })
})

/* -------------------- App lifecycle -------------------- */
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



ipcMain.handle('gmail:status', async () => { /* ... */ })
ipcMain.handle('gmail:connect', async () => { /* ... */ })
ipcMain.handle('settings:get', /* ... */)
ipcMain.handle('settings:update', /* ... */)
ipcMain.handle('secrets:set', async (_e, { key, value }: { key: string; value: string }) => {
  await keytar.setPassword(SERVICE, key, value)
  return { ok: true }
})

ipcMain.handle('secrets:get', async (_e, key: string) => {
  const v = await keytar.getPassword(SERVICE, key)
  return v || null
})
