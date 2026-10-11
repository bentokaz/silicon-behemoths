// Device types, their markets, and the companies that compete in them.
import type { DeviceType, Face, PartKind, SegmentId, SubScores } from '../sim/types'

export interface TypeSpec {
  name: string
  plural: string
  /** Word used in default product names, e.g. "Acme Tab 1". */
  series: string
  /** [min, max, default] in mm. */
  width: [number, number, number]
  height: [number, number, number]
  maxThickness: number
  /** Added to the research-driven minimum thickness. */
  thickBase: number
  /** Multiplies the research-driven minimum thickness. 0 gives a fixed minimum of thickBase. */
  thickScale?: number
  /** Multiplies the research-driven minimum bezel. */
  bezelScale: number
  /** Names of the three body dimensions, where they differ from width, height, thickness. */
  dims?: [string, string, string]
  /** Body presets offered by the simple editor. Without them it offers four steps between min and max. */
  sizes?: { name: string; width: number; height: number; thickness?: number }[]
  /** The whole shell is one material, so the back follows the frame. */
  oneShell?: boolean
  /** True for devices with no display of their own. */
  noScreen?: boolean
  /** Screen diagonals (inches) that score full marks. */
  diag: [number, number]
  /** Weight in grams: full marks at or below the first, zero at the second. */
  weight: [number, number]
  /** Large panels: the weight limits grow with the area of the body. */
  weightByArea?: boolean
  /** Grams per cm3 of everything that is not battery, frame or glass. */
  density: number
  /** Screen-to-body ratio that scores zero. */
  sbrFloor: number
  /** Thickness above the minimum that still scores full marks, and the range to zero. */
  thin: [number, number]
  /** Usable battery volume: margins in mm and the fill factor. */
  batt: { mx: number; my: number; mt: number; fill: number }
  /**
   * Set for devices that run from the wall. They have no battery, and the battery
   * score is made of cooling and sound instead, in these shares.
   */
  mains?: { cool: number; sound: number }
  /** Mains devices: watts of heat per unit of chip power. */
  heat?: number
  /** Battery drain independent of the screen. */
  drainBase: number
  /** Converts battery life into score, and into hours for display. */
  lifeScore: number
  lifeHours: number
  chipCost: number
  panelCost: number
  assembly: number
  /** Factory capacity one unit uses, relative to a phone. */
  capacity: number
  devCost: number
  /** RAM and storage needs relative to a phone. 0 hides the choice. */
  memory: number
  /** Multiplies what the body materials cost. A big panel's shell is thin sheet, not a milled block. */
  matCost?: number
  /** True if a discrete graphics card can be fitted. */
  gpu?: boolean
  /** Multiplies what a graphics card costs (consoles buy theirs in bulk). */
  gpuCost?: number
  /** The input device sold with it, chosen from KEYBOARDS or CONTROLLERS. */
  input?: 'keyboard' | 'controller'
  /** What the third sub-score means for this type. */
  special: 'camera' | 'sensors' | 'io' | 'games' | 'smarts' | 'ports'
  specialLabel: string
  /** Names of the other sub-scores, where they differ from the usual ones. */
  labels?: Partial<Record<keyof SubScores, string>>
  /** Which stock owner comments fit each sub-score (keys of PRAISE and GRIPES in the market code). */
  voice?: Partial<Record<keyof SubScores, string>>
  /** Heading for the list of ports, sensors or features (see ioOptions). */
  ioLabel?: string
  /** Extras (ids from EXTRAS) that make sense for this type. */
  extras: string[]
  /** The face the device is shown from, and whose layout is judged for tidiness. */
  hero: 'front' | 'back'
}

/** Body of a 16:9 panel of the given diagonal with slim bezels. */
const panelSize = (inches: number, chin = 0) => ({ name: `${inches}"`, width: Math.round(inches * 22.14 + 12), height: Math.round(inches * 12.45 + 14 + chin) })

export const TYPES: Record<DeviceType, TypeSpec> = {
  phone: {
    name: 'Phone', plural: 'Phones', series: '', width: [58, 92, 74], height: [120, 185, 158], maxThickness: 14, thickBase: 0, bezelScale: 1, diag: [6, 7.1], weight: [190, 265], density: 0.55, sbrFloor: 0.65, thin: [1.2, 4.5],
    batt: { mx: 6, my: 30, mt: 3.6, fill: 0.42 }, drainBase: 12, lifeScore: 0.9, lifeHours: 0.3, chipCost: 1, panelCost: 1, assembly: 12, capacity: 1, devCost: 1, memory: 1, special: 'camera', specialLabel: 'Camera',
    extras: ['nfc', 'stereo', 'ip68', 'wireless', 'sat'], hero: 'back',
  },
  tablet: {
    name: 'Tablet', plural: 'Tablets', series: 'Tab', width: [130, 230, 178], height: [190, 310, 250], maxThickness: 11, thickBase: -1, bezelScale: 2, diag: [10, 13.2], weight: [480, 760], density: 0.75, sbrFloor: 0.62, thin: [0.9, 3.2],
    batt: { mx: 10, my: 20, mt: 3.2, fill: 0.25 }, drainBase: 22, lifeScore: 1.75, lifeHours: 0.28, chipCost: 1.2, panelCost: 0.55, assembly: 18, capacity: 1.4, devCost: 1.2, memory: 1, special: 'camera', specialLabel: 'Camera',
    extras: ['nfc', 'stereo', 'ip68'], hero: 'back',
  },
  watch: {
    name: 'Watch', plural: 'Watches', series: 'Watch', width: [32, 52, 42], height: [34, 56, 46], maxThickness: 16, thickBase: 2.5, bezelScale: 0.9, diag: [1.5, 2.3], weight: [42, 90], density: 0.9, sbrFloor: 0.42, thin: [1.5, 4],
    batt: { mx: 8, my: 8, mt: 6, fill: 0.22 }, drainBase: 3, lifeScore: 1.6, lifeHours: 1.1, chipCost: 0.4, panelCost: 1.6, assembly: 9, capacity: 0.6, devCost: 0.7, memory: 0, special: 'sensors', specialLabel: 'Sensors',
    ioLabel: 'Health sensors', extras: ['nfc', 'ip68', 'wireless'], hero: 'back',
  },
  laptop: {
    name: 'Laptop', plural: 'Laptops', series: 'Book', width: [280, 400, 322], height: [190, 285, 222], maxThickness: 30, thickBase: 4, bezelScale: 2.2, dims: ['Width', 'Depth', 'Thickness'], oneShell: true, diag: [13.2, 17.5], weight: [1300, 2600], density: 0.68, sbrFloor: 0.68, thin: [3, 12],
    batt: { mx: 20, my: 90, mt: 6, fill: 0.2 }, drainBase: 150, lifeScore: 2.3, lifeHours: 0.4, chipCost: 2.4, panelCost: 0.5, assembly: 45, capacity: 2.2, devCost: 1.8, memory: 2, gpu: true, input: 'keyboard', special: 'io', specialLabel: 'Keyboard and ports',
    ioLabel: 'Ports', extras: ['stereo'], hero: 'front',
  },
  // An all-in-one: the computer lives behind the display, or in a chin below it.
  desktop: {
    name: 'Desktop', plural: 'Desktops', series: 'Studio', width: [470, 740, 548], height: [270, 500, 360], maxThickness: 70, thickBase: -11, thickScale: 5, bezelScale: 3, oneShell: true, diag: [23, 34], weight: [4800, 9000], weightByArea: true, density: 0.55, sbrFloor: 0.72, thin: [4, 26],
    sizes: [panelSize(21.5, 34), panelSize(24, 34), panelSize(27, 36), panelSize(32, 38)],
    batt: { mx: 0, my: 0, mt: 0, fill: 0 }, mains: { cool: 0.5, sound: 0.5 }, heat: 1.5, drainBase: 0, lifeScore: 0, lifeHours: 0, chipCost: 2.4, panelCost: 0.15, matCost: 0.7, assembly: 60, capacity: 3, devCost: 1.8, memory: 2, gpu: true, input: 'keyboard', special: 'io', specialLabel: 'Keyboard, ports and webcam',
    labels: { battery: 'Cooling and sound' }, voice: { battery: 'cooling', design: 'look' }, ioLabel: 'Ports', extras: [], hero: 'front',
  },
  // A home games console. Its "thickness" is the depth of the box, front to back.
  console: {
    name: 'Console', plural: 'Consoles', series: 'Box', width: [90, 420, 290], height: [40, 330, 72], maxThickness: 330, thickBase: 120, thickScale: 0, bezelScale: 1, dims: ['Width', 'Height', 'Depth'], oneShell: true, noScreen: true, diag: [0, 0], weight: [2600, 5600], density: 0.43, sbrFloor: 0, thin: [0, 0],
    sizes: [{ name: 'Slim', width: 262, height: 48, thickness: 214 }, { name: 'Standard', width: 290, height: 72, thickness: 250 }, { name: 'Cube', width: 196, height: 196, thickness: 196 }, { name: 'Tower', width: 104, height: 300, thickness: 262 }],
    batt: { mx: 0, my: 0, mt: 0, fill: 0 }, mains: { cool: 1, sound: 0 }, heat: 2.2, drainBase: 0, lifeScore: 0, lifeHours: 0, chipCost: 1.1, panelCost: 0, assembly: 34, capacity: 1.8, devCost: 1.6, memory: 2, gpu: true, gpuCost: 0.45, input: 'controller', special: 'games', specialLabel: 'Controller and features',
    labels: { display: 'Picture output', battery: 'Cooling and noise' }, voice: { display: 'graphics', camera: 'games', battery: 'cooling', design: 'look' }, ioLabel: 'Drive and ports', extras: [], hero: 'front',
  },
  // A charging case and two buds. The body is the case; the buds follow from the specs.
  earbuds: {
    name: 'Earbuds', plural: 'Earbuds', series: 'Buds', width: [44, 76, 58], height: [28, 62, 48], maxThickness: 34, thickBase: 20, thickScale: 0, bezelScale: 1, dims: ['Case width', 'Case height', 'Case depth'], noScreen: true, diag: [0, 0], weight: [50, 82], density: 0.5, sbrFloor: 0, thin: [0, 0],
    sizes: [{ name: 'Pocket', width: 50, height: 44, thickness: 21 }, { name: 'Standard', width: 58, height: 48, thickness: 23 }, { name: 'Wide', width: 68, height: 48, thickness: 26 }, { name: 'Tall', width: 47, height: 58, thickness: 22 }],
    batt: { mx: 14, my: 22, mt: 12, fill: 0.13 }, drainBase: 8, lifeScore: 5.8, lifeHours: 1, chipCost: 0.25, panelCost: 0, assembly: 3, capacity: 0.35, devCost: 0.6, memory: 0, special: 'smarts', specialLabel: 'Smart features',
    labels: { perf: 'Sound quality', display: 'Noise cancelling' }, voice: { perf: 'audio', display: 'anc', camera: 'smarts' }, ioLabel: 'Smart features', extras: ['ip68', 'wireless'], hero: 'front',
  },
  tv: {
    name: 'TV', plural: 'TVs', series: 'Vision', width: [950, 1930, 1230], height: [540, 1100, 701], maxThickness: 90, thickBase: -22, thickScale: 8, bezelScale: 4, oneShell: true, diag: [55, 100], weight: [15000, 30000], weightByArea: true, density: 0.4, sbrFloor: 0.84, thin: [8, 40],
    sizes: [panelSize(43), panelSize(55), panelSize(65), panelSize(75), panelSize(85)],
    batt: { mx: 0, my: 0, mt: 0, fill: 0 }, mains: { cool: 0, sound: 1 }, heat: 1, drainBase: 0, lifeScore: 0, lifeHours: 0, chipCost: 0.5, panelCost: 0.035, matCost: 0.4, assembly: 55, capacity: 4, devCost: 1.3, memory: 0, special: 'ports', specialLabel: 'Inputs and smart features',
    labels: { perf: 'Picture processing', battery: 'Sound' }, voice: { perf: 'smart', camera: 'ports', battery: 'sound', design: 'look' }, ioLabel: 'Inputs and smart features', extras: [], hero: 'front',
  },
}

const SUB_NAMES: Record<keyof SubScores, string> = { perf: 'Performance', display: 'Display', camera: 'Camera', battery: 'Battery', design: 'Design' }
export const subLabel = (type: DeviceType, key: keyof SubScores): string => TYPES[type].labels?.[key] ?? (key === 'camera' ? TYPES[type].specialLabel : SUB_NAMES[key])

// ---- options that only some device types use

export const GPUS = [
  { name: 'Integrated graphics', cost: 0, boost: 0, drain: 0, weight: 0, thick: 0 },
  { name: 'Entry GPU', cost: 70, boost: 0.1, drain: 60, weight: 90, thick: 1.5 },
  { name: 'Performance GPU', cost: 170, boost: 0.2, drain: 130, weight: 180, thick: 3 },
  { name: 'Enthusiast GPU', cost: 360, boost: 0.3, drain: 220, weight: 300, thick: 5 },
]
export const KEYBOARDS = [
  { name: 'Membrane', cost: 8, level: 0 },
  { name: 'Scissor, backlit', cost: 20, level: 0 },
  { name: 'Low-profile mechanical', cost: 38, level: 2 },
  { name: 'Haptic glass', cost: 60, level: 5 },
]
/** Gamepads bundled with a console. `level` is the Industrial design level needed. */
export const CONTROLLERS = [
  { name: 'Basic gamepad', cost: 11, level: 0 },
  { name: 'Rumble gamepad', cost: 19, level: 0 },
  { name: 'Haptic gamepad', cost: 32, level: 2 },
  { name: 'Adaptive-trigger pro pad', cost: 44, level: 5 },
]
/** Consoles: what the video output can drive, by Display level. */
export const VIDEO_OUT = ['1080p', '1440p', '4K', '4K HDR', '4K HDR, ray-traced', '8K', '8K HDR', '8K, path-traced', 'Holo-ready']
export const inputOptions = (type: DeviceType) => (TYPES[type].input === 'controller' ? CONTROLLERS : KEYBOARDS)

/** Cooling for mains devices. `factor` multiplies how much heat a litre of body can shed; `level` is the Materials level needed. */
export const COOLERS = [
  { name: 'Single fan', cost: 6, factor: 1, level: 0 },
  { name: 'Twin fans', cost: 13, factor: 1.3, level: 0 },
  { name: 'Vapour chamber', cost: 28, factor: 1.7, level: 2 },
  { name: 'Liquid-metal loop', cost: 48, factor: 2.2, level: 5 },
]
/** Built-in speakers. `thick` is the body thickness in mm they need; `level` is the Industrial design level needed. */
export const SPEAKERS = [
  { name: 'Stereo, 10 W', cost: 5, quality: 0.3, thick: 0, level: 0 },
  { name: 'Stereo, 20 W', cost: 12, quality: 0.52, thick: 16, level: 0 },
  { name: '2.1 with woofer', cost: 26, quality: 0.72, thick: 24, level: 1 },
  { name: 'Spatial array', cost: 55, quality: 0.9, thick: 30, level: 3 },
  { name: 'Panel-actuator sound', cost: 90, quality: 1, thick: 0, level: 6 },
]
/** Earbud drivers, priced per pair. `tech` is the tech level the sound is worth; `level` is the Materials level needed. */
export const DRIVERS = [
  { name: 'Dynamic, 6 mm', cost: 2, tech: 0, weight: 0.5, drain: 0, level: 0 },
  { name: 'Dynamic, 11 mm', cost: 4, tech: 1.5, weight: 0.8, drain: 0.3, level: 0 },
  { name: 'Titanium-coated dynamic', cost: 8, tech: 3, weight: 0.9, drain: 0.4, level: 2 },
  { name: 'Dual driver', cost: 14, tech: 4.5, weight: 1.3, drain: 0.8, level: 3 },
  { name: 'Planar magnetic', cost: 24, tech: 6.2, weight: 1.6, drain: 1.3, level: 5 },
  { name: 'Graphene diaphragm', cost: 38, tech: 8, weight: 1, drain: 0.9, level: 7 },
]
/** Noise cancelling. `tech` is the tech level it is worth (below 0 for none); `level` is the Chipset level needed. */
export const ANC = [
  { name: 'None', cost: 0, tech: -2.4, weight: 0, drain: 0, level: 0 },
  { name: 'Basic noise cancelling', cost: 4, tech: 1, weight: 0.2, drain: 1.6, level: 1 },
  { name: 'Hybrid noise cancelling', cost: 8, tech: 3, weight: 0.35, drain: 2.2, level: 2 },
  { name: 'Adaptive noise cancelling', cost: 13, tech: 5, weight: 0.4, drain: 2.6, level: 4 },
  { name: 'Adaptive II', cost: 19, tech: 6.8, weight: 0.4, drain: 2.8, level: 6 },
  { name: 'Neural noise cancelling', cost: 27, tech: 8.3, weight: 0.45, drain: 3, level: 8 },
]
/** Stands for desktops and TVs. `cost` is for a default-sized body and grows with it. */
export const STANDS: { id: string; name: string; types: DeviceType[]; cost: number; premium: number; weight: number }[] = [
  { id: 'arm', name: 'Hinged arm', types: ['desktop'], cost: 16, premium: 0.95, weight: 950 },
  { id: 'pedestal', name: 'Centre pedestal', types: ['desktop', 'tv'], cost: 11, premium: 0.75, weight: 1100 },
  { id: 'feet', name: 'Two feet', types: ['desktop', 'tv'], cost: 5, premium: 0.45, weight: 500 },
]
export const standsFor = (type: DeviceType) => STANDS.filter((s) => s.types.includes(type))
export const standInfo = (type: DeviceType, id?: string) => standsFor(type).find((s) => s.id === id) ?? standsFor(type)[0]

export interface IoInfo {
  id: string
  name: string
  cost: number
  /** Chipset level needed. */
  level: number
  /** Points toward the special score. */
  value: number
  /** Socket size in mm, for the model. Entries without one are internal and have no part. */
  size?: [number, number]
  /** Part it appears as (a port unless stated), how many of them, and the face they go on by default. */
  part?: PartKind
  count?: number
  face?: Face
}
export const PORTS: IoInfo[] = [
  { id: 'usbc', name: 'USB-C', cost: 2, level: 0, value: 1, size: [8.6, 2.8] },
  { id: 'usbc2', name: 'Second USB-C', cost: 2, level: 0, value: 0.8, size: [8.6, 2.8] },
  { id: 'usba', name: 'USB-A', cost: 1.5, level: 0, value: 0.8, size: [13, 5] },
  { id: 'hdmi', name: 'HDMI', cost: 3, level: 0, value: 0.8, size: [15, 5.2] },
  { id: 'jack', name: 'Headphone jack', cost: 1, level: 0, value: 0.6, size: [4.2, 4.2] },
  { id: 'sd', name: 'SD card reader', cost: 3, level: 0, value: 0.6, size: [24, 2.4] },
  { id: 'thunder', name: 'Thunderlink 5', cost: 9, level: 3, value: 1.2, size: [8.6, 2.8] },
]
/** A desktop has room for the same ports as a laptop, plus wired networking. */
export const DESKTOP_PORTS: IoInfo[] = [
  ...PORTS.slice(0, 4),
  { id: 'lan', name: 'Ethernet', cost: 2, level: 0, value: 0.6, size: [16, 13] },
  ...PORTS.slice(4),
]
export const SENSORS: IoInfo[] = [
  { id: 'heart', name: 'Heart rate', cost: 2, level: 0, value: 22 },
  { id: 'gps', name: 'GPS', cost: 3, level: 0, value: 18 },
  { id: 'spo2', name: 'Blood oxygen', cost: 3, level: 1, value: 16 },
  { id: 'lte', name: 'Cellular', cost: 8, level: 2, value: 16 },
  { id: 'ecg', name: 'ECG', cost: 5, level: 3, value: 18 },
  { id: 'temp', name: 'Skin temperature', cost: 4, level: 4, value: 16 },
  { id: 'bp', name: 'Blood pressure', cost: 9, level: 5, value: 18 },
  { id: 'glucose', name: 'Glucose trend', cost: 20, level: 7, value: 34 },
]
/** A console always has a power inlet and a video output; these are the choices. */
export const CONSOLE_IO: IoInfo[] = [
  { id: 'disc', name: 'Disc drive', cost: 16, level: 0, value: 1.3, size: [124, 3.2], part: 'slot', face: 'front' },
  { id: 'usbf', name: 'Front USB', cost: 2, level: 0, value: 0.7, size: [13, 5], face: 'front' },
  { id: 'lan', name: 'Ethernet', cost: 2, level: 0, value: 0.6, size: [16, 13], face: 'back' },
  { id: 'usbr', name: 'Rear USB pair', cost: 3, level: 0, value: 0.5, size: [13, 5], count: 2, face: 'back' },
  { id: 'expand', name: 'Storage expansion slot', cost: 6, level: 1, value: 0.8, size: [24, 4], face: 'back' },
  { id: 'wifi', name: 'Fast wireless', cost: 5, level: 2, value: 0.6 },
  { id: 'vr', name: 'Headset port', cost: 7, level: 3, value: 0.7, size: [8.6, 2.8], face: 'front' },
  { id: 'stream', name: 'Game streaming chip', cost: 9, level: 4, value: 0.8 },
]
export const TV_IO: IoInfo[] = [
  { id: 'hdmi', name: 'Two HDMI inputs', cost: 3, level: 0, value: 1.1, size: [15, 5.2], count: 2 },
  { id: 'usb', name: 'USB media port', cost: 1.5, level: 0, value: 0.5, size: [13, 5] },
  { id: 'aerial', name: 'Aerial tuner', cost: 3, level: 0, value: 0.5, size: [9, 9] },
  { id: 'lan', name: 'Ethernet', cost: 2, level: 0, value: 0.4, size: [16, 13] },
  { id: 'hdmi4', name: 'Two more HDMI inputs', cost: 3, level: 0, value: 0.6, size: [15, 5.2], count: 2 },
  { id: 'optical', name: 'Optical audio out', cost: 1.5, level: 0, value: 0.3, size: [7, 7] },
  { id: 'earc', name: 'Lossless audio return', cost: 4, level: 1, value: 0.5 },
  { id: 'vrr', name: 'High-frame-rate gaming input', cost: 8, level: 2, value: 0.9 },
  { id: 'voice', name: 'Hands-free voice control', cost: 5, level: 3, value: 0.6 },
  { id: 'ambient', name: 'Room light sensing', cost: 4, level: 4, value: 0.5 },
]
export const BUD_FEATURES: IoInfo[] = [
  { id: 'touch', name: 'Touch controls', cost: 1.5, level: 0, value: 20 },
  { id: 'ear', name: 'In-ear detection', cost: 1.5, level: 0, value: 16 },
  { id: 'multi', name: 'Two-device pairing', cost: 1, level: 1, value: 18 },
  { id: 'through', name: 'Transparency mode', cost: 2, level: 2, value: 18 },
  { id: 'spatial', name: 'Spatial audio', cost: 4, level: 3, value: 22 },
  { id: 'find', name: 'Precision finding', cost: 3, level: 4, value: 16 },
  { id: 'lossless', name: 'Lossless wireless audio', cost: 5, level: 5, value: 22 },
  { id: 'pulse', name: 'In-ear heart rate', cost: 6, level: 6, value: 22 },
  { id: 'translate', name: 'Live translation', cost: 8, level: 7, value: 26 },
]
export const STRAPS = [
  { id: 'silicone', name: 'Silicone', cost: 2, premium: 0.4, level: 0 },
  { id: 'nylon', name: 'Woven nylon', cost: 4, premium: 0.55, level: 0 },
  { id: 'leather', name: 'Leather', cost: 9, premium: 0.8, level: 0 },
  { id: 'steel', name: 'Steel link', cost: 22, premium: 0.9, level: 1 },
  { id: 'titanium', name: 'Titanium link', cost: 45, premium: 1, level: 3 },
]

const IO_LISTS: Partial<Record<DeviceType, IoInfo[]>> = { laptop: PORTS, desktop: DESKTOP_PORTS, watch: SENSORS, console: CONSOLE_IO, tv: TV_IO, earbuds: BUD_FEATURES }
/** The ports, sensors or features a device type chooses from. Empty for types with none. */
export const ioOptions = (type: DeviceType): IoInfo[] => IO_LISTS[type] ?? []
export const ioInfo = (type: DeviceType, id: string) => ioOptions(type).find((x) => x.id === id)

// ---- markets

export interface SegmentInfo {
  id: SegmentId
  type: DeviceType
  name: string
  /** Buyers per year at game start. */
  size: number
  priceRef: number
  sens: number
  expect: number
  /** Weights sum to 1. */
  weights: SubScores & { brand: number }
}
export const SEGMENTS: SegmentInfo[] = [
  { id: 'budget', type: 'phone', name: 'Budget', size: 20e6, priceRef: 180, sens: 2.2, expect: 0.56, weights: { perf: 0.2, display: 0.15, camera: 0.15, battery: 0.3, design: 0.1, brand: 0.1 } },
  { id: 'mainstream', type: 'phone', name: 'Mainstream', size: 20e6, priceRef: 450, sens: 1.5, expect: 0.8, weights: { perf: 0.2, display: 0.2, camera: 0.2, battery: 0.15, design: 0.15, brand: 0.1 } },
  { id: 'flagship', type: 'phone', name: 'Flagship', size: 8e6, priceRef: 1050, sens: 0.8, expect: 0.95, weights: { perf: 0.2, display: 0.18, camera: 0.2, battery: 0.1, design: 0.2, brand: 0.12 } },
  { id: 'gamer', type: 'phone', name: 'Gamer', size: 4e6, priceRef: 700, sens: 1.2, expect: 0.9, weights: { perf: 0.48, display: 0.25, camera: 0.02, battery: 0.15, design: 0.06, brand: 0.04 } },
  { id: 'business', type: 'phone', name: 'Business', size: 5e6, priceRef: 800, sens: 1.0, expect: 0.8, weights: { perf: 0.2, display: 0.13, camera: 0.07, battery: 0.28, design: 0.14, brand: 0.18 } },
  { id: 'camera', type: 'phone', name: 'Camera fan', size: 3.5e6, priceRef: 900, sens: 1.0, expect: 0.88, weights: { perf: 0.1, display: 0.14, camera: 0.52, battery: 0.1, design: 0.1, brand: 0.04 } },

  { id: 't-budget', type: 'tablet', name: 'Budget tablet', size: 6e6, priceRef: 230, sens: 2.0, expect: 0.62, weights: { perf: 0.2, display: 0.3, camera: 0.05, battery: 0.25, design: 0.1, brand: 0.1 } },
  { id: 't-main', type: 'tablet', name: 'Family tablet', size: 7e6, priceRef: 520, sens: 1.4, expect: 0.76, weights: { perf: 0.2, display: 0.3, camera: 0.08, battery: 0.2, design: 0.14, brand: 0.08 } },
  { id: 't-pro', type: 'tablet', name: 'Pro tablet', size: 2.5e6, priceRef: 1100, sens: 0.8, expect: 0.93, weights: { perf: 0.32, display: 0.28, camera: 0.05, battery: 0.1, design: 0.17, brand: 0.08 } },

  { id: 'w-fit', type: 'watch', name: 'Fitness band', size: 9e6, priceRef: 85, sens: 2.0, expect: 0.64, weights: { perf: 0.05, display: 0.15, camera: 0.3, battery: 0.35, design: 0.1, brand: 0.05 } },
  { id: 'w-smart', type: 'watch', name: 'Smartwatch', size: 7e6, priceRef: 280, sens: 1.3, expect: 0.84, weights: { perf: 0.15, display: 0.2, camera: 0.25, battery: 0.15, design: 0.17, brand: 0.08 } },
  { id: 'w-lux', type: 'watch', name: 'Luxury watch', size: 1.5e6, priceRef: 800, sens: 0.7, expect: 0.88, weights: { perf: 0.08, display: 0.15, camera: 0.15, battery: 0.1, design: 0.4, brand: 0.12 } },

  { id: 'l-budget', type: 'laptop', name: 'Budget laptop', size: 9e6, priceRef: 520, sens: 2.0, expect: 0.56, weights: { perf: 0.25, display: 0.15, camera: 0.2, battery: 0.2, design: 0.1, brand: 0.1 } },
  { id: 'l-ultra', type: 'laptop', name: 'Ultrabook', size: 8e6, priceRef: 1300, sens: 1.2, expect: 0.76, weights: { perf: 0.2, display: 0.2, camera: 0.15, battery: 0.2, design: 0.18, brand: 0.07 } },
  { id: 'l-game', type: 'laptop', name: 'Gaming laptop', size: 3.5e6, priceRef: 1900, sens: 1.1, expect: 0.9, weights: { perf: 0.5, display: 0.22, camera: 0.1, battery: 0.05, design: 0.08, brand: 0.05 } },
  { id: 'l-pro', type: 'laptop', name: 'Workstation', size: 2.5e6, priceRef: 2500, sens: 0.8, expect: 0.93, weights: { perf: 0.35, display: 0.22, camera: 0.18, battery: 0.1, design: 0.1, brand: 0.05 } },

  { id: 'd-home', type: 'desktop', name: 'Family all-in-one', size: 4e6, priceRef: 1050, sens: 1.6, expect: 0.74, weights: { perf: 0.18, display: 0.24, camera: 0.14, battery: 0.12, design: 0.2, brand: 0.12 } },
  { id: 'd-office', type: 'desktop', name: 'Office all-in-one', size: 3.5e6, priceRef: 900, sens: 1.4, expect: 0.72, weights: { perf: 0.24, display: 0.16, camera: 0.22, battery: 0.12, design: 0.1, brand: 0.16 } },
  { id: 'd-studio', type: 'desktop', name: 'Creator studio', size: 1.5e6, priceRef: 2700, sens: 0.8, expect: 0.92, weights: { perf: 0.32, display: 0.3, camera: 0.1, battery: 0.08, design: 0.14, brand: 0.06 } },

  { id: 'c-family', type: 'console', name: 'Family console', size: 6e6, priceRef: 300, sens: 1.8, expect: 0.64, weights: { perf: 0.16, display: 0.14, camera: 0.28, battery: 0.1, design: 0.16, brand: 0.16 } },
  { id: 'c-core', type: 'console', name: 'Core gaming', size: 6e6, priceRef: 550, sens: 1.3, expect: 0.84, weights: { perf: 0.32, display: 0.26, camera: 0.16, battery: 0.08, design: 0.06, brand: 0.12 } },
  { id: 'c-elite', type: 'console', name: 'Enthusiast console', size: 1.5e6, priceRef: 900, sens: 0.9, expect: 0.95, weights: { perf: 0.38, display: 0.3, camera: 0.1, battery: 0.1, design: 0.06, brand: 0.06 } },

  { id: 'e-budget', type: 'earbuds', name: 'Everyday buds', size: 14e6, priceRef: 49, sens: 2.2, expect: 0.66, weights: { perf: 0.2, display: 0.08, camera: 0.14, battery: 0.3, design: 0.14, brand: 0.14 } },
  { id: 'e-anc', type: 'earbuds', name: 'Noise-cancelling buds', size: 10e6, priceRef: 170, sens: 1.4, expect: 0.9, weights: { perf: 0.2, display: 0.28, camera: 0.14, battery: 0.14, design: 0.12, brand: 0.12 } },
  { id: 'e-hifi', type: 'earbuds', name: 'Hi-fi buds', size: 2.5e6, priceRef: 330, sens: 0.9, expect: 0.93, weights: { perf: 0.46, display: 0.14, camera: 0.1, battery: 0.1, design: 0.12, brand: 0.08 } },

  { id: 'tv-budget', type: 'tv', name: 'Budget TV', size: 8e6, priceRef: 340, sens: 2.2, expect: 0.56, weights: { perf: 0.1, display: 0.38, camera: 0.12, battery: 0.12, design: 0.12, brand: 0.16 } },
  { id: 'tv-home', type: 'tv', name: 'Living-room TV', size: 7e6, priceRef: 850, sens: 1.5, expect: 0.78, weights: { perf: 0.12, display: 0.4, camera: 0.12, battery: 0.12, design: 0.14, brand: 0.1 } },
  { id: 'tv-cinema', type: 'tv', name: 'Home cinema TV', size: 2e6, priceRef: 2400, sens: 0.8, expect: 0.93, weights: { perf: 0.12, display: 0.46, camera: 0.08, battery: 0.14, design: 0.14, brand: 0.06 } },
]
export const segmentInfo = (id: SegmentId) => SEGMENTS.find((s) => s.id === id)!
export const segmentsOf = (type: DeviceType) => SEGMENTS.filter((s) => s.type === type)

/** How rivals build a device for each segment. */
export interface Tier {
  drop: number
  chipTier: number
  cams: number
  thick: number
  bezel: number
  matRank: number
  margin: number
  gpu?: number
  keyboard?: number
  io?: number
  /** Fit this share of the ports or features the maker has researched, instead of a fixed number of them. */
  ioShare?: number
  /** Width, height as a fraction between the type's min and max. */
  size?: [number, number]
  /** Indexes into COOLERS, SPEAKERS, DRIVERS and ANC. Each is lowered to what the maker has researched. */
  cooling?: number
  speakers?: number
  driver?: number
  anc?: number
  stand?: string
  buds?: 'stem' | 'bean'
  /** Desktops: height of the chin below the screen, mm. */
  chin?: number
}
export const TIERS: Record<SegmentId, Tier> = {
  budget: { drop: 2, chipTier: 0, cams: 2, thick: 1.6, bezel: 2.2, matRank: 0, margin: 0.18 },
  mainstream: { drop: 1, chipTier: 1, cams: 3, thick: 1.0, bezel: 1.5, matRank: 1, margin: 0.45 },
  flagship: { drop: 0, chipTier: 2, cams: 3, thick: 0.7, bezel: 1.05, matRank: 2, margin: 1.1 },
  gamer: { drop: 1, chipTier: 2, cams: 2, thick: 2.2, bezel: 1.4, matRank: 1, margin: 0.6 },
  business: { drop: 1, chipTier: 1, cams: 2, thick: 1.4, bezel: 1.5, matRank: 2, margin: 0.8 },
  camera: { drop: 1, chipTier: 1, cams: 4, thick: 1.3, bezel: 1.2, matRank: 2, margin: 0.7 },
  't-budget': { drop: 2, chipTier: 0, cams: 1, thick: 1.6, bezel: 1.8, matRank: 0, margin: 0.2 },
  't-main': { drop: 1, chipTier: 1, cams: 1, thick: 1.0, bezel: 1.3, matRank: 1, margin: 0.5 },
  't-pro': { drop: 0, chipTier: 2, cams: 2, thick: 0.6, bezel: 1.05, matRank: 2, margin: 1.0 },
  'w-fit': { drop: 2, chipTier: 0, cams: 0, thick: 1.5, bezel: 2.4, matRank: 0, margin: 0.3, io: 3, size: [0.15, 0.5] },
  'w-smart': { drop: 1, chipTier: 1, cams: 0, thick: 1.0, bezel: 1.4, matRank: 1, margin: 0.7, io: 5 },
  'w-lux': { drop: 0, chipTier: 2, cams: 0, thick: 0.8, bezel: 1.1, matRank: 2, margin: 1.4, io: 6 },
  'l-budget': { drop: 2, chipTier: 0, cams: 1, thick: 4, bezel: 2.2, matRank: 0, margin: 0.18, gpu: 0, keyboard: 0, io: 4 },
  'l-ultra': { drop: 1, chipTier: 1, cams: 1, thick: 1.5, bezel: 1.2, matRank: 2, margin: 0.55, gpu: 0, keyboard: 1, io: 3 },
  'l-game': { drop: 0, chipTier: 2, cams: 1, thick: 8, bezel: 1.5, matRank: 1, margin: 0.5, gpu: 3, keyboard: 2, io: 6, size: [0.75, 0.75] },
  'l-pro': { drop: 0, chipTier: 2, cams: 1, thick: 4, bezel: 1.2, matRank: 2, margin: 0.9, gpu: 2, keyboard: 1, io: 6, size: [0.6, 0.6] },
  'd-home': { drop: 1, chipTier: 1, cams: 1, thick: 3, bezel: 1.5, matRank: 1, margin: 0.4, gpu: 0, keyboard: 1, io: 5, size: [0.3, 0.3], cooling: 0, speakers: 1, stand: 'pedestal', chin: 36 },
  'd-office': { drop: 1, chipTier: 1, cams: 1, thick: 6, bezel: 2, matRank: 0, margin: 0.35, gpu: 0, keyboard: 1, io: 7, size: [0.3, 0.3], cooling: 1, speakers: 0, stand: 'feet', chin: 30 },
  'd-studio': { drop: 0, chipTier: 2, cams: 1, thick: 8, bezel: 1.1, matRank: 2, margin: 0.7, gpu: 2, keyboard: 2, io: 7, size: [0.55, 0.52], cooling: 2, speakers: 3, stand: 'arm', chin: 0 },
  'c-family': { drop: 2, chipTier: 0, cams: 0, thick: 60, bezel: 1, matRank: 0, margin: 0.2, gpu: 1, keyboard: 1, io: 3, size: [0.5, 0.04], cooling: 0 },
  'c-core': { drop: 0, chipTier: 1, cams: 0, thick: 125, bezel: 1, matRank: 0, margin: 0.16, gpu: 2, keyboard: 2, io: 5, size: [0.62, 0.12], cooling: 1 },
  'c-elite': { drop: 0, chipTier: 2, cams: 0, thick: 150, bezel: 1, matRank: 0, margin: 0.25, gpu: 3, keyboard: 3, io: 8, size: [0.05, 0.9], cooling: 2 },
  'e-budget': { drop: 2, chipTier: 0, cams: 0, thick: 2, bezel: 1, matRank: 0, margin: 0.35, ioShare: 0.4, size: [0.3, 0.75], driver: 1, anc: 0, buds: 'bean' },
  'e-anc': { drop: 1, chipTier: 1, cams: 0, thick: 3, bezel: 1, matRank: 0, margin: 0.9, ioShare: 0.75, size: [0.5, 0.55], driver: 2, anc: 5, buds: 'stem' },
  'e-hifi': { drop: 0, chipTier: 2, cams: 0, thick: 5, bezel: 1, matRank: 1, margin: 1.1, ioShare: 1, size: [0.75, 0.6], driver: 5, anc: 4, buds: 'bean' },
  'tv-budget': { drop: 2, chipTier: 0, cams: 0, thick: 16, bezel: 2, matRank: 0, margin: 0.14, io: 3, size: [0.18, 0.18], speakers: 0, stand: 'feet' },
  'tv-home': { drop: 1, chipTier: 1, cams: 0, thick: 8, bezel: 1.4, matRank: 0, margin: 0.3, io: 6, size: [0.42, 0.42], speakers: 1, stand: 'feet' },
  'tv-cinema': { drop: 0, chipTier: 2, cams: 0, thick: 4, bezel: 1.05, matRank: 1, margin: 0.6, io: 10, size: [0.68, 0.68], speakers: 3, stand: 'pedestal' },
}

export const OUTLETS: { name: string; weights: SubScores; value: number }[] = [
  { name: 'TechVerdict', weights: { perf: 0.2, display: 0.2, camera: 0.2, battery: 0.2, design: 0.2 }, value: 0.45 },
  { name: 'Benchmark Daily', weights: { perf: 0.45, display: 0.25, camera: 0.05, battery: 0.2, design: 0.05 }, value: 0.35 },
  { name: 'LensLab', weights: { perf: 0.08, display: 0.17, camera: 0.45, battery: 0.05, design: 0.25 }, value: 0.35 },
  { name: 'The Wallet', weights: { perf: 0.2, display: 0.2, camera: 0.2, battery: 0.25, design: 0.15 }, value: 0.65 },
]

export interface RivalSeed {
  name: string
  color: string
  brand: number
  awareness: number
  techOffset: number
  priceMult: number
  /** Appeal bonus from its software. */
  software: number
  segments: SegmentId[]
  layout: number
  palette: string[]
  series: Record<string, string>
  counter: number
}
// Parody companies. Names are stored in the save and can be edited in System.
// Old saves find these by position, so new companies are only ever added at the end.
export const RIVALS: RivalSeed[] = [
  { name: 'Pear', color: '#c9ccd1', brand: 0.92, awareness: 0.95, techOffset: 0.4, priceMult: 1.2, software: 0.06, segments: ['flagship', 'mainstream', 't-main', 't-pro', 'w-smart', 'w-lux', 'l-ultra', 'l-pro', 'd-home', 'd-studio', 'e-anc'], layout: 1, palette: ['#3b3d42', '#e8e4dc', '#5b6470', '#c8b89a'], series: { flagship: 'pPhone Pro', mainstream: 'pPhone', 't-main': 'pPad', 't-pro': 'pPad Pro', 'w-smart': 'pWatch', 'w-lux': 'pWatch Edition', 'l-ultra': 'PearBook Air', 'l-pro': 'PearBook Pro', 'd-home': 'pMac', 'd-studio': 'pMac Studio', 'e-anc': 'pPods Pro' }, counter: 18 },
  { name: 'Samsong', color: '#3d7be0', brand: 0.82, awareness: 0.95, techOffset: 0.3, priceMult: 1.05, software: 0.01, segments: ['budget', 'mainstream', 'flagship', 'camera', 't-budget', 't-main', 'w-smart', 'l-ultra', 'tv-budget', 'tv-home', 'tv-cinema', 'e-anc'], layout: 4, palette: ['#1c1f26', '#b9c7d8', '#d9d3e6', '#2e4a3c'], series: { budget: 'Cosmos A', mainstream: 'Cosmos FE', flagship: 'Cosmos S', camera: 'Cosmos Ultra', 't-budget': 'Cosmos Tab A', 't-main': 'Cosmos Tab S', 'w-smart': 'Cosmos Watch', 'l-ultra': 'Cosmos Book', 'tv-budget': 'Cosmos Crystal', 'tv-home': 'Cosmos Vision', 'tv-cinema': 'Cosmos Neo', 'e-anc': 'Cosmos Buds' }, counter: 26 },
  { name: 'Xiaomy', color: '#f0802a', brand: 0.6, awareness: 0.8, techOffset: 0, priceMult: 0.85, software: -0.01, segments: ['budget', 'mainstream', 'gamer', 't-budget', 'w-fit', 'tv-budget', 'e-budget'], layout: 2, palette: ['#14161a', '#3a5f8a', '#e9e9e9', '#2a6e58'], series: { budget: 'Redmo', mainstream: 'Mi Note', gamer: 'Poko F', 't-budget': 'Redmo Pad', 'w-fit': 'Mi Band', 'tv-budget': 'Mi Vision', 'e-budget': 'Redmo Buds' }, counter: 15 },
  { name: 'Gooble', color: '#35b06a', brand: 0.75, awareness: 0.7, techOffset: 0.2, priceMult: 1, software: 0.04, segments: ['camera', 'mainstream', 't-main', 'w-smart', 'e-anc'], layout: 3, palette: ['#e6e1d6', '#22262b', '#9fb6a5', '#d9a7a0'], series: { camera: 'Pixl Pro', mainstream: 'Pixl a', 't-main': 'Pixl Tablet', 'w-smart': 'Pixl Watch', 'e-anc': 'Pixl Buds' }, counter: 11 },
  { name: 'OnePlum', color: '#e0403c', brand: 0.65, awareness: 0.55, techOffset: 0, priceMult: 0.9, software: 0.01, segments: ['mainstream', 'gamer', 'e-budget'], layout: 2, palette: ['#16181c', '#2c5a4a', '#c9c9cc'], series: { mainstream: 'Nord', gamer: 'Plum R', 'e-budget': 'Plum Buds' }, counter: 14 },
  { name: 'Nokai', color: '#2f5fb5', brand: 0.55, awareness: 0.7, techOffset: -0.8, priceMult: 0.9, software: 0, segments: ['budget', 'business', 't-budget'], layout: 0, palette: ['#20242b', '#39506b', '#6b7078'], series: { budget: 'Brick G', business: 'Brick X', 't-budget': 'Brick Tab' }, counter: 40 },
  { name: 'Sonny', color: '#8a8f98', brand: 0.7, awareness: 0.6, techOffset: 0, priceMult: 1.15, software: 0, segments: ['camera', 'flagship', 'c-core', 'c-elite', 'tv-home', 'tv-cinema', 'e-hifi'], layout: 0, palette: ['#111214', '#3d4a3f', '#bfc2c7'], series: { camera: 'Xperion Pro', flagship: 'Xperion 1 Mk', 'c-core': 'PlayStadium', 'c-elite': 'PlayStadium Pro', 'tv-home': 'Braviato', 'tv-cinema': 'Braviato Master', 'e-hifi': 'WF Mk' }, counter: 7 },
  { name: 'Azus', color: '#d43a5a', brand: 0.62, awareness: 0.5, techOffset: 0.1, priceMult: 1, software: 0, segments: ['gamer', 'l-game', 'l-budget', 'c-elite'], layout: 3, palette: ['#0f1012', '#2a2d33', '#e6e6e8'], series: { gamer: 'ROC Phone', 'l-game': 'ROC Strike', 'l-budget': 'VivoBuk', 'c-elite': 'ROC Station' }, counter: 10 },
  { name: 'BlockBerry', color: '#6c7a89', brand: 0.6, awareness: 0.5, techOffset: -0.4, priceMult: 1.05, software: 0.02, segments: ['business'], layout: 0, palette: ['#101114', '#2b2f36', '#4a3b2c'], series: { business: 'Key' }, counter: 4 },
  { name: 'Lenova', color: '#c8553d', brand: 0.68, awareness: 0.75, techOffset: 0, priceMult: 0.95, software: 0, segments: ['l-budget', 'l-ultra', 'l-pro', 't-budget', 'd-home', 'd-office'], layout: 0, palette: ['#17181b', '#3a3d42', '#9da2a8'], series: { 'l-budget': 'IdeaPod', 'l-ultra': 'ThinkPod X', 'l-pro': 'ThinkPod P', 't-budget': 'Tab M', 'd-home': 'IdeaCentro', 'd-office': 'ThinkCentro' }, counter: 9 },
  { name: 'Dull', color: '#4a90c2', brand: 0.66, awareness: 0.75, techOffset: 0, priceMult: 1, software: 0, segments: ['l-budget', 'l-ultra', 'l-game', 'd-office', 'd-studio'], layout: 0, palette: ['#c9ccd1', '#1b1d21', '#4b5563'], series: { 'l-budget': 'Inspira', 'l-ultra': 'XPZ', 'l-game': 'Alienwear', 'd-office': 'OptiPlux', 'd-studio': 'XPZ Studio' }, counter: 15 },
  { name: 'HB', color: '#5b8def', brand: 0.62, awareness: 0.72, techOffset: -0.2, priceMult: 0.95, software: 0, segments: ['l-budget', 'l-ultra', 'l-pro', 'd-home', 'd-office'], layout: 0, palette: ['#d5d7da', '#2a2c30', '#8a6a4a'], series: { 'l-budget': 'Pavilon', 'l-ultra': 'Spectra', 'l-pro': 'ZBuk', 'd-home': 'Pavilon One', 'd-office': 'EliteUno' }, counter: 16 },
  { name: 'Fitbyte', color: '#2bb3a3', brand: 0.62, awareness: 0.6, techOffset: -0.3, priceMult: 0.9, software: 0, segments: ['w-fit', 'w-smart'], layout: 0, palette: ['#17191d', '#d8d8dc', '#3f5870', '#c98a8a'], series: { 'w-fit': 'Charge', 'w-smart': 'Versa' }, counter: 7 },
  { name: 'Garmon', color: '#7a8c3a', brand: 0.74, awareness: 0.5, techOffset: 0, priceMult: 1.15, software: 0.01, segments: ['w-fit', 'w-lux'], layout: 0, palette: ['#121314', '#4a4f3a', '#8c8f94'], series: { 'w-fit': 'Venu', 'w-lux': 'Fenyx' }, counter: 8 },
  { name: 'Microsoff', color: '#6fae2e', brand: 0.8, awareness: 0.9, techOffset: 0.2, priceMult: 1, software: 0.03, segments: ['c-family', 'c-core', 'c-elite', 'd-studio'], layout: 0, palette: ['#101113', '#e4e5e7', '#1f3d2b'], series: { 'c-family': 'Xbocks S', 'c-core': 'Xbocks', 'c-elite': 'Xbocks Elite', 'd-studio': 'Surfboard Studio' }, counter: 5 },
  { name: 'Nintendont', color: '#d8262c', brand: 0.88, awareness: 0.9, techOffset: -0.7, priceMult: 1, software: 0.06, segments: ['c-family'], layout: 0, palette: ['#e6e6e6', '#c9302c', '#2a5fb0'], series: { 'c-family': 'Swap' }, counter: 2 },
  { name: 'Segga', color: '#2a6fd6', brand: 0.55, awareness: 0.5, techOffset: -0.2, priceMult: 0.9, software: 0, segments: ['c-family', 'c-core'], layout: 0, palette: ['#16181c', '#d9dadc', '#24447a'], series: { 'c-family': 'Dreamcatch', 'c-core': 'Saturnine' }, counter: 3 },
  { name: 'LQ', color: '#a8324f', brand: 0.78, awareness: 0.85, techOffset: 0.3, priceMult: 1.05, software: 0.01, segments: ['tv-budget', 'tv-home', 'tv-cinema'], layout: 0, palette: ['#121315', '#2a2c30', '#8c8f94'], series: { 'tv-budget': 'LQ Basic', 'tv-home': 'LQ Nano', 'tv-cinema': 'LQ Signature' }, counter: 8 },
  { name: 'Hisenze', color: '#1ba3a0', brand: 0.5, awareness: 0.6, techOffset: -0.3, priceMult: 0.82, software: 0, segments: ['tv-budget', 'tv-home'], layout: 0, palette: ['#15171a', '#3a3d42'], series: { 'tv-budget': 'Roko View', 'tv-home': 'U-Led' }, counter: 6 },
  { name: 'Boze', color: '#9aa0a8', brand: 0.8, awareness: 0.7, techOffset: 0.1, priceMult: 1.15, software: 0.01, segments: ['e-anc', 'e-hifi'], layout: 0, palette: ['#17181b', '#e6e2da', '#5a6470'], series: { 'e-anc': 'QuietComfy', 'e-hifi': 'QuietComfy Ultra' }, counter: 3 },
  { name: 'Sennhauser', color: '#3a6ea5', brand: 0.82, awareness: 0.45, techOffset: 0.2, priceMult: 1.2, software: 0, segments: ['e-hifi', 'e-anc'], layout: 0, palette: ['#111214', '#c9c6c0', '#4a3b2c'], series: { 'e-hifi': 'Momentus', 'e-anc': 'Accentus' }, counter: 4 },
  { name: 'Ankor', color: '#2f9bd6', brand: 0.5, awareness: 0.6, techOffset: -0.4, priceMult: 0.8, software: 0, segments: ['e-budget', 'e-anc'], layout: 0, palette: ['#16181c', '#e9e9e9', '#2c4a6e', '#c98a8a'], series: { 'e-budget': 'Soundbore', 'e-anc': 'Libertee' }, counter: 5 },
]
