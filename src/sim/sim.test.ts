import { describe, expect, it } from 'vitest'
import { marketLevel } from '../data/catalog'
import { HINGES, RIVALS, SEGMENTS, SPEAKER_DRIVERS, TYPES, inputOptions, ioOptions, segmentsOf, subLabel } from '../data/devices'
import {
  type LaunchOrder,
  SAVE_VERSION,
  decide,
  unlockType,
  acquire,
  autoLine,
  autoTeams,
  autoVenue,
  buildFactory,
  buildVenue,
  buyRivalStake,
  clearZone,
  enterRegion,
  fundingRound,
  listCompany,
  recallProduct,
  setCare,
  setCurveEdge,
  setEdge,
  removeRoom,
  paintArea,
  setLook,
  zoneRoom,
  defaultConfig,
  hire,
  lockSupply,
  migrate,
  newGame,
  openStore,
  orderProduction,
  placeItem,
  player,
  scheduleEvent,
  startCampaign,
  startChip,
  startOs,
  startProduct,
  starterDesign,
  tick,
  toggleResearch,
  trailingUnits,
  upgradeOffice,
} from './game'
import { GRIP, HINGE_CLEAR, SHOULDER, clampPart, coverScreen, isCoverCam, designFace, faceSize, facesFor, isEdge, isRing, kindsFor, mountOf, newPart, partExtent, speakerShape, standMount } from './geometry'
import { bestSegment, utility } from './market'
import { pendingUnits, supplyPrice } from './ops'
import { type LayoutOptions, VARIANTS, deriveVariant, fitInside, fitSpeaker, layoutParts, speakerSockets, syncSockets } from './rivals'
import { budWeight, evaluate, foldedThickness, maxBattery, minThickness, thermal } from './scoring'
import { layoutInternals } from './internals'
import { bayStands, curveAt, curveTiles, geomOf, polyArea } from './curves'
import { SITE_TIERS, areaTiles, builtTiles, canPlace, curveFor, faceId, gridAt, hiredVenue, isBoundary, lineStats, newSite, openRooms, roomTiles, sealedRooms, storeStats, venueStats } from './sites'
import { GOALS } from './goals'
import { REGIONS } from './regions'
import { staffEffects, unmanaged } from './staff'
import { founderStake, valuation } from './stock'
import { typeDemand, unlockBlocked, unlockCost } from './world'
import { DEVICE_TYPES, type DeviceType, type GameState, type Levels, SUBS, TRACKS } from './types'

const fresh = (seed = 7, extra: Partial<ReturnType<typeof defaultConfig>> = {}) => newGame({ ...defaultConfig(), seed, ...extra })
const rich = (seed = 7) => fresh(seed, { unlimitedMoney: true })
const maxLevels = Object.fromEntries(TRACKS.map((t) => [t, 8])) as Levels
const mine = (s: GameState) => s.products.filter((p) => p.companyId === 'player')

function order(s: GameState, patch: Partial<LaunchOrder> = {}): LaunchOrder {
  return { design: starterDesign(s), family: 'Test', variant: '', price: 399, tiers: [], quantity: 20000, mode: 'contract', marketing: 200e3, ...patch }
}

describe('core simulation', () => {
  it('is deterministic for a fixed seed', () => {
    const a = tick(fresh(), 400)
    const b = tick(fresh(), 400)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(tick(fresh(8), 400))).not.toBe(JSON.stringify(a))
  })

  it('generates valid rival devices of every type', () => {
    const s = fresh()
    for (const type of DEVICE_TYPES) expect(s.products.filter((p) => p.type === type).length, type).toBeGreaterThan(3)
    for (const p of s.products) {
      const errors = evaluate(p.design, maxLevels, marketLevel(0)).report.issues.filter((i) => i.level === 'error')
      expect(errors, `${p.name} (${p.type})`).toEqual([])
      expect(p.price * 0.85, p.name).toBeGreaterThan(p.unitCost)
      expect(p.reviewAvg, p.name).toBeGreaterThan(3)
      expect(p.weight, p.name).toBeGreaterThan(p.type === 'ring' ? 2 : 10)
    }
  })

  it('keeps every segment contested but not saturated', () => {
    const s = fresh()
    for (const seg of SEGMENTS) {
      const pool = s.products.filter((p) => p.status === 'sale' && p.type === seg.type)
      const best = Math.max(...pool.map((p) => utility(p, { brand: 0.7, software: 0 }, seg, 0)))
      expect(best, seg.id).toBeGreaterThan(0.6)
      expect(best, seg.id).toBeLessThan(2.4)
    }
  })

  it('survives a save and load round trip', () => {
    const s = tick(fresh(), 200)
    const loaded = JSON.parse(JSON.stringify(s)) as GameState
    expect(JSON.stringify(tick(loaded, 100))).toBe(JSON.stringify(tick(s, 100)))
  })

  it('gives the player a launchable starter design for every device type', () => {
    for (const techLevel of [0, 2, 4]) {
      const s = fresh(7, { techLevel })
      for (const type of DEVICE_TYPES) {
        const d = starterDesign(s, type)
        const errors = evaluate(d, s.levels, marketLevel(0), s.features, s.chips).report.issues.filter((i) => i.level === 'error')
        expect(errors, `${type} at level ${techLevel}`).toEqual([])
      }
    }
  })

  it('scores design from the physical model', () => {
    const s = fresh()
    const d = starterDesign(s)
    const base = evaluate(d, s.levels, 3).report
    const fat = structuredClone(d)
    fat.body.bezelSide = fat.body.bezelTop = fat.body.bezelBottom = 7
    fat.body.thickness = 13
    expect(evaluate(fat, s.levels, 3).report.pct).toBeLessThan(base.pct - 8)
    const messy = structuredClone(d)
    for (const p of messy.parts) if (p.kind === 'camera' && p.face === 'back') p.x += 3.3 * Number(p.id.slice(1))
    expect(evaluate(messy, s.levels, 3).report.pct).toBeLessThan(base.pct)
  })

  it('runs ten years without breaking', () => {
    const s = rich()
    s.activeResearch = ['chipset', 'display']
    s.rdBudget = 100e3
    startProduct(s, order(s))
    tick(s, 3600)
    expect(Number.isFinite(s.cash)).toBe(true)
    for (const p of s.products) expect(Number.isFinite(p.unitsSold)).toBe(true)
    expect(s.companies.filter((c) => !c.isPlayer && c.alive).length).toBeGreaterThanOrEqual(8)
    expect(trailingUnits(s).reduce((a, x) => a + x.units, 0)).toBeGreaterThan(30e6)
    expect(s.reports.length).toBe(120)
    for (const type of DEVICE_TYPES) expect(s.products.some((p) => p.type === type && p.status === 'sale'), type).toBe(true)
  }, 120000)
})

describe('devices and production', () => {
  it('builds stock through a contract manufacturer and sells it', () => {
    const s = fresh()
    expect(startProduct(s, order(s))).toBeNull()
    const p = mine(s)[0]
    expect(p.stock).toBe(0)
    tick(s, 200)
    expect(p.status).toBe('sale')
    expect(p.reviews).toHaveLength(4)
    expect(p.unitsSold).toBeGreaterThan(0)
    expect(p.unitsSold + p.stock + pendingUnits(s, p.id)).toBe(20000)
    expect(s.reports.some((r) => r.production > 0)).toBe(true)
    expect(p.feedback.length).toBeGreaterThan(0)
  })

  it('sells more of a cheaper phone than an identical expensive one', () => {
    const run = (price: number) => {
      const s = rich()
      startProduct(s, order(s, { price, quantity: 1e6 }))
      tick(s, 300)
      return mine(s)[0].unitsSold
    }
    expect(run(299)).toBeGreaterThan(run(699) * 1.5)
  })

  it('rejects designs that use locked tech', () => {
    const s = fresh()
    const d = starterDesign(s)
    d.specs.chipGen = 8
    expect(startProduct(s, order(s, { design: d }))).toMatch(/Chipset/)
  })

  it('derives valid Pro, Lite, Max, Mini and Ultra variants', () => {
    const s = fresh(7, { techLevel: 4 })
    for (const type of DEVICE_TYPES) {
      const base = starterDesign(s, type)
      const baseCost = evaluate(base, s.levels, 3, s.features).unitCost
      for (const v of VARIANTS) {
        const d = deriveVariant(base, v.id, s.levels, s.features)
        const ev = evaluate(d, s.levels, 3, s.features)
        expect(ev.report.issues.filter((i) => i.level === 'error'), `${type} ${v.id}`).toEqual([])
        if (v.id === 'Lite') expect(ev.unitCost, `${type} Lite`).toBeLessThan(baseCost)
        if (v.id === 'Max') expect(d.body.height, `${type} Max`).toBeGreaterThanOrEqual(base.body.height)
      }
    }
  })

  it('makes a variant cheaper to develop and earns more from storage tiers', () => {
    const s = rich()
    expect(startProduct(s, order(s, { family: 'Nova', quantity: 50000 }))).toBeNull()
    const devCost = s.cur.development
    const lite = deriveVariant(starterDesign(s), 'Lite', s.levels, s.features)
    expect(startProduct(s, order(s, { family: 'Nova', variant: 'Lite', design: lite, price: 249, tiers: [{ storage: 1024, price: 329 }], quantity: 50000 }))).toBeNull()
    expect(s.cur.development - devCost).toBeLessThan(devCost * 0.7)
    expect(startProduct(s, order(s, { family: 'Nova', variant: 'Lite' }))).toMatch(/already have/)
    tick(s, 200)
    const p = mine(s).find((x) => x.variant === 'Lite')!
    expect(p.revenue / p.unitsSold).toBeGreaterThan(249 * 0.85)
  })

  it('runs a factory line and builds cheaper than a contractor', () => {
    const s = rich()
    expect(orderProduction(s, 'nope', 10, 'factory')).toMatch(/no such device/)
    expect(buildFactory(s)).toBeNull()
    expect(lineStats(s.factory!).running).toBe(false)
    expect(startProduct(s, order(s, { mode: 'factory' }))).toMatch(/no working line/)
    expect(autoLine(s)).toBeNull()
    const line = lineStats(s.factory!)
    expect(line.running).toBe(true)
    expect(line.throughput).toBe(500)
    expect(line.defectRate).toBeLessThan(0.02)
    expect(line.flow.size).toBe(2)
    // swap the test station for a conveyor: the line still runs but ships more faults
    s.factory!.items = s.factory!.items.filter((i) => i.kind !== 'test')
    expect(lineStats(s.factory!).running).toBe(false)
    const gap = [13, 6] as const
    expect(placeItem(s, 'factory', 'conveyor', gap[0], gap[1], 0)).toBeNull()
    expect(lineStats(s.factory!).defectRate).toBeCloseTo(0.06)

    expect(startProduct(s, order(s, { mode: 'factory', quantity: 5000 }))).toBeNull()
    tick(s, 12)
    const p = mine(s)[0]
    expect(p.stock).toBe(5000)
    expect(p.defectRate).toBeCloseTo(0.06)
    expect(s.cur.facilities).toBeGreaterThan(0)
  })

  it('lets a fixed-price contract ride out a shortage', () => {
    const s = rich()
    expect(lockSupply(s, 'semis')).toBeNull()
    expect(lockSupply(s, 'semis')).toMatch(/already/)
    s.supply.shock.semis = 0.5
    s.supply.shockDays.semis = 100
    expect(supplyPrice(s, 'semis')).toBeCloseTo(1, 1)
    expect(supplyPrice(s, 'displays')).toBeCloseTo(1, 1)
    s.supply.shock.displays = 0.5
    expect(supplyPrice(s, 'displays')).toBeGreaterThan(1.4)
    tick(s, 400)
    expect(s.supply.history.semis.length).toBeGreaterThan(10)
  })
})

describe('research tree', () => {
  it('researches a branch feature and unlocks it for designs', () => {
    const s = rich()
    expect(s.features).toContain('hz90')
    expect(s.features).not.toContain('sat')
    expect(toggleResearch(s, 'f:sat')).toMatch(/Chipset level 4/)
    const d = starterDesign(s)
    d.specs.extras.push('wireless')
    expect(startProduct(s, order(s, { design: d, family: 'A' }))).toBeNull()
    s.features = s.features.filter((f) => f !== 'wireless')
    expect(startProduct(s, order(s, { design: d, family: 'B' }))).toMatch(/Wireless charging/)
    expect(toggleResearch(s, 'f:wireless')).toBeNull()
    s.rdBudget = 5e6
    tick(s, 60)
    expect(s.features).toContain('wireless')
    expect(s.activeResearch).not.toContain('f:wireless')
  })

  it('blocks a trunk level until the track it depends on is ready', () => {
    const s = rich()
    s.levels.display = 2
    s.levels.chipset = 1
    expect(toggleResearch(s, 'display')).toMatch(/Chipset level 2/)
    s.levels.chipset = 2
    expect(toggleResearch(s, 'display')).toBeNull()
  })
})

describe('people and places', () => {
  it('makes seated staff useful, pays them and tracks morale', () => {
    const s = fresh()
    expect(staffEffects(s).research).toBe(1)
    for (let i = 0; i < 3; i++) expect(hire(s, s.candidates[0].id)).toBeNull()
    for (const e of s.staff) e.role = 'researcher'
    let fx = staffEffects(s)
    expect(fx.seated).toBe(2)
    expect(fx.idle).toBe(1)
    expect(fx.research).toBeGreaterThan(1)
    expect(placeItem(s, 'office', 'desk', 6, 4, 0)).toBeNull()
    expect(placeItem(s, 'office', 'desk', 6, 4, 0)).toMatch(/already there/)
    expect(placeItem(s, 'office', 'meeting', 8, 5, 0)).toMatch(/goes in/)
    expect(placeItem(s, 'office', 'bench', 7, 5, 0)).toMatch(/goes in: research lab/)
    const before = staffEffects(s).research
    expect(zoneRoom(s, 'office', 'lab', 11, 2, 13, 4)).toBeNull()
    expect(placeItem(s, 'office', 'bench', 11, 2, 0)).toBeNull()
    fx = staffEffects(s)
    expect(fx.idle).toBe(0)
    expect(fx.research).toBeGreaterThan(before)
    // underpaid, uncomfortable people lose heart and eventually leave
    s.office.items = s.office.items.filter((i) => i.kind === 'desk' || i.kind === 'bench')
    for (const e of s.staff) {
      e.salary = 500
      e.traits = []
    }
    s.cash = 1e9
    tick(s, 400)
    expect(s.reports[0].salaries).toBeGreaterThan(0)
    expect(s.staff.length).toBeLessThan(3)
    expect(s.news.some((n) => /quit/.test(n.text))).toBe(true)
  })

  it('moves to a bigger plot and keeps every room and item', () => {
    const s = rich()
    const count = s.office.items.length
    const built = builtTiles(s.office)
    expect(upgradeOffice(s)).toBeNull()
    expect(s.office.w).toBe(SITE_TIERS.office[1].w)
    expect(s.office.items.length).toBe(count)
    expect(builtTiles(s.office)).toBe(built)
    expect(sealedRooms(s.office)).toEqual([])
    // everything still stands where a fresh placement would be allowed
    for (const it of s.office.items) expect(canPlace({ ...s.office, items: [] }, it.kind, it.x, it.y, it.rot), it.kind).toBeNull()
    for (let i = 0; i < 3; i++) expect(upgradeOffice(s)).toBeNull()
    expect(s.office.w).toBe(SITE_TIERS.office[4].w)
    expect(builtTiles(s.office)).toBe(built)
    expect(upgradeOffice(s)).toMatch(/largest/)
  })

  it('zones rooms, walls them in and only counts rooms with a door', () => {
    const s = fresh()
    expect(s.office.rooms).toHaveLength(1)
    const cash = s.cash
    expect(zoneRoom(s, 'office', 'lounge', 11, 2, 13, 5)).toBeNull()
    expect(s.cash).toBe(cash - 12 * 420)
    const lounge = s.office.rooms.find((r) => r.type === 'lounge')!
    expect(openRooms(s.office).has(lounge.n)).toBe(true)
    expect(placeItem(s, 'office', 'coffee', 11, 2, 1)).toBeNull()
    expect(placeItem(s, 'office', 'desk', 12, 4, 0)).toMatch(/goes in/)
    expect(placeItem(s, 'office', 'otree', 12, 4, 0)).toMatch(/goes in/)
    expect(placeItem(s, 'office', 'otree', 0, 4, 0)).toBeNull()
    expect(zoneRoom(s, 'office', 'lounge', 11, 2, 13, 5)).toMatch(/already built/)
    // extending a room keeps it one room
    expect(zoneRoom(s, 'office', 'lounge', 11, 2, 13, 6, 'rect', lounge.n)).toBeNull()
    expect(s.office.rooms.filter((r) => r.type === 'lounge')).toHaveLength(1)

    // brick up the garage door: its desks stop counting
    expect(staffEffects(s).seats).toBe(2)
    const work = s.office.rooms.find((r) => r.type === 'work')!
    for (const w of [...s.office.walls]) {
      const sides = [gridAt(s.office, w.x, w.y), w.side === 'n' ? gridAt(s.office, w.x, w.y - 1) : gridAt(s.office, w.x - 1, w.y)]
      if (sides.includes(work.n)) expect(setEdge(s, 'office', w.x, w.y, w.side, 'wall')).toBeNull()
    }
    expect(sealedRooms(s.office).map((r) => r.type)).toEqual(['work'])
    expect(staffEffects(s).seats).toBe(0)
    expect(setEdge(s, 'office', 3, 4, 'w', 'door')).toBeNull()
    expect(setEdge(s, 'office', 0, 0, 'n', 'door')).toMatch(/no wall/)
    expect(staffEffects(s).seats).toBe(2)

    // knocking a room down sells what was in it
    const items = s.office.items.length
    clearZone(s, 'office', 11, 2, 13, 6)
    expect(s.office.rooms.some((r) => r.type === 'lounge')).toBe(false)
    expect(s.office.items.length).toBe(items - 1)
    expect(setLook(s, 'office', { facade: 1, roof: 2, floors: 3 })).toBeNull()
    expect(s.office.floors).toBe(3)
    expect(JSON.parse(JSON.stringify(s.office))).toEqual(s.office)
  })

  it('sells directly through a store the player has fitted out', () => {
    const s = rich()
    startProduct(s, order(s, { quantity: 200000 }))
    tick(s, 80)
    expect(openStore(s, 1)).toBeNull()
    const store = s.stores[0]
    expect(storeStats(store.site).open).toBe(true)
    expect(placeItem(s, `store:${store.id}`, 'table', 5, 5, 0)).toBeNull()
    expect(placeItem(s, `store:${store.id}`, 'plant', 2, 2, 0)).toBeNull()
    expect(placeItem(s, `store:${store.id}`, 'plant', 0, 0, 0)).toMatch(/goes in/)
    expect(store.region).toBe('na')
    tick(s, 60)
    expect(store.unitsTotal).toBeGreaterThan(0)
    expect(store.lastVisitors).toBeGreaterThan(0)
    expect(storeStats(newSite('store', 0)).open).toBe(false)
  })
})

describe('growth and technology', () => {
  it('builds awareness and product interest with a campaign', () => {
    const base = rich()
    const ads = rich()
    for (const s of [base, ads]) startProduct(s, order(s, { quantity: 1e6, marketing: 0 }))
    const id = mine(ads)[0].id
    expect(startCampaign(ads, 'tv', id, 1000)).toMatch(/at least/)
    expect(startCampaign(ads, 'online', id, 600e3)).toBeNull()
    expect(startCampaign(ads, 'online', 'brand', 300e3)).toBeNull()
    tick(base, 240)
    tick(ads, 240)
    expect(player(ads).awareness).toBeGreaterThan(player(base).awareness * 1.5)
    expect(mine(ads)[0].buzz.mainstream).toBeGreaterThan(0.2)
    expect(mine(ads)[0].unitsSold).toBeGreaterThan(mine(base)[0].unitsSold * 1.3)
    expect(ads.owners).toBeGreaterThan(0)
  })

  it('hosts a keynote on launch day and a trade show booth', () => {
    const s = rich()
    expect(startProduct(s, order(s, { keynote: 1 }))).toBeNull()
    expect(scheduleEvent(s, 'keynote', 0, mine(s)[0].id)).toMatch(/already has a keynote/)
    expect(scheduleEvent(s, 'keynote', 3, 'missing')).toMatch(/in development/)
    expect(scheduleEvent(s, 'fanfest', 0)).toMatch(/20,000 fans/)
    expect(scheduleEvent(s, 'expo', 1)).toBeNull()
    tick(s, 260)
    const keynote = s.events.find((e) => e.type === 'keynote')!
    expect(keynote.done).toBe(true)
    expect(keynote.score).toBeGreaterThan(0)
    expect(s.events.find((e) => e.type === 'expo')!.done).toBe(true)
    expect(s.news.some((n) => n.kind === 'event')).toBe(true)
  })

  it('designs a custom chip that devices can use', () => {
    const s = rich()
    expect(startChip(s, 'B1', 0.5, 0.5, 0.5)).toMatch(/hardware engineer/)
    hire(s, s.candidates[0].id)
    s.staff[0].role = 'engineer'
    expect(startChip(s, 'B1', 1, 1, 1)).toMatch(/budget/)
    expect(startChip(s, 'B1', 0.8, 0.4, 0.8)).toBeNull()
    const d = starterDesign(s)
    d.specs.customChip = s.chips[0].id
    expect(startProduct(s, order(s, { design: d }))).toMatch(/not ready/)
    tick(s, 260)
    expect(s.chips[0].status).toBe('ready')
    const stock = evaluate(starterDesign(s), s.levels, 3, s.features, s.chips)
    const custom = evaluate(d, s.levels, 3, s.features, s.chips)
    expect(custom.raw.perf).toBeGreaterThan(stock.raw.perf)
    expect(startProduct(s, order(s, { design: d }))).toBeNull()
  })

  it('ships an operating system that earns services income', () => {
    const s = rich()
    expect(startOs(s, 'BehemothOS', ['store'])).toMatch(/software engineer/)
    for (let i = 0; i < 2; i++) {
      hire(s, s.candidates[0].id)
      s.staff[i].role = 'software'
      s.staff[i].skill = 80
    }
    expect(startOs(s, 'BehemothOS', ['store', 'fluid', 'privacy'])).toMatch(/at most/)
    expect(startOs(s, 'BehemothOS', ['store', 'fluid'])).toBeNull()
    startProduct(s, order(s, { quantity: 500000 }))
    tick(s, 400)
    expect(s.os.own).toBe(true)
    expect(s.os.version).toBe(1)
    expect(s.os.servicesIncome).toBeGreaterThan(0)
    expect(s.reports.some((r) => r.other > 0)).toBe(true)
  })
})

describe('a bigger world', () => {
  it('starts at home and sells more after entering another region', () => {
    const run = (expand: boolean) => {
      const s = rich()
      startProduct(s, order(s, { quantity: 4e6 }))
      tick(s, 80)
      if (expand) {
        for (const r of REGIONS) if (!s.regions[r.id].open) expect(enterRegion(s, r.id)).toBeNull()
        for (const r of REGIONS) s.regions[r.id].awareness = 0.3
      } else s.regions.na.awareness = 0.3
      tick(s, 120)
      return s
    }
    const home = run(false)
    const world = run(true)
    expect(REGIONS.filter((r) => home.regions[r.id].open).map((r) => r.id)).toEqual(['na'])
    expect(enterRegion(fresh(), 'eu')).toMatch(/Launch a device/)
    expect(mine(world)[0].unitsSold).toBeGreaterThan(mine(home)[0].unitsSold * 2)
    expect(world.regions.ea.history.some((u) => u > 0)).toBe(true)
    expect(home.regions.ea.history.every((u) => u === 0)).toBe(true)
    expect(world.cur.overhead).toBeGreaterThan(home.cur.overhead)
  })

  it('sells shares to investors, lists, and buys a rival', () => {
    const s = fresh()
    expect(founderStake(s)).toBe(1)
    const cash = s.cash
    expect(fundingRound(s, 0.2)).toBeNull()
    expect(s.cash).toBeGreaterThan(cash + 500e3)
    expect(founderStake(s)).toBeCloseTo(0.8)
    expect(fundingRound(s, 0.1)).toMatch(/days until the next round/)
    expect(listCompany(s, 0.2)).toMatch(/worth/)
    tick(s, 400)
    expect(s.stock.history.length).toBe(13)
    expect(s.reports.every((r) => r.funding === 0 || r.month === 0)).toBe(true)

    s.cash = 900e6
    expect(valuation(s)).toBeGreaterThan(200e6)
    expect(listCompany(s, 0.25)).toBeNull()
    expect(s.stock.listed).toBe(true)
    expect(founderStake(s)).toBeCloseTo(0.6)
    const target = s.companies.filter((c) => !c.isPlayer && c.alive).sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0]
    expect(target.value).toBeGreaterThan(0)
    expect(buyRivalStake(s, target.id, 0.1)).toBeNull()
    expect(s.stock.holdings[target.id].stake).toBeCloseTo(0.1)
    s.cash = 50e9
    expect(acquire(s, target.id)).toBeNull()
    expect(target.alive).toBe(false)
    expect(s.products.some((p) => p.companyId === target.id && p.status === 'sale')).toBe(false)
    tick(s, 60)
    expect(Number.isFinite(s.stock.price)).toBe(true)
    expect(s.stock.price).toBeGreaterThan(0)
  })

  it('charges for a longer warranty and handles a recall', () => {
    const s = rich()
    expect(setCare(s, { warrantyYears: 3, updateYears: 5, plan: true, tradeIn: true })).toBeNull()
    expect(setCare(s, { refurb: true })).toMatch(/factory or a store/)
    startProduct(s, order(s, { quantity: 500000 }))
    tick(s, 200)
    const p = mine(s)[0]
    expect(s.care.last.repairCost + s.care.month.repairCost).toBeGreaterThan(0)
    expect(s.care.subscribers).toBeGreaterThan(0)
    p.defectRate = 0.08
    p.unitsSold = Math.max(p.unitsSold, 20000)
    tick(s, 30)
    expect(p.recall?.state).toBe('open')
    expect(recallProduct(s, p.id)).toBeNull()
    expect(p.recall?.state).toBe('done')
    expect(p.defectRate).toBeLessThanOrEqual(0.01)
  })

  it('organises staff into teams that get more done', () => {
    const s = rich()
    upgradeOffice(s)
    expect(zoneRoom(s, 'office', 'work', 8, 11, 20, 12)).toBeNull()
    for (let x = 8; x <= 19; x++) expect(placeItem(s, 'office', 'desk', x, 11, 0)).toBeNull()
    for (let i = 0; i < 12; i++) {
      hire(s, s.candidates[0].id)
      if (!s.candidates.length) tick(s, 30)
    }
    for (const e of s.staff) {
      e.role = 'researcher'
      e.skill = 50
      e.traits = []
      e.morale = 70
    }
    expect(unmanaged(s)).toBe(s.staff.length)
    const loose = staffEffects(s).research
    autoTeams(s)
    expect(s.teams.length).toBe(2)
    expect(unmanaged(s)).toBe(0)
    expect(staffEffects(s).research).toBeGreaterThan(loose)
  })

  it('cuts the stepped edges of diagonal rooms to 45 degrees', () => {
    const s = rich()
    for (let i = 0; i < 2; i++) upgradeOffice(s)
    // a triangle keeps its square corner where the drag began
    expect(zoneRoom(s, 'office', 'gym', 23, 13, 29, 19, 'diag')).toBeNull()
    expect(gridAt(s.office, 23, 13)).toBeGreaterThan(0)
    expect(gridAt(s.office, 29, 19)).toBe(0)
    const cuts = Object.keys(s.office.cuts ?? {})
    expect(cuts.length).toBeGreaterThanOrEqual(4)
    const [cx, cy] = cuts[0].split(',').map(Number)
    expect(placeItem(s, 'office', 'plant', cx, cy, 0)).toMatch(/cut away/)
    expect(sealedRooms(s.office).some((r) => r.type === 'gym')).toBe(false)
    // building against a cut edge squares it off again
    expect(zoneRoom(s, 'office', 'lounge', 24, 14, 30, 20)).toBeNull()
    expect(Object.keys(s.office.cuts ?? {}).length).toBeLessThan(cuts.length)
    expect(JSON.parse(JSON.stringify(s.office))).toEqual(s.office)
  })

  it('starts on one kind of device and opens the others', () => {
    const s = fresh(7, { startType: 'earbuds', startCash: 50e6 })
    expect(s.companies.some((c) => ['Pear', 'Samsong', 'Microsoff'].includes(c.name))).toBe(false)
    expect(fresh(7, { parody: true }).companies.some((c) => c.name === 'Pear')).toBe(true)
    expect(startProduct(s, order(s))).toMatch(/does not make phones/)
    expect(startProduct(s, order(s, { design: starterDesign(s, 'earbuds'), price: 99 }))).toBeNull()
    expect(unlockBlocked(s, 'console')).toMatch(/level 4/)
    expect(unlockCost(s, 'watch')).toBeLessThan(unlockCost(s, 'tablet'))
    const cash = s.cash
    expect(unlockType(s, 'watch')).toBeNull()
    expect(s.cash).toBe(cash - unlockCost({ ...s, types: ['earbuds'] }, 'watch'))
    expect(unlockType(s, 'watch')).toMatch(/already/)
    expect(startProduct(s, order(s, { design: starterDesign(s, 'watch'), family: 'W' }))).toBeNull()
  })

  it('raises incidents that wait for a decision, then settle themselves', () => {
    const s = rich()
    startProduct(s, order(s, { quantity: 300000 }))
    for (let i = 0; i < 60 && !s.incidents.length; i++) tick(s, 30)
    expect(s.incidents.length).toBeGreaterThan(0)
    const first = s.incidents[0]
    expect(first.done).toBe(false)
    expect(decide(s, first.id, 0)).toBeNull()
    expect(first.done).toBe(true)
    expect(decide(s, first.id, 0)).toMatch(/already/)
    // left alone, the next one takes its second option after a month
    for (let i = 0; i < 80 && s.incidents.length < 2; i++) tick(s, 30)
    const second = s.incidents[1]
    expect(second).toBeDefined()
    tick(s, 61)
    expect(second.done).toBe(true)
    expect(JSON.parse(JSON.stringify(s.incidents))).toEqual(s.incidents)
  })

  it('works out a curve tile by tile without gaps or overlaps', () => {
    const shapes = [
      curveFor(1, 1, 9, 9, 'round')!,
      curveFor(0, 0, 14, 8, 'round')!,
      curveFor(2, 3, 31, 28, 'ring', { thick: 6 })!,
      curveFor(0, 0, 19, 9, 'ring', { thick: 4, sweep: 180 })!,
      curveFor(0, 0, 13, 13, 'ring', { thick: 3, sweep: 90, turn: 2 })!,
      curveFor(0, 0, 16, 16, 'ring', { thick: 5, sweep: 270, turn: 1 })!,
      curveFor(0, 0, 9, 4, 'round', { sweep: 180, turn: 2 })!,
    ]
    for (const c of shapes) {
      const g = geomOf(c)
      const hole = c.t ? Math.PI * (c.rx - c.t) * (c.ry - c.t) : 0
      const want = ((Math.PI * c.rx * c.ry - hole) * (c.sweep ?? 360)) / 360
      const got = g.all.reduce((a, t) => a + t.cover, 0)
      expect(Math.abs(got - want) / want, JSON.stringify(c)).toBeLessThan(0.01)
      let wall = 0
      for (const t of g.tiles.values()) {
        // the room's part and the ground's part make up the whole tile
        const inside = t.inside.reduce((a, p) => a + polyArea(p), 0)
        const outside = t.outside.reduce((a, p) => a + polyArea(p), 0)
        expect(inside + outside, `${t.x},${t.y} of ${JSON.stringify(c)}`).toBeCloseTo(1, 5)
        // and both tiles either side of a shared edge agree where the room crosses it
        const east = g.tiles.get(`${t.x + 1},${t.y}`)
        if (east) expect(east.sides.w.flat().map((v) => v.toFixed(5))).toEqual(t.sides.e.flat().map((v) => v.toFixed(5)))
        const south = g.tiles.get(`${t.x},${t.y + 1}`)
        if (south) expect(south.sides.n.flat().map((v) => v.toFixed(5))).toEqual(t.sides.s.flat().map((v) => v.toFixed(5)))
        for (const p of t.pieces) wall += (p.t1 - p.t0) * g.facets[p.facet].len
      }
      // every bay is about a metre of wall, and all of the wall off the grid lines is handed to some tile
      const onGrid = [...g.bays.values()].filter((b) => !b.solid).reduce((a, b) => a + b.len, 0)
      const total = g.facets.reduce((a, f) => a + f.len, 0)
      expect(wall).toBeGreaterThan(total - onGrid - 0.01)
      expect(wall).toBeLessThan(total + 0.01)
      for (const b of g.bays.values()) expect(b.len, b.key).toBeLessThan(1.6)
      // each run of wall is closed: every facet starts where the one before it ended
      for (const loop of g.loops) {
        loop.forEach((f, i) => {
          const prev = g.facets[loop[(i + loop.length - 1) % loop.length]]
          expect(Math.hypot(prev.x1 - g.facets[f].x0, prev.y1 - g.facets[f].y0)).toBeLessThan(1e-6)
        })
      }
    }
    // the same numbers always give the same shape
    expect(JSON.stringify([...geomOf({ cx: 5.5, cy: 5.5, rx: 4.5, ry: 4.5 }).tiles.values()])).toBe(JSON.stringify([...geomOf(curveFor(1, 1, 9, 9, 'round')!).tiles.values()]))
  })

  it('builds round rooms with a true curved wall', () => {
    const s = rich()
    for (let i = 0; i < 2; i++) upgradeOffice(s)
    const site = () => s.office
    s.config.unlimitedMoney = false
    s.cash = 1e9
    const cash = s.cash
    expect(zoneRoom(s, 'office', 'atrium', 1, 1, 9, 9, 'round')).toBeNull()
    // charged for the floor inside the wall, not for whole tiles
    expect(Math.abs(cash - s.cash - Math.PI * 4.5 * 4.5 * 650)).toBeLessThan(650)
    s.config.unlimitedMoney = true
    expect(site().cuts ?? {}).toEqual({})
    expect(site().curves).toHaveLength(1)
    const atrium = site().rooms.find((r) => r.type === 'atrium')!
    expect(site().curves![0]).toMatchObject({ room: atrium.n, cx: 5.5, cy: 5.5, rx: 4.5, ry: 4.5 })
    // the grid holds every tile the circle touches; the corners of its box stay open
    expect(gridAt(site(), 5, 5)).toBe(atrium.n)
    expect(gridAt(site(), 1, 1)).toBe(0)
    expect(roomTiles(site(), atrium.n)).toBeGreaterThan(64)
    // tiles the wall runs through take no furniture, the middle does
    const edge = [...curveTiles(site()).values()]
    expect(edge.length).toBeGreaterThan(20)
    expect(edge.every((t) => t.shape.cover > 0 && t.shape.cover < 1)).toBe(true)
    expect(placeItem(s, 'office', 'otree', edge[0].shape.x, edge[0].shape.y, 0)).toMatch(/curved wall/)
    expect(placeItem(s, 'office', 'otree', 5, 5, 0)).toBeNull()
    // it got a door in the curved wall, facing south, and counts as open
    const doors = Object.entries(site().curves![0].walls ?? {})
    expect(doors).toHaveLength(1)
    expect(doors[0][1]).toBe('door')
    const bay = geomOf(site().curves![0]).bays.get(doors[0][0])!
    expect(bay.ny).toBeGreaterThan(0.95)
    expect(sealedRooms(site()).some((r) => r.type === 'atrium')).toBe(false)
    // no straight wall stands where the curve has taken the tile's side away
    expect(isBoundary(site(), 1, 5, 'w')).toBe(false)
    expect(faceId(site(), 5, 9, 's')).toBe(0)
    // brick the door up and the room is sealed; glaze a bay and it still is; open one and it is not
    expect(setCurveEdge(s, 'office', 0, doors[0][0], 'wall')).toBeNull()
    expect(sealedRooms(site()).some((r) => r.type === 'atrium')).toBe(true)
    expect(setCurveEdge(s, 'office', 0, 'o3', 'glass')).toBeNull()
    expect(sealedRooms(site()).some((r) => r.type === 'atrium')).toBe(true)
    expect(setCurveEdge(s, 'office', 0, 'o4', 'open')).toBeNull()
    expect(sealedRooms(site()).some((r) => r.type === 'atrium')).toBe(false)
    expect(setCurveEdge(s, 'office', 0, 'o999', 'door')).toMatch(/no wall/)
    expect(setCurveEdge(s, 'office', 3, 'o1', 'door')).toMatch(/no wall/)
    // it survives a save and a move to a bigger plot, door and all
    expect(JSON.parse(JSON.stringify(site()))).toEqual(site())
    const before = { tiles: roomTiles(site(), atrium.n), edge: curveTiles(site()).size, w: site().w, h: site().h }
    expect(upgradeOffice(s)).toBeNull()
    const dx = (site().w - before.w) / 2
    expect(site().curves![0].cx).toBe(5.5 + dx)
    expect(roomTiles(site(), atrium.n)).toBe(before.tiles)
    expect(curveTiles(site()).size).toBe(before.edge)
    expect(site().curves![0].walls).toEqual({ o3: 'glass', o4: 'open' })
    expect(sealedRooms(site()).some((r) => r.type === 'atrium')).toBe(false)
    expect(placeItem(s, 'office', 'gbench', 5 + dx, 6 + Math.floor((site().h - before.h) / 2), 0)).toBeNull()
    // a room of another kind built against it shares the curved wall: nothing is squared off, and the
    // sliver of each tile beyond the curve is the new room's floor (see build.test.ts for more of this)
    const y0 = 1 + Math.floor((site().h - before.h) / 2)
    expect(zoneRoom(s, 'office', 'lounge', 10 + dx, y0 + 3, 13 + dx, y0 + 6)).toBeNull()
    const lounge = site().rooms.find((r) => r.type === 'lounge')!
    expect(site().curves![0].square).toBeUndefined()
    expect(curveTiles(site()).size).toBe(before.edge)
    expect(curveAt(site(), 9 + dx, y0 + 4)?.beyond).toBe(lounge.n)
    expect(placeItem(s, 'office', 'otree', 9 + dx, y0 + 4, 0)).toMatch(/curved wall/)
    expect(isBoundary(site(), 10 + dx, y0 + 4, 'w')).toBe(false)
    expect(setEdge(s, 'office', 10 + dx, y0 + 4, 'w', 'door')).toMatch(/no wall/)
    // knocking part of it down keeps the curve on what is left; knocking it all down forgets the curve
    clearZone(s, 'office', 1 + dx, y0, 4 + dx, y0 + 8)
    expect(site().curves).toHaveLength(1)
    expect(curveTiles(site()).size).toBeGreaterThan(4)
    expect(JSON.parse(JSON.stringify(site()))).toEqual(site())
    removeRoom(s, 'office', atrium.n)
    expect(site().curves).toBeUndefined()
    expect(roomTiles(site(), atrium.n)).toBe(0)
    // an old save has no curves at all, and loads as it was
    const old = migrate(JSON.parse(JSON.stringify(s)))
    expect(old.office.curves).toBeUndefined()
    expect(sealedRooms(old.office)).toEqual([])
  })

  it('builds rings and arcs round an open courtyard', () => {
    const s = rich()
    for (let i = 0; i < 4; i++) upgradeOffice(s)
    const site = s.office
    removeRoom(s, 'office', site.rooms[0].n)
    const [x0, y0, x1, y1] = [20, 4, 59, 43]
    expect(zoneRoom(s, 'office', 'work', x0, y0, x1, y1, 'ring', undefined, { thick: 6 })).toBeNull()
    const ring = site.rooms[site.rooms.length - 1]
    expect(site.curves![site.curves!.length - 1]).toMatchObject({ room: ring.n, cx: 40, cy: 24, rx: 20, ry: 20, t: 6 })
    // the courtyard stays open ground, and can be planted
    expect(gridAt(site, 40, 24)).toBe(0)
    expect(gridAt(site, 40, 6)).toBe(ring.n)
    expect(placeItem(s, 'office', 'fountain', 44, 26, 0)).toBeNull()
    expect(placeItem(s, 'office', 'desk', 40, 6, 0)).toBeNull()
    expect(sealedRooms(site).some((r) => r.n === ring.n)).toBe(false)
    // its door is in the outer wall; the courtyard can be given one too
    const ci = site.curves!.length - 1
    expect(Object.keys(site.curves![ci].walls!)).toEqual([expect.stringMatching(/^o/)])
    expect(bayStands(site, ci, 'i0')).toBe(true)
    expect(setCurveEdge(s, 'office', ci, 'i0', 'door')).toBeNull()
    // paving the courtyard reaches the strip of ground inside the curved wall
    paintArea(s, 'office', x0 + 6, y0 + 6, x1 - 6, y1 - 6, 'round', 'paving')
    const inner = [...curveTiles(site).values()].filter((t) => Math.hypot(t.shape.x + 0.5 - 40, t.shape.y + 0.5 - 24) < 16)
    expect(inner.length).toBeGreaterThan(40)
    expect(inner.every((t) => site.floor[`${t.shape.x},${t.shape.y}`] === 'paving')).toBe(true)
    expect(site.floor['40,6']).toBeUndefined()
    // a second ring cannot be built over the first, but a quarter arc fits beside it
    expect(zoneRoom(s, 'office', 'work', x0, y0, x1, y1, 'ring', undefined, { thick: 6 })).toMatch(/already built/)
    expect(zoneRoom(s, 'office', 'lounge', 2, 30, 15, 43, 'ring', undefined, { thick: 4, sweep: 90, turn: 1 })).toBeNull()
    const arc = site.curves![site.curves!.length - 1]
    expect(arc).toMatchObject({ cx: 2, cy: 44, rx: 14, ry: 14, t: 4, from: 270, sweep: 90 })
    // its straight ends lie on grid lines, so they are ordinary walls that can take ordinary doors
    expect(isBoundary(site, 2, 31, 'w')).toBe(true)
    expect(isBoundary(site, 14, 44, 'n')).toBe(true)
    expect(gridAt(site, 3, 42)).toBe(0)
    // every way of drawing a shape gives tiles on the plot the same way round
    expect(areaTiles(0, 0, 19, 9, 'ring', { thick: 4, sweep: 180 }).length).toBeLessThan(areaTiles(0, 0, 19, 9, 'ring', { thick: 4, sweep: 180 }, true).length)
    expect(areaTiles(0, 0, 0, 5, 'round')).toHaveLength(6)
    // too thin for a courtyard: a ring falls back to a solid disc
    expect(curveFor(0, 0, 5, 5, 'ring', { thick: 4 })!.t).toBeUndefined()
    expect(JSON.parse(JSON.stringify(site))).toEqual(site)
    const days = tick(s, 40)
    expect(days.office.curves).toHaveLength(2)
  })

  it('reaches goals and pays their rewards', () => {
    const s = fresh()
    expect(Object.keys(s.goals)).toEqual([])
    startProduct(s, order(s))
    tick(s, 120)
    expect(s.goals.launch).toBeGreaterThan(0)
    expect(s.news.some((n) => n.kind === 'goal')).toBe(true)
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length)
    for (const g of GOALS) expect(g.progress(s), g.id).toBeGreaterThanOrEqual(0)
  })

  it('builds a venue and holds a keynote there', () => {
    const s = rich()
    expect(buildVenue(s)).toBeNull()
    expect(venueStats(s.venue!).ready).toBe(false)
    expect(autoVenue(s)).toBeNull()
    const st = venueStats(s.venue!)
    expect(st.ready).toBe(true)
    expect(st.seats).toBe(144)
    expect(startProduct(s, order(s, { keynote: 3 }))).toBeNull()
    tick(s, 120)
    const e = s.events.find((x) => x.type === 'keynote')!
    expect(e.done).toBe(true)
    expect(e.beats?.seats).toBe(144)
    for (const kind of [0, 1, 2]) {
      const hired = hiredVenue(kind)
      // nothing overlaps and everything stands somewhere it is allowed
      for (const it of hired.items) expect(canPlace({ ...hired, items: hired.items.filter((x) => x !== it) }, it.kind, it.x, it.y, it.rot), `${kind} ${it.kind}`).toBeNull()
      expect(venueStats(hired).ready).toBe(kind > 0)
    }
  })
})

describe('desktops, consoles, earbuds and TVs', () => {
  const NEW: DeviceType[] = ['desktop', 'console', 'earbuds', 'tv']
  const finite = (ev: ReturnType<typeof evaluate>, label: string, least = 1) => {
    for (const k of SUBS) {
      expect(Number.isFinite(ev.raw[k]), `${label} ${k}`).toBe(true)
      expect(ev.raw[k], `${label} ${k}`).toBeGreaterThanOrEqual(least)
    }
    expect(Number.isFinite(ev.unitCost) && ev.unitCost > 0, `${label} cost`).toBe(true)
    expect(Number.isFinite(ev.report.pct), `${label} design`).toBe(true)
    expect(ev.report.weight, `${label} weight`).toBeGreaterThan(10)
    for (const v of Object.values(ev.costParts)) expect(Number.isFinite(v) && v >= 0, `${label} cost part`).toBe(true)
  }

  it('evaluates every new type at any tech level without bad numbers', () => {
    for (const techLevel of [0, 3, 8]) {
      const s = fresh(7, { techLevel })
      for (const type of NEW) {
        const d = starterDesign(s, type)
        const ev = evaluate(d, s.levels, marketLevel(0), s.features, s.chips)
        finite(ev, `${type} at level ${techLevel}`)
        expect(ev.report.issues.filter((i) => i.level === 'error'), `${type} at level ${techLevel}`).toEqual([])
        // a bare design with nothing chosen must still evaluate: old saves and half-built drafts look like this
        const bare = structuredClone(d)
        bare.parts = []
        for (const k of ['io', 'gpu', 'keyboard', 'cooling', 'speakers', 'driver', 'anc'] as const) delete bare.specs[k]
        delete bare.body.stand
        delete bare.body.buds
        finite(evaluate(bare, s.levels, marketLevel(0), s.features, s.chips), `bare ${type}`, 0)
      }
    }
  })

  it('names the scores of each type and has options for all of them', () => {
    expect(subLabel('console', 'display')).toBe('Picture output')
    expect(subLabel('earbuds', 'perf')).toBe('Sound quality')
    expect(subLabel('tv', 'battery')).toBe('Sound')
    expect(subLabel('phone', 'camera')).toBe('Camera')
    for (const type of NEW) {
      expect(segmentsOf(type).length, type).toBeGreaterThanOrEqual(2)
      expect(ioOptions(type).length, type).toBeGreaterThan(3)
      for (const seg of segmentsOf(type)) {
        expect(Object.values(seg.weights).reduce((a, b) => a + b, 0), seg.id).toBeCloseTo(1, 5)
        expect(RIVALS.filter((r) => r.segments.includes(seg.id)).length, seg.id).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('needs cooling for hot chips and room for big speakers', () => {
    const s = fresh(7, { techLevel: 4 })
    const box = starterDesign(s, 'console')
    box.specs.chipTier = 2
    box.specs.gpu = 3
    box.specs.cooling = 0
    Object.assign(box.body, { width: 200, height: 45, thickness: 150 })
    expect(thermal(box)!.headroom).toBeLessThan(0.5)
    expect(evaluate(box, s.levels, 3, s.features).report.issues.some((i) => i.level === 'error' && /overheats/.test(i.text))).toBe(true)
    box.body.height = 300
    box.body.thickness = 280
    expect(thermal(box)!.headroom).toBeGreaterThan(1)
    const tv = starterDesign(s, 'tv')
    tv.specs.speakers = 3
    tv.body.thickness = Math.max(minThickness('tv', s.levels.design, tv.specs), 20)
    expect(evaluate(tv, s.levels, 3, s.features).report.issues.some((i) => /speakers need a body/.test(i.text))).toBe(true)
    // the helper rivals use makes room for both
    fitInside(tv, s.levels)
    expect(evaluate(tv, s.levels, 3, s.features).report.issues.filter((i) => i.level === 'error')).toEqual([])
  })

  it('rewards better drivers, noise cancelling and a bigger case battery in earbuds', () => {
    const s = fresh(7, { techLevel: 5 })
    const d = starterDesign(s, 'earbuds')
    const base = evaluate(d, s.levels, 4, s.features)
    const better = structuredClone(d)
    better.specs.driver = 4
    better.specs.anc = 3
    const up = evaluate(better, s.levels, 4, s.features)
    expect(up.raw.perf).toBeGreaterThan(base.raw.perf)
    expect(up.raw.display).toBeGreaterThanOrEqual(base.raw.display)
    expect(up.unitCost).toBeGreaterThan(base.unitCost)
    const small = structuredClone(d)
    small.specs.battery = 100
    expect(evaluate(small, s.levels, 4, s.features).raw.battery).toBeLessThan(base.raw.battery)
    expect(base.report.lifeHours).toBeGreaterThan(10)
    expect(base.report.lifeHours).toBeLessThan(80)
    const beans = structuredClone(d)
    beans.body.buds = 'bean'
    expect(budWeight(beans)).toBeLessThan(budWeight(d))
  })

  it('launches rivals into every new segment at sensible prices', () => {
    const s = tick(fresh(), 6 * 360)
    for (const type of NEW) {
      for (const seg of segmentsOf(type)) {
        const made = s.products.filter((p) => p.segment === seg.id && p.companyId !== 'player')
        const fresh = made.filter((p) => p.launchDay > 360)
        expect(fresh.length, `${seg.id} launches`).toBeGreaterThanOrEqual(3)
        expect(made.filter((p) => p.status === 'sale').length, `${seg.id} on sale`).toBeGreaterThanOrEqual(2)
        for (const p of fresh) {
          const errors = evaluate(p.design, maxLevels, marketLevel(p.launchDay)).report.issues.filter((i) => i.level === 'error')
          expect(errors, `${p.name} (${seg.id})`).toEqual([])
          expect(p.reviewAvg, p.name).toBeGreaterThan(4)
          // prices are compared at launch; older models are discounted and components move
          if (p.history.length > 2) continue
          expect(p.price, `${p.name} (${seg.id})`).toBeGreaterThan(seg.priceRef * 0.45)
          expect(p.price, `${p.name} (${seg.id})`).toBeLessThan(seg.priceRef * 1.9)
        }
        // over six years the makers aiming at a segment sell at least a year's worth of it between them
        expect(made.reduce((a, p) => a + p.unitsSold, 0), `${seg.id} units`).toBeGreaterThan(seg.size * 0.7 * typeDemand(seg.type))
      }
    }
  })

  it('gives a starter design of each new type a fair review, real sales and no monopoly', () => {
    for (const type of NEW) {
      const s = rich()
      const design = starterDesign(s, type)
      const ev = evaluate(design, s.levels, marketLevel(0), s.features, s.chips)
      const seg = bestSegment({ raw: ev.raw, featureBonus: ev.featureBonus, price: 0, type }, player(s), 0).seg
      // priced the way a player would: at the going rate, or at a healthy margin over cost if that is higher
      const price = Math.round(Math.max(seg.priceRef * 0.9, (ev.unitCost * 1.25) / 0.85))
      expect(startProduct(s, order(s, { design, price, quantity: 5e6, marketing: 2e6 })), type).toBeNull()
      tick(s, 540)
      const p = mine(s)[0]
      expect(p.reviewAvg, `${type} review`).toBeGreaterThan(4.5)
      expect(p.reviewAvg, `${type} review`).toBeLessThan(9.6)
      expect(p.unitsSold, `${type} units`).toBeGreaterThan(1000)
      expect(p.price * 0.85, `${type} margin`).toBeGreaterThan(ev.unitCost)
      const all = s.products.filter((x) => x.type === type).reduce((a, x) => a + x.unitsSold, 0)
      expect(p.unitsSold / all, `${type} share`).toBeLessThan(0.4)
    }
  })

  it('keeps every part on a face it belongs to, on every solid of every type', () => {
    const s = fresh()
    for (const p of s.products) {
      const d = p.design
      for (const part of d.parts) {
        expect(facesFor(part.kind, d.type), `${p.name}: ${part.kind}`).toContain(part.face)
        const fs = faceSize(d.body, part.face, d.type)
        expect(Math.abs(part.x), `${p.name}: ${part.kind} x`).toBeLessThanOrEqual(fs.w / 2 + 1e-6)
        expect(Math.abs(part.y), `${p.name}: ${part.kind} y`).toBeLessThanOrEqual(fs.h / 2 + 1e-6)
        // clamping a placed part again must not move it
        expect(clampPart(d.body, part, d.type), `${p.name}: ${part.kind}`).toEqual(part)
      }
    }
    for (const type of DEVICE_TYPES) {
      for (const face of ['front', 'back', 'left', 'right', 'top', 'bottom'] as const) {
        const m = mountOf(type, face)
        expect(designFace(type, m.carrier, m.face), `${type} ${face}`).toBe(face)
      }
      // every kind the editor offers can be added and lands on one of its faces
      const d = starterDesign(s, type)
      for (const kind of kindsFor(type)) {
        const part = newPart(kind, d)
        expect(facesFor(kind, type), `${type} ${kind}`).toContain(part.face)
        expect(Number.isFinite(part.x) && Number.isFinite(part.y) && part.w > 0 && part.h > 0, `${type} ${kind}`).toBe(true)
      }
    }
    // a laptop's deck is a full surface, its sides are edges
    expect(isEdge('top', 'laptop')).toBe(false)
    expect(isEdge('left', 'laptop')).toBe(true)
    expect(isEdge('left', 'console')).toBe(false)
    const laptop = starterDesign(s, 'laptop')
    expect(faceSize(laptop.body, 'top', 'laptop')).toEqual({ w: laptop.body.width, h: laptop.body.height })
  })

  it('adds and removes sockets as ports are chosen in the advanced editor', () => {
    const s = fresh()
    const d = starterDesign(s, 'tv')
    const before = d.specs.io ?? []
    const sockets = (x: typeof d) => x.parts.filter((p) => p.kind === 'port')
    const count = sockets(d).length
    const logo = d.parts.find((p) => p.kind === 'logo')!
    logo.x = 40
    d.specs.io = before.filter((id) => id !== 'hdmi')
    d.parts = syncSockets(d, before)
    expect(sockets(d).length).toBe(count - 2)
    d.specs.io = [...d.specs.io, 'hdmi']
    d.parts = syncSockets(d, before.filter((id) => id !== 'hdmi'))
    expect(sockets(d).length).toBe(count)
    expect(new Set(d.parts.map((p) => p.id)).size).toBe(d.parts.length)
    expect(d.parts.find((p) => p.kind === 'logo')!.x).toBe(40)
    expect(evaluate(d, s.levels, 3, s.features).report.issues.filter((i) => /no socket/.test(i.text))).toEqual([])
  })

  it('warns about a part placed where a desktop stand attaches', () => {
    const s = fresh()
    const d = starterDesign(s, 'desktop')
    const clear = evaluate(d, s.levels, 3, s.features)
    expect(clear.report.issues.filter((i) => /stand attaches/.test(i.text))).toEqual([])
    const mount = standMount(d.body, 'desktop')!
    const button = d.parts.find((p) => p.kind === 'button' && p.face === 'back')!
    button.x = mount.x
    button.y = mount.y
    const blocked = evaluate(d, s.levels, 3, s.features)
    expect(blocked.report.issues.some((i) => /stand attaches/.test(i.text) && i.partId === button.id)).toBe(true)
    expect(blocked.report.pct).toBeLessThan(clear.report.pct)
    // a TV on feet has nothing bolted to its back
    expect(standMount(starterDesign(s, 'tv').body, 'tv')).toBeNull()
  })

  it('lays a console out as a tower when it is tall and narrow', () => {
    const s = fresh()
    const d = starterDesign(s, 'console')
    Object.assign(d.body, { width: 104, height: 300, thickness: 262, corner: 10 })
    d.parts = layoutParts(d.body, { type: 'console', layout: 0, cams: 0, sensor: 0, periscope: false, front: 'notch', fingerprint: 'none', flash: true, stereo: false, logo: 'ACME', logoImage: false, io: d.specs.io })
    const ev = evaluate(d, s.levels, 3, s.features)
    expect(ev.report.issues.filter((i) => /clipping/.test(i.text))).toEqual([])
    expect(d.parts.find((p) => p.kind === 'slot')?.rot).toBe(90)
    // too small for a disc: the drive is refused
    Object.assign(d.body, { width: 100, height: 100 })
    expect(evaluate(d, s.levels, 3, s.features).report.issues.some((i) => /disc drive needs/.test(i.text))).toBe(true)
  })
})

describe('foldables, headsets, speakers and handhelds', () => {
  const NEW: DeviceType[] = ['foldable', 'headset', 'speaker', 'handheld']
  const errorsOf = (ev: ReturnType<typeof evaluate>) => ev.report.issues.filter((i) => i.level === 'error').map((i) => i.text)
  const finite = (ev: ReturnType<typeof evaluate>, label: string, least = 1) => {
    for (const k of SUBS) {
      expect(Number.isFinite(ev.raw[k]), `${label} ${k}`).toBe(true)
      expect(ev.raw[k], `${label} ${k}`).toBeGreaterThanOrEqual(least)
    }
    expect(Number.isFinite(ev.unitCost) && ev.unitCost > 0, `${label} cost`).toBe(true)
    expect(Number.isFinite(ev.report.pct), `${label} design`).toBe(true)
    expect(ev.report.weight, `${label} weight`).toBeGreaterThan(10)
    for (const b of ev.report.breakdown) expect(Number.isFinite(b.score) && b.score <= b.max + 1e-9, `${label} ${b.key}`).toBe(true)
    for (const v of Object.values(ev.costParts)) expect(Number.isFinite(v) && v >= 0, `${label} cost part`).toBe(true)
    for (const v of [ev.report.diag, ev.report.sbr, ev.report.lifeHours, ev.report.maxBattery]) expect(Number.isFinite(v) && v >= 0, `${label} report`).toBe(true)
  }
  const layoutOf = (s: GameState, type: DeviceType, patch: Partial<LayoutOptions> = {}): LayoutOptions => ({ type, layout: 1, cams: type === 'headset' ? 4 : 3, sensor: Math.min(2, s.levels.camera), periscope: false, front: 'notch', fingerprint: 'side', flash: true, stereo: true, logo: 'ACME', logoImage: false, ...patch })

  it('evaluates every new type at any tech level without bad numbers', () => {
    for (const techLevel of [0, 3, 8]) {
      const s = fresh(7, { techLevel })
      for (const type of NEW) {
        const d = starterDesign(s, type)
        const ev = evaluate(d, s.levels, marketLevel(0), s.features, s.chips)
        finite(ev, `${type} at level ${techLevel}`)
        expect(errorsOf(ev), `${type} at level ${techLevel}`).toEqual([])
        // a bare design with nothing chosen must still evaluate: half-built drafts look like this
        const bare = structuredClone(d)
        bare.parts = []
        for (const k of ['io', 'keyboard', 'driver', 'hinge', 'optics', 'mics'] as const) delete bare.specs[k]
        for (const k of ['strap', 'strapColor', 'form', 'screen'] as const) delete bare.body[k]
        finite(evaluate(bare, s.levels, marketLevel(0), s.features, s.chips), `bare ${type}`, 0)
        // and every variant of the starter is something that could be launched
        for (const v of VARIANTS) {
          const made = deriveVariant(d, v.id, s.levels, s.features)
          const evv = evaluate(made, s.levels, marketLevel(0), s.features, s.chips)
          finite(evv, `${type} ${v.id} at level ${techLevel}`)
          expect(errorsOf(evv), `${type} ${v.id} at level ${techLevel}`).toEqual([])
        }
      }
    }
  })

  it('names the scores of each type, has markets and makers for all of them, and says what unlocks every type', () => {
    expect(subLabel('headset', 'camera')).toBe('Tracking and controllers')
    expect(subLabel('headset', 'display')).toBe('Optics and display')
    expect(subLabel('speaker', 'perf')).toBe('Sound quality')
    expect(subLabel('speaker', 'battery')).toBe('Bass and loudness')
    expect(subLabel('handheld', 'camera')).toBe('Controls and features')
    expect(subLabel('foldable', 'camera')).toBe('Camera')
    for (const type of NEW) {
      expect(segmentsOf(type).length, type).toBeGreaterThanOrEqual(2)
      for (const seg of segmentsOf(type)) {
        expect(Object.values(seg.weights).reduce((a, b) => a + b, 0), seg.id).toBeCloseTo(1, 5)
        expect(RIVALS.filter((r) => r.segments.includes(seg.id)).length, seg.id).toBeGreaterThanOrEqual(3)
        for (const r of RIVALS.filter((x) => x.segments.includes(seg.id))) expect(r.series[seg.id], `${r.name} ${seg.id}`).toBeTruthy()
      }
    }
    expect(ioOptions('headset').length).toBeGreaterThan(3)
    expect(ioOptions('speaker').length).toBeGreaterThan(3)
    expect(ioOptions('handheld').length).toBeGreaterThan(3)
    expect(inputOptions('headset')[0].name).toMatch(/Hand tracking/)
    expect(inputOptions('handheld')).toHaveLength(4)
    expect(inputOptions('laptop')[0].name).toBe('Membrane')
    // every segment anyone competes in exists, and every type says what it takes to start making it
    for (const r of RIVALS) for (const id of r.segments) expect(SEGMENTS.some((x) => x.id === id), `${r.name} ${id}`).toBe(true)
    expect(new Set(RIVALS.map((r) => r.name)).size).toBe(RIVALS.length)
    for (const type of DEVICE_TYPES) {
      const u = TYPES[type].unlock
      expect(u, type).toBeDefined()
      expect(u!.cost, type).toBeGreaterThanOrEqual(0)
      for (const [track, level] of Object.entries(u!.needs)) {
        expect(TRACKS, type).toContain(track)
        expect(level, type).toBeLessThanOrEqual(8)
      }
      for (const from of u!.from ?? []) expect(DEVICE_TYPES, type).toContain(from)
      expect(u!.from ?? [], type).not.toContain(type)
    }
    expect(TYPES.phone.unlock).toEqual({ cost: 0, needs: {} })
    expect(TYPES.foldable.unlock!.needs).toEqual({ display: 5, materials: 4 })
    expect(TYPES.headset.unlock!.needs).toEqual({ display: 4, chipset: 5 })
    expect(TYPES.speaker.unlock!.needs).toEqual({})
    expect(TYPES.handheld.unlock!.needs).toEqual({ chipset: 3 })
  })

  it('launches rivals into every new segment at sensible prices', () => {
    const s = tick(fresh(), 6 * 360)
    for (const type of NEW) {
      for (const seg of segmentsOf(type)) {
        const made = s.products.filter((p) => p.segment === seg.id && p.companyId !== 'player')
        const fresh = made.filter((p) => p.launchDay > 360)
        expect(fresh.length, `${seg.id} launches`).toBeGreaterThanOrEqual(6)
        expect(made.filter((p) => p.status === 'sale').length, `${seg.id} on sale`).toBeGreaterThanOrEqual(3)
        expect(new Set(fresh.map((p) => p.companyId)).size, `${seg.id} makers`).toBeGreaterThanOrEqual(3)
        for (const p of fresh) {
          expect(p.type, p.name).toBe(type)
          const ev = evaluate(p.design, maxLevels, marketLevel(p.launchDay))
          expect(errorsOf(ev), `${p.name} (${seg.id})`).toEqual([])
          expect(ev.report.issues.filter((i) => /clipping/.test(i.text)), `${p.name} (${seg.id})`).toEqual([])
          expect(p.reviewAvg, p.name).toBeGreaterThan(5)
          expect(p.reviewAvg, p.name).toBeLessThan(9.7)
          // prices are compared at launch; older models are discounted and components move
          if (p.history.length > 2) continue
          expect(p.price, `${p.name} (${seg.id})`).toBeGreaterThan(seg.priceRef * 0.45)
          expect(p.price, `${p.name} (${seg.id})`).toBeLessThan(seg.priceRef * 1.9)
          expect(p.price * 0.85, `${p.name} (${seg.id}) margin`).toBeGreaterThan(p.unitCost)
        }
        // over six years the makers aiming at a segment sell at least a year's worth of it between them
        expect(made.reduce((a, p) => a + p.unitsSold, 0), `${seg.id} units`).toBeGreaterThan(seg.size * 0.7)
      }
    }
    // nobody was driven out by the new markets, and the new makers are still in them
    for (const name of ['Plait', 'Orrery', 'Marram', 'Tarnwick']) expect(s.companies.find((c) => c.name === name)?.alive, name).toBe(true)
  })

  it('gives a starter design of each new type a fair review, real sales and no monopoly', () => {
    for (const type of NEW) {
      const s = rich()
      const design = starterDesign(s, type)
      const ev = evaluate(design, s.levels, marketLevel(0), s.features, s.chips)
      expect(ev.report.issues.filter((i) => /clipping|no socket/.test(i.text)), type).toEqual([])
      const seg = bestSegment({ raw: ev.raw, featureBonus: ev.featureBonus, price: 0, type }, player(s), 0).seg
      expect(seg.type).toBe(type)
      // priced the way a player would: at the going rate, or at a healthy margin over cost if that is higher
      const price = Math.round(Math.max(seg.priceRef * 0.9, (ev.unitCost * 1.25) / 0.85))
      expect(startProduct(s, order(s, { design, price, quantity: 5e6, marketing: 2e6 })), type).toBeNull()
      tick(s, 540)
      const p = mine(s)[0]
      expect(p.reviewAvg, `${type} review`).toBeGreaterThan(4.5)
      expect(p.reviewAvg, `${type} review`).toBeLessThan(9.6)
      expect(p.unitsSold, `${type} units`).toBeGreaterThan(1000)
      expect(p.price * 0.85, `${type} margin`).toBeGreaterThan(ev.unitCost)
      expect(p.feedback.length, `${type} feedback`).toBeGreaterThan(0)
      for (const f of p.feedback) expect(f.text.length, `${type} feedback`).toBeGreaterThan(5)
      const all = s.products.filter((x) => x.type === type).reduce((a, x) => a + x.unitsSold, 0)
      expect(p.unitsSold / all, `${type} share`).toBeLessThan(0.4)
    }
  })

  it('lays out every size and shape of the new types with nothing clipping and every part where it may go', () => {
    const s = fresh(7, { techLevel: 6 })
    for (const type of NEW) {
      const T = TYPES[type]
      const base = starterDesign(s, type)
      const bodies = [0, 0.5, 1].flatMap((fw) => [0, 0.5, 1].map((fh) => ({ width: T.width[0] + (T.width[1] - T.width[0]) * fw, height: T.height[0] + (T.height[1] - T.height[0]) * fh })))
      const looks = type === 'speaker' ? (['column', 'orb', 'block'] as const).flatMap((form) => [false, true].map((screen) => ({ form, screen }))) : type === 'headset' ? [{ strap: 'soft' }, { strap: 'pack' }] : [{}]
      const everything = ioOptions(type).map((x) => x.id)
      for (const size of bodies) {
        for (const look of looks) {
          for (const edge of ['flat', 'round'] as const) {
            for (const layout of type === 'foldable' ? [0, 1, 2, 3, 4] : [0]) {
              const d = structuredClone(base)
              Object.assign(d.body, size, look, { edge })
              if (type === 'speaker') d.body.thickness = Math.max(60, d.body.form === 'block' ? d.body.width * 0.7 : d.body.width)
              if (everything.length) d.specs.io = [...everything]
              // a speaker takes only the sockets its back panel has room for
              fitSpeaker(d)
              if (type === 'speaker') expect(speakerSockets(d.body, d.specs.io).fits, `${type} ${size.width}x${size.height} ${JSON.stringify(look)}`).toBe(true)
              d.parts = layoutParts(d.body, layoutOf(s, type, { layout, cams: type === 'headset' ? 6 : 4, io: d.specs.io }))
              const label = `${type} ${size.width}x${size.height} ${JSON.stringify(look)} ${edge} layout ${layout}`
              const ev = evaluate(d, maxLevels, 6)
              expect(ev.report.issues.filter((i) => /clipping|no socket/.test(i.text)), label).toEqual([])
              expect(d.parts.length, label).toBeGreaterThan(4)
              for (const part of d.parts) {
                expect(facesFor(part.kind, type), `${label}: ${part.kind}`).toContain(part.face)
                expect(clampPart(d.body, part, type), `${label}: ${part.kind}`).toEqual(part)
                const fs = faceSize(d.body, part.face, type)
                const e = partExtent(part)
                // nothing hangs over the end of the face it is on, bar a speaker's ring, which is the rim of its top
                if (!isRing(part, type)) {
                  expect(Math.abs(part.x) + e.w / 2, `${label}: ${part.kind} on ${part.face}`).toBeLessThanOrEqual(fs.w / 2 + 1e-6)
                  if (!isEdge(part.face, type)) expect(Math.abs(part.y) + e.h / 2, `${label}: ${part.kind} on ${part.face}`).toBeLessThanOrEqual(fs.h / 2 + 1e-6)
                }
              }
            }
          }
        }
      }
      // every kind the editor offers can be added and lands on one of its faces
      for (const kind of kindsFor(type)) {
        const part = newPart(kind, base, 2)
        expect(facesFor(kind, type), `${type} ${kind}`).toContain(part.face)
        expect(clampPart(base.body, part, type), `${type} ${kind}`).toEqual(part)
      }
    }
  })

  it('keeps parts off a foldable\'s hinge and cover screen, and scores its hinge', () => {
    const s = fresh(7, { techLevel: 6 })
    const d = starterDesign(s, 'foldable')
    const cover = coverScreen(d.body)
    expect(cover.x).toBeGreaterThan(0)
    expect(cover.w).toBeLessThan(d.body.width / 2)
    for (const p of d.parts) {
      const e = partExtent(p)
      // everything on the back is on the half that is not the cover screen, but for the camera that looks out through it
      if (p.face === 'back' && isCoverCam(d, p)) expect(Math.abs(p.x - cover.x), 'cover camera').toBeLessThan(cover.w / 2)
      else if (p.face === 'back') expect(p.x + e.w / 2, p.kind).toBeLessThanOrEqual(-HINGE_CLEAR + 1e-6)
      if (p.face === 'top' || p.face === 'bottom') expect(Math.abs(p.x) - e.w / 2, p.kind).toBeGreaterThanOrEqual(HINGE_CLEAR - 1e-6)
    }
    expect(d.parts.some((p) => p.kind === 'camera' && p.face === 'back' && !isCoverCam(d, p))).toBe(true)
    // the cover screen's camera is a part, and counts as a front camera
    expect(d.parts.filter((p) => isCoverCam(d, p)).length).toBe(1)
    // a camera dragged onto the cover half becomes one, and stays inside the cover screen
    const cam = d.parts.find((p) => p.kind === 'camera' && p.face === 'back' && !isCoverCam(d, p))!
    const moved = clampPart(d.body, { ...cam, x: d.body.width / 2, y: d.body.height }, 'foldable')
    expect(Math.abs(moved.x - cover.x)).toBeLessThan(cover.w / 2)
    expect(Math.abs(moved.y - cover.y)).toBeLessThan(cover.h / 2)
    // anything else dragged there goes back to its own half
    const logo = d.parts.find((p) => p.kind === 'logo') ?? { ...cam, kind: 'flash' as const }
    expect(clampPart(d.body, { ...logo, face: 'back', x: cover.x }, 'foldable').x).toBeLessThan(0)
    const plain = structuredClone(d)
    plain.specs.hinge = 0
    const best = structuredClone(d)
    best.specs.hinge = HINGES.length - 1
    const a = evaluate(plain, maxLevels, 5)
    const b = evaluate(best, maxLevels, 5)
    expect(b.raw.display).toBeGreaterThan(a.raw.display)
    expect(b.raw.design).toBeGreaterThan(a.raw.design)
    expect(b.unitCost).toBeGreaterThan(a.unitCost)
    expect(foldedThickness(best)).toBeLessThan(foldedThickness(plain))
    expect(foldedThickness(plain)).toBeGreaterThan(2 * plain.body.thickness)
    expect(evaluate(best, s.levels, 5, s.features).report.issues.some((i) => /hinge needs Materials/.test(i.text))).toBe(s.levels.materials < HINGES[HINGES.length - 1].level)
    // the cover screen is part of what the display costs
    const narrow = structuredClone(d)
    narrow.body.bezelSide += 6
    expect(evaluate(narrow, maxLevels, 5).costParts.displays).toBeLessThan(evaluate(d, maxLevels, 5).costParts.displays)
  })

  it('wants tracking cameras, lenses with room and a way to point on a headset', () => {
    const s = fresh(7, { techLevel: 5 })
    const d = starterDesign(s, 'headset')
    const base = evaluate(d, s.levels, 4, s.features)
    expect(errorsOf(base)).toEqual([])
    expect(base.report.lifeHours).toBeGreaterThan(0.8)
    expect(base.report.lifeHours).toBeLessThan(8)
    // no cameras: it cannot be sold; two: it has blind spots
    const blind = structuredClone(d)
    blind.parts = blind.parts.filter((p) => p.kind !== 'camera')
    expect(errorsOf(evaluate(blind, s.levels, 4, s.features)).some((t) => /tracking cameras/.test(t))).toBe(true)
    const two = structuredClone(d)
    two.parts = layoutParts(two.body, layoutOf(s, 'headset', { cams: 2, io: two.specs.io }))
    const few = evaluate(two, s.levels, 4, s.features)
    expect(few.raw.camera).toBeLessThan(base.raw.camera)
    expect(few.report.issues.some((i) => /blind spots/.test(i.text))).toBe(true)
    // simpler lenses need a deeper visor and give a poorer picture
    const fresnel = structuredClone(d)
    fresnel.specs.optics = 0
    expect(minThickness('headset', s.levels.design, fresnel.specs)).toBeGreaterThan(minThickness('headset', s.levels.design, d.specs))
    expect(errorsOf(evaluate(fresnel, s.levels, 4, s.features)).some((t) => /must be at least/.test(t))).toBe(true)
    fresnel.body.thickness = minThickness('headset', s.levels.design, fresnel.specs)
    expect(evaluate(fresnel, s.levels, 4, s.features).raw.display).toBeLessThan(base.raw.display)
    // with no controllers it needs hand tracking
    const bare = structuredClone(d)
    bare.specs.keyboard = 0
    bare.specs.io = (bare.specs.io ?? []).filter((id) => id !== 'hands')
    expect(errorsOf(evaluate(bare, s.levels, 4, s.features)).some((t) => /hand tracking/.test(t))).toBe(true)
    bare.specs.io = [...bare.specs.io, 'hands']
    expect(errorsOf(evaluate(bare, s.levels, 4, s.features))).toEqual([])
    // a battery at the back of the band holds more and is more comfortable
    const pack = structuredClone(d)
    pack.body.strap = 'pack'
    const soft = structuredClone(d)
    soft.body.strap = 'soft'
    expect(maxBattery(pack.body, s.levels.battery, 'headset')).toBeGreaterThan(maxBattery(soft.body, s.levels.battery, 'headset'))
    expect(evaluate(pack, s.levels, 4, s.features).raw.design).toBeGreaterThan(evaluate(soft, s.levels, 4, s.features).raw.design)
  })

  it('gives a bigger speaker more bass, makes big drivers need room, and counts a screen', () => {
    const s = fresh(7, { techLevel: 6 })
    const d = starterDesign(s, 'speaker')
    Object.assign(d.body, { form: 'column', screen: false, width: 104, height: 148, thickness: 104 })
    d.specs.driver = 1
    d.parts = layoutParts(d.body, layoutOf(s, 'speaker', { io: d.specs.io }))
    const base = evaluate(d, s.levels, 5, s.features)
    expect(errorsOf(base)).toEqual([])
    expect(base.report.diag).toBe(0)
    expect(base.costParts.displays).toBe(0)
    const big = structuredClone(d)
    Object.assign(big.body, { width: 172, height: 180, thickness: 160 })
    big.parts = layoutParts(big.body, layoutOf(s, 'speaker', { io: big.specs.io }))
    const loud = evaluate(big, s.levels, 5, s.features)
    expect(speakerShape(big.body).litres).toBeGreaterThan(speakerShape(d.body).litres * 2)
    expect(loud.raw.battery).toBeGreaterThan(base.raw.battery)
    expect(loud.raw.design).toBeLessThan(base.raw.design)
    // the best drivers do not fit a small enclosure
    const cramped = structuredClone(d)
    Object.assign(cramped.body, { width: 96, height: 64, thickness: 96 })
    cramped.specs.driver = SPEAKER_DRIVERS.length - 1
    expect(errorsOf(evaluate(cramped, maxLevels, 5)).some((t) => /enclosure/.test(t))).toBe(true)
    big.specs.driver = SPEAKER_DRIVERS.length - 1
    const hifi = evaluate(big, maxLevels, 5)
    expect(errorsOf(hifi)).toEqual([])
    expect(hifi.raw.perf).toBeGreaterThan(loud.raw.perf)
    // a screen helps the assistant, costs money and has a size
    for (const form of ['column', 'orb', 'block'] as const) {
      const off = structuredClone(d)
      off.body.form = form
      const on = structuredClone(off)
      on.body.screen = true
      const a = evaluate(off, s.levels, 5, s.features)
      const b = evaluate(on, s.levels, 5, s.features)
      expect(b.raw.display, form).toBeGreaterThan(a.raw.display)
      expect(b.unitCost, form).toBeGreaterThan(a.unitCost)
      expect(b.report.diag, form).toBeGreaterThan(1.5)
      expect(b.report.diag, form).toBeLessThan(9)
      // the flats cut for the screen and the sockets leave the body in one piece
      const shape = speakerShape(on.body)
      expect(shape.frontSink + shape.backSink, form).toBeLessThan(on.body.thickness * 0.5)
      expect(shape.screen!.h, form).toBeLessThan(on.body.height)
    }
    // more microphones make a better listener
    const deaf = structuredClone(d)
    deaf.specs.mics = 0
    const keen = structuredClone(d)
    keen.specs.mics = 2
    expect(evaluate(keen, s.levels, 5, s.features).raw.display).toBeGreaterThan(evaluate(deaf, s.levels, 5, s.features).raw.display)
  })

  it('leaves room for a handheld\'s controls, triggers and grips', () => {
    const s = fresh(7, { techLevel: 5 })
    const d = starterDesign(s, 'handheld')
    const flank = TYPES.handheld.flank!
    expect(d.body.bezelSide).toBeGreaterThanOrEqual(flank)
    const base = evaluate(d, s.levels, 4, s.features)
    expect(errorsOf(base)).toEqual([])
    expect(base.report.diag).toBeGreaterThan(5)
    expect(base.report.diag).toBeLessThan(10)
    expect(base.report.lifeHours).toBeGreaterThan(1.5)
    expect(base.report.lifeHours).toBeLessThan(14)
    // a screen that runs under the controls is refused
    const wide = structuredClone(d)
    wide.body.bezelSide = flank - 10
    expect(errorsOf(evaluate(wide, s.levels, 4, s.features)).some((t) => /controls need/.test(t))).toBe(true)
    // parts keep clear of the shoulder buttons along the top and the grips on the back
    for (const p of d.parts) {
      const e = partExtent(p)
      if (p.face === 'top') expect(Math.abs(p.x) + e.w / 2, `${p.kind} on top`).toBeLessThanOrEqual(d.body.width / 2 - SHOULDER + 1e-6)
      if (p.face === 'back') expect(Math.abs(p.x) + e.w / 2, `${p.kind} on back`).toBeLessThanOrEqual(d.body.width / 2 - GRIP + 1e-6)
    }
    const vent = d.parts.find((p) => p.kind === 'vent' && p.face === 'back')!
    expect(Math.abs(clampPart(d.body, { ...vent, x: d.body.width / 2 }, 'handheld').x) + vent.w / 2).toBeLessThanOrEqual(d.body.width / 2 - GRIP + 1e-6)
    // better controls and more features are worth more
    const cheap = structuredClone(d)
    cheap.specs.keyboard = 0
    cheap.specs.io = []
    cheap.parts = layoutParts(cheap.body, layoutOf(s, 'handheld', { io: [] }))
    const poor = evaluate(cheap, s.levels, 4, s.features)
    expect(poor.raw.camera).toBeLessThan(base.raw.camera)
    expect(poor.unitCost).toBeLessThan(base.unitCost)
    // a faster chip drains the battery sooner
    const hot = structuredClone(d)
    hot.specs.chipTier = 2
    const cool = structuredClone(d)
    cool.specs.chipTier = 0
    expect(evaluate(hot, s.levels, 4, s.features).report.lifeHours).toBeLessThan(evaluate(cool, s.levels, 4, s.features).report.lifeHours)
  })
})

describe('e-readers, smart rings, action cameras and drones', () => {
  const NEW: DeviceType[] = ['ereader', 'ring', 'actioncam', 'drone']

  it('launches rivals into every new segment at sensible prices', () => {
    const s = tick(fresh(), 6 * 360)
    for (const type of NEW) {
      for (const seg of segmentsOf(type)) {
        const made = s.products.filter((p) => p.segment === seg.id && p.companyId !== 'player')
        const fresh = made.filter((p) => p.launchDay > 360)
        expect(fresh.length, `${seg.id} launches`).toBeGreaterThanOrEqual(3)
        expect(made.filter((p) => p.status === 'sale').length, `${seg.id} on sale`).toBeGreaterThanOrEqual(2)
        for (const p of fresh) {
          const errors = evaluate(p.design, maxLevels, marketLevel(p.launchDay)).report.issues.filter((i) => i.level === 'error')
          expect(errors, `${p.name} (${seg.id})`).toEqual([])
          expect(p.reviewAvg, p.name).toBeGreaterThan(4)
          if (p.history.length > 2) continue
          expect(p.price, `${p.name} (${seg.id})`).toBeGreaterThan(seg.priceRef * 0.35)
          expect(p.price, `${p.name} (${seg.id})`).toBeLessThan(seg.priceRef * 1.9)
        }
        expect(made.reduce((a, p) => a + p.unitsSold, 0), `${seg.id} units`).toBeGreaterThan(seg.size * 0.7 * typeDemand(seg.type))
      }
    }
  })

  it('gives a starter design of each new type a fair review, real sales and no monopoly', () => {
    for (const type of NEW) {
      const s = rich()
      const design = starterDesign(s, type)
      const ev = evaluate(design, s.levels, marketLevel(0), s.features, s.chips)
      const seg = bestSegment({ raw: ev.raw, featureBonus: ev.featureBonus, price: 0, type }, player(s), 0).seg
      const price = Math.round(Math.max(seg.priceRef * 0.9, (ev.unitCost * 1.25) / 0.85))
      expect(startProduct(s, order(s, { design, price, quantity: 2e6, marketing: 2e6 })), type).toBeNull()
      tick(s, 540)
      const p = mine(s)[0]
      expect(p.reviewAvg, `${type} review`).toBeGreaterThan(4.5)
      expect(p.reviewAvg, `${type} review`).toBeLessThan(9.6)
      expect(p.unitsSold, `${type} units`).toBeGreaterThan(1000)
      expect(p.price * 0.85, `${type} margin`).toBeGreaterThan(p.unitCost)
      const all = s.products.filter((x) => x.type === type).reduce((a, x) => a + x.unitsSold, 0)
      expect(p.unitsSold / all, `${type} share`).toBeLessThan(0.45)
    }
  })

  it('builds each one the way it is meant to be', () => {
    const s = rich()
    // a ring's cell holds a few dozen mAh, and is chosen by the mAh
    const ring = starterDesign(s, 'ring')
    expect(ring.specs.battery).toBeGreaterThan(8)
    expect(ring.specs.battery).toBeLessThan(80)
    expect(evaluate(ring, s.levels, 3, s.features).report.lifeHours).toBeGreaterThan(48)
    // e-ink sips power: an e-reader lasts for weeks of evenings
    const reader = starterDesign(s, 'ereader')
    expect(evaluate(reader, s.levels, 3, s.features).report.lifeHours).toBeGreaterThan(40)
    const dim = structuredClone(reader)
    dim.specs.io = (dim.specs.io ?? []).filter((id) => id !== 'light')
    expect(evaluate(dim, s.levels, 3, s.features).raw.camera).toBeLessThan(evaluate(reader, s.levels, 3, s.features).raw.camera)
    // a drone under 250 g scores its full weight marks, and a heavier one does not
    const drone = starterDesign(s, 'drone')
    const light = evaluate(drone, s.levels, 3, s.features)
    expect(light.report.weight).toBeLessThan(250)
    const big = structuredClone(drone)
    Object.assign(big.body, { width: 110, height: 70, thickness: 230 })
    expect(evaluate(big, s.levels, 3, s.features).report.breakdown.find((x) => x.key === 'weight')!.score).toBeLessThan(light.report.breakdown.find((x) => x.key === 'weight')!.score)
    // every component inside is turned by a rotation, never a mirror image
    const vec = (d: number) => [Math.abs(d) === 1 ? Math.sign(d) : 0, Math.abs(d) === 2 ? Math.sign(d) : 0, Math.abs(d) === 3 ? Math.sign(d) : 0]
    for (const type of NEW) {
      for (const c of layoutInternals(starterDesign(s, type), s.levels).comps) {
        const [u, v, w] = c.ax.map(vec)
        const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]].map((x) => x + 0)
        expect(cross, `${type} ${c.id}`).toEqual(w)
      }
    }
    // without its camera a drone or an action camera cannot be sold
    for (const type of ['drone', 'actioncam'] as const) {
      const d = starterDesign(s, type)
      d.parts = d.parts.filter((p) => p.kind !== 'camera')
      expect(evaluate(d, s.levels, 3, s.features).report.issues.some((i) => i.level === 'error'), type).toBe(true)
    }
  })
})

describe('old saves', () => {
  it('upgrades a version 2 save', () => {
    const s = tick(fresh(), 40) as unknown as Record<string, unknown> & GameState
    s.version = 2
    for (const k of ['factory', 'orders', 'supply', 'stores', 'campaigns', 'events', 'chips', 'os', 'owners', 'fans', 'venue', 'teams', 'policy', 'stock', 'regions', 'care', 'goals']) delete s[k]
    ;(s as unknown as { office: unknown }).office = { tier: 1, w: 12, h: 8, items: [{ id: 'o1', kind: 'desk', x: 2, y: 2, rot: 0 }, { id: 'o9', kind: 'wall', x: 3, y: 3, rot: 0 }] }
    s.companies = s.companies.filter((c) => !['Lyra', 'Dalton', 'Halberg', 'Stride', 'Garrow'].includes(c.name))
    s.products = s.products.filter((p) => p.type === 'phone')
    for (const p of s.products) for (const k of ['type', 'family', 'variant', 'tiers', 'costParts', 'hype', 'buzz', 'defectRate', 'satisfaction', 'feedback']) delete (p as unknown as Record<string, unknown>)[k]
    const m = migrate(JSON.parse(JSON.stringify(s)) as GameState)
    expect(m.version).toBe(SAVE_VERSION)
    expect(m.office.kind).toBe('office')
    expect(m.office.items).toHaveLength(1)
    expect(m.office.rooms).toHaveLength(1)
    expect(sealedRooms(m.office)).toEqual([])
    expect(staffEffects(m).seats).toBe(1)
    // an established company keeps selling everywhere it already did
    expect(REGIONS.every((r) => m.regions[r.id].open)).toBe(true)
    expect(m.stock.founder).toBe(m.stock.shares)
    expect(m.companies.some((c) => c.name === 'Lyra')).toBe(true)
    expect(m.candidates).toHaveLength(9)
    tick(m, 400)
    expect(Number.isFinite(m.cash)).toBe(true)
    expect(m.products.some((p) => p.type === 'laptop')).toBe(true)
  })
})
