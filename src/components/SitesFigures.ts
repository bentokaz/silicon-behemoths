// What the Sites pages (Factory, Stores, Venue) say about a place in one line:
// the figures of the status strip over each 3D view. Kept apart from the
// screens so it can be tested without a page. The figures themselves come from
// the simulation (`factoryLine`, `storeMonth`, `storeStats`, `venueStats`):
// nothing here works out a profit or an output of its own.
import { DAYS_PER_MONTH } from '../data/catalog'
import { TYPES } from '../data/devices'
import { fmtDate } from '../sim/game'
import { EVENTS, OWN_VENUE } from '../sim/growth'
import { type StoreMonth, storeMonth } from '../sim/insight'
import { factoryLine, orderLeft } from '../sim/ops'
import { regionInfo } from '../sim/regions'
import { ITEMS, storeStats, tierOf, upkeep, venueStats } from '../sim/sites'
import type { GameEvent, GameState, ProductionOrder, Store } from '../sim/types'
import { int, money, num, pct } from './format'
import type { Figure } from './ui'

// ------------------------------------------------------------------ factory

/** One run waiting for, or on, the company's own line. */
export interface QueuedRun {
  id: string
  productId: string
  name: string
  done: number
  quantity: number
  /** 0 to 1. */
  share: number
  /** Days of the line's whole output the rest of the run needs; null while the line is down. */
  days: number | null
}

/** What the factory is doing: the same answer for the status strip, the queue behind it and anything else that asks. */
export interface FactoryNow {
  /** `none` there is no working line; `stopped` runs are waiting on a line that is down; `idle` the line works and has nothing to make. */
  state: 'none' | 'stopped' | 'idle' | 'making'
  /** "Vista 2: 62%", "Idle", "Stopped", "No line". */
  text: string
  tone?: 'neg' | 'warn'
  /** Why, in a sentence. */
  why: string
  /** The runs the factory has on order, in the order the line takes them. The first is the one being made. */
  queue: QueuedRun[]
}

/** The factory's own orders, first in first made (the order the line takes them in `stepProduction`). */
export const factoryOrders = (g: GameState): ProductionOrder[] => g.orders.filter((o) => o.mode === 'factory' && orderLeft(o) > 0)

export function factoryNow(g: GameState): FactoryNow {
  const line = factoryLine(g)
  const running = !!line?.running && line.throughput > 0
  const queue: QueuedRun[] = factoryOrders(g).map((o) => {
    const p = g.products.find((x) => x.id === o.productId)
    const use = TYPES[p?.type ?? 'phone'].capacity
    return { id: o.id, productId: o.productId, name: p?.name ?? 'A device', done: o.done, quantity: o.quantity, share: o.quantity > 0 ? o.done / o.quantity : 0, days: running ? Math.ceil((orderLeft(o) * use) / line!.throughput) : null }
  })
  const n = queue.length
  if (!running) {
    const problem = line?.problem ?? 'The line has no output.'
    if (n) return { state: 'stopped', text: 'Stopped', tone: 'neg', why: `${n === 1 ? `${queue[0].name} is` : `${n} runs are`} on order and cannot be built. ${problem}`, queue }
    return { state: 'none', text: 'No line', tone: 'warn', why: problem, queue }
  }
  if (!n) return { state: 'idle', text: 'Idle', why: 'Nothing is on order for the factory. Order a run from a device under Devices, Mine and choose your own factory.', queue }
  const first = queue[0]
  return { state: 'making', text: `${first.name}: ${pct(first.share, 0)}`, why: `${int(first.done)} of ${int(first.quantity)} built.${n > 1 ? ` ${n - 1} more ${n === 2 ? 'run is' : 'runs are'} on order after it.` : ''}`, queue }
}

/** The factory's status strip: what it is making, output, quality, upkeep. */
export function factoryStatus(g: GameState): Figure[] {
  if (!g.factory) return []
  const line = factoryLine(g)
  const now = factoryNow(g)
  const on = !!line?.running
  return [
    { label: 'Making', value: now.text, tone: now.tone, title: now.why },
    { label: 'Output a day', value: on ? num(line!.throughput) : '--', title: 'Phones a day at full output. Bigger devices take more of the line each.' },
    { label: 'Quality', value: on ? pct(1 - line!.defectRate) : '--', tone: on && line!.defectRate > 0.03 ? 'warn' : undefined, title: on ? `${pct(line!.defectRate)} of what the line builds is faulty. Test stations bring that down.` : 'There is no working line to measure.' },
    { label: 'Upkeep a month', value: money(upkeep(g.factory)) },
  ]
}

// ------------------------------------------------------------------ stores

/** A store as the picker and every sentence name it: "Fifth Avenue, North America". */
export const storeLabel = (s: Pick<Store, 'name' | 'region'>) => `${s.name}, ${regionInfo(s.region).name}`

/** The store formula's constants (see footfall in src/sim/retail.ts), for the words on the Stores page. */
export { CONVERSION, DOOR_MIN, PULL_MIN } from '../sim/retail'
import { CONVERSION, DOOR_MIN, PULL_MIN } from '../sim/retail'

/** How passers-by become visitors, for the whole game: the words behind the "?" on the Stores page. */
export const VISITORS_HELP = `Passers-by a day is the foot traffic of the site. Visitors a day is how many of them come in: ${pct(PULL_MIN, 0)} of them where the region does not know your name, rising to all of them where everyone does, and never more than the store's display tables and demo pods can serve. Low appeal then turns up to ${pct(1 - DOOR_MIN, 0)} of those away at the door. Up to ${pct(CONVERSION, 0)} of visitors buy a device: fewer in a store with low appeal, or when the devices on the shelves are old or a poor fit.`

/** The same for one store: which of the three is holding its visitors down. */
export function visitorsNote(passers: number, capacity: number, open: boolean): string {
  if (!open) return `${int(passers)} people pass this site a day. None come in while the store is closed.`
  if (capacity < passers * PULL_MIN) return `${int(passers)} people pass this site a day and the store can serve only ${int(capacity)} of them. Add display tables or demo pods to let more in; appeal decides how many of those stay.`
  return `${int(passers)} people pass this site a day. More of them come in as the region gets to know your name, up to the ${int(capacity)} the store can serve; appeal decides how many of those stay.`
}

/**
 * The name of the profit figure: it says that it is a projection whenever it
 * is one. `storeMonth` gives the month in progress projected to its end (the
 * simulation keeps no closed month per store), and says so with `partial`.
 */
export const profitLabel = (partial: boolean) => (partial ? 'Projected profit this month' : 'Profit last month')
/** The same in a sentence, for a tooltip or a note. */
export const monthNote = (partial: boolean) => (partial ? 'This month, projected to its end from what the store has sold so far and what it sells in a day now.' : 'The last full month.')
/** What a store's profit counts and what it leaves out. */
export const PROFIT_NOTE = 'Revenue less what the devices sold here cost to build, the rent and upkeep of the plot, and the wages of the people its fixtures need: what the store adds to the company profit.'

/** Green above nothing, red below it. */
export const signTone = (v: number): 'pos' | 'neg' | undefined => (v < 0 ? 'neg' : v > 0 ? 'pos' : undefined)

/** Visitors a day as every plate and strip gives it: yesterday's count, or the expected day when there is none yet. */
export const visitorsADay = (store: Pick<Store, 'lastVisitors'>, m: StoreMonth) => store.lastVisitors || m.visitors / DAYS_PER_MONTH

/** One store's status strip: profit first, then revenue and who came in. A store that cannot trade says so before anything else. */
export function storeStatus(g: GameState, store: Store): Figure[] {
  const st = storeStats(store.site)
  const m = storeMonth(g, store.id)
  const out: Figure[] = []
  if (!st.open) out.push({ label: 'Store', value: 'Not trading', tone: 'neg', title: st.problem })
  out.push(
    { label: profitLabel(m.partial), value: money(m.profit), tone: signTone(m.profit), title: `${monthNote(m.partial)} ${PROFIT_NOTE}` },
    { label: 'Revenue', value: money(m.revenue), title: `${monthNote(m.partial)} Costs ${money(m.costs)} a month.` },
    { label: 'Visitors a day', value: num(visitorsADay(store, m)), title: visitorsNote(tierOf(store.site).traffic ?? 0, st.capacity, st.open) },
  )
  return out
}

/** What a copy of a layout comes to, in words: a price, or what comes back when the fittings cleared are worth more than the copy. */
export const copyCost = (cost: number) => (cost >= 0 ? money(cost) : `${money(-cost)} back`)

/** "a plant site", "an arena site": a site's name inside a sentence. */
export const aSite = (name: string) => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name.toLowerCase()}`

// ------------------------------------------------------------------ venue

/**
 * What the starter stage is made of: the pieces `autoVenue` (src/sim/game.ts)
 * places. The simulation does not say what they come to before it charges
 * for them, so the price on the button is added up here from the same list
 * prices; a test holds the two together.
 */
const STARTER_STAGE: Record<string, number> = { screen: 1, stage: 1, lights: 2, speakers: 2, seats: 4, seats_mid: 4, seats_high: 4 }
export const starterStageCost = () => Object.entries(STARTER_STAGE).reduce((a, [kind, n]) => a + (ITEMS.venue[kind]?.cost ?? 0) * n, 0)

/**
 * The next event the company has booked, of any kind, soonest first: the same
 * one the venue's plate in the city names. `here` says whether it is a keynote
 * on the company's own stage; `where` is the sentence for a tooltip.
 */
export function nextEvent(g: GameState): { event: GameEvent; name: string; date: string; here: boolean; where: string } | null {
  const event = g.events.filter((e) => !e.done).sort((a, b) => a.day - b.day)[0]
  if (!event) return null
  const def = EVENTS[event.type]
  const here = event.type === 'keynote' && event.venue === OWN_VENUE
  const device = event.type === 'keynote' ? g.products.find((p) => p.id === event.productId)?.name : undefined
  const place = here ? 'Held on your own stage.' : `Held elsewhere: ${def.venues[event.venue]?.name.toLowerCase() ?? 'a hired venue'}.`
  return { event, name: def.name, date: fmtDate(event.day), here, where: `${def.name}${device ? ` for ${device}` : ''}. ${place}` }
}

/** The venue's status strip: the next event and its date, seats, and whether a keynote can be held here. */
export function venueStatus(g: GameState, book?: () => void): Figure[] {
  if (!g.venue) return []
  const st = venueStats(g.venue)
  const next = nextEvent(g)
  // a keynote booked on a stage that cannot hold it is the one thing here that is urgent
  const stuck = !st.ready && g.events.some((e) => !e.done && e.type === 'keynote' && e.venue === OWN_VENUE)
  return [
    { label: 'Next event', value: next ? `${next.name}: ${next.date}` : 'Nothing booked', title: next ? next.where : 'Events are booked under Marketing, Events.', onClick: book },
    { label: 'Seats', value: int(st.seats) },
    { label: 'Stage', value: st.ready ? 'Ready' : 'Not ready', tone: st.ready ? undefined : stuck ? 'neg' : 'warn', title: st.ready ? 'A keynote can be held here.' : `${st.problem ?? ''}${stuck ? ' A keynote is booked here and cannot be held until then.' : ''}` },
  ]
}
