// Loading old saves: every version this game has had, rebuilt by taking away
// what later versions added, must come up to date without failing, and a save
// brought up to date once is not changed by being brought up to date again.
import { describe, expect, it } from 'vitest'
import * as G from './game'
import { checkState } from './testing/invariants'
import { PERSONAS } from './testing/personas'
import { Play } from './testing/play'
import { canon } from './testing/runner'
import type { GameState } from './types'

type Loose = Record<string, any>

/** A company a few years in, with a bit of everything: the raw material for old saves. */
function played(): GameState {
  const p = new Play({ ...G.defaultConfig(), seed: 5, startCash: 400e6, progression: 'open' }, 'migrate')
  const bot = PERSONAS.sensible()
  bot.setup!(p)
  for (let m = 0; m < 14; m++) {
    p.run(30)
    bot.month(p, m)
  }
  expect([...p.findings.values()].map((f) => f.detail)).toEqual([])
  return p.s
}

/** The same game as each earlier version would have saved it: later additions taken away, one layer per version. */
function asVersion(src: GameState, version: number): Loose {
  const s: Loose = JSON.parse(JSON.stringify(src))
  s.version = version
  // version 5 brought guided progression, executives and incidents
  if (version < 5) {
    for (const k of ['unlocks', 'execSeats', 'execPool', 'incidents', 'guide', 'economy']) delete s[k]
    delete s.config.progression
    s.staff = s.staff.filter((e: Loose) => !e.exec)
    for (const tm of s.teams ?? []) {
      tm.members = tm.members.filter((id: string) => s.staff.some((e: Loose) => e.id === id))
      if (!tm.members.includes(tm.leadId)) delete tm.leadId
    }
    for (const c of s.companies) delete c.origin
  }
  // version 4: regions, shares, after-sales, goals, device lines
  if (version < 4) {
    for (const k of ['regions', 'stock', 'care', 'goals', 'types', 'venue']) delete s[k]
    for (const c of s.companies) for (const k of ['home', 'revYear', 'revMonth', 'value', 'valueHistory', 'acquired']) delete c[k]
    for (const st of s.stores) delete st.region
    for (const p of s.products) delete p.recall
    for (const c of s.campaigns) delete c.region
    for (const r of [s.cur, ...s.reports]) delete r.funding
  }
  // version 3: teams and policies, plots with rooms
  if (version < 3) {
    for (const k of ['teams', 'policy']) delete s[k]
    const flat = (site: Loose | null) => (site ? { tier: Math.min(site.tier, 2), w: 12, h: 8, items: site.items.slice(0, 6).map((it: Loose, i: number) => ({ id: it.id, kind: it.kind, x: 1 + (i % 5) * 2, y: 1 + Math.floor(i / 5) * 2, rot: 0 })) } : null)
    s.office = flat(s.office)
    s.factory = flat(s.factory)
    for (const st of s.stores) st.site = flat(st.site)
    for (const e of s.staff) for (const k of ['morale', 'traits', 'potential', 'lowDays', 'ask', 'raiseAfter', 'trainingUntil']) delete e[k]
  }
  // version 2: operations, marketing, chips, software, fans
  if (version < 2) {
    for (const k of ['orders', 'supply', 'stores', 'campaigns', 'events', 'chips', 'os', 'owners', 'fans', 'features']) delete s[k]
    s.factory = null
    for (const p of s.products) {
      for (const k of ['family', 'variant', 'tiers', 'costParts', 'hype', 'buzz', 'defectRate', 'satisfaction', 'feedback', 'type']) delete p[k]
      if (p.design.type === 'phone') delete p.design.type
    }
    for (const c of s.companies) delete c.software
    for (const r of [s.cur, ...s.reports]) for (const k of ['other', 'salaries', 'facilities']) delete r[k]
  }
  // a save from before saves carried a version at all
  if (version < 1) delete s.version
  return s
}

describe('bringing old saves up to date', () => {
  const now = played()

  it('leaves a save of this version exactly as it is, however often it is loaded', () => {
    const once = G.migrate(JSON.parse(JSON.stringify(now)))
    expect(canon(once)).toBe(canon(now))
    const twice = G.migrate(JSON.parse(JSON.stringify(once)))
    expect(canon(twice)).toBe(canon(once))
  })

  for (let version = 0; version < G.SAVE_VERSION; version++) {
    it(`loads a save as version ${version} would have written it, and plays on from it`, () => {
      const s = G.migrate(asVersion(now, version) as GameState)
      expect(s.version).toBe(G.SAVE_VERSION)
      // sound enough to carry on: nothing that is not a number, nothing dangling
      // (the months already closed are not held to the books: an old save has no line for money from investors)
      expect(checkState(s).filter((f) => !/^books/.test(f))).toEqual([])
      // loading it again changes nothing
      const again = G.migrate(JSON.parse(JSON.stringify(s)))
      expect(canon(again)).toBe(canon(s))
      // and the game goes on
      G.tick(s, 150)
      expect(s.day).toBe(now.day + 150)
      expect(checkState(s).filter((f) => !/^books/.test(f))).toEqual([])
      // a company from before guided progression has every screen open
      if (version < 5) expect(s.config.progression).toBe('open')
    }, 60000)
  }

  it('does not fail on a save with almost everything optional missing', () => {
    const bare: Loose = asVersion(now, 0)
    for (const p of bare.products) {
      delete p.segUnits
      delete p.history
    }
    bare.staff = []
    bare.products = bare.products.slice(0, 40)
    expect(() => G.migrate(bare as GameState)).not.toThrow()
  })
})
