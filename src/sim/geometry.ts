// Pure geometry helpers shared by the scoring code and the 3D builder.
import { sensorInfo } from '../data/catalog'
import { clamp } from './rng'
import type { Body, DeviceDesign, DeviceType, Face, PartKind, PlacedPart } from './types'

const SLAB_FACES: Record<PartKind, Face[]> = {
  camera: ['back', 'front'],
  island: ['back'],
  flash: ['back', 'front'],
  notch: ['front'],
  button: ['left', 'right', 'top', 'bottom'],
  port: ['bottom', 'top', 'left', 'right'],
  grille: ['bottom', 'top', 'left', 'right', 'front'],
  fingerprint: ['back', 'front', 'left', 'right'],
  logo: ['back'],
}
const WATCH_FACES: Partial<Record<PartKind, Face[]>> = {
  island: ['back'],
  flash: ['back'],
  button: ['right', 'left'],
  grille: ['left', 'right'],
  logo: ['back'],
}
// A laptop's "front" is the screen side of the lid and its "back" the lid's outside.
const LAPTOP_FACES: Partial<Record<PartKind, Face[]>> = {
  camera: ['front'],
  notch: ['front'],
  port: ['left', 'right'],
  grille: ['left', 'right'],
  logo: ['back'],
}

/** Faces a part kind may sit on for a device type. Empty when the type does not use it. */
export function facesFor(kind: PartKind, type: DeviceType): Face[] {
  if (type === 'watch') return WATCH_FACES[kind] ?? []
  if (type === 'laptop') return LAPTOP_FACES[kind] ?? []
  return SLAB_FACES[kind]
}
export const kindsFor = (type: DeviceType): PartKind[] => (Object.keys(SLAB_FACES) as PartKind[]).filter((k) => facesFor(k, type).length > 0)

export const PART_LABELS: Record<PartKind, string> = {
  camera: 'Camera',
  island: 'Camera island',
  flash: 'Flash',
  notch: 'Notch',
  button: 'Button',
  port: 'Port',
  grille: 'Speaker grille',
  fingerprint: 'Fingerprint sensor',
  logo: 'Logo',
}
export function partLabel(p: Pick<PlacedPart, 'kind' | 'crown' | 'face'>, type: DeviceType): string {
  if (p.crown) return 'Crown'
  if (type === 'watch' && p.kind === 'island') return 'Sensor window'
  if (type === 'watch' && p.kind === 'flash') return 'Sensor LED'
  if (type === 'laptop' && p.kind === 'camera') return 'Webcam'
  return PART_LABELS[p.kind]
}

export const isSide = (f: Face) => f !== 'front' && f !== 'back'

/** Thickness of the part of the body that carries edge parts. A laptop's ports sit on its base. */
export const edgeThickness = (b: Body, type: DeviceType) => (type === 'laptop' ? b.thickness * 0.62 : b.thickness)

/** Usable width/height of a face in part coordinates. */
export function faceSize(b: Body, face: Face, type: DeviceType = 'phone'): { w: number; h: number } {
  if (face === 'front' || face === 'back') return { w: b.width, h: b.height }
  if (face === 'left' || face === 'right') return { w: b.height, h: edgeThickness(b, type) }
  return { w: b.width, h: edgeThickness(b, type) }
}

export function screenRect(b: Body) {
  const w = Math.max(10, b.width - 2 * b.bezelSide)
  const h = Math.max(10, b.height - b.bezelTop - b.bezelBottom)
  const minBezel = Math.min(b.bezelSide, b.bezelTop, b.bezelBottom)
  return { w, h, cx: 0, cy: (b.bezelBottom - b.bezelTop) / 2, r: Math.max(b.corner - minBezel, 0.6) }
}

/** Bevel of the body edge. Round edges adapt so the screen always sits on flat glass. */
export function edgeBevel(b: Body): number {
  if (b.edge === 'flat') return 0.35
  const minBezel = Math.min(b.bezelSide, b.bezelTop, b.bezelBottom)
  return clamp(minBezel - 0.1, 0.35, Math.min(2.5, b.thickness * 0.35))
}

/** Axis-aligned extent of a part after rotation. */
export function partExtent(p: PlacedPart): { w: number; h: number } {
  const a = (p.rot * Math.PI) / 180
  const c = Math.abs(Math.cos(a))
  const s = Math.abs(Math.sin(a))
  return { w: p.w * c + p.h * s, h: p.w * s + p.h * c }
}

/** Keep a part on a face it is allowed on. Returns a new part. */
export function clampPart(b: Body, p: PlacedPart, type: DeviceType = 'phone'): PlacedPart {
  const allowed = facesFor(p.kind, type)
  const face = allowed.includes(p.face) ? p.face : (allowed[0] ?? p.face)
  const fs = faceSize(b, face, type)
  const q = { ...p, face }
  if (isSide(face)) {
    // a part on an edge can never be taller than the edge is thick
    const room = Math.max(0.8, fs.h - 1.2)
    if (q.crown) q.w = q.h = Math.min(Math.max(q.w, q.h), room)
    else q.h = Math.min(q.h, room)
    if (q.kind === 'fingerprint') q.w = Math.max(q.w, 8)
  }
  const e = partExtent(q)
  const marginX = isSide(face) ? Math.min(b.corner, fs.w * 0.25) : 0
  const maxX = Math.max(0, fs.w / 2 - marginX - e.w / 2)
  const maxY = Math.max(0, fs.h / 2 - e.h / 2)
  q.x = clamp(q.x, -maxX, maxX)
  q.y = clamp(q.y, -maxY, maxY)
  return q
}

export function nextPartId(d: DeviceDesign): string {
  let n = 0
  for (const p of d.parts) n = Math.max(n, parseInt(p.id.slice(1)) || 0)
  return `k${n + 1}`
}

/** A new part with sensible defaults for the given design. */
export function newPart(kind: PartKind, d: DeviceDesign, sensorLevel = 0): PlacedPart {
  const b = d.body
  const base = { id: nextPartId(d), kind, face: facesFor(kind, d.type)[0] ?? 'back', x: 0, y: 0, rot: 0 }
  let p: PlacedPart
  switch (kind) {
    case 'camera': {
      if (base.face === 'front') {
        p = { ...base, w: 3.6, h: 3.6, sensor: Math.max(0, sensorLevel - 1), lens: 'wide', y: b.height / 2 - Math.max(3, b.bezelTop / 2) }
        break
      }
      const dia = sensorInfo(sensorLevel).minDia + 2
      p = { ...base, w: dia, h: dia, sensor: sensorLevel, lens: 'wide', y: b.height / 2 - 22 }
      break
    }
    case 'island':
      p = d.type === 'watch' ? { ...base, w: 26, h: 26, r: 13, finish: 'black' } : { ...base, w: 30, h: 30, r: 8, finish: 'back', y: b.height / 2 - 24 }
      break
    case 'flash':
      p = { ...base, w: 4, h: 4, y: d.type === 'watch' ? 0 : b.height / 2 - 40 }
      break
    case 'notch':
      p = { ...base, w: 28, h: 7, r: 3, y: b.height / 2 - b.bezelTop - 3.5 }
      break
    case 'button':
      p = d.type === 'watch' ? { ...base, w: 6, h: 6, x: 6, crown: true } : { ...base, face: 'right', w: 11, h: 2.2, x: 20 }
      break
    case 'port':
      p = { ...base, w: 8.6, h: 2.8 }
      break
    case 'grille':
      p = { ...base, w: 12, h: 1.4, x: d.type === 'watch' ? -6 : 18 }
      break
    case 'fingerprint':
      p = { ...base, w: 9, h: 9, y: 25 }
      break
    case 'logo':
      p = { ...base, w: d.type === 'laptop' ? 44 : d.type === 'watch' ? 14 : 22, h: d.type === 'laptop' ? 14 : d.type === 'watch' ? 4 : 7, text: 'LOGO' }
      break
  }
  return clampPart(b, p, d.type)
}

export function rectsOverlap(a: PlacedPart, b: PlacedPart, tol = 0.2): boolean {
  const ea = partExtent(a)
  const eb = partExtent(b)
  return Math.abs(a.x - b.x) < (ea.w + eb.w) / 2 - tol && Math.abs(a.y - b.y) < (ea.h + eb.h) / 2 - tol
}

export function contains(outer: PlacedPart, inner: PlacedPart): boolean {
  const eo = partExtent(outer)
  return Math.abs(inner.x - outer.x) <= eo.w / 2 && Math.abs(inner.y - outer.y) <= eo.h / 2
}
