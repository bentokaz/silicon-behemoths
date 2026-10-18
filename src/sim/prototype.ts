// Pre-launch prototype test: for a fee, early testers from each customer
// segment try the design and say what they like least. Their verdict is the
// demand model's own: for every segment, the parts of the design that fall
// furthest short of what that segment expects, weighted by how much it cares.
import { marketLevel } from '../data/catalog'
import { segmentOpen } from '../data/eras'
import { segmentsOf, subLabel } from '../data/devices'
import { canAfford, devPlan } from './game'
import { designProblem } from './validate'
import { normalised, priceFactor } from './market'
import { evaluate } from './scoring'
import { staffEffects } from './staff'
import { softwareBonus } from './tech'
import { priceIndex } from './world'
import { type DeviceDesign, type GameState, SUBS } from './types'

export interface Weakness {
  /** A sub-score key, or 'price', 'brand' or 'software'. */
  key: string
  text: string
  /** How much it costs the segment's verdict, 0-1: the share of appeal lost. */
  weight: number
}
export interface SegmentVerdict {
  segment: string
  name: string
  /** Up to three weaknesses, worst first. */
  weak: Weakness[]
}

/** What a prototype test costs: a small share of the development budget, never less than 25,000. */
export const prototypeFee = (g: GameState, design: DeviceDesign) => Math.max(25e3, Math.round((devPlan(design, g).cost * 0.04) / 1e3) * 1e3)

/** The testers' verdicts, segment by segment, for a design at a price. Pure: charge for it with testPrototype. */
export function prototypeVerdicts(g: GameState, design: DeviceDesign, price: number): SegmentVerdict[] {
  const launch = g.day + devPlan(design, g).days
  const ev = evaluate(design, g.levels, marketLevel(launch), g.features, g.chips)
  const raw = { ...ev.raw, design: ev.raw.design * (1 + staffEffects(g).polish) }
  const n = normalised(raw, launch)
  const me = g.companies[0]
  const software = softwareBonus(g)
  return segmentsOf(design.type)
    .filter((seg) => segmentOpen(seg.id, seg.type, g.day))
    .map((seg) => {
      const weak: Weakness[] = []
      for (const k of SUBS) {
        const gap = seg.expect - n[k]
        if (gap > 0.03) weak.push({ key: k, weight: seg.weights[k] * gap, text: `${subLabel(design.type, k)} is below what they expect (${Math.round((n[k] / seg.expect) * 100)}% of it)` })
      }
      const pf = priceFactor(price / priceIndex(launch), seg)
      if (pf < 0.95) weak.push({ key: 'price', weight: Math.min(1, 1 - pf) * 0.5, text: `Too dear: they expect to pay about $${Math.round(seg.priceRef * priceIndex(launch)).toLocaleString('en-US')}` })
      if (me.brand < 0.6 && seg.weights.brand > 0.06) weak.push({ key: 'brand', weight: seg.weights.brand * (0.6 - me.brand), text: 'They have not heard of the brand and want a name they trust' })
      if (software < -0.01) weak.push({ key: 'software', weight: -software * 2, text: 'The software feels clumsy next to what they use now' })
      weak.sort((a, b) => b.weight - a.weight)
      return { segment: seg.id, name: seg.name, weak: weak.slice(0, 3) }
    })
}

/** Pay for a prototype test of a design. Returns why not, or null; the verdicts are then prototypeVerdicts. */
export function testPrototype(s: GameState, design: DeviceDesign): string | null {
  if (designProblem(design)) return 'That is not a design the testers can try'
  const fee = prototypeFee(s, design)
  if (!canAfford(s, fee)) return `Not enough cash: a prototype test costs $${fee.toLocaleString('en-US')}`
  s.cash -= fee
  s.cur.development += fee
  return null
}
