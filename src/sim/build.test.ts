// Building tools: rows of furniture and runs of wall in one action, rooms that
// join, curved walls shared between rooms, ground finishes that suit the plot,
// and copying a store's layout.
import { describe, expect, it } from 'vitest'
import { buildNav, cutOffRooms } from '../3d/site/nav'
import { bayBeyond, bayRun, bayStands, curveAt, curveTiles, geomOf } from './curves'
import { DIFFICULTY, EDGE_COST, SAME_LAYOUT, clearZone, copyLayout, defaultConfig, fillRoom, layoutQuote, layoutSig, layoutValue, newGame, newLayoutQuote, openStore, paintArea, paintFloor, placeItem, placeItems, removeItems, removeRoom, setEdge, setEdges, setLook, setRoomStyle, upgradeOffice, zonePlan, zoneRoom, zoneable } from './game'
import { FILL_MAX, FILL_SHARE, ITEMS, SHORT_WALL, SITE_TIERS, canPlace, defaultGround, doorFits, edgeRuns, fillError, gridAt, groundAt, groundsFor, hasGround, isBoundary, newSite, openRooms, pocketAt, roomTiles, rowSpots, sealedRooms, storeStats, tidy, wallAt, wholeRun } from './sites'
import type { GameState, Site } from './types'

const fresh = (seed = 7, extra: Partial<ReturnType<typeof defaultConfig>> = {}) => newGame({ ...defaultConfig(), seed, ...extra })
const rich = (seed = 7) => fresh(seed, { unlimitedMoney: true })
/** A big empty campus to build on. */
function campus(tiers = 2): GameState {
  const s = rich()
  for (let i = 0; i < tiers; i++) upgradeOffice(s)
  removeRoom(s, 'office', s.office.rooms[0].n)
  s.office.items = []
  return s
}
const doors = (site: Site) => site.walls.filter((w) => w.kind === 'door').length + (site.curves ?? []).reduce((a, c) => a + Object.values(c.walls ?? {}).filter((k) => k === 'door').length, 0)
/** Every wall on the site, as its straight stretches and its curved pieces: each stretch has two different sides. */
function wallsClose(site: Site) {
  const curved = curveTiles(site)
  for (let y = 0; y <= site.h; y++) {
    for (let x = 0; x <= site.w; x++) {
      for (const side of ['n', 'w'] as const) {
        const runs = edgeRuns(site, x, y, side, curved)
        let covered = 0
        for (const r of runs) {
          expect(r.a).not.toBe(r.c)
          expect(r.u1).toBeGreaterThan(r.u0)
          covered += r.u1 - r.u0
        }
        expect(covered).toBeLessThanOrEqual(1 + 1e-9)
        // no curve near: the edge is walled exactly when the tiles either side differ
        const [bx, by] = side === 'n' ? [x, y - 1] : [x - 1, y]
        if (!curved.has(`${x},${y}`) && !curved.has(`${bx},${by}`) && !site.cuts?.[`${x},${y}`] && !site.cuts?.[`${bx},${by}`]) expect(runs.length === 1 && wholeRun(runs[0]), `${x},${y},${side}`).toBe(gridAt(site, x, y) !== gridAt(site, bx, by))
      }
    }
  }
}

describe('rows of furniture and runs of wall', () => {
  it('lays a row along the longer way of the drag, a footprint apart', () => {
    const desk = ITEMS.office.desk
    const sofa = ITEMS.office.sofa
    expect(rowSpots(desk, 3, 5, 7, 5, 0)).toEqual([[3, 5], [4, 5], [5, 5], [6, 5], [7, 5]])
    expect(rowSpots(desk, 3, 5, 3, 5, 0)).toEqual([[3, 5]])
    // a drag mostly down the plot runs down it, and a drag leftward runs left
    expect(rowSpots(desk, 3, 5, 4, 8, 0)).toEqual([[3, 5], [3, 6], [3, 7], [3, 8]])
    expect(rowSpots(desk, 7, 5, 5, 5, 0)).toEqual([[7, 5], [6, 5], [5, 5]])
    // a sofa is two tiles long: side by side it steps two, turned a quarter it steps one
    expect(rowSpots(sofa, 2, 2, 8, 2, 0)).toEqual([[2, 2], [4, 2], [6, 2], [8, 2]])
    expect(rowSpots(sofa, 2, 2, 5, 2, 1)).toEqual([[2, 2], [3, 2], [4, 2], [5, 2]])
    expect(rowSpots(sofa, 2, 2, 2, 7, 1)).toEqual([[2, 2], [2, 4], [2, 6]])
    expect(rowSpots(sofa, 2, 2, 2, 5, 3)).toEqual([[2, 2], [2, 4]])
    expect(rowSpots(ITEMS.office.fountain, 0, 0, 7, 1, 0)).toEqual([[0, 0], [3, 0], [6, 0]])
  })

  it('places a row in one action and charges only for what went down', () => {
    const s = fresh()
    // the garage is tiles 3..10 x 2..6, with desks at 4,3 and 6,3
    const rev = s.office.rev
    let cash = s.cash
    const row = placeItems(s, 'office', 'desk', 3, 5, 10, 5, 0)
    expect(row).toEqual({ done: 8, skipped: 0, short: 0, cost: 8 * 1200, error: null })
    expect(s.cash).toBe(cash - 8 * 1200)
    expect(s.office.rev).toBe(rev + 1)
    expect(new Set(s.office.items.map((i) => i.id)).size).toBe(s.office.items.length)
    // spots where it cannot go are passed over, and the row carries on past them
    cash = s.cash
    const past = placeItems(s, 'office', 'desk', 3, 3, 12, 3, 0)
    expect(past.done).toBe(6)
    expect(past.skipped).toBe(4)
    expect(past.error).toBeNull()
    expect(s.cash).toBe(cash - 6 * 1200)
    // nowhere to go at all: the reason comes back and nothing is charged
    cash = s.cash
    const none = placeItems(s, 'office', 'desk', 3, 5, 10, 5, 0)
    expect(none.done).toBe(0)
    expect(none.error).toMatch(/already there/)
    expect(placeItems(s, 'office', 'bench', 3, 4, 9, 4, 0).error).toMatch(/goes in/)
    expect(s.cash).toBe(cash)
    expect(placeItems(s, 'office', 'nothing', 3, 4, 9, 4, 0).error).toMatch(/no such thing to place/)
    // money for three and a bit: three go down, and the result says so
    s.cash = -DIFFICULTY.normal.overdraft + 3 * 1200 + 500
    const short = placeItems(s, 'office', 'desk', 3, 4, 10, 4, 0)
    expect(short.done).toBe(3)
    expect(short.short).toBe(5)
    expect(short.cost).toBe(3600)
    expect(short.error).toBe('Placed 3 of 8: not enough cash for the rest')
    expect(s.cash).toBe(-DIFFICULTY.normal.overdraft + 500)
    expect(placeItems(s, 'office', 'desk', 6, 4, 10, 4, 0).error).toBe('Not enough cash: desk costs $1,200')
    // a single tile is a single item, the same as a click
    s.cash = 1e6
    expect(placeItems(s, 'office', 'desk', 6, 4, 6, 4, 0)).toMatchObject({ done: 1, cost: 1200, error: null })
    // selling a run gives half back for each
    const ids = s.office.items.filter((i) => i.kind === 'desk' && i.y === 5).map((i) => i.id)
    cash = s.cash
    const sold = removeItems(s, 'office', [...ids, 'no-such-item'])
    expect(sold).toMatchObject({ done: 8, cost: 8 * 600 })
    expect(s.cash).toBe(cash + 4800)
    expect(s.office.items.some((i) => i.y === 5 && i.kind === 'desk')).toBe(false)
    expect(JSON.parse(JSON.stringify(s.office))).toEqual(s.office)
  })

  it('glazes a run of wall, straight or curved, and does not charge twice', () => {
    const s = fresh()
    // the north wall of the garage: edges on the north of tiles 3..10 in row 2
    const north = [3, 4, 5, 6, 7, 8, 9, 10].map((x) => ({ x, y: 2, side: 'n' as const }))
    let cash = s.cash
    expect(setEdges(s, 'office', { edges: [...north, { x: 11, y: 2, side: 'n' }, { x: 5, y: 4, side: 'n' }] }, 'glass')).toEqual({ done: 8, skipped: 2, short: 0, cost: 8 * 120, error: null })
    expect(s.cash).toBe(cash - 960)
    expect(north.every((e) => wallAt(s.office, e.x, e.y, e.side)?.kind === 'glass')).toBe(true)
    // going over it again changes nothing and costs nothing
    cash = s.cash
    expect(setEdges(s, 'office', { edges: north }, 'glass')).toMatchObject({ done: 0, skipped: 8, cost: 0, error: null })
    expect(s.cash).toBe(cash)
    expect(setEdges(s, 'office', { edges: [{ x: 0, y: 0, side: 'n' }] }, 'door').error).toMatch(/no wall/)
    // doors along three of them, with money for two
    s.cash = -DIFFICULTY.normal.overdraft + 2 * EDGE_COST.door + 10
    const part = setEdges(s, 'office', { edges: north.slice(0, 3) }, 'door')
    expect(part).toMatchObject({ done: 2, short: 1, cost: 600, error: 'Changed 2 of 3: not enough cash for the rest' })
    expect(wallAt(s.office, 5, 2, 'n')?.kind).toBe('glass')
    // glazing a run passes over the doors in it (the garage's own is on the south wall); one stretch alone is changed
    s.cash = 1e6
    const south = [3, 4, 5, 6, 7, 8, 9, 10].map((x) => ({ x, y: 7, side: 'n' as const }))
    const way = south.find((e) => wallAt(s.office, e.x, e.y, e.side)?.kind === 'door')!
    expect(way).toBeDefined()
    expect(setEdges(s, 'office', { edges: south }, 'glass')).toMatchObject({ done: 7, skipped: 1, cost: 7 * 120, error: null })
    expect(wallAt(s.office, way.x, way.y, way.side)?.kind).toBe('door')
    expect(setEdges(s, 'office', { edges: [way] }, 'glass')).toMatchObject({ done: 1, cost: 120 })
    expect(wallAt(s.office, way.x, way.y, way.side)?.kind).toBe('glass')
    expect(setEdges(s, 'office', { edges: [way] }, 'door').done).toBe(1)
    // back to plain wall, free
    expect(setEdges(s, 'office', { edges: north }, 'wall')).toMatchObject({ done: 8, cost: 0, error: null })
    expect(s.office.walls.some((w) => w.y === 2 && w.side === 'n')).toBe(false)

    // ---- a round room: a run of bays along its curved wall
    const c = campus()
    expect(zoneRoom(c, 'office', 'atrium', 2, 2, 12, 12, 'round')).toBeNull()
    const curve = c.office.curves![0]
    const count = [...geomOf(curve).bays.values()].length
    expect(bayRun(curve, 'o3', 'o7')).toEqual(['o3', 'o4', 'o5', 'o6', 'o7'])
    expect(bayRun(curve, 'o7', 'o3')).toEqual(['o7', 'o6', 'o5', 'o4', 'o3'])
    // a closed wall is followed the short way round
    expect(bayRun(curve, 'o1', `o${count - 2}`)).toEqual(['o1', 'o0', `o${count - 1}`, `o${count - 2}`])
    expect(bayRun(curve, 'o3', 'i4')).toEqual([])
    expect(bayRun(curve, 'o3', 'o999')).toEqual([])
    const door = Object.keys(curve.walls!)[0]
    const run = bayRun(curve, 'o3', 'o9').filter((b) => b !== door)
    expect(setEdges(c, 'office', { curve: 0, bays: run }, 'glass')).toMatchObject({ done: run.length, cost: run.length * 120, error: null })
    expect(run.every((b) => curve.walls![b] === 'glass')).toBe(true)
    expect(setEdges(c, 'office', { curve: 0, bays: ['o999'] }, 'glass').error).toMatch(/no wall/)
    expect(setEdges(c, 'office', { curve: 0, bays: run }, 'wall')).toMatchObject({ done: run.length, cost: 0 })
    expect(Object.keys(curve.walls!)).toEqual([door])
    // an arc's wall has two ends, so its bays run straight from one to the other
    expect(bayRun({ cx: 2, cy: 44, rx: 14, ry: 14, t: 4, from: 270, sweep: 90 }, 'o1', 'o18')).toHaveLength(18)
  })
})

describe('rooms that join', () => {
  it('makes floor laid against a room of the same kind part of that room', () => {
    const s = campus()
    const site = s.office
    s.config.unlimitedMoney = false
    s.cash = 1e9
    expect(zoneRoom(s, 'office', 'work', 2, 2, 5, 5)).toBeNull()
    const a = site.rooms[0]
    setRoomStyle(s, 'office', a.n, 2)
    expect(doors(site)).toBe(1)
    expect(placeItem(s, 'office', 'desk', 5, 3, 0)).toBeNull()
    expect(isBoundary(site, 6, 3, 'w')).toBe(true)
    const cash = s.cash
    expect(zoneRoom(s, 'office', 'work', 6, 2, 9, 5)).toBeNull()
    // one room, the older one's number and finish; charged for the new floor alone
    expect(site.rooms).toHaveLength(1)
    expect(site.rooms[0]).toEqual({ n: a.n, type: 'work', style: 2 })
    expect(roomTiles(site, a.n)).toBe(32)
    expect(s.cash).toBe(cash - 16 * 350)
    // the wall between is gone, no second door was added, and furniture can stand across the old line
    expect(isBoundary(site, 6, 3, 'w')).toBe(false)
    expect(doors(site)).toBe(1)
    expect(sealedRooms(site)).toEqual([])
    expect(placeItem(s, 'office', 'exec', 5, 4, 0)).toMatch(/goes in/)
    expect(placeItem(s, 'office', 'pingpong', 5, 4, 0)).toMatch(/goes in/)
    expect(canPlace(site, 'desk', 6, 3, 0)).toBeNull()
    wallsClose(site)
    // a room of the same kind touching only at a corner stays its own room
    expect(zoneRoom(s, 'office', 'work', 10, 6, 12, 8)).toBeNull()
    expect(site.rooms).toHaveLength(2)
    // a different kind of room next door stays apart, of course
    expect(zoneRoom(s, 'office', 'lounge', 2, 6, 5, 8)).toBeNull()
    expect(site.rooms).toHaveLength(3)
    expect(isBoundary(site, 3, 6, 'n')).toBe(true)
    // and so does the same kind when asked to stand apart, with a wall between and a door of its own
    expect(zoneRoom(s, 'office', 'work', 6, 6, 9, 8, 'rect', undefined, undefined, true)).toBeNull()
    expect(site.rooms).toHaveLength(4)
    const apart = site.rooms[3]
    expect(apart.style).toBe(0)
    expect(isBoundary(site, 7, 6, 'n')).toBe(true)
    expect(openRooms(site).has(apart.n)).toBe(true)
    // asked to stand apart even when the drag began inside the first room
    expect(zoneRoom(s, 'office', 'work', 5, 2, 12, 2, 'rect', a.n, undefined, true)).toBeNull()
    expect(site.rooms).toHaveLength(5)
    expect(roomTiles(site, a.n)).toBe(32)
    wallsClose(site)
    expect(JSON.parse(JSON.stringify(site))).toEqual(site)
  })

  it('joins three rooms at once and drops the doors on the walls that go', () => {
    const s = campus()
    const site = s.office
    for (const x of [2, 6, 10]) expect(zoneRoom(s, 'office', 'meeting', x, 2, x + 2, 4)).toBeNull()
    const [a, b, c] = site.rooms
    setRoomStyle(s, 'office', b.n, 1)
    setRoomStyle(s, 'office', c.n, 2)
    expect(site.rooms).toHaveLength(3)
    // a table in each, and a glazed stretch and an extra door on the walls that face the gaps
    for (const x of [2, 6, 10]) expect(placeItem(s, 'office', 'meeting', x, 2, 0)).toBeNull()
    expect(setEdge(s, 'office', 6, 3, 'w', 'door')).toBeNull()
    expect(setEdge(s, 'office', 9, 3, 'w', 'glass')).toBeNull()
    expect(setEdge(s, 'office', 13, 3, 'w', 'glass')).toBeNull()
    const before = doors(site)
    expect(before).toBe(4)
    // fill the two gaps in one go: the new floor touches all three
    expect(zoneRoom(s, 'office', 'meeting', 5, 2, 9, 4)).toBeNull()
    expect(site.rooms).toHaveLength(1)
    expect(site.rooms[0]).toEqual({ n: a.n, type: 'meeting', style: 0 })
    expect(roomTiles(site, a.n)).toBe(33)
    expect(site.grid.includes(b.n) || site.grid.includes(c.n)).toBe(false)
    // the door and the glass on walls that are now inside the room are gone; the outside ones stay
    expect(wallAt(site, 6, 3, 'w')).toBeUndefined()
    expect(wallAt(site, 9, 3, 'w')).toBeUndefined()
    expect(wallAt(site, 13, 3, 'w')?.kind).toBe('glass')
    expect(doors(site)).toBe(3)
    expect(site.items.filter((i) => i.kind === 'meeting')).toHaveLength(3)
    expect(sealedRooms(site)).toEqual([])
    wallsClose(site)
    // one stretch of floor to walk on: every free tile of the room joins up
    const nav = buildNav(site)
    const zones = new Set<number>()
    site.grid.forEach((n, i) => n === a.n && nav.walk[i] && zones.add(nav.zone[i]))
    expect(zones.size).toBe(1)
    // two rooms whose only doors were on the wall they shared: the joined room is given a way in
    const t = campus()
    expect(zoneRoom(t, 'office', 'lab', 2, 2, 4, 4)).toBeNull()
    expect(zoneRoom(t, 'office', 'lab', 6, 2, 8, 4, 'rect', undefined, undefined, true)).toBeNull()
    for (const w of [...t.office.walls]) expect(setEdge(t, 'office', w.x, w.y, w.side, 'wall')).toBeNull()
    expect(sealedRooms(t.office)).toHaveLength(2)
    expect(zoneRoom(t, 'office', 'lab', 5, 2, 5, 4)).toBeNull()
    expect(t.office.rooms).toHaveLength(1)
    expect(doors(t.office)).toBe(1)
    expect(sealedRooms(t.office)).toEqual([])
    // starting the drag inside a room still extends it, across a gap if need be
    const first = t.office.rooms[0].n
    expect(zoneRoom(t, 'office', 'lab', 12, 2, 14, 4, 'rect', first)).toBeNull()
    expect(t.office.rooms).toHaveLength(1)
    expect(roomTiles(t.office, first)).toBe(30)
  })

  it('joins a straight room to a curved one, squaring only where they meet', () => {
    const s = campus()
    const site = s.office
    expect(zoneRoom(s, 'office', 'atrium', 2, 2, 12, 12, 'round')).toBeNull()
    const round = site.rooms[0]
    const edge = curveTiles(site).size
    const door = Object.keys(site.curves![0].walls!)
    expect(door).toHaveLength(1)
    expect(zoneRoom(s, 'office', 'atrium', 13, 5, 16, 9)).toBeNull()
    expect(site.rooms).toHaveLength(1)
    expect(site.rooms[0].n).toBe(round.n)
    // the curve still stands everywhere but against the new floor, and nothing is left half-walled
    expect(site.curves).toHaveLength(1)
    const squared = Object.keys(site.curves![0].square ?? {})
    expect(squared.length).toBeGreaterThan(0)
    expect(squared.length).toBeLessThan(8)
    expect(curveTiles(site).size).toBe(edge - squared.length)
    for (const key of squared) {
      const [x, y] = key.split(',').map(Number)
      expect(x).toBe(12)
      expect(curveAt(site, x, y)).toBeUndefined()
      expect(canPlace(site, 'otree', x, y, 0)).toBeNull()
    }
    expect(isBoundary(site, 13, 7, 'w')).toBe(false)
    expect(Object.keys(site.curves![0].walls!)).toEqual(door)
    expect(doors(site)).toBe(1)
    expect(sealedRooms(site)).toEqual([])
    wallsClose(site)
    const nav = buildNav(site)
    expect(nav.reach[7 * site.w + 15]).toBe(1)
    expect(nav.zone[7 * site.w + 15]).toBe(nav.zone[7 * site.w + 7])
    // a second curved room of the same kind drawn against the first joins it too
    expect(zoneRoom(s, 'office', 'atrium', 17, 4, 23, 10, 'round')).toBeNull()
    expect(site.rooms).toHaveLength(1)
    expect(site.curves).toHaveLength(2)
    expect(site.curves!.every((c) => c.room === round.n)).toBe(true)
    wallsClose(site)
    expect(JSON.parse(JSON.stringify(site))).toEqual(site)
  })
})

describe('curved walls between rooms', () => {
  it('lets a room fill a ring’s courtyard and share its inner wall', () => {
    const s = campus(4)
    const site = s.office
    expect(zoneRoom(s, 'office', 'work', 20, 4, 59, 43, 'ring', undefined, { thick: 6 })).toBeNull()
    const ring = site.rooms[0]
    const edge = curveTiles(site).size
    const inner = () => [...curveTiles(site).values()].filter((t) => Math.hypot(t.shape.x + 0.5 - 40, t.shape.y + 0.5 - 24) < 16.5)
    expect(inner().length).toBeGreaterThan(40)
    expect(inner().every((t) => t.beyond === 0)).toBe(true)
    expect(hasGround(site, 40, 10)).toBe(true)
    paintArea(s, 'office', 30, 14, 50, 34, 'rect', 'paving')
    // a lounge over the whole courtyard: the box takes every free tile inside the ring
    s.config.unlimitedMoney = false
    s.cash = 1e9
    expect(zoneRoom(s, 'office', 'lounge', 26, 10, 53, 37)).toBeNull()
    const lounge = site.rooms[1]
    expect(lounge.type).toBe('lounge')
    // charged by the whole tiles it took
    expect(1e9 - s.cash).toBe(roomTiles(site, lounge.n) * 420)
    s.config.unlimitedMoney = true
    // the ring keeps every bit of its curve, and the far side of the inner wall is now the lounge
    expect(site.curves).toHaveLength(1)
    expect(site.curves![0].square).toBeUndefined()
    expect(curveTiles(site).size).toBe(edge)
    expect(inner().every((t) => t.beyond === lounge.n)).toBe(true)
    expect([...curveTiles(site).values()].filter((t) => t.beyond === 0).length).toBeGreaterThan(40)
    expect(curveAt(site, 40, 10)?.beyond).toBe(lounge.n)
    // no straight wall is left between the lounge and the tiles the curve runs through
    wallsClose(site)
    const curved = curveTiles(site)
    for (const t of inner()) {
      for (const side of ['n', 'w'] as const) for (const r of edgeRuns(site, t.shape.x, t.shape.y, side, curved)) expect(r.a === 0 || r.c === 0, `${t.shape.x},${t.shape.y}`).toBe(false)
    }
    // the strip beyond the curve is floor now, not ground, and takes neither paint nor furniture
    expect(hasGround(site, 40, 10)).toBe(false)
    paintFloor(s, 'office', 40, 10, 'gravel')
    expect(site.floor['40,10']).toBeUndefined()
    expect(placeItem(s, 'office', 'sofa', 40, 10, 0)).toMatch(/curved wall/)
    expect(placeItem(s, 'office', 'sofa', 40, 12, 0)).toBeNull()
    // the lounge was given its way in through the shared wall, on its south side, and both rooms count as open
    const walls = site.curves![0].walls!
    const way = Object.entries(walls).find(([bay]) => bay.startsWith('i'))!
    expect(way[1]).toBe('door')
    expect(bayBeyond(site, 0, way[0])).toEqual([lounge.n])
    expect(geomOf(site.curves![0]).bays.get(way[0])!.ny).toBeLessThan(-0.9)
    expect(doors(site)).toBe(2)
    expect(sealedRooms(site)).toEqual([])
    // people can walk from the street through the ring into the lounge
    let nav = buildNav(site)
    const mid = 24 * site.w + 40
    expect(nav.walk[mid]).toBe(1)
    expect(nav.reach[mid]).toBe(1)
    // brick the shared door up and the lounge is sealed; glaze the bay and it still is; an opening lets people through again
    expect(setEdges(s, 'office', { curve: 0, bays: [way[0]] }, 'wall').done).toBe(1)
    expect(sealedRooms(site).map((r) => r.n)).toEqual([lounge.n])
    nav = buildNav(site)
    expect(nav.reach[mid]).toBe(0)
    expect(setEdges(s, 'office', { curve: 0, bays: bayRun(site.curves![0], 'i3', 'i6') }, 'glass').done).toBe(4)
    expect(sealedRooms(site).map((r) => r.n)).toEqual([lounge.n])
    expect(setEdges(s, 'office', { curve: 0, bays: ['i20'] }, 'open').done).toBe(1)
    expect(sealedRooms(site)).toEqual([])
    expect(buildNav(site).reach[mid]).toBe(1)
    expect(JSON.parse(JSON.stringify(site))).toEqual(site)
    // knock the lounge down and the inner wall faces open ground again, its glass and opening still in place
    removeRoom(s, 'office', lounge.n)
    expect(inner().every((t) => t.beyond === 0)).toBe(true)
    expect(site.curves![0].walls).toMatchObject({ i3: 'glass', i20: 'open' })
    expect(hasGround(site, 40, 10)).toBe(true)
    // floor of the ring's own kind laid in the courtyard joins the ring instead, and squares the wall it swallows
    expect(zoneRoom(s, 'office', 'work', 26, 10, 53, 37)).toBeNull()
    expect(site.rooms).toHaveLength(1)
    expect(site.rooms[0].n).toBe(ring.n)
    expect(inner()).toHaveLength(0)
    expect(curveTiles(site).size).toBeGreaterThan(60)
    expect(Object.keys(site.curves![0].walls!).every((b) => b.startsWith('o'))).toBe(true)
    wallsClose(site)
  })

  it('keeps a round room round when another room is wrapped about it', () => {
    const s = campus()
    const site = s.office
    expect(zoneRoom(s, 'office', 'server', 5, 5, 11, 11, 'round')).toBeNull()
    const round = site.rooms[0]
    const edge = curveTiles(site).size
    const tiles = roomTiles(site, round.n)
    expect(zoneRoom(s, 'office', 'soft', 3, 3, 13, 13)).toBeNull()
    const outer = site.rooms[1]
    expect(roomTiles(site, outer.n)).toBe(121 - tiles)
    expect(site.curves![0].square).toBeUndefined()
    expect(curveTiles(site).size).toBe(edge)
    expect([...curveTiles(site).values()].every((t) => t.beyond === outer.n)).toBe(true)
    wallsClose(site)
    const curved = curveTiles(site)
    // the only straight walls are the outer room's own four sides
    let straight = 0
    for (let y = 0; y <= site.h; y++) for (let x = 0; x <= site.w; x++) for (const side of ['n', 'w'] as const) for (const r of edgeRuns(site, x, y, side, curved)) straight += r.u1 - r.u0
    expect(straight).toBeCloseTo(44, 6)
    // the server room's door, cut when it stood alone, now leads into the room around it: both are open
    expect(Object.values(site.curves![0].walls!)).toEqual(['door'])
    expect(sealedRooms(site)).toEqual([])
    // (the outer room counts as open through that door, so it was not given one to the street: add it)
    expect(setEdge(s, 'office', 8, 14, 'n', 'door')).toBeNull()
    const nav = buildNav(site)
    expect(nav.reach[8 * site.w + 8]).toBe(1)
    expect(nav.reach[4 * site.w + 4]).toBe(1)
    // furniture keeps clear of the wall on both sides of it
    const [key] = [...curved.keys()]
    const [cx, cy] = key.split(',').map(Number)
    expect(canPlace(site, 'desk', cx, cy, 0)).toMatch(/curved wall/)
    expect(canPlace(site, 'server', cx, cy, 0)).toMatch(/curved wall/)
    expect(canPlace(site, 'server', 8, 8, 0)).toBeNull()
    expect(canPlace(site, 'desk', 3, 3, 0)).toBeNull()
    // a room against one side only shares the wall where it stands, and the rest still faces the open
    const t = campus()
    expect(zoneRoom(t, 'office', 'atrium', 2, 2, 12, 12, 'round')).toBeNull()
    expect(zoneRoom(t, 'office', 'lounge', 13, 4, 16, 10)).toBeNull()
    const lounge = t.office.rooms[1]
    const live = [...curveTiles(t.office).values()]
    expect(t.office.curves![0].square).toBeUndefined()
    expect(live.filter((x) => x.beyond === lounge.n).length).toBeGreaterThan(2)
    expect(live.filter((x) => x.beyond === lounge.n).every((x) => x.shape.x === 12)).toBe(true)
    expect(live.filter((x) => x.beyond === 0).length).toBeGreaterThan(20)
    wallsClose(t.office)
    // taking the lounge away again leaves the round room as it was
    clearZone(t, 'office', 13, 4, 16, 10)
    expect([...curveTiles(t.office).values()].every((x) => x.beyond === 0)).toBe(true)
    expect(curveTiles(t.office).size).toBe(live.length)
    // two different rooms side by side against the curve each share the stretch they stand against
    expect(zoneRoom(t, 'office', 'lounge', 13, 2, 16, 6)).toBeNull()
    expect(zoneRoom(t, 'office', 'gym', 13, 7, 16, 12)).toBeNull()
    expect(t.office.curves![0].square).toBeUndefined()
    expect(curveTiles(t.office).size).toBe(live.length)
    const far = new Set([...curveTiles(t.office).values()].map((x) => x.beyond))
    expect([...far].sort()).toEqual([0, t.office.rooms[1].n, t.office.rooms[2].n])
    wallsClose(t.office)
    expect(sealedRooms(t.office)).toEqual([])
  })

  it('carries a wall straight on to the curve instead of stepping round the corner the curve leaves', () => {
    // a lounge and a gym side by side against the east of a round room
    const s = campus()
    const site = s.office
    expect(zoneRoom(s, 'office', 'atrium', 2, 2, 12, 12, 'round')).toBeNull()
    expect(zoneRoom(s, 'office', 'lounge', 13, 2, 16, 6)).toBeNull()
    expect(zoneRoom(s, 'office', 'gym', 13, 7, 16, 12)).toBeNull()
    const [, lounge, gym] = site.rooms.map((r) => r.n)
    // the tile at 12,4 has open ground along the whole of its north side and the lounge along the whole of its
    // east side. The lounge's west wall comes down the line between the two, so the corner stays ground and the
    // wall runs on down it, where giving the corner to the lounge would turn the wall west for a metre and then
    // south again for a third of a metre: two corners and a stub
    expect(curveAt(site, 12, 4)!.beyond).toBe(0)
    expect(edgeRuns(site, 13, 4, 'w')).toEqual([{ a: lounge, c: 0, u0: 0, u1: 1 }])
    expect(edgeRuns(site, 12, 4, 'n')).toEqual([])
    expect(edgeRuns(site, 12, 4, 'w')).toEqual([])
    expect(hasGround(site, 12, 4)).toBe(true)
    // the same at the gym's far end
    expect(curveAt(site, 12, 10)!.beyond).toBe(0)
    expect(edgeRuns(site, 13, 10, 'w')).toEqual([{ a: gym, c: 0, u0: 0, u1: 1 }])
    // each room is closed against the curve by one return wall, and those two are the only short stretches of
    // straight wall on the site (but for a sliver under three centimetres where the two rooms' wall meets the curve)
    const curved = curveTiles(site)
    const stubs: string[] = []
    for (let y = 0; y <= site.h; y++) for (let x = 0; x <= site.w; x++) for (const side of ['n', 'w'] as const) for (const r of edgeRuns(site, x, y, side, curved)) if (!wholeRun(r) && r.u1 - r.u0 >= 0.03) stubs.push(`${x},${y},${side}:${r.a}/${r.c}:${r.u0.toFixed(2)}-${r.u1.toFixed(2)}`)
    expect(stubs).toEqual([`12,5,n:${lounge}/0:0.39-1.00`, `12,10,n:0/${gym}:0.39-1.00`])
    // further round, each still shares the curve where it stands against it
    expect([5, 6].map((y) => curveAt(site, 12, y)!.beyond)).toEqual([lounge, lounge])
    expect([7, 8, 9].map((y) => curveAt(site, 12, y)!.beyond)).toEqual([gym, gym, gym])
    expect(site.curves![0].square).toBeUndefined()
    wallsClose(site)
    expect(sealedRooms(site)).toEqual([])
    // a room along the whole north side of the circle: its south wall is one straight line from end to end,
    // walled wherever the circle's floor or open ground lies south of it and open only where it shares the curve
    const t = campus()
    expect(zoneRoom(t, 'office', 'atrium', 2, 4, 12, 14, 'round')).toBeNull()
    expect(zoneRoom(t, 'office', 'work', 0, 1, 14, 3)).toBeNull()
    const work = t.office.rooms[1].n
    const live = curveTiles(t.office)
    for (let x = 0; x <= 14; x++) {
      const runs = edgeRuns(t.office, x, 4, 'n', live)
      const tile = live.get(`${x},4`)
      if (tile?.beyond === work) expect(runs.every((r) => r.c === work && r.a !== 0), `${x}`).toBe(true)
      else expect(runs.reduce((a, r) => a + r.u1 - r.u0, 0), `${x}`).toBeCloseTo(1, 6)
    }
    expect([...live.values()].filter((x) => x.beyond === work).length).toBeGreaterThan(2)
    expect([...live.values()].every((x) => x.beyond === 0 || x.beyond === work)).toBe(true)
    wallsClose(t.office)
    expect(sealedRooms(t.office)).toEqual([])
  })

  it('keeps the curve where two rooms, a slanted corner or a second curve stand against one tile', () => {
    /** Straight walls with open ground on one side and nothing built on either tile: there must be none. */
    const sound = (site: Site, count: number) => {
      expect(site.curves!.every((c) => !c.square)).toBe(true)
      expect(curveTiles(site).size).toBe(count)
      wallsClose(site)
      expect(sealedRooms(site)).toEqual([])
      expect(JSON.parse(JSON.stringify(site))).toEqual(site)
    }
    // ---- two different rooms against the one tile: the round room's tile at 11,3 has open tiles to its north and its east
    let s = campus()
    let site = s.office
    expect(zoneRoom(s, 'office', 'atrium', 2, 2, 12, 12, 'round')).toBeNull()
    const round = site.rooms[0].n
    const count = curveTiles(site).size
    expect(curveAt(site, 11, 3)).toMatchObject({ beyond: 0 })
    expect(gridAt(site, 11, 2)).toBe(0)
    expect(gridAt(site, 12, 3)).toBe(0)
    expect(zoneRoom(s, 'office', 'lounge', 3, 0, 11, 2)).toBeNull()
    expect(zoneRoom(s, 'office', 'gym', 12, 0, 16, 12)).toBeNull()
    const [, lounge, gym] = site.rooms.map((r) => r.n)
    expect([gridAt(site, 11, 2), gridAt(site, 12, 3)]).toEqual([lounge, gym])
    sound(site, count)
    // the corner the curve leaves goes to one of them (they hold a metre each, so the older), and a straight wall shuts it off from the other
    expect(curveAt(site, 11, 3)!.beyond).toBe(lounge)
    expect(edgeRuns(site, 12, 3, 'w')).toEqual([{ a: gym, c: lounge, u0: 0, u1: 1 }])
    expect(edgeRuns(site, 11, 3, 'n')).toEqual([])
    expect(hasGround(site, 11, 3)).toBe(false)
    // further round, each room has the wall to itself
    expect(curveAt(site, 12, 7)!.beyond).toBe(gym)
    expect(curveAt(site, 7, 2)!.beyond).toBe(lounge)
    // a door in the bay over that tile joins the round room and the lounge, and nobody walks through it into the gym
    site.walls = []
    for (const c of site.curves!) delete c.walls
    const bay = [...geomOf(site.curves![0]).bays.values()].find((b) => b.tiles.length === 1 && b.tiles[0] === '11,3')!
    expect(bay).toBeDefined()
    expect(setEdges(s, 'office', { curve: 0, bays: [bay.key] }, 'door').done).toBe(1)
    expect(bayBeyond(site, 0, bay.key)).toEqual([lounge])
    expect([...openRooms(site)].sort()).toEqual([round, lounge])
    expect(sealedRooms(site).map((r) => r.n)).toEqual([gym])
    let nav = buildNav(site)
    expect(nav.walk[3 * site.w + 11]).toBe(1)
    expect(nav.zone[3 * site.w + 11]).toBe(nav.zone[1 * site.w + 11])
    expect(nav.zone[3 * site.w + 13]).not.toBe(nav.zone[3 * site.w + 11])
    expect(nav.zone[3 * site.w + 13]).not.toBe(nav.zone[1 * site.w + 11])
    // every room the game calls sealed is one the walking map cannot reach either
    expect(cutOffRooms(site, nav)).toEqual([round, lounge, gym])
    // taking the lounge away leaves open ground along the corner's north side and the gym along its east, a metre
    // each. The gym's west wall already comes down the line between them, so it carries straight on past the
    // corner, which is left as ground, and stops at the curve a third of a metre further down
    removeRoom(s, 'office', lounge)
    expect(curveAt(site, 11, 3)!.beyond).toBe(0)
    expect(edgeRuns(site, 12, 3, 'w')).toEqual([{ a: gym, c: 0, u0: 0, u1: 1 }])
    expect(edgeRuns(site, 11, 3, 'n')).toEqual([])
    expect(curveAt(site, 12, 4)!.beyond).toBe(gym)
    expect(edgeRuns(site, 12, 4, 'w')).toEqual([expect.objectContaining({ a: gym, c: 0, u0: 0 })])
    expect(edgeRuns(site, 12, 4, 'w')[0].u1).toBeCloseTo(0.338, 2)
    wallsClose(site)
    removeRoom(s, 'office', gym)
    expect(curveAt(site, 11, 3)!.beyond).toBe(0)
    expect(curveTiles(site).size).toBe(count)

    // ---- a slanted room whose cut corners stand against the curve: both keep their shape
    s = campus()
    site = s.office
    expect(zoneRoom(s, 'office', 'atrium', 2, 2, 12, 12, 'round')).toBeNull()
    expect(zoneRoom(s, 'office', 'lounge', 15, 1, 10, 6, 'diag')).toBeNull()
    expect(site.rooms).toHaveLength(2)
    // the stepped edge runs 11,2 / 12,3 / 13,4 / 14,5: the first three have the curved wall on the sides they open to
    expect(site.cuts).toMatchObject({ '11,2': 'sw', '12,3': 'sw', '13,4': 'sw', '14,5': 'sw' })
    sound(site, count)
    // the ground between the slant and the curve is still ground
    expect(curveAt(site, 11, 3)!.beyond).toBe(0)
    expect(curveAt(site, 12, 4)!.beyond).toBe(0)
    expect(hasGround(site, 11, 3)).toBe(true)
    expect(hasGround(site, 12, 3)).toBe(true)
    // the other way round: the slant first, the round room drawn against it afterwards
    const back = campus()
    expect(zoneRoom(back, 'office', 'lounge', 15, 1, 10, 6, 'diag')).toBeNull()
    expect(zoneRoom(back, 'office', 'atrium', 2, 2, 12, 12, 'round')).toBeNull()
    expect(back.office.cuts).toEqual(site.cuts)
    expect(back.office.grid.map((n) => (n ? 4 - n : 0))).toEqual(site.grid.map((n) => (n ? n - 1 : 0)))
    sound(back.office, count)
    // a cut still gives way to a plain room built against its open side
    expect(zoneRoom(s, 'office', 'gym', 13, 5, 13, 8)).toBeNull()
    expect(site.cuts!['13,4']).toBeUndefined()
    expect(site.cuts!['14,5']).toBeUndefined()
    expect(site.cuts!['12,3']).toBe('sw')
    wallsClose(site)

    // ---- a second round room drawn over the corner of the first: its floor runs along the first one's cut-away side
    s = campus()
    site = s.office
    expect(zoneRoom(s, 'office', 'atrium', 2, 2, 12, 12, 'round')).toBeNull()
    expect(zoneRoom(s, 'office', 'lounge', 11, 0, 15, 4, 'round')).toBeNull()
    expect(site.curves).toHaveLength(2)
    const small = site.rooms[1].n
    const both = curveTiles(site)
    expect([...both.values()].filter((t) => t.curve === 0)).toHaveLength(count)
    expect(site.curves!.every((c) => !c.square)).toBe(true)
    // the first room's tiles there keep their curve, and the corners it leaves are the second room's floor
    for (const key of ['11,3', '11,4', '12,4']) expect(both.get(key), key).toMatchObject({ curve: 0, beyond: small })
    expect(gridAt(site, 12, 3)).toBe(small)
    expect(gridAt(site, 11, 2)).toBe(small)
    expect(both.get('11,2')).toMatchObject({ curve: 1 })
    wallsClose(site)
    expect(sealedRooms(site)).toEqual([])
    // two round rooms of one kind drawn the same way still become one room, squared where their floors meet
    const one = campus()
    expect(zoneRoom(one, 'office', 'atrium', 2, 2, 12, 12, 'round')).toBeNull()
    expect(zoneRoom(one, 'office', 'atrium', 11, 0, 15, 4, 'round')).toBeNull()
    expect(one.office.rooms).toHaveLength(1)
    expect(Object.keys(one.office.curves![0].square ?? {}).length).toBeGreaterThan(0)
    wallsClose(one.office)
  })

  it('draws every stretch of a curved wall, with no slivers where it clips a corner', () => {
    let clipped = 0
    for (let r2 = 4; r2 <= 61; r2++) {
      for (const t of [0, 3]) {
        const spec = { cx: 40 + (r2 % 2) / 2, cy: 30 + (r2 % 2) / 2, rx: r2 / 2, ry: r2 / 2 + (r2 % 3), ...(t && r2 / 2 - t >= 1 ? { t } : {}) }
        const g = geomOf(spec)
        const drawn = new Map<number, number>()
        for (const tile of g.tiles.values()) for (const p of tile.pieces) drawn.set(p.facet, (drawn.get(p.facet) ?? 0) + (p.t1 - p.t0))
        g.facets.forEach((f, i) => expect(Math.abs((drawn.get(i) ?? 0) - 1) * f.len, `${JSON.stringify(spec)} facet ${i}`).toBeLessThan(1e-4))
        // every bay is whole, so every bay can take a door
        for (const b of g.bays.values()) expect(b.solid, `${JSON.stringify(spec)} ${b.key}`).toBe(true)
        // count the corners clipped so finely that the tile is not part of the shape at all
        const on = new Set(g.all.map((a) => `${a.x},${a.y}`))
        for (const tile of g.tiles.values()) {
          for (const p of tile.pieces) {
            const f = g.facets[p.facet]
            const mx = f.x0 + (f.x1 - f.x0) * ((p.t0 + p.t1) / 2)
            const my = f.y0 + (f.y1 - f.y0) * ((p.t0 + p.t1) / 2)
            if (!on.has(`${Math.floor(mx)},${Math.floor(my)}`)) clipped++
          }
        }
      }
    }
    // the case exists, or the test would prove nothing
    expect(clipped).toBeGreaterThan(0)
  })
})

describe('filling a courtyard', () => {
  /** A ring 40 m across and 6 m deep on a full campus: its courtyard is 556 open tiles. */
  function ringed() {
    const s = campus(4)
    expect(zoneRoom(s, 'office', 'work', 20, 4, 59, 43, 'ring', undefined, { thick: 6 })).toBeNull()
    return s
  }
  const innerWall = (site: Site) => [...curveTiles(site).values()].filter((t) => Math.hypot(t.shape.x + 0.5 - 40, t.shape.y + 0.5 - 24) < 16.5)

  it('finds the open ground shut in with a tile, and says when it is not shut in', () => {
    const s = ringed()
    const site = s.office
    const yard = pocketAt(site, 40, 24)!
    expect(yard.enclosed).toBe(true)
    expect(yard.tiles).toHaveLength(556)
    expect(yard.tiles.every(([x, y]) => gridAt(site, x, y) === 0 && Math.hypot(x + 0.5 - 40, y + 0.5 - 24) < 14)).toBe(true)
    // the corners the ring's inner wall leaves are part of it, all the way round
    expect(yard.curved).toHaveLength(innerWall(site).length)
    expect(pocketAt(site, 31, 16)).toEqual(yard)
    expect(fillError(yard)).toBeNull()
    // outside the ring the ground runs to the edge of the plot; a room tile is no ground at all
    const out = pocketAt(site, 2, 2)!
    expect(out.enclosed).toBe(false)
    expect(out.tiles.length).toBe(site.w * site.h - site.grid.filter(Boolean).length - 556)
    expect(fillError(out)).toMatch(/not closed in.*edge of the plot/)
    expect(pocketAt(site, 22, 24)).toBeNull()
    expect(fillError(null)).toMatch(/already built on/)
    expect(pocketAt(site, -1, 0)).toBeNull()
    // an arc leaves its courtyard open to the plot
    const arc = campus(4)
    expect(zoneRoom(arc, 'office', 'work', 20, 4, 59, 43, 'ring', undefined, { thick: 6, sweep: 270 })).toBeNull()
    expect(pocketAt(arc.office, 40, 24)!.enclosed).toBe(false)
    expect(fillRoom(arc, 'office', 'lounge', 40, 24)).toMatch(/not closed in/)
    expect(arc.office.rooms).toHaveLength(1)
    // a gap one tile wide is enough to let it out; a wall across the gap closes it
    const box = campus()
    for (const [x0, y0, x1, y1] of [[4, 4, 14, 4], [4, 12, 14, 12], [4, 5, 4, 11], [14, 5, 14, 7], [14, 9, 14, 11]]) expect(zoneRoom(box, 'office', 'work', x0, y0, x1, y1)).toBeNull()
    expect(pocketAt(box.office, 9, 8)!.enclosed).toBe(false)
    expect(zoneRoom(box, 'office', 'lounge', 14, 8, 14, 8)).toBeNull()
    expect(pocketAt(box.office, 9, 8)).toMatchObject({ enclosed: true, curved: [] })
    expect(pocketAt(box.office, 9, 8)!.tiles).toHaveLength(9 * 7)
  })

  it('fills a courtyard with a room that shares the curved wall all round, at the usual price', () => {
    const s = ringed()
    const site = s.office
    const ring = site.rooms[0].n
    const edge = curveTiles(site).size
    expect(placeItem(s, 'office', 'otree', 40, 24, 0)).toBeNull()
    s.config.unlimitedMoney = false
    s.cash = 1e9
    expect(fillRoom(s, 'office', 'nothing', 40, 24)).toMatch(/no such kind of room/)
    expect(fillRoom(s, 'office', 'lounge', 22, 24)).toMatch(/already built on/)
    expect(fillRoom(s, 'office', 'lounge', 2, 2)).toMatch(/not closed in/)
    expect(s.cash).toBe(1e9)
    expect(site.rooms).toHaveLength(1)
    expect(fillRoom(s, 'office', 'lounge', 33, 20)).toBeNull()
    const lounge = site.rooms[1]
    expect(lounge.type).toBe('lounge')
    expect(roomTiles(site, lounge.n)).toBe(556)
    // charged by the tile like any room; the tree that stood there was sold on
    expect(s.cash).toBe(1e9 - 556 * 420 + 450)
    expect(site.items).toHaveLength(0)
    // the ring keeps all of its curve, the whole inner wall is shared, and not a sliver of ground is left inside
    expect(site.curves![0].square).toBeUndefined()
    expect(curveTiles(site).size).toBe(edge)
    expect(innerWall(site).length).toBeGreaterThan(100)
    expect(innerWall(site).every((t) => t.beyond === lounge.n)).toBe(true)
    for (let y = 8; y <= 40; y++) for (let x = 24; x <= 56; x++) if (Math.hypot(x + 0.5 - 40, y + 0.5 - 24) < 15) expect(hasGround(site, x, y), `${x},${y}`).toBe(false)
    expect(pocketAt(site, 40, 24)).toBeNull()
    wallsClose(site)
    const curved = curveTiles(site)
    for (const t of innerWall(site)) for (const side of ['n', 'w'] as const) for (const r of edgeRuns(site, t.shape.x, t.shape.y, side, curved)) expect(r.a === 0 || r.c === 0, `${t.shape.x},${t.shape.y}`).toBe(false)
    // it was given a way in through the shared wall, and people can walk to it from the street
    expect(sealedRooms(site)).toEqual([])
    expect(cutOffRooms(site, buildNav(site))).toEqual([])
    expect(JSON.parse(JSON.stringify(site))).toEqual(site)
    // not enough money: said so, and nothing is built
    removeRoom(s, 'office', lounge.n)
    s.cash = -DIFFICULTY.normal.overdraft + 1000
    expect(fillRoom(s, 'office', 'lounge', 40, 24)).toMatch(/Not enough cash: that would cost \$233,520/)
    expect(site.rooms).toHaveLength(1)
    // floor of the ring's own kind joins the ring, unless it is asked to stand apart
    s.cash = 1e9
    expect(fillRoom(s, 'office', 'work', 40, 24, true)).toBeNull()
    expect(site.rooms).toHaveLength(2)
    expect(innerWall(site).every((t) => t.beyond === site.rooms[1].n)).toBe(true)
    removeRoom(s, 'office', site.rooms[1].n)
    expect(fillRoom(s, 'office', 'work', 40, 24)).toBeNull()
    expect(site.rooms.map((r) => r.n)).toEqual([ring])
    expect(innerWall(site)).toHaveLength(0)
    wallsClose(site)
  })

  it('lets a box across most of a curved courtyard take all of it, and leaves a smaller box a box', () => {
    const s = ringed()
    const site = s.office
    // a pavilion set well inside the circle covers under half of it: it stays a square, and the plan says how
    // big the courtyard round it is, so the builder can warn before the click
    const pavilion = zonePlan(site, 33, 17, 46, 30)
    expect(pavilion).toMatchObject({ filled: false, area: 196, curve: null, yard: 556 })
    expect(FILL_SHARE).toBe(0.5)
    // just short of half (278 m²) stays a box; half or more takes the lot
    expect(zonePlan(site, 30, 18, 50, 30)).toMatchObject({ filled: false, area: 273, yard: 556 })
    expect(zonePlan(site, 30, 17, 50, 30)).toMatchObject({ filled: true, area: 556, yard: 556 })
    expect(zonePlan(site, 31, 15, 48, 32)).toMatchObject({ filled: true, area: 556 })
    // a box that reaches the ring on every side would leave four thin slivers: it takes the whole courtyard instead
    const most = zonePlan(site, 28, 12, 51, 35)
    expect(most.filled).toBe(true)
    expect(most.tiles).toHaveLength(556)
    expect(most.area).toBe(556)
    expect(zoneable(site, 28, 12, 51, 35, 'rect').length).toBeGreaterThan(556 * 0.75)
    expect(zoneable(site, 28, 12, 51, 35, 'rect').length).toBeLessThan(556)
    // a round room, a slant or a box that also takes land outside the ring is built as drawn
    expect(zonePlan(site, 28, 12, 51, 35, 'diag').filled).toBe(false)
    expect(zonePlan(site, 28, 12, 51, 35, 'round').filled).toBe(false)
    expect(zonePlan(site, 2, 2, 69, 53)).toMatchObject({ filled: false, yard: 0 })
    s.config.unlimitedMoney = false
    s.cash = 1e9
    expect(zoneRoom(s, 'office', 'lounge', 28, 12, 51, 35)).toBeNull()
    const lounge = site.rooms[1].n
    expect(roomTiles(site, lounge)).toBe(556)
    expect(s.cash).toBe(1e9 - 556 * 420)
    expect(innerWall(site).every((t) => t.beyond === lounge)).toBe(true)
    expect(site.curves![0].square).toBeUndefined()
    wallsClose(site)
    expect(sealedRooms(site)).toEqual([])
    // the smaller box really is left as drawn, with ground between it and the ring
    const t = ringed()
    expect(zoneRoom(t, 'office', 'lounge', 33, 17, 46, 30)).toBeNull()
    expect(roomTiles(t.office, t.office.rooms[1].n)).toBe(196)
    expect(hasGround(t.office, 40, 12)).toBe(true)
    expect(innerWall(t.office).every((x) => x.beyond === 0)).toBe(true)
    // and a courtyard with straight walls all round is never widened: a box in it is what was asked for
    const box = campus()
    for (const [x0, y0, x1, y1] of [[4, 4, 14, 4], [4, 12, 14, 12], [4, 5, 4, 11], [14, 5, 14, 11]]) expect(zoneRoom(box, 'office', 'work', x0, y0, x1, y1)).toBeNull()
    expect(zonePlan(box.office, 5, 5, 13, 10).filled).toBe(false)
    expect(fillRoom(box, 'office', 'lounge', 6, 6, true)).toBeNull()
    expect(roomTiles(box.office, box.office.rooms[box.office.rooms.length - 1].n)).toBe(63)
    wallsClose(box.office)
  })

  it('refuses a courtyard too large to fill in one go', () => {
    const s = campus(4)
    const site = s.office
    for (const [x0, y0, x1, y1] of [[1, 1, 70, 1], [1, 54, 70, 54], [1, 2, 1, 53], [70, 2, 70, 53]]) expect(zoneRoom(s, 'office', 'work', x0, y0, x1, y1)).toBeNull()
    const yard = pocketAt(site, 30, 30)!
    expect(yard.enclosed).toBe(true)
    expect(yard.tiles.length).toBe(68 * 52)
    expect(yard.tiles.length).toBeGreaterThan(FILL_MAX)
    const rooms = site.rooms.length
    expect(fillRoom(s, 'office', 'lounge', 30, 30)).toMatch(/3,536 m², too large to fill in one go/)
    expect(site.rooms).toHaveLength(rooms)
  })

  it('fills ground the edge of the plot helps close in, and refuses the open plot round a building', () => {
    const s = campus()
    const site = s.office
    const { w, h } = site
    // nothing built: only the edge of the plot stands round the ground
    expect(pocketAt(site, 5, 5)).toMatchObject({ enclosed: false, walls: 0, rim: 2 * (w + h), reaches: ['e', 'n', 's', 'w'] })
    expect(fillError(pocketAt(site, 5, 5))).toMatch(/not closed in: it runs out to all four sides of the plot/)
    // a U of rooms open to the north edge: 19 m of wall on three sides, and 7 m of plot edge across the top
    for (const [x0, y0, x1, y1] of [[4, 0, 4, 6], [12, 0, 12, 6], [5, 6, 11, 6]]) expect(zoneRoom(s, 'office', 'work', x0, y0, x1, y1)).toBeNull()
    const yard = pocketAt(site, 8, 3)!
    expect(yard).toMatchObject({ enclosed: false, walls: 19, rim: 7, curved: [], reaches: ['n'] })
    expect(yard.tiles).toHaveLength(42)
    expect(pocketAt(site, 11, 0)).toEqual(yard)
    expect(fillError(yard)).toBeNull()
    // outside the U the ground is the open plot, out to every side of it, and it says so
    const out = pocketAt(site, 20, 20)!
    expect(out.enclosed).toBe(false)
    expect(out.walls).toBe(7 + 9 + 7)
    expect(out.rim).toBe(2 * (w + h) - 9)
    expect(out.reaches).toHaveLength(4)
    expect(fillError(out)).toMatch(/not closed in: it runs out to all four sides of the plot, so it is the open land round the buildings and not a courtyard/)
    expect(fillError(out)).toMatch(/edge of the plot along no more than two sides/)
    s.config.unlimitedMoney = false
    s.cash = 1e9
    expect(fillRoom(s, 'office', 'lounge', 20, 20)).toMatch(/not closed in/)
    expect(s.cash).toBe(1e9)
    expect(site.rooms).toHaveLength(1)
    // the yard fills, at the usual price, with a wall of its own along the edge of the plot and a way in
    expect(fillRoom(s, 'office', 'lounge', 8, 3)).toBeNull()
    const lounge = site.rooms[1]
    expect(lounge.type).toBe('lounge')
    expect(roomTiles(site, lounge.n)).toBe(42)
    expect(s.cash).toBe(1e9 - 42 * 420)
    expect(pocketAt(site, 8, 3)).toBeNull()
    for (let x = 5; x <= 11; x++) expect(edgeRuns(site, x, 0, 'n')).toEqual([{ a: lounge.n, c: 0, u0: 0, u1: 1 }])
    wallsClose(site)
    expect(sealedRooms(site)).toEqual([])
    // a corner of the plot behind two walls: two sides are the plot's, and it is still a yard
    for (const [x0, y0, x1, y1] of [[w - 6, h - 5, w - 6, h - 1], [w - 5, h - 5, w - 1, h - 5]]) expect(zoneRoom(s, 'office', 'gym', x0, y0, x1, y1)).toBeNull()
    const corner = pocketAt(site, w - 2, h - 2)!
    expect(corner).toMatchObject({ enclosed: false, walls: 9, rim: 9, reaches: ['e', 's'] })
    expect(corner.tiles).toHaveLength(20)
    expect(fillError(corner)).toBeNull()
    expect(fillRoom(s, 'office', 'server', w - 1, h - 1)).toBeNull()
    expect(roomTiles(site, site.rooms[site.rooms.length - 1].n)).toBe(20)
    wallsClose(site)
    // a building right across the plot leaves two halves, each out to three sides of it: neither is a yard
    const cross = campus()
    expect(zoneRoom(cross, 'office', 'work', 0, 10, w - 1, 11)).toBeNull()
    expect(pocketAt(cross.office, 10, 5)).toMatchObject({ walls: w, rim: w + 20, reaches: ['e', 'n', 'w'] })
    expect(fillRoom(cross, 'office', 'lounge', 10, 5)).toMatch(/not closed in: it runs out to three sides of the plot/)
    // a second building from that one to the north edge leaves a yard between them, out to two sides: that fills
    expect(zoneRoom(cross, 'office', 'gym', 20, 0, 21, 9)).toBeNull()
    expect(pocketAt(cross.office, 10, 5)).toMatchObject({ walls: 30, rim: 30, reaches: ['n', 'w'] })
    expect(fillRoom(cross, 'office', 'lounge', 10, 5)).toBeNull()
    expect(roomTiles(cross.office, cross.office.rooms[2].n)).toBe(200)
    wallsClose(cross.office)
    expect(fillRoom(cross, 'office', 'lounge', 10, h - 2)).toMatch(/not closed in/)
    // a slanted wall counts for its true length
    const slant = campus()
    expect(zoneRoom(slant, 'office', 'work', 0, 9, 9, 0, 'diag')).toBeNull()
    expect(Object.keys(slant.office.cuts ?? {}).length).toBeGreaterThan(5)
    const open = pocketAt(slant.office, w - 2, h - 2)!
    // nine slanted tiles at root two each, the ten metres of the triangle's south side, and a metre at each end of the slant
    expect(Object.keys(slant.office.cuts!)).toHaveLength(9)
    expect(open.walls).toBeCloseTo(9 * Math.SQRT2 + 12, 6)
    expect(fillError(open)).toMatch(/not closed in/)
  })

  it('fills the courtyard of a half ring that stands on the edge of the plot, sharing its curve', () => {
    // half a ring 40 m across and 6 m deep, open to the north, with its two ends on the north edge of the plot
    const s = campus(4)
    const site = s.office
    expect(zoneRoom(s, 'office', 'work', 10, 0, 49, 19, 'ring', undefined, { thick: 6, sweep: 180, turn: 2 })).toBeNull()
    const ring = site.rooms[0].n
    const inner = () => [...curveTiles(site).values()].filter((t) => Math.hypot(t.shape.x + 0.5 - 30, t.shape.y + 0.5) < 16.5)
    const yard = pocketAt(site, 30, 5)!
    expect(yard.enclosed).toBe(false)
    expect(yard.curved).toHaveLength(inner().length)
    // the plot edge closes the 28 m across the top; the inner wall is half a circle of 14 m radius
    expect(yard.rim).toBeCloseTo(28, 0)
    expect(yard.walls).toBeGreaterThan(40)
    expect(yard.walls).toBeLessThan(48)
    expect(fillError(yard)).toBeNull()
    // a box across half of it or more takes it all, and a smaller one is told what courtyard it stands in
    expect(zonePlan(site, 18, 0, 41, 8)).toMatchObject({ filled: true, area: yard.tiles.length, yard: yard.tiles.length })
    expect(zonePlan(site, 26, 0, 33, 5)).toMatchObject({ filled: false, area: 48, yard: yard.tiles.length })
    expect(fillRoom(s, 'office', 'lounge', 30, 5)).toBeNull()
    const lounge = site.rooms[1].n
    expect(roomTiles(site, lounge)).toBe(yard.tiles.length)
    expect(site.curves![0].square).toBeUndefined()
    expect(inner().length).toBeGreaterThan(40)
    expect(inner().every((t) => t.beyond === lounge)).toBe(true)
    expect(pocketAt(site, 30, 5)).toBeNull()
    for (let x = 17; x <= 42; x++) for (let y = 0; y <= 13; y++) if (Math.hypot(x + 0.5 - 30, y + 0.5) < 15) expect(hasGround(site, x, y), `${x},${y}`).toBe(false)
    wallsClose(site)
    expect(sealedRooms(site)).toEqual([])
    expect(site.rooms.map((r) => r.n)).toEqual([ring, lounge])
    expect(JSON.parse(JSON.stringify(site))).toEqual(site)
    // a quarter ring bent round the corner of the plot: its yard has more plot edge than wall, and still fills
    const q = campus(4)
    expect(zoneRoom(q, 'office', 'work', 0, 0, 19, 19, 'ring', undefined, { thick: 6, sweep: 90, turn: 2 })).toBeNull()
    const nook = pocketAt(q.office, 3, 3)!
    expect(nook.reaches).toEqual(['n', 'w'])
    expect(nook.rim).toBeGreaterThan(nook.walls)
    expect(fillError(nook)).toBeNull()
    expect(fillRoom(q, 'office', 'lounge', 3, 3)).toBeNull()
    expect(roomTiles(q.office, q.office.rooms[1].n)).toBe(nook.tiles.length)
    expect([...curveTiles(q.office).values()].filter((t) => Math.hypot(t.shape.x + 0.5, t.shape.y + 0.5) < 16.5).every((t) => t.beyond === q.office.rooms[1].n)).toBe(true)
    wallsClose(q.office)
    expect(sealedRooms(q.office)).toEqual([])
  })
})

describe('doors, and who can get in', () => {
  it('gives a joined room a door when the join swallowed its only one', () => {
    const s = campus()
    const site = s.office
    expect(zoneRoom(s, 'office', 'work', 3, 3, 6, 6)).toBeNull()
    const first = site.walls.find((w) => w.kind === 'door')!
    expect(first).toMatchObject({ y: 7, side: 'n' })
    // more floor laid along the south side joins the room, and takes the wall the door was in
    expect(zoneRoom(s, 'office', 'work', 3, 7, 6, 9)).toBeNull()
    expect(site.rooms).toHaveLength(1)
    expect(isBoundary(site, first.x, first.y, 'n')).toBe(false)
    expect(doors(site)).toBe(1)
    expect(site.walls[0]).toMatchObject({ y: 10, side: 'n', kind: 'door' })
    expect(sealedRooms(site)).toEqual([])
    expect(cutOffRooms(site, buildNav(site))).toEqual([])
    // three rooms made one by the floor between them: every door stood on a wall that went, and the one room gets one
    const t = campus()
    expect(zoneRoom(t, 'office', 'work', 3, 3, 5, 5)).toBeNull()
    expect(zoneRoom(t, 'office', 'work', 9, 3, 11, 5)).toBeNull()
    expect(zoneRoom(t, 'office', 'lounge', 3, 6, 11, 8)).toBeNull()
    t.office.walls = t.office.walls.filter((w) => w.y === 6)
    expect(sealedRooms(t.office).map((r) => r.type)).toEqual([])
    expect(zoneRoom(t, 'office', 'work', 6, 3, 8, 5)).toBeNull()
    expect(t.office.rooms).toHaveLength(2)
    expect(sealedRooms(t.office)).toEqual([])
    expect(doors(t.office)).toBeGreaterThan(0)
  })

  it('gives a room another door when a curved wall built against it takes the one it had', () => {
    const s = campus()
    const site = s.office
    expect(zoneRoom(s, 'office', 'work', 4, 2, 10, 4)).toBeNull()
    const work = site.rooms[0].n
    expect(site.walls).toEqual([expect.objectContaining({ x: 7, y: 5, side: 'n', kind: 'door' })])
    // a round lounge drawn against its south side: the top of the circle swallows the stretch of wall the door was in
    expect(zoneRoom(s, 'office', 'lounge', 3, 5, 11, 13, 'round')).toBeNull()
    const lounge = site.rooms[1].n
    expect(isBoundary(site, 7, 5, 'n')).toBe(false)
    expect(wallAt(site, 7, 5, 'n')).toBeUndefined()
    // both rooms have a way in, and both can be walked to
    expect([...openRooms(site)].sort()).toEqual([work, lounge])
    expect(sealedRooms(site)).toEqual([])
    expect(doors(site)).toBe(2)
    expect(cutOffRooms(site, buildNav(site))).toEqual([])
    wallsClose(site)
  })

  it('counts a room as cut off exactly where the walking map cannot reach it', () => {
    // a round server room, then a studio wrapped about it: the server room's door now opens into the studio,
    // so both count as having a way in and the studio is given no street door of its own
    const s = campus()
    const site = s.office
    expect(zoneRoom(s, 'office', 'server', 5, 5, 11, 11, 'round')).toBeNull()
    expect(zoneRoom(s, 'office', 'soft', 3, 3, 13, 13)).toBeNull()
    const [server, soft] = site.rooms.map((r) => r.n)
    expect(doors(site)).toBe(1)
    expect(sealedRooms(site)).toEqual([])
    // nobody can walk to either from the street, and the chip says so for both
    let nav = buildNav(site)
    expect(nav.entry).toBeGreaterThanOrEqual(0)
    expect(cutOffRooms(site, nav)).toEqual([server, soft])
    expect(nav.zone[8 * site.w + 8]).toBe(nav.zone[4 * site.w + 4])
    // a street door for the studio opens both
    expect(setEdge(s, 'office', 8, 14, 'n', 'door')).toBeNull()
    nav = buildNav(site)
    expect(cutOffRooms(site, nav)).toEqual([])
    // glaze the server room's door and it alone is shut: sealed for the game, cut off for the walkers
    const bay = Object.keys(site.curves![0].walls!)[0]
    expect(setEdges(s, 'office', { curve: 0, bays: [bay] }, 'glass').done).toBe(1)
    expect(sealedRooms(site).map((r) => r.n)).toEqual([server])
    expect(cutOffRooms(site, buildNav(site))).toEqual([server])
    expect(setEdges(s, 'office', { curve: 0, bays: [bay] }, 'open').done).toBe(1)
    // a door blocked by furniture is cut off though it is not sealed
    expect(placeItem(s, 'office', 'plant', 8, 13, 0)).toBeNull()
    expect(sealedRooms(site)).toEqual([])
    expect(cutOffRooms(site, buildNav(site))).toEqual([server, soft])
    // whatever is done to the walls, a sealed room is always among the cut-off ones
    for (const kind of ['wall', 'glass', 'door', 'open'] as const) {
      setEdge(s, 'office', 8, 14, 'n', kind)
      for (const k2 of ['wall', 'glass', 'door', 'open'] as const) {
        setEdges(s, 'office', { curve: 0, bays: [bay] }, k2)
        const cut = cutOffRooms(site, buildNav(site))
        for (const r of sealedRooms(site)) expect(cut, `${kind}/${k2}`).toContain(r.n)
      }
    }
    // a plot built right up to its edges with no door in them has no way in: every room is cut off
    const mall = rich()
    expect(openStore(mall, 0)).toBeNull()
    const shop = mall.stores[0]
    const ref = `store:${shop.id}`
    expect(cutOffRooms(shop.site, buildNav(shop.site))).toEqual([])
    expect(zoneRoom(mall, ref, 'stock', 0, 0, shop.site.w - 1, shop.site.h - 1)).toBeNull()
    shop.site.walls = []
    expect(buildNav(shop.site).entry).toBe(-1)
    expect(cutOffRooms(shop.site, buildNav(shop.site))).toEqual(shop.site.rooms.map((r) => r.n).sort((a, b) => a - b))
  })

  it('refuses a door on a stretch of wall that a curve cuts short', () => {
    const s = campus()
    const site = s.office
    expect(zoneRoom(s, 'office', 'atrium', 2, 2, 12, 12, 'round')).toBeNull()
    const atrium = site.rooms[0].n
    // knock the top of the circle off: the room is left with a straight north wall whose two ends the curve cuts short
    clearZone(s, 'office', 2, 2, 12, 4)
    expect(edgeRuns(site, 7, 5, 'n')).toEqual([{ a: atrium, c: 0, u0: 0, u1: 1 }])
    const short = edgeRuns(site, 12, 5, 'n')
    expect(short).toHaveLength(1)
    expect(short[0].u1 - short[0].u0).toBeCloseTo(0.393, 2)
    expect(isBoundary(site, 12, 5, 'n')).toBe(true)
    expect(doorFits(site, 7, 5, 'n')).toBe(true)
    expect(doorFits(site, 12, 5, 'n')).toBe(false)
    expect(doorFits(site, 2, 5, 'n')).toBe(false)
    expect(doorFits(site, 7, 3, 'n')).toBe(false)
    // a wall whose ends are only clipped by a centimetre or two still counts as whole
    expect(wholeRun({ a: 1, c: 0, u0: 0.02, u1: 1 })).toBe(true)
    expect(wholeRun({ a: 1, c: 0, u0: 0.05, u1: 1 })).toBe(false)
    s.config.unlimitedMoney = false
    s.cash = 1e6
    for (const c of site.curves!) delete c.walls
    site.walls = []
    // a door or an opening there is refused, with the reason, and costs nothing; glass and plain wall are fine
    expect(setEdge(s, 'office', 12, 5, 'n', 'door')).toBe(SHORT_WALL)
    expect(setEdge(s, 'office', 12, 5, 'n', 'open')).toBe(SHORT_WALL)
    expect(SHORT_WALL).toMatch(/full metre of straight wall/)
    expect(setEdges(s, 'office', { edges: [{ x: 12, y: 5, side: 'n' }] }, 'door')).toEqual({ done: 0, skipped: 1, short: 0, cost: 0, error: SHORT_WALL })
    expect(s.cash).toBe(1e6)
    expect(site.walls).toEqual([])
    expect(setEdge(s, 'office', 12, 5, 'n', 'glass')).toBeNull()
    expect(setEdge(s, 'office', 12, 5, 'n', 'wall')).toBeNull()
    // a run of doors along the whole wall passes over the two short ends and says nothing more
    const north = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((x) => ({ x, y: 5, side: 'n' as const }))
    expect(setEdges(s, 'office', { edges: north }, 'door')).toEqual({ done: 9, skipped: 2, short: 0, cost: 9 * EDGE_COST.door, error: null })
    expect(sealedRooms(site)).toEqual([])
    expect(setEdges(s, 'office', { edges: north }, 'wall').done).toBe(9)
    expect(sealedRooms(site).map((r) => r.n)).toEqual([atrium])
    // one left over from an older save is no way in, is not walked through, and goes at the next tidy
    site.walls.push({ id: 'old', x: 12, y: 5, side: 'n', kind: 'door' })
    expect(sealedRooms(site).map((r) => r.n)).toEqual([atrium])
    expect(cutOffRooms(site, buildNav(site))).toEqual([atrium])
    site.walls.push({ id: 'pane', x: 2, y: 5, side: 'n', kind: 'glass' })
    tidy(site)
    expect(site.walls.map((w) => w.id)).toEqual(['pane'])
  })
})

describe('plots that match their surroundings', () => {
  it('lays a mall unit with tile, a street plot and a plaza with paving', () => {
    expect(SITE_TIERS.store.map((t) => t.env)).toEqual(['mall', 'street', 'plaza'])
    const mall = newSite('store', 0)
    const street = newSite('store', 1)
    const plaza = newSite('store', 2)
    expect(defaultGround(mall).id).toBe('tile')
    expect(defaultGround(street).id).toBe('paving')
    expect(defaultGround(plaza).id).toBe('paving')
    // nothing green grows inside a mall, and nobody parks there
    const ids = (site: Site) => groundsFor(site).map((g) => g.id)
    for (const id of ['grass', 'meadow', 'asphalt', 'gravel']) expect(ids(mall)).not.toContain(id)
    expect(ids(street)).toContain('asphalt')
    expect(ids(street)).not.toContain('tile')
    expect(ids(plaza)).toContain('grass')
    // every other kind of plot has a default too, and lawn only where there is green around it
    for (const kind of ['office', 'factory', 'store', 'venue'] as const) {
      SITE_TIERS[kind].forEach((t, tier) => {
        const g = defaultGround({ kind, tier })
        expect(groundsFor({ kind, tier })[0]).toBe(g)
        expect(g.id === 'grass', `${kind} ${t.name}`).toBe(['suburb', 'estate', 'park', 'valley'].includes(t.env))
      })
    }
    const s = rich()
    for (const tier of [0, 1, 2]) expect(openStore(s, tier)).toBeNull()
    const [m, st] = s.stores
    // a finish the mall does not offer is refused; one it does is laid; its own default is simply the bare floor
    paintArea(s, `store:${m.id}`, 0, 0, 9, 0, 'rect', 'grass')
    paintFloor(s, `store:${m.id}`, 0, 0, 'meadow')
    expect(m.site.floor).toEqual({})
    paintArea(s, `store:${m.id}`, 0, 0, 9, 0, 'rect', 'deck')
    expect(Object.keys(m.site.floor)).toHaveLength(10)
    paintArea(s, `store:${m.id}`, 0, 0, 9, 0, 'rect', 'tile')
    expect(m.site.floor).toEqual({})
    expect(groundAt(m.site, 0, 0).id).toBe('tile')
    // an old save with lawn painted in a mall shows the mall's floor instead
    m.site.floor['0,0'] = 'meadow'
    expect(groundAt(m.site, 0, 0).id).toBe('tile')
    delete m.site.floor['0,0']
    paintArea(s, `store:${st.id}`, 0, 0, 3, 0, 'rect', 'tile')
    expect(st.site.floor).toEqual({})
    paintArea(s, `store:${st.id}`, 0, 0, 3, 0, 'rect', 'grass')
    expect(groundAt(st.site, 2, 0).id).toBe('grass')
    paintArea(s, `store:${st.id}`, 0, 0, 3, 0, 'rect', 'paving')
    expect(st.site.floor).toEqual({})
    // street trees stay on the street
    expect(placeItem(s, `store:${m.id}`, 'otree', 0, 7, 0)).toMatch(/mall/)
    expect(placeItem(s, `store:${m.id}`, 'planter', 0, 7, 0)).toBeNull()
    expect(placeItem(s, `store:${st.id}`, 'otree', 0, 11, 0)).toBeNull()
  })
})

describe('copying a store layout', () => {
  /** A high-street store with a stockroom, glass, a curved forum, paint and its own cladding. */
  function fitted(s: GameState) {
    expect(openStore(s, 1)).toBeNull()
    const store = s.stores[s.stores.length - 1]
    const ref = `store:${store.id}`
    // the starter sales floor is tiles 1..12 x 1..9: trim it back and build a stockroom and a round forum
    clearZone(s, ref, 9, 1, 12, 9)
    expect(zoneRoom(s, ref, 'stock', 10, 1, 12, 3)).toBeNull()
    expect(zoneRoom(s, ref, 'forum', 9, 5, 13, 9, 'round')).toBeNull()
    expect(placeItems(s, ref, 'demo', 2, 6, 6, 6, 0).done).toBe(5)
    expect(placeItems(s, ref, 'stockrack', 10, 1, 10, 3, 1).done).toBe(1)
    expect(placeItem(s, ref, 'counter', 7, 2, 0)).toBeNull()
    expect(placeItem(s, ref, 'otree', 0, 11, 0)).toBeNull()
    expect(placeItem(s, ref, 'sign', 13, 11, 0)).toBeNull()
    expect(setEdges(s, ref, { edges: [2, 3, 4, 5].map((x) => ({ x, y: 10, side: 'n' as const })) }, 'glass').done).toBeGreaterThan(2)
    paintArea(s, ref, 0, 10, 13, 11, 'rect', 'deck')
    expect(setLook(s, ref, { facade: 3, roof: 2, floors: 2 })).toBeNull()
    setRoomStyle(s, ref, store.site.rooms[0].n, 2)
    expect(storeStats(store.site).open).toBe(true)
    return store
  }
  const shape = (site: Site) => ({
    rooms: site.rooms.map((r) => `${r.type}/${r.style}/${roomTiles(site, r.n)}`).sort(),
    items: site.items.map((i) => `${i.kind}/${i.rot}`).sort(),
    walls: site.walls.map((w) => w.kind).sort(),
    curves: (site.curves ?? []).map((c) => `${c.rx}/${c.ry}/${Object.values(c.walls ?? {}).sort()}`),
    look: [site.facade, site.roof, site.floors],
    painted: Object.values(site.floor).sort(),
  })

  it('rebuilds another store to the same layout and charges the difference', () => {
    const s = rich()
    const model = fitted(s)
    expect(openStore(s, 2)).toBeNull()
    const flagship = s.stores[1]
    expect(placeItem(s, `store:${flagship.id}`, 'forum', 5, 8, 0)).toMatch(/goes in/)
    expect(placeItem(s, `store:${flagship.id}`, 'support', 5, 8, 0)).toBeNull()
    s.config.unlimitedMoney = false
    s.cash = 5e6
    const quote = layoutQuote(s, model.id, flagship.id)
    expect(quote.error).toBeNull()
    expect(quote.needs).toEqual([14, 11])
    // the copy is priced as building it by hand would be; the furniture cleared sells for half
    expect(quote.build).toBe(layoutValue(model.site))
    expect(quote.resale).toBe((6000 + 4000 + 9000) / 2)
    expect(quote.cost).toBe(quote.build - quote.resale)
    expect(quote.build).toBeGreaterThan(5 * 5000 + 2000 + 4000 + 900 + 5000)
    const facilities = s.cur.facilities
    const sold = { units: (flagship.unitsTotal = 77), name: flagship.name, region: flagship.region }
    expect(copyLayout(s, model.id, flagship.id)).toBeNull()
    expect(s.cash).toBe(5e6 - quote.cost)
    expect(s.cur.facilities).toBe(facilities + quote.cost)
    const copy = s.stores[1].site
    expect([copy.w, copy.h, copy.tier, copy.kind]).toEqual([22, 18, 2, 'store'])
    expect(shape(copy)).toEqual(shape(model.site))
    expect(s.stores[1]).toMatchObject({ unitsTotal: sold.units, name: sold.name, region: sold.region })
    // set down in the middle, the same distance from the street; everything is where it may stand
    const dx = 4
    const dy = 6
    for (const it of model.site.items) expect(copy.items.some((c) => c.kind === it.kind && c.x === it.x + dx && c.y === it.y + dy && c.rot === it.rot), it.kind).toBe(true)
    for (const it of copy.items) expect(canPlace({ ...copy, items: copy.items.filter((x) => x !== it) }, it.kind, it.x, it.y, it.rot), it.kind).toBeNull()
    expect(copy.curves![0].cx).toBe(model.site.curves![0].cx + dx)
    expect(curveTiles(copy).size).toBe(curveTiles(model.site).size)
    expect(bayStands(copy, 0, Object.keys(copy.curves![0].walls!)[0])).toBe(true)
    expect(storeStats(copy).open).toBe(true)
    expect(sealedRooms(copy)).toEqual([])
    wallsClose(copy)
    // nothing is shared with the store it was copied from
    const ids = [...model.site.items, ...copy.items].map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(copy.items[0]).not.toBe(model.site.items[0])
    copy.curves![0].walls!.o1 = 'glass'
    expect(model.site.curves![0].walls!.o1).toBeUndefined()
    delete copy.curves![0].walls!.o1
    expect(JSON.parse(JSON.stringify(s.stores))).toEqual(s.stores)
    // copying again is nothing to do: the two stores already stand alike, so it is free and nothing is touched
    expect(layoutSig(copy)).not.toBe(layoutSig(model.site))
    const again = layoutQuote(s, model.id, flagship.id)
    expect(again).toMatchObject({ error: null, same: true, build: 0, resale: 0, cost: 0, needs: [14, 11] })
    expect(quote.same).toBe(false)
    const cash = s.cash
    const rev = copy.rev
    const kept = JSON.stringify(s.stores)
    expect(copyLayout(s, model.id, flagship.id)).toBe(SAME_LAYOUT)
    expect(s.cash).toBe(cash)
    expect(s.cur.facilities).toBe(facilities + quote.cost)
    expect(s.stores[1].site).toBe(copy)
    expect(copy.rev).toBe(rev)
    expect(JSON.stringify(s.stores)).toBe(kept)
    // even with no money at all it is not refused for the price of a rebuild
    s.cash = -DIFFICULTY.normal.overdraft
    expect(layoutQuote(s, model.id, flagship.id)).toMatchObject({ error: null, same: true, cost: 0 })
    s.cash = cash
    // one plant more at either store and they differ again: now the cladding, roof and storeys are already paid for
    expect(placeItem(s, `store:${flagship.id}`, 'plant', 6, 9, 0)).toBeNull()
    const changed = layoutQuote(s, model.id, flagship.id)
    expect(changed.same).toBe(false)
    expect(changed.build).toBeLessThan(quote.build)
    expect(changed.build).toBeGreaterThan(0)
    expect(changed.resale).toBe(copy.items.reduce((a, i) => a + ITEMS.store[i.kind].cost / 2, 0))
    expect(copyLayout(s, model.id, flagship.id)).toBeNull()
    expect(s.cash).toBe(cash - 250 - changed.cost)
    expect(layoutQuote(s, model.id, flagship.id).same).toBe(true)
    // a layout built by hand to match counts too, whatever its rooms are numbered and its furniture is called
    const twin = JSON.parse(JSON.stringify(s.stores[1].site)) as Site
    const renumber = (n: number) => (n ? n + 40 : 0)
    twin.grid = twin.grid.map(renumber)
    twin.rooms = twin.rooms.map((r) => ({ ...r, n: renumber(r.n) })).reverse()
    twin.curves = twin.curves!.map((c) => ({ ...c, room: renumber(c.room) }))
    twin.items = twin.items.map((it, i) => ({ ...it, id: `x${i}` })).reverse()
    twin.walls = twin.walls.map((w, i) => ({ ...w, id: `y${i}` })).reverse()
    expect(layoutSig(twin)).toBe(layoutSig(s.stores[1].site))
    twin.walls.pop()
    expect(layoutSig(twin)).not.toBe(layoutSig(s.stores[1].site))
  })

  it('refuses a layout that does not fit, or that there is no money for', () => {
    const s = rich()
    const model = fitted(s)
    expect(openStore(s, 0)).toBeNull()
    expect(openStore(s, 2)).toBeNull()
    const [, mall, flagship] = s.stores
    const before = JSON.stringify(s.stores)
    // 13 x 11 m of layout (the street tree would be left behind) cannot go in a 10 x 8 m mall unit
    expect(layoutQuote(s, model.id, mall.id).error).toMatch(/takes up 13 x 11 m.*mall unit is only 10 x 8 m/)
    expect(copyLayout(s, model.id, mall.id)).toMatch(/takes up 13 x 11 m/)
    expect(copyLayout(s, model.id, model.id)).toMatch(/this store/)
    expect(copyLayout(s, model.id, 'nope')).toMatch(/No such store/)
    // an empty plot has nothing to copy
    const bare = s.stores[2]
    const kept = bare.site
    bare.site = newSite('store', 2)
    expect(copyLayout(s, bare.id, model.id)).toMatch(/nothing built/)
    bare.site = kept
    // not enough money: said so, with the price, and nothing is touched
    s.config.unlimitedMoney = false
    s.cash = -DIFFICULTY.normal.overdraft + 1000
    const q = layoutQuote(s, model.id, flagship.id)
    expect(q.error).toMatch(/Not enough cash: copying that layout here costs \$[\d,]+/)
    expect(q.cost).toBeGreaterThan(1000)
    expect(copyLayout(s, model.id, flagship.id)).toBe(q.error)
    expect(s.cash).toBe(-DIFFICULTY.normal.overdraft + 1000)
    expect(JSON.stringify(s.stores)).toBe(before)
    // the other way round fits: a mall unit's layout goes anywhere, and brings the mall's bare floor with it as paving
    s.cash = 5e6
    expect(placeItem(s, `store:${mall.id}`, 'planter', 0, 7, 0)).toBeNull()
    // the sales floor is tiles 1..8 x 1..5 and the planter stands at 0..1, 7
    expect(layoutQuote(s, mall.id, model.id).needs).toEqual([9, 7])
    expect(copyLayout(s, mall.id, flagship.id)).toBeNull()
    expect(flagship.site.items.map((i) => i.kind).sort()).toEqual(['counter', 'planter', 'table'])
    expect(flagship.site.floor).toEqual({})
    expect(storeStats(flagship.site).open).toBe(true)
    // a street tree in the layout is left out of a mall unit, and not charged for
    const small = fresh(3, { unlimitedMoney: true })
    expect(openStore(small, 0)).toBeNull()
    expect(openStore(small, 1)).toBeNull()
    const [unit, shop] = small.stores
    // cut the shop back to tiles 1..8 x 1..5 (its checkout goes with the part knocked down, so give it another)
    clearZone(small, `store:${shop.id}`, 9, 1, 12, 9)
    clearZone(small, `store:${shop.id}`, 1, 6, 12, 9)
    expect(placeItem(small, `store:${shop.id}`, 'counter', 7, 2, 0)).toBeNull()
    expect(placeItem(small, `store:${shop.id}`, 'otree', 0, 7, 0)).toBeNull()
    expect(placeItem(small, `store:${shop.id}`, 'bench', 1, 7, 0)).toBeNull()
    paintArea(small, `store:${shop.id}`, 0, 6, 8, 7, 'rect', 'grass')
    const fit = layoutQuote(small, shop.id, unit.id)
    expect(fit.error).toBeNull()
    // without the tree the layout is tiles 1..8 x 1..7
    expect(fit.needs).toEqual([8, 7])
    expect(copyLayout(small, shop.id, unit.id)).toBeNull()
    expect(unit.site.items.map((i) => i.kind).sort()).toEqual(['bench', 'counter', 'table'])
    expect(Object.values(unit.site.floor)).not.toContain('grass')
    for (const it of unit.site.items) expect(canPlace({ ...unit.site, items: unit.site.items.filter((x) => x !== it) }, it.kind, it.x, it.y, it.rot), it.kind).toBeNull()
  })

  it('opens a new store already fitted out as a copy', () => {
    const s = rich()
    const model = fitted(s)
    s.config.unlimitedMoney = false
    s.cash = 4e6
    const quote = newLayoutQuote(s, model.id, 2)
    expect(quote).toMatchObject({ error: null, resale: 0, build: layoutValue(model.site), needs: [14, 11] })
    expect(openStore(s, 2, undefined, model.id)).toBeNull()
    expect(s.cash).toBe(4e6 - SITE_TIERS.store[2].cost - quote.cost)
    const opened = s.stores[1]
    expect(opened.site.tier).toBe(2)
    expect(shape(opened.site)).toEqual(shape(model.site))
    expect(storeStats(opened.site).open).toBe(true)
    expect(s.news[0].text).toMatch(/new store opened/)
    // the same tier gives a copy tile for tile
    expect(openStore(s, 1, undefined, model.id)).toBeNull()
    expect(s.stores[2].site.grid).toEqual(model.site.grid)
    // too big for the plot, no such store, or no money for plot and fit-out together: nothing opens
    expect(openStore(s, 0, undefined, model.id)).toMatch(/takes up 13 x 11 m/)
    expect(openStore(s, 1, undefined, 'nope')).toMatch(/no such store/)
    expect(newLayoutQuote(s, model.id, 0).error).toMatch(/takes up/)
    s.cash = -DIFFICULTY.normal.overdraft + SITE_TIERS.store[1].cost + 100
    const cash = s.cash
    expect(openStore(s, 1, undefined, model.id)).toMatch(/Not enough cash: the plot and the fit-out come to \$[\d,]+/)
    expect(s.cash).toBe(cash)
    expect(s.stores).toHaveLength(3)
    // without a layout it opens as it always did
    expect(openStore(s, 1)).toBeNull()
    expect(s.stores[3].site.items.map((i) => i.kind)).toEqual(['table', 'counter'])
    expect(s.cash).toBe(cash - SITE_TIERS.store[1].cost)
  })
})
