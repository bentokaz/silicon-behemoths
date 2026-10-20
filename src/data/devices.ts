// Device types, their markets, and the companies that compete in them.
import type { Body, DeviceType, Face, Levels, PartKind, PcCase, RgbLight, SegmentId, SubScores } from '../sim/types'

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
  /** The input device sold with it or built into it: its options come from inputOptions(type). */
  input?: 'keyboard' | 'controller' | 'wands' | 'controls'
  /** Width beside the screen, on each side, that is taken up by controls (handhelds). */
  flank?: number
  /** Battery drain per watt of chip heat, for battery devices that run their chip hard. */
  chipDrain?: number
  /** What the third sub-score means for this type. */
  special: 'camera' | 'sensors' | 'io' | 'games' | 'smarts' | 'ports' | 'tracking' | 'home' | 'play' | 'reading' | 'flight' | 'expand' | 'inputs' | 'buttons'
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
  /**
   * What it takes to start making this type: a one-off cost and the research
   * levels needed. Already making one of the types in `from` makes it cheaper.
   */
  unlock?: { cost: number; needs: Partial<Levels>; from?: DeviceType[] }
}

/** Body of a 16:9 panel of the given diagonal with slim bezels. */
const panelSize = (inches: number, chin = 0) => ({ name: `${inches}"`, width: Math.round(inches * 22.14 + 12), height: Math.round(inches * 12.45 + 14 + chin) })

export const TYPES: Record<DeviceType, TypeSpec> = {
  phone: {
    name: 'Phone', plural: 'Phones', series: '', width: [58, 92, 74], height: [120, 185, 158], maxThickness: 14, thickBase: 0, bezelScale: 1, diag: [6, 7.1], weight: [190, 265], density: 0.55, sbrFloor: 0.65, thin: [1.2, 4.5],
    batt: { mx: 6, my: 30, mt: 3.6, fill: 0.42 }, drainBase: 12, lifeScore: 0.9, lifeHours: 0.3, chipCost: 1, panelCost: 1, assembly: 12, capacity: 1, devCost: 1, memory: 1, special: 'camera', specialLabel: 'Camera',
    extras: ['nfc', 'esim', 'ir', 'jack', 'sd', 'stereo', 'haptics', 'ip54', 'ip68', 'ip69', 'wireless', 'reverse', 'face', 'uwb', 'mmwave', 'vapor', 'stylus', 'sat'], hero: 'back',
    unlock: { cost: 0, needs: {} },
  },
  tablet: {
    name: 'Tablet', plural: 'Tablets', series: 'Tab', width: [130, 230, 178], height: [190, 310, 250], maxThickness: 11, thickBase: -1, bezelScale: 2, diag: [10, 13.2], weight: [480, 760], density: 0.75, sbrFloor: 0.62, thin: [0.9, 3.2],
    batt: { mx: 10, my: 20, mt: 3.2, fill: 0.25 }, drainBase: 22, lifeScore: 1.75, lifeHours: 0.28, chipCost: 1.2, panelCost: 0.55, assembly: 18, capacity: 1.4, devCost: 1.2, memory: 1, special: 'camera', specialLabel: 'Camera',
    extras: ['nfc', 'esim', 'sd', 'stereo', 'haptics', 'ip54', 'ip68', 'wireless', 'face', 'mmwave', 'stylus'], hero: 'back',
    unlock: { cost: 2e6, needs: { display: 1 }, from: ['phone'] },
  },
  watch: {
    name: 'Watch', plural: 'Watches', series: 'Watch', width: [32, 52, 42], height: [34, 56, 46], maxThickness: 16, thickBase: 2.5, bezelScale: 0.9, diag: [1.5, 2.3], weight: [42, 90], density: 0.9, sbrFloor: 0.42, thin: [1.5, 4],
    batt: { mx: 8, my: 8, mt: 6, fill: 0.22 }, drainBase: 3, lifeScore: 1.6, lifeHours: 1.1, chipCost: 0.4, panelCost: 1.6, assembly: 9, capacity: 0.6, devCost: 0.7, memory: 0, special: 'sensors', specialLabel: 'Sensors',
    ioLabel: 'Health sensors', extras: ['nfc', 'esim', 'haptics', 'ip54', 'ip68', 'ip69', 'wireless', 'uwb', 'sat'], hero: 'back',
    unlock: { cost: 2.5e6, needs: { chipset: 1, battery: 1 }, from: ['phone', 'earbuds'] },
  },
  laptop: {
    name: 'Laptop', plural: 'Laptops', series: 'Book', width: [280, 400, 322], height: [190, 285, 222], maxThickness: 30, thickBase: 4, bezelScale: 2.2, dims: ['Width', 'Depth', 'Thickness'], oneShell: true, diag: [13.2, 17.5], weight: [1300, 2600], density: 0.68, sbrFloor: 0.68, thin: [3, 12],
    batt: { mx: 20, my: 90, mt: 6, fill: 0.2 }, drainBase: 150, lifeScore: 2.3, lifeHours: 0.4, chipCost: 2.4, panelCost: 0.5, assembly: 45, capacity: 2.2, devCost: 1.8, memory: 2, gpu: true, input: 'keyboard', special: 'io', specialLabel: 'Keyboard and ports',
    ioLabel: 'Ports', extras: ['stereo', 'haptics', 'face', 'vapor', 'sd'], hero: 'front',
    unlock: { cost: 5e6, needs: { chipset: 2 }, from: ['tablet', 'desktop'] },
  },
  // An all-in-one: the computer lives behind the display, or in a chin below it.
  desktop: {
    name: 'Desktop', plural: 'Desktops', series: 'Studio', width: [470, 740, 548], height: [270, 500, 360], maxThickness: 70, thickBase: -11, thickScale: 5, bezelScale: 3, oneShell: true, diag: [23, 34], weight: [4800, 9000], weightByArea: true, density: 0.55, sbrFloor: 0.72, thin: [4, 26],
    sizes: [panelSize(21.5, 34), panelSize(24, 34), panelSize(27, 36), panelSize(32, 38)],
    batt: { mx: 0, my: 0, mt: 0, fill: 0 }, mains: { cool: 0.5, sound: 0.5 }, heat: 1.5, drainBase: 0, lifeScore: 0, lifeHours: 0, chipCost: 2.4, panelCost: 0.15, matCost: 0.7, assembly: 60, capacity: 3, devCost: 1.8, memory: 2, gpu: true, input: 'keyboard', special: 'io', specialLabel: 'Keyboard, ports and webcam',
    labels: { battery: 'Cooling and sound' }, voice: { battery: 'cooling', design: 'look' }, ioLabel: 'Ports', extras: [], hero: 'front',
    unlock: { cost: 6e6, needs: { chipset: 2, display: 2 }, from: ['laptop', 'tv'] },
  },
  // A home games console. Its "thickness" is the depth of the box, front to back.
  console: {
    name: 'Console', plural: 'Consoles', series: 'Box', width: [90, 420, 290], height: [40, 330, 72], maxThickness: 330, thickBase: 120, thickScale: 0, bezelScale: 1, dims: ['Width', 'Height', 'Depth'], oneShell: true, noScreen: true, diag: [0, 0], weight: [2600, 5600], density: 0.43, sbrFloor: 0, thin: [0, 0],
    sizes: [{ name: 'Slim', width: 262, height: 48, thickness: 214 }, { name: 'Standard', width: 290, height: 72, thickness: 250 }, { name: 'Cube', width: 196, height: 196, thickness: 196 }, { name: 'Tower', width: 104, height: 300, thickness: 262 }],
    batt: { mx: 0, my: 0, mt: 0, fill: 0 }, mains: { cool: 1, sound: 0 }, heat: 2.2, drainBase: 0, lifeScore: 0, lifeHours: 0, chipCost: 1.1, panelCost: 0, assembly: 34, capacity: 1.8, devCost: 1.6, memory: 2, gpu: true, gpuCost: 0.45, input: 'controller', special: 'games', specialLabel: 'Controller and features',
    labels: { display: 'Picture output', battery: 'Cooling and noise' }, voice: { display: 'graphics', camera: 'games', battery: 'cooling', design: 'look' }, ioLabel: 'Drive and ports', extras: [], hero: 'front',
    unlock: { cost: 10e6, needs: { chipset: 3 }, from: ['desktop', 'handheld'] },
  },
  // A charging case and two buds. The body is the case; the buds follow from the specs.
  earbuds: {
    name: 'Earbuds', plural: 'Earbuds', series: 'Buds', width: [44, 76, 58], height: [28, 62, 48], maxThickness: 34, thickBase: 20, thickScale: 0, bezelScale: 1, dims: ['Case width', 'Case height', 'Case depth'], noScreen: true, diag: [0, 0], weight: [50, 82], density: 0.5, sbrFloor: 0, thin: [0, 0],
    sizes: [{ name: 'Pocket', width: 50, height: 44, thickness: 21 }, { name: 'Standard', width: 58, height: 48, thickness: 23 }, { name: 'Wide', width: 68, height: 48, thickness: 26 }, { name: 'Tall', width: 47, height: 58, thickness: 22 }],
    batt: { mx: 14, my: 22, mt: 12, fill: 0.13 }, drainBase: 8, lifeScore: 5.8, lifeHours: 1, chipCost: 0.25, panelCost: 0, assembly: 3, capacity: 0.35, devCost: 0.6, memory: 0, special: 'smarts', specialLabel: 'Smart features',
    labels: { perf: 'Sound quality', display: 'Noise cancelling' }, voice: { perf: 'audio', display: 'anc', camera: 'smarts' }, ioLabel: 'Smart features', extras: ['ip54', 'ip68', 'wireless'], hero: 'front',
    unlock: { cost: 1.5e6, needs: {}, from: ['phone', 'speaker'] },
  },
  tv: {
    name: 'TV', plural: 'TVs', series: 'Vision', width: [950, 1930, 1230], height: [540, 1100, 701], maxThickness: 90, thickBase: -22, thickScale: 8, bezelScale: 4, oneShell: true, diag: [55, 100], weight: [15000, 30000], weightByArea: true, density: 0.4, sbrFloor: 0.84, thin: [8, 40],
    sizes: [panelSize(43), panelSize(55), panelSize(65), panelSize(75), panelSize(85)],
    batt: { mx: 0, my: 0, mt: 0, fill: 0 }, mains: { cool: 0, sound: 1 }, heat: 1, drainBase: 0, lifeScore: 0, lifeHours: 0, chipCost: 0.5, panelCost: 0.035, matCost: 0.4, assembly: 55, capacity: 4, devCost: 1.3, memory: 0, special: 'ports', specialLabel: 'Inputs and smart features',
    labels: { perf: 'Picture processing', battery: 'Sound' }, voice: { perf: 'smart', camera: 'ports', battery: 'sound', design: 'look' }, ioLabel: 'Inputs and smart features', extras: [], hero: 'front',
    unlock: { cost: 8e6, needs: { display: 2 }, from: ['desktop'] },
  },
  // A phone that opens like a book. Width and thickness are those of the open device: each half is that thick,
  // and it closes to twice that plus whatever gap the hinge leaves. The cover screen is on the back of one half.
  foldable: {
    name: 'Foldable', plural: 'Foldables', series: 'Fold', width: [118, 172, 144], height: [138, 178, 156], maxThickness: 11, thickBase: -1.2, bezelScale: 1.4, dims: ['Width, open', 'Height', 'Thickness, open'], diag: [7.3, 8.7], weight: [245, 335], density: 0.5, sbrFloor: 0.72, thin: [0.8, 3],
    batt: { mx: 16, my: 26, mt: 3, fill: 0.27 }, drainBase: 13, lifeScore: 1.6, lifeHours: 0.5, chipCost: 1, panelCost: 1.5, assembly: 26, capacity: 1.5, devCost: 1.5, memory: 1, special: 'camera', specialLabel: 'Camera',
    labels: { design: 'Design and hinge' }, voice: { design: 'fold' }, extras: ['nfc', 'esim', 'stereo', 'haptics', 'ip54', 'ip68', 'wireless', 'reverse', 'face', 'uwb', 'mmwave', 'stylus', 'sat'], hero: 'front',
    unlock: { cost: 15e6, needs: { display: 5, materials: 4 }, from: ['phone', 'tablet'] },
  },
  // A headset: the body is the visor, and its "thickness" is the depth of the visor from front glass to face.
  headset: {
    name: 'Headset', plural: 'Headsets', series: 'Visor', width: [150, 210, 178], height: [78, 118, 94], maxThickness: 110, thickBase: 46, thickScale: 0, bezelScale: 1, dims: ['Width', 'Height', 'Depth'], oneShell: true, noScreen: true, diag: [0, 0], weight: [380, 720], density: 0.22, sbrFloor: 0, thin: [0, 0],
    batt: { mx: 60, my: 30, mt: 30, fill: 0.055 }, drainBase: 40, chipDrain: 1.2, lifeScore: 0.9, lifeHours: 0.04, chipCost: 1.3, panelCost: 3, assembly: 30, capacity: 2, devCost: 2, memory: 1, input: 'wands', special: 'tracking', specialLabel: 'Tracking and controllers',
    labels: { display: 'Optics and display', design: 'Comfort and design' }, voice: { display: 'optics', camera: 'tracking', design: 'comfort' }, ioLabel: 'Sensing and features', extras: [], hero: 'front',
    unlock: { cost: 20e6, needs: { display: 4, chipset: 5 }, from: ['console', 'handheld', 'phone'] },
  },
  // A smart speaker, wrapped in fabric. It runs from the wall; its "thickness" is its depth, front to back.
  speaker: {
    name: 'Speaker', plural: 'Speakers', series: 'Home', width: [70, 240, 104], height: [50, 280, 148], maxThickness: 240, thickBase: 60, thickScale: 0, bezelScale: 1, dims: ['Width', 'Height', 'Depth'], oneShell: true, noScreen: true, diag: [0, 0], weight: [700, 3600], density: 0.5, sbrFloor: 0, thin: [0, 0],
    sizes: [{ name: 'Mini', width: 96, height: 64, thickness: 96 }, { name: 'Standard', width: 104, height: 148, thickness: 104 }, { name: 'Tall', width: 116, height: 216, thickness: 116 }, { name: 'Large', width: 172, height: 180, thickness: 160 }],
    batt: { mx: 0, my: 0, mt: 0, fill: 0 }, mains: { cool: 0, sound: 0 }, drainBase: 0, lifeScore: 0, lifeHours: 0, chipCost: 0.3, panelCost: 0.55, matCost: 0.25, assembly: 6, capacity: 0.7, devCost: 0.7, memory: 0, special: 'home', specialLabel: 'Smart-home features',
    labels: { perf: 'Sound quality', display: 'Voice assistant', battery: 'Bass and loudness' }, voice: { perf: 'tone', display: 'assistant', camera: 'home', battery: 'bass', design: 'look' }, ioLabel: 'Smart-home features', extras: [], hero: 'front',
    unlock: { cost: 2e6, needs: {}, from: ['earbuds', 'tv'] },
  },
  // A handheld games console: a screen with controls either side of it, grips behind and triggers on top.
  handheld: {
    name: 'Handheld', plural: 'Handhelds', series: 'Play', width: [190, 310, 256], height: [84, 130, 106], maxThickness: 40, thickBase: 9, bezelScale: 1.6, flank: 44, oneShell: true, diag: [6.8, 8.6], weight: [360, 820], density: 0.52, sbrFloor: 0.36, thin: [2, 10],
    batt: { mx: 80, my: 24, mt: 9, fill: 0.1 }, drainBase: 30, chipDrain: 4, lifeScore: 2.2, lifeHours: 0.2, chipCost: 1.5, panelCost: 0.8, assembly: 24, capacity: 1.6, devCost: 1.5, memory: 1.5, input: 'controls', special: 'play', specialLabel: 'Controls and features',
    voice: { camera: 'play' }, ioLabel: 'Ports and features', extras: ['jack', 'sd', 'haptics', 'vapor'], hero: 'front',
    unlock: { cost: 8e6, needs: { chipset: 3 }, from: ['console', 'phone', 'tablet'] },
  },
  // An e-reader: a light slab with a paper-like e-ink screen that draws power only when the page changes.
  ereader: {
    name: 'E-reader', plural: 'E-readers', series: 'Read', width: [100, 180, 126], height: [140, 240, 172], maxThickness: 12, thickBase: -1.5, bezelScale: 2.2, diag: [6.8, 8], weight: [165, 330], density: 0.5, sbrFloor: 0.5, thin: [0.8, 3.5],
    batt: { mx: 12, my: 30, mt: 3.6, fill: 0.12 }, drainBase: 1.4, lifeScore: 0.2, lifeHours: 0.25, chipCost: 0.3, panelCost: 0.2, assembly: 8, capacity: 0.8, devCost: 0.6, memory: 0, special: 'reading', specialLabel: 'Reading features',
    labels: { display: 'E-ink screen' }, voice: { display: 'eink', camera: 'reading' }, ioLabel: 'Reading features', extras: ['ip54', 'ip68', 'wireless', 'sd', 'stylus'], hero: 'front',
    unlock: { cost: 3e6, needs: { display: 2 }, from: ['tablet', 'phone'] },
  },
  // A smart ring. Its "width" is the outer diameter, its "height" the width of the band along the finger and its
  // "thickness" the thickness of the band. It has no screen and charges on a dock.
  ring: {
    name: 'Smart ring', plural: 'Smart rings', series: 'Ring', width: [18, 27, 22], height: [6, 11, 8], maxThickness: 4.5, thickBase: 0.6, thickScale: 0.25, bezelScale: 1, dims: ['Outer diameter', 'Band width', 'Band thickness'], oneShell: true, noScreen: true, diag: [0, 0], weight: [4, 9], density: 6, sbrFloor: 0, thin: [0.3, 1.6],
    sizes: [{ name: 'Small', width: 19.5, height: 7, thickness: 2.4 }, { name: 'Medium', width: 22, height: 8, thickness: 2.5 }, { name: 'Large', width: 24.5, height: 8.5, thickness: 2.6 }, { name: 'Wide', width: 23, height: 10, thickness: 2.6 }],
    batt: { mx: 0, my: 0, mt: 0, fill: 0.05 }, drainBase: 0.16, lifeScore: 0.5, lifeHours: 1, chipCost: 0.3, panelCost: 0, matCost: 0.7, assembly: 16, capacity: 0.3, devCost: 0.6, memory: 0, special: 'sensors', specialLabel: 'Sensors',
    labels: { perf: 'Health insights', display: 'Comfort and fit' }, voice: { perf: 'insight', display: 'fit' }, ioLabel: 'Health sensors', extras: ['nfc', 'ip68', 'ip69', 'uwb'], hero: 'front',
    unlock: { cost: 5e6, needs: { battery: 3, materials: 2 }, from: ['watch', 'earbuds'] },
  },
  // An action camera: a small rugged box. Its back carries the big lens (like a phone's), its front the rear screen.
  actioncam: {
    name: 'Action camera', plural: 'Action cameras', series: 'Action', width: [52, 80, 62], height: [38, 60, 44], maxThickness: 42, thickBase: 15.5, bezelScale: 1.6, diag: [1.9, 2.5], weight: [115, 200], density: 0.75, sbrFloor: 0.3, thin: [3, 14],
    batt: { mx: 14, my: 8, mt: 12, fill: 0.2 }, drainBase: 60, lifeScore: 2.6, lifeHours: 0.06, chipCost: 0.9, panelCost: 1.3, assembly: 14, capacity: 0.8, devCost: 1, memory: 0, special: 'camera', specialLabel: 'Camera and stabilisation',
    labels: { display: 'Screens' }, voice: { camera: 'rugged' }, ioLabel: 'Camera features', extras: ['ip68', 'ip69', 'sd'], hero: 'back',
    unlock: { cost: 4e6, needs: { camera: 3 }, from: ['phone', 'drone'] },
  },
  // A folding camera drone. The body is the fuselage: width across, height, and "thickness" its length nose to tail.
  // The arms, motors and propellers follow from its size. The front is the nose, where the gimbal camera hangs.
  drone: {
    name: 'Drone', plural: 'Drones', series: 'Air', width: [52, 120, 78], height: [34, 80, 46], maxThickness: 260, thickBase: 110, thickScale: 0, bezelScale: 1, dims: ['Body width', 'Body height', 'Body length'], oneShell: true, noScreen: true, diag: [0, 0], weight: [249, 950], density: 0.16, sbrFloor: 0, thin: [0, 0],
    sizes: [{ name: 'Mini', width: 62, height: 38, thickness: 128 }, { name: 'Compact', width: 78, height: 46, thickness: 150 }, { name: 'Creator', width: 92, height: 56, thickness: 182 }, { name: 'Pro', width: 110, height: 70, thickness: 230 }],
    batt: { mx: 18, my: 12, mt: 60, fill: 0.05 }, drainBase: 6, lifeScore: 1.4, lifeHours: 0.012, chipCost: 0.9, panelCost: 0, assembly: 26, capacity: 1.2, devCost: 1.4, memory: 0, special: 'flight', specialLabel: 'Camera and flight',
    labels: { display: 'Video link' }, voice: { display: 'link', camera: 'flight' }, ioLabel: 'Flight features', extras: [], hero: 'front',
    unlock: { cost: 12e6, needs: { camera: 4, battery: 3 }, from: ['actioncam', 'phone'] },
  },
  // A PC tower: a box of parts on the desk or under it. Its "thickness" is the depth of the case, front to back. Its
  // form factor (full tower, mid tower, small form factor, cube, horizontal) follows from its size: see towerForm.
  tower: {
    name: 'PC tower', plural: 'PC towers', series: 'Rig', width: [150, 460, 220], height: [140, 600, 470], maxThickness: 600, thickBase: 250, thickScale: 0, bezelScale: 1, dims: ['Width', 'Height', 'Depth'], oneShell: true, noScreen: true, diag: [0, 0], weight: [6500, 18000], density: 0.09, sbrFloor: 0, thin: [0, 0],
    sizes: [{ name: 'Full tower', width: 235, height: 540, thickness: 520 }, { name: 'Mid tower', width: 220, height: 470, thickness: 450 }, { name: 'Small form factor', width: 175, height: 330, thickness: 370 }, { name: 'Cube', width: 280, height: 280, thickness: 300 }, { name: 'Horizontal', width: 430, height: 150, thickness: 380 }],
    batt: { mx: 0, my: 0, mt: 0, fill: 0 }, mains: { cool: 1, sound: 0 }, heat: 1.6, drainBase: 0, lifeScore: 0, lifeHours: 0, chipCost: 2.2, panelCost: 0, matCost: 0.28, assembly: 70, capacity: 3.2, devCost: 1.6, memory: 2.5, gpu: true, gpuCost: 1.1, special: 'expand', specialLabel: 'Ports and expansion',
    labels: { display: 'Graphics output', battery: 'Cooling and noise', design: 'Case and lighting' }, voice: { display: 'graphics', camera: 'ports', battery: 'cooling', design: 'look' }, ioLabel: 'Ports and bays', extras: [], hero: 'front',
    unlock: { cost: 6e6, needs: { chipset: 2 }, from: ['desktop', 'laptop', 'console'] },
  },
  // A monitor: a panel on a stand with nothing but the electronics that drive it, plugged into a computer.
  monitor: {
    name: 'Monitor', plural: 'Monitors', series: 'View', width: [470, 1220, 615], height: [270, 520, 365], maxThickness: 70, thickBase: -14, thickScale: 4, bezelScale: 2.4, oneShell: true, diag: [24, 34], weight: [3600, 8500], weightByArea: true, density: 0.3, sbrFloor: 0.8, thin: [3, 26],
    sizes: [panelSize(24), panelSize(27), panelSize(32), { name: '34" ultrawide', width: 812, height: 352 }, { name: '49" super-ultrawide', width: 1205, height: 352 }],
    batt: { mx: 0, my: 0, mt: 0, fill: 0 }, mains: { cool: 0, sound: 0.3 }, heat: 1, drainBase: 0, lifeScore: 0, lifeHours: 0, chipCost: 0.3, panelCost: 0.1, matCost: 0.45, assembly: 16, capacity: 2, devCost: 1, memory: 0, special: 'inputs', specialLabel: 'Inputs and features',
    labels: { perf: 'Picture processing', battery: 'Stand and sound' }, voice: { perf: 'smart', camera: 'ports', battery: 'sound', design: 'look' }, ioLabel: 'Inputs and features', extras: [], hero: 'front',
    unlock: { cost: 3e6, needs: { display: 2 }, from: ['tv', 'desktop', 'tower'] },
  },
  // A computer mouse, sitting on the desk as it is used: width across, height of its back, and "thickness" its
  // length, nose (where the buttons are) at the front.
  mouse: {
    name: 'Mouse', plural: 'Mice', series: 'Point', width: [52, 86, 64], height: [30, 48, 38], maxThickness: 136, thickBase: 100, thickScale: 0, bezelScale: 1, dims: ['Width', 'Height', 'Length'], oneShell: true, noScreen: true, diag: [0, 0], weight: [52, 135], density: 0.14, sbrFloor: 0, thin: [0, 0],
    sizes: [{ name: 'Small', width: 58, height: 34, thickness: 112 }, { name: 'Medium', width: 64, height: 38, thickness: 122 }, { name: 'Large', width: 69, height: 42, thickness: 128 }, { name: 'Ergonomic', width: 80, height: 46, thickness: 126 }],
    batt: { mx: 22, my: 14, mt: 70, fill: 0.05 }, drainBase: 0.06, lifeScore: 0.0045, lifeHours: 0.006, chipCost: 0.12, panelCost: 0, matCost: 0.4, assembly: 4, capacity: 0.3, devCost: 0.4, memory: 0, special: 'buttons', specialLabel: 'Buttons and features',
    labels: { perf: 'Responsiveness', display: 'Sensor', design: 'Shape and weight' }, voice: { perf: 'speed', display: 'sensor', camera: 'buttons', design: 'comfort' }, ioLabel: 'Buttons and features', extras: [], hero: 'front',
    unlock: { cost: 1e6, needs: {}, from: ['laptop', 'desktop', 'tower'] },
  },
}

/** A flip is a tall phone that folds in half, so it has its own size range: [min, max, default] in mm. */
export const FLIP = { width: [64, 84, 74] as [number, number, number], height: [150, 184, 168] as [number, number, number], diag: [6.3, 7.1] as [number, number] }
/** Cover screens a flip can carry on the outside of its upper half. */
export const FLIP_COVERS = [{ name: 'Ticker strip' }, { name: 'Half-width window' }, { name: 'Full cover screen' }]
/** The width and height a body may have: those of its type, or of a flip. */
export const sizeLimits = (type: DeviceType, fold?: 'book' | 'flip'): { width: [number, number, number]; height: [number, number, number] } => (type === 'foldable' && fold === 'flip' ? FLIP : TYPES[type])

const SUB_NAMES: Record<keyof SubScores, string> = { perf: 'Performance', display: 'Display', camera: 'Camera', battery: 'Battery', design: 'Design' }
export const subLabel = (type: DeviceType, key: keyof SubScores): string => TYPES[type].labels?.[key] ?? (key === 'camera' ? TYPES[type].specialLabel : SUB_NAMES[key])

// ---- options that only some device types use

/** How long each graphics card is, mm: a tower has to be deep enough to take it. */
export const GPU_LENGTH = [0, 200, 285, 336]
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
/** Hand controllers sold with a headset. `level` is the Industrial design level needed. */
export const WANDS = [
  { name: 'Hand tracking only', cost: 0, level: 0 },
  { name: 'Ring controllers', cost: 22, level: 0 },
  { name: 'Self-tracked controllers', cost: 38, level: 2 },
  { name: 'Haptic pro controllers', cost: 60, level: 5 },
]
/** The controls built into a handheld. `level` is the Industrial design level needed. */
export const HANDHELD_CONTROLS = [
  { name: 'Standard sticks and buttons', cost: 9, level: 0 },
  { name: 'Hall-effect sticks, rumble', cost: 16, level: 0 },
  { name: 'Hall sticks, analogue triggers, haptics', cost: 28, level: 2 },
  { name: 'Adaptive triggers, precision haptics', cost: 44, level: 5 },
]
const INPUT_LISTS = { keyboard: KEYBOARDS, controller: CONTROLLERS, wands: WANDS, controls: HANDHELD_CONTROLS }
export const inputOptions = (type: DeviceType) => INPUT_LISTS[TYPES[type].input ?? 'keyboard']
/** What each kind of input device is called. */
export const INPUT_NAMES: Record<NonNullable<TypeSpec['input']>, string> = { keyboard: 'Keyboard', controller: 'Controller', wands: 'Controllers', controls: 'Controls' }

/** Foldable hinges. `crease` multiplies the display score, `gap` is the wedge left between the halves when shut (mm); `level` is the Materials level needed. */
export const HINGES = [
  { name: 'U-fold hinge', cost: 14, level: 0, crease: 0.9, gap: 1.8, weight: 26, premium: 0.25 },
  { name: 'Waterdrop hinge', cost: 24, level: 2, crease: 0.95, gap: 0.6, weight: 22, premium: 0.55 },
  { name: 'Dual-rail hinge', cost: 38, level: 4, crease: 0.98, gap: 0.3, weight: 18, premium: 0.8 },
  { name: 'Gearless liquidmetal hinge', cost: 60, level: 6, crease: 1, gap: 0.3, weight: 14, premium: 1 },
]
/** Headset lenses. `clarity` multiplies the display score, `depth` is the extra visor depth they need (mm); `level` is the Display level needed. */
export const OPTICS = [
  { name: 'Fresnel lenses', cost: 10, level: 0, clarity: 0.86, depth: 22, weight: 60 },
  { name: 'Aspheric lenses', cost: 22, level: 1, clarity: 0.92, depth: 18, weight: 75 },
  { name: 'Pancake lenses', cost: 40, level: 3, clarity: 0.97, depth: 6, weight: 45 },
  { name: 'Liquid-crystal pancake lenses', cost: 70, level: 5, clarity: 1, depth: 2, weight: 35 },
  { name: 'Holographic waveguides', cost: 110, level: 7, clarity: 1.04, depth: 0, weight: 22 },
]
/** Lit area of a headset's two displays together, cm2. */
export const HEADSET_PANELS = 46
/** How a headset is held on the head. `level` is the Materials level needed; a rear battery holds half as much again. */
export const HEAD_STRAPS = [
  { id: 'soft', name: 'Soft elastic strap', cost: 4, comfort: 0.4, weight: 55, level: 0 },
  { id: 'rigid', name: 'Rigid halo band', cost: 14, comfort: 0.75, weight: 120, level: 0 },
  { id: 'pack', name: 'Halo band with rear battery', cost: 24, comfort: 1, weight: 150, level: 2 },
]
export const headStrap = (id?: string) => HEAD_STRAPS.find((x) => x.id === id) ?? HEAD_STRAPS[0]
/** Smart speaker drivers. `tech` is the tech level the sound is worth, `litres` the enclosure they need; `level` is the Materials level needed. */
export const SPEAKER_DRIVERS = [
  { name: 'Full-range driver', cost: 4, tech: 0, bass: 0.2, litres: 0, weight: 110, level: 0 },
  { name: 'Woofer and tweeter', cost: 10, tech: 2, bass: 0.45, litres: 0.35, weight: 260, level: 0 },
  { name: 'Woofer, twin tweeters, passive radiators', cost: 20, tech: 3.6, bass: 0.65, litres: 0.8, weight: 420, level: 2 },
  { name: 'Woofer and a ring of beam-forming tweeters', cost: 38, tech: 5.4, bass: 0.84, litres: 1.2, weight: 620, level: 4 },
  { name: 'Force-cancelling woofers, ribbon tweeters', cost: 64, tech: 7.6, bass: 1, litres: 1.7, weight: 900, level: 6 },
]
/** Microphones a smart speaker listens with. `tech` is the tech level they are worth; `level` is the Chipset level needed. */
export const MIC_ARRAYS = [
  { name: 'Two microphones', count: 2, cost: 1.5, tech: 0, level: 0 },
  { name: 'Four-microphone array', count: 4, cost: 3.5, tech: 2.5, level: 1 },
  { name: 'Six-microphone far-field array', count: 6, cost: 6, tech: 5, level: 3 },
  { name: 'Eight-microphone beam-forming array', count: 8, cost: 10, tech: 7.6, level: 6 },
]
/** The driver list a type's `driver` spec indexes. */
export const driverOptions = (type: DeviceType) => (type === 'speaker' ? SPEAKER_DRIVERS : DRIVERS)

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
/** Stands for desktops, monitors and TVs. `cost` is for a default-sized body and grows with it. */
export const STANDS: { id: string; name: string; types: DeviceType[]; cost: number; premium: number; weight: number }[] = [
  { id: 'arm', name: 'Hinged arm', types: ['desktop', 'monitor'], cost: 16, premium: 0.95, weight: 950 },
  { id: 'pedestal', name: 'Centre pedestal', types: ['desktop', 'tv', 'monitor'], cost: 11, premium: 0.75, weight: 1100 },
  { id: 'feet', name: 'Two feet', types: ['desktop', 'tv', 'monitor'], cost: 5, premium: 0.45, weight: 500 },
]
/** Types whose body is a screen on a stand. */
export const onStandType = (type: DeviceType) => type === 'desktop' || type === 'tv' || type === 'monitor'
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
/** A headset always has a charging port; these are the choices. */
export const HEADSET_IO: IoInfo[] = [
  { id: 'pass', name: 'Colour passthrough', cost: 9, level: 0, value: 1 },
  { id: 'link', name: 'PC link port', cost: 3, level: 0, value: 0.6, size: [8.6, 2.8], face: 'bottom' },
  { id: 'hands', name: 'Hand tracking', cost: 4, level: 1, value: 0.8 },
  { id: 'audio', name: 'Spatial audio speakers', cost: 6, level: 1, value: 0.6 },
  { id: 'ipd', name: 'Motorised lens spacing', cost: 7, level: 2, value: 0.5 },
  { id: 'eyes', name: 'Eye tracking', cost: 14, level: 3, value: 1 },
  { id: 'depth', name: 'Depth sensor', cost: 12, level: 4, value: 0.8 },
  { id: 'face', name: 'Face tracking', cost: 10, level: 5, value: 0.7 },
]
/** A speaker always has a power inlet; these are the choices. */
export const SPEAKER_IO: IoInfo[] = [
  { id: 'aux', name: 'Line-in jack', cost: 1, level: 0, value: 14, size: [4.2, 4.2], face: 'back' },
  { id: 'multi', name: 'Multi-room audio', cost: 1.5, level: 0, value: 22 },
  { id: 'hub', name: 'Smart-home hub radio', cost: 4, level: 1, value: 18 },
  { id: 'lan', name: 'Ethernet', cost: 2, level: 1, value: 8, size: [16, 13], face: 'back' },
  { id: 'tune', name: 'Room tuning', cost: 3, level: 2, value: 18 },
  { id: 'match', name: 'Voice recognition', cost: 2, level: 3, value: 16 },
  { id: 'pair', name: 'Stereo pairing and TV sound', cost: 3, level: 4, value: 16 },
  { id: 'presence', name: 'Presence sensing', cost: 5, level: 5, value: 16 },
  { id: 'local', name: 'On-device assistant', cost: 9, level: 6, value: 18 },
  { id: 'map', name: 'Spatial sound mapping', cost: 8, level: 7, value: 22 },
]
/** A handheld always has a charging port underneath; these are the choices. */
export const HANDHELD_IO: IoInfo[] = [
  { id: 'jack', name: 'Headphone jack', cost: 1, level: 0, value: 0.6, size: [4.2, 4.2], face: 'top' },
  { id: 'card', name: 'Memory card slot', cost: 2, level: 0, value: 0.7, size: [13, 2], face: 'bottom' },
  { id: 'gyro', name: 'Motion aiming', cost: 2, level: 0, value: 0.5 },
  { id: 'dock', name: 'TV dock in the box', cost: 16, level: 1, value: 1.1 },
  { id: 'paddles', name: 'Rear paddles', cost: 5, level: 1, value: 0.6 },
  { id: 'wifi', name: 'Fast wireless', cost: 5, level: 2, value: 0.6 },
  { id: 'lte', name: 'Cellular', cost: 12, level: 3, value: 0.5 },
  { id: 'stream', name: 'Game streaming chip', cost: 9, level: 4, value: 0.7 },
  { id: 'egpu', name: 'External graphics port', cost: 9, level: 5, value: 0.8, size: [8.6, 2.8], face: 'top' },
]
/** What an e-reader can do besides show a page. Values add up to its special score, like a watch's sensors. */
export const READER_FEATURES: IoInfo[] = [
  { id: 'light', name: 'Front light', cost: 1.5, level: 0, value: 24 },
  { id: 'sync', name: 'Cloud library and sync', cost: 1, level: 0, value: 16 },
  { id: 'warm', name: 'Warm-light adjustment', cost: 2, level: 0, value: 14 },
  { id: 'pages', name: 'Page-turn buttons', cost: 1.5, level: 0, value: 12 },
  { id: 'audio', name: 'Audiobooks over wireless', cost: 2, level: 1, value: 14 },
  { id: 'stylus', name: 'Stylus and note-taking', cost: 9, level: 2, value: 24 },
  { id: 'dict', name: 'Instant dictionary and translation', cost: 2, level: 3, value: 14 },
  { id: 'colour', name: 'Colour e-ink layer', cost: 10, level: 4, value: 20 },
  { id: 'ink', name: 'Handwriting to text', cost: 5, level: 5, value: 16 },
  { id: 'assist', name: 'Reading assistant', cost: 6, level: 6, value: 18 },
]
/** A smart ring's sensors. Values add up to its special score. */
export const RING_SENSORS: IoInfo[] = [
  { id: 'heart', name: 'Heart rate', cost: 2, level: 0, value: 24 },
  { id: 'sleep', name: 'Sleep staging', cost: 1, level: 0, value: 20 },
  { id: 'temp', name: 'Skin temperature', cost: 3, level: 0, value: 16 },
  { id: 'spo2', name: 'Blood oxygen', cost: 3, level: 1, value: 16 },
  { id: 'pay', name: 'Tap-to-pay', cost: 3, level: 1, value: 14 },
  { id: 'hrv', name: 'Stress and recovery', cost: 2, level: 2, value: 16 },
  { id: 'ecg', name: 'ECG', cost: 5, level: 3, value: 18 },
  { id: 'gesture', name: 'Gesture control', cost: 4, level: 4, value: 14 },
  { id: 'bp', name: 'Blood pressure trend', cost: 9, level: 5, value: 18 },
  { id: 'glucose', name: 'Glucose trend', cost: 20, level: 7, value: 30 },
]
/** An action camera always has its main lens, a rear screen and a charging door; these are the choices. */
export const ACTIONCAM_IO: IoInfo[] = [
  { id: 'front', name: 'Front selfie screen', cost: 6, level: 0, value: 1 },
  { id: 'mount', name: 'Fold-out mounting fingers', cost: 1, level: 0, value: 0.6 },
  { id: 'stab', name: 'Horizon-lock stabilisation', cost: 4, level: 1, value: 1.2 },
  { id: 'voice', name: 'Voice control', cost: 1.5, level: 1, value: 0.5 },
  { id: 'gps', name: 'GPS and telemetry', cost: 3, level: 2, value: 0.6 },
  { id: 'live', name: 'Live streaming', cost: 3, level: 2, value: 0.7 },
  { id: 'slomo', name: '8x slow motion', cost: 5, level: 3, value: 0.8 },
  { id: 'mods', name: 'Swappable lens mods', cost: 8, level: 4, value: 0.8 },
  { id: 'edit', name: 'Automatic editing', cost: 5, level: 5, value: 0.7 },
]
/** A drone always has its gimbal camera, four motors and a battery; these are the choices. */
export const DRONE_IO: IoInfo[] = [
  { id: 'gps', name: 'GPS and return-to-home', cost: 2, level: 0, value: 1 },
  { id: 'fold', name: 'Folding arms', cost: 3, level: 0, value: 0.6 },
  { id: 'avoid', name: 'Forward obstacle sensing', cost: 4, level: 0, value: 0.8 },
  { id: 'gimbal', name: 'Three-axis gimbal', cost: 6, level: 1, value: 1.1 },
  { id: 'track', name: 'Subject tracking', cost: 4, level: 2, value: 0.8 },
  { id: 'omni', name: 'All-round obstacle sensing', cost: 8, level: 3, value: 0.9 },
  { id: 'range', name: 'Long-range antennas', cost: 5, level: 3, value: 0.6 },
  { id: 'swap', name: 'Hot-swap batteries', cost: 4, level: 4, value: 0.5 },
  { id: 'lidar', name: 'Night-flight lidar', cost: 9, level: 5, value: 0.8 },
]
/** What an e-reader's display levels are, by Display level: generations of e-ink. */
export const EINK_PANELS = ['E-ink Pearl', 'E-ink Carta', 'Carta 1200', 'Carta 1300', 'Kaleido colour', 'Gallery colour', 'Gallery 3', 'Video-rate e-ink', 'Holo-paper']
/** What a drone's display levels are, by Display level: the video link to the pilot's screen. */
export const VIDEO_LINKS = ['720p link, 2 km', '1080p link, 6 km', '2.7K link, 10 km', '4K link, 12 km', '4K HDR link, 15 km', '4K/120 link, 20 km', '6K link, 25 km', '8K link, mesh relay', 'Holo link']
export const STRAPS = [
  { id: 'silicone', name: 'Silicone', cost: 2, premium: 0.4, level: 0 },
  { id: 'nylon', name: 'Woven nylon', cost: 4, premium: 0.55, level: 0 },
  { id: 'leather', name: 'Leather', cost: 9, premium: 0.8, level: 0 },
  { id: 'steel', name: 'Steel link', cost: 22, premium: 0.9, level: 1 },
  { id: 'titanium', name: 'Titanium link', cost: 45, premium: 1, level: 3 },
]

// ---- PC towers, monitors and mice

/** Power supplies for a PC tower. `level` is the Charging level needed: power conversion is the same science. */
export const PSUS = [
  { name: '450 W Bronze', watts: 450, cost: 30, eff: 0.85, level: 0 },
  { name: '650 W Gold', watts: 650, cost: 52, eff: 0.9, level: 0 },
  { name: '850 W Gold, modular', watts: 850, cost: 82, eff: 0.91, level: 1 },
  { name: '1000 W Platinum', watts: 1000, cost: 120, eff: 0.93, level: 2 },
  { name: '1300 W Titanium', watts: 1300, cost: 175, eff: 0.95, level: 4 },
]
/** Processor coolers for a PC tower. `cap` is the watts of processor heat it carries away; `quiet` how calm it runs. */
export const PC_COOLERS = [
  { name: 'Stock air cooler', cost: 8, factor: 1, cap: 70, quiet: 0.55, level: 0 },
  { name: 'Tower air cooler', cost: 28, factor: 1.3, cap: 140, quiet: 0.8, level: 0 },
  { name: '240 mm liquid cooler', cost: 70, factor: 1.6, cap: 210, quiet: 0.88, level: 2 },
  { name: '360 mm liquid cooler', cost: 110, factor: 1.9, cap: 290, quiet: 0.95, level: 4 },
]
/** The coolers a type chooses from: a tower's processor coolers, or the cooling of a console or an all-in-one. */
export const coolersFor = (type: DeviceType) => (type === 'tower' ? PC_COOLERS : COOLERS)
export const CASE_SIDES: { id: PcCase['side']; name: string; cost: number; premium: number; air: number }[] = [
  { id: 'glass', name: 'Tempered glass', cost: 14, premium: 1, air: 1 },
  { id: 'mesh', name: 'Steel mesh', cost: 8, premium: 0.78, air: 1.12 },
  { id: 'solid', name: 'Solid steel', cost: 4, premium: 0.55, air: 1 },
]
export const CASE_FRONTS: { id: PcCase['front']; name: string; cost: number; premium: number; air: number }[] = [
  { id: 'mesh', name: 'Full mesh', cost: 9, premium: 0.88, air: 1.18 },
  { id: 'glass', name: 'Glass', cost: 12, premium: 0.95, air: 0.72 },
  { id: 'slats', name: 'Wooden slats', cost: 16, premium: 0.98, air: 1.02 },
  { id: 'vents', name: 'Side vents', cost: 6, premium: 0.7, air: 0.9 },
  { id: 'solid', name: 'Solid panel', cost: 4, premium: 0.6, air: 0.62 },
]
export const CASE_FEET: { id: PcCase['feet']; name: string; cost: number; premium: number; lift: number }[] = [
  { id: 'pads', name: 'Rubber pads', cost: 1, premium: 0.55, lift: 6 },
  { id: 'tall', name: 'Tall feet', cost: 4, premium: 0.85, lift: 22 },
  { id: 'stand', name: 'Aluminium stand', cost: 9, premium: 1, lift: 30 },
  { id: 'casters', name: 'Casters', cost: 8, premium: 0.7, lift: 42 },
]
export const caseSide = (id?: string) => CASE_SIDES.find((x) => x.id === id) ?? CASE_SIDES[0]
export const caseFront = (id?: string) => CASE_FRONTS.find((x) => x.id === id) ?? CASE_FRONTS[0]
export const caseFeet = (id?: string) => CASE_FEET.find((x) => x.id === id) ?? CASE_FEET[0]
/** A case as it comes before anything is chosen. */
export const DEFAULT_CASE: PcCase = { side: 'glass', front: 'mesh', fans: 3, fanSize: 120, feet: 'tall' }
export const caseOf = (b: Pick<Body, 'pc'>): PcCase => ({ ...DEFAULT_CASE, ...(b.pc ?? {}) })
/** How many front fans fit a case: as many of their size as stand in its front, beside nothing else. */
export const maxFans = (b: Pick<Body, 'width' | 'height'>, size: number) => Math.max(0, Math.min(4, Math.floor((Math.max(b.width, b.height) - 60) / (size + 6))))
export const RGB_EFFECTS: { id: RgbLight['effect']; name: string }[] = [
  { id: 'off', name: 'Off' },
  { id: 'static', name: 'Static' },
  { id: 'breathe', name: 'Breathing' },
  { id: 'cycle', name: 'Colour cycle' },
  { id: 'wave', name: 'Rainbow wave' },
]
/** The zones that can light up, by type. Each costs a little. */
export const RGB_ZONES: Partial<Record<DeviceType, { id: string; name: string; cost: number }[]>> = {
  tower: [
    { id: 'fans', name: 'Fan rings', cost: 4 },
    { id: 'strip', name: 'Front light strip', cost: 2 },
    { id: 'logo', name: 'Lit badge', cost: 1 },
    { id: 'ram', name: 'Memory light bars', cost: 3 },
    { id: 'gpu', name: 'Graphics card edge', cost: 2 },
    { id: 'cooler', name: 'Cooler crown', cost: 2 },
    { id: 'floor', name: 'Underglow', cost: 2 },
  ],
  mouse: [
    { id: 'wheel', name: 'Scroll wheel', cost: 0.4 },
    { id: 'logo', name: 'Lit badge', cost: 0.4 },
    { id: 'strip', name: 'Side strips', cost: 0.8 },
  ],
}
export const rgbZones = (type: DeviceType) => RGB_ZONES[type] ?? []
export const DEFAULT_RGB: RgbLight = { zones: [], color: '#ff6b1a', color2: '#3d7be0', effect: 'off' }
export const rgbOf = (b: Pick<Body, 'rgb'>): RgbLight => ({ ...DEFAULT_RGB, ...(b.rgb ?? {}) })
/** True when some zone is lit. */
export const rgbOn = (b: Pick<Body, 'rgb'>) => {
  const l = rgbOf(b)
  return l.effect !== 'off' && l.zones.length > 0
}
export type TowerForm = 'full' | 'mid' | 'sff' | 'cube' | 'htpc'
export const TOWER_FORM_NAMES: Record<TowerForm, string> = { full: 'Full tower', mid: 'Mid tower', sff: 'Small form factor', cube: 'Cube', htpc: 'Horizontal' }
/** What a tower's size makes it: lying down if it is much wider than tall, a cube if it is as tall as wide and deep, else a tower by its height. */
export function towerForm(b: Pick<Body, 'width' | 'height' | 'thickness'>): TowerForm {
  if (b.width > b.height * 1.5) return 'htpc'
  const big = Math.max(b.width, b.height, b.thickness)
  const small = Math.min(b.width, b.height, b.thickness)
  if (big / small < 1.3) return 'cube'
  if (b.height >= 510) return 'full'
  if (b.height < 380) return 'sff'
  return 'mid'
}
/** What each level of a mouse's sensor is, by Display level. */
export const MOUSE_SENSORS = ['800 DPI optical', '3,200 DPI optical', '8,000 DPI laser', '16K DPI optical', '26K DPI optical', '30K DPI, low lift-off', '36K DPI, glass tracking', '44K DPI, 8K sampling', 'Neural tracking']
export const TOWER_IO: IoInfo[] = [
  { id: 'fusb', name: 'Front USB pair', cost: 2, level: 0, value: 0.8, size: [13, 5], count: 2, face: 'top' },
  { id: 'faudio', name: 'Front audio jack', cost: 1, level: 0, value: 0.4, size: [4.2, 4.2], face: 'top' },
  { id: 'rusb', name: 'Rear USB bank', cost: 3, level: 0, value: 0.7, size: [13, 5], count: 3, face: 'back' },
  { id: 'lan', name: '2.5G Ethernet', cost: 2, level: 0, value: 0.6, size: [16, 13], face: 'back' },
  { id: 'fusbc', name: 'Front USB-C', cost: 2, level: 0, value: 0.7, size: [8.6, 2.8], face: 'top' },
  { id: 'odd', name: 'Optical drive bay', cost: 14, level: 0, value: 0.5, size: [148, 12], part: 'slot', face: 'front' },
  { id: 'wifi', name: 'Wi-Fi and Bluetooth', cost: 5, level: 1, value: 0.7 },
  { id: 'sd', name: 'Front card reader', cost: 3, level: 1, value: 0.4, size: [24, 2.4], face: 'top' },
  { id: 'bays', name: 'Hot-swap drive bays', cost: 12, level: 2, value: 0.8 },
  { id: 'lan10', name: '10G Ethernet', cost: 9, level: 2, value: 0.7, size: [16, 13], face: 'back' },
  { id: 'thunder', name: 'Thunderlink 5', cost: 9, level: 3, value: 1, size: [8.6, 2.8], face: 'back' },
]
export const MONITOR_IO: IoInfo[] = [
  { id: 'hdmi', name: 'HDMI input', cost: 2, level: 0, value: 1, size: [15, 5.2] },
  { id: 'dp', name: 'DisplayPort input', cost: 2, level: 0, value: 1, size: [16, 5] },
  { id: 'hub', name: 'USB hub', cost: 3, level: 0, value: 0.6, size: [13, 5], count: 2 },
  { id: 'jack', name: 'Headphone out', cost: 1, level: 0, value: 0.3, size: [4.2, 4.2] },
  { id: 'usbc', name: 'USB-C with charging', cost: 6, level: 1, value: 1.1, size: [8.6, 2.8] },
  { id: 'sync', name: 'Variable refresh', cost: 3, level: 1, value: 0.9 },
  { id: 'colour', name: 'Factory colour calibration', cost: 6, level: 1, value: 0.8 },
  { id: 'hdr', name: 'HDR certification', cost: 5, level: 2, value: 0.8 },
  { id: 'kvm', name: 'Built-in KVM switch', cost: 4, level: 2, value: 0.5 },
  { id: 'daisy', name: 'Daisy-chain output', cost: 4, level: 3, value: 0.4, size: [16, 5] },
]
export const MOUSE_IO: IoInfo[] = [
  { id: 'wireless', name: '2.4 GHz wireless', cost: 2, level: 0, value: 1 },
  { id: 'side', name: 'Two thumb buttons', cost: 0.6, level: 0, value: 0.9 },
  { id: 'dpi', name: 'DPI button', cost: 0.3, level: 0, value: 0.5 },
  { id: 'bt', name: 'Bluetooth', cost: 1, level: 0, value: 0.6 },
  { id: 'tilt', name: 'Tilting wheel', cost: 0.8, level: 0, value: 0.5 },
  { id: 'free', name: 'Free-spinning wheel', cost: 1.5, level: 1, value: 0.6 },
  { id: 'memory', name: 'Onboard profiles', cost: 0.5, level: 1, value: 0.4 },
  { id: 'hot', name: 'Hot-swap switches', cost: 1.2, level: 2, value: 0.6 },
  { id: 'dock', name: 'Charging dock', cost: 4, level: 2, value: 0.5 },
  { id: 'poll', name: '8K polling', cost: 2, level: 3, value: 0.8 },
  { id: 'weights', name: 'Tuning weights', cost: 0.8, level: 0, value: 0.3 },
]

/**
 * How much more a segment wants a device for what its body looks like, past the scores: glass and lighting for
 * gamers, a quiet plain case for professionals, a small one for the compact market. A share of quality, -5% to 8%.
 */
export function caseAppeal(b: Body | undefined, type: DeviceType, segment: SegmentId): number {
  if (!b || (type !== 'tower' && type !== 'mouse')) return 0
  const lit = rgbOn(b)
  const l = rgbOf(b)
  const zones = Math.min(1, l.zones.length / 4)
  let k = 0
  if (type === 'tower') {
    const c = caseOf(b)
    const form = towerForm(b)
    if (segment === 'pc-game') k = 0.035 * (c.side === 'glass' ? 1 : c.side === 'mesh' ? 0.3 : -0.5) + (lit ? 0.04 * zones : -0.01) + (c.front === 'mesh' ? 0.01 : 0)
    else if (segment === 'pc-work') k = (c.side === 'glass' ? 0 : 0.02) + (lit ? -0.01 - (l.effect === 'cycle' || l.effect === 'wave' ? 0.025 : 0) : 0.02) + (form === 'full' ? 0.02 : form === 'sff' || form === 'cube' ? -0.02 : 0)
    else if (segment === 'pc-compact') k = (form === 'sff' || form === 'cube' || form === 'htpc' ? 0.045 : form === 'full' ? -0.03 : 0) + (c.front === 'slats' || c.side === 'glass' ? 0.01 : 0)
  } else {
    const ergo = b.grip === 'ergo'
    if (segment === 'm-game') k = (lit ? 0.03 * Math.max(0.4, zones * 1.4) : 0) + (ergo ? 0.005 : 0)
    else if (segment === 'm-office') k = (ergo ? 0.03 : 0) + (lit && (l.effect === 'cycle' || l.effect === 'wave') ? -0.015 : 0)
    else if (segment === 'm-pro') k = (ergo ? -0.01 : 0.015) + (lit ? 0.005 : 0)
  }
  return Math.max(-0.05, Math.min(0.08, k))
}

const IO_LISTS: Partial<Record<DeviceType, IoInfo[]>> = { tower: TOWER_IO, monitor: MONITOR_IO, mouse: MOUSE_IO, laptop: PORTS, desktop: DESKTOP_PORTS, watch: SENSORS, console: CONSOLE_IO, tv: TV_IO, earbuds: BUD_FEATURES, headset: HEADSET_IO, speaker: SPEAKER_IO, handheld: HANDHELD_IO, ereader: READER_FEATURES, ring: RING_SENSORS, actioncam: ACTIONCAM_IO, drone: DRONE_IO }
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

  { id: 'f-value', type: 'foldable', name: 'Everyday foldable', size: 3e6, priceRef: 950, sens: 1.4, expect: 0.8, weights: { perf: 0.18, display: 0.24, camera: 0.14, battery: 0.16, design: 0.18, brand: 0.1 } },
  { id: 'f-flag', type: 'foldable', name: 'Flagship foldable', size: 2e6, priceRef: 1800, sens: 0.8, expect: 0.94, weights: { perf: 0.2, display: 0.22, camera: 0.16, battery: 0.1, design: 0.2, brand: 0.12 } },
  { id: 'f-work', type: 'foldable', name: 'Business foldable', size: 1.2e6, priceRef: 1500, sens: 0.9, expect: 0.86, weights: { perf: 0.24, display: 0.22, camera: 0.06, battery: 0.22, design: 0.12, brand: 0.14 } },

  { id: 'v-play', type: 'headset', name: 'Gaming headset', size: 5e6, priceRef: 430, sens: 1.6, expect: 0.72, weights: { perf: 0.24, display: 0.2, camera: 0.22, battery: 0.1, design: 0.12, brand: 0.12 } },
  { id: 'v-mixed', type: 'headset', name: 'Mixed-reality headset', size: 2.2e6, priceRef: 900, sens: 1.2, expect: 0.84, weights: { perf: 0.2, display: 0.26, camera: 0.2, battery: 0.1, design: 0.16, brand: 0.08 } },
  { id: 'v-pro', type: 'headset', name: 'Spatial computer', size: 0.6e6, priceRef: 2400, sens: 0.7, expect: 0.95, weights: { perf: 0.22, display: 0.3, camera: 0.14, battery: 0.06, design: 0.18, brand: 0.1 } },

  { id: 's-mini', type: 'speaker', name: 'Compact speaker', size: 18e6, priceRef: 65, sens: 2.2, expect: 0.6, weights: { perf: 0.18, display: 0.24, camera: 0.2, battery: 0.08, design: 0.14, brand: 0.16 } },
  { id: 's-screen', type: 'speaker', name: 'Smart display', size: 8e6, priceRef: 150, sens: 1.6, expect: 0.8, weights: { perf: 0.14, display: 0.3, camera: 0.24, battery: 0.08, design: 0.12, brand: 0.12 } },
  { id: 's-hifi', type: 'speaker', name: 'Hi-fi speaker', size: 3.5e6, priceRef: 340, sens: 1, expect: 0.9, weights: { perf: 0.36, display: 0.1, camera: 0.1, battery: 0.22, design: 0.14, brand: 0.08 } },

  { id: 'h-pocket', type: 'handheld', name: 'Pocket console', size: 7e6, priceRef: 290, sens: 1.8, expect: 0.66, weights: { perf: 0.16, display: 0.16, camera: 0.24, battery: 0.18, design: 0.12, brand: 0.14 } },
  { id: 'h-pc', type: 'handheld', name: 'Handheld gaming PC', size: 3.5e6, priceRef: 680, sens: 1.3, expect: 0.86, weights: { perf: 0.36, display: 0.2, camera: 0.16, battery: 0.14, design: 0.06, brand: 0.08 } },
  { id: 'h-elite', type: 'handheld', name: 'Premium handheld', size: 1.2e6, priceRef: 1050, sens: 0.9, expect: 0.94, weights: { perf: 0.32, display: 0.26, camera: 0.14, battery: 0.1, design: 0.1, brand: 0.08 } },

  { id: 'r-basic', type: 'ereader', name: 'Everyday reader', size: 9e6, priceRef: 110, sens: 2, expect: 0.62, weights: { perf: 0.08, display: 0.24, camera: 0.18, battery: 0.24, design: 0.12, brand: 0.14 } },
  { id: 'r-premium', type: 'ereader', name: 'Premium reader', size: 5e6, priceRef: 230, sens: 1.3, expect: 0.82, weights: { perf: 0.08, display: 0.28, camera: 0.22, battery: 0.14, design: 0.18, brand: 0.1 } },
  { id: 'r-note', type: 'ereader', name: 'Note-taking reader', size: 2e6, priceRef: 420, sens: 1, expect: 0.9, weights: { perf: 0.16, display: 0.26, camera: 0.3, battery: 0.1, design: 0.1, brand: 0.08 } },

  { id: 'ri-fit', type: 'ring', name: 'Fitness ring', size: 4e6, priceRef: 199, sens: 1.8, expect: 0.66, weights: { perf: 0.1, display: 0.14, camera: 0.3, battery: 0.26, design: 0.1, brand: 0.1 } },
  { id: 'ri-health', type: 'ring', name: 'Health ring', size: 2.5e6, priceRef: 349, sens: 1.2, expect: 0.84, weights: { perf: 0.16, display: 0.12, camera: 0.36, battery: 0.16, design: 0.12, brand: 0.08 } },
  { id: 'ri-lux', type: 'ring', name: 'Luxury ring', size: 0.8e6, priceRef: 650, sens: 0.8, expect: 0.9, weights: { perf: 0.08, display: 0.16, camera: 0.2, battery: 0.1, design: 0.36, brand: 0.1 } },

  { id: 'a-sport', type: 'actioncam', name: 'Sports camera', size: 4e6, priceRef: 250, sens: 1.8, expect: 0.66, weights: { perf: 0.1, display: 0.1, camera: 0.38, battery: 0.2, design: 0.12, brand: 0.1 } },
  { id: 'a-vlog', type: 'actioncam', name: 'Vlogging camera', size: 2.5e6, priceRef: 400, sens: 1.3, expect: 0.82, weights: { perf: 0.12, display: 0.2, camera: 0.36, battery: 0.14, design: 0.1, brand: 0.08 } },
  { id: 'a-pro', type: 'actioncam', name: 'Pro action camera', size: 1e6, priceRef: 600, sens: 0.9, expect: 0.93, weights: { perf: 0.16, display: 0.12, camera: 0.46, battery: 0.12, design: 0.06, brand: 0.08 } },

  { id: 'dr-mini', type: 'drone', name: 'Beginner drone', size: 4.5e6, priceRef: 380, sens: 1.8, expect: 0.66, weights: { perf: 0.1, display: 0.12, camera: 0.3, battery: 0.2, design: 0.18, brand: 0.1 } },
  { id: 'dr-creator', type: 'drone', name: 'Creator drone', size: 2.5e6, priceRef: 950, sens: 1.2, expect: 0.84, weights: { perf: 0.12, display: 0.14, camera: 0.38, battery: 0.16, design: 0.1, brand: 0.1 } },
  { id: 'pc-game', type: 'tower', name: 'Gaming PC', size: 4e6, priceRef: 1800, sens: 1.2, expect: 0.86, weights: { perf: 0.36, display: 0.26, camera: 0.1, battery: 0.12, design: 0.12, brand: 0.04 } },
  { id: 'pc-work', type: 'tower', name: 'Workstation', size: 1.2e6, priceRef: 3200, sens: 0.7, expect: 0.92, weights: { perf: 0.44, display: 0.14, camera: 0.2, battery: 0.12, design: 0.04, brand: 0.06 } },
  { id: 'pc-compact', type: 'tower', name: 'Compact PC', size: 2.5e6, priceRef: 800, sens: 1.5, expect: 0.74, weights: { perf: 0.22, display: 0.12, camera: 0.14, battery: 0.14, design: 0.28, brand: 0.1 } },

  { id: 'mo-office', type: 'monitor', name: 'Office monitor', size: 10e6, priceRef: 180, sens: 2, expect: 0.6, weights: { perf: 0.1, display: 0.4, camera: 0.2, battery: 0.15, design: 0.1, brand: 0.05 } },
  { id: 'mo-game', type: 'monitor', name: 'Gaming monitor', size: 4e6, priceRef: 420, sens: 1.3, expect: 0.85, weights: { perf: 0.2, display: 0.5, camera: 0.1, battery: 0.08, design: 0.08, brand: 0.04 } },
  { id: 'mo-pro', type: 'monitor', name: 'Pro display', size: 1e6, priceRef: 1500, sens: 0.8, expect: 0.93, weights: { perf: 0.2, display: 0.48, camera: 0.14, battery: 0.08, design: 0.06, brand: 0.04 } },

  { id: 'm-office', type: 'mouse', name: 'Office mouse', size: 25e6, priceRef: 30, sens: 2.4, expect: 0.55, weights: { perf: 0.1, display: 0.15, camera: 0.2, battery: 0.3, design: 0.15, brand: 0.1 } },
  { id: 'm-game', type: 'mouse', name: 'Gaming mouse', size: 10e6, priceRef: 70, sens: 1.4, expect: 0.82, weights: { perf: 0.25, display: 0.3, camera: 0.2, battery: 0.08, design: 0.13, brand: 0.04 } },
  { id: 'm-pro', type: 'mouse', name: 'Esports mouse', size: 2.5e6, priceRef: 150, sens: 0.9, expect: 0.92, weights: { perf: 0.28, display: 0.32, camera: 0.1, battery: 0.06, design: 0.2, brand: 0.04 } },

  { id: 'dr-pro', type: 'drone', name: 'Cinema drone', size: 0.8e6, priceRef: 2100, sens: 0.8, expect: 0.93, weights: { perf: 0.14, display: 0.16, camera: 0.42, battery: 0.14, design: 0.06, brand: 0.08 } },
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
  /** Indexes into HINGES, OPTICS and MIC_ARRAYS, lowered to what the maker has researched. */
  hinge?: number
  optics?: number
  mics?: number
  /** Headsets: the head strap, an id from HEAD_STRAPS. */
  strap?: string
  /** Speakers: a touch screen in the front. */
  screen?: boolean
  /** Towers: the case, and whether it is lit. Mice: their shape. */
  pc?: Partial<PcCase>
  rgb?: boolean
  grip?: 'ergo' | 'ambi'
  /** Towers: the power supply, an index into PSUS, lowered to what the maker has researched. */
  psu?: number
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
  'f-value': { drop: 1, chipTier: 1, cams: 2, thick: 1.4, bezel: 1.6, matRank: 1, margin: 0.4, hinge: 1 },
  'f-flag': { drop: 0, chipTier: 2, cams: 3, thick: 0.6, bezel: 1.05, matRank: 2, margin: 0.85, hinge: 3 },
  'f-work': { drop: 1, chipTier: 2, cams: 2, thick: 1.6, bezel: 1.3, matRank: 2, margin: 0.7, hinge: 2, size: [0.7, 0.55] },
  // for a headset, cams is the number of tracking cameras
  'v-play': { drop: 2, chipTier: 1, cams: 4, thick: 8, bezel: 1, matRank: 0, margin: 0.2, keyboard: 1, ioShare: 0.45, optics: 0, strap: 'soft', size: [0.5, 0.5] },
  'v-mixed': { drop: 1, chipTier: 1, cams: 4, thick: 4, bezel: 1, matRank: 0, margin: 0.45, keyboard: 2, ioShare: 0.75, optics: 2, strap: 'rigid', size: [0.4, 0.4] },
  'v-pro': { drop: 0, chipTier: 2, cams: 6, thick: 2, bezel: 1, matRank: 2, margin: 0.9, keyboard: 3, ioShare: 1, optics: 4, strap: 'pack', size: [0.3, 0.3] },
  // a speaker's depth follows its width, so thick is not used
  's-mini': { drop: 2, chipTier: 0, cams: 0, thick: 0, bezel: 1, matRank: 0, margin: 0.3, ioShare: 0.5, driver: 1, mics: 1, size: [0.15, 0.06] },
  's-screen': { drop: 1, chipTier: 1, cams: 0, thick: 0, bezel: 1, matRank: 0, margin: 0.4, ioShare: 0.8, driver: 1, mics: 2, screen: true, size: [0.36, 0.3] },
  's-hifi': { drop: 0, chipTier: 2, cams: 0, thick: 0, bezel: 1, matRank: 2, margin: 0.8, ioShare: 1, driver: 4, mics: 3, size: [0.42, 0.56] },
  'h-pocket': { drop: 2, chipTier: 0, cams: 0, thick: 2, bezel: 2.2, matRank: 0, margin: 0.2, keyboard: 1, ioShare: 0.5, size: [0.3, 0.3] },
  'h-pc': { drop: 1, chipTier: 2, cams: 0, thick: 8, bezel: 1.5, matRank: 0, margin: 0.3, keyboard: 2, ioShare: 0.8, size: [0.6, 0.6] },
  'h-elite': { drop: 0, chipTier: 2, cams: 0, thick: 6, bezel: 1.1, matRank: 0.5, margin: 0.55, keyboard: 3, ioShare: 1, size: [0.75, 0.7] },
  'r-basic': { drop: 2, chipTier: 0, cams: 0, thick: 1.8, bezel: 2, matRank: 0, margin: 0.3, ioShare: 0.4, size: [0.2, 0.2] },
  'r-premium': { drop: 1, chipTier: 0, cams: 0, thick: 0.9, bezel: 1.6, matRank: 1, margin: 0.6, ioShare: 0.7, size: [0.32, 0.32] },
  'r-note': { drop: 0, chipTier: 1, cams: 0, thick: 0.7, bezel: 1.3, matRank: 2, margin: 0.75, ioShare: 1, size: [0.75, 0.75] },
  // for a ring, thick is added to the thinnest band the maker can make
  'ri-fit': { drop: 2, chipTier: 0, cams: 0, thick: 0.5, bezel: 1, matRank: 0, margin: 0.6, ioShare: 0.5, size: [0.45, 0.35] },
  'ri-health': { drop: 1, chipTier: 1, cams: 0, thick: 0.3, bezel: 1, matRank: 1, margin: 0.8, ioShare: 1, size: [0.45, 0.4] },
  'ri-lux': { drop: 0, chipTier: 1, cams: 0, thick: 0.2, bezel: 1, matRank: 2, margin: 1.4, ioShare: 0.8, size: [0.45, 0.45] },
  'a-sport': { drop: 2, chipTier: 0, cams: 1, thick: 4, bezel: 2.2, matRank: 0, margin: 0.4, ioShare: 0.45, size: [0.3, 0.3] },
  'a-vlog': { drop: 1, chipTier: 1, cams: 1, thick: 3, bezel: 1.5, matRank: 1, margin: 0.5, ioShare: 0.8, size: [0.35, 0.35] },
  'a-pro': { drop: 0, chipTier: 2, cams: 1, thick: 3, bezel: 1.3, matRank: 1, margin: 0.55, ioShare: 1, size: [0.45, 0.4] },
  // for a drone, thick is the length of the body past the shortest one
  'dr-mini': { drop: 2, chipTier: 0, cams: 1, thick: 18, bezel: 1, matRank: 0, margin: 0.3, ioShare: 0.5, size: [0.15, 0.1] },
  'dr-creator': { drop: 1, chipTier: 1, cams: 1, thick: 48, bezel: 1, matRank: 0, margin: 0.4, ioShare: 0.85, size: [0.4, 0.3] },
  'dr-pro': { drop: 0, chipTier: 2, cams: 1, thick: 110, bezel: 1, matRank: 1, margin: 0.5, ioShare: 1, size: [0.8, 0.75] },
  // for a tower, thick is the depth past the shallowest case; size picks the form factor
  'pc-game': { drop: 0, chipTier: 2, cams: 0, thick: 200, bezel: 1, matRank: 1, margin: 0.28, gpu: 3, ioShare: 0.7, size: [0.22, 0.72], cooling: 2, psu: 3, rgb: true, pc: { side: 'glass', front: 'mesh', fans: 3, fanSize: 120, feet: 'tall' } },
  'pc-work': { drop: 0, chipTier: 2, cams: 0, thick: 270, bezel: 1, matRank: 2, margin: 0.4, gpu: 2, ioShare: 1, size: [0.27, 0.86], cooling: 1, psu: 3, rgb: false, pc: { side: 'mesh', front: 'mesh', fans: 3, fanSize: 140, feet: 'casters' } },
  'pc-compact': { drop: 1, chipTier: 1, cams: 0, thick: 110, bezel: 1, matRank: 1, margin: 0.32, gpu: 1, ioShare: 0.6, size: [0.08, 0.41], cooling: 1, psu: 1, rgb: false, pc: { side: 'solid', front: 'slats', fans: 1, fanSize: 140, feet: 'pads' } },
  'mo-office': { drop: 2, chipTier: 0, cams: 0, thick: 12, bezel: 1.6, matRank: 0, margin: 0.2, io: 3, size: [0.17, 0.2], speakers: 0, stand: 'feet' },
  'mo-game': { drop: 0, chipTier: 1, cams: 0, thick: 10, bezel: 1.2, matRank: 0, margin: 0.3, io: 6, size: [0.19, 0.38], speakers: 0, stand: 'pedestal' },
  'mo-pro': { drop: 0, chipTier: 1, cams: 0, thick: 8, bezel: 1.05, matRank: 2, margin: 0.55, io: 9, size: [0.3, 0.6], speakers: 1, stand: 'arm' },
  // for a mouse, thick is the length past the shortest one
  'm-office': { drop: 2, chipTier: 0, cams: 0, thick: 20, bezel: 1, matRank: 0, margin: 0.5, ioShare: 0.4, size: [0.35, 0.4], grip: 'ergo' },
  'm-game': { drop: 0, chipTier: 1, cams: 0, thick: 24, bezel: 1, matRank: 0, margin: 0.6, ioShare: 0.75, size: [0.3, 0.4], grip: 'ergo', rgb: true },
  'm-pro': { drop: 0, chipTier: 1, cams: 0, thick: 20, bezel: 1, matRank: 0, margin: 0.8, ioShare: 0.8, size: [0.22, 0.25], grip: 'ambi', rgb: false },
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
  { name: 'Pear', color: '#c9ccd1', brand: 0.92, awareness: 0.95, techOffset: 0.4, priceMult: 1.2, software: 0.06, segments: ['flagship', 'mainstream', 't-main', 't-pro', 'w-smart', 'w-lux', 'l-ultra', 'l-pro', 'd-home', 'd-studio', 'e-anc', 'v-pro', 's-hifi', 'ri-lux'], layout: 1, palette: ['#3b3d42', '#e8e4dc', '#5b6470', '#c8b89a'], series: { flagship: 'pPhone Pro', mainstream: 'pPhone', 't-main': 'pPad', 't-pro': 'pPad Pro', 'w-smart': 'pWatch', 'w-lux': 'pWatch Edition', 'l-ultra': 'PearBook Air', 'l-pro': 'PearBook Pro', 'd-home': 'pMac', 'd-studio': 'pMac Studio', 'e-anc': 'pPods Pro', 'v-pro': 'Reverie', 's-hifi': 'Chorale', 'ri-lux': 'pRing' }, counter: 18 },
  { name: 'Samsong', color: '#3d7be0', brand: 0.82, awareness: 0.95, techOffset: 0.3, priceMult: 1.05, software: 0.01, segments: ['budget', 'mainstream', 'flagship', 'camera', 't-budget', 't-main', 'w-smart', 'l-ultra', 'tv-budget', 'tv-home', 'tv-cinema', 'e-anc', 'f-value', 'f-flag', 'v-mixed', 'ri-health'], layout: 4, palette: ['#1c1f26', '#b9c7d8', '#d9d3e6', '#2e4a3c'], series: { budget: 'Cosmos A', mainstream: 'Cosmos FE', flagship: 'Cosmos S', camera: 'Cosmos Ultra', 't-budget': 'Cosmos Tab A', 't-main': 'Cosmos Tab S', 'w-smart': 'Cosmos Watch', 'l-ultra': 'Cosmos Book', 'tv-budget': 'Cosmos Crystal', 'tv-home': 'Cosmos Vision', 'tv-cinema': 'Cosmos Neo', 'e-anc': 'Cosmos Buds', 'f-value': 'Twinleaf', 'f-flag': 'Diptych', 'v-mixed': 'Farsight', 'ri-health': 'Cosmos Ring' }, counter: 26 },
  { name: 'Xiaomy', color: '#f0802a', brand: 0.6, awareness: 0.8, techOffset: 0, priceMult: 0.85, software: -0.01, segments: ['budget', 'mainstream', 'gamer', 't-budget', 'w-fit', 'tv-budget', 'e-budget', 'f-value', 's-mini', 'r-basic', 'ri-fit', 'a-sport', 'dr-mini'], layout: 2, palette: ['#14161a', '#3a5f8a', '#e9e9e9', '#2a6e58'], series: { budget: 'Redmo', mainstream: 'Mi Note', gamer: 'Poko F', 't-budget': 'Redmo Pad', 'w-fit': 'Mi Band', 'tv-budget': 'Mi Vision', 'e-budget': 'Redmo Buds', 'f-value': 'Twofold', 's-mini': 'Murmur', 'r-basic': 'Mi Reader', 'ri-fit': 'Mi Ring', 'a-sport': 'Yi Action', 'dr-mini': 'Mi Drone' }, counter: 15 },
  { name: 'Gooble', color: '#35b06a', brand: 0.75, awareness: 0.7, techOffset: 0.2, priceMult: 1, software: 0.04, segments: ['camera', 'mainstream', 't-main', 'w-smart', 'e-anc', 'f-flag', 'v-mixed', 's-mini', 's-screen'], layout: 3, palette: ['#e6e1d6', '#22262b', '#9fb6a5', '#d9a7a0'], series: { camera: 'Pixl Pro', mainstream: 'Pixl a', 't-main': 'Pixl Tablet', 'w-smart': 'Pixl Watch', 'e-anc': 'Pixl Buds', 'f-flag': 'Gatefold', 'v-mixed': 'Overlook', 's-mini': 'Lantern Mini', 's-screen': 'Lantern View' }, counter: 11 },
  { name: 'OnePlum', color: '#e0403c', brand: 0.65, awareness: 0.55, techOffset: 0, priceMult: 0.9, software: 0.01, segments: ['mainstream', 'gamer', 'e-budget', 'f-value'], layout: 2, palette: ['#16181c', '#2c5a4a', '#c9c9cc'], series: { mainstream: 'Nord', gamer: 'Plum R', 'e-budget': 'Plum Buds', 'f-value': 'Unfurl' }, counter: 14 },
  { name: 'Nokai', color: '#2f5fb5', brand: 0.55, awareness: 0.7, techOffset: -0.8, priceMult: 0.9, software: 0, segments: ['budget', 'business', 't-budget', 'r-basic'], layout: 0, palette: ['#20242b', '#39506b', '#6b7078'], series: { budget: 'Brick G', business: 'Brick X', 't-budget': 'Brick Tab', 'r-basic': 'Brick Read' }, counter: 40 },
  { name: 'Sonny', color: '#8a8f98', brand: 0.7, awareness: 0.6, techOffset: 0, priceMult: 1.15, software: 0, segments: ['camera', 'flagship', 'c-core', 'c-elite', 'tv-home', 'tv-cinema', 'e-hifi', 'v-play', 's-hifi', 'a-vlog', 'a-pro', 'dr-pro'], layout: 0, palette: ['#111214', '#3d4a3f', '#bfc2c7'], series: { camera: 'Xperion Pro', flagship: 'Xperion 1 Mk', 'c-core': 'PlayStadium', 'c-elite': 'PlayStadium Pro', 'tv-home': 'Braviato', 'tv-cinema': 'Braviato Master', 'e-hifi': 'WF Mk', 'v-play': 'Arcadia', 's-hifi': 'Timbre', 'a-vlog': 'Vlog ZV', 'a-pro': 'Action Mk', 'dr-pro': 'Airpique' }, counter: 7 },
  { name: 'Azus', color: '#d43a5a', brand: 0.62, awareness: 0.5, techOffset: 0.1, priceMult: 1, software: 0, segments: ['gamer', 'l-game', 'l-budget', 'c-elite', 'v-play', 'h-pc', 'h-elite'], layout: 3, palette: ['#0f1012', '#2a2d33', '#e6e6e8'], series: { gamer: 'ROC Phone', 'l-game': 'ROC Strike', 'l-budget': 'VivoBuk', 'c-elite': 'ROC Station', 'v-play': 'Squall', 'h-pc': 'Warden', 'h-elite': 'Warden X' }, counter: 10 },
  { name: 'BlockBerry', color: '#6c7a89', brand: 0.6, awareness: 0.5, techOffset: -0.4, priceMult: 1.05, software: 0.02, segments: ['business', 'f-work'], layout: 0, palette: ['#101114', '#2b2f36', '#4a3b2c'], series: { business: 'Key', 'f-work': 'Dossier' }, counter: 4 },
  { name: 'Lenova', color: '#c8553d', brand: 0.68, awareness: 0.75, techOffset: 0, priceMult: 0.95, software: 0, segments: ['l-budget', 'l-ultra', 'l-pro', 't-budget', 'd-home', 'd-office', 'f-work', 'v-mixed', 's-screen', 'h-pc', 'r-premium', 'r-note'], layout: 0, palette: ['#17181b', '#3a3d42', '#9da2a8'], series: { 'l-budget': 'IdeaPod', 'l-ultra': 'ThinkPod X', 'l-pro': 'ThinkPod P', 't-budget': 'Tab M', 'd-home': 'IdeaCentro', 'd-office': 'ThinkCentro', 'f-work': 'Docket', 'v-mixed': 'Wideview', 's-screen': 'Mantel', 'h-pc': 'Stride', 'r-premium': 'Pagebook', 'r-note': 'Inkpad' }, counter: 9 },
  { name: 'Dull', color: '#4a90c2', brand: 0.66, awareness: 0.75, techOffset: 0, priceMult: 1, software: 0, segments: ['l-budget', 'l-ultra', 'l-game', 'd-office', 'd-studio', 'h-pc'], layout: 0, palette: ['#c9ccd1', '#1b1d21', '#4b5563'], series: { 'l-budget': 'Inspira', 'l-ultra': 'XPZ', 'l-game': 'Alienwear', 'd-office': 'OptiPlux', 'd-studio': 'XPZ Studio', 'h-pc': 'Gridline' }, counter: 15 },
  { name: 'HB', color: '#5b8def', brand: 0.62, awareness: 0.72, techOffset: -0.2, priceMult: 0.95, software: 0, segments: ['l-budget', 'l-ultra', 'l-pro', 'd-home', 'd-office', 'f-work'], layout: 0, palette: ['#d5d7da', '#2a2c30', '#8a6a4a'], series: { 'l-budget': 'Pavilon', 'l-ultra': 'Spectra', 'l-pro': 'ZBuk', 'd-home': 'Pavilon One', 'd-office': 'EliteUno', 'f-work': 'Briefcase' }, counter: 16 },
  { name: 'Fitbyte', color: '#2bb3a3', brand: 0.62, awareness: 0.6, techOffset: -0.3, priceMult: 0.9, software: 0, segments: ['w-fit', 'w-smart', 'ri-fit'], layout: 0, palette: ['#17191d', '#d8d8dc', '#3f5870', '#c98a8a'], series: { 'w-fit': 'Charge', 'w-smart': 'Versa', 'ri-fit': 'Charge Ring' }, counter: 7 },
  { name: 'Garmon', color: '#7a8c3a', brand: 0.74, awareness: 0.5, techOffset: 0, priceMult: 1.15, software: 0.01, segments: ['w-fit', 'w-lux', 'ri-health', 'ri-lux', 'a-sport'], layout: 0, palette: ['#121314', '#4a4f3a', '#8c8f94'], series: { 'w-fit': 'Venu', 'w-lux': 'Fenyx', 'ri-health': 'Index Ring', 'ri-lux': 'Fenyx Ring', 'a-sport': 'Virbo' }, counter: 8 },
  { name: 'Microsoff', color: '#6fae2e', brand: 0.8, awareness: 0.9, techOffset: 0.2, priceMult: 1, software: 0.03, segments: ['c-family', 'c-core', 'c-elite', 'd-studio', 'v-pro', 'h-elite'], layout: 0, palette: ['#101113', '#e4e5e7', '#1f3d2b'], series: { 'c-family': 'Xbocks S', 'c-core': 'Xbocks', 'c-elite': 'Xbocks Elite', 'd-studio': 'Surfboard Studio', 'v-pro': 'Trellis', 'h-elite': 'Vanguard' }, counter: 5 },
  { name: 'Nintendont', color: '#d8262c', brand: 0.88, awareness: 0.9, techOffset: -0.7, priceMult: 1, software: 0.06, segments: ['c-family', 'h-pocket'], layout: 0, palette: ['#e6e6e6', '#c9302c', '#2a5fb0'], series: { 'c-family': 'Swap', 'h-pocket': 'Pocketeer' }, counter: 2 },
  { name: 'Segga', color: '#2a6fd6', brand: 0.55, awareness: 0.5, techOffset: -0.2, priceMult: 0.9, software: 0, segments: ['c-family', 'c-core', 'h-pocket'], layout: 0, palette: ['#16181c', '#d9dadc', '#24447a'], series: { 'c-family': 'Dreamcatch', 'c-core': 'Saturnine', 'h-pocket': 'Rambler' }, counter: 3 },
  { name: 'LQ', color: '#a8324f', brand: 0.78, awareness: 0.85, techOffset: 0.3, priceMult: 1.05, software: 0.01, segments: ['tv-budget', 'tv-home', 'tv-cinema', 's-screen'], layout: 0, palette: ['#121315', '#2a2c30', '#8c8f94'], series: { 'tv-budget': 'LQ Basic', 'tv-home': 'LQ Nano', 'tv-cinema': 'LQ Signature', 's-screen': 'Vignette' }, counter: 8 },
  { name: 'Hisenze', color: '#1ba3a0', brand: 0.5, awareness: 0.6, techOffset: -0.3, priceMult: 0.82, software: 0, segments: ['tv-budget', 'tv-home'], layout: 0, palette: ['#15171a', '#3a3d42'], series: { 'tv-budget': 'Roko View', 'tv-home': 'U-Led' }, counter: 6 },
  { name: 'Boze', color: '#9aa0a8', brand: 0.8, awareness: 0.7, techOffset: 0.1, priceMult: 1.15, software: 0.01, segments: ['e-anc', 'e-hifi', 's-hifi'], layout: 0, palette: ['#17181b', '#e6e2da', '#5a6470'], series: { 'e-anc': 'QuietComfy', 'e-hifi': 'QuietComfy Ultra', 's-hifi': 'Sonata Home' }, counter: 3 },
  { name: 'Sennhauser', color: '#3a6ea5', brand: 0.82, awareness: 0.45, techOffset: 0.2, priceMult: 1.2, software: 0, segments: ['e-hifi', 'e-anc', 's-hifi'], layout: 0, palette: ['#111214', '#c9c6c0', '#4a3b2c'], series: { 'e-hifi': 'Momentus', 'e-anc': 'Accentus', 's-hifi': 'Cantus' }, counter: 4 },
  { name: 'Ankor', color: '#2f9bd6', brand: 0.5, awareness: 0.6, techOffset: -0.4, priceMult: 0.8, software: 0, segments: ['e-budget', 'e-anc', 's-mini'], layout: 0, palette: ['#16181c', '#e9e9e9', '#2c4a6e', '#c98a8a'], series: { 'e-budget': 'Soundbore', 'e-anc': 'Libertee', 's-mini': 'Cubby' }, counter: 5 },
  // specialists in foldables, headsets, speakers and handhelds. These four names, and every series name in the
  // twelve segments of those types, are invented: they are not real brands or plays on real brands.
  { name: 'Plait', color: '#c28f4a', brand: 0.6, awareness: 0.45, techOffset: 0.2, priceMult: 0.95, software: 0.01, segments: ['f-value', 'f-flag', 'f-work'], layout: 1, palette: ['#1b1d21', '#d9d3c4', '#4a5a4e', '#6b4a3a'], series: { 'f-value': 'Plait Air', 'f-flag': 'Plait Prime', 'f-work': 'Plait Works' }, counter: 3 },
  { name: 'Orrery', color: '#3fa7a0', brand: 0.62, awareness: 0.45, techOffset: 0.3, priceMult: 1.05, software: 0.03, segments: ['v-play', 'v-mixed', 'v-pro'], layout: 0, palette: ['#e6e4de', '#1c1e22', '#5b6470'], series: { 'v-play': 'Orbit', 'v-mixed': 'Equinox', 'v-pro': 'Solstice' }, counter: 2 },
  { name: 'Marram', color: '#b7a57a', brand: 0.62, awareness: 0.55, techOffset: 0, priceMult: 0.95, software: 0.02, segments: ['s-mini', 's-screen', 's-hifi'], layout: 0, palette: ['#8a8f8a', '#2a2d31', '#c9bfae', '#5a6b7a'], series: { 's-mini': 'Shore Mini', 's-screen': 'Shore View', 's-hifi': 'Shore Tower' }, counter: 4 },
  { name: 'Tarnwick', color: '#c4583c', brand: 0.6, awareness: 0.5, techOffset: 0.1, priceMult: 0.95, software: 0.02, segments: ['h-pocket', 'h-pc', 'h-elite'], layout: 0, palette: ['#17191d', '#e4e5e7', '#34506e'], series: { 'h-pocket': 'Kite', 'h-pc': 'Harrier', 'h-elite': 'Harrier Max' }, counter: 3 },
  // specialists in e-readers, smart rings, action cameras and drones. The names of these five and of their lines are invented.
  { name: 'Folio', color: '#d2a24c', brand: 0.74, awareness: 0.65, techOffset: 0.1, priceMult: 0.95, software: 0.04, segments: ['r-basic', 'r-premium', 'r-note'], layout: 0, palette: ['#1d1f23', '#e6e1d6', '#3c4a5a', '#5b4636'], series: { 'r-basic': 'Leaf', 'r-premium': 'Leaf Prime', 'r-note': 'Leaf Scribe' }, counter: 6 },
  { name: 'Signet', color: '#9a8fbf', brand: 0.64, awareness: 0.45, techOffset: 0.2, priceMult: 1.05, software: 0.03, segments: ['ri-fit', 'ri-health', 'ri-lux'], layout: 0, palette: ['#2a2c30', '#bfc3c8', '#c9a86a', '#8a8f96'], series: { 'ri-fit': 'Band', 'ri-health': 'Vital', 'ri-lux': 'Aurum' }, counter: 3 },
  { name: 'Talus', color: '#3d9be0', brand: 0.72, awareness: 0.6, techOffset: 0.1, priceMult: 1, software: 0.02, segments: ['a-sport', 'a-vlog', 'a-pro', 'dr-creator'], layout: 0, palette: ['#17191c', '#2b2e33', '#d9dadc'], series: { 'a-sport': 'Scree', 'a-vlog': 'Scree Vlog', 'a-pro': 'Scree Black', 'dr-creator': 'Gull' }, counter: 9 },
  { name: 'Kestrel', color: '#d06a3a', brand: 0.6, awareness: 0.45, techOffset: 0, priceMult: 0.9, software: 0.01, segments: ['dr-mini', 'dr-creator', 'dr-pro'], layout: 0, palette: ['#4b5056', '#e4e5e7', '#2a2d31'], series: { 'dr-mini': 'Wisp', 'dr-creator': 'Hover', 'dr-pro': 'Stoop' }, counter: 4 },
  { name: 'Skyloft', color: '#8fa3b8', brand: 0.82, awareness: 0.7, techOffset: 0.3, priceMult: 1.05, software: 0.03, segments: ['dr-mini', 'dr-creator', 'dr-pro', 'a-vlog', 'a-pro'], layout: 0, palette: ['#5d6268', '#d4d6d9', '#2a2c30'], series: { 'dr-mini': 'Mote', 'dr-creator': 'Aloft', 'dr-pro': 'Zenith', 'a-vlog': 'Pocketcam', 'a-pro': 'Rugged' }, counter: 5 },
  // specialists in PC towers, monitors and mice. These names and their lines are invented.
  { name: 'Forgeline', color: '#e0462c', brand: 0.7, awareness: 0.55, techOffset: 0.2, priceMult: 1, software: 0.01, segments: ['pc-game', 'pc-compact', 'm-game', 'm-pro'], layout: 0, palette: ['#111214', '#e8e8ea', '#2a2d33'], series: { 'pc-game': 'Crucible', 'pc-compact': 'Ingot', 'm-game': 'Spark', 'm-pro': 'Flint' }, counter: 4 },
  { name: 'Quorra', color: '#7d5cf0', brand: 0.66, awareness: 0.5, techOffset: 0.1, priceMult: 1.05, software: 0.01, segments: ['pc-game', 'pc-work', 'mo-game', 'm-game'], layout: 0, palette: ['#0f1012', '#d9dade', '#3b2f63'], series: { 'pc-game': 'Vanta', 'pc-work': 'Atlas', 'mo-game': 'Prism', 'm-game': 'Talon' }, counter: 4 },
  { name: 'Clearpane', color: '#3aa0c8', brand: 0.68, awareness: 0.6, techOffset: 0.1, priceMult: 0.95, software: 0, segments: ['mo-office', 'mo-game', 'mo-pro'], layout: 0, palette: ['#1b1d21', '#c9ccd1', '#2f3640'], series: { 'mo-office': 'Pane', 'mo-game': 'Velocity', 'mo-pro': 'Truecolor' }, counter: 3 },
  { name: 'Tamarin', color: '#5fb36a', brand: 0.6, awareness: 0.65, techOffset: -0.2, priceMult: 0.85, software: 0, segments: ['m-office', 'm-game', 'mo-office', 'pc-compact', 'pc-work'], layout: 0, palette: ['#202226', '#e6e6e6', '#4a5866'], series: { 'm-office': 'Glide', 'm-game': 'Pounce', 'mo-office': 'Daily', 'pc-compact': 'Nook', 'pc-work': 'Bench' }, counter: 3 },
]
