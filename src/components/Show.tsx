// The launch keynote, played out on stage as a short broadcast: a countdown
// while the house fills (with music and the stream's audience ticking up), an
// opening title sequence made for this event, the chief executive walking on,
// then a short segment for each device on the bill (the hero shot, an exploded
// view, what it does best, the colours it comes in), with an executive walking
// on between them, a recap of prices and dates, and a close with the night's
// figures and what the press said at the hands-on tables. Enter or Space moves
// on a beat, "Next" skips a segment, Esc skips to the result.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { type ShowState, SiteView } from '../3d/SiteView'
import { type ShotName, stagecraft } from '../3d/site/director'
import { deviceThumbnail } from '../3d/thumbnail'
import { ambientPad } from '../audio/pad'
import { crowdBed, sfx } from '../audio/sfx'
import { subLabel } from '../data/devices'
import { fmtDate, player } from '../sim/game'
import { EVENTS, OWN_VENUE } from '../sim/growth'
import { normalised } from '../sim/market'
import { hiredVenue, sumOf } from '../sim/sites'
import { type ExecId, type KeynoteStats, type Product, SUBS } from '../sim/types'
import { useGame, useStore } from '../store/game'
import type { IconName } from './icons'
import { specLines, thumbKey } from './Inspector'
import { INTRO_SECONDS, type IntroSpec, ShowIntro, seeded } from './ShowIntro'
import { clockText, handsOnLines, pressLines } from './ShowLines'
import { Btn, Head, IconBtn, Lead, Meter, int, pct, price, reducedMotion, useLayer } from './ui'

type Phase = 'doors' | 'intro' | 'walkon' | 'reveal' | 'exploded' | 'specs' | 'colours' | 'handoff' | 'os' | 'price' | 'available' | 'verdict'
/** One beat of the run of show: what, for how long (seconds), and for which segment (-1 for the whole night). */
interface Beat {
  ph: Phase
  dur: number
  seg: number
}
const SHOTS: Record<Phase, ShotName> = {
  doors: 'establish',
  intro: 'dark',
  walkon: 'walkon',
  reveal: 'wall',
  exploded: 'side',
  specs: 'wall',
  colours: 'crane',
  handoff: 'walkon',
  os: 'wall',
  price: 'wall',
  available: 'crane',
  verdict: 'orbit',
}
const SW = 1024
const SH = 672
const FONT = 'Bahnschrift, "Segoe UI", sans-serif'
const EXEC_ORDER: ExecId[] = ['cmo', 'cto', 'coo', 'sales', 'cfo', 'care', 'people']
const EXEC_TITLE: Record<ExecId, string> = {
  cmo: 'Chief marketing officer',
  cto: 'Chief technology officer',
  coo: 'Chief operating officer',
  sales: 'Head of sales',
  cfo: 'Chief financial officer',
  care: 'Head of customer care',
  people: 'Head of people',
}

/** The three things this device does best, in the reviewers' words. */
function strengths(p: Product, day: number): string[] {
  const n = normalised(p.raw, day)
  return [...SUBS]
    .sort((a, b) => n[b] - n[a])
    .slice(0, 3)
    .map((k) => subLabel(p.type, k))
}

interface DeviceSeg {
  kind: 'device'
  p: Product
  image: HTMLImageElement | null
  points: string[]
  specs: [string, string][]
  /** The colours it comes in: [name, frame, back]. */
  colours: [string, string, string][]
  available: string
}
interface OsSeg {
  kind: 'os'
  name: string
  version: number
}
type Seg = DeviceSeg | OsSeg

interface Deck {
  company: string
  color: string
  segs: Seg[]
  where: string
  event: string
  /** When the countdown on the wall reaches zero, in seconds into the doors beat. */
  doors: number
  /** The venue is still coming up on screen: the run of show has not started, so there is no clock to count down. */
  waiting: boolean
}

/** The run of show for a bill of segments. Without motion there are no titles. */
export function runOfShow(segs: { kind: 'device' | 'os'; colours?: number }[], still = false): Beat[] {
  const out: Beat[] = [{ ph: 'doors', dur: 6, seg: -1 }]
  if (!still) out.push({ ph: 'intro', dur: INTRO_SECONDS, seg: -1 })
  out.push({ ph: 'walkon', dur: 3.2, seg: -1 })
  segs.forEach((s, i) => {
    if (i) out.push({ ph: 'handoff', dur: 2.6, seg: i })
    if (s.kind === 'os') return void out.push({ ph: 'os', dur: 4.6, seg: i })
    out.push({ ph: 'reveal', dur: 4.4, seg: i }, { ph: 'exploded', dur: 3.4, seg: i }, { ph: 'specs', dur: 4.2, seg: i })
    if ((s.colours ?? 0) > 1) out.push({ ph: 'colours', dur: 3, seg: i })
  })
  const devices = segs.filter((s) => s.kind === 'device').length
  out.push({ ph: 'price', dur: devices > 1 ? 3.6 + 1.1 * devices : 5.2, seg: -1 }, { ph: 'available', dur: 4, seg: -1 }, { ph: 'verdict', dur: 0, seg: -1 })
  return out
}

/**
 * While the doors are open: the hype rising, the live audience and the fans
 * waiting to buy ticking up, and a line from the press every few seconds. All
 * of it is for show, from figures the game already has; the game is paused.
 */
function PreShow({ hype, viewers, fans, quotes, start, waiting, where }: { hype: number; viewers: number; fans: number; quotes: [string, string][]; start: () => void; waiting: boolean; where?: [string, string] }) {
  const t0 = useRef(performance.now())
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setT((performance.now() - t0.current) / 1000), 100)
    return () => window.clearInterval(id)
  }, [])
  const k = 1 - Math.exp(-t / 2.2)
  // the stream's audience keeps arriving, with the flicker of people dropping in and out
  const live = viewers * k * (1 + 0.004 * Math.sin(t * 7) + 0.01 * Math.min(1, t / 20))
  const quote = quotes[Math.floor(t / 3.2) % quotes.length]
  return (
    <div className="sb-lower pointer-events-auto absolute right-6 top-[calc(6vh+52px)] w-[300px] max-w-[calc(100%-3rem)] border border-line2 bg-carbon/90 p-3">
      <Head icon="trendUp" className="text-faint">
        Before the show
      </Head>
      {where && (
        <div className="mt-1 text-[12px] leading-snug">
          <div className="text-fg">{where[0]}</div>
          <div className="text-[11px] text-dim">{where[1]}</div>
        </div>
      )}
      <div className="mt-1 flex items-baseline justify-between text-[11px]">
        <span className="text-dim">Hype</span>
        <span className="num text-accent">+{pct(hype * k, 0)}</span>
      </div>
      <Meter value={Math.min(1, hype * k * 2)} tone="accent" />
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <div className="flex items-center gap-1 text-dim">
            <span className="h-1.5 w-1.5 animate-pulse bg-neg" />
            Watching live
          </div>
          <div className="num text-[13px] text-fg">{int(live)}</div>
        </div>
        <div>
          <div className="text-dim">Fans waiting to buy</div>
          <div className="num text-[13px] text-fg">{int(fans * k)}</div>
        </div>
      </div>
      <div key={quote[1]} className="sb-lower mt-2 border-l-2 border-accent pl-2 text-[12px] leading-snug text-fg">
        &ldquo;{quote[0]}&rdquo;
        <div className="mt-0.5 text-[11px] text-faint">{quote[1]}</div>
      </div>
      <Btn small tone="primary" icon="play" className="mt-3 w-full" title="Start the keynote now (Enter)" onClick={start}>
        {waiting ? 'Start the show' : 'Skip to the keynote'}
      </Btn>
    </div>
  )
}

const clamp01 = (k: number) => Math.max(0, Math.min(1, k))
const ease = (k: number) => {
  const c = clamp01(k)
  return 1 - (1 - c) ** 3
}

/** One frame of the LED wall: slides in the company's style, animated by the time into the beat. */
function drawSlide(g: CanvasRenderingContext2D, beat: Beat, t: number, d: Deck) {
  const phase = beat.ph
  g.globalAlpha = 1
  g.fillStyle = '#07090c'
  g.fillRect(0, 0, SW, SH)
  g.textBaseline = 'middle'
  const text = (s: string, x: number, y: number, size: number, fill = '#f2f2f0', weight = 600, align: CanvasTextAlign = 'center', max = SW - 120) => {
    g.textAlign = align
    let px = size
    g.font = `${weight} ${px}px ${FONT}`
    const w = g.measureText(s).width
    if (w > max) px = (px * max) / w
    g.font = `${weight} ${px}px ${FONT}`
    g.fillStyle = fill
    g.fillText(s, x, y)
  }
  // the company's frame: a bar of its colour along the foot, its name small at the top left, a hairline under it
  g.fillStyle = d.color
  g.fillRect(0, SH - 12, SW, 12)
  if (phase !== 'intro' && phase !== 'doors') {
    text(d.company.toUpperCase(), 48, 44, 22, '#9aa0a6', 600, 'left')
    g.fillStyle = '#20242a'
    g.fillRect(48, 66, SW - 96, 2)
  }
  const fade = (k: number) => (g.globalAlpha = clamp01(k))
  const seg = d.segs[beat.seg]
  const dev = seg?.kind === 'device' ? seg : null
  const devices = d.segs.filter((s): s is DeviceSeg => s.kind === 'device')
  const picture = (img: HTMLImageElement, cx: number, cy: number, bw: number, bh: number, sx = 1) => {
    const s = Math.min(bw / img.width, bh / img.height)
    g.drawImage(img, cx - (img.width * s * sx) / 2, cy - (img.height * s) / 2, img.width * s * sx, img.height * s)
  }
  switch (phase) {
    case 'doors': {
      text(d.company.toUpperCase(), SW / 2, SH / 2 - 40, 112)
      text(d.event, SW / 2, SH / 2 + 52, 34, d.color, 400)
      // the clock runs to the lights going down, the end of this beat; until the run of show starts there is none
      text(d.waiting ? 'THE STREAM STARTS SHORTLY' : `STARTING IN ${clockText(d.doors - t)}`, SW / 2, SH - 90, 26, '#9aa0a6', 400)
      break
    }
    case 'intro':
      break
    case 'walkon': {
      text(d.event.toUpperCase(), SW / 2, SH / 2 - 30, 64)
      g.fillStyle = d.color
      g.fillRect(SW / 2 - 60 * ease(t / 1.2), SH / 2 + 30, 120 * ease(t / 1.2), 6)
      break
    }
    case 'handoff': {
      fade(ease(t / 0.6))
      text('NEXT', SW / 2, SH / 2 - 50, 28, d.color, 600)
      text(seg?.kind === 'os' ? `${seg.name} ${seg.version}` : (dev?.p.name ?? ''), SW / 2, SH / 2 + 20, 72)
      break
    }
    case 'reveal': {
      if (dev?.image) {
        const k = ease(t / 1.6)
        fade(k)
        // the hero shot: it turns slowly on the wall, a highlight sweeping over it
        const turn = 0.86 + 0.14 * Math.cos(t * 0.9)
        picture(dev.image, SW / 2, 290, 600 * (0.82 + 0.18 * k), 440 * (0.82 + 0.18 * k), turn)
        const sx = ((t * 0.45) % 1.4) * SW - 200
        const grad = g.createLinearGradient(sx, 0, sx + 200, 0)
        grad.addColorStop(0, 'rgba(255,255,255,0)')
        grad.addColorStop(0.5, 'rgba(255,255,255,0.07)')
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = grad
        g.fillRect(sx, 70, 200, SH - 220)
      }
      fade(ease((t - 1.0) / 0.8))
      text(dev?.p.name ?? '', SW / 2, SH - 110, 92)
      // the moment of the reveal: the whole wall goes white and falls back
      if (t < 0.6) {
        g.globalAlpha = (1 - t / 0.6) * 0.9
        g.fillStyle = '#ffffff'
        g.fillRect(0, 0, SW, SH)
      }
      break
    }
    case 'exploded': {
      if (!dev) break
      text('INSIDE', 48, 112, 28, d.color, 600, 'left')
      // the picture comes apart in layers, each one named
      const parts = dev.specs.slice(0, 5)
      const n = Math.max(3, parts.length)
      const k = ease((t - 0.2) / 1.1)
      if (dev.image) {
        const img = dev.image
        const s = Math.min(420 / img.width, 400 / img.height)
        const w = img.width * s
        const h = img.height * s
        for (let i = 0; i < n; i++) {
          const y0 = (img.height / n) * i
          const off = (i - (n - 1) / 2) * 34 * k
          g.globalAlpha = 1
          g.drawImage(img, 0, y0, img.width, img.height / n, 330 - w / 2 + (i % 2 ? 16 : -16) * k, 360 - h / 2 + (h / n) * i + off, w, h / n)
        }
      }
      parts.forEach(([key, v], i) => {
        fade(ease((t - 0.6 - i * 0.22) / 0.4))
        const y = 360 + (i - (n - 1) / 2) * (400 / n + 34)
        g.fillStyle = '#3a4048'
        g.fillRect(560, y, 60, 1)
        g.fillStyle = d.color
        g.fillRect(620, y - 3, 6, 6)
        text(key.toUpperCase(), 640, y - 12, 16, '#9aa0a6', 600, 'left', 340)
        text(v, 640, y + 12, 24, '#f2f2f0', 600, 'left', 340)
      })
      break
    }
    case 'specs': {
      if (!dev) break
      text(dev.p.name, 48, 112, 52, d.color, 600, 'left')
      // up to four figures, one after another, in a grid of two
      dev.specs.slice(0, 4).forEach(([k, v], i) => {
        fade(ease((t - 0.3 - i * 0.45) / 0.5))
        const x = 48 + (i % 2) * ((SW - 96) / 2)
        const y = 210 + Math.floor(i / 2) * 150
        g.fillStyle = d.color
        g.fillRect(x, y - 30, 4, 96)
        text(k.toUpperCase(), x + 22, y - 10, 22, '#9aa0a6', 600, 'left', (SW - 96) / 2 - 40)
        text(v, x + 22, y + 34, 40, '#f2f2f0', 600, 'left', (SW - 96) / 2 - 40)
      })
      fade(ease((t - 2.4) / 0.6))
      text(dev.points.join('   /   '), SW / 2, SH - 70, 28, '#c9ccd0', 400)
      break
    }
    case 'colours': {
      if (!dev) break
      const on = Math.min(dev.colours.length - 1, Math.floor(t / (2.6 / dev.colours.length)))
      if (dev.image) picture(dev.image, 300, 350, 380, 420)
      // the picture takes on a wash of the colour in focus
      g.globalAlpha = 0.28
      g.globalCompositeOperation = 'source-atop'
      g.fillStyle = dev.colours[on][2]
      g.fillRect(100, 120, 400, 480)
      g.globalCompositeOperation = 'source-over'
      text('COLOURS', 600, 140, 28, d.color, 600, 'left')
      dev.colours.forEach(([name, frame, back], i) => {
        fade(ease((t - i * 0.15) / 0.4))
        const y = 220 + i * 78
        const r = i === on ? 26 : 20
        g.fillStyle = frame
        g.beginPath()
        g.arc(630, y, r, Math.PI / 2, (Math.PI * 3) / 2)
        g.fill()
        g.fillStyle = back
        g.beginPath()
        g.arc(630, y, r, -Math.PI / 2, Math.PI / 2)
        g.fill()
        if (i === on) {
          g.strokeStyle = d.color
          g.lineWidth = 3
          g.beginPath()
          g.arc(630, y, r + 6, 0, Math.PI * 2)
          g.stroke()
        }
        text(name, 680, y, i === on ? 34 : 26, i === on ? '#f2f2f0' : '#9aa0a6', 600, 'left', 300)
      })
      break
    }
    case 'os': {
      if (seg?.kind !== 'os') break
      fade(ease(t / 0.8))
      text('SOFTWARE', SW / 2, 170, 28, d.color, 600)
      text(seg.name, SW / 2, 270, 96)
      fade(ease((t - 0.5) / 0.6))
      text(`VERSION ${seg.version}`, SW / 2, 370, 44, '#c9ccd0', 400)
      fade(ease((t - 1.4) / 0.6))
      text('A free update for every device we sell', SW / 2, 470, 28, '#9aa0a6', 400)
      break
    }
    case 'price': {
      if (devices.length === 1) {
        const p = devices[0].p
        text(p.name, SW / 2, 150, 54, '#b9bdc2', 400)
        fade(ease((t - 0.3) / 0.6))
        text('STARTING AT', SW / 2, 250, 28, d.color, 600)
        // a beat of suspense, then the figure counts up fast and lands
        const k = clamp01((t - 1.2) / 0.9)
        fade(k > 0 ? 1 : 0)
        const shown = k >= 1 ? p.price : Math.round(p.price * ease(k) * 0.98)
        text(price(shown), SW / 2, SH / 2 + 60, 210 * (k >= 1 ? 1 + 0.06 * Math.max(0, 1 - (t - 2.1) / 0.4) : 1))
        break
      }
      // the recap: every device, its price, when it ships, and when it can be ordered
      text('PRICING AND AVAILABILITY', 48, 112, 28, d.color, 600, 'left')
      const row = Math.min(110, (SH - 220) / devices.length)
      devices.forEach((s, i) => {
        const k = ease((t - 0.3 - i * 0.5) / 0.5)
        g.globalAlpha = k
        const y = 180 + row * i + row / 2
        g.fillStyle = '#14181d'
        g.fillRect(48 + (1 - k) * 60, y - row / 2 + 6, SW - 96, row - 12)
        g.fillStyle = d.color
        g.fillRect(48 + (1 - k) * 60, y - row / 2 + 6, 4, row - 12)
        text(s.p.name, 76, y, 34, '#f2f2f0', 600, 'left', 360)
        text(price(s.p.price), 560, y, 40, '#f2f2f0', 600, 'right', 160)
        text(s.available === 'TODAY' ? 'On sale today' : `Ships ${s.available}`, 600, y - 14, 20, '#c9ccd0', 400, 'left', 360)
        text(s.available === 'TODAY' ? 'In stores and online' : 'Pre-orders open tonight', 600, y + 14, 18, '#9aa0a6', 400, 'left', 360)
      })
      break
    }
    case 'available':
    case 'verdict': {
      fade(ease(t / 0.8))
      text('AVAILABLE', SW / 2, 200, 34, d.color, 600)
      if (devices.length === 1) {
        text(devices[0].available, SW / 2, 290, 96)
        fade(ease((t - 0.6) / 0.8))
        text(devices[0].p.name, SW / 2, 420, 44, '#c9ccd0', 400)
      } else {
        devices.forEach((s, i) => {
          fade(ease((t - 0.3 - i * 0.25) / 0.6))
          text(`${s.p.name}   ${s.available}`, SW / 2, 270 + i * 54, 40, '#f2f2f0', 600)
        })
      }
      text(d.where, SW / 2, devices.length === 1 ? 490 : SH - 70, 28, '#9aa0a6', 400)
      break
    }
  }
  g.globalAlpha = 1
}

export function LaunchShow({ eventId }: { eventId: string }) {
  const g = useGame()
  const { watch, focus } = useStore.getState()
  const me = player(g)
  const e = g.events.find((x) => x.id === eventId)
  const p = g.products.find((x) => x.id === e?.productId)
  const extras = useMemo(() => (e?.extraIds ?? []).map((id) => g.products.find((x) => x.id === id)).filter((x): x is Product => !!x), [e?.extraIds, g.products])
  const bill = useMemo(() => (p ? [p, ...extras] : []), [p, extras])
  const still = reducedMotion()
  const [at, setAt] = useState(0)
  const [run, setRun] = useState(0)
  const images = useRef(new Map<string, HTMLImageElement>())
  const own = e?.venue === OWN_VENUE && !!g.venue
  const site = useMemo(() => (own && g.venue ? g.venue : hiredVenue(e?.venue ?? 0)), [own, g.venue, e?.venue])
  const craft = useMemo(() => stagecraft(site), [site])
  const seats = useMemo(() => sumOf(site, 'crowd'), [site])
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = SW
    canvas.height = SH
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  useEffect(() => () => tex.dispose(), [tex])
  const day = e?.day ?? g.day
  const score = e?.score ?? 0

  // the segments: each device, then the operating system if it is on the bill
  const segs = useMemo<Seg[]>(() => {
    const out: Seg[] = bill.map((x) => ({
      kind: 'device',
      p: x,
      image: null,
      points: strengths(x, day),
      specs: specLines(x.design, x.diag).filter(([, v]) => v && v !== 'none'),
      colours: [['Original', x.design.body.frameColor, x.design.body.backColor] as [string, string, string], ...(x.design.colors ?? []).map((c) => [c.name, c.frame, c.back] as [string, string, string])].slice(0, 5),
      available: x.launchDay > day ? fmtDate(x.launchDay) : x.status === 'dev' ? fmtDate(day + x.devDaysLeft) : 'TODAY',
    }))
    if (e?.withOs && g.os.own) out.push({ kind: 'os', name: g.os.name, version: g.os.version })
    return out
  }, [bill, day, e?.withOs, g.os.own, g.os.name, g.os.version])
  const beats = useMemo(
    () =>
      runOfShow(
        segs.map((s) => ({
          kind: s.kind,
          colours: s.kind === 'device' ? s.colours.length : 0,
        })),
        still,
      ),
    [segs, still],
  )
  const beat = beats[Math.min(at, beats.length - 1)]
  const phase = beat.ph
  const last = beats.length - 1

  // each device's portrait for the big screen
  useEffect(() => {
    let live = true
    for (const x of bill) {
      const url = deviceThumbnail(`${thumbKey(x, me.logo)}:show`, x.design, me.logo)
      if (!url) continue
      const img = new Image()
      img.onload = () => void (live && images.current.set(x.id, img))
      img.src = url
    }
    return () => void (live = false)
  }, [bill, me.logo])

  // what the night came to; older saves have only the headline beats
  const stats = useMemo<KeynoteStats | null>(() => {
    if (!e?.beats || !p) return null
    if (e.stats) return e.stats
    const b = e.beats
    return {
      viewers: Math.round(b.seats + 4000 + 400000 * Math.min(1, b.reach) * (0.4 + b.wow)),
      press: score,
      lines: [
        {
          id: p.id,
          wow: b.wow,
          press: score,
          preorders: Math.round(g.fans * (0.01 + 0.06 * b.wow)),
          hype: p.hype,
        },
      ],
    }
  }, [e?.beats, e?.stats, p, score, g.fans])

  // ---- the run of show: one timer per beat, all dropped when the show is skipped or closed
  const clock = useRef({ at: 0, start: performance.now() })
  const timers = useRef<number[]>([])
  const bed = useRef<ReturnType<typeof crowdBed> | null>(null)
  const pad = useRef<ReturnType<typeof ambientPad> | null>(null)
  const stopShow = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  const later = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms))
  /** The house's reaction to a device or a price: a roar, applause, or not much. */
  const react = (big: boolean, s = score) => {
    if (s >= 75) sfx.cheer(big ? 5 : 3, big ? 1.4 : 1)
    else if (s >= 50) sfx.applause(big ? 4 : 2.5, 1)
    else if (s >= 30) sfx.applause(2, 0.45)
    else bed.current?.set(0.15, 0.4)
  }
  const cue = (i: number) => {
    const bt = beats[i]
    clock.current = { at: i, start: performance.now() }
    setAt(i)
    const b = bed.current
    const ph = bt.ph
    const segScore = stats?.lines[bt.seg]?.press ?? score
    if (ph === 'doors') {
      b?.set(0.9, 1.5)
      pad.current?.set(0.9, 2)
    } else pad.current?.set(0, ph === 'intro' ? 4 : 1)
    if (ph === 'intro') {
      b?.set(0.15, 0.6)
      sfx.hush()
      later(1200, () => sfx.riser(4))
    }
    if (ph === 'walkon' || ph === 'handoff') {
      b?.set(0.1, 0.5)
      sfx.applause(ph === 'walkon' ? 3 : 2, ph === 'walkon' ? 0.9 : 0.6)
    }
    if (ph === 'reveal') {
      sfx.impact()
      later(250, sfx.launch)
      later(500, () => react(false, segScore))
    }
    if (ph === 'exploded') sfx.whoosh()
    if (ph === 'specs') {
      b?.set(0.08)
      if (segScore >= 40) later(2600, () => sfx.applause(1.6, 0.5))
    }
    if (ph === 'colours') sfx.pick()
    if (ph === 'os') {
      sfx.launch()
      later(800, () => sfx.applause(2, 0.7))
    }
    if (ph === 'price') {
      sfx.riser(1.2)
      later(2100, () => {
        sfx.impact()
        react(true)
      })
    }
    if (ph === 'available') later(300, () => sfx.applause(3.5, score >= 50 ? 1 : 0.5))
    if (ph === 'verdict') {
      b?.set(0.35, 1.5)
      ;(score >= 50 ? sfx.goal : sfx.alert)()
    }
  }
  /** Play the show from one beat on: that beat now, each later one at its own time after it. */
  const playFrom = (from: number) => {
    stopShow()
    cue(from)
    let t = 0
    for (let k = from; k < last; k++) {
      t += beats[k].dur
      const next = k + 1
      later(t * 1000, () => cue(next))
    }
  }
  useEffect(() => {
    bed.current = crowdBed()
    pad.current = ambientPad(seeded(me.name)() * 7)
    return () => {
      bed.current?.stop()
      bed.current = null
      pad.current?.stop()
      pad.current = null
    }
  }, [run, me.name])
  // the show starts once the venue is on screen (or after a few seconds whatever happens), not while it loads
  const [ready, setReady] = useState(false)
  /** The beat the show opens on: the doors, or straight to the titles when the player would not wait. */
  const [opening, setOpening] = useState(0)
  const readyRef = useRef(false)
  useEffect(() => void (readyRef.current = ready), [ready])
  useEffect(() => {
    if (ready) return
    const id = window.setTimeout(() => setReady(true), 9000)
    return () => window.clearTimeout(id)
  }, [ready, run])
  useEffect(() => {
    if (!ready) return
    playFrom(opening)
    return stopShow
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, score, ready, beats])
  /** Straight to the result: the beats still to come must not pull the show back. */
  const skip = () => {
    stopShow()
    cue(last)
  }
  /** On to the next beat without waiting for it; from the result, on with the game. */
  const onward = () => (at >= last ? watch(null) : playFrom(at + 1))
  /** On past the rest of this device's segment. */
  const nextSegment = () => {
    const j = beats.findIndex((b, k) => k > at && b.seg !== beat.seg)
    playFrom(j < 0 ? last : j)
  }
  // Esc skips to the result, and from the result closes the show; nothing behind it takes keys
  const box = useRef<HTMLDivElement>(null)
  useLayer(!!e && !!p && !!e.beats, () => (phase === 'verdict' ? watch(null) : skip()), { modal: true, box })

  // ---- the wall, drawn every frame while the show runs
  const deck = useMemo<Deck | null>(() => {
    if (!p || !e) return null
    const stores = g.stores?.length ?? 0
    const pick = ['Live', 'Next', 'Forward', 'Unboxed', 'Horizon', 'Spark'][Math.floor(seeded(e.id)() * 6)]
    return {
      company: me.name,
      color: me.color,
      segs,
      where: stores ? `Online and in ${int(stores)} ${stores === 1 ? 'store' : 'stores'}` : 'Online and from carriers everywhere',
      event: segs.length > 1 ? `${me.name} ${pick}` : `${p.family} launch event`,
      doors: beats[0].dur,
      waiting: true,
    }
  }, [p, e, me.name, me.color, segs, beats, g.stores?.length])
  useEffect(() => {
    if (!deck) return
    const ctx = (tex.image as HTMLCanvasElement).getContext('2d')
    if (!ctx) return
    let id = 0
    let prev = -1
    const frame = () => {
      const now = performance.now()
      // thirty frames a second is plenty for the wall
      if (now - prev > 33) {
        prev = now
        for (const s of deck.segs) if (s.kind === 'device') s.image = images.current.get(s.p.id) ?? null
        deck.waiting = !readyRef.current
        const t = (now - clock.current.start) / 1000
        drawSlide(ctx, beats[clock.current.at] ?? beats[0], still ? 9 : t, deck)
        tex.needsUpdate = true
      }
      id = requestAnimationFrame(frame)
    }
    id = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(id)
  }, [deck, tex, still, beats])

  const intro = useMemo<IntroSpec | null>(
    () =>
      deck && e
        ? {
            seed: `${e.id}:${me.name}`,
            company: me.name,
            title: deck.event,
            color: me.color,
            logo: me.logo,
          }
        : null,
    [deck, e, me.name, me.color, me.logo],
  )
  // the executives who take the stage between segments, the chief executive when there are none
  const execs = useMemo(() => g.staff.filter((x) => x.exec).sort((a, b) => EXEC_ORDER.indexOf(a.exec!) - EXEC_ORDER.indexOf(b.exec!)), [g.staff])

  useEffect(() => {
    if (!e || !p || !e.beats) watch(null)
  }, [e, p, watch])
  if (!e || !p || !e.beats || !deck || !stats || !intro) return null

  const b = e.beats
  const fill = Math.min(1, 0.45 + 0.55 * b.wow + (b.crew > 0.5 ? 0.1 : 0))
  const cheering = (phase === 'reveal' || phase === 'price' || phase === 'available' || phase === 'verdict') && score >= 45
  const show: ShowState = {
    crowd: phase === 'doors' ? fill * 0.7 : fill,
    cheer: cheering,
    screen: tex,
    presenter: phase !== 'doors' && phase !== 'intro',
  }
  const venue = EVENTS.keynote.venues[e.venue].name
  const director = () => {
    if (!craft || still) return null
    const t = (performance.now() - clock.current.start) / 1000
    const ph = beats[clock.current.at]?.ph ?? 'doors'
    // the hero shot swings round the stage once the device is up; a cut to the house once the price has landed
    if (ph === 'reveal' && t > 2.6) return craft.shot('orbit', t - 2.6)
    if (ph === 'price' && t > 3.0) return craft.shot('house', t - 3.0)
    return craft.shot(SHOTS[ph], t)
  }
  const presenterWalk = () => {
    const ph = beats[clock.current.at]?.ph ?? 'doors'
    const t = (performance.now() - clock.current.start) / 1000
    if (ph === 'walkon') return Math.min(1, t / 3)
    if (ph === 'handoff') return Math.min(1, t / 2.2)
    return ph === 'doors' || ph === 'intro' ? 0 : 1
  }
  const seg = segs[beat.seg]
  const segDev = seg?.kind === 'device' ? seg : null
  const exec = beat.ph === 'handoff' && execs.length ? execs[(beat.seg - 1) % execs.length] : null
  // the line along the foot of the picture: who, where, what
  const lower: Partial<Record<Phase, [string, string]>> = {
    doors: [`${venue}, ${fmtDate(e.day)}`, seats ? `${int(Math.round(seats * fill))} people are taking their seats.` : 'Cameras are rolling. The stream is about to start.'],
    walkon: [me.name, 'Chief executive, on stage'],
    handoff: exec ? [exec.name, `${EXEC_TITLE[exec.exec!]}, on stage`] : [me.name, 'Chief executive, back on stage'],
    reveal: segDev ? [segDev.p.name, (stats.lines[beat.seg]?.press ?? score) >= 60 ? 'The room comes to its feet.' : (stats.lines[beat.seg]?.press ?? score) >= 35 ? 'Applause.' : 'A murmur goes round the room.'] : undefined,
    exploded: segDev ? ['Inside', `How ${segDev.p.name} is built.`] : undefined,
    specs: segDev ? ['What it does best', segDev.points.join(', ') + '.'] : undefined,
    colours: segDev ? ['Colours', segDev.colours.map((c) => c[0]).join(', ') + '.'] : undefined,
    os: seg?.kind === 'os' ? [`${seg.name} ${seg.version}`, 'The software, on every device.'] : undefined,
    price: bill.length > 1 ? ['Pricing and availability', bill.map((x) => `${x.name} ${price(x.price)}`).join(' / ')] : ['The price', `${price(p.price)}${p.tiers?.length ? `, more for more storage` : ''}`],
  }
  // (at the doors the pre-show card says where and when)
  const caption = phase === 'doors' || phase === 'intro' ? undefined : lower[phase]
  const parts: [string, number, string, IconName][] = [
    ['The devices', b.wow, 'How strong the headline device is in its best segment. Nearly half the score.', 'devices'],
    ['The venue', Math.min(1, b.reach), 'How far a show from this stage carries.', 'venue'],
    ['Your marketers', b.crew, 'The team that staged it.', 'marketing'],
    ['On the night', b.luck, 'Demos work, or they do not.', 'dice'],
  ]
  const byId = new Map(bill.map((x) => [x.id, x]))
  const quotes = stats.lines.flatMap((l, i) => {
    const x = byId.get(l.id)
    const s = segs[i]
    return x ? handsOnLines(l.press, x.name, s?.kind === 'device' ? (s.points[0] ?? 'design') : 'design').slice(0, i ? 1 : 2) : []
  })
  const preorders = stats.lines.reduce((a, l) => a + l.preorders, 0)
  const watching = phase === 'doors' ? 0 : stats.viewers
  return (
    <div
      ref={box}
      role="dialog"
      aria-label={`Launch keynote: ${p.name}`}
      className="absolute inset-0 z-40 bg-carbon outline-none"
      // Enter or Space moves the show on; a button that has the keyboard keeps its own Enter and Space
      onKeyDown={(ev) => {
        if ((ev.key !== 'Enter' && ev.key !== ' ') || (ev.target as HTMLElement).closest('button, a')) return
        ev.preventDefault()
        onward()
      }}
    >
      <div className="absolute inset-0">
        <SiteView key={`${eventId}-${run}`} site={site} mode="cut" mood="night" tool={null} company={me.name} color={me.color} logo={me.logo} products={bill} show={show} autoRotate={!craft && phase !== 'verdict' && !still} director={director} presenterWalk={presenterWalk} onDrawn={() => setReady(true)} />
      </div>
      {phase === 'intro' && <ShowIntro key={run} spec={intro} done={() => {}} onLand={sfx.impact} />}
      {/* letterbox bars while the show runs: it is a broadcast, not the game */}
      {phase !== 'verdict' && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-[6vh] bg-black" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[6vh] bg-black" />
        </>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[3] flex items-center justify-between p-3">
        <div className="sb-float sb-toolbar px-3">
          <span className="h-2 w-2 animate-pulse bg-neg" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg">Live</span>
          <span className="text-[11px] text-dim">
            {me.name} / {venue}
          </span>
          {watching > 0 && <span className="num text-[11px] text-fg">{int(watching)} watching</span>}
          {phase !== 'verdict' && (
            <span className="ml-2 flex gap-[3px]" aria-hidden>
              {beats.slice(0, -1).map((bt, i) => (
                <span key={i} className={`h-[3px] w-3 ${i < at ? 'bg-accent' : i === at ? 'bg-fg' : 'bg-line2'}`} />
              ))}
            </span>
          )}
        </div>
        <div className="sb-float sb-toolbar pointer-events-auto">
          {phase === 'intro' && (
            <Btn small tone="ghost" icon="play" title="Skip the opening titles (Enter)" onClick={onward}>
              Skip intro
            </Btn>
          )}
          {beat.seg >= 0 && (
            <Btn small tone="ghost" icon="play" title="Skip the rest of this segment" onClick={nextSegment}>
              Next segment
            </Btn>
          )}
          {phase !== 'verdict' && (
            <Btn small tone="ghost" icon="fast" title="Skip to the result (Esc). Enter or Space moves on one beat." onClick={skip}>
              Skip
            </Btn>
          )}
          <IconBtn icon="close" tone="ghost" title={phase === 'verdict' ? 'Close the keynote (Esc)' : 'Close the keynote'} onClick={() => (stopShow(), watch(null))} />
        </div>
      </div>
      {phase === 'doors' && (
        <PreShow
          key={run}
          hype={p.hype}
          viewers={stats.viewers}
          fans={Math.round(g.fans * (0.03 + 0.12 * b.wow))}
          quotes={pressLines(b.wow, segDev?.points ?? (segs[0]?.kind === 'device' ? segs[0].points : []), p.name)}
          waiting={!ready}
          where={lower.doors}
          start={() => (ready ? onward() : (setOpening(1), setReady(true)))}
        />
      )}
      {caption && (
        <div key={at} className="sb-lower pointer-events-none absolute bottom-[calc(6vh+20px)] left-6 z-[3] max-w-[60%] border-l-4 border-accent bg-carbon/85 py-2 pl-4 pr-6">
          <div className="text-2xl font-semibold text-fg">{caption[0]}</div>
          <div className="mt-0.5 text-[13px] text-dim">{caption[1]}</div>
        </div>
      )}
      {phase === 'available' && (
        <div className="sb-lower pointer-events-none absolute inset-x-0 bottom-[calc(6vh+20px)] z-[3] flex justify-center">
          <div className="sb-float flex min-w-[360px] flex-col items-center px-8 py-4" style={{ borderTop: `3px solid ${me.color}` }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-dim">{me.name}</div>
            {segs.map((s) =>
              s.kind === 'device' ? (
                <div key={s.p.id} className="num mt-1 text-[13px] text-fg">
                  <span className="text-base font-semibold">{s.p.name}</span> / {s.available === 'TODAY' ? 'available today' : `ships ${s.available}, pre-order now`} / from {price(s.p.price)}
                </div>
              ) : null,
            )}
            <div className="mt-0.5 text-[11px] text-dim">{deck.where}</div>
          </div>
        </div>
      )}
      {phase === 'verdict' && (
        <div className="absolute bottom-6 left-6 z-[3] max-h-[calc(100%-5rem)] w-[420px] max-w-[calc(100%-3rem)] overflow-y-auto border border-line2 bg-panel/95 p-4">
          <div className="flex items-end justify-between">
            <div>
              <Head icon="mic" className="text-faint">
                Launch keynote
              </Head>
              <div className="text-base text-fg">{bill.length > 1 ? deck.event : p.name}</div>
            </div>
            <div className={`num text-5xl leading-none ${score >= 70 ? 'text-pos' : score >= 45 ? 'text-fg' : 'text-neg'}`}>{score}</div>
          </div>
          <div className="mt-1 text-[12px] text-dim">{e.summary}</div>
          <div className="mt-3 grid grid-cols-4 gap-1 border-y border-line py-2">
            {(
              [
                ['Watched', int(stats.viewers), 'eye'],
                ['Hype', `+${pct(Math.max(...bill.map((x) => x.hype)), 0)}`, 'trendUp'],
                ['Pre-orders', int(preorders), 'tag'],
                ['Press', `${stats.press}`, 'mic'],
              ] as [string, string, IconName][]
            ).map(([label, v, icon]) => (
              <div key={label}>
                <Head icon={icon} className="text-faint">
                  {label}
                </Head>
                <div className={`num text-[13px] ${label === 'Press' ? (stats.press >= 60 ? 'text-pos' : stats.press >= 40 ? 'text-fg' : 'text-neg') : 'text-fg'}`}>{v}</div>
              </div>
            ))}
          </div>
          {stats.lines.length > 1 && (
            <div className="mt-2 space-y-1">
              <div className="label grid grid-cols-[1fr_52px_72px_44px] gap-2">
                <span>Device</span>
                <span className="text-right">Hype</span>
                <span className="text-right">Pre-orders</span>
                <span className="text-right">Press</span>
              </div>
              {stats.lines.map((l) => (
                <div key={l.id} className="num grid grid-cols-[1fr_52px_72px_44px] gap-2 text-[11px] text-fg">
                  <span className="truncate">{byId.get(l.id)?.name ?? 'A device'}</span>
                  <span className="text-right text-accent">+{pct(l.hype, 0)}</span>
                  <span className="text-right">{int(l.preorders)}</span>
                  <span className="text-right">{l.press}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3">
            <Head icon="devices" className="text-faint">
              Hands-on area
            </Head>
            <div className="mt-1 space-y-1.5">
              {quotes.map(([q, who], i) => (
                <div key={i} className="border-l-2 border-accent pl-2 text-[12px] leading-snug text-fg">
                  &ldquo;{q}&rdquo; <span className="text-[11px] text-faint">{who}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-faint">The press score moves each device&rsquo;s reviews by up to half a point.</div>
          </div>
          <div className="mt-3 space-y-2">
            {parts.map(([label, v, note, icon]) => (
              <div key={label}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-fg">
                    <Lead icon={icon} />
                    {label}
                  </span>
                  <span className="num text-[11px] text-dim">{Math.round(v * 100)}</span>
                </div>
                <Meter value={v} tone={v > 0.7 ? 'pos' : v > 0.4 ? 'accent' : 'warn'} />
                <div className="text-[11px] text-faint">{note}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-1">
            <Btn className="flex-1" onClick={() => (setReady(false), setOpening(0), setRun((r) => r + 1))}>
              Watch again
            </Btn>
            <Btn className="flex-1" onClick={() => (watch(null), focus(p.id))}>
              See the device
            </Btn>
            <Btn tone="primary" className="flex-1" autoFocus title="Back to the game (Enter)" onClick={() => watch(null)}>
              Continue
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}
