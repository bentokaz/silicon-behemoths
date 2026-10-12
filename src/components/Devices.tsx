// Split out of Screens.tsx for the interface redesign.
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MAX_LEVEL, SUPPLY_LABELS, TRACK_INFO, marketLevel, researchCost } from '../data/catalog'
import { SEGMENTS, TYPES, segmentInfo, segmentsOf } from '../data/devices'
import { companyOf, fmtDate, monthLabel, player, trailingUnits } from '../sim/game'
import { OUTSIDE_OPTION, attraction, segmentDemand } from '../sim/market'
import { factoryLine, marketPrice, pendingUnits } from '../sim/ops'
import { nextGoals, stageOf } from '../sim/goals'
import { type CapId, capOfTab, guided, has, lockTip, needText, nextCaps } from '../sim/progress'
import { REGIONS } from '../sim/regions'
import { sealedRooms } from '../sim/sites'
import { staffEffects, unmanaged } from '../sim/staff'
import { founderStake, marketCap } from '../sim/stock'
import { COST_KEYS, DEVICE_TYPES, type DeviceType, type GameState, type Product, SUPPLY_CATS, TRACKS, monthCosts } from '../sim/types'
import { hasType, unlockBlocked, unlockCost } from '../sim/world'
import { type Tab, useGame, useStore } from '../store/game'
import { goStep, guideStep } from './Guide'
import { Thumb, statusIcon, statusText, statusTone } from './Inspector'
import { COST_ICON, Icon, type IconName, TAB_ICON, trackIcon, typeIcon } from './icons'
import { Btn, Empty, Fold, Head, IconBtn, Kpi, Lead, Meter, Mini, NameInput, Panel, Tabs, Tag, Th, chart, money, num, pct, pressable, useKept, useLayer } from './ui'

// ------------------------------------------------------------------ devices

import { ShareChart } from './Overview'

const mine = (g: GameState) => g.products.filter((p) => p.companyId === 'player').sort((a, b) => b.launchDay - a.launchDay)

export function ProductTable({ g, rows, compact = false, showMaker = false, winRate }: { g: GameState; rows: Product[]; compact?: boolean; showMaker?: boolean; winRate?: Map<string, number> }) {
  const inspect = useStore((s) => s.inspect)
  const { focus } = useStore.getState()
  // what is in the warehouse is only known, and only matters, for the company's own devices
  const showStock = !showMaker && rows.some((p) => p.companyId === 'player')
  return (
    <table className="grid-table">
      <thead>
        <tr>
          <th />
          <Th iconClass="@max-[720px]:hidden" icon="devices">Device</Th>
          {showMaker && <Th iconClass="@max-[720px]:hidden" icon="campus">Maker</Th>}
          <Th iconClass="@max-[720px]:hidden" icon="info">Status</Th>
          {!compact && <Th className="@max-[590px]:hidden" iconClass="@max-[720px]:hidden" icon="target">Segment</Th>}
          <Th iconClass="@max-[720px]:hidden" icon="tag" r>
            Price
          </Th>
          {showStock && (
            <Th iconClass="@max-[720px]:hidden" icon="warehouse" r>
              Stock
            </Th>
          )}
          <Th iconClass="@max-[720px]:hidden" icon="package" r>
            {showMaker ? 'Last month' : 'Sold'}
          </Th>
          <Th iconClass="@max-[720px]:hidden" icon="star" r>
            Review
          </Th>
          {!compact && (
            <Th className="@max-[510px]:hidden" iconClass="@max-[720px]:hidden" icon="design" r>
              Design
            </Th>
          )}
          {winRate && (
            <Th iconClass="@max-[720px]:hidden" icon="percent" r>
              Win rate
            </Th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const c = companyOf(g, p.companyId)
          return (
            <tr key={p.id} data-coach-target={c.isPlayer ? 'device' : undefined} className={`row cursor-pointer ${inspect === p.id ? 'bg-accent/5' : ''}`} {...pressable(() => focus(p.id))}>
              <td className="w-10 !p-0">
                <Thumb product={p} className="h-10 w-9" />
              </td>
              <td className={`clip ${inspect === p.id ? 'text-accent' : 'text-fg'}`} title={p.name}>
                {p.name}
                {!compact && (
                  <span className="ml-2 text-faint" title={TYPES[p.type].name}>
                    <Icon name={typeIcon(p.type)} size={12} className="inline-block" style={{ verticalAlign: -2 }} />
                  </span>
                )}
              </td>
              {showMaker && <td style={{ color: c.color }}>{c.name}</td>}
              <td>
                <Tag tone={statusTone(p)} icon={statusIcon(p)}>
                  {statusText(p)}
                </Tag>
              </td>
              {!compact && (
                <td className="clip text-dim @max-[590px]:hidden" title={p.segment ? segmentInfo(p.segment).name : undefined}>
                  {p.segment ? segmentInfo(p.segment).name : "--"}
                </td>
              )}
              <td className="num r text-fg">{money(p.price)}</td>
              {showStock && <td className={`num r ${p.stock <= 0 && p.status === 'sale' ? 'text-neg' : 'text-dim'}`}>{num(p.stock)}</td>}
              <td className="num r text-dim">{num(showMaker ? (p.history.at(-1) ?? p.monthUnits) : p.unitsSold)}</td>
              <td className="num r text-fg">{p.reviewAvg ? p.reviewAvg.toFixed(1) : '--'}</td>
              {!compact && <td className="num r text-dim @max-[510px]:hidden">{Math.round(p.designPct)}</td>}
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
  const [filter, setFilter] = useKept<"active" | "all" | DeviceType>("products:filter", "active")
  const [picking, setPicking] = useState(false)
  useLayer(picking, () => setPicking(false))
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
          options={[{ value: 'active', label: 'Current', icon: 'check' as const, badge: all.filter((p) => p.status !== 'ended').length }, { value: 'all', label: 'All', icon: 'layers' as const, badge: all.length }, ...DEVICE_TYPES.filter((t) => t === filter || all.some((p) => p.type === t)).map((t) => ({ value: t, label: TYPES[t].plural, icon: typeIcon(t), badge: all.filter((p) => p.type === t).length }))]}
          className="min-w-0 flex-1"
          fit
        />
        <div className="relative shrink-0">
          <Btn tone="primary" icon="plus" className="px-5" data-coach-target="new-device" aria-haspopup="menu" aria-expanded={picking} onClick={() => setPicking(!picking)}>
            New device
          </Btn>
          {picking && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setPicking(false)} />
              <div data-coach-target="new-device" className="absolute right-0 top-full z-30 mt-1 w-64 border border-line2 bg-panel">
                <div className="label border-b border-line px-2 py-1 text-faint">What will it be?</div>
                {DEVICE_TYPES.map((t) => {
                  const open = hasType(g, t)
                  const blocked = open ? null : unlockBlocked(g, t)
                  return (
                    <button key={t} onClick={() => (setPicking(false), open ? openDesigner({ type: t }) : useStore.getState().setTab('research'))} className="flex w-full items-center justify-between border-b border-line px-2 py-[6px] text-left last:border-0 hover:bg-hover">
                      <span className={`flex items-center gap-[7px] text-[11px] ${open ? 'text-fg' : 'text-faint'}`}>
                        <Icon name={open ? typeIcon(t) : 'lock'} size={13} className={open ? 'text-accent' : 'text-faint'} />
                        {TYPES[t].name}
                      </span>
                      <span className="num text-[11px] text-faint">
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
      <Panel className="flex-1" bodyClass="@container overflow-auto" keep={`products:${filter}`}>
        {rows.length === 0 ? (
          <Empty icon="devices" text={all.length ? 'No devices under this heading. Choose Current or All above, or press New device.' : 'No devices here yet. Press New device to choose a type and open the designer.'} />
        ) : (
          families.map((family) => {
            const group = rows.filter((p) => p.family === family)
            return (
              <div key={family}>
                <div className="flex items-center justify-between border-b border-line2 bg-raise px-2 py-1">
                  <span className="text-[11px] font-semibold text-fg">{family}</span>
                  <span className="num text-[11px] text-faint">
                    {group.length} {group.length === 1 ? 'model' : 'models'} / {num(group.reduce((a, p) => a + p.unitsSold, 0))} sold / {money(group.reduce((a, p) => a + p.revenue, 0), 1)}
                  </span>
                </div>
                <ProductTable g={g} rows={group} />
              </div>
            )
          })
        )}
      </Panel>
      <div className="shrink-0 text-[11px] text-faint">Click a device to open it. From there you can order production, change the price, or build a Pro, Lite, Max or successor on the same platform.</div>
    </div>
  )
}

// ------------------------------------------------------------------ market

export function Market() {
  const g = useGame()
  const [type, setType] = useKept<DeviceType>("market:type", () => g.products.find((p) => p.companyId === "player" && p.status !== "ended")?.type ?? g.types?.[0] ?? "phone")
  const [seg, setSeg] = useKept<string>("market:seg", "all")
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
      <Tabs fit value={type} onChange={(t) => (setType(t), setSeg('all'))} options={DEVICE_TYPES.map((t) => ({ value: t, label: TYPES[t].plural, icon: typeIcon(t), badge: g.products.filter((p) => p.status === 'sale' && p.type === t).length }))} />
      <div className="grid shrink-0 gap-1" style={{ gridTemplateColumns: `repeat(${segs.length + 1}, minmax(0, 1fr))` }}>
        <button onClick={() => setSeg('all')} className={`border px-2 py-1 text-left ${seg === 'all' ? 'border-accent bg-accent/10' : 'border-line hover:border-line2'}`}>
          <div className="text-[11px] text-fg">All {TYPES[type].plural.toLowerCase()}</div>
          <div className="num text-[11px] text-faint">{num(segs.reduce((a, s) => a + segmentDemand(s, g.day) * 360, 0))} buyers / yr</div>
        </button>
        {segs.map((s) => (
          <button key={s.id} onClick={() => setSeg(s.id)} className={`border px-2 py-1 text-left ${seg === s.id ? 'border-accent bg-accent/10' : 'border-line hover:border-line2'}`}>
            <div className="truncate text-[11px] text-fg">{s.name}</div>
            <div className="num text-[11px] text-faint">
              {num(segmentDemand(s, g.day) * 360)} / yr at ~{money(s.priceRef)}
            </div>
          </button>
        ))}
      </div>
      <Panel title={info ? `${info.name}: who wins a buyer today` : `${TYPES[type].plural} on sale, by last month's sales`} icon={typeIcon(type)} className="flex-1" bodyClass="@container overflow-auto">
        <ProductTable g={g} rows={rows} showMaker winRate={info ? weights : undefined} />
      </Panel>
      <Fold title="Market share by units, all device types" icon="pie" open={false} bodyClass="h-52">
        <ShareChart g={g} />
      </Fold>
    </div>
  )
}

// ------------------------------------------------------------------ rivals

export function Rivals() {
  const g = useGame()
  const { act } = useStore.getState()
  const [companyId, setCompanyId] = useKept("rivals:company", "r0")
  const trailing = trailingUnits(g)
  const total = trailing.reduce((a, t) => a + t.units, 0) || 1
  const company = g.companies.find((c) => c.id === companyId) ?? g.companies[1]
  const products = g.products.filter((p) => p.companyId === company.id).sort((a, b) => b.launchDay - a.launchDay)
  const types = (ids: string[]) => [...new Set(ids.map((s) => segmentInfo(s).type))]
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-2 p-2">
      <Panel title="Companies" icon="rivals" bodyClass="@container overflow-auto">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Company</th>
              <th className="@max-[350px]:hidden">Makes</th>
              <th className="r @max-[450px]:hidden">Brand</th>
              <th className="r">Units 12 mo</th>
              <th className="r">Share</th>
            </tr>
          </thead>
          <tbody>
            {[...trailing].sort((a, b) => b.units - a.units).map(({ company: c, units }) => (
              <tr key={c.id} className={`row cursor-pointer ${c.id === company.id ? 'bg-accent/5' : ''}`} {...pressable(() => setCompanyId(c.id))}>
                <td className={c.alive ? 'text-fg' : 'text-faint line-through'}>
                  <span className="mr-2 inline-block h-2 w-2" style={{ background: c.color }} />
                  {c.name}
                  {c.isPlayer && <span className="ml-2"><Tag tone="accent" icon="person">you</Tag></span>}
                </td>
                <td className="text-dim @max-[470px]:max-w-[7.5rem] @max-[470px]:whitespace-normal @max-[350px]:hidden">
                  {c.isPlayer
                    ? '--'
                    : types(c.segments).map((t) => (
                        <span key={t} title={TYPES[t].plural} className="mr-[3px] inline-block">
                          <Icon name={typeIcon(t)} size={13} className="inline-block" style={{ verticalAlign: -3 }} />
                        </span>
                      ))}
                </td>
                <td className="num r text-dim @max-[450px]:hidden">{Math.round(c.brand * 100)}</td>
                <td className="num r text-dim">{num(units)}</td>
                <td className="num r text-fg">{pct(units / total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <div className="flex min-h-0 flex-col gap-2">
        <div className="grid shrink-0 grid-cols-4 gap-1">
          <Mini label="Awareness" icon="eye" value={pct(company.awareness, 0)} />
          <Mini label="Lifetime revenue" icon="coins" value={money(company.revenueTotal, 1)} />
          <Mini label="Software edge" icon="code" value={`${company.software >= 0 ? '+' : ''}${pct(company.software)}`} />
          <Mini label="Status" icon="info" value={company.alive ? 'Active' : 'Bankrupt'} tone={company.alive ? 'text-pos' : 'text-neg'} />
        </div>
        <Panel
          title={`${company.name}: devices`}
          icon="devices"
          right={
            !company.isPlayer && (
              <label className="flex shrink-0 items-center gap-2" title="Rename this company">
                <Icon name="edit" size={12} className="text-faint" />
                <NameInput aria-label={`Rename ${company.name}`} value={company.name} maxLength={18} onChange={(v) => act(() => void (company.name = v))} className="h-6 w-32" />
              </label>
            )
          }
          className="flex-1"
          bodyClass="@container overflow-auto"
        >
          {products.length ? <ProductTable g={g} rows={products} /> : <Empty icon="devices" text="This company has no devices." />}
        </Panel>
      </div>
    </div>
  )
}
