// Core data types for the simulation. Everything here is plain JSON so a
// GameState can be saved and loaded without any conversion.

export type Track = 'display' | 'chipset' | 'camera' | 'battery' | 'charging' | 'materials' | 'design'
export const TRACKS: Track[] = ['display', 'chipset', 'camera', 'battery', 'charging', 'materials', 'design']
export type Levels = Record<Track, number>

export type DeviceType = 'phone' | 'tablet' | 'watch' | 'laptop' | 'desktop' | 'console' | 'earbuds' | 'tv' | 'foldable' | 'headset' | 'speaker' | 'handheld' | 'ereader' | 'ring' | 'actioncam' | 'drone' | 'tower' | 'monitor' | 'mouse'
export const DEVICE_TYPES: DeviceType[] = ['phone', 'tablet', 'watch', 'laptop', 'desktop', 'console', 'earbuds', 'tv', 'foldable', 'headset', 'speaker', 'handheld', 'ereader', 'ring', 'actioncam', 'drone', 'tower', 'monitor', 'mouse']

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
  /** Watches: strap material and colour. Headsets: head strap style, an id from HEAD_STRAPS. */
  strap?: string
  strapColor?: string
  /** Desktops and TVs: stand style, an id from STANDS. */
  stand?: string
  /** Earbuds: the shape of the buds. */
  buds?: 'stem' | 'bean'
  /** Speakers: the shape of the body, and whether a touch screen is set into its front. */
  form?: 'column' | 'orb' | 'block'
  screen?: boolean
  /** Foldables: how it folds. A book opens sideways about its long axis; a flip is a tall phone that folds in half about its short one. Missing means a book. */
  fold?: 'book' | 'flip'
  /** Flips: size of the cover screen on the outside of the upper half, an index into FLIP_COVERS. */
  cover?: number
  /** PC towers: the case, its panels, fans and feet. */
  pc?: PcCase
  /** PC towers and mice: the RGB lighting. */
  rgb?: RgbLight
  /** Mice: a sculpted right-handed shape, or one that suits either hand. */
  grip?: 'ergo' | 'ambi'
  /** A camouflage pattern over the shell. Missing means a plain finish. */
  camo?: 'woodland' | 'desert' | 'urban' | 'arctic'
}

/** RGB lighting: which zones light up, in what colours, and how they move. */
export interface RgbLight {
  /** Ids from RGB_ZONES for the type. */
  zones: string[]
  color: string
  /** The second colour of the moving effects. */
  color2: string
  effect: 'off' | 'static' | 'breathe' | 'cycle' | 'wave'
}

/** A PC tower's case. Its form factor follows from its size (see towerForm). */
export interface PcCase {
  /** The side panel over the parts: on the right as one faces the front. */
  side: 'solid' | 'glass' | 'mesh'
  front: 'solid' | 'mesh' | 'glass' | 'slats' | 'vents'
  /** Intake fans in the front, and their size in mm. */
  fans: number
  fanSize: 120 | 140
  feet: 'pads' | 'tall' | 'stand' | 'casters'
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
  /** The input device, index into inputOptions(type): keyboard (laptops, desktops), gamepad (consoles), hand controllers (headsets), built-in controls (handhelds). */
  keyboard?: number
  /** Ports, sensors or features fitted. The list depends on the device type (see ioOptions). */
  io?: string[]
  /** Desktops, consoles: cooling system, index into COOLERS. */
  cooling?: number
  /** Desktops, TVs: speaker system, index into SPEAKERS. */
  speakers?: number
  /** Earbuds: driver, index into DRIVERS, and noise cancelling, index into ANC. Speakers: driver set, index into SPEAKER_DRIVERS. */
  driver?: number
  anc?: number
  /** Foldables: hinge, index into HINGES. */
  hinge?: number
  /** Headsets: lenses, index into OPTICS. */
  optics?: number
  /** Speakers: microphone array, index into MIC_ARRAYS. */
  mics?: number
  /** PC towers: the power supply, index into PSUS. */
  psu?: number
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
  /** How far making things has cheapened since the game began: every cost above has been multiplied by it (see costMaturity). */
  costScale: number
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
  /** Units in the warehouse. A rival's is always 0: rivals never run out (see `unlimited`), and nothing should read a number into it. Ask hasStock. */
  stock: number
  /** Set on rivals' devices: there is always one to buy. */
  unlimited?: boolean
  /** The day the feed was told this device had sold out. Cleared once a day ends with some in stock, so one shortage is one alert. */
  soldOut?: number
  carry: number
  unitsSold: number
  revenue: number
  /** One-off launch marketing budget. */
  marketing: number
  /** Extra hype from a launch event, 0-1. */
  hype: number
  /** Review points the keynote's hands-on area adds (or takes) once the reviews come in. */
  pressNudge?: number
  /** Campaign-driven interest per segment, 0-1. */
  buzz: Record<string, number>
  /** Share of units that turn out faulty. */
  defectRate: number
  /** How happy owners are, 0-1. */
  satisfaction: number
  feedback: Feedback[]
  /** Rivals: the day this was last marked down in answer to the player. */
  lastCut?: number
  /** A fault serious enough for a recall: waiting for a decision, done, or ignored. */
  recall?: { state: 'open' | 'done' | 'ignored'; day: number; cost: number }
  monthUnits: number
  history: number[]
  segUnits: Record<string, number>
  /** Player's devices: ordering more by itself (needs a Head of Operations, see sim/reorder.ts). Missing means off. */
  reorder?: ReorderRule
}

/** One thing a client asks of the design (see sim/contractReqs.ts). */
export interface ContractReq {
  kind: 'wood' | 'calm' | 'camo' | 'matte' | 'maxLong' | 'maxVolume' | 'quiet' | 'flight' | 'battery' | 'secure' | 'rgb'
  value?: number
}

/** A business asking for a batch of devices (see sim/contracts.ts). */
export interface ContractJob {
  id: string
  client: string
  type: DeviceType
  units: number
  /** Paid for each unit, all at once when the last is delivered. */
  perUnit: number
  /** The least review average the device must have. */
  minReview: number
  /** Days from accepting to the delivery date. */
  days: number
  offered: number
  /** An offer not answered by this day lapses. */
  expires: number
  /** Set on accepting: the device that fills it and the day it is due. */
  productId?: string
  due?: number
  delivered: number
  state: 'offer' | 'active' | 'done' | 'failed'
  /** Sector of the client, its tier (0-3), what it asks of the design, and days of grace after the date in which pay falls away. */
  sector?: string
  tier?: number
  reqs?: ContractReq[]
  grace?: number
}

/** When a device orders another production run by itself, and how much. */
export interface ReorderRule {
  on: boolean
  /** Order when units in stock and on order fall to this. */
  at: number
  /** 'fixed': order `qty` units. 'cover': order enough for `qty` days at the recent pace. */
  rule: 'fixed' | 'cover'
  qty: number
}

/** A dollar amount as text. Written out the same way on every machine, so that the news of a saved game reads the same wherever it is loaded. */
export const dollars = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`
/** A count as text, with thousands separators, the same on every machine. */
export const thousands = (v: number) => Math.round(v).toLocaleString('en-US')
/** A large dollar amount in millions or billions: $3.2M, $1.4B. */
export const millions = (v: number) => (Math.abs(v) >= 999.5e6 ? `${v < 0 ? '-' : ''}$${(Math.abs(v) / 1e9).toFixed(Math.abs(v) >= 9.95e9 ? 0 : 1)}B` : `${v < 0 ? '-' : ''}$${(Math.abs(v) / 1e6).toFixed(Math.abs(v) >= 9.95e6 ? 0 : 1)}M`)

/** True when there is one of these to sell: some in the warehouse, or a rival's device, which never runs out. */
export const hasStock = (p: Pick<Product, 'stock' | 'unlimited'>) => !!p.unlimited || p.stock > 0
/** Units in stock as a number to show, or null for a rival's device, which has no such number. */
export const stockOf = (p: Pick<Product, 'stock' | 'unlimited'>): number | null => (p.unlimited ? null : p.stock)

/** A device that has been on sale at some time (and may since have been discontinued), as opposed to one still in development or shelved before it shipped. */
export const wasReleased = (p: Pick<Product, 'status' | 'reviews'>) => p.status === 'sale' || (p.status === 'ended' && p.reviews.length > 0)

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
  /** The name a rival was founded under. Where it is based and how far it reaches follow from this, so renaming it moves nothing. */
  origin?: string
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
/** Seats at the top of the company. Whoever holds one is an ordinary employee with `exec` set. */
export type ExecId = 'cfo' | 'coo' | 'cmo' | 'cto' | 'people' | 'sales' | 'care'
export const EXEC_IDS: ExecId[] = ['cfo', 'cmo', 'people', 'coo', 'sales', 'care', 'cto']

export interface Employee {
  id: string
  name: string
  role: Role
  /** Set for an executive: the seat they hold. Their `role` is then only the kind of desk they keep. */
  exec?: ExecId
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
  /** Factory machines and docks: 1-3, upgraded in place. Missing is 1. */
  tier?: number
  /** Factory machines: up to two modules, 'speed', 'quality' or 'eff'. */
  mods?: string[]
}

/** A second (third...) factory, in a region of its own, with a layout of its own. */
export interface Plant {
  id: string
  name: string
  region: string
  site: Site
}

/** A saved stretch of factory floor, placed again in one go on any factory. */
export interface Blueprint {
  id: string
  name: string
  w: number
  h: number
  items: { kind: string; x: number; y: number; rot: number; tier?: number; mods?: string[] }[]
}

/**
 * A change to the wall on the north or west edge of a tile. Walls stand
 * wherever two rooms meet; this swaps one stretch for glass, a door or a gap.
 * With `part` set it is a partition instead: a wall, glass or a door put up
 * on an edge inside one room, where no wall would otherwise stand.
 */
export interface SiteWall {
  id: string
  x: number
  y: number
  side: 'n' | 'w'
  kind: 'glass' | 'door' | 'open' | 'wall'
  /** A partition inside one room. Missing in older saves and on walls between rooms. */
  part?: true
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
  /**
   * Offices: the storeys above the ground floor, first floor first, one for
   * each floor over the first. Each is a plan of its own (its `floors` is 1),
   * laid over the ground floor's footprint. Missing for a single storey.
   */
  upper?: Site[]
  /** On a storey above the ground floor: which one, 1 for the first floor. */
  level?: number
  /** Factories: shifts a day, 1-3. Missing is 1. */
  shifts?: number
  /** Factories: which device each line builds, by the id of its first receiving dock. A line not listed builds whatever is on order. */
  assign?: Record<string, string>
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
  /** Keynotes: more devices still in development, unveiled after the headline one. */
  extraIds?: string[]
  /** Keynotes: the next version of the company's own operating system gets a segment too. */
  withOs?: boolean
  /** Keynotes: what the whole night came to, for the close of the replay. */
  stats?: KeynoteStats
}

/** One device's showing at a keynote. */
export interface KeynoteLine {
  id: string
  wow: number
  /** What the hands-on area made of it, 0-100; it nudges the reviews. */
  press: number
  preorders: number
  hype: number
}

export interface KeynoteStats {
  viewers: number
  /** The press's score for the night as a whole, 0-100. */
  press: number
  lines: KeynoteLine[]
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
  /** False while the company's devices run a licensed (or the free) operating system. */
  own: boolean
  /** The licensed system devices run while `own` is false: an id from OS_LICENCES. Missing in saves from before licences, which ran Androyd. */
  licence?: string
  name: string
  version: number
  quality: number
  features: string[]
  /** Next version in development, with the release name it will ship under. */
  project?: { daysLeft: number; total: number; features: string[]; first: boolean; release?: string }
  /** Every version shipped, oldest first. Missing in saves from before release names. */
  releases?: OsRelease[]
  servicesIncome: number
  /** How the company's own operating system looks on its devices' screens. Missing means the default look. */
  look?: OsLook
}

/** One shipped version of the company's own operating system. */
export interface OsRelease {
  version: number
  /** Its release name, e.g. "Cedar". */
  name: string
  day: number
  /** Features new in this version. */
  added: string[]
  quality: number
}

/**
 * The look of an operating system, as painted on device screens (see src/3d/osLook.ts). Everything after `dark`
 * was added later and is optional in saves: cleanLook fills in what is missing.
 */
export interface OsLook {
  /** Wallpaper colour, a CSS hex colour. */
  wallpaper: string
  /** Accent colour for highlights and the clock, a CSS hex colour. */
  accent: string
  iconShape: 'circle' | 'squircle' | 'square' | 'hexagon' | 'leaf'
  layout: 'grid' | 'list' | 'tiles'
  font: 'sans' | 'mono' | 'serif' | 'rounded' | 'condensed'
  dark: boolean
  /** Second wallpaper colour, for the gradients and patterns. */
  wallpaper2?: string
  /** How the wallpaper is drawn: one colour, a gradient preset, or a generated pattern. */
  wallStyle?: 'solid' | 'linear' | 'radial' | 'aurora' | 'waves' | 'grid' | 'dots' | 'rings' | 'facets'
  /** The colour of panels, the dock and widgets. */
  surface?: string
  iconSize?: 'small' | 'medium' | 'large'
  iconStyle?: 'filled' | 'outline' | 'glyph' | 'duotone'
  /** Where the dock or taskbar sits. */
  dock?: 'bottom' | 'top' | 'left' | 'right' | 'none'
  /** Widgets on the home screen, ids from OS_WIDGETS. */
  widgets?: string[]
  weight?: 'light' | 'regular' | 'bold'
  /** The lock screen: how the clock is drawn. */
  lock?: 'big' | 'stacked' | 'analog' | 'minimal'
  /** Whether notifications show on the lock screen. */
  lockNotes?: boolean
  /** How fast animations run. */
  motion?: 'off' | 'calm' | 'normal' | 'brisk'
  /** How round panels, the dock and widgets are. */
  corners?: 'sharp' | 'soft' | 'round'
  /** A watch's face: a digital time, hands, activity rings or a grid of complications. */
  watchFace?: 'digital' | 'analog' | 'rings' | 'modular'
  /** A television's or console's home row: wide programme cards, tall posters or round app icons. */
  tvRow?: 'wide' | 'posters' | 'icons'
  /** A computer's taskbar: edge to edge, a floating bar clear of the edge, or the apps centred on it. */
  taskbar?: 'full' | 'floating' | 'centred'
  /**
   * The look on one kind of screen where it differs from the system's own: the shared look is used everywhere,
   * and whatever is set here for a kind (a watch's face, a TV's row, a laptop's taskbar, or any colour or choice)
   * replaces it on that kind only.
   */
  kinds?: Partial<Record<OsScreenKind, Partial<Omit<OsLook, 'kinds'>>>>
}

/** The kinds of screen an operating system draws differently (see src/3d/osLook.ts). */
export type OsScreenKind = 'phone' | 'tablet' | 'desktop' | 'watch' | 'tv' | 'console' | 'handheld' | 'ereader' | 'display'

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
  /** The kind of device the company begins with; 'all' starts with every kind open. */
  startType?: DeviceType | 'all'
  /** Use the old parody names for rivals instead of invented ones. */
  parody?: boolean
  /**
   * How the company's capabilities open up: 'guided' starts as a garage and
   * earns each one (see sim/progress.ts); 'open' has everything from the first
   * day. Missing means open, which is what saves from before this option are.
   */
  progression?: 'guided' | 'open'
  /** Calendar year the game starts in (see data/eras.ts). Missing means today, which is when every save from before eras began. */
  startYear?: number
}

/** Something that has happened to the company and may need a decision. */
export interface Incident {
  id: string
  kind: string
  day: number
  done: boolean
  result?: string
  productId?: string
  staffId?: string
  rivalId?: string
  amount?: number
  note?: string
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
  kind: 'launch' | 'review' | 'research' | 'rival' | 'finance' | 'alert' | 'staff' | 'event' | 'goal' | 'unlock'
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
  /** Executives who would take a seat if asked. */
  execPool: Employee[]
  /** Each executive seat that has ever been filled: when, and since when it has stood empty. */
  execSeats: Partial<Record<ExecId, { since: number; vacant?: number }>>
  /** Capability id (see sim/progress.ts) to the day it opened. Only filled in guided games. */
  unlocks: Record<string, number>
  office: Site
  factory: Site | null
  /** Factories beyond the first, each in a region. Missing in older saves. */
  plants?: Plant[]
  /** Saved factory layouts. */
  blueprints?: Blueprint[]
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
  /** Kinds of device the company may build. Missing means all of them. */
  types?: DeviceType[]
  incidents: Incident[]
  /** A boom or a downturn: a multiplier on every market until the day given. */
  economy?: { mult: number; until: number }
  /** Step of the guided start the player has reached; -1 once finished or switched off. */
  guide: number
  cur: MonthReport
  reports: MonthReport[]
  shareHistory: { month: number; units: Record<string, number> }[]
  monthShare: Record<string, number>
  news: NewsItem[]
  /** Contract work offered, under way and lately finished. Missing in older saves. */
  contracts?: ContractJob[]
  /** Standing with each sector's clients, 0-1. Missing in older saves. */
  sectorRep?: Record<string, number>
  /** Troubles the feed has already been told about, by name, with the day: each is announced once and not again until it has passed. */
  told?: Record<string, number>
}
