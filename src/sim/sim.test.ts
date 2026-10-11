import { describe, expect, it } from 'vitest'
import { marketLevel } from '../data/catalog'
import { RIVALS, SEGMENTS, ioOptions, segmentsOf, subLabel } from '../data/devices'
import {
  type LaunchOrder,
  autoLine,
  buildFactory,
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
import { clampPart, designFace, faceSize, facesFor, isEdge, kindsFor, mountOf, newPart, standMount } from './geometry'
import { bestSegment, utility } from './market'
import { pendingUnits, supplyPrice } from './ops'
import { VARIANTS, deriveVariant, fitInside, layoutParts, syncSockets } from './rivals'
import { budWeight, evaluate, minThickness, thermal } from './scoring'
import { lineStats, newSite, storeStats, validTile } from './sites'
import { staffEffects } from './staff'
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
      expect(p.weight, p.name).toBeGreaterThan(10)
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
  })
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
    expect(orderProduction(s, 'nope', 10, 'factory')).toMatch(/not available/)
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
    expect(placeItem(s, 'factory', 'conveyor', 9, 3, 0)).toBeNull()
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
    expect(placeItem(s, 'office', 'meeting', 8, 5, 0)).toMatch(/does not fit/)
    const before = staffEffects(s).research
    expect(placeItem(s, 'office', 'bench', 0, 4, 0)).toBeNull()
    fx = staffEffects(s)
    expect(fx.idle).toBe(0)
    expect(fx.research).toBeGreaterThan(before)
    // underpaid, uncomfortable people lose heart and eventually leave
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

  it('moves to a bigger office and keeps the furniture', () => {
    const s = rich()
    const count = s.office.items.length
    expect(upgradeOffice(s)).toBeNull()
    expect(s.office.w).toBe(14)
    expect(s.office.items.length).toBe(count)
    for (let i = 0; i < 3; i++) expect(upgradeOffice(s)).toBeNull()
    expect(s.office.shape).toBe('ring')
    expect(validTile(s.office, 17, 17)).toBe(false)
    expect(validTile(s.office, 17, 2)).toBe(true)
    expect(upgradeOffice(s)).toMatch(/largest/)
  })

  it('sells directly through a store the player has fitted out', () => {
    const s = rich()
    startProduct(s, order(s, { quantity: 200000 }))
    tick(s, 80)
    expect(openStore(s, 1)).toBeNull()
    const store = s.stores[0]
    expect(storeStats(store.site).open).toBe(true)
    expect(placeItem(s, `store:${store.id}`, 'table', 5, 2, 0)).toBeNull()
    expect(placeItem(s, `store:${store.id}`, 'plant', 0, 0, 0)).toBeNull()
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
        expect(made.reduce((a, p) => a + p.unitsSold, 0), `${seg.id} units`).toBeGreaterThan(seg.size * 0.8)
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
      expect(p.price * 0.85, `${type} margin`).toBeGreaterThan(p.unitCost)
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

describe('old saves', () => {
  it('upgrades a version 2 save', () => {
    const s = tick(fresh(), 40) as unknown as Record<string, unknown> & GameState
    s.version = 2
    for (const k of ['factory', 'orders', 'supply', 'stores', 'campaigns', 'events', 'chips', 'os', 'owners', 'fans']) delete s[k]
    ;(s as unknown as { office: unknown }).office = { tier: 1, w: 12, h: 8, items: [{ id: 'o1', kind: 'desk', x: 2, y: 2, rot: 0 }, { id: 'o9', kind: 'wall', x: 3, y: 3, rot: 0 }] }
    s.companies = s.companies.filter((c) => !['Lenova', 'Dull', 'HB', 'Fitbyte', 'Garmon'].includes(c.name))
    s.products = s.products.filter((p) => p.type === 'phone')
    for (const p of s.products) for (const k of ['type', 'family', 'variant', 'tiers', 'costParts', 'hype', 'buzz', 'defectRate', 'satisfaction', 'feedback']) delete (p as unknown as Record<string, unknown>)[k]
    const m = migrate(JSON.parse(JSON.stringify(s)) as GameState)
    expect(m.version).toBe(3)
    expect(m.office.kind).toBe('office')
    expect(m.office.items).toHaveLength(1)
    expect(m.companies.some((c) => c.name === 'Lenova')).toBe(true)
    expect(m.candidates).toHaveLength(9)
    tick(m, 400)
    expect(Number.isFinite(m.cash)).toBe(true)
    expect(m.products.some((p) => p.type === 'laptop')).toBe(true)
  })
})
