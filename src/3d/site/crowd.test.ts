import { describe, expect, it } from 'vitest'
import { autoTeams, defaultConfig, hire, newGame, placeItem, setEdge, tick, upgradeOffice, zoneRoom } from '../../sim/game'
import { factoryLife, officeLife } from '../../sim/life'
import { refreshCandidates, seatedStaff } from '../../sim/staff'
import type { GameState } from '../../sim/types'
import { Act, Crowd, Kind, Mode } from './crowd'
import { buildNav } from './nav'
import { seatOwners } from './seats'
import { buildSpots } from './spots'

/** A garage company with a lounge next door and enough people to fill the desks. */
function company(): GameState {
  const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 11 })
  // starter room is tiles 3..10 x 2..6 with its door on the south side; add a lounge to the east of the plot's free strip
  expect(zoneRoom(s, 'office', 'lounge', 11, 2, 13, 6)).toBeNull()
  expect(setEdge(s, 'office', 11, 4, 'w', 'door')).toBeNull()
  expect(placeItem(s, 'office', 'cafe', 12, 3, 0)).toBeNull()
  expect(placeItem(s, 'office', 'desk', 8, 3, 0)).toBeNull()
  while (s.staff.length < 3) {
    refreshCandidates(s)
    expect(hire(s, s.candidates[0].id)).toBeNull()
  }
  autoTeams(s)
  return s
}

function crowdFor(s: GameState) {
  const site = s.office
  const nav = buildNav(site)
  const crowd = new Crowd()
  crowd.setSite(site, nav, buildSpots(site, nav))
  const owners = seatOwners(site, seatedStaff(s))
  const entries = site.items.filter((i) => owners.has(i.id)).map((i) => ({ e: owners.get(i.id)!, seat: i.id }))
  crowd.setStaff(entries, officeLife(s), s.day, new Set(s.staff.map((e) => e.id)))
  return { crowd, nav, site }
}

describe('walking map', () => {
  it('joins rooms through doors only, and keeps furniture out of the way', () => {
    const s = company()
    const { nav, site } = crowdFor(s)
    const tile = (x: number, y: number) => y * site.w + x
    expect(nav.entry).toBeGreaterThanOrEqual(0)
    // a desk is not somewhere to stand; the floor in front of it is
    expect(nav.walk[tile(4, 3)]).toBe(0)
    expect(nav.walk[tile(4, 4)]).toBe(1)
    // the room and the lounge are one stretch of floor, reachable from the street
    expect(nav.reach[tile(4, 4)]).toBe(1)
    expect(nav.reach[tile(12, 5)]).toBe(1)
    const out = new Int16Array(400)
    const n = nav.find(tile(4, 4), tile(12, 5), out)
    expect(n).toBeGreaterThan(0)
    // every step is to a neighbouring tile that can be stood on
    let prev = tile(4, 4)
    for (let i = 0; i < n; i++) {
      const t = out[i]
      expect(nav.walk[t]).toBe(1)
      expect(Math.abs((t % site.w) - (prev % site.w))).toBeLessThanOrEqual(1)
      expect(Math.abs(Math.floor(t / site.w) - Math.floor(prev / site.w))).toBeLessThanOrEqual(1)
      prev = t
    }
    // the way from the work room to the lounge goes through the door between them, not through the wall
    const crossings = [...out.slice(0, n)].filter((t, i) => (t % site.w) >= 11 && ((i ? out[i - 1] : tile(4, 4)) % site.w) < 11)
    expect(crossings.length).toBe(1)
    expect(Math.floor(crossings[0] / site.w)).toBe(4)
  })

  it('treats a room whose only door is blocked as cut off', () => {
    const s = company()
    // wall up the door the lounge was given to the outside, leaving only the one from the work room
    for (const w of [...s.office.walls]) if (w.kind === 'door' && w.x >= 11 && !(w.x === 11 && w.y === 4 && w.side === 'w')) expect(setEdge(s, 'office', w.x, w.y, w.side, 'wall')).toBeNull()
    expect(buildNav(s.office).reach[5 * s.office.w + 12]).toBe(1)
    // then stand a plant right inside that door
    expect(placeItem(s, 'office', 'plant', 11, 4, 0)).toBeNull()
    const nav = buildNav(s.office)
    expect(nav.reach[5 * s.office.w + 12]).toBe(0)
    expect(nav.zone[5 * s.office.w + 12]).not.toBe(nav.zone[4 * s.office.w + 4])
  })
})

describe('the crowd', () => {
  it('has people at their desks by mid-morning and gone at night', () => {
    const s = company()
    const { crowd } = crowdFor(s)
    const staff = () => crowd.bodies.filter((b) => b.kind === Kind.Staff)
    // start before anyone is in, and run through to mid-morning
    let t = 6
    for (; t < 9.4; t += 1 / 900) crowd.step(0.1, 1, t)
    expect(staff().length).toBe(3)
    for (const b of staff()) {
      expect(b.onSite).toBe(true)
      expect([Act.Desk, Act.Coffee, Act.Meet, Act.Station]).toContain(b.act)
    }
    // everybody who is working is sitting in their own chair
    for (const b of staff()) if (b.act === Act.Desk && b.mode === Mode.Do) expect(b.spot).toBe(b.seat)
    for (; t < 23; t += 1 / 900) crowd.step(0.1, 1, t)
    for (const b of staff()) expect(b.mode).toBe(Mode.Off)
  })

  it('sends someone who has left the company out of the door', () => {
    const s = company()
    const { crowd } = crowdFor(s)
    let t = 10
    for (let i = 0; i < 50; i++) crowd.step(0.1, 1, (t += 1 / 900))
    const gone = s.staff[0]
    s.staff = s.staff.filter((e) => e !== gone)
    const owners = seatOwners(s.office, seatedStaff(s))
    crowd.setStaff(s.office.items.filter((i) => owners.has(i.id)).map((i) => ({ e: owners.get(i.id)!, seat: i.id })), officeLife(s), s.day, new Set(s.staff.map((e) => e.id)))
    const ghost = crowd.bodies.find((b) => b.id === gone.id)!
    expect(ghost.quit).toBe(true)
    for (let i = 0; i < 1200 && crowd.bodies.includes(ghost); i++) crowd.step(0.1, 1, (t += 1 / 900))
    expect(crowd.bodies.includes(ghost)).toBe(false)
    // nobody else moved desks because of it
    expect(crowd.bodies.filter((b) => b.kind === Kind.Staff).length).toBe(2)
  })
})

describe('what the rooms show', () => {
  it('reads the game without changing it', () => {
    const s = company()
    tick(s, 40)
    const before = JSON.stringify(s)
    officeLife(s)
    factoryLife(s)
    expect(JSON.stringify(s)).toBe(before)
  })
})

describe('curved rooms', () => {
  it('can be walked into through the door in the curved wall', () => {
    const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 11 })
    for (let i = 0; i < 2; i++) upgradeOffice(s)
    const free = s.office.h - 12
    expect(zoneRoom(s, 'office', 'lounge', 1, free, 9, free + 8, 'round')).toBeNull()
    const nav = buildNav(s.office)
    const middle = (free + 4) * s.office.w + 5
    expect(nav.walk[middle]).toBe(1)
    expect(nav.reach[middle]).toBe(1)
  })
})
