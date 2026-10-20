// Putting furniture down on a large campus used to hold the game up for
// seconds: every placement rebuilt the walls and floors of the whole
// building. The building now follows its plan only, and these keep it so.
import { describe, expect, it } from 'vitest'
import { placeItems, zoneRoom } from '../../sim/game'
import { record } from '../../store/siteHistory'
import { bigCampus } from './campus.fixture'
import { planKey } from './plankey'
import { structureMeshes } from './structure'

describe('placing on a large campus', () => {
  const s = bigCampus()
  const site = s.office

  it('is a large campus', () => {
    expect(site.items.length).toBeGreaterThan(500)
    expect(site.rooms.length).toBeGreaterThan(40)
  })

  it('leaves the plan, and so the walls and floors, as they are when furniture comes and goes', () => {
    const before = planKey(site)
    expect(placeItems(s, 'office', 'plant', 3, 4, 7, 4, 0).done).toBeGreaterThan(0)
    expect(planKey(site)).toBe(before)
    expect(zoneRoom(s, 'office', 'lounge', 2, site.h - 3, 8, site.h - 2)).toBeNull()
    expect(planKey(site)).not.toBe(before)
  })

  it('keeps the sim side of a placement, undo history included, well inside a frame budget', () => {
    let x = 0
    const t0 = performance.now()
    for (let i = 0; i < 10; i++) record(s, 'office', 'Plant', (g) => placeItems(g, 'office', 'plant', 3 + (x++ % 5), 6, 3 + (x % 5), 6, 0))
    expect((performance.now() - t0) / 10).toBeLessThan(25)
  })

  it('builds the walls of the whole campus from one batch of typed buffers', () => {
    const meshes = structureMeshes(site, 'cut', 0)
    expect(meshes.length).toBeGreaterThan(0)
    for (const m of meshes) {
      expect(m.geometry.index).not.toBeNull()
      expect(m.geometry.attributes.position.count).toBeGreaterThan(0)
    }
  })
})
