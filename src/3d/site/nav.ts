// Where people can walk on a site, and how to get from one tile to another.
// Tiles are joined through doors and openings only; furniture, water and
// walls are in the way. Used for looks alone: nothing here touches the game.
import { curveTiles, geomOf } from '../../sim/curves'
import { ITEMS, cutAt, faceId, gridAt, itemTiles } from '../../sim/sites'
import type { Site } from '../../sim/types'

/** Longest route, in tiles, that a walker will follow. */
export const PATH_MAX = 420

export interface Nav {
  w: number
  h: number
  /** 1 where someone can stand. */
  walk: Uint8Array
  /** 1 where a tile joins the one north (or west) of it. */
  north: Uint8Array
  west: Uint8Array
  /** 1 for tiles that can be reached on foot from the way in. */
  reach: Uint8Array
  /** Which connected stretch of floor a tile belongs to (0 where nobody can stand). Two tiles can be walked between only if these match. */
  zone: Int32Array
  /** Tile people come in and leave by, or -1 if the plot is walled off. */
  entry: number
  /** A point off the plot beyond the entry, where people appear and vanish. */
  outside: [number, number]
  /** Every door, with the middle of its opening in world coordinates, for swinging them. */
  doors: { x: number; y: number; side: 'n' | 'w'; cx: number; cz: number }[]
  /** 1 on tiles that are the way through a door in a curved wall: as narrow as a doorway. */
  narrow: Uint8Array
  /** Extra cost of routing through a tile, so paths keep clear of where people stand about. Written by the crowd; never negative. */
  penalty: Float32Array
  /** Whether someone can step from a tile to its neighbour (dx, dy each -1, 0 or 1). A diagonal needs both ways round the corner to be clear. */
  step(tile: number, dx: number, dy: number): boolean
  /** Writes the tiles from `from` (exclusive) to `to` (inclusive) into `out`; returns how many, 0 if there is no way. */
  find(from: number, to: number, out: Int16Array): number
  /** Nearest tile to this one that someone can stand on, or -1. */
  nearest(tile: number): number
  /** Centre of a tile in world coordinates. */
  cx(tile: number): number
  cz(tile: number): number
  tileAt(x: number, z: number): number
}

/** Builds the walking map of a site as it stands. */
export function buildNav(site: Site): Nav {
  const { w, h } = site
  const n = w * h
  const walk = new Uint8Array(n).fill(1)
  const north = new Uint8Array(n)
  const west = new Uint8Array(n)
  const defs = ITEMS[site.kind]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (cutAt(site, x, y)) walk[i] = 0
      else if (!site.grid[i] && site.floor[`${x},${y}`] === 'water') walk[i] = 0
    }
  }
  const blocked = new Uint8Array(n)
  for (const it of site.items) {
    const def = defs[it.kind]
    if (!def || def.flat) continue
    for (const [x, y] of itemTiles(site, it)) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      walk[y * w + x] = 0
      blocked[y * w + x] = 1
    }
  }
  // a curved wall runs through its tiles, so nobody stands on them; a door or
  // opening in the curve makes its tiles a way through
  const portal = new Uint8Array(n)
  /** For each way through a curved wall: the middle of its bay and the way out of the room there, in tiles from the plot's corner. */
  const through = new Map<number, [number, number, number, number]>()
  /** The two rooms such a doorway joins: the curved wall's own, and the one that owns the corner beyond it (0 for open ground). */
  const joins = new Map<number, [number, number]>()
  const curved = curveTiles(site)
  for (const key of curved.keys()) {
    const [x, y] = key.split(',').map(Number)
    if (x >= 0 && y >= 0 && x < w && y < h) walk[y * w + x] = 0
  }
  site.curves?.forEach((c) => {
    for (const [key, kind] of Object.entries(c.walls ?? {})) {
      if (kind === 'glass') continue
      const bay = geomOf(c).bays.get(key)
      if (!bay) continue
      for (const tileKey of bay.tiles) {
        const [x, y] = tileKey.split(',').map(Number)
        // only a tile that still carries the curve, with nothing standing on it, is a way through
        if (x < 0 || y < 0 || x >= w || y >= h || !curved.has(tileKey) || site.grid[y * w + x] !== c.room) continue
        const i = y * w + x
        if (blocked[i]) continue
        portal[i] = 1
        walk[i] = 1
        if (!through.has(i)) {
          through.set(i, [bay.x, bay.y, bay.nx, bay.ny])
          joins.set(i, [c.room, curved.get(tileKey)!.beyond])
        }
      }
    }
  })
  const gaps = new Set<string>()
  const doors: Nav['doors'] = []
  for (const wl of site.walls) {
    if (wl.kind === 'glass') continue
    gaps.add(`${wl.x},${wl.y},${wl.side}`)
    if (wl.kind === 'door') doors.push({ x: wl.x, y: wl.y, side: wl.side, cx: wl.x - w / 2 + (wl.side === 'n' ? 0.5 : 0), cz: wl.y - h / 2 + (wl.side === 'w' ? 0.5 : 0) })
  }
  /** True if tile p is a way through a curved wall and tile q lies in front of or behind that doorway. */
  const via = (px: number, py: number, qx: number, qy: number): boolean => {
    if (px < 0 || py < 0 || px >= w || py >= h) return false
    const bay = through.get(py * w + px)
    if (!bay) return false
    // the doorway leads between its own room and whatever lies beyond the curve there, not into a third room beside it
    const rooms = joins.get(py * w + px)!
    const far = gridAt(site, qx, qy)
    if (far !== rooms[0] && far !== rooms[1]) return false
    // distance of q's middle from the line through the doorway, measured along the wall
    return Math.abs((qx + 0.5 - bay[0]) * -bay[3] + (qy + 0.5 - bay[1]) * bay[2]) <= 0.85
  }
  /** Whether the edge on the north or west of a tile can be walked through. Works for the plot's outer edges too. */
  const open = (x: number, y: number, side: 'n' | 'w') => {
    const a = side === 'n' ? faceId(site, x, y, 'n') : faceId(site, x, y, 'w')
    const b = side === 'n' ? faceId(site, x, y - 1, 's') : faceId(site, x - 1, y, 'e')
    if (a === b || gaps.has(`${x},${y},${side}`)) return true
    // a door in a curved wall leads to the tiles in front of it and behind it, never out sideways along the wall
    const bx = side === 'n' ? x : x - 1
    const by = side === 'n' ? y - 1 : y
    return via(x, y, bx, by) || via(bx, by, x, y)
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!walk[i]) continue
      if (y > 0 && walk[i - w] && open(x, y, 'n')) north[i] = 1
      if (x > 0 && walk[i - 1] && open(x, y, 'w')) west[i] = 1
    }
  }
  const step = (i: number, dx: number, dy: number): boolean => {
    // orthogonal moves only; callers combine two for a diagonal
    if (dx === 1) return (i % w) + 1 < w && west[i + 1] === 1
    if (dx === -1) return i % w > 0 && west[i] === 1
    if (dy === 1) return i + w < n && north[i + w] === 1
    return i - w >= 0 && north[i] === 1
  }

  // ---- the way in: an open stretch of the plot's edge, as near the middle of the south side as there is
  let entry = -1
  let outside: [number, number] = [0, h / 2 + 5]
  let best = Infinity
  const consider = (x: number, y: number, ok: boolean, ox: number, oz: number, cost: number) => {
    if (!ok || !walk[y * w + x] || cost >= best) return
    best = cost
    entry = y * w + x
    outside = [ox, oz]
  }
  for (let x = 0; x < w; x++) {
    const wx = x - w / 2 + 0.5
    consider(x, h - 1, open(x, h, 'n'), wx, h / 2 + 5, Math.abs(wx))
    consider(x, 0, open(x, 0, 'n'), wx, -h / 2 - 5, Math.abs(wx) + w + h)
  }
  for (let y = 0; y < h; y++) {
    const wz = y - h / 2 + 0.5
    consider(0, y, open(0, y, 'w'), -w / 2 - 5, wz, (h - y) + w)
    consider(w - 1, y, open(w, y, 'w'), w / 2 + 5, wz, (h - y) + w)
  }

  // ---- which tiles join up, and which of them can be reached from the way in
  const zone = new Int32Array(n)
  let zones = 0
  const stack: number[] = []
  for (let start = 0; start < n; start++) {
    if (!walk[start] || zone[start]) continue
    zone[start] = ++zones
    stack.push(start)
    while (stack.length) {
      const i = stack.pop()!
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!step(i, dx, dy)) continue
        const j = i + dx + dy * w
        if (zone[j]) continue
        zone[j] = zones
        stack.push(j)
      }
    }
  }
  const reach = new Uint8Array(n)
  if (entry >= 0) for (let i = 0; i < n; i++) if (zone[i] === zone[entry]) reach[i] = 1

  /** A step in any of the eight directions; a diagonal needs both ways round the corner to be clear. */
  const move = (i: number, dx: number, dy: number): boolean => {
    if (i < 0 || i >= n) return false
    if (dx !== 0 && dy !== 0) return step(i, dx, 0) && step(i, 0, dy) && step(i + dx, 0, dy) && step(i + dy * w, dx, 0)
    return dx !== 0 || dy !== 0 ? step(i, dx, dy) : true
  }
  const penalty = new Float32Array(n)

  // ---- A* over eight directions, without cutting corners
  const cost = new Float32Array(n)
  const from = new Int32Array(n)
  const seen = new Uint32Array(n)
  const heap = new Int32Array(n * 4 + 16)
  const prio = new Float32Array(n * 4 + 16)
  let stamp = 0
  const find = (a: number, b: number, out: Int16Array): number => {
    if (a === b || a < 0 || b < 0 || !zone[a] || zone[a] !== zone[b]) return 0
    stamp++
    let size = 0
    const push = (i: number, p: number) => {
      let k = size++
      while (k > 0) {
        const parent = (k - 1) >> 1
        if (prio[parent] <= p) break
        heap[k] = heap[parent]
        prio[k] = prio[parent]
        k = parent
      }
      heap[k] = i
      prio[k] = p
    }
    const pop = (): number => {
      const top = heap[0]
      const last = heap[--size]
      const lp = prio[size]
      let k = 0
      for (;;) {
        let c = k * 2 + 1
        if (c >= size) break
        if (c + 1 < size && prio[c + 1] < prio[c]) c++
        if (prio[c] >= lp) break
        heap[k] = heap[c]
        prio[k] = prio[c]
        k = c
      }
      heap[k] = last
      prio[k] = lp
      return top
    }
    const bx = b % w
    const by = (b / w) | 0
    const guess = (i: number) => {
      const dx = Math.abs((i % w) - bx)
      const dy = Math.abs(((i / w) | 0) - by)
      return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy)
    }
    cost[a] = 0
    from[a] = -1
    seen[a] = stamp
    push(a, guess(a))
    let found = false
    while (size > 0) {
      const i = pop()
      if (i === b) {
        found = true
        break
      }
      const g = cost[i]
      for (let d = 0; d < 8; d++) {
        const dx = d === 0 || d === 4 || d === 5 ? 1 : d === 1 || d === 6 || d === 7 ? -1 : 0
        const dy = d === 2 || d === 4 || d === 6 ? 1 : d === 3 || d === 5 || d === 7 ? -1 : 0
        if (!move(i, dx, dy)) continue
        const j = i + dx + dy * w
        const ng = g + (d < 4 ? 1 : 1.4142) + penalty[j]
        if (seen[j] === stamp && cost[j] <= ng) continue
        seen[j] = stamp
        cost[j] = ng
        from[j] = i
        if (size < heap.length - 1) push(j, ng + guess(j))
      }
    }
    if (!found) return 0
    let len = 0
    for (let i = b; i !== a; i = from[i]) len++
    if (len > out.length) return 0
    let k = len
    for (let i = b; i !== a; i = from[i]) out[--k] = i
    return len
  }

  const nearest = (tile: number): number => {
    if (tile >= 0 && tile < n && walk[tile]) return tile
    const tx = tile % w
    const ty = (tile / w) | 0
    for (let r = 1; r < Math.max(w, h); r++) {
      let bestTile = -1
      let bestD = Infinity
      for (let y = ty - r; y <= ty + r; y++) {
        for (let x = tx - r; x <= tx + r; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h || Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue
          const j = y * w + x
          if (!walk[j]) continue
          const d = (x - tx) ** 2 + (y - ty) ** 2
          if (d < bestD) {
            bestD = d
            bestTile = j
          }
        }
      }
      if (bestTile >= 0) return bestTile
    }
    return -1
  }

  return {
    w,
    h,
    walk,
    north,
    west,
    reach,
    zone,
    entry,
    outside,
    doors,
    narrow: portal,
    penalty,
    step: move,
    find,
    nearest,
    cx: (tile) => (tile % w) - w / 2 + 0.5,
    cz: (tile) => ((tile / w) | 0) - h / 2 + 0.5,
    tileAt: (x, z) => {
      const tx = Math.floor(x + w / 2)
      const ty = Math.floor(z + h / 2)
      return tx < 0 || ty < 0 || tx >= w || ty >= h ? -1 : ty * w + tx
    },
  }
}

/** Room number under a world position, 0 outdoors. */
export const roomUnder = (site: Site, x: number, z: number) => gridAt(site, Math.floor(x + site.w / 2), Math.floor(z + site.h / 2))

/**
 * Rooms nobody can walk to from the way in: none of their floor is joined to
 * the street. A room with no door at all is one of them; so is a room whose
 * door is blocked by furniture or only leads into another such room. On a
 * plot with no way in at all, that is every room.
 */
export function cutOffRooms(site: Site, nav: Nav): number[] {
  const all = new Set<number>()
  const ok = new Set<number>()
  for (let i = 0; i < site.grid.length; i++) {
    const room = site.grid[i]
    if (!room) continue
    all.add(room)
    if (nav.reach[i]) ok.add(room)
  }
  return [...all].filter((n) => !ok.has(n)).sort((a, b) => a - b)
}
