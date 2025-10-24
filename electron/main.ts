// electron/main.ts
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import keytar from 'keytar'
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
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Helpful while developing
  win.webContents.openDevTools({ mode: 'detach' })

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
  if (devUrl) {
    await win.loadURL(devUrl)
  } else {
    await win.loadFile(join(process.cwd(), 'index.html'))
  }
}

/* -------------------- Settings (SQLite) -------------------- */
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

/* -------------------- Secrets (Keytar) -------------------- */
ipcMain.handle('secrets:set', async (_e, { key, value }: { key: string; value: string }) => {
  await keytar.setPassword(SERVICE, key, value)
  return { ok: true }
})

ipcMain.handle('secrets:get', async (_e, key: string) => {
  const v = await keytar.getPassword(SERVICE, key)
  return v || null
})

/* -------------------- Gmail OAuth helpers -------------------- */
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
]

async function getOAuth2Client(redirectUri?: string) {
  const clientId = await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_ID')
  const clientSecret = await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('Missing Gmail OAuth Client ID/Secret. Add them in Setup.')
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

async function readStoredTokens() {
  const raw = await keytar.getPassword(SERVICE, TOKENS_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/* -------------------- Gmail IPC -------------------- */
ipcMain.handle('gmail:status', async () => {
  const tokens = await readStoredTokens()
  if (!tokens) return { connected: false }

  try {
    const oauth2 = await getOAuth2Client()
    oauth2.setCredentials(tokens)
    const me = await google.oauth2({ version: 'v2', auth: oauth2 }).userinfo.get()
    return { connected: true, email: me.data.email ?? null }
  } catch {
    return { connected: false }
  }
})

ipcMain.handle('gmail:disconnect', async () => {
  await keytar.deletePassword(SERVICE, TOKENS_KEY)
  return { ok: true }
})

ipcMain.handle('gmail:connect', async () => {
  // pick a free localhost port for the loopback redirect
  const port = await getPort({ port: 43117 })
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`
  const state = randomUUID()

  const oauth2 = await getOAuth2Client(redirectUri)
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  })

  return await new Promise<{ ok: boolean; email?: string | null }>((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        if (!req.url) return
        const u = new URL(req.url, redirectUri)
        if (u.pathname !== '/oauth2callback') {
          res.writeHead(404).end()
          return
        }

        const returnedState = u.searchParams.get('state')
        const code = u.searchParams.get('code')
        if (!code || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Invalid OAuth response. You can close this tab.')
          resolve({ ok: false })
          server.close()
          return
        }

        const { tokens } = await oauth2.getToken(code)
        oauth2.setCredentials(tokens)
        await keytar.setPassword(SERVICE, TOKENS_KEY, JSON.stringify(tokens))

        let email: string | null | undefined = undefined
        try {
          const me = await google.oauth2({ version: 'v2', auth: oauth2 }).userinfo.get()
          email = me.data.email ?? null
        } catch {
          /* ignore */
        }

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body>✅ Gmail connected! You can close this tab.</body></html>')
        resolve({ ok: true, email })
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('OAuth failed. You can close this tab.')
        resolve({ ok: false })
      } finally {
        server.close()
      }
    })

    server.listen(port, '127.0.0.1', async () => {
      // Open the user's default browser to consent screen
      await shell.openExternal(authUrl)
    })
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
