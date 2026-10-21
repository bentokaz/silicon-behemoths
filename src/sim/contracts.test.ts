import { describe, expect, it } from 'vitest'
import { checkReq, noiseDb, saturation } from './contractReqs'
import { FEATURES } from '../data/catalog'
import { TYPES, sizeLimits } from '../data/devices'
import { typeOpen } from '../data/eras'
import { checkAll, reqLabel } from './contractReqs'
import { solveDesign } from './contractSolve'
import { SECTORS, latePay, offerContracts, payFor, reqFor, reqsFor, rewardPerUnit, stepContracts, tierCap, unitsFor } from './contracts'
import { defaultConfig, newGame, starterDesign } from './game'
import type { ContractJob, DeviceDesign } from './types'

const game = () => newGame({ ...defaultConfig(), unlimitedMoney: true, startType: 'phone' })
const design = (type: 'phone' | 'drone' | 'tower' = 'phone'): DeviceDesign => starterDesign(game(), type) as DeviceDesign
const stats = { lifeHours: 0.4 }

describe('requirement checks', () => {
  it('wood needs a wood shell', () => {
    const d = design()
    expect(checkReq({ kind: 'wood' }, d, stats).ok).toBe(false)
    d.body.backMat = 'wood'
    expect(checkReq({ kind: 'wood' }, d, stats).ok).toBe(true)
  })
  it('calm rejects loud colours and accepts greys', () => {
    const d = design()
    d.body.frameColor = '#ff0000'
    expect(saturation('#ff0000')).toBe(1)
    expect(checkReq({ kind: 'calm' }, d, stats).ok).toBe(false)
    d.body.frameColor = '#d8d4cc'
    d.body.backColor = '#8a8a8a'
    expect(checkReq({ kind: 'calm' }, d, stats).ok).toBe(true)
  })
  it('camo, size, flight and secure follow the design', () => {
    const d = design('drone')
    expect(checkReq({ kind: 'camo' }, d, stats).ok).toBe(false)
    d.body.camo = 'woodland'
    expect(checkReq({ kind: 'camo' }, d, stats).ok).toBe(true)
    d.body.width = 200
    expect(checkReq({ kind: 'maxLong', value: 250 }, d, stats).ok).toBe(Math.max(d.body.width, d.body.height) <= 250)
    expect(checkReq({ kind: 'maxLong', value: 100 }, d, stats).ok).toBe(false)
    expect(checkReq({ kind: 'flight', value: 20 }, d, { lifeHours: 0.5 }).ok).toBe(true)
    expect(checkReq({ kind: 'flight', value: 20 }, d, { lifeHours: 0.2 }).ok).toBe(false)
    expect(checkReq({ kind: 'secure' }, d, stats).ok).toBe(false)
    d.specs.io = [...(d.specs.io ?? []), 'secure']
    expect(checkReq({ kind: 'secure' }, d, stats).ok).toBe(true)
  })
  it('a tower is quieter with fewer fans', () => {
    const d = design('tower')
    d.body.pc = { side: 'solid', front: 'mesh', fans: 4, fanSize: 140, feet: 'pads' }
    const loud = noiseDb(d)
    d.body.pc = { ...d.body.pc, fans: 1 }
    expect(noiseDb(d)).toBeLessThan(loud)
  })
  it('asks get tighter with tier', () => {
    expect(reqFor('quiet', 'tower', 3)!.value!).toBeLessThan(reqFor('quiet', 'tower', 0)!.value!)
    expect(reqFor('flight', 'drone', 3)!.value!).toBeGreaterThan(reqFor('flight', 'drone', 0)!.value!)
    expect(reqFor('flight', 'phone', 0)).toBeNull()
  })
})

describe('rewards and lateness', () => {
  it('pays more for higher tiers, more asks and better standing', () => {
    expect(rewardPerUnit(100, 3, 4, 0.5)).toBeGreaterThan(rewardPerUnit(100, 0, 1, 0.5) * 2.5)
    expect(rewardPerUnit(100, 1, 2, 0.9)).toBeGreaterThan(rewardPerUnit(100, 1, 2, 0.1))
    expect(rewardPerUnit(100, 1, 3, 0.3)).toBeGreaterThan(rewardPerUnit(100, 1, 1, 0.3))
    expect(unitsFor(0.5, 3)).toBeLessThan(unitsFor(0.5, 0))
  })
  it('more device lines open harder tiers', () => {
    expect(tierCap(1)).toBe(0)
    expect(tierCap(4)).toBe(2)
    expect(tierCap(19)).toBe(3)
  })
  it('price falls through the grace period', () => {
    const c = { due: 100, grace: 40, perUnit: 10 } as ContractJob
    expect(latePay(c, 100)).toBe(1)
    expect(latePay(c, 120)).toBeCloseTo(0.75)
    expect(latePay(c, 140)).toBeCloseTo(0.5)
    expect(payFor(c, 10, 120)).toBe(75)
  })
})

describe('contract flow', () => {
  const job = (): ContractJob => ({ id: 'k1', client: 'Test', sector: 'military', tier: 1, type: 'phone', units: 10, perUnit: 100, minReview: 0, days: 40, grace: 10, offered: 0, expires: 99, delivered: 0, state: 'active', productId: 'p1', due: 40 })
  it('a late finish pays less and builds less standing; a miss costs standing', () => {
    const s = game()
    const p = s.products.find((x) => x.companyId === 'player') ?? ({} as never)
    s.products = [{ ...p, id: 'p1', stock: 10, status: 'sale' }] as never
    s.day = 45
    s.contracts = [job()]
    const r = stepContracts(s)
    expect(r.income).toBe(Math.round(1000 * 0.75))
    expect(s.sectorRep!.military).toBeGreaterThan(0.3)
    const s2 = game()
    s2.products = [{ ...p, id: 'p1', stock: 4, status: 'sale' }] as never
    s2.day = 60
    s2.contracts = [job()]
    const r2 = stepContracts(s2)
    expect(s2.contracts[0].state).toBe('failed')
    expect(r2.income).toBe(Math.round(4 * 100 * 0.4))
    expect(s2.sectorRep!.military).toBeLessThan(0.3)
  })
  it('offers name a sector client and carry asks that fit the device', () => {
    const s = game()
    for (let m = 0; m < 40; m++) {
      s.day = m * 30
      offerContracts(s)
    }
    const offers = (s.contracts ?? []).filter((c) => c.state === 'offer')
    expect(offers.length).toBeGreaterThan(0)
    for (const c of offers) {
      expect(SECTORS.some((x) => x.client === c.client)).toBe(true)
      expect(c.reqs!.length).toBeLessThanOrEqual((c.tier ?? 0) + 1)
    }
  })
})

function hashRoll(...xs: number[]): number {
  let h = 2166136261
  for (const x of xs) h = Math.imul(h ^ (x | 0), 16777619) ^ (h >>> 13)
  h = Math.imul(h ^ (h >>> 16), 2246822519)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

describe('every contract can be met', () => {
  const eras = [0, 1800, 3600, 5400, 7200]
  const levelSets = [0, 2, 4, 8]
  it("builds a design meeting every ask, at the designer's real limits", () => {
    let checked = 0
    let asks = 0
    const hard: string[] = []
    for (const day of eras) {
      for (const lv of levelSets) {
        const s = game()
        s.day = day
        s.levels = { display: lv, chipset: lv, camera: lv, battery: lv, charging: lv, materials: lv, design: lv } as typeof s.levels
        s.features = lv >= 4 ? FEATURES.map((f) => f.id) : lv === 2 ? ['ip54', 'hz90', 'esim'] : []
        for (const sector of SECTORS) {
          for (const type of sector.types) {
            if (!typeOpen(type, day)) continue
            for (let tier = 0; tier <= 3; tier++) {
              const reqs = reqsFor(sector, type, tier, (i) => hashRoll(day, lv, tier, i), s)
              const { design, stats } = solveDesign(s, type, reqs)
              const res = checkAll(reqs, design, stats)
              checked++
              asks += reqs.length
              if (!res.ok) hard.push(`${sector.id} ${type} t${tier} d${day} L${lv}: ${res.rows.filter((x) => !x.ok).map((x) => `${reqLabel(x.req)} (${x.have})`).join('; ')}`)
              const L = sizeLimits(type)
              for (const r of reqs) {
                // bounds that hold whatever the solver does
                if (r.kind === 'maxLong') expect(r.value!, `${type} longest side`).toBeGreaterThanOrEqual(Math.max(L.width[0], L.height[0]))
                if (r.kind === 'battery') expect(TYPES[type].mains, `${type} has no battery`).toBeFalsy()
                if (r.kind === 'quiet') expect(['laptop', 'desktop', 'console', 'tower']).toContain(type)
                // an ask that needs a feature the company lacks says so on the board
                if (r.kind === 'ip' && !r.needs) expect(s.features.some((f) => f.startsWith('ip')), 'ip owned').toBe(true)
                if (r.kind === 'refresh' && !r.needs) expect(s.features.some((f) => f === `hz${r.value}`), 'refresh owned').toBe(true)
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500)
    expect(asks).toBeGreaterThan(800)
    expect(hard).toEqual([])
  })
  it('never asks a monitor for less than its shortest side, a laptop for less than 280 mm, or a console for battery life', () => {
    expect(reqFor('maxLong', 'monitor', 3)!.value!).toBeGreaterThanOrEqual(470)
    expect(reqFor('maxLong', 'laptop', 3)!.value!).toBeGreaterThanOrEqual(280)
    expect(reqFor('battery', 'console', 0)).toBeNull()
  })
})
