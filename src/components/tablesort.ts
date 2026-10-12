// What the Table component does that is not drawing: ordering rows, and
// deciding which columns there is room for. Kept apart so it can be tested
// without a page.

export type SortDir = 'asc' | 'desc'
export interface SortState {
  col: string
  dir: SortDir
}
export type SortKey<R> = (row: R) => number | string | null | undefined

const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) || v === ''

/**
 * Rows in order of a column. Numbers by value, text by name without regard to
 * case. Rows with nothing in the column go last whichever way the column is
 * sorted, and rows that tie keep the order they came in.
 */
export function sortRows<R>(rows: readonly R[], key: SortKey<R> | undefined, dir: SortDir): R[] {
  if (!key) return [...rows]
  const sign = dir === 'asc' ? 1 : -1
  return rows
    .map((row, at) => ({ row, at, v: key(row) }))
    .sort((a, b) => {
      const ea = blank(a.v)
      const eb = blank(b.v)
      if (ea || eb) return ea === eb ? a.at - b.at : ea ? 1 : -1
      const by = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), 'en', { sensitivity: 'base', numeric: true })
      return by ? by * sign : a.at - b.at
    })
    .map((x) => x.row)
}

/**
 * What a click on a column heading does to the sort: a new column starts in
 * its own first direction (biggest first for figures, A to Z for names), the
 * same column again turns it round.
 */
export function nextSort(cur: SortState | null, col: string, first: SortDir): SortState {
  if (!cur || cur.col !== col) return { col, dir: first }
  return { col, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
}

export interface Fit {
  id: string
  /** The width the column needs, in px. */
  min: number
  /** When there is not room for everything: the higher the number, the sooner the column goes. A column without one always stays. */
  drop?: number
}

/**
 * The columns there is room for. A table never scrolls sideways: when it is
 * short of width it lets go of its least important columns, one at a time,
 * until what is left fits.
 */
export function fitColumns(cols: readonly Fit[], width: number): string[] {
  let kept = [...cols]
  const need = () => kept.reduce((sum, c) => sum + c.min, 0)
  while (need() > width) {
    let worst = -1
    for (let i = 0; i < kept.length; i++) if (kept[i].drop && (worst < 0 || kept[i].drop! > kept[worst].drop! || (kept[i].drop === kept[worst].drop && i > worst))) worst = i
    if (worst < 0) break
    kept = kept.filter((_, i) => i !== worst)
  }
  return kept.map((c) => c.id)
}
