import { describe, expect, it } from 'vitest'
import { checkReq, noiseDb, saturation } from './contractReqs'
import { SECTORS, latePay, offerContracts, payFor, reqFor, rewardPerUnit, stepContracts, tierCap, unitsFor } from './contracts'
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
      expect(c.reqs!.length).toBe((c.tier ?? 0) + 1)
    }
  })
})
