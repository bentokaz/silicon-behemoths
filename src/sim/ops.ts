// Operations: component supply prices, production orders, and the two ways to
// get devices built (a contract manufacturer or your own factory line).
import { TYPES } from '../data/devices'
import { clamp, rand, range } from './rng'
import { type LineStats, lineStats } from './sites'
import { type CostParts, type GameState, type Product, type ProductionOrder, SUPPLY_CATS, type SupplyCat, type SupplyState } from './types'

/** A contract manufacturer charges a margin, needs lead time, and ships at a fixed pace. */
export const CONTRACT = { premium: 1.1, leadDays: 10, perDay: 2500, defectRate: 0.025 }
/** Building it yourself saves the contractor's margin. */
export const FACTORY_SAVING = 0.9
export const LOCK_FEE = 150e3
export const LOCK_DAYS = 360

export function newSupply(): SupplyState {
  const each = <T,>(v: () => T) => Object.fromEntries(SUPPLY_CATS.map((c) => [c, v()])) as Record<SupplyCat, T>
  return { index: each(() => 1), shock: each(() => 0), shockDays: each(() => 0), locks: {}, history: each(() => [1] as number[]) }
}

/** Market price multiplier for a category: its base level plus any shortage. */
export const marketPrice = (sup: SupplyState, cat: SupplyCat) => sup.index[cat] + sup.shock[cat]

/** The price multiplier the company actually pays for a component category today. */
export function supplyPrice(s: GameState, cat: SupplyCat): number {
  const lock = s.supply.locks[cat]
  return lock && lock.until > s.day ? lock.value : marketPrice(s.supply, cat)
}

/** Cost to build one unit at today's component prices, before any manufacturing margin. */
export function costNow(s: GameState, parts: CostParts): number {
  let total = parts.other
  for (const c of SUPPLY_CATS) total += parts[c] * supplyPrice(s, c)
  return total
}

/** Daily: prices wander around normal, and now and then a shortage hits one category. */
export function stepSupply(s: GameState): { cat: SupplyCat; started: boolean }[] {
  const sup = s.supply
  const notes: { cat: SupplyCat; started: boolean }[] = []
  for (const c of SUPPLY_CATS) {
    sup.index[c] = clamp(sup.index[c] + (1 - sup.index[c]) * 0.01 + range(s, -0.004, 0.004), 0.8, 1.25)
    if (sup.shockDays[c] > 0) {
      if (--sup.shockDays[c] === 0) notes.push({ cat: c, started: false })
    } else if (sup.shock[c] > 0.005) {
      // once the shortage ends, prices ease back over a few months
      sup.shock[c] *= 0.97
    } else if (rand(s) < 1 / 1100) {
      sup.shock[c] = range(s, 0.25, 0.7)
      sup.shockDays[c] = Math.round(range(s, 100, 220))
      notes.push({ cat: c, started: true })
    } else sup.shock[c] = 0
  }
  if (s.day % 30 === 0) {
    for (const c of SUPPLY_CATS) {
      sup.history[c].push(Math.round(marketPrice(sup, c) * 1000) / 1000)
      if (sup.history[c].length > 36) sup.history[c].shift()
    }
  }
  return notes
}

export const factoryLine = (s: GameState): LineStats | null => (s.factory ? lineStats(s.factory) : null)

/** What one unit of a product costs to make, by route. */
export function buildCost(s: GameState, p: Product, mode: ProductionOrder['mode']): number {
  return costNow(s, p.costParts) * (mode === 'contract' ? CONTRACT.premium : FACTORY_SAVING)
}

export const orderLeft = (o: ProductionOrder) => o.quantity - o.done
/** Units on order for a product that have not been delivered yet. */
export const pendingUnits = (s: GameState, productId: string) => s.orders.filter((o) => o.productId === productId).reduce((a, o) => a + orderLeft(o), 0)

export interface ProductionResult {
  cost: number
  runCost: number
  made: number
  /** Product ids whose orders just completed. */
  finished: string[]
  /** True if work stopped today because the company could not pay for it. */
  stalled: boolean
}

/**
 * Daily: advance every order. `afford` answers whether a sum can still be paid;
 * production is paid for as units come off the line.
 */
export function stepProduction(s: GameState, afford: (amount: number) => boolean): ProductionResult {
  const out: ProductionResult = { cost: 0, runCost: 0, made: 0, finished: [], stalled: false }
  if (!s.orders.length) return out
  const line = factoryLine(s)
  let capacity = line?.running ? line.throughput : 0
  const fullCapacity = capacity
  const deliver = (o: ProductionOrder, p: Product, units: number, unitCost: number, defectRate: number) => {
    if (units <= 0) return
    const bill = units * unitCost
    if (!afford(out.cost + bill)) {
      out.stalled = true
      return
    }
    // the product's fault rate is the average over everything ever built for it
    const before = p.stock + p.unitsSold
    p.defectRate = (p.defectRate * before + defectRate * units) / (before + units)
    p.stock += units
    o.done += units
    out.cost += bill
    out.made += units
  }
  for (const o of s.orders) {
    const p = s.products.find((x) => x.id === o.productId)
    if (!p || p.status === 'ended') {
      o.done = o.quantity
      continue
    }
    const use = TYPES[p.type].capacity
    if (o.mode === 'contract') {
      if (s.day - o.placedDay < CONTRACT.leadDays) continue
      deliver(o, p, Math.min(orderLeft(o), Math.floor(CONTRACT.perDay / use)), buildCost(s, p, 'contract'), CONTRACT.defectRate)
    } else if (capacity > 0 && line) {
      const units = Math.min(orderLeft(o), Math.floor(capacity / use))
      deliver(o, p, units, buildCost(s, p, 'factory'), line.defectRate)
      capacity -= units * use
    }
    if (orderLeft(o) <= 0) out.finished.push(o.productId)
  }
  if (line?.running && fullCapacity > 0) out.runCost = line.runCost * ((fullCapacity - capacity) / fullCapacity)
  s.orders = s.orders.filter((o) => orderLeft(o) > 0)
  return out
}
