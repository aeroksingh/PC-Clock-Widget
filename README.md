# Professional Desktop Clock Widget

A beautiful, frameless Electron-based desktop clock widget with a modern aesthetic and rich feature set.

## Features

### Core Features
✅ **Frameless Window** - Clean, borderless design  
✅ **Transparent Background** - Only the clock is visible, rest fully transparent  
✅ **Always On Top** - Stays above other windows  
✅ **Resizable** - Adjust size while maintaining aspect ratio  
✅ **Circular Visual Boundary** - Perfect circle with soft glow effect  

### Clock Modes
✅ **Analog Clock**
- Hour, minute, and second hands
- Smooth sweep second hand (not jumping)
- Tick marks or digit numbers
- Black circular dial background
- Clean modern design

✅ **Digital Clock (24-hour format)**
- Large, easy-to-read numbers
- Smooth fade animation when switching modes
- Glow text effect

### Display Options
✅ **Roman Numerals** - Press 'R' to toggle roman numeral display (I, II, III, etc.)  
✅ **Minimalist Tick-Only Mode** - Press 'M' to show only tick marks  
✅ **Light/Dark Theme** - Press 'T' to toggle between themes  

### Visual Polish
✅ **Subtle Glow Effect** - Soft cyan glow around clock border  
✅ **Glass/Blur Effect** - Modern transparent dial appearance  
✅ **Soft Shadow** - Realistic depth effect around boundary  
✅ **Smooth 60fps Animation** - Using requestAnimationFrame for smooth motion  
✅ **Fade Animations** - Smooth transitions between modes  

### Interaction & Control
✅ **Drag to Move** - Click and drag anywhere on the clock to move it  
✅ **Scroll to Resize** - Use mouse wheel to resize the clock  
✅ **Double-Click Toggle** - Toggle between analog and digital modes  
✅ **Keyboard Shortcuts:**
- **C** - Toggle click-through mode (ignore mouse clicks)
- **T** - Toggle light/dark theme
- **R** - Toggle roman numerals
- **M** - Toggle minimalist tick-only mode

### System Integration
✅ **System Tray Icon** - Minimize to tray with right-click menu  
✅ **Auto-Save Preferences** - Window position, size, and settings saved locally  
✅ **Auto-Start Ready** - Can be configured to start with system (Windows Scheduler/Task)  
✅ **Snap-to-Corner Support** - Press arrow keys + modifier to snap to screen corners  

### Architecture
✅ **Proper Electron Structure** - Separate main.js (main process), renderer.js (UI logic), preload.js (IPC bridge)  
✅ **IPC Communication** - Secure context isolation with no nodeIntegration  
✅ **Memory Efficient** - No full DOM resets, only canvas redraws  
✅ **Responsive Canvas** - Auto-scales with window size  
✅ **Clean Code** - Modular functions, no memory leaks  

## Installation

```bash
npm install
npm start
```

## Usage

### Basic Controls
- **Click & Drag** - Move the clock window
- **Mouse Wheel** - Resize the clock
- **Double-Click** - Toggle between analog and digital modes

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| C | Toggle click-through mode |
| T | Toggle light/dark theme |
| R | Toggle roman numerals |
| M | Toggle minimalist mode |

### System Tray
- **Right-Click** tray icon for menu
- **Click** tray icon to show/hide window
- **Quit** option in tray menu

## Features Status

### Completed ✅
- Frameless, transparent window
- Always-on-top behavior
- Resizable with smooth redraw
- Analog clock with smooth second hand
- Digital clock with 24-hour format
- Double-click mode toggle
- Keyboard shortcuts (C, T, R, M)
- Drag to move window
- Scroll to resize window
- Light/dark theme support
- Roman numeral display option
- Minimalist tick-only mode
- Smooth 60fps animation loop
- Local storage for preferences
- System tray integration
- Glow and shadow effects
- Clean modular code structure

### Optional Enhancements Available
- Auto-start with Windows (requires registry configuration)
- Custom themes/colors
- Analog/Digital mode preference saving
- Window position snap-to-grid

## Configuration

Settings are saved in:
```
Windows: %APPDATA%\clock-widget\clock-config.json
Linux/Mac: ~/.config/clock-widget/clock-config.json
```

## Development

### Project Structure
```
clock-widget/
├── main.js           # Electron main process
├── renderer.js       # UI and animation logic
├── preload.js        # IPC bridge (secure)
├── index.html        # HTML structure & styles
└── package.json      # Dependencies
```

### Architecture Decisions
- **Context Isolation**: Enabled for security
- **Sandbox**: Enabled for safety
- **No Node Integration**: Disabled for security
- **IPC Only**: All main process communication through IPC handlers

## Performance

- **60 FPS**: Smooth animations using requestAnimationFrame
- **Efficient Redraw**: Canvas-only updates, no DOM thrashing
- **No Memory Leaks**: Proper event listener cleanup and canvas state management
- **Low CPU**: Optimized drawing path with no unnecessary calculations

## Styling

### Theme Colors
**Dark Theme (Default):**
- Primary: #00ffcc (cyan)
- Background: rgba(10, 10, 10, 0.8)
- Dial: #0a0a0a

**Light Theme:**
- Primary: #333333 (dark gray)
- Background: rgba(240, 240, 240, 0.9)
- Dial: #f5f5f5

Easily customizable via CSS variables in `index.html`.

## Troubleshooting

### Window appears frozen
- Clock is working, just double-click to toggle modes
- Check Task Manager to see Electron process is running

### Preferences not saving
- Check that folder permissions allow write access to userData directory
- Restart the application

### Click-through mode stuck
- Press 'C' again to toggle back to normal mode

## Future Enhancements

- [ ] Weather integration
- [ ] Alarm functionality
- [ ] Stopwatch/Timer
- [ ] Multiple time zones
- [ ] Animated backgrounds
- [ ] Sound effects option
- [ ] Custom clock skins

## License

ISC
