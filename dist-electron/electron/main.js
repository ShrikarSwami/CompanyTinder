"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// electron/main.ts
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
const TOKENS_KEY = 'GMAIL_TOKENS'; // stored in keychain as JSON
/* ---------------------- DB init ---------------------- */
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

    -- NEW: record each successful Gmail send
    CREATE TABLE IF NOT EXISTS sends(
      id TEXT,      -- Gmail message id
      ts INTEGER    -- unix ms timestamp
    );
  `);
}
function startOfLocalDayMs() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}
function sentCountToday() {
    const since = startOfLocalDayMs();
    const row = db.prepare('SELECT COUNT(*) AS n FROM sends WHERE ts >= ?').get(since);
    return row?.n ?? 0;
}
/* ---------------------- Window ---------------------- */
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
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    if (devUrl) {
        await win.loadURL(devUrl);
    }
    else {
        await win.loadFile((0, node_path_1.join)(__dirname, '../renderer/index.html'));
    }
}
/* ---------------------- Settings (SQLite) ---------------------- */
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
/* ---------------------- Secrets (Keytar) ----------------------- */
electron_1.ipcMain.handle('secrets:set', async (_e, { key, value }) => {
    await keytar_1.default.setPassword(SERVICE, key, value);
    return { ok: true };
});
electron_1.ipcMain.handle('secrets:get', async (_e, key) => {
    const v = await keytar_1.default.getPassword(SERVICE, key);
    return v || null;
});
/* ---------------------- Gmail helpers ------------------------- */
function newOAuth2(clientId, clientSecret, redirectUri) {
    return new googleapis_1.google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
async function fetchGmailProfile(oauth2) {
    const gmail = googleapis_1.google.gmail({ version: 'v1', auth: oauth2 });
    const res = await gmail.users.getProfile({ userId: 'me' });
    return res.data.emailAddress ?? undefined;
}
function base64UrlEncode(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}
function buildRawEmail({ from, to, subject, text, bcc }) {
    const headers = [
        `From: ${from}`,
        `To: ${to}`,
        bcc ? `Bcc: ${bcc}` : null,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        text || ''
    ].filter(Boolean);
    return base64UrlEncode(headers.join('\r\n'));
}
/* ---------------------- IPC: Gmail status/connect ------------------------- */
electron_1.ipcMain.handle('gmail:status', async () => {
    try {
        const raw = await keytar_1.default.getPassword(SERVICE, TOKENS_KEY);
        if (!raw)
            return { connected: false };
        const tokens = JSON.parse(raw);
        const clientId = (await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_ID')) ?? '';
        const clientSecret = (await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET')) ?? '';
        const oauth2 = newOAuth2(clientId, clientSecret, 'http://127.0.0.1'); // dummy
        oauth2.setCredentials(tokens);
        const email = await fetchGmailProfile(oauth2);
        return { connected: true, email: email ?? undefined };
    }
    catch (err) {
        console.warn('[gmail:status] failed:', err?.message || err);
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
    const scopes = [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/userinfo.email'
    ];
    const state = (0, node_crypto_1.randomUUID)();
    const authUrl = oauth2.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: scopes,
        state
    });
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
                    const email = (await fetchGmailProfile(oauth2)) ?? undefined;
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`<html><body style="font-family: ui-sans-serif; padding: 24px">
            <h2>✅ Gmail connected</h2>
            <p>You can close this window and return to CompanyTinder.</p>
          </body></html>`);
                    resolve({ ok: true, email });
                    setTimeout(() => server.close(), 100);
                }
                else {
                    res.writeHead(404);
                    res.end();
                }
            }
            catch (err) {
                console.error('[gmail:connect] callback error:', err);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('OAuth failed. Check CompanyTinder console.');
                reject(err);
            }
        });
        server.listen(port, () => {
            (0, open_1.default)(authUrl).catch((e) => {
                console.error('Failed to open browser:', e);
                electron_1.shell.openExternal(authUrl).catch(() => { });
            });
        });
    });
    return result;
});
/* ---------------------- IPC: Gmail send + quota ---------------------- */
electron_1.ipcMain.handle('gmail:send', async (_e, payload) => {
    try {
        const s = db.prepare('SELECT * FROM settings WHERE id=1').get();
        const cap = Number(s?.daily_cap ?? 25);
        const used = sentCountToday();
        if (used >= cap) {
            return { ok: false, error: `Daily cap reached (${used}/${cap}). Try again tomorrow.` };
        }
        // tokens & client
        const raw = await keytar_1.default.getPassword(SERVICE, TOKENS_KEY);
        if (!raw)
            return { ok: false, error: 'Not connected to Gmail yet.' };
        const tokens = JSON.parse(raw);
        const clientId = (await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_ID')) ?? '';
        const clientSecret = (await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET')) ?? '';
        const oauth2 = newOAuth2(clientId, clientSecret, 'http://127.0.0.1'); // dummy
        oauth2.setCredentials(tokens);
        // build & send
        const gmail = googleapis_1.google.gmail({ version: 'v1', auth: oauth2 });
        const rawEmail = buildRawEmail({
            from: s.sender_email,
            to: payload.to,
            subject: payload.subject,
            text: payload.text,
            bcc: payload.bcc
        });
        const sendRes = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: rawEmail }
        });
        const messageId = sendRes.data.id || '';
        if (messageId)
            db.prepare('INSERT INTO sends(id, ts) VALUES(?, ?)').run(messageId, Date.now());
        const remaining = Math.max(0, cap - sentCountToday());
        return { ok: true, id: messageId, remaining, cap };
    }
    catch (err) {
        console.error('[gmail:send] failed:', err);
        return { ok: false, error: String(err?.message || err) };
    }
});
electron_1.ipcMain.handle('gmail:quota', () => {
    const s = db.prepare('SELECT daily_cap FROM settings WHERE id=1').get();
    const cap = Number(s?.daily_cap ?? 25);
    const used = sentCountToday();
    return { used, cap, remaining: Math.max(0, cap - used) };
});
/* ---------------------- App lifecycle ---------------------- */
electron_1.app.whenReady().then(() => {
    initDB();
    createWindow();
});
electron_1.app.on('window-all-closed', () => { if (process.platform !== 'darwin')
    electron_1.app.quit(); });
electron_1.app.on('activate', () => { if (electron_1.BrowserWindow.getAllWindows().length === 0)
    createWindow(); });
