// What the company is doing right now, boiled down for the 3D views: the
// rooms show this instead of a list. Everything here is read-only and derived
// from the game state; nothing is stored.
import { DAYS_PER_MONTH } from '../data/catalog'
import { CHANNELS, EVENTS, OWN_VENUE, dailyTickets } from './growth'
import { researchItem } from './game'
import { factoryLine, orderLeft } from './ops'
import { type LineStats, type VenueStats, storeStats, venueStats } from './sites'
import { ROLE_INFO, output, staffEffects, teamBonus } from './staff'
import { industryOs, servicesPerMonth } from './tech'
import { RAISE_GAP } from './stock'
import { type Employee, type GameState, type Product, type Role, monthCosts } from './types'

export interface ResearchLine {
  id: string
  name: string
  /** 0-1 of the way to done. */
  progress: number
  /** Days left at today's budget; undefined when nothing is being spent. */
  daysLeft?: number
}

export interface DevLine {
  product: Product
  progress: number
  daysLeft: number
}

export interface CampaignLine {
  id: string
  channel: string
  /** What it advertises, in words. */
  target: string
  productId?: string
  monthly: number
  spent: number
}

export interface TeamLine {
  id: string
  name: string
  lead?: string
  leadId?: string
  members: string[]
  /** Lift the lead gives the others, 0 when there is none. */
  bonus: number
}

export interface OfficeLife {
  research: ResearchLine[]
  /** Monthly research budget. */
  budget: number
  /** Counts up each time a level or feature is finished, so the view can celebrate. */
  researchDone: number
  dev: DevLine[]
  /** Devices on sale, newest first. */
  onSale: Product[]
  campaigns: CampaignLine[]
  support: { tickets: number; capacity: number; load: number }
  os: { name: string; version: number; own: boolean; quality: number; industry: number; project?: { progress: number; daysLeft: number }; services: number }
  chip?: { name: string; daysLeft: number }
  teams: TeamLine[]
  applicants: number
  /** People whose work is going notably well, by employee id. */
  shining: Set<string>
  /** The most skilled people of each role, who get the specialist stations. */
  stationed: Map<Role, string[]>
  hours: GameState['policy']['hours']
  /** A short summary of the factory, for what the teams talk about. */
  factory?: { bottleneck?: string; defectRate: number; running: boolean; idle: boolean }
  /** A short summary of the books. */
  finance: { cash: number; monthProfit: number; runwayMonths?: number; raiseInDays: number }
}

const own = (s: GameState) => s.products.filter((p) => p.companyId === 'player')

/** How far along a device in development is, from when it was started. */
export function devProgress(s: GameState, p: Product): number {
  if (p.status !== 'dev') return 1
  const total = s.day - p.launchDay + p.devDaysLeft
  return total > 0 ? Math.min(1, Math.max(0, (s.day - p.launchDay) / total)) : 0
}

export function researchLines(s: GameState): ResearchLine[] {
  const fx = staffEffects(s)
  const perDay = s.activeResearch.length ? ((s.rdBudget / DAYS_PER_MONTH) * s.config.researchSpeed * fx.research) / s.activeResearch.length : 0
  return s.activeResearch.map((id) => {
    const item = researchItem(s, id)
    const done = s.progress[id] ?? 0
    return { id, name: item.name, progress: item.cost > 0 ? Math.min(1, done / item.cost) : 0, daysLeft: perDay > 0 ? Math.ceil((item.cost - done) / perDay) : undefined }
  })
}

export function officeLife(s: GameState): OfficeLife {
  const fx = staffEffects(s)
  const mine = own(s)
  const tickets = dailyTickets(s)
  const capacity = fx.support + 20
  const proj = s.os.project
  const chip = s.chips.find((c) => c.status === 'dev')
  const byId = new Map(s.staff.map((e) => [e.id, e]))
  const stationed = new Map<Role, string[]>()
  for (const role of Object.keys(ROLE_INFO) as Role[]) {
    stationed.set(
      role,
      s.staff
        .filter((e) => e.role === role)
        .sort((a, b) => b.skill - a.skill)
        .map((e) => e.id),
    )
  }
  return {
    research: researchLines(s),
    budget: s.rdBudget,
    researchDone: Object.values(s.levels).reduce((a, n) => a + n, 0) + s.features.length,
    dev: mine.filter((p) => p.status === 'dev').map((p) => ({ product: p, progress: devProgress(s, p), daysLeft: p.devDaysLeft })),
    onSale: mine.filter((p) => p.status === 'sale').sort((a, b) => b.launchDay - a.launchDay),
    campaigns: s.campaigns.map((c) => {
      const product = c.target === 'brand' ? undefined : s.products.find((p) => p.id === c.target)
      return { id: c.id, channel: CHANNELS[c.channel].name, target: product ? product.name : 'The brand', productId: product?.id, monthly: c.monthly, spent: c.spent }
    }),
    support: { tickets, capacity, load: capacity > 0 ? tickets / capacity : 0 },
    os: {
      name: s.os.name,
      version: s.os.version,
      own: s.os.own,
      quality: s.os.quality,
      industry: industryOs(s.day),
      project: proj ? { progress: proj.total > 0 ? 1 - proj.daysLeft / proj.total : 0, daysLeft: proj.daysLeft } : undefined,
      services: servicesPerMonth(s),
    },
    chip: chip ? { name: chip.name, daysLeft: chip.devDaysLeft } : undefined,
    teams: s.teams.map((t) => ({ id: t.id, name: t.name, leadId: t.leadId, lead: t.leadId ? byId.get(t.leadId)?.name : undefined, members: t.members.filter((id) => byId.has(id)), bonus: teamBonus(s, t) })),
    applicants: s.candidates.length,
    shining: new Set(s.staff.filter((e) => isShining(e)).map((e) => e.id)),
    stationed,
    hours: s.policy.hours,
    factory: s.factory ? factoryTalk(s) : undefined,
    finance: financeTalk(s),
  }
}

function factoryTalk(s: GameState): NonNullable<OfficeLife['factory']> {
  const line = factoryLine(s)
  const first = line?.lines.find((l) => l.running)
  return { bottleneck: first?.bottleneck ?? undefined, defectRate: line?.defectRate ?? 0, running: !!line?.running, idle: !line?.running || !s.orders.some((o) => o.mode === 'factory' && orderLeft(o) > 0) }
}

function financeTalk(s: GameState): OfficeLife['finance'] {
  const r = s.reports[s.reports.length - 1]
  const monthProfit = r ? r.revenue + r.other - monthCosts(r) : 0
  return { cash: s.cash, monthProfit, runwayMonths: monthProfit < 0 ? s.cash / -monthProfit : undefined, raiseInDays: Math.max(0, RAISE_GAP - (s.day - s.stock.lastRaise)) }
}

/** Someone skilled and content enough that it shows. */
export const isShining = (e: Employee) => e.morale >= 62 && output(e, false) >= 1.35

export interface OrderLine {
  id: string
  product: string
  productId: string
  mode: 'contract' | 'factory'
  quantity: number
  done: number
}

export interface FactoryLife {
  line: LineStats | null
  orders: OrderLine[]
  /** True while the line has factory orders to work through. */
  producing: boolean
  /** Every unit made so far, in stock or sold. It only rises, so the view can count boxes as they come off the line. */
  built: number
  /** Share of units the test stations pull off the line. */
  caught: number
  /** Devices in the warehouse. */
  stock: number
}

export function factoryLife(s: GameState): FactoryLife {
  const line = factoryLine(s)
  const orders = s.orders.map((o) => ({ id: o.id, product: s.products.find((p) => p.id === o.productId)?.name ?? 'A device', productId: o.productId, mode: o.mode, quantity: o.quantity, done: o.done }))
  const mine = own(s)
  // untested units carry 6% faults (less with a control room); whatever the line ships below that, the test stations caught
  const coverage = line?.running ? Math.min(1, line.caps.test / Math.max(1, line.throughput)) : 0
  const untested = line?.running ? (0.06 * line.defectRate) / Math.max(1e-6, 0.06 - 0.052 * coverage) : 0
  return {
    line,
    orders,
    producing: !!line?.running && s.orders.some((o) => o.mode === 'factory' && orderLeft(o) > 0),
    built: mine.reduce((a, p) => a + p.stock + p.unitsSold, 0),
    caught: line?.running ? Math.max(0, untested - line.defectRate) : 0,
    stock: mine.reduce((a, p) => a + p.stock, 0),
  }
}

export interface StoreLife {
  name: string
  open: boolean
  visitors: number
  capacity: number
  /** Devices sold per day, averaged over this month so far. */
  perDay: number
  monthUnits: number
  unitsTotal: number
  /** What is on the tables; anything out of stock leaves a gap. */
  products: Product[]
  soldOut: Set<string>
}

export function storeLife(s: GameState, storeId: string): StoreLife | null {
  const st = s.stores.find((x) => x.id === storeId)
  if (!st) return null
  const stats = storeStats(st.site)
  const products = own(s).filter((p) => p.status === 'sale')
  const dayOfMonth = (s.day % DAYS_PER_MONTH) + 1
  return {
    name: st.name,
    open: stats.open,
    visitors: st.lastVisitors,
    capacity: stats.capacity,
    perDay: st.monthUnits / dayOfMonth,
    monthUnits: st.monthUnits,
    unitsTotal: st.unitsTotal,
    products,
    soldOut: new Set(products.filter((p) => p.stock <= 0).map((p) => p.id)),
  }
}

export interface ShowLine {
  id: string
  /** What kind of event it is, in words. */
  kind: string
  /** The device being launched, for a keynote. */
  product?: string
  productId?: string
  day: number
  daysLeft: number
  /** Held on this stage, rather than a hired one or online. */
  here: boolean
  place: string
}

export interface VenueLife {
  stats: VenueStats
  /** Events booked and not yet held, soonest first. */
  upcoming: ShowLine[]
  /** A keynote is booked for this stage: the house rehearses, fills and applauds on the day. */
  booked: boolean
  /** Share of the seats a show here fills, 0-1: a company with a following packs the house. */
  draw: number
  /** Keynotes held on this stage so far, and how the last one went. */
  held: number
  last?: { product: string; score: number; day: number }
}

export function venueLife(s: GameState): VenueLife | undefined {
  if (!s.venue) return undefined
  const stats = venueStats(s.venue)
  const name = (id?: string) => s.products.find((p) => p.id === id)?.name
  const upcoming = s.events
    .filter((e) => !e.done)
    .sort((a, b) => a.day - b.day)
    .map((e) => ({ id: e.id, kind: EVENTS[e.type].name, product: name(e.productId), productId: e.productId, day: e.day, daysLeft: Math.max(0, e.day - s.day), here: e.type === 'keynote' && e.venue === OWN_VENUE, place: EVENTS[e.type].venues[e.venue]?.name ?? '' }))
  const past = s.events.filter((e) => e.done && e.type === 'keynote' && e.venue === OWN_VENUE).sort((a, b) => b.day - a.day)
  return {
    stats,
    upcoming,
    booked: stats.ready && upcoming.some((e) => e.here),
    draw: Math.min(1, 0.62 + 0.38 * Math.min(1, s.fans / Math.max(2000, stats.seats * 60))),
    held: past.length,
    last: past[0] ? { product: name(past[0].productId) ?? 'A device', score: Math.round(past[0].score ?? 0), day: past[0].day } : undefined,
  }
}
