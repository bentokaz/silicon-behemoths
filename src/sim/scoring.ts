// Turns a DeviceDesign into raw sub-scores, a design report derived from the
// physical model, and a unit cost. No randomness: same design, same result.
import { CHARGE_W, EXTRAS, LENSES, MIN_BEZEL, MIN_THICKNESS, REFRESH, batteryDensity, chipInfo, featuresAtLevels, idealRam, idealStorage, materialInfo, panelInfo, refScore, sensorInfo } from '../data/catalog'
import { GPUS, KEYBOARDS, PORTS, SENSORS, STRAPS, TYPES } from '../data/devices'
import { contains, isSide, rectsOverlap, screenRect } from './geometry'
import { clamp } from './rng'
import type { Body, CostParts, CustomChip, DeviceDesign, DeviceType, Evaluation, Issue, Levels, PlacedPart, Specs } from './types'

/** Front cameras use smaller modules than rear ones. */
export const selfieMinDia = (sensor: number) => Math.round((3 + 0.15 * sensor) * 10) / 10

const lerp01 = (v: number, zero: number, full: number) => clamp((v - zero) / (full - zero), 0, 1)

export const minBezel = (type: DeviceType, designLevel: number) => Math.round(MIN_BEZEL[designLevel] * TYPES[type].bezelScale * 20) / 20
export function minThickness(type: DeviceType, designLevel: number, specs?: Specs): number {
  return Math.max(3.5, MIN_THICKNESS[designLevel] + TYPES[type].thickBase) + (type === 'laptop' ? GPUS[specs?.gpu ?? 0].thick : 0)
}

export function maxBattery(b: Body, batteryLevel: number, type: DeviceType = 'phone'): number {
  const m = TYPES[type].batt
  const vol = (Math.max(0, b.width - m.mx) * Math.max(0, b.height - m.my) * Math.max(0, b.thickness - m.mt)) / 1000
  const cap = Math.floor((vol * m.fill * batteryDensity(batteryLevel)) / 50) * 50
  // laptops stop at about 100 Wh, the most that may be carried on a flight
  return type === 'laptop' ? Math.min(cap, LAPTOP_BATTERY_CAP) : cap
}
export const LAPTOP_BATTERY_CAP = 26000

/** Battery capacity the way it is quoted for the device type. */
export const batteryLabel = (type: DeviceType, mah: number) => (type === 'laptop' ? `${Math.round((mah * 3.85) / 1000)} Wh` : `${mah} mAh`)

/** Screen-to-body ratio a top design at this level is expected to reach. */
function targetSbr(type: DeviceType, level: number): number {
  const t = TYPES[type]
  const m = minBezel(type, clamp(Math.round(level), 0, 8))
  const w = t.width[2]
  const h = t.height[2]
  return ((w - 2 * m) * (h - 2 * m)) / (w * h) - 0.01
}

export interface ChipSpec {
  name: string
  perf: number
  eff: number
  cost: number
  gen: number
  custom: boolean
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
    }
  }
  return { ...chipInfo(s.chipGen, s.chipTier), gen: s.chipGen, custom: false }
}

export function deviceWeight(d: DeviceDesign): number {
  const b = d.body
  const t = TYPES[d.type]
  const frame = materialInfo(b.frameMat)
  const back = materialInfo(b.backMat)
  const volume = (b.width * b.height * b.thickness) / 1000
  const frameVol = (2 * (b.width + b.height) * b.thickness * 1.5) / 1000
  const plateVol = (b.width * b.height * 0.7) / 1000
  const gpu = d.type === 'laptop' ? GPUS[d.specs.gpu ?? 0].weight : 0
  return d.specs.battery * 0.011 + frameVol * frame.density + plateVol * back.density + plateVol * 2.5 + volume * t.density + gpu
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
  const slab = type === 'phone' || type === 'tablet'
  const issues: Issue[] = []
  const err = (text: string, partId?: string) => issues.push({ level: 'error', text, partId })
  const warn = (text: string, partId?: string) => issues.push({ level: 'warn', text, partId })

  const scr = screenRect(b)
  const areaCm2 = (scr.w * scr.h) / 100
  const diag = Math.hypot(scr.w, scr.h) / 25.4
  const panel = panelInfo(s.panel)
  const rf = REFRESH.find((r) => r.hz === s.refresh) ?? REFRESH[0]
  const chip = chipFor(s, chips)
  const frame = materialInfo(b.frameMat)
  const back = materialInfo(b.backMat)
  const gpu = type === 'laptop' ? GPUS[s.gpu ?? 0] : GPUS[0]
  const io = s.io ?? []
  const has = (id: string) => s.extras.includes(id)

  // ---- tech locks and physical limits
  if (s.customChip && !chip.custom) err('The chosen in-house chip is not ready')
  if (s.panel > lv.display) err(`${panel.name} panel needs Display level ${s.panel}`)
  if (rf.feat && !owned.has(rf.feat)) err(`${rf.hz} Hz refresh is not researched yet`)
  if (!chip.custom && s.chipGen > lv.chipset) err(`${chip.name} needs Chipset level ${s.chipGen}`)
  if (s.charging > lv.charging) err(`${CHARGE_W[s.charging]} W charging needs Charging level ${s.charging}`)
  if (frame.level > lv.materials) err(`${frame.name} needs Materials level ${frame.level}`)
  if (back.level > lv.materials) err(`${back.name} needs Materials level ${back.level}`)
  for (const id of s.extras) {
    const ex = EXTRAS.find((e) => e.id === id)
    if (ex && !owned.has(ex.id)) err(`${ex.name} is not researched yet`)
  }
  const minBez = minBezel(type, lv.design)
  if (Math.min(b.bezelSide, b.bezelTop, b.bezelBottom) < minBez - 1e-6) err(`Bezels below ${minBez} mm need better Industrial design`)
  const minThick = minThickness(type, lv.design, s)
  if (b.thickness < minThick - 1e-6) err(gpu.thick ? `This graphics card needs a body at least ${minThick.toFixed(1)} mm thick` : `Body thinner than ${minThick.toFixed(1)} mm needs better Industrial design`)
  const maxBat = maxBattery(b, lv.battery, type)
  if (s.battery > maxBat) err(`Battery does not fit: this body holds at most ${batteryLabel(type, maxBat)}`)

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
    const inScreen = Math.abs(p.x - scr.cx) < scr.w / 2 && Math.abs(p.y - scr.cy) < scr.h / 2
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
  const stereo = has('stereo')

  // ---- the type's special score
  let special = 0
  if (T.special === 'camera') {
    const main = wide > 0 ? wide : 0.7 * Math.max(uw, tele, macro)
    special = 0.6 * main + 0.15 * uw + 0.2 * tele + 0.02 * macro + 0.08 * selfieQ
    if (!d.parts.some((p) => p.kind === 'flash' && p.face === 'back')) special *= 0.97
    if (rear.length === 0 && type === 'phone') warn('No rear camera')
    if (selfie.length === 0) warn('No front camera')
    if (!d.parts.some((p) => p.kind === 'port') && !has('wireless')) err('No charging port and no wireless charging')
    if (buttons.length === 0) warn('No buttons: there is no way to power it on')
    if (!d.parts.some((p) => p.kind === 'grille')) warn('No speaker grille')
  } else if (T.special === 'sensors') {
    for (const id of io) {
      const sn = SENSORS.find((x) => x.id === id)
      if (!sn) continue
      if (sn.level > lv.chipset) err(`${sn.name} sensor needs Chipset level ${sn.level}`)
      special += sn.value
    }
    if (io.length === 0) warn('No health sensors')
    if (io.length > 0 && !d.parts.some((p) => p.kind === 'island')) warn('Health sensors need a sensor window on the back')
    if (buttons.length === 0) warn('No crown or button')
    const strap = STRAPS.find((x) => x.id === b.strap)
    if (strap && strap.level > lv.materials) err(`${strap.name} strap needs Materials level ${strap.level}`)
  } else {
    const kb = KEYBOARDS[s.keyboard ?? 0]
    if (kb.level > lv.design) err(`${kb.name} keyboard needs Industrial design level ${kb.level}`)
    let portValue = 0
    for (const id of io) {
      const port = PORTS.find((x) => x.id === id)
      if (!port) continue
      if (port.level > lv.chipset) err(`${port.name} needs Chipset level ${port.level}`)
      portValue += port.value
    }
    if (!io.some((id) => id === 'usbc' || id === 'usbc2' || id === 'thunder')) err('A laptop needs a USB-C or Thunderlink port to charge')
    if (selfie.length === 0) warn('No webcam')
    const webcam = selfie.length ? 0.5 + 0.5 * Math.min(1, selfieQ / refScore(Math.max(0, mLevel - 2))) : 0
    const pct = 0.35 * ((s.keyboard ?? 0) / 3) + 0.3 * Math.min(1, portValue / 4.5) + 0.2 * webcam + 0.15 * (stereo ? 1 : 0.3)
    special = pct * refScore(mLevel) * 1.1
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
      if (oneIsland || oneNotch) continue
      if (rectsOverlap(p, q)) {
        overlaps++
        warn('Parts are clipping into each other', q.id)
      }
    }
  }

  // ---- raw sub-scores
  const memoryFit = T.memory > 0 ? 0.8 + 0.12 * Math.min(1, s.ram / (idealRam(mLevel) * T.memory)) + 0.08 * Math.min(1, s.storage / (idealStorage(mLevel) * T.memory)) : 0.95
  const perf = chip.perf * memoryFit * (type === 'laptop' ? 0.7 + gpu.boost : 1)
  const sizeF = diag < T.diag[0] ? 1 - Math.min(0.15, ((T.diag[0] - diag) / T.diag[0]) * 0.6) : diag <= T.diag[1] ? 1 : 0.93
  const display = panel.quality * (0.8 + rf.bonus) * sizeF
  const rfPower = s.panel >= 3 ? 1 + (rf.power - 1) / 2 : rf.power
  const drain = areaCm2 * panel.power * rfPower * 0.9 + T.drainBase + gpu.drain
  const life = (s.battery * chip.eff) / drain
  const battery = life * T.lifeScore + 12 + 3.5 * s.charging + (has('wireless') ? 4 : 0)

  // ---- design score, derived from the physical model
  const dl = clamp(mLevel, 0, 8)
  const sbr = (scr.w * scr.h) / (b.width * b.height)
  const weight = deviceWeight(d)
  const idealThick = minThickness(type, Math.round(dl), s) + T.thin[0]
  const backArea = b.width * b.height
  const islands = d.parts.filter((p) => p.kind === 'island')
  const looseCams = rear.filter((c) => !islands.some((i) => contains(i, c)))
  const bumpArea = islands.reduce((a, p) => a + p.w * p.h, 0) + looseCams.reduce((a, p) => a + p.w * p.h, 0)

  // symmetry and alignment of everything on the back
  const backParts = d.parts.filter((p) => p.face === 'back')
  let tidy = 0
  for (const p of backParts) {
    const centred = Math.abs(p.x) < 0.75
    const mirrored = backParts.some((q) => q !== p && q.kind === p.kind && Math.abs(q.x + p.x) < 0.75 && Math.abs(q.y - p.y) < 0.75)
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
  if (type === 'phone') {
    // width in the hand, reachable buttons, lateral balance of the camera mass
    const sideButtons = buttons.filter((p) => p.face === 'left' || p.face === 'right')
    const reach = sideButtons.length ? sideButtons.filter((p) => p.x > -b.height * 0.1 && p.x < b.height * 0.36).length / sideButtons.length : 0
    const camMass = rear.reduce((a, p) => a + p.w * p.h, 0)
    const camOffset = camMass ? Math.abs(rear.reduce((a, p) => a + p.x * p.w * p.h, 0) / camMass) / (b.width / 2) : 0
    ergo = 0.5 * (1 - lerp01(b.width, 78, 90)) + 0.3 * reach + 0.2 * (1 - lerp01(camOffset * (camMass / backArea), 0.03, 0.12))
  } else if (type === 'tablet') {
    ergo = 0.6 * (1 - lerp01(weight, 520, 820)) + 0.4 * (buttons.length ? 1 : 0)
  } else if (type === 'watch') {
    ergo = 0.6 * (1 - lerp01(b.height, 47, 56)) + 0.4 * (buttons.some((p) => p.crown) ? 1 : buttons.length ? 0.6 : 0)
  } else {
    ergo = 0.5 * (1 - lerp01(weight, 1500, 2800)) + 0.5 * (1 - lerp01(b.thickness, 17, 29))
  }

  const finish = b.backFinish === 'matte' && back.id === 'plastic' ? -0.05 : 0
  const materials = clamp((frame.premium + back.premium) / 2 + finish, 0, 1)
  const notchPenalty = notches.length > 0 && dl >= 1.5 ? 0.5 : 1
  const strap = STRAPS.find((x) => x.id === b.strap) ?? STRAPS[0]

  const fourth =
    type === 'watch'
      ? { key: 'strap', label: 'Strap', max: 10, score: 10 * strap.premium }
      : type === 'laptop'
        ? { key: 'deck', label: 'Keyboard deck', max: 10, score: 10 * (0.25 + 0.75 * ((s.keyboard ?? 0) / 3)) }
        : { key: 'bump', label: 'Camera housing', max: 10, score: 10 * (1 - lerp01(bumpArea / backArea, 0.14, 0.45)) }
  const breakdown = [
    { key: 'sbr', label: 'Screen-to-body', max: 28, score: 28 * lerp01(sbr, T.sbrFloor, targetSbr(type, dl)) * notchPenalty },
    { key: 'thin', label: 'Thinness', max: 12, score: 12 * (1 - lerp01(b.thickness, idealThick, idealThick + T.thin[1])) },
    { key: 'weight', label: 'Weight', max: 10, score: 10 * (1 - lerp01(weight, T.weight[0], T.weight[1])) },
    fourth,
    { key: 'sym', label: 'Symmetry and alignment', max: 15, score: 15 * symmetry },
    { key: 'ergo', label: 'Ergonomics', max: 10, score: 10 * ergo },
    { key: 'mat', label: 'Materials', max: 15, score: 15 * materials },
  ]
  const clipping = Math.min(20, overlaps * 4) + (buttons.length === 0 && type !== 'laptop' ? 5 : 0)
  if (clipping > 0) breakdown.push({ key: 'clip', label: 'Clipping penalties', max: 0, score: -clipping })
  const pct = clamp(breakdown.reduce((a, x) => a + x.score, 0), 0, 100)
  const design = (pct / 100) * refScore(dl) * 1.06

  // ---- unit cost by supply category
  const areaFactor = Math.pow((b.width * b.height) / (74 * 158), 0.6) * (type === 'watch' ? 2 : 1)
  const cost: CostParts = { semis: 0, displays: 0, memory: 0, batteries: 0, materials: 0, other: T.assembly }
  cost.semis = chip.cost * T.chipCost + gpu.cost * Math.pow(1.1, chip.gen)
  for (const p of rear) cost.semis += sensorInfo(p.sensor ?? 0).cost * LENSES[p.lens ?? 'wide'].cost
  for (const p of selfie) cost.semis += sensorInfo(p.sensor ?? 0).cost * 0.6 * (p.underDisplay ? 1.5 : 1)
  cost.displays = areaCm2 * panel.costPerCm2 * (1 + rf.bonus) * T.panelCost
  cost.memory = T.memory > 0 ? s.ram * 2.5 + s.storage * 0.08 : 4
  cost.batteries = s.battery * 0.0022 * (1 + 0.1 * lv.battery) + 1 + 0.04 * CHARGE_W[s.charging]
  cost.materials = (frame.cost + back.cost) * areaFactor + (type === 'watch' ? strap.cost : 0)
  for (const id of s.extras) cost.other += EXTRAS.find((e) => e.id === id)?.cost ?? 0
  cost.other += d.parts.filter((p) => p.kind !== 'camera').length * 0.5
  if (d.parts.some((p) => p.kind === 'fingerprint' && !isSide(p.face) && p.face === 'front')) cost.other += 4
  if (type === 'watch') for (const id of io) cost.semis += SENSORS.find((x) => x.id === id)?.cost ?? 0
  if (type === 'laptop') {
    cost.other += KEYBOARDS[s.keyboard ?? 0].cost
    for (const id of io) cost.other += PORTS.find((x) => x.id === id)?.cost ?? 0
  }
  cost.other += (d.colors?.length ?? 0) * 1.5
  const unitCost = cost.semis + cost.displays + cost.memory + cost.batteries + cost.materials + cost.other

  return {
    raw: { perf, display, camera: special, battery, design },
    report: { pct, breakdown, issues, weight, sbr, diag, maxBattery: maxBat, lifeHours: life * T.lifeHours },
    unitCost: Math.round(unitCost * 100) / 100,
    costParts: cost,
    // extras, plus a little for offering a choice of colours
    featureBonus: Math.min(0.08, s.extras.length * 0.015) + Math.min(0.03, (d.colors?.length ?? 0) * 0.01),
  }
}
