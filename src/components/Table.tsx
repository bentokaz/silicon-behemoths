// The one table there is. One header row; columns on one grid, shared by
// every group of rows; headings that sort when clicked; a first column that
// stays put; never a sideways scroll (columns are let go instead); figures
// right-aligned in the number face; a row's own action at its right-hand end,
// shown when the row is pointed at or has the keyboard.
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { keepView, keptView, viewKept } from '../store/focus'
import { Icon } from './icons'
import { type SortDir, type SortKey, type SortState, fitColumns, nextSort, sortRows, squeeze } from './tablesort'

export interface Column<R> {
  id: string
  /** The heading: one or two words. */
  head: ReactNode
  /** What the heading says on hover, when the short form needs explaining. */
  title?: string
  /** A figure: right-aligned, in the number face. */
  num?: boolean
  cell: (row: R) => ReactNode
  /** What the column is ordered by. Without it the heading does not sort. */
  sort?: SortKey<R>
  /** The direction of the first click. Figures start biggest first, names A to Z. */
  first?: SortDir
  /** The width the column takes, in px. Figures default to 88, text to 120. The first column takes whatever is left. */
  min?: number
  /** When the table is short of room: the higher the number, the sooner the column is let go. Without one it always stays. */
  drop?: number
  /** Extra classes for the cells of the column. */
  className?: string
}

export interface TableGroup<R> {
  key: string
  label: ReactNode
  /** Something at the right of the group's row: a total, a count. */
  right?: ReactNode
  rows: R[]
}

interface Props<R> {
  cols: Column<R>[]
  /** The rows, or groups of rows under a heading each. Give one or the other. */
  rows?: readonly R[]
  groups?: TableGroup<R>[]
  rowKey: (row: R) => string
  /** What opening a row does (a click, Enter or Space). */
  onRow?: (row: R) => void
  /** The key of the row whose details are open. */
  selected?: string | null
  /** The row's own action, at its right-hand end. Shown on hover and focus. */
  action?: (row: R) => ReactNode
  /** Rows whose action is shown all the time, because it is what the row needs (a sold-out device's Reorder). */
  actionAlways?: (row: R) => boolean
  /** Width of the action column in px. */
  actionWidth?: number
  /** The order the table opens in. */
  sort?: SortState
  /** A name under which the chosen order is remembered. */
  keep?: string
  /** What to show when there are no rows. */
  empty?: ReactNode
  rowTitle?: (row: R) => string | undefined
  /** Extra classes for a row (a dimmed discontinued device). */
  rowClass?: (row: R) => string
  /** Width the first column needs before others are let go. */
  firstMin?: number
  className?: string
  label?: string
}

const widthOf = <R,>(c: Column<R>) => c.min ?? (c.num ? 88 : 120)

export function Table<R>({ cols, rows, groups, rowKey, onRow, selected, action, actionAlways, actionWidth = 104, sort: initial, keep, empty, rowTitle, rowClass, firstMin = 150, className = '', label }: Props<R>) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => setWidth(el.clientWidth)
    read()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(read)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  // a cell whose text is cut short says it in full on hover
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    for (const td of el.querySelectorAll<HTMLElement>('tbody td, thead th span')) {
      const cut = td.scrollWidth > td.clientWidth + 1
      if (cut && !td.title && !td.querySelector('[title]')) (td.title = (td.textContent ?? '').trim()), (td.dataset.autoTitle = '1')
      else if (!cut && td.dataset.autoTitle) (td.removeAttribute('title'), delete td.dataset.autoTitle)
      else if (cut && td.dataset.autoTitle) td.title = (td.textContent ?? '').trim()
    }
  })

  const key = keep ? `sort:${keep}` : ''
  const [sort, setSortState] = useState<SortState | null>(() => (key && viewKept(key) ? keptView<SortState | null>(key) : (initial ?? null)))
  const setSort = (next: SortState) => (key && keepView(key, next), setSortState(next))

  const shown = useMemo(() => {
    if (!width) return cols
    const ids = fitColumns(
      cols.map((c, i) => ({ id: c.id, min: i === 0 ? Math.max(firstMin, c.min ?? 0) : widthOf(c), drop: i === 0 ? undefined : c.drop })),
      width - (action ? actionWidth : 0),
    )
    return cols.filter((c) => ids.includes(c.id))
  }, [cols, width, action, actionWidth, firstMin])

  // when even the columns that must stay do not fit, they narrow in proportion: a table never scrolls sideways
  const tight = width ? squeeze(Math.min(firstMin, 120), shown.slice(1).reduce((sum, c) => sum + widthOf(c), 0) + (action ? actionWidth : 0), width) : 1

  const by = sort ? cols.find((c) => c.id === sort.col) : undefined
  const order = (list: readonly R[]) => (by?.sort && sort ? sortRows(list, by.sort, sort.dir) : [...list])
  const sets: TableGroup<R>[] = groups ? groups.map((g) => ({ ...g, rows: order(g.rows) })) : [{ key: '', label: null, rows: order(rows ?? []) }]
  const count = sets.reduce((n, g) => n + g.rows.length, 0)
  const span = shown.length + (action ? 1 : 0)

  const openWith = (row: R) => (e: ReactKeyboardEvent) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    onRow?.(row)
  }

  return (
    <div ref={box} className={`min-w-0 overflow-x-hidden ${className}`}>
      <table aria-label={label} className="w-full table-fixed border-collapse text-xs">
        <colgroup>
          {shown.map((c, i) => (
            <col key={c.id} style={i === 0 ? undefined : { width: Math.floor(widthOf(c) * tight) }} />
          ))}
          {action && <col style={{ width: Math.floor(actionWidth * tight) }} />}
        </colgroup>
        <thead>
          <tr>
            {shown.map((c, i) => {
              const on = sort?.col === c.id
              const cls = `th sticky top-0 z-[2] h-7 border-b border-line2 bg-panel px-2 ${c.num ? 'text-right' : 'text-left'} ${i === 0 ? 'left-0 z-[3]' : ''}`
              if (!c.sort)
                return (
                  <th key={c.id} scope="col" title={c.title} className={cls}>
                    <span className="block truncate">{c.head}</span>
                  </th>
                )
              return (
                <th key={c.id} scope="col" aria-sort={on ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`${cls} !p-0`}>
                  <button type="button" title={c.title ?? 'Sort by this column'} onClick={() => setSort(nextSort(sort, c.id, c.first ?? (c.num ? 'desc' : 'asc')))} className={`th flex h-7 w-full min-w-0 items-center gap-1 px-2 hover:text-fg ${c.num ? 'justify-end' : 'justify-start'} ${on ? '!text-fg' : ''}`}>
                    <span className="min-w-0 truncate">{c.head}</span>
                    {on && <Icon name={sort!.dir === 'asc' ? 'chevronUp' : 'chevronDown'} size={10} className="text-accent" />}
                  </button>
                </th>
              )
            })}
            {action && <th scope="col" className="th sticky top-0 z-[2] h-7 border-b border-line2 bg-panel" aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {sets.map((g) => [
            g.label !== null && (
              <tr key={`g:${g.key}`}>
                <td colSpan={span} className="h-7 border-b border-line bg-raise px-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-xs font-semibold text-fg">{g.label}</span>
                    {g.right !== undefined && <span className="num shrink-0 text-[11px] text-dim">{g.right}</span>}
                  </div>
                </td>
              </tr>
            ),
            ...g.rows.map((row) => {
              const k = rowKey(row)
              const on = selected === k
              const always = actionAlways?.(row)
              return (
                <tr
                  key={k}
                  data-row
                  title={rowTitle?.(row)}
                  aria-selected={selected === undefined ? undefined : on}
                  {...(onRow ? { tabIndex: 0, onClick: () => onRow(row), onKeyDown: openWith(row) } : {})}
                  className={`group/row ${onRow ? 'cursor-pointer' : ''} ${on ? '[&>td]:bg-accent/10' : 'hover:[&>td]:bg-hover'} ${rowClass?.(row) ?? ''}`}
                >
                  {shown.map((c, i) => (
                    <td key={c.id} className={`h-8 overflow-hidden text-ellipsis whitespace-nowrap border-b border-line px-2 ${c.num ? 'num text-right' : 'text-left'} ${i === 0 ? `sticky left-0 z-[1] bg-panel ${on ? 'border-l-2 border-l-accent' : ''}` : ''} ${c.className ?? ''}`}>
                      {c.cell(row)}
                    </td>
                  ))}
                  {action && (
                    <td className="h-8 border-b border-line px-1 text-right" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <span className={`inline-flex items-center justify-end gap-1 ${always ? '' : 'opacity-0 focus-within:opacity-100 group-hover/row:opacity-100 group-focus/row:opacity-100 group-focus-within/row:opacity-100'}`}>{action(row)}</span>
                    </td>
                  )}
                </tr>
              )
            }),
          ])}
        </tbody>
      </table>
      {count === 0 && empty !== undefined && <div className="px-3 py-6 text-center text-xs text-dim">{empty}</div>}
    </div>
  )
}
