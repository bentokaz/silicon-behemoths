// Curved outlines for rooms: discs, rings and arcs. The tile grid stays the
// truth for what is a room; a curve only says where, inside the tiles it
// crosses, the real edge of the building runs. Everything here is plain
// geometry worked out from a curve's few numbers, so nothing but those
// numbers is saved.
import type { Curve, Site } from './types'

export type Pt = [number, number]
export type Side = 'n' | 's' | 'e' | 'w'
export type Band = 'o' | 'i' | 'a' | 'b'

/** One straight stretch of a curved wall. Several make up a bay. */
export interface Facet {
  /** The bay it belongs to: band letter and number, e.g. "o12". Doors and glazing are set per bay. */
  bay: string
  band: Band
  x0: number
  y0: number
  x1: number
  y1: number
  /** Unit normals pointing out of the room at each end, for a smooth surface. */
  nx0: number
  ny0: number
  nx1: number
  ny1: number
  len: number
  /** Where it sits in its bay, and how many stretches the bay has. */
  part: number
  parts: number
}

/** The part of a facet that lies inside one tile, as fractions along it. */
export interface Piece {
  facet: number
  t0: number
  t1: number
}

/** A tile the curve passes through: what is room, what is left as ground, and the wall between. */
export interface TileShape {
  x: number
  y: number
  /** Share of the tile that is room, 0-1. */
  cover: number
  /** Convex pieces that together are the room's part of the tile, and the rest. */
  inside: Pt[][]
  outside: Pt[][]
  /** For each side of the tile, the stretches of it (0-1 from its north or west end) that are room. */
  sides: Record<Side, [number, number][]>
  pieces: Piece[]
}

/** A metre or so of curved wall that can carry a door or glazing. */
export interface Bay {
  key: string
  band: Band
  /** Middle of the bay and the way out of the room there. */
  x: number
  y: number
  nx: number
  ny: number
  len: number
  facets: number[]
  /** Tiles the bay crosses, keyed "x,y". */
  tiles: string[]
  /** False where some of the bay runs along a grid line and so is an ordinary straight wall. */
  solid: boolean
}

export interface CurveGeom {
  /** Tiles the outline crosses, keyed "x,y". */
  tiles: Map<string, TileShape>
  /** Every tile the shape touches, with how much of it is covered. */
  all: { x: number; y: number; cover: number }[]
  facets: Facet[]
  /** Closed runs of facets, in order round the shape. */
  loops: number[][]
  bays: Map<string, Bay>
}

export type CurveSpec = Omit<Curve, 'room' | 'walls' | 'square'>

/** Tiles covered by less than this are not part of the shape at all. */
const MIN_COVER = 1e-4
const FULL = 1 - 1e-6
/** Thinnest ring: thinner than this and one tile could touch both of its walls. */
export const MIN_THICK = 2
/** Smallest radius that still reads as a curve. */
export const MIN_RADIUS = 1
/** A stretch of wall shorter than this, in metres, only squares off a corner the curve clips. */
export const CLIP = 0.03

// ---------------------------------------------------------------- polygons

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx

export function polyArea(p: Pt[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    a += x0 * y1 - x1 * y0
  }
  return Math.abs(a) / 2
}
const signedArea = (p: Pt[]) => {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    a += x0 * y1 - x1 * y0
  }
  return a / 2
}

/** The part of a convex polygon on one side of the line through (ox, oy) along (dx, dy). */
function clipHalf(poly: Pt[], ox: number, oy: number, dx: number, dy: number, sign: number): Pt[] {
  if (poly.length < 3) return []
  const out: Pt[] = []
  let prev = poly[poly.length - 1]
  let pd = sign * cross(dx, dy, prev[0] - ox, prev[1] - oy)
  for (const cur of poly) {
    const cd = sign * cross(dx, dy, cur[0] - ox, cur[1] - oy)
    if (cd >= 0) {
      if (pd < 0) {
        const t = pd / (pd - cd)
        out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t])
      }
      out.push(cur)
    } else if (pd >= 0) {
      const t = pd / (pd - cd)
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t])
    }
    prev = cur
    pd = cd
  }
  return out
}

/** The overlap of two convex polygons. */
function clipPoly(subject: Pt[], clip: Pt[], clipSign: number): Pt[] {
  let out = subject
  for (let i = 0; i < clip.length && out.length >= 3; i++) {
    const a = clip[i]
    const b = clip[(i + 1) % clip.length]
    out = clipHalf(out, a[0], a[1], b[0] - a[0], b[1] - a[1], clipSign)
  }
  return out
}

const keep = (p: Pt[]) => p.length >= 3 && polyArea(p) > 1e-9

// ---------------------------------------------------------------- ellipses

/** A direction for an angle in degrees: 0 is east, 90 south. Quarter turns come out exact. */
export function dirOf(deg: number): Pt {
  const d = ((deg % 360) + 360) % 360
  if (d % 90 === 0) return ([[1, 0], [0, 1], [-1, 0], [0, -1]] as Pt[])[d / 90]
  const r = (d * Math.PI) / 180
  return [Math.cos(r), Math.sin(r)]
}

interface Loop {
  pts: Pt[]
  /** Outward normals (away from the centre) at each point. */
  nor: Pt[]
  /** How many of the facets, counted from the first point, belong to the drawn arc. */
  arc: number
  /** Facets per bay. */
  sub: number
}

/**
 * Points round a whole ellipse, spaced evenly along its length, with the
 * stretch from `from` over `sweep` degrees laid out first in bays of about a
 * metre. The rest of the ellipse is only there to clip tiles against.
 */
function tessellate(cx: number, cy: number, rx: number, ry: number, from: number, sweep: number): Loop {
  const param = (deg: number) => {
    const [dx, dy] = dirOf(deg)
    const t = Math.atan2(rx * dy, ry * dx)
    return t < 0 ? t + Math.PI * 2 : t
  }
  const full = sweep >= 360
  const t0 = param(from)
  let t1 = full ? t0 + Math.PI * 2 : param(from + sweep)
  while (t1 <= t0 + 1e-9) t1 += Math.PI * 2
  // tight curves get shorter facets, so they stay within a centimetre or so of the true line
  const tight = Math.min(rx, ry) ** 2 / Math.max(rx, ry)
  const sub = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(1 / (8 * tight * 0.012)))))
  const at = (t: number): Pt => [cx + rx * Math.cos(t), cy + ry * Math.sin(t)]
  const span = (ta: number, tb: number, whole: boolean): Pt[] => {
    const steps = Math.max(256, Math.ceil(((tb - ta) / (Math.PI * 2)) * 2048))
    const acc = [0]
    let prev = at(ta)
    for (let i = 1; i <= steps; i++) {
      const p = at(ta + ((tb - ta) * i) / steps)
      acc.push(acc[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]))
      prev = p
    }
    const total = acc[steps]
    let bays = Math.max(1, Math.round(total))
    if (whole) bays = Math.max(8, Math.round(bays / 4) * 4)
    const n = bays * sub
    const out: Pt[] = [at(ta)]
    let k = 0
    for (let i = 1; i < n; i++) {
      const want = (total * i) / n
      while (k < steps - 1 && acc[k + 1] < want) k++
      const f = (want - acc[k]) / Math.max(1e-12, acc[k + 1] - acc[k])
      out.push(at(ta + ((tb - ta) * (k + f)) / steps))
    }
    out.push(at(tb))
    return out
  }
  const arcPts = span(t0, t1, full)
  const arc = arcPts.length - 1
  const pts = full ? arcPts.slice(0, -1) : [...arcPts, ...span(t1, t0 + Math.PI * 2, false).slice(1, -1)]
  const nor = pts.map(([x, y]): Pt => {
    const nx = (x - cx) / (rx * rx)
    const ny = (y - cy) / (ry * ry)
    const l = Math.hypot(nx, ny) || 1
    return [nx / l, ny / l]
  })
  return { pts, nor, arc, sub }
}

/** How a tile lies against an ellipse: wholly inside, wholly outside, or across its edge. */
function against(x: number, y: number, cx: number, cy: number, rx: number, ry: number, slack: number): 'in' | 'out' | 'cross' {
  let inside = true
  for (const [px, py] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
    if (((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 > (1 - slack) ** 2) inside = false
  }
  if (inside) return 'in'
  const nx = (Math.min(Math.max(cx, x), x + 1) - cx) / rx
  const ny = (Math.min(Math.max(cy, y), y + 1) - cy) / ry
  return nx * nx + ny * ny >= 1 ? 'out' : 'cross'
}

interface Cell {
  poly: Pt[]
  sign: number
  box: [number, number, number, number]
}
/** Convex cells covering the strip just outside a loop: tiles are cut against these. */
function strip(loop: Loop, width: number): Cell[] {
  const n = loop.pts.length
  const out: Cell[] = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const a = loop.pts[i]
    const b = loop.pts[j]
    const poly: Pt[] = [a, b, [b[0] + loop.nor[j][0] * width, b[1] + loop.nor[j][1] * width], [a[0] + loop.nor[i][0] * width, a[1] + loop.nor[i][1] * width]]
    const xs = poly.map((p) => p[0])
    const ys = poly.map((p) => p[1])
    out.push({ poly, sign: Math.sign(signedArea(poly)) || 1, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] })
  }
  return out
}

const cache = new Map<string, CurveGeom>()

/** The ring's inner radii, or null when the shape has no hole. */
export function holeOf(c: CurveSpec): [number, number] | null {
  if (!c.t) return null
  const rx = c.rx - c.t
  const ry = c.ry - c.t
  return rx >= MIN_RADIUS - 1e-9 && ry >= MIN_RADIUS - 1e-9 ? [rx, ry] : null
}

/** Everything about a curve that follows from its numbers. Worked out once and remembered. */
export function geomOf(c: CurveSpec): CurveGeom {
  const from = c.from ?? 0
  const sweep = Math.min(360, c.sweep ?? 360)
  const id = `${c.cx},${c.cy},${c.rx},${c.ry},${c.t ?? 0},${from},${sweep}`
  const hit = cache.get(id)
  if (hit) {
    // most recently used last, so the oldest can be dropped
    cache.delete(id)
    cache.set(id, hit)
    return hit
  }
  const geom = build(c.cx, c.cy, c.rx, c.ry, holeOf(c), from, sweep)
  cache.set(id, geom)
  if (cache.size > 96) cache.delete(cache.keys().next().value as string)
  return geom
}

function build(cx: number, cy: number, rx: number, ry: number, hole: [number, number] | null, from: number, sweep: number): CurveGeom {
  const outer = tessellate(cx, cy, rx, ry, from, sweep)
  const inner = hole ? tessellate(cx, cy, hole[0], hole[1], from, sweep) : null
  const outerSign = Math.sign(signedArea(outer.pts)) || 1
  const innerSign = inner ? Math.sign(signedArea(inner.pts)) || 1 : 1
  const beyond = strip(outer, 1.6)
  const body = inner ? strip(inner, 1.6) : []
  const slack = 0.02 / Math.min(rx, ry)
  const holeSlack = hole ? 0.02 / Math.min(hole[0], hole[1]) : 0
  const full = sweep >= 360
  const da = dirOf(from)
  const db = dirOf(from + sweep)

  const tiles = new Map<string, TileShape>()
  const all: CurveGeom['all'] = []
  for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx); x++) {
      const rect: Pt[] = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]]
      const o = against(x, y, cx, cy, rx, ry, slack)
      if (o === 'out') continue
      const h = hole ? against(x, y, cx, cy, hole[0], hole[1], holeSlack) : 'out'
      if (h === 'in') continue
      let inside: Pt[][] = [rect]
      const outside: Pt[][] = []
      const near = (c: Cell) => c.box[0] < x + 1 && c.box[2] > x && c.box[1] < y + 1 && c.box[3] > y
      if (o === 'cross') {
        inside = [clipPoly(rect, outer.pts, outerSign)].filter(keep)
        for (const c of beyond) if (near(c)) outside.push(clipPoly(rect, c.poly, c.sign))
      }
      if (inner && h === 'cross') {
        const next: Pt[][] = []
        for (const p of inside) {
          outside.push(clipPoly(p, inner.pts, innerSign))
          for (const c of body) if (near(c)) next.push(clipPoly(p, c.poly, c.sign))
        }
        inside = next.filter(keep)
      }
      if (!full) {
        const next: Pt[][] = []
        for (const p of inside) {
          if (sweep <= 180) {
            const q = clipHalf(p, cx, cy, da[0], da[1], 1)
            next.push(clipHalf(q, cx, cy, db[0], db[1], -1))
            outside.push(clipHalf(p, cx, cy, da[0], da[1], -1), clipHalf(q, cx, cy, db[0], db[1], 1))
          } else {
            // more than half a turn: what is cut away is the wedge between the two ends
            const q = clipHalf(p, cx, cy, db[0], db[1], 1)
            outside.push(clipHalf(q, cx, cy, da[0], da[1], -1))
            next.push(clipHalf(p, cx, cy, db[0], db[1], -1), clipHalf(q, cx, cy, da[0], da[1], 1))
          }
        }
        inside = next.filter(keep)
      }
      const cover = inside.reduce((a, p) => a + polyArea(p), 0)
      if (cover <= MIN_COVER) continue
      all.push({ x, y, cover: Math.min(1, cover) })
      if (cover < FULL) tiles.set(`${x},${y}`, { x, y, cover, inside, outside: outside.filter(keep), sides: sidesOf(x, y, inside), pieces: [] })
    }
  }

  // ---- the walls: the drawn arc of each ellipse, and the two straight ends of an arc
  const facets: Facet[] = []
  const loops: number[][] = []
  const run = (band: Band, pts: Pt[], nor: Pt[], sub: number): number[] => {
    const ids: number[] = []
    for (let i = 0; i + 1 < pts.length; i++) {
      const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
      if (len < 1e-9) continue
      const bays = Math.ceil((pts.length - 1) / sub)
      const bay = Math.min(bays - 1, Math.floor(i / sub))
      ids.push(facets.length)
      facets.push({ bay: `${band}${bay}`, band, x0: pts[i][0], y0: pts[i][1], x1: pts[i + 1][0], y1: pts[i + 1][1], nx0: nor[i][0], ny0: nor[i][1], nx1: nor[i + 1][0], ny1: nor[i + 1][1], len, part: i - bay * sub, parts: sub })
    }
    return ids
  }
  const arcOf = (loop: Loop, flip: boolean) => {
    const pts = full ? [...loop.pts, loop.pts[0]] : loop.pts.slice(0, loop.arc + 1)
    const nor = (full ? [...loop.nor, loop.nor[0]] : loop.nor.slice(0, loop.arc + 1)).map(([nx, ny]): Pt => (flip ? [-nx, -ny] : [nx, ny]))
    return { pts, nor }
  }
  /** A straight end wall from one point to another, in bays of about a metre. */
  const straight = (band: Band, a: Pt, b: Pt, nx: number, ny: number) => {
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])))
    const pts: Pt[] = []
    for (let i = 0; i <= n; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n])
    return run(band, pts, pts.map(() => [nx, ny] as Pt), 1)
  }
  const oa = arcOf(outer, false)
  const outerRun = run('o', oa.pts, oa.nor, outer.sub)
  const ia = inner ? arcOf(inner, true) : null
  if (full) {
    loops.push(outerRun)
    if (ia && inner) loops.push(run('i', ia.pts, ia.nor, inner.sub))
  } else {
    const centre: Pt = [cx, cy]
    const endOuter = oa.pts[oa.pts.length - 1]
    const startOuter = oa.pts[0]
    const endInner = ia ? ia.pts[ia.pts.length - 1] : centre
    const startInner = ia ? ia.pts[0] : centre
    // out of the room is against the turn at the first end, with it at the last
    const loop = [...outerRun, ...straight('b', endOuter, endInner, -db[1], db[0])]
    if (ia && inner) loop.push(...run('i', [...ia.pts].reverse(), [...ia.nor].reverse(), inner.sub))
    loop.push(...straight('a', startInner, startOuter, da[1], -da[0]))
    loops.push(loop)
  }

  const bays = new Map<string, Bay>()
  const drawn = new Map<string, number>()
  const stray: Piece[] = []
  facets.forEach((f, index) => {
    let bay = bays.get(f.bay)
    if (!bay) bays.set(f.bay, (bay = { key: f.bay, band: f.band, x: 0, y: 0, nx: 0, ny: 0, len: 0, facets: [], tiles: [], solid: true }))
    bay.facets.push(index)
    bay.len += f.len
    const dx = f.x1 - f.x0
    const dy = f.y1 - f.y0
    for (let ty = Math.floor(Math.min(f.y0, f.y1) - 1e-9); ty <= Math.floor(Math.max(f.y0, f.y1) + 1e-9); ty++) {
      for (let tx = Math.floor(Math.min(f.x0, f.x1) - 1e-9); tx <= Math.floor(Math.max(f.x0, f.x1) + 1e-9); tx++) {
        // the stretch of the facet inside this tile
        let t0 = 0
        let t1 = 1
        let miss = false
        for (const [p, q] of [[-dx, f.x0 - tx], [dx, tx + 1 - f.x0], [-dy, f.y0 - ty], [dy, ty + 1 - f.y0]]) {
          if (Math.abs(p) < 1e-12) {
            if (q < 0) miss = true
          } else if (p < 0) t0 = Math.max(t0, q / p)
          else t1 = Math.min(t1, q / p)
        }
        if (miss || (t1 - t0) * f.len < 1e-6) continue
        const ax = f.x0 + dx * t0
        const ay = f.y0 + dy * t0
        const bx = f.x0 + dx * t1
        const by = f.y0 + dy * t1
        // a stretch lying along a grid line is left to the ordinary straight walls
        const on = (v0: number, v1: number, line: number) => Math.abs(v0 - line) < 1e-7 && Math.abs(v1 - line) < 1e-7
        if (on(ax, bx, tx) || on(ax, bx, tx + 1) || on(ay, by, ty) || on(ay, by, ty + 1)) continue
        const key = `${tx},${ty}`
        const tile = tiles.get(key)
        if (!tile) {
          // a corner the curve clips by a centimetre or two is too small to be floor, so its tile is not part of
          // the shape; the wall still runs through it, and is drawn with the tile it carries on into
          if ((t1 - t0) * f.len < CLIP) stray.push({ facet: index, t0, t1 })
          continue
        }
        tile.pieces.push({ facet: index, t0, t1 })
        if (!bay.tiles.includes(key)) bay.tiles.push(key)
        drawn.set(f.bay, (drawn.get(f.bay) ?? 0) + (t1 - t0) * f.len)
      }
    }
  })
  for (const piece of stray) {
    const f = facets[piece.facet]
    const dx = (f.x1 - f.x0) / f.len
    const dy = (f.y1 - f.y0) / f.len
    const ax = f.x0 + (f.x1 - f.x0) * piece.t0
    const ay = f.y0 + (f.y1 - f.y0) * piece.t0
    const bx = f.x0 + (f.x1 - f.x0) * piece.t1
    const by = f.y0 + (f.y1 - f.y0) * piece.t1
    // the tile just before the clipped corner along the wall, or failing that the one just after
    const host = tiles.get(`${Math.floor(ax - dx * 1e-4)},${Math.floor(ay - dy * 1e-4)}`) ?? tiles.get(`${Math.floor(bx + dx * 1e-4)},${Math.floor(by + dy * 1e-4)}`)
    if (!host) continue
    host.pieces.push(piece)
    drawn.set(f.bay, (drawn.get(f.bay) ?? 0) + (piece.t1 - piece.t0) * f.len)
  }
  for (const bay of bays.values()) {
    bay.solid = (drawn.get(bay.key) ?? 0) >= bay.len - 1e-4
    // the middle of the bay, measured along it
    let left = bay.len / 2
    for (const i of bay.facets) {
      const f = facets[i]
      if (left <= f.len + 1e-12) {
        const t = Math.min(1, left / f.len)
        bay.x = f.x0 + (f.x1 - f.x0) * t
        bay.y = f.y0 + (f.y1 - f.y0) * t
        const nx = f.nx0 + (f.nx1 - f.nx0) * t
        const ny = f.ny0 + (f.ny1 - f.ny0) * t
        const l = Math.hypot(nx, ny) || 1
        bay.nx = nx / l
        bay.ny = ny / l
        break
      }
      left -= f.len
    }
  }
  return { tiles, all, facets, loops, bays }
}

/** Which stretches of each side of a tile the room's pieces reach. */
function sidesOf(x: number, y: number, inside: Pt[][]): Record<Side, [number, number][]> {
  const raw: Record<Side, [number, number][]> = { n: [], s: [], e: [], w: [] }
  const on = (v: number, line: number) => Math.abs(v - line) < 1e-7
  for (const p of inside) {
    for (let i = 0; i < p.length; i++) {
      const [ax, ay] = p[i]
      const [bx, by] = p[(i + 1) % p.length]
      const add = (side: Side, u: number, v: number) => Math.abs(u - v) > 1e-9 && raw[side].push([Math.min(u, v), Math.max(u, v)])
      if (on(ay, y) && on(by, y)) add('n', ax - x, bx - x)
      else if (on(ay, y + 1) && on(by, y + 1)) add('s', ax - x, bx - x)
      else if (on(ax, x) && on(bx, x)) add('w', ay - y, by - y)
      else if (on(ax, x + 1) && on(bx, x + 1)) add('e', ay - y, by - y)
    }
  }
  const merge = (list: [number, number][]) => {
    list.sort((a, b) => a[0] - b[0])
    const out: [number, number][] = []
    for (const [a, b] of list) {
      const last = out[out.length - 1]
      if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b)
      else out.push([Math.max(0, a), Math.min(1, b)])
    }
    return out
  }
  return { n: merge(raw.n), s: merge(raw.s), e: merge(raw.e), w: merge(raw.w) }
}

const spanLength = (spans: [number, number][]) => spans.reduce((a, [u, v]) => a + v - u, 0)
/** The stretches of a side that a list of spans leaves uncovered. */
export function gaps(spans: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  let from = 0
  for (const [u, v] of spans) {
    if (u > from + 1e-9) out.push([from, u])
    from = Math.max(from, v)
  }
  if (from < 1 - 1e-9) out.push([from, 1])
  return out
}
/** Total length shared by two lists of spans. */
function overlap(a: [number, number][], b: [number, number][]): number {
  let total = 0
  for (const [u0, v0] of a) for (const [u1, v1] of b) total += Math.max(0, Math.min(v0, v1) - Math.max(u0, u1))
  return total
}

// ---------------------------------------------------------------- curves on a site

type Plot = Pick<Site, 'w' | 'h' | 'grid' | 'curves' | 'cuts'>
const at = (site: Pick<Site, 'w' | 'h' | 'grid'>, x: number, y: number) => (x >= 0 && y >= 0 && x < site.w && y < site.h ? site.grid[y * site.w + x] || 0 : 0)
const SIDES: [Side, Side, number, number][] = [['n', 's', 0, -1], ['s', 'n', 0, 1], ['e', 'w', 1, 0], ['w', 'e', -1, 0]]

export interface LiveTile {
  /** Index into site.curves. */
  curve: number
  shape: TileShape
  /**
   * The room on the far side of the curved wall here, which owns the part of
   * the tile the curve leaves over; 0 where that part is open ground.
   */
  beyond: number
}

interface Found {
  curve: number
  shape: TileShape
  squared: boolean
}

/** The curve whose outline crosses a tile of its own room, whether or not the tile still follows it. */
function candidate(site: Plot, x: number, y: number): Found | undefined {
  if (!site.curves?.length) return undefined
  const n = at(site, x, y)
  if (!n) return undefined
  const key = `${x},${y}`
  let found: Found | undefined
  for (let i = 0; i < site.curves.length; i++) {
    const c = site.curves[i]
    if (c.room !== n || x < c.cx - c.rx - 1 || x > c.cx + c.rx || y < c.cy - c.ry - 1 || y > c.cy + c.ry) continue
    const shape = geomOf(c).tiles.get(key)
    if (!shape) continue
    if (!c.square?.[key]) return { curve: i, shape, squared: false }
    found ??= { curve: i, shape, squared: true }
  }
  return found
}

interface Contact {
  /** The other room that owns the corner the curve leaves over here: the one standing against most of it. 0 for none. */
  room: number
  /** Open ground (or the edge of the plot) lies against the far side. */
  ground: boolean
  /** Tiles of the same curved wall whose own left-over part joins this one's, and the length of edge they share. */
  curved: [number, number, number][]
  /** The tile cannot keep its curve: its own room's floor stands against the far side of it. */
  clash: boolean
}

/**
 * What a tile's curved edge has on its far side, read from the tiles next to
 * it. Where two different rooms stand against the one corner, the room with
 * the longer hold on it takes it (the lower number if they tie): the straight
 * wall between that corner and the other room is drawn by the grid edge, like
 * any other wall between two rooms.
 */
function contact(site: Plot, curve: number, shape: TileShape): Contact {
  const c = site.curves![curve]
  const out: Contact = { room: 0, ground: false, curved: [], clash: false }
  /** Metres of this tile's open edge that each other room stands against. */
  const held = new Map<number, number>()
  const hold = (n: number, len: number) => held.set(n, (held.get(n) ?? 0) + len)
  let sides = 0
  let shut = 0
  for (const [side, far, dx, dy] of SIDES) {
    if (spanLength(shape.sides[side]) > 0.98) continue
    sides++
    const nx = shape.x + dx
    const ny = shape.y + dy
    const n = at(site, nx, ny)
    if (!n) {
      out.ground = true
      continue
    }
    // the half a slanted wall cuts away is open ground like any other
    if (site.cuts?.[`${nx},${ny}`]?.includes(far)) {
      out.ground = true
      continue
    }
    const open = gaps(shape.sides[side])
    const other = candidate(site, nx, ny)
    if (other && (n === c.room || !other.squared)) {
      // more curved wall. Floor of its own room along what is cut away here cannot be walled off from itself;
      // another room's floor there simply stands against this corner like any other
      const floor = overlap(open, other.shape.sides[far])
      if (floor > 0.02) {
        if (n === c.room) out.clash = true
        else hold(n, floor)
        continue
      }
      const shared = overlap(open, gaps(other.shape.sides[far]))
      if (other.curve === curve && !other.squared && shared > 0.02) out.curved.push([nx, ny, shared])
      else if (n !== c.room) out.ground = true
      else if (other.squared) shut++
      continue
    }
    // the room's own floor: the curve cannot stand between a room and itself
    if (n === c.room) out.clash = true
    else hold(n, spanLength(open))
  }
  // every open side faces a squared-off tile of its own room: the corner the curve leaves is a pocket in the floor
  if (sides && shut === sides) out.clash = true
  let most = 0
  for (const [n, len] of held) {
    if (len > most + 1e-9 || (Math.abs(len - most) <= 1e-9 && n < out.room)) {
      out.room = n
      most = Math.max(most, len)
    }
  }
  return out
}

/** The room beyond the curve on one tile. A room standing against it comes before open ground. */
function beyondOf(site: Plot, curve: number, shape: TileShape): number {
  const here = contact(site, curve, shape)
  if (here.clash) return 0
  if (here.room || here.ground) return here.room
  // only more of the same wall on every open side: the left-over corner belongs with its neighbours'.
  // Where they disagree it goes with the one it shares more edge with, and the grid edge walls it off from the other
  let room = 0
  let most = 0
  for (const [nx, ny, shared] of here.curved) {
    const other = geomOf(site.curves![curve]).tiles.get(`${nx},${ny}`)
    const next = other ? contact(site, curve, other) : null
    if (!next || next.clash || !next.room) return 0
    if (!room || shared > most + 1e-9 || (Math.abs(shared - most) <= 1e-9 && next.room < room)) {
      room = next.room
      most = shared
    }
  }
  return room
}

/** The curved edge running through a tile, if it has one. */
export function curveAt(site: Plot, x: number, y: number): LiveTile | undefined {
  const c = candidate(site, x, y)
  return c && !c.squared ? { curve: c.curve, shape: c.shape, beyond: beyondOf(site, c.curve, c.shape) } : undefined
}

/** True where a curved edge runs through a tile. Cheaper than asking what lies beyond it. */
export function onCurve(site: Plot, x: number, y: number): boolean {
  const c = candidate(site, x, y)
  return !!c && !c.squared
}

/** Every tile on the site with a curved edge through it, keyed "x,y". */
export function curveTiles(site: Plot): Map<string, LiveTile> {
  const out = new Map<string, LiveTile>()
  site.curves?.forEach((c, i) => {
    for (const [key, shape] of geomOf(c).tiles) {
      if (!out.has(key) && !c.square?.[key] && at(site, shape.x, shape.y) === c.room) out.set(key, { curve: i, shape, beyond: 0 })
    }
  })
  for (const tile of out.values()) tile.beyond = beyondOf(site, tile.curve, tile.shape)
  return out
}

/** True where a bay of curved wall stands complete, so it can take a door or glazing. */
export function bayStands(site: Pick<Site, 'w' | 'h' | 'grid' | 'curves'>, curve: number, bay: string): boolean {
  const c = site.curves?.[curve]
  if (!c) return false
  const b = geomOf(c).bays.get(bay)
  if (!b || !b.solid) return false
  return b.tiles.every((key) => {
    if (c.square?.[key]) return false
    const [x, y] = key.split(',').map(Number)
    return at(site, x, y) === c.room
  })
}

/** The rooms a bay of curved wall divides its own room from: none where it faces open ground. */
export function bayBeyond(site: Plot, curve: number, bay: string): number[] {
  const c = site.curves?.[curve]
  const b = c && geomOf(c).bays.get(bay)
  if (!c || !b) return []
  const out: number[] = []
  for (const key of b.tiles) {
    const shape = geomOf(c).tiles.get(key)
    if (!shape || c.square?.[key] || at(site, shape.x, shape.y) !== c.room) continue
    const room = beyondOf(site, curve, shape)
    if (room && !out.includes(room)) out.push(room)
  }
  return out
}

/**
 * The bays from one to another along the same wall, both included: the short
 * way round where the wall is a closed loop. Empty when they are not on the
 * same stretch of wall.
 */
export function bayRun(c: CurveSpec, from: string, to: string): string[] {
  const band = from[0]
  if (to[0] !== band) return []
  const count = [...geomOf(c).bays.values()].filter((b) => b.band === band).length
  const a = Number(from.slice(1))
  const b = Number(to.slice(1))
  if (!(a >= 0 && a < count && b >= 0 && b < count)) return []
  const loop = (c.sweep ?? 360) >= 360 && (band === 'o' || band === 'i')
  let step = b >= a ? 1 : -1
  let n = Math.abs(b - a)
  if (loop && n > count / 2) {
    step = -step
    n = count - n
  }
  const out: string[] = []
  for (let i = 0; i <= n; i++) out.push(`${band}${(((a + step * i) % count) + count) % count}`)
  return out
}

/**
 * Keeps curves honest after the site changes. A tile keeps its curved edge
 * while what lies beyond the curve is open ground, more of the same curve, or
 * other rooms, which then share the curved wall (the corner the curve leaves
 * goes to the room with the longer hold on it). Only where the room's own
 * floor stands against it is the tile squared off for good. Curves with
 * nothing left to draw are dropped.
 */
export function settle(site: Site) {
  if (!site.curves) return
  const rooms = new Set(site.rooms.map((r) => r.n))
  // rooms that are gone take their curves with them, before the rest are looked at
  site.curves = site.curves.filter((c) => rooms.has(c.room))
  const kept: Curve[] = []
  site.curves.forEach((c, i) => {
    let live = 0
    // squaring one tile can leave the next one's corner shut in, so look again until nothing changes
    for (let changed = true; changed; ) {
      changed = false
      live = 0
      for (const [key, shape] of geomOf(c).tiles) {
        if (c.square?.[key] || at(site, shape.x, shape.y) !== c.room) continue
        if (contact(site, i, shape).clash) {
          ;(c.square ??= {})[key] = 1
          changed = true
        } else live++
      }
    }
    if (live) kept.push(c)
  })
  site.curves = kept
  kept.forEach((c, i) => {
    for (const bay of Object.keys(c.walls ?? {})) if (!bayStands(site, i, bay)) delete c.walls![bay]
    if (c.walls && !Object.keys(c.walls).length) delete c.walls
  })
  if (!site.curves.length) delete site.curves
}

/** The outline of a curve as closed runs of points, for drawing it before it is built. */
export function outlineOf(c: CurveSpec): Pt[][] {
  const g = geomOf(c)
  return g.loops.map((loop) => loop.map((i): Pt => [g.facets[i].x0, g.facets[i].y0]))
}

/** The standing bay of curved wall nearest a point, within `reach` metres. */
export function nearestBay(site: Pick<Site, 'w' | 'h' | 'grid' | 'curves'>, px: number, py: number, reach = 0.5): { curve: number; bay: string; dist: number } | null {
  let best: { curve: number; bay: string; dist: number } | null = null
  site.curves?.forEach((c, ci) => {
    if (px < c.cx - c.rx - reach || px > c.cx + c.rx + reach || py < c.cy - c.ry - reach || py > c.cy + c.ry + reach) return
    const g = geomOf(c)
    for (const f of g.facets) {
      const dx = f.x1 - f.x0
      const dy = f.y1 - f.y0
      const t = Math.min(1, Math.max(0, ((px - f.x0) * dx + (py - f.y0) * dy) / (f.len * f.len)))
      const d = Math.hypot(px - f.x0 - dx * t, py - f.y0 - dy * t)
      if (d < reach && (!best || d < best.dist) && bayStands(site, ci, f.bay)) best = { curve: ci, bay: f.bay, dist: d }
    }
  })
  return best
}
