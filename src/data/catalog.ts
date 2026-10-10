// Game content as data: research tracks, parts, materials, customer segments.
import type { Lens, SegmentId, SubScores, Track } from '../sim/types'

export const MAX_LEVEL = 8
export const DAYS_PER_MONTH = 30
export const DAYS_PER_YEAR = 360
export const START_YEAR = 2026

/** Tech level of the leading edge of the market on a given day. */
export const marketLevel = (day: number) => Math.min(MAX_LEVEL, 3 + day / DAYS_PER_YEAR / 2.5)
/** Score a top device at a given tech level is expected to reach. */
export const refScore = (level: number) => 50 + 15 * level
/** Money needed to reach `level` on a research track. */
export const researchCost = (level: number) => Math.round(1.5e6 * Math.pow(1.6, level))

export const TRACK_INFO: Record<Track, { name: string; unlocks: string[] }> = {
  display: {
    name: 'Display',
    unlocks: [
      'LCD panel, 60 Hz',
      'OLED panel, 90 Hz',
      'OLED+ panel, 120 Hz',
      'LTPO OLED (adaptive refresh)',
      'Tandem OLED, 144 Hz',
      'MicroLED panel',
      'QD-MicroLED, 240 Hz',
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
      'Helix x40 series, satellite link',
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
      '108 MP sensor, periscope lens',
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
    unlocks: ['10 W', '18 W', '33 W, wireless charging', '65 W', '100 W', '150 W', '240 W', '320 W', '500 W'],
  },
  materials: {
    name: 'Materials',
    unlocks: [
      'Plastic, aluminium, glass',
      'Stainless steel, IP68 sealing',
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
      'Punch-hole camera, 2.5 mm bezels',
      'Under-display fingerprint, 1.8 mm bezels',
      '1.3 mm bezels, 6.5 mm body',
      '0.9 mm bezels, 6.0 mm body',
      'Under-display camera, 0.7 mm bezels',
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
  { hz: 60, level: 0, bonus: 0, power: 1 },
  { hz: 90, level: 1, bonus: 0.08, power: 1.08 },
  { hz: 120, level: 2, bonus: 0.14, power: 1.15 },
  { hz: 144, level: 4, bonus: 0.17, power: 1.2 },
  { hz: 240, level: 6, bonus: 0.2, power: 1.3 },
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

export interface SegmentInfo {
  id: SegmentId
  name: string
  size: number
  priceRef: number
  sens: number
  expect: number
  weights: SubScores & { brand: number }
}
// size = buyers per year at game start. Weights sum to 1.
export const SEGMENTS: SegmentInfo[] = [
  { id: 'budget', name: 'Budget', size: 20e6, priceRef: 180, sens: 2.2, expect: 0.56, weights: { perf: 0.2, display: 0.15, camera: 0.15, battery: 0.3, design: 0.1, brand: 0.1 } },
  { id: 'mainstream', name: 'Mainstream', size: 20e6, priceRef: 450, sens: 1.5, expect: 0.8, weights: { perf: 0.2, display: 0.2, camera: 0.2, battery: 0.15, design: 0.15, brand: 0.1 } },
  { id: 'flagship', name: 'Flagship', size: 8e6, priceRef: 1050, sens: 0.8, expect: 0.95, weights: { perf: 0.2, display: 0.18, camera: 0.2, battery: 0.1, design: 0.2, brand: 0.12 } },
  { id: 'gamer', name: 'Gamer', size: 4e6, priceRef: 700, sens: 1.2, expect: 0.9, weights: { perf: 0.48, display: 0.25, camera: 0.02, battery: 0.15, design: 0.06, brand: 0.04 } },
  { id: 'business', name: 'Business', size: 5e6, priceRef: 800, sens: 1.0, expect: 0.8, weights: { perf: 0.2, display: 0.13, camera: 0.07, battery: 0.28, design: 0.14, brand: 0.18 } },
  { id: 'camera', name: 'Camera fan', size: 3.5e6, priceRef: 900, sens: 1.0, expect: 0.88, weights: { perf: 0.1, display: 0.14, camera: 0.52, battery: 0.1, design: 0.1, brand: 0.04 } },
]
export const segmentInfo = (id: SegmentId) => SEGMENTS.find((s) => s.id === id)!

export const OUTLETS: { name: string; weights: SubScores; value: number }[] = [
  { name: 'TechVerdict', weights: { perf: 0.2, display: 0.2, camera: 0.2, battery: 0.2, design: 0.2 }, value: 0.45 },
  { name: 'Benchmark Daily', weights: { perf: 0.45, display: 0.25, camera: 0.05, battery: 0.2, design: 0.05 }, value: 0.35 },
  { name: 'LensLab', weights: { perf: 0.08, display: 0.17, camera: 0.45, battery: 0.05, design: 0.25 }, value: 0.35 },
  { name: 'The Wallet', weights: { perf: 0.2, display: 0.2, camera: 0.2, battery: 0.25, design: 0.15 }, value: 0.65 },
]

export const SUB_LABELS: Record<keyof SubScores, string> = {
  perf: 'Performance',
  display: 'Display',
  camera: 'Camera',
  battery: 'Battery',
  design: 'Design',
}

export interface RivalSeed {
  name: string
  color: string
  brand: number
  awareness: number
  techOffset: number
  priceMult: number
  segments: SegmentId[]
  layout: number
  palette: string[]
  series: Partial<Record<SegmentId, string>>
  counter: number
}
// Parody companies. Names are stored in the save and can be edited in Settings.
export const RIVALS: RivalSeed[] = [
  { name: 'Pear', color: '#c9ccd1', brand: 0.92, awareness: 0.95, techOffset: 0.4, priceMult: 1.2, segments: ['flagship', 'mainstream'], layout: 1, palette: ['#3b3d42', '#e8e4dc', '#5b6470', '#c8b89a'], series: { flagship: 'pPhone Pro', mainstream: 'pPhone' }, counter: 18 },
  { name: 'Samsong', color: '#3d7be0', brand: 0.82, awareness: 0.95, techOffset: 0.3, priceMult: 1.05, segments: ['budget', 'mainstream', 'flagship', 'camera'], layout: 4, palette: ['#1c1f26', '#b9c7d8', '#d9d3e6', '#2e4a3c'], series: { budget: 'Cosmos A', mainstream: 'Cosmos FE', flagship: 'Cosmos S', camera: 'Cosmos Ultra' }, counter: 26 },
  { name: 'Xiaomy', color: '#f0802a', brand: 0.6, awareness: 0.8, techOffset: 0, priceMult: 0.85, segments: ['budget', 'mainstream', 'gamer'], layout: 2, palette: ['#14161a', '#3a5f8a', '#e9e9e9', '#2a6e58'], series: { budget: 'Redmo', mainstream: 'Mi Note', gamer: 'Poko F' }, counter: 15 },
  { name: 'Gooble', color: '#35b06a', brand: 0.75, awareness: 0.7, techOffset: 0.2, priceMult: 1, segments: ['camera', 'mainstream'], layout: 3, palette: ['#e6e1d6', '#22262b', '#9fb6a5', '#d9a7a0'], series: { camera: 'Pixl Pro', mainstream: 'Pixl a' }, counter: 11 },
  { name: 'OnePlum', color: '#e0403c', brand: 0.65, awareness: 0.55, techOffset: 0, priceMult: 0.9, segments: ['mainstream', 'gamer'], layout: 2, palette: ['#16181c', '#2c5a4a', '#c9c9cc'], series: { mainstream: 'Nord', gamer: 'Plum R' }, counter: 14 },
  { name: 'Nokai', color: '#2f5fb5', brand: 0.55, awareness: 0.7, techOffset: -0.8, priceMult: 0.9, segments: ['budget', 'business'], layout: 0, palette: ['#20242b', '#39506b', '#6b7078'], series: { budget: 'Brick G', business: 'Brick X' }, counter: 40 },
  { name: 'Sonny', color: '#8a8f98', brand: 0.7, awareness: 0.6, techOffset: 0, priceMult: 1.15, segments: ['camera', 'flagship'], layout: 0, palette: ['#111214', '#3d4a3f', '#bfc2c7'], series: { camera: 'Xperion Pro', flagship: 'Xperion 1 Mk' }, counter: 7 },
  { name: 'Azus', color: '#d43a5a', brand: 0.62, awareness: 0.45, techOffset: 0.1, priceMult: 1, segments: ['gamer'], layout: 3, palette: ['#0f1012', '#2a2d33', '#e6e6e8'], series: { gamer: 'ROC Phone' }, counter: 10 },
  { name: 'BlockBerry', color: '#6c7a89', brand: 0.6, awareness: 0.5, techOffset: -0.4, priceMult: 1.05, segments: ['business'], layout: 0, palette: ['#101114', '#2b2f36', '#4a3b2c'], series: { business: 'Key' }, counter: 4 },
]
