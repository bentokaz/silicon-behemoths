// Core data types for the simulation. Everything here is plain JSON so a
// GameState can be saved and loaded without any conversion.

export type Track = 'display' | 'chipset' | 'camera' | 'battery' | 'charging' | 'materials' | 'design'
export const TRACKS: Track[] = ['display', 'chipset', 'camera', 'battery', 'charging', 'materials', 'design']
export type Levels = Record<Track, number>

export type DeviceType = 'phone' | 'tablet' | 'watch' | 'laptop'
export const DEVICE_TYPES: DeviceType[] = ['phone', 'tablet', 'watch', 'laptop']

export type Face = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
export type PartKind = 'camera' | 'island' | 'flash' | 'notch' | 'button' | 'port' | 'grille' | 'fingerprint' | 'logo'
export type Lens = 'wide' | 'ultrawide' | 'tele' | 'periscope' | 'macro'

/** A part placed on a device face. x/y are mm from the face centre. */
export interface PlacedPart {
  id: string
  kind: PartKind
  face: Face
  x: number
  y: number
  rot: number
  w: number
  h: number
  r?: number
  text?: string
  sensor?: number
  lens?: Lens
  underDisplay?: boolean
  /** Logo parts only: show the uploaded company logo instead of text. */
  useImage?: boolean
  finish?: 'frame' | 'back' | 'black'
  /** Buttons only: a round rotating crown (watches). */
  crown?: boolean
}

export interface Body {
  width: number
  height: number
  thickness: number
  corner: number
  edge: 'flat' | 'round'
  bezelTop: number
  bezelBottom: number
  bezelSide: number
  frameMat: string
  backMat: string
  frameColor: string
  backColor: string
  backFinish: 'gloss' | 'matte'
  /** Watches: strap material and colour. */
  strap?: string
  strapColor?: string
}

export interface Specs {
  panel: number
  refresh: number
  chipGen: number
  chipTier: number
  /** Id of one of the company's own chips, used instead of chipGen/chipTier. */
  customChip?: string
  ram: number
  storage: number
  battery: number
  charging: number
  extras: string[]
  /** Laptops: discrete graphics tier, 0 = integrated. */
  gpu?: number
  /** Laptops: keyboard quality, index into KEYBOARDS. */
  keyboard?: number
  /** Laptops: ports fitted. Watches: health sensors fitted. */
  io?: string[]
}

/** An extra colour a device is sold in. */
export interface Colorway {
  name: string
  frame: string
  back: string
}

/** A storage option sold above the base model. */
export interface StorageTier {
  storage: number
  price: number
}

export interface DeviceDesign {
  type: DeviceType
  body: Body
  parts: PlacedPart[]
  specs: Specs
  wallpaper: number
  colors?: Colorway[]
}

export interface SubScores {
  perf: number
  display: number
  /** The type's special score: camera (phone, tablet), sensors (watch), keyboard and ports (laptop). */
  camera: number
  battery: number
  design: number
}
export const SUBS: (keyof SubScores)[] = ['perf', 'display', 'camera', 'battery', 'design']

export interface Issue {
  level: 'error' | 'warn'
  text: string
  partId?: string
}

export interface DesignReport {
  pct: number
  breakdown: { key: string; label: string; score: number; max: number }[]
  issues: Issue[]
  weight: number
  sbr: number
  diag: number
  maxBattery: number
  lifeHours: number
}

export type SupplyCat = 'semis' | 'displays' | 'memory' | 'batteries' | 'materials'
export const SUPPLY_CATS: SupplyCat[] = ['semis', 'displays', 'memory', 'batteries', 'materials']
export type CostParts = Record<SupplyCat, number> & { other: number }

export interface Evaluation {
  raw: SubScores
  report: DesignReport
  /** Cost at normal component prices. */
  unitCost: number
  costParts: CostParts
  featureBonus: number
}

export type SegmentId = string

export interface Review {
  outlet: string
  score: number
  pros: string[]
  cons: string[]
}

export interface Feedback {
  day: number
  stars: number
  text: string
}

export interface Product {
  id: string
  companyId: string
  type: DeviceType
  name: string
  /** Product line, e.g. "Nova 3". Variants share it. */
  family: string
  /** Variant label within the family: '', 'Pro', 'Lite', ... */
  variant: string
  design: DeviceDesign
  segment?: SegmentId
  price: number
  tiers: StorageTier[]
  /** Current cost to build one unit, at today's component prices. */
  unitCost: number
  costParts: CostParts
  status: 'dev' | 'sale' | 'ended'
  devDaysLeft: number
  launchDay: number
  endDay?: number
  raw: SubScores
  featureBonus: number
  designPct: number
  weight: number
  lifeHours: number
  diag: number
  reviews: Review[]
  reviewAvg: number
  stock: number
  carry: number
  unitsSold: number
  revenue: number
  /** One-off launch marketing budget. */
  marketing: number
  /** Extra hype from a launch event, 0-1. */
  hype: number
  /** Campaign-driven interest per segment, 0-1. */
  buzz: Record<string, number>
  /** Share of units that turn out faulty. */
  defectRate: number
  /** How happy owners are, 0-1. */
  satisfaction: number
  feedback: Feedback[]
  monthUnits: number
  history: number[]
  segUnits: Record<string, number>
}

export interface Company {
  id: string
  name: string
  color: string
  isPlayer: boolean
  alive: boolean
  brand: number
  awareness: number
  techOffset: number
  priceMult: number
  segments: SegmentId[]
  layout: number
  palette: string[]
  series: Record<string, string>
  counter: number
  nextLaunch: Record<string, number>
  unitsYear: number[]
  weakMonths: number
  revenueTotal: number
  unitsTotal: number
  /** Appeal bonus from the operating system its devices run. */
  software: number
  /** Uploaded logo as a small PNG data URL (player only). */
  logo?: string
}

export type Role = 'engineer' | 'software' | 'designer' | 'researcher' | 'marketer' | 'support'
export const ROLES: Role[] = ['engineer', 'software', 'designer', 'researcher', 'marketer', 'support']

export interface Employee {
  id: string
  name: string
  role: Role
  skill: number
  /** Skill ceiling this person can reach. */
  potential: number
  /** Monthly salary. */
  salary: number
  hiredDay: number
  look: number
  morale: number
  traits: string[]
  /** Day a training course ends; no output until then. */
  trainingUntil?: number
  /** Monthly salary this person is asking for, if they want a raise. */
  ask?: number
  /** Consecutive days of very low morale. */
  lowDays: number
  /** After a refused raise: the day they may ask again. */
  raiseAfter?: number
}

// ---- buildable sites: offices, factories, stores

export type SiteKind = 'office' | 'factory' | 'store'

export interface SiteItem {
  id: string
  kind: string
  x: number
  y: number
  /** Quarter turns, 0-3. */
  rot: number
}

/** A wall segment on the north or west edge of a tile. */
export interface SiteWall {
  id: string
  x: number
  y: number
  side: 'n' | 'w'
  kind: 'wall' | 'glass' | 'door'
}

export interface Site {
  kind: SiteKind
  tier: number
  w: number
  h: number
  shape: 'rect' | 'ring'
  items: SiteItem[]
  walls: SiteWall[]
  /** Floor finish per tile, keyed "x,y". Missing tiles use the default. */
  floor: Record<string, string>
}

export interface Store {
  id: string
  name: string
  location: string
  site: Site
  openedDay: number
  unitsTotal: number
  monthUnits: number
  lastVisitors: number
}

export interface ProductionOrder {
  id: string
  productId: string
  quantity: number
  done: number
  mode: 'contract' | 'factory'
  placedDay: number
}

export interface SupplyState {
  index: Record<SupplyCat, number>
  /** Extra price pressure from a shortage, decaying over time. */
  shock: Record<SupplyCat, number>
  shockDays: Record<SupplyCat, number>
  /** Fixed-price contracts: the locked index and the day it ends. */
  locks: Partial<Record<SupplyCat, { value: number; until: number }>>
  history: Record<SupplyCat, number[]>
}

export type ChannelId = 'online' | 'social' | 'tv' | 'outdoor' | 'press' | 'esports'

export interface Campaign {
  id: string
  channel: ChannelId
  /** A product id, or 'brand' for the whole company. */
  target: string
  monthly: number
  startedDay: number
  spent: number
}

export type EventType = 'keynote' | 'expo' | 'fanfest' | 'devcon'

export interface GameEvent {
  id: string
  type: EventType
  /** Index into the type's venue list. */
  venue: number
  day: number
  productId?: string
  cost: number
  done: boolean
  score?: number
  summary?: string
}

export interface CustomChip {
  id: string
  name: string
  gen: number
  /** 0-1 design sliders. */
  power: number
  graphics: number
  efficiency: number
  status: 'dev' | 'ready'
  devDaysLeft: number
  /** Result of the team's work, around 1.0. */
  quality: number
  /** Licence fee per unit offered to rivals, 0 = not offered. */
  licenceFee: number
  licenceIncome: number
}

export interface OsState {
  /** False while the company licenses the stock operating system. */
  own: boolean
  name: string
  version: number
  quality: number
  features: string[]
  /** Next version in development. */
  project?: { daysLeft: number; total: number; features: string[]; first: boolean }
  servicesIncome: number
}

export type Difficulty = 'relaxed' | 'normal' | 'tough'

export interface GameConfig {
  companyName: string
  color: string
  difficulty: Difficulty
  startCash: number
  researchSpeed: number
  rivalStrength: number
  techLevel: number
  unlimitedMoney: boolean
  seed: number
  logo?: string
}

export interface MonthReport {
  month: number
  revenue: number
  /** Licensing and services income. */
  other: number
  production: number
  rd: number
  marketing: number
  development: number
  overhead: number
  salaries: number
  /** Factory and store running costs. */
  facilities: number
  interest: number
  units: number
  cash: number
}
export const COST_KEYS = ['production', 'rd', 'marketing', 'development', 'overhead', 'salaries', 'facilities', 'interest'] as const
export type CostKey = (typeof COST_KEYS)[number]
export const monthCosts = (r: MonthReport) => COST_KEYS.reduce((a, k) => a + r[k], 0)

export interface NewsItem {
  id: number
  day: number
  kind: 'launch' | 'review' | 'research' | 'rival' | 'finance' | 'alert' | 'staff' | 'event'
  text: string
  productId?: string
}

export interface GameState {
  version: number
  config: GameConfig
  rng: number
  day: number
  nextId: number
  cash: number
  debtDays: number
  gameOver: boolean
  companies: Company[]
  products: Product[]
  levels: Levels
  /** Researched branch features (ids from FEATURES). */
  features: string[]
  /** Money invested so far, keyed by track name or 'f:' + feature id. */
  progress: Record<string, number>
  activeResearch: string[]
  rdBudget: number
  staff: Employee[]
  candidates: Employee[]
  office: Site
  factory: Site | null
  orders: ProductionOrder[]
  supply: SupplyState
  stores: Store[]
  campaigns: Campaign[]
  events: GameEvent[]
  chips: CustomChip[]
  os: OsState
  /** People who own one of the company's devices. */
  owners: number
  fans: number
  cur: MonthReport
  reports: MonthReport[]
  shareHistory: { month: number; units: Record<string, number> }[]
  monthShare: Record<string, number>
  news: NewsItem[]
}
