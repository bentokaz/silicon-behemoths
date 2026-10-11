// Ownership: what the company is worth, who holds its shares, private funding
// rounds, the stock market listing, and stakes in rivals.
import { clamp, pick, range } from './rng'
import { builtTiles } from './sites'
import { type Company, type GameState, type StockState, monthCosts } from './types'

export const START_SHARES = 10e6
export const IPO_MIN_VALUE = 200e6
export const RAISE_GAP = 180
const BACKERS: [string, string][] = [
  ['Sandhill Angels', 'Angel group'],
  ['Sequoyah Partners', 'Venture fund'],
  ['Andriessen Horovitz', 'Venture fund'],
  ['Softbunk Vision', 'Growth fund'],
  ['Tigre Global', 'Growth fund'],
  ['Blackstone Rock', 'Asset manager'],
  ['Temasik Holdings', 'Sovereign fund'],
  ['Founders Fond', 'Venture fund'],
]

export const newStock = (cash: number): StockState => ({
  listed: false,
  shares: START_SHARES,
  founder: START_SHARES,
  price: Math.max(0.1, cash / START_SHARES),
  history: [],
  investors: [],
  sentiment: 0,
  confidence: 70,
  lowDays: 0,
  payout: 0,
  lastRaise: -RAISE_GAP,
  holdings: {},
  dividendsPaid: 0,
})

/** Revenue and profit over the last twelve months, and how fast sales are growing. */
export function trailing(s: GameState): { revenue: number; profit: number; growth: number } {
  const last = [...s.reports.slice(-11), s.cur]
  const revenue = last.reduce((a, r) => a + r.revenue + r.other, 0)
  const profit = last.reduce((a, r) => a + r.revenue + r.other - monthCosts(r), 0)
  const recent = s.reports.slice(-6).reduce((a, r) => a + r.revenue + r.other, 0)
  const before = s.reports.slice(-12, -6).reduce((a, r) => a + r.revenue + r.other, 0)
  const growth = before > 0 && s.reports.length >= 12 ? clamp(recent / before, 0.5, 2.5) : 1.2
  return { revenue, profit, growth }
}

/** What the business is fundamentally worth today. */
export function valuation(s: GameState): number {
  const me = s.companies[0]
  const t = trailing(s)
  const multiple = 6 + 10 * (t.growth - 0.5)
  const estate = [s.office, s.factory, s.venue, ...s.stores.map((x) => x.site)].reduce((a, site) => a + (site ? builtTiles(site) * 900 : 0), 0)
  const stakes = Object.entries(s.stock.holdings).reduce((a, [id, h]) => a + h.stake * (s.companies.find((c) => c.id === id)?.value ?? 0), 0)
  const v = Math.max(0, s.cash) + Math.max(0, t.profit) * multiple + t.revenue * 0.4 * t.growth + me.brand * me.awareness * 120e6 + s.fans * 35 + estate + stakes + (s.os.own ? s.os.quality * 150e3 : 0)
  return Math.max(500e3, v + Math.min(0, s.cash) * 1.5)
}

export const marketCap = (s: GameState) => s.stock.price * s.stock.shares
export const founderStake = (s: GameState) => s.stock.founder / s.stock.shares
export const netWorth = (s: GameState) => s.stock.price * s.stock.founder

/** Daily: the share price chases the fundamentals, pushed around by mood. */
export function stepStock(s: GameState) {
  const k = s.stock
  const target = valuation(s) / k.shares
  if (!k.listed) {
    k.price = Math.max(0.01, k.price + (target - k.price) * 0.05)
    return
  }
  k.sentiment = clamp(k.sentiment * 0.985 + range(s, -0.05, 0.05), -1, 1)
  const fair = target * (1 + 0.3 * k.sentiment)
  k.price = Math.max(0.01, k.price + (fair - k.price) * 0.04 + k.price * range(s, -0.012, 0.012))
}

/** News that moves the market, on a scale of about -1 to 1. */
export function moveSentiment(s: GameState, by: number) {
  s.stock.sentiment = clamp(s.stock.sentiment + by, -1, 1)
}

export interface StockNote {
  text: string
  alert?: boolean
  ousted?: boolean
}

/** What each rival is worth, from what it sells. */
export function rivalValue(c: Company): number {
  const revenue = (c.revYear ?? []).reduce((a, b) => a + b, 0)
  return 15e6 + revenue * (0.5 + 1.2 * c.brand)
}

/** Month end: record prices, pay dividends, and let the board take stock. */
export function monthlyStock(s: GameState, monthProfit: number, canOust: boolean): { notes: StockNote[]; dividend: number } {
  const k = s.stock
  const notes: StockNote[] = []
  for (const c of s.companies) {
    if (c.isPlayer) continue
    c.revYear = [...(c.revYear ?? []), c.revMonth ?? 0].slice(-12)
    c.revMonth = 0
    const fresh = c.alive ? rivalValue(c) * range(s, 0.97, 1.03) : 0
    c.value = c.value === undefined ? fresh : c.value * 0.7 + fresh * 0.3
    c.valueHistory = [...(c.valueHistory ?? []), Math.round(c.value)].slice(-60)
  }
  k.history.push(Math.round(k.price * 100) / 100)
  if (k.history.length > 120) k.history.shift()

  let dividend = 0
  if (k.payout > 0 && monthProfit > 0 && s.cash > 0) {
    dividend = Math.min(s.cash, monthProfit * k.payout)
    k.dividendsPaid += dividend
  }
  const past = k.history[k.history.length - 4]
  let d = 0
  if (past) d += k.price >= past * 1.03 ? 3 : k.price < past * 0.9 ? -5 : 0
  d += monthProfit > 0 ? 2 : -2
  if (s.cash < 0) d -= 4
  d += k.payout * 8
  k.confidence = clamp(k.confidence + d, 0, 100)
  if (founderStake(s) < 0.5 && k.investors.length + (k.listed ? 1 : 0) > 0) {
    k.lowDays = k.confidence <= 8 ? k.lowDays + 1 : 0
    if (k.lowDays === 1) notes.push({ text: 'The board has lost confidence in you. Turn results around, or raise your stake above half, before they act.', alert: true })
    if (k.lowDays >= 4 && canOust) notes.push({ text: 'The board voted to replace you as chief executive.', alert: true, ousted: true })
  } else k.lowDays = 0
  return { notes, dividend }
}

// ---------------------------------------------------------------- raising money

/** Cash a private investor would pay for a stake, and who is offering. */
export function roundQuote(s: GameState, stake: number): { cash: number; name: string; kind: string; shares: number } {
  const v = valuation(s)
  // bigger slices come at a discount; investors pay up for growth
  const mult = (1.05 - 0.5 * stake) * (0.9 + 0.2 * clamp(trailing(s).growth - 1, -0.5, 1))
  const i = clamp(Math.floor(Math.log10(Math.max(1e6, v)) - 6) * 2 + (s.stock.investors.length % 2), 0, BACKERS.length - 1)
  const shares = Math.round((s.stock.shares * stake) / (1 - stake))
  return { cash: Math.round(((v * stake) / (1 - stake)) * mult), name: BACKERS[i][0], kind: BACKERS[i][1], shares }
}

export function raiseBlocked(s: GameState): string | null {
  if (s.stock.listed) return 'The company is listed; issue shares on the market instead'
  if (s.day - s.stock.lastRaise < RAISE_GAP) return `Investors want to see progress first: ${RAISE_GAP - (s.day - s.stock.lastRaise)} days until the next round`
  return null
}

/** Sell new shares to a private investor. Returns the cash raised, or an error. */
export function raiseRound(s: GameState, stake: number): { error?: string; cash: number; name: string } {
  const blocked = raiseBlocked(s)
  if (blocked) return { error: blocked, cash: 0, name: '' }
  const pct = clamp(stake, 0.02, 0.3)
  const q = roundQuote(s, pct)
  s.stock.shares += q.shares
  s.stock.investors.push({ name: q.name, kind: q.kind, shares: q.shares, paid: q.cash, day: s.day })
  s.stock.lastRaise = s.day
  s.stock.confidence = Math.min(100, s.stock.confidence + 5)
  return { cash: q.cash, name: q.name }
}

export function ipoBlocked(s: GameState): string | null {
  if (s.stock.listed) return 'Already listed'
  if (valuation(s) < IPO_MIN_VALUE) return `The company must be worth $${IPO_MIN_VALUE / 1e6}M to list`
  if (s.reports.length < 12) return 'The market wants to see a full year of accounts'
  return null
}

/** List on the stock market, selling `float` of the enlarged company to the public. */
export function goPublic(s: GameState, float: number): { error?: string; cash: number } {
  const blocked = ipoBlocked(s)
  if (blocked) return { error: blocked, cash: 0 }
  const pct = clamp(float, 0.05, 0.4)
  const k = s.stock
  const price = valuation(s) / k.shares
  const shares = Math.round((k.shares * pct) / (1 - pct))
  // banks and lawyers take 6%
  const cash = Math.round(shares * price * 0.94)
  k.shares += shares
  k.price = price
  k.listed = true
  k.lastRaise = s.day
  k.sentiment = 0.3
  return { cash }
}

export function issueBlocked(s: GameState): string | null {
  if (!s.stock.listed) return 'The company is not listed'
  if (s.day - s.stock.lastRaise < RAISE_GAP) return `The market will not take another issue for ${RAISE_GAP - (s.day - s.stock.lastRaise)} days`
  return null
}

/** Sell new shares on the market at a small discount. */
export function issueShares(s: GameState, pct: number): { error?: string; cash: number } {
  const blocked = issueBlocked(s)
  if (blocked) return { error: blocked, cash: 0 }
  const k = s.stock
  const shares = Math.round(k.shares * clamp(pct, 0.01, 0.15))
  const cash = Math.round(shares * k.price * 0.93)
  k.shares += shares
  k.lastRaise = s.day
  k.sentiment = clamp(k.sentiment - 0.15, -1, 1)
  return { cash }
}

/** Buy shares back from other holders and cancel them. Returns what was spent. */
export function buyBack(s: GameState, amount: number): { error?: string; spent: number } {
  const k = s.stock
  const others = k.shares - k.founder
  if (others <= 0) return { error: 'You already own every share', spent: 0 }
  const price = k.price * (k.listed ? 1.04 : 1.25)
  const shares = Math.min(others, Math.floor(amount / price))
  if (shares <= 0) return { error: 'That would not buy a single share', spent: 0 }
  // private backers are bought out in the order they arrived
  let left = shares
  for (const inv of k.investors) {
    const take = Math.min(inv.shares, left)
    inv.shares -= take
    left -= take
  }
  k.investors = k.investors.filter((i) => i.shares > 0)
  k.shares -= shares
  k.sentiment = clamp(k.sentiment + 0.08, -1, 1)
  k.confidence = Math.min(100, k.confidence + 2)
  return { spent: Math.round(shares * price) }
}

// ---------------------------------------------------------------- rivals

export const stakeIn = (s: GameState, id: string) => s.stock.holdings[id]?.stake ?? 0
/** Price of a slice of a rival bought on the market. */
export const stakePrice = (c: Company, pct: number) => Math.round((c.value ?? rivalValue(c)) * pct * 1.08)
/** Price to buy everything you do not already own, at a takeover premium. */
export const takeoverPrice = (s: GameState, c: Company) => Math.round((c.value ?? rivalValue(c)) * (1 - stakeIn(s, c.id)) * 1.4)

export function buyStake(s: GameState, id: string, pct: number): { error?: string; cost: number } {
  const c = s.companies.find((x) => x.id === id)
  if (!c || c.isPlayer || !c.alive) return { error: 'That company cannot be bought', cost: 0 }
  const have = stakeIn(s, id)
  const take = Math.min(pct, 0.49 - have)
  if (take <= 0.001) return { error: 'You can hold at most 49% without making a takeover bid', cost: 0 }
  const cost = stakePrice(c, take)
  const h = (s.stock.holdings[id] ??= { stake: 0, paid: 0 })
  h.stake += take
  h.paid += cost
  return { cost }
}

export function sellStake(s: GameState, id: string): number {
  const c = s.companies.find((x) => x.id === id)
  const h = s.stock.holdings[id]
  if (!c || !h) return 0
  delete s.stock.holdings[id]
  return Math.round((c.value ?? 0) * h.stake * 0.97)
}

/** Dividends from stakes in rivals, paid monthly: a small share of what they earn. */
export function holdingIncome(s: GameState): number {
  let total = 0
  for (const [id, h] of Object.entries(s.stock.holdings)) {
    const c = s.companies.find((x) => x.id === id)
    if (c?.alive) total += ((c.revYear ?? []).reduce((a, b) => a + b, 0) / 12) * 0.03 * h.stake
  }
  return total
}

export const pickBacker = (s: GameState) => pick(s, BACKERS)[0]
