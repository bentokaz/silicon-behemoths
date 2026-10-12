// Pieces the Devices screens and the product drawer share: changing a price
// in place, the line that says what a price does, ordering more of a device,
// and keeping a page clear of the drawer.
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { sfx } from '../audio/sfx'
import { orderProduction, setPrice } from '../sim/game'
import { reorderQuote } from '../sim/insight'
import type { GameState, Product } from '../sim/types'
import { keepView } from '../store/focus'
import { useStore } from '../store/game'
import { priceEffect } from './DeviceLogic'
import { MAX_PRICE } from './format'
import { NumInput, money, num, price, useLayer } from './ui'

/**
 * Show one company on Devices, Rivals, from anywhere. The page reads the kept
 * key 'rivals:company' as it opens (the city's towers set the same key before
 * they go there); the event reaches it when it is already open.
 */
export function showCompany(id: string) {
  keepView('rivals:company', id)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('sb:rivals-company'))
  useStore.getState().go({ tab: 'rivals' })
}

/** How a route of production reads in a sentence. */
export const makerWords = (mode: 'contract' | 'factory') => (mode === 'factory' ? 'your own factory' : 'a contract maker')

/** "about 6 days", "a day". */
const aboutDays = (days: number) => (days <= 1 ? 'a day' : `about ${days} days`)

/** What ordering a number of units would cost and when they would all be in, as one sentence. */
export function quoteWords(g: GameState, p: Product, units: number): string {
  const q = reorderQuote(g, p, units)
  if (q.refused) return q.refused === 'Enter a quantity' ? 'Enter how many units to build.' : q.refused
  return `${money(q.cost)} at ${price(q.unitCost)} each, paid as they arrive. All here in ${aboutDays(q.days)}, from ${makerWords(q.mode)}.`
}

/**
 * Order units of a device by the cheapest route open, through the
 * simulation's own order action. A refused order says why in the strip.
 * Returns true when the order was placed.
 */
export function reorder(p: Product, units: number): boolean {
  const { game, act, say } = useStore.getState()
  if (!game) return false
  const q = reorderQuote(game, p, units)
  const err = q.refused ?? act((s) => orderProduction(s, p.id, units, q.mode))
  if (err) {
    say(err === 'Enter a quantity' ? 'Enter how many units to build.' : err, 'bad')
    return false
  }
  sfx.cash()
  say(`Ordered ${num(units)} of ${p.name} from ${makerWords(q.mode)}: ${money(q.cost)}, paid as they arrive over ${aboutDays(q.days)}.`)
  return true
}

/** Order several devices at once, each by the cheapest route open, and say what it came to in one line. */
export function reorderMany(list: readonly { p: Product; units: number }[]) {
  const { game, act, say } = useStore.getState()
  if (!game) return
  let placed = 0
  let cost = 0
  let refused: string | undefined
  for (const { p, units } of list) {
    const q = reorderQuote(game, p, units)
    const err = q.refused ?? act((s) => orderProduction(s, p.id, units, q.mode))
    if (err) refused = err
    else (placed++, (cost += q.cost))
  }
  if (!placed) return say(refused ?? 'Nothing needed ordering.', 'bad')
  sfx.cash()
  say(`Ordered more of ${placed} ${placed === 1 ? 'device' : 'devices'}: about ${money(cost)}, paid as the units arrive.${refused ? ` Not all were taken: ${refused}` : ''}`)
}

/** Set a device's price through the simulation's own action, and say so. Does nothing when the price is the same or not a price; a price the simulation refuses is said and not kept. */
export function applyPrice(p: Product, value: number): boolean {
  if (!(value > 0) || Math.round(value) === p.price) return false
  const { act, say } = useStore.getState()
  const err = act((s) => setPrice(s, p.id, value))
  if (err) return (say(err, 'bad'), false)
  say(`Saved. ${p.name} now costs ${price(Math.round(value))}.`)
  return true
}

/**
 * What a price does, in one line: what is kept on each unit and, when the
 * figure differs from the price in force, how many buyers it gains or loses
 * (from the sales model's own price curve).
 */
export function PriceNote({ g, p, value, className = '' }: { g: GameState; p: Product; value: number; className?: string }) {
  const fx = priceEffect(g, p, value, reorderQuote(g, p, 1).unitCost)
  const changed = value > 0 && Math.round(value) !== p.price
  const kept = (m: number) => (m >= 0 ? `${price(m)} kept on each unit` : `${price(-m)} lost on each unit`)
  const text = changed ? `At ${price(value)}: ${kept(fx.margin)} (now ${price(fx.marginNow)}), ${fx.words}.` : `${kept(fx.marginNow)}. ${fx.segment} buyers expect about ${price(fx.typical)}.`
  return (
    <span title={text} className={`block text-[11px] leading-tight ${(changed ? fx.margin : fx.marginNow) < 0 ? 'text-neg' : changed ? 'text-fg' : 'text-dim'} ${className}`}>
      {text}
    </span>
  )
}

/**
 * A price in a table row that is changed where it stands: a click (or Enter)
 * turns the figure into a field, Enter or leaving the field applies it, Esc
 * puts the old price back. `onTyping` hears the figure as it is typed (and
 * null when the editing ends), so the row can say what the change would do.
 */
export function InlinePrice({ p, onTyping }: { p: Product; onTyping?: (value: number | null) => void }) {
  const [value, setValue] = useState<number | null>(null)
  const editing = value !== null
  // (the field can lose focus as it is taken away: whatever ended the editing first is what counts)
  const ended = useRef(true)
  const end = (apply: boolean) => {
    if (ended.current) return
    ended.current = true
    if (apply && value !== null) applyPrice(p, value)
    setValue(null)
    onTyping?.(null)
  }
  useLayer(editing, () => end(false))
  if (!editing)
    return (
      <button
        type="button"
        title="Change the price"
        aria-label={`Price of ${p.name}: ${price(p.price)}. Change it`}
        onClick={(e) => (e.stopPropagation(), (ended.current = false), setValue(p.price), onTyping?.(p.price))}
        onKeyDown={(e) => e.stopPropagation()}
        className="num -mr-1 h-6 border border-transparent px-1 text-fg hover:border-line2 hover:bg-raise"
      >
        {price(p.price)}
      </button>
    )
  return (
    <NumInput
      autoFocus
      aria-label={`New price for ${p.name}`}
      value={value}
      min={0}
      max={MAX_PRICE}
      step={10}
      onChange={(v) => (setValue(v), onTyping?.(v))}
      onEnter={() => end(true)}
      onBlur={() => end(true)}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="-mr-1 h-6 w-[76px] !px-1 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  )
}

/**
 * How far the drawer reaches over a page, in px: the page pads itself by this
 * much so that what the drawer would cover moves aside instead (a table lets
 * go of a column rather than lose it under the drawer). 0 when no drawer is
 * open or it sits wholly over the news feed.
 */
export function useDrawerInset(ref: RefObject<HTMLElement | null>): number {
  const open = useStore((s) => (s.inspect ? `p:${s.inspect}` : s.person ? 'person' : ''))
  const [inset, setInset] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const drawer = document.querySelector<HTMLElement>('#sb-drawer [data-layer="drawer"]')
      const edge = el.getBoundingClientRect().right
      setInset(drawer ? Math.max(0, Math.round(edge - drawer.getBoundingClientRect().left)) : 0)
    }
    read()
    // the drawer is drawn by another part of the tree: look again once it is there
    const soon = window.setTimeout(read, 0)
    const host = document.getElementById('sb-drawer')
    const seen = host && typeof MutationObserver !== 'undefined' ? new MutationObserver(read) : null
    if (host && seen) seen.observe(host, { childList: true })
    const watch = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null
    watch?.observe(el)
    window.addEventListener('resize', read)
    return () => (window.clearTimeout(soon), seen?.disconnect(), watch?.disconnect(), window.removeEventListener('resize', read))
  }, [ref, open])
  return inset
}
