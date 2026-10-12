import { describe, expect, it } from 'vitest'
import { defaultConfig, newGame } from '../sim/game'
import { GOALS } from '../sim/goals'
import { rivalValue } from '../sim/stock'
import { COST_KEYS, type GameState, type MonthReport, monthCosts } from '../sim/types'
import { buybackQuote, cashThisMonth, cashTrend, costGroups, goalRows, ledger, monthFigures, needsYou, placeCard, placeOf, placeReorders, reorderPlan, reorderable, rivalRows, sharePrice, shortages, stakeAfterIssue, supplyRows } from './CompanyFigures'

const start = (patch: Partial<ReturnType<typeof defaultConfig>> = {}) => newGame({ ...defaultConfig(), progression: 'open', ...patch })
const report = (month: number, patch: Partial<MonthReport> = {}): MonthReport => ({ month, revenue: 0, other: 0, production: 0, rd: 0, marketing: 0, development: 0, overhead: 0, salaries: 0, facilities: 0, interest: 0, units: 0, cash: 0, funding: 0, ...patch })

describe('the month', () => {
  it('is the month so far until one has closed', () => {
    const g = start()
    const f = monthFigures(g)
    expect(f.partial).toBe(true)
    expect(f.before).toBeNull()
    expect(f.cash).toBe(g.cash)
  })

  it('is the last full month, against the one before', () => {
    const g = start()
    g.reports.push(report(0, { revenue: 100, salaries: 40, cash: 1000 }), report(1, { revenue: 300, other: 50, salaries: 60, production: 90, cash: 1200 }))
    const f = monthFigures(g)
    expect(f).toMatchObject({ partial: false, month: 1, income: 350, costs: 150, profit: 200, cash: 1200 })
    expect(f.before).toEqual({ income: 100, costs: 40, profit: 60, cash: 1000 })
  })

  it('draws cash from the month ends to today', () => {
    const g = start()
    g.reports.push(report(0, { cash: 5 }), report(1, { cash: 7 }))
    g.cash = 9
    expect(cashTrend(g)).toEqual([5, 7, 9])
    expect(cashThisMonth(g)).toBe(2)
  })
})

describe('cost groups', () => {
  it('put every cost in exactly one group', () => {
    const r = report(3)
    COST_KEYS.forEach((k, i) => (r[k] = (i + 1) * 10))
    const groups = costGroups(r)
    expect(groups.map((c) => c.id)).toEqual(['people', 'production', 'marketing', 'research', 'other'])
    expect(groups.reduce((a, c) => a + c.amount, 0)).toBe(monthCosts(r))
    expect(groups.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1)
  })

  it('have no shares when nothing was spent', () => {
    expect(costGroups(report(0)).every((c) => c.share === 0)).toBe(true)
  })

  it('make a statement whose groups add up to its costs, newest first', () => {
    const g = start()
    g.reports.push(report(0, { salaries: 5, rd: 2 }), report(1, { revenue: 50, overhead: 3, development: 4, interest: 1 }))
    const rows = ledger(g)
    expect(rows.map((r) => r.month)).toEqual([1, 0])
    for (const r of rows) expect(r.people + r.production + r.marketing + r.research + r.other).toBe(r.costs)
    expect(rows[0]).toMatchObject({ research: 4, other: 4, profit: 42 })
  })
})

describe('component supply', () => {
  it('is calm at the start', () => {
    const g = start()
    const rows = supplyRows(g)
    expect(rows).toHaveLength(5)
    expect(rows.every((r) => r.shortDays === 0 && r.fixedUntil === null)).toBe(true)
    expect(shortages(g)).toEqual([])
  })

  it('counts a shortage until its price is fixed', () => {
    const g = start()
    g.supply.shockDays.memory = 23
    g.supply.shock.memory = 0.4
    expect(shortages(g).map((r) => r.cat)).toEqual(['memory'])
    const row = supplyRows(g).find((r) => r.cat === 'memory')!
    expect(row.shortDays).toBe(23)
    expect(row.price).toBeGreaterThan(1.2)
    g.supply.locks.memory = { value: 1.02, until: g.day + 100 }
    expect(shortages(g)).toEqual([])
    expect(supplyRows(g).find((r) => r.cat === 'memory')).toMatchObject({ paying: 1.02, fixedUntil: g.day + 100 })
    // a contract that has run out no longer counts
    g.supply.locks.memory = { value: 1.02, until: g.day }
    expect(shortages(g)).toHaveLength(1)
  })
})

describe('shares', () => {
  it('writes a share price with its cents', () => {
    expect(sharePrice(0.6)).toBe('$0.60')
    expect(sharePrice(127.519)).toBe('$127.52')
    expect(sharePrice(1299.996)).toBe('$1,300.00')
    expect(sharePrice(NaN)).toBe('--')
  })

  it('offers a buyout only when there is the cash for it', () => {
    const g = start({ startCash: 1e6 })
    const poor = rivalRows(g, rivalValue)
    expect(poor.length).toBeGreaterThan(3)
    expect(poor.some((r) => r.affordable)).toBe(false)
    for (let i = 1; i < poor.length; i++) expect(poor[i - 1].value).toBeGreaterThanOrEqual(poor[i].value)
    g.cash = poor[poor.length - 1].buyout
    const rich = rivalRows(g, rivalValue)
    expect(rich.filter((r) => r.affordable).map((r) => r.company.id)).toContain(poor[poor.length - 1].company.id)
    expect(rich[0].affordable).toBe(rich[0].buyout <= g.cash)
  })

  it('says what a buyback and an issue do to the founder', () => {
    const g = start()
    const k = g.stock
    k.listed = true
    k.shares = 12e6
    k.founder = 6e6
    k.price = 10
    const q = buybackQuote(g, 10.4e6)
    expect(q.shares).toBe(1e6)
    expect(q.spent).toBe(10.4e6)
    expect(q.stake).toBeCloseTo(6 / 11)
    // it cannot buy more than the others hold
    expect(buybackQuote(g, 1e12).stake).toBe(1)
    expect(stakeAfterIssue(g, 0.1)).toBeCloseTo(6 / 13.2)
  })
})

describe('goals', () => {
  it('lists every goal once, reached ones last', () => {
    const g = start()
    g.goals[GOALS[0].id] = 12
    const rows = goalRows(g)
    expect(rows).toHaveLength(GOALS.length)
    expect(rows[rows.length - 1]).toMatchObject({ reached: 12, progress: 1 })
    expect(rows.slice(0, -1).every((r) => r.reached === undefined && r.progress >= 0 && r.progress <= 1)).toBe(true)
  })
})

/** A game with one device on sale that has sold and has nothing left. */
function soldOut(): GameState {
  const g = start({ startCash: 50e6 })
  const rival = g.products.find((p) => p.companyId !== 'player' && p.status === 'sale')!
  const mine = { ...JSON.parse(JSON.stringify(rival)), id: 'mine1', companyId: 'player', name: 'Test One', family: 'Test', variant: '', stock: 0, status: 'sale' as const, launchDay: g.day - 200, history: [4000, 5000, 6000], monthUnits: 0, unitsSold: 15000, revenue: 15000 * 300 }
  g.products.push(mine)
  return g
}

describe('what needs the player', () => {
  it('groups sold-out devices into one item that can be reordered', () => {
    const g = soldOut()
    g.products.push({ ...JSON.parse(JSON.stringify(g.products.find((p) => p.id === 'mine1')!)), id: 'mine2', name: 'Test Two' })
    const items = needsYou(g).filter((a) => a.id === 'soldout')
    expect(items).toHaveLength(1)
    expect(items[0].count).toBe(2)
    expect(reorderable(items[0])).toBe(true)
    expect(placeOf(items[0])).toEqual({ tab: 'products' })
  })

  it('reorders the suggested run of each device through the sim', () => {
    const g = soldOut()
    const plan = reorderPlan(g, ['mine1', 'nobody'])
    expect(plan.lines).toHaveLength(1)
    expect(plan.units).toBeGreaterThan(0)
    expect(plan.cost).toBeGreaterThan(0)
    expect(placeReorders(g, plan)).toBe(1)
    expect(g.orders).toHaveLength(1)
    expect(g.orders[0]).toMatchObject({ productId: 'mine1', quantity: plan.units, mode: plan.lines[0].mode })
    // with the order placed the device no longer needs anything
    expect(needsYou(g).some((a) => a.id === 'soldout')).toBe(false)
    expect(reorderPlan(g, ['mine1']).lines).toEqual([])
  })

  it('sends a shortage to Finance, where supply is', () => {
    const g = start()
    g.supply.shockDays.displays = 10
    const item = needsYou(g).find((a) => a.id === 'shortage')!
    expect(placeOf(item)).toEqual({ tab: 'finance' })
  })

  it('keeps a warning about a locked part of a guided company out, and bad news in', () => {
    const g = newGame({ ...defaultConfig(), progression: 'guided' })
    g.supply.shockDays.displays = 10
    expect(needsYou(g).some((a) => a.id === 'shortage')).toBe(false)
    g.cash = -5
    expect(needsYou(g).some((a) => a.id === 'debt')).toBe(true)
  })
})

describe('the lock card', () => {
  const room = { win: { w: 1180, h: 620 }, rail: 172, top: 40, bottom: 576, right: 1180 }
  const inside = (p: ReturnType<typeof placeCard>, height: number, r = room) => {
    const h = Math.min(height, p.maxHeight)
    expect(p.left).toBeGreaterThanOrEqual(r.rail)
    expect(p.left + p.width).toBeLessThanOrEqual(r.right)
    expect(p.top).toBeGreaterThanOrEqual(r.top)
    expect(p.top + h).toBeLessThanOrEqual(r.bottom)
  }

  it('sits beside the menu item it was asked for from', () => {
    const p = placeCard({ ...room, y: 200, height: 320 })
    expect(p.left).toBe(180)
    expect(p.top).toBe(192)
    inside(p, 320)
  })

  it('moves up rather than cover the message strip', () => {
    const p = placeCard({ ...room, y: 520, height: 380 })
    expect(p.top + 380).toBeLessThanOrEqual(room.bottom - 8)
    inside(p, 380)
  })

  it('is never taller than the room between the top bar and the strip', () => {
    const p = placeCard({ ...room, y: 300, height: 900 })
    expect(p.maxHeight).toBe(520)
    expect(p.top).toBe(48)
    inside(p, 900)
  })

  it('is centred when it was asked for elsewhere, and stays left of an open drawer', () => {
    const free = placeCard({ ...room, height: 300 })
    expect(free.left).toBe(172 + (1180 - 172 - 340) / 2)
    const beside = placeCard({ ...room, right: 760, height: 300 })
    inside(beside, 300, { ...room, right: 760 })
    expect(beside.left + beside.width).toBeLessThanOrEqual(752)
  })
})
