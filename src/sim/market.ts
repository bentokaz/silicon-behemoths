// Demand model: how attractive a product is to each customer segment, the
// review scores outlets give it, and what owners say about it.
import { marketLevel, refScore } from '../data/catalog'
import { OUTLETS, type SegmentInfo, TYPES, segmentsOf, subLabel } from '../data/devices'
import { type RngHolder, clamp, pick, range } from './rng'
import { type Company, type Feedback, type Product, type Review, SUBS, type SubScores } from './types'

type Probe = Pick<Product, 'raw' | 'featureBonus' | 'price' | 'type'>
type Maker = Pick<Company, 'brand' | 'software'>

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
export function segmentQuality(n: SubScores, maker: Maker, featureBonus: number, seg: SegmentInfo): number {
  let q = seg.weights.brand * maker.brand
  for (const k of SUBS) q += seg.weights[k] * n[k]
  return (q * (1 + featureBonus + maker.software)) / seg.expect
}

export function utility(p: Probe, maker: Maker, seg: SegmentInfo, day: number): number {
  const q = segmentQuality(normalised(p.raw, day), maker, p.featureBonus, seg)
  return Math.pow(Math.max(0, q), 1.5) * priceFactor(p.price, seg)
}

/** Appeal on a 0-100 scale for the designer readout. 100 = a strong fit. */
export function appeal(p: Probe, maker: Maker, seg: SegmentInfo, day: number): number {
  return clamp(utility(p, maker, seg, day) * 80, 0, 100)
}

export function bestSegment(p: Probe, maker: Maker, day: number): { seg: SegmentInfo; u: number } {
  const segs = segmentsOf(p.type)
  let best = { seg: segs[0], u: -1 }
  for (const seg of segs) {
    const u = utility(p, maker, seg, day)
    if (u > best.u) best = { seg, u }
  }
  return best
}

export function lifecycle(age: number): number {
  return (1 + 0.6 * Math.exp(-age / 45)) * Math.exp(-Math.max(0, age - 120) / 420)
}

/** Launch excitement from the launch budget and any launch event, fading over three months. */
export function launchHype(p: Product, day: number): number {
  return (0.25 * (1 - Math.exp(-p.marketing / 3e6)) + 0.35 * p.hype) * Math.exp(-(day - p.launchDay) / 90)
}

/** How strongly a product pulls a segment's buyers, before counting how many have heard of it. */
export function pull(p: Product, c: Maker, seg: SegmentInfo, day: number): number {
  const u = utility(p, c, seg, day)
  return Math.pow(u, 3.5) * lifecycle(day - p.launchDay) * (0.6 + 0.08 * p.reviewAvg) * (1 + 0.8 * (p.buzz[seg.id] ?? 0)) * (0.8 + 0.4 * p.satisfaction)
}

/** Weight of a product in a segment's purchase decision. */
export function attraction(p: Product, c: Company, seg: SegmentInfo, day: number): number {
  return pull(p, c, seg, day) * Math.min(1, c.awareness + launchHype(p, day))
}

export const OUTSIDE_OPTION = 1.5
const SEASON = [0.9, 0.85, 0.9, 0.95, 0.95, 1, 0.95, 1, 1.05, 1.05, 1.2, 1.3]

export function segmentDemand(seg: SegmentInfo, day: number): number {
  const growth = Math.pow(1.02, day / 360)
  return (seg.size * growth * SEASON[Math.floor(day / 30) % 12]) / 360
}

/** Share of buyers choosing each storage option, base model first. */
const TIER_MIX = [[1], [0.65, 0.35], [0.55, 0.3, 0.15], [0.5, 0.27, 0.15, 0.08]]

/** Average price paid and extra cost per unit once storage upgrades are counted. */
export function tierAverages(p: Pick<Product, 'price' | 'tiers' | 'design'>): { price: number; extraCost: number } {
  const mix = TIER_MIX[Math.min(p.tiers.length, 3)]
  let price = p.price * mix[0]
  let extraCost = 0
  p.tiers.slice(0, 3).forEach((t, i) => {
    price += t.price * mix[i + 1]
    extraCost += Math.max(0, t.storage - p.design.specs.storage) * 0.08 * mix[i + 1]
  })
  return { price, extraCost }
}

export function makeReviews(r: RngHolder, p: Product, maker: Maker, day: number, issues: string[]): Review[] {
  const n = normalised(p.raw, day)
  const { seg, u } = bestSegment(p, maker, day)
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
      if (rel > 1.12 && pros.length < 2) pros.push(`${subLabel(p.type, k)} is ahead of the ${seg.name.toLowerCase()} class`)
      else if (rel < 0.8 && cons.length < 2) cons.push(`${subLabel(p.type, k)} falls short for the price`)
    }
    if (pf > 1.15) pros.push('Aggressively priced')
    if (pf < 0.85) cons.push('Overpriced for what it offers')
    if (issues.length && cons.length < 3) cons.push(issues[Math.floor(range(r, 0, issues.length))])
    if (!pros.length) pros.push('Nothing stands out')
    if (!cons.length) cons.push('No serious complaints')
    return { outlet: o.name, score: Math.round(score * 10) / 10, pros, cons }
  })
}

const PRAISE: Record<string, string[]> = {
  perf: ['Flies through everything I throw at it.', 'Never slows down, even with everything open.'],
  display: ['The screen is gorgeous.', 'Bright, sharp and smooth. Hard to go back.'],
  camera: ['Photos come out great, even at night.', 'The camera is the reason I bought it.'],
  sensors: ['Health tracking is spot on.', 'Tracks everything I care about.'],
  io: ['Great keyboard and every port I need.', 'Typing on this is a joy.'],
  battery: ['Easily lasts me the whole day.', 'I keep forgetting to charge it.'],
  design: ['Feels premium in the hand.', 'People ask me what it is.'],
  price: ['Worth every cent.', 'Could not find better for the money.'],
  games: ['The controller feels fantastic.', 'Plays everything I own, discs included.'],
  graphics: ['Games look stunning on it.', 'Smooth and sharp in every game I have tried.'],
  cooling: ['Stays cool and I never hear the fan.', 'Silent, even when it is working hard.'],
  sound: ['Sounds big enough that I skipped the soundbar.', 'Voices are clear and the bass is real.'],
  ports: ['Everything I own plugs straight in.', 'The menus are quick and easy to live with.'],
  smart: ['The picture is clean, whatever I feed it.', 'Upscaling makes old shows look new.'],
  audio: ['They sound far better than I expected.', 'Rich, detailed sound. I hear new things in old songs.'],
  anc: ['The train just disappears when I put them in.', 'Noise cancelling is superb.'],
  smarts: ['They pair instantly and just work.', 'Full of clever touches I use every day.'],
  look: ['It looks great in the room.', 'Visitors always ask what it is.'],
}
const GRIPES: Record<string, string[]> = {
  perf: ['Stutters with a few apps open.', 'Feels slow already.'],
  display: ['Screen looks washed out next to my old one.', 'The display is nothing special.'],
  camera: ['Camera is a letdown.', 'Photos look soft and noisy.'],
  sensors: ['Missing sensors my old band had.', 'Health readings are basic.'],
  io: ['Keyboard feels cheap and I live on dongles.', 'Not enough ports.'],
  battery: ['Battery is dead by mid-afternoon.', 'Always hunting for a charger.'],
  design: ['Looks dated and feels bulky.', 'The design is forgettable.'],
  price: ['Way overpriced for what you get.', 'Should cost a lot less.'],
  defect: ['Mine arrived faulty and had to be replaced.', 'Had to send it back within a week.'],
  support: ['Support never answered my ticket.', 'Getting help was painful.'],
  games: ['The controller feels like a toy.', 'Missing features every other console has.'],
  graphics: ['Games look blurry on a big screen.', 'It struggles to hold a steady frame rate.'],
  cooling: ['The fan sounds like a hair dryer.', 'It runs alarmingly hot.'],
  sound: ['The speakers are thin and tinny.', 'I had to buy a soundbar straight away.'],
  ports: ['Not enough inputs for my things.', 'The menus are slow and missing basics.'],
  smart: ['Motion looks smeary.', 'Lower-quality video looks rough on it.'],
  audio: ['They sound flat and lifeless.', 'Muddy bass and harsh highs.'],
  anc: ['They barely block any noise.', 'I can still hear the whole office.'],
  smarts: ['Pairing is a daily fight.', 'Bare-bones. They do not even pause when I take them out.'],
  look: ['It looks cheap in the room.', 'A big dull box. I hide it away.'],
}

/** One owner's comment, picked from what this product does well or badly. */
export function makeFeedback(r: RngHolder, p: Product, maker: Maker, day: number, supportGap: number): Feedback {
  const n = normalised(p.raw, day)
  const { seg } = bestSegment(p, maker, day)
  // each device type says which stock comments fit its scores; a console's "display" is its graphics
  const key = (k: keyof SubScores) => TYPES[p.type].voice?.[k] ?? (k === 'camera' ? TYPES[p.type].special : k)
  const good: string[] = []
  const bad: string[] = []
  for (const k of SUBS) {
    const rel = n[k] / seg.expect
    if (rel > 1.05) good.push(key(k))
    if (rel < 0.85) bad.push(key(k))
  }
  const pf = priceFactor(p.price, seg)
  if (pf > 1.1) good.push('price')
  if (pf < 0.9) bad.push('price')
  if (p.defectRate > 0.02) bad.push('defect')
  if (supportGap > 0.4) bad.push('support')
  const stars = clamp(Math.round(1 + 4 * p.satisfaction + range(r, -0.9, 0.9)), 1, 5)
  const positive = stars >= 4 ? good.length > 0 : stars <= 2 ? bad.length === 0 : range(r, 0, 1) < 0.5 && good.length > 0
  const pool = positive ? good : bad.length ? bad : good
  if (!pool.length) return { day, stars, text: stars >= 3 ? 'Does the job.' : 'Not what I hoped for.' }
  return { day, stars, text: pick(r, (positive ? PRAISE : GRIPES)[pick(r, pool)]) }
}
