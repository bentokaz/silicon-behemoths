import { describe, expect, it } from 'vitest'
import { OVERHANG, UPPER_SHAPE, clearZone, defaultConfig, migrate, newGame, placeItem, setEdge, setLook, siteOf, upgradeOffice, zoneRoom } from './game'
import { UPSTAIRS_OPEN, linkedLevels, reachable, sealedOn } from './sites'
import { checkState } from './testing/invariants'
import type { GameState } from './types'

const ok = (err: string | null) => expect(err).toBeNull()

/** A business-park office of two storeys: a lobby and an open office on the ground floor, the first floor bare. */
function twoStoreys(): GameState {
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
  ok(setLook(s, 'office', { floors: 2 }))
  return s
}

describe('upper floors', () => {
  it('has a plan of its own for each storey over the first', () => {
    const s = twoStoreys()
    expect(s.office.upper).toHaveLength(1)
    expect(siteOf(s, 'office@1')).toBe(s.office.upper![0])
    expect(siteOf(s, 'office@2')).toBeNull()
    ok(setLook(s, 'office', { floors: 4 }))
    expect(s.office.upper!.map((l) => l.level)).toEqual([1, 2, 3])
    expect(checkState(s)).toEqual([])
  })

  it('builds rooms only over the building below, as boxes', () => {
    const s = twoStoreys()
    expect(zoneRoom(s, 'office@1', 'work', 15, 2, 22, 6)).toBe(OVERHANG)
    expect(zoneRoom(s, 'office@1', 'work', 8, 2, 12, 6, 'round')).toBe(UPPER_SHAPE)
    ok(zoneRoom(s, 'office@1', 'work', 8, 2, 17, 9))
    expect(placeItem(s, 'office@1', 'lamp', 9, 3, 0)).toMatch(/outdoors/)
    expect(checkState(s)).toEqual([])
  })

  it('counts desks upstairs only once stairs reach them from a room with a way in', () => {
    const s = twoStoreys()
    ok(zoneRoom(s, 'office@1', 'work', 8, 2, 17, 9))
    ok(placeItem(s, 'office@1', 'desk', 10, 4, 0))
    const desk = s.office.upper![0].items[0]
    const has = () => reachable(s.office).some((i) => i.id === desk.id)
    expect(has()).toBe(false)
    expect(sealedOn(s.office, 1)).toHaveLength(1)
    ok(placeItem(s, 'office@1', 'stairs', 16, 3, 0))
    expect(has()).toBe(false)
    ok(placeItem(s, 'office', 'stairs', 16, 3, 0))
    // the open office on the ground floor needs a way in for the stairs in it to count
    ok(setEdge(s, 'office', 3, 10, 'n', 'door'))
    if (!linkedLevels(s.office)) ok(setEdge(s, 'office', 8, 5, 'w', 'door'))
    expect(linkedLevels(s.office)).toBe(1)
    expect(has()).toBe(true)
    expect(sealedOn(s.office, 1)).toHaveLength(0)
  })

  it('refuses open space upstairs', () => {
    const s = twoStoreys()
    expect(placeItem(s, 'office@1', 'desk', 10, 4, 0)).toBe(UPSTAIRS_OPEN)
  })

  it('brings the floors above down with the ground under them, and keeps a storey with rooms', () => {
    const s = twoStoreys()
    ok(zoneRoom(s, 'office@1', 'work', 8, 2, 17, 9))
    ok(placeItem(s, 'office@1', 'desk', 10, 4, 0))
    expect(setLook(s, 'office', { floors: 1 })).toMatch(/top floor has rooms/)
    const cash = s.cash
    clearZone(s, 'office', 8, 2, 17, 9)
    const up = s.office.upper![0]
    expect(up.rooms).toHaveLength(0)
    expect(up.items).toHaveLength(0)
    expect(s.cash).toBeGreaterThan(cash)
    ok(setLook(s, 'office', { floors: 1 }))
    expect(s.office.upper).toBeUndefined()
    expect(checkState(s)).toEqual([])
  })

  it('moves with the building to a bigger plot', () => {
    const s = twoStoreys()
    ok(zoneRoom(s, 'office@1', 'work', 8, 2, 17, 9))
    ok(upgradeOffice(s))
    expect(s.office.upper![0].rooms).toHaveLength(1)
    expect(s.office.upper![0].w).toBe(s.office.w)
    expect(checkState(s)).toEqual([])
  })

  it('gives an older save one bare plan per upper storey', () => {
    const s = twoStoreys()
    delete s.office.upper
    s.office.floors = 3
    s.version = 9
    const m = migrate(JSON.parse(JSON.stringify(s)))
    expect(m.office.upper).toHaveLength(2)
    expect(m.office.upper![1].level).toBe(2)
  })
})
