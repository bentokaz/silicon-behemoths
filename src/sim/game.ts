// Game state, the daily tick, and every action the player can take.
// All functions mutate the GameState passed in and use only its seeded RNG.
import { DAYS_PER_MONTH, DAYS_PER_YEAR, MAX_LEVEL, START_YEAR, SUPPLY_LABELS, TRACK_INFO, TRUNK_REQS, featureCost, featureInfo, featuresAtLevels, marketLevel, researchCost } from '../data/catalog'
import { RIVALS, type RivalSeed, SEGMENTS, TIERS, TYPES, segmentInfo, segmentsOf } from '../data/devices'
import { BUZZ_DECAY, CHANNELS, EVENTS, EVENT_LEAD, FAN_CYCLE, OWN_VENUE, campaignDay, hasStage, dailyTickets, eventBlocked, nextFair, productSatisfaction, resolveEvent } from './growth'
import { INCIDENTS } from './world'
import { RECALL_DEADLINE, TRADE_CREDIT, TRADE_PULL, REFURB_RETURN, UPDATE_YEARS, WARRANTY_YEARS, canRefurb, careBonus, careSatisfaction, checkRecalls, closeCareMonth, newCare, recallCost, stepCare, warrantyLoad } from './care'
import { type Goal, checkGoals } from './goals'
import { OUTSIDE_OPTION, bestSegment, launchHype, lifecycle, makeFeedback, makeReviews, priceFactor, pull, segmentDemand, tierAverages, utility } from './market'
import { DEFAULT_HOME, REGIONS, addAwareness, entryBlocked, homeRegion, newRegion, newRegions, regionIncome, regionInfo, regionOverheads, regionTaste, rivalReach, worldAwareness } from './regions'
import { buyBack, buyStake, goPublic, holdingIncome, issueShares, monthlyStock, moveSentiment, newStock, raiseRound, sellStake, stakeIn, stakePrice, stepStock, takeoverPrice, valuation } from './stock'
import { CONTRACT, LOCK_DAYS, LOCK_FEE, buildCost, costNow, factoryLine, marketPrice, newSupply, stepProduction, stepSupply } from './ops'
import { type VariantId, generateDesign, layoutParts } from './rivals'
import { INCIDENT_WAIT, PEAK_DAY, STARTUPS, economyNow, typeDemand, hasType, makeOriginal, originalName, priceIndex, rivalStrategy, rollIncident, settleIncident, unlockBlocked, unlockCost } from './world'
import { clamp, int, pick, rand, range } from './rng'
import { clampPart, coverScreen, isCoverCam, isFlip } from './geometry'
import { evaluate, selfieMinDia } from './scoring'
import { designProblem } from './validate'
import { bayStands, curveAt, curveTiles, onCurve } from './curves'
import { fixLayout, lineStats } from './factoryline'
import { FACADES, FLOOR_COST, ITEMS, MAX_FLOORS, ROOFS, ROOMS, SITE_TIERS, VENUE_PRESETS, type VenuePreset, rigFloors, venueLayout, type Shape, type ShapeOpts, SHORT_WALL, UNKNOWN_ITEM, areaOf, areaTiles, autoDoor, builtTiles, canPlace, courtyardFor, curveFor, defaultGround, doorFits, fillError, gridAt, groundsFor, hasGround, inPlot, isBoundary, itemAllowed, itemAt, itemTiles, mergeRooms, newSite, openRooms, pocketAt, roomOf, rowSpots, shapeCuts, starterLine, storeStats, tidy, tierOf, touching, upkeep, venueStats, wallAt, zone } from './sites'
import { capOfChannel, locked, refreshExecs, siteLocked, stepProgress } from './progress'
import { EXECS, HEADHUNT_COST, HOURS, TEAM_SPAN, dropFromTeams, execFx, inTraining, monthlySalaries, monthlyStaff, newPolicy, perksCost, refreshCandidates, staffEffects, stepStaff, trainingCost } from './staff'
import { CHIP_BUDGET, OS_FEATURES, chipAdoption, chipBlocked, chipProjectCost, chipProjectDays, finishChip, newOs, osBlocked, osProjectCost, osProjectDays, osShipQuality, servicesPerMonth, softwareBonus } from './tech'
import { stockOf, type ChannelId, type Company, type Corner, type CostKey, type DeviceDesign, type DeviceType, type Difficulty, type EventType, type GameConfig, type GameState, type Levels, type MonthReport, type NewsItem, type Product, type ProductionOrder, type SegmentId, type Site, type SiteKind, type StaffPolicy, type StorageTier, SUPPLY_CATS, type SupplyCat, TRACKS, type Track, dollars, hasStock, millions, monthCosts, thousands, wasReleased } from './types'

export const SAVE_VERSION = 7
export const RETAIL_CUT = 0.15

// ---------------------------------------------------------------- what an action will take
// Every action checks what it is handed before it touches the game: a number
// that is not a number, an id that names nothing, a name from an object's own
// plumbing ("constructor") must be refused in words, never written to the state.

/** A real, finite number. */
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
/** A whole number. */
const whole = (v: unknown): v is number => Number.isInteger(v)
/** True when a table really lists a key, as opposed to inheriting something of that name. */
const lists = (table: object, key: unknown): boolean => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key)
/** The longest name a device, a team, a chip or an operating system can have. */
export const MAX_NAME = 40
/** No device sells for more than this, however the years inflate prices. */
export const MAX_PRICE = 10e6
/** The most units one production order can ask for. */
export const MAX_ORDER = 100e6
export { dollars, hasStock, stockOf }
/** True for the id of one of the world's regions. */
const isRegion = (id: unknown): id is string => typeof id === 'string' && REGIONS.some((r) => r.id === id)
/** Games licence income a console maker books for each console sold. */
export const GAME_ROYALTY = 55
/** The same for a handheld, which sells fewer games, and the services income of a smart speaker. */
export const HANDHELD_ROYALTY = 30
export const SPEAKER_SERVICES = 9

export const DIFFICULTY: Record<Difficulty, { label: string; blurb: string; startCash: number; rivalOffset: number; awareness: number; overhead: number; debtDays: number; overdraft: number }> = {
  relaxed: { label: 'Relaxed', blurb: 'Forgiving market, slow rivals, generous credit.', startCash: 15e6, rivalOffset: -0.5, awareness: 1.6, overhead: 0.6, debtDays: 720, overdraft: 5e6 },
  normal: { label: 'Normal', blurb: 'Balanced rivals and a fair market.', startCash: 6e6, rivalOffset: 0, awareness: 1, overhead: 1, debtDays: 360, overdraft: 2e6 },
  tough: { label: 'Tough', blurb: 'Aggressive rivals, thin credit, slow brand growth.', startCash: 3e6, rivalOffset: 0.4, awareness: 0.65, overhead: 1.5, debtDays: 180, overdraft: 0.5e6 },
}

/**
 * A plain company with nothing locked. The new game screen adds
 * `progression: 'guided'` on top of this; without it a game is open.
 */
export const defaultConfig = (): GameConfig => ({
  companyName: 'Behemoth Labs',
  color: '#ff6b1a',
  difficulty: 'normal',
  startCash: DIFFICULTY.normal.startCash,
  researchSpeed: 1,
  rivalStrength: 1,
  techLevel: 3,
  unlimitedMoney: false,
  seed: 1,
})

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function dateOf(day: number) {
  return { year: START_YEAR + Math.floor(day / DAYS_PER_YEAR), month: Math.floor(day / DAYS_PER_MONTH) % 12, dom: (((day % DAYS_PER_MONTH) + DAYS_PER_MONTH) % DAYS_PER_MONTH) + 1 }
}
export function fmtDate(day: number): string {
  const d = dateOf(day)
  return `${String(d.dom).padStart(2, '0')} ${MONTHS[(d.month + 12) % 12]} ${d.year}`
}
export const monthLabel = (monthIndex: number) => `${MONTHS[((monthIndex % 12) + 12) % 12]} ${String(START_YEAR + Math.floor(monthIndex / 12)).slice(2)}`

export const player = (s: GameState) => s.companies[0]
export const companyOf = (s: GameState, id: string) => s.companies.find((c) => c.id === id)!
const ownProducts = (s: GameState) => s.products.filter((p) => p.companyId === 'player')

function news(s: GameState, kind: NewsItem['kind'], text: string, productId?: string) {
  s.news.unshift({ id: s.nextId++, day: s.day, kind, text, productId })
  // with twelve device types the rivals launch often: the log is long enough to keep most of a year of it
  if (s.news.length > 140) s.news.length = 140
}

const emptyReport = (month: number): MonthReport => ({ month, revenue: 0, other: 0, production: 0, rd: 0, marketing: 0, development: 0, overhead: 0, salaries: 0, facilities: 0, interest: 0, units: 0, cash: 0, funding: 0 })

export function rivalLevels(s: GameState, c: Company): Levels {
  const base = marketLevel(s.day) + c.techOffset + (s.config.rivalStrength - 1) * 1.5 + DIFFICULTY[s.config.difficulty].rivalOffset
  const lv = {} as Levels
  for (const t of TRACKS) lv[t] = clamp(Math.round(base), 0, MAX_LEVEL)
  return lv
}

function makeCompany(id: string, seed: RivalSeed): Company {
  return { id, isPlayer: false, alive: true, nextLaunch: {}, unitsYear: [], weakMonths: 0, revenueTotal: 0, unitsTotal: 0, ...seed, series: { ...seed.series }, palette: [...seed.palette], segments: [...seed.segments] }
}

function roundPrice(v: number): number {
  // cheap devices (earbuds, fitness bands) round up in small steps, or the rounding eats the whole margin
  if (v < 100) return Math.ceil(v / 5) * 5 - 1
  return v < 300 ? Math.round(v / 10) * 10 - 1 : Math.round(v / 50) * 50 - 1
}

interface NewProduct {
  name: string
  family: string
  variant: string
  design: DeviceDesign
  price: number
  tiers?: StorageTier[]
  segment?: SegmentId
}

function createProduct(s: GameState, c: Company, n: NewProduct, levels: Levels, own: boolean): { product: Product; issues: string[] } {
  const ev = own ? evaluate(n.design, levels, marketLevel(s.day), s.features, s.chips) : evaluate(n.design, levels, marketLevel(s.day))
  const product: Product = {
    id: `p${s.nextId++}`,
    companyId: c.id,
    type: n.design.type,
    name: n.name,
    family: n.family,
    variant: n.variant,
    design: n.design,
    segment: n.segment,
    price: n.price,
    tiers: n.tiers ?? [],
    unitCost: ev.unitCost,
    costParts: ev.costParts,
    status: 'dev',
    devDaysLeft: 0,
    launchDay: s.day,
    raw: ev.raw,
    featureBonus: ev.featureBonus,
    designPct: ev.report.pct,
    weight: ev.report.weight,
    lifeHours: ev.report.lifeHours,
    diag: ev.report.diag,
    reviews: [],
    reviewAvg: 0,
    stock: 0,
    carry: 0,
    unitsSold: 0,
    revenue: 0,
    marketing: 0,
    hype: 0,
    buzz: {},
    defectRate: own ? 0 : 0.02,
    satisfaction: 0.7,
    feedback: [],
    monthUnits: 0,
    history: [],
    segUnits: {},
  }
  s.products.push(product)
  return { product, issues: ev.report.issues.filter((i) => i.level === 'warn').map((i) => i.text) }
}

function release(s: GameState, p: Product, c: Company, issues: string[]) {
  p.status = 'sale'
  p.launchDay = s.day
  p.reviews = makeReviews(s, p, c, s.day, issues)
  p.reviewAvg = p.reviews.reduce((a, r) => a + r.score, 0) / p.reviews.length
  if (!p.segment) p.segment = bestSegment(p, c, s.day).seg.id
  p.satisfaction = productSatisfaction(p, c.software, 0, 0, false)
  const w = c.isPlayer ? 0.3 : 0.15
  c.brand = clamp(c.brand * (1 - w) + (p.reviewAvg / 10) * w, 0.05, 1)
  if (c.isPlayer && s.stock) moveSentiment(s, (p.reviewAvg - 7) * 0.08)
}

function rivalLaunch(s: GameState, c: Company, segment: SegmentId, backdate = 0) {
  const seg = segmentInfo(segment)
  const realDay = s.day
  s.day = realDay - backdate
  const levels = rivalLevels(s, c)
  const design = generateDesign(s, { segment, levels, mLevel: marketLevel(s.day), layout: c.layout + (rand(s) < 0.2 ? int(s, 1, 4) : 0), palette: c.palette, logo: c.name.slice(0, 9).toUpperCase() })
  const family = c.series[segment] ?? seg.name
  const name = `${family} ${c.counter}`
  const { product, issues } = createProduct(s, c, { name, family, variant: '', design, price: 0, segment }, levels, false)
  const costBased = (product.unitCost / (1 - RETAIL_CUT)) * (1 + TIERS[segment].margin) * c.priceMult
  const refBased = seg.priceRef * priceIndex(s.day) * c.priceMult * 0.95
  product.price = roundPrice(Math.max((product.unitCost * 1.12) / (1 - RETAIL_CUT), 0.5 * costBased + 0.5 * refBased))
  // rivals never run out: said with a flag, not with a huge number that a screen might one day print
  product.unlimited = true
  release(s, product, c, issues)
  s.day = realDay
  // keep at most two generations on sale per segment; discount the older one
  const line = s.products.filter((p) => p.companyId === c.id && p.segment === segment && p.status === 'sale').sort((a, b) => b.launchDay - a.launchDay)
  line.forEach((p, i) => {
    if (i === 1) p.price = roundPrice(p.price * 0.82)
    if (i >= 2) endProduct(s, p)
  })
  c.nextLaunch[segment] = realDay + int(s, 300, 440)
  if (backdate === 0) news(s, 'rival', `${c.name} launched ${name} at $${product.price} (reviews ${product.reviewAvg.toFixed(1)})`, product.id)
}

function endProduct(s: GameState, p: Product) {
  p.status = 'ended'
  p.endDay = s.day
}

/** How well the home market knows a brand-new company. */
const START_AWARENESS = 0.045

/** The first home: a one-room garage with two desks. */
function starterOffice(): Site {
  const site = newSite('office', 0)
  const { room } = zone(site, 'work', areaTiles(3, 2, 10, 6), undefined, 1)
  if (room) autoDoor(site, room.n)
  site.items = [
    { id: 'o1', kind: 'desk', x: 4, y: 3, rot: 0 },
    { id: 'o2', kind: 'desk', x: 6, y: 3, rot: 0 },
    { id: 'o3', kind: 'plant', x: 3, y: 2, rot: 0 },
    { id: 'o4', kind: 'whiteboard', x: 9, y: 2, rot: 0 },
    { id: 'o5', kind: 'otree', x: 1, y: 1, rot: 0 },
    { id: 'o6', kind: 'otree', x: 12, y: 0, rot: 0 },
    { id: 'o7', kind: 'hedge', x: 0, y: 9, rot: 0 },
    { id: 'o8', kind: 'hedge', x: 1, y: 9, rot: 0 },
  ]
  for (let y = 7; y < 10; y++) for (let x = 5; x <= 7; x++) site.floor[`${x},${y}`] = 'asphalt'
  return site
}

export function newGame(cfg: GameConfig): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    config: { ...cfg },
    rng: cfg.seed | 0,
    day: 0,
    nextId: 1,
    cash: cfg.startCash,
    debtDays: 0,
    gameOver: false,
    companies: [],
    products: [],
    levels: {} as Levels,
    features: [],
    progress: {},
    activeResearch: [],
    rdBudget: 0,
    staff: [],
    candidates: [],
    execPool: [],
    execSeats: {},
    unlocks: {},
    office: starterOffice(),
    factory: null,
    venue: null,
    orders: [],
    supply: newSupply(),
    stores: [],
    campaigns: [],
    events: [],
    chips: [],
    os: newOs(),
    owners: 0,
    fans: 0,
    teams: [],
    policy: newPolicy(),
    stock: newStock(cfg.startCash),
    regions: newRegions(cfg.home ?? DEFAULT_HOME, START_AWARENESS),
    care: newCare(),
    goals: {},
    types: cfg.startType && cfg.startType !== 'all' ? [cfg.startType] : undefined,
    incidents: [],
    guide: 0,
    cur: emptyReport(0),
    reports: [],
    shareHistory: [],
    monthShare: {},
    news: [],
  }
  for (const t of TRACKS) s.levels[t] = clamp(Math.round(cfg.techLevel), 0, MAX_LEVEL)
  s.features = featuresAtLevels(s.levels)
  s.companies.push({
    ...makeCompany('player', { name: cfg.companyName, color: cfg.color, brand: 0.38, awareness: 0, techOffset: 0, priceMult: 1, software: 0, segments: [], layout: 0, palette: [], series: {}, counter: 1 }),
    isPlayer: true,
    logo: cfg.logo,
  })
  RIVALS.forEach((seed, i) => {
    const c = makeCompany(`r${i}`, seed)
    if (!cfg.parody) makeOriginal(c)
    c.origin = c.name
    s.companies.push(c)
    for (const seg of c.segments) {
      rivalLaunch(s, c, seg, int(s, 20, 330))
      c.nextLaunch[seg] = int(s, 30, 330)
    }
    c.counter++
  })
  player(s).home = cfg.home ?? DEFAULT_HOME
  player(s).awareness = worldAwareness(s)
  refreshCandidates(s)
  stepProgress(s)
  news(s, 'finance', `${cfg.companyName} is founded with ${cfg.unlimitedMoney ? 'unlimited funds' : millions(cfg.startCash)}.`)
  return s
}

// ---------------------------------------------------------------- money

export function canAfford(s: GameState, amount: number): boolean {
  return s.config.unlimitedMoney || s.cash - amount >= -DIFFICULTY[s.config.difficulty].overdraft
}

function spend(s: GameState, amount: number, bucket: CostKey) {
  s.cash -= amount
  s.cur[bucket] += amount
}

function earn(s: GameState, amount: number, bucket: 'revenue' | 'other' = 'revenue') {
  s.cash += amount
  s.cur[bucket] += amount
}

/** Money from (or to, if negative) shareholders and investments. Not part of profit. */
function fund(s: GameState, amount: number) {
  s.cash += amount
  s.cur.funding += amount
}

// ---------------------------------------------------------------- devices

/**
 * Development cost and time. Pass the game to include the engineering team's
 * speed-up; a variant of an existing device reuses most of the work.
 */
export function devPlan(design: DeviceDesign, s?: GameState, isVariant = false): { cost: number; days: number } {
  const sp = design.specs
  const cams = design.parts.filter((p) => p.kind === 'camera')
  const camLevel = cams.reduce((m, p) => Math.max(m, p.sensor ?? 0), 0)
  const avg = (sp.panel + sp.chipGen + camLevel + sp.charging) / 4
  const T = TYPES[design.type]
  const cost = 150e3 * Math.pow(1.35, avg) * T.devCost * (isVariant ? 0.55 : 1)
  const days = (45 + 5 * avg) * (s ? staffEffects(s).devTime : 1) * (isVariant ? 0.6 : 1)
  return { cost: Math.round(cost / 1e3) * 1e3, days: Math.max(10, Math.round(days)) }
}

export interface LaunchOrder {
  design: DeviceDesign
  family: string
  variant: string
  price: number
  tiers: StorageTier[]
  quantity: number
  mode: ProductionOrder['mode']
  marketing: number
  /** Venue index for a launch keynote, or undefined for none. */
  keynote?: number
}

export const productName = (family: string, variant: string) => `${family.trim()}${variant ? ' ' + variant : ''}`
/** True if a new device in this family would share an existing platform. */
export const isVariantOf = (s: GameState, family: string, type: DeviceType) => ownProducts(s).some((p) => p.family === family.trim() && p.type === type && p.status !== 'ended')

/** Start developing a device. Returns an error message, or null on success. */
export function startProduct(s: GameState, o: LaunchOrder): string | null {
  const problem = designProblem(o?.design)
  if (problem) return `That is not a device design the game can build: ${problem}. Start again from a fresh design.`
  const type = o.design.type
  if (!hasType(s, type)) return `Your company does not make ${TYPES[type].plural.toLowerCase()} yet. Open that line under Research.`
  const ev = evaluate(o.design, s.levels, marketLevel(s.day), s.features, s.chips)
  const blocking = ev.report.issues.find((i) => i.level === 'error')
  if (blocking) return blocking.text
  // a design whose figures do not come out as numbers cannot be costed, built or sold
  if (!(ev.unitCost > 0) || !num(ev.unitCost) || !Object.values(ev.raw).every(num) || !num(ev.featureBonus) || !num(ev.report.pct)) return 'This design cannot be built: one of its measurements or parts is not a valid choice. Start again from a fresh design.'
  const family = typeof o.family === 'string' ? o.family.trim() : ''
  const variant = typeof o.variant === 'string' ? o.variant.trim() : ''
  if (!family) return 'The device needs a name'
  if (family.length > MAX_NAME || variant.length > MAX_NAME) return `Keep the name to ${MAX_NAME} characters or fewer`
  if (!num(o.price) || o.price < 1) return 'Set a price of at least $1'
  if (o.price > MAX_PRICE) return `Nobody pays more than ${dollars(MAX_PRICE)} for a device. Set a lower price.`
  const price = Math.round(o.price)
  const name = productName(family, variant)
  if (ownProducts(s).some((p) => p.name === name && p.status !== 'ended')) return `You already have a device called ${name}. Give this one another name, or discontinue the old one first.`
  if (!Array.isArray(o.tiers) || o.tiers.length > 3) return 'A device can have at most three storage options'
  const tiers = o.tiers.map((t) => ({ storage: t?.storage, price: Math.round(t?.price) }))
  if (tiers.some((t) => !num(t.price) || !num(t.storage) || t.price <= price || t.price > MAX_PRICE || t.storage <= o.design.specs.storage)) return 'Each storage option must hold more and cost more than the base model'
  if (o.mode !== 'contract' && o.mode !== 'factory') return 'Choose who builds it: a contract manufacturer or your own factory'
  if (!num(o.quantity) || o.quantity < 0) return 'Enter how many to build first: zero or more'
  if (o.quantity > MAX_ORDER) return `A single production run can be at most ${MAX_ORDER.toLocaleString('en-US')} units`
  if (!num(o.marketing) || o.marketing < 0) return 'The launch budget cannot be less than zero'
  if (o.marketing > MAX_CAMPAIGN) return `A launch budget can be at most ${dollars(MAX_CAMPAIGN)}`
  if (o.mode === 'factory' && !factoryLine(s)?.running) return 'Your factory has no working line. Use a contract manufacturer or finish the line.'
  const venue = o.keynote === undefined ? undefined : EVENTS.keynote.venues[o.keynote]
  if (o.keynote !== undefined) {
    // everything that could stop the keynote is settled before any money is spent on the device
    const lock = locked(s, 'events')
    if (lock) return lock
    if (!whole(o.keynote) || !venue) return 'Pick a venue for the keynote'
    if (o.keynote === OWN_VENUE && !hasStage(s)) return s.venue ? `Your venue is not ready for a keynote. ${venueStats(s.venue).problem ?? ''}`.trim() : 'Build a venue of your own first, or pick a hired one for the keynote'
  }
  const plan = devPlan(o.design, s, isVariantOf(s, family, type))
  const total = plan.cost + o.marketing + (venue?.cost ?? 0)
  if (!canAfford(s, total)) {
    const what = ['development', ...(o.marketing > 0 ? ['the launch budget'] : []), ...(venue ? ['the keynote'] : [])]
    return `Not enough cash: ${what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what[what.length - 1]} come` : 'development comes'} to ${dollars(total)}`
  }
  const c = player(s)
  const { product } = createProduct(s, c, { name, family, variant, design: JSON.parse(JSON.stringify(o.design)), price, tiers }, s.levels, true)
  product.devDaysLeft = plan.days
  product.marketing = o.marketing
  spend(s, plan.cost, 'development')
  spend(s, o.marketing, 'marketing')
  if (Math.floor(o.quantity) > 0) s.orders.push({ id: `q${s.nextId++}`, productId: product.id, quantity: Math.floor(o.quantity), done: 0, mode: o.mode, placedDay: s.day })
  if (o.keynote !== undefined) {
    const err = scheduleEvent(s, 'keynote', o.keynote, product.id)
    if (err) news(s, 'alert', `No keynote was booked: ${err}`)
  }
  news(s, 'launch', `Development of ${product.name} started. Release in ${plan.days} days.`, product.id)
  return null
}

export function orderProduction(s: GameState, productId: string, quantity: number, mode: ProductionOrder['mode']): string | null {
  const p = s.products.find((x) => x.id === productId)
  if (!p || p.companyId !== 'player') return 'There is no such device of yours to build'
  if (p.status === 'ended') return `${p.name} has been discontinued, so no more can be ordered`
  if (!num(quantity) || Math.floor(quantity) < 1) return 'Enter a quantity of at least 1'
  if (quantity > MAX_ORDER) return `A single production run can be at most ${MAX_ORDER.toLocaleString('en-US')} units`
  if (mode !== 'contract' && mode !== 'factory') return 'Choose who builds it: a contract manufacturer or your own factory'
  if (mode === 'factory' && !factoryLine(s)?.running) return 'Your factory has no working line. Use a contract manufacturer or finish the line.'
  s.orders.push({ id: `q${s.nextId++}`, productId, quantity: Math.floor(quantity), done: 0, mode, placedDay: s.day })
  return null
}

export function cancelOrder(s: GameState, orderId: string) {
  s.orders = s.orders.filter((o) => o.id !== orderId)
}

/** Change what a device sells for. Returns why not, or null. */
export function setPrice(s: GameState, productId: string, price: number): string | null {
  const p = s.products.find((x) => x.id === productId)
  if (!p || p.companyId !== 'player') return 'There is no such device of yours to price'
  if (!num(price) || Math.round(price) < 1) return 'Set a price of at least $1'
  if (price > MAX_PRICE) return `Nobody pays more than ${dollars(MAX_PRICE)} for a device. Set a lower price.`
  const delta = Math.round(price) - p.price
  p.price = Math.round(price)
  // storage options keep their step above the base price
  for (const t of p.tiers) t.price += delta
  return null
}

export { wasReleased }

export function discontinue(s: GameState, productId: string) {
  const p = s.products.find((x) => x.id === productId)
  if (p && p.companyId === 'player' && p.status !== 'ended') {
    const shelved = p.status === 'dev'
    endProduct(s, p)
    s.orders = s.orders.filter((o) => o.productId !== p.id)
    s.campaigns = s.campaigns.filter((c) => c.target !== p.id)
    news(s, 'launch', shelved ? `Development of ${p.name} was cancelled. It never went on sale.` : `${p.name} was discontinued with ${p.stock.toLocaleString('en-US')} units unsold.`, p.id)
  }
}

const STARTER_SEGMENT: Record<DeviceType, SegmentId> = { phone: 'mainstream', tablet: 't-main', watch: 'w-smart', laptop: 'l-ultra', desktop: 'd-home', console: 'c-core', earbuds: 'e-anc', tv: 'tv-home', foldable: 'f-value', headset: 'v-mixed', speaker: 's-screen', handheld: 'h-pc' }
/** Body colour of the starting template for each device type. */
const STARTER_COLOR: Partial<Record<DeviceType, string>> = { laptop: '#8f959d', watch: '#3a3d42', desktop: '#c3c7cc', console: '#e4e5e7', earbuds: '#ecebe6', tv: '#25282d', foldable: '#3f4650', headset: '#e4e5e7', speaker: '#8a8f8a', handheld: '#2b2f36' }

/** Starting template for a new design, using only what the company has researched. */
export function starterDesign(s: GameState, type: DeviceType = 'phone'): DeviceDesign {
  const holder = { rng: s.config.seed + s.products.length * 7919 + type.length }
  const c = player(s)
  const logo = c.name.split(' ')[0].slice(0, 10).toUpperCase()
  const segment = STARTER_SEGMENT[type]
  const d = generateDesign(holder, { segment, levels: s.levels, mLevel: marketLevel(s.day), layout: 1, palette: [STARTER_COLOR[type] ?? '#b9c7d8'], logo, logoImage: !!c.logo, flip: false })
  const owned = (id: string) => s.features.includes(id)
  d.specs.extras = d.specs.extras.filter(owned)
  if (d.specs.refresh > 60 && !owned(`hz${d.specs.refresh}`)) d.specs.refresh = 60
  const sensor = Math.max(0, ...d.parts.filter((p) => p.kind === 'camera').map((p) => p.sensor ?? 0))
  d.parts = layoutParts(d.body, {
    type,
    layout: 1,
    cams: TIERS[segment].cams,
    sensor,
    periscope: owned('periscope') && sensor >= 3,
    front: owned('punch') ? 'punch' : 'notch',
    fingerprint: type === 'tablet' ? 'side' : owned('fpdisplay') ? 'display' : 'side',
    flash: true,
    stereo: d.specs.extras.includes('stereo'),
    logo,
    logoImage: !!c.logo,
    io: d.specs.io,
  })
  return d
}

export type { VariantId }

// ---------------------------------------------------------------- research
// A research id is a track name (meaning that track's next level) or
// 'f:' + feature id for a branch feature.

export interface ResearchItem {
  id: string
  name: string
  cost: number
  done: boolean
  available: boolean
  /** Why it cannot be started, when it cannot. */
  blocked?: string
}

export function trunkBlocked(s: GameState, t: Track, level: number): string | undefined {
  const req = TRUNK_REQS[t]?.[level]
  if (!req) return undefined
  for (const k of TRACKS) {
    const need = req[k]
    if (need !== undefined && s.levels[k] < need) return `Needs ${TRACK_INFO[k].name} level ${need}`
  }
  return undefined
}

/** True for the id of something that can be researched: a track, or 'f:' and a feature. */
export const isResearchId = (id: unknown): id is string => typeof id === 'string' && ((TRACKS as string[]).includes(id) || (id.startsWith('f:') && !!featureInfo(id.slice(2))))

export function researchItem(s: GameState, id: string): ResearchItem {
  if (!isResearchId(id)) return { id: String(id), name: 'Unknown project', cost: 0, done: false, available: false, blocked: 'There is no such research project' }
  if (id.startsWith('f:')) {
    const f = featureInfo(id.slice(2))!
    const done = s.features.includes(f.id)
    const blocked = s.levels[f.track] < f.level ? `Needs ${TRACK_INFO[f.track].name} level ${f.level}` : undefined
    return { id, name: f.name, cost: featureCost(f), done, available: !done && !blocked, blocked }
  }
  const t = id as Track
  const next = s.levels[t] + 1
  const done = s.levels[t] >= MAX_LEVEL
  const blocked = done ? undefined : trunkBlocked(s, t, next)
  return { id, name: done ? TRACK_INFO[t].name : `${TRACK_INFO[t].name} L${next}: ${TRACK_INFO[t].unlocks[next]}`, cost: done ? 0 : researchCost(next), done, available: !done && !blocked, blocked }
}

export function toggleResearch(s: GameState, id: string): string | null {
  const i = s.activeResearch.indexOf(id)
  if (i >= 0) {
    s.activeResearch.splice(i, 1)
    return null
  }
  const lock = locked(s, 'research')
  if (lock) return lock
  const item = researchItem(s, id)
  if (item.done) return id.startsWith('f:') ? `${item.name} is already researched` : `${item.name} is at its highest level`
  if (!item.available) return item.blocked ?? 'Not available yet'
  s.activeResearch.push(id)
  return null
}

/** Set what research gets each month. Returns why not, or null. */
export function setResearchBudget(s: GameState, monthly: number): string | null {
  if (!num(monthly) || monthly < 0) return 'A research budget is zero or more a month'
  if (monthly > MAX_CAMPAIGN) return `A research budget can be at most ${dollars(MAX_CAMPAIGN)} a month`
  s.rdBudget = Math.round(monthly)
  return null
}

// ---------------------------------------------------------------- staff

export function hire(s: GameState, candidateId: string): string | null {
  const c = s.candidates.find((e) => e.id === candidateId)
  if (!c) return 'That applicant is no longer available. New applicants arrive every month.'
  if (!canAfford(s, c.salary)) return `Not enough cash for the signing bonus of ${dollars(c.salary)}`
  spend(s, c.salary, 'salaries')
  s.candidates = s.candidates.filter((e) => e !== c)
  s.staff.push({ ...c, hiredDay: s.day })
  stepProgress(s)
  return null
}

/** Give someone from the executive shortlist their seat. One person holds each seat. */
export function hireExec(s: GameState, candidateId: string): string | null {
  const c = s.execPool.find((e) => e.id === candidateId)
  if (!c || !c.exec) return 'That candidate is no longer on the shortlist. It is drawn up afresh every month.'
  const lock = locked(s, 'execs')
  if (lock) return lock
  if (s.staff.some((e) => e.exec === c.exec)) return `You already have a ${EXECS[c.exec].title}`
  if (!canAfford(s, c.salary)) return `Not enough cash for the signing bonus of ${dollars(c.salary)}`
  spend(s, c.salary, 'salaries')
  s.execPool = s.execPool.filter((e) => e.exec !== c.exec)
  s.staff.push({ ...c, hiredDay: s.day })
  news(s, 'staff', `${c.name} joined as ${EXECS[c.exec].title}.`)
  stepProgress(s)
  return null
}

export function fire(s: GameState, employeeId: string) {
  s.staff = s.staff.filter((e) => e.id !== employeeId)
  dropFromTeams(s, employeeId)
}

/** A name as it will be kept: trimmed, and cut to the longest a name may be. */
const named = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, MAX_NAME) : '')

/** The most teams a company keeps: more than any org chart needs, and few enough to list. */
export const MAX_TEAMS = 60

/** Start a team. Returns its id, or '' if teams are not open yet or there are already as many as a company can keep. */
export function createTeam(s: GameState, name: string): string {
  if (locked(s, 'teams') || s.teams.length >= MAX_TEAMS) return ''
  const id = `t${s.nextId++}`
  s.teams.push({ id, name: named(name) || `Team ${s.teams.length + 1}`, members: [] })
  return id
}

export function renameTeam(s: GameState, teamId: string, name: string) {
  const t = s.teams.find((x) => x.id === teamId)
  if (t && named(name)) t.name = named(name)
}

export function deleteTeam(s: GameState, teamId: string) {
  s.teams = s.teams.filter((t) => t.id !== teamId)
}

/** Put someone in a team (or take them out of any, with null). Asking for a team that does not exist changes nothing. */
export function assignTeam(s: GameState, employeeId: string, teamId: string | null) {
  if (!s.staff.some((e) => e.id === employeeId) || (teamId && locked(s, 'teams'))) return
  const t = teamId ? s.teams.find((x) => x.id === teamId) : undefined
  if (teamId && !t) return
  dropFromTeams(s, employeeId)
  if (t) t.members.push(employeeId)
}

/** Name a team's lead (or leave it without one, with undefined). Someone from outside the team joins it. */
export function setLead(s: GameState, teamId: string, employeeId: string | undefined) {
  const t = s.teams.find((x) => x.id === teamId)
  if (!t) return
  if (employeeId !== undefined && !s.staff.some((e) => e.id === employeeId)) return
  if (employeeId && !t.members.includes(employeeId)) assignTeam(s, employeeId, teamId)
  // nobody leads a team they are not in (they could not join it while teams are locked)
  if (employeeId && !t.members.includes(employeeId)) return
  t.leadId = employeeId || undefined
}

/** Sort everyone into teams by role, a lead's span at a time, led by whoever suits it best. */
export function autoTeams(s: GameState): string | null {
  const lock = locked(s, 'teams')
  if (lock) return lock
  s.teams = []
  const lead = (ids: string[]) => {
    const people = ids.map((id) => s.staff.find((e) => e.id === id)!)
    // a good lead is skilled and good with people; a star is better left doing the work
    return people.sort((a, b) => b.skill + (b.traits.includes('social') ? 15 : 0) - (b.traits.includes('star') ? 25 : 0) - (a.skill + (a.traits.includes('social') ? 15 : 0) - (a.traits.includes('star') ? 25 : 0)))[0].id
  }
  for (const [role, label] of [['engineer', 'Hardware'], ['software', 'Software'], ['designer', 'Design'], ['researcher', 'Research'], ['marketer', 'Marketing'], ['support', 'Support']] as const) {
    const people = s.staff.filter((e) => e.role === role)
    const groups = Math.ceil(people.length / TEAM_SPAN)
    for (let g = 0; g < groups; g++) {
      const members = people.filter((_, i) => i % groups === g).map((e) => e.id)
      if (members.length < 2) continue
      s.teams.push({ id: `t${s.nextId++}`, name: groups > 1 ? `${label} ${g + 1}` : label, members, leadId: lead(members) })
    }
  }
  return null
}

export function setPolicy(s: GameState, patch: Partial<StaffPolicy>): string | null {
  const lock = locked(s, 'people')
  if (lock) return lock
  if (patch.hours !== undefined && !lists(HOURS, patch.hours)) return 'Working hours are relaxed, standard or crunch'
  if (patch.perks !== undefined && !num(patch.perks)) return 'Perks run from 0 (none) to 3 (lavish)'
  if (patch.hours) s.policy.hours = patch.hours
  if (patch.perks !== undefined) s.policy.perks = clamp(Math.round(patch.perks), 0, 3)
  return null
}

/** The most anyone can be paid a month. */
export const MAX_SALARY = 5e6

/** Raise someone's pay: to a figure, or to what they are asking, or by 8%. A figure at or below what they earn changes nothing. */
export function giveRaise(s: GameState, employeeId: string, salary?: number) {
  const e = s.staff.find((x) => x.id === employeeId)
  if (!e || (salary !== undefined && !num(salary))) return
  const to = Math.min(MAX_SALARY, Math.round((salary ?? e.ask ?? e.salary * 1.08) / 50) * 50)
  if (to <= e.salary) return
  e.morale = Math.min(100, e.morale + 12)
  e.salary = to
  e.ask = undefined
}

export function declineRaise(s: GameState, employeeId: string) {
  const e = s.staff.find((x) => x.id === employeeId)
  if (!e) return
  e.ask = undefined
  e.morale = Math.max(0, e.morale - 15)
  e.raiseAfter = s.day + 180
}

export function train(s: GameState, employeeId: string): string | null {
  const e = s.staff.find((x) => x.id === employeeId)
  if (!e) return 'That person no longer works here'
  const lock = locked(s, 'people')
  if (lock) return lock
  if (inTraining(e, s.day)) return `${e.name} is already on a course until ${fmtDate(e.trainingUntil!)}`
  if (e.skill >= e.potential) return `${e.name} has reached their potential: a course would teach them nothing more`
  const cost = trainingCost(e)
  if (!canAfford(s, cost)) return `Not enough cash: the course costs ${dollars(cost)}`
  spend(s, cost, 'salaries')
  e.trainingUntil = s.day + 30
  return null
}

export function headhunt(s: GameState): string | null {
  if (!canAfford(s, HEADHUNT_COST)) return `Not enough cash: a headhunter charges ${dollars(HEADHUNT_COST)}`
  spend(s, HEADHUNT_COST, 'salaries')
  refreshCandidates(s, 15)
  return null
}

// ---------------------------------------------------------------- sites
// A site reference is 'office', 'factory', 'venue' or 'store:' + store id.

export function siteOf(s: GameState, ref: string): Site | null {
  if (ref === 'office') return s.office
  if (ref === 'factory') return s.factory
  if (ref === 'venue') return s.venue
  return s.stores.find((st) => `store:${st.id}` === ref)?.site ?? null
}
const siteBucket = (site: Site): CostKey => (site.kind === 'office' ? 'overhead' : 'facilities')
/** Rooms cost more to build when the building has upper floors to carry. */
export const roomCost = (site: Site, type: string, tiles: number) => Math.round(tiles * (ROOMS[site.kind][type]?.cost ?? 0) * (1 + 0.4 * (site.floors - 1)))

/** Tiles in an area that could become part of a room. A round room takes every tile its curved wall touches. */
export const zoneable = (site: Site, x0: number, y0: number, x1: number, y1: number, shape: Shape, opts?: ShapeOpts) => areaTiles(x0, y0, x1, y1, shape, opts, true).filter(([x, y]) => inPlot(site, x, y) && !gridAt(site, x, y))

/** Floor area, in square metres, that zoning an area would add: tiles a curved wall cuts count for the part inside it. */
export const zoneArea = (site: Site, x0: number, y0: number, x1: number, y1: number, shape: Shape, opts?: ShapeOpts) => Math.max(1, Math.round(areaOf(zoneable(site, x0, y0, x1, y1, shape, opts), curveFor(x0, y0, x1, y1, shape, opts))))

/** What marking out an area as a room would build. */
export interface ZonePlan {
  /** The open tiles the room takes. */
  tiles: [number, number][]
  /** The curved outline of a round or ring room, or null. */
  curve: ReturnType<typeof curveFor>
  /** Floor area charged for, in square metres. */
  area: number
  /** True when a box drawn across a curved courtyard was widened to take the whole courtyard. */
  filled: boolean
  /** Open tiles in the curved courtyard a box lies in, or 0 where it lies in none: a box across half of them or more takes them all. */
  yard: number
  /** True when there is nothing to build because the area lies wholly outside the plot (as opposed to on land already built on). */
  offPlot?: boolean
}

/**
 * Works out what an area tool marked from one corner to the other would
 * build. A plain box that covers half or more of a courtyard closed in by a
 * curved wall takes the whole courtyard, so the room shares the curve all
 * round instead of leaving slivers of ground beside its straight sides.
 */
export function zonePlan(site: Site, x0: number, y0: number, x1: number, y1: number, shape: Shape = 'rect', opts?: ShapeOpts): ZonePlan {
  const tiles = zoneable(site, x0, y0, x1, y1, shape, opts)
  const curve = curveFor(x0, y0, x1, y1, shape, opts)
  const offPlot = !tiles.length && !areaTiles(x0, y0, x1, y1, shape, opts, true).some(([x, y]) => inPlot(site, x, y))
  if (curve) return { tiles, curve, area: tiles.length ? zoneArea(site, x0, y0, x1, y1, shape, opts) : 0, filled: false, yard: 0, offPlot }
  const yard = shape === 'rect' ? courtyardFor(site, tiles) : null
  const took = yard?.whole ? yard.tiles : tiles
  return { tiles: took, curve: null, area: took.length, filled: !!yard?.whole, yard: yard?.tiles.length ?? 0, offPlot }
}

/** What an action answers when it is pointed at a plot the company does not have. */
const NO_SITE = 'There is no such plot to build on'
const OFF_PLOT = 'That is off the plot'
const SHAPES: Shape[] = ['rect', 'round', 'ring', 'diag']
/** True when the tiles an action names are ones a player could have pointed at: whole numbers, on the plot or within a plot's width of it. */
const near = (site: Site, ...xy: number[]) => xy.every((v, i) => whole(v) && v >= -(i % 2 ? site.h : site.w) && v < 2 * (i % 2 ? site.h : site.w))

/**
 * Builds a room on a set of open tiles, charged for: clears and sells what
 * stands on them, joins the rooms it should join, and sees that neither the
 * new room nor any room that had a way in is left without one.
 */
function raise(s: GameState, site: Site, type: string, tiles: [number, number][], cost: number, into: number | undefined, apart: boolean, cuts: Record<string, Corner>, curve: ReturnType<typeof curveFor>): string | null {
  const joined = apart ? [] : touching(site, type, tiles)
  const start = !apart && into !== undefined ? roomOf(site, into) : undefined
  if (start?.type === type && !joined.includes(start.n)) joined.push(start.n)
  joined.sort((a, b) => a - b)
  if (!canAfford(s, cost)) return `Not enough cash: that would cost ${dollars(cost)}`
  spend(s, cost, siteBucket(site))
  // trees, benches and anything else standing on the land are cleared and sold on
  const taken = new Set(tiles.map(([x, y]) => `${x},${y}`))
  let back = 0
  site.items = site.items.filter((it) => {
    if (!ITEMS[site.kind][it.kind] || !itemTiles(site, it).some(([x, y]) => taken.has(`${x},${y}`))) return true
    back += ITEMS[site.kind][it.kind].cost / 2
    return false
  })
  s.cash += back
  s.cur[siteBucket(site)] -= back
  const had = openRooms(site)
  const { room } = zone(site, type, tiles, joined[0], 0, cuts, curve)
  if (room && joined.length > 1) mergeRooms(site, room.n, joined)
  tidy(site)
  // a room that already has a way in is not given another
  if (room) autoDoor(site, room.n)
  // a room whose only door went with a wall the new floor swallowed, or was cut short by a new curved wall, gets another
  const open = openRooms(site)
  for (const r of site.rooms) if (r.n !== room?.n && had.has(r.n) && !open.has(r.n)) autoDoor(site, r.n)
  return null
}

/**
 * Build a room over an area of open ground. Floor laid against a room of the
 * same type joins it: the wall between them goes, and where the new floor
 * touches several such rooms they all become one, which keeps the number and
 * the finish of the oldest. Pass `into` to extend a room the new floor does
 * not touch, or `apart` to build a room of its own whatever stands next to
 * it. Round and ring shapes get a smooth curved wall; `opts` sets a ring's
 * depth and how much of a turn an arc covers. A box across half or more
 * of a curved courtyard takes all of it (see zonePlan).
 */
export function zoneRoom(s: GameState, ref: string, type: string, x0: number, y0: number, x1: number, y1: number, shape: Shape = 'rect', into?: number, opts?: ShapeOpts, apart = false): string | null {
  const site = siteOf(s, ref)
  if (!site) return NO_SITE
  if (!lists(ROOMS[site.kind], type)) return 'There is no such kind of room for this plot'
  if (!SHAPES.includes(shape)) return 'A room is drawn as a box, a round, a ring or a diagonal'
  if (!near(site, x0, y0, x1, y1)) return OFF_PLOT
  const lock = siteLocked(s, site.kind, 'room', type)
  if (lock) return lock
  const plan = zonePlan(site, x0, y0, x1, y1, shape, opts)
  if (!plan.tiles.length) return plan.offPlot ? OFF_PLOT : 'That land is already built on. Clear it first, or mark the room out on open ground.'
  // diagonal rooms get their stepped edges cut to 45 degrees; round ones keep their true curve
  const cuts = shape === 'diag' ? shapeCuts(areaTiles(x0, y0, x1, y1, shape)) : {}
  return raise(s, site, type, plan.tiles, roomCost(site, type, plan.area), into, apart, cuts, plan.curve)
}

/**
 * Fill the courtyard a tile lies in with a room: every open tile shut in with
 * it, up to the walls all round, curved ones included. Charged by the tile
 * like any other room, and joined to rooms of the same type it touches unless
 * `apart` is set. The edge of the plot may close part of the courtyard; ground
 * that is mostly open to the plot is refused (see fillError).
 */
export function fillRoom(s: GameState, ref: string, type: string, x: number, y: number, apart = false): string | null {
  const site = siteOf(s, ref)
  if (!site) return NO_SITE
  if (!lists(ROOMS[site.kind], type)) return 'There is no such kind of room for this plot'
  if (!whole(x) || !whole(y) || !inPlot(site, x, y)) return OFF_PLOT
  const lock = siteLocked(s, site.kind, 'room', type)
  if (lock) return lock
  const pocket = pocketAt(site, x, y)
  const err = fillError(pocket)
  if (err || !pocket) return err
  return raise(s, site, type, pocket.tiles, roomCost(site, type, pocket.tiles.length), undefined, apart, {}, null)
}

/** Knock down every room tile in an area. Anything inside is sold for half its price. */
export function clearZone(s: GameState, ref: string, x0: number, y0: number, x1: number, y1: number, shape: Shape = 'rect', opts?: ShapeOpts) {
  const site = siteOf(s, ref)
  if (!site || !SHAPES.includes(shape)) return
  if (shape === 'rect') {
    // a box may be dragged as far off the plot as anyone likes: only the part on it counts
    if (![x0, y0, x1, y1].every(num)) return
    ;[x0, x1] = [clamp(Math.round(Math.min(x0, x1)), -1, site.w), clamp(Math.round(Math.max(x0, x1)), -1, site.w)]
    ;[y0, y1] = [clamp(Math.round(Math.min(y0, y1)), -1, site.h), clamp(Math.round(Math.max(y0, y1)), -1, site.h)]
  } else if (!near(site, x0, y0, x1, y1)) return
  const hit = new Set(areaTiles(x0, y0, x1, y1, shape, opts).filter(([x, y]) => gridAt(site, x, y)).map(([x, y]) => `${x},${y}`))
  if (!hit.size) return
  let back = 0
  site.items = site.items.filter((it) => {
    if (!ITEMS[site.kind][it.kind] || !itemTiles(site, it).some(([x, y]) => hit.has(`${x},${y}`))) return true
    back += ITEMS[site.kind][it.kind].cost / 2
    return false
  })
  for (const key of hit) {
    const [x, y] = key.split(',').map(Number)
    site.grid[y * site.w + x] = 0
  }
  s.cash += back
  s.cur[siteBucket(site)] -= back
  tidy(site)
  site.rev++
}

/** Knock down one whole room. */
export function removeRoom(s: GameState, ref: string, room: number) {
  const site = siteOf(s, ref)
  if (!site || !roomOf(site, room)) return
  let back = 0
  site.items = site.items.filter((it) => {
    if (!ITEMS[site.kind][it.kind] || !itemTiles(site, it).some(([x, y]) => gridAt(site, x, y) === room)) return true
    back += ITEMS[site.kind][it.kind].cost / 2
    return false
  })
  for (let i = 0; i < site.grid.length; i++) if (site.grid[i] === room) site.grid[i] = 0
  s.cash += back
  s.cur[siteBucket(site)] -= back
  tidy(site)
  site.rev++
}

export function setRoomStyle(s: GameState, ref: string, room: number, style: number) {
  const site = siteOf(s, ref)
  const r = site && roomOf(site, room)
  if (!site || !r || !whole(style) || !ROOMS[site.kind][r.type]?.styles[style]) return
  r.style = style
  site.rev++
}

export const EDGE_COST = { wall: 0, open: 0, glass: 120, door: 300 }
const WALL_KINDS = 'A stretch of wall can be plain wall, glass, a door or an opening'
const NO_WALL = 'There is no wall there: walls stand where a room meets another room or open ground'
/** True for something that names the north or west edge of a tile on or beside the plot. */
const isEdge = (site: Site, x: unknown, y: unknown, side: unknown) => whole(x) && whole(y) && (side === 'n' || side === 'w') && x >= 0 && y >= 0 && x <= site.w && y <= site.h
/** Change one stretch of wall to glass, a door or an opening, or back to plain wall. */
export function setEdge(s: GameState, ref: string, x: number, y: number, side: 'n' | 'w', kind: 'wall' | 'glass' | 'door' | 'open'): string | null {
  const site = siteOf(s, ref)
  if (!site) return NO_SITE
  if (!lists(EDGE_COST, kind)) return WALL_KINDS
  if (!isEdge(site, x, y, side) || !isBoundary(site, x, y, side)) return NO_WALL
  if ((kind === 'door' || kind === 'open') && !doorFits(site, x, y, side)) return SHORT_WALL
  if ((wallAt(site, x, y, side)?.kind ?? 'wall') === kind) return null
  const cost = EDGE_COST[kind]
  if (!canAfford(s, cost)) return `Not enough cash: that costs ${dollars(cost)}`
  spend(s, cost, siteBucket(site))
  site.walls = site.walls.filter((w) => !(w.x === x && w.y === y && w.side === side))
  if (kind !== 'wall') site.walls.push({ id: `w${s.nextId++}`, x, y, side, kind })
  site.rev++
  return null
}

/** The same for one bay of a curved wall: `curve` is its place in the site's list, `bay` the stretch (see sim/curves.ts). */
export function setCurveEdge(s: GameState, ref: string, curve: number, bay: string, kind: 'wall' | 'glass' | 'door' | 'open'): string | null {
  const site = siteOf(s, ref)
  if (!site) return NO_SITE
  if (!lists(EDGE_COST, kind)) return WALL_KINDS
  const c = whole(curve) ? site.curves?.[curve] : undefined
  if (!c || typeof bay !== 'string' || !bayStands(site, curve, bay)) return NO_WALL
  if ((c.walls?.[bay] ?? 'wall') === kind) return null
  const cost = EDGE_COST[kind]
  if (!canAfford(s, cost)) return `Not enough cash: that costs ${dollars(cost)}`
  spend(s, cost, siteBucket(site))
  if (kind === 'wall') {
    if (c.walls) delete c.walls[bay]
  } else (c.walls ??= {})[bay] = kind
  site.rev++
  return null
}

/** What came of an action that covers a run of places in one go. */
export interface RunResult {
  /** How many were put down, changed or sold. */
  done: number
  /** Places passed over: nothing could go there, or it was already so. */
  skipped: number
  /** Places left because the money ran out. */
  short: number
  /** What was paid, or for a sale what came back. */
  cost: number
  /** Something worth telling the player, or null when all went as asked. */
  error: string | null
}

/** Stretches of wall to change together: straight edges, and the bays of one curved wall. */
export interface WallRun {
  edges?: { x: number; y: number; side: 'n' | 'w' }[]
  curve?: number
  bays?: string[]
}

/** True when a run of this many stretches of wall, changed to this kind, passes over the doors in it. */
export const keepsDoors = (kind: 'wall' | 'glass' | 'door' | 'open', stretches: number) => kind === 'glass' && stretches > 1

/**
 * Change a run of wall in one go: every stretch that is a wall and is not
 * already of that kind. Paid for one stretch at a time, so when the money
 * runs out part of the way the rest is left as it was. Glazing a run of
 * several stretches leaves the doors in it standing, so that a shopfront can
 * be glazed in one sweep without losing its way in; a single stretch is
 * changed whatever it was. A door or an opening is passed over on a stretch
 * that a curved wall cuts short (see doorFits).
 */
export function setEdges(s: GameState, ref: string, run: WallRun, kind: 'wall' | 'glass' | 'door' | 'open'): RunResult {
  const out: RunResult = { done: 0, skipped: 0, short: 0, cost: 0, error: null }
  const site = siteOf(s, ref)
  if (!site) return { ...out, error: NO_SITE }
  if (!lists(EDGE_COST, kind)) return { ...out, error: WALL_KINDS }
  run = { edges: Array.isArray(run?.edges) ? run.edges : [], curve: whole(run?.curve) ? run.curve : undefined, bays: Array.isArray(run?.bays) ? run.bays.filter((b) => typeof b === 'string') : [] }
  const price = EDGE_COST[kind]
  let same = 0
  const keepDoors = keepsDoors(kind, (run.edges?.length ?? 0) + (run.bays?.length ?? 0))
  const pay = (now: string): boolean => {
    if (now === kind || (keepDoors && now === 'door')) {
      same++
      out.skipped++
      return false
    }
    if (!canAfford(s, price)) {
      out.short++
      return false
    }
    spend(s, price, siteBucket(site))
    out.cost += price
    out.done++
    return true
  }
  const way = kind === 'door' || kind === 'open'
  const curved = way && site.curves?.length ? curveTiles(site) : undefined
  let cutShort = 0
  const done = new Set<string>()
  for (const e of run.edges ?? []) {
    // a stretch named twice in one run is changed, and paid for, once
    const key = `${e?.x},${e?.y},${e?.side}`
    if (!e || !isEdge(site, e.x, e.y, e.side) || done.has(key) || !isBoundary(site, e.x, e.y, e.side)) {
      out.skipped++
      continue
    }
    if (curved && !doorFits(site, e.x, e.y, e.side, curved)) {
      out.skipped++
      cutShort++
      continue
    }
    done.add(key)
    if (!pay(wallAt(site, e.x, e.y, e.side)?.kind ?? 'wall')) continue
    site.walls = site.walls.filter((w) => !(w.x === e.x && w.y === e.y && w.side === e.side))
    if (kind !== 'wall') site.walls.push({ id: `w${s.nextId++}`, x: e.x, y: e.y, side: e.side, kind })
  }
  const c = run.curve !== undefined ? site.curves?.[run.curve] : undefined
  for (const bay of run.bays ?? []) {
    if (!c || !bayStands(site, run.curve!, bay)) {
      out.skipped++
      continue
    }
    if (!pay(c.walls?.[bay] ?? 'wall')) continue
    if (kind === 'wall') delete c.walls![bay]
    else (c.walls ??= {})[bay] = kind
  }
  if (out.done) site.rev++
  if (out.short) out.error = out.done ? `Changed ${out.done} of ${out.done + out.short}: not enough cash for the rest` : `Not enough cash: each stretch costs ${dollars(price)}`
  else if (!out.done && !same) out.error = cutShort ? SHORT_WALL : NO_WALL
  return out
}

/** Cost of changing a building's cladding, roof or height. */
export function lookCost(site: Site, look: { facade?: number; roof?: number; floors?: number }): number {
  const tiles = builtTiles(site)
  let cost = 0
  if (look.facade !== undefined && look.facade !== site.facade) cost += (FACADES[look.facade]?.cost ?? 0) * Math.sqrt(tiles) * 4 * site.floors
  if (look.roof !== undefined && look.roof !== site.roof) cost += (ROOFS[look.roof]?.cost ?? 0) * tiles
  if (look.floors !== undefined && look.floors > site.floors) cost += (look.floors - site.floors) * tiles * FLOOR_COST
  return Math.round(cost)
}

export function setLook(s: GameState, ref: string, look: { facade?: number; roof?: number; floors?: number }): string | null {
  const site = siteOf(s, ref)
  if (!site) return NO_SITE
  if (!look || typeof look !== 'object') return 'Choose a cladding, a roof or a number of floors'
  if (look.facade !== undefined && (!whole(look.facade) || !FACADES[look.facade])) return 'There is no such cladding'
  if (look.roof !== undefined && (!whole(look.roof) || !ROOFS[look.roof])) return 'There is no such roof'
  if (look.floors !== undefined && (!whole(look.floors) || look.floors < 1 || look.floors > MAX_FLOORS)) return `A building can have 1 to ${MAX_FLOORS} floors`
  const cost = lookCost(site, look)
  if (!canAfford(s, cost)) return `Not enough cash: that would cost ${dollars(cost)}`
  spend(s, cost, siteBucket(site))
  if (look.facade !== undefined) site.facade = look.facade
  if (look.roof !== undefined) site.roof = look.roof
  if (look.floors !== undefined) site.floors = look.floors
  site.rev++
  return null
}

/** A rotation as 0 to 3 quarter turns, whatever was asked for. */
const quarterTurns = (rot: number) => (num(rot) ? ((Math.round(rot) % 4) + 4) % 4 : 0)

export function placeItem(s: GameState, ref: string, kind: string, x: number, y: number, rot: number): string | null {
  const site = siteOf(s, ref)
  if (!site) return NO_SITE
  const turn = quarterTurns(rot)
  const err = canPlace(site, kind, x, y, turn) ?? siteLocked(s, site.kind, 'item', kind)
  if (err) return err
  const cost = ITEMS[site.kind][kind].cost
  if (!canAfford(s, cost)) return `Not enough cash: that costs ${dollars(cost)}`
  spend(s, cost, siteBucket(site))
  site.items.push({ id: `o${s.nextId++}`, kind, x, y, rot: turn })
  site.rev++
  return null
}

/**
 * Put down a row of one item in a single go, from one tile toward another
 * (see rowSpots). Places where it cannot stand are passed over; each one put
 * down is paid for as it goes, so when the money runs out part of the way the
 * rest are left out and the result says how many made it.
 */
export function placeItems(s: GameState, ref: string, kind: string, x0: number, y0: number, x1: number, y1: number, rot: number): RunResult {
  const out: RunResult = { done: 0, skipped: 0, short: 0, cost: 0, error: null }
  const site = siteOf(s, ref)
  if (!site) return { ...out, error: NO_SITE }
  if (!lists(ITEMS[site.kind], kind)) return { ...out, error: UNKNOWN_ITEM }
  const def = ITEMS[site.kind][kind]
  if (!near(site, x0, y0, x1, y1)) return { ...out, error: OFF_PLOT }
  const lock = siteLocked(s, site.kind, 'item', kind)
  if (lock) return { ...out, error: lock }
  const turn = quarterTurns(rot)
  let why: string | null = null
  for (const [x, y] of rowSpots(def, x0, y0, x1, y1, turn)) {
    const err = canPlace(site, kind, x, y, turn)
    if (err) {
      why ??= err
      out.skipped++
    } else if (!canAfford(s, def.cost)) out.short++
    else {
      spend(s, def.cost, siteBucket(site))
      site.items.push({ id: `o${s.nextId++}`, kind, x, y, rot: turn })
      out.cost += def.cost
      out.done++
    }
  }
  if (out.done) site.rev++
  if (out.short) out.error = out.done ? `Placed ${out.done} of ${out.done + out.short}: not enough cash for the rest` : `Not enough cash: each one costs ${dollars(def.cost)}`
  else if (!out.done) out.error = why
  return out
}

/** Sell several items in one go, each for half its price. */
export function removeItems(s: GameState, ref: string, itemIds: string[]): RunResult {
  const out: RunResult = { done: 0, skipped: 0, short: 0, cost: 0, error: null }
  const site = siteOf(s, ref)
  if (!site) return { ...out, error: NO_SITE }
  const ids = new Set(Array.isArray(itemIds) ? itemIds : [])
  site.items = site.items.filter((it) => {
    if (!ids.has(it.id)) return true
    out.cost += (ITEMS[site.kind][it.kind]?.cost ?? 0) / 2
    out.done++
    return false
  })
  if (!out.done) return out
  site.rev++
  s.cash += out.cost
  s.cur[siteBucket(site)] -= out.cost
  return out
}

export function removeItem(s: GameState, ref: string, itemId: string) {
  const site = siteOf(s, ref)
  const item = site?.items.find((i) => i.id === itemId)
  if (!site || !item) return
  site.items = site.items.filter((i) => i !== item)
  site.rev++
  // second-hand furniture and machinery sells for half
  const back = (ITEMS[site.kind][item.kind]?.cost ?? 0) / 2
  s.cash += back
  s.cur[siteBucket(site)] -= back
}

export function rotateItem(s: GameState, ref: string, itemId: string): string | null {
  const site = siteOf(s, ref)
  const item = site?.items.find((i) => i.id === itemId)
  if (!site || !item) return null
  const rest = { ...site, items: site.items.filter((i) => i !== item) }
  const next = (item.rot + 1) % 4
  const err = canPlace(rest, item.kind, item.x, item.y, next)
  if (err) return 'No room to turn it there'
  item.rot = next
  site.rev++
  return null
}

/** Lay a ground finish on open land. Free. */
export function paintFloor(s: GameState, ref: string, x: number, y: number, groundId: string) {
  const site = siteOf(s, ref)
  if (!site || !whole(x) || !whole(y) || !hasGround(site, x, y) || (groundId === 'water' && gridAt(site, x, y))) return
  if (!groundsFor(site).some((g) => g.id === groundId)) return
  // the finish the plot starts with is not stored: it is whatever is left when nothing else is laid
  if (groundId === defaultGround(site).id) delete site.floor[`${x},${y}`]
  else site.floor[`${x},${y}`] = groundId
  site.rev++
}

/** Lay a ground finish over an area of open land. */
export function paintArea(s: GameState, ref: string, x0: number, y0: number, x1: number, y1: number, shape: Shape, groundId: string, opts?: ShapeOpts) {
  const site = siteOf(s, ref)
  if (!site || !groundsFor(site).some((g) => g.id === groundId) || !SHAPES.includes(shape) || !near(site, x0, y0, x1, y1)) return
  const lay = ([x, y]: [number, number]) => {
    if (groundId === defaultGround(site).id) delete site.floor[`${x},${y}`]
    else site.floor[`${x},${y}`] = groundId
  }
  areaTiles(x0, y0, x1, y1, shape, opts).filter(([x, y]) => inPlot(site, x, y) && !gridAt(site, x, y)).forEach(lay)
  // the strip of ground left outside a slanted or curved wall takes the finish too, wherever the area touches it
  if (groundId !== 'water') areaTiles(x0, y0, x1, y1, shape, opts, true).filter(([x, y]) => gridAt(site, x, y) && hasGround(site, x, y)).forEach(lay)
  site.rev++
}

/**
 * Sets everything that stands on one plot down on another, shifted by so
 * many tiles: rooms, walls, cut corners, curves, ground finishes, furniture
 * and the building's look. The caller makes sure the built part fits; ground
 * finishes that fall off the edge, or that the new surroundings do not offer,
 * are left behind.
 */
function transplant(old: Site, site: Site, dx: number, dy: number) {
  for (let y = 0; y < old.h; y++) {
    for (let x = 0; x < old.w; x++) {
      const n = old.grid[y * old.w + x]
      if (n && inPlot(site, x + dx, y + dy)) site.grid[(y + dy) * site.w + x + dx] = n
    }
  }
  site.rooms = old.rooms.map((r) => ({ ...r }))
  site.nextRoom = old.nextRoom
  site.items = old.items.map((it) => ({ ...it, x: it.x + dx, y: it.y + dy }))
  site.walls = old.walls.map((w) => ({ ...w, x: w.x + dx, y: w.y + dy }))
  const offered = new Set(groundsFor(site).map((g) => g.id))
  const plain = defaultGround(site).id
  for (const [key, id] of Object.entries(old.floor)) {
    const [x, y] = key.split(',').map(Number)
    if (inPlot(site, x + dx, y + dy) && offered.has(id) && id !== plain) site.floor[`${x + dx},${y + dy}`] = id
  }
  for (const [key, c] of Object.entries(old.cuts ?? {})) {
    const [x, y] = key.split(',').map(Number)
    ;(site.cuts ??= {})[`${x + dx},${y + dy}`] = c
  }
  // curved outlines move with their rooms: the centre, and the tiles noted as squared off
  if (old.curves?.length) {
    // a squared-off tile that the room has since given up may fall outside a smaller plot: it is left behind
    const shift = (key: string): string | null => {
      const [x, y] = key.split(',').map(Number)
      return inPlot(site, x + dx, y + dy) ? `${x + dx},${y + dy}` : null
    }
    site.curves = old.curves.map((c) => {
      const square = Object.keys(c.square ?? {}).map(shift).filter((k): k is string => k !== null)
      const { square: _was, ...rest } = c
      return { ...rest, cx: c.cx + dx, cy: c.cy + dy, ...(c.walls ? { walls: { ...c.walls } } : {}), ...(square.length ? { square: Object.fromEntries(square.map((k) => [k, 1 as const])) } : {}) }
    })
  }
  site.facade = old.facade
  site.roof = old.roof
  site.floors = old.floors
}

/** Move everything on a plot to the next size up, centred. Nothing is lost. */
function movePlot(old: Site): Site {
  const site = newSite(old.kind, old.tier + 1)
  transplant(old, site, Math.floor((site.w - old.w) / 2), Math.floor((site.h - old.h) / 2))
  site.rev = old.rev + 1
  return site
}

// ---------------------------------------------------------------- store layouts

/** Floor area of one room in square metres: a tile a curved wall crosses counts for the part inside it. */
function roomArea(site: Site, n: number): number {
  let area = 0
  for (let y = 0; y < site.h; y++) for (let x = 0; x < site.w; x++) if (site.grid[y * site.w + x] === n) area += onCurve(site, x, y) ? curveAt(site, x, y)!.shape.cover : 1
  return area
}

/**
 * What everything on a plot would cost to build from bare ground, at the
 * prices building it piece by piece charges: floor by the square metre, doors
 * and glass by the stretch (each room's first door is free, as it is when a
 * room is zoned), furniture at list price, then cladding, roof and storeys.
 * `has` is a building whose cladding, roof and storeys are already paid for.
 */
export function layoutValue(site: Site, has: { facade: number; roof: number; floors: number } = { facade: 0, roof: 0, floors: 1 }): number {
  const ground = { ...site, floors: 1 }
  let total = 0
  for (const r of site.rooms) total += roomCost(ground, r.type, Math.max(1, Math.round(roomArea(site, r.n))))
  let edges = 0
  for (const w of site.walls) edges += EDGE_COST[w.kind]
  for (const c of site.curves ?? []) for (const kind of Object.values(c.walls ?? {})) edges += EDGE_COST[kind]
  total += Math.max(0, edges - site.rooms.length * EDGE_COST.door)
  for (const it of site.items) total += ITEMS[site.kind][it.kind]?.cost ?? 0
  return total + lookCost({ ...site, ...has }, { facade: site.facade, roof: site.roof, floors: site.floors })
}

/** What copying a layout onto a plot comes to. */
export interface LayoutQuote {
  /** Why it cannot be done, or null. */
  error: string | null
  /** Width and depth, in metres, of the part of the plot the layout uses. */
  needs: [number, number]
  /** Cost of building the copy. */
  build: number
  /** What the furniture cleared from the plot sells for. */
  resale: number
  /** What is charged: the build less the resale. Negative when the old fittings were worth more. */
  cost: number
  /** True when the plot already stands exactly as the copy would: there is nothing to rebuild and nothing to pay. */
  same: boolean
}

/**
 * Everything about how a plot is built, as text: two plots built alike give
 * the same text whatever their rooms are numbered and whatever ids their
 * furniture and walls carry.
 */
export function layoutSig(site: Site): string {
  const order = new Map<number, number>()
  const grid = site.grid.map((n) => {
    if (!n) return 0
    if (!order.has(n)) order.set(n, order.size + 1)
    return order.get(n)!
  })
  const pairs = (rec: Record<string, unknown> | undefined) => Object.entries(rec ?? {}).map(([k, v]) => `${k}=${v}`).sort()
  return JSON.stringify({
    plot: [site.kind, site.tier, site.w, site.h],
    grid,
    rooms: site.rooms.filter((r) => order.has(r.n)).map((r) => `${order.get(r.n)}:${r.type}:${r.style}`).sort(),
    walls: site.walls.map((w) => `${w.x},${w.y},${w.side}:${w.kind}`).sort(),
    cuts: pairs(site.cuts),
    curves: (site.curves ?? []).map((c) => [order.get(c.room) ?? 0, c.cx, c.cy, c.rx, c.ry, c.t ?? 0, c.from ?? 0, c.sweep ?? 360, pairs(c.walls), Object.keys(c.square ?? {}).sort()].join('|')).sort(),
    floor: pairs(site.floor),
    items: site.items.filter((it) => ITEMS[site.kind][it.kind]).map((it) => `${it.kind}:${it.x},${it.y}:${((it.rot % 4) + 4) % 4}`).sort(),
    look: [site.facade, site.roof, site.floors],
  })
}

/** Works out a copy of one store's layout on another plot, and what it would cost. `to` is the plot as it stands. */
function layoutPlan(s: GameState, from: Site, to: Site, charge = true): LayoutQuote & { site: Site | null } {
  const fail = (error: string, needs: [number, number] = [0, 0]) => ({ error, needs, build: 0, resale: 0, cost: 0, same: false, site: null })
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const reach = (x: number, y: number) => {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  for (let y = 0; y < from.h; y++) for (let x = 0; x < from.w; x++) if (from.grid[y * from.w + x]) reach(x, y)
  const items = from.items.filter((it) => ITEMS[from.kind][it.kind] && itemAllowed(to, it.kind))
  for (const it of items) for (const [x, y] of itemTiles(from, it)) reach(x, y)
  if (x0 > x1) return fail('That store has nothing built to copy')
  const needs: [number, number] = [x1 - x0 + 1, y1 - y0 + 1]
  if (needs[0] > to.w || needs[1] > to.h) return fail(`That layout takes up ${needs[0]} x ${needs[1]} m, and a ${tierOf(to).name.toLowerCase()} is only ${to.w} x ${to.h} m`, needs)
  const within = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  // centred from side to side, and as far from the street along the south edge as it was
  const dx = within(Math.floor((to.w - from.w) / 2), -x0, to.w - 1 - x1)
  const dy = within(to.h - from.h, -y0, to.h - 1 - y1)
  const site = newSite(to.kind, to.tier)
  transplant({ ...from, items }, site, dx, dy)
  tidy(site)
  // the plot already stands exactly so: nothing would be cleared, nothing built and nothing sold
  if (layoutSig(site) === layoutSig(to)) return { error: null, needs, build: 0, resale: 0, cost: 0, same: true, site }
  const build = layoutValue(site, { facade: to.facade, roof: to.roof, floors: to.floors })
  const resale = to.items.reduce((a, it) => a + (ITEMS[to.kind][it.kind]?.cost ?? 0) / 2, 0)
  const cost = build - resale
  const error = charge && cost > 0 && !canAfford(s, cost) ? `Not enough cash: copying that layout here costs ${dollars(cost)}` : null
  return { error, needs, build, resale, cost, same: false, site }
}

const storeOf = (s: GameState, id: string) => s.stores.find((st) => st.id === id)

/** What copying one store's layout onto another would cost, and whether it can be done. */
export function layoutQuote(s: GameState, fromId: string, toId: string): LayoutQuote {
  const from = storeOf(s, fromId)
  const to = storeOf(s, toId)
  const none: LayoutQuote = { error: 'There is no such store', needs: [0, 0], build: 0, resale: 0, cost: 0, same: false }
  if (!from || !to) return none
  if (from === to) return { ...none, error: 'That is this store' }
  const { site: _site, ...quote } = layoutPlan(s, from.site, to.site)
  return quote
}

/** The same for a store not yet opened, on a bare plot of the given tier. The plot itself is charged on top. */
export function newLayoutQuote(s: GameState, fromId: string, tier: number): LayoutQuote {
  const from = storeOf(s, fromId)
  if (!from || !SITE_TIERS.store[tier]) return { error: 'There is no such store', needs: [0, 0], build: 0, resale: 0, cost: 0, same: false }
  const { site: _site, ...quote } = layoutPlan(s, from.site, newSite('store', tier), false)
  return quote
}

/** Gives a copied plot ids of its own, so nothing on it shares one with the store it came from. */
function reissue(s: GameState, site: Site) {
  for (const it of site.items) it.id = `o${s.nextId++}`
  for (const w of site.walls) w.id = `w${s.nextId++}`
}

/** What copyLayout answers when the two stores are already built alike. */
export const SAME_LAYOUT = 'These two stores already have the same layout: there is nothing to rebuild, and nothing was charged.'

/**
 * Rebuild one store to another's layout: rooms, curved and slanted walls,
 * doors and glass, ground finishes, cladding, roof, storeys and every piece
 * of furniture. What stands on the plot now is cleared, its furniture sold
 * for half price as usual, and the copy is charged at what it would cost to
 * build by hand. Refused if the layout does not fit the plot or the money is
 * not there. Sales figures, name and location stay with the store. A store
 * that already stands exactly as the copy would is left alone, free of
 * charge, and the caller is told so.
 */
export function copyLayout(s: GameState, fromId: string, toId: string): string | null {
  const from = storeOf(s, fromId)
  const to = storeOf(s, toId)
  if (!from || !to) return 'There is no such store'
  if (from === to) return 'That is this store: pick another one to copy'
  const plan = layoutPlan(s, from.site, to.site)
  if (plan.error || !plan.site) return plan.error ?? 'That layout cannot be copied'
  if (plan.same) return SAME_LAYOUT
  spend(s, plan.build, 'facilities')
  s.cash += plan.resale
  s.cur.facilities -= plan.resale
  reissue(s, plan.site)
  plan.site.rev = to.site.rev + 1
  to.site = plan.site
  return null
}

export function upgradeOffice(s: GameState): string | null {
  const next = SITE_TIERS.office[s.office.tier + 1]
  if (!next) return 'This is the largest plot'
  if (!canAfford(s, next.cost)) return `Not enough cash: the ${next.name.toLowerCase()} costs ${dollars(next.cost)}`
  spend(s, next.cost, 'overhead')
  s.office = movePlot(s.office)
  news(s, 'finance', `The company moved to a bigger plot: ${next.name}. Everything was rebuilt there as it stood.`)
  return null
}

export function buildFactory(s: GameState): string | null {
  const lock = locked(s, 'factory')
  if (lock) return lock
  const tier = s.factory ? s.factory.tier + 1 : 0
  const def = SITE_TIERS.factory[tier]
  if (!def) return 'This is the largest factory site'
  if (!canAfford(s, def.cost)) return `Not enough cash: the ${def.name.toLowerCase()} costs ${dollars(def.cost)}`
  spend(s, def.cost, 'facilities')
  s.factory = s.factory ? movePlot(s.factory) : newSite('factory', 0)
  news(s, 'finance', `${tier ? 'The factory moved to a bigger site' : 'The company bought land for its first factory'}: ${def.name}.`)
  return null
}

/** Turn the factory's line blocks so outputs face inputs, where that makes more of the line run. Free: nothing moves. */
export function fixFactoryLayout(s: GameState): string | null {
  if (!s.factory) return 'Buy a factory site first'
  return fixLayout(s.factory) ? null : 'Turning blocks would not make more of the line run: move or add blocks instead'
}

/** Build a production hall with a standard line in it. */
export function autoLine(s: GameState): string | null {
  const site = s.factory
  if (locked(s, 'factory')) return locked(s, 'factory')
  if (!site) return 'Buy a factory site first'
  const plan = starterLine(site)
  if (!plan) return 'There is no room: the starter hall needs a clear strip 16 by 6 in the middle of the plot'
  const fresh = zoneable(site, ...plan.hall, 'rect').length
  const cost = plan.items.reduce((a, p) => a + ITEMS.factory[p.kind].cost, 0) + roomCost(site, 'hall', fresh)
  if (!canAfford(s, cost)) return `Not enough cash: the hall and line cost ${dollars(cost)}`
  if (fresh) {
    const err = zoneRoom(s, 'factory', 'hall', ...plan.hall)
    if (err) return err
  }
  for (const p of plan.items) {
    const err = placeItem(s, 'factory', p.kind, p.x, p.y, p.rot)
    if (err) return err
  }
  return null
}

/**
 * Open a store. It comes with a sales floor and the minimum it needs to
 * trade, or, with `layoutFrom`, fitted out as a copy of the store with that
 * id, charged on top of the plot at what the copy would cost to build.
 */
export function openStore(s: GameState, tier: number, region?: string, layoutFrom?: string): string | null {
  const def = whole(tier) ? SITE_TIERS.store[tier] : undefined
  if (!def) return 'There is no such kind of store location'
  const lock = locked(s, 'stores')
  if (lock) return lock
  const where = region ?? homeRegion(s)
  if (!isRegion(where)) return 'There is no such region'
  if (!s.regions[where]?.open) return `You do not sell in ${regionInfo(where).name} yet. Enter the region first, under Regions.`
  const model = layoutFrom ? storeOf(s, layoutFrom) : undefined
  if (layoutFrom && !model) return 'There is no such store to copy'
  const plan = model ? layoutPlan(s, model.site, newSite('store', tier), false) : null
  if (plan && (plan.error || !plan.site)) return plan.error ?? 'That layout cannot be copied'
  const total = def.cost + (plan?.cost ?? 0)
  if (!canAfford(s, total)) return plan ? `Not enough cash: the plot and the fit-out come to ${dollars(total)}` : `Not enough cash: a ${def.name.toLowerCase()} costs ${dollars(total)}`
  spend(s, total, 'facilities')
  const free = regionInfo(where).cities.filter((c) => !s.stores.some((st) => st.name === c))
  let site = newSite('store', tier)
  if (plan?.site) {
    site = plan.site
    reissue(s, site)
  } else {
    // a new store opens with a sales floor and the minimum it needs to trade
    const { room } = zone(site, 'sales', areaTiles(1, 1, site.w - 2, site.h - 3))
    if (room) autoDoor(site, room.n)
    site.items.push({ id: `o${s.nextId++}`, kind: 'table', x: 3, y: 3, rot: 0 }, { id: `o${s.nextId++}`, kind: 'counter', x: site.w - 3, y: 2, rot: 0 })
  }
  const store = { id: `s${s.nextId++}`, name: free.length ? pick(s, free) : `${regionInfo(where).name} ${s.stores.length + 1}`, location: def.name, region: where, site, openedDay: s.day, unitsTotal: 0, monthUnits: 0, lastVisitors: 0 }
  s.stores.push(store)
  news(s, 'finance', `A new store opened: ${store.name} (${def.name.toLowerCase()}, ${regionInfo(where).name}).`)
  return null
}

/** Close a store for good. Its fittings are sold for half their price, as furniture always is; the plot and the building are given up. */
export function closeStore(s: GameState, storeId: string) {
  const store = storeOf(s, storeId)
  if (!store) return
  const back = store.site.items.reduce((a, it) => a + (ITEMS.store[it.kind]?.cost ?? 0) / 2, 0)
  s.cash += back
  s.cur.facilities -= back
  s.stores = s.stores.filter((st) => st !== store)
  news(s, 'finance', `The ${store.name} store closed.${back > 0 ? ` Its fittings were sold for ${dollars(back)}.` : ''}`)
}

export function buildVenue(s: GameState): string | null {
  const lock = locked(s, 'venue')
  if (lock) return lock
  const tier = s.venue ? s.venue.tier + 1 : 0
  const def = SITE_TIERS.venue[tier]
  if (!def) return 'This is the largest venue site'
  if (!canAfford(s, def.cost)) return `Not enough cash: the ${def.name.toLowerCase()} costs ${dollars(def.cost)}`
  spend(s, def.cost, 'facilities')
  s.venue = s.venue ? movePlot(s.venue) : newSite('venue', 0)
  news(s, 'finance', `${tier ? 'Your venue moved to a bigger site' : 'The company bought land for a venue of its own'}: ${def.name}.`)
  return null
}

/** A ready-made venue on the plot as it stands, with the building's own cladding and roof and enough storeys for the rig. */
function presetPlan(s: GameState, preset: VenuePreset) {
  const none = { error: 'Buy a venue site first', needs: [0, 0] as [number, number], build: 0, resale: 0, cost: 0, same: false, site: null }
  const lock = locked(s, 'venue')
  if (lock) return { ...none, error: lock }
  const to = s.venue
  if (!to) return none
  const def = VENUE_PRESETS[preset]
  if (!def) return { ...none, error: 'There is no such layout' }
  if (to.tier < def.tier) return { ...none, error: `The ${def.name.toLowerCase()} needs at least the ${SITE_TIERS.venue[def.tier].name.toLowerCase()}` }
  const from = venueLayout(preset, to.tier)
  from.facade = to.facade
  from.roof = to.roof
  from.floors = Math.max(from.floors, to.floors)
  return layoutPlan(s, from, to)
}

/** What laying out a ready-made venue here would cost: the build, less what the fittings now standing sell for. */
export function venuePresetQuote(s: GameState, preset: VenuePreset): LayoutQuote {
  const { site: _site, ...quote } = presetPlan(s, preset)
  return quote
}

/** Clear the venue plot and build a ready-made venue on it: small hall, theatre or arena. */
export function applyVenuePreset(s: GameState, preset: VenuePreset): string | null {
  const plan = presetPlan(s, preset)
  if (plan.error || !plan.site || !s.venue) return plan.error ?? 'That layout cannot be built here'
  if (plan.same) return 'The venue already stands exactly so'
  spend(s, plan.build, 'facilities')
  s.cash += plan.resale
  s.cur.facilities -= plan.resale
  reissue(s, plan.site)
  plan.site.rev = s.venue.rev + 1
  s.venue = plan.site
  news(s, 'event', `Your venue was rebuilt as ${preset === 'arena' ? 'an' : 'a'} ${VENUE_PRESETS[preset].name.toLowerCase()} with ${venueStats(s.venue).seats.toLocaleString('en-US')} seats.`)
  return null
}

/** Raise a venue's roof to the storeys its rigging needs to stand at full height. */
export function raiseVenueRoof(s: GameState): string | null {
  if (!s.venue) return 'Buy a venue site first'
  const want = rigFloors(s.venue)
  if (!want) return 'The rigging already fits under the roof'
  return setLook(s, 'venue', { floors: Math.min(MAX_FLOORS, want) })
}

/** A simple open-air stage with seating, for players who want a working venue quickly. */
export function autoVenue(s: GameState): string | null {
  const site = s.venue
  if (locked(s, 'venue')) return locked(s, 'venue')
  if (!site) return 'Buy a venue site first'
  if (site.items.length) return 'Clear the plot first: the starter layout needs open ground'
  const cx = Math.floor(site.w / 2)
  const plan: { kind: string; x: number; y: number; rot: number }[] = [
    { kind: 'screen', x: cx - 3, y: 1, rot: 0 },
    { kind: 'stage', x: cx - 3, y: 2, rot: 0 },
    { kind: 'lights', x: cx - 5, y: 2, rot: 0 },
    { kind: 'lights', x: cx + 4, y: 2, rot: 0 },
    { kind: 'speakers', x: cx - 5, y: 4, rot: 0 },
    { kind: 'speakers', x: cx + 4, y: 4, rot: 0 },
  ]
  for (let row = 0; row < 3; row++) for (let col = -2; col < 2; col++) plan.push({ kind: row === 0 ? 'seats' : row === 1 ? 'seats_mid' : 'seats_high', x: cx + col * 3, y: 8 + row * 2, rot: 0 })
  const cost = plan.reduce((a, p) => a + ITEMS.venue[p.kind].cost, 0)
  if (!canAfford(s, cost)) return `Not enough cash: the starter layout costs ${dollars(cost)}`
  for (const p of plan) {
    const err = placeItem(s, 'venue', p.kind, p.x, p.y, p.rot)
    if (err) return err
  }
  return null
}

// ---------------------------------------------------------------- supply, marketing, events

export function lockSupply(s: GameState, cat: SupplyCat): string | null {
  const shut = locked(s, 'factory')
  if (shut) return shut
  if (!SUPPLY_CATS.includes(cat)) return 'There is no such kind of component'
  const lock = s.supply.locks[cat]
  if (lock && lock.until > s.day) return `That price is already fixed until ${fmtDate(lock.until)}`
  if (!canAfford(s, LOCK_FEE)) return `Not enough cash: a supply contract costs ${dollars(LOCK_FEE)}`
  spend(s, LOCK_FEE, 'production')
  s.supply.locks[cat] = { value: marketPrice(s.supply, cat), until: s.day + LOCK_DAYS }
  return null
}

export function startCampaign(s: GameState, channel: ChannelId, target: string, monthly: number, region?: string): string | null {
  if (!lists(CHANNELS, channel)) return 'There is no such advertising channel'
  const lock = locked(s, 'marketing') ?? locked(s, capOfChannel(channel))
  if (lock) return lock
  if (region !== undefined && !isRegion(region)) return 'There is no such region'
  if (region && !s.regions[region]?.open) return `You do not sell in ${regionInfo(region).name} yet. Enter the region first, under Regions.`
  const def = CHANNELS[channel]
  if (!num(monthly) || monthly < def.min) return `${def.name} needs at least $${def.min.toLocaleString('en-US')} a month`
  if (monthly > MAX_CAMPAIGN) return `A campaign can spend at most ${dollars(MAX_CAMPAIGN)} a month`
  if (target !== 'brand' && !ownProducts(s).some((p) => p.id === target && p.status !== 'ended')) return 'Pick a device of yours that is in development or on sale to advertise, or advertise the brand'
  if (s.campaigns.some((c) => c.channel === channel && c.target === target && c.region === region)) return 'That campaign is already running. Change its budget instead.'
  s.campaigns.push({ id: `c${s.nextId++}`, channel, target, monthly: Math.round(monthly), startedDay: s.day, spent: 0, region })
  return null
}

/** The most one campaign can spend in a month. */
export const MAX_CAMPAIGN = 1e9

export function stopCampaign(s: GameState, campaignId: string) {
  s.campaigns = s.campaigns.filter((c) => c.id !== campaignId)
}

/** Change what a campaign spends each month, kept within what its channel takes. */
export function setCampaignBudget(s: GameState, campaignId: string, monthly: number) {
  const c = s.campaigns.find((x) => x.id === campaignId)
  if (c && num(monthly)) c.monthly = clamp(Math.round(monthly), CHANNELS[c.channel].min, MAX_CAMPAIGN)
}

/** The furthest ahead a meetup or a conference can be booked, in days. */
export const MAX_EVENT_LEAD = 720

export function scheduleEvent(s: GameState, type: EventType, venue: number, productId?: string, daysAhead = 30): string | null {
  if (!lists(EVENTS, type)) return 'There is no such kind of event'
  if (!whole(venue)) return 'Pick a venue'
  const blocked = locked(s, 'events') ?? eventBlocked(s, type, venue, productId)
  if (blocked) return blocked
  const v = EVENTS[type].venues[venue]
  if (!canAfford(s, v.cost)) return `Not enough cash: the ${v.name.toLowerCase()} costs ${dollars(v.cost)}`
  const product = s.products.find((p) => p.id === productId)
  const lead = clamp(num(daysAhead) ? Math.round(daysAhead) : 30, EVENT_LEAD, MAX_EVENT_LEAD)
  const day = type === 'keynote' ? s.day + (product?.devDaysLeft ?? 0) : type === 'expo' ? nextFair(s.day).day : s.day + lead
  spend(s, v.cost, 'marketing')
  s.events.push({ id: `v${s.nextId++}`, type, venue, day, productId: type === 'keynote' ? productId : undefined, cost: v.cost, done: false })
  return null
}

// ---------------------------------------------------------------- chips and software

export function startChip(s: GameState, name: string, power: number, graphics: number, efficiency: number): string | null {
  if (typeof name !== 'string') return 'Name the chip'
  if (![power, graphics, efficiency].every((v) => num(v) && v >= 0 && v <= 1)) return 'Each of the three design sliders runs from 0 to 1'
  const blocked = locked(s, 'labs') ?? chipBlocked(s, name, power, graphics, efficiency)
  if (blocked) return blocked
  const gen = s.levels.chipset
  const cost = chipProjectCost(gen)
  if (!canAfford(s, cost)) return `Not enough cash: a chip project costs ${dollars(cost)}`
  spend(s, cost, 'development')
  s.chips.push({ id: `h${s.nextId++}`, name: named(name), gen, power, graphics, efficiency, status: 'dev', devDaysLeft: chipProjectDays(s), quality: 1, licenceFee: 0, licenceIncome: 0 })
  return null
}

export function setLicenceFee(s: GameState, chipId: string, fee: number) {
  const c = s.chips.find((x) => x.id === chipId)
  if (c && num(fee)) c.licenceFee = clamp(Math.round(fee), 0, MAX_LICENCE_FEE)
}
/** The most a chip licence can ask per unit. Far above anything a rival would pay. */
export const MAX_LICENCE_FEE = 1000

/** Start the first version of an in-house OS, or the next one. */
export function startOs(s: GameState, name: string, features: string[]): string | null {
  // only features that exist, each once: a list with the same one twice asks for one
  const wanted = [...new Set(Array.isArray(features) ? features : [])].filter((f) => OS_FEATURES.some((x) => x.id === f))
  const blocked = locked(s, 'labs') ?? osBlocked(s, wanted)
  if (blocked) return blocked
  const first = !s.os.own
  if (first && !named(name)) return 'Name your operating system'
  const all = [...new Set([...s.os.features, ...wanted])]
  const cost = osProjectCost(first, all.length - s.os.features.length)
  if (!canAfford(s, cost)) return `Not enough cash: this version costs ${dollars(cost)}`
  spend(s, cost, 'development')
  const total = osProjectDays(s, first)
  if (first) s.os.name = named(name)
  s.os.project = { daysLeft: total, total, features: all, first }
  return null
}

// ---------------------------------------------------------------- tick

const STARTUP_NAMES = ['Nothin', 'Fairfone', 'Tecnu', 'Vevo', 'Realmi', 'Honr', 'Motorolla', 'Oppa']

function stepRivals(s: GameState) {
  for (const c of s.companies) {
    if (c.isPlayer || !c.alive) continue
    for (const seg of c.segments) {
      if (s.day >= (c.nextLaunch[seg] ?? 0)) {
        rivalLaunch(s, c, seg)
        c.counter += c.segments.indexOf(seg) === 0 ? 1 : 0
      }
    }
  }
}

function stepProjects(s: GameState) {
  const c = player(s)
  for (const p of s.products) {
    if (p.companyId !== 'player' || p.status !== 'dev') continue
    if (--p.devDaysLeft > 0) continue
    const ev = evaluate(p.design, s.levels, marketLevel(s.day), s.features, s.chips)
    p.raw = ev.raw
    // designers polish the product before it ships
    p.raw.design *= 1 + staffEffects(s).polish
    p.designPct = ev.report.pct
    release(s, p, c, ev.report.issues.filter((i) => i.level === 'warn').map((i) => i.text))
    addAwareness(s, 1 - Math.exp(-p.marketing / 25e6))
    news(s, 'review', `${p.name} is on sale. Review average ${p.reviewAvg.toFixed(1)} / 10.`, p.id)
    if (p.stock <= 0) news(s, 'alert', `${p.name} launched with nothing in stock. Order a production run.`, p.id)
  }
  for (const chip of s.chips) {
    if (chip.status !== 'dev' || --chip.devDaysLeft > 0) continue
    finishChip(s, chip)
    news(s, 'research', `Your ${chip.name} chip is ready. It can now be chosen in the designer.`)
  }
  const proj = s.os.project
  if (proj && --proj.daysLeft <= 0) {
    s.os.own = true
    s.os.version++
    s.os.features = proj.features
    s.os.quality = osShipQuality(s, proj.features)
    s.os.project = undefined
    news(s, 'research', `${s.os.name} ${s.os.version} shipped to every device you sell.`)
  }
}

function stepEvents(s: GameState) {
  for (const e of s.events) {
    if (e.done || e.day > s.day) continue
    news(s, 'event', resolveEvent(s, e), e.productId)
  }
  if (s.events.length > 40) s.events = s.events.filter((e) => !e.done || s.day - e.day < 720)
}

function stepCampaigns(s: GameState) {
  const gain = DIFFICULTY[s.config.difficulty].awareness
  // what the marketing team adds is the same for every campaign today: worked out once, when the first one runs
  let skill: number | undefined
  for (const p of ownProducts(s)) for (const k of Object.keys(p.buzz)) p.buzz[k] *= 1 - BUZZ_DECAY
  for (const c of [...s.campaigns]) {
    const product = c.target === 'brand' ? undefined : s.products.find((p) => p.id === c.target)
    if (c.target !== 'brand' && (!product || product.status === 'ended')) {
      s.campaigns = s.campaigns.filter((x) => x !== c)
      continue
    }
    const daily = c.monthly / DAYS_PER_MONTH
    if (!canAfford(s, daily)) continue
    spend(s, daily, 'marketing')
    c.spent += daily
    addAwareness(s, campaignDay(s, c, daily, product, (skill ??= staffEffects(s).marketing)) * gain, c.region)
  }
}

/**
 * Records a sale. `direct` sales through your own stores keep the retailer's
 * cut; `keep` is the share of the price left after local pricing and duties.
 */
function sell(s: GameState, p: Product, c: Company, units: number, segment: string, direct = false, keep = 1): number {
  if (units <= 0) return 0
  if (c.isPlayer) units = Math.min(units, p.stock)
  if (units <= 0) return 0
  const avg = tierAverages(p)
  const income = units * avg.price * keep * (direct ? 1 : 1 - RETAIL_CUT)
  p.unitsSold += units
  p.revenue += income
  p.monthUnits += units
  p.segUnits[segment] = (p.segUnits[segment] ?? 0) + units
  c.unitsTotal += units
  c.revenueTotal += income
  s.monthShare[c.id] = (s.monthShare[c.id] ?? 0) + units
  if (c.isPlayer) {
    p.stock -= units
    earn(s, income)
    s.cur.units += units
    // bigger storage options cost a little more to build; faulty units are repaired under warranty
    const repairs = units * p.defectRate * p.unitCost * warrantyLoad(s)
    spend(s, units * avg.extraCost + repairs, 'production')
    s.care.month.repairs += units * p.defectRate
    s.care.month.repairCost += repairs
    // console makers earn a licence fee on the games each machine will sell
    if (p.type === 'console') earn(s, units * GAME_ROYALTY, 'other')
    else if (p.type === 'handheld') earn(s, units * HANDHELD_ROYALTY, 'other')
    else if (p.type === 'speaker') earn(s, units * SPEAKER_SERVICES, 'other')
    if (p.stock === 0) {
      p.carry = 0
      // said once for each time it runs dry: a line that sells each day's delivery by evening is still the same shortage
      if (p.soldOut === undefined) news(s, 'alert', `${p.name} is sold out. Order more units to keep selling.`, p.id)
      p.soldOut = p.soldOut ?? s.day
    }
  } else c.revMonth = (c.revMonth ?? 0) + income
  return units
}

function stepSales(s: GameState) {
  const me = player(s)
  const onSale = s.products.filter((p) => p.status === 'sale')
  const companies = new Map(s.companies.map((c) => [c.id, c]))
  const fx = staffEffects(s)
  const top = execFx(s)
  const gain = DIFFICULTY[s.config.difficulty].awareness * fx.marketing
  const home = homeRegion(s)
  const regionUnits: Record<string, number> = {}
  /** Sales weighted by how much each one gets the company noticed. */
  const regionTalk: Record<string, number> = {}
  let mineToday = 0

  // ---- every segment in every region chooses between everything on sale for its device type
  for (const seg of SEGMENTS) {
    const pool = onSale.filter((p) => p.type === seg.type)
    if (!pool.length) continue
    const demand = segmentDemand(seg, s.day) * typeDemand(seg.type) * (seg.sens > 1.9 ? Math.sqrt(economyNow(s)) : economyNow(s))
    const makers = pool.map((p) => companies.get(p.companyId)!)
    const base = pool.map((p, i) => (!hasStock(p) ? 0 : pull(p, makers[i], seg, s.day)))
    const hype = pool.map((p) => launchHype(p, s.day))
    const alloc = pool.map(() => 0)
    const kept = pool.map(() => 0)
    for (const r of REGIONS) {
      const st = s.regions[r.id]
      const weights = pool.map((p, i) => {
        if (base[i] <= 0) return 0
        if (!makers[i].isPlayer) return base[i] * Math.min(1, makers[i].awareness + hype[i]) * rivalReach(makers[i], r.id)
        if (!st.open) return 0
        // a local price above or below list changes how the device compares here
        const local = st.priceAdj === 1 ? 1 : Math.pow(priceFactor(p.price * st.priceAdj, seg) / priceFactor(p.price, seg), 3.5)
        return base[i] * Math.min(1, st.awareness + hype[i]) * local
      })
      const total = weights.reduce((a, w) => a + w, OUTSIDE_OPTION)
      const buyers = demand * r.share * regionTaste(r, seg)
      pool.forEach((_, i) => {
        if (weights[i] <= 0) return
        const units = (buyers * weights[i]) / total
        alloc[i] += units
        if (makers[i].isPlayer) {
          kept[i] += units * regionIncome(s, r.id)
          regionUnits[r.id] = (regionUnits[r.id] ?? 0) + units
          regionTalk[r.id] = (regionTalk[r.id] ?? 0) + units * clamp(pool[i].price / 350, 0.8, 1.5)
        }
      })
    }
    pool.forEach((p, i) => {
      if (alloc[i] <= 0) return
      p.carry += alloc[i] * range(s, 0.9, 1.1)
      const whole = Math.floor(p.carry)
      if (whole <= 0) return
      const c = makers[i]
      const sold = sell(s, p, c, whole, seg.id, false, c.isPlayer ? kept[i] / alloc[i] : 1)
      p.carry -= Math.min(p.carry, whole)
      if (c.isPlayer) mineToday += sold
    })
  }

  const mine = onSale.filter((p) => p.companyId === 'player' && p.stock > 0)
  const draw = (p: Product) => clamp(bestSegment(p, me, s.day).u, 0, 1.3) * lifecycle(s.day - p.launchDay)

  // ---- fans buy again, and line up for anything new
  let refurbishing: boolean | undefined
  if (s.fans > 0 && mine.length) {
    const w = mine.map((p) => draw(p) * (s.day - p.launchDay <= 45 ? 3 : 1))
    const total = w.reduce((a, b) => a + b, 0)
    const buyers = (s.fans / FAN_CYCLE) * Math.min(1, total / mine.length) * (s.care.tradeIn ? TRADE_PULL : 1)
    mine.forEach((p, i) => {
      if (total <= 0) return
      p.carry += (buyers * w[i]) / total
      const whole = Math.floor(p.carry)
      if (whole <= 0) return
      const sold = sell(s, p, me, whole, p.segment ?? 'fans')
      mineToday += sold
      regionUnits[home] = (regionUnits[home] ?? 0) + sold
      p.carry -= Math.min(p.carry, whole)
      if (s.care.tradeIn && sold) {
        // the old device comes back as credit; refurbished, it is sold on
        spend(s, sold * p.price * TRADE_CREDIT, 'marketing')
        s.care.month.tradeIns += sold
        // refurbishing stops paying when the last workshop that could do it is gone
        if (s.care.refurb && (refurbishing ??= canRefurb(s))) {
          const back = sold * p.price * REFURB_RETURN
          earn(s, back, 'other')
          s.care.month.refurbIncome += back
        }
      }
    })
  }

  // ---- your own stores sell direct, at full price
  let storeSupport = 0
  for (const st of s.stores) {
    const stats = storeStats(st.site)
    const def = tierOf(st.site)
    const local = s.regions[st.region] ?? s.regions[home]
    spend(s, ((upkeep(st.site) + stats.wages) / DAYS_PER_MONTH) * top.outposts, 'facilities')
    if (stats.hasSupport) storeSupport++
    st.lastVisitors = 0
    if (!stats.open) continue
    const visitors = Math.min(stats.capacity, (def.traffic ?? 0) * (0.35 + 0.65 * Math.sqrt(local.awareness))) * (0.6 + 0.4 * stats.appeal)
    st.lastVisitors = Math.round(visitors)
    addAwareness(s, (visitors / 3e6) * gain, st.region)
    const stocked = mine.filter((p) => p.stock > 0)
    if (!stocked.length) continue
    const w = stocked.map(draw)
    const total = w.reduce((a, b) => a + b, 0)
    if (total <= 0) continue
    const buyers = visitors * 0.035 * stats.appeal * Math.min(1.2, total / stocked.length)
    stocked.forEach((p, i) => {
      const units = Math.floor((buyers * w[i]) / total + rand(s))
      const sold = sell(s, p, me, units, p.segment ?? 'store', true, regionIncome(s, st.region))
      if (!sold) return
      mineToday += sold
      regionUnits[st.region] = (regionUnits[st.region] ?? 0) + sold
      st.unitsTotal += sold
      st.monthUnits += sold
      // accessories ride along with each device sold
      earn(s, sold * 6 * Math.min(stats.shelves, 3))
    })
  }

  // ---- owners, fans and how they feel
  const tickets = dailyTickets(s)
  const supportGap = tickets > 0 ? clamp(1 - (fx.support + 20) / tickets, 0, 1) : 0
  me.software = softwareBonus(s) + careBonus(s)
  const longUpdates = s.os.own && s.os.features.includes('updates')
  const cared = careSatisfaction(s)
  let weight = 0
  let mood = 0
  for (const p of onSale) {
    if (p.companyId !== 'player') continue
    p.satisfaction = clamp(productSatisfaction(p, me.software, supportGap, storeSupport, longUpdates) + cared - (p.recall?.state === 'open' ? 0.1 : p.recall?.state === 'ignored' ? 0.2 : 0), 0, 1)
    p.unitCost = Math.round(costNow(s, p.costParts) * 100) / 100
    // the day ended with some left: the shortage, if there was one, is over
    if (p.stock > 0) delete p.soldOut
    weight += p.monthUnits + 1
    mood += p.satisfaction * (p.monthUnits + 1)
    if (s.day % 7 === 0 && p.unitsSold > 0) {
      p.feedback.unshift(makeFeedback(s, p, me, s.day, supportGap))
      if (p.feedback.length > 14) p.feedback.length = 14
    }
  }
  const sat = weight ? mood / weight : 0.6
  s.owners += mineToday - s.owners * 0.0009
  s.fans = Math.max(0, s.fans + mineToday * Math.max(0, sat - 0.55) * 1.2 - s.fans * (sat < 0.4 ? 0.003 : 0.0007))

  // ---- being seen: every sale makes the next one easier, region by region
  for (const r of REGIONS) {
    const st = s.regions[r.id]
    if (!st.open) continue
    const units = regionUnits[r.id] ?? 0
    st.monthUnits += units
    st.awareness = clamp(st.awareness + (1 - st.awareness) * ((Math.max(units, regionTalk[r.id] ?? 0) / (4.5e6 * r.share)) * gain + s.fans / 4e7), 0, 1)
  }
  me.awareness = worldAwareness(s)

  // ---- after-sales: updates for old devices and the care plan
  const care = stepCare(s, sat)
  if (care.updates) spend(s, care.updates, 'development')
  if (care.planCost) spend(s, care.planCost, 'production')
  if (care.planIncome) earn(s, care.planIncome, 'other')
}

function stepResearch(s: GameState) {
  if (!s.activeResearch.length || s.rdBudget <= 0) return
  const daily = s.rdBudget / DAYS_PER_MONTH
  if (!canAfford(s, daily)) return
  spend(s, daily, 'rd')
  const each = (daily * s.config.researchSpeed * staffEffects(s).research) / s.activeResearch.length
  for (const id of [...s.activeResearch]) {
    const item = researchItem(s, id)
    if (item.done || !item.available) {
      s.activeResearch = s.activeResearch.filter((x) => x !== id)
      continue
    }
    s.progress[id] = (s.progress[id] ?? 0) + each
    if (s.progress[id] < item.cost) continue
    if (id.startsWith('f:')) {
      s.progress[id] = 0
      s.features.push(id.slice(2))
      s.activeResearch = s.activeResearch.filter((x) => x !== id)
      news(s, 'research', `Research complete: ${item.name}.`)
    } else {
      const t = id as Track
      s.progress[id] -= item.cost
      s.levels[t]++
      news(s, 'research', `Research complete: ${TRACK_INFO[t].name} level ${s.levels[t]} (${TRACK_INFO[t].unlocks[s.levels[t]]}).`)
      // the track keeps going to its next level unless that one is blocked
      if (!researchItem(s, id).available) {
        s.progress[id] = 0
        s.activeResearch = s.activeResearch.filter((x) => x !== id)
      }
    }
  }
}

function stepOperations(s: GameState) {
  for (const n of stepSupply(s)) {
    news(s, n.started ? 'alert' : 'finance', n.started ? `Shortage: ${SUPPLY_LABELS[n.cat].toLowerCase()} prices are climbing.` : `The ${SUPPLY_LABELS[n.cat].toLowerCase()} shortage is easing.`)
  }
  const had = s.orders.length
  const res = stepProduction(s, (amount) => canAfford(s, amount))
  // a Head of Operations gets a better price out of suppliers
  if (res.cost) spend(s, res.cost * execFx(s).production, 'production')
  if (res.runCost) spend(s, res.runCost, 'facilities')
  // said when it stops, and not again until it has gone a month without stopping: a company at the end of its
  // credit starts and stops every few days as the takings come in, and that is one trouble, not twenty
  if (res.stalled) {
    const told = (s.told ??= {})
    if (told.stalled === undefined || s.day - told.stalled > DAYS_PER_MONTH) news(s, 'alert', 'Production is paused: there is not enough cash to pay for it. It carries on by itself when there is.')
    told.stalled = s.day
  }
  for (const id of new Set(res.finished)) {
    const p = s.products.find((x) => x.id === id)
    if (p && !s.orders.some((o) => o.productId === id)) news(s, 'launch', `Production run finished for ${p.name}. ${thousands(p.stock)} in stock.`, id)
  }
  if (s.factory) spend(s, upkeep(s.factory) / DAYS_PER_MONTH, 'facilities')
  if (s.venue) spend(s, upkeep(s.venue) / DAYS_PER_MONTH, 'facilities')
  void had
}

function stepFinance(s: GameState) {
  const d = DIFFICULTY[s.config.difficulty]
  const selling = ownProducts(s).filter((p) => p.status !== 'ended').length
  const top = execFx(s)
  spend(s, ((40e3 + 15e3 * selling) * d.overhead * top.overhead + upkeep(s.office) + regionOverheads(s) * top.outposts) / DAYS_PER_MONTH, 'overhead')
  if (s.staff.length) spend(s, (monthlySalaries(s) + perksCost(s)) / DAYS_PER_MONTH, 'salaries')
  stepStock(s)
  if (s.config.unlimitedMoney) return
  if (s.cash < 0) {
    spend(s, (-s.cash * 0.12) / DAYS_PER_YEAR, 'interest')
    s.debtDays++
    if (s.debtDays === 30) news(s, 'alert', 'The company is in debt. Bankruptcy follows if it is not cleared.')
    if (s.debtDays > d.debtDays) {
      s.gameOver = true
      s.overReason = 'bankrupt'
      news(s, 'alert', `${player(s).name} is bankrupt.`)
    }
  } else s.debtDays = 0
}

function closeMonth(s: GameState) {
  const month = Math.floor(s.day / DAYS_PER_MONTH) - 1

  // ---- income that is settled monthly
  const rivalUnits = s.companies.filter((c) => !c.isPlayer).reduce((a, c) => a + (s.monthShare[c.id] ?? 0), 0)
  for (const chip of s.chips) {
    const income = rivalUnits * chipAdoption(s, chip) * chip.licenceFee
    if (income > 0) {
      chip.licenceIncome += income
      earn(s, income, 'other')
    }
  }
  const services = servicesPerMonth(s)
  if (services > 0) {
    s.os.servicesIncome += services
    earn(s, services, 'other')
  }

  const stakes = holdingIncome(s)
  if (stakes > 0) earn(s, stakes, 'other')

  // ---- shareholders, the board, and anything owners are still waiting on
  const profit = s.cur.revenue + s.cur.other - monthCosts(s.cur)
  const canOust = !s.config.unlimitedMoney && s.config.difficulty !== 'relaxed'
  const market = monthlyStock(s, profit, canOust)
  if (market.dividend > 0) fund(s, -market.dividend)
  for (const n of market.notes) {
    news(s, n.alert ? 'alert' : 'finance', n.text)
    if (n.ousted) {
      s.gameOver = true
      s.overReason = 'ousted'
    }
  }
  for (const n of checkRecalls(s)) news(s, 'alert', n.text, n.productId)
  for (const n of rivalStrategy(s, (id) => endProduct(s, s.products.find((p) => p.id === id)!))) news(s, 'rival', n.text)
  // something happens; anything left undecided for a month takes its second option
  for (const i of s.incidents) if (!i.done && s.day - i.day >= INCIDENT_WAIT) decide(s, i.id, Math.min(1, INCIDENTS[i.kind].choices(s, i).length - 1))
  const incident = rollIncident(s)
  if (incident) news(s, 'alert', `${INCIDENTS[incident.kind].title}: ${INCIDENTS[incident.kind].text(s, incident)}`)
  closeCareMonth(s)
  for (const r of REGIONS) {
    const st = s.regions[r.id]
    st.history.push(Math.round(st.monthUnits))
    if (st.history.length > 36) st.history.shift()
    st.monthUnits = 0
  }

  s.cur.cash = s.cash
  s.reports.push(s.cur)
  if (s.reports.length > 240) s.reports.shift()
  s.cur = emptyReport(month + 1)
  s.shareHistory.push({ month, units: s.monthShare })
  if (s.shareHistory.length > 120) s.shareHistory.shift()
  const total = Object.values(s.monthShare).reduce((a, b) => a + b, 0) || 1
  for (const c of s.companies) {
    const units = s.monthShare[c.id] ?? 0
    c.unitsYear.push(units)
    if (c.unitsYear.length > 12) c.unitsYear.shift()
    if (c.isPlayer || !c.alive) continue
    c.weakMonths = units / total < 0.002 ? c.weakMonths + 1 : Math.max(0, c.weakMonths - 1)
    if (c.weakMonths >= 24) {
      c.alive = false
      for (const p of s.products) if (p.companyId === c.id && p.status === 'sale') endProduct(s, p)
      news(s, 'rival', `${c.name} has gone bankrupt and left the market.`)
    }
  }
  s.monthShare = {}
  for (const p of s.products) {
    if (p.status === 'ended' && p.monthUnits === 0) continue
    // a rival whose device has stopped selling cuts its price
    if (p.companyId !== 'player' && p.status === 'sale' && p.history.length >= 3 && p.monthUnits < 0.4 * Math.max(...p.history) && p.price * (1 - RETAIL_CUT) > p.unitCost * 1.25) p.price = roundPrice(p.price * 0.94)
    p.history.push(p.monthUnits)
    if (p.history.length > 60) p.history.shift()
    p.monthUnits = 0
  }
  for (const st of s.stores) st.monthUnits = 0
  // drop long-dead rival products so saves stay small
  s.products = s.products.filter((p) => p.companyId === 'player' || p.status !== 'ended' || s.day - (p.endDay ?? s.day) < 720)

  for (const n of monthlyStaff(s)) news(s, 'staff', n.text)
  refreshCandidates(s)
  refreshExecs(s)

  const alive = s.companies.filter((c) => !c.isPlayer && c.alive)
  const used = new Set(s.companies.map((c) => c.name))
  const names = s.config.parody ? STARTUP_NAMES : STARTUPS
  let free = names.filter((n) => !used.has(n))
  // when every name has been taken (a long game in which the player keeps buying the newcomers), the next
  // generation takes the old names with a number: the market never runs out of people willing to try
  for (let n = 2; !free.length && n < 1000; n++) free = names.map((x) => `${x} ${n}`).filter((x) => !used.has(x))
  if (alive.length < 9 && free.length && rand(s) < 0.08) {
    const name = pick(s, free)
    const segs = [pick(s, SEGMENTS).id]
    const c = makeCompany(`r${s.nextId++}`, { name, color: pick(s, ['#b08d57', '#5a9bd4', '#9c6ade', '#58b368', '#d46a6a']), brand: 0.5, awareness: 0.25, techOffset: range(s, -0.6, 0.2), priceMult: range(s, 0.85, 1.05), software: 0, segments: segs, layout: int(s, 0, 4), palette: ['#17191d', '#d8d8dc', '#3f5870'], series: { [segs[0]]: 'Model' }, counter: 1 })
    c.origin = name
    s.companies.push(c)
    c.nextLaunch[segs[0]] = s.day + int(s, 5, 60)
    news(s, 'rival', `A new company, ${name}, has entered the ${TYPES[segmentInfo(segs[0]).type].name.toLowerCase()} market.`)
  }
}

function stepDay(s: GameState) {
  s.day++
  stepRivals(s)
  stepProjects(s)
  stepEvents(s)
  stepOperations(s)
  stepCampaigns(s)
  stepSales(s)
  stepResearch(s)
  const crunch = ownProducts(s).filter((p) => p.status === 'dev').length + s.chips.filter((c) => c.status === 'dev').length >= 3
  for (const n of stepStaff(s, crunch)) news(s, n.alert ? 'alert' : 'staff', n.text)
  stepFinance(s)
  if (s.day % DAYS_PER_MONTH === 0) closeMonth(s)
  if (s.day % 5 === 0) for (const g of checkGoals(s)) reward(s, g)
  stepProgress(s)
}

function reward(s: GameState, g: Goal) {
  if (g.cash) earn(s, g.cash, 'other')
  if (g.fans) s.fans += g.fans
  const prize = [g.cash ? dollars(g.cash) : '', g.fans ? `${thousands(g.fans)} fans` : ''].filter(Boolean).join(' and ')
  news(s, 'goal', `Goal reached: ${g.name}.${prize ? ` Reward: ${prize}.` : ''}`)
}

/** Advance the simulation. Deterministic for a given state. */
export function tick(s: GameState, days: number): GameState {
  for (let i = 0; i < days && !s.gameOver; i++) stepDay(s)
  return s
}

/** Units sold per company over the trailing 12 months. */
export function trailingUnits(s: GameState): { company: Company; units: number }[] {
  return s.companies.map((c) => ({ company: c, units: c.unitsYear.reduce((a, b) => a + b, 0) + (s.monthShare[c.id] ?? 0) }))
}

export { CHIP_BUDGET, CONTRACT, buildCost, segmentsOf, utility }

// ---------------------------------------------------------------- shares and investors

/** Sell a stake to a private investor. */
export function fundingRound(s: GameState, stake: number): string | null {
  if (locked(s, 'shares')) return locked(s, 'shares')
  if (!num(stake) || stake <= 0) return 'Choose the share of the company to sell: 2% to 30%'
  const r = raiseRound(s, stake)
  if (r.error) return r.error
  fund(s, r.cash)
  news(s, 'finance', `${r.name} invested ${millions(r.cash)} for ${(stake * 100).toFixed(0)}% of the company.`)
  return null
}

export function listCompany(s: GameState, float: number): string | null {
  if (locked(s, 'shares')) return locked(s, 'shares')
  if (!num(float) || float <= 0) return 'Choose the share of the company to float: 5% to 40%'
  const r = goPublic(s, float)
  if (r.error) return r.error
  fund(s, r.cash)
  news(s, 'finance', `${player(s).name} listed on the stock market, raising ${millions(r.cash)}. Shares opened at $${s.stock.price.toFixed(2)}.`)
  return null
}

export function sellShares(s: GameState, pct: number): string | null {
  if (locked(s, 'shares')) return locked(s, 'shares')
  if (!num(pct) || pct <= 0) return 'Choose how many new shares to issue: 1% to 15% of those in issue'
  const r = issueShares(s, pct)
  if (r.error) return r.error
  fund(s, r.cash)
  news(s, 'finance', `The company sold new shares worth ${millions(r.cash)}.`)
  return null
}

export function buyBackShares(s: GameState, amount: number): string | null {
  if (locked(s, 'shares')) return locked(s, 'shares')
  if (!num(amount) || amount <= 0) return 'Enter an amount to spend on the buyback'
  if (!canAfford(s, amount) || s.cash < amount) return `Buybacks must be paid from cash in hand, and there is ${dollars(Math.max(0, s.cash))}`
  const r = buyBack(s, amount)
  if (r.error) return r.error
  fund(s, -r.spent)
  return null
}

export function setPayout(s: GameState, share: number) {
  if (locked(s, 'shares') || !num(share)) return
  s.stock.payout = clamp(share, 0, 0.5)
}

export function buyRivalStake(s: GameState, companyId: string, pct: number): string | null {
  const c = s.companies.find((x) => x.id === companyId)
  if (!c) return 'There is no such company'
  if (locked(s, 'shares')) return locked(s, 'shares')
  if (c.isPlayer) return 'That is your own company. Buy its shares back instead.'
  if (!c.alive) return `${c.name} is no longer in business`
  if (!num(pct) || pct <= 0) return 'Choose how much of the company to buy'
  const take = Math.min(pct, 0.49 - stakeIn(s, companyId))
  if (take > 0.001 && s.cash < stakePrice(c, take)) return `Stakes must be paid from cash in hand: ${(take * 100).toFixed(0)}% of ${c.name} costs ${dollars(stakePrice(c, take))}`
  const r = buyStake(s, companyId, pct)
  if (r.error) return r.error
  fund(s, -r.cost)
  news(s, 'finance', `You now own ${(stakeIn(s, companyId) * 100).toFixed(0)}% of ${c.name}.`)
  return null
}

export function sellRivalStake(s: GameState, companyId: string) {
  const back = sellStake(s, companyId)
  if (back > 0) fund(s, back)
}

/** Buy a rival outright. Its products are withdrawn and its customers, name and know-how come to you. */
export function acquire(s: GameState, companyId: string): string | null {
  const c = s.companies.find((x) => x.id === companyId)
  if (!c || c.isPlayer || !c.alive) return 'That company cannot be bought'
  if (locked(s, 'shares')) return locked(s, 'shares')
  const price = takeoverPrice(s, c)
  if (s.cash < price) return `A takeover must be paid from cash in hand: ${c.name} costs ${dollars(price)}`
  fund(s, -price)
  const me = player(s)
  const theirs = rivalLevels(s, c)
  let gained = 0
  for (const t of TRACKS) {
    if (gained < 2 && theirs[t] > s.levels[t]) {
      s.levels[t]++
      gained++
    }
  }
  for (const r of REGIONS) {
    const st = s.regions[r.id]
    if (st.open) st.awareness = clamp(st.awareness + (1 - st.awareness) * c.awareness * 0.3 * rivalReach(c, r.id), 0, 1)
  }
  me.awareness = worldAwareness(s)
  me.brand = clamp(Math.max(me.brand, me.brand * 0.9 + c.brand * 0.1), 0.05, 1)
  s.fans += c.unitsYear.reduce((a, b) => a + b, 0) * 0.03
  for (const p of s.products) if (p.companyId === c.id && p.status === 'sale') endProduct(s, p)
  c.alive = false
  c.acquired = true
  c.value = 0
  delete s.stock.holdings[c.id]
  news(s, 'finance', `You bought ${c.name} for ${millions(price)}.${gained ? ' Its engineers brought new know-how.' : ''}`)
  return null
}

/** The longest name a company can have (the System screen's field takes as many). */
export const MAX_COMPANY_NAME = 18

/**
 * Rename a company: the player's own, or a rival (the System screen lets the
 * player call them what they like). Returns why not, or null. A name must be
 * something, and no two companies may share one. Where a rival is based and
 * how far it reaches do not change with its name.
 */
export function renameCompany(s: GameState, companyId: string, name: string): string | null {
  const c = s.companies.find((x) => x.id === companyId)
  if (!c) return 'There is no such company'
  const to = typeof name === 'string' ? name.trim().slice(0, MAX_COMPANY_NAME) : ''
  if (!to) return 'A company needs a name'
  if (s.companies.some((x) => x !== c && x.name.toLowerCase() === to.toLowerCase())) return `There is already a company called ${to}`
  c.name = to
  if (c.isPlayer) s.config.companyName = to
  return null
}

// ---------------------------------------------------------------- device lines and incidents

/** Start making a new kind of device. */
export function unlockType(s: GameState, type: DeviceType): string | null {
  if (!lists(TYPES, type)) return 'There is no such kind of device'
  const blocked = locked(s, 'research') ?? unlockBlocked(s, type)
  if (blocked) return blocked
  const cost = unlockCost(s, type)
  if (!canAfford(s, cost)) return `Not enough cash: opening the ${TYPES[type].name.toLowerCase()} line costs ${dollars(cost)}`
  spend(s, cost, 'rd')
  s.types = [...(s.types ?? []), type]
  news(s, 'research', `${player(s).name} can now design ${TYPES[type].plural.toLowerCase()}.`)
  return null
}

/** Choose how to respond to an incident (0 is the first option). */
export function decide(s: GameState, incidentId: string, choice: number): string | null {
  const r = settleIncident(s, incidentId, choice, (n) => canAfford(s, n))
  if (r.error) return r.error
  if (r.text) news(s, 'event', r.text)
  return null
}

// ---------------------------------------------------------------- regions

export function enterRegion(s: GameState, id: string): string | null {
  const blocked = locked(s, 'world') ?? entryBlocked(s, id)
  if (blocked) return blocked
  const r = regionInfo(id)
  if (!canAfford(s, r.entry)) return `Not enough cash: setting up in ${r.name} costs ${dollars(r.entry)}`
  spend(s, r.entry, 'overhead')
  const open = REGIONS.filter((x) => s.regions[x.id].open)
  // word travels: a brand known elsewhere does not start from nothing
  const known = open.reduce((a, x) => a + s.regions[x.id].awareness, 0) / Math.max(1, open.length)
  s.regions[id] = { ...newRegion(true, known * 0.3, s.day), history: s.regions[id]?.history ?? [] }
  news(s, 'finance', `${player(s).name} now sells in ${r.name}.`)
  return null
}

export function setRegionPrice(s: GameState, id: string, adj: number) {
  if (!isRegion(id) || !num(adj) || locked(s, 'world')) return
  const st = s.regions[id]
  if (st) st.priceAdj = clamp(Math.round(adj * 100) / 100, 0.7, 1.4)
}

// ---------------------------------------------------------------- after-sales

export function setCare(s: GameState, patch: Partial<Pick<GameState['care'], 'warrantyYears' | 'updateYears' | 'tradeIn' | 'refurb' | 'plan' | 'planPrice'>>): string | null {
  const c = s.care
  const lock = locked(s, 'carePolicy')
  if (lock) return lock
  if (patch.warrantyYears !== undefined && WARRANTY_YEARS.includes(patch.warrantyYears)) c.warrantyYears = patch.warrantyYears
  if (patch.updateYears !== undefined && UPDATE_YEARS.includes(patch.updateYears)) c.updateYears = patch.updateYears
  if (patch.tradeIn !== undefined) c.tradeIn = patch.tradeIn
  if (patch.refurb !== undefined) {
    if (patch.refurb && !canRefurb(s)) return 'Refurbishing needs a factory or a store with a repair bench'
    c.refurb = !!patch.refurb
  }
  if (patch.plan !== undefined) c.plan = !!patch.plan
  if (patch.planPrice !== undefined && num(patch.planPrice)) c.planPrice = clamp(Math.round(patch.planPrice), 2, 40)
  return null
}

/** Recall a faulty product: every unit sold is fixed at the company's expense. */
export function recallProduct(s: GameState, productId: string): string | null {
  const p = s.products.find((x) => x.id === productId)
  if (!p || p.recall?.state !== 'open') return 'There is no recall to decide'
  const cost = recallCost(p)
  if (!canAfford(s, cost)) return `Not enough cash: recalling ${p.name} costs ${dollars(cost)}`
  spend(s, cost, 'production')
  p.recall = { state: 'done', day: s.day, cost }
  p.defectRate = Math.min(p.defectRate, 0.01)
  player(s).brand = clamp(player(s).brand + 0.01, 0.05, 1)
  news(s, 'alert', `${p.name} was recalled and repaired at a cost of ${dollars(cost)}. Owners noticed that you did the right thing.`, p.id)
  return null
}

export { RECALL_DEADLINE, valuation }

// ---------------------------------------------------------------- old saves

/** Old dimensions of each kind of site, from before plots and rooms. */
const OLD_SIZE: Record<string, [number, number][]> = {
  office: [[9, 6], [14, 9], [20, 12], [28, 16], [34, 34]],
  factory: [[14, 8], [22, 12], [32, 18]],
  store: [[8, 6], [12, 8], [16, 12]],
}

interface OldSite {
  tier?: number
  w?: number
  h?: number
  grid?: number[]
  items?: { id?: string; kind: string; x: number; y: number; rot: number }[]
}

/**
 * Turn a site from before rooms into a plot with one big room holding what
 * was there. Returns the site and the value of anything that could not stay.
 */
function convertSite(s: GameState, old: OldSite | null | undefined, kind: SiteKind): { site: Site; refund: number } {
  if (old && Array.isArray(old.grid)) return { site: old as unknown as Site, refund: 0 }
  const tier = clamp(old?.tier ?? 0, 0, SITE_TIERS[kind].length - 1)
  const site = newSite(kind, tier)
  const [ow, oh] = OLD_SIZE[kind]?.[tier] ?? [old?.w ?? 8, old?.h ?? 6]
  const rw = Math.min(old?.w ?? ow, site.w - 2)
  const rh = Math.min(old?.h ?? oh, site.h - 2)
  const dx = Math.floor((site.w - rw) / 2)
  const dy = Math.floor((site.h - rh) / 2)
  const type = kind === 'office' ? 'work' : kind === 'factory' ? 'hall' : 'sales'
  const { room } = zone(site, type, areaTiles(dx, dy, dx + rw - 1, dy + rh - 1))
  if (room) autoDoor(site, room.n)
  let refund = 0
  for (const it of old?.items ?? []) {
    const def = ITEMS[kind][it.kind]
    if (def && !canPlace(site, it.kind, it.x + dx, it.y + dy, it.rot)) site.items.push({ id: it.id ?? `o${s.nextId++}`, kind: it.kind, x: it.x + dx, y: it.y + dy, rot: it.rot })
    else if (def) refund += def.cost
  }
  return { site, refund }
}

/** Where each step of the guided start as it was before version 5 sits in today's (see components/Guide.tsx). */
const OLD_GUIDE = [1, 2, 3, 5, 7, 8, 9, 10, 12, 14, 15, 17, 18]

/**
 * A book foldable designed before the camera of its cover screen became a part of its own has none: it was
 * drawn without being placed. Give it the part, where laying the device out again would put it. A product's
 * cost and scores were fixed when it launched, so nothing about it moves; a design made from it afterwards is
 * evaluated with the camera, exactly as a freshly laid out one is. Returns true if the design was changed.
 */
export function addCoverCamera(d: DeviceDesign): boolean {
  if (d?.type !== 'foldable' || isFlip(d.body) || d.parts.some((p) => isCoverCam(d, p))) return false
  const cov = coverScreen(d.body)
  const rear = d.parts.filter((p) => p.kind === 'camera' && p.face === 'back')
  const level = Math.max(0, Math.max(0, ...rear.map((p) => p.sensor ?? 0)) - 1)
  const dia = selfieMinDia(level) + 0.4
  let n = d.parts.length + 1
  while (d.parts.some((p) => p.id === `k${n}`)) n++
  d.parts.push(clampPart(d.body, { id: `k${n}`, kind: 'camera', face: 'back', x: cov.x, y: cov.y + cov.h / 2 - 5, rot: 0, w: dia, h: dia, sensor: level, lens: 'wide' }, 'foldable'))
  return true
}

/** Bring a save from an older version up to date. */
export function migrate(input: GameState): GameState {
  const s = input as GameState & Record<string, unknown>
  // this one is checked on every load: saves of the current version were made both before and after the part existed
  for (const p of s.products ?? []) addCoverCamera(p.design)
  // where a rival is based follows from the name it was founded under; older saves only have the name it bears now
  for (const c of s.companies ?? []) if (!c.isPlayer && c.origin === undefined) c.origin = c.name
  // rivals' devices used to carry a stock of a million million to say they never run out
  for (const p of s.products ?? []) {
    if (p.companyId === 'player' || p.unlimited) continue
    p.unlimited = true
    p.stock = 0
  }
  if (s.version >= SAVE_VERSION && s.incidents && s.guide !== undefined && s.unlocks) return s
  const from = s.version ?? 0
  const max = Object.fromEntries(TRACKS.map((t) => [t, MAX_LEVEL])) as Levels
  if (!Array.isArray(s.features)) s.features = featuresAtLevels(s.levels)
  s.progress = s.progress ?? {}

  // ---- staff gain morale, traits and potential
  s.staff = (s.staff ?? []).map((e) => ({ ...e, morale: e.morale ?? 70, traits: e.traits ?? [], potential: e.potential ?? Math.min(100, e.skill + 15), lowDays: e.lowDays ?? 0 }))

  // ---- products gain a type, a family and the new tracking fields
  for (const p of s.products) {
    p.design.type = p.design.type ?? 'phone'
    p.type = p.design.type
    p.family = p.family ?? p.name
    p.variant = p.variant ?? ''
    p.tiers = p.tiers ?? []
    p.costParts = p.costParts ?? evaluate(p.design, max, marketLevel(Math.max(0, p.launchDay))).costParts
    p.hype = p.hype ?? 0
    p.buzz = p.buzz ?? {}
    p.defectRate = p.defectRate ?? 0.02
    p.satisfaction = p.satisfaction ?? clamp(0.25 + 0.065 * p.reviewAvg, 0, 1)
    p.feedback = p.feedback ?? []
  }

  // ---- companies: existing rivals enter the new markets, and new rivals arrive
  RIVALS.forEach((seed, i) => {
    let c = s.companies.find((x) => x.id === `r${i}`)
    // a start-up founded during play may already hold this id; the seeded company then takes a fresh one
    const known = (x: Company) => x.name === seed.name || x.name === originalName(seed.name)
    const taken = !!c && !known(c) && !seed.segments.some((seg) => c!.segments.includes(seg))
    if (taken) c = undefined
    if (!c) {
      if (s.companies.some(known)) return
      c = makeCompany(taken ? `r${s.nextId++}` : `r${i}`, seed)
      if (!s.config.parody) makeOriginal(c)
      s.companies.push(c)
    }
    c.software = c.software ?? seed.software
    for (const seg of seed.segments) {
      if (c.segments.includes(seg)) continue
      c.segments.push(seg)
      c.series[seg] = seed.series[seg]
    }
    for (const seg of c.segments) if (c.nextLaunch[seg] === undefined) c.nextLaunch[seg] = s.day + int(s, 5, 240)
  })
  for (const c of s.companies) {
    c.software = c.software ?? 0
    if (!c.isPlayer) c.origin = c.origin ?? c.name
  }

  s.orders = s.orders ?? []
  s.supply = s.supply ?? newSupply()
  s.stores = s.stores ?? []
  s.campaigns = s.campaigns ?? []
  s.events = s.events ?? []
  s.chips = s.chips ?? []
  s.os = s.os ?? newOs()
  s.owners = s.owners ?? player(s).unitsTotal * 0.7
  s.fans = s.fans ?? s.owners * 0.1
  const fix = (r: MonthReport) => {
    r.other = r.other ?? 0
    r.salaries = r.salaries ?? 0
    r.facilities = r.facilities ?? 0
    r.funding = r.funding ?? 0
  }
  fix(s.cur)
  s.reports.forEach(fix)

  // ---- sites become plots with rooms; what was built stays, in one big room
  let refund = 0
  const take = (old: unknown, kind: SiteKind) => {
    const r = convertSite(s, old as OldSite, kind)
    refund += r.refund
    return r.site
  }
  s.office = take(s.office, 'office')
  s.factory = s.factory ? take(s.factory, 'factory') : null
  s.venue = s.venue ?? null
  const home = s.config.home ?? DEFAULT_HOME
  for (const st of s.stores) {
    st.site = take(st.site, 'store')
    st.region = st.region ?? REGIONS.find((r) => r.cities.includes(st.name))?.id ?? home
  }
  s.cash += refund
  if (refund > 0) news(s, 'finance', `Your buildings were rebuilt as rooms. Fittings that no longer had a place were sold back for ${dollars(refund)}.`)

  // ---- the new systems start from where the company already is
  s.teams = s.teams ?? []
  s.policy = s.policy ?? newPolicy()
  s.care = s.care ?? newCare()
  if (!s.regions) {
    // an established company was already selling everywhere
    const known = player(s).awareness
    s.regions = Object.fromEntries(REGIONS.map((r) => [r.id, newRegion(true, known, s.day)]))
  }
  player(s).home = player(s).home ?? home
  if (!s.stock) {
    s.stock = newStock(Math.max(1e6, s.cash))
    s.stock.price = valuation(s) / s.stock.shares
  }
  const hadGoals = !!s.goals
  s.goals = s.goals ?? {}
  s.incidents = s.incidents ?? []
  // a company that predates the guided start has no use for it
  s.guide = s.guide ?? -1
  // ---- capabilities: a company from before they existed already had everything
  if (from < 5) {
    s.config.progression = 'open'
    // the guided start gained steps; carry a half-finished one over to where it was
    if (s.guide >= 0) s.guide = OLD_GUIDE[s.guide] ?? -1
  }
  // ---- version 6: the prices people expect stop climbing once technology has peaked (see priceIndex).
  // In a company already past that day, every price on sale had climbed with the old index; they are all
  // brought back by the same share, so each device is exactly as attractive the day after as the day before
  if (from < 6 && s.day > PEAK_DAY) {
    const k = priceIndex(s.day) / Math.pow(1.035, s.day / DAYS_PER_YEAR)
    for (const p of s.products) {
      if (p.status === 'ended') continue
      const was = p.price
      p.price = Math.max(1, Math.round(p.price * k))
      for (const t of p.tiers ?? []) t.price = p.price + Math.max(1, Math.round((t.price - was) * k))
    }
    news(s, 'finance', `Prices across the market have settled: now that technology has matured, devices no longer get dearer every year. Every list price, yours and your rivals', was brought down by ${Math.round((1 - k) * 100)}% together, so each device is as attractive as it was.`)
  }
  // factory blocks gained input and output faces: a floor laid before then is turned to match where turning is enough
  if (from < 7 && s.factory && !lineStats(s.factory).running && fixLayout(s.factory)) news(s, 'alert', 'Factory machines now take parts in at one face and send them out at another. Your line was turned to match.')
  s.unlocks = s.unlocks ?? {}
  s.execSeats = s.execSeats ?? {}
  s.execPool = s.execPool ?? []
  // goals a company from before goals had already reached are marked as reached, without their rewards.
  // Done last: the goals look at every part of the company, and all of it has to be there first
  if (!hadGoals) checkGoals(s)
  refreshCandidates(s)
  stepProgress(s)
  s.version = SAVE_VERSION
  return s
}
