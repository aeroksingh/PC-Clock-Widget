    const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } = require('electron');
    const path = require('path');
    const fs = require('fs');

    let mainWindow;
    let tray;
    let isClickThrough = false;

    const configPath = path.join(app.getPath('userData'), 'clock-config.json');
    const CLOCK_SIZE = 300; // Fixed square size in pixels

    // ✅ DPI FIX (prevents Windows auto scaling resize)
    app.commandLine.appendSwitch('high-dpi-support', '1');
    app.commandLine.appendSwitch('force-device-scale-factor', '1');

    // Default config
    const defaultConfig = {
    x: 100,
    y: 100,
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

    mainWindow.on('resize', lockSize);
    mainWindow.on('move', lockSize);
    mainWindow.on('will-resize', (event) => {
        try { event.preventDefault(); } catch (e) {}
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