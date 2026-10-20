// Figures the screens show that the simulation does not store: what a store
// earns, why a device sells the way it does, what to reorder, how a design
// might sell, and what in the company needs the player. Everything here is
// read-only: nothing mutates the GameState, nothing touches its dice, and
// every function is cheap enough to call while drawing a screen.
//
// Where the simulation does not record what a figure needs (a store's takings,
// what a past production run cost), the function says so in its comment and
// gives an estimate built from the simulation's own formulas.
import { DAYS_PER_MONTH, SUPPLY_LABELS, marketLevel } from '../data/catalog'
import { OUTLETS, type SegmentInfo, TYPES, segmentInfo, segmentsOf } from '../data/devices'
import { int, money, num, pct, price as exact } from '../components/format'

/** A device's name with its maker in front, unless the name already starts with the maker's. */
const fullName = (maker: string, device: string) => (device.toLowerCase().startsWith(maker.toLowerCase()) ? device : `${maker} ${device}`)
import { TRADE_PULL, careBonus, careSatisfaction } from './care'
import { DIFFICULTY, RETAIL_CUT, devPlan, fmtDate, player } from './game'
import { CHANNELS, EVENTS, FAN_CYCLE, OWN_VENUE, dailyTickets, productSatisfaction } from './growth'
import { researchLines } from './life'
import { OUTSIDE_OPTION, bestSegment, hypeLift, launchHype, lifecycle, normalised, priceFactor, pull, segmentDemand, tierAverages, utility } from './market'
import { CONTRACT, FACTORY_SAVING, contractPerDay, buildCost, costNow, factoryLine, marketPrice, orderLeft, pendingUnits } from './ops'
import { has, vacantSeats } from './progress'
import { REGIONS, homeRegion, regionIncome, regionTaste, rivalReach } from './regions'
import { clamp } from './rng'
import { evaluate } from './scoring'
import { type LineStats, sealedRooms, storeStats, tierOf, upkeep, venueStats } from './sites'
import { EXECS, execFx, staffEffects, unmanaged } from './staff'
import { founderStake } from './stock'
import { softwareBonus } from './tech'
import { footfall, storeBuyers, storeTrade } from './retail'
import { priceIndex, typeDemand } from './world'
import { type Company, type DeviceDesign, type GameState, type Product, type ProductionOrder, SUBS, SUPPLY_CATS, type Store, hasStock } from './types'

// ---------------------------------------------------------------- small helpers

const own = (g: GameState) => g.products.filter((p) => p.companyId === 'player')
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
/** A count in words a sentence can start with: "One device", "3 devices". */
const count = (n: number, one: string, many: string) => `${n === 1 ? 'One' : int(n)} ${plural(n, one, many)}`
/** A count inside a sentence: 1 day, 3 days. */
const qty = (n: number, one: string, many: string) => `${int(n)} ${plural(n, one, many)}`
const months = (days: number) => Math.max(1, Math.round(days / DAYS_PER_MONTH))
/** Days of the month in progress that have been played. 0 on the day a month closes. */
const daysIn = (g: GameState) => g.day % DAYS_PER_MONTH

/** A number rounded up to a tidy figure: a multiple of half its power of ten (3,400 is 3,500; 12,300 is 15,000). */
function tidyUp(n: number): number {
  if (n <= 0) return 0
  const step = Math.pow(10, Math.floor(Math.log10(n))) / 2
  return Math.ceil(n / Math.max(1, step) - 1e-9) * Math.max(1, step)
}
/** A number to two significant figures. */
function sig2(n: number): number {
  if (n <= 0) return 0
  const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1))
  return Math.round(n / step) * step
}
/** A price rounded to the nearest $5 (under $200) or $10. */
const roundPrice = (v: number) => (v < 200 ? Math.round(v / 5) * 5 : Math.round(v / 10) * 10)

/** The segment a device is sold to: the one fixed at release, or the best fit while it is still a design. */
function segmentOf(g: GameState, p: Product, maker: Pick<Company, 'brand' | 'software'>): SegmentInfo {
  return (p.segment ? segmentInfo(p.segment) : undefined) ?? bestSegment(p, maker, g.day).seg
}
/** What buyers of a segment expect to pay on a given day. */
const typical = (seg: SegmentInfo, day: number) => roundPrice(seg.priceRef * priceIndex(day))

/** Full months a device has been on sale that the books have closed (its launch month counts once it has closed). */
function closedMonths(g: GameState, p: Product): number {
  if (p.status === 'dev') return 0
  const end = p.status === 'ended' && p.endDay !== undefined ? p.endDay : g.day
  return Math.max(0, Math.floor(end / DAYS_PER_MONTH) - Math.floor(Math.max(0, p.launchDay) / DAYS_PER_MONTH) + (p.status === 'ended' && Math.floor(end / DAYS_PER_MONTH) < Math.floor(g.day / DAYS_PER_MONTH) ? 1 : 0))
}

/**
 * Units a device sells in a month at its recent pace: the average of its last
 * three closed months on sale, or the month in progress scaled to a whole
 * month once a week of it has passed, whichever is higher. A device that has
 * been sold out reads low here, because lost sales are not recorded.
 */
function monthlyRate(g: GameState, p: Product): number {
  if (p.status !== 'sale') return 0
  const recent = productTrend(g, p).slice(-3)
  const past = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0
  const d = daysIn(g)
  const age = g.day - p.launchDay
  const span = Math.min(d, age)
  const now = span >= 7 ? (p.monthUnits / span) * DAYS_PER_MONTH : 0
  return Math.max(past, now)
}

/** Days until the first units of an order arrive, or Infinity when it cannot move (a factory order with the line stopped). */
function firstArrival(g: GameState, o: ProductionOrder, line: LineStats | null): number {
  const p = g.products.find((x) => x.id === o.productId)
  if (!p) return Infinity
  if (o.mode === 'contract') return Math.max(1, CONTRACT.leadDays - (g.day - o.placedDay))
  if (!line?.running || line.throughput <= 0) return Infinity
  const use = TYPES[p.type].capacity
  let ahead = 0
  for (const x of g.orders) {
    if (x === o) break
    const q = g.products.find((y) => y.id === x.productId)
    if (x.mode === 'factory' && q) ahead += orderLeft(x) * TYPES[q.type].capacity
  }
  return Math.max(1, Math.ceil((ahead + use) / line.throughput))
}

/** The day the news said a device sold out, if the log still holds it. */
function soldOutDay(g: GameState, p: Product): number | undefined {
  return g.news.find((n) => n.productId === p.id && n.kind === 'alert' && n.text.includes('is sold out'))?.day
}

// ---------------------------------------------------------------- stores

/** What a store took and cost. `month` is the last full month if there is one, else the month so far. */
export interface StoreMonth {
  revenue: number
  /** What the devices it sold cost to build. */
  cogs: number
  /** Running costs: rent, upkeep and wages. */
  costs: number
  profit: number
  units: number
  visitors: number
  partial: boolean
}

const noMonth = (): StoreMonth => ({ revenue: 0, cogs: 0, costs: 0, profit: 0, units: 0, visitors: 0, partial: true })

/**
 * One store's month. The simulation keeps no books per store: it records only
 * the units a store has sold in the month in progress (reset when the month
 * closes) and yesterday's visitors. So there is never a "last full month" to
 * read, and `partial` is always true: the figures are THE MONTH IN PROGRESS,
 * PROJECTED TO ITS END. Label them "this month, projected".
 *
 * - `units`: what the store has sold this month so far (recorded, exact) plus
 *   the days left at today's expected daily sales (storeTrade, sim/retail.ts).
 * - `revenue`: an estimate. Units times what the store keeps per unit at
 *   today's mix of stocked devices: the average price paid across storage
 *   options, times the share kept after local pricing and duties, plus the
 *   accessories sold with each device. No retailer's cut: the store is yours.
 * - `cogs`: units times what those devices cost to build today.
 * - `costs`: exact for the present layout. Rent and upkeep of the plot plus
 *   the wages its fixtures need, with the Head of Sales' effect, for a whole
 *   month.
 * - `visitors`: yesterday's footfall times thirty (an estimate).
 * - `profit`: revenue minus cogs minus costs: what the store adds to the
 *   company's profit.
 *
 * An unknown store id gives zeros.
 */
export function storeMonth(g: GameState, storeId: string): StoreMonth {
  const st = g.stores.find((x) => x.id === storeId)
  if (!st) return noMonth()
  const t = storeTrade(g, st)
  const left = DAYS_PER_MONTH - daysIn(g)
  const units = st.monthUnits + t.buyers * left
  // before anything is in stock there is no mix to price the recorded units with: they are priced at the last known average
  const fall = t.perUnit ? null : fallbackPerUnit(g, st)
  const perUnit = t.perUnit || (fall?.price ?? 0)
  const costPerUnit = t.perUnit ? t.costPerUnit : (fall?.cost ?? 0)
  const revenue = units * perUnit
  const cogs = units * costPerUnit
  const costs = t.costs.total
  return { revenue, cogs, costs, profit: revenue - cogs - costs, units: Math.round(units), visitors: Math.round((t.flow.visitors || st.lastVisitors) * DAYS_PER_MONTH), partial: true }
}

/** What a store keeps and pays per unit when nothing is in stock to price it by: the average over every device on sale. */
function fallbackPerUnit(g: GameState, st: Store): { price: number; cost: number } {
  const sale = own(g).filter((p) => p.status === 'sale')
  if (!sale.length) return { price: 0, cost: 0 }
  return { price: (sale.reduce((a, p) => a + tierAverages(p).price, 0) / sale.length) * regionIncome(g, st.region), cost: sale.reduce((a, p) => a + p.unitCost, 0) / sale.length }
}

/** The same for every store, summed. With no stores, zeros. */
export function storesMonth(g: GameState): StoreMonth {
  const out = noMonth()
  for (const st of g.stores) {
    const m = storeMonth(g, st.id)
    out.revenue += m.revenue
    out.cogs += m.cogs
    out.costs += m.costs
    out.profit += m.profit
    out.units += m.units
    out.visitors += m.visitors
  }
  return out
}

// ---------------------------------------------------------------- why a device sells as it does

/** Why a device is selling the way it is: the reasons that matter, most important first. Always at least one line. */
export interface Why {
  kind: 'dev' | 'soldout' | 'recall' | 'price' | 'awareness' | 'rival' | 'lifecycle' | 'new' | 'steady' | 'ended'
  tone: 'neg' | 'warn' | 'pos' | 'dim'
  text: string
}

/** Share of buyers who have heard of the player, over the regions the company sells in. */
function reach(g: GameState): number {
  let share = 0
  let known = 0
  for (const r of REGIONS) {
    const st = g.regions[r.id]
    if (!st?.open) continue
    share += r.share
    known += r.share * st.awareness
  }
  return share > 0 ? known / share : 0
}

/**
 * The reasons behind a device's sales, most important first (bad news before
 * warnings before good news). Works for a rival's device too, where the lines
 * about stock do not apply. Each reason is read from the same quantities the
 * sales model uses:
 *
 * - `dev`: still in development, with its release date; a second line when no production is ordered.
 * - `ended`: discontinued, with the date and what it sold.
 * - `soldout`: nothing in stock (the date comes from the news log, when it still holds it), or under two weeks of stock at the recent pace with nothing on order.
 * - `recall`: a recall decision is open, or was ignored.
 * - `price`: more than 15% above what buyers of its segment expect to pay today (bad past 60%, where the model punishes it hard), or 15% or more below.
 * - `awareness`: fewer than 40% of buyers where the company sells have heard of it (a rival: of the company).
 * - `rival`: another company's device of the same kind that fits this segment better; the newest one from the last six months if there is one.
 * - `lifecycle`: on sale for more than a year, when interest fades; past 18 months buyers expect a successor.
 * - `new`: in its first 30 days, when launch interest is at its height.
 * - `steady`: nothing above applies.
 */
export function whyLines(g: GameState, p: Product): Why[] {
  const mine = p.companyId === 'player'
  const maker = g.companies.find((c) => c.id === p.companyId) ?? player(g)
  if (p.status === 'dev') {
    const out: Why[] = [{ kind: 'dev', tone: 'dim', text: `In development: on sale in ${qty(Math.max(1, p.devDaysLeft), 'day', 'days')}, on ${fmtDate(g.day + p.devDaysLeft)}.` }]
    if (mine && p.stock <= 0 && !pendingUnits(g, p.id)) out.push({ kind: 'soldout', tone: 'warn', text: 'No production is ordered: it will launch with nothing to sell.' })
    return out
  }
  if (p.status === 'ended') return [{ kind: 'ended', tone: 'dim', text: `Discontinued${p.endDay !== undefined ? ` on ${fmtDate(p.endDay)}` : ''} after ${num(p.unitsSold)} sold.` }]

  const out: Why[] = []
  const age = g.day - p.launchDay
  const rate = monthlyRate(g, p)

  if (mine) {
    const pending = pendingUnits(g, p.id)
    if (p.stock <= 0) {
      const since = soldOutDay(g, p)
      const head = since !== undefined ? `Sold out since ${fmtDate(since)}` : 'Sold out'
      if (!pending) out.push({ kind: 'soldout', tone: 'neg', text: `${head}: nothing is on order.` })
      else {
        const line = factoryLine(g)
        const eta = Math.min(...g.orders.filter((o) => o.productId === p.id).map((o) => firstArrival(g, o, line)))
        out.push({ kind: 'soldout', tone: 'warn', text: Number.isFinite(eta) ? `${head}: ${num(pending)} on order, the first in ${qty(eta, 'day', 'days')}.` : `${head}: ${num(pending)} on order, but the factory line is stopped.` })
      }
    } else if (!pending && rate > 0) {
      const days = p.stock / (rate / DAYS_PER_MONTH)
      if (days < 14) out.push({ kind: 'soldout', tone: 'warn', text: `About ${qty(Math.max(1, Math.round(days)), 'day', 'days')} of stock left and nothing on order.` })
    }
    if (p.recall?.state === 'open') out.push({ kind: 'recall', tone: 'neg', text: 'Faults are spreading: a recall is waiting for your decision.' })
    else if (p.recall?.state === 'ignored') out.push({ kind: 'recall', tone: 'neg', text: 'Its faults were never put right: owners are unhappy with it.' })
  }

  const seg = segmentOf(g, p, maker)
  const usual = typical(seg, g.day)
  const over = p.price / (seg.priceRef * priceIndex(g.day)) - 1
  if (over > 0.15) out.push({ kind: 'price', tone: over > 0.6 ? 'neg' : 'warn', text: `Priced ${pct(over, 0)} above the typical ${exact(usual)} for its segment.` })
  else if (over <= -0.15) out.push({ kind: 'price', tone: 'pos', text: `Priced ${pct(-over, 0)} below the typical ${exact(usual)} for its segment.` })

  const known = mine ? reach(g) : maker.awareness
  if (known < 0.4) out.push({ kind: 'awareness', tone: 'warn', text: mine ? `Only ${pct(known, 0)} of buyers where you sell have heard of you.` : `Only ${pct(known, 0)} of buyers have heard of ${maker.name}.` })

  const rival = strongerRival(g, p, maker, seg)
  if (rival) out.push({ kind: 'rival', tone: 'warn', text: rival })

  if (age > 18 * DAYS_PER_MONTH) out.push({ kind: 'lifecycle', tone: 'warn', text: `On sale for ${months(age)} months: buyers expect a successor.` })
  else if (age > 12 * DAYS_PER_MONTH) out.push({ kind: 'lifecycle', tone: 'dim', text: `On sale for ${months(age)} months: interest is fading.` })
  else if (age <= DAYS_PER_MONTH) out.push({ kind: 'new', tone: 'pos', text: `On sale for ${qty(Math.max(1, age), 'day', 'days')}: launch interest is at its height.` })

  if (!out.length) out.push({ kind: 'steady', tone: rate > 0 ? 'pos' : 'dim', text: rate > 0 ? `Selling steadily: ${num(rate)} a month.` : 'On sale, with no sales recorded yet.' })
  const rank = { neg: 0, warn: 1, pos: 2, dim: 3 }
  return out.map((w, i) => ({ w, i })).sort((a, b) => rank[a.w.tone] - rank[b.w.tone] || a.i - b.i).map((x) => x.w)
}

/** A sentence naming another company's device that fits this device's segment better, or undefined. */
function strongerRival(g: GameState, p: Product, maker: Pick<Company, 'brand' | 'software'>, seg: SegmentInfo): string | undefined {
  const mineU = utility(p, maker, seg, g.day)
  let newest: { x: Product; c: Company } | undefined
  let best: { x: Product; c: Company; u: number } | undefined
  for (const x of g.products) {
    if (x.status !== 'sale' || x.type !== p.type || x.companyId === p.companyId || !hasStock(x)) continue
    const c = g.companies.find((k) => k.id === x.companyId)
    if (!c) continue
    const u = utility(x, c, seg, g.day)
    if (u <= mineU * 1.05) continue
    if (!best || u > best.u) best = { x, c, u }
    if (g.day - x.launchDay <= 6 * DAYS_PER_MONTH && x.launchDay > 0 && (!newest || x.launchDay > newest.x.launchDay)) newest = { x, c }
  }
  if (newest) {
    const ago = g.day - newest.x.launchDay
    return `${fullName(newest.c.name, newest.x.name)} launched ${ago < DAYS_PER_MONTH ? 'this month' : `${months(ago)} ${plural(months(ago), 'month', 'months')} ago`} and scores higher.`
  }
  if (best) return `${fullName(best.c.name, best.x.name)} is the stronger offer for ${seg.name.toLowerCase()} buyers at ${exact(best.x.price)}.`
  return undefined
}

// ---------------------------------------------------------------- a device's figures

/**
 * Units sold in each of the last 12 months, oldest first (shorter if the
 * device is younger). Closed months only: the month in progress is
 * `p.monthUnits` and is not included. Months spent in development are left
 * out, so a device in its first month on sale gives an empty list.
 */
export function productTrend(g: GameState, p: Product): number[] {
  const n = Math.min(12, closedMonths(g, p), p.history.length)
  return n > 0 ? p.history.slice(-n) : []
}

/** What one unit of a device costs to have built today by the way the company builds it, with the Head of Operations' effect. */
function unitBuildCost(g: GameState, p: Product): number {
  const order = g.orders.find((o) => o.productId === p.id)
  const mode: ProductionOrder['mode'] = order ? order.mode : factoryLine(g)?.running ? 'factory' : 'contract'
  return buildCost(g, p, mode) * execFx(g).production
}

/**
 * What a device has earned: last full month and in total. AN ESTIMATE on the
 * cost side, because the simulation does not record what each production run
 * cost or what a device took in each month.
 *
 * - `total`: the device's recorded revenue (exact: what the company kept
 *   after the retailers' cut, local pricing and duties) minus the units sold
 *   times what one unit costs to build TODAY, by the route of its open order
 *   or else the cheapest route open (own factory when the line runs, a
 *   contract maker otherwise).
 * - `month`: the units of the last closed month, each earning the average
 *   revenue per unit the device has had over its life, minus the same build
 *   cost. 0 before a month on sale has closed.
 *
 * Counted: revenue from sales, the cost of building the units sold.
 * Not counted: development, launch marketing and campaigns, warranty repairs,
 * the dearer storage options' extra parts, unsold stock, console and handheld
 * game royalties, store running costs.
 */
export function productProfit(g: GameState, p: Product): { month: number; total: number } {
  if (p.companyId !== 'player' || p.unitsSold <= 0) return { month: 0, total: 0 }
  const cost = unitBuildCost(g, p)
  const perUnit = p.revenue / p.unitsSold
  const last = productTrend(g, p).at(-1) ?? 0
  return { month: last * (perUnit - cost), total: p.revenue - p.unitsSold * cost }
}

/** The fewest units `suggestReorder` proposes. The simulation itself accepts any run of one unit or more. */
export const SMALLEST_RUN = 100
/** The largest run the interface lets anyone type (the same bound as `MAX_RUN` in components/format). */
const LARGEST_RUN = 50_000_000

/**
 * A sensible number of units to order now: about three months of recent sales
 * (see the pace below), less what is in stock and on order, rounded up to a
 * tidy figure, never below `SMALLEST_RUN`. 0 when no order is needed (stock
 * and orders already cover two and a half months) or possible (the device is
 * in development or discontinued, or is not the player's).
 *
 * The pace is the device's recent monthly sales. A device that has been sold
 * out for months has none recorded, so its best month of the last twelve is
 * used instead, and failing that a third of the middle of `demandEstimate`.
 */
export function suggestReorder(g: GameState, p: Product): number {
  if (p.companyId !== 'player' || p.status !== 'sale') return 0
  let rate = monthlyRate(g, p)
  if (p.stock <= 0 || rate <= 0) rate = Math.max(rate, ...productTrend(g, p))
  if (rate <= 0) {
    const est = demandEstimate(g, p.design, p.price)
    rate = (est.low + est.high) / 6
  }
  if (rate <= 0) return 0
  const cover = p.stock + pendingUnits(g, p.id)
  const need = rate * 3 - cover
  if (need < rate * 0.5) return 0
  return Math.min(LARGEST_RUN, Math.max(SMALLEST_RUN, tidyUp(need)))
}

/**
 * What ordering `units` would cost now and when the last of them would
 * arrive, by the cheapest way open to the company: its own factory when the
 * line is running (it builds at 90% of cost), otherwise a contract maker (110%).
 *
 * - `unitCost`: today's component prices times the route's rate and the Head
 *   of Operations' effect, to the cent. It moves with component prices while
 *   the order is being filled, because units are paid for as they arrive.
 * - `cost`: units times unitCost.
 * - `days`: a contract maker starts delivering after its lead time and ships
 *   2,500 phone-sized units a day for each order; the factory works through
 *   its queue in order at the line's daily output, so orders ahead are counted.
 * - `refused`: the simulation's own reason when it would not take the order.
 */
export function reorderQuote(g: GameState, p: Product, units: number): { cost: number; unitCost: number; days: number; mode: 'contract' | 'factory'; refused?: string } {
  const line = factoryLine(g)
  const use = TYPES[p.type].capacity
  const perDayFactory = line?.running ? Math.floor(line.throughput / use) : 0
  const mode: 'contract' | 'factory' = perDayFactory >= 1 ? 'factory' : 'contract'
  const unitCost = Math.round(buildCost(g, p, mode) * execFx(g).production * 100) / 100
  const n = Math.max(0, Math.floor(units))
  let days = 0
  if (n > 0) {
    if (mode === 'contract') days = CONTRACT.leadDays - 1 + Math.ceil(n / Math.max(1, Math.floor(contractPerDay(g) / use)))
    else {
      let ahead = 0
      for (const o of g.orders) {
        const q = g.products.find((y) => y.id === o.productId)
        if (o.mode === 'factory' && q) ahead += orderLeft(o) * TYPES[q.type].capacity
      }
      days = Math.max(1, Math.ceil((ahead + n * use) / line!.throughput))
    }
  }
  const refused = p.companyId !== 'player' || p.status === 'ended' ? 'Product is not available' : n <= 0 ? 'Enter a quantity' : undefined
  return { cost: n * unitCost, unitCost, days, mode, ...(refused ? { refused } : {}) }
}

/**
 * The parts of a unit's cost at launch: what the design costs to build at
 * today's component prices, and what the maker adds. `premiumRate` is the
 * maker's rate with the Head of Operations' effect folded in: about +0.10 for
 * a contract maker, and about -0.10 for the company's own factory, where the
 * "premium" is a saving and is negative. `total` is build plus premium.
 */
export function unitCostParts(g: GameState, design: DeviceDesign, mode: 'contract' | 'factory'): { build: number; premium: number; premiumRate: number; total: number } {
  const ev = evaluate(design, g.levels, marketLevel(g.day), g.features, g.chips)
  const build = costNow(g, ev.costParts)
  const premiumRate = (mode === 'contract' ? CONTRACT.premium : FACTORY_SAVING) * execFx(g).production - 1
  const premium = build * premiumRate
  return { build, premium, premiumRate, total: build + premium }
}

// ---------------------------------------------------------------- how a design might sell

/** What the launch plan adds to an estimate. Everything is optional. */
export interface LaunchPlan {
  /** One-off launch budget: it lifts awareness on the day and feeds launch hype. Default 0. */
  marketing?: number
  /** Hype from a launch keynote, 0 to 1. Default 0. */
  hype?: number
  /** How the first run is built, which sets the fault rate. Default: the factory when its line runs, else a contract maker. */
  mode?: 'contract' | 'factory'
  /** True when the design joins a family already on sale (a shorter development). */
  variant?: boolean
}

/** How far below and above the middle of the forecast the range reaches. Set from the test's hit rate. */
const RANGE = { low: 0.7, high: 1.4 }

/**
 * An honest range for how many units a design at a price would sell in its
 * first three months on sale, with what it is based on.
 *
 * It runs the sales model itself, ahead of time and without dice, from the
 * day the design would come out of development: every segment of its device
 * type in every region chooses between it and everything on sale today, fans
 * and the company's stores buy as they do in the game, and awareness grows
 * with the sales and with the campaigns now running. Review scores are taken
 * at their expected value. The middle of that forecast is widened to
 * `low`..`high` (70% to 140% of it), because the things it cannot know move
 * the outcome: the rivals that launch in the meantime, the luck of the
 * reviews, research and hires that land before release, campaigns started
 * later. It assumes stock never runs out. See the test for how often the
 * simulation lands inside the range.
 *
 * `typicalPrice` is what buyers of the design's best segment expect to pay at
 * release. The fourth argument is optional and was added because the launch
 * budget and a keynote change the answer.
 */
export function demandEstimate(g: GameState, design: DeviceDesign, price: number, plan: LaunchPlan = {}): { low: number; high: number; months: 3; typicalPrice: number; note: string } {
  const me = player(g)
  const fx = staffEffects(g)
  const launchDay = g.day + devPlan(design, g, plan.variant).days
  const now = evaluate(design, g.levels, marketLevel(g.day), g.features, g.chips)
  const then = evaluate(design, g.levels, marketLevel(launchDay), g.features, g.chips)
  const raw = { ...then.raw, design: then.raw.design * (1 + fx.polish) }
  const software = softwareBonus(g) + careBonus(g)
  const line = factoryLine(g)
  const mode = plan.mode ?? (line?.running ? 'factory' : 'contract')
  const p: Product = {
    id: 'estimate', companyId: 'player', type: design.type, name: '', family: '', variant: '', design, price: Math.max(1, Math.round(price)), tiers: [],
    unitCost: now.unitCost, costParts: now.costParts, status: 'sale', devDaysLeft: 0, launchDay, raw, featureBonus: now.featureBonus,
    designPct: then.report.pct, weight: then.report.weight, lifeHours: then.report.lifeHours, diag: then.report.diag, reviews: [], reviewAvg: 0,
    stock: 1e12, carry: 0, unitsSold: 0, revenue: 0, marketing: Math.max(0, plan.marketing ?? 0), hype: clamp(plan.hype ?? 0, 0, 1), buzz: {},
    defectRate: mode === 'factory' && line?.running ? line.defectRate : CONTRACT.defectRate, satisfaction: 0.7, feedback: [], monthUnits: 0, history: [], segUnits: {},
  }
  // reviews at their expected value: the outlets' formula without its dice
  const before = { brand: me.brand, software }
  const n = normalised(p.raw, launchDay)
  const fit = bestSegment(p, before, launchDay)
  let sum = 0
  for (const o of OUTLETS) {
    let nw = 0
    for (const k of SUBS) nw += o.weights[k] * n[k]
    const blend = (1 - o.value) * Math.min(1.2, nw / fit.seg.expect) + o.value * Math.min(1.25, fit.u)
    sum += clamp(10 * (0.16 + 0.62 * blend), 1, 10)
  }
  p.reviewAvg = sum / OUTLETS.length
  // a release moves the brand toward its reviews, and owners' satisfaction follows the reviews and the fault rate
  const maker = { brand: clamp(me.brand * 0.7 + (p.reviewAvg / 10) * 0.3, 0.05, 1), software }
  const tickets = dailyTickets(g)
  const supportGap = tickets > 0 ? clamp(1 - (fx.support + 20) / tickets, 0, 1) : 0
  const stores = g.stores.map((st) => ({ st, stats: storeStats(st.site) }))
  p.satisfaction = clamp(productSatisfaction(p, software, supportGap, stores.filter((s) => s.stats.hasSupport).length, g.os.own && g.os.features.includes('updates')) + careSatisfaction(g), 0, 1)
  p.segment = bestSegment(p, maker, launchDay).seg.id

  const mid = forecast(g, p, maker, launchDay, fx.marketing, stores)
  const seg = segmentInfo(p.segment)
  const rivals = g.products.filter((x) => x.status === 'sale' && x.type === design.type && x.companyId !== 'player').length
  const note = `For ${seg.name.toLowerCase()} buyers, if stock lasts: ${pct(reach(g), 0)} of buyers where you sell have heard of you, ${qty(rivals, 'rival device', 'rival devices')} of this kind ${plural(rivals, 'is', 'are')} on sale, and reviews should come in near ${int(Math.round(p.reviewAvg))} out of 10.`
  return { low: sig2(mid * RANGE.low), high: Math.max(sig2(mid * RANGE.high), sig2(mid * RANGE.low)), months: 3, typicalPrice: typical(seg, launchDay), note }
}

/**
 * The sales model run forward for the 90 days after `launchDay` without its
 * dice, in nine steps of ten days. Returns the units the device `p` (which is
 * not in the game) would sell. The company's own devices age; rivals' ranges are
 * taken as they stand today, because rivals replace their devices all the time.
 */
function forecast(g: GameState, p: Product, maker: Pick<Company, 'brand' | 'software'>, launchDay: number, skill: number, stores: { st: Store; stats: ReturnType<typeof storeStats> }[]): number {
  const me = player(g)
  const home = homeRegion(g)
  const gain = DIFFICULTY[g.config.difficulty].awareness
  const segs = segmentsOf(p.type)
  const companies = new Map(g.companies.map((c) => [c.id, c]))
  const pool = g.products.filter((x) => x.status === 'sale' && x.type === p.type && hasStock(x) && companies.has(x.companyId))
  const stocked = own(g).filter((x) => x.status === 'sale' && x.stock > 0)

  // what the campaigns now running add to awareness each day, by region ('' is every open region)
  const campaign: Record<string, number> = {}
  for (const c of g.campaigns) {
    const frac = 1 - Math.exp((-(c.monthly / DAYS_PER_MONTH) * CHANNELS[c.channel].reach * skill * (c.target === 'brand' ? 1.5 : 0.6)) / 9e6)
    campaign[c.region ?? ''] = (campaign[c.region ?? ''] ?? 0) + frac * gain
  }
  const campaignDaily = (id: string, share: number) => Math.min(0.5, campaign[''] ?? 0) + Math.min(0.5, (campaign[id] ?? 0) / share)

  // awareness on launch day: today's, plus the campaigns over the months of development, plus the launch budget
  const aw: Record<string, number> = {}
  const dev = Math.max(0, launchDay - g.day)
  const bump = Math.min(0.5, 1 - Math.exp(-p.marketing / 25e6))
  for (const r of REGIONS) {
    const st = g.regions[r.id]
    if (!st?.open) continue
    let a = st.awareness
    a = 1 - (1 - a) * Math.pow(1 - Math.min(1, campaignDaily(r.id, r.share)), dev)
    aw[r.id] = clamp(a + (1 - a) * bump, 0, 1)
  }

  const STEP = 10
  let total = 0
  for (let k = 0; k < 9; k++) {
    const t = launchDay + k * STEP + STEP / 2
    const age = t - launchDay
    const econ = g.economy && t <= g.economy.until ? g.economy.mult : 1
    const hype = launchHype(p, t)
    const sold: Record<string, number> = {}
    let mine = 0

    for (const seg of segs) {
      const demand = segmentDemand(seg, t) * typeDemand(seg.type) * (seg.sens > 1.9 ? Math.sqrt(econ) : econ)
      const base = pull(p, maker, seg, t)
      const rivals: { c: Company; w: number }[] = []
      const siblings: { x: Product; b: number; h: number }[] = []
      for (const x of pool) {
        const c = companies.get(x.companyId)!
        // rivals renew their ranges all the time: theirs are taken as they stand today, ours age
        const at = c.isPlayer ? t : g.day
        const b = pull(x, c, seg, at)
        if (b <= 0) continue
        const h = launchHype(x, at)
        if (c.isPlayer) siblings.push({ x, b, h })
        else rivals.push({ c, w: b * Math.min(1, c.awareness + h) * hypeLift(h) })
      }
      for (const r of REGIONS) {
        let others = OUTSIDE_OPTION
        for (const q of rivals) others += q.w * rivalReach(q.c, r.id)
        const st = g.regions[r.id]
        let ours = 0
        let w = 0
        if (st?.open) {
          const local = (x: Product) => (st.priceAdj === 1 ? 1 : Math.pow(priceFactor(x.price * st.priceAdj, seg) / priceFactor(x.price, seg), 3.5))
          for (const s of siblings) ours += s.b * Math.min(1, aw[r.id] + s.h) * hypeLift(s.h) * local(s.x)
          w = base * Math.min(1, aw[r.id] + hype) * hypeLift(hype) * local(p)
        }
        if (w + ours <= 0) continue
        const buyers = demand * r.share * regionTaste(r, seg)
        const all = others + ours + w
        mine += (buyers * w) / all
        sold[r.id] = (sold[r.id] ?? 0) + (buyers * (w + ours)) / all
      }
    }

    // fans and the company's own stores choose between everything of ours in stock
    const draw = (x: Product, c: Pick<Company, 'brand' | 'software'>) => clamp(bestSegment(x, c, t).u, 0, 1.3) * lifecycle(t - x.launchDay)
    const dMine = draw(p, maker)
    const dOthers = stocked.map((x) => draw(x, me))
    const choices = stocked.length + 1
    if (g.fans > 0) {
      const wMine = dMine * (age <= 45 ? 3 : 1)
      const all = wMine + stocked.reduce((a, x, i) => a + dOthers[i] * (t - x.launchDay <= 45 ? 3 : 1), 0)
      if (all > 0) {
        const buyers = (g.fans / FAN_CYCLE) * Math.min(1, all / choices) * (g.care.tradeIn ? TRADE_PULL : 1)
        mine += (buyers * wMine) / all
        sold[home] = (sold[home] ?? 0) + buyers
      }
    }
    const allDraw = dMine + dOthers.reduce((a, b) => a + b, 0)
    if (allDraw > 0) {
      for (const { st, stats } of stores) {
        if (!stats.open) continue
        const known = aw[st.region] ?? aw[home] ?? 0
        const visitors = footfall(stats, tierOf(st.site).traffic ?? 0, known).visitors
        const buyers = storeBuyers(visitors, stats.appeal, allDraw / choices)
        mine += (buyers * dMine) / allDraw
        sold[st.region] = (sold[st.region] ?? 0) + buyers
      }
    }

    // being seen: sales and campaigns make the next sale easier, region by region
    const talk = clamp(p.price / 350, 0.8, 1.5)
    for (const r of REGIONS) {
      if (aw[r.id] === undefined) continue
      const daily = Math.min(1, (((sold[r.id] ?? 0) * talk) / (4.5e6 * r.share)) * gain * skill + g.fans / 4e7 + campaignDaily(r.id, r.share))
      aw[r.id] = clamp(1 - (1 - aw[r.id]) * Math.pow(1 - daily, STEP), 0, 1)
    }
    total += mine * STEP
  }
  return total
}

// ---------------------------------------------------------------- what needs the player

/** Everything that needs the player, grouped: eight sold-out devices are ONE item with a count, not eight. Each item belongs to a place in the city. */
export interface Attention {
  id: string
  place: 'campus' | 'port' | 'factory' | 'store' | 'research' | 'venue' | 'exchange' | 'marketing'
  tone: 'neg' | 'warn'
  text: string
  count: number
  where: { tab: string; view?: string }
  productIds?: string[]
  personIds?: string[]
  storeId?: string
}

/** Days a store must have traded before a loss counts as a pattern rather than a start. */
const STORE_SETTLE_DAYS = 3 * DAYS_PER_MONTH

/**
 * Everything that needs the player, bad news first, one item per kind of
 * trouble with a count (a store or a recall is its own place, so stores get an
 * item each). It covers what `badge()` in Shell.tsx and `todos()` in
 * Overview.tsx count, and adds stock running low, stores and the venue.
 * `where` uses the screen ids of store/nav.ts; for the factory screen `view`
 * is 'orders', 'supply' or 'floor'.
 *
 * Ids: soldout, lowstock, nostock (in development with nothing ordered),
 * recall, raises, nodesk, sealed, nolead, vacant, morale, noresearch, shortage,
 * line, store-loss:<id>, store-shut:<id>, venue, board, debt.
 *
 * Two are estimates. "Nearly sold out" uses the recent monthly pace. "A store
 * losing money" cannot look back three months, because the simulation keeps no
 * store books: it flags a store open for three months or more whose month, as
 * projected by `storeMonth`, loses money.
 */
export function attention(g: GameState): Attention[] {
  const out: Attention[] = []
  const mine = own(g)
  const names = (ps: Product[]) => (ps.length === 1 ? ps[0].name : count(ps.length, 'device', 'devices'))
  const verb = (ps: Product[], one: string, many: string) => (ps.length === 1 ? one : many)

  // ---- port: stock and component supply
  const soldOut = mine.filter((p) => p.status === 'sale' && p.stock <= 0 && !pendingUnits(g, p.id))
  if (soldOut.length) out.push({ id: 'soldout', place: 'port', tone: 'neg', text: `${names(soldOut)} ${verb(soldOut, 'is', 'are')} sold out with nothing on order.`, count: soldOut.length, where: { tab: 'factory', view: 'orders' }, productIds: soldOut.map((p) => p.id) })
  const low = mine.filter((p) => {
    if (p.status !== 'sale' || p.stock <= 0 || pendingUnits(g, p.id)) return false
    const rate = monthlyRate(g, p)
    return rate > 0 && p.stock / (rate / DAYS_PER_MONTH) < 14
  })
  if (low.length) out.push({ id: 'lowstock', place: 'port', tone: 'warn', text: `${names(low)} ${verb(low, 'has', 'have')} under two weeks of stock and nothing on order.`, count: low.length, where: { tab: 'factory', view: 'orders' }, productIds: low.map((p) => p.id) })
  const unstocked = mine.filter((p) => p.status === 'dev' && p.stock <= 0 && !pendingUnits(g, p.id))
  if (unstocked.length) out.push({ id: 'nostock', place: 'port', tone: 'warn', text: `${names(unstocked)} will launch with no stock: order a production run.`, count: unstocked.length, where: { tab: 'factory', view: 'orders' }, productIds: unstocked.map((p) => p.id) })
  const short = SUPPLY_CATS.filter((c) => g.supply.shockDays[c] > 0 && !(g.supply.locks[c] && g.supply.locks[c]!.until > g.day))
  if (short.length) {
    const worst = short.reduce((a, c) => (marketPrice(g.supply, c) > marketPrice(g.supply, a) ? c : a), short[0])
    out.push({ id: 'shortage', place: 'port', tone: 'warn', text: short.length === 1 ? `${SUPPLY_LABELS[worst]} are in short supply: prices are ${pct(marketPrice(g.supply, worst) - 1, 0)} above normal.` : `${count(short.length, 'kind', 'kinds')} of component are in short supply: ${SUPPLY_LABELS[worst].toLowerCase()} cost ${pct(marketPrice(g.supply, worst) - 1, 0)} more than normal.`, count: short.length, where: { tab: 'factory', view: 'supply' } })
  }

  // ---- factory
  const line = factoryLine(g)
  const waiting = g.orders.filter((o) => o.mode === 'factory')
  if (waiting.length && !line?.running) out.push({ id: 'line', place: 'factory', tone: 'neg', text: `${count(waiting.length, 'factory order is', 'factory orders are')} waiting but the line is stopped.`, count: waiting.length, where: { tab: 'factory', view: 'floor' }, productIds: [...new Set(waiting.map((o) => o.productId))] })

  // ---- marketing: recalls are decided under Owners
  const recalls = mine.filter((p) => p.recall?.state === 'open')
  if (recalls.length) out.push({ id: 'recall', place: 'marketing', tone: 'neg', text: `Faults in ${names(recalls)} are spreading: decide on a recall under Marketing, Owners.`, count: recalls.length, where: { tab: 'care' }, productIds: recalls.map((p) => p.id) })

  // ---- campus: people, desks, rooms, seats
  const fx = staffEffects(g)
  const asks = g.staff.filter((e) => e.ask)
  if (asks.length) out.push({ id: 'raises', place: 'campus', tone: 'warn', text: `${count(asks.length, 'person is', 'people are')} asking for a raise.`, count: asks.length, where: { tab: 'staff', view: 'team' }, personIds: asks.map((e) => e.id) })
  if (fx.idle > 0) out.push({ id: 'nodesk', place: 'campus', tone: 'warn', text: `${count(fx.idle, 'person has', 'people have')} no desk and ${plural(fx.idle, 'is', 'are')} doing nothing.`, count: fx.idle, where: { tab: 'office' }, personIds: g.staff.slice(fx.seats).map((e) => e.id) })
  const sealed = sealedRooms(g.office).length
  if (sealed) out.push({ id: 'sealed', place: 'campus', tone: 'warn', text: `${count(sealed, 'room on the Campus has', 'rooms on the Campus have')} no door: nothing inside counts.`, count: sealed, where: { tab: 'office' } })
  const loose = unmanaged(g)
  if (loose) out.push({ id: 'nolead', place: 'campus', tone: 'warn', text: `${count(loose, 'person has', 'people have')} no team lead and ${plural(loose, 'works', 'work')} at 90%.`, count: loose, where: { tab: 'staff', view: 'teams' } })
  const vacant = vacantSeats(g)
  if (vacant.length) out.push({ id: 'vacant', place: 'campus', tone: 'warn', text: vacant.length === 1 ? `The ${EXECS[vacant[0]].title} seat is empty.` : `${count(vacant.length, 'executive seat is', 'executive seats are')} empty.`, count: vacant.length, where: { tab: 'staff', view: 'execs' } })
  if (g.staff.length && fx.morale < 40) out.push({ id: 'morale', place: 'campus', tone: 'neg', text: 'Morale is low: people may quit.', count: 1, where: { tab: 'staff', view: 'policy' } })

  // ---- research
  if (has(g, 'research') && !g.activeResearch.length && (g.rdBudget > 0 || g.staff.some((e) => e.role === 'researcher' && !e.exec))) {
    out.push({ id: 'noresearch', place: 'research', tone: 'warn', text: g.rdBudget > 0 ? `No research is running: ${money(g.rdBudget)} a month is going unspent.` : 'No research is running: your researchers have nothing to work on.', count: 1, where: { tab: 'research', view: 'tech' } })
  }

  // ---- stores
  for (const st of g.stores) {
    const stats = storeStats(st.site)
    if (!stats.open) {
      out.push({ id: `store-shut:${st.id}`, place: 'store', tone: 'warn', text: `${st.name} is not trading: ${(stats.problem ?? 'it is not finished.').replace(/^./, (c) => c.toLowerCase())}`, count: 1, where: { tab: 'stores' }, storeId: st.id })
      continue
    }
    if (g.day - st.openedDay < STORE_SETTLE_DAYS) continue
    const m = storeMonth(g, st.id)
    if (m.profit < 0) out.push({ id: `store-loss:${st.id}`, place: 'store', tone: 'warn', text: `${st.name} is losing about ${money(-m.profit)} a month.`, count: 1, where: { tab: 'stores' }, storeId: st.id })
  }

  // ---- venue
  if (g.venue) {
    const v = venueStats(g.venue)
    if (!v.ready && g.events.some((e) => !e.done && e.type === 'keynote' && e.venue === OWN_VENUE)) out.push({ id: 'venue', place: 'venue', tone: 'neg', text: `A keynote is booked at your venue but it is not ready: ${(v.problem ?? 'finish it.').replace(/^./, (c) => c.toLowerCase())}`, count: 1, where: { tab: 'venue' } })
  }

  // ---- exchange: the board and the bank
  const answerable = founderStake(g) < 0.5 && g.stock.investors.length + (g.stock.listed ? 1 : 0) > 0
  if (g.stock.lowDays > 0) out.push({ id: 'board', place: 'exchange', tone: 'neg', text: 'The board has lost confidence in you.', count: 1, where: { tab: 'shares' } })
  else if (answerable && g.stock.confidence <= 25) out.push({ id: 'board', place: 'exchange', tone: 'warn', text: `The board's confidence is low: ${int(g.stock.confidence)} out of 100.`, count: 1, where: { tab: 'shares' } })
  if (g.cash < 0 && !g.config.unlimitedMoney) {
    const limit = DIFFICULTY[g.config.difficulty].debtDays
    out.push({ id: 'debt', place: 'exchange', tone: 'neg', text: `In debt by ${money(-g.cash)} for ${qty(g.debtDays, 'day', 'days')}: bankruptcy follows after ${int(limit)}.`, count: 1, where: { tab: 'finance' } })
  }

  return out.map((a, i) => ({ a, i })).sort((x, y) => (x.a.tone === y.a.tone ? x.i - y.i : x.a.tone === 'neg' ? -1 : 1)).map((x) => x.a)
}

// ---------------------------------------------------------------- the city's plates

/** One plate per owned place in the city: what that building would say about itself in two short lines. */
export interface Plate {
  place: 'campus' | 'port' | 'factory' | 'store' | 'research' | 'venue' | 'exchange'
  id?: string
  title: string
  lines: { text: string; tone?: 'neg' | 'warn' | 'pos' | 'dim' }[]
  needs: number
  where: { tab: string; view?: string }
}

/**
 * One plate per place the company has: the Campus and the Port always;
 * Research once it is open; the Factory and the Venue once their land is
 * bought; one per store (with the store's id); the Exchange once the company
 * is listed or has investors. Each has one or two short lines and `needs`, the
 * number of `attention` items that belong to it (recalls belong to Marketing,
 * which has no building, so they are on no plate).
 */
export function plates(g: GameState): Plate[] {
  const todo = attention(g)
  const needs = (place: Attention['place'], storeId?: string) => todo.filter((a) => a.place === place && (storeId === undefined || a.storeId === storeId)).length
  const out: Plate[] = []
  const mine = own(g)
  const line = factoryLine(g)

  // ---- Campus
  const fx = staffEffects(g)
  const asks = g.staff.filter((e) => e.ask).length
  const free = Math.max(0, fx.seats - g.staff.length)
  out.push({
    place: 'campus',
    title: 'Campus',
    lines: [
      fx.idle > 0 ? { text: `${count(fx.idle, 'person', 'people')} without a desk`, tone: 'warn' } : { text: free ? `${count(free, 'free desk', 'free desks')}` : 'Every desk is taken', tone: 'dim' },
      asks ? { text: `${count(asks, 'raise request', 'raise requests')}`, tone: 'warn' } : { text: g.staff.length ? `${count(g.staff.length, 'person', 'people')} at work` : 'Nobody hired yet', tone: 'dim' },
    ],
    needs: needs('campus'),
    where: { tab: 'office' },
  })

  // ---- Port
  const out0 = mine.filter((p) => p.status === 'sale' && p.stock <= 0).length
  const selling = mine.filter((p) => p.status === 'sale').length
  const next = g.orders.length ? Math.min(...g.orders.map((o) => firstArrival(g, o, line))) : Infinity
  out.push({
    place: 'port',
    title: 'Port',
    lines: [
      out0 ? { text: `${count(out0, 'device', 'devices')} out of stock`, tone: 'neg' } : { text: selling ? 'Everything is in stock' : 'Nothing on sale yet', tone: 'dim' },
      Number.isFinite(next) ? { text: `Next delivery in ${qty(next, 'day', 'days')}`, tone: 'pos' } : { text: g.orders.length ? 'Orders are waiting on the factory line' : 'Nothing on order', tone: g.orders.length ? 'warn' : 'dim' },
    ],
    needs: needs('port'),
    where: { tab: 'factory', view: 'orders' },
  })

  // ---- Factory
  if (g.factory) {
    const job = g.orders.find((o) => o.mode === 'factory')
    const product = job ? g.products.find((p) => p.id === job.productId) : undefined
    const first: Plate['lines'][number] = !line?.running ? { text: line?.problem ?? 'The line is not running.', tone: job ? 'neg' : 'warn' } : job ? { text: `Building ${product?.name ?? 'a device'}: ${pct(job.quantity > 0 ? job.done / job.quantity : 0, 0)} done`, tone: 'pos' } : { text: 'Idle', tone: 'dim' }
    const queued = g.orders.filter((o) => o.mode === 'factory').length
    const second: Plate['lines'][number] = line?.running ? { text: queued > 1 ? `${count(queued - 1, 'more order', 'more orders')} waiting` : `Makes up to ${num(line.throughput)} a day`, tone: 'dim' } : { text: queued ? `${count(queued, 'order', 'orders')} waiting` : 'No orders', tone: queued ? 'warn' : 'dim' }
    out.push({ place: 'factory', title: 'Factory', lines: [first, second], needs: needs('factory'), where: { tab: 'factory', view: 'floor' } })
  }

  // ---- Stores
  for (const st of g.stores) {
    const stats = storeStats(st.site)
    const m = storeMonth(g, st.id)
    out.push({
      place: 'store',
      id: st.id,
      title: st.name,
      lines: stats.open
        ? [
            { text: m.profit >= 0 ? `About ${money(m.profit)} profit this month` : `Losing about ${money(-m.profit)} this month`, tone: m.profit >= 0 ? 'pos' : 'neg' },
            { text: `${num(st.lastVisitors || m.visitors / DAYS_PER_MONTH)} visitors a day`, tone: 'dim' },
          ]
        : [
            { text: 'Not trading', tone: 'warn' },
            { text: stats.problem ?? 'The store is not finished.', tone: 'dim' },
          ],
      needs: needs('store', st.id),
      where: { tab: 'stores' },
    })
  }

  // ---- Research
  if (has(g, 'research')) {
    const running = researchLines(g)
    const lead = running.length ? running.reduce((a, r) => (r.progress > a.progress ? r : a), running[0]) : undefined
    out.push({
      place: 'research',
      title: 'Research',
      lines: lead
        ? [
            { text: `${lead.name}: ${pct(lead.progress, 0)}`, tone: g.rdBudget > 0 ? 'pos' : 'warn' },
            { text: g.rdBudget <= 0 ? 'No budget: nothing is moving' : running.length > 1 ? `${count(running.length - 1, 'more project', 'more projects')} running` : lead.daysLeft !== undefined ? `Done in about ${qty(lead.daysLeft, 'day', 'days')}` : `${money(g.rdBudget)} a month`, tone: g.rdBudget <= 0 ? 'warn' : 'dim' },
          ]
        : [
            { text: 'Nothing running', tone: needs('research') ? 'warn' : 'dim' },
            { text: g.rdBudget > 0 ? `${money(g.rdBudget)} a month unspent` : 'No budget set', tone: 'dim' },
          ],
      needs: needs('research'),
      where: { tab: 'research', view: 'tech' },
    })
  }

  // ---- Venue
  if (g.venue) {
    const v = venueStats(g.venue)
    const ev = g.events.filter((e) => !e.done).sort((a, b) => a.day - b.day)[0]
    out.push({
      place: 'venue',
      title: 'Venue',
      lines: [ev ? { text: `${EVENTS[ev.type].name} on ${fmtDate(ev.day)}`, tone: 'pos' } : { text: 'No event booked', tone: 'dim' }, v.ready ? { text: `Seats ${int(v.seats)}`, tone: 'dim' } : { text: v.problem ?? 'Not ready.', tone: 'warn' }],
      needs: needs('venue'),
      where: { tab: 'venue' },
    })
  }

  // ---- Exchange
  if (g.stock.listed || g.stock.investors.length) {
    const k = g.stock
    const past = k.history.at(-1)
    const change = past ? k.price / past - 1 : 0
    const flat = Math.abs(change) < 0.0005
    out.push({
      place: 'exchange',
      title: 'Exchange',
      lines: [
        { text: `${k.listed ? 'Share price' : 'A share is worth'} ${k.price < 100 ? `$${k.price.toFixed(2)}` : money(k.price)}` },
        past ? { text: flat ? 'Unchanged this month' : `${change > 0 ? 'Up' : 'Down'} ${pct(Math.abs(change))} this month`, tone: flat ? 'dim' : change > 0 ? 'pos' : 'neg' } : { text: `You hold ${pct(founderStake(g), 0)}`, tone: 'dim' },
      ],
      needs: needs('exchange'),
      where: { tab: 'shares' },
    })
  }

  return out
}
