// electron/main.ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import keytar from 'keytar'
import getPort from 'get-port'
import open from 'open'
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

  // devtools visible in dev so you can test APIs from the Console
  win.webContents.openDevTools({ mode: 'detach' })

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
  if (devUrl) {
    await win.loadURL(devUrl)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/* ----------------------------- Settings IPC ----------------------------- */
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

/* ------------------------------ Secrets IPC ----------------------------- */
ipcMain.handle('secrets:set', async (_e, { key, value }) => {
  await keytar.setPassword(SERVICE, key, value)
  return { ok: true }
})
ipcMain.handle('secrets:get', async (_e, key: string) => {
  const v = await keytar.getPassword(SERVICE, key)
  return v || null
})

/* ------------------------------ Gmail OAuth ----------------------------- */
// Read client id/secret from keychain keys you enter in Setup:
//  - GMAIL_CLIENT_ID
//  - GMAIL_CLIENT_SECRET
async function getClientSecrets() {
  const clientId = await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_ID')
  const clientSecret = await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET in keychain.')
  }
  return { clientId, clientSecret }
}

async function loadTokens() {
  const raw = await keytar.getPassword(SERVICE, TOKENS_KEY)
  return raw ? JSON.parse(raw) : null
}
async function saveTokens(tokens: any) {
  await keytar.setPassword(SERVICE, TOKENS_KEY, JSON.stringify(tokens))
}

// Check if we already have tokens; if so, confirm email
ipcMain.handle('gmail:status', async () => {
  try {
    const tokens = await loadTokens()
    if (!tokens) return { connected: false }
    const { clientId, clientSecret } = await getClientSecrets()
    const oAuth = new google.auth.OAuth2({ clientId, clientSecret })
    oAuth.setCredentials(tokens)
    const gmail = google.gmail({ version: 'v1', auth: oAuth })
    const prof = await gmail.users.getProfile({ userId: 'me' })
    return { connected: true, email: prof.data.emailAddress }
  } catch (err: any) {
    return { connected: false, error: err?.message || String(err) }
  }
})

// Launch consent in the browser, receive the code on a local port,
// exchange for tokens, save them, and return the email.
ipcMain.handle('gmail:connect', async () => {
  const { clientId, clientSecret } = await getClientSecrets()
  const port = await getPort({ port: [...Array(101)].map((_, i) => 53100 + i) })
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`
  const oAuth = new google.auth.OAuth2({ clientId, clientSecret, redirectUri })
  const scopes = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
  ]
  const url = oAuth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state: randomUUID(),
  })

  const result = await new Promise<{ ok: boolean; email?: string }>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith('/oauth2callback')) {
          res.statusCode = 404
          return res.end('Not found')
        }
        const full = new URL(req.url, `http://127.0.0.1:${port}`)
        const code = full.searchParams.get('code')
        if (!code) throw new Error('No code')

        const { tokens } = await oAuth.getToken(code)
        oAuth.setCredentials(tokens)
        await saveTokens(tokens)

        const oauth2 = google.oauth2({ version: 'v2', auth: oAuth })
        const me = await oauth2.userinfo.get()

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<h3>✅ Gmail connected. You can close this window.</h3>')

        resolve({ ok: true, email: me.data.email || undefined })
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' })
        res.end('<h3>❌ Gmail connect failed. Check the app console.</h3>')
        reject(err)
      } finally {
        server.close()
        win?.focus()
      }
    })
    server.listen(port, '127.0.0.1')
    // open the consent URL in the default browser
    open(url).catch(reject)
    // safety timeout
    setTimeout(() => reject(new Error('OAuth timed out')), 5 * 60 * 1000)
  })

  return result
})

/* --------------------------------- Boot -------------------------------- */
app.whenReady().then(() => {
  initDB()
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
