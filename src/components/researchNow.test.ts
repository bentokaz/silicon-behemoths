import { describe, expect, it } from 'vitest'
import { defaultConfig, newGame, researchItem, tick, toggleResearch } from '../sim/game'
import { researchBudgetFor, researchDays, runningResearch } from './researchNow'

const start = () => newGame({ ...defaultConfig(), startCash: 500e6 })

describe('running research', () => {
  it('is empty when nothing is being researched', () => {
    expect(runningResearch(start())).toEqual([])
  })

  it('has no finishing day while there is no budget', () => {
    const s = start()
    expect(toggleResearch(s, 'display')).toBeNull()
    const [p] = runningResearch(s)
    expect(p.id).toBe('display')
    expect(p.progress).toBe(0)
    expect(p.daysLeft).toBeNull()
    expect(p.name).toContain('Display level')
  })

  it('finishes on the day it says, as the simulation counts it', () => {
    let s = start()
    toggleResearch(s, 'display')
    s.rdBudget = 400e3
    const level = s.levels.display
    const said = runningResearch(s)[0].daysLeft!
    expect(said).toBeGreaterThan(1)
    let days = 0
    while (s.levels.display === level && days < said + 50) {
      s = tick(s, 1)
      days++
    }
    expect(days).toBe(said)
  })

  it('splits the budget between projects', () => {
    const s = start()
    toggleResearch(s, 'display')
    s.rdBudget = 400e3
    const alone = runningResearch(s)[0].daysLeft!
    toggleResearch(s, 'battery')
    const shared = runningResearch(s)
    expect(shared).toHaveLength(2)
    expect(shared[0].daysLeft!).toBeGreaterThanOrEqual(alone * 2 - 1)
    // and says what one more project would do, before it is started
    expect(researchDays(s, 'display', s.rdBudget, 3)!).toBeGreaterThan(shared[0].daysLeft!)
  })

  it('reports progress as a share of the cost', () => {
    const s = start()
    toggleResearch(s, 'display')
    s.progress.display = researchItem(s, 'display').cost / 4
    expect(runningResearch(s)[0].progress).toBeCloseTo(0.25)
  })

  it('finds the budget that finishes a project in a given time', () => {
    const s = start()
    toggleResearch(s, 'display')
    const budget = researchBudgetFor(s, 'display', 360)
    expect(researchDays(s, 'display', budget)).toBe(360)
  })
})
