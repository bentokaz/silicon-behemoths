// Procedural device generation, used for AI rivals and for the player's
// starting template. Produces a complete DeviceDesign that renders in 3D.
import { CHARGE_W, MATERIALS, MIN_BEZEL, MIN_THICKNESS, RAM_OPTIONS, REFRESH, STORAGE_OPTIONS, idealRam, idealStorage, sensorInfo } from '../data/catalog'
import { clampPart, screenRect } from './geometry'
import { type RngHolder, clamp, int, pick, range } from './rng'
import { maxBattery, selfieMinDia } from './scoring'
import type { DeviceDesign, Lens, Levels, PlacedPart, SegmentId } from './types'

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

export interface GenOptions {
  segment: SegmentId
  levels: Levels
  mLevel: number
  layout: number
  palette: string[]
  logo: string
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

  // ---- rear cameras
  const camLevel = L('camera', o.segment === 'camera' ? 0 : o.segment === 'gamer' ? 2 : t.drop)
  const lensSets: Lens[][] = [['wide'], ['wide', 'ultrawide'], ['wide', 'ultrawide', 'tele'], ['wide', 'ultrawide', 'tele', 'macro']]
  const lenses = [...lensSets[t.cams - 1]]
  if (camLevel >= 3 && t.cams >= 3) lenses[2] = 'periscope'
  const parts: PlacedPart[] = []
  let n = 0
  const add = (p: Omit<PlacedPart, 'id'>) => parts.push(clampPart(design.body, { ...p, id: `k${++n}` }))
  const dia = sensorInfo(camLevel).minDia + 1.5
  const gap = 2.5
  const pad = 3
  const top = height / 2 - 7
  const cam = (x: number, y: number, i: number) =>
    add({ kind: 'camera', face: 'back', x, y, rot: 0, w: i === 0 ? dia : dia - 0.5, h: i === 0 ? dia : dia - 0.5, sensor: Math.max(0, camLevel - (i === 0 ? 0 : 1)), lens: lenses[i] })
  const count = lenses.length
  const left = -width / 2 + 7
  switch (o.layout % 5) {
    case 0: {
      // vertical pill, top-left
      const w = dia + 2 * pad
      const h = count * dia + (count - 1) * gap + 2 * pad
      const cx = left + w / 2
      add({ kind: 'island', face: 'back', x: cx, y: top - h / 2, rot: 0, w, h, r: w / 2, finish: 'back' })
      for (let i = 0; i < count; i++) cam(cx, top - pad - dia / 2 - i * (dia + gap), i)
      add({ kind: 'flash', face: 'back', x: cx + w / 2 + 5, y: top - pad - dia / 2, rot: 0, w: 4, h: 4 })
      break
    }
    case 1: {
      // square island with a 2x2 grid, top-left
      const side = 2 * dia + gap + 2 * pad
      const cx = left + side / 2
      const cy = top - side / 2
      add({ kind: 'island', face: 'back', x: cx, y: cy, rot: 0, w: side, h: side, r: 9, finish: 'back' })
      const off = (dia + gap) / 2
      const cells = [[-off, off], [-off, -off], [off, off], [off, -off]]
      for (let i = 0; i < count; i++) cam(cx + cells[i][0], cy + cells[i][1], i)
      const free = cells[Math.min(count, 3)]
      if (count < 4) add({ kind: 'flash', face: 'back', x: cx + free[0], y: cy + free[1], rot: 0, w: 4.5, h: 4.5 })
      else add({ kind: 'flash', face: 'back', x: cx + side / 2 + 5, y: cy + off, rot: 0, w: 4, h: 4 })
      break
    }
    case 2: {
      // loose lenses in a column, no island
      const cx = left + dia / 2 + 1
      for (let i = 0; i < count; i++) cam(cx, top - dia / 2 - 2 - i * (dia + gap + 1), i)
      add({ kind: 'flash', face: 'back', x: cx + dia / 2 + 6, y: top - dia / 2 - 2, rot: 0, w: 4, h: 4 })
      break
    }
    case 3: {
      // centred circular island
      const side = 2 * dia + gap + 2 * pad + 4
      const cy = top - side / 2 - 1
      add({ kind: 'island', face: 'back', x: 0, y: cy, rot: 0, w: side, h: side, r: side / 2, finish: 'black' })
      const off = (dia + gap) / 2
      const cells = count <= 2 ? [[-off, 0], [off, 0]] : [[-off, off], [off, off], [-off, -off], [off, -off]]
      for (let i = 0; i < count; i++) cam(cells[i][0], cy + cells[i][1], i)
      add({ kind: 'flash', face: 'back', x: 0, y: cy - side / 2 - 5, rot: 0, w: 4, h: 4 })
      break
    }
    default: {
      // full-width bar
      const h = dia + 2 * pad
      const cy = top - h / 2 - 4
      add({ kind: 'island', face: 'back', x: 0, y: cy, rot: 0, w: width - 8, h, r: h / 2, finish: 'black' })
      const span = (count - 1) * (dia + gap)
      for (let i = 0; i < count; i++) cam(-span / 2 + i * (dia + gap) - (count < 4 ? 8 : 0), cy, i)
      if (count < 4) add({ kind: 'flash', face: 'back', x: width / 2 - 14, y: cy, rot: 0, w: 4, h: 4 })
      else add({ kind: 'flash', face: 'back', x: 0, y: cy - h / 2 - 5, rot: 0, w: 4, h: 4 })
    }
  }
  add({ kind: 'logo', face: 'back', x: 0, y: -4, rot: 0, w: Math.min(34, 5.2 * o.logo.length + 4), h: 7, text: o.logo })

  // ---- front
  const scr = screenRect(design.body)
  const selfieLevel = Math.max(0, camLevel - 1)
  const selfieDia = selfieMinDia(selfieLevel) + 0.4
  if (dLevel >= 5 && o.segment === 'flagship') {
    add({ kind: 'camera', face: 'front', x: 0, y: scr.cy + scr.h / 2 - 5, rot: 0, w: selfieDia, h: selfieDia, sensor: selfieLevel, lens: 'wide', underDisplay: true })
  } else if (dLevel >= 1) {
    add({ kind: 'camera', face: 'front', x: 0, y: scr.cy + scr.h / 2 - 4.5, rot: 0, w: selfieDia, h: selfieDia, sensor: selfieLevel, lens: 'wide' })
  } else {
    const ny = scr.cy + scr.h / 2 - 3
    add({ kind: 'notch', face: 'front', x: 0, y: ny, rot: 0, w: 26, h: 6.5, r: 3 })
    add({ kind: 'camera', face: 'front', x: 0, y: ny, rot: 0, w: selfieDia, h: selfieDia, sensor: selfieLevel, lens: 'wide' })
  }
  if (dLevel >= 2 && t.matRank >= 1) add({ kind: 'fingerprint', face: 'front', x: 0, y: scr.cy - scr.h * 0.3, rot: 0, w: 8, h: 8 })
  else add({ kind: 'fingerprint', face: 'right', x: 2, y: 0, rot: 0, w: 11, h: 2.2 })

  // ---- edges
  add({ kind: 'button', face: 'right', x: 22, y: 0, rot: 0, w: 11, h: 2.2 })
  add({ kind: 'button', face: 'right', x: 44, y: 0, rot: 0, w: 19, h: 2.2 })
  add({ kind: 'port', face: 'bottom', x: 0, y: 0, rot: 0, w: 8.6, h: 2.8 })
  add({ kind: 'grille', face: 'bottom', x: 18, y: 0, rot: 0, w: 12, h: 1.4 })
  if (s.extras.includes('stereo')) add({ kind: 'grille', face: 'top', x: -16, y: 0, rot: 0, w: 8, h: 1.2 })

  design.parts = parts
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
