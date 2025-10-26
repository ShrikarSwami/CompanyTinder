import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import keytar from 'keytar'
import open from 'open'
import getPort from 'get-port'
import { google } from 'googleapis'

// Initialize the database and the window
let win: BrowserWindow | null = null
let db: Database.Database

const SERVICE = 'CompanyTinder'
const TOKENS_KEY = 'GMAIL_TOKENS' // stored in keychain as JSON

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

// Creates the browser window
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

  // Open DevTools in development
  win.webContents.openDevTools({ mode: 'detach' })

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
  if (devUrl) {
    await win.loadURL(devUrl)  // In Dev Mode, load from Vite dev server
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))  // In production, load from the built file
  }
}

/* ---------------------- IPC: Settings (SQLite) ---------------------- */
ipcMain.handle('settings:get', () => {
  return db.prepare<[], Settings>('SELECT * FROM settings WHERE id=1').get()
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

/* ---------------------- IPC: Secrets (Keytar) ----------------------- */
ipcMain.handle('secrets:set', async (_e, { key, value }: { key: string; value: string }) => {
  await keytar.setPassword(SERVICE, key, value)
  return { ok: true }
})

ipcMain.handle('secrets:get', async (_e, key: string) => {
  const v = await keytar.getPassword(SERVICE, key)
  return v || null
})

/* ---------------------- Gmail OAuth helpers ------------------------- */

function newOAuth2(clientId: string, clientSecret: string, redirectUri: string) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

async function fetchGmailProfile(oauth2: InstanceType<typeof google.auth.OAuth2>) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2 })
  const res = await gmail.users.getProfile({ userId: 'me' })
  // coerce null -> undefined so callers only see string | undefined
  return res.data.emailAddress ?? undefined
}

/* ---------------------- IPC: Gmail ------------------------- */

/** Return connection status + email (if tokens exist & are valid) */
ipcMain.handle('gmail:status', async () => {
  try {
    const raw = await keytar.getPassword(SERVICE, TOKENS_KEY)
    if (!raw) return { connected: false }

    const tokens = JSON.parse(raw)
    const clientId = (await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_ID')) ?? ''
    const clientSecret = (await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET')) ?? ''
    const oauth2 = newOAuth2(clientId, clientSecret, 'http://127.0.0.1') // dummy
    oauth2.setCredentials(tokens)

    const email = await fetchGmailProfile(oauth2)
    return { connected: true, email: email ?? undefined } 
  } catch (err: any) {
    console.warn('[gmail:status] failed:', err?.message || err)
    return { connected: false, error: String(err?.message || err) }
  }
})

/** Run local-server OAuth flow, store tokens in Keychain */
ipcMain.handle('gmail:connect', async () => {
  const clientId = await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_ID')
  const clientSecret = await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('Missing Gmail OAuth Client ID/Secret. Open Setup and save them first.')
  }

  const port = 3820;
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const oauth2 = newOAuth2(clientId, clientSecret, redirectUri)

  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/userinfo.email'
  ]

  const state = randomUUID()
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state
  })

  const result = await new Promise<{ ok: boolean; email?: string }>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        if (!req.url) return
        if (req.url.startsWith('/oauth2callback')) {
          const url = new URL(req.url, `http://127.0.0.1:${port}`)
          const code = url.searchParams.get('code')
          const returnedState = url.searchParams.get('state')
          if (!code || returnedState !== state) throw new Error('Invalid OAuth response')

          const { tokens } = await oauth2.getToken(code)
          oauth2.setCredentials(tokens)

          await keytar.setPassword(SERVICE, TOKENS_KEY, JSON.stringify(tokens))

          const email = (await fetchGmailProfile(oauth2)) ?? undefined
          resolve({ ok: true, email })

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`<html><body style="font-family: ui-sans-serif; padding: 24px">
            <h2>✅ Gmail connected</h2>
            <p>You can close this window and return to CompanyTinder.</p>
          </body></html>`)

          setTimeout(() => server.close(), 100)
        } else {
          res.writeHead(404); res.end()
        }
      } catch (err: any) {
        console.error('[gmail:connect] callback error:', err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('OAuth failed. Check CompanyTinder console.')
        reject(err)
      }
    })

    server.listen(port, () => {
      open(authUrl).catch((e) => {
        console.error('Failed to open browser:', e)
        shell.openExternal(authUrl).catch(() => {})
      })
    })
  })

  return result
})

/* ---------------------- App lifecycle ---------------------- */
app.whenReady().then(() => {
  initDB()
  createWindow()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

  // --- Gmail helpers (below newOAuth2 / fetchGmailProfile) ---
async function getAuthedGmail() {
  const clientId = await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_ID')
  const clientSecret = await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET')
  const rawTokens = await keytar.getPassword(SERVICE, TOKENS_KEY)

  if (!clientId || !clientSecret || !rawTokens) {
    throw new Error('Missing Gmail credentials/tokens. Connect Gmail first.')
  }

  const oauth2 = newOAuth2(clientId, clientSecret, 'http://127.0.0.1')
  oauth2.setCredentials(JSON.parse(rawTokens))
  const gmail = google.gmail({ version: 'v1', auth: oauth2 })
  return { gmail }
}

function toBase64Url(input: string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

// Compose + send a plain-text email (optionally with BCC)
ipcMain.handle('gmail:send', async (_e, payload: {
  to: string
  subject: string
  text: string
  bcc?: string
}) => {
  const { to, subject, text, bcc } = payload
  if (!to || !subject) throw new Error('Missing "to" or "subject"')

  const { gmail } = await getAuthedGmail()

  const headers = [
    `To: ${to}`,
    bcc ? `Bcc: ${bcc}` : null,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '', // blank line before body
    text || ''
  ].filter(Boolean).join('\r\n')

  const raw = toBase64Url(headers)

  const res = await gmail.users!.messages!.send({
    userId: 'me',
    requestBody: { raw }
  })

  return { ok: true, id: res.data.id || null }
})
