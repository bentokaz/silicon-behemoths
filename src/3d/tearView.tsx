// What the opened device needs around it, shared by the designer and the product inspector: the label on a
// component, finding the component under the pointer without doing it on every move, the view the camera takes
// of an opened device, and the stops of the guided tour.
import { useFrame, useThree } from '@react-three/fiber'
import { type RefObject, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { extraInfo } from '../data/catalog'
import { type Comp, FEATURE_MODELS } from '../sim/internals'
import { PART_NOTES } from '../data/featureParts'
import type { DeviceDesign, DeviceType } from '../sim/types'
import type { Picked } from './studio'
import type { Rig } from './teardown'

/** How bright the lamp at the camera is once a device is fully open: whatever is being looked into is lit. */
export const TEAR_LAMP = 0.85

/** What a component is for: its own sentence, its model's, or the note of the extra it stands for. */
const aboutOf = (c: Comp) => c.about ?? (c.model ? FEATURE_MODELS[c.model] ?? PART_NOTES[c.model] : undefined) ?? c.specs.map((k) => (k.startsWith('extra:') ? extraInfo(k.slice(6))?.note : undefined)).find(Boolean)
export const pickedOf = (c: Comp): Picked => ({ id: c.id, label: c.label, figure: c.figure ?? '', specs: c.specs, partId: c.partId, note: c.note, kind: c.kind, about: aboutOf(c) })

const usd = (v: number) => (v >= 100 ? `$${Math.round(v)}` : `$${v.toFixed(2)}`)
const weigh = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : g >= 10 ? `${Math.round(g)} g` : `${g.toFixed(1)} g`)

interface LabelProps {
  pick: Picked
  /** Small, for the component the pointer is passing over. */
  compact?: boolean
  cost?: number
  unitCost?: number
  grams?: number
  weight?: number
  /** Said in the warning colour, or the error colour: what the issue list says about this component. */
  hot?: { bad: boolean; text: string } | null
  /** Shown on a stop of the tour: where it is in the tour. */
  step?: string
}

/** The label that stands beside a component of the opened device. */
export function CompLabel({ pick, compact, cost = 0, unitCost = 0, grams = 0, weight = 0, hot, step }: LabelProps) {
  if (compact) {
    return (
      <div className="ml-4 mt-3 whitespace-nowrap border border-line2 bg-panel px-[6px] py-[3px]">
        <div className="text-[11px] font-semibold text-fg">{pick.label}</div>
        {pick.figure && <div className="num text-[11px] text-dim">{pick.figure}</div>}
        {pick.about && <div className="mt-[2px] w-52 whitespace-normal text-[11px] leading-snug text-dim">{pick.about}</div>}
      </div>
    )
  }
  return (
    <div className="ml-3 -translate-y-1/2 border border-line2 bg-panel">
      <div className="flex items-stretch">
        <span className={`w-[3px] ${hot ? (hot.bad ? 'bg-neg' : 'bg-warn') : 'bg-accent'}`} />
        <div className="px-2 py-[5px]">
          {step && <div className="text-[11px] text-dim">{step}</div>}
          <div className="whitespace-nowrap text-[11px] font-semibold text-fg">{pick.label}</div>
          {pick.figure && <div className="num whitespace-nowrap text-[11px] text-dim">{pick.figure}</div>}
          {hot && <div className={`num whitespace-nowrap text-[11px] ${hot.bad ? 'text-neg' : 'text-warn'}`}>{hot.text}</div>}
          {pick.about && <div className="mt-[2px] w-52 whitespace-normal text-[11px] leading-snug text-dim">{pick.about}</div>}
          {pick.note && <div className="mt-[2px] w-52 whitespace-normal text-[11px] leading-snug text-dim">Not set directly. {pick.note}</div>}
          {(cost > 0 || grams > 0) && (
            <div className="mt-[3px] flex gap-3 whitespace-nowrap border-t border-line pt-[3px] text-[11px] text-dim">
              {cost > 0 && (
                <span>
                  <span className="num text-fg">{usd(cost)}</span>, <span className="num">{Math.round((cost / Math.max(unitCost, 0.01)) * 100)}%</span> of the cost
                </span>
              )}
              {grams > 0 && (
                <span>
                  <span className="num text-fg">{weigh(grams)}</span>, <span className="num">{grams / Math.max(weight, 0.01) < 0.0005 ? 'under 0.1' : ((grams / Math.max(weight, 0.01)) * 100).toFixed(grams / Math.max(weight, 0.01) < 0.1 ? 1 : 0)}%</span> of the weight
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the component under the pointer

const caster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const seen = (o: THREE.Object3D | null): boolean => !o || (o.visible && seen(o.parent))

/** The component of a rig that a ray from the camera lands on first, and where. */
export function compAt(rig: Rig, camera: THREE.Camera, x: number, y: number): { c: Comp; point: THREE.Vector3 } | null {
  caster.setFromCamera(ndc.set(x, y), camera)
  const hit = caster.intersectObjects(rig.targets(), true).find((i) => i.object.userData.comp && seen(i.object))
  const it = hit && rig.comps.get(hit.object.userData.comp as string)
  return it && hit ? { c: it.c, point: hit.point } : null
}

interface HoverOpts {
  rig: () => Rig | undefined
  /** True while there is an opened device to point at. */
  on: () => boolean
  /** The group the label is placed in. */
  turn: RefObject<THREE.Group | null>
  over: () => Picked | null
  set: (p: Picked | null) => void
}

/**
 * Keeps track of the component the pointer is on. The pointer is only read as it moves; the ray is cast from the
 * frame loop, at most about fourteen times a second and only when the pointer has moved, against the components
 * alone. Returns the group to hang the label on: it is kept where the ray landed.
 */
export function useCompHover(o: HoverOpts): RefObject<THREE.Group | null> {
  const tip = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  const live = useRef(o)
  live.current = o
  const ptr = useRef({ x: 0, y: 0, inside: false, down: false, moved: false, t: 0 })
  useEffect(() => {
    const el = gl.domElement
    const p = ptr.current
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      p.x = ((e.clientX - r.left) / r.width) * 2 - 1
      p.y = -((e.clientY - r.top) / r.height) * 2 + 1
      p.inside = true
      p.moved = true
    }
    const leave = () => (p.inside = false)
    const down = () => (p.down = true)
    const up = () => ((p.down = false), (p.moved = true))
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      el.style.cursor = ''
    }
  }, [gl])
  useFrame((state) => {
    const p = ptr.current
    const h = live.current
    const rig = h.rig()
    if (!rig || !h.on() || !p.inside || p.down) {
      if (h.over()) {
        h.set(null)
        gl.domElement.style.cursor = ''
      }
      return
    }
    const now = performance.now()
    if (!p.moved || now - p.t < 70) return
    p.moved = false
    p.t = now
    const hit = compAt(rig, state.camera, p.x, p.y)
    if ((hit?.c.id ?? null) !== (h.over()?.id ?? null)) {
      h.set(hit ? pickedOf(hit.c) : null)
      gl.domElement.style.cursor = hit ? 'pointer' : ''
    }
    if (hit && tip.current && h.turn.current) tip.current.position.copy(h.turn.current.worldToLocal(hit.point))
  })
  return tip
}

// ---------------------------------------------------------------- the view of an opened device

/** Where the camera stands to look into each kind of device once it is open: a direction from the device, lid off and pulled apart. */
export function tearDir(d: DeviceDesign, explode: number): THREE.Vector3 {
  const tower = d.type === 'console' && d.body.height > d.body.width
  const [off, apart]: [number[], number[]] =
    d.type === 'laptop'
      ? [[0.3, 0.78, 0.55], [0.5, 0.7, 0.5]]
      : d.type === 'desktop' || d.type === 'tv' || d.type === 'monitor'
        ? [[-0.36, 0.2, -0.91], [-0.5, 0.28, -0.82]]
        : d.type === 'tower'
          ? d.body.width > d.body.height * 1.5
            ? [[0.3, 0.8, 0.5], [0.36, 0.72, 0.6]]
            : [[0.86, 0.22, 0.46], [0.8, 0.3, 0.52]]
          : d.type === 'mouse'
            ? [[0.3, 0.8, -0.5], [0.4, 0.7, -0.6]]
        : d.type === 'console'
          ? tower
            ? [[0.78, 0.3, 0.54], [0.74, 0.36, 0.56]]
            : [[0.36, 0.66, 0.66], [0.42, 0.56, 0.71]]
          : d.type === 'earbuds'
            ? [[0.42, 0.4, 0.82], [0.46, 0.38, 0.8]]
            : d.type === 'headset'
              ? [[0.5, 0.36, 0.79], [-0.52, 0.44, -0.73]]
              : d.type === 'drone'
                ? [[0.4, 0.74, 0.54], [0.46, 0.66, 0.6]]
                : d.type === 'ring'
                ? [[0.3, 0.72, 0.62], [0.36, 0.6, 0.71]]
              : d.type === 'speaker'
                ? [[0.3, 0.3, 0.9], [0.34, 0.26, 0.9]]
                : d.body.width > d.body.height * 1.15 && d.type !== 'foldable'
                  ? [[-0.3, 0.3, -0.9], [-0.56, 0.42, -0.71]]
                  : [[-0.3, 0.24, -0.92], [0.62, 0.3, -0.72]]
  const k = explode * explode * (3 - 2 * explode)
  return new THREE.Vector3(off[0] + (apart[0] - off[0]) * k, off[1] + (apart[1] - off[1]) * k, off[2] + (apart[2] - off[2]) * k).normalize()
}

const corner = new THREE.Vector3()
const right = new THREE.Vector3()
const upv = new THREE.Vector3()

/**
 * How far back a camera looking along `dir` at the middle of a box has to stand for all of the box to be inside
 * the part of the picture that is clear: `free` is that part as a share of the width and of the height.
 */
export function fitDistance(box: THREE.Box3, dir: THREE.Vector3, fovDeg: number, aspect: number, free: [number, number]): number {
  const centre = box.getCenter(new THREE.Vector3())
  right.crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize()
  upv.crossVectors(dir, right).normalize()
  const tanV = Math.tan((fovDeg * Math.PI) / 360) * free[1]
  const tanH = Math.tan((fovDeg * Math.PI) / 360) * aspect * free[0]
  let dist = 0
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(centre)
    dist = Math.max(dist, corner.dot(dir) + Math.max(Math.abs(corner.dot(right)) / tanH, Math.abs(corner.dot(upv)) / tanV))
  }
  return dist
}

// ---------------------------------------------------------------- the tour

export interface TourStop {
  id: string
  /** How far apart the layers have to be for it to be seen. */
  explode: number
  /** A direction to look from, where the usual one would not show it. */
  dir?: [number, number, number]
}

/** The components worth stopping at, in order, for each kind of device. A stop is skipped if the design has no such component. */
const STOPS: Record<DeviceType, (string | [string, number, [number, number, number]?])[]> = {
  phone: ['battery', 'chip', 'cam:', 'thermal', 'coil', 'haptic', ['display', 1]],
  tablet: ['battery', 'chip', 'cam:', 'thermal', 'spk0', ['display', 1]],
  watch: ['battery', 'haptic', 'sensors', ['chip', 1], ['display', 1]],
  laptop: ['battery', 'chip', 'gpu', 'fan0', 'ssd0', 'ram0'],
  desktop: ['heatsink', 'gpu', 'psu', 'ram0', 'bracket', ['backlight', 1]],
  tv: ['psu', 'board', 'tcon', 'pflex0', 'spk0', 'wifi', ['backlight', 1]],
  console: ['heatsink', 'psu', 'drive', 'fan0', ['chip', 1], ['board', 1]],
  earbuds: ['battery', 'wellL', 'driver', 'budboard', 'budcell', 'budtip'],
  headset: ['board', 'battery', 'cam:', ['lensL', 1, [-0.42, 0.62, -0.66]], ['panelL', 1, [-0.72, 0.56, -0.42]]],
  foldable: ['hinge', 'battery', 'batteryb', 'chip', 'cam:', 'fold0', ['display', 1]],
  speaker: ['woofer', 'tweeter', 'tweeters', 'chamber', 'amp', 'psu', 'mics', 'ledring'],
  handheld: ['battery', 'chip', 'fan0', 'stickL', 'triggerL', ['display', 1]],
  ereader: ['battery', 'chip', 'board', ['frontlight', 1], ['display', 1]],
  ring: ['battery', 'sensors', 'chip', 'coil'],
  actioncam: ['cam:', 'battery', 'chip', 'thermal', ['display', 1]],
  drone: ['battery', 'cam:', 'board', 'chip', 'gps', 'link'],
  tower: ['gpu', 'cooler', 'ram0', 'radiator', 'psu', 'fan0', ['board', 1]],
  monitor: ['psu', 'board', 'tcon', 'spk0', ['backlight', 1]],
  mouse: ['sensor', 'wheel', 'switch0', 'battery', 'chip'],
}

export function tourStops(type: DeviceType, comps: Map<string, { c: Comp }>): TourStop[] {
  const out: TourStop[] = []
  for (const s of STOPS[type]) {
    const [key, explode, dir] = typeof s === 'string' ? [s, 0, undefined] : s
    const id = key.endsWith(':') ? [...comps.keys()].find((k) => k.startsWith(key)) : comps.has(key) ? key : undefined
    if (id) out.push({ id, explode, dir })
  }
  return out
}
