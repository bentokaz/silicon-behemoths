// Undo and redo in the site builders: every kind of step goes back to exactly
// the site and the cash there were before it, and forward again to exactly
// what it made, through the sim's own actions.
import { beforeEach, describe, expect, it } from 'vitest'
import { clearZone, defaultConfig, newGame, paintArea, placeItems, removeItems, rotateItem, setEdges, setLook, setRoomStyle, upgradeOffice, zoneRoom } from '../sim/game'
import { ITEMS, isBoundary } from '../sim/sites'
import type { GameState } from '../sim/types'
import { HISTORY_LIMIT, canRedo, canUndo, forget, historySize, record, redo, settle, undo } from './siteHistory'

const REF = 'office'
/** A company on a plot with room to build: the garage, moved once. */
function game(): GameState {
  const s = newGame({ ...defaultConfig(), seed: 11, startCash: 50e6 })
  upgradeOffice(s)
  return s
}
const picture = (s: GameState) => ({ site: JSON.stringify(s.office), cash: s.cash, overhead: s.cur.overhead, nextId: s.nextId })
/** A free tile of open ground on the campus, far from the building. */
function openCorner(s: GameState): [number, number] {
  for (let y = 0; y < s.office.h - 4; y++) for (let x = 0; x < s.office.w - 5; x++) if (block(s, x, y, 5, 4)) return [x, y]
  throw new Error('no open ground')
}
const block = (s: GameState, x0: number, y0: number, w: number, h: number) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (s.office.grid[y * s.office.w + x] || s.office.items.some((i) => i.x === x && i.y === y)) return false
  return true
}

beforeEach(() => forget())

describe('site history', () => {
  it('undoes and redoes a room, with the cash', () => {
    const s = game()
    const [x, y] = openCorner(s)
    const before = picture(s)
    expect(record(s, REF, 'Lounge', (g) => zoneRoom(g, REF, 'lounge', x, y, x + 4, y + 3))).toBeNull()
    const after = picture(s)
    expect(after.cash).toBeLessThan(before.cash)
    expect(after.site).not.toBe(before.site)
    expect(canUndo(s, REF)).toBe('Lounge')

    const back = undo(s, REF)
    expect(back.done).toBe(true)
    expect(back.cash).toBe(before.cash - after.cash)
    expect(back.note).toBeUndefined()
    expect(picture(s)).toEqual(before)
    expect(canUndo(s, REF)).toBeNull()
    expect(canRedo(s, REF)).toBe('Lounge')

    expect(redo(s, REF).done).toBe(true)
    expect(picture(s)).toEqual(after)
    expect(canRedo(s, REF)).toBeNull()
  })

  it('undoes a row of furniture as one step and gives back the full price, not the half a sale would', () => {
    const s = game()
    const room = s.office.rooms[0]
    const spots: [number, number][] = []
    for (let i = 0; i < s.office.grid.length; i++) if (s.office.grid[i] === room.n) spots.push([i % s.office.w, Math.floor(i / s.office.w)])
    const row = spots.filter(([, y]) => y === spots[spots.length - 1][1])
    const before = picture(s)
    const out = record(s, REF, 'Plant', (g) => placeItems(g, REF, 'plant', row[0][0], row[0][1], row[row.length - 1][0], row[0][1], 0))
    expect(out.done).toBeGreaterThan(1)
    const after = picture(s)
    expect(before.cash - after.cash).toBe(out.done * ITEMS.office.plant.cost)
    expect(historySize(s, REF)).toEqual([1, 0])
    undo(s, REF)
    expect(picture(s)).toEqual(before)
    redo(s, REF)
    expect(picture(s)).toEqual(after)
  })

  it('undoes a sale and a turn', () => {
    const s = game()
    const desk = s.office.items.find((i) => i.kind === 'desk')!
    const start = picture(s)
    expect(record(s, REF, 'Turn', (g) => rotateItem(g, REF, desk.id))).toBeNull()
    const turned = picture(s)
    record(s, REF, 'Sell', (g) => removeItems(g, REF, [desk.id]))
    const sold = picture(s)
    expect(sold.cash).toBe(turned.cash + ITEMS.office.desk.cost / 2)
    undo(s, REF)
    expect(picture(s)).toEqual(turned)
    undo(s, REF)
    expect(picture(s)).toEqual(start)
    redo(s, REF)
    redo(s, REF)
    expect(picture(s)).toEqual(sold)
  })

  it('undoes a run of wall as one step', () => {
    const s = game()
    const edges: { x: number; y: number; side: 'n' | 'w' }[] = []
    for (let y = 0; y <= s.office.h && edges.length < 3; y++) for (let x = 0; x < s.office.w && edges.length < 3; x++) if (isBoundary(s.office, x, y, 'n') && !s.office.walls.some((w) => w.x === x && w.y === y && w.side === 'n')) edges.push({ x, y, side: 'n' })
    expect(edges.length).toBe(3)
    const before = picture(s)
    const out = record(s, REF, 'Glass wall', (g) => setEdges(g, REF, { edges }, 'glass'))
    expect(out.done).toBe(3)
    const after = picture(s)
    expect(historySize(s, REF)).toEqual([1, 0])
    undo(s, REF)
    expect(picture(s)).toEqual(before)
    redo(s, REF)
    expect(picture(s)).toEqual(after)
  })

  it('undoes paint: a room finish, ground, and the look of the building', () => {
    const s = game()
    const room = s.office.rooms[0]
    const [x, y] = openCorner(s)
    const start = picture(s)
    record(s, REF, 'Finish', (g) => setRoomStyle(g, REF, room.n, 1))
    const styled = picture(s)
    expect(styled.site).not.toBe(start.site)
    record(s, REF, 'Paving', (g) => paintArea(g, REF, x, y, x + 2, y + 2, 'rect', 'paving'))
    const paved = picture(s)
    expect(paved.site).not.toBe(styled.site)
    expect(record(s, REF, 'Cladding', (g) => setLook(g, REF, { facade: 1 }))).toBeNull()
    const clad = picture(s)
    expect(clad.cash).toBeLessThan(paved.cash)
    undo(s, REF)
    expect(picture(s)).toEqual(paved)
    undo(s, REF)
    expect(picture(s)).toEqual(styled)
    undo(s, REF)
    expect(picture(s)).toEqual(start)
    redo(s, REF)
    redo(s, REF)
    redo(s, REF)
    expect(picture(s)).toEqual(clad)
  })

  it('undoes a demolition: the room and what stood in it come back, and the cash goes back', () => {
    const s = game()
    const before = picture(s)
    record(s, REF, 'Demolish', (g) => clearZone(g, REF, 0, 0, g.office.w - 1, g.office.h - 1))
    expect(s.office.rooms.length).toBe(0)
    expect(s.cash).toBeGreaterThan(before.cash)
    undo(s, REF)
    expect(picture(s)).toEqual(before)
  })

  it('does nothing when there is nothing to undo or redo', () => {
    const s = game()
    const before = picture(s)
    expect(undo(s, REF)).toEqual({ done: false, label: '', cash: 0 })
    expect(redo(s, REF)).toEqual({ done: false, label: '', cash: 0 })
    expect(picture(s)).toEqual(before)
  })

  it('keeps no step for an action the sim refused', () => {
    const s = game()
    const room = s.office.rooms[0]
    const i = s.office.grid.indexOf(room.n)
    // on top of a room that is already there
    expect(record(s, REF, 'Lounge', (g) => zoneRoom(g, REF, 'lounge', i % s.office.w, Math.floor(i / s.office.w), i % s.office.w, Math.floor(i / s.office.w)))).toBe('That land is already built on')
    expect(historySize(s, REF)).toEqual([0, 0])
  })

  it('a new action after an undo clears what could be redone', () => {
    const s = game()
    const [x, y] = openCorner(s)
    record(s, REF, 'Lounge', (g) => zoneRoom(g, REF, 'lounge', x, y, x + 4, y + 3))
    undo(s, REF)
    expect(canRedo(s, REF)).toBe('Lounge')
    record(s, REF, 'Paving', (g) => paintArea(g, REF, x, y, x + 1, y + 1, 'rect', 'paving'))
    expect(canRedo(s, REF)).toBeNull()
    expect(redo(s, REF).done).toBe(false)
  })

  it('holds fifty steps and drops the oldest', () => {
    const s = game()
    const room = s.office.rooms[0]
    const styles = 4
    for (let k = 0; k < HISTORY_LIMIT + 10; k++) record(s, REF, `Finish ${k}`, (g) => setRoomStyle(g, REF, room.n, (k + 1) % styles))
    expect(historySize(s, REF)).toEqual([HISTORY_LIMIT, 0])
    let n = 0
    while (undo(s, REF).done) n++
    expect(n).toBe(HISTORY_LIMIT)
  })

  it('is dropped when the builder is left, when another game is loaded, and when the site changed behind it', () => {
    const s = game()
    const [x, y] = openCorner(s)
    record(s, REF, 'Lounge', (g) => zoneRoom(g, REF, 'lounge', x, y, x + 4, y + 3))
    forget(REF)
    expect(canUndo(s, REF)).toBeNull()

    record(s, REF, 'Paving', (g) => paintArea(g, REF, 0, 0, 1, 1, 'rect', 'paving'))
    const other = game()
    expect(canUndo(other, REF)).toBeNull()
    expect(undo(other, REF).done).toBe(false)

    const t = game()
    record(t, REF, 'Paving', (g) => paintArea(g, REF, 0, 0, 1, 1, 'rect', 'paving'))
    // the campus moves to a bigger plot from another screen
    upgradeOffice(t)
    const out = undo(t, REF)
    expect(out.done).toBe(false)
    expect(out.note).toMatch(/changed/)
    expect(canUndo(t, REF)).toBeNull()
  })

  it('after the day has changed, undo restores the site but settles the money at the sim’s own prices, and says so', () => {
    const s = game()
    const room = s.office.rooms[0]
    const i = s.office.grid.lastIndexOf(room.n)
    const [x, y] = [i % s.office.w, Math.floor(i / s.office.w)]
    const before = picture(s)
    const out = record(s, REF, 'Plant', (g) => placeItems(g, REF, 'plant', x, y, x, y, 0))
    expect(out.done).toBe(1)
    s.day += 3
    const back = undo(s, REF)
    expect(back.done).toBe(true)
    expect(back.cash).toBe(ITEMS.office.plant.cost / 2)
    expect(back.note).toMatch(/half price/)
    expect(JSON.stringify(s.office)).toBe(before.site)
    expect(s.cash).toBe(before.cash - ITEMS.office.plant.cost / 2)

    // a room built days ago: the floor comes up, the money for it does not come back
    const [ox, oy] = openCorner(s)
    record(s, REF, 'Lounge', (g) => zoneRoom(g, REF, 'lounge', ox, oy, ox + 4, oy + 3))
    const built = s.cash
    s.day += 1
    const gone = undo(s, REF)
    expect(gone.done).toBe(true)
    expect(s.cash).toBeLessThanOrEqual(built + 1e-9 + Math.max(0, gone.cash))
    expect(gone.note).toBeDefined()

    // something sold days ago is bought back at full price
    const desk = s.office.items.find((it) => it.kind === 'desk')!
    record(s, REF, 'Sell', (g) => removeItems(g, REF, [desk.id]))
    const afterSale = s.cash
    s.day += 1
    const rebought = undo(s, REF)
    expect(rebought.cash).toBe(-ITEMS.office.desk.cost)
    expect(s.cash).toBe(afterSale - ITEMS.office.desk.cost)
    expect(s.office.items.some((it) => it.id === desk.id)).toBe(true)
  })

  it('settles nothing between two identical layouts', () => {
    const s = game()
    expect(settle(s.office, JSON.parse(JSON.stringify(s.office)))).toBe(0)
  })
})
