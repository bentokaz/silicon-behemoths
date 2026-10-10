// Turns a DeviceDesign into raw sub-scores, a design report derived from the
// physical model, and a unit cost. No randomness: same design, same result.
import {
  CHARGE_W,
  EXTRAS,
  LENSES,
  MIN_BEZEL,
  MIN_THICKNESS,
  REFRESH,
  batteryDensity,
  chipInfo,
  featuresAtLevels,
  idealRam,
  idealStorage,
  materialInfo,
  panelInfo,
  refScore,
  sensorInfo,
} from '../data/catalog'
import { contains, isSide, partExtent, rectsOverlap, screenRect } from './geometry'
import { clamp } from './rng'
import type { Body, DeviceDesign, Evaluation, Issue, Levels, PlacedPart } from './types'

/** Front cameras use smaller modules than rear ones. */
export const selfieMinDia = (sensor: number) => Math.round((3 + 0.15 * sensor) * 10) / 10

const lerp01 = (v: number, zero: number, full: number) => clamp((v - zero) / (full - zero), 0, 1)

export function maxBattery(b: Body, batteryLevel: number): number {
  const vol = (Math.max(0, b.width - 6) * Math.max(0, b.height - 30) * Math.max(0, b.thickness - 3.6)) / 1000
  return Math.floor((vol * 0.42 * batteryDensity(batteryLevel)) / 50) * 50
}

/** Screen-to-body ratio a top design at this level is expected to reach. */
function targetSbr(level: number): number {
  const m = MIN_BEZEL[clamp(Math.round(level), 0, 8)]
  return ((74 - 2 * m) * (158 - 2 * m)) / (74 * 158) - 0.01
}

export function deviceWeight(d: DeviceDesign): number {
  const b = d.body
  const frame = materialInfo(b.frameMat)
  const back = materialInfo(b.backMat)
  const volume = (b.width * b.height * b.thickness) / 1000
  const frameVol = (2 * (b.width + b.height) * b.thickness * 1.5) / 1000
  const plateVol = (b.width * b.height * 0.7) / 1000
  return d.specs.battery * 0.011 + frameVol * frame.density + plateVol * back.density + plateVol * 2.5 + volume * 0.55
}

/**
 * feats = researched branch features. Leave it out for a company that owns
 * everything up to its levels (rivals).
 */
export function evaluate(d: DeviceDesign, lv: Levels, mLevel: number, feats?: string[]): Evaluation {
  const owned = new Set(feats ?? featuresAtLevels(lv))
  const b = d.body
  const s = d.specs
  const issues: Issue[] = []
  const err = (text: string, partId?: string) => issues.push({ level: 'error', text, partId })
  const warn = (text: string, partId?: string) => issues.push({ level: 'warn', text, partId })

  const scr = screenRect(b)
  const areaCm2 = (scr.w * scr.h) / 100
  const diag = Math.hypot(scr.w, scr.h) / 25.4
  const panel = panelInfo(s.panel)
  const rf = REFRESH.find((r) => r.hz === s.refresh) ?? REFRESH[0]
  const chip = chipInfo(s.chipGen, s.chipTier)
  const frame = materialInfo(b.frameMat)
  const back = materialInfo(b.backMat)
  const has = (id: string) => s.extras.includes(id)

  // ---- tech locks and physical limits
  if (s.panel > lv.display) err(`${panel.name} panel needs Display level ${s.panel}`)
  if (rf.feat && !owned.has(rf.feat)) err(`${rf.hz} Hz refresh is not researched yet`)
  if (s.chipGen > lv.chipset) err(`${chip.name} needs Chipset level ${s.chipGen}`)
  if (s.charging > lv.charging) err(`${CHARGE_W[s.charging]} W charging needs Charging level ${s.charging}`)
  if (frame.level > lv.materials) err(`${frame.name} needs Materials level ${frame.level}`)
  if (back.level > lv.materials) err(`${back.name} needs Materials level ${back.level}`)
  for (const id of s.extras) {
    const ex = EXTRAS.find((e) => e.id === id)
    if (ex && !owned.has(ex.id)) err(`${ex.name} is not researched yet`)
  }
  const minBez = MIN_BEZEL[lv.design]
  if (Math.min(b.bezelSide, b.bezelTop, b.bezelBottom) < minBez - 1e-6) err(`Bezels below ${minBez} mm need better Industrial design`)
  const minThick = MIN_THICKNESS[lv.design]
  if (b.thickness < minThick - 1e-6) err(`Body thinner than ${minThick} mm needs better Industrial design`)
  const maxBat = maxBattery(b, lv.battery)
  if (s.battery > maxBat) err(`Battery does not fit: this body holds at most ${maxBat} mAh`)

  // ---- parts
  const rear = d.parts.filter((p) => p.kind === 'camera' && p.face === 'back')
  const selfie = d.parts.filter((p) => p.kind === 'camera' && p.face === 'front')
  const notches = d.parts.filter((p) => p.kind === 'notch')
  const camQ = (p: PlacedPart) => {
    const sn = sensorInfo(p.sensor ?? 0)
    if ((p.sensor ?? 0) > lv.camera) err(`${sn.name} sensor needs Camera level ${p.sensor}`, p.id)
    if (p.lens === 'periscope' && !owned.has('periscope')) err('The periscope lens is not researched yet', p.id)
    const dia = Math.min(p.w, p.h)
    const minDia = p.face === 'front' ? selfieMinDia(p.sensor ?? 0) : sn.minDia
    if (dia < minDia - 0.05) warn(`Lens is too small for the ${sn.name} sensor (needs ${minDia} mm)`, p.id)
    return sn.quality * clamp(dia / minDia, 0.4, 1)
  }
  const best = (list: PlacedPart[]) => list.reduce((m, p) => Math.max(m, camQ(p)), 0)
  const wide = best(rear.filter((p) => (p.lens ?? 'wide') === 'wide'))
  const uw = best(rear.filter((p) => p.lens === 'ultrawide'))
  const tele = Math.max(best(rear.filter((p) => p.lens === 'tele')), best(rear.filter((p) => p.lens === 'periscope')) * 1.12)
  const macro = best(rear.filter((p) => p.lens === 'macro'))
  const selfieQ = best(selfie)
  const main = wide > 0 ? wide : 0.7 * Math.max(uw, tele, macro)
  let camera = 0.6 * main + 0.15 * uw + 0.2 * tele + 0.02 * macro + 0.08 * selfieQ
  if (!d.parts.some((p) => p.kind === 'flash' && p.face === 'back')) camera *= 0.97
  if (rear.length === 0) warn('No rear camera')
  if (selfie.length === 0) warn('No front camera')

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
  const ports = d.parts.filter((p) => p.kind === 'port')
  if (ports.length === 0 && !has('wireless')) err('No charging port and no wireless charging')
  const buttons = d.parts.filter((p) => p.kind === 'button')
  if (buttons.length === 0) warn('No buttons: there is no way to power it on')
  if (!d.parts.some((p) => p.kind === 'grille')) warn('No speaker grille')

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
  const perf = chip.perf * (0.8 + 0.12 * Math.min(1, s.ram / idealRam(mLevel)) + 0.08 * Math.min(1, s.storage / idealStorage(mLevel)))
  const sizeF = diag < 5.4 ? 0.88 : diag < 6 ? 0.95 : diag <= 7.1 ? 1 : 0.93
  const display = panel.quality * (0.8 + rf.bonus) * sizeF
  const rfPower = s.panel >= 3 ? 1 + (rf.power - 1) / 2 : rf.power
  const drain = areaCm2 * panel.power * rfPower * 0.9 + 12
  const life = (s.battery * chip.eff) / drain
  const battery = life * 0.9 + 12 + 3.5 * s.charging + (has('wireless') ? 4 : 0)

  // ---- design score, derived from the physical model
  const dl = clamp(mLevel, 0, 8)
  const sbr = (scr.w * scr.h) / (b.width * b.height)
  const weight = deviceWeight(d)
  const idealThick = MIN_THICKNESS[Math.round(dl)] + 1.2
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
    if (p.kind === 'island') {
      const inside = rear.filter((c) => contains(p, c))
      const cx = inside.reduce((a, c) => a + c.x, 0) / (inside.length || 1)
      const cy = inside.reduce((a, c) => a + c.y, 0) / (inside.length || 1)
      const balanced = inside.length > 0 && Math.abs(cx - p.x) < 1.2 && Math.abs(cy - p.y) < p.h * 0.2
      if (centred || mirrored || balanced) tidy++
    } else if (centred || mirrored || aligned) tidy++
  }
  const symmetry = backParts.length ? tidy / backParts.length : 0.5

  // ergonomics: width in the hand, reachable buttons, lateral balance of the camera mass
  const sideButtons = buttons.filter((p) => p.face === 'left' || p.face === 'right')
  const reach = sideButtons.length ? sideButtons.filter((p) => p.x > -b.height * 0.1 && p.x < b.height * 0.36).length / sideButtons.length : 0
  const camMass = rear.reduce((a, p) => a + p.w * p.h, 0)
  const camOffset = camMass ? Math.abs(rear.reduce((a, p) => a + p.x * p.w * p.h, 0) / camMass) / (b.width / 2) : 0
  const ergo = 0.5 * (1 - lerp01(b.width, 78, 90)) + 0.3 * reach + 0.2 * (1 - lerp01(camOffset * (camMass / backArea), 0.03, 0.12))

  const finish = b.backFinish === 'matte' && back.id === 'plastic' ? -0.05 : 0
  const materials = clamp((frame.premium + back.premium) / 2 + finish, 0, 1)
  const notchPenalty = notches.length > 0 && dl >= 1.5 ? 0.5 : 1

  const breakdown = [
    { key: 'sbr', label: 'Screen-to-body', max: 28, score: 28 * lerp01(sbr, 0.65, targetSbr(dl)) * notchPenalty },
    { key: 'thin', label: 'Thinness', max: 12, score: 12 * (1 - lerp01(b.thickness, idealThick, idealThick + 4.5)) },
    { key: 'weight', label: 'Weight', max: 10, score: 10 * (1 - lerp01(weight, 190, 265)) },
    { key: 'bump', label: 'Camera housing', max: 10, score: 10 * (1 - lerp01(bumpArea / backArea, 0.14, 0.45)) },
    { key: 'sym', label: 'Symmetry and alignment', max: 15, score: 15 * symmetry },
    { key: 'ergo', label: 'Ergonomics', max: 10, score: 10 * ergo },
    { key: 'mat', label: 'Materials', max: 15, score: 15 * materials },
  ]
  const clipping = Math.min(20, overlaps * 4) + (buttons.length === 0 ? 5 : 0)
  if (clipping > 0) breakdown.push({ key: 'clip', label: 'Clipping penalties', max: 0, score: -clipping })
  const pct = clamp(breakdown.reduce((a, x) => a + x.score, 0), 0, 100)
  const design = (pct / 100) * refScore(dl) * 1.06

  // ---- unit cost
  let unitCost = 12 + chip.cost + s.ram * 2.5 + s.storage * 0.08 + areaCm2 * panel.costPerCm2 * (1 + rf.bonus)
  unitCost += s.battery * 0.0022 * (1 + 0.1 * lv.battery) + 1 + 0.04 * CHARGE_W[s.charging]
  unitCost += frame.cost + back.cost
  for (const p of rear) unitCost += sensorInfo(p.sensor ?? 0).cost * LENSES[p.lens ?? 'wide'].cost
  for (const p of selfie) unitCost += sensorInfo(p.sensor ?? 0).cost * 0.6 * (p.underDisplay ? 1.5 : 1)
  for (const id of s.extras) unitCost += EXTRAS.find((e) => e.id === id)?.cost ?? 0
  unitCost += d.parts.filter((p) => p.kind !== 'camera').length * 0.5
  if (d.parts.some((p) => p.kind === 'fingerprint' && !isSide(p.face) && p.face === 'front')) unitCost += 4

  return {
    raw: { perf, display, camera, battery, design },
    report: { pct, breakdown, issues, weight, sbr, diag, maxBattery: maxBat, lifeHours: life * 0.3 },
    unitCost: Math.round(unitCost * 100) / 100,
    featureBonus: Math.min(0.08, s.extras.length * 0.015),
  }
}

export { partExtent }
