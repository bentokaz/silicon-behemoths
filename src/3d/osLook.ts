// Paints an operating system's look (OsLook, designed in Labs) onto a 2D
// canvas: the wallpaper, the clock, the app icons in their layout and the dock.
// Used by the OS designer's live preview and, through a canvas texture, by
// device screens. Pure drawing: no React, no three, no clock of its own.
import type { OsLook } from '../sim/types'

export interface PaintOpts {
  /** 'home' shows the app icons; 'lock' the lock screen with its big clock. */
  screen?: 'home' | 'lock'
  /** Time shown on the clock, 'HH:MM'. */
  time?: string
  /** Labels under icons and on list rows, when there is room for them. */
  labels?: boolean
}

const FONTS: Record<OsLook['font'], string> = {
  sans: '"Inter", "Segoe UI", system-ui, sans-serif',
  mono: '"JetBrains Mono", "Consolas", monospace',
  serif: '"Georgia", "Times New Roman", serif',
  rounded: '"Nunito", "Varela Round", "Segoe UI", system-ui, sans-serif',
}
const APPS = ['Phone', 'Mail', 'Maps', 'Camera', 'Photos', 'Music', 'Store', 'Notes', 'Clock', 'Weather', 'Wallet', 'Health', 'Chat', 'Files', 'Video', 'Settings']

/** '#rrggbb' mixed towards '#rrggbb' by t (0-1). */
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0)
  const [x, y] = [p(a), p(b)]
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}
const luma = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function wallpaper(ctx: CanvasRenderingContext2D, look: OsLook, w: number, h: number) {
  ctx.fillStyle = look.bg
  ctx.fillRect(0, 0, w, h)
  const u = Math.min(w, h)
  ctx.save()
  ctx.strokeStyle = look.bg2
  ctx.fillStyle = look.bg2
  ctx.globalAlpha = 0.55
  switch (look.wallpaper) {
    case 'stripes': {
      ctx.lineWidth = u * 0.05
      for (let x = -h; x < w + h; x += u * 0.16) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + h, h)
        ctx.stroke()
      }
      break
    }
    case 'dots': {
      const step = u * 0.09
      for (let y = step / 2; y < h; y += step) for (let x = ((Math.round(y / step) % 2) * step) / 2 + step / 4; x < w; x += step) {
        ctx.beginPath()
        ctx.arc(x, y, step * 0.16, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'waves': {
      ctx.lineWidth = u * 0.025
      for (let k = 0; k < 7; k++) {
        const y0 = h * (0.35 + k * 0.1)
        ctx.beginPath()
        for (let x = 0; x <= w; x += w / 40) ctx.lineTo(x, y0 + Math.sin((x / w) * Math.PI * 2 + k * 0.7) * u * 0.05)
        ctx.stroke()
      }
      break
    }
    case 'grid': {
      ctx.lineWidth = Math.max(1, u * 0.006)
      const step = u * 0.12
      for (let x = 0; x < w; x += step) ctx.strokeRect(x, -1, 0, h + 2)
      for (let y = 0; y < h; y += step) ctx.strokeRect(-1, y, w + 2, 0)
      break
    }
    case 'rings': {
      ctx.lineWidth = u * 0.03
      for (let r = u * 0.12; r < Math.hypot(w, h); r += u * 0.12) {
        ctx.beginPath()
        ctx.arc(w * 0.8, h * 0.78, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'solid':
      break
  }
  ctx.restore()
}

function iconPath(ctx: CanvasRenderingContext2D, shape: OsLook['icons'], x: number, y: number, s: number) {
  const r = s / 2
  const cx = x + r
  const cy = y + r
  ctx.beginPath()
  switch (shape) {
    case 'circle':
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      break
    case 'square':
      ctx.rect(x, y, s, s)
      break
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3
        ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      }
      ctx.closePath()
      break
    case 'drop':
      ctx.moveTo(x, y)
      ctx.lineTo(cx, y)
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI)
      ctx.closePath()
      break
    case 'squircle':
    default: {
      const k = s * 0.28
      ctx.moveTo(x + k, y)
      ctx.arcTo(x + s, y, x + s, y + s, k)
      ctx.arcTo(x + s, y + s, x, y + s, k)
      ctx.arcTo(x, y + s, x, y, k)
      ctx.arcTo(x, y, x + s, y, k)
      ctx.closePath()
    }
  }
}

/** An app icon: the shape in a colour picked from the look, with a small glyph. */
function icon(ctx: CanvasRenderingContext2D, look: OsLook, i: number, x: number, y: number, s: number) {
  const tones = [look.accent, mix(look.accent, '#ffffff', 0.45), mix(look.bg2, '#ffffff', 0.2), mix(look.accent, look.bg, 0.5), look.theme === 'dark' ? '#e9ebee' : '#2a2d31']
  const fill = tones[i % tones.length]
  iconPath(ctx, look.icons, x, y, s)
  ctx.fillStyle = fill
  ctx.fill()
  // a simple glyph so the icons read as different apps
  ctx.save()
  ctx.strokeStyle = luma(fill) > 0.6 ? '#1b1d21' : '#ffffff'
  ctx.lineWidth = Math.max(1, s * 0.08)
  const c = x + s / 2
  const m = y + s / 2
  const g = s * 0.22
  ctx.beginPath()
  switch (i % 5) {
    case 0:
      ctx.arc(c, m, g, 0, Math.PI * 2)
      break
    case 1:
      ctx.rect(c - g, m - g * 0.7, g * 2, g * 1.4)
      break
    case 2:
      ctx.moveTo(c - g, m + g)
      ctx.lineTo(c, m - g)
      ctx.lineTo(c + g, m + g)
      break
    case 3:
      ctx.moveTo(c - g, m)
      ctx.lineTo(c + g, m)
      ctx.moveTo(c, m - g)
      ctx.lineTo(c, m + g)
      break
    default:
      ctx.moveTo(c - g, m - g * 0.5)
      ctx.lineTo(c + g, m - g * 0.5)
      ctx.moveTo(c - g, m + g * 0.5)
      ctx.lineTo(c + g * 0.4, m + g * 0.5)
  }
  ctx.stroke()
  ctx.restore()
}

function clock(ctx: CanvasRenderingContext2D, look: OsLook, x: number, y: number, w: number, h: number, time: string, ink: string, big: boolean) {
  const font = FONTS[look.font]
  const [hh, mm] = time.split(':')
  ctx.save()
  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cx = x + w / 2
  const cy = y + h / 2
  const style = big && look.clock === 'minimal' ? 'digital' : look.clock
  switch (style) {
    case 'analog': {
      const r = Math.min(w, h) * 0.42
      ctx.strokeStyle = ink
      ctx.lineWidth = Math.max(1, r * 0.06)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(cx + Math.sin(a) * r * 0.82, cy - Math.cos(a) * r * 0.82)
        ctx.lineTo(cx + Math.sin(a) * r * 0.92, cy - Math.cos(a) * r * 0.92)
        ctx.stroke()
      }
      const hour = ((+hh % 12) + +mm / 60) / 12
      const min = +mm / 60
      ctx.lineWidth = Math.max(1.5, r * 0.09)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.sin(hour * Math.PI * 2) * r * 0.5, cy - Math.cos(hour * Math.PI * 2) * r * 0.5)
      ctx.stroke()
      ctx.strokeStyle = look.accent
      ctx.lineWidth = Math.max(1, r * 0.05)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.sin(min * Math.PI * 2) * r * 0.78, cy - Math.cos(min * Math.PI * 2) * r * 0.78)
      ctx.stroke()
      break
    }
    case 'stacked': {
      const size = Math.min(h * 0.46, w * 0.36)
      ctx.font = `600 ${size}px ${font}`
      ctx.fillText(hh, cx, cy - size * 0.48)
      ctx.fillStyle = look.accent
      ctx.fillText(mm, cx, cy + size * 0.48)
      break
    }
    case 'big': {
      const size = Math.min(h * 0.75, w * 0.26)
      ctx.font = `300 ${size}px ${font}`
      ctx.fillText(time, cx, cy)
      break
    }
    case 'minimal': {
      const size = Math.min(h * 0.3, w * 0.12)
      ctx.textAlign = 'left'
      ctx.font = `400 ${size}px ${font}`
      ctx.fillText(time, x + w * 0.08, cy)
      ctx.fillStyle = look.accent
      ctx.fillRect(x + w * 0.08, cy + size * 0.7, size * 1.6, Math.max(1, size * 0.08))
      break
    }
    case 'digital':
    default: {
      const size = Math.min(h * 0.5, w * 0.2)
      ctx.font = `500 ${size}px ${font}`
      ctx.fillText(time, cx, cy)
    }
  }
  ctx.restore()
}

/**
 * Paints the look of an operating system onto a canvas of w x h pixels: a home
 * screen by default, or the lock screen. Works for any size and shape, portrait
 * or landscape; nothing outside the rectangle is touched.
 */
export function paintOsLook(ctx: CanvasRenderingContext2D, look: OsLook, w: number, h: number, opts: PaintOpts = {}) {
  const time = opts.time ?? '09:41'
  const dark = look.theme === 'dark'
  const ink = dark ? '#f4f5f7' : '#16181c'
  const panel = dark ? 'rgba(10,12,16,0.55)' : 'rgba(255,255,255,0.7)'
  const font = FONTS[look.font]
  const u = Math.min(w, h)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  wallpaper(ctx, look, w, h)

  // status bar
  const bar = Math.max(8, u * 0.05)
  ctx.fillStyle = ink
  ctx.font = `600 ${bar * 0.62}px ${font}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  if (opts.screen !== 'lock') ctx.fillText(time, u * 0.05, bar * 0.75)
  ctx.fillRect(w - u * 0.12, bar * 0.5, u * 0.07, bar * 0.5)
  ctx.fillStyle = look.accent
  ctx.fillRect(w - u * 0.12, bar * 0.5, u * 0.045, bar * 0.5)

  if (opts.screen === 'lock') {
    clock(ctx, look, 0, h * 0.12, w, h * 0.3, time, ink, true)
    ctx.fillStyle = ink
    ctx.textAlign = 'center'
    ctx.font = `400 ${u * 0.045}px ${font}`
    ctx.fillText('Tuesday 9 June', w / 2, h * 0.47)
    // two notifications and the unlock bar
    for (let i = 0; i < 2; i++) {
      const y = h * (0.56 + i * 0.11)
      ctx.fillStyle = panel
      ctx.fillRect(w * 0.06, y, w * 0.88, h * 0.09)
      icon(ctx, look, i + 2, w * 0.09, y + h * 0.015, h * 0.06)
      ctx.fillStyle = ink
      ctx.globalAlpha = 0.8
      ctx.fillRect(w * 0.09 + h * 0.08, y + h * 0.025, w * 0.4, Math.max(1, h * 0.012))
      ctx.globalAlpha = 0.5
      ctx.fillRect(w * 0.09 + h * 0.08, y + h * 0.05, w * 0.55, Math.max(1, h * 0.01))
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = ink
    ctx.fillRect(w * 0.35, h - u * 0.05, w * 0.3, Math.max(2, u * 0.012))
    ctx.restore()
    return
  }

  // home: a clock widget, the apps in their layout, and a dock
  const top = bar * 1.6
  const clockH = look.clock === 'minimal' ? h * 0.08 : h * 0.16
  clock(ctx, look, 0, top, w, clockH, time, ink, false)
  const dockH = Math.min(h * 0.13, u * 0.24)
  const area = { x: w * 0.06, y: top + clockH + h * 0.03, w: w * 0.88, h: h - dockH - (top + clockH + h * 0.05) - u * 0.04 }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  if (look.layout === 'list') {
    const rows = Math.max(1, Math.floor(area.h / (u * 0.13)))
    const rh = area.h / rows
    for (let i = 0; i < rows; i++) {
      const y = area.y + i * rh
      const s = rh * 0.7
      icon(ctx, look, i, area.x, y + (rh - s) / 2, s)
      ctx.fillStyle = ink
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.font = `500 ${rh * 0.32}px ${font}`
      if (opts.labels !== false) ctx.fillText(APPS[i % APPS.length], area.x + s * 1.35, y + rh / 2)
      ctx.globalAlpha = 0.25
      ctx.fillRect(area.x + s * 1.35, y + rh - 1, area.w - s * 1.35, 1)
      ctx.globalAlpha = 1
    }
  } else if (look.layout === 'tiles') {
    const cols = w > h ? 4 : 2
    const gap = u * 0.025
    const tw = (area.w - gap * (cols - 1)) / cols
    const th = tw * 0.62
    const rows = Math.max(1, Math.floor((area.h + gap) / (th + gap)))
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        // every third row opens with a wide tile that takes the next one's place
        const wide = r % 3 === 0 && c % 2 === 0
        if (r % 3 === 0 && c % 2 === 1) continue
        const x = area.x + c * (tw + gap)
        const y = area.y + r * (th + gap)
        const tileW = wide ? tw * 2 + gap : tw
        ctx.fillStyle = i % 3 === 0 ? look.accent : panel
        ctx.fillRect(x, y, tileW, th)
        icon(ctx, look, i, x + th * 0.15, y + th * 0.15, th * 0.36)
        ctx.fillStyle = i % 3 === 0 && luma(look.accent) > 0.6 ? '#16181c' : i % 3 === 0 ? '#ffffff' : ink
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        ctx.font = `500 ${th * 0.18}px ${font}`
        if (opts.labels !== false) ctx.fillText(APPS[i % APPS.length], x + th * 0.15, y + th * 0.9)
      }
  } else {
    const cols = w > h ? 6 : 4
    const cell = area.w / cols
    const s = cell * 0.62
    const rh = cell * (opts.labels === false ? 1 : 1.25)
    const rows = Math.max(1, Math.floor(area.h / rh))
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const x = area.x + c * cell + (cell - s) / 2
        const y = area.y + r * rh
        icon(ctx, look, i, x, y, s)
        if (opts.labels !== false) {
          ctx.fillStyle = ink
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.font = `500 ${cell * 0.15}px ${font}`
          ctx.fillText(APPS[i % APPS.length], x + s / 2, y + s + cell * 0.05)
        }
      }
  }

  // dock
  const dy = h - dockH - u * 0.03
  ctx.fillStyle = panel
  ctx.fillRect(w * 0.04, dy, w * 0.92, dockH)
  ctx.fillStyle = look.accent
  ctx.fillRect(w * 0.04, dy, w * 0.92, Math.max(1, u * 0.006))
  const n = w > h ? 6 : 4
  const ds = Math.min(dockH * 0.66, (w * 0.92) / n * 0.62)
  for (let i = 0; i < n; i++) icon(ctx, look, i, w * 0.04 + ((i + 0.5) * w * 0.92) / n - ds / 2, dy + (dockH - ds) / 2, ds)
  ctx.restore()
}
