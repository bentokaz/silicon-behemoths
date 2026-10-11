// The factory floor at work: cartons stacking up on the shipping dock as the
// line turns them out, a lorry backing up to take them away, and the test
// station pushing the odd faulty unit into its bin. Driven by what the
// factory really made; purely for show.
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { FactoryLife } from '../../sim/life'
import { ITEMS } from '../../sim/sites'
import type { Site, SiteItem } from '../../sim/types'
import { rnd } from './crowd'
import { Lorry } from './factory'
import type { Sparks } from './fx'
import { Baked } from './kit'
import { useTick } from './tick'

const PILE = 18
const BIN = 3
const CARTON = '#b98b56'
const FAULT = '#c2402f'
const FAR = 46
const DRIVE = 3.4
const LOAD = 1.7

const M = new THREE.Matrix4()
const Q = new THREE.Quaternion()
const E = new THREE.Euler()
const V = new THREE.Vector3()
const S = new THREE.Vector3()
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
const col = new THREE.Color()

interface Frame {
  cx: number
  cz: number
  a: number
  cos: number
  sin: number
}

function frameOf(site: Site, item: SiteItem): Frame {
  const def = ITEMS[site.kind][item.kind]
  const turned = item.rot % 2 === 1
  const a = (-item.rot * Math.PI) / 2
  return { cx: item.x - site.w / 2 + (turned ? def.h : def.w) / 2, cz: item.y - site.h / 2 + (turned ? def.w : def.h) / 2, a, cos: Math.cos(a), sin: Math.sin(a) }
}
const wx = (f: Frame, x: number, z: number) => f.cx + x * f.cos + z * f.sin
const wz = (f: Frame, x: number, z: number) => f.cz - x * f.sin + z * f.cos

interface Bay {
  /** Where the lorry stands while loading, and the way it faces (and leaves). */
  x: number
  z: number
  dx: number
  dz: number
}

/** The nearest stretch of open ground outside the wall behind (or beside) a dock, for a lorry to back up to. */
function bayFor(site: Site, f: Frame): Bay {
  const dirs: [number, number][] = [
    [-f.sin, -f.cos],
    [f.cos, -f.sin],
    [-f.cos, f.sin],
    [f.sin, f.cos],
  ]
  let best: Bay | null = null
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
        best = { x: f.cx + dx * (edge + 4.15), z: f.cz + dz * (edge + 4.15), dx, dz }
      }
      break
    }
  })
  return best ?? { x: f.cx, z: f.cz - 6, dx: 0, dz: -1 }
}

interface DockState {
  units: number
  /** 0 none, 1 backing in, 2 loading, 3 driving off. */
  phase: number
  t: number
  taking: number
  idle: number
}

export function FactoryFloor({ site, life, sparks }: { site: Site; life: FactoryLife; sparks: Sparks }) {
  const linked = life.line?.linked
  const docks = useMemo(() => site.items.filter((i) => i.kind === 'dock_out' && linked?.has(i.id)), [site, site.rev, linked]) // eslint-disable-line react-hooks/exhaustive-deps
  const tests = useMemo(() => site.items.filter((i) => i.kind === 'test' && linked?.has(i.id)), [site, site.rev, linked]) // eslint-disable-line react-hooks/exhaustive-deps
  const dockFrames = useMemo(() => docks.map((d) => frameOf(site, d)), [docks, site])
  const testFrames = useMemo(() => tests.map((d) => frameOf(site, d)), [tests, site])
  const bays = useMemo(() => dockFrames.map((f) => bayFor(site, f)), [dockFrames, site])

  const cartons = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), Math.max(1, docks.length * PILE + tests.length * (BIN + 1)))
    m.userData.live = true
    m.frustumCulled = false
    m.receiveShadow = true
    for (let i = 0; i < m.count; i++) {
      m.setMatrixAt(i, ZERO)
      m.setColorAt(i, col.set(i < docks.length * PILE ? (i % 3 === 1 ? '#c49a62' : CARTON) : FAULT))
    }
    return m
  }, [docks.length, tests.length])
  useEffect(
    () => () => {
      cartons.geometry.dispose()
      ;(cartons.material as THREE.Material).dispose()
      cartons.dispose()
    },
    [cartons],
  )

  const state = useRef<{ docks: DockState[]; built: number; rejects: { t: number; fly: number; bin: number; n: number }[] }>({ docks: [], built: -1, rejects: [] })
  const lorries = useRef<(THREE.Group | null)[]>([])
  const live = useRef(life)
  live.current = life

  useTick((dt) => {
    const s = state.current
    const lf = live.current
    while (s.docks.length < docks.length) s.docks.push({ units: 0, phase: 0, t: 0, taking: 0, idle: 0 })
    while (s.rejects.length < tests.length) s.rejects.push({ t: rnd(s.rejects.length * 3.1) * 1.6, fly: -1, bin: 0, n: s.rejects.length * 97 })
    // what came off the line since the last look, shared between the docks
    const made = s.built < 0 ? 0 : Math.max(0, lf.built - s.built)
    s.built = lf.built
    const load = Math.max(150, (lf.line?.throughput ?? 300) * 5)
    for (let i = 0; i < docks.length; i++) {
      const d = s.docks[i]
      const f = dockFrames[i]
      const bay = bays[i]
      if (lf.producing) d.units += made / docks.length
      d.idle = lf.producing ? 0 : d.idle + dt
      const lorry = lorries.current[i]
      if (d.phase === 0 && (d.units >= load || (d.idle > 2.5 && d.units > load * 0.12))) {
        d.phase = 1
        d.t = 0
        // shadows on a site are drawn once and kept, so nothing that moves may cast one
        lorry?.traverse((o) => {
          o.castShadow = false
        })
      }
      if (d.phase) {
        d.t += dt
        let away = 0
        if (d.phase === 1) {
          const k = Math.min(1, d.t / DRIVE)
          away = FAR * (1 - k) * (1 - k)
          if (k >= 1) {
            d.phase = 2
            d.t = 0
            d.taking = Math.min(d.units, load)
            sparks.puff(bay.x - bay.dx * 3.2, bay.z - bay.dz * 3.2, 0.9, 6)
          }
        } else if (d.phase === 2) {
          d.units = Math.max(0, d.units - (d.taking * dt) / LOAD)
          if (d.t >= LOAD) {
            d.phase = 3
            d.t = 0
          }
        } else {
          const k = Math.min(1, d.t / DRIVE)
          away = FAR * k * k
          if (k >= 1) d.phase = 0
        }
        if (lorry) {
          lorry.visible = d.phase !== 0
          lorry.position.set(bay.x + bay.dx * away, 0, bay.z + bay.dz * away)
        }
      } else if (lorry && lorry.visible) lorry.visible = false

      // the stack on the dock: three across, two deep, three high
      const shown = Math.min(PILE, Math.ceil((d.units / load) * PILE))
      for (let k = 0; k < PILE; k++) {
        if (k >= shown) {
          cartons.setMatrixAt(i * PILE + k, ZERO)
          continue
        }
        const layer = Math.floor(k / 6)
        const x = -0.38 + (k % 3) * 0.38 + (rnd(k * 1.7 + i) - 0.5) * 0.04
        const z = -0.06 + (Math.floor(k / 3) % 2) * 0.34
        Q.setFromEuler(E.set(0, f.a + (rnd(k * 2.3 + i) - 0.5) * 0.18, 0))
        M.compose(V.set(wx(f, x, z), 0.93 + layer * 0.235, wz(f, x, z)), Q, S.set(0.33, 0.22, 0.3))
        cartons.setMatrixAt(i * PILE + k, M)
      }
    }

    // test stations: now and then a unit fails and is pushed into the bin
    const base = docks.length * PILE
    for (let i = 0; i < tests.length; i++) {
      const r = s.rejects[i]
      const f = testFrames[i]
      const slot = base + i * (BIN + 1)
      if (lf.producing) {
        r.t += dt
        if (r.t >= 1.67) {
          r.t -= 1.67
          if (r.fly < 0 && rnd(++r.n * 7.77) < lf.caught) r.fly = 0
        }
      }
      if (r.fly >= 0) {
        r.fly += dt / 0.6
        const k = Math.min(1, r.fly)
        const x = 0.22 * k
        const z = 0.1 + 0.46 * k
        const y = 0.98 + Math.sin(k * Math.PI) * 0.18 - k * k * 0.7
        Q.setFromEuler(E.set(k * 2.4, f.a, k * 1.1))
        M.compose(V.set(wx(f, x, z), y, wz(f, x, z)), Q, S.set(0.2, 0.14, 0.2))
        cartons.setMatrixAt(slot, M)
        if (k >= 1) {
          r.fly = -1
          r.bin = r.bin >= BIN ? 1 : r.bin + 1
          cartons.setMatrixAt(slot, ZERO)
        }
      }
      for (let k = 0; k < BIN; k++) {
        if (k >= r.bin) {
          cartons.setMatrixAt(slot + 1 + k, ZERO)
          continue
        }
        const x = 0.14 + (k % 2) * 0.16
        const z = 0.56
        Q.setFromEuler(E.set(0.3 * k, f.a + k, 0.2 * k))
        M.compose(V.set(wx(f, x, z), 0.12 + Math.floor(k / 2) * 0.13, wz(f, x, z)), Q, S.set(0.15, 0.11, 0.15))
        cartons.setMatrixAt(slot + 1 + k, M)
      }
    }
    cartons.instanceMatrix.needsUpdate = true
  }, 8)

  return (
    <>
      <primitive object={cartons} />
      {docks.map((d, i) => (
        <group
          key={d.id}
          ref={(g) => {
            lorries.current[i] = g
          }}
          visible={false}
          rotation={[0, Math.atan2(bays[i].dx, bays[i].dz), 0]}
        >
          <Baked sig={d.id}>
            <Lorry seed={i + 1} />
          </Baked>
        </group>
      ))}
    </>
  )
}
