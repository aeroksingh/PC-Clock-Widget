const { contextBridge, ipcRenderer } = require('electron');

// Secure API exposure through context bridge
contextBridge.exposeInMainWorld('electronAPI', {
    // Theme toggle
    toggleTheme: () => ipcRenderer.invoke('toggle-theme'),

    // Click-through mode
    toggleClickThrough: () => ipcRenderer.invoke('toggle-click-through'),

    // Analog/Digital mode
    toggleMode: () => ipcRenderer.invoke('toggle-mode'),

    // Roman numerals
    toggleRoman: () => ipcRenderer.invoke('toggle-roman'),

    // Minimalist mode
    toggleMinimalist: () => ipcRenderer.invoke('toggle-minimalist'),

    // Window movement
    moveWindow: (dx, dy) => ipcRenderer.invoke('move-window', dx, dy),

    // Request main process to set window size for the current mode
    setModeSize: (mode) => ipcRenderer.invoke('set-mode-size', mode),

    // Toggle dynamic color (renderer-local but exposed for parity)
    toggleDynamicColor: () => ipcRenderer.invoke('toggle-dynamic-color'),

    // Configuration loader
    onConfigLoaded: (callback) => {
        ipcRenderer.on('config-loaded', (event, config) => callback(config));
    },
    // Focus / Pomodoro controls
    focusStart: (minutes) => ipcRenderer.invoke('focus:start', { minutes }),
    focusStop: () => ipcRenderer.invoke('focus:stop'),
    onFocusStarted: (callback) => {
        ipcRenderer.on('focus:started', (event, data) => callback(data));
    },
    onFocusStopped: (callback) => {
        ipcRenderer.on('focus:stopped', () => callback());
    },
    onFocusCompleted: (callback) => {
        ipcRenderer.on('focus:completed', () => callback());
    },
    // Google Calendar
    googleConnect: () => ipcRenderer.invoke('google:connect'),
    googleDisconnect: () => ipcRenderer.invoke('google:disconnect'),
    googleSyncNow: () => ipcRenderer.invoke('google:sync-now'),
    googleGetStatus: () => ipcRenderer.invoke('google:get-status'),
    googleSetSelectedCalendars: (ids) => ipcRenderer.invoke('google:set-selected-calendars', ids),
    onCalendarEvents: (callback) => {
        ipcRenderer.on('calendar:events', (event, data) => callback(data));
    },
    onCalendarReminder: (callback) => {
        ipcRenderer.on('calendar:reminder', (event, data) => callback(data));
    },
    onCalendarStatus: (callback) => {
        ipcRenderer.on('calendar:status', (event, data) => callback(data));
    },
});