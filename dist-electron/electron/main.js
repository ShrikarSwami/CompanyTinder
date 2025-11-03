"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_http_1 = require("node:http");
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const keytar_1 = __importDefault(require("keytar"));
const open_1 = __importDefault(require("open"));
const get_port_1 = __importDefault(require("get-port"));
const googleapis_1 = require("googleapis");
let win = null;
let db;
const SERVICE = 'CompanyTinder';
const TOKENS_KEY = 'GMAIL_TOKENS';
/* ---------------- DB ---------------- */
function initDB() {
    const userData = electron_1.app.getPath('userData');
    db = new better_sqlite3_1.default((0, node_path_1.join)(userData, 'app.db'));
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

    CREATE TABLE IF NOT EXISTS sends(
      id TEXT,
      ts INTEGER
    );

    CREATE TABLE IF NOT EXISTS companies(
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT,
      link TEXT,
      source TEXT,
      note TEXT,             -- stay consistent with code using "note"
      liked INTEGER DEFAULT 0,
      created_at INTEGER
    );
  `);
}
function startOfLocalDayMs() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
function sentCountToday() { return db.prepare('SELECT COUNT(*) n FROM sends WHERE ts >= ?').get(startOfLocalDayMs())?.n ?? 0; }
function recordSend(id) { db.prepare('INSERT INTO sends(id, ts) VALUES(?, ?)').run(id, Date.now()); }
/* -------------- Window -------------- */
async function createWindow() {
    win = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: (0, node_path_1.join)(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    win.webContents.openDevTools({ mode: 'detach' });
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl) {
        await win.loadURL(devUrl);
    }
    else {
        await win.loadFile((0, node_path_1.join)(process.cwd(), 'dist', 'index.html'));
    }
}
/* -------- Settings IPC (SQLite) ----- */
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
/* --------- Secrets IPC (keytar) ----- */
electron_1.ipcMain.handle('secrets:set', async (_e, { key, value }) => {
    await keytar_1.default.setPassword(SERVICE, key, value);
    return { ok: true };
});
electron_1.ipcMain.handle('secrets:get', async (_e, key) => {
    const v = await keytar_1.default.getPassword(SERVICE, key);
    return v || null;
});
/* -------------- Gmail helpers -------------- */
function newOAuth2(clientId, clientSecret, redirectUri) {
    return new googleapis_1.google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
async function fetchGmailProfile(oauth2) {
    const gmail = googleapis_1.google.gmail({ version: 'v1', auth: oauth2 });
    const res = await gmail.users.getProfile({ userId: 'me' });
    return res.data.emailAddress ?? undefined;
}
function buildRawEmail({ from, to, subject, text, bcc }) {
    const lines = [
        `From: ${from}`,
        `To: ${to}`,
        bcc ? `Bcc: ${bcc}` : null,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        text || ''
    ].filter(Boolean);
    return Buffer.from(lines.join('\r\n')).toString('base64url');
}
/* -------- Gmail: status/connect -------- */
electron_1.ipcMain.handle('gmail:status', async () => {
    try {
        const raw = await keytar_1.default.getPassword(SERVICE, TOKENS_KEY);
        if (!raw)
            return { connected: false };
        const tokens = JSON.parse(raw);
        const clientId = (await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_ID')) ?? '';
        const clientSecret = (await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET')) ?? '';
        const oauth2 = newOAuth2(clientId, clientSecret, 'http://127.0.0.1');
        oauth2.setCredentials(tokens);
        const email = await fetchGmailProfile(oauth2);
        return { connected: true, email: email ?? undefined };
    }
    catch (err) {
        return { connected: false, error: String(err?.message || err) };
    }
});
electron_1.ipcMain.handle('gmail:connect', async () => {
    const clientId = await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_ID');
    const clientSecret = await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET');
    if (!clientId || !clientSecret)
        throw new Error('Missing Gmail OAuth Client ID/Secret. Open Setup and save them first.');
    const port = await (0, get_port_1.default)();
    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
    const oauth2 = newOAuth2(clientId, clientSecret, redirectUri);
    const state = (0, node_crypto_1.randomUUID)();
    const scopes = [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/userinfo.email'
    ];
    const authUrl = oauth2.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: scopes, state });
    const result = await new Promise((resolve, reject) => {
        const server = (0, node_http_1.createServer)(async (req, res) => {
            try {
                if (!req.url)
                    return;
                if (req.url.startsWith('/oauth2callback')) {
                    const url = new URL(req.url, `http://127.0.0.1:${port}`);
                    const code = url.searchParams.get('code');
                    const returnedState = url.searchParams.get('state');
                    if (!code || returnedState !== state)
                        throw new Error('Invalid OAuth response');
                    const { tokens } = await oauth2.getToken(code);
                    oauth2.setCredentials(tokens);
                    await keytar_1.default.setPassword(SERVICE, TOKENS_KEY, JSON.stringify(tokens));
                    const email = await fetchGmailProfile(oauth2);
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end('<html><body style="font-family: ui-sans-serif; padding: 24px"><h2>✅ Gmail connected</h2><p>You can close this window and return to CompanyTinder.</p></body></html>');
                    resolve({ ok: true, email: email ?? undefined });
                    setTimeout(() => server.close(), 100);
                }
                else {
                    res.writeHead(404);
                    res.end();
                }
            }
            catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('OAuth failed. Check CompanyTinder console.');
                reject(err);
            }
        });
        server.listen(port, () => {
            (0, open_1.default)(authUrl).catch(() => electron_1.shell.openExternal(authUrl).catch(() => { }));
        });
    });
    return result;
});
/* -------- Gmail: send + quota -------- */
electron_1.ipcMain.handle('gmail:send', async (_e, payload) => {
    try {
        const s = db.prepare('SELECT * FROM settings WHERE id=1').get();
        if (!s || !s.sender_email)
            return { ok: false, error: 'Sender email not set. Open Setup and save your profile first.' };
        const cap = Number(s.daily_cap ?? 25);
        const used = sentCountToday();
        if (used >= cap)
            return { ok: false, error: `Daily cap reached (${used}/${cap}). Try again tomorrow.` };
        const raw = await keytar_1.default.getPassword(SERVICE, TOKENS_KEY);
        if (!raw)
            return { ok: false, error: 'Not connected to Gmail yet.' };
        const tokens = JSON.parse(raw);
        const clientId = (await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_ID')) ?? '';
        const clientSecret = (await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET')) ?? '';
        const oauth2 = newOAuth2(clientId, clientSecret, 'http://127.0.0.1');
        oauth2.setCredentials(tokens);
        const rawMime = buildRawEmail({ from: s.sender_email, to: payload.to, subject: payload.subject, text: payload.text, bcc: payload.bcc });
        const gmail = googleapis_1.google.gmail({ version: 'v1', auth: oauth2 });
        const sendRes = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: rawMime } });
        const id = sendRes.data.id || (0, node_crypto_1.randomUUID)();
        recordSend(id);
        return { ok: true, id, remaining: Math.max(0, cap - (used + 1)), cap };
    }
    catch (err) {
        return { ok: false, error: String(err?.message || err) };
    }
});
electron_1.ipcMain.handle('gmail:quota', () => {
    const s = db.prepare('SELECT daily_cap FROM settings WHERE id=1').get();
    const cap = Number(s?.daily_cap ?? 25);
    const used = sentCountToday();
    return { used, cap, remaining: Math.max(0, cap - used) };
});
function domainFromUrl(u) {
    try {
        return new URL(u).hostname.replace(/^www\./, '');
    }
    catch {
        return '';
    }
}
electron_1.ipcMain.handle('companies:add', (_e, c) => {
    const id = c.id ?? (0, node_crypto_1.randomUUID)();
    const domain = domainFromUrl(c.link);
    db.prepare(`
    INSERT OR REPLACE INTO companies(id, name, domain, link, source, note, created_at)
    VALUES (@id, @name, @domain, @link, 'google', @note, @created_at)
  `).run({ id, name: c.name, domain, link: c.link, note: c.note ?? '', created_at: Date.now() });
    return { ok: true, id };
});
electron_1.ipcMain.handle('companies:list', () => {
    const rows = db.prepare(`SELECT id, name, domain, link, note, created_at FROM companies ORDER BY created_at DESC LIMIT 200`).all();
    return { ok: true, items: rows };
});
electron_1.ipcMain.handle('search:google', async (_e, q) => {
    try {
        const key = await keytar_1.default.getPassword(SERVICE, 'GOOGLE_API_KEY');
        if (!key)
            return { ok: false, error: 'Missing GOOGLE_API_KEY in Setup.' };
        // TODO: put your Custom Search Engine ID in Keychain too, or hardcode to start:
        const cx = (await keytar_1.default.getPassword(SERVICE, 'GOOGLE_CSE_CX')) ?? 'PUT_YOUR_CX_HERE';
        if (!cx || cx === 'PUT_YOUR_CX_HERE')
            return { ok: false, error: 'Missing Google CSE CX (add via Setup).' };
        const url = new URL('https://www.googleapis.com/customsearch/v1');
        url.searchParams.set('key', key);
        url.searchParams.set('cx', cx);
        url.searchParams.set('q', q);
        url.searchParams.set('num', '10');
        const resp = await fetch(url.toString());
        if (!resp.ok)
            return { ok: false, error: `Google API ${resp.status}` };
        const data = await resp.json();
        const items = (data.items ?? []).map((it) => ({
            title: it.title,
            link: it.link,
            domain: domainFromUrl(it.link),
            snippet: (it.snippet || ''),
        }));
        return { ok: true, items };
    }
    catch (e) {
        console.error('[search:google] error', e);
        return { ok: false, error: String(e?.message || e) };
    }
});
// LIKE: update companies.liked by domain
electron_1.ipcMain.handle('companies:like', (_e, { domain, v }) => {
    const upd = db.prepare('UPDATE companies SET liked = ? WHERE domain = ?');
    const res = upd.run(v, domain);
    if (!res.changes) {
        // if the row doesn't exist yet, insert a minimal shell so like is stored
        db.prepare(`
      INSERT INTO companies (id, name, domain, link, source, note, created_at, liked)
      VALUES (@id, @name, @domain, '', 'manual', '', @ts, @liked)
      ON CONFLICT(id) DO NOTHING
    `).run({
            id: (0, node_crypto_1.randomUUID)(),
            name: domain,
            domain,
            ts: Date.now(),
            liked: v
        });
    }
    return { ok: true };
});
/* ---------- lifecycle ---------- */
electron_1.app.whenReady().then(() => { initDB(); createWindow(); });
electron_1.app.on('window-all-closed', () => { if (process.platform !== 'darwin')
    electron_1.app.quit(); });
electron_1.app.on('activate', () => { if (electron_1.BrowserWindow.getAllWindows().length === 0)
    createWindow(); });
