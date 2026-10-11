// The slide-over product inspector: 3D model, key numbers, and tabs for
// details that are only shown when asked for.
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DeviceView, type ViewName } from '../3d/DeviceView'
import { deviceThumbnail } from '../3d/thumbnail'
import { sfx } from '../audio/sfx'
import { EXTRAS, LENSES, SUPPLY_LABELS, materialInfo, panelInfo, sensorInfo } from '../data/catalog'
import { ANC, COOLERS, DRIVERS, GPUS, HINGES, INPUT_NAMES, MIC_ARRAYS, OPTICS, SPEAKERS, SPEAKER_DRIVERS, STRAPS, TYPES, headStrap, inputOptions, ioInfo, segmentInfo, standInfo, subLabel } from '../data/devices'
import { RECALL_DEADLINE, RETAIL_CUT, companyOf, discontinue, fmtDate, orderProduction, player, recallProduct, setPrice } from '../sim/game'
import { normalised, tierAverages } from '../sim/market'
import { CONTRACT, buildCost, factoryLine, pendingUnits, supplyPrice } from '../sim/ops'
import { VARIANTS } from '../sim/rivals'
import { coverScreen } from '../sim/geometry'
import { batteryLabel, chargeWatts, chipFor, foldedThickness, panelName } from '../sim/scoring'
import { type DeviceDesign, type DeviceType, type GameState, type Product, type ProductionOrder, SUBS, SUPPLY_CATS } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Icon, type IconName, supplyIcon, typeIcon } from './icons'
import { Btn, Drawer, Head, Lead, Meter, Mini, NumInput, Row, Tabs, Tag, chart, money, num, pct } from './ui'

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
export const lifeLabel = (type: DeviceType) => (TYPES[type].mains ? null : type === 'earbuds' ? 'Listening, with case' : 'Battery life')

export function specLines(d: DeviceDesign, diag: number, g?: GameState): [string, string][] {
  const s = d.specs
  const type = d.type
  const T = TYPES[type]
  const rear = d.parts.filter((p) => p.kind === 'camera' && p.face === 'back')
  const selfie = d.parts.filter((p) => p.kind === 'camera' && p.face === 'front')
  const extras = s.extras.map((id) => EXTRAS.find((e) => e.id === id)?.name).filter(Boolean)
  const size = `${d.body.width} x ${d.body.height} x ${d.body.thickness} mm`
  const fitted = (s.io ?? []).map((id) => ioInfo(type, id)?.name).filter(Boolean).join(', ') || 'none'
  const lines: [string, string][] = []
  if (type === 'console') lines.push(['Video output', `${panelName(type, s.panel)}, ${s.refresh} Hz`])
  else if (type === 'headset') lines.push(['Displays', `${panelInfo(s.panel).name} ${s.refresh} Hz, ${OPTICS[s.optics ?? 0].name.toLowerCase()}`])
  else if (type === 'speaker') lines.push(['Screen', d.body.screen ? `${diag.toFixed(1)}" ${panelInfo(s.panel).name}` : 'none'])
  else if (!T.noScreen) lines.push(['Display', `${diag.toFixed(type === 'watch' ? 2 : 1)}" ${panelInfo(s.panel).name}${type === 'watch' ? '' : ` ${s.refresh} Hz`}`])
  if (type === 'foldable') {
    const cover = coverScreen(d.body)
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

export function Thumb({ product, className = '' }: { product: Product; className?: string }) {
  const [src, setSrc] = useState('')
  const logo = useStore((s) => (s.game ? player(s.game).logo : undefined))
  useEffect(() => {
    const id = window.setTimeout(() => setSrc(deviceThumbnail(product.id, product.design, logo)), 0)
    return () => window.clearTimeout(id)
  }, [product.id, product.design, logo])
  return src ? <img src={src} alt="" draggable={false} className={`object-contain ${className}`} /> : <div className={className} />
}

export const statusTone = (p: Product) => (p.status === 'sale' ? (p.stock <= 0 && p.companyId === 'player' ? 'neg' : 'pos') : p.status === 'dev' ? 'warn' : 'dim') as 'neg' | 'pos' | 'warn' | 'dim'
export const statusIcon = (p: Product): IconName => (p.status === 'sale' ? (p.stock <= 0 && p.companyId === 'player' ? 'alert' : 'check') : p.status === 'dev' ? 'hourglass' : 'ban')
export const statusText = (p: Product) => (p.status === 'sale' ? (p.stock <= 0 && p.companyId === 'player' ? 'Sold out' : 'On sale') : p.status === 'dev' ? `Dev ${p.devDaysLeft}d` : 'Ended')

function ScoreBars({ product }: { product: Product }) {
  const g = useGame()
  const n = normalised(product.raw, g.day)
  return (
    <div>
      {SUBS.map((k) => (
        <div key={k} className="flex items-center gap-2 py-[3px]">
          <span className="w-32 text-[11px] text-dim">{subLabel(product.type, k)}</span>
          <Meter value={n[k]} max={1.1} tone={n[k] > 0.9 ? 'pos' : n[k] > 0.6 ? 'accent' : 'warn'} />
          <span className="num w-8 text-right text-[11px] text-fg">{Math.round(n[k] * 100)}</span>
        </div>
      ))}
      <div className="mt-1 text-[10px] text-faint">100 = level with the best the market can build today</div>
    </div>
  )
}

function Voices({ product }: { product: Product }) {
  const stars = product.feedback.length ? product.feedback.reduce((a, f) => a + f.stars, 0) / product.feedback.length : 0
  return (
    <div className="p-2">
      <Head icon="press" className="mb-1 text-faint">
        Press reviews
      </Head>
      {!product.reviews.length && <div className="py-2 text-[11px] text-faint">Reviews are published on release day.</div>}
      {product.reviews.map((r) => (
        <div key={r.outlet} className="mb-1 flex gap-3 border border-line p-2">
          <div className={`num w-10 shrink-0 text-xl leading-none ${r.score >= 8 ? 'text-pos' : r.score >= 6 ? 'text-fg' : 'text-neg'}`}>{r.score.toFixed(1)}</div>
          <div className="min-w-0">
            <div className="label">{r.outlet}</div>
            {r.pros.map((t) => (
              <div key={t} className="text-[11px] text-fg">
                <Icon name="plus" size={9} className="mr-[5px] inline-block text-pos" />
                {t}
              </div>
            ))}
            {r.cons.map((t) => (
              <div key={t} className="text-[11px] text-dim">
                <Icon name="minus" size={9} className="mr-[5px] inline-block text-neg" />
                {t}
              </div>
            ))}
          </div>
        </div>
      ))}
      {product.companyId === 'player' && (
        <>
          <Head
            icon="review"
            className="mb-1 mt-3 text-faint"
            right={
              stars > 0 && (
                <span className="num flex items-center gap-[3px] text-fg" title="Average out of 5">
                  <Icon name="star" size={10} className="text-accent" />
                  {stars.toFixed(1)}
                </span>
              )
            }
          >
            What owners say
          </Head>
          {!product.feedback.length && <div className="py-2 text-[11px] text-faint">Owner comments arrive weekly once the device is selling.</div>}
          {product.feedback.map((f, i) => (
            <div key={i} className="flex items-start gap-2 border-b border-line py-[5px] last:border-0">
              <span className={`num flex w-8 shrink-0 items-center gap-[3px] text-[11px] ${f.stars >= 4 ? 'text-pos' : f.stars <= 2 ? 'text-neg' : 'text-dim'}`} title={`${f.stars} out of 5`}>
                <Icon name="star" size={11} />
                {f.stars}
              </span>
              <span className="flex-1 text-[11px] text-fg">{f.text}</span>
              <span className="num shrink-0 text-[9px] text-faint">{fmtDate(f.day)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

/** Controls only the owner of a product gets: supply, price, and what to build next. */
function Manage({ p }: { p: Product }) {
  const g = useGame()
  const { act, say, openDesigner } = useStore.getState()
  const line = factoryLine(g)
  const [qty, setQty] = useState(10000)
  const [mode, setMode] = useState<ProductionOrder['mode']>(line?.running ? 'factory' : 'contract')
  const [price, setP] = useState(p.price)
  const avg = tierAverages(p)
  const cost = buildCost(g, p, mode)
  const margin = avg.price * (1 - RETAIL_CUT) - cost - avg.extraCost
  const pending = pendingUnits(g, p.id)
  const orders = g.orders.filter((o) => o.productId === p.id)
  const ended = p.status === 'ended'
  return (
    <div className="space-y-3 p-2">
      <div className="grid grid-cols-3 gap-1">
        <Mini label="In stock" icon="warehouse" value={num(p.stock)} tone={p.stock <= 0 && p.status === 'sale' ? 'text-neg' : 'text-fg'} />
        <Mini label="On order" icon="truck" value={num(pending)} />
        <Mini label="Margin / unit" icon="percent" value={money(margin)} tone={margin > 0 ? 'text-pos' : 'text-neg'} />
      </div>

      {!ended && (
        <div className="border border-line p-2">
          <Head icon="factory" className="mb-1 text-faint">
            Order a production run
          </Head>
          <div className="flex gap-1">
            {(['contract', 'factory'] as const).map((m) => (
              <Btn key={m} small icon={m === 'contract' ? 'doc' : 'factory'} className="flex-1" active={mode === m} disabled={m === 'factory' && !line?.running} onClick={() => setMode(m)} title={m === 'factory' && !line?.running ? 'Needs a working line in your factory' : ''}>
                {m === 'contract' ? 'Contract maker' : 'Own factory'}
              </Btn>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <NumInput value={qty} onChange={setQty} step={1000} className="h-7 w-28 text-right" />
            <span className="num flex-1 text-[11px] text-dim">x {money(cost)}</span>
            <Btn
              small
              tone="primary"
              icon="package"
              onClick={() => {
                const err = act((s) => orderProduction(s, p.id, qty, mode))
                if (err) say(err, 'bad')
                else (sfx.cash(), say(`Ordered ${num(qty)} units. You pay as they are built.`))
              }}
            >
              Order {money(qty * cost, 1)}
            </Btn>
          </div>
          <div className="mt-1 text-[10px] leading-snug text-faint">
            {mode === 'contract' ? `Starts after ${CONTRACT.leadDays} days, then about ${num(CONTRACT.perDay / TYPES[p.type].capacity)} a day. ${pct(CONTRACT.defectRate)} arrive faulty.` : `About ${num((line?.throughput ?? 0) / TYPES[p.type].capacity)} a day, shared with other orders. ${pct(line?.defectRate ?? 0)} arrive faulty.`}
          </div>
          {orders.map((o) => (
            <div key={o.id} className="mt-2">
              <div className="num flex justify-between text-[10px] text-dim">
                <span>
                  <Lead icon={o.mode === 'contract' ? 'doc' : 'factory'} size={10} />
                  {o.mode === 'contract' ? 'CONTRACT' : 'FACTORY'}
                </span>
                <span>
                  {num(o.done)} / {num(o.quantity)}
                </span>
              </div>
              <Meter value={o.done} max={o.quantity} />
            </div>
          ))}
        </div>
      )}

      {!ended && (
        <div className="border border-line p-2">
          <Head icon="tag" className="mb-1 text-faint">
            Retail price
          </Head>
          <div className="flex items-center gap-2">
            <NumInput value={price} onChange={setP} step={10} className="h-7 w-28 text-right" />
            <span className="flex-1 text-[10px] text-faint">{p.tiers.length ? `Storage options move with it (avg paid ${money(avg.price)})` : 'Retailers keep 15%'}</span>
            <Btn small icon="check" disabled={price === p.price || price <= 0} onClick={() => (act((s) => setPrice(s, p.id, price)), say(`${p.name} now costs ${money(price)}.`))}>
              Apply
            </Btn>
          </div>
        </div>
      )}

      <div className="border border-line p-2">
        <Head icon="branch" className="mb-1 text-faint">
          Build on this device
        </Head>
        <div className="grid grid-cols-3 gap-1">
          {VARIANTS.map((v) => (
            <Btn key={v.id} small title={v.note} onClick={() => openDesigner({ from: p, variant: v.id })}>
              {v.id}
            </Btn>
          ))}
          <Btn small icon="arrowRight" title="Start the next generation from this design" onClick={() => openDesigner({ from: p, variant: 'next' })}>
            Successor
          </Btn>
        </div>
        <div className="mt-1 text-[10px] leading-snug text-faint">A variant in the same family reuses the platform: about 45% cheaper and 40% faster to develop.</div>
      </div>

      <div className="border border-line p-2">
        <Head icon="receipt" className="mb-1 text-faint">
          Cost to build one, today
        </Head>
        {SUPPLY_CATS.map((c) => (
          <Row key={c} icon={supplyIcon(c)} k={SUPPLY_LABELS[c]} v={`${money(p.costParts[c] * supplyPrice(g, c))}${supplyPrice(g, c) > 1.08 ? '  (prices up)' : ''}`} tone={supplyPrice(g, c) > 1.08 ? 'text-warn' : undefined} />
        ))}
        <Row icon="build" k="Assembly and extras" v={money(p.costParts.other)} />
        <Row icon="alert" k="Fault rate" v={pct(p.defectRate)} tone={p.defectRate > 0.03 ? 'text-warn' : undefined} />
      </div>

      {!ended && (
        <Btn small tone="danger" icon="ban" className="w-full" onClick={() => act((s) => discontinue(s, p.id))}>
          Discontinue {p.name}
        </Btn>
      )}
    </div>
  )
}

type InspectTab = 'overview' | 'manage' | 'specs' | 'voices'

/** Global slide-over: opens whenever a product is focused anywhere in the game. */
export function ProductDrawer() {
  const g = useGame()
  const id = useStore((s) => s.inspect)
  const { focus } = useStore.getState()
  const product = g.products.find((p) => p.id === id)
  const [tab, setTab] = useState<InspectTab>('overview')
  const [view, setView] = useState<ViewName | undefined>(undefined)
  const [nonce, setNonce] = useState(0)
  const [color, setColor] = useState(-1)

  useEffect(() => {
    setView(undefined)
    setColor(-1)
    setTab('overview')
  }, [id])
  useEffect(() => {
    if (!id) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && focus(null)
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [id, focus])

  if (!product) return null
  const company = companyOf(g, product.companyId)
  const mine = company.isPlayer
  const seg = product.segment ? segmentInfo(product.segment) : undefined
  const history = product.history.map((u, i) => ({ m: i + 1, Units: u }))
  const tabs: { value: InspectTab; label: string; icon: IconName }[] = [{ value: 'overview', label: 'Overview', icon: 'overview' }, ...(mine ? [{ value: 'manage' as const, label: 'Manage', icon: 'system' as const }] : []), { value: 'specs', label: 'Specs', icon: 'feed' }, { value: 'voices', label: 'Reviews', icon: 'review' }]
  return (
    <Drawer
      open
      onClose={() => focus(null)}
      width={440}
      title={
        <span>
          <span style={{ color: company.color }}>{company.name}</span> <span className="text-faint">/</span> {product.name}
        </span>
      }
    >
      <div className="relative h-[270px] border-b border-line">
        <DeviceView key={product.id} design={product.design} view={view} viewNonce={nonce} autoRotate logo={player(g).logo} colorIndex={color} />
        <div className="absolute left-2 top-2 flex border border-line bg-panel/90">
          {(['back', 'front', 'side'] as ViewName[]).map((v) => (
            <Btn key={v} small tone="ghost" active={view === v} onClick={() => (setView(v), setNonce((x) => x + 1))}>
              {v}
            </Btn>
          ))}
        </div>
        {!!product.design.colors?.length && (
          <div className="absolute bottom-2 left-2 flex gap-1">
            {[{ back: product.design.body.backColor, name: 'Standard' }, ...product.design.colors].map((c, i) => (
              <button key={i} title={c.name} onClick={() => setColor(i - 1)} className={`h-4 w-4 border ${color === i - 1 ? 'border-accent' : 'border-line2'}`} style={{ background: c.back }} />
            ))}
          </div>
        )}
        <div className="absolute right-2 top-2 flex gap-1">
          <Tag tone={statusTone(product)} icon={statusIcon(product)}>
            {statusText(product)}
          </Tag>
          <Tag icon={typeIcon(product.type)}>{TYPES[product.type].name}</Tag>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-px border-b border-line bg-line">
        {(
          [
            ['Price', money(product.price), 'tag'],
            ['Review', product.reviewAvg ? product.reviewAvg.toFixed(1) : '--', 'star'],
            ['Sold', num(product.unitsSold), 'package'],
            ['Design', Math.round(product.designPct), 'design'],
          ] as const
        ).map(([k, v, icon]) => (
          <div key={k} className="bg-panel px-2 py-[6px]">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] text-faint">
              <Icon name={icon} size={10} />
              {k}
            </div>
            <div className="num text-sm font-semibold text-fg">{v}</div>
          </div>
        ))}
      </div>
      <Tabs fit value={tab} options={tabs} onChange={setTab} className="bg-panel" />
      {tab === 'overview' && (
        <div className="space-y-3 p-2">
          <div className="grid grid-cols-3 gap-1">
            <Mini label="Segment" icon="target" value={seg?.name ?? '--'} />
            <Mini label={product.status === 'dev' ? 'Release in' : 'Released'} icon={product.status === 'dev' ? 'hourglass' : 'calendar'} value={product.status === 'dev' ? `${product.devDaysLeft} days` : fmtDate(product.launchDay)} />
            <Mini label="Revenue" icon="coins" value={money(product.revenue)} />
            {mine && <Mini label="Owner mood" icon="morale" value={pct(product.satisfaction, 0)} tone={product.satisfaction > 0.7 ? 'text-pos' : product.satisfaction < 0.5 ? 'text-neg' : 'text-fg'} />}
            {mine && <Mini label="Weight" icon="weight" value={weightLabel(product.weight)} />}
            {mine && lifeLabel(product.type) && <Mini label={lifeLabel(product.type) ?? ''} icon="battery" value={`${product.lifeHours.toFixed(0)} h`} />}
          </div>
          <div className="border border-line p-2">
            <Head icon="chart" className="mb-1 text-faint">
              Scores against the market today
            </Head>
            <ScoreBars product={product} />
          </div>
          {history.length > 1 && (
            <div className="border border-line p-2">
              <Head icon="market" className="mb-1 text-faint">
                Units per month
              </Head>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                    <CartesianGrid stroke={chart.grid} vertical={false} />
                    <XAxis dataKey="m" tick={chart.axis} stroke={chart.grid} />
                    <YAxis tick={chart.axis} stroke={chart.grid} tickFormatter={(v) => num(v)} />
                    <Tooltip {...chart.tooltip} cursor={{ fill: 'var(--color-hover)' }} formatter={(v) => num(Number(v))} labelFormatter={(m) => `Month ${m}`} />
                    <Bar dataKey="Units" fill="var(--color-accent)" isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
      {mine && product.recall?.state === 'open' && (
        <div className="m-2 border border-neg p-2">
          <div className="flex items-center gap-[6px] text-[11px] font-semibold uppercase tracking-wider text-neg">
            <Icon name="alert" size={13} />
            Recall decision
          </div>
          <div className="mt-1 text-[11px] leading-snug text-dim">
            {pct(product.defectRate)} of units are faulty and owners are talking. Recall and repair every unit sold, or leave it: in {Math.max(0, RECALL_DEADLINE - (g.day - product.recall.day))} days it becomes a scandal that costs brand reputation and fans.
          </div>
          <Btn
            small
            tone="primary"
            icon="recall"
            className="mt-2 w-full"
            onClick={() => {
              const err = useStore.getState().act((s) => recallProduct(s, product.id))
              if (err) useStore.getState().say(err, 'bad')
            }}
          >
            Recall and repair ({money(product.recall.cost, 1)})
          </Btn>
        </div>
      )}
      {tab === 'manage' && mine && <Manage key={product.id} p={product} />}
      {tab === 'specs' && (
        <div className="p-2">
          {specLines(product.design, product.diag, mine ? g : undefined).map(([k, v]) => (
            <Row key={k} icon={SPEC_ICON[k] ?? 'feed'} k={<span className="whitespace-nowrap">{k}</span>} v={<span className="whitespace-normal text-right">{v}</span>} />
          ))}
          <Row icon="weight" k="Weight" v={weightLabel(product.weight)} />
          {lifeLabel(product.type) && <Row icon="battery" k={lifeLabel(product.type)} v={`${product.lifeHours.toFixed(1)} h`} />}
          {product.tiers.map((t) => (
            <Row key={t.storage} icon="tag" k={`${t.storage >= 1024 ? t.storage / 1024 + ' TB' : t.storage + ' GB'} option`} v={money(t.price)} />
          ))}
        </div>
      )}
      {tab === 'voices' && <Voices product={product} />}
    </Drawer>
  )
}
