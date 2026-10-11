// Turns a DeviceDesign into raw sub-scores, a design report derived from the
// physical model, and a unit cost. No randomness: same design, same result.
import { CHARGE_W, EXTRAS, LENSES, MIN_BEZEL, MIN_THICKNESS, PANEL_NAMES, REFRESH, batteryDensity, chipInfo, featuresAtLevels, idealRam, idealStorage, materialInfo, panelInfo, refScore, sensorInfo } from '../data/catalog'
import { ANC, COOLERS, DRIVERS, GPUS, HEADSET_PANELS, HINGES, MIC_ARRAYS, OPTICS, SPEAKERS, SPEAKER_DRIVERS, STRAPS, TYPES, VIDEO_OUT, headStrap, inputOptions, ioInfo, standInfo } from '../data/devices'
import { contains, coverScreen, isEdge, isRing, rectsOverlap, screenRect, speakerShape, standMount } from './geometry'
import { clamp } from './rng'
import type { Body, CostParts, CustomChip, DeviceDesign, DeviceType, Evaluation, Issue, Levels, PlacedPart, Specs } from './types'

/** Front cameras use smaller modules than rear ones. */
export const selfieMinDia = (sensor: number) => Math.round((3 + 0.15 * sensor) * 10) / 10

const lerp01 = (v: number, zero: number, full: number) => clamp((v - zero) / (full - zero), 0, 1)

export const minBezel = (type: DeviceType, designLevel: number) => Math.round(MIN_BEZEL[designLevel] * TYPES[type].bezelScale * 20) / 20
export function minThickness(type: DeviceType, designLevel: number, specs?: Specs): number {
  const T = TYPES[type]
  // a graphics card needs room behind the board, and a headset's lenses need their focal length in front of the eye
  const extra = (T.gpu ? GPUS[specs?.gpu ?? 0].thick : 0) + (type === 'headset' ? (OPTICS[specs?.optics ?? 0] ?? OPTICS[0]).depth : 0)
  return Math.max(3.5, MIN_THICKNESS[designLevel] * (T.thickScale ?? 1) + T.thickBase) + extra
}

/** A foldable shut: both halves and the gap its hinge leaves between them, mm. */
export const foldedThickness = (d: DeviceDesign) => 2 * d.body.thickness + (HINGES[d.specs.hinge ?? 0] ?? HINGES[0]).gap

export function maxBattery(b: Body, batteryLevel: number, type: DeviceType = 'phone'): number {
  if (TYPES[type].mains) return 0
  const m = TYPES[type].batt
  // a headset with a battery on the back of its band has half as much room again
  const room = type === 'headset' && b.strap === 'pack' ? 1.5 : 1
  const vol = (Math.max(0, b.width - m.mx) * Math.max(0, b.height - m.my) * Math.max(0, b.thickness - m.mt) * room) / 1000
  const cap = Math.floor((vol * m.fill * batteryDensity(batteryLevel)) / 50) * 50
  // laptops stop at about 100 Wh, the most that may be carried on a flight
  return type === 'laptop' ? Math.min(cap, LAPTOP_BATTERY_CAP) : cap
}
export const LAPTOP_BATTERY_CAP = 26000

/** Battery capacity the way it is quoted for the device type. */
export const batteryLabel = (type: DeviceType, mah: number) => (type === 'laptop' ? `${Math.round((mah * 3.85) / 1000)} Wh` : `${mah} mAh`)
/** Charging power in watts. An earbud case charges at a tenth of what a phone does. */
export const chargeWatts = (type: DeviceType, level: number) => (type === 'earbuds' ? CHARGE_W[level] / 10 : CHARGE_W[level])
/** Name of a display level: a panel, or for a console what its video output can drive. */
export const panelName = (type: DeviceType, level: number) => (type === 'console' ? VIDEO_OUT[level] : PANEL_NAMES[level])

/** Screen-to-body ratio a top design at this level is expected to reach. */
function targetSbr(type: DeviceType, level: number): number {
  const t = TYPES[type]
  const m = minBezel(type, clamp(Math.round(level), 0, 8))
  const w = t.width[2]
  const h = t.height[2]
  return ((w - 2 * (m + (t.flank ?? 0))) * (h - 2 * m)) / (w * h) - 0.01
}

export interface ChipSpec {
  name: string
  perf: number
  eff: number
  cost: number
  gen: number
  custom: boolean
  /** Heat at full load in a phone-sized design; larger devices scale it up. */
  watts: number
}

/** The chip a design uses: one of the company's own, or an off-the-shelf Helix. */
export function chipFor(s: Specs, chips?: CustomChip[]): ChipSpec {
  const own = s.customChip ? chips?.find((c) => c.id === s.customChip && c.status === 'ready') : undefined
  if (own) {
    return {
      name: own.name,
      gen: own.gen,
      custom: true,
      perf: refScore(own.gen) * (0.86 + 0.12 * own.power + 0.06 * own.graphics) * own.quality,
      eff: (1 + 0.08 * own.gen) * (0.85 + 0.35 * own.efficiency) * own.quality,
      // no supplier margin, but a bigger design costs more silicon
      cost: 70 * Math.pow(1.12, own.gen) * (0.45 + 0.35 * own.power + 0.2 * own.graphics + 0.1 * own.efficiency) * 0.7,
      watts: 15 + 28 * own.power + 12 * own.graphics - 10 * own.efficiency,
    }
  }
  return { ...chipInfo(s.chipGen, s.chipTier), gen: s.chipGen, custom: false, watts: [15, 28, 45][s.chipTier] ?? 28 }
}

/** Weight of one earbud in grams. */
export function budWeight(d: DeviceDesign): number {
  const s = d.specs
  return 3.3 + (DRIVERS[s.driver ?? 0] ?? DRIVERS[0]).weight + (ANC[s.anc ?? 0] ?? ANC[0]).weight + (d.body.buds === 'bean' ? 0.2 : 0.6)
}

export function deviceWeight(d: DeviceDesign): number {
  const b = d.body
  const t = TYPES[d.type]
  const frame = materialInfo(b.frameMat)
  const back = materialInfo(b.backMat)
  const volume = d.type === 'speaker' ? speakerShape(b).litres * 1000 : (b.width * b.height * b.thickness) / 1000
  // an earbud case has no frame, only a hinge and trim in the frame material
  const frameVol = ((2 * (b.width + b.height) * b.thickness * 1.5) / 1000) * (d.type === 'earbuds' ? 0.12 : 1)
  const plateVol = (b.width * b.height * 0.7) / 1000
  let w = d.specs.battery * 0.011 + frameVol * frame.density + plateVol * back.density + (t.noScreen ? 0 : plateVol * 2.5) + volume * t.density
  if (t.gpu) w += GPUS[d.specs.gpu ?? 0].weight
  if (d.type === 'desktop' || d.type === 'tv') w += standInfo(d.type, b.stand).weight * areaScale(d)
  if (d.type === 'earbuds') w += 2 * budWeight(d)
  if (d.type === 'foldable') w += (HINGES[d.specs.hinge ?? 0] ?? HINGES[0]).weight
  if (d.type === 'headset') w += (OPTICS[d.specs.optics ?? 0] ?? OPTICS[0]).weight + headStrap(b.strap).weight
  if (d.type === 'speaker') w += (SPEAKER_DRIVERS[d.specs.driver ?? 0] ?? SPEAKER_DRIVERS[0]).weight
  return w
}

/** Size of the body's face relative to the type's default, for costs and limits that grow with it. */
const areaScale = (d: DeviceDesign) => (d.body.width * d.body.height) / (TYPES[d.type].width[2] * TYPES[d.type].height[2])

/**
 * How well a mains-powered design sheds its heat. Headroom of 1 or more runs
 * cool and quiet; below about a half it cannot be sold. Null for types this
 * does not apply to.
 */
export function thermal(d: DeviceDesign, chips?: CustomChip[]): { heat: number; litres: number; headroom: number } | null {
  const T = TYPES[d.type]
  if (!T.mains?.cool) return null
  const b = d.body
  const s = d.specs
  const scr = screenRect(b)
  // the display panel itself takes the first few millimetres behind the glass
  const panel = T.noScreen ? 0 : scr.w * scr.h * Math.min(b.thickness, 8)
  const litres = (b.width * b.height * b.thickness - panel) / 1e6
  const heat = chipFor(s, chips).watts * (T.heat ?? 1) + (T.gpu ? GPUS[s.gpu ?? 0].drain : 0)
  const cooler = COOLERS[s.cooling ?? 0] ?? COOLERS[0]
  return { heat, litres, headroom: (litres * 40 * cooler.factor) / heat }
}

/**
 * feats = researched branch features, chips = the company's own chips.
 * Leave both out for a company that owns everything up to its levels (rivals).
 */
export function evaluate(d: DeviceDesign, lv: Levels, mLevel: number, feats?: string[], chips?: CustomChip[]): Evaluation {
  const owned = new Set(feats ?? featuresAtLevels(lv))
  const b = d.body
  const s = d.specs
  const type = d.type
  const T = TYPES[type]
  const slab = type === 'phone' || type === 'tablet' || type === 'foldable'
  const hasScreen = !T.noScreen
  const spk = type === 'speaker' ? speakerShape(b) : null
  const hinge = HINGES[s.hinge ?? 0] ?? HINGES[0]
  const optics = OPTICS[s.optics ?? 0] ?? OPTICS[0]
  const mics = MIC_ARRAYS[s.mics ?? 0] ?? MIC_ARRAYS[0]
  const woofer = SPEAKER_DRIVERS[s.driver ?? 0] ?? SPEAKER_DRIVERS[0]
  const headband = headStrap(b.strap)
  const flank = T.flank ?? 0
  const issues: Issue[] = []
  const err = (text: string, partId?: string) => issues.push({ level: 'error', text, partId })
  const warn = (text: string, partId?: string) => issues.push({ level: 'warn', text, partId })

  const scr = screenRect(b)
  // lit area: the screen, plus a foldable's cover screen; a headset's two small displays; a speaker's touch screen if it has one
  const cover = type === 'foldable' ? coverScreen(b) : null
  const areaCm2 = hasScreen ? (scr.w * scr.h + (cover ? cover.w * cover.h : 0)) / 100 : type === 'headset' ? HEADSET_PANELS : spk?.screen ? (spk.screen.w * spk.screen.h * (spk.form === 'orb' ? Math.PI / 4 : 1)) / 100 : 0
  const diag = hasScreen ? Math.hypot(scr.w, scr.h) / 25.4 : spk?.screen ? (spk.form === 'orb' ? spk.screen.w : Math.hypot(spk.screen.w, spk.screen.h)) / 25.4 : 0
  // a display level only matters to a device that shows a picture
  const shows = type !== 'earbuds' && (type !== 'speaker' || !!spk?.screen)
  const panel = panelInfo(s.panel)
  const rf = REFRESH.find((r) => r.hz === s.refresh) ?? REFRESH[0]
  const chip = chipFor(s, chips)
  const frame = materialInfo(b.frameMat)
  const back = materialInfo(b.backMat)
  const gpu = T.gpu ? (GPUS[s.gpu ?? 0] ?? GPUS[0]) : GPUS[0]
  const io = s.io ?? []
  const has = (id: string) => s.extras.includes(id)
  const ref = refScore(mLevel)

  // ---- tech locks and physical limits
  if (s.customChip && !chip.custom) err('The chosen in-house chip is not ready')
  if (s.panel > lv.display && (shows || type === 'earbuds')) err(type === 'console' ? `${VIDEO_OUT[s.panel]} output needs Display level ${s.panel}` : shows ? `${panel.name} ${type === 'headset' ? 'displays need' : 'panel needs'} Display level ${s.panel}` : `This design needs Display level ${s.panel}`)
  if (rf.feat && !owned.has(rf.feat) && shows) err(`${rf.hz} Hz refresh is not researched yet`)
  if (!chip.custom && s.chipGen > lv.chipset) err(`${chip.name} needs Chipset level ${s.chipGen}`)
  if (s.charging > lv.charging) err(`${chargeWatts(type, s.charging)} W charging needs Charging level ${s.charging}`)
  if (frame.level > lv.materials) err(`${frame.name} needs Materials level ${frame.level}`)
  if (back.level > lv.materials) err(`${back.name} needs Materials level ${back.level}`)
  for (const id of s.extras) {
    const ex = EXTRAS.find((e) => e.id === id)
    if (ex && !owned.has(ex.id)) err(`${ex.name} is not researched yet`)
  }
  const minBez = minBezel(type, lv.design)
  if (hasScreen && Math.min(b.bezelSide - flank, b.bezelTop, b.bezelBottom) < minBez - 1e-6) err(flank && b.bezelSide < flank ? `The controls need ${flank} mm either side of the screen` : `Bezels below ${minBez} mm need better Industrial design`)
  const minThick = minThickness(type, lv.design, s)
  if (b.thickness < minThick - 1e-6) err(gpu.thick ? `This graphics card needs a body at least ${minThick.toFixed(1)} mm ${type === 'console' ? 'deep' : 'thick'}` : type === 'headset' ? `A visor with ${optics.name.toLowerCase()} must be at least ${minThick.toFixed(0)} mm deep` : T.thickScale === 0 ? `The ${type === 'earbuds' ? 'case' : type === 'speaker' ? 'body' : 'box'} must be at least ${minThick.toFixed(0)} mm deep` : `Body thinner than ${minThick.toFixed(1)} mm needs better Industrial design`)
  const maxBat = maxBattery(b, lv.battery, type)
  if (!T.mains && s.battery > maxBat) err(`Battery does not fit: this ${type === 'earbuds' ? 'case' : type === 'headset' ? 'headset' : 'body'} holds at most ${batteryLabel(type, maxBat)}`)
  if (type === 'foldable' && hinge.level > lv.materials) err(`${hinge.name} needs Materials level ${hinge.level}`)
  if (type === 'headset') {
    if (optics.level > lv.display) err(`${optics.name} need Display level ${optics.level}`)
    if (headband.level > lv.materials) err(`${headband.name} needs Materials level ${headband.level}`)
  }
  if (spk) {
    if (woofer.level > lv.materials) err(`${woofer.name} needs Materials level ${woofer.level}`)
    if (mics.level > lv.chipset) err(`${mics.name} needs Chipset level ${mics.level}`)
    if (spk.litres < woofer.litres - 1e-6) err(`${woofer.name} needs an enclosure of at least ${woofer.litres.toFixed(1)} L: make the body larger`)
  }

  // ---- parts
  const rear = d.parts.filter((p) => p.kind === 'camera' && p.face === 'back')
  const selfie = d.parts.filter((p) => p.kind === 'camera' && p.face === 'front')
  const notches = d.parts.filter((p) => p.kind === 'notch')
  const camQ = (p: PlacedPart) => {
    const sn = sensorInfo(p.sensor ?? 0)
    if ((p.sensor ?? 0) > lv.camera) err(`${sn.name} sensor needs Camera level ${p.sensor}`, p.id)
    if (p.lens === 'periscope' && !owned.has('periscope')) err('The periscope lens is not researched yet', p.id)
    const dia = Math.min(p.w, p.h)
    const need = p.face === 'front' ? selfieMinDia(p.sensor ?? 0) : sn.minDia
    if (dia < need - 0.05) warn(`Lens is too small for the ${sn.name} sensor (needs ${need} mm)`, p.id)
    return sn.quality * clamp(dia / need, 0.4, 1)
  }
  const best = (list: PlacedPart[]) => list.reduce((m, p) => Math.max(m, camQ(p)), 0)
  const wide = best(rear.filter((p) => (p.lens ?? 'wide') === 'wide'))
  const uw = best(rear.filter((p) => p.lens === 'ultrawide'))
  const tele = Math.max(best(rear.filter((p) => p.lens === 'tele')), best(rear.filter((p) => p.lens === 'periscope')) * 1.12)
  const macro = best(rear.filter((p) => p.lens === 'macro'))
  const selfieQ = best(selfie)

  for (const p of selfie) {
    const inScreen = hasScreen && Math.abs(p.x - scr.cx) < scr.w / 2 && Math.abs(p.y - scr.cy) < scr.h / 2
    if (!inScreen) continue
    if (p.underDisplay) {
      if (!owned.has('udc')) err('Under-display camera is not researched yet', p.id)
    } else if (!owned.has('punch') && !notches.some((n) => contains(n, p))) {
      err('A camera inside the screen needs a notch until Punch-hole camera is researched', p.id)
    }
  }
  for (const p of d.parts) {
    if (p.kind === 'fingerprint' && p.face === 'front' && !owned.has('fpdisplay')) err('Under-display fingerprint is not researched yet', p.id)
  }
  const buttons = d.parts.filter((p) => p.kind === 'button')
  const sockets = d.parts.filter((p) => p.kind === 'port' || p.kind === 'slot')
  const lights = d.parts.filter((p) => p.kind === 'light')
  const stereo = has('stereo')

  // ---- what is fitted from the type's list of ports, sensors or features
  let ioValue = 0
  let ioCost = 0
  let ioSockets = 0
  for (const id of io) {
    const info = ioInfo(type, id)
    if (!info) continue
    if (info.level > lv.chipset) err(`${info.name} needs Chipset level ${info.level}`)
    ioValue += info.value
    ioCost += info.cost
    if (info.size) ioSockets += info.count ?? 1
  }
  if (ioSockets > sockets.length) warn(ioSockets - sockets.length === 1 ? 'One of the chosen ports has no socket on the body' : `${ioSockets - sockets.length} of the chosen ports have no socket on the body`)
  const input = T.input ? inputOptions(type)[s.keyboard ?? 0] ?? inputOptions(type)[0] : undefined
  const inputRank = (s.keyboard ?? 0) / 3
  if (input && input.level > lv.design) err(`${input.name} needs Industrial design level ${input.level}`)
  const webcam = selfie.length ? 0.5 + 0.5 * Math.min(1, selfieQ / refScore(Math.max(0, mLevel - 2))) : 0

  // ---- the type's special score
  let special = 0
  if (T.special === 'camera') {
    const main = wide > 0 ? wide : 0.7 * Math.max(uw, tele, macro)
    special = 0.6 * main + 0.15 * uw + 0.2 * tele + 0.02 * macro + 0.08 * selfieQ
    if (!d.parts.some((p) => p.kind === 'flash' && p.face === 'back')) special *= 0.97
    if (rear.length === 0 && (type === 'phone' || type === 'foldable')) warn('No rear camera')
    if (selfie.length === 0) warn('No front camera')
    if (!d.parts.some((p) => p.kind === 'port') && !has('wireless')) err('No charging port and no wireless charging')
    if (buttons.length === 0) warn('No buttons: there is no way to power it on')
    if (!d.parts.some((p) => p.kind === 'grille')) warn('No speaker grille')
  } else if (T.special === 'sensors') {
    special = ioValue
    if (io.length === 0) warn('No health sensors')
    if (io.length > 0 && !d.parts.some((p) => p.kind === 'island')) warn('Health sensors need a sensor window on the back')
    if (buttons.length === 0) warn('No crown or button')
    const strap = STRAPS.find((x) => x.id === b.strap)
    if (strap && strap.level > lv.materials) err(`${strap.name} strap needs Materials level ${strap.level}`)
  } else if (T.special === 'io') {
    if (selfie.length === 0) warn('No webcam')
    let pct: number
    if (type === 'laptop') {
      if (!io.some((id) => id === 'usbc' || id === 'usbc2' || id === 'thunder')) err('A laptop needs a USB-C or Thunderlink port to charge')
      pct = 0.35 * inputRank + 0.3 * Math.min(1, ioValue / 4.5) + 0.2 * webcam + 0.15 * (stereo ? 1 : 0.3)
    } else {
      if (io.length === 0) warn('No ports: nothing can be plugged in')
      if (buttons.length === 0) warn('No power button')
      pct = 0.35 * inputRank + 0.37 * Math.min(1, ioValue / 5) + 0.28 * webcam
    }
    special = pct * ref * 1.1
  } else if (T.special === 'games') {
    if (io.includes('disc') && Math.max(b.width, b.height) < 132) err('A disc drive needs a front at least 132 mm wide or tall')
    if (buttons.length === 0) warn('No power button')
    if (!d.parts.some((p) => p.kind === 'vent')) warn('No vents: the hot air has nowhere to go')
    special = (0.42 * inputRank + 0.58 * Math.min(1, ioValue / 4.6)) * ref * 1.1
  } else if (T.special === 'smarts') {
    special = ioValue
    if (io.includes('through') && !(s.anc ?? 0)) err('Transparency mode needs noise-cancelling microphones')
    if (!d.parts.some((p) => p.kind === 'port') && !has('wireless')) err('No charging port and no wireless charging')
  } else if (T.special === 'tracking') {
    // tracking cameras see the room and the hands: four cover everything, and sharper ones track more steadily
    const seen = Math.min(1, selfie.length / 4) * (selfie.length ? 0.6 + 0.4 * Math.min(1, selfieQ / refScore(Math.max(0, mLevel - 2))) : 0)
    if (selfie.length === 0) err('A headset needs tracking cameras to know where it is')
    else if (selfie.length < 4) warn('Fewer than four tracking cameras leave blind spots')
    if (!(s.keyboard ?? 0) && !io.includes('hands')) err('With no controllers it needs hand tracking')
    if (!d.parts.some((p) => p.kind === 'port')) err('No charging port')
    if (buttons.length === 0) warn('No power button')
    special = (0.3 * inputRank + 0.3 * seen + 0.4 * Math.min(1, ioValue / 4.6)) * ref * 1.1
  } else if (T.special === 'home') {
    special = ioValue
    if (!d.parts.some((p) => p.kind === 'port')) err('No power inlet')
    if (buttons.length === 0) warn('No buttons: there is no way to mute it')
  } else if (T.special === 'play') {
    if (!d.parts.some((p) => p.kind === 'port')) err('No charging port')
    if (buttons.length === 0) warn('No power button')
    if (!d.parts.some((p) => p.kind === 'vent')) warn('No vents: the fan has nowhere to breathe')
    if (!d.parts.some((p) => p.kind === 'grille')) warn('No speaker grille')
    special = (0.45 * inputRank + 0.55 * Math.min(1, ioValue / 4.4)) * ref * 1.1
  } else {
    if (!io.includes('hdmi') && !io.includes('hdmi4')) warn('No HDMI inputs')
    if (buttons.length === 0) warn('No power button on the set')
    special = (0.12 + 0.88 * Math.min(1, ioValue / 5.2)) * ref * 1.1
  }

  // overlaps: parts may sit on an island, and a camera may sit in a notch
  let overlaps = 0
  for (let i = 0; i < d.parts.length; i++) {
    for (let j = i + 1; j < d.parts.length; j++) {
      const p = d.parts[i]
      const q = d.parts[j]
      if (p.face !== q.face) continue
      const oneIsland = (p.kind === 'island') !== (q.kind === 'island')
      const oneNotch = (p.kind === 'notch') !== (q.kind === 'notch')
      // a speaker's light ring runs round everything else on its top
      if (oneIsland || oneNotch || isRing(p, type) || isRing(q, type)) continue
      if (rectsOverlap(p, q)) {
        overlaps++
        warn('Parts are clipping into each other', q.id)
      }
    }
  }
  const mount = standMount(b, type)
  if (mount) {
    const patch: PlacedPart = { id: '', kind: 'island', face: 'back', rot: 0, ...mount }
    for (const p of d.parts) {
      if (p.face !== 'back' || !rectsOverlap(p, patch)) continue
      overlaps++
      warn('This part is where the stand attaches', p.id)
    }
  }

  // ---- raw sub-scores
  const memoryFit = T.memory > 0 ? 0.8 + 0.12 * Math.min(1, s.ram / (idealRam(mLevel) * T.memory)) + 0.08 * Math.min(1, s.storage / (idealStorage(mLevel) * T.memory)) : 0.95
  const driver = DRIVERS[s.driver ?? 0] ?? DRIVERS[0]
  const anc = ANC[s.anc ?? 0] ?? ANC[0]
  const stem = b.buds !== 'bean'
  let perf = chip.perf * memoryFit * (T.gpu ? 0.7 + gpu.boost : 1)
  let display: number
  if (type === 'earbuds') {
    // sound comes mostly from the driver, noise cancelling from its own electronics
    if (driver.level > lv.materials) err(`${driver.name} driver needs Materials level ${driver.level}`)
    if (anc.level > lv.chipset) err(`${anc.name} needs Chipset level ${anc.level}`)
    perf = (0.6 * refScore(driver.tech) + 0.4 * chip.perf) * memoryFit
    display = Math.max(10, refScore(anc.tech)) * (stem ? 1 : 1.04)
  } else if (type === 'console') {
    // a sharper output is only worth having with the graphics power to drive it
    display = panel.quality * (0.8 + rf.bonus) * [0.8, 0.88, 0.95, 1][s.gpu ?? 0]
  } else if (type === 'headset') {
    // the picture reaches the eye through the lenses
    display = panel.quality * (0.8 + rf.bonus) * optics.clarity
  } else if (spk) {
    // sound comes mostly from the drivers, with the chip tuning them; a small box holds them back
    const fit = 0.86 + 0.14 * lerp01(spk.litres, 0.3, 1.6)
    perf = (0.72 * refScore(woofer.tech) + 0.28 * chip.perf) * fit
    // the assistant is as good as what it hears and how fast it thinks, and a screen lets it show its answers
    display = (0.5 * refScore(mics.tech) + 0.5 * chip.perf) * (spk.screen ? 0.84 + 0.3 * Math.min(1, panel.quality / ref) : 0.84)
  } else {
    const sizeF = diag < T.diag[0] ? 1 - Math.min(0.15, ((T.diag[0] - diag) / T.diag[0]) * 0.6) : diag <= T.diag[1] ? 1 : 0.93
    display = panel.quality * (0.8 + rf.bonus) * sizeF * (type === 'foldable' ? hinge.crease : 1)
  }

  // ---- battery, or for mains devices cooling and sound
  let life = 0
  let lifeHours = 0
  let battery: number
  const heat = thermal(d, chips)
  const cooler = COOLERS[s.cooling ?? 0] ?? COOLERS[0]
  const speakers = SPEAKERS[s.speakers ?? 0] ?? SPEAKERS[0]
  if (T.mains) {
    let cool = 1
    if (heat) {
      if (cooler.level > lv.materials) err(`${cooler.name} cooling needs Materials level ${cooler.level}`)
      cool = lerp01(heat.headroom, 0.35, 1)
      if (heat.headroom < 0.5) err(`It overheats: ${Math.round(heat.heat)} W of heat needs a larger body or better cooling`)
      else if (heat.headroom < 0.8) warn('Runs hot and loud under load')
    }
    if (T.mains.sound > 0) {
      if (speakers.level > lv.design) err(`${speakers.name} speakers need Industrial design level ${speakers.level}`)
      if (b.thickness < speakers.thick - 1e-6) err(`${speakers.name} speakers need a body at least ${speakers.thick} mm thick`)
    }
    // a speaker's bass and loudness come from the size of its enclosure and the drivers in it
    battery = (spk ? 0.5 * lerp01(spk.litres, 0.25, 2.4) + 0.5 * woofer.bass : T.mains.cool * cool + T.mains.sound * speakers.quality) * ref * 1.1
  } else if (type === 'earbuds') {
    // each bud has a small cell of its own; the case recharges both several times
    const cell = (stem ? 0.19 : 0.155) * batteryDensity(lv.battery)
    const budHours = (cell * chip.eff) / (T.drainBase + driver.drain + anc.drain)
    lifeHours = budHours * (1 + (s.battery * 0.85) / (2 * cell))
    life = budHours + 0.2 * (lifeHours - budHours)
    battery = life * T.lifeScore + 12 + 3.5 * s.charging + (has('wireless') ? 4 : 0)
  } else {
    const rfPower = s.panel >= 3 ? 1 + (rf.power - 1) / 2 : rf.power
    // a foldable lights one screen at a time, mostly the big one
    const lit = cover ? (scr.w * scr.h * 0.8 + cover.w * cover.h * 0.2) / 100 : areaCm2
    const drain = lit * panel.power * rfPower * 0.9 + T.drainBase + gpu.drain + chip.watts * (T.chipDrain ?? 0)
    life = (s.battery * chip.eff) / drain
    lifeHours = life * T.lifeHours
    battery = life * T.lifeScore + 12 + 3.5 * s.charging + (has('wireless') ? 4 : 0)
  }

  // ---- design score, derived from the physical model
  const dl = clamp(mLevel, 0, 8)
  const sbr = hasScreen ? (scr.w * scr.h) / (b.width * b.height) : 0
  const weight = deviceWeight(d)
  const idealThick = minThickness(type, Math.round(dl), s) + T.thin[0]
  const backArea = b.width * b.height
  const islands = d.parts.filter((p) => p.kind === 'island')
  const looseCams = rear.filter((c) => !islands.some((i) => contains(i, c)))
  const bumpArea = islands.reduce((a, p) => a + p.w * p.h, 0) + looseCams.reduce((a, p) => a + p.w * p.h, 0)

  // symmetry and alignment of everything on the face that is judged: the back, or the front of a box
  const judged = type === 'console' || type === 'earbuds' || type === 'headset' ? 'front' : type === 'speaker' ? 'top' : 'back'
  const backParts = d.parts.filter((p) => p.face === judged)
  // a foldable's back is judged about the middle of the half that is not a screen
  const mid = type === 'foldable' ? -b.width / 4 : 0
  let tidy = 0
  for (const p of backParts) {
    const centred = Math.abs(p.x - mid) < 0.75
    const mirrored = backParts.some((q) => q !== p && q.kind === p.kind && Math.abs(q.x + p.x - 2 * mid) < 0.75 && Math.abs(q.y - p.y) < 0.75)
    const aligned = backParts.some((q) => q !== p && q.kind !== 'island' && (Math.abs(q.x - p.x) < 0.6 || Math.abs(q.y - p.y) < 0.6))
    if (p.kind === 'island' && slab) {
      const inside = rear.filter((c) => contains(p, c))
      const cx = inside.reduce((a, c) => a + c.x, 0) / (inside.length || 1)
      const cy = inside.reduce((a, c) => a + c.y, 0) / (inside.length || 1)
      const balanced = inside.length > 0 && Math.abs(cx - p.x) < 1.2 && Math.abs(cy - p.y) < p.h * 0.2
      if (centred || mirrored || balanced) tidy++
    } else if (centred || mirrored || aligned) tidy++
  }
  const symmetry = backParts.length ? tidy / backParts.length : 0.5

  let ergo: number
  if (type === 'phone' || type === 'foldable') {
    // width in the hand, reachable buttons, lateral balance of the camera mass
    const sideButtons = buttons.filter((p) => p.face === 'left' || p.face === 'right')
    const reach = sideButtons.length ? sideButtons.filter((p) => p.x > -b.height * 0.1 && p.x < b.height * 0.36).length / sideButtons.length : 0
    const camMass = rear.reduce((a, p) => a + p.w * p.h, 0)
    const camOffset = camMass ? Math.abs(rear.reduce((a, p) => a + p.x * p.w * p.h, 0) / camMass) / (b.width / 2) : 0
    // a foldable is held shut most of the time: half as wide, but twice as thick
    ergo = type === 'foldable' ? 0.4 * (1 - lerp01(b.width / 2, 74, 86)) + 0.3 * reach + 0.3 * (1 - lerp01(foldedThickness(d), 10.5, 16.5)) : 0.5 * (1 - lerp01(b.width, 78, 90)) + 0.3 * reach + 0.2 * (1 - lerp01(camOffset * (camMass / backArea), 0.03, 0.12))
  } else if (type === 'handheld') {
    // light enough to hold up for an hour, and not so wide that the thumbs have to stretch
    ergo = 0.5 * (1 - lerp01(weight, 430, 780)) + 0.3 * (1 - lerp01(b.width, 268, 308)) + 0.2 * (buttons.length ? 1 : 0)
  } else if (type === 'headset') {
    ergo = 0.5 * (buttons.length ? 1 : 0) + 0.5 * (lights.length ? 1 : 0.4)
  } else if (type === 'speaker') {
    ergo = 0.5 * Math.min(1, buttons.filter((p) => p.face === 'top').length / 3) + 0.5 * (lights.length ? 1 : 0)
  } else if (type === 'tablet') {
    ergo = 0.6 * (1 - lerp01(weight, 520, 820)) + 0.4 * (buttons.length ? 1 : 0)
  } else if (type === 'watch') {
    ergo = 0.6 * (1 - lerp01(b.height, 47, 56)) + 0.4 * (buttons.some((p) => p.crown) ? 1 : buttons.length ? 0.6 : 0)
  } else if (type === 'laptop') {
    ergo = 0.5 * (1 - lerp01(weight, 1500, 2800)) + 0.5 * (1 - lerp01(b.thickness, 17, 29))
  } else if (type === 'desktop' || type === 'tv') {
    // sockets you can reach without turning the whole thing round
    const ports = d.parts.filter((p) => p.kind === 'port')
    const near = ports.filter((p) => p.face !== 'back' || Math.abs(p.x) > b.width * 0.3)
    ergo = 0.6 * (ports.length ? near.length / ports.length : 0.3) + 0.4 * (buttons.length ? 1 : 0)
  } else if (type === 'console') {
    ergo = 0.5 * (sockets.some((p) => p.face === 'front' && p.kind === 'port') ? 1 : 0.2) + 0.5 * (buttons.some((p) => p.face === 'front' || p.face === 'top') ? 1 : 0)
  } else {
    ergo = 0.5 * (lights.length ? 1 : 0) + 0.5 * (buttons.length ? 1 : 0)
  }

  const finish = b.backFinish === 'matte' && back.id === 'plastic' ? -0.05 : 0
  const materials = clamp((frame.premium + back.premium) / 2 + finish, 0, 1)
  const notchPenalty = notches.length > 0 && dl >= 1.5 ? 0.5 : 1
  const strap = STRAPS.find((x) => x.id === b.strap) ?? STRAPS[0]
  const onStand = type === 'desktop' || type === 'tv'
  const stand = standInfo(type === 'tv' ? 'tv' : 'desktop', b.stand)
  const wScale = T.weightByArea ? areaScale(d) : 1
  const weightRow = (max: number) => ({ key: 'weight', label: 'Weight', max, score: max * (1 - lerp01(weight, T.weight[0] * wScale, T.weight[1] * wScale)) })

  let breakdown: { key: string; label: string; score: number; max: number }[]
  if (type === 'console') {
    const litres = (b.width * b.height * b.thickness) / 1e6
    breakdown = [
      { key: 'compact', label: 'Compact size', max: 26, score: 26 * (1 - lerp01(litres, 4.5, 13)) },
      weightRow(10),
      { key: 'detail', label: 'Lighting and badge', max: 10, score: (lights.length ? 6 : 0) + (d.parts.some((p) => p.kind === 'logo') ? 4 : 0) },
      { key: 'sym', label: 'Symmetry and alignment', max: 20, score: 20 * symmetry },
      { key: 'ergo', label: 'Front access', max: 14, score: 14 * ergo },
      { key: 'mat', label: 'Materials', max: 20, score: 20 * materials },
    ]
  } else if (type === 'earbuds') {
    const cm3 = (b.width * b.height * b.thickness) / 1000
    breakdown = [
      { key: 'compact', label: 'Pocket size', max: 26, score: 26 * (1 - lerp01(cm3, 52, 105)) },
      weightRow(12),
      { key: 'fit', label: 'Bud comfort', max: 12, score: 12 * (1 - lerp01(budWeight(d), 4.6, 7.2)) },
      { key: 'sym', label: 'Symmetry and alignment', max: 15, score: 15 * symmetry },
      { key: 'ergo', label: 'Light and button', max: 10, score: 10 * ergo },
      { key: 'mat', label: 'Materials', max: 25, score: 25 * materials },
    ]
  } else if (type === 'headset') {
    // what is on the face is what tires the neck: the visor's weight, how far it sticks out, and what the band does to balance it
    const front = weight - headband.weight - (b.strap === 'pack' ? s.battery * 0.011 : 0)
    breakdown = [
      { key: 'weight', label: 'Weight on the face', max: 24, score: 24 * (1 - lerp01(front, T.weight[0] - 90, T.weight[1] - 90)) },
      { key: 'slim', label: 'Slim visor', max: 16, score: 16 * (1 - lerp01(b.thickness, 50, 92)) },
      { key: 'strap', label: 'Strap and balance', max: 20, score: 20 * headband.comfort },
      { key: 'sym', label: 'Symmetry and alignment', max: 14, score: 14 * symmetry },
      { key: 'ergo', label: 'Light and buttons', max: 8, score: 8 * ergo },
      { key: 'mat', label: 'Materials', max: 18, score: 18 * materials },
    ]
  } else if (spk) {
    const footprint = (b.width * b.thickness) / 100
    breakdown = [
      { key: 'compact', label: 'Small footprint', max: 24, score: 24 * (1 - lerp01(footprint, 110, 330)) },
      { key: 'shape', label: 'Proportions', max: 14, score: 14 * (1 - lerp01(Math.abs(Math.log(b.width / b.thickness)), 0.1, 0.7)) * (1 - 0.5 * lerp01(b.height / Math.min(b.width, b.thickness), 2.1, 3.4)) },
      { key: 'detail', label: 'Light and controls', max: 16, score: 16 * ergo },
      { key: 'sym', label: 'Symmetry and alignment', max: 16, score: 16 * symmetry },
      { key: 'screen', label: 'Screen', max: 8, score: spk.screen ? 8 * lerp01(diag, 2.2, 7) : 0 },
      { key: 'mat', label: 'Fabric and trim', max: 22, score: 22 * materials },
    ]
  } else {
    const fourth =
      type === 'watch'
        ? { key: 'strap', label: 'Strap', max: 10, score: 10 * strap.premium }
        : type === 'laptop'
          ? { key: 'deck', label: 'Keyboard deck', max: 10, score: 10 * (0.25 + 0.75 * ((s.keyboard ?? 0) / 3)) }
          : onStand
            ? { key: 'stand', label: 'Stand', max: 10, score: 10 * stand.premium }
            : type === 'foldable'
              ? { key: 'hinge', label: 'Hinge and crease', max: 10, score: 10 * hinge.premium }
              : type === 'handheld'
                ? { key: 'grip', label: 'Controls in the hand', max: 10, score: 10 * (0.25 + 0.75 * ((s.keyboard ?? 0) / 3)) }
                : { key: 'bump', label: 'Camera housing', max: 10, score: 10 * (1 - lerp01(bumpArea / backArea, 0.14, 0.45)) }
    breakdown = [
      { key: 'sbr', label: type === 'handheld' ? 'Screen between the controls' : 'Screen-to-body', max: 28, score: 28 * lerp01(sbr, T.sbrFloor, targetSbr(type, dl)) * notchPenalty },
      { key: 'thin', label: 'Thinness', max: 12, score: 12 * (1 - lerp01(b.thickness, idealThick, idealThick + T.thin[1])) },
      weightRow(10),
      fourth,
      { key: 'sym', label: 'Symmetry and alignment', max: 15, score: 15 * symmetry },
      { key: 'ergo', label: onStand ? 'Reach of ports and buttons' : 'Ergonomics', max: 10, score: 10 * ergo },
      { key: 'mat', label: 'Materials', max: 15, score: 15 * materials },
    ]
  }
  const clipping = Math.min(20, overlaps * 4) + (buttons.length === 0 && type !== 'laptop' && type !== 'earbuds' ? 5 : 0)
  if (clipping > 0) breakdown.push({ key: 'clip', label: 'Clipping penalties', max: 0, score: -clipping })
  const pct = clamp(breakdown.reduce((a, x) => a + x.score, 0), 0, 100)
  const design = (pct / 100) * refScore(dl) * 1.06

  // ---- unit cost by supply category
  const shell = T.noScreen ? b.width * b.height + b.width * b.thickness + b.height * b.thickness : b.width * b.height
  const areaFactor = Math.pow(shell / (74 * 158), 0.6) * (type === 'watch' ? 2 : 1)
  const cost: CostParts = { semis: 0, displays: 0, memory: 0, batteries: 0, materials: 0, other: T.assembly }
  cost.semis = chip.cost * T.chipCost + gpu.cost * (T.gpuCost ?? 1) * Math.pow(1.1, chip.gen)
  for (const p of rear) cost.semis += sensorInfo(p.sensor ?? 0).cost * LENSES[p.lens ?? 'wide'].cost
  for (const p of selfie) cost.semis += sensorInfo(p.sensor ?? 0).cost * 0.6 * (p.underDisplay ? 1.5 : 1)
  cost.displays = areaCm2 * panel.costPerCm2 * (1 + rf.bonus) * T.panelCost
  cost.memory = T.memory > 0 ? s.ram * 2.5 + s.storage * 0.08 : type === 'earbuds' ? 1 : 4
  cost.batteries = T.mains ? 0 : s.battery * 0.0022 * (1 + 0.1 * lv.battery) + 1 + 0.04 * chargeWatts(type, s.charging)
  cost.materials = (frame.cost + back.cost) * areaFactor * (T.matCost ?? 1) + (type === 'watch' ? strap.cost : 0)
  if (type === 'foldable') cost.materials += hinge.cost
  if (type === 'headset') {
    cost.materials += headband.cost
    cost.other += optics.cost
  }
  if (spk) {
    cost.other += woofer.cost
    cost.semis += mics.cost
  }
  for (const id of s.extras) cost.other += EXTRAS.find((e) => e.id === id)?.cost ?? 0
  cost.other += d.parts.filter((p) => p.kind !== 'camera').length * 0.5
  if (d.parts.some((p) => p.kind === 'fingerprint' && !isEdge(p.face, type) && p.face === 'front')) cost.other += 4
  // sensors and radio features are chips; sockets and drives are not
  if (type === 'watch' || type === 'earbuds') cost.semis += ioCost
  else cost.other += ioCost
  if (input) cost.other += input.cost
  if (type === 'console') cost.semis += 3 + 2 * s.panel * (1 + rf.bonus)
  if (type === 'earbuds') {
    cost.semis += anc.cost
    cost.other += driver.cost
    cost.batteries += 1.6
  }
  if (T.mains) {
    // the power supply, then whatever keeps it cool and makes it heard
    cost.other += spk ? 3 : 6 + 0.05 * (heat?.heat ?? 40)
    if (T.mains.cool > 0) cost.other += cooler.cost
    if (T.mains.sound > 0) cost.other += speakers.cost
    if (onStand) cost.materials += stand.cost * areaScale(d)
  }
  cost.other += (d.colors?.length ?? 0) * 1.5
  const unitCost = cost.semis + cost.displays + cost.memory + cost.batteries + cost.materials + cost.other

  return {
    raw: { perf, display, camera: special, battery, design },
    report: { pct, breakdown, issues, weight, sbr, diag, maxBattery: maxBat, lifeHours },
    unitCost: Math.round(unitCost * 100) / 100,
    costParts: cost,
    // extras, plus a little for offering a choice of colours
    featureBonus: Math.min(0.08, s.extras.length * 0.015) + Math.min(0.03, (d.colors?.length ?? 0) * 0.01),
  }
}
