// Dashboard screens: overview, products, market, rivals, research, finance.
import { useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { sfx } from '../audio/sfx'
import { MAX_LEVEL, SEGMENTS, TRACK_INFO, marketLevel, researchCost, segmentInfo } from '../data/catalog'
import { RETAIL_CUT, companyOf, discontinue, fmtDate, monthLabel, player, produce, setPrice, toggleResearch, trailingUnits } from '../sim/game'
import { OUTSIDE_OPTION, attraction, segmentDemand } from '../sim/market'
import { type GameState, type Product, TRACKS } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { ProductInspector, Thumb } from './Inspector'
import { Btn, Meter, NumInput, Panel, Row, Slider, Stat, TextInput, chart, money, num, pct } from './ui'

const playerProducts = (g: GameState) => g.products.filter((p) => p.companyId === 'player').sort((a, b) => b.launchDay - a.launchDay)
const statusTone = (p: Product) => (p.status === 'sale' ? (p.stock <= 0 ? 'text-neg' : 'text-pos') : p.status === 'dev' ? 'text-warn' : 'text-faint')
const statusText = (p: Product) => (p.status === 'sale' ? (p.stock <= 0 && p.companyId === 'player' ? 'SOLD OUT' : 'ON SALE') : p.status === 'dev' ? `DEV ${p.devDaysLeft}D` : 'ENDED')

function shareSeries(g: GameState, months = 36) {
  const rows = g.shareHistory.slice(-months)
  const ids = g.companies.filter((c) => rows.some((r) => (r.units[c.id] ?? 0) > 0)).map((c) => c.id)
  const data = rows.map((r) => {
    const total = Object.values(r.units).reduce((a, b) => a + b, 0) || 1
    const row: Record<string, number | string> = { month: monthLabel(r.month) }
    for (const id of ids) row[id] = Math.round(((r.units[id] ?? 0) / total) * 1000) / 10
    return row
  })
  return { data, ids }
}

function ShareChart({ g }: { g: GameState }) {
  const { data, ids } = shareSeries(g)
  if (data.length < 2) return <Empty text="Market share appears after the first two months." />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={chart.grid} vertical={false} />
        <XAxis dataKey="month" tick={chart.axis} stroke={chart.grid} minTickGap={30} />
        <YAxis tick={chart.axis} stroke={chart.grid} unit="%" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow />
        <Tooltip {...chart.tooltip} formatter={(v, id) => [`${v}%`, companyOf(g, String(id)).name]} />
        {ids.map((id) => {
          const c = companyOf(g, id)
          return <Area key={id} dataKey={id} stackId="s" stroke={c.color} fill={c.color} fillOpacity={c.isPlayer ? 0.9 : 0.35} strokeWidth={1} isAnimationActive={false} />
        })}
      </AreaChart>
    </ResponsiveContainer>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center px-6 text-center text-[11px] text-faint">{text}</div>
}

function FinanceChart({ g, months = 24 }: { g: GameState; months?: number }) {
  const data = g.reports.slice(-months).map((r) => ({
    month: monthLabel(r.month),
    Revenue: Math.round(r.revenue),
    Costs: Math.round(r.production + r.rd + r.marketing + r.development + r.overhead + r.interest),
    Cash: Math.round(r.cash),
  }))
  if (data.length < 2) return <Empty text="Monthly figures appear after the first two months." />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={chart.grid} vertical={false} />
        <XAxis dataKey="month" tick={chart.axis} stroke={chart.grid} minTickGap={30} />
        <YAxis tick={chart.axis} stroke={chart.grid} tickFormatter={(v) => money(v, 1)} width={56} />
        <Tooltip {...chart.tooltip} formatter={(v) => money(Number(v))} />
        <Line dataKey="Revenue" stroke="#4cc38a" dot={false} strokeWidth={1.5} isAnimationActive={false} />
        <Line dataKey="Costs" stroke="#e5484d" dot={false} strokeWidth={1.5} isAnimationActive={false} />
        <Line dataKey="Cash" stroke="#36c5d6" dot={false} strokeWidth={1} strokeDasharray="3 3" isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ------------------------------------------------------------------ dashboard

export function Dashboard() {
  const g = useGame()
  const { openDesigner, focus, setTab } = useStore.getState()
  const me = player(g)
  const trailing = trailingUnits(g)
  const total = trailing.reduce((a, t) => a + t.units, 0) || 1
  const mine = trailing[0].units
  const last = g.reports[g.reports.length - 1]
  const profit = last ? last.revenue - (last.production + last.rd + last.marketing + last.development + last.overhead + last.interest) : 0
  const products = playerProducts(g).filter((p) => p.status !== 'ended')
  const top = g.products.filter((p) => p.status === 'sale').sort((a, b) => (b.history.at(-1) ?? 0) - (a.history.at(-1) ?? 0)).slice(0, 12)
  return (
    <div className="grid h-full min-h-0 grid-cols-12 grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-2 p-2">
      <div className="col-span-12 grid grid-cols-6 gap-2">
        <Stat label="Cash" value={g.config.unlimitedMoney ? 'UNLIMITED' : money(g.cash)} tone={g.cash < 0 && !g.config.unlimitedMoney ? 'neg' : 'accent'} sub={g.debtDays > 0 ? `in debt ${g.debtDays} days` : 'available'} />
        <Stat label="Last month profit" value={last ? money(profit) : '--'} tone={profit >= 0 ? 'pos' : 'neg'} sub={last ? `revenue ${money(last.revenue)}` : 'no data yet'} />
        <Stat label="Units, 12 months" value={num(mine)} sub={`${num(me.unitsTotal)} lifetime`} />
        <Stat label="Market share" value={pct(mine / total, 2)} sub={`of ${num(total)} phones`} />
        <Stat label="Brand reputation" value={Math.round(me.brand * 100)} sub="moved by reviews" />
        <Stat label="Awareness" value={pct(me.awareness)} sub="grows with sales and marketing" />
      </div>

      <Panel title="Revenue, costs and cash" className="col-span-5">
        <FinanceChart g={g} />
      </Panel>
      <Panel title="Market share by units" className="col-span-4">
        <ShareChart g={g} />
      </Panel>
      <Panel title="Research" right={<Btn small tone="ghost" onClick={() => setTab('research')}>Open</Btn>} className="col-span-3" bodyClass="overflow-y-auto px-2 py-1">
        {TRACKS.map((t) => (
          <div key={t} className="flex items-center gap-2 py-[3px]">
            <span className={`w-28 text-[11px] ${g.activeResearch.includes(t) ? 'text-accent' : 'text-dim'}`}>{TRACK_INFO[t].name}</span>
            <Meter value={g.levels[t] >= MAX_LEVEL ? 1 : g.progress[t] / researchCost(g.levels[t] + 1)} tone={g.activeResearch.includes(t) ? 'accent' : 'dim'} />
            <span className="num w-8 text-right text-[11px]">L{g.levels[t]}</span>
          </div>
        ))}
        <Row k="Industry level" v={marketLevel(g.day).toFixed(1)} />
        <Row k="R&D budget" v={`${money(g.rdBudget)} / mo`} />
      </Panel>

      <Panel title="Your devices" right={<Btn small tone="primary" onClick={() => openDesigner()}>Design new device</Btn>} className="col-span-5" bodyClass="overflow-auto">
        {products.length === 0 ? (
          <Empty text="No devices yet. Design your first phone to enter the market." />
        ) : (
          <table className="grid-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Status</th>
                <th className="r">Price</th>
                <th className="r">Stock</th>
                <th className="r">Sold</th>
                <th className="r">Review</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="row cursor-pointer" onClick={() => focus(p.id, 'products')}>
                  <td>{p.name}</td>
                  <td className={`num ${statusTone(p)}`}>{statusText(p)}</td>
                  <td className="num r">{money(p.price)}</td>
                  <td className="num r">{num(p.stock)}</td>
                  <td className="num r">{num(p.unitsSold)}</td>
                  <td className="num r">{p.reviewAvg ? p.reviewAvg.toFixed(1) : '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel title="Best sellers last month" className="col-span-4" bodyClass="overflow-auto">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Maker</th>
              <th className="r">Price</th>
              <th className="r">Units</th>
            </tr>
          </thead>
          <tbody>
            {top.map((p) => {
              const c = companyOf(g, p.companyId)
              return (
                <tr key={p.id} className="row cursor-pointer" onClick={() => focus(p.id, 'market')}>
                  <td>{p.name}</td>
                  <td style={{ color: c.color }}>{c.name}</td>
                  <td className="num r">{money(p.price)}</td>
                  <td className="num r">{num(p.history.at(-1) ?? 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
      <Panel title="Segments" className="col-span-3" bodyClass="overflow-auto">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Segment</th>
              <th className="r">Buyers / yr</th>
              <th className="r">Typical</th>
            </tr>
          </thead>
          <tbody>
            {SEGMENTS.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td className="num r">{num(segmentDemand(s, g.day) * 360)}</td>
                <td className="num r">{money(s.priceRef)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

// ------------------------------------------------------------------ products

function ProductControls({ p }: { p: Product }) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const [qty, setQty] = useState(10000)
  const [price, setP] = useState(p.price)
  const margin = p.price * (1 - RETAIL_CUT) - p.unitCost
  const history = p.history.map((u, i) => ({ m: i + 1, Units: u }))
  return (
    <>
      <Panel title="Sales and supply" className="shrink-0" bodyClass="px-2 py-1">
        <Row k="Unit cost" v={money(p.unitCost)} />
        <Row k="Margin per unit" v={money(margin)} tone={margin > 0 ? 'text-pos' : 'text-neg'} />
        <Row k="In stock" v={num(p.stock)} tone={p.stock <= 0 && p.status === 'sale' ? 'text-neg' : undefined} />
        <Row k="Revenue to date" v={money(p.revenue)} />
        {p.status !== 'ended' && (
          <>
            <div className="flex items-center gap-2 py-1">
              <span className="flex-1 text-[11px] text-dim">Order units</span>
              <NumInput value={qty} onChange={setQty} step={1000} className="h-6 w-24 text-right" />
              <Btn
                small
                onClick={() => {
                  const err = act((s) => produce(s, p.id, qty))
                  if (err) say(err, 'bad')
                  else (sfx.cash(), say(`Ordered ${num(qty)} units for ${money(qty * p.unitCost)}.`))
                }}
              >
                Buy {money(qty * p.unitCost, 1)}
              </Btn>
            </div>
            <div className="flex items-center gap-2 py-1">
              <span className="flex-1 text-[11px] text-dim">Retail price</span>
              <NumInput value={price} onChange={setP} step={10} className="h-6 w-24 text-right" />
              <Btn small disabled={price === p.price || price <= 0} onClick={() => (act((s) => setPrice(s, p.id, price)), say(`${p.name} now costs ${money(price)}.`))}>
                Apply
              </Btn>
            </div>
            <div className="flex justify-end py-1">
              <Btn small tone="danger" onClick={() => act((s) => discontinue(s, p.id))}>
                Discontinue
              </Btn>
            </div>
          </>
        )}
        {!g.config.unlimitedMoney && p.status === 'sale' && p.stock <= 0 && <div className="py-1 text-[11px] text-neg">Sold out. Customers are buying rival phones instead.</div>}
      </Panel>
      {history.length > 1 && (
        <Panel title="Units per month" className="shrink-0">
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="m" tick={chart.axis} stroke={chart.grid} />
                <YAxis tick={chart.axis} stroke={chart.grid} tickFormatter={(v) => num(v)} />
                <Tooltip {...chart.tooltip} cursor={{ fill: '#181e26' }} formatter={(v) => num(Number(v))} labelFormatter={(m) => `Month ${m}`} />
                <Bar dataKey="Units" fill="#36c5d6" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}
    </>
  )
}

export function Products() {
  const g = useGame()
  const focusId = useStore((s) => s.focusProduct)
  const { focus, openDesigner } = useStore.getState()
  const list = playerProducts(g)
  const current = list.find((p) => p.id === focusId) ?? list[0]
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_400px] gap-2 p-2">
      <Panel title={`Your devices (${list.length})`} right={<Btn small tone="primary" onClick={() => openDesigner()}>Design new device</Btn>} bodyClass="overflow-auto">
        {list.length === 0 ? (
          <Empty text="No devices yet. Use Design new device to open the 3D designer." />
        ) : (
          <table className="grid-table">
            <thead>
              <tr>
                <th />
                <th>Device</th>
                <th>Status</th>
                <th>Segment</th>
                <th className="r">Price</th>
                <th className="r">Cost</th>
                <th className="r">Stock</th>
                <th className="r">Sold</th>
                <th className="r">Revenue</th>
                <th className="r">Review</th>
                <th className="r">Design</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={`row cursor-pointer ${current?.id === p.id ? 'bg-accent/5' : ''}`} onClick={() => focus(p.id)}>
                  <td className="w-10 !p-0">
                    <Thumb product={p} className="h-11 w-9" />
                  </td>
                  <td className={current?.id === p.id ? 'text-accent' : ''}>{p.name}</td>
                  <td className={`num ${statusTone(p)}`}>{statusText(p)}</td>
                  <td className="text-dim">{p.segment ? segmentInfo(p.segment).name : '--'}</td>
                  <td className="num r">{money(p.price)}</td>
                  <td className="num r text-dim">{money(p.unitCost)}</td>
                  <td className="num r">{num(p.stock)}</td>
                  <td className="num r">{num(p.unitsSold)}</td>
                  <td className="num r">{money(p.revenue)}</td>
                  <td className="num r">{p.reviewAvg ? p.reviewAvg.toFixed(1) : '--'}</td>
                  <td className="num r">{Math.round(p.designPct)}</td>
                  <td className="r">
                    <Btn small tone="ghost" onClick={(e) => (e.stopPropagation(), openDesigner(p.design))}>
                      Use as base
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {current ? (
        <ProductInspector product={current}>
          <ProductControls key={current.id} p={current} />
        </ProductInspector>
      ) : (
        <Panel title="Inspector">
          <Empty text="Select a device to inspect it." />
        </Panel>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ market

export function Market() {
  const g = useGame()
  const focusId = useStore((s) => s.focusProduct)
  const { focus } = useStore.getState()
  const [seg, setSeg] = useState<string>('all')
  const onSale = g.products.filter((p) => p.status === 'sale')
  const info = SEGMENTS.find((s) => s.id === seg)
  // share of the chosen segment each product is winning right now
  const weights = new Map<string, number>()
  if (info) {
    let total = OUTSIDE_OPTION
    for (const p of onSale) {
      const w = p.stock <= 0 ? 0 : attraction(p, companyOf(g, p.companyId), info, g.day)
      weights.set(p.id, w)
      total += w
    }
    for (const [k, w] of weights) weights.set(k, w / total)
  }
  const rows = [...onSale].sort((a, b) => (info ? (weights.get(b.id) ?? 0) - (weights.get(a.id) ?? 0) : (b.history.at(-1) ?? b.monthUnits) - (a.history.at(-1) ?? a.monthUnits)))
  const current = g.products.find((p) => p.id === focusId) ?? rows[0]
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_400px] gap-2 p-2">
      <div className="grid min-h-0 grid-rows-[220px_minmax(0,1fr)] gap-2">
        <Panel title="Market share by units, last 36 months">
          <ShareChart g={g} />
        </Panel>
        <Panel
          title={info ? `${info.name}: who wins a buyer today` : 'All phones on sale'}
          right={
            <div className="flex">
              <Btn small tone="ghost" active={seg === 'all'} onClick={() => setSeg('all')}>
                All
              </Btn>
              {SEGMENTS.map((s) => (
                <Btn key={s.id} small tone="ghost" active={seg === s.id} onClick={() => setSeg(s.id)}>
                  {s.name}
                </Btn>
              ))}
            </div>
          }
          bodyClass="overflow-auto"
        >
          <table className="grid-table">
            <thead>
              <tr>
                <th />
                <th>Device</th>
                <th>Maker</th>
                <th>Segment</th>
                <th className="r">Price</th>
                <th className="r">Review</th>
                <th className="r">Design</th>
                <th className="r">Last month</th>
                {info && <th className="r">Win rate</th>}
                <th>Released</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const c = companyOf(g, p.companyId)
                return (
                  <tr key={p.id} className={`row cursor-pointer ${current?.id === p.id ? 'bg-accent/5' : ''}`} onClick={() => focus(p.id)}>
                    <td className="w-10 !p-0">
                      <Thumb product={p} className="h-11 w-9" />
                    </td>
                    <td className={current?.id === p.id ? 'text-accent' : ''}>{p.name}</td>
                    <td style={{ color: c.color }}>{c.name}</td>
                    <td className="text-dim">{p.segment ? segmentInfo(p.segment).name : '--'}</td>
                    <td className="num r">{money(p.price)}</td>
                    <td className="num r">{p.reviewAvg.toFixed(1)}</td>
                    <td className="num r">{Math.round(p.designPct)}</td>
                    <td className="num r">{num(p.history.at(-1) ?? p.monthUnits)}</td>
                    {info && <td className="num r text-accent">{pct(weights.get(p.id) ?? 0)}</td>}
                    <td className="num text-dim">{fmtDate(p.launchDay)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      </div>
      {current && <ProductInspector product={current} />}
    </div>
  )
}

// ------------------------------------------------------------------ rivals

export function Rivals() {
  const g = useGame()
  const { act, focus } = useStore.getState()
  const focusId = useStore((s) => s.focusProduct)
  const [companyId, setCompanyId] = useState('r0')
  const trailing = trailingUnits(g)
  const total = trailing.reduce((a, t) => a + t.units, 0) || 1
  const company = g.companies.find((c) => c.id === companyId) ?? g.companies[1]
  const products = g.products.filter((p) => p.companyId === company.id).sort((a, b) => b.launchDay - a.launchDay)
  const current = products.find((p) => p.id === focusId) ?? products[0]
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_400px] gap-2 p-2">
      <div className="grid min-h-0 grid-rows-2 gap-2">
        <Panel title="Companies" bodyClass="overflow-auto">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Status</th>
                <th>Segments</th>
                <th className="r">Brand</th>
                <th className="r">Awareness</th>
                <th className="r">Units 12 mo</th>
                <th className="r">Share</th>
                <th className="r">Lifetime revenue</th>
              </tr>
            </thead>
            <tbody>
              {[...trailing].sort((a, b) => b.units - a.units).map(({ company: c, units }) => (
                <tr key={c.id} className={`row cursor-pointer ${c.id === company.id ? 'bg-accent/5' : ''}`} onClick={() => setCompanyId(c.id)}>
                  <td>
                    <span className="mr-2 inline-block h-2 w-2" style={{ background: c.color }} />
                    {c.name}
                    {c.isPlayer && <span className="label ml-2 text-accent">you</span>}
                  </td>
                  <td className={`num ${c.alive ? 'text-pos' : 'text-neg'}`}>{c.alive ? 'ACTIVE' : 'BANKRUPT'}</td>
                  <td className="text-dim">{c.isPlayer ? '--' : c.segments.map((s) => segmentInfo(s).name).join(', ')}</td>
                  <td className="num r">{Math.round(c.brand * 100)}</td>
                  <td className="num r">{pct(c.awareness, 0)}</td>
                  <td className="num r">{num(units)}</td>
                  <td className="num r">{pct(units / total)}</td>
                  <td className="num r">{money(c.revenueTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel
          title={`${company.name}: devices`}
          right={
            !company.isPlayer && (
              <label className="flex items-center gap-2">
                <span className="label">Rename</span>
                <TextInput value={company.name} maxLength={18} onChange={(v) => act(() => void (company.name = v))} className="h-5 w-32" />
              </label>
            )
          }
          bodyClass="overflow-auto"
        >
          <table className="grid-table">
            <thead>
              <tr>
                <th />
                <th>Device</th>
                <th>Status</th>
                <th>Segment</th>
                <th className="r">Price</th>
                <th className="r">Review</th>
                <th className="r">Sold</th>
                <th>Released</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className={`row cursor-pointer ${current?.id === p.id ? 'bg-accent/5' : ''}`} onClick={() => focus(p.id)}>
                  <td className="w-10 !p-0">
                    <Thumb product={p} className="h-11 w-9" />
                  </td>
                  <td className={current?.id === p.id ? 'text-accent' : ''}>{p.name}</td>
                  <td className={`num ${statusTone(p)}`}>{statusText(p)}</td>
                  <td className="text-dim">{p.segment ? segmentInfo(p.segment).name : '--'}</td>
                  <td className="num r">{money(p.price)}</td>
                  <td className="num r">{p.reviewAvg ? p.reviewAvg.toFixed(1) : '--'}</td>
                  <td className="num r">{num(p.unitsSold)}</td>
                  <td className="num text-dim">{p.status === 'dev' ? '--' : fmtDate(p.launchDay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
      {current ? (
        <ProductInspector product={current} />
      ) : (
        <Panel title="Inspector">
          <Empty text="This company has no devices." />
        </Panel>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ research

export function Research() {
  const g = useGame()
  const { act } = useStore.getState()
  const industry = marketLevel(g.day)
  const perTrack = g.activeResearch.length ? (g.rdBudget * g.config.researchSpeed) / g.activeResearch.length : 0
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] gap-2 p-2">
      <Panel title="Research tracks" bodyClass="overflow-auto">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Track</th>
              <th>Level</th>
              <th>You have</th>
              <th>Next unlock</th>
              <th className="r">Cost</th>
              <th className="w-48">Progress</th>
              <th className="r">ETA</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {TRACKS.map((t) => {
              const lv = g.levels[t]
              const maxed = lv >= MAX_LEVEL
              const cost = maxed ? 0 : researchCost(lv + 1)
              const active = g.activeResearch.includes(t)
              const eta = active && perTrack > 0 ? Math.ceil(((cost - g.progress[t]) / perTrack) * 30) : 0
              return (
                <tr key={t} className="row">
                  <td className={active ? 'text-accent' : ''}>{TRACK_INFO[t].name}</td>
                  <td>
                    <div className="flex items-center gap-[2px]">
                      {Array.from({ length: MAX_LEVEL + 1 }, (_, i) => (
                        <span key={i} title={TRACK_INFO[t].unlocks[i]} className={`h-3 w-2 border ${i <= lv ? 'border-accent bg-accent' : i <= industry ? 'border-warn/70' : 'border-line2'}`} />
                      ))}
                      <span className="num ml-2">L{lv}</span>
                    </div>
                  </td>
                  <td className="text-dim">{TRACK_INFO[t].unlocks[lv]}</td>
                  <td>{maxed ? <span className="text-faint">Complete</span> : TRACK_INFO[t].unlocks[lv + 1]}</td>
                  <td className="num r">{maxed ? '--' : money(cost, 1)}</td>
                  <td>{!maxed && <Meter value={g.progress[t]} max={cost} tone={active ? 'accent' : 'dim'} />}</td>
                  <td className="num r text-dim">{eta ? `${eta}d` : '--'}</td>
                  <td className="r">
                    <Btn small disabled={maxed} active={active} onClick={() => act((s) => toggleResearch(s, t))}>
                      {active ? 'Researching' : 'Start'}
                    </Btn>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-2 py-2 text-[11px] leading-snug text-dim">
          Filled blocks are levels you own. Amber outlines are levels the leading rivals already ship. The budget is split evenly between the tracks being researched, so fewer tracks finish sooner.
        </div>
      </Panel>
      <div className="flex min-h-0 flex-col gap-2">
        <Panel title="R&D budget" className="shrink-0" bodyClass="px-2 py-1">
          <Slider label="Monthly budget" value={g.rdBudget} min={0} max={Math.max(2e6, Math.ceil((g.cash * 0.25) / 1e5) * 1e5, g.rdBudget)} step={10e3} format={(v) => money(v)} onChange={(v) => act((s) => void (s.rdBudget = v))} />
          <Row k="Tracks in progress" v={g.activeResearch.length} />
          <Row k="Per track, per month" v={money(perTrack)} />
          <Row k="Research speed" v={`${g.config.researchSpeed.toFixed(2)}x`} />
          <Row k="Spent this month" v={money(g.cur.rd)} />
          {g.rdBudget > 0 && !g.activeResearch.length && <div className="py-1 text-[11px] text-warn">Pick at least one track, or no money is spent.</div>}
          {g.rdBudget === 0 && g.activeResearch.length > 0 && <div className="py-1 text-[11px] text-warn">Set a budget to make progress.</div>}
        </Panel>
        <Panel title="Industry" className="shrink-0" bodyClass="px-2 py-1">
          <Row k="Leading-edge level" v={industry.toFixed(2)} />
          <Row k="Your average level" v={(TRACKS.reduce((a, t) => a + g.levels[t], 0) / TRACKS.length).toFixed(2)} />
          <div className="py-1 text-[11px] leading-snug text-dim">The industry gains a level roughly every 30 months. Devices are scored against the leading edge, so an unchanged phone slowly loses appeal.</div>
        </Panel>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ finance

export function Finance() {
  const g = useGame()
  const rows = [...g.reports].reverse().slice(0, 36)
  const sum = (k: 'revenue' | 'production' | 'rd' | 'marketing' | 'development' | 'overhead' | 'interest') => g.reports.slice(-12).reduce((a, r) => a + r[k], 0)
  const costs12 = sum('production') + sum('rd') + sum('marketing') + sum('development') + sum('overhead') + sum('interest')
  const stockValue = g.products.filter((p) => p.companyId === 'player' && p.status !== 'ended').reduce((a, p) => a + p.stock * p.unitCost, 0)
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_240px_minmax(0,1fr)] gap-2 p-2">
      <div className="grid grid-cols-6 gap-2">
        <Stat label="Cash" value={g.config.unlimitedMoney ? 'UNLIMITED' : money(g.cash)} tone="accent" />
        <Stat label="Revenue, 12 months" value={money(sum('revenue'))} />
        <Stat label="Costs, 12 months" value={money(costs12)} />
        <Stat label="Profit, 12 months" value={money(sum('revenue') - costs12)} tone={sum('revenue') - costs12 >= 0 ? 'pos' : 'neg'} />
        <Stat label="Unsold stock at cost" value={money(stockValue)} />
        <Stat label="This month so far" value={money(g.cur.revenue)} sub={`${num(g.cur.units)} units`} />
      </div>
      <Panel title="Revenue, costs and cash, last 36 months">
        <FinanceChart g={g} months={36} />
      </Panel>
      <Panel title="Monthly statement" bodyClass="overflow-auto">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Month</th>
              <th className="r">Units</th>
              <th className="r">Revenue</th>
              <th className="r">Production</th>
              <th className="r">R&D</th>
              <th className="r">Marketing</th>
              <th className="r">Development</th>
              <th className="r">Overhead</th>
              <th className="r">Interest</th>
              <th className="r">Profit</th>
              <th className="r">Cash at close</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const profit = r.revenue - r.production - r.rd - r.marketing - r.development - r.overhead - r.interest
              return (
                <tr key={r.month} className="row">
                  <td className="num">{monthLabel(r.month)}</td>
                  <td className="num r">{num(r.units)}</td>
                  <td className="num r">{money(r.revenue)}</td>
                  <td className="num r text-dim">{money(r.production)}</td>
                  <td className="num r text-dim">{money(r.rd)}</td>
                  <td className="num r text-dim">{money(r.marketing)}</td>
                  <td className="num r text-dim">{money(r.development)}</td>
                  <td className="num r text-dim">{money(r.overhead)}</td>
                  <td className="num r text-dim">{money(r.interest)}</td>
                  <td className={`num r ${profit >= 0 ? 'text-pos' : 'text-neg'}`}>{money(profit)}</td>
                  <td className="num r">{money(r.cash)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-4 text-center text-[11px] text-faint">The first statement closes at the end of the month.</div>}
      </Panel>
    </div>
  )
}
