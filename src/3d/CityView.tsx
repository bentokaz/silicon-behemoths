// The city: one scene where the company's places stand as buildings among
// its rivals, with the other regions on islands round the bay. Day turns to
// night as the game runs, lorries and ships carry what is made, and every
// building can be pointed at and entered.
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GameState } from '../sim/types'
import { QUALITY, useSettings } from '../store/settings'
import { themeColor } from '../store/theme'
import { CameraKeys } from './SiteView'
import { type District, type Place, type Route, type Traffic, along } from './city/plan'
import { type CityMats, CityModel, PLOT_Y, SiteModel, cityMats } from './city/scene'
import { hash } from './site/kit'

export type Sky = 'auto' | 'day' | 'dusk' | 'night'

/** Where the camera should fly to: a spot on the ground, how tall the thing there is, and how far back to stand. */
export interface Focus {
  x: number
  z: number
  h: number
  dist: number
  /** Changes with every request, so the same place can be asked for twice. */
  key: number
}

interface Props {
  g: GameState
  all: District[]
  list: Place[]
  traffic: Traffic
  sky: Sky
  /** Game speed: nothing moves while the game is paused. */
  speed: number
  names: boolean
  hover: string | null
  onHover: (id: string | null) => void
  onPick: (place: Place) => void
  focus: Focus | null
}

export const HOME_CAMERA: [number, number, number] = [0, 250, 400]
const OWN: Place['kind'][] = ['office', 'factory', 'venue', 'store']
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const DAY = { sky: new THREE.Color('#a8c8e4'), sun: new THREE.Color('#fff3dd'), sea: new THREE.Color('#2a6781'), hemi: new THREE.Color('#fff4e6'), floor: new THREE.Color('#4a4338') }
const DUSK = { sky: new THREE.Color('#d98f66'), sun: new THREE.Color('#ffab72'), sea: new THREE.Color('#5b5a72'), hemi: new THREE.Color('#ffd9b8'), floor: new THREE.Color('#3a2f2a') }
const NIGHT = { sky: new THREE.Color('#0a0f1e'), sun: new THREE.Color('#9db4e0'), sea: new THREE.Color('#0b1626'), hemi: new THREE.Color('#6a7fa8'), floor: new THREE.Color('#14161c') }
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
    const dir = new THREE.Vector3(Math.cos(turn) * 0.95, Math.max(0.2, height), 0.5).lerp(new THREE.Vector3(-0.4, 1, 0.5), night).normalize()
    // shadows are drawn round whatever the camera is looking at, and only when something has changed
    const target = controls?.target ?? new THREE.Vector3()
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
const MAX_PEOPLE = 260
const MAX_PINS = 256

/** Lorries on the streets, ships in the bay and the queues outside the shops. Each kind is one instanced mesh or two. */
function Movers({ traffic, speed, color, pins }: { traffic: Traffic; speed: number; color: string; pins: Place[] }) {
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
    const out: { x: number; z: number; c: THREE.Color; seed: number }[] = []
    traffic.queues.forEach(([qx, qz], q) => {
      for (let i = 0; i < 26 && out.length < MAX_PEOPLE; i++) {
        const row = i % 2
        out.push({ x: qx + 3 - Math.floor(i / 2) * 0.95 + (hash(q * 31 + i) - 0.5) * 0.3, z: qz + row * 0.8 + (hash(q * 17 + i * 3) - 0.5) * 0.25, c: new THREE.Color(PEOPLE[Math.floor(hash(q * 7 + i * 5) * PEOPLE.length)]), seed: q * 40 + i })
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
    const place = (meshes: THREE.InstancedMesh[], i: number, x: number, y: number, z: number, heading: number) => {
      q.setFromAxisAngle(up, heading)
      m.compose(p.set(x, y, z), q, s.set(1, 1, 1))
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
      place([parts.people], i, person.x, PLOT_Y + Math.abs(Math.sin(t * 3 + person.seed)) * 0.07, person.z, hash(person.seed) * 0.8 - 0.4)
      parts.people.setColorAt(i, person.c)
    })
    parts.people.count = crowd.length
    parts.people.instanceMatrix.needsUpdate = true
    if (parts.people.instanceColor) parts.people.instanceColor.needsUpdate = true
    // a marker turning over each of the company's own places: gold where something needs attention
    const spin = state.clock.elapsedTime
    pins.slice(0, MAX_PINS).forEach((pin, i) => {
      q.setFromAxisAngle(up, spin * 0.9 + i)
      // a store drawn small on a shared plot carries a marker to match
      const k = pin.kind === 'store' ? 0.9 * Math.max(0.45, pin.scale ?? 1) : 1.6
      m.compose(p.set(pin.x, pin.h + 5 + k + Math.sin(spin * 1.6 + i) * 0.5, pin.z), q, s.set(k, k * 1.3, k))
      parts.pins.setMatrixAt(i, m)
      parts.pins.setColorAt(i, c.set(pin.warn ? '#f2b631' : color))
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
function Rig({ focus }: { focus: Focus | null }) {
  const prefs = useSettings((s) => s.settings)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const flight = useRef<{ p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; t: number } | null>(null)
  useEffect(() => {
    if (!focus || !controls) return
    const target = new THREE.Vector3(focus.x, focus.h * 0.35, focus.z)
    // keep the bearing, and come down to a three-quarter view of the place
    const flat = new THREE.Vector3(camera.position.x - controls.target.x, 0, camera.position.z - controls.target.z)
    if (flat.lengthSq() < 1) flat.set(0, 0, 1)
    flat.normalize()
    const to = target.clone().addScaledVector(flat, focus.dist * 0.82)
    to.y += focus.dist * 0.56
    flight.current = { p0: camera.position.clone(), t0: controls.target.clone(), p1: to, t1: target, t: 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key, controls])
  useFrame((_, dt) => {
    const f = flight.current
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
      <CameraKeys span={460} home={HOME_CAMERA} />
      <OrbitControls makeDefault target={[0, 0, -10]} minDistance={28} maxDistance={1300} maxPolarAngle={Math.PI * 0.47} enablePan screenSpacePanning={false} panSpeed={1.2 * prefs.cameraSpeed} rotateSpeed={0.8 * prefs.cameraSpeed} zoomSpeed={1.2 * prefs.cameraSpeed} zoomToCursor={prefs.zoomToPointer} enableDamping dampingFactor={0.2} />
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

/** How far above the ground a place's name tag floats. */
const tagHeight = (p: Place) => p.h + (6 + (OWN.includes(p.kind) && p.site ? 5 : 0)) * Math.max(0.45, p.scale ?? 1)

/**
 * Keeps the name tags over their buildings. The tags are ordinary elements
 * laid over the view; each frame this works out where on screen each belongs.
 */
function TagProjector({ list, tags }: { list: Place[]; tags: RefObject<Map<string, HTMLDivElement>> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    for (const p of list) {
      const el = tags.current.get(p.id)
      if (!el) continue
      v.set(p.x, tagHeight(p), p.z).project(camera)
      const seen = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2
      el.style.visibility = seen ? 'visible' : 'hidden'
      if (seen) el.style.transform = `translate(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px) translate(-50%, -100%)`
    }
  })
  return null
}

function Tag({ place, full }: { place: Place; full: boolean }) {
  const own = OWN.includes(place.kind)
  if (!full) return <div className={`whitespace-nowrap border bg-carbon/75 px-[5px] py-[1px] text-[9px] uppercase tracking-[0.14em] ${place.warn ? 'border-warn text-warn' : own ? 'border-accent/60 text-fg' : 'border-line text-dim'}`}>{place.name}</div>
  return (
    <div className="whitespace-nowrap border border-line2 bg-panel/95 px-2 py-[5px]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg">{place.name}</div>
      {place.lines.map((line) => (
        <div key={line} className="num text-[11px] text-dim">
          {line}
        </div>
      ))}
      {place.warn && <div className="text-[10px] text-warn">{place.warn}</div>}
    </div>
  )
}

export function CityView({ g, all, list, traffic, sky, speed, names, hover, onHover, onPick, focus }: Props) {
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
  const pins = useMemo(() => list.filter((p) => OWN.includes(p.kind) && p.site), [list])
  const sig = `${sites.map((p) => `${p.id}${p.site!.rev}${p.x}${p.z}`).join('|')}|${list.length}|${all.map((d) => (d.open ? 1 : 0)).join('')}`
  return (
    <div className="relative h-full w-full">
    <Canvas shadows={Q.shadows > 0} dpr={[1, Q.dpr]} camera={{ fov: 32, near: 5, far: 5200, position: HOME_CAMERA }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, powerPreference: 'high-performance' }} style={{ cursor: hovered ? 'pointer' : 'grab' }}>
      <color attach="background" args={['#a8c8e4']} />
      <fog attach="fog" args={['#a8c8e4', 1000, 3600]} />
      <Environment resolution={128} frames={1} environmentIntensity={0.35}>
        <color attach="background" args={['#a8c8e4']} />
        <Lightformer form="rect" intensity={3} color="#fff1e0" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#cfe0ff" position={[-8, 2, 0]} scale={[4, 6, 1]} target={[0, 0, 0]} />
      </Environment>
      <CityModel g={g} all={all} list={list} mats={mats} lights={lights} color={me.color} accent={accent} />
      {sites.map((p) => (
        <SiteModel key={p.id} site={p.site!} x={p.x} z={p.z} lights={lights} scale={p.scale} />
      ))}
      <Daylight sky={sky} speed={speed} startDay={g.day} mats={mats} shadows={Q.shadows} sig={`${sig}${lights}`} onLights={setLights} />
      <Movers traffic={traffic} speed={speed} color={me.color} pins={pins} />

      {/* what the pointer can hit: one unseen box per place */}
      {list.map((p) => (
        <mesh
          key={p.id}
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
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
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
      <TagProjector list={list} tags={tags} />
      <Rig focus={focus} />
      {import.meta.env.DEV && <DevHandle />}
    </Canvas>
      {/* name tags, laid over the view. Rivals and billboards carry their own names, so theirs show only under the pointer */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {list.map((p) => {
          const full = p.id === hover
          const shown = full || (names && p.kind !== 'rival' && p.kind !== 'board' && !p.crowded)
          return (
            <div
              key={p.id}
              ref={(el) => {
                if (el) tags.current.set(p.id, el)
                else tags.current.delete(p.id)
              }}
              className="absolute left-0 top-0"
              style={{ display: shown ? undefined : 'none', visibility: 'hidden', zIndex: full ? 2 : 1 }}
            >
              <Tag place={p} full={full} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
