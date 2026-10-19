import { describe, expect, it } from 'vitest'
import { applyVenuePreset, buildVenue, defaultConfig, newGame, venuePresetQuote } from '../../sim/game'
import { VENUE_PRESETS, type VenuePreset, hiredVenue, rigFloors, stageOf, venueStats } from '../../sim/sites'
import { buildNav } from './nav'
import { buildSpots } from './spots'
import { VenueCrowd } from './venuecrowd'

describe('ready-made venues', () => {
  it('builds each one on every plot big enough, ready for a keynote, with every seat reachable and the rig under the roof', () => {
    const seen: Record<string, number> = {}
    for (let tier = 0; tier < 4; tier++) {
      for (const k of Object.keys(VENUE_PRESETS) as VenuePreset[]) {
        const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 4 })
        for (let i = 0; i <= tier; i++) expect(buildVenue(s)).toBeNull()
        const q = venuePresetQuote(s, k)
        if (tier < VENUE_PRESETS[k].tier) {
          expect(q.error).toMatch(/needs at least/)
          continue
        }
        expect(q.error).toBeNull()
        expect(applyVenuePreset(s, k)).toBeNull()
        const site = s.venue!
        const st = venueStats(site)
        expect(st.ready).toBe(true)
        expect(rigFloors(site)).toBe(0)
        expect(stageOf(site)?.kind).toBe(k === 'arena' ? 'stage_xl' : k === 'theatre' ? 'stage_l' : 'stage')
        const nav = buildNav(site)
        const crowd = new VenueCrowd()
        crowd.setSite(site, nav, buildSpots(site, nav))
        expect(crowd.seats.length).toBe(st.seats)
        expect(crowd.seats.every((seat) => seat.access >= 0 && nav.reach[seat.access] === 1)).toBe(true)
        seen[`${k}${tier}`] = st.seats
        // a second time is a no-op
        expect(applyVenuePreset(s, k)).toMatch(/already/)
      }
    }
    // a bigger plot holds a bigger house
    expect(seen.arena3).toBeGreaterThan(seen.arena2)
    expect(seen.arena2).toBeGreaterThan(seen.theatre1)
    expect(seen.theatre1).toBeGreaterThan(seen.hall0)
  }, 120_000)

  it('lays hired theatres and arenas out with big stages', () => {
    expect(stageOf(hiredVenue(1))?.kind).toBe('stage_l')
    expect(stageOf(hiredVenue(2))?.kind).toBe('stage_xl')
    expect(venueStats(hiredVenue(2)).seats).toBeGreaterThan(venueStats(hiredVenue(1)).seats)
  })
})
