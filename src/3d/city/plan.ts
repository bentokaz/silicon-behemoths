// The city view's map: where everything stands, and what each place has to
// say for itself. Worked out from the game state; nothing here draws.
import { CHANNELS } from '../../sim/growth'
import { factoryLine, orderLeft } from '../../sim/ops'
import { type CapId, has, needText } from '../../sim/progress'
import { REGIONS, type RegionDef, homeOf, homeRegion } from '../../sim/regions'
import { SITE_TIERS, sealedRooms, storeStats, venueStats } from '../../sim/sites'
import { staffEffects } from '../../sim/staff'
import { rivalValue } from '../../sim/stock'
import type { Campaign, Company, GameState, Site, Store } from '../../sim/types'

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
  /** How much smaller than life the site is drawn: under 1 for a store on a shared plot. */
  scale?: number
  /** The high-street plot a store stands on, as "x,z", which several stores may share. */
  lot?: string
  /** One of many on a shared plot: its name shows only under the pointer, so the street is not buried in tags. */
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
/** Shop plots along the high street, in the order they fill up. */
export const SHOP_SLOTS: [number, number][] = [-44, -68, -94, -120, -146, -172, -10, 16, 42, 90, 116, 142, 168].map((x) => [x, 38])
export const SHOP_LOT = { w: 24, d: 24 }
/** Most stores one shop plot is divided between: four rows of four. */
export const SHOP_SHARE = 16

export interface ShopLot {
  x: number
  z: number
  /** Width and depth of the ground this store has to itself. */
  size: number
  /** The plot it is on, as "x,z", and how many stores share that plot. */
  lot: string
  shared: number
}

/**
 * Where each of a district's stores stands. The first stores take a plot
 * each. Once every plot has one, the next go round again and share: a plot
 * with two to four stores is divided in quarters, up to nine in ninths, up
 * to sixteen in sixteenths, each store on its own piece (and drawn smaller
 * to fit, see `shopScale`). A plot fills from the street back. With
 * thirteen plots that is room for 208 stores at home and 192 on an island;
 * any beyond that are left off the map.
 */
export function shopLots(slots: [number, number][], count: number): (ShopLot | null)[] {
  const out: (ShopLot | null)[] = []
  for (let j = 0; j < count; j++) {
    const i = j % slots.length
    const rank = Math.floor(j / slots.length)
    if (rank >= SHOP_SHARE) {
      out.push(null)
      continue
    }
    // how many stores this plot holds once all of them are placed
    const shared = Math.min(SHOP_SHARE, Math.floor((count - 1 - i) / slots.length) + 1)
    const k = Math.ceil(Math.sqrt(shared))
    const size = SHOP_LOT.w / k
    const [sx, sz] = slots[i]
    const col = rank % k
    const row = Math.floor(rank / k)
    out.push({ x: sx - SHOP_LOT.w / 2 + size * (col + 0.5), z: sz + SHOP_LOT.d / 2 - size * (row + 0.5), size, lot: `${sx},${sz}`, shared })
  }
  return out
}
/** How much smaller than life a store is drawn so that its plot fits the ground it has. */
export const shopScale = (site: Pick<Site, 'w' | 'h'>, size: number) => Math.min(1, (size - 1.2) / site.w, (size - 1.2) / site.h)
/** Where billboards stand along the avenue, between the towers. */
export const BOARD_SLOTS: [number, number][] = [-85, 111, -119, 145, -153, -45, 179].map((x) => [x, 5.5])
/** The pier ships leave from, and its seaward end. */
export const PIER = { x: 120, z0: 122, z1: 172 }

// ---------------------------------------------------------------- districts overseas

export const ISLAND = { w: 160, d: 112 }
const ISLAND_AT: [number, number][] = [[-330, -30], [-245, -300], [0, -355], [245, -300], [330, -30]]
const ISLAND_TOWERS = [0, -32, 32, -64, 64]
const ISLAND_SHOPS: [number, number][] = [2, 36].flatMap((z) => [-13, 13, -39, 39, -65, 65].map((x): [number, number] => [x, z]))
/** Streets across each island, as offsets north or south of its middle: [where, how wide]. */
export const ISLAND_STREETS: [number, number][] = [[-19, 6], [19.5, 6]]

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
  shops: [number, number][]
}

/** Every region as a district: home in the middle, the others on islands round the bay. */
export function districts(g: GameState): District[] {
  const home = homeRegion(g)
  let k = 0
  return REGIONS.map((region) => {
    const open = !!g.regions[region.id]?.open
    if (region.id === home) return { region, home: true, open, x: 0, z: 0, dock: [PIER.x, PIER.z0], berth: [PIER.x + 8, PIER.z1 - 12], towers: TOWER_SLOTS, shops: SHOP_SLOTS }
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
    }
  })
}

// ---------------------------------------------------------------- places

const short = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K` : `${Math.round(v)}`)
const cash = (v: number) => `$${short(v)}`
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

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
  for (const d of all) lots.set(d.region.id, shopLots(d.shops, g.stores.filter((s) => districtOf(s) === d).length))
  const taken = new Map<string, number>()
  for (const store of g.stores) {
    const d = districtOf(store)
    const i = taken.get(d.region.id) ?? 0
    taken.set(d.region.id, i + 1)
    const slot = lots.get(d.region.id)?.[i]
    if (!slot) continue
    const scale = shopScale(store.site, slot.size)
    const st = storeStats(store.site)
    out.push({
      id: `store:${store.id}`,
      kind: 'store',
      name: `${store.name} store`,
      lines: st.open ? [`${short(store.monthUnits)} sold this month`, `${short(store.lastVisitors)} visitors a day`] : [st.problem ?? 'Closed'],
      x: slot.x,
      z: slot.z,
      w: slot.size,
      d: slot.size,
      h: (store.site.floors * 3 + 5) * scale,
      scale,
      lot: slot.lot,
      crowded: slot.shared > 1,
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
    lines: g.stock.listed ? [`$${g.stock.price.toFixed(2)} a share`, `${move >= 0 ? 'Up' : 'Down'} ${Math.abs(move).toFixed(1)}% this month`] : ['Not listed yet', `Company valued at ${cash(g.stock.price * g.stock.shares)}`],
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
      lines: d.open ? [`${short(st.monthUnits)} sold this month`, `${Math.round(st.awareness * 100)}% know your name, ${plural(stores, 'store')}`] : ['You do not sell here yet', `Setting up costs ${cash(d.region.entry)}`],
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
  /** Store fronts with a launch-day queue: where the queue starts. */
  queues: [number, number][]
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
  const queues = launch ? list.filter((p) => p.kind === 'store' && !p.warn).map((p): [number, number] => [p.x, p.z + (p.site ? (p.site.h * (p.scale ?? 1)) / 2 : 8) + 1.5]) : []
  return { trucks, ships, queues }
}
