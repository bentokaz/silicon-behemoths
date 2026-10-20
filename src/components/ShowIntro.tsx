// The opening titles of a keynote: about eight seconds of motion graphics made
// fresh for each event from the company's colour, logo and name and the event's
// title. Lines sweep in, outlined shapes turn, the title's letters arrive one by
// one, particles gather and burst as the logo lands, and a bar of the company's
// colour wipes it all away. One canvas, drawn with 2D calls, no assets.
import { useEffect, useRef } from 'react'

export const INTRO_SECONDS = 8

const FONT = 'Bahnschrift, "Segoe UI", sans-serif'
const clamp01 = (k: number) => Math.max(0, Math.min(1, k))
const out3 = (k: number) => 1 - (1 - clamp01(k)) ** 3
const inOut = (k: number) => {
  const c = clamp01(k)
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2
}

/** A small seeded generator, so one event always opens the same way and the next one differently. */
export function seeded(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface IntroSpec {
  seed: string
  company: string
  title: string
  color: string
  logo?: string
}

export interface Plan {
  style: 0 | 1 | 2
  lines: { a: number; off: number; at: number; w: number; len: number }[]
  shapes: {
    x: number
    y: number
    r: number
    sides: number
    spin: number
    at: number
  }[]
  dots: { a: number; d: number; s: number; v: number }[]
  angle: number
}

export function introPlan(seed: string): Plan {
  const r = seeded(seed)
  const style = Math.floor(r() * 3) as 0 | 1 | 2
  const angle = style === 0 ? 0 : style === 1 ? -Math.PI / 6 : Math.PI / 2
  return {
    style,
    angle,
    lines: Array.from({ length: 14 }, (_, i) => ({
      a: angle + (style === 2 ? (r() - 0.5) * 0.2 : 0),
      off: (r() - 0.5) * 1.6,
      at: 0.1 + i * 0.12 + r() * 0.2,
      w: r() < 0.25 ? 3 : 1,
      len: 0.3 + r() * 0.7,
    })),
    shapes: Array.from({ length: 6 }, () => ({
      x: r(),
      y: r(),
      r: 0.04 + r() * 0.12,
      sides: [0, 3, 4, 6][Math.floor(r() * 4)],
      spin: (r() - 0.5) * 1.2,
      at: 0.4 + r() * 2.4,
    })),
    dots: Array.from({ length: 160 }, () => ({
      a: r() * Math.PI * 2,
      d: 0.35 + r() * 0.7,
      s: 0.6 + r() * 1.8,
      v: 0.5 + r(),
    })),
  }
}

/** One frame of the titles at `t` seconds, in a `w` by `h` canvas. */
export function drawIntro(g: CanvasRenderingContext2D, w: number, h: number, t: number, spec: IntroSpec, p: Plan, logo: HTMLImageElement | null) {
  const m = Math.min(w, h)
  const cx = w / 2
  const cy = h / 2
  g.globalAlpha = 1
  g.fillStyle = '#050608'
  g.fillRect(0, 0, w, h)
  // a fine grid that draws itself in from the centre
  g.strokeStyle = '#11151a'
  g.lineWidth = 1
  const step = m / (p.style === 1 ? 14 : 10)
  const grid = out3(t / 1.6)
  g.beginPath()
  for (let x = cx % step; x < w; x += step) {
    g.moveTo(x, cy - (h / 2) * grid)
    g.lineTo(x, cy + (h / 2) * grid)
  }
  for (let y = cy % step; y < h; y += step) {
    g.moveTo(cx - (w / 2) * grid, y)
    g.lineTo(cx + (w / 2) * grid, y)
  }
  g.stroke()

  // sweeping lines in the house's direction
  const diag = Math.hypot(w, h)
  g.save()
  g.translate(cx, cy)
  for (const l of p.lines) {
    const k = inOut((t - l.at) / 1.1)
    const gone = inOut((t - l.at - 3.2) / 1.2)
    if (k <= 0 || gone >= 1) continue
    g.save()
    g.rotate(l.a)
    const y = l.off * m * 0.5
    const x0 = -diag / 2 + diag * gone
    const x1 = -diag / 2 + diag * k * l.len + diag * (1 - l.len) * k
    g.strokeStyle = l.w > 1 ? spec.color : '#3a4048'
    g.globalAlpha = l.w > 1 ? 0.9 : 0.7
    g.lineWidth = l.w
    g.beginPath()
    g.moveTo(x0, y)
    g.lineTo(Math.max(x0, x1), y)
    g.stroke()
    g.restore()
  }
  g.restore()

  // outlined shapes that turn slowly and scale in
  for (const s of p.shapes) {
    const k = out3((t - s.at) / 0.9)
    const fadeOut = 1 - clamp01((t - 6.2) / 0.6)
    if (k <= 0 || fadeOut <= 0) continue
    g.save()
    g.translate(s.x * w, s.y * h)
    g.rotate(s.spin * t)
    g.globalAlpha = 0.55 * fadeOut
    g.strokeStyle = s.sides === 4 ? spec.color : '#5b626b'
    g.lineWidth = 1.5
    const rad = s.r * m * k
    g.beginPath()
    if (!s.sides) g.arc(0, 0, rad, 0, Math.PI * 2 * k)
    else
      for (let i = 0; i <= s.sides; i++) {
        const a = (i / s.sides) * Math.PI * 2
        if (i) g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad)
        else g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad)
      }
    g.stroke()
    g.restore()
  }

  // particles: drift, gather to the centre, burst as the logo lands at 5.2 s
  const LAND = 5.2
  const gather = inOut((t - 3.4) / (LAND - 3.4))
  const burst = t > LAND ? out3((t - LAND) / 1.4) : 0
  g.fillStyle = spec.color
  for (const d of p.dots) {
    const drift = d.d * m * 0.6 + Math.sin(t * d.v + d.a * 3) * 8
    const r = t < LAND ? drift * (1 - gather * 0.92) : drift * 0.08 + burst * m * d.v * 0.9
    const a = d.a + t * 0.15 * d.v
    g.globalAlpha = (t < LAND ? 0.25 + 0.6 * gather : 1 - burst) * clamp01(t / 0.8)
    const ds = d.s * Math.max(1.4, m / 300)
    g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.75, ds, ds)
  }

  // kinetic type: the event's title, letter by letter, then it lifts away
  const title = spec.title.toUpperCase()
  const tIn = clamp01((t - 0.9) / 1.6)
  const tOut = inOut((t - 3.3) / 0.7)
  if (tIn > 0 && tOut < 1) {
    let px = m * 0.075
    g.font = `600 ${px}px ${FONT}`
    const track = px * 0.18 * (1 - out3(tIn))
    const full = g.measureText(title).width + track * title.length
    if (full > w * 0.86) {
      px *= (w * 0.86) / full
      g.font = `600 ${px}px ${FONT}`
    }
    const widths = [...title].map((c) => g.measureText(c).width + track)
    let x = cx - widths.reduce((a, b) => a + b, 0) / 2
    g.textBaseline = 'middle'
    g.textAlign = 'left'
    ;[...title].forEach((c, i) => {
      const k = out3(tIn * 1.8 - (i / Math.max(1, title.length)) * 0.8)
      g.globalAlpha = k * (1 - tOut)
      g.fillStyle = '#f2f2f0'
      g.fillText(c, x, cy + (1 - k) * px * 0.9 - tOut * px * 1.4)
      x += widths[i]
    })
    // an accent underline that runs out under it
    g.globalAlpha = 1 - tOut
    g.fillStyle = spec.color
    const uw = w * 0.3 * out3((t - 1.6) / 0.8)
    g.fillRect(cx - uw / 2, cy + px * 0.8, uw, Math.max(2, px * 0.06))
  }

  // the logo lands, with a flash, then the company's name tracks in beneath it
  if (t > LAND - 0.15) {
    const k = out3((t - LAND + 0.15) / 0.5)
    const size = m * 0.2 * (1.25 - 0.25 * k)
    const fade = 1 - clamp01((t - 7.1) / 0.5)
    g.globalAlpha = k * fade
    if (logo && logo.width) {
      const s = Math.min(size / logo.width, size / logo.height)
      g.drawImage(logo, cx - (logo.width * s) / 2, cy - size * 0.35 - (logo.height * s) / 2, logo.width * s, logo.height * s)
    } else {
      // no logo: a mark of the company's initial in a square of its colour
      g.fillStyle = spec.color
      g.fillRect(cx - size / 2, cy - size * 0.35 - size / 2, size, size)
      g.fillStyle = '#050608'
      g.font = `700 ${size * 0.62}px ${FONT}`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(spec.company.trim().charAt(0).toUpperCase() || '?', cx, cy - size * 0.35 + size * 0.04)
    }
    const name = spec.company.toUpperCase()
    const nk = out3((t - LAND - 0.25) / 0.9)
    let px = m * 0.06
    g.font = `600 ${px}px ${FONT}`
    const gap = px * (0.6 - 0.45 * nk)
    const wide = g.measureText(name).width + gap * (name.length - 1)
    if (wide > w * 0.8) {
      px *= (w * 0.8) / wide
      g.font = `600 ${px}px ${FONT}`
    }
    g.globalAlpha = nk * fade
    g.fillStyle = '#f2f2f0'
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    const ws = [...name].map((c) => g.measureText(c).width)
    let x = cx - (ws.reduce((a, b) => a + b, 0) + gap * (name.length - 1)) / 2
    for (let i = 0; i < name.length; i++) {
      g.fillText(name[i], x, cy + size * 0.42)
      x += ws[i] + gap
    }
    if (t < LAND + 0.4) {
      g.globalAlpha = (1 - (t - LAND + 0.15) / 0.55) * 0.8
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, w, h)
    }
  }

  // out: a bar of the company's colour wipes across, then black
  const wipe = inOut((t - 7.2) / 0.7)
  if (wipe > 0) {
    g.globalAlpha = 1
    g.fillStyle = spec.color
    const bw = w * 0.18
    const x = -bw + (w + bw * 2) * wipe
    g.fillRect(x - bw, 0, bw, h)
    g.fillStyle = '#000000'
    g.fillRect(0, 0, Math.max(0, x - bw), h)
  }
  g.globalAlpha = 1
}

/** The titles as a full-screen layer: plays once, then calls `done`. The parent skips it by unmounting it. */
export function ShowIntro({ spec, done, onLand }: { spec: IntroSpec; done: () => void; onLand?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const doneRef = useRef(done)
  const landRef = useRef(onLand)
  doneRef.current = done
  landRef.current = onLand
  useEffect(() => {
    const c = ref.current
    const g = c?.getContext('2d')
    if (!c || !g) return
    const p = introPlan(spec.seed)
    let logo: HTMLImageElement | null = null
    if (spec.logo) {
      const img = new Image()
      img.onload = () => (logo = img)
      img.src = spec.logo
    }
    // drawn at most at the screen's own size, and never above 1.5x: it is all flat shapes
    const fit = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1)
      c.width = Math.round(c.clientWidth * dpr)
      c.height = Math.round(c.clientHeight * dpr)
    }
    fit()
    window.addEventListener('resize', fit)
    const t0 = performance.now()
    let landed = false
    let id = 0
    const frame = () => {
      const t = (performance.now() - t0) / 1000
      if (!landed && t > 5.2) {
        landed = true
        landRef.current?.()
      }
      drawIntro(g, c.width, c.height, t, spec, p, logo)
      if (t >= INTRO_SECONDS) return doneRef.current()
      id = requestAnimationFrame(frame)
    }
    id = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', fit)
    }
  }, [spec])
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-[1] h-full w-full" />
}
