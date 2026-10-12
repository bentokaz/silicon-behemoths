// The city view's map: where everything stands, and what each place has to
// say for itself. Worked out from the game state; nothing here draws.
import { int, money, num, pct } from '../../components/format'
import { CHANNELS } from '../../sim/growth'
import { factoryLine, orderLeft } from '../../sim/ops'
import { type CapId, has, needText } from '../../sim/progress'
import { REGIONS, type RegionDef, homeOf, homeRegion } from '../../sim/regions'
import { SITE_TIERS, sealedRooms, storeStats, venueStats } from '../../sim/sites'
import { staffEffects } from '../../sim/staff'
import { rivalValue } from '../../sim/stock'
import { type Campaign, type Company, type GameState, SUPPLY_CATS, type Site, type Store, type SupplyCat } from '../../sim/types'

export type PlaceKind = 'office' | 'factory' | 'venue' | 'store' | 'rival' | 'research' | 'exchange' | 'port' | 'board' | 'region'

export interface Place {
  id: string
  kind: PlaceKind
  name: string
  /** One or two live figures, in plain words. */
  lines: string[]
  /** Middle of the place on the ground, and the box the pointer can hit. */
  x: number
  z: number
  w: number
  d: number
  h: number
  /** Region id of the district it stands in. */
  region: string
  /** Not built, not open or not entered: drawn dark. */
  dim?: boolean
  /** What needs attention there, if anything. */
  warn?: string
  /** A place the company has not earned yet: a few words for the sign on the lot. */
  locked?: string
  site?: Site | null
  store?: Store
  company?: Company
  campaign?: Campaign
  /** Days since the plot was bought or enlarged, while builders are still on it. */
  building?: number
  /** How much smaller than life the site is drawn: under 1 for every store of a district whose blocks are full. */
  scale?: number
  /** For a store: how far the open ground in front of its door reaches, and which row it is in (0 fronts the street). */
  front?: number
  row?: number
  /** A store with others close by: its name shows only under the pointer, so the street is not buried in tags. */
  crowded?: boolean
}

export interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}
export interface Lot {
  x: number
  z: number
  w: number
  d: number
}

// ---------------------------------------------------------------- the home city

export const HOME: Rect = { x0: -190, z0: -150, x1: 190, z1: 125 }
/** Streets, as strips of asphalt: the avenue, the high street, the street behind downtown, and two running north. */
export const ROADS: Rect[] = [
  { x0: -190, z0: 9, x1: 190, z1: 19 },
  { x0: -190, z0: 54, x1: 190, z1: 62 },
  { x0: -190, z0: -38, x1: 190, z1: -30 },
  { x0: -32, z0: -150, x1: -24, z1: 125 },
  { x0: 68, z0: -150, x1: 76, z1: 62 },
]
/** The street the shops front on, and where lorries turn into the port. */
export const HIGH_STREET = 58
export const PORT_GATE: [number, number] = [40, 72]
export const LOTS = {
  office: { x: -110, z: -94, w: 152, d: 108 },
  venue: { x: 22, z: -94, w: 88, d: 108 },
  research: { x: 133, z: -94, w: 106, d: 108 },
  exchange: { x: 36, z: -11, w: 46, d: 30 },
  factory: { x: -110, z: 94, w: 152, d: 56 },
  port: { x: 82, z: 94, w: 208, d: 56 },
} satisfies Record<string, Lot>
/** Tower plots downtown, in the order they fill up. */
export const TOWER_SLOTS: [number, number][] = [-6, -68, 94, -102, 128, -136, 162, -170].map((x) => [x, -11])
/** Where the neighbours' shops stand along the high street until the company's own stores take the ground: the middle of each. */
export const SHOP_SLOTS: [number, number][] = [-44, -68, -94, -120, -146, -172, -10, 16, 42, 90, 116, 142, 168].map((x) => [x, 43.6])

/**
 * The ground a store needs beyond its own plot, at life size: a kerb and a
 * way past at the sides and the back, and in front room for the queue that
 * forms there on a launch day.
 */
export const SHOP_ROOM = { side: 1.6, back: 0.6, front: 2.8 }
/**
 * How much ground a building hides behind it for each metre of its height,
 * seen from where the camera usually stands (see HOME_CAMERA in CityView,
 * and the three-quarter view it flies to): a little under a metre and a half.
 */
export const SIGHT = 1.5
/** How far out from a shopfront its queue reaches: the lane in front of a back row is kept clear of the roofline ahead by this much more. */
const QUEUE_REACH = 2.6
/** The smallest a district's stores are ever drawn. Any that still do not fit at that are left off the map. */
export const SHOP_MIN_SCALE = 0.25

/** A strip of ground that shops stand on: between two cross streets, with its front on the street to the south of it. */
export interface ShopBlock {
  x0: number
  x1: number
  /** Its back, to the north, and its front: the kerb of the street its shops face. */
  z0: number
  z1: number
  /** Where along the front its first store stands; the rest spread out from there. */
  from: number
}

/** The high street's three blocks: west of the cross streets, between them, and east. Each fills from the end nearest the middle of town. */
export const SHOP_BLOCKS: ShopBlock[] = [
  { x0: -188, x1: -34, z0: 20.5, z1: 53.4, from: -34 },
  { x0: -22, x1: 66, z0: 20.5, z1: 53.4, from: -22 },
  { x0: 78, x1: 188, z0: 20.5, z1: 53.4, from: 78 },
]

type Footprint = Pick<Site, 'w' | 'h'> & { floors?: number }
/** How high a store's walls stand. */
const tall = (site: Footprint) => (site.floors ?? 1) * 3 + 0.5

export interface ShopLot {
  x: number
  z: number
  /** Width and depth of the ground this store has to itself. */
  w: number
  d: number
  /** How much smaller than life it is drawn: 1 unless the district is full, and the same for every store in the district. */
  scale: number
  /** Which block of the district it is on, and which row there: 0 fronts the street, the rest a lane behind. */
  block: number
  row: number
  /** How far the open ground in front of its door reaches: the pavement of the street, or its row's lane. */
  front: number
}

interface ShopRow {
  /** Indexes of the stores in the row, and where each one's middle is along it. */
  at: number[]
  xs: number[]
  /** How far the row has spread east and west of where it started. */
  east: number
  west: number
  /** Its deepest and its tallest building, at life size. */
  deep: number
  high: number
}

/** The lane in front of the row behind this one: wide enough that this row's roofline does not hide the queue standing in it. */
const laneBehind = (high: number) => Math.max(SHOP_ROOM.front, high * SIGHT + QUEUE_REACH - SHOP_ROOM.back)
/** How deep a block's rows come to, at life size. */
const rowsDepth = (rows: { deep: number; high: number }[]) => rows.reduce((a, r, i) => a + (i ? laneBehind(rows[i - 1].high) : SHOP_ROOM.front) + r.deep + SHOP_ROOM.back, 0)

/**
 * A district's stores set out at a given scale, in the order they opened.
 * Each takes the first place that has room for it: along the street front of
 * each block in turn, and only then in a row behind, which has a lane of its
 * own. A store never moves to make room for a later one. Returns the rows of
 * each block, and which stores found no room.
 */
function setOut(blocks: ShopBlock[], sites: Footprint[], s: number): { rows: ShopRow[][]; left: number[] } {
  const rows: ShopRow[][] = blocks.map(() => [])
  const left: number[] = []
  sites.forEach((site, i) => {
    const cw = (site.w + SHOP_ROOM.side) * s
    const high = tall(site)
    const most = Math.max(...rows.map((r) => r.length))
    for (let r = 0; r <= most; r++) {
      for (let b = 0; b < blocks.length; b++) {
        const block = blocks[b]
        const mine = rows[b]
        if (r > mine.length) continue
        const row = mine[r] ?? { at: [], xs: [], east: 0, west: 0, deep: 0, high: 0 }
        // does the block still have the depth, with this store in the row?
        const trial = mine.map((x) => ({ deep: x.deep, high: x.high }))
        trial[r] = { deep: Math.max(row.deep, site.h), high: Math.max(row.high, high) }
        if (rowsDepth(trial) * s > block.z1 - block.z0 + 1e-9) continue
        // and the row the width, on whichever side of its start has had less built on it?
        const east = block.from + row.east + cw <= block.x1 + 1e-9
        const west = block.from - row.west - cw >= block.x0 - 1e-9
        if (!east && !west) continue
        const side = east && (!west || row.east <= row.west) ? 1 : -1
        row.at.push(i)
        row.xs.push(block.from + side * ((side > 0 ? row.east : row.west) + cw / 2))
        if (side > 0) row.east += cw
        else row.west += cw
        row.deep = trial[r].deep
        row.high = trial[r].high
        mine[r] = row
        return
      }
    }
    left.push(i)
  })
  return { rows, left }
}

/**
 * The scale at which every store in a district is drawn: life size while
 * they all fit its blocks, otherwise the largest that lets them, and never
 * under SHOP_MIN_SCALE. One scale to a district, so every store on a street,
 * and the people queueing outside it, are in proportion to the neighbours.
 */
export function districtScale(blocks: ShopBlock[], sites: Footprint[]): number {
  const fits = (s: number) => !setOut(blocks, sites, s).left.length
  if (fits(1)) return 1
  let lo = SHOP_MIN_SCALE
  let hi = 1
  if (!fits(lo)) return lo
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  // rounded down, and then down again if a rounder number happens not to pack
  let s = Math.floor(lo * 1000) / 1000
  while (s > SHOP_MIN_SCALE && !fits(s)) s = Math.round(s * 1000 - 1) / 1000
  return Math.max(SHOP_MIN_SCALE, s)
}

/**
 * Where each of a district's stores stands, given each one's site. Stores
 * stand shoulder to shoulder along the street front of the district's
 * blocks, doors to the south, in the order they opened. When the fronts are
 * full, the next go in a row behind, across a lane of their own that is wide
 * enough for their queue to be seen over the roofs in front. Every store in
 * the district is drawn at one scale (see `districtScale`): life size until
 * the blocks are full, which at home is 29 mall units to a row and two rows
 * of them, 21 high-street shops with as many mall units behind, or thirteen
 * flagship stores.
 */
export function shopLots(blocks: ShopBlock[], sites: Footprint[]): (ShopLot | null)[] {
  const out: (ShopLot | null)[] = sites.map(() => null)
  const scale = districtScale(blocks, sites)
  const { rows } = setOut(blocks, sites, scale)
  rows.forEach((mine, b) => {
    // the line each row's shopfronts stand on, going back from the street
    let wall = blocks[b].z1
    mine.forEach((row, r) => {
      const front = (r ? laneBehind(mine[r - 1].high) : SHOP_ROOM.front) * scale
      wall -= front
      row.at.forEach((i, k) => {
        const site = sites[i]
        // its own ground is taken evenly round it, so the queue's strip in front is common ground
        out[i] = { x: row.xs[k], z: wall - (site.h / 2) * scale, w: (site.w + SHOP_ROOM.side) * scale, d: (site.h + SHOP_ROOM.back * 2) * scale, scale, block: b, row: r, front }
      })
      wall -= (row.deep + SHOP_ROOM.back) * scale
    })
  })
  return out
}
/** Where billboards stand along the avenue, between the towers. */
export const BOARD_SLOTS: [number, number][] = [-85, 111, -119, 145, -153, -45, 179].map((x) => [x, 5.5])
/** The pier ships leave from, and its seaward end. */
export const PIER = { x: 120, z0: 122, z1: 172 }

// ---------------------------------------------------------------- the port

/** The company's warehouse at the port: its name is on the front. */
export const SHED = { x: LOTS.port.x - 66, z: LOTS.port.z - 4, w: 60, d: 24, h: 12 }
/** The two gantry cranes on the quay: where each stands, and the ground its legs take. */
export const CRANES: Lot[] = [LOTS.port.x + 66, LOTS.port.x + 92].map((x) => ({ x, z: LOTS.port.z + 19, w: 13, d: 11 }))

/**
 * The yard east of the warehouse is marked out in bays, one to each device on
 * sale: what is in stock stands in its bay as a stack of containers, and a
 * device that has sold out is an empty bay marked in the warning colour.
 */
export const BAYS = { cols: 8, rows: 3, w: 7, d: 6.4, pitchX: 8.2, pitchZ: 8.6, x0: LOTS.port.x - 22, z0: LOTS.port.z - 17 }
export const BAY_COUNT = BAYS.cols * BAYS.rows
/** The middle of a bay. They fill from the row nearest the street, west to east. */
export const bayAt = (i: number): [number, number] => [BAYS.x0 + (i % BAYS.cols) * BAYS.pitchX, BAYS.z0 + Math.floor(i / BAYS.cols) * BAYS.pitchZ]
/** The least stock that fills each level of a bay: one container, two, and so on up to six. */
export const BAY_LEVELS = [1, 1000, 5000, 20000, 60000, 200000]
/** How many containers stand in a device's bay for a given stock: none when it has sold out, six at most. */
export const bayLevel = (stock: number) => BAY_LEVELS.filter((least) => stock >= least).length

export interface Bay {
  /** The device whose bay it is. */
  id: string
  name: string
  x: number
  z: number
  /** Containers standing in it, 0 to 6. */
  level: number
}

/** The company's devices on sale, each in its bay, in the order they were launched. With more devices than bays, the newest have one. */
export function portBays(g: GameState): Bay[] {
  const selling = g.products.filter((p) => p.companyId === 'player' && p.status === 'sale')
  return selling.slice(-BAY_COUNT).map((p, i) => {
    const [x, z] = bayAt(i)
    return { id: p.id, name: p.name, x, z, level: bayLevel(p.stock) }
  })
}

/** The ground a waiting lorry takes. */
export const TRUCK = { w: 2.6, d: 10.4 }
/** Where lorries wait in front of the warehouse doors, one to each production order that is still open: the middle of each, nose to the south. */
export const TRUCK_SLOTS: [number, number][] = Array.from({ length: 12 }, (_, i): [number, number] => [SHED.x - SHED.w / 2 + 3.2 + i * 4.9, SHED.z + SHED.d / 2 + 10.2])
/** How many lorries are waiting: one to an open order, as many as there is room for. */
export const portTrucks = (g: GameState) => Math.min(TRUCK_SLOTS.length, g.orders.length)

/**
 * The quay's inbound row: one slot to each kind of component, by the cranes.
 * While a kind is short its slot stands empty, marked in the warning colour.
 */
export const QUAY_SLOT = { w: 8.6, d: 3.4 }
export const QUAY_SLOTS: [number, number][] = SUPPLY_CATS.map((_, i): [number, number] => [LOTS.port.x + 50 + i * 10.6, LOTS.port.z + 6])
/** The kinds of component that are short today. */
export const shortages = (g: GameState): SupplyCat[] => SUPPLY_CATS.filter((cat) => (g.supply?.shockDays?.[cat] ?? 0) > 0)

// ---------------------------------------------------------------- districts overseas

export const ISLAND = { w: 160, d: 112 }
const ISLAND_AT: [number, number][] = [[-330, -30], [-245, -300], [0, -355], [245, -300], [330, -30]]
const ISLAND_TOWERS = [0, -32, 32, -64, 64]
/** Streets across each island, as offsets north or south of its middle: [where, how wide]. */
export const ISLAND_STREETS: [number, number][] = [[-19, 6], [19.5, 6]]
/** An island's two shop blocks, as offsets from its middle: between its streets, and between the southern street and the quay. Each fills from the middle outwards. */
const ISLAND_BLOCKS: ShopBlock[] = [
  { x0: -76, x1: 76, z0: -15.8, z1: 16.2, from: 0 },
  { x0: -76, x1: 76, z0: 22.8, z1: 50.6, from: 0 },
]
const ISLAND_SHOPS: [number, number][] = ISLAND_BLOCKS.flatMap((b) => [-13, 13, -39, 39, -65, 65].map((x): [number, number] => [x, b.z1 - SHOP_ROOM.front - 7]))

export interface District {
  region: RegionDef
  home: boolean
  open: boolean
  /** Middle of its land. */
  x: number
  z: number
  /** Where its pier meets the land, the pier's seaward end, and the way the pier points. */
  dock: [number, number]
  berth: [number, number]
  towers: [number, number][]
  /** Where the neighbours' shops stand until the company's stores take the ground, and the blocks those stores are set out on. */
  shops: [number, number][]
  blocks: ShopBlock[]
}

/** Half the width and depth of a neighbour's shop, with a little room round it. */
const FILLER = { w: 10, d: 7.5 }
/** The neighbours' shops still standing in a district: those whose ground none of the company's stores has taken. */
export function fillers(d: District, list: Place[]): [number, number][] {
  const stores = list.filter((p) => p.kind === 'store' && p.region === d.region.id)
  return d.shops.filter(([x, z]) => !stores.some((p) => Math.abs(p.x - x) < FILLER.w + p.w / 2 && p.z - p.d / 2 < z + FILLER.d && p.z + p.d / 2 + (p.front ?? 0) > z - FILLER.d))
}

/** Every region as a district: home in the middle, the others on islands round the bay. */
export function districts(g: GameState): District[] {
  const home = homeRegion(g)
  let k = 0
  return REGIONS.map((region) => {
    const open = !!g.regions[region.id]?.open
    if (region.id === home) return { region, home: true, open, x: 0, z: 0, dock: [PIER.x, PIER.z0], berth: [PIER.x + 8, PIER.z1 - 12], towers: TOWER_SLOTS, shops: SHOP_SLOTS, blocks: SHOP_BLOCKS }
    const [x, z] = ISLAND_AT[k++ % ISLAND_AT.length]
    // the pier is on whichever shore looks toward home
    const side = Math.abs(x) > Math.abs(z) ? ([x > 0 ? -1 : 1, 0] as const) : ([0, 1] as const)
    const dock: [number, number] = [x + (side[0] * ISLAND.w) / 2, z + (side[1] * ISLAND.d) / 2]
    return {
      region,
      home: false,
      open,
      x,
      z,
      dock,
      berth: [dock[0] + side[0] * 30 + side[1] * 8, dock[1] + side[1] * 30 + side[0] * 8],
      towers: ISLAND_TOWERS.map((tx): [number, number] => [x + tx, z - 38]),
      shops: ISLAND_SHOPS.map(([sx, sz]): [number, number] => [x + sx, z + sz]),
      blocks: ISLAND_BLOCKS.map((b) => ({ x0: x + b.x0, x1: x + b.x1, z0: z + b.z0, z1: z + b.z1, from: x + b.from })),
    }
  })
}

// ---------------------------------------------------------------- places

// the one number format, as everywhere else
const short = num
const cash = money
const plural = (n: number, one: string, many = one + 's') => `${int(n)} ${n === 1 ? one : many}`

/** Days since the builders moved onto a plot, read from the news; undefined once they have gone. */
function buildingDays(g: GameState, test: RegExp): number | undefined {
  const item = g.news.find((n) => n.kind === 'finance' && test.test(n.text))
  if (!item) return undefined
  const days = g.day - item.day
  return days >= 0 && days <= 45 ? days : undefined
}

/** For a place whose screen is still locked: what the sign says, and the line under its name. */
function lockOf(g: GameState, cap: CapId, sign: string): { locked?: string; lines?: string[] } {
  if (has(g, cap)) return {}
  const need = needText(g, cap)
  return { locked: sign, lines: ['Not open yet', `To open: ${need}`] }
}

/** How tall a rival's tower stands: the more it is worth, the taller. */
export const towerFloors = (c: Company) => Math.round(5 + 12 * Math.min(1, Math.sqrt((c.value ?? rivalValue(c)) / 6e9)))

/** Everything in the city the player can point at. */
export function places(g: GameState): Place[] {
  const out: Place[] = []
  const all = districts(g)
  const home = all.find((d) => d.home)!
  const me = g.companies[0]
  const fx = staffEffects(g)

  // ---- the company's own ground
  const sealed = sealedRooms(g.office).length
  out.push({
    id: 'office',
    kind: 'office',
    name: `${me.name} campus`,
    lines: [plural(g.staff.length, 'person', 'people'), fx.idle ? `${fx.idle} without a desk` : `${plural(fx.seats, 'desk')}, ${g.office.floors > 1 ? `${g.office.floors} storeys` : 'one storey'}`],
    ...LOTS.office,
    w: g.office.w + 8,
    d: g.office.h + 8,
    h: g.office.floors * 3 + 4,
    region: home.region.id,
    warn: fx.idle ? 'People have no desk' : sealed ? 'A room has no door' : undefined,
    site: g.office,
    building: buildingDays(g, /moved to a bigger plot/),
  })
  const line = factoryLine(g)
  const factoryOrders = g.orders.filter((o) => o.mode === 'factory').length
  out.push({
    id: 'factory',
    kind: 'factory',
    name: 'Factory',
    lines: g.factory ? [line?.running ? `${short(line.throughput)} a day` : 'Line not running', plural(factoryOrders, 'order')] : ['Not built yet', `Land from ${cash(SITE_TIERS.factory[0].cost)}`],
    ...LOTS.factory,
    w: (g.factory?.w ?? 40) + 8,
    d: (g.factory?.h ?? 24) + 8,
    h: g.factory ? g.factory.floors * 3 + 6 : 5,
    region: home.region.id,
    dim: !g.factory,
    warn: g.factory && factoryOrders && !line?.running ? 'Orders are waiting on a line that is not running' : undefined,
    ...lockOf(g, 'factory', 'Needs a COO'),
    site: g.factory,
    building: buildingDays(g, /factory moved to a bigger site|land for its first factory/),
  })
  const next = g.events.filter((e) => !e.done).sort((a, b) => a.day - b.day)[0]
  const stats = g.venue ? venueStats(g.venue) : null
  out.push({
    id: 'venue',
    kind: 'venue',
    name: 'Venue',
    lines: g.venue ? [stats!.ready ? `${short(stats!.seats)} seats` : (stats!.problem ?? 'Not ready'), next ? `Next event in ${plural(Math.max(0, next.day - g.day), 'day')}` : 'Nothing booked'] : ['Not built yet', next ? `Next event in ${plural(Math.max(0, next.day - g.day), 'day')}` : `Land from ${cash(SITE_TIERS.venue[0].cost)}`],
    ...LOTS.venue,
    w: (g.venue?.w ?? 40) + 8,
    d: (g.venue?.h ?? 30) + 8,
    h: g.venue ? g.venue.floors * 3 + 6 : 5,
    region: home.region.id,
    dim: !g.venue,
    ...lockOf(g, 'venue', 'Needs a CMO'),
    site: g.venue,
    building: buildingDays(g, /venue moved to a bigger site|land for a venue/),
  })

  // ---- stores, each in its own region's high street
  const districtOf = (store: Store) => all.find((x) => x.region.id === store.region) ?? home
  const lots = new Map<string, (ShopLot | null)[]>()
  for (const d of all) lots.set(d.region.id, shopLots(d.blocks, g.stores.filter((s) => districtOf(s) === d).map((s) => s.site)))
  /** Whether a store has another close enough that their name tags, and a crane over one of them, would be in each other's way. */
  const near = (a: ShopLot, region: string) => (lots.get(region) ?? []).some((b) => b && b !== a && Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 8 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + 12)
  const taken = new Map<string, number>()
  for (const store of g.stores) {
    const d = districtOf(store)
    const i = taken.get(d.region.id) ?? 0
    taken.set(d.region.id, i + 1)
    const slot = lots.get(d.region.id)?.[i]
    if (!slot) continue
    const scale = slot.scale
    const st = storeStats(store.site)
    out.push({
      id: `store:${store.id}`,
      kind: 'store',
      name: `${store.name} store`,
      lines: st.open ? [`${short(store.monthUnits)} sold this month`, `${short(store.lastVisitors)} visitors a day`] : [st.problem ?? 'Closed'],
      x: slot.x,
      z: slot.z,
      w: slot.w,
      d: slot.d,
      h: (store.site.floors * 3 + 5) * scale,
      scale,
      front: slot.front,
      row: slot.row,
      crowded: near(slot, d.region.id),
      region: d.region.id,
      warn: st.open ? undefined : st.problem,
      site: store.site,
      store,
      building: g.day - store.openedDay <= 30 ? g.day - store.openedDay : undefined,
    })
  }

  // ---- rivals, each at home in its own region
  const seats = new Map<string, number>()
  for (const c of g.companies) {
    if (c.isPlayer) continue
    const d = all.find((x) => x.region.id === homeOf(c)) ?? home
    const i = seats.get(d.region.id) ?? 0
    seats.set(d.region.id, i + 1)
    const slot = d.towers[i]
    if (!slot) continue
    const selling = g.products.filter((p) => p.companyId === c.id && p.status === 'sale').length
    const gone = !c.alive || !!c.acquired
    out.push({
      id: `rival:${c.id}`,
      kind: 'rival',
      name: c.name,
      lines: c.acquired ? ['Part of your company now'] : !c.alive ? ['Closed down'] : [`Worth ${cash(c.value ?? rivalValue(c))}`, plural(selling, 'device') + ' on sale'],
      x: slot[0],
      z: slot[1],
      w: 24,
      d: 22,
      h: towerFloors(c) * 3.2 + 4,
      region: d.region.id,
      dim: gone || !d.open,
      company: c,
    })
  }

  // ---- the rest of the home city
  const stock = g.products.filter((p) => p.companyId === 'player' && p.status === 'sale').reduce((a, p) => a + p.stock, 0)
  const coming = g.orders.reduce((a, o) => a + orderLeft(o), 0)
  out.push({ id: 'port', kind: 'port', name: 'Port and warehouse', lines: [`${short(stock)} devices in stock`, g.orders.length ? `${short(coming)} more on order` : 'No orders placed'], ...LOTS.port, w: 150, d: 50, h: 18, region: home.region.id, warn: stock <= 0 && !g.orders.length && g.products.some((p) => p.companyId === 'player' && p.status === 'sale') ? 'Nothing left to sell' : undefined })
  out.push({ id: 'research', kind: 'research', name: 'Research park', lines: [g.activeResearch.length ? `${plural(g.activeResearch.length, 'project')} running` : 'Nothing being researched', `${cash(g.rdBudget)} a month`], ...LOTS.research, w: 92, d: 84, h: 16, region: home.region.id, warn: g.activeResearch.length || !has(g, 'research') ? undefined : 'No research is running', ...lockOf(g, 'research', 'Needs a researcher') })
  const hist = g.stock.history
  const before = hist[hist.length - 1] ?? g.stock.price
  const move = before > 0 ? (g.stock.price / before - 1) * 100 : 0
  out.push({
    id: 'exchange',
    kind: 'exchange',
    name: 'Stock exchange',
    lines: g.stock.listed ? [`${money(g.stock.price)} a share`, `${move >= 0 ? 'Up' : 'Down'} ${pct(Math.abs(move) / 100)} this month`] : ['Not listed yet', `Company valued at ${cash(g.stock.price * g.stock.shares)}`],
    ...LOTS.exchange,
    h: 20,
    region: home.region.id,
    dim: !g.stock.listed,
    ...lockOf(g, 'shares', 'Needs a CFO'),
  })
  g.campaigns.slice(0, BOARD_SLOTS.length).forEach((c, i) => {
    const product = g.products.find((p) => p.id === c.target)
    out.push({ id: `board:${c.id}`, kind: 'board', name: product ? `${product.name} campaign` : 'Brand campaign', lines: [CHANNELS[c.channel].name, `${cash(c.monthly)} a month`], x: BOARD_SLOTS[i][0], z: BOARD_SLOTS[i][1], w: 14, d: 4, h: 14, region: home.region.id, campaign: c })
  })

  // ---- the districts themselves
  for (const d of all) {
    if (d.home) continue
    const st = g.regions[d.region.id]
    const stores = g.stores.filter((s) => s.region === d.region.id).length
    out.push({
      id: `region:${d.region.id}`,
      kind: 'region',
      name: d.region.name,
      lines: d.open ? [`${short(st.monthUnits)} sold this month`, `${pct(st.awareness, 0)} know your name, ${plural(stores, 'store')}`] : ['You do not sell here yet', `Setting up costs ${cash(d.region.entry)}`],
      x: d.x,
      z: d.z,
      w: ISLAND.w,
      d: ISLAND.d,
      h: 1.2,
      region: d.region.id,
      dim: !d.open,
      ...(d.open ? {} : lockOf(g, 'world', 'Not yet')),
    })
  }
  return out
}

// ---------------------------------------------------------------- traffic

export interface Route {
  /** Points along the way, on the ground. */
  path: [number, number][]
  length: number
  /** How many vehicles share it. */
  count: number
}
const routeOf = (path: [number, number][], count: number): Route => ({ path, count, length: path.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0), 0) })

/** A point a given distance along a route, and the heading there. */
export function along(r: Route, dist: number): [number, number, number] {
  let left = Math.max(0, Math.min(r.length, dist))
  for (let i = 1; i < r.path.length; i++) {
    const [ax, az] = r.path[i - 1]
    const [bx, bz] = r.path[i]
    const len = Math.hypot(bx - ax, bz - az)
    if (left <= len || i === r.path.length - 1) {
      const t = len ? Math.min(1, left / len) : 0
      return [ax + (bx - ax) * t, az + (bz - az) * t, Math.atan2(bx - ax, bz - az)]
    }
    left -= len
  }
  return [r.path[0][0], r.path[0][1], 0]
}

export interface Traffic {
  trucks: Route[]
  ships: Route[]
  /** Store fronts with a launch-day queue. */
  queues: Queue[]
}

/** A queue outside a store: where its head stands, how many are in it, and the scale they are drawn at, which is the store's. */
export interface Queue {
  x: number
  z: number
  scale: number
  people: number
}
/** Most people in one queue, two abreast, and how far apart they stand along it. */
export const QUEUE = { people: 26, pitch: 0.95, head: 3 }

/** The queue outside a store on a launch day: along its own front, from just east of the door back to the corner of its ground, short of the neighbour's. */
export function queueOf(p: Place): Queue {
  const scale = p.scale ?? 1
  const site = p.site
  const pairs = site ? Math.floor((QUEUE.head + p.w / 2 / scale - 0.5) / QUEUE.pitch) + 1 : QUEUE.people / 2
  return { x: p.x, z: p.z + (site ? site.h / 2 + 1.5 : 8) * scale, scale, people: Math.min(QUEUE.people, pairs * 2) }
}

/** What is on the move today: lorries while there are devices to shift, ships to every market entered. */
export function traffic(g: GameState, list: Place[] = places(g)): Traffic {
  const all = districts(g)
  const trucks: Route[] = []
  const own = g.products.filter((p) => p.companyId === 'player')
  const selling = own.filter((p) => p.status === 'sale')
  const stock = selling.reduce((a, p) => a + p.stock, 0)
  const gate = PORT_GATE
  const turn: [number, number] = [gate[0], HIGH_STREET]
  // from the factory to the warehouse, while the line has work
  if (g.factory && factoryLine(g)?.running && g.orders.some((o) => o.mode === 'factory')) trucks.push(routeOf([[LOTS.factory.x, 70], [LOTS.factory.x, HIGH_STREET], turn, gate], 3))
  // and from the warehouse to the shops, while there is stock to sell
  if (stock > 0) {
    const shops = list.filter((p) => p.kind === 'store' && p.region === homeRegion(g))
    for (const shop of shops.slice(0, 8)) trucks.push(routeOf([gate, turn, [shop.x, HIGH_STREET], [shop.x, 52.5]], 1))
    // with no shop of your own, the lorries take the stock out of town to the retailers
    if (!shops.length) trucks.push(routeOf([gate, turn, [72, HIGH_STREET], [72, 14], [HOME.x1 - 4, 14]], 2))
  }
  // ships: round the headland to each market's own pier
  const ships: Route[] = []
  for (const d of all) {
    if (d.home || !d.open) continue
    const start: [number, number] = [PIER.x + 8, PIER.z1 + 6]
    // follow the coast round by the east or the west, and turn off where the island's pier is nearest
    const coast: [number, number][] = d.berth[0] >= 0 ? [[226, 190], [226, -186], [0, -186]] : [[-226, 190], [-226, -186], [0, -186]]
    let best = { d: Infinity, i: 0, p: coast[0] }
    for (let i = 0; i + 1 < coast.length; i++) {
      const [ax, az] = coast[i]
      const [bx, bz] = coast[i + 1]
      const len2 = (bx - ax) ** 2 + (bz - az) ** 2
      const t = Math.min(1, Math.max(0, ((d.berth[0] - ax) * (bx - ax) + (d.berth[1] - az) * (bz - az)) / len2))
      const p: [number, number] = [ax + (bx - ax) * t, az + (bz - az) * t]
      const dist = Math.hypot(p[0] - d.berth[0], p[1] - d.berth[1])
      if (dist < best.d) best = { d: dist, i, p }
    }
    ships.push(routeOf([start, [start[0], 190], ...coast.slice(0, best.i + 1), best.p, d.berth], g.stores.some((s) => s.region === d.region.id) ? 2 : 1))
  }
  // launch week: a queue outside every shop
  const launch = selling.some((p) => g.day - p.launchDay >= 0 && g.day - p.launchDay <= 6)
  const queues = launch ? list.filter((p) => p.kind === 'store' && !p.warn).map(queueOf) : []
  return { trucks, ships, queues }
}
