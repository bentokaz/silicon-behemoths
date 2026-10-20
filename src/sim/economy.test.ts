// Start eras, operating systems, automatic reordering, launch marketing, the
// store books, bigger plots, contract work and prototype tests.
import { afterEach, describe, expect, it } from 'vitest'
import { marketLevel } from '../data/catalog'
import { setEra, typeOpen } from '../data/eras'
import { acceptContract, defaultConfig, fitOutQuote, fitOutStore, storeOpenCost, storeOutlook, devPlan, dateOf, hireExec, migrate, newGame, openStores, orderProduction, setOsLicence, setOsLook, setReorder, starterDesign, startProduct, tick } from './game'
import { demandEstimate, storeMonth } from './insight'
import { prototypeVerdicts, testPrototype } from './prototype'
import { storeAdvice, storeTrade } from './retail'
import { SITE_TIERS } from './sites'
import { FREE_OS, cleanLook, osRoyalty, softwareBonus } from './tech'
import type { GameConfig, GameState } from './types'
import { unlockBlocked } from './world'

const game = (cfg: Partial<GameConfig> = {}) => newGame({ ...defaultConfig(), unlimitedMoney: true, startType: 'phone', ...cfg })
const launch = (s: GameState, marketing = 0, quantity = 200000) => {
  const design = starterDesign(s, 'phone')
  expect(startProduct(s, { design, family: 'T', variant: '', price: 450, tiers: [], quantity, mode: 'contract', marketing })).toBeNull()
  tick(s, devPlan(design, s).days + 1)
  return s.products.find((p) => p.companyId === 'player')!
}
afterEach(() => setEra(undefined))

describe('start eras', () => {
  it('starts in the year chosen, with weaker technology and the kinds of device of the day', () => {
    const s = game({ startYear: 2000, techLevel: 0 })
    expect(dateOf(0).year).toBe(2000)
    expect(marketLevel(0)).toBe(0)
    expect(typeOpen('watch', 0)).toBe(false)
    expect(unlockBlocked(s, 'watch')).toMatch(/2014/)
    // no rival sells a watch before there are any
    expect(s.products.some((p) => p.type === 'watch')).toBe(false)
    expect(s.products.some((p) => p.type === 'phone')).toBe(true)
    // a new game today is as it always was
    game()
    expect(dateOf(0).year).toBe(2026)
    expect(marketLevel(0)).toBe(3)
  })

  it('opens a new market when its year comes, and the rivals arrive', () => {
    const s = game({ startYear: 2010, techLevel: 1 })
    expect(s.products.some((p) => p.type === 'watch')).toBe(false)
    tick(s, 360 * 4 + 200)
    expect(s.news.some((n) => /first smartwatches|first watches/i.test(n.text))).toBe(true)
    expect(s.products.some((p) => p.type === 'watch' && p.companyId !== 'player')).toBe(true)
  })

  it('keeps the calendar of a loaded game', () => {
    const s = game({ startYear: 2007, techLevel: 0 })
    game()
    migrate(JSON.parse(JSON.stringify(s)))
    expect(dateOf(0).year).toBe(2007)
  })
})

describe('operating systems', () => {
  it('starts on the free system, which costs appeal, and a licence costs a royalty a device', () => {
    const s = game()
    expect(s.os.licence).toBe(FREE_OS)
    expect(softwareBonus(s)).toBeLessThan(0)
    expect(osRoyalty(s)).toBe(0)
    expect(setOsLicence(s, 'nebula')).toBeNull()
    expect(softwareBonus(s)).toBeGreaterThan(0)
    expect(osRoyalty(s)).toBeGreaterThan(0)
    expect(setOsLicence(s, 'nope')).toMatch(/no such/)
    // a licence from the future is not on offer
    const old = game({ startYear: 2000, techLevel: 0 })
    expect(setOsLicence(old, 'androyd')).toMatch(/2008/)
  })

  it('a save from before licences runs the stock system, free of the new rules', () => {
    const s = game()
    delete s.os.licence
    expect(softwareBonus(s)).toBe(0)
  })

  it('keeps a designed look that is checked part by part', () => {
    const s = game()
    setOsLook(s, { accent: '#00FF00', iconShape: 'circle', layout: 'tiles', font: 'comic' as never, wallpaper: 'red', dark: false })
    const look = cleanLook(s.os.look)
    expect(look).toMatchObject({ accent: '#00ff00', iconShape: 'circle', layout: 'tiles', font: 'sans', dark: false })
    expect(look.wallpaper).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('automatic reordering', () => {
  it('needs a Head of Operations, then orders more when stock runs low', () => {
    const s = game()
    const p = launch(s, 0, 2000)
    expect(setReorder(s, p.id, { on: true })).toMatch(/Head of Operations/)
    const coo = s.execPool.find((e) => e.exec === 'coo')
    if (coo) expect(hireExec(s, coo.id)).toBeNull()
    else s.staff.push({ ...s.staff[0], id: 'x-coo', exec: 'coo' } as never)
    expect(setReorder(s, p.id, { on: true, at: p.stock + 100, rule: 'fixed', qty: 5000 })).toBeNull()
    const before = s.orders.length
    tick(s, 1)
    expect(s.orders.length).toBe(before + 1)
    expect(s.orders.at(-1)!.quantity).toBe(5000)
    // what is on order counts: it does not order again the next day
    tick(s, 1)
    expect(s.orders.length).toBe(before + 1)
    expect(setReorder(s, p.id, { at: -5, qty: Number.NaN })).toBeNull()
    expect(p.reorder!.at).toBe(0)
    expect(p.reorder!.qty).toBe(5000)
  })
})

describe('launch marketing', () => {
  it('raises the estimate, and the sales follow it, even for a company everybody knows', () => {
    const run = (marketing: number) => {
      const s = game()
      for (const r of Object.values(s.regions)) if (r.open) r.awareness = 0.9
      const est = demandEstimate(s, starterDesign(s, 'phone'), 450, { marketing })
      const p = launch(s, marketing, 500000)
      const sold = p.unitsSold
      tick(s, 90)
      return { est: (est.low + est.high) / 2, real: p.unitsSold - sold }
    }
    const none = run(0)
    const lots = run(10e6)
    expect(lots.est).toBeGreaterThan(none.est * 1.15)
    expect(lots.real).toBeGreaterThan(none.real * 1.15)
    for (const r of [none, lots]) expect(r.real / r.est).toBeGreaterThan(0.6), expect(r.real / r.est).toBeLessThan(1.6)
  })
})

describe('stores', () => {
  it('a well-fitted mall store with good stock pays its way, and an empty one says why not', () => {
    const s = game()
    launch(s, 2e6, 300000)
    expect(openStores(s, 0, [s.config.home ?? 'na'], 2)).toBeNull()
    expect(s.stores).toHaveLength(2)
    const [plain, fitted] = s.stores
    // the first is stripped to a table and a checkout; the second keeps the standard fit-out
    plain.site.items.length = 2
    const t = storeTrade(s, fitted)
    expect(t.profit).toBeGreaterThan(0)
    expect(storeTrade(s, plain).profit).toBeLessThan(0)
    const m = storeMonth(s, fitted.id)
    expect(m.profit).toBeCloseTo(m.revenue - m.cogs - m.costs, 6)
    expect(storeAdvice(s, plain).map((a) => a.id)).toContain('appeal')
    expect(openStores(s, 0, ['na'], 99)).toMatch(/At most/)
    expect(openStores(s, 0, ['nowhere'], 1)).toMatch(/no such region/)
  })
})

describe('store balance', () => {
  const stocked = () => {
    const s = game()
    launch(s, 2e6, 300000)
    return s
  }
  it('a store opened with the standard fit-out and good stock clearly pays its way, at every kind of location', () => {
    for (const tier of [0, 1, 2]) {
      const s = stocked()
      expect(openStores(s, tier, [s.config.home ?? 'na'], 1)).toBeNull()
      const t = storeTrade(s, s.stores[0])
      expect(t.stats.open, `tier ${tier}`).toBe(true)
      // a profit of at least a third of what the rent and wages come to, within a month
      expect(t.profit, `tier ${tier}`).toBeGreaterThan(t.costs.total * 0.3)
    }
  })

  it('loses money with empty shelves, with overstaffing and with poor devices, and says which', () => {
    const s = stocked()
    expect(openStores(s, 1, [s.config.home ?? 'na'], 1)).toBeNull()
    const st = s.stores[0]
    const good = storeTrade(s, st)
    expect(good.profit).toBeGreaterThan(0)
    expect(storeAdvice(s, st, good).map((a) => a.id)).not.toContain('staff')
    // overstaffed: a support bar and a repair bench per checkout, six times over
    for (let i = 0; i < 6; i++) st.site.items.push({ id: `x${i}s`, kind: 'support', x: 1 + i * 2, y: 1, rot: 0 }, { id: `x${i}r`, kind: 'repair', x: 1 + i * 2, y: 2, rot: 0 })
    const staffed = storeTrade(s, st)
    expect(staffed.costs.wages).toBeGreaterThan(good.costs.wages * 3)
    // empty shelves
    const p = s.products.find((x) => x.companyId === 'player')!
    const stock = p.stock
    p.stock = 0
    const empty = storeTrade(s, st)
    expect(empty.units).toBe(0)
    expect(empty.profit).toBeLessThan(0)
    expect(storeAdvice(s, st, empty).map((a) => a.id)).toContain('stock')
    expect(storeAdvice(s, st, empty).map((a) => a.id)).toContain('staff')
    p.stock = stock
    // a device nobody wants
    p.launchDay -= 3000
    const poor = storeTrade(s, st)
    expect(poor.units).toBeLessThan(good.units / 2)
  })
})

describe('stores in a running company', () => {
  it('a bare store from an older save is offered a fit-out that turns it to profit', () => {
    const s = game()
    launch(s, 2e6, 300000)
    expect(openStores(s, 1, [s.config.home ?? 'na'], 1)).toBeNull()
    const st = s.stores[0]
    // as stores opened before the standard fit-out: one table and a checkout
    st.site.items = st.site.items.filter((i) => i.kind === 'counter').slice(0, 1).concat(st.site.items.filter((i) => i.kind === 'table').slice(0, 1))
    expect(storeTrade(s, st).profit).toBeLessThan(0)
    const q = fitOutQuote(s, st.id)
    expect(q.error).toBeNull()
    expect(q.better).toBe(true)
    expect(q.cost).toBeGreaterThan(0)
    const cash = s.cash
    expect(fitOutStore(s, st.id)).toBeNull()
    expect(s.cash).toBeCloseTo(cash - q.cost, 0)
    expect(storeTrade(s, st).profit).toBeGreaterThan(0)
    expect(fitOutQuote(s, st.id).better).toBe(false)
  })

  it('stores keep their shelves stocked when retailers would empty the warehouse', () => {
    const s = game()
    const p = launch(s, 2e6, 3000)
    expect(openStores(s, 1, [s.config.home ?? 'na'], 1)).toBeNull()
    tick(s, 20)
    expect(s.stores[0].unitsTotal).toBeGreaterThan(50)
    expect(p.stock).toBeGreaterThanOrEqual(0)
  })

  it('the outlook for a new store is positive in every open region at every kind of site, and costs what opening charges', () => {
    const s = game()
    launch(s, 2e6, 300000)
    // regions entered a while ago, where a fair share of people know the name
    for (const r of Object.values(s.regions)) (r.open = true), (r.awareness = Math.max(r.awareness, 0.25))
    for (const tier of [0, 1, 2]) {
      const out = storeOutlook(s, tier)
      expect(out.length).toBeGreaterThan(3)
      for (const o of out) expect(o.profit, `tier ${tier} ${o.region}`).toBeGreaterThan(0)
      const cash = s.cash
      expect(openStores(s, tier, [out[0].region, out[1].region], 2)).toBeNull()
      expect(cash - s.cash).toBeCloseTo(storeOpenCost(s, tier)! * 4, 0)
    }
  })
})

describe('bigger plots', () => {
  it('widens an office from an older save around what is built, losing nothing', () => {
    const s = game()
    const old = SITE_TIERS.office[0]
    const small = { ...s.office, w: 14, h: 10, grid: s.office.grid.filter((_, i) => i % s.office.w < 14 && Math.floor(i / s.office.w) < 10) }
    const save = JSON.parse(JSON.stringify({ ...s, version: 8, office: small }))
    const s2 = migrate(save)
    expect([s2.office.w, s2.office.h]).toEqual([old.w, old.h])
    expect(s2.office.items).toHaveLength(small.items.length)
    expect(s2.office.grid.filter(Boolean).length).toBe(small.grid.filter(Boolean).length)
  })
})

describe('contracts and prototype tests', () => {
  it('offers contract work that pays on delivery', () => {
    const s = game()
    const p = launch(s, 0, 300000)
    tick(s, 360)
    const offer = s.contracts?.find((c) => c.state === 'offer' && c.expires > s.day && c.minReview <= p.reviewAvg)
    if (!offer) return
    expect(acceptContract(s, offer.id, p.id)).toBeNull()
    const cash = s.cash
    tick(s, 2)
    expect(s.contracts!.find((c) => c.id === offer.id)!.state).toBe('done')
    expect(s.cash).toBeGreaterThan(cash)
  })

  it('charges a fee and names up to three weaknesses for each segment', () => {
    const s = game({ unlimitedMoney: false })
    const d = starterDesign(s, 'phone')
    const cash = s.cash
    expect(testPrototype(s, d)).toBeNull()
    expect(s.cash).toBeLessThan(cash)
    const v = prototypeVerdicts(s, d, 5000)
    expect(v.length).toBeGreaterThan(2)
    for (const seg of v) expect(seg.weak.length).toBeLessThanOrEqual(3)
    expect(v.some((seg) => seg.weak.some((w) => w.key === 'price'))).toBe(true)
  })
})

void orderProduction
