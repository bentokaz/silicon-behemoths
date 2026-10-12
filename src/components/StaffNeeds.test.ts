import { beforeEach, describe, expect, it } from 'vitest'
import { UNHAPPY, bestHighlight, emptySeats, highlightCounts, picks, stillUseful, useHighlight } from '../store/highlight'
import { type Facts, QUIT_AFTER, daysToQuit, defaultFilter, needCounts, needOf, needsYou, statusRank } from './StaffNeeds'

const person = (id: string, over: Partial<{ ask: number; lowDays: number; traits: string[]; trainingUntil: number }> = {}) => ({ id, lowDays: 0, traits: [] as string[], ...over })
const facts = (seated: string[], led: string[] | null = null): Facts => ({ seated: new Set(seated), led: led && new Set(led) })

describe('who needs the player', () => {
  it('is nobody when everyone has a desk and nothing is asked', () => {
    const f = facts(['a', 'b'])
    expect(needOf(person('a'), f)).toBeNull()
    expect(needsYou(person('b'), f)).toBe(false)
    expect(needCounts([person('a'), person('b')], f).total).toBe(0)
  })

  it('puts a raise request before everything else', () => {
    expect(needOf(person('a', { ask: 5000, lowDays: 30 }), facts([]))).toBe('raise')
  })

  it('counts someone on the way out, but never a loyal one', () => {
    const f = facts(['a', 'b'])
    expect(needOf(person('a', { lowDays: 3 }), f)).toBe('leaving')
    expect(needOf(person('b', { lowDays: 3, traits: ['loyal'] }), f)).toBeNull()
  })

  it('says how many days are left before they quit', () => {
    expect(daysToQuit(person('a'))).toBeNull()
    expect(daysToQuit(person('a', { lowDays: 1 }))).toBe(QUIT_AFTER)
    expect(daysToQuit(person('a', { lowDays: QUIT_AFTER }))).toBe(1)
    // never nought or less, even on the very day
    expect(daysToQuit(person('a', { lowDays: QUIT_AFTER + 5 }))).toBe(1)
  })

  it('counts a person with no desk', () => {
    expect(needOf(person('a'), facts(['b']))).toBe('desk')
  })

  it('counts a person with no lead only once leads matter', () => {
    expect(needOf(person('a'), facts(['a'], null))).toBeNull()
    expect(needOf(person('a'), facts(['a'], ['b']))).toBe('lead')
    expect(needOf(person('a'), facts(['a'], ['a']))).toBeNull()
  })

  it('counts each person once, under their most pressing reason', () => {
    const staff = [person('a', { ask: 1 }), person('b', { lowDays: 2 }), person('c'), person('d'), person('e')]
    const c = needCounts(staff, facts(['a', 'b', 'd', 'e'], ['a', 'b', 'c', 'e']))
    expect(c).toEqual({ raise: 1, leaving: 1, desk: 1, lead: 1, total: 4 })
  })

  it('orders the status column: needs first, then courses, then nothing', () => {
    const f = facts(['a', 'b', 'c', 'e'], ['a', 'b', 'c', 'd'])
    const day = 100
    const ranks = [person('a', { ask: 1 }), person('b', { lowDays: 1 }), person('d'), person('e'), person('c', { trainingUntil: 130 }), person('c', { trainingUntil: 90 }), person('c')].map((e) => statusRank(e, f, day))
    expect(ranks).toEqual([0, 1, 2, 3, 4, null, null])
  })

  it('opens the page on the people who need the player whenever there are any', () => {
    expect(defaultFilter(0)).toBe('all')
    expect(defaultFilter(1)).toBe('needs')
    expect(defaultFilter(40)).toBe('needs')
  })
})

describe('the campus highlight', () => {
  beforeEach(() => useHighlight.getState().set(null))

  it('holds one highlight at a time, and a second click on it turns it off', () => {
    const s = () => useHighlight.getState()
    expect(s().on).toBeNull()
    s().toggle('raise')
    expect(s().on).toBe('raise')
    s().toggle('unhappy')
    expect(s().on).toBe('unhappy')
    s().toggle('unhappy')
    expect(s().on).toBeNull()
    s().set('desks')
    expect(s().on).toBe('desks')
  })

  it('picks out the right people', () => {
    const asking = { ask: 4000, morale: 70 }
    const glum = { morale: UNHAPPY - 1 }
    const fine = { ask: false, morale: UNHAPPY }
    expect(picks('raise', asking)).toBe(true)
    expect(picks('raise', glum)).toBe(false)
    expect(picks('unhappy', glum)).toBe(true)
    expect(picks('unhappy', fine)).toBe(false)
    expect(picks('unhappy', asking)).toBe(false)
    expect(picks('desks', asking)).toBe(false)
    expect(picks(null, asking)).toBe(false)
  })

  it('counts what each highlight would mark', () => {
    const staff = [{ ask: 4000, morale: 70 }, { morale: 10 }, { morale: 34.9 }, { morale: 80 }]
    expect(highlightCounts(staff, 10)).toEqual({ raise: 1, unhappy: 2, desks: 6 })
    // more people than desks: no desk is empty
    expect(highlightCounts(staff, 2).desks).toBe(0)
    expect(highlightCounts([], 2)).toEqual({ raise: 0, unhappy: 0, desks: 2 })
  })

  it('chooses the most pressing highlight that marks anything', () => {
    expect(bestHighlight({ raise: 2, unhappy: 5, desks: 9 })).toBe('raise')
    expect(bestHighlight({ raise: 0, unhappy: 5, desks: 9 })).toBe('unhappy')
    expect(bestHighlight({ raise: 0, unhappy: 0, desks: 9 })).toBe('desks')
    expect(bestHighlight({ raise: 0, unhappy: 0, desks: 0 })).toBeNull()
  })

  it('lets go of a highlight that marks nothing any more', () => {
    expect(stillUseful('raise', { raise: 1, unhappy: 0, desks: 0 })).toBe('raise')
    expect(stillUseful('raise', { raise: 0, unhappy: 3, desks: 0 })).toBeNull()
    expect(stillUseful(null, { raise: 1, unhappy: 1, desks: 1 })).toBeNull()
  })

  it('finds the seats nobody owns', () => {
    const [a, b, c] = [{ k: 'a' }, { k: 'b' }, { k: 'c' }]
    expect(emptySeats([a, b, c], [b, null, undefined])).toEqual([a, c])
    expect(emptySeats([a, b], [a, b, a])).toEqual([])
    expect(emptySeats([], [a])).toEqual([])
  })
})
