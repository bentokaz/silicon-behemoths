// The one place the site builder reaches for figures that other parts of the
// game work out: a store's month. The helper lives in src/sim/insight.ts; it
// is looked for rather than imported outright, so that the builder still
// builds and runs where that file is not there, and simply shows no figure.
import type { GameState } from '../sim/types'

/** A store's month so far: what it took, what it cost, and what is left. */
export interface StoreMonth {
  revenue: number
  costs: number
  profit: number
  units: number
  visitors: number
  /** The month is not over: the figures are for the days so far. */
  partial: boolean
}

type Insight = { storeMonth?: (g: GameState, storeId: string) => StoreMonth | null | undefined }
const found = Object.values(import.meta.glob('../sim/insight.ts', { eager: true }) as Record<string, Insight>)[0]

/** This month's figures for a store, or null when they are not to be had. */
export function storeMonth(g: GameState, storeId: string): StoreMonth | null {
  try {
    const m = found?.storeMonth?.(g, storeId)
    return m && Number.isFinite(m.profit) ? m : null
  } catch {
    return null
  }
}
