// Light that follows the people. Two cheap layers, neither of which touches
// the merged furniture:
//
// - DeskScreens draws the lit face of each monitor (and the shade of a desk
//   lamp) of the people who are drawn walking about, and only while they are
//   at their desk, so a screen goes dark when its owner goes home.
// - RoomLights lights the site room by room after dark: a room with someone
//   in it glows, an empty one is left dim. The glow is a tinted layer over
//   the floor (one instanced quad per tile) plus a handful of real lamps that
//   are handed to whichever lit rooms are nearest the middle of the picture.
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ITEMS } from '../../sim/sites'
import type { Site, SiteItem } from '../../sim/types'
import { type Crowd, Mode } from './crowd'
import type { Mood } from './env'
import { cylGeo } from './kit'
import { frameOf, frameX, frameZ } from './spots'
import { useTick } from './tick'

const M = new THREE.Matrix4()
const Q = new THREE.Quaternion()
const V = new THREE.Vector3()
const S = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
const col = new THREE.Color()

// ---------------------------------------------------------------- desks

/** Lit screen faces of each kind of desk, in the item's frame: x, y, z of the middle, then width and height. */
const SCREENS: Record<string, [number, number, number, number, number][]> = {
  desk: [[0, 1.06, -0.3245, 0.496, 0.286]],
  standing: [[0, 1.42, -0.3245, 0.496, 0.286]],
  helpdesk: [
    [0, 1.06, -0.3245, 0.496, 0.286],
    [0.3, 1.06, -0.3145, 0.276, 0.286],
  ],
  exec: [[-0.25, 1.085, -0.2845, 0.676, 0.286]],
}
/** Desk lamps: the middle of the shade. */
const LAMPS: Record<string, [number, number, number]> = { exec: [-0.78, 1.15, -0.34] }

/** The screens and desk lamps of the desks whose owners are drawn live: on while the owner is sitting there. */
export function DeskScreens({ site, items, crowd, glow }: { site: Site; items: SiteItem[]; crowd: Crowd; glow: number }) {
  const faces = useMemo(() => {
    const screens: { id: string; m: THREE.Matrix4 }[] = []
    const lamps: { id: string; m: THREE.Matrix4 }[] = []
    for (const item of items) {
      const f = frameOf(site, item)
      Q.setFromAxisAngle(UP, f.a)
      for (const [x, y, z, w, h] of SCREENS[item.kind] ?? []) screens.push({ id: item.id, m: new THREE.Matrix4().compose(V.set(frameX(f, x, z), y, frameZ(f, x, z)), Q, S.set(w, h, 0.004)) })
      const lamp = LAMPS[item.kind]
      if (lamp) lamps.push({ id: item.id, m: new THREE.Matrix4().compose(V.set(frameX(f, lamp[0], lamp[2]), lamp[1], frameZ(f, lamp[0], lamp[2])), Q, S.set(1.03, 1.03, 1.03)) })
    }
    return { screens, lamps }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev, items])
  const meshes = useMemo(() => {
    const screen = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#0f1b2a', emissive: '#8fbdea', roughness: 0.2 }), Math.max(1, faces.screens.length))
    const lamp = new THREE.InstancedMesh(cylGeo(0.08, 0.13, 0.14, 16), new THREE.MeshStandardMaterial({ color: '#e8dcc0', emissive: '#ffe2a8', roughness: 0.7 }), Math.max(1, faces.lamps.length))
    for (const m of [screen, lamp]) {
      m.frustumCulled = false
      m.userData.live = true
      for (let i = 0; i < m.count; i++) m.setMatrixAt(i, ZERO)
    }
    return { screen, lamp }
  }, [faces])
  useEffect(
    () => () => {
      meshes.screen.geometry.dispose()
      ;(meshes.screen.material as THREE.Material).dispose()
      ;(meshes.lamp.material as THREE.Material).dispose()
      meshes.screen.dispose()
      meshes.lamp.dispose()
    },
    [meshes],
  )
  ;(meshes.screen.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.75 * glow
  ;(meshes.lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 * glow
  const on = useMemo(() => new Map<string, boolean>(), [meshes]) // eslint-disable-line react-hooks/exhaustive-deps
  const next = useRef(0)
  useTick((dt) => {
    next.current -= dt
    if (next.current > 0) return
    next.current = 0.12
    // who is at their own desk right now
    const at = new Set<string>()
    for (const b of crowd.bodies) if (b.seat && b.spot === b.seat && b.mode === Mode.Do) at.add(b.seat.item.id)
    let changed = false
    faces.screens.forEach((f, i) => {
      const lit = at.has(f.id)
      if (on.get(`s${i}`) === lit) return
      on.set(`s${i}`, lit)
      meshes.screen.setMatrixAt(i, lit ? f.m : ZERO)
      changed = true
    })
    if (changed) meshes.screen.instanceMatrix.needsUpdate = true
    changed = false
    faces.lamps.forEach((f, i) => {
      const lit = at.has(f.id)
      if (on.get(`l${i}`) === lit) return
      on.set(`l${i}`, lit)
      meshes.lamp.setMatrixAt(i, lit ? f.m : ZERO)
      changed = true
    })
    if (changed) meshes.lamp.instanceMatrix.needsUpdate = true
  }, 7)
  return (
    <>
      {faces.screens.length > 0 && <primitive object={meshes.screen} />}
      {faces.lamps.length > 0 && <primitive object={meshes.lamp} />}
    </>
  )
}

// ---------------------------------------------------------------- rooms

/** How brightly a room of each type is left lit when nobody is in it: receptions and shop floors keep a light on. */
const STANDBY: Record<string, number> = { lobby: 0.45, atrium: 0.3, server: 0.28, sales: 0.5, forum: 0.4, service: 0.3, foyer: 0.45, hall: 0.3, control: 0.35 }
/** A production hall with the shift gone home is left on a few safety lights: its windows go dark. */
const FACTORY_HALL = 0.12
/** Things that light the floor round them after dark, by item kind: reach in metres and strength. */
const LIT_ITEMS: Record<string, [number, number]> = { lamp: [4.2, 1], sign: [2.6, 0.6], fountain: [3.2, 0.4], logowall: [2.2, 0.5], aquarium: [2.2, 0.5], vending: [1.8, 0.4], showcase: [1.6, 0.45], coffee: [2, 0.35] }
const NIGHT: Record<Mood, number> = { day: 0, dusk: 0.5, night: 1 }
const WARM = new THREE.Color('#ffd9a0')

interface RoomInfo {
  n: number
  tiles: number[]
  x: number
  z: number
  radius: number
  standby: number
}

interface Props {
  site: Site
  /** The people on site, when they are drawn: rooms with someone in them are lit. Without it every room is. */
  crowd: Crowd | null
  mood: Mood
  /** How strong the glow on the floor is: a venue, lit from its stage, wants less of it. */
  gain?: number
  /** How many real lamps there are to hand round. */
  lamps: number
  /** Rooms that count as occupied whoever is drawn in them: a factory hall with its line running, say. */
  busy?: (type: string) => boolean
  /** Told which rooms have gone dark, so their windows can too. Called only when the set changes. */
  onDark?: (rooms: ReadonlySet<number>) => void
}

export function RoomLights({ site, crowd, mood, lamps, busy, onDark, gain = 1 }: Props) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null
  const { w, h } = site
  const plan = useMemo(() => {
    const rooms = new Map<number, RoomInfo>()
    const types = new Map(site.rooms.map((r) => [r.n, r.type]))
    for (let i = 0; i < site.grid.length; i++) {
      const n = site.grid[i]
      if (!n) continue
      let r = rooms.get(n)
      if (!r) rooms.set(n, (r = { n, tiles: [], x: 0, z: 0, radius: 1, standby: site.kind === 'factory' && types.get(n) === 'hall' ? FACTORY_HALL : (STANDBY[types.get(n) ?? ''] ?? 0) }))
      r.tiles.push(i)
    }
    for (const r of rooms.values()) {
      let sx = 0
      let sz = 0
      for (const t of r.tiles) {
        sx += (t % w) + 0.5
        sz += Math.floor(t / w) + 0.5
      }
      sx /= r.tiles.length
      sz /= r.tiles.length
      // the lamp hangs over a tile of the room: the middle of a ring or an L is not in it
      let best = Infinity
      for (const t of r.tiles) {
        const d = ((t % w) + 0.5 - sx) ** 2 + (Math.floor(t / w) + 0.5 - sz) ** 2
        if (d < best) {
          best = d
          r.x = (t % w) + 0.5 - w / 2
          r.z = Math.floor(t / w) + 0.5 - h / 2
        }
      }
      r.radius = Math.sqrt(r.tiles.length / Math.PI)
    }
    // pools of light on the ground round lamp posts and lit fittings: per tile, how strongly, and for which room (0 outdoors)
    const pools: { tile: number; k: number; room: number }[] = []
    const seen = new Map<number, number>()
    for (const item of site.items) {
      const lit = LIT_ITEMS[item.kind]
      const def = ITEMS[site.kind][item.kind]
      if (!lit || !def) continue
      const f = frameOf(site, item)
      const cx = f.cx + w / 2
      const cz = f.cz + h / 2
      const reach = lit[0]
      const room = site.grid[Math.min(h - 1, Math.max(0, Math.floor(cz))) * w + Math.min(w - 1, Math.max(0, Math.floor(cx)))] || 0
      for (let y = Math.max(0, Math.floor(cz - reach)); y <= Math.min(h - 1, Math.floor(cz + reach)); y++) {
        for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(w - 1, Math.floor(cx + reach)); x++) {
          const t = y * w + x
          // light stays on its own side of the walls
          if ((site.grid[t] || 0) !== room) continue
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cz) / reach
          if (d >= 1) continue
          const k = lit[1] * (1 - d) * (1 - d)
          const at = seen.get(t)
          if (at === undefined) {
            seen.set(t, pools.length)
            pools.push({ tile: t, k, room })
          } else pools[at].k = Math.min(1, pools[at].k + k)
        }
      }
    }
    return { rooms: [...rooms.values()], pools }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev, w, h])

  const types = useMemo(() => new Map(site.rooms.map((r) => [r.n, r.type])), [site, site.rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const count = plan.rooms.reduce((a, r) => a + r.tiles.length, 0) + plan.pools.length
  const mesh = useMemo(() => {
    const quad = new THREE.PlaneGeometry(1, 1)
    quad.rotateX(-Math.PI / 2)
    const m = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), Math.max(1, count))
    m.frustumCulled = false
    m.userData.live = true
    m.renderOrder = 1
    let k = 0
    const put = (t: number, y: number) => {
      M.makeTranslation((t % w) + 0.5 - w / 2, y, Math.floor(t / w) + 0.5 - h / 2)
      m.setMatrixAt(k, M)
      m.setColorAt(k, col.set('#000000'))
      k++
    }
    for (const r of plan.rooms) for (const t of r.tiles) put(t, 0.021)
    for (const p of plan.pools) put(p.tile, 0.024)
    m.count = k
    m.instanceMatrix.needsUpdate = true
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, count])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    },
    [mesh],
  )

  const state = useMemo(() => ({ level: new Map<number, number>(), target: new Map<number, number>(), held: new Map<number, number>(), heads: new Map<number, number>(), next: 0, hand: 0, drawn: -1, dark: '' }), [plan])
  const lights = useRef<(THREE.PointLight | null)[]>([])
  const owner = useMemo(() => new Array<number>(lamps).fill(0), [lamps])
  const night = NIGHT[mood]

  useTick((dt) => {
    const st = state
    // ---- which rooms should be lit
    st.next -= dt
    if (st.next <= 0) {
      st.next = 0.3
      if (crowd) crowd.headcount(st.heads)
      for (const r of plan.rooms) {
        const type = types.get(r.n) ?? ''
        const occupied = !crowd || (st.heads.get(r.n) ?? 0) > 0 || !!busy?.(type)
        // the lights stay on for a few seconds after the last person has left
        if (occupied) st.held.set(r.n, 4)
        else st.held.set(r.n, Math.max(0, (st.held.get(r.n) ?? 0) - 0.3))
        st.target.set(r.n, (st.held.get(r.n) ?? 0) > 0 ? 1 : r.standby)
      }
      if (onDark) {
        const dark = night > 0 ? plan.rooms.filter((r) => (st.target.get(r.n) ?? 0) < 0.2).map((r) => r.n) : []
        const key = dark.join(',')
        if (key !== st.dark) {
          st.dark = key
          onDark(new Set(dark))
        }
      }
    }
    let moved = false
    for (const r of plan.rooms) {
      const want = st.target.get(r.n) ?? 0
      const cur = st.level.get(r.n) ?? want
      // on at once, off slowly
      const next = cur + Math.max(-dt * 0.7, Math.min(dt * 3.5, want - cur))
      if (Math.abs(next - cur) > 1e-4 || !st.level.has(r.n)) moved = true
      st.level.set(r.n, next)
    }

    // ---- the glow on the floor
    mesh.visible = night > 0
    const stamp = Math.round(night * 100)
    if (night > 0 && (moved || st.drawn !== stamp)) {
      st.drawn = stamp
      let k = 0
      for (const r of plan.rooms) {
        const level = (st.level.get(r.n) ?? 0) * night * 0.26 * gain
        for (const t of r.tiles) {
          // a little brighter under the lamp than in the corners
          const d = Math.hypot((t % w) + 0.5 - w / 2 - r.x, Math.floor(t / w) + 0.5 - h / 2 - r.z) / (r.radius * 1.6 + 2)
          mesh.setColorAt(k++, col.copy(WARM).multiplyScalar(level * (1 - 0.45 * Math.min(1, d))))
        }
      }
      for (const p of plan.pools) {
        // a fitting indoors only glows on the floor of a room that is otherwise dark: a lit room has drowned it out
        const dim = p.room ? 1 - 0.7 * (st.level.get(p.room) ?? 0) : 1
        mesh.setColorAt(k++, col.copy(WARM).multiplyScalar(p.k * night * 0.26 * dim))
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }

    // ---- the real lamps go to the lit rooms nearest the middle of the view
    if (!lamps) return
    st.hand -= dt
    const focus = controls?.target ?? camera.position
    if (st.hand <= 0) {
      st.hand = 0.5
      const ranked = plan.rooms
        .map((r) => ({ r, score: (st.target.get(r.n) ?? 0) > 0.2 ? (st.target.get(r.n) ?? 0) * (4 + r.radius) - Math.hypot(r.x - focus.x, r.z - focus.z) * 0.35 : -Infinity }))
        .filter((x) => x.score > -Infinity)
        .sort((a, b) => b.score - a.score)
        .slice(0, lamps)
        .map((x) => x.r.n)
      // a lamp keeps its room while the room keeps its place; freed lamps take the rooms that have none
      for (let i = 0; i < lamps; i++) if (owner[i] && !ranked.includes(owner[i])) owner[i] = 0
      for (const n of ranked) {
        if (owner.includes(n)) continue
        const free = owner.indexOf(0)
        if (free >= 0) owner[free] = n
      }
    }
    for (let i = 0; i < lamps; i++) {
      const light = lights.current[i]
      if (!light) continue
      const r = owner[i] ? plan.rooms.find((x) => x.n === owner[i]) : undefined
      const want = r ? (st.level.get(r.n) ?? 0) * night * (3.4 + 2.3 * r.radius) : 0
      // a lamp that has been given a new room fades out where it was before it comes up where it is going
      if (r && light.userData.room !== r.n) {
        if (light.intensity > 0.05) light.intensity = Math.max(0, light.intensity - dt * 30)
        else {
          light.userData.room = r.n
          light.position.set(r.x, 3.1, r.z)
          light.distance = r.radius * 2.6 + 5
        }
        continue
      }
      light.intensity += (want - light.intensity) * Math.min(1, dt * 5)
    }
  }, 9)

  return (
    <>
      <primitive object={mesh} />
      {night > 0 &&
        Array.from({ length: lamps }, (_, i) => (
          <pointLight
            key={i}
            ref={(l) => {
              lights.current[i] = l
            }}
            color="#ffd9a8"
            intensity={0}
            decay={1.5}
            distance={10}
          />
        ))}
    </>
  )
}

// ---------------------------------------------------------------- stages

/** How strongly the stage is lit in each light, and the house lights with and without a show on. */
const STAGE_WASH: Record<Mood, number> = { day: 150, dusk: 170, night: 250 }
const HOUSE: Record<Mood, { up: number; down: number }> = { day: { up: 0, down: 0 }, dusk: { up: 26, down: 7 }, night: { up: 60, down: 11 } }

/**
 * The light on a venue. The stage has a wash of its own from the front, so whoever is on it reads clearly; the
 * seating has house lights, which go down while a show is on. Nothing here lights the grounds: after dark they are
 * left to the lamp posts. `down` says the hall's own lights are down for a show indoors by day: then the stage and
 * the seats are lit as they would be at dusk.
 */
export function StageLights({ site, mood, show, down = false }: { site: Site; mood: Mood; show: boolean; down?: boolean }) {
  const plan = useMemo(() => {
    const stage = site.items.find((i) => i.kind === 'stage')
    const seats = site.items.filter((i) => i.kind.startsWith('seats'))
    let house: [number, number] | null = null
    if (seats.length) {
      let x = 0
      let z = 0
      for (const s of seats) {
        const fs = frameOf(site, s)
        x += fs.cx
        z += fs.cz
      }
      house = [x / seats.length, z / seats.length]
    }
    if (!stage) return { stage: null, house }
    const fr = frameOf(site, stage)
    // two lamps out in front of the stage and above it, one to each side, both on its middle
    return { stage: { at: [frameX(fr, 0, 0.2), frameZ(fr, 0, 0.2)], lamps: [-1, 1].map((k) => [frameX(fr, k * 4.2, 7.5), frameZ(fr, k * 4.2, 7.5)]) }, house }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev])
  const spots = useMemo(
    () =>
      [0, 1].map(() => {
        const s = new THREE.SpotLight('#fff3e2', 0, 26, 0.5, 0.7, 1.6)
        s.castShadow = false
        return s
      }),
    [],
  )
  useEffect(() => () => spots.forEach((s) => s.dispose()), [spots])
  const as: Mood = down && mood === 'day' ? 'dusk' : mood
  // with nothing on, the stage is lit only once the daylight goes; for a show it is lit whatever the hour
  const wash = show ? STAGE_WASH[as] : as === 'day' ? 0 : STAGE_WASH[as] * 0.45
  spots.forEach((s, k) => {
    s.intensity = plan.stage ? wash : 0
    if (!plan.stage) return
    s.position.set(plan.stage.lamps[k][0], 8.5, plan.stage.lamps[k][1])
    s.target.position.set(plan.stage.at[0], 1.6, plan.stage.at[1])
    s.target.updateMatrixWorld()
  })
  const house = show ? HOUSE[as].down : HOUSE[as].up
  return (
    <>
      {spots.map((s, k) => (
        <group key={k}>
          <primitive object={s} />
          <primitive object={s.target} />
        </group>
      ))}
      {plan.house && house > 0 && <pointLight position={[plan.house[0], 7.5, plan.house[1]]} color="#ffe6c8" intensity={house} distance={34} decay={1.5} />}
    </>
  )
}

// ---------------------------------------------------------------- front desks

/** A card on a reception counter that says so when nobody is on the desk in working hours: whoever looks after it has stepped out. */
export function FrontSigns({ site, crowd }: { site: Site; crowd: Crowd }) {
  const desks = useMemo(() => site.items.filter((i) => i.kind === 'reception'), [site, site.rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const texture = useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = 256
    cv.height = 128
    const ctx = cv.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#f4f1ea'
      ctx.fillRect(0, 0, 256, 128)
      ctx.strokeStyle = '#2c3036'
      ctx.lineWidth = 6
      ctx.strokeRect(8, 8, 240, 112)
      ctx.fillStyle = '#2c3036'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '700 36px system-ui, sans-serif'
      ctx.fillText('BACK SOON', 128, 68)
    }
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  const cards = useRef<(THREE.Group | null)[]>([])
  const next = useRef(0)
  useTick((dt) => {
    next.current -= dt
    if (next.current > 0) return
    next.current = 0.25
    const hour = ((crowd.now % 24) + 24) % 24
    desks.forEach((item, i) => {
      const card = cards.current[i]
      if (!card) return
      const desk = crowd.fronts.find((s) => s.item.id === item.id)
      card.visible = !!desk && crowd.frontHours(hour) && !crowd.frontManned(desk)
    })
  }, 8)
  return (
    <>
      {desks.map((item, i) => {
        const f = frameOf(site, item)
        return (
          <group
            key={item.id}
            ref={(g) => {
              cards.current[i] = g
            }}
            visible={false}
            position={[frameX(f, -0.5, 0.02), 1.142, frameZ(f, -0.5, 0.02)]}
            rotation-y={f.a}
          >
            {/* a folded card standing on the counter, its face toward whoever walks up */}
            <mesh position={[0, 0.075, 0.03]} rotation-x={-0.28} userData={{ live: true }}>
              <boxGeometry args={[0.3, 0.16, 0.008]} />
              <meshStandardMaterial color="#f4f1ea" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.076, 0.0355]} rotation-x={-0.28} userData={{ live: true }}>
              <planeGeometry args={[0.29, 0.15]} />
              <meshBasicMaterial map={texture} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.075, -0.03]} rotation-x={0.28} userData={{ live: true }}>
              <boxGeometry args={[0.3, 0.16, 0.008]} />
              <meshStandardMaterial color="#f4f1ea" roughness={0.8} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}
