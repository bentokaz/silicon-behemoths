// What a device's screen shows. The artwork is drawn on a canvas with the same
// aspect ratio as the screen it goes on, so nothing is ever stretched, and each
// device type gets its own kind of interface: a phone home screen, a watch
// face, a desktop with windows, a TV's streaming wall.
import * as THREE from 'three'
import { drawActioncam, drawEreader } from './screensMore'
import type { DeviceType, OsLook } from '../sim/types'
import { OS_SCREEN_OF, paintOsLook } from './osLook'

/** Wallpaper palettes: deep tone, mid tone, highlight. */
const WALLPAPERS: [string, string, string][] = [
  ['#0e2a33', '#1f7f86', '#e8b25a'],
  ['#1a1410', '#b5532a', '#f1d6a8'],
  ['#0b1d16', '#2f8f5b', '#d6f0c2'],
  ['#101319', '#44506a', '#c9d3e6'],
  ['#2a0f14', '#c23b4e', '#f3c9b1'],
  ['#07131f', '#1c5d99', '#9fd6ff'],
]
export const WALLPAPER_COUNT = WALLPAPERS.length

const FONT = '"Segoe UI", system-ui, sans-serif'
const APPS = ['Mail', 'Maps', 'Music', 'Photos', 'Notes', 'Clock', 'Store', 'Files', 'Camera', 'Chat', 'News', 'Health', 'Wallet', 'Games', 'Video', 'Books', 'Weather', 'Home', 'Voice', 'Docs', 'Radio', 'Fit', 'Pay', 'Cloud']
const TINTS = ['#f2f2f2', '#2f9bf0', '#ff9f1c', '#34c77b', '#f0484e', '#8e6cf0', '#1d1f24', '#22c3c9', '#f5d43c', '#ff6fa3']
const SHOWS = ['Tidewater', 'Ember Road', 'Greenfall', 'Night Signal', 'Red Harbor', 'Blue Meridian']

type Ctx = CanvasRenderingContext2D
type Palette = [string, string, string]

/** Long side of the canvas for each type, in pixels: enough to stay sharp when the camera is close. */
const RESOLUTION: Partial<Record<DeviceType, number>> = { phone: 1280, tablet: 1536, watch: 640, laptop: 1920, desktop: 2048, tv: 2048, foldable: 1536, handheld: 1536, speaker: 768, headset: 256, ereader: 1536, actioncam: 768 }
const GAMES = ['Ember Rally', 'Skyforge', 'Deep Lantern', 'Marrow Keep', 'Glasswing', 'Salt Road']

const cache = new Map<string, THREE.CanvasTexture>()

/** What the panel is, so the interface can say so: its name and refresh rate, and whether it is a backlit LCD. */
export interface ScreenInfo {
  name: string
  hz: number
  lcd: boolean
  /** The panel's level (0 = LCD): how fine its pixels are, how deep its blacks and how rich its colour. */
  level?: number
}

/**
 * What a panel of a given level does to the picture. Low levels have coarse pixels (shown as blocks with the dark
 * gaps between them), washed-out colour and lifted blacks; each level up is finer, richer and deeper.
 */
export function panelLook(level: number, lcd: boolean) {
  const lv = Math.max(0, Math.min(8, level))
  return {
    /** Pixels across the artwork, as a share of the full-resolution canvas. */
    density: [0.38, 0.52, 0.68, 0.84, 1, 1, 1, 1, 1][lv],
    saturate: lcd ? 0.78 : 0.96 + 0.04 * lv,
    contrast: lcd ? 0.84 : 1 + 0.025 * lv,
    /** Grey added over everything: the backlight showing through black. */
    lift: lcd ? 0.12 : 0,
  }
}

/**
 * Texture for a screen of the given size (any unit; only the ratio matters).
 * `detail` below 1 gives a smaller canvas for thumbnails.
 */
export function screenTexture(type: DeviceType, wallpaper: number, width: number, height: number, detail = 1, panel?: ScreenInfo, look?: OsLook): THREE.CanvasTexture {
  // a negative wallpaper means "the system's own": the OS look's wallpaper where there is one, else the first
  const index = wallpaper < 0 ? 0 : wallpaper % WALLPAPERS.length
  // aspect in 3% steps: close enough that nothing looks stretched, coarse enough to cache
  const step = Math.round(Math.log(width / height) / 0.03)
  // an operating system's look replaces the home screen of the devices that show one
  const kind = OS_SCREEN_OF[type]
  const own = look && kind ? look : undefined
  // the device's own wallpaper wins over the system's default one
  const os = own && wallpaper < 0 ? own : own ? { ...own, wallpaper: WALLPAPERS[index][0], wallpaper2: WALLPAPERS[index][1], wallStyle: 'linear' as const } : undefined
  const key = `${type}|${index}|${step}|${detail < 1 ? 's' : 'l'}|${panel ? `${panel.name}@${panel.hz}:${panel.level ?? ''}` : ''}|${os ? JSON.stringify(os) : ''}`
  const hit = cache.get(key)
  if (hit) {
    // keep the most recently used at the end
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const aspect = Math.exp(step * 0.03)
  const long = Math.max(256, Math.round((RESOLUTION[type] ?? 1024) * (detail < 1 ? 0.4 : 1)))
  const c = document.createElement('canvas')
  c.width = Math.round(aspect >= 1 ? long : long * aspect)
  c.height = Math.round(aspect >= 1 ? long / aspect : long)
  const g = c.getContext('2d')!
  const pal = WALLPAPERS[index]
  // what the interface says about its own panel, e.g. "OLED 120 Hz"
  const tag = panel ? (type === 'watch' ? panel.name : `${panel.name}  ${panel.hz} Hz`) : ''
  if (os) {
    paintOsLook(g, os, c.width, c.height, kind)
    if (tag && (kind === 'phone' || kind === 'tablet')) {
      // the interface still names its panel, on a chip under the status bar
      const u = Math.min(c.width, c.height * 0.6) / 100
      g.font = `600 ${2.6 * u}px ${FONT}`
      const tw = g.measureText(tag).width + 5 * u
      box(g, c.width / 2 - tw / 2, 9.5 * u, tw, 4.4 * u, 2.2 * u, '#000000', 0.38)
      text(g, tag, c.width / 2, 11.7 * u, 2.6 * u, { weight: 600, align: 'center', alpha: 0.92 })
    }
  } else if (type === 'watch') drawWatch(g, c.width, c.height, pal, tag)
  else if (type === 'tv') drawTv(g, c.width, c.height, pal, index, tag)
  else if (type === 'laptop' || type === 'desktop') drawDesktop(g, c.width, c.height, pal, index, type === 'laptop', tag)
  else if (type === 'tablet' || type === 'foldable') drawTablet(g, c.width, c.height, pal, index, tag)
  else if (type === 'handheld') drawHandheld(g, c.width, c.height, pal, index, tag)
  else if (type === 'speaker') drawSpeaker(g, c.width, c.height, pal, index, tag)
  else if (type === 'headset') drawLens(g, c.width, c.height, pal, index)
  else if (type === 'ereader') drawEreader(g, c.width, c.height, index, tag)
  else if (type === 'actioncam') drawActioncam(g, c.width, c.height, pal, index, tag)
  else drawPhone(g, c.width, c.height, pal, index, tag)
  // e-ink is paper, not a lit panel: it has its own look
  if (panel && type !== 'ereader') showPanel(c, panelLook(panel.level ?? (panel.lcd ? 0 : 3), panel.lcd), detail < 1)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  cache.set(key, t)
  if (cache.size > 64) {
    const oldest = cache.keys().next().value!
    cache.get(oldest)?.dispose()
    cache.delete(oldest)
  }
  return t
}

/**
 * Passes the finished artwork through the panel: its colour and contrast, its pixels (coarse ones drawn as blocks
 * with dark gaps between, so a cheap screen looks it from up close) and, for a backlit LCD, greyed blacks and light
 * bleeding in at the edges. A thumbnail only gets the colour.
 */
function showPanel(c: HTMLCanvasElement, p: ReturnType<typeof panelLook>, small: boolean) {
  const w = c.width
  const h = c.height
  const src = document.createElement('canvas')
  src.width = w
  src.height = h
  src.getContext('2d')!.drawImage(c, 0, 0)
  const g = c.getContext('2d')!
  const tone = `saturate(${p.saturate}) contrast(${p.contrast})`
  g.clearRect(0, 0, w, h)
  if (!small && p.density < 1) {
    const pw = Math.max(16, Math.round(w * p.density))
    const ph = Math.max(16, Math.round(h * p.density))
    const low = document.createElement('canvas')
    low.width = pw
    low.height = ph
    const lg = low.getContext('2d')!
    lg.filter = tone
    lg.drawImage(src, 0, 0, pw, ph)
    g.imageSmoothingEnabled = false
    g.drawImage(low, 0, 0, w, h)
    g.imageSmoothingEnabled = true
    const cx = w / pw
    const cy = h / ph
    if (Math.min(cx, cy) >= 2.4) {
      // the black matrix between the pixels
      g.fillStyle = 'rgba(0,0,0,0.22)'
      const lx = Math.max(1, cx * 0.16)
      const ly = Math.max(1, cy * 0.16)
      for (let i = 1; i < pw; i++) g.fillRect(Math.round(i * cx - lx / 2), 0, lx, h)
      for (let j = 1; j < ph; j++) g.fillRect(0, Math.round(j * cy - ly / 2), w, ly)
    }
  } else {
    g.filter = tone
    g.drawImage(src, 0, 0)
    g.filter = 'none'
  }
  if (p.lift > 0) {
    // a backlight cannot be switched off pixel by pixel: black is a glowing grey, brighter where the light enters at the edges
    g.fillStyle = `rgba(140,150,168,${p.lift})`
    g.fillRect(0, 0, w, h)
    const m = Math.min(w, h)
    for (const [x, y] of [[0, h], [w, h], [w / 2, h], [0, 0], [w, 0]]) {
      const bleed = g.createRadialGradient(x, y, 0, x, y, m * 0.45)
      bleed.addColorStop(0, 'rgba(200,210,230,0.16)')
      bleed.addColorStop(1, 'rgba(200,210,230,0)')
      g.fillStyle = bleed
      g.fillRect(0, 0, w, h)
    }
  }
}

// ---------------------------------------------------------------- shared drawing

/** Gradient sky with layered dunes. Scales with the canvas, so it looks the same at any shape. */
function wallpaper(g: Ctx, w: number, h: number, [a, b, hi]: Palette, seed: number, x0 = 0, y0 = 0) {
  const grad = g.createLinearGradient(x0, y0, x0 + w, y0 + h)
  grad.addColorStop(0, a)
  grad.addColorStop(0.6, b)
  grad.addColorStop(1, a)
  g.fillStyle = grad
  g.fillRect(x0, y0, w, h)
  const s = Math.max(w, h) / 1100
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 ? b : hi
    g.globalAlpha = 0.16 + i * 0.05
    g.beginPath()
    g.moveTo(x0, y0 + h)
    for (let x = 0; x <= w + 16 * s; x += 16 * s) g.lineTo(x0 + x, y0 + h * (0.56 + i * 0.1) + Math.sin(x / (90 * s) + i * 1.7 + seed) * 60 * s * Math.min(1, h / w + 0.35))
    g.lineTo(x0 + w, y0 + h)
    g.fill()
  }
  g.globalAlpha = 1
}

function text(g: Ctx, s: string, x: number, y: number, size: number, opts: { weight?: number; align?: CanvasTextAlign; color?: string; alpha?: number } = {}) {
  g.font = `${opts.weight ?? 400} ${size}px ${FONT}`
  g.textAlign = opts.align ?? 'left'
  g.textBaseline = 'middle'
  g.fillStyle = opts.color ?? '#ffffff'
  g.globalAlpha = opts.alpha ?? 1
  g.fillText(s, x, y)
  g.globalAlpha = 1
}

function box(g: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, alpha = 1) {
  g.globalAlpha = alpha
  g.fillStyle = fill
  g.beginPath()
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2))
  g.fill()
  g.globalAlpha = 1
}

/** An app icon: a rounded square with a simple glyph, always drawn square. */
function icon(g: Ctx, cx: number, cy: number, size: number, n: number, pal: Palette) {
  const colors = [...TINTS, pal[1], pal[2]]
  const fill = colors[(n * 7 + 3) % colors.length]
  box(g, cx - size / 2, cy - size / 2, size, size, size * 0.24, fill)
  const dark = ['#f2f2f2', '#f5d43c', pal[2]].includes(fill)
  g.fillStyle = dark ? '#1d1f24' : '#ffffff'
  g.strokeStyle = g.fillStyle
  g.globalAlpha = 0.92
  g.lineWidth = size * 0.09
  g.lineCap = 'round'
  const r = size * 0.24
  g.beginPath()
  switch (n % 6) {
    case 0:
      g.arc(cx, cy, r, 0, Math.PI * 2)
      g.fill()
      break
    case 1:
      g.arc(cx, cy, r, 0, Math.PI * 2)
      g.stroke()
      break
    case 2:
      g.moveTo(cx - r * 0.7, cy - r)
      g.lineTo(cx + r, cy)
      g.lineTo(cx - r * 0.7, cy + r)
      g.closePath()
      g.fill()
      break
    case 3:
      for (const dy of [-1, 0, 1]) {
        g.moveTo(cx - r, cy + dy * r * 0.75)
        g.lineTo(cx + r * (dy === 1 ? 0.3 : 1), cy + dy * r * 0.75)
      }
      g.stroke()
      break
    case 4:
      g.moveTo(cx, cy - r * 1.1)
      g.lineTo(cx + r * 1.1, cy)
      g.lineTo(cx, cy + r * 1.1)
      g.lineTo(cx - r * 1.1, cy)
      g.closePath()
      g.fill()
      break
    default:
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.moveTo(cx + dx * r * 0.6 + r * 0.32, cy + dy * r * 0.6)
        g.arc(cx + dx * r * 0.6, cy + dy * r * 0.6, r * 0.32, 0, Math.PI * 2)
      }
      g.fill()
  }
  g.globalAlpha = 1
}

/** Signal bars and a battery, right-aligned at x. */
function statusIcons(g: Ctx, x: number, cy: number, u: number, battery = true) {
  g.fillStyle = '#ffffff'
  let right = x
  if (battery) {
    const bw = u * 2.3
    const bh = u * 1.1
    g.globalAlpha = 0.5
    g.strokeStyle = '#ffffff'
    g.lineWidth = Math.max(1, u * 0.12)
    g.beginPath()
    g.roundRect(right - bw, cy - bh / 2, bw, bh, bh * 0.28)
    g.stroke()
    g.globalAlpha = 1
    g.beginPath()
    g.roundRect(right - bw + u * 0.2, cy - bh / 2 + u * 0.2, (bw - u * 0.4) * 0.8, bh - u * 0.4, bh * 0.15)
    g.fill()
    right -= bw + u * 0.9
  }
  for (let i = 0; i < 4; i++) {
    const bh = u * (0.4 + i * 0.25)
    g.beginPath()
    g.roundRect(right - (4 - i) * u * 0.45, cy + u * 0.55 - bh, u * 0.3, bh, u * 0.08)
    g.fill()
  }
}

// ---------------------------------------------------------------- phone and tablet

function drawPhone(g: Ctx, w: number, h: number, pal: Palette, seed: number, tag: string) {
  wallpaper(g, w, h, pal, seed)
  // one unit is a hundredth of the width, or less on a screen too squat to fit a phone layout
  const u = Math.min(w, h * 0.6) / 100
  const cols = Math.max(4, Math.min(6, Math.round(w / (23 * u))))
  // status bar: time on the left, so a centred camera hole covers nothing
  text(g, '09:41', 7 * u, 5.4 * u, 4 * u, { weight: 600 })
  statusIcons(g, w - 7 * u, 5.4 * u, 2.6 * u)
  // clock widget
  text(g, '09:41', w / 2, 24 * u, 21 * u, { weight: 300, align: 'center' })
  text(g, 'Saturday 10 October', w / 2, 38 * u, 4.4 * u, { align: 'center', alpha: 0.85 })
  if (tag) {
    g.font = `600 ${3 * u}px ${FONT}`
    const tw = g.measureText(tag).width + 6 * u
    box(g, w / 2 - tw / 2, 42.4 * u, tw, 5 * u, 2.5 * u, '#000000', 0.32)
    text(g, tag, w / 2, 45 * u, 3 * u, { weight: 600, align: 'center', alpha: 0.92 })
  }
  // dock
  const dockH = 21 * u
  const dockY = h - dockH - 6 * u
  box(g, 4 * u, dockY, w - 8 * u, dockH, 7 * u, '#ffffff', 0.2)
  const pitch = w / cols
  for (let i = 0; i < cols; i++) icon(g, pitch * (i + 0.5), dockY + dockH / 2, 14.5 * u, i + 20, pal)
  box(g, w / 2 - 16 * u, h - 3 * u, 32 * u, 1.1 * u, u, '#ffffff', 0.85)
  // as many rows of apps as fit between the clock and the dock
  const top = (tag ? 52 : 48) * u
  const rowH = 22.5 * u
  const rows = Math.max(0, Math.min(5, Math.floor((dockY - 3 * u - top) / rowH)))
  const y0 = dockY - 3 * u - rows * rowH
  let n = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === rows - 1 && c >= cols - 1) continue
      const cx = pitch * (c + 0.5)
      const cy = y0 + r * rowH + 8.5 * u
      icon(g, cx, cy, 14.5 * u, n, pal)
      text(g, APPS[n % APPS.length], cx, cy + 11.4 * u, 2.9 * u, { align: 'center', alpha: 0.95 })
      n++
    }
  }
}

function drawTablet(g: Ctx, w: number, h: number, pal: Palette, seed: number, tag: string) {
  wallpaper(g, w, h, pal, seed)
  const u = Math.min(w, h) / 100
  text(g, '09:41', 3.4 * u, 3.2 * u, 2.3 * u, { weight: 600 })
  text(g, 'Sat 10 Oct', 11 * u, 3.2 * u, 2.3 * u, { alpha: 0.85 })
  if (tag) text(g, tag, w / 2, 3.2 * u, 2.1 * u, { weight: 600, align: 'center', alpha: 0.8 })
  statusIcons(g, w - 3.4 * u, 3.2 * u, 1.6 * u)
  // dock: a centred tray sized to its icons
  const size = 8.4 * u
  const gap = 2.6 * u
  const dockN = Math.max(5, Math.min(9, Math.floor((w * 0.8) / (size + gap))))
  const dockW = dockN * size + (dockN + 1) * gap
  const dockH = size + 2 * gap
  const dockY = h - dockH - 3 * u
  box(g, w / 2 - dockW / 2, dockY, dockW, dockH, 3.6 * u, '#ffffff', 0.2)
  for (let i = 0; i < dockN; i++) icon(g, w / 2 - dockW / 2 + gap + size / 2 + i * (size + gap), dockY + dockH / 2, size, i + 30, pal)
  // grid: wider than a phone's, with two widgets in the top-left corner
  const mx = 7 * u
  const cols = Math.max(4, Math.floor((w - 2 * mx) / (15.5 * u)))
  const pitchX = (w - 2 * mx) / cols
  const top = 10 * u
  const pitchY = 15.5 * u
  const rows = Math.max(1, Math.min(5, Math.floor((dockY - 3 * u - top) / pitchY)))
  const cell = (c: number, r: number): [number, number] => [mx + pitchX * (c + 0.5), top + pitchY * r + 6.5 * u]
  const wide = rows >= 2 && cols >= 5
  if (wide) {
    // clock card and a calendar card, each two cells square
    const [ax, ay] = cell(0, 0)
    const [bx, by] = cell(1, 1)
    const cw = bx - ax + size
    const ch = by - ay + size
    box(g, ax - size / 2, ay - size / 2, cw, ch, 3 * u, '#0c0e12', 0.55)
    text(g, '09:41', ax - size / 2 + cw / 2, ay - size / 2 + ch * 0.44, ch * 0.34, { weight: 300, align: 'center' })
    text(g, 'Saturday', ax - size / 2 + cw / 2, ay - size / 2 + ch * 0.76, ch * 0.11, { align: 'center', alpha: 0.8 })
    const [cx2] = cell(2, 0)
    box(g, cx2 - size / 2, ay - size / 2, cw, ch, 3 * u, '#f4f4f1', 0.94)
    text(g, 'OCT', cx2 - size / 2 + cw * 0.12, ay - size / 2 + ch * 0.2, ch * 0.12, { weight: 700, color: '#d8453e' })
    text(g, '10', cx2 - size / 2 + cw * 0.12, ay - size / 2 + ch * 0.5, ch * 0.36, { weight: 300, color: '#1d1f24' })
    for (let i = 0; i < 2; i++) box(g, cx2 - size / 2 + cw * 0.12, ay - size / 2 + ch * (0.74 + i * 0.1), cw * (0.62 - i * 0.2), ch * 0.045, u, [pal[1], '#8a8f98'][i], 0.9)
  }
  let n = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (wide && r < 2 && c < 4) continue
      const [cx, cy] = cell(c, r)
      icon(g, cx, cy, size, n, pal)
      text(g, APPS[n % APPS.length], cx, cy + 6.3 * u, 1.75 * u, { align: 'center', alpha: 0.95 })
      n++
    }
  }
}

// ---------------------------------------------------------------- watch

function drawWatch(g: Ctx, w: number, h: number, pal: Palette, tag: string) {
  g.fillStyle = '#000000'
  g.fillRect(0, 0, w, h)
  const cx = w / 2
  const cy = h / 2
  // everything stays inside the largest circle that fits, so round and square cases both work
  const r = Math.min(w, h) / 2
  text(g, 'SAT 10', cx, cy - r * 0.5, r * 0.15, { weight: 600, align: 'center', color: pal[2] })
  text(g, '10:09', cx, cy - r * 0.12, r * 0.56, { weight: 600, align: 'center' })
  // three complications along the bottom: activity rings, heart rate, battery
  const cr = r * 0.17
  const y = cy + r * 0.46
  const ring = (x: number, radius: number, share: number, color: string) => {
    g.lineCap = 'round'
    g.lineWidth = cr * 0.24
    g.strokeStyle = color
    g.globalAlpha = 0.25
    g.beginPath()
    g.arc(x, y, radius, 0, Math.PI * 2)
    g.stroke()
    g.globalAlpha = 1
    g.beginPath()
    g.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share)
    g.stroke()
  }
  const left = cx - r * 0.44
  ring(left, cr, 0.78, '#f0484e')
  ring(left, cr * 0.68, 0.6, '#34c77b')
  ring(left, cr * 0.36, 0.85, '#2f9bf0')
  text(g, '72', cx, y - cr * 0.12, cr * 0.95, { weight: 600, align: 'center' })
  text(g, 'BPM', cx, y + cr * 0.7, cr * 0.42, { weight: 600, align: 'center', color: '#f0484e' })
  const right = cx + r * 0.44
  ring(right, cr, 0.84, pal[2])
  text(g, '84', right, y, cr * 0.8, { weight: 600, align: 'center' })
  if (tag) text(g, tag.toUpperCase(), cx, cy + r * 0.8, r * 0.085, { weight: 600, align: 'center', alpha: 0.55 })
}

// ---------------------------------------------------------------- laptop and desktop

function drawDesktop(g: Ctx, w: number, h: number, pal: Palette, seed: number, portable: boolean, tag: string) {
  wallpaper(g, w, h, pal, seed)
  const u = h / 100
  // menu bar
  const bar = 3.6 * u
  box(g, 0, 0, w, bar, 0, '#000000', 0.38)
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(2.6 * u, bar / 2, 0.9 * u, 0, Math.PI * 2)
  g.fill()
  let x = 5.4 * u
  ;['Desk', 'File', 'Edit', 'View', 'Go', 'Window', 'Help'].forEach((m, i) => {
    text(g, m, x, bar / 2 + 0.1 * u, 1.75 * u, { weight: i === 0 ? 700 : 400, alpha: 0.95 })
    x += g.measureText(m).width + 2.4 * u
  })
  text(g, 'Sat 10 Oct   09:41', w - 2.4 * u, bar / 2 + 0.1 * u, 1.75 * u, { align: 'right', alpha: 0.95 })
  statusIcons(g, w - 21 * u, bar / 2, 1.25 * u, portable)
  if (tag) text(g, tag, w - (portable ? 31 : 27) * u, bar / 2 + 0.1 * u, 1.6 * u, { weight: 600, align: 'right', alpha: 0.8 })

  // dock
  const size = 5.6 * u
  const gap = 1.3 * u
  const dockN = Math.max(6, Math.min(12, Math.floor((w * 0.62) / (size + gap))))
  const dockW = dockN * size + (dockN + 1) * gap
  const dockH = size + 2 * gap
  const dockY = h - dockH - 1.4 * u
  box(g, w / 2 - dockW / 2, dockY, dockW, dockH, 2 * u, '#ffffff', 0.22)
  for (let i = 0; i < dockN; i++) icon(g, w / 2 - dockW / 2 + gap + size / 2 + i * (size + gap), dockY + dockH / 2, size, i + 40, pal)

  // main window: a file browser, sized from the height so its contents keep their shape
  const ww = Math.min(w * 0.56, 96 * u)
  const wh = 58 * u
  const wx = Math.max(4 * u, w * 0.5 - ww * 0.72)
  const wy = 10 * u
  window_(g, wx, wy, ww, wh, u, 'Projects', false)
  const side = Math.min(ww * 0.24, 20 * u)
  box(g, wx, wy + 4 * u, side, wh - 4 * u, 0, '#e3e5e9', 1)
  g.save()
  g.beginPath()
  g.rect(wx, wy + 4 * u, ww, wh - 4 * u)
  g.clip()
  ;['Recents', 'Projects', 'Desktop', 'Documents', 'Downloads', 'Shared'].forEach((s, i) => {
    if (i === 1) box(g, wx + u, wy + (6.1 + i * 3.6) * u, side - 2 * u, 3 * u, 0.7 * u, pal[1], 0.9)
    text(g, s, wx + 2.4 * u, wy + (7.7 + i * 3.6) * u, 1.6 * u, { color: i === 1 ? '#ffffff' : '#3c4048' })
  })
  // thumbnails in a grid
  const tile = 12 * u
  const tgap = 3 * u
  const tcols = Math.max(1, Math.floor((ww - side - tgap) / (tile + tgap)))
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < tcols; c++) {
      const tx = wx + side + tgap + c * (tile + tgap)
      const ty = wy + 7 * u + r * (tile * 0.75 + 6.4 * u)
      const k = r * tcols + c
      box(g, tx, ty, tile, tile * 0.75, 0.9 * u, [pal[1], pal[2], pal[0], '#8a8f98', '#2f9bf0'][k % 5], 1)
      box(g, tx + tile * 0.12, ty + tile * 0.4, tile * 0.5, tile * 0.24, 0.5 * u, '#ffffff', 0.35)
      text(g, ['Launch plan', 'Renders', 'Budget', 'Keynote', 'Notes', 'Roadmap', 'Press kit', 'Samples'][k % 8], tx + tile / 2, ty + tile * 0.75 + 2.2 * u, 1.5 * u, { align: 'center', color: '#2a2d33' })
    }
  }
  g.restore()

  // a second, dark window overlapping it: a music player
  const pw = Math.min(40 * u, w * 0.3)
  const ph = 36 * u
  const px = Math.min(w - pw - 4 * u, wx + ww - pw * 0.3)
  const py = wy + 16 * u
  if (px > wx + ww * 0.45) {
    window_(g, px, py, pw, ph, u, 'Now playing', true)
    const art = Math.min(pw - 6 * u, 16 * u)
    wallpaperTile(g, px + 3 * u, py + 6.5 * u, art, art, pal, seed + 2, 1.2 * u)
    text(g, SHOWS[(seed + 3) % SHOWS.length], px + 3 * u, py + 26.5 * u, 2.1 * u, { weight: 600 })
    text(g, 'The Quiet Hours', px + 3 * u, py + 29.6 * u, 1.6 * u, { alpha: 0.6 })
    box(g, px + 3 * u, py + 32.6 * u, pw - 6 * u, 0.5 * u, u, '#ffffff', 0.25)
    box(g, px + 3 * u, py + 32.6 * u, (pw - 6 * u) * 0.42, 0.5 * u, u, pal[2], 1)
  }
}

function window_(g: Ctx, x: number, y: number, w: number, h: number, u: number, title: string, dark: boolean) {
  // a soft edge so the window lifts off the wallpaper
  box(g, x - 0.3 * u, y - 0.2 * u, w + 0.6 * u, h + 0.9 * u, 1.6 * u, '#000000', 0.28)
  box(g, x, y, w, h, 1.3 * u, dark ? '#191b20' : '#f5f6f8', 1)
  g.save()
  g.beginPath()
  g.roundRect(x, y, w, h, 1.3 * u)
  g.clip()
  box(g, x, y, w, 4 * u, 0, dark ? '#23262d' : '#d9dce1', 1)
  g.restore()
  ;['#f0605a', '#f5bd4f', '#5fc454'].forEach((c, i) => {
    g.fillStyle = c
    g.beginPath()
    g.arc(x + (2.2 + i * 2) * u, y + 2 * u, 0.62 * u, 0, Math.PI * 2)
    g.fill()
  })
  text(g, title, x + w / 2, y + 2.1 * u, 1.6 * u, { align: 'center', weight: 600, color: dark ? '#d5d8de' : '#3c4048' })
}

/** A small rounded picture in the wallpaper's style, used for album and film art. */
function wallpaperTile(g: Ctx, x: number, y: number, w: number, h: number, pal: Palette, seed: number, r: number) {
  g.save()
  g.beginPath()
  g.roundRect(x, y, w, h, r)
  g.clip()
  wallpaper(g, w, h, pal, seed, x, y)
  g.restore()
}

// ---------------------------------------------------------------- TV

function drawTv(g: Ctx, w: number, h: number, pal: Palette, seed: number, tag: string) {
  const u = h / 100
  g.fillStyle = '#07080b'
  g.fillRect(0, 0, w, h)
  // hero art across the top, fading into the interface
  wallpaper(g, w, h * 0.66, pal, seed)
  const down = g.createLinearGradient(0, h * 0.2, 0, h * 0.66)
  down.addColorStop(0, 'rgba(7,8,11,0)')
  down.addColorStop(1, 'rgba(7,8,11,1)')
  g.fillStyle = down
  g.fillRect(0, h * 0.2, w, h * 0.47)
  const across = g.createLinearGradient(0, 0, Math.min(w * 0.6, 110 * u), 0)
  across.addColorStop(0, 'rgba(7,8,11,0.82)')
  across.addColorStop(1, 'rgba(7,8,11,0)')
  g.fillStyle = across
  g.fillRect(0, 0, w, h * 0.66)

  // top navigation
  const left = 6 * u
  g.fillStyle = pal[2]
  g.beginPath()
  g.arc(left + 1.4 * u, 6 * u, 1.4 * u, 0, Math.PI * 2)
  g.fill()
  let x = left + 6 * u
  ;['Home', 'Films', 'Series', 'Live', 'Apps'].forEach((m, i) => {
    text(g, m, x, 6 * u, 2.5 * u, { weight: i === 0 ? 700 : 400, alpha: i === 0 ? 1 : 0.65 })
    const tw = g.measureText(m).width
    if (i === 0) box(g, x, 8.2 * u, tw, 0.4 * u, u, '#ffffff', 1)
    x += tw + 4.4 * u
  })
  text(g, '09:41', w - left - 6 * u, 6 * u, 2.5 * u, { align: 'right', alpha: 0.8 })
  g.fillStyle = pal[1]
  g.beginPath()
  g.arc(w - left - 1.8 * u, 6 * u, 1.8 * u, 0, Math.PI * 2)
  g.fill()

  // the featured title
  text(g, 'NEW SERIES', left, 25 * u, 1.9 * u, { weight: 700, color: pal[2] })
  text(g, SHOWS[seed % SHOWS.length], left, 32.5 * u, 8.6 * u, { weight: 700 })
  text(g, `2026   Drama   8 episodes   4K${tag ? `   ${tag.replace('  ', ' at ')}` : ''}`, left, 40 * u, 2.1 * u, { alpha: 0.75 })
  box(g, left, 44 * u, 17 * u, 5.4 * u, 0.9 * u, '#ffffff', 1)
  g.fillStyle = '#0b0c0f'
  g.beginPath()
  g.moveTo(left + 4.2 * u, 45.6 * u)
  g.lineTo(left + 6.4 * u, 46.7 * u)
  g.lineTo(left + 4.2 * u, 47.8 * u)
  g.closePath()
  g.fill()
  text(g, 'Play', left + 8 * u, 46.8 * u, 2.3 * u, { weight: 700, color: '#0b0c0f' })
  box(g, left + 19 * u, 44 * u, 17 * u, 5.4 * u, 0.9 * u, '#ffffff', 0.18)
  text(g, '+  My list', left + 27.5 * u, 46.8 * u, 2.3 * u, { weight: 600, align: 'center' })

  // rows of 16:9 cards; the last row runs off the bottom like a real scrolling page
  const cw = 28 * u
  const ch = cw * 0.5625
  const gap = 2.2 * u
  const rows: [string, number][] = [['Continue watching', 58 * u], ['Top picks for you', 58 * u + ch + 9.5 * u]]
  rows.forEach(([label, y], r) => {
    text(g, label, left, y, 2.3 * u, { weight: 600, alpha: 0.9 })
    for (let i = 0; left + i * (cw + gap) < w; i++) {
      const tx = left + i * (cw + gap)
      const ty = y + 3 * u
      const k = (i + r * 3 + seed) % WALLPAPERS.length
      wallpaperTile(g, tx, ty, cw, ch, WALLPAPERS[k], i * 1.3 + r, 0.9 * u)
      text(g, SHOWS[(k + 1 + r) % SHOWS.length], tx + 1.6 * u, ty + ch - 2.6 * u, 1.9 * u, { weight: 700 })
      if (r === 0 && i < 3) {
        box(g, tx + 1.6 * u, ty + ch - 0.9 * u, cw - 3.2 * u, 0.4 * u, u, '#ffffff', 0.3)
        box(g, tx + 1.6 * u, ty + ch - 0.9 * u, (cw - 3.2 * u) * [0.7, 0.35, 0.5][i], 0.4 * u, u, '#ffffff', 1)
      }
      if (r === 0 && i === 0) {
        g.strokeStyle = '#ffffff'
        g.lineWidth = 0.45 * u
        g.beginPath()
        g.roundRect(tx - 0.5 * u, ty - 0.5 * u, cw + u, ch + u, 1.2 * u)
        g.stroke()
      }
    }
  })
}

// ---------------------------------------------------------------- handheld

/** A games launcher: a shelf of games with the first one picked, and the button prompts along the bottom. */
function drawHandheld(g: Ctx, w: number, h: number, pal: Palette, seed: number, tag: string) {
  const u = h / 100
  g.fillStyle = '#0a0c10'
  g.fillRect(0, 0, w, h)
  wallpaper(g, w, h, pal, seed)
  box(g, 0, 0, w, h, 0, '#06080b', 0.62)
  // status bar
  g.fillStyle = pal[2]
  g.beginPath()
  g.arc(6 * u, 7 * u, 2.6 * u, 0, Math.PI * 2)
  g.fill()
  text(g, 'Player One', 10.5 * u, 7.2 * u, 3.4 * u, { weight: 600 })
  text(g, '09:41', w - 21 * u, 7.2 * u, 3.4 * u, { align: 'right', alpha: 0.9 })
  statusIcons(g, w - 5 * u, 7 * u, 2.3 * u)
  if (tag) text(g, tag, w / 2, 7.2 * u, 2.9 * u, { weight: 600, align: 'center', alpha: 0.7 })

  // the shelf: one large tile, then smaller ones running off the right-hand edge
  const big = 46 * u
  const small = 34 * u
  const gap = 3 * u
  const top = 20 * u
  let x = 6 * u
  for (let i = 0; x < w; i++) {
    const size = i === 0 ? big : small
    const y = top + (big - size)
    wallpaperTile(g, x, y, size, size, WALLPAPERS[(seed + i * 2 + 1) % WALLPAPERS.length], seed + i * 1.7, 2 * u)
    if (i === 0) {
      g.strokeStyle = '#ffffff'
      g.lineWidth = 0.7 * u
      g.beginPath()
      g.roundRect(x - 1.1 * u, y - 1.1 * u, size + 2.2 * u, size + 2.2 * u, 2.8 * u)
      g.stroke()
      const shade = g.createLinearGradient(0, y + size * 0.5, 0, y + size)
      shade.addColorStop(0, 'rgba(0,0,0,0)')
      shade.addColorStop(1, 'rgba(0,0,0,0.7)')
      g.save()
      g.beginPath()
      g.roundRect(x, y, size, size, 2 * u)
      g.clip()
      g.fillStyle = shade
      g.fillRect(x, y, size, size)
      g.restore()
      text(g, GAMES[seed % GAMES.length], x + 3 * u, y + size - 5.5 * u, 4.4 * u, { weight: 700 })
    } else {
      text(g, GAMES[(seed + i) % GAMES.length], x + size / 2, y + size + 4 * u, 2.7 * u, { align: 'center', alpha: 0.75 })
    }
    x += size + gap
  }
  // what the picked game was doing
  text(g, 'Continue', 6 * u, top + big + 12.5 * u, 3.6 * u, { weight: 700 })
  text(g, 'Chapter 4   62% complete   Played 2 hours ago', 6 * u + 20 * u, top + big + 12.6 * u, 2.9 * u, { alpha: 0.6 })

  // prompts in the bottom right corner, then as many shortcuts as fit to the left of them
  const by = h - 9 * u
  let px = w - 6 * u
  for (const [key, label] of [['A', 'Start'], ['Y', 'Options']]) {
    text(g, label, px, by + 0.2 * u, 2.9 * u, { align: 'right', alpha: 0.85 })
    px -= g.measureText(label).width + 5 * u
    box(g, px - 2.4 * u, by - 2.4 * u, 4.8 * u, 4.8 * u, 2.4 * u, '#ffffff', 0.9)
    text(g, key, px, by + 0.25 * u, 2.9 * u, { weight: 700, align: 'center', color: '#0a0c10' })
    px -= 7 * u
  }
  ;['Store', 'Friends', 'Captures', 'Settings'].forEach((label, i) => {
    const cx = 9 * u + i * 21 * u
    if (cx + 19 * u > px) return
    box(g, cx - 3.4 * u, by - 3.4 * u, 6.8 * u, 6.8 * u, 3.4 * u, '#ffffff', i === 0 ? 0.9 : 0.16)
    text(g, label, cx + 5 * u, by + 0.2 * u, 2.7 * u, { alpha: 0.8 })
  })
}

// ---------------------------------------------------------------- speaker

/** A smart display at rest: the time, the weather, and what is playing. Everything stays inside the largest circle that fits, so a round screen works too. */
function drawSpeaker(g: Ctx, w: number, h: number, pal: Palette, seed: number, tag: string) {
  g.fillStyle = '#050608'
  g.fillRect(0, 0, w, h)
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) / 2
  const glow = g.createRadialGradient(cx, cy + r * 0.9, 0, cx, cy + r * 0.9, r * 1.9)
  glow.addColorStop(0, pal[1])
  glow.addColorStop(1, 'rgba(5,6,8,0)')
  g.globalAlpha = 0.5
  g.fillStyle = glow
  g.fillRect(0, 0, w, h)
  g.globalAlpha = 1
  text(g, 'SAT 10 OCT', cx, cy - r * 0.56, r * 0.1, { weight: 600, align: 'center', color: pal[2] })
  text(g, '09:41', cx, cy - r * 0.2, r * 0.5, { weight: 300, align: 'center' })
  // weather: a sun and the temperature
  const wy = cy + r * 0.22
  g.fillStyle = '#f5d43c'
  g.beginPath()
  g.arc(cx - r * 0.22, wy, r * 0.07, 0, Math.PI * 2)
  g.fill()
  text(g, '18\u00b0  Clear', cx - r * 0.1, wy + r * 0.005, r * 0.11, { alpha: 0.9 })
  // now playing
  const pw = r * 1.02
  const ph = r * 0.2
  const py = cy + r * 0.44
  box(g, cx - pw / 2, py, pw, ph, ph / 2, '#ffffff', 0.14)
  wallpaperTile(g, cx - pw / 2 + ph * 0.15, py + ph * 0.15, ph * 0.7, ph * 0.7, pal, seed + 2, ph * 0.35)
  text(g, SHOWS[(seed + 3) % SHOWS.length], cx - pw / 2 + ph * 1.05, py + ph * 0.52, r * 0.085, { weight: 600 })
  // the assistant's four dots
  ;['#2f9bf0', '#f0484e', '#f5d43c', '#34c77b'].forEach((col, i) => {
    g.fillStyle = col
    g.beginPath()
    g.arc(cx + (i - 1.5) * r * 0.075, cy + r * 0.8, r * 0.02, 0, Math.PI * 2)
    g.fill()
  })
  // a wide screen has room in its corners to name the panel
  if (tag && w > h * 1.3) text(g, tag, w - r * 0.14, r * 0.14, r * 0.075, { weight: 600, align: 'right', alpha: 0.5 })
}

// ---------------------------------------------------------------- headset

/** What one eye sees through a headset's lens: a room with windows floating in it, darkening towards the edge. */
function drawLens(g: Ctx, w: number, h: number, pal: Palette, seed: number) {
  wallpaper(g, w, h, pal, seed)
  const u = Math.min(w, h) / 100
  box(g, w * 0.2, h * 0.3, w * 0.36, h * 0.3, 3 * u, '#f4f5f7', 0.9)
  box(g, w * 0.2, h * 0.3, w * 0.36, h * 0.07, 3 * u, pal[1], 0.9)
  box(g, w * 0.6, h * 0.36, w * 0.22, h * 0.22, 3 * u, '#14161a', 0.85)
  box(g, w * 0.36, h * 0.68, w * 0.28, h * 0.06, 3 * u, '#ffffff', 0.5)
  const edge = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.min(w, h) * 0.56)
  edge.addColorStop(0, 'rgba(0,0,0,0)')
  edge.addColorStop(1, 'rgba(0,0,0,0.9)')
  g.fillStyle = edge
  g.fillRect(0, 0, w, h)
}
