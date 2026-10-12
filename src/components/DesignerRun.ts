// The launch plan's own arithmetic: the size of the first run it proposes,
// when it warns about the size the player chose, and how a price compares with
// the typical one, in words. The estimate itself comes from `demandEstimate`
// (src/sim/insight.ts); nothing here forecasts anything.

/** The share of the cash left after what is due at launch that a proposed run may cost. */
export const RUN_CASH_SHARE = 0.5
/** A run this many times the top of the estimate is "far above" it. */
export const RUN_FAR_ABOVE = 1.5
/** The smallest run worth proposing. */
export const RUN_MIN = 100

const TIDY = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

/** The largest tidy figure (1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 times a power of ten) that is not above `v`. */
export function tidyDown(v: number): number {
  if (!Number.isFinite(v) || v < 1) return 0
  const unit = Math.pow(10, Math.floor(Math.log10(v)))
  // (a hair of slack, so that 3000 / 1000 is not read as 2.9999)
  const lead = v / unit + 1e-9
  let best = 1
  for (const t of TIDY) if (t <= lead) best = t
  return Math.round(best * unit)
}

/** The smallest tidy figure that is not below `v`. */
export function tidyUp(v: number): number {
  if (!Number.isFinite(v) || v <= 1) return 1
  const unit = Math.pow(10, Math.floor(Math.log10(v)))
  const lead = v / unit - 1e-9
  for (const t of TIDY) if (t >= lead) return Math.round(t * unit)
  return Math.round(10 * unit)
}

export interface Estimate {
  low: number
  high: number
}

/**
 * The first run the plan proposes: a tidy figure near the middle of the
 * estimate, held to what half of the spare cash can pay for (`spare` is the
 * cash left after development, the launch budget and the keynote; `Infinity`
 * when money is not counted). When the company cannot afford even the low end
 * of the estimate, it proposes what it can afford, which is below the range.
 * Never less than `RUN_MIN`.
 */
export function defaultRun(est: Estimate, unitCost: number, spare: number): number {
  const low = Math.max(0, est.low)
  const high = Math.max(low, est.high)
  const middle = (low + high) / 2
  const reach = unitCost > 0 && Number.isFinite(spare) ? (Math.max(0, spare) * RUN_CASH_SHARE) / unitCost : Infinity
  const aim = Math.min(middle, reach)
  let run = tidyDown(aim)
  // rounding down must not take an affordable run out of the bottom of the range
  if (run < low && aim >= low) {
    const up = tidyUp(low)
    run = up <= Math.min(high, reach) ? up : Math.floor(aim)
  }
  return Math.max(RUN_MIN, run)
}

export type RunNote = { kind: 'cash' | 'above' | 'below'; tone: 'warn' | 'dim' }

/**
 * What to say about a run of `quantity` units, most serious first, or null
 * when it sits comfortably: it costs more than half of the cash in hand, it is
 * far above what is likely to sell, or it is under the low end and will
 * probably sell out.
 */
export function runNote(quantity: number, est: Estimate, unitCost: number, cash: number): RunNote | null {
  if (quantity <= 0) return null
  if (Number.isFinite(cash) && quantity * unitCost > Math.max(0, cash) * RUN_CASH_SHARE) return { kind: 'cash', tone: 'warn' }
  if (quantity > est.high * RUN_FAR_ABOVE) return { kind: 'above', tone: 'warn' }
  if (quantity < est.low) return { kind: 'below', tone: 'dim' }
  return null
}

/** How a price stands against the typical one for its segment, as the end of a sentence that starts "yours is". */
export function priceWords(price: number, typical: number): string {
  if (!(typical > 0) || !(price > 0)) return ''
  const r = price / typical
  if (r < 0.4) return 'less than half of that'
  if (r < 0.6) return 'about half of that'
  if (r < 0.8) return 'well under that'
  if (r < 0.95) return 'a little under that'
  if (r <= 1.05) return 'about the same'
  if (r <= 1.25) return 'a little over that'
  if (r <= 1.75) return 'well over that'
  if (r <= 2.25) return 'about double that'
  return 'more than double that'
}
