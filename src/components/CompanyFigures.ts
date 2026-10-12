// What the Company pages (Overview, Finance, Shares, Growth) say, worked out
// apart from how it is drawn, so it can be tested without a page.
import { DAYS_PER_MONTH } from '../data/catalog'
import { orderProduction } from '../sim/game'
import { GOALS, type Goal } from '../sim/goals'
import { type Attention, attention, reorderQuote, suggestReorder } from '../sim/insight'
import { marketPrice } from '../sim/ops'
import { capOfTab, has } from '../sim/progress'
import { founderStake, takeoverPrice } from '../sim/stock'
import { type Company, type CostKey, type GameState, type MonthReport, SUPPLY_CATS, type SupplyCat, monthCosts } from '../sim/types'
import { price } from './format'

// ---------------------------------------------------------------- the month

export interface MonthSums {
  income: number
  costs: number
  profit: number
  cash: number
}
export interface MonthFigures extends MonthSums {
  /** The month the figures are of, as an index (see `monthLabel`). */
  month: number
  /** No month has closed yet: these are the month so far. */
  partial: boolean
  /** The full month before, when there is one: what the change is measured against. */
  before: MonthSums | null
}

const sums = (r: MonthReport, cash: number): MonthSums => {
  const income = r.revenue + r.other
  const costs = monthCosts(r)
  return { income, costs, profit: income - costs, cash }
}

/** Income, costs, profit and cash of the last full month, and of the month before it. Before the first month closes: the month so far. */
export function monthFigures(g: GameState): MonthFigures {
  const last = g.reports[g.reports.length - 1]
  if (!last) return { ...sums(g.cur, g.cash), month: Math.floor(g.day / DAYS_PER_MONTH), partial: true, before: null }
  const prev = g.reports[g.reports.length - 2]
  return { ...sums(last, last.cash), month: last.month, partial: false, before: prev ? sums(prev, prev.cash) : null }
}

/** Cash at the close of each of the last months, oldest first, ending with cash today. */
export function cashTrend(g: GameState, months = 12): number[] {
  return [...g.reports.slice(-months).map((r) => r.cash), g.cash]
}

/** What cash has done since the last month closed (since the start, before one has). */
export function cashThisMonth(g: GameState): number {
  const last = g.reports[g.reports.length - 1]
  return g.cash - (last ? last.cash : g.config.startCash)
}

// ---------------------------------------------------------------- where the money goes

export type CostGroupId = 'people' | 'production' | 'marketing' | 'research' | 'other'
export interface CostGroup {
  id: CostGroupId
  label: string
  /** What is in the group, in words. */
  holds: string
  amount: number
  /** Its part of all costs, 0 to 1. */
  share: number
}

const GROUPS: { id: CostGroupId; label: string; holds: string; keys: CostKey[] }[] = [
  { id: 'people', label: 'People', holds: 'Salaries of everyone on the payroll, executives included.', keys: ['salaries'] },
  { id: 'production', label: 'Production', holds: 'Building devices: parts, assembly and fixed component prices.', keys: ['production'] },
  { id: 'marketing', label: 'Marketing', holds: 'Campaigns, events and keynotes.', keys: ['marketing'] },
  { id: 'research', label: 'Research and development', holds: 'The research budget, and the cost of developing each new device.', keys: ['rd', 'development'] },
  { id: 'other', label: 'Everything else', holds: 'Overheads, the running costs of the campus, factory, stores and offices abroad, and interest on debt.', keys: ['overhead', 'facilities', 'interest'] },
]

/** A month's costs in five groups, in a fixed order. Every cost is in exactly one of them. */
export function costGroups(r: MonthReport): CostGroup[] {
  const total = monthCosts(r)
  return GROUPS.map((x) => {
    const amount = x.keys.reduce((a, k) => a + r[k], 0)
    return { id: x.id, label: x.label, holds: x.holds, amount, share: total > 0 ? amount / total : 0 }
  })
}

export interface LedgerRow extends MonthSums, Record<CostGroupId, number> {
  month: number
  units: number
}
/** The monthly statement, newest first: one row a month with the same five groups of cost. */
export function ledger(g: GameState, months = 36): LedgerRow[] {
  return [...g.reports]
    .reverse()
    .slice(0, months)
    .map((r) => {
      const by = Object.fromEntries(costGroups(r).map((c) => [c.id, c.amount])) as Record<CostGroupId, number>
      return { ...sums(r, r.cash), ...by, month: r.month, units: r.units }
    })
}

// ---------------------------------------------------------------- component supply

export interface SupplyRow {
  cat: SupplyCat
  /** Today's market price against the normal one: 1 is normal. */
  price: number
  /** What the company pays: the fixed price while one holds, otherwise the market's. */
  paying: number
  /** Days a shortage still has to run, 0 when there is none. */
  shortDays: number
  /** The day a fixed price ends, when one holds. */
  fixedUntil: number | null
  /** Month-end prices, oldest first, ending with today's. */
  trend: number[]
}

export function supplyRows(g: GameState): SupplyRow[] {
  return SUPPLY_CATS.map((cat) => {
    const now = marketPrice(g.supply, cat)
    const lock = g.supply.locks[cat]
    const fixed = lock && lock.until > g.day ? lock : null
    return { cat, price: now, paying: fixed ? fixed.value : now, shortDays: Math.max(0, g.supply.shockDays[cat]), fixedUntil: fixed ? fixed.until : null, trend: [...g.supply.history[cat].slice(-11), now] }
  })
}

/** Categories in short supply whose price the company has not fixed: the ones that are costing it. */
export const shortages = (g: GameState) => supplyRows(g).filter((r) => r.shortDays > 0 && r.fixedUntil === null)

// ---------------------------------------------------------------- shares

/**
 * A share price: dollars and cents. A new company's shares are worth well
 * under a dollar, so the short money format (whole dollars under a thousand)
 * cannot be used for it.
 */
export function sharePrice(v: number): string {
  if (!Number.isFinite(v)) return '--'
  const cents = Math.round(Math.abs(v) * 100)
  const text = `${price(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, '0')}`
  return v < 0 && cents > 0 ? `-${text}` : text
}

export interface RivalRow {
  company: Company
  value: number
  /** The part of it the player holds, 0 to 1. */
  stake: number
  /** What buying the rest of it costs. */
  buyout: number
  /** There is cash in hand to buy it outright today. */
  affordable: boolean
}

/** The other companies, most valuable first, with what each would cost. One already bought stays in the list. */
export function rivalRows(g: GameState, valueOf: (c: Company) => number): RivalRow[] {
  return g.companies
    .filter((c) => !c.isPlayer && (c.alive || c.acquired))
    .map((c) => {
      const stake = g.stock.holdings[c.id]?.stake ?? 0
      const buyout = takeoverPrice(g, c)
      return { company: c, value: c.value ?? valueOf(c), stake, buyout, affordable: !c.acquired && c.alive && g.cash >= buyout }
    })
    .sort((a, b) => Number(!!a.company.acquired) - Number(!!b.company.acquired) || b.value - a.value)
}

/** The founder's part of the company after new shares, `part` of those in issue, are sold to someone else. */
export const stakeAfterIssue = (g: GameState, part: number) => g.stock.founder / (g.stock.shares * (1 + part))

/** The founder's part after selling `stake` of the enlarged company (a funding round, or a listing). */
export const stakeAfterSale = (g: GameState, stake: number) => founderStake(g) * (1 - stake)

/** What a buyback of `amount` does: shares cancelled, what is paid, and the founder's part afterwards. As the sim counts it. */
export function buybackQuote(g: GameState, amount: number): { shares: number; spent: number; stake: number } {
  const k = g.stock
  const each = k.price * (k.listed ? 1.04 : 1.25)
  const others = k.shares - k.founder
  const shares = Math.max(0, Math.min(others, Math.floor(amount / each)))
  return { shares, spent: Math.round(shares * each), stake: k.founder / (k.shares - shares) }
}

/** Whether the board has any say: someone else holds shares, and the founder holds half or less. */
export const boardRules = (g: GameState) => founderStake(g) < 0.5 && g.stock.investors.length + (g.stock.listed ? 1 : 0) > 0

// ---------------------------------------------------------------- goals

export interface GoalRow {
  goal: Goal
  /** 0 to 1; a goal that has been reached is 1. */
  progress: number
  /** The day it was reached. */
  reached: number | undefined
}

/** Every goal with where it stands: within each group, the nearest to done first and the ones reached last. */
export function goalRows(g: GameState): GoalRow[] {
  return GOALS.map((goal) => {
    const reached = g.goals[goal.id]
    return { goal, reached, progress: reached !== undefined ? 1 : Math.max(0, Math.min(1, goal.progress(g))) }
  }).sort((a, b) => Number(a.reached !== undefined) - Number(b.reached !== undefined) || b.progress - a.progress)
}

export const GOAL_GROUPS: Goal['group'][] = ['Products', 'Company', 'Reach', 'Money']

// ---------------------------------------------------------------- what needs the player

/** What each place is called, on the list and on its building in the city. */
export const PLACE_NAME: Record<Attention['place'], string> = { campus: 'Campus', port: 'Port', factory: 'Factory', store: 'Store', research: 'Research', venue: 'Venue', exchange: 'Exchange', marketing: 'Marketing' }

/** The items that are put right by ordering more units. */
export const reorderable = (a: Attention) => (a.id === 'soldout' || a.id === 'lowstock') && !!a.productIds?.length

/**
 * Where an item's one action leads. Stock is ordered from the device itself
 * (Devices, Mine) and component supply is on Company, Finance; everything else
 * goes where the item says.
 */
export function placeOf(a: Attention): { tab: string; view?: string } {
  if (a.id === 'shortage') return { tab: 'finance' }
  if (a.id === 'soldout' || a.id === 'lowstock' || a.id === 'nostock') return { tab: 'products' }
  return a.where
}

/** What needs the player. In a guided game a warning about a part of the company that is not open yet is left out; bad news never is. */
export function needsYou(g: GameState): Attention[] {
  return attention(g).filter((a) => {
    const cap = capOfTab(placeOf(a).tab)
    return !cap || has(g, cap) || a.tone === 'neg'
  })
}

export interface ReorderLine {
  id: string
  name: string
  /** Units to order: the suggestion for this device. */
  units: number
  cost: number
  days: number
  mode: 'contract' | 'factory'
}
export interface ReorderPlan {
  lines: ReorderLine[]
  units: number
  cost: number
}

/** What "Reorder all" would order for these devices: the suggested run of each, with what it costs today. Devices that need nothing are left out. */
export function reorderPlan(g: GameState, productIds: readonly string[]): ReorderPlan {
  const lines: ReorderLine[] = []
  for (const id of productIds) {
    const p = g.products.find((x) => x.id === id)
    if (!p) continue
    const units = suggestReorder(g, p)
    if (units <= 0) continue
    const q = reorderQuote(g, p, units)
    if (q.refused) continue
    lines.push({ id, name: p.name, units, cost: q.cost, days: q.days, mode: q.mode })
  }
  return { lines, units: lines.reduce((a, l) => a + l.units, 0), cost: lines.reduce((a, l) => a + l.cost, 0) }
}

/** Place the orders of a plan, through the simulation's own order action. Returns how many it took. */
export function placeReorders(g: GameState, plan: ReorderPlan): number {
  let taken = 0
  for (const l of plan.lines) if (orderProduction(g, l.id, l.units, l.mode) === null) taken++
  return taken
}

// ---------------------------------------------------------------- the lock card

export interface CardPlace {
  left: number
  top: number
  width: number
  maxHeight: number
}
const CARD_W = 340
const CARD_GAP = 8

/**
 * Where the card for a locked place goes, in window coordinates. Asked for
 * from the menu (`y` is the top of the item), it sits just right of the menu,
 * level with the item; asked for anywhere else, in the middle of what is free.
 * Either way it stays under the top bar, above the message strip (`bottom`),
 * left of an open drawer (`right`), and never taller than the room between.
 */
export function placeCard({ y, height, win, rail, top, bottom, right }: { y?: number; height: number; win: { w: number; h: number }; rail: number; top: number; bottom: number; right: number }): CardPlace {
  const floor = Math.min(bottom, win.h)
  const wall = Math.min(right, win.w)
  const maxHeight = Math.max(120, floor - top - CARD_GAP * 2)
  const width = Math.max(200, Math.min(CARD_W, wall - rail - CARD_GAP * 2))
  const tall = Math.min(height, maxHeight)
  const lowest = floor - CARD_GAP - tall
  const want = y !== undefined ? y - CARD_GAP : top + 44
  const left = y !== undefined ? rail + CARD_GAP : rail + Math.max(CARD_GAP, (wall - rail - width) / 2)
  return { left: Math.round(Math.min(left, Math.max(rail + CARD_GAP, wall - CARD_GAP - width))), top: Math.round(Math.max(top + CARD_GAP, Math.min(want, lowest))), width, maxHeight }
}
