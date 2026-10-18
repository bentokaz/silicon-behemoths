// Game content as data: research tracks, parts, materials, customer segments.
import type { Lens, Levels, SupplyCat, Track } from '../sim/types'
import { TODAY, eraInfo } from './eras'

export const MAX_LEVEL = 8
export const DAYS_PER_MONTH = 30
export const DAYS_PER_YEAR = 360
/** The present-day start year. The game in hand may begin earlier: ask startYear() (see eras.ts). */
export const START_YEAR = TODAY

/** Tech level of the leading edge of the market on a given day. */
export const marketLevel = (day: number) => Math.min(MAX_LEVEL, eraInfo().level + day / DAYS_PER_YEAR / 2.5)
/** Score a top device at a given tech level is expected to reach. */
export const refScore = (level: number) => 50 + 15 * level
/** Money needed to reach `level` on a research track. */
export const researchCost = (level: number) => Math.round(1.5e6 * Math.pow(1.6, level))

export const TRACK_INFO: Record<Track, { name: string; unlocks: string[] }> = {
  display: {
    name: 'Display',
    unlocks: [
      'LCD panel',
      'OLED panel',
      'OLED+ panel',
      'LTPO OLED (adaptive refresh)',
      'Tandem OLED',
      'MicroLED panel',
      'QD-MicroLED panel',
      'Nano-emissive panel',
      'Holo-layer panel',
    ],
  },
  chipset: {
    name: 'Chipset',
    unlocks: [
      'Helix x00 series',
      'Helix x10 series',
      'Helix x20 series',
      'Helix x30 series',
      'Helix x40 series',
      'Helix x50 series',
      'Helix x60 series',
      'Helix x70 series',
      'Helix x80 series',
    ],
  },
  camera: {
    name: 'Camera',
    unlocks: [
      '12 MP sensor',
      '48 MP sensor',
      '50 MP large sensor',
      '108 MP sensor',
      '200 MP sensor',
      '1-inch sensor',
      'Stacked 1-inch sensor',
      'Liquid-lens sensor',
      'Quantum-film sensor',
    ],
  },
  battery: {
    name: 'Battery',
    unlocks: [
      'Li-ion 240 mAh/cm3',
      'Li-ion 265 mAh/cm3',
      'Li-polymer 290 mAh/cm3',
      'High-density 315 mAh/cm3',
      'Silicon-carbon 340 mAh/cm3',
      'Silicon-carbon II 365 mAh/cm3',
      'Semi-solid 390 mAh/cm3',
      'Solid-state 415 mAh/cm3',
      'Solid-state II 440 mAh/cm3',
    ],
  },
  charging: {
    name: 'Charging',
    unlocks: ['10 W', '18 W', '33 W', '65 W', '100 W', '150 W', '240 W', '320 W', '500 W'],
  },
  materials: {
    name: 'Materials',
    unlocks: [
      'Plastic, aluminium, glass',
      'Stainless steel',
      'Ceramic back',
      'Titanium frame',
      'Refined tooling (no new material)',
      'Sapphire back',
      'Liquidmetal frame',
      'Graphene composite',
      'Refined graphene (no new material)',
    ],
  },
  design: {
    name: 'Industrial design',
    unlocks: [
      '3.5 mm bezels, 8.0 mm body',
      '2.5 mm bezels, 7.5 mm body',
      '1.8 mm bezels, 7.0 mm body',
      '1.3 mm bezels, 6.5 mm body',
      '0.9 mm bezels, 6.0 mm body',
      '0.7 mm bezels, 5.5 mm body',
      '0.55 mm bezels, 5.0 mm body',
      '0.5 mm bezels, 4.5 mm body',
      '0.45 mm bezels, 4.0 mm body',
    ],
  },
}

export const MIN_BEZEL = [3.5, 2.5, 1.8, 1.3, 0.9, 0.7, 0.55, 0.5, 0.45]
export const MIN_THICKNESS = [8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4]

export const PANEL_NAMES = ['LCD', 'OLED', 'OLED+', 'LTPO OLED', 'Tandem OLED', 'MicroLED', 'QD-MicroLED', 'Nano-emissive', 'Holo-layer']
export const panelInfo = (level: number) => ({
  name: PANEL_NAMES[level],
  quality: refScore(level),
  power: 1 - 0.05 * level,
  costPerCm2: 0.25 + 0.12 * level,
})

export const REFRESH = [
  { hz: 60, level: 0, bonus: 0, power: 1, feat: '' },
  { hz: 90, level: 1, bonus: 0.08, power: 1.08, feat: 'hz90' },
  { hz: 120, level: 2, bonus: 0.14, power: 1.15, feat: 'hz120' },
  { hz: 144, level: 4, bonus: 0.17, power: 1.2, feat: 'hz144' },
  { hz: 240, level: 6, bonus: 0.2, power: 1.3, feat: 'hz240' },
]

export const CHIP_TIERS = ['Entry', 'Mid', 'Flagship']
export const chipInfo = (gen: number, tier: number) => ({
  name: `Helix ${[3, 6, 9][tier]}${gen}0`,
  perf: refScore(gen) - [30, 15, 0][tier],
  eff: 1 + 0.08 * gen + (tier === 0 ? 0.05 : 0),
  cost: [12, 30, 70][tier] * Math.pow(1.12, gen),
})

export const SENSOR_NAMES = ['12 MP', '48 MP', '50 MP large', '108 MP', '200 MP', '1-inch', 'Stacked 1-inch', 'Liquid-lens', 'Quantum-film']
export const sensorInfo = (level: number) => ({
  name: SENSOR_NAMES[level],
  quality: refScore(level),
  cost: 8 * Math.pow(1.3, level),
  minDia: 7 + level,
})
export const LENSES: Record<Lens, { name: string; cost: number; level: number }> = {
  wide: { name: 'Wide (main)', cost: 1, level: 0 },
  ultrawide: { name: 'Ultrawide', cost: 0.8, level: 0 },
  tele: { name: 'Telephoto', cost: 1.2, level: 0 },
  periscope: { name: 'Periscope zoom', cost: 1.8, level: 3 },
  macro: { name: 'Macro', cost: 0.4, level: 0 },
}

export const batteryDensity = (level: number) => 240 + 25 * level
export const CHARGE_W = [10, 18, 33, 65, 100, 150, 240, 320, 500]
export const RAM_OPTIONS = [4, 6, 8, 12, 16, 24, 32, 48, 64]
export const STORAGE_OPTIONS = [64, 128, 256, 512, 1024, 2048, 4096]
export const idealRam = (mLevel: number) => 4 * Math.pow(2, mLevel / 2.5)
export const idealStorage = (mLevel: number) => 128 * Math.pow(2, mLevel / 2.5)

export const EXTRAS: { id: string; name: string; track: Track; level: number; cost: number }[] = [
  { id: 'nfc', name: 'NFC', track: 'chipset', level: 0, cost: 2 },
  { id: 'stereo', name: 'Stereo speakers', track: 'design', level: 0, cost: 3 },
  { id: 'ip68', name: 'IP68 water resistance', track: 'materials', level: 1, cost: 5 },
  { id: 'wireless', name: 'Wireless charging', track: 'charging', level: 2, cost: 6 },
  { id: 'sat', name: 'Satellite link', track: 'chipset', level: 4, cost: 9 },
]

export interface MaterialInfo {
  id: string
  name: string
  level: number
  density: number
  cost: number
  premium: number
  use: 'frame' | 'back' | 'both'
}
export const MATERIALS: MaterialInfo[] = [
  { id: 'plastic', name: 'Polycarbonate', level: 0, density: 1.2, cost: 3, premium: 0.3, use: 'both' },
  { id: 'aluminium', name: 'Aluminium', level: 0, density: 2.7, cost: 11, premium: 0.62, use: 'both' },
  { id: 'glass', name: 'Glass', level: 0, density: 2.5, cost: 9, premium: 0.7, use: 'back' },
  { id: 'steel', name: 'Stainless steel', level: 1, density: 7.8, cost: 17, premium: 0.78, use: 'frame' },
  { id: 'ceramic', name: 'Ceramic', level: 2, density: 3.5, cost: 28, premium: 0.86, use: 'back' },
  { id: 'titanium', name: 'Titanium', level: 3, density: 4.5, cost: 38, premium: 0.93, use: 'frame' },
  { id: 'sapphire', name: 'Sapphire', level: 5, density: 3.98, cost: 55, premium: 0.97, use: 'back' },
  { id: 'liquidmetal', name: 'Liquidmetal', level: 6, density: 6, cost: 60, premium: 1, use: 'frame' },
  { id: 'graphene', name: 'Graphene composite', level: 7, density: 1.6, cost: 75, premium: 1, use: 'both' },
]
export const materialInfo = (id: string) => MATERIALS.find((m) => m.id === id) ?? MATERIALS[0]

// ---------------------------------------------------------------- tech tree
// Each track is a trunk of nine levels. Features branch off a trunk level and
// are researched separately. Some trunk levels also need another track first.

export interface FeatureInfo {
  id: string
  name: string
  track: Track
  level: number
  note: string
}
export const FEATURES: FeatureInfo[] = [
  { id: 'hz90', name: '90 Hz refresh', track: 'display', level: 1, note: 'Smoother scrolling, slightly more power draw.' },
  { id: 'hz120', name: '120 Hz refresh', track: 'display', level: 2, note: 'The mainstream standard for fluid displays.' },
  { id: 'hz144', name: '144 Hz refresh', track: 'display', level: 4, note: 'Favoured by the gamer segment.' },
  { id: 'hz240', name: '240 Hz refresh', track: 'display', level: 6, note: 'Top display score at a power cost.' },
  { id: 'nfc', name: 'NFC', track: 'chipset', level: 0, note: 'Contactless payments. A cheap extra.' },
  { id: 'sat', name: 'Satellite link', track: 'chipset', level: 4, note: 'Emergency messaging without coverage.' },
  { id: 'periscope', name: 'Periscope zoom lens', track: 'camera', level: 3, note: 'The strongest telephoto option.' },
  { id: 'wireless', name: 'Wireless charging', track: 'charging', level: 2, note: 'Also allows a phone with no port at all.' },
  { id: 'ip68', name: 'IP68 sealing', track: 'materials', level: 1, note: 'Water and dust resistance.' },
  { id: 'stereo', name: 'Stereo speakers', track: 'design', level: 0, note: 'A second speaker in the earpiece.' },
  { id: 'punch', name: 'Punch-hole camera', track: 'design', level: 1, note: 'A front camera inside the screen with no notch.' },
  { id: 'fpdisplay', name: 'Under-display fingerprint', track: 'design', level: 2, note: 'Fingerprint sensor placed on the front.' },
  { id: 'udc', name: 'Under-display camera', track: 'design', level: 5, note: 'An invisible front camera.' },
]
export const featureInfo = (id: string) => FEATURES.find((f) => f.id === id)
export const featureCost = (f: FeatureInfo) => Math.max(250e3, Math.round((researchCost(f.level) * 0.35) / 1e4) * 1e4)

/** Trunk levels that also need other tracks: TRUNK_REQS[track][level] = required levels. */
export const TRUNK_REQS: Partial<Record<Track, Record<number, Partial<Levels>>>> = {
  display: { 3: { chipset: 2 }, 5: { materials: 4 }, 7: { chipset: 6 } },
  chipset: { 5: { battery: 3 } },
  camera: { 3: { chipset: 2 }, 5: { chipset: 4 }, 7: { display: 5 } },
  battery: { 4: { materials: 3 }, 7: { materials: 6 } },
  charging: { 3: { battery: 2 }, 5: { battery: 4 }, 7: { battery: 6 } },
  design: { 3: { materials: 2 }, 5: { display: 4 }, 7: { materials: 6 } },
}

/** Features a company owns if it simply has everything up to its levels (used for rivals). */
export const featuresAtLevels = (lv: Levels) => FEATURES.filter((f) => lv[f.track] >= f.level).map((f) => f.id)

export const SUPPLY_LABELS: Record<SupplyCat, string> = {
  semis: 'Chips and sensors',
  displays: 'Displays',
  memory: 'Memory',
  batteries: 'Batteries',
  materials: 'Materials',
}
