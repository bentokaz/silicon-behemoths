// In-house technology: custom chips and the company's own operating system.
import { DAYS_PER_YEAR, marketLevel, refScore, researchCost } from '../data/catalog'
import { yearAt } from '../data/eras'
import { clamp, range } from './rng'
import { OWN_SILICON, chipFor } from './scoring'
import { staffEffects } from './staff'
import { type CustomChip, DEVICE_TYPES, type DeviceType, type GameState, type OsLook, type OsState } from './types'

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

/** The most of the rivals' devices that will ever carry a licensed chip. */
export const LICENCE_CAP = 0.06

/**
 * How good a buy a chip is for a rival at its licence fee: 1 is exactly as
 * good as the Helix of the day, more is better. A rival that licenses the
 * design has it made at a foundry's full price: the saving the company makes
 * on its own silicon (no supplier's margin) is not the rival's to have.
 */
export function licenceValue(s: GameState, c: CustomChip): number {
  const mine = chipFor({ customChip: c.id } as never, [{ ...c, status: 'ready' }])
  const gen = Math.min(8, Math.floor(marketLevel(s.day)))
  const helix = { perf: refScore(gen), cost: 70 * Math.pow(1.12, gen) }
  return mine.perf / (mine.cost / OWN_SILICON + Math.max(0, c.licenceFee)) / (helix.perf / helix.cost)
}

/** The share of rival devices a chip would win if it were the only one on offer. */
function wouldAdopt(s: GameState, c: CustomChip): number {
  if (c.status !== 'ready' || !(c.licenceFee > 0)) return 0
  // rivals only change supplier for a better buy, and only so many of them ever do
  return clamp((licenceValue(s, c) - 1) * 0.5, 0, LICENCE_CAP)
}

/**
 * Share of rival devices that use this chip at its licence fee. A device
 * carries one chip: where the company offers several, rivals take the one
 * that is the best buy for them (the dearer of two equally good buys), and
 * the others earn nothing until it is withdrawn.
 */
export function chipAdoption(s: GameState, c: CustomChip): number {
  const mine = wouldAdopt(s, c)
  if (!mine) return 0
  for (const o of s.chips) {
    if (o.id === c.id) continue
    const theirs = wouldAdopt(s, o)
    if (theirs > mine || (theirs === mine && (o.licenceFee > c.licenceFee || (o.licenceFee === c.licenceFee && o.id < c.id)))) return 0
  }
  return mine
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

/**
 * Operating systems a company can license instead of building its own. Each is
 * on offer from its first year to its last; `quality` is how far it sits above
 * or below what buyers expect of a system at the time, `royalty` what the
 * vendor takes for every device sold with it. The free one is always there.
 */
export interface OsLicence {
  id: string
  name: string
  vendor: string
  from: number
  until?: number
  quality: number
  royalty: number
  note: string
  look: OsLook
}
export const DEFAULT_OS_LOOK: OsLook = { wallpaper: 'rings', bg: '#14202c', bg2: '#ff6b1a', accent: '#ff6b1a', theme: 'dark', icons: 'squircle', font: 'sans', layout: 'grid', clock: 'big' }
const look = (o: Partial<OsLook>): OsLook => ({ ...DEFAULT_OS_LOOK, ...o })
export const FREE_OS = 'opencore'
/** Kinds of device that run the company's operating system, and so pay a licence royalty. Consoles, earbuds and speakers run firmware of their own. */
export const OS_TYPES: DeviceType[] = ['phone', 'tablet', 'watch', 'foldable', 'laptop', 'desktop', 'headset', 'handheld', 'tv']
export const OS_LICENCES: OsLicence[] = [
  { id: FREE_OS, name: 'OpenCore', vendor: 'an open-source project', from: 0, quality: -10, royalty: 0, note: 'Free and open, but rough: few apps and a clumsy interface.', look: look({ wallpaper: 'solid', bg: '#2a2d31', accent: '#8fb3d9', icons: 'square', font: 'mono', layout: 'list', clock: 'digital' }) },
  { id: 'symbion', name: 'Symbion', vendor: 'a handset consortium', from: 1998, until: 2013, quality: -3, royalty: 5, note: 'The established phone system of its day. Solid, and ageing.', look: look({ wallpaper: 'stripes', bg: '#1d3b5c', bg2: '#2b5a85', accent: '#7fd0ff', theme: 'light', icons: 'square', layout: 'list', clock: 'digital' }) },
  { id: 'windscape', name: 'Windscape Mobile', vendor: 'a desktop software giant', from: 2002, until: 2015, quality: -1, royalty: 9, note: 'Office tools and email everywhere; dear, and clumsy to touch.', look: look({ wallpaper: 'grid', bg: '#0f2a4a', bg2: '#1c4c80', accent: '#3fa0ff', icons: 'square', layout: 'tiles', clock: 'stacked' }) },
  { id: 'androyd', name: STOCK_OS, vendor: 'a search giant', from: 2008, quality: 0, royalty: 3, note: 'The everyday standard: exactly as good as buyers expect.', look: look({ wallpaper: 'waves', bg: '#1b2a24', bg2: '#3ddc84', accent: '#3ddc84', icons: 'circle', clock: 'big' }) },
  { id: 'androyd-plus', name: `${STOCK_OS} with Services`, vendor: 'a search giant', from: 2011, quality: 3, royalty: 9, note: 'The standard system with the full app store and services: a little better, and dearer.', look: look({ wallpaper: 'waves', bg: '#16222e', bg2: '#4f8fd6', accent: '#4f8fd6', icons: 'circle', clock: 'big' }) },
  { id: 'nebula', name: 'Nebula OS', vendor: 'an independent studio', from: 2018, quality: 6, royalty: 18, note: 'The most polished system you can buy in. Its makers know it.', look: look({ wallpaper: 'dots', bg: '#191526', bg2: '#9c6ade', accent: '#c59cff', icons: 'drop', font: 'rounded', clock: 'analog' }) },
]
/** The licence a company runs: saves from before licences ran Androyd. */
export const licenceInfo = (id: string | undefined): OsLicence => OS_LICENCES.find((l) => l.id === (id ?? 'androyd')) ?? OS_LICENCES[0]
/** Whether a licence can be signed on a game day: from its first year to the end of its last. */
export const licenceOpen = (l: OsLicence, day: number) => yearAt(day) >= l.from && (l.until === undefined || yearAt(day) < l.until + 1)
/** Points a licensed system loses for every year it is still used after its makers stopped: two a year. */
const ageing = (l: OsLicence, day: number) => (l.until === undefined ? 0 : Math.max(0, yearAt(day) - (l.until + 1)) * 2)
/** One-off cost of moving every device over to a licensed system. */
export const licenceSwitchCost = (l: OsLicence) => (l.royalty ? 250e3 + 25e3 * l.royalty : 0)
/** What the company pays its OS vendor for each device it sells: nothing on its own system. */
export const osRoyalty = (s: GameState) => (s.os.own ? 0 : licenceInfo(s.os.licence).royalty)
/** The quality of the system the company's devices run today, on the same scale as industryOs. */
export function osQuality(s: GameState): number {
  if (s.os.own) return s.os.quality
  const l = licenceInfo(s.os.licence)
  return industryOs(s.day) + l.quality - ageing(l, s.day)
}
/** The name of the system the company's devices run. */
export const osName = (s: GameState) => (s.os.own ? `${s.os.name} ${s.os.version}` : licenceInfo(s.os.licence).name)
/** How the company's devices look when switched on: its own design, or the licensed system's. For paintOsLook (src/3d/osLook.ts). */
export const osLookOf = (s: GameState): OsLook => (s.os.own ? cleanLook(s.os.look) : licenceInfo(s.os.licence).look)

/** Why a licence cannot be signed, or null. */
export function licenceBlocked(s: GameState, id: string): string | null {
  const l = OS_LICENCES.find((x) => x.id === id)
  if (!l) return 'There is no such operating system'
  if (s.os.own) return `Your devices run ${s.os.name}: they do not go back to a licensed system`
  if (licenceInfo(s.os.licence).id === id) return `Your devices already run ${l.name}`
  if (!licenceOpen(l, s.day)) return yearAt(s.day) < l.from ? `${l.name} is not on offer until ${l.from}` : `${l.name} has been discontinued`
  return null
}

export const newOs = (): OsState => ({ own: false, licence: FREE_OS, name: STOCK_OS, version: 0, quality: 0, features: [], servicesIncome: 0 })

const HEX = /^#[0-9a-f]{6}$/i
export const OS_LOOK_CHOICES = {
  wallpaper: ['solid', 'stripes', 'dots', 'waves', 'grid', 'rings'],
  theme: ['dark', 'light'],
  icons: ['circle', 'squircle', 'square', 'hexagon', 'drop'],
  font: ['sans', 'mono', 'serif', 'rounded'],
  layout: ['grid', 'list', 'tiles'],
  clock: ['digital', 'big', 'analog', 'stacked', 'minimal'],
} as const satisfies { [K in Exclude<keyof OsLook, 'bg' | 'bg2' | 'accent'>]: readonly OsLook[K][] }
/** A look with every part checked: colours must be '#rrggbb' and choices on the list; anything else keeps what `base` has. */
export function cleanLook(patch: unknown, base: OsLook = DEFAULT_OS_LOOK): OsLook {
  const out = { ...base }
  if (!patch || typeof patch !== 'object') return out
  const p = patch as Record<string, unknown>
  for (const k of ['bg', 'bg2', 'accent'] as const) {
    const v = p[k]
    if (typeof v === 'string' && HEX.test(v)) out[k] = v.toLowerCase()
  }
  for (const [k, list] of Object.entries(OS_LOOK_CHOICES)) {
    const v = p[k]
    if (typeof v === 'string' && (list as readonly string[]).includes(v)) (out as Record<string, unknown>)[k] = v
  }
  return out
}

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
  return clamp(((osQuality(s) - industryOs(s.day)) / 100) * 0.5, -0.08, 0.1)
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
