import { describe, expect, it } from 'vitest'
import { fitColumns, nextSort, sortRows } from './tablesort'

const rows = [
  { name: 'vista', sold: 12, price: 400 as number | null },
  { name: 'Apex', sold: 300, price: null },
  { name: 'Mono 10', sold: 12, price: 900 },
  { name: 'Mono 9', sold: 0, price: 150 },
]

describe('table sorting', () => {
  it('orders numbers by value, both ways', () => {
    expect(sortRows(rows, (r) => r.sold, 'desc').map((r) => r.name)).toEqual(['Apex', 'vista', 'Mono 10', 'Mono 9'])
    expect(sortRows(rows, (r) => r.sold, 'asc').map((r) => r.name)).toEqual(['Mono 9', 'vista', 'Mono 10', 'Apex'])
  })

  it('keeps rows that tie in the order they came in', () => {
    const asc = sortRows(rows, (r) => r.sold, 'asc').map((r) => r.name)
    expect(asc.indexOf('vista')).toBeLessThan(asc.indexOf('Mono 10'))
    const desc = sortRows(rows, (r) => r.sold, 'desc').map((r) => r.name)
    expect(desc.indexOf('vista')).toBeLessThan(desc.indexOf('Mono 10'))
  })

  it('orders names without regard to case and reads the numbers in them', () => {
    expect(sortRows(rows, (r) => r.name, 'asc').map((r) => r.name)).toEqual(['Apex', 'Mono 9', 'Mono 10', 'vista'])
  })

  it('puts rows with nothing in the column last, whichever way it is sorted', () => {
    expect(sortRows(rows, (r) => r.price, 'asc').map((r) => r.name)).toEqual(['Mono 9', 'vista', 'Mono 10', 'Apex'])
    expect(sortRows(rows, (r) => r.price, 'desc').map((r) => r.name)).toEqual(['Mono 10', 'vista', 'Mono 9', 'Apex'])
    expect(sortRows([{ v: NaN }, { v: 2 }, { v: 1 }], (r) => r.v, 'desc').map((r) => r.v)).toEqual([2, 1, NaN])
  })

  it('leaves the rows alone when the column has no order, and never changes the list it was given', () => {
    const before = [...rows]
    expect(sortRows(rows, undefined, 'asc')).toEqual(rows)
    sortRows(rows, (r) => r.sold, 'asc')
    expect(rows).toEqual(before)
  })

  it('starts a new column in its own direction and turns the same column round', () => {
    expect(nextSort(null, 'sold', 'desc')).toEqual({ col: 'sold', dir: 'desc' })
    expect(nextSort({ col: 'sold', dir: 'desc' }, 'sold', 'desc')).toEqual({ col: 'sold', dir: 'asc' })
    expect(nextSort({ col: 'sold', dir: 'asc' }, 'sold', 'desc')).toEqual({ col: 'sold', dir: 'desc' })
    expect(nextSort({ col: 'sold', dir: 'asc' }, 'name', 'asc')).toEqual({ col: 'name', dir: 'asc' })
  })
})

describe('table columns', () => {
  const cols = [
    { id: 'name', min: 160 },
    { id: 'price', min: 80 },
    { id: 'stock', min: 120 },
    { id: 'trend', min: 90, drop: 2 },
    { id: 'profit', min: 90, drop: 1 },
    { id: 'review', min: 70, drop: 3 },
  ]

  it('shows everything when there is room', () => {
    expect(fitColumns(cols, 700)).toEqual(['name', 'price', 'stock', 'trend', 'profit', 'review'])
  })

  it('lets go of the least important column first, one at a time', () => {
    expect(fitColumns(cols, 600)).toEqual(['name', 'price', 'stock', 'trend', 'profit'])
    expect(fitColumns(cols, 500)).toEqual(['name', 'price', 'stock', 'profit'])
    expect(fitColumns(cols, 400)).toEqual(['name', 'price', 'stock'])
  })

  it('never drops a column that has no rank, however narrow', () => {
    expect(fitColumns(cols, 10)).toEqual(['name', 'price', 'stock'])
  })
})
