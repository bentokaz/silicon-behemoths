// What the Devices screens work out that is not drawing: who ranks where in a
// market, which rows are pinned, how families are grouped and ordered, what a
// price change does, what is on order for a device. Kept apart from the
// components so it can be tested without a page. Profit, the "why" lines and
// the suggested reorder are NOT here: they come from sim/insight.
import { TYPES, segmentInfo } from '../data/devices'
import { RETAIL_CUT } from '../sim/game'
import { OUTSIDE_OPTION, attraction, bestSegment, priceFactor, tierAverages } from '../sim/market'
import { CONTRACT, factoryLine, orderLeft } from '../sim/ops'
import { priceIndex } from '../sim/world'
import { type Company, type GameState, type Product, type ProductionOrder, hasStock } from '../sim/types'
import { type SortDir, type SortKey, sortRows } from './tablesort'

// ---------------------------------------------------------------- small things

/** A review score out of ten, always with its one decimal: 8.9, 7.0. Nothing yet is "--". */
export const score = (v: number) => (Number.isFinite(v) && v > 0 ? (Math.round(v * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '--')

/** Units a device sold in its last closed month, or so far this month when none has closed. */
export const lastMonth = (p: Pick<Product, 'history' | 'monthUnits'>) => p.history.at(-1) ?? p.monthUnits

/**
 * What a device's status says when it is NOT the default. A device on sale
 * with stock says nothing: a list whose every row reads "On sale" says nothing.
 */
export function statusNote(p: Pick<Product, 'status' | 'stock' | 'companyId' | 'devDaysLeft' | 'recall'>): { text: string; tone: 'neg' | 'warn' | 'dim' } | null {
  if (p.status === 'dev') return { text: `In development, ${p.devDaysLeft} ${p.devDaysLeft === 1 ? 'day' : 'days'}`, tone: 'warn' }
  if (p.status === 'ended') return { text: 'Ended', tone: 'dim' }
  if (p.companyId !== 'player') return null
  if (p.recall?.state === 'open') return { text: 'Recall', tone: 'neg' }
  if (p.stock <= 0) return { text: 'Sold out', tone: 'neg' }
  return null
}

/** What a company makes, in words: "Phones, tablets +3". `full` is every kind, for the tooltip. */
export function makesText(types: readonly string[], show = 2): { short: string; full: string } {
  const names = types.map((t) => TYPES[t as keyof typeof TYPES]?.plural ?? t)
  if (!names.length) return { short: '--', full: '' }
  const lower = (s: string, i: number) => (i === 0 ? s : s.toLowerCase())
  const full = names.map(lower).join(', ')
  if (names.length <= show) return { short: full, full }
  return { short: `${names.slice(0, show).map(lower).join(', ')} +${names.length - show}`, full }
}

// ---------------------------------------------------------------- ranking and pinning

/** Each row's place in a list ordered best first: 1, 2, 3. Rows that tie keep the order they came in. */
export function rankBy<R>(rows: readonly R[], key: (r: R) => string, value: (r: R) => number): Map<string, number> {
  const order = rows.map((r, at) => ({ r, at })).sort((a, b) => value(b.r) - value(a.r) || a.at - b.at)
  return new Map(order.map((x, i) => [key(x.r), i + 1]))
}

/** The rows split in two, order kept: the player's own first, then everyone else. */
export function pinMine<R>(rows: readonly R[], mine: (r: R) => boolean): { mine: R[]; rest: R[] } {
  return { mine: rows.filter(mine), rest: rows.filter((r) => !mine(r)) }
}

export interface MarketView {
  /** Everything of the type on sale, best first. */
  ranked: Product[]
  /** Place of each device in that order, from 1. */
  rank: Map<string, number>
  /** Share of a buyer's choice each device wins today, when a segment is chosen. */
  win?: Map<string, number>
  mine: Product[]
  rest: Product[]
}

/**
 * One device type's market: everything on sale ranked by last month's units,
 * or, with a segment chosen, by how much of a buyer's choice it wins today
 * (the sales model's own weights; a device with nothing in stock wins none).
 * The player's devices are pinned ahead of the rest, each keeping its rank.
 */
export function marketView(g: GameState, type: string, segId?: string): MarketView {
  const onSale = g.products.filter((p) => p.status === 'sale' && p.type === type)
  const seg = segId ? segmentInfo(segId) : undefined
  let win: Map<string, number> | undefined
  if (seg) {
    win = new Map()
    let total = OUTSIDE_OPTION
    for (const p of onSale) {
      const c = g.companies.find((x) => x.id === p.companyId)
      const w = !c || !hasStock(p) ? 0 : attraction(p, c, seg, g.day)
      win.set(p.id, w)
      total += w
    }
    for (const [k, w] of win) win.set(k, w / total)
  }
  const value = (p: Product) => (win ? (win.get(p.id) ?? 0) : lastMonth(p))
  const rank = rankBy(onSale, (p) => p.id, value)
  const ranked = [...onSale].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  return { ranked, rank, win, ...pinMine(ranked, (p) => p.companyId === 'player') }
}

// ---------------------------------------------------------------- families

export interface Family<R> {
  key: string
  /** The family's name, or null for the rows that are the only model of theirs. */
  label: string | null
  rows: R[]
}

/**
 * Rows gathered by family. A family with two or more models gets a heading;
 * the devices that are the only model of their family go together at the end
 * under no heading of their own (the caller names that group), so a table of
 * one-model lines is a plain list and never thirteen headings over thirteen rows.
 */
export function families<R>(rows: readonly R[], family: (r: R) => string): { groups: Family<R>[]; grouped: boolean } {
  const by = new Map<string, R[]>()
  for (const r of rows) by.set(family(r), [...(by.get(family(r)) ?? []), r])
  const many = [...by].filter(([, list]) => list.length > 1).map(([key, list]) => ({ key, label: key, rows: list }))
  const single = [...by].filter(([, list]) => list.length === 1).map(([, list]) => list[0])
  if (!many.length) return { groups: [{ key: '', label: null, rows: single }], grouped: false }
  return { groups: single.length ? [...many, { key: '', label: null, rows: single }] : many, grouped: true }
}

/**
 * Families in the order of a sorted column: each stands where its best row
 * would (the table itself orders the rows inside each). The group of
 * one-model devices stays last.
 */
export function orderFamilies<R>(groups: readonly Family<R>[], key: SortKey<R> | undefined, dir: SortDir): Family<R>[] {
  if (!key) return [...groups]
  const named = groups.filter((g) => g.label !== null)
  const loose = groups.filter((g) => g.label === null)
  const best = named.map((g) => ({ g, top: sortRows(g.rows, key, dir)[0] }))
  const order = sortRows(best, (x) => key(x.top), dir)
  return [...order.map((x) => x.g), ...loose]
}

// ---------------------------------------------------------------- price

/** How the share of buyers a device wins changes when its pull is multiplied: from `w` out of `total` to `w * by` out of the same field. */
export function shareChange(w: number, total: number, by: number): number {
  if (w <= 0 || total <= 0) return by
  const before = w / total
  const after = (w * by) / (total - w + w * by)
  return after / before
}

/** A change in buyers in words: "about 12% fewer buyers". Under 2% either way is no real change. */
export function buyersWords(ratio: number): string {
  if (!Number.isFinite(ratio)) return ''
  const change = ratio - 1
  if (Math.abs(change) < 0.02) return 'about the same number of buyers'
  const shown = Math.round(Math.abs(change) * 100)
  if (change > 0) return change >= 1 ? `about ${(Math.round(ratio * 10) / 10).toLocaleString('en-US')} times the buyers` : `about ${shown}% more buyers`
  return `about ${Math.min(99, shown)}% fewer buyers`
}

export interface PriceEffect {
  /** What the company keeps on a unit at the new price, after the retailers' cut and the cost of building it. */
  margin: number
  marginNow: number
  /** Buyers at the new price against buyers now: 1 is no change. */
  buyers: number
  words: string
  /** What buyers of its segment expect to pay today. */
  typical: number
  segment: string
}

/**
 * What a new price does to a device. The margin is the average price paid
 * across its storage options (they move with the base price), less the
 * retailers' cut and `unitCost` (pass `reorderQuote(...).unitCost`). The change
 * in buyers comes from the sales model's own price curve: the device's pull in
 * its segment is multiplied by (priceFactor new / priceFactor now) to the power
 * 3.5, the same way the model treats a local price, and weighed against
 * everything else of its type on sale today.
 */
export function priceEffect(g: GameState, p: Product, next: number, unitCost: number): PriceEffect {
  const maker = (g.companies.find((c) => c.id === p.companyId) ?? g.companies[0]) as Company
  const seg = (p.segment ? segmentInfo(p.segment) : undefined) ?? bestSegment(p, maker, g.day).seg
  const index = priceIndex(g.day)
  const marginAt = (base: number) => {
    const delta = base - p.price
    const avg = tierAverages({ price: base, tiers: p.tiers.map((t) => ({ ...t, price: t.price + delta })), design: p.design })
    return avg.price * (1 - RETAIL_CUT) - unitCost - avg.extraCost
  }
  const to = Math.max(1, next)
  const by = Math.pow(priceFactor(to / index, seg) / priceFactor(Math.max(1, p.price) / index, seg), 3.5)
  let total = OUTSIDE_OPTION
  let mine = 0
  for (const x of g.products) {
    if (x.status !== 'sale' || x.type !== p.type || (!hasStock(x) && x.id !== p.id)) continue
    const c = g.companies.find((k) => k.id === x.companyId)
    if (!c) continue
    const w = attraction(x, c, seg, g.day)
    total += w
    if (x.id === p.id) mine = w
  }
  const buyers = to === p.price ? 1 : shareChange(mine, total, by)
  const typical = seg.priceRef * index
  return { margin: marginAt(to), marginNow: marginAt(p.price), buyers, words: buyersWords(buyers), typical: typical < 200 ? Math.round(typical / 5) * 5 : Math.round(typical / 10) * 10, segment: seg.name }
}

// ---------------------------------------------------------------- what is on order

/**
 * Days until the last unit of an order is in the warehouse, or null when it
 * cannot move (a factory order with the line stopped). A contract maker starts
 * after its lead time and ships a fixed number a day; the factory works
 * through its queue in order, so the orders ahead are counted.
 */
export function orderDays(g: GameState, o: ProductionOrder): number | null {
  const p = g.products.find((x) => x.id === o.productId)
  if (!p) return null
  const use = TYPES[p.type].capacity
  if (o.mode === 'contract') return Math.max(0, CONTRACT.leadDays - (g.day - o.placedDay)) + Math.ceil(orderLeft(o) / Math.max(1, Math.floor(CONTRACT.perDay / use)))
  const line = factoryLine(g)
  if (!line?.running || line.throughput <= 0) return null
  let ahead = 0
  for (const x of g.orders) {
    const q = g.products.find((y) => y.id === x.productId)
    if (x.mode === 'factory' && q) ahead += orderLeft(x) * TYPES[q.type].capacity
    if (x === o) break
  }
  return Math.max(1, Math.ceil(ahead / line.throughput))
}

/** Everything on order for one device: the units still to come and when the last of them lands (null: the line is stopped). */
export function onOrder(g: GameState, productId: string): { units: number; days: number | null } | null {
  const list = g.orders.filter((o) => o.productId === productId)
  if (!list.length) return null
  const days = list.map((o) => orderDays(g, o))
  return { units: list.reduce((a, o) => a + orderLeft(o), 0), days: days.some((d) => d === null) ? null : Math.max(...(days as number[])) }
}

/** "in 6 days", "tomorrow". */
export const inDays = (days: number) => (days <= 1 ? 'tomorrow' : `in ${days} days`)

// ---------------------------------------------------------------- market share

export interface ShareSeries {
  /** One row per month: the label and each line's share in percent. */
  data: Record<string, number | string>[]
  /** The lines, in order: the player, the leading rivals, everyone else. `id` is a company id, or 'others'. */
  lines: { id: string; name: string; color?: string; last: number }[]
}

/**
 * Market share by units, as the player against the leading rivals and
 * everyone else in one band: the player's line can be found whatever its size.
 * The leaders are the `top` rivals by units over the months shown.
 */
export function shareSeries(history: readonly { month: number; units: Record<string, number> }[], companies: readonly Pick<Company, 'id' | 'name' | 'color' | 'isPlayer'>[], label: (month: number) => string, top = 5, months = 36): ShareSeries {
  const rows = history.slice(-months)
  const sum = (id: string) => rows.reduce((a, r) => a + (r.units[id] ?? 0), 0)
  const me = companies.find((c) => c.isPlayer)
  const leaders = companies
    .filter((c) => !c.isPlayer && sum(c.id) > 0)
    .sort((a, b) => sum(b.id) - sum(a.id))
    .slice(0, top)
  const named = [...(me ? [me] : []), ...leaders]
  const pct1 = (v: number, total: number) => Math.round((v / total) * 1000) / 10
  const data = rows.map((r) => {
    const total = Object.values(r.units).reduce((a, b) => a + b, 0) || 1
    const row: Record<string, number | string> = { month: label(r.month) }
    let shown = 0
    for (const c of named) {
      row[c.id] = pct1(r.units[c.id] ?? 0, total)
      shown += r.units[c.id] ?? 0
    }
    row.others = pct1(Math.max(0, total - shown), total)
    return row
  })
  const last = data.at(-1)
  const lines = [...named.map((c) => ({ id: c.id, name: c.name, color: c.isPlayer ? undefined : c.color, last: Number(last?.[c.id] ?? 0) })), { id: 'others', name: 'Others', last: Number(last?.others ?? 0) }]
  return { data, lines }
}
