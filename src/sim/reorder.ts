// Automatic reordering: with a Head of Operations in the seat, each device can
// be set to order another production run by itself whenever what is in stock
// and on order falls to a threshold.
import { DAYS_PER_MONTH } from '../data/catalog'
import type { GameState, Product, ReorderRule } from './types'

/** Why devices cannot reorder by themselves, or null. */
export const reorderLocked = (s: GameState): string | null => (s.staff.some((e) => e.exec === 'coo') ? null : 'Hire a Head of Operations to reorder automatically')

/** Units on order and not yet delivered for a device. */
export const unitsOnOrder = (s: GameState, productId: string) => s.orders.reduce((a, o) => a + (o.productId === productId ? Math.max(0, o.quantity - o.done) : 0), 0)

/** Recent units a day: the faster of the month so far and last month. */
export function dailyPace(s: GameState, p: Product): number {
  const into = s.day % DAYS_PER_MONTH || DAYS_PER_MONTH
  return Math.max(p.monthUnits / into, (p.history[p.history.length - 1] ?? 0) / DAYS_PER_MONTH)
}

export const MIN_REORDER = 100
export const MAX_REORDER_DAYS = 365

/** What a device starts with when automatic reordering is switched on: order two months of sales when three weeks are left. */
export function defaultReorder(s: GameState, p: Product): ReorderRule {
  const pace = dailyPace(s, p)
  return { on: true, at: Math.max(MIN_REORDER, Math.round((pace * 21) / 50) * 50), rule: 'cover', qty: 60 }
}

/** Units one automatic order asks for: a fixed number, or enough for `qty` days at the recent pace. */
export function reorderUnits(s: GameState, p: Product, r: ReorderRule): number {
  if (r.rule === 'fixed') return Math.max(1, Math.round(r.qty))
  return Math.max(MIN_REORDER, Math.ceil((dailyPace(s, p) * r.qty) / 50) * 50)
}

/** The devices due another run today, with how many units each. */
export function reordersDue(s: GameState): { p: Product; units: number }[] {
  if (reorderLocked(s)) return []
  const out: { p: Product; units: number }[] = []
  for (const p of s.products) {
    const r = p.reorder
    if (!r?.on || p.companyId !== 'player' || p.status !== 'sale') continue
    if (p.stock + unitsOnOrder(s, p.id) > r.at) continue
    out.push({ p, units: reorderUnits(s, p, r) })
  }
  return out
}

/** A rule with every part checked; anything not understood keeps what `base` has. */
export function cleanRule(patch: Partial<ReorderRule> | undefined, base: ReorderRule): ReorderRule {
  const out = { ...base }
  if (!patch || typeof patch !== 'object') return out
  if (typeof patch.on === 'boolean') out.on = patch.on
  if (typeof patch.at === 'number' && Number.isFinite(patch.at)) out.at = Math.max(0, Math.min(10e6, Math.round(patch.at)))
  if (patch.rule === 'fixed' || patch.rule === 'cover') out.rule = patch.rule
  if (typeof patch.qty === 'number' && Number.isFinite(patch.qty)) out.qty = Math.max(1, Math.min(out.rule === 'cover' ? MAX_REORDER_DAYS : 10e6, Math.round(patch.qty)))
  return out
}
