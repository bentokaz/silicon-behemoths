// The building itself: floors, the walls that follow the rooms, doors and
// glazing, and (in the outside view) upper storeys and the roof. Everything
// is generated from the site grid into a few merged meshes.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { FACADES, GROUNDS, ROOFS, edgeSides, gridAt, styleOf } from '../../sim/sites'
import type { Room, Site } from '../../sim/types'
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
    if (key === 'glass') m = new THREE.MeshPhysicalMaterial({ color: '#bfe0f2', roughness: 0.05, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false })
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

/** Floors of every room and the open ground of the plot. */
export function Ground({ site, dim }: { site: Site; dim: number }) {
  const meshes = useMeshes(() => {
    const b = new Batch()
    const rooms = new Map<number, Room>(site.rooms.map((r) => [r.n, r]))
    const ox = -site.w / 2
    const oz = -site.h / 2
    for (let y = 0; y < site.h; y++) {
      for (let x = 0; x < site.w; x++) {
        const room = rooms.get(site.grid[y * site.w + x])
        const jitter = (0.94 + hash(x * 31 + y * 17) * 0.12) * dim
        if (room) {
          const st = styleOf(site, room)
          b.quad(`floor${Math.round(st.rough * 10)}`, ox + x, oz + y, ox + x + 1, oz + y + 1, 0, st.floor, jitter)
        } else {
          const g = GROUNDS.find((d) => d.id === site.floor[`${x},${y}`]) ?? GROUNDS[0]
          b.quad(g.id === 'water' ? 'water' : `floor${Math.round(g.rough * 10)}`, ox + x, oz + y, ox + x + 1, oz + y + 1, g.id === 'water' ? -0.04 : 0, g.color, g.id === 'water' ? dim : jitter)
        }
      }
    }
    return b.build((k) => surface(k))
  }, [site, site.rev, dim])
  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  )
}

/** Walls, doors, glazing, upper floors and roof. */
export function Structure({ site, mode, glow }: { site: Site; mode: ViewMode; glow: number }) {
  const meshes = useMeshes(() => {
    const b = new Batch()
    const rooms = new Map<number, Room>(site.rooms.map((r) => [r.n, r]))
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
    const litKey = glow > 0.05 ? 'lit' : 'pane'

    /** One side of a wall: a slab `depth` thick on the given side of the edge line. */
    const slab = (key: string, x: number, y: number, side: 'n' | 'w', toward: 1 | -1, y0: number, y1: number, color: string, shade: number, depth = half, inset = 0) => {
      const cy = (y0 + y1) / 2
      const off = toward * (inset + depth / 2)
      if (side === 'n') b.box(key, ox + x + 0.5, cy, oz + y + off, 1, y1 - y0, depth, color, shade)
      else b.box(key, ox + x + off, cy, oz + y + 0.5, depth, y1 - y0, 1, color, shade)
    }
    /** A box centred on the edge line, `along` metres from the edge's start. */
    const onEdge = (key: string, x: number, y: number, side: 'n' | 'w', along: number, len: number, y0: number, y1: number, thick: number, color: string, shade = 1) => {
      const cy = (y0 + y1) / 2
      if (side === 'n') b.box(key, ox + x + along, cy, oz + y, len, y1 - y0, thick, color, shade)
      else b.box(key, ox + x, cy, oz + y + along, thick, y1 - y0, len, color, shade)
    }

    const outer = (x: number, y: number, side: 'n' | 'w', toward: 1 | -1, y0: number, y1: number, seed: number) => {
      // the outside face of the building, in the chosen cladding
      const j = hash(seed)
      if (facade.kind === 'brick') {
        slab('wall', x, y, side, toward, y0, y1, facade.color, 0.9 + j * 0.2)
      } else if (facade.kind === 'timber') {
        // two boards per metre, each its own shade
        for (const k of [0, 1]) {
          const cy = (y0 + y1) / 2
          const off = toward * (half / 2)
          const sh = 0.85 + hash(seed * 2 + k) * 0.3
          if (side === 'n') b.box('wall', ox + x + 0.25 + k * 0.5, cy, oz + y + off, 0.49, y1 - y0, half, facade.color, sh)
          else b.box('wall', ox + x + off, cy, oz + y + 0.25 + k * 0.5, half, y1 - y0, 0.49, facade.color, sh)
        }
      } else if (facade.kind === 'panel') {
        // panels stop short of each other so the joints read as shadow lines
        const cy = (y0 + y1) / 2
        const off = toward * (half / 2)
        if (side === 'n') b.box('trim', ox + x + 0.5, cy, oz + y + off, 0.975, y1 - y0 - 0.03, half, facade.color, 0.95 + j * 0.1)
        else b.box('trim', ox + x + off, cy, oz + y + 0.5, half, y1 - y0 - 0.03, 0.975, facade.color, 0.95 + j * 0.1)
        slab('wall', x, y, side, toward, y0, y1, '#101214', 1, half * 0.5)
      } else slab('wall', x, y, side, toward, y0, y1, facade.color, 0.97 + j * 0.06)
    }

    const glazed = (x: number, y: number, side: 'n' | 'w', y0: number, y1: number) => {
      onEdge('glass', x, y, side, 0.5, 1, y0 + 0.08, y1 - 0.06, 0.03, '#bfe0f2')
      onEdge('trim', x, y, side, 0.5, 1, y0, y0 + 0.08, 0.1, POST)
      onEdge('trim', x, y, side, 0.5, 1, y1 - 0.06, y1, 0.1, POST)
      onEdge('trim', x, y, side, 0, 0.05, y0 + 0.08, y1 - 0.06, 0.08, POST)
    }

    for (let y = 0; y <= site.h; y++) {
      for (let x = 0; x <= site.w; x++) {
        for (const side of ['n', 'w'] as const) {
          if ((side === 'n' && x >= site.w) || (side === 'w' && y >= site.h)) continue
          const [ta, tb] = edgeSides(x, y, side)
          const a = gridAt(site, ta[0], ta[1])
          const c = gridAt(site, tb[0], tb[1])
          if (a === c) continue
          const kind = overrides.get(`${x},${y},${side}`)
          const exterior = !a || !c
          const seed = x * 53 + y * 97 + (side === 'n' ? 0 : 7)
          const ra = rooms.get(a)
          const rc = rooms.get(c)
          const glassWall = kind === 'glass' || (exterior && facade.kind === 'glass' && kind === undefined)
          if (kind !== 'open') edges.set(`${x},${y},${side}`, glassWall ? 'glass' : 'wall')

          if (kind === 'open') {
            onEdge('trim', x, y, side, 0.5, 1, 0, 0.012, WALL_T, CAP)
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
            glazed(x, y, side, 0, H)
          } else {
            if (ra) slab('wall', x, y, side, 1, 0, H, styleOf(site, ra).wall, 0.97 + hash(seed) * 0.05)
            else outer(x, y, side, 1, 0, H, seed)
            if (rc) slab('wall', x, y, side, -1, 0, H, styleOf(site, rc).wall, 0.97 + hash(seed + 1) * 0.05)
            else outer(x, y, side, -1, 0, H, seed + 1)
            // skirting in the room's accent colour, proud of the wall
            if (ra) slab('trim', x, y, side, 1, 0, 0.09, styleOf(site, ra).trim, 1, 0.012, half)
            if (rc) slab('trim', x, y, side, -1, 0, 0.09, styleOf(site, rc).trim, 1, 0.012, half)
            // a window in the outside wall, where the wall is tall enough to have one
            if (exterior && mode !== 'cut' && hash(seed + 3) > 0.25) {
              const toward = a ? -1 : 1
              slab(hash(seed + 9) > 0.45 ? litKey : 'pane', x, y, side, toward, 0.95, 2.3, '#27353f', 1, 0.014, half)
            }
          }
          // the cut line: a dark cap along the top of every wall
          if (kind !== 'open' && !(kind === 'door' && mode === 'cut') && !full) onEdge('trim', x, y, side, 0.5, 1, H, H + 0.03, WALL_T, CAP)

          // ---- upper storeys, outside view only
          if (full && exterior) {
            const toward = a ? -1 : 1
            for (let f = 1; f < site.floors; f++) {
              const y0 = f * STOREY - 0.1
              const y1 = (f + 1) * STOREY - 0.1
              if (facade.kind === 'glass') {
                glazed(x, y, side, y0 + 0.3, y1)
                onEdge('trim', x, y, side, 0.5, 1, y0, y0 + 0.3, WALL_T, POST)
              } else {
                outer(x, y, side, toward, y0, y1, seed + f * 11)
                slab('wall', x, y, side, toward === 1 ? -1 : 1, y0, y1, '#d9d6cf', 1)
                if (hash(seed + f * 5) > 0.2) slab(hash(seed + f * 13) > 0.5 ? litKey : 'pane', x, y, side, toward, y0 + 0.95, y0 + 2.4, '#27353f', 1, 0.014, half)
              }
            }
            // parapet above the roof line
            const base = site.floors * STOREY - 0.1
            if (facade.kind === 'glass') onEdge('trim', x, y, side, 0.5, 1, base, base + 0.4, WALL_T, POST)
            else {
              outer(x, y, side, toward, base, base + 0.4, seed + 99)
              slab('wall', x, y, side, toward === 1 ? -1 : 1, base, base + 0.4, facade.color, 0.9)
            }
            onEdge('trim', x, y, side, 0.5, 1, base + 0.4, base + 0.44, WALL_T + 0.04, CAP)
          }
        }
      }
    }

    // posts stand at corners, junctions and wall ends, not along a straight run
    for (let y = 0; y <= site.h; y++) {
      for (let x = 0; x <= site.w; x++) {
        const west = edges.get(`${x - 1},${y},n`)
        const east = edges.get(`${x},${y},n`)
        const north = edges.get(`${x},${y - 1},w`)
        const south = edges.get(`${x},${y},w`)
        const count = (west ? 1 : 0) + (east ? 1 : 0) + (north ? 1 : 0) + (south ? 1 : 0)
        if (!count) continue
        const straight = count === 2 && ((west && east && west === east) || (north && south && north === south))
        if (straight) continue
        // only corners that touch the outside carry on up the building
        const ext = !gridAt(site, x, y) || !gridAt(site, x - 1, y) || !gridAt(site, x, y - 1) || !gridAt(site, x - 1, y - 1)
        const h = full && ext ? top + 0.345 : H + 0.035
        b.box('trim', ox + x, h / 2, oz + y, WALL_T + 0.03, h, WALL_T + 0.03, POST)
      }
    }

    if (full) {
      const roofY = site.floors * STOREY - 0.1
      for (let y = 0; y < site.h; y++) {
        for (let x = 0; x < site.w; x++) {
          if (!site.grid[y * site.w + x]) continue
          const cx = ox + x + 0.5
          const cz = oz + y + 0.5
          const sh = 0.94 + hash(x * 7 + y * 13) * 0.1
          b.box('wall', cx, roofY - 0.06, cz, 1, 0.12, 1, roof.color, sh)
          for (let f = 1; f < site.floors; f++) b.box('wall', cx, f * STOREY - 0.2, cz, 1, 0.2, 1, '#cfccc5', 1)
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
    return b.build((k) => surface(k, k === 'lit' ? Math.round(glow * 10) / 10 : 0))
  }, [site, site.rev, mode, glow])
  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  )
}
