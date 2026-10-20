// Contract work: named clients in several sectors ask for a batch of devices
// of one kind, built to a brief (look, size, noise, flight time...), good
// enough by the reviews, delivered by a date. Accepted, a contract takes units
// from the chosen device's stock as they come off the line. Delivered on time
// it pays in full; after the date the price falls away through a grace
// period, and when that runs out the client pays only part for what arrived.
// Each sector remembers how you did: standing brings harder, richer work.
//
// Offers are drawn from the game's seed and the month, not from its dice, so
// they never change what else happens in a game.
import { DAYS_PER_MONTH } from '../data/catalog'
import { segmentOpen, typeOpen } from '../data/eras'
import { TYPES, segmentsOf, sizeLimits } from '../data/devices'
import { clamp } from './rng'
import { priceIndex, hasType } from './world'
import { checkAll, reqApplies, reqLabel, type ReqKind } from './contractReqs'
import { type ContractJob, type ContractReq, DEVICE_TYPES, type DeviceType, type GameState, type Product } from './types'

export interface Sector {
  id: string
  name: string
  client: string
  /** Devices this client buys, and the asks it makes of them. */
  types: DeviceType[]
  pool: ReqKind[]
}

export const SECTORS: Sector[] = [
  { id: 'office', name: 'Office fit-out', client: 'Halden & Rowe Interiors', types: ['desktop', 'tower', 'laptop', 'monitor'], pool: ['wood', 'calm', 'maxLong', 'quiet', 'matte'] },
  { id: 'school', name: 'Education', client: 'Brookfield Academy', types: ['tablet', 'laptop', 'ereader'], pool: ['calm', 'battery', 'maxLong', 'secure'] },
  { id: 'hospital', name: 'Healthcare', client: "St Aldric's Hospital", types: ['tablet', 'watch', 'laptop', 'monitor'], pool: ['secure', 'calm', 'battery', 'quiet', 'matte'] },
  { id: 'airline', name: 'Aviation', client: 'Skyvane Airlines', types: ['tablet', 'headset', 'earbuds', 'ereader', 'laptop'], pool: ['battery', 'maxLong', 'calm', 'secure'] },
  { id: 'military', name: 'Defence', client: 'Ironwatch Defence', types: ['drone', 'handheld', 'tablet', 'phone'], pool: ['camo', 'maxLong', 'flight', 'secure', 'matte'] },
  { id: 'film', name: 'Film', client: 'Lumen Pictures Studio', types: ['actioncam', 'drone', 'monitor', 'tv'], pool: ['flight', 'matte', 'maxLong', 'calm'] },
  { id: 'cafe', name: 'Hospitality', client: 'Pixel Perch Game Cafe', types: ['console', 'handheld', 'tower', 'monitor', 'mouse'], pool: ['rgb', 'quiet', 'maxLong', 'battery'] },
  { id: 'carrier', name: 'Telecoms', client: 'Northline Mobile', types: ['phone', 'watch', 'tablet'], pool: ['battery', 'calm', 'maxLong', 'secure'] },
]
export const sectorOf = (id: string | undefined) => SECTORS.find((x) => x.id === id)

/** Offers open at once, and how long one waits for an answer. */
export const MAX_OFFERS = 4
export const OFFER_DAYS = 45
export const MAX_TIER = 3
/** Standing a sector starts at, and what a delivered or missed contract does to it. */
export const START_REP = 0.3
const REP = { done: 0.12, tier: 0.03, failed: 0.2 }
/** What a contract pays per unit against the typical price of its cheapest kind: a bulk discount, with no retailer taking a cut. */
const BULK = 0.78
/** Brand gained by a delivered contract, and lost by a missed one. */
const STANDING = { done: 0.012, failed: 0.025 }
/** Share of the price a late contract still pays at the end of its grace, and a missed one pays for what arrived. */
const LATE_FLOOR = 0.5
const MISSED_SHARE = 0.4

/** A number in 0-1 from the game's seed and a few integers: the same every time it is asked. */
function hash(...xs: number[]): number {
  let h = 2166136261
  for (const x of xs) h = Math.imul(h ^ (x | 0), 16777619) ^ (h >>> 13)
  h = Math.imul(h ^ (h >>> 16), 2246822519)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

/** The cheapest segment open today for a kind of device: what the client's request is priced against. */
function basePrice(type: Product['type'], day: number): number {
  const segs = segmentsOf(type).filter((sg) => segmentOpen(sg.id, sg.type, day))
  const ref = Math.min(...(segs.length ? segs : segmentsOf(type)).map((sg) => sg.priceRef))
  return ref * priceIndex(day)
}

export const sectorRep = (s: GameState, id: string) => s.sectorRep?.[id] ?? START_REP

/** The hardest tier a company is offered: more device lines open harder work. */
export function tierCap(typesOwned: number): number {
  return clamp(Math.floor(typesOwned / 2), 0, MAX_TIER)
}

/** Price per unit: a base price grown by tier, by each ask met, and by the sector's regard. */
export function rewardPerUnit(base: number, tier: number, asks: number, rep: number): number {
  return Math.round(base * BULK * (1 + 0.8 * tier) * (1 + 0.07 * asks) * (1 + 0.2 * clamp(rep, 0, 1)))
}

/** Units asked for: bigger batches early, a little fewer as the work gets finer. */
export const unitsFor = (roll: number, tier: number) => Math.max(100, Math.round(((500 + roll * 4500) / (1 + 0.25 * tier)) / 100) * 100)

/** What an ask is set to for a kind of device and tier. Tighter with tier. */
export function reqFor(kind: ReqKind, type: DeviceType, tier: number): ContractReq | null {
  if (!reqApplies(kind, type)) return null
  switch (kind) {
    case 'maxLong': {
      const h = sizeLimits(type).height
      return { kind, value: Math.round((h[0] + (h[1] - h[0]) * (0.55 - 0.1 * tier)) / 5) * 5 }
    }
    case 'quiet':
      return { kind, value: (type === 'tower' ? 32 : type === 'laptop' ? 34 : 36) - 2 * tier }
    case 'flight':
      return { kind, value: 15 + 4 * tier }
    case 'battery':
      return { kind, value: 8 + 2 * tier }
    default:
      return { kind }
  }
}

/** The asks of a contract: tier + 1 of them, taken from the sector's pool in a seeded order. */
export function reqsFor(sector: Sector, type: DeviceType, tier: number, roll: (i: number) => number): ContractReq[] {
  const order = sector.pool.map((k, i) => ({ k, o: roll(40 + i) })).sort((a, b) => a.o - b.o)
  const out: ContractReq[] = []
  for (const { k } of order) {
    const r = reqFor(k, type, tier)
    if (r && out.length < tier + 1) out.push(r)
  }
  return out
}

/** New offers for the month that has just begun, up to MAX_OFFERS open at once. */
export function offerContracts(s: GameState) {
  const list = (s.contracts ??= [])
  // an offer nobody answered goes away
  s.contracts = list.filter((c) => c.state !== 'offer' || c.expires > s.day)
  const open = DEVICE_TYPES.filter((t) => hasType(s, t) && typeOpen(t, s.day))
  if (!open.length) return
  const cap = tierCap(s.types?.length ?? DEVICE_TYPES.length)
  const month = Math.floor(s.day / DAYS_PER_MONTH)
  for (let k = 0; s.contracts.filter((c) => c.state === 'offer').length < MAX_OFFERS && k < 2; k++) {
    const r = (i: number) => hash(s.config.seed, month, k, i)
    // not every month brings one
    if (r(0) < 0.35) continue
    // sectors that think well of the company come calling more often
    const sectors = SECTORS.filter((x) => x.types.some((t) => open.includes(t)))
    if (!sectors.length) continue
    const weights = sectors.map((x) => 0.5 + sectorRep(s, x.id))
    let pickAt = r(1) * weights.reduce((a, b) => a + b, 0)
    let sector = sectors[sectors.length - 1]
    for (let i = 0; i < sectors.length; i++) {
      pickAt -= weights[i]
      if (pickAt <= 0) { sector = sectors[i]; break }
    }
    const rep = sectorRep(s, sector.id)
    const types = sector.types.filter((t) => open.includes(t))
    const type = types[Math.floor(r(2) * types.length)]
    const tier = Math.min(cap, Math.floor(r(7) * (cap + 1) + rep * 0.9))
    const reqs = reqsFor(sector, type, tier, r)
    const days = Math.round((90 + r(6) * 120) / 10) * 10
    const job: ContractJob = {
      id: `k${s.nextId++}`,
      client: sector.client,
      sector: sector.id,
      tier,
      reqs,
      type,
      units: unitsFor(r(3), tier),
      perUnit: Math.round(rewardPerUnit(basePrice(type, s.day), tier, reqs.length, rep) * (0.9 + r(4) * 0.25)),
      minReview: Math.min(9, Math.round((5 + tier * 0.5 + r(5) * 2.5) * 2) / 2),
      days,
      grace: Math.round(days * 0.25),
      offered: s.day,
      expires: s.day + OFFER_DAYS,
      delivered: 0,
      state: 'offer',
    }
    s.contracts.push(job)
  }
}

/** The asks of a contract checked against a device, with what the design has. */
export const contractChecks = (c: ContractJob, p: Product) => checkAll(c.reqs, p.design, { lifeHours: p.lifeHours })

/** Why a device cannot fill a contract, or null. */
export function contractBlocked(s: GameState, c: ContractJob | undefined, p: Product | undefined): string | null {
  if (!c || c.state !== 'offer') return 'That offer is no longer open'
  if (c.expires <= s.day) return 'That offer has lapsed'
  if (!p || p.companyId !== 'player') return 'Choose one of your devices to fill it'
  if (p.type !== c.type) return `The client wants ${TYPES[c.type].plural.toLowerCase()}`
  if (p.status !== 'sale') return `${p.name} is not on sale`
  if (p.reviewAvg < c.minReview) return `The client wants a device reviewed at ${c.minReview} or better; ${p.name} averages ${p.reviewAvg.toFixed(1)}`
  const miss = contractChecks(c, p).rows.find((x) => !x.ok)
  if (miss) return `${c.client} asks for: ${reqLabel(miss.req).toLowerCase()}. ${p.name} has ${miss.have.toLowerCase()}`
  return null
}

/** Days past the delivery date, 0 while on time. */
export const daysLate = (c: ContractJob, day: number) => (c.due === undefined ? 0 : Math.max(0, day - c.due))

/** The share of the price paid for a delivery made on this day: 1 on time, falling to LATE_FLOOR as the grace runs out. */
export function latePay(c: ContractJob, day: number): number {
  const late = daysLate(c, day)
  if (late <= 0) return 1
  return 1 - (1 - LATE_FLOOR) * Math.min(1, late / Math.max(1, c.grace ?? 0))
}

/** What a contract pays today for a delivery of `units`. */
export const payFor = (c: ContractJob, units: number, day: number) => Math.round(units * c.perUnit * latePay(c, day))

export interface ContractNews {
  text: string
  alert?: boolean
  productId?: string
}

function moveRep(s: GameState, c: ContractJob, by: number) {
  if (!c.sector) return
  const reps = (s.sectorRep ??= {})
  reps[c.sector] = clamp(sectorRep(s, c.sector) + by, 0, 1)
}

/**
 * A day of contract work: units go from stock to the clients, a finished
 * contract is paid, a lapsed one is settled. Returns the money in and what to
 * say about it; the caller books the money.
 */
export function stepContracts(s: GameState): { income: number; news: ContractNews[] } {
  const out = { income: 0, news: [] as ContractNews[] }
  if (!s.contracts?.length) return out
  for (const c of s.contracts) {
    if (c.state !== 'active') continue
    const p = s.products.find((x) => x.id === c.productId)
    if (p && p.status !== 'dev' && p.stock > 0 && c.delivered < c.units) {
      const n = Math.min(p.stock, c.units - c.delivered)
      p.stock -= n
      p.unitsSold += n
      p.revenue += n * c.perUnit
      p.monthUnits += n
      c.delivered += n
    }
    const late = daysLate(c, s.day)
    if (c.delivered >= c.units) {
      c.state = 'done'
      const pay = payFor(c, c.units, s.day)
      out.income += pay
      s.companies[0].brand = clamp(s.companies[0].brand + STANDING.done, 0.05, 1)
      moveRep(s, c, late > 0 ? REP.done * 0.3 : REP.done + REP.tier * (c.tier ?? 0))
      out.news.push({ text: `Contract delivered${late > 0 ? ` ${late} days late` : ''}: ${c.units.toLocaleString('en-US')} ${TYPES[c.type].plural.toLowerCase()} for ${c.client}. They paid $${pay.toLocaleString('en-US')}${late > 0 ? ` after a late penalty of $${(c.units * c.perUnit - pay).toLocaleString('en-US')}` : ''}.`, productId: c.productId })
    } else if (c.due !== undefined && s.day >= c.due + (c.grace ?? 0) && (c.grace !== undefined || s.day >= c.due)) {
      c.state = 'failed'
      const part = Math.round(c.delivered * c.perUnit * (c.grace === undefined ? 0.5 : MISSED_SHARE))
      out.income += part
      s.companies[0].brand = clamp(s.companies[0].brand - STANDING.failed, 0.05, 1)
      moveRep(s, c, -REP.failed)
      out.news.push({ alert: true, text: `Contract missed: ${c.client} received ${c.delivered.toLocaleString('en-US')} of ${c.units.toLocaleString('en-US')} units and paid only $${part.toLocaleString('en-US')} for those. Word gets around${sectorOf(c.sector) ? ` in ${sectorOf(c.sector)!.name.toLowerCase()}` : ''}.`, productId: c.productId })
    } else if (late === 1 && c.due !== undefined) {
      out.news.push({ alert: true, text: `${c.client}'s delivery date has passed with ${(c.units - c.delivered).toLocaleString('en-US')} units still owed. The price falls each day for ${c.grace ?? 0} days.`, productId: c.productId })
    }
  }
  // finished contracts are kept for a year, for the record
  s.contracts = s.contracts.filter((c) => c.state === 'offer' || c.state === 'active' || s.day - (c.due ?? c.offered) < 360)
  return out
}
