"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = require("path");
const http_1 = require("http");
const crypto_1 = require("crypto");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const keytar_1 = __importDefault(require("keytar"));
const get_port_1 = __importDefault(require("get-port"));
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
            contextIsolation: true,
            nodeIntegration: false,
            preload: (0, path_1.join)(__dirname, 'preload.js'),
        },
    });
    // devtools in dev so we can see Console logs
    win.webContents.openDevTools({ mode: 'detach' });
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    if (devUrl) {
        await win.loadURL(devUrl);
    }
    else {
        await win.loadFile((0, path_1.join)(__dirname, '../renderer/index.html'));
    }
}
/* -------------------- IPC: Settings + Secrets -------------------- */
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
/* -------------------- IPC: Gmail OAuth -------------------- */
electron_1.ipcMain.handle('gmail:status', async () => {
    const raw = await keytar_1.default.getPassword(SERVICE, TOKENS_KEY);
    if (!raw)
        return { connected: false };
    try {
        const tokens = JSON.parse(raw);
        const auth = new googleapis_1.google.auth.OAuth2();
        auth.setCredentials(tokens);
        const gmail = googleapis_1.google.gmail({ version: 'v1', auth });
        const me = await gmail.users.getProfile({ userId: 'me' });
        return { connected: true, email: me.data.emailAddress || null };
    }
    catch (err) {
        return { connected: false, error: String(err?.message || err) };
    }
});
electron_1.ipcMain.handle('gmail:connect', async () => {
    const clientId = await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_ID');
    const clientSecret = await keytar_1.default.getPassword(SERVICE, 'GMAIL_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
        throw new Error('Missing Gmail OAuth keys. Fill them in the Setup screen first.');
    }
    const port = await (0, get_port_1.default)({ port: 0 });
    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
    const auth = new googleapis_1.google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const scopes = [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'openid',
        'email',
        'profile',
    ];
    const state = (0, crypto_1.randomUUID)();
    const authUrl = auth.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent',
        state,
    });
    await electron_1.shell.openExternal(authUrl);
    return await new Promise((resolve, reject) => {
        const server = (0, http_1.createServer)(async (req, res) => {
            try {
                if (!req.url)
                    return;
                const u = new URL(req.url, `http://127.0.0.1:${port}`);
                if (u.pathname !== '/oauth2callback') {
                    res.statusCode = 404;
                    res.end('Not found');
                    return;
                }
                const code = u.searchParams.get('code');
                const rstate = u.searchParams.get('state');
                if (!code || rstate !== state) {
                    res.statusCode = 400;
                    res.end('Invalid OAuth response');
                    throw new Error('Invalid OAuth response');
                }
                const { tokens } = await auth.getToken(code);
                await keytar_1.default.setPassword(SERVICE, TOKENS_KEY, JSON.stringify(tokens));
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/html');
                res.end('<b>Gmail connected!</b> You can close this tab.');
                resolve({ ok: true });
            }
            catch (err) {
                reject(err);
            }
            finally {
                server.close();
            }
        });
        server.listen(port, () => console.log(`[gmail] callback listening on ${port}`));
    });
});
/* -------------------- App lifecycle -------------------- */
electron_1.app.whenReady().then(() => {
    initDB();
    createWindow();
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
