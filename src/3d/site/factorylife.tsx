// The factory floor at work: cartons stacking up on the shipping dock as the
// line turns them out, a lorry coming up the drive and backing into its bay
// to take them away, and the test station pushing the odd faulty unit into
// its bin. Driven by what the factory really made; purely for show.
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { FactoryLife } from '../../sim/life'
import type { Site, SiteItem } from '../../sim/types'
import { rnd } from './crowd'
import { Lorry } from './factory'
import type { Sparks } from './fx'
import { Baked } from './kit'
import { frameOf, frameX, frameZ } from './spots'
import { useTick } from './tick'
import { type Manoeuvre, type YardPlan, lengthOf, lorryAt } from './yard'

const PILE = 18
const BIN = 3
const CARTON = '#b98b56'
const FAULT = '#c2402f'
const LOAD = 1.7
/** Seconds a reject takes to tip off the belt into the bin. */
const TIP = 0.75

const M = new THREE.Matrix4()
const Q = new THREE.Quaternion()
const E = new THREE.Euler()
const V = new THREE.Vector3()
const S = new THREE.Vector3()
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
const col = new THREE.Color()
const POSE: [number, number, number] = [0, 0, 0]

/** What a dock's lorry is doing. */
const Go = { Rest: 0, Arrive: 1, Back: 2, Load: 3, Leave: 4, Away: 5 } as const

interface DockState {
  units: number
  phase: number
  /** How far along the route it is on, and how fast it is going. */
  s: number
  v: number
  t: number
  taking: number
  idle: number
  placed: boolean
}

/** How fast a lorry may go where it is: briskly on the road, slowly in the yard, and easing off toward the end of a run. */
function speedFor(site: Site, x: number, z: number, left: number): number {
  const onRoad = Math.abs(x) > site.w / 2 + 4 || z > site.h / 2 + 3.5
  return Math.min(onRoad ? 11 : 4.6, Math.sqrt(2 * 2.4 * Math.max(0, left)) + 0.5)
}

export function FactoryFloor({ site, life, sparks, plan }: { site: Site; life: FactoryLife; sparks: Sparks; plan: YardPlan }) {
  const linked = life.line?.linked
  const docks = useMemo(() => site.items.filter((i) => i.kind === 'dock_out' && linked?.has(i.id)), [site, site.rev, linked]) // eslint-disable-line react-hooks/exhaustive-deps
  const tests = useMemo(() => site.items.filter((i) => i.kind === 'test' && linked?.has(i.id)), [site, site.rev, linked]) // eslint-disable-line react-hooks/exhaustive-deps
  const dockFrames = useMemo(() => docks.map((d) => frameOf(site, d)), [docks, site])
  const testFrames = useMemo(() => tests.map((d) => frameOf(site, d)), [tests, site])
  const moves = useMemo(() => docks.map((d) => plan.docks.get(d.id)), [docks, plan])
  const lengths = useMemo(() => moves.map((m) => (m ? { arrive: lengthOf(m.arrive), back: lengthOf(m.back), leave: lengthOf(m.leave) } : { arrive: 0, back: 0, leave: 0 })), [moves])

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
  // a new layout means new routes: every lorry starts again from where it rests
  useEffect(() => {
    state.current.docks = []
  }, [plan])
  const lorries = useRef<(THREE.Group | null)[]>([])
  const live = useRef(life)
  live.current = life

  /** Stands a lorry at a point along one of its routes. */
  const put = (lorry: THREE.Group, m: Manoeuvre, route: 'arrive' | 'back' | 'leave', s: number) => {
    lorryAt(m[route], s, POSE)
    lorry.position.set(POSE[0], 0, POSE[1])
    lorry.rotation.y = POSE[2]
  }

  /** Starts a lorry on its way in from the road (or, where there is no route, straight back up to the wall). */
  const setOff = (d: DockState, lorry: THREE.Group, m: Manoeuvre, len: { arrive: number; back: number }) => {
    const routed = len.arrive > 0
    d.phase = routed ? Go.Arrive : Go.Back
    d.s = routed ? 0 : len.back
    d.v = routed ? 11 : 0
    d.t = 0
    put(lorry, m, routed ? 'arrive' : 'back', d.s)
    lorry.visible = true
  }

  useTick((dt) => {
    const s = state.current
    const lf = live.current
    while (s.docks.length < docks.length) s.docks.push({ units: 0, phase: Go.Rest, s: 0, v: 0, t: 0, taking: 0, idle: 0, placed: false })
    while (s.rejects.length < tests.length) s.rejects.push({ t: rnd(s.rejects.length * 3.1) * 1.6, fly: -1, bin: 0, n: s.rejects.length * 97 })
    // what came off the line since the last look, shared between the docks
    const made = s.built < 0 ? 0 : Math.max(0, lf.built - s.built)
    s.built = lf.built
    const load = Math.max(150, (lf.line?.throughput ?? 300) * 5)
    for (let i = 0; i < docks.length; i++) {
      const d = s.docks[i]
      const f = dockFrames[i]
      const m = moves[i]
      const len = lengths[i]
      if (lf.producing) d.units += made / docks.length
      d.idle = lf.producing ? 0 : d.idle + dt
      const lorry = lorries.current[i]
      const ready = d.units >= load || (d.idle > 2.5 && d.units > load * 0.12)
      if (!m && ready) {
        // no lorry can get to this dock: the load goes out by the door behind it, unseen
        d.t += dt
        if (d.t > 1.2) d.units = Math.max(0, d.units - (load * dt) / LOAD)
        if (d.units <= 0) d.t = 0
      }
      if (lorry && m) {
        // a lorry with a marked bay waits in it between loads; one without only turns up when there is a load
        const based = !!m.truck
        const noseIn = !m.back.length
        if (!d.placed) {
          d.placed = true
          lorry.visible = based
          if (noseIn) put(lorry, m, 'arrive', len.arrive)
          else put(lorry, m, 'back', 0)
          // shadows on a site are drawn once and kept, so nothing that moves may cast one
          lorry.traverse((o) => {
            o.castShadow = false
          })
        }
        switch (d.phase) {
          case Go.Rest:
            if (!ready) break
            if (based) {
              d.phase = Go.Load
              d.t = 0
              d.taking = Math.min(d.units, load)
            } else setOff(d, lorry, m, len)
            break
          case Go.Arrive: {
            put(lorry, m, 'arrive', d.s)
            d.v += (speedFor(site, lorry.position.x, lorry.position.z, len.arrive - d.s) - d.v) * Math.min(1, dt * 2.5)
            d.s += d.v * dt
            if (d.s >= len.arrive) {
              d.s = noseIn ? len.arrive : len.back
              d.v = 0
              d.t = 0
              d.phase = noseIn ? (based && !ready ? Go.Rest : Go.Load) : Go.Back
              if (noseIn) d.taking = Math.min(d.units, load)
            }
            break
          }
          case Go.Back: {
            // a pause to find reverse, then slowly back round into the bay
            d.t += dt
            if (d.t < 0.5) break
            d.v += (Math.min(1.9, Math.sqrt(2 * 1.1 * Math.max(0, d.s)) + 0.25) - d.v) * Math.min(1, dt * 2)
            d.s = Math.max(0, d.s - d.v * dt)
            put(lorry, m, 'back', d.s)
            if (d.s <= 0) {
              d.v = 0
              d.t = 0
              sparks.puff(m.park[0] - m.out[0] * 3.4, m.park[1] - m.out[1] * 3.4, 0.9, 6)
              d.phase = based && !ready ? Go.Rest : Go.Load
              d.taking = Math.min(d.units, load)
            }
            break
          }
          case Go.Load:
            d.t += dt
            d.units = Math.max(0, d.units - (d.taking * dt) / LOAD)
            if (d.t >= LOAD + 0.4) {
              d.phase = Go.Leave
              d.s = noseIn ? len.arrive : 0
              d.v = 0
            }
            break
          case Go.Leave: {
            if (noseIn) {
              // back out the way it came
              d.v += ((d.s > len.arrive - 14 ? 1.9 : 6) - d.v) * Math.min(1, dt * 1.5)
              d.s -= d.v * dt
              put(lorry, m, 'arrive', d.s)
            } else {
              put(lorry, m, 'leave', d.s)
              d.v += (speedFor(site, lorry.position.x, lorry.position.z, 1e3) - d.v) * Math.min(1, dt * 1.2)
              d.s += d.v * dt
            }
            if (noseIn ? d.s <= 0 : d.s >= len.leave) {
              lorry.visible = false
              d.phase = based ? Go.Away : Go.Rest
              d.t = 3 + rnd(i * 3.7 + d.units) * 4
            }
            break
          }
          case Go.Away:
            // an empty one is on its way back before long
            d.t -= dt
            if (d.t <= 0) setOff(d, lorry, m, len)
            break
        }
      }

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
        M.compose(V.set(frameX(f, x, z), 0.93 + layer * 0.235, frameZ(f, x, z)), Q, S.set(0.33, 0.22, 0.3))
        cartons.setMatrixAt(i * PILE + k, M)
      }
    }

    // test stations: now and then a unit fails, is lifted off the belt and dropped into the red bin on the front
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
        r.fly += dt / TIP
        const k = Math.min(1, r.fly)
        // from the test bed, up and over the front edge, down into the bin
        const x = 0.22 * k
        const z = 0.1 + 0.46 * k
        const top = 0.3 + 0.05 * Math.min(BIN, r.bin)
        const y = 0.92 + (top - 0.92) * k * k + Math.sin(k * Math.PI) * 0.32
        Q.setFromEuler(E.set(k * 2.4, f.a, k * 1.1))
        M.compose(V.set(frameX(f, x, z), y, frameZ(f, x, z)), Q, S.set(0.2, 0.14, 0.2))
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
        M.compose(V.set(frameX(f, x, z), 0.12 + Math.floor(k / 2) * 0.13, frameZ(f, x, z)), Q, S.set(0.15, 0.11, 0.15))
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
        >
          <Baked sig={d.id}>
            <Lorry seed={i + 1} />
          </Baked>
          {/* a dark patch on the ground stands in for the shadow a moving lorry cannot cast */}
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0.05]} userData={{ live: true }} renderOrder={2}>
            <planeGeometry args={[2.7, 7.9]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.26} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}

/** The docks that have a line behind them and so a lorry to send out, for planning the yard. */
export const shippingDocks = (site: Site, linked: ReadonlySet<string> | undefined): SiteItem[] => site.items.filter((i) => i.kind === 'dock_out' && linked?.has(i.id))
