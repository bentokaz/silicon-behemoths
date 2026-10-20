import { describe, expect, it } from 'vitest'
import { lineStats, partsFactor } from './factoryline'
import { newSite } from './sites'
import type { Site, SiteItem } from './types'

type P = [kind: string, x: number, y: number, extra?: Partial<SiteItem>]
let n = 0
const items = (parts: P[]): SiteItem[] => parts.map(([kind, x, y, extra]) => ({ id: `i${n++}`, kind, x, y, rot: 0, ...extra }))
function floor(parts: P[], tier = 2): Site {
  const site = newSite('factory', tier)
  site.items = items(parts)
  return site
}
const T3: Partial<SiteItem> = { tier: 3, mods: ['speed'] }

/** One heavy line, 28 tiles long and 2 deep, flowing east from (x, y). */
const bigLine = (x: number, y: number, belt = 'conveyor_3'): P[] => [
  ['dock_in', x, y + 1, { tier: 3 }],
  [belt, x + 2, y + 1],
  ['smt', x + 3, y + 1, T3],
  ['smt', x + 6, y + 1, T3],
  ['smt', x + 9, y + 1, T3],
  ['robot', x + 12, y, T3],
  ['robot', x + 14, y, T3],
  ['robot', x + 16, y, T3],
  ['robot', x + 18, y, T3],
  ['test', x + 20, y + 1, { tier: 3 }],
  ['pack', x + 21, y + 1, T3],
  ['pack', x + 23, y + 1, T3],
  ['pack', x + 25, y + 1, T3],
  ['dock_out', x + 27, y + 1],
]

describe('a deeper factory', () => {
  it('is held back by a slow belt, and runs faster on an express one', () => {
    const slow = lineStats(floor(bigLine(1, 4, 'conveyor')))
    expect(slow.running).toBe(true)
    expect(slow.lines[0].limit?.kind).toBe('belt')
    expect(slow.lines[0].logistics).toBe(2400)
    const fast = lineStats(floor(bigLine(1, 4)))
    expect(fast.lines[0].logistics).toBeGreaterThan(slow.lines[0].logistics * 5)
    expect(fast.throughput).toBeGreaterThan(slow.throughput * 3)
  })

  it('feeds machines side by side from a splitter', () => {
    // dock, splitter, then two assembly benches fed from its sides would need a turn: two rows of robots fed ahead and below
    const site = floor([
      ['dock_in', 0, 5],
      ['smt', 2, 5],
      ['splitter', 5, 5],
      ['robot', 6, 5],
      ['conveyor', 5, 6, { rot: 1 }],
      ['conveyor', 5, 7, { rot: 0 }],
      ['robot', 6, 7],
      ['conveyor', 8, 5, { rot: 1 }],
      ['conveyor', 8, 6, { rot: 1 }],
      ['conveyor', 8, 7, { rot: 1 }],
      ['conveyor', 8, 8, { rot: 0 }],
      ['pack', 9, 8],
      ['dock_out', 11, 8],
    ])
    const s = lineStats(site)
    expect(s.running).toBe(true)
    expect(s.caps.assembly).toBe(1000)
  })

  it('works harder on more shifts, and slows when the power runs short', () => {
    const site = floor(bigLine(1, 4))
    const one = lineStats(site).throughput
    site.shifts = 3
    site.rev++
    const three = lineStats(site)
    expect(three.plant.power).toBeLessThan(1)
    // the grid connection alone cannot run it: a substation can
    site.items.push(...items([['substation', 40, 1], ['substation', 43, 1]]))
    site.rev++
    const powered = lineStats(site)
    expect(powered.plant.power).toBe(1)
    expect(powered.throughput).toBeGreaterThan(one * 2.2)
    expect(powered.plant.wages).toBeGreaterThan(lineStats(floor(bigLine(1, 4))).plant.wages * 2.5)
  })

  it('makes devices cheaper when it makes their parts itself', () => {
    const none = partsFactor('phone', { chip: 0, display: 0, cell: 0, casing: 0, camera: 0, psu: 0 }, 1000, 1)
    const all = partsFactor('phone', { chip: 1000, display: 1000, cell: 1000, casing: 1000, camera: 1000, psu: 0 }, 1000, 1)
    expect(none.factor).toBeGreaterThan(1.1)
    expect(all.factor).toBeLessThan(0.95)
    // a tower needs no display: making displays does nothing for it
    expect(partsFactor('tower', { chip: 0, display: 5000, cell: 0, casing: 0, camera: 0, psu: 0 }, 1000, 1).factor).toBeCloseTo(partsFactor('tower', { chip: 0, display: 0, cell: 0, casing: 0, camera: 0, psu: 0 }, 1000, 1).factor)
  })

  it('reaches millions of devices a month with a well-built late-game plant, at a sensible cost', () => {
    const lines: P[] = []
    for (let k = 0; k < 4; k++) lines.push(...bigLine(1, 2 + k * 4))
    const site = floor(lines, 4)
    site.shifts = 3
    // power, crew rooms and servicing for four heavy lines
    for (let k = 0; k < 4; k++) site.items.push(...items([['substation', 34, 2 + k * 3], ['workshop', 40, 2 + k * 2], ['workshop', 43, 2 + k * 2]]))
    for (let k = 0; k < 12; k++) site.items.push(...items([['lockers', 50 + (k % 4) * 2, 2 + Math.floor(k / 4)]]))
    site.rev++
    const s = lineStats(site)
    expect(s.lines.filter((l) => l.running)).toHaveLength(4)
    expect(s.plant.power).toBe(1)
    expect(s.plant.crewEff).toBe(1)
    expect(s.plant.uptime).toBeGreaterThan(0.95)
    const month = s.throughput * 30
    expect(month).toBeGreaterThan(2e6)
    // under five dollars a device to run, wages and power included
    expect(s.runCost / s.throughput).toBeLessThan(5)
    expect(s.defectRate).toBeLessThan(0.03)
  })
})
