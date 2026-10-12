// Progression: what a guided company starts with, the order its capabilities
// open in when it is played sensibly, and that an open game has no locks.
import { describe, expect, it } from 'vitest'
import { marketLevel } from '../data/catalog'
import { segmentInfo, segmentsOf } from '../data/devices'
import {
  DIFFICULTY,
  SAVE_VERSION,
  autoTeams,
  buildFactory,
  buildVenue,
  decide,
  defaultConfig,
  enterRegion,
  fire,
  fundingRound,
  hire,
  hireExec,
  lockSupply,
  migrate,
  newGame,
  openStore,
  orderProduction,
  placeItem,
  player,
  recallProduct,
  scheduleEvent,
  setCare,
  setPolicy,
  startCampaign,
  startChip,
  startOs,
  startProduct,
  starterDesign,
  tick,
  toggleResearch,
  train,
  unlockType,
  zoneRoom,
} from './game'
import { GOALS, nextGoals } from './goals'
import { bestSegment } from './market'
import { pendingUnits } from './ops'
import { CAPS, type CapId, capOfTab, execAvailable, frontier, has, isNear, lockTip, locked, nearTabs, needText, nextCaps, openEverything, ratioOf, reqsOf, stepProgress, vacantSeats } from './progress'
import { evaluate } from './scoring'
import { EXECS, execFx, execOf, marketPay, salaryFor, staffEffects } from './staff'
import { type Difficulty, EXEC_IDS, type ExecId, type GameState, ROLES, type Role, monthCosts } from './types'

const guidedGame = (difficulty: Difficulty = 'normal', seed = 11) => newGame({ ...defaultConfig(), difficulty, startCash: DIFFICULTY[difficulty].startCash, seed, startType: 'phone', progression: 'guided' })
const openGame = (seed = 11) => newGame({ ...defaultConfig(), seed, startType: 'phone' })
const TABS = ['city', 'dashboard', 'products', 'research', 'labs', 'factory', 'stores', 'venue', 'marketing', 'care', 'staff', 'office', 'market', 'world', 'rivals', 'finance', 'shares', 'goals', 'system']

/** Hire the best value applicant of a role, adding a desk for them if the office is full. */
function take(s: GameState, role: Role): string | null {
  const pick = s.candidates.filter((e) => e.role === role).sort((a, b) => b.skill / b.salary - a.skill / a.salary)[0]
  if (!pick) return `no ${role} applying`
  seat(s)
  return hire(s, pick.id)
}
/** Make sure there is a free desk. */
function seat(s: GameState) {
  if (staffEffects(s).seats > s.staff.length) return
  const spot = [[4, 4], [6, 4], [8, 3], [8, 4], [4, 5], [6, 5], [8, 5], [9, 5], [5, 3], [7, 3], [5, 5], [7, 5], [9, 3], [9, 4], [3, 3], [3, 4], [3, 5]].find(([x, y]) => !placeItem(s, 'office', 'desk', x, y, 0))
  if (!spot) zoneRoom(s, 'office', 'work', 0, 0, 13, 1)
}

/** Design the stock device at the price that suits its best market, and start building it. */
function launch(s: GameState, n: number): string | null {
  const design = starterDesign(s, 'phone')
  const ev = evaluate(design, s.levels, marketLevel(s.day), s.features, s.chips)
  const probe = { raw: ev.raw, featureBonus: ev.featureBonus, price: 0, type: 'phone' as const }
  let best = { price: Math.round(ev.unitCost * 2), score: -1, seg: segmentsOf('phone')[0].id }
  for (const seg of segmentsOf('phone')) {
    for (const m of [1.6, 1.8, 2.0, 2.3, 2.7, 3.2]) {
      const price = Math.round((ev.unitCost * m) / 0.85)
      const u = bestSegment({ ...probe, price }, player(s), s.day)
      const score = Math.pow(u.u, 3.5) * (m - 1) * seg.size
      if (u.seg.id === seg.id && score > best.score) best = { price, score, seg: seg.id }
    }
  }
  const pace = Math.max(0, ...s.products.filter((p) => p.companyId === 'player').map((p) => Math.max(0, ...p.history.slice(-4))))
  const want = Math.max(4000, Math.min(400000, pace ? Math.round(pace * 3) : Math.round(segmentInfo(best.seg).size * 0.004 * Math.max(0.05, player(s).awareness * 3))))
  const quantity = Math.max(4000, Math.min(want, Math.floor((s.cash * 0.45) / (ev.unitCost * 1.1))))
  return startProduct(s, { design, family: `Model ${n}`, variant: '', price: best.price, tiers: [], quantity, mode: 'contract', marketing: Math.min(400e3, Math.max(50e3, s.cash * 0.05)) })
}

/**
 * A sensible player in a guided game: two hires and a device on the first day,
 * research straight away, a marketer and a campaign once the device is out,
 * then each executive as soon as one will come and the company can carry them.
 */
function play(difficulty: Difficulty, years: number, seed = 11): GameState {
  const s = guidedGame(difficulty, seed)
  expect(take(s, 'engineer')).toBeNull()
  expect(take(s, 'researcher')).toBeNull()
  expect(launch(s, 1)).toBeNull()
  s.rdBudget = 80e3
  expect(toggleResearch(s, 'chipset')).toBeNull()
  let n = 2
  for (let m = 0; m < years * 12 && !s.gameOver; m++) {
    tick(s, 30)
    for (const i of s.incidents) if (!i.done) decide(s, i.id, 1)
    const mine = s.products.filter((p) => p.companyId === 'player')
    const last = s.reports[s.reports.length - 1]
    const profit = last.revenue + last.other - monthCosts(last)
    for (const p of mine.filter((x) => x.status === 'sale')) {
      const pace = Math.max(...p.history.slice(-3), 0)
      if (p.stock + pendingUnits(s, p.id) < pace * 1.2 && s.day - p.launchDay < 420) {
        const qty = Math.min(Math.round(pace * 2) + 1000, Math.floor((Math.max(0, s.cash) * 0.5) / (p.unitCost * 1.1)))
        if (qty > 500) orderProduction(s, p.id, qty, 'contract')
      }
    }
    if (m > 0 && m % 12 === 0 && s.cash > 0.7e6) launch(s, n++)
    s.rdBudget = Math.max(40e3, Math.min(3e6, last.revenue * 0.05))
    if (!s.activeResearch.length) for (const t of ['chipset', 'display', 'camera', 'battery'] as const) toggleResearch(s, t)
    const out = mine.some((p) => p.status === 'sale')
    // the first people a young company wants once it has something to sell
    if (out && !has(s, 'marketing')) take(s, 'marketer')
    if (out && has(s, 'marketing') && !s.campaigns.length && s.cash > 300e3) startCampaign(s, 'online', 'brand', 60e3)
    if (s.campaigns[0]) s.campaigns[0].monthly = Math.min(3e6, Math.max(60e3, profit * 0.25))
    if (s.owners > 3000 && !has(s, 'care')) take(s, 'support')
    if (out && !has(s, 'studio')) take(s, 'designer')
    // an executive whenever one will come and a year of their pay is small change
    for (const id of EXEC_IDS) {
      const c = s.execPool.filter((e) => e.exec === id).sort((a, b) => b.skill / b.salary - a.skill / a.salary)[0]
      if (c && s.cash > c.salary * 30) (seat(s), hireExec(s, c.id))
    }
    if (profit > 60e3 && s.staff.length < 40 && s.cash > 1e6) {
      seat(s)
      if (s.candidates[0]) hire(s, s.candidates.sort((a, b) => b.skill / b.salary - a.skill / a.salary)[0].id)
    }
  }
  return s
}

describe('a guided company starts small', () => {
  it('has only the garage screens, and says what the others need', () => {
    const s = guidedGame()
    expect(Object.keys(s.unlocks)).toEqual([])
    const open = TABS.filter((t) => !capOfTab(t) || has(s, capOfTab(t)!))
    expect(open.sort()).toEqual(['city', 'dashboard', 'goals', 'office', 'products', 'staff', 'system'])
    for (const c of CAPS) {
      expect(has(s, c.id)).toBe(false)
      expect(locked(s, c.id)).toContain(c.name)
      expect(needText(s, c.id).length).toBeGreaterThan(5)
      expect(reqsOf(s, c.id).length).toBeGreaterThan(0)
      expect(ratioOf(s, c.id)).toBeLessThan(1)
    }
    // only the first steps are shown as next; the rest wait out of sight
    expect(frontier(s)).toBe(1)
    expect(CAPS.filter((c) => isNear(s, c.id)).map((c) => c.id)).toEqual(['research', 'market', 'studio', 'marketing'])
    // and the navigation shows no more than three locked screens, however many there are
    expect(nearTabs(s)).toEqual(['research', 'market', 'marketing'])
    expect(s.execPool).toEqual([])
  })

  it('says on a locked control everything that still has to happen, and nothing once it is open', () => {
    const s = guidedGame()
    // either of two things opens the design studio
    expect(lockTip(s, 'studio')).toBe('Design studio is not open yet. To open it: hire a designer, or put your first device on sale.')
    // care policies need all three, in order
    expect(lockTip(s, 'carePolicy')).toBe('Care policies is not open yet. To open it: open After-sales, then reach 100,000 owners, then hire a Head of Support.')
    for (const c of CAPS) {
      const tip = lockTip(s, c.id)!
      expect(tip.startsWith(`${c.name} is not open yet.`)).toBe(true)
      // every unmet requirement is named, not only the next one
      for (const r of reqsOf(s, c.id).filter((x) => !x.done)) expect(tip.toLowerCase()).toContain(r.label.toLowerCase())
    }
    // a step that is done drops out of the sentence
    expect(take(s, 'support')).toBeNull()
    stepProgress(s)
    expect(has(s, 'care')).toBe(true)
    expect(lockTip(s, 'care')).toBeNull()
    expect(lockTip(s, 'carePolicy')).toBe('Care policies is not open yet. To open it: reach 100,000 owners, then hire a Head of Support.')
    const open = openGame()
    for (const c of CAPS) expect(lockTip(open, c.id)).toBeNull()
  })

  it('refuses the levers of what is locked, with a reason, and leaves the first device alone', () => {
    const s = guidedGame()
    const no = (err: string | null, name: string) => (expect(err).toBeTruthy(), expect(err).toContain(name))
    no(toggleResearch(s, 'chipset'), 'Research')
    no(unlockType(s, 'tablet'), 'Research')
    no(startCampaign(s, 'online', 'brand', 50e3), 'Marketing')
    no(scheduleEvent(s, 'expo', 0), 'Events')
    no(buildFactory(s), 'Factory')
    no(lockSupply(s, 'semis'), 'Factory')
    no(buildVenue(s), 'Venue')
    no(openStore(s, 0), 'Stores')
    no(enterRegion(s, 'eu'), 'Regions')
    no(fundingRound(s, 0.1), 'Shares')
    no(startChip(s, 'A1', 0.6, 0.6, 0.6), 'Labs')
    no(startOs(s, 'OS', []), 'Labs')
    no(setCare(s, { warrantyYears: 2 }), 'Care policies')
    no(setPolicy(s, { perks: 2 }), 'People policies')
    no(autoTeams(s), 'Teams')
    no(zoneRoom(s, 'office', 'gym', 0, 0, 2, 1), 'Fitness room')
    no(zoneRoom(s, 'office', 'exec', 0, 0, 2, 1), 'Executive suite')
    expect(s.cash).toBe(DIFFICULTY.normal.startCash)
    // a launch keynote belongs to Events; without one the first device goes ahead as ever
    const design = starterDesign(s)
    no(startProduct(s, { design, family: 'One', variant: '', price: 399, tiers: [], quantity: 5000, mode: 'contract', marketing: 50e3, keynote: 0 }), 'Events')
    expect(startProduct(s, { design, family: 'One', variant: '', price: 399, tiers: [], quantity: 5000, mode: 'contract', marketing: 50e3 })).toBeNull()
    // the starter rooms are there to build a pleasant small office
    for (const type of ['work', 'lobby', 'meeting', 'lounge', 'lab', 'eng', 'soft']) expect(zoneRoom(s, 'office', type, 0, 0, 1, 0)?.includes('first.') ?? false).toBe(false)
  })

  it('always has someone of every job applying', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = guidedGame('normal', seed)
      for (let m = 0; m < 6; m++) {
        for (const role of ROLES) expect(s.candidates.some((e) => e.role === role)).toBe(true)
        tick(s, 30)
      }
    }
  })

  it('opens Research by either road, the moment it is earned', () => {
    const a = guidedGame()
    expect(take(a, 'researcher')).toBeNull()
    expect(a.unlocks.research).toBe(0)
    expect(a.news[0].kind).toBe('unlock')
    expect(toggleResearch(a, 'chipset')).toBeNull()
    const b = guidedGame()
    expect(zoneRoom(b, 'office', 'lab', 0, 0, 3, 1)).toBeNull()
    expect(stepProgress(b)).toEqual(['research'])
    expect(stepProgress(b)).toEqual([])
  })

  // The card on a lab bench starts research. It cannot be reached while Research is locked,
  // because a bench only stands in a research lab and a lab opens Research the moment it is built.
  it('cannot have a lab bench, or a lab screen, while Research is locked', () => {
    const s = guidedGame()
    const benches = () => s.office.items.filter((i) => i.kind === 'bench').length
    expect(s.office.rooms.some((r) => r.type === 'lab')).toBe(false)
    expect(benches()).toBe(0)
    // nowhere on the starting plot takes a bench
    for (let y = 0; y < s.office.h; y++) for (let x = 0; x < s.office.w; x++) for (let rot = 0; rot < 4; rot++) expect(placeItem(s, 'office', 'bench', x, y, rot)).toBeTruthy()
    expect(benches()).toBe(0)
    expect(s.cash).toBe(DIFFICULTY.normal.startCash)
    expect(has(s, 'research')).toBe(false)
    // the lab comes first, and the look the store takes after every action opens Research with it
    expect(zoneRoom(s, 'office', 'lab', 0, 0, 3, 1)).toBeNull()
    stepProgress(s)
    expect(has(s, 'research')).toBe(true)
    const spot = [0, 1, 2].find((x) => !placeItem(s, 'office', 'bench', x, 0, 0))
    expect(spot).toBeDefined()
    expect(benches()).toBe(1)
    // The one way round it is a save edited by hand: a lab and a bench, and the record of what is open emptied.
    // A save of today's version is loaded as it is, so Research stays locked until the first action or the
    // first day that passes, and for that long the bench can be clicked. The card shows the lock for that case.
    const save = migrate({ ...(JSON.parse(JSON.stringify(s)) as GameState), unlocks: {} })
    expect(save.office.items.some((i) => i.kind === 'bench')).toBe(true)
    expect(has(save, 'research')).toBe(false)
    expect(toggleResearch(save, 'chipset')).toContain('Research')
    stepProgress(save)
    expect(has(save, 'research')).toBe(true)
    // and once open it stays open, with the lab or without it
    s.office.rooms = s.office.rooms.filter((r) => r.type !== 'lab')
    stepProgress(s)
    expect(has(s, 'research')).toBe(true)
  })

  it('lists what opens next by how near it is, not by its stage alone', () => {
    const s = guidedGame()
    const next = () => nextCaps(s).map((x) => x.cap.id)
    // nothing has moved: the first stage, in its own order
    expect(next()).toEqual(['research', 'market', 'studio'])
    // a little progress on something far off does not put it first
    s.regions[player(s).home].awareness = 0.1
    expect(ratioOf(s, 'world')).toBeGreaterThan(0)
    expect(isNear(s, 'world')).toBe(false)
    expect(next()).toEqual(['research', 'market', 'studio'])
    // but something of a later stage that is most of the way there comes before a first-stage one not begun
    s.companies[0].unitsTotal = 8000
    expect(ratioOf(s, 'rivals')).toBeCloseTo(0.8)
    expect(next()[0]).toBe('rivals')
    expect(next().indexOf('rivals')).toBeLessThan(next().indexOf('research') < 0 ? 99 : next().indexOf('research'))
    // the navigation keeps to the stages
    expect(nearTabs(s)).toEqual(['research', 'market', 'marketing'])
  })

  it('opens the recall screen with the recall, whatever else is true', () => {
    const s = guidedGame()
    expect(launch(s, 1)).toBeNull()
    tick(s, 120)
    const p = s.products.find((x) => x.companyId === 'player')!
    expect(has(s, 'care')).toBe(false)
    p.recall = { state: 'open', day: s.day, cost: 1 }
    tick(s, 1)
    expect(has(s, 'care')).toBe(true)
    // and deciding it was never locked
    p.unitsSold = 10
    expect(recallProduct(s, p.id)).toBeNull()
  })
})

describe('a sensible opening', () => {
  const within = (s: GameState, id: CapId, from: number, to: number) => {
    const day = s.unlocks[id]
    expect(day, `${id} opened on day ${day}`).toBeGreaterThanOrEqual(from)
    expect(day, `${id} opened on day ${day}`).toBeLessThanOrEqual(to)
  }

  it('opens the first capabilities in order, on Normal', () => {
    const s = play('normal', 3)
    expect(s.gameOver).toBe(false)
    // the first minutes: research with the first researcher, the market with the first design
    within(s, 'research', 0, 0)
    within(s, 'market', 0, 1)
    // the device goes on sale, and with it come the executive search and the first seat
    within(s, 'execs', 40, 120)
    within(s, 'studio', 40, 120)
    within(s, 'marketing', 45, 150)
    within(s, 'finance', 45, 150)
    within(s, 'teams', 30, 300)
    within(s, 'events', 60, 250)
    within(s, 'care', 60, 300)
    within(s, 'rivals', 80, 300)
    // the first year and the second: the company fills out
    within(s, 'people', 120, 450)
    within(s, 'massMedia', 180, 540)
    within(s, 'shares', 180, 600)
    within(s, 'world', 180, 720)
    within(s, 'factory', 300, 900)
    within(s, 'carePolicy', 360, 1000)
    within(s, 'stores', 450, 1080)
    const order: CapId[] = ['research', 'execs', 'marketing', 'events', 'rivals', 'people', 'massMedia', 'factory', 'stores']
    for (let i = 1; i < order.length; i++) expect(s.unlocks[order[i]], `${order[i]} after ${order[i - 1]}`).toBeGreaterThanOrEqual(s.unlocks[order[i - 1]])
    // something is still ahead after three years
    expect(has(s, 'venue')).toBe(false)
  }, 120000)

  it('is affordable on Tough: the company survives the same opening', () => {
    const s = play('tough', 3)
    expect(s.gameOver).toBe(false)
    within(s, 'research', 0, 0)
    within(s, 'finance', 60, 400)
  }, 120000)

  it('reaches the late capabilities within years, not decades', () => {
    const s = play('normal', 10)
    expect(CAPS.filter((c) => !has(s, c.id)).map((c) => c.id)).toEqual([])
  }, 240000)
})

describe('executives', () => {
  it('cost a multiple of the going rate and take one seat each', () => {
    const s = openGame()
    for (const id of EXEC_IDS) {
      expect(execAvailable(s, id)).toBe(true)
      const pool = s.execPool.filter((e) => e.exec === id)
      expect(pool.length).toBe(2)
      for (const e of pool) {
        expect(e.salary).toBeGreaterThan(salaryFor(e.skill) * 1.7)
        expect(e.salary).toBeLessThan(salaryFor(e.skill) * 2.5)
        expect(e.salary).toBeLessThan(45e3)
      }
    }
    const cfo = s.execPool.find((e) => e.exec === 'cfo')!
    expect(hireExec(s, cfo.id)).toBeNull()
    expect(execOf(s, 'cfo')?.name).toBe(cfo.name)
    expect(s.execPool.some((e) => e.exec === 'cfo')).toBe(false)
    expect(marketPay(execOf(s, 'cfo')!)).toBeGreaterThan(salaryFor(cfo.skill) * 1.7)
  })

  it('lend a modest lift, and leave a gap but no lock when they go', () => {
    const s = guidedGame()
    expect(launch(s, 1)).toBeNull()
    tick(s, 150)
    expect(has(s, 'execs')).toBe(true)
    expect(execFx(s)).toEqual({ overhead: 1, production: 1, outposts: 1, marketing: 1, research: 1, support: 1, morale: 0 })
    const c = s.execPool.find((e) => e.exec === 'cfo')!
    expect(c).toBeTruthy()
    // nobody but the finance chief will talk to a company this small
    expect(s.execPool.every((e) => e.exec === 'cfo')).toBe(true)
    expect(placeItem(s, 'office', 'desk', 8, 4, 0)).toBeNull()
    expect(hireExec(s, c.id)).toBeNull()
    expect(has(s, 'finance')).toBe(true)
    expect(execFx(s).overhead).toBeLessThan(1)
    expect(execFx(s).overhead).toBeGreaterThan(0.9)
    expect(vacantSeats(s)).toEqual([])
    fire(s, execOf(s, 'cfo')!.id)
    tick(s, 1)
    expect(has(s, 'finance')).toBe(true)
    expect(vacantSeats(s)).toEqual(['cfo'] satisfies ExecId[])
    expect(execFx(s).overhead).toBe(1.05)
    expect(s.news.some((n) => n.kind === 'alert' && n.text.includes(EXECS.cfo.title) && n.text.includes('Finance stays open'))).toBe(true)
    // a successor is always on offer, and taking one closes the gap
    const next = s.execPool.find((e) => e.exec === 'cfo')!
    expect(next).toBeTruthy()
    expect(hireExec(s, next.id)).toBeNull()
    expect(vacantSeats(s)).toEqual([])
    expect(execFx(s).overhead).toBeLessThan(1)
  })
})

describe('an open game', () => {
  it('locks nothing', () => {
    const s = openGame()
    for (const c of CAPS) {
      expect(has(s, c.id)).toBe(true)
      expect(locked(s, c.id)).toBeNull()
    }
    expect(toggleResearch(s, 'chipset')).toBeNull()
    expect(startCampaign(s, 'tv', 'brand', 400e3)).toBeNull()
    expect(buildFactory(s)).toBeNull()
    expect(openStore(s, 0)).toBeNull()
    expect(fundingRound(s, 0.1)).toBeNull()
    expect(setCare(s, { warrantyYears: 2 })).toBeNull()
    expect(setPolicy(s, { perks: 1 })).toBeNull()
    expect(autoTeams(s)).toBeNull()
    expect(zoneRoom(s, 'office', 'gym', 0, 0, 2, 1)).toBeNull()
    expect(hire(s, s.candidates[0].id)).toBeNull()
    expect(train(s, s.staff[0].id)).toBeNull()
    tick(s, 60)
    expect(s.unlocks).toEqual({})
    expect(s.news.some((n) => n.kind === 'unlock')).toBe(false)
    expect(nextGoals(s, GOALS.length).length).toBe(GOALS.length - Object.keys(s.goals).length)
  })

  it('is what older saves become, and what a guided game can switch to', () => {
    const old = JSON.parse(JSON.stringify(openGame())) as Record<string, unknown> & { config: Record<string, unknown> }
    old.version = 4
    old.guide = 4
    delete old.unlocks
    delete old.execPool
    delete old.execSeats
    delete old.config.progression
    const s = migrate(old as unknown as GameState)
    expect(s.version).toBe(SAVE_VERSION)
    expect(s.config.progression).toBe('open')
    expect(s.unlocks).toEqual({})
    expect(s.execPool.length).toBe(EXEC_IDS.length * 2)
    // the fifth step of the old guide (design a device) is the eighth of today's
    expect(s.guide).toBe(7)
    expect(CAPS.every((c) => has(s, c.id))).toBe(true)
    // a guided save of today is left as it is
    const g = guidedGame()
    take(g, 'researcher')
    const again = migrate(JSON.parse(JSON.stringify(g)))
    expect(again.config.progression).toBe('guided')
    expect(again.unlocks).toEqual({ research: 0 })
    expect(has(again, 'factory')).toBe(false)
    openEverything(again)
    expect(buildFactory(again)).toBeNull()
  })

  it('suggests no goal about something still locked in a guided game', () => {
    const s = guidedGame()
    const shown = nextGoals(s, GOALS.length).map((x) => x.goal)
    expect(shown.some((g) => g.needs)).toBe(false)
    expect(shown.length).toBeLessThan(GOALS.length)
    expect(shown.some((g) => g.id === 'launch')).toBe(true)
  })
})
