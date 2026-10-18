// Contract work: businesses ask for a batch of devices of one kind, good
// enough by the reviews, delivered by a date. Accepted, a contract takes units
// from the chosen device's stock as they come off the line and pays in full
// on the last delivery; a missed date pays half for what arrived and costs
// some standing. Early on, before shoppers know the name, it is steady money.
//
// Offers are drawn from the game's seed and the month, not from its dice, so
// they never change what else happens in a game.
import { DAYS_PER_MONTH } from '../data/catalog'
import { segmentOpen, typeOpen } from '../data/eras'
import { TYPES, segmentsOf } from '../data/devices'
import { clamp } from './rng'
import { priceIndex, hasType } from './world'
import { type ContractJob, DEVICE_TYPES, type GameState, type Product } from './types'

const CLIENTS = ['a regional phone carrier', 'a school district', 'a hotel chain', 'an airline', 'a hospital group', 'a delivery company', 'a national bank', 'a city council', 'a retail chain', 'a university']
/** Offers open at once, and how long one waits for an answer. */
export const MAX_OFFERS = 3
export const OFFER_DAYS = 45
/** What a contract pays per unit against the typical price of its cheapest kind: a bulk discount, with no retailer taking a cut. */
const BULK = 0.78
/** Brand gained by a delivered contract, and lost by a missed one. */
const STANDING = { done: 0.012, failed: 0.025 }

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

/** New offers for the month that has just begun, up to MAX_OFFERS open at once. */
export function offerContracts(s: GameState) {
  const list = (s.contracts ??= [])
  // an offer nobody answered goes away
  s.contracts = list.filter((c) => c.state !== 'offer' || c.expires > s.day)
  const types = DEVICE_TYPES.filter((t) => hasType(s, t) && typeOpen(t, s.day))
  if (!types.length) return
  const month = Math.floor(s.day / DAYS_PER_MONTH)
  for (let k = 0; s.contracts.filter((c) => c.state === 'offer').length < MAX_OFFERS && k < 2; k++) {
    const r = (i: number) => hash(s.config.seed, month, k, i)
    // not every month brings one
    if (r(0) < 0.35) continue
    const type = types[Math.floor(r(1) * types.length)]
    const units = Math.round((500 + r(2) * 4500) / 100) * 100
    const perUnit = Math.round(basePrice(type, s.day) * BULK * (0.9 + r(3) * 0.25))
    const job: ContractJob = {
      id: `k${s.nextId++}`,
      client: CLIENTS[Math.floor(r(4) * CLIENTS.length)],
      type,
      units,
      perUnit,
      minReview: Math.round((5 + r(5) * 2.5) * 2) / 2,
      days: Math.round((90 + r(6) * 120) / 10) * 10,
      offered: s.day,
      expires: s.day + OFFER_DAYS,
      delivered: 0,
      state: 'offer',
    }
    s.contracts.push(job)
  }
}

/** Why a device cannot fill a contract, or null. */
export function contractBlocked(s: GameState, c: ContractJob | undefined, p: Product | undefined): string | null {
  if (!c || c.state !== 'offer') return 'That offer is no longer open'
  if (c.expires <= s.day) return 'That offer has lapsed'
  if (!p || p.companyId !== 'player') return 'Choose one of your devices to fill it'
  if (p.type !== c.type) return `The client wants ${TYPES[c.type].plural.toLowerCase()}`
  if (p.status !== 'sale') return `${p.name} is not on sale`
  if (p.reviewAvg < c.minReview) return `The client wants a device reviewed at ${c.minReview} or better; ${p.name} averages ${p.reviewAvg.toFixed(1)}`
  return null
}

export interface ContractNews {
  text: string
  alert?: boolean
  productId?: string
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
    if (c.delivered >= c.units) {
      c.state = 'done'
      out.income += c.units * c.perUnit
      s.companies[0].brand = clamp(s.companies[0].brand + STANDING.done, 0.05, 1)
      out.news.push({ text: `Contract delivered: ${c.units.toLocaleString('en-US')} ${TYPES[c.type].plural.toLowerCase()} for ${c.client}. They paid $${(c.units * c.perUnit).toLocaleString('en-US')}.`, productId: c.productId })
    } else if (c.due !== undefined && s.day >= c.due) {
      c.state = 'failed'
      const part = Math.round(c.delivered * c.perUnit * 0.5)
      out.income += part
      s.companies[0].brand = clamp(s.companies[0].brand - STANDING.failed, 0.05, 1)
      out.news.push({ alert: true, text: `Contract missed: ${c.client} received ${c.delivered.toLocaleString('en-US')} of ${c.units.toLocaleString('en-US')} units by the date and paid half for those ($${part.toLocaleString('en-US')}). Word gets around.`, productId: c.productId })
    }
  }
  // finished contracts are kept for a year, for the record
  s.contracts = s.contracts.filter((c) => c.state === 'offer' || c.state === 'active' || s.day - (c.due ?? c.offered) < 360)
  return out
}
