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
export const USE = { seat: 1, station: 2, meet: 4, lunch: 8, coffee: 16, gym: 32, think: 64, look: 128, visit: 256, wait: 512, browse: 1024, queue: 2048, help: 4096, guest: 8192, host: 16384, crew: 32768, press: 65536 } as const

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
}

const s = (use: number, x: number, z: number, face: number, pose: Pose, ax: number, az: number, extra: Partial<SpotDef> = {}): SpotDef => ({ use, x, z, face, pose, ax, az, ...extra })
const U = USE
const HALF = Math.PI / 2

const meeting: SpotDef[] = [-0.5, 0, 0.5].flatMap((x) => [s(U.meet, x, 0.72, 0, Pose.Meet, x < 0 ? -0.5 : 0.5, 1.5, { hip: 0.5 }), s(U.meet, x, -0.72, Math.PI, Pose.Meet, x > 0 ? 0.5 : -0.5, -1.5, { hip: 0.5 })])

/** Height of the stage floor, shared with the stage's model. */
export const STAGE_H = 0.9
/** Seat rows of a seating block on a riser `h` high: two rows of six, the back row a step up. */
export const seatRows = (h: number) => [0, 1].map((row) => ({ z: row ? 0.56 : -0.44, y: h + (h > 0 ? row * 0.24 : 0) }))
const seating = (h: number): SpotDef[] => seatRows(h).flatMap((r) => Array.from({ length: 6 }, (_, i) => s(U.guest, -1.25 + i * 0.5, r.z, 0, Pose.Sit, i < 3 ? -2 : 2, r.z, { y: r.y, hip: 0.52, row: true })))
const sofa = [s(U.coffee | U.lunch | U.wait, -0.45, -0.06, 0, Pose.Lounge, -0.5, -1, { hip: 0.47 }), s(U.coffee | U.lunch | U.wait, 0.45, -0.06, 0, Pose.Lounge, 0.5, -1, { hip: 0.47 })]
const table = [s(U.browse, -0.5, 0.82, 0, Pose.Hold, -0.5, 1), s(U.browse, 0.5, 0.82, 0, Pose.Hold, 0.5, 1), s(U.browse, -0.5, -0.82, Math.PI, Pose.Hold, -0.5, -1), s(U.browse, 0.5, -0.82, Math.PI, Pose.Hold, 0.5, -1)]
const reception = [s(U.visit, -0.5, 0.86, 0, Pose.Stand, -0.5, 1), s(U.visit, 0.5, 0.86, 0, Pose.Stand, 0.5, 1)]
/** Up the two steps at stage left, then across the boards. */
const STEPS: [number, number, number][] = [
  [-2.45, 0, 2.05],
  [-2.45, 0.3, 1.77],
  [-2.45, 0.6, 1.47],
  [-2.45, STAGE_H + 0.012, 1.1],
]

const DEFS: Record<SiteKind, Record<string, SpotDef[]>> = {
  office: {
    desk: [s(U.seat, 0, 0.24, 0, Pose.Type, 0, 1, { hip: 0.5 })],
    standing: [s(U.seat, 0, 0.22, 0, Pose.StandType, 0, 1, { y: 0.024 })],
    helpdesk: [s(U.seat, 0, 0.24, 0, Pose.Type, 0, 1, { hip: 0.5 })],
    exec: [s(U.seat, -0.2, 0.3, 0, Pose.Type, -0.5, 1, { hip: 0.5 })],
    bench: [s(U.station, 0.1, 0.56, 0, Pose.Perch, 0.5, 1, { hip: 0.66, role: 'researcher' })],
    devrig: [s(U.station, 0, 0.56, 0, Pose.Tend, 0, 1, { role: 'engineer' })],
    printer3d: [s(U.look, 0, 0.72, 0, Pose.Look, 0, 1)],
    server: [s(U.station, 0, 0.82, 0, Pose.Tend, 0, 1, { role: 'software' })],
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
    whiteboard: [s(U.think, 0, 0.42, 0, Pose.Write, 0, 1)],
    reception,
    showcase: [s(U.look, 0, 0.86, 0, Pose.Look, 0, 1)],
    aquarium: [s(U.look, -0.4, 0.86, 0, Pose.Look, -0.5, 1)],
    logowall: [s(U.look, 0.3, 0.9, 0, Pose.Look, 0.5, 1)],
    bookshelf: [s(U.look, 0, 0.8, 0, Pose.Look, 0, 1)],
    sculpture: [s(U.look, 0, 0.9, 0, Pose.Look, 0, 1)],
    fountain: [s(U.look, 0, 2, 0, Pose.Look, 0, 2), s(U.look, -2, 0, -HALF, Pose.Look, -2, 0)],
    gbench: [s(U.lunch | U.coffee | U.wait, -0.45, 0, Math.PI, Pose.Sit, -0.5, 1, { hip: 0.52 }), s(U.lunch | U.coffee | U.wait, 0.45, 0, Math.PI, Pose.Sit, 0.5, 1, { hip: 0.52 })],
  },
  factory: {},
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
    stage: [
      // at the lectern, and out in the middle beside the plinth: both face the house
      s(U.host, 2.0, 0.3, Math.PI, Pose.Present, -2.5, 2.5, { y: STAGE_H + 0.012, via: STEPS }),
      s(U.host, -0.75, 0.75, Math.PI, Pose.Present, -2.5, 2.5, { y: STAGE_H + 0.012, via: STEPS }),
      // a stagehand checking the front of the stage from the floor
      s(U.crew, 1.2, 2.45, 0, Pose.Fix, 1.5, 2.5),
    ],
    screen: [s(U.crew, -1.6, 0.85, 0, Pose.Look, -1.5, 1)],
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
    list.forEach((d, i) => {
      const x = frameX(f, d.x, d.z)
      const z = frameZ(f, d.x, d.z)
      let access = -1
      let via: number[] | undefined
      if (d.row) {
        // along the row to whichever end has floor to stand on, across any seating blocks set side by side
        let best = Infinity
        for (const dir of [-1, 1]) {
          for (let k = 1; k < 40; k++) {
            const px = frameX(f, d.x + dir * k * 0.5, d.z)
            const pz = frameZ(f, d.x + dir * k * 0.5, d.z)
            const t = nav.tileAt(px, pz)
            if (t < 0) break
            if (nav.walk[t] === 1) {
              if (k < best) {
                best = k
                access = t
                // step up onto the row at its end, then sidle along it
                via = [frameX(f, d.x + dir * (k - 1) * 0.5, d.z), d.y ?? 0, frameZ(f, d.x + dir * (k - 1) * 0.5, d.z)]
              }
              break
            }
            const other = itemAt(site, t % w, (t / w) | 0)
            if (!other || !isSeating(other.kind) || other.rot % 4 !== item.rot % 4) break
          }
        }
      } else {
        access = nav.tileAt(frameX(f, d.ax, d.az), frameZ(f, d.ax, d.az))
        if (d.via) via = d.via.flatMap(([vx, vy, vz]) => [frameX(f, vx, vz), vy, frameZ(f, vx, vz)])
      }
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
      out.push({ key: `${item.id}:${i}`, item, use: d.use, x, z, y: d.y ?? 0, face: f.a + d.face, pose: d.pose, hip: d.hip ?? 0.86, access, room, role: d.role, q: d.q ?? 0, open: own >= 0 && nav.walk[own] === 1, via, taken: null })
    })
  }
  return out
}
