// Places on the furniture where a person can be: the chair at a desk, a stool
// at the coffee bar, a spot in front of the vending machine. Each is given in
// the item's own frame (centred on its footprint, front toward +Z) and turned
// into world positions for the site as built.
import { ITEMS, gridAt, itemAt, itemTiles } from '../../sim/sites'
import type { Role, Site, SiteItem, SiteKind } from '../../sim/types'
import type { Nav } from './nav'

/** How a person holds themselves at a spot. */
export const Pose = {
  Stand: 0,
  Sit: 1,
  Type: 2,
  StandType: 3,
  Perch: 4,
  Lounge: 5,
  Run: 6,
  Stretch: 7,
  Curl: 8,
  Write: 9,
  Play: 10,
  Hold: 11,
  Phone: 12,
  Look: 13,
  Pack: 14,
  Meet: 15,
  Bar: 16,
  /** Talking to a room: one arm out toward the screen, the other gesturing. */
  Present: 17,
  /** A handshake held out in front. */
  Shake: 18,
  /** Pushing a broom. */
  Sweep: 19,
  /** Standing in a line, weight on one leg. */
  Queue: 20,
  /** Reaching up into a piece of equipment. */
  Fix: 21,
  /** Both hands on a camera at chest height. */
  Film: 22,
  /** Hands on a console or a rack in front, at chest height. */
  Tend: 23,
} as const
export type Pose = (typeof Pose)[keyof typeof Pose]

/** What a spot is for. A spot can serve several purposes. */
export const USE = { seat: 1, station: 2, meet: 4, lunch: 8, coffee: 16, gym: 32, think: 64, look: 128, visit: 256, wait: 512, browse: 1024, queue: 2048, help: 4096, guest: 8192, host: 16384, crew: 32768, press: 65536, front: 131072, present: 262144 } as const

interface SpotDef {
  use: number
  /** Where the person is, in the item's frame. */
  x: number
  z: number
  /** Height of the floor or seat they are on, when it is not the ground. */
  y?: number
  /** Which way they face: 0 looks toward -Z (into the item), PI toward +Z. */
  face: number
  pose: Pose
  /** Height of the hips when seated. */
  hip?: number
  /** A point on the tile they step in from. */
  ax: number
  az: number
  /** Stations: the role that works here. */
  role?: Role
  /** Queues: place in the line, 0 at the front. */
  q?: number
  /** Points to pass on the way in from the access tile, as [x, y, z] in the item's frame: up the stage steps, onto a riser. */
  via?: [number, number, number][]
  /** Seats in a row: reached by sidling along the row from whichever end is open, rather than from the marked tile. */
  row?: boolean
  /**
   * Other places to be, tried in turn when the tile this one is stepped into from is walled off or has something
   * standing on it: the back of a machine whose front is boxed in, the end of a counter whose back is to a wall.
   */
  alts?: Partial<SpotDef>[]
  /** Leave the spot out altogether when none of its places can be walked to, rather than have someone dropped into it. */
  strict?: boolean
}

const s = (use: number, x: number, z: number, face: number, pose: Pose, ax: number, az: number, extra: Partial<SpotDef> = {}): SpotDef => ({ use, x, z, face, pose, ax, az, ...extra })
const U = USE
const HALF = Math.PI / 2

const meeting: SpotDef[] = [-0.5, 0, 0.5].flatMap((x) => [s(U.meet, x, 0.72, 0, Pose.Meet, x < 0 ? -0.5 : 0.5, 1.5, { hip: 0.5 }), s(U.meet, x, -0.72, Math.PI, Pose.Meet, x > 0 ? 0.5 : -0.5, -1.5, { hip: 0.5 })])

/** Height of the stage floor, shared with the stage's model. */
export const STAGE_H = 0.9
/** Seat rows of a seating block on a riser `h` high: two rows of six, the back row a step up. */
export const seatRows = (h: number) => [0, 1].map((row) => ({ z: row ? 0.56 : -0.44, y: h + (h > 0 ? row * 0.24 : 0) }))
/** How far in front of a seat's middle the strip of floor is that people shuffle along to reach it. */
export const LEGROOM = 0.43
/** How far beyond the side of a seating block the middle of its aisle steps is, and how wide they are. */
export const STAIR_X = 0.11
export const STAIR_W = 0.22
/** Height of the riser under each kind of seating block. */
export const RISER: Record<string, number> = { seats: 0, seats_mid: 0.5, seats_high: 1.0 }
const seating = (h: number): SpotDef[] => seatRows(h).flatMap((r) => Array.from({ length: 6 }, (_, i) => s(U.guest, -1.25 + i * 0.5, r.z, 0, Pose.Sit, i < 3 ? -2 : 2, r.z, { y: r.y, hip: 0.52, row: true })))
const sofa = [s(U.coffee | U.lunch | U.wait, -0.45, -0.06, 0, Pose.Lounge, -0.5, -1, { hip: 0.47 }), s(U.coffee | U.lunch | U.wait, 0.45, -0.06, 0, Pose.Lounge, 0.5, -1, { hip: 0.47 })]
const table = [s(U.browse, -0.5, 0.82, 0, Pose.Hold, -0.5, 1), s(U.browse, 0.5, 0.82, 0, Pose.Hold, 0.5, 1), s(U.browse, -0.5, -0.82, Math.PI, Pose.Hold, -0.5, -1), s(U.browse, 0.5, -0.82, Math.PI, Pose.Hold, 0.5, -1)]
/** Where a visitor stands at a reception desk, measured from its middle: close enough to the counter for a handshake across it. */
const VISIT_Z = 0.63
const reception = [
  s(U.visit, -0.5, VISIT_Z, 0, Pose.Stand, -0.5, 1),
  s(U.visit, 0.5, VISIT_Z, 0, Pose.Stand, 0.5, 1),
  // the receptionist stands behind the counter, hands on it, facing whoever comes in. They come round from behind, or
  // in by either end where the back is to a wall; never through the counter
  s(U.front, 0, -0.42, Math.PI, Pose.Tend, 0, -1, {
    strict: true,
    alts: [
      { ax: -1.5, az: 0, via: [[-1.22, 0, -0.46]] },
      { ax: 1.5, az: 0, via: [[1.22, 0, -0.46]] },
    ],
  }),
]
/** The same place at the back of a machine, for when its front is boxed in. */
const behind = (d: SpotDef): SpotDef => ({ ...d, alts: [{ z: -d.z, face: Math.PI, az: -d.az }] })
/** Where a pallet truck is brought up to something: far enough back that its forks stop short, nearer where there is no room. */
const forkAt = (use: number, x: number, bothSides: boolean): SpotDef =>
  s(use, x, 1.87, 0, Pose.Stand, x, 2, {
    alts: [{ z: 1.45, az: 1 }, ...(bothSides ? [{ z: -1.87, face: Math.PI, az: -2 }, { z: -1.45, face: Math.PI, az: -1 }] : [])],
  })
/** Up the two steps at stage left, then across the boards. Stages of every size share the design: W wide, D deep. */
const stepsOf = (W: number, D: number): [number, number, number][] => {
  const x = -W / 2 + 0.55
  const front = D / 2 - 0.68
  return [
    [x, 0, front + 0.73],
    [x, 0.3, front + 0.45],
    [x, 0.6, front + 0.15],
    [x, STAGE_H + 0.012, front - 0.22],
  ]
}
/** Where the presenter stands on a stage, W by D: at the lectern, and out in the middle beside the plinth. */
export const stageMarks = (W: number, D: number) => ({ lectern: [W / 2 - 1.0, D / 2 - 1.7] as [number, number], centre: [-0.75, D / 2 - 1.25] as [number, number], wings: [-W / 2 + 0.55, D / 2 - 0.9] as [number, number] })
function stageDefs(W: number, D: number): SpotDef[] {
  const via = stepsOf(W, D)
  const m = stageMarks(W, D)
  const ax = -W / 2 + 0.5
  const az = D / 2 + 0.5
  return [
    // at the lectern, and out in the middle beside the plinth: both face the house
    s(U.host, m.lectern[0], m.lectern[1], Math.PI, Pose.Present, ax, az, { y: STAGE_H + 0.012, via }),
    s(U.host, m.centre[0], m.centre[1], Math.PI, Pose.Present, ax, az, { y: STAGE_H + 0.012, via }),
    // a stagehand checking the front of the stage from the floor
    s(U.crew, 1.2, D / 2 + 0.45, 0, Pose.Fix, 1.5, az),
  ]
}

const DEFS: Record<SiteKind, Record<string, SpotDef[]>> = {
  office: {
    desk: [s(U.seat, 0, 0.24, 0, Pose.Type, 0, 1, { hip: 0.5 })],
    standing: [s(U.seat, 0, 0.22, 0, Pose.StandType, 0, 1, { y: 0.024 })],
    helpdesk: [s(U.seat, 0, 0.24, 0, Pose.Type, 0, 1, { hip: 0.5 })],
    exec: [s(U.seat, -0.2, 0.3, 0, Pose.Type, -0.5, 1, { hip: 0.5 })],
    bench: [s(U.station, 0.1, 0.56, 0, Pose.Perch, 0.5, 1, { hip: 0.66, role: 'researcher' })],
    devrig: [s(U.station, 0, 0.56, 0, Pose.Tend, 0, 1, { role: 'engineer' })],
    printer3d: [s(U.look, 0, 0.72, 0, Pose.Look, 0, 1)],
    server: [s(U.station, 0, 0.9, 0, Pose.Tend, 0, 1, { role: 'software' })],
    design: [s(U.station, -0.4, 0.62, 0, Pose.Perch, -0.5, 1, { hip: 0.72, role: 'designer' }), s(U.station, 0.4, 0.62, 0, Pose.Perch, 0.5, 1, { hip: 0.72, role: 'designer' })],
    media: [s(U.station, 0.2, 0.78, 0, Pose.Film, 0.5, 1, { role: 'marketer' })],
    meeting,
    coffee: [s(U.coffee | U.lunch, -0.4, 0.36, 0, Pose.Bar, -0.5, 1, { hip: 0.78 }), s(U.coffee | U.lunch, 0.4, 0.36, 0, Pose.Bar, 0.5, 1, { hip: 0.78 })],
    cafe: [s(U.lunch | U.coffee, 0.36, 0, HALF, Pose.Sit, 1, 0, { hip: 0.5 }), s(U.lunch | U.coffee, -0.36, 0, -HALF, Pose.Sit, -1, 0, { hip: 0.5 })],
    vending: [s(U.coffee, 0, 0.8, 0, Pose.Hold, 0, 1)],
    sofa,
    armchair: [s(U.coffee | U.wait, 0, -0.05, 0, Pose.Lounge, 0, -1, { hip: 0.48 })],
    pingpong: [s(U.coffee | U.gym, 1.5, 0, HALF, Pose.Play, 1.5, 0), s(U.coffee | U.gym, -1.5, 0, -HALF, Pose.Play, -1.5, 0)],
    arcade: [s(U.coffee, 0, 0.74, 0, Pose.Tend, 0, 1)],
    booth: [s(U.coffee, 0, 0.05, Math.PI, Pose.Phone, 0, 1, { hip: 0.57 })],
    treadmill: [s(U.gym, 0, 0.2, 0, Pose.Run, 0, 1.5, { y: 0.19 })],
    weights: [s(U.gym, -0.46, 0.82, 0, Pose.Curl, -0.5, 1)],
    yoga: [s(U.gym, -0.46, 0, 0, Pose.Stretch, -0.5, 0), s(U.gym, 0.46, 0, 0, Pose.Stretch, 0.5, 0)],
    whiteboard: [s(U.think, 0, 0.42, 0, Pose.Write, 0, 1), s(U.present, -0.62, 0.45, Math.PI, Pose.Present, -0.5, 1)],
    // the foot of the stairs, the lift doors and the foot of an escalator: where people bound upstairs go up
    // (up the flight, step by step, to the top, where they go on up out of this floor's view)
    stairs: [s(0, 0, -1.3, 0, Pose.Stand, 0, 2, { y: 2.6, via: [[0, 0.29, 1.35], [0, 1.45, 0.05]] })],
    escalator: [s(0, 0, -1.8, 0, Pose.Stand, 0, 2.5, { y: 2.6, via: [[0, 0.21, 1.8], [0, 1.45, 0.05]] })],
    lift: [s(0, 0, 1.25, 0, Pose.Stand, 0, 1.5)],
    // whoever leads a meeting in the room stands beside the screen, facing the table
    screen: [s(U.present, 1.15, 0.45, Math.PI, Pose.Present, 1, 1)],
    reception,
    showcase: [s(U.look, 0, 0.86, 0, Pose.Look, 0, 1)],
    aquarium: [s(U.look, -0.4, 0.86, 0, Pose.Look, -0.5, 1)],
    logowall: [s(U.look, 0.3, 0.9, 0, Pose.Look, 0.5, 1)],
    bookshelf: [s(U.look, 0, 0.8, 0, Pose.Look, 0, 1)],
    sculpture: [s(U.look, 0, 0.9, 0, Pose.Look, 0, 1)],
    fountain: [s(U.look, 0, 2, 0, Pose.Look, 0, 2), s(U.look, -2, 0, -HALF, Pose.Look, -2, 0)],
    gbench: [s(U.lunch | U.coffee | U.wait, -0.45, 0, Math.PI, Pose.Sit, -0.5, 1, { hip: 0.52 }), s(U.lunch | U.coffee | U.wait, 0.45, 0, Math.PI, Pose.Sit, 0.5, 1, { hip: 0.52 })],
  },
  factory: {
    // the people who work a line: at the front of each machine, where its controls are
    smt: [behind(s(U.station, -0.6, 0.88, 0, Pose.Tend, -1, 1))],
    // at the far end of the cell from the test station that usually follows it, so the two are not shoulder to shoulder
    robot: [behind(s(U.station, -0.5, 1.34, 0, Pose.Tend, -0.5, 1.5))],
    manual: [s(U.station, 0, 0.3, 0, Pose.Perch, 0, 1, { hip: 0.54 })],
    test: [behind(s(U.station, -0.24, 0.88, 0, Pose.Tend, 0, 1))],
    pack: [behind(s(U.station, 0.48, 0.88, 0, Pose.Tend, 0.5, 1)), forkAt(U.press, -0.5, false)],
    console: [s(U.station, -0.4, 0.5, 0, Pose.Type, -0.5, 1, { hip: 0.5 }), s(U.station, 0.4, 0.5, 0, Pose.Type, 0.5, 1, { hip: 0.5 })],
    qa: [behind(s(U.station, 0.2, 0.74, 0, Pose.Tend, 0.5, 1))],
    // where a pallet truck is loaded, and where it is set down
    rack: [forkAt(U.press, 0.5, true)],
    pallets: [forkAt(U.press, 0, true)],
    dock_out: [forkAt(U.crew, 0.5, false)],
    canteen: [
      s(U.lunch, -0.5, 0.42, 0, Pose.Sit, -0.5, 1, { hip: 0.47 }),
      s(U.lunch, 0.5, 0.42, 0, Pose.Sit, 0.5, 1, { hip: 0.47 }),
      s(U.lunch, -0.5, -0.42, Math.PI, Pose.Sit, -0.5, -1, { hip: 0.47 }),
      s(U.lunch, 0.5, -0.42, Math.PI, Pose.Sit, 0.5, -1, { hip: 0.47 }),
    ],
  },
  store: {
    table,
    demo: [s(U.browse, 0, 0.8, 0, Pose.Hold, 0, 1), s(U.browse, 0.8, 0, HALF, Pose.Hold, 1, 0)],
    shelf: [s(U.browse, -0.5, 0.8, 0, Pose.Look, -0.5, 1), s(U.browse, 0.5, 0.8, 0, Pose.Look, 0.5, 1)],
    counter: [0, 1, 2, 3, 4].map((q) => s(U.queue, 0, 0.8 + q, 0, Pose.Queue, 0, 1 + q, { q })),
    support: [s(U.help, -0.5, 0.4, 0, Pose.Bar, -0.5, 1, { hip: 0.78 }), s(U.help, 0.5, 0.4, 0, Pose.Bar, 0.5, 1, { hip: 0.78 })],
    forum: [s(U.browse, -0.8, 1.6, 0, Pose.Look, -1, 1), s(U.browse, 0.8, 1.6, 0, Pose.Look, 1, 1)],
    logowall: [s(U.browse, 0.3, 0.9, 0, Pose.Look, 0.5, 1)],
  },
  venue: {
    seats: seating(0),
    seats_mid: seating(0.5),
    seats_high: seating(1.0),
    stage: stageDefs(6, 4),
    stage_l: stageDefs(10, 5),
    stage_xl: stageDefs(16, 6),
    screen: [s(U.crew, -1.6, 0.85, 0, Pose.Look, -1.5, 1)],
    screen_l: [s(U.crew, -3.6, 0.85, 0, Pose.Look, -3.5, 1)],
    screen_xl: [s(U.crew, -6.6, 0.85, 0, Pose.Look, -6.5, 1)],
    lights: [s(U.crew, 0, 0.82, 0, Pose.Fix, 0, 1)],
    speakers: [s(U.crew, 0, 0.84, 0, Pose.Fix, 0, 1)],
    camera: [
      s(U.press, -0.45, 0.42, 0, Pose.Film, -0.5, 1.5, { y: 0.6, via: [[-0.45, 0.6, 0.9]] }),
      s(U.press, 0.45, 0.42, 0, Pose.Film, 0.5, 1.5, { y: 0.6, via: [[0.45, 0.6, 0.9]] }),
    ],
    demo: table,
    reception,
    sofa,
    logowall: [s(U.look, 0.3, 0.9, 0, Pose.Look, 0.5, 1)],
    fountain: [s(U.look, 0, 2, 0, Pose.Look, 0, 2)],
  },
}

export interface Spot {
  key: string
  item: SiteItem
  use: number
  /** World position and facing. */
  x: number
  z: number
  y: number
  face: number
  pose: Pose
  hip: number
  /** Tile to step in from, or -1 when the spot is boxed in. */
  access: number
  /** Room the spot is in, 0 outdoors. */
  room: number
  role?: Role
  q: number
  /** True when the person stands on open floor that others walk across, rather than in or on the furniture. */
  open: boolean
  /** A seat in a row: reached by shuffling sideways along the row in front of the seats. */
  row: boolean
  /** World points to pass on the way in from the access tile, as x, y, z triples. */
  via?: number[]
  /** Whoever is using or heading for the spot. */
  taken: object | null
}

/** Where an item's own frame sits in the world. */
export interface ItemFrame {
  cx: number
  cz: number
  a: number
  cos: number
  sin: number
}

export function frameOf(site: Site, item: SiteItem): ItemFrame {
  const def = ITEMS[site.kind][item.kind]
  const turned = item.rot % 2 === 1
  const a = (-item.rot * Math.PI) / 2
  return { cx: item.x - site.w / 2 + (turned ? def.h : def.w) / 2, cz: item.y - site.h / 2 + (turned ? def.w : def.h) / 2, a, cos: Math.cos(a), sin: Math.sin(a) }
}
export const frameX = (f: ItemFrame, x: number, z: number) => f.cx + x * f.cos + z * f.sin
export const frameZ = (f: ItemFrame, x: number, z: number) => f.cz - x * f.sin + z * f.cos

export interface SeatPlace {
  item: SiteItem
  /** Index of the seat within its block: the spot's key is `${item.id}:${index}`. */
  index: number
  x: number
  y: number
  z: number
  face: number
}

const isSeating = (kind: string) => kind === 'seats' || kind === 'seats_mid' || kind === 'seats_high'

/** The floor height of the row of seats at a point, given in an item's frame; -1 where there are no seats facing the same way. */
function rowAt(site: Site, item: SiteItem, f: ItemFrame, lx: number, lz: number): number {
  const wx = frameX(f, lx, lz)
  const wz = frameZ(f, lx, lz)
  const tx = Math.floor(wx + site.w / 2)
  const ty = Math.floor(wz + site.h / 2)
  if (tx < 0 || ty < 0 || tx >= site.w || ty >= site.h) return -1
  const other = itemAt(site, tx, ty)
  if (!other || !isSeating(other.kind) || other.rot % 4 !== item.rot % 4) return -1
  const fo = frameOf(site, other)
  const back = (wx - fo.cx) * fo.sin + (wz - fo.cz) * fo.cos > 0.06
  return seatRows(RISER[other.kind])[back ? 1 : 0].y
}

/**
 * Which sides of a seating block are open to an aisle: 1 for its left (-x in its own frame), 2 for its right.
 * A raised block has a flight of steps down each open side.
 */
export function seatAisles(site: Site, item: SiteItem): number {
  if (!isSeating(item.kind)) return 0
  const f = frameOf(site, item)
  let out = 0
  for (const dir of [-1, 1]) {
    let open = true
    for (const lz of [-0.5, 0.5]) {
      const tx = Math.floor(frameX(f, dir * 2, lz) + site.w / 2)
      const ty = Math.floor(frameZ(f, dir * 2, lz) + site.h / 2)
      if (tx < 0 || ty < 0 || tx >= site.w || ty >= site.h || itemAt(site, tx, ty)) open = false
    }
    if (open) out |= dir < 0 ? 1 : 2
  }
  return out
}

/**
 * The order a house fills in: the rows nearest the stage first, each row in no particular order, with a little
 * overlap between one row and the next. Returns, for each seat, its place in that order.
 */
export function seatRank(places: { x: number; z: number; face: number }[]): Int32Array {
  const hash = (n: number) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
  }
  // how far forward each seat is, along the way it faces
  const key = places.map((p, i) => -(p.x * -Math.sin(p.face) + p.z * -Math.cos(p.face)) + hash(i * 7.31 + 1.7) * 1.35)
  const by = places.map((_, i) => i).sort((a, b) => key[a] - key[b])
  const rank = new Int32Array(places.length)
  by.forEach((seat, k) => (rank[seat] = k))
  return rank
}

/** Every audience seat of a venue, in world coordinates. Needs no walking map, so a show can be drawn without one. */
export function seatPlaces(site: Site): SeatPlace[] {
  const out: SeatPlace[] = []
  if (site.kind !== 'venue') return out
  for (const item of site.items) {
    if (!isSeating(item.kind)) continue
    const f = frameOf(site, item)
    DEFS.venue[item.kind].forEach((d, index) => out.push({ item, index, x: frameX(f, d.x, d.z), y: d.y ?? 0, z: frameZ(f, d.x, d.z), face: f.a + d.face }))
  }
  return out
}

/** Every spot on the site, in world coordinates, with the tile it is reached from. */
export function buildSpots(site: Site, nav: Nav): Spot[] {
  const out: Spot[] = []
  const defs = DEFS[site.kind]
  const { w, h } = site
  for (const item of site.items) {
    const list = defs[item.kind]
    const def = ITEMS[site.kind][item.kind]
    if (!list || !def) continue
    const f = frameOf(site, item)
    const tiles = itemTiles(site, item)
    const room = gridAt(site, item.x, item.y)
    const inItem = (t: number) => tiles.some(([x, y]) => y * w + x === t)
    const usable = (t: number) => t >= 0 && nav.walk[t] === 1 && gridAt(site, t % w, (t / w) | 0) === room
    list.forEach((d0, i) => {
      // the first of the places it could be that can be walked to
      let d = d0
      if (d0.alts) {
        for (const c of [d0, ...d0.alts.map((a): SpotDef => ({ ...d0, ...a, alts: undefined }))]) {
          if (!usable(nav.tileAt(frameX(f, c.ax, c.az), frameZ(f, c.ax, c.az)))) continue
          d = c
          break
        }
      }
      const x = frameX(f, d.x, d.z)
      const z = frameZ(f, d.x, d.z)
      let access = -1
      let via: number[] | undefined
      if (d.row) {
        // from the aisle at whichever end of the row is nearer (across any seating blocks set side by side), then
        // sideways along the strip of floor in front of the seats
        const y = d.y ?? 0
        const strip = d.z - LEGROOM
        let best = Infinity
        for (const dir of [-1, 1]) {
          let k = 1
          let end = -1
          for (; k < 40; k++) {
            const t = nav.tileAt(frameX(f, d.x + dir * k * 0.5, d.z), frameZ(f, d.x + dir * k * 0.5, d.z))
            if (t < 0) break
            if (usable(t)) {
              end = t
              break
            }
            const other = itemAt(site, t % w, (t / w) | 0)
            if (!other || !isSeating(other.kind) || other.rot % 4 !== item.rot % 4) break
          }
          if (end < 0) continue
          // the side of the last block in the row, and the middle of the steps that run down it
          const edge = d.x + dir * ((k - 1) * 0.5 + 0.25)
          const aisle = edge + dir * STAIR_X
          const pts: number[] = []
          let from = end
          // how good a way in this is: the walk along the row, and a long way further if there are no steps to it
          let cost = k
          if (y > 0) {
            // a raised row: up the steps from the foot of the bank of seating, one row at a time
            const climb: [number, number][] = []
            let foot = -1
            let lz = d.z
            for (let j = 0; j < 40; j++, lz -= 1) {
              const t = nav.tileAt(frameX(f, aisle, lz - LEGROOM), frameZ(f, aisle, lz - LEGROOM))
              if (!usable(t)) break
              const floor = rowAt(site, item, f, edge - dir * 0.25, lz)
              climb.push([lz - LEGROOM, Math.max(0, floor)])
              if (floor <= 0) {
                foot = t
                // every other seat is come at from a tile further out, so the foot of the steps is not one crowded tile
                const out = nav.tileAt(frameX(f, aisle, lz - LEGROOM - 1), frameZ(f, aisle, lz - LEGROOM - 1))
                if (i % 2 === 1 && usable(out)) foot = out
                break
              }
            }
            if (foot >= 0) {
              from = foot
              for (let j = climb.length - 1; j >= 0; j--) pts.push(frameX(f, aisle, climb[j][0]), climb[j][1], frameZ(f, aisle, climb[j][0]))
            } else {
              // nothing but a step up from the aisle beside the row: only if the other end is no better
              cost += 100
              pts.push(frameX(f, aisle, strip), y, frameZ(f, aisle, strip))
            }
          } else pts.push(frameX(f, aisle, strip), 0, frameZ(f, aisle, strip))
          pts.push(frameX(f, d.x, strip), y, frameZ(f, d.x, strip))
          if (cost >= best) continue
          best = cost
          access = from
          via = pts
        }
      } else {
        access = nav.tileAt(frameX(f, d.ax, d.az), frameZ(f, d.ax, d.az))
        if (d.via) via = d.via.flatMap(([vx, vy, vz]) => [frameX(f, vx, vz), vy, frameZ(f, vx, vz)])
      }
      if (!usable(access) && d.strict) return
      if (!usable(access)) {
        // the marked way in is blocked: any free tile beside the spot will do
        const own = nav.tileAt(x, z)
        access = -1
        if (usable(own)) access = own
        else if (own >= 0) {
          let best = Infinity
          for (const [tx, ty] of tiles) {
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = tx + dx
              const ny = ty + dy
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
              const t = ny * w + nx
              if (inItem(t) || !usable(t)) continue
              const dist = (nav.cx(t) - x) ** 2 + (nav.cz(t) - z) ** 2
              if (dist < best) {
                best = dist
                access = t
              }
            }
          }
        }
        // whatever route was marked started from the tile that is blocked
        via = undefined
      }
      // a queue only reaches as far back as there is clear floor
      if (d.q !== undefined && d.q > 0 && (access < 0 || nav.tileAt(x, z) !== access)) return
      const own = nav.tileAt(x, z)
      out.push({ key: `${item.id}:${i}`, item, use: d.use, x, z, y: d.y ?? 0, face: f.a + d.face, pose: d.pose, hip: d.hip ?? 0.86, access, room, role: d.role, q: d.q ?? 0, open: own >= 0 && nav.walk[own] === 1, row: !!d.row, via, taken: null })
    })
  }
  return out
}
