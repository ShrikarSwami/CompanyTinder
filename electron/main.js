"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// electron/main.ts
const electron_1 = require("electron");
const path_1 = require("path");
const node_http_1 = __importDefault(require("node:http"));
const node_crypto_1 = require("node:crypto");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const keytar_1 = __importDefault(require("keytar"));
const get_port_1 = __importDefault(require("get-port"));
const open_1 = __importDefault(require("open"));
const googleapis_1 = require("googleapis");
let win = null;
let db;
const SERVICE = 'CompanyTinder';
const TOKENS_KEY = 'GMAIL_TOKENS';
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
async function createWindow() {
    win = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: (0, path_1.join)(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    // devtools visible in dev so you can test APIs from the Console
    win.webContents.openDevTools({ mode: 'detach' });
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    if (devUrl) {
        await win.loadURL(devUrl);
    }
    else {
        await win.loadFile((0, path_1.join)(__dirname, '../renderer/index.html'));
    }
}
/* ----------------------------- Settings IPC ----------------------------- */
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
/* ------------------------------ Secrets IPC ----------------------------- */
electron_1.ipcMain.handle('secrets:set', async (_e, { key, value }) => {
    await keytar_1.default.setPassword(SERVICE, key, value);
    return { ok: true };
});
electron_1.ipcMain.handle('secrets:get', async (_e, key) => {
    const v = await keytar_1.default.getPassword(SERVICE, key);
    return v || null;
});
/* ------------------------------ Gmail OAuth ----------------------------- */
// Read client id/secret from keychain keys you enter in Setup:
//  - GMAIL_CLIENT_ID
//  - GMAIL_CLIENT_SECRET
async function getClientSecrets() {
    const clientId = await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_ID');
    const clientSecret = await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
        throw new Error('Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET in keychain.');
    }
    return { clientId, clientSecret };
}
async function loadTokens() {
    const raw = await keytar_1.default.getPassword(SERVICE, TOKENS_KEY);
    return raw ? JSON.parse(raw) : null;
}
async function saveTokens(tokens) {
    await keytar_1.default.setPassword(SERVICE, TOKENS_KEY, JSON.stringify(tokens));
}
// Check if we already have tokens; if so, confirm email
electron_1.ipcMain.handle('gmail:status', async () => {
    try {
        const tokens = await loadTokens();
        if (!tokens)
            return { connected: false };
        const { clientId, clientSecret } = await getClientSecrets();
        const oAuth = new googleapis_1.google.auth.OAuth2({ clientId, clientSecret });
        oAuth.setCredentials(tokens);
        const gmail = googleapis_1.google.gmail({ version: 'v1', auth: oAuth });
        const prof = await gmail.users.getProfile({ userId: 'me' });
        return { connected: true, email: prof.data.emailAddress };
    }
    catch (err) {
        return { connected: false, error: err?.message || String(err) };
    }
});
// Launch consent in the browser, receive the code on a local port,
// exchange for tokens, save them, and return the email.
electron_1.ipcMain.handle('gmail:connect', async () => {
    const { clientId, clientSecret } = await getClientSecrets();
    const port = await (0, get_port_1.default)({ port: [...Array(101)].map((_, i) => 53100 + i) });
    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
    const oAuth = new googleapis_1.google.auth.OAuth2({ clientId, clientSecret, redirectUri });
    const scopes = [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
    ];
    const url = oAuth.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: scopes,
        state: (0, node_crypto_1.randomUUID)(),
    });
    const result = await new Promise((resolve, reject) => {
        const server = node_http_1.default.createServer(async (req, res) => {
            try {
                if (!req.url?.startsWith('/oauth2callback')) {
                    res.statusCode = 404;
                    return res.end('Not found');
                }
                const full = new URL(req.url, `http://127.0.0.1:${port}`);
                const code = full.searchParams.get('code');
                if (!code)
                    throw new Error('No code');
                const { tokens } = await oAuth.getToken(code);
                oAuth.setCredentials(tokens);
                await saveTokens(tokens);
                const oauth2 = googleapis_1.google.oauth2({ version: 'v2', auth: oAuth });
                const me = await oauth2.userinfo.get();
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<h3>✅ Gmail connected. You can close this window.</h3>');
                resolve({ ok: true, email: me.data.email || undefined });
            }
            catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h3>❌ Gmail connect failed. Check the app console.</h3>');
                reject(err);
            }
            finally {
                server.close();
                win?.focus();
            }
        });
        server.listen(port, '127.0.0.1');
        // open the consent URL in the default browser
        (0, open_1.default)(url).catch(reject);
        // safety timeout
        setTimeout(() => reject(new Error('OAuth timed out')), 5 * 60 * 1000);
    });
    return result;
});
/* --------------------------------- Boot -------------------------------- */
electron_1.app.whenReady().then(() => {
    initDB();
    createWindow();
});
electron_1.app.on('window-all-closed', () => { if (process.platform !== 'darwin')
    electron_1.app.quit(); });
electron_1.app.on('activate', () => { if (electron_1.BrowserWindow.getAllWindows().length === 0)
    createWindow(); });
