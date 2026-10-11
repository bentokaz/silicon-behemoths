// Core data types for the simulation. Everything here is plain JSON so a
// GameState can be saved and loaded without any conversion.

export type Track = 'display' | 'chipset' | 'camera' | 'battery' | 'charging' | 'materials' | 'design'
export const TRACKS: Track[] = ['display', 'chipset', 'camera', 'battery', 'charging', 'materials', 'design']
export type Levels = Record<Track, number>

export type DeviceType = 'phone' | 'tablet' | 'watch' | 'laptop' | 'desktop' | 'console' | 'earbuds' | 'tv'
export const DEVICE_TYPES: DeviceType[] = ['phone', 'tablet', 'watch', 'laptop', 'desktop', 'console', 'earbuds', 'tv']

export type Face = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
export type PartKind = 'camera' | 'island' | 'flash' | 'notch' | 'button' | 'port' | 'grille' | 'fingerprint' | 'logo' | 'vent' | 'slot' | 'light'
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
  /** Lights only: the colour they glow. */
  color?: string
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
  /** Desktops and TVs: stand style, an id from STANDS. */
  stand?: string
  /** Earbuds: the shape of the buds. */
  buds?: 'stem' | 'bean'
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
  /** Laptops, desktops, consoles: discrete graphics tier, 0 = integrated. */
  gpu?: number
  /** Laptops, desktops: keyboard quality, index into KEYBOARDS. Consoles: controller, index into CONTROLLERS. */
  keyboard?: number
  /** Ports, sensors or features fitted. The list depends on the device type (see ioOptions). */
  io?: string[]
  /** Desktops, consoles: cooling system, index into COOLERS. */
  cooling?: number
  /** Desktops, TVs: speaker system, index into SPEAKERS. */
  speakers?: number
  /** Earbuds: driver, index into DRIVERS, and noise cancelling, index into ANC. */
  driver?: number
  anc?: number
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
  /** The type's special score: camera (phone, tablet), sensors (watch), keyboard and ports (laptop). Each type names its scores in TYPES[type].labels. */
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
  /** A fault serious enough for a recall: waiting for a decision, done, or ignored. */
  recall?: { state: 'open' | 'done' | 'ignored'; day: number; cost: number }
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
  /** Region id the company is based in. */
  home?: string
  /** Sales revenue for each of the last 12 months. */
  revYear?: number[]
  revMonth?: number
  /** What the company is worth, updated monthly, and its history. */
  value?: number
  valueHistory?: number[]
  /** Set when the player bought the company outright. */
  acquired?: boolean
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

/** A group of employees working under a lead. */
export interface Team {
  id: string
  name: string
  leadId?: string
  members: string[]
}

export interface StaffPolicy {
  hours: 'relaxed' | 'standard' | 'crunch'
  /** 0-3: none, basics, generous, lavish. */
  perks: number
}

// ---- buildable sites: offices, factories, stores

export type SiteKind = 'office' | 'factory' | 'store' | 'venue'

export interface SiteItem {
  id: string
  kind: string
  x: number
  y: number
  /** Quarter turns, 0-3. */
  rot: number
}

/**
 * A change to the wall on the north or west edge of a tile. Walls stand
 * wherever two rooms meet; this swaps one stretch for glass, a door or a gap.
 */
export interface SiteWall {
  id: string
  x: number
  y: number
  side: 'n' | 'w'
  kind: 'glass' | 'door' | 'open'
}

export type Corner = 'ne' | 'nw' | 'se' | 'sw'

/**
 * A smooth outline for part of a room: an ellipse, a ring or an arc of one.
 * The grid still says which tiles are the room; this says where, within the
 * tiles on its edge, the wall really runs. Lengths are in metres from the
 * plot's north-west corner.
 */
export interface Curve {
  /** Room number the outline belongs to. */
  room: number
  cx: number
  cy: number
  /** Outer radii east-west and north-south. */
  rx: number
  ry: number
  /** Rings: depth of the building from outer wall to inner wall. Missing for a solid disc. */
  t?: number
  /** Arcs: where the arc starts and how far it runs, in degrees. 0 is east, 90 south. Missing for a full turn. */
  from?: number
  sweep?: number
  /** Doors, glazing and openings in the curved wall, keyed by bay (see sim/curves.ts). */
  walls?: Record<string, 'glass' | 'door' | 'open'>
  /** Tiles, keyed "x,y", that gave up their curved edge because another room was built against them. */
  square?: Record<string, 1>
}

export interface Room {
  /** Number stored in the site grid for this room's tiles. */
  n: number
  type: string
  /** Index into the room type's styles. */
  style: number
}

export interface Site {
  kind: SiteKind
  tier: number
  w: number
  h: number
  /** Room number per tile, row by row; 0 is open ground. */
  grid: number[]
  rooms: Room[]
  nextRoom: number
  items: SiteItem[]
  walls: SiteWall[]
  /**
   * Room tiles cut in half along a diagonal, keyed "x,y", so walls can run at
   * 45 degrees. The value names the corner that is cut away.
   */
  cuts?: Record<string, Corner>
  /** Curved outlines of round, ring and arc rooms. Missing in older saves and on sites with none. */
  curves?: Curve[]
  /** Ground finish per open tile, keyed "x,y". Missing tiles are lawn. */
  floor: Record<string, string>
  /** Index into FACADES and ROOFS, and how many storeys the building has. */
  facade: number
  roof: number
  floors: number
  /** Bumped on every change, so the 3D view knows when to rebuild. */
  rev: number
}

export interface Store {
  id: string
  name: string
  location: string
  /** Region id the store trades in. */
  region: string
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
  /** Region id the campaign runs in; missing means every region the company sells in. */
  region?: string
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
  /** What happened on stage, for the replay. */
  beats?: { wow: number; reach: number; crew: number; luck: number; seats: number }
}

// ---- stock market

export interface Investor {
  name: string
  kind: string
  shares: number
  paid: number
  day: number
}

export interface StockState {
  listed: boolean
  /** Shares in issue, and how many the founder (the player) holds. */
  shares: number
  founder: number
  price: number
  /** Month-end share prices. */
  history: number[]
  investors: Investor[]
  /** Market mood toward the company, -1 to 1. */
  sentiment: number
  /** The board's confidence in the founder, 0-100. */
  confidence: number
  lowDays: number
  /** Share of monthly profit paid out as dividends, 0-0.5. */
  payout: number
  /** Day of the last funding round or share issue. */
  lastRaise: number
  /** Fraction of each rival the company owns. */
  holdings: Record<string, { stake: number; paid: number }>
  dividendsPaid: number
}

// ---- regions

export interface RegionState {
  open: boolean
  awareness: number
  since: number
  /** Local price as a multiple of the list price. */
  priceAdj: number
  /** Units sold here this month, and month by month. */
  monthUnits: number
  history: number[]
}

// ---- after-sales

export interface CareState {
  warrantyYears: number
  updateYears: number
  tradeIn: boolean
  refurb: boolean
  plan: boolean
  /** Monthly price of the care plan. */
  planPrice: number
  subscribers: number
  /** This month so far, and last month, for the screen. */
  month: { repairs: number; repairCost: number; updates: number; planIncome: number; tradeIns: number; refurbIncome: number }
  last: { repairs: number; repairCost: number; updates: number; planIncome: number; tradeIns: number; refurbIncome: number }
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
  /** Region id the company starts in. */
  home?: string
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
  /** Money in from investors and share sales, less buybacks, dividends and stakes bought. */
  funding: number
}
export const COST_KEYS = ['production', 'rd', 'marketing', 'development', 'overhead', 'salaries', 'facilities', 'interest'] as const
export type CostKey = (typeof COST_KEYS)[number]
export const monthCosts = (r: MonthReport) => COST_KEYS.reduce((a, k) => a + r[k], 0)

export interface NewsItem {
  id: number
  day: number
  kind: 'launch' | 'review' | 'research' | 'rival' | 'finance' | 'alert' | 'staff' | 'event' | 'goal'
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
  /** Why the game ended: out of money, or removed by the board. */
  overReason?: 'bankrupt' | 'ousted'
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
  venue: Site | null
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
  teams: Team[]
  policy: StaffPolicy
  stock: StockState
  regions: Record<string, RegionState>
  care: CareState
  /** Goal id to the day it was reached. */
  goals: Record<string, number>
  cur: MonthReport
  reports: MonthReport[]
  shareHistory: { month: number; units: Record<string, number> }[]
  monthShare: Record<string, number>
  news: NewsItem[]
}
