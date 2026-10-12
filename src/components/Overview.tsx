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

import { ProductTable } from './Devices'

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

export function ShareChart({ g }: { g: GameState }) {
  const { data, ids } = shareSeries(g)
  if (data.length < 2) return <Empty icon="pie" text="Market share appears after the first two months." />
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

export function FinanceChart({ g, months = 24 }: { g: GameState; months?: number }) {
  const data = g.reports.slice(-months).map((r) => ({ month: monthLabel(r.month), Income: Math.round(r.revenue + r.other), Costs: Math.round(monthCosts(r)), Cash: Math.round(r.cash) }))
  if (data.length < 2) return <Empty icon="chart" text="Monthly figures appear after the first two months." />
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

/**
 * In a guided game, while the charts have nothing to draw from: the step the
 * guide is on, and the parts of the company nearest to opening. It takes the
 * place the charts will have.
 */
function NextSteps({ g }: { g: GameState }) {
  const { go, showLock } = useStore.getState()
  const step = guideStep(g)
  const next = nextCaps(g, 3)
  return (
    <>
      {step && (
        <div className="border-b border-line px-2 py-2">
          <div className="flex items-center justify-between gap-2">
            <Head icon="goals" className="min-w-0 flex-1 text-accent">
              Guide / {step.title}
            </Head>
            <Btn small tone="primary" icon="arrowRight" className="shrink-0 whitespace-nowrap" onClick={() => goStep(step)}>
              {step.designer ? 'New device' : 'Take me there'}
            </Btn>
          </div>
          <div className="mt-1 line-clamp-3 text-[11px] leading-snug text-dim" title={step.text}>
            {step.text}
          </div>
        </div>
      )}
      <div className="label px-2 pb-[2px] pt-2 text-faint">Opens next</div>
      {next.map(({ cap, ratio }) => (
        <button key={cap.id} onClick={() => showLock(cap.id)} title={lockTip(g, cap.id) ?? undefined} className="flex w-full items-start gap-2 border-b border-line px-2 py-[6px] text-left last:border-0 hover:bg-hover">
          <Icon name={cap.icon as IconName} size={14} className="mt-[2px] shrink-0 text-dim" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[11px] font-semibold text-fg">{cap.name}</span>
              <span className="num shrink-0 text-[11px] text-faint">{pct(ratio, 0)}</span>
            </span>
            <span className="block truncate text-[11px] text-dim">To open it: {needText(g, cap.id)}.</span>
            <Meter value={ratio} className="mt-[3px]" />
          </span>
        </button>
      ))}
      {!next.length && <Empty icon="check" text="Every part of the company is open." />}
      <button onClick={() => go({ tab: 'goals', view: 'growth' })} className="flex h-7 w-full items-center justify-between border-t border-line px-2 text-[11px] text-dim hover:bg-hover hover:text-accent">
        Everything the company can grow into
        <Icon name="branch" size={11} />
      </button>
    </>
  )
}

/** Three, four or five figures across, whatever is shown. */
const cols = (n: number) => ({ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` })
const SPAN: Record<number, string> = { 1: 'col-span-12', 2: 'col-span-6', 3: 'col-span-4' }

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
  // The overview only reports on what the company has: a figure or a panel
  // for a part that is not open yet is left out. Outside a guided game
  // everything is open, so everything is here.
  const open = (id: CapId) => has(g, id)
  // a warning that leads to a screen not open yet is kept only when it is serious
  const list = todos(g).filter((t) => {
    const cap = capOfTab(t.tab)
    return !cap || open(cap) || t.tone === 'neg'
  })
  const fx = staffEffects(g)
  const goals = nextGoals(g, 3)
  const stage = stageOf(g)
  const kpis = [
    <Kpi key="cash" label="Cash" icon="cash" value={g.config.unlimitedMoney ? 'UNLIMITED' : money(g.cash)} tone={g.cash < 0 && !g.config.unlimitedMoney ? 'neg' : 'accent'} sub={g.debtDays > 0 ? `in debt ${g.debtDays} days` : `this month +${money(g.cur.revenue + g.cur.other, 1)}`} />,
    <Kpi key="profit" label="Profit, last month" icon={profit >= 0 ? 'trendUp' : 'trendDown'} value={last ? money(profit) : '--'} tone={profit >= 0 ? 'pos' : 'neg'} sub={last ? `income ${money(last.revenue + last.other, 1)}` : 'first month in progress'} />,
    open('market') && <Kpi key="share" label="Market share" icon="pie" value={pct(units / total, 2)} sub={`${num(units)} of ${num(total)} devices in 12 months`} />,
    <Kpi key="fans" label="Fans" icon="heart" value={num(g.fans)} sub={`${num(g.owners)} people own your devices`} />,
    open('shares') && <Kpi key="value" label={g.stock.listed ? 'Market value' : 'Company value'} icon="chart" value={money(marketCap(g), 1)} sub={`you own ${pct(founderStake(g), 0)}${g.stock.listed ? ` / $${g.stock.price.toFixed(2)} a share` : ''}`} />,
  ].filter(Boolean)
  const minis = [
    open('marketing') && <Mini key="brand" label="Brand" icon="brand" value={Math.round(me.brand * 100)} />,
    open('marketing') && <Mini key="aware" label="Awareness" icon="eye" value={pct(me.awareness)} />,
    <Mini key="sale" label="Devices on sale" icon="devices" value={products.filter((p) => p.status === 'sale').length} />,
    <Mini key="dev" label="In development" icon="hourglass" value={products.filter((p) => p.status === 'dev').length} />,
    <Mini key="staff" label="Staff" icon="staff" value={`${g.staff.length}${g.staff.length ? ` / morale ${Math.round(fx.morale)}` : ''}`} />,
    (open('stores') || open('world')) && <Mini key="reach" label="Stores / regions" icon="stores" value={`${g.stores.length} / ${REGIONS.filter((r) => g.regions[r.id].open).length}`} />,
    open('market') && <Mini key="level" label="Industry level" icon="rivals" value={marketLevel(g.day).toFixed(1)} />,
    open('research') && <Mini key="rd" label="R&D / month" icon="research" value={money(g.rdBudget, 1)} />,
  ].filter(Boolean)
  // the middle row: what needs a decision, then the charts that have a source, and the way forward while one is missing
  const showNext = guided(g) && !(open('finance') && open('market'))
  const span = SPAN[1 + (open('finance') ? 1 : 0) + (open('market') ? 1 : 0) + (showNext ? 1 : 0)] ?? 'col-span-4'
  return (
    <div className="grid h-full min-h-0 grid-cols-12 grid-rows-[auto_auto_minmax(0,1fr)_minmax(0,1fr)] gap-2 p-2">
      <div className="col-span-12 grid gap-2" style={cols(kpis.length)}>
        {kpis}
      </div>
      <div className="col-span-12 grid gap-1" style={cols(minis.length)}>
        {minis}
      </div>

      <Panel title="Needs attention" icon="alert" className={span} bodyClass="overflow-y-auto">
        {list.length === 0 && <Empty icon="check" text="Nothing needs a decision right now." />}
        {list.map((t, i) => (
          <button key={i} onClick={() => (t.productId ? focus(t.productId) : setTab(t.tab))} className="flex w-full items-start gap-2 border-b border-line px-2 py-[7px] text-left hover:bg-hover">
            <Icon name={TAB_ICON[t.tab] ?? 'alert'} size={13} className={`mt-[2px] ${t.tone === 'neg' ? 'text-neg' : t.tone === 'warn' ? 'text-warn' : 'text-accent'}`} />
            <span className="flex-1 text-[12px] leading-snug text-fg">{t.text}</span>
            <Icon name="arrowRight" size={11} className="mt-[3px] text-faint" />
          </button>
        ))}
      </Panel>
      {open('finance') && (
        <Panel title="Income, costs and cash" icon="chart" className={span}>
          <FinanceChart g={g} />
        </Panel>
      )}
      {open('market') && (
        <Panel title="Market share by units" icon="pie" className={span}>
          <ShareChart g={g} />
        </Panel>
      )}
      {showNext && (
        <Panel title="What to do next" icon="branch" className={span} bodyClass="overflow-y-auto">
          <NextSteps g={g} />
        </Panel>
      )}

      <Panel title="Your devices" icon="devices" right={<Btn small tone="primary" icon="plus" data-coach-target="new-device" onClick={() => openDesigner()}>New device</Btn>} className="col-span-8" bodyClass="overflow-auto">
        {products.length === 0 ? (
          <Empty icon="devices" text={`Design your first device to enter the market. ${g.companies.filter((c) => !c.isPlayer && c.alive).length} rivals are already selling.`}>
            <Btn tone="primary" icon="plus" className="h-11 px-8 text-[13px]" data-coach-target="new-device always" onClick={() => openDesigner()}>
              Design your first device
            </Btn>
          </Empty>
        ) : (
          <ProductTable g={g} rows={products} compact />
        )}
      </Panel>
      <Panel title={`Goals / ${stage.name}`} icon="goals" right={<Btn small tone="ghost" onClick={() => setTab('goals')}>All {stage.done}/{stage.total}</Btn>} className="col-span-4" bodyClass="overflow-y-auto px-2 py-1">
        {goals.map(({ goal, progress }) => (
          <button key={goal.id} onClick={() => setTab("goals")} title={`${goal.name}: ${goal.note}`} className="block w-full py-[3px] text-left">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[11px] text-fg">{goal.name}</span>
              <span className="truncate text-[11px] text-faint">{goal.note}</span>
            </div>
            <Meter value={progress} tone={progress > 0.66 ? 'pos' : 'accent'} />
          </button>
        ))}
        {open('research') && (
          <div className="mb-1 mt-2 flex items-center justify-between border-t border-line pt-1">
            <Head icon="research" className="flex-1 text-faint">
              Research
            </Head>
            <IconBtn icon="open" tone="ghost" title="Open research" className="!h-5 !w-5" onClick={() => setTab('research')} />
          </div>
        )}
        {(open('research') ? TRACKS : []).map((t) => (
          <div key={t} className="flex items-center gap-2 py-[3px]">
            <span className={`w-32 shrink-0 whitespace-nowrap text-[11px] ${g.activeResearch.includes(t) ? 'text-accent' : 'text-dim'}`}>
              <Lead icon={trackIcon(t)} />
              {TRACK_INFO[t].name}
            </span>
            <Meter value={g.levels[t] >= MAX_LEVEL ? 1 : (g.progress[t] ?? 0) / researchCost(g.levels[t] + 1)} tone={g.activeResearch.includes(t) ? 'accent' : 'dim'} />
            <span className="num w-8 text-right text-[11px] text-fg">L{g.levels[t]}</span>
          </div>
        ))}
      </Panel>
    </div>
  )
}
