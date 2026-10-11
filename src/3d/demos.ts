// Short demonstrations played in the studio when a change to a design cannot be
// seen on the finished device: a charging puck meets the back, the shell turns
// see-through while the battery grows, water beads and runs off. Each one is
// chosen from the difference between the design before and after an edit, so it
// works the same for a slider, a list, undo and redo.
import * as THREE from 'three'
import { EXTRAS, RAM_OPTIONS, STORAGE_OPTIONS, chipInfo } from '../data/catalog'
import { ANC, COOLERS, GPUS, HINGES, MIC_ARRAYS, OPTICS, SPEAKERS, TYPES, driverOptions, inputOptions, ioInfo } from '../data/devices'
import { type Carrier, carrierBody, handheldControls, isFlip, laptopDeck, mountOf, screenRect, speakerShape, standLift } from '../sim/geometry'
import { batteryLabel, chargeWatts, panelName } from '../sim/scoring'
import type { Body, DeviceDesign, Face, PlacedPart } from '../sim/types'
import { themeColor } from '../store/theme'
import { looseBudAt, placeOnFace } from './buildDevice'

export type DemoKind = 'puck' | 'charge' | 'water' | 'nfc' | 'sat' | 'sound' | 'battery' | 'chip' | 'gpu' | 'cells' | 'cooling' | 'anc' | 'panel' | 'refresh' | 'input' | 'feature' | 'socket' | 'gone' | 'fold' | 'lens' | 'rays' | 'voice' | 'rumble' | 'dock'

/** One thing that changed, and how to show it. */
export interface DemoSpec {
  kind: DemoKind
  /** Changes with the same key replace each other, e.g. two steps of the same slider. */
  key: string
  /** Shown as a caption while it plays. */
  title: string
  note: string
  from?: number
  to?: number
  /** Id of the port, extra or feature concerned. */
  id?: string
}

/** Facts the design alone does not hold. */
export interface DemoHints {
  maxBattery?: number
}

const storageLabel = (gb: number) => (gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`)

/** The demonstrations to play for a change from one design to another. Empty if nothing invisible changed. */
export function diffDesign(a: DeviceDesign, b: DeviceDesign): DemoSpec[] {
  if (a.type !== b.type) return []
  const out: DemoSpec[] = []
  const type = b.type
  const T = TYPES[type]
  const p = a.specs
  const s = b.specs
  const add = (kind: DemoKind, key: string, title: string, note: string, extra: Partial<DemoSpec> = {}) => out.push({ kind, key, title, note, ...extra })
  if (!T.mains && p.battery !== s.battery) add('battery', 'battery', type === 'earbuds' ? 'Case battery' : 'Battery', `${batteryLabel(type, p.battery)} to ${batteryLabel(type, s.battery)}`, { from: p.battery, to: s.battery })
  if (!T.mains && p.charging !== s.charging) add(type === 'watch' ? 'puck' : 'charge', 'charging', `${chargeWatts(type, s.charging)} W charging`, s.charging > p.charging ? 'Fills faster' : 'Fills slower', { from: p.charging, to: s.charging })
  for (const e of EXTRAS) {
    const had = p.extras.includes(e.id)
    const has = s.extras.includes(e.id)
    if (had === has) continue
    const kind: DemoKind = !has ? 'gone' : e.id === 'wireless' ? 'puck' : e.id === 'ip68' ? 'water' : e.id === 'nfc' ? 'nfc' : e.id === 'sat' ? 'sat' : 'sound'
    add(kind, `extra-${e.id}`, e.name, has ? 'Added' : 'Removed', { id: e.id, to: 1 })
  }
  // a headset's picture is only ever seen through its lenses
  const hidden: DemoKind = type === 'headset' ? 'lens' : 'feature'
  if (p.panel !== s.panel) add(T.noScreen ? hidden : 'panel', 'panel', panelName(type, s.panel) ?? 'Panel', type === 'console' ? 'Video output' : type === 'headset' ? 'Displays' : 'Display panel', { from: p.panel, to: s.panel })
  if (p.refresh !== s.refresh) add(T.noScreen ? hidden : 'refresh', 'refresh', `${s.refresh} Hz`, 'Refresh rate', { from: p.refresh, to: s.refresh })
  if ((p.hinge ?? 0) !== (s.hinge ?? 0)) add('fold', 'hinge', HINGES[s.hinge ?? 0].name, 'Hinge', { from: p.hinge ?? 0, to: s.hinge ?? 0 })
  if ((p.optics ?? 0) !== (s.optics ?? 0)) add('lens', 'optics', OPTICS[s.optics ?? 0].name, 'Lenses', { from: p.optics ?? 0, to: s.optics ?? 0 })
  if ((p.mics ?? 0) !== (s.mics ?? 0)) add('voice', 'mics', MIC_ARRAYS[s.mics ?? 0].name, 'Microphones', { from: p.mics ?? 0, to: s.mics ?? 0, id: 'mics' })
  if (p.chipGen !== s.chipGen || p.chipTier !== s.chipTier || p.customChip !== s.customChip) add('chip', 'chip', s.customChip ? 'Your own chip' : chipInfo(s.chipGen, s.chipTier).name, 'Processor', { from: p.chipTier, to: s.customChip ? 2 : s.chipTier })
  if ((p.gpu ?? 0) !== (s.gpu ?? 0)) add(s.gpu ? 'gpu' : 'chip', 'gpu', GPUS[s.gpu ?? 0].name, 'Graphics', { from: p.gpu ?? 0, to: s.gpu ?? 0 })
  if (T.memory > 0 && p.ram !== s.ram) add('cells', 'ram', `${s.ram} GB`, 'Memory', { from: RAM_OPTIONS.indexOf(p.ram), to: RAM_OPTIONS.indexOf(s.ram), id: 'ram' })
  if (T.memory > 0 && p.storage !== s.storage) add('cells', 'storage', storageLabel(s.storage), 'Storage', { from: STORAGE_OPTIONS.indexOf(p.storage), to: STORAGE_OPTIONS.indexOf(s.storage), id: 'storage' })
  if ((p.cooling ?? 0) !== (s.cooling ?? 0)) add('cooling', 'cooling', COOLERS[s.cooling ?? 0].name, 'Cooling', { from: p.cooling ?? 0, to: s.cooling ?? 0 })
  if ((p.speakers ?? 0) !== (s.speakers ?? 0)) add('sound', 'speakers', SPEAKERS[s.speakers ?? 0].name, 'Speakers', { from: p.speakers ?? 0, to: s.speakers ?? 0, id: 'speakers' })
  if ((p.driver ?? 0) !== (s.driver ?? 0)) add('sound', 'driver', driverOptions(type)[s.driver ?? 0].name, type === 'speaker' ? 'Drivers' : 'Driver in each bud', { from: p.driver ?? 0, to: s.driver ?? 0, id: 'driver' })
  if ((p.anc ?? 0) !== (s.anc ?? 0)) add('anc', 'anc', s.anc ? ANC[s.anc].name : 'No noise cancelling', 'Noise cancelling', { from: p.anc ?? 0, to: s.anc ?? 0 })
  if (T.input && (p.keyboard ?? 0) !== (s.keyboard ?? 0)) {
    const kind: DemoKind = T.input === 'wands' ? 'rays' : T.input === 'controls' ? 'rumble' : 'input'
    const note = T.input === 'controller' ? 'Controller in the box' : T.input === 'wands' ? 'Controllers in the box' : T.input === 'controls' ? 'Controls' : type === 'laptop' ? 'Keyboard' : 'Keyboard in the box'
    add(kind, 'input', inputOptions(type)[s.keyboard ?? 0]?.name ?? '', note, { from: p.keyboard ?? 0, to: s.keyboard ?? 0, id: 'input' })
  }
  const before = p.io ?? []
  const now = s.io ?? []
  for (const id of new Set([...before, ...now])) {
    const had = before.includes(id)
    const has = now.includes(id)
    if (had === has) continue
    const info = ioInfo(type, id)
    if (!info) continue
    // a socket is a part on the body: when one goes, the gap it leaves is plain to see
    if (info.size && !has) continue
    // what a feature does decides how it is shown: a headset senses, a speaker listens, a handheld is held
    const shown: DemoKind = type === 'headset' ? 'rays' : type === 'speaker' ? 'voice' : type === 'handheld' && id === 'dock' ? 'dock' : type === 'handheld' && (id === 'gyro' || id === 'paddles') ? 'rumble' : 'feature'
    add(!has ? 'gone' : info.size ? 'socket' : shown, `io-${id}`, info.name, has ? 'Added' : 'Removed', { id, to: 1 })
  }
  return out
}

// ---------------------------------------------------------------- building blocks

const GREEN = '#8dffa8'
const WHITE = '#e9edf2'
const RED = '#ff5a4a'
const BLUE = '#7fc4ff'
const accent = () => themeColor('accent', '#ff6b1a')

const sat = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (x: number) => {
  const v = sat(x)
  return v * v * (3 - 2 * v)
}
/** 0 before a, 1 after b, eased between. */
const ramp = (t: number, a: number, b: number) => smooth((t - a) / (b - a))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
/** Eases past the target and settles back, like something arriving with weight. */
const settle = (x: number) => {
  const v = sat(x) - 1
  return 1 + 2.4 * v * v * v + 1.4 * v * v
}
/** Repeatable scatter: the same droplets every time. */
const rnd = (i: number, salt = 0) => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return v - Math.floor(v)
}

type Fading = THREE.Material & { opacity: number }

/** Collects what a demonstration draws, per solid of the device, and fades it all in and out together. */
class Kit {
  roots: Partial<Record<Carrier, THREE.Group>> = {}
  private mats: Fading[] = []
  on(carrier: Carrier): THREE.Group {
    let g = this.roots[carrier]
    if (!g) {
      g = this.roots[carrier] = new THREE.Group()
      g.userData.demo = true
    }
    return g
  }
  private keep<M extends Fading>(m: M, base: number): M {
    m.userData.base = base
    m.userData.k = 1
    this.mats.push(m)
    return m
  }
  /** Flat, unlit colour: light, energy, outlines. */
  glow(color: string, opacity = 1): THREE.MeshBasicMaterial {
    return this.keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), opacity)
  }
  /** A lit, solid object: a charger, a cable, a gamepad. */
  solid(color: string, roughness = 0.6, metalness = 0): THREE.MeshStandardMaterial {
    return this.keep(new THREE.MeshStandardMaterial({ color, roughness, metalness, transparent: true }), 1)
  }
  line(color: string, opacity = 1): THREE.LineBasicMaterial {
    return this.keep(new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }), opacity)
  }
  fade(a: number) {
    for (const m of this.mats) m.opacity = (m.userData.base as number) * (m.userData.k as number) * a
  }
}

/** Sets how strongly one material shows, between 0 and 1, on top of the overall fade. */
const show = (m: THREE.Material, k: number) => (m.userData.k = sat(k))

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, mat)
  o.position.set(x, y, z)
  o.raycast = () => {}
  return o
}

function outline(w: number, h: number, mat: THREE.Material): THREE.LineLoop {
  const pts = [new THREE.Vector3(-w / 2, -h / 2, 0), new THREE.Vector3(w / 2, -h / 2, 0), new THREE.Vector3(w / 2, h / 2, 0), new THREE.Vector3(-w / 2, h / 2, 0)]
  const o = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat)
  o.raycast = () => {}
  return o
}

/** Rings that spread from a point, one after another. Returns the function that moves them. */
function pulses(k: Kit, parent: THREE.Object3D, count: number, color: string, r0: number, r1: number, period: number, arc?: [number, number]) {
  const geo = arc ? new THREE.RingGeometry(0.9, 1, 40, 1, arc[0], arc[1]) : new THREE.RingGeometry(0.93, 1, 56)
  const rings = Array.from({ length: count }, () => {
    const o = mesh(geo, k.glow(color, 0.9))
    parent.add(o)
    return o
  })
  return (t: number, strength = 1, inward = false) => {
    rings.forEach((o, i) => {
      const raw = (((t / period + i / count) % 1) + 1) % 1
      const ph = inward ? 1 - raw : raw
      o.scale.setScalar(lerp(r0, r1, ph))
      show(o.material as THREE.Material, strength * Math.min(1, raw * 8) * (1 - raw))
    })
  }
}

interface Ctx {
  d: DeviceDesign
  spec: DemoSpec
  hints: DemoHints
  /** 1 for a phone, larger for larger devices: sizes of props follow it. */
  u: number
  /** Radius of the whole model. */
  radius: number
  /** How far flat things float above a surface. */
  gap: number
  solid(carrier: Carrier): Body
}

/** What a builder returns: how to move things at time t (seconds), and optionally how long it runs. */
type Play = (t: number) => void
interface Built {
  play: Play
  duration?: number
  /** Design face that should be turned towards the camera. */
  face?: Face
  xray?: number
  /** How the model itself moves: see Demo.pose. */
  pose?: (t: number) => Pose
}

/** What a demonstration does to the model itself rather than draws on it. */
export interface Pose {
  /** A foldable: how far to swing from the way it is being shown (open or shut) towards the other, 0 to 1. */
  fold?: number
  /** Sideways shake of the whole device, mm. */
  shake?: number
}

const mainCarrier = (d: DeviceDesign): Carrier => (d.type === 'laptop' ? 'base' : 'body')
/** Where things held up to the back of a device should aim, across its width: a foldable's back is half cover screen. */
const backCentre = (d: DeviceDesign) => (d.type === 'foldable' && !isFlip(d.body) ? d.body.width / 4 : 0)
const screenCarrier = (d: DeviceDesign): Carrier => (d.type === 'laptop' ? 'lid' : 'body')

/**
 * The flat sheet the insides are drawn on: across the two largest dimensions of
 * the main solid, so a phone shows them through its back and a console through its lid.
 */
function insides(k: Kit, x: Ctx): { g: THREE.Group; w: number; h: number; d: number } {
  const carrier = mainCarrier(x.d)
  const s = x.solid(carrier)
  const g = new THREE.Group()
  k.on(carrier).add(g)
  if (s.thickness > s.height && s.width >= s.height) {
    g.rotation.x = -Math.PI / 2
    return { g, w: s.width, h: s.thickness, d: s.height }
  }
  if (s.thickness > s.width) {
    g.rotation.y = Math.PI / 2
    return { g, w: s.thickness, h: s.height, d: s.width }
  }
  return { g, w: s.width, h: s.height, d: s.thickness }
}

/** Faint outlines of the main board and the battery, so the lit component has somewhere to be. */
function boardOutline(k: Kit, x: Ctx, p: { g: THREE.Group; w: number; h: number }, battery = true) {
  const faint = k.line(WHITE, 0.28)
  const board = outline(p.w * 0.8, p.h * 0.3, faint)
  board.position.y = p.h * 0.27
  p.g.add(board)
  if (battery && !TYPES[x.d.type].mains) {
    const cell = outline(p.w * 0.62, p.h * 0.34, faint)
    cell.position.y = -p.h * 0.25
    p.g.add(cell)
  }
}

// ---------------------------------------------------------------- the demonstrations

function puck(k: Kit, x: Ctx): Built {
  const s = x.solid('body')
  const u = x.u
  const g = k.on('body')
  const ac = accent()
  if (x.d.type === 'earbuds') {
    // a charging mat appears on the desk under the case
    const flat = new THREE.Group()
    flat.rotation.x = -Math.PI / 2
    flat.position.y = -s.height / 2 - 0.12
    g.add(flat)
    const r = Math.max(s.width, s.thickness) * 0.78
    const pad = mesh(new THREE.CircleGeometry(r, 56), k.solid('#d6d9de', 0.55))
    const mark = mesh(new THREE.RingGeometry(r * 0.5, r * 0.56, 56), k.glow(ac, 0.9), 0, 0, 0.05)
    flat.add(pad, mark)
    const wave = pulses(k, flat, 3, GREEN, r * 0.6, r * 1.5, 0.9)
    flat.children.slice(2).forEach((o) => (o.position.z = 0.06))
    return {
      duration: 2.2,
      play: (t) => {
        pad.scale.setScalar(settle(t / 0.45))
        mark.scale.copy(pad.scale)
        wave(t - 0.4, ramp(t, 0.4, 0.6))
      },
    }
  }
  const offset = backCentre(x.d)
  const r = Math.min(s.width - 2 * Math.abs(offset), s.height) * (x.d.type === 'watch' ? 0.36 : 0.3)
  const thick = 5 * u
  const p = new THREE.Group()
  const disc = new THREE.CylinderGeometry(r, r * 0.94, thick, 48)
  disc.rotateX(Math.PI / 2)
  const white = k.solid('#d6d9de', 0.5)
  p.add(mesh(disc, white), mesh(new THREE.RingGeometry(r * 0.52, r * 0.6, 48), k.glow(ac, 0.9), 0, 0, thick / 2 + 0.05), mesh(new THREE.RingGeometry(r * 0.52, r * 0.6, 48), k.glow(ac, 0.9), 0, 0, -thick / 2 - 0.05))
  p.add(mesh(new THREE.CylinderGeometry(1.5 * u, 1.5 * u, 120 * u, 12), white, 0, -r - 60 * u, 0))
  g.add(p)
  const face = new THREE.Group()
  const y0 = -s.height * 0.04
  face.position.set(offset, y0, -s.thickness / 2 - x.gap)
  g.add(face)
  const wave = pulses(k, face, 3, GREEN, r * 0.7, r * 1.9, 0.8)
  const touch = -s.thickness / 2 - thick / 2 - 0.5
  const D = 2.4
  return {
    duration: D,
    face: 'back',
    play: (t) => {
      const arrive = settle(t / 0.55)
      const leave = ramp(t, D - 0.7, D - 0.1)
      p.position.set(offset, y0 - 40 * u * (1 - arrive) - 70 * u * leave * leave, touch - 80 * u * (1 - arrive) - 50 * u * leave)
      wave(t - 0.5, ramp(t, 0.5, 0.7) * (1 - ramp(t, D - 0.8, D - 0.6)))
    },
  }
}

function charge(k: Kit, x: Ctx): Built {
  const d = x.d
  const u = x.u
  const port = d.parts.find((p) => p.kind === 'port' && (!p.text || ['usbc', 'usbc2', 'thunder', 'power'].includes(p.text)))
  let face: Face = port?.face ?? (d.type === 'laptop' ? 'left' : 'bottom')
  let px = port?.x ?? 0
  let py = port?.y ?? 0
  if (d.type === 'earbuds' && face === 'bottom') {
    // the case stands on its port, so the cable is shown going in low at the back
    face = 'back'
    px = 0
    py = -x.solid('body').height * 0.22
  }
  const m = mountOf(d.type, face)
  const holder = new THREE.Group()
  placeOnFace(holder, x.solid(m.carrier), d.type, m.face, px, py, 0)
  k.on(m.carrier).add(holder)
  const plug = new THREE.Group()
  const shell = k.solid('#d6d9de', 0.5)
  const cable = new THREE.CylinderGeometry(1.3 * u, 1.3 * u, 150 * u, 12)
  cable.rotateX(Math.PI / 2)
  plug.add(mesh(new THREE.BoxGeometry(7 * u, 2 * u, 5 * u), k.solid('#b9bcc2', 0.3, 1), 0, 0, 0), mesh(new THREE.BoxGeometry(10 * u, 4.4 * u, 12 * u), shell, 0, 0, 8.5 * u), mesh(cable, shell, 0, 0, 14 * u + 75 * u))
  holder.add(plug)

  // the charge shows as a level rising up the screen, and up the back
  const sc = screenCarrier(d)
  const s = x.solid(sc)
  const rect = TYPES[d.type].noScreen ? { w: s.width * 0.7, h: s.height * 0.6, cx: 0, cy: 0 } : screenRect(s)
  const fills = [1, -1].map((side) => {
    const geo = new THREE.PlaneGeometry(rect.w, rect.h)
    geo.translate(0, rect.h / 2, 0)
    const o = mesh(geo, k.glow(GREEN, 0.24), rect.cx, rect.cy - rect.h / 2, side * (s.thickness / 2 + x.gap))
    k.on(sc).add(o)
    return o
  })
  const level = k.glow(GREEN, 0.95)
  const tops = fills.map((f) => {
    const o = mesh(new THREE.PlaneGeometry(rect.w, Math.max(0.6, rect.h * 0.012)), level, rect.cx, 0, f.position.z * 1.001)
    k.on(sc).add(o)
    return o
  })
  // more watts, faster fill
  const fillTime = 1.5 / (1 + 0.16 * (x.spec.to ?? 0))
  const D = 2.5
  return {
    duration: D,
    play: (t) => {
      plug.position.z = 60 * u * (1 - settle(t / 0.5)) + 80 * u * ramp(t, D - 0.5, D) - 2.5 * u
      const f = Math.max(0.001, ramp(t, 0.5, 0.5 + fillTime))
      fills.forEach((o, i) => {
        o.scale.y = f
        tops[i].position.y = rect.cy - rect.h / 2 + rect.h * f
      })
      show(level, t > 0.5 ? 1 : 0)
    },
  }
}

function water(k: Kit, x: Ctx): Built {
  const s = x.solid('body')
  const small = x.d.type === 'watch' || x.d.type === 'earbuds'
  const per = small ? 14 : 26
  const mat = k.solid('#cfe9ff', 0.04)
  mat.opacity = 0.72
  mat.userData.base = 0.72
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), mat, per * 2)
  drops.raycast = () => {}
  drops.frustumCulled = false
  k.on('body').add(drops)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const fall = s.height * 3.2
  return {
    duration: 2.6,
    play: (t) => {
      for (let i = 0; i < per * 2; i++) {
        const side = i < per ? 1 : -1
        const size = (0.9 + 1.5 * rnd(i, 3)) * x.u * (small ? 0.55 : 1)
        const born = rnd(i, 4) * 0.5
        const lets = 1 + rnd(i, 5) * 0.5
        const grow = settle((t - born) / 0.22)
        const dt = Math.max(0, t - lets)
        const y = (rnd(i, 2) - 0.5) * s.height * 0.8 - 0.5 * fall * dt * dt
        const gone = t < born || y < -s.height / 2 - 4 * x.u
        // a bead sits flat against the glass and stretches as it runs
        pos.set((rnd(i, 1) - 0.5) * s.width * 0.82, y, side * (s.thickness / 2 + size * 0.28))
        scl.set(size, size * (1 + Math.min(1.6, dt * 3)), size * 0.45).multiplyScalar(gone ? 0 : grow)
        drops.setMatrixAt(i, m4.compose(pos, q, scl))
      }
      drops.instanceMatrix.needsUpdate = true
    },
  }
}

function nfc(k: Kit, x: Ctx): Built {
  const s = x.solid('body')
  const u = x.u * (x.d.type === 'tablet' ? 0.7 : 1)
  const g = k.on('body')
  const reader = new THREE.Group()
  const lamp = k.glow(accent(), 0.95)
  // a card reader held up to the back, small enough that the rings show around it
  reader.add(mesh(new THREE.BoxGeometry(30 * u, 42 * u, 7 * u), k.solid('#2a2e35', 0.5)), mesh(new THREE.BoxGeometry(6 * u, 60 * u, 5 * u), k.solid('#2a2e35', 0.5), 0, -50 * u, 0))
  for (const side of [1, -1]) reader.add(mesh(new THREE.PlaneGeometry(20 * u, 10 * u), lamp, 0, 10 * u, side * 3.6 * u))
  reader.rotation.x = 0.2
  g.add(reader)
  const cy = -s.height * 0.08
  const air = new THREE.Group()
  const offset = backCentre(x.d)
  air.position.set(offset, cy, -s.thickness / 2 - x.gap * 2)
  g.add(air)
  const wave = pulses(k, air, 3, accent(), 12 * u, 46 * u, 0.7)
  const D = 2.2
  return {
    duration: D,
    face: 'back',
    play: (t) => {
      const near = settle(t / 0.5) - ramp(t, D - 0.6, D - 0.05)
      reader.position.set(offset, cy - 40 * u * (1 - near), -s.thickness / 2 - 20 * u - 90 * u * (1 - near))
      wave(t - 0.45, ramp(t, 0.45, 0.6) * (1 - ramp(t, 1.25, 1.4)))
      // the reader's lamp turns green once the tap is read
      lamp.color.set(t > 1.25 ? GREEN : accent())
    },
  }
}

function satellite(k: Kit, x: Ctx): Built {
  const s = x.solid('body')
  const u = x.u
  const g = k.on('body')
  const from = new THREE.Vector3(s.width * 0.28, s.height / 2 + 2 * u, 0)
  const to = new THREE.Vector3(s.width / 2 + 58 * u, s.height / 2 - 8 * u, 0)
  const craft = new THREE.Group()
  craft.add(mesh(new THREE.BoxGeometry(8 * u, 6 * u, 6 * u), k.solid('#c9ccd1', 0.4, 0.6)))
  for (const side of [-1, 1]) craft.add(mesh(new THREE.BoxGeometry(12 * u, 5 * u, 0.6 * u), k.glow(BLUE, 0.9), side * 11 * u, 0, 0))
  craft.position.copy(to)
  g.add(craft)
  const dir = to.clone().sub(from)
  const dash = new THREE.BoxGeometry(5 * u, 1.1 * u, 1.1 * u)
  const dashes = Array.from({ length: 7 }, () => {
    const o = mesh(dash, k.glow(accent(), 0.95))
    o.rotation.z = Math.atan2(dir.y, dir.x)
    g.add(o)
    return o
  })
  const at = new THREE.Group()
  at.position.copy(from)
  g.add(at)
  const wave = pulses(k, at, 2, accent(), 3 * u, 14 * u, 0.7)
  return {
    duration: 2.4,
    play: (t) => {
      craft.rotation.z = Math.sin(t * 1.4) * 0.18
      craft.position.set(to.x, to.y + Math.sin(t * 2) * 1.5 * u, 0)
      dashes.forEach((o, i) => {
        const ph = (t * 0.9 + i / dashes.length) % 1
        o.position.copy(from).addScaledVector(dir, 0.08 + ph * 0.8)
        show(o.material as THREE.Material, Math.sin(ph * Math.PI) * ramp(t, 0.2, 0.5))
      })
      wave(t, 1)
    },
  }
}

function sound(k: Kit, x: Ctx): Built {
  const d = x.d
  const carrier = mainCarrier(d)
  const s = x.solid(carrier)
  const g = k.on(carrier)
  const lists = { speakers: SPEAKERS.length, driver: driverOptions(d.type).length }
  const power = x.spec.id === 'speakers' || x.spec.id === 'driver' ? (x.spec.to ?? 0) / (lists[x.spec.id] - 1) : 0.5
  // where the sound comes out, and which way it goes
  let sources: { at: THREE.Vector3; angle: number }[]
  let reach = Math.min(s.width, s.height) * (0.3 + 0.25 * power)
  const z = d.type === 'laptop' ? s.thickness / 2 + 2 : 0
  if (d.type === 'earbuds') {
    const at = looseBudAt(d.body)
    sources = [{ at, angle: 0 }, { at, angle: Math.PI }]
    reach = 14 + 16 * power
  } else if (d.type === 'phone' || d.type === 'tablet' || d.type === 'foldable') {
    sources = [{ at: new THREE.Vector3(0, s.height / 2, 0), angle: Math.PI / 2 }, { at: new THREE.Vector3(0, -s.height / 2, 0), angle: -Math.PI / 2 }]
    reach = s.width * 0.5
  } else if (d.type === 'speaker') {
    // a speaker throws its sound out sideways, low down where the woofer is: further with bigger drivers
    sources = [{ at: new THREE.Vector3(s.width / 2, -s.height * 0.12, 0), angle: 0 }, { at: new THREE.Vector3(-s.width / 2, -s.height * 0.12, 0), angle: Math.PI }]
    reach = Math.max(s.width, s.height) * (0.35 + 0.45 * power)
  } else {
    sources = [{ at: new THREE.Vector3(s.width / 2, d.type === 'laptop' ? 0 : -s.height * 0.22, z), angle: 0 }, { at: new THREE.Vector3(-s.width / 2, d.type === 'laptop' ? 0 : -s.height * 0.22, z), angle: Math.PI }]
  }
  const waves = sources.map((src) => {
    const o = new THREE.Group()
    o.position.copy(src.at)
    o.rotation.z = src.angle
    g.add(o)
    return pulses(k, o, 3, accent(), reach * 0.18, reach, 0.75, [-0.6, 1.2])
  })
  // a woofer, or a screen that is itself the speaker, also pushes sound out of the middle
  const middle = x.spec.id === 'speakers' && (x.spec.to ?? 0) >= 2 ? new THREE.Group() : null
  if (middle) {
    middle.position.set(0, 0, (x.spec.to === 4 ? 1 : -1) * (s.thickness / 2 + x.gap))
    g.add(middle)
  }
  const boom = middle ? pulses(k, middle, 2, accent(), reach * 0.15, reach * 0.8, 1.1) : null
  return {
    duration: 2,
    play: (t) => {
      waves.forEach((w) => w(t, 0.55 + 0.45 * power))
      boom?.(t, 0.8)
    },
  }
}

function battery(k: Kit, x: Ctx): Built {
  const p = insides(k, x)
  boardOutline(k, x, p, false)
  const most = Math.max(x.hints.maxBattery ?? 0, x.spec.from ?? 0, x.spec.to ?? 0, 1)
  const full = p.h * 0.56
  const share = (v: number) => lerp(0.14, 1, sat(v / most)) * full
  const bw = p.w * 0.64
  const box = new THREE.BoxGeometry(bw, 1, Math.max(0.6, p.d * 0.5))
  box.translate(0, 0.5, 0)
  const cell = new THREE.Group()
  cell.position.y = -p.h * 0.44
  cell.add(mesh(box, k.glow(GREEN, 0.26)), new THREE.LineSegments(new THREE.EdgesGeometry(box), k.line(GREEN, 0.95)))
  p.g.add(cell)
  // where it was before, and the room there is
  const was = outline(bw, 0.001, k.line(WHITE, 0.7))
  was.position.y = cell.position.y + share(x.spec.from ?? 0)
  const room = outline(bw * 1.04, full * 1.02, k.line(WHITE, 0.25))
  room.position.y = cell.position.y + full / 2
  const cap = mesh(new THREE.BoxGeometry(bw * 0.16, p.h * 0.012, Math.max(0.5, p.d * 0.3)), k.glow(GREEN, 0.9))
  p.g.add(was, room, cap)
  return {
    duration: 2.3,
    xray: 1,
    play: (t) => {
      const h = lerp(share(x.spec.from ?? 0), share(x.spec.to ?? 0), settle((t - 0.5) / 0.8))
      cell.scale.y = Math.max(0.01, h)
      cap.position.y = cell.position.y + h + p.h * 0.008
    },
  }
}

function chip(k: Kit, x: Ctx): Built {
  const p = insides(k, x)
  boardOutline(k, x, p)
  const ac = accent()
  const tier = x.spec.to ?? 1
  const size = Math.min(p.w, p.h) * (0.11 + 0.025 * tier)
  const at = new THREE.Group()
  at.position.set(-p.w * 0.14, p.h * 0.27, 0)
  p.g.add(at)
  const die = k.glow(ac, 0.85)
  at.add(mesh(new THREE.PlaneGeometry(size, size), k.glow('#15171b', 0.9)), mesh(new THREE.PlaneGeometry(size * 0.56, size * 0.56), die, 0, 0, 0.05), outline(size, size, k.line(ac, 1)))
  // tracks leave the chip on all four sides, with signals running along them
  const tracks: { o: THREE.Mesh; dir: THREE.Vector3; from: THREE.Vector3; len: number }[] = []
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < 3; i++) {
      const dir = new THREE.Vector3(side === 0 ? 1 : side === 1 ? -1 : 0, side === 2 ? 1 : side === 3 ? -1 : 0, 0)
      const across = new THREE.Vector3(-dir.y, dir.x, 0)
      const from = dir.clone().multiplyScalar(size / 2).addScaledVector(across, (i - 1) * size * 0.3)
      const len = size * (side < 2 ? 1.5 : 0.7)
      const track = mesh(new THREE.PlaneGeometry(dir.x ? len : size * 0.03, dir.x ? size * 0.03 : len), k.glow(ac, 0.35))
      track.position.copy(from).addScaledVector(dir, len / 2)
      const o = mesh(new THREE.PlaneGeometry(size * 0.1, size * 0.1), k.glow(WHITE, 1), 0, 0, 0.06)
      at.add(track, o)
      tracks.push({ o, dir, from, len })
    }
  }
  const speed = 1 + 0.5 * tier
  return {
    duration: 2.1,
    xray: 1,
    play: (t) => {
      show(die, 0.55 + 0.45 * Math.sin(t * 9))
      tracks.forEach((tr, i) => {
        const ph = (t * speed + rnd(i)) % 1
        tr.o.position.copy(tr.from).addScaledVector(tr.dir, ph * tr.len)
        tr.o.position.z = 0.06
        show(tr.o.material as THREE.Material, t > 0.35 ? 1 - ph : 0)
      })
    },
  }
}

/** A fan drawn flat: a ring and blades that turn. */
function fan(k: Kit, parent: THREE.Object3D, r: number, color: string): THREE.Group {
  const hub = new THREE.Group()
  const blade = k.glow(color, 0.55)
  for (let i = 0; i < 5; i++) {
    const b = mesh(new THREE.PlaneGeometry(r * 0.3, r * 0.78), blade, 0, r * 0.45, 0)
    const arm = new THREE.Group()
    arm.rotation.z = (i / 5) * Math.PI * 2
    arm.add(b)
    hub.add(arm)
  }
  const frame = new THREE.Group()
  frame.add(hub, mesh(new THREE.RingGeometry(r * 0.94, r, 48), k.glow(color, 0.95)))
  parent.add(frame)
  frame.userData.hub = hub
  return frame
}

function gpu(k: Kit, x: Ctx): Built {
  const p = insides(k, x)
  boardOutline(k, x, p)
  const ac = accent()
  const tier = x.spec.to ?? 1
  const w = p.w * (0.3 + 0.06 * tier)
  const h = Math.min(p.h * 0.2, w * 0.42)
  const card = new THREE.Group()
  card.position.set(p.w * 0.08, p.h * 0.27, 0)
  p.g.add(card)
  card.add(mesh(new THREE.PlaneGeometry(w, h), k.glow('#15171b', 0.9)), outline(w, h, k.line(ac, 1)))
  const fanCount = tier >= 2 ? 2 : 1
  const fans = Array.from({ length: fanCount }, (_, i) => {
    const f = fan(k, card, h * 0.4, ac)
    f.position.set((i - (fanCount - 1) / 2) * w * 0.44, 0, 0.05)
    return f.userData.hub as THREE.Group
  })
  return {
    duration: 2.1,
    xray: 1,
    play: (t) => {
      card.scale.setScalar(settle(t / 0.5))
      fans.forEach((f) => (f.rotation.z = -t * (5 + 3 * tier)))
    },
  }
}

/** Memory and storage: a row of cells that fill one by one, more of them for more capacity. */
function cells(k: Kit, x: Ctx): Built {
  const p = insides(k, x)
  boardOutline(k, x, p)
  const ram = x.spec.id === 'ram'
  const total = ram ? RAM_OPTIONS.length : STORAGE_OPTIONS.length
  const lit = (x.spec.to ?? 0) + 1
  const was = (x.spec.from ?? 0) + 1
  const cw = (p.w * 0.6) / total
  const ch = ram ? p.h * 0.09 : p.h * 0.05
  const row = new THREE.Group()
  row.position.set(0, p.h * (ram ? 0.31 : 0.2), 0)
  p.g.add(row)
  const frame = k.line(WHITE, 0.5)
  const fills = Array.from({ length: total }, (_, i) => {
    const cx = (i - (total - 1) / 2) * cw
    const cell = outline(cw * 0.78, ch, frame)
    cell.position.x = cx
    const fill = mesh(new THREE.PlaneGeometry(cw * 0.78, ch), k.glow(ram ? accent() : BLUE, 0.9), cx, 0, 0.05)
    row.add(cell, fill)
    return fill.material as THREE.Material
  })
  return {
    duration: 2,
    xray: 1,
    play: (t) =>
      fills.forEach((m, i) => {
        // cells that were already fitted stay lit; new ones light in turn, removed ones go out
        const on = i < lit ? (i < was ? 1 : ramp(t, 0.45 + (i - was) * 0.09, 0.55 + (i - was) * 0.09)) : i < was ? 1 - ramp(t, 0.45, 0.8) : 0
        show(m, on)
      }),
  }
}

function cooling(k: Kit, x: Ctx): Built {
  const p = insides(k, x)
  boardOutline(k, x, p)
  const level = x.spec.to ?? 0
  const count = [1, 2, 1, 2][level] ?? 1
  const r = Math.min(p.w, p.h) * 0.15
  const y = -p.h * 0.02
  const hubs = Array.from({ length: count }, (_, i) => {
    const f = fan(k, p.g, r, BLUE)
    f.position.set((i - (count - 1) / 2) * p.w * 0.36, y, 0)
    return f
  })
  // a vapour chamber is a plate over the chips; a liquid loop is a pipe with something running round it
  const plate = level >= 2 ? k.glow(BLUE, 0.3) : null
  if (plate) p.g.add(mesh(new THREE.PlaneGeometry(p.w * 0.5, p.h * 0.2), plate, 0, p.h * 0.27, 0.04), outline(p.w * 0.5, p.h * 0.2, k.line(BLUE, 0.9)).translateY(p.h * 0.27))
  const lw = p.w * 0.66
  const lh = p.h * 0.5
  const bead = level >= 3 ? mesh(new THREE.PlaneGeometry(r * 0.3, r * 0.3), k.glow(WHITE, 1), 0, 0, 0.08) : null
  if (bead) p.g.add(bead, outline(lw, lh, k.line(BLUE, 0.7)).translateY(p.h * 0.1))
  const streak = new THREE.PlaneGeometry(r * 0.08, r * 0.5)
  const air = hubs.flatMap((f, n) =>
    Array.from({ length: 5 }, (_, i) => {
      const o = mesh(streak, k.glow(WHITE, 0.8))
      p.g.add(o)
      return { o, x: f.position.x + (i - 2) * r * 0.36, ph: rnd(i + n * 5) }
    }),
  )
  return {
    duration: 2.3,
    xray: 1,
    play: (t) => {
      hubs.forEach((f) => ((f.userData.hub as THREE.Group).rotation.z = -t * (7 + 2.5 * level)))
      if (plate) show(plate, 0.6 + 0.4 * Math.sin(t * 6))
      if (bead) {
        // once round the loop every second and a half
        const d = ((t / 1.5) % 1) * 2 * (lw + lh)
        const bx = d < lw ? d - lw / 2 : d < lw + lh ? lw / 2 : d < 2 * lw + lh ? lw / 2 - (d - lw - lh) : -lw / 2
        const by = d < lw ? lh / 2 : d < lw + lh ? lh / 2 - (d - lw) : d < 2 * lw + lh ? -lh / 2 : -lh / 2 + (d - 2 * lw - lh)
        bead.position.set(bx, by + p.h * 0.1, 0.08)
      }
      for (const a of air) {
        const ph = (t * (0.9 + 0.2 * level) + a.ph) % 1
        a.o.position.set(a.x, y - r * 1.1 - ph * p.h * 0.3, 0.02)
        show(a.o.material as THREE.Material, Math.sin(ph * Math.PI) * ramp(t, 0.2, 0.5))
      }
    },
  }
}

function anc(k: Kit, x: Ctx): Built {
  const g = k.on('body')
  const R = x.radius
  const level = x.spec.to ?? 0
  const strength = level / (ANC.length - 1)
  const centre = new THREE.Group()
  centre.position.y = x.solid('body').height * 0.2
  g.add(centre)
  const wall = 0.52 * R
  // seen from the front and from above
  const planes = [0, 1].map((i) => {
    const o = new THREE.Group()
    if (i) o.rotation.x = Math.PI / 2
    centre.add(o)
    return o
  })
  const ring = new THREE.RingGeometry(0.955, 1, 64)
  const noise = planes.flatMap((pl) =>
    Array.from({ length: 4 }, (_, i) => {
      const o = mesh(ring, k.glow(RED, 0.85))
      pl.add(o)
      return { o, ph: i / 4 }
    }),
  )
  const shield = level ? k.glow(accent(), 0.95) : null
  if (shield) planes.forEach((pl) => pl.add(mesh(new THREE.RingGeometry(wall * 0.93, wall, 64), shield)))
  return {
    duration: 2.4,
    play: (t) => {
      for (const n of noise) {
        const ph = (t * 0.55 + n.ph) % 1
        const r = lerp(1.12 * R, 0.14 * R, ph)
        n.o.scale.setScalar(r)
        // noise that reaches the wall is cancelled; the better the system, the less gets through
        const inside = level > 0 && r < wall
        show(n.o.material as THREE.Material, Math.min(1, ph * 6) * (inside ? (1 - strength) * 0.5 * (r / wall) : 1 - ph * 0.3))
      }
      if (shield) show(shield, 0.65 + 0.35 * Math.sin(t * 11))
    },
  }
}

function panel(k: Kit, x: Ctx): Built {
  const carrier = screenCarrier(x.d)
  const s = x.solid(carrier)
  const r = screenRect(s)
  const g = new THREE.Group()
  g.position.set(r.cx, r.cy, s.thickness / 2 + x.gap * 1.5)
  k.on(carrier).add(g)
  const wash = k.glow(WHITE, 0.3)
  const bw = r.w * 0.16
  const bar = mesh(new THREE.PlaneGeometry(bw, r.h), k.glow(WHITE, 0.45), 0, 0, 0.02)
  g.add(mesh(new THREE.PlaneGeometry(r.w, r.h), wash), bar, outline(r.w, r.h, k.line(accent(), 1)))
  return {
    duration: 1.8,
    face: 'front',
    play: (t) => {
      show(wash, Math.max(0, Math.sin(t * 5.5)) * (1 - ramp(t, 0.9, 1.2)))
      bar.position.x = lerp(-r.w / 2 + bw / 2, r.w / 2 - bw / 2, ramp(t, 0.25, 1.35))
      show(bar.material as THREE.Material, Math.sin(sat((t - 0.25) / 1.1) * Math.PI))
    },
  }
}

function refresh(k: Kit, x: Ctx): Built {
  const carrier = screenCarrier(x.d)
  const s = x.solid(carrier)
  const r = screenRect(s)
  const g = new THREE.Group()
  g.position.set(r.cx, r.cy - r.h * 0.06, s.thickness / 2 + x.gap * 1.5)
  k.on(carrier).add(g)
  const hz = x.spec.to ?? 60
  // the same sweep takes more, smaller steps at a higher rate
  const steps = Math.round((hz / 60) * 6)
  const size = Math.min(r.w, r.h) * 0.09
  const span = r.w * 0.78 - size
  const band = mesh(new THREE.PlaneGeometry(r.w * 0.86, size * 1.9), k.glow('#0b0c0f', 0.72))
  const dots = Array.from({ length: 5 }, (_, i) => mesh(new THREE.PlaneGeometry(size, size), k.glow(i ? WHITE : accent(), i ? 0.5 / i : 1), 0, 0, 0.03 + 0.002 * (5 - i)))
  g.add(band, outline(r.w * 0.86, size * 1.9, k.line(accent(), 0.9)), ...dots)
  return {
    duration: 2.2,
    face: 'front',
    play: (t) => {
      const phase = (t * 0.85) % 2
      const way = phase < 1 ? phase : 2 - phase
      const step = Math.round(way * steps)
      // the lit square, and the frames just before it trailing behind
      dots.forEach((o, i) => (o.position.x = (sat((step + (phase < 1 ? -i : i)) / steps) - 0.5) * span))
    },
  }
}

function input(k: Kit, x: Ctx): Built {
  const d = x.d
  const level = x.spec.to ?? 0
  if (d.type === 'laptop') {
    const s = x.solid('base')
    const deck = laptopDeck(d.body)
    const g = new THREE.Group()
    g.position.set(deck.x, deck.y, s.thickness / 2 + 2.6)
    k.on('base').add(g)
    const cols = 12
    const strips = Array.from({ length: cols }, (_, i) => {
      const o = mesh(new THREE.PlaneGeometry((deck.w / cols) * 0.92, deck.h), k.glow(accent(), 0.55), (i - (cols - 1) / 2) * (deck.w / cols), 0, 0)
      g.add(o)
      return o.material as THREE.Material
    })
    g.add(outline(deck.w + 4, deck.h + 4, k.line(accent(), 0.9)))
    return {
      duration: 1.9,
      play: (t) => strips.forEach((m, i) => show(m, Math.exp(-Math.pow((i / cols - ((t * 0.9) % 1.25) + 0.1) * 5, 2)))),
    }
  }
  // the keyboard or gamepad sold with it is set down on the desk in front
  const s = x.solid('body')
  const desk = d.type === 'console' ? -s.height / 2 - 2.6 : -s.height / 2 - standLift(d.body, d.type)
  const prop = new THREE.Group()
  const dark = k.solid('#202327', 0.55)
  let rest: number
  if (d.type === 'console') {
    const grip = new THREE.SphereGeometry(24, 24, 16)
    prop.add(mesh(new THREE.BoxGeometry(92, 20, 46), dark, 0, 14, 0))
    for (const side of [-1, 1]) {
      const o = mesh(grip, dark, side * 50, 12, 12)
      o.scale.set(1, 0.62, 1.3)
      prop.add(o, mesh(new THREE.CylinderGeometry(8, 9, 9, 24), k.solid('#101114', 0.8), side * 24, 27, 8))
    }
    prop.add(mesh(new THREE.BoxGeometry(18, 3, 6), k.solid('#101114', 0.8), -46, 25, -8), mesh(new THREE.BoxGeometry(6, 3, 18), k.solid('#101114', 0.8), -46, 25, -8))
    const lamp = k.glow(accent(), 1)
    for (const [bx, bz] of [[0, -7], [7, 0], [0, 7], [-7, 0]]) prop.add(mesh(new THREE.CylinderGeometry(3.2, 3.2, 3, 16), lamp, 46 + bx, 25, -8 + bz))
    rest = s.thickness / 2 + 62
  } else {
    const kw = Math.min(s.width * 0.6, 340)
    const kd = kw * 0.3
    prop.add(mesh(new THREE.BoxGeometry(kw, 7, kd), k.solid(d.body.frameColor, 0.5, 0.4), 0, 3.5, 0))
    const cols = 15
    const keys = new THREE.InstancedMesh(new THREE.BoxGeometry((kw / cols) * 0.8, 2.4, (kd / 5) * 0.72), level >= 3 ? k.glow(WHITE, 0.5) : dark, cols * 5)
    keys.raycast = () => {}
    const m4 = new THREE.Matrix4()
    for (let i = 0; i < cols * 5; i++) keys.setMatrixAt(i, m4.makeTranslation(((i % cols) - (cols - 1) / 2) * (kw / cols) * 0.96, 8 + (level === 2 ? 1 : 0), (Math.floor(i / cols) - 2) * (kd / 5) * 0.92))
    prop.add(keys)
    rest = s.thickness / 2 + Math.max(150, s.height * 0.46)
  }
  k.on('body').add(prop)
  const D = 2.3
  return {
    duration: D,
    face: 'front',
    play: (t) => {
      const down = settle(t / 0.5)
      // better gamepads shake harder
      const shake = d.type === 'console' && level > 0 && t > 0.9 && t < 1.5 ? Math.sin(t * 95) * 0.5 * level : 0
      prop.position.set(shake, desk + 60 * (1 - down) * (1 - down), rest + 40 * (1 - down) + 50 * ramp(t, D - 0.4, D))
      prop.rotation.x = 0.25 * (1 - down)
    },
  }
}

function feature(k: Kit, x: Ctx): Built {
  if (x.d.type === 'watch') {
    // health sensors read through the back of the case: green light against the skin
    const s = x.solid('body')
    const g = new THREE.Group()
    // clear of the sensor window, which stands a little proud of the case
    g.position.z = -s.thickness / 2 - 2.6
    k.on('body').add(g)
    const r = Math.min(s.width, s.height) * 0.3
    const lamps = [0, 1, 2, 3].map((i) => mesh(new THREE.CircleGeometry(r * 0.16, 20), k.glow(GREEN, 1), Math.cos((i * Math.PI) / 2) * r * 0.5, Math.sin((i * Math.PI) / 2) * r * 0.5, 0))
    g.add(...lamps)
    const wave = pulses(k, g, 3, GREEN, r * 0.5, r * 1.7, 0.8)
    return { duration: 2, face: 'back', play: (t) => (wave(t, 1), lamps.forEach((o, i) => show(o.material as THREE.Material, 0.5 + 0.5 * Math.sin(t * 10 + i * 1.6)))) }
  }
  const p = insides(k, x)
  boardOutline(k, x, p)
  const size = Math.min(p.w, p.h) * 0.1
  const at = new THREE.Group()
  at.position.set(p.w * 0.16, p.h * 0.27, 0)
  p.g.add(at)
  const core = k.glow(accent(), 0.9)
  at.add(mesh(new THREE.PlaneGeometry(size, size), core), outline(size * 1.3, size * 1.3, k.line(accent(), 1)))
  const wave = pulses(k, at, 3, accent(), size, size * 4.5, 0.8)
  return {
    duration: 2,
    xray: 0.75,
    play: (t) => {
      at.scale.setScalar(settle(t / 0.4))
      show(core, 0.6 + 0.4 * Math.sin(t * 9))
      wave(t - 0.3, ramp(t, 0.3, 0.5))
    },
  }
}

/** A new socket is already on the body: rings mark where it went. */
function socket(k: Kit, x: Ctx): Built | null {
  const mine = x.d.parts.filter((p) => (p.kind === 'port' || p.kind === 'slot') && p.text === x.spec.id)
  if (!mine.length) return null
  const waves = mine.map((p: PlacedPart) => {
    const m = mountOf(x.d.type, p.face)
    const at = new THREE.Group()
    placeOnFace(at, x.solid(m.carrier), x.d.type, m.face, p.x, p.y, 0)
    at.translateZ(x.gap * 2)
    k.on(m.carrier).add(at)
    const r = Math.max(p.w, p.h) * 0.6
    return pulses(k, at, 2, accent(), r, r * 2.6 + 6 * x.u, 0.7)
  })
  return { duration: 1.6, face: mine[0].face, play: (t) => waves.forEach((w) => w(t, 1)) }
}

/** Something taken off: grey rings close in on the device and go out. */
function gone(k: Kit, x: Ctx): Built {
  const g = k.on(mainCarrier(x.d))
  const planes = [0, 1].map((i) => {
    const o = new THREE.Group()
    if (i) o.rotation.x = Math.PI / 2
    g.add(o)
    return pulses(k, o, 2, '#9aa0a8', x.radius * 0.12, x.radius * 0.7, 0.9)
  })
  return { duration: 1.2, play: (t) => planes.forEach((w) => w(t, 0.7, true)) }
}

/** A foldable shuts and opens again, or opens and shuts if it is being shown shut. A better hinge moves faster and leaves less of a gap. */
function fold(k: Kit, x: Ctx): Built {
  const s = x.solid('body')
  const level = x.spec.to ?? 0
  // a line of light along the hinge while it turns
  // a book's hinge runs up it, a flip's across
  const bar = () => (isFlip(x.d.body) ? new THREE.BoxGeometry(s.width * 0.96, 0.9 * x.u, 0.9 * x.u) : new THREE.BoxGeometry(0.9 * x.u, s.height * 0.96, 0.9 * x.u))
  const line = mesh(bar(), k.glow(accent(), 0.9), 0, 0, s.thickness / 2 + x.gap * 2)
  const behind = mesh(bar(), k.glow(accent(), 0.9), 0, 0, -s.thickness / 2 - x.gap * 2)
  k.on('body').add(line, behind)
  const shut = 1.25 - 0.1 * level
  const D = 3
  return {
    duration: D,
    pose: (t) => ({ fold: ramp(t, 0.3, 0.3 + shut) * (1 - ramp(t, D - 0.3 - shut, D - 0.3)) }),
    play: (t) => {
      show(line.material as THREE.Material, 0.5 + 0.5 * Math.sin(t * 8))
      show(behind.material as THREE.Material, 0.5 + 0.5 * Math.sin(t * 8))
    },
  }
}

/** Where a headset's lenses are, behind the visor. */
const lensSpots = (s: Body) => [-1, 1].map((sx) => new THREE.Vector3(sx * 32, 0, -s.thickness / 2 - 20))

/** Light gathers through a headset's two lenses: tighter and brighter the better they are. */
function lens(k: Kit, x: Ctx): Built {
  const s = x.solid('body')
  const g = k.on('body')
  const sharp = x.spec.key === 'optics' ? (x.spec.to ?? 0) / (OPTICS.length - 1) : 0.5
  const r = s.height * 0.26
  const waves = lensSpots(s).map((at) => {
    const o = new THREE.Group()
    o.position.copy(at)
    g.add(o)
    // the eye's view: a disc that sharpens from a blur to a point
    const blur = mesh(new THREE.CircleGeometry(r, 40), k.glow(WHITE, 0.3))
    const point = mesh(new THREE.CircleGeometry(r * (0.34 - 0.2 * sharp), 32), k.glow(accent(), 0.95), 0, 0, -0.4)
    o.add(blur, point)
    return { wave: pulses(k, o, 3, accent(), r * 0.35, r * 1.25, 0.8), blur, point }
  })
  return {
    duration: 2.2,
    face: 'back',
    play: (t) =>
      waves.forEach((w) => {
        w.wave(t, 0.9, true)
        const f = ramp(t, 0.3, 1.2)
        w.blur.scale.setScalar(lerp(1.15, 0.5 - 0.2 * sharp, f))
        show(w.blur.material as THREE.Material, 1 - 0.6 * f)
        show(w.point.material as THREE.Material, f)
      }),
  }
}

/**
 * A headset looks out. Only the outermost pair of cameras draw the space they see, as two cones that sweep the room
 * together; the others blink where they are, so that four or six cameras do not fill the view with lines. Any
 * controllers on the desk are ringed once they are found.
 */
function rays(k: Kit, x: Ctx): Built {
  const d = x.d
  const s = x.solid('body')
  const g = k.on('body')
  const cams = d.parts.filter((p) => p.kind === 'camera')
  const reach = 46 * x.u
  // the widest-set camera on each side, highest first
  const outer = [-1, 1].map((side) => cams.filter((p) => p.x * side > 0).sort((a, b) => Math.abs(b.x) - Math.abs(a.x) || b.y - a.y)[0]).filter((p): p is PlacedPart => !!p)
  const lead = outer.length ? outer : cams.slice(0, 1)
  const cones = lead.map((p) => {
    const at = new THREE.Group()
    placeOnFace(at, s, d.type, 'front', p.x, p.y, 0)
    at.translateZ(x.gap * 2)
    g.add(at)
    // each looks a little away from the middle
    at.rotateY(Math.atan2(p.x, s.width * 1.3))
    at.rotateX(-Math.atan2(p.y, s.height * 2.4))
    const w = reach * 0.34
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3(a * w, b * w * 0.7, reach))
    const pts: THREE.Vector3[] = []
    for (const c of corners) pts.push(new THREE.Vector3(), c)
    const edges = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), k.line(accent(), 0.2))
    edges.raycast = () => {}
    const frame = outline(2 * w, 2 * w * 0.7, k.line(accent(), 0.9))
    at.add(edges, frame)
    return { at, frame }
  })
  const blinks = cams.map((p) => {
    const at = new THREE.Group()
    placeOnFace(at, s, d.type, 'front', p.x, p.y, 0)
    at.translateZ(x.gap * 3)
    g.add(at)
    const ring = mesh(new THREE.RingGeometry(0.8, 1, 32), k.glow(lead.includes(p) ? accent() : WHITE, 0.9))
    ring.scale.setScalar(Math.max(p.w, 6) * 0.75)
    at.add(ring)
    return ring
  })
  // the controllers lie on the desk in front: a ring lights round each once it is found
  const wands = (d.specs.keyboard ?? 0) > 0
  const found = wands
    ? [-1, 1].map((sx) => {
        const o = new THREE.Group()
        o.position.set(sx * s.width * 0.3, -s.height / 2 + 16, s.thickness / 2 + 80)
        o.rotation.x = -Math.PI / 2
        g.add(o)
        return pulses(k, o, 2, GREEN, 18, 52, 0.8)
      })
    : []
  return {
    duration: 2.6,
    face: 'front',
    play: (t) => {
      // one frame sweeps out along both cones at once
      const ph = (((t * 0.8) % 1) + 1) % 1
      for (const cone of cones) {
        cone.frame.position.z = reach * ph
        cone.frame.scale.setScalar(Math.max(0.02, ph))
        show(cone.frame.material as THREE.Material, Math.sin(ph * Math.PI))
        cone.at.scale.setScalar(settle(t / 0.45))
      }
      blinks.forEach((ring, i) => show(ring.material as THREE.Material, 0.25 + 0.75 * Math.max(0, Math.sin(t * 5 - i * 0.7))))
      found.forEach((w) => w(t - 0.9, ramp(t, 0.9, 1.1)))
    },
  }
}

/** A speaker listens and answers: sound comes in to its microphones, then a ring of light turns on its top. */
function voice(k: Kit, x: Ctx): Built {
  const d = x.d
  const s = x.solid('body')
  const shape = speakerShape(d.body)
  const g = k.on('body')
  const top = new THREE.Group()
  top.rotation.x = -Math.PI / 2
  top.position.y = s.height / 2 + x.gap * 3
  g.add(top)
  const r = Math.min(shape.capX, shape.capZ)
  // a voice arrives from the room
  const heard = pulses(k, top, 3, WHITE, r * 1.1, r * 3.2, 0.7)
  // the ring answers: an arc that runs round the top, longer the more microphones are listening
  const share = d.specs.mics === undefined ? 0.5 : (d.specs.mics + 1) / MIC_ARRAYS.length
  const arc = mesh(new THREE.RingGeometry(0.8, 1, 64, 1, 0, Math.PI * (0.5 + 1.2 * share)), k.glow(accent(), 1), 0, 0, 0.3)
  arc.scale.set(shape.capX * 0.98, shape.capZ * 0.98, 1)
  top.add(arc)
  const count = (MIC_ARRAYS[d.specs.mics ?? 0] ?? MIC_ARRAYS[0]).count
  const dots = Array.from({ length: count }, (_, i) => {
    const a = ((i + 0.5) / count) * Math.PI * 2
    const o = mesh(new THREE.CircleGeometry(Math.max(1.4, r * 0.06), 16), k.glow(GREEN, 1), shape.form === 'block' ? (i - (count - 1) / 2) * Math.min(9, (2 * shape.capX - 16) / count) : shape.capX * 0.7 * Math.sin(a), shape.form === 'block' ? shape.capZ - 5 : -shape.capZ * 0.7 * Math.cos(a), 0.4)
    top.add(o)
    return o
  })
  return {
    duration: 2.6,
    play: (t) => {
      heard(t, 1 - ramp(t, 1, 1.3), true)
      dots.forEach((o, i) => show(o.material as THREE.Material, t < 1.3 ? 0.4 + 0.6 * Math.max(0, Math.sin(t * 9 - i * 0.9)) : 1 - ramp(t, 1.3, 1.6)))
      arc.rotation.z = -t * 4.2
      show(arc.material as THREE.Material, ramp(t, 1.1, 1.4))
    },
  }
}

/** A handheld shakes in the hands: harder with better haptics, with rings where the motors are, behind the two grips. */
function rumble(k: Kit, x: Ctx): Built {
  const d = x.d
  const s = x.solid('body')
  const g = k.on('body')
  const level = x.spec.id === 'input' ? (x.spec.to ?? 0) : (d.specs.keyboard ?? 0)
  const c = handheldControls(d.body)
  const waves = [-1, 1].flatMap((sx) =>
    [1, -1].map((face) => {
      const o = new THREE.Group()
      o.position.set(sx * c.x, 0, face * (s.thickness / 2 + (face > 0 ? 7 : 16)))
      g.add(o)
      return pulses(k, o, 2 + (level > 1 ? 1 : 0), accent(), c.r * 1.3, c.r * (2.4 + 0.5 * level), 0.5)
    }),
  )
  const D = 2.2
  return {
    duration: D,
    pose: (t) => ({ shake: t > 0.35 && t < D - 0.6 ? Math.sin(t * 88) * (0.5 + 0.45 * level) * Math.sin(((t - 0.35) / (D - 0.95)) * Math.PI) : 0 }),
    play: (t) => waves.forEach((w) => w(t, ramp(t, 0.3, 0.5) * (1 - ramp(t, D - 0.7, D - 0.5)))),
  }
}

/** A handheld stands in its dock, which is part of the model, and the picture moves to the television behind. */
function dock(k: Kit, x: Ctx): Built {
  const s = x.solid('body')
  const g = k.on('body')
  // the television it now plays on, sketched behind
  const tw = s.width * 1.5
  const th = tw * 0.5625
  const tv = new THREE.Group()
  tv.position.set(0, s.height * 0.5 + th * 0.2, -s.thickness / 2 - 150 * x.u)
  const wash = k.glow(WHITE, 0.22)
  tv.add(mesh(new THREE.PlaneGeometry(tw, th), wash), outline(tw, th, k.line(accent(), 1)))
  g.add(tv)
  const hops = Array.from({ length: 5 }, () => {
    const o = mesh(new THREE.BoxGeometry(3 * x.u, 3 * x.u, 3 * x.u), k.glow(accent(), 1))
    g.add(o)
    return o
  })
  const from = new THREE.Vector3(0, -s.height / 2, -s.thickness / 2 - 10)
  const D = 2.8
  return {
    duration: D,
    face: 'front',
    play: (t) => {
      const on = ramp(t, 0.9, 1.2)
      tv.scale.setScalar(Math.max(0.01, settle((t - 0.7) / 0.5)))
      show(wash, on * (0.7 + 0.3 * Math.sin(t * 7)))
      hops.forEach((o, i) => {
        const ph = (t * 1.1 + i / hops.length) % 1
        o.position.copy(from).lerp(tv.position, ph)
        show(o.material as THREE.Material, on * Math.sin(ph * Math.PI))
      })
    },
  }
}

const BUILDERS: Record<DemoKind, (k: Kit, x: Ctx) => Built | null> = { puck, charge, water, nfc, sat: satellite, sound, battery, chip, gpu, cells, cooling, anc, panel, refresh, input, feature, socket, gone, fold, lens, rays, voice, rumble, dock }

/** Which sound goes with each kind. */
export const DEMO_SOUND: Record<DemoKind, 'charge' | 'water' | 'ping' | 'thump' | 'scan' | 'air' | 'hush' | 'toggle' | 'drop' | 'remove'> = {
  puck: 'charge', charge: 'charge', water: 'water', nfc: 'ping', sat: 'ping', sound: 'thump', battery: 'scan', chip: 'scan', gpu: 'scan', cells: 'scan', cooling: 'air', anc: 'hush', panel: 'toggle', refresh: 'toggle', input: 'drop', feature: 'ping', socket: 'ping', gone: 'remove', fold: 'toggle', lens: 'toggle', rays: 'scan', voice: 'ping', rumble: 'thump', dock: 'drop',
}

/** A demonstration ready to play. Its groups are added to the solids they belong to. */
export interface Demo {
  spec: DemoSpec
  roots: Partial<Record<Carrier, THREE.Group>>
  duration: number
  /** Design face to turn towards the camera while it plays. */
  face?: Face
  /** How see-through the device becomes at time t, 0 to 1. */
  xray(t: number): number
  /** What the model itself should be doing at time t: folding, shaking. Empty for most. */
  pose(t: number): Pose
  /** Move everything to where it is t seconds in. */
  update(t: number): void
}

export function buildDemo(spec: DemoSpec, d: DeviceDesign, radius: number, hints: DemoHints = {}): Demo | null {
  const k = new Kit()
  const u = radius / 87
  const x: Ctx = { d, spec, hints, u, radius, gap: 0.25 * Math.min(12, Math.max(1, u)), solid: (carrier) => carrierBody(d.body, d.type, carrier) }
  const built = BUILDERS[spec.kind](k, x)
  if (!built) return null
  const D = built.duration ?? 2
  const env = (t: number) => Math.min(ramp(t, 0, 0.22), 1 - ramp(t, D - 0.28, D))
  // nothing in a demonstration is solid to the pointer or casts a shadow
  for (const g of Object.values(k.roots)) g.traverse((o) => ((o.renderOrder = 12), (o.raycast = () => {})))
  return {
    spec,
    roots: k.roots,
    duration: D,
    face: built.face,
    xray: (t) => (built.xray ?? 0) * env(t),
    pose: (t) => built.pose?.(t) ?? {},
    update(t) {
      built.play(t)
      k.fade(env(t))
    },
  }
}

export function disposeDemo(demo: Demo) {
  for (const g of Object.values(demo.roots)) {
    g.removeFromParent()
    g.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((v) => v.dispose())
      else mat?.dispose()
    })
  }
}
