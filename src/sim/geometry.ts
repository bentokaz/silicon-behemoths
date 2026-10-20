// Pure geometry helpers shared by the scoring code and the 3D builder.
import { sensorInfo } from '../data/catalog'
import { TYPES, ioInfo, standInfo } from '../data/devices'
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
  // the open device: front = the inner screen across both halves, back = the cover screen on one half and the cameras on the other
  foldable: SLAB_FACES,
  // the faces of the visor; the strap takes its sides and the face its back
  headset: { camera: ['front'], light: ['front', 'top'], button: ['top', 'bottom'], port: ['bottom', 'top'], vent: ['top', 'bottom'], logo: ['front', 'top'] },
  // fabric all round: parts go on the top cap and on the flat panel at the back
  speaker: { light: ['top'], button: ['top', 'back'], port: ['back'], logo: ['back', 'top'] },
  // front = the screen and controls; the triggers take the ends of the top edge and the grips the ends of the back
  handheld: { button: ['top'], port: ['bottom', 'top'], vent: ['top', 'back'], grille: ['bottom', 'top'], light: ['front'], logo: ['back', 'front'] },
  ereader: { button: ['bottom', 'top', 'left', 'right'], port: ['bottom', 'top'], light: ['front'], logo: ['back', 'front'] },
  // front = the outside of the band, back = the inside, against the finger
  ring: { island: ['back'], logo: ['front', 'back'], light: ['front'] },
  // back = the lens side, front = the rear screen, top = where the shutter is
  actioncam: { camera: ['back'], island: ['back'], button: ['top', 'left', 'right'], port: ['left', 'right', 'bottom'], grille: ['left', 'right', 'top', 'bottom'], light: ['back', 'front', 'top'], logo: ['back', 'left', 'right', 'front'] },
  // front = the nose, where the gimbal hangs; back = the tail, where the battery goes in
  drone: { camera: ['front'], light: ['back', 'front', 'left', 'right'], button: ['top', 'back'], port: ['back', 'left', 'right'], vent: ['top', 'bottom', 'left', 'right'], logo: ['top', 'left', 'right'] },
  // front = the front panel, back = the rear with its port panel; the side panel over the parts is on the right
  tower: { slot: ['front'], port: ['front', 'top', 'back'], button: ['front', 'top'], light: ['front', 'top'], vent: ['top', 'front', 'back', 'left', 'bottom'], logo: ['front', 'left', 'right', 'top'] },
  monitor: { camera: ['front'], port: ['back', 'bottom', 'left', 'right'], island: ['back'], grille: ['bottom', 'back'], vent: ['back', 'top'], button: ['bottom', 'back', 'right'], light: ['front'], logo: ['front', 'back'] },
  // top = the shell under the palm, front = the nose with the cable, right (+X) = the thumb side, bottom = the base
  mouse: { button: ['top', 'right', 'left'], port: ['front'], light: ['top', 'left', 'right', 'back'], island: ['bottom'], logo: ['top', 'back'] },
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
  if (type === 'headset' && p.kind === 'camera') return 'Tracking camera'
  if (type === 'speaker' && p.kind === 'light') return 'Light ring'
  if (type === 'speaker' && p.kind === 'button') return 'Control button'
  if (type === 'ring' && p.kind === 'island') return 'Sensor window'
  if (type === 'ring' && p.kind === 'light') return 'Status light'
  if (type === 'actioncam' && p.kind === 'island') return 'Lens housing'
  if (type === 'actioncam' && p.kind === 'camera') return 'Main lens'
  if (type === 'actioncam' && p.kind === 'light') return 'Recording light'
  if (type === 'actioncam' && p.kind === 'grille') return 'Microphone'
  if (type === 'actioncam' && p.kind === 'button' && p.face === 'top') return 'Shutter button'
  if (type === 'drone' && p.kind === 'camera') return 'Gimbal camera'
  if (type === 'drone' && p.kind === 'light') return 'Navigation light'
  if (type === 'tower' && p.kind === 'button') return 'Power button'
  if (type === 'tower' && p.kind === 'light') return 'Light strip'
  if (type === 'tower' && p.kind === 'slot') return 'Optical drive bay'
  if (type === 'tower' && p.kind === 'vent') return 'Dust-filtered vent'
  if (type === 'monitor' && p.kind === 'island') return 'Port panel'
  if (type === 'monitor' && p.kind === 'button') return 'Menu button'
  if (type === 'monitor' && p.kind === 'camera') return 'Webcam'
  if (type === 'mouse' && p.kind === 'button') return p.face === 'top' ? 'DPI button' : 'Thumb button'
  if (type === 'mouse' && p.kind === 'island') return 'Sensor window'
  if (type === 'mouse' && p.kind === 'port') return 'Cable port'
  if (type === 'mouse' && p.kind === 'light') return 'Status light'
  return PART_LABELS[p.kind]
}

const FACE_LABELS: Partial<Record<DeviceType, Partial<Record<Face, string>>>> = {
  laptop: { front: 'screen side', back: 'lid', top: 'keyboard deck', bottom: 'rear edge', left: 'left side', right: 'right side' },
  desktop: { top: 'top edge', bottom: 'bottom edge', left: 'left edge', right: 'right edge' },
  tv: { top: 'top edge', bottom: 'bottom edge', left: 'left edge', right: 'right edge' },
  console: { left: 'left side', right: 'right side', bottom: 'underside' },
  earbuds: { front: 'case front', back: 'case back', bottom: 'case underside' },
  foldable: { front: 'inner screen side', back: 'outside', top: 'top edge', bottom: 'bottom edge', left: 'left edge', right: 'right edge' },
  headset: { front: 'visor front', top: 'top of the visor', bottom: 'underside' },
  speaker: { top: 'top', back: 'back panel' },
  handheld: { top: 'top edge', bottom: 'bottom edge' },
  ereader: { top: 'top edge', bottom: 'bottom edge', left: 'left edge', right: 'right edge' },
  ring: { front: 'outside of the band', back: 'inside of the band', top: 'top edge', bottom: 'bottom edge' },
  actioncam: { front: 'screen side', back: 'lens side', left: 'left side', right: 'right side', bottom: 'underside' },
  drone: { front: 'nose', back: 'tail', bottom: 'underside', left: 'left side', right: 'right side' },
  tower: { front: 'front panel', back: 'rear panel', left: 'left side', right: 'side panel', top: 'top', bottom: 'underside' },
  monitor: { top: 'top edge', bottom: 'bottom edge', left: 'left edge', right: 'right edge' },
  mouse: { top: 'shell', front: 'nose', back: 'tail', right: 'thumb side', left: 'outer side', bottom: 'base' },
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

// ---- foldables

/** True for a foldable that folds like a flip phone, about its short axis. */
export const isFlip = (b: Pick<Body, 'fold'>) => b.fold === 'flip'
/** True for the camera set into a book foldable's cover screen: a camera on the back of the half that folds over. */
export const isCoverCam = (d: Pick<DeviceDesign, 'type' | 'body'>, p: Pick<PlacedPart, 'kind' | 'face' | 'x'>) => d.type === 'foldable' && !isFlip(d.body) && p.kind === 'camera' && p.face === 'back' && p.x > 0

/** Half the width of the strip down the middle of a foldable's edges and back that parts keep clear of: the hinge. */
export const HINGE_CLEAR = 4

/**
 * The cover screen of a foldable, in back-face coordinates. It fills the back of
 * the half that folds over, so the cameras and everything else on the back share the other half.
 */
export function coverScreen(b: Body): { x: number; y: number; w: number; h: number; r: number } {
  const m = Math.max(b.bezelSide, 1.2) + 1.4
  if (isFlip(b)) {
    // a flip carries it on the back of its upper half, beside the cameras or right across them
    const top = b.height / 2 - m
    const bottom = HINGE_CLEAR + 2.5
    const size = clamp(Math.round(b.cover ?? 1), 0, 2)
    const wide = b.width - 2 * m
    if (size === 2) return { x: 0, y: (top + bottom) / 2, w: Math.max(10, wide), h: Math.max(10, top - bottom), r: Math.max(b.corner - m, 0.6) }
    const w = Math.max(10, wide * (size === 1 ? 0.56 : 0.5))
    const h = size === 1 ? Math.max(10, Math.min((top - bottom) * 0.62, w)) : 13
    return { x: b.width / 2 - m - w / 2, y: size === 1 ? (top + bottom) / 2 : top - h / 2 - 4, w, h, r: size === 1 ? 5 : 3 }
  }
  return { x: b.width / 4, y: 0, w: Math.max(10, b.width / 2 - 2 * m), h: Math.max(10, b.height - 2 * m), r: Math.max(b.corner - m, 0.6) }
}

// ---- consoles

/** The panels set into the front and back of a console's shell: the rounding of the shell's edges, the rim left round a panel, and the size of the panel. */
export function consoleShape(b: Body): { bevel: number; rim: number; pw: number; ph: number } {
  const small = Math.min(b.width, b.height)
  const bevel = b.edge === 'round' ? Math.min(6, Math.max(1.5, small * 0.07)) : 0.9
  const rim = small < 60 ? 1.6 : 3
  return { bevel, rim, pw: b.width - 2 * bevel - 2 * rim, ph: b.height - 2 * bevel - 2 * rim }
}

/** The exhaust fans in a console's rear panel, in back-face coordinates: one for the simplest cooling, more for the rest. */
export function consoleFans(b: Body, cooling: number): { x: number; y: number; r: number }[] {
  const { pw, ph } = consoleShape(b)
  const n = [1, 2, 2, 3][cooling] ?? 1
  const r = Math.min(ph * 0.3, pw * 0.085, 30)
  return Array.from({ length: n }, (_, i) => ({ x: -pw * 0.2 + (i - (n - 1) / 2) * r * 2.5, y: ph * 0.5 - r * 1.25, r }))
}

// ---- headsets

/** Where a headset's two lenses sit on its face side: the size of the cushion round them, the lens radius and half the distance between their centres. */
export function headsetEyes(b: Body, optics: number): { gw: number; gh: number; wall: number; lr: number; apart: number } {
  const gw = b.width - 8
  const gh = b.height - 6
  const wall = Math.min(13, b.height * 0.14)
  const lr = Math.min((gh - 2 * wall) * 0.44, (gw - 2 * wall) * 0.2) * (optics >= 2 ? 0.9 : 1)
  return { gw, gh, wall, lr, apart: Math.min(Math.max(32, lr + 2.5), (gw - 2 * wall) / 2 - lr - 2) }
}

/** Rim of shell around a headset's front plate, and rounding of the visor's edges. */
export function visorShape(b: Body): { bevel: number; rim: number } {
  return { bevel: b.edge === 'round' ? clamp(Math.min(b.height, b.thickness) * 0.12, 3, 10) : 2.2, rim: 3 }
}

// ---- speakers

export interface SpeakerShape {
  form: 'column' | 'orb' | 'block'
  /** Rounding where the fabric meets the top and the base. */
  bevel: number
  /** Corner radius of the outline seen from above; half the width for the round forms. */
  corner: number
  /** Half-axes of the flat top. */
  capX: number
  capZ: number
  /** Vertical half-axis of an orb before its top and base are cut flat. */
  ry: number
  /** How far the flat panel at the back is cut into the body, and the size of that panel. */
  backSink: number
  backW: number
  backH: number
  /** The same for the flat at the front that carries a screen. Zero and null without one. */
  frontSink: number
  screen: { w: number; h: number; r: number; y: number } | null
  /** Volume of the enclosure. */
  litres: number
}

/** Share of an orb's height that is left after its top and base are cut flat. */
const ORB_CUT = 0.88

/** Everything about the shape of a speaker that the model, the layout and the scoring share. */
export function speakerShape(b: Body): SpeakerShape {
  const form = b.form ?? 'column'
  const rx = b.width / 2
  const rz = b.thickness / 2
  const small = Math.min(b.width, b.thickness, b.height)
  let s: SpeakerShape
  if (form === 'block') {
    const corner = clamp(b.corner, 3, Math.min(rx, rz) - 1)
    const bevel = b.edge === 'round' ? clamp(small * 0.08, 3, 10) : 2
    const sw = Math.max(24, b.width - 2 * corner - 6)
    const sh = Math.min(sw * 0.64, b.height - 2 * bevel - 8)
    s = { form, bevel, corner, capX: rx - bevel, capZ: rz - bevel, ry: b.height / 2, backSink: 0, backW: Math.max(16, b.width - 2 * corner - 4), backH: b.height - 2 * bevel - 4, frontSink: 0, screen: { w: sw, h: sh, r: Math.min(6, sh * 0.12), y: 0 }, litres: ((b.width * b.thickness - (4 - Math.PI) * corner * corner) * b.height * 0.96) / 1e6 }
  } else if (form === 'orb') {
    const ry = b.height / 2 / ORB_CUT
    const cap = Math.sqrt(1 - ORB_CUT * ORB_CUT)
    const back = Math.sqrt(1 - 0.84 * 0.84)
    const front = Math.sqrt(1 - 0.76 * 0.76)
    const dia = 2 * Math.min(rx * front, ry * front, b.height / 2 - 2) - 8
    s = { form, bevel: 0, corner: rx, capX: rx * cap, capZ: rz * cap, ry, backSink: rz * 0.16, backW: 2 * rx * back * 0.66, backH: 2 * Math.min(ry * back * 0.66, b.height / 2 - 3), frontSink: rz * 0.24, screen: { w: dia, h: dia, r: dia / 2, y: 0 }, litres: ((4 / 3) * Math.PI * rx * rz * ry * 0.92) / 1e6 }
  } else {
    const bevel = b.edge === 'round' ? clamp(small * 0.16, 4, 18) : 3
    const flatH = b.height - 2 * bevel
    const sw = b.width * 0.74 - 8
    const sh = Math.min(sw * 0.64, flatH - 8)
    s = { form: 'column', bevel, corner: rx, capX: rx - bevel, capZ: rz - bevel, ry: b.height / 2, backSink: rz * 0.2, backW: b.width * 0.6 * 0.9, backH: flatH - 4, frontSink: rz * (1 - Math.sqrt(1 - 0.74 * 0.74)), screen: { w: sw, h: sh, r: Math.min(5, sh * 0.12), y: Math.max(0, (flatH - sh) / 2 - 6) * 0.5 }, litres: (Math.PI * rx * rz * b.height * 0.95) / 1e6 }
  }
  if (!b.screen) {
    s.frontSink = 0
    s.screen = null
  }
  return s
}

/** How far below the nominal box of the body a face really lies. Only a speaker's flats are sunk into its curves. */
export function faceSink(b: Body, face: Face, type: DeviceType): number {
  if (type !== 'speaker') return 0
  const s = speakerShape(b)
  return face === 'back' ? s.backSink : face === 'front' ? s.frontSink : 0
}

// ---- handhelds

/** Width at each end of a handheld's top edge taken by the shoulder buttons, and at each end of its back by the grips. */
export const SHOULDER = 58
export const GRIP = 60

/** Where the controls sit on the front of a handheld: the centre line of each flank, and the height of the upper and lower control. */
export function handheldControls(b: Body): { x: number; up: number; down: number; r: number } {
  const flank = TYPES.handheld.flank ?? 44
  return { x: b.width / 2 - flank / 2 - 1.5, up: b.height * 0.2, down: -b.height * 0.2, r: Math.min(10, b.height * 0.105) }
}

// ---- drones

export interface DroneShape {
  /** Rounding of the fuselage's top and bottom edges, and the corner radius of its outline seen from above. */
  round: number
  plan: number
  /** Where the four motors are, in body coordinates (x across, z along, nose at +z): front left, front right, back left, back right. */
  motors: { x: number; z: number }[]
  /** Height of the arms' centre line, thickness of an arm, and size of a motor. */
  armY: number
  arm: number
  motorR: number
  motorH: number
  /** Radius of the disc each propeller sweeps. */
  propR: number
  /** Half the span of the whole drone, arms and propellers included, across and along. */
  spanX: number
  spanZ: number
}

/** Everything about the shape of a drone that the model, the layout and the scoring share. Its length is the body's thickness. */
export function droneShape(b: Body): DroneShape {
  const L = b.thickness
  const round = b.edge === 'round' ? clamp(b.height * 0.3, 3, 14) : 1.6
  const plan = clamp(Math.min(b.width * 0.36, b.corner * 2.4), 4, b.width / 2 - 1)
  const reach = L * 0.42
  const x = b.width / 2 + reach
  const propR = L * 0.31
  const motors = [
    { x: -x, z: L * 0.47 },
    { x, z: L * 0.47 },
    { x: -x, z: -L * 0.43 },
    { x, z: -L * 0.43 },
  ]
  return { round, plan, motors, armY: b.height * 0.18, arm: clamp(L * 0.055, 5, 14), motorR: clamp(L * 0.062, 5, 16), motorH: clamp(L * 0.09, 7, 22), propR, spanX: x + propR, spanZ: L * 0.47 + propR }
}

// ---- action cameras

/** The selfie screen beside an action camera's lens, in lens-side (back face) coordinates, if it has one room for one. */
export function selfieScreen(b: Body): { x: number; y: number; w: number; h: number; r: number } {
  const housing = Math.min(b.height - 6, b.width * 0.5, 34)
  const side = Math.max(8, Math.min(b.width - housing - 13, b.height - 10))
  return { x: -(b.width / 2 - side / 2 - 4), y: 0, w: side, h: side, r: Math.min(3, side * 0.12) }
}

// ---- rings

/** A ring's band: the radius to the outside, to the inside, and of the rounding of its edges. */
export function ringShape(b: Body): { outer: number; inner: number; round: number } {
  const outer = b.width / 2
  const inner = Math.max(4, outer - b.thickness)
  return { outer, inner, round: b.edge === 'round' ? Math.min(b.thickness * 0.48, b.height * 0.3) : Math.min(0.45, b.thickness * 0.2) }
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
const uprightSides = (type: DeviceType) => type === 'console' || type === 'drone' || type === 'tower' || type === 'mouse'

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
  if (type === 'console' || type === 'tower' || type === 'mouse' || type === 'earbuds' || type === 'headset' || type === 'speaker' || type === 'drone' || type === 'ring') return false
  return isSide(mountOf(type, face).face)
}

/** Thickness of the part of the body that carries edge parts. A laptop's ports sit on its base. */
export const edgeThickness = (b: Body, type: DeviceType) => (type === 'laptop' ? laptopSplit(b).base : b.thickness)

/** Width/height of a face in part coordinates. */
export function faceSize(b: Body, face: Face, type: DeviceType = 'phone'): { w: number; h: number } {
  if (type === 'speaker' && (face === 'top' || face === 'back')) {
    // the flat top, less its rounded rim, and the flat panel cut into the back
    const s = speakerShape(b)
    if (face === 'back') return { w: s.backW, h: s.backH }
    return s.form === 'block' ? { w: 2 * s.capX - 2, h: 2 * s.capZ - 2 } : { w: 2 * s.capX * 0.72, h: 2 * s.capZ * 0.72 }
  }
  const m = mountOf(type, face)
  const c = carrierBody(b, type, m.carrier)
  if (m.face === 'front' || m.face === 'back') return { w: c.width, h: c.height }
  if (m.face === 'left' || m.face === 'right') return uprightSides(type) ? { w: c.thickness, h: c.height } : { w: c.height, h: c.thickness }
  return { w: c.width, h: c.thickness }
}

/** Strip at each end of a face that parts must keep clear of, where the surface curves away. */
function faceInset(b: Body, face: Face, type: DeviceType): { x: number; y: number } {
  const fs = faceSize(b, face, type)
  if (type === 'drone') {
    // the shell is rounded all over: keep parts to the flatter middle of each face
    const r = droneShape(b).round
    return { x: Math.min(r, fs.w * 0.3), y: Math.min(r, fs.h * 0.3) }
  }
  if (type === 'ring') return { x: 0, y: Math.min(1, fs.h * 0.2) }
  if (type === 'mouse') {
    // the shell curves away all round: keep parts to its crown and the middle of each side
    if (face === 'top') return { x: Math.min(b.width * 0.22, fs.w * 0.3), y: Math.min(b.thickness * 0.18, fs.h * 0.3) }
    if (face === 'left' || face === 'right') return { x: Math.min(b.thickness * 0.22, fs.w * 0.3), y: Math.min(b.height * 0.25, fs.h * 0.3) }
    return { x: Math.min(b.width * 0.2, fs.w * 0.3), y: Math.min(b.height * 0.2, fs.h * 0.3) }
  }
  if (type === 'console' || type === 'tower') {
    if (face === 'top' || face === 'bottom') return { x: Math.min(b.corner, fs.w * 0.3), y: 2 }
    if (face === 'left' || face === 'right') return { x: 2, y: Math.min(b.corner, fs.h * 0.3) }
    return { x: 0, y: 0 }
  }
  if (type === 'earbuds') {
    const cs = caseShape(b)
    if (face === 'bottom') return { x: Math.min(cs.foot * 0.6 + cs.bevel * 0.5, fs.w * 0.35), y: Math.min(cs.bevel, fs.h * 0.3) }
    return { x: Math.min(cs.foot, fs.w * 0.35), y: Math.min(cs.bevel * 0.6, fs.h * 0.25) }
  }
  if (type === 'headset') {
    const v = visorShape(b)
    if (face === 'front') return { x: Math.min(v.bevel + v.rim + 2, fs.w * 0.2), y: Math.min(v.bevel + v.rim + 1, fs.h * 0.2) }
    return { x: Math.min(Math.max(b.corner, v.bevel) + 2, fs.w * 0.3), y: Math.min(v.bevel + 2, fs.h * 0.25) }
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

/**
 * What kind of cut-out a notch part is: one hanging from the top edge of the screen is a notch, or a waterdrop when
 * it is small and fully rounded; one standing clear of the edge is a pill (an island in the screen).
 */
export function notchStyle(b: Body, p: PlacedPart): 'notch' | 'drop' | 'pill' {
  const scr = screenRect(b)
  const gap = scr.cy + scr.h / 2 - (p.y + p.h / 2)
  if (gap >= 0.8) return 'pill'
  return p.w <= 14 && (p.r ?? 0) >= Math.min(p.w, p.h) / 2 - 0.6 ? 'drop' : 'notch'
}

/** Bevel of the body edge. Round edges adapt so the screen always sits on flat glass. */
export function edgeBevel(b: Body): number {
  if (b.edge === 'flat') return 0.35
  const minBezel = Math.min(b.bezelSide, b.bezelTop, b.bezelBottom)
  return clamp(minBezel - 0.1, 0.35, Math.min(2.5, b.thickness * 0.35))
}

/** Gap between a stand-mounted panel and the desk it stands on. */
export const standLift = (b: Body, type: DeviceType) => (type === 'tv' ? Math.round(b.height * 0.075) : type === 'monitor' ? Math.round(b.height * 0.26) : Math.round(b.height * 0.2))

/** The patch on the back that a desktop's stand bolts to, in back-face coordinates. Null if nothing is there. */
export function standMount(b: Body, type: DeviceType): { x: number; y: number; w: number; h: number } | null {
  if (type !== 'desktop' || standInfo(type, b.stand).id === 'feet') return null
  return { x: 0, y: -b.height * 0.16, w: Math.max(70, b.width * 0.17), h: 46 }
}

/**
 * The turn a part's knob asks for: `startRot` is the part's turn when the knob was taken, and (x, y) is where the
 * pointer is now in the part's own plane *as it was then*. Measured against that fixed frame, not against the part as
 * last drawn, the answer does not depend on whether the model has caught up with the last step yet (it used to add
 * the same angle again from a stale frame, and the part ran off or jittered). In 15 degree steps, 0 to 345.
 */
export function knobTurn(startRot: number, x: number, y: number): number {
  const by = (Math.atan2(-x, y) * 180) / Math.PI
  return (((Math.round((startRot + by) / 15) * 15) % 360) + 360) % 360
}

/** Whether a part can be turned at all: not on an edge, not round, and not on a ring's curved band. */
export const canTurn = (p: PlacedPart, type: DeviceType) => !isEdge(p.face, type) && type !== 'ring'

/**
 * A part turned to `rot`, or null when it cannot turn that far where it is: when the turned part would no longer fit
 * its face it would have to be shrunk, and a turn must never quietly shrink a part (turning it back would not grow it again).
 */
export function turnPart(b: Body, p: PlacedPart, rot: number, type: DeviceType): PlacedPart | null {
  if (!canTurn(p, type)) return rot === p.rot ? p : null
  const q = clampPart(b, { ...p, rot }, type)
  return q.w < p.w - 1e-6 || q.h < p.h - 1e-6 ? null : q
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
  // a field cleared in the editor, or a drag that ran off the device, can hand over something that is not a
  // number: a part with no place goes to the middle of its face, and one with no size gets a small one
  if (!Number.isFinite(q.x)) q.x = 0
  if (!Number.isFinite(q.y)) q.y = 0
  if (!Number.isFinite(q.rot)) q.rot = 0
  if (!Number.isFinite(q.w) || q.w <= 0) q.w = 2
  if (!Number.isFinite(q.h) || q.h <= 0) q.h = 2
  if (isEdge(face, type)) {
    // a part on an edge can never be taller than the edge is thick
    const room = Math.max(0.8, fs.h - 1.2)
    if (q.crown) q.w = q.h = Math.min(Math.max(q.w, q.h), room)
    else q.h = Math.min(q.h, room)
    if (q.kind === 'fingerprint') q.w = Math.max(q.w, 8)
    q.rot = 0
  }
  // a ring's parts follow the curve of the band, which has no turn to give them
  if (type === 'ring') q.rot = 0
  const inset = faceInset(b, face, type)
  let e = partExtent(q)
  // a part bigger than the face it sits on is made to fit: it is drawn, scored and paid for at the size it really is
  const fit = Math.min(1, Math.max(0.5, fs.w - 2 * inset.x) / e.w, Math.max(0.5, fs.h - 2 * inset.y) / e.h)
  if (fit < 1) {
    q.w = Math.floor(q.w * fit * 100) / 100
    q.h = Math.floor(q.h * fit * 100) / 100
    if (q.r !== undefined) q.r = Math.min(q.r, q.w / 2, q.h / 2)
    e = partExtent(q)
  }
  let maxX = Math.max(0, fs.w / 2 - inset.x - e.w / 2)
  const maxY = Math.max(0, fs.h / 2 - inset.y - e.h / 2)
  if (type === 'handheld') {
    // the triggers, the grips and the controls beside the screen leave only the middle free
    const free = face === 'top' ? b.width / 2 - SHOULDER : face === 'back' ? b.width / 2 - GRIP : face === 'front' ? screenRect(b).w / 2 : fs.w
    maxX = Math.max(0, Math.min(maxX, free - e.w / 2))
  }
  q.x = clamp(q.x, -maxX, maxX)
  q.y = clamp(q.y, -maxY, maxY)
  if (type === 'foldable' && isFlip(b)) {
    // the hinge runs across the middle: nothing sits on it, on the faces or on the two long edges
    if (face === 'front' || face === 'back') {
      const clear = (face === 'front' ? 3 : HINGE_CLEAR) + e.h / 2
      if (Math.abs(q.y) < clear && clear <= maxY) q.y = q.y < 0 ? -clear : clear
    } else if (face === 'left' || face === 'right') {
      const clear = HINGE_CLEAR + e.w / 2
      if (Math.abs(q.x) < clear && clear <= maxX) q.x = q.x < 0 ? -clear : clear
    }
  } else if (type === 'foldable' && !(face === 'left' || face === 'right')) {
    if (face === 'back' && q.kind === 'camera' && q.x > 0) {
      // a camera on the half that folds over looks out through the cover screen, so it stays inside it
      const cov = coverScreen(b)
      q.x = clamp(q.x, cov.x - cov.w / 2 + e.w / 2 + 1, cov.x + cov.w / 2 - e.w / 2 - 1)
      q.y = clamp(q.y, cov.y - cov.h / 2 + e.h / 2 + 1, cov.y + cov.h / 2 - e.h / 2 - 1)
    } else if (face === 'back') {
      // the half that folds over carries the cover screen, so everything else on the back shares the other half
      q.x = Math.max(-maxX, Math.min(q.x, -(HINGE_CLEAR + e.w / 2)))
    } else {
      // nothing sits across the hinge
      const clear = (face === 'front' ? 3 : HINGE_CLEAR) + e.w / 2
      if (Math.abs(q.x) < clear && clear <= maxX) q.x = q.x < 0 ? -clear : clear
    }
  }
  if (type === 'laptop' && face === 'top' && onKeyboard(b, q)) {
    // nothing fits between the keys: a part pushed onto the keyboard slides to the nearer strip of open deck
    const k = laptopDeck(b)
    const above = k.y + k.h / 2 + e.h / 2
    const below = k.y - k.h / 2 - e.h / 2
    q.y = above <= maxY && (above - q.y <= q.y - below || below < -maxY) ? above : Math.max(below, -maxY)
  }
  if ((type === 'phone' || type === 'tablet') && (face === 'front' || face === 'back')) {
    // the corners of the slab are rounded: a part pushed into one slides in along the diagonal until it is inside the outline
    const r = Math.min(b.corner, fs.w / 2, fs.h / 2)
    const dx = Math.abs(q.x) + e.w / 2 - (fs.w / 2 - r)
    const dy = Math.abs(q.y) + e.h / 2 - (fs.h / 2 - r)
    const d = Math.hypot(dx, dy)
    if (dx > 0 && dy > 0 && d > r) {
      const k = r / d
      q.x -= Math.sign(q.x) * Math.min(Math.abs(q.x), dx * (1 - k))
      q.y -= Math.sign(q.y) * Math.min(Math.abs(q.y), dy * (1 - k))
    }
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
  const big = type === 'tv' ? 3 : type === 'desktop' || type === 'monitor' ? 2 : type === 'console' || type === 'tower' ? 1.5 : 1
  let p: PlacedPart
  switch (kind) {
    case 'camera': {
      if (type === 'headset') {
        // a tracking camera looks out through the front plate
        p = { ...base, w: 8, h: 8, sensor: Math.max(0, sensorLevel - 1), lens: 'wide', x: fs.w * 0.3, y: fs.h * 0.22 }
        break
      }
      if (type === 'drone' || type === 'actioncam') {
        // the one big lens: under a drone's nose on its gimbal, or beside an action camera's front screen
        const dia = sensorInfo(sensorLevel).minDia + (type === 'actioncam' ? 6 : 3)
        p = { ...base, w: dia, h: dia, sensor: sensorLevel, lens: 'wide', x: type === 'actioncam' ? fs.w * 0.2 : 0, y: type === 'actioncam' ? fs.h * 0.08 : -fs.h * 0.12 }
        break
      }
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
      else if (type === 'ring') p = { ...base, w: 7, h: Math.max(2, b.height - 3), r: 1.2, finish: 'black' }
      else if (type === 'actioncam') p = { ...base, w: Math.min(34, fs.h - 6), h: Math.min(34, fs.h - 6), r: 7, finish: 'black', x: fs.w * 0.2 }
      else if (type === 'desktop' || type === 'tv' || type === 'monitor') p = { ...base, w: 70 * big, h: 40 * big, r: 6, finish: 'black', x: fs.w * 0.25 }
      else if (type === 'mouse') p = { ...base, w: 14, h: 18, r: 3, finish: 'black', y: 0 }
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
      else if (type === 'tower') p = { ...base, w: 11, h: 11, y: fs.h / 2 - 20 }
      else if (type === 'mouse') p = base.face === 'top' ? { ...base, w: 5, h: 7, y: -fs.h * 0.1 } : { ...base, w: 11, h: 4.5, x: -fs.w * 0.08, y: fs.h * 0.1 }
      else if (type === 'earbuds') p = { ...base, w: 5, h: 5 }
      else if (type === 'desktop' || type === 'tv' || type === 'monitor') p = { ...base, w: 12, h: 12, x: fs.w / 2 - 40, y: -fs.h / 2 + 40 }
      else if (type === 'headset') p = { ...base, w: 12, h: 5, x: fs.w * 0.3 }
      else if (type === 'speaker') p = { ...base, w: Math.max(5, Math.min(10, fs.w * 0.16)), h: Math.max(5, Math.min(10, fs.w * 0.16)), y: fs.h * 0.25 }
      else if (type === 'handheld') p = { ...base, w: 10, h: 2.6, x: 24 }
      else if (type === 'actioncam') p = { ...base, w: 11, h: Math.min(9, b.thickness - 6), x: -fs.w * 0.22 }
      else if (type === 'drone') p = { ...base, w: 7, h: 7, y: -fs.h * 0.25 }
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
      const w = type === 'laptop' ? 44 : type === 'watch' ? 14 : type === 'earbuds' ? 16 : type === 'ring' ? 9 : type === 'actioncam' ? 16 : 22 * big
      const h = type === 'laptop' ? 14 : type === 'watch' ? 4 : type === 'earbuds' ? 5 : type === 'ring' ? 2.4 : type === 'actioncam' ? 4.5 : 7 * big
      // on a screen, the logo goes in the bezel below it
      if ((type === 'tv' || type === 'desktop' || type === 'monitor') && face === 'front') {
        const room = Math.max(3, b.bezelBottom * 0.5)
        p = { ...base, w: Math.min(w, room * 3.2), h: Math.min(h, room), y: -b.height / 2 + b.bezelBottom / 2, text: 'LOGO' }
      } else p = { ...base, w, h, text: 'LOGO' }
      break
    }
    case 'vent':
      p = { ...base, w: Math.min(fs.w * 0.5, 60 * big), h: Math.min(fs.h * 0.4, 12 * big) }
      break
    case 'slot':
      p = type === 'tower' ? { ...base, w: 148, h: 12, y: fs.h / 2 - 30, rot: fs.w < 156 ? 90 : 0 } : { ...base, w: 124, h: 3.2, rot: fs.w < 132 ? 90 : 0 }
      break
    case 'light':
      if (type === 'console') p = { ...base, w: Math.min(60, fs.w * 0.3), h: 1.6, y: -fs.h * 0.25, color: '#5ab4ff' }
      else if (type === 'tower') p = { ...base, w: 3, h: Math.min(fs.h * 0.7, 300), x: fs.w / 2 - 12, color: '#ff6b1a' }
      else if (type === 'mouse') p = { ...base, w: 2, h: 2, y: fs.h * 0.25, color: '#8dffa8' }
      else if (type === 'speaker') p = lightRing(b, base)
      else if (type === 'headset') p = { ...base, w: 12, h: 1.4, y: -fs.h * 0.3, color: '#ffffff' }
      else if (type === 'drone') p = { ...base, w: 8, h: 1.6, color: '#ff4d3d' }
      else if (type === 'ring') p = { ...base, w: 1.2, h: 1.2, color: '#8dffa8' }
      else if (type === 'actioncam') p = { ...base, w: 2.4, h: 2.4, x: -fs.w * 0.36, y: fs.h * 0.34, color: '#ff3b30' }
      else p = { ...base, w: 1.2 * (big + 1), h: 1.2 * (big + 1), y: type === 'earbuds' ? fs.h * 0.2 : -b.height / 2 + Math.max(2, b.bezelBottom / 2), color: type === 'earbuds' ? '#8dffa8' : '#ffffff' }
      break
  }
  return clampPart(b, p, type)
}

/**
 * The light on top of a speaker: a ring just inside the rim of a round top, or a
 * bar along the front edge of a square one.
 */
export function lightRing<T extends { face: Face }>(b: Body, base: T): T & { face: Face; x: number; y: number; w: number; h: number; color: string } {
  const s = speakerShape(b)
  if (s.form === 'block') return { ...base, face: 'top', x: 0, y: -(s.capZ - 5), w: Math.max(12, s.capX * 0.9), h: 2, color: '#5ab4ff' }
  return { ...base, face: 'top', x: 0, y: 0, w: 2 * s.capX * 0.9, h: 2 * s.capZ * 0.9, color: '#5ab4ff' }
}

/** True for a light part that is drawn as a ring: the one round a speaker's top. */
export const isRing = (p: Pick<PlacedPart, 'kind' | 'w' | 'h'>, type: DeviceType) => type === 'speaker' && p.kind === 'light' && Math.min(p.w, p.h) >= 12

export function rectsOverlap(a: PlacedPart, b: PlacedPart, tol = 0.2): boolean {
  const ea = partExtent(a)
  const eb = partExtent(b)
  return Math.abs(a.x - b.x) < (ea.w + eb.w) / 2 - tol && Math.abs(a.y - b.y) < (ea.h + eb.h) / 2 - tol
}

export function contains(outer: PlacedPart, inner: PlacedPart): boolean {
  const eo = partExtent(outer)
  return Math.abs(inner.x - outer.x) <= eo.w / 2 && Math.abs(inner.y - outer.y) <= eo.h / 2
}

/**
 * Where the sockets go on a speaker's back panel: the power inlet and whatever
 * else was chosen, in centred rows from the bottom up. `fits` is false if the
 * panel has no room for them all, and `top` is where the last row ends.
 */
export function speakerSockets(body: Body, io: string[] | undefined): { sockets: { id: string; x: number; y: number; w: number; h: number }[]; top: number; fits: boolean } {
  const back = faceSize(body, 'back', 'speaker')
  const list = [{ id: 'power', size: [9, 9] }, ...(io ?? []).flatMap((id) => {
      const info = ioInfo('speaker', id)
      return info?.size && (info.face ?? 'back') === 'back' ? Array.from({ length: info.count ?? 1 }, () => ({ id, size: info.size as number[] })) : []
    })]
  const gap = 5
  const wide = back.w - 4
  const rows: (typeof list)[] = [[]]
  for (const p of list) {
    const row = rows[rows.length - 1]
    const used = row.reduce((a, q) => a + q.size[0] + gap, 0)
    if (row.length && used + p.size[0] > wide) rows.push([p])
    else row.push(p)
  }
  const out: { id: string; x: number; y: number; w: number; h: number }[] = []
  let y = -back.h / 2 + 2.5
  for (const row of rows) {
    const rowH = Math.max(...row.map((p) => p.size[1]))
    let x = -(row.reduce((a, p) => a + p.size[0], 0) + gap * (row.length - 1)) / 2
    for (const p of row) {
      out.push({ id: p.id, x: x + p.size[0] / 2, y: y + rowH / 2, w: p.size[0], h: p.size[1] })
      x += p.size[0] + gap
    }
    y += rowH + 3
  }
  return { sockets: out, top: y, fits: y - 3 <= back.h / 2 - 2 && list.every((p) => p.size[0] <= wide) }
}
