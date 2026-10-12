import { describe, expect, it } from 'vitest'
import { areaTiles, autoDoor, newSite, zone } from '../../sim/sites'
import type { Site } from '../../sim/types'
import { Body, Crowd, GAP, GAP_FIXED, Kind, Mode } from './crowd'
import { buildNav } from './nav'
import { bigOffice, crowdFor } from './scene.fixture'
import { USE, buildSpots } from './spots'

/** A crowd whose people can be sent to a tile by hand. */
class Lab extends Crowd {
  add(tile: number, k: number): Body {
    const b = new Body()
    b.id = `p${k}`
    // guests have no errands of their own, so they go where they are told and stay there
    b.kind = Kind.Guest
    b.seed = 31 + k * 7
    b.look = k * 131
    b.x = this.nav.cx(tile)
    b.z = this.nav.cz(tile)
    b.mode = Mode.Do
    this.bodies.push(b)
    this.claimTile(b, tile)
    return b
  }
  send(b: Body, tile: number) {
    this.aimTile(b, tile)
    this.depart(b)
  }
  /** Stands someone in a spot on the furniture, as if they had walked there. */
  put(k: number, key: string): Body {
    const b = new Body()
    b.id = `s${k}`
    b.kind = Kind.Guest
    b.seed = 77 + k * 5
    b.look = k * 311
    this.bodies.push(b)
    this.place(b, this.spots.find((s) => s.key === key)!)
    return b
  }
}

function lab(site: Site) {
  const nav = buildNav(site)
  const crowd = new Lab()
  crowd.setSite(site, nav, buildSpots(site, nav))
  return { crowd, nav, tile: (x: number, y: number) => y * site.w + x }
}

const arrived = (crowd: Lab, goals: Map<Body, number>) => [...goals].every(([b, t]) => b.mode === Mode.Do && crowd.nav.tileAt(b.x, b.z) === t)

describe('keeping out of the way of others', () => {
  it('lets two groups pass in a corridor one tile wide', () => {
    const site = newSite('office', 2)
    // a room at each end of a corridor ten tiles long and one wide, all one space
    zone(site, 'work', [...areaTiles(2, 4, 4, 6), ...areaTiles(5, 5, 14, 5), ...areaTiles(15, 4, 17, 6)])
    const { crowd, tile } = lab(site)
    const left = [tile(2, 4), tile(2, 5), tile(2, 6), tile(3, 4), tile(3, 6)]
    const right = [tile(17, 4), tile(17, 5), tile(17, 6), tile(16, 4), tile(16, 6)]
    const goals = new Map<Body, number>()
    left.forEach((t, i) => goals.set(crowd.add(t, i), right[i]))
    right.forEach((t, i) => goals.set(crowd.add(t, i + 10), left[i]))
    for (const [b, t] of goals) crowd.send(b, t)
    let closest = Infinity
    let took = -1
    for (let k = 0; k < 60 * 30 && took < 0; k++) {
      crowd.step(1 / 30, 1, 10)
      closest = Math.min(closest, crowd.closest().d)
      if (arrived(crowd, goals)) took = k / 30
    }
    expect(took).toBeGreaterThan(0)
    expect(took).toBeLessThan(40)
    // nobody walked through anybody, and nobody had to be let through as a last resort
    expect(closest).toBeGreaterThan(GAP - 0.07)
    expect(crowd.ghosts).toBe(0)
  })

  it('takes a doorway one at a time, from both sides, without anyone getting stuck', () => {
    const site = newSite('office', 2)
    const a = zone(site, 'work', areaTiles(2, 3, 6, 7)).room!
    zone(site, 'lounge', areaTiles(7, 3, 11, 7))
    autoDoor(site, a.n)
    // a single door between the two rooms, and none to the outside in the way
    site.walls = [{ id: 'w1', x: 7, y: 5, side: 'w', kind: 'door' }]
    site.rev++
    const { crowd, tile, nav } = lab(site)
    expect(nav.zone[tile(3, 4)]).toBe(nav.zone[tile(10, 4)])
    const west = [tile(2, 3), tile(2, 5), tile(2, 7), tile(4, 3), tile(4, 7), tile(3, 5)]
    const east = [tile(11, 3), tile(11, 5), tile(11, 7), tile(9, 3), tile(9, 7), tile(10, 5)]
    const goals = new Map<Body, number>()
    west.forEach((t, i) => goals.set(crowd.add(t, i), east[i]))
    east.forEach((t, i) => goals.set(crowd.add(t, i + 10), west[i]))
    for (const [b, t] of goals) crowd.send(b, t)
    let both = 0
    let closest = Infinity
    let took = -1
    for (let k = 0; k < 60 * 30 && took < 0; k++) {
      crowd.step(1 / 30, 1, 10)
      closest = Math.min(closest, crowd.closest().d)
      // never two people in the door frame at once
      both = Math.max(both, crowd.bodies.filter((b) => Math.abs(b.x - nav.doors[0].cx) < 0.3 && Math.abs(b.z - nav.doors[0].cz) < 0.45).length)
      if (arrived(crowd, goals)) took = k / 30
    }
    expect(took).toBeGreaterThan(0)
    expect(both).toBe(1)
    expect(closest).toBeGreaterThan(GAP - 0.07)
    expect(crowd.ghosts).toBe(0)
  })

  it('gives someone standing at a counter the same room as anyone else', () => {
    const site = newSite('office', 2)
    // a lobby two tiles deep with a reception desk against its north wall: the way from one end to the other passes whoever stands at the desk
    zone(site, 'lobby', areaTiles(2, 4, 13, 6))
    site.items.push({ id: 'r1', kind: 'reception', x: 7, y: 4, rot: 0 })
    site.rev++
    const { crowd, tile } = lab(site)
    const visitor = crowd.put(0, 'r1:0')
    expect(visitor.spot?.open).toBe(true)
    const goals = new Map<Body, number>()
    const west = [tile(2, 5), tile(2, 6), tile(3, 5), tile(3, 6)]
    const east = [tile(13, 5), tile(13, 6), tile(12, 5), tile(12, 6)]
    west.forEach((t, i) => goals.set(crowd.add(t, i), east[i]))
    east.forEach((t, i) => goals.set(crowd.add(t, i + 10), west[i]))
    for (const [b, t] of goals) crowd.send(b, t)
    let nearest = Infinity
    let took = -1
    for (let k = 0; k < 60 * 30 && took < 0; k++) {
      crowd.step(1 / 30, 1, 10)
      for (const b of goals.keys()) nearest = Math.min(nearest, Math.hypot(b.x - visitor.x, b.z - visitor.z))
      if (arrived(crowd, goals)) took = k / 30
    }
    expect(took).toBeGreaterThan(0)
    // nobody brushed past closer than they would pass another walker, and the visitor was not shoved off their spot
    expect(nearest).toBeGreaterThan(GAP - 0.03)
    expect(visitor.spot?.key).toBe('r1:0')
    expect(crowd.ghosts).toBe(0)
  })

  it('brings the receptionist in by the end of a counter that has its back to a wall, and leaves the desk unmanned if there is no way in at all', () => {
    const site = newSite('office', 2)
    zone(site, 'lobby', areaTiles(2, 4, 13, 6))
    // the counter faces south into the room; behind it is the wall
    site.items.push({ id: 'r1', kind: 'reception', x: 7, y: 4, rot: 0 })
    site.rev++
    let { crowd, nav, tile } = lab(site)
    const desk = crowd.spots.find((s) => s.use & USE.front)!
    expect(desk).toBeDefined()
    // stepped into from the tile at one end, and round behind the counter from there: not across it
    expect([tile(6, 4), tile(9, 4)]).toContain(desk.access)
    expect(desk.via!.length).toBe(3)
    const behind = 4 - site.h / 2 + 0.5
    expect(desk.via![2]).toBeLessThan(behind - 0.3)
    expect(desk.z).toBeLessThan(behind - 0.3)
    expect(nav.walk[desk.access]).toBe(1)
    // both ends boxed in as well: nobody is dropped in behind it
    site.items.push({ id: 'p1', kind: 'plant', x: 6, y: 4, rot: 0 }, { id: 'p2', kind: 'plant', x: 9, y: 4, rot: 0 })
    site.rev++
    ;({ crowd, nav, tile } = lab(site))
    expect(crowd.spots.some((s) => s.use & USE.front)).toBe(false)
    expect(crowd.fronts.length).toBe(0)
  })

  it('uses both leaves of a double door when there is a queue', () => {
    const site = newSite('office', 2)
    const a = zone(site, 'work', areaTiles(2, 3, 6, 8)).room!
    zone(site, 'lounge', areaTiles(7, 3, 11, 8))
    autoDoor(site, a.n)
    site.walls = [
      { id: 'w1', x: 7, y: 5, side: 'w', kind: 'door' },
      { id: 'w2', x: 7, y: 6, side: 'w', kind: 'door' },
    ]
    site.rev++
    const { crowd, tile, nav } = lab(site)
    const goals = new Map<Body, number>()
    // everyone starts on one side, nearer the first leaf than the second
    const from = [tile(2, 3), tile(3, 3), tile(4, 3), tile(5, 3), tile(2, 4), tile(3, 4), tile(4, 4), tile(5, 4), tile(2, 5), tile(3, 5)]
    const to = [tile(11, 3), tile(10, 3), tile(9, 3), tile(8, 3), tile(11, 4), tile(10, 4), tile(9, 4), tile(8, 4), tile(11, 5), tile(10, 5)]
    from.forEach((t, i) => goals.set(crowd.add(t, i), to[i]))
    for (const [b, t] of goals) crowd.send(b, t)
    const through = [new Set<string>(), new Set<string>()]
    let took = -1
    for (let k = 0; k < 60 * 30 && took < 0; k++) {
      crowd.step(1 / 30, 1, 10)
      for (const b of crowd.bodies) nav.doors.forEach((d, i) => Math.abs(b.x - d.cx) < 0.2 && Math.abs(b.z - d.cz) < 0.3 && through[i].add(b.id))
      if (arrived(crowd, goals)) took = k / 30
    }
    expect(took).toBeGreaterThan(0)
    expect(through[0].size).toBeGreaterThan(1)
    expect(through[1].size).toBeGreaterThan(1)
    expect(crowd.ghosts).toBe(0)
  })

  it('lets a whole office out through one door in good time when home time comes for everyone at once', () => {
    for (const seed of [5, 8]) {
      const s = bigOffice(60, seed)
      const { crowd } = crowdFor(s)
      const began = new Map<string, number>()
      let worst = 0
      let step = 0
      for (let t = 9; t < 22; t += 1 / 30 / 45) {
        // the clock is put on from mid-afternoon to the evening: everybody is due home at the same moment
        if (t > 15 && t < 19.5) t = 19.5
        crowd.step(1 / 30, 1, t)
        step++
        for (const b of crowd.bodies) {
          if (b.kind !== Kind.Staff) continue
          if (b.leaving && !began.has(b.id)) began.set(b.id, step)
          else if (b.mode === Mode.Off && (began.get(b.id) ?? -1) > 0) {
            worst = Math.max(worst, (step - began.get(b.id)!) / 30)
            began.set(b.id, -1)
          }
        }
      }
      expect(began.size).toBe(60)
      expect([...began.values()].every((v) => v === -1)).toBe(true)
      // the walk from a desk to the street, door queue and all: it used to take up to a minute and a half
      expect(worst).toBeLessThan(45)
      expect(crowd.ghosts).toBe(0)
    }
  })

  it('keeps a whole office apart through a working day', () => {
    const s = bigOffice(60)
    const { crowd } = crowdFor(s)
    let closest = Infinity
    let who = ''
    let steps = 0
    let near = 0
    for (let t = 7; t < 19; t += 1 / 30 / 45) {
      crowd.step(1 / 30, 1, t)
      const c = crowd.closest()
      steps++
      if (c.d < GAP_FIXED - 0.04) near++
      if (c.d < closest) {
        closest = c.d
        who = `${c.a?.mode}/${c.a?.spot?.item.kind ?? '-'} ${c.b?.mode}/${c.b?.spot?.item.kind ?? '-'} at ${t.toFixed(2)}`
      }
    }
    console.log(`DAY closest=${closest.toFixed(3)} (${who}) near=${near}/${steps} ghosts=${crowd.ghosts}`)
    expect(closest).toBeGreaterThan(GAP_FIXED - 0.08)
    expect(crowd.ghosts).toBeLessThanOrEqual(2)
  })
})
