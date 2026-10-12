// The game's tables agree with each other: nothing names a segment, a room, a
// capability or a research level that is not there, and nothing waits on
// something that waits on it.
import { describe, expect, it } from 'vitest'
import { defaultConfig, newGame, startProduct, starterDesign } from '../sim/game'
import { GOALS } from '../sim/goals'
import { CHANNELS, EVENTS } from '../sim/growth'
import { CAPS, type CapId, capOfTab } from '../sim/progress'
import { REGIONS } from '../sim/regions'
import { FACADES, GROUNDS, ITEMS, OUT, ROOFS, ROOMS, SITE_TIERS, groundsFor, needsOf } from '../sim/sites'
import { EXECS } from '../sim/staff'
import { OS_FEATURES } from '../sim/tech'
import { DEVICE_TYPES, EXEC_IDS, type Levels, type SiteKind, SUBS, TRACKS } from '../sim/types'
import { INCIDENTS, START_TYPES, STARTUPS, originalName, unlockOf } from '../sim/world'
import { EXTRAS, FEATURES, MATERIALS, MAX_LEVEL, TRACK_INFO, TRUNK_REQS, featureCost, marketLevel, researchCost } from './catalog'
import { OUTLETS, RIVALS, SEGMENTS, TIERS, TYPES, segmentsOf, sizeLimits } from './devices'

const unique = (list: string[]) => expect(new Set(list).size, `duplicates in ${list.join(',').slice(0, 80)}`).toBe(list.length)
const KINDS: SiteKind[] = ['office', 'factory', 'store', 'venue']

describe('the market tables', () => {
  it('give every kind of device its segments, and every segment a way for rivals to build for it', () => {
    unique(SEGMENTS.map((s) => s.id))
    for (const type of DEVICE_TYPES) {
      expect(segmentsOf(type).length, type).toBeGreaterThan(0)
      const T = TYPES[type]
      for (const lim of [T.width, T.height, sizeLimits(type, 'flip').width, sizeLimits(type, 'flip').height]) expect(lim[0] <= lim[2] && lim[2] <= lim[1], `${type} ${lim}`).toBe(true)
      for (const e of T.extras) expect(EXTRAS.some((x) => x.id === e), `${type} extra ${e}`).toBe(true)
      for (const from of unlockOf(type).from) expect(DEVICE_TYPES).toContain(from)
      for (const [track, level] of Object.entries(unlockOf(type).needs)) expect(TRACKS.includes(track as never) && level <= MAX_LEVEL, `${type} needs ${track} ${level}`).toBe(true)
      expect(unlockOf(type).cost).toBeGreaterThan(0)
    }
    for (const seg of SEGMENTS) {
      expect(TIERS[seg.id], seg.id).toBeDefined()
      expect(DEVICE_TYPES).toContain(seg.type)
      expect(seg.size > 0 && seg.priceRef > 0 && seg.sens > 0 && seg.expect > 0).toBe(true)
      const total = SUBS.reduce((a, k) => a + seg.weights[k], seg.weights.brand)
      expect(total, `${seg.id} weights`).toBeCloseTo(1, 5)
    }
    for (const id of Object.keys(TIERS)) expect(SEGMENTS.some((s) => s.id === id), `tier ${id}`).toBe(true)
    for (const o of OUTLETS) expect(SUBS.reduce((a, k) => a + o.weights[k], 0), o.name).toBeCloseTo(1, 5)
  })

  it('let a new company build its first device whatever it starts with, at every starting level of technology', () => {
    for (const startType of [...START_TYPES, ...DEVICE_TYPES.filter((t) => !(START_TYPES as string[]).includes(t)), 'all' as const]) {
      for (const techLevel of [0, 1, 2, 3, 4]) {
        for (const progression of ['guided', 'open'] as const) {
          const s = newGame({ ...defaultConfig(), startType, techLevel, progression, startCash: 50e6 })
          for (const type of startType === 'all' ? DEVICE_TYPES : [startType]) {
            const refusal = startProduct(s, { design: starterDesign(s, type), family: `First ${type}`, variant: '', price: 499, tiers: [], quantity: 1000, mode: 'contract', marketing: 0 })
            expect(refusal, `${type} at level ${techLevel}, ${progression}`).toBeNull()
          }
        }
      }
    }
  })

  it('give every rival segments that exist, a name for each line, and a name of its own in both sets', () => {
    unique(RIVALS.map((r) => r.name))
    unique(RIVALS.map((r) => originalName(r.name)))
    unique([...STARTUPS, ...RIVALS.map((r) => originalName(r.name))])
    for (const r of RIVALS) {
      expect(r.segments.length, r.name).toBeGreaterThan(0)
      unique(r.segments)
      for (const seg of r.segments) {
        expect(SEGMENTS.some((s) => s.id === seg), `${r.name} sells in ${seg}`).toBe(true)
        expect(r.series[seg], `${r.name} has no line name for ${seg}`).toBeTruthy()
      }
      expect(r.brand >= 0.05 && r.brand <= 1 && r.awareness >= 0 && r.awareness <= 1 && r.priceMult > 0).toBe(true)
    }
    // every segment has somebody selling in it from the first day
    for (const seg of SEGMENTS) expect(RIVALS.some((r) => r.segments.includes(seg.id)), `nobody sells ${seg.id}`).toBe(true)
    expect(REGIONS.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 9)
    unique(REGIONS.map((r) => r.id))
    unique(REGIONS.flatMap((r) => r.cities))
  })
})

describe('the technology tree', () => {
  it('can be climbed to the top from the bottom: no level waits on a level that waits on it', () => {
    const lv = Object.fromEntries(TRACKS.map((t) => [t, 0])) as Levels
    for (let moved = true; moved; ) {
      moved = false
      for (const t of TRACKS) {
        if (lv[t] >= MAX_LEVEL) continue
        const req = TRUNK_REQS[t]?.[lv[t] + 1] ?? {}
        if (TRACKS.every((k) => req[k] === undefined || lv[k] >= req[k]!)) {
          lv[t]++
          moved = true
        }
      }
    }
    for (const t of TRACKS) expect(lv[t], t).toBe(MAX_LEVEL)
    for (const t of TRACKS) expect(TRACK_INFO[t].unlocks).toHaveLength(MAX_LEVEL + 1)
    unique(FEATURES.map((f) => f.id))
    for (const f of FEATURES) expect(TRACKS.includes(f.track) && f.level >= 0 && f.level <= MAX_LEVEL && featureCost(f) > 0, f.id).toBe(true)
    for (const e of EXTRAS) expect(FEATURES.some((f) => f.id === e.id), `extra ${e.id} has no research`).toBe(true)
    for (let l = 1; l <= MAX_LEVEL; l++) expect(researchCost(l)).toBeGreaterThan(researchCost(l - 1))
    expect(marketLevel(0)).toBe(3)
    expect(marketLevel(1e9)).toBe(MAX_LEVEL)
    unique(MATERIALS.map((m) => m.id))
    unique(OS_FEATURES.map((f) => f.id))
  })
})

describe('plots, rooms and furniture', () => {
  it('name only rooms, grounds and capabilities that exist', () => {
    const caps = new Set<string>(CAPS.map((c) => c.id))
    for (const kind of KINDS) {
      expect(SITE_TIERS[kind].length).toBeGreaterThan(0)
      SITE_TIERS[kind].forEach((tier, i) => {
        expect(tier.w > 0 && tier.h > 0 && tier.cost >= 0 && tier.rent >= 0, `${kind} ${i}`).toBe(true)
        if (i) expect(tier.w >= SITE_TIERS[kind][i - 1].w && tier.h >= SITE_TIERS[kind][i - 1].h, `${kind} tier ${i} is smaller than the one before`).toBe(true)
        const grounds = groundsFor({ kind, tier: i })
        expect(grounds.length).toBeGreaterThan(0)
        for (const g of grounds) expect(g, `${kind} ${i} offers a ground that is not in the list`).toBeDefined()
      })
      for (const [id, room] of Object.entries(ROOMS[kind])) {
        expect(room.styles.length, `${kind} room ${id}`).toBeGreaterThan(0)
        expect(room.cost).toBeGreaterThan(0)
        if (room.needs) expect(caps.has(room.needs), `${kind} room ${id} waits on ${room.needs}`).toBe(true)
        // every room has something that can be put in it
        expect(Object.values(ITEMS[kind]).some((it) => it.rooms.includes(id)), `nothing goes in the ${kind} room ${id}`).toBe(true)
      }
      for (const [id, item] of Object.entries(ITEMS[kind])) {
        expect(item.w >= 1 && item.h >= 1 && item.cost > 0, `${kind} item ${id}`).toBe(true)
        expect(item.rooms.length).toBeGreaterThan(0)
        for (const r of item.rooms) expect(r === OUT || !!ROOMS[kind][r], `${kind} item ${id} goes in ${r}`).toBe(true)
        const cap = needsOf(kind, 'item', id)
        if (cap) expect(caps.has(cap), `${kind} item ${id} waits on ${cap}`).toBe(true)
        // it fits on the smallest plot of its kind
        expect(Math.max(item.w, item.h) <= Math.min(SITE_TIERS[kind][0].w, SITE_TIERS[kind][0].h), `${kind} item ${id} is bigger than the smallest plot`).toBe(true)
      }
    }
    unique(GROUNDS.map((g) => g.id))
    unique(FACADES.map((f) => f.id))
    unique(ROOFS.map((r) => r.id))
    expect(FACADES[0].cost + ROOFS[0].cost).toBe(0)
  })
})

describe('capabilities, goals and events', () => {
  it('form a ladder with no rung that needs a rung above it', () => {
    unique(CAPS.map((c) => c.id))
    unique(CAPS.flatMap((c) => c.tabs ?? []))
    // what each capability waits on, read from the text of its requirements: "Open X" names another capability
    const byName = new Map(CAPS.map((c) => [c.name, c.id]))
    const waits = new Map<CapId, CapId[]>()
    for (const c of CAPS) {
      expect(c.reqs.length, c.id).toBeGreaterThan(0)
      const on: CapId[] = []
      for (const r of c.reqs) {
        expect(r.need).toBeGreaterThan(0)
        const m = /^Open (.+)$/.exec(r.label)
        if (m) {
          expect(byName.has(m[1]), `${c.id} waits on "${m[1]}", which is no capability`).toBe(true)
          on.push(byName.get(m[1])!)
        }
        // the place a requirement points to is a screen that exists from the start or that some capability opens
        if (r.where?.tab) expect(['staff', 'products', 'office', 'research', 'marketing'].includes(r.where.tab) || !!capOfTab(r.where.tab), `${c.id} points at ${r.where.tab}`).toBe(true)
      }
      if (c.exec) expect(EXEC_IDS).toContain(c.exec)
      waits.set(c.id, on)
    }
    const depth = (id: CapId, seen: CapId[] = []): number => {
      expect(seen.includes(id), `${[...seen, id].join(' -> ')} goes round in a circle`).toBe(false)
      return 1 + Math.max(0, ...(waits.get(id) ?? []).map((x) => depth(x, [...seen, id])))
    }
    for (const c of CAPS) expect(depth(c.id)).toBeLessThan(CAPS.length)
    for (const id of EXEC_IDS) expect(EXECS[id].title).toBeTruthy()
  })

  it('list goals, incidents, channels and events that can each be told apart and each be met', () => {
    unique(GOALS.map((g) => g.id))
    unique(GOALS.map((g) => g.name))
    const caps = new Set<string>(CAPS.map((c) => c.id))
    for (const g of GOALS) {
      expect(g.cash >= 0 && (g.fans ?? 0) >= 0, g.id).toBe(true)
      if (g.needs) expect(caps.has(g.needs), `${g.id} waits on ${g.needs}`).toBe(true)
    }
    for (const [id, def] of Object.entries(INCIDENTS)) expect(def.weight > 0 && def.title.length > 0, id).toBe(true)
    for (const [id, ch] of Object.entries(CHANNELS)) {
      expect(ch.min > 0 && ch.reach > 0, id).toBe(true)
      for (const seg of Object.keys(ch.segs)) expect(SEGMENTS.some((s) => s.id === seg), `${id} names segment ${seg}`).toBe(true)
    }
    for (const [id, ev] of Object.entries(EVENTS)) {
      expect(ev.venues.length, id).toBeGreaterThan(0)
      for (const v of ev.venues) expect(v.cost > 0 && v.reach > 0, `${id} ${v.name}`).toBe(true)
    }
  })
})
