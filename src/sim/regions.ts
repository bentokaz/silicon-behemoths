// Regions: the world is six markets with their own size, wealth and trade
// costs. A company sells where it has set up, and is known only where it has
// made itself known.
import type { SegmentInfo } from '../data/devices'
import { clamp } from './rng'
import type { Company, GameState, RegionState } from './types'

export interface RegionDef {
  id: string
  name: string
  /** Share of world demand. The shares add up to 1. */
  share: number
  /** Above 1 buyers lean premium, below 1 they lean budget. */
  wealth: number
  /** Share of revenue lost to duties and shipping when selling here from abroad. */
  tariff: number
  /** One-off cost to set up distribution. */
  entry: number
  /** Monthly cost of the local operation. */
  overhead: number
  cities: string[]
  blurb: string
}

export const REGIONS: RegionDef[] = [
  { id: 'na', name: 'North America', share: 0.22, wealth: 1.25, tariff: 0.06, entry: 4e6, overhead: 90e3, cities: ['Fifth Avenue', 'Union Square', 'Yorkville', 'Michigan Avenue', 'The Grove'], blurb: 'Rich, brand-led and ruthless about reviews.' },
  { id: 'eu', name: 'Europe', share: 0.21, wealth: 1.12, tariff: 0.07, entry: 4e6, overhead: 90e3, cities: ['Regent Street', 'Kurfürstendamm', 'Champs-Élysées', 'Passeig de Gràcia', 'Via Torino'], blurb: 'Many countries, one set of rules, steady spenders.' },
  { id: 'ea', name: 'East Asia', share: 0.25, wealth: 1.0, tariff: 0.08, entry: 5e6, overhead: 100e3, cities: ['Shibuya', 'Gangnam', 'Nanjing Road', 'Ginza', 'Xinyi'], blurb: 'The biggest market, and the most crowded.' },
  { id: 'sa', name: 'South Asia and Oceania', share: 0.15, wealth: 0.6, tariff: 0.12, entry: 2.5e6, overhead: 50e3, cities: ['Orchard Road', 'Bandra', 'Connaught Place', 'Sukhumvit', 'Bonifacio'], blurb: 'Huge volumes for anything priced right.' },
  { id: 'la', name: 'Latin America', share: 0.09, wealth: 0.7, tariff: 0.14, entry: 2e6, overhead: 45e3, cities: ['Avenida Paulista', 'Polanco', 'Palermo', 'Providencia', 'Zona T'], blurb: 'High duties, loyal buyers.' },
  { id: 'me', name: 'Middle East and Africa', share: 0.08, wealth: 0.75, tariff: 0.1, entry: 2e6, overhead: 45e3, cities: ['Dubai Marina', 'Sandton', 'Zamalek', 'Victoria Island', 'Bağdat Avenue'], blurb: 'Young, growing and split between luxury and value.' },
]
export const regionInfo = (id: string) => REGIONS.find((r) => r.id === id) ?? REGIONS[0]
export const DEFAULT_HOME = 'na'

/** How much a region wants a segment, relative to the world average. */
export function regionTaste(r: RegionDef, seg: SegmentInfo): number {
  // price-sensitive segments are the budget end; insensitive ones the premium end
  const premium = clamp((1.5 - seg.sens) / 0.7, -1, 1)
  return Math.pow(r.wealth, premium)
}

const hashStr = (v: string) => {
  let h = 2166136261
  for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

/** Where a rival is based. Fixed for a given company. */
export function homeOf(c: Pick<Company, 'id' | 'name' | 'home'>): string {
  if (c.home) return c.home
  const v = hashStr(c.name)
  let acc = 0
  for (const r of REGIONS) {
    acc += r.share
    if (v < acc) return r.id
  }
  return REGIONS[0].id
}

const reachCache = new Map<string, number>()
/** How present a rival is in a region, 0-1. Strongest at home, patchy elsewhere. */
export function rivalReach(c: Pick<Company, 'id' | 'name' | 'home'>, region: string): number {
  const key = c.name + '|' + (c.home ?? '') + '|' + region
  let out = reachCache.get(key)
  if (out === undefined) {
    const v = hashStr(c.name + region)
    out = homeOf(c) === region ? 1 : v < 0.08 ? 0.25 : 0.7 + 0.3 * v
    reachCache.set(key, out)
  }
  return out
}

export const newRegion = (open: boolean, awareness: number, day: number): RegionState => ({ open, awareness, since: day, priceAdj: 1, monthUnits: 0, history: [] })

export function newRegions(home: string, awareness: number): Record<string, RegionState> {
  return Object.fromEntries(REGIONS.map((r) => [r.id, newRegion(r.id === home, r.id === home ? awareness : 0, 0)]))
}

export const homeRegion = (s: GameState) => s.config.home ?? DEFAULT_HOME
export const openRegions = (s: GameState) => REGIONS.filter((r) => s.regions[r.id]?.open)

/** Company-wide awareness: each region's, weighted by its size. */
export const worldAwareness = (s: GameState) => REGIONS.reduce((a, r) => a + r.share * (s.regions[r.id]?.awareness ?? 0), 0)

/** Raise awareness in one region (or every open one) by a fraction of those not yet reached. */
export function addAwareness(s: GameState, gain: number, region?: string) {
  for (const r of REGIONS) {
    const st = s.regions[r.id]
    if (!st?.open || (region && region !== r.id)) continue
    // the same effort goes further in a smaller market
    const g = region ? gain / r.share : gain
    st.awareness = clamp(st.awareness + (1 - st.awareness) * Math.min(0.5, g), 0, 1)
  }
  s.companies[0].awareness = worldAwareness(s)
}

/** Share of the sticker price kept when selling in a region: local pricing less duties. */
export function regionIncome(s: GameState, region: string): number {
  const st = s.regions[region]
  const adj = st?.priceAdj ?? 1
  return region === homeRegion(s) ? adj : adj * (1 - regionInfo(region).tariff)
}

/** Monthly cost of running every region outside the home market. */
export const regionOverheads = (s: GameState) => openRegions(s).reduce((a, r) => a + (r.id === homeRegion(s) ? 0 : r.overhead), 0)

/** Why a region cannot be entered, or null. */
export function entryBlocked(s: GameState, id: string): string | null {
  const r = REGIONS.find((x) => x.id === id)
  if (!r) return 'No such region'
  if (s.regions[id]?.open) return 'You already sell there'
  if (!s.products.some((p) => p.companyId === 'player' && p.status === 'sale')) return 'Launch a device at home first'
  return null
}
