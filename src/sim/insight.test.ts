import { describe, expect, it } from 'vitest'
import { DAYS_PER_MONTH } from '../data/catalog'
import { type LaunchOrder, autoLine, autoVenue, buildFactory, buildVenue, defaultConfig, discontinue, fundingRound, hire, newGame, openStore, orderProduction, scheduleEvent, startCampaign, startProduct, starterDesign, tick, toggleResearch } from './game'
import { SMALLEST_RUN, type Attention, attention, demandEstimate, plates, productProfit, productTrend, reorderQuote, storeMonth, storesMonth, suggestReorder, unitCostParts, whyLines } from './insight'
import { CONTRACT, buildCost, pendingUnits } from './ops'
import type { DeviceType, GameState } from './types'

const fresh = (seed = 7, extra: Partial<ReturnType<typeof defaultConfig>> = {}) => newGame({ ...defaultConfig(), seed, ...extra })
const rich = (seed = 7) => fresh(seed, { unlimitedMoney: true })
const mine = (s: GameState) => s.products.filter((p) => p.companyId === 'player')
function order(s: GameState, patch: Partial<LaunchOrder> = {}): LaunchOrder {
  return { design: starterDesign(s), family: 'Test', variant: '', price: 399, tiers: [], quantity: 20000, mode: 'contract', marketing: 200e3, ...patch }
}
/** Advance until nothing of the player's is still in development. */
function untilOnSale(s: GameState) {
  let guard = 0
  while (mine(s).some((p) => p.status === 'dev') && guard++ < 400) tick(s, 1)
}
/** Advance to the day a month has just closed. */
function toMonthStart(s: GameState) {
  tick(s, DAYS_PER_MONTH - (s.day % DAYS_PER_MONTH))
}

/** Every helper, called on everything in the state: used to check that none of them throws or writes. */
function callEverything(s: GameState): string[] {
  const texts: string[] = []
  for (const st of s.stores) storeMonth(s, st.id)
  storeMonth(s, 'no-such-store')
  storesMonth(s)
  for (const p of s.products) {
    for (const w of whyLines(s, p)) texts.push(w.text)
    productTrend(s, p)
    productProfit(s, p)
    suggestReorder(s, p)
    reorderQuote(s, p, 12345)
  }
  const design = starterDesign(s)
  texts.push(demandEstimate(s, design, 399).note)
  demandEstimate(s, starterDesign(s, 'laptop'), 1299, { marketing: 3e6, hype: 0.5, mode: 'factory', variant: true })
  unitCostParts(s, design, 'contract')
  unitCostParts(s, design, 'factory')
  for (const a of attention(s)) texts.push(a.text)
  for (const pl of plates(s)) for (const l of pl.lines) texts.push(pl.title, l.text)
  return texts
}

/** A company with everything built: a factory, a store, a venue, investors, staff, research, two devices. */
function lateGame(seed = 7): GameState {
  const s = rich(seed)
  expect(fundingRound(s, 0.2)).toBeNull()
  expect(startProduct(s, order(s, { family: 'Nova', quantity: 400000 }))).toBeNull()
  expect(buildFactory(s)).toBeNull()
  expect(autoLine(s)).toBeNull()
  expect(buildVenue(s)).toBeNull()
  expect(autoVenue(s)).toBeNull()
  for (let i = 0; i < 4; i++) hire(s, s.candidates[0].id)
  s.rdBudget = 300e3
  expect(toggleResearch(s, 'display')).toBeNull()
  tick(s, 100)
  expect(openStore(s, 1)).toBeNull()
  expect(startCampaign(s, 'online', 'brand', 200e3)).toBeNull()
  expect(startProduct(s, order(s, { family: 'Orbit', design: starterDesign(s, 'tablet'), price: 499, quantity: 30000, mode: 'factory', keynote: 3 }))).toBeNull()
  scheduleEvent(s, 'expo', 1)
  tick(s, 290)
  return s
}

describe('stores', () => {
  it('projects a store month that adds up and matches the books', () => {
    const s = rich()
    startProduct(s, order(s, { quantity: 0 }))
    for (let i = 0; i < 4; i++) orderProduction(s, mine(s)[0].id, 2e6, 'contract')
    tick(s, 80)
    expect(openStore(s, 1)).toBeNull()
    const store = s.stores[0]
    toMonthStart(s)
    tick(s, DAYS_PER_MONTH)
    // the first day of a month: nothing recorded yet, so the whole figure is the projection
    expect(s.day % DAYS_PER_MONTH).toBe(0)
    const start = storeMonth(s, store.id)
    expect(start.partial).toBe(true)
    expect(start.profit).toBeCloseTo(start.revenue - start.costs, 6)
    expect(start.units).toBeGreaterThan(0)
    expect(start.revenue).toBeGreaterThan(0)
    expect(start.visitors).toBeGreaterThan(0)

    tick(s, DAYS_PER_MONTH - 1)
    // the books: with no factory or venue, a month's facilities cost is the store's rent, upkeep and wages
    const end = storeMonth(s, store.id)
    expect((end.costs * (DAYS_PER_MONTH - 1)) / DAYS_PER_MONTH).toBeCloseTo(s.cur.facilities, 0)
    // what it really sold over the month is what was projected on its first day, give or take the luck of the shop floor
    expect(store.monthUnits).toBeGreaterThan(start.units * 0.75)
    expect(store.monthUnits).toBeLessThan(start.units * 1.25)
    // with a day to go the projection is almost all recorded units
    expect(Math.abs(end.units - store.monthUnits)).toBeLessThanOrEqual(Math.ceil(store.monthUnits / 20) + 2)

    const all = storesMonth(s)
    expect(all.profit).toBeCloseTo(all.revenue - all.costs, 6)
    expect(all.units).toBe(end.units)
    expect(all.costs).toBeCloseTo(end.costs, 6)
    expect(storeMonth(s, 'no-such-store')).toEqual({ revenue: 0, costs: 0, profit: 0, units: 0, visitors: 0, partial: true })
    expect(storesMonth(fresh()).units).toBe(0)
  })
})

describe('devices', () => {
  it('says why a device sells as it does', () => {
    const s = rich()
    expect(startProduct(s, order(s, { family: 'Short', quantity: 300 }))).toBeNull()
    expect(startProduct(s, order(s, { family: 'Dear', price: 1999, quantity: 50000 }))).toBeNull()
    const short = mine(s).find((p) => p.family === 'Short')!
    const dear = mine(s).find((p) => p.family === 'Dear')!
    // in development: the first line says so, and with an order placed nothing else is wrong
    expect(whyLines(s, short)[0].kind).toBe('dev')
    expect(whyLines(s, short)[0].text).toMatch(/^In development: on sale in \d+ days, on \d\d \w{3} \d{4}\.$/)
    expect(whyLines(s, short)).toHaveLength(1)
    expect(suggestReorder(s, short)).toBe(0)
    expect(productTrend(s, short)).toEqual([])
    expect(productProfit(s, short)).toEqual({ month: 0, total: 0 })

    untilOnSale(s)
    tick(s, 45)
    expect(short.stock).toBe(0)
    expect(pendingUnits(s, short.id)).toBe(0)
    const why = whyLines(s, short)
    expect(why[0]).toMatchObject({ kind: 'soldout', tone: 'neg' })
    expect(why[0].text).toMatch(/^Sold out since \d\d \w{3} \d{4}: nothing is on order\.$/)
    // a new company: hardly anyone has heard of it
    expect(why.find((w) => w.kind === 'awareness')?.text).toMatch(/^Only \d+(\.\d)?% of buyers where you sell have heard of you\.$/)

    const dearWhy = whyLines(s, dear)
    const priceLine = dearWhy.find((w) => w.kind === 'price')!
    expect(priceLine.tone).toBe('neg')
    expect(priceLine.text).toMatch(/^Priced \d+% above the typical \$[\d,]+ for its segment\.$/)
    expect(dearWhy[0].tone).toBe('neg')

    // an order on the way turns the sold-out line into a warning with an arrival
    orderProduction(s, short.id, 5000, 'contract')
    const waiting = whyLines(s, short).find((w) => w.kind === 'soldout')!
    expect(waiting.tone).toBe('warn')
    expect(waiting.text).toMatch(/5K on order, the first in 10 days\.$/)

    discontinue(s, dear.id)
    expect(whyLines(s, dear)).toHaveLength(1)
    expect(whyLines(s, dear)[0].kind).toBe('ended')
    expect(suggestReorder(s, dear)).toBe(0)
    expect(reorderQuote(s, dear, 1000).refused).toBe('Product is not available')

    // every device in the game, rivals included, gets at least one plain line
    for (const p of s.products) {
      const lines = whyLines(s, p)
      expect(lines.length, p.name).toBeGreaterThan(0)
      for (const l of lines) expect(l.text, p.name).not.toMatch(/undefined|NaN|[–—]/)
    }
  })

  it('reads a device trend and profit from its history', () => {
    const s = rich()
    startProduct(s, order(s, { quantity: 0 }))
    const p = mine(s)[0]
    for (let i = 0; i < 3; i++) orderProduction(s, p.id, 2e6, 'contract')
    untilOnSale(s)
    const launchMonth = Math.floor(p.launchDay / DAYS_PER_MONTH)
    tick(s, 100)
    const closed = Math.floor(s.day / DAYS_PER_MONTH) - launchMonth
    const trend = productTrend(s, p)
    expect(trend).toHaveLength(closed)
    expect(trend).toEqual(p.history.slice(-closed))
    expect(trend.every((n) => n > 0)).toBe(true)
    tick(s, 400)
    expect(productTrend(s, p)).toHaveLength(12)

    const profit = productProfit(s, p)
    const cost = buildCost(s, p, 'contract')
    expect(profit.total).toBeCloseTo(p.revenue - p.unitsSold * cost, 0)
    expect(profit.total).toBeGreaterThan(0)
    expect(profit.month).toBeCloseTo(p.history.at(-1)! * (p.revenue / p.unitsSold - cost), 0)
    // a rival's books are not ours to read
    expect(productProfit(s, s.products.find((x) => x.companyId !== 'player')!)).toEqual({ month: 0, total: 0 })
  })

  it('suggests a reorder and quotes it by the cheapest route', () => {
    const s = rich()
    startProduct(s, order(s, { family: 'Seller', quantity: 6000 }))
    startProduct(s, order(s, { family: 'Stocked', price: 449, quantity: 0 }))
    const seller = mine(s).find((p) => p.family === 'Seller')!
    const stocked = mine(s).find((p) => p.family === 'Stocked')!
    for (let i = 0; i < 4; i++) orderProduction(s, stocked.id, 2e6, 'contract')
    untilOnSale(s)
    tick(s, 70)
    expect(seller.stock).toBe(0)
    const n = suggestReorder(s, seller)
    expect(n).toBeGreaterThanOrEqual(SMALLEST_RUN)
    // tidy: a multiple of half its power of ten
    expect(n % (Math.pow(10, Math.floor(Math.log10(n))) / 2)).toBe(0)
    // about three months of what it sold while it had stock
    const best = Math.max(...productTrend(s, seller))
    expect(n).toBeGreaterThanOrEqual(best * 3)
    expect(n).toBeLessThan(best * 3 * 2.1)
    // months of stock on hand: nothing to order
    expect(stocked.stock).toBeGreaterThan(1e6)
    expect(suggestReorder(s, stocked)).toBe(0)
    // what is already on order counts
    orderProduction(s, seller.id, n, 'contract')
    expect(suggestReorder(s, seller)).toBe(0)
    s.orders = s.orders.filter((o) => o.productId !== seller.id)

    // no factory: a contract maker, at its premium and its pace
    const q = reorderQuote(s, seller, 20000)
    expect(q.mode).toBe('contract')
    expect(q.refused).toBeUndefined()
    expect(q.unitCost).toBeCloseTo(buildCost(s, seller, 'contract'), 2)
    expect(q.cost).toBeCloseTo(20000 * q.unitCost, 4)
    expect(q.days).toBe(CONTRACT.leadDays - 1 + 20000 / CONTRACT.perDay)
    expect(reorderQuote(s, seller, 0).refused).toBe('Enter a quantity')
    // the simulation agrees on the day the last unit arrives
    const built = () => seller.stock + seller.unitsSold
    const before = built()
    orderProduction(s, seller.id, 20000, 'contract')
    tick(s, q.days - 1)
    expect(built() - before).toBeLessThan(20000)
    tick(s, 1)
    expect(built() - before).toBe(20000)

    // with a working line the factory is cheaper and is chosen
    expect(buildFactory(s)).toBeNull()
    expect(autoLine(s)).toBeNull()
    const f = reorderQuote(s, seller, 5000)
    expect(f.mode).toBe('factory')
    expect(f.unitCost).toBeLessThan(reorderQuote(fresh(), seller, 5000).unitCost)
    expect(f.days).toBe(10)
    const had = built()
    orderProduction(s, seller.id, 5000, 'factory')
    tick(s, f.days - 1)
    expect(built() - had).toBeLessThan(5000)
    tick(s, 1)
    expect(built() - had).toBe(5000)
  })

  it('splits a unit cost into the build and what the maker adds', () => {
    const s = rich()
    const design = starterDesign(s)
    const c = unitCostParts(s, design, 'contract')
    const f = unitCostParts(s, design, 'factory')
    expect(c.total).toBeCloseTo(c.build + c.premium, 6)
    expect(c.premiumRate).toBeCloseTo(0.1, 6)
    expect(f.premiumRate).toBeCloseTo(-0.1, 6)
    expect(f.build).toBe(c.build)
    expect(f.total).toBeLessThan(c.total)
    startProduct(s, order(s, { design }))
    const p = mine(s)[0]
    expect(c.build).toBeCloseTo(p.unitCost, 1)
    expect(c.total).toBeCloseTo(buildCost(s, p, 'contract'), 6)
  })
})

describe('what needs the player', () => {
  it('groups sold-out devices into one item and agrees with the navigation count', () => {
    const s = rich()
    for (const family of ['One', 'Two', 'Three']) expect(startProduct(s, order(s, { family, quantity: 200 }))).toBeNull()
    expect(attention(s).find((a) => a.id === 'soldout')).toBeUndefined()
    untilOnSale(s)
    tick(s, 45)
    const items = attention(s)
    const sold = items.filter((a) => a.id === 'soldout')
    expect(sold).toHaveLength(1)
    expect(sold[0]).toMatchObject({ place: 'port', tone: 'neg', count: 3, text: '3 devices are sold out with nothing on order.' })
    expect(sold[0].productIds).toHaveLength(3)
    // the same devices Shell.tsx counts on the Devices badge
    expect(sold[0].count).toBe(s.products.filter((p) => p.companyId === 'player' && p.status === 'sale' && p.stock <= 0 && !pendingUnits(s, p.id)).length)
    // bad news comes first
    const firstWarn = items.findIndex((a) => a.tone === 'warn')
    if (firstWarn >= 0) expect(items.slice(firstWarn).every((a) => a.tone === 'warn')).toBe(true)
    // one of them reordered: the item names the count that is left
    orderProduction(s, mine(s)[0].id, 5000, 'contract')
    expect(attention(s).find((a) => a.id === 'soldout')?.count).toBe(2)
    orderProduction(s, mine(s)[1].id, 5000, 'contract')
    expect(attention(s).find((a) => a.id === 'soldout')?.text).toBe('Three is sold out with nothing on order.')
  })

  it('covers people, research, the factory, stock and money', () => {
    const s = fresh()
    const ids = (g: GameState) => attention(g).map((a) => a.id)
    expect(ids(s)).toEqual([])
    // three hires for two desks
    for (let i = 0; i < 3; i++) expect(hire(s, s.candidates[0].id)).toBeNull()
    const desk = attention(s).find((a) => a.id === 'nodesk')!
    expect(desk).toMatchObject({ place: 'campus', count: 1, where: { tab: 'office' } })
    expect(desk.personIds).toEqual([s.staff[2].id])
    s.staff[0].ask = s.staff[0].salary + 500
    expect(attention(s).find((a) => a.id === 'raises')).toMatchObject({ count: 1, personIds: [s.staff[0].id], where: { tab: 'staff', view: 'team' } })
    // a budget with nothing to spend it on
    s.rdBudget = 100e3
    expect(attention(s).find((a) => a.id === 'noresearch')).toMatchObject({ place: 'research', tone: 'warn' })
    toggleResearch(s, 'display')
    expect(ids(s)).not.toContain('noresearch')
    // a device in development with nothing ordered, then a factory order with no line
    startProduct(s, order(s, { quantity: 0 }))
    expect(attention(s).find((a) => a.id === 'nostock')).toMatchObject({ place: 'port', count: 1 })
    s.orders.push({ id: 'qx', productId: mine(s)[0].id, quantity: 1000, done: 0, mode: 'factory', placedDay: s.day })
    expect(attention(s).find((a) => a.id === 'line')).toMatchObject({ place: 'factory', tone: 'neg', count: 1 })
    expect(ids(s)).not.toContain('nostock')
    // a shortage, unless the price is fixed
    s.supply.shockDays.memory = 50
    s.supply.shock.memory = 0.4
    expect(attention(s).find((a) => a.id === 'shortage')?.text).toMatch(/^Memory are in short supply: prices are \d+% above normal\.$/)
    s.supply.locks.memory = { value: 1, until: s.day + 100 }
    expect(ids(s)).not.toContain('shortage')
    // an open recall, an empty seat that was once filled, the board, the bank
    mine(s)[0].recall = { state: 'open', day: s.day, cost: 1 }
    expect(attention(s).find((a) => a.id === 'recall')).toMatchObject({ place: 'marketing', tone: 'neg', where: { tab: 'care' } })
    s.execSeats.cfo = { since: 0, vacant: s.day }
    expect(attention(s).find((a) => a.id === 'vacant')?.text).toBe('The Chief Financial Officer seat is empty.')
    s.stock.lowDays = 1
    expect(attention(s).find((a) => a.id === 'board')).toMatchObject({ place: 'exchange', tone: 'neg' })
    s.cash = -250e3
    s.debtDays = 12
    expect(attention(s).find((a) => a.id === 'debt')?.text).toBe('In debt by $250K for 12 days: bankruptcy follows after 360.')
    for (const a of attention(s)) expect(a.text).not.toMatch(/undefined|NaN|[–—]/)
  })

  it('flags a device about to run out and a store that loses money', () => {
    const s = rich()
    startProduct(s, order(s, { quantity: 0 }))
    const p = mine(s)[0]
    orderProduction(s, p.id, 2e6, 'contract')
    untilOnSale(s)
    tick(s, 70)
    expect(attention(s).map((a) => a.id)).not.toContain('lowstock')
    s.orders = []
    p.stock = Math.round(p.history.at(-1)! / 6)
    const low = attention(s).find((a) => a.id === 'lowstock')!
    expect(low).toMatchObject({ place: 'port', tone: 'warn', count: 1, productIds: [p.id] })
    expect(whyLines(s, p).find((w) => w.kind === 'soldout')?.text).toMatch(/^About \d+ days of stock left and nothing on order\.$/)
    // a flagship plot nobody has heard of yet cannot pay its rent
    p.stock = 1e6
    expect(openStore(s, 2)).toBeNull()
    const store = s.stores[0]
    expect(attention(s).some((a) => a.storeId === store.id)).toBe(false)
    tick(s, 95)
    const m = storeMonth(s, store.id)
    const item = attention(s).find((a) => a.id === `store-loss:${store.id}`)
    expect(!!item).toBe(m.profit < 0)
    if (item) expect(item).toMatchObject({ place: 'store', storeId: store.id, where: { tab: 'stores' } })
  })

  it('gives every owned place a plate, on the first day and late in the game', () => {
    const first = plates(fresh())
    expect(first.map((p) => p.place)).toEqual(['campus', 'port', 'research'])
    expect(first[0].lines.map((l) => l.text)).toEqual(['2 free desks', 'Nobody hired yet'])
    expect(first[1].lines.map((l) => l.text)).toEqual(['Nothing on sale yet', 'Nothing on order'])
    expect(first[2].lines[0].text).toBe('Nothing running')
    // a guided company starts as a garage: the Campus and the Port, nothing else
    expect(plates(fresh(7, { progression: 'guided' })).map((p) => p.place)).toEqual(['campus', 'port'])

    const s = lateGame()
    const all = plates(s)
    expect(all.map((p) => p.place)).toEqual(['campus', 'port', 'factory', 'store', 'research', 'venue', 'exchange'])
    expect(all.find((p) => p.place === 'store')).toMatchObject({ id: s.stores[0].id, title: s.stores[0].name, where: { tab: 'stores' } })
    const todo = attention(s)
    for (const p of all) {
      expect(p.lines.length, p.place).toBeGreaterThanOrEqual(1)
      expect(p.lines.length, p.place).toBeLessThanOrEqual(2)
      for (const l of p.lines) {
        expect(l.text.length, p.place).toBeGreaterThan(0)
        expect(l.text, p.place).not.toMatch(/undefined|NaN|[–—]/)
      }
      expect(p.needs, p.place).toBe(todo.filter((a: Attention) => a.place === p.place && (p.place !== 'store' || a.storeId === p.id)).length)
    }
    expect(all.find((p) => p.place === 'research')!.lines[0].text).toMatch(/^Display L\d.*: \d+(\.\d)?%$/)
    expect(all.find((p) => p.place === 'exchange')!.lines[0].text).toMatch(/^A share is worth \$/)
    expect(all.find((p) => p.place === 'venue')!.lines[1].text).toBe('Seats 144')
    // a second store is a second plate
    expect(openStore(s, 0)).toBeNull()
    expect(plates(s).filter((p) => p.place === 'store').map((p) => p.id)).toEqual(s.stores.map((st) => st.id))
    // an order on the line shows on the factory and the port
    orderProduction(s, mine(s)[0].id, 40000, 'factory')
    tick(s, 3)
    expect(plates(s).find((p) => p.place === 'factory')!.lines[0].text).toMatch(/^Building .+: \d+(\.\d)?% done$/)
    expect(plates(s).find((p) => p.place === 'port')!.lines[1].text).toBe('Next delivery in 1 day')
  })

  it('never writes to the game', () => {
    const states = [fresh(), fresh(3, { progression: 'guided' }), lateGame(5)]
    const sold = rich(9)
    startProduct(sold, order(sold, { quantity: 300 }))
    tick(sold, 150)
    states.push(sold)
    for (const s of states) {
      const before = JSON.stringify(s)
      const texts = callEverything(s)
      expect(JSON.stringify(s)).toBe(before)
      for (const t of texts) expect(t).not.toMatch(/undefined|NaN|[–—]/)
    }
  })
})

describe('demand estimate', () => {
  /** Estimate, then really launch with stock that cannot run out, and count what the first three months sold. */
  function launchAndMeasure(s: GameState, type: DeviceType, price: number, marketing: number) {
    const design = starterDesign(s, type)
    const est = demandEstimate(s, design, price, { marketing })
    expect(startProduct(s, order(s, { design, family: 'Probe', price, marketing, quantity: 0 }))).toBeNull()
    const p = mine(s).find((x) => x.family === 'Probe')!
    for (let i = 0; i < 12; i++) orderProduction(s, p.id, 5e6, 'contract')
    untilOnSale(s)
    tick(s, 90)
    return { est, sold: p.unitsSold }
  }

  it('brackets what the simulation then sells in a clear majority of launches', () => {
    const cases: { est: ReturnType<typeof demandEstimate>; sold: number }[] = []
    const NEW: [DeviceType, number, number][] = [['phone', 299, 0], ['phone', 549, 500e3], ['tablet', 449, 1e6], ['laptop', 999, 0], ['watch', 249, 5e6]]
    for (const seed of [11, 12]) for (const [type, price, marketing] of NEW) cases.push(launchAndMeasure(rich(seed), type, price, marketing))
    // a company a year in, with a device selling and a campaign running
    for (const seed of [13, 14]) {
      const s = rich(seed)
      startProduct(s, order(s, { quantity: 0, family: 'First' }))
      for (let i = 0; i < 6; i++) orderProduction(s, mine(s)[0].id, 5e6, 'contract')
      tick(s, 120)
      startCampaign(s, 'online', 'brand', 400e3)
      tick(s, 280)
      cases.push(launchAndMeasure(s, seed === 13 ? 'phone' : 'tablet', 479, seed === 13 ? 1e6 : 0))
    }
    const hits = cases.filter((c) => c.sold >= c.est.low && c.sold <= c.est.high).length
    console.log(`demandEstimate: ${hits} of ${cases.length} launches sold inside the range (${cases.map((c) => `${c.est.low}-${c.est.high}: ${c.sold}`).join('; ')})`)
    for (const c of cases) {
      expect(c.est.months).toBe(3)
      expect(c.est.low).toBeGreaterThan(0)
      expect(c.est.high).toBeGreaterThan(c.est.low)
      expect(c.est.high / c.est.low).toBeLessThan(2.2)
      expect(c.est.typicalPrice).toBeGreaterThan(0)
      // and never wildly off, even when it misses
      expect(c.sold).toBeGreaterThan(c.est.low * 0.6)
      expect(c.sold).toBeLessThan(c.est.high * 1.6)
    }
    expect(hits / cases.length).toBeGreaterThanOrEqual(0.75)
  }, 60000)

  it('moves the way the market does', () => {
    const s = rich()
    const design = starterDesign(s)
    const base = demandEstimate(s, design, 399)
    expect(demandEstimate(s, design, 999).high).toBeLessThan(base.low)
    expect(demandEstimate(s, design, 399, { marketing: 10e6 }).low).toBeGreaterThan(base.low)
    expect(demandEstimate(s, design, 399, { hype: 1 }).low).toBeGreaterThan(base.low)
    expect(base.typicalPrice).toBeGreaterThan(100)
    expect(base.note).toMatch(/^For \w+ buyers, if stock lasts: /)
  })
})
