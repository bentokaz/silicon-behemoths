// Core screens: overview, devices, market, rivals, finance. Detail lives in
// the slide-over inspector; these screens stay scannable.
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MAX_LEVEL, SUPPLY_LABELS, TRACK_INFO, marketLevel, researchCost } from '../data/catalog'
import { SEGMENTS, TYPES, segmentInfo, segmentsOf } from '../data/devices'
import { companyOf, fmtDate, monthLabel, player, trailingUnits } from '../sim/game'
import { OUTSIDE_OPTION, attraction, segmentDemand } from '../sim/market'
import { factoryLine, marketPrice, pendingUnits } from '../sim/ops'
import { nextGoals, stageOf } from '../sim/goals'
import { REGIONS } from '../sim/regions'
import { sealedRooms } from '../sim/sites'
import { staffEffects, unmanaged } from '../sim/staff'
import { founderStake, marketCap } from '../sim/stock'
import { COST_KEYS, DEVICE_TYPES, type DeviceType, type GameState, type Product, SUPPLY_CATS, TRACKS, monthCosts } from '../sim/types'
import { hasType, unlockBlocked, unlockCost } from '../sim/world'
import { type Tab, useGame, useStore } from '../store/game'
import { Thumb, statusText, statusTone } from './Inspector'
import { Btn, Empty, Fold, Kpi, Meter, Mini, Panel, Tabs, Tag, TextInput, chart, money, num, pct } from './ui'

const mine = (g: GameState) => g.products.filter((p) => p.companyId === 'player').sort((a, b) => b.launchDay - a.launchDay)

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
          return <Area key={id} dataKey={id} stackId="s" stroke={c.color} fill={c.color} fillOpacity={c.isPlayer ? 0.9 : 0.3} strokeWidth={1} isAnimationActive={false} />
        })}
      </AreaChart>
    </ResponsiveContainer>
  )
}

function FinanceChart({ g, months = 24 }: { g: GameState; months?: number }) {
  const data = g.reports.slice(-months).map((r) => ({ month: monthLabel(r.month), Income: Math.round(r.revenue + r.other), Costs: Math.round(monthCosts(r)), Cash: Math.round(r.cash) }))
  if (data.length < 2) return <Empty text="Monthly figures appear after the first two months." />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={chart.grid} vertical={false} />
        <XAxis dataKey="month" tick={chart.axis} stroke={chart.grid} minTickGap={30} />
        <YAxis tick={chart.axis} stroke={chart.grid} tickFormatter={(v) => money(v, 1)} width={56} />
        <Tooltip {...chart.tooltip} formatter={(v) => money(Number(v))} />
        <Line dataKey="Income" stroke="var(--color-pos)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
        <Line dataKey="Costs" stroke="var(--color-neg)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
        <Line dataKey="Cash" stroke="var(--color-accent)" dot={false} strokeWidth={1} strokeDasharray="3 3" isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ------------------------------------------------------------------ overview

interface Todo {
  text: string
  tab: Tab
  tone: 'neg' | 'warn' | 'accent'
  productId?: string
}

/** Things that need a decision, most urgent first. */
function todos(g: GameState): Todo[] {
  const out: Todo[] = []
  const own = mine(g)
  const fx = staffEffects(g)
  if (!own.some((p) => p.status !== 'ended')) out.push({ text: 'You have nothing on sale. Design your first device.', tab: 'products', tone: 'accent' })
  for (const p of own) {
    if (p.status === 'sale' && p.stock <= 0 && !pendingUnits(g, p.id)) out.push({ text: `${p.name} is sold out with nothing on order.`, tab: 'products', tone: 'neg', productId: p.id })
    else if (p.status === 'dev' && !pendingUnits(g, p.id) && p.stock <= 0) out.push({ text: `${p.name} will launch with no stock. Order a production run.`, tab: 'products', tone: 'warn', productId: p.id })
  }
  if (g.cash < 0 && !g.config.unlimitedMoney) out.push({ text: `The company has been in debt for ${g.debtDays} days.`, tab: 'finance', tone: 'neg' })
  const asks = g.staff.filter((e) => e.ask).length
  if (asks) out.push({ text: `${asks} ${asks === 1 ? 'person is' : 'people are'} asking for a raise.`, tab: 'staff', tone: 'warn' })
  if (fx.idle) out.push({ text: `${fx.idle} staff have no desk and are doing nothing.`, tab: 'office', tone: 'warn' })
  if (g.staff.length && fx.morale < 40) out.push({ text: 'Morale is low. People may quit.', tab: 'staff', tone: 'neg' })
  if (g.factory && g.orders.some((o) => o.mode === 'factory') && !factoryLine(g)?.running) out.push({ text: 'Factory orders are waiting but the line is not working.', tab: 'factory', tone: 'neg' })
  for (const c of SUPPLY_CATS) if (g.supply.shockDays[c] > 0 && !(g.supply.locks[c] && g.supply.locks[c]!.until > g.day)) out.push({ text: `${SUPPLY_LABELS[c]} are in short supply (prices x${marketPrice(g.supply, c).toFixed(2)}).`, tab: 'factory', tone: 'warn' })
  for (const p of own) if (p.recall?.state === 'open') out.push({ text: `Faults in ${p.name} are spreading. Decide on a recall.`, tab: 'care', tone: 'neg', productId: p.id })
  const sealed = sealedRooms(g.office).length
  if (sealed) out.push({ text: `${sealed === 1 ? 'A room' : `${sealed} rooms`} on the campus ${sealed === 1 ? 'has' : 'have'} no door. Nothing inside counts.`, tab: 'office', tone: 'warn' })
  const loose = unmanaged(g)
  if (loose) out.push({ text: loose === 1 ? 'One person has no team lead and works at 90%.' : `${loose} people have no team lead and work at 90%.`, tab: 'staff', tone: 'accent' })
  if (g.stock.lowDays > 0) out.push({ text: 'The board has lost confidence in you.', tab: 'shares', tone: 'neg' })
  if (own.some((p) => p.status === 'sale') && REGIONS.filter((r) => g.regions[r.id].open).length === 1 && g.cash > 6e6) out.push({ text: 'You only sell at home. Other regions are waiting.', tab: 'world', tone: 'accent' })
  if (g.rdBudget > 0 && !g.activeResearch.length) out.push({ text: 'You have a research budget but no project running.', tab: 'research', tone: 'warn' })
  if (!g.rdBudget && own.length) out.push({ text: 'No research is funded. Rivals keep advancing.', tab: 'research', tone: 'accent' })
  return out
}

export function Dashboard() {
  const g = useGame()
  const { openDesigner, focus, setTab } = useStore.getState()
  const me = player(g)
  const trailing = trailingUnits(g)
  const total = trailing.reduce((a, t) => a + t.units, 0) || 1
  const units = trailing[0].units
  const last = g.reports[g.reports.length - 1]
  const profit = last ? last.revenue + last.other - monthCosts(last) : 0
  const products = mine(g).filter((p) => p.status !== 'ended')
  const list = todos(g)
  const fx = staffEffects(g)
  const goals = nextGoals(g, 3)
  const stage = stageOf(g)
  return (
    <div className="grid h-full min-h-0 grid-cols-12 grid-rows-[auto_auto_minmax(0,1fr)_minmax(0,1fr)] gap-2 p-2">
      <div className="col-span-12 grid grid-cols-5 gap-2">
        <Kpi label="Cash" value={g.config.unlimitedMoney ? 'UNLIMITED' : money(g.cash)} tone={g.cash < 0 && !g.config.unlimitedMoney ? 'neg' : 'accent'} sub={g.debtDays > 0 ? `in debt ${g.debtDays} days` : `this month +${money(g.cur.revenue + g.cur.other, 1)}`} />
        <Kpi label="Profit, last month" value={last ? money(profit) : '--'} tone={profit >= 0 ? 'pos' : 'neg'} sub={last ? `income ${money(last.revenue + last.other, 1)}` : 'first month in progress'} />
        <Kpi label="Market share" value={pct(units / total, 2)} sub={`${num(units)} of ${num(total)} devices in 12 months`} />
        <Kpi label="Fans" value={num(g.fans)} sub={`${num(g.owners)} people own your devices`} />
        <Kpi label={g.stock.listed ? 'Market value' : 'Company value'} value={marketCap(g) >= 1e9 ? `${(marketCap(g) / 1e9).toFixed(2)}B` : money(marketCap(g), 1)} sub={`you own ${pct(founderStake(g), 0)}${g.stock.listed ? ` / ${g.stock.price.toFixed(2)} a share` : ''}`} />
      </div>
      <div className="col-span-12 grid grid-cols-8 gap-1">
        <Mini label="Brand" value={Math.round(me.brand * 100)} />
        <Mini label="Awareness" value={pct(me.awareness)} />
        <Mini label="Devices on sale" value={products.filter((p) => p.status === 'sale').length} />
        <Mini label="In development" value={products.filter((p) => p.status === 'dev').length} />
        <Mini label="Staff" value={`${g.staff.length}${g.staff.length ? ` / morale ${Math.round(fx.morale)}` : ''}`} />
        <Mini label="Stores / regions" value={`${g.stores.length} / ${REGIONS.filter((r) => g.regions[r.id].open).length}`} />
        <Mini label="Industry level" value={marketLevel(g.day).toFixed(1)} />
        <Mini label="R&D / month" value={money(g.rdBudget, 1)} />
      </div>

      <Panel title="Needs attention" className="col-span-4" bodyClass="overflow-y-auto">
        {list.length === 0 && <Empty text="Nothing needs a decision right now." />}
        {list.map((t, i) => (
          <button key={i} onClick={() => (t.productId ? focus(t.productId) : setTab(t.tab))} className="flex w-full items-start gap-2 border-b border-line px-2 py-[7px] text-left hover:bg-hover">
            <span className={`mt-[5px] h-[6px] w-[6px] shrink-0 ${t.tone === 'neg' ? 'bg-neg' : t.tone === 'warn' ? 'bg-warn' : 'bg-accent'}`} />
            <span className="flex-1 text-[12px] leading-snug text-fg">{t.text}</span>
            <span className="num text-[9px] uppercase text-faint">{t.productId ? 'open' : t.tab}</span>
          </button>
        ))}
      </Panel>
      <Panel title="Income, costs and cash" className="col-span-4">
        <FinanceChart g={g} />
      </Panel>
      <Panel title="Market share by units" className="col-span-4">
        <ShareChart g={g} />
      </Panel>

      <Panel title="Your devices" right={<Btn small tone="primary" onClick={() => openDesigner()}>New device</Btn>} className="col-span-8" bodyClass="overflow-auto">
        {products.length === 0 ? (
          <Empty text="Design your first device to enter the market. Fourteen rivals are already selling.">
            <Btn tone="primary" className="h-11 px-8 text-sm" onClick={() => openDesigner()}>
              Design your first device
            </Btn>
          </Empty>
        ) : (
          <ProductTable g={g} rows={products} compact />
        )}
      </Panel>
      <Panel title={`Goals / ${stage.name}`} right={<Btn small tone="ghost" onClick={() => setTab('goals')}>All {stage.done}/{stage.total}</Btn>} className="col-span-4" bodyClass="overflow-y-auto px-2 py-1">
        {goals.map(({ goal, progress }) => (
          <button key={goal.id} onClick={() => setTab('goals')} className="block w-full py-[3px] text-left">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[11px] text-fg">{goal.name}</span>
              <span className="truncate text-[10px] text-faint">{goal.note}</span>
            </div>
            <Meter value={progress} tone={progress > 0.66 ? 'pos' : 'accent'} />
          </button>
        ))}
        <div className="mb-1 mt-2 flex items-center justify-between border-t border-line pt-1">
          <span className="label text-faint">Research</span>
          <button className="num text-[10px] text-faint hover:text-fg" onClick={() => setTab('research')}>
            OPEN
          </button>
        </div>
        {TRACKS.map((t) => (
          <div key={t} className="flex items-center gap-2 py-[3px]">
            <span className={`w-28 text-[11px] ${g.activeResearch.includes(t) ? 'text-accent' : 'text-dim'}`}>{TRACK_INFO[t].name}</span>
            <Meter value={g.levels[t] >= MAX_LEVEL ? 1 : (g.progress[t] ?? 0) / researchCost(g.levels[t] + 1)} tone={g.activeResearch.includes(t) ? 'accent' : 'dim'} />
            <span className="num w-8 text-right text-[11px] text-fg">L{g.levels[t]}</span>
          </div>
        ))}
      </Panel>
    </div>
  )
}

// ------------------------------------------------------------------ devices

function ProductTable({ g, rows, compact = false, showMaker = false, winRate }: { g: GameState; rows: Product[]; compact?: boolean; showMaker?: boolean; winRate?: Map<string, number> }) {
  const inspect = useStore((s) => s.inspect)
  const { focus } = useStore.getState()
  return (
    <table className="grid-table">
      <thead>
        <tr>
          <th />
          <th>Device</th>
          {showMaker && <th>Maker</th>}
          <th>Status</th>
          {!compact && <th>Segment</th>}
          <th className="r">Price</th>
          {!showMaker && <th className="r">Stock</th>}
          <th className="r">{showMaker ? 'Last month' : 'Sold'}</th>
          <th className="r">Review</th>
          {!compact && <th className="r">Design</th>}
          {winRate && <th className="r">Win rate</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const c = companyOf(g, p.companyId)
          return (
            <tr key={p.id} className={`row cursor-pointer ${inspect === p.id ? 'bg-accent/5' : ''}`} onClick={() => focus(p.id)}>
              <td className="w-10 !p-0">
                <Thumb product={p} className="h-10 w-9" />
              </td>
              <td className={inspect === p.id ? 'text-accent' : 'text-fg'}>
                {p.name}
                {!compact && <span className="ml-2 text-[10px] text-faint">{TYPES[p.type].name}</span>}
              </td>
              {showMaker && <td style={{ color: c.color }}>{c.name}</td>}
              <td>
                <Tag tone={statusTone(p)}>{statusText(p)}</Tag>
              </td>
              {!compact && <td className="text-dim">{p.segment ? segmentInfo(p.segment).name : '--'}</td>}
              <td className="num r text-fg">{money(p.price)}</td>
              {!showMaker && <td className={`num r ${p.stock <= 0 && p.status === 'sale' ? 'text-neg' : 'text-dim'}`}>{num(p.stock)}</td>}
              <td className="num r text-dim">{num(showMaker ? (p.history.at(-1) ?? p.monthUnits) : p.unitsSold)}</td>
              <td className="num r text-fg">{p.reviewAvg ? p.reviewAvg.toFixed(1) : '--'}</td>
              {!compact && <td className="num r text-dim">{Math.round(p.designPct)}</td>}
              {winRate && <td className="num r text-accent">{pct(winRate.get(p.id) ?? 0)}</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function Products() {
  const g = useGame()
  const { openDesigner } = useStore.getState()
  const [filter, setFilter] = useState<'active' | 'all' | DeviceType>('active')
  const [picking, setPicking] = useState(false)
  const all = mine(g)
  const rows = all.filter((p) => (filter === 'active' ? p.status !== 'ended' : filter === 'all' ? true : p.type === filter))
  // group variants under their family
  const families = [...new Set(rows.map((p) => p.family))]
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <Tabs
          value={filter}
          onChange={setFilter}
          // with eight device types, only the ones the company has made get a tab of their own
          options={[{ value: 'active', label: 'Current', badge: all.filter((p) => p.status !== 'ended').length }, { value: 'all', label: 'All', badge: all.length }, ...DEVICE_TYPES.filter((t) => t === filter || all.some((p) => p.type === t)).map((t) => ({ value: t, label: TYPES[t].plural, badge: all.filter((p) => p.type === t).length }))]}
          className="min-w-0 flex-1"
          fit
        />
        <div className="relative shrink-0">
          <Btn tone="primary" className="px-5" onClick={() => setPicking(!picking)}>
            New device
          </Btn>
          {picking && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setPicking(false)} />
              <div className="absolute right-0 top-full z-30 mt-1 w-64 border border-line2 bg-panel">
                <div className="label border-b border-line px-2 py-1 text-faint">What will it be?</div>
                {DEVICE_TYPES.map((t) => {
                  const open = hasType(g, t)
                  const blocked = open ? null : unlockBlocked(g, t)
                  return (
                    <button key={t} onClick={() => (setPicking(false), open ? openDesigner({ type: t }) : useStore.getState().setTab('research'))} className="flex w-full items-center justify-between border-b border-line px-2 py-[6px] text-left last:border-0 hover:bg-hover">
                      <span className={`text-[11px] uppercase tracking-wider ${open ? 'text-fg' : 'text-faint'}`}>{TYPES[t].name}</span>
                      <span className="num text-[10px] text-faint">
                        {open ? `${segmentsOf(t).length} markets / ${num(segmentsOf(t).reduce((a, s) => a + segmentDemand(s, g.day) * 360, 0))} a year` : blocked ? 'needs research' : `open for ${money(unlockCost(g, t), 1)}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
      <Panel className="flex-1" bodyClass="overflow-auto">
        {rows.length === 0 ? (
          <Empty text="No devices here yet. Press New device to choose a type and open the designer." />
        ) : (
          families.map((family) => {
            const group = rows.filter((p) => p.family === family)
            return (
              <div key={family}>
                <div className="flex items-center justify-between border-b border-line2 bg-raise px-2 py-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg">{family}</span>
                  <span className="num text-[10px] text-faint">
                    {group.length} {group.length === 1 ? 'model' : 'models'} / {num(group.reduce((a, p) => a + p.unitsSold, 0))} sold / {money(group.reduce((a, p) => a + p.revenue, 0), 1)}
                  </span>
                </div>
                <ProductTable g={g} rows={group} />
              </div>
            )
          })
        )}
      </Panel>
      <div className="shrink-0 text-[10px] text-faint">Click a device to open it. From there you can order production, change the price, or build a Pro, Lite, Max or successor on the same platform.</div>
    </div>
  )
}

// ------------------------------------------------------------------ market

export function Market() {
  const g = useGame()
  const [type, setType] = useState<DeviceType>('phone')
  const [seg, setSeg] = useState<string>('all')
  const segs = segmentsOf(type)
  const info = segs.find((s) => s.id === seg)
  const onSale = g.products.filter((p) => p.status === 'sale' && p.type === type)
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
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <Tabs fit value={type} onChange={(t) => (setType(t), setSeg('all'))} options={DEVICE_TYPES.map((t) => ({ value: t, label: TYPES[t].plural, badge: g.products.filter((p) => p.status === 'sale' && p.type === t).length }))} />
      <div className="grid shrink-0 gap-1" style={{ gridTemplateColumns: `repeat(${segs.length + 1}, minmax(0, 1fr))` }}>
        <button onClick={() => setSeg('all')} className={`border px-2 py-1 text-left ${seg === 'all' ? 'border-accent bg-accent/10' : 'border-line hover:border-line2'}`}>
          <div className="text-[11px] uppercase tracking-wider text-fg">All {TYPES[type].plural.toLowerCase()}</div>
          <div className="num text-[10px] text-faint">{num(segs.reduce((a, s) => a + segmentDemand(s, g.day) * 360, 0))} buyers / yr</div>
        </button>
        {segs.map((s) => (
          <button key={s.id} onClick={() => setSeg(s.id)} className={`border px-2 py-1 text-left ${seg === s.id ? 'border-accent bg-accent/10' : 'border-line hover:border-line2'}`}>
            <div className="truncate text-[11px] uppercase tracking-wider text-fg">{s.name}</div>
            <div className="num text-[10px] text-faint">
              {num(segmentDemand(s, g.day) * 360)} / yr at ~{money(s.priceRef)}
            </div>
          </button>
        ))}
      </div>
      <Panel title={info ? `${info.name}: who wins a buyer today` : `${TYPES[type].plural} on sale, by last month's sales`} className="flex-1" bodyClass="overflow-auto">
        <ProductTable g={g} rows={rows} showMaker winRate={info ? weights : undefined} />
      </Panel>
      <Fold title="Market share by units, all device types" open={false} bodyClass="h-52">
        <ShareChart g={g} />
      </Fold>
    </div>
  )
}

// ------------------------------------------------------------------ rivals

export function Rivals() {
  const g = useGame()
  const { act } = useStore.getState()
  const [companyId, setCompanyId] = useState('r0')
  const trailing = trailingUnits(g)
  const total = trailing.reduce((a, t) => a + t.units, 0) || 1
  const company = g.companies.find((c) => c.id === companyId) ?? g.companies[1]
  const products = g.products.filter((p) => p.companyId === company.id).sort((a, b) => b.launchDay - a.launchDay)
  const types = (ids: string[]) => [...new Set(ids.map((s) => TYPES[segmentInfo(s).type].plural))].join(', ')
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-2 p-2">
      <Panel title="Companies" bodyClass="overflow-auto">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Makes</th>
              <th className="r">Brand</th>
              <th className="r">Units 12 mo</th>
              <th className="r">Share</th>
            </tr>
          </thead>
          <tbody>
            {[...trailing].sort((a, b) => b.units - a.units).map(({ company: c, units }) => (
              <tr key={c.id} className={`row cursor-pointer ${c.id === company.id ? 'bg-accent/5' : ''}`} onClick={() => setCompanyId(c.id)}>
                <td className={c.alive ? 'text-fg' : 'text-faint line-through'}>
                  <span className="mr-2 inline-block h-2 w-2" style={{ background: c.color }} />
                  {c.name}
                  {c.isPlayer && <span className="ml-2"><Tag tone="accent">you</Tag></span>}
                </td>
                <td className="text-dim">{c.isPlayer ? '--' : types(c.segments)}</td>
                <td className="num r text-dim">{Math.round(c.brand * 100)}</td>
                <td className="num r text-dim">{num(units)}</td>
                <td className="num r text-fg">{pct(units / total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <div className="flex min-h-0 flex-col gap-2">
        <div className="grid shrink-0 grid-cols-4 gap-1">
          <Mini label="Awareness" value={pct(company.awareness, 0)} />
          <Mini label="Lifetime revenue" value={money(company.revenueTotal, 1)} />
          <Mini label="Software edge" value={`${company.software >= 0 ? '+' : ''}${pct(company.software)}`} />
          <Mini label="Status" value={company.alive ? 'Active' : 'Bankrupt'} tone={company.alive ? 'text-pos' : 'text-neg'} />
        </div>
        <Panel
          title={`${company.name}: devices`}
          right={
            !company.isPlayer && (
              <label className="flex items-center gap-2">
                <span className="label text-faint">Rename</span>
                <TextInput value={company.name} maxLength={18} onChange={(v) => act(() => void (company.name = v))} className="h-6 w-32" />
              </label>
            )
          }
          className="flex-1"
          bodyClass="overflow-auto"
        >
          {products.length ? <ProductTable g={g} rows={products} /> : <Empty text="This company has no devices." />}
        </Panel>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ finance

const COST_LABELS: Record<(typeof COST_KEYS)[number], string> = { production: 'Production', rd: 'R&D', marketing: 'Marketing', development: 'Development', overhead: 'Overhead', salaries: 'Salaries', facilities: 'Facilities', interest: 'Interest' }

export function Finance() {
  const g = useGame()
  const year = g.reports.slice(-12)
  const income = year.reduce((a, r) => a + r.revenue + r.other, 0)
  const costs = year.reduce((a, r) => a + monthCosts(r), 0)
  const stockValue = mine(g).filter((p) => p.status !== 'ended').reduce((a, p) => a + p.stock * p.unitCost, 0)
  const rows = [...g.reports].reverse().slice(0, 36)
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="grid shrink-0 grid-cols-4 gap-2">
        <Kpi label="Cash" value={g.config.unlimitedMoney ? 'UNLIMITED' : money(g.cash)} tone="accent" />
        <Kpi label="Income, 12 months" value={money(income)} sub={`of which licensing and services ${money(year.reduce((a, r) => a + r.other, 0), 1)}`} />
        <Kpi label="Costs, 12 months" value={money(costs)} />
        <Kpi label="Profit, 12 months" value={money(income - costs)} tone={income - costs >= 0 ? 'pos' : 'neg'} sub={`unsold stock at cost ${money(stockValue, 1)}`} />
      </div>
      <div className="grid shrink-0 grid-cols-8 gap-1">
        <Mini label="Shares and stakes, 12 mo" value={money(year.reduce((a, r) => a + (r.funding ?? 0), 0), 1)} />
        {COST_KEYS.map((k) => (
          <Mini key={k} label={`${COST_LABELS[k]}, 12 mo`} value={money(year.reduce((a, r) => a + r[k], 0), 1)} />
        ))}
      </div>
      <Panel title="Income, costs and cash, last 36 months" className="h-56 shrink-0">
        <FinanceChart g={g} months={36} />
      </Panel>
      <Panel title="Monthly statement" className="flex-1" bodyClass="overflow-auto">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Month</th>
              <th className="r">Units</th>
              <th className="r">Sales</th>
              <th className="r">Other income</th>
              {COST_KEYS.map((k) => (
                <th key={k} className="r">
                  {COST_LABELS[k]}
                </th>
              ))}
              <th className="r">Profit</th>
              <th className="r">Cash at close</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const profit = r.revenue + r.other - monthCosts(r)
              return (
                <tr key={r.month} className="row">
                  <td className="num text-fg">{monthLabel(r.month)}</td>
                  <td className="num r text-dim">{num(r.units)}</td>
                  <td className="num r text-fg">{money(r.revenue)}</td>
                  <td className="num r text-dim">{money(r.other)}</td>
                  {COST_KEYS.map((k) => (
                    <td key={k} className="num r text-faint">
                      {money(r[k])}
                    </td>
                  ))}
                  <td className={`num r ${profit >= 0 ? 'text-pos' : 'text-neg'}`}>{money(profit)}</td>
                  <td className="num r text-fg">{money(r.cash)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text="The first statement closes at the end of the month." />}
      </Panel>
    </div>
  )
}

export { SEGMENTS, fmtDate }
