// Where a lorry can drive on a factory site, and the manoeuvre that gets it
// from the road into a bay. A lorry comes along the road past the plot, up
// the drive, through the yard by a route that keeps clear of the buildings,
// the trees and whatever else stands there, pulls up past its bay and backs
// into it. It is all worked out once per layout, for looks alone.
import { ITEMS, itemTiles } from '../../sim/sites'
import type { Site, SiteItem } from '../../sim/types'
import { type ItemFrame, frameOf } from './spots'

type Pt = [number, number]

/** Tiles of open land kept round the plot in the driving map: pavement, the drive and the road beyond. */
const RING = 14
/** Half the length of a lorry between the points its heading is taken from. */
const AXLE = 2.3
/** Half the length of a bay, from where the lorry stands to its open end. */
const BAY_HALF = 4
const TURN = 3.8
/** Tiles of open ground round a factory plot before the neighbouring sheds begin. */
const APRON = 10

export interface Manoeuvre {
  /** The marked truck bay this uses, if there is one for the dock. */
  truck?: SiteItem
  /** Where the lorry stands to load, and the way its cab points there (out of the bay). */
  park: Pt
  out: Pt
  /** Driven forwards from far along the road to the point past the bay where it stops to back in. */
  arrive: Pt[]
  /** From where it stands, out through the mouth of the bay and round to that stopping point: driven backwards to get in. Empty if the lorry has to nose in instead. */
  back: Pt[]
  /** Driven forwards from where it stands to far along the road. Empty if it has to back out the way it came. */
  leave: Pt[]
}

export interface YardPlan {
  /** By shipping dock id. */
  docks: Map<string, Manoeuvre>
  /** Truck bays that have a dock to serve: their lorry is drawn on the move, not parked for good. */
  managed: Set<string>
}

interface Grid {
  gw: number
  gh: number
  /** 1 where the middle of a lorry may be. */
  ok: Uint8Array
  /** 1 where it also has room to swing: routes keep to these where they can, so a long vehicle does not clip a corner as it turns. */
  wide: Uint8Array
  x(cell: number): number
  z(cell: number): number
  at(x: number, z: number): number
}

function buildGrid(site: Site, free: Set<string>): Grid {
  const { w, h } = site
  const gw = w + RING * 2
  const gh = h + RING * 2
  const open = new Uint8Array(gw * gh)
  const defs = ITEMS[site.kind]
  const blocked = new Uint8Array(w * h)
  for (const it of site.items) {
    const def = defs[it.kind]
    if (!def || def.flat || free.has(it.id)) continue
    for (const [x, y] of itemTiles(site, it)) if (x >= 0 && y >= 0 && x < w && y < h) blocked[y * w + x] = 1
  }
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const x = gx - RING
      const y = gy - RING
      let ok: boolean
      if (x >= 0 && y >= 0 && x < w && y < h) ok = !site.grid[y * w + x] && !blocked[y * w + x] && site.floor[`${x},${y}`] !== 'water'
      else {
        // off the plot: the open apron round it (the nearest sheds stand further back), the drive in the middle of the south side, and the road
        const beyond = Math.max(-x, x - (w - 1), -y, y - (h - 1))
        const road = y >= h + 3 && y <= h + 10
        const drive = y >= h && Math.abs(x + 0.5 - w / 2) <= 3
        ok = beyond <= APRON || road || drive
      }
      open[gy * gw + gx] = ok ? 1 : 0
    }
  }
  // a lorry is three tiles wide with its mirrors: its middle needs clear ground on every side
  const ok = new Uint8Array(gw * gh)
  for (let gy = 1; gy < gh - 1; gy++) {
    for (let gx = 1; gx < gw - 1; gx++) {
      let clear = 1
      for (let dy = -1; dy <= 1 && clear; dy++) for (let dx = -1; dx <= 1; dx++) if (!open[(gy + dy) * gw + gx + dx]) clear = 0
      ok[gy * gw + gx] = clear
    }
  }
  const wide = new Uint8Array(gw * gh)
  for (let gy = 1; gy < gh - 1; gy++) {
    for (let gx = 1; gx < gw - 1; gx++) {
      let clear = 1
      for (let dy = -1; dy <= 1 && clear; dy++) for (let dx = -1; dx <= 1; dx++) if (!ok[(gy + dy) * gw + gx + dx]) clear = 0
      wide[gy * gw + gx] = clear
    }
  }
  return {
    gw,
    gh,
    ok,
    wide,
    x: (c) => (c % gw) - RING - w / 2 + 0.5,
    z: (c) => Math.floor(c / gw) - RING - h / 2 + 0.5,
    at: (x, z) => {
      const gx = Math.floor(x + w / 2) + RING
      const gy = Math.floor(z + h / 2) + RING
      return gx < 0 || gy < 0 || gx >= gw || gy >= gh ? -1 : gy * gw + gx
    },
  }
}

const clearAt = (g: Grid, x: number, z: number) => {
  const c = g.at(x, z)
  return c >= 0 && g.ok[c] === 1
}

/** True if a lorry could drive straight from one point to the other. */
function clearLine(g: Grid, a: Pt, b: Pt, mask: Uint8Array = g.ok): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4))
  for (let i = 0; i <= n; i++) {
    const c = g.at(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n)
    if (c < 0 || !mask[c]) return false
  }
  return true
}

/** The nearest cell a lorry can be in to a point, within a few tiles. */
function nearestClear(g: Grid, x: number, z: number, mask: Uint8Array = g.ok): number {
  let best = -1
  let bestD = Infinity
  for (let dz = -4; dz <= 4; dz++) {
    for (let dx = -4; dx <= 4; dx++) {
      const c = g.at(x + dx, z + dz)
      if (c < 0 || !mask[c]) continue
      const d = (g.x(c) - x) ** 2 + (g.z(c) - z) ** 2
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
  }
  return best
}

/** A way for a lorry from one point to another, as a few straight runs, or null if there is none. */
function drive(g: Grid, from: Pt, to: Pt): Pt[] | null {
  // with room to spare where there is a way that has it; otherwise as tight as a lorry can go
  return search(g, from, to, g.wide) ?? search(g, from, to, g.ok)
}

function search(g: Grid, from: Pt, to: Pt, mask: Uint8Array): Pt[] | null {
  const a = nearestClear(g, from[0], from[1], mask)
  const b = nearestClear(g, to[0], to[1], mask)
  if (a < 0 || b < 0) return null
  const n = g.gw * g.gh
  const cost = new Float32Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const done = new Uint8Array(n)
  // the map is small and this runs once per layout: a plain search with a linear scan for the nearest is enough
  const open: number[] = [a]
  cost[a] = 0
  const bx = b % g.gw
  const by = Math.floor(b / g.gw)
  while (open.length) {
    let k = 0
    let bestF = Infinity
    for (let i = 0; i < open.length; i++) {
      const c = open[i]
      const f = cost[c] + Math.hypot((c % g.gw) - bx, Math.floor(c / g.gw) - by)
      if (f < bestF) {
        bestF = f
        k = i
      }
    }
    const c = open[k]
    open[k] = open[open.length - 1]
    open.pop()
    if (c === b) break
    if (done[c]) continue
    done[c] = 1
    const cx = c % g.gw
    const cy = Math.floor(c / g.gw)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || y < 0 || x >= g.gw || y >= g.gh) continue
        const j = y * g.gw + x
        if (!mask[j] || done[j]) continue
        if (dx && dy && (!mask[cy * g.gw + x] || !mask[y * g.gw + cx])) continue
        const ng = cost[c] + (dx && dy ? 1.4142 : 1)
        if (ng < cost[j]) {
          cost[j] = ng
          prev[j] = c
          open.push(j)
        }
      }
    }
  }
  if (!Number.isFinite(cost[b])) return null
  const cells: number[] = []
  for (let c = b; c >= 0; c = prev[c]) cells.push(c)
  cells.reverse()
  const pts: Pt[] = cells.map((c) => [g.x(c), g.z(c)])
  // pull the route tight: keep only the corners it has to turn at
  const out: Pt[] = [pts[0]]
  let i = 0
  while (i < pts.length - 1) {
    let j = pts.length - 1
    while (j > i + 1 && !clearLine(g, pts[i], pts[j], mask)) j--
    out.push(pts[j])
    i = j
  }
  return out
}

/** Rounds the corners of a route so a long vehicle swings through them. */
function soften(pts: Pt[], radius = 2.2): Pt[] {
  if (pts.length < 3) return pts
  const out: Pt[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, pz] = pts[i - 1]
    const [x, z] = pts[i]
    const [nx, nz] = pts[i + 1]
    const la = Math.hypot(x - px, z - pz)
    const lb = Math.hypot(nx - x, nz - z)
    const r = Math.min(radius, la / 2, lb / 2)
    if (r < 0.2) {
      out.push(pts[i])
      continue
    }
    const a: Pt = [x + ((px - x) / la) * r, z + ((pz - z) / la) * r]
    const b: Pt = [x + ((nx - x) / lb) * r, z + ((nz - z) / lb) * r]
    for (let k = 0; k <= 4; k++) {
      const t = k / 4
      out.push([(1 - t) * (1 - t) * a[0] + 2 * t * (1 - t) * x + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * t * (1 - t) * z + t * t * b[1]])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

interface BayDef {
  truck?: SiteItem
  park: Pt
  out: Pt
}

/** The stretch of open ground outside the wall behind (or beside) a dock, when there is no marked bay to use. */
function wallBay(site: Site, f: ItemFrame): BayDef {
  const dirs: Pt[] = [
    [-f.sin, -f.cos],
    [f.cos, -f.sin],
    [-f.cos, f.sin],
    [f.sin, f.cos],
  ]
  let best: BayDef | null = null
  let bestK = Infinity
  dirs.forEach(([dx, dz], order) => {
    // sample a little off the centre line so a two-tile dock lands in one tile or the other
    const sx = f.cx + Math.abs(dz) * 0.25
    const sz = f.cz + Math.abs(dx) * 0.25
    for (let k = 1; k < 80; k++) {
      const tx = Math.floor(sx + dx * k + site.w / 2)
      const ty = Math.floor(sz + dz * k + site.h / 2)
      const outside = tx < 0 || ty < 0 || tx >= site.w || ty >= site.h || !site.grid[ty * site.w + tx]
      if (!outside) continue
      const score = k + order * 1.5
      if (score < bestK) {
        bestK = score
        const edge = k - 0.5
        best = { park: [f.cx + dx * (edge + 4.15), f.cz + dz * (edge + 4.15)], out: [dx, dz] }
      }
      break
    }
  })
  return best ?? { park: [f.cx, f.cz - 6], out: [0, -1] }
}

/** How a lorry gets into and out of one bay, or null if nothing can be driven there cleanly. */
function manoeuvre(site: Site, g: Grid, bay: BayDef): Manoeuvre | null {
  const { w, h } = site
  const road = h / 2 + 7
  const [ox, oz] = bay.out
  const at = (along: number, across: number, side: number): Pt => [bay.park[0] + ox * along + -oz * side * across, bay.park[1] + oz * along + ox * side * across]
  // the lorry goes back by whichever end of the road is nearer the bay
  const near = bay.park[0] < 0 ? -1 : 1
  const end = (sign: number): Pt => [sign * (w / 2 + RING - 2), road]
  const beyond = (sign: number): Pt => [sign * (w / 2 + 70), road]
  const from = end(near)
  const far = beyond(near)
  const mouth = BAY_HALF + 0.8
  // it pulls across the front of the bay in the direction it was already going, where there is room to
  const along = (bay.park[0] - from[0]) * -oz + (bay.park[1] - from[1]) * ox
  for (const side of along >= 0 ? [1, -1] : [-1, 1]) {
    // pull up across the front of the bay, past it, then back round a quarter turn into it
    const lane = mouth + TURN
    const q0 = at(lane, -3.2, side)
    const q1 = at(lane, TURN + 2.4, side)
    const arc: Pt[] = []
    for (let k = 0; k <= 8; k++) {
      const t = (k / 8) * (Math.PI / 2)
      arc.push(at(mouth + TURN * Math.sin(t), TURN - TURN * Math.cos(t), side))
    }
    // the last of the arc is the mouth of the bay, hard against whatever the bay stands beside: only the swing has to be clear
    // the whole length of the lorry has to fit on the lane at both ends of the pull-up
    if (!clearLine(g, at(lane, -3.2 - 3.6, side), at(lane, TURN + 2.4 + 3.6, side)) || arc.slice(3).some((p) => !clearAt(g, p[0], p[1]))) continue
    // it comes from the end of the road that lets it pull across the bay without turning back on itself
    const heading = -oz * side
    const sign = heading > 0.3 ? -1 : heading < -0.3 ? 1 : near
    const route = drive(g, end(sign), q0)
    if (!route) continue
    const exit = drive(g, at(mouth + 1.5, 0, side), from)
    if (!exit) continue
    return { truck: bay.truck, park: bay.park, out: bay.out, arrive: [beyond(sign), ...soften([...route, q0, q1], 3)], back: [bay.park, at(mouth, 0, side), ...arc, q1], leave: [bay.park, ...soften([at(mouth + 1.5, 0, side), ...exit]), far] }
  }
  // no room to swing round: nose in along the bay, and back out the way it came
  const front = at(mouth + 1.5, 0, 1)
  const route = clearAt(g, front[0], front[1]) ? drive(g, from, front) : null
  if (route) return { truck: bay.truck, park: bay.park, out: [-ox, -oz], arrive: [far, ...soften([...route, front]), at(0.2, 0, 1)], back: [], leave: [] }
  return null
}

/** Works out how each shipping dock's lorry comes and goes. `docks` are the docks with a line behind them. */
export function planYard(site: Site, docks: SiteItem[]): YardPlan {
  const plan: YardPlan = { docks: new Map(), managed: new Set() }
  if (site.kind !== 'factory' || !docks.length) return plan
  const trucks = site.items.filter((i) => i.kind === 'truck')
  const used = new Set<string>()
  for (const dock of docks) {
    const f = frameOf(site, dock)
    // the nearest marked bay nobody else is using
    let truck: SiteItem | undefined
    let bestD = Infinity
    for (const t of trucks) {
      if (used.has(t.id)) continue
      const tf = frameOf(site, t)
      const d = Math.hypot(tf.cx - f.cx, tf.cz - f.cz)
      if (d < bestD) {
        bestD = d
        truck = t
      }
    }
    let move: Manoeuvre | null = null
    if (truck) {
      // every other bay's parked lorry is in the way; this one's own bay is not
      const g = buildGrid(site, new Set([truck.id]))
      const tf = frameOf(site, truck)
      // a bay is open at whichever end has room to drive up to it: the cab end if both do
      const front: Pt = [tf.sin, tf.cos]
      const openEnd = (d: Pt) => clearAt(g, tf.cx + d[0] * (BAY_HALF + 2), tf.cz + d[1] * (BAY_HALF + 2))
      move = manoeuvre(site, g, { truck, park: [tf.cx, tf.cz], out: openEnd(front) || !openEnd([-front[0], -front[1]]) ? front : [-front[0], -front[1]] })
      if (move) {
        used.add(truck.id)
        plan.managed.add(truck.id)
      }
    }
    // no marked bay, or one that nothing can be driven into cleanly (its lorry then stays standing in it): up to the wall behind the dock
    if (!move) {
      const bay = wallBay(site, f)
      const [ox, oz] = bay.out
      const away: Pt = [bay.park[0] + ox * 46, bay.park[1] + oz * 46]
      move = manoeuvre(site, buildGrid(site, new Set()), bay) ?? { park: bay.park, out: bay.out, arrive: [], back: [bay.park, away], leave: [bay.park, away] }
    }
    plan.docks.set(dock.id, move)
  }
  return plan
}

/** Total length of a route. */
export function lengthOf(pts: Pt[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return len
}

/** The point a distance `s` along a route; before its start or past its end, straight on along the first or last run. */
export function pointAt(pts: Pt[], s: number, out: Pt): Pt {
  if (pts.length < 2) {
    out[0] = pts[0]?.[0] ?? 0
    out[1] = pts[0]?.[1] ?? 0
    return out
  }
  let i = 1
  let left = s
  if (s > 0) {
    for (; i < pts.length - 1; i++) {
      const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      if (left <= len) break
      left -= len
    }
  }
  const ax = pts[i - 1][0]
  const az = pts[i - 1][1]
  const dx = pts[i][0] - ax
  const dz = pts[i][1] - az
  const len = Math.hypot(dx, dz) || 1
  out[0] = ax + (dx / len) * left
  out[1] = az + (dz / len) * left
  return out
}

const P1: Pt = [0, 0]
const P2: Pt = [0, 0]

/** Where a lorry is and which way it points with its middle a distance `s` along a route: its two ends both lie on the route, so it swings through the bends. Returns x, z and the turn about the vertical. */
export function lorryAt(pts: Pt[], s: number, out: [number, number, number]): [number, number, number] {
  pointAt(pts, s - AXLE, P1)
  pointAt(pts, s + AXLE, P2)
  out[0] = (P1[0] + P2[0]) / 2
  out[1] = (P1[1] + P2[1]) / 2
  out[2] = Math.atan2(P2[0] - P1[0], P2[1] - P1[1])
  return out
}
