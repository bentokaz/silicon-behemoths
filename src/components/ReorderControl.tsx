// Automatic reordering of one device: a toggle for the Devices table, and the
// full rule (threshold and quantity) for the device drawer.
import { setReorder } from '../sim/game'
import { MAX_REORDER_DAYS, defaultReorder, reorderLocked, reorderUnits } from '../sim/reorder'
import type { GameState, Product, ReorderRule } from '../sim/types'
import { useStore } from '../store/game'
import { Btn, Choice, NumInput, num } from './ui'

/** The rule in a few words: "At 500: 60 days". */
export function reorderWords(r: ReorderRule | undefined): string {
  if (!r?.on) return 'Off'
  return `At ${num(r.at)}: ${r.rule === 'cover' ? `${num(r.qty)} days` : `${num(r.qty)} units`}`
}

function apply(p: Product, patch: Partial<ReorderRule>) {
  const { act, say } = useStore.getState()
  const err = act((s) => setReorder(s, p.id, patch))
  if (err) say(err, 'bad')
}

/** A small on/off button for a table row. */
export function ReorderToggle({ g, p }: { g: GameState; p: Product }) {
  if (p.companyId !== 'player' || p.status === 'ended') return <span className="text-dim">--</span>
  const lock = reorderLocked(g)
  const on = !!p.reorder?.on
  return (
    <Btn small active={on} locked={on ? null : lock} title={lock ?? (on ? `Reorders by itself: ${reorderWords(p.reorder).toLowerCase()}. Click to switch off.` : 'Order more by itself when stock runs low')} onClick={(e) => (e.stopPropagation(), apply(p, on ? { on: false } : { ...(p.reorder ?? defaultReorder(g, p)), on: true }))}>
      {on ? reorderWords(p.reorder) : 'Auto off'}
    </Btn>
  )
}

/** The whole rule, for the device drawer. */
export function ReorderRuleEditor({ g, p }: { g: GameState; p: Product }) {
  if (p.companyId !== 'player' || p.status === 'ended') return null
  const lock = reorderLocked(g)
  const r = p.reorder ?? { ...defaultReorder(g, p), on: false }
  return (
    <div className="mt-3 border-t border-line pt-2">
      <div className="flex items-center gap-3">
        <span className="label w-14 shrink-0">Auto</span>
        <Btn small active={r.on} locked={r.on ? null : lock} title={lock ?? undefined} onClick={() => apply(p, { ...r, on: !r.on })}>
          {r.on ? 'Reordering by itself' : 'Off'}
        </Btn>
      </div>
      {(r.on || !lock) && (
        <div className="mt-1 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
          <span className="text-[11px] text-dim">When stock and orders fall to</span>
          <NumInput value={r.at} onChange={(at) => apply(p, { at })} step={100} max={10e6} aria-label="Reorder threshold" className="w-28 justify-self-end text-right" />
          <span className="text-[11px] text-dim">{r.rule === 'cover' ? 'Order enough for, in days' : 'Order, in units'}</span>
          <NumInput value={r.qty} onChange={(qty) => apply(p, { qty })} step={r.rule === 'cover' ? 10 : 500} min={1} max={r.rule === 'cover' ? MAX_REORDER_DAYS : 10e6} aria-label="Reorder quantity" className="w-28 justify-self-end text-right" />
        </div>
      )}
      {(r.on || !lock) && <Choice label="Quantity rule" value={r.rule} options={[{ value: 'cover', label: 'Days of recent sales' }, { value: 'fixed', label: 'A fixed number' }]} onChange={(rule) => apply(p, { rule, qty: rule === 'cover' ? 60 : Math.max(500, reorderUnits(g, p, r)) })} />}
      <div className="mt-1 text-[11px] leading-snug text-dim">{lock ? `${lock}: then each device can order more by itself when it runs low.` : r.on ? `Next run: about ${num(reorderUnits(g, p, r))} units, from your factory when its line runs, otherwise a contract maker.` : 'Switch on to order more by itself whenever stock runs low.'}</div>
    </div>
  )
}
