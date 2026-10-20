import { describe, expect, it } from 'vitest'
import { buildVenue, clearZone, defaultConfig, migrate, newGame, placeItem, setEdge, siteOf, upgradeOffice, zoneRoom } from './game'
import { WELL_HERE, UPSTAIRS_OPEN, linkedLevels, openRooms, reachable, sealedOn, wellsOn } from './sites'
import { checkState } from './testing/invariants'
import type { GameState } from './types'

const ok = (err: string | null) => expect(err).toBeNull()

/** A business-park office of one storey: a lobby and an open office, with a way in from the street. */
function office(): GameState {
  const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 3 })
  ok(upgradeOffice(s))
  ok(upgradeOffice(s))
  const o = s.office
  o.items = []
  o.rooms = []
  o.walls = []
  o.grid = o.grid.map(() => 0)
  o.rev++
  ok(zoneRoom(s, 'office', 'lobby', 2, 2, 7, 9))
  ok(zoneRoom(s, 'office', 'work', 8, 2, 17, 9))
  if (!openRooms(o).has(o.grid[3 * o.w + 3])) ok(setEdge(s, 'office', 3, 10, 'n', 'door'))
  if (!openRooms(o).has(o.grid[3 * o.w + 10])) ok(setEdge(s, 'office', 8, 5, 'w', 'door'))
  return s
}

describe('upper floors', () => {
  it('goes up a floor when a room is built on the floor over the top one, and comes down again when it is cleared', () => {
    const s = office()
    expect(siteOf(s, 'office@1')).toBeNull()
    expect(zoneRoom(s, 'office@2', 'work', 8, 2, 12, 6)).not.toBeNull()
    ok(zoneRoom(s, 'office@1', 'work', 8, 2, 17, 9))
    expect(s.office.floors).toBe(2)
    expect(s.office.upper![0].level).toBe(1)
    ok(zoneRoom(s, 'office@2', 'exec', 9, 3, 12, 6))
    expect(s.office.floors).toBe(3)
    expect(checkState(s)).toEqual([])
    clearZone(s, 'office@2', 0, 0, 40, 40)
    expect(s.office.floors).toBe(2)
    expect(s.office.upper).toHaveLength(1)
    // a refused room on a new floor leaves no floor behind
    expect(zoneRoom(s, 'office@2', 'nope', 9, 3, 12, 6)).not.toBeNull()
    expect(s.office.floors).toBe(2)
  })

  it('builds upstairs freely: over open ground, and in any shape', () => {
    const s = office()
    ok(zoneRoom(s, 'office@1', 'work', 15, 2, 24, 6))
    ok(zoneRoom(s, 'office@1', 'lab', 4, 11, 9, 16, 'round'))
    expect(placeItem(s, 'office@1', 'lamp', 9, 3, 0)).toMatch(/outdoors/)
    expect(placeItem(s, 'office@1', 'desk', 2, 3, 0)).toBe(UPSTAIRS_OPEN)
    expect(checkState(s)).toEqual([])
  })

  it('reaches a floor by stairs that rise from a room with a way in into a room above', () => {
    const s = office()
    ok(zoneRoom(s, 'office@1', 'work', 8, 2, 17, 9))
    ok(placeItem(s, 'office@1', 'desk', 10, 4, 0))
    const desk = s.office.upper![0].items[0]
    const has = () => reachable(s.office).some((i) => i.id === desk.id)
    expect(has()).toBe(false)
    expect(sealedOn(s.office, 1)).toHaveLength(1)
    // nothing may stand where the stairs would come up
    expect(placeItem(s, 'office', 'stairs', 10, 4, 0)).toMatch(/Something stands over it/)
    ok(placeItem(s, 'office', 'stairs', 16, 3, 0))
    expect(linkedLevels(s.office)).toBe(1)
    expect(has()).toBe(true)
    expect(sealedOn(s.office, 1)).toHaveLength(0)
    // the stairwell upstairs is kept clear
    expect(wellsOn(s.office, 1).get(3 * s.office.w + 16)).toEqual({ kind: 'stairs', lands: true })
    expect(placeItem(s, 'office@1', 'plant', 16, 4, 0)).toBe(WELL_HERE)
  })

  it('runs a lift up through every floor with a room over it', () => {
    const s = office()
    ok(zoneRoom(s, 'office@1', 'work', 8, 2, 17, 9))
    ok(zoneRoom(s, 'office@2', 'work', 8, 2, 17, 9))
    ok(placeItem(s, 'office', 'lift', 14, 3, 0))
    expect(linkedLevels(s.office)).toBe(2)
    expect(wellsOn(s.office, 2).size).toBe(4)
  })

  it('leaves the floors above standing when the ground under them is cleared', () => {
    const s = office()
    ok(zoneRoom(s, 'office@1', 'work', 8, 2, 17, 9))
    ok(placeItem(s, 'office@1', 'desk', 10, 4, 0))
    clearZone(s, 'office', 8, 2, 17, 9)
    expect(s.office.upper![0].rooms).toHaveLength(1)
    expect(s.office.upper![0].items).toHaveLength(1)
    expect(checkState(s)).toEqual([])
  })

  it('moves with the building to a bigger plot', () => {
    const s = office()
    ok(zoneRoom(s, 'office@1', 'work', 8, 2, 17, 9))
    ok(upgradeOffice(s))
    expect(s.office.upper![0].rooms).toHaveLength(1)
    expect(s.office.upper![0].w).toBe(s.office.w)
    expect(checkState(s)).toEqual([])
  })

  it('moves an older save\'s stairs down to the floor they rise from, and takes empty top storeys off', () => {
    const s = office()
    ok(zoneRoom(s, 'office@1', 'work', 8, 2, 17, 9))
    // the old way: stairs on the ground floor and again on the floor they reached, at another spot
    ok(placeItem(s, 'office', 'stairs', 3, 3, 0))
    ok(placeItem(s, 'office@1', 'stairs', 16, 3, 0))
    // and a bare third storey
    ok(zoneRoom(s, 'office@2', 'work', 8, 2, 9, 3))
    s.office.upper![1].rooms = []
    s.office.upper![1].grid.fill(0)
    s.version = 12
    const cash = s.cash
    const m = migrate(JSON.parse(JSON.stringify(s)))
    expect(m.office.upper).toHaveLength(1)
    expect(m.office.floors).toBe(2)
    expect(m.cash).toBeGreaterThan(cash)
    expect(m.office.upper![0].items.filter((i) => i.kind === 'stairs')).toHaveLength(0)
    expect(linkedLevels(m.office)).toBe(1)
    expect(checkState(m)).toEqual([])
  })
})

describe('venue roof', () => {
  it('rises over rigging put down in the hall', () => {
    const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 3 })
    ok(buildVenue(s))
    if (!s.venue) throw new Error('no venue')
    const v = s.venue
    v.floors = 1
    v.items = []
    v.grid.fill(0)
    v.rooms = []
    v.rev++
    ok(zoneRoom(s, 'venue', 'hall', 1, 1, 18, 12))
    ok(placeItem(s, 'venue', 'screen_xl', 2, 2, 0))
    expect(v.floors).toBe(4)
  })
})
