// Procedural device generation, used for AI rivals, for the player's starting
// templates, for the simple editor and for Pro/Lite style variants.
import { CHARGE_W, MATERIALS, RAM_OPTIONS, REFRESH, STORAGE_OPTIONS, idealRam, idealStorage, sensorInfo } from '../data/catalog'
import { PORTS, SENSORS, STRAPS, TIERS, TYPES, segmentInfo } from '../data/devices'
import { clampPart, screenRect } from './geometry'
import { type RngHolder, clamp, int, pick, range } from './rng'
import { maxBattery, minBezel, minThickness, selfieMinDia } from './scoring'
import type { Body, DeviceDesign, DeviceType, Lens, Levels, PlacedPart, SegmentId } from './types'

export const LAYOUT_NAMES = ['Vertical pill', 'Square island', 'Loose column', 'Centre circle', 'Full-width bar']
export type FrontStyle = 'notch' | 'punch' | 'under'
export type FingerprintStyle = 'side' | 'back' | 'display' | 'none'

/** Everything the simple editor (and the rival generator) decides about parts. */
export interface LayoutOptions {
  type: DeviceType
  layout: number
  cams: number
  sensor: number
  periscope: boolean
  front: FrontStyle
  fingerprint: FingerprintStyle
  flash: boolean
  stereo: boolean
  logo: string
  logoImage: boolean
  /** Laptop ports, used to place them on the sides. */
  io?: string[]
}

/** Places a full, tidy set of parts on a body. Deterministic. */
export function layoutParts(body: Body, o: LayoutOptions): PlacedPart[] {
  const parts: PlacedPart[] = []
  let n = 0
  const add = (p: Omit<PlacedPart, 'id'>) => parts.push(clampPart(body, { ...p, id: `k${++n}` }, o.type))
  if (o.type === 'watch') layoutWatch(body, o, add)
  else if (o.type === 'laptop') layoutLaptop(body, o, add)
  else layoutSlab(body, o, add)
  return parts
}

type Add = (p: Omit<PlacedPart, 'id'>) => void

function addLogo(o: LayoutOptions, add: Add, y: number, scale = 1) {
  if (o.logoImage) add({ kind: 'logo', face: 'back', x: 0, y, rot: 0, w: 15 * scale, h: 15 * scale, text: o.logo, useImage: true })
  else if (o.logo) add({ kind: 'logo', face: 'back', x: 0, y, rot: 0, w: Math.min(34, 5.2 * o.logo.length + 4) * scale, h: 7 * scale, text: o.logo })
}

function layoutSlab(body: Body, o: LayoutOptions, add: Add) {
  const { width, height } = body
  const tablet = o.type === 'tablet'
  const count = clamp(Math.round(o.cams), tablet ? 0 : 1, 4)
  const lensSets: Lens[][] = [[], ['wide'], ['wide', 'ultrawide'], ['wide', 'ultrawide', 'tele'], ['wide', 'ultrawide', 'tele', 'macro']]
  const lenses = [...lensSets[count]]
  if (o.periscope && count >= 3) lenses[2] = 'periscope'
  const dia = sensorInfo(o.sensor).minDia + 1.5
  const gap = 2.5
  const pad = 3
  const top = height / 2 - (tablet ? 12 : 7)
  const cam = (x: number, y: number, i: number) =>
    add({ kind: 'camera', face: 'back', x, y, rot: 0, w: i === 0 ? dia : dia - 0.5, h: i === 0 ? dia : dia - 0.5, sensor: Math.max(0, o.sensor - (i === 0 ? 0 : 1)), lens: lenses[i] })
  const flash = (x: number, y: number, size = 4) => o.flash && add({ kind: 'flash', face: 'back', x, y, rot: 0, w: size, h: size })
  const left = -width / 2 + (tablet ? 12 : 7)
  if (count > 0) {
    switch (((o.layout % 5) + 5) % 5) {
      case 0: {
        const w = dia + 2 * pad
        const h = count * dia + (count - 1) * gap + 2 * pad
        const cx = left + w / 2
        add({ kind: 'island', face: 'back', x: cx, y: top - h / 2, rot: 0, w, h, r: w / 2, finish: 'back' })
        for (let i = 0; i < count; i++) cam(cx, top - pad - dia / 2 - i * (dia + gap), i)
        flash(cx + w / 2 + 5, top - pad - dia / 2)
        break
      }
      case 1: {
        const side = 2 * dia + gap + 2 * pad
        const cx = left + side / 2
        const cy = top - side / 2
        add({ kind: 'island', face: 'back', x: cx, y: cy, rot: 0, w: side, h: side, r: 9, finish: 'back' })
        const off = (dia + gap) / 2
        const cells = [[-off, off], [-off, -off], [off, off], [off, -off]]
        for (let i = 0; i < count; i++) cam(cx + cells[i][0], cy + cells[i][1], i)
        const free = cells[Math.min(count, 3)]
        if (count < 4) flash(cx + free[0], cy + free[1], 4.5)
        else flash(cx + side / 2 + 5, cy + off)
        break
      }
      case 2: {
        const cx = left + dia / 2 + 1
        for (let i = 0; i < count; i++) cam(cx, top - dia / 2 - 2 - i * (dia + gap + 1), i)
        flash(cx + dia / 2 + 6, top - dia / 2 - 2)
        break
      }
      case 3: {
        const side = 2 * dia + gap + 2 * pad + 4
        const cy = top - side / 2 - 1
        add({ kind: 'island', face: 'back', x: 0, y: cy, rot: 0, w: side, h: side, r: side / 2, finish: 'black' })
        const off = (dia + gap) / 2
        const cells = count === 1 ? [[0, 0]] : count === 2 ? [[-off, 0], [off, 0]] : [[-off, off], [off, off], [-off, -off], [off, -off]]
        for (let i = 0; i < count; i++) cam(cells[i][0], cy + cells[i][1], i)
        flash(0, cy - side / 2 - 5)
        break
      }
      default: {
        const h = dia + 2 * pad
        const cy = top - h / 2 - 4
        add({ kind: 'island', face: 'back', x: 0, y: cy, rot: 0, w: width - (tablet ? 24 : 8), h, r: h / 2, finish: 'black' })
        const span = (count - 1) * (dia + gap)
        for (let i = 0; i < count; i++) cam(-span / 2 + i * (dia + gap) - (count < 4 ? 8 : 0), cy, i)
        if (count < 4) flash(width / 2 - (tablet ? 26 : 14), cy)
        else flash(0, cy - h / 2 - 5)
      }
    }
  }
  addLogo(o, add, tablet ? 0 : -4, tablet ? 1.5 : 1)

  // ---- front
  const scr = screenRect(body)
  const selfieLevel = Math.max(0, o.sensor - 1)
  const selfieDia = selfieMinDia(selfieLevel) + 0.4
  const selfie = { kind: 'camera' as const, face: 'front' as const, x: 0, rot: 0, w: selfieDia, h: selfieDia, sensor: selfieLevel, lens: 'wide' as const }
  if (body.bezelTop >= selfieDia + 1.6) {
    // enough bezel to hide the camera in it
    add({ ...selfie, y: height / 2 - body.bezelTop / 2 })
  } else if (o.front === 'under') {
    add({ ...selfie, y: scr.cy + scr.h / 2 - 5, underDisplay: true })
  } else if (o.front === 'punch') {
    add({ ...selfie, y: scr.cy + scr.h / 2 - 4.5 })
  } else {
    const ny = scr.cy + scr.h / 2 - 3
    add({ kind: 'notch', face: 'front', x: 0, y: ny, rot: 0, w: 26, h: 6.5, r: 3 })
    add({ ...selfie, y: ny })
  }
  if (o.fingerprint === 'display') add({ kind: 'fingerprint', face: 'front', x: 0, y: scr.cy - scr.h * 0.3, rot: 0, w: 8, h: 8 })
  else if (o.fingerprint === 'back') add({ kind: 'fingerprint', face: 'back', x: 0, y: 22, rot: 0, w: 9, h: 9 })
  else if (o.fingerprint === 'side') add({ kind: 'fingerprint', face: 'right', x: tablet ? height * 0.12 : 2, y: 0, rot: 0, w: 11, h: 2.2 })

  // ---- edges
  if (tablet) {
    add({ kind: 'button', face: 'top', x: width / 2 - 16, y: 0, rot: 0, w: 12, h: 2.2 })
    add({ kind: 'button', face: 'right', x: height / 2 - 34, y: 0, rot: 0, w: 22, h: 2.2 })
    add({ kind: 'port', face: 'bottom', x: 0, y: 0, rot: 0, w: 8.6, h: 2.8 })
    add({ kind: 'grille', face: 'bottom', x: width * 0.24, y: 0, rot: 0, w: 16, h: 1.4 })
    add({ kind: 'grille', face: 'bottom', x: -width * 0.24, y: 0, rot: 0, w: 16, h: 1.4 })
    if (o.stereo) {
      add({ kind: 'grille', face: 'top', x: width * 0.18, y: 0, rot: 0, w: 16, h: 1.4 })
      add({ kind: 'grille', face: 'top', x: -width * 0.24, y: 0, rot: 0, w: 16, h: 1.4 })
    }
    return
  }
  add({ kind: 'button', face: 'right', x: 22, y: 0, rot: 0, w: 11, h: 2.2 })
  add({ kind: 'button', face: 'right', x: 44, y: 0, rot: 0, w: 19, h: 2.2 })
  add({ kind: 'port', face: 'bottom', x: 0, y: 0, rot: 0, w: 8.6, h: 2.8 })
  add({ kind: 'grille', face: 'bottom', x: 18, y: 0, rot: 0, w: 12, h: 1.4 })
  if (o.stereo) add({ kind: 'grille', face: 'top', x: -16, y: 0, rot: 0, w: 8, h: 1.2 })
}

function layoutWatch(body: Body, o: LayoutOptions, add: Add) {
  const size = Math.min(body.width, body.height)
  const win = Math.round(size * 0.62)
  add({ kind: 'island', face: 'back', x: 0, y: 0, rot: 0, w: win, h: win, r: win / 2, finish: 'black' })
  const d = win * 0.2
  for (const [x, y] of [[d, 0], [-d, 0], [0, d], [0, -d]]) add({ kind: 'flash', face: 'back', x, y, rot: 0, w: 3, h: 3 })
  if (o.logoImage) add({ kind: 'logo', face: 'back', x: 0, y: -body.height / 2 + 5, rot: 0, w: 6, h: 6, text: o.logo, useImage: true })
  add({ kind: 'button', face: 'right', x: body.height * 0.14, y: 0, rot: 0, w: 6.5, h: 6.5, crown: true })
  add({ kind: 'button', face: 'right', x: -body.height * 0.17, y: 0, rot: 0, w: 8, h: 2.4 })
  add({ kind: 'grille', face: 'left', x: 0, y: 0, rot: 0, w: 7, h: 1.2 })
}

function layoutLaptop(body: Body, o: LayoutOptions, add: Add) {
  const scr = screenRect(body)
  const camLevel = Math.max(0, o.sensor)
  const dia = selfieMinDia(camLevel) + 0.4
  if (body.bezelTop >= dia + 1.6) {
    add({ kind: 'camera', face: 'front', x: 0, y: body.height / 2 - body.bezelTop / 2, rot: 0, w: dia, h: dia, sensor: camLevel, lens: 'wide' })
  } else {
    // thin bezels: the webcam lives in a small notch
    const ny = scr.cy + scr.h / 2 - 3
    add({ kind: 'notch', face: 'front', x: 0, y: ny, rot: 0, w: 34, h: 6.5, r: 2.5 })
    add({ kind: 'camera', face: 'front', x: 0, y: ny, rot: 0, w: dia, h: dia, sensor: camLevel, lens: 'wide' })
  }
  if (o.logoImage) add({ kind: 'logo', face: 'back', x: 0, y: 0, rot: 0, w: 36, h: 36, text: o.logo, useImage: true })
  else if (o.logo) add({ kind: 'logo', face: 'back', x: 0, y: 0, rot: 0, w: Math.min(90, 11 * o.logo.length + 8), h: 14, text: o.logo })
  // ports alternate between the sides, starting at the hinge end
  const next = { left: body.height / 2 - 34, right: body.height / 2 - 34 }
  ;(o.io ?? []).forEach((id, i) => {
    const port = PORTS.find((p) => p.id === id)
    if (!port?.size) return
    const face = i % 2 === 0 ? 'left' : 'right'
    add({ kind: 'port', face, x: next[face] - port.size[0] / 2, y: 0, rot: 0, w: port.size[0], h: port.size[1], text: id })
    next[face] -= port.size[0] + 9
  })
  if (o.stereo) {
    add({ kind: 'grille', face: 'left', x: -body.height / 2 + 46, y: 0, rot: 0, w: 30, h: 1.4 })
    add({ kind: 'grille', face: 'right', x: -body.height / 2 + 46, y: 0, rot: 0, w: 30, h: 1.4 })
  }
}

export interface GenOptions {
  segment: SegmentId
  levels: Levels
  mLevel: number
  layout: number
  palette: string[]
  logo: string
  logoImage?: boolean
}

const largestAtMost = (opts: number[], v: number) => opts.filter((o) => o <= v).pop() ?? opts[0]
const half = (v: number) => Math.round(v * 2) / 2

export function generateDesign(r: RngHolder, o: GenOptions): DeviceDesign {
  const seg = segmentInfo(o.segment)
  const type = seg.type
  const T = TYPES[type]
  const t = TIERS[o.segment]
  const L = (track: keyof Levels, drop = t.drop) => clamp(o.levels[track] - drop, 0, 8)
  const dLevel = o.levels.design

  const frac = t.size ?? [0.4, 0.4]
  const dim = (range3: [number, number, number], f: number) => half(clamp(range3[0] + (range3[1] - range3[0]) * (f + range(r, -0.08, 0.08)), range3[0], range3[1]))
  const width = type === 'phone' ? half(range(r, 70.5, 77.5)) : dim(T.width, frac[0])
  const height = type === 'phone' ? half(range(r, 150, 166)) : dim(T.height, frac[1])
  const matLevel = L('materials')
  const frames = MATERIALS.filter((m) => m.use !== 'back' && m.level <= matLevel)
  const backs = MATERIALS.filter((m) => m.use !== 'frame' && m.level <= matLevel && (type !== 'laptop' || m.id !== 'glass'))
  const byRank = <T,>(list: T[]) => list[Math.round(((list.length - 1) * t.matRank) / 2)]
  const color = pick(r, o.palette)
  const bez = Math.round(Math.max(minBezel(type, dLevel), minBezel(type, L('design')) * t.bezel) * 10) / 10
  const straps = STRAPS.filter((x) => x.level <= matLevel)

  const body: Body = {
    width,
    height,
    thickness: 0,
    corner: type === 'watch' ? (o.layout % 2 === 1 ? Math.min(width, height) / 2 : Math.round(range(r, 9, 14))) : type === 'laptop' ? Math.round(range(r, 5, 11)) : Math.round(range(r, 7, 13)),
    edge: int(r, 0, 1) === 1 ? 'flat' : 'round',
    bezelTop: type === 'laptop' ? Math.max(bez, t.matRank >= 2 ? bez : 6) : bez,
    bezelBottom: type === 'laptop' ? Math.round(bez * 22) / 10 : o.segment === 'budget' ? Math.round(bez * 13) / 10 : bez,
    bezelSide: bez,
    frameMat: byRank(frames).id,
    backMat: type === 'laptop' ? byRank(frames).id : byRank(backs).id,
    frameColor: shade(color, 0.92),
    backColor: color,
    backFinish: int(r, 0, 1) === 1 ? 'gloss' : 'matte',
  }
  if (type === 'watch') {
    body.strap = byRank(straps).id
    body.strapColor = pick(r, ['#1b1d21', '#3a3f47', '#6b5a48', '#d8d3ca', color])
  }
  if (type === 'laptop') body.backFinish = 'matte'

  const memory = T.memory || 1
  const design: DeviceDesign = {
    type,
    wallpaper: int(r, 0, 5),
    body,
    parts: [],
    specs: {
      panel: L('display', o.segment === 'gamer' || o.segment === 'l-game' ? 0 : t.drop),
      refresh: 60,
      chipGen: L('chipset', t.chipTier === 0 ? 1 : 0),
      chipTier: t.chipTier,
      ram: T.memory ? largestAtMost(RAM_OPTIONS, idealRam(o.mLevel) * memory * [0.6, 0.9, 1.4][t.chipTier] * (o.segment === 'gamer' ? 1.3 : 1)) : 2,
      storage: T.memory ? largestAtMost(STORAGE_OPTIONS, idealStorage(o.mLevel) * memory * [0.6, 1, 1.8][t.chipTier]) : 64,
      battery: 0,
      charging: clamp(L('charging'), 0, CHARGE_W.length - 1),
      extras: type === 'laptop' || type === 'tablet' ? [] : ['nfc'],
    },
  }
  const s = design.specs
  if (type === 'laptop') {
    s.gpu = t.gpu ?? 0
    s.keyboard = t.keyboard ?? 0
    s.io = PORTS.filter((p) => p.level <= o.levels.chipset).slice(0, t.io ?? 3).map((p) => p.id)
  }
  if (type === 'watch') s.io = SENSORS.filter((x) => x.level <= o.levels.chipset).slice(0, t.io ?? 3).map((x) => x.id)
  body.thickness = Math.round((minThickness(type, dLevel, s) + t.thick + range(r, 0, 0.5)) * 10) / 10
  if (type !== 'watch') s.refresh = REFRESH.filter((x) => x.level <= s.panel).pop()!.hz
  const fill = o.segment === 'gamer' || o.segment === 'business' || type === 'watch' ? 0.98 : 0.9
  s.battery = Math.round((maxBattery(body, o.levels.battery, type) * fill) / 50) * 50
  if (t.matRank >= 1) s.extras.push('stereo')
  if (o.levels.materials >= 1 && t.matRank >= 1 && type !== 'laptop') s.extras.push('ip68')
  if (o.levels.charging >= 2 && (t.matRank >= 2 || type === 'watch') && type !== 'laptop') s.extras.push('wireless')
  if (o.levels.chipset >= 4 && o.segment === 'flagship') s.extras.push('sat')

  const camLevel = L('camera', o.segment === 'camera' ? 0 : o.segment === 'gamer' || type !== 'phone' ? 2 : t.drop)
  design.parts = layoutParts(body, {
    type,
    layout: type === 'tablet' ? [0, 1, 2][o.layout % 3] : o.layout,
    cams: t.cams,
    sensor: camLevel,
    periscope: camLevel >= 3,
    front: dLevel >= 5 && o.segment === 'flagship' ? 'under' : dLevel >= 1 ? 'punch' : 'notch',
    fingerprint: type === 'tablet' ? 'side' : dLevel >= 2 && t.matRank >= 1 ? 'display' : 'side',
    flash: true,
    stereo: s.extras.includes('stereo'),
    logo: o.logo,
    logoImage: !!o.logoImage,
    io: s.io,
  })
  return design
}

// ---------------------------------------------------------------- variants

export const VARIANTS = [
  { id: 'Pro', note: 'Faster chip, more memory, the best screen and materials you own.' },
  { id: 'Lite', note: 'Cheaper chip, screen and materials; drops the extra cameras.' },
  { id: 'Max', note: 'A larger body with a bigger screen and battery.' },
  { id: 'Mini', note: 'A smaller body. Less battery, easier to hold.' },
  { id: 'Ultra', note: 'Pro and Max combined.' },
] as const
export type VariantId = (typeof VARIANTS)[number]['id']

/** A new design derived from an existing one. The player can still edit it afterwards. */
export function deriveVariant(base: DeviceDesign, variant: VariantId, levels: Levels, feats: string[]): DeviceDesign {
  const d: DeviceDesign = JSON.parse(JSON.stringify(base))
  const T = TYPES[d.type]
  const s = d.specs
  const step = (opts: number[], v: number, by: number) => opts[clamp(opts.indexOf(largestAtMost(opts, v)) + by, 0, opts.length - 1)]
  const bestRefresh = () => REFRESH.filter((x) => x.level <= s.panel && (!x.feat || feats.includes(x.feat))).pop()!.hz
  const scale = (f: number) => {
    const b = d.body
    b.width = half(clamp(b.width * f, T.width[0], T.width[1]))
    b.height = half(clamp(b.height * f, T.height[0], T.height[1]))
    for (const p of d.parts) {
      p.x *= f
      p.y *= f
    }
  }
  if (variant === 'Pro' || variant === 'Ultra') {
    if (!s.customChip) s.chipTier = Math.min(2, s.chipTier + 1)
    s.chipGen = Math.max(s.chipGen, levels.chipset)
    if (T.memory) {
      s.ram = step(RAM_OPTIONS, s.ram, 1)
      s.storage = step(STORAGE_OPTIONS, s.storage, 1)
    }
    s.panel = Math.min(levels.display, s.panel + 1)
    if (d.type !== 'watch') s.refresh = bestRefresh()
    s.charging = Math.min(levels.charging, s.charging + 1)
    const frames = MATERIALS.filter((m) => m.use !== 'back' && m.level <= levels.materials)
    const backs = MATERIALS.filter((m) => m.use !== 'frame' && m.level <= levels.materials && (d.type !== 'laptop' || m.id !== 'glass'))
    d.body.frameMat = frames[frames.length - 1].id
    d.body.backMat = d.type === 'laptop' ? d.body.frameMat : backs[backs.length - 1].id
    for (const p of d.parts) if (p.kind === 'camera' && p.face === 'back' && (p.lens ?? 'wide') === 'wide') p.sensor = levels.camera
    if (d.type === 'laptop') s.gpu = Math.min(3, (s.gpu ?? 0) + 1)
  }
  if (variant === 'Lite') {
    if (!s.customChip) s.chipTier = Math.max(0, s.chipTier - 1)
    if (T.memory) {
      s.ram = step(RAM_OPTIONS, s.ram, -1)
      s.storage = step(STORAGE_OPTIONS, s.storage, -1)
    }
    s.panel = Math.max(0, s.panel - 1)
    if (d.type !== 'watch') s.refresh = Math.min(s.refresh, 90) === 90 && feats.includes('hz90') && s.panel >= 1 ? 90 : 60
    s.charging = Math.max(0, s.charging - 1)
    s.extras = s.extras.filter((e) => e !== 'wireless' && e !== 'sat')
    d.body.frameMat = d.body.frameMat === 'plastic' ? 'plastic' : 'aluminium'
    d.body.backMat = d.type === 'laptop' ? d.body.frameMat : 'plastic'
    d.parts = d.parts.filter((p) => !(p.kind === 'camera' && p.face === 'back' && (p.lens === 'tele' || p.lens === 'periscope' || p.lens === 'macro')))
    for (const p of d.parts) if (p.kind === 'camera') p.sensor = Math.max(0, (p.sensor ?? 0) - 1)
    if (d.type === 'laptop') s.gpu = Math.max(0, (s.gpu ?? 0) - 1)
  }
  if (variant === 'Max' || variant === 'Ultra') scale(1.07)
  if (variant === 'Mini') scale(0.92)
  d.body.thickness = Math.max(d.body.thickness, minThickness(d.type, levels.design, s))
  d.parts = d.parts.map((p) => clampPart(d.body, p, d.type))
  const cap = maxBattery(d.body, levels.battery, d.type)
  s.battery = variant === 'Max' || variant === 'Ultra' ? Math.round((cap * 0.92) / 50) * 50 : Math.min(s.battery, cap)
  return d
}

/** Multiply a hex colour's brightness. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => clamp(Math.round(v * f), 0, 255)
  const out = (ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)
  return '#' + out.toString(16).padStart(6, '0')
}
