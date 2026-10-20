// The company's own stores: who walks past, who comes in, who buys, and what
// that leaves after the devices, the rent and the staff are paid for. One
// formula, used by the daily tick (game.ts), the launch forecast and the
// Stores screen (insight.ts), so the three never disagree.
import { DAYS_PER_MONTH } from '../data/catalog'
import { bestSegment, lifecycle, tierAverages } from './market'
import { homeRegion, regionIncome } from './regions'
import { STORE_WAGE, type StoreStats, TILE_UPKEEP, builtTiles, storeStats, tierOf } from './sites'
import { execFx } from './staff'
import { type GameState, type Product, type Store } from './types'

/** Share of passers-by who come in where the region does not know the company at all (all of them where everyone does). */
export const PULL_MIN = 0.35
/** Share of the people at the door that the least appealing store still lets in. */
export const DOOR_MIN = 0.6
/** Visitors who buy a device, in a store of full appeal selling devices people want (6 in 100: shoppers browse far more than they buy, but a store of the right size still pays its way). */
export const CONVERSION = 0.06
/** Accessories sold with each device, for each accessory wall up to three. */
export const ACCESSORY = 6

/** People a day at each step from the pavement to the door. */
export interface Footfall {
  passers: number
  /** Of those, the ones the brand draws towards the door. */
  drawn: number
  /** What the fixtures can serve in a day. */
  capacity: number
  /** Who comes in: drawn, capped by capacity, less those the store's appeal turns away. */
  visitors: number
}

/** Visitors a day for a store with these stats, on a site with this traffic, where the region's awareness is `aware`. */
export function footfall(stats: Pick<StoreStats, 'capacity' | 'appeal'>, traffic: number, aware: number): Footfall {
  const drawn = traffic * (PULL_MIN + (1 - PULL_MIN) * Math.sqrt(Math.max(0, aware)))
  const visitors = Math.min(stats.capacity, drawn) * (DOOR_MIN + (1 - DOOR_MIN) * stats.appeal)
  return { passers: traffic, drawn, capacity: stats.capacity, visitors }
}

/** Buyers a day out of `visitors`, given how much the devices on the shelves draw on average (0-1.3). */
export const storeBuyers = (visitors: number, appeal: number, draw: number) => visitors * CONVERSION * appeal * Math.min(1.2, draw)

/** How strongly a device of ours draws a store's visitors today. */
export const storeDraw = (s: GameState, p: Product) => Math.max(0, Math.min(1.3, bestSegment(p, s.companies[0], s.day).u)) * lifecycle(s.day - p.launchDay)

/** What a store costs a month: the rent of the plot, the upkeep of its building and the wages of its staff, with the Head of Sales' effect. */
export function storeCosts(s: GameState, st: Store, stats = storeStats(st.site)): { rent: number; upkeep: number; wages: number; total: number } {
  const k = execFx(s).outposts
  const rent = tierOf(st.site).rent * k
  const upkeep = builtTiles(st.site) * TILE_UPKEEP * st.site.floors * k
  const wages = stats.wages * k
  return { rent, upkeep, wages, total: rent + upkeep + wages }
}

/** Why a store makes what it makes: each step of the day in numbers, and a month's books. */
export interface StoreTrade {
  stats: StoreStats
  flow: Footfall
  /** Average draw of the devices in stock (0-1.3), and how many are in stock. */
  draw: number
  stocked: number
  /** Expected each day. */
  buyers: number
  /** A month at today's pace. */
  units: number
  revenue: number
  /** What the units sold cost to build. */
  cogs: number
  /** Revenue less what the devices cost: what is left to pay the store with. */
  gross: number
  costs: { rent: number; upkeep: number; wages: number; total: number }
  profit: number
  /** Kept per device sold, and what that device cost. */
  perUnit: number
  costPerUnit: number
}

/** A store's trade at today's footfall, stock, prices and costs, from the same formula the tick uses. */
export function storeTrade(s: GameState, st: Store): StoreTrade {
  const stats = storeStats(st.site)
  const costs = storeCosts(s, st, stats)
  const local = s.regions[st.region] ?? s.regions[homeRegion(s)]
  const flow = stats.open ? footfall(stats, tierOf(st.site).traffic ?? 0, local?.awareness ?? 0) : { passers: tierOf(st.site).traffic ?? 0, drawn: 0, capacity: stats.capacity, visitors: 0 }
  const stocked = s.products.filter((p) => p.companyId === 'player' && p.status === 'sale' && p.stock > 0)
  const w = stocked.map((p) => storeDraw(s, p))
  const total = w.reduce((a, b) => a + b, 0)
  const draw = stocked.length ? total / stocked.length : 0
  const buyers = stats.open && total > 0 ? storeBuyers(flow.visitors, stats.appeal, draw) : 0
  const keep = regionIncome(s, st.region)
  const extras = ACCESSORY * Math.min(stats.shelves, 3)
  let perUnit = 0
  let costPerUnit = 0
  if (total > 0)
    stocked.forEach((p, i) => {
      perUnit += (w[i] / total) * (tierAverages(p).price * keep + extras)
      costPerUnit += (w[i] / total) * (p.unitCost + tierAverages(p).extraCost)
    })
  const units = buyers * DAYS_PER_MONTH
  const revenue = units * perUnit
  const cogs = units * costPerUnit
  return { stats, flow, draw, stocked: stocked.length, buyers, units, revenue, cogs, gross: revenue - cogs, costs, profit: revenue - cogs - costs.total, perUnit, costPerUnit }
}

/** One thing holding a store back, with what to do about it. Most costly first. */
export interface StoreAdvice {
  id: 'closed' | 'stock' | 'capacity' | 'awareness' | 'appeal' | 'devices' | 'margin' | 'rent' | 'staff'
  text: string
}

/**
 * What keeps a store from making money, in the order worth fixing. Empty for
 * a store that pays its way with nothing obvious to improve.
 */
export function storeAdvice(s: GameState, st: Store, t = storeTrade(s, st)): StoreAdvice[] {
  const out: StoreAdvice[] = []
  if (!t.stats.open) return [{ id: 'closed', text: t.stats.problem ?? 'The store is not trading.' }]
  if (!t.stocked) out.push({ id: 'stock', text: 'Nothing is in stock: a store with empty shelves sells nothing. Order a production run under Devices.' })
  if (t.flow.capacity < t.flow.drawn * 0.9) out.push({ id: 'capacity', text: `${Math.round(t.flow.drawn)} people a day would come in, and the fixtures serve ${Math.round(t.flow.capacity)}. Add display tables (70 each) or demo pods (30) on the sales floor.` })
  const aware = s.regions[st.region]?.awareness ?? 0
  if (aware < 0.3 && t.flow.capacity >= t.flow.drawn * 0.9) out.push({ id: 'awareness', text: `Only ${Math.round(aware * 100)}% of people here know your name, so most walk past. Campaigns in this region bring more of them in.` })
  if (t.stats.appeal < 0.75) out.push({ id: 'appeal', text: `Appeal is ${Math.round(t.stats.appeal * 100)}%: it turns people away at the door and halves how many buy. Add plants, benches or a logo wall, and keep the floor from getting crowded.` })
  if (t.stocked && t.draw < 0.5) out.push({ id: 'devices', text: 'Visitors are not keen on what is on the shelves: the devices in stock fit their buyers poorly or are old. A newer or better-priced device sells more.' })
  if (t.stocked && t.perUnit > 0 && t.costPerUnit > t.perUnit * 0.85) out.push({ id: 'margin', text: `Each device sold here brings in ${Math.round(t.perUnit)} and cost ${Math.round(t.costPerUnit)} to build: too thin a margin to pay for a shop. Raise prices or build cheaper.` })
  if (t.profit < 0 && t.costs.rent > t.gross * 0.6) out.push({ id: 'rent', text: `Rent is ${Math.round(t.costs.rent / 1e3)}k a month against ${Math.round(Math.max(0, t.gross) / 1e3)}k left after the devices are paid for. ${st.site.tier > 0 ? 'A cheaper site with the same layout, or ' : ''}more visitors (fixtures, awareness) would cover it.` })
  if (t.profit < 0 && t.costs.wages > t.costs.total * 0.4 && t.costs.wages > t.gross * 0.4) out.push({ id: 'staff', text: `Staff cost ${Math.round(t.costs.wages / 1e3)}k a month: every checkout, support bar and repair bench needs someone (${Math.round(STORE_WAGE / 1e3 * 10) / 10}k each), and more of them than the store's trade needs costs more than it brings in.` })
  return out
}
