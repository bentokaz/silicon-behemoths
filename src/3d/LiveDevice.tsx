// The device as it appears in the designer: the model itself plus everything
// that makes it feel like an object on a bench. The body eases to a new size,
// parts lift while they are dragged and knock back down, handles on the model
// resize and turn things, and changes that cannot be seen are acted out.
import { Html } from '@react-three/drei'
import { type RootState, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sfx'
import { Icon } from '../components/icons'
import { TYPES } from '../data/devices'
import { sizeLimits } from '../data/devices'
import { type Carrier, carrierBody, clampPart, faceBasis, faceLabel, faceSize, facesFor, isEdge, isFlip, kindsFor, mountOf, onKeyboard, partLabel } from '../sim/geometry'
import { type Comp, cameraCost, layoutInternals } from '../sim/internals'
import type { Body, CustomChip, DeviceDesign, DeviceType, Face, Levels, OsLook, PartKind, PlacedPart } from '../sim/types'
import { useStore } from '../store/game'
import { themeColor } from '../store/theme'
import { buildDevice, deviceFrame, disposeDevice, layerScaleOf, placeOnFace, pointToFace, setFold } from './buildDevice'
import { DEMO_SOUND, type Demo, type DemoHints, type DemoSpec, type Pose, buildDemo, diffDesign, disposeDemo } from './demos'
import { type Guide, studioDebug, studioHint, useStudio } from './studio'
import { CompLabel, TEAR_LAMP, type TourStop, fitDistance, pickedOf, tearDir, tourStops, useCompHover } from './tearView'
import { type Rig, newRigMemory, rigTeardown } from './teardown'

/** What the studio needs to open the device up and say what each component is worth. */
export interface TearInfo {
  levels: Levels
  chips: CustomChip[]
  shares: Record<string, { cost: number; grams?: number }>
  unitCost: number
  weight: number
  /** Evaluation.costScale: what evaluate() multiplied every cost by. */
  costScale: number
  /** Grams for each component of the layout, by its id (see weightShares). */
  weights: Record<string, number>
  /** Set when the issue list says the design runs hot or overheats: what it says, and whether it is an error. */
  hot?: { bad: boolean; text: string } | null
}
/** The components that carry the heat: the ones tinted when the design runs hot. */
const runsHot = (c: Comp) => (c.kind === 'chip' || c.kind === 'heatsink' || c.kind === 'pump' || c.kind === 'card' || c.kind === 'sheet') && c.specs.some((k) => k === 'chip' || k === 'gpu' || k === 'cooling')
/** True if a component stands for a row of the Internals panel. */
const standsFor = (c: Comp, key: string) => c.specs.includes(key) || (key === 'camera' && c.kind === 'camera')

interface Props {
  design: DeviceDesign
  selectedId?: string | null
  onPick?: (partId: string | null) => void
  logo?: string
  colorIndex?: number
  /** The look of the operating system shown on the screen. */
  osLook?: OsLook
  /** Size of the device relative to a phone. */
  scale: number
  /** True when parts and the body can be worked on directly (the advanced editor). */
  editable: boolean
  hints?: DemoHints
  /** Given in the designer: lets the device open up while the Internals panel is. */
  tear?: TearInfo
  /** Where the camera stands for the view that is chosen: where it goes back to when the device shuts, if it has nowhere else to go back to. */
  home?: [number, number, number]
}

// ---------------------------------------------------------------- easing the body

const EASE_MS = 190
const SIZES = ['width', 'height', 'thickness', 'corner', 'bezelTop', 'bezelBottom', 'bezelSide'] as const
const COLOURS = ['frameColor', 'backColor', 'strapColor'] as const
const bodyMoved = (a: Body, b: Body) => SIZES.some((k) => a[k] !== b[k]) || COLOURS.some((k) => a[k] !== b[k])
const ca = new THREE.Color()
const cb = new THREE.Color()

function mixBody(a: Body, b: Body, k: number): Body {
  const out = { ...b }
  for (const key of SIZES) out[key] = a[key] + (b[key] - a[key]) * k
  for (const key of COLOURS) {
    const from = a[key]
    const to = b[key]
    if (from && to && from !== to) out[key] = `#${ca.set(from).lerp(cb.set(to), k).getHexString()}`
  }
  return out
}

/** The design to draw: the one asked for, or a step on the way to it while the body changes shape or colour. */
function useEased(design: DeviceDesign): DeviceDesign {
  const target = useRef(design)
  const drawn = useRef(design.body)
  const anim = useRef<{ from: Body; t0: number } | null>(null)
  const [, redraw] = useState(0)
  if (target.current !== design) {
    anim.current = target.current.type === design.type && bodyMoved(drawn.current, design.body) ? { from: drawn.current, t0: performance.now() } : null
    target.current = design
  }
  let shown = design
  if (anim.current) {
    const k = (performance.now() - anim.current.t0) / EASE_MS
    if (k >= 1) anim.current = null
    else {
      const body = mixBody(anim.current.from, design.body, 1 - Math.pow(1 - k, 3))
      shown = { ...design, body, parts: design.parts.map((p) => clampPart(body, p, design.type)) }
    }
  }
  drawn.current = shown.body
  useFrame(() => {
    if (anim.current) redraw((n) => n + 1)
  })
  return shown
}

// ---------------------------------------------------------------- finding things in a built model

/** The object whose own space is that of one of the device's solids. */
function carrierRoot(group: THREE.Object3D, carrier: Carrier): THREE.Object3D {
  const cache = (group.userData.carriers ??= {}) as Partial<Record<Carrier, THREE.Object3D>>
  if (!cache[carrier]) group.traverse((o) => o.userData.body && o.userData.carrier === carrier && o.parent && (cache[carrier] = o.parent))
  return cache[carrier] ?? group
}

function partRoots(group: THREE.Object3D): Map<string, THREE.Object3D> {
  let map = group.userData.roots as Map<string, THREE.Object3D> | undefined
  if (!map) {
    map = group.userData.roots = new Map<string, THREE.Object3D>()
    group.traverse((o) => o.userData.partRoot && map!.set(o.userData.partRoot as string, o))
  }
  return map
}

const isRound = (p: PlacedPart, type: DeviceType) => p.kind === 'camera' || p.kind === 'flash' || !!p.crown || (p.kind === 'fingerprint' && !isEdge(p.face, type) && type !== 'laptop')
const isBig = (type: DeviceType) => type === 'tv' || type === 'desktop' || type === 'console'

/** Makes the model see-through by `level` (0 to 1), or puts it back as it was at 0. */
function xray(group: THREE.Object3D, level: number) {
  if (level <= 0 && !group.userData.xray) return
  group.userData.xray = level > 0
  const walk = (o: THREE.Object3D) => {
    if (o.userData.demo || o.userData.overlay) return
    const mat = (o as THREE.Mesh).material as (THREE.Material & { opacity: number }) | THREE.Material[] | undefined
    if (mat && !Array.isArray(mat)) {
      const was = (mat.userData.solid ??= { opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite }) as { opacity: number; transparent: boolean; depthWrite: boolean }
      const through = level > 0
      if (mat.transparent !== (through || was.transparent)) {
        mat.transparent = through || was.transparent
        mat.needsUpdate = true
      }
      mat.depthWrite = through ? false : was.depthWrite
      mat.opacity = was.opacity * (1 - 0.9 * level)
      if (!through) delete mat.userData.solid
    }
    o.children.forEach(walk)
  }
  walk(group)
}

// ---------------------------------------------------------------- handles and guides

const HANDLE_OUT = 0.8

function handleBox(size: number, color: string, data: HandleData): THREE.Mesh {
  const o = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95, toneMapped: false }))
  o.renderOrder = 22
  o.userData.handle = data
  return o
}

function lineOf(points: THREE.Vector3[], color: string, loop = false, opacity = 1): THREE.Line {
  const mat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity, toneMapped: false })
  const o = loop ? new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), mat) : new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat)
  o.renderOrder = 20
  o.raycast = () => {}
  return o
}

type HandleData = { kind: 'resize' } | { kind: 'rotate' } | { kind: 'body'; axis: 'x' | 'y' | 'xy' }

/** The solid whose edges the body handles sit on. */
const sizeCarrier = (type: DeviceType): Carrier => (type === 'laptop' ? 'lid' : 'body')

/** Draws the selection outline, the handles and the snap guides onto a built model. Returns what it added. */
function decorate(group: THREE.Object3D, d: DeviceDesign, selectedId: string | null | undefined, guides: Guide[], editable: boolean, shut = false): THREE.Object3D[] {
  const made: THREE.Object3D[] = []
  const ls = layerScaleOf(d)
  const accent = themeColor('accent', '#ff6b1a')
  const put = (parent: THREE.Object3D, o: THREE.Object3D) => {
    o.userData.overlay = true
    parent.add(o)
    made.push(o)
  }
  const p = d.parts.find((q) => q.id === selectedId)
  const root = p && partRoots(group).get(p.id)
  if (p && root) {
    const out = HANDLE_OUT * ls
    const w = p.w / 2 + out
    const h = p.h / 2 + out
    const z = 2.6
    put(root, lineOf([new THREE.Vector3(-w, -h, z), new THREE.Vector3(w, -h, z), new THREE.Vector3(w, h, z), new THREE.Vector3(-w, h, z)], accent, true))
    if (editable) {
      const edge = isEdge(p.face, d.type)
      const size = 2.1 * ls
      const corners = edge ? [[-1, 0], [1, 0]] : [[-1, -1], [1, -1], [1, 1], [-1, 1]]
      for (const [sx, sy] of corners) {
        const box = handleBox(size, accent, { kind: 'resize' })
        box.position.set(sx * w, sy * h, z)
        put(root, box)
      }
      if (!edge && !isRound(p, d.type)) {
        // a stalk above the part with a knob to turn it by
        const top = h + 5.5 * ls
        put(root, lineOf([new THREE.Vector3(0, h, z), new THREE.Vector3(0, top, z)], accent))
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.62, size * 0.62, size * 0.5, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: accent, depthTest: false, transparent: true, toneMapped: false }))
        knob.renderOrder = 22
        knob.userData.handle = { kind: 'rotate' } satisfies HandleData
        knob.position.set(0, top, z)
        put(root, knob)
      }
    }
  }
  for (const gd of guides) {
    const m = mountOf(d.type, gd.face)
    const fs = faceSize(d.body, gd.face, d.type)
    const holder = new THREE.Group()
    placeOnFace(holder, carrierBody(d.body, d.type, m.carrier), d.type, m.face, 0, 0, 0)
    const z = 0.9 * ls
    const ends = gd.axis === 'x' ? [new THREE.Vector3(gd.at, -fs.h / 2, z), new THREE.Vector3(gd.at, fs.h / 2, z)] : [new THREE.Vector3(-fs.w / 2, gd.at, z), new THREE.Vector3(fs.w / 2, gd.at, z)]
    holder.add(lineOf(ends, accent, false, 0.7))
    put(carrierRoot(group, m.carrier), holder)
  }
  if (editable && !p) {
    // pull an edge to change one dimension, the corner to change both
    const carrier = sizeCarrier(d.type)
    const s = carrierBody(d.body, d.type, carrier)
    const parent = carrierRoot(group, carrier)
    const out = BODY_OUT * ls
    // each handle: which way it pulls, and where along the edge it sits. A shut foldable is half the size, so its
    // handles gather round the half that is left: the edge that has gone under the other half has none
    const flip = isFlip(d.body)
    const spots: [number, number, 'x' | 'y' | 'xy', number, number][] =
      d.type === 'earbuds'
        ? [[1, 0, 'x', 0, 0], [-1, 0, 'x', 0, 0]]
        : d.type === 'foldable' && shut
          ? flip
            ? [[1, 0, 'x', 0, -s.height / 4], [-1, 0, 'x', 0, -s.height / 4], [0, -1, 'y', 0, 0], [1, -1, 'xy', 0, 0]]
            : [[1, 0, 'x', 0, 0], [0, 1, 'y', s.width / 4, 0], [0, -1, 'y', s.width / 4, 0], [1, 1, 'xy', 0, 0]]
          : [[1, 0, 'x', 0, 0], [-1, 0, 'x', 0, 0], [0, 1, 'y', 0, 0], [1, 1, 'xy', 0, 0]]
    for (const [sx, sy, axis, ox, oy] of spots) {
      const box = handleBox(2.6 * ls, axis === 'xy' ? accent : '#d6d9de', { kind: 'body', axis })
      box.position.set(sx * (s.width / 2 + out) + ox, sy * (s.height / 2 + out) + oy, 0)
      put(parent, box)
      // a short tick from the body to the handle shows what it pulls on
      const from = new THREE.Vector3(sx * (s.width / 2) + ox, sy * (s.height / 2) + oy, 0)
      put(parent, lineOf([from, box.position.clone()], '#d6d9de', false, 0.45))
    }
  }
  return made
}
const BODY_OUT = 5

// ---------------------------------------------------------------- the device

const ndc = new THREE.Vector2()
const caster = new THREE.Raycaster()
const v3 = new THREE.Vector3()
const vb = new THREE.Vector3()
const q4 = new THREE.Quaternion()
const qi = new THREE.Quaternion()
const box = new THREE.Box3()
const part3 = new THREE.Box3()

/** The box round everything of a model that is showing, in world space. Handles, guides and demonstrations are left out. */
function boundsOf(root: THREE.Object3D, out: THREE.Box3): THREE.Box3 {
  out.makeEmpty()
  const walk = (o: THREE.Object3D) => {
    if (!o.visible || o.userData.overlay || o.userData.demo) return
    const m = o as THREE.Mesh
    if (m.isMesh && m.geometry) {
      const inst = o as THREE.InstancedMesh
      if (inst.isInstancedMesh) {
        if (!inst.boundingBox) inst.computeBoundingBox()
        part3.copy(inst.boundingBox!)
      } else {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
        part3.copy(m.geometry.boundingBox!)
      }
      if (!part3.isEmpty()) out.union(part3.applyMatrix4(o.matrixWorld))
    }
    o.children.forEach(walk)
  }
  walk(root)
  return out
}

/** Where a ray meets the z = 0 plane of an object, in that object's own space. Null if it glances along it. */
function onPlaneOf(obj: THREE.Object3D, ray: THREE.Ray): THREE.Vector3 | null {
  obj.updateWorldMatrix(true, false)
  const local = ray.clone().applyMatrix4(obj.matrixWorld.clone().invert())
  if (Math.abs(local.direction.z) < 0.12) return null
  const t = -local.origin.z / local.direction.z
  return t > 0 ? local.at(t, new THREE.Vector3()) : null
}

export function LiveDevice({ design, selectedId, onPick, logo, colorIndex = -1, osLook, scale, editable, hints, tear, home }: Props) {
  const shown = useEased(design)
  const group = useMemo(() => buildDevice(shown, null, logo, colorIndex, 1, osLook), [shown, logo, colorIndex, osLook])
  useEffect(() => () => disposeDevice(group), [group])
  const guides = useStudio((s) => s.guides)
  const folded = useStudio((s) => s.folded)
  const pick = useStudio((s) => s.pick)
  const three = useThree()
  const controls = three.controls as unknown as { enabled: boolean } | null
  const turn = useRef<THREE.Group>(null)
  const bar = useRef<THREE.Group>(null)
  const tip = useRef<THREE.Group>(null)
  const live = useRef({ design, group, hints, shown, tear, home })
  live.current = { design, group, hints, shown, tear, home }
  /** How far open the device is drawn, and how far its layers are pulled apart, both easing towards what is asked for. */
  const opened = useRef(0)
  const exploded = useRef(0)
  const mem = useRef(newRigMemory())
  const said = useRef(0)
  const over = useStudio((s) => s.over)
  const tourAt = useStudio((s) => s.tour)
  const tourSteps = useStudio((s) => s.tourSteps)
  const hoverTip = useCompHover({
    rig: () => live.current.group.userData.rig as Rig | undefined,
    on: () => opened.current > 0.6 && !dragging.current,
    turn,
    over: () => useStudio.getState().over,
    set: (p) => useStudio.setState({ over: p }),
  })

  // ---- the camera: it eases to a view of the opened device, clear of the drawers, and back again when it shuts,
  // unless the player has taken hold of it in the meantime. The tour moves it from one component to the next.
  const view = useRef({ on: false, moved: false, key: '', shift: 0, type: design.type as DeviceType, home: null as { pos: THREE.Vector3; target: THREE.Vector3 } | null, limits: null as [number, number] | null, from: null as { pos: THREE.Vector3; target: THREE.Vector3 } | null, goal: null as { pos: THREE.Vector3; target: THREE.Vector3 } | null, t0: 0, step: -1, stepT: 0 })
  useEffect(() => {
    const ctl = three.controls as unknown as THREE.EventDispatcher<{ start: object }> | null
    if (!ctl) return
    // the player has taken the camera: stop steering it, and leave it where they put it
    const grab = () => {
      view.current.moved = true
      view.current.goal = null
      if (useStudio.getState().tour >= 0) useStudio.setState({ tour: -1 })
    }
    ctl.addEventListener('start', grab)
    return () => ctl.removeEventListener('start', grab)
  }, [three.controls])
  useEffect(
    () => () => {
      const cam = three.camera as THREE.PerspectiveCamera
      if (cam.view) {
        cam.clearViewOffset()
        cam.updateProjectionMatrix()
      }
    },
    [three.camera],
  )
  const frameView = (state: RootState, rig: Rig | undefined, wantOpen: boolean, now: number, dt: number) => {
    const V = view.current
    const cam = state.camera as THREE.PerspectiveCamera
    const ctl = state.controls as unknown as { target: THREE.Vector3; update(): void; minDistance: number; maxDistance: number } | null
    const g = live.current.group
    const d = live.current.design
    const st = useStudio.getState()
    if (!ctl || !turn.current) return
    // how near and how far the camera may go when the device is shut: the view sets these from the size of the device
    const reach = live.current.home ? Math.hypot(...live.current.home) : 0
    const lim: [number, number] = reach ? [reach * 0.3, reach * 2.4] : (V.limits ?? [ctl.minDistance, ctl.maxDistance])
    if (V.type !== d.type) {
      // another kind of device: the view it came from was of something else
      V.type = d.type
      V.moved = false
      V.home = null
      V.key = ''
      V.goal = null
    }
    // ---- the tour: each stop picks its component, sets how far apart the layers are, and moves on after a while
    const stops: TourStop[] = rig ? ((g.userData.stops ??= tourStops(d.type, rig.comps)) as TourStop[]) : []
    if (rig && st.tourSteps !== stops.length) useStudio.setState({ tourSteps: stops.length })
    let stop: TourStop | undefined
    if (st.tour >= 0) {
      stop = wantOpen && rig ? stops[st.tour] : undefined
      const comp = stop && rig?.comps.get(stop.id)
      if (!stop || !comp) useStudio.setState({ tour: -1 })
      else if (V.step !== st.tour) {
        V.step = st.tour
        V.stepT = now
        useStudio.setState({ pick: pickedOf(comp.c), explode: stop.explode })
      } else if (now - V.stepT > 3800) useStudio.setState({ tour: st.tour + 1 < stops.length ? st.tour + 1 : -1 })
    } else if (V.step !== -1) {
      // the tour is over: back to the whole device
      V.step = -1
      V.key = ''
      if (!V.moved) useStudio.setState({ pick: null, explode: 0 })
    }
    if (wantOpen && !V.on) {
      V.on = true
      V.moved = false
      V.key = ''
      V.home = { pos: cam.position.clone(), target: ctl.target.clone() }
      V.limits = [ctl.minDistance, ctl.maxDistance]
    } else if (!wantOpen && V.on) {
      V.on = false
      V.key = ''
      ctl.minDistance = lim[0]
      ctl.maxDistance = Math.max(lim[1], cam.position.distanceTo(ctl.target))
      // back to where it was; or, if the device has changed kind since, to the view that is chosen for the new one
      const back = V.home ?? (live.current.home ? { pos: new THREE.Vector3(...live.current.home), target: new THREE.Vector3() } : null)
      if (back && !V.moved) {
        V.from = { pos: cam.position.clone(), target: ctl.target.clone() }
        V.goal = back
        V.t0 = now
      }
    }
    const apart = stop ? stop.explode : st.explode >= 0.5 ? 1 : 0
    const shape = d.type === 'console' && d.body.height > d.body.width ? 'tower' : (d.body.fold ?? d.body.form ?? '')
    const key = V.on ? `${apart}|${stop?.id ?? ''}|${shape}|${st.pad[0]}|${st.pad[1]}|${Math.round(state.size.width / 40)}` : ''
    if (V.on && rig && key !== V.key && (!V.moved || stop)) {
      V.key = key
      // measure the device as it will be once it is open, with the model facing the way it was built
      const yawWas = turn.current.rotation.y
      const shakeWas = turn.current.position.x
      turn.current.rotation.y = 0
      turn.current.position.x = 0
      rig.pose(1, apart, 0, mem.current, now)
      turn.current.updateWorldMatrix(true, true)
      boundsOf(g, box)
      const dir = stop?.dir ? v3.set(stop.dir[0], stop.dir[1], stop.dir[2]).normalize().clone() : tearDir(d, apart)
      const free: [number, number] = [Math.max(0.3, (state.size.width - st.pad[0] - st.pad[1]) / state.size.width), Math.max(0.4, (state.size.height - 150) / state.size.height)]
      const whole = fitDistance(box, dir, cam.fov, state.size.width / state.size.height, free) * 1.05
      const target = box.getCenter(new THREE.Vector3())
      let dist = whole
      const it = stop && rig.comps.get(stop.id)
      if (it) {
        // a stop of the tour: close enough to see the component, far enough to see where in the device it is
        it.g.getWorldPosition(target)
        dist = Math.min(whole, Math.max(Math.hypot(it.size[0], it.size[1], it.size[2]) * 3.2, whole * 0.36))
      }
      turn.current.rotation.y = yawWas
      turn.current.position.x = shakeWas
      rig.pose(opened.current, exploded.current, 0, mem.current, now)
      // opened, there is more to get close to and more to stand back from: a cover laid aside has to stay in the picture
      ctl.minDistance = Math.min(lim[0], dist * 0.2)
      ctl.maxDistance = Math.max(lim[1], whole * 1.7)
      V.from = { pos: cam.position.clone(), target: ctl.target.clone() }
      V.goal = { pos: target.clone().addScaledVector(dir, dist), target }
      V.t0 = now
    }
    if (V.goal && V.from) {
      const k = Math.min(1, (now - V.t0) / 950)
      const s = k * k * (3 - 2 * k)
      // swing round the point looked at, rather than cut straight across
      const a = v3.copy(V.from.pos).sub(V.from.target)
      const b = vb.copy(V.goal.pos).sub(V.goal.target)
      const la = a.length()
      const lb = b.length()
      q4.setFromUnitVectors(a.normalize(), b.normalize())
      qi.identity().slerp(q4, s)
      ctl.target.lerpVectors(V.from.target, V.goal.target, s)
      cam.position.copy(a).applyQuaternion(qi).multiplyScalar(la + (lb - la) * s).add(ctl.target)
      ctl.update()
      if (k >= 1) V.goal = V.from = null
    }
    // the middle of the picture moves to the middle of what the drawers leave clear
    const shift = V.on ? (st.pad[0] - st.pad[1]) / 2 : 0
    if (Math.abs(shift - V.shift) > 0.5 || (cam.view?.enabled && !V.on && Math.abs(V.shift) <= 0.5)) {
      V.shift += (shift - V.shift) * (1 - Math.exp(-dt * 5))
      if (Math.abs(shift - V.shift) <= 0.5) V.shift = shift
      if (Math.abs(V.shift) > 0.5) cam.setViewOffset(state.size.width, state.size.height, -V.shift, 0, state.size.width, state.size.height)
      else cam.clearViewOffset()
      cam.updateProjectionMatrix()
    }
  }

  // ---- selection outline, handles and guides, redrawn onto each rebuilt model
  useEffect(() => {
    const made = decorate(group, shown, selectedId, guides, editable, folded && design.type === 'foldable')
    return () =>
      made.forEach((o) => {
        o.removeFromParent()
        disposeDevice(o)
      })
    // `shown` and `group` change together
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, selectedId, guides, editable, folded])

  // ---- parts that move: new ones pop in, a dragged one lifts, a dropped one knocks down
  const pops = useRef(new Map<string, number>())
  const held = useRef<{ id: string; t0: number; moved: boolean } | null>(null)
  const dropped = useRef<{ id: string; t0: number } | null>(null)
  const before = useRef(design)
  // ---- demonstrations
  const queue = useRef<DemoSpec[]>([])
  const playing = useRef<{ demo: Demo; t0: number; on: THREE.Object3D | null } | null>(null)
  const battery = useRef<{ spec: DemoSpec; timer: number } | null>(null)
  const yaw = useRef(0)
  /** How far shut a foldable is drawn, 0 to 1, easing towards what the studio asks for. */
  const fold = useRef(0)
  useEffect(() => {
    if (design.type !== 'foldable' && useStudio.getState().folded) useStudio.setState({ folded: false })
    mem.current = newRigMemory()
    useStudio.setState({ pick: null })
  }, [design.type])

  const enqueue = (list: DemoSpec[]) => {
    queue.current = [...queue.current.filter((q) => !list.some((n) => n.key === q.key)), ...list].slice(-3)
    // whatever is playing makes way for the newer change
    const cur = playing.current
    if (cur) cur.t0 = Math.min(cur.t0, performance.now() - (cur.demo.duration - 0.28) * 1000)
  }

  useEffect(() => {
    const a = before.current
    before.current = design
    if (a === design || a.type !== design.type) {
      pops.current.clear()
      return
    }
    // a part of a kind, on a face, that was not there before
    const count = new Map<string, number>()
    const key = (p: PlacedPart) => `${p.kind}|${p.face}|${p.text ?? ''}`
    for (const p of a.parts) count.set(key(p), (count.get(key(p)) ?? 0) + 1)
    pops.current.clear()
    const seen = new Map<string, number>()
    const now = performance.now()
    for (const p of design.parts) {
      const n = (seen.get(key(p)) ?? 0) + 1
      seen.set(key(p), n)
      if (n > (count.get(key(p)) ?? 0) && p.id !== held.current?.id) pops.current.set(p.id, now)
    }
    if (pops.current.size && editable) sfx.drop()

    let specs = diffDesign(a, design)
    const stu = useStudio.getState()
    if (tear && stu.internals && !stu.keepClosed) {
      // the device is open: a change to something that can be seen in there is shown on the component itself, which
      // hops in its place, and only what cannot be seen from the inside is acted out, with the device shut again
      const comps = layoutInternals(design, tear.levels, tear.chips).comps
      const rest: DemoSpec[] = []
      let named: DemoSpec | null = null
      for (const sp of specs) {
        if (sp.kind === 'gone') continue
        const key = sp.key.replace(/^extra-/, 'extra:').replace(/^io-/, 'io:')
        const hits = comps.filter((c) => standsFor(c, key))
        if (!hits.length) rest.push(sp)
        else {
          if (sp.kind !== 'battery') for (const c of hits) mem.current.pulse.set(c.id, performance.now() + 80)
          named = sp
        }
      }
      if (named) {
        window.clearTimeout(said.current)
        useStudio.setState({ caption: { title: named.title, note: named.note } })
        said.current = window.setTimeout(() => !playing.current && useStudio.setState({ caption: null }), 1800)
      }
      specs = rest
    }
    const slow = specs.find((s) => s.kind === 'battery')
    if (slow) {
      // a slider sends a stream of small steps: wait for it to rest, and show the whole move
      const from = battery.current?.spec.from ?? slow.from
      window.clearTimeout(battery.current?.timer)
      const spec = { ...slow, from, note: slow.note }
      battery.current = { spec, timer: window.setTimeout(() => (enqueue([spec]), (battery.current = null)), 340) }
    }
    const rest = specs.filter((s) => s.kind !== 'battery')
    if (rest.length) enqueue(rest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design])

  useEffect(
    () => () => {
      window.clearTimeout(battery.current?.timer)
      window.clearTimeout(said.current)
      if (playing.current) disposeDemo(playing.current.demo)
      playing.current = null
      useStudio.setState({ caption: null, guides: [], hint: null, folded: false, hover: null, pick: null, over: null, tour: -1 })
    },
    [],
  )

  useEffect(() => {
    if (!import.meta.env.DEV) return
    // in development the studio can be driven and photographed from the console
    Object.assign(window, { sbStudio: { three: three.get, debug: studioDebug, play: (spec: DemoSpec) => enqueue([spec]), playing, studio: useStudio, rig: () => live.current.group.userData.rig as Rig | undefined, model: () => live.current.group, opened } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [three.get])

  useFrame((state, dt) => {
    const now = performance.now()
    const g = live.current.group
    const d = live.current.design
    const ls = layerScaleOf(d)

    // ---- parts in motion
    const roots = partRoots(g)
    const place = (id: string, rise: number, size: number) => {
      const o = roots.get(id)
      if (!o) return
      const base = (o.userData.base ??= o.position.clone()) as THREE.Vector3
      o.position.copy(base).addScaledVector(v3.set(0, 0, 1).applyQuaternion(o.quaternion), rise)
      o.scale.setScalar(size)
    }
    for (const [id, t0] of pops.current) {
      const k = (now - t0) / 300
      if (k >= 1) pops.current.delete(id)
      place(id, k >= 1 ? 0 : (1 - k) * (1 - k) * 2.2 * ls, k >= 1 ? 1 : 0.6 + 0.4 * (1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2)))
    }
    const lift = 1.3 * ls
    if (held.current?.moved) place(held.current.id, lift * Math.min(1, (now - held.current.t0) / 90), 1.03)
    if (dropped.current) {
      const k = (now - dropped.current.t0) / 1000
      if (k > 0.42) {
        place(dropped.current.id, 0, 1)
        dropped.current = null
      } else place(dropped.current.id, lift * Math.abs(Math.cos(k * 15)) * Math.exp(-k * 11), 1 + 0.03 * Math.exp(-k * 14))
    }

    // ---- the demonstration that is playing, or the next one waiting
    let cur = playing.current
    // a demonstration happens on the outside: if the device is open it waits for it to shut
    if (!cur && queue.current.length && opened.current < 0.04) {
      const spec = queue.current.shift()!
      const demo = buildDemo(spec, d, deviceFrame(d).radius, live.current.hints)
      if (demo) {
        cur = playing.current = { demo, t0: now, on: null }
        sfx[DEMO_SOUND[spec.kind]]()
        useStudio.setState({ caption: { title: spec.title, note: spec.note } })
      }
    }
    let face: Face | undefined
    let pose: Pose = {}
    if (cur) {
      if (cur.on !== g) {
        // the model was rebuilt under it: move the demonstration onto the new one
        for (const [carrier, root] of Object.entries(cur.demo.roots)) carrierRoot(g, carrier as Carrier).add(root)
        cur.on = g
      }
      const t = studioDebug.time ?? (now - cur.t0) / 1000
      if (t >= cur.demo.duration) {
        disposeDemo(cur.demo)
        playing.current = null
        xray(g, 0)
        if (!queue.current.length) useStudio.setState({ caption: null })
      } else {
        cur.demo.update(t)
        xray(g, cur.demo.xray(t))
        pose = cur.demo.pose(t)
        if (t < cur.demo.duration - 0.4) face = cur.demo.face
      }
    } else xray(g, 0)

    // ---- what the model itself is doing: a foldable easing open or shut, a handheld shaking in the hands
    const st = useStudio.getState()
    const info = live.current.tear
    const tearing = !!info && st.internals && !st.keepClosed
    // a foldable is opened flat before it is opened up
    const rest = d.type === 'foldable' && st.folded && !tearing ? 1 : 0
    fold.current += (rest - fold.current) * (1 - Math.exp(-dt * 6))
    if (Math.abs(rest - fold.current) < 0.001) fold.current = rest
    // a demonstration swings it towards the other state and back
    const swung = fold.current + ((rest ? 0 : 1) - fold.current) * (pose.fold ?? 0)
    setFold(g, swung * swung * (3 - 2 * swung))
    if (turn.current) turn.current.position.x = pose.shake ?? 0

    // ---- the teardown: open while the Internals panel is, unless a demonstration needs the outside
    const wantOpen = tearing && !cur && !queue.current.length && fold.current < 0.02
    const target = studioDebug.open ?? (wantOpen ? 1 : 0)
    opened.current += (target - opened.current) * (1 - Math.exp(-dt * (d.type === 'laptop' ? 1.9 : 3.2)))
    if (Math.abs(target - opened.current) < 0.002 || studioDebug.open !== null) opened.current = target
    const apart = studioDebug.explode ?? (wantOpen ? st.explode : 0)
    exploded.current += (apart - exploded.current) * (1 - Math.exp(-dt * 4))
    if (Math.abs(apart - exploded.current) < 0.002 || studioDebug.explode !== null) exploded.current = apart
    let rig = g.userData.rig as Rig | undefined
    // the insides are built only when a model is first opened
    if (!rig && info && (opened.current > 0.002 || target > 0)) rig = g.userData.rig = rigTeardown(g, live.current.shown, layoutInternals(live.current.shown, info.levels, info.chips))
    if (rig) {
      rig.pose(opened.current, exploded.current, Math.min(dt, 0.1), mem.current, now)
      const key = st.hover
      const lit = opened.current > 0.3
      rig.highlight(key && lit ? (c) => standsFor(c, key) : null, lit ? (st.pick?.id ?? null) : null, lit ? (st.over?.id ?? null) : null)
      rig.heat(info?.hot && lit ? runsHot : null, !!info?.hot?.bad)
    }
    const lamp = (g.userData.lamp ??= state.scene.getObjectByName('tearLamp')) as THREE.DirectionalLight | undefined
    if (lamp) {
      lamp.position.copy(state.camera.position)
      lamp.intensity = TEAR_LAMP * opened.current
    }
    if (opened.current < 0.3 && st.pick) useStudio.setState({ pick: null })
    frameView(state, rig, wantOpen, now, dt)
    // the dock would hide whatever is being worked on underneath
    const underneath = d.parts.find((p) => p.id === selectedId)?.face === 'bottom'
    g.traverse((o) => o.userData.prop === 'dock' && (o.visible = !underneath))

    // ---- turn the device so the face that matters can be seen, then turn it back
    let want = 0
    if (face && turn.current) {
      const m = mountOf(d.type, face)
      const n = faceBasis(d.type, m.face)[2]
      v3.set(n[0], n[1], n[2]).applyQuaternion(carrierRoot(g, m.carrier).getWorldQuaternion(q4))
      if (Math.hypot(v3.x, v3.z) > 0.5) {
        const away = Math.atan2(state.camera.position.x, state.camera.position.z) - (Math.atan2(v3.x, v3.z) - yaw.current)
        const diff = Math.atan2(Math.sin(away), Math.cos(away))
        if (Math.abs(diff) > 1.05) want = diff - Math.sign(diff) * 0.5
      }
    }
    yaw.current += (want - yaw.current) * (1 - Math.exp(-dt * 8))
    if (Math.abs(yaw.current) < 0.0005 && !want) yaw.current = 0
    if (turn.current) turn.current.rotation.y = yaw.current

    // ---- the little toolbar follows the selected part
    const sel = selectedId ? roots.get(selectedId) : undefined
    const part = sel && d.parts.find((p) => p.id === selectedId)
    if (bar.current && sel && part && turn.current) {
      sel.updateWorldMatrix(true, false)
      bar.current.position.copy(turn.current.worldToLocal(sel.localToWorld(v3.set(0, -part.h / 2 - 5 * ls, 2.6))))
    }
    const picked = st.pick && rig?.comps.get(st.pick.id)
    if (tip.current && picked && turn.current) {
      picked.g.updateWorldMatrix(true, false)
      tip.current.position.copy(turn.current.worldToLocal(picked.g.localToWorld(v3.set(0, 0, picked.size[2] / 2))))
    }
  })

  /** A press on the opened device: pick the component under it, if there is one. */
  const pickComp = (e: ThreeEvent<PointerEvent>): boolean => {
    if (opened.current < 0.5) return false
    const rig = live.current.group.userData.rig as Rig | undefined
    const seen = (o: THREE.Object3D | null): boolean => !o || (o.visible && seen(o.parent))
    const hit = e.intersections.find((i) => i.object.userData.comp && seen(i.object))
    const it = hit && rig?.comps.get(hit.object.userData.comp as string)
    useStudio.setState({ pick: it ? pickedOf(it.c) : null, tour: -1 })
    if (it) {
      e.stopPropagation()
      sfx.pick()
    }
    return !!it
  }
  // what the picked component is, and what share of the device it is
  const camPart = pick?.partId ? design.parts.find((p) => p.id === pick.partId && p.kind === 'camera') : undefined
  const rows = pick && tear ? [...new Set(pick.specs.map((k) => (k === 'refresh' ? 'panel' : k)))].map((k) => tear.shares[k]).filter((x) => !!x) : []
  const cost = camPart ? cameraCost(design, camPart, tear?.costScale ?? 1) : rows.reduce((a, x) => a + x.cost, 0)
  const hotPick = pick && tear?.hot && pick.kind && runsHot({ kind: pick.kind, specs: pick.specs } as Comp) ? tear.hot : null
  const label = tear && (
    <>
      {pick && (
        <group ref={tip}>
          <Html zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}>
            <CompLabel pick={pick} cost={cost} unitCost={tear.unitCost} grams={tear.weights[pick.id] ?? 0} weight={tear.weight} hot={hotPick} step={tourAt >= 0 ? `Tour ${tourAt + 1} / ${tourSteps}` : undefined} />
          </Html>
        </group>
      )}
      <group ref={hoverTip}>
        {over && over.id !== pick?.id && (
          <Html zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
            <CompLabel pick={over} compact />
          </Html>
        )}
      </group>
    </>
  )

  // ---- dragging a part across the body
  const dragging = useRef(false)
  const [adding, setAdding] = useState<{ face: Face; x: number; y: number; at: THREE.Vector3; kinds: PartKind[] } | null>(null)
  useEffect(() => setAdding(null), [selectedId, design.type, editable])

  useEffect(() => {
    const up = () => {
      if (dragging.current && held.current?.moved) {
        dropped.current = { id: held.current.id, t0: performance.now() }
        sfx.drop()
      }
      dragging.current = false
      held.current = null
      if (useStudio.getState().guides.length) useStudio.setState({ guides: [] })
      if (controls) controls.enabled = true
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [controls])

  if (!editable || !onPick) {
    return (
      <group ref={turn}>
        <primitive object={group} onPointerDown={pickComp} />
        {label}
      </group>
    )
  }

  const dragTo = (face: Face, x: number, y: number) => {
    const st = useStore.getState()
    const d = st.draft
    const p = d?.parts.find((q) => q.id === st.selectedPart)
    if (!p || !d || !facesFor(p.kind, d.type).includes(face)) return
    const grid = isBig(d.type) ? 1 : 0.5
    const edge = isEdge(face, d.type)
    let nx = Math.round(x / grid) * grid
    let ny = edge ? 0 : Math.round(y / grid) * grid
    // snap to the centre lines of the face and to the other parts on it
    const reach = 1.1 * layerScaleOf(d)
    const others = d.parts.filter((q) => q.id !== p.id && q.face === face)
    const found: Guide[] = []
    const near = (v: number, list: number[]) => list.reduce<number | null>((best, c) => (Math.abs(c - v) <= reach && (best === null || Math.abs(c - v) < Math.abs(best - v)) ? c : best), null)
    const sx = near(x, [0, ...others.map((q) => q.x)])
    if (sx !== null) {
      nx = sx
      found.push({ face, axis: 'x', at: sx })
    }
    const sy = edge ? null : near(y, [0, ...others.map((q) => q.y)])
    if (sy !== null) {
      ny = sy
      found.push({ face, axis: 'y', at: sy })
    }
    if (d.type === 'laptop' && face === 'top' && onKeyboard(d.body, { ...p, face, x: nx, y: ny })) studioHint('Nothing fits between the keys, so it sits beside the keyboard.')
    if (held.current && !held.current.moved && (p.face !== face || Math.abs(p.x - nx) + Math.abs(p.y - ny) > 0.01)) {
      held.current.moved = true
      held.current.t0 = performance.now()
      sfx.pick()
    }
    st.patchPart(p.id, { face, x: nx, y: ny })
    const old = useStudio.getState().guides
    const same = old.length === found.length && old.every((g, i) => g.face === found[i].face && g.axis === found[i].axis && g.at === found[i].at)
    if (!same) {
      if (found.length > old.length || (found.length && !same)) sfx.snap()
      useStudio.setState({ guides: found })
    }
  }

  /** Follows the pointer while a handle is held, wherever on the page it goes. */
  const pull = (data: HandleData) => {
    if (controls) controls.enabled = false
    const st = useStore.getState()
    const partId = st.selectedPart
    const move = (ev: PointerEvent) => {
      const rect = three.gl.domElement.getBoundingClientRect()
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
      caster.setFromCamera(ndc, three.camera)
      const d = useStore.getState().draft
      if (!d) return
      const ls = layerScaleOf(d)
      if (data.kind === 'body') {
        const at = onPlaneOf(carrierRoot(live.current.group, sizeCarrier(d.type)), caster.ray)
        if (!at) return
        const T = sizeLimits(d.type, d.body.fold)
        const step = isBig(d.type) ? 1 : 0.5
        const fit = (v: number, [lo, hi]: [number, number, number]) => Math.min(hi, Math.max(lo, Math.round((2 * (Math.abs(v) - BODY_OUT * ls)) / step) * step))
        const patch: Partial<Body> = {}
        if (data.axis !== 'y') patch.width = fit(at.x, T.width)
        if (data.axis !== 'x') patch.height = fit(at.y, T.height)
        if ((patch.width ?? d.body.width) === d.body.width && (patch.height ?? d.body.height) === d.body.height) return
        // a speaker keeps its proportions seen from above: its depth follows its width
        if (d.type === 'speaker' && patch.width !== undefined) patch.thickness = Math.min(TYPES.speaker.maxThickness, Math.max(TYPES.speaker.thickBase, d.body.thickness + patch.width - d.body.width))
        sfx.stretch()
        useStore.getState().setBody(patch)
        return
      }
      const p = d.parts.find((q) => q.id === partId)
      const root = partId ? partRoots(live.current.group).get(partId) : undefined
      const at = root && onPlaneOf(root, caster.ray)
      if (!p || !at) return
      if (data.kind === 'rotate') {
        const by = (Math.atan2(-at.x, at.y) * 180) / Math.PI
        const rot = (((Math.round((p.rot + by) / 15) * 15) % 360) + 360) % 360
        if (rot === p.rot) return
        sfx.snap()
        useStore.getState().patchPart(p.id, { rot })
        return
      }
      const step = isBig(d.type) ? 1 : 0.25
      const out = HANDLE_OUT * ls
      const size = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round((2 * (Math.abs(v) - out)) / step) * step))
      const fs = faceSize(d.body, p.face, d.type)
      const edge = isEdge(p.face, d.type)
      let patch: Partial<PlacedPart>
      if (isRound(p, d.type)) {
        const front = p.face === 'front'
        const dia = size(Math.max(Math.abs(at.x), Math.abs(at.y)), p.kind === 'camera' ? (front ? 2.5 : 5) : 2, p.kind === 'camera' && !front ? 26 : 14)
        patch = { w: dia, h: dia }
      } else patch = edge ? { w: size(at.x, 1, Math.min(fs.w, 200)) } : { w: size(at.x, 1, Math.max(fs.w, fs.h)), h: size(at.y, 0.8, Math.min(fs.h, Math.max(120, fs.h * 0.6))) }
      if ((patch.w ?? p.w) === p.w && (patch.h ?? p.h) === p.h) return
      sfx.stretch()
      useStore.getState().patchPart(p.id, patch)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      sfx.drop()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const down = (e: ThreeEvent<PointerEvent>) => {
    if (pickComp(e)) return
    e.stopPropagation()
    setAdding(null)
    const handle = e.intersections.find((i) => i.object.userData.handle)
    if (handle) return pull(handle.object.userData.handle as HandleData)
    const solid = e.intersections.filter((i) => !i.object.userData.overlay)
    const hit = solid.find((i) => i.object.userData.partId)
    const front = solid[0]
    // a part only counts if nothing but its own island / the body is in front of it
    const id = (front?.object.userData.partId as string | undefined) ?? (hit && hit.distance - front.distance < 3 * scale ? (hit.object.userData.partId as string) : null)
    onPick(id)
    if (id) {
      dragging.current = true
      held.current = { id, t0: performance.now(), moved: false }
      if (controls) controls.enabled = false
    }
  }
  const faceAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    // the nearest solid under the pointer; the hit is converted into that solid's own space
    const hit = e.intersections.find((i) => i.object.userData.body && i.face)
    if (!hit?.face) return null
    const local = hit.object.worldToLocal(hit.point.clone())
    const f = pointToFace(design.type, hit.object.userData.carrier as Carrier, local, hit.face.normal)
    return f && { ...f, point: hit.point }
  }
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    e.stopPropagation()
    const f = faceAt(e)
    if (f) dragTo(f.face, f.x, f.y)
  }
  /** Double-click a bare surface to put a part there. */
  const twice = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.intersections.filter((i) => !i.object.userData.overlay)[0]?.object.userData.partId) return
    const f = faceAt(e)
    if (!f || !turn.current) return
    const kinds = kindsFor(design.type).filter((k) => facesFor(k, design.type).includes(f.face))
    if (!kinds.length) return studioHint(`Nothing can be fitted to the ${faceLabel(f.face, design.type)}.`)
    setAdding({ face: f.face, x: f.x, y: f.y, at: turn.current.worldToLocal(f.point.clone()), kinds })
  }

  const part = design.parts.find((p) => p.id === selectedId)
  const st = useStore.getState()
  const chip = 'h-6 border border-line2 bg-panel px-2 text-[11px] text-fg hover:border-fg hover:bg-hover'
  return (
    <group ref={turn}>
      <primitive object={group} onPointerDown={down} onPointerMove={move} onDoubleClick={twice} />
      {label}
      {part && (
        <group ref={bar}>
          <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
            <div className="flex translate-y-3 whitespace-nowrap" style={{ pointerEvents: 'auto' }} onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" className={chip} title="Make a copy beside it" onClick={() => st.duplicatePart(part.id)}>
                Copy
              </button>
              {!isEdge(part.face, design.type) && (
                <button type="button" className={`${chip} -ml-px`} title="Move to the centre line" onClick={() => st.patchPart(part.id, { x: 0 })}>
                  Centre
                </button>
              )}
              <button type="button" className={`${chip} -ml-px hover:!border-neg hover:text-neg`} title="Remove this part (Delete)" onClick={() => st.removePart(part.id)}>
                Delete
              </button>
            </div>
          </Html>
        </group>
      )}
      {adding && (
        <Html position={adding.at} zIndexRange={[6, 0]}>
          <div className="w-44 border border-line2 bg-panel" onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex h-7 items-center justify-between border-b border-line pl-2">
              <span className="text-[11px] text-dim">Add to the {faceLabel(adding.face, design.type)}</span>
              <button type="button" className="flex h-7 w-7 items-center justify-center text-dim hover:bg-hover hover:text-fg" title="Close without adding anything" aria-label="Close without adding anything" onClick={() => setAdding(null)}>
                <Icon name="close" size={12} />
              </button>
            </div>
            {adding.kinds.map((k) => (
              <button key={k} type="button" className="block h-6 w-full px-2 text-left text-xs text-fg hover:bg-hover" onClick={() => (st.addPart(k, adding), setAdding(null))}>
                {partLabel({ kind: k, face: adding.face, crown: design.type === 'watch' && k === 'button' }, design.type)}
              </button>
            ))}
          </div>
        </Html>
      )}
    </group>
  )
}
