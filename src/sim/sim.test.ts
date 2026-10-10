import { describe, expect, it } from 'vitest'
import { SEGMENTS, marketLevel } from '../data/catalog'
import { defaultConfig, expandOffice, hire, migrate, newGame, placeItem, player, startProduct, starterDesign, tick, toggleResearch, trailingUnits } from './game'
import { staffEffects } from './staff'
import { utility } from './market'
import { evaluate } from './scoring'
import type { GameState } from './types'

const fresh = (seed = 7) => newGame({ ...defaultConfig(), seed })

function launchStarter(s: GameState, price: number, quantity = 20000) {
  const design = starterDesign(s)
  return startProduct(s, { design, name: 'Test One', price, quantity, marketing: 200e3 })
}

describe('simulation', () => {
  it('is deterministic for a fixed seed', () => {
    const a = tick(fresh(), 400)
    const b = tick(fresh(), 400)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const c = tick(fresh(8), 400)
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a))
  })

  it('generates rival devices without blocking errors', () => {
    const s = fresh()
    expect(s.products.length).toBeGreaterThan(10)
    for (const p of s.products) {
      const lv = { display: 8, chipset: 8, camera: 8, battery: 8, charging: 8, materials: 8, design: 8 }
      const errors = evaluate(p.design, lv, marketLevel(0)).report.issues.filter((i) => i.level === 'error')
      expect(errors, p.name).toEqual([])
      expect(p.price).toBeGreaterThan(p.unitCost)
      expect(p.reviewAvg).toBeGreaterThan(1)
    }
  })

  it('survives a save and load round trip', () => {
    const s = tick(fresh(), 200)
    const loaded = JSON.parse(JSON.stringify(s)) as GameState
    expect(JSON.stringify(tick(loaded, 100))).toBe(JSON.stringify(tick(s, 100)))
  })

  it('sells the starter phone and books revenue', () => {
    const s = fresh()
    expect(launchStarter(s, 399)).toBeNull()
    const cashAfterOrder = s.cash
    tick(s, 200)
    const p = s.products.find((x) => x.companyId === 'player')!
    expect(p.status).toBe('sale')
    expect(p.reviews).toHaveLength(4)
    expect(p.unitsSold).toBeGreaterThan(0)
    expect(p.unitsSold + p.stock).toBe(20000)
    expect(s.cash).not.toBe(cashAfterOrder)
  })

  it('sells more of a cheaper phone than an identical expensive one', () => {
    const cheap = fresh()
    const dear = fresh()
    cheap.cash = dear.cash = 1e9
    launchStarter(cheap, 299, 1e6)
    launchStarter(dear, 699, 1e6)
    tick(cheap, 300)
    tick(dear, 300)
    const units = (s: GameState) => s.products.find((x) => x.companyId === 'player')!.unitsSold
    expect(units(cheap)).toBeGreaterThan(units(dear) * 1.5)
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

  it('rejects designs that use locked tech', () => {
    const s = fresh()
    const d = starterDesign(s)
    d.specs.chipGen = 8
    expect(startProduct(s, { design: d, name: 'X', price: 500, quantity: 10, marketing: 0 })).toMatch(/Chipset/)
  })

  it('runs ten years without breaking', () => {
    const s = newGame({ ...defaultConfig(), seed: 7, unlimitedMoney: true })
    s.activeResearch = ['chipset', 'display']
    s.rdBudget = 100e3
    launchStarter(s, 399)
    tick(s, 3600)
    expect(Number.isFinite(s.cash)).toBe(true)
    for (const p of s.products) expect(Number.isFinite(p.unitsSold)).toBe(true)
    const alive = s.companies.filter((c) => !c.isPlayer && c.alive)
    expect(alive.length).toBeGreaterThanOrEqual(4)
    const total = trailingUnits(s).reduce((a, x) => a + x.units, 0)
    expect(total).toBeGreaterThan(10e6)
    expect(s.reports.length).toBe(120)
    expect(player(s).name).toBe('Behemoth Labs')
  })

  it('keeps every segment contested', () => {
    const s = fresh()
    for (const seg of SEGMENTS) {
      const best = Math.max(...s.products.filter((p) => p.status === 'sale').map((p) => utility(p, 0.7, seg, 0)))
      expect(best, seg.id).toBeGreaterThan(0.6)
      expect(best, seg.id).toBeLessThan(2.2)
    }
  })
})

describe('research tree, staff and office', () => {
  it('researches a branch feature and unlocks it for designs', () => {
    const s = newGame({ ...defaultConfig(), seed: 7, unlimitedMoney: true })
    expect(s.features).toContain('hz90')
    expect(s.features).not.toContain('sat')
    expect(toggleResearch(s, 'f:sat')).toMatch(/Chipset level 4/)
    const d = starterDesign(s)
    d.specs.extras.push('wireless')
    expect(startProduct(s, { design: d, name: 'X', price: 500, quantity: 10, marketing: 0 })).toBeNull()
    s.features = s.features.filter((f) => f !== 'wireless')
    expect(startProduct(s, { design: d, name: 'Y', price: 500, quantity: 10, marketing: 0 })).toMatch(/Wireless charging/)
    expect(toggleResearch(s, 'f:wireless')).toBeNull()
    s.rdBudget = 5e6
    tick(s, 60)
    expect(s.features).toContain('wireless')
    expect(s.activeResearch).not.toContain('f:wireless')
  })

  it('blocks a trunk level until the track it depends on is ready', () => {
    const s = newGame({ ...defaultConfig(), seed: 7, unlimitedMoney: true })
    s.levels.display = 2
    s.levels.chipset = 1
    expect(toggleResearch(s, 'display')).toMatch(/Chipset level 2/)
    s.levels.chipset = 2
    expect(toggleResearch(s, 'display')).toBeNull()
  })

  it('makes seated staff useful and charges salaries', () => {
    const s = newGame({ ...defaultConfig(), seed: 7 })
    expect(staffEffects(s).research).toBe(1)
    for (let i = 0; i < 3; i++) expect(hire(s, s.candidates[0].id)).toBeNull()
    for (const e of s.staff) e.role = 'researcher'
    const fx = staffEffects(s)
    expect(fx.seated).toBe(2)
    expect(fx.idle).toBe(1)
    expect(fx.research).toBeGreaterThan(1)
    expect(placeItem(s, 'desk', 6, 4, 0)).toBeNull()
    expect(placeItem(s, 'desk', 6, 4, 0)).toMatch(/taken/)
    expect(staffEffects(s).idle).toBe(0)
    tick(s, 30)
    expect(s.reports[0].salaries).toBeGreaterThan(0)
    expect(expandOffice(s)).toBeNull()
    expect(s.office.w).toBe(12)
  })

  it('upgrades a version 1 save', () => {
    const s = tick(fresh(), 40) as unknown as Record<string, unknown>
    s.version = 1
    for (const k of ['features', 'staff', 'candidates', 'office']) delete s[k]
    const m = migrate(JSON.parse(JSON.stringify(s)) as GameState)
    expect(m.version).toBe(2)
    expect(m.features.length).toBeGreaterThan(3)
    expect(m.candidates).toHaveLength(8)
    tick(m, 60)
    expect(Number.isFinite(m.cash)).toBe(true)
  })
})
