// The building itself: floors, the walls that follow the rooms, doors and
// glazing, and (in the outside view) upper storeys and the roof. Everything
// is generated from the site grid into a few merged meshes.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { type Facet, type Pt, type Side, bayStands, curveTiles, geomOf } from '../../sim/curves'
import { FACADES, GROUNDS, ROOFS, cutAt, gridAt, styleOf } from '../../sim/sites'
import type { Corner, Room, Site } from '../../sim/types'
import { hash } from './kit'

/** How much of the building is drawn: low cut-away walls, full-height walls, or the outside with a roof. */
export type ViewMode = 'cut' | 'walls' | 'full'

export const WALL_T = 0.16
export const CUT_H = 0.9
export const STOREY = 3
const DOOR_H = 2.1
const CAP = '#1c1e22'
const POST = '#33363b'

const colors = new Map<string, THREE.Color>()
const colorOf = (hex: string) => {
  let c = colors.get(hex)
  if (!c) colors.set(hex, (c = new THREE.Color(hex)))
  return c
}

/** Collects boxes and flat quads per material, then builds one mesh for each. */
export class Batch {
  private groups = new Map<string, { pos: number[]; nor: number[]; col: number[] }>()
  private get(key: string) {
    let g = this.groups.get(key)
    if (!g) this.groups.set(key, (g = { pos: [], nor: [], col: [] }))
    return g
  }
  private face(g: { pos: number[]; nor: number[]; col: number[] }, v: number[][], n: number[], c: THREE.Color, shade: number) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      g.pos.push(v[i][0], v[i][1], v[i][2])
      g.nor.push(n[0], n[1], n[2])
      g.col.push(c.r * shade, c.g * shade, c.b * shade)
    }
  }
  /** An axis-aligned box centred at (x, y, z). */
  box(key: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, shade = 1) {
    const g = this.get(key)
    const c = colorOf(color)
    const [a, b, d] = [sx / 2, sy / 2, sz / 2]
    const p = (i: number, j: number, k: number) => [x + i * a, y + j * b, z + k * d]
    this.face(g, [p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)], [0, 0, 1], c, shade)
    this.face(g, [p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1)], [0, 0, -1], c, shade)
    this.face(g, [p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1)], [1, 0, 0], c, shade)
    this.face(g, [p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1)], [-1, 0, 0], c, shade)
    this.face(g, [p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1)], [0, 1, 0], c, shade)
    this.face(g, [p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1)], [0, -1, 0], c, shade)
  }
  /** A flat rectangle facing up (or down). */
  quad(key: string, x0: number, z0: number, x1: number, z1: number, y: number, color: string, shade = 1, up = true) {
    const g = this.get(key)
    const c = colorOf(color)
    if (up) this.face(g, [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [0, 1, 0], c, shade)
    else this.face(g, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, -1, 0], c, shade)
  }
  /** A flat triangle facing up. Points are [x, z], counter-clockwise seen from above. */
  tri(key: string, pts: [number, number][], y: number, color: string, shade = 1) {
    const g = this.get(key)
    const c = colorOf(color)
    for (const [x, z] of pts) {
      g.pos.push(x, y, z)
      g.nor.push(0, 1, 0)
      g.col.push(c.r * shade, c.g * shade, c.b * shade)
    }
  }
  /** A flat convex polygon facing up or down. Points are [x, z], in either order. */
  poly(key: string, pts: Pt[], y: number, color: string, shade = 1, up = true) {
    if (pts.length < 3) return
    const g = this.get(key)
    const c = colorOf(color)
    let area = 0
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i]
      const [x1, z1] = pts[(i + 1) % pts.length]
      area += x0 * z1 - x1 * z0
    }
    // seen from above, a face that looks up has its points running this way round
    const order = area < 0 === up ? pts : [...pts].reverse()
    for (let i = 1; i + 1 < order.length; i++) {
      for (const [x, z] of [order[0], order[i], order[i + 1]]) {
        g.pos.push(x, y, z)
        g.nor.push(0, up ? 1 : -1, 0)
        g.col.push(c.r * shade, c.g * shade, c.b * shade)
      }
    }
  }
  /**
   * An upright face from (ax, az) to (bx, bz) between two heights, seen from
   * the side its normals point to. Giving each end its own normal lets a run
   * of faces shade as one smooth curve.
   */
  upright(key: string, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, na: Pt, nb: Pt, color: string, shade = 1) {
    const g = this.get(key)
    const c = colorOf(color)
    const facing = -(bz - az) * (na[0] + nb[0]) + (bx - ax) * (na[1] + nb[1]) >= 0
    const a0 = [ax, y0, az, na[0], na[1]]
    const b0 = [bx, y0, bz, nb[0], nb[1]]
    const b1 = [bx, y1, bz, nb[0], nb[1]]
    const a1 = [ax, y1, az, na[0], na[1]]
    const v = facing ? [a0, b0, b1, a1] : [a0, a1, b1, b0]
    for (const i of [0, 1, 2, 0, 2, 3]) {
      g.pos.push(v[i][0], v[i][1], v[i][2])
      g.nor.push(v[i][3], 0, v[i][4])
      g.col.push(c.r * shade, c.g * shade, c.b * shade)
    }
  }
  /** A box turned about the vertical axis by `rot` radians. */
  boxRot(key: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot: number, color: string, shade = 1) {
    const g = this.get(key)
    const c = colorOf(color)
    const cos = Math.cos(rot)
    const sin = Math.sin(rot)
    const p = (i: number, j: number, k: number) => {
      const lx = (i * sx) / 2
      const lz = (k * sz) / 2
      return [x + lx * cos + lz * sin, y + (j * sy) / 2, z - lx * sin + lz * cos]
    }
    const n = (nx: number, nz: number) => [nx * cos + nz * sin, 0, -nx * sin + nz * cos]
    this.face(g, [p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)], n(0, 1), c, shade)
    this.face(g, [p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1)], n(0, -1), c, shade)
    this.face(g, [p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1)], n(1, 0), c, shade)
    this.face(g, [p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1)], n(-1, 0), c, shade)
    this.face(g, [p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1)], [0, 1, 0], c, shade)
    this.face(g, [p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1)], [0, -1, 0], c, shade)
  }
  build(materials: (key: string) => { material: THREE.Material; cast?: boolean }): THREE.Mesh[] {
    const out: THREE.Mesh[] = []
    for (const [key, g] of this.groups) {
      if (!g.pos.length) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3))
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3))
      const m = materials(key)
      const mesh = new THREE.Mesh(geo, m.material)
      mesh.castShadow = m.cast ?? true
      mesh.receiveShadow = true
      out.push(mesh)
    }
    return out
  }
}

const shared = new Map<string, THREE.Material>()
/** Materials for structure meshes, keyed by what kind of surface they are. */
export function surface(key: string, glow = 0): { material: THREE.Material; cast?: boolean } {
  const id = `${key}|${glow}`
  let m = shared.get(id)
  if (!m) {
    // after dark the glass of the outside view glows with the light behind it
    if (key === 'glass') m = new THREE.MeshPhysicalMaterial({ color: '#bfe0f2', roughness: 0.05, transparent: true, opacity: 0.24 + Math.min(0.2, glow * 0.25), side: THREE.DoubleSide, depthWrite: false, emissive: '#ffbf80', emissiveIntensity: glow * 0.5 })
    else if (key === 'plate') m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, emissive: '#ffd39a', emissiveIntensity: glow * 0.4 })
    else if (key === 'pane') m = new THREE.MeshStandardMaterial({ color: '#27353f', roughness: 0.1, metalness: 0.7 })
    else if (key === 'lit') m = new THREE.MeshStandardMaterial({ color: '#2a2418', roughness: 0.2, emissive: '#ffb866', emissiveIntensity: glow * 0.55 })
    else if (key === 'water') m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.3 })
    else if (key === 'trim') m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 })
    else if (key.startsWith('floor')) m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: Number(key.slice(5)) / 10 })
    else m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
    shared.set(id, m)
  }
  return { material: m, cast: key !== 'glass' && !key.startsWith('floor') && key !== 'water' }
}

function useMeshes(make: () => THREE.Mesh[], deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const meshes = useMemo(make, deps)
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes])
  return meshes
}

/** The two triangles of a tile cut along a diagonal: [the half the room keeps, the half left as ground]. */
function halves(x0: number, z0: number, cut: Corner): [[number, number][], [number, number][]] {
  const sw: [number, number] = [x0, z0 + 1]
  const se: [number, number] = [x0 + 1, z0 + 1]
  const ne: [number, number] = [x0 + 1, z0]
  const nw: [number, number] = [x0, z0]
  if (cut === 'ne') return [[sw, se, nw], [se, ne, nw]]
  if (cut === 'nw') return [[sw, se, ne], [sw, ne, nw]]
  if (cut === 'se') return [[sw, ne, nw], [sw, se, ne]]
  return [[se, ne, nw], [sw, se, nw]]
}

let ripples: THREE.CanvasTexture | null = null
/** A tiling normal map of small waves, drawn once. */
function rippleMap(): THREE.CanvasTexture {
  if (ripples) return ripples
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const img = g.createImageData(size, size)
  const height = (x: number, y: number) => {
    const u = (x / size) * Math.PI * 2
    const v = (y / size) * Math.PI * 2
    return Math.sin(u * 2 + v) + 0.7 * Math.sin(v * 3 - u) + 0.35 * Math.sin((u + v) * 5) + 0.2 * Math.sin(u * 7 - v * 4) + 0.12 * Math.sin(u * 13 + v * 9)
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = height(x + 1, y) - height(x - 1, y)
      const dy = height(x, y + 1) - height(x, y - 1)
      const n = new THREE.Vector3(-dx * 0.6, -dy * 0.6, 1).normalize()
      const i = (y * size + x) * 4
      img.data[i] = (n.x * 0.5 + 0.5) * 255
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  ripples = new THREE.CanvasTexture(canvas)
  ripples.wrapS = ripples.wrapT = THREE.RepeatWrapping
  return ripples
}
const WATER_Y = -0.1

/** Open water: a sunken, reflective surface whose ripples drift. */
function Water({ tiles, w, h, dim }: { tiles: [number, number][]; w: number; h: number; dim: number }) {
  const mesh = useMemo(() => {
    const pos: number[] = []
    const uv: number[] = []
    for (const [x, y] of tiles) {
      const x0 = x - w / 2
      const z0 = y - h / 2
      for (const [px, pz] of [[x0, z0 + 1], [x0 + 1, z0 + 1], [x0 + 1, z0], [x0, z0 + 1], [x0 + 1, z0], [x0, z0]]) {
        pos.push(px, WATER_Y, pz)
        uv.push(px * 0.31, pz * 0.27)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.computeVertexNormals()
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1f6f86').multiplyScalar(dim), roughness: 0.12, metalness: 0.55, normalMap: rippleMap(), normalScale: new THREE.Vector2(0.16, 0.16), transparent: true, opacity: 0.94, envMapIntensity: 1.8 })
    const m = new THREE.Mesh(geo, material)
    m.receiveShadow = true
    m.userData.live = true
    return m
  }, [tiles, w, h, dim])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    },
    [mesh],
  )
  useFrame(({ clock }) => {
    rippleMap().offset.set(clock.elapsedTime * 0.012, clock.elapsedTime * 0.02)
  })
  return <primitive object={mesh} />
}

/** Floors of every room and the open ground of the plot. */
export function Ground({ site, dim }: { site: Site; dim: number }) {
  const built = useMemo(() => {
    const b = new Batch()
    const rooms = new Map<number, Room>(site.rooms.map((r) => [r.n, r]))
    const curved = curveTiles(site)
    const ox = -site.w / 2
    const oz = -site.h / 2
    const water: [number, number][] = []
    const wet = (x: number, y: number) => !gridAt(site, x, y) && site.floor[`${x},${y}`] === 'water'
    /** Open ground on a tile: the whole of it, or just the given pieces. */
    const lay = (x: number, y: number, pieces: Pt[][] | null) => {
      const jitter = (0.86 + hash(x * 31 + y * 17) * 0.1) * dim
      const g = GROUNDS.find((d) => d.id === site.floor[`${x},${y}`]) ?? GROUNDS[0]
      const key = `floor${Math.round(g.rough * 10)}`
      if (pieces) for (const p of pieces) b.poly(key, p, 0, g.id === 'water' ? GROUNDS[0].color : g.color, jitter)
      else b.quad(key, ox + x, oz + y, ox + x + 1, oz + y + 1, 0, g.color, jitter)
    }
    const shift = (p: Pt[]): Pt[] => p.map(([px, pz]) => [px + ox, pz + oz])
    for (let y = 0; y < site.h; y++) {
      for (let x = 0; x < site.w; x++) {
        const room = rooms.get(site.grid[y * site.w + x])
        const jitter = (0.78 + hash(x * 31 + y * 17) * 0.1) * dim
        if (room) {
          const st = styleOf(site, room)
          const cut = cutAt(site, x, y)
          const edge = curved.get(`${x},${y}`)
          const key = `floor${Math.round(st.rough * 10)}`
          if (cut) {
            const [inside, outside] = halves(ox + x, oz + y, cut)
            b.tri(key, inside, 0, st.floor, jitter)
            lay(x, y, [outside])
          } else if (edge) {
            // a curved wall runs through: floor up to it, ground beyond
            for (const p of edge.shape.inside) b.poly(key, shift(p), 0, st.floor, jitter)
            lay(x, y, edge.shape.outside.map(shift))
          } else b.quad(key, ox + x, oz + y, ox + x + 1, oz + y + 1, 0, st.floor, jitter)
        } else if (wet(x, y)) {
          water.push([x, y])
          // a stone bank wherever the water meets dry land, and a dark bed underneath
          b.quad('floor9', ox + x, oz + y, ox + x + 1, oz + y + 1, WATER_Y - 0.25, '#20313a', dim)
          const bank = (dx: number, dy: number) => {
            if (wet(x + dx, y + dy)) return
            const cx = ox + x + 0.5 + dx * 0.47
            const cz = oz + y + 0.5 + dy * 0.47
            b.box('wall', cx, -0.17, cz, dx ? 0.06 : 1, 0.36, dy ? 0.06 : 1, '#b9b4a8', dim)
          }
          bank(1, 0)
          bank(-1, 0)
          bank(0, 1)
          bank(0, -1)
        } else lay(x, y, null)
      }
    }
    return { meshes: b.build((k) => surface(k)), water }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev, dim])
  useEffect(() => () => built.meshes.forEach((m) => m.geometry.dispose()), [built])
  return (
    <>
      {built.meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
      {built.water.length > 0 && <Water tiles={built.water} w={site.w} h={site.h} dim={dim} />}
    </>
  )
}

/** Walls, doors, glazing, upper floors and roof. */
export function Structure({ site, mode, glow }: { site: Site; mode: ViewMode; glow: number }) {
  const meshes = useMeshes(() => {
    const b = new Batch()
    const rooms = new Map<number, Room>(site.rooms.map((r) => [r.n, r]))
    const curved = curveTiles(site)
    const facade = FACADES[site.facade] ?? FACADES[0]
    const roof = ROOFS[site.roof] ?? ROOFS[0]
    const ox = -site.w / 2
    const oz = -site.h / 2
    const full = mode === 'full'
    const H = mode === 'cut' ? CUT_H : STOREY - 0.1
    const top = full ? site.floors * STOREY : H
    const half = WALL_T / 2
    const overrides = new Map(site.walls.map((w) => [`${w.x},${w.y},${w.side}`, w.kind]))
    /** What stands on each edge that has a wall: 'wall' covers doors too, since their jambs finish the run. */
    const edges = new Map<string, 'wall' | 'glass'>()
    /** Posts wanted off the grid corners, where a curved wall ends or turns: position to height. */
    const loose = new Map<string, [number, number, number]>()
    const litKey = glow > 0.05 ? 'lit' : 'pane'
    /** Upper floors seen through a glass wall are lit from within at night. */
    const plateKey = full && glow > 0.05 && facade.kind === 'glass' ? 'plate' : 'wall'
    const postH = full ? top + 0.345 : H + 0.035
    const post = (px: number, pz: number, h = postH) => {
      const key = `${Math.round(px * 200)},${Math.round(pz * 200)}`
      const old = loose.get(key)
      if (!old || old[2] < h) loose.set(key, [px, pz, h])
    }

    /** One side of a wall: a slab `depth` thick on the given side of the edge line, from u0 to u1 along it. */
    const slab = (key: string, x: number, y: number, side: 'n' | 'w', toward: 1 | -1, y0: number, y1: number, color: string, shade: number, depth = half, inset = 0, u0 = 0, u1 = 1) => {
      const cy = (y0 + y1) / 2
      const off = toward * (inset + depth / 2)
      const mid = (u0 + u1) / 2
      if (side === 'n') b.box(key, ox + x + mid, cy, oz + y + off, u1 - u0, y1 - y0, depth, color, shade)
      else b.box(key, ox + x + off, cy, oz + y + mid, depth, y1 - y0, u1 - u0, color, shade)
    }
    /** A box centred on the edge line, `along` metres from the edge's start. */
    const onEdge = (key: string, x: number, y: number, side: 'n' | 'w', along: number, len: number, y0: number, y1: number, thick: number, color: string, shade = 1) => {
      const cy = (y0 + y1) / 2
      if (side === 'n') b.box(key, ox + x + along, cy, oz + y, len, y1 - y0, thick, color, shade)
      else b.box(key, ox + x, cy, oz + y + along, thick, y1 - y0, len, color, shade)
    }

    const outer = (x: number, y: number, side: 'n' | 'w', toward: 1 | -1, y0: number, y1: number, seed: number, u0 = 0, u1 = 1) => {
      // the outside face of the building, in the chosen cladding
      const j = hash(seed)
      const len = u1 - u0
      const mid = (u0 + u1) / 2
      if (facade.kind === 'brick') {
        slab('wall', x, y, side, toward, y0, y1, facade.color, 0.9 + j * 0.2, half, 0, u0, u1)
      } else if (facade.kind === 'timber') {
        // two boards per metre, each its own shade
        for (const k of [0, 1]) {
          const from = Math.max(u0, k * 0.5 + 0.005)
          const to = Math.min(u1, k * 0.5 + 0.495)
          if (to - from < 0.004) continue
          const cy = (y0 + y1) / 2
          const off = toward * (half / 2)
          const sh = 0.85 + hash(seed * 2 + k) * 0.3
          if (side === 'n') b.box('wall', ox + x + (from + to) / 2, cy, oz + y + off, to - from, y1 - y0, half, facade.color, sh)
          else b.box('wall', ox + x + off, cy, oz + y + (from + to) / 2, half, y1 - y0, to - from, facade.color, sh)
        }
      } else if (facade.kind === 'panel') {
        // panels stop short of each other so the joints read as shadow lines
        const cy = (y0 + y1) / 2
        const off = toward * (half / 2)
        const pl = Math.max(0.004, len - 0.025)
        if (side === 'n') b.box('trim', ox + x + mid, cy, oz + y + off, pl, y1 - y0 - 0.03, half, facade.color, 0.95 + j * 0.1)
        else b.box('trim', ox + x + off, cy, oz + y + mid, half, y1 - y0 - 0.03, pl, facade.color, 0.95 + j * 0.1)
        slab('wall', x, y, side, toward, y0, y1, '#101214', 1, half * 0.5, 0, u0, u1)
      } else slab('wall', x, y, side, toward, y0, y1, facade.color, 0.97 + j * 0.06, half, 0, u0, u1)
    }

    const glazed = (x: number, y: number, side: 'n' | 'w', y0: number, y1: number, u0 = 0, u1 = 1) => {
      const mid = (u0 + u1) / 2
      const len = u1 - u0
      onEdge('glass', x, y, side, mid, len, y0 + 0.08, y1 - 0.06, 0.03, '#bfe0f2')
      onEdge('trim', x, y, side, mid, len, y0, y0 + 0.08, 0.1, POST)
      onEdge('trim', x, y, side, mid, len, y1 - 0.06, y1, 0.1, POST)
      onEdge('trim', x, y, side, u0, 0.05, y0 + 0.08, y1 - 0.06, 0.08, POST)
    }

    /** Which stretches of one side of a tile are room: all of it, none of it, or what a curve leaves. */
    const spans = (x: number, y: number, side: Side): [number, number][] => {
      if (!gridAt(site, x, y)) return []
      const cut = cutAt(site, x, y)
      if (cut) return cut.includes(side) ? [] : [[0, 1]]
      return curved.get(`${x},${y}`)?.shape.sides[side] ?? [[0, 1]]
    }

    /**
     * The wall along one grid edge, or along the stretch of it from u0 to u1:
     * `a` is the room on the edge's own tile, `c` the room across it.
     */
    const run = (x: number, y: number, side: 'n' | 'w', a: number, c: number, u0: number, u1: number) => {
      const whole = u0 <= 0.001 && u1 >= 0.999
      const len = u1 - u0
      const mid = (u0 + u1) / 2
      let kind = overrides.get(`${x},${y},${side}`)
      // a door needs the whole metre; on a shorter stretch it is simply a way through
      if (kind === 'door' && !whole) kind = 'open'
      const exterior = !a || !c
      const seed = x * 53 + y * 97 + (side === 'n' ? 0 : 7)
      const ra = rooms.get(a)
      const rc = rooms.get(c)
      const glassWall = kind === 'glass' || (exterior && facade.kind === 'glass' && kind === undefined)
      if (whole) {
        if (kind !== 'open') edges.set(`${x},${y},${side}`, glassWall ? 'glass' : 'wall')
      } else if (kind !== 'open') {
        // a stretch that stops short of the corner ends in a post, where the curved wall takes over
        // (a stretch of a centimetre or two only squares off a corner the curve clips, and needs none)
        if (len > 0.08) for (const u of [u0, u1]) if (u > 0.001 && u < 0.999) post(ox + x + (side === 'n' ? u : 0), oz + y + (side === 'w' ? u : 0), full && exterior ? top + 0.345 : H + 0.035)
        if (len > 0.08 && u0 <= 0.001) edges.set(`${x},${y},${side}:0`, glassWall ? 'glass' : 'wall')
        if (len > 0.08 && u1 >= 0.999) edges.set(`${x},${y},${side}:1`, glassWall ? 'glass' : 'wall')
      }

      if (kind === 'open') {
        onEdge('trim', x, y, side, mid, len, 0, 0.012, WALL_T, CAP)
      } else if (kind === 'door') {
        onEdge('trim', x, y, side, 0.5, 1, 0, 0.012, WALL_T, CAP)
        const jambTop = Math.min(H, DOOR_H)
        onEdge('trim', x, y, side, 0.04, 0.08, 0, jambTop, WALL_T + 0.02, '#e9e6e0')
        onEdge('trim', x, y, side, 0.96, 0.08, 0, jambTop, WALL_T + 0.02, '#e9e6e0')
        if (mode !== 'cut') {
          // wall above the door, and the leaf standing open into the room
          if (ra) slab('wall', x, y, side, 1, DOOR_H, H, styleOf(site, ra).wall, 1)
          else outer(x, y, side, 1, DOOR_H, H, seed)
          if (rc) slab('wall', x, y, side, -1, DOOR_H, H, styleOf(site, rc).wall, 1)
          else outer(x, y, side, -1, DOOR_H, H, seed)
          onEdge('trim', x, y, side, 0.5, 0.84, DOOR_H - 0.04, DOOR_H, WALL_T + 0.02, '#e9e6e0')
          if (side === 'n') b.box('trim', ox + x + 0.1, DOOR_H / 2, oz + y + 0.42 + half, 0.045, DOOR_H - 0.06, 0.82, exterior ? '#2f3338' : '#8a6a4f')
          else b.box('trim', ox + x + 0.42 + half, DOOR_H / 2, oz + y + 0.1, 0.82, DOOR_H - 0.06, 0.045, exterior ? '#2f3338' : '#8a6a4f')
        }
      } else if (glassWall) {
        glazed(x, y, side, 0, H, u0, u1)
      } else {
        if (ra) slab('wall', x, y, side, 1, 0, H, styleOf(site, ra).wall, 0.97 + hash(seed) * 0.05, half, 0, u0, u1)
        else outer(x, y, side, 1, 0, H, seed, u0, u1)
        if (rc) slab('wall', x, y, side, -1, 0, H, styleOf(site, rc).wall, 0.97 + hash(seed + 1) * 0.05, half, 0, u0, u1)
        else outer(x, y, side, -1, 0, H, seed + 1, u0, u1)
        // skirting in the room's accent colour, proud of the wall
        if (ra) slab('trim', x, y, side, 1, 0, 0.09, styleOf(site, ra).trim, 1, 0.012, half, u0, u1)
        if (rc) slab('trim', x, y, side, -1, 0, 0.09, styleOf(site, rc).trim, 1, 0.012, half, u0, u1)
        // a window in the outside wall, where the wall is tall enough to have one
        if (exterior && whole && mode !== 'cut' && hash(seed + 3) > 0.25) {
          const toward = a ? -1 : 1
          slab(hash(seed + 9) > 0.45 ? litKey : 'pane', x, y, side, toward, 0.95, 2.3, '#27353f', 1, 0.014, half)
        }
      }
      // the cut line: a dark cap along the top of every wall
      if (kind !== 'open' && !(kind === 'door' && mode === 'cut') && !full) onEdge('trim', x, y, side, mid, len, H, H + 0.03, WALL_T, CAP)

      // ---- upper storeys, outside view only
      if (full && exterior) {
        const toward = a ? -1 : 1
        for (let f = 1; f < site.floors; f++) {
          const y0 = f * STOREY - 0.1
          const y1 = (f + 1) * STOREY - 0.1
          if (facade.kind === 'glass') {
            glazed(x, y, side, y0 + 0.3, y1, u0, u1)
            onEdge('trim', x, y, side, mid, len, y0, y0 + 0.3, WALL_T, POST)
          } else {
            outer(x, y, side, toward, y0, y1, seed + f * 11, u0, u1)
            slab('wall', x, y, side, toward === 1 ? -1 : 1, y0, y1, '#d9d6cf', 1, half, 0, u0, u1)
            if (whole && hash(seed + f * 5) > 0.2) slab(hash(seed + f * 13) > 0.5 ? litKey : 'pane', x, y, side, toward, y0 + 0.95, y0 + 2.4, '#27353f', 1, 0.014, half)
          }
        }
        // parapet above the roof line
        const base = site.floors * STOREY - 0.1
        if (facade.kind === 'glass') onEdge('trim', x, y, side, mid, len, base, base + 0.4, WALL_T, POST)
        else {
          outer(x, y, side, toward, base, base + 0.4, seed + 99, u0, u1)
          slab('wall', x, y, side, toward === 1 ? -1 : 1, base, base + 0.4, facade.color, 0.9, half, 0, u0, u1)
        }
        onEdge('trim', x, y, side, mid, len, base + 0.4, base + 0.44, WALL_T + 0.04, CAP)
      }
    }

    for (let y = 0; y <= site.h; y++) {
      for (let x = 0; x <= site.w; x++) {
        for (const side of ['n', 'w'] as const) {
          if ((side === 'n' && x >= site.w) || (side === 'w' && y >= site.h)) continue
          const bx = side === 'n' ? x : x - 1
          const by = side === 'n' ? y - 1 : y
          const na = gridAt(site, x, y)
          const nc = gridAt(site, bx, by)
          if (!na && !nc) continue
          const sa = spans(x, y, side)
          const sc = spans(bx, by, side === 'n' ? 's' : 'e')
          const wholeA = sa.length === 1 && sa[0][0] <= 0 && sa[0][1] >= 1
          const wholeC = sc.length === 1 && sc[0][0] <= 0 && sc[0][1] >= 1
          if ((wholeA || !sa.length) && (wholeC || !sc.length)) {
            // the ordinary case: each side of the edge is all room or all open
            const a = wholeA ? na : 0
            const c = wholeC ? nc : 0
            if (a !== c) run(x, y, side, a, c, 0, 1)
            continue
          }
          // a curve crosses this edge: wall only the stretches where the two sides differ
          const marks = [...new Set([0, 1, ...sa.flat(), ...sc.flat()])].sort((p, q) => p - q)
          const within = (list: [number, number][], u: number) => list.some(([p, q]) => u > p && u < q)
          let open: { a: number; c: number; u0: number; u1: number } | null = null
          const flush = () => {
            if (open && open.u1 - open.u0 > 0.004) run(x, y, side, open.a, open.c, open.u0, open.u1)
            open = null
          }
          for (let i = 0; i + 1 < marks.length; i++) {
            const u = (marks[i] + marks[i + 1]) / 2
            const a = within(sa, u) ? na : 0
            const c = within(sc, u) ? nc : 0
            const cur = open as { a: number; c: number; u0: number; u1: number } | null
            if (cur && cur.a === a && cur.c === c) cur.u1 = marks[i + 1]
            else {
              flush()
              if (a !== c) open = { a, c, u0: marks[i], u1: marks[i + 1] }
            }
          }
          flush()
        }
      }
    }

    // ---- curved walls: each tile draws the stretches of wall that cross it
    const baySeed = (curve: number, bay: string) => curve * 977 + bay.charCodeAt(0) * 31 + Number(bay.slice(1)) * 7
    site.curves?.forEach((c, ci) => {
      const room = rooms.get(c.room)
      if (!room) return
      const geom = geomOf(c)
      const style = styleOf(site, room)
      const standing = new Map<string, boolean>()
      const stands = (bay: string) => {
        let v = standing.get(bay)
        if (v === undefined) standing.set(bay, (v = bayStands(site, ci, bay)))
        return v
      }
      /** The stretches actually drawn, to find where the wall stops or turns a corner. */
      const drawn: { f: number; t0: number; t1: number }[] = []

      /**
       * A strip of wall following a facet from t0 to t1, between two offsets
       * from its line (out of the room is positive) and two heights. `faces`
       * names the sides to draw: o(uter), i(nner), t(op), b(ottom).
       */
      const strip = (key: string, f: Facet, t0: number, t1: number, d0: number, d1: number, y0: number, y1: number, faces: string, color: string, shade = 1, smooth = true) => {
        const at = (t: number, d: number): [number, number, Pt] => {
          let nx = f.nx0 + (f.nx1 - f.nx0) * t
          let nz = f.ny0 + (f.ny1 - f.ny0) * t
          const l = Math.hypot(nx, nz) || 1
          nx /= l
          nz /= l
          return [ox + f.x0 + (f.x1 - f.x0) * t + nx * d, oz + f.y0 + (f.y1 - f.y0) * t + nz * d, [nx, nz]]
        }
        const flat: Pt = [(f.nx0 + f.nx1) / 2, (f.ny0 + f.ny1) / 2]
        const fl = Math.hypot(flat[0], flat[1]) || 1
        flat[0] /= fl
        flat[1] /= fl
        const [ax1, az1, na] = at(t0, d1)
        const [bx1, bz1, nb] = at(t1, d1)
        const [ax0, az0] = at(t0, d0)
        const [bx0, bz0] = at(t1, d0)
        const neg = (n: Pt): Pt => [-n[0], -n[1]]
        if (faces.includes('o')) b.upright(key, ax1, az1, bx1, bz1, y0, y1, smooth ? na : flat, smooth ? nb : flat, color, shade)
        if (faces.includes('i')) b.upright(key, ax0, az0, bx0, bz0, y0, y1, neg(smooth ? na : flat), neg(smooth ? nb : flat), color, shade)
        const cap: Pt[] = [[ax0, az0], [bx0, bz0], [bx1, bz1], [ax1, az1]]
        if (faces.includes('t')) b.poly(key, cap, y1, color, shade, true)
        if (faces.includes('b')) b.poly(key, cap, y0, color, shade, false)
      }

      /** The outside face of a stretch of curved wall, in the chosen cladding. */
      const clad = (f: Facet, t0: number, t1: number, y0: number, y1: number, seed: number) => {
        const j = hash(seed)
        if (facade.kind === 'brick') strip('wall', f, t0, t1, 0, half, y0, y1, 'o', facade.color, 0.9 + j * 0.2)
        else if (facade.kind === 'timber') {
          // two boards to the bay, each its own shade
          const where = (t: number) => (f.part + t) / f.parts
          const cutT = (0.5 * f.parts - f.part)
          const pieces: [number, number][] = where(t0) < 0.5 - 1e-6 && where(t1) > 0.5 + 1e-6 ? [[t0, cutT], [cutT, t1]] : [[t0, t1]]
          for (const [p, q] of pieces) strip('wall', f, p, q, 0, half, y0, y1, 'o', facade.color, 0.85 + hash(seed * 2 + (where((p + q) / 2) < 0.5 ? 0 : 1)) * 0.3, false)
        } else if (facade.kind === 'panel') {
          // panels stop short at each end of a bay so the joints read as shadow lines
          const gap = 0.0125 / f.len
          const p = f.part === 0 ? Math.max(t0, gap) : t0
          const q = f.part === f.parts - 1 ? Math.min(t1, 1 - gap) : t1
          strip('wall', f, t0, t1, 0, half * 0.5, y0, y1, 'o', '#101214')
          if (q > p) strip('trim', f, p, q, half * 0.5, half, y0 + 0.015, y1 - 0.015, 'ot', facade.color, 0.95 + j * 0.1, f.parts > 1)
        } else strip('wall', f, t0, t1, 0, half, y0, y1, 'o', facade.color, 1)
      }
      const glazedStrip = (f: Facet, t0: number, t1: number, y0: number, y1: number) => {
        strip('glass', f, t0, t1, -0.015, 0.015, y0 + 0.08, y1 - 0.06, 'oi', '#bfe0f2')
        strip('trim', f, t0, t1, -0.05, 0.05, y0, y0 + 0.08, 'oit', POST)
        strip('trim', f, t0, t1, -0.05, 0.05, y1 - 0.06, y1, 'oitb', POST)
      }

      for (const tile of curved.values()) {
        if (tile.curve !== ci) continue
        for (const piece of tile.shape.pieces) {
          const f = geom.facets[piece.facet]
          const { t0, t1 } = piece
          const whole = stands(f.bay)
          const kind = whole ? c.walls?.[f.bay] : undefined
          const seed = baySeed(ci, f.bay)
          const glassWall = kind === 'glass' || (facade.kind === 'glass' && kind === undefined)
          if (kind !== 'open') drawn.push({ f: piece.facet, t0, t1 })
          if (kind === 'open') {
            strip('trim', f, t0, t1, -half, half, 0, 0.012, 't', CAP)
            continue
          }
          if (kind === 'door') {
            strip('trim', f, t0, t1, -half, half, 0, 0.012, 't', CAP)
            if (mode !== 'cut') {
              // wall above the door
              strip('wall', f, t0, t1, -half, 0, DOOR_H, H, 'ib', style.wall)
              clad(f, t0, t1, DOOR_H, H, seed)
              strip('wall', f, t0, t1, 0, half, DOOR_H, DOOR_H + 0.001, 'b', facade.color)
            }
          } else if (glassWall) {
            glazedStrip(f, t0, t1, 0, H)
          } else {
            strip('wall', f, t0, t1, -half, 0, 0, H, 'i', style.wall, 0.99)
            clad(f, t0, t1, 0, H, seed)
            strip('trim', f, t0, t1, -half - 0.012, -half, 0, 0.09, 'it', style.trim)
            if (mode !== 'cut' && whole && hash(seed + 3) > 0.25) strip(hash(seed + 9) > 0.45 ? litKey : 'pane', f, t0, t1, half, half + 0.014, 0.95, 2.3, 'otb', '#27353f', 1, false)
          }
          if (!(kind === 'door' && mode === 'cut') && !full) strip('trim', f, t0, t1, -half, half, H, H + 0.03, 'oit', CAP)
          if (!full) continue
          // ---- upper storeys and the parapet
          for (let fl = 1; fl < site.floors; fl++) {
            const y0 = fl * STOREY - 0.1
            const y1 = (fl + 1) * STOREY - 0.1
            if (facade.kind === 'glass') {
              glazedStrip(f, t0, t1, y0 + 0.3, y1)
              strip('trim', f, t0, t1, -half, half, y0, y0 + 0.3, 'oi', POST)
              // the edge of the floor plate, seen through the glass below the band
              strip(plateKey, f, t0, t1, -half, -0.02, y0 - 0.2, y0, 'o', '#cfccc5')
            } else {
              clad(f, t0, t1, y0, y1, seed + fl * 11)
              strip('wall', f, t0, t1, -half, 0, y0, y1, 'i', '#d9d6cf')
              if (whole && hash(seed + fl * 5) > 0.2) strip(hash(seed + fl * 13) > 0.5 ? litKey : 'pane', f, t0, t1, half, half + 0.014, y0 + 0.95, y0 + 2.4, 'otb', '#27353f', 1, false)
            }
          }
          const base = site.floors * STOREY - 0.1
          if (facade.kind === 'glass') {
            strip('trim', f, t0, t1, -half, half, base, base + 0.4, 'oi', POST)
            strip('wall', f, t0, t1, -half, -0.02, base - 0.12, base, 'o', '#cfccc5')
          } else {
            clad(f, t0, t1, base, base + 0.4, seed + 99)
            strip('wall', f, t0, t1, -half, 0, base, base + 0.4, 'i', facade.color, 0.9)
          }
          strip('trim', f, t0, t1, -half - 0.02, half + 0.02, base + 0.4, base + 0.44, 'oit', CAP)
        }
      }

      // ---- per bay: door frames and leaves, and the mullions of a glass wall
      for (const bay of geom.bays.values()) {
        if (!stands(bay.key)) continue
        const kind = c.walls?.[bay.key]
        const first = geom.facets[bay.facets[0]]
        const last = geom.facets[bay.facets[bay.facets.length - 1]]
        const rot = Math.atan2(-(last.y1 - first.y0), last.x1 - first.x0)
        const stile = (f: Facet, t: number, y0: number, y1: number, along: number, thick: number, color: string) => b.boxRot('trim', ox + f.x0 + (f.x1 - f.x0) * t, (y0 + y1) / 2, oz + f.y0 + (f.y1 - f.y0) * t, along, y1 - y0, thick, Math.atan2(-(f.y1 - f.y0), f.x1 - f.x0), color)
        if (kind === 'door') {
          const jambTop = Math.min(H, DOOR_H)
          stile(first, 0.04 / first.len, 0, jambTop, 0.08, WALL_T + 0.02, '#e9e6e0')
          stile(last, 1 - 0.04 / last.len, 0, jambTop, 0.08, WALL_T + 0.02, '#e9e6e0')
          if (mode !== 'cut') {
            b.boxRot('trim', ox + bay.x, DOOR_H - 0.02, oz + bay.y, bay.len - 0.12, 0.04, WALL_T + 0.02, rot, '#e9e6e0')
            // the leaf stands open into the room, hinged at the start of the bay
            const hx = first.x0 + (first.x1 - first.x0) * (0.1 / first.len)
            const hz = first.y0 + (first.y1 - first.y0) * (0.1 / first.len)
            b.boxRot('trim', ox + hx - first.nx0 * (0.42 + half), DOOR_H / 2, oz + hz - first.ny0 * (0.42 + half), 0.82, DOOR_H - 0.06, 0.045, Math.atan2(-first.ny0, first.nx0), '#2f3338')
          }
        } else if (kind !== 'open' && (kind === 'glass' || (facade.kind === 'glass' && kind === undefined))) {
          stile(first, 0, 0.08, H - 0.06, 0.05, 0.08, POST)
          if (full && facade.kind === 'glass') for (let fl = 1; fl < site.floors; fl++) stile(first, 0, fl * STOREY + 0.28, (fl + 1) * STOREY - 0.16, 0.05, 0.08, POST)
        }
      }

      // a post wherever the curved wall stops, or turns a corner into one of an arc's straight ends
      for (const loop of geom.loops) {
        const order = new Map(loop.map((f, i) => [f, i]))
        const list = drawn.filter((p) => order.has(p.f)).sort((p, q) => order.get(p.f)! - order.get(q.f)! || p.t0 - q.t0)
        const at = (p: { f: number }, t: number): Pt => {
          const f = geom.facets[p.f]
          return [f.x0 + (f.x1 - f.x0) * t, f.y0 + (f.y1 - f.y0) * t]
        }
        list.forEach((p, i) => {
          const next = list[(i + 1) % list.length]
          const [ex, ez] = at(p, p.t1)
          const [sx, sz] = at(next, next.t0)
          // a gap of a centimetre or two is only a corner the curve clips; anything wider is a real end
          if (Math.hypot(sx - ex, sz - ez) > 0.08) {
            post(ox + ex, oz + ez)
            post(ox + sx, oz + sz)
          } else if (geom.facets[p.f].band !== geom.facets[next.f].band) post(ox + ex, oz + ez)
        })
      }
    })

    // ---- diagonal walls across tiles whose corner is cut away
    /** Diagonals ending at each grid corner: how many, and whether they all run the same way. */
    const diag = new Map<string, { n: number; way: number; mixed: boolean }>()
    const mark = (x: number, y: number, way: number) => {
      const d = diag.get(`${x},${y}`)
      if (!d) diag.set(`${x},${y}`, { n: 1, way, mixed: false })
      else {
        d.n++
        if (d.way !== way) d.mixed = true
      }
    }
    for (const [key, cut] of Object.entries(site.cuts ?? {})) {
      const [x, y] = key.split(',').map(Number)
      const room = rooms.get(gridAt(site, x, y))
      if (!room) continue
      // 'ne' and 'sw' cuts run from the north-west corner to the south-east; the others the opposite way
      const falling = cut === 'ne' || cut === 'sw'
      const rot = falling ? -Math.PI / 4 : Math.PI / 4
      if (falling) (mark(x, y, 0), mark(x + 1, y + 1, 0))
      else (mark(x + 1, y, 1), mark(x, y + 1, 1))
      const nx = (cut[1] === 'e' ? 1 : -1) * Math.SQRT1_2
      const nz = (cut[0] === 'n' ? -1 : 1) * Math.SQRT1_2
      const cx = ox + x + 0.5
      const cz = oz + y + 0.5
      const len = Math.SQRT2
      const q = half / 2
      const seed = x * 53 + y * 97 + 3
      const outerTop = full ? site.floors * STOREY + 0.3 : H
      b.boxRot('wall', cx - nx * q, H / 2, cz - nz * q, len, H, half, rot, styleOf(site, room).wall, 0.97 + hash(seed) * 0.05)
      if (facade.kind === 'glass') {
        b.boxRot('glass', cx + nx * q, outerTop / 2 + 0.04, cz + nz * q, len, outerTop - 0.14, 0.03, rot, '#bfe0f2')
        b.boxRot('trim', cx + nx * q, 0.04, cz + nz * q, len, 0.08, 0.1, rot, POST)
        b.boxRot('trim', cx + nx * q, outerTop - 0.03, cz + nz * q, len, 0.06, 0.1, rot, POST)
        for (let fl = 1; full && fl < site.floors; fl++) b.boxRot('trim', cx + nx * q, fl * STOREY + 0.05, cz + nz * q, len, 0.3, WALL_T, rot, POST)
      } else b.boxRot(facade.kind === 'panel' ? 'trim' : 'wall', cx + nx * q, outerTop / 2, cz + nz * q, len, outerTop, half, rot, facade.color, 0.92 + hash(seed + 1) * 0.12)
      b.boxRot('trim', cx, (full ? outerTop : H) + 0.015, cz, len, 0.03, WALL_T + (full ? 0.04 : 0), rot, CAP)
    }

    // posts stand at corners, junctions and wall ends, not along a straight run
    for (let y = 0; y <= site.h; y++) {
      for (let x = 0; x <= site.w; x++) {
        // a stretch of wall that reaches this corner counts as much as a whole edge does
        const west = edges.get(`${x - 1},${y},n`) ?? edges.get(`${x - 1},${y},n:1`)
        const east = edges.get(`${x},${y},n`) ?? edges.get(`${x},${y},n:0`)
        const north = edges.get(`${x},${y - 1},w`) ?? edges.get(`${x},${y - 1},w:1`)
        const south = edges.get(`${x},${y},w`) ?? edges.get(`${x},${y},w:0`)
        const count = (west ? 1 : 0) + (east ? 1 : 0) + (north ? 1 : 0) + (south ? 1 : 0)
        const d = diag.get(`${x},${y}`)
        if (!count && !d) continue
        const straight = !d && count === 2 && ((west && east && west === east) || (north && south && north === south))
        // two diagonals running the same way through a corner are one straight wall
        const slanted = !count && d && d.n === 2 && !d.mixed
        if (straight || slanted) continue
        // only corners that touch the outside carry on up the building
        const ext = !gridAt(site, x, y) || !gridAt(site, x - 1, y) || !gridAt(site, x, y - 1) || !gridAt(site, x - 1, y - 1)
        const h = full && ext ? top + 0.345 : H + 0.035
        b.box('trim', ox + x, h / 2, oz + y, WALL_T + 0.03, h, WALL_T + 0.03, POST)
      }
    }
    for (const [px, pz, h] of loose.values()) b.box('trim', px, h / 2, pz, WALL_T + 0.03, h, WALL_T + 0.03, POST)

    if (full) {
      const roofY = site.floors * STOREY - 0.1
      for (let y = 0; y < site.h; y++) {
        for (let x = 0; x < site.w; x++) {
          if (!site.grid[y * site.w + x]) continue
          const cx = ox + x + 0.5
          const cz = oz + y + 0.5
          const sh = 0.94 + hash(x * 7 + y * 13) * 0.1
          const cut = cutAt(site, x, y)
          if (cut) {
            // half a tile of roof and floor plate over a cut corner
            const [inside] = halves(ox + x, oz + y, cut)
            b.tri('wall', inside, roofY, roof.color, sh)
            for (let f = 1; f < site.floors; f++) b.tri('wall', inside, f * STOREY - 0.1, '#cfccc5', 1)
            continue
          }
          const edge = curved.get(`${x},${y}`)
          if (edge) {
            // roof and floor plates follow the curve, each with an underside so no light gets in at the edge
            for (const p of edge.shape.inside) {
              const pts = p.map(([px, pz]): Pt => [px + ox, pz + oz])
              b.poly('wall', pts, roofY, roof.color, sh)
              b.poly('wall', pts, roofY - 0.12, roof.color, sh, false)
              for (let f = 1; f < site.floors; f++) {
                b.poly(plateKey, pts, f * STOREY - 0.1, '#cfccc5', 1)
                b.poly(plateKey, pts, f * STOREY - 0.3, '#cfccc5', 1, false)
              }
            }
            continue
          }
          b.box('wall', cx, roofY - 0.06, cz, 1, 0.12, 1, roof.color, sh)
          for (let f = 1; f < site.floors; f++) b.box(plateKey, cx, f * STOREY - 0.2, cz, 1, 0.2, 1, '#cfccc5', 1)
          const r = hash(x * 91 + y * 57)
          const inner = gridAt(site, x - 1, y) && gridAt(site, x + 1, y) && gridAt(site, x, y - 1) && gridAt(site, x, y + 1)
          if (!inner) continue
          if (roof.id === 'solar' && x % 2 === 0) {
            b.box('trim', cx, roofY + 0.2, cz, 0.9, 0.04, 0.82, '#16233c')
            b.box('trim', cx, roofY + 0.09, cz, 0.06, 0.18, 0.7, '#8a8f95')
          } else if (roof.id === 'green' && r > 0.72) {
            b.box('wall', cx, roofY + 0.14, cz, 0.6, 0.28, 0.6, r > 0.86 ? '#3f7d4d' : '#6c9a55')
          } else if ((roof.id === 'white' || roof.id === 'gravel' || roof.id === 'copper') && r > 0.975) {
            // plant on the roof: air handlers and a few skylights
            b.box('trim', cx, roofY + 0.35, cz, 0.9, 0.7, 0.9, '#b9bdc2')
            b.box('trim', cx, roofY + 0.72, cz, 0.6, 0.04, 0.6, '#3a3d42')
          } else if ((roof.id === 'white' || roof.id === 'gravel') && r < 0.02) {
            b.box('trim', cx, roofY + 0.06, cz, 0.9, 0.12, 0.9, '#8a8f95')
            b.box(litKey, cx, roofY + 0.13, cz, 0.78, 0.02, 0.78, '#27353f')
          }
        }
      }
    }
    // only the outside view lights its glass: indoors, glowing partitions would get in the way
    return b.build((k) => surface(k, k === 'lit' || k === 'plate' || (k === 'glass' && full) ? Math.round(glow * 10) / 10 : 0))
  }, [site, site.rev, mode, glow])
  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  )
}
