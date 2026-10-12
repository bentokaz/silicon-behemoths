// The arithmetic behind merging furniture into a few meshes (see Baked in
// kit.tsx): each source shape is reduced once to the fewest vertices that
// draw it, and many of them are then written into one set of arrays with a
// colour and a surface finish on every vertex.
import * as THREE from 'three'

/** A shape ready to be copied into a merged mesh: its vertices and the triangles between them. */
export interface Lean {
  position: Float32Array
  normal: Float32Array
  index: Uint32Array
}

/**
 * Joins the vertices of a shape that sit at one place with one normal. A
 * softened box comes as 324 separate vertices and leaves as 56, so there is a
 * sixth of the work in drawing it. The triangles are kept as they were.
 */
export function weld(position: ArrayLike<number>, normal: ArrayLike<number>, index: ArrayLike<number> | null): Lean {
  const count = index ? index.length : position.length / 3
  const seen = new Map<string, number>()
  const P: number[] = []
  const N: number[] = []
  const out = new Uint32Array(count)
  for (let i = 0; i < count; i++) {
    const v = (index ? index[i] : i) * 3
    const key = `${Math.round(position[v] * 1e5)},${Math.round(position[v + 1] * 1e5)},${Math.round(position[v + 2] * 1e5)},${Math.round(normal[v] * 500)},${Math.round(normal[v + 1] * 500)},${Math.round(normal[v + 2] * 500)}`
    let at = seen.get(key)
    if (at === undefined) {
      at = P.length / 3
      seen.set(key, at)
      P.push(position[v], position[v + 1], position[v + 2])
      N.push(normal[v], normal[v + 1], normal[v + 2])
    }
    out[i] = at
  }
  return { position: new Float32Array(P), normal: new Float32Array(N), index: out }
}

/**
 * The same shape with every triangle flat: three vertices of its own, all
 * with the normal of its face. This is what a faceted material draws, done
 * ahead of time so that faceted parts can share a mesh with smooth ones.
 */
export function facet(position: ArrayLike<number>, index: ArrayLike<number> | null): Lean {
  const count = index ? index.length : position.length / 3
  const P = new Float32Array(count * 3)
  const N = new Float32Array(count * 3)
  const out = new Uint32Array(count)
  for (let i = 0; i < count; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = (index ? index[i + k] : i + k) * 3
      P[(i + k) * 3] = position[v]
      P[(i + k) * 3 + 1] = position[v + 1]
      P[(i + k) * 3 + 2] = position[v + 2]
      out[i + k] = i + k
    }
    const o = i * 3
    const ux = P[o + 3] - P[o]
    const uy = P[o + 4] - P[o + 1]
    const uz = P[o + 5] - P[o + 2]
    const vx = P[o + 6] - P[o]
    const vy = P[o + 7] - P[o + 1]
    const vz = P[o + 8] - P[o + 2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len
    for (let k = 0; k < 3; k++) {
      N[o + k * 3] = nx
      N[o + k * 3 + 1] = ny
      N[o + k * 3 + 2] = nz
    }
  }
  return { position: P, normal: N, index: out }
}

const smooth = new WeakMap<THREE.BufferGeometry, Lean>()
const faceted = new WeakMap<THREE.BufferGeometry, Lean>()

/** The lean form of a geometry, worked out the first time it is asked for. Null for geometry that cannot be copied straight across. */
export function leanOf(geo: THREE.BufferGeometry, flat: boolean): Lean | null {
  const cache = flat ? faceted : smooth
  const hit = cache.get(geo)
  if (hit) return hit
  const pos = geo.attributes.position as THREE.BufferAttribute | undefined
  const nor = geo.attributes.normal as THREE.BufferAttribute | undefined
  // only plain, tightly packed geometry can be read as it lies
  if (!pos || !pos.isBufferAttribute || pos.itemSize !== 3 || (!flat && (!nor || !nor.isBufferAttribute || nor.itemSize !== 3))) return null
  const index = geo.index ? geo.index.array : null
  const lean = flat ? facet(pos.array, index) : weld(pos.array, nor!.array, index)
  cache.set(geo, lean)
  return lean
}

export interface BakePart {
  lean: Lean
  /** Where the part sits in the merged mesh: a column-major 4x4 matrix. */
  at: ArrayLike<number>
  /** Colour as it was written, 0xRRGGBB. */
  hex: number
  rough: number
  metal: number
  /** What it glows with, 0xRRGGBB, and how strongly: 0 for a part that does not glow. */
  glow: number
  power: number
  /** How much of what is behind it a pane of glass hides, 0-1. Solid parts leave it out. */
  alpha?: number
}

/** Glow strength is kept in a byte: forty steps to the unit, so every tenth is exact, up to 6.375. */
export const GLOW_STEPS = 40

export interface BakedArrays {
  position: Float32Array
  normal: Float32Array
  /** Red, green, blue as written (not yet linear) and roughness, one byte each. */
  tint: Uint8Array
  /** Metalness in the first byte and opacity in the second; the rest is spare. */
  surf: Uint8Array
  /** The glow as written, and its strength in steps of 1/GLOW_STEPS. */
  glow: Uint8Array
  index: Uint32Array | Uint16Array
}

/** Writes every part into one set of arrays: no copies of the geometry in between. */
export function pack(parts: BakePart[]): BakedArrays {
  let verts = 0
  let tris = 0
  for (const p of parts) {
    verts += p.lean.position.length / 3
    tris += p.lean.index.length
  }
  const P = new Float32Array(verts * 3)
  const N = new Float32Array(verts * 3)
  const tint = new Uint8Array(verts * 4)
  const surf = new Uint8Array(verts * 4)
  const glow = new Uint8Array(verts * 4)
  const index = verts > 65535 ? new Uint32Array(tris) : new Uint16Array(tris)
  let o = 0
  let io = 0
  for (const part of parts) {
    const p = part.lean.position
    const n = part.lean.normal
    const e = part.at
    // normals turn with the inverse transpose of the upper 3x3, which for a matrix M is cofactor(M) up to scale
    const c00 = e[5] * e[10] - e[9] * e[6]
    const c01 = e[9] * e[2] - e[1] * e[10]
    const c02 = e[1] * e[6] - e[5] * e[2]
    const c10 = e[8] * e[6] - e[4] * e[10]
    const c11 = e[0] * e[10] - e[8] * e[2]
    const c12 = e[4] * e[2] - e[0] * e[6]
    const c20 = e[4] * e[9] - e[8] * e[5]
    const c21 = e[8] * e[1] - e[0] * e[9]
    const c22 = e[0] * e[5] - e[4] * e[1]
    // a mirrored part (negative determinant) has its normals flipped back and its triangles wound the other way
    const flip = e[0] * c00 + e[4] * c01 + e[8] * c02 < 0
    const sign = flip ? -1 : 1
    const r = (part.hex >> 16) & 255
    const g = (part.hex >> 8) & 255
    const b = part.hex & 255
    const rough = Math.round(Math.min(1, Math.max(0, part.rough)) * 255)
    const metal = Math.round(Math.min(1, Math.max(0, part.metal)) * 255)
    const alpha = Math.round(Math.min(1, Math.max(0, part.alpha ?? 1)) * 255)
    const power = Math.min(255, Math.max(0, Math.round(part.power * GLOW_STEPS)))
    const gr = power ? (part.glow >> 16) & 255 : 0
    const gg = power ? (part.glow >> 8) & 255 : 0
    const gb = power ? part.glow & 255 : 0
    const base = o / 3
    for (let v = 0; v < p.length; v += 3) {
      const x = p[v]
      const y = p[v + 1]
      const z = p[v + 2]
      P[o] = e[0] * x + e[4] * y + e[8] * z + e[12]
      P[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
      P[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
      const nx = n[v]
      const ny = n[v + 1]
      const nz = n[v + 2]
      const ax = (c00 * nx + c01 * ny + c02 * nz) * sign
      const ay = (c10 * nx + c11 * ny + c12 * nz) * sign
      const az = (c20 * nx + c21 * ny + c22 * nz) * sign
      const len = Math.hypot(ax, ay, az) || 1
      N[o] = ax / len
      N[o + 1] = ay / len
      N[o + 2] = az / len
      const q = (o / 3) * 4
      tint[q] = r
      tint[q + 1] = g
      tint[q + 2] = b
      tint[q + 3] = rough
      surf[q] = metal
      surf[q + 1] = alpha
      glow[q] = gr
      glow[q + 1] = gg
      glow[q + 2] = gb
      glow[q + 3] = power
      o += 3
    }
    const idx = part.lean.index
    if (flip) {
      for (let i = 0; i < idx.length; i += 3) {
        index[io + i] = base + idx[i]
        index[io + i + 1] = base + idx[i + 2]
        index[io + i + 2] = base + idx[i + 1]
      }
    } else for (let i = 0; i < idx.length; i++) index[io + i] = base + idx[i]
    io += idx.length
  }
  return { position: P, normal: N, tint, surf, glow, index }
}

/**
 * A box with one bevel along every edge: the six faces, a strip for each of
 * the twelve edges and a triangle at each of the eight corners, 44 triangles
 * on 24 vertices. Each vertex carries the normal of the face it belongs to,
 * so the light rolls round an edge as it does round a rounded one, at well
 * under half the triangles of the smallest rounded box.
 */
export function chamferBox(w: number, h: number, d: number, r: number): Lean {
  const half = [w / 2, h / 2, d / 2]
  const inner = [w / 2 - r, h / 2 - r, d / 2 - r]
  const P = new Float32Array(24 * 3)
  const N = new Float32Array(24 * 3)
  /** The vertex of a corner (bit k set means the far side along axis k) that lies on its face across `axis`. */
  const id = (corner: number, axis: number) => corner * 3 + axis
  for (let c = 0; c < 8; c++) {
    for (let axis = 0; axis < 3; axis++) {
      const o = id(c, axis) * 3
      for (let k = 0; k < 3; k++) {
        const sign = c & (1 << k) ? 1 : -1
        P[o + k] = sign * (k === axis ? half[k] : inner[k])
        N[o + k] = k === axis ? sign : 0
      }
    }
  }
  const tris: number[] = []
  /** Adds a triangle, turned so that it faces the way its vertices' normals do. */
  const tri = (a: number, b: number, c: number) => {
    const ux = P[b * 3] - P[a * 3]
    const uy = P[b * 3 + 1] - P[a * 3 + 1]
    const uz = P[b * 3 + 2] - P[a * 3 + 2]
    const vx = P[c * 3] - P[a * 3]
    const vy = P[c * 3 + 1] - P[a * 3 + 1]
    const vz = P[c * 3 + 2] - P[a * 3 + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const out = nx * (N[a * 3] + N[b * 3] + N[c * 3]) + ny * (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) + nz * (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2])
    if (out >= 0) tris.push(a, b, c)
    else tris.push(a, c, b)
  }
  const quad = (a: number, b: number, c: number, e: number) => {
    tri(a, b, c)
    tri(a, c, e)
  }
  for (let axis = 0; axis < 3; axis++) {
    const b = (axis + 1) % 3
    const c = (axis + 2) % 3
    for (const far of [0, 1]) {
      // a face: the four corners on one side along the axis, taken round in order
      const at = (sb: number, sc: number) => (far << axis) | (sb << b) | (sc << c)
      quad(id(at(0, 0), axis), id(at(1, 0), axis), id(at(1, 1), axis), id(at(0, 1), axis))
    }
    for (const sb of [0, 1]) {
      for (const sc of [0, 1]) {
        // the bevel of an edge that runs along the axis: between the two faces that meet at it
        const lo = (sb << b) | (sc << c)
        const hi = lo | (1 << axis)
        quad(id(lo, b), id(hi, b), id(hi, c), id(lo, c))
      }
    }
  }
  for (let corner = 0; corner < 8; corner++) tri(id(corner, 0), id(corner, 1), id(corner, 2))
  return { position: P, normal: N, index: new Uint32Array(tris) }
}
