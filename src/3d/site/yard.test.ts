import { describe, expect, it } from 'vitest'
import { autoLine, buildFactory, defaultConfig, newGame, paintArea, placeItem } from '../../sim/game'
import { ITEMS, itemTiles, lineStats } from '../../sim/sites'
import type { Site } from '../../sim/types'
import { shippingDocks } from './factorylife'
import { APRON, LANE, lengthOf, lorryAt, planYard } from './yard'

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

/** Whether a point off the plot is on the road or the drive up from it. */
function onRoad(site: Site, x: number, z: number): boolean {
  const tx = Math.floor(x + site.w / 2)
  const ty = Math.floor(z + site.h / 2)
  return (ty >= site.h + 3 && ty <= site.h + 10) || (ty >= site.h && Math.abs(tx + 0.5 - site.w / 2) <= 3)
}

/** The middle of a lorry at every step along a route. */
function* along(route: [number, number][], step = 0.4): Generator<[number, number, number]> {
  const pose: [number, number, number] = [0, 0, 0]
  for (let s = 0; s <= lengthOf(route); s += step) yield lorryAt(route, s, pose)
}

describe('lorries', () => {
  it('come in by the drive, and off the plot keep to the road, the drive and the strip of verge the sheds leave clear', () => {
    for (const tier of [0, 1, 2]) {
      const site = plant(tier)
      const m = planYard(site, shippingDocks(site, lineStats(site).linked)).docks.values().next().value!
      let viaDrive = false
      const hh = site.h / 2
      for (const route of [m.arrive, m.back, m.leave]) {
        for (const [x, z, heading] of along(route)) {
          // on the road it keeps to its own lane, on the right: eastbound on the far side of the middle, westbound on the near
          if (Math.abs(x) > 14 && z > hh + 2.5) {
            const east = Math.sin(heading) > 0
            expect(z - (hh + 7)).toBeCloseTo(east ? LANE : -LANE, 1)
          }
          // no part of it is ever over the kerb: off the plot, every tile under it is road or drive
          for (const [bx, by] of under(site, x, z, heading)) {
            if (bx >= 0 && by >= 0 && bx < site.w && by < site.h) continue
            // (the smallest plot has four metres of yard inside the gate: a lorry cannot straighten up in that, and its tail swings over the pavement)
            if (by >= site.h && by < site.h + 3) tier && expect(Math.abs(bx + 0.5 - site.w / 2)).toBeLessThanOrEqual(3)
          }
          const tx = Math.floor(x + site.w / 2)
          const ty = Math.floor(z + site.h / 2)
          if (tx >= 0 && ty >= 0 && tx < site.w && ty < site.h) continue
          if (ty >= site.h && ty < site.h + 3) viaDrive = true
          if (onRoad(site, x, z)) continue
          // otherwise only on the verge beside or behind the plot, well short of the neighbouring sheds
          expect(Math.max(-tx, tx - (site.w - 1))).toBeLessThanOrEqual(APRON.side)
          expect(-ty).toBeLessThanOrEqual(APRON.back)
          expect(ty).toBeLessThan(site.h)
        }
      }
      expect(viaDrive).toBe(true)
    }
  })

  it('keep to the hard standing where the yard has lawn in it', () => {
    const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 3 })
    for (let i = 0; i < 2; i++) expect(buildFactory(s)).toBeNull()
    expect(autoLine(s)).toBeNull()
    const site = s.factory!
    // the hall stands at x 3-18, y 7-12, the drive comes in at the middle of the south side. Lawn over the whole east
    // yard except a lane of asphalt up its far side
    paintArea(s, 'factory', 19, 0, 30, 19, 'rect', 'grass')
    const soft = (x: number, z: number) => site.floor[`${Math.floor(x + site.w / 2)},${Math.floor(z + site.h / 2)}`] === 'grass'
    const m = planYard(site, shippingDocks(site, lineStats(site).linked)).docks.values().next().value!
    let onGrass = 0
    let onHard = 0
    for (const route of [m.arrive, m.leave]) for (const [x, z] of along(route)) soft(x, z) ? onGrass++ : onHard++
    expect(m.arrive.length).toBeGreaterThan(2)
    // with a paved way round, the lawn is left alone (bar the odd corner the middle of the lorry clips)
    expect(onGrass).toBeLessThan(onHard * 0.05)
    // with no paved way at all it still gets there, by the shortest line
    paintArea(s, 'factory', 0, 0, site.w - 1, site.h - 1, 'rect', 'grass')
    const all = planYard(site, shippingDocks(site, lineStats(site).linked)).docks.values().next().value!
    expect(all.arrive.length).toBeGreaterThan(2)
    expect(lengthOf(all.arrive)).toBeLessThanOrEqual(lengthOf(m.arrive) + 1)
  })

  it('turn round on the way out of a bay they had to nose into, where there is room', () => {
    const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 3 })
    for (let i = 0; i < 2; i++) expect(buildFactory(s)).toBeNull()
    expect(autoLine(s)).toBeNull()
    const site = s.factory!
    // a bay hard against the north edge of the plot: nothing can pull across in front of it there
    expect(placeItem(s, 'factory', 'truck', 22, 0, 0)).toBeNull()
    const bay = site.items.find((i) => i.kind === 'truck')!
    const m = planYard(site, shippingDocks(site, lineStats(site).linked)).docks.values().next().value!
    expect(m.truck).toBe(bay)
    expect(m.back.length).toBe(0)
    expect(m.swing.length).toBeGreaterThan(3)
    expect(m.leave.length).toBeGreaterThan(2)
    const own = new Set([bay.id])
    expect(hits(site, m.arrive, own)).toBeNull()
    expect(hits(site, m.swing, own)).toBeNull()
    expect(hits(site, m.leave, own)).toBeNull()
    // nose in at the end of the way in; backing out starts from there, pointing the same way (it follows the swing tail first)
    const a = lorryAt(m.arrive, lengthOf(m.arrive), [0, 0, 0])
    const b = lorryAt(m.swing, 0, [0, 0, 0])
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.3)
    expect(Math.abs(Math.cos(a[2] - (b[2] + Math.PI)) - 1)).toBeLessThan(0.02)
    // at the end of the swing it has turned about a quarter turn, and drives off forwards from where it stands
    const c = lorryAt(m.swing, lengthOf(m.swing), [0, 0, 0])
    const d = lorryAt(m.leave, 0, [0, 0, 0])
    expect(Math.abs(Math.sin(c[2] - b[2]))).toBeGreaterThan(0.9)
    expect(Math.hypot(c[0] - d[0], c[1] - d[1])).toBeLessThan(0.3)
    expect(Math.abs(Math.cos(c[2] + Math.PI - d[2]) - 1)).toBeLessThan(0.05)
    // which is a good deal shorter in reverse than backing all the way to the road
    expect(lengthOf(m.swing)).toBeLessThan(lengthOf(m.arrive) * 0.4)
  })

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
