// Buildable sites: offices, factories and stores share one tile-based layout
// model. This file holds what can be built and what the result is worth.
import type { Role, Site, SiteItem, SiteKind, SiteWall } from './types'

export type Stage = 'in' | 'out' | 'belt' | 'smt' | 'assembly' | 'test' | 'pack'

export interface ItemDef {
  name: string
  cost: number
  /** Footprint in tiles before rotation. */
  w: number
  h: number
  group: string
  note: string
  /** Office: one employee can work here. */
  seats?: boolean
  comfort?: number
  prestige?: number
  /** Office: boosts one seated employee of this role. */
  station?: Role
  /** Factory: what this machine does, its units per day and its daily running cost. */
  stage?: Stage
  cap?: number
  run?: number
  /** Store: shoppers per day this fixture can serve. */
  visitors?: number
  /** Lies flat on the floor (rugs). */
  flat?: boolean
}

const d = (name: string, cost: number, w: number, h: number, group: string, note: string, extra: Partial<ItemDef> = {}): ItemDef => ({ name, cost, w, h, group, note, ...extra })

export const ITEMS: Record<SiteKind, Record<string, ItemDef>> = {
  office: {
    desk: d('Desk', 1200, 1, 1, 'Work', 'Seats one employee.', { seats: true }),
    standing: d('Standing desk', 2200, 1, 1, 'Work', 'Seats one employee and adds a little comfort.', { seats: true, comfort: 0.3 }),
    exec: d('Executive desk', 9000, 2, 1, 'Work', 'Seats one employee. Impresses visitors.', { seats: true, prestige: 2 }),
    bench: d('Lab bench', 14000, 2, 1, 'Work', 'Boosts one researcher by 25%.', { station: 'researcher' }),
    server: d('Server rack', 20000, 1, 1, 'Work', 'Boosts one hardware engineer by 25%.', { station: 'engineer' }),
    devrig: d('Device test rig', 12000, 1, 1, 'Work', 'Boosts one software engineer by 25%.', { station: 'software' }),
    design: d('Design table', 11000, 2, 1, 'Work', 'Boosts one designer by 25%.', { station: 'designer' }),
    media: d('Media studio', 13000, 2, 1, 'Work', 'Boosts one marketer by 25%.', { station: 'marketer' }),
    helpdesk: d('Support console', 6000, 1, 1, 'Work', 'Boosts one support agent by 25%.', { station: 'support' }),
    meeting: d('Meeting table', 9000, 2, 2, 'Rooms', 'Seats six for meetings. Adds comfort.', { comfort: 3 }),
    booth: d('Phone booth', 4000, 1, 1, 'Rooms', 'A quiet place for calls.', { comfort: 1 }),
    whiteboard: d('Whiteboard', 600, 1, 1, 'Rooms', 'Somewhere to think out loud.', { comfort: 0.4 }),
    reception: d('Reception desk', 5000, 2, 1, 'Rooms', 'Greets visitors. Adds prestige.', { prestige: 2 }),
    stage: d('Auditorium stage', 250000, 4, 3, 'Rooms', 'Lets you host launch keynotes on your own campus.', { prestige: 6 }),
    coffee: d('Coffee bar', 3000, 2, 1, 'Comfort', 'Everyone ends up here.', { comfort: 2.5 }),
    sofa: d('Sofa', 2000, 2, 1, 'Comfort', 'A place to sit that is not a desk.', { comfort: 1.6 }),
    armchair: d('Armchair', 700, 1, 1, 'Comfort', 'A single comfortable seat.', { comfort: 0.7 }),
    pingpong: d('Table tennis', 1500, 2, 1, 'Comfort', 'For breaks that get competitive.', { comfort: 2 }),
    arcade: d('Arcade cabinet', 2500, 1, 1, 'Comfort', 'A classic in the corner.', { comfort: 1.2 }),
    plant: d('Plant', 250, 1, 1, 'Decor', 'Adds a little comfort.', { comfort: 0.5 }),
    tree: d('Indoor tree', 1800, 1, 1, 'Decor', 'A statement plant.', { comfort: 1, prestige: 0.5 }),
    bookshelf: d('Bookshelf', 900, 1, 1, 'Decor', 'Books, awards and prototypes.', { comfort: 0.4 }),
    rug: d('Rug', 800, 2, 2, 'Decor', 'Softens a room. Furniture cannot sit on it.', { comfort: 0.5, flat: true }),
    logowall: d('Logo wall', 3500, 2, 1, 'Decor', 'Your logo, lit. Adds prestige.', { prestige: 2 }),
    aquarium: d('Aquarium', 7000, 2, 1, 'Decor', 'Calming, and visitors notice it.', { comfort: 1.2, prestige: 1.5 }),
    sculpture: d('Sculpture', 15000, 1, 1, 'Decor', 'Pure prestige.', { prestige: 4 }),
  },
  factory: {
    dock_in: d('Receiving dock', 20000, 2, 1, 'Line', 'Components arrive here. A line starts at a receiving dock.', { stage: 'in' }),
    dock_out: d('Shipping dock', 20000, 2, 1, 'Line', 'Finished devices leave here. A line ends at a shipping dock.', { stage: 'out' }),
    conveyor: d('Conveyor', 1200, 1, 1, 'Line', 'Links machines that are not side by side.', { stage: 'belt' }),
    smt: d('Board assembly line', 220000, 3, 1, 'Machines', 'Builds circuit boards. 700 units a day.', { stage: 'smt', cap: 700, run: 900 }),
    robot: d('Robotic assembly cell', 160000, 2, 2, 'Machines', 'Assembles devices. 500 units a day.', { stage: 'assembly', cap: 500, run: 700 }),
    manual: d('Assembly bench', 9000, 1, 1, 'Machines', 'Hand assembly. 60 units a day.', { stage: 'assembly', cap: 60, run: 180 }),
    test: d('Test station', 45000, 1, 1, 'Machines', 'Catches faults before shipping. Covers 450 units a day.', { stage: 'test', cap: 450, run: 250 }),
    pack: d('Packaging line', 60000, 2, 1, 'Machines', 'Boxes devices. 900 units a day.', { stage: 'pack', cap: 900, run: 300 }),
    rack: d('Storage rack', 5000, 2, 1, 'Decor', 'Shelving for parts. Decoration only.'),
    pallets: d('Pallet stack', 500, 1, 1, 'Decor', 'Boxes on pallets. Decoration only.'),
  },
  store: {
    table: d('Display table', 6000, 2, 1, 'Fixtures', 'Shows your devices. Serves 70 shoppers a day.', { visitors: 70 }),
    demo: d('Demo pod', 5000, 1, 1, 'Fixtures', 'A single device to try. Serves 30 shoppers a day.', { visitors: 30 }),
    shelf: d('Accessory wall', 3000, 2, 1, 'Fixtures', 'Cases and chargers. Adds income per sale.'),
    counter: d('Checkout', 4000, 1, 1, 'Fixtures', 'A store needs at least one to sell anything.'),
    support: d('Support bar', 9000, 2, 1, 'Fixtures', 'Repairs and help. Makes owners happier.'),
    bench: d('Bench', 900, 1, 1, 'Decor', 'Somewhere to wait.', { comfort: 0.6 }),
    plant: d('Plant', 250, 1, 1, 'Decor', 'Softens the space.', { comfort: 0.5 }),
    tree: d('Indoor tree', 1800, 1, 1, 'Decor', 'A statement plant.', { comfort: 1.2 }),
    logowall: d('Logo wall', 3500, 2, 1, 'Decor', 'Your logo, lit.', { comfort: 1.5 }),
    rug: d('Rug', 800, 2, 2, 'Decor', 'Softens the floor.', { comfort: 0.5, flat: true }),
  },
}

export const WALLS: Record<SiteWall['kind'], { name: string; cost: number }> = {
  wall: { name: 'Wall', cost: 150 },
  glass: { name: 'Glass wall', cost: 400 },
  door: { name: 'Door', cost: 300 },
}

export interface FloorDef {
  id: string
  name: string
  color: string
  rough: number
}
/** The first entry is the default finish for that kind of site. */
export const FLOORS: Record<SiteKind, FloorDef[]> = {
  office: [
    { id: 'oak', name: 'Oak boards', color: '#9a7a58', rough: 0.6 },
    { id: 'concrete', name: 'Polished concrete', color: '#8d8f92', rough: 0.4 },
    { id: 'carpet', name: 'Grey carpet', color: '#4f5560', rough: 1 },
    { id: 'navy', name: 'Navy carpet', color: '#2b3a55', rough: 1 },
    { id: 'terrazzo', name: 'Terrazzo', color: '#cfc8bd', rough: 0.3 },
    { id: 'walnut', name: 'Walnut boards', color: '#5e4634', rough: 0.55 },
  ],
  factory: [
    { id: 'epoxy', name: 'Grey epoxy', color: '#7d8388', rough: 0.45 },
    { id: 'green', name: 'Green epoxy', color: '#4f7a66', rough: 0.45 },
    { id: 'hazard', name: 'Safety yellow', color: '#c9a227', rough: 0.5 },
  ],
  store: [
    { id: 'stone', name: 'Pale stone', color: '#d6d1c8', rough: 0.35 },
    { id: 'oak', name: 'Oak boards', color: '#a98a66', rough: 0.6 },
    { id: 'slate', name: 'Dark slate', color: '#3c4046', rough: 0.4 },
  ],
}

export interface TierDef {
  name: string
  w: number
  h: number
  shape: 'rect' | 'ring'
  /** Which building the 3D view draws around the floor. */
  shell: string
  cost: number
  /** Monthly rent or upkeep. */
  rent: number
  /** Stores: passers-by per day. */
  traffic?: number
  blurb: string
}
export const SITE_TIERS: Record<SiteKind, TierDef[]> = {
  office: [
    { name: 'Garage', w: 9, h: 6, shape: 'rect', shell: 'garage', cost: 0, rent: 2500, blurb: 'Where it starts. Bare concrete and a roll-up door.' },
    { name: 'Loft studio', w: 14, h: 9, shape: 'rect', shell: 'loft', cost: 180e3, rent: 9000, blurb: 'A brick warehouse floor with tall factory windows.' },
    { name: 'Tower floor', w: 20, h: 12, shape: 'rect', shell: 'tower', cost: 900e3, rent: 28e3, blurb: 'A glass-walled floor high above the city.' },
    { name: 'Headquarters', w: 28, h: 16, shape: 'rect', shell: 'hq', cost: 4e6, rent: 75e3, blurb: 'Your own building, set in landscaped grounds.' },
    { name: 'Ring campus', w: 34, h: 34, shape: 'ring', shell: 'ring', cost: 25e6, rent: 220e3, blurb: 'A curved glass ring around a private park.' },
  ],
  factory: [
    { name: 'Workshop', w: 14, h: 8, shape: 'rect', shell: 'factory', cost: 450e3, rent: 12e3, blurb: 'Room for one short production line.' },
    { name: 'Assembly plant', w: 22, h: 12, shape: 'rect', shell: 'factory', cost: 3e6, rent: 45e3, blurb: 'Space for several lines running side by side.' },
    { name: 'Gigafactory', w: 32, h: 18, shape: 'rect', shell: 'factory', cost: 18e6, rent: 160e3, blurb: 'Volume manufacturing on your own terms.' },
  ],
  store: [
    { name: 'Mall unit', w: 8, h: 6, shape: 'rect', shell: 'mall', cost: 120e3, rent: 22e3, traffic: 500, blurb: 'A small shop with steady passing trade.' },
    { name: 'High street store', w: 12, h: 8, shape: 'rect', shell: 'street', cost: 450e3, rent: 70e3, traffic: 1500, blurb: 'A proper storefront on a busy street.' },
    { name: 'Flagship cube', w: 16, h: 12, shape: 'rect', shell: 'cube', cost: 2.5e6, rent: 260e3, traffic: 4500, blurb: 'A glass landmark that people travel to see.' },
  ],
}
export const tierOf = (site: Site) => SITE_TIERS[site.kind][site.tier]

export function newSite(kind: SiteKind, tier: number): Site {
  const t = SITE_TIERS[kind][tier]
  const site: Site = { kind, tier, w: t.w, h: t.h, shape: t.shape, items: [], walls: [], floor: {} }
  if (kind === 'office' && tier === 0) {
    site.items = [
      { id: 'o1', kind: 'desk', x: 2, y: 2, rot: 0 },
      { id: 'o2', kind: 'desk', x: 4, y: 2, rot: 0 },
      { id: 'o3', kind: 'plant', x: 0, y: 0, rot: 0 },
      { id: 'o4', kind: 'whiteboard', x: 6, y: 0, rot: 0 },
    ]
  }
  return site
}

/** Ring campuses only allow building inside the ring. */
export function validTile(site: Pick<Site, 'w' | 'h' | 'shape'>, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= site.w || y >= site.h) return false
  if (site.shape !== 'ring') return true
  const r = Math.hypot(x + 0.5 - site.w / 2, y + 0.5 - site.h / 2)
  const outer = site.w / 2 - 0.4
  return r <= outer && r >= outer * RING_INNER
}
/** Inner radius of a ring campus as a fraction of the outer radius. */
export const RING_INNER = 0.62

/** Tiles an item covers, given its anchor tile and rotation. */
export function tilesOf(def: Pick<ItemDef, 'w' | 'h'>, x: number, y: number, rot: number): [number, number][] {
  const turned = rot % 2 === 1
  const w = turned ? def.h : def.w
  const h = turned ? def.w : def.h
  const out: [number, number][] = []
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push([x + i, y + j])
  return out
}

export const itemTiles = (site: Site, item: SiteItem) => tilesOf(ITEMS[site.kind][item.kind], item.x, item.y, item.rot)

export function itemAt(site: Site, x: number, y: number): SiteItem | undefined {
  return site.items.find((it) => ITEMS[site.kind][it.kind] && itemTiles(site, it).some(([a, b]) => a === x && b === y))
}

export function canPlace(site: Site, kind: string, x: number, y: number, rot: number): string | null {
  const def = ITEMS[site.kind][kind]
  if (!def) return 'Unknown item'
  for (const [a, b] of tilesOf(def, x, y, rot)) {
    if (!validTile(site, a, b)) return 'It does not fit there'
    if (itemAt(site, a, b)) return 'Something is already there'
  }
  return null
}

export const countItems = (site: Site, kind: string) => site.items.filter((i) => i.kind === kind).length
export const wallAt = (site: Site, x: number, y: number, side: 'n' | 'w') => site.walls.find((w) => w.x === x && w.y === y && w.side === side)
export const tileCount = (site: Pick<Site, 'w' | 'h' | 'shape'>) => {
  if (site.shape !== 'ring') return site.w * site.h
  let n = 0
  for (let x = 0; x < site.w; x++) for (let y = 0; y < site.h; y++) if (validTile(site, x, y)) n++
  return n
}

/** Total of a numeric property over everything placed. */
export function sumOf(site: Site, key: 'comfort' | 'prestige' | 'visitors'): number {
  return site.items.reduce((a, it) => a + (ITEMS[site.kind][it.kind]?.[key] ?? 0), 0)
}

// ---------------------------------------------------------------- factory lines

export interface LineStats {
  /** True when a receiving dock is linked to a shipping dock through every required stage. */
  running: boolean
  /** Why the line is not running, in plain words. */
  problem?: string
  caps: { smt: number; assembly: number; test: number; pack: number }
  /** Devices per day, in phone-equivalents. */
  throughput: number
  defectRate: number
  /** Cost per day at full output. */
  runCost: number
  /** Ids of the items that are part of the working line. */
  linked: Set<string>
  /** For conveyors on the line: direction of travel as a tile step. */
  flow: Map<string, [number, number]>
}

/** Works out what a factory floor can produce from what is connected to what. */
export function lineStats(site: Site): LineStats {
  const defs = ITEMS.factory
  const machines = site.items.filter((it) => defs[it.kind]?.stage)
  const owner = new Map<string, SiteItem>()
  for (const it of machines) for (const [x, y] of itemTiles(site, it)) owner.set(`${x},${y}`, it)
  const neighbours = (it: SiteItem) => {
    const out = new Set<SiteItem>()
    for (const [x, y] of itemTiles(site, it)) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const other = owner.get(`${x + dx},${y + dy}`)
        if (other && other !== it) out.add(other)
      }
    }
    return out
  }
  const empty: LineStats = { running: false, caps: { smt: 0, assembly: 0, test: 0, pack: 0 }, throughput: 0, defectRate: 0, runCost: 0, linked: new Set(), flow: new Map() }
  const start = machines.find((it) => defs[it.kind].stage === 'in')
  if (!start) return { ...empty, problem: 'Place a receiving dock to start a line.' }

  // breadth-first from the receiving dock: distance gives the direction of flow
  const dist = new Map<SiteItem, number>([[start, 0]])
  const queue = [start]
  while (queue.length) {
    const cur = queue.shift()!
    for (const nb of neighbours(cur)) {
      if (dist.has(nb)) continue
      dist.set(nb, dist.get(cur)! + 1)
      queue.push(nb)
    }
  }
  const caps = { smt: 0, assembly: 0, test: 0, pack: 0 }
  let runCost = 0
  let hasOut = false
  const linked = new Set<string>()
  for (const it of dist.keys()) {
    const def = defs[it.kind]
    linked.add(it.id)
    if (def.stage === 'out') hasOut = true
    if (def.stage === 'smt' || def.stage === 'assembly' || def.stage === 'test' || def.stage === 'pack') {
      caps[def.stage] += def.cap ?? 0
      runCost += def.run ?? 0
    }
  }
  const flow = new Map<string, [number, number]>()
  for (const it of dist.keys()) {
    if (defs[it.kind].stage !== 'belt') continue
    const here = dist.get(it)!
    let best: [number, number] = [1, 0]
    let bestDist = -1
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const other = owner.get(`${it.x + dx},${it.y + dy}`)
      const od = other ? dist.get(other) : undefined
      if (od !== undefined && od > here && od > bestDist) {
        best = [dx, dy]
        bestDist = od
      }
    }
    if (bestDist < 0) {
      // end of a branch: keep moving away from where it came from
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        const other = owner.get(`${it.x + dx},${it.y + dy}`)
        if (other && dist.get(other) === here - 1) best = [-dx, -dy]
      }
    }
    flow.set(it.id, best)
  }
  const base = { caps, runCost, linked, flow }
  if (!hasOut) return { ...empty, ...base, problem: 'Link the line to a shipping dock.' }
  const missing = (['smt', 'assembly', 'pack'] as const).filter((k) => caps[k] === 0)
  if (missing.length) {
    const names = { smt: 'a board assembly line', assembly: 'an assembly cell or bench', pack: 'a packaging line' }
    return { ...empty, ...base, problem: `The line still needs ${missing.map((k) => names[k]).join(' and ')}.` }
  }
  const throughput = Math.min(caps.smt, caps.assembly, caps.pack)
  // untested output ships with 6% faults; full test coverage brings it under 1%
  const coverage = Math.min(1, caps.test / throughput)
  return { ...base, running: true, throughput, defectRate: 0.06 - 0.052 * coverage }
}

/** A ready-made line for players who do not want to lay conveyors themselves. */
export function starterLine(site: Site): { kind: string; x: number; y: number; rot: number }[] {
  const y = Math.max(1, Math.floor(site.h / 2) - 1)
  const plan = [
    { kind: 'dock_in', x: 0, y, rot: 0 },
    { kind: 'conveyor', x: 2, y, rot: 0 },
    { kind: 'smt', x: 3, y, rot: 0 },
    { kind: 'conveyor', x: 6, y, rot: 0 },
    { kind: 'robot', x: 7, y: y - 1, rot: 0 },
    { kind: 'test', x: 9, y, rot: 0 },
    { kind: 'pack', x: 10, y, rot: 0 },
    { kind: 'dock_out', x: 12, y, rot: 0 },
  ]
  return plan.every((p) => !canPlace(site, p.kind, p.x, p.y, p.rot)) ? plan : []
}

// ---------------------------------------------------------------- stores

export interface StoreStats {
  open: boolean
  problem?: string
  capacity: number
  /** 0-1: how inviting the store is. */
  appeal: number
  hasSupport: boolean
  shelves: number
  /** Monthly wages for the people the fixtures need. */
  wages: number
}

export function storeStats(site: Site): StoreStats {
  const counters = countItems(site, 'counter')
  const supports = countItems(site, 'support')
  const capacity = sumOf(site, 'visitors')
  const tiles = tileCount(site)
  const used = site.items.filter((i) => !ITEMS.store[i.kind]?.flat).reduce((a, i) => a + ITEMS.store[i.kind].w * ITEMS.store[i.kind].h, 0)
  // a little decor goes a long way; a cluttered floor puts people off
  const decor = Math.min(1, sumOf(site, 'comfort') / (tiles * 0.06))
  const crowding = Math.max(0, used / tiles - 0.4) * 2.5
  const appeal = Math.max(0.1, Math.min(1, 0.45 + 0.45 * decor + (site.walls.length ? 0.1 : 0) - crowding))
  const wages = (counters + supports) * 4000 + 6000
  const base = { capacity, appeal, hasSupport: supports > 0, shelves: countItems(site, 'shelf'), wages }
  if (!counters) return { ...base, open: false, problem: 'Add a checkout so the store can sell.' }
  if (!capacity) return { ...base, open: false, problem: 'Add a display table or demo pod.' }
  return { ...base, open: true }
}
