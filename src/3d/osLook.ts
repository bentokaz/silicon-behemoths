// The screens of an operating system, painted onto a device's screen texture from its look: the wallpaper (one
// colour, a gradient or a generated pattern), the accent and panel colours, the shape, size and style of the app
// icons, how the apps are laid out, where the dock or taskbar sits, the widgets, the typeface and its weight, light
// or dark panels, and the lock screen. Every kind of screen gets the interface it would really have: a phone's
// home screen, a computer's desktop with its taskbar and windows, a television's rows of tiles, a console's shelf
// of games, a watch face, an e-reader's library. Pure canvas drawing, sized from the canvas, so a look reads alike
// at any size. Gradients are allowed here: they are the system's artwork, not the game's own interface.
import { DEFAULT_OS_LOOK, cleanLook, lookFor } from '../sim/tech'
import type { Company, DeviceType, GameState, OsLook } from '../sim/types'

export { DEFAULT_OS_LOOK }

/** The kinds of screen an operating system draws differently. */
export type OsScreen = 'phone' | 'tablet' | 'desktop' | 'watch' | 'tv' | 'console' | 'handheld' | 'ereader' | 'display'
export const OS_SCREEN_NAMES: Record<OsScreen, string> = { phone: 'Phone', tablet: 'Tablet', desktop: 'Computer', watch: 'Watch', tv: 'TV', console: 'Console', handheld: 'Handheld', ereader: 'E-reader', display: 'Smart display' }
/** Which kind of screen each device type shows, if it shows the system at all. */
export const OS_SCREEN_OF: Partial<Record<DeviceType, OsScreen>> = {
  phone: 'phone',
  foldable: 'tablet',
  tablet: 'tablet',
  laptop: 'desktop',
  desktop: 'desktop',
  tower: 'desktop',
  monitor: 'desktop',
  watch: 'watch',
  tv: 'tv',
  console: 'console',
  handheld: 'handheld',
  ereader: 'ereader',
  speaker: 'display',
}

const FONTS: Record<OsLook['font'], string> = {
  sans: '"Segoe UI", system-ui, sans-serif',
  mono: '"Cascadia Mono", Consolas, "Courier New", monospace',
  serif: 'Georgia, "Times New Roman", serif',
  rounded: '"Nunito", "Arial Rounded MT Bold", "Segoe UI", system-ui, sans-serif',
  condensed: '"Bahnschrift SemiCondensed", "Arial Narrow", "Roboto Condensed", sans-serif',
}
const WEIGHTS: Record<NonNullable<OsLook['weight']>, [number, number]> = { light: [300, 200], regular: [400, 300], bold: [700, 600] }
const APPS = ['Mail', 'Maps', 'Music', 'Photos', 'Notes', 'Clock', 'Store', 'Files', 'Camera', 'Chat', 'News', 'Health', 'Wallet', 'Games', 'Video', 'Books', 'Weather', 'Home', 'Voice', 'Docs']
const TINTS = ['#2f9bf0', '#ff9f1c', '#34c77b', '#f0484e', '#8e6cf0', '#22c3c9', '#f5d43c', '#ff6fa3']
const GAMES = ['Ember Rally', 'Skyforge', 'Deep Lantern', 'Marrow Keep', 'Glasswing', 'Salt Road', 'Nightfall', 'Tidecaller']
const BOOKS = ['The Lamp Room', 'Orchard Winter', 'Salt and Iron', 'A Field Guide', 'Northern Lines', 'Small Hours']

type Ctx = CanvasRenderingContext2D
type Look = Required<OsLook>

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
const hex = (c: [number, number, number]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
/** The colour mixed towards another by t, as hex. */
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a)
  const y = rgb(b)
  return hex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as [number, number, number])
}
const alpha = (c: string, a: number) => {
  const [r, g, b] = rgb(c)
  return `rgba(${r},${g},${b},${a})`
}
/** Repeatable scatter for the generated patterns. */
const rnd = (i: number, salt = 0) => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return v - Math.floor(v)
}

function rounded(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)))
}

/** Everything a painter needs: the checked look, its fonts and inks, and the size unit. */
class Painter {
  readonly L: Look
  readonly font: string
  readonly ink: string
  readonly panel: string
  readonly panelInk: string
  readonly round: number
  readonly iconK: number
  constructor(
    readonly g: Ctx,
    look: OsLook,
    readonly w: number,
    readonly h: number,
    readonly u: number,
    readonly t: number,
  ) {
    this.L = cleanLook(look)
    this.font = FONTS[this.L.font] ?? FONTS.sans
    // ink that reads on the wallpaper, and the panels the apps sit on
    const wallLum = (lum(this.L.wallpaper) + lum(this.L.wallStyle === 'solid' ? this.L.wallpaper : this.L.wallpaper2)) / 2
    this.ink = wallLum > 0.35 ? '#15171b' : '#f4f5f7'
    const surf = this.L.dark ? mix(this.L.surface, '#000000', lum(this.L.surface) > 0.3 ? 0.75 : 0) : mix(this.L.surface, '#ffffff', lum(this.L.surface) < 0.5 ? 0.86 : 0)
    this.panel = alpha(surf, this.L.dark ? 0.72 : 0.8)
    this.panelInk = lum(surf) > 0.4 ? '#15171b' : '#f4f5f7'
    this.round = { sharp: 0.1, soft: 1, round: 1.8 }[this.L.corners]
    this.iconK = { small: 0.8, medium: 1, large: 1.22 }[this.L.iconSize]
  }
  say(s: string, x: number, y: number, size: number, o: { weight?: number; align?: CanvasTextAlign; color?: string; alpha?: number; heading?: boolean; max?: number } = {}) {
    const g = this.g
    const [reg, head] = WEIGHTS[this.L.weight]
    g.font = `${o.weight ?? (o.heading ? head : reg)} ${size}px ${this.font}`
    g.textAlign = o.align ?? 'left'
    g.textBaseline = 'middle'
    g.fillStyle = o.color ?? this.ink
    g.globalAlpha = o.alpha ?? 1
    g.fillText(s, x, y, o.max)
    g.globalAlpha = 1
  }
  /** A panel in the look's surface colour, with the look's corners. */
  card(x: number, y: number, w: number, h: number, r: number, fill = this.panel) {
    this.g.fillStyle = fill
    rounded(this.g, x, y, w, h, r * this.round)
    this.g.fill()
  }
}

// ---------------------------------------------------------------- wallpaper

/** Paints the wallpaper over x, y, w, h: a colour, a gradient preset, or a pattern generated from the two colours. */
function wallpaper(p: Painter, x = 0, y = 0, w = p.w, h = p.h) {
  const { g, L, t } = p
  const a = L.wallpaper
  const b = L.wallpaper2
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  const big = Math.max(w, h)
  switch (L.wallStyle) {
    case 'solid':
      g.fillStyle = a
      g.fillRect(x, y, w, h)
      break
    case 'linear': {
      const gr = g.createLinearGradient(x, y, x + w, y + h)
      gr.addColorStop(0, a)
      gr.addColorStop(1, b)
      g.fillStyle = gr
      g.fillRect(x, y, w, h)
      break
    }
    case 'aurora': {
      g.fillStyle = b
      g.fillRect(x, y, w, h)
      // soft curtains of the two colours and the accent, drifting with time
      const bands: [string, number, number][] = [[a, 0.3, 0.55], [L.accent, 0.55, 0.3], [mix(a, '#ffffff', 0.25), 0.75, 0.35]]
      bands.forEach(([c, at, op], i) => {
        const cx = x + w * (at + 0.08 * Math.sin(t * 0.4 + i * 2))
        const gr = g.createRadialGradient(cx, y + h * (0.28 + i * 0.12), 0, cx, y + h * (0.28 + i * 0.12), big * 0.55)
        gr.addColorStop(0, alpha(c, op))
        gr.addColorStop(1, alpha(c, 0))
        g.fillStyle = gr
        g.fillRect(x, y, w, h)
      })
      break
    }
    case 'waves': {
      g.fillStyle = a
      g.fillRect(x, y, w, h)
      for (let i = 0; i < 6; i++) {
        const k = (i + 1) / 6
        g.fillStyle = mix(a, b, k)
        g.beginPath()
        const base = y + h * (0.32 + i * 0.12)
        g.moveTo(x, y + h)
        for (let s = 0; s <= 40; s++) {
          const px = x + (w * s) / 40
          g.lineTo(px, base + Math.sin(s * 0.32 + i * 1.3 + t * 0.6) * h * 0.035 + Math.sin(s * 0.11 + i) * h * 0.025)
        }
        g.lineTo(x + w, y + h)
        g.closePath()
        g.fill()
      }
      break
    }
    case 'grid': {
      const gr = g.createLinearGradient(x, y, x, y + h)
      gr.addColorStop(0, a)
      gr.addColorStop(1, b)
      g.fillStyle = gr
      g.fillRect(x, y, w, h)
      const step = big / 18
      g.strokeStyle = alpha(L.accent, 0.22)
      g.lineWidth = Math.max(1, big / 900)
      const off = (t * step * 0.2) % step
      for (let px = x - step + off; px < x + w + step; px += step) {
        g.beginPath()
        g.moveTo(px, y)
        g.lineTo(px, y + h)
        g.stroke()
      }
      for (let py = y - step + off; py < y + h + step; py += step) {
        g.beginPath()
        g.moveTo(x, py)
        g.lineTo(x + w, py)
        g.stroke()
      }
      break
    }
    case 'dots': {
      g.fillStyle = b
      g.fillRect(x, y, w, h)
      const step = big / 34
      for (let py = y; py < y + h + step; py += step) {
        for (let px = x; px < x + w + step; px += step) {
          // halftone: dots grow towards the lower left
          const k = Math.min(1, Math.max(0, 1 - Math.hypot((px - x) / w, (py - y - h) / h) / 1.1))
          g.fillStyle = mix(b, a, 0.3 + 0.7 * k)
          g.beginPath()
          g.arc(px, py, step * (0.12 + 0.36 * k), 0, Math.PI * 2)
          g.fill()
        }
      }
      break
    }
    case 'rings': {
      g.fillStyle = b
      g.fillRect(x, y, w, h)
      const cx = x + w * 0.85
      const cy = y + h * 0.2
      for (let i = 14; i >= 0; i--) {
        g.fillStyle = mix(b, i % 2 ? a : mix(a, L.accent, 0.35), 0.25 + 0.75 * (1 - i / 14))
        g.beginPath()
        g.arc(cx, cy, big * 0.09 * (i + 1 + ((t * 0.3) % 1)), 0, Math.PI * 2)
        g.fill()
      }
      break
    }
    case 'facets': {
      // a low-poly field: a jittered grid split into triangles, each shaded between the two colours
      const cols = 7
      const rows = Math.round((cols * h) / w) + 1
      const pt = (i: number, j: number): [number, number] => {
        const edge = i === 0 || j === 0 || i === cols || j === rows
        return [x + (w * i) / cols + (edge ? 0 : (rnd(i * 31 + j) - 0.5) * (w / cols) * 0.7), y + (h * j) / rows + (edge ? 0 : (rnd(i * 17 + j * 7, 2) - 0.5) * (h / rows) * 0.7)]
      }
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const q = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)]
          for (const [tri, s] of [[[q[0], q[1], q[2]], 0], [[q[0], q[2], q[3]], 1]] as const) {
            const k = Math.min(1, Math.max(0, (i + j) / (cols + rows) + (rnd(i * 13 + j * 5, s + 4) - 0.5) * 0.3))
            g.fillStyle = mix(a, b, k)
            g.beginPath()
            g.moveTo(tri[0][0], tri[0][1])
            g.lineTo(tri[1][0], tri[1][1])
            g.lineTo(tri[2][0], tri[2][1])
            g.closePath()
            g.fill()
            g.strokeStyle = g.fillStyle
            g.lineWidth = 1
            g.stroke()
          }
        }
      }
      break
    }
    default: {
      // radial: the second colour, with a glow of the first and two large quiet shapes in the accent
      g.fillStyle = b
      g.fillRect(x, y, w, h)
      const gr = g.createRadialGradient(x + w * 0.7, y + h * 0.2, 0, x + w * 0.7, y + h * 0.2, big * 0.9)
      gr.addColorStop(0, a)
      gr.addColorStop(1, alpha(a, 0))
      g.fillStyle = gr
      g.fillRect(x, y, w, h)
      g.globalAlpha = 0.14
      g.fillStyle = L.accent
      g.beginPath()
      g.arc(x + w * 0.92, y + h * 0.18, big * 0.32, 0, Math.PI * 2)
      g.fill()
      g.globalAlpha = 0.08
      g.beginPath()
      g.arc(x + w * 0.05, y + h * 0.86, big * 0.42, 0, Math.PI * 2)
      g.fill()
      g.globalAlpha = 1
    }
  }
  g.restore()
}

// ---------------------------------------------------------------- icons

function iconPath(g: Ctx, shape: Look['iconShape'], cx: number, cy: number, s: number) {
  const r = s / 2
  if (shape === 'circle') {
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
  } else if (shape === 'hexagon') {
    g.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3
      g.lineTo(cx + Math.cos(a) * r * 1.06, cy + Math.sin(a) * r * 1.06)
    }
    g.closePath()
  } else if (shape === 'leaf') {
    g.beginPath()
    g.roundRect(cx - r, cy - r, s, s, [r * 0.9, r * 0.15, r * 0.9, r * 0.15])
  } else rounded(g, cx - r, cy - r, s, s, shape === 'squircle' ? s * 0.28 : s * 0.06)
}

/** One of eight simple glyphs, drawn in the current fill and stroke. */
function glyph(g: Ctx, n: number, cx: number, cy: number, r: number) {
  g.beginPath()
  switch (n % 8) {
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
    case 3:
      g.rect(cx - r, cy - r * 0.7, r * 2, r * 1.4)
      g.moveTo(cx - r, cy - r * 0.7)
      g.lineTo(cx, cy + r * 0.1)
      g.lineTo(cx + r, cy - r * 0.7)
      g.stroke()
      break
    case 4:
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      }
      g.closePath()
      g.fill()
      break
    case 5:
      g.arc(cx, cy + r * 0.15, r * 0.85, Math.PI, 0)
      g.lineTo(cx + r * 0.85, cy + r * 0.7)
      g.lineTo(cx - r * 0.85, cy + r * 0.7)
      g.closePath()
      g.stroke()
      break
    case 6:
      g.moveTo(cx - r, cy + r)
      g.lineTo(cx - r * 0.2, cy - r * 0.3)
      g.lineTo(cx + r * 0.3, cy + r * 0.3)
      g.lineTo(cx + r, cy - r)
      g.stroke()
      break
    default:
      g.rect(cx - r, cy - r, r * 2, r * 2)
      g.stroke()
  }
}

/** An app icon in the look's shape and style. */
function appIcon(p: Painter, cx: number, cy: number, size: number, n: number) {
  const { g, L } = p
  const tint = n % 5 === 0 ? L.accent : TINTS[(n * 3 + 1) % TINTS.length]
  const r = size * 0.22
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.lineWidth = size * 0.085
  if (L.iconStyle === 'outline') {
    iconPath(g, L.iconShape, cx, cy, size * 0.94)
    g.fillStyle = alpha(p.L.dark ? '#000000' : '#ffffff', 0.25)
    g.fill()
    g.strokeStyle = tint
    g.lineWidth = size * 0.06
    g.stroke()
    g.fillStyle = tint
    g.strokeStyle = tint
    g.lineWidth = size * 0.085
    glyph(g, n, cx, cy, r)
    return
  }
  if (L.iconStyle === 'glyph') {
    // no plate of its own: the glyph alone in ink, on a faint shadow of the shape
    iconPath(g, L.iconShape, cx, cy, size)
    g.fillStyle = alpha(p.ink === '#15171b' ? '#ffffff' : '#000000', 0.18)
    g.fill()
    g.fillStyle = p.ink
    g.strokeStyle = p.ink
    glyph(g, n, cx, cy, r * 1.2)
    return
  }
  iconPath(g, L.iconShape, cx, cy, size)
  if (L.iconStyle === 'duotone') {
    g.fillStyle = mix(tint, L.dark ? '#0b0d12' : '#ffffff', 0.62)
    g.fill()
    g.fillStyle = tint
    g.strokeStyle = tint
  } else {
    const gr = g.createLinearGradient(cx, cy - size / 2, cx, cy + size / 2)
    gr.addColorStop(0, mix(tint, '#ffffff', 0.12))
    gr.addColorStop(1, mix(tint, '#000000', 0.12))
    g.fillStyle = gr
    g.fill()
    const ink = lum(tint) > 0.45 ? '#15171b' : '#ffffff'
    g.fillStyle = ink
    g.strokeStyle = ink
  }
  glyph(g, n, cx, cy, r)
}

// ---------------------------------------------------------------- widgets

const WIDGET_DRAW: Record<string, (p: Painter, x: number, y: number, w: number, h: number) => void> = {
  weather(p, x, y, w, h) {
    const s = Math.min(w, h)
    p.g.fillStyle = '#ffc93c'
    p.g.beginPath()
    p.g.arc(x + s * 0.32, y + h * 0.36, s * 0.14, 0, Math.PI * 2)
    p.g.fill()
    p.g.fillStyle = alpha('#ffffff', 0.85)
    p.g.beginPath()
    p.g.arc(x + s * 0.42, y + h * 0.44, s * 0.1, 0, Math.PI * 2)
    p.g.arc(x + s * 0.52, y + h * 0.41, s * 0.12, 0, Math.PI * 2)
    p.g.fill()
    p.say('21°', x + w - s * 0.12, y + h * 0.36, s * 0.3, { align: 'right', color: p.panelInk, heading: true })
    p.say('Sunny, light wind', x + s * 0.14, y + h * 0.78, s * 0.12, { color: p.panelInk, alpha: 0.7, max: w - s * 0.25 })
  },
  calendar(p, x, y, w, h) {
    const s = Math.min(w, h)
    p.say('SATURDAY', x + s * 0.14, y + h * 0.2, s * 0.1, { color: p.L.accent, weight: 700 })
    p.say('10', x + s * 0.14, y + h * 0.45, s * 0.3, { color: p.panelInk, heading: true })
    p.g.fillStyle = p.L.accent
    p.g.fillRect(x + s * 0.14, y + h * 0.66, s * 0.04, h * 0.2)
    p.say('Design review', x + s * 0.24, y + h * 0.71, s * 0.11, { color: p.panelInk, weight: 600, max: w - s * 0.3 })
    p.say('10:30', x + s * 0.24, y + h * 0.84, s * 0.1, { color: p.panelInk, alpha: 0.6 })
  },
  music(p, x, y, w, h) {
    const s = Math.min(w, h)
    const art = h * 0.5
    const gr = p.g.createLinearGradient(x, y, x + art, y + art)
    gr.addColorStop(0, p.L.accent)
    gr.addColorStop(1, mix(p.L.accent, '#4b2ad8', 0.7))
    p.g.fillStyle = gr
    rounded(p.g, x + s * 0.12, y + h * 0.14, art, art, art * 0.12 * p.round)
    p.g.fill()
    p.say('Low Tide', x + s * 0.18 + art, y + h * 0.26, s * 0.12, { color: p.panelInk, weight: 600, max: w - art - s * 0.25 })
    p.say('Harbour Lights', x + s * 0.18 + art, y + h * 0.42, s * 0.1, { color: p.panelInk, alpha: 0.6, max: w - art - s * 0.25 })
    p.g.fillStyle = alpha(p.panelInk, 0.2)
    p.g.fillRect(x + s * 0.12, y + h * 0.8, w - s * 0.24, s * 0.03)
    p.g.fillStyle = p.L.accent
    p.g.fillRect(x + s * 0.12, y + h * 0.8, (w - s * 0.24) * 0.42, s * 0.03)
  },
  battery(p, x, y, w, h) {
    const s = Math.min(w, h)
    const n = w > h * 1.4 ? 3 : 2
    for (let i = 0; i < n; i++) {
      const cx = x + (w * (i + 0.5)) / n
      const cy = y + h * 0.48
      const r = Math.min(w / n, h) * 0.3
      p.g.lineWidth = r * 0.22
      p.g.strokeStyle = alpha(p.panelInk, 0.18)
      p.g.beginPath()
      p.g.arc(cx, cy, r, 0, Math.PI * 2)
      p.g.stroke()
      p.g.strokeStyle = i === 0 ? '#34c77b' : p.L.accent
      p.g.beginPath()
      p.g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * [0.82, 0.56, 0.3][i])
      p.g.stroke()
      p.say(`${[82, 56, 30][i]}`, cx, cy, r * 0.62, { color: p.panelInk, align: 'center', weight: 600 })
    }
    p.say('Batteries', x + s * 0.12, y + h * 0.88, s * 0.1, { color: p.panelInk, alpha: 0.6 })
  },
  photos(p, x, y, w, h) {
    const g = p.g
    g.save()
    rounded(g, x + 2, y + 2, w - 4, h - 4, Math.min(w, h) * 0.12 * p.round)
    g.clip()
    const sky = g.createLinearGradient(x, y, x, y + h)
    sky.addColorStop(0, '#7fb8ff')
    sky.addColorStop(1, '#ffd6a0')
    g.fillStyle = sky
    g.fillRect(x, y, w, h)
    g.fillStyle = '#3d6b55'
    g.beginPath()
    g.moveTo(x, y + h)
    g.lineTo(x, y + h * 0.7)
    g.lineTo(x + w * 0.35, y + h * 0.45)
    g.lineTo(x + w * 0.6, y + h * 0.65)
    g.lineTo(x + w * 0.8, y + h * 0.5)
    g.lineTo(x + w, y + h * 0.66)
    g.lineTo(x + w, y + h)
    g.fill()
    g.restore()
    p.say('Memories', x + Math.min(w, h) * 0.12, y + h * 0.86, Math.min(w, h) * 0.11, { color: '#ffffff', weight: 700 })
  },
  steps(p, x, y, w, h) {
    const s = Math.min(w, h)
    const cx = x + s * 0.42
    const cy = y + h / 2
    ;['#f0484e', '#34c77b', '#2f9bf0'].forEach((c, i) => {
      const r = s * (0.3 - i * 0.075)
      p.g.lineWidth = s * 0.06
      p.g.strokeStyle = alpha(c, 0.25)
      p.g.beginPath()
      p.g.arc(cx, cy, r, 0, Math.PI * 2)
      p.g.stroke()
      p.g.strokeStyle = c
      p.g.beginPath()
      p.g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * [0.74, 0.9, 0.52][i])
      p.g.stroke()
    })
    if (w > h * 1.2) {
      p.say('6,420', x + s * 0.85, y + h * 0.42, s * 0.2, { color: p.panelInk, heading: true })
      p.say('steps', x + s * 0.85, y + h * 0.62, s * 0.11, { color: p.panelInk, alpha: 0.6 })
    }
  },
}

function widget(p: Painter, id: string, x: number, y: number, w: number, h: number) {
  p.card(x, y, w, h, Math.min(w, h) * 0.14)
  WIDGET_DRAW[id]?.(p, x, y, w, h)
}

/** The look's widgets in a row of cards across x..x+w, at most `max` of them. Returns the height taken. */
function widgetRow(p: Painter, x: number, y: number, w: number, h: number, max: number, gap: number): number {
  const list = p.L.widgets.slice(0, max)
  if (!list.length) return 0
  const cw = (w - gap * (list.length - 1)) / list.length
  list.forEach((id, i) => widget(p, id, x + i * (cw + gap), y, cw, h))
  return h
}

// ---------------------------------------------------------------- bars

function statusBar(p: Painter, y: number, size: number, pad: number) {
  const { g, w } = p
  p.say('09:41', pad, y, size, { weight: 600 })
  g.fillStyle = p.ink
  const sx = w - pad
  const su = size * 0.65
  rounded(g, sx - su * 2.3, y - su * 0.55, su * 2.3, su * 1.1, su * 0.3)
  g.fill()
  for (let i = 0; i < 4; i++) {
    const bh = su * (0.4 + i * 0.25)
    g.fillRect(sx - su * 3.2 - (4 - i) * su * 0.45, y + su * 0.55 - bh, su * 0.3, bh)
  }
}

/** The dock: a panel of icons along one edge. Returns the area left for the rest of the screen. */
function dock(p: Painter, area: { x: number; y: number; w: number; h: number }, size: number, count: number) {
  const L = p.L
  if (L.dock === 'none') {
    // floating: a short pill of icons that stands clear of every edge, over the wallpaper, with its own shadow
    const pad = size * 0.3
    const len = Math.min(area.w * 0.8, count * (size + pad) + pad)
    const thick = size + pad * 2
    const x = area.x + (area.w - len) / 2
    const y = area.y + area.h - thick - size * 0.9
    p.g.save()
    p.g.shadowColor = 'rgba(0,0,0,0.45)'
    p.g.shadowBlur = size * 0.6
    p.g.shadowOffsetY = size * 0.15
    p.card(x, y, len, thick, thick * 0.5)
    p.g.restore()
    const fit = Math.max(1, Math.floor((len - pad) / (size + pad)))
    for (let i = 0; i < Math.min(count, fit); i++) appIcon(p, x + pad + size / 2 + i * (size + pad), y + thick / 2, size, i + 10)
    return { ...area, h: area.h - thick - size * 1.3 }
  }
  const pad = size * 0.32
  const thick = size + pad * 2
  const along = L.dock === 'left' || L.dock === 'right'
  const len = Math.min(along ? area.h : area.w, count * (size + pad) + pad)
  const m = size * 0.2
  const x = L.dock === 'left' ? area.x + m : L.dock === 'right' ? area.x + area.w - thick - m : area.x + (area.w - len) / 2
  const y = L.dock === 'top' ? area.y + m : L.dock === 'bottom' ? area.y + area.h - thick - m : area.y + (area.h - len) / 2
  p.card(x, y, along ? thick : len, along ? len : thick, thick * 0.3)
  for (let i = 0; i < count; i++) {
    const at = pad + size / 2 + i * (size + pad)
    appIcon(p, along ? x + thick / 2 : x + at, along ? y + at : y + thick / 2, size, i + 10)
  }
  const used = thick + m * 2
  if (L.dock === 'bottom') return { ...area, h: area.h - used }
  if (L.dock === 'top') return { ...area, y: area.y + used, h: area.h - used }
  if (L.dock === 'left') return { ...area, x: area.x + used, w: area.w - used }
  return { ...area, w: area.w - used }
}

/** Apps in the look's layout over an area: a grid of icons with names, a list on a panel, or live tiles. */
function apps(p: Painter, a: { x: number; y: number; w: number; h: number }, size: number, cols: number, first = 0) {
  const { L, u } = p
  if (a.w <= 0 || a.h <= 0) return
  if (L.layout === 'list') {
    const lc = a.w > a.h * 0.9 ? 2 : 1
    const mx = 3 * u
    const colW = (a.w - mx * (lc + 1)) / lc
    const rowH = size * 0.95
    const rows = Math.max(1, Math.floor((a.h - 2 * u) / rowH))
    for (let c = 0; c < lc; c++) {
      const x = a.x + mx + c * (colW + mx)
      p.card(x, a.y, colW, rows * rowH + u, 4 * u)
      for (let r = 0; r < rows; r++) {
        const n = first + c * rows + r
        const cy = a.y + u * 0.5 + r * rowH + rowH / 2
        appIcon(p, x + 2.5 * u + rowH * 0.3, cy, rowH * 0.6, n)
        p.say(APPS[n % APPS.length], x + 4 * u + rowH * 0.62, cy, rowH * 0.3, { color: p.panelInk, weight: 500 })
        if (r < rows - 1) {
          p.g.fillStyle = alpha(p.panelInk, 0.12)
          p.g.fillRect(x + 4 * u + rowH * 0.62, cy + rowH / 2, colW - 6 * u - rowH * 0.62, Math.max(1, u * 0.15))
        }
      }
    }
    return
  }
  if (L.layout === 'tiles') {
    const tc = Math.max(3, Math.round(cols * 0.9))
    const gap = 1.4 * u
    const cell = (a.w - gap * (tc - 1)) / tc
    let x = 0
    let y = 0
    let n = first
    while (y * (cell + gap) + cell <= a.h + 0.5) {
      const span = (n % 5 === 0 || n % 7 === 3) && x + 2 <= tc ? 2 : 1
      const px = a.x + x * (cell + gap)
      const py = a.y + y * (cell + gap)
      const tw = span * cell + (span - 1) * gap
      const fill = n % 4 === 0 ? L.accent : L.dark ? mix(TINTS[n % TINTS.length], '#0a0c10', 0.35) : TINTS[n % TINTS.length]
      p.g.fillStyle = fill
      rounded(p.g, px, py, tw, cell, cell * 0.1 * p.round)
      p.g.fill()
      const tileInk = lum(fill) > 0.45 ? '#15171b' : '#ffffff'
      p.g.strokeStyle = tileInk
      p.g.fillStyle = tileInk
      p.g.lineWidth = cell * 0.05
      glyph(p.g, n, px + cell * 0.3, py + cell * 0.34, cell * 0.13)
      p.say(APPS[n % APPS.length], px + cell * 0.12, py + cell * 0.8, cell * 0.15, { color: tileInk, weight: 600 })
      n++
      x += span
      if (x >= tc) {
        x = 0
        y++
      }
    }
    return
  }
  const pitch = a.w / cols
  const rowH = size * 1.6
  const rows = Math.max(0, Math.floor(a.h / rowH))
  let n = first
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = a.x + pitch * (c + 0.5)
      const cy = a.y + r * rowH + size / 2
      appIcon(p, cx, cy, size, n)
      p.say(APPS[n % APPS.length], cx, cy + size * 0.78, size * 0.21, { align: 'center', alpha: 0.95 })
      n++
    }
  }
}

// ---------------------------------------------------------------- clocks and the lock screen

function analogClock(p: Painter, cx: number, cy: number, r: number) {
  const g = p.g
  g.fillStyle = alpha(p.L.dark ? '#000000' : '#ffffff', 0.28)
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = p.ink
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.lineWidth = r * (i % 3 ? 0.02 : 0.045)
    g.beginPath()
    g.moveTo(cx + Math.sin(a) * r * 0.82, cy - Math.cos(a) * r * 0.82)
    g.lineTo(cx + Math.sin(a) * r * 0.94, cy - Math.cos(a) * r * 0.94)
    g.stroke()
  }
  const hand = (a: number, len: number, wd: number, c: string) => {
    g.strokeStyle = c
    g.lineWidth = wd
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len)
    g.stroke()
  }
  hand(((9 + 41 / 60) / 12) * Math.PI * 2, r * 0.5, r * 0.07, p.ink)
  hand((41 / 60) * Math.PI * 2, r * 0.76, r * 0.045, p.ink)
  hand(((p.t * 6) % 60) / 60 * Math.PI * 2 + 0.6, r * 0.82, r * 0.02, p.L.accent)
  g.fillStyle = p.L.accent
  g.beginPath()
  g.arc(cx, cy, r * 0.05, 0, Math.PI * 2)
  g.fill()
}

/** The time in the look's lock style, centred on cx. Returns the bottom of what it drew. */
function bigClock(p: Painter, cx: number, y: number, size: number, align: CanvasTextAlign = 'center'): number {
  const L = p.L
  const color = L.dark && p.ink !== '#15171b' ? mix(L.accent, '#ffffff', 0.25) : p.ink
  if (L.lock === 'analog') {
    analogClock(p, cx, y + size * 0.9, size * 0.85)
    p.say('Saturday 10 October', cx, y + size * 1.95, size * 0.2, { align: 'center', alpha: 0.85 })
    return y + size * 2.1
  }
  if (L.lock === 'stacked') {
    p.say('09', cx, y + size * 0.5, size, { align, color, heading: true })
    p.say('41', cx, y + size * 1.35, size, { align, color: p.ink, heading: true })
    p.say('Saturday 10 October', cx, y + size * 2.0, size * 0.2, { align, alpha: 0.85 })
    return y + size * 2.15
  }
  if (L.lock === 'minimal') {
    p.say('09:41', cx, y + size * 0.3, size * 0.5, { align, heading: true })
    p.say('Sat 10 Oct', cx, y + size * 0.72, size * 0.17, { align, alpha: 0.7 })
    return y + size * 0.9
  }
  p.say('09:41', cx, y + size * 0.5, size, { align, color, heading: true })
  p.say('Saturday 10 October', cx, y + size * 1.15, size * 0.22, { align, alpha: 0.85 })
  return y + size * 1.3
}

const NOTES = [['Chat', 'Mara: are we still on for six?'], ['Mail', 'Your order has shipped'], ['Calendar', 'Design review at 10:30']]

function notes(p: Painter, x: number, y: number, w: number, rowH: number, n: number) {
  for (let i = 0; i < n; i++) {
    const [app, text] = NOTES[i % NOTES.length]
    const py = y + i * (rowH + rowH * 0.15)
    p.card(x, py, w, rowH, rowH * 0.28)
    appIcon(p, x + rowH * 0.5, py + rowH / 2, rowH * 0.56, i * 3 + 1)
    p.say(app, x + rowH, py + rowH * 0.34, rowH * 0.22, { color: p.panelInk, weight: 700 })
    p.say(text, x + rowH, py + rowH * 0.66, rowH * 0.22, { color: p.panelInk, alpha: 0.75, max: w - rowH * 1.2 })
  }
}

// ---------------------------------------------------------------- the kinds of screen

function phoneHome(p: Painter, wide: boolean) {
  const { u, w, h } = p
  const bar = wide ? 3.4 * u : 5.4 * u
  statusBar(p, bar, (wide ? 2.4 : 4) * u, (wide ? 3.5 : 7) * u)
  // the home indicator
  p.g.fillStyle = alpha(p.ink, 0.8)
  rounded(p.g, w / 2 - 16 * u, h - 3 * u, 32 * u, 1.1 * u, u)
  p.g.fill()
  let top = bar + 4 * u
  const pad = (wide ? 3 : 4.5) * u
  if (p.L.widgets.length) {
    // a small clock line, then the widgets
    p.say('09:41', pad, top + 4 * u, (wide ? 5 : 8) * u, { heading: true })
    p.say('Saturday 10 October', pad, top + (wide ? 8 : 10) * u, (wide ? 1.8 : 3.2) * u, { alpha: 0.8 })
    top += (wide ? 12 : 15) * u
    top += widgetRow(p, pad, top, w - pad * 2, (wide ? 16 : 30) * u, wide ? 4 : 2, 3 * u) + 4 * u
  } else {
    top = bigClock(p, wide ? 8 * u : w / 2, top, (wide ? 11 : 19) * u, wide ? 'left' : 'center') + 6 * u
  }
  const size = (wide ? 9 : 14) * u * p.iconK
  const area = dock(p, { x: 0, y: top, w, h: h - top - 5 * u }, size, wide ? 7 : 4)
  const cols = Math.max(3, Math.min(wide ? 10 : 6, Math.round(area.w / (size * (wide ? 1.9 : 1.6)))))
  apps(p, { x: area.x + 2 * u, y: area.y + u, w: area.w - 4 * u, h: area.h - 2 * u }, size, cols)
}

function phoneLock(p: Painter, wide: boolean) {
  const { u, w, h } = p
  const bar = wide ? 3.4 * u : 5.4 * u
  statusBar(p, bar, (wide ? 2.4 : 4) * u, (wide ? 3.5 : 7) * u)
  const end = bigClock(p, w / 2, bar + (wide ? 8 : 10) * u, (wide ? 14 : 21) * u)
  if (p.L.lockNotes) notes(p, w * (wide ? 0.25 : 0.06), end + 6 * u, w * (wide ? 0.5 : 0.88), (wide ? 7 : 13) * u, wide ? 2 : 3)
  // torch and camera at the foot, and the line to swipe up
  for (const sx of [-1, 1]) {
    p.g.fillStyle = alpha(p.L.dark ? '#000000' : '#ffffff', 0.35)
    p.g.beginPath()
    p.g.arc(w / 2 + sx * w * 0.36, h - 12 * u, 6 * u, 0, Math.PI * 2)
    p.g.fill()
    p.g.fillStyle = p.ink
    p.g.strokeStyle = p.ink
    p.g.lineWidth = u * 0.8
    glyph(p.g, sx < 0 ? 5 : 0, w / 2 + sx * w * 0.36, h - 12 * u, 2.4 * u)
  }
  p.g.fillStyle = alpha(p.ink, 0.8)
  rounded(p.g, w / 2 - 16 * u, h - 3 * u, 32 * u, 1.1 * u, u)
  p.g.fill()
}

/** A window on a computer's desktop: a title bar, a sidebar and some content. */
function appWindow(p: Painter, x: number, y: number, w: number, h: number, title: string, kind: number) {
  const { g, u } = p
  const r = 1.2 * u
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.35)'
  g.shadowBlur = 3 * u
  g.shadowOffsetY = u
  p.card(x, y, w, h, r, p.L.dark ? mix(p.L.surface, '#000000', 0.2) : mix(p.L.surface, '#ffffff', 0.9))
  g.restore()
  const ink = p.L.dark ? '#f4f5f7' : '#15171b'
  const bar = 3.6 * u
  g.fillStyle = alpha(ink, 0.06)
  g.fillRect(x, y + bar, w, Math.max(1, u * 0.12))
  ;['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
    g.fillStyle = c
    g.beginPath()
    g.arc(x + 2.4 * u + i * 2.2 * u, y + bar / 2, 0.75 * u, 0, Math.PI * 2)
    g.fill()
  })
  p.say(title, x + w / 2, y + bar / 2, 1.6 * u, { align: 'center', color: ink, weight: 600 })
  const side = w * 0.24
  g.fillStyle = alpha(ink, 0.05)
  g.fillRect(x, y + bar, side, h - bar)
  for (let i = 0; i < 6; i++) {
    if (i === 1) {
      g.fillStyle = alpha(p.L.accent, 0.85)
      rounded(g, x + u, y + bar + 1.5 * u + i * 3.2 * u - 1.2 * u, side - 2 * u, 2.4 * u, 0.6 * u * p.round)
      g.fill()
    }
    p.say(['Recents', title, 'Shared', 'Desktop', 'Downloads', 'Trash'][i], x + 2 * u, y + bar + 1.5 * u + i * 3.2 * u, 1.5 * u, { color: i === 1 ? '#ffffff' : ink, alpha: i === 1 ? 1 : 0.75 })
  }
  const cx = x + side + 2 * u
  const cw = w - side - 4 * u
  if (kind === 0) {
    // a grid of photos
    const n = 4
    const cell = (cw - (n - 1) * u) / n
    for (let r = 0; r * (cell * 0.75 + u) + cell * 0.75 < h - bar - 3 * u; r++) {
      for (let c = 0; c < n; c++) {
        const i = r * n + c
        g.fillStyle = mix(TINTS[i % TINTS.length], p.L.dark ? '#0a0c10' : '#ffffff', 0.35)
        rounded(g, cx + c * (cell + u), y + bar + 2 * u + r * (cell * 0.75 + u), cell, cell * 0.75, 0.6 * u * p.round)
        g.fill()
      }
    }
  } else {
    // a document: a heading and lines of text
    p.say('Launch plan', cx, y + bar + 3.5 * u, 2.6 * u, { color: ink, heading: true })
    for (let i = 0; i < 12 && y + bar + 7 * u + i * 2.2 * u < y + h - 2 * u; i++) {
      g.fillStyle = alpha(ink, i % 4 === 0 ? 0.35 : 0.16)
      g.fillRect(cx, y + bar + 7 * u + i * 2.2 * u, cw * (i % 4 === 3 ? 0.55 : 0.95), 0.7 * u)
    }
  }
}

function desktopHome(p: Painter) {
  const { L, u, w, h, g } = p
  // a computer's screen is wide: the unit follows its height
  const bar = 4.4 * u
  const side = L.dock === 'left' || L.dock === 'right'
  const area = { x: 0, y: 0, w, h }
  if (L.dock === 'none') {
    // a thin menu bar along the top, and a floating dock at the foot
    p.card(0, 0, w, 2.8 * u, 0, alpha(L.dark ? '#000000' : '#ffffff', 0.35))
    p.say('09:41', w - 2 * u, 1.4 * u, 1.5 * u, { align: 'right', weight: 600 })
    p.say('File   Edit   View   Window', 6 * u, 1.4 * u, 1.4 * u, { alpha: 0.85 })
    area.y = 2.8 * u
    area.h -= 2.8 * u
    const size = 4.6 * u * p.iconK
    const n = 9
    const len = n * (size + u) + u
    p.card((w - len) / 2, h - size - 3 * u, len, size + 2 * u, 1.6 * u)
    for (let i = 0; i < n; i++) appIcon(p, (w - len) / 2 + u + size / 2 + i * (size + u), h - 2 * u - size / 2, size, i + 10)
    area.h -= size + 3 * u
  } else {
    // a taskbar along one edge: the start button in the accent, pinned apps, and the clock at the far end; edge to
    // edge with the apps from the start, the same with them centred, or a floating bar held clear of the edges
    const float = L.taskbar === 'floating'
    const m = float ? 1.4 * u : 0
    const x = L.dock === 'right' ? w - bar - m : m
    const y = L.dock === 'bottom' ? h - bar - m : m
    const bw = side ? bar : w - 2 * m
    const bh = side ? h - 2 * m : bar
    const barFill = L.dark ? alpha(mix(L.surface, '#000000', 0.3), 0.9) : alpha(mix(L.surface, '#ffffff', 0.85), 0.9)
    if (float) {
      g.save()
      g.shadowColor = 'rgba(0,0,0,0.4)'
      g.shadowBlur = 1.6 * u
      p.card(x, y, bw, bh, bar * 0.45, barFill)
      g.restore()
    } else {
      g.fillStyle = barFill
      g.fillRect(x, y, bw, bh)
    }
    const size = bar * 0.68 * Math.min(1.1, p.iconK)
    const step = size * 1.35
    const n = 8
    const centred = L.taskbar !== 'full'
    const start = side ? (centred ? h * 0.5 - (n * step) / 2 : y + 1.2 * u) : centred ? w * 0.5 - (n * step) / 2 : x + 1.2 * u
    for (let i = 0; i < n; i++) {
      const at = start + step * (i + 0.5)
      const cx = side ? x + bar / 2 : at
      const cy = side ? at : y + bar / 2
      if (i === 0) {
        g.fillStyle = L.accent
        rounded(g, cx - size / 2, cy - size / 2, size, size, size * 0.2 * p.round)
        g.fill()
        g.fillStyle = '#ffffff'
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillRect(cx + dx * size * 0.16 - size * 0.12, cy + dy * size * 0.16 - size * 0.12, size * 0.24, size * 0.24)
      } else appIcon(p, cx, cy, size, i + 9)
      if (i === 2) {
        g.fillStyle = L.accent
        if (side) g.fillRect(L.dock === 'left' ? x + 0.2 * u : x + bar - 0.6 * u, cy - size * 0.3, 0.4 * u, size * 0.6)
        else g.fillRect(cx - size * 0.3, L.dock === 'bottom' ? y + bar - 0.5 * u : y + 0.1 * u, size * 0.6, 0.4 * u)
      }
    }
    const ink = L.dark ? '#f4f5f7' : '#15171b'
    if (side) p.say('09:41', x + bar / 2, h - 2.4 * u, 1.3 * u, { align: 'center', color: ink, weight: 600 })
    else {
      p.say('09:41', w - 2 * u, y + bar * 0.36, 1.4 * u, { align: 'right', color: ink, weight: 600 })
      p.say('10/10', w - 2 * u, y + bar * 0.7, 1.2 * u, { align: 'right', color: ink, alpha: 0.7 })
    }
    const used = bar + 2 * m
    if (L.dock === 'bottom') area.h -= used
    else if (L.dock === 'top') (area.y += used), (area.h -= used)
    else if (L.dock === 'left') (area.x += used), (area.w -= used)
    else area.w -= used
  }
  // icons down the left of the desktop
  const ds = 4.4 * u * p.iconK
  for (let i = 0; i < 4; i++) {
    appIcon(p, area.x + 4 * u, area.y + 4 * u + i * ds * 1.9, ds, i + 3)
    p.say(['Files', 'Photos', 'Notes', 'Store'][i], area.x + 4 * u, area.y + 4 * u + i * ds * 1.9 + ds * 0.82, 1.3 * u, { align: 'center' })
  }
  // the widgets stand down the right
  const ww = 22 * u
  let wy = area.y + 2 * u
  for (const id of L.widgets.slice(0, 3)) {
    widget(p, id, area.x + area.w - ww - 2 * u, wy, ww, 12 * u)
    wy += 13.5 * u
  }
  const right = area.x + area.w - (L.widgets.length ? ww + 4 * u : 2 * u)
  // two windows, the front one in focus
  appWindow(p, area.x + 12 * u, area.y + 4 * u, Math.min(64 * u, right - area.x - 14 * u), Math.min(38 * u, area.h - 8 * u), 'Photos', 0)
  appWindow(p, area.x + 30 * u, area.y + 16 * u, Math.min(56 * u, right - area.x - 32 * u), Math.min(34 * u, area.h - 20 * u), 'Docs', 1)
  if (L.layout !== 'grid') {
    // the start menu open: the apps as a list or as tiles
    const mw = 30 * u
    const mh = Math.min(46 * u, area.h - 4 * u)
    const mx = L.dock === 'right' ? area.x + area.w - mw - 2 * u : area.x + 2 * u
    const my = L.dock === 'top' ? area.y + 2 * u : area.y + area.h - mh - 2 * u
    p.card(mx, my, mw, mh, 1.4 * u, L.dark ? alpha(mix(L.surface, '#000000', 0.15), 0.96) : alpha(mix(L.surface, '#ffffff', 0.9), 0.97))
    p.say('Pinned', mx + 2 * u, my + 2.4 * u, 1.6 * u, { color: L.dark ? '#f4f5f7' : '#15171b', weight: 700 })
    const old = p.panelInk
    apps(p, { x: mx + 0.5 * u, y: my + 4.4 * u, w: mw - u, h: mh - 5.4 * u }, 4.4 * u, 4)
    void old
  }
}

function desktopLock(p: Painter) {
  const { u, w, h, g } = p
  bigClock(p, w / 2, h * 0.12, 14 * u)
  // the account and its password field
  g.fillStyle = mix(p.L.accent, '#ffffff', 0.2)
  g.beginPath()
  g.arc(w / 2, h * 0.62, 5 * u, 0, Math.PI * 2)
  g.fill()
  p.say('A', w / 2, h * 0.62, 5 * u, { align: 'center', color: '#ffffff', weight: 700 })
  p.say('Alex', w / 2, h * 0.62 + 7.5 * u, 2 * u, { align: 'center', weight: 600 })
  p.card(w / 2 - 14 * u, h * 0.62 + 10.5 * u, 28 * u, 3.6 * u, 0.9 * u, alpha(p.L.dark ? '#000000' : '#ffffff', 0.4))
  p.say('Password', w / 2 - 12.5 * u, h * 0.62 + 12.3 * u, 1.5 * u, { alpha: 0.6 })
  if (p.L.lockNotes) notes(p, w - 34 * u, h - 22 * u, 32 * u, 6 * u, 2)
}

function tvHome(p: Painter, console: boolean) {
  const { u, w, h, g, L } = p
  const ink = p.ink
  // the menu along the top
  const tabs = console ? ['Home', 'Games', 'Store', 'Friends', 'Settings'] : ['Home', 'Live', 'Films', 'Apps', 'Settings']
  let tx = 5 * u
  tabs.forEach((t, i) => {
    g.font = `${i === 0 ? 700 : 500} ${1.9 * u}px ${p.font}`
    const tw = g.measureText(t).width
    if (i === 0) p.card(tx - 1.4 * u, 2.2 * u, tw + 2.8 * u, 3.4 * u, 1.7 * u, L.accent)
    p.say(t, tx, 3.9 * u, 1.9 * u, { weight: i === 0 ? 700 : 500, color: i === 0 ? (lum(L.accent) > 0.45 ? '#15171b' : '#ffffff') : ink, alpha: i === 0 ? 1 : 0.8 })
    tx += tw + 4.4 * u
  })
  p.say('09:41', w - 4 * u, 3.9 * u, 1.9 * u, { align: 'right', weight: 600 })
  if (console) {
    g.fillStyle = mix(L.accent, '#ffffff', 0.15)
    g.beginPath()
    g.arc(w - 13 * u, 3.9 * u, 1.7 * u, 0, Math.PI * 2)
    g.fill()
  }
  // the row of tiles is the television's dock: it sits along the edge the look puts the dock on, or floats on a
  // panel of its own; the look's layout makes it one row, two rows or a mosaic, and the home-row style shapes the tiles
  const side = L.dock === 'left' || L.dock === 'right'
  const rowShape = L.tvRow
  const count = (console ? 7 : 6) + ({ small: 2, medium: 0, large: -1 } as const)[L.iconSize]
  const gap = 1.6 * u
  const colW = side ? Math.min(w * 0.24, 30 * u) : 0
  // the hero: the featured show or game over the wallpaper, clear of the row
  const hx = L.dock === 'left' ? 5 * u + colW + 4 * u : 5 * u
  const hy = L.dock === 'top' ? h * 0.68 : h * 0.3
  p.say(console ? GAMES[1] : 'Tonight', hx, hy, 6 * u, { heading: true })
  p.say(console ? 'Continue: chapter 4, 62% complete' : 'The Long Coast, episode 3', hx, hy + 5 * u, 2 * u, { alpha: 0.85 })
  p.card(hx, hy + 8.5 * u, 14 * u, 4 * u, 2 * u, L.accent)
  p.say(console ? 'Play' : 'Watch', hx + 7 * u, hy + 10.5 * u, 1.9 * u, { align: 'center', weight: 700, color: lum(L.accent) > 0.45 ? '#15171b' : '#ffffff' })
  const rows = L.layout === 'list' ? 2 : 1
  const tile = (i: number, x: number, y: number, tw: number, th: number) => {
    const c = TINTS[(i * 3 + 2) % TINTS.length]
    if (rowShape === 'icons') {
      // round app icons with their names under them
      const r = Math.min(tw, th) * 0.42
      g.fillStyle = c
      g.beginPath()
      g.arc(x + tw / 2, y + r, r, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#ffffff'
      g.strokeStyle = '#ffffff'
      g.lineWidth = r * 0.12
      glyph(g, i, x + tw / 2, y + r, r * 0.38)
      p.say(console ? GAMES[i % GAMES.length] : APPS[(i + 13) % APPS.length], x + tw / 2, y + 2 * r + 1.6 * u, Math.min(1.6 * u, tw * 0.14), { align: 'center', max: tw })
      if (i === 0) {
        g.strokeStyle = '#ffffff'
        g.lineWidth = 0.5 * u
        g.beginPath()
        g.arc(x + tw / 2, y + r, r + 0.7 * u, 0, Math.PI * 2)
        g.stroke()
      }
      return
    }
    const gr = g.createLinearGradient(x, y, x + tw, y + th)
    gr.addColorStop(0, mix(c, '#ffffff', 0.1))
    gr.addColorStop(1, mix(c, '#000000', 0.35))
    g.fillStyle = gr
    rounded(g, x, y, tw, th, tw * 0.06 * p.round)
    g.fill()
    if (i === 0) {
      g.strokeStyle = '#ffffff'
      g.lineWidth = 0.5 * u
      rounded(g, x - 0.6 * u, y - 0.6 * u, tw + 1.2 * u, th + 1.2 * u, tw * 0.07 * p.round)
      g.stroke()
    }
    if (console || rowShape === 'posters') p.say(console ? GAMES[i % GAMES.length] : BOOKS[i % BOOKS.length], x + tw * 0.08, y + th * 0.88, Math.min(tw * 0.1, 1.8 * u), { color: '#ffffff', weight: 700, max: tw * 0.86 })
    else {
      g.fillStyle = '#ffffff'
      g.strokeStyle = '#ffffff'
      g.lineWidth = th * 0.04
      glyph(g, i, x + tw / 2, y + th / 2, th * 0.16)
    }
  }
  const aspect = rowShape === 'posters' ? 1.45 : rowShape === 'icons' ? 1.25 : console ? 1 : 0.58
  if (side) {
    // a column of tiles down one side
    const x0 = L.dock === 'left' ? 5 * u : w - 5 * u - colW
    const tw = colW
    const th = Math.min(tw * aspect, (h - 14 * u - gap * 3) / 4)
    p.say(console ? 'Your games' : 'Apps', x0, 9 * u, 2 * u, { weight: 700 })
    for (let i = 0; i < 4; i++) tile(i, x0, 11.5 * u + i * (th + gap), tw, th)
  } else {
    const floating = L.dock === 'none'
    const inset = floating ? 4 * u : 0
    const span = w - 10 * u - 2 * inset
    const n = Math.max(3, Math.round(count / rows))
    const tw = (span - gap * (n - 1)) / n
    const th = Math.min(tw * aspect, (h * (L.dock === 'top' ? 0.5 : 0.42)) / rows - gap)
    const block = rows * th + (rows - 1) * gap
    const ty = L.dock === 'top' ? 10 * u : floating ? h - block - 12 * u : h - block - (console ? 7 : 9) * u
    if (floating) {
      g.save()
      g.shadowColor = 'rgba(0,0,0,0.45)'
      g.shadowBlur = 2 * u
      p.card(5 * u, ty - 5 * u, w - 10 * u, block + 8 * u, 2.4 * u)
      g.restore()
    }
    p.say(console ? 'Your games' : 'Apps', 5 * u + inset, ty - 2.4 * u, 2 * u, { weight: 700 })
    let i = 0
    for (let r = 0; r < rows; r++) {
      let x = 5 * u + inset
      for (let c = 0; c < n && x < 5 * u + inset + span - 1; c++) {
        // a mosaic: the first tile of each row takes two places
        const wide = L.layout === 'tiles' && c === 0
        const ww = wide ? tw * 2 + gap : tw
        tile(i, x, ty + r * (th + gap), ww, th)
        x += ww + gap
        if (wide) c++
        i++
      }
    }
  }
  if (!console && L.widgets.length && L.dock !== 'right') widgetRow(p, w - 5 * u - 44 * u, L.dock === 'top' ? h * 0.66 : 8 * u, 44 * u, 11 * u, 2, 1.6 * u)
}

function handheldHome(p: Painter) {
  const { u, w, h, g, L } = p
  statusBar(p, 3 * u, 2 * u, 3 * u)
  // the quick buttons are the handheld's dock, on whichever edge the look puts it (or floating)
  const size = 6 * u * p.iconK
  const area = dock(p, { x: 0, y: 6 * u, w, h: h - 6 * u }, size, 6)
  const cover = (i: number, x: number, y: number, s: number, focus: boolean) => {
    const c = TINTS[(i * 5 + 1) % TINTS.length]
    const gr = g.createLinearGradient(x, y, x, y + s)
    gr.addColorStop(0, c)
    gr.addColorStop(1, mix(c, '#000000', 0.45))
    g.fillStyle = gr
    rounded(g, x, y, s, s, s * 0.08 * p.round)
    g.fill()
    if (focus) {
      g.strokeStyle = L.accent
      g.lineWidth = 0.7 * u
      rounded(g, x - u, y - u, s + 2 * u, s + 2 * u, s * 0.09 * p.round)
      g.stroke()
    }
  }
  if (L.layout === 'list') {
    // the library as a list: a cover, the name and the time played, one game a row
    const rowH = Math.min(11 * u, (area.h - 4 * u) / 4)
    p.card(area.x + 3 * u, area.y + u, area.w - 6 * u, rowH * 4 + u, 2 * u)
    for (let i = 0; i < 4; i++) {
      const y = area.y + 1.5 * u + i * rowH
      cover(i, area.x + 5 * u, y + rowH * 0.1, rowH * 0.8, i === 0)
      p.say(GAMES[(i + 2) % GAMES.length], area.x + 7 * u + rowH, y + rowH * 0.36, 2.4 * u, { color: p.panelInk, weight: 700 })
      p.say(['Played 2 hours ago', 'Yesterday', 'Last week', 'New'][i], area.x + 7 * u + rowH, y + rowH * 0.7, 1.8 * u, { color: p.panelInk, alpha: 0.7 })
    }
    return
  }
  if (L.layout === 'tiles') {
    // a grid of covers, two rows
    const cols = 4
    const gap = 2 * u
    const s = Math.min((area.w - 8 * u - gap * (cols - 1)) / cols, (area.h - 6 * u - gap) / 2)
    const x0 = area.x + (area.w - cols * s - (cols - 1) * gap) / 2
    for (let i = 0; i < cols * 2; i++) cover(i, x0 + (i % cols) * (s + gap), area.y + 2 * u + Math.floor(i / cols) * (s + gap), s, i === 0)
    return
  }
  // a shelf of game covers, the one in focus larger, with its name beneath
  const n = 5
  const cw = area.w * 0.17
  const gap = area.w * 0.02
  const big = Math.min(cw * 1.25, area.h * 0.55)
  let x = area.x + area.w * 0.06
  const mid = area.y + area.h * 0.42
  for (let i = 0; i < n; i++) {
    const s = i === 0 ? big : Math.min(cw, big * 0.8)
    const y = mid - s / 2
    cover(i, x, y, s, i === 0)
    if (i === 0) {
      p.say(GAMES[2], x, y + s + 4 * u, 3 * u, { weight: 700 })
      p.say('Played 2 hours ago', x, y + s + 7.5 * u, 2 * u, { alpha: 0.7 })
    }
    x += s + gap
  }
}

/** A complication on a watch face: its ring of progress in a shape that follows the look's corners. */
function complication(p: Painter, id: string, i: number, x: number, y: number, r: number) {
  const { g, L } = p
  g.fillStyle = alpha(L.dark ? '#ffffff' : '#000000', 0.12)
  if (L.corners === 'round') {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
  } else rounded(g, x - r, y - r, 2 * r, 2 * r, L.corners === 'soft' ? r * 0.45 : r * 0.08)
  g.fill()
  g.lineWidth = r * 0.18
  g.strokeStyle = [L.accent, '#34c77b', '#2f9bf0', '#f0484e'][i % 4]
  const k = [0.7, 0.45, 0.85, 0.3][i % 4]
  if (L.corners === 'round') {
    g.beginPath()
    g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k)
    g.stroke()
  } else g.fillRect(x - r * 0.7, y + r * 0.55, r * 1.4 * k, r * 0.16)
  p.say({ weather: '21°', calendar: '10', music: 'II', battery: '82', photos: 'P', steps: '6k' }[id] ?? '', x, y - (L.corners === 'round' ? 0 : r * 0.1), r * 0.6, { align: 'center', weight: 700 })
}

function watchHome(p: Painter, lock: boolean) {
  const { w, h, g, L } = p
  const s = Math.min(w, h)
  const cx = w / 2
  const cy = h / 2
  if (lock || L.layout === 'list') {
    // the watch face: the time in the face's style, and the widgets as complications round it
    const comps = L.widgets.slice(0, 4)
    if (L.watchFace === 'rings') {
      // activity rings filling the face, the time small in the middle
      ;[L.accent, '#34c77b', '#2f9bf0'].forEach((c, i) => {
        const r = s * (0.42 - i * 0.09)
        g.lineWidth = s * 0.07
        g.strokeStyle = alpha(c, 0.25)
        g.beginPath()
        g.arc(cx, cy, r, 0, Math.PI * 2)
        g.stroke()
        g.strokeStyle = c
        g.beginPath()
        g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * [0.78, 0.55, 0.9][i])
        g.stroke()
      })
      p.say('09:41', cx, cy, s * 0.11, { align: 'center', heading: true })
      return
    }
    if (L.watchFace === 'modular') {
      // the time across the top and a grid of complications below
      p.say('09:41', s * 0.12 + (w - s) / 2, cy - s * 0.3, s * 0.17, { color: L.accent, heading: true })
      const all = comps.length ? comps : ['weather', 'steps']
      all.forEach((id, i) => complication(p, id, i, cx + (i % 2 ? 0.2 : -0.2) * s, cy + (i < 2 ? 0.02 : 0.27) * s, s * 0.11))
      return
    }
    if (L.watchFace === 'analog' || L.lock === 'analog') analogClock(p, cx, cy, s * 0.4)
    else if (L.lock === 'stacked') {
      p.say('09', cx, cy - s * 0.12, s * 0.3, { align: 'center', color: L.accent, heading: true })
      p.say('41', cx, cy + s * 0.17, s * 0.3, { align: 'center', heading: true })
    } else if (L.lock === 'minimal') p.say('09:41', cx, cy - s * 0.3, s * 0.12, { align: 'center', heading: true, alpha: 0.9 })
    else p.say('09:41', cx, cy, s * 0.24, { align: 'center', color: L.accent, heading: true })
    comps.forEach((id, i) => {
      const at = [[-0.33, -0.33], [0.33, -0.33], [-0.33, 0.33], [0.33, 0.33]][i]
      complication(p, id, i, cx + at[0] * s, cy + at[1] * s, s * 0.1)
    })
    return
  }
  // apps: a honeycomb of round icons, or tiles
  if (L.layout === 'tiles') {
    const t = s * 0.36
    for (let i = 0; i < 4; i++) {
      const x = cx + (i % 2 ? 0.02 : -0.02 - 0.36) * s
      const y = cy + (i < 2 ? -0.38 : 0.02) * s
      const fill = i === 0 ? L.accent : TINTS[(i * 3) % TINTS.length]
      g.fillStyle = fill
      rounded(g, x, y, t, t, t * 0.18 * p.round)
      g.fill()
      g.fillStyle = '#ffffff'
      g.strokeStyle = '#ffffff'
      g.lineWidth = t * 0.05
      glyph(g, i, x + t / 2, y + t / 2, t * 0.16)
    }
    return
  }
  const size = s * 0.17 * p.iconK
  const pitch = size * 1.12
  for (let r = -2; r <= 2; r++) {
    const n = 5 - Math.abs(r)
    for (let c = 0; c < n; c++) {
      const x = cx + (c - (n - 1) / 2) * pitch
      const y = cy + r * pitch * 0.88
      const k = 1 - Math.min(0.45, Math.hypot(x - cx, y - cy) / s)
      appIcon(p, x, y, size * k, (r + 2) * 5 + c)
    }
  }
}

function ereaderHome(p: Painter, lock: boolean) {
  const { w, h, g, L } = p
  // paper: the wallpaper plays no part, only the type, the covers and the toolbar
  g.fillStyle = '#f2f1ec'
  g.fillRect(0, 0, w, h)
  const ink = '#1d1d1f'
  const ru = w / 100
  if (lock) {
    // the sleep screen: the clock in the look's style over a page of the book
    if (L.lock === 'analog') analogClock(p, w / 2, h * 0.36, w * 0.3)
    else if (L.lock === 'stacked') {
      p.say('09', w / 2, h * 0.28, 22 * ru, { align: 'center', color: ink, heading: true })
      p.say('41', w / 2, h * 0.44, 22 * ru, { align: 'center', color: ink, heading: true })
    } else p.say('09:41', w / 2, h * 0.36, (L.lock === 'minimal' ? 9 : 18) * ru, { align: 'center', color: ink, heading: L.lock !== 'minimal' })
    p.say(BOOKS[0], w / 2, h * 0.62, 4 * ru, { align: 'center', color: ink, heading: true })
    p.say('Sleeping. Press the button to read on.', w / 2, h * 0.68, 2.6 * ru, { align: 'center', color: ink, alpha: 0.7 })
  } else {
    // the toolbar is the reader's dock, and the library fits into what it leaves
    const area = dock(p, { x: 0, y: 0, w, h }, 7 * ru * p.iconK, 4)
    g.save()
    const k = Math.min(area.w / w, area.h / h)
    g.translate(area.x + (area.w - w * k) / 2, area.y)
    g.scale(k, k)
    p.say('Library', 6 * ru, 9 * ru, 6 * ru, { color: ink, heading: true })
    p.say('09:41', w - 6 * ru, 4 * ru, 3 * ru, { color: ink, align: 'right' })
    g.fillStyle = ink
    g.fillRect(6 * ru, 14 * ru, w - 12 * ru, Math.max(1, ru * 0.3))
    const coverAt = (i: number, x: number, y: number, cw: number, ch: number) => {
      g.fillStyle = i < 0 ? mix(L.accent, '#000000', 0.2) : mix(TINTS[(i * 3 + 1) % TINTS.length], '#000000', 0.25)
      rounded(g, x, y, cw, ch, cw * 0.05 * p.round)
      g.fill()
      g.fillStyle = 'rgba(255,255,255,0.8)'
      g.fillRect(x + cw * 0.12, y + ch * 0.18, cw * 0.76, Math.max(1, ru * 0.4))
    }
    if (L.layout === 'list') {
      // a list: a small cover, the title and how far through, one book a row
      for (let i = 0; i < 7; i++) {
        const y = 18 * ru + i * 17 * ru
        if (y + 15 * ru > h) break
        coverAt(i - 1, 6 * ru, y, 10 * ru, 14.5 * ru)
        p.say(BOOKS[i % BOOKS.length], 20 * ru, y + 4 * ru, 3.6 * ru, { color: ink, heading: true, max: w - 26 * ru })
        g.fillStyle = '#c9c8c2'
        g.fillRect(20 * ru, y + 9 * ru, w - 26 * ru, ru)
        g.fillStyle = ink
        g.fillRect(20 * ru, y + 9 * ru, (w - 26 * ru) * [0.38, 0.9, 0.12, 1, 0.5, 0.05, 0.7][i], ru)
      }
    } else {
      // the book being read, then the covers: three across, or two large ones
      const cw = 26 * ru
      const ch = cw * 1.45
      coverAt(-1, 6 * ru, 19 * ru, cw, ch)
      p.say(BOOKS[0], 6 * ru + cw + 5 * ru, 23 * ru, 4.2 * ru, { color: ink, heading: true, max: w - cw - 18 * ru })
      p.say('Chapter 7 of 18', 6 * ru + cw + 5 * ru, 29 * ru, 3 * ru, { color: ink, alpha: 0.7 })
      g.fillStyle = '#c9c8c2'
      g.fillRect(6 * ru + cw + 5 * ru, 34 * ru, w - cw - 22 * ru, 1.2 * ru)
      g.fillStyle = ink
      g.fillRect(6 * ru + cw + 5 * ru, 34 * ru, (w - cw - 22 * ru) * 0.38, 1.2 * ru)
      const cols = L.layout === 'tiles' ? 2 : 3
      const gw = (w - 12 * ru - (cols - 1) * 4 * ru) / cols
      const gh = gw * (L.layout === 'tiles' ? 1.2 : 1.45)
      for (let i = 0; i < 6; i++) {
        const x = 6 * ru + (i % cols) * (gw + 4 * ru)
        const y = 19 * ru + ch + 8 * ru + Math.floor(i / cols) * (gh + 9 * ru)
        if (y + gh > h - 4 * ru) break
        coverAt(i, x, y, gw, gh)
        p.say(BOOKS[(i + 1) % BOOKS.length], x, y + gh + 3 * ru, 2.6 * ru, { color: ink, max: gw })
      }
    }
    g.restore()
  }
  // e-ink shows no colour: the whole page in greys
  try {
    const img = g.getImageData(0, 0, w, h)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11
      d[i] = d[i + 1] = d[i + 2] = v
    }
    g.putImageData(img, 0, 0)
  } catch {
    /* a canvas that cannot be read back keeps its colour */
  }
}

function displayHome(p: Painter) {
  const { w, h, L } = p
  const su = h / 60
  // the row of apps is the display's dock; the clock and the widgets take what it leaves
  const size = 7 * su * p.iconK
  const a = dock(p, { x: 0, y: 0, w, h }, size, 5)
  const list = L.widgets.length ? L.widgets.slice(0, 3) : ['weather', 'music']
  if (L.layout === 'list') {
    // a list of cards down the screen, the time small above them
    p.say('09:41', a.x + 6 * su, a.y + 5 * su, 5 * su, { heading: true })
    list.forEach((id, i) => widget(p, id, a.x + 6 * su, a.y + (10 + i * 15) * su, a.w - 12 * su, 13 * su))
    return
  }
  if (L.layout === 'tiles') {
    // the time beside a block of four app tiles
    bigClock(p, a.x + 6 * su, a.y + 6 * su, 11 * su, 'left')
    const t = Math.min((a.w * 0.48 - 3 * su) / 2, (a.h - 12 * su) / 2)
    for (let i = 0; i < 4; i++) {
      const x = a.x + a.w - 6 * su - 2 * t - 2 * su + (i % 2) * (t + 2 * su)
      const y = a.y + 6 * su + Math.floor(i / 2) * (t + 2 * su)
      p.g.fillStyle = i === 0 ? L.accent : TINTS[(i * 3) % TINTS.length]
      rounded(p.g, x, y, t, t, t * 0.12 * p.round)
      p.g.fill()
      p.g.fillStyle = '#ffffff'
      p.g.strokeStyle = '#ffffff'
      p.g.lineWidth = t * 0.05
      glyph(p.g, i + 3, x + t / 2, y + t / 2, t * 0.16)
    }
    return
  }
  bigClock(p, a.x + 8 * su, a.y + 6 * su, 16 * su, 'left')
  list.slice(0, 2).forEach((id, i) => widget(p, id, a.x + a.w * 0.52, a.y + (5 + i * 21) * su, a.w * 0.44, 19 * su))
}

/**
 * Paints a screen of an operating system with the given look over the whole of a w x h canvas: its home screen,
 * or its lock screen. `kind` picks the interface the device has; `t` (seconds) moves what animates.
 */
export function paintOsLook(ctx: CanvasRenderingContext2D, look: OsLook, w: number, h: number, kind: OsScreen = 'phone', screen: 'home' | 'lock' = 'home', t = 0) {
  // the size unit: a hundredth of a phone's width, or of the height of anything wider than tall
  const wideScreen = kind === 'desktop' || kind === 'tv' || kind === 'console' || kind === 'handheld' || kind === 'display'
  const u = wideScreen ? h / 60 : Math.min(w, h * 0.6) / 100
  const p = new Painter(ctx, lookFor(look, kind), w, h, u, t)
  if (kind !== 'ereader') wallpaper(p)
  if (kind === 'watch') {
    // a watch shows black round its face, whatever the wallpaper
    if (p.L.dark) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(0, 0, w, h)
    }
    return watchHome(p, screen === 'lock')
  }
  if (kind === 'ereader') return ereaderHome(p, screen === 'lock')
  if (screen === 'lock') {
    if (kind === 'desktop' || kind === 'tv' || kind === 'console' || kind === 'display') return desktopLock(p)
    return phoneLock(p, kind !== 'phone')
  }
  switch (kind) {
    case 'desktop':
      return desktopHome(p)
    case 'tv':
      return tvHome(p, false)
    case 'console':
      return tvHome(p, true)
    case 'handheld':
      return handheldHome(p)
    case 'display':
      return displayHome(p)
    default:
      return phoneHome(p, kind === 'tablet' || w > h * 0.8)
  }
}

/** How long one cycle of the look's animations takes, in seconds: 0 for none. */
export const motionPeriod = (look: OsLook) => ({ off: 0, calm: 1.6, normal: 1, brisk: 0.6 })[cleanLook(look).motion]

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
