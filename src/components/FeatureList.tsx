// The designer's lists of ports, sensors and extras: a list that stays readable however many are unlocked. Rows
// are grouped under headings, each with a checkbox, the name in full, a line on what it does, and what it costs
// and earns; a search field narrows a long list, and the list scrolls in its own box.
import { type ReactNode, useMemo, useState } from 'react'
import { Icon } from './icons'
import { TextInput, money } from './ui'

export interface FeatureRow {
  id: string
  name: string
  cost: number
  locked: boolean
  /** Heading it is listed under. */
  group: string
  /** One line on what it does. */
  note?: string
  /** What it earns, shown on the right: "+1.0 pts", "up to +4%". */
  score?: string
  /** Said on hover: the whole story, or why it is locked. */
  why?: string
}

/** Lists longer than this get a search field. */
const SEARCH_FROM = 7

export function FeatureList({ items, selected, onToggle, wrap, label }: { items: FeatureRow[]; selected: string[]; onToggle: (id: string) => void; /** Wraps each row (the designer's link to the model). */ wrap: (id: string, row: ReactNode) => ReactNode; label: string }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const groups = useMemo(() => {
    const shown = needle ? items.filter((e) => `${e.name} ${e.note ?? ''} ${e.group}`.toLowerCase().includes(needle)) : items
    const out = new Map<string, FeatureRow[]>()
    for (const e of shown) out.set(e.group, [...(out.get(e.group) ?? []), e])
    return [...out]
  }, [items, needle])
  const on = items.filter((e) => selected.includes(e.id)).length
  return (
    <div className="flex flex-col gap-1.5">
      {items.length >= SEARCH_FROM && (
        <div className="flex items-center gap-2">
          <TextInput value={q} onChange={setQ} placeholder={`Search ${items.length} ${label}`} aria-label={`Search ${label}`} className="min-w-0 flex-1" />
          <span className="num shrink-0 text-xs text-dim">{on} on</span>
        </div>
      )}
      <div className="max-h-[22rem] overflow-y-auto border border-line">
        {groups.length === 0 && <div className="px-2.5 py-3 text-xs text-dim">Nothing matches "{q}".</div>}
        {groups.map(([group, rows]) => (
          <div key={group}>
            {groups.length > 1 || items.length >= SEARCH_FROM ? (
              <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-line bg-raise px-2.5 py-1">
                <span className="label">{group}</span>
                <span className="num text-[11px] text-faint">{rows.filter((e) => selected.includes(e.id)).length}/{rows.length}</span>
              </div>
            ) : null}
            {rows.map((e) =>
              wrap(
                e.id,
                <label className={`flex items-start gap-2.5 border-b border-line/60 px-2.5 py-1.5 ${e.locked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-raise'}`} title={e.why}>
                  <input type="checkbox" className="mt-[3px] shrink-0 accent-accent" disabled={e.locked} checked={selected.includes(e.id)} onChange={() => onToggle(e.id)} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] leading-tight ${e.locked ? 'text-faint' : 'text-fg'}`}>{e.name}</span>
                    {e.note && <span className="mt-0.5 block text-xs leading-snug text-dim">{e.note}</span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5 pt-px">
                    {e.locked ? <Icon name="lock" size={12} className="text-faint" /> : <span className="num text-xs text-fg">+{money(e.cost)}</span>}
                    {e.score && <span className="num text-[11px] text-accent">{e.score}</span>}
                  </span>
                </label>,
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
