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
const TURN = 4.2

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
        // off the plot: the pavement round it, the drive in the middle of the south side, and the road
        const beyond = Math.max(-x, x - (w - 1), -y, y - (h - 1))
        const road = y >= h + 3 && y <= h + 10
        const drive = y >= h && Math.abs(x + 0.5 - w / 2) <= 3
        ok = beyond <= 2 || road || drive
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
  return {
    gw,
    gh,
    ok,
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
function clearLine(g: Grid, a: Pt, b: Pt): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4))
  for (let i = 0; i <= n; i++) if (!clearAt(g, a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n)) return false
  return true
}

/** The nearest cell a lorry can be in to a point, within a few tiles. */
function nearestClear(g: Grid, x: number, z: number): number {
  let best = -1
  let bestD = Infinity
  for (let dz = -4; dz <= 4; dz++) {
    for (let dx = -4; dx <= 4; dx++) {
      const c = g.at(x + dx, z + dz)
      if (c < 0 || !g.ok[c]) continue
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
  const a = nearestClear(g, from[0], from[1])
  const b = nearestClear(g, to[0], to[1])
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
        if (!g.ok[j] || done[j]) continue
        if (dx && dy && (!g.ok[cy * g.gw + x] || !g.ok[y * g.gw + cx])) continue
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
    while (j > i + 1 && !clearLine(g, pts[i], pts[j])) j--
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

/** Works out how each shipping dock's lorry comes and goes. `docks` are the docks with a line behind them. */
export function planYard(site: Site, docks: SiteItem[]): YardPlan {
  const plan: YardPlan = { docks: new Map(), managed: new Set() }
  if (site.kind !== 'factory' || !docks.length) return plan
  const { w, h } = site
  const trucks = site.items.filter((i) => i.kind === 'truck')
  const used = new Set<string>()
  const road = h / 2 + 7
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
    if (truck) used.add(truck.id)
    // every other bay's parked lorry is in the way; this one's own bay is not
    const g = buildGrid(site, new Set(truck ? [truck.id] : []))
    let bay: BayDef
    if (truck) {
      const tf = frameOf(site, truck)
      // a bay is open at whichever end has room to drive up to it: the cab end if both do
      const front: Pt = [tf.sin, tf.cos]
      const openEnd = (d: Pt) => clearAt(g, tf.cx + d[0] * (BAY_HALF + 2), tf.cz + d[1] * (BAY_HALF + 2))
      bay = { truck, park: [tf.cx, tf.cz], out: openEnd(front) || !openEnd([-front[0], -front[1]]) ? front : [-front[0], -front[1]] }
    } else bay = wallBay(site, f)

    const [ox, oz] = bay.out
    const at = (along: number, across: number, side: number): Pt => [bay.park[0] + ox * along + -oz * side * across, bay.park[1] + oz * along + ox * side * across]
    // the lorry comes from whichever end of the road is nearer the bay, and goes back the same way
    const from: Pt = [(bay.park[0] < 0 ? -1 : 1) * (w / 2 + RING - 2), road]
    const far: Pt = [(bay.park[0] < 0 ? -1 : 1) * (w / 2 + 70), road]
    const mouth = BAY_HALF + 1.2
    let done = false
    for (const side of [1, -1]) {
      // pull up across the front of the bay, past it, then back round a quarter turn into it
      const lane = mouth + TURN
      const q0 = at(lane, -5.5, side)
      const q1 = at(lane, TURN + 2.6, side)
      const arc: Pt[] = []
      for (let k = 0; k <= 8; k++) {
        const a = (k / 8) * (Math.PI / 2)
        arc.push(at(mouth + TURN * Math.sin(a), TURN - TURN * Math.cos(a), side))
      }
      if (!clearLine(g, q0, q1) || arc.some((p) => !clearAt(g, p[0], p[1]))) continue
      const route = drive(g, from, q0)
      if (!route) continue
      const exit = drive(g, at(mouth + 1.5, 0, side), from)
      if (!exit) continue
      plan.docks.set(dock.id, { truck, park: bay.park, out: bay.out, arrive: [far, ...soften([...route, q0]), q1], back: [bay.park, at(mouth, 0, side), ...arc, q1], leave: [bay.park, ...soften([at(mouth + 1.5, 0, side), ...exit]), far] })
      done = true
      break
    }
    if (!done) {
      // no room to swing round: nose in along the bay, and back out the way it came
      const route = drive(g, from, at(mouth + 1.5, 0, 1))
      const arrive: Pt[] = route ? [far, ...soften([...route, at(mouth + 1.5, 0, 1)]), at(0.2, 0, 1)] : [at(46, 0, 1), at(0.2, 0, 1)]
      plan.docks.set(dock.id, { truck, park: bay.park, out: route ? [-ox, -oz] : bay.out, arrive: route ? arrive : [], back: route ? [] : [bay.park, at(46, 0, 1)], leave: route ? [] : [bay.park, at(46, 0, 1)] })
    }
    if (truck) plan.managed.add(truck.id)
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
