// Things that speak to the player directly: the guided first hour, decisions
// that incidents ask for, and the summary at the end of each year.
import { useEffect } from 'react'
import { sfx } from '../audio/sfx'
import { DAYS_PER_YEAR, START_YEAR } from '../data/catalog'
import { decide, player, trailingUnits } from '../sim/game'
import { REGIONS } from '../sim/regions'
import { ITEMS, reachable } from '../sim/sites'
import { teamBonus } from '../sim/staff'
import { marketCap } from '../sim/stock'
import { type GameState, monthCosts } from '../sim/types'
import { INCIDENTS, INCIDENT_WAIT } from '../sim/world'
import { type Tab, useGame, useStore } from '../store/game'
import { Icon, type IconName, TAB_ICON } from './icons'
import { Btn, money, num, pct } from './ui'

// ---------------------------------------------------------------- guided start

interface Step {
  title: string
  text: string
  /** Screen where this is done. */
  tab?: Tab
  /** True once the player has done it; steps without one wait for "Next". */
  done?: (s: GameState) => boolean
}
const mine = (s: GameState) => s.products.filter((p) => p.companyId === 'player')
const desks = (s: GameState) => reachable(s.office).filter((i) => ITEMS.office[i.kind]?.seats).length

export const STEPS: Step[] = [
  { title: 'Welcome', text: 'This is your company: two desks in a garage. The next few steps take you from here to a device on sale. You can leave the guide at any time and bring it back from System.' },
  { title: 'Look around', tab: 'office', text: 'This is the campus. Drag to turn the view, right-drag or use W A S D to move, scroll to zoom. The buttons at the top right switch between a cutaway, full walls and the outside.' },
  { title: 'Add a desk', tab: 'office', text: 'Open Build, choose Furnish, pick a Desk and click an empty spot inside the room. R turns it before you place it. Each desk seats one person.', done: (s) => desks(s) >= 3 },
  { title: 'Hire two people', tab: 'staff', text: 'Open Staff, go to Applicants and hire an engineer and one other. Engineers shorten development; designers, researchers and marketers each help in their own way. Hiring costs one month of their salary.', done: (s) => s.staff.length >= 2 },
  { title: 'Design a device', text: 'Press New device. Shape the body, choose what goes inside, and watch the cost and the appeal to each kind of buyer. When you are happy, press Launch, set a price a fair way above the unit cost, and order a first production run.', done: (s) => mine(s).length >= 1 },
  { title: 'Fund research', tab: 'research', text: 'While it is being developed, set a monthly research budget and pick a project. Research unlocks better parts and, later, whole new kinds of device.', done: (s) => s.rdBudget > 0 && s.activeResearch.length > 0 },
  { title: 'Let time pass', text: 'Start the clock with the play buttons at the top, or press Space. Development takes a couple of months; the faster speeds help. The game pauses itself for anything important.', done: (s) => mine(s).some((p) => p.status === 'sale') },
  { title: 'Read the reviews', tab: 'products', text: 'Your device is on sale. Click it to see what reviewers and owners think, how it is selling in each market, and to order more stock before it runs out.', done: (s) => useStore.getState().inspect !== null || mine(s).some((p) => p.unitsSold > 2000) },
  { title: 'Get known', tab: 'marketing', text: 'Hardly anyone has heard of you yet. Start an advertising campaign: search ads are cheap and steady. Awareness is what turns a good device into sales.', done: (s) => s.campaigns.length > 0 },
  { title: 'Build a second room', tab: 'office', text: 'Open Build, choose Rooms, pick a kind of room and click two corners on open ground. Walls and a door appear on their own. A lounge lifts morale; a research lab holds benches that speed up research.', done: (s) => s.office.rooms.length >= 2 },
  { title: 'Make a team', tab: 'staff', text: 'On the Teams tab, press Organise by role. A team with a lead gets more done, and once you pass eight people anyone without a lead slows down.', done: (s) => s.teams.some((t) => teamBonus(s, t) > 0) || s.staff.length < 2 },
  { title: 'Grow', tab: 'world', text: 'From here the company is yours to shape: enter another region, open a store, build a factory, design a Pro or a Lite version, or open a new line of devices under Research. The Goals screen always has something to aim for.', done: (s) => REGIONS.filter((r) => s.regions[r.id]?.open).length >= 2 || s.stores.length > 0 || !!s.factory || mine(s).length >= 2 },
  { title: 'You are on your own', tab: 'goals', text: 'That is the guided start done. Incidents will come up that need a decision, rivals will react to what you do, and every year ends with a summary. Good luck.' },
]

export function Coach() {
  const g = useGame()
  const { act, setTab, openDesigner } = useStore.getState()
  const tab = useStore((s) => s.tab)
  const designing = useStore((s) => s.designing)
  const step = STEPS[g.guide]
  const done = !!step?.done?.(g)
  // a finished step moves on by itself after a moment
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => (act((s) => void (s.guide = s.guide + 1 >= STEPS.length ? -1 : s.guide + 1)), sfx.confirm()), 900)
    return () => window.clearTimeout(t)
  }, [done, g.guide, act])
  if (!step || designing) return null
  const last = g.guide === STEPS.length - 1
  const go = () => (g.guide === 4 ? openDesigner() : step.tab && setTab(step.tab))
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-30 w-[440px] -translate-x-1/2 border border-accent bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-[6px]">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          <Icon name="goals" size={13} />
          {step.title}
        </span>
        <span className="num text-[10px] text-faint">
          {g.guide + 1} / {STEPS.length}
        </span>
      </div>
      <div className="px-3 py-2 text-[12px] leading-relaxed text-fg">{step.text}</div>
      <div className="flex h-[3px] gap-[2px] px-3">
        {STEPS.map((_, i) => (
          <span key={i} className={`flex-1 ${i < g.guide ? 'bg-accent' : i === g.guide ? (done ? 'bg-pos' : 'bg-accent/50') : 'bg-line2'}`} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <Btn small tone="ghost" onClick={() => act((s) => void (s.guide = -1))}>
          Leave the guide
        </Btn>
        <div className="flex gap-1">
          {(step.tab && step.tab !== tab) || g.guide === 4 ? (
            <Btn small tone="primary" className="flex items-center gap-[6px]" onClick={go}>
              <Icon name={g.guide === 4 ? 'plus' : (TAB_ICON[step.tab ?? 'dashboard'] ?? 'overview')} size={12} />
              {g.guide === 4 ? 'New device' : 'Take me there'}
            </Btn>
          ) : null}
          {!step.done && (
            <Btn small tone="primary" onClick={() => act((s) => void (s.guide = last ? -1 : s.guide + 1))}>
              {last ? 'Finish' : 'Next'}
            </Btn>
          )}
          {step.done && !done && (
            <Btn small onClick={() => act((s) => void (s.guide = s.guide + 1))} title="Skip this step">
              Skip
            </Btn>
          )}
          {done && <span className="num px-2 text-[11px] text-pos">DONE</span>}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- incidents

const INCIDENT_ICON: Record<string, IconName> = { viral: 'marketing', lawsuit: 'alert', poach: 'person', fire: 'factory', endorse: 'marketing', breach: 'alert', award: 'goals', strike: 'staff', grant: 'research', boom: 'shares', slump: 'market', bulk: 'cash' }

/** The decision an incident is waiting on. Shown over whatever screen is open. */
export function Decision() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const i = g.incidents.find((x) => !x.done)
  const def = i && INCIDENTS[i.kind]
  useEffect(() => {
    if (i) useStore.getState().setSpeed(0)
  }, [i?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!i || !def) return null
  const options = def.choices(g, i)
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-carbon/70">
      <div className="w-[460px] border border-warn bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Icon name={INCIDENT_ICON[i.kind] ?? 'alert'} className="text-warn" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-fg">{def.title}</span>
          <span className="num ml-auto text-[10px] text-faint">{Math.max(0, INCIDENT_WAIT - (g.day - i.day))} days to decide</span>
        </div>
        <div className="px-3 py-3 text-[13px] leading-relaxed text-fg">{def.text(g, i)}</div>
        <div className="space-y-1 px-3 pb-3">
          {options.map((o, n) => (
            <button
              key={o.label}
              onClick={() => {
                const err = act((s) => decide(s, i.id, n))
                if (err) say(err, 'bad')
                else sfx.confirm()
              }}
              className="block w-full border border-line2 p-2 text-left hover:border-accent hover:bg-accent/10"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs uppercase tracking-wider text-fg">{o.label}</span>
                {o.cost ? <span className={`num text-[11px] ${o.cost > 0 ? 'text-neg' : 'text-pos'}`}>{o.cost > 0 ? `-${money(o.cost, 1)}` : `+${money(-o.cost, 1)}`}</span> : null}
              </div>
              <div className="mt-[2px] text-[11px] leading-snug text-dim">{o.note}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- year end

/** The year in numbers, shown once when the calendar turns. */
export function YearEnd() {
  const g = useGame()
  const year = useStore((s) => s.yearEnd)
  if (year === null) return null
  const close = () => useStore.getState().closeYear()
  const months = g.reports.slice(-12)
  const before = g.reports.slice(-24, -12)
  const sum = (rows: typeof months, f: (r: (typeof months)[number]) => number) => rows.reduce((a, r) => a + f(r), 0)
  const revenue = sum(months, (r) => r.revenue + r.other)
  const profit = sum(months, (r) => r.revenue + r.other - monthCosts(r))
  const units = sum(months, (r) => r.units)
  const lastRevenue = sum(before, (r) => r.revenue + r.other)
  const all = trailingUnits(g)
  const total = all.reduce((a, t) => a + t.units, 0) || 1
  const rank = [...all].sort((a, b) => b.units - a.units).findIndex((t) => t.company.isPlayer) + 1
  const best = [...g.products.filter((p) => p.companyId === 'player')].sort((a, b) => b.history.slice(-12).reduce((x, y) => x + y, 0) - a.history.slice(-12).reduce((x, y) => x + y, 0))[0]
  const start = (year - START_YEAR) * DAYS_PER_YEAR
  const goals = Object.values(g.goals).filter((d) => d >= start && d < start + DAYS_PER_YEAR).length
  const cells: [string, string, string?][] = [
    ['Income', money(revenue, 1), before.length === 12 && lastRevenue > 0 ? `${revenue >= lastRevenue ? '+' : ''}${pct(revenue / lastRevenue - 1, 0)} on last year` : undefined],
    ['Profit', money(profit, 1), profit >= 0 ? 'in the black' : 'a loss'],
    ['Devices sold', num(units), `${pct((all[0]?.units ?? 0) / total)} of the market, ranked ${rank} of ${all.filter((t) => t.company.alive).length}`],
    ['Company value', marketCap(g) >= 1e9 ? `$${(marketCap(g) / 1e9).toFixed(2)}B` : money(marketCap(g), 1), g.stock.listed ? `$${g.stock.price.toFixed(2)} a share` : 'private'],
    ['Fans', num(g.fans), `${num(g.owners)} owners`],
    ['People', String(g.staff.length), `${goals} goal${goals === 1 ? '' : 's'} reached this year`],
  ]
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-carbon/80">
      <div className="w-[560px] border border-line2 bg-panel">
        <div className="border-b border-line px-4 py-3">
          <div className="label text-faint">{player(g).name}</div>
          <div className="text-2xl font-semibold tracking-[0.12em] text-fg">
            {year} <span className="text-accent">/</span> THE YEAR IN REVIEW
          </div>
        </div>
        <div className="grid grid-cols-3 gap-px bg-line">
          {cells.map(([label, value, sub]) => (
            <div key={label} className="bg-panel px-4 py-3">
              <div className="label text-faint">{label}</div>
              <div className="num text-lg text-fg">{value}</div>
              {sub && <div className="text-[10px] text-dim">{sub}</div>}
            </div>
          ))}
        </div>
        {best && (
          <div className="border-t border-line px-4 py-2 text-[12px] text-dim">
            Best seller: <span className="text-fg">{best.name}</span>, {num(best.history.slice(-12).reduce((a, b) => a + b, 0))} units, reviews {best.reviewAvg.toFixed(1)}.
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <Btn onClick={() => (close(), useStore.getState().setTab('goals'))}>See goals</Btn>
          <Btn tone="primary" onClick={() => (close(), sfx.confirm())}>
            On to {year + 1}
          </Btn>
        </div>
      </div>
    </div>
  )
}
