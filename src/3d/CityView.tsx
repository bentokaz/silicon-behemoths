// The city: one scene where the company's places stand as buildings among
// its rivals, with the other regions on islands round the bay. Day turns to
// night as the game runs, lorries and ships carry what is made, and every
// building can be pointed at and entered.
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraFence, SafeCanvas } from './SafeCanvas'
import { type WheelEvent as ReactWheelEvent, type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GameState } from '../sim/types'
import { QUALITY, useSettings } from '../store/settings'
import { themeColor } from '../store/theme'
import { CameraKeys } from './SiteScene'
import { type District, type Place, QUEUE, type Route, type Traffic, along } from './city/plan'
import { type CityPlate, type PlateBox, type RegionPlate, arrange } from './city/plates'
import { type CityMats, CityModel, PLOT_Y, SiteModel, cityMats } from './city/scene'
import { hash } from './site/kit'
import { Merged } from './site/merge'

export type Sky = 'auto' | 'day' | 'dusk' | 'night'

/**
 * Where the camera should fly to. A place: a spot on the ground, how tall the
 * thing there is, and how far back to stand (with `keep`, where the camera
 * was is remembered first). Or one of the standing views: the overview the
 * city opens on, the whole bay with every island in it, or wherever the
 * camera was when it was last told to remember.
 */
export type Focus = { /** Changes with every request, so the same place can be asked for twice. */ key: number } & ({ to: 'place'; x: number; z: number; h: number; dist: number; keep?: boolean } | { to: 'home' | 'world' | 'back' })

interface Props {
  g: GameState
  all: District[]
  list: Place[]
  traffic: Traffic
  sky: Sky
  /** Game speed: nothing moves while the game is paused. */
  speed: number
  /** What each of the company's places says about itself, and each district for the regions layer. */
  plates: CityPlate[]
  regionPlates: RegionPlate[]
  /** The regions layer: the districts' plates are shown and the buildings keep only their marks. */
  regions: boolean
  /** The region whose details are open, if any: its plate is the selected one. */
  selectedRegion: string | null
  hover: string | null
  onHover: (id: string | null) => void
  onPick: (place: Place) => void
  onPlate: (plate: CityPlate) => void
  onRegion: (id: string) => void
  /** What a click on a place does, in a few words: "Click to go in". */
  verb: (place: Place) => string
  focus: Focus | null
  /** Told when the camera leaves one of its standing views, and when it comes to rest on one. */
  onPose: (pose: Pose) => void
}

/** Where the camera is: on the overview the city opens with, on the view of the whole bay, or somewhere of the player's own. */
export type Pose = 'home' | 'world' | 'away'

export const HOME_CAMERA: [number, number, number] = [0, 250, 400]
/** What the camera looks at when the city opens, and when it is recentred. */
const HOME_AIM: [number, number, number] = [0, 0, -10]
/** The view for the regions layer: far enough back that every island is in it. */
const WORLD_CAMERA: [number, number, number] = [0, 640, 640]
const WORLD_AIM: [number, number, number] = [0, 0, -120]
/** How far from the middle the camera's aim may be taken: past the outermost islands, and no further. */
const CITY_SPAN = 460
const OWN: Place['kind'][] = ['office', 'factory', 'venue', 'store']
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const DAY = { sky: new THREE.Color('#a8c8e4'), sun: new THREE.Color('#fff3dd'), sea: new THREE.Color('#2a6781'), hemi: new THREE.Color('#fff4e6'), floor: new THREE.Color('#4a4338') }
const DUSK = { sky: new THREE.Color('#d98f66'), sun: new THREE.Color('#ffab72'), sea: new THREE.Color('#5b5a72'), hemi: new THREE.Color('#ffd9b8'), floor: new THREE.Color('#3a2f2a') }
const NIGHT = { sky: new THREE.Color('#0a0f1e'), sun: new THREE.Color('#9db4e0'), sea: new THREE.Color('#0b1626'), hemi: new THREE.Color('#6a7fa8'), floor: new THREE.Color('#14161c') }
const sunDir = new THREE.Vector3()
const MOON = new THREE.Vector3(-0.4, 1, 0.5)
const ORIGIN = new THREE.Vector3()
const PANE = new THREE.Color('#27353f')
const WARM = new THREE.Color('#2a2418')
const mix = (out: THREE.Color, key: keyof typeof DAY, day: number, dusk: number, night: number) => out.setRGB(DAY[key].r * day + DUSK[key].r * dusk + NIGHT[key].r * night, DAY[key].g * day + DUSK[key].g * dusk + NIGHT[key].g * night, DAY[key].b * day + DUSK[key].b * dusk + NIGHT[key].b * night)

/**
 * The sky, the sun and the lights in the windows. Left on automatic, the day
 * goes by while the game runs and stops when it is paused.
 */
function Daylight({ sky, speed, startDay, mats, shadows, sig, onLights }: { sky: Sky; speed: number; startDay: number; mats: CityMats; shadows: number; sig: string; onLights: (on: boolean) => void }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  // a new company opens its doors in the morning; a loaded one picks up wherever its calendar is
  const phase = useRef(0.14 + ((startDay % 40) / 40) * 0.3)
  const lit = useRef(false)
  const drawn = useRef({ phase: -1, x: 1e9, z: 1e9, reach: 0, left: 8 })
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl])
  useEffect(() => {
    drawn.current.left = 8
  }, [sig])
  useFrame((_, dt) => {
    const step = Math.min(0.1, dt)
    if (sky === 'auto') {
      if (speed > 0) phase.current = (phase.current + step / (speed === 1 ? 170 : speed === 2 ? 120 : 85)) % 1
    } else {
      // turn the shortest way round to the hour asked for
      let d = (sky === 'day' ? 0.2 : sky === 'dusk' ? 0.506 : 0.75) - phase.current
      d -= Math.round(d)
      phase.current = (phase.current + d * Math.min(1, step * 3.5) + 1) % 1
    }
    const p = phase.current
    const height = Math.sin(p * Math.PI * 2) * 0.9 + 0.12
    const day = smooth(0.03, 0.34, height)
    const night = 1 - smooth(-0.32, -0.04, height)
    const dusk = Math.max(0, 1 - day - night)
    const glow = Math.min(1, dusk * 0.85 + night)

    const bg = scene.background as THREE.Color
    mix(bg, 'sky', day, dusk, night)
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(bg)
    gl.toneMappingExposure = 1 + night * 0.1
    scene.environmentIntensity = 0.35 * day + 0.3 * dusk + 0.06 * night
    mix(mats.sea.color, 'sea', day, dusk, night)
    mats.lit.emissiveIntensity = glow * 1.5
    mats.lit.color.copy(PANE).lerp(WARM, glow)
    mats.lit.metalness = 0.6 * (1 - glow)
    if (glow > 0.4 !== lit.current) {
      lit.current = glow > 0.4
      onLights(lit.current)
    }
    if (hemi.current) {
      hemi.current.intensity = 0.65 * day + 0.5 * dusk + 0.3 * night
      mix(hemi.current.color, 'hemi', day, dusk, night)
      mix(hemi.current.groundColor, 'floor', day, dusk, night)
    }
    const light = sun.current
    if (!light) return
    light.intensity = 2.2 * day + 1.5 * dusk + 0.34 * night
    mix(light.color, 'sun', day, dusk, night)
    // the sun crosses from east to west; after dark the moon stands high in the south-west
    const turn = Math.PI * Math.min(1, Math.max(0, p / 0.5))
    const dir = sunDir.set(Math.cos(turn) * 0.95, Math.max(0.2, height), 0.5).lerp(MOON, night).normalize()
    // shadows are drawn round whatever the camera is looking at, and only when something has changed
    const target = controls?.target ?? ORIGIN
    const reach = Math.min(440, Math.max(150, camera.position.distanceTo(target) * 0.62))
    const grid = reach / 6
    const x = Math.round(target.x / grid) * grid
    const z = Math.round(target.z / grid) * grid
    light.target.position.set(x, 0, z)
    light.position.set(x + dir.x * 900, dir.y * 900, z + dir.z * 900)
    light.target.updateMatrixWorld()
    if (!shadows) return
    const d = drawn.current
    const moved = x !== d.x || z !== d.z || Math.abs(reach - d.reach) > d.reach * 0.12
    if (moved) {
      const cam = light.shadow.camera
      cam.left = cam.bottom = -reach
      cam.right = cam.top = reach
      cam.updateProjectionMatrix()
      d.x = x
      d.z = z
      d.reach = reach
    }
    if (moved || Math.abs(p - d.phase) > 0.003 || d.left > 0) {
      if (d.left > 0) d.left--
      d.phase = p
      gl.shadowMap.needsUpdate = true
    }
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#fff4e6', '#4a4338', 0.65]} />
      <directionalLight ref={sun} color="#fff3dd" intensity={2.2} position={[400, 800, 400]} castShadow={shadows > 0} shadow-mapSize={[shadows || 512, shadows || 512]} shadow-bias={-0.0006} shadow-normalBias={0.35} shadow-camera-near={100} shadow-camera-far={2200} />
    </>
  )
}

const PEOPLE = ['#2c4a6e', '#7a1f24', '#3e5a48', '#c9c2b2', '#1d2023', '#c9a227', '#6b4f7a', '#d8dadd']
const CARGO = ['#b5462f', '#2f5d8a', '#3f7d4d', '#c9a227', '#8a8f95']
const MAX_TRUCKS = 24
const MAX_SHIPS = 12
/** Enough for a full queue outside sixty or seventy stores; with more stores than that the queues are all drawn shorter. */
const MAX_PEOPLE = 1300
const MAX_PINS = 256

/** Lorries on the streets, ships in the bay and the queues outside the shops. Each kind is one instanced mesh or two. */
function Movers({ traffic, speed, color, pins, needy }: { traffic: Traffic; speed: number; color: string; pins: Place[]; /** The places whose plate says something needs the player: their markers are gold. */ needy: Set<string> }) {
  const key = JSON.stringify(traffic)
  const parts = useMemo(() => {
    const solid = (c: string, rough = 0.6, metal = 0.1) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal })
    const box = (w: number, h: number, d: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(0, y, z)
    const make = (geo: THREE.BufferGeometry, material: THREE.Material, n: number, cast = true) => {
      const m = new THREE.InstancedMesh(geo, material, n)
      m.frustumCulled = false
      m.castShadow = false
      m.receiveShadow = cast
      m.count = 0
      m.userData.live = true
      return m
    }
    // the two shapes only merge once neither is indexed
    const person = mergeGeometries([new THREE.CylinderGeometry(0.2, 0.26, 1.25, 7).toNonIndexed().translate(0, 0.72, 0), new THREE.IcosahedronGeometry(0.19, 0).translate(0, 1.55, 0)])!
    const out = {
      trailer: make(box(2.5, 2.9, 7.6, 2.25, -1.3), solid('#e9e6e0'), MAX_TRUCKS),
      cab: make(box(2.4, 2.5, 2.2, 1.85, 3.75), solid(color, 0.4, 0.3), MAX_TRUCKS),
      chassis: make(box(2.3, 0.7, 10.2, 0.5, -0.1), solid('#17191c', 0.9), MAX_TRUCKS),
      hull: make(mergeGeometries([box(10, 4.4, 40, 0.6, 0), box(8, 8, 5, 7.6, -15.5)])!, solid('#27313d', 0.7), MAX_SHIPS),
      cargo: make(box(6.4, 5.2, 27, 5.4, 3), solid('#ffffff', 0.8), MAX_SHIPS),
      people: make(person, solid('#ffffff', 0.9), MAX_PEOPLE, false),
      pins: make(new THREE.OctahedronGeometry(1.5, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), MAX_PINS, false),
    }
    out.cargo.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHIPS * 3), 3)
    out.people.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PEOPLE * 3), 3)
    out.pins.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PINS * 3), 3)
    return out
  }, [color])
  useEffect(
    () => () => {
      for (const m of Object.values(parts)) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
    },
    [parts],
  )
  // who stands where in the queues does not change from frame to frame
  const crowd = useMemo(() => {
    const out: { x: number; z: number; k: number; c: THREE.Color; seed: number }[] = []
    // with more stores than there are people to draw, every queue is shortened alike, so that none goes without
    const wanted = traffic.queues.reduce((a, queue) => a + queue.people, 0)
    const share = Math.min(1, MAX_PEOPLE / Math.max(1, wanted))
    traffic.queues.forEach((queue, q) => {
      // the people are drawn at their store's scale, and stand that much closer together
      const k = queue.scale
      const count = share < 1 ? Math.max(2, Math.floor((queue.people * share) / 2) * 2) : queue.people
      for (let i = 0; i < count && out.length < MAX_PEOPLE; i++) {
        const row = i % 2
        out.push({ x: queue.x + (QUEUE.head - Math.floor(i / 2) * QUEUE.pitch + (hash(q * 31 + i) - 0.5) * 0.3) * k, z: queue.z + (row * 0.8 + (hash(q * 17 + i * 3) - 0.5) * 0.25) * k, k, c: new THREE.Color(PEOPLE[Math.floor(hash(q * 7 + i * 5) * PEOPLE.length)]), seed: q * 40 + i })
      }
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const time = useRef(0)
  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), up: new THREE.Vector3(0, 1, 0), c: new THREE.Color() }), [])
  useFrame((state, dt) => {
    if (speed > 0) time.current += Math.min(0.1, dt) * (0.7 + speed * 0.12)
    const t = time.current
    const { m, q, p, s, up, c } = scratch
    const place = (meshes: THREE.InstancedMesh[], i: number, x: number, y: number, z: number, heading: number, k = 1) => {
      q.setFromAxisAngle(up, heading)
      m.compose(p.set(x, y, z), q, s.set(k, k, k))
      for (const mesh of meshes) mesh.setMatrixAt(i, m)
    }
    /** Vehicles going out along a route and back again, keeping to the right. */
    const run = (routes: Route[], meshes: THREE.InstancedMesh[], max: number, pace: number, lane: number, y: number, each?: (i: number) => void) => {
      let n = 0
      routes.forEach((r, ri) => {
        for (let k = 0; k < r.count && n < max; k++) {
          const lap = r.length * 2
          const at = (t * pace + (k * lap) / r.count + ri * 37) % lap
          const back = at > r.length
          const [x, z, h] = along(r, back ? lap - at : at)
          const heading = back ? h + Math.PI : h
          place(meshes, n, x - Math.cos(heading) * lane, y, z + Math.sin(heading) * lane, heading)
          each?.(n)
          n++
        }
      })
      for (const mesh of meshes) {
        mesh.count = n
        mesh.instanceMatrix.needsUpdate = true
      }
    }
    run(traffic.trucks, [parts.trailer, parts.cab, parts.chassis], MAX_TRUCKS, 11, 2.3, 0.12)
    run(traffic.ships, [parts.hull, parts.cargo], MAX_SHIPS, 8, 0, -1.4, (i) => parts.cargo.setColorAt(i, c.set(CARGO[i % CARGO.length])))
    if (parts.cargo.instanceColor) parts.cargo.instanceColor.needsUpdate = true
    crowd.forEach((person, i) => {
      place([parts.people], i, person.x, PLOT_Y + Math.abs(Math.sin(t * 3 + person.seed)) * 0.07 * person.k, person.z, hash(person.seed) * 0.8 - 0.4, person.k)
      parts.people.setColorAt(i, person.c)
    })
    parts.people.count = crowd.length
    parts.people.instanceMatrix.needsUpdate = true
    if (parts.people.instanceColor) parts.people.instanceColor.needsUpdate = true
    // a marker turning over each of the company's own places: gold where something needs attention
    const spin = state.clock.elapsedTime
    pins.slice(0, MAX_PINS).forEach((pin, i) => {
      q.setFromAxisAngle(up, spin * 0.9 + i)
      // a store drawn small, in a district whose blocks are full, carries a marker to match
      const k = pin.kind === 'store' ? 0.9 * Math.max(0.45, pin.scale ?? 1) : 1.6
      // and carries it just over its own roof, so that among close neighbours, and with a row behind, it is plain whose it is
      const top = pin.kind === 'store' && pin.site ? (pin.site.floors * 3 + 0.5) * (pin.scale ?? 1) : pin.h
      m.compose(p.set(pin.x, top + (pin.kind === 'store' ? (pin.crowded ? 1.4 : 3) : 5) + k + Math.sin(spin * 1.6 + i) * (pin.crowded ? 0.3 : 0.5), pin.z), q, s.set(k, k * 1.3, k))
      parts.pins.setMatrixAt(i, m)
      parts.pins.setColorAt(i, c.set(needy.has(pin.id) ? '#f2b631' : color))
    })
    parts.pins.count = Math.min(MAX_PINS, pins.length)
    parts.pins.instanceMatrix.needsUpdate = true
    if (parts.pins.instanceColor) parts.pins.instanceColor.needsUpdate = true
  })
  return (
    <>
      {Object.values(parts).map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  )
}

/** The camera: the mouse and the keys move it, and it flies to whatever is picked. */
function Rig({ focus, onPose }: { focus: Focus | null; onPose: (pose: Pose) => void }) {
  const prefs = useSettings((s) => s.settings)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const flight = useRef<{ p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; t: number } | null>(null)
  /** Where the camera was before it flew to something it is expected to come back from. */
  const kept = useRef<{ p: THREE.Vector3; t: THREE.Vector3 } | null>(null)
  const pose = useRef<Pose>('home')
  const told = useRef(onPose)
  told.current = onPose
  useEffect(() => {
    if (!focus || !controls) return
    const from = { p0: camera.position.clone(), t0: controls.target.clone(), t: 0 }
    if (focus.to !== 'place') {
      // back to where the camera was, if it was told to remember; otherwise to one of the standing views
      const back = focus.to === 'back' ? kept.current : null
      const world = focus.to === 'world'
      flight.current = { ...from, p1: back?.p ?? new THREE.Vector3(...(world ? WORLD_CAMERA : HOME_CAMERA)), t1: back?.t ?? new THREE.Vector3(...(world ? WORLD_AIM : HOME_AIM)) }
      kept.current = null
      return
    }
    // a second place looked at before coming back does not replace where the camera started from
    if (focus.keep && !kept.current) kept.current = { p: from.p0.clone(), t: from.t0.clone() }
    const target = new THREE.Vector3(focus.x, focus.h * 0.35, focus.z)
    // keep the bearing, and come down to a three-quarter view of the place
    const flat = new THREE.Vector3(camera.position.x - controls.target.x, 0, camera.position.z - controls.target.z)
    if (flat.lengthSq() < 1) flat.set(0, 0, 1)
    flat.normalize()
    const to = target.clone().addScaledVector(flat, focus.dist * 0.82)
    to.y += focus.dist * 0.56
    flight.current = { ...from, p1: to, t1: target }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key, controls])
  useFrame((_, dt) => {
    const f = flight.current
    if (controls) {
      // which view the camera is on is said only when it changes: nothing is set from here frame by frame
      const on = (at: [number, number, number], aim: [number, number, number]) => Math.abs(camera.position.x - at[0]) + Math.abs(camera.position.y - at[1]) + Math.abs(camera.position.z - at[2]) < 3 && Math.abs(controls.target.x - aim[0]) + Math.abs(controls.target.z - aim[2]) < 3
      const now: Pose = f ? 'away' : on(HOME_CAMERA, HOME_AIM) ? 'home' : on(WORLD_CAMERA, WORLD_AIM) ? 'world' : 'away'
      if (now !== pose.current) {
        pose.current = now
        told.current(now)
      }
    }
    if (!f || !controls) return
    f.t = Math.min(1, f.t + Math.min(0.1, dt) / 0.62)
    const k = f.t * f.t * (3 - 2 * f.t)
    camera.position.lerpVectors(f.p0, f.p1, k)
    controls.target.lerpVectors(f.t0, f.t1, k)
    controls.update()
    if (f.t >= 1) flight.current = null
  })
  return (
    <>
      <CameraKeys span={CITY_SPAN} home={HOME_CAMERA} aim={HOME_AIM} />
      <CameraFence span={CITY_SPAN} top={120} />
      <OrbitControls makeDefault target={HOME_AIM} minDistance={28} maxDistance={1300} maxPolarAngle={Math.PI * 0.47} enablePan screenSpacePanning={false} panSpeed={1.2 * prefs.cameraSpeed} rotateSpeed={0.8 * prefs.cameraSpeed} zoomSpeed={1.2 * prefs.cameraSpeed} zoomToCursor={prefs.zoomToPointer} enableDamping dampingFactor={0.2} />
    </>
  )
}

/** Development only: lets the camera be driven and frames be stepped from the console. */
function DevHandle() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const advance = useThree((s) => s.advance)
  useEffect(() => {
    Object.assign(window, { sbCity: { camera, controls, gl, scene, advance } })
  }, [camera, controls, gl, scene, advance])
  return null
}

/** How far above the ground a place's plate floats. */
const tagHeight = (p: Place) => p.h + (6 + (OWN.includes(p.kind) && p.site ? 5 : 0)) * Math.max(0.45, p.scale ?? 1)
/** Where the home district's own plate floats, for the regions layer: over the middle of town. */
const HOME_PLATE: [number, number, number] = [0, 36, 0]
/** Which plate keeps its room when two want the same: the campus first, the stores last. */
const RANK: Record<Place['kind'], number> = { office: 0, port: 1, factory: 2, research: 3, venue: 4, exchange: 5, store: 6, region: 7, rival: 8, board: 9 }

/** One thing laid over the view: a place's plate, a district's plate, or the few words a place without a plate says under the pointer. */
type Item = { id: string; at: [number, number, number]; rank: number } & ({ kind: 'plate'; place: Place; plate: CityPlate } | { kind: 'region'; region: RegionPlate } | { kind: 'info'; place: Place })

/**
 * Keeps the plates over their buildings. They are ordinary elements laid over
 * the view; whenever the camera has moved this works out where on screen each
 * belongs and, between them, which are shown in full, which as a mark and
 * which not at all (see `arrange`). Nothing is set through React from here.
 */
function PlateProjector({ items, els, hover, regions }: { items: Item[]; els: RefObject<Map<string, HTMLDivElement>>; hover: string | null; regions: boolean }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  /** The view the plates were last placed for: while nothing has changed, they are where they belong. */
  const placed = useRef({ items: null as Item[] | null, hover: null as string | null, regions: false, view: new THREE.Matrix4(), lens: new THREE.Matrix4(), w: 0, h: 0, shown: 0, stale: false })
  /** How big each plate is in full, as last measured. */
  const sizes = useRef(new Map<string, { w: number; h: number }>())
  useFrame(({ camera, size }) => {
    const was = placed.current
    const shown = els.current.size
    if (!was.stale && was.items === items && was.hover === hover && was.regions === regions && was.w === size.width && was.h === size.height && was.shown === shown && was.view.equals(camera.matrixWorldInverse) && was.lens.equals(camera.projectionMatrix)) return
    was.items = items
    was.hover = hover
    was.regions = regions
    was.w = size.width
    was.h = size.height
    was.shown = shown
    was.stale = false
    was.view.copy(camera.matrixWorldInverse)
    was.lens.copy(camera.projectionMatrix)
    const boxes: PlateBox[] = []
    for (const item of items) {
      const el = els.current.get(item.id)
      if (!el) continue
      const pinned = item.id === hover
      v.set(...item.at).project(camera)
      const seen = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1
      // a place without a plate says its few words only under the pointer
      if (!seen || (item.kind === 'info' && !pinned)) {
        el.style.visibility = 'hidden'
        continue
      }
      const x = (v.x * 0.5 + 0.5) * size.width
      const y = (-v.y * 0.5 + 0.5) * size.height
      const known = sizes.current.get(item.id) ?? { w: 160, h: 54 }
      boxes.push({ id: item.id, x, y, w: known.w, h: known.h, needs: item.kind === 'plate' ? item.plate.needs : 0, rank: item.rank, dist: v.set(...item.at).distanceTo(camera.position), region: item.kind === 'region', pinned })
    }
    const at = arrange(boxes, { w: size.width, h: size.height }, regions)
    for (const box of boxes) {
      const el = els.current.get(box.id)!
      const to = at.get(box.id)!
      el.dataset.form = to.form
      el.style.visibility = to.form === 'none' ? 'hidden' : 'visible'
      el.style.zIndex = box.pinned ? '3' : to.form === 'mark' ? '2' : '1'
      if (to.form !== 'none') el.style.transform = `translate(${Math.round(to.left)}px, ${Math.round(to.top)}px)`
    }
    // a plate drawn in full is measured, and if it is not the size it was taken for, they are all placed again next frame
    for (const box of boxes) {
      if (at.get(box.id)!.form !== 'full') continue
      const el = els.current.get(box.id)!
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (!w || !h || (Math.abs(w - box.w) < 1 && Math.abs(h - box.h) < 1)) continue
      sizes.current.set(box.id, { w, h })
      was.stale = true
    }
  })
  return null
}

const LINE_TONE = { neg: 'text-neg', warn: 'text-warn', pos: 'text-pos', dim: 'text-dim' }

/** Scrolling over a plate zooms the view under it, as it does anywhere else. */
const wheelThrough = (e: ReactWheelEvent<HTMLElement>) => {
  const canvas = e.currentTarget.closest('[data-city]')?.querySelector('canvas')
  canvas?.dispatchEvent(new WheelEvent('wheel', { deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey, bubbles: true, cancelable: true }))
}

/**
 * A place's plate: its name and one or two lines about how it stands, with a
 * border in the warning colour when something there needs the player. From
 * far off it is a small square with the count of those things. A button: it
 * goes to where the place is run.
 */
function PlateTag({ plate, verb, onPick, onHover }: { plate: CityPlate; /** What a click on the building does, shown while it is pointed at. */ verb?: string; onPick: () => void; onHover: (on: boolean) => void }) {
  const edge = plate.tone === 'neg' ? 'border-neg' : plate.tone === 'warn' ? 'border-warn' : 'border-line2 hover:border-fg'
  return (
    <button
      type="button"
      title={plate.notes.join(' ') || undefined}
      aria-label={`${plate.title}: ${plate.lines.map((l) => l.text).join(', ')}${plate.needs ? `. ${plate.needs} need you` : ''}`}
      onClick={onPick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onWheel={wheelThrough}
      className={`pointer-events-auto block max-w-[236px] cursor-pointer rounded-none border bg-panel text-left hover:bg-hover group-data-[form=mark]:h-[22px] group-data-[form=mark]:w-[22px] ${edge}`}
    >
      <span className="block px-2 py-[5px] group-data-[form=mark]:hidden">
        <span className="block truncate text-[11px] font-semibold text-dim">{plate.title}</span>
        {plate.lines.map((line, i) => (
          <span key={i} className={`block truncate text-xs ${line.tone ? LINE_TONE[line.tone] : 'text-fg'}`}>
            {line.text}
          </span>
        ))}
        {verb && <span className="block truncate text-[11px] text-faint">{verb}</span>}
      </span>
      <span className={`num hidden h-full w-full items-center justify-center text-[11px] font-semibold group-data-[form=mark]:flex ${plate.tone === 'neg' ? 'text-neg' : 'text-warn'}`}>{plate.needs}</span>
    </button>
  )
}

/** A district's plate, for the regions layer: its name and how the company stands there. It opens the region. */
function RegionTag({ region, selected, onPick, onHover }: { region: RegionPlate; selected: boolean; onPick: () => void; onHover: (on: boolean) => void }) {
  return (
    <button type="button" onClick={onPick} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)} onWheel={wheelThrough} title={`Open ${region.title}`} className={`pointer-events-auto block max-w-[236px] cursor-pointer rounded-none border bg-panel px-2 py-[5px] text-left hover:bg-hover ${selected ? 'border-accent' : 'border-line2 hover:border-fg'}`}>
      <span className="block truncate text-[11px] font-semibold text-dim">{region.title}</span>
      <span className={`block truncate text-xs ${region.state === 'closed' ? 'text-dim' : 'text-fg'}`}>{region.line}</span>
    </button>
  )
}

/** What a place without a plate says while it is pointed at: its name, a line or two, and what a click does. */
function InfoTag({ place, verb }: { place: Place; verb: string }) {
  return (
    <div className="max-w-[260px] border border-line2 bg-panel px-2 py-[5px]">
      <div className="flex items-center gap-[6px] text-[11px] font-semibold text-fg">
        {place.company && <span aria-hidden className="h-2 w-2 shrink-0 border border-line2" style={{ background: place.company.color }} />}
        <span className="truncate">{place.name}</span>
      </div>
      {place.lines.map((line) => (
        <div key={line} className="text-xs leading-snug text-dim">
          {line}
        </div>
      ))}
      <div className="truncate text-[11px] text-faint">{verb}</div>
    </div>
  )
}

export function CityView({ g, all, list, traffic, sky, speed, plates, regionPlates, regions, selectedRegion, hover, onHover, onPick, onPlate, onRegion, verb, focus, onPose }: Props) {
  const prefs = useSettings((s) => s.settings)
  const Q = QUALITY[prefs.quality]
  const mats = useMemo(() => cityMats(), [])
  useEffect(() => () => mats.dispose(), [mats])
  // whether the windows are lit; the buildings are redrawn only when this flips, at dusk and at dawn
  const [lights, setLights] = useState(false)
  const accent = themeColor('accent', '#ff6b1a')
  const tags = useRef(new Map<string, HTMLDivElement>())
  const me = g.companies[0]
  const hovered = list.find((p) => p.id === hover)
  const sites = list.filter((p) => p.site)
  const siteGroups = useMemo(() => {
    const by = new Map<string, Place[]>()
    for (const p of list) {
      if (!p.site) continue
      const group = by.get(p.region)
      if (group) group.push(p)
      else by.set(p.region, [p])
    }
    return [...by]
  }, [list])
  const pins = useMemo(() => list.filter((p) => OWN.includes(p.kind) && p.site), [list])
  const needy = useMemo(() => new Set(plates.filter((p) => p.needs > 0).map((p) => p.placeId)), [plates])
  // one element to a place: its plate if the company has one there, the district's plate for an island, and otherwise
  // the few words it says under the pointer
  const items = useMemo(() => {
    const out: Item[] = []
    for (const p of list) {
      const at: [number, number, number] = [p.x, tagHeight(p), p.z]
      const plate = plates.find((x) => x.placeId === p.id)
      const region = p.kind === 'region' ? regionPlates.find((r) => `region:${r.id}` === p.id) : undefined
      if (plate) out.push({ id: p.id, at, rank: RANK[p.kind], kind: 'plate', place: p, plate })
      else if (region) out.push({ id: p.id, at: [p.x, 14, p.z], rank: RANK.region, kind: 'region', region })
      else out.push({ id: p.id, at, rank: RANK[p.kind], kind: 'info', place: p })
    }
    // the home district has no ground of its own to click: its plate stands over the middle of town
    for (const r of regionPlates) if (r.state === 'home') out.push({ id: `region:${r.id}`, at: [r.x + HOME_PLATE[0], HOME_PLATE[1], r.z + HOME_PLATE[2]], rank: RANK.region, kind: 'region', region: r })
    return out
  }, [list, plates, regionPlates])
  const sig = `${sites.map((p) => `${p.id}${p.site!.rev}${p.x}${p.z}`).join('|')}|${list.length}|${all.map((d) => (d.open ? 1 : 0)).join('')}`
  return (
    <div data-city className="relative h-full w-full">
    <SafeCanvas what="city view" adaptive shadows={Q.shadows > 0 ? 'percentage' : false} dpr={[0.5, Q.dpr]} camera={{ fov: 32, near: 5, far: 5200, position: HOME_CAMERA }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, powerPreference: 'high-performance' }} style={{ cursor: hovered ? 'pointer' : 'grab' }}>
      <color attach="background" args={['#a8c8e4']} />
      <fog attach="fog" args={['#a8c8e4', 1000, 3600]} />
      <Environment resolution={128} frames={1} environmentIntensity={0.35}>
        <color attach="background" args={['#a8c8e4']} />
        <Lightformer form="rect" intensity={3} color="#fff1e0" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#cfe0ff" position={[-8, 2, 0]} scale={[4, 6, 1]} target={[0, 0, 0]} />
      </Environment>
      <CityModel g={g} all={all} list={list} mats={mats} lights={lights} color={me.color} accent={accent} />
      {/* the company's own buildings, joined district by district: two hundred shops are a dozen meshes, not sixteen hundred */}
      {siteGroups.map(([region, group]) => (
        <Merged key={region} sig={`${group.map((p) => `${p.id}:${p.site!.rev}:${p.x}:${p.z}:${p.scale ?? 1}`).join('|')}|${lights}`}>
          {group.map((p) => (
            <SiteModel key={p.id} site={p.site!} rev={p.site!.rev} x={p.x} z={p.z} lights={lights} scale={p.scale} />
          ))}
        </Merged>
      ))}
      <Daylight sky={sky} speed={speed} startDay={g.day} mats={mats} shadows={Q.shadows} sig={`${sig}${lights}`} onLights={setLights} />
      <Movers traffic={traffic} speed={speed} color={me.color} pins={pins} needy={needy} />

      {/* what the pointer can hit: one unseen box per place */}
      {list.map((p) => (
        <mesh
          key={p.id}
          // found by the pointer, never drawn
          visible={false}
          position={[p.x, p.h / 2, p.z]}
          onPointerOver={(e) => {
            e.stopPropagation()
            onHover(p.id)
          }}
          onPointerOut={() => onHover(null)}
          onClick={(e) => {
            if (e.delta > 6) return
            e.stopPropagation()
            onPick(p)
          }}
        >
          <boxGeometry args={[p.w, p.h, p.d]} />
          <meshBasicMaterial />
        </mesh>
      ))}
      {hovered && (
        <group position={[hovered.x, 0.4, hovered.z]}>
          {[[0, -hovered.d / 2, hovered.w + 1.2, 0.6], [0, hovered.d / 2, hovered.w + 1.2, 0.6], [-hovered.w / 2, 0, 0.6, hovered.d], [hovered.w / 2, 0, 0.6, hovered.d]].map(([x, z, w, d], i) => (
            <mesh key={i} position={[x, 0, z]} renderOrder={5}>
              <boxGeometry args={[w, 0.5, d]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}
      <PlateProjector items={items} els={tags} hover={hover} regions={regions} />
      <Rig focus={focus} onPose={onPose} />
      {import.meta.env.DEV && <DevHandle />}
    </SafeCanvas>
      {/* the plates, laid over the view: one element to a place, put where it belongs by the projector */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {items.map((item) => (
          <div
            key={item.id}
            ref={(el) => {
              if (el) tags.current.set(item.id, el)
              else tags.current.delete(item.id)
            }}
            data-form="none"
            data-plate={item.kind}
            className="group absolute left-0 top-0"
            style={{ visibility: 'hidden' }}
          >
            {item.kind === 'plate' ? (
              <PlateTag plate={item.plate} verb={item.id === hover ? verb(item.place) : undefined} onPick={() => onPlate(item.plate)} onHover={(on) => onHover(on ? item.id : null)} />
            ) : item.kind === 'region' ? (
              <RegionTag region={item.region} selected={selectedRegion === item.region.id} onPick={() => onRegion(item.region.id)} onHover={(on) => onHover(on ? item.id : null)} />
            ) : (
              <InfoTag place={item.place} verb={verb(item.place)} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
