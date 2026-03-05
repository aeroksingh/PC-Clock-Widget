// ========== CONFIGURATION =========
let config = {
  isDarkTheme: true,
  isAnalog: true,
  showRomanNumerals: false,
  minimalistMode: false,
};

// ========== STATE ==========
let isAnalog = true;
let isDragging = false;
let lastX = 0;
let lastY = 0;
let isTransitioning = false;
let transitionProgress = 0;
let transitionDirection = 'none';
let lastDigitalText = '';
let lastContainerWidth = 0;
let lastContainerHeight = 0;
// Stopwatch & color state
let stopwatchMode = false;
let isStopwatchRunning = false;
let stopwatchStart = 0;
let stopwatchElapsed = 0; // ms
let dynamicColor = false;

// ========== DOM ELEMENTS ==========
// Use existing #clock-container if present, otherwise create one
const container = document.getElementById('clock-container') || document.createElement('div');
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { alpha: true });
const digital = document.createElement('div');

// Visual shrink state
let isShrunk = false;

// ========== SETUP CONTAINER ==========
Object.assign(container.style, {
  width: '100%',
  height: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  background: 'transparent',
  userSelect: 'none',
  margin: '0',
  padding: '0',
  transformOrigin: 'center center',
});

// If container was newly created, append it. If it existed in the DOM, preserve it.
if (!container.parentElement) {
  document.body.appendChild(container);
}
container.appendChild(canvas);

// ========== SETUP CANVAS ==========
Object.assign(canvas.style, {
  display: 'block',
  position: 'absolute',
  top: '0',
  left: '0',
  transition: 'transform 260ms cubic-bezier(.22,.9,.32,1), opacity 220ms linear',
  transformOrigin: 'center center',
});

// ========== SETUP DIGITAL DISPLAY ==========
Object.assign(digital.style, {
  fontFamily: "'Segoe UI', monospace",
  fontWeight: '600',
  color: '#00ffaa',
  textAlign: 'center',
  textShadow: '0 0 20px #00ffaa',
  letterSpacing: '2px',
  whiteSpace: 'nowrap',
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%) scale(1)',
  padding: '6px 14px',
  borderRadius: '999px',
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(6px)',
  boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
  lineHeight: '1',
  minHeight: '36px',
  display: 'inline-block',
  transition: 'transform 260ms cubic-bezier(.22,.9,.32,1), opacity 220ms linear',
  transformOrigin: 'center center',
});

// ========== CONSTANTS & HELPERS ==========
const ROMAN_NUMERALS = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
const COLOR_DARK = '#00ffaa';
const COLOR_LIGHT = '#333333';
const COLOR_SECOND = '#ff4444';

function getDynamicColor() {
  const hue = Math.floor((Date.now() / 20) % 360);
  return `hsl(${hue}, 100%, 50%)`;
}

// Get smooth second with millisecond precision
function getSmoothedSeconds() {
  const now = Date.now();
  return (now / 1000) % 60;
}

// Easing for smooth transitions
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ========== CONFIGURATION LOADER ==========
window.electronAPI?.onConfigLoaded?.((loadedConfig) => {
  config = { ...config, ...loadedConfig };
  isAnalog = config.isAnalog;
  updateTheme();
});

// ========== KEYBOARD SHORTCUTS ==========
document.addEventListener('keydown', async (e) => {
  const key = e.key.toLowerCase();

  // Ctrl+R: prevent reload and toggle analog/digital mode
  if ((e.ctrlKey || e.metaKey) && key === 'r') {
    e.preventDefault();
    e.stopPropagation();
    // toggle locally and persist via main process
    isAnalog = !isAnalog;
    isTransitioning = true;
    transitionProgress = 0;
    transitionDirection = isAnalog ? 'toAnalog' : 'toDigital';
    const result = await window.electronAPI?.toggleMode?.();
    if (result !== undefined) {
      config.isAnalog = result;
    }
    try { window.electronAPI?.setModeSize?.(isAnalog ? 'analog' : 'digital'); } catch (e) {}
    return;
  }
  
  if (key === 'c') {
    window.electronAPI?.toggleClickThrough?.();
  }
  
  if (key === 't') {
    (async () => {
      const newTheme = await window.electronAPI?.toggleTheme?.();
      if (newTheme !== undefined) {
        config.isDarkTheme = newTheme;
        updateTheme();
      }
    })();
  }
  
  if (key === 'r') {
    (async () => {
      const value = await window.electronAPI?.toggleRoman?.();
      if (value !== undefined) {
        config.showRomanNumerals = value;
      }
    })();
  }
  
  if (key === 'm') {
    (async () => {
      const value = await window.electronAPI?.toggleMinimalist?.();
      if (value !== undefined) {
        config.minimalistMode = value;
      }
    })();
  }

  // Stopwatch controls
  if (key === 'p') {
    // toggle stopwatch display mode
    stopwatchMode = !stopwatchMode;
    if (!stopwatchMode) {
      isStopwatchRunning = false;
      stopwatchElapsed = 0;
      stopwatchStart = 0;
    }
  }

  if (key === 'v') {
    // start/stop stopwatch when in stopwatch mode
    if (stopwatchMode) {
      if (!isStopwatchRunning) {
        // start
        isStopwatchRunning = true;
        stopwatchStart = Date.now() - stopwatchElapsed;
      } else {
        // stop
        isStopwatchRunning = false;
        stopwatchElapsed = Date.now() - stopwatchStart;
      }
    }
  }

  if (key === 'b') {
    // reset stopwatch
    if (stopwatchMode) {
      isStopwatchRunning = false;
      stopwatchElapsed = 0;
      stopwatchStart = 0;
    }
  }

  if (key === 'y') {
    // toggle dynamic color cycling
    dynamicColor = !dynamicColor;
    updateTheme();
  }
});

// ========== MOUSE DRAG & INTERACTION ==========
document.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }
});

// Improved drag: accumulate deltas and flush once per animation frame for smoothness
let pendingDx = 0;
let pendingDy = 0;
let dragFlushRequested = false;

function flushDrag() {
  if (!isDragging) { dragFlushRequested = false; pendingDx = 0; pendingDy = 0; return; }
  if (pendingDx !== 0 || pendingDy !== 0) {
    window.electronAPI?.moveWindow?.(pendingDx, pendingDy);
    pendingDx = 0;
    pendingDy = 0;
  }
  dragFlushRequested = false;
}

document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    pendingDx += dx;
    pendingDy += dy;
    lastX = e.clientX;
    lastY = e.clientY;
    if (!dragFlushRequested) {
      dragFlushRequested = true;
      requestAnimationFrame(flushDrag);
    }
  }
});

document.addEventListener('mouseup', () => {
  isDragging = false;
});

// ========== DOUBLE-CLICK TO TOGGLE ==========
document.addEventListener('dblclick', async () => {
  isAnalog = !isAnalog;
  isTransitioning = true;
  transitionProgress = 0;
  transitionDirection = isAnalog ? 'toAnalog' : 'toDigital';
  
  const result = await window.electronAPI?.toggleMode?.();
  if (result !== undefined) {
    config.isAnalog = result;
  }
  // request main process to set a safe window size for the new mode
  try { window.electronAPI?.setModeSize?.(isAnalog ? 'analog' : 'digital'); } catch (e) {}
});

// ========== THEME MANAGEMENT ==========
function updateTheme() {
  const primaryColor = dynamicColor ? getDynamicColor() : (config.isDarkTheme ? COLOR_DARK : COLOR_LIGHT);

  Object.assign(digital.style, {
    color: primaryColor,
    textShadow: `0 0 20px ${primaryColor}`,
  });
}

// ========== CANVAS SETUP ==========
function setupCanvas(isAnalogFrame = isAnalog) {
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // When showing analog, shrink the canvas frame to a fraction so the face is smaller
  const sizeMultiplier = isAnalogFrame ? 0.6 : 1.0;
  const targetW = Math.max(1, Math.floor(rect.width * sizeMultiplier));
  const targetH = Math.max(1, Math.floor(rect.height * sizeMultiplier));

  canvas.width = Math.max(1, Math.floor(targetW * dpr));
  canvas.height = Math.max(1, Math.floor(targetH * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Center the canvas inside the container
  canvas.style.width = targetW + 'px';
  canvas.style.height = targetH + 'px';
  canvas.style.left = `${(rect.width - targetW) / 2}px`;
  canvas.style.top = `${(rect.height - targetH) / 2}px`;
}

// ========== DRAWING: ANALOG CLOCK ==========
function drawAnalog() {
  const rect = { width: canvas.clientWidth, height: canvas.clientHeight };
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const radius = Math.min(rect.width, rect.height) / 2 * 0.9;
  
  const primaryColor = dynamicColor ? getDynamicColor() : (config.isDarkTheme ? COLOR_DARK : COLOR_LIGHT);
  
  // Clear canvas
  ctx.clearRect(0, 0, rect.width, rect.height);
  
  ctx.save();
  ctx.translate(centerX, centerY);
  
  // Outer glow
  const glowGradient = ctx.createRadialGradient(0, 0, radius * 0.9, 0, 0, radius * 1.1);
  const glowColor = dynamicColor ? 'rgba(255,255,255,0.18)' : (config.isDarkTheme ? 'rgba(0, 255, 170, 0.3)' : 'rgba(51, 51, 51, 0.2)');
  glowGradient.addColorStop(0, glowColor);
  glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.1, 0, Math.PI * 2);
  ctx.fill();
  
  // Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 5;
  
  // Dial background
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'black';
  ctx.fill();
  
  // Border
  ctx.shadowColor = config.isDarkTheme ? 'rgba(0, 255, 170, 0.5)' : 'rgba(51, 51, 51, 0.3)';
  ctx.shadowBlur = 15;
  ctx.lineWidth = radius * 0.05;
  ctx.strokeStyle = primaryColor;
  ctx.stroke();
  
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  
  // Numbers or ticks
  if (!config.minimalistMode) {
    ctx.font = `bold ${Math.floor(radius * 0.15)}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = primaryColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let i = 1; i <= 12; i++) {
      const angle = (i * Math.PI * 2) / 12 - Math.PI / 2;
      const x = Math.cos(angle) * radius * 0.85;
      const y = Math.sin(angle) * radius * 0.85;
      const text = config.showRomanNumerals ? ROMAN_NUMERALS[i - 1] : i.toString();
      ctx.fillText(text, x, y);
    }
  } else {
    // Minimalist ticks only
    for (let i = 0; i < 60; i++) {
      const angle = (i * Math.PI * 2) / 60;
      const x1 = Math.cos(angle) * radius * 0.95;
      const y1 = Math.sin(angle) * radius * 0.95;
      const x2 = Math.cos(angle) * radius * 0.88;
      const y2 = Math.sin(angle) * radius * 0.88;
      
      ctx.lineWidth = i % 5 === 0 ? 2 : 1;
      ctx.strokeStyle = primaryColor;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  
  // Get time
  // When focus running, show remaining time instead of real time
  let now = new Date();
  let hours = now.getHours() % 12;
  let minutes = now.getMinutes();
  let seconds = getSmoothedSeconds();
  if (focusRunning && focusEndTs) {
    const remainingMs = Math.max(0, focusEndTs - Date.now());
    const totalSeconds = Math.floor(remainingMs / 1000);
    const remM = Math.floor(totalSeconds / 60);
    const remS = totalSeconds % 60;
    // Display remaining as centered text; keep hands at current time to avoid confusion
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.fillStyle = '#6ef0c5';
    ctx.font = `bold ${Math.floor(radius * 0.35)}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const txt = `${String(remM).padStart(2,'0')}:${String(remS).padStart(2,'0')}`;
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  }
  
  // Hour hand
  const hourAngle = (hours * Math.PI / 6) + (minutes * Math.PI / (6 * 60)) + (seconds * Math.PI / (360 * 60));
  drawHand(hourAngle, radius * 0.5, radius * 0.08, primaryColor);
  
  // Minute hand
  const minuteAngle = (minutes * Math.PI / 30) + (seconds * Math.PI / (30 * 60));
  drawHand(minuteAngle, radius * 0.75, radius * 0.05, primaryColor);
  
  // Second hand
  const secondAngle = (seconds * Math.PI / 30);
  drawHand(secondAngle, radius * 0.85, radius * 0.02, COLOR_SECOND);
  
  // Center dot
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = primaryColor;
  ctx.fill();
  
  ctx.restore();
}

// Draw a single hand
function drawHand(angle, length, width, color) {
  ctx.save();
  ctx.rotate(angle);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -length);
  ctx.stroke();
  ctx.restore();
}

// ========== DRAWING: DIGITAL CLOCK ==========
function drawDigital() {
  // If focus running, replace digital time with remaining countdown
  let text = '';
  if (focusRunning && focusEndTs) {
    const remainingMs = Math.max(0, focusEndTs - Date.now());
    const totalSeconds = Math.floor(remainingMs / 1000);
    const remM = Math.floor(totalSeconds / 60);
    const remS = totalSeconds % 60;
    text = `${String(remM).padStart(2,'0')}:${String(remS).padStart(2,'0')}`;
  } else {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    // If stopwatch mode active, show stopwatch elapsed
    if (stopwatchMode) {
      const elapsed = isStopwatchRunning ? (Date.now() - stopwatchStart) : stopwatchElapsed;
      const totalMs = Math.max(0, elapsed);
      const ms = Math.floor((totalMs % 1000) / 10); // hundredths
      const totalSec = Math.floor(totalMs / 1000);
      const s = totalSec % 60;
      const m = Math.floor(totalSec / 60);
      text = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(ms).padStart(2, '0')}`;
    } else {
      text = `${hours}:${minutes}:${seconds}`;
    }
  }
  digital.textContent = text;

  const rect = container.getBoundingClientRect();
  const cW = Math.max(1, rect.width);
  const cH = Math.max(1, rect.height);

  // Only recalc when text or container size changes
  if (text !== lastDigitalText || cW !== lastContainerWidth || cH !== lastContainerHeight) {
    lastDigitalText = text;
    lastContainerWidth = cW;
    lastContainerHeight = cH;

    const maxFontSize = 180;
    // Start with a font size that fits height, then shrink to fit width if needed
    const startSize = Math.min(cH * 0.5, maxFontSize);
    let size = Math.floor(startSize);
    digital.style.fontSize = size + 'px';

    const maxAllowedWidth = cW * 0.92; // small padding

    // If it doesn't fit horizontally, decrement until it does (cheap loop; few iterations)
    while (digital.offsetWidth > maxAllowedWidth && size > 8) {
      size -= 2;
      digital.style.fontSize = size + 'px';
    }

    // Ensure font also doesn't exceed container height (safety)
    const maxAllowedHeight = cH * 0.9;
    if (size > maxAllowedHeight) {
      size = Math.floor(maxAllowedHeight);
      digital.style.fontSize = size + 'px';
    }
  }
}

// ========== SWAP DISPLAY MODE ==========
function swapDisplay() {
  // During transitions keep both elements present so we can animate smoothly
  if (isTransitioning) {
    if (!container.contains(canvas)) container.appendChild(canvas);
    if (!container.contains(digital)) container.appendChild(digital);
    // ensure canvas sized for analog; digital sizing handled separately
    setupCanvas(true);
    canvas.style.display = 'block';
    digital.style.display = 'inline-block';
    return;
  }

  if (isAnalog) {
    if (!container.contains(canvas)) {
      container.appendChild(canvas);
    }
    canvas.style.display = 'block';
    // size and center analog frame
    setupCanvas(true);
    if (digital.parentElement) digital.remove();
  } else {
    if (!container.contains(digital)) {
      container.appendChild(digital);
    }
    // digital uses full container, hide canvas
    canvas.style.display = 'none';
    setupCanvas(false);
  }
}

// ========== MAIN UPDATE FUNCTION ==========
function update() {
  // Handle transition animation
  if (isTransitioning) {
    transitionProgress += 0.08; // slightly smoother pacing
    if (transitionProgress >= 1) {
      isTransitioning = false;
      transitionProgress = 1;
    }
  }
  swapDisplay();

  const t = Math.min(1, Math.max(0, transitionProgress));
  const eased = easeInOutCubic(t);

  // Default scales/opacities
  let canvasScale = 1;
  let canvasOpacity = 1;
  let digitalScale = 1;
  let digitalOpacity = 1;

  if (isTransitioning) {
    if (transitionDirection === 'toDigital') {
      // analog -> digital: shrink/fade analog, grow/appear digital
      canvasScale = 1 - eased * 0.18; // down to ~0.82
      canvasOpacity = 1 - eased * 0.9;
      digitalScale = 0.9 + eased * 0.12; // from 0.9 -> 1.02
      digitalOpacity = eased;
    } else if (transitionDirection === 'toAnalog') {
      // digital -> analog: grow analog, fade digital
      canvasScale = 0.82 + eased * 0.18; // from 0.82 -> 1
      canvasOpacity = eased;
      digitalScale = 1 - eased * 0.12;
      digitalOpacity = 1 - eased;
    }
  } else {
    // static final states
    if (isAnalog) {
      canvasScale = 1; canvasOpacity = 1; digitalScale = 0.92; digitalOpacity = 0;
    } else {
      canvasScale = 0.82; canvasOpacity = 0; digitalScale = 1; digitalOpacity = 1;
    }
  }

  // Apply transforms/styles
  canvas.style.transform = `scale(${canvasScale})`;
  canvas.style.opacity = String(canvasOpacity);
  digital.style.transform = `translate(-50%, -50%) scale(${digitalScale})`;
  digital.style.opacity = String(digitalOpacity);

  // Draw whichever is visible (always draw analog when present so hands stay accurate)
  if (canvas.style.display !== 'none' && canvasOpacity > 0.02) {
    ctx.globalAlpha = canvasOpacity;
    drawAnalog();
    ctx.globalAlpha = 1;
  }

  if (digitalOpacity > 0.01) {
    drawDigital();
  }
}

// ========== ANIMATION LOOP (60fps) ==========
function animate() {
  update();
  requestAnimationFrame(animate);
}

// ========== INITIALIZATION ==========
updateTheme();
setupCanvas();
canvas.style.display = 'block';
window.addEventListener('resize', () => setupCanvas(isAnalog));
requestAnimationFrame(animate);

// ========== SIMPLE POMODORO CONTROL (floating button) ==========
let focusRunning = false;
let focusEndTs = 0;
let focusInterval = null;

const ctrl = document.createElement('button');
ctrl.id = 'pomodoro-btn';
Object.assign(ctrl.style, {
  position: 'absolute',
  right: '8px',
  bottom: '42px',
  padding: '6px 10px',
  borderRadius: '8px',
  background: 'rgba(0,0,0,0.6)',
  color: '#00ffaa',
  border: '1px solid rgba(255,255,255,0.06)',
  backdropFilter: 'blur(6px)',
  cursor: 'pointer',
  zIndex: 9999,
  fontWeight: '600',
  fontSize: '13px',
});
ctrl.textContent = 'Start Focus';
document.body.appendChild(ctrl);

function updateCtrlText() {
  if (!focusRunning) return (ctrl.textContent = 'Start Focus');
  const remaining = Math.max(0, Math.floor((focusEndTs - Date.now()) / 1000));
  const m = Math.floor(remaining / 60).toString().padStart(2, '0');
  const s = (remaining % 60).toString().padStart(2, '0');
  // Show remaining only (MM:SS)
  ctrl.textContent = `${m}:${s}`;
}

ctrl.addEventListener('click', async () => {
  if (!focusRunning) {
    // start 25m
    await window.electronAPI?.focusStart?.(25);
  } else {
    // Stop the running focus session and show a bright summary with current time + remaining
    await window.electronAPI?.focusStop?.();
    // compute remaining time
    const remaining = Math.max(0, Math.floor((focusEndTs - Date.now()) / 1000));
    const m = Math.floor(remaining / 60).toString().padStart(2, '0');
    const s = (remaining % 60).toString().padStart(2, '0');
    // current local time
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const nowStr = `${hh}:${mm}:${ss}`;
    showToastBright(`${nowStr} • Remaining ${m}:${s}`);
    // update local state immediately
    focusRunning = false;
    focusEndTs = 0;
    if (focusInterval) { clearInterval(focusInterval); focusInterval = null; }
    ctrl.textContent = 'Start Focus';
  }
});

window.electronAPI?.onFocusStarted?.((data) => {
  focusRunning = true;
  focusEndTs = data?.endTs || (Date.now() + ((data?.durationMinutes || 25) * 60 * 1000));
  updateCtrlText();
  if (focusInterval) clearInterval(focusInterval);
  focusInterval = setInterval(() => {
    updateCtrlText();
    if (Date.now() >= focusEndTs) {
      clearInterval(focusInterval);
      focusInterval = null;
    }
  }, 1000);
});

window.electronAPI?.onFocusStopped?.(() => {
  focusRunning = false;
  focusEndTs = 0;
  if (focusInterval) { clearInterval(focusInterval); focusInterval = null; }
  updateCtrlText();
});

window.electronAPI?.onFocusCompleted?.(() => {
  focusRunning = false;
  focusEndTs = 0;
  if (focusInterval) { clearInterval(focusInterval); focusInterval = null; }
  ctrl.textContent = 'Done';
  setTimeout(() => { ctrl.textContent = 'Start Focus'; }, 2000);
});

// Small transient toast used to show remaining time on click
const toast = document.createElement('div');
Object.assign(toast.style, {
  position: 'absolute',
  right: '12px',
  bottom: '86px',
  padding: '8px 10px',
  borderRadius: '8px',
  background: 'rgba(0,0,0,0.75)',
  color: '#fff',
  fontWeight: '600',
  zIndex: 10000,
  opacity: '0',
  transition: 'opacity 180ms ease',
  pointerEvents: 'none',
});
document.body.appendChild(toast);

function showToast(text, ms = 1800) {
  toast.style.background = 'rgba(0,0,0,0.75)';
  toast.style.color = '#fff';
  toast.innerText = text;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, ms);
}

function showToastBright(text, ms = 2200) {
  // bright accent toast (glass-like)
  toast.style.background = 'linear-gradient(90deg,#6ef0c5,#3ddfaf)';
  toast.style.color = '#022';
  toast.style.boxShadow = '0 8px 30px rgba(61,223,175,0.18)';
  toast.innerText = text;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0';
    // restore default look after fade
    setTimeout(() => { toast.style.background = 'rgba(0,0,0,0.75)'; toast.style.color = '#fff'; toast.style.boxShadow = 'none'; }, 300);
  }, ms);
}
