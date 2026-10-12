// Things that speak to the player directly: the steps of the guided first
// hour (shown, one at a time, in the messenger strip: see Messenger.tsx),
// decisions that incidents ask for, and the summary at the end of each year.
import { useEffect, useRef } from 'react'
import { sfx } from '../audio/sfx'
import { DAYS_PER_YEAR, START_YEAR } from '../data/catalog'
import { decide, player, trailingUnits } from '../sim/game'
import { type CapId, type Where, guided, has } from '../sim/progress'
import { REGIONS } from '../sim/regions'
import { ITEMS, reachable } from '../sim/sites'
import { teamBonus } from '../sim/staff'
import { marketCap } from '../sim/stock'
import { type GameState, monthCosts } from '../sim/types'
import { INCIDENTS, INCIDENT_WAIT } from '../sim/world'
import { type Tab, useGame, useStore } from '../store/game'
import { Icon, type IconName } from './icons'
import { Btn, Lead, money, moneyDelta, num, pct, useLayer } from './ui'

// ---------------------------------------------------------------- guided start

export interface Step {
  title: string
  /** What to do, in two short sentences at most: the strip has two lines. */
  text: string
  /** Screen where this is done. */
  tab?: Tab
  /** A view inside that screen to land on. */
  where?: Where
  /** Done in the device designer rather than on a screen. */
  designer?: boolean
  /** True once the player has done it; steps without one wait for "Next". */
  done?: (s: GameState) => boolean
  /** A step for one kind of game only: one where capabilities are earned, or one where everything is open. */
  only?: 'guided' | 'open'
  /** The capability this step uses. While that is locked the step is passed over. */
  needs?: CapId
  /** The capability this step opens. */
  opens?: CapId
  /** What the step points at: the name controls give themselves in `data-coach-target`. It is outlined while the step is up. */
  target?: string
}
const mine = (s: GameState) => s.products.filter((p) => p.companyId === 'player')
const desks = (s: GameState) => reachable(s.office).filter((i) => ITEMS.office[i.kind]?.seats).length

export const STEPS: Step[] = [
  { title: 'Welcome', tab: 'city', only: 'guided', text: 'This is the city. The small building in the middle is your company: two desks in a garage. The menu on the left is short to match, and grows as the company does.' },
  { title: 'Welcome', tab: 'city', only: 'open', text: 'This is the city. The small building in the middle is your company: two desks in a garage. Everything you build appears here; click a place to go inside.' },
  { title: 'Look around', tab: 'office', text: 'This is your campus, from inside. Drag to turn the view, right-drag or W A S D to move, scroll to zoom. Click a person or a desk to see what is going on.' },
  { title: 'Add a desk', tab: 'office', text: 'Press Build, choose Furnish, pick a Desk and click an empty spot in the room. R turns it first. Each desk seats one person.', target: 'build', done: (s) => desks(s) >= 3 },
  { title: 'Hire an engineer', tab: 'staff', where: { tab: 'staff', view: 'hire', role: 'engineer' }, only: 'guided', text: 'Under Campus, Hiring, hire a hardware engineer. Engineers shorten the time a device takes to develop. Hiring costs one month of salary.', target: 'hire-engineer', done: (s) => s.staff.some((e) => e.role === 'engineer') },
  { title: 'Hire two people', tab: 'staff', where: { tab: 'staff', view: 'hire' }, only: 'open', text: 'Under Campus, Hiring, hire an engineer and one other. Engineers shorten development; the other roles each help in their own way.', target: 'hire', done: (s) => s.staff.length >= 2 },
  { title: 'Open Research', tab: 'staff', where: { tab: 'staff', view: 'hire', role: 'researcher' }, only: 'guided', opens: 'research', text: 'Hire a researcher and Research opens in the menu. Everything with a lock works this way: click it to see what it takes.', target: 'hire-researcher', done: (s) => has(s, 'research') },
  { title: 'Design a device', designer: true, text: 'Press New device. Shape the body, choose what goes inside and watch the cost. Then press Launch, set a price above the unit cost and order a first run.', target: 'new-device', done: (s) => mine(s).length >= 1 },
  { title: 'Fund research', tab: 'research', where: { tab: 'research', view: 'tech' }, needs: 'research', text: 'While the device is developed, set a monthly research budget and start a project. Research brings better parts and, later, new kinds of device.', target: 'research', done: (s) => s.rdBudget > 0 && s.activeResearch.length > 0 },
  { title: 'Let time pass', text: 'Start the clock with the play buttons at the top, or press Space. Development takes a couple of months. The game pauses itself for anything important.', done: (s) => mine(s).some((p) => p.status === 'sale') },
  { title: 'Read the reviews', tab: 'products', text: 'Your device is on sale. Click it to see what reviewers and owners think, how it is selling, and to order more before it runs out.', target: 'device', done: (s) => useStore.getState().inspect !== null },
  { title: 'Open Marketing', tab: 'staff', where: { tab: 'staff', view: 'hire', role: 'marketer' }, only: 'guided', opens: 'marketing', text: 'Hardly anyone has heard of you yet. Hire a marketer and Marketing opens.', target: 'hire-marketer', done: (s) => has(s, 'marketing') },
  { title: 'Get known', tab: 'marketing', where: { tab: 'marketing', view: 'campaigns' }, needs: 'marketing', text: 'Start an advertising campaign: search ads are cheap and steady. Awareness is what turns a good device into sales.', target: 'campaign', done: (s) => s.campaigns.length > 0 },
  { title: 'Your first executive', tab: 'staff', where: { tab: 'staff', view: 'execs' }, only: 'guided', needs: 'execs', opens: 'finance', text: 'Executives run a whole side of the company. Under Campus, People, Executives, hire a Chief Financial Officer and Finance opens. They cost about twice an ordinary salary.', target: 'exec-cfo', done: (s) => has(s, 'finance') },
  { title: 'Build a second room', tab: 'office', text: 'Press Build, choose Rooms, pick a kind of room and click two corners on open ground. A lounge lifts morale; a research lab speeds up research.', target: 'build', done: (s) => s.office.rooms.length >= 2 },
  { title: 'Make a team', tab: 'staff', where: { tab: 'staff', view: 'teams' }, needs: 'teams', text: 'Under Campus, Teams, press Organise by role. A team with a lead gets more done, and past eight people anyone without a lead slows down.', target: 'teams', done: (s) => s.teams.some((t) => teamBonus(s, t) > 0) || s.staff.length < 2 },
  { title: 'Grow', tab: 'goals', only: 'guided', text: 'From here the company is yours to shape. Company, Growth lists everything still to open and what each part takes: a factory, stores, other regions, investors, labs.' },
  { title: 'Grow', tab: 'city', only: 'open', text: 'From here the company is yours to shape: enter another region, open a store, build a factory, or design a Pro or a Lite version of your device.', done: (s) => REGIONS.filter((r) => s.regions[r.id]?.open).length >= 2 || s.stores.length > 0 || !!s.factory || mine(s).length >= 2 },
  { title: 'You are on your own', tab: 'goals', text: 'That is the guided start done. Incidents will ask for decisions, rivals will react to what you do, and every year ends with a summary. Good luck.' },
]

/** Does this step belong to the game being played, and is what it uses open? */
export const suits = (s: GameState, step: Step) => (!step.only || (step.only === 'guided') === guided(s)) && (!step.needs || has(s, step.needs))
/** The step after this one that suits the game, or -1 when the guide is over. */
export function following(s: GameState, from: number): number {
  for (let i = from + 1; i < STEPS.length; i++) if (suits(s, STEPS[i])) return i
  return -1
}
/** The steps of this kind of game, by index: what "step 3 of 14" counts. */
export const stepsOf = (s: GameState) => STEPS.map((_, i) => i).filter((i) => !STEPS[i].only || (STEPS[i].only === 'guided') === guided(s))

/** The step the guide is on, if the guide is running and the step suits this game. */
export function guideStep(s: GameState): Step | undefined {
  const step = STEPS[s.guide]
  return step && suits(s, step) ? step : undefined
}
/** Go to where a step is done: a screen, a view inside it, or the designer. */
export function goStep(step: Step) {
  const { go, openDesigner } = useStore.getState()
  if (step.designer) openDesigner()
  else if (step.where ?? step.tab) go(step.where ?? { tab: step.tab! })
}
/** Whether the player is already where a step is done. A step with no place is done anywhere. */
export function atStep(step: Step): boolean {
  const st = useStore.getState()
  if (step.designer) return st.designing
  if (!step.tab) return true
  if (st.designing || st.tab !== step.tab) return false
  return !step.where?.view || st.views[step.tab] === step.where.view
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
  // it has to be answered: there is no Esc out of it, and the game's keys wait
  const box = useRef<HTMLDivElement>(null)
  useLayer(!!i && !!def, undefined, { modal: true, box })
  if (!i || !def) return null
  const options = def.choices(g, i)
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-carbon/70 p-4">
      <div ref={box} role="alertdialog" aria-label={def.title} className="max-h-full w-[460px] max-w-full overflow-y-auto border border-warn bg-panel outline-none">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Icon name={INCIDENT_ICON[i.kind] ?? 'alert'} className="text-warn" />
          <span className="t-title">{def.title}</span>
          <span className="num ml-auto text-[11px] text-faint">
            <Lead icon="hourglass" size={10} />
            {Math.max(0, INCIDENT_WAIT - (g.day - i.day))} days to decide
          </span>
        </div>
        <div className="px-3 py-3 text-xs leading-relaxed text-fg">{def.text(g, i)}</div>
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
                <span className="text-xs text-fg">{o.label}</span>
                {o.cost ? <span className={`num text-xs ${o.cost > 0 ? 'text-neg' : 'text-pos'}`}>{moneyDelta(-o.cost)}</span> : null}
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
  const close = () => useStore.getState().closeYear()
  const box = useRef<HTMLDivElement>(null)
  useLayer(year !== null, close, { modal: true, box })
  if (year === null) return null
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
  const cells: [string, string, string | undefined, IconName][] = [
    ['Income', money(revenue, 1), before.length === 12 && lastRevenue > 0 ? `${revenue >= lastRevenue ? '+' : ''}${pct(revenue / lastRevenue - 1, 0)} on last year` : undefined, 'coins'],
    ['Profit', money(profit, 1), profit >= 0 ? 'in the black' : 'a loss', profit >= 0 ? 'trendUp' : 'trendDown'],
    ['Devices sold', num(units), `${pct((all[0]?.units ?? 0) / total)} of the market, ranked ${rank} of ${all.filter((t) => t.company.alive).length}`, 'package'],
    ['Company value', money(marketCap(g), 1), g.stock.listed ? `$${g.stock.price.toFixed(2)} a share` : 'private', 'chart'],
    ['Fans', num(g.fans), `${num(g.owners)} owners`, 'heart'],
    ['People', String(g.staff.length), `${goals} goal${goals === 1 ? '' : 's'} reached this year`, 'staff'],
  ]
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-carbon/80 p-4">
      <div ref={box} role="dialog" aria-label={`${year}: the year in review`} className="max-h-full w-[560px] max-w-full overflow-y-auto border border-line2 bg-panel outline-none">
        <div className="border-b border-line px-4 py-3">
          <div className="label">{player(g).name}</div>
          <div className="text-xl font-semibold text-fg">{year} in review</div>
        </div>
        <div className="grid grid-cols-3 gap-px bg-line">
          {cells.map(([label, value, sub, icon]) => (
            <div key={label} className="bg-panel px-4 py-3">
              <div className="label flex items-center gap-[5px]">
                <Icon name={icon} size={12} />
                {label}
              </div>
              <div className="t-value mt-1 text-fg">{value}</div>
              {sub && <div className="text-[11px] text-dim">{sub}</div>}
            </div>
          ))}
        </div>
        {best && (
          <div className="border-t border-line px-4 py-2 text-[12px] text-dim">
            <Lead icon="star" size={12} />
            Best seller: <span className="text-fg">{best.name}</span>, {num(best.history.slice(-12).reduce((a, b) => a + b, 0))} units, reviews {best.reviewAvg.toFixed(1)}.
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <Btn tone="ghost" icon="goals" onClick={() => (close(), useStore.getState().setTab('goals'))}>
            See goals
          </Btn>
          <Btn tone="primary" large icon="arrowRight" autoFocus onClick={() => (close(), sfx.confirm())}>
            On to {year + 1}
          </Btn>
        </div>
      </div>
    </div>
  )
}
