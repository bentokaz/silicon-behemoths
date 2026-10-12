// Undo and redo for the site builders (campus, factory, stores, venue).
//
// HOW IT TREATS THE SITE
// Every change the builder makes goes through `record`, which runs the sim's
// own action (zoneRoom, placeItems, setEdges, setLook ...) and keeps a picture
// of the site from just before it and just after it. One call is one step, so
// a row of twenty desks or a run of twenty stretches of wall, which the sim
// does in one action, is undone in one go. Undo puts the picture from before
// back; redo runs the sim's action again, so it is charged, refused or locked
// by the sim's rules exactly as the first time.
//
// HOW IT TREATS MONEY
// The sim has no way to take a purchase back at the price paid: selling an
// item returns half, knocking a room down returns nothing for the room. So an
// undo cannot be "the opposite action" without quietly costing the player
// half of every slip of the hand. Instead:
//
//   * Undo on the SAME game day as the step gives back exactly what the step
//     cost (or takes back exactly what it paid out), in cash and in the
//     month's accounts. Nothing has been used yet, so nothing is owed.
//   * Undo AFTER the day has changed still restores the site, but the money
//     follows the sim's own prices for getting from the one layout to the
//     other: anything the step put down is sold at the sim's second-hand rate
//     (half), rooms, walls and cladding it built are not refunded, and
//     anything the step sold or knocked down is bought again at full price.
//     Otherwise a month of desks could be had for nothing by undoing them.
//     The result says so, for the builder to tell the player.
//
// A step can only be undone while the site is exactly as that step left it;
// if anything else has changed it (a move to a bigger plot, a copied layout)
// the history is dropped rather than guessed at. It is also dropped when the
// builder is left (`forget`), when another game is loaded (the game object is
// a different one), and it holds 50 steps at most, oldest dropped first.
import { EDGE_COST, canAfford, lookCost, roomCost, siteOf } from '../sim/game'
import { ITEMS } from '../sim/sites'
import type { GameState, Site } from '../sim/types'

/** Most steps kept per site. */
export const HISTORY_LIMIT = 50

interface Shot {
  /** The site, as JSON. */
  site: string
  cash: number
  /** The month's running total of the cost line building is booked to. */
  booked: number
  nextId: number
  day: number
}

interface Step {
  /** What it was, in a few words: "Desk", "Lounge", "Glass wall". */
  label: string
  before: Shot
  after: Shot
  /** The sim action itself, to run again on redo. */
  again: (s: GameState) => unknown
}

interface History {
  game: GameState
  undo: Step[]
  redo: Step[]
}

/** What came of an undo or a redo: whether anything changed, and a line for the player when there is something to say. */
export interface Outcome {
  done: boolean
  label: string
  /** Cash that came back (positive) or was paid (negative). */
  cash: number
  /** Something the player should be told: why it could not be done, or that the money was settled at ordinary prices. */
  note?: string
}

const stacks = new Map<string, History>()

/** The cost line a site's building work is booked to (the same rule as the sim's own). */
const bucketOf = (site: Site) => (site.kind === 'office' ? 'overhead' : 'facilities')

function historyOf(s: GameState, ref: string): History {
  let h = stacks.get(ref)
  // another game was started or loaded: what is here belongs to a company that is gone
  if (!h || h.game !== s) stacks.set(ref, (h = { game: s, undo: [], redo: [] }))
  return h
}

const shoot = (s: GameState, site: Site): Shot => ({ site: JSON.stringify(site), cash: s.cash, booked: s.cur[bucketOf(site)], nextId: s.nextId, day: s.day })

/** Puts a picture of the site back, in place: whatever holds the site keeps holding the same object. */
function restore(site: Site, json: string) {
  const was = JSON.parse(json) as Site
  for (const key of Object.keys(site)) if (!(key in was)) delete (site as unknown as Record<string, unknown>)[key]
  Object.assign(site, was)
}

/**
 * What the sim's own prices make of going from one layout to another, when
 * the step is no longer fresh: positive is money back, negative money owed.
 * `from` is the site as it stands, `to` the one being restored.
 */
export function settle(from: Site, to: Site): number {
  const defs = ITEMS[to.kind]
  let cash = 0
  // furniture: what goes is sold second-hand, what comes back is bought new
  const had = new Set(from.items.map((i) => i.id))
  const keeps = new Set(to.items.map((i) => i.id))
  for (const it of from.items) if (!keeps.has(it.id)) cash += (defs[it.kind]?.cost ?? 0) / 2
  for (const it of to.items) if (!had.has(it.id)) cash -= defs[it.kind]?.cost ?? 0
  // floor: rebuilding what was knocked down is paid for by the tile; knocking down returns nothing
  const back = new Map<string, number>()
  if (from.w === to.w && from.h === to.h) {
    for (let i = 0; i < to.grid.length; i++) {
      const n = to.grid[i]
      if (!n || from.grid[i]) continue
      const type = to.rooms.find((r) => r.n === n)?.type
      if (type) back.set(type, (back.get(type) ?? 0) + 1)
    }
  }
  for (const [type, tiles] of back) cash -= roomCost(to, type, tiles)
  // walls: a door or a pane that comes back is fitted again; plain wall and openings are free
  const wallKey = (w: { x: number; y: number; side: string; kind: string }) => `${w.x},${w.y},${w.side},${w.kind}`
  const stood = new Set(from.walls.map(wallKey))
  for (const w of to.walls) if (!stood.has(wallKey(w))) cash -= EDGE_COST[w.kind as keyof typeof EDGE_COST] ?? 0
  ;(to.curves ?? []).forEach((c, k) => {
    const now = from.curves?.[k]?.walls ?? {}
    for (const [bay, kind] of Object.entries(c.walls ?? {})) if (now[bay] !== kind) cash -= EDGE_COST[kind as keyof typeof EDGE_COST] ?? 0
  })
  // cladding, roof and storeys, at what the sim asks for the change
  cash -= lookCost(from, { facade: to.facade, roof: to.roof, floors: to.floors })
  return cash
}

/**
 * Run a builder action through the history. `fn` is the sim's own action; if
 * it changes the site (or the cash) the step is kept, and anything that had
 * been undone can no longer be redone. A refused action leaves no step.
 */
export function record<T>(s: GameState, ref: string, label: string, fn: (s: GameState) => T): T {
  const site = siteOf(s, ref)
  if (!site) return fn(s)
  const h = historyOf(s, ref)
  const before = shoot(s, site)
  const out = fn(s)
  const now = siteOf(s, ref)
  if (!now) return out
  const after = shoot(s, now)
  if (after.site === before.site && after.cash === before.cash) return out
  h.undo.push({ label, before, after, again: fn })
  if (h.undo.length > HISTORY_LIMIT) h.undo.splice(0, h.undo.length - HISTORY_LIMIT)
  h.redo.length = 0
  return out
}

/** The step an undo would take back, by its label, or null when there is none. */
export const canUndo = (s: GameState, ref: string): string | null => {
  const h = stacks.get(ref)
  return h && h.game === s && h.undo.length ? h.undo[h.undo.length - 1].label : null
}
/** The step a redo would do again, or null. */
export const canRedo = (s: GameState, ref: string): string | null => {
  const h = stacks.get(ref)
  return h && h.game === s && h.redo.length ? h.redo[h.redo.length - 1].label : null
}
/** Steps held for a site: [to undo, to redo]. */
export const historySize = (s: GameState, ref: string): [number, number] => {
  const h = stacks.get(ref)
  return h && h.game === s ? [h.undo.length, h.redo.length] : [0, 0]
}

/** Drop a site's history: the builder was left. With no reference, every site's. */
export function forget(ref?: string) {
  if (ref === undefined) stacks.clear()
  else stacks.delete(ref)
}

const NOTHING: Outcome = { done: false, label: '', cash: 0 }
const CHANGED = 'The building has changed since then, so the earlier steps can no longer be undone.'

/** Take back the last step. Nothing to undo is a no-op. */
export function undo(s: GameState, ref: string): Outcome {
  const h = historyOf(s, ref)
  const step = h.undo[h.undo.length - 1]
  if (!step) return NOTHING
  const site = siteOf(s, ref)
  if (!site || JSON.stringify(site) !== step.after.site) {
    h.undo.length = 0
    h.redo.length = 0
    return { ...NOTHING, label: step.label, note: CHANGED }
  }
  const bucket = bucketOf(site)
  const paid = step.before.cash - step.after.cash
  const fresh = s.day === step.after.day
  let back = paid
  let note: string | undefined
  if (!fresh) {
    back = settle(site, JSON.parse(step.before.site) as Site)
    if (back < 0 && !canAfford(s, -back)) return { done: false, label: step.label, cash: 0, note: `Not enough cash to undo that: time has passed, so what it removed is bought again at full price ($${Math.round(-back).toLocaleString()}).` }
    if (back !== paid) note = back < 0 ? 'Time has passed since that step, so what it removed was bought again at full price.' : back > 0 ? 'Time has passed since that step, so what it added was sold at half price and the building work was not refunded.' : 'Time has passed since that step, so the building work was not refunded.'
  }
  h.undo.pop()
  restore(site, step.before.site)
  // nothing else has touched the money: put the very figures back, to the cent
  if (fresh && s.cash === step.after.cash) s.cash = step.before.cash
  else s.cash += back
  if (fresh && s.cur[bucket] === step.after.booked) s.cur[bucket] = step.before.booked
  else s.cur[bucket] -= back
  // the ids the step used are free again, so doing it again makes the very same things
  if (s.nextId === step.after.nextId) s.nextId = step.before.nextId
  h.redo.push(step)
  return { done: true, label: step.label, cash: back, note }
}

/** Do the last undone step again, through the sim's own action. Nothing to redo is a no-op. */
export function redo(s: GameState, ref: string): Outcome {
  const h = historyOf(s, ref)
  const step = h.redo[h.redo.length - 1]
  if (!step) return NOTHING
  const site = siteOf(s, ref)
  if (!site || JSON.stringify(site) !== step.before.site) {
    h.redo.length = 0
    return { ...NOTHING, label: step.label, note: CHANGED }
  }
  const before = shoot(s, site)
  const out = step.again(s)
  const after = shoot(s, site)
  if (after.site === before.site && after.cash === before.cash) {
    // the sim would not do it this time (the money is gone, for one): say why and leave the step where it is
    const why = typeof out === 'string' ? out : out && typeof out === 'object' && 'error' in out && typeof out.error === 'string' ? out.error : 'That can no longer be done.'
    return { done: false, label: step.label, cash: 0, note: why }
  }
  h.redo.pop()
  h.undo.push({ ...step, before, after })
  if (h.undo.length > HISTORY_LIMIT) h.undo.splice(0, h.undo.length - HISTORY_LIMIT)
  return { done: true, label: step.label, cash: after.cash - before.cash }
}
