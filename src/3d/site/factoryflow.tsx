// What moves between the blocks of a factory line, drawn over the floor:
// short transfer conveyors where an output face meets an input face directly,
// a warning where a face meets the wrong thing, painted arrows at faces that
// meet nothing yet, and the parts themselves riding the line while it works.
// Everything that moves is one instanced mesh, so a long line costs one draw.
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { DIRS, type Joint, type LineStats, boxOf, faceCells, portsOf } from '../../sim/factoryline'
import { ITEMS, itemTiles } from '../../sim/sites'
import { useFactoryOverlay } from './overlay'
import type { Site, SiteItem } from '../../sim/types'
import { PORT_IN, PORT_OUT } from './factory'
import { B, STEEL } from './kit'

const BELT = 0.8
const SPEED = 0.7
const GAP = 0.85
const MAX_PARTS = 1200

/**
 * What rides the line out of each kind of block, so a belt says what it carries: a grey tray of raw parts, a green
 * board, a dark device, a brown carton, and each component in a shape of its own.
 */
const CARGO = [
  { s: [0.24, 0.1, 0.24], c: '#8d9299' },
  { s: [0.3, 0.035, 0.22], c: '#2f7a4a' },
  { s: [0.17, 0.03, 0.32], c: '#1b1d21' },
  { s: [0.26, 0.19, 0.26], c: '#b98b56' },
  { s: [0.12, 0.03, 0.12], c: '#2b2d31' },
  { s: [0.3, 0.012, 0.2], c: '#9be7ff' },
  { s: [0.1, 0.22, 0.1], c: '#3fae5a' },
  { s: [0.26, 0.06, 0.16], c: '#c9ccd0' },
  { s: [0.1, 0.1, 0.1], c: '#5a7dff' },
  { s: [0.2, 0.1, 0.14], c: '#15171a' },
] as const
const PART_CARGO: Record<string, number> = { chip: 4, display: 5, cell: 6, casing: 7, camera: 8, psu: 9 }
/** The cargo a block sends on: its own product, or for belts and splitters whatever came in. */
const madeBy = (kind: string): number | undefined => {
  const def = ITEMS.factory[kind]
  if (!def?.stage) return undefined
  if (def.part) return PART_CARGO[def.part]
  return { in: 0, smt: 1, assembly: 2, test: 2, pack: 3 }[def.stage as string]
}

interface Run {
  ax: number
  az: number
  bx: number
  bz: number
  len: number
  n: number
  cargo: number
  phase: number
}

const centre = (site: Site, it: SiteItem): [number, number] => {
  const [x0, y0, x1, y1] = boxOf(site, it)
  return [(x0 + x1 + 1) / 2 - site.w / 2, (y0 + y1 + 1) / 2 - site.h / 2]
}

/** A flat arrow on the floor pointing along +X, 0.7 m long. */
const ARROW = (() => {
  const s = new THREE.Shape()
  s.moveTo(-0.32, -0.08)
  s.lineTo(0.05, -0.08)
  s.lineTo(0.05, -0.2)
  s.lineTo(0.34, 0)
  s.lineTo(0.05, 0.2)
  s.lineTo(0.05, 0.08)
  s.lineTo(-0.32, 0.08)
  s.closePath()
  const g = new THREE.ShapeGeometry(s)
  g.rotateX(-Math.PI / 2)
  return g
})()
const ARROW_IN = new THREE.MeshBasicMaterial({ color: PORT_IN, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
const ARROW_OUT = new THREE.MeshBasicMaterial({ color: PORT_OUT, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
const BLOCK_FLOOR = new THREE.MeshBasicMaterial({ color: '#e5484d', transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

/** A short covered transfer belt across the seam where one block's output meets the next one's input. */
function Bridge({ j, site }: { j: Joint; site: Site }) {
  const [dx, dz] = DIRS[j.dir]
  return (
    <group position={[j.x - site.w / 2, 0, j.y - site.h / 2]} rotation-y={Math.atan2(-dz, dx)}>
      <B p={[0, BELT - 0.06, 0]} s={[0.7, 0.08, 0.5]} c="#3a3d42" r={0.006} metal={0.5} rough={0.5} cast={false} />
      <B p={[0, BELT - 0.012, 0]} s={[0.7, 0.02, 0.42]} c="#15171a" r={0} rough={0.9} cast={false} />
      {[-0.27, 0.27].map((z) => (
        <B key={z} p={[0, BELT + 0.1, z]} s={[0.66, 0.22, 0.03]} c={STEEL} r={0.004} metal={0.6} rough={0.4} cast={false} />
      ))}
      <B p={[0, BELT + 0.225, 0]} s={[0.66, 0.03, 0.57]} c="#e0b23a" r={0.004} rough={0.6} cast={false} />
      {[-0.18, 0.18].map((x) => (
        <B key={x} p={[x, BELT + 0.244, 0]} s={[0.1, 0.006, 0.57]} c="#15171a" r={0} cast={false} />
      ))}
      <B p={[0, (BELT - 0.1) / 2, 0]} s={[0.08, BELT - 0.1, 0.08]} c={STEEL} r={0.006} metal={0.7} rough={0.4} cast={false} />
    </group>
  )
}

/** A joint where an output meets something it cannot feed. */
function Blocked({ j, site, label }: { j: Joint; site: Site; label: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 4))
  })
  const vertical = j.dir % 2 === 1
  return (
    <group position={[j.x - site.w / 2, 0, j.y - site.h / 2]}>
      <mesh geometry={PLANE} material={BLOCK_FLOOR} position={[0, 0.025, 0]} scale={vertical ? [0.9, 1, 0.5] : [0.5, 1, 0.9]} renderOrder={5} userData={{ live: true }} />
      <mesh ref={ref} position={[0, BELT + 0.15, 0]} renderOrder={5} userData={{ live: true }}>
        <boxGeometry args={vertical ? [0.7, 0.5, 0.04] : [0.04, 0.5, 0.7]} />
        <meshBasicMaterial color="#e5484d" transparent opacity={0.5} depthWrite={false} />
      </mesh>
      {label && (
        <Html position={[0, 2.3, 0]} center zIndexRange={[25, 15]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap border border-neg bg-panel/95 px-1.5 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-neg" title={j.why}>
            Logistics blocked
          </div>
        </Html>
      )}
    </group>
  )
}

/** Parts riding every working path of the line: one instanced mesh, moved each frame. */
function Parts({ runs }: { runs: Run[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const total = Math.min(MAX_PARTS, runs.reduce((a, r) => a + r.n, 0))
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const col = new THREE.Color()
    let k = 0
    for (const r of runs)
      for (let i = 0; i < r.n && k < total; i++, k++) mesh.setColorAt(k, col.set(CARGO[r.cargo].c))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [runs, total])
  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.elapsedTime * SPEED
    let k = 0
    for (const r of runs) {
      const cargo = CARGO[r.cargo]
      q.setFromAxisAngle(up, Math.atan2(-(r.bz - r.az), r.bx - r.ax))
      scale.set(cargo.s[0], cargo.s[1], cargo.s[2])
      for (let i = 0; i < r.n && k < total; i++, k++) {
        const f = (((t + r.phase) / r.len + i / r.n) % 1 + 1) % 1
        pos.set(r.ax + (r.bx - r.ax) * f, BELT + cargo.s[1] / 2 + 0.002, r.az + (r.bz - r.az) * f)
        m.compose(pos, q, scale)
        mesh.setMatrixAt(k, m)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  if (!total) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, total]} castShadow frustumCulled={false} userData={{ live: true }}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.75} />
    </instancedMesh>
  )
}

export function FactoryFlow({ site, line, running, labels = true }: { site: Site; line: LineStats; running: boolean; labels?: boolean }) {
  const view = useMemo(() => {
    const byId = new Map(site.items.map((i) => [i.id, i]))
    const stage = (it: SiteItem | undefined) => (it ? ITEMS.factory[it.kind]?.stage : undefined)
    // an upper floor shows only its own items: joints between machines on another floor are not drawn here
    const here = (j: { from: string; to?: string | null }) => byId.has(j.from) && (!j.to || byId.has(j.to))
    const bridges = line.joints.filter((j) => here(j) && j.ok && j.to && stage(byId.get(j.from)) !== 'belt' && stage(byId.get(j.to)) !== 'belt')
    const blocked = line.joints.filter((j) => here(j) && !j.ok)
    // floor arrows at faces that meet nothing yet: where parts would go in, and where they would come out
    const taken = new Set<string>()
    for (const it of site.items) if (ITEMS[site.kind][it.kind]) for (const [x, y] of itemTiles(site, it)) taken.add(`${x},${y}`)
    const fed = new Set(line.joints.filter((j) => j.ok && j.to).map((j) => j.to!))
    const sends = new Set(line.joints.map((j) => j.from))
    const arrows: { x: number; z: number; dir: number; out: boolean }[] = []
    for (const it of site.items) {
      const st = stage(it)
      if (!st || st === 'belt') continue
      const p = portsOf(st, it.rot)
      const box = boxOf(site, it)
      const mark = (d: number, out: boolean) => {
        const cells = faceCells(box, d)
        const mid = cells[Math.floor((cells.length - 1) / 2)]
        if (!mid || taken.has(`${mid[0]},${mid[1]}`) || mid[0] < 0 || mid[1] < 0 || mid[0] >= site.w || mid[1] >= site.h) return
        const [dx, dy] = DIRS[d]
        const x = cells.reduce((a, c) => a + c[0], 0) / cells.length + 0.5 - dx * 0.5 + dx * 0.42
        const y = cells.reduce((a, c) => a + c[1], 0) / cells.length + 0.5 - dy * 0.5 + dy * 0.42
        arrows.push({ x: x - site.w / 2, z: y - site.h / 2, dir: out ? d : (d + 2) % 4, out })
      }
      if (p.out !== null && !sends.has(it.id)) mark(p.out, true)
      if (p.ins.length && !fed.has(it.id)) mark(p.ins[0], false)
    }
    // the paths parts take: block centre to block centre along every joint on a working path
    const carry = new Map<string, number>()
    const live = line.live
    const order = [...live].map((id) => byId.get(id)!).filter(Boolean)
    for (const it of order) if (stage(it) === 'in') carry.set(it.id, 0)
    // what leaves each block: what it makes, or what reached it
    for (let pass = 0; pass < Math.min(order.length + 1, 400); pass++) {
      let moved = false
      for (const j of line.joints) {
        if (!here(j) || !j.ok || !j.to || !live.has(j.from) || !live.has(j.to) || !carry.has(j.from)) continue
        const to = byId.get(j.to)!
        const c = madeBy(to.kind) ?? carry.get(j.from)!
        if (!carry.has(j.to) || (madeBy(to.kind) === undefined && carry.get(j.to)! < c)) {
          carry.set(j.to, c)
          moved = true
        }
      }
      if (!moved) break
    }
    const runs: Run[] = []
    for (const j of line.joints) {
      if (!here(j) || !j.ok || !j.to || !live.has(j.from) || !live.has(j.to)) continue
      const a = byId.get(j.from)!
      const b = byId.get(j.to)!
      const [ax, az] = centre(site, a)
      const [bx, bz] = centre(site, b)
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 0.01) continue
      runs.push({ ax, az, bx, bz, len, n: Math.max(1, Math.round(len / GAP)), cargo: carry.get(j.from) ?? 0, phase: (a.x * 7 + a.y * 3) % 5 })
    }
    return { bridges, blocked, arrows, runs }
  }, [site, site.rev, line]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <group>
      {view.bridges.map((j) => (
        <Bridge key={`b${j.from}${j.to}`} j={j} site={site} />
      ))}
      {view.blocked.map((j, i) => (
        <Blocked key={`x${j.from}${j.to}`} j={j} site={site} label={labels && i < 12} />
      ))}
      {view.arrows.map((a, i) => (
        <mesh key={i} geometry={ARROW} material={a.out ? ARROW_OUT : ARROW_IN} position={[a.x, 0.022, a.z]} rotation-y={Math.atan2(-DIRS[a.dir][1], DIRS[a.dir][0])} renderOrder={4} userData={{ live: true }} />
      ))}
      {running && <Parts runs={view.runs} />}
      <Overlay site={site} line={line} />
    </group>
  )
}

/** The rates on the joints, when asked for, and the blocks that hold a line back, marked. */
function Overlay({ site, line }: { site: Site; line: LineStats }) {
  const o = useFactoryOverlay()
  const marks = useMemo(() => {
    const ids = new Set(o.focus)
    return site.items.filter((it) => ids.has(it.id)).map((it) => {
      const [x0, y0, x1, y1] = boxOf(site, it)
      return { id: it.id, x: (x0 + x1 + 1) / 2 - site.w / 2, z: (y0 + y1 + 1) / 2 - site.h / 2, w: x1 - x0 + 1, d: y1 - y0 + 1 }
    })
  }, [o.focus, site, site.rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = 0.04 * Math.sin(clock.elapsedTime * 5)
  })
  // rates where they say something: out of docks, belts, arms and splitters, the links that can run full
  const rates = useMemo(() => {
    if (!o.rates) return []
    const kinds = new Map(site.items.map((it) => [it.id, ITEMS.factory[it.kind]?.stage]))
    return line.joints.filter((j) => j.ok && j.rate !== undefined && j.rate > 0 && ['in', 'belt', 'split'].includes(kinds.get(j.from) ?? '')).slice(0, 60)
  }, [o.rates, line, site]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <group ref={ref}>
        {marks.map((m) => (
          <lineSegments key={m.id} geometry={EDGES} position={[m.x, 1.2, m.z]} scale={[m.w + 0.12, 2.4, m.d + 0.12]} renderOrder={7} userData={{ live: true }}>
            <lineBasicMaterial color="#ffb020" depthTest={false} transparent opacity={0.95} />
          </lineSegments>
        ))}
      </group>
      {marks[0] && (
        <Html position={[marks[0].x, 3.0, marks[0].z]} center zIndexRange={[26, 16]} style={{ pointerEvents: 'none' }}>
          <div className="w-[240px] border border-warn bg-panel/95 px-2 py-1 text-[11px] text-fg">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-warn">Bottleneck</div>
            {o.why}
          </div>
        </Html>
      )}
      {rates.map((j) => (
        <Html key={`r${j.from}${j.to}`} position={[j.x - site.w / 2, 1.35, j.y - site.h / 2]} center zIndexRange={[24, 14]} style={{ pointerEvents: 'none' }}>
          <div className="num whitespace-nowrap border border-line2 bg-panel/90 px-1 text-[10px] text-fg">{Math.round(j.rate! * (line.plant.shifts === 3 ? 2.7 : line.plant.shifts === 2 ? 1.9 : 1)).toLocaleString('en-US')}</div>
        </Html>
      ))}
    </>
  )
}
const EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))
