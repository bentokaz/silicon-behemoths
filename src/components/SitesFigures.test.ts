import { describe, expect, it } from 'vitest'
import { type LaunchOrder, autoLine, autoVenue, buildFactory, buildVenue, defaultConfig, newGame, openStore, orderProduction, scheduleEvent, startProduct, starterDesign, tick } from '../sim/game'
import { OWN_VENUE } from '../sim/growth'
import { plates, storeMonth } from '../sim/insight'
import { openEverything } from '../sim/progress'
import type { GameState } from '../sim/types'
import { PULL_MIN, aSite, copyCost, factoryNow, factoryOrders, factoryStatus, nextEvent, profitLabel, signTone, starterStageCost, storeLabel, storeStatus, venueStatus, visitorsADay, visitorsNote } from './SitesFigures'
import { money } from './format'

function game(seed = 11): GameState {
  const s = newGame({ ...defaultConfig(), seed, unlimitedMoney: true })
  openEverything(s)
  return s
}
const order = (s: GameState, patch: Partial<LaunchOrder> = {}): LaunchOrder => ({ design: starterDesign(s), family: 'Vista', variant: '', price: 399, tiers: [], quantity: 0, mode: 'contract', marketing: 0, ...patch })
/** A game with a first device on sale. */
function selling(seed = 11): GameState {
  const s = game(seed)
  expect(startProduct(s, order(s, { quantity: 20000 }))).toBeNull()
  let guard = 0
  while (s.products.some((p) => p.companyId === 'player' && p.status === 'dev') && guard++ < 400) tick(s, 1)
  return s
}
const mine = (s: GameState) => s.products.find((p) => p.companyId === 'player')!
const value = (s: { value: unknown }) => String(s.value)

describe('the factory in one line', () => {
  it('has nothing to say without a factory', () => {
    expect(factoryStatus(game())).toEqual([])
  })

  it('a bare plot has no line, and says what to do', () => {
    const s = game()
    expect(buildFactory(s)).toBeNull()
    const now = factoryNow(s)
    expect(now.state).toBe('none')
    expect(now.text).toBe('No line')
    expect(now.why.length).toBeGreaterThan(10)
    const figures = factoryStatus(s)
    expect(figures.map((f) => f.label)).toEqual(['Making', 'Output a day', 'Quality', 'Upkeep a month'])
    expect(value(figures[1])).toBe('--')
  })

  it('is idle exactly when nothing is on order for it', () => {
    const s = selling()
    buildFactory(s)
    expect(autoLine(s)).toBeNull()
    expect(factoryNow(s).state).toBe('idle')
    expect(factoryNow(s).text).toBe('Idle')
    expect(factoryNow(s).queue).toHaveLength(0)
    // a contract maker's run is not the factory's work
    expect(orderProduction(s, mine(s).id, 5000, 'contract')).toBeNull()
    expect(factoryNow(s).state).toBe('idle')
    expect(factoryOrders(s)).toHaveLength(0)
    expect(orderProduction(s, mine(s).id, 50000, 'factory')).toBeNull()
    const now = factoryNow(s)
    expect(now.state).toBe('making')
    expect(now.queue).toHaveLength(1)
    expect(now.text).toBe(`${mine(s).name}: 0%`)
    expect(now.queue[0].days).toBeGreaterThan(0)
  })

  it('names the run being made and how far along it is, and agrees with the plate in the city', () => {
    const s = selling()
    buildFactory(s)
    autoLine(s)
    orderProduction(s, mine(s).id, 50000, 'factory')
    tick(s, 5)
    const now = factoryNow(s)
    const o = factoryOrders(s)[0]
    expect(now.queue[0].share).toBeCloseTo(o.done / o.quantity)
    expect(now.queue[0].share).toBeGreaterThan(0)
    const pctText = now.text.split(': ')[1]
    const plate = plates(s).find((p) => p.place === 'factory')!
    expect(plate.lines[0].text).toContain(mine(s).name)
    expect(plate.lines[0].text).toContain(pctText)
  })

  it('says stopped, in red, when runs wait on a line that is down', () => {
    const s = selling()
    buildFactory(s)
    autoLine(s)
    orderProduction(s, mine(s).id, 50000, 'factory')
    s.factory!.items = []
    const now = factoryNow(s)
    expect(now.state).toBe('stopped')
    expect(now.tone).toBe('neg')
    expect(now.queue[0].days).toBeNull()
    expect(now.why).toContain(mine(s).name)
  })
})

describe('a store in one line', () => {
  it('leads with profit, from the same figures as everything else', () => {
    const s = selling()
    expect(openStore(s, 1)).toBeNull()
    tick(s, 12)
    const store = s.stores[0]
    const m = storeMonth(s, store.id)
    const figures = storeStatus(s, store)
    expect(figures[0].label).toBe(profitLabel(m.partial))
    expect(m.partial ? figures[0].label : 'Projected').toContain('Projected')
    expect(value(figures[0])).toBe(money(m.profit))
    expect(figures[0].tone).toBe(signTone(m.profit))
    expect(figures[1].label).toBe('Revenue')
    expect(value(figures[1])).toBe(money(m.revenue))
    expect(figures[2].label).toBe('Visitors a day')
    expect(figures.length).toBe(3)
    expect(visitorsADay(store, m)).toBe(store.lastVisitors)
  })

  it('says first that a store is not trading', () => {
    const s = selling()
    openStore(s, 0)
    const store = s.stores[0]
    store.site.items = []
    const figures = storeStatus(s, store)
    expect(value(figures[0])).toBe('Not trading')
    expect(figures[0].tone).toBe('neg')
    expect(figures[0].title).toBeTruthy()
    expect(figures[1].label).toMatch(/profit/i)
  })

  it('names a store with its region', () => {
    const s = game()
    openStore(s, 0)
    expect(storeLabel(s.stores[0])).toMatch(new RegExp(`^${s.stores[0].name}, .+`))
  })

  it('says what holds the visitors down', () => {
    expect(visitorsNote(1500, 70, true)).toContain('can serve only 70')
    expect(visitorsNote(1500, 1500 * PULL_MIN, true)).not.toContain('only')
    expect(visitorsNote(500, 400, true)).toContain('up to the 400')
    expect(visitorsNote(500, 400, false)).toContain('closed')
  })

  it('writes the cost of a copy as a price or as money back', () => {
    expect(copyCost(12000)).toBe('$12K')
    expect(copyCost(-3400)).toBe('$3.4K back')
    expect(copyCost(0)).toBe('$0')
  })

  it('colours by sign', () => {
    expect(signTone(1)).toBe('pos')
    expect(signTone(-1)).toBe('neg')
    expect(signTone(0)).toBeUndefined()
  })
})

describe('the venue in one line', () => {
  it('prices the starter stage at what the simulation charges for it', () => {
    const s = game()
    s.config.unlimitedMoney = false
    s.cash = 50e6
    expect(buildVenue(s)).toBeNull()
    const before = s.cash
    expect(autoVenue(s)).toBeNull()
    expect(before - s.cash).toBe(starterStageCost())
  })

  it('is true for the starter open-air layout: ready, with its seats counted', () => {
    const s = game()
    buildVenue(s)
    let figures = venueStatus(s)
    expect(figures.map((f) => f.label)).toEqual(['Next event', 'Seats', 'Stage'])
    expect(value(figures[1])).toBe('0')
    expect(value(figures[2])).toBe('Not ready')
    expect(figures[2].tone).toBe('warn')
    autoVenue(s)
    figures = venueStatus(s)
    expect(value(figures[1])).toBe('144')
    expect(value(figures[2])).toBe('Ready')
    expect(figures[2].tone).toBeUndefined()
    expect(value(figures[0])).toBe('Nothing booked')
  })

  it('names the next event and its date, the same one as the plate in the city', () => {
    const s = game()
    buildVenue(s)
    autoVenue(s)
    expect(nextEvent(s)).toBeNull()
    expect(startProduct(s, order(s))).toBeNull()
    expect(scheduleEvent(s, 'keynote', OWN_VENUE, mine(s).id)).toBeNull()
    const next = nextEvent(s)!
    expect(next.here).toBe(true)
    expect(next.where).toContain(mine(s).name)
    const figure = venueStatus(s)[0]
    expect(value(figure)).toBe(`${next.name}: ${next.date}`)
    const plate = plates(s).find((p) => p.place === 'venue')!
    expect(plate.lines[0].text).toContain(next.name)
    expect(plate.lines[0].text).toContain(next.date)
  })

  it('turns red when a keynote is booked on a stage that cannot hold it', () => {
    const s = game()
    buildVenue(s)
    autoVenue(s)
    startProduct(s, order(s))
    scheduleEvent(s, 'keynote', OWN_VENUE, mine(s).id)
    s.venue!.items = []
    const stage = venueStatus(s)[2]
    expect(value(stage)).toBe('Not ready')
    expect(stage.tone).toBe('neg')
  })
})

describe('words', () => {
  it('puts the right article before a site', () => {
    expect(aSite('Arena site')).toBe('an arena site')
    expect(aSite('Plant site')).toBe('a plant site')
  })
})
