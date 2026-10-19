import { describe, expect, it } from 'vitest'
import { fixLayout, lineStats, planFix } from './factoryline'
import { newSite } from './sites'
import type { Site } from './types'

type P = [kind: string, x: number, y: number, rot?: number]
function floor(parts: P[]): Site {
  const site = newSite('factory', 1)
  site.items = parts.map(([kind, x, y, rot = 0], i) => ({ id: `i${i}`, kind, x, y, rot }))
  return site
}
// in dock (2) belt smt (3) belt robot (2x2) test pack (2) out dock (2), all flowing east
const STRAIGHT: P[] = [
  ['dock_in', 1, 5],
  ['conveyor', 3, 5],
  ['smt', 4, 5],
  ['conveyor', 7, 5],
  ['robot', 8, 4],
  ['test', 10, 5],
  ['pack', 11, 5],
  ['dock_out', 13, 5],
]

describe('factory lines as a graph', () => {
  it('runs a line whose outputs meet the next inputs', () => {
    const s = lineStats(floor(STRAIGHT))
    expect(s.running).toBe(true)
    expect(s.throughput).toBe(500)
    expect(s.lines).toHaveLength(1)
    expect(s.lines[0].bottleneck).toBe('assembly')
    expect(s.joints.every((j) => j.ok)).toBe(true)
    expect(s.live.size).toBe(8)
  })

  it('blocks a joint where an output meets a side or another output', () => {
    const parts = STRAIGHT.map((p) => (p[0] === 'smt' ? (['smt', 4, 5, 2] as P) : p))
    const s = lineStats(floor(parts))
    expect(s.running).toBe(false)
    expect(s.problem).toMatch(/^Logistics blocked/)
    const bad = s.joints.filter((j) => !j.ok)
    expect(bad.length).toBeGreaterThan(0)
    expect(bad[0].why).toMatch(/output to output/)
  })

  it('passes parts through machines of one kind in a row and adds up their capacity', () => {
    // three board lines back to back feed a pair of robots side by side through one belt each
    const s = lineStats(
      floor([
        ['dock_in', 0, 5],
        ['smt', 2, 5],
        ['smt', 5, 5],
        ['smt', 8, 5],
        ['robot', 11, 4],
        ['robot', 13, 4],
        ['pack', 15, 5],
        ['pack', 17, 5],
        ['dock_out', 19, 5],
      ]),
    )
    expect(s.running).toBe(true)
    expect(s.caps.smt).toBe(2100)
    expect(s.caps.assembly).toBe(1000)
    expect(s.throughput).toBe(1000)
    expect(s.lines[0].bottleneck).toBe('assembly')
  })

  it('wants the stages in order', () => {
    const s = lineStats(
      floor([
        ['dock_in', 0, 5],
        ['pack', 2, 5],
        ['smt', 4, 5],
        ['manual', 7, 5],
        ['dock_out', 8, 5],
      ]),
    )
    expect(s.running).toBe(false)
    expect(s.problem).toMatch(/comes after packaging/)
  })

  it('says where parts stop', () => {
    const s = lineStats(floor(STRAIGHT.slice(0, 5)))
    expect(s.running).toBe(false)
    expect(s.problem).toMatch(/robotic assembly cell: its output leads nowhere/)
    expect(s.linked.size).toBe(5)
  })

  it('turns an old layout around so it runs', () => {
    // laid before faces mattered: the belts and some machines point the wrong way
    const site = floor(STRAIGHT.map((p, i) => (i % 2 ? ([p[0], p[1], p[2], p[0] === 'robot' ? 1 : 2] as P) : p)))
    expect(lineStats(site).running).toBe(false)
    expect(planFix(site)).not.toBeNull()
    expect(fixLayout(site)).toBeGreaterThan(0)
    expect(lineStats(site).running).toBe(true)
    expect(planFix(site)).toBeNull()
  })

  it('keeps separate lines apart and adds their output', () => {
    const second = STRAIGHT.map(([k, x, y, r]) => [k, x, y + 4, r] as P)
    const s = lineStats(floor([...STRAIGHT, ...second]))
    expect(s.lines).toHaveLength(2)
    expect(s.throughput).toBe(1000)
  })
})
