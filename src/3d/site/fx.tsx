// Small, short-lived effects that give building some weight: dust when
// something lands, walls that rise and crumble, doors that swing, confetti.
// Each is one instanced mesh, and draws nothing while nothing is happening.
import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FACADES, edgeIds, styleOf } from '../../sim/sites'
import type { Site } from '../../sim/types'
import type { Crowd } from './crowd'
import { rnd } from './crowd'
import type { Nav } from './nav'
import { CUT_H, STOREY, WALL_T } from './structure'
import { useTick } from './tick'

const M = new THREE.Matrix4()
const Q = new THREE.Quaternion()
const E = new THREE.Euler()
const V = new THREE.Vector3()
const S = new THREE.Vector3()
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
const col = new THREE.Color()

// ---------------------------------------------------------------- particles

const MAX = 160
const DUST = '#b8ad98'

/** A pool of puffs and sparks. Anything on the site can ask it for a burst. */
export class Sparks {
  // x, y, z, vx, vy, vz, age, life, size, gravity
  data = new Float32Array(MAX * 10)
  colors: string[] = new Array(MAX).fill(DUST)
  alive = 0
  private next = 0
  dirty = false

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, gravity: number, color: string) {
    const i = this.next
    this.next = (this.next + 1) % MAX
    const d = this.data
    const o = i * 10
    d[o] = x
    d[o + 1] = y
    d[o + 2] = z
    d[o + 3] = vx
    d[o + 4] = vy
    d[o + 5] = vz
    d[o + 6] = 0
    d[o + 7] = life
    d[o + 8] = size
    d[o + 9] = gravity
    this.colors[i] = color
    this.dirty = true
    this.alive = Math.max(this.alive, 1)
  }

  /** A ring of dust rolling out along the floor. */
  puff(x: number, z: number, radius = 0.5, count = 9, y = 0.06) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + rnd(x * 7 + z * 3 + k) * 0.8
      const v = 0.9 + rnd(k * 3.1 + x) * 0.9
      this.emit(x + Math.cos(a) * radius * 0.6, y, z + Math.sin(a) * radius * 0.6, Math.cos(a) * v, 0.25 + rnd(k + z) * 0.5, Math.sin(a) * v, 0.45 + rnd(k * 1.7) * 0.25, 0.11 + rnd(k * 2.3 + z) * 0.08, 0, DUST)
    }
  }

  /** Bits thrown up and falling back: confetti for a finished project. */
  burst(x: number, y: number, z: number, colors: string[], count = 26) {
    for (let k = 0; k < count; k++) {
      const a = rnd(k * 5.1 + x) * Math.PI * 2
      const v = 0.6 + rnd(k * 2.9 + z) * 1.4
      this.emit(x, y, z, Math.cos(a) * v, 2.4 + rnd(k * 1.3) * 2.2, Math.sin(a) * v, 1.1 + rnd(k * 0.7) * 0.6, 0.045 + rnd(k * 3.7) * 0.03, 6.5, colors[k % colors.length])
    }
  }
}

export function SparksView({ sparks }: { sparks: Sparks }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false }), MAX)
    m.frustumCulled = false
    m.userData.live = true
    m.visible = false
    m.renderOrder = 4
    for (let i = 0; i < MAX; i++) {
      m.setMatrixAt(i, ZERO)
      m.setColorAt(i, col.set(DUST))
    }
    return m
  }, [])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    },
    [mesh],
  )
  useTick((dt) => {
    if (!sparks.alive) {
      if (mesh.visible) mesh.visible = false
      return
    }
    const d = sparks.data
    let alive = 0
    for (let i = 0; i < MAX; i++) {
      const o = i * 10
      const life = d[o + 7]
      if (life <= 0) continue
      const age = (d[o + 6] += dt)
      if (age >= life) {
        d[o + 7] = 0
        mesh.setMatrixAt(i, ZERO)
        continue
      }
      alive++
      const g = d[o + 9]
      d[o + 4] -= g * dt
      const drag = g ? 0.6 : 3.2
      const keep = Math.max(0, 1 - drag * dt)
      d[o + 3] *= keep
      d[o + 5] *= keep
      if (!g) d[o + 4] *= keep
      d[o] += d[o + 3] * dt
      d[o + 1] = Math.max(0.03, d[o + 1] + d[o + 4] * dt)
      d[o + 2] += d[o + 5] * dt
      const u = age / life
      // dust swells and thins out; confetti keeps its size and then winks out
      const s = d[o + 8] * (g ? (u > 0.8 ? (1 - u) * 5 : 1) : (0.5 + u * 1.6) * (1 - u * u))
      M.makeScale(s, g ? s * 0.5 : s * 0.8, s).setPosition(d[o], d[o + 1], d[o + 2])
      mesh.setMatrixAt(i, M)
    }
    if (sparks.dirty) {
      for (let i = 0; i < MAX; i++) mesh.setColorAt(i, col.set(sparks.colors[i]))
      mesh.instanceColor!.needsUpdate = true
      sparks.dirty = false
    }
    sparks.alive = alive
    mesh.visible = alive > 0
    mesh.instanceMatrix.needsUpdate = true
  }, 20)
  return <primitive object={mesh} />
}

// ---------------------------------------------------------------- furniture landing

const DROP = 0.2
const LAND = 0.34

/** Whatever is inside drops onto the floor, squashes a little and settles, with a puff of dust. */
export function Dropping({ x, z, size, sparks, onDone, children }: { x: number; z: number; size: number; sparks: Sparks; onDone: () => void; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const state = useRef({ t: 0, landed: false, done: false })
  useTick((dt) => {
    const g = ref.current
    const s = state.current
    if (!g || s.done) return
    s.t += dt
    if (s.t < DROP) {
      const k = s.t / DROP
      g.position.y = 0.75 * (1 - k * k)
      g.scale.set(1, 1, 1)
    } else {
      if (!s.landed) {
        s.landed = true
        sparks.puff(x, z, size * 0.5, Math.round(7 + size * 3))
      }
      const k = Math.min(1, (s.t - DROP) / LAND)
      // one small bounce, dying away, with the body squashing as it hits
      g.position.y = Math.abs(Math.sin(k * Math.PI)) * 0.09 * (1 - k)
      const squash = Math.max(0, 1 - k * 3.2) * 0.14
      g.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5)
      if (k >= 1) {
        s.done = true
        onDone()
      }
    }
  }, 6)
  return (
    <group ref={ref} position={[0, 0.75, 0]}>
      {children}
    </group>
  )
}

// ---------------------------------------------------------------- walls rising and falling

/** A copy of the parts of a site the walls are drawn from, so the view can hold on to how it stood a moment ago. */
export function snapshot(site: Site): Site {
  return { ...site, grid: site.grid.slice(), rooms: site.rooms.map((r) => ({ ...r })), walls: site.walls.map((w) => ({ ...w })), cuts: site.cuts ? { ...site.cuts } : undefined }
}

export interface WallPiece {
  x: number
  z: number
  /** True when the wall runs east-west. */
  alongX: boolean
  color: string
  /** 0-1: how late in the wave this piece goes. */
  delay: number
}

/** Every stretch of solid wall on a site, by edge. */
function solidWalls(site: Site): Map<string, string> {
  const out = new Map<string, string>()
  const gaps = new Set(site.walls.filter((w) => w.kind !== 'glass').map((w) => `${w.x},${w.y},${w.side}`))
  const rooms = new Map(site.rooms.map((r) => [r.n, r]))
  const facade = (FACADES[site.facade] ?? FACADES[0]).color
  for (let y = 0; y <= site.h; y++) {
    for (let x = 0; x <= site.w; x++) {
      for (const side of ['n', 'w'] as const) {
        if ((side === 'n' && x >= site.w) || (side === 'w' && y >= site.h)) continue
        const [a, b] = edgeIds(site, x, y, side)
        if (a === b || gaps.has(`${x},${y},${side}`)) continue
        const room = rooms.get(a) ?? rooms.get(b)
        out.set(`${x},${y},${side}`, !a || !b ? facade : room ? styleOf(site, room).wall : facade)
      }
    }
  }
  return out
}

/** Walls that stand in `next` but not in `prev`, and the other way round. */
export function wallChanges(prev: Site, next: Site): { rise: WallPiece[]; fall: WallPiece[] } {
  const rise: WallPiece[] = []
  const fall: WallPiece[] = []
  if (prev.w !== next.w || prev.h !== next.h) return { rise, fall }
  const a = solidWalls(prev)
  const b = solidWalls(next)
  const piece = (key: string, color: string): WallPiece => {
    const [xs, ys, side] = key.split(',')
    const x = Number(xs)
    const y = Number(ys)
    return { x: x - next.w / 2 + (side === 'n' ? 0.5 : 0), z: y - next.h / 2 + (side === 'w' ? 0.5 : 0), alongX: side === 'n', color, delay: 0 }
  }
  for (const [key, color] of b) if (!a.has(key)) rise.push(piece(key, color))
  for (const [key, color] of a) if (!b.has(key)) fall.push(piece(key, color))
  for (const list of [rise, fall]) {
    if (!list.length) continue
    // the change sweeps across from one corner
    let min = Infinity
    let max = -Infinity
    for (const p of list) {
      const d = p.x + p.z
      min = Math.min(min, d)
      max = Math.max(max, d)
    }
    for (const p of list) p.delay = max > min ? (p.x + p.z - min) / (max - min) : 0
  }
  return { rise, fall }
}

const WAVE = 0.22
const RISE = 0.34
const FALL = 0.36

/** Walls going up (or coming down) piece by piece. Calls `onDone` when the last one has settled. */
export function WallFx({ pieces, falling, height, sparks, onDone }: { pieces: WallPiece[]; falling: boolean; height: number; sparks: Sparks; onDone: () => void }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), pieces.length)
    m.frustumCulled = false
    m.userData.live = true
    pieces.forEach((p, i) => {
      m.setColorAt(i, col.set(p.color))
      m.setMatrixAt(i, falling ? M.makeScale(p.alongX ? 1 : WALL_T, height, p.alongX ? WALL_T : 1).setPosition(p.x, height / 2, p.z) : ZERO)
    })
    return m
  }, [pieces, falling, height])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    },
    [mesh],
  )
  const state = useRef({ t: 0, done: false, puffed: new Set<number>() })
  useEffect(() => {
    state.current = { t: 0, done: false, puffed: new Set() }
  }, [mesh])
  useTick((dt) => {
    const s = state.current
    if (s.done) return
    s.t += dt
    const span = falling ? FALL : RISE
    const every = Math.max(1, Math.round(pieces.length / 14))
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]
      const k = Math.min(1, Math.max(0, (s.t - p.delay * WAVE) / span))
      let h: number
      let tilt = 0
      let drop = 0
      if (falling) {
        // lean, break and sink into the ground
        h = height * (1 - k * k)
        tilt = k * (rnd(i * 3.3) - 0.5) * 0.7
        drop = k * k * 0.1
      } else {
        // shoot up a little too far, then settle back
        const o = 1 - k
        h = height * (1 + 0.16 * Math.sin(k * Math.PI) * o - o * o * o)
      }
      if (k > 0 && i % every === 0 && !s.puffed.has(i)) {
        s.puffed.add(i)
        sparks.puff(p.x, p.z, 0.45, falling ? 6 : 4)
      }
      if (h <= 0.001) {
        mesh.setMatrixAt(i, ZERO)
        continue
      }
      Q.setFromEuler(E.set(p.alongX ? tilt : 0, 0, p.alongX ? 0 : tilt))
      M.compose(V.set(p.x, h / 2 - drop, p.z), Q, S.set(p.alongX ? 1 : WALL_T, h, p.alongX ? WALL_T : 1))
      mesh.setMatrixAt(i, M)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (s.t >= WAVE + span) {
      s.done = true
      onDone()
    }
  }, 6)
  return <primitive object={mesh} />
}

/** How tall the walls stand in each view. */
export const wallHeight = (mode: 'cut' | 'walls' | 'full') => (mode === 'cut' ? CUT_H : STOREY - 0.1)

// ---------------------------------------------------------------- doors

/** Door leaves that swing open as someone comes up to them and fall shut behind. */
export function Doors({ site, nav, crowd, height }: { site: Site; nav: Nav; crowd: Crowd | null; height: number }) {
  const doors = nav.doors
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), Math.max(1, doors.length))
    m.frustumCulled = false
    m.userData.live = true
    m.count = doors.length
    doors.forEach((d, i) => {
      const [a, b] = edgeIds(site, d.x, d.y, d.side)
      m.setColorAt(i, col.set(!a || !b ? '#33373d' : '#8a6a4f'))
    })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doors])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    },
    [mesh],
  )
  const angles = useMemo(() => new Float32Array(Math.max(1, doors.length)), [doors])
  const first = useRef(true)
  useEffect(() => {
    first.current = true
  }, [mesh])
  useTick((dt) => {
    let moved = first.current
    const leaf = 0.8
    const h = height - 0.05
    for (let i = 0; i < doors.length; i++) {
      const d = doors[i]
      const want = crowd && crowd.near(d.cx, d.cz, 1.05) ? 1.45 : 0
      const cur = angles[i]
      if (Math.abs(want - cur) > 0.002) {
        // quick to open, slower to fall shut
        angles[i] = cur + (want - cur) * Math.min(1, dt * (want > cur ? 9 : 4.5))
        moved = true
      } else if (!first.current) continue
      // hinged at the start of the edge, lying along it when shut
      const base = d.side === 'n' ? 0 : -Math.PI / 2
      const a = base + angles[i]
      const hx = d.side === 'n' ? d.cx - 0.41 : d.cx
      const hz = d.side === 'w' ? d.cz - 0.41 : d.cz
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      Q.setFromEuler(E.set(0, a, 0))
      M.compose(V.set(hx + (cos * leaf) / 2, h / 2 + 0.02, hz - (sin * leaf) / 2), Q, S.set(leaf, h, 0.045))
      mesh.setMatrixAt(i, M)
    }
    first.current = false
    if (moved) mesh.instanceMatrix.needsUpdate = true
  }, 12)
  if (!doors.length) return null
  return <primitive object={mesh} />
}
