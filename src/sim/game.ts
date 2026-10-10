// Game state, the daily tick, and every action the player can take.
// All functions mutate the GameState passed in and use only its seeded RNG.
import { DAYS_PER_MONTH, DAYS_PER_YEAR, MAX_LEVEL, RIVALS, type RivalSeed, SEGMENTS, START_YEAR, TRACK_INFO, marketLevel, researchCost, segmentInfo } from '../data/catalog'
import { OUTSIDE_OPTION, attraction, bestSegment, makeReviews, segmentDemand } from './market'
import { generateDesign } from './rivals'
import { clamp, int, pick, rand, range } from './rng'
import { evaluate } from './scoring'
import { type Company, type DeviceDesign, type Difficulty, type GameConfig, type GameState, type Levels, type MonthReport, type NewsItem, type Product, type SegmentId, TRACKS, type Track } from './types'

export const SAVE_VERSION = 1
export const RETAIL_CUT = 0.15

export const DIFFICULTY: Record<Difficulty, { label: string; blurb: string; startCash: number; rivalOffset: number; awareness: number; overhead: number; debtDays: number; overdraft: number }> = {
  relaxed: { label: 'Relaxed', blurb: 'Forgiving market, slow rivals, generous credit.', startCash: 15e6, rivalOffset: -0.5, awareness: 1.6, overhead: 0.6, debtDays: 720, overdraft: 5e6 },
  normal: { label: 'Normal', blurb: 'Balanced rivals and a fair market.', startCash: 6e6, rivalOffset: 0, awareness: 1, overhead: 1, debtDays: 360, overdraft: 2e6 },
  tough: { label: 'Tough', blurb: 'Aggressive rivals, thin credit, slow brand growth.', startCash: 3e6, rivalOffset: 0.4, awareness: 0.7, overhead: 1.5, debtDays: 180, overdraft: 0.5e6 },
}

export const defaultConfig = (): GameConfig => ({
  companyName: 'Behemoth Labs',
  color: '#36c5d6',
  difficulty: 'normal',
  startCash: DIFFICULTY.normal.startCash,
  researchSpeed: 1,
  rivalStrength: 1,
  techLevel: 2,
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

function news(s: GameState, kind: NewsItem['kind'], text: string, productId?: string) {
  s.news.unshift({ id: s.nextId++, day: s.day, kind, text, productId })
  if (s.news.length > 80) s.news.length = 80
}

const emptyReport = (month: number): MonthReport => ({ month, revenue: 0, production: 0, rd: 0, marketing: 0, development: 0, overhead: 0, interest: 0, units: 0, cash: 0 })

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
  return v < 300 ? Math.round(v / 10) * 10 - 1 : Math.round(v / 50) * 50 - 1
}

function createProduct(s: GameState, c: Company, name: string, design: DeviceDesign, price: number, levels: Levels, segment?: SegmentId): { product: Product; issues: string[] } {
  const ev = evaluate(design, levels, marketLevel(s.day))
  const product: Product = {
    id: `p${s.nextId++}`,
    companyId: c.id,
    name,
    design,
    segment,
    price,
    unitCost: ev.unitCost,
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
  p.reviews = makeReviews(s, p, c.brand, s.day, issues)
  p.reviewAvg = p.reviews.reduce((a, r) => a + r.score, 0) / p.reviews.length
  if (!p.segment) p.segment = bestSegment(p, c.brand, s.day).seg.id
  const w = c.isPlayer ? 0.3 : 0.15
  c.brand = clamp(c.brand * (1 - w) + (p.reviewAvg / 10) * w, 0.05, 1)
}

const RIVAL_MARGIN: Record<SegmentId, number> = { budget: 0.18, mainstream: 0.45, flagship: 1.1, gamer: 0.6, business: 0.8, camera: 0.7 }

function rivalLaunch(s: GameState, c: Company, segment: SegmentId, backdate = 0) {
  const seg = segmentInfo(segment)
  const realDay = s.day
  s.day = realDay - backdate
  const levels = rivalLevels(s, c)
  const design = generateDesign(s, { segment, levels, mLevel: marketLevel(s.day), layout: c.layout + (rand(s) < 0.2 ? int(s, 1, 4) : 0), palette: c.palette, logo: c.name.slice(0, 9).toUpperCase() })
  const name = `${c.series[segment] ?? seg.name} ${c.counter}`
  const { product, issues } = createProduct(s, c, name, design, 0, levels, segment)
  const costBased = (product.unitCost / (1 - RETAIL_CUT)) * (1 + RIVAL_MARGIN[segment]) * c.priceMult
  const refBased = seg.priceRef * c.priceMult * 0.95
  product.price = roundPrice(Math.max((product.unitCost * 1.12) / (1 - RETAIL_CUT), 0.5 * costBased + 0.5 * refBased))
  product.stock = 1e12 // rivals never run out; a finite number keeps saves valid JSON
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
    progress: {} as Levels,
    activeResearch: [],
    rdBudget: 0,
    cur: emptyReport(0),
    reports: [],
    shareHistory: [],
    monthShare: {},
    news: [],
  }
  for (const t of TRACKS) {
    s.levels[t] = clamp(Math.round(cfg.techLevel), 0, MAX_LEVEL)
    s.progress[t] = 0
  }
  s.companies.push({
    ...makeCompany('player', { name: cfg.companyName, color: cfg.color, brand: 0.35, awareness: 0.01, techOffset: 0, priceMult: 1, segments: [], layout: 0, palette: [], series: {}, counter: 1 }),
    isPlayer: true,
  })
  RIVALS.forEach((seed, i) => {
    const c = makeCompany(`r${i}`, seed)
    s.companies.push(c)
    for (const seg of c.segments) {
      rivalLaunch(s, c, seg, int(s, 20, 330))
      c.nextLaunch[seg] = int(s, 30, 330)
    }
    c.counter++
  })
  news(s, 'finance', `${cfg.companyName} is founded with ${cfg.unlimitedMoney ? 'unlimited funds' : '$' + (cfg.startCash / 1e6).toFixed(1) + 'M'}.`)
  return s
}

// ---------------------------------------------------------------- actions

export function canAfford(s: GameState, amount: number): boolean {
  return s.config.unlimitedMoney || s.cash - amount >= -DIFFICULTY[s.config.difficulty].overdraft
}

function spend(s: GameState, amount: number, bucket: 'production' | 'rd' | 'marketing' | 'development' | 'overhead' | 'interest') {
  s.cash -= amount
  s.cur[bucket] += amount
}

export function devPlan(design: DeviceDesign): { cost: number; days: number } {
  const sp = design.specs
  const cams = design.parts.filter((p) => p.kind === 'camera')
  const camLevel = cams.reduce((m, p) => Math.max(m, p.sensor ?? 0), 0)
  const avg = (sp.panel + sp.chipGen + camLevel + sp.charging) / 4
  return { cost: Math.round(150e3 * Math.pow(1.35, avg)), days: Math.round(45 + 5 * avg) }
}

export interface LaunchOrder {
  design: DeviceDesign
  name: string
  price: number
  quantity: number
  marketing: number
}

/** Start developing a device. Returns an error message, or null on success. */
export function startProduct(s: GameState, o: LaunchOrder): string | null {
  const ev = evaluate(o.design, s.levels, marketLevel(s.day))
  const blocking = ev.report.issues.find((i) => i.level === 'error')
  if (blocking) return blocking.text
  if (!o.name.trim()) return 'The device needs a name'
  if (o.price <= 0) return 'Set a price'
  const plan = devPlan(o.design)
  const total = plan.cost + o.quantity * ev.unitCost + o.marketing
  if (!canAfford(s, total)) return 'Not enough cash for development, production and marketing'
  const c = player(s)
  const { product } = createProduct(s, c, o.name.trim(), JSON.parse(JSON.stringify(o.design)), Math.round(o.price), s.levels)
  product.devDaysLeft = plan.days
  product.stock = Math.floor(o.quantity)
  product.marketing = o.marketing
  spend(s, plan.cost, 'development')
  spend(s, product.stock * ev.unitCost, 'production')
  spend(s, o.marketing, 'marketing')
  news(s, 'launch', `Development of ${product.name} started. Release in ${plan.days} days.`, product.id)
  return null
}

export function produce(s: GameState, productId: string, quantity: number): string | null {
  const p = s.products.find((x) => x.id === productId)
  if (!p || p.companyId !== 'player' || p.status === 'ended') return 'Product is not available'
  const cost = Math.floor(quantity) * p.unitCost
  if (quantity <= 0) return 'Enter a quantity'
  if (!canAfford(s, cost)) return 'Not enough cash'
  p.stock += Math.floor(quantity)
  spend(s, cost, 'production')
  return null
}

export function setPrice(s: GameState, productId: string, price: number) {
  const p = s.products.find((x) => x.id === productId)
  if (p && p.companyId === 'player' && price > 0) p.price = Math.round(price)
}

export function discontinue(s: GameState, productId: string) {
  const p = s.products.find((x) => x.id === productId)
  if (p && p.companyId === 'player' && p.status !== 'ended') {
    endProduct(s, p)
    news(s, 'launch', `${p.name} was discontinued with ${p.stock.toLocaleString()} units unsold.`, p.id)
  }
}

export function toggleResearch(s: GameState, t: Track) {
  const i = s.activeResearch.indexOf(t)
  if (i >= 0) s.activeResearch.splice(i, 1)
  else if (s.levels[t] < MAX_LEVEL) s.activeResearch.push(t)
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

function stepPlayerDev(s: GameState) {
  const c = player(s)
  for (const p of s.products) {
    if (p.companyId !== 'player' || p.status !== 'dev') continue
    if (--p.devDaysLeft > 0) continue
    const ev = evaluate(p.design, s.levels, marketLevel(s.day))
    p.raw = ev.raw
    p.designPct = ev.report.pct
    release(s, p, c, ev.report.issues.filter((i) => i.level === 'warn').map((i) => i.text))
    c.awareness += (1 - c.awareness) * (1 - Math.exp(-p.marketing / 25e6))
    news(s, 'review', `${p.name} is on sale. Review average ${p.reviewAvg.toFixed(1)} / 10.`, p.id)
  }
}

function stepSales(s: GameState) {
  const onSale = s.products.filter((p) => p.status === 'sale')
  const companies = new Map(s.companies.map((c) => [c.id, c]))
  const gain = DIFFICULTY[s.config.difficulty].awareness
  for (const seg of SEGMENTS) {
    const demand = segmentDemand(seg, s.day)
    const weights = onSale.map((p) => (p.stock <= 0 ? 0 : attraction(p, companies.get(p.companyId)!, seg, s.day)))
    const total = weights.reduce((a, w) => a + w, OUTSIDE_OPTION)
    onSale.forEach((p, i) => {
      if (weights[i] <= 0) return
      p.carry += ((demand * weights[i]) / total) * range(s, 0.9, 1.1)
      let units = Math.floor(p.carry)
      if (units <= 0) return
      const c = companies.get(p.companyId)!
      if (c.isPlayer) {
        units = Math.min(units, p.stock)
        p.stock -= units
        if (p.stock === 0) {
          p.carry = 0
          news(s, 'alert', `${p.name} is sold out. Order more units to keep selling.`, p.id)
        }
      }
      p.carry -= Math.min(p.carry, units)
      const income = units * p.price * (1 - RETAIL_CUT)
      p.unitsSold += units
      p.revenue += income
      p.monthUnits += units
      p.segUnits[seg.id] = (p.segUnits[seg.id] ?? 0) + units
      c.unitsTotal += units
      c.revenueTotal += income
      s.monthShare[c.id] = (s.monthShare[c.id] ?? 0) + units
      if (c.isPlayer) {
        s.cash += income
        s.cur.revenue += income
        s.cur.units += units
        c.awareness += (1 - c.awareness) * (units / 3e6) * gain
      }
    })
  }
}

function stepResearch(s: GameState) {
  if (!s.activeResearch.length || s.rdBudget <= 0) return
  const daily = s.rdBudget / DAYS_PER_MONTH
  if (!canAfford(s, daily)) return
  spend(s, daily, 'rd')
  const each = (daily * s.config.researchSpeed) / s.activeResearch.length
  for (const t of [...s.activeResearch]) {
    s.progress[t] += each
    const cost = researchCost(s.levels[t] + 1)
    if (s.progress[t] >= cost) {
      s.progress[t] -= cost
      s.levels[t]++
      news(s, 'research', `Research complete: ${TRACK_INFO[t].name} level ${s.levels[t]} (${TRACK_INFO[t].unlocks[s.levels[t]]}).`)
      if (s.levels[t] >= MAX_LEVEL) {
        s.progress[t] = 0
        s.activeResearch = s.activeResearch.filter((x) => x !== t)
      }
    }
  }
}

function stepFinance(s: GameState) {
  const d = DIFFICULTY[s.config.difficulty]
  const selling = s.products.filter((p) => p.companyId === 'player' && p.status !== 'ended').length
  spend(s, ((40e3 + 15e3 * selling) * d.overhead) / DAYS_PER_MONTH, 'overhead')
  if (s.config.unlimitedMoney) return
  if (s.cash < 0) {
    spend(s, (-s.cash * 0.12) / DAYS_PER_YEAR, 'interest')
    s.debtDays++
    if (s.debtDays === 30) news(s, 'alert', 'The company is in debt. Bankruptcy follows if it is not cleared.')
    if (s.debtDays > d.debtDays) {
      s.gameOver = true
      news(s, 'alert', `${player(s).name} is bankrupt.`)
    }
  } else s.debtDays = 0
}

function closeMonth(s: GameState) {
  const month = Math.floor(s.day / DAYS_PER_MONTH) - 1
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
    c.weakMonths = units / total < 0.004 ? c.weakMonths + 1 : Math.max(0, c.weakMonths - 1)
    if (c.weakMonths >= 24) {
      c.alive = false
      for (const p of s.products) if (p.companyId === c.id && p.status === 'sale') endProduct(s, p)
      news(s, 'rival', `${c.name} has gone bankrupt and left the phone market.`)
    }
  }
  s.monthShare = {}
  for (const p of s.products) {
    if (p.status === 'ended' && p.monthUnits === 0) continue
    p.history.push(p.monthUnits)
    if (p.history.length > 60) p.history.shift()
    p.monthUnits = 0
  }
  // drop long-dead rival products so saves stay small
  s.products = s.products.filter((p) => p.companyId === 'player' || p.status !== 'ended' || s.day - (p.endDay ?? s.day) < 720)

  const alive = s.companies.filter((c) => !c.isPlayer && c.alive)
  const used = new Set(s.companies.map((c) => c.name))
  const free = STARTUP_NAMES.filter((n) => !used.has(n))
  if (alive.length < 6 && free.length && rand(s) < 0.08) {
    const name = pick(s, free)
    const segs = [pick(s, SEGMENTS).id]
    const c = makeCompany(`r${s.nextId++}`, { name, color: pick(s, ['#b08d57', '#5a9bd4', '#9c6ade', '#58b368', '#d46a6a']), brand: 0.5, awareness: 0.25, techOffset: range(s, -0.6, 0.2), priceMult: range(s, 0.85, 1.05), segments: segs, layout: int(s, 0, 4), palette: ['#17191d', '#d8d8dc', '#3f5870'], series: { [segs[0]]: 'Model' }, counter: 1 })
    s.companies.push(c)
    c.nextLaunch[segs[0]] = s.day + int(s, 5, 60)
    news(s, 'rival', `A new company, ${name}, has entered the phone market.`)
  }
}

function stepDay(s: GameState) {
  s.day++
  stepRivals(s)
  stepPlayerDev(s)
  stepSales(s)
  stepResearch(s)
  stepFinance(s)
  if (s.day % DAYS_PER_MONTH === 0) closeMonth(s)
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

/** Starting template for the player's first design. */
export function starterDesign(s: GameState): DeviceDesign {
  const holder = { rng: s.config.seed + s.products.length * 7919 }
  const c = player(s)
  return generateDesign(holder, { segment: 'mainstream', levels: s.levels, mLevel: marketLevel(s.day), layout: 1, palette: ['#b9c7d8'], logo: c.name.split(' ')[0].slice(0, 10).toUpperCase() })
}
