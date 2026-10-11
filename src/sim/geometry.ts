// Pure geometry helpers shared by the scoring code and the 3D builder.
import { sensorInfo } from '../data/catalog'
import { standInfo } from '../data/devices'
import { clamp } from './rng'
import type { Body, DeviceDesign, DeviceType, Face, PartKind, PlacedPart } from './types'

// ---------------------------------------------------------------- which parts go where

type FaceMap = Partial<Record<PartKind, Face[]>>
const SLAB_FACES: FaceMap = {
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
/**
 * Faces each part kind may sit on, per device type. The six face names are
 * reused for every type; faceLabel says what each one is on a given device.
 */
const FACES: Record<DeviceType, FaceMap> = {
  phone: SLAB_FACES,
  tablet: SLAB_FACES,
  watch: { island: ['back'], flash: ['back'], button: ['right', 'left'], grille: ['left', 'right'], logo: ['back'] },
  // front = screen side of the lid, back = outside of the lid, top = keyboard deck,
  // left/right = sides of the base, bottom = rear edge of the base
  laptop: { camera: ['front'], notch: ['front'], port: ['left', 'right', 'bottom'], grille: ['top', 'left', 'right'], vent: ['bottom', 'left', 'right'], fingerprint: ['top'], logo: ['back', 'top'] },
  desktop: { camera: ['front'], notch: ['front'], port: ['back', 'left', 'right', 'bottom'], island: ['back'], grille: ['bottom', 'front', 'back'], vent: ['back', 'top'], button: ['back', 'right', 'left', 'bottom'], light: ['front'], logo: ['front', 'back'] },
  console: { slot: ['front'], port: ['front', 'back'], vent: ['top', 'back', 'left', 'right', 'bottom'], light: ['front', 'top', 'left', 'right'], button: ['front', 'top'], logo: ['top', 'front', 'left', 'right'] },
  // the faces of the lower half of the case
  earbuds: { port: ['bottom', 'back'], light: ['front'], button: ['back', 'front'], logo: ['front', 'back'] },
  tv: { port: ['back', 'left', 'right'], island: ['back'], vent: ['back'], grille: ['bottom', 'back'], button: ['bottom', 'back', 'right'], light: ['front'], logo: ['front', 'back'] },
}
const KINDS: PartKind[] = ['camera', 'island', 'flash', 'notch', 'slot', 'port', 'button', 'light', 'grille', 'vent', 'fingerprint', 'logo']

/** Faces a part kind may sit on for a device type. Empty when the type does not use it. */
export function facesFor(kind: PartKind, type: DeviceType): Face[] {
  return FACES[type][kind] ?? []
}
export const kindsFor = (type: DeviceType): PartKind[] => KINDS.filter((k) => facesFor(k, type).length > 0)

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
  vent: 'Vent',
  slot: 'Disc slot',
  light: 'Status light',
}
export function partLabel(p: Pick<PlacedPart, 'kind' | 'crown' | 'face'>, type: DeviceType): string {
  if (p.crown) return 'Crown'
  if (type === 'watch' && p.kind === 'island') return 'Sensor window'
  if (type === 'watch' && p.kind === 'flash') return 'Sensor LED'
  if ((type === 'laptop' || type === 'desktop') && p.kind === 'camera') return 'Webcam'
  if (type === 'laptop' && p.kind === 'fingerprint') return 'Power button'
  if ((type === 'desktop' || type === 'tv') && p.kind === 'island') return 'Port panel'
  if (type === 'console' && p.kind === 'light') return 'Light bar'
  if (type === 'console' && p.kind === 'button') return 'Power button'
  if (type === 'earbuds' && p.kind === 'button') return 'Pairing button'
  return PART_LABELS[p.kind]
}

const FACE_LABELS: Partial<Record<DeviceType, Partial<Record<Face, string>>>> = {
  laptop: { front: 'screen side', back: 'lid', top: 'keyboard deck', bottom: 'rear edge', left: 'left side', right: 'right side' },
  desktop: { top: 'top edge', bottom: 'bottom edge', left: 'left edge', right: 'right edge' },
  tv: { top: 'top edge', bottom: 'bottom edge', left: 'left edge', right: 'right edge' },
  console: { left: 'left side', right: 'right side', bottom: 'underside' },
  earbuds: { front: 'case front', back: 'case back', bottom: 'case underside' },
}
/** What a face is called on a given device, for the editor. */
export const faceLabel = (face: Face, type: DeviceType): string => FACE_LABELS[type]?.[face] ?? face

// ---------------------------------------------------------------- the solids parts sit on

/** A device is one solid, or two: a laptop has a lid and a base. */
export type Carrier = 'body' | 'lid' | 'base'
/** Where a design face lives: on which solid, and which of that solid's own faces it is. */
export interface Mount {
  carrier: Carrier
  face: Face
}
const LAPTOP_MOUNTS: Record<Face, Mount> = {
  front: { carrier: 'lid', face: 'front' },
  back: { carrier: 'lid', face: 'back' },
  // the base is a slab lying on its back, so its own front is the deck and its own top the rear edge
  top: { carrier: 'base', face: 'front' },
  bottom: { carrier: 'base', face: 'top' },
  left: { carrier: 'base', face: 'left' },
  right: { carrier: 'base', face: 'right' },
}
export const mountOf = (type: DeviceType, face: Face): Mount => (type === 'laptop' ? LAPTOP_MOUNTS[face] : { carrier: 'body', face })
/** Inverse of mountOf: the design face for a face of one of the solids, if parts can go there. */
export function designFace(type: DeviceType, carrier: Carrier, face: Face): Face | null {
  if (type !== 'laptop') return carrier === 'body' ? face : null
  return (Object.keys(LAPTOP_MOUNTS) as Face[]).find((f) => LAPTOP_MOUNTS[f].carrier === carrier && LAPTOP_MOUNTS[f].face === face) ?? null
}

/** How a laptop's thickness is shared between its lid and its base. */
export function laptopSplit(b: Body): { lid: number; base: number } {
  const lid = Math.max(3, b.thickness * 0.38)
  return { lid, base: b.thickness - lid }
}

/** Shape of an earbud case: a lower shell and a hinged lid, rounded when seen from above. */
export function caseShape(b: Body): { shell: number; lid: number; foot: number; bevel: number } {
  const shell = Math.round(b.height * 0.62 * 2) / 2
  const lid = b.height - shell
  return {
    shell,
    lid,
    // corner radius of the outline seen from above
    foot: clamp(b.corner, 2, b.thickness / 2 - 0.2),
    // rounding of the top and bottom
    bevel: b.edge === 'flat' ? 1.6 : clamp(b.thickness * 0.34, 2, lid - 3),
  }
}

/**
 * The keyboard on a laptop's deck, in deck (top face) coordinates: the block of
 * keys and the grid they are laid out on. Parts cannot sit on the keys.
 */
export function laptopDeck(b: Body): { x: number; y: number; w: number; h: number; cols: number; rows: number; pitch: number } {
  const w = b.width - 34
  const cols = Math.max(10, Math.floor(w / 19))
  const pitch = w / cols
  const rows = 5
  const h = rows * pitch * 0.94 + pitch * 0.5
  return { x: 0, y: b.height / 2 - 16 - h / 2, w, h, cols, rows, pitch }
}

/** Dimensions of the solid that carries a design face. */
export function carrierBody(b: Body, type: DeviceType, carrier: Carrier): Body {
  if (type === 'laptop') {
    const split = laptopSplit(b)
    return carrier === 'lid' ? { ...b, thickness: split.lid } : { ...b, thickness: split.base, bezelTop: 0, bezelBottom: 0, bezelSide: 0 }
  }
  if (type === 'earbuds') return { ...b, height: caseShape(b).shell }
  return b
}

/** A console's sides are large surfaces, so their coordinates run across and up like a front face. */
const uprightSides = (type: DeviceType) => type === 'console'

/**
 * Axes of a solid's face in the solid's own space: where x and y of a part point,
 * and the outward normal. The solid stands upright with its front at +Z.
 */
export function faceBasis(type: DeviceType, face: Face): [number[], number[], number[]] {
  switch (face) {
    case 'front':
      return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    case 'back':
      return [[-1, 0, 0], [0, 1, 0], [0, 0, -1]]
    case 'right':
      return uprightSides(type) ? [[0, 0, -1], [0, 1, 0], [1, 0, 0]] : [[0, 1, 0], [0, 0, 1], [1, 0, 0]]
    case 'left':
      return uprightSides(type) ? [[0, 0, 1], [0, 1, 0], [-1, 0, 0]] : [[0, 1, 0], [0, 0, -1], [-1, 0, 0]]
    case 'top':
      return [[1, 0, 0], [0, 0, -1], [0, 1, 0]]
    case 'bottom':
      return [[1, 0, 0], [0, 0, 1], [0, -1, 0]]
  }
}

/** True for the two large faces of a slab. Use isEdge to ask about a design face. */
export const isSide = (f: Face) => f !== 'front' && f !== 'back'

/** True if the face is a thin edge, where parts sit in a row and cannot move across it. */
export function isEdge(face: Face, type: DeviceType): boolean {
  if (type === 'console' || type === 'earbuds') return false
  return isSide(mountOf(type, face).face)
}

/** Thickness of the part of the body that carries edge parts. A laptop's ports sit on its base. */
export const edgeThickness = (b: Body, type: DeviceType) => (type === 'laptop' ? laptopSplit(b).base : b.thickness)

/** Width/height of a face in part coordinates. */
export function faceSize(b: Body, face: Face, type: DeviceType = 'phone'): { w: number; h: number } {
  const m = mountOf(type, face)
  const c = carrierBody(b, type, m.carrier)
  if (m.face === 'front' || m.face === 'back') return { w: c.width, h: c.height }
  if (m.face === 'left' || m.face === 'right') return uprightSides(type) ? { w: c.thickness, h: c.height } : { w: c.height, h: c.thickness }
  return { w: c.width, h: c.thickness }
}

/** Strip at each end of a face that parts must keep clear of, where the surface curves away. */
function faceInset(b: Body, face: Face, type: DeviceType): { x: number; y: number } {
  const fs = faceSize(b, face, type)
  if (type === 'console') {
    if (face === 'top' || face === 'bottom') return { x: Math.min(b.corner, fs.w * 0.3), y: 2 }
    if (face === 'left' || face === 'right') return { x: 2, y: Math.min(b.corner, fs.h * 0.3) }
    return { x: 0, y: 0 }
  }
  if (type === 'earbuds') {
    const cs = caseShape(b)
    if (face === 'bottom') return { x: Math.min(cs.foot * 0.6 + cs.bevel * 0.5, fs.w * 0.35), y: Math.min(cs.bevel, fs.h * 0.3) }
    return { x: Math.min(cs.foot, fs.w * 0.35), y: Math.min(cs.bevel * 0.6, fs.h * 0.25) }
  }
  if (isEdge(face, type)) return { x: Math.min(b.corner, fs.w * 0.25), y: 0 }
  return { x: 0, y: 0 }
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

/** Gap between a stand-mounted panel and the desk it stands on. */
export const standLift = (b: Body, type: DeviceType) => (type === 'tv' ? Math.round(b.height * 0.075) : Math.round(b.height * 0.2))

/** The patch on the back that a desktop's stand bolts to, in back-face coordinates. Null if nothing is there. */
export function standMount(b: Body, type: DeviceType): { x: number; y: number; w: number; h: number } | null {
  if (type !== 'desktop' || standInfo(type, b.stand).id === 'feet') return null
  return { x: 0, y: -b.height * 0.16, w: Math.max(70, b.width * 0.17), h: 46 }
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
  if (isEdge(face, type)) {
    // a part on an edge can never be taller than the edge is thick
    const room = Math.max(0.8, fs.h - 1.2)
    if (q.crown) q.w = q.h = Math.min(Math.max(q.w, q.h), room)
    else q.h = Math.min(q.h, room)
    if (q.kind === 'fingerprint') q.w = Math.max(q.w, 8)
    q.rot = 0
  }
  const inset = faceInset(b, face, type)
  const e = partExtent(q)
  const maxX = Math.max(0, fs.w / 2 - inset.x - e.w / 2)
  const maxY = Math.max(0, fs.h / 2 - inset.y - e.h / 2)
  q.x = clamp(q.x, -maxX, maxX)
  q.y = clamp(q.y, -maxY, maxY)
  if (type === 'laptop' && face === 'top' && onKeyboard(b, q)) {
    // nothing fits between the keys: a part pushed onto the keyboard slides to the nearer strip of open deck
    const k = laptopDeck(b)
    const above = k.y + k.h / 2 + e.h / 2
    const below = k.y - k.h / 2 - e.h / 2
    q.y = above <= maxY && (above - q.y <= q.y - below || below < -maxY) ? above : Math.max(below, -maxY)
  }
  return q
}

/** True if a part at this spot on a laptop's deck would overlap the keys. */
export function onKeyboard(b: Body, p: PlacedPart): boolean {
  const k = laptopDeck(b)
  const e = partExtent(p)
  return Math.abs(p.x - k.x) < (k.w + e.w) / 2 && Math.abs(p.y - k.y) < (k.h + e.h) / 2
}

export function nextPartId(d: DeviceDesign): string {
  let n = 0
  for (const p of d.parts) n = Math.max(n, parseInt(p.id.slice(1)) || 0)
  return `k${n + 1}`
}

/** A new part with sensible defaults for the given design. */
export function newPart(kind: PartKind, d: DeviceDesign, sensorLevel = 0): PlacedPart {
  const b = d.body
  const type = d.type
  const face = facesFor(kind, type)[0] ?? 'back'
  const fs = faceSize(b, face, type)
  const base = { id: nextPartId(d), kind, face, x: 0, y: 0, rot: 0 }
  // large devices get parts sized to match
  const big = type === 'tv' ? 3 : type === 'desktop' ? 2 : type === 'console' ? 1.5 : 1
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
      if (type === 'watch') p = { ...base, w: 26, h: 26, r: 13, finish: 'black' }
      else if (type === 'desktop' || type === 'tv') p = { ...base, w: 70 * big, h: 40 * big, r: 6, finish: 'black', x: fs.w * 0.25 }
      else p = { ...base, w: 30, h: 30, r: 8, finish: 'back', y: b.height / 2 - 24 }
      break
    case 'flash':
      p = { ...base, w: 4, h: 4, y: type === 'watch' ? 0 : b.height / 2 - 40 }
      break
    case 'notch':
      p = { ...base, w: 28, h: 7, r: 3, y: b.height / 2 - b.bezelTop - 3.5 }
      break
    case 'button':
      if (type === 'watch') p = { ...base, w: 6, h: 6, x: 6, crown: true }
      else if (type === 'console') p = { ...base, w: 10, h: 10, x: fs.w / 2 - 22 }
      else if (type === 'earbuds') p = { ...base, w: 5, h: 5 }
      else if (type === 'desktop' || type === 'tv') p = { ...base, w: 12, h: 12, x: fs.w / 2 - 40, y: -fs.h / 2 + 40 }
      else p = { ...base, face: 'right', w: 11, h: 2.2, x: 20 }
      break
    case 'port':
      p = { ...base, w: 8.6, h: 2.8, text: 'usbc' }
      break
    case 'grille':
      p = { ...base, w: 12 * big, h: 1.4, x: type === 'watch' ? -6 : type === 'laptop' ? 0 : 18 * big, y: type === 'laptop' ? fs.h / 2 - 8 : 0 }
      break
    case 'fingerprint':
      p = type === 'laptop' ? { ...base, w: 13, h: 9, x: fs.w / 2 - 26, y: fs.h / 2 - 10 } : { ...base, w: 9, h: 9, y: 25 }
      break
    case 'logo': {
      const w = type === 'laptop' ? 44 : type === 'watch' ? 14 : type === 'earbuds' ? 16 : 22 * big
      const h = type === 'laptop' ? 14 : type === 'watch' ? 4 : type === 'earbuds' ? 5 : 7 * big
      // on a screen, the logo goes in the bezel below it
      if ((type === 'tv' || type === 'desktop') && face === 'front') {
        const room = Math.max(3, b.bezelBottom * 0.5)
        p = { ...base, w: Math.min(w, room * 3.2), h: Math.min(h, room), y: -b.height / 2 + b.bezelBottom / 2, text: 'LOGO' }
      } else p = { ...base, w, h, text: 'LOGO' }
      break
    }
    case 'vent':
      p = { ...base, w: Math.min(fs.w * 0.5, 60 * big), h: Math.min(fs.h * 0.4, 12 * big) }
      break
    case 'slot':
      p = { ...base, w: 124, h: 3.2, rot: fs.w < 132 ? 90 : 0 }
      break
    case 'light':
      if (type === 'console') p = { ...base, w: Math.min(60, fs.w * 0.3), h: 1.6, y: -fs.h * 0.25, color: '#5ab4ff' }
      else p = { ...base, w: 1.2 * (big + 1), h: 1.2 * (big + 1), y: type === 'earbuds' ? fs.h * 0.2 : -b.height / 2 + Math.max(2, b.bezelBottom / 2), color: type === 'earbuds' ? '#8dffa8' : '#ffffff' }
      break
  }
  return clampPart(b, p, type)
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
