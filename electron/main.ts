// electron/main.ts
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import BetterSqlite3 from 'better-sqlite3'
import type { Database as BetterDb } from 'better-sqlite3'

import keytar from 'keytar'
import open from 'open'
import getPort from 'get-port'
import { google } from 'googleapis'

let win: BrowserWindow | null = null
let db: BetterDb

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

/* ---------- DB ---------- */
function initDB() {
  const userData = app.getPath('userData')
  db = new BetterSqlite3(join(userData, 'app.db'))
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

    CREATE TABLE IF NOT EXISTS sends(
      id TEXT,
      ts INTEGER
    );
  `)
}
function startOfLocalDayMs() { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() }
function sentCountToday(): number {
  const since = startOfLocalDayMs()
  const row = db.prepare('SELECT COUNT(*) AS n FROM sends WHERE ts >= ?').get(since) as { n: number }
  return row?.n ?? 0
}
function recordSend(id: string) {
  db.prepare('INSERT INTO sends (id, ts) VALUES (?, ?)').run(id, Date.now())
}

/* ---------- Window ---------- */
async function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // NOTE: in prod, __dirname === dist-electron/electron
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.openDevTools({ mode: 'detach' })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    await win.loadURL(devUrl)
  } else {
    const indexHtml = join(process.cwd(), 'dist', 'index.html')
    console.log('[main] loading:', indexHtml) // <- sanity log
    await win.loadFile(indexHtml)
  }
}

/* ---------- Settings ---------- */
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

/* ---------- Secrets ---------- */
ipcMain.handle('secrets:set', async (_e, { key, value }: { key: string; value: string }) => {
  await keytar.setPassword(SERVICE, key, value)
  return { ok: true }
})
ipcMain.handle('secrets:get', async (_e, key: string) => {
  const v = await keytar.getPassword(SERVICE, key)
  return v || null
})

/* ---------- Gmail helpers ---------- */
function newOAuth2(clientId: string, clientSecret: string, redirectUri: string) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}
async function fetchGmailProfile(oauth2: InstanceType<typeof google.auth.OAuth2>) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2 })
  const res = await gmail.users.getProfile({ userId: 'me' })
  return res.data.emailAddress ?? undefined
}
function buildRawEmail({
  from, to, subject, text, bcc,
}: { from: string; to: string; subject: string; text: string; bcc?: string }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    bcc ? `Bcc: ${bcc}` : null,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text || '',
  ].filter(Boolean) as string[]
  return Buffer.from(lines.join('\r\n')).toString('base64url')
}

/* ---------- Gmail status/connect ---------- */
ipcMain.handle('gmail:status', async () => {
  try {
    const raw = await keytar.getPassword(SERVICE, TOKENS_KEY)
    if (!raw) return { connected: false }
    const tokens = JSON.parse(raw)
    const clientId = (await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_ID')) ?? ''
    const clientSecret = (await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET')) ?? ''
    const oauth2 = newOAuth2(clientId, clientSecret, 'http://127.0.0.1')
    oauth2.setCredentials(tokens)
    const email = await fetchGmailProfile(oauth2)
    return { connected: true, email: email ?? undefined }
  } catch (err: any) {
    console.warn('[gmail:status] failed:', err?.message || err)
    return { connected: false, error: String(err?.message || err) }
  }
})

ipcMain.handle('gmail:connect', async () => {
  const clientId = await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_ID')
  const clientSecret = await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Missing Gmail OAuth Client ID/Secret. Open Setup and save them first.')

  const port = await getPort()
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`
  const oauth2 = newOAuth2(clientId, clientSecret, redirectUri)

  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/userinfo.email',
  ]
  const state = randomUUID()
  const authUrl = oauth2.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: scopes, state })

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

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`<html><body style="font-family: ui-sans-serif; padding: 24px">
            <h2>✅ Gmail connected</h2>
            <p>You can close this window and return to CompanyTinder.</p>
          </body></html>`)

          resolve({ ok: true, email })
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
      open(authUrl).catch((e) => { console.error('Failed to open browser:', e); shell.openExternal(authUrl).catch(() => {}) })
    })
  })

  return result
})

/* ---------- Gmail send + quota ---------- */
ipcMain.handle('gmail:send', async (_e, payload: { to: string; subject: string; text: string; bcc?: string }) => {
  try {
    const s = db.prepare<[], Settings>('SELECT * FROM settings WHERE id=1').get()
    if (!s || !s.sender_email) return { ok: false, error: 'Sender email not set. Open Setup and save your profile.' }

    const cap = Number(s.daily_cap ?? 25)
    const used = sentCountToday()
    if (used >= cap) return { ok: false, error: `Daily cap reached (${used}/${cap}). Try again tomorrow.` }

    const rawTokens = await keytar.getPassword(SERVICE, TOKENS_KEY)
    if (!rawTokens) return { ok: false, error: 'Not connected to Gmail yet.' }
    const tokens = JSON.parse(rawTokens)

    const clientId = (await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_ID')) ?? ''
    const clientSecret = (await keytar.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET')) ?? ''
    const oauth2 = newOAuth2(clientId, clientSecret, 'http://127.0.0.1')
    oauth2.setCredentials(tokens)

    const rawMime = buildRawEmail({
      from: s.sender_email,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      bcc: payload.bcc,
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2 })
    const sendRes = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: rawMime } })

    const id = sendRes.data.id || randomUUID()
    recordSend(id)
    return { ok: true, id, remaining: Math.max(0, cap - (used + 1)), cap }
  } catch (err: any) {
    console.error('[gmail:send] error:', err)
    return { ok: false, error: String(err?.message || err) }
  }
})

ipcMain.handle('gmail:quota', () => {
  const s = db.prepare<[], Settings>('SELECT daily_cap FROM settings WHERE id=1').get()
  const cap = Number(s?.daily_cap ?? 25)
  const used = sentCountToday()
  return { used, cap, remaining: Math.max(0, cap - used) }
})

/* ---------- App lifecycle ---------- */
app.whenReady().then(() => { initDB(); createWindow() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
