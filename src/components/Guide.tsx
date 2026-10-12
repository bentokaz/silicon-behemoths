// Things that speak to the player directly: the guided first hour, decisions
// that incidents ask for, and the summary at the end of each year.
import { useEffect, useRef, useState } from 'react'
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
import { Icon, type IconName, TAB_ICON } from './icons'
import { Btn, IconBtn, Lead, money, num, pct } from './ui'

// ---------------------------------------------------------------- guided start

export interface Step {
  title: string
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
  /** The capability this step opens: it says so beside the title. */
  opens?: CapId
  /** What the step points at: the name controls give themselves in `data-coach-target`. The coach keeps off them. */
  target?: string
}
const mine = (s: GameState) => s.products.filter((p) => p.companyId === 'player')
const desks = (s: GameState) => reachable(s.office).filter((i) => ITEMS.office[i.kind]?.seats).length

export const STEPS: Step[] = [
  { title: 'Welcome', tab: 'city', only: 'guided', text: 'This is the city, and the small building in the middle is your company: two desks in a garage. That is all there is for now, and the menu on the left is short to match. It grows as the company does: each person you hire, thing you build and device you sell opens another part. The next steps take you from here to a device on sale. You can leave the guide at any time and bring it back from System.' },
  { title: 'Welcome', tab: 'city', only: 'open', text: 'This is the city, and the small building in the middle is your company: two desks in a garage. Everything you build later appears here, and clicking a place takes you inside it. The next few steps take you from here to a device on sale. You can leave the guide at any time and bring it back from System.' },
  { title: 'Look around', tab: 'office', text: 'This is the campus, seen from inside. People come in each morning, work, eat and go home; click one, or a desk or a screen, to see what is going on. Drag to turn the view, right-drag or use W A S D to move, scroll to zoom. The buttons at the top right switch between a cutaway, full walls and the outside.' },
  { title: 'Add a desk', tab: 'office', text: 'Open Build, choose Furnish, pick a Desk and click an empty spot inside the room. R turns it before you place it. Each desk seats one person.', target: 'build', done: (s) => desks(s) >= 3 },
  { title: 'Hire an engineer', tab: 'staff', where: { tab: 'staff', view: 'hire', role: 'engineer' }, only: 'guided', text: 'Open Staff, go to Applicants and hire a hardware engineer. Engineers shorten the time a device takes to develop. Hiring costs one month of their salary.', target: 'hire-engineer', done: (s) => s.staff.some((e) => e.role === 'engineer') },
  { title: 'Hire two people', tab: 'staff', where: { tab: 'staff', view: 'hire' }, only: 'open', text: 'Open Staff, go to Applicants and hire an engineer and one other. Engineers shorten development; designers, researchers and marketers each help in their own way. Hiring costs one month of their salary.', target: 'hire', done: (s) => s.staff.length >= 2 },
  { title: 'Open Research', tab: 'staff', where: { tab: 'staff', view: 'hire', role: 'researcher' }, only: 'guided', opens: 'research', text: 'Research is the first screen to earn. Hire a researcher from the applicants, or build a research lab on the campus, and Research appears in the menu. The dim entries with a lock all work this way: click one to see what it needs.', target: 'hire-researcher', done: (s) => has(s, 'research') },
  { title: 'Design a device', designer: true, text: 'Press New device. Shape the body, choose what goes inside, and watch the cost and the appeal to each kind of buyer. When you are happy, press Launch, set a price a fair way above the unit cost, and order a first production run.', target: 'new-device', done: (s) => mine(s).length >= 1 },
  { title: 'Fund research', tab: 'research', needs: 'research', text: 'While it is being developed, set a monthly research budget and pick a project. Research unlocks better parts and, later, whole new kinds of device.', target: 'research', done: (s) => s.rdBudget > 0 && s.activeResearch.length > 0 },
  { title: 'Let time pass', text: 'Start the clock with the play buttons at the top, or press Space. Development takes a couple of months; the faster speeds help. The game pauses itself for anything important.', done: (s) => mine(s).some((p) => p.status === 'sale') },
  { title: 'Read the reviews', tab: 'products', text: 'Your device is on sale. Click it to see what reviewers and owners think, how it is selling in each market, and to order more stock before it runs out.', target: 'device', done: (s) => useStore.getState().inspect !== null || mine(s).some((p) => p.unitsSold > 2000) },
  { title: 'Open Marketing', tab: 'staff', where: { tab: 'staff', view: 'hire', role: 'marketer' }, only: 'guided', opens: 'marketing', text: 'Hardly anyone has heard of you yet. Hire a marketer and the Marketing screen opens. Your device going on sale has also opened the Market screen and the executive search.', target: 'hire-marketer', done: (s) => has(s, 'marketing') },
  { title: 'Get known', tab: 'marketing', needs: 'marketing', text: 'Start an advertising campaign: search ads are cheap and steady. Awareness is what turns a good device into sales.', target: 'campaign', done: (s) => s.campaigns.length > 0 },
  { title: 'Your first executive', tab: 'staff', where: { tab: 'staff', view: 'execs' }, only: 'guided', needs: 'execs', opens: 'finance', text: 'Executives run a whole side of the company. Under Staff, Executives, a finance chief will talk to you now: hire one and the Finance screen opens, with a statement for every month. Others will follow as the company grows, each opening more. They cost about twice an ordinary salary, so there is no rush.', target: 'exec-cfo', done: (s) => has(s, 'finance') },
  { title: 'Build a second room', tab: 'office', text: 'Open Build, choose Rooms, pick a kind of room and click two corners on open ground. Walls and a door appear on their own. A lounge lifts morale; a research lab holds benches that speed up research.', target: 'build', done: (s) => s.office.rooms.length >= 2 },
  { title: 'Make a team', tab: 'staff', where: { tab: 'staff', view: 'teams' }, needs: 'teams', text: 'On the Teams tab, press Organise by role. A team with a lead gets more done, and once you pass eight people anyone without a lead slows down.', target: 'teams', done: (s) => s.teams.some((t) => teamBonus(s, t) > 0) || s.staff.length < 2 },
  { title: 'Grow', tab: 'goals', where: { tab: 'goals', view: 'growth' }, only: 'guided', text: 'From here the company is yours to shape. Goals has a second page, Company growth: everything still to open, what each part needs and how far along you are. A factory, stores, other regions, investors and labs are all on it. Design a Pro or a Lite version of your device in the meantime, or a successor.' },
  { title: 'Grow', tab: 'world', only: 'open', text: 'From here the company is yours to shape: enter another region, open a store, build a factory, design a Pro or a Lite version, or open a new line of devices under Research. The Goals screen always has something to aim for.', done: (s) => REGIONS.filter((r) => s.regions[r.id]?.open).length >= 2 || s.stores.length > 0 || !!s.factory || mine(s).length >= 2 },
  { title: 'You are on your own', tab: 'goals', text: 'That is the guided start done. Incidents will come up that need a decision, rivals will react to what you do, and every year ends with a summary. Good luck.' },
]

/** Does this step belong to the game being played, and is what it uses open? */
const suits = (s: GameState, step: Step) => (!step.only || (step.only === 'guided') === guided(s)) && (!step.needs || has(s, step.needs))
/** The step after this one that suits the game, or -1 when the guide is over. */
function following(s: GameState, from: number): number {
  for (let i = from + 1; i < STEPS.length; i++) if (suits(s, STEPS[i])) return i
  return -1
}

/** The step the guide is on, if the guide is running and the step suits this game. */
export function guideStep(s: GameState): Step | undefined {
  const step = STEPS[s.guide]
  return step && suits(s, step) ? step : undefined
}
/** Go to where a step is done: a screen, a view inside it, or the designer. */
export function goStep(step: Step) {
  const { go, openDesigner } = useStore.getState()
  if (step.designer) openDesigner()
  else go(step.where ?? { tab: step.tab ?? 'dashboard' })
}

// Whether the coach is folded down to a bar is the player's choice and outlives the session.
const FOLD_KEY = 'sb-coach'
function wasFolded(): boolean {
  try {
    return localStorage.getItem(FOLD_KEY) === '1'
  } catch {
    return false
  }
}
function keepFolded(folded: boolean) {
  try {
    localStorage.setItem(FOLD_KEY, folded ? '1' : '0')
  } catch {
    /* storage unavailable */
  }
}

// ---- where the coach sits
//
// The coach floats over the screen it is talking about, so it must keep off
// the thing it is pointing at. Controls say what they are with
// `data-coach-target="name ..."`; a step names the ones it is about in
// `target`, and the name `always` marks the one big action of a screen, kept
// clear whatever the step. A builder's information bar says so with
// `data-bottom-bar`, and the coach sits above it.

/** The places the coach can sit, in the order it tries them. */
const SLOTS = ['bottom', 'bottom-right', 'bottom-left', 'top-right', 'top-left'] as const
type Slot = (typeof SLOTS)[number]
interface Box {
  left: number
  top: number
  right: number
  bottom: number
}
/** Kept between the coach and the edges of the screen it floats over. */
const EDGE = 8
/** Kept between the coach and anything it must not cover. */
const CLEAR = 6

const cut = (a: Box, b: Box): Box | null => {
  const r = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) }
  return r.right - r.left > 0.5 && r.bottom - r.top > 0.5 ? r : null
}
/** The part of an element that can be seen: what its scrolling and clipping ancestors leave of it. */
function seenBox(el: Element, within: Element): Box | null {
  let box: Box | null = cut(el.getBoundingClientRect(), within.getBoundingClientRect())
  for (let p = el.parentElement; box && p && p !== within; p = p.parentElement) {
    const style = getComputedStyle(p)
    if (style.visibility === 'hidden') return null
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') box = cut(box, p.getBoundingClientRect())
  }
  return box
}

interface Placing {
  /** Where the card goes, or null when every place would cover what the step points at. */
  card: Slot | null
  /** Where the folded bar goes. */
  bar: Slot
  /** The screen area the coach floats over, as offsets from the edges of the element it is positioned in. */
  left: number
  right: number
  top: number
  width: number
  /** Its bottom edge, already lifted over a builder's information bar. */
  bottom: number
}

/** The CSS for a place. Until the screen has been measured: bottom middle of the window. */
function styleOf(p: Placing | null, slot: Slot): React.CSSProperties {
  if (!p) return { left: '50%', bottom: 12, transform: 'translateX(-50%)', maxWidth: 'calc(100% - 16px)' }
  const maxWidth = p.width - 2 * EDGE
  const y = slot.startsWith('top') ? { top: p.top + EDGE } : { bottom: p.bottom }
  if (slot === 'bottom') return { left: p.left + p.width / 2, transform: 'translateX(-50%)', maxWidth, ...y }
  return slot.endsWith('right') ? { right: p.right + EDGE, maxWidth, ...y } : { left: p.left + EDGE, maxWidth, ...y }
}

/**
 * Finds a place for the coach's card and for its folded bar where neither
 * covers what the step points at, and looks again whenever the window, the
 * screen, the scroll position or the step changes.
 */
function usePlacing(card: React.RefObject<HTMLElement | null>, bar: React.RefObject<HTMLElement | null>, target: string | undefined, key: string): Placing | null {
  const [placing, setPlacing] = useState<Placing | null>(null)
  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    const seen = new WeakSet<Element>()
    const watch = (el: Element) => void (seen.has(el) || (seen.add(el), sizes.observe(el)))
    const names = ['always', ...(target ? [target] : [])]
    const measure = () => {
      const host = (card.current ?? bar.current)?.offsetParent
      if (!host) return
      const m = main.getBoundingClientRect()
      const h = host.getBoundingClientRect()
      // a builder's information bar: the bar itself is as wide as the screen and see-through; what counts is what is in it
      let lift = 0
      const bars = main.querySelectorAll('[data-bottom-bar]')
      bars.forEach((b) => {
        watch(b)
        for (const part of b.children) {
          const r = part.getBoundingClientRect()
          if (r.width && r.height) lift = Math.max(lift, m.bottom - r.top)
        }
      })
      const floor = m.bottom - (lift ? Math.round(lift) + 4 : 12)
      const keepOff: Box[] = []
      main.querySelectorAll('[data-coach-target]').forEach((el) => {
        const said = (el.getAttribute('data-coach-target') ?? '').split(/\s+/)
        if (!names.some((n) => said.includes(n))) return
        watch(el)
        const box = seenBox(el, main)
        if (box) keepOff.push({ left: box.left - CLEAR, top: box.top - CLEAR, right: box.right + CLEAR, bottom: box.bottom + CLEAR })
      })
      const room = m.width - 2 * EDGE
      const boxAt = (slot: Slot, w: number, ht: number): Box => {
        const left = slot === 'bottom' ? m.left + (m.width - w) / 2 : slot.endsWith('right') ? m.right - EDGE - w : m.left + EDGE
        const top = slot.startsWith('top') ? m.top + EDGE : floor - ht
        return { left, top, right: left + w, bottom: top + ht }
      }
      const find = (el: HTMLElement | null): Slot | null => {
        if (!el) return null
        const w = Math.min(el.offsetWidth, room)
        const ht = el.offsetHeight
        if (ht > floor - m.top - EDGE) return null
        // a view with its own bar along the bottom has its tools along the top: there the coach keeps to the bottom
        const slots = bars.length ? SLOTS.filter((s) => s.startsWith('bottom')) : SLOTS
        return slots.find((s) => !keepOff.some((k) => cut(k, boxAt(s, w, ht)))) ?? null
      }
      const next: Placing = { card: find(card.current), bar: find(bar.current) ?? 'bottom', left: Math.round(m.left - h.left), right: Math.round(h.right - m.right), top: Math.round(m.top - h.top), width: Math.round(m.width), bottom: Math.round(h.bottom - floor) }
      setPlacing((was) => (was && JSON.stringify(was) === JSON.stringify(next) ? was : next))
    }
    // however much changes in a frame, look once
    let queued = 0
    const soon = () => void (queued ||= requestAnimationFrame(() => ((queued = 0), measure())))
    const sizes = new ResizeObserver(soon)
    const nodes = new MutationObserver(soon)
    sizes.observe(main)
    if (card.current) sizes.observe(card.current)
    if (bar.current) sizes.observe(bar.current)
    nodes.observe(main, { childList: true, subtree: true })
    window.addEventListener('resize', soon)
    // a list scrolled inside the screen moves what the step points at
    document.addEventListener('scroll', soon, true)
    measure()
    return () => (sizes.disconnect(), nodes.disconnect(), window.removeEventListener('resize', soon), document.removeEventListener('scroll', soon, true), cancelAnimationFrame(queued))
  }, [card, bar, target, key])
  return placing
}

export function Coach() {
  const g = useGame()
  const { act } = useStore.getState()
  const tab = useStore((s) => s.tab)
  const designing = useStore((s) => s.designing)
  const [folded, setFolded] = useState(wasFolded)
  // opened by hand where there is no room for it: for this step on this screen only
  const [forced, setForced] = useState('')
  const cardRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLButtonElement>(null)
  const step = STEPS[g.guide]
  const here = `${g.guide}/${tab}`
  const placing = usePlacing(cardRef, barRef, step?.target, `${here}/${folded}/${designing}`)
  const fold = (to: boolean) => (keepFolded(to), setFolded(to), setForced(to ? '' : here), sfx.toggle())
  const passed = !!step && !suits(g, step)
  const done = !!step?.done?.(g)
  // a step that is not for this game, or uses something still locked, is passed over
  useEffect(() => {
    if (passed) act((s) => void (s.guide = following(s, s.guide)))
  }, [passed, g.guide, act])
  // a finished step moves on by itself after a moment
  useEffect(() => {
    if (!done || passed) return
    const t = window.setTimeout(() => (act((s) => void (s.guide = following(s, s.guide))), sfx.confirm()), 900)
    return () => window.clearTimeout(t)
  }, [done, passed, g.guide, act])
  if (!step || passed || designing) return null
  // only the steps of this kind of game are counted
  const mine = STEPS.map((x, i) => i).filter((i) => !STEPS[i].only || (STEPS[i].only === 'guided') === guided(g))
  const at = mine.indexOf(g.guide)
  const last = following(g, g.guide) < 0
  const go = () => goStep(step)
  const icon: IconName = step.opens ? (has(g, step.opens) ? 'unlock' : 'lock') : 'goals'
  // With no place for the card that leaves the step's target clear, it folds to its bar by itself;
  // the card stays in the page, unseen, so its size is known when room comes back.
  const cramped = !folded && !!placing && !placing.card && forced !== here
  const asBar = folded || cramped
  // the bar is in the page even while the card is up, so that it is already measured when it is needed
  const bar = (
    <button
      ref={barRef}
      data-coach="bar"
      data-coach-slot={placing?.bar}
      onClick={() => fold(false)}
      style={styleOf(placing, placing?.bar ?? 'bottom')}
      title={`Guide, step ${at + 1} of ${mine.length}: ${step.title}. ${cramped ? 'Folded so that it does not cover what this step points at. Click to open it anyway.' : 'Click to open it.'}`}
      aria-expanded={false}
      aria-hidden={!asBar || undefined}
      tabIndex={asBar ? undefined : -1}
      className={`absolute z-30 flex h-7 items-center gap-2 border border-accent bg-panel px-2 text-left hover:bg-hover ${asBar ? 'pointer-events-auto' : 'pointer-events-none invisible'}`}
    >
      <Icon name={done ? 'check' : icon} size={12} className={`shrink-0 ${done ? 'text-pos' : 'text-accent'}`} />
      <span className="label shrink-0 text-faint">Guide</span>
      <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{step.title}</span>
      <span className="num shrink-0 text-[10px] text-faint">
        {at + 1} / {mine.length}
      </span>
      <Icon name="arrowUp" size={11} className="shrink-0 text-dim" />
    </button>
  )
  if (folded) return bar
  const card = (
    <div ref={cardRef} data-coach="card" data-coach-slot={placing?.card ?? 'none'} aria-hidden={cramped || undefined} style={styleOf(placing, placing?.card ?? 'bottom')} className={`absolute z-30 w-[440px] border border-accent bg-panel ${cramped ? 'pointer-events-none invisible' : 'pointer-events-auto'}`}>
      <div className="flex items-center justify-between gap-2 border-b border-line py-[3px] pl-3 pr-1">
        <span className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          <Icon name={icon} size={13} className="shrink-0" />
          <span className="truncate">{step.title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="num text-[10px] text-faint">
            {at + 1} / {mine.length}
          </span>
          <IconBtn icon="arrowDown" tone="ghost" title="Fold the guide down to a bar. It stays that way until you open it again." aria-expanded onClick={() => fold(true)} />
        </span>
      </div>
      <div className="px-3 py-2 text-[12px] leading-relaxed text-fg">{step.text}</div>
      <div className="flex h-[3px] gap-[2px] px-3">
        {mine.map((i) => (
          <span key={i} className={`flex-1 ${i < g.guide ? 'bg-accent' : i === g.guide ? (done ? 'bg-pos' : 'bg-accent/50') : 'bg-line2'}`} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <Btn small tone="ghost" icon="close" onClick={() => act((s) => void (s.guide = -1))}>
          Leave the guide
        </Btn>
        <div className="flex gap-1">
          {(step.tab && (step.tab !== tab || step.where?.view)) || step.designer ? (
            <Btn small tone={step.done ? 'primary' : 'default'} className="flex items-center gap-[6px]" onClick={go}>
              <Icon name={step.designer ? 'plus' : (TAB_ICON[step.tab ?? 'dashboard'] ?? 'overview')} size={12} />
              {step.designer ? 'New device' : 'Take me there'}
            </Btn>
          ) : null}
          {!step.done && (
            <Btn small tone="primary" icon={last ? 'check' : 'arrowRight'} onClick={() => act((s) => void (s.guide = following(s, s.guide)))}>
              {last ? 'Finish' : 'Next'}
            </Btn>
          )}
          {step.done && !done && (
            <Btn small icon="fast" onClick={() => act((s) => void (s.guide = following(s, s.guide)))} title="Skip this step">
              Skip
            </Btn>
          )}
          {done && (
            <span className="num flex items-center gap-1 px-2 text-[11px] text-pos">
              <Icon name="check" size={12} />
              DONE
            </span>
          )}
        </div>
      </div>
    </div>
  )
  return (
    <>
      {bar}
      {card}
    </>
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
          <span className="num ml-auto text-[10px] text-faint">
            <Lead icon="hourglass" size={10} />
            {Math.max(0, INCIDENT_WAIT - (g.day - i.day))} days to decide
          </span>
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
  const cells: [string, string, string | undefined, IconName][] = [
    ['Income', money(revenue, 1), before.length === 12 && lastRevenue > 0 ? `${revenue >= lastRevenue ? '+' : ''}${pct(revenue / lastRevenue - 1, 0)} on last year` : undefined, 'coins'],
    ['Profit', money(profit, 1), profit >= 0 ? 'in the black' : 'a loss', profit >= 0 ? 'trendUp' : 'trendDown'],
    ['Devices sold', num(units), `${pct((all[0]?.units ?? 0) / total)} of the market, ranked ${rank} of ${all.filter((t) => t.company.alive).length}`, 'package'],
    ['Company value', marketCap(g) >= 1e9 ? `$${(marketCap(g) / 1e9).toFixed(2)}B` : money(marketCap(g), 1), g.stock.listed ? `$${g.stock.price.toFixed(2)} a share` : 'private', 'chart'],
    ['Fans', num(g.fans), `${num(g.owners)} owners`, 'heart'],
    ['People', String(g.staff.length), `${goals} goal${goals === 1 ? '' : 's'} reached this year`, 'staff'],
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
          {cells.map(([label, value, sub, icon]) => (
            <div key={label} className="bg-panel px-4 py-3">
              <div className="label flex items-center gap-[5px] text-faint">
                <Icon name={icon} size={12} />
                {label}
              </div>
              <div className="num text-lg text-fg">{value}</div>
              {sub && <div className="text-[10px] text-dim">{sub}</div>}
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
          <Btn icon="goals" onClick={() => (close(), useStore.getState().setTab('goals'))}>
            See goals
          </Btn>
          <Btn tone="primary" icon="arrowRight" onClick={() => (close(), sfx.confirm())}>
            On to {year + 1}
          </Btn>
        </div>
      </div>
    </div>
  )
}
