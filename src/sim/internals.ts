// What is inside a device, worked out from its design alone: where the battery,
// the boards, the chips, the camera modules, the cooling and everything else
// sit, as boxes in the coordinates of the body. The 3D teardown view draws
// these and nothing else, so every choice under Internals shows up here first.
// Pure: same design, same layout.
import { EXTRAS, LENSES, sensorInfo } from '../data/catalog'
import { GPU_LENGTH, PC_COOLERS, PSUS, caseOf, maxFans, rgbOf, rgbOn, towerForm } from '../data/devices'
import { ANC, COOLERS, coolersFor, DRIVERS, GPUS, HINGES, MIC_ARRAYS, OPTICS, SPEAKERS, SPEAKER_DRIVERS, TYPES, headStrap, inputOptions, ioInfo, standInfo } from '../data/devices'
import { HINGE_CLEAR, carrierBody, caseShape, consoleFans, droneShape, edgeBevel, faceBasis, faceSink, handheldControls, headsetEyes, isCoverCam, isFlip, laptopDeck, laptopSplit, mountOf, ringShape, screenRect, selfieScreen, speakerShape, standMount, visorShape } from './geometry'
import { clamp } from './rng'
import { type ChipSpec, type WeightKey, batteryLabel, chargeWatts, chipFor, maxBattery, minThickness, panelName, weightParts } from './scoring'
import type { Body, CustomChip, DeviceDesign, DeviceType, Evaluation, Levels, PlacedPart, Specs } from './types'

export type V3 = [number, number, number]
/** An axis-aligned box: centre and size along X, Y and Z of the solid it belongs to. */
export interface Box {
  c: V3
  s: V3
}
type Ax = 0 | 1 | 2
/** A signed body axis: 1, 2, 3 for +X, +Y, +Z and the negatives for the other way. */
export type Dir = 1 | 2 | 3 | -1 | -2 | -3

export type CompKind =
  | 'battery' | 'board' | 'chip' | 'mem' | 'shield' | 'sheet' | 'pipe' | 'fan' | 'heatsink' | 'pump' | 'camera' | 'led' | 'coil' | 'speaker' | 'motor' | 'port' | 'flex' | 'tray' | 'antenna'
  | 'display' | 'plate' | 'stick' | 'card' | 'psu' | 'drive' | 'hinge' | 'sensor' | 'driver' | 'radiator' | 'mic' | 'lens' | 'control' | 'cable' | 'well'
  | 'baffle' | 'wadding' | 'duct' | 'amp' | 'ledring' | 'touch'
  /** A special feature drawn as the part it really is (see FEATURE_MODELS): `model` says which. */
  | 'feature'

/** What a component rides on when the device opens: the body itself, the cover that comes off, or the screen. */
export type Host = 'tray' | 'cover' | 'screen'

export interface Comp {
  id: string
  kind: CompKind
  /** Which cavity it lives in (see Zone). */
  zone: string
  host: Host
  box: Box
  /** Its own axes as body directions: across, along, and up out of the opening. */
  ax: [Dir, Dir, Dir]
  /** False where the design asks for more than the body has room for, as evaluate() reports. */
  fits: boolean
  /** How far up the stack it sits, 0 to 4: layers move apart in the exploded view. */
  layer: number
  /** Comes out the other way in the exploded view, by this many steps: the optics of a headset leave towards the face. */
  back?: number
  /** Rows of the Internals panel this stands for: 'battery', 'chip', 'io:usbc', 'extra:wireless'... */
  specs: string[]
  /** The placed part it sits under, for camera modules and sockets. */
  partId?: string
  label: string
  figure?: string
  /** Where its size or count comes from, when no row of the Internals panel sets it directly. */
  note?: string
  /** A variant within the kind: a tier, a style. */
  v?: number
  /** How many of something it holds: fans on a card, microphones in a ring. */
  n?: number
  /** Printed or etched on it. */
  text?: string
  /** Sits on or around other components by nature (a shield can, a ribbon, a pipe), so it may share their space. */
  over?: boolean
  /** Further boxes of the same component: the foot of an L-shaped cell. */
  more?: Box[]
  /** The parts of it that have nowhere to go, when it does not fit. */
  clash?: Box[]
  /** Centre line of a cable, a pipe or a ribbon, in body coordinates. */
  path?: V3[]
  /** Which of its own axes a round component turns about: 0 across, 1 along, 2 up. */
  axis?: 0 | 1 | 2
  /** Features only: which part it is drawn as, e.g. 'sat', 'face', 'gasket'. */
  model?: string
  /** What it is for, said when the pointer is over it. */
  about?: string
  /** The colour its RGB lighting glows, when it has some and it is lit. */
  glow?: string
}

/** The models a feature can be drawn as, and what each one is. */
export const FEATURE_MODELS: Record<string, string> = {
  sat: 'A ceramic patch aerial that sees the sky, and the radio module that talks to satellites in orbit.',
  nfc: 'A flat coil of copper on a ferrite sheet: the reader at a till powers it from a few centimetres away.',
  wireless: 'Litz wire wound flat on a ferrite disc, with the magnets that line the charger up.',
  uwb: 'Three small aerials a set distance apart: the time a pulse takes to reach each one gives the direction to a tag.',
  stylus: 'A pen in its silo, pushed out by a spring catch and charged in place.',
  ir: 'An infrared lamp behind a dark window in the top edge: it speaks the codes of TV and air-conditioner remotes.',
  stereo: 'A second speaker at the top, in its own sealed box behind the earpiece grille, for sound left and right.',
  haptics: 'A linear motor: a mass on springs driven back and forth for crisp, short taps.',
  face: 'A dot projector throws thirty thousand points of infrared on the face; the infrared camera reads their shape, the flood lamp lights it in the dark.',
  gasket: 'Adhesive seals round the back and the screen, and rubber rings in every opening, that keep water out.',
  mmwave: 'A strip of tiny aerials steered together as one beam, with its own radio, for millimetre-wave 5G.',
  esim: 'A SIM soldered to the board, programmed over the air.',
}

/** A space inside the device that components are packed into. */
export interface Zone {
  id: string
  /** The solid whose coordinates it uses: the body, a laptop's base, the loose earbud, a headset's battery pack. */
  anchor: 'body' | 'base' | 'bud' | 'pack'
  box: Box
  /** Direction the opening faces. */
  up: Dir
  /** Where the solid is cut to open it: everything beyond `at` along `axis`, on `side`, lifts off. */
  cut?: { axis: Ax; at: number; side: 1 | -1 }
  /** Thickness of the walls around it. */
  wall: number
}

export interface Internals {
  type: DeviceType
  zones: Zone[]
  comps: Comp[]
  /** Battery capacity as a share of what the body holds; above 1 it does not fit. */
  fraction: number
}

// ---------------------------------------------------------------- rectangles on a plane

interface R {
  u0: number
  v0: number
  u1: number
  v1: number
}
const R4 = (cu: number, cv: number, su: number, sv: number): R => ({ u0: cu - su / 2, v0: cv - sv / 2, u1: cu + su / 2, v1: cv + sv / 2 })
const rw = (r: R) => r.u1 - r.u0
const rh = (r: R) => r.v1 - r.v0
const ra = (r: R) => Math.max(0, rw(r)) * Math.max(0, rh(r))
const mid = (r: R): [number, number] => [(r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2]
const hit = (a: R, b: R, pad = 0) => a.u0 < b.u1 + pad && b.u0 < a.u1 + pad && a.v0 < b.v1 + pad && b.v0 < a.v1 + pad
const grow = (r: R, m: number): R => ({ u0: r.u0 - m, v0: r.v0 - m, u1: r.u1 + m, v1: r.v1 + m })
const cut = (r: R, a: R): R => ({ u0: Math.max(r.u0, a.u0), v0: Math.max(r.v0, a.v0), u1: Math.min(r.u1, a.u1), v1: Math.min(r.v1, a.v1) })
/** Slide a rectangle back inside another, shrinking it if it is too big. */
function keep(r: R, a: R): R {
  const w = Math.max(0.1, Math.min(rw(r), rw(a)))
  const h = Math.max(0.1, Math.min(rh(r), rh(a)))
  return R4(clamp((r.u0 + r.u1) / 2, a.u0 + w / 2, a.u1 - w / 2), clamp((r.v0 + r.v1) / 2, a.v0 + h / 2, a.v1 - h / 2), w, h)
}
/** Trim a rectangle to what lies inside another; if nothing does, slide it in instead. */
function trim(r: R, a: R): R {
  const c = cut(r, a)
  return rw(c) > 0.8 && rh(c) > 0.8 ? c : keep(r, a)
}
const join = (list: R[]): R | null => (list.length ? { u0: Math.min(...list.map((r) => r.u0)), v0: Math.min(...list.map((r) => r.v0)), u1: Math.max(...list.map((r) => r.u1)), v1: Math.max(...list.map((r) => r.v1)) } : null)

/** A plane inside a solid: where its origin is, and which way across, along and up point. */
class Frame {
  readonly ax: [Dir, Dir, Dir]
  constructor(readonly o: V3, u: Dir, v: Dir, w: Dir) {
    this.ax = [u, v, w]
  }
  box(r: R, w0: number, sw: number): Box {
    const c: V3 = [this.o[0], this.o[1], this.o[2]]
    const s: V3 = [0, 0, 0]
    const put = (d: Dir, centre: number, size: number) => {
      const i = Math.abs(d) - 1
      c[i] += Math.sign(d) * centre
      s[i] = Math.max(0.05, size)
    }
    put(this.ax[0], (r.u0 + r.u1) / 2, r.u1 - r.u0)
    put(this.ax[1], (r.v0 + r.v1) / 2, r.v1 - r.v0)
    put(this.ax[2], w0 + sw / 2, sw)
    return { c, s }
  }
  /** A point of the solid in plane coordinates: across, along, up. */
  at(p: V3): [number, number, number] {
    const get = (d: Dir) => (p[Math.abs(d) - 1] - this.o[Math.abs(d) - 1]) * Math.sign(d)
    return [get(this.ax[0]), get(this.ax[1]), get(this.ax[2])]
  }
  /** The other way: a point of the plane in the coordinates of the solid. */
  point(u: number, v: number, w: number): V3 {
    return this.box(R4(u, v, 0, 0), w, 0).c
  }
}

/** One cavity being filled: what has gone in, and what floor space is taken. */
class Lay {
  taken: R[] = []
  constructor(readonly out: Comp[], readonly zone: string, readonly f: Frame, readonly area: R, readonly depth: number) {}
  /** The same cavity with a clean floor: for a second tier of components above the first. */
  tier(): Lay {
    return new Lay(this.out, this.zone, this.f, this.area, this.depth)
  }
  add(id: string, kind: CompKind, r: R, w0: number, sw: number, o: Partial<Comp> = {}, solid = true): Comp {
    const c: Comp = { id, kind, zone: this.zone, host: 'tray', box: this.f.box(r, w0, sw), ax: this.f.ax, fits: true, layer: clamp(Math.floor((4 * (w0 + sw / 2)) / Math.max(this.depth, 0.01)), 0, 3), specs: [], label: '', ...o }
    this.out.push(c)
    if (solid) this.taken.push(r)
    return c
  }
  /** A free spot for something su by sv inside a region, as near the anchor (0..1 across and along) as it can be. Shrinks it if it must. */
  fit(region: R, su: number, sv: number, anchor: [number, number] = [0.5, 0.5], obstacles: R[] = this.taken, pad = 0.6): R | null {
    const reg = cut(region, this.area)
    const N = 12
    for (let n = 0; n < 6; n++) {
      const w = su * Math.pow(0.86, n)
      const h = sv * Math.pow(0.86, n)
      if (w > rw(reg) || h > rh(reg) || w <= 0 || h <= 0) continue
      let best: R | null = null
      let bd = Infinity
      for (let i = 0; i <= N; i++) {
        for (let j = 0; j <= N; j++) {
          const dd = (i / N - anchor[0]) ** 2 + (j / N - anchor[1]) ** 2
          if (dd >= bd) continue
          const r = R4(reg.u0 + w / 2 + ((rw(reg) - w) * i) / N, reg.v0 + h / 2 + ((rh(reg) - h) * j) / N, w, h)
          if (obstacles.some((o) => hit(o, r, pad))) continue
          best = r
          bd = dd
        }
      }
      if (best) return best
    }
    return null
  }
  /** The largest empty rectangle left in a region. */
  largest(region: R, obstacles: R[] = this.taken, pad = 0.8, minSide = 2.5): R | null {
    const reg = cut(region, this.area)
    if (rw(reg) < minSide || rh(reg) < minSide) return null
    const obs = obstacles.map((o) => grow(o, pad)).filter((o) => hit(o, reg))
    const edges = (lo: number, hi: number, list: number[]) => [...new Set([lo, hi, ...list.filter((x) => x > lo && x < hi)])].sort((a, b) => a - b)
    const us = edges(reg.u0, reg.u1, obs.flatMap((o) => [o.u0, o.u1]))
    const vs = edges(reg.v0, reg.v1, obs.flatMap((o) => [o.v0, o.v1]))
    let best: R | null = null
    let bestA = 0
    for (let i = 0; i < us.length; i++) {
      for (let j = i + 1; j < us.length; j++) {
        if (us[j] - us[i] < minSide) continue
        for (let k = 0; k < vs.length; k++) {
          for (let l = vs.length - 1; l > k; l--) {
            const r = { u0: us[i], u1: us[j], v0: vs[k], v1: vs[l] }
            if (rh(r) < minSide || ra(r) <= bestA) break
            if (obs.some((o) => hit(o, r, -1e-6))) continue
            best = r
            bestA = ra(r)
            break
          }
        }
      }
    }
    return best
  }
}

// ---------------------------------------------------------------- shared pieces

interface Gen {
  d: DeviceDesign
  b: Body
  s: Specs
  T: (typeof TYPES)[DeviceType]
  out: Comp[]
  zones: Zone[]
  /** Battery asked for, as a share of what fits. */
  f: number
  fitBat: boolean
  /** The body is thinner than what is in it needs. */
  thin: boolean
  chip: ChipSpec
}

const storageLabel = (gb: number) => (gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`)
const LENS_NAMES: Record<string, string> = { wide: 'Main', ultrawide: 'Ultrawide', tele: 'Telephoto', periscope: 'Periscope', macro: 'Macro' }

/** Where a placed part is on the surface of the solid that carries it, in that solid's coordinates. */
export function partPoint(d: DeviceDesign, p: PlacedPart): V3 {
  const m = mountOf(d.type, p.face)
  const solid = carrierBody(d.body, d.type, m.carrier)
  const [X, Y, Z] = faceBasis(d.type, m.face)
  const depth = (m.face === 'front' || m.face === 'back' ? solid.thickness / 2 : m.face === 'left' || m.face === 'right' ? solid.width / 2 : solid.height / 2) - faceSink(d.body, p.face, d.type)
  return [X[0] * p.x + Y[0] * p.y + Z[0] * depth, X[1] * p.x + Y[1] * p.y + Z[1] * depth, X[2] * p.x + Y[2] * p.y + Z[2] * depth]
}

/** How a slab with a screen divides its thickness: glass and panel, a floor, the cavity, the back cover. */
function slabDims(b: Body, hasScreen: boolean, panel: number) {
  const t = b.thickness
  const size = Math.sqrt(b.width * b.height)
  // an LCD carries a backlight behind it, so its stack is half as thick again
  const disp = hasScreen ? Math.min(clamp(0.8 + 0.0048 * size, 0.9, 8) * (panel === 0 ? 1.4 : 1), t * 0.32) : 0
  const floor = Math.min(clamp(size * 0.003, 0.3, 2.5), t * 0.08)
  const cover = clamp(t * 0.1, 0.6, 3.2)
  const wall = clamp(Math.min(b.width, b.height) * 0.022, 1.1, 7) + (b.edge === 'round' ? edgeBevel(b) * 0.5 : 0.2)
  // a rectangle that stays inside the rounded corners
  const ins = wall + 0.2929 * Math.max(0, b.corner - wall)
  return { t, disp, floor, cover, wall, ins, depth: Math.max(0.6, t - disp - floor - cover), zFloor: t / 2 - disp - floor, zSeam: -t / 2 + cover }
}

/** A battery cell filling a rectangle as far as the capacity asked for goes. Past what fits, it spills out and says where. */
function cell(g: Gen, L: Lay, id: string, r: R, w0: number, tMax: number, share = 1, ear?: R | null): Comp {
  const f = clamp(g.f, 0.04, 1.7)
  const k = Math.pow(f, 0.25)
  const [cu, cv] = mid(r)
  const sc = (q: R): R => ({ u0: cu + (q.u0 - cu) * k, u1: cu + (q.u1 - cu) * k, v0: cv + (q.v0 - cv) * k, v1: cv + (q.v1 - cv) * k })
  const rr = sc(r)
  const th = Math.max(Math.min(tMax, 0.35), tMax * Math.sqrt(f))
  const mah = Math.round(g.s.battery * share)
  const c = L.add(id, 'battery', rr, w0, th, { specs: ['battery'], label: 'Battery cell', figure: batteryLabel(g.d.type, mah), fits: g.fitBat, text: `${batteryLabel(g.d.type, mah)}|${((mah * 3.85) / 1000).toFixed(1)} Wh  3.85 V` }, false)
  if (ear) c.more = [L.f.box(sc(ear), w0, th)]
  if (!g.fitBat) {
    c.clash = []
    if (rr.u0 < r.u0) c.clash.push(L.f.box({ ...rr, u1: r.u0 }, w0, th))
    if (rr.u1 > r.u1) c.clash.push(L.f.box({ ...rr, u0: r.u1 }, w0, th))
    if (rr.v0 < r.v0) c.clash.push(L.f.box({ ...rr, v1: r.v0 }, w0, th))
    if (rr.v1 > r.v1) c.clash.push(L.f.box({ ...rr, v0: r.v1 }, w0, th))
    if (th > tMax) c.clash.push(L.f.box(rr, w0 + tMax, th - tMax))
  }
  L.taken.push(r)
  return c
}

/** The lit panel and its glass, which lift off the front together. */
function display(g: Gen, cx: number, cy: number, w: number, h: number, zc: number, th: number, extra: Partial<Comp> = {}) {
  g.out.push({ id: 'display', kind: 'display', zone: 'body', host: 'screen', box: { c: [cx, cy, zc], s: [w, h, Math.max(0.05, th)] }, ax: [1, 2, 3], fits: true, layer: 0, specs: ['panel', 'refresh'], label: 'Display stack', figure: `${panelName(g.d.type, g.s.panel)}, ${g.s.refresh} Hz`, v: g.s.panel, n: Math.max(0.5, g.b.corner - edgeBevel(g.b)), ...extra })
}

interface Item {
  id: string
  kind: CompKind
  su: number
  sv: number
  sw: number
  at?: [number, number]
  /** How far above the board it starts, for something that sits over a chip. */
  dz?: number
  o?: Partial<Comp>
}
/** Stand components on a board, each in the free spot nearest where it wants to be. Returns where they went. */
function populate(L: Lay, boards: R[], top: number, items: Item[], obs: R[]): Map<string, R> {
  const placed = new Map<string, R>()
  for (const it of items) {
    for (const board of boards) {
      const inside = grow(board, -Math.min(0.8, rw(board) * 0.05))
      const r = L.fit(inside, it.su, it.sv, it.at ?? [0.5, 0.5], obs, 0.5)
      if (!r) continue
      const w0 = top + (it.dz ?? 0)
      L.add(it.id, it.kind, r, w0, Math.max(0.1, Math.min(it.sw, L.depth - w0 - 0.05)), it.o, false)
      obs.push(r)
      placed.set(it.id, r)
      break
    }
  }
  return placed
}

/** A run from one point of the plane to another that turns one corner on the way. */
function run(L: Lay, id: string, kind: CompKind, a: [number, number], b: [number, number], w: number, thick: number, o: Partial<Comp> = {}, along = true): Comp {
  thick = Math.max(0.2, Math.min(thick, L.depth * 0.4))
  w = clamp(w, 0, Math.max(0, L.depth - thick - 0.05))
  const corner: [number, number] = along ? [a[0], b[1]] : [b[0], a[1]]
  const r = join([R4(a[0], a[1], thick, thick), R4(b[0], b[1], thick, thick)])!
  return L.add(id, kind, r, w, thick, { over: true, path: [L.f.point(a[0], a[1], w + thick / 2), L.f.point(corner[0], corner[1], w + thick / 2), L.f.point(b[0], b[1], w + thick / 2)], ...o }, false)
}

/** Where a cable leaves a board: the point of it nearest to where the cable is going, a little way in from the edge. */
function exitOf(r: R, to: [number, number], inset = 4): [number, number] {
  const m = Math.min(inset, rw(r) / 2, rh(r) / 2)
  return [clamp(to[0], r.u0 + m, r.u1 - m), clamp(to[1], r.v0 + m, r.v1 - m)]
}
const crosses = (a: [number, number], b: [number, number], o: R, pad: number) => Math.min(a[0], b[0]) < o.u1 + pad && Math.max(a[0], b[0]) > o.u0 - pad && Math.min(a[1], b[1]) < o.v1 + pad && Math.max(a[1], b[1]) > o.v0 - pad

/** A cable laid flat from one board to another in straight runs, turning where it must to keep clear of whatever stands between them. */
function loom(L: Lay, id: string, from: R, to: R, w: number, thick: number, o: Partial<Comp>, avoid: R[]): Comp {
  thick = Math.max(0.2, Math.min(thick, L.depth - w - 0.05))
  const a = exitOf(from, mid(to))
  const b = exitOf(to, a)
  const obs = avoid.filter((r) => r !== from && r !== to)
  const A = grow(L.area, -thick)
  const inA = (p: [number, number]): [number, number] => [clamp(p[0], A.u0, A.u1), clamp(p[1], A.v0, A.v1)]
  const ways: [number, number][][] = [[a, [a[0], b[1]], b], [a, [b[0], a[1]], b]]
  for (const k of [0.5, 0.25, 0.75, -0.2, 1.2, -0.5, 1.5]) {
    const u = a[0] + (b[0] - a[0]) * k
    const v = a[1] + (b[1] - a[1]) * k
    ways.push([a, inA([u, a[1]]), inA([u, b[1]]), b], [a, inA([a[0], v]), inA([b[0], v]), b])
  }
  for (const v of [A.v0, A.v1]) ways.push([a, [a[0], v], [b[0], v], b])
  for (const u of [A.u0, A.u1]) ways.push([a, [u, a[1]], [u, b[1]], b])
  let best = ways[0]
  let cost = Infinity
  for (const way of ways) {
    let c = 0
    for (let i = 0; i + 1 < way.length; i++) {
      c += Math.abs(way[i + 1][0] - way[i][0]) + Math.abs(way[i + 1][1] - way[i][1])
      for (const r of obs) if (crosses(way[i], way[i + 1], r, thick)) c += 1e5
    }
    if (c < cost) {
      cost = c
      best = way
    }
  }
  const r = join(best.map((p) => R4(p[0], p[1], thick, thick)))!
  return L.add(id, 'cable', r, w, thick, { over: true, text: 'clips', n: thick, path: best.map((p) => L.f.point(p[0], p[1], w + thick / 2)), ...o }, false)
}

/** The memory and storage packages a design carries, as board items. */
function memoryItems(g: Gen, k: number): Item[] {
  if (!(g.T.memory > 0)) return []
  const s = g.s
  const out: Item[] = []
  const rams = s.ram >= 16 ? 2 : 1
  for (let i = 0; i < rams; i++) out.push({ id: `ram${i}`, kind: 'mem', su: 8 * k, sv: 5.6 * k, sw: 0.8 * k, at: [0.5, 0.35], o: { specs: ['ram'], label: 'Memory', figure: `${s.ram} GB`, v: 0, text: `${s.ram / rams}G` } })
  const nands = s.storage >= 1024 ? 2 : 1
  for (let i = 0; i < nands; i++) out.push({ id: `nand${i}`, kind: 'mem', su: 7 * k, sv: 8.4 * k, sw: 0.9 * k, at: [0.2, 0.6], o: { specs: ['storage'], label: 'Flash storage', figure: storageLabel(s.storage), v: 1, text: storageLabel(s.storage / nands) } })
  return out
}

const chipItem = (g: Gen, size: number, k: number, at: [number, number] = [0.5, 0.6]): Item => ({ id: 'chip', kind: 'chip', su: size * k, sv: size * k, sw: 0.95 * k, at, o: { specs: ['chip'], label: g.chip.name, figure: g.chip.custom ? 'In-house processor' : 'Processor', v: g.chip.custom ? 2 : g.s.chipTier, text: g.chip.name } })

// ---------------------------------------------------------------- slabs: phones, tablets, the halves of a foldable

interface SlabOpt {
  parts: PlacedPart[]
  /** The charging board along the bottom edge: the port, a speaker and the haptic motor. */
  strip: boolean
  board: 'full' | 'strip' | 'none'
  cells: number
  /** Added to ids, for the second half of a foldable. */
  sx: string
  /** Share of the capacity that goes in this cavity. */
  share: number
}

function slabGuts(g: Gen, L: Lay, o: SlabOpt) {
  const { d, s } = g
  const A = L.area
  const D = L.depth
  const cw = rw(A)
  const ch = rh(A)
  const k = clamp(Math.pow(Math.sqrt(cw * ch) / 100, 0.6), 0.45, 1.9)
  const base = Math.min(0.3, D * 0.08)
  const bt = Math.min(0.8 * k, D * 0.16)
  const top = base + bt
  const sx = o.sx
  const at = (p: PlacedPart) => L.f.at(partPoint(d, p))
  const has = (id: string) => s.extras.includes(id)

  // ---- what the layout of the parts fixes in place: a module under each lens
  const fixed: R[] = []
  const rear: R[] = []
  // a module is a little larger than its lens, but never so large that it runs into the one beside it
  const lenses = o.parts.filter((p) => p.face === 'back' && (p.kind === 'camera' || p.kind === 'flash') && !isCoverCam(d, p))
  const room = (p: PlacedPart, want: number) => {
    let side = want
    for (const q of lenses) {
      if (q === p) continue
      const gap = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y))
      side = Math.min(side, (2 * gap * Math.min(p.w, p.h)) / (Math.min(p.w, p.h) + Math.min(q.w, q.h)) - 0.3)
    }
    return Math.max(1.5, side)
  }
  // the small cameras that look out of the front, or out of a cover screen, go in first: a rear module may stand over one
  const small: { r: R; h: number }[] = []
  const order = [...o.parts.filter((p) => p.kind === 'camera' && !(p.face === 'back' && !isCoverCam(d, p))), ...o.parts.filter((p) => !(p.kind === 'camera' && !(p.face === 'back' && !isCoverCam(d, p))))]
  for (const p of order) {
    const [u, v] = at(p)
    if (p.kind === 'camera' && p.face === 'back' && !isCoverCam(d, p)) {
      const side = room(p, Math.min(p.w, p.h) + 2)
      const r = trim(R4(u, v, side, side), A)
      const lift = small.filter((q) => hit(q.r, r)).reduce((m, q) => Math.max(m, q.h + 0.1), 0)
      L.add(`cam:${p.id}`, 'camera', r, top + lift, Math.max(0.3, D - top - lift - 0.1), { partId: p.id, specs: ['camera'], label: `${LENS_NAMES[p.lens ?? 'wide']} camera`, figure: sensorInfo(p.sensor ?? 0).name, v: p.sensor ?? 0, n: p.lens === 'periscope' ? 1 : 0 })
      fixed.push(r)
      rear.push(r)
    } else if (p.kind === 'camera') {
      const side = Math.min(p.w, p.h) + 1.8
      const r = keep(R4(u, v, side, side), A)
      const h = Math.max(0.4, Math.min(2.6 * k, (D - top) * 0.45))
      small.push({ r, h })
      L.add(`cam:${p.id}`, 'camera', r, top, h, { partId: p.id, specs: ['camera'], label: p.face === 'back' ? 'Cover camera' : 'Front camera', figure: sensorInfo(p.sensor ?? 0).name, v: p.sensor ?? 0, n: 2 })
      fixed.push(r)
    } else if (p.kind === 'flash' && p.face === 'back') {
      const side = room(p, Math.min(p.w, p.h) + 0.6)
      const r = trim(R4(u, v, side, side), A)
      L.add(`led:${p.id}`, 'led', r, top, Math.max(0.3, Math.min(1.4, D - top - 0.2)), { partId: p.id, label: 'Flash LED' })
      fixed.push(r)
      rear.push(r)
    } else if (p.kind === 'fingerprint' && (p.face === 'back' || p.face === 'front')) {
      const r = keep(R4(u, v, p.w, p.h), A)
      L.add(`fp:${p.id}`, 'sensor', r, p.face === 'back' ? D - 0.55 : 0.02, 0.25, { partId: p.id, host: p.face === 'back' ? 'cover' : 'tray', label: 'Fingerprint reader', over: true, v: 1, layer: p.face === 'back' ? 4 : 0 }, false)
    } else if ((p.kind === 'button' || p.kind === 'fingerprint') && (p.face === 'left' || p.face === 'right')) {
      const side = u > (A.u0 + A.u1) / 2 ? A.u1 - 0.5 : A.u0 + 0.5
      const r = keep(R4(side, v, 0.8, p.w + 2), A)
      L.add(`key:${p.id}`, 'flex', r, top, Math.max(0.3, Math.min(1.6, D - top - 0.2)), { partId: p.id, label: p.kind === 'fingerprint' ? 'Fingerprint key' : 'Button switch', over: true, v: 2 }, false)
    }
  }
  L.taken.push(...fixed)

  // ---- the charging board along the bottom edge
  let low = A.v0
  if (o.strip) {
    const sb = clamp(ch * 0.085, 6.5, 16)
    low = A.v0 + sb
    const S: R = { u0: A.u0, v0: A.v0, u1: A.u1, v1: low }
    L.add(`sub${sx}`, 'board', grow(S, -0.3), base, bt, { v: 1, label: 'Charging board' }, false)
    const local: R[] = fixed.filter((r) => hit(r, S))
    const port = o.parts.find((p) => p.kind === 'port' && p.face === 'bottom')
    if (port) {
      const r = keep(R4(at(port)[0], A.v0 + Math.min(sb, 7.5) / 2, port.w + 1.4, Math.min(sb - 0.4, 7.5)), S)
      L.add(`port:${port.id}`, 'port', r, top, Math.max(0.4, Math.min(port.h + 0.6, D - top - 0.2)), { partId: port.id, specs: ['charging'], label: 'Charging port', figure: `${chargeWatts(d.type, s.charging)} W` }, false)
      local.push(r)
    }
    const grilles = o.parts.filter((p) => p.kind === 'grille' && p.face === 'bottom').slice(0, 2)
    grilles.forEach((p, i) => {
      const r = L.fit(S, Math.min(15 * k, cw * 0.26), sb - 1.2, [clamp((at(p)[0] - A.u0) / cw, 0, 1), 0.5], local, 0.5)
      if (!r) return
      L.add(`spk${i}${sx}`, 'speaker', r, top, Math.max(0.5, Math.min(3.2 * k, D - top - 0.3)), { label: 'Speaker', specs: grilles.length > 1 || has('stereo') ? ['extra:stereo'] : [] }, false)
      local.push(r)
    })
    // precision haptics are a wide linear motor in place of the little spinning weight
    const wide = has('haptics')
    const motor = L.fit(S, Math.min((wide ? 15 : 10.5) * k, cw * (wide ? 0.28 : 0.2)), sb - 1.6, [grilles.length && at(grilles[0])[0] > (A.u0 + A.u1) / 2 ? 0.08 : 0.92, 0.5], local, 0.5)
    if (motor) L.add(`haptic${sx}`, wide ? 'feature' : 'motor', motor, top, Math.max(0.5, Math.min(3 * k, D - top - 0.3)), wide ? { label: 'Wide linear haptic motor', specs: ['extra:haptics'], model: 'haptics' } : { label: 'Haptic motor' }, false)
    L.taken.push(S)
  }
  const rest: R = { ...A, v0: low + (o.strip ? 0.6 : 0) }
  const restH = rh(rest)

  // ---- the logic board: a column beside the battery where the cameras sit in a corner, otherwise a band across the top
  const boards: R[] = []
  const camR = join(rear)
  let corner = false
  if (o.board === 'full') {
    corner = !!camR && o.cells === 1 && rw(camR) <= 0.56 * cw && Math.abs(mid(camR)[0] - mid(A)[0]) >= 0.1 * cw && rh(camR) <= 0.55 * restH
    if (corner && camR) {
      const ts = clamp(ch * 0.07, 6, 13)
      const colW = clamp(rw(camR) + 5, 0.36 * cw, 0.5 * cw)
      const colTop = rest.v1 - ts
      let colBot = Math.min(camR.v0 - 3, rest.v0 + 0.4 * restH)
      if (colBot - rest.v0 < 0.14 * restH) colBot = rest.v0
      const right = mid(camR)[0] > mid(A)[0]
      boards.push({ u0: right ? A.u1 - colW : A.u0, u1: right ? A.u1 : A.u0 + colW, v0: colBot, v1: colTop }, { u0: A.u0, u1: A.u1, v0: colTop, v1: rest.v1 })
    } else {
      const bh = clamp(camR ? rest.v1 - camR.v0 + 4 : restH * 0.26, restH * 0.22, restH * 0.5)
      boards.push({ u0: A.u0, u1: A.u1, v0: rest.v1 - bh, v1: rest.v1 })
    }
  } else if (o.board === 'strip') {
    boards.push({ u0: A.u0, u1: A.u1, v0: rest.v1 - clamp(ch * 0.1, 6, 16), v1: rest.v1 })
  }
  boards.forEach((r, i) => L.add(`board${i || ''}${sx}`, 'board', grow(r, -0.3), base, bt, { v: 0, label: o.board === 'full' ? 'Logic board' : 'Display board' }))

  // ---- what stands on it
  const obs = [...fixed]
  if (o.board === 'full') {
    const items: Item[] = [chipItem(g, [8.5, 10, 12][s.chipTier] ?? 10, k), ...memoryItems(g, k)]
    items.push({ id: 'modem', kind: 'shield', su: 10 * k, sv: 6.5 * k, sw: 1.1 * k, at: [0.8, 0.3], o: { label: 'Modem and radios', specs: has('sat') ? ['extra:sat'] : [], v: 0 } })
    items.push({ id: 'pmic', kind: 'mem', su: 4.4 * k, sv: 4.4 * k, sw: 0.7 * k, at: [0.2, 0.2], o: { label: 'Power management', specs: ['charging'], v: 2, text: `${chargeWatts(d.type, s.charging)}W` } })
    if (d.type !== 'tablet' && d.type !== 'ereader' && d.type !== 'actioncam') items.push({ id: 'sim', kind: 'tray', su: 12 * Math.min(1, k), sv: 8 * Math.min(1, k), sw: 1 * k, at: [0, 0.5], o: { label: 'SIM tray' } })
    if (has('stereo')) items.push({ id: 'earpiece', kind: 'feature', su: 11 * k, sv: 4.4 * k, sw: 2 * k, at: [0.5, 1], o: { label: 'Earpiece speaker', specs: ['extra:stereo'], model: 'stereo' } })
    // the extras that are parts: each stands on the board where it would sit in a real device
    if (has('face')) items.push({ id: 'face', kind: 'feature', su: 14 * k, sv: 4.6 * k, sw: 2.6 * k, at: [0.5, 1], o: { label: 'Dot projector, flood lamp and infrared camera', specs: ['extra:face'], model: 'face' } })
    if (has('ir')) items.push({ id: 'ir', kind: 'feature', su: 4.4 * k, sv: 3 * k, sw: 1.6 * k, at: [0.15, 1], o: { label: 'Infrared emitter', specs: ['extra:ir'], model: 'ir' } })
    if (has('sat')) items.push({ id: 'satlink', kind: 'feature', su: 12 * k, sv: 9 * k, sw: 1.8 * k, at: [0.35, 0.92], o: { label: 'Satellite patch aerial and radio', specs: ['extra:sat'], model: 'sat' } })
    if (has('jack')) items.push({ id: 'jack', kind: 'port', su: 6 * k, sv: 5 * k, sw: 3.5 * k, at: [0.1, 0.95], o: { label: 'Headphone jack', specs: ['extra:jack'] } })
    if (has('esim')) items.push({ id: 'esim', kind: 'mem', su: 3.2 * k, sv: 3.2 * k, sw: 0.6 * k, at: [0.65, 0.15], o: { label: 'eSIM chip', specs: ['extra:esim'], v: 2, text: 'eSIM', about: FEATURE_MODELS.esim } })
    if (has('uwb')) items.push({ id: 'uwb', kind: 'feature', su: 8 * k, sv: 7 * k, sw: 1 * k, at: [0.9, 0.8], o: { label: 'Ultra-wideband aerial array', specs: ['extra:uwb'], model: 'uwb' } })
    if (has('mmwave')) {
      items.push({ id: 'mmw0', kind: 'feature', su: 9 * k, sv: 2.6 * k, sw: 1.3 * k, at: [0, 0.9], o: { label: 'mmWave aerial module', specs: ['extra:mmwave'], model: 'mmwave' } })
      items.push({ id: 'mmw1', kind: 'feature', su: 9 * k, sv: 2.6 * k, sw: 1.3 * k, at: [1, 0.1], o: { label: 'mmWave aerial module', specs: ['extra:mmwave'], model: 'mmwave' } })
    }
    const tray = items.find((it) => it.id === 'sim')
    if (has('sd') && tray) tray.o = { label: 'SIM and memory card tray', specs: ['extra:sd'] }
    else if (has('sd')) items.push({ id: 'sd', kind: 'tray', su: 11 * Math.min(1, k), sv: 9 * Math.min(1, k), sw: 1 * k, at: [0, 0.5], o: { label: 'Memory card slot', specs: ['extra:sd'] } })
    const placed = populate(L, boards, top, items, obs)
    const soc = placed.get('chip')
    if (soc) {
      // a shield can over the processor: drawn lifted, so the package under it shows
      L.add('can', 'shield', keep(grow(soc, 0.9), A), top, Math.max(0.3, Math.min(1.5 * k, D - top - 0.1)), { label: 'Shield can', specs: ['chip'], over: true, v: 1 }, false)
      // heat leaves through the floor: a graphite pad, a graphite sheet or a vapour chamber, by how hard the chip runs
      const tier = g.chip.custom || has('vapor') ? 2 : s.chipTier
      const span = tier === 0 ? grow(soc, 4) : tier === 1 ? boards[0] : (join([boards[0], { ...rest, v1: boards[0].v0, v0: Math.max(rest.v0, boards[0].v0 - restH * 0.3) }]) ?? boards[0])
      L.add('thermal', 'sheet', keep(grow(span, -0.6), A), 0.02, Math.max(0.05, Math.min(0.22, base * 0.7)), { label: ['Graphite pad', 'Graphite sheet', 'Vapour chamber'][tier], specs: has('vapor') ? ['chip', 'extra:vapor'] : ['chip'], v: tier === 2 ? 1 : 0, figure: 'Cooling', note: has('vapor') ? undefined : 'Follows the chip tier, unless a vapour chamber is fitted as an extra.', layer: 0 }, false)
    }
    if (has('nfc')) {
      const r = L.fit(boards[boards.length - 1], 14 * k, 9 * k, [0.85, 0.5], fixed, 0.5)
      if (r) L.add('nfc', 'feature', r, Math.max(top, D - 0.5), 0.3, { host: 'cover', label: 'NFC coil', specs: ['extra:nfc'], model: 'nfc', over: true, layer: 4 }, false)
    }
  }

  // ---- a stylus lives in a silo up one side from the bottom edge: the battery has to make room for it
  if (has('stylus') && o.board === 'full') {
    const pen = Math.min(5.5 * k, cw * 0.1, D - base - 0.4)
    const len = Math.min(rh(rest) * 0.85, 125 * Math.min(1.4, k))
    // as long as fits clear of the boards and what stands on them, down to a stub
    for (let f = 1; pen > 1.5 && f >= 0.4; f -= 0.15) {
      if (len * f < 30) break
      const r = L.fit(rest, pen, len * f, [1, 0], [...L.taken, ...obs], 0.5)
      if (!r) continue
      L.add('stylus', 'feature', r, base, pen, { label: 'Stylus in its silo', specs: ['extra:stylus'], model: 'stylus' })
      break
    }
  }

  // ---- the battery takes the largest clear rectangle that is left, and an L-shaped foot if there is room beside it
  const tMax = Math.max(0.4, D - base - 0.75)
  const main = o.cells > 0 ? L.largest(rest) : null
  if (main) {
    if (o.cells >= 2 && rw(main) > rh(main) * 0.8) {
      const gap = Math.min(3, rw(main) * 0.03)
      const half = (rw(main) - gap) / 2
      cell(g, L, `battery${sx}`, { ...main, u1: main.u0 + half }, base, tMax, o.share / 2)
      cell(g, L, `battery2${sx}`, { ...main, u0: main.u1 - half }, base, tMax, o.share / 2)
    } else {
      L.taken.push(main)
      let ear = L.largest(rest, L.taken, 0.8, 5)
      L.taken.pop()
      if (ear) {
        // it counts as a foot only if it runs along one side of the main cell
        const beside = (Math.abs(ear.u0 - main.u1) < 2.5 || Math.abs(ear.u1 - main.u0) < 2.5) && Math.min(ear.v1, main.v1) - Math.max(ear.v0, main.v0) > rh(ear) * 0.6
        const stacked = (Math.abs(ear.v0 - main.v1) < 2.5 || Math.abs(ear.v1 - main.v0) < 2.5) && Math.min(ear.u1, main.u1) - Math.max(ear.u0, main.u0) > rw(ear) * 0.6
        if (!(beside || stacked) || ra(ear) < 0.08 * ra(main)) ear = null
        else if (beside) ear = ear.u0 > main.u0 ? { ...ear, u0: main.u1 } : { ...ear, u1: main.u0 }
        else ear = ear.v0 > main.v0 ? { ...ear, v0: main.v1 } : { ...ear, v1: main.v0 }
      }
      const c = cell(g, L, `battery${sx}`, main, base, tMax, o.share, ear)
      if (ear) {
        c.label = 'L-shaped battery cell'
        L.taken.push(ear)
      }
    }
    const th = g.out.find((c) => c.id === `battery${sx}`)!.box.s[Math.abs(L.f.ax[2]) - 1]
    if (o.strip && boards.length) {
      // the ribbon from the charging board to the logic board runs up one edge of the cell
      // on the side away from the foot of an L-shaped cell, so that it does not cut the cell in two
      const inset = Math.min(3.5 * k, rw(main) * 0.12)
      const foot = g.out.find((c) => c.id === `battery${sx}`)?.more?.length ? mid(L.taken[L.taken.length - 1])[0] : null
      const u = foot !== null && foot < mid(main)[0] ? main.u1 - inset : main.u0 + inset
      L.add(`flex${sx}`, 'flex', { u0: u - 1.6 * k, u1: u + 1.6 * k, v0: low - 1.5, v1: Math.min(A.v1, main.v1 + 3) }, Math.min(base + th + 0.02, D - 0.6), 0.14, { label: 'Charging flex cable', specs: ['charging'], over: true, v: 0 }, false)
    }
    if (has('wireless') && d.type !== 'tablet' && o.share >= 0.5) {
      const dia = Math.min(rw(main), rh(main), 54) * 0.86
      const [cu, cv] = mid(main)
      L.add('coil', 'feature', R4(cu, cv, dia, dia), D - 0.6, 0.45, { host: 'cover', model: 'wireless', label: has('reverse') ? 'Two-way wireless charging coil' : 'Wireless charging coil', specs: has('reverse') ? ['extra:wireless', 'extra:reverse'] : ['extra:wireless'], v: has('reverse') ? 1 : 0, layer: 4 }, false)
    }
  }
  if (boards.length) {
    const [bu] = mid(boards[0])
    L.add(`dflex${sx}`, 'flex', keep(R4(bu, boards[0].v0, 8 * k, 4.4 * k), A), top + 0.02, 0.2, { label: 'Display connector', specs: ['panel'], over: true, v: 1 }, false)
  }
  // ---- the seals of a water-resistant body: a gasket round the opening, under the back
  const seal = ['ip69', 'ip68', 'ip54'].find(has)
  if (seal && o.board !== 'none') L.add(`gasket${sx}`, 'feature', grow(A, -0.2), D - 0.25, 0.2, { host: 'cover', label: seal === 'ip54' ? 'Splash seals' : seal === 'ip69' ? 'Pressure seals' : 'Water seals', specs: [`extra:${seal}`], model: 'gasket', over: true, layer: 4, v: seal === 'ip54' ? 0 : seal === 'ip68' ? 1 : 2 }, false)
  // ---- aerials along the top and bottom walls
  if (o.board !== 'none') L.add(`ant${sx}`, 'antenna', R4(mid(A)[0], A.v1 - 0.45, cw * 0.62, 0.7), base, Math.max(0.3, Math.min(2.2, D * 0.45)), { label: has('sat') ? 'Aerials and satellite link' : 'Aerial', specs: has('sat') ? ['extra:sat'] : [], over: true, v: has('sat') ? 1 : 0 }, false)
  if (o.strip) L.add(`ant2${sx}`, 'antenna', R4(mid(A)[0], A.v0 + 0.45, cw * 0.5, 0.7), base, Math.max(0.3, Math.min(2.2, D * 0.45)), { label: 'Aerial', over: true }, false)
}

function layoutSlab(g: Gen) {
  const { b, d, s } = g
  const dm = slabDims(b, true, s.panel)
  const hx = Math.max(4, b.width / 2 - dm.ins)
  const hy = Math.max(4, b.height / 2 - dm.ins)
  g.zones.push({ id: 'main', anchor: 'body', box: { c: [0, 0, (dm.zFloor + dm.zSeam) / 2], s: [2 * hx, 2 * hy, dm.depth] }, up: -3, cut: { axis: 2, at: dm.zSeam, side: -1 }, wall: dm.wall })
  const L = new Lay(g.out, 'main', new Frame([0, 0, dm.zFloor], -1, 2, -3), { u0: -hx, v0: -hy, u1: hx, v1: hy }, dm.depth)
  slabGuts(g, L, { parts: d.parts, strip: true, board: 'full', cells: d.type === 'tablet' ? 2 : 1, sx: '', share: 1 })
  const bev = edgeBevel(b)
  display(g, 0, 0, b.width - 2 * bev - 0.4, b.height - 2 * bev - 0.4, b.thickness / 2 - dm.disp / 2, dm.disp)
}

/** A foldable: two cavities either side of the hinge, a cell in each, and ribbons across the fold. */
function layoutFoldable(g: Gen) {
  const { b, d, s } = g
  const flip = isFlip(b)
  const dm = slabDims(b, true, s.panel)
  const hx = b.width / 2 - dm.ins
  const hy = b.height / 2 - dm.ins
  const gap = HINGE_CLEAR + 1.4
  const f = new Frame([0, 0, dm.zFloor], -1, 2, -3)
  // the fixed half keeps the name 'main': the right-hand half of a book as seen from the front, the lower half of a flip
  const areas: [string, R][] = flip
    ? [['main', { u0: -hx, u1: hx, v0: -hy, v1: -gap }], ['left', { u0: -hx, u1: hx, v0: gap, v1: hy }]]
    : [['main', { u0: -hx, u1: -gap, v0: -hy, v1: hy }], ['left', { u0: gap, u1: hx, v0: -hy, v1: hy }]]
  const zc = (dm.zFloor + dm.zSeam) / 2
  const inLeft = (p: PlacedPart) => {
    const at = partPoint(d, p)
    return flip ? at[1] > 0 : at[0] < 0
  }
  const cells = flip ? [0.68, 0.32] : [0.46, 0.54]
  areas.forEach(([id, A], i) => {
    const box = f.box(A, 0, dm.depth)
    g.zones.push({ id, anchor: 'body', box: { c: [box.c[0], box.c[1], zc], s: box.s }, up: -3, cut: { axis: 2, at: dm.zSeam, side: -1 }, wall: dm.wall })
    const L = new Lay(g.out, id, f, A, dm.depth)
    const parts = d.parts.filter((p) => inLeft(p) === (i === 1))
    // a book carries its logic board with the cameras in the fixed half; a flip carries both in the half that folds over
    const full = flip ? i === 1 : i === 0
    slabGuts(g, L, { parts, strip: i === 0, board: full ? 'full' : flip ? 'none' : 'strip', cells: 1, sx: i ? 'b' : '', share: cells[i] })
  })
  // ---- the hinge, and what crosses it
  const hinge = HINGES[s.hinge ?? 0] ?? HINGES[0]
  const len = (flip ? 2 * hx : 2 * hy) * 0.94
  const H: R = flip ? R4(0, 0, len, 2 * gap - 1.2) : R4(0, 0, 2 * gap - 1.2, len)
  g.zones.push({ id: 'hinge', anchor: 'body', box: { c: [0, 0, zc], s: flip ? [2 * hx, 2 * gap, dm.depth] : [2 * gap, 2 * hy, dm.depth], }, up: -3, wall: 0 })
  const LH = new Lay(g.out, 'hinge', f, flip ? { u0: -hx, u1: hx, v0: -gap, v1: gap } : { u0: -gap, u1: gap, v0: -hy, v1: hy }, dm.depth)
  LH.add('hinge', 'hinge', H, 0.1, Math.max(0.4, dm.depth - 0.3), { label: hinge.name, figure: `closes to a ${hinge.gap} mm gap`, specs: ['hinge'], v: s.hinge ?? 0, n: [2, 3, 4, 6][s.hinge ?? 0] ?? 2, axis: flip ? 0 : 1 }, false)
  const LB = new Lay(g.out, 'body', f, { u0: -hx, u1: hx, v0: -hy, v1: hy }, dm.depth)
  for (const [i, t] of [-0.3, 0.3].entries()) {
    const r = flip ? R4(t * 2 * hx, 0, 7, 2 * gap + 10) : R4(0, t * 2 * hy, 2 * gap + 10, 7)
    LB.add(`fold${i}`, 'flex', r, Math.max(0.1, dm.depth - 0.5), 0.16, { label: 'Flex across the fold', specs: ['hinge'], over: true, v: 3, layer: 3 }, false)
  }
  const bev = edgeBevel(b)
  display(g, 0, 0, b.width - 2 * bev - 0.4, b.height - 2 * bev - 0.4, b.thickness / 2 - dm.disp / 2, dm.disp, { figure: `${panelName('foldable', s.panel)}, ${s.refresh} Hz, folding` })
}

// ---------------------------------------------------------------- watch

function layoutWatch(g: Gen) {
  const { b, d, s } = g
  const dm = slabDims(b, true, s.panel)
  const hx = Math.max(6, b.width / 2 - dm.ins)
  const hy = Math.max(6, b.height / 2 - dm.ins)
  const D = dm.depth
  g.zones.push({ id: 'main', anchor: 'body', box: { c: [0, 0, (dm.zFloor + dm.zSeam) / 2], s: [2 * hx, 2 * hy, D] }, up: -3, cut: { axis: 2, at: dm.zSeam, side: -1 }, wall: dm.wall })
  const A: R = { u0: -hx, v0: -hy, u1: hx, v1: hy }
  const L = new Lay(g.out, 'main', new Frame([0, 0, dm.zFloor], -1, 2, -3), A, D)
  // a system-in-package on a small board against the display, the cell and the motor above it, the sensors in the back
  const bt = Math.min(0.5, D * 0.08)
  L.add('board', 'board', grow(A, -0.4), 0.1, bt, { v: 1, label: 'Logic board' }, false)
  const sip = Math.min(hx, hy) * 1.1
  const chipH = Math.min(0.9, D * 0.14)
  L.add('chip', 'chip', R4(-hx * 0.12, hy * 0.1, sip, sip), 0.1 + bt, chipH, { specs: ['chip'], label: g.chip.name, figure: 'System in package', v: g.chip.custom ? 2 : s.chipTier, text: g.chip.name }, false)
  const zb = 0.1 + bt + chipH + 0.15
  const cover = Math.min(1.1, D * 0.16)
  const tMax = Math.max(0.5, D - zb - cover)
  const tap = 2 * hx * 0.24
  const spk = 2 * hy * 0.16
  const crown = d.parts.find((p) => p.kind === 'button' && p.crown)
  const upper = L.tier()
  if (crown) {
    const [u, v] = L.f.at(partPoint(d, crown))
    const r = keep(R4(u, v, 2.8, crown.w + 1.5), A)
    upper.add(`key:${crown.id}`, 'control', r, zb, Math.min(tMax, crown.w), { partId: crown.id, label: 'Crown encoder', v: 4 })
  }
  const motor = upper.fit({ ...A, u0: hx - tap }, tap - 0.6, 2 * hy * 0.7, [1, 0.6])
  if (motor) upper.add('haptic', 'motor', motor, zb, Math.min(tMax, 4.2), { label: 'Taptic motor', v: 1 })
  const speaker = upper.fit({ ...A, v1: -hy + spk }, 2 * hx * 0.4, spk - 0.5, [0.2, 0])
  if (speaker) upper.add('spk0', 'speaker', speaker, zb, Math.min(tMax, 3), { label: 'Speaker' })
  const room = upper.largest(A)
  if (room) cell(g, upper, 'battery', room, zb, tMax)
  // the sensor array looks out through the window in the back
  const win = d.parts.find((p) => p.kind === 'island' && p.face === 'back')
  const io = s.io ?? []
  const dia = Math.min(win ? Math.min(win.w, win.h) : 2 * Math.min(hx, hy), 2 * Math.min(hx, hy)) * 0.86
  const [wu, wv] = win ? L.f.at(partPoint(d, win)) : [0, 0]
  if (io.length || win) L.add('sensors', 'sensor', keep(R4(wu, wv, dia, dia), A), D - cover + 0.1, Math.max(0.2, cover - 0.2), { host: 'cover', label: 'Sensor array', figure: io.length ? `${io.length} sensor${io.length > 1 ? 's' : ''}` : 'no sensors fitted', specs: io.map((id) => `io:${id}`), n: io.length, v: 0, layer: 4 }, false)
  if (s.extras.includes('wireless')) L.add('coil', 'feature', keep(R4(wu, wv, dia * 1.12, dia * 1.12), A), D - cover + 0.1, 0.3, { host: 'cover', label: 'Charging coil', specs: ['extra:wireless'], model: 'wireless', over: true, v: 0, layer: 4 }, false)
  if (s.extras.includes('nfc')) L.add('nfc', 'antenna', R4(0, hy - 0.4, hx * 1.2, 0.6), zb, Math.min(tMax, 2), { label: 'NFC aerial', specs: ['extra:nfc'], over: true, v: 1 }, false)
  const bev = edgeBevel(b)
  display(g, 0, 0, b.width - 2 * bev - 0.4, b.height - 2 * bev - 0.4, b.thickness / 2 - dm.disp / 2, dm.disp, { figure: panelName('watch', s.panel) })
}

// ---------------------------------------------------------------- handheld

function layoutHandheld(g: Gen) {
  const { b, d, s } = g
  const dm = slabDims(b, true, s.panel)
  const hx = b.width / 2 - dm.ins
  const hy = b.height / 2 - dm.ins
  const D = dm.depth
  const A: R = { u0: -hx, v0: -hy, u1: hx, v1: hy }
  g.zones.push({ id: 'main', anchor: 'body', box: { c: [0, 0, (dm.zFloor + dm.zSeam) / 2], s: [2 * hx, 2 * hy, D] }, up: -3, cut: { axis: 2, at: dm.zSeam, side: -1 }, wall: dm.wall })
  const L = new Lay(g.out, 'main', new Frame([0, 0, dm.zFloor], -1, 2, -3), A, D)
  const level = s.keyboard ?? 0
  const input = inputOptions('handheld')[level] ?? inputOptions('handheld')[0]
  const io = s.io ?? []
  const base = 0.4
  const bt = Math.min(1.1, D * 0.1)
  const top = base + bt
  const c = handheldControls(b)
  const side = c.r * 2.5
  const tall = Math.max(1, Math.min(D - base - 0.4, 11))
  // ---- the controls, under where they show on the front
  const control = (id: string, x: number, y: number, v: number, label: string) => L.add(id, 'control', keep(R4(-x, y, side, side), A), base, tall, { specs: ['input'], label, figure: input.name, v })
  control('stickL', -c.x, c.up, level >= 1 ? 1 : 0, level >= 1 ? 'Hall-effect stick' : 'Stick module')
  control('dpad', -c.x, c.down, 2, 'Direction pad switches')
  control('keys', c.x, c.up, 3, 'Face button switches')
  control('stickR', c.x, c.down, level >= 1 ? 1 : 0, level >= 1 ? 'Hall-effect stick' : 'Stick module')
  for (const sx of [-1, 1]) {
    const tr = L.fit({ ...A, v0: hy - 13 }, 32, 11, [sx < 0 ? 0 : 1, 1])
    if (tr) L.add(`trigger${sx < 0 ? 'L' : 'R'}`, 'control', tr, base, tall, { specs: ['input'], label: level >= 3 ? 'Adaptive trigger' : level >= 2 ? 'Analogue trigger' : 'Trigger switch', figure: input.name, v: 5 + Math.min(2, Math.max(0, level - 1)) })
    const mo = L.fit({ u0: sx < 0 ? A.u0 : hx - side - 4, u1: sx < 0 ? -hx + side + 4 : A.u1, v0: -c.r * 1.4, v1: c.r * 1.4 }, side * 0.62, c.r * 1.5, [0.5, 0.5])
    if (mo && level >= 1) L.add(`rumble${sx < 0 ? 'L' : 'R'}`, 'motor', mo, base, Math.min(tall, 8), { specs: ['input'], label: level >= 2 ? 'Haptic actuator' : 'Rumble motor', figure: input.name, v: level >= 2 ? 1 : 0 })
  }
  // ---- sockets, speakers and the exhaust, where the parts put them
  for (const p of d.parts) {
    const [u, v, w] = L.f.at(partPoint(d, p))
    if (p.kind === 'port') {
      const r = keep(R4(u, v, p.w + 1.6, 8), A)
      if (L.taken.some((t) => hit(t, r, 0.3))) continue
      const info = p.text ? ioInfo('handheld', p.text) : undefined
      L.add(`port:${p.id}`, 'port', r, clamp(w - p.h / 2 - 0.4, base, Math.max(base, D - p.h - 1)), Math.min(p.h + 0.8, D - base - 0.2), { partId: p.id, label: info ? info.name : 'Charging port', figure: info ? undefined : `${chargeWatts('handheld', s.charging)} W`, specs: info ? [`io:${p.text}`] : ['charging'] })
    } else if (p.kind === 'grille' && (p.face === 'bottom' || p.face === 'top')) {
      const r = L.fit({ ...A, v0: v < 0 ? A.v0 : hy - 10, v1: v < 0 ? A.v0 + 10 : A.v1 }, 20, 8.5, [clamp((u - A.u0) / (2 * hx), 0, 1), 0.5])
      if (r) L.add(`spk:${p.id}`, 'speaker', r, base, Math.min(tall, 6), { label: 'Speaker' })
    }
  }
  if (io.includes('dock')) {
    const r = L.fit({ ...A, v1: A.v0 + 6 }, 14, 4.5, [0.35, 0])
    if (r) L.add('dockpins', 'port', r, base, Math.min(tall, 3), { label: 'Dock connector', figure: 'TV dock in the box', specs: ['io:dock'], v: 1 })
  }
  // ---- the middle: fan and heat pipes over the board at the top, the cell below
  const midR: R = { u0: -c.x + side / 2 + 2, u1: c.x - side / 2 - 2, v0: A.v0, v1: A.v1 }
  const tier = g.chip.custom ? 2 : s.chipTier
  const fanD = clamp(Math.min(2 * hy * 0.4, rw(midR) * 0.26) * (tier === 2 ? 1.12 : 1), 18, 52)
  const fan = L.fit({ ...midR, v0: -hy * 0.1 }, fanD, fanD, [0.92, 0.75])
  if (fan) L.add('fan0', 'fan', fan, base, Math.min(tall, 9), { label: 'Fan', figure: `${Math.round(g.chip.watts)} W of heat to shed`, note: 'Sized from the chip tier: a handheld has no cooling row of its own.', specs: ['chip'], axis: 2 })
  const board = L.fit({ ...midR, v0: -hy * 0.12 }, rw(midR) * 0.66, hy * 0.92, [0.05, 0.7])
  if (board) {
    L.add('board', 'board', board, base, bt, { v: 0, label: 'Logic board' })
    const k = 1.25
    const items: Item[] = [chipItem(g, [11, 13, 15][s.chipTier] ?? 13, 1, [0.72, 0.5]), ...memoryItems(g, k)]
    if (io.includes('wifi')) items.push({ id: 'wifi', kind: 'shield', su: 12, sv: 9, sw: 1.6, at: [0.05, 0.9], o: { label: 'Fast wireless module', specs: ['io:wifi'] } })
    if (io.includes('lte')) items.push({ id: 'modem', kind: 'shield', su: 14, sv: 10, sw: 1.6, at: [0.05, 0.1], o: { label: 'Cellular modem', specs: ['io:lte'] } })
    if (io.includes('stream')) items.push({ id: 'stream', kind: 'mem', su: 7, sv: 7, sw: 1, at: [0.4, 0.95], o: { label: 'Streaming chip', specs: ['io:stream'], v: 2, text: 'STRM' } })
    if (io.includes('gyro')) items.push({ id: 'gyro', kind: 'mem', su: 4, sv: 4, sw: 0.8, at: [0.5, 0.05], o: { label: 'Motion sensor', specs: ['io:gyro'], v: 2, text: 'IMU' } })
    const placed = populate(L, [board], top, items, [])
    const soc = placed.get('chip')
    if (soc && fan) {
      const pipes = 1 + Math.min(1, tier)
      for (let i = 0; i < pipes; i++) run(L, `pipe${i}`, 'pipe', [mid(soc)[0], mid(soc)[1] + (i - (pipes - 1) / 2) * 3.4], [mid(fan)[0], mid(fan)[1] + (i - (pipes - 1) / 2) * 3.4], top + 1.2, Math.min(2.2, D * 0.1), { label: 'Heat pipe', specs: ['chip'] }, false)
    }
  }
  const room = L.largest(midR)
  if (room) cell(g, L, 'battery', room, base, Math.max(0.6, D - base - 1))
  const bev = edgeBevel(b)
  const scr = screenRect(b)
  display(g, scr.cx, scr.cy, Math.min(scr.w + 4, b.width - 2 * bev), Math.min(scr.h + 4, b.height - 2 * bev - 0.4), b.thickness / 2 - dm.disp / 2, dm.disp)
}

// ---------------------------------------------------------------- laptop

function layoutLaptop(g: Gen) {
  const { b, d, s } = g
  const base = carrierBody(b, 'laptop', 'base')
  const t = laptopSplit(b).base
  const cover = clamp(t * 0.09, 0.8, 1.6)
  const deck = Math.min(1.4, t * 0.12)
  const D = Math.max(1, t - cover - deck)
  const wall = 4
  const ins = wall + 0.2929 * Math.max(0, b.corner - wall)
  const hx = base.width / 2 - ins
  const hy = base.height / 2 - ins
  const zFloor = t / 2 - deck
  const A: R = { u0: -hx, v0: -hy, u1: hx, v1: hy }
  g.zones.push({ id: 'main', anchor: 'base', box: { c: [0, 0, zFloor - D / 2], s: [2 * hx, 2 * hy, D] }, up: -3, cut: { axis: 2, at: -t / 2 + cover, side: -1 }, wall })
  g.zones.push({ id: 'body', anchor: 'base', box: { c: [0, 0, 0], s: [base.width, base.height, t] }, up: -3, wall })
  const L = new Lay(g.out, 'main', new Frame([0, 0, zFloor], -1, 2, -3), A, D)
  // ---- the underside of the deck: the keyboard and the trackpad, seen from below
  const kd = laptopDeck(b)
  const kb = inputOptions('laptop')[s.keyboard ?? 0] ?? inputOptions('laptop')[0]
  const fl = Math.min(0.5, D * 0.08)
  L.add('keyboard', 'plate', keep(R4(-kd.x, kd.y, kd.w + 4, kd.h + 4), A), 0.02, fl, { label: 'Keyboard, from below', figure: kb.name, specs: ['input'], v: 0, n: s.keyboard ?? 0, layer: 0 }, false)
  const padH = Math.max(40, Math.min(90, b.height / 2 + kd.y - kd.h / 2 - 14))
  L.add('trackpad', 'plate', keep(R4(0, kd.y - kd.h / 2 - 7 - padH / 2, Math.min(130, b.width * 0.38), padH), A), 0.02, fl, { label: 'Trackpad', specs: ['input'], v: 1, layer: 0 }, false)
  const z0 = fl + 0.3
  const tall = Math.max(0.8, D - z0 - 0.3)
  // ---- hinges at the two rear corners
  for (const sx of [-1, 1]) L.add(`hinge${sx < 0 ? 'L' : 'R'}`, 'hinge', R4(sx * (hx - 15), hy - 5, 28, 9), z0, tall * 0.8, { label: 'Lid hinge', v: 4, n: 1, axis: 0 })
  // ---- sockets where the ports are
  for (const p of d.parts) {
    if (mountOf('laptop', p.face).carrier !== 'base' || p.kind !== 'port') continue
    const [u, v, w] = L.f.at(partPoint(d, p))
    const rear = p.face === 'bottom'
    const r = keep(rear ? R4(u, hy - 5, p.w + 2, 10) : R4(u > 0 ? hx - 5 : -hx + 5, v, 10, p.w + 2), A)
    if (L.taken.some((q) => hit(q, r, 0.3))) continue
    const info = p.text ? ioInfo('laptop', p.text) : undefined
    L.add(`port:${p.id}`, 'port', r, clamp(w - p.h / 2 - 0.5, z0, Math.max(z0, D - p.h - 1.2)), Math.min(p.h + 1, tall), { partId: p.id, label: info?.name ?? 'Port', specs: p.text ? [`io:${p.text}`] : [] })
  }
  // ---- the rear half: fans either side of the board, joined to the chips by heat pipes
  const gpu = s.gpu ?? 0
  const bandH = 2 * hy * 0.46
  const band: R = { u0: A.u0 + 12, u1: A.u1 - 12, v0: hy - bandH, v1: hy - 11 }
  const fans = gpu > 0 || s.chipTier === 2 ? 2 : 1
  const fanD = clamp(Math.min(rh(band) * 0.7, 2 * hx * 0.2) * (gpu === 3 ? 1.1 : 1), 26, 84)
  const fanAt: R[] = []
  for (let i = 0; i < fans; i++) {
    const r = L.fit(band, fanD, fanD, [fans === 1 ? 1 : i, 1])
    if (!r) continue
    L.add(`fan${i}`, 'fan', r, z0, Math.min(tall, 9), { label: 'Fan', figure: fans > 1 ? 'one of two' : 'single fan', note: 'A second fan comes with a graphics chip or a flagship processor: a laptop has no cooling row of its own.', specs: gpu ? ['gpu', 'chip'] : ['chip'], axis: 2, v: 1 })
    fanAt.push(r)
  }
  const bt = Math.min(1.2, D * 0.12)
  const board = L.fit(band, rw(band) - fans * (fanD + 6) - 4, rh(band), [fans === 1 ? 0 : 0.5, 0.5])
  if (board) {
    L.add('board', 'board', board, z0, bt, { v: 0, label: 'Logic board' })
    const top = z0 + bt
    const items: Item[] = [chipItem(g, [15, 18, 21][s.chipTier] ?? 18, 1, [fans === 1 ? 0.75 : 0.35, 0.7])]
    if (gpu) items.push({ id: 'gpu', kind: 'chip', su: [0, 15, 19, 23][gpu], sv: [0, 15, 19, 23][gpu], sw: 1.1, at: [0.72, 0.7], o: { specs: ['gpu'], label: GPUS[gpu].name, figure: 'Graphics chip', v: 3, text: `GFX ${gpu}`, fits: !(g.thin && GPUS[gpu].thick > 0) } })
    const sticks = s.ram >= 16 ? 2 : 1
    for (let i = 0; i < sticks; i++) items.push({ id: `ram${i}`, kind: 'stick', su: 62, sv: 24, sw: 3.2, at: [0.1, 0.15 + i * 0.5], o: { specs: ['ram'], label: 'Memory module', figure: `${s.ram} GB`, v: 0, text: `${s.ram / sticks} GB` } })
    const ssds = s.storage >= 2048 ? 2 : 1
    for (let i = 0; i < ssds; i++) items.push({ id: `ssd${i}`, kind: 'stick', su: 72, sv: 20, sw: 2.6, at: [0.9, 0.1 + i * 0.4], o: { specs: ['storage'], label: 'Solid-state drive', figure: storageLabel(s.storage), v: 1, text: storageLabel(s.storage / ssds) } })
    items.push({ id: 'wifi', kind: 'shield', su: 20, sv: 14, sw: 1.8, at: [0.5, 0.05], o: { label: 'Wireless card' } })
    const placed = populate(L, [board], top, items, [])
    const hot = [placed.get('chip'), placed.get('gpu')].filter((r): r is R => !!r)
    let n = 0
    hot.forEach((r, h) => {
      const target = fanAt.length > 1 ? fanAt[h === 0 ? 0 : 1] : fanAt[0]
      if (!target) return
      const lines = 1 + (h === 1 ? Math.min(2, gpu - 1) : s.chipTier === 2 ? 1 : 0)
      for (let i = 0; i < lines; i++) run(L, `pipe${n++}`, 'pipe', [mid(r)[0], mid(r)[1] + (i - (lines - 1) / 2) * 5], [mid(target)[0], mid(target)[1] + (i - (lines - 1) / 2) * 5], top + 1.3, Math.min(2.6, tall * 0.2), { label: 'Heat pipe', note: 'More pipes for a faster chip or graphics tier.', specs: h === 1 ? ['gpu'] : ['chip'] }, false)
    })
  }
  // ---- the front half: speakers in the corners, cells between them
  const front: R = { u0: A.u0 + 3, u1: A.u1 - 3, v0: A.v0 + 3, v1: hy - bandH - 3 }
  const stereo = s.extras.includes('stereo')
  const sw = 2 * hx * (stereo ? 0.14 : 0.1)
  for (const sx of stereo ? [-1, 1] : [-1]) {
    const r = L.fit(front, sw, Math.min(rh(front) * 0.5, 26), [sx < 0 ? 0 : 1, 0])
    if (r) L.add(`spk${sx < 0 ? 0 : 1}`, 'speaker', r, z0, Math.min(tall, 7), { label: stereo ? 'Stereo speaker' : 'Speaker', specs: stereo ? ['extra:stereo'] : [] })
  }
  const room = L.largest(front)
  if (room) {
    const n = clamp(Math.round(rw(room) / 86), 2, 4)
    const gap = 3
    const each = (rw(room) - gap * (n - 1)) / n
    // the laptop lies on its lid while it is open, so the labels are printed to be read that way up
    for (let i = 0; i < n; i++) cell(g, L, `battery${i || ''}`, { ...room, u0: room.u0 + i * (each + gap), u1: room.u0 + i * (each + gap) + each }, z0, tall, 1 / n).n = 1
  }
}

// ---------------------------------------------------------------- displays on a stand: all-in-one desktops and TVs

function layoutPanel(g: Gen) {
  const { b, d, s, T } = g
  const tv = d.type === 'tv' || d.type === 'monitor'
  const dm = slabDims(b, true, s.panel)
  const hx = b.width / 2 - dm.ins
  const hy = b.height / 2 - dm.ins
  const D = dm.depth
  const A: R = { u0: -hx, v0: -hy, u1: hx, v1: hy }
  g.zones.push({ id: 'main', anchor: 'body', box: { c: [0, 0, (dm.zFloor + dm.zSeam) / 2], s: [2 * hx, 2 * hy, D] }, up: -3, cut: { axis: 2, at: dm.zSeam, side: -1 }, wall: dm.wall })
  const L = new Lay(g.out, 'main', new Frame([0, 0, dm.zFloor], -1, 2, -3), A, D)
  const cw = 2 * hx
  const ch = 2 * hy
  // everything is bolted to a steel chassis just under the back cover; the rest of the depth is the panel's own
  const De = Math.min(D - 0.6, tv ? 26 : 48)
  const z0 = D - De
  const plateT = Math.min(1.2, z0 * 0.5)
  const lit = s.panel === 0 ? 0 : s.panel >= 5 ? 2 : 1
  // what lights an LCD follows the picture processor: strips along the edges, a grid of zones, or a dense grid of small lamps
  const tier = g.chip.custom ? 2 : s.chipTier
  const areaM2 = (b.width * b.height) / 1e6
  const zoneRows = tv && lit === 0 && tier > 0 ? clamp(Math.round(Math.sqrt(areaM2 * (tier === 2 ? 420 : 56) * (s.refresh >= 120 ? 1.4 : 1) * (b.height / b.width))), 3, 20) : 0
  const zones = zoneRows * Math.round((zoneRows * b.width) / b.height)
  const light = lit === 0
    ? { label: zones ? (tier === 2 ? 'Mini-LED backlight' : 'Full-array LED backlight') : 'Edge-lit LED backlight', figure: zones ? `${zones} dimming zones` : 'LED strips along two edges', note: tv ? 'Follows the picture processor and the size of the screen: a faster one drives more dimming zones.' : undefined }
    : { label: ['', 'Self-lit panel, from behind', 'MicroLED tiles, from behind'][lit], figure: `${panelName(d.type, s.panel)}: every pixel lights itself, so there is no backlight` }
  L.add('backlight', 'plate', grow(A, -2), 0.05, Math.max(0.1, z0 - plateT - 0.2), { ...light, specs: ['panel'], v: 5 + lit, n: zones, layer: 0 }, false)
  // behind the panel is a stamped steel chassis, and everything else is bolted to that
  const vesa = b.width < 1000 ? 200 : b.width < 1500 ? 300 : b.width < 1800 ? 400 : 600
  if (tv) L.add('chassis', 'plate', grow(A, -1), z0 - plateT, plateT, { label: 'Stamped steel back chassis', figure: `VESA ${vesa} x ${vesa} mm wall mount`, v: 10, n: vesa, layer: 1 }, false)
  else L.add('chassis', 'plate', grow(A, -1), z0 - plateT, plateT, { label: 'Steel chassis', v: 2, layer: 1 }, false)
  const tall = Math.max(1, De - 0.6)
  // ---- fixed by the outside: where the stand bolts on, and where the sockets are
  const mount = standMount(b, d.type)
  if (mount) L.add('bracket', 'plate', keep(R4(mount.x, mount.y, mount.w, mount.h), A), z0, tall, { label: 'Stand bracket', figure: standInfo(d.type, b.stand).name, v: 4 })
  const sockets = d.parts.filter((p) => p.kind === 'port')
  const onBack = sockets.filter((p) => p.face === 'back')
  const backR = join(onBack.map((p) => R4(p.x, p.y, p.w + 6, p.h + 8)))
  const bt = Math.min(1.6, tall * 0.12)
  // a TV's boards stand off the chassis on short posts, with the cable looms lying under and between them
  const so = tv ? Math.min(1.4, tall * 0.08) : 0
  let ioBoard: R | null = null
  if (backR) {
    // a TV's main board carries its sockets; an all-in-one has a separate row of them
    ioBoard = keep(tv ? R4(mid(backR)[0], mid(backR)[1], Math.max(rw(backR) + 60, cw * 0.22), Math.max(rh(backR) + 80, ch * 0.4)) : grow(backR, 4), A)
    L.add(tv ? 'board' : 'ioboard', 'board', ioBoard, z0 + so, bt, { v: tv ? 0 : 1, label: tv ? 'Main board' : 'Port board', figure: tv ? `${onBack.length} socket${onBack.length === 1 ? '' : 's'} in the bank` : undefined })
    for (const p of onBack) {
      const info = p.text ? ioInfo(d.type, p.text) : undefined
      L.add(`port:${p.id}`, 'port', keep(R4(p.x, p.y, p.w + 3, p.h + 3), ioBoard), z0 + so + bt, Math.max(1, tall - bt - so - 0.2), { partId: p.id, label: info?.name ?? (p.text === 'power' ? 'Power inlet' : 'Socket'), specs: p.text && info ? [`io:${p.text}`] : [] }, false)
    }
  }
  for (const p of sockets.filter((q) => q.face !== 'back')) {
    const [u, v] = L.f.at(partPoint(d, p))
    const r = keep(R4(u, v, 14, p.w + 3), A)
    if (L.taken.some((q) => hit(q, r, 0.3))) continue
    const info = p.text ? ioInfo(d.type, p.text) : undefined
    L.add(`port:${p.id}`, 'port', r, z0, Math.min(tall, p.h + 4), { partId: p.id, label: info?.name ?? 'Socket', specs: p.text && info ? [`io:${p.text}`] : [] })
  }
  // ---- sound, where the outside shows it
  const sound = SPEAKERS[s.speakers ?? 0] ?? SPEAKERS[0]
  const si = s.speakers ?? 0
  const sFits = b.thickness >= sound.thick - 1e-6
  const sp = { specs: ['speakers'], figure: sound.name, fits: sFits }
  if (si === 2 || si === 3) {
    const r = Math.min(64, b.height * 0.09)
    const at = R4(-b.width * 0.3, tv ? -b.height * 0.12 : b.height * 0.16, 2 * r, 2 * r)
    L.add('woofer', 'driver', keep(at, A), z0, Math.min(tall, r * 0.9), { ...sp, label: 'Woofer', axis: 2, v: 0 })
  }
  if (tv) {
    // the four threaded points a wall bracket bolts to, and the mounts the stand's risers push up into
    for (const [i, [sx, sy]] of [[-1, -1], [1, -1], [-1, 1], [1, 1]].entries()) {
      const r = R4((sx * vesa) / 2, (sy * Math.min(vesa, ch * 0.6)) / 2, 22, 22)
      if (!L.taken.some((q) => hit(q, r, 1)) && r.u0 > A.u0 && r.u1 < A.u1 && r.v0 > A.v0 && r.v1 < A.v1) L.add(`vesa${i}`, 'plate', r, z0, Math.min(tall, 9), { label: 'Wall-mount point', figure: `VESA ${vesa} x ${vesa} mm, M${vesa >= 400 ? 8 : 6} thread`, v: 11 })
    }
    const stand = standInfo(d.type, b.stand)
    const riser = stand.id === 'feet' ? Math.min(40, Math.max(14, b.width * 0.03)) : b.width * 0.1
    for (const [i, sx] of (stand.id === 'feet' ? [-1, 1] : [0]).entries()) {
      const r = L.fit({ ...A, v1: A.v0 + 44 }, riser + 26, 34, [clamp((sx * b.width * 0.36 - (riser + 26) / 2 - A.u0) / Math.max(1, cw - riser - 26), 0, 1), 0])
      if (r) L.add(`mount${i}`, 'plate', r, z0, Math.min(tall, 12), { label: 'Stand mount', figure: stand.name, v: 4 })
    }
  }
  const boxW = cw * (tv ? [0.12, 0.16, 0.16, 0.11, 0][si] : [0.07, 0.1, 0.1, 0.08, 0][si])
  const boxH = Math.min(ch * 0.12, boxW * 0.5)
  if (si === 4) {
    for (const [i, u] of [-0.25, 0.25].entries()) L.add(`exciter${i}`, 'driver', R4(u * cw, ch * 0.08, Math.min(70, ch * 0.16), Math.min(70, ch * 0.16)), z0, Math.min(tall, 9), { ...sp, label: 'Panel actuator', axis: 2, v: 2 })
  } else {
    const n = si === 3 ? 4 : 2
    // a TV's speakers fire down from inboard of its feet; each is a sealed box with its drivers in the face
    const spots = tv ? (n === 2 ? [0.2, 0.8] : [0.17, 0.39, 0.61, 0.83]) : Array.from({ length: n }, (_, i) => i / (n - 1))
    for (let i = 0; i < n; i++) {
      const r = L.fit({ ...A, v1: A.v0 + boxH + 8 }, boxW, boxH, [spots[i], 0])
      if (r) L.add(`spk${i}`, 'speaker', r, z0, Math.min(tall, tv ? 16 : 22), { ...sp, label: si === 3 ? 'Array driver' : 'Speaker', v: tv ? 2 : 0, n: tv ? (si === 0 ? 1 : 2) : 0 })
    }
    if (si === 3) {
      for (const [i, sx] of [-1, 1].entries()) {
        const r = L.fit({ ...A, v0: A.v1 - boxH - 6 }, boxW, boxH, [sx < 0 ? 0.22 : 0.78, 1])
        if (r) L.add(`upfire${i}`, 'speaker', r, z0, Math.min(tall, 16), { ...sp, label: 'Up-firing driver', v: 1 })
      }
    }
  }
  const above: R = { ...A, v0: mount ? mount.y + mount.h / 2 + 4 : -hy * 0.2 }
  if (tv) {
    // ---- a TV: power board, the main board with its chip under a heat sink, and the timing board feeding the panel
    const zb = z0 + so
    const io = s.io ?? []
    // how much it draws follows the size of the screen and what lights it: there is no row for it under Internals
    const watts = Math.round((areaM2 * (lit === 0 ? (zones ? 150 : 110) : lit === 1 ? 130 : 95) * (s.refresh >= 120 ? 1.1 : 1) + 30 + (sound.quality ?? 0) * 40) / 5) * 5
    const psu = L.fit(A, cw * 0.22, ch * 0.4, [0.08, 0.6])
    if (psu) L.add('psu', 'psu', psu, zb, Math.min(tall - so, 18), { label: 'Power supply board', figure: `${watts} W`, note: 'Sized from the screen area, the panel type and the speakers.', v: 1, n: watts })
    const board = ioBoard ?? L.fit(A, cw * 0.22, ch * 0.4, [0.8, 0.5])
    if (board && !ioBoard) L.add('board', 'board', board, zb, bt, { v: 0, label: 'Main board' })
    if (board) {
      const obs = g.out.filter((c) => c.kind === 'port' && c.zone === 'main').map((c) => R4(L.f.at(c.box.c)[0], L.f.at(c.box.c)[1], c.box.s[0], c.box.s[1]))
      const items: Item[] = [{ id: 'heatsink', kind: 'heatsink', su: Math.max(46, cw * 0.06), sv: Math.max(46, cw * 0.06), dz: 2, sw: Math.max(1, Math.min(tall - so - bt - 2.4, 10)), at: [0.3, 0.8], o: { label: 'Heat sink', specs: ['chip'], v: 0 } }]
      if (io.includes('aerial')) items.push({ id: 'tuner', kind: 'shield', su: 40, sv: 26, sw: Math.min(7, tall - so - bt - 0.4), at: [0.9, 0.9], o: { label: 'Tuner can', specs: ['io:aerial'], v: 2 } })
      for (const [id, label] of [['vrr', 'Game-mode video chip'], ['earc', 'Audio return chip'], ['voice', 'Voice processor'], ['ambient', 'Light sensor hub']] as const) {
        if (io.includes(id)) items.push({ id, kind: 'mem', su: 14, sv: 14, sw: 1.6, at: [id === 'vrr' ? 0.1 : id === 'earc' ? 0.4 : id === 'voice' ? 0.7 : 0.95, 0.1], o: { label, specs: [`io:${id}`], v: 2, text: id.toUpperCase() } })
      }
      const placed = populate(L, [board], zb + bt, items, obs)
      const hs = placed.get('heatsink')
      if (hs) L.add('chip', 'chip', grow(hs, -rw(hs) * 0.28), zb + bt, 1.8, { specs: ['chip'], label: g.chip.name, figure: 'Picture processor', v: s.chipTier, text: g.chip.name }, false)
    }
    // the timing controller sits under the top edge and feeds the panel through flat ribbons fanned out along it
    const upfire = si === 3
    const tcon = L.fit({ ...A, v0: hy * 0.3, v1: A.v1 - ch * 0.07 }, cw * 0.2, ch * 0.09, [0.5, 1])
    if (tcon) {
      L.add('tcon', 'board', tcon, zb, bt, { v: 2, label: 'Timing controller', figure: `${panelName(d.type, s.panel)}, ${s.refresh} Hz`, specs: ['panel', 'refresh'] })
      const lanes = clamp(Math.round(b.width / 420) * (s.refresh >= 120 ? 2 : 1), 2, 8)
      const spread = upfire ? cw * 0.13 : Math.min(cw * 0.34, lanes * 95)
      const fw = Math.min(26, (rw(tcon) / lanes) * 0.7)
      for (let i = 0; i < lanes; i++) {
        const k = (i + 0.5) / lanes - 0.5
        const from: [number, number] = [mid(tcon)[0] + k * rw(tcon) * 0.9, tcon.v1 - 2]
        const to: [number, number] = [mid(tcon)[0] + k * 2 * spread, A.v1 - 1]
        L.add(`pflex${i}`, 'flex', join([R4(from[0], from[1], fw, 1), R4(to[0], to[1], fw, 1)])!, zb + bt, 0.5, { label: 'Panel ribbon', figure: `one of ${lanes}`, note: 'A wider or faster panel is fed through more ribbons.', specs: ['panel', 'refresh'], over: true, v: 4, n: fw, path: [L.f.point(from[0], from[1], zb + bt + 0.25), L.f.point(to[0], to[1], zb + bt + 0.25)] }, false)
      }
    }
    // an LCD's lamps have a driver board of their own; a panel that lights itself has none
    const ledDrv = lit === 0 ? L.fit({ ...A, v0: -hy * 0.5, v1: hy * 0.4 }, cw * 0.1, ch * 0.2, [0.42, 0.3]) : null
    if (ledDrv) L.add('leddrv', 'board', ledDrv, zb, bt, { v: 1, label: 'LED driver board', figure: zones ? `${zones} zones` : 'two strips', specs: ['panel'] })
    // wireless: a small module near the bottom edge with a lead to an aerial in each lower corner
    const wifi = L.fit({ ...A, v1: -hy * 0.3 }, 44, 30, [0.62, 0.35])
    if (wifi) L.add('wifi', 'board', wifi, zb, bt, { v: 4, label: 'Wi-Fi and Bluetooth module' })
    const aerials: R[] = []
    for (const [i, sx] of [-1, 1].entries()) {
      const r = L.fit({ ...A, v1: A.v0 + 70 }, 34, 9, [sx < 0 ? 0 : 1, 0.9])
      if (r && wifi) {
        L.add(`ant${i}`, 'antenna', r, z0, Math.min(tall, 1.2), { label: 'Wi-Fi aerial', v: 2 })
        aerials.push(r)
      }
    }
    // the remote receiver, the status lamp and the key look out under the bottom edge
    const front = L.fit({ ...A, v1: A.v0 + 20 }, 46, 11, [0.5, 0])
    if (front) L.add('keys', 'board', front, zb, bt, { v: 1, label: io.includes('ambient') ? 'Remote receiver, key and light sensor' : 'Remote receiver and key board', specs: io.includes('ambient') ? ['io:ambient'] : [] })
    const voice = io.includes('voice') ? L.fit({ ...A, v1: A.v0 + 20 }, 70, 8, [0.36, 0]) : null
    if (voice) L.add('voicemics', 'mic', voice, zb, Math.min(tall - so, 3), { label: 'Far-field microphones', specs: ['io:voice'], n: 4, v: 1 })
    // ---- the looms: laid on the chassis, turning to keep clear of the boards, held down by clips
    const avoid = [...L.taken]
    const cw0 = z0 + 0.05
    const thick = clamp(tall * 0.22, 0.8, 4.5)
    if (psu && board) loom(L, 'cable1', psu, board, cw0, thick, { label: 'Power harness', figure: 'to the main board' }, avoid)
    if (psu && tcon) loom(L, 'cable0', psu, tcon, cw0, thick, { label: 'Power harness', figure: 'to the timing controller' }, avoid)
    if (psu && ledDrv) loom(L, 'cable2', psu, ledDrv, cw0, thick, { label: 'Backlight power', specs: ['panel'] }, avoid)
    if (board && tcon) loom(L, 'lvds', board, tcon, cw0, Math.min(thick, 1), { label: 'Panel data cable', figure: `${s.refresh} Hz video`, specs: ['refresh'], v: 2, n: 22 }, avoid)
    if (board && wifi) loom(L, 'wificable', wifi, board, cw0, Math.min(thick, 1), { label: 'Wireless module cable', v: 2, n: 10 }, avoid)
    if (wifi) aerials.forEach((r, i) => loom(L, `antlead${i}`, wifi, r, cw0, Math.min(thick, 1.1), { label: 'Aerial lead', v: 4 }, avoid))
    if (board && front) loom(L, 'keycable', front, board, cw0, Math.min(thick, 1.2), { label: 'Front panel cable', v: 3 }, avoid)
    if (board && voice) loom(L, 'miccable', voice, board, cw0, Math.min(thick, 1.2), { label: 'Microphone cable', specs: ['io:voice'], v: 3 }, avoid)
    for (const c of g.out.filter((x) => x.zone === 'main' && (x.kind === 'speaker' || x.id === 'woofer' || x.id.startsWith('exciter')))) {
      const at = L.f.at(c.box.c)
      const r = R4(at[0], at[1], c.box.s[0], c.box.s[1])
      if (board) loom(L, `lead:${c.id}`, r, board, cw0, Math.min(thick, 2.2), { label: 'Speaker lead', figure: sound.name, specs: ['speakers'], v: 3 }, avoid)
    }
  } else {
    // ---- an all-in-one: motherboard with its cooler, a graphics card, a power supply and a drive
    const gpu = s.gpu ?? 0
    const cool = s.cooling ?? 0
    const cooler = COOLERS[cool] ?? COOLERS[0]
    const k = clamp(cw / 520, 0.8, 1.4)
    const board = L.fit(above, cw * 0.4, rh(above) * 0.86, [0.22, 0.6])
    let cpu: R | undefined
    if (board) {
      L.add('board', 'board', board, z0, bt, { v: 0, label: 'Motherboard' })
      const top = z0 + bt
      const hsT = Math.max(1, Math.min(tall - bt - 3, 26))
      const items: Item[] = [{ id: 'heatsink', kind: cool === 3 ? 'pump' : 'heatsink', su: (cool === 3 ? 44 : 78) * k, sv: (cool === 3 ? 44 : 66) * k, dz: 3.1, sw: Math.max(1, (cool === 3 ? Math.min(hsT, 16) : hsT) - 3.1), at: [0.42, 0.62], o: { label: cool === 3 ? 'Pump block' : cool === 2 ? 'Vapour-chamber cooler' : 'Heat sink', figure: cooler.name, specs: ['cooling'], v: cool } }]
      const fans = cool === 0 ? 1 : cool === 3 ? 0 : 2
      for (let i = 0; i < fans; i++) items.push({ id: `fan${i}`, kind: 'fan', su: 62 * k, sv: 62 * k, sw: Math.min(tall - bt - 0.4, 22), at: [0.05 + i * 0.9, 0.9], o: { label: 'Blower fan', figure: cooler.name, specs: ['cooling'], axis: 2, v: 1 } })
      const sticks = s.ram >= 32 ? 4 : 2
      for (let i = 0; i < sticks; i++) items.push({ id: `ram${i}`, kind: 'stick', su: 9, sv: 70 * Math.min(1, k), sw: Math.min(tall - bt - 0.4, 20), at: [0.82 + i * 0.05, 0.4], o: { specs: ['ram'], label: 'Memory module', figure: `${s.ram} GB`, v: 2, text: `${s.ram / sticks} GB` } })
      items.push({ id: 'ssd0', kind: 'stick', su: 72, sv: 20, sw: 2.6, at: [0.3, 0.05], o: { specs: ['storage'], label: 'Solid-state drive', figure: storageLabel(s.storage), v: 1, text: storageLabel(Math.min(s.storage, 1024)) } })
      const placed = populate(L, [board], top, items, [])
      cpu = placed.get('heatsink')
      if (cpu) {
        L.add('chip', 'chip', grow(cpu, -rw(cpu) * (cool === 3 ? 0.14 : 0.3)), top, 2, { specs: ['chip'], label: g.chip.name, figure: 'Processor', v: s.chipTier, text: g.chip.name }, false)
        if (cool === 2) L.add('thermal', 'sheet', grow(cpu, 5), top + 2.05, 0.9, { label: 'Vapour chamber', figure: cooler.name, specs: ['cooling'], v: 1, over: true }, false)
        let n = 0
        for (const id of ['fan0', 'fan1']) {
          const fr = placed.get(id)
          if (fr) run(L, `pipe${n++}`, 'pipe', mid(cpu), mid(fr), top + 3.2, 4, { label: 'Heat pipe', figure: cooler.name, specs: ['cooling'] }, n % 2 === 0)
        }
      }
    }
    if (cool === 3) {
      // a liquid loop: the radiator and its fans sit apart, joined to the pump by two hoses
      const rad = L.fit(above, cw * 0.3, Math.min(ch * 0.2, 90), [0.95, 1])
      if (rad) {
        L.add('radiator', 'heatsink', rad, z0, Math.min(tall, 24), { label: 'Radiator and fans', figure: cooler.name, specs: ['cooling'], v: 3, n: 2 })
        if (cpu) for (const [i, o] of [-6, 6].entries()) run(L, `hose${i}`, 'cable', [mid(cpu)[0] + o, mid(cpu)[1]], [mid(rad)[0] + o, mid(rad)[1]], z0 + bt + 18, 5, { label: 'Coolant hose', figure: cooler.name, specs: ['cooling'], v: 1 }, i === 0)
      }
    }
    if (gpu) {
      const card = L.fit(above, cw * [0, 0.27, 0.34, 0.42][gpu], ch * [0, 0.2, 0.24, 0.28][gpu], [0.95, 0.35])
      if (card) L.add('gpu', 'card', card, z0, Math.min(tall, 14 + 6 * gpu), { label: GPUS[gpu].name, figure: `${GPUS[gpu].drain} W`, specs: ['gpu'], v: gpu, n: gpu, fits: !(g.thin && GPUS[gpu].thick > 0) })
    }
    const psu = L.fit({ ...A, v1: above.v0 + ch * 0.2 }, cw * 0.26, ch * 0.16, [0.12, 0.6])
    if (psu) L.add('psu', 'psu', psu, z0, Math.min(tall, 36), { label: 'Power supply', figure: `${Math.round((g.chip.watts * (T.heat ?? 1) + GPUS[gpu].drain) * 1.4 + 60)} W`, v: 0 })
    if (s.storage >= 2048) {
      const bay = L.fit({ ...A, v1: above.v0 + ch * 0.2 }, 102, 72, [0.88, 0.6])
      if (bay) L.add('drive', 'drive', bay, z0, Math.min(tall, 10), { label: 'Drive bay', figure: storageLabel(s.storage), specs: ['storage'], v: 0 })
    }
    const boardC = g.out.find((c) => c.id === 'board')
    const gpuC = g.out.find((c) => c.id === 'gpu')
    if (psu && boardC) run(L, 'cable0', 'cable', mid(psu), [L.f.at(boardC.box.c)[0], L.f.at(boardC.box.c)[1] - boardC.box.s[1] * 0.42], z0 + tall * 0.6, 4, { label: 'Power harness' })
    if (psu && gpuC) run(L, 'cable1', 'cable', [mid(psu)[0] + 10, mid(psu)[1]], [L.f.at(gpuC.box.c)[0], L.f.at(gpuC.box.c)[1] - gpuC.box.s[1] * 0.45], z0 + tall * 0.6, 4, { label: 'Graphics power', specs: ['gpu'] }, false)
  }
  // pulled apart, it comes away in three sheets: the panel and what lights it, the chassis, and everything bolted to that
  for (const c of g.out) if (c.zone === 'main' && c.id !== 'backlight' && c.id !== 'chassis') c.layer = c.kind === 'heatsink' || c.kind === 'pump' || c.kind === 'pipe' || c.id.startsWith('hose') ? 3 : 2
  const bev = edgeBevel(b)
  display(g, 0, 0, b.width - 2 * bev - 0.4, b.height - 2 * bev - 0.4, b.thickness / 2 - dm.disp / 2, dm.disp)
}

// ---------------------------------------------------------------- console

function layoutConsole(g: Gen) {
  const { b, d, s, T } = g
  const tower = b.height > b.width
  const wall = 3
  const ins = wall + 0.2929 * Math.max(0, b.corner - wall)
  // a flat box opens at the top, a tower at its right-hand side; `a` runs across the plan and `q` towards the rear
  const hw = (tower ? b.height : b.width) / 2 - ins
  const hq = b.thickness / 2 - wall - 1.5
  const D = (tower ? b.width : b.height) - 2 * ins
  const f = tower ? new Frame([-b.width / 2 + ins, 0, 0], -3, 2, 1) : new Frame([0, -b.height / 2 + ins, 0], 1, -3, 2)
  const P = (a0: number, q0: number, a1: number, q1: number): R => (tower ? { u0: q0, v0: a0, u1: q1, v1: a1 } : { u0: a0, v0: q0, u1: a1, v1: q1 })
  const A = P(-hw, -hq, hw, hq)
  const zone = f.box(A, 0, D)
  g.zones.push({ id: 'main', anchor: 'body', box: zone, up: tower ? 1 : 2, cut: tower ? { axis: 0, at: b.width / 2 - ins, side: 1 } : { axis: 1, at: b.height / 2 - ins, side: 1 }, wall })
  const L = new Lay(g.out, 'main', f, A, D)
  const aq = (p: V3): [number, number, number] => {
    const [u, v, w] = f.at(p)
    return tower ? [v, u, w] : [u, v, w]
  }
  const io = s.io ?? []
  const base = Math.min(4, D * 0.06)
  const bt = 1.6
  const top = base + bt
  // ---- fixed by the outside: the exhaust fans in the rear panel, the disc slot, the sockets
  const cool = s.cooling ?? 0
  const cooler = COOLERS[cool] ?? COOLERS[0]
  const fanDeep = Math.min(24, hq * 0.3)
  consoleFans(b, cool).forEach((fan, i) => {
    const [a, , w] = aq([-fan.x, fan.y, -b.thickness / 2])
    const r = keep(P(a - fan.r, hq - fanDeep, a + fan.r, hq), A)
    L.add(`fan${i}`, 'fan', r, clamp(w - fan.r, 0.4, Math.max(0.4, D - 2 * fan.r - 0.2)), Math.min(2 * fan.r, D - 0.6), { label: 'Exhaust fan', figure: cooler.name, specs: ['cooling'], axis: tower ? 0 : 1, v: 0 })
  })
  let drive: R | null = null
  let driveLow = 0
  for (const p of d.parts) {
    const [a, q, w] = aq(partPoint(d, p))
    if (p.kind === 'slot') {
      const turned = Math.abs(((p.rot % 180) + 180) % 180 - 90) < 1
      // the drive lies behind its slot, flat or on edge as the slot runs
      const flatways = turned === tower
      const span = Math.min(132, 2 * hw - 2)
      const deep = Math.min(128, 2 * hq * 0.66)
      drive = keep(flatways ? P(a - span / 2, -hq, a + span / 2, -hq + deep) : P(a - 9, -hq, a + 9, -hq + deep), A)
      const th = flatways ? 17 : Math.min(span, D - 1)
      driveLow = clamp(w - th / 2, 0.4, Math.max(0.4, D - th - 0.2))
      L.add('drive', 'drive', drive, driveLow, Math.min(th, D - 0.6), { partId: p.id, label: 'Disc drive', specs: ['io:disc'], v: 1 })
    } else if (p.kind === 'port' && (p.face === 'front' || p.face === 'back')) {
      const frontal = p.face === 'front'
      const half = (tower && Math.abs(((p.rot % 180) + 180) % 180 - 90) < 1 ? p.h : p.w) / 2 + 1
      const r = keep(P(a - half, frontal ? -hq : hq - 11, a + half, frontal ? -hq + 11 : hq), A)
      if (L.taken.some((t) => hit(t, r, 0.3))) continue
      const info = p.text ? ioInfo('console', p.text) : undefined
      const th = Math.min(p.h + 2, D - 1)
      L.add(`port:${p.id}`, 'port', r, clamp(w - th / 2, 0.4, Math.max(0.4, D - th - 0.2)), th, { partId: p.id, label: info?.name ?? (p.text === 'power' ? 'Power inlet' : p.text === 'hdmi' ? 'Video output' : 'Socket'), figure: p.text === 'hdmi' ? panelName('console', s.panel) : undefined, specs: info ? [`io:${p.text}`] : p.text === 'hdmi' ? ['panel', 'refresh'] : [] })
    }
    void q
  }
  // ---- the power supply in a rear corner
  // sizes are given across and front to back; a tower's plan has those the other way round
  const sz = (across: number, deep: number): [number, number] => (tower ? [deep, across] : [across, deep])
  const psu = L.fit(P(-hw, 0, hw, hq - fanDeep - 2), ...sz(2 * hw * 0.3, 2 * hq * 0.4), tower ? [1, 0] : [0, 1])
  const gpu = T.gpu ? (s.gpu ?? 0) : 0
  if (psu) L.add('psu', 'psu', psu, base, Math.min(D - base - 1, 58), { label: 'Power supply', figure: `${Math.round((g.chip.watts * (T.heat ?? 1) + GPUS[gpu].drain) * 1.3 + 40)} W`, v: 0 })
  // ---- the board runs under the drive; the chip, its heat sink and the memory stand clear of it
  const under = drive && driveLow > top + 4
  const board = L.fit(A, ...sz(2 * hw * 0.64, 2 * hq * 0.66), tower ? [0.7, 0.4] : [0.8, 0.62], L.taken.filter((r) => !(under && r === drive)))
  if (board) {
    L.add('board', 'board', board, base, bt, { v: 2, label: 'Main board' }, false)
    const obs = L.taken.filter((r) => hit(r, board))
    const hsT = Math.max(2, Math.min(D - top - 3.4, 46))
    const k = clamp(Math.min(rw(board), rh(board)) / 150, 0.6, 1.3)
    const items: Item[] = [{ id: 'heatsink', kind: cool === 3 ? 'pump' : 'heatsink', su: (cool === 3 ? 52 : 84) * k, sv: (cool === 3 ? 52 : 76) * k, dz: 3.4, sw: Math.max(1, (cool === 3 ? Math.min(hsT, 18) : hsT) - 3.4), at: [0.5, 0.6], o: { label: cool === 3 ? 'Liquid-metal pump block' : cool === 2 ? 'Vapour-chamber heat sink' : 'Heat sink', figure: cooler.name, specs: ['cooling'], v: cool } }]
    const rams = clamp(Math.round(s.ram / 8), 2, 8)
    for (let i = 0; i < rams; i++) items.push({ id: `ram${i}`, kind: 'mem', su: 13 * k, sv: 10 * k, sw: 1.4, at: [0.1 + (i % 4) * 0.27, i < 4 ? 0.02 : 0.98], o: { specs: ['ram'], label: 'Memory', figure: `${s.ram} GB`, v: 0, text: `${Math.round(s.ram / rams)}G` } })
    items.push({ id: 'ssd0', kind: 'stick', su: 72 * Math.min(1, k), sv: 20, sw: 2.6, at: [0.02, 0.5], o: { specs: ['storage'], label: 'Solid-state drive', figure: storageLabel(s.storage), v: 1, text: storageLabel(s.storage) } })
    if (io.includes('wifi')) items.push({ id: 'wifi', kind: 'shield', su: 26 * k, sv: 18 * k, sw: 3, at: [0.98, 0.1], o: { label: 'Fast wireless module', specs: ['io:wifi'] } })
    if (io.includes('stream')) items.push({ id: 'stream', kind: 'mem', su: 14 * k, sv: 14 * k, sw: 1.6, at: [0.98, 0.9], o: { label: 'Streaming chip', specs: ['io:stream'], v: 2, text: 'STRM' } })
    if (io.includes('expand')) items.push({ id: 'expand', kind: 'stick', su: 50 * Math.min(1, k), sv: 20, sw: 3, at: [0.5, 0.02], o: { label: 'Storage expansion bay', specs: ['io:expand'], v: 3 } })
    const placed = populate(L, [board], top, items, obs)
    const hs = placed.get('heatsink')
    if (hs) {
      const share = gpu >= 2 ? 0.2 : 0.3
      const chipR = gpu >= 2 ? { ...grow(hs, -rw(hs) * share), u1: mid(hs)[0] - 2 } : grow(hs, -rw(hs) * share)
      L.add('chip', 'chip', chipR, top, 2.2, { specs: ['chip'], label: g.chip.name, figure: 'Processor', v: s.chipTier, text: g.chip.name }, false)
      if (gpu >= 2) L.add('gpu', 'chip', { ...grow(hs, -rw(hs) * share), u0: mid(hs)[0] + 2 }, top, 2.2, { specs: ['gpu'], label: GPUS[gpu].name, figure: 'Graphics chip', v: 3, text: `GFX ${gpu}`, fits: !(g.thin && GPUS[gpu].thick > 0) }, false)
      else if (gpu === 1) L.out[L.out.length - 1].specs = ['chip', 'gpu']
      if (cool >= 2) L.add('thermal', 'sheet', grow(hs, 4), top + 2.25, 1, { label: 'Vapour chamber', figure: cooler.name, specs: ['cooling'], v: 1, over: true }, false)
      // heat pipes from the block to the fans at the back
      const fansC = g.out.filter((c) => c.kind === 'fan')
      fansC.slice(0, cool === 0 ? 1 : 2).forEach((fc, i) => {
        const [fu, fv] = f.at(fc.box.c)
        const [a, q] = tower ? [fv, fu] : [fu, fv]
        const from = tower ? [mid(hs)[1], mid(hs)[0]] : mid(hs)
        const pa = P(from[0], from[1], from[0], from[1])
        const pb = P(a, q - fanDeep / 2 - 3, a, q - fanDeep / 2 - 3)
        run(L, `pipe${i}`, cool === 3 ? 'cable' : 'pipe', [pa.u0, pa.v0], [pb.u0, pb.v0], top + 3.4, Math.min(5, D * 0.08), { label: cool === 3 ? 'Coolant hose' : 'Heat pipe', figure: cooler.name, specs: ['cooling'], v: cool === 3 ? 1 : 0 }, tower ? i % 2 === 1 : i % 2 === 0)
      })
    }
  }
  const boardC = g.out.find((c) => c.id === 'board')
  if (psu && boardC) run(L, 'cable0', 'cable', mid(psu), [f.at(boardC.box.c)[0], f.at(boardC.box.c)[1]], base + 12 > D - 4 ? D * 0.5 : base + 12, 4, { label: 'Power harness' })
}

// ---------------------------------------------------------------- earbuds

function layoutEarbuds(g: Gen) {
  const { b, d, s } = g
  const cs = caseShape(b)
  const wall = 2
  const hx = b.width / 2 - wall - 0.2929 * Math.max(0, cs.foot - wall)
  const hz = b.thickness / 2 - wall
  const y0 = -cs.shell / 2 + wall + cs.bevel * 0.35
  const y1 = cs.shell / 2 - 0.8
  const D = Math.max(4, y1 - y0)
  const f = new Frame([0, y0, 0], 1, -3, 2)
  const A: R = { u0: -hx, v0: -hz, u1: hx, v1: hz }
  // the whole of the inside lifts out of the shell on its frame
  g.zones.push({ id: 'main', anchor: 'body', box: f.box(A, 0, D), up: 2, wall })
  g.zones.push({ id: 'body', anchor: 'body', box: { c: [0, 0, 0], s: [b.width, cs.shell, b.thickness] }, up: 2, wall })
  const L = new Lay(g.out, 'main', f, A, D)
  const bt = 0.7
  L.add('board', 'board', grow(A, -0.6), 0.2, bt, { v: 1, label: 'Charging board', specs: ['charging'], figure: `${chargeWatts('earbuds', s.charging)} W` }, false)
  const top = 0.2 + bt
  const port = d.parts.find((p) => p.kind === 'port')
  const low = L.tier()
  if (port) {
    const [u, v] = f.at(partPoint(d, port))
    const r = keep(port.face === 'bottom' ? R4(u, v, 9.4, 7) : R4(u, hz - 3.5, 9.4, 7), A)
    low.add(`port:${port.id}`, 'port', r, top, 3.2, { partId: port.id, label: 'Charging port', figure: `${chargeWatts('earbuds', s.charging)} W`, specs: ['charging'] })
  }
  const chipR = low.fit(A, 5, 5, [0.9, 0.2])
  if (chipR) low.add('chip', 'chip', chipR, top, 0.9, { specs: ['chip'], label: g.chip.name, figure: 'Audio chip', v: s.chipTier, text: g.chip.name })
  // ---- the two cups the buds sit in, with the cell under them
  const headR = b.buds === 'bean' ? 8.4 : 7.6
  const wx = Math.min(Math.max(b.width * 0.24, headR + 1.2), b.width / 2 - headR - 0.6)
  const cupR = Math.min(headR * 0.9, hz - 2.4, hx - wx)
  const cupD = Math.min(D * 0.42, headR * 1.3)
  for (const sx of [-1, 1]) L.add(`well${sx < 0 ? 'L' : 'R'}`, 'well', R4(sx * wx, 0, 2 * cupR, 2 * cupR), D - cupD, cupD, { label: 'Bud cradle', figure: 'charging pins', specs: ['charging'], axis: 2 }, false)
  const zb = top + 3.4
  const tMax = Math.max(0.6, D - cupD - zb - 0.3)
  cell(g, L, 'battery', R4(0, 0, 2 * hx * 0.74, 2 * hz * 0.7), zb, tMax)
  if (s.extras.includes('wireless')) {
    const dia = Math.min(D * 0.62, 2 * hx * 0.5)
    L.add('coil', 'coil', R4(0, hz - 0.5, dia, 0.7), Math.min(top + 0.4, D - dia), dia, { label: 'Wireless charging coil', specs: ['extra:wireless'], axis: 1, v: 0 }, false)
  }
  for (const p of d.parts) {
    if (p.kind !== 'light' && p.kind !== 'button') continue
    const [u, v, w] = f.at(partPoint(d, p))
    const r = keep(R4(u, v > 0 ? hz - 0.5 : -hz + 0.5, 3, 0.8), A)
    L.add(`key:${p.id}`, p.kind === 'light' ? 'led' : 'control', r, clamp(w - 1.2, 0.2, D - 2.6), 2.4, { partId: p.id, label: p.kind === 'light' ? 'Status LED' : 'Pairing switch', over: true, v: 4 }, false)
  }
  // ---- one bud, taken apart on the desk: driver, board, cell, in a column
  const driver = DRIVERS[s.driver ?? 0] ?? DRIVERS[0]
  const anc = ANC[s.anc ?? 0] ?? ANC[0]
  const dv = s.driver ?? 0
  const dia = [6, 10, 10, 8.5, 10.5, 9.5][dv] ?? 8
  // the loose bud is split where it lies, outer face down: the half that faces out stays on the desk, what was inside
  // rises out of it in order, and the half with the nozzle and the ear tip comes off the top. Across runs along the
  // stem, and up is the way the ear tip points, so this is the bud's own shape and not a stand-in for it.
  const bean = b.buds === 'bean'
  const fb = new Frame([0, 0, 0], 1, -3, 2)
  const hr = bean ? 8.4 : 7.6
  const halfW = bean ? hr * 1.12 : hr
  const halfV = bean ? hr * 0.92 : hr * 0.95
  const deep = hr * (bean ? 0.7 : 0.86)
  const stemEnd = bean ? halfW : 22.4
  const lo = -deep - 0.1
  const hi = bean ? 10.6 : 12.4
  const BA: R = { u0: -halfW - 0.2, v0: -halfV - 0.2, u1: stemEnd + 0.2, v1: halfV + 0.2 }
  g.zones.push({ id: 'bud', anchor: 'bud', box: fb.box(BA, lo, hi - lo), up: 2, wall: 1 })
  const B = new Lay(g.out, 'bud', new Frame([0, lo, 0], 1, -3, 2), BA, hi - lo)
  const at = (w: number) => w - lo
  const mics = [0, 1, 2, 2, 3, 3][s.anc ?? 0] ?? 0
  const feats = (s.io ?? []).filter((id) => ['touch', 'ear', 'pulse', 'find'].includes(id))
  B.add('budcap', 'plate', { ...BA }, at(lo), -lo, { label: 'Outer shell', figure: bean ? 'bean, touch surface outermost' : 'with stem', v: 8, layer: 0, over: true }, false)
  if (feats.length) B.add('budsense', 'sensor', R4(0, 0, 7, 7), at(-deep + 1.1), 0.4, { label: 'Touch and wear sensors', specs: feats.map((id) => `io:${id}`), n: feats.length, v: 2, layer: 1 }, false)
  B.add('budcell', 'battery', R4(0, 0, bean ? 9.5 : 8, bean ? 9.5 : 8), at(-deep + 1.7), Math.max(1.6, deep - 3), { label: 'Bud cell', figure: bean ? 'coin cell' : 'coin cell behind the driver', specs: ['battery'], axis: 2, v: 1, layer: 1 }, false)
  // a stem carries the microphones and the charging contacts on a strip of its own; a bean has them on the round board
  if (!bean) B.add('stemboard', 'board', { u0: 5.2, u1: 21, v0: -1.5, v1: 1.5 }, at(-2.1), 0.5, { label: 'Stem board', figure: mics ? `${mics} microphone${mics > 1 ? 's' : ''} and the charging contacts` : 'charging contacts', specs: ['anc'], v: 5, n: mics, layer: 1 }, false)
  B.add('budboard', 'board', R4(0, 0, 9, 9), at(-0.9), 0.6, { label: 'Bud board', figure: anc.name, specs: ['anc'], v: 1, n: bean ? mics : 0, layer: 2 }, false)
  if (s.anc) B.add('ancchip', 'mem', R4(-1.6, 0, 3.6, 3.6), at(-0.3), 0.6, { label: 'Noise-cancelling chip', figure: anc.name, specs: ['anc'], v: 2, text: 'ANC', layer: 2 }, false)
  B.add('driver', 'driver', R4(0, 0, dia, dia), at(0.9), 3.4, { label: `${driver.name} driver`, figure: 'in each bud', specs: ['driver'], axis: 2, v: 10 + dv, n: dv === 3 ? 2 : 1, layer: 3 }, false)
  B.add('budtip', 'plate', { u0: -halfW - 0.2, u1: halfW + 0.2, v0: BA.v0, v1: BA.v1 }, at(0), hi, { label: 'Inner shell, nozzle and ear tip', figure: 'the half that sits in the ear', v: 9, layer: 4, over: true }, false)
}

// ---------------------------------------------------------------- headset

function layoutHeadset(g: Gen) {
  const { b, d, s } = g
  const vz = visorShape(b)
  const wall = 3
  const ins = wall + 0.2929 * Math.max(0, Math.max(b.corner, vz.bevel) - wall)
  const hx = b.width / 2 - ins
  const hy = b.height / 2 - ins
  const cover = Math.max(3, vz.bevel + 1)
  const zf = -b.thickness / 2 + wall
  const D = Math.max(6, b.thickness - wall - cover)
  const f = new Frame([0, 0, zf], 1, 2, 3)
  const A: R = { u0: -hx, v0: -hy, u1: hx, v1: hy }
  g.zones.push({ id: 'main', anchor: 'body', box: f.box(A, 0, D), up: 3, cut: { axis: 2, at: b.thickness / 2 - cover, side: 1 }, wall })
  const optics = OPTICS[s.optics ?? 0] ?? OPTICS[0]
  const eyes = headsetEyes(b, s.optics ?? 0)
  const io = s.io ?? []
  // ---- nearest the face: the two lens barrels with a display behind each
  const barrel = Math.min(D * 0.55, 7 + optics.depth)
  const lensFits = !g.thin
  const L = new Lay(g.out, 'main', f, A, D)
  const lr = Math.max(4, Math.min(eyes.lr, hy - 1, hx - eyes.apart - 0.5))
  for (const sx of [-1, 1]) {
    const tag = sx < 0 ? 'L' : 'R'
    L.add(`lens${tag}`, 'lens', R4(sx * eyes.apart, 0, 2 * lr, 2 * lr), 0.2, barrel, { label: optics.name, figure: optics.depth ? `needs ${optics.depth} mm of depth` : 'flat waveguide', specs: ['optics'], v: s.optics ?? 0, axis: 2, fits: lensFits, layer: 0, back: 3 }, false)
    L.add(`panel${tag}`, 'display', R4(sx * eyes.apart, 0, 2 * lr * 0.92, 2 * lr * 0.82), 0.2 + barrel + 0.2, 1.4, { label: 'Display', figure: `${panelName('headset', s.panel)}, ${s.refresh} Hz`, specs: ['panel', 'refresh'], v: s.panel, layer: 1, back: 2 }, false)
    if (io.includes('eyes')) L.add(`eye${tag}`, 'sensor', R4(sx * eyes.apart, 0, 2 * lr + 3, 2 * lr + 3), 0.05, 0.14, { label: 'Eye-tracking ring', specs: ['io:eyes'], v: 3, over: true, layer: 0, back: 4 }, false)
  }
  if (io.includes('ipd')) L.add('ipd', 'motor', R4(0, hy * 0.5, Math.min(2 * (eyes.apart - lr) - 1, 16), 6), 0.4, Math.min(barrel - 0.4, 6), { label: 'Lens spacing motor', specs: ['io:ipd'], v: 2, layer: 0, back: 1 }, false)
  // ---- in front of those: the board, its fan and the cells; and against the front plate, the cameras
  const zo = 0.2 + barrel + 1.8
  const camT = Math.min(7, D * 0.14)
  const he = Math.max(1.5, D - zo - camT - 0.6)
  const E = L.tier()
  for (const p of d.parts) {
    if (p.kind !== 'port') continue
    const [u, v, w] = f.at(partPoint(d, p))
    const r = keep(R4(u, v < 0 ? -hy + 5 : hy - 5, p.w + 2, 10), A)
    const info = p.text ? ioInfo('headset', p.text) : undefined
    E.add(`port:${p.id}`, 'port', r, clamp(w - 2, zo, zo + he - 4), Math.min(4, he), { partId: p.id, label: info?.name ?? 'Charging port', figure: info ? undefined : `${chargeWatts('headset', s.charging)} W`, specs: info ? [`io:${p.text}`] : ['charging'] })
  }
  const bt = Math.min(1.2, he * 0.12)
  const board = E.fit({ ...A, v0: -hy * 0.2 }, 2 * hx * 0.5, hy * 0.95, [0.5, 0.8])
  if (board) {
    E.add('board', 'board', board, zo, bt, { v: 0, label: 'Logic board' }, false)
    const tier = g.chip.custom ? 2 : s.chipTier
    const items: Item[] = [chipItem(g, [11, 13, 15][s.chipTier] ?? 13, 1, [0.5, 0.35]), ...memoryItems(g, 1.2)]
    const fans = tier >= 2 ? 2 : 1
    const fd = Math.min(rh(board) * 0.55, 30)
    for (let i = 0; i < fans; i++) items.push({ id: `fan${i}`, kind: 'fan', su: fd, sv: fd, sw: Math.min(he - bt - 0.2, 8), at: [fans === 1 ? 0.5 : i, 1], o: { label: 'Fan', figure: `${Math.round(g.chip.watts)} W of heat to shed`, note: 'A flagship processor gets a second fan: a headset has no cooling row of its own.', specs: ['chip'], axis: 2 } })
    if (io.includes('depth')) items.push({ id: 'depth', kind: 'mem', su: 8, sv: 6, sw: 1.2, at: [0.5, 0], o: { label: 'Depth sensor driver', specs: ['io:depth'], v: 2, text: 'ToF' } })
    if (io.includes('hands')) items.push({ id: 'hands', kind: 'mem', su: 7, sv: 7, sw: 1, at: [0.1, 0.5], o: { label: 'Hand-tracking processor', specs: ['io:hands'], v: 2, text: 'HAND' } })
    if (io.includes('face')) items.push({ id: 'face', kind: 'mem', su: 6, sv: 6, sw: 1, at: [0.9, 0.5], o: { label: 'Face-tracking processor', specs: ['io:face'], v: 2, text: 'FACE' } })
    populate(E, [board], zo + bt, items, [])
    E.taken.push(board)
  }
  if (io.includes('audio')) {
    for (const sx of [-1, 1]) {
      const r = E.fit({ ...A, v1: -hy * 0.2 }, 18, 9, [sx < 0 ? 0 : 1, 0])
      if (r) E.add(`spk${sx < 0 ? 0 : 1}`, 'speaker', r, zo, Math.min(he, 6), { label: 'Spatial audio speaker', specs: ['io:audio'] })
    }
  }
  const pack = headStrap(b.strap).id === 'pack'
  if (pack) {
    // the battery rides at the back of the band, in a pack of its own
    const pw = 92 - 9
    const ph = 52 - 9
    const pd = 24 - 5
    g.zones.push({ id: 'pack', anchor: 'pack', box: { c: [0, 0, 0], s: [pw, ph, pd] }, up: -3, cut: { axis: 2, at: -pd / 2, side: -1 }, wall: 2.5 })
    const PL = new Lay(g.out, 'pack', new Frame([0, 0, pd / 2], -1, 2, -3), R4(0, 0, pw, ph), pd)
    PL.add('bms', 'board', R4(0, ph / 2 - 5, pw * 0.8, 8), 0.4, 1, { v: 1, label: 'Battery management board', specs: ['battery', 'strap'] })
    const half = (pw - 3) / 2
    for (const [i, sx] of [-1, 1].entries()) cell(g, PL, `battery${i || ''}`, R4(sx * (half / 2 + 1.5), -5, half, ph - 12), 0.4, pd - 1, 0.5)
  } else {
    const room = E.largest({ ...A, v1: board ? board.v0 - 0.5 : hy })
    if (room) {
      const half = (rw(room) - 3) / 2
      if (half > 20) {
        cell(g, E, 'battery', { ...room, u1: room.u0 + half }, zo, he, 0.5)
        cell(g, E, 'battery1', { ...room, u0: room.u1 - half }, zo, he, 0.5)
      } else cell(g, E, 'battery', room, zo, he)
    }
  }
  const C = L.tier()
  for (const p of d.parts) {
    if (p.kind !== 'camera') continue
    const [u, v] = f.at(partPoint(d, p))
    const side = Math.min(p.w, p.h) + 3
    C.add(`cam:${p.id}`, 'camera', keep(R4(u, v, side, side), A), D - camT, camT - 0.2, { partId: p.id, label: 'Tracking camera', figure: sensorInfo(p.sensor ?? 0).name, specs: ['camera'], v: p.sensor ?? 0, n: 2, layer: 3 })
  }
  if (io.includes('pass')) {
    const r = C.fit({ ...A, v0: -hy * 0.3, v1: hy * 0.3 }, 12, 12, [0.5, 0.5])
    if (r) C.add('pass', 'camera', r, D - camT, camT - 0.2, { label: 'Colour passthrough camera', specs: ['io:pass'], v: 4, n: 2, layer: 3 })
  }
  if (io.includes('depth')) {
    const r = C.fit({ ...A, v0: -hy * 0.1 }, 14, 8, [0.5, 0.9])
    if (r) C.add('tof', 'sensor', r, D - camT, camT - 0.2, { label: 'Depth sensor', specs: ['io:depth'], v: 1, layer: 3 })
  }
}

// ---------------------------------------------------------------- speaker

function layoutSpeaker(g: Gen) {
  const { b, d, s } = g
  const sh = speakerShape(b)
  const wall = 5
  const hyB = b.height / 2
  const y0 = -hyB + 4
  const y1 = hyB - 4 - sh.bevel * 0.4
  const H = Math.max(10, y1 - y0)
  // how far the inside reaches sideways and front to back at a given height: an orb narrows towards its ends
  const reach = (w: number): [number, number] => {
    const y = y0 + w
    const k = sh.form === 'orb' ? Math.sqrt(Math.max(0.05, 1 - (y / sh.ry) ** 2)) : 1
    const cut = sh.form === 'block' ? 0.2929 * Math.max(0, sh.corner - wall) : 0
    const rx = (b.width / 2) * k - wall - cut
    const rz = (b.thickness / 2) * k - wall - cut
    const flat = b.thickness / 2 - Math.max(sh.backSink, sh.frontSink) - wall
    return [Math.max(4, sh.form === 'block' || whole ? rx : rx * 0.72), Math.max(4, Math.min(sh.form === 'block' || whole ? rz : rz * 0.72, whole ? rz : flat))]
  }
  let whole = false
  const span = (w0: number, sw: number, round = false): [number, number] => {
    whole = round
    const a = reach(w0)
    const c = reach(w0 + sw)
    whole = false
    return [Math.min(a[0], c[0]), Math.min(a[1], c[1])]
  }
  const all = span(0, H)
  const f = new Frame([0, y0, 0], 1, -3, 2)
  const mid0 = span(H / 2, 0, true)
  g.zones.push({ id: 'main', anchor: 'body', box: f.box({ u0: -mid0[0], v0: -mid0[1], u1: mid0[0], v1: mid0[1] }, 0, H), up: 2, wall })
  g.zones.push({ id: 'body', anchor: 'body', box: { c: [0, 0, 0], s: [b.width, b.height, b.thickness] }, up: 2, wall })
  const L = new Lay(g.out, 'main', f, { u0: -mid0[0], v0: -mid0[1], u1: mid0[0], v1: mid0[1] }, H)
  const dv = clamp(s.driver ?? 0, 0, SPEAKER_DRIVERS.length - 1)
  const drv = SPEAKER_DRIVERS[dv]
  const fits = sh.litres >= drv.litres - 1e-6
  const dp = { specs: ['driver'], figure: drv.name, fits }
  // a spine at the back keeps clear of the sockets; everything else stacks up the middle
  const spine = Math.min(11, all[1] * 0.4)
  const block = (id: string, kind: CompKind, w0: number, sw: number, ku: number, kv: number, o: Partial<Comp>, cu = 0, cv = 0) => {
    // a driver, a ring of microphones or a round board fills the circle; anything square keeps to the square inside it
    const [ru, rv] = span(w0, sw, kind === 'driver' || kind === 'mic' || kind === 'baffle' || kind === 'touch' || kind === 'ledring')
    // nothing reaches back into the strip the sockets stand in
    const back = Math.min(rv, span(w0, sw)[1]) - spine
    const su = 2 * ru * ku
    const sv = (rv + back) * kv
    return L.add(id, kind, R4(cu * ru, (back - rv) / 2 + cv * (rv + back) * 0.5, su, sv), w0, sw, o, false)
  }
  // ---- sockets, at the back
  for (const p of d.parts) {
    if (p.kind !== 'port') continue
    const [u, , w] = f.at(partPoint(d, p))
    const [, rv] = reach(clamp(w, 0, H))
    const info = p.text ? ioInfo('speaker', p.text) : undefined
    const th = Math.min(p.h + 2, 14)
    L.add(`port:${p.id}`, 'port', R4(u, rv - spine / 2, p.w + 2, Math.max(1, spine - 1)), clamp(w - th / 2, 0.2, H - th - 0.2), th, { partId: p.id, label: info?.name ?? (p.text === 'power' ? 'Power inlet' : 'Socket'), specs: info ? [`io:${p.text}`] : [] }, false)
  }
  // the sockets are soldered to a narrow board that runs up the back
  const sockets = g.out.filter((c) => c.kind === 'port' && c.zone === 'main')
  if (sockets.length) {
    const topW = Math.max(...sockets.map((c) => f.at(c.box.c)[2] + c.box.s[1] / 2))
    const [ru, rv] = span(0.4, topW + 2)
    L.add('spine', 'board', R4(0, rv - 0.45, Math.min(2 * ru * 0.8, Math.max(...sockets.map((c) => Math.abs(c.box.c[0]) + c.box.s[0] / 2)) * 2 + 6), 0.7), 0.4, Math.min(topW + 2, H - 1), { v: 1, label: 'Socket board', over: true }, false)
  }
  // ---- from the bottom up: power supply, drivers, the board, the microphones
  const hP = clamp(H * 0.13, 8, 24)
  // neither has a row of its own under Internals: both are sized for the drivers they feed
  const watts = [15, 30, 60, 100, 150][dv] ?? 30
  const channels = [1, 2, 3, 7, 4][dv] ?? 1
  const psuC = block('psu', 'psu', 0.5, hP, 0.5, 0.7, { label: 'Power supply', figure: `${watts} W from the wall`, note: 'Sized for the drivers chosen: a speaker runs from the mains and has no battery.', v: 2 }, -0.48)
  const ampC = block('amp', 'amp', 0.5, hP, 0.42, 0.7, { label: 'Amplifier board', figure: `${channels} channel${channels > 1 ? 's' : ''}, class D`, note: 'One channel for every driver it feeds.', n: channels }, 0.54)
  const topRoom = clamp(H * 0.11, 6.5, 16)
  const z0 = hP + 2
  const hd = Math.max(6, H - z0 - topRoom - 1)
  const [du, dw] = span(z0, hd)
  const side = Math.min(2 * du, dw + (dw - spine))
  // the drivers work into a chamber of their own: sealed, tuned with a port, or with passive radiators in its walls
  const tuned = dv === 1 || dv === 3
  block('chamber', 'baffle', z0 - 0.9, hd + 1.6, 1, 1, { label: dv === 2 ? 'Chamber with passive radiators' : tuned ? 'Ported chamber' : dv === 4 ? 'Sealed twin chamber' : 'Sealed chamber', figure: `${sh.litres.toFixed(2)} L enclosure`, fits, v: sh.form === 'block' ? 1 : 0, over: true, layer: 1 })
  block('wadding', 'wadding', z0 + hd * 0.12, hd * 0.5, 0.56, 0.3, { label: 'Acoustic damping', figure: 'polyester wadding', over: true }, -0.3, 0.62)
  if (tuned) block('bassport', 'duct', z0 + 0.4, Math.max(4, hd * 0.55), 0.2, 0.2, { label: 'Bass port', figure: 'tunes the chamber', over: true, axis: 2 }, 0.62, 0.6)
  if (dv === 0) {
    const dia = Math.min(side * 0.82, hd * 0.9)
    block('woofer', 'driver', z0 + (hd - dia) / 2, dia, dia / (2 * du), 0.5, { ...dp, label: 'Full-range driver', axis: 1, v: 0 }, 0, -0.5)
  } else if (dv === 4) {
    // two woofers back to back, so that they shake each other still, with a ribbon tweeter in front of each
    const dia = Math.min(hd * 0.62, (dw + dw - spine) * 0.9)
    for (const sx of [-1, 1]) block(`woofer${sx < 0 ? '' : '1'}`, 'driver', z0, dia, 0.36, dia / (dw + dw - spine), { ...dp, label: 'Force-cancelling woofer', axis: 0, v: 0 }, sx * 0.6)
    for (const sx of [-1, 1]) block(`tweeter${sx < 0 ? '' : '1'}`, 'driver', z0 + dia + 2, Math.max(4, hd - dia - 2), 0.16, 0.2, { ...dp, label: 'Ribbon tweeter', axis: 1, v: 4 }, sx * 0.5, -0.75)
  } else {
    const dia = Math.min(side * 0.8, hd * (dv === 3 ? 0.5 : 0.6))
    // the woofer fires down into the base, or up into the ring of tweeters above it
    block('woofer', 'driver', z0, Math.min(dia * 0.62, hd * 0.5), dia / (2 * du), dia / (dw + dw - spine), { ...dp, label: 'Woofer', axis: 2, v: 0 })
    const zt = z0 + Math.min(dia * 0.62, hd * 0.5) + 2
    const ht = Math.max(4, hd - (zt - z0))
    if (dv === 1) block('tweeter', 'driver', zt, Math.min(ht, 24), 0.34, 0.3, { ...dp, label: 'Tweeter', axis: 1, v: 1 }, 0, -0.7)
    if (dv === 2) {
      for (const sx of [-1, 1]) block(`tweeter${sx < 0 ? '' : '1'}`, 'driver', zt, Math.min(ht * 0.5, 22), 0.3, 0.3, { ...dp, label: 'Tweeter', axis: 1, v: 1 }, sx * 0.55, -0.7)
      for (const sx of [-1, 1]) block(`radiator${sx < 0 ? '' : '1'}`, 'radiator', zt + Math.min(ht * 0.5, 22) + 1.5, Math.max(4, ht - Math.min(ht * 0.5, 22) - 1.5), 0.1, 0.8, { ...dp, label: 'Passive radiator', axis: 0 }, sx * 0.9)
    }
    if (dv === 3) block('tweeters', 'driver', zt, Math.min(ht, 26), 1, 1, { ...dp, label: 'Ring of beam-forming tweeters', axis: 2, v: 3, n: 6 })
  }
  const zt = H - topRoom
  const mics = MIC_ARRAYS[s.mics ?? 0] ?? MIC_ARRAYS[0]
  block('board', 'board', zt, 1.2, 0.86, 0.86, { v: 0, label: 'Logic board' })
  block('chip', 'chip', zt + 1.2, 1.3, 0.3, 0.3, { specs: ['chip'], label: g.chip.name, figure: 'Processor', v: s.chipTier, text: g.chip.name })
  const feats = (s.io ?? []).filter((id) => !ioInfo('speaker', id)?.size)
  if (feats.length) block('radio', 'shield', zt + 1.2, 1.6, 0.26, 0.24, { label: 'Radio and smart-home module', specs: feats.map((id) => `io:${id}`), v: 0 }, 0.6, 0.6)
  block('mics', 'mic', H - 2.6, 1.4, 0.98, 0.98, { label: 'Microphone ring', figure: mics.name, specs: ['mics'], n: mics.count, v: sh.form === 'block' ? 1 : 0, layer: 3 })
  // under the top: the board the keys are touched through, and the lamps of the light ring round it
  const keys = d.parts.filter((p) => p.face === 'top' && p.kind === 'button')
  const ring = d.parts.find((p) => p.face === 'top' && p.kind === 'light')
  const [tu, tv] = span(H - 1.1, 1, true)
  const P = (u: number, v: number, w: number) => f.point(u, v, w)
  if (ring) {
    const [u, v] = f.at(partPoint(d, ring))
    const bar = sh.form === 'block'
    const r = bar ? keep(R4(u, v, Math.min(ring.w, 2 * tu), 3), { u0: -tu, v0: -tv, u1: tu, v1: tv }) : R4(0, 0, Math.min(ring.w, 2 * tu), Math.min(ring.h, 2 * tv))
    const lamps = bar ? clamp(Math.round(rw(r) / 7), 4, 24) : clamp(Math.round((Math.PI * (rw(r) + rh(r))) / 2 / 9), 6, 48)
    L.add('ledring', 'ledring', r, H - 1.1, 0.7, { label: bar ? 'Light bar' : 'Light ring', figure: `${lamps} colour LEDs`, note: 'One lamp for about every 9 mm of the ring drawn on the top.', n: lamps, v: bar ? 1 : 0, over: true, layer: 4, partId: ring.id }, false)
  }
  if (keys.length) {
    const at = keys.map((p) => f.at(partPoint(d, p)))
    const r = join(at.map(([u, v], i) => R4(u, v, keys[i].w + 5, keys[i].h + 5)))!
    L.add('touch', 'touch', keep(r, { u0: -tu * 0.8, v0: -tv * 0.8, u1: tu * 0.8, v1: tv * 0.8 }), H - 1.1, 0.6, { label: 'Touch-control board', figure: `${keys.length} key${keys.length > 1 ? 's' : ''}`, n: keys.length, over: true, layer: 4 }, false)
  }
  // ---- wiring: mains to the amplifier, a lead up a post to each driver, and a ribbon up the back to the logic board
  const wire = (id: string, pts: V3[], thick: number, o: Partial<Comp>) => {
    const lo = pts.reduce((m, p) => m.map((x, i) => Math.min(x, p[i])) as V3, pts[0])
    const hi = pts.reduce((m, p) => m.map((x, i) => Math.max(x, p[i])) as V3, pts[0])
    g.out.push({ id, kind: 'cable', zone: 'main', host: 'tray', box: { c: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], s: [Math.max(thick, hi[0] - lo[0]), Math.max(thick, hi[1] - lo[1]), Math.max(thick, hi[2] - lo[2])] }, ax: f.ax, fits: true, layer: 1, specs: [], label: '', over: true, path: pts, n: thick, ...o })
  }
  const pu = f.at(psuC.box.c)
  const au = f.at(ampC.box.c)
  const [bu, bv] = span(0.5, hP)
  const backV = Math.min(bv, span(0.5, hP)[1]) - spine
  wire('cable0', [P(pu[0], pu[1], hP - 0.5), P(pu[0], backV - 1.5, hP - 0.5), P(au[0], backV - 1.5, hP - 0.5), P(au[0], au[1], hP - 0.5)], 1.6, { label: 'Power harness', figure: `${watts} W` })
  const post = Math.min(bu, span(z0, hd)[0]) * 0.86
  let lead = 0
  for (const c of g.out.filter((x) => x.zone === 'main' && x.kind === 'driver')) {
    const [cu, cv2, cw2] = f.at(c.box.c)
    const side2 = lead++ % 2 ? -1 : 1
    wire(`lead:${c.id}`, [P(au[0], au[1], hP), P(side2 * post, au[1], hP + 0.8), P(side2 * post, au[1], cw2), P(cu + (side2 * post - cu) * 0.35, cv2 + (au[1] - cv2) * 0.35, cw2)], 1.1, { label: 'Driver lead', figure: c.label, specs: ['driver'], v: 3 })
  }
  wire('ribbon', [P(au[0] * 0.5, backV - 0.8, hP), P(au[0] * 0.5, backV - 0.8, zt + 0.6)], 1, { label: 'Board ribbon', figure: 'amplifier to logic board', v: 2, n: 7 })
  if (sh.screen) g.out.push({ id: 'display', kind: 'display', zone: 'body', host: 'cover', box: { c: [0, sh.screen.y, b.thickness / 2 - sh.frontSink - 1.6], s: [sh.screen.w * (sh.form === 'orb' ? 0.7 : 1), sh.screen.h * (sh.form === 'orb' ? 0.7 : 1), 2.4] }, ax: [1, 2, 3], fits: true, layer: 4, specs: ['panel', 'refresh'], label: 'Touch screen', figure: `${panelName('speaker', s.panel)}, ${s.refresh} Hz`, v: s.panel, over: true })
}

// ---------------------------------------------------------------- the lot

// ---------------------------------------------------------------- e-reader and action camera: slabs with extras

/** An e-reader is a slab, with a light guide over the ink and, for a stylus, a digitiser behind it. */
function layoutEreader(g: Gen) {
  layoutSlab(g)
  const io = g.s.io ?? []
  const disp = g.out.find((c) => c.id === 'display')
  if (!disp) return
  disp.figure = panelName('ereader', g.s.panel)
  disp.label = 'E-ink panel'
  const [cx, cy, z] = disp.box.c
  const [w, h, th] = disp.box.s
  // the stack is shared out: the ink in the middle, the light guide on top, the digitiser underneath
  const lit = io.includes('light')
  const pen = io.includes('stylus')
  const ink = th * (lit && pen ? 0.5 : lit || pen ? 0.68 : 1)
  const bottom = z - th / 2
  const under = pen ? th * (lit ? 0.22 : 0.32) : 0
  disp.box = { c: [cx, cy, bottom + under + ink / 2], s: [w, h, ink] }
  if (pen) g.out.push({ ...disp, id: 'digitiser', kind: 'sheet', box: { c: [cx, cy, bottom + under / 2], s: [w, h, under] }, specs: ['io:stylus'], label: 'Pen digitiser', figure: 'Stylus and note-taking', v: 0, n: undefined })
  if (lit) {
    const top = bottom + under + ink
    g.out.push({ ...disp, id: 'frontlight', kind: 'sheet', box: { c: [cx, cy, (top + z + th / 2) / 2], s: [w, h, z + th / 2 - top] }, specs: ['io:light', ...(io.includes('warm') ? ['io:warm'] : [])], label: 'Front light guide', figure: io.includes('warm') ? 'Warm and cool LEDs along the bottom edge' : 'White LEDs along the bottom edge', v: 1, n: undefined })
  }
}

/** An action camera is a thick slab: the lens module behind the lens side, the rear screen on the front, the selfie screen beside the lens. */
function layoutActioncam(g: Gen) {
  layoutSlab(g)
  const { b, s } = g
  const disp = g.out.find((c) => c.id === 'display')
  if (disp) disp.label = 'Rear screen'
  if (!(s.io ?? []).includes('front')) return
  const f = selfieScreen(b)
  const th = 0.9
  // the back face runs the other way across the body
  g.out.push({ id: 'selfie', kind: 'display', zone: 'body', host: 'cover', box: { c: [-f.x, f.y, -b.thickness / 2 + th / 2 + 0.2], s: [f.w, f.h, th] }, ax: [-1, 2, -3], fits: true, layer: 4, specs: ['io:front'], label: 'Selfie screen', figure: 'Beside the lens', v: s.panel, n: f.r })
}

// ---------------------------------------------------------------- ring

/**
 * A smart ring: everything is curved round inside its band. Its axis is upright, the outside of the band at the
 * front is where the badge goes, and the sensors look in at the finger from the back. The shell is solid, so the
 * view takes it away and lifts what was inside up off the ring, layer by layer.
 */
function layoutRing(g: Gen) {
  const { b, s } = g
  const { outer, inner } = ringShape(b)
  const rm = (outer + inner) / 2
  const t = outer - inner
  const h = b.height
  const io = s.io ?? []
  g.zones.push({ id: 'main', anchor: 'body', box: { c: [0, 0, 0], s: [2 * outer, h, 2 * outer] }, up: 2, wall: 0 })
  const put = (id: string, kind: CompKind, c: V3, size: V3, ax: [Dir, Dir, Dir], o: Partial<Comp>) => {
    const comp: Comp = { id, kind, zone: 'main', host: 'tray', box: { c, s: size }, ax, fits: true, layer: 0, specs: [], label: '', ...o }
    g.out.push(comp)
    return comp
  }
  const bh = h * 0.62
  // a U-shaped cell round the back of the band
  const sd = 0.86
  const cell = put('battery', 'battery', [0, 0, -rm - t * 0.11], [rm * 1.0, bh, t * 0.44], [1, 2, 3], { specs: ['battery'], label: 'Curved battery cell', figure: batteryLabel('ring', s.battery), fits: g.fitBat, layer: 0, text: `${s.battery} mAh|${((s.battery * 3.85) / 1000).toFixed(2)} Wh  3.85 V` })
  cell.more = [-1, 1].map((k) => ({ c: [k * rm * sd, 0, -rm * 0.4] as V3, s: [t * 0.44, bh, rm * 0.44] as V3 }))
  // the board is a flex that runs round the front, the chip on it
  put('board', 'board', [0, 0, rm], [rm * 1.2, h * 0.72, Math.max(0.2, t * 0.16)], [-1, 2, -3], { label: 'Flex board', v: 1, layer: 1 })
  put('chip', 'chip', [0, 0, rm - t * 0.21], [Math.min(3.6, h * 0.45), Math.min(3.6, h * 0.45), Math.max(0.25, t * 0.24)], [-1, 2, -3], { specs: ['chip'], label: g.chip.name, figure: 'System in package', v: g.chip.custom ? 2 : s.chipTier, text: g.chip.name, layer: 2 })
  put('pmic', 'mem', [rm * 0.42, 0, rm * 0.9 - t * 0.12], [2.2, 2.2, Math.max(0.2, t * 0.18)], [-1, 2, -3], { label: 'Power management', specs: ['charging'], v: 2, text: 'PM', layer: 2 })
  // the sensors look in through the window at the back, against the palm side of the finger
  if (io.length) put('sensors', 'sensor', [0, 0, -(inner + t * 0.22)], [Math.min(7, rm * 0.7), h * 0.56, Math.max(0.25, t * 0.3)], [1, 2, 3], { label: 'Sensor array', figure: `${io.length} sensor${io.length > 1 ? 's' : ''}`, specs: io.map((id) => `io:${id}`), n: io.length, v: 0, layer: 3 })
  // charging contacts or a coil, at the side
  put('coil', 'coil', [rm, 0, 0], [Math.max(0.2, t * 0.2), h * 0.7, h * 0.7], [3, 2, -1], { label: 'Charging coil', figure: `${chargeWatts('ring', s.charging)} W on its dock`, specs: ['charging'], v: 0, layer: 1 })
  if (io.includes('pay')) put('nfc', 'antenna', [-rm, 0, rm * 0.2], [Math.max(0.2, t * 0.2), h * 0.6, rm * 0.7], [-3, 2, 1], { label: 'Payment aerial', specs: ['io:pay'], v: 1, layer: 1 })
  put('ant', 'antenna', [-rm * 0.7, 0, rm * 0.7], [rm * 0.36, h * 0.5, rm * 0.36], [-1, 2, -3], { label: 'Bluetooth aerial', over: true, v: 0, layer: 1 })
}

// ---------------------------------------------------------------- drone

/** A drone: the battery slides into the tail, the flight board sits in the middle and the camera hangs from the nose. The top shell lifts off. */
function layoutDrone(g: Gen) {
  const { b, d, s } = g
  const sh = droneShape(b)
  const wall = 1.6
  const L0 = b.thickness
  const ins = wall + 0.2929 * Math.max(0, sh.plan - wall)
  const hw = b.width / 2 - ins
  const hq = L0 / 2 - wall - 1
  const D = b.height - 2 * wall
  // across, towards the tail, and up from the floor
  const f = new Frame([0, -b.height / 2 + wall, 0], 1, -3, 2)
  const A: R = { u0: -hw, v0: -hq, u1: hw, v1: hq }
  const seam = -b.height / 2 + wall + D * 0.42
  g.zones.push({ id: 'main', anchor: 'body', box: f.box(A, 0, D), up: 2, cut: { axis: 1, at: seam, side: 1 }, wall })
  const L = new Lay(g.out, 'main', f, A, D)
  const io = s.io ?? []
  const base = 0.4
  const bt = Math.min(1.2, D * 0.06)
  const top = base + bt
  const tMax = Math.max(0.6, seam - (-b.height / 2 + wall) - base - 0.6)
  // ---- the nose: the camera's processor behind the gimbal, and the eyes that watch for obstacles
  const cam = d.parts.find((p) => p.kind === 'camera')
  if (cam) {
    const [u] = L.f.at(partPoint(d, cam))
    const r = keep(R4(u, A.v0 + 6, Math.min(2 * hw - 2, 16), 10), A)
    L.add(`cam:${cam.id}`, 'camera', r, base, Math.min(tMax, 9), { partId: cam.id, specs: ['camera'], label: 'Gimbal camera module', figure: sensorInfo(cam.sensor ?? 0).name, v: cam.sensor ?? 0 })
  }
  if (io.includes('avoid') || io.includes('omni')) {
    const specs = [...(io.includes('avoid') ? ['io:avoid'] : []), ...(io.includes('omni') ? ['io:omni'] : [])]
    for (const k of [-1, 1]) {
      const r = keep(R4(k * hw * 0.62, A.v0 + 2.6, 5, 4), A)
      L.add(`eye${k < 0 ? 'L' : 'R'}`, 'camera', r, Math.max(base, D * 0.55), Math.min(4, D * 0.3), { label: 'Obstacle sensor', specs, v: 0, n: 2 }, false)
    }
  }
  // ---- the tail: the charging port, then the battery bay
  const port = d.parts.find((p) => p.kind === 'port')
  if (port) {
    const [u, , w] = L.f.at(partPoint(d, port))
    const r = keep(R4(u, A.v1 - 4, port.w + 2, 7), A)
    L.add(`port:${port.id}`, 'port', r, clamp(w - port.h / 2 - 0.5, base, Math.max(base, D - port.h - 1)), Math.min(port.h + 1, D - 1), { partId: port.id, label: 'Charging port', figure: `${chargeWatts('drone', s.charging)} W`, specs: ['charging'] })
  }
  const bay = { ...A, v0: A.v1 - 2 * hq * 0.48 }
  const room = L.largest(bay)
  if (room) {
    const c = cell(g, L, 'battery', room, base, tMax)
    c.label = io.includes('swap') ? 'Hot-swap flight battery' : 'Flight battery'
    if (io.includes('swap')) c.specs.push('io:swap')
  }
  // ---- the middle: the flight board and what stands on it
  const middle = { ...A, v0: A.v0 + 12, v1: A.v1 - 2 * hq * 0.48 - 1 }
  const board = L.fit(middle, 2 * hw * 0.9, rh(middle) * 0.92, [0.5, 0.5])
  if (board) {
    L.add('board', 'board', board, base, bt, { v: 0, label: 'Flight controller' })
    const k = clamp(Math.min(rw(board), rh(board)) / 40, 0.6, 1.4)
    const items: Item[] = [chipItem(g, [8, 10, 12][s.chipTier] ?? 10, k, [0.5, 0.45])]
    items.push({ id: 'imu', kind: 'mem', su: 4 * k, sv: 4 * k, sw: 0.8 * k, at: [0.15, 0.2], o: { label: 'Motion sensors', v: 2, text: 'IMU' } })
    items.push({ id: 'link', kind: 'shield', su: 11 * k, sv: 8 * k, sw: 1.4 * k, at: [0.85, 0.75], o: { label: 'Video link radio', figure: panelName('drone', s.panel), specs: ['panel'], v: 0 } })
    for (let i = 0; i < 4; i++) items.push({ id: `esc${i}`, kind: 'mem', su: 3.6 * k, sv: 3.6 * k, sw: 0.7 * k, at: [i % 2 ? 0.95 : 0.05, i < 2 ? 0.05 : 0.95], o: { label: 'Motor controller', figure: 'one for each motor', v: 1, text: 'ESC' } })
    if (io.includes('track')) items.push({ id: 'npu', kind: 'mem', su: 5 * k, sv: 5 * k, sw: 0.8 * k, at: [0.2, 0.8], o: { label: 'Tracking processor', specs: ['io:track'], v: 2, text: 'AI' } })
    const placed = populate(L, [board], top, items, [])
    const soc = placed.get('chip')
    if (soc && s.chipTier >= 1) {
      const fan = L.fit({ ...middle, v1: board.v0 }, 14, 10, [0.5, 1], L.taken)
      if (fan) L.add('fan0', 'fan', fan, base, Math.min(tMax, 6), { label: 'Cooling fan', figure: `${Math.round(g.chip.watts * 0.3)} W of heat to shed`, specs: ['chip'], axis: 2 })
    }
  }
  // ---- under the top shell: GPS and the long-range aerials
  if (io.includes('gps')) L.add('gps', 'sensor', R4(0, -hq * 0.1, Math.min(18, 2 * hw * 0.5), 14), Math.max(top, D - 2), 1.2, { host: 'cover', label: 'GPS module', specs: ['io:gps'], v: 1, layer: 4 }, false)
  for (const k of [-1, 1]) L.add(`ant${k < 0 ? 'L' : 'R'}`, 'antenna', R4(k * (hw - 0.6), 0, 0.8, 2 * hq * 0.5), base, Math.min(D * 0.5, 8), { label: io.includes('range') ? 'Long-range aerial' : 'Aerial', specs: io.includes('range') ? ['io:range'] : ['panel'], over: true, v: io.includes('range') ? 1 : 0 }, false)
  const boardC = g.out.find((c) => c.id === 'board')
  const batC = g.out.find((c) => c.id === 'battery')
  if (boardC && batC) {
    const a = L.f.at(boardC.box.c)
    const z = L.f.at(batC.box.c)
    run(L, 'cable0', 'cable', [a[0] + hw * 0.3, a[1]], [z[0] + hw * 0.3, z[1]], top + 1, Math.min(2.4, D * 0.1), { label: 'Power harness' })
  }
}

// ---------------------------------------------------------------- PC tower

/**
 * A PC tower, laid out as a real one is: the main board on the far wall, the processor and its cooler near its top,
 * the memory beside it, the graphics card standing out of its slot below, the power supply along the floor under its
 * shroud, intake fans behind the front panel and an exhaust fan at the back. Upright, the side panel on the right
 * lifts off; a horizontal case lies on its side and opens at the top. Everything is worked out in the board's own
 * terms: p from the back of the case to the front, q up the board, r out of it towards the opening.
 */
function layoutTower(g: Gen) {
  const { b, d, s } = g
  const io = s.io ?? []
  const c = caseOf(b)
  const form = towerForm(b)
  const flat = form === 'htpc'
  const wall = 2
  const x0 = -b.width / 2 + wall
  const x1 = b.width / 2 - wall
  const y0 = -b.height / 2 + wall
  const y1 = b.height / 2 - wall
  const p0 = -b.thickness / 2 + wall
  const p1 = b.thickness / 2 - wall
  // the board's span up its height, and the room out of it
  const q0 = flat ? -x1 : y0
  const q1 = flat ? -x0 : y1
  const rMax = flat ? y1 - y0 : x1 - x0
  const W = (p: number, q: number, r: number): V3 => (flat ? [-q, y0 + r, p] : [x0 + r, q, p])
  const S = (sp: number, sq: number, sr: number): V3 => (flat ? [sq, sr, sp] : [sr, sq, sp])
  const ax: [Dir, Dir, Dir] = flat ? [-3, -1, 2] : [-3, 2, 1]
  g.zones.push({ id: 'main', anchor: 'body', box: { c: [0, 0, 0], s: [x1 - x0, y1 - y0, p1 - p0] }, up: flat ? 2 : 1, cut: flat ? { axis: 1, at: y1 - 0.5, side: 1 } : { axis: 0, at: x1 - 0.5, side: 1 }, wall })
  const lit = rgbOn(b)
  const rgb = rgbOf(b)
  const glow = (zone: string) => (lit && rgb.zones.includes(zone) ? rgb.color : undefined)
  /** One component, given by its extent along p, q and r. */
  const put = (id: string, kind: CompKind, pa: number, pb: number, qa: number, qb: number, ra: number, rb: number, o: Partial<Comp>) => {
    const comp: Comp = { id, kind, zone: 'main', host: 'tray', box: { c: W((pa + pb) / 2, (qa + qb) / 2, (ra + rb) / 2), s: S(Math.abs(pb - pa), Math.abs(qb - qa), Math.abs(rb - ra)) }, ax, fits: true, layer: clamp(Math.floor((4 * (ra + rb)) / 2 / Math.max(1, rMax)), 0, 3), specs: [], label: '', ...o }
    g.out.push(comp)
    return comp
  }
  const small = form === 'sff' || form === 'cube' || flat
  const fan = c.fanSize
  // ---- the main board: ATX in a tower, ITX in anything small
  const shroud = !small ? 96 : 0
  const front = c.fans > 0 ? 28 : 6
  const boardP = small ? Math.min(170, p1 - p0 - front - 14) : Math.min(244, p1 - p0 - front - 30)
  const boardQ = small ? Math.min(170, q1 - q0 - 16) : Math.min(305, q1 - q0 - shroud - 22)
  const bp0 = p0 + 8
  const bp1 = bp0 + boardP
  const bq1 = flat ? q0 + 8 + boardQ : q1 - 12
  const bq0 = bq1 - boardQ
  put('board', 'feature', bp0, bp1, bq0, bq1, 5, 6.6, { model: 'mobo', label: small ? 'Mini-ITX main board' : 'ATX main board', figure: `${io.length} ports and slots fitted`, v: small ? 1 : 0, layer: 0 })
  // ---- the processor and what cools it
  const cpuP = bp0 + boardP * (small ? 0.45 : 0.5)
  const cpuQ = bq1 - boardQ * (small ? 0.36 : 0.26)
  put('chip', 'chip', cpuP - 20, cpuP + 20, cpuQ - 20, cpuQ + 20, 6.6, 9, { specs: ['chip'], label: g.chip.name, figure: 'Processor', v: 2, text: g.chip.name })
  let frontRad = false
  const coolIx = s.cooling ?? 0
  const cooler = PC_COOLERS[coolIx] ?? PC_COOLERS[0]
  const low = rMax < 172
  if (coolIx === 0) put('cooler', 'feature', cpuP - 48, cpuP + 48, cpuQ - 48, cpuQ + 48, 9, 9 + 46, { model: 'stockcooler', label: cooler.name, specs: ['cooling'], glow: glow('cooler') })
  else if (coolIx === 1) put('cooler', 'feature', cpuP - 30, cpuP + 30, cpuQ - 64, cpuQ + 64, 9, 9 + (low ? 58 : Math.min(158, rMax - 14)), { model: 'aircooler', label: low ? 'Low-profile air cooler' : cooler.name, specs: ['cooling'], v: low ? 1 : 0, glow: glow('cooler') })
  else {
    put('cooler', 'feature', cpuP - 32, cpuP + 32, cpuQ - 32, cpuQ + 32, 9, 40, { model: 'pump', label: 'Pump block', figure: cooler.name, specs: ['cooling'], glow: glow('cooler') })
    const n = coolIx === 3 ? 3 : 2
    const len = n * (fan + 2) + 32
    const thick = 27 + 25
    // up under the top if it is long enough, else behind the front
    const top = p1 - p0 - front - 10 >= len && !flat && !io.includes('odd')
    const comp = top
      ? put('radiator', 'feature', p1 - front - 6 - len, p1 - front - 6, q1 - 2 - thick, q1 - 2, Math.max(30, rMax / 2 - fan / 2), Math.max(30, rMax / 2 - fan / 2) + fan, { model: 'radiator', label: `${coolIx === 3 ? '360' : '240'} mm radiator`, figure: `${n} fans`, specs: ['cooling'], n, glow: glow('fans'), axis: 1 })
      : put('radiator', 'feature', p1 - 2 - thick, p1 - 2, (q0 + q1) / 2 - len / 2, (q0 + q1) / 2 + len / 2, rMax / 2 - fan / 2, rMax / 2 + fan / 2, { model: 'radiator', label: `${coolIx === 3 ? '360' : '240'} mm radiator`, figure: `${n} fans, at the front`, specs: ['cooling'], n, glow: glow('fans'), axis: 0, fits: (q1 - q0) >= len })
    comp.text = top ? 'top' : 'front'
    frontRad = !top
    // the two hoses from the block to the radiator
    const [rx, ry, rz] = comp.box.c
    const from = W(cpuP, cpuQ, 34)
    put('hoses', 'cable', 0, 0, 0, 0, 0, 0, { label: 'Coolant hoses', specs: ['cooling'], v: 1, n: 9, over: true, path: [from, [(from[0] + rx) / 2 + 10, (from[1] + ry) / 2 + 20, (from[2] + rz) / 2], [rx, ry, rz]] })
  }
  // ---- memory, beside the processor
  const sticks = small ? 2 : s.ram >= 64 ? 4 : 2
  for (let i = 0; i < sticks; i++) {
    const p = cpuP + (small ? 36 : 50) + i * 8.5
    put(`ram${i}`, 'feature', p - 3.6, p + 3.6, cpuQ - 66, cpuQ + 66, 6.6, 6.6 + 34, { model: 'ram', specs: ['ram'], label: 'Memory module', figure: `${Math.round(s.ram / sticks)} GB of ${s.ram} GB`, glow: glow('ram') })
  }
  // ---- the graphics card, out of its slot below the processor
  const gpu = s.gpu ?? 0
  const slotQ = cpuQ - (small ? 70 : 104)
  if (gpu > 0) {
    const len = GPU_LENGTH[gpu]
    const thick = [0, 40, 52, 64][gpu]
    const tall = [0, 112, 126, 138][gpu]
    const room = p1 - front - 6 - (bp0 - 4)
    put('gpu', 'feature', bp0 - 4, bp0 - 4 + len, slotQ - thick, slotQ, 8, 8 + Math.min(tall, rMax - 10), { model: 'gpu', specs: ['gpu'], label: ['', 'Entry graphics card', 'Performance graphics card', 'Enthusiast graphics card'][gpu], figure: `${len} mm long, ${[0, 2, 2.5, 3.2][gpu]} slots`, v: gpu, n: gpu === 1 ? 2 : 3, glow: glow('gpu'), fits: len <= room && tall <= rMax - 6 })
  }
  // the solid-state drive in its slot between them, under a heat spreader
  // on a small board it goes on the back, behind the tray
  put('ssd', 'stick', cpuP - 40, cpuP + 40, slotQ + 14, slotQ + 36, small ? 1 : 6.6, small ? 3.8 : 9.4, { specs: ['storage'], label: 'Solid-state drive', figure: storageLabel(s.storage), v: 1, text: storageLabel(s.storage) })
  // ---- the power supply on the floor at the back, under its shroud
  const psu = PSUS[s.psu ?? 1] ?? PSUS[1]
  const sfx = small
  const [pl, ph, pw] = sfx ? [100, 64, 125] : [160, 86, 150]
  const psuR0 = Math.max(4, rMax / 2 - pw / 2)
  if (flat) put('psu', 'psu', p0 + 6, p0 + 6 + pl, q1 - 4 - pw, q1 - 4, 4, 4 + ph, { label: 'SFX power supply', figure: psu.name, specs: ['psu'], v: 2 })
  else put('psu', 'psu', p0 + 6, p0 + 6 + pl, q0 + 4, q0 + 4 + ph, psuR0, psuR0 + pw, { label: sfx ? 'SFX power supply' : 'ATX power supply', figure: psu.name, specs: ['psu'], v: 2 })
  if (shroud) put('shroud', 'feature', p0, p1 - front - 2, q0, q0 + shroud, 0, rMax, { model: 'shroud', label: 'Power-supply shroud', over: true, glow: glow('floor'), layer: 1 })
  // ---- drive bays and the optical drive
  if (io.includes('bays')) for (let i = 0; i < 2; i++) put(`bay${i}`, 'drive', p1 - front - 156, p1 - front - 6, q0 + 6 + i * 30, q0 + 32 + i * 30, rMax / 2 - 51, rMax / 2 + 51, { specs: ['io:bays'], label: 'Hot-swap drive', figure: 'Hard disk', v: 0 })
  const odd = io.includes('odd')
  if (odd) put('odd', 'drive', p1 - 172, p1 - 2, q1 - 46, q1 - 4, rMax / 2 - 74, rMax / 2 + 74, { specs: ['io:odd'], label: 'Optical drive', v: 1, fits: rMax >= 150 })
  // ---- the fans: intakes behind the front, an exhaust at the back
  // a radiator behind the front brings its own fans
  const n = frontRad ? 0 : Math.min(c.fans, maxFans(b, fan))
  const fq1 = (flat ? q1 : q1 - (odd ? 50 : 8)) - 4
  for (let i = 0; i < n; i++) {
    const qc = flat ? (q0 + q1) / 2 + (i - (n - 1) / 2) * (fan + 6) : fq1 - fan / 2 - i * (fan + 6)
    if (!flat && qc - fan / 2 < q0 + 4) break
    put(`fan${i}`, 'feature', p1 - 27, p1 - 2, qc - fan / 2, qc + fan / 2, rMax / 2 - fan / 2, rMax / 2 + fan / 2, { model: 'casefan', label: 'Intake fan', figure: `${fan} mm`, specs: ['case'], axis: 0, glow: glow('fans') })
  }
  const ex = small ? 92 : 120
  put('exhaust', 'feature', p0 + 1, p0 + 26, bq1 - 8 - ex, bq1 - 8, Math.max(8, rMax / 2 - ex / 2 + 10), Math.max(8, rMax / 2 - ex / 2 + 10) + ex, { model: 'casefan', label: 'Exhaust fan', figure: `${ex} mm`, specs: ['case'], axis: 0, glow: glow('fans') })
  // ---- the harnesses from the supply to the board and the card
  const psuC = g.out.find((x) => x.id === 'psu')!.box.c
  const to24 = W(bp1 - 4, bq0 + boardQ * 0.55, 10)
  put('cable24', 'cable', 0, 0, 0, 0, 0, 0, { label: '24-pin power harness', specs: ['psu'], v: 0, n: 7, over: true, path: [psuC, W(bp1 + 10, q0 + 60, 18), to24] })
  if (gpu > 0) {
    const card = g.out.find((x) => x.id === 'gpu')!
    const end = W(bp0 + GPU_LENGTH[gpu] * 0.7, slotQ + 2, 8 + 90)
    put('cable8', 'cable', 0, 0, 0, 0, 0, 0, { label: 'Graphics power cable', specs: ['psu', 'gpu'], v: 0, n: 5, over: true, path: [psuC, W(bp0 + GPU_LENGTH[gpu] * 0.7, q0 + 70, 80), end] })
    void card
  }
  // a box round each harness, so that it can be picked like anything else
  for (const comp of g.out) {
    if (comp.kind !== 'cable' || !comp.path) continue
    const lo = [0, 1, 2].map((i) => Math.min(...comp.path!.map((p) => p[i])))
    const hi = [0, 1, 2].map((i) => Math.max(...comp.path!.map((p) => p[i])))
    comp.box = { c: [0, 1, 2].map((i) => (lo[i] + hi[i]) / 2) as V3, s: [0, 1, 2].map((i) => Math.max(4, hi[i] - lo[i])) as V3 }
  }
  void y1
}

// ---------------------------------------------------------------- mouse

/** A mouse: a board on the base plate, the sensor looking down through it, the switches under the buttons at the nose, the wheel between them and the cell behind. The shell lifts off. */
function layoutMouse(g: Gen) {
  const { b, d, s } = g
  const io = s.io ?? []
  const base = 5
  const yb = -b.height / 2 + base
  const hz = b.thickness / 2 - 4
  const hx = b.width / 2 - 4
  const floor = -b.height / 2 + 0.5
  g.zones.push({ id: 'main', anchor: 'body', box: { c: [0, (floor + b.height / 2 - 2) / 2, 0], s: [2 * hx, b.height / 2 - 2 - floor, b.thickness - 4] }, up: 2, cut: { axis: 1, at: yb + 1.5, side: 1 }, wall: 1.5 })
  void hz
  const ax: [Dir, Dir, Dir] = [1, -3, 2]
  const put = (id: string, kind: CompKind, c: V3, size: V3, o: Partial<Comp>) => {
    const comp: Comp = { id, kind, zone: 'main', host: 'tray', box: { c, s: size }, ax, fits: true, layer: 1, specs: [], label: '', ...o }
    g.out.push(comp)
    return comp
  }
  const lit = rgbOn(b)
  const rgb = rgbOf(b)
  const glow = (zone: string) => (lit && rgb.zones.includes(zone) ? rgb.color : undefined)
  const L = b.thickness
  put('board', 'board', [0, yb + 0.8, L * 0.06], [b.width * 0.62, 1.6, L * 0.62], { label: 'Main board', v: 1, layer: 0 })
  put('sensor', 'feature', [0, yb - 2, L * 0.04], [16, 3, 20], { model: 'mousesensor', label: 'Optical sensor', figure: g.d.type === 'mouse' ? panelName('mouse', s.panel) : '', specs: ['panel'], layer: 0 })
  put('chip', 'chip', [b.width * 0.12, yb + 2.2, -L * 0.08], [7, 1.2, 7], { specs: ['chip'], label: g.chip.name, figure: 'Microcontroller', v: s.chipTier, text: g.chip.name })
  for (const sx of [-1, 1]) put(`switch${sx < 0 ? 0 : 1}`, 'feature', [sx * b.width * 0.2, yb + 4.8, L * 0.36], [12, 6, 6], { model: 'switch', label: sx < 0 ? 'Left button switch' : 'Right button switch', specs: io.includes('hot') ? ['io:hot'] : [], v: io.includes('hot') ? 1 : 0 })
  put('wheel', 'feature', [0, yb + 10.8, L * 0.3], [8, 18, 22], { model: 'wheel', v: io.includes('free') ? 2 : io.includes('tilt') ? 1 : 0, label: io.includes('free') ? 'Free-spinning wheel' : 'Scroll wheel', specs: ['io:tilt', 'io:free'].filter((k) => io.includes(k.slice(3))), glow: glow('wheel'), axis: 0 })
  if (io.includes('side')) put('sideboard', 'board', [b.width / 2 - 6, yb + b.height * 0.3, L * 0.02], [1.6, 12, 30], { label: 'Thumb button board', specs: ['io:side'], v: 1 })
  const wired = !io.includes('wireless') && !io.includes('bt')
  if (!wired && s.battery > 0) {
    const room = Math.max(10, L * 0.32)
    const th = Math.min(9, b.height - base - 10)
    put('battery', 'battery', [0, yb + 1.8 + th / 2, -L * 0.28], [Math.min(b.width - 18, 34), th, room], { specs: ['battery'], label: 'Battery cell', figure: batteryLabel('mouse', s.battery), fits: g.fitBat, text: `${s.battery} mAh|3.7 V` })
    put('radio', 'shield', [-b.width * 0.16, yb + 2.6, -L * 0.04], [12, 1.6, 9], { label: io.includes('wireless') ? '2.4 GHz radio' : 'Bluetooth radio', specs: ['io:wireless', 'io:bt'].filter((k) => io.includes(k.slice(3))), v: 0 })
  }
  if (io.includes('weights')) for (const sx of [-1, 1]) put(`weight${sx}`, 'feature', [sx * b.width * 0.26, yb + 3, -L * 0.1], [8, 5, 14], { model: 'weight', label: 'Tuning weight', specs: ['io:weights'] })
  const port = d.parts.find((p) => p.kind === 'port')
  if (port) put(`port:${port.id}`, 'port', [port.x, Math.min(b.height / 2 - 6, yb + 4 + port.y + b.height / 2 - 10), b.thickness / 2 - 5.5], [port.w + 1, port.h + 1, 6], { partId: port.id, label: wired ? 'Cable' : 'Charging port', specs: wired ? [] : ['charging'], figure: wired ? undefined : `${chargeWatts('mouse', s.charging)} W` })
  if (lit && rgb.zones.includes('strip')) for (const sx of [-1, 1]) put(`strip${sx}`, 'led', [sx * (b.width / 2 - 3), yb + 3, 0], [1, 1.5, L * 0.7], { label: 'Light strip', v: 0, glow: rgb.color })
}

const LAYOUTS: Record<DeviceType, (g: Gen) => void> = { tower: layoutTower, monitor: layoutPanel, mouse: layoutMouse, phone: layoutSlab, tablet: layoutSlab, watch: layoutWatch, laptop: layoutLaptop, desktop: layoutPanel, tv: layoutPanel, console: layoutConsole, earbuds: layoutEarbuds, foldable: layoutFoldable, headset: layoutHeadset, speaker: layoutSpeaker, handheld: layoutHandheld, ereader: layoutEreader, ring: layoutRing, actioncam: layoutActioncam, drone: layoutDrone }

/**
 * Everything inside a device and where it goes. With the company's research
 * levels the fit of the battery and the body is judged exactly as evaluate()
 * judges it; without them (a rival's device) it is taken to fit as built.
 */
export function layoutInternals(d: DeviceDesign, lv?: Levels, chips?: CustomChip[]): Internals {
  const T = TYPES[d.type]
  const b = d.body
  const s = d.specs
  let f = 1
  let fitBat = true
  if (!T.mains) {
    let cap = 0
    if (lv) cap = maxBattery(b, lv.battery, d.type)
    else {
      for (let level = 0; level <= 8; level++) {
        cap = maxBattery(b, level, d.type)
        if (cap >= s.battery) break
      }
    }
    fitBat = s.battery <= cap
    f = cap > 0 ? s.battery / cap : 2
  }
  const g: Gen = { d, b, s, T, out: [], zones: [], f, fitBat, thin: lv ? b.thickness < minThickness(d.type, lv.design, s) - 1e-6 : false, chip: chipFor(s, chips) }
  if (d.type !== 'laptop' && d.type !== 'earbuds' && d.type !== 'speaker') g.zones.push({ id: 'body', anchor: 'body', box: { c: [0, 0, 0], s: [b.width, b.height, b.thickness] }, up: -3, wall: 0 })
  LAYOUTS[d.type](g)
  return { type: d.type, zones: g.zones, comps: g.out, fraction: f }
}

// ---------------------------------------------------------------- what each row costs and weighs

/**
 * What the rows of the Internals panel cost and weigh, from the same sums
 * evaluate() uses, so a component can say what share of the device it is.
 * Keys are the same as Comp.specs. Weight is given only where the model knows it.
 */
export function specShares(d: DeviceDesign, ev: Evaluation, chips?: CustomChip[]): Record<string, { cost: number; grams?: number }> {
  const T = TYPES[d.type]
  const s = d.specs
  const chip = chipFor(s, chips)
  const out: Record<string, { cost: number; grams?: number }> = {}
  out.chip = { cost: chip.cost * T.chipCost }
  // the same sums as evaluate(), before the allowance it makes for how far making things has cheapened: that comes last
  const raw = new Set<string>()
  const gpu = T.gpu ? (GPUS[s.gpu ?? 0] ?? GPUS[0]) : GPUS[0]
  if (T.gpu) out.gpu = { cost: gpu.cost * (T.gpuCost ?? 1) * Math.pow(1.1, chip.gen), grams: gpu.weight }
  if (T.memory > 0) {
    out.ram = { cost: s.ram * 2.5 }
    out.storage = { cost: s.storage * 0.08 }
  }
  if (!T.mains) {
    out.battery = { cost: ev.costParts.batteries, grams: s.battery * 0.011 }
    raw.add('battery')
  }
  out.charging = { cost: 0.04 * chargeWatts(d.type, s.charging) }
  out.panel = { cost: ev.costParts.displays, grams: T.noScreen ? undefined : ((d.body.width * d.body.height * 0.7) / 1000) * 2.5 }
  out.refresh = out.panel
  raw.add('panel')
  if (T.mains?.cool) out.cooling = { cost: (coolersFor(d.type)[s.cooling ?? 0] ?? coolersFor(d.type)[0]).cost }
  if (T.mains?.sound) out.speakers = { cost: (SPEAKERS[s.speakers ?? 0] ?? SPEAKERS[0]).cost }
  if (d.type === 'earbuds') {
    out.driver = { cost: (DRIVERS[s.driver ?? 0] ?? DRIVERS[0]).cost, grams: 2 * (DRIVERS[s.driver ?? 0] ?? DRIVERS[0]).weight }
    out.anc = { cost: (ANC[s.anc ?? 0] ?? ANC[0]).cost, grams: 2 * (ANC[s.anc ?? 0] ?? ANC[0]).weight }
  }
  if (d.type === 'speaker') {
    const w = SPEAKER_DRIVERS[s.driver ?? 0] ?? SPEAKER_DRIVERS[0]
    out.driver = { cost: w.cost, grams: w.weight }
    out.mics = { cost: (MIC_ARRAYS[s.mics ?? 0] ?? MIC_ARRAYS[0]).cost }
  }
  if (d.type === 'foldable') out.hinge = { cost: (HINGES[s.hinge ?? 0] ?? HINGES[0]).cost, grams: (HINGES[s.hinge ?? 0] ?? HINGES[0]).weight }
  if (d.type === 'headset') {
    const o = OPTICS[s.optics ?? 0] ?? OPTICS[0]
    out.optics = { cost: o.cost, grams: o.weight }
    out.strap = { cost: headStrap(d.body.strap).cost, grams: headStrap(d.body.strap).weight }
  }
  if (T.input) out.input = { cost: (inputOptions(d.type)[s.keyboard ?? 0] ?? inputOptions(d.type)[0]).cost }
  for (const id of s.io ?? []) {
    const info = ioInfo(d.type, id)
    if (info) out[`io:${id}`] = { cost: info.cost }
  }
  for (const id of s.extras) out[`extra:${id}`] = { cost: EXTRAS.find((e) => e.id === id)?.cost ?? 0 }
  if (d.type === 'tower') {
    const psu = PSUS[s.psu ?? 1] ?? PSUS[1]
    out.psu = { cost: psu.cost, grams: psu.watts * 1.6 }
    const c = caseOf(d.body)
    out.case = { cost: c.fans * (c.fanSize === 140 ? 5 : 4) }
  }
  let cams = 0
  for (const p of d.parts) if (p.kind === 'camera') cams += sensorInfo(p.sensor ?? 0).cost * (p.face === 'back' && !isCoverCam(d, p) ? LENSES[p.lens ?? 'wide'].cost : 0.6 * (p.underDisplay ? 1.5 : 1))
  out.camera = { cost: cams }
  for (const key of Object.keys(out)) if (!raw.has(key) && key !== 'refresh') out[key] = { ...out[key], cost: out[key].cost * ev.costScale }
  return out
}

// ---------------------------------------------------------------- what each component weighs

/** How heavy a kind of component is for the room it takes: a share of the weight is given out by volume times this. */
const HEFT: Partial<Record<CompKind, number>> = { board: 0.9, chip: 2, mem: 2, shield: 1.2, sheet: 2, pipe: 3, fan: 0.5, heatsink: 1.2, pump: 2, camera: 2.5, coil: 1.5, motor: 4, port: 1.5, flex: 0.3, tray: 2, antenna: 0.5, plate: 4, stick: 1.2, card: 0.9, drive: 0.8, driver: 1.2, radiator: 0.6, mic: 0.5, lens: 1.2, well: 0.3, baffle: 0.25, wadding: 0.03, duct: 0.15, amp: 0.8, ledring: 0.3, touch: 0.8, display: 2, hinge: 4, battery: 2.6 }

/** The room a component takes, in cubic millimetres: its boxes, or its length for a cable. */
function bulk(c: Comp): number {
  if (c.path && c.path.length > 1) {
    const thick = Math.min(...c.box.s)
    let len = 0
    for (let i = 0; i + 1 < c.path.length; i++) len += Math.hypot(c.path[i + 1][0] - c.path[i][0], c.path[i + 1][1] - c.path[i][1], c.path[i + 1][2] - c.path[i][2])
    return Math.max(1, len) * thick * thick
  }
  return [c.box, ...(c.more ?? [])].reduce((a, k) => a + k.s[0] * k.s[1] * k.s[2], 0)
}

export interface WeightShares {
  /** Grams for every component of the layout, by its id. */
  comps: Record<string, number>
  /** What no component stands for: the frame, the back, a stand, a strap, the display in a laptop's lid. */
  rest: { key: WeightKey; label: string; grams: number }[]
  total: number
}

/**
 * The weight of a device shared out among the components drawn inside it. The terms deviceWeight() adds up go to
 * the components that stand for them (the cells, the display, the hinge), and the lump it allows for everything
 * else inside is divided among the rest by size and kind. Components and the rows left over sum to the total.
 */
export function weightShares(d: DeviceDesign, n: Internals): WeightShares {
  const parts = weightParts(d)
  const comps: Record<string, number> = {}
  const rest: WeightShares['rest'] = []
  const given = new Set<string>()
  const give = (list: Comp[], grams: number) => {
    const w = list.map((c) => bulk(c) * (HEFT[c.kind] ?? 1))
    const sum = w.reduce((a, x) => a + x, 0)
    list.forEach((c, i) => {
      comps[c.id] = (comps[c.id] ?? 0) + (sum > 0 ? (grams * w[i]) / sum : grams / list.length)
      given.add(c.id)
    })
  }
  const inBud = (c: Comp) => c.zone === 'bud'
  const pick: Partial<Record<WeightKey, (c: Comp) => boolean>> = {
    battery: (c) => c.kind === 'battery' && !inBud(c),
    display: (c) => (c.kind === 'display' && c.zone === 'body') || c.id === 'backlight',
    gpu: (c) => c.id === 'gpu',
    hinge: (c) => c.kind === 'hinge',
    optics: (c) => c.kind === 'lens',
    driver: (c) => c.kind === 'driver' && !inBud(c),
  }
  let lump = 0
  for (const p of parts) {
    if (p.key === 'works') lump += p.grams
    else if (!(p.grams > 0)) continue
    else if (p.key === 'buds') {
      // one bud is the one taken apart; the other is whole
      const bud = n.comps.filter(inBud)
      if (bud.length) {
        give(bud, p.grams / 2)
        rest.push({ key: 'buds', label: 'The other earbud', grams: p.grams / 2 })
      } else rest.push(p)
    } else if (pick[p.key]) {
      const list = n.comps.filter(pick[p.key]!)
      if (list.length) give(list, p.grams)
      else if (p.grams > 0) rest.push(p)
    } else if (p.grams > 0) rest.push(p)
  }
  const others = n.comps.filter((c) => !given.has(c.id))
  if (others.length) give(others, lump)
  else rest.push({ key: 'works', label: 'Everything inside', grams: lump })
  for (const c of n.comps) comps[c.id] = comps[c.id] ?? 0
  return { comps, rest, total: parts.reduce((a, p) => a + p.grams, 0) }
}

/** What one camera part costs, by the sum evaluate() uses. */
export const cameraCost = (d: DeviceDesign, p: PlacedPart, scale = 1) => scale * sensorInfo(p.sensor ?? 0).cost * (p.face === 'back' && !isCoverCam(d, p) ? LENSES[p.lens ?? 'wide'].cost : 0.6 * (p.underDisplay ? 1.5 : 1))
