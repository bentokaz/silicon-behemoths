import { describe, expect, it } from 'vitest'
import { autoLine, buildFactory, defaultConfig, newGame, placeItem, zoneRoom } from '../../sim/game'
import { lineStats } from '../../sim/sites'
import type { Site } from '../../sim/types'
import { Kind, Mode, Tool } from './crowd'
import { Crew, FactoryCrowd, Job, SHIFT, rosterFor } from './factorycrowd'
import { buildNav } from './nav'
import { buildSpots } from './spots'

/** A plant with the starter line, a few racks to fetch from, and a crew room with a table. */
function plant(): Site {
  const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 3 })
  for (let i = 0; i < 2; i++) expect(buildFactory(s)).toBeNull()
  expect(autoLine(s)).toBeNull()
  // the starter hall stands at x 3-18, y 7-12: a crew room beside it, and pallets on the hall floor in front of the line
  expect(zoneRoom(s, 'factory', 'crew', 20, 7, 24, 11)).toBeNull()
  expect(placeItem(s, 'factory', 'canteen', 21, 8, 0)).toBeNull()
  const site = s.factory!
  const hall = site.rooms.find((r) => r.type === 'hall')!
  let put = 0
  for (let y = 0; y < site.h && put < 2; y++) for (let x = 0; x < site.w && put < 2; x++) if (site.grid[y * site.w + x] === hall.n && !placeItem(s, 'factory', 'pallets', x, y, 0)) put++
  expect(put).toBe(2)
  return site
}

function shift(site: Site, running: boolean, cap = 24) {
  const nav = buildNav(site)
  const crowd = new FactoryCrowd()
  crowd.setSite(site, nav, buildSpots(site, nav))
  crowd.setLine(lineStats(site).linked, running, cap)
  return { crowd, nav }
}

const hands = (crowd: FactoryCrowd, job?: number, crew: number = Crew.Day) => crowd.bodies.filter((b) => b.kind === Kind.Hand && !b.quit && b.crew === crew && (job === undefined || b.job === job))
const run = (crowd: FactoryCrowd, from: number, to: number, each?: (t: number) => void) => {
  for (let t = from; t < to; t += 1 / 30 / 45) {
    crowd.step(1 / 30, 1, t)
    each?.(t)
  }
}

describe('a factory shift', () => {
  it('is as big as the line, and smaller when there is nothing to make', () => {
    expect(rosterFor(0, 1, true, 24)).toEqual({ operators: 0, supervisors: 0, haulers: 0 })
    expect(rosterFor(5, 1, true, 24)).toEqual({ operators: 5, supervisors: 1, haulers: 1 })
    expect(rosterFor(5, 1, false, 24)).toEqual({ operators: 2, supervisors: 0, haulers: 0 })
    expect(rosterFor(40, 3, true, 24)).toEqual({ operators: 24, supervisors: 0, haulers: 0 })
    const site = plant()
    const machines = site.items.filter((i) => ['smt', 'robot', 'manual', 'test', 'pack'].includes(i.kind) && lineStats(site).linked.has(i.id)).length
    expect(machines).toBeGreaterThan(2)
    const { crowd } = shift(site, true)
    expect(hands(crowd, Job.Operator).length).toBe(machines)
    expect(hands(crowd, Job.Supervisor).length).toBe(1)
    expect(hands(crowd, Job.Hauler).length).toBe(1)
    // each operator has a machine of the line to themselves
    const at = hands(crowd, Job.Operator).map((b) => b.station!.item.id)
    expect(new Set(at).size).toBe(machines)
    // the line makes devices round the clock while it has orders, so there is a night shift of the same size
    expect(hands(crowd, Job.Operator, Crew.Night).length).toBe(machines)
    expect(hands(crowd, Job.Hauler, Crew.Night).length).toBe(1)
    // the orders dry up: most of the day shift is sent home, and nobody works nights
    crowd.setLine(lineStats(site).linked, false, 24)
    expect(hands(crowd, Job.Operator).length).toBe(Math.ceil(machines / 3))
    expect(hands(crowd, Job.Hauler).length).toBe(0)
    expect(hands(crowd, undefined, Crew.Night).length).toBe(0)
  })

  it('comes in for the morning, works the line, moves cartons to the dock and goes home', () => {
    const site = plant()
    const { crowd, nav } = shift(site, true)
    // before the day shift nobody of it is in: the night shift has the floor
    run(crowd, 5.5, 6)
    expect(hands(crowd).every((b) => b.mode === Mode.Off)).toBe(true)
    expect(hands(crowd, Job.Operator, Crew.Night).every((b) => b.mode === Mode.Do && b.spot === b.station)).toBe(true)
    let arriving = 0
    run(crowd, 6, 8.5, () => {
      arriving = Math.max(arriving, hands(crowd).filter((b) => b.mode === Mode.In || b.mode === Mode.Walk).length)
    })
    // the night shift has handed over and gone home
    expect(hands(crowd, undefined, Crew.Night).every((b) => b.mode === Mode.Off)).toBe(true)
    // they walked in rather than appearing, and every operator is at their own machine
    expect(arriving).toBeGreaterThan(1)
    for (const b of hands(crowd, Job.Operator)) {
      expect(b.mode).toBe(Mode.Do)
      expect(b.spot).toBe(b.station)
    }
    // the hall they are in counts as occupied, so its lights are on
    const heads = new Map<number, number>()
    crowd.headcount(heads)
    const hall = site.rooms.find((r) => r.type === 'hall')!.n
    expect(heads.get(hall) ?? 0).toBeGreaterThan(2)
    // through the morning the hand with the pallet truck makes the trip to the dock and back, loaded one way
    const hauler = hands(crowd, Job.Hauler)[0]
    expect(hauler.tool).toBe(Tool.Jack)
    let loads = 0
    let last = false
    const seen = new Set<string>()
    let supervisorTiles = new Set<number>()
    const boss = hands(crowd, Job.Supervisor)[0]
    run(crowd, 8.5, 11, () => {
      const now = FactoryCrowd.loaded(hauler)
      if (now && !last) loads++
      last = now
      if (hauler.spot) seen.add(hauler.spot.item.kind)
      if (boss.mode === Mode.Do) supervisorTiles.add(nav.tileAt(boss.x, boss.z))
    })
    expect(loads).toBeGreaterThan(2)
    expect(seen.has('dock_out')).toBe(true)
    expect([...seen].some((k) => k === 'pallets' || k === 'rack' || k === 'pack')).toBe(true)
    expect(supervisorTiles.size).toBeGreaterThan(2)
    // lunch at the canteen table for some of them
    let atTable = 0
    run(crowd, 11, 13.5, () => {
      atTable = Math.max(atTable, crowd.bodies.filter((b) => b.spot?.item.kind === 'canteen').length)
    })
    expect(atTable).toBeGreaterThan(0)
    // by the evening the day shift has gone and the night shift is at the machines: the line never stands unattended
    let unattended = 0
    run(crowd, 13.5, SHIFT.end + 1.2, () => {
      crowd.headcount(heads)
      if (!(heads.get(hall) ?? 0)) unattended++
    })
    expect(unattended).toBe(0)
    expect(hands(crowd).every((b) => b.mode === Mode.Off)).toBe(true)
    expect(hands(crowd, Job.Operator, Crew.Night).every((b) => b.mode === Mode.Do && b.spot === b.station)).toBe(true)
    expect(crowd.ghosts).toBe(0)
  })

  it('stands empty at night when the line has no orders', () => {
    const site = plant()
    const { crowd } = shift(site, false)
    run(crowd, 9, 10)
    expect(hands(crowd).filter((b) => b.mode !== Mode.Off).length).toBeGreaterThan(0)
    run(crowd, 10, SHIFT.end + 1.2)
    expect(crowd.bodies.every((b) => b.mode === Mode.Off)).toBe(true)
    const heads = new Map<number, number>()
    crowd.headcount(heads)
    expect([...heads.values()].reduce((a, n) => a + n, 0)).toBe(0)
  })

  it('stands people where they can be walked to: at the back of a machine whose front is boxed in', () => {
    const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 3 })
    for (let i = 0; i < 2; i++) expect(buildFactory(s)).toBeNull()
    expect(autoLine(s)).toBeNull()
    const site = s.factory!
    const before = buildSpots(site, buildNav(site))
    const smt = site.items.find((i) => i.kind === 'smt')!
    const front = before.find((sp) => sp.item === smt)!
    expect(front.z).toBeGreaterThan(smt.y - site.h / 2 + 0.5)
    // pallets along the whole front of the board line
    for (let x = smt.x - 1; x <= smt.x + 3; x++) placeItem(s, 'factory', 'pallets', x, smt.y + 1, 0)
    const nav = buildNav(site)
    const after = buildSpots(site, nav).find((sp) => sp.item === smt)!
    expect(after.access).toBeGreaterThanOrEqual(0)
    expect(Math.floor(after.access / site.w)).toBe(smt.y - 1)
    expect(after.z).toBeLessThan(smt.y - site.h / 2 + 0.5)
    // and the pallet truck stops short of the dock: its forks reach 1.28 m ahead of whoever pushes it
    const dock = site.items.find((i) => i.kind === 'dock_out')!
    const drop = before.find((sp) => sp.item === dock)!
    expect(drop.z - (dock.y - site.h / 2 + 0.5)).toBeGreaterThan(1.28 + 0.5)
  })

  it('finds the shift already at work on a first look in the middle of the day', () => {
    const { crowd } = shift(plant(), true)
    crowd.step(1 / 30, 1, 10)
    expect(hands(crowd, Job.Operator).every((b) => b.mode === Mode.Do && b.spot === b.station)).toBe(true)
  })
})
