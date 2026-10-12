// After-sales: warranties, repairs, software updates, trade-ins, care plans
// and recalls. What happens to a device once somebody owns it.
import { DAYS_PER_MONTH } from '../data/catalog'
import { clamp } from './rng'
import { storeStats } from './sites'
import type { CareState, GameState, Product } from './types'

const zero = () => ({ repairs: 0, repairCost: 0, updates: 0, planIncome: 0, tradeIns: 0, refurbIncome: 0 })
export const newCare = (): CareState => ({ warrantyYears: 1, updateYears: 2, tradeIn: false, refurb: false, plan: false, planPrice: 8, subscribers: 0, month: zero(), last: zero() })

export const WARRANTY_YEARS = [1, 2, 3]
export const UPDATE_YEARS = [2, 3, 4, 5, 7]
/** Share of a fan sale's price given as trade-in credit, and earned back by reselling the old device. */
export const TRADE_CREDIT = 0.06
export const REFURB_RETURN = 0.045
/** Fans upgrade this much sooner when their old device is worth something. */
export const TRADE_PULL = 1.3

/** True while the company has somewhere to refurbish traded-in devices: a factory, or a store with a repair bench. */
export const canRefurb = (s: GameState) => !!s.factory || s.stores.some((st) => storeStats(st.site).repairs > 0)

/** Repair benches across all stores. */
export const repairBenches = (s: GameState) => s.stores.reduce((a, st) => a + storeStats(st.site).repairs, 0)

/** Cost of honouring the warranty on one unit sold, as a share of its build cost per point of fault rate. */
export function warrantyLoad(s: GameState): number {
  return (0.6 + 0.35 * (s.care.warrantyYears - 1)) * (1 - Math.min(0.3, 0.06 * repairBenches(s)))
}

/** Extra appeal from standing behind the product, added to the software bonus. */
export function careBonus(s: GameState): number {
  const c = s.care
  return Math.min(0.045, 0.008 * (c.warrantyYears - 1) + 0.005 * (c.updateYears - 2) + (c.tradeIn ? 0.004 : 0))
}

/** Added to every product's owner satisfaction. */
export function careSatisfaction(s: GameState): number {
  const c = s.care
  return 0.02 * (c.warrantyYears - 1) + 0.01 * (c.updateYears - 2) + (c.plan ? 0.01 : 0)
}

/** Monthly bill for keeping old devices patched. */
export const updatesCost = (s: GameState) => s.owners * 0.018 * s.care.updateYears

/** Share of owners who would pay for the care plan at its current price. */
export function planAttach(s: GameState, satisfaction: number): number {
  return clamp(0.2 * (0.5 + satisfaction) * Math.pow(8 / Math.max(1, s.care.planPrice), 1.3), 0, 0.45)
}

export interface CareDay {
  /** Costs to book today. */
  updates: number
  planCost: number
  /** Income to book today. */
  planIncome: number
}

/** Daily: update costs accrue and care-plan subscribers come and go. */
export function stepCare(s: GameState, satisfaction: number): CareDay {
  const c = s.care
  const updates = updatesCost(s) / DAYS_PER_MONTH
  const target = c.plan ? s.owners * planAttach(s, satisfaction) : 0
  c.subscribers = Math.max(0, c.subscribers + (target - c.subscribers) * 0.02)
  const planIncome = (c.subscribers * c.planPrice) / DAYS_PER_MONTH
  // accidental-damage cover: about two fifths of the premium goes on repairs
  const planCost = planIncome * 0.4
  c.month.updates += updates
  c.month.planIncome += planIncome
  c.month.repairCost += planCost
  return { updates, planCost, planIncome }
}

export function closeCareMonth(s: GameState) {
  s.care.last = s.care.month
  s.care.month = zero()
}

// ---------------------------------------------------------------- recalls

export const RECALL_FAULTS = 0.04
export const RECALL_MIN_UNITS = 15000
export const RECALL_DEADLINE = 90
export const recallCost = (p: Product) => Math.round(p.unitsSold * p.unitCost * 0.22)

export interface CareNote {
  text: string
  productId: string
}

/** Monthly: badly built products trigger a recall decision; ignored ones cost the brand. */
export function checkRecalls(s: GameState): CareNote[] {
  const notes: CareNote[] = []
  const me = s.companies[0]
  for (const p of s.products) {
    if (p.companyId !== 'player' || p.status === 'dev') continue
    if (!p.recall && p.defectRate > RECALL_FAULTS && p.unitsSold >= RECALL_MIN_UNITS) {
      p.recall = { state: 'open', day: s.day, cost: recallCost(p) }
      notes.push({ productId: p.id, text: `Fault reports for ${p.name} are spreading. Decide whether to recall it.` })
    } else if (p.recall?.state === 'open' && s.day - p.recall.day > RECALL_DEADLINE) {
      p.recall.state = 'ignored'
      me.brand = clamp(me.brand - 0.05, 0.05, 1)
      s.fans *= 0.85
      notes.push({ productId: p.id, text: `The ${p.name} faults became a scandal. The brand and the fan base took a hit.` })
    }
  }
  return notes
}
