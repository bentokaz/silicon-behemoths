// Partitions: walls, glass and doors put up inside one room, and what comes of
// them when the room around them changes.
import { describe, expect, it } from 'vitest'
import { buildNav } from '../3d/site/nav'
import { PART_COST, clearZone, defaultConfig, layoutValue, newGame, removeRoom, setEdges, upgradeOffice, zoneRoom } from './game'
import { canPartition, partAt, partBlocks } from './sites'

function campus() {
  const s = newGame({ ...defaultConfig(), seed: 3 })
  s.cash = 1e7
  upgradeOffice(s)
  removeRoom(s, 'office', s.office.rooms[0].n)
  s.office.items = []
  expect(zoneRoom(s, 'office', 'work', 2, 2, 9, 7)).toBeNull()
  return s
}

describe('partitions', () => {
  it('go up only inside one room, are paid for, and come down as an opening', () => {
    const s = campus()
    const site = s.office
    expect(canPartition(site, 5, 4, 'w')).toBe(true)
    // the room's own outline is a wall already, not a place for a partition
    expect(canPartition(site, 2, 4, 'w')).toBe(false)
    const cash = s.cash
    const out = setEdges(s, 'office', { edges: [4, 5, 6].map((y) => ({ x: 5, y, side: 'w' as const })) }, 'wall')
    expect(out.done).toBe(3)
    expect(s.cash).toBe(cash - 3 * PART_COST.wall)
    expect(partAt(site, 5, 5, 'w')?.kind).toBe('wall')
    expect(partBlocks(site, 5, 5, 'w')).toBe(true)
    // a door in the middle of it: only what is fitted is charged
    const before = s.cash
    expect(setEdges(s, 'office', { edges: [{ x: 5, y: 5, side: 'w' }] }, 'door').done).toBe(1)
    expect(before - s.cash).toBe(300)
    expect(partBlocks(site, 5, 5, 'w')).toBe(false)
    expect(layoutValue(site)).toBeGreaterThan(0)
    // taken down again
    expect(setEdges(s, 'office', { edges: [4, 5, 6].map((y) => ({ x: 5, y, side: 'w' as const })) }, 'open').done).toBe(3)
    expect(site.walls.filter((w) => w.part)).toHaveLength(0)
  })

  it('stop people walking through, except at their doors', () => {
    const s = campus()
    const site = s.office
    // a full-height partition across the room, x = 6, from the north wall to the south wall
    setEdges(s, 'office', { edges: [2, 3, 4, 5, 6, 7].map((y) => ({ x: 6, y, side: 'w' as const })) }, 'wall')
    let nav = buildNav(site)
    const i = 4 * site.w + 6
    expect(nav.west[i]).toBe(0)
    setEdges(s, 'office', { edges: [{ x: 6, y: 4, side: 'w' }] }, 'door')
    nav = buildNav(site)
    expect(nav.west[i]).toBe(1)
  })

  it('go when the floor on either side of them goes', () => {
    const s = campus()
    setEdges(s, 'office', { edges: [{ x: 5, y: 4, side: 'w' }] }, 'glass')
    expect(partAt(s.office, 5, 4, 'w')).toBeTruthy()
    clearZone(s, 'office', 2, 2, 4, 7)
    expect(partAt(s.office, 5, 4, 'w')).toBeUndefined()
  })
})
