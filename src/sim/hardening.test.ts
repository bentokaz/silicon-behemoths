// Regression tests for what the soak and fuzz harness found (src/sim/testing,
// scripts/soak.mjs). Each one is the smallest game that showed the fault.
import { describe, expect, it } from 'vitest'
import { MAX_LEVEL, marketLevel } from '../data/catalog'
import { TYPES, segmentInfo } from '../data/devices'
import * as G from './game'
import { clampPart } from './geometry'
import { GOALS } from './goals'
import { EVENTS, resolveEvent } from './growth'
import { priceFactor } from './market'
import { CAPS, has, nextReq } from './progress'
import { REGIONS, homeOf, rivalReach } from './regions'
import { ITEMS, doorFits, isBoundary } from './sites'
import { adversary, monkey } from './testing/chaos'
import { fuzzDevices } from './testing/devicefuzz'
import { checkSite, checkState } from './testing/invariants'
import { hireOne, launch } from './testing/kit'
import { PERSONAS } from './testing/personas'
import { Play } from './testing/play'
import { ALL_PERSONAS, canon, runGame } from './testing/runner'
import { fuzzSites } from './testing/sitefuzz'
import { DEVICE_TYPES, type DeviceType, type GameState } from './types'
import { designProblem } from './validate'
import { MIN_FOUNDER, RAISE_GAP, founderStake, raiseBlocked } from './stock'
import { INCIDENTS, PEAK_DAY, priceIndex, rollIncident, settleIncident } from './world'

const game = (over: Partial<Parameters<typeof G.newGame>[0]> = {}) => G.newGame({ ...G.defaultConfig(), startCash: 500e6, ...over })
const sound = (s: GameState) => expect(checkState(s)).toEqual([])
const BAD = [NaN, Infinity, -Infinity, -1, 1e308]

/** A game with one device on sale and some of it in stock. */
function selling(over: Partial<Parameters<typeof G.newGame>[0]> = {}) {
  const s = game(over)
  expect(G.startProduct(s, { design: G.starterDesign(s, 'phone'), family: 'Nova', variant: '', price: 399, tiers: [], quantity: 20000, mode: 'contract', marketing: 100e3 })).toBeNull()
  G.tick(s, 120)
  const p = s.products.find((x) => x.companyId === 'player')!
  expect(p.status).toBe('sale')
  return { s, p }
}

describe('actions refuse what is not an argument', () => {
  it('turns away numbers that are not numbers, in words, and writes none of them to the game', () => {
    const { s, p } = selling()
    G.hire(s, s.candidates[0].id)
    const e = s.staff[0]
    const design = G.starterDesign(s, 'phone')
    const order = { design, family: 'Bad', variant: '', price: 399, tiers: [], quantity: 100, mode: 'contract' as const, marketing: 0 }
    for (const v of BAD) {
      expect(G.startProduct(s, { ...order, price: v }), `price ${v}`).toEqual(expect.any(String))
      expect(G.startProduct(s, { ...order, marketing: v }), `marketing ${v}`).toEqual(expect.any(String))
      if (v !== -1) expect(G.orderProduction(s, p.id, v, 'contract'), `quantity ${v}`).toEqual(expect.any(String))
      expect(G.setPrice(s, p.id, v), `setPrice ${v}`).toEqual(expect.any(String))
      expect(G.startCampaign(s, 'online', 'brand', v), `campaign ${v}`).toEqual(expect.any(String))
      expect(G.setResearchBudget(s, v), `research ${v}`).toEqual(expect.any(String))
      expect(G.buyBackShares(s, v)).toEqual(expect.any(String))
      expect(G.startChip(s, 'X', v, 0.5, 0.5)).toEqual(expect.any(String))
      expect(G.setLook(s, 'office', { floors: v })).toEqual(expect.any(String))
      expect(G.placeItem(s, 'office', 'desk', v, 3, 0)).toEqual(expect.any(String))
      if (v !== -1) expect(G.zoneRoom(s, 'office', 'work', v, 0, 3, 3)).toEqual(expect.any(String))
      G.giveRaise(s, e.id, v)
      G.setPayout(s, v)
      G.setRegionPrice(s, 'na', v)
      G.setCare(s, { planPrice: v })
      G.setPolicy(s, { perks: v })
      G.setLicenceFee(s, 'nope', v)
      G.paintFloor(s, 'office', v, v, 'paving')
      G.clearZone(s, 'office', v, v, v, v)
      sound(s)
    }
    // the same for an order with no quantity at all, a quantity of nothing, and a factory that is not there
    expect(G.orderProduction(s, p.id, 0, 'contract')).toMatch(/at least 1/)
    expect(G.orderProduction(s, p.id, 100, 'factory')).toMatch(/factory has no working line/)
    expect(G.orderProduction(s, p.id, 100, 'bogus' as 'contract')).toMatch(/Choose who builds it/)
    expect(p.price).toBe(399)
    sound(s)
  })

  it('does not pay the company for a launch budget below zero', () => {
    const s = game()
    const before = s.cash
    expect(G.startProduct(s, { design: G.starterDesign(s, 'phone'), family: 'Free', variant: '', price: 399, tiers: [], quantity: 0, mode: 'contract', marketing: -50e6 })).toMatch(/cannot be less than zero/)
    expect(s.cash).toBe(before)
  })

  it('knows a name in a table from a name every object has', () => {
    const s = game()
    const k = 'constructor'
    expect(G.placeItem(s, 'office', k, 4, 4, 0)).toMatch(/no such thing/)
    expect(G.placeItems(s, 'office', k, 4, 4, 8, 4, 0).error).toMatch(/no such thing/)
    expect(G.zoneRoom(s, 'office', k, 0, 0, 1, 1)).toMatch(/no such kind of room/)
    expect(G.fillRoom(s, 'office', k, 0, 0)).toMatch(/no such kind of room/)
    expect(G.startCampaign(s, k as 'online', 'brand', 50e3)).toMatch(/no such advertising channel/)
    expect(G.scheduleEvent(s, k as 'expo', 0)).toMatch(/no such kind of event/)
    expect(G.unlockType(s, k as DeviceType)).toMatch(/no such kind of device/)
    expect(G.lockSupply(s, k as 'semis')).toMatch(/no such kind of component/)
    expect(G.setEdge(s, 'office', 3, 2, 'n', k as 'door')).toMatch(/plain wall, glass, a door or an opening/)
    expect(G.setEdge(s, 'office', 3, 2, k as 'n', 'door')).toMatch(/no wall there/)
    expect(G.openStore(s, 0, k)).toMatch(/no such region/)
    G.setRegionPrice(s, k, 1.2)
    expect((Object as unknown as { priceAdj?: number }).priceAdj).toBeUndefined()
    expect(G.setPolicy(s, { hours: k as 'crunch' })).toMatch(/relaxed, standard or crunch/)
    sound(s)
  })

  it('answers for a research project that does not exist instead of failing', () => {
    const s = game()
    for (const id of ['f:nope', 'nope', '', 'f:', 'constructor', 'f:constructor']) {
      expect(G.toggleResearch(s, id), id).toBe('There is no such research project')
      expect(G.researchItem(s, id).available).toBe(false)
    }
    expect(s.activeResearch).toEqual([])
    expect(G.toggleResearch(s, 'chipset')).toBeNull()
    G.setResearchBudget(s, 500e3)
    G.tick(s, 60)
    sound(s)
  })

  it('takes a drag that runs far off the plot without stalling', () => {
    const s = game()
    const t0 = performance.now()
    expect(G.zoneRoom(s, 'office', 'work', -1e9, -1e9, 1e9, 1e9)).toBe('That is off the plot')
    expect(G.zoneRoom(s, 'office', 'work', 1e6, 0, 2e6, 3, 'round')).toBe('That is off the plot')
    expect(G.placeItems(s, 'office', 'desk', 0, 0, 1e9, 0, 0).error).toBe('That is off the plot')
    G.paintArea(s, 'office', -1e9, -1e9, 1e9, 1e9, 'rect', 'paving')
    // a box dragged off every side still clears what is on the plot
    G.clearZone(s, 'office', -1e9, -1e9, 1e9, 1e9)
    expect(s.office.rooms).toEqual([])
    expect(performance.now() - t0).toBeLessThan(2000)
    sound(s)
  })

  it('refuses a design that is not a design, and keeps a part with no place on its face', () => {
    const s = game({ startType: 'all' })
    for (const type of DEVICE_TYPES) expect(designProblem(G.starterDesign(s, type)), type).toBeNull()
    const d = G.starterDesign(s, 'desktop')
    const order = { family: 'Odd', variant: '', price: 999, tiers: [], quantity: 0, mode: 'contract' as const, marketing: 0 }
    expect(G.startProduct(s, { ...order, design: { ...d, specs: { ...d.specs, speakers: 99 } } })).toMatch(/speakers are not a choice/)
    expect(G.startProduct(s, { ...order, design: { ...d, specs: { ...d.specs, chipGen: NaN } } })).toMatch(/chip is not a choice/)
    expect(G.startProduct(s, { ...order, design: { ...d, body: { ...d.body, width: 0.5 } } })).toMatch(/width is not that of a desktop/)
    expect(G.startProduct(s, { ...order, design: { ...d, type: 'toaster' as DeviceType } })).toMatch(/kind of device is unknown/)
    expect(G.startProduct(s, { ...order, design: null as never })).toMatch(/not a design/)
    expect(s.products.filter((p) => p.companyId === 'player')).toEqual([])
    const part = d.parts[0]
    const kept = clampPart(d.body, { ...part, x: NaN, y: Infinity, w: NaN, h: -3, rot: NaN }, d.type)
    for (const v of [kept.x, kept.y, kept.w, kept.h, kept.rot]) expect(Number.isFinite(v)).toBe(true)
    expect(Object.keys(TYPES).sort()).toEqual([...DEVICE_TYPES].sort())
  })
})

describe('devices, launches and orders', () => {
  it('does not count a device shelved in development as one that was put on sale', () => {
    const s = game({ progression: 'guided' })
    expect(G.startProduct(s, { design: G.starterDesign(s, 'phone'), family: 'Ghost', variant: '', price: 399, tiers: [], quantity: 0, mode: 'contract', marketing: 0 })).toBeNull()
    const p = s.products.find((x) => x.companyId === 'player')!
    G.discontinue(s, p.id)
    expect(s.news[0].text).toMatch(/Development of Ghost was cancelled/)
    G.tick(s, 10)
    expect(has(s, 'execs')).toBe(false)
    expect(has(s, 'studio')).toBe(false)
    expect(s.goals.launch).toBeUndefined()
    expect(GOALS.find((g) => g.id === 'rev8')!.progress(s)).toBe(0)
    expect(G.wasReleased(p)).toBe(false)
    sound(s)
  })

  it('settles everything that could stop a launch keynote before any money is spent', () => {
    const s = game()
    const before = s.cash
    const order = { design: G.starterDesign(s, 'phone'), family: 'Stage', variant: '', price: 399, tiers: [], quantity: 0, mode: 'contract' as const, marketing: 0 }
    expect(G.startProduct(s, { ...order, keynote: 3 })).toMatch(/Build a venue of your own first/)
    expect(G.startProduct(s, { ...order, keynote: 9 })).toMatch(/Pick a venue/)
    expect(G.startProduct(s, { ...order, keynote: 0.5 })).toMatch(/Pick a venue/)
    expect(s.cash).toBe(before)
    expect(s.products.some((p) => p.companyId === 'player')).toBe(false)
    expect(G.startProduct(s, { ...order, keynote: 0 })).toBeNull()
    expect(s.events).toHaveLength(1)
  })

  it('never lets one keynote make more than total hype', () => {
    const { s, p } = selling()
    for (let seed = 0; seed < 40; seed++) {
      s.rng = seed
      p.status = 'dev'
      const e = { id: `v${seed}`, type: 'keynote' as const, venue: 2, day: s.day, productId: p.id, cost: 0, done: false }
      // a venue that carries further than any hired hall
      const far = EVENTS.keynote.venues[2].reach
      EVENTS.keynote.venues[2].reach = 1.1
      resolveEvent(s, e)
      EVENTS.keynote.venues[2].reach = far
      expect(p.hype).toBeLessThanOrEqual(1)
    }
  })

  it('pays a bulk order for the units that ship, not the units that were asked for', () => {
    const { s, p } = selling()
    p.stock = 9000
    s.incidents.push({ id: 'i1', kind: 'bulk', day: s.day, done: false, productId: p.id, amount: 8000 })
    // most of the stock sells before the answer is given
    p.stock = 500
    const before = s.cash
    const sold = p.unitsSold
    expect(INCIDENTS.bulk.choices(s, s.incidents[0])[0].cost).toBe(-Math.round(500 * p.price * 0.8))
    expect(G.decide(s, 'i1', 0)).toBeNull()
    expect(s.cash - before).toBe(Math.round(500 * p.price * 0.8))
    expect(p.unitsSold - sold).toBe(500)
    expect(p.stock).toBe(0)
    sound(s)
  })
})

describe('incidents', () => {
  it('can always be answered, even at the end of the company’s credit', () => {
    const { s } = selling({ startCash: 6e6 })
    s.cash = -1.99e6
    s.incidents.push({ id: 'i1', kind: 'lawsuit', day: s.day, done: false })
    // settling is out of reach; fighting it, the cheapest way out, is not, though it goes on the overdraft
    expect(G.decide(s, 'i1', 0)).toMatch(/Not enough cash: "Settle" costs \$[\d,]+\. Pick the other option/)
    expect(G.decide(s, 'i1', 1)).toBeNull()
    expect(s.incidents[0].done).toBe(true)
    expect(G.decide(s, 'i1', 1)).toBe('That has already been dealt with')
    expect(G.decide(s, 'nope', 1)).toMatch(/nothing of that kind waiting/)
    expect(settleIncident(s, 'i1', 0.5, () => true).error).toBeDefined()
  })

  it('does not have a rival poach staff when there are no rivals left', () => {
    const { s } = selling()
    G.hire(s, s.candidates[0].id)
    s.staff[0].skill = 90
    for (const c of s.companies) if (!c.isPlayer) c.alive = false
    expect(INCIDENTS.poach.when(s)).toBe(false)
    for (let seed = 0; seed < 300; seed++) {
      s.rng = seed
      s.incidents = []
      expect(() => rollIncident(s)).not.toThrow()
    }
  })
})

describe('people and teams', () => {
  it('leaves someone in their team when asked to move them to one that does not exist', () => {
    const s = game()
    G.hire(s, s.candidates[0].id)
    G.hire(s, s.candidates[0].id)
    const [a, b] = s.staff
    const id = G.createTeam(s, 'Core')
    G.assignTeam(s, a.id, id)
    G.assignTeam(s, a.id, 'nope')
    expect(s.teams[0].members).toEqual([a.id])
    // nobody from outside the company leads a team, and a lead is always one of its members
    G.setLead(s, id, 'nobody')
    expect(s.teams[0].leadId).toBeUndefined()
    G.setLead(s, id, b.id)
    expect(s.teams[0]).toMatchObject({ leadId: b.id, members: [a.id, b.id] })
    G.fire(s, b.id)
    expect(s.teams[0]).toMatchObject({ leadId: undefined, members: [a.id] })
    sound(s)
  })
})

describe('building', () => {
  it('charges for a door once, not every time the same door is asked for', () => {
    const s = game()
    const door = s.office.walls.find((w) => w.kind === 'door')!
    const before = s.cash
    expect(G.setEdge(s, 'office', door.x, door.y, door.side, 'door')).toBeNull()
    expect(s.cash).toBe(before)
    expect(G.setEdge(s, 'office', door.x, door.y, door.side, 'glass')).toBeNull()
    expect(s.cash).toBe(before - G.EDGE_COST.glass)
  })

  it('sells furniture for half of what it cost, and never for more', () => {
    const s = game()
    const before = s.cash
    expect(G.placeItem(s, 'office', 'desk', 4, 4, 0)).toBeNull()
    expect(s.cash).toBe(before - ITEMS.office.desk.cost)
    const desk = s.office.items[s.office.items.length - 1]
    G.removeItem(s, 'office', desk.id)
    expect(s.cash).toBe(before - ITEMS.office.desk.cost / 2)
    G.removeItem(s, 'office', desk.id)
    expect(G.removeItems(s, 'office', [desk.id, desk.id, 'nope']).done).toBe(0)
    expect(s.cash).toBe(before - ITEMS.office.desk.cost / 2)
    sound(s)
  })

  it('keeps a curved wall to the tiles it was built with when a room is extended or joined', () => {
    const s = game()
    G.upgradeOffice(s)
    G.upgradeOffice(s)
    G.clearZone(s, 'office', 0, 0, 99, 99)
    const site = s.office
    // a lounge full of plants, then a round lounge whose outline crosses its floor, built apart and later joined
    expect(G.zoneRoom(s, 'office', 'lounge', 4, 4, 9, 9)).toBeNull()
    for (let y = 4; y <= 9; y++) for (let x = 4; x <= 9; x++) expect(G.placeItem(s, 'office', 'plant', x, y, 0)).toBeNull()
    expect(G.zoneRoom(s, 'office', 'lounge', 8, 2, 18, 12, 'round', undefined, undefined, true)).toBeNull()
    expect(site.rooms).toHaveLength(2)
    expect(checkSite(site, 'office')).toEqual([])
    // more lounge laid against both makes them one room
    expect(G.zoneRoom(s, 'office', 'lounge', 4, 10, 7, 12)).toBeNull()
    expect(site.rooms).toHaveLength(1)
    expect(checkSite(site, 'office')).toEqual([])
    // and the same when the round part is added straight onto the room
    expect(G.zoneRoom(s, 'office', 'lounge', 2, 8, 6, 16, 'round')).toBeNull()
    expect(site.rooms).toHaveLength(1)
    expect(checkSite(site, 'office')).toEqual([])
    expect(site.items.filter((i) => i.kind === 'plant')).toHaveLength(36)
  })

  it('agrees with itself about where a wall stands and where a door can go', () => {
    // every wall the building holds is one the game would let the player put there again
    for (const seed of [8, 49, 7, 181]) {
      const r = fuzzSites(seed, 500, 0)
      expect(r.findings.map((f) => f.detail), `seed ${seed}`).toEqual([])
    }
    const s = game()
    for (const w of s.office.walls) expect(isBoundary(s.office, w.x, w.y, w.side) && doorFits(s.office, w.x, w.y, w.side)).toBe(true)
  })
})

describe('the world', () => {
  it('keeps a rival where it is based when the player renames it', () => {
    const s = game()
    const c = s.companies[3]
    const home = homeOf(c)
    const reach = REGIONS.map((r) => rivalReach(c, r.id))
    c.name = 'Something Else'
    expect(homeOf(c)).toBe(home)
    expect(REGIONS.map((r) => rivalReach(c, r.id))).toEqual(reach)
    // a save from before rivals remembered their first name takes the name they bear when it is loaded
    const old = JSON.parse(JSON.stringify(s)) as GameState
    for (const x of old.companies) delete x.origin
    const back = G.migrate(old)
    expect(back.companies[3].origin).toBe('Something Else')
    expect(back.companies[0].origin).toBeUndefined()
  })

  it('stops refurbishing trade-ins when the last workshop that could do it is gone', () => {
    const { s, p } = selling()
    expect(G.setCare(s, { tradeIn: true, refurb: true })).toMatch(/needs a factory or a store with a repair bench/)
    G.openStore(s, 1)
    const ref = `store:${s.stores[0].id}`
    expect(G.zoneRoom(s, ref, 'service', 1, 10, 5, 10, 'rect', undefined, undefined, true) ?? G.placeItem(s, ref, 'repair', 1, 10, 0)).toBeNull()
    expect(G.setCare(s, { tradeIn: true, refurb: true })).toBeNull()
    s.fans = 2e6
    p.stock = 50e6
    G.tick(s, 30)
    expect(s.care.month.refurbIncome + s.care.last.refurbIncome).toBeGreaterThan(0)
    G.closeStore(s, s.stores[0].id)
    G.tick(s, 60)
    expect(s.care.last.tradeIns).toBeGreaterThan(0)
    expect(s.care.last.refurbIncome).toBe(0)
  })
})

describe('the way a company grows', () => {
  it('never points the player at a screen that is still locked', () => {
    const s = game({ progression: 'guided', startCash: 6e6 })
    const check = () => expect(checkState(s).filter((f) => f.startsWith('points-at-locked'))).toEqual([])
    check()
    // before anything is on sale the executive search is shut: what leans on a seat names what opens the search
    expect(nextReq(s, 'world')!.label).toBe('Put your first device on sale')
    expect(nextReq(s, 'shares')!.label).toBe('Take $20M in twelve months')
    expect(nextReq(s, 'finance')!.label).toBe('Put your first device on sale')
    const p = new Play({ ...G.defaultConfig(), progression: 'guided', startCash: 60e6, seed: 3 }, 'guided')
    launch(p, 'phone')
    for (let i = 0; i < 9; i++) hireOne(p)
    check()
    expect(nextReq(p.s, 'people')!.label).toBe('Put your first device on sale')
    p.run(120)
    expect(p.findings.size).toBe(0)
    expect(nextReq(p.s, 'people')!.label).toBe('Hire a Head of People')
    for (const c of CAPS) expect(c.reqs.length).toBeGreaterThan(0)
  })
})

describe('the soak, in miniature', () => {
  it('plays a year as each persona without breaking a rule', () => {
    let id = 0
    for (const persona of Object.keys(ALL_PERSONAS)) {
      const hunting = persona === 'monkey' || persona === 'adversary' || persona === 'tameMonkey'
      const r = runGame({ id: id++, persona, years: 1, cfg: { ...G.defaultConfig(), seed: 7 + id, startCash: hunting ? 80e6 : 6e6, progression: id % 2 ? 'guided' : 'open', startType: DEVICE_TYPES[id % DEVICE_TYPES.length] }, reloadEvery: 5 })
      expect(r.findings.map((f) => `${f.detail} <- ${f.trail.slice(-2).join(' ; ')}`), persona).toEqual([])
      expect(r.crashed).toBe(false)
    }
    expect(Object.keys(PERSONAS).length).toBeGreaterThan(5)
    void adversary
    void monkey
  }, 240000)

  it('gives the same game for the same seed and the same play, with or without saving and loading on the way', () => {
    const spec = { id: 1, persona: 'sensible', years: 1, cfg: { ...G.defaultConfig(), seed: 21, progression: 'guided' as const } }
    const a = runGame(spec)
    const b = runGame(spec)
    const c = runGame({ ...spec, reloadEvery: 3 })
    expect(b.hash).toBe(a.hash)
    expect(c.hash).toBe(a.hash)
    const s = game()
    G.tick(s, 45)
    expect(canon(JSON.parse(JSON.stringify(s)))).toBe(canon(s))
  }, 120000)

  it('scores, lays out and costs every kind of device from random designs without failing', () => {
    const r = fuzzDevices(1, 4, 0.25)
    expect(r.findings.map((f) => f.detail)).toEqual([])
    expect(r.designs).toBeGreaterThan(90)
  }, 120000)
})

describe('money that comes from nowhere', () => {
  it('stops selling the company once its founder would hold less than a tenth of it', () => {
    const { s } = selling({ unlimitedMoney: true })
    let rounds = 0
    let refusal: string | null = null
    for (let i = 0; i < 40 && !refusal; i++) {
      G.tick(s, RAISE_GAP + 1)
      refusal = G.fundingRound(s, 0.3)
      if (!refusal) rounds++
      expect(founderStake(s)).toBeGreaterThanOrEqual(MIN_FOUNDER)
    }
    // 70%, 49%, 34%, 24%, 17%, 12%: the seventh third would leave 8%
    expect(rounds).toBe(6)
    expect(refusal).toMatch(/keep at least 10% of the company\. You hold 11\.8%, and this would leave you 8\.2%\. Sell less, or buy shares back first\./)
    expect(s.stock.shares).toBeLessThan(1e8)
    // a smaller stake still goes through, and buying shares back makes room again
    G.tick(s, RAISE_GAP + 1)
    expect(G.fundingRound(s, 0.1)).toBeNull()
    G.tick(s, RAISE_GAP + 1)
    expect(raiseBlocked(s)).toBeNull()
    expect(G.fundingRound(s, 0.1)).toMatch(/keep at least 10%/)
    const gift = 5e9 - s.cash
    s.cash = 5e9
    expect(G.buyBackShares(s, 2e9)).toBeNull()
    expect(G.fundingRound(s, 0.1)).toBeNull()
    expect(checkState(s, { offBooks: gift })).toEqual([])
  })

  it('lets the prices people expect climb while technology does, and no longer', () => {
    expect(priceIndex(0)).toBe(1)
    expect(priceIndex(360)).toBeCloseTo(1.035, 10)
    expect(priceIndex(PEAK_DAY)).toBeCloseTo(Math.pow(1.035, 12.5), 10)
    for (const years of [13, 30, 100, 500]) expect(priceIndex(years * 360)).toBe(priceIndex(PEAK_DAY))
    expect(marketLevel(PEAK_DAY)).toBe(MAX_LEVEL)
    expect(marketLevel(PEAK_DAY - 1)).toBeLessThan(MAX_LEVEL)
  })

  it('brings the prices in an older save from after the peak down together, so nothing sells better or worse for it', () => {
    const { s } = selling()
    // thirty years in, as the game before this version would have had it: every price had climbed with the years
    const day = 30 * 360
    const old = Math.pow(1.035, day / 360)
    s.day = day
    s.cur.month = day / 30
    s.reports = []
    for (const p of s.products) if (p.status === 'sale') p.price = Math.round(p.price * old)
    const mine = s.products.find((p) => p.companyId === 'player')!
    mine.tiers = [{ storage: mine.design.specs.storage * 2, price: mine.price + 200 }]
    const before = s.products.filter((p) => p.status === 'sale').map((p) => priceFactor(p.price / old, segmentInfo(p.segment!)))
    const saved = JSON.parse(JSON.stringify(s)) as GameState
    saved.version = 5
    const m = G.migrate(saved)
    expect(m.version).toBe(G.SAVE_VERSION)
    const after = m.products.filter((p) => p.status === 'sale').map((p) => priceFactor(p.price / priceIndex(m.day), segmentInfo(p.segment!)))
    after.forEach((v, i) => expect(v / before[i]).toBeCloseTo(1, 1))
    const now = m.products.find((p) => p.companyId === 'player')!
    expect(now.price).toBe(Math.round(mine.price * (priceIndex(day) / old)))
    expect(now.tiers[0].price).toBeGreaterThan(now.price)
    expect(m.news[0].text).toMatch(/Prices across the market have settled/)
    // once is enough: loading the save again leaves the prices where they are
    const again = G.migrate(JSON.parse(JSON.stringify(m)))
    expect(again.products.map((p) => p.price)).toEqual(m.products.map((p) => p.price))
    // and a save from before the peak is not touched
    const early = selling().s
    const prices = early.products.map((p) => p.price)
    early.version = 5
    expect(G.migrate(early).products.map((p) => p.price)).toEqual(prices)
  })
})
