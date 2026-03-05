const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const http = require('http');
const https = require('https');
const { URL } = require('url');

let mainWindow;
let tray;
let isClickThrough = false;
let overlayWin = null;
let focusTimer = null;

const configPath = path.join(app.getPath('userData'), 'clock-config.json');
const CLOCK_SIZE = 300; // Fixed square size in pixels

// ✅ DPI FIX (prevents Windows auto scaling resize)
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

// Default config
const defaultConfig = {
    x: null,
    y: null,
    isDarkTheme: true,
    isAnalog: true,
    showRomanNumerals: false,
    minimalistMode: false,
    google: {
        enabled: false,
        clientId: null,
        clientSecret: null,
        tokens: null,
        selectedCalendars: [],
    },
};

// Load config
function loadConfig() {
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    return defaultConfig;
}

// Save config
function saveConfig(config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Create window
function createWindow() {
    const config = loadConfig();
    // If no explicit start position, place the widget at top-right corner with a margin
    try {
        if (config.x == null || config.y == null) {
            const primary = screen.getPrimaryDisplay();
            const work = primary.workArea; // { x, y, width, height }
            const margin = 20;
            config.x = Math.max(work.x, work.x + work.width - CLOCK_SIZE - margin);
            config.y = Math.max(work.y, work.y + margin);
            saveConfig(config);
        }
    } catch (e) {
        // fallback to defaults
        if (config.x == null) config.x = 100;
        if (config.y == null) config.y = 100;
    }

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        x: config.x,
        y: config.y,
        frame: false,
        transparent: true,
        alwaysOnTop: false,
        resizable: true,
        skipTaskbar: false,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            enableRemoteModule: false,
        },
    });

    mainWindow.setMinimumSize(400, 400);

    // Load the new Productivity Dashboard
    mainWindow.loadFile(path.join(__dirname, 'clock-dashboard', 'index.html'));
    mainWindow.on('moved', () => {
        const [x, y] = mainWindow.getPosition();
        const config = loadConfig();
        config.x = x;
        config.y = y;
        saveConfig(config);
    });

    mainWindow.on('maximize', () => {
        try { mainWindow.unmaximize(); } catch (e) { }
    });

    mainWindow.on('enter-full-screen', () => {
        try { mainWindow.setFullScreen(false); } catch (e) { }
    });

    // Prevent reload shortcuts
    mainWindow.webContents.on('before-input-event', (event, input) => {
        const key = (input.key || '').toLowerCase();
        if ((input.control || input.meta) && key === 'r') {
            event.preventDefault();
        }
        if (key === 'f5') {
            event.preventDefault();
        }
    });

    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('config-loaded', config);
        // send initial calendar status
        mainWindow.webContents.send('calendar:status', config.google || {});
    });

    mainWindow.on('moved', () => {
        const [x, y] = mainWindow.getPosition();
        const config = loadConfig();
        config.x = x;
        config.y = y;
        saveConfig(config);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ------------------------
// Google Calendar support
// ------------------------

// Simple helper to do HTTPS POST and return JSON
function httpsPostJson(hostname, path, data) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(data);
        const opts = {
            hostname,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        };
        const req = https.request(opts, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function httpsGetJson(urlStr, accessToken) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(urlStr);
        const opts = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        };
        if (accessToken) opts.headers['Authorization'] = `Bearer ${accessToken}`;
        const req = https.request(opts, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// Save tokens to config and disk
function saveGoogleTokens(tokens) {
    const cfg = loadConfig();
    cfg.google = cfg.google || {};
    cfg.google.tokens = tokens;
    cfg.google.enabled = true;
    saveConfig(cfg);
}

// Refresh access token using refresh_token
async function refreshAccessToken() {
    const cfg = loadConfig();
    const g = cfg.google || {};
    if (!g.tokens?.refresh_token) throw new Error('No refresh token');
    const tokenEndpoint = 'https://oauth2.googleapis.com/token';
    const body = {
        client_id: g.clientId,
        client_secret: g.clientSecret,
        refresh_token: g.tokens.refresh_token,
        grant_type: 'refresh_token',
    };
    const parsed = new URL(tokenEndpoint);
    const res = await httpsPostJson(parsed.hostname, parsed.pathname, body);
    if (res.access_token) {
        g.tokens.access_token = res.access_token;
        g.tokens.expiry_date = Date.now() + (res.expires_in || 3600) * 1000;
        saveConfig(cfg);
        return g.tokens.access_token;
    }
    throw new Error('Failed to refresh token');
}

// Simple loopback OAuth flow. Expects clientId/clientSecret in config.google
async function startGoogleOAuth() {
    const cfg = loadConfig();
    const g = cfg.google || {};
    if (!g.clientId || !g.clientSecret) throw new Error('Missing Google clientId/clientSecret in config');

    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            try {
                const urlObj = new URL(req.url, 'http://localhost');
                const code = urlObj.searchParams.get('code');
                if (code) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('<h3>Authorization received. You can close this window.</h3>');
                    server.close();
                    // exchange code
                    const tokenEndpoint = 'https://oauth2.googleapis.com/token';
                    const body = {
                        code,
                        client_id: g.clientId,
                        client_secret: g.clientSecret,
                        redirect_uri: `http://127.0.0.1:${port}/callback`,
                        grant_type: 'authorization_code',
                    };
                    const parsed = new URL(tokenEndpoint);
                    const tokRes = await httpsPostJson(parsed.hostname, parsed.pathname, body);
                    if (tokRes.access_token) {
                        g.tokens = tokRes;
                        g.tokens.received_at = Date.now();
                        cfg.google = g;
                        saveConfig(cfg);
                        resolve(tokRes);
                    } else {
                        reject(new Error('Token exchange failed'));
                    }
                } else {
                    res.writeHead(400);
                    res.end('No code');
                }
            } catch (err) {
                try { res.writeHead(500); res.end('Error'); } catch (e) { }
                reject(err);
            }
        });

        // pick a random free-ish port
        const port = 42813;
        server.listen(port, '127.0.0.1', () => {
            const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
            authUrl.searchParams.set('client_id', g.clientId);
            authUrl.searchParams.set('redirect_uri', `http://127.0.0.1:${port}/callback`);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.readonly');
            authUrl.searchParams.set('access_type', 'offline');
            authUrl.searchParams.set('prompt', 'consent');
            // open system browser
            shell.openExternal(authUrl.toString());
        });
    });
}

let calendarSyncInterval = null;
let lastTriggeredMap = new Map();

async function fetchCalendarsAndSync() {
    try {
        const cfg = loadConfig();
        const g = cfg.google || {};
        if (!g || !g.tokens) return;
        let token = g.tokens.access_token;
        if (!token || (g.tokens.expiry_date && Date.now() > g.tokens.expiry_date - 60000)) {
            token = await refreshAccessToken();
        }
        const calList = await httpsGetJson('https://www.googleapis.com/calendar/v3/users/me/calendarList', token);
        const calendars = (calList.items || []).map(c => ({ id: c.id, summary: c.summary }));
        // fetch events for selected calendars (or primary few)
        const selected = (g.selectedCalendars && g.selectedCalendars.length) ? g.selectedCalendars : calendars.slice(0, 4).map(c => c.id);
        const now = new Date();
        const timeMin = now.toISOString();
        const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const events = [];
        for (const calId of selected) {
            const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
            try {
                const evRes = await httpsGetJson(url, token);
                (evRes.items || []).forEach(ev => events.push(Object.assign({}, ev, { calendarId: calId })));
            } catch (e) {
                console.warn('Failed fetch events for', calId, e);
            }
        }
        // send events to renderer
        mainWindow?.webContents?.send('calendar:events', { calendars, events });

        // trigger reminders: 10 minutes before meetings, 10 hours before birthdays (if event has 'birthday' in summary or calendar indicates)
        const nowTs = Date.now();
        for (const ev of events) {
            const start = ev.start?.dateTime || ev.start?.date; // date for all-day
            if (!start) continue;
            const startTs = new Date(start).getTime();
            const isAllDay = !!ev.start?.date;
            // birthday heuristic: all-day and 'birthday' in summary
            const isBirthday = isAllDay && /birth/i.test(ev.summary || '');
            const triggerBefore = isBirthday ? (10 * 3600 * 1000) : (10 * 60 * 1000);
            const triggerAt = startTs - triggerBefore;
            const idKey = `${ev.id}::${ev.calendarId}`;
            if (nowTs >= triggerAt && nowTs < startTs && !lastTriggeredMap.has(idKey)) {
                // send reminder
                mainWindow?.webContents?.send('calendar:reminder', { event: ev, triggeredAt: Date.now(), type: isBirthday ? 'birthday' : 'meeting' });
                lastTriggeredMap.set(idKey, Date.now());
            }
        }

    } catch (err) {
        console.warn('Calendar sync error', err);
    }
}

ipcMain.handle('google:connect', async () => {
    try {
        const tokens = await startGoogleOAuth();
        saveGoogleTokens(tokens);
        // start sync loop
        if (calendarSyncInterval) clearInterval(calendarSyncInterval);
        await fetchCalendarsAndSync();
        calendarSyncInterval = setInterval(fetchCalendarsAndSync, 5 * 60 * 1000);
        return { ok: true };
    } catch (e) {
        console.warn('google:connect failed', e);
        return { ok: false, error: String(e) };
    }
});

ipcMain.handle('google:disconnect', async () => {
    const cfg = loadConfig();
    if (cfg.google) { cfg.google.tokens = null; cfg.google.enabled = false; cfg.google.selectedCalendars = []; saveConfig(cfg); }
    if (calendarSyncInterval) { clearInterval(calendarSyncInterval); calendarSyncInterval = null; }
    lastTriggeredMap.clear();
    return { ok: true };
});

ipcMain.handle('google:sync-now', async () => { await fetchCalendarsAndSync(); return { ok: true }; });

ipcMain.handle('google:get-status', () => {
    const cfg = loadConfig();
    return cfg.google || {};
});

ipcMain.handle('google:set-selected-calendars', (event, ids) => {
    const cfg = loadConfig(); cfg.google = cfg.google || {}; cfg.google.selectedCalendars = ids || []; saveConfig(cfg); return { ok: true };
});


// IPC Handlers
ipcMain.handle('toggle-theme', () => {
    const config = loadConfig();
    config.isDarkTheme = !config.isDarkTheme;
    saveConfig(config);
    return config.isDarkTheme;
});

ipcMain.handle('toggle-click-through', () => {
    isClickThrough = !isClickThrough;
    if (mainWindow) {
        mainWindow.setIgnoreMouseEvents(isClickThrough);
    }
    return isClickThrough;
});

ipcMain.handle('toggle-mode', () => {
    const config = loadConfig();
    config.isAnalog = !config.isAnalog;
    saveConfig(config);
    return config.isAnalog;
});

ipcMain.handle('toggle-roman', () => {
    const config = loadConfig();
    config.showRomanNumerals = !config.showRomanNumerals;
    saveConfig(config);
    return config.showRomanNumerals;
});

ipcMain.handle('toggle-minimalist', () => {
    const config = loadConfig();
    config.minimalistMode = !config.minimalistMode;
    saveConfig(config);
    return config.minimalistMode;
});

// Focus / Pomodoro: minimal overlay + DnD stub
function createOverlay() {
    if (overlayWin) return;
    overlayWin = new BrowserWindow({
        show: false,
        fullscreen: true,
        frame: false,
        transparent: true,
        focusable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        enableLargerThanScreen: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
    overlayWin.loadURL(`data:text/html;charset=utf-8,<style>html,body{height:100%;margin:0;background:rgba(0,0,0,0.45);backdrop-filter: blur(4px);}</style><body></body>`);
}

function showOverlay(show) {
    if (!overlayWin) createOverlay();
    if (show) {
        overlayWin.showInactive();
        overlayWin.setAlwaysOnTop(true, 'screen-saver');
    } else {
        try { overlayWin.hide(); } catch (e) { }
    }
}

async function setDoNotDisturb(enable) {
    // Platform-specific DnD toggling is complex and may require native bindings.
    // This is a safe stub that logs intent; replace with native implementation for production.
    try {
        if (process.platform === 'darwin') {
            // macOS - consider using AppleScript or Focus APIs (left as an exercise)
            console.log('Request macOS Do Not Disturb ->', enable);
        } else if (process.platform === 'win32') {
            console.log('Request Windows Focus Assist ->', enable);
        } else {
            console.log('Request Linux Do Not Disturb ->', enable);
        }
    } catch (e) {
        console.warn('setDoNotDisturb error', e);
    }
}

function clearFocusTimer() {
    if (focusTimer) {
        clearTimeout(focusTimer);
        focusTimer = null;
    }
}

function startFocusSession(durationMinutes = 25) {
    clearFocusTimer();
    showOverlay(true);
    setDoNotDisturb(true);

    const ms = (durationMinutes || 25) * 60 * 1000;
    const endTs = Date.now() + ms;
    focusTimer = setTimeout(() => {
        stopFocusSession();
        if (mainWindow) mainWindow.webContents.send('focus:completed');
    }, ms);

    if (mainWindow) mainWindow.webContents.send('focus:started', { durationMinutes, endTs });
}

function stopFocusSession() {
    clearFocusTimer();
    showOverlay(false);
    setDoNotDisturb(false);
    if (mainWindow) mainWindow.webContents.send('focus:stopped');
}

ipcMain.handle('focus:start', (event, opts) => {
    startFocusSession(opts?.minutes || 25);
    return { ok: true };
});

ipcMain.handle('focus:stop', () => {
    stopFocusSession();
    return { ok: true };
});

ipcMain.handle('move-window', (event, dx, dy) => {
    if (!mainWindow) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + dx, y + dy);
});

// Create Tray
function createTray() {
    const trayIcon = path.join(__dirname, 'icon.png');
    let trayImage = nativeImage.createEmpty();

    if (fs.existsSync(trayIcon)) {
        trayImage = trayIcon;
    }

    tray = new Tray(trayImage);

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show', click: () => mainWindow?.show() },
        { label: 'Hide', click: () => mainWindow?.hide() },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        mainWindow?.isVisible() ? mainWindow?.hide() : mainWindow?.show();
    });
}

// App events
app.on('ready', () => {
    createWindow();
    createTray();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});