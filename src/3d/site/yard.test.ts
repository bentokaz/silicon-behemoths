import { describe, expect, it } from 'vitest'
import { autoLine, buildFactory, defaultConfig, newGame, placeItem } from '../../sim/game'
import { ITEMS, itemTiles, lineStats } from '../../sim/sites'
import type { Site } from '../../sim/types'
import { shippingDocks } from './factorylife'
import { lengthOf, lorryAt, planYard } from './yard'

function plant(tier: number): Site {
  const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 3 })
  for (let i = 0; i <= tier; i++) expect(buildFactory(s)).toBeNull()
  expect(autoLine(s)).toBeNull()
  return s.factory!
}

/** Every tile under a lorry standing at a point: its body is about 2.4 by 7.5 metres. */
function under(site: Site, x: number, z: number, heading: number): [number, number][] {
  const out: [number, number][] = []
  for (let a = -3.4; a <= 3.4; a += 0.85) {
    for (const b of [-1, 0, 1]) {
      const px = x + Math.sin(heading) * a + Math.cos(heading) * b
      const pz = z + Math.cos(heading) * a - Math.sin(heading) * b
      out.push([Math.floor(px + site.w / 2), Math.floor(pz + site.h / 2)])
    }
  }
  return out
}

/** Walks a lorry along a route and reports the first thing on the plot it would drive through, if any. */
function hits(site: Site, route: [number, number][], own: Set<string>, from = 0): string | null {
  const solid = new Map<string, string>()
  for (const it of site.items) {
    const def = ITEMS.factory[it.kind]
    if (!def || def.flat || own.has(it.id)) continue
    for (const [x, y] of itemTiles(site, it)) solid.set(`${x},${y}`, it.kind)
  }
  const pose: [number, number, number] = [0, 0, 0]
  const len = lengthOf(route)
  for (let s = from; s <= len; s += 0.4) {
    lorryAt(route, s, pose)
    for (const [x, y] of under(site, pose[0], pose[1], pose[2])) {
      if (x < 0 || y < 0 || x >= site.w || y >= site.h) continue
      if (site.grid[y * site.w + x]) return `a room at ${x},${y} (s=${s.toFixed(1)})`
      const kind = solid.get(`${x},${y}`)
      if (kind) return `${kind} at ${x},${y} (s=${s.toFixed(1)})`
    }
  }
  return null
}

describe('lorries', () => {
  it('drive round the buildings to the wall behind the dock and back up to it', () => {
    const site = plant(0)
    const docks = shippingDocks(site, lineStats(site).linked)
    expect(docks.length).toBe(1)
    const plan = planYard(site, docks)
    const m = plan.docks.get(docks[0].id)!
    expect(m.arrive.length).toBeGreaterThan(2)
    expect(m.back.length).toBeGreaterThan(2)
    expect(hits(site, m.arrive, new Set())).toBeNull()
    // backing in ends hard up against the wall, so only the swing before the last few metres has to be clear of the hall
    expect(hits(site, m.back, new Set(), 4.5)).toBeNull()
    expect(hits(site, m.leave, new Set(), 4.5)).toBeNull()
  })

  it('use a marked bay when there is one with room to swing into it, and keep clear of what stands in the yard', () => {
    const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 3 })
    for (let i = 0; i < 3; i++) expect(buildFactory(s)).toBeNull()
    expect(autoLine(s)).toBeNull()
    const site = s.factory!
    expect(placeItem(s, 'factory', 'truck', 26, 4, 0)).toBeNull()
    expect(placeItem(s, 'factory', 'otree', 38, 9, 0)).toBeNull()
    expect(placeItem(s, 'factory', 'tank', 30, 22, 0)).toBeNull()
    const docks = shippingDocks(site, lineStats(site).linked)
    const plan = planYard(site, docks)
    const m = plan.docks.get(docks[0].id)!
    const bay = site.items.find((i) => i.kind === 'truck')!
    expect(m.truck).toBe(bay)
    expect(plan.managed.has(bay.id)).toBe(true)
    // it reverses in rather than nosing in
    expect(m.back.length).toBeGreaterThan(2)
    const own = new Set([bay.id])
    expect(hits(site, m.arrive, own)).toBeNull()
    expect(hits(site, m.back, own)).toBeNull()
    expect(hits(site, m.leave, own)).toBeNull()
    // it never spins on the spot: from one moment to the next its heading changes only a little
    const a: [number, number, number] = [0, 0, 0]
    let last = lorryAt(m.arrive, 0, a)[2]
    let worst = 0
    for (let d = 0.4; d <= lengthOf(m.arrive); d += 0.4) {
      const h = lorryAt(m.arrive, d, a)[2]
      let turn = h - last
      turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2
      worst = Math.max(worst, Math.abs(turn))
      last = h
    }
    expect(worst).toBeLessThan(0.35)
    // and stands in the bay, cab toward its open end
    const pose = lorryAt(m.back, 0, [0, 0, 0])
    expect(Math.abs(pose[0] - m.park[0]) + Math.abs(pose[1] - m.park[1])).toBeLessThan(0.01)
  })

  it('leave a lorry standing in a bay that is hemmed in', () => {
    const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 3 })
    expect(buildFactory(s)).toBeNull()
    expect(autoLine(s)).toBeNull()
    const site = s.factory!
    expect(placeItem(s, 'factory', 'truck', 9, 10, 1)).toBeNull()
    expect(placeItem(s, 'factory', 'otree', 6, 12, 0)).toBeNull()
    expect(placeItem(s, 'factory', 'otree', 19, 11, 0)).toBeNull()
    const docks = shippingDocks(site, lineStats(site).linked)
    const plan = planYard(site, docks)
    const m = plan.docks.get(docks[0].id)!
    const own = new Set(m.truck ? [m.truck.id] : [])
    // whichever way it found, it does not drive through the trees or the parked lorry
    if (m.arrive.length) expect(hits(site, m.arrive, own)).toBeNull()
    if (!m.truck) expect(plan.managed.size).toBe(0)
  })
})
