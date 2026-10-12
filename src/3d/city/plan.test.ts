// The city map: where stores stand along a high street, how plots are shared
// once every plot has a store, and the queues outside them on a launch day.
import { describe, expect, it } from 'vitest'
import { defaultConfig, enterRegion, newGame, openStore } from '../../sim/game'
import { SITE_TIERS } from '../../sim/sites'
import type { GameState } from '../../sim/types'
import { ISLAND, QUEUE, SHOP_LOT, SHOP_ROOM, SHOP_SLOTS, type ShopLot, districts, places, plotScale, queueOf, shopLots, traffic } from './plan'

const rich = (seed = 7) => newGame({ ...defaultConfig(), seed, unlimitedMoney: true })
const MALL = { w: SITE_TIERS.store[0].w, h: SITE_TIERS.store[0].h }
const STREET = { w: SITE_TIERS.store[1].w, h: SITE_TIERS.store[1].h }
const PLAZA = { w: SITE_TIERS.store[2].w, h: SITE_TIERS.store[2].h }
const TIERS = [MALL, STREET, PLAZA]
const many = (n: number, of = (i: number) => TIERS[i % 3]) => Array.from({ length: n }, (_, i) => of(i))

/** Every store's own ground is inside its plot, and no two overlap. */
function sound(lots: (ShopLot | null)[], sites: { w: number; h: number }[], note: string) {
  const real = lots.map((l, i) => ({ l, site: sites[i] })).filter((x): x is { l: ShopLot; site: { w: number; h: number } } => !!x.l)
  for (const { l, site } of real) {
    const [sx, sz] = l.lot.split(',').map(Number)
    expect(Math.abs(l.x - sx) + l.w / 2, note).toBeLessThanOrEqual(SHOP_LOT.w / 2 + 1e-6)
    expect(Math.abs(l.z - sz) + l.d / 2, note).toBeLessThanOrEqual(SHOP_LOT.d / 2 + 1e-6)
    // the building, drawn at the plot's scale, fits the ground it is given
    expect(site.w * l.scale, note).toBeLessThanOrEqual(l.w + 1e-6)
    expect(site.h * l.scale, note).toBeLessThanOrEqual(l.d + 1e-6)
    expect(l.scale).toBeGreaterThan(0)
    expect(l.scale).toBeLessThanOrEqual(1)
  }
  for (const a of real) for (const b of real) if (a !== b) expect(Math.abs(a.l.x - b.l.x) >= (a.l.w + b.l.w) / 2 - 1e-6 || Math.abs(a.l.z - b.l.z) >= (a.l.d + b.l.d) / 2 - 1e-6, note).toBe(true)
}

describe('the city map', () => {
  it('gives each store a plot of its own while there are plots to go round', () => {
    expect(SHOP_SLOTS).toHaveLength(13)
    const few = shopLots(SHOP_SLOTS, many(13))
    expect(few.map((l) => [l!.x, l!.z])).toEqual(SHOP_SLOTS)
    // even the largest store is life size with a plot to itself
    expect(few.every((l) => l!.w === SHOP_LOT.w && l!.d === SHOP_LOT.d && l!.shared === 1 && l!.scale === 1)).toBe(true)
  })

  it('shares plots once each has a store, at one scale to a plot', () => {
    const few = shopLots(SHOP_SLOTS, many(13))
    const more = shopLots(SHOP_SLOTS, many(14))
    // the fourteenth shares the first plot, beside the first store; the rest stay as they were
    expect(more[0]).toMatchObject({ shared: 2, lot: more[13]!.lot })
    expect(more[13]!.scale).toBe(more[0]!.scale)
    expect(more[5]).toEqual(few[5])
    // on any shared plot every store is drawn at the same scale
    for (const count of [14, 26, 31, 52, 117, 208]) {
      const sites = many(count)
      const lots = shopLots(SHOP_SLOTS, sites)
      const byLot = new Map<string, Set<number>>()
      for (const l of lots) byLot.set(l!.lot, (byLot.get(l!.lot) ?? new Set()).add(l!.scale))
      for (const scales of byLot.values()) expect(scales.size, String(count)).toBe(1)
    }
  })

  it('keeps stores that fit a shared plot at life size', () => {
    // two or four mall units stand on one plot as they are
    expect(plotScale([MALL, MALL])).toBe(1)
    expect(plotScale([MALL, MALL, MALL, MALL])).toBe(1)
    // two high-street shops go one behind the other and lose very little
    expect(plotScale([STREET, STREET])).toBeGreaterThan(0.75)
    // a plaza store with a neighbour behind it gives up some, but nothing like half
    expect(plotScale([PLAZA, MALL])).toBeGreaterThan(0.7)
    // a really crowded plot does shrink, and more so the more there is on it
    const nine = plotScale(many(9, () => PLAZA))
    const sixteen = plotScale(many(16, () => PLAZA))
    expect(nine).toBeLessThan(0.4)
    expect(sixteen).toBeLessThan(nine)
    expect(sixteen).toBeGreaterThan(0.15)
    // two mall units side by side on the first plot, facing the street
    const pair = shopLots(SHOP_SLOTS.slice(0, 1), [MALL, MALL])
    expect(pair[0]!.z).toBe(pair[1]!.z)
    expect(pair[1]!.x - pair[0]!.x).toBeCloseTo(SHOP_LOT.w / 2)
    expect(pair[0]!.scale).toBe(1)
  })

  it('finds every store its own ground, inside its plot, overlapping nobody', () => {
    for (const count of [1, 13, 14, 31, 52, 53, 117, 118, 208]) {
      for (const of of [undefined, () => MALL, () => PLAZA, (i: number) => TIERS[(i * 7 + (i >> 2)) % 3]]) {
        const sites = many(count, of)
        const lots = shopLots(SHOP_SLOTS, sites)
        expect(lots).toHaveLength(count)
        expect(lots.every((l) => l)).toBe(true)
        sound(lots, sites, `${count}`)
      }
    }
    // past sixteen to a plot there is no more room: the extra ones are left off the map
    const over = shopLots(SHOP_SLOTS, many(210))
    expect(over.filter((l) => !l)).toHaveLength(2)
    expect(over.slice(0, 208).every((l) => l)).toBe(true)
  })

  it('leaves room in front of every store on a shared plot for its queue', () => {
    const sites = many(16)
    const lots = shopLots(SHOP_SLOTS.slice(0, 1), sites).map((l) => l!)
    lots.forEach((a, i) => {
      // nothing else on the plot stands on the strip in front of the door
      const front = a.z + (sites[i].h / 2) * a.scale
      const strip = { x0: a.x - (sites[i].w / 2) * a.scale, x1: a.x + (sites[i].w / 2) * a.scale, z0: front, z1: front + (SHOP_ROOM.front - 0.2) * a.scale }
      lots.forEach((b, j) => {
        if (i === j) return
        const bx0 = b.x - (sites[j].w / 2) * b.scale
        const bx1 = b.x + (sites[j].w / 2) * b.scale
        const bz0 = b.z - (sites[j].h / 2) * b.scale
        const bz1 = b.z + (sites[j].h / 2) * b.scale
        expect(bx0 >= strip.x1 - 1e-6 || bx1 <= strip.x0 + 1e-6 || bz0 >= strip.z1 - 1e-6 || bz1 <= strip.z0 + 1e-6, `${i} ${j}`).toBe(true)
      })
    })
  })

  it('makes thirty-one stores at home thirty-one places to click', () => {
    const s = rich()
    for (let i = 0; i < 31; i++) expect(openStore(s, i % 3)).toBeNull()
    const shops = places(s).filter((p) => p.kind === 'store')
    expect(shops).toHaveLength(31)
    expect(new Set(shops.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`)).size).toBe(31)
    for (const p of shops) {
      expect(p.w).toBeGreaterThanOrEqual(5)
      expect(p.site!.w * p.scale!).toBeLessThanOrEqual(p.w + 1e-6)
      expect(p.site!.h * p.scale!).toBeLessThanOrEqual(p.d + 1e-6)
      expect(p.crowded).toBe(true)
    }
    for (const a of shops) for (const b of shops) if (a !== b) expect(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 1e-6 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2 - 1e-6, `${a.id} ${b.id}`).toBe(true)
    // neighbours on one plot are drawn at one scale
    const byLot = new Map<string, Set<number>>()
    for (const p of shops) byLot.set(p.lot!, (byLot.get(p.lot!) ?? new Set()).add(p.scale!))
    for (const scales of byLot.values()) expect(scales.size).toBe(1)
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

  it('are drawn at the scale of the store they stand outside', () => {
    const s = launched((g) => {
      for (let i = 0; i < 40; i++) expect(openStore(g, i % 3)).toBeNull()
    })
    const list = places(s)
    const shops = list.filter((p) => p.kind === 'store' && !p.warn)
    const { queues } = traffic(s, list)
    expect(queues).toHaveLength(shops.length)
    expect(shops.some((p) => p.scale! < 1)).toBe(true)
    shops.forEach((p, i) => {
      const q = queues[i]
      expect(q.scale).toBe(p.scale)
      // the head of the queue is just in front of the door, by the store's own measure
      expect(q.z - (p.z + (p.site!.h / 2) * p.scale!)).toBeCloseTo(1.5 * p.scale!)
      expect(q.people).toBeGreaterThanOrEqual(8)
      expect(q.people).toBeLessThanOrEqual(QUEUE.people)
      // on a shared plot the queue stops at the store's own corner
      const tail = q.x + (QUEUE.head - (q.people / 2 - 1) * QUEUE.pitch) * q.scale
      expect(tail).toBeGreaterThanOrEqual(p.x - (p.site!.w / 2 + 0.6) * p.scale! - 1e-6)
    })
    // and nobody queues when nothing is new
    s.day += 30
    expect(traffic(s).queues).toHaveLength(0)
  })

  it('run to their full length outside a store with a plot to itself', () => {
    const s = launched((g) => expect(openStore(g, 0)).toBeNull())
    const shop = places(s).find((p) => p.kind === 'store')!
    expect(queueOf(shop)).toMatchObject({ scale: 1, people: QUEUE.people, x: shop.x })
  })

  it('share an island plot the same way', () => {
    const s = launched((g) => {
      expect(openStore(g, 0)).toBeNull()
    })
    expect(enterRegion(s, 'eu')).toBeNull()
    for (let i = 0; i < 30; i++) expect(openStore(s, i % 3, 'eu')).toBeNull()
    const d = districts(s).find((x) => x.region.id === 'eu')!
    const shops = places(s).filter((p) => p.kind === 'store' && p.region === 'eu')
    expect(shops).toHaveLength(30)
    // all of them stand on the island, several to a plot
    for (const p of shops) {
      expect(Math.abs(p.x - d.x)).toBeLessThan(ISLAND.w / 2)
      expect(Math.abs(p.z - d.z)).toBeLessThan(ISLAND.d / 2)
      expect(p.crowded).toBe(true)
    }
    expect(new Set(shops.map((p) => p.lot)).size).toBe(12)
    const { queues } = traffic(s)
    const mine = queues.filter((q) => Math.abs(q.x - d.x) < ISLAND.w / 2 && Math.abs(q.z - d.z) < ISLAND.d / 2)
    expect(mine.length).toBe(shops.filter((p) => !p.warn).length)
    expect(mine.every((q) => q.scale > 0 && q.scale <= 1)).toBe(true)
  })
})
