// In-house technology: custom chips and the company's own operating system.
import { DAYS_PER_YEAR, marketLevel, refScore, researchCost } from '../data/catalog'
import { clamp, range } from './rng'
import { chipFor } from './scoring'
import { staffEffects } from './staff'
import { type CustomChip, DEVICE_TYPES, type GameState, type OsState } from './types'

// ---------------------------------------------------------------- chips

/** The three design sliders may add up to at most this. */
export const CHIP_BUDGET = 2
export const chipProjectCost = (gen: number) => Math.round((researchCost(gen + 1) * 0.5 + 1e6) / 1e5) * 1e5
export const chipProjectDays = (s: GameState) => Math.max(90, Math.round(240 * staffEffects(s).devTime))

/** Why a chip project cannot start, or null. */
export function chipBlocked(s: GameState, name: string, power: number, graphics: number, efficiency: number): string | null {
  if (!name.trim()) return 'Name the chip'
  if (power + graphics + efficiency > CHIP_BUDGET + 1e-6) return 'The design is over its silicon budget'
  if (s.chips.some((c) => c.status === 'dev')) return 'Another chip is still in development'
  if (staffEffects(s).hardware <= 0) return 'You need at least one hardware engineer at a desk'
  return null
}

/** How a finished chip turns out depends on the team that built it. */
export function finishChip(s: GameState, c: CustomChip) {
  c.status = 'ready'
  c.quality = clamp(0.9 + Math.min(0.14, 0.035 * staffEffects(s).hardware) + range(s, -0.02, 0.02), 0.88, 1.08)
}

/** Share of rival devices that would use this chip at its licence fee. */
export function chipAdoption(s: GameState, c: CustomChip): number {
  if (c.status !== 'ready' || c.licenceFee <= 0) return 0
  const mine = chipFor({ customChip: c.id } as never, [c])
  const gen = Math.min(8, Math.floor(marketLevel(s.day)))
  const helix = { perf: refScore(gen), cost: 70 * Math.pow(1.12, gen) }
  const value = mine.perf / (mine.cost + c.licenceFee) / (helix.perf / helix.cost)
  return clamp((value - 0.95) * 1.2, 0, 0.25)
}

// ---------------------------------------------------------------- operating system

export interface OsFeature {
  id: string
  name: string
  note: string
  points: number
}
export const OS_FEATURES: OsFeature[] = [
  { id: 'fluid', name: 'Fluid interface', note: 'Animations and gestures that feel effortless.', points: 6 },
  { id: 'privacy', name: 'Privacy vault', note: 'On-device data protection people trust.', points: 5 },
  { id: 'assistant', name: 'On-device assistant', note: 'A capable assistant that works offline.', points: 7 },
  { id: 'gaming', name: 'Game mode', note: 'Frame pacing and touch response tuned for games.', points: 4 },
  { id: 'continuity', name: 'Device continuity', note: 'Your devices work as one. Worth more with every device type you sell.', points: 3 },
  { id: 'updates', name: 'Seven-year updates', note: 'Long support makes owners happier.', points: 5 },
  { id: 'store', name: 'App store', note: 'Opens a services income stream from everyone who owns your devices.', points: 4 },
  { id: 'pro', name: 'Pro app suite', note: 'First-party creative and office apps.', points: 5 },
]
/** New features that can be added in one version. */
export const OS_FEATURES_PER_VERSION = 2
export const STOCK_OS = 'Androyd'

export const newOs = (): OsState => ({ own: false, name: STOCK_OS, version: 0, quality: 0, features: [], servicesIncome: 0 })

/** What buyers expect of an operating system today. The stock OS always meets it exactly. */
export const industryOs = (day: number) => 55 + 2.2 * (day / DAYS_PER_YEAR)

export function osProjectCost(first: boolean, features: number): number {
  return first ? 4e6 : 1.5e6 + 0.5e6 * features
}
export function osProjectDays(s: GameState, first: boolean): number {
  return Math.max(first ? 120 : 75, Math.round((first ? 300 : 200) / (1 + 0.15 * staffEffects(s).software)))
}

/** Device types the player currently has on sale. */
const typesOnSale = (s: GameState) => DEVICE_TYPES.filter((t) => s.products.some((p) => p.companyId === 'player' && p.status === 'sale' && p.type === t)).length

export function osFeaturePoints(s: GameState, features: string[]): number {
  let pts = 0
  for (const id of features) {
    const f = OS_FEATURES.find((x) => x.id === id)
    if (!f) continue
    pts += id === 'continuity' ? f.points * Math.max(1, typesOnSale(s)) : f.points
  }
  return pts
}

/** Quality a version would ship with if it were finished today. */
export function osShipQuality(s: GameState, features: string[]): number {
  return industryOs(s.day) - 12 + 4 * Math.min(staffEffects(s).software, 7) + osFeaturePoints(s, features)
}

/** Appeal bonus (or penalty) the company's devices get from their software. */
export function softwareBonus(s: GameState): number {
  if (!s.os.own) return 0
  return clamp(((s.os.quality - industryOs(s.day)) / 100) * 0.5, -0.08, 0.1)
}

/** Monthly services income from an app store. */
export function servicesPerMonth(s: GameState): number {
  if (!s.os.own || !s.os.features.includes('store')) return 0
  return s.owners * 0.35 * clamp(s.os.quality / 70, 0.3, 1.6)
}

export function osBlocked(s: GameState, features: string[]): string | null {
  if (s.os.project) return 'A version is already in development'
  if (staffEffects(s).software <= 0) return 'You need at least one software engineer at a desk'
  const fresh = features.filter((f) => !s.os.features.includes(f))
  if (fresh.length > OS_FEATURES_PER_VERSION) return `A version can add at most ${OS_FEATURES_PER_VERSION} new features`
  return null
}
