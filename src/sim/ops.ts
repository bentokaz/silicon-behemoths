// Operations: component supply prices, production orders, and the two ways to
// get devices built (a contract manufacturer or your own factory line).
import { TYPES } from '../data/devices'
import { clamp, rand, range } from './rng'
import { partsFactor } from './factoryline'
import { homeRegion, regionInfo } from './regions'
import { type LineStats, lineStats } from './sites'
import { type CostParts, type GameState, type Site, type Product, type ProductionOrder, SUPPLY_CATS, type SupplyCat, type SupplyState } from './types'

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

/** Every factory the company has: the first one, then any plants in other regions. */
export interface PlantRef {
  ref: string
  name: string
  region: string
  site: Site
}
export function plantsOf(s: GameState): PlantRef[] {
  const out: PlantRef[] = []
  if (s.factory) out.push({ ref: 'factory', name: 'Main factory', region: homeRegion(s), site: s.factory })
  for (const p of s.plants ?? []) out.push({ ref: `plant:${p.id}`, name: p.name, region: p.region, site: p.site })
  return out
}

/** A plant's lines with its region's wages folded into the running cost. */
function plantLine(s: GameState, pl: PlantRef): LineStats {
  const st = lineStats(pl.site)
  const wealth = regionInfo(pl.region).wealth
  if (!st.running || Math.abs(wealth - 1) < 1e-6) return st
  return { ...st, runCost: st.runCost + st.plant.wages * (wealth - 1) }
}

/**
 * The company's own production, all factories together: what runs, how much
 * a day, the faults and the cost. With one factory it is that factory's line.
 */
export function factoryLine(s: GameState): LineStats | null {
  const all = plantsOf(s)
  if (!all.length) return null
  if (all.length === 1) return plantLine(s, all[0])
  const stats = all.map((pl) => plantLine(s, pl))
  const first = stats[0]
  const working = stats.filter((x) => x.running)
  if (!working.length) return first.problem ? first : { ...first, problem: stats.find((x) => x.problem)?.problem }
  const throughput = working.reduce((a, x) => a + x.throughput, 0)
  const caps = { smt: 0, assembly: 0, test: 0, pack: 0 }
  for (const x of working) for (const k of Object.keys(caps) as (keyof typeof caps)[]) caps[k] += x.caps[k]
  return {
    ...first,
    running: true,
    problem: undefined,
    caps,
    throughput,
    defectRate: throughput > 0 ? working.reduce((a, x) => a + x.defectRate * x.throughput, 0) / throughput : 0,
    runCost: working.reduce((a, x) => a + x.runCost, 0),
    lines: stats.flatMap((x) => x.lines),
  }
}

/** How many units a day a contract manufacturer delivers on one order: more as the industry grows. */
export const contractPerDay = (s: Pick<GameState, 'day'>) => Math.round(Math.min(30000, CONTRACT.perDay + 3000 * Math.max(0, s.day) / 365))

/** What one unit of a product costs to make, by route. */
export function buildCost(s: GameState, p: Product, mode: ProductionOrder['mode']): number {
  return costNow(s, p.costParts) * (mode === 'contract' ? CONTRACT.premium : FACTORY_SAVING * partsShare(s, p))
}

/**
 * What the components do to a unit's factory cost, averaged over the lines
 * that would build it: those set to it, or else every free line. Around 1;
 * below it when the lines make the parts the device needs.
 */
export function partsShare(s: GameState, p: Product): number {
  let units = 0
  let sum = 0
  for (const pl of plantsOf(s)) {
    const st = lineStats(pl.site)
    if (!st.running) continue
    const lines = st.lines.filter((l) => l.running && l.throughput > 0)
    const mine = lines.filter((l) => pl.site.assign?.[l.id] === p.id)
    for (const l of mine.length ? mine : lines.filter((l) => !pl.site.assign?.[l.id])) {
      const raw = Math.max(1, Math.min(l.caps.smt, l.caps.assembly, l.caps.pack, l.logistics))
      const f = partsFactor(p.type, l.parts, l.throughput / TYPES[p.type].capacity, l.throughput / raw).factor
      units += l.throughput
      sum += f * l.throughput
    }
  }
  return units > 0 ? sum / units : partsFactor(p.type, { chip: 0, display: 0, cell: 0, casing: 0, camera: 0, psu: 0 }, 1, 1).factor
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
 * production is paid for as units come off the line. Every working line of
 * every factory is a share of capacity: a line set to build one device builds
 * that first, a line left free builds whatever is on order, in order. What a
 * unit costs depends on the line: components it makes itself are cheaper than
 * those it buys in.
 */
export function stepProduction(s: GameState, afford: (amount: number) => boolean): ProductionResult {
  const out: ProductionResult = { cost: 0, runCost: 0, made: 0, finished: [], stalled: false }
  if (!s.orders.length) return out
  interface Bucket {
    plant: number
    full: number
    left: number
    defect: number
    parts: LineStats['lines'][number]['parts']
    pace: number
    assign?: string
  }
  const plants = plantsOf(s)
  const stats = plants.map((pl) => plantLine(s, pl))
  const buckets: Bucket[] = []
  stats.forEach((st, i) => {
    if (!st.running) return
    for (const l of st.lines) {
      if (!l.running || l.throughput <= 0) continue
      const raw = Math.max(1, Math.min(l.caps.smt, l.caps.assembly, l.caps.pack, l.logistics))
      const assign = plants[i].site.assign?.[l.id]
      buckets.push({ plant: i, full: l.throughput, left: l.throughput, defect: st.defectRate, parts: l.parts, pace: l.throughput / raw, assign })
    }
  })
  const deliver = (o: ProductionOrder, p: Product, units: number, unitCost: number, defectRate: number) => {
    if (units <= 0) return 0
    const bill = units * unitCost
    if (!afford(out.cost + bill)) {
      out.stalled = true
      return 0
    }
    // the product's fault rate is the average over everything ever built for it
    const before = p.stock + p.unitsSold
    p.defectRate = (p.defectRate * before + defectRate * units) / (before + units)
    p.stock += units
    o.done += units
    out.cost += bill
    out.made += units
    return units
  }
  const live = new Set(s.orders.map((o) => o.productId))
  for (const o of s.orders) {
    const p = s.products.find((x) => x.id === o.productId)
    if (!p || p.status === 'ended') {
      o.done = o.quantity
      continue
    }
    const use = TYPES[p.type].capacity
    if (o.mode === 'contract') {
      if (s.day - o.placedDay < CONTRACT.leadDays) continue
      deliver(o, p, Math.min(orderLeft(o), Math.floor(contractPerDay(s) / use)), buildCost(s, p, 'contract'), CONTRACT.defectRate)
    } else {
      // lines set to this device first, then lines that are free (or set to a device with nothing on order)
      const mine = buckets.filter((b) => b.assign === p.id)
      const free = buckets.filter((b) => !b.assign || !live.has(b.assign))
      for (const b of [...mine, ...free]) {
        if (orderLeft(o) <= 0 || out.stalled) break
        const units = Math.min(orderLeft(o), Math.floor(b.left / use))
        if (units <= 0) continue
        const { factor } = partsFactor(p.type, b.parts, b.full / use, b.pace)
        const made = deliver(o, p, units, costNow(s, p.costParts) * FACTORY_SAVING * factor, b.defect)
        b.left -= made * use
      }
    }
    if (orderLeft(o) <= 0) out.finished.push(o.productId)
  }
  // the running cost of each factory, in proportion to how much of it worked today
  stats.forEach((st, i) => {
    const mine = buckets.filter((b) => b.plant === i)
    const full = mine.reduce((a, b) => a + b.full, 0)
    if (st.running && full > 0) out.runCost += st.runCost * (mine.reduce((a, b) => a + (b.full - b.left), 0) / full)
  })
  s.orders = s.orders.filter((o) => orderLeft(o) > 0)
  return out
}
