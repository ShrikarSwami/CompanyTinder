"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// electron/main.ts
const electron_1 = require("electron");
const path_1 = require("path");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const keytar_1 = __importDefault(require("keytar"));
const http_1 = __importDefault(require("http"));
const get_port_1 = __importDefault(require("get-port"));
const open_1 = __importDefault(require("open"));
const googleapis_1 = require("googleapis");
let win = null;
let db;
const SERVICE = 'CompanyTinder';
// ---------- DB ----------
function initDB() {
    const userData = electron_1.app.getPath('userData');
    db = new better_sqlite3_1.default((0, path_1.join)(userData, 'app.db'));
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
  `);
}
async function getOAuth2() {
    // Get client id/secret from keytar (you store them via Setup)
    const clientId = await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_ID');
    const clientSecret = await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
        throw new Error('Missing Gmail OAuth client id/secret (set in Setup).');
    }
    // For "Desktop" OAuth clients Google pre-approves 127.0.0.1 loopback; we pick a free port.
    const port = await (0, get_port_1.default)({ port: [51791, 51792, 51793] });
    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
    const oauth2 = new googleapis_1.google.auth.OAuth2({
        clientId,
        clientSecret,
        redirectUri,
    });
    return { oauth2, port };
}
async function loadSavedTokens(oauth2) {
    const raw = await keytar_1.default.getPassword(SERVICE, 'GMAIL_TOKENS');
    if (raw) {
        try {
            const tokens = JSON.parse(raw);
            oauth2.setCredentials(tokens);
            return true;
        }
        catch { }
    }
    return false;
}
async function saveTokens(tokens) {
    await keytar_1.default.setPassword(SERVICE, 'GMAIL_TOKENS', JSON.stringify(tokens ?? {}));
}
async function ensureAuth() {
    const { oauth2, port } = await getOAuth2();
    // if we already have refresh_token, we're good
    const had = await loadSavedTokens(oauth2);
    if (had) {
        try {
            const gmail = googleapis_1.google.gmail({ version: 'v1', auth: oauth2 });
            const me = await gmail.users.getProfile({ userId: 'me' });
            return { oauth2, email: me.data.emailAddress };
        }
        catch {
            // continue to re-auth if tokens are invalid
        }
    }
    // need to auth: start local server to capture code
    const scopes = [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
    ];
    const authUrl = oauth2.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: scopes,
    });
    // Local HTTP server that receives the redirect
    const codeP = new Promise((resolve, reject) => {
        const server = http_1.default.createServer(async (req, res) => {
            try {
                if (!req.url)
                    return;
                const u = new URL(req.url, `http://127.0.0.1:${port}`);
                if (u.pathname === '/oauth2callback') {
                    const code = u.searchParams.get('code');
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('<html><body>✅ Auth complete. You can close this window.</body></html>');
                    server.close();
                    if (code)
                        resolve(code);
                    else
                        reject(new Error('Missing code'));
                }
                else {
                    res.writeHead(404);
                    res.end();
                }
            }
            catch (e) {
                reject(e);
            }
        });
        server.listen(port);
    });
    // open default browser
    await (0, open_1.default)(authUrl);
    const code = await codeP;
    const { tokens } = await oauth2.getToken(code);
    await saveTokens(tokens);
    oauth2.setCredentials(tokens);
    const gmail = googleapis_1.google.gmail({ version: 'v1', auth: oauth2 });
    const me = await gmail.users.getProfile({ userId: 'me' });
    return { oauth2, email: me.data.emailAddress };
}
function mimeEncode(msg) {
    return Buffer.from(msg).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// ---------- Electron window ----------
async function createWindow() {
    win = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: (0, path_1.join)(__dirname, 'preload.js'), // dev build emits preload.js next to main.js
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    win.webContents.openDevTools({ mode: 'detach' });
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    await win.loadURL(devUrl);
}
// ---------- IPC: Settings / Secrets ----------
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
electron_1.ipcMain.handle('secrets:set', async (_e, { key, value }) => {
    await keytar_1.default.setPassword(SERVICE, key, value);
    return { ok: true };
});
electron_1.ipcMain.handle('secrets:get', async (_e, key) => {
    const v = await keytar_1.default.getPassword(SERVICE, key);
    return v || null;
});
// ---------- IPC: Gmail ----------
electron_1.ipcMain.handle('gmail:status', async () => {
    try {
        const { oauth2 } = await getOAuth2();
        const has = await loadSavedTokens(oauth2);
        if (!has)
            return { connected: false };
        const gmail = googleapis_1.google.gmail({ version: 'v1', auth: oauth2 });
        const me = await gmail.users.getProfile({ userId: 'me' });
        return { connected: !!me.data.emailAddress };
    }
    catch {
        return { connected: false };
    }
});
electron_1.ipcMain.handle('gmail:auth:start', async () => {
    await ensureAuth();
    return { ok: true };
});
electron_1.ipcMain.handle('gmail:profile', async () => {
    const { oauth2, email } = await ensureAuth();
    return { email };
});
electron_1.ipcMain.handle('gmail:send', async (_e, payload) => {
    const { oauth2 } = await ensureAuth();
    const gmail = googleapis_1.google.gmail({ version: 'v1', auth: oauth2 });
    const fromRow = db.prepare('SELECT sender_name, sender_email, bcc_list FROM settings WHERE id=1').get();
    const fromName = fromRow?.sender_name || '';
    const fromEmail = fromRow?.sender_email || '';
    const bcc = payload.bcc || fromRow?.bcc_list || '';
    const headers = [
        `From: ${fromName ? `"${fromName}" ` : ''}<${fromEmail}>`,
        `To: ${payload.to}`,
        bcc ? `Bcc: ${bcc}` : '',
        `Subject: ${payload.subject}`,
        'MIME-Version: 1.0',
        payload.html ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8',
        '',
    ].filter(Boolean);
    const body = payload.html ?? (payload.text || '');
    const raw = mimeEncode([...headers, body].join('\r\n'));
    const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
    });
    return { id: res.data.id };
});
// ---------- App lifecycle ----------
electron_1.app.whenReady().then(() => {
    initDB();
    createWindow();
});
electron_1.app.on('window-all-closed', () => { if (process.platform !== 'darwin')
    electron_1.app.quit(); });
electron_1.app.on('activate', () => { if (electron_1.BrowserWindow.getAllWindows().length === 0)
    createWindow(); });
