// The product drawer: one device, at the right-hand edge. For a device of the
// player's own it opens on what can be done about it (why it sells as it
// does, stock with a reorder, the price); scores, specs and reviews are behind
// tabs. A rival's device opens the same drawer without the controls.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DeviceView, type ViewName } from '../3d/DeviceView'
import { osLookOf } from '../3d/osLook'
import { deviceThumbnail } from '../3d/thumbnail'
import { sfx } from '../audio/sfx'
import { EXTRAS, LENSES, SUPPLY_LABELS, materialInfo, panelInfo, sensorInfo } from '../data/catalog'
import { ANC, COOLERS, DRIVERS, GPUS, HINGES, INPUT_NAMES, MIC_ARRAYS, OPTICS, SPEAKERS, SPEAKER_DRIVERS, STRAPS, TYPES, headStrap, inputOptions, ioInfo, segmentInfo, standInfo, subLabel } from '../data/devices'
import { recallCost } from '../sim/care'
import { RECALL_DEADLINE,companyOf, discontinue, fmtDate, monthLabel, player, productName, recallProduct } from '../sim/game'
import { type Why, demandEstimate, productProfit, suggestReorder, whyLines } from '../sim/insight'
import { normalised } from '../sim/market'
import { supplyPrice } from '../sim/ops'
import { VARIANTS } from '../sim/rivals'
import { coverScreen, isCoverCam, isFlip } from '../sim/geometry'
import { batteryLabel, chargeWatts, chipFor, foldedThickness, lifeLabel as lifeText, panelName } from '../sim/scoring'
import { type DeviceDesign, type DeviceType, type GameState, type Product, type Review, SUBS, SUPPLY_CATS } from '../sim/types'
import { freeFamily, useGame, useStore } from '../store/game'
import { lastMonth, score, statusNote } from './DeviceLogic'
import { PriceNote, applyPrice, quoteWords, reorder, showCompany } from './DeviceParts'
import { Orders } from './Orders'
import { Icon, type IconName, supplyIcon } from './icons'
import { MAX_PRICE, MAX_RUN } from './format'
import { Btn, ConfirmBtn, Drawer, IconBtn, Key, Legend, Meter, NumInput, Row, Swatch, Tabs, Tag, chart, money, moneyDelta, num, pct, price, reducedMotion, useLayer } from './ui'

/** Where to look from when a device is opened up: at the side that comes off. */
const TEAR_VIEW: Partial<Record<DeviceType, ViewName>> = { laptop: 'front', console: 'front', earbuds: 'front', headset: 'front', speaker: 'front', ring: 'front', drone: 'front' }

/** The icon beside each line of a spec sheet. Lines not listed here get the plain list mark. */
const SPEC_ICON: Record<string, IconName> = {
  'Video output': 'display',
  Display: 'display',
  Driver: 'speaker',
  'Noise cancelling': 'sound',
  Buds: 'earbuds',
  Chipset: 'chip',
  Memory: 'memory',
  'Case battery': 'battery',
  Battery: 'battery',
  'Rear cameras': 'camera',
  'Front camera': 'camera',
  Webcam: 'camera',
  Strap: 'watch',
  Controller: 'gamepad',
  Keyboard: 'keys',
  Cooling: 'refresh',
  Speakers: 'speaker',
  Stand: 'desktop',
  Case: 'plot',
  Body: 'plot',
  Materials: 'layers',
  Extras: 'plus',
  Colours: 'theme',
}

/** Weight the way people quote it: grams for things you carry, kilograms for things you do not. */
export const weightLabel = (g: number) => (g >= 2000 ? `${(g / 1000).toFixed(1)} kg` : `${Math.round(g)} g`)
/** What the battery-life figure means for a type, or null where there is no battery. */
export const lifeLabel = (type: DeviceType) => (TYPES[type].mains ? null : lifeText(type, 0).name)

export function specLines(d: DeviceDesign, diag: number, g?: GameState): [string, string][] {
  const s = d.specs
  const type = d.type
  const T = TYPES[type]
  const rear = d.parts.filter((p) => p.kind === 'camera' && p.face === 'back' && !isCoverCam(d, p))
  const selfie = d.parts.filter((p) => p.kind === 'camera' && p.face === 'front')
  const extras = s.extras.map((id) => EXTRAS.find((e) => e.id === id)?.name).filter(Boolean)
  const size = `${d.body.width} x ${d.body.height} x ${d.body.thickness} mm`
  const fitted = (s.io ?? []).map((id) => ioInfo(type, id)?.name).filter(Boolean).join(', ') || 'none'
  const lines: [string, string][] = []
  if (type === 'console') lines.push(['Video output', `${panelName(type, s.panel)}, ${s.refresh} Hz`])
  else if (type === 'headset') lines.push(['Displays', `${panelInfo(s.panel).name} ${s.refresh} Hz, ${OPTICS[s.optics ?? 0].name.toLowerCase()}`])
  else if (type === 'speaker') lines.push(['Screen', d.body.screen ? `${diag.toFixed(1)}" ${panelInfo(s.panel).name}` : 'none'])
  else if (type === 'drone') lines.push(['Video link', panelName(type, s.panel)])
  else if (!T.noScreen) lines.push(['Display', `${diag.toFixed(type === 'watch' || type === 'actioncam' ? 2 : 1)}" ${panelName(type, s.panel)}${type === 'watch' || type === 'ereader' ? '' : ` ${s.refresh} Hz`}`])
  if (type === 'foldable') {
    const cover = coverScreen(d.body)
    lines.push(['Form', isFlip(d.body) ? 'Flip: folds in half across the middle' : 'Book: opens sideways'])
    lines.push(['Cover screen', `${(Math.hypot(cover.w, cover.h) / 25.4).toFixed(1)}"`])
    lines.push(['Hinge', `${HINGES[s.hinge ?? 0].name}, ${foldedThickness(d).toFixed(1)} mm thick when shut`])
  }
  if (type === 'speaker') {
    lines.push(['Drivers', SPEAKER_DRIVERS[s.driver ?? 0].name])
    lines.push(['Microphones', MIC_ARRAYS[s.mics ?? 0].name])
    lines.push(['Shape', { column: 'Column', orb: 'Orb', block: 'Block' }[d.body.form ?? 'column']])
  }
  if (type === 'headset') {
    lines.push(['Tracking cameras', selfie.length ? `${selfie.length} x ${sensorInfo(selfie[0].sensor ?? 0).name}` : 'none'])
    lines.push(['Strap', headStrap(d.body.strap).name])
  }
  if (type === 'earbuds') {
    lines.push(['Driver', DRIVERS[s.driver ?? 0].name])
    lines.push(['Noise cancelling', ANC[s.anc ?? 0].name])
    lines.push(['Buds', d.body.buds === 'bean' ? 'Bean shape' : 'With stems'])
  }
  lines.push(['Chipset', chipFor(s, g?.chips).name + (T.gpu && s.gpu ? ` + ${GPUS[s.gpu].name}` : '')])
  if (T.memory) lines.push(['Memory', `${s.ram} GB / ${s.storage >= 1024 ? s.storage / 1024 + ' TB' : s.storage + ' GB'}`])
  if (!T.mains) lines.push([type === 'earbuds' ? 'Case battery' : 'Battery', `${batteryLabel(type, s.battery)}, ${chargeWatts(type, s.charging)} W`])
  if (type === 'phone' || type === 'tablet' || type === 'foldable') {
    lines.push(['Rear cameras', rear.length ? rear.map((p) => `${sensorInfo(p.sensor ?? 0).name} ${LENSES[p.lens ?? 'wide'].name.split(' ')[0].toLowerCase()}`).join(' + ') : 'none'])
    lines.push(['Front camera', selfie.length ? selfie.map((p) => sensorInfo(p.sensor ?? 0).name + (p.underDisplay ? ' under-display' : '')).join(' + ') : 'none'])
  }
  if (type === 'actioncam' || type === 'drone') lines.push(['Camera', d.parts.filter((p) => p.kind === 'camera').map((p) => sensorInfo(p.sensor ?? 0).name).join(' + ') || 'none'])
  if (type === 'watch') lines.push(['Strap', STRAPS.find((x) => x.id === d.body.strap)?.name ?? 'Silicone'])
  if (T.input) lines.push([INPUT_NAMES[T.input], inputOptions(type)[s.keyboard ?? 0].name])
  if (T.ioLabel) lines.push([T.ioLabel, fitted])
  if (type === 'laptop' || type === 'desktop') lines.push(['Webcam', selfie.length ? sensorInfo(selfie[0].sensor ?? 0).name : 'none'])
  if (T.mains?.cool) lines.push(['Cooling', COOLERS[s.cooling ?? 0].name])
  if (T.mains?.sound) lines.push(['Speakers', SPEAKERS[s.speakers ?? 0].name])
  if (type === 'desktop' || type === 'tv') lines.push(['Stand', standInfo(type, d.body.stand).name])
  lines.push([type === 'earbuds' ? 'Case' : 'Body', size])
  lines.push(['Materials', T.oneShell ? materialInfo(d.body.frameMat).name : type === 'earbuds' ? `${materialInfo(d.body.backMat).name} case, ${materialInfo(d.body.frameMat).name.toLowerCase()} trim` : `${materialInfo(d.body.frameMat).name} frame, ${materialInfo(d.body.backMat).name.toLowerCase()} back`])
  if (extras.length) lines.push(['Extras', extras.join(', ')])
  if (d.colors?.length) lines.push(['Colours', [`Standard`, ...d.colors.map((c) => c.name)].join(', ')])
  return lines
}

// Thumbnails are drawn one at a time, between frames, and only for rows that
// are on screen: a table of sixty rivals no longer holds the page up while
// every one of them is rendered.
const drawn = new Map<string, string>()
const waiting: (() => void)[] = []
let pumping = false
function pump() {
  const job = waiting.shift()
  if (!job) return void (pumping = false)
  job()
  window.setTimeout(pump, 0)
}
function later(job: () => void): () => void {
  waiting.push(job)
  if (!pumping) (pumping = true), window.setTimeout(pump, 0)
  return () => {
    const i = waiting.indexOf(job)
    if (i >= 0) waiting.splice(i, 1)
  }
}
/**
 * What makes one thumbnail different from another. Product ids start again in
 * every game, so the id alone would show a device from the last game loaded;
 * the logo is part of it so that changing the logo redraws the devices that carry it.
 */
export const thumbKey = (p: Product, logo?: string) => `${p.id}|${p.companyId}|${p.name}|${p.launchDay}|${p.design.body.width}x${p.design.body.height}x${p.design.body.thickness}|${p.design.body.backColor}|${p.design.parts.length}|${logo ? `${logo.length}${logo.slice(-12)}` : ''}`

export function Thumb({ product, className = '' }: { product: Product; className?: string }) {
  const logo = useStore((s) => (s.game ? player(s.game).logo : undefined))
  const key = thumbKey(product, logo)
  const [src, setSrc] = useState(() => drawn.get(key) ?? '')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const hit = drawn.get(key)
    if (hit !== undefined) return setSrc(hit)
    setSrc('')
    const el = box.current
    if (!el) return
    let cancel = () => {}
    const draw = () => {
      cancel = later(() => {
        const url = deviceThumbnail(key, product.design, logo)
        drawn.set(key, url)
        if (drawn.size > 400) drawn.delete(drawn.keys().next().value!)
        setSrc(url)
      })
    }
    // only what is in view, or about to be, is worth drawing
    if (typeof IntersectionObserver === 'undefined') return draw(), () => cancel()
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        seen.disconnect()
        draw()
      },
      { rootMargin: '240px' },
    )
    seen.observe(el)
    return () => (seen.disconnect(), cancel())
    // the design of a device does not change once it exists: the key says everything that can
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return src ? <img src={src} alt="" draggable={false} className={`object-contain ${className}`} /> : <div ref={box} className={className} />
}

export const statusTone = (p: Product) => (p.status === 'sale' ? (p.stock <= 0 && p.companyId === 'player' ? 'neg' : 'pos') : p.status === 'dev' ? 'warn' : 'dim') as 'neg' | 'pos' | 'warn' | 'dim'
export const statusIcon = (p: Product): IconName => (p.status === 'sale' ? (p.stock <= 0 && p.companyId === 'player' ? 'alert' : 'check') : p.status === 'dev' ? 'hourglass' : 'ban')
export const statusText = (p: Product) => (p.status === 'sale' ? (p.stock <= 0 && p.companyId === 'player' ? 'Sold out' : 'On sale') : p.status === 'dev' ? `Dev ${p.devDaysLeft}d` : 'Ended')

// ---------------------------------------------------------------- the top of the drawer

const WHY_TONE = { neg: 'text-neg', warn: 'text-warn', pos: 'text-pos', dim: 'text-dim' } as const
const WHY_ICON: Record<Why['tone'], IconName> = { neg: 'alert', warn: 'alert', pos: 'check', dim: 'info' }

/** Why the device sells the way it does: every reason, the most important first. */
function WhyList({ lines, quiet }: { lines: Why[]; /** A rival's device: the reasons are told, but none of them asks anything of the player. */ quiet?: boolean }) {
  return (
    <ul aria-label="Why it sells as it does" className="min-w-0 flex-1 space-y-[6px]">
      {lines.map((w, i) => (
        <li key={i} className={`flex gap-2 text-xs leading-snug ${quiet ? 'text-dim' : WHY_TONE[w.tone]}`}>
          <Icon name={quiet ? 'info' : WHY_ICON[w.tone]} size={12} className="mt-[2px] shrink-0" />
          <span className={w.tone === 'pos' || w.tone === 'dim' ? 'text-dim' : ''}>{w.text}</span>
        </li>
      ))}
    </ul>
  )
}

/** The device in 3D, for the player who asks to see it: turn it, open it up, see its colours. */
function Model({ product, onClose }: { product: Product; onClose: () => void }) {
  const g = useGame()
  const [view, setView] = useState<ViewName | undefined>(undefined)
  const [nonce, setNonce] = useState(0)
  const [color, setColor] = useState(-1)
  const [torn, setTorn] = useState(false)
  useEffect(() => {
    setView(undefined)
    setColor(-1)
    setTorn(false)
    // the same view shows the next device: frame it afresh rather than build a new view for it
    setNonce((x) => x + 1)
  }, [product.id])
  return (
    <div className="relative h-[240px] border-b border-line">
      <DeviceView design={product.design} view={view} viewNonce={nonce} autoRotate={!torn && !reducedMotion()} logo={player(g).logo} colorIndex={color} osLook={osLookOf(g, product.companyId)} teardown={torn} />
      <div className="absolute left-2 top-2 flex border border-line bg-panel">
        {(['back', 'front', 'side'] as ViewName[]).map((v) => (
          <Btn key={v} small tone="ghost" active={view === v} onClick={() => (setView(v), setNonce((x) => x + 1))}>
            {v === 'back' ? 'Back' : v === 'front' ? 'Front' : 'Side'}
          </Btn>
        ))}
        <Btn small tone="ghost" icon="layers" active={torn} title="Open it up and see what is inside" onClick={() => (setTorn(!torn), setView(TEAR_VIEW[product.type] ?? 'back'), setNonce((x) => x + 1))}>
          Inside
        </Btn>
      </div>
      {!!product.design.colors?.length && (
        <div className="absolute bottom-2 left-2 flex gap-1">
          {[{ back: product.design.body.backColor, name: 'Standard' }, ...product.design.colors].map((c, i) => (
            <button key={i} type="button" title={c.name} aria-label={`Show it in ${c.name}`} aria-pressed={color === i - 1} onClick={() => setColor(i - 1)} className={`h-5 w-5 border ${color === i - 1 ? 'border-accent' : 'border-line2'}`} style={{ background: c.back }} />
          ))}
        </div>
      )}
      <IconBtn icon="minus" tone="ghost" title="Back to the small picture" className="absolute right-2 top-2 bg-panel" onClick={onClose} />
    </div>
  )
}

/** Stock, what is on order, and ordering more: the quantity starts at what recent sales call for. */
function Supply({ g, p }: { g: GameState; p: Product }) {
  const [qty, setQty] = useState(() => suggestReorder(g, p))
  const pending = g.orders.some((o) => o.productId === p.id)
  // once an order is placed the field shows what is still worth ordering, which is usually nothing
  const order = () => reorder(p, qty) && setQty(suggestReorder(g, p))
  // a device still in development has no sales to go by: the forecast for a design like it is the guide
  const month = Math.floor(g.day / 30)
  const guess = useMemo(() => (p.status === 'dev' ? demandEstimate(g, p.design, p.price) : null), [p.id, p.price, p.status, month]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section aria-label="Stock" className="border-b border-line p-3">
      <div className="flex items-baseline gap-3">
        <span className="label w-14 shrink-0">In stock</span>
        <span className={`t-value ${p.stock <= 0 && p.status === 'sale' ? 'text-neg' : 'text-fg'}`}>{num(p.stock)}</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className="label w-14 shrink-0">Order</span>
        <NumInput value={qty} onChange={setQty} step={1000} max={MAX_RUN} onEnter={order} aria-label="Units to order" className="w-28 text-right" />
        <Btn tone="primary" icon="package" className="ml-auto" disabled={qty <= 0} title={qty <= 0 ? 'Enter how many units to build' : undefined} onClick={order}>
          Order {qty > 0 ? num(qty) : 'units'}
        </Btn>
      </div>
      <div className="mt-2 text-[11px] leading-snug text-dim">{qty > 0 ? quoteWords(g, p, qty) : guess ? `Nothing is selling yet to go by. A design like this should sell ${num(guess.low)} to ${num(guess.high)} in its first three months.` : 'Stock and orders cover the next months at the recent pace. Type a number to order anyway.'}</div>
      {pending && (
        <div className="mt-2 border border-line">
          <Orders filter={p.id} bare />
        </div>
      )}
    </section>
  )
}

/** The price: Enter applies it, and so does leaving the field. While a new figure is typed the line under it says what it would do. */
function PriceField({ g, p }: { g: GameState; p: Product }) {
  const [draft, setDraft] = useState(p.price)
  useEffect(() => setDraft(p.price), [p.price])
  const dirty = draft > 0 && draft !== p.price
  // Esc puts the old price back before it closes anything
  useLayer(dirty, () => setDraft(p.price))
  // a price that was refused (said by applyPrice) is not left in the field
  const apply = () => void (applyPrice(p, draft) || setDraft(p.price))
  return (
    <section aria-label="Price" className="border-b border-line p-3">
      <div className="flex items-center gap-3">
        <span className="label w-14 shrink-0">Price</span>
        <NumInput value={draft} onChange={setDraft} step={10} max={MAX_PRICE} onEnter={apply} onBlur={apply} aria-label="Retail price" title={p.tiers.length ? 'The storage options move with it' : undefined} className="w-28 text-right" />
        {dirty && (
          <span className="text-[11px] text-dim">
            <Key>Enter</Key> saves, <Key>Esc</Key> puts it back
          </span>
        )}
      </div>
      <PriceNote g={g} p={p} value={draft} className="mt-2 !leading-snug" />
    </section>
  )
}

/** A recall that is waiting for a decision. */
function Recall({ g, p }: { g: GameState; p: Product }) {
  if (p.recall?.state !== 'open') return null
  const left = Math.max(0, RECALL_DEADLINE - (g.day - p.recall.day))
  return (
    <section aria-label="Recall" className="border-b border-neg/60 p-3">
      <div className="text-xs leading-snug text-dim">
        <span className="num text-fg">{pct(p.defectRate)}</span> of units are faulty and owners are talking. Recall and repair every unit sold, or leave it: in <span className="num text-fg">{left}</span> days it becomes a scandal that costs reputation and fans.
      </div>
      <ConfirmBtn
        icon="recall"
        className="mt-2"
        confirm={`Click again: spend ${money(recallCost(p))}`}
        onClick={() => {
          const err = useStore.getState().act((s) => recallProduct(s, p.id))
          if (err) useStore.getState().say(err, 'bad')
          else (sfx.confirm(), useStore.getState().say(`${p.name} is being recalled and repaired.`))
        }}
      >
        Recall and repair for {money(recallCost(p))}
      </ConfirmBtn>
    </section>
  )
}

// ---------------------------------------------------------------- behind the tabs

function Sales({ g, product, mine }: { g: GameState; product: Product; mine: boolean }) {
  const { act, say } = useStore.getState()
  // the last entry is the month that closed last
  const thisMonth = Math.floor(g.day / 30)
  const history = product.history.slice(-24).map((u, i, all) => ({ m: monthLabel((product.status === 'ended' && product.endDay !== undefined ? Math.floor(product.endDay / 30) + 1 : thisMonth) - (all.length - i)), Units: u }))
  const seg = product.segment ? segmentInfo(product.segment) : undefined
  const profit = mine ? productProfit(g, product).total : 0
  return (
    <div className="p-3">
      {history.length > 1 ? (
        <div className="h-28" role="img" aria-label="Units sold a month">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="m" tick={chart.axis} stroke={chart.grid} minTickGap={24} />
              <YAxis tick={chart.axis} stroke={chart.grid} tickFormatter={(v) => num(v)} />
              <Tooltip {...chart.tooltip} cursor={{ fill: 'var(--color-hover)' }} formatter={(v) => [num(Number(v)), 'Units']} />
              <Bar dataKey="Units" fill="var(--color-mute)" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="py-2 text-xs text-dim">{product.status === 'dev' ? 'Not on sale yet.' : 'Units a month appear here once two months have closed.'}</div>
      )}
      <div className="mt-2">
        <Row k="Sold in all" v={num(product.unitsSold)} />
        {mine && <Row k="Taken in all" v={money(product.revenue)} />}
        {mine && product.unitsSold > 0 && <Row k="Profit in all, an estimate" v={moneyDelta(profit)} tone={profit < 0 ? 'text-neg' : 'text-pos'} />}
        {mine && product.status !== 'dev' && <Row k="Owners content" v={pct(product.satisfaction, 0)} tone={product.satisfaction < 0.5 ? 'text-neg' : undefined} />}
        <Row k={product.status === 'dev' ? 'On sale from' : 'On sale since'} v={fmtDate(product.status === 'dev' ? g.day + product.devDaysLeft : product.launchDay)} />
        {seg && <Row k="Sold to" v={<span className="font-sans">{seg.name} buyers</span>} />}
      </div>
      {mine && product.status !== 'ended' && (
        <ConfirmBtn icon="ban" className="mt-3" confirm={`Click again: stop selling ${product.name} for good`} title="Takes the device off sale. Unsold stock is written off and orders for it are cancelled. This cannot be undone." onClick={() => (act((s) => discontinue(s, product.id)), say(`${product.name} is discontinued.`))}>
          Discontinue
        </ConfirmBtn>
      )}
    </div>
  )
}

function Scores({ g, product }: { g: GameState; product: Product }) {
  const n = normalised(product.raw, g.day)
  return (
    <div className="p-3">
      {SUBS.map((k) => (
        <div key={k} className="flex items-center gap-2 py-1">
          <span className="w-32 shrink-0 truncate text-xs text-dim">{subLabel(product.type, k)}</span>
          <Meter value={n[k]} max={1.1} tone={n[k] > 0.9 ? 'pos' : n[k] > 0.6 ? 'dim' : 'warn'} />
          <span className="num w-8 shrink-0 text-right text-xs text-fg">{Math.round(n[k] * 100)}</span>
        </div>
      ))}
      <Legend
        className="mt-2"
        items={[
          { label: 'Over 90: with the best', tone: 'pos' },
          { label: 'Middling', tone: 'dim' },
          { label: 'Under 60: behind', tone: 'warn' },
        ]}
      />
      <div className="mt-1 text-[11px] text-dim">100 is level with the best the market can build today.</div>
      <div className="mt-2">
        <Row k="Design" v={Math.round(product.designPct)} />
      </div>
    </div>
  )
}

function Specs({ g, product, mine }: { g: GameState; product: Product; mine: boolean }) {
  return (
    <div className="p-3">
      {specLines(product.design, product.diag, mine ? g : undefined).map(([k, v]) => (
        <Row key={k} icon={SPEC_ICON[k] ?? 'feed'} k={<span className="whitespace-nowrap">{k}</span>} v={<span className="whitespace-normal text-right">{v}</span>} />
      ))}
      <Row icon="weight" k="Weight" v={weightLabel(product.weight)} />
      {lifeLabel(product.type) && <Row icon="battery" k={lifeLabel(product.type)} v={lifeText(product.type, product.lifeHours).value} />}
      {product.tiers.map((t) => (
        <Row key={t.storage} icon="tag" k={`${t.storage >= 1024 ? t.storage / 1024 + ' TB' : t.storage + ' GB'} option`} v={price(t.price)} />
      ))}
      {mine && (
        <>
          <div className="mb-1 mt-4 text-xs font-semibold text-fg">What one costs to build today</div>
          {SUPPLY_CATS.map((c) => (
            <Row key={c} icon={supplyIcon(c)} k={`${SUPPLY_LABELS[c]}${supplyPrice(g, c) > 1.08 ? ', prices up' : ''}`} v={price(product.costParts[c] * supplyPrice(g, c))} tone={supplyPrice(g, c) > 1.08 ? 'text-warn' : undefined} />
          ))}
          <Row icon="build" k="Assembly and extras" v={price(product.costParts.other)} />
          <Row icon="alert" k="Units that arrive faulty" v={pct(product.defectRate)} tone={product.defectRate > 0.03 ? 'text-warn' : undefined} />
        </>
      )}
    </div>
  )
}

/** The lines every outlet printed, and for each outlet only what it said that the others did not. */
function splitReviews(reviews: Review[]): { pros: string[]; cons: string[]; own: { outlet: string; score: number; pros: string[]; cons: string[] }[] } {
  const shared = (pick: (r: Review) => string[]) => (reviews.length > 1 ? pick(reviews[0]).filter((t) => reviews.every((r) => pick(r).includes(t))) : [])
  const pros = shared((r) => r.pros)
  const cons = shared((r) => r.cons)
  return { pros, cons, own: reviews.map((r) => ({ outlet: r.outlet, score: r.score, pros: r.pros.filter((t) => !pros.includes(t)), cons: r.cons.filter((t) => !cons.includes(t)) })) }
}

const Point = ({ good, children }: { good: boolean; children: string }) => (
  <div className={`flex gap-2 text-xs leading-snug ${good ? 'text-fg' : 'text-dim'}`}>
    <Icon name={good ? 'plus' : 'minus'} size={11} className={`mt-[3px] shrink-0 ${good ? 'text-pos' : 'text-neg'}`} />
    {children}
  </div>
)

function Voices({ product }: { product: Product }) {
  const split = useMemo(() => splitReviews(product.reviews), [product.reviews])
  const stars = product.feedback.length ? product.feedback.reduce((a, f) => a + f.stars, 0) / product.feedback.length : 0
  const apart = split.own.filter((r) => r.pros.length || r.cons.length)
  return (
    <div className="p-3">
      <div className="mb-2 text-xs font-semibold text-fg">The press</div>
      {!product.reviews.length && <div className="text-xs text-dim">Reviews are published on release day.</div>}
      {product.reviews.length > 0 && (
        <div className="grid gap-px border border-line bg-line" style={{ gridTemplateColumns: `repeat(${product.reviews.length}, minmax(0, 1fr))` }}>
          {product.reviews.map((r) => (
            <div key={r.outlet} className="min-w-0 bg-panel px-2 py-[6px]" title={r.outlet}>
              <div className="truncate text-[11px] text-dim">{r.outlet}</div>
              <div className={`t-value mt-1 ${r.score >= 8 ? 'text-pos' : r.score >= 6 ? 'text-fg' : 'text-neg'}`}>{score(r.score)}</div>
            </div>
          ))}
        </div>
      )}
      {(split.pros.length > 0 || split.cons.length > 0) && (
        <div className="mt-2 space-y-1">
          <div className="text-[11px] text-dim">They all say</div>
          {split.pros.map((t) => (
            <Point key={t} good>
              {t}
            </Point>
          ))}
          {split.cons.map((t) => (
            <Point key={t} good={false}>
              {t}
            </Point>
          ))}
        </div>
      )}
      {apart.map((r) => (
        <div key={r.outlet} className="mt-2 space-y-1">
          <div className="text-[11px] text-dim">{product.reviews.length > 1 ? `Only ${r.outlet}` : r.outlet}</div>
          {r.pros.map((t) => (
            <Point key={t} good>
              {t}
            </Point>
          ))}
          {r.cons.map((t) => (
            <Point key={t} good={false}>
              {t}
            </Point>
          ))}
        </div>
      ))}
      {product.companyId === 'player' && (
        <>
          <div className="mb-1 mt-4 flex items-baseline justify-between text-xs font-semibold text-fg">
            Owners
            {stars > 0 && (
              <span className="num font-normal text-dim" title="Average out of 5">
                {score(stars)} of 5
              </span>
            )}
          </div>
          {!product.feedback.length && <div className="text-xs text-dim">Owners' comments arrive weekly once the device is selling.</div>}
          {product.feedback.map((f, i) => (
            <div key={i} className="flex items-start gap-2 border-b border-line py-[5px] last:border-0">
              <span className={`num flex w-8 shrink-0 items-center gap-[3px] text-xs ${f.stars >= 4 ? 'text-pos' : f.stars <= 2 ? 'text-neg' : 'text-dim'}`} title={`${f.stars} out of 5`}>
                <Icon name="star" size={11} />
                {f.stars}
              </span>
              <span className="flex-1 text-xs text-fg">{f.text}</span>
              <span className="num shrink-0 text-[11px] text-dim">{fmtDate(f.day)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

/** What can be built on a device: a variant in its family, or the next generation. A name already in use is never offered. */
function Variants({ g, p }: { g: GameState; p: Product }) {
  const { openDesigner } = useStore.getState()
  const taken = (name: string) => g.products.some((x) => x.companyId === 'player' && x.status !== 'ended' && x.name === name)
  const m = /^(.*?)(\d+)$/.exec(p.family)
  const next = productName(freeFamily(g, m ? `${m[1]}${Number(m[2]) + 1}` : `${p.family} 2`, p.variant), p.variant)
  return (
    <div className="p-3">
      <div className="text-xs leading-snug text-dim">A variant shares this device's platform: about 45% cheaper and 40% faster to develop.</div>
      <div className="mt-2 space-y-1">
        {VARIANTS.map((v) => {
          const name = productName(p.family, v.id)
          const used = taken(name)
          return (
            <div key={v.id} className="flex items-center gap-3">
              <Btn className="w-36 shrink-0 justify-start" disabled={used} title={used ? `${name} already exists` : `Design ${name}`} onClick={() => openDesigner({ from: p, variant: v.id })}>
                {name}
              </Btn>
              <span className="min-w-0 text-[11px] leading-snug text-dim">{used ? 'You already make it.' : v.note}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
        <Btn icon="arrowRight" className="w-36 shrink-0 justify-start" title={`Start ${next} from this design`} onClick={() => openDesigner({ from: p, variant: 'next' })}>
          {next}
        </Btn>
        <span className="min-w-0 text-[11px] leading-snug text-dim">The next generation, starting from this design.</span>
      </div>
    </div>
  )
}

type InspectTab = 'sales' | 'scores' | 'specs' | 'reviews' | 'variants'

/** The one drawer for a device: opens whenever a product is focused anywhere in the game. */
export function ProductDrawer() {
  const g = useGame()
  const id = useStore((s) => s.inspect)
  const { focus } = useStore.getState()
  const product = g.products.find((p) => p.id === id)
  const [tab, setTab] = useState<InspectTab>('sales')
  const [big, setBig] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setBig(false)
    scroll.current?.parentElement?.scrollTo?.({ top: 0 })
  }, [id])
  // a device that no longer exists (another game was loaded) leaves nothing selected behind
  useEffect(() => {
    if (id && !product) focus(null)
  }, [id, product, focus])
  const rev = useStore((s) => s.rev)
  const why = useMemo(() => (product ? whyLines(g, product) : []), [g, product, rev])

  if (!product) return null
  const company = companyOf(g, product.companyId)
  const mine = company.isPlayer
  const live = mine && product.status !== 'ended'
  const status = statusNote(product)
  const tabs: { value: InspectTab; label: string }[] = [{ value: 'sales', label: 'Sales' }, { value: 'scores', label: 'Scores' }, { value: 'specs', label: 'Specs' }, { value: 'reviews', label: 'Reviews' }, ...(live ? [{ value: 'variants' as const, label: 'Variants' }] : [])]
  const shown = tabs.some((t) => t.value === tab) ? tab : 'sales'
  return (
    <Drawer
      open
      onClose={() => focus(null)}
      width={420}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <Swatch color={company.color}>{product.name}</Swatch>
          {status && <Tag tone={status.tone}>{status.text}</Tag>}
          {!mine && (
            <Btn small tone="ghost" icon="arrowRight" className="ml-1 font-normal" title={`Show ${company.name} under Devices, Rivals`} onClick={() => showCompany(company.id)}>
              {company.name}
            </Btn>
          )}
        </span>
      }
    >
      <div ref={scroll}>
        {big && <Model product={product} onClose={() => setBig(false)} />}
        <section className="flex gap-3 border-b border-line p-3">
          {!big && (
            <button type="button" title="Show it in 3D" aria-label={`Show ${product.name} in 3D`} onClick={() => setBig(true)} className="h-24 w-24 shrink-0 border border-line bg-panel hover:border-line2 hover:bg-hover">
              <Thumb product={product} className="h-full w-full" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <WhyList lines={why} quiet={!mine} />
            {!mine && (
              <div className="mt-2 text-xs text-dim">
                <span className="num text-fg">{price(product.price)}</span>, reviewed <span className="num text-fg">{score(product.reviewAvg)}</span>, <span className="num text-fg">{num(lastMonth(product))}</span> sold last month.
              </div>
            )}
          </div>
        </section>
        {live && <Recall g={g} p={product} />}
        {live && <Supply key={product.id} g={g} p={product} />}
        {live && <PriceField key={`price:${product.id}`} g={g} p={product} />}
        <Tabs value={shown} options={tabs} onChange={setTab} className="bg-panel" />
        {shown === 'sales' && <Sales g={g} product={product} mine={mine} />}
        {shown === 'scores' && <Scores g={g} product={product} />}
        {shown === 'specs' && <Specs g={g} product={product} mine={mine} />}
        {shown === 'reviews' && <Voices product={product} />}
        {shown === 'variants' && live && <Variants g={g} p={product} />}
      </div>
    </Drawer>
  )
}
