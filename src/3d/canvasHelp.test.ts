import { describe, expect, it } from 'vitest'
import { LEAST_SHARP, MAX_STEP, Meter, Pace, fence, lostCopy, sharpness, stepOf, sweep } from './canvasHelp'

describe('stepOf', () => {
  it('passes an ordinary frame through and cuts a long pause down to one step', () => {
    expect(stepOf(1 / 60)).toBeCloseTo(1 / 60)
    expect(stepOf(3600)).toBe(MAX_STEP)
    expect(stepOf(0.5, 0.25)).toBe(0.25)
  })
  it('gives nothing for a time that is not a time', () => {
    expect(stepOf(0)).toBe(0)
    expect(stepOf(-1)).toBe(0)
    expect(stepOf(Number.NaN)).toBe(0)
    expect(stepOf(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('sweep', () => {
  const run = (hz: number, seconds: number) => {
    const p = { x: 10, y: 7, z: 0 }
    const t = { x: 2, y: 1, z: -3 }
    for (let i = 0; i < hz * seconds; i++) sweep(p, t, 30, 1 / hz)
    return { p, t }
  }
  it('turns as far in a second at 30, 60 and 165 frames a second', () => {
    const [a, b, c] = [run(30, 2), run(60, 2), run(165, 2)]
    for (const r of [b, c]) {
      expect(r.p.x).toBeCloseTo(a.p.x, 6)
      expect(r.p.z).toBeCloseTo(a.p.z, 6)
    }
    // 60 degrees round the target, from due east of it
    const { p, t } = a
    const angle = Math.atan2(p.x - t.x, p.z - t.z) - Math.atan2(8, 3)
    expect(Math.abs((angle * 180) / Math.PI)).toBeCloseTo(60, 4)
  })
  it('keeps its height and its distance', () => {
    const { p, t } = run(60, 30)
    expect(p.y).toBe(7)
    expect(Math.hypot(p.x - t.x, p.z - t.z)).toBeCloseTo(Math.hypot(8, 3), 6)
  })
  it('does not leap after the tab has been away', () => {
    const p = { x: 10, y: 0, z: 0 }
    sweep(p, { x: 0, y: 0, z: 0 }, 30, 3600)
    // one step's worth: three degrees, not a hundred thousand
    expect(Math.abs(Math.atan2(p.z, p.x)) * (180 / Math.PI)).toBeCloseTo(30 * MAX_STEP, 4)
  })
})

describe('fence', () => {
  it('leaves a point inside alone', () => {
    const t = { x: 3, y: 2, z: -4 }
    expect(fence(t, 10, 8)).toBe(false)
    expect(t).toEqual({ x: 3, y: 2, z: -4 })
  })
  it('brings a point back from beyond the edge, from under the ground and from over the top', () => {
    const t = { x: 40, y: -3, z: -11 }
    expect(fence(t, 10, 8)).toBe(true)
    expect(t).toEqual({ x: 10, y: 0, z: -10 })
    const u = { x: 0, y: 30, z: 0 }
    expect(fence(u, 10, 8)).toBe(true)
    expect(u.y).toBe(8)
  })
})

describe('Pace', () => {
  const feed = (pace: Pace, dt: number, n: number) => {
    let slow = false
    for (let i = 0; i < n; i++) slow = pace.frame(dt) || slow
    return slow
  }
  it('says nothing of a computer that keeps up', () => {
    expect(feed(new Pace(), 1 / 60, 2000)).toBe(false)
    // a 50 Hz screen is not a slow computer
    expect(feed(new Pace(), 1 / 50, 2000)).toBe(false)
  })
  it('speaks up once a whole window has run long, and not before', () => {
    const pace = new Pace(0.0215, 120, 45)
    expect(feed(pace, 1 / 30, 45 + 119)).toBe(false)
    expect(pace.frame(1 / 30)).toBe(true)
  })
  it('forgives the stalls of starting up and the pause of a hidden tab', () => {
    const pace = new Pace(0.0215, 120, 45)
    expect(feed(pace, 0.2, 45)).toBe(false)
    expect(feed(pace, 1 / 60, 60)).toBe(false)
    expect(pace.frame(30)).toBe(false)
    expect(feed(pace, 1 / 60, 300)).toBe(false)
  })
})

describe('sharpness', () => {
  it('steps down while frames run long, and never below the least', () => {
    let s = 1
    const seen = []
    for (let i = 0; i < 8; i++) seen.push((s = sharpness(s, 1 / 30)))
    expect(seen[0]).toBe(0.85)
    expect(seen[1]).toBeCloseTo(0.722, 2)
    expect(Math.min(...seen)).toBe(LEAST_SHARP)
  })
  it('holds where it is at an ordinary pace, so the picture does not flicker between two sizes', () => {
    expect(sharpness(0.85, 1 / 60)).toBe(0.85)
    expect(sharpness(1, 1 / 60)).toBe(1)
    expect(sharpness(0.85, 1 / 50)).toBe(0.85)
    expect(sharpness(0.85, 0.0135)).toBe(0.85)
  })
  it('steps back up only with plenty to spare, and never past full', () => {
    expect(sharpness(0.722, 1 / 144)).toBeCloseTo(0.85, 2)
    expect(sharpness(0.85, 1 / 144)).toBe(1)
    expect(sharpness(1, 1 / 144)).toBe(1)
  })
})

describe('Meter', () => {
  it('gives the average of each stretch of frames, leaving out the start and any pause', () => {
    const m = new Meter(4, 1)
    expect(m.frame(1)).toBeNull()
    expect(m.frame(0.2)).toBeNull()
    expect([m.frame(0.01), m.frame(0.02), m.frame(30), m.frame(0.03)]).toEqual([null, null, null, null])
    expect(m.frame(0.04)).toBeCloseTo(0.025, 6)
    expect(m.frame(0.01)).toBeNull()
  })
})

describe('lostCopy', () => {
  it('names the view and says the game goes on', () => {
    const c = lostCopy('campus view')
    expect(c.off).toContain('campus view')
    expect(c.offHelp).toMatch(/still works/)
    expect(c.lost).toMatch(/not affected/)
  })
})
