// The city map: how a district's stores are set out along its street fronts
// and the lanes behind them, at one scale to a district, and the queues
// outside them on a launch day.
import { describe, expect, it } from 'vitest'
import { defaultConfig, enterRegion, newGame, openStore } from '../../sim/game'
import { SITE_TIERS } from '../../sim/sites'
import type { GameState } from '../../sim/types'
import { ISLAND, type Place, QUEUE, SHOP_BLOCKS, SHOP_MIN_SCALE, SHOP_ROOM, SHOP_SLOTS, SIGHT, type ShopBlock, type ShopLot, districtScale, districts, fillers, places, queueOf, shopLots, traffic } from './plan'

const rich = (seed = 7) => newGame({ ...defaultConfig(), seed, unlimitedMoney: true })
type Foot = { w: number; h: number; floors?: number }
const MALL: Foot = { w: SITE_TIERS.store[0].w, h: SITE_TIERS.store[0].h }
const STREET: Foot = { w: SITE_TIERS.store[1].w, h: SITE_TIERS.store[1].h }
const PLAZA: Foot = { w: SITE_TIERS.store[2].w, h: SITE_TIERS.store[2].h }
const TIERS = [MALL, STREET, PLAZA]
const many = (n: number, of: (i: number) => Foot = (i) => TIERS[i % 3]) => Array.from({ length: n }, (_, i) => of(i))
const MIXES: ((i: number) => Foot)[] = [(i) => TIERS[i % 3], () => MALL, () => STREET, () => PLAZA, (i) => TIERS[(i * 7 + (i >> 2)) % 3], (i) => ({ ...TIERS[i % 3], floors: 1 + (i % 4 === 3 ? 1 : 0) })]
/** An island's blocks, as the map makes them. */
const ISLAND_BLOCKS = districts(rich()).find((d) => !d.home)!.blocks
const EPS = 1e-6

interface Box {
  x0: number
  x1: number
  z0: number
  z1: number
}
const apart = (a: Box, b: Box) => a.x1 <= b.x0 + EPS || b.x1 <= a.x0 + EPS || a.z1 <= b.z0 + EPS || b.z1 <= a.z0 + EPS
/** The ground a store has to itself, its building, and the strip in front of its door where its queue stands. */
const ground = (l: ShopLot): Box => ({ x0: l.x - l.w / 2, x1: l.x + l.w / 2, z0: l.z - l.d / 2, z1: l.z + l.d / 2 })
const building = (l: ShopLot, site: Foot): Box => ({ x0: l.x - (site.w / 2) * l.scale, x1: l.x + (site.w / 2) * l.scale, z0: l.z - (site.h / 2) * l.scale, z1: l.z + (site.h / 2) * l.scale })
const strip = (l: ShopLot, site: Foot): Box => ({ x0: l.x - l.w / 2, x1: l.x + l.w / 2, z0: l.z + (site.h / 2) * l.scale, z1: l.z + (site.h / 2) * l.scale + l.front })

/** Every store is drawn at one scale, stands inside its block with its queue's strip, and overlaps nobody; no strip has anything built on it. */
function sound(blocks: ShopBlock[], sites: Foot[], lots: (ShopLot | null)[], note: string) {
  const real = lots.map((l, i) => ({ l, site: sites[i] })).filter((x): x is { l: ShopLot; site: Foot } => !!x.l)
  expect(new Set(real.map((x) => x.l.scale)).size, note).toBeLessThanOrEqual(1)
  for (const { l, site } of real) {
    expect(l.scale, note).toBeGreaterThanOrEqual(SHOP_MIN_SCALE)
    expect(l.scale, note).toBeLessThanOrEqual(1)
    const block = blocks[l.block]
    const g = ground(l)
    const s = strip(l, site)
    expect(g.x0, note).toBeGreaterThanOrEqual(block.x0 - EPS)
    expect(g.x1, note).toBeLessThanOrEqual(block.x1 + EPS)
    expect(g.z0, note).toBeGreaterThanOrEqual(block.z0 - EPS)
    expect(s.z1, note).toBeLessThanOrEqual(block.z1 + EPS)
    // the building fits the ground it is given, and the strip is deep enough for the queue, by the store's own measure
    const walls = building(l, site)
    expect(walls.x0 >= g.x0 - EPS && walls.x1 <= g.x1 + EPS && walls.z0 >= g.z0 - EPS && walls.z1 <= g.z1 + EPS, note).toBe(true)
    expect(l.front, note).toBeGreaterThanOrEqual(SHOP_ROOM.front * l.scale - EPS)
  }
  // counted, not asserted pair by pair: there are tens of thousands of pairs
  let clashes = 0
  for (const a of real) for (const b of real) if (a !== b && (!apart(ground(a.l), ground(b.l)) || !apart(strip(a.l, a.site), building(b.l, b.site)))) clashes++
  expect(clashes, note).toBe(0)
}

describe('the city map', () => {
  it('stands the first stores shoulder to shoulder along the high street, at life size', () => {
    const sites = many(9)
    const lots = shopLots(SHOP_BLOCKS, sites).map((l) => l!)
    expect(lots.every((l) => l.scale === 1 && l.row === 0 && l.block === 0)).toBe(true)
    // the tenth starts the next block along, still on the street
    expect(shopLots(SHOP_BLOCKS, many(13)).slice(9).every((l) => l!.scale === 1 && l!.row === 0 && l!.block === 1)).toBe(true)
    // the first is at the end of its block nearest the middle of town, and the rest go on from there
    expect(lots[0].x + lots[0].w / 2).toBeCloseTo(SHOP_BLOCKS[0].from)
    for (let i = 1; i < lots.length; i++) expect(lots[i].x + lots[i].w / 2).toBeCloseTo(lots[i - 1].x - lots[i - 1].w / 2)
    // their shopfronts are on one line, a pavement's depth back from the kerb
    for (const [i, l] of lots.entries()) expect(l.z + sites[i].h / 2).toBeCloseTo(SHOP_BLOCKS[0].z1 - SHOP_ROOM.front)
  })

  it('draws every store in a district at one scale, whatever is built and however much of it', () => {
    for (const blocks of [SHOP_BLOCKS, ISLAND_BLOCKS]) {
      for (const count of [1, 4, 9, 14, 16, 31, 52, 117, 200]) {
        for (const of of MIXES) {
          const sites = many(count, of)
          const lots = shopLots(blocks, sites)
          expect(lots.every((l) => l)).toBe(true)
          expect(new Set(lots.map((l) => l!.scale)).size, `${count}`).toBe(1)
          expect(lots[0]!.scale).toBe(districtScale(blocks, sites))
        }
      }
    }
  })

  it('keeps a district at life size until its blocks are full', () => {
    // at home: twenty-nine mall units along the street and as many again across the lane behind
    expect(districtScale(SHOP_BLOCKS, many(29, () => MALL))).toBe(1)
    expect(shopLots(SHOP_BLOCKS, many(29, () => MALL)).every((l) => l!.row === 0)).toBe(true)
    expect(districtScale(SHOP_BLOCKS, many(58, () => MALL))).toBe(1)
    expect(districtScale(SHOP_BLOCKS, many(59, () => MALL))).toBeLessThan(1)
    // twenty-one high-street shops with mall units behind them
    expect(districtScale(SHOP_BLOCKS, many(50, (i) => (i < 21 ? STREET : MALL)))).toBe(1)
    // thirteen flagship stores, which leave no depth for a row behind
    expect(districtScale(SHOP_BLOCKS, many(13, () => PLAZA))).toBe(1)
    // one more and they all give a little, alike; many more and they all give a lot
    const fourteen = districtScale(SHOP_BLOCKS, many(14, () => PLAZA))
    expect(fourteen).toBeLessThan(1)
    expect(fourteen).toBeGreaterThan(0.9)
    expect(districtScale(SHOP_BLOCKS, many(60, () => PLAZA))).toBeLessThan(fourteen)
    // an island: a dozen flagships, or four rows of twelve mall units
    expect(districtScale(ISLAND_BLOCKS, many(12, () => PLAZA))).toBe(1)
    expect(districtScale(ISLAND_BLOCKS, many(13, () => PLAZA))).toBeLessThan(1)
    expect(districtScale(ISLAND_BLOCKS, many(48, () => MALL))).toBe(1)
    expect(districtScale(ISLAND_BLOCKS, many(49, () => MALL))).toBeLessThan(1)
    // four, nine and sixteen of anything are life size anywhere
    for (const blocks of [SHOP_BLOCKS, ISLAND_BLOCKS]) for (const n of [4, 9, 12]) for (const of of MIXES) expect(districtScale(blocks, many(n, of)), `${n}`).toBe(1)
    for (const blocks of [SHOP_BLOCKS, ISLAND_BLOCKS]) expect(districtScale(blocks, many(16)), 'sixteen').toBe(1)
  })

  it('finds every store its own ground inside the district, overlapping nobody, with its queue strip clear', () => {
    for (const blocks of [SHOP_BLOCKS, ISLAND_BLOCKS]) {
      for (const count of [1, 4, 9, 13, 14, 16, 31, 52, 53, 117, 118, 200]) {
        for (const of of MIXES) {
          const sites = many(count, of)
          const lots = shopLots(blocks, sites)
          expect(lots).toHaveLength(count)
          expect(lots.every((l) => l)).toBe(true)
          sound(blocks, sites, lots, `${count}`)
        }
      }
    }
  })

  it('gives a row behind the street a lane wide enough for its queue to be seen over the roofs in front', () => {
    for (const of of MIXES) {
      const sites = many(80, of)
      const lots = shopLots(SHOP_BLOCKS, sites).map((l) => l!)
      const behind = lots.filter((l) => l.row > 0)
      expect(behind.length).toBeGreaterThan(0)
      lots.forEach((back, i) => {
        if (!back.row) return
        // the furthest out anyone in its queue stands
        const feet = back.z + (sites[i].h / 2 + 2.6) * back.scale
        lots.forEach((ahead, j) => {
          if (ahead.block !== back.block || ahead.row !== back.row - 1) return
          const roof = ((sites[j].floors ?? 1) * 3 + 0.5) * ahead.scale
          const backWall = ahead.z - (sites[j].h / 2) * ahead.scale
          expect(backWall - roof * SIGHT, `${i} behind ${j}`).toBeGreaterThanOrEqual(feet - EPS)
        })
      })
    }
  })

  it('is the same every time, and never moves a store to make room for the next', () => {
    const sites = many(120)
    expect(shopLots(SHOP_BLOCKS, sites)).toEqual(shopLots(SHOP_BLOCKS, sites))
    // while the district is at life size, opening one more leaves the others where they were
    for (const blocks of [SHOP_BLOCKS, ISLAND_BLOCKS]) {
      const malls = many(48, () => MALL)
      let before = shopLots(blocks, malls.slice(0, 1))
      for (let n = 2; n <= malls.length; n++) {
        const after = shopLots(blocks, malls.slice(0, n))
        expect(after.slice(0, n - 1), `${n}`).toEqual(before)
        before = after
      }
    }
  })

  it('leaves off the map only what will not fit at the smallest scale', () => {
    const sites = many(5000, () => PLAZA)
    const lots = shopLots(SHOP_BLOCKS, sites)
    const on = lots.filter((l) => l)
    expect(on.length).toBeGreaterThan(150)
    expect(on.length).toBeLessThan(sites.length)
    expect(on.every((l) => l!.scale === SHOP_MIN_SCALE)).toBe(true)
    // the ones that are on it are the first to have opened, set out soundly
    expect(lots.slice(0, on.length).every((l) => l)).toBe(true)
    sound(SHOP_BLOCKS, sites.slice(0, 400), lots.slice(0, 400), 'full')
  })

  it('makes thirty-one stores at home thirty-one places to click, all at one scale', () => {
    const s = rich()
    for (let i = 0; i < 31; i++) expect(openStore(s, i % 3)).toBeNull()
    const shops = places(s).filter((p) => p.kind === 'store')
    expect(shops).toHaveLength(31)
    expect(new Set(shops.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`)).size).toBe(31)
    expect(new Set(shops.map((p) => p.scale)).size).toBe(1)
    for (const p of shops) {
      expect(p.w).toBeGreaterThanOrEqual(5)
      expect(p.site!.w * p.scale!).toBeLessThanOrEqual(p.w + EPS)
      expect(p.site!.h * p.scale!).toBeLessThanOrEqual(p.d + EPS)
      expect(p.crowded).toBe(true)
    }
    for (const a of shops) for (const b of shops) if (a !== b) expect(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - EPS || Math.abs(a.z - b.z) >= (a.d + b.d) / 2 - EPS, `${a.id} ${b.id}`).toBe(true)
    // a store on its own is not crowded: its name shows, and a crane can stand over it while it is built
    const one = rich()
    expect(openStore(one, 2)).toBeNull()
    expect(places(one).find((p) => p.kind === 'store')).toMatchObject({ scale: 1, row: 0 })
    expect(places(one).find((p) => p.kind === 'store')!.crowded).toBe(false)
  })

  it('stands the neighbours\' shops only where the company has not built', () => {
    const s = rich()
    const home = districts(s).find((d) => d.home)!
    expect(SHOP_SLOTS).toHaveLength(13)
    expect(fillers(home, places(s))).toEqual(SHOP_SLOTS)
    for (let i = 0; i < 9; i++) expect(openStore(s, i % 3)).toBeNull()
    const list = places(s)
    const left = fillers(home, list)
    expect(left.length).toBeLessThan(13)
    expect(left.length).toBeGreaterThan(0)
    // a neighbour's shop is up to nineteen metres wide and fourteen deep
    for (const [x, z] of left) for (const p of list) if (p.kind === 'store') expect(Math.abs(p.x - x) >= 9.5 + p.w / 2 || Math.abs(p.z - z) >= 7 + p.d / 2, p.id).toBe(true)
    // with the street full there are none
    for (let i = 0; i < 40; i++) expect(openStore(s, i % 3)).toBeNull()
    expect(fillers(home, places(s))).toHaveLength(0)
  })
})

describe('launch-day queues', () => {
  /** A game with a device of the player's own just out. */
  function launched(stores: (s: GameState) => void): GameState {
    const s = rich()
    stores(s)
    const model = s.products.find((p) => p.companyId !== 'player' && p.status === 'sale')!
    s.products.push({ ...structuredClone(model), id: 'own', companyId: 'player', launchDay: s.day, stock: 1000 })
    return s
  }
  /** Where a queue's people stand, as a box: two abreast along the shopfront, by the store's own measure. */
  const queueBox = (p: Place): Box => {
    const q = queueOf(p)
    return { x0: q.x + (QUEUE.head - (q.people / 2 - 1) * QUEUE.pitch - 0.3) * q.scale, x1: q.x + (QUEUE.head + 0.3) * q.scale, z0: q.z - 0.3 * q.scale, z1: q.z + 1.1 * q.scale }
  }
  const walls = (p: Place): Box => ({ x0: p.x - (p.site!.w / 2) * p.scale!, x1: p.x + (p.site!.w / 2) * p.scale!, z0: p.z - (p.site!.h / 2) * p.scale!, z1: p.z + (p.site!.h / 2) * p.scale! })

  it('stand along each store\'s own front, at its scale, clear of every other store', () => {
    for (const count of [4, 9, 16, 40, 90]) {
      const s = launched((g) => {
        for (let i = 0; i < count; i++) expect(openStore(g, i % 3)).toBeNull()
      })
      const list = places(s)
      const shops = list.filter((p) => p.kind === 'store' && !p.warn)
      const { queues } = traffic(s, list)
      expect(queues).toHaveLength(shops.length)
      expect(new Set(shops.map((p) => p.scale)).size).toBe(1)
      expect(shops[0].scale! < 1).toBe(count > 30)
      shops.forEach((p, i) => {
        const q = queues[i]
        expect(q.scale).toBe(p.scale)
        // the head of the queue is just in front of the door, by the store's own measure
        expect(q.z - (p.z + (p.site!.h / 2) * p.scale!)).toBeCloseTo(1.5 * p.scale!)
        expect(q.people).toBeGreaterThanOrEqual(8)
        expect(q.people).toBeLessThanOrEqual(QUEUE.people)
        // it keeps to the store's own ground from side to side, and to the open strip in front of it
        const box = queueBox(p)
        expect(box.x0).toBeGreaterThanOrEqual(p.x - p.w / 2 - EPS)
        expect(box.x1).toBeLessThanOrEqual(p.x + p.w / 2 + EPS)
        expect(box.z1).toBeLessThanOrEqual(p.z + (p.site!.h / 2) * p.scale! + p.front! + EPS)
        // inside the district, and on nobody else's ground
        expect(SHOP_BLOCKS.some((b) => box.x0 >= b.x0 - EPS && box.x1 <= b.x1 + EPS && box.z0 >= b.z0 - EPS && box.z1 <= b.z1 + EPS), p.id).toBe(true)
        for (const other of shops) if (other !== p) expect(apart(box, walls(other)), `${p.id} ${other.id}`).toBe(true)
      })
      // and nobody queues when nothing is new
      s.day += 30
      expect(traffic(s).queues).toHaveLength(0)
    }
  })

  it('are longer outside a wider store', () => {
    const s = launched((g) => {
      expect(openStore(g, 0)).toBeNull()
      expect(openStore(g, 2)).toBeNull()
    })
    const [mall, plaza] = places(s).filter((p) => p.kind === 'store')
    expect(queueOf(mall)).toMatchObject({ scale: 1, x: mall.x })
    expect(queueOf(plaza).people).toBe(QUEUE.people)
    expect(queueOf(mall).people).toBeLessThan(QUEUE.people)
  })

  it('form the same way on an island, inside it', () => {
    const s = launched((g) => {
      expect(openStore(g, 0)).toBeNull()
    })
    expect(enterRegion(s, 'eu')).toBeNull()
    for (let i = 0; i < 30; i++) expect(openStore(s, i % 3, 'eu')).toBeNull()
    const d = districts(s).find((x) => x.region.id === 'eu')!
    const shops = places(s).filter((p) => p.kind === 'store' && p.region === 'eu')
    expect(shops).toHaveLength(30)
    // all of them stand on the island at one scale, on both its streets, and some across a lane behind
    expect(new Set(shops.map((p) => p.scale)).size).toBe(1)
    for (const p of shops) {
      expect(Math.abs(p.x - d.x) + p.w / 2).toBeLessThan(ISLAND.w / 2)
      expect(Math.abs(p.z - d.z) + p.d / 2).toBeLessThan(ISLAND.d / 2)
    }
    expect(new Set(shops.map((p) => Math.round(p.z + (p.site!.h / 2) * p.scale!))).size).toBeGreaterThanOrEqual(2)
    // the one store at home is not made smaller by a crowded island
    expect(places(s).find((p) => p.kind === 'store' && p.region !== 'eu')!.scale).toBe(1)
    const { queues } = traffic(s)
    const mine = shops.filter((p) => !p.warn)
    expect(queues.length).toBe(mine.length + 1)
    for (const p of mine) {
      const box = queueBox(p)
      expect(d.blocks.some((b) => box.x0 >= b.x0 - EPS && box.x1 <= b.x1 + EPS && box.z0 >= b.z0 - EPS && box.z1 <= b.z1 + EPS), p.id).toBe(true)
      for (const other of shops) if (other !== p) expect(apart(box, walls(other)), `${p.id} ${other.id}`).toBe(true)
    }
  })
})
