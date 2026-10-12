import { describe, expect, it } from 'vitest'
import { defaultConfig, newGame, tick } from '../sim/game'
import { buyersWords, families, inDays, makesText, marketView, onOrder, orderDays, orderFamilies, pinMine, priceEffect, rankBy, score, shareChange, shareSeries, statusNote } from './DeviceLogic'

describe('ranking and pinning', () => {
  const rows = [
    { id: 'a', units: 5, mine: false },
    { id: 'b', units: 90, mine: false },
    { id: 'me', units: 5, mine: true },
    { id: 'c', units: 40, mine: false },
  ]
  it('ranks best first, from 1, and ties keep their order', () => {
    const rank = rankBy(rows, (r) => r.id, (r) => r.units)
    expect([...rank]).toEqual([['b', 1], ['c', 2], ['a', 3], ['me', 4]])
  })
  it('pins the player first without changing either order', () => {
    const { mine, rest } = pinMine(rows, (r) => r.mine)
    expect(mine.map((r) => r.id)).toEqual(['me'])
    expect(rest.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('families', () => {
  const rows = [
    { name: 'Nova', family: 'Nova', price: 400 },
    { name: 'Solo', family: 'Solo', price: 900 },
    { name: 'Nova Pro', family: 'Nova', price: 700 },
    { name: 'Tab', family: 'Tab', price: 300 },
    { name: 'Tab Max', family: 'Tab', price: 1200 },
  ]
  it('is one plain list when every family has one model', () => {
    const out = families([rows[0], rows[1], rows[3]], (r) => r.family)
    expect(out.grouped).toBe(false)
    expect(out.groups).toHaveLength(1)
    expect(out.groups[0].label).toBeNull()
  })
  it('heads families of two or more and leaves the one-model devices last', () => {
    const out = families(rows, (r) => r.family)
    expect(out.grouped).toBe(true)
    expect(out.groups.map((g) => g.label)).toEqual(['Nova', 'Tab', null])
    expect(out.groups[2].rows.map((r) => r.name)).toEqual(['Solo'])
  })
  it('orders families by their best row under the sorted column', () => {
    const { groups } = families(rows, (r) => r.family)
    expect(orderFamilies(groups, (r) => r.price, 'desc').map((g) => g.label)).toEqual(['Tab', 'Nova', null])
    expect(orderFamilies(groups, (r) => r.price, 'asc').map((g) => g.label)).toEqual(['Tab', 'Nova', null])
    expect(orderFamilies(groups, (r) => r.name, 'asc').map((g) => g.label)).toEqual(['Nova', 'Tab', null])
    expect(orderFamilies(groups, undefined, 'asc').map((g) => g.label)).toEqual(['Nova', 'Tab', null])
  })
})

describe('words and figures', () => {
  it('writes a score with one decimal', () => {
    expect(score(8.94)).toBe('8.9')
    expect(score(7)).toBe('7.0')
    expect(score(0)).toBe('--')
  })
  it('says what a company makes in words', () => {
    expect(makesText(['phone', 'tablet'])).toEqual({ short: 'Phones, tablets', full: 'Phones, tablets' })
    const five = makesText(['phone', 'tablet', 'watch', 'laptop', 'tv'])
    expect(five.short).toBe('Phones, tablets +3')
    expect(five.full.split(', ')).toHaveLength(5)
    expect(five.full.startsWith('Phones, tablets, watches, laptops, ')).toBe(true)
    expect(makesText([]).short).toBe('--')
  })
  it('shows a status only when it is not the default', () => {
    const base = { status: 'sale' as const, stock: 10, companyId: 'player', devDaysLeft: 0 }
    expect(statusNote(base)).toBeNull()
    expect(statusNote({ ...base, stock: 0 })?.text).toBe('Sold out')
    expect(statusNote({ ...base, stock: 0, companyId: 'r1' })).toBeNull()
    expect(statusNote({ ...base, status: 'dev', devDaysLeft: 46 })?.text).toBe('In development, 46 days')
    expect(statusNote({ ...base, status: 'ended' })?.text).toBe('Ended')
    expect(statusNote({ ...base, recall: { state: 'open', day: 1, cost: 1 } })?.text).toBe('Recall')
  })
  it('puts a change in buyers into words', () => {
    expect(buyersWords(1.01)).toBe('about the same number of buyers')
    expect(buyersWords(0.88)).toBe('about 12% fewer buyers')
    expect(buyersWords(1.3)).toBe('about 30% more buyers')
    expect(buyersWords(2.5)).toBe('about 2.5 times the buyers')
    expect(inDays(1)).toBe('tomorrow')
    expect(inDays(6)).toBe('in 6 days')
  })
  it('weighs a stronger pull against the rest of the field', () => {
    // alone against the outside option: doubling the pull less than doubles the share
    expect(shareChange(1, 2.5, 2)).toBeCloseTo((2 / 3.5) / (1 / 2.5))
    expect(shareChange(1, 2.5, 1)).toBeCloseTo(1)
    // a device nobody is choosing yet moves by the raw factor
    expect(shareChange(0, 2.5, 0.5)).toBe(0.5)
  })
})

describe('market share lines', () => {
  const companies = [
    { id: 'player', name: 'Us', color: '#f60', isPlayer: true },
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => ({ id, name: id.toUpperCase(), color: `#00${i}`, isPlayer: false })),
  ]
  const history = [1, 2].map((month) => ({ month, units: { player: 10, a: 100, b: 90, c: 80, d: 70, e: 60, f: 50, g: 40 } }))
  it('shows the player, the top five and the rest as one', () => {
    const s = shareSeries(history, companies, (m) => `m${m}`)
    expect(s.lines.map((l) => l.id)).toEqual(['player', 'a', 'b', 'c', 'd', 'e', 'others'])
    expect(s.lines[0].color).toBeUndefined()
    expect(s.data).toHaveLength(2)
    const row = s.data[1]
    expect(row.month).toBe('m2')
    expect(row.player).toBe(2)
    expect(row.others).toBe(18)
    const total = s.lines.reduce((a, l) => a + Number(row[l.id]), 0)
    expect(total).toBeCloseTo(100, 0)
  })
})

describe('against a real game', () => {
  const g = newGame({ ...defaultConfig(), seed: 7 })
  tick(g, 400)
  const rival = g.products.find((p) => p.companyId !== 'player' && p.status === 'sale')!
  it('ranks every device of a type on sale once', () => {
    const view = marketView(g, rival.type)
    expect(view.ranked.length).toBeGreaterThan(1)
    expect(new Set(view.rank.values()).size).toBe(view.ranked.length)
    expect(view.mine.length + view.rest.length).toBe(view.ranked.length)
    expect(view.rest.every((p) => p.companyId !== 'player')).toBe(true)
    const seg = marketView(g, rival.type, rival.segment)
    const shares = [...seg.win!.values()]
    expect(shares.reduce((a, b) => a + b, 0)).toBeLessThan(1)
    expect(seg.ranked[0].id).toBe([...seg.win!].sort((a, b) => b[1] - a[1])[0][0])
  })
  it('a dearer device keeps more on each unit and wins fewer buyers', () => {
    const now = priceEffect(g, rival, rival.price, 100)
    expect(now.buyers).toBe(1)
    expect(now.margin).toBeCloseTo(now.marginNow)
    const up = priceEffect(g, rival, rival.price * 1.3, 100)
    expect(up.margin).toBeGreaterThan(up.marginNow)
    expect(up.buyers).toBeLessThan(1)
    expect(up.words).toMatch(/fewer buyers/)
    const down = priceEffect(g, rival, rival.price * 0.7, 100)
    expect(down.margin).toBeLessThan(down.marginNow)
    expect(down.buyers).toBeGreaterThanOrEqual(1)
    expect(up.typical).toBeGreaterThan(0)
  })
  it('counts the days a contract order takes: the wait, then the shipping', () => {
    const order = { id: 'x', productId: rival.id, quantity: 5000, done: 0, mode: 'contract' as const, placedDay: g.day }
    g.orders.push(order)
    const days = orderDays(g, order)!
    expect(days).toBeGreaterThanOrEqual(11)
    expect(onOrder(g, rival.id)).toEqual({ units: 5000, days })
    const stuck = { ...order, id: 'y', mode: 'factory' as const }
    g.orders.push(stuck)
    expect(orderDays(g, stuck)).toBeNull()
    expect(onOrder(g, rival.id)).toEqual({ units: 10000, days: null })
    expect(onOrder(g, 'nothing')).toBeNull()
    g.orders.length = 0
  })
})
