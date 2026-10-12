import { describe, expect, it } from 'vitest'
import { autoVenue, buildVenue, defaultConfig, newGame, zoneRoom } from '../../sim/game'
import { venueLife } from '../../sim/life'
import { hiredVenue, venueStats } from '../../sim/sites'
import { curveTiles } from '../../sim/curves'
import type { GameState, Site } from '../../sim/types'
import { Kind, Mode } from './crowd'
import { buildNav } from './nav'
import { placeBeside } from './pick'
import { buildSpots, seatPlaces, seatRank } from './spots'
import { SHOW, VenueCrowd, phaseAt } from './venuecrowd'

function house(site: Site, booked = true, draw = 0.9) {
  const nav = buildNav(site)
  const spots = buildSpots(site, nav)
  const crowd = new VenueCrowd()
  crowd.setSite(site, nav, spots)
  crowd.setProgramme({ booked, live: false, draw })
  return { crowd, nav, spots }
}

/** Runs the site clock from one hour to another at thirty steps a second. */
function run(crowd: VenueCrowd, from: number, to: number, each?: (t: number) => void) {
  for (let t = from; t < to; t += 1 / 30 / 45) {
    crowd.step(1 / 30, 1, t)
    each?.(t)
  }
}

function ownVenue(): GameState {
  const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 4 })
  expect(buildVenue(s)).toBeNull()
  expect(autoVenue(s)).toBeNull()
  return s
}

describe('a venue on a show day', () => {
  it('gives every seat the player built a place, and no more', () => {
    const s = ownVenue()
    const site = s.venue!
    const { crowd } = house(site)
    expect(seatPlaces(site).length).toBe(venueStats(site).seats)
    expect(crowd.seats.length).toBe(venueStats(site).seats)
    // nobody is asked to sit somewhere they would have to be dropped into
    expect(crowd.seats.every((seat) => seat.access >= 0)).toBe(true)
  })

  it('fills the house up to what the show draws, seats everyone who walks in, and empties it afterwards', () => {
    const s = ownVenue()
    const site = s.venue!
    const { crowd } = house(site, true, 0.9)
    crowd.walkers = 30
    const seats = venueStats(site).seats
    let most = 0
    let closest = Infinity
    run(crowd, SHOW.doors - 0.2, SHOW.ovation + 0.1, () => {
      most = Math.max(most, crowd.bodies.filter((b) => b.kind === Kind.Guest).length)
      closest = Math.min(closest, crowd.closest().d)
    })
    // never more guests on their feet than the view was told to draw, and never more in the house than it seats
    expect(most).toBeLessThanOrEqual(30)
    expect(most).toBeGreaterThan(20)
    expect(crowd.house).toBeCloseTo(0.9, 1)
    expect(Math.round(crowd.house * seats)).toBeLessThanOrEqual(seats)
    // by the end of the show everyone who walked in is in a seat of their own
    const guests = crowd.bodies.filter((b) => b.kind === Kind.Guest)
    const taken = new Set(guests.map((b) => b.seat?.key))
    expect(taken.size).toBe(guests.length)
    for (const b of guests) {
      expect(b.mode).toBe(Mode.Do)
      expect(b.spot).toBe(b.seat)
    }
    // the seated audience leaves those seats alone
    for (const b of guests) expect(crowd.reserved.has(b.seat!.key)).toBe(true)
    // they applaud at the end, most of them on their feet
    expect(crowd.ovation).toBe(true)
    expect(guests.filter((b) => b.cheer).length).toBeGreaterThan(guests.length / 2)
    expect(crowd.bodies.some((b) => b.kind === Kind.Host && b.mode === Mode.Do && b.y > 0.5)).toBe(true)
    // nobody walked through anybody on the way in
    expect(closest).toBeGreaterThan(0.3)
    expect(crowd.ghosts).toBe(0)
    run(crowd, SHOW.ovation + 0.1, SHOW.cleared + 0.6)
    expect(crowd.bodies.filter((b) => b.kind === Kind.Guest).length).toBe(0)
    expect(crowd.house).toBe(0)
    expect(crowd.reserved.size).toBe(0)
  })

  it('fills row by row from the front as the guests walk in, and empties from the back', () => {
    const s = ownVenue()
    const site = s.venue!
    const { crowd } = house(site, true, 0.9)
    crowd.walkers = 60
    const rank = seatRank(crowd.seats)
    const place = new Map(crowd.seats.map((seat, i) => [seat.key, rank[i]]))
    // the order follows the rows: the first third of it is nearer the stage than the last third
    const depth = (from: number, to: number) => {
      const zs = crowd.seats.filter((_, i) => rank[i] >= from && rank[i] < to).map((seat) => seat.z)
      return zs.reduce((a, z) => a + z, 0) / zs.length
    }
    const n = crowd.seats.length
    expect(depth(0, n / 3)).toBeLessThan(depth((2 * n) / 3, n) - 2)
    /** Seats with someone in them or on their way to them, by place in the order. */
    const taken = () => [...crowd.seated, ...crowd.reserved].map((key) => place.get(key)!)
    let walkedIn = 0
    let jump = 0
    let last = 0
    run(crowd, SHOW.doors - 0.1, SHOW.start - 0.05, (t) => {
      const now = crowd.seated.size
      jump = Math.max(jump, now - last)
      last = now
      walkedIn = Math.max(walkedIn, crowd.bodies.filter((b) => b.kind === Kind.Guest).length)
      // half-way through: what is taken is the front of the house, with nothing skipped behind the line
      if (Math.abs(t - (SHOW.doors + 0.5)) < 1 / 30 / 45) {
        const got = taken()
        expect(got.length).toBeGreaterThan(20)
        expect(Math.max(...got)).toBe(got.length - 1)
      }
    })
    // nobody is counted twice, the people who are only ever seen seated arrive one at a time, and plenty walk in
    for (const key of crowd.seated) expect(crowd.reserved.has(key)).toBe(false)
    expect(jump).toBeLessThanOrEqual(1)
    expect(walkedIn).toBeGreaterThan(40)
    expect(crowd.seated.size + crowd.reserved.size).toBe(Math.round(n * 0.9))
    // everyone who walked in has found their seat by the time the show starts
    const guests = crowd.bodies.filter((b) => b.kind === Kind.Guest)
    expect(guests.filter((b) => b.spot === b.seat).length).toBeGreaterThanOrEqual(guests.length - 2)
    // afterwards the back rows go first
    let checked = false
    run(crowd, SHOW.start - 0.05, SHOW.cleared, (t) => {
      if (Math.abs(t - (SHOW.end + 0.25)) > 1 / 30 / 45) return
      const stay = [...crowd.seated].map((key) => place.get(key)!)
      for (const b of crowd.bodies) if (b.kind === Kind.Guest && b.spot === b.seat) stay.push(place.get(b.seat!.key)!)
      expect(stay.length).toBeGreaterThan(10)
      expect(Math.max(...stay)).toBeLessThan(n * 0.9 * 0.75)
      checked = true
    })
    expect(checked).toBe(true)
    expect(crowd.ghosts).toBe(0)
  })

  it('takes guests up the aisle steps and along the row in front of the seats, never through them', () => {
    const s = ownVenue()
    const site = s.venue!
    const { crowd, nav } = house(site)
    for (const seat of crowd.seats) {
      expect(seat.row).toBe(true)
      const via = seat.via!
      expect(via.length % 3).toBe(0)
      // from the tile they step in from, the way only ever climbs, and it starts on the ground
      expect(via[1]).toBe(0)
      for (let k = 4; k < via.length; k += 3) expect(via[k]).toBeGreaterThanOrEqual(via[k - 3])
      expect(via[via.length - 2]).toBe(seat.y)
      expect(Math.hypot(via[0] - nav.cx(seat.access), via[2] - nav.cz(seat.access))).toBeLessThan(0.75)
      // the last stretch runs along the row a step in front of the seats: clear of every seat in it
      const k = via.length - 3
      for (const other of crowd.seats) {
        if (other === seat || other.y !== seat.y || Math.abs(other.z - seat.z) > 0.01) continue
        expect(Math.abs(via[k + 2] - other.z)).toBeGreaterThan(0.4)
      }
    }
    // a raised row is reached by the steps: more than one point on the way up
    expect(crowd.seats.filter((seat) => seat.y > 0.6).every((seat) => seat.via!.length >= 9)).toBe(true)
  })

  it('has only a small crew about on an ordinary day', () => {
    const s = ownVenue()
    const { crowd } = house(s.venue!, false)
    run(crowd, 9, 12)
    expect(crowd.bodies.filter((b) => b.kind === Kind.Guest).length).toBe(0)
    expect(crowd.bodies.filter((b) => b.kind === Kind.Crew && b.mode !== Mode.Off).length).toBeGreaterThan(1)
    expect(crowd.house).toBe(0)
    expect(phaseAt(14.5, 3, { booked: false, live: false, draw: 1 })).toBe('crew')
    expect(phaseAt(14.5, 3, { booked: true, live: false, draw: 1 })).toBe('show')
  })

  it('seats a hired arena for the replay without a walking map', () => {
    const arena = hiredVenue(2)
    expect(seatPlaces(arena).length).toBe(venueStats(arena).seats)
  })

  it('reads the booking from the game', () => {
    const s = ownVenue()
    const v = venueLife(s)!
    expect(v.booked).toBe(false)
    s.events.push({ id: 'vx', type: 'keynote', venue: 3, day: s.day + 20, cost: 0, done: false })
    const after = venueLife(s)!
    expect(after.booked).toBe(after.stats.ready)
    expect(after.upcoming[0].here).toBe(true)
    expect(after.draw).toBeGreaterThan(0.5)
    expect(after.draw).toBeLessThanOrEqual(1)
  })
})

describe('labels and cards', () => {
  it('stay wholly on screen at every edge', () => {
    const W = 900
    const H = 600
    for (const how of ['above', 'beside'] as const) {
      for (const [px, py] of [[-50, 300], [950, 300], [450, -40], [450, 700], [3, 3], [897, 597], [450, 300]]) {
        const [x, y] = placeBeside(px, py, 264, 320, W, H, how)
        expect(x).toBeGreaterThanOrEqual(8)
        expect(y).toBeGreaterThanOrEqual(50)
        expect(x + 264).toBeLessThanOrEqual(W - 8)
        expect(y + 320).toBeLessThanOrEqual(H - 46)
      }
    }
    // with room on the right a card sits to the right of its object; without, to the left
    expect(placeBeside(300, 300, 264, 320, W, H, 'beside')[0]).toBe(314)
    expect(placeBeside(800, 300, 264, 320, W, H, 'beside')[0]).toBe(800 - 14 - 264)
  })
})

describe('curved rooms', () => {
  it('keep people off the curve and out of the walls, in a round room and in a ring', () => {
    const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 11 })
    s.venue = null
    // a business-park plot with room for both
    for (const shape of ['round', 'ring'] as const) {
      const g = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 11 })
      g.office.items = []
      g.office.rooms = []
      g.office.walls = []
      g.office.grid = g.office.grid.map(() => 0)
      // the garage lot is too small for a ring: stretch the plot
      g.office.w = 30
      g.office.h = 24
      g.office.grid = new Array(30 * 24).fill(0)
      expect(zoneRoom(g, 'office', 'lounge', 4, 3, 19, 18, shape, undefined, { thick: 4 })).toBeNull()
      const site = g.office
      const nav = buildNav(site)
      const curve = curveTiles(site)
      expect(curve.size).toBeGreaterThan(8)
      const room = site.rooms[0].n
      let inside = 0
      let stranded = 0
      for (let i = 0; i < site.grid.length; i++) {
        const key = `${i % site.w},${Math.floor(i / site.w)}`
        // nobody stands where the curved wall runs, unless that tile is the doorway
        if (curve.has(key) && !nav.narrow[i]) expect(nav.walk[i]).toBe(0)
        if (site.grid[i] === room && nav.walk[i] && !nav.narrow[i]) {
          inside++
          if (!nav.reach[i]) stranded++
        }
      }
      expect(inside).toBeGreaterThan(20)
      // the automatic door lets everyone in the room out to the street
      expect(stranded).toBe(0)
      // and the only way between the room and the ground outside is through a doorway tile
      for (let i = 0; i < site.grid.length; i++) {
        if (!nav.walk[i] || nav.narrow[i]) continue
        const x = i % site.w
        for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
          if (x + dx >= site.w) continue
          const j = i + dx + dy * site.w
          if (j >= site.grid.length || !nav.walk[j] || nav.narrow[j]) continue
          if (nav.step(i, dx, dy)) expect((site.grid[i] === room) === (site.grid[j] === room)).toBe(true)
        }
      }
    }
  })
})
