import { describe, expect, it } from 'vitest'
import { RUN_MIN, defaultRun, priceWords, runNote, tidyDown, tidyUp } from './DesignerRun'

describe('tidy figures', () => {
  it('rounds down to a figure a person would order', () => {
    expect(tidyDown(10000)).toBe(10000)
    expect(tidyDown(9999)).toBe(8000)
    expect(tidyDown(7300)).toBe(6000)
    expect(tidyDown(3000)).toBe(3000)
    expect(tidyDown(2600)).toBe(2500)
    expect(tidyDown(1499)).toBe(1000)
    expect(tidyDown(1500)).toBe(1500)
    expect(tidyDown(123456)).toBe(100000)
    expect(tidyDown(0.4)).toBe(0)
    expect(tidyDown(NaN)).toBe(0)
  })
  it('rounds up the same way', () => {
    expect(tidyUp(6000)).toBe(6000)
    expect(tidyUp(6100)).toBe(8000)
    expect(tidyUp(8100)).toBe(10000)
    expect(tidyUp(1001)).toBe(1500)
    expect(tidyUp(0)).toBe(1)
  })
})

describe('the first run the plan proposes', () => {
  it('is a tidy figure inside the estimate when the company can afford it', () => {
    const run = defaultRun({ low: 6000, high: 14000 }, 274, 5.4e6)
    expect(run).toBe(8000)
    expect(run).toBeGreaterThanOrEqual(6000)
    expect(run).toBeLessThanOrEqual(14000)
  })
  it('never costs more than half of the spare cash', () => {
    for (const spare of [50e3, 400e3, 1e6, 3e6, 6e6, 40e6]) {
      for (const unit of [40, 274, 900, 2400]) {
        const run = defaultRun({ low: 6000, high: 14000 }, unit, spare)
        if (run > RUN_MIN) expect(run * unit).toBeLessThanOrEqual(spare * 0.5 + 1e-6)
      }
    }
  })
  it('stays inside the range for every estimate it can afford', () => {
    for (const low of [120, 600, 950, 2400, 6000, 31000, 260000, 1.9e6]) {
      const est = { low, high: low * 2.5 }
      const run = defaultRun(est, 100, Infinity)
      expect(run).toBeGreaterThanOrEqual(est.low)
      expect(run).toBeLessThanOrEqual(est.high)
    }
  })
  it('goes below the range, to what can be paid for, when the low end is out of reach', () => {
    // $400K spare, half of it is $200K, which pays for 729 units at $274
    expect(defaultRun({ low: 6000, high: 14000 }, 274, 400e3)).toBe(600)
  })
  it('keeps to the range when rounding down would leave it', () => {
    // the middle is 1,050 and the tidy figure under it, 1,000, is inside the range
    expect(defaultRun({ low: 900, high: 1200 }, 10, Infinity)).toBe(1000)
    // the middle is 975 and the tidy figure under it is 800, below the range: 1,000 is inside it
    expect(defaultRun({ low: 950, high: 1000 }, 10, Infinity)).toBe(1000)
    // nothing tidy fits between 910 and 990: the middle itself
    expect(defaultRun({ low: 910, high: 990 }, 10, Infinity)).toBe(950)
  })
  it('never proposes nothing', () => {
    expect(defaultRun({ low: 0, high: 0 }, 274, 5e6)).toBe(RUN_MIN)
    expect(defaultRun({ low: 6000, high: 14000 }, 274, 0)).toBe(RUN_MIN)
    expect(defaultRun({ low: 6000, high: 14000 }, 274, -2e6)).toBe(RUN_MIN)
  })
  it('does not count money when money is not counted', () => {
    expect(defaultRun({ low: 6000, high: 14000 }, 274, Infinity)).toBe(10000)
  })
})

describe('what the plan says about a run', () => {
  const est = { low: 6000, high: 14000 }
  it('says nothing about a run inside the range that the company can afford', () => {
    expect(runNote(8000, est, 274, 6e6)).toBeNull()
    expect(runNote(14000, est, 100, 6e6)).toBeNull()
    expect(runNote(0, est, 274, 6e6)).toBeNull()
  })
  it('warns when the run takes more than half of the cash, before anything else', () => {
    expect(runNote(12000, est, 274, 6e6)).toEqual({ kind: 'cash', tone: 'warn' })
    expect(runNote(40000, est, 274, 6e6)?.kind).toBe('cash')
  })
  it('warns when the run is far above the high end', () => {
    expect(runNote(21001, est, 10, 6e6)).toEqual({ kind: 'above', tone: 'warn' })
    expect(runNote(21000, est, 10, 6e6)).toBeNull()
  })
  it('notes, without alarm, a run that will probably sell out', () => {
    expect(runNote(2000, est, 274, 6e6)).toEqual({ kind: 'below', tone: 'dim' })
  })
  it('does not warn about cash when money is not counted', () => {
    expect(runNote(12000, est, 274, Infinity)).toBeNull()
  })
  it('the proposed run is never warned about', () => {
    for (const spare of [300e3, 1e6, 5.4e6, 80e6]) {
      const run = defaultRun(est, 274, spare)
      const note = runNote(run, est, 274, spare + 545e3)
      expect(note === null || note.kind === 'below').toBe(true)
    }
  })
})

describe('a price against the typical one', () => {
  it('is put in words', () => {
    expect(priceWords(450, 900)).toBe('about half of that')
    expect(priceWords(300, 900)).toBe('less than half of that')
    expect(priceWords(650, 900)).toBe('well under that')
    expect(priceWords(820, 900)).toBe('a little under that')
    expect(priceWords(900, 900)).toBe('about the same')
    expect(priceWords(1000, 900)).toBe('a little over that')
    expect(priceWords(1400, 900)).toBe('well over that')
    expect(priceWords(1800, 900)).toBe('about double that')
    expect(priceWords(2500, 900)).toBe('more than double that')
    expect(priceWords(0, 900)).toBe('')
    expect(priceWords(450, 0)).toBe('')
  })
})
