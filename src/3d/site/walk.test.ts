// Walking a site: walls stop a walker, doors and open ground let them through,
// partitions divide a room, and nobody starts inside a wall or a desk.
import { describe, expect, it } from 'vitest'
import { areaTiles, newSite, zone } from '../../sim/sites'
import type { Site } from '../../sim/types'
import { buildNav } from './nav'
import { BODY, slide, standable, startAt } from './walk'

/** A 22 x 14 plot with one room on tiles x 4-9, y 3-7 and a door in its south wall at x = 6. */
function plot(): Site {
  const site = newSite('office', 1)
  zone(site, 'work', areaTiles(4, 3, 9, 7))
  site.walls = [{ id: 'w1', x: 6, y: 8, side: 'n', kind: 'door' }]
  return site
}
// world coordinates of a tile's middle
const wx = (site: Site, x: number) => x + 0.5 - site.w / 2
const wz = (site: Site, y: number) => y + 0.5 - site.h / 2

describe('walking', () => {
  it('stops at walls and goes through doors', () => {
    const site = plot()
    const nav = buildNav(site)
    const x = wx(site, 6)
    const z = wz(site, 5)
    expect(standable(nav, x, z)).toBe(true)
    // north: the wall at y = 3 holds the walker a body's width off it
    const [, north] = slide(nav, x, z, 0, -10)
    expect(north).toBeGreaterThanOrEqual(3 - site.h / 2 + BODY - 1e-6)
    expect(north).toBeLessThan(3 - site.h / 2 + BODY + 0.15)
    // south through the door, and out onto the open ground beyond
    const [, out] = slide(nav, x, z, 0, 5)
    expect(out).toBeGreaterThan(8 - site.h / 2 + 1)
    // a metre along, there is no door: the wall holds
    const [, held] = slide(nav, wx(site, 7.2), z, 0, 5)
    expect(held).toBeLessThanOrEqual(8 - site.h / 2 - BODY + 1e-6)
    // sideways along a wall the walker slides instead of sticking
    const [sx, sz] = slide(nav, x, wz(site, 3), 2, -1)
    expect(sx).toBeCloseTo(x + 2, 5)
    expect(sz).toBeGreaterThanOrEqual(3 - site.h / 2 + BODY - 1e-6)
  })

  it('is held by partitions and furniture, and walks off the plot only a little way', () => {
    const site = plot()
    // a partition across the room at x = 7, and a desk on tile (5, 5)
    site.walls.push(...[3, 4, 5, 6, 7].map((y, i) => ({ id: `p${i}`, x: 7, y, side: 'w' as const, kind: 'wall' as const, part: true as const })))
    site.items.push({ id: 'd1', kind: 'desk', x: 5, y: 5, rot: 0 })
    const nav = buildNav(site)
    const [east] = slide(nav, wx(site, 6), wz(site, 4), 5, 0)
    expect(east).toBeLessThanOrEqual(7 - site.w / 2 - BODY + 1e-6)
    expect(standable(nav, wx(site, 5), wz(site, 5))).toBe(false)
    const [west] = slide(nav, wx(site, 6), wz(site, 5), -3, 0)
    expect(west).toBeGreaterThanOrEqual(6 - site.w / 2 + BODY - 1e-6)
    // the street: a few metres off the plot, no further
    const [, far] = slide(nav, wx(site, 15), wz(site, 12), 0, 30)
    expect(far).toBeLessThan(site.h / 2 + 7)
  })

  it('starts on floor someone can stand on', () => {
    const site = plot()
    site.items.push({ id: 'd1', kind: 'desk', x: 6, y: 5, rot: 0 })
    const nav = buildNav(site)
    const [x, z] = startAt(nav, wx(site, 6), wz(site, 5))
    expect(standable(nav, x, z)).toBe(true)
  })
})
