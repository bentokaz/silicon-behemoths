// The launch keynote, played out on stage: the house fills, the presenter
// walks on, the device goes up on the big screen and the crowd gives its
// verdict. Shown when a keynote happens, and again from the events list.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { type ShowState, SiteView } from '../3d/SiteView'
import { deviceThumbnail } from '../3d/thumbnail'
import { sfx } from '../audio/sfx'
import { subLabel } from '../data/devices'
import { fmtDate, player } from '../sim/game'
import { EVENTS, OWN_VENUE } from '../sim/growth'
import { normalised } from '../sim/market'
import { hiredVenue, sumOf } from '../sim/sites'
import { type Product, SUBS } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Btn, Meter, money } from './ui'

type Phase = 'doors' | 'welcome' | 'reveal' | 'specs' | 'price' | 'verdict'
const TIMELINE: [Phase, number][] = [
  ['doors', 0],
  ['welcome', 3.5],
  ['reveal', 8],
  ['specs', 13],
  ['price', 18],
  ['verdict', 23],
]
const SW = 1024
const SH = 672
const FONT = 'Bahnschrift, "Segoe UI", sans-serif'

/** The three things this device does best, in the reviewers' words. */
function strengths(p: Product, day: number): string[] {
  const n = normalised(p.raw, day)
  return [...SUBS].sort((a, b) => n[b] - n[a]).slice(0, 3).map((k) => subLabel(p.type, k))
}

function drawScreen(g: CanvasRenderingContext2D, phase: Phase, company: string, color: string, p: Product, image: HTMLImageElement | null, points: string[]) {
  g.fillStyle = '#07090c'
  g.fillRect(0, 0, SW, SH)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const text = (s: string, y: number, size: number, fill = '#f2f2f0', weight = 600) => {
    let px = size
    g.font = `${weight} ${px}px ${FONT}`
    const w = g.measureText(s).width
    if (w > SW - 120) px = (px * (SW - 120)) / w
    g.font = `${weight} ${px}px ${FONT}`
    g.fillStyle = fill
    g.fillText(s, SW / 2, y)
  }
  g.fillStyle = color
  g.fillRect(0, SH - 14, SW, 14)
  if (phase === 'doors' || phase === 'welcome') {
    text(company.toUpperCase(), SH / 2 - 20, 110)
    text(phase === 'doors' ? 'STARTING SOON' : 'SPECIAL EVENT', SH / 2 + 90, 40, color, 400)
  } else if (phase === 'reveal') {
    if (image) {
      const s = Math.min(560 / image.width, 430 / image.height)
      g.drawImage(image, SW / 2 - (image.width * s) / 2, 40, image.width * s, image.height * s)
    }
    text(p.name, SH - 130, 96)
  } else if (phase === 'specs') {
    text(p.name, 90, 54, color)
    points.forEach((s, i) => text(s, 230 + i * 130, 82))
  } else {
    text(p.name, 150, 60, '#b9bdc2', 400)
    text(`$${p.price.toLocaleString()}`, SH / 2 + 10, 240)
    text('ON SALE TODAY', SH - 120, 44, color, 400)
  }
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

  // the device's portrait for the big screen
  useEffect(() => {
    if (!p) return
    const url = deviceThumbnail(`${p.id}:show`, p.design, me.logo)
    if (!url) return
    const img = new Image()
    img.onload = () => {
      image.current = img
      setRun((r) => r)
    }
    img.src = url
  }, [p, me.logo])

  // run of show
  useEffect(() => {
    setPhase('doors')
    const timers = TIMELINE.map(([ph, at]) =>
      window.setTimeout(() => {
        setPhase(ph)
        if (ph === 'welcome') sfx.hush()
        if (ph === 'reveal') (sfx.drum(), window.setTimeout(sfx.launch, 350))
        if (ph === 'specs' && score >= 40) sfx.applause(1.6, 0.5)
        if (ph === 'price') sfx.applause(4, score >= 85 ? 1.6 : score >= 60 ? 1.1 : score >= 40 ? 0.6 : 0.25)
        if (ph === 'verdict') (score >= 50 ? sfx.goal : sfx.alert)()
      }, at * 1000),
    )
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [run, score])

  useEffect(() => {
    if (!p) return
    const ctx = (tex.image as HTMLCanvasElement).getContext('2d')
    if (!ctx) return
    drawScreen(ctx, phase, me.name, me.color, p, image.current, points)
    tex.needsUpdate = true
  }, [phase, p, me.name, me.color, points, tex, run])

  useEffect(() => {
    if (!e || !p || !e.beats) watch(null)
  }, [e, p, watch])
  if (!e || !p || !e.beats) return null

  const b = e.beats
  const fill = Math.min(1, 0.45 + 0.55 * b.wow + (b.crew > 0.5 ? 0.1 : 0))
  const cheering = (phase === 'price' || phase === 'verdict') && score >= 45
  const show: ShowState = { crowd: phase === 'doors' ? fill * 0.55 : fill, cheer: cheering, screen: tex, presenter: phase !== 'doors' }
  const venue = EVENTS.keynote.venues[e.venue].name
  const caption: Record<Phase, [string, string]> = {
    doors: [`${venue}, ${fmtDate(e.day)}`, seats ? `${Math.round(seats * fill).toLocaleString()} people are taking their seats.` : 'Cameras are rolling. The stream is about to start.'],
    welcome: ['The lights go down', `${me.name} takes the stage.`],
    reveal: [p.name, 'Here it is.'],
    specs: ['What it does best', points.join('. ') + '.'],
    price: [`$${p.price.toLocaleString()}`, cheering ? 'The room is on its feet.' : score >= 30 ? 'Polite applause.' : 'An awkward silence.'],
    verdict: [`Score ${score}`, e.summary ?? ''],
  }
  const parts: [string, number, string][] = [
    ['The device itself', b.wow, 'How strong it is in its best segment. Nearly half the score.'],
    ['The venue', Math.min(1, b.reach), 'How far a show from this stage carries.'],
    ['Your marketers', b.crew, 'The team that staged it.'],
    ['On the night', b.luck, 'Demos work, or they do not.'],
  ]
  return (
    <div className="absolute inset-0 z-40 bg-carbon">
      <div className="absolute inset-0">
        <SiteView key={`${eventId}-${run}`} site={site} mode="cut" mood="night" tool={null} company={me.name} color={me.color} logo={me.logo} products={[p]} show={show} autoRotate={phase !== 'verdict'} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
        <div className="flex items-center gap-2 border border-line2 bg-panel/90 px-3 py-[6px]">
          <span className="h-2 w-2 animate-pulse bg-neg" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg">Live</span>
          <span className="text-[11px] uppercase tracking-wider text-dim">
            {me.name} / {venue}
          </span>
        </div>
        <div className="pointer-events-auto flex gap-1">
          {phase !== 'verdict' && (
            <Btn small onClick={() => setPhase('verdict')}>
              Skip to the result
            </Btn>
          )}
          <Btn small onClick={() => watch(null)}>
            Close
          </Btn>
        </div>
      </div>
      {phase !== 'verdict' && (
        <div className="pointer-events-none absolute bottom-6 left-6 max-w-[60%] border-l-2 border-accent bg-carbon/75 py-2 pl-4 pr-6">
          <div className="text-3xl font-semibold uppercase tracking-[0.08em] text-fg">{caption[phase][0]}</div>
          <div className="mt-1 text-sm text-dim">{caption[phase][1]}</div>
        </div>
      )}
      {phase === 'verdict' && (
        <div className="absolute bottom-6 left-6 w-[400px] border border-line2 bg-panel/95 p-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="label text-faint">Launch keynote</div>
              <div className="text-lg text-fg">{p.name}</div>
            </div>
            <div className={`num text-5xl leading-none ${score >= 70 ? 'text-pos' : score >= 45 ? 'text-fg' : 'text-neg'}`}>{score}</div>
          </div>
          <div className="mt-1 text-[12px] text-dim">{e.summary}</div>
          <div className="mt-3 space-y-2">
            {parts.map(([label, v, note]) => (
              <div key={label}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-fg">{label}</span>
                  <span className="num text-[10px] text-dim">{Math.round(v * 100)}</span>
                </div>
                <Meter value={v} tone={v > 0.7 ? 'pos' : v > 0.4 ? 'accent' : 'warn'} />
                <div className="text-[10px] text-faint">{note}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 border-t border-line pt-2">
            <div>
              <div className="label text-faint">Launch hype</div>
              <div className="num text-sm text-accent">+{Math.round(p.hype * 100)}%</div>
            </div>
            <div>
              <div className="label text-faint">Priced at</div>
              <div className="num text-sm text-fg">{money(p.price, 0)}</div>
            </div>
          </div>
          <div className="mt-3 flex gap-1">
            <Btn className="flex-1" onClick={() => setRun((r) => r + 1)}>
              Watch again
            </Btn>
            <Btn className="flex-1" onClick={() => (watch(null), focus(p.id))}>
              See the device
            </Btn>
            <Btn tone="primary" className="flex-1" onClick={() => watch(null)}>
              Continue
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}
