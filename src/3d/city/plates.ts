// The plates over the city: what each of the company's places says about
// itself, and which of them are shown, in what form, for a given view. The
// words and the counts come from the simulation's own account of what needs
// the player (sim/insight), so a plate and the Overview's list always agree.
// Nothing here draws.
import { int, pct } from '../../components/format'
import { type Attention, type Plate, attention, plates } from '../../sim/insight'
import { homeRegion } from '../../sim/regions'
import type { GameState } from '../../sim/types'
import type { District } from './plan'

export type PlateTone = 'neg' | 'warn' | 'pos' | 'dim'

export interface CityPlate {
  /** The id of the place it stands over (see `places` in plan.ts). */
  placeId: string
  storeId?: string
  title: string
  lines: { text: string; tone?: PlateTone }[]
  /** How many things there need the player, and how bad the worst of them is. */
  needs: number
  tone: 'neg' | 'warn' | null
  /** Each of those things, in a sentence: said on hover. */
  notes: string[]
  where: { tab: string; view?: string }
}

/** The place in the city (see `places` in plan.ts) that one of the simulation's places is; a store is told apart by its id. */
const placeId = (place: Plate['place'] | Attention['place'], storeId?: string): string | null => (place === 'campus' ? 'office' : place === 'store' ? (storeId ? `store:${storeId}` : null) : place === 'marketing' ? null : place)
/** The place a plate stands over. */
export const placeOfPlate = (p: Plate) => placeId(p.place, p.id)
/** The place something that needs the player belongs to, if it has a building. */
export const placeOfNeed = (a: Attention) => placeId(a.place, a.storeId)

/**
 * Where the port's plate leads: to the company's devices, where stock is read
 * and reordered row by row, and which is open from the first day (the factory
 * screen, where the simulation points, is not).
 */
const PORT_LEADS = { tab: 'products' }

/** The first clause of a sentence: enough for a line on a plate. */
const clause = (text: string) => text.split(/[:.](\s|$)/)[0]

/**
 * One plate per place the company has. Whatever needs the player and has no
 * building of its own (a recall, which is decided under Marketing; a debt
 * before the company has anything to do with the exchange) is put on the
 * campus, so that nothing on the Overview's list is missing from the city.
 */
export function cityPlates(g: GameState): CityPlate[] {
  const todo = attention(g)
  const out: CityPlate[] = []
  for (const p of plates(g)) {
    const at = placeOfPlate(p)
    if (!at) continue
    const mine = todo.filter((a) => placeOfNeed(a) === at)
    out.push({ placeId: at, storeId: p.place === 'store' ? p.id : undefined, title: p.title, lines: p.lines.slice(0, 2), needs: mine.length, tone: mine.some((a) => a.tone === 'neg') ? 'neg' : mine.length ? 'warn' : null, notes: mine.map((a) => a.text), where: p.place === 'port' ? PORT_LEADS : p.where })
  }
  const homeless = todo.filter((a) => !out.some((p) => p.placeId === placeOfNeed(a)))
  const campus = out.find((p) => p.placeId === 'office')
  if (campus && homeless.length) {
    campus.lines = [...campus.lines, { text: homeless.length === 1 ? clause(homeless[0].text) : `${int(homeless.length)} more things need you`, tone: homeless.some((a) => a.tone === 'neg') ? 'neg' : 'warn' }]
    campus.needs += homeless.length
    campus.notes = [...campus.notes, ...homeless.map((a) => a.text)]
    if (homeless.some((a) => a.tone === 'neg')) campus.tone = 'neg'
    else campus.tone ??= 'warn'
    // with nothing else to see to on the campus, a click goes where that one thing is decided
    if (campus.needs === homeless.length) campus.where = homeless[0].where
  }
  return out
}

export interface RegionPlate {
  /** The region's id. */
  id: string
  title: string
  line: string
  state: 'home' | 'open' | 'closed'
  /** Where on the ground it stands. */
  x: number
  z: number
}

/** One plate per district, for the regions layer: its name and, in a line, how the company stands there. */
export function regionPlates(g: GameState, all: District[]): RegionPlate[] {
  const home = homeRegion(g)
  return all.map((d) => {
    const st = g.regions[d.region.id]
    const stores = g.stores.filter((s) => s.region === d.region.id).length
    const state = d.region.id === home ? 'home' : st?.open ? 'open' : 'closed'
    const standing = `${int(stores)} ${stores === 1 ? 'store' : 'stores'}, awareness ${pct(st?.awareness ?? 0, 0)}`
    return { id: d.region.id, title: d.region.name, line: state === 'home' ? `Home: ${standing}` : state === 'open' ? `Open: ${standing}` : 'Not entered', state, x: d.x, z: d.z }
  })
}

// ---------------------------------------------------------------- which plates show

/** A plate in full, as a small mark with a count, or not at all. */
export type PlateForm = 'full' | 'mark' | 'none'

export interface PlateBox {
  id: string
  /** Where its foot is on screen (the middle of its bottom edge), and how big it is in full. */
  x: number
  y: number
  w: number
  h: number
  needs: number
  /** Which goes first when two want the same room: lower wins. */
  rank: number
  /** How far the place is from the camera. */
  dist: number
  /** The plate of a district rather than of a building. */
  region?: boolean
  /** Under the pointer: always shown in full, whatever else. */
  pinned?: boolean
}

export interface Placed {
  form: PlateForm
  /** The top left corner it is drawn at. */
  left: number
  top: number
}

/** Past this distance from the camera a building's plate is only a mark, and only if something there needs the player. */
export const PLATE_FAR = 650
/** The side of a mark, in px. */
export const MARK = 22
/** The most of the view the plates may take between them. */
export const PLATE_SHARE = 0.18
/** A band along the top of the view that is the toolbar's. */
export const PLATE_TOP = 40
/** Room kept between two plates. */
const GAP = 4

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}
const hits = (a: Rect, b: Rect) => a.x0 < b.x1 + GAP && b.x0 < a.x1 + GAP && a.y0 < b.y1 + GAP && b.y0 < a.y1 + GAP

/**
 * Which plates are shown for a view, and where. Plates never lie on one
 * another and never take more than `PLATE_SHARE` of the view between them:
 * what needs the player goes first, then the nearer and more important
 * places, and a plate that finds no room is a mark with its count if it has
 * something to say and is left out if it has not. Far off, every building's
 * plate is a mark or nothing. With the regions layer on, the districts' plates
 * are the ones shown in full and the buildings keep only their marks.
 */
export function arrange(boxes: PlateBox[], view: { w: number; h: number }, regions: boolean): Map<string, Placed> {
  const out = new Map<string, Placed>()
  const taken: Rect[] = []
  let area = 0
  const budget = view.w * view.h * PLATE_SHARE
  const order = [...boxes].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || Number(!!b.region) - Number(!!a.region) || Number(b.needs > 0) - Number(a.needs > 0) || a.rank - b.rank || a.dist - b.dist || (a.id < b.id ? -1 : 1))
  for (const box of order) {
    // kept inside the view, under the toolbar's band
    const left = Math.min(Math.max(GAP, box.x - box.w / 2), Math.max(GAP, view.w - box.w - GAP))
    const top = Math.max(PLATE_TOP, box.y - box.h)
    const rect = { x0: left, y0: top, x1: left + box.w, y1: top + box.h }
    const wanted = box.pinned || (box.region ? regions : !regions && box.dist <= PLATE_FAR)
    if (wanted && (box.pinned || (area + box.w * box.h <= budget && !taken.some((t) => hits(t, rect))))) {
      taken.push(rect)
      area += box.w * box.h
      out.set(box.id, { form: 'full', left, top })
      continue
    }
    if (box.needs > 0 && !box.region) {
      const ml = Math.min(Math.max(GAP, box.x - MARK / 2), view.w - MARK - GAP)
      const mt = Math.max(PLATE_TOP, box.y - MARK)
      const mark = { x0: ml, y0: mt, x1: ml + MARK, y1: mt + MARK }
      // a mark steps aside from a plate it would lie on, upward first, and is shown either way
      const clash = taken.find((t) => hits(t, mark))
      const lifted = clash ? { ...mark, y0: clash.y0 - GAP - MARK, y1: clash.y0 - GAP } : mark
      const free = lifted.y0 >= PLATE_TOP && !taken.some((t) => hits(t, lifted)) ? lifted : mark
      taken.push(free)
      area += MARK * MARK
      out.set(box.id, { form: 'mark', left: free.x0, top: free.y0 })
      continue
    }
    out.set(box.id, { form: 'none', left, top })
  }
  return out
}

/** What a view's plates cover between them, as a share of it: the figure `PLATE_SHARE` bounds. */
export function covered(boxes: PlateBox[], placed: Map<string, Placed>, view: { w: number; h: number }): number {
  let area = 0
  for (const box of boxes) {
    const at = placed.get(box.id)
    if (at?.form === 'full') area += box.w * box.h
    else if (at?.form === 'mark') area += MARK * MARK
  }
  return area / Math.max(1, view.w * view.h)
}
