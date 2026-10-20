// The launch keynote, played out on stage as a short broadcast: a wide shot
// of the house filling, the lights going down, the presenter walking on under
// a follow spot, the device going up on the LED wall, what it does best, the
// price, and a last card saying where to get it, with the crowd reacting at
// each turn. About half a minute; Enter or Space moves on a beat, Esc skips
// to the result. Shown when a keynote happens, and again from the events list.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { type ShowState, SiteView } from '../3d/SiteView'
import { type ShotName, stagecraft } from '../3d/site/director'
import { deviceThumbnail } from '../3d/thumbnail'
import { crowdBed, sfx } from '../audio/sfx'
import { subLabel } from '../data/devices'
import { fmtDate, player } from '../sim/game'
import { EVENTS, OWN_VENUE } from '../sim/growth'
import { normalised } from '../sim/market'
import { hiredVenue, sumOf } from '../sim/sites'
import { type Product, SUBS } from '../sim/types'
import { useGame, useStore } from '../store/game'
import type { IconName } from './icons'
import { specLines, thumbKey } from './Inspector'
import { clockText, pressLines } from './ShowLines'
import { Btn, Head, IconBtn, Lead, Meter, int, pct, price, reducedMotion, useLayer } from './ui'

type Phase = 'doors' | 'dark' | 'walkon' | 'reveal' | 'specs' | 'price' | 'available' | 'verdict'
/** Each beat and how long it runs, in seconds. */
const BEATS: [Phase, number][] = [
  ['doors', 4.5],
  ['dark', 2.6],
  ['walkon', 3.6],
  ['reveal', 5.2],
  ['specs', 5],
  ['price', 5.2],
  ['available', 4.4],
  ['verdict', 0],
]
const SHOTS: Record<Phase, ShotName> = { doors: 'establish', dark: 'dark', walkon: 'walkon', reveal: 'wall', specs: 'side', price: 'wall', available: 'crane', verdict: 'orbit' }
const SW = 1024
const SH = 672
const FONT = 'Bahnschrift, "Segoe UI", sans-serif'

/** The three things this device does best, in the reviewers' words. */
function strengths(p: Product, day: number): string[] {
  const n = normalised(p.raw, day)
  return [...SUBS].sort((a, b) => n[b] - n[a]).slice(0, 3).map((k) => subLabel(p.type, k))
}

interface Deck {
  company: string
  color: string
  p: Product
  image: HTMLImageElement | null
  points: string[]
  specs: [string, string][]
  available: string
  where: string
  event: string
  /** The venue is still coming up on screen: the run of show has not started, so there is no clock to count down. */
  waiting: boolean
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
          <div className="text-dim">Watching live</div>
          <div className="num text-[13px] text-fg">{int(viewers * k)}</div>
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
function drawSlide(g: CanvasRenderingContext2D, phase: Phase, t: number, d: Deck) {
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
  if (phase !== 'dark' && phase !== 'doors') {
    text(d.company.toUpperCase(), 48, 44, 22, '#9aa0a6', 600, 'left')
    g.fillStyle = '#20242a'
    g.fillRect(48, 66, SW - 96, 2)
  }
  const fade = (k: number) => (g.globalAlpha = clamp01(k))
  switch (phase) {
    case 'doors': {
      text(d.company.toUpperCase(), SW / 2, SH / 2 - 40, 112)
      text(d.event, SW / 2, SH / 2 + 52, 34, d.color, 400)
      // the clock runs to the lights going down, the end of this beat; until the run of show starts there is none
      text(d.waiting ? 'THE STREAM STARTS SHORTLY' : `STARTING IN ${clockText(BEATS[0][1] - t)}`, SW / 2, SH - 90, 26, '#9aa0a6', 400)
      break
    }
    case 'dark': {
      // black, then the name comes up out of it
      fade(ease((t - 1.1) / 1.2))
      text(d.company.toUpperCase(), SW / 2, SH / 2, 120)
      break
    }
    case 'walkon': {
      text(d.event.toUpperCase(), SW / 2, SH / 2 - 30, 64)
      g.fillStyle = d.color
      g.fillRect(SW / 2 - 60 * ease(t / 1.2), SH / 2 + 30, 120 * ease(t / 1.2), 6)
      break
    }
    case 'reveal': {
      if (d.image) {
        const k = ease(t / 1.6)
        const s = Math.min(600 / d.image.width, 440 / d.image.height) * (0.82 + 0.18 * k)
        fade(k)
        g.drawImage(d.image, SW / 2 - (d.image.width * s) / 2, 300 - (d.image.height * s) / 2, d.image.width * s, d.image.height * s)
      }
      fade(ease((t - 1.0) / 0.8))
      text(d.p.name, SW / 2, SH - 110, 92)
      // the moment of the reveal: the whole wall goes white and falls back
      if (t < 0.6) {
        g.globalAlpha = (1 - t / 0.6) * 0.9
        g.fillStyle = '#ffffff'
        g.fillRect(0, 0, SW, SH)
      }
      break
    }
    case 'specs': {
      text(d.p.name, 48, 112, 52, d.color, 600, 'left')
      // up to four figures, one after another, in a grid of two
      d.specs.slice(0, 4).forEach(([k, v], i) => {
        fade(ease((t - 0.3 - i * 0.45) / 0.5))
        const x = 48 + (i % 2) * ((SW - 96) / 2)
        const y = 210 + Math.floor(i / 2) * 150
        g.fillStyle = d.color
        g.fillRect(x, y - 30, 4, 96)
        text(k.toUpperCase(), x + 22, y - 10, 22, '#9aa0a6', 600, 'left', (SW - 96) / 2 - 40)
        text(v, x + 22, y + 34, 40, '#f2f2f0', 600, 'left', (SW - 96) / 2 - 40)
      })
      fade(ease((t - 2.4) / 0.6))
      text(d.points.join('   /   '), SW / 2, SH - 70, 28, '#c9ccd0', 400)
      break
    }
    case 'price': {
      text(d.p.name, SW / 2, 150, 54, '#b9bdc2', 400)
      fade(ease((t - 0.3) / 0.6))
      text('STARTING AT', SW / 2, 250, 28, d.color, 600)
      // a beat of suspense, then the figure counts up fast and lands
      const k = clamp01((t - 1.2) / 0.9)
      fade(k > 0 ? 1 : 0)
      const shown = k >= 1 ? d.p.price : Math.round(d.p.price * ease(k) * 0.98)
      text(price(shown), SW / 2, SH / 2 + 60, 210 * (k >= 1 ? 1 + 0.06 * Math.max(0, 1 - (t - 2.1) / 0.4) : 1))
      break
    }
    case 'available':
    case 'verdict': {
      fade(ease(t / 0.8))
      text('AVAILABLE', SW / 2, 200, 34, d.color, 600)
      text(d.available, SW / 2, 290, 96)
      fade(ease((t - 0.6) / 0.8))
      text(d.p.name, SW / 2, 420, 44, '#c9ccd0', 400)
      text(d.where, SW / 2, 490, 28, '#9aa0a6', 400)
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
  const [phase, setPhase] = useState<Phase>('doors')
  const [run, setRun] = useState(0)
  const image = useRef<HTMLImageElement | null>(null)
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
  const points = useMemo(() => (p ? strengths(p, e?.day ?? g.day) : []), [p, e?.day, g.day])
  const score = e?.score ?? 0
  const still = reducedMotion()

  // the device's portrait for the big screen
  useEffect(() => {
    if (!p) return
    let live = true
    const url = deviceThumbnail(`${thumbKey(p, me.logo)}:show`, p.design, me.logo)
    if (!url) return
    const img = new Image()
    img.onload = () => {
      if (live) image.current = img
    }
    img.src = url
    return () => void (live = false)
  }, [p, me.logo])

  // ---- the run of show: one timer per beat, all dropped when the show is skipped or closed
  const clock = useRef({ phase: 'doors' as Phase, at: performance.now() })
  const timers = useRef<number[]>([])
  const bed = useRef<ReturnType<typeof crowdBed> | null>(null)
  const stopShow = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  const later = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms))
  /** The house's reaction to the price and the device: a roar, applause, or not much. */
  const react = (big: boolean) => {
    if (score >= 75) sfx.cheer(big ? 5 : 3, big ? 1.4 : 1)
    else if (score >= 50) sfx.applause(big ? 4 : 2.5, 1)
    else if (score >= 30) sfx.applause(2, 0.45)
    else bed.current?.set(0.15, 0.4)
  }
  const cue = (ph: Phase) => {
    clock.current = { phase: ph, at: performance.now() }
    setPhase(ph)
    const b = bed.current
    if (ph === 'doors') b?.set(0.9, 1.5)
    if (ph === 'dark') {
      b?.set(0.2, 0.6)
      sfx.hush()
    }
    if (ph === 'walkon') {
      b?.set(0.1, 0.5)
      sfx.applause(3, 0.9)
    }
    if (ph === 'reveal') {
      sfx.impact()
      later(250, sfx.launch)
      later(500, () => react(false))
    }
    if (ph === 'specs') {
      b?.set(0.08)
      if (score >= 40) later(2600, () => sfx.applause(1.6, 0.5))
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
    cue(BEATS[from][0])
    let at = 0
    for (let k = from; k < BEATS.length - 1; k++) {
      at += BEATS[k][1]
      const next = BEATS[k + 1][0]
      later(at * 1000, () => cue(next))
    }
  }
  useEffect(() => {
    bed.current = crowdBed()
    return () => {
      bed.current?.stop()
      bed.current = null
    }
  }, [run])
  // the show starts once the venue is on screen (or after a few seconds whatever happens), not while it loads
  const [ready, setReady] = useState(false)
  /** The beat the show opens on: the doors, or straight to the lights going down when the player would not wait. */
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
  }, [run, score, ready])
  /** Straight to the result: the beats still to come must not pull the show back. */
  const skip = () => {
    stopShow()
    cue('verdict')
  }
  /** On to the next beat without waiting for it; from the result, on with the game. */
  const onward = () => {
    const at = BEATS.findIndex(([ph]) => ph === phase)
    if (phase === 'verdict' || at < 0) watch(null)
    else playFrom(at + 1)
  }
  // Esc skips to the result, and from the result closes the show; nothing behind it takes keys
  const box = useRef<HTMLDivElement>(null)
  useLayer(!!e && !!p && !!e.beats, () => (phase === 'verdict' ? watch(null) : skip()), { modal: true, box })

  // ---- the wall, drawn every frame while the show runs
  const deck = useMemo<Deck | null>(() => {
    if (!p || !e) return null
    const stores = g.stores?.length ?? 0
    return {
      company: me.name,
      color: me.color,
      p,
      image: null,
      points,
      specs: specLines(p.design, p.diag).filter(([, v]) => v && v !== 'none'),
      available: p.launchDay > e.day ? fmtDate(p.launchDay) : 'TODAY',
      where: stores ? `Online and in ${int(stores)} ${stores === 1 ? 'store' : 'stores'}` : 'Online and from carriers everywhere',
      event: `${p.family} launch event`,
      waiting: true,
    }
  }, [p, e, me.name, me.color, points, g.stores?.length])
  useEffect(() => {
    if (!deck) return
    const ctx = (tex.image as HTMLCanvasElement).getContext('2d')
    if (!ctx) return
    let id = 0
    let last = -1
    const frame = () => {
      const now = performance.now()
      // thirty frames a second is plenty for the wall
      if (now - last > 33) {
        last = now
        deck.image = image.current
        deck.waiting = !readyRef.current
        const t = (now - clock.current.at) / 1000
        drawSlide(ctx, clock.current.phase, still ? 9 : t, deck)
        tex.needsUpdate = true
      }
      id = requestAnimationFrame(frame)
    }
    id = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(id)
  }, [deck, tex, still])

  useEffect(() => {
    if (!e || !p || !e.beats) watch(null)
  }, [e, p, watch])
  if (!e || !p || !e.beats || !deck) return null

  const b = e.beats
  const fill = Math.min(1, 0.45 + 0.55 * b.wow + (b.crew > 0.5 ? 0.1 : 0))
  const cheering = (phase === 'reveal' || phase === 'price' || phase === 'available' || phase === 'verdict') && score >= 45
  const show: ShowState = { crowd: phase === 'doors' ? fill * 0.7 : fill, cheer: cheering, screen: tex, presenter: phase !== 'doors' && phase !== 'dark' }
  const venue = EVENTS.keynote.venues[e.venue].name
  const director = () => {
    if (!craft || still) return null
    const t = (performance.now() - clock.current.at) / 1000
    const ph = clock.current.phase
    // a cut to the house for its reaction, once the device and then the price have landed
    if (ph === 'reveal' && t > 3.4) return craft.shot('house', t - 3.4)
    if (ph === 'price' && t > 3.0) return craft.shot('house', t - 3.0)
    return craft.shot(SHOTS[ph], t)
  }
  const presenterWalk = () => {
    const ph = clock.current.phase
    if (ph === 'walkon') return Math.min(1, (performance.now() - clock.current.at) / 1000 / 3)
    return ph === 'doors' || ph === 'dark' ? 0 : 1
  }
  // the line along the foot of the picture: who, where, what
  const lower: Partial<Record<Phase, [string, string]>> = {
    doors: [`${venue}, ${fmtDate(e.day)}`, seats ? `${int(Math.round(seats * fill))} people are taking their seats.` : 'Cameras are rolling. The stream is about to start.'],
    walkon: [me.name, 'Chief executive, on stage'],
    reveal: [p.name, score >= 60 ? 'The room comes to its feet.' : score >= 35 ? 'Applause.' : 'A murmur goes round the room.'],
    specs: ['What it does best', points.join(', ') + '.'],
    price: ['The price', `${price(p.price)}${p.tiers?.length ? `, more for more storage` : ''}`],
  }
  // (at the doors the pre-show card says where and when)
  const caption = phase === 'doors' ? undefined : lower[phase]
  const parts: [string, number, string, IconName][] = [
    ['The device itself', b.wow, 'How strong it is in its best segment. Nearly half the score.', 'devices'],
    ['The venue', Math.min(1, b.reach), 'How far a show from this stage carries.', 'venue'],
    ['Your marketers', b.crew, 'The team that staged it.', 'marketing'],
    ['On the night', b.luck, 'Demos work, or they do not.', 'dice'],
  ]
  const step = BEATS.findIndex(([ph]) => ph === phase)
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
        <SiteView key={`${eventId}-${run}`} site={site} mode="cut" mood="night" tool={null} company={me.name} color={me.color} logo={me.logo} products={[p]} show={show} autoRotate={!craft && phase !== 'verdict' && !still} director={director} presenterWalk={presenterWalk} onDrawn={() => setReady(true)} />
      </div>
      {/* letterbox bars while the show runs: it is a broadcast, not the game */}
      {phase !== 'verdict' && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[6vh] bg-black" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[6vh] bg-black" />
        </>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
        <div className="sb-float sb-toolbar px-3">
          <span className="h-2 w-2 animate-pulse bg-neg" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg">Live</span>
          <span className="text-[11px] text-dim">
            {me.name} / {venue}
          </span>
          {phase !== 'verdict' && (
            <span className="ml-2 flex gap-[3px]" aria-hidden>
              {BEATS.slice(0, -1).map(([ph], i) => (
                <span key={ph} className={`h-[3px] w-4 ${i < step ? 'bg-accent' : i === step ? 'bg-fg' : 'bg-line2'}`} />
              ))}
            </span>
          )}
        </div>
        <div className="sb-float sb-toolbar pointer-events-auto">
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
          viewers={Math.round(seats * fill + 4000 + 400000 * Math.min(1, b.reach) * (0.4 + b.wow))}
          fans={Math.round(g.fans * (0.03 + 0.12 * b.wow))}
          quotes={pressLines(b.wow, points, p.name)}
          waiting={!ready}
          where={lower.doors}
          start={() => (ready ? onward() : (setOpening(1), setReady(true)))}
        />
      )}
      {caption && (
        <div key={phase} className="sb-lower pointer-events-none absolute bottom-[calc(6vh+20px)] left-6 max-w-[60%] border-l-4 border-accent bg-carbon/85 py-2 pl-4 pr-6">
          <div className="text-2xl font-semibold text-fg">{caption[0]}</div>
          <div className="mt-0.5 text-[13px] text-dim">{caption[1]}</div>
        </div>
      )}
      {phase === 'available' && (
        <div className="sb-lower pointer-events-none absolute inset-x-0 bottom-[calc(6vh+20px)] flex justify-center">
          <div className="sb-float flex min-w-[360px] flex-col items-center px-8 py-4" style={{ borderTop: `3px solid ${me.color}` }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-dim">{me.name}</div>
            <div className="mt-1 text-3xl font-semibold text-fg">{p.name}</div>
            <div className="num mt-1 text-[13px] text-fg">
              Available {deck.available === 'TODAY' ? 'today' : deck.available} / from {price(p.price)}
            </div>
            <div className="mt-0.5 text-[11px] text-dim">{deck.where}</div>
          </div>
        </div>
      )}
      {phase === 'verdict' && (
        <div className="absolute bottom-6 left-6 max-h-[calc(100%-5rem)] w-[400px] max-w-[calc(100%-3rem)] overflow-y-auto border border-line2 bg-panel/95 p-4">
          <div className="flex items-end justify-between">
            <div>
              <Head icon="mic" className="text-faint">
                Launch keynote
              </Head>
              <div className="text-base text-fg">{p.name}</div>
            </div>
            <div className={`num text-5xl leading-none ${score >= 70 ? 'text-pos' : score >= 45 ? 'text-fg' : 'text-neg'}`}>{score}</div>
          </div>
          <div className="mt-1 text-[12px] text-dim">{e.summary}</div>
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
          <div className="mt-3 grid grid-cols-2 gap-1 border-t border-line pt-2">
            <div>
              <Head icon="trendUp" className="text-faint">
                Launch hype
              </Head>
              <div className="num text-[13px] text-accent">+{pct(p.hype, 0)}</div>
            </div>
            <div>
              <Head icon="tag" className="text-faint">
                Priced at
              </Head>
              <div className="num text-[13px] text-fg">{price(p.price)}</div>
            </div>
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
