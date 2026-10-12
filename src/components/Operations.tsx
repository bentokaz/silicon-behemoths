// Operations: the factory floor, production orders and component supply.
import { useState } from 'react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, YAxis } from 'recharts'
import { sfx } from '../audio/sfx'
import { SUPPLY_LABELS } from '../data/catalog'
import { TYPES } from '../data/devices'
import { autoLine, buildFactory, cancelOrder, fmtDate, lockSupply, roomCost, zoneable } from '../sim/game'
import { CONTRACT, FACTORY_SAVING, LOCK_DAYS, LOCK_FEE, buildCost, factoryLine, marketPrice, orderLeft } from '../sim/ops'
import { ITEMS, SITE_TIERS, starterLine, tierOf, upkeep } from '../sim/sites'
import { SUPPLY_CATS } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { SiteBuilder } from './SiteBuilder'
import { Icon, type IconName, supplyIcon, typeIcon } from './icons'
import { Btn, ConfirmIconBtn, Empty, Fold, Kpi, Lead, Meter, Mini, Panel, Tabs, Tag, Th, money, num, pct, pressable, useKept } from './ui'

type View = 'floor' | 'orders' | 'supply'

function Orders() {
  const g = useGame()
  const { act, focus, say } = useStore.getState()
  const line = factoryLine(g)
  if (!g.orders.length) return <Empty icon="package" text="No production runs are in progress. Open a device and order a run from its Manage tab, or set one up when you launch." />
  return (
    <table className="grid-table">
      <thead>
        <tr>
          <Th icon="devices">Device</Th>
          <Th icon="truck">Route</Th>
          <Th icon="gauge" className="w-64">
            Progress
          </Th>
          <Th icon="package" r>
            Built
          </Th>
          <Th icon="tag" r>
            Cost each
          </Th>
          <Th icon="cash" r>
            Left to pay
          </Th>
          <Th icon="info">Status</Th>
          <th />
        </tr>
      </thead>
      <tbody>
        {g.orders.map((o) => {
          const p = g.products.find((x) => x.id === o.productId)
          if (!p) return null
          const each = buildCost(g, p, o.mode)
          const waiting = o.mode === 'contract' ? Math.max(0, CONTRACT.leadDays - (g.day - o.placedDay)) : 0
          const stalled = o.mode === 'factory' && !line?.running
          return (
            <tr key={o.id} className="row cursor-pointer" {...pressable(() => focus(p.id))}>
              <td className="text-fg">
                <Lead icon={typeIcon(p.type)} size={12} />
                {p.name}
              </td>
              <td className="text-dim">
                <Lead icon={o.mode === 'contract' ? 'doc' : 'factory'} />
                {o.mode === 'contract' ? 'Contract maker' : 'Own factory'}
              </td>
              <td>
                <Meter value={o.done} max={o.quantity} tone={stalled ? 'neg' : 'accent'} />
              </td>
              <td className="num r text-fg">
                {num(o.done)} / {num(o.quantity)}
              </td>
              <td className="num r text-dim">{money(each)}</td>
              <td className="num r text-dim">{money(orderLeft(o) * each, 1)}</td>
              <td>{stalled ? <Tag tone="neg" icon="alert">line down</Tag> : waiting ? <Tag tone="warn" icon="hourglass">starts in {waiting}d</Tag> : <Tag tone="pos" icon="build">building</Tag>}</td>
              <td className="r">
                <ConfirmIconBtn icon="close" title="Cancel the units not yet built" onClick={(e) => (e.stopPropagation(), act((s) => cancelOrder(s, o.id)), say(`The rest of the ${p.name} run is cancelled.`))} onKeyDown={(e) => e.stopPropagation()} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Supply() {
  const g = useGame()
  const { act, say } = useStore.getState()
  return (
    <div className="grid grid-cols-5 gap-2 p-2">
      {SUPPLY_CATS.map((c) => {
        const price = marketPrice(g.supply, c)
        const lock = g.supply.locks[c]
        const locked = lock && lock.until > g.day
        const short = g.supply.shockDays[c] > 0
        const data = [...g.supply.history[c], price].map((v, i) => ({ i, v }))
        return (
          <div key={c} className="border border-line bg-panel p-2">
            <div className="flex items-center justify-between">
              <span className="flex min-w-0 items-center gap-[6px] text-[11px] font-semibold uppercase tracking-[0.12em] text-fg">
                <Icon name={supplyIcon(c)} size={13} className="text-dim" />
                <span className="truncate">{SUPPLY_LABELS[c]}</span>
              </span>
              {short ? <Tag tone="neg" icon="alert">shortage</Tag> : price > 1.08 ? <Tag tone="warn" icon="trendUp">dear</Tag> : price < 0.94 ? <Tag tone="pos" icon="trendDown">cheap</Tag> : <Tag>normal</Tag>}
            </div>
            <div className={`num mt-2 text-2xl font-semibold leading-none ${price > 1.15 ? 'text-neg' : price > 1.05 ? 'text-warn' : 'text-fg'}`}>x{price.toFixed(2)}</div>
            <div className="num mt-1 text-[10px] text-faint">market price against normal</div>
            <div className="mt-2 h-16">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
                  <YAxis hide domain={[0.75, 1.8]} />
                  <ReferenceLine y={1} stroke="var(--color-line2)" strokeDasharray="2 3" />
                  <Line dataKey="v" stroke={short ? 'var(--color-neg)' : 'var(--color-accent)'} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {locked ? (
              <div className="mt-2 border border-accent px-2 py-1 text-[11px] text-accent">
                <Lead icon="lock" />
                Fixed at x{lock.value.toFixed(2)} until {fmtDate(lock.until)}
              </div>
            ) : (
              <Btn
                small
                icon="lock"
                className="mt-2 w-full"
                onClick={() => {
                  const err = act((s) => lockSupply(s, c))
                  if (err) say(err, 'bad')
                  else (sfx.confirm(), say(`${SUPPLY_LABELS[c]} fixed at x${price.toFixed(2)} for a year.`))
                }}
              >
                Fix this price ({money(LOCK_FEE, 0)})
              </Btn>
            )}
          </div>
        )
      })}
      <div className="col-span-5 text-[11px] leading-snug text-dim">
        Component prices drift, and now and then a shortage pushes one category up for months. A fixed-price contract holds today's price for {LOCK_DAYS} days, whatever the market does. It is worth buying while prices are normal, not after they have risen.
      </div>
    </div>
  )
}

export function FactoryScreen() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const [view, setView] = useKept<View>('factory:view', () => (g.factory ? 'floor' : 'orders'))
  const line = factoryLine(g)
  const next = SITE_TIERS.factory[g.factory ? g.factory.tier + 1 : 0]
  const factoryOrders = g.orders.filter((o) => o.mode === 'factory')
  const queued = factoryOrders.reduce((a, o) => a + orderLeft(o) * TYPES[g.products.find((p) => p.id === o.productId)?.type ?? 'phone'].capacity, 0)
  const build = () => {
    const err = act((s) => buildFactory(s))
    if (err) say(err, 'bad')
    else (sfx.confirm(), setView('floor'))
  }
  const plan = g.factory ? starterLine(g.factory) : null
  const starterCost = plan && g.factory ? plan.items.reduce((a, p) => a + ITEMS.factory[p.kind].cost, 0) + roomCost(g.factory, 'hall', zoneable(g.factory, ...plan.hall, 'rect').length) : 0
  const stages: [string, number][] = line ? [['Board assembly', line.caps.smt], ['Device assembly', line.caps.assembly], ['Packaging', line.caps.pack], ['Testing', line.caps.test]] : []
  const stageIcon: Record<string, IconName> = { 'Board assembly': 'chip', 'Device assembly': 'build', Packaging: 'package', Testing: 'check' }
  const peak = Math.max(1, ...stages.map((s) => s[1]))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-panel pr-2">
        <Tabs value={view} onChange={setView} options={[{ value: 'floor', label: 'Factory floor', icon: 'factory' }, { value: 'orders', label: 'Production orders', icon: 'package', badge: g.orders.length }, { value: 'supply', label: 'Component supply', icon: 'truck', badge: SUPPLY_CATS.filter((c) => g.supply.shockDays[c] > 0).length || undefined }]} className="border-b-0" />
        <span className="num text-[10px] text-faint">
          contract maker +{pct(CONTRACT.premium - 1, 0)} / own factory -{pct(1 - FACTORY_SAVING, 0)} on unit cost
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {view === 'orders' && (
          <div className="h-full overflow-auto p-2">
            <Panel bodyClass="overflow-auto">
              <Orders />
            </Panel>
          </div>
        )}
        {view === 'supply' && (
          <div className="h-full overflow-auto">
            <Supply />
          </div>
        )}
        {view === 'floor' &&
          (!g.factory ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="w-[560px] border border-line bg-panel p-5">
                <div className="flex items-center gap-3 text-lg font-semibold uppercase tracking-[0.14em] text-fg">
                  <Icon name="factory" size={20} className="text-accent" />
                  You do not own a factory
                </div>
                <div className="mt-2 text-[12px] leading-relaxed text-dim">
                  A contract manufacturer builds your devices for a {pct(CONTRACT.premium - 1, 0)} margin, after a {CONTRACT.leadDays}-day wait, with {pct(CONTRACT.defectRate)} arriving faulty. Your own factory builds at cost less {pct(1 - FACTORY_SAVING, 0)}, starts the same day, and ships fewer faults if you add test stations. You lay out the line yourself: docks, conveyors and machines.
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1">
                  <Mini label={next.name} icon="cash" value={money(next.cost, 1)} tone="text-fg" />
                  <Mini label="Floor" icon="plot" value={`${next.w} x ${next.h} m`} />
                  <Mini label="Upkeep / month" icon="receipt" value={money(next.rent, 1)} />
                </div>
                <Btn tone="primary" icon="build" className="mt-4 h-10 w-full" onClick={build}>
                  Build a {next.name.toLowerCase()} for {money(next.cost, 1)}
                </Btn>
              </div>
            </div>
          ) : (
            <SiteBuilder siteRef="factory" site={g.factory} busy={Math.min(1, g.products.filter((p) => p.companyId === 'player').reduce((a, p) => a + p.stock, 0) / 150e3)} line={line} producing={factoryOrders.length > 0}>
              <Fold title="Line" icon="factory" right={line?.running ? <Tag tone="pos" icon="check">ready</Tag> : <Tag tone="neg" icon="alert">down</Tag>} bodyClass="p-2">
                {line?.running ? (
                  <div className="grid grid-cols-2 gap-1">
                    <Mini label="Output / day" icon="gauge" value={num(line.throughput)} tone="text-fg" />
                    <Mini label="Faults" icon="alert" value={pct(line.defectRate)} tone={line.defectRate > 0.03 ? 'text-warn' : 'text-pos'} />
                    <Mini label="Running cost / day" icon="receipt" value={money(line.runCost)} />
                    <Mini label="Work queued" icon="hourglass" value={queued ? `${Math.ceil(queued / line.throughput)} days` : 'none'} />
                  </div>
                ) : (
                  <div className="text-[11px] leading-snug text-warn">{line?.problem}</div>
                )}
                {stages.some((s) => s[1] > 0) && (
                  <div className="mt-2">
                    {stages.map(([name, cap]) => (
                      <div key={name} className="flex items-center gap-2 py-[2px]">
                        <span className="w-28 whitespace-nowrap text-[11px] text-dim">
                          <Lead icon={stageIcon[name]} />
                          {name}
                        </span>
                        <Meter value={cap} max={peak} tone={line?.running && cap === line.throughput && name !== 'Testing' ? 'warn' : 'accent'} />
                        <span className="num w-10 text-right text-[10px] text-fg">{cap}</span>
                      </div>
                    ))}
                    <div className="mt-1 text-[10px] leading-snug text-faint">Output is set by the slowest of the first three. Testing only lowers the fault rate.</div>
                  </div>
                )}
                {starterCost > 0 && !line?.running && (
                  <Btn
                    small
                    tone="primary"
                    icon="build"
                    className="mt-2 w-full"
                    onClick={() => {
                      const err = act((s) => autoLine(s))
                      if (err) say(err, 'bad')
                      else sfx.confirm()
                    }}
                  >
                    Lay a starter line ({money(starterCost, 1)})
                  </Btn>
                )}
              </Fold>
              <Fold title="Factory" icon="campus" open={false} bodyClass="p-2">
                <div className="grid grid-cols-2 gap-1">
                  <Mini label="Size" icon="plot" value={tierOf(g.factory).name} tone="text-fg" />
                  <Mini label="Upkeep / month" icon="receipt" value={money(upkeep(g.factory), 1)} />
                </div>
                {next ? (
                  <Btn small icon="plot" className="mt-2 w-full" onClick={build}>
                    Expand to {next.name.toLowerCase()} ({money(next.cost, 1)})
                  </Btn>
                ) : (
                  <div className="mt-2 text-[11px] text-dim">This is the largest factory.</div>
                )}
              </Fold>
              <Fold title="How lines work" icon="info" open={false} bodyClass="p-2 text-[11px] leading-snug text-dim">
                A line runs from a receiving dock to a shipping dock. Everything touching it, directly or through conveyors, is part of it. It needs board assembly, device assembly and packaging. Add more of the slowest stage to raise output, and test stations to cut faults.
              </Fold>
            </SiteBuilder>
          ))}
      </div>
    </div>
  )
}

export { Kpi }
