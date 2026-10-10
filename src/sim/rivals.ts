// Procedural device generation, used for AI rivals, for the player's starting
// template and for the simple editor. Produces designs that render in 3D.
import { CHARGE_W, MATERIALS, MIN_BEZEL, MIN_THICKNESS, RAM_OPTIONS, REFRESH, STORAGE_OPTIONS, idealRam, idealStorage, sensorInfo } from '../data/catalog'
import { clampPart, screenRect } from './geometry'
import { type RngHolder, clamp, int, pick, range } from './rng'
import { maxBattery, selfieMinDia } from './scoring'
import type { Body, DeviceDesign, Lens, Levels, PlacedPart, SegmentId } from './types'

interface Tier {
  drop: number
  chipTier: number
  cams: number
  thick: number
  bezel: number
  matRank: number
}
const TIERS: Record<SegmentId, Tier> = {
  budget: { drop: 2, chipTier: 0, cams: 2, thick: 1.6, bezel: 2.2, matRank: 0 },
  mainstream: { drop: 1, chipTier: 1, cams: 3, thick: 1.0, bezel: 1.5, matRank: 1 },
  flagship: { drop: 0, chipTier: 2, cams: 3, thick: 0.7, bezel: 1.05, matRank: 2 },
  gamer: { drop: 1, chipTier: 2, cams: 2, thick: 2.2, bezel: 1.4, matRank: 1 },
  business: { drop: 1, chipTier: 1, cams: 2, thick: 1.4, bezel: 1.5, matRank: 2 },
  camera: { drop: 1, chipTier: 1, cams: 4, thick: 1.3, bezel: 1.2, matRank: 2 },
}

export const LAYOUT_NAMES = ['Vertical pill', 'Square island', 'Loose column', 'Centre circle', 'Full-width bar']
export type FrontStyle = 'notch' | 'punch' | 'under'
export type FingerprintStyle = 'side' | 'back' | 'display' | 'none'

/** Everything the simple editor (and the rival generator) decides about parts. */
export interface LayoutOptions {
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
}

/** Places a full, tidy set of parts on a body. Deterministic. */
export function layoutParts(body: Body, o: LayoutOptions): PlacedPart[] {
  const { width, height } = body
  const count = clamp(Math.round(o.cams), 1, 4)
  const lensSets: Lens[][] = [['wide'], ['wide', 'ultrawide'], ['wide', 'ultrawide', 'tele'], ['wide', 'ultrawide', 'tele', 'macro']]
  const lenses = [...lensSets[count - 1]]
  if (o.periscope && count >= 3) lenses[2] = 'periscope'
  const parts: PlacedPart[] = []
  let n = 0
  const add = (p: Omit<PlacedPart, 'id'>) => parts.push(clampPart(body, { ...p, id: `k${++n}` }))
  const dia = sensorInfo(o.sensor).minDia + 1.5
  const gap = 2.5
  const pad = 3
  const top = height / 2 - 7
  const cam = (x: number, y: number, i: number) =>
    add({ kind: 'camera', face: 'back', x, y, rot: 0, w: i === 0 ? dia : dia - 0.5, h: i === 0 ? dia : dia - 0.5, sensor: Math.max(0, o.sensor - (i === 0 ? 0 : 1)), lens: lenses[i] })
  const flash = (x: number, y: number, size = 4) => o.flash && add({ kind: 'flash', face: 'back', x, y, rot: 0, w: size, h: size })
  const left = -width / 2 + 7
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
      add({ kind: 'island', face: 'back', x: 0, y: cy, rot: 0, w: width - 8, h, r: h / 2, finish: 'black' })
      const span = (count - 1) * (dia + gap)
      for (let i = 0; i < count; i++) cam(-span / 2 + i * (dia + gap) - (count < 4 ? 8 : 0), cy, i)
      if (count < 4) flash(width / 2 - 14, cy)
      else flash(0, cy - h / 2 - 5)
    }
  }
  if (o.logoImage) add({ kind: 'logo', face: 'back', x: 0, y: -4, rot: 0, w: 15, h: 15, text: o.logo, useImage: true })
  else if (o.logo) add({ kind: 'logo', face: 'back', x: 0, y: -4, rot: 0, w: Math.min(34, 5.2 * o.logo.length + 4), h: 7, text: o.logo })

  // ---- front
  const scr = screenRect(body)
  const selfieLevel = Math.max(0, o.sensor - 1)
  const selfieDia = selfieMinDia(selfieLevel) + 0.4
  if (o.front === 'under') {
    add({ kind: 'camera', face: 'front', x: 0, y: scr.cy + scr.h / 2 - 5, rot: 0, w: selfieDia, h: selfieDia, sensor: selfieLevel, lens: 'wide', underDisplay: true })
  } else if (o.front === 'punch') {
    add({ kind: 'camera', face: 'front', x: 0, y: scr.cy + scr.h / 2 - 4.5, rot: 0, w: selfieDia, h: selfieDia, sensor: selfieLevel, lens: 'wide' })
  } else {
    const ny = scr.cy + scr.h / 2 - 3
    add({ kind: 'notch', face: 'front', x: 0, y: ny, rot: 0, w: 26, h: 6.5, r: 3 })
    add({ kind: 'camera', face: 'front', x: 0, y: ny, rot: 0, w: selfieDia, h: selfieDia, sensor: selfieLevel, lens: 'wide' })
  }
  if (o.fingerprint === 'display') add({ kind: 'fingerprint', face: 'front', x: 0, y: scr.cy - scr.h * 0.3, rot: 0, w: 8, h: 8 })
  else if (o.fingerprint === 'back') add({ kind: 'fingerprint', face: 'back', x: 0, y: 22, rot: 0, w: 9, h: 9 })
  else if (o.fingerprint === 'side') add({ kind: 'fingerprint', face: 'right', x: 2, y: 0, rot: 0, w: 11, h: 2.2 })

  // ---- edges
  add({ kind: 'button', face: 'right', x: 22, y: 0, rot: 0, w: 11, h: 2.2 })
  add({ kind: 'button', face: 'right', x: 44, y: 0, rot: 0, w: 19, h: 2.2 })
  add({ kind: 'port', face: 'bottom', x: 0, y: 0, rot: 0, w: 8.6, h: 2.8 })
  add({ kind: 'grille', face: 'bottom', x: 18, y: 0, rot: 0, w: 12, h: 1.4 })
  if (o.stereo) add({ kind: 'grille', face: 'top', x: -16, y: 0, rot: 0, w: 8, h: 1.2 })
  return parts
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

export function generateDesign(r: RngHolder, o: GenOptions): DeviceDesign {
  const t = TIERS[o.segment]
  const L = (track: keyof Levels, drop = t.drop) => clamp(o.levels[track] - drop, 0, 8)
  const dLevel = o.levels.design

  const width = Math.round(range(r, 70.5, 77.5) * 2) / 2
  const height = Math.round(range(r, 150, 166) * 2) / 2
  const thickness = Math.round((MIN_THICKNESS[dLevel] + t.thick + range(r, 0, 0.5)) * 10) / 10
  const bez = Math.round(Math.max(MIN_BEZEL[dLevel], MIN_BEZEL[L('design')] * t.bezel) * 10) / 10
  const matLevel = L('materials')
  const frames = MATERIALS.filter((m) => m.use !== 'back' && m.level <= matLevel)
  const backs = MATERIALS.filter((m) => m.use !== 'frame' && m.level <= matLevel)
  const byRank = <T,>(list: T[]) => list[Math.round(((list.length - 1) * t.matRank) / 2)]
  const color = pick(r, o.palette)

  const design: DeviceDesign = {
    type: 'phone',
    wallpaper: int(r, 0, 5),
    body: {
      width,
      height,
      thickness,
      corner: Math.round(range(r, 7, 13)),
      edge: rand2(r) ? 'flat' : 'round',
      bezelTop: bez,
      bezelBottom: o.segment === 'budget' ? Math.round(bez * 13) / 10 : bez,
      bezelSide: bez,
      frameMat: byRank(frames).id,
      backMat: byRank(backs).id,
      frameColor: shade(color, 0.92),
      backColor: color,
      backFinish: rand2(r) ? 'gloss' : 'matte',
    },
    parts: [],
    specs: {
      panel: L('display', o.segment === 'gamer' ? 0 : t.drop),
      refresh: 60,
      chipGen: L('chipset', o.segment === 'budget' ? 1 : 0),
      chipTier: t.chipTier,
      ram: largestAtMost(RAM_OPTIONS, idealRam(o.mLevel) * [0.6, 0.9, 1.4][t.chipTier] * (o.segment === 'gamer' ? 1.3 : 1)),
      storage: largestAtMost(STORAGE_OPTIONS, idealStorage(o.mLevel) * [0.6, 1, 1.8][t.chipTier]),
      battery: 0,
      charging: clamp(L('charging'), 0, CHARGE_W.length - 1),
      extras: ['nfc'],
    },
  }
  const s = design.specs
  s.refresh = REFRESH.filter((x) => x.level <= s.panel).pop()!.hz
  s.battery = Math.round((maxBattery(design.body, o.levels.battery) * (o.segment === 'gamer' || o.segment === 'business' ? 0.98 : 0.9)) / 50) * 50
  if (t.matRank >= 1) s.extras.push('stereo')
  if (o.levels.materials >= 1 && t.matRank >= 1) s.extras.push('ip68')
  if (o.levels.charging >= 2 && t.matRank >= 2) s.extras.push('wireless')
  if (o.levels.chipset >= 4 && o.segment === 'flagship') s.extras.push('sat')

  const camLevel = L('camera', o.segment === 'camera' ? 0 : o.segment === 'gamer' ? 2 : t.drop)
  design.parts = layoutParts(design.body, {
    layout: o.layout,
    cams: t.cams,
    sensor: camLevel,
    periscope: camLevel >= 3,
    front: dLevel >= 5 && o.segment === 'flagship' ? 'under' : dLevel >= 1 ? 'punch' : 'notch',
    fingerprint: dLevel >= 2 && t.matRank >= 1 ? 'display' : 'side',
    flash: true,
    stereo: s.extras.includes('stereo'),
    logo: o.logo,
    logoImage: !!o.logoImage,
  })
  return design
}

const rand2 = (r: RngHolder) => int(r, 0, 1) === 1

/** Multiply a hex colour's brightness. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => clamp(Math.round(v * f), 0, 255)
  const out = (ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)
  return '#' + out.toString(16).padStart(6, '0')
}
