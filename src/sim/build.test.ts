// Building tools: rows of furniture and runs of wall in one action, rooms that
// join, curved walls shared between rooms, ground finishes that suit the plot,
// and copying a store's layout.
import { describe, expect, it } from 'vitest'
import { SHOP_LOT, SHOP_SLOTS, places, shopLots, shopScale } from '../3d/city/plan'
import { buildNav } from '../3d/site/nav'
import { bayBeyond, bayRun, bayStands, curveAt, curveTiles, geomOf } from './curves'
import { DIFFICULTY, EDGE_COST, clearZone, copyLayout, defaultConfig, layoutQuote, layoutValue, newGame, newLayoutQuote, openStore, paintArea, paintFloor, placeItem, placeItems, removeItems, removeRoom, setEdge, setEdges, setLook, setRoomStyle, upgradeOffice, zoneRoom } from './game'
import { ITEMS, SITE_TIERS, canPlace, defaultGround, edgeRuns, gridAt, groundAt, groundsFor, hasGround, isBoundary, newSite, openRooms, roomTiles, rowSpots, sealedRooms, storeStats, wallAt, wholeRun } from './sites'
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
    expect(placeItems(s, 'office', 'nothing', 3, 4, 9, 4, 0).error).toMatch(/Unknown/)
    // money for three and a bit: three go down, and the result says so
    s.cash = -DIFFICULTY.normal.overdraft + 3 * 1200 + 500
    const short = placeItems(s, 'office', 'desk', 3, 4, 10, 4, 0)
    expect(short.done).toBe(3)
    expect(short.short).toBe(5)
    expect(short.cost).toBe(3600)
    expect(short.error).toBe('Placed 3 of 8: not enough cash for the rest')
    expect(s.cash).toBe(-DIFFICULTY.normal.overdraft + 500)
    expect(placeItems(s, 'office', 'desk', 6, 4, 10, 4, 0).error).toBe('Not enough cash')
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
    // two different rooms against the same stretch of curve cannot both share it: those tiles square off
    expect(zoneRoom(t, 'office', 'lounge', 13, 2, 16, 6)).toBeNull()
    expect(zoneRoom(t, 'office', 'gym', 13, 7, 16, 12)).toBeNull()
    wallsClose(t.office)
    expect(sealedRooms(t.office)).toEqual([])
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
    // copying again costs less: the cladding, roof and storeys are already there
    const again = layoutQuote(s, model.id, flagship.id)
    expect(again.build).toBeLessThan(quote.build)
    expect(again.resale).toBe(copy.items.reduce((a, i) => a + ITEMS.store[i.kind].cost / 2, 0))
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

describe('the city map', () => {
  it('finds a place for every store, sharing plots once each has one', () => {
    const slots = SHOP_SLOTS
    expect(slots).toHaveLength(13)
    // up to one store a plot, each has the whole plot and stands where it always did
    const few = shopLots(slots, 13)
    expect(few.map((l) => [l!.x, l!.z])).toEqual(slots)
    expect(few.every((l) => l!.size === SHOP_LOT.w && l!.shared === 1)).toBe(true)
    expect(shopScale({ w: 22, h: 18 }, SHOP_LOT.w)).toBe(1)
    // the fourteenth shares the first plot: both of those shrink to a quarter of it, the rest stay as they were
    const more = shopLots(slots, 14)
    expect(more[0]).toMatchObject({ size: 12, shared: 2, lot: more[13]!.lot })
    expect(more[13]!.z).toBe(more[0]!.z)
    expect(more[13]!.x - more[0]!.x).toBe(12)
    expect(more[5]).toEqual(few[5])
    expect(shopScale({ w: 10, h: 8 }, 12)).toBe(1)
    expect(shopScale({ w: 22, h: 18 }, 12)).toBeCloseTo(10.8 / 22)
    // every count up to the limit gives every store its own ground, inside its plot, overlapping nobody
    for (const count of [1, 13, 14, 31, 52, 53, 117, 118, 208]) {
      const lots = shopLots(slots, count)
      expect(lots).toHaveLength(count)
      const seen = new Set<string>()
      for (const l of lots) {
        expect(l, String(count)).not.toBeNull()
        const [sx, sz] = l!.lot.split(',').map(Number)
        expect(Math.abs(l!.x - sx) + l!.size / 2).toBeLessThanOrEqual(SHOP_LOT.w / 2 + 1e-9)
        expect(Math.abs(l!.z - sz) + l!.size / 2).toBeLessThanOrEqual(SHOP_LOT.d / 2 + 1e-9)
        const key = `${l!.x.toFixed(3)},${l!.z.toFixed(3)}`
        expect(seen.has(key), `${count} ${key}`).toBe(false)
        seen.add(key)
      }
    }
    // past sixteen to a plot there is no more room: the extra ones are left off the map
    const over = shopLots(slots, 210)
    expect(over.filter((l) => !l)).toHaveLength(2)
    // in a game: thirty-one stores at home are thirty-one places to click, none on top of another
    const s = rich()
    for (let i = 0; i < 31; i++) expect(openStore(s, i % 3)).toBeNull()
    const shops = places(s).filter((p) => p.kind === 'store')
    expect(shops).toHaveLength(31)
    expect(new Set(shops.map((p) => `${p.x},${p.z}`)).size).toBe(31)
    for (const p of shops) {
      expect(p.w).toBeGreaterThanOrEqual(8)
      expect(p.site!.w * p.scale!).toBeLessThanOrEqual(p.w)
      expect(p.site!.h * p.scale!).toBeLessThanOrEqual(p.d)
      expect(p.crowded).toBe(true)
    }
    for (const a of shops) for (const b of shops) if (a !== b) expect(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 1e-9 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2 - 1e-9, `${a.id} ${b.id}`).toBe(true)
  })
})
