// Every special feature as the physical part it is, and how that part goes into the device when the designer fits
// it: a coil winds in, an aerial slides to the edge, a pen drops into its silo, a speaker clicks into place. The
// designer's "part going in" demonstration reads this; nothing falls back to a generic glowing chip, except the
// features that really are a chip (a modem's processor, an assistant's accelerator).
import type { DeviceType } from '../sim/types'

/** How the part arrives. */
export type FitMotion =
  | 'drop' // lowered straight in
  | 'wind' // turns as it comes in, like a coil being wound
  | 'slide' // comes in beside its place and slides out to the edge
  | 'click' // drops in and snaps home with a small bounce
  | 'silo' // slides in along its own length, as a pen into a silo or a battery into a bay
  | 'unfold' // a sheet that opens out flat as it lands
  | 'plug' // comes in tilted, as a card into its slot, and lies down
  | 'spin' // goes in, then turns about its own axis (a gimbal, a spinning sensor)
  | 'fold' // goes in, then folds out on its hinge
/** Where it goes, in the plane of the device's largest face. */
export type FitSpot = 'board' | 'top' | 'edge' | 'back' | 'front' | 'centre' | 'bottom'
export type SignalColor = 'red' | 'blue' | 'green' | 'white' | 'accent'

export interface FeaturePart {
  /** Which model draws it (see drawFeature in 3d/teardown). */
  model: string
  v?: number
  /** Its size in millimetres: across, along, and tall. */
  size: [number, number, number]
  motion: FitMotion
  spot: FitSpot
  /** What it sends out once in place, and which way. */
  signal?: { color: SignalColor; dir: 'front' | 'back' | 'top' | 'none' }
  /** The whole device buzzes once it is in. */
  shake?: boolean
}

/** Models that are a chip and nothing else: only these may be drawn as a package on a board. */
export const CHIP_MODELS = new Set(['esim', 'asic', 'npu', 'flash', 'mcu', 'scaler'])

const P = (model: string, size: [number, number, number], motion: FitMotion, spot: FitSpot, more: Partial<FeaturePart> = {}): FeaturePart => ({ model, size, motion, spot, ...more })
const sig = (color: SignalColor, dir: 'front' | 'back' | 'top' | 'none') => ({ signal: { color, dir } })

/** The extras of the catalogue (see EXTRAS). */
const EXTRA_PARTS: Record<string, FeaturePart> = {
  nfc: P('nfc', [40, 30, 0.6], 'wind', 'back', sig('accent', 'back')),
  esim: P('esim', [6, 5, 0.9], 'click', 'board'),
  ir: P('ir', [5, 3.4, 1.8], 'slide', 'top', sig('red', 'top')),
  jack: P('jack', [6, 14, 5], 'plug', 'bottom'),
  sd: P('cardslot', [15, 16, 1.8], 'plug', 'edge'),
  stereo: P('stereo', [12, 5, 2.2], 'click', 'top', sig('white', 'top')),
  haptics: P('haptics', [18, 6, 3], 'click', 'centre', { shake: true }),
  ip54: P('gasket', [60, 120, 0.3], 'unfold', 'centre', { v: 0 }),
  ip68: P('gasket', [60, 120, 0.3], 'unfold', 'centre', { v: 1 }),
  ip69: P('gasket', [60, 120, 0.3], 'unfold', 'centre', { v: 2 }),
  wireless: P('wireless', [44, 44, 0.8], 'wind', 'back'),
  reverse: P('wireless', [44, 44, 0.8], 'wind', 'back', { v: 1, ...sig('green', 'back') }),
  face: P('face', [16, 5, 3], 'drop', 'top', sig('red', 'front')),
  uwb: P('uwb', [9, 8, 1.2], 'click', 'board', sig('blue', 'back')),
  mmwave: P('mmwave', [10, 3, 1.4], 'slide', 'edge', sig('blue', 'top')),
  vapor: P('vapour', [40, 70, 0.6], 'unfold', 'board'),
  stylus: P('stylus', [6, 110, 6], 'silo', 'edge'),
  sat: P('sat', [13, 10, 2], 'drop', 'top', sig('blue', 'top')),
}

/** Ports, sensors and features from a type's list that have no socket on the outside: `type:id` first, then `id`. */
const IO_PARTS: Record<string, FeaturePart> = {
  // a watch's health sensors, read through the back of the case
  'watch:heart': P('ppg', [14, 14, 1.6], 'click', 'back', sig('green', 'back')),
  'watch:spo2': P('ppg', [14, 14, 1.6], 'click', 'back', { v: 1, ...sig('red', 'back') }),
  'watch:gps': P('gps', [12, 12, 2.4], 'drop', 'top', sig('blue', 'top')),
  'watch:lte': P('modem', [14, 11, 1.6], 'click', 'board', sig('blue', 'top')),
  'watch:ecg': P('electrode', [26, 26, 1.2], 'wind', 'back', sig('white', 'back')),
  'watch:temp': P('thermistor', [16, 5, 0.8], 'slide', 'back'),
  'watch:bp': P('pressure', [16, 10, 2], 'click', 'back', sig('red', 'back')),
  'watch:glucose': P('spectro', [15, 15, 1.8], 'wind', 'back', sig('accent', 'back')),
  // a ring's, inside the band
  'ring:heart': P('ppg', [7, 5, 1], 'click', 'back', { v: 2, ...sig('green', 'back') }),
  'ring:spo2': P('ppg', [7, 5, 1], 'click', 'back', { v: 1, ...sig('red', 'back') }),
  'ring:sleep': P('imu', [4, 4, 1], 'click', 'board', { v: 1 }),
  'ring:temp': P('thermistor', [9, 3, 0.6], 'slide', 'back', { v: 1 }),
  'ring:pay': P('nfc', [12, 6, 0.4], 'wind', 'back', { v: 1, ...sig('accent', 'back') }),
  'ring:hrv': P('eda', [8, 5, 0.6], 'unfold', 'back', sig('white', 'back')),
  'ring:ecg': P('electrode', [9, 6, 0.6], 'wind', 'back', { v: 1, ...sig('white', 'back') }),
  'ring:gesture': P('imu', [4, 4, 1], 'wind', 'board', { v: 2 }),
  'ring:bp': P('pressure', [7, 5, 1.2], 'click', 'back', { v: 1, ...sig('red', 'back') }),
  'ring:glucose': P('spectro', [7, 6, 1.2], 'wind', 'back', { v: 1, ...sig('accent', 'back') }),
  // earbuds
  'earbuds:touch': P('touchpad', [10, 8, 0.4], 'unfold', 'front'),
  'earbuds:ear': P('prox', [3, 2.4, 1], 'click', 'back', sig('red', 'back')),
  'earbuds:multi': P('btradio', [7, 5, 1.2], 'click', 'board', sig('blue', 'top')),
  'earbuds:through': P('mic', [3.6, 3.6, 1.6], 'drop', 'front', sig('white', 'front')),
  'earbuds:spatial': P('imu', [3, 3, 0.9], 'wind', 'board'),
  'earbuds:find': P('uwb', [6, 5, 0.8], 'click', 'board', sig('blue', 'back')),
  'earbuds:lossless': P('btradio', [7, 5, 1.2], 'click', 'board', { v: 1, ...sig('blue', 'top') }),
  'earbuds:pulse': P('ppg', [5, 4, 0.9], 'click', 'back', { v: 3, ...sig('green', 'back') }),
  'earbuds:translate': P('npu', [4, 4, 0.7], 'click', 'board'),
  // televisions
  'tv:earc': P('asic', [14, 14, 1.6], 'click', 'board', { v: 1 }),
  'tv:vrr': P('scaler', [18, 18, 2], 'click', 'board'),
  'tv:voice': P('micarray', [60, 14, 3], 'slide', 'bottom', sig('white', 'front')),
  'tv:ambient': P('lightsensor', [10, 8, 4], 'drop', 'bottom', sig('accent', 'front')),
  // consoles and handhelds
  'console:wifi': P('wifimod', [22, 30, 3], 'plug', 'board', sig('blue', 'top')),
  'console:stream': P('asic', [14, 14, 1.6], 'click', 'board', { v: 2 }),
  'handheld:wifi': P('wifimod', [22, 30, 2.4], 'plug', 'board', sig('blue', 'top')),
  'handheld:lte': P('modem', [16, 12, 1.6], 'click', 'board', sig('blue', 'top')),
  'handheld:stream': P('asic', [12, 12, 1.4], 'click', 'board', { v: 2 }),
  // e-readers
  'ereader:light': P('lightguide', [90, 120, 0.8], 'unfold', 'front', sig('white', 'front')),
  'ereader:sync': P('wifimod', [16, 22, 1.6], 'plug', 'board', { v: 1, ...sig('blue', 'top') }),
  'ereader:warm': P('ledstrip', [80, 3, 1.2], 'slide', 'bottom', sig('accent', 'front')),
  'ereader:pages': P('pagekeys', [8, 40, 3], 'slide', 'edge'),
  'ereader:audio': P('btradio', [8, 6, 1.2], 'click', 'board', sig('blue', 'top')),
  'ereader:stylus': P('digitiser', [90, 120, 0.4], 'unfold', 'centre'),
  'ereader:dict': P('flash', [12, 10, 1], 'click', 'board'),
  'ereader:colour': P('colourfilter', [90, 120, 0.3], 'unfold', 'front'),
  'ereader:ink': P('npu', [8, 8, 1], 'click', 'board'),
  'ereader:assist': P('npu', [10, 10, 1.2], 'click', 'board', { v: 1 }),
  // action cameras
  'actioncam:front': P('selfiescreen', [30, 30, 2.4], 'unfold', 'front', sig('white', 'front')),
  'actioncam:mount': P('mountfingers', [30, 12, 10], 'fold', 'bottom'),
  'actioncam:stab': P('imu', [5, 5, 1.2], 'wind', 'board', { v: 3 }),
  'actioncam:voice': P('micarray', [26, 8, 2], 'slide', 'top', { v: 1, ...sig('white', 'front') }),
  'actioncam:gps': P('gps', [10, 10, 2.4], 'drop', 'top', sig('blue', 'top')),
  'actioncam:live': P('wifimod', [14, 18, 1.6], 'plug', 'board', { v: 1, ...sig('blue', 'top') }),
  'actioncam:slomo': P('imagesensor', [12, 10, 2], 'drop', 'front'),
  'actioncam:mods': P('lensmount', [24, 24, 4], 'wind', 'front'),
  'actioncam:edit': P('npu', [8, 8, 1], 'click', 'board'),
  // drones
  'drone:gps': P('gps', [26, 26, 6], 'drop', 'top', { v: 1, ...sig('blue', 'top') }),
  'drone:fold': P('arm', [14, 60, 10], 'fold', 'edge'),
  'drone:avoid': P('stereocam', [30, 8, 6], 'slide', 'front', sig('red', 'front')),
  'drone:gimbal': P('gimbal', [30, 30, 30], 'spin', 'front'),
  'drone:track': P('npu', [10, 10, 1.2], 'click', 'board'),
  'drone:omni': P('stereocam', [30, 8, 6], 'slide', 'top', { v: 1, ...sig('red', 'top') }),
  'drone:range': P('antennas', [6, 70, 4], 'slide', 'edge', sig('blue', 'top')),
  'drone:swap': P('packcell', [40, 80, 20], 'silo', 'back'),
  'drone:lidar': P('lidar', [22, 22, 16], 'spin', 'top', sig('accent', 'front')),
  // PC towers
  'tower:wifi': P('wifimod', [22, 30, 3], 'plug', 'board', { v: 2, ...sig('blue', 'top') }),
  'tower:bays': P('drivebay', [100, 146, 26], 'silo', 'centre'),
  // monitors
  'monitor:sync': P('scaler', [22, 22, 2.4], 'click', 'board'),
  'monitor:colour': P('colorimeter', [60, 60, 30], 'drop', 'front', sig('white', 'front')),
  'monitor:hdr': P('backlight', [300, 180, 2], 'unfold', 'centre', sig('white', 'front')),
  'monitor:kvm': P('kvm', [40, 26, 8], 'click', 'board'),
  // mice
  'mouse:wireless': P('dongle', [14, 18, 5], 'slide', 'bottom', sig('blue', 'top')),
  'mouse:side': P('thumbbuttons', [6, 30, 10], 'click', 'edge'),
  'mouse:dpi': P('dpibutton', [8, 10, 6], 'click', 'top'),
  'mouse:bt': P('btradio', [10, 8, 1.4], 'click', 'board', sig('blue', 'top')),
  'mouse:tilt': P('wheel', [8, 22, 22], 'wind', 'top', { v: 1 }),
  'mouse:free': P('wheel', [8, 22, 22], 'wind', 'top', { v: 2 }),
  'mouse:memory': P('flash', [6, 5, 1], 'click', 'board'),
  'mouse:hot': P('switch', [12, 12, 8], 'click', 'top', { v: 1 }),
  'mouse:dock': P('chargedock', [70, 70, 8], 'drop', 'bottom', sig('green', 'back')),
  'mouse:poll': P('mcu', [7, 7, 1], 'click', 'board'),
  'mouse:weights': P('weight', [8, 14, 5], 'silo', 'bottom'),
}

/** The part for a feature key ('extra:nfc' or 'io:gps') on a type of device, if it is one. */
export function featurePart(type: DeviceType, key: string): FeaturePart | undefined {
  const [kind, id] = key.split(':')
  if (kind === 'extra') return EXTRA_PARTS[id]
  if (kind === 'io') return IO_PARTS[`${type}:${id}`]
  return undefined
}

/** What each model is, said when the pointer is over it. */
export const PART_NOTES: Record<string, string> = {
  ppg: 'Green and red lamps and the photodiodes between them: blood under the skin takes up the light in time with the pulse.',
  gps: 'A ceramic patch aerial tuned to the satellites of the navigation systems.',
  modem: 'A cellular modem and its front end under a shield, with the leads to the aerials.',
  electrode: 'Electrodes on the back and the crown: a finger on one closes the circuit through the heart.',
  thermistor: 'A thermistor on a flex tail pressed against the skin, for the slow changes of body temperature.',
  pressure: 'A pressure sensor over a small air pad that feels the pulse wave in the artery.',
  spectro: 'A ring of lamps of many colours round an array of photodiodes: a spectrometer the size of a fingernail.',
  imu: 'A motion sensor: tiny masses on springs etched in silicon, read in three axes.',
  eda: 'Skin-conductance pads that feel the sweat of stress, read with the pulse for recovery.',
  wifimod: 'A wireless card with its two aerial leads: the fast radio, in its slot.',
  touchpad: 'A copper pad on a flex that feels a finger through the shell.',
  prox: 'An infrared proximity sensor that knows when the bud is in an ear.',
  btradio: 'A radio module with its folded chip aerial.',
  mic: 'A microphone behind a steel mesh, open to the outside.',
  micarray: 'Microphones in a row on a strip, listening across the room.',
  lightsensor: 'A light sensor under a milky diffuser that reads the room.',
  lightguide: 'A clear light guide over the page, lit from a row of lamps along its edge.',
  ledstrip: 'Lamps in pairs, warm and cold, mixed for the colour of the light.',
  pagekeys: 'Two page-turn keys on a flex along the edge.',
  digitiser: 'A grid of fine loops under the screen that finds the pen tip.',
  colourfilter: 'A filter of red, green and blue cells over the e-ink, for colour pages.',
  selfiescreen: 'A small screen on the front, to frame a shot of yourself.',
  mountfingers: 'Two fingers that fold out of the base onto a mount.',
  imagesensor: 'A fast-reading image sensor under its cover glass.',
  lensmount: 'A bayonet ring that takes lens mods.',
  arm: 'A folding arm on its hinge, with the motor at the end.',
  stereocam: 'A pair of cameras a set distance apart: depth from the difference.',
  gimbal: 'A three-axis gimbal: a motor on every axis holds the camera level.',
  antennas: 'Long aerials folded into the legs, for range.',
  packcell: 'A battery pack that slides out and in on its rails.',
  lidar: 'A spinning laser that measures the distance all round in the dark.',
  drivebay: 'A drive caddy on rails, swapped from the front.',
  colorimeter: 'Every screen measured and corrected at the factory with a colorimeter.',
  backlight: 'Thousands of tiny lamps in local zones behind the panel, for bright highlights.',
  kvm: 'A switch that moves one keyboard and mouse between two computers.',
  dongle: 'A small receiver for a USB port: a lag-free radio link.',
  thumbbuttons: 'Two buttons under the thumb on their own small board.',
  dpibutton: 'A button behind the wheel that steps the sensitivity.',
  chargedock: 'A dock the mouse rests on to charge.',
  jack: 'A headphone socket: a barrel with its spring contacts.',
  cardslot: 'A card tray with its spring contacts.',
  vapour: 'A flat copper chamber over the chips, wick inside, that spreads the heat.',
  asic: 'A chip that does one thing fast, under its metal lid.',
  npu: 'An accelerator for on-device models.',
  flash: 'A flash memory chip.',
  mcu: 'A small fast processor.',
  scaler: 'The chip that drives the panel.',
}
