    const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = require('electron');
    const path = require('path');
    const fs = require('fs');
    const { exec } = require('child_process');

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
        width: CLOCK_SIZE,
        height: CLOCK_SIZE,
        x: config.x,
        y: config.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
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

    mainWindow.setAspectRatio(1);
    mainWindow.setResizable(false);
    mainWindow.setMinimumSize(CLOCK_SIZE, CLOCK_SIZE);
    mainWindow.setMaximumSize(CLOCK_SIZE, CLOCK_SIZE);

    mainWindow.loadFile('index.html');

    // ✅ HARD SIZE LOCK (prevents size increase during drag)
    const lockSize = () => {
        const [w, h] = mainWindow.getSize();
        if (w !== CLOCK_SIZE || h !== CLOCK_SIZE) {
        mainWindow.setSize(CLOCK_SIZE, CLOCK_SIZE);
        }
    };

    // mainWindow.on('resize', lockSize);
    // mainWindow.on('move', lockSize);
    mainWindow.on('will-resize', (event) => {
        try { event.preventDefault(); } catch (e) {}
    });
    mainWindow.on('moved', () => {
  // Enforce size AFTER dragging ends (no lag)
        const [w, h] = mainWindow.getSize();
        if (w !== CLOCK_SIZE || h !== CLOCK_SIZE) {
            mainWindow.setSize(CLOCK_SIZE, CLOCK_SIZE);
        }

        const [x, y] = mainWindow.getPosition();
        const config = loadConfig();
        config.x = x;
        config.y = y;
        saveConfig(config);
});

    mainWindow.on('maximize', () => {
        try { mainWindow.unmaximize(); } catch (e) {}
    });

    mainWindow.on('enter-full-screen', () => {
        try { mainWindow.setFullScreen(false); } catch (e) {}
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
        try { overlayWin.hide(); } catch (e) {}
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