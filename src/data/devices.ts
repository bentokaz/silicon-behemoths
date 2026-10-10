// Device types, their markets, and the companies that compete in them.
import type { DeviceType, SegmentId, SubScores } from '../sim/types'

export interface TypeSpec {
  name: string
  plural: string
  /** [min, max, default] in mm. */
  width: [number, number, number]
  height: [number, number, number]
  maxThickness: number
  /** Added to the research-driven minimum thickness. */
  thickBase: number
  /** Multiplies the research-driven minimum bezel. */
  bezelScale: number
  /** Screen diagonals (inches) that score full marks. */
  diag: [number, number]
  /** Weight in grams: full marks at or below the first, zero at the second. */
  weight: [number, number]
  /** Grams per cm3 of everything that is not battery, frame or glass. */
  density: number
  /** Screen-to-body ratio that scores zero. */
  sbrFloor: number
  /** Thickness above the minimum that still scores full marks, and the range to zero. */
  thin: [number, number]
  /** Usable battery volume: margins in mm and the fill factor. */
  batt: { mx: number; my: number; mt: number; fill: number }
  /** Battery drain independent of the screen. */
  drainBase: number
  /** Converts battery life into score, and into hours for display. */
  lifeScore: number
  lifeHours: number
  chipCost: number
  panelCost: number
  assembly: number
  /** Factory capacity one unit uses, relative to a phone. */
  capacity: number
  devCost: number
  /** RAM and storage needs relative to a phone. 0 hides the choice. */
  memory: number
  /** What the third sub-score means for this type. */
  special: 'camera' | 'sensors' | 'io'
  specialLabel: string
}

export const TYPES: Record<DeviceType, TypeSpec> = {
  phone: {
    name: 'Phone', plural: 'Phones', width: [58, 92, 74], height: [120, 185, 158], maxThickness: 14, thickBase: 0, bezelScale: 1, diag: [6, 7.1], weight: [190, 265], density: 0.55, sbrFloor: 0.65, thin: [1.2, 4.5],
    batt: { mx: 6, my: 30, mt: 3.6, fill: 0.42 }, drainBase: 12, lifeScore: 0.9, lifeHours: 0.3, chipCost: 1, panelCost: 1, assembly: 12, capacity: 1, devCost: 1, memory: 1, special: 'camera', specialLabel: 'Camera',
  },
  tablet: {
    name: 'Tablet', plural: 'Tablets', width: [130, 230, 178], height: [190, 310, 250], maxThickness: 11, thickBase: -1, bezelScale: 2, diag: [10, 13.2], weight: [480, 760], density: 0.75, sbrFloor: 0.62, thin: [0.9, 3.2],
    batt: { mx: 10, my: 20, mt: 3.2, fill: 0.25 }, drainBase: 22, lifeScore: 1.75, lifeHours: 0.28, chipCost: 1.2, panelCost: 0.55, assembly: 18, capacity: 1.4, devCost: 1.2, memory: 1, special: 'camera', specialLabel: 'Camera',
  },
  watch: {
    name: 'Watch', plural: 'Watches', width: [32, 52, 42], height: [34, 56, 46], maxThickness: 16, thickBase: 2.5, bezelScale: 0.9, diag: [1.5, 2.3], weight: [42, 90], density: 0.9, sbrFloor: 0.42, thin: [1.5, 4],
    batt: { mx: 8, my: 8, mt: 6, fill: 0.22 }, drainBase: 3, lifeScore: 1.6, lifeHours: 1.1, chipCost: 0.4, panelCost: 1.6, assembly: 9, capacity: 0.6, devCost: 0.7, memory: 0, special: 'sensors', specialLabel: 'Sensors',
  },
  laptop: {
    name: 'Laptop', plural: 'Laptops', width: [280, 400, 322], height: [190, 285, 222], maxThickness: 30, thickBase: 4, bezelScale: 2.2, diag: [13.2, 17.5], weight: [1300, 2600], density: 0.68, sbrFloor: 0.68, thin: [3, 12],
    batt: { mx: 20, my: 90, mt: 6, fill: 0.2 }, drainBase: 150, lifeScore: 2.3, lifeHours: 0.4, chipCost: 2.4, panelCost: 0.5, assembly: 45, capacity: 2.2, devCost: 1.8, memory: 2, special: 'io', specialLabel: 'Keyboard and ports',
  },
}

export const subLabel = (type: DeviceType, key: keyof SubScores): string =>
  key === 'camera' ? TYPES[type].specialLabel : { perf: 'Performance', display: 'Display', battery: 'Battery', design: 'Design' }[key]

// ---- laptop and watch options

export const GPUS = [
  { name: 'Integrated graphics', cost: 0, boost: 0, drain: 0, weight: 0, thick: 0 },
  { name: 'Entry GPU', cost: 70, boost: 0.1, drain: 60, weight: 90, thick: 1.5 },
  { name: 'Performance GPU', cost: 170, boost: 0.2, drain: 130, weight: 180, thick: 3 },
  { name: 'Enthusiast GPU', cost: 360, boost: 0.3, drain: 220, weight: 300, thick: 5 },
]
export const KEYBOARDS = [
  { name: 'Membrane', cost: 8, level: 0 },
  { name: 'Scissor, backlit', cost: 20, level: 0 },
  { name: 'Low-profile mechanical', cost: 38, level: 2 },
  { name: 'Haptic glass', cost: 60, level: 5 },
]
export interface IoInfo {
  id: string
  name: string
  cost: number
  /** Chipset level needed. */
  level: number
  /** Points toward the special score. */
  value: number
  /** Laptop port size in mm, for the model. */
  size?: [number, number]
}
export const PORTS: IoInfo[] = [
  { id: 'usbc', name: 'USB-C', cost: 2, level: 0, value: 1, size: [8.6, 2.8] },
  { id: 'usbc2', name: 'Second USB-C', cost: 2, level: 0, value: 0.8, size: [8.6, 2.8] },
  { id: 'usba', name: 'USB-A', cost: 1.5, level: 0, value: 0.8, size: [13, 5] },
  { id: 'hdmi', name: 'HDMI', cost: 3, level: 0, value: 0.8, size: [15, 5.2] },
  { id: 'jack', name: 'Headphone jack', cost: 1, level: 0, value: 0.6, size: [4.2, 4.2] },
  { id: 'sd', name: 'SD card reader', cost: 3, level: 0, value: 0.6, size: [24, 2.4] },
  { id: 'thunder', name: 'Thunderlink 5', cost: 9, level: 3, value: 1.2, size: [8.6, 2.8] },
]
export const SENSORS: IoInfo[] = [
  { id: 'heart', name: 'Heart rate', cost: 2, level: 0, value: 22 },
  { id: 'gps', name: 'GPS', cost: 3, level: 0, value: 18 },
  { id: 'spo2', name: 'Blood oxygen', cost: 3, level: 1, value: 16 },
  { id: 'lte', name: 'Cellular', cost: 8, level: 2, value: 16 },
  { id: 'ecg', name: 'ECG', cost: 5, level: 3, value: 18 },
  { id: 'temp', name: 'Skin temperature', cost: 4, level: 4, value: 16 },
  { id: 'bp', name: 'Blood pressure', cost: 9, level: 5, value: 18 },
  { id: 'glucose', name: 'Glucose trend', cost: 20, level: 7, value: 34 },
]
export const STRAPS = [
  { id: 'silicone', name: 'Silicone', cost: 2, premium: 0.4, level: 0 },
  { id: 'nylon', name: 'Woven nylon', cost: 4, premium: 0.55, level: 0 },
  { id: 'leather', name: 'Leather', cost: 9, premium: 0.8, level: 0 },
  { id: 'steel', name: 'Steel link', cost: 22, premium: 0.9, level: 1 },
  { id: 'titanium', name: 'Titanium link', cost: 45, premium: 1, level: 3 },
]

// ---- markets

export interface SegmentInfo {
  id: SegmentId
  type: DeviceType
  name: string
  /** Buyers per year at game start. */
  size: number
  priceRef: number
  sens: number
  expect: number
  /** Weights sum to 1. */
  weights: SubScores & { brand: number }
}
export const SEGMENTS: SegmentInfo[] = [
  { id: 'budget', type: 'phone', name: 'Budget', size: 20e6, priceRef: 180, sens: 2.2, expect: 0.56, weights: { perf: 0.2, display: 0.15, camera: 0.15, battery: 0.3, design: 0.1, brand: 0.1 } },
  { id: 'mainstream', type: 'phone', name: 'Mainstream', size: 20e6, priceRef: 450, sens: 1.5, expect: 0.8, weights: { perf: 0.2, display: 0.2, camera: 0.2, battery: 0.15, design: 0.15, brand: 0.1 } },
  { id: 'flagship', type: 'phone', name: 'Flagship', size: 8e6, priceRef: 1050, sens: 0.8, expect: 0.95, weights: { perf: 0.2, display: 0.18, camera: 0.2, battery: 0.1, design: 0.2, brand: 0.12 } },
  { id: 'gamer', type: 'phone', name: 'Gamer', size: 4e6, priceRef: 700, sens: 1.2, expect: 0.9, weights: { perf: 0.48, display: 0.25, camera: 0.02, battery: 0.15, design: 0.06, brand: 0.04 } },
  { id: 'business', type: 'phone', name: 'Business', size: 5e6, priceRef: 800, sens: 1.0, expect: 0.8, weights: { perf: 0.2, display: 0.13, camera: 0.07, battery: 0.28, design: 0.14, brand: 0.18 } },
  { id: 'camera', type: 'phone', name: 'Camera fan', size: 3.5e6, priceRef: 900, sens: 1.0, expect: 0.88, weights: { perf: 0.1, display: 0.14, camera: 0.52, battery: 0.1, design: 0.1, brand: 0.04 } },

  { id: 't-budget', type: 'tablet', name: 'Budget tablet', size: 6e6, priceRef: 230, sens: 2.0, expect: 0.62, weights: { perf: 0.2, display: 0.3, camera: 0.05, battery: 0.25, design: 0.1, brand: 0.1 } },
  { id: 't-main', type: 'tablet', name: 'Family tablet', size: 7e6, priceRef: 520, sens: 1.4, expect: 0.76, weights: { perf: 0.2, display: 0.3, camera: 0.08, battery: 0.2, design: 0.14, brand: 0.08 } },
  { id: 't-pro', type: 'tablet', name: 'Pro tablet', size: 2.5e6, priceRef: 1100, sens: 0.8, expect: 0.93, weights: { perf: 0.32, display: 0.28, camera: 0.05, battery: 0.1, design: 0.17, brand: 0.08 } },

  { id: 'w-fit', type: 'watch', name: 'Fitness band', size: 9e6, priceRef: 85, sens: 2.0, expect: 0.64, weights: { perf: 0.05, display: 0.15, camera: 0.3, battery: 0.35, design: 0.1, brand: 0.05 } },
  { id: 'w-smart', type: 'watch', name: 'Smartwatch', size: 7e6, priceRef: 280, sens: 1.3, expect: 0.84, weights: { perf: 0.15, display: 0.2, camera: 0.25, battery: 0.15, design: 0.17, brand: 0.08 } },
  { id: 'w-lux', type: 'watch', name: 'Luxury watch', size: 1.5e6, priceRef: 800, sens: 0.7, expect: 0.88, weights: { perf: 0.08, display: 0.15, camera: 0.15, battery: 0.1, design: 0.4, brand: 0.12 } },

  { id: 'l-budget', type: 'laptop', name: 'Budget laptop', size: 9e6, priceRef: 520, sens: 2.0, expect: 0.56, weights: { perf: 0.25, display: 0.15, camera: 0.2, battery: 0.2, design: 0.1, brand: 0.1 } },
  { id: 'l-ultra', type: 'laptop', name: 'Ultrabook', size: 8e6, priceRef: 1300, sens: 1.2, expect: 0.76, weights: { perf: 0.2, display: 0.2, camera: 0.15, battery: 0.2, design: 0.18, brand: 0.07 } },
  { id: 'l-game', type: 'laptop', name: 'Gaming laptop', size: 3.5e6, priceRef: 1900, sens: 1.1, expect: 0.9, weights: { perf: 0.5, display: 0.22, camera: 0.1, battery: 0.05, design: 0.08, brand: 0.05 } },
  { id: 'l-pro', type: 'laptop', name: 'Workstation', size: 2.5e6, priceRef: 2500, sens: 0.8, expect: 0.93, weights: { perf: 0.35, display: 0.22, camera: 0.18, battery: 0.1, design: 0.1, brand: 0.05 } },
]
export const segmentInfo = (id: SegmentId) => SEGMENTS.find((s) => s.id === id)!
export const segmentsOf = (type: DeviceType) => SEGMENTS.filter((s) => s.type === type)

/** How rivals build a device for each segment. */
export interface Tier {
  drop: number
  chipTier: number
  cams: number
  thick: number
  bezel: number
  matRank: number
  margin: number
  gpu?: number
  keyboard?: number
  io?: number
  /** Width, height as a fraction between the type's min and max. */
  size?: [number, number]
}
export const TIERS: Record<SegmentId, Tier> = {
  budget: { drop: 2, chipTier: 0, cams: 2, thick: 1.6, bezel: 2.2, matRank: 0, margin: 0.18 },
  mainstream: { drop: 1, chipTier: 1, cams: 3, thick: 1.0, bezel: 1.5, matRank: 1, margin: 0.45 },
  flagship: { drop: 0, chipTier: 2, cams: 3, thick: 0.7, bezel: 1.05, matRank: 2, margin: 1.1 },
  gamer: { drop: 1, chipTier: 2, cams: 2, thick: 2.2, bezel: 1.4, matRank: 1, margin: 0.6 },
  business: { drop: 1, chipTier: 1, cams: 2, thick: 1.4, bezel: 1.5, matRank: 2, margin: 0.8 },
  camera: { drop: 1, chipTier: 1, cams: 4, thick: 1.3, bezel: 1.2, matRank: 2, margin: 0.7 },
  't-budget': { drop: 2, chipTier: 0, cams: 1, thick: 1.6, bezel: 1.8, matRank: 0, margin: 0.2 },
  't-main': { drop: 1, chipTier: 1, cams: 1, thick: 1.0, bezel: 1.3, matRank: 1, margin: 0.5 },
  't-pro': { drop: 0, chipTier: 2, cams: 2, thick: 0.6, bezel: 1.05, matRank: 2, margin: 1.0 },
  'w-fit': { drop: 2, chipTier: 0, cams: 0, thick: 1.5, bezel: 2.4, matRank: 0, margin: 0.3, io: 3, size: [0.15, 0.5] },
  'w-smart': { drop: 1, chipTier: 1, cams: 0, thick: 1.0, bezel: 1.4, matRank: 1, margin: 0.7, io: 5 },
  'w-lux': { drop: 0, chipTier: 2, cams: 0, thick: 0.8, bezel: 1.1, matRank: 2, margin: 1.4, io: 6 },
  'l-budget': { drop: 2, chipTier: 0, cams: 1, thick: 4, bezel: 2.2, matRank: 0, margin: 0.18, gpu: 0, keyboard: 0, io: 4 },
  'l-ultra': { drop: 1, chipTier: 1, cams: 1, thick: 1.5, bezel: 1.2, matRank: 2, margin: 0.55, gpu: 0, keyboard: 1, io: 3 },
  'l-game': { drop: 0, chipTier: 2, cams: 1, thick: 8, bezel: 1.5, matRank: 1, margin: 0.5, gpu: 3, keyboard: 2, io: 6, size: [0.75, 0.75] },
  'l-pro': { drop: 0, chipTier: 2, cams: 1, thick: 4, bezel: 1.2, matRank: 2, margin: 0.9, gpu: 2, keyboard: 1, io: 6, size: [0.6, 0.6] },
}

export const OUTLETS: { name: string; weights: SubScores; value: number }[] = [
  { name: 'TechVerdict', weights: { perf: 0.2, display: 0.2, camera: 0.2, battery: 0.2, design: 0.2 }, value: 0.45 },
  { name: 'Benchmark Daily', weights: { perf: 0.45, display: 0.25, camera: 0.05, battery: 0.2, design: 0.05 }, value: 0.35 },
  { name: 'LensLab', weights: { perf: 0.08, display: 0.17, camera: 0.45, battery: 0.05, design: 0.25 }, value: 0.35 },
  { name: 'The Wallet', weights: { perf: 0.2, display: 0.2, camera: 0.2, battery: 0.25, design: 0.15 }, value: 0.65 },
]

export interface RivalSeed {
  name: string
  color: string
  brand: number
  awareness: number
  techOffset: number
  priceMult: number
  /** Appeal bonus from its software. */
  software: number
  segments: SegmentId[]
  layout: number
  palette: string[]
  series: Record<string, string>
  counter: number
}
// Parody companies. Names are stored in the save and can be edited in System.
export const RIVALS: RivalSeed[] = [
  { name: 'Pear', color: '#c9ccd1', brand: 0.92, awareness: 0.95, techOffset: 0.4, priceMult: 1.2, software: 0.06, segments: ['flagship', 'mainstream', 't-main', 't-pro', 'w-smart', 'w-lux', 'l-ultra', 'l-pro'], layout: 1, palette: ['#3b3d42', '#e8e4dc', '#5b6470', '#c8b89a'], series: { flagship: 'pPhone Pro', mainstream: 'pPhone', 't-main': 'pPad', 't-pro': 'pPad Pro', 'w-smart': 'pWatch', 'w-lux': 'pWatch Edition', 'l-ultra': 'PearBook Air', 'l-pro': 'PearBook Pro' }, counter: 18 },
  { name: 'Samsong', color: '#3d7be0', brand: 0.82, awareness: 0.95, techOffset: 0.3, priceMult: 1.05, software: 0.01, segments: ['budget', 'mainstream', 'flagship', 'camera', 't-budget', 't-main', 'w-smart', 'l-ultra'], layout: 4, palette: ['#1c1f26', '#b9c7d8', '#d9d3e6', '#2e4a3c'], series: { budget: 'Cosmos A', mainstream: 'Cosmos FE', flagship: 'Cosmos S', camera: 'Cosmos Ultra', 't-budget': 'Cosmos Tab A', 't-main': 'Cosmos Tab S', 'w-smart': 'Cosmos Watch', 'l-ultra': 'Cosmos Book' }, counter: 26 },
  { name: 'Xiaomy', color: '#f0802a', brand: 0.6, awareness: 0.8, techOffset: 0, priceMult: 0.85, software: -0.01, segments: ['budget', 'mainstream', 'gamer', 't-budget', 'w-fit'], layout: 2, palette: ['#14161a', '#3a5f8a', '#e9e9e9', '#2a6e58'], series: { budget: 'Redmo', mainstream: 'Mi Note', gamer: 'Poko F', 't-budget': 'Redmo Pad', 'w-fit': 'Mi Band' }, counter: 15 },
  { name: 'Gooble', color: '#35b06a', brand: 0.75, awareness: 0.7, techOffset: 0.2, priceMult: 1, software: 0.04, segments: ['camera', 'mainstream', 't-main', 'w-smart'], layout: 3, palette: ['#e6e1d6', '#22262b', '#9fb6a5', '#d9a7a0'], series: { camera: 'Pixl Pro', mainstream: 'Pixl a', 't-main': 'Pixl Tablet', 'w-smart': 'Pixl Watch' }, counter: 11 },
  { name: 'OnePlum', color: '#e0403c', brand: 0.65, awareness: 0.55, techOffset: 0, priceMult: 0.9, software: 0.01, segments: ['mainstream', 'gamer'], layout: 2, palette: ['#16181c', '#2c5a4a', '#c9c9cc'], series: { mainstream: 'Nord', gamer: 'Plum R' }, counter: 14 },
  { name: 'Nokai', color: '#2f5fb5', brand: 0.55, awareness: 0.7, techOffset: -0.8, priceMult: 0.9, software: 0, segments: ['budget', 'business', 't-budget'], layout: 0, palette: ['#20242b', '#39506b', '#6b7078'], series: { budget: 'Brick G', business: 'Brick X', 't-budget': 'Brick Tab' }, counter: 40 },
  { name: 'Sonny', color: '#8a8f98', brand: 0.7, awareness: 0.6, techOffset: 0, priceMult: 1.15, software: 0, segments: ['camera', 'flagship'], layout: 0, palette: ['#111214', '#3d4a3f', '#bfc2c7'], series: { camera: 'Xperion Pro', flagship: 'Xperion 1 Mk' }, counter: 7 },
  { name: 'Azus', color: '#d43a5a', brand: 0.62, awareness: 0.5, techOffset: 0.1, priceMult: 1, software: 0, segments: ['gamer', 'l-game', 'l-budget'], layout: 3, palette: ['#0f1012', '#2a2d33', '#e6e6e8'], series: { gamer: 'ROC Phone', 'l-game': 'ROC Strike', 'l-budget': 'VivoBuk' }, counter: 10 },
  { name: 'BlockBerry', color: '#6c7a89', brand: 0.6, awareness: 0.5, techOffset: -0.4, priceMult: 1.05, software: 0.02, segments: ['business'], layout: 0, palette: ['#101114', '#2b2f36', '#4a3b2c'], series: { business: 'Key' }, counter: 4 },
  { name: 'Lenova', color: '#c8553d', brand: 0.68, awareness: 0.75, techOffset: 0, priceMult: 0.95, software: 0, segments: ['l-budget', 'l-ultra', 'l-pro', 't-budget'], layout: 0, palette: ['#17181b', '#3a3d42', '#9da2a8'], series: { 'l-budget': 'IdeaPod', 'l-ultra': 'ThinkPod X', 'l-pro': 'ThinkPod P', 't-budget': 'Tab M' }, counter: 9 },
  { name: 'Dull', color: '#4a90c2', brand: 0.66, awareness: 0.75, techOffset: 0, priceMult: 1, software: 0, segments: ['l-budget', 'l-ultra', 'l-game'], layout: 0, palette: ['#c9ccd1', '#1b1d21', '#4b5563'], series: { 'l-budget': 'Inspira', 'l-ultra': 'XPZ', 'l-game': 'Alienwear' }, counter: 15 },
  { name: 'HB', color: '#5b8def', brand: 0.62, awareness: 0.72, techOffset: -0.2, priceMult: 0.95, software: 0, segments: ['l-budget', 'l-ultra', 'l-pro'], layout: 0, palette: ['#d5d7da', '#2a2c30', '#8a6a4a'], series: { 'l-budget': 'Pavilon', 'l-ultra': 'Spectra', 'l-pro': 'ZBuk' }, counter: 16 },
  { name: 'Fitbyte', color: '#2bb3a3', brand: 0.62, awareness: 0.6, techOffset: -0.3, priceMult: 0.9, software: 0, segments: ['w-fit', 'w-smart'], layout: 0, palette: ['#17191d', '#d8d8dc', '#3f5870', '#c98a8a'], series: { 'w-fit': 'Charge', 'w-smart': 'Versa' }, counter: 7 },
  { name: 'Garmon', color: '#7a8c3a', brand: 0.74, awareness: 0.5, techOffset: 0, priceMult: 1.15, software: 0.01, segments: ['w-fit', 'w-lux'], layout: 0, palette: ['#121314', '#4a4f3a', '#8c8f94'], series: { 'w-fit': 'Venu', 'w-lux': 'Fenyx' }, counter: 8 },
]
