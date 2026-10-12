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
import { curveTiles } from './curves'
import { ITEMS, doorFits, isBoundary, openRooms, reachable } from './sites'
import { staffEffects } from './staff'
import { adversary, monkey } from './testing/chaos'
import { fuzzDevices } from './testing/devicefuzz'
import { checkSite, checkState } from './testing/invariants'
import { hireOne, launch, placeAnywhere } from './testing/kit'
import { PERSONAS } from './testing/personas'
import { Play } from './testing/play'
import { ALL_PERSONAS, canon, runGame } from './testing/runner'
import { fuzzSites } from './testing/sitefuzz'
import { LICENCE_CAP, chipAdoption, licenceValue } from './tech'
import { type CustomChip, DEVICE_TYPES, type DeviceType, type GameState, hasStock, stockOf } from './types'
import { designProblem } from './validate'
import { MIN_FOUNDER, RAISE_GAP, founderStake, raiseBlocked } from './stock'
import { INCIDENTS, PEAK_DAY, STARTUPS, priceIndex, rollIncident, settleIncident } from './world'
import { RECALL_DEADLINE } from './care'

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
    expect(INCIDENTS.bulk.choices(s, s.incidents[0])[0].cost).toBe(-500 * Math.round(p.price * 0.8))
    expect(G.decide(s, 'i1', 0)).toBeNull()
    expect(s.cash - before).toBe(500 * Math.round(p.price * 0.8))
    expect(p.unitsSold - sold).toBe(500)
    expect(p.stock).toBe(0)
    sound(s)
    // a device listed at a silly price is bought at what such a device goes for, not at a fifth off the silly price
    p.stock = 9000
    G.setPrice(s, p.id, 5e6)
    s.incidents.push({ id: 'i2', kind: 'bulk', day: s.day, done: false, productId: p.id, amount: 8000 })
    const usual = segmentInfo(p.segment!).priceRef * priceIndex(s.day) * 1.25
    expect(INCIDENTS.bulk.choices(s, s.incidents[1])[0].cost).toBe(-8000 * Math.round(usual * 0.8))
    expect(INCIDENTS.bulk.text(s, s.incidents[1])).toMatch(/it will not pay anything like your list price/)
    const cash = s.cash
    expect(G.decide(s, 'i2', 0)).toBeNull()
    expect(s.cash - cash).toBeLessThan(8000 * 2000)
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
    expect(G.renameCompany(s, c.id, '   ')).toBe('A company needs a name')
    expect(G.renameCompany(s, c.id, s.companies[4].name.toUpperCase())).toMatch(/already a company called/)
    expect(G.renameCompany(s, 'nope', 'X')).toBe('There is no such company')
    expect(G.renameCompany(s, c.id, '  Something Else  ')).toBeNull()
    expect(c.name).toBe('Something Else')
    expect(G.renameCompany(s, 'player', 'A name much longer than a company name may be')).toBeNull()
    expect([s.companies[0].name, s.config.companyName]).toEqual(['A name much longer', 'A name much longer'])
    expect(homeOf(c)).toBe(home)
    expect(REGIONS.map((r) => rivalReach(c, r.id))).toEqual(reach)
    // a save from before rivals remembered their first name takes the name they bear when it is loaded
    const old = JSON.parse(JSON.stringify(s)) as GameState
    for (const x of old.companies) delete x.origin
    const back = G.migrate(old)
    expect(back.companies[3].origin).toBe('Something Else')
    expect(back.companies[0].origin).toBeUndefined()
  })

  it('keeps newcomers arriving when every name on the list has been used', () => {
    const s = game({ unlimitedMoney: true })
    // a long game in which nearly every rival has gone, and every start-up there has ever been too
    s.companies.slice(4).forEach((c) => {
      c.alive = false
      for (const p of s.products) if (p.companyId === c.id && p.status === 'sale') (p.status = 'ended'), (p.endDay = s.day)
    })
    STARTUPS.forEach((name, i) => s.companies.push({ ...JSON.parse(JSON.stringify(s.companies[5])), id: `gone${i}`, name, origin: name, alive: false }))
    const before = s.companies.length
    G.tick(s, 360 * 6)
    const fresh = s.companies.slice(before)
    expect(fresh.length).toBeGreaterThan(0)
    for (const c of fresh) expect(c.name).toMatch(/^[A-Z][a-z]+ \d+$/)
    expect(new Set(s.companies.map((c) => c.name)).size).toBe(s.companies.length)
    sound(s)
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

  it('licenses one chip to each rival device, however many chips are on offer', () => {
    const { s } = selling()
    const chip = (id: string, fee: number, power = 1, graphics = 1, efficiency = 0): CustomChip => ({ id, name: id, gen: s.levels.chipset, power, graphics, efficiency, status: 'ready', devDaysLeft: 0, quality: 1.05, licenceFee: fee, licenceIncome: 0 })
    s.chips = [chip('h1', 6)]
    const alone = chipAdoption(s, s.chips[0])
    expect(alone).toBeGreaterThan(0.01)
    expect(alone).toBeLessThanOrEqual(LICENCE_CAP)
    // four of the same on offer win no more devices than one does
    s.chips = [chip('h1', 6), chip('h2', 6), chip('h3', 6), chip('h4', 6)]
    expect(s.chips.map((c) => chipAdoption(s, c))).toEqual([alone, 0, 0, 0])
    // a dearer one is a worse buy and loses to the cheaper; priced out of reach it wins nothing even alone
    s.chips = [chip('h1', 9), chip('h2', 6)]
    expect(s.chips.map((c) => chipAdoption(s, c) > 0)).toEqual([false, true])
    s.chips = [chip('h1', 40)]
    expect(chipAdoption(s, s.chips[0])).toBe(0)
    expect(licenceValue(s, s.chips[0])).toBeLessThan(1)
    // not offered, or not finished: nothing
    s.chips = [chip('h1', 0), { ...chip('h2', 6), status: 'dev' }]
    expect(s.chips.map((c) => chipAdoption(s, c))).toEqual([0, 0])
    // a year of licensing six chips earns what one would: a few dimes for each device the rivals sell
    s.chips = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((id) => chip(id, 6))
    const before = s.reports.length
    G.tick(s, 360)
    const year = s.reports.slice(before)
    const rivals = s.shareHistory.slice(-12).reduce((a, m) => a + Object.entries(m.units).reduce((x, [id, v]) => x + (id === 'player' ? 0 : v), 0), 0)
    const earned = s.chips.reduce((a, c) => a + c.licenceIncome, 0)
    expect(year).toHaveLength(12)
    expect(earned).toBeGreaterThan(0)
    expect(earned).toBeLessThanOrEqual(rivals * LICENCE_CAP * 6 * 1.001)
    expect(s.chips.filter((c) => c.licenceIncome > 0)).toHaveLength(1)
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

describe('a big campus of round buildings', () => {
  /** A full campus plot of rings and discs, sixty people at desks in them and a dozen campaigns running. */
  function campus() {
    const s = game({ startType: 'all' })
    while (!G.upgradeOffice(s)) void 0
    G.clearZone(s, 'office', 0, 0, 99, 99)
    const types = ['work', 'soft', 'eng', 'lab', 'lounge', 'meeting', 'lobby', 'work', 'soft']
    let n = 0
    for (let y = 1; y + 15 < s.office.h; y += 17) {
      for (let x = 1; x + 15 < s.office.w; x += 17) {
        const type = types[n++ % types.length]
        expect(G.zoneRoom(s, 'office', type, x, y, x + 15, y + 15, n % 2 ? 'ring' : 'round', undefined, { thick: 4 }, true), `${type} at ${x},${y}`).toBeNull()
      }
    }
    expect(s.office.curves!.length).toBeGreaterThanOrEqual(12)
    for (let i = 0; i < 70; i++) placeAnywhere({ s, act: (_n: string, fn: (g: GameState) => unknown) => fn(s), rnd: () => ((i * 7919 + n++ * 104729) % 1000) / 1000 } as never, 'office', 'desk')
    while (s.staff.length < 60) {
      G.headhunt(s)
      for (const c of [...s.candidates]) G.hire(s, c.id)
    }
    expect(G.startProduct(s, { design: G.starterDesign(s, 'phone'), family: 'Nova', variant: '', price: 399, tiers: [], quantity: 50000, mode: 'contract', marketing: 0 })).toBeNull()
    for (const ch of ['online', 'social', 'press', 'tv', 'outdoor', 'esports'] as const) for (const r of [undefined, 'na']) G.startCampaign(s, ch, 'brand', 500e3, r)
    expect(s.campaigns).toHaveLength(12)
    return s
  }

  it('does not make a day slow to simulate, or the staff slow to add up', () => {
    const s = campus()
    expect(staffEffects(s).seated).toBeGreaterThan(40)
    G.tick(s, 5)
    // the staff's effects are asked for about twenty times a frame by the screens
    const t0 = performance.now()
    for (let i = 0; i < 200; i++) staffEffects(s)
    const each = (performance.now() - t0) / 200
    const t1 = performance.now()
    G.tick(s, 60)
    const day = (performance.now() - t1) / 60
    // before any of it was remembered: about 16 ms a call and far more a day. Wide limits, for a busy machine
    expect(each, `staffEffects took ${each.toFixed(2)} ms`).toBeLessThan(3)
    expect(day, `a day took ${day.toFixed(1)} ms`).toBeLessThan(40)
    sound(s)
  }, 120000)

  it('remembers nothing about a plot that a change has made untrue', () => {
    const s = campus()
    const site = s.office
    const fresh = () => JSON.parse(JSON.stringify(site)) as typeof site
    const same = () => {
      const copy = fresh()
      expect([...openRooms(site)].sort()).toEqual([...openRooms(copy)].sort())
      expect(reachable(site).map((i) => i.id)).toEqual(reachable(copy).map((i) => i.id))
      expect([...curveTiles(site)].map(([k, t]) => `${k}:${t.beyond}`)).toEqual([...curveTiles(copy)].map(([k, t]) => `${k}:${t.beyond}`))
    }
    same()
    const seats = staffEffects(s).seats
    // changes made through the game, and changes made behind its back: each is seen at once
    G.removeRoom(s, 'office', site.rooms[0].n)
    same()
    expect(staffEffects(s).seats).toBeLessThan(seats)
    site.walls = site.walls.filter((w) => w.kind !== 'door')
    same()
    for (const c of site.curves!) delete c.walls
    same()
    expect(staffEffects(s).seats).toBe(0)
    site.grid[site.grid.findIndex((n) => n > 0)] = 0
    same()
    // and none of it is part of the save
    expect(Object.keys(fresh()).sort()).toEqual(Object.keys(site).sort())
  }, 120000)
})

describe('parts on a device', () => {
  it('makes a part fit the face it sits on, and keeps it inside the rounded outline', () => {
    const s = game({ startType: 'all' })
    const phone = G.starterDesign(s, 'phone')
    const narrow = { ...phone.body, width: 60 }
    const cam = phone.parts.find((p) => p.kind === 'camera' && p.face === 'back')!
    // wider than the body: brought down to the body's width, in proportion
    const big = clampPart(narrow, { ...cam, x: 0, y: 0, w: 90, h: 45 }, 'phone')
    expect(big.w).toBeLessThanOrEqual(60)
    expect(big.w / big.h).toBeCloseTo(2, 1)
    // one that already fits is not touched
    expect(clampPart(narrow, { ...cam, x: 0, y: 0 }, 'phone')).toMatchObject({ w: cam.w, h: cam.h })
    // a button taller than the edge it is on, and longer than the edge is long
    const button = phone.parts.find((p) => p.kind === 'button')!
    const long = clampPart(phone.body, { ...button, w: 500, h: 50 }, 'phone')
    expect(long.h).toBeLessThanOrEqual(phone.body.thickness)
    expect(long.w).toBeLessThan(phone.body.height)
    // at the largest corner radius, a rear camera pushed into the corner of a tablet stays inside the outline
    const tablet = G.starterDesign(s, 'tablet')
    const round = { ...tablet.body, corner: 40 }
    const tcam = tablet.parts.find((p) => p.kind === 'camera' && p.face === 'back') ?? { ...cam }
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const q = clampPart(round, { ...tcam, x: sx * 1e4, y: sy * 1e4 }, 'tablet')
      const r = Math.min(round.corner, round.width / 2, round.height / 2)
      const dx = Math.abs(q.x) + q.w / 2 - (round.width / 2 - r)
      const dy = Math.abs(q.y) + q.h / 2 - (round.height / 2 - r)
      expect(dx <= 0 || dy <= 0 || Math.hypot(dx, dy) <= r + 1e-6, `corner ${sx},${sy}: ${q.x},${q.y}`).toBe(true)
      expect(Math.sign(q.x)).toBe(sx)
      expect(Math.sign(q.y)).toBe(sy)
    }
    // every starter design is already as its parts will be drawn: clamping changes none of them
    for (const type of DEVICE_TYPES) {
      const d = G.starterDesign(s, type)
      for (const p of d.parts) {
        const q = clampPart(d.body, p, type)
        expect([q.w, q.h].map((v) => Math.round(v * 10)), `${type} ${p.kind} ${p.id}`).toEqual([p.w, p.h].map((v) => Math.round(v * 10)))
      }
    }
  })
})

describe('the feed', () => {
  it('says a device has sold out once for each time it runs dry, however long the shortage lasts', () => {
    const { s, p } = selling()
    const alerts = () => s.news.filter((n) => n.text === `${p.name} is sold out. Order more units to keep selling.`).length
    s.orders = []
    s.regions.na.awareness = 0.9
    s.fans = 8e6
    p.stock = 50
    G.tick(s, 3)
    expect(p.stock).toBe(0)
    expect(alerts()).toBe(1)
    // a contractor delivering less each day than sells each day: empty again every evening, and still one shortage
    expect(G.orderProduction(s, p.id, 20000, 'contract')).toBeNull()
    G.tick(s, 12)
    for (let d = 0; d < 20; d++) {
      p.stock = Math.min(p.stock, 40)
      G.tick(s, 1)
    }
    expect(p.unitsSold).toBeGreaterThan(500)
    expect(alerts()).toBe(1)
    expect(p.soldOut).toBeDefined()
    // stocked again for a day or more, then dry again: that is a second shortage
    s.orders = []
    p.stock = 5e6
    G.tick(s, 2)
    expect(p.soldOut).toBeUndefined()
    p.stock = 10
    G.tick(s, 3)
    expect(alerts()).toBe(2)
    sound(s)
  })

  it('says production has stopped for want of cash once, and again only after it has run', () => {
    const { s, p } = selling({ startCash: 6e6 })
    const said = () => s.news.filter((n) => n.text.startsWith('Production is paused')).length
    const gift = -1.9e6 - s.cash
    s.cash = -1.9e6
    expect(G.orderProduction(s, p.id, 500000, 'contract')).toBeNull()
    G.tick(s, 45)
    expect(said()).toBe(1)
    // money comes in and it runs for a few days, then stops again: the same trouble, not a new one
    s.cash += 3e6
    G.tick(s, 20)
    expect(said()).toBe(1)
    // six weeks of running, then it stops: that is news
    s.cash += 400e6
    G.tick(s, 45)
    s.cash = -1.9e6
    G.tick(s, 10)
    expect(said()).toBe(2)
    void gift
  })

  it('writes every number in the news the same way on every machine', () => {
    const { s } = selling()
    G.tick(s, 400)
    const was = Number.prototype.toLocaleString
    // a machine set to German would write 1.234,5 unless told otherwise
    Number.prototype.toLocaleString = function (this: number, locale?: Intl.LocalesArgument, o?: Intl.NumberFormatOptions) {
      return was.call(this, locale ?? 'de-DE', o)
    } as typeof was
    try {
      const again = selling().s
      G.tick(again, 400)
      expect(again.news.map((n) => n.text)).toEqual(s.news.map((n) => n.text))
    } finally {
      Number.prototype.toLocaleString = was
    }
  }, 60000)
})

describe('rivals’ stock', () => {
  it('is a flag and never a number, in new games and in old saves', () => {
    const { s, p } = selling()
    const rivals = s.products.filter((x) => x.companyId !== 'player')
    expect(rivals.length).toBeGreaterThan(50)
    for (const r of rivals) expect([r.stock, r.unlimited, hasStock(r), stockOf(r)]).toEqual([0, true, true, null])
    expect([p.unlimited, hasStock(p), stockOf(p)]).toEqual([undefined, p.stock > 0, p.stock])
    // rivals still sell
    const sold = rivals.reduce((a, r) => a + r.unitsSold, 0)
    G.tick(s, 30)
    expect(rivals.reduce((a, r) => a + r.unitsSold, 0)).toBeGreaterThan(sold)
    // a save from when they carried a million million
    const old = JSON.parse(JSON.stringify(s)) as GameState
    for (const r of old.products) if (r.companyId !== 'player') (r.stock = 1e12), delete r.unlimited
    const m = G.migrate(old)
    for (const r of m.products.filter((x) => x.companyId !== 'player')) expect([r.stock, r.unlimited]).toEqual([0, true])
    expect(m.products.find((x) => x.id === p.id)!.stock).toBe(p.stock)
    sound(m)
  })
})

describe('days, months and deadlines', () => {
  it('closes each month on its last day and dates it rightly', () => {
    const s = game()
    expect(G.fmtDate(s.day)).toBe('01 Jan 2026')
    G.tick(s, 29)
    expect([G.fmtDate(s.day), s.reports.length, s.cur.month]).toEqual(['30 Jan 2026', 0, 0])
    G.tick(s, 1)
    expect([G.fmtDate(s.day), s.reports.length, s.reports[0].month, s.cur.month]).toEqual(['01 Feb 2026', 1, 0, 1])
    G.tick(s, 330)
    expect([G.fmtDate(s.day), s.reports.length, G.monthLabel(s.reports[11].month), G.dateOf(s.day)]).toEqual(['01 Jan 2027', 12, 'Dec 26', { year: 2027, month: 0, dom: 1 }])
    expect(G.monthLabel(-1)).toBe('Dec 25')
    sound(s)
  })

  it('lets a recall wait as long as the screens say, and not a month longer', () => {
    const { s, p } = selling()
    p.defectRate = 0.09
    p.unitsSold = 50000
    G.tick(s, 30 - (s.day % 30))
    expect(p.recall?.state).toBe('open')
    const opened = p.recall!.day
    G.tick(s, RECALL_DEADLINE - 30)
    expect(p.recall!.state).toBe('open')
    // the day the count of days left reaches nought
    G.tick(s, 30)
    expect(s.day - opened).toBe(RECALL_DEADLINE)
    expect(p.recall!.state).toBe('ignored')
    expect(G.recallProduct(s, p.id)).toBe('There is no recall to decide')
  })

  it('sells the fittings of a store that is closed, for half their price', () => {
    const s = game()
    expect(G.openStore(s, 1)).toBeNull()
    const store = s.stores[0]
    expect(G.placeItem(s, `store:${store.id}`, 'demo', 5, 5, 0)).toBeNull()
    const worth = store.site.items.reduce((a, it) => a + ITEMS.store[it.kind].cost, 0)
    const before = s.cash
    G.closeStore(s, store.id)
    expect(s.stores).toEqual([])
    expect(s.cash - before).toBe(worth / 2)
    expect(s.news[0].text).toBe(`The ${store.name} store closed. Its fittings were sold for $${(worth / 2).toLocaleString('en-US')}.`)
    G.closeStore(s, store.id)
    expect(s.cash - before).toBe(worth / 2)
    sound(s)
  })
})
