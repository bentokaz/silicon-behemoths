// Demand model: how attractive a product is to each customer segment, and
// the review scores outlets give it.
import { OUTLETS, SEGMENTS, SUB_LABELS, type SegmentInfo, marketLevel, refScore } from '../data/catalog'
import { type RngHolder, clamp, range } from './rng'
import { type Company, type Product, type Review, SUBS, type SegmentId, type SubScores } from './types'

/** Sub-scores relative to what the leading edge of the market offers today. */
export function normalised(raw: SubScores, day: number): SubScores {
  const ref = refScore(marketLevel(day))
  const n = {} as SubScores
  for (const k of SUBS) n[k] = clamp(raw[k] / ref, 0, 1.4)
  return n
}

export function priceFactor(price: number, seg: SegmentInfo): number {
  let pf = Math.min(1 + 0.25 * seg.sens, Math.pow(seg.priceRef / Math.max(1, price), seg.sens))
  if (price > 1.6 * seg.priceRef) pf *= Math.pow((1.6 * seg.priceRef) / price, 3)
  return pf
}

/** Quality as this segment sees it, 1.0 = exactly what the segment expects. */
export function segmentQuality(n: SubScores, brand: number, featureBonus: number, seg: SegmentInfo): number {
  let q = seg.weights.brand * brand
  for (const k of SUBS) q += seg.weights[k] * n[k]
  return (q * (1 + featureBonus)) / seg.expect
}

export function utility(p: Pick<Product, 'raw' | 'featureBonus' | 'price'>, brand: number, seg: SegmentInfo, day: number): number {
  const q = segmentQuality(normalised(p.raw, day), brand, p.featureBonus, seg)
  return Math.pow(q, 1.5) * priceFactor(p.price, seg)
}

/** Appeal on a 0-100 scale for the designer readout. 100 = a strong fit. */
export function appeal(p: Pick<Product, 'raw' | 'featureBonus' | 'price'>, brand: number, seg: SegmentInfo, day: number): number {
  return clamp(utility(p, brand, seg, day) * 80, 0, 100)
}

export function bestSegment(p: Pick<Product, 'raw' | 'featureBonus' | 'price'>, brand: number, day: number): { seg: SegmentInfo; u: number } {
  let best = { seg: SEGMENTS[0], u: -1 }
  for (const seg of SEGMENTS) {
    const u = utility(p, brand, seg, day)
    if (u > best.u) best = { seg, u }
  }
  return best
}

export function lifecycle(age: number): number {
  return (1 + 0.6 * Math.exp(-age / 45)) * Math.exp(-Math.max(0, age - 120) / 420)
}

export function hype(p: Product, day: number): number {
  return 0.25 * (1 - Math.exp(-p.marketing / 3e6)) * Math.exp(-(day - p.launchDay) / 90)
}

/** Weight of a product in a segment's purchase decision. */
export function attraction(p: Product, c: Company, seg: SegmentInfo, day: number): number {
  const u = utility(p, c.brand, seg, day)
  const aw = Math.min(1, c.awareness + hype(p, day))
  return Math.pow(u, 3.5) * aw * lifecycle(day - p.launchDay) * (0.6 + 0.08 * p.reviewAvg)
}

export const OUTSIDE_OPTION = 1.5
const SEASON = [0.9, 0.85, 0.9, 0.95, 0.95, 1, 0.95, 1, 1.05, 1.05, 1.2, 1.3]

export function segmentDemand(seg: SegmentInfo, day: number): number {
  const growth = Math.pow(1.02, day / 360)
  return (seg.size * growth * SEASON[Math.floor(day / 30) % 12]) / 360
}

export function makeReviews(r: RngHolder, p: Product, brand: number, day: number, issues: string[]): Review[] {
  const n = normalised(p.raw, day)
  const { seg, u } = bestSegment(p, brand, day)
  const pf = priceFactor(p.price, seg)
  return OUTLETS.map((o) => {
    let nw = 0
    for (const k of SUBS) nw += o.weights[k] * n[k]
    const blend = (1 - o.value) * Math.min(1.2, nw / seg.expect) + o.value * Math.min(1.25, u)
    const score = clamp(10 * (0.16 + 0.62 * blend) + range(r, -0.3, 0.3), 1, 10)
    const pros: string[] = []
    const cons: string[] = []
    const ranked = [...SUBS].sort((a, b) => n[b] * o.weights[b] - n[a] * o.weights[a])
    for (const k of ranked) {
      const rel = n[k] / seg.expect
      if (rel > 1.12 && pros.length < 2) pros.push(`${SUB_LABELS[k]} is ahead of the ${seg.name.toLowerCase()} class`)
      else if (rel < 0.8 && cons.length < 2) cons.push(`${SUB_LABELS[k]} falls short for the price`)
    }
    if (pf > 1.15) pros.push('Aggressively priced')
    if (pf < 0.85) cons.push('Overpriced for what it offers')
    if (issues.length && cons.length < 3) cons.push(issues[Math.floor(range(r, 0, issues.length))])
    if (!pros.length) pros.push('Nothing stands out')
    if (!cons.length) cons.push('No serious complaints')
    return { outlet: o.name, score: Math.round(score * 10) / 10, pros, cons }
  })
}

export type { SegmentId }
