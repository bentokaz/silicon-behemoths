// Core data types for the simulation. Everything here is plain JSON so a
// GameState can be saved and loaded without any conversion.

export type Track = 'display' | 'chipset' | 'camera' | 'battery' | 'charging' | 'materials' | 'design'
export const TRACKS: Track[] = ['display', 'chipset', 'camera', 'battery', 'charging', 'materials', 'design']
export type Levels = Record<Track, number>

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
}

export interface Specs {
  panel: number
  refresh: number
  chipGen: number
  chipTier: number
  ram: number
  storage: number
  battery: number
  charging: number
  extras: string[]
}

export interface DeviceDesign {
  type: 'phone'
  body: Body
  parts: PlacedPart[]
  specs: Specs
  wallpaper: number
}

export interface SubScores {
  perf: number
  display: number
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

export interface Evaluation {
  raw: SubScores
  report: DesignReport
  unitCost: number
  featureBonus: number
}

export type SegmentId = 'budget' | 'mainstream' | 'flagship' | 'gamer' | 'business' | 'camera'

export interface Review {
  outlet: string
  score: number
  pros: string[]
  cons: string[]
}

export interface Product {
  id: string
  companyId: string
  name: string
  design: DeviceDesign
  segment?: SegmentId
  price: number
  unitCost: number
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
  marketing: number
  monthUnits: number
  history: number[]
  segUnits: Partial<Record<SegmentId, number>>
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
  series: Partial<Record<SegmentId, string>>
  counter: number
  nextLaunch: Partial<Record<SegmentId, number>>
  unitsYear: number[]
  weakMonths: number
  revenueTotal: number
  unitsTotal: number
  /** Uploaded logo as a small PNG data URL (player only). */
  logo?: string
}

export type Role = 'engineer' | 'designer' | 'researcher' | 'marketer'
export const ROLES: Role[] = ['engineer', 'designer', 'researcher', 'marketer']

export interface Employee {
  id: string
  name: string
  role: Role
  skill: number
  /** Monthly salary. */
  salary: number
  hiredDay: number
  look: number
}

export type OfficeItemKind = 'desk' | 'bench' | 'server' | 'meeting' | 'coffee' | 'sofa' | 'plant' | 'wall'

export interface OfficeItem {
  id: string
  kind: OfficeItemKind
  x: number
  y: number
  /** Quarter turns, 0-3. */
  rot: number
}

export interface Office {
  tier: number
  w: number
  h: number
  items: OfficeItem[]
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
  production: number
  rd: number
  marketing: number
  development: number
  overhead: number
  salaries: number
  interest: number
  units: number
  cash: number
}

export interface NewsItem {
  id: number
  day: number
  kind: 'launch' | 'review' | 'research' | 'rival' | 'finance' | 'alert'
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
  staff: Employee[]
  candidates: Employee[]
  office: Office
  rdBudget: number
  cur: MonthReport
  reports: MonthReport[]
  shareHistory: { month: number; units: Record<string, number> }[]
  monthShare: Record<string, number>
  news: NewsItem[]
}
