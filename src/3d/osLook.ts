// The home screen of an operating system, painted onto a device's screen texture from its look: wallpaper and
// accent colours, the shape of the app icons, how the apps are laid out, the typeface, light or dark. Pure canvas
// drawing, sized from the canvas, so the same look reads alike on a phone, a tablet or a foldable.
import type { Company, GameState, OsLook } from '../sim/types'

/** The look of a company's own operating system before anything is chosen. */
export const DEFAULT_OS_LOOK: OsLook = { wallpaper: '#16324a', accent: '#ff8a3d', iconShape: 'squircle', layout: 'grid', font: 'sans', dark: true }

const FONTS: Record<OsLook['font'], string> = {
  sans: '"Segoe UI", system-ui, sans-serif',
  mono: '"Cascadia Mono", Consolas, "Courier New", monospace',
  serif: 'Georgia, "Times New Roman", serif',
}
const APPS = ['Mail', 'Maps', 'Music', 'Photos', 'Notes', 'Clock', 'Store', 'Files', 'Camera', 'Chat', 'News', 'Health', 'Wallet', 'Games', 'Video', 'Books', 'Weather', 'Home', 'Voice', 'Docs']
const TINTS = ['#2f9bf0', '#ff9f1c', '#34c77b', '#f0484e', '#8e6cf0', '#22c3c9', '#f5d43c', '#ff6fa3']

type Ctx = CanvasRenderingContext2D

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6)
  const n = parseInt(f, 16)
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0]
}
/** Relative luminance, 0 to 1. */
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** The colour mixed towards another by t. */
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a)
  const y = rgb(b)
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`
}

function rounded(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)))
}

/** An app icon of the look's shape: a filled shape in a tint with a simple white glyph. */
function appIcon(g: Ctx, look: OsLook, cx: number, cy: number, size: number, n: number) {
  const fill = n % 5 === 0 ? look.accent : TINTS[(n * 3 + 1) % TINTS.length]
  g.fillStyle = fill
  if (look.iconShape === 'circle') {
    g.beginPath()
    g.arc(cx, cy, size / 2, 0, Math.PI * 2)
  } else rounded(g, cx - size / 2, cy - size / 2, size, size, look.iconShape === 'squircle' ? size * 0.28 : size * 0.06)
  g.fill()
  const ink = lum(fill) > 0.45 ? '#15171b' : '#ffffff'
  g.fillStyle = ink
  g.strokeStyle = ink
  g.lineWidth = size * 0.09
  g.lineCap = 'round'
  const r = size * 0.22
  g.beginPath()
  switch (n % 4) {
    case 0:
      g.arc(cx, cy, r, 0, Math.PI * 2)
      g.stroke()
      break
    case 1:
      g.moveTo(cx - r * 0.7, cy - r)
      g.lineTo(cx + r, cy)
      g.lineTo(cx - r * 0.7, cy + r)
      g.closePath()
      g.fill()
      break
    case 2:
      for (const dy of [-1, 0, 1]) {
        g.moveTo(cx - r, cy + dy * r * 0.7)
        g.lineTo(cx + r, cy + dy * r * 0.7)
      }
      g.stroke()
      break
    default:
      g.rect(cx - r, cy - r, r * 2, r * 2)
      g.stroke()
  }
}

/**
 * Paints the home screen of an operating system with the given look over the whole of a w x h canvas.
 * A screen too wide for one column of phone layout (a tablet, an open foldable) gets more columns.
 */
export function paintOsLook(ctx: CanvasRenderingContext2D, look: OsLook, w: number, h: number) {
  const g = ctx
  const font = FONTS[look.font] ?? FONTS.sans
  const u = Math.min(w, h * 0.6) / 100
  const wide = w > h * 0.8
  // the wallpaper: the look's colour with two large quiet shapes in the accent
  g.fillStyle = look.wallpaper
  g.fillRect(0, 0, w, h)
  g.globalAlpha = 0.16
  g.fillStyle = look.accent
  g.beginPath()
  g.arc(w * 0.92, h * 0.18, Math.max(w, h) * 0.32, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 0.1
  g.beginPath()
  g.arc(w * 0.05, h * 0.86, Math.max(w, h) * 0.42, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1
  // ink that reads on the wallpaper, and the panels the apps sit on
  const light = lum(look.wallpaper) > 0.35
  const ink = light ? '#15171b' : '#f4f5f7'
  const panel = look.dark ? 'rgba(10,12,16,0.55)' : 'rgba(255,255,255,0.72)'
  const panelInk = look.dark ? '#f4f5f7' : '#15171b'
  const say = (s: string, x: number, y: number, size: number, opts: { weight?: number; align?: CanvasTextAlign; color?: string; alpha?: number } = {}) => {
    g.font = `${opts.weight ?? 400} ${size}px ${font}`
    g.textAlign = opts.align ?? 'left'
    g.textBaseline = 'middle'
    g.fillStyle = opts.color ?? ink
    g.globalAlpha = opts.alpha ?? 1
    g.fillText(s, x, y)
    g.globalAlpha = 1
  }
  // status bar: the time at the left, where a centred camera covers nothing; signal and battery at the right
  const bar = wide ? 3.4 * u : 5.4 * u
  say('09:41', (wide ? 3.5 : 7) * u, bar, (wide ? 2.4 : 4) * u, { weight: 600 })
  g.fillStyle = ink
  const sx = w - (wide ? 3.5 : 7) * u
  const su = wide ? 1.6 * u : 2.6 * u
  rounded(g, sx - su * 2.3, bar - su * 0.55, su * 2.3, su * 1.1, su * 0.3)
  g.fill()
  for (let i = 0; i < 4; i++) {
    const bh = su * (0.4 + i * 0.25)
    g.fillRect(sx - su * 3.2 - (4 - i) * su * 0.45, bar + su * 0.55 - bh, su * 0.3, bh)
  }
  // the clock, in the accent on a dark look and in ink on a light one
  const clockY = wide ? 13 * u : 22 * u
  const clockSize = wide ? 11 * u : 19 * u
  say('09:41', wide ? 8 * u : w / 2, clockY, clockSize, { weight: look.font === 'mono' ? 500 : 300, align: wide ? 'left' : 'center', color: look.dark && !light ? look.accent : ink })
  say('Saturday 10 October', wide ? 8.4 * u : w / 2, clockY + clockSize * 0.68, (wide ? 2.4 : 4.2) * u, { align: wide ? 'left' : 'center', alpha: 0.85 })
  // the home indicator
  g.fillStyle = ink
  g.globalAlpha = 0.8
  rounded(g, w / 2 - 16 * u, h - 3 * u, 32 * u, 1.1 * u, u)
  g.fill()
  g.globalAlpha = 1

  const top = wide ? 26 * u : clockY + clockSize * 0.68 + 9 * u
  const bottom = h - 7 * u
  if (look.layout === 'list') {
    // apps as rows on a panel, one column on a phone and two on a wider screen
    const cols = wide ? 2 : 1
    const mx = 6 * u
    const colW = (w - mx * (cols + 1)) / cols
    const rowH = (wide ? 7 : 11) * u
    const rows = Math.max(1, Math.floor((bottom - top - 2 * u) / rowH))
    for (let c = 0; c < cols; c++) {
      const x = mx + c * (colW + mx)
      g.fillStyle = panel
      rounded(g, x, top, colW, rows * rowH + 2 * u, look.iconShape === 'square' ? u * 0.6 : 4 * u)
      g.fill()
      for (let r = 0; r < rows; r++) {
        const n = c * rows + r
        const cy = top + u + r * rowH + rowH / 2
        appIcon(g, look, x + 3 * u + rowH * 0.32, cy, rowH * 0.62, n)
        say(APPS[n % APPS.length], x + 5 * u + rowH * 0.66, cy, rowH * 0.3, { color: panelInk, weight: 500 })
        if (r < rows - 1) {
          g.fillStyle = panelInk
          g.globalAlpha = 0.12
          g.fillRect(x + 5 * u + rowH * 0.66, cy + rowH / 2, colW - 8 * u - rowH * 0.66, Math.max(1, u * 0.15))
          g.globalAlpha = 1
        }
      }
    }
    return
  }
  if (look.layout === 'tiles') {
    // live tiles: a grid of square cells, some tiles two cells wide, each a block of colour with its name
    const cols = wide ? 6 : 4
    const gap = 1.6 * u
    const mx = 5 * u
    const cell = (w - 2 * mx - gap * (cols - 1)) / cols
    let x = 0
    let y = 0
    let n = 0
    while (top + y * (cell + gap) + cell <= bottom) {
      const span = (n % 5 === 0 || n % 7 === 3) && x + 2 <= cols ? 2 : 1
      const px = mx + x * (cell + gap)
      const py = top + y * (cell + gap)
      const tw = span * cell + (span - 1) * gap
      const fill = n % 4 === 0 ? look.accent : look.dark ? mix(TINTS[n % TINTS.length], '#0a0c10', 0.35) : TINTS[n % TINTS.length]
      g.fillStyle = fill
      rounded(g, px, py, tw, cell, look.iconShape === 'square' ? 0 : look.iconShape === 'circle' ? cell * 0.18 : cell * 0.1)
      g.fill()
      const tileInk = lum(fill) > 0.45 ? '#15171b' : '#ffffff'
      g.strokeStyle = tileInk
      g.lineWidth = cell * 0.05
      g.beginPath()
      g.arc(px + cell * 0.32, py + cell * 0.34, cell * 0.13, 0, Math.PI * 2)
      g.stroke()
      say(APPS[n % APPS.length], px + cell * 0.14, py + cell * 0.8, cell * 0.15, { color: tileInk, weight: 600 })
      n++
      x += span
      if (x >= cols) {
        x = 0
        y++
      }
    }
    return
  }
  // grid: rows of icons with names, and a dock on a panel along the bottom
  const cols = wide ? Math.max(6, Math.round(w / (17 * u))) : Math.max(4, Math.min(6, Math.round(w / (23 * u))))
  const size = wide ? 9 * u : 14.5 * u
  const dockH = size + (wide ? 4 : 6.5) * u
  const dockY = bottom - dockH
  g.fillStyle = panel
  rounded(g, 4 * u, dockY, w - 8 * u, dockH, look.iconShape === 'square' ? u : 7 * u)
  g.fill()
  const pitch = (w - 8 * u) / cols
  for (let i = 0; i < cols; i++) appIcon(g, look, 4 * u + pitch * (i + 0.5), dockY + dockH / 2, size, i + 10)
  const rowH = size * 1.55
  const rows = Math.max(0, Math.min(6, Math.floor((dockY - 3 * u - top) / rowH)))
  let n = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = 4 * u + pitch * (c + 0.5)
      const cy = top + r * rowH + size / 2
      appIcon(g, look, cx, cy, size, n)
      say(APPS[n % APPS.length], cx, cy + size * 0.78, size * 0.2, { align: 'center', alpha: 0.95 })
      n++
    }
  }
}

/**
 * The look of the operating system a company's devices run, or undefined for the stock system (which keeps the
 * screens' own artwork). The player's own system shows its chosen look, or one in the company colour until one is chosen.
 */
export function osLookOf(g: GameState, companyId: string): OsLook | undefined {
  if (companyId !== 'player' || !g.os?.own) return undefined
  if (g.os.look) return g.os.look
  const me = g.companies.find((c: Company) => c.id === 'player')
  const accent = me?.color ?? DEFAULT_OS_LOOK.accent
  // the same object for the same colour, so a view keyed on the look is not rebuilt on every tick
  const hit = derived.get(accent)
  if (hit) return hit
  const x = rgb(accent)
  const y = rgb('#0b0e13')
  const wallpaper = `#${x.map((v, i) => Math.round(v + (y[i] - v) * 0.78).toString(16).padStart(2, '0')).join('')}`
  const look = { ...DEFAULT_OS_LOOK, accent, wallpaper }
  derived.set(accent, look)
  return look
}
const derived = new Map<string, OsLook>()
