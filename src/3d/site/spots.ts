// Places on the furniture where a person can be: the chair at a desk, a stool
// at the coffee bar, a spot in front of the vending machine. Each is given in
// the item's own frame (centred on its footprint, front toward +Z) and turned
// into world positions for the site as built.
import { ITEMS, gridAt, itemTiles } from '../../sim/sites'
import type { Role, Site, SiteItem, SiteKind } from '../../sim/types'
import type { Nav } from './nav'

/** How a person holds themselves at a spot. */
export const Pose = { Stand: 0, Sit: 1, Type: 2, StandType: 3, Perch: 4, Lounge: 5, Run: 6, Stretch: 7, Curl: 8, Write: 9, Play: 10, Hold: 11, Phone: 12, Look: 13, Pack: 14, Meet: 15, Bar: 16 } as const
export type Pose = (typeof Pose)[keyof typeof Pose]

/** What a spot is for. A spot can serve several purposes. */
export const USE = { seat: 1, station: 2, meet: 4, lunch: 8, coffee: 16, gym: 32, think: 64, look: 128, visit: 256, wait: 512, browse: 1024, queue: 2048, help: 4096 } as const

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
}

const s = (use: number, x: number, z: number, face: number, pose: Pose, ax: number, az: number, extra: Partial<SpotDef> = {}): SpotDef => ({ use, x, z, face, pose, ax, az, ...extra })
const U = USE
const HALF = Math.PI / 2

const meeting: SpotDef[] = [-0.5, 0, 0.5].flatMap((x) => [s(U.meet, x, 0.72, 0, Pose.Meet, x < 0 ? -0.5 : 0.5, 1.5, { hip: 0.5 }), s(U.meet, x, -0.72, Math.PI, Pose.Meet, x > 0 ? 0.5 : -0.5, -1.5, { hip: 0.5 })])

const DEFS: Record<SiteKind, Record<string, SpotDef[]>> = {
  office: {
    desk: [s(U.seat, 0, 0.24, 0, Pose.Type, 0, 1, { hip: 0.5 })],
    standing: [s(U.seat, 0, 0.22, 0, Pose.StandType, 0, 1, { y: 0.024 })],
    helpdesk: [s(U.seat, 0, 0.24, 0, Pose.Type, 0, 1, { hip: 0.5 })],
    exec: [s(U.seat, -0.2, 0.3, 0, Pose.Type, -0.5, 1, { hip: 0.5 })],
    bench: [s(U.station, 0.1, 0.56, 0, Pose.Perch, 0.5, 1, { hip: 0.66, role: 'researcher' })],
    devrig: [s(U.station, 0, 0.56, 0, Pose.StandType, 0, 1, { role: 'engineer' })],
    printer3d: [s(U.look, 0, 0.72, 0, Pose.Look, 0, 1)],
    server: [s(U.station, 0, 0.82, 0, Pose.StandType, 0, 1, { role: 'software' })],
    design: [s(U.station, -0.4, 0.62, 0, Pose.Perch, -0.5, 1, { hip: 0.72, role: 'designer' }), s(U.station, 0.4, 0.62, 0, Pose.Perch, 0.5, 1, { hip: 0.72, role: 'designer' })],
    media: [s(U.station, 0.2, 0.78, 0, Pose.Hold, 0.5, 1, { role: 'marketer' })],
    meeting,
    coffee: [s(U.coffee | U.lunch, -0.4, 0.36, 0, Pose.Bar, -0.5, 1, { hip: 0.78 }), s(U.coffee | U.lunch, 0.4, 0.36, 0, Pose.Bar, 0.5, 1, { hip: 0.78 })],
    cafe: [s(U.lunch | U.coffee, 0.36, 0, HALF, Pose.Sit, 1, 0, { hip: 0.5 }), s(U.lunch | U.coffee, -0.36, 0, -HALF, Pose.Sit, -1, 0, { hip: 0.5 })],
    vending: [s(U.coffee, 0, 0.8, 0, Pose.Hold, 0, 1)],
    sofa: [s(U.coffee | U.lunch | U.wait, -0.45, -0.06, 0, Pose.Lounge, -0.5, -1, { hip: 0.47 }), s(U.coffee | U.lunch | U.wait, 0.45, -0.06, 0, Pose.Lounge, 0.5, -1, { hip: 0.47 })],
    armchair: [s(U.coffee | U.wait, 0, -0.05, 0, Pose.Lounge, 0, -1, { hip: 0.48 })],
    pingpong: [s(U.coffee | U.gym, 1.5, 0, HALF, Pose.Play, 1.5, 0), s(U.coffee | U.gym, -1.5, 0, -HALF, Pose.Play, -1.5, 0)],
    arcade: [s(U.coffee, 0, 0.74, 0, Pose.StandType, 0, 1)],
    booth: [s(U.coffee, 0, 0.05, Math.PI, Pose.Phone, 0, 1, { hip: 0.57 })],
    treadmill: [s(U.gym, 0, 0.2, 0, Pose.Run, 0, 1.5, { y: 0.19 })],
    weights: [s(U.gym, -0.46, 0.82, 0, Pose.Curl, -0.5, 1)],
    yoga: [s(U.gym, -0.46, 0, 0, Pose.Stretch, -0.5, 0), s(U.gym, 0.46, 0, 0, Pose.Stretch, 0.5, 0)],
    whiteboard: [s(U.think, 0, 0.42, 0, Pose.Write, 0, 1)],
    reception: [s(U.visit, -0.5, 0.86, 0, Pose.Stand, -0.5, 1), s(U.visit, 0.5, 0.86, 0, Pose.Stand, 0.5, 1)],
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
    table: [s(U.browse, -0.5, 0.82, 0, Pose.Hold, -0.5, 1), s(U.browse, 0.5, 0.82, 0, Pose.Hold, 0.5, 1), s(U.browse, -0.5, -0.82, Math.PI, Pose.Hold, -0.5, -1), s(U.browse, 0.5, -0.82, Math.PI, Pose.Hold, 0.5, -1)],
    demo: [s(U.browse, 0, 0.8, 0, Pose.Hold, 0, 1), s(U.browse, 0.8, 0, HALF, Pose.Hold, 1, 0)],
    shelf: [s(U.browse, -0.5, 0.8, 0, Pose.Look, -0.5, 1), s(U.browse, 0.5, 0.8, 0, Pose.Look, 0.5, 1)],
    counter: [0, 1, 2, 3, 4].map((q) => s(U.queue, 0, 0.8 + q, 0, Pose.Stand, 0, 1 + q, { q })),
    support: [s(U.help, -0.5, 0.4, 0, Pose.Bar, -0.5, 1, { hip: 0.78 }), s(U.help, 0.5, 0.4, 0, Pose.Bar, 0.5, 1, { hip: 0.78 })],
    forum: [s(U.browse, -0.8, 1.6, 0, Pose.Look, -1, 1), s(U.browse, 0.8, 1.6, 0, Pose.Look, 1, 1)],
    logowall: [s(U.browse, 0.3, 0.9, 0, Pose.Look, 0.5, 1)],
  },
  venue: {},
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
  /** Whoever is using or heading for the spot. */
  taken: object | null
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
    const turned = item.rot % 2 === 1
    const cx = item.x - w / 2 + (turned ? def.h : def.w) / 2
    const cz = item.y - h / 2 + (turned ? def.w : def.h) / 2
    const a = (-item.rot * Math.PI) / 2
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const tiles = itemTiles(site, item)
    const room = gridAt(site, item.x, item.y)
    const inItem = (t: number) => tiles.some(([x, y]) => y * w + x === t)
    const usable = (t: number) => t >= 0 && nav.walk[t] === 1 && gridAt(site, t % w, (t / w) | 0) === room
    list.forEach((d, i) => {
      const x = cx + d.x * cos + d.z * sin
      const z = cz - d.x * sin + d.z * cos
      let access = nav.tileAt(cx + d.ax * cos + d.az * sin, cz - d.ax * sin + d.az * cos)
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
      }
      // a queue only reaches as far back as there is clear floor
      if (d.q !== undefined && d.q > 0 && (access < 0 || nav.tileAt(x, z) !== access)) return
      out.push({ key: `${item.id}:${i}`, item, use: d.use, x, z, y: d.y ?? 0, face: a + d.face, pose: d.pose, hip: d.hip ?? 0.86, access, room, role: d.role, q: d.q ?? 0, taken: null })
    })
  }
  return out
}
