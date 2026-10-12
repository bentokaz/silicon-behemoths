// Shared dashboard primitives: panels, buttons, sliders, readouts.
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject, type ThHTMLAttributes, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { keepView, keptView, viewKept } from '../store/focus'
import { readNumber } from './format'
import { Icon, type IconName } from './icons'

export { int, money, moneyDelta, num, pct, price } from './format'
export { Table, type Column, type TableGroup } from './Table'

/** An icon set into a line of text, sitting on the text's own baseline. */
export function Lead({ icon, size = 11 }: { icon?: IconName; size?: number }) {
  if (!icon) return null
  return <Icon name={icon} size={size} className="mr-[5px] inline-block" style={{ verticalAlign: -Math.round(size * 0.18) }} />
}

// ---------------------------------------------------------------- layers and keys
//
// Anything that opens over the screen (a drawer, a card, a dialog) is a layer.
// Esc belongs to the layer on top and to nothing under it; a dialog that must
// be answered also keeps the game's own keys quiet while it is up, and keeps
// Tab inside itself.

interface Layer {
  esc?: () => void
  modal: boolean
  box?: RefObject<HTMLElement | null>
}
const layers: Layer[] = []

/** True while a dialog that must be answered is on screen: the game's hotkeys wait. */
export const modalOpen = () => layers.some((l) => l.modal)

/** The element that has focus, and the one that had it before: where focus goes back to when a layer that took it closes. */
const focusTrail: [HTMLElement | null, HTMLElement | null] = [null, null]
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    const to = e.target as HTMLElement
    if (to !== focusTrail[1]) (focusTrail[0] = focusTrail[1]), (focusTrail[1] = to)
  })
}

const FOCUSABLE ='button:not(:disabled), a[href], input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (e) => {
      const top = layers[layers.length - 1]
      if (!top) return
      if (e.key === 'Escape') {
        // a layer that takes every key itself (rebinding a key) is left to it
        if (!top.esc) return
        e.preventDefault()
        e.stopPropagation()
        top.esc()
      } else if (e.key === 'Tab' && top.modal && top.box?.current) {
        const box = top.box.current
        const stops = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
        if (!stops.length) return
        const at = stops.indexOf(document.activeElement as HTMLElement)
        const leaving = at < 0 || (e.shiftKey ? at === 0 : at === stops.length - 1)
        if (!leaving) return
        e.preventDefault()
        stops[e.shiftKey ? stops.length - 1 : 0].focus()
      }
    },
    true,
  )
}

/**
 * Put a layer on screen for as long as `active` is true. `esc` is what Esc
 * does while it is the top one. With `modal`, the game's keys are held and,
 * given the element in `box`, Tab stays inside it; focus moves into the box
 * as it opens and goes back to where it was as it closes.
 */
export function useLayer(active: boolean, esc?: () => void, { modal = false, box }: { modal?: boolean; box?: RefObject<HTMLElement | null> } = {}) {
  const fn = useRef(esc)
  fn.current = esc
  const hasEsc = !!esc
  useEffect(() => {
    if (!active) return
    const layer: Layer = { esc: hasEsc ? () => fn.current?.() : undefined, modal, box }
    layers.push(layer)
    const el = box?.current
    // where focus was before the layer took it; a field in the layer that focuses itself as it appears has already
    // taken it by now, and what had it before that is what to go back to
    const focused = document.activeElement as HTMLElement | null
    const before = el && focused && el.contains(focused) ? focusTrail[0] : focused
    if (el && !el.contains(document.activeElement)) {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
      el.focus({ preventScroll: true })
    }
    return () => {
      layers.splice(layers.indexOf(layer), 1)
      if (el && before?.isConnected && (!document.activeElement || document.activeElement === document.body || el.contains(document.activeElement))) before.focus({ preventScroll: true })
    }
  }, [active, modal, box, hasEsc])
}

/** Props that let a table row or any other plain element be opened with the keyboard as well as the mouse. */
export function pressable(open: () => void) {
  return {
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
      e.preventDefault()
      open()
    },
  }
}

/**
 * State that outlives the screen it belongs to: which view of a screen was
 * open, which filter was on. Leaving the screen and coming back finds it as
 * it was left. It is forgotten when another game is started or loaded.
 */
export function useKept<T>(key: string, initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (viewKept(key) ? keptView<T>(key) : typeof initial === 'function' ? (initial as () => T)() : initial))
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setValue((prev) => {
        const to = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        keepView(key, to)
        return to
      }),
    [key],
  )
  return [value, set]
}

/** A scrolling element that is found where it was left when its screen is opened again. */
export function useKeptScroll(key: string | undefined) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !key) return
    const k = `scroll:${key}`
    if (viewKept(k)) el.scrollTop = keptView<number>(k)
    const on = () => keepView(k, el.scrollTop)
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  }, [key])
  return ref
}

/**
 * Whether a table has less room than it wants. A panel that is short of
 * width draws its table tighter (see `.tight` in index.css) before it lets
 * it scroll sideways, and loosens it again when there is room.
 */
/** Room a tight table must have to spare before it is drawn loose again: more than a scrollbar's width. */
const SLACK = 28
function useTight(ref: RefObject<HTMLElement | null>): boolean {
  const [tight, setTight] = useState(false)
  // the width the table wanted when it was last drawn loose
  const need = useRef(0)
  const check = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (!el.querySelector(':scope table.grid-table')) return setTight(false)
    const isTight = el.classList.contains('tight')
    if (!isTight) need.current = el.scrollWidth
    // Going tight changes the row heights, which can add or remove the panel's own scrollbar and with it a few
    // pixels of width. Loosening therefore waits for clear room to spare, or the two states would chase each other.
    setTight(isTight ? need.current > el.clientWidth - SLACK : need.current > el.clientWidth + 1)
  }, [ref])
  // when the panel changes size, and when a table arrives in it later (a list that had to be read first)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(check)
    watch.observe(el)
    // (looked at in a task of its own, never in the same breath as the change that was seen: an observer that
    // answers a change with a change of its own must not be able to spin)
    let queued = 0
    const arrivals = new MutationObserver(() => void (queued ||= window.setTimeout(() => ((queued = 0), check()), 0)))
    arrivals.observe(el, { childList: true })
    if (el.firstElementChild && el.firstElementChild.tagName !== 'TABLE') arrivals.observe(el.firstElementChild, { childList: true })
    return () => (watch.disconnect(), arrivals.disconnect(), window.clearTimeout(queued))
  }, [ref, check])
  // and whenever what is in it is drawn again: more rows, another view
  useLayoutEffect(check)
  return tight
}

/**
 * A 3D view with a mark to look at while it is being built. Building a site
 * takes the browser a second or more, during which nothing else can be drawn:
 * so the mark is put on screen first, the view is started a frame later, and
 * the mark is taken away once the view has had time to draw itself.
 */
export function Stage3D({ label, children }: { label: string; children: ReactNode }) {
  // 0: only the mark; 1: the view is being built under the mark; 2: the view is up
  const [phase, setPhase] = useState<0 | 1 | 2>(0)
  useEffect(() => {
    let frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => setPhase((p) => (p < 1 ? 1 : p)))))
    // (a page in the background gets few frames: do not wait on them for long)
    const t = window.setTimeout(() => setPhase((p) => (p < 1 ? 1 : p)), 200)
    return () => (cancelAnimationFrame(frame), window.clearTimeout(t))
  }, [])
  useEffect(() => {
    if (phase !== 1) return
    let frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => setPhase(2))))))
    const t = window.setTimeout(() => setPhase(2), 2500)
    return () => (cancelAnimationFrame(frame), window.clearTimeout(t))
  }, [phase])
  return (
    <>
      {phase > 0 && children}
      {phase < 2 && (
        <div role="status" className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-carbon">
          <Icon name="layers" size={22} className="text-line2" />
          <span className="text-[11px] text-faint">{label}</span>
        </div>
      )}
    </>
  )
}

/** True when the player has asked their system for less motion. */
export const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A panel: a 32px header with a sentence-case title, an optional count and
 * its actions at the right (outline or quiet buttons), over a body. Only the
 * one panel a screen has selected wears the accent bar.
 */
export function Panel({ title, icon, count, right, children, className = '', bodyClass = '', keep, selected }: { title?: ReactNode; icon?: IconName; /** A count shown beside the title. */ count?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; /** A name for the body's scroll position, so it is found where it was left. */ keep?: string; /** The one selected panel of a screen. */ selected?: boolean }) {
  const body = useKeptScroll(keep)
  const tight = useTight(body)
  return (
    <section className={`flex min-h-0 flex-col border bg-panel ${selected ? 'border-accent' : 'border-line'} ${className}`}>
      {title !== undefined && (
        <header className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-line pl-3 pr-2">
          <span className="t-title flex min-w-0 items-center gap-2">
            {selected && <span className="h-3 w-[3px] shrink-0 bg-accent" />}
            {icon && <Icon name={icon} size={13} className="shrink-0 text-dim" />}
            <span className="truncate" title={typeof title === 'string' ? title : undefined}>
              {title}
            </span>
            {count !== undefined && <span className="num shrink-0 text-[11px] font-normal text-faint">{count}</span>}
          </span>
          {right !== undefined && <span className="flex shrink-0 items-center gap-1">{right}</span>}
        </header>
      )}
      <div ref={body} className={`min-h-0 flex-1 ${bodyClass} ${tight ? 'tight' : ''}`}>
        {children}
      </div>
    </section>
  )
}

/** Does this content say anything in words? An icon alone does not. */
function hasWords(node: ReactNode): boolean {
  if (typeof node === 'string') return node.trim() !== ''
  if (typeof node === 'number') return true
  if (Array.isArray(node)) return node.some(hasWords)
  if (isValidElement(node)) return node.type !== Icon && hasWords((node.props as { children?: ReactNode }).children)
  return false
}

/**
 * The four kinds of button.
 *   primary  filled accent: the ONE action a view exists for. Never more than one on screen.
 *   default  (secondary) a 1px outline: everything else that does something
 *   ghost    (quiet) text only: navigation, "show more", closing
 *   danger   a 1px red outline: used with a confirmation (ConfirmBtn)
 * Heights are 28 and, with `large`, 36. A disabled button keeps readable text
 * and wears a dashed border; it is never faded.
 */
type Tone = 'default' | 'primary' | 'danger' | 'ghost'
const BTN_TONES: Record<Tone, string> = {
  default: 'border-line2 bg-transparent text-fg enabled:hover:border-fg enabled:hover:bg-hover',
  primary: 'border-accent bg-accent font-semibold text-carbon enabled:hover:bg-transparent enabled:hover:text-accent',
  danger: 'border-neg bg-transparent text-neg enabled:hover:bg-neg enabled:hover:text-carbon',
  ghost: 'border-transparent bg-transparent text-dim enabled:hover:bg-hover enabled:hover:text-fg',
}
const BTN_ON = 'border-accent bg-accent/10 text-accent'
/** A control that cannot be used: the same size and place, readable, with a dashed edge. */
const BTN_OFF = 'disabled:cursor-not-allowed disabled:border-dashed disabled:border-line2 disabled:bg-transparent disabled:font-normal disabled:text-faint'
// The icon carries its own colour: the unlayered `button { color: inherit }` in
// index.css outranks the text-colour classes above, so they cannot tint it.
const ICON_TONES: Record<Tone, string> = {
  default: 'text-dim group-enabled/btn:group-hover/btn:text-fg group-disabled/btn:text-faint',
  primary: 'text-carbon group-enabled/btn:group-hover/btn:text-accent group-disabled/btn:text-faint',
  danger: 'text-neg group-enabled/btn:group-hover/btn:text-carbon group-disabled/btn:text-faint',
  ghost: 'text-dim group-enabled/btn:group-hover/btn:text-fg group-disabled/btn:text-faint',
}

/**
 * A control that belongs to a part of the company not open yet. `locked` is
 * the sentence saying what opens it (the tooltip); `onLocked`, if given, is
 * what a click does instead of the control's own action, usually opening the
 * card that explains it.
 */
export interface LockProps {
  locked?: string | null
  onLocked?: () => void
  /** Where a locked button wears its lock: before the label, or in the corner where a row of narrow buttons has no room to spare. */
  lockMark?: 'inline' | 'corner'
}
/** How a locked control looks: readable, dashed, and plainly not something to press. */
const LOCKED = 'cursor-not-allowed border-dashed'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; active?: boolean; /** Tighter side padding, for a button in a row of a table or a toolbar. */ small?: boolean; /** 36px high: the confirm of a form or a dialog. */ large?: boolean; icon?: IconName } & LockProps
const btnSize = (small?: boolean, large?: boolean) => (large ? 'h-9 px-4 text-xs' : small ? 'h-7 px-2 text-xs' : 'h-7 px-3 text-xs')
/**
 * A button. With `icon`, the icon sits left of the label and is a touch dimmer than it until the button is hovered or active.
 * With `locked` it is dashed behind a lock and does nothing of its own; it stays hoverable so the tooltip can say why.
 */
export function Btn({ tone = 'default', active, small, large, icon, locked, onLocked, lockMark = 'inline', className = '', children, ...rest }: BtnProps) {
  if (locked) {
    const corner = lockMark === 'corner'
    return (
      <button
        {...rest}
        type="button"
        aria-disabled
        title={locked}
        onClick={(e) => (e.preventDefault(), e.stopPropagation(), onLocked?.())}
        className={`rounded-none border ${btnSize(small, large)} ${corner ? 'relative' : 'inline-flex items-center justify-center gap-[5px] whitespace-nowrap'} ${LOCKED} ${active ? BTN_ON : 'border-line2 bg-transparent text-faint'} ${className}`}
      >
        <Icon name="lock" size={corner ? 9 : 11} className={`${corner ? 'absolute right-[3px] top-[3px]' : 'shrink-0'} ${active ? 'text-accent' : 'text-faint'}`} />
        {children}
      </button>
    )
  }
  // a button that is only an icon is named by its tooltip; a switch says whether it is on
  const named = rest['aria-label'] ?? (rest.title && !hasWords(children) ? rest.title : undefined)
  return (
    <button
      type="button"
      {...rest}
      aria-label={named}
      aria-pressed={rest['aria-pressed'] ?? (active === undefined ? undefined : active)}
      className={`group/btn inline-flex items-center justify-center gap-[6px] whitespace-nowrap rounded-none border ${btnSize(small, large)} ${BTN_OFF} ${active ? BTN_ON : BTN_TONES[tone]} ${className}`}
    >
      {icon && <Icon name={icon} size={13} className={`shrink-0 ${active ? 'text-accent' : ICON_TONES[tone]}`} />}
      {children}
    </button>
  )
}

type IconBtnProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'children'> & { icon: IconName; title: string; tone?: Tone; active?: boolean; small?: boolean }
/** A square button that is only an icon. The title is its tooltip and its name for screen readers. 28px; 24px with `small`, inside a row. */
export function IconBtn({ icon, title, tone = 'default', active, small = false, className = '', ...rest }: IconBtnProps) {
  return (
    <button
      type="button"
      {...rest}
      title={title}
      aria-label={title}
      aria-pressed={rest['aria-pressed'] ?? (active === undefined ? undefined : active)}
      className={`group/btn inline-flex shrink-0 items-center justify-center rounded-none border align-middle ${small ? 'h-6 w-6' : 'h-7 w-7'} ${BTN_OFF} ${active ? BTN_ON : BTN_TONES[tone]} ${className}`}
    >
      <Icon name={icon} size={small ? 12 : 14} className={active ? 'text-accent' : ICON_TONES[tone]} />
    </button>
  )
}

/** How long a button stays armed, waiting for the second click. */
const ARMED_MS = 4000

/**
 * A button for something that cannot be taken back. The first click arms it
 * and it says so; the second, within a few seconds, does the thing. Moving
 * away from it disarms it.
 */
export function ConfirmBtn({ confirm = 'Click again to confirm', onClick, children, tone = 'danger', icon, className = '', ...rest }: BtnProps & { confirm?: ReactNode }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), ARMED_MS)
    return () => window.clearTimeout(t)
  }, [armed])
  return (
    <Btn {...rest} tone={tone} icon={armed ? 'alert' : icon} className={`${className} ${armed ? '!border-neg !bg-neg !text-carbon [&_svg]:!text-carbon' : ''}`} onBlur={() => setArmed(false)} onClick={(e) => (armed ? (setArmed(false), onClick?.(e)) : setArmed(true))}>
      {armed ? confirm : children}
    </Btn>
  )
}

/** The icon-only form: the first click turns it into a filled warning, the second does it. `title` names the action. */
export function ConfirmIconBtn({ title, icon, onClick, tone = 'ghost', className = '', ...rest }: IconBtnProps) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), ARMED_MS)
    return () => window.clearTimeout(t)
  }, [armed])
  return <IconBtn {...rest} tone={tone} icon={armed ? 'alert' : icon} title={armed ? `${title}: click again to confirm` : title} className={`${className} ${armed ? '!border-neg !bg-neg [&_svg]:!text-carbon' : ''}`} onBlur={() => setArmed(false)} onClick={(e) => (armed ? (setArmed(false), onClick?.(e)) : setArmed(true))} />
}

/** A small heading inside a panel, with an optional icon. */
export function Head({ icon, children, right, className = '' }: { icon?: IconName; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-[5px] text-[11px] font-semibold text-dim ${className}`}>
      {icon && <Icon name={icon} size={11} />}
      <span className="min-w-0 flex-1">{children}</span>
      {right}
    </div>
  )
}

/** A table heading. With an icon and no text it is icon-only, and `title` is what it says on hover. */
export function Th({ icon, iconClass = '', r, children, className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { icon?: IconName; iconClass?: string; r?: boolean }) {
  return (
    <th {...rest} className={`${r ? 'r' : ''} ${className}`}>
      {icon && <Icon name={icon} size={11} className={`inline-block text-faint ${children !== undefined ? 'mr-[5px]' : ''} ${iconClass}`} style={{ verticalAlign: -2 }} />}
      {children}
    </th>
  )
}

/**
 * The label of a figure, with its icon. The icon gives way when the label would
 * no longer fit on one line beside it, so a narrow cell reads exactly as it did
 * before there were icons. In a row of figures where most labels are too long,
 * the icons go together, so no cell is left as the only one with a mark.
 */
function FitLabel({ icon, label, size, className }: { icon?: IconName; label: string; size: number; className: string }) {
  const row = useRef<HTMLDivElement>(null)
  const [roomy, setRoomy] = useState(true)
  useLayoutEffect(() => {
    const el = row.current
    if (!el || !icon) return
    const fits = (r: Element) => (r.querySelector('[data-ruler]')?.getBoundingClientRect().width ?? 0) + Number(r.getAttribute('data-fit')) <= r.clientWidth + 0.5
    const check = () => {
      const group = Array.from(el.parentElement?.parentElement?.querySelectorAll(':scope > * > [data-fit]') ?? [])
      setRoomy(fits(el) && group.filter(fits).length * 2 >= group.length)
    }
    check()
    const watch = new ResizeObserver(check)
    watch.observe(el)
    return () => watch.disconnect()
  }, [icon, label])
  return (
    <div ref={row} data-fit={icon ? size + 5 : undefined} className={`relative flex items-center ${className}`}>
      {icon && roomy && <Icon name={icon} size={size} />}
      <span className="min-w-0">{label}</span>
      {icon && (
        <span aria-hidden className="pointer-events-none invisible absolute left-0 top-0 h-0 w-0 overflow-hidden">
          <span data-ruler className="inline-block whitespace-nowrap">
            {label}
          </span>
        </span>
      )}
    </div>
  )
}

const TONE_TEXT = { pos: 'text-pos', neg: 'text-neg', warn: 'text-warn', accent: 'text-accent' } as const
type FigureTone = keyof typeof TONE_TEXT

/** A tile: an 11px label over a 16px value, with an optional line under it. With `onClick` it is a button that goes to where the figure comes from. */
export function Stat({ label, icon, value, sub, tone, onClick, title }: { label: string; icon?: IconName; value: ReactNode; sub?: ReactNode; tone?: FigureTone; onClick?: () => void; title?: string }) {
  const body = (
    <>
      <FitLabel icon={icon} label={label} size={11} className="label gap-[5px]" />
      <div className={`t-value mt-1 ${tone ? TONE_TEXT[tone] : 'text-fg'}`}>{value}</div>
      {sub !== undefined && <div className="mt-1 truncate text-[11px] text-dim">{sub}</div>}
    </>
  )
  if (onClick)
    return (
      <button type="button" onClick={onClick} title={title} className="min-w-0 border border-line bg-panel px-3 py-2 text-left hover:border-line2 hover:bg-hover">
        {body}
      </button>
    )
  return (
    <div className="min-w-0 border border-line bg-panel px-3 py-2" title={title}>
      {body}
    </div>
  )
}

/** The one headline figure of a screen: 20px. A screen has one of these, or none. */
export function Headline({ label, icon, value, sub, tone }: { label: string; icon?: IconName; value: ReactNode; sub?: ReactNode; tone?: FigureTone }) {
  return (
    <div className="min-w-0 border border-line bg-panel px-3 py-2">
      <FitLabel icon={icon} label={label} size={11} className="label gap-[5px]" />
      <div className={`t-headline mt-1 ${tone ? TONE_TEXT[tone] : 'text-fg'}`}>{value}</div>
      {sub !== undefined && <div className="mt-1 truncate text-[11px] text-dim">{sub}</div>}
    </div>
  )
}

export function Slider({ label, icon, value, min, max, step = 1, onChange, format, disabled, hint, locked, onLocked }: { label: string; icon?: IconName; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; disabled?: boolean; hint?: string } & LockProps) {
  return (
    <label className={`block py-1 ${locked ? 'cursor-not-allowed' : ''}`} title={locked || hint} onClick={locked ? (e) => (e.preventDefault(), onLocked?.()) : undefined}>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-dim">
          <Lead icon={locked ? 'lock' : icon} />
          {label}
        </span>
        <span className="num text-[11px] text-fg">{format ? format(value) : value}</span>
      </div>
      <input type="range" aria-label={label} aria-valuetext={format ? format(value) : undefined} className={`w-full ${locked ? 'pointer-events-none' : ''}`} min={min} max={max} step={step} value={value} disabled={disabled || !!locked} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

/**
 * A labelled drop-down. An option can be `locked`; when the reason is not
 * plain from the list itself, `lockNote` says what opens the locked ones: it
 * is the tooltip of the control and a line with a lock under it.
 */
export function Choice<T extends string | number>({ label, icon, value, options, onChange, lockNote }: { label: string; icon?: IconName; value: T; options: { value: T; label: string; locked?: boolean }[]; onChange: (v: T) => void; lockNote?: string | null }) {
  const row = (
    <label className="flex items-center justify-between gap-2 py-1" title={lockNote || undefined}>
      <span className="whitespace-nowrap text-[11px] text-dim">
        <Lead icon={icon} />
        {label}
      </span>
      <select
        className="h-7 min-w-0 max-w-[62%] flex-1 rounded-none border border-line2 bg-raise px-1 text-xs outline-none focus:border-accent"
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value)
          if (o) onChange(o.value)
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)} disabled={o.locked}>
            {o.label}
            {o.locked ? '  [locked]' : ''}
          </option>
        ))}
      </select>
    </label>
  )
  if (!lockNote) return row
  return (
    <div>
      {row}
      <div className="flex items-start gap-[5px] pb-1 text-[11px] leading-snug text-faint" data-lock-note>
        <Icon name="lock" size={11} className="mt-[2px] shrink-0" />
        <span>{lockNote}</span>
      </div>
    </div>
  )
}

export function Meter({ value, max = 1, tone = 'accent', className = '' }: { value: number; max?: number; tone?: 'accent' | 'pos' | 'neg' | 'warn' | 'dim'; className?: string }) {
  const bg = { accent: 'bg-accent', pos: 'bg-pos', neg: 'bg-neg', warn: 'bg-warn', dim: 'bg-mute' }[tone]
  return (
    <div className={`h-1 w-full bg-line ${className}`}>
      <div className={`h-full ${bg}`} style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%` }} />
    </div>
  )
}

export function Row({ k, v, tone, icon }: { k: ReactNode; v: ReactNode; tone?: string; icon?: IconName }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-[3px] last:border-0">
      <span className="text-[11px] text-dim">
        <Lead icon={icon} />
        {k}
      </span>
      <span className={`num text-[11px] ${tone ?? 'text-fg'}`}>{v}</span>
    </div>
  )
}

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'> & { /** What Enter does in the field. */ onEnter?: () => void }

/** A line of text. Give it `aria-label` or a placeholder when no visible label wraps it. */
export function TextInput({ value, onChange, className = '', onEnter, onKeyDown, ...rest }: FieldProps & { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      spellCheck={false}
      autoComplete="off"
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => (onKeyDown?.(e), e.key === 'Enter' && onEnter && (e.preventDefault(), onEnter()))}
      className={`h-7 rounded-none border border-line2 bg-raise px-2 text-xs outline-none focus:border-accent ${className}`}
      style={{ userSelect: 'text' }}
    />
  )
}

/**
 * A name that is being edited in place (a company, a team). What is typed
 * shows at once, but a blank is never kept: leaving the field empty puts the
 * last name back.
 */
export function NameInput({ value, onChange, ...rest }: FieldProps & { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <TextInput
      {...rest}
      value={text ?? value}
      onChange={(v) => {
        setText(v)
        if (v.trim()) onChange(v)
      }}
      onBlur={() => setText(null)}
      onEnter={() => (document.activeElement as HTMLElement | null)?.blur()}
    />
  )
}

/**
 * A number. What is typed stays as typed while the field has focus; the value
 * handed on is always a number within `min` and `max`, whole unless `decimals`
 * is set, whatever was typed: nothing, a minus, letters, a figure with thirty
 * digits. On leaving the field it shows that value.
 */
export function NumInput({ value, onChange, className = '', min = 0, max = 1e9, step = 1, decimals = false, onEnter, onKeyDown, ...rest }: FieldProps & { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; decimals?: boolean }) {
  const [text, setText] = useState<string | null>(null)
  const safe = Number.isFinite(value) ? value : 0
  return (
    <input
      type="number"
      inputMode={decimals ? 'decimal' : 'numeric'}
      {...rest}
      min={min}
      max={max}
      step={step}
      value={text ?? String(safe)}
      onChange={(e) => {
        setText(e.target.value)
        onChange(readNumber(e.target.value, { min, max, whole: !decimals }))
      }}
      onBlur={(e) => (setText(null), rest.onBlur?.(e))}
      onKeyDown={(e) => (onKeyDown?.(e), e.key === 'Enter' && (setText(null), onEnter && (e.preventDefault(), onEnter())))}
      className={`num h-7 rounded-none border border-line2 bg-raise px-2 text-xs outline-none focus:border-accent ${className}`}
    />
  )
}

export const chart = {
  axis: { fill: 'var(--color-dim)', fontSize: 11, fontFamily: 'Cascadia Mono, Consolas, monospace' },
  grid: 'var(--color-line)',
  tooltip: {
    contentStyle: { background: 'var(--color-panel)', border: '1px solid var(--color-line2)', borderRadius: 0, fontSize: 11, fontFamily: 'Cascadia Mono, Consolas, monospace' },
    labelStyle: { color: 'var(--color-dim)' },
    itemStyle: { padding: 0 },
  },
}

// ---------------------------------------------------------------- layout helpers

/**
 * The one second-level navigation there is: a row of underlined text tabs.
 * Every tab always shows its label; a count sits beside it in the quiet
 * colour, or in the warning colour when it counts things waiting for the
 * player (`alert`). A tab that has just opened wears "New". When the row is
 * short of room the labels are cut short (the tooltip has them in full); it
 * never turns into icons and never scrolls.
 */
export interface TabOption<T extends string> {
  value: T
  label: ReactNode
  badge?: ReactNode
  /** The count is of things that need the player. */
  alert?: boolean
  /** Just opened and not yet visited. */
  fresh?: boolean
  icon?: IconName
  /** Not open yet: the sentence saying what opens it. A click calls `onLocked`. */
  locked?: string | null
}
export function Tabs<T extends string>({ value, options, onChange, onLocked, className = '', right }: { value: T; options: TabOption<T>[]; onChange: (v: T) => void; onLocked?: (v: T) => void; className?: string; /** Kept for older callers: tabs always share the width now. */ fit?: boolean; /** Controls at the right end of the strip. */ right?: ReactNode }) {
  return (
    <div role="tablist" className={`flex h-9 min-w-0 shrink-0 items-stretch border-b border-line ${className}`}>
      {options.map((o) => {
        const on = value === o.value
        const text = typeof o.label === 'string' ? o.label : undefined
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={on}
            aria-disabled={o.locked ? true : undefined}
            onClick={() => (o.locked ? onLocked?.(o.value) : onChange(o.value))}
            title={o.locked ?? text}
            className={`-mb-px flex min-w-0 items-center gap-[6px] whitespace-nowrap border-b-2 px-3 text-xs ${on ? 'border-accent font-semibold text-fg' : o.locked ? 'border-transparent text-faint' : 'border-transparent text-dim hover:text-fg'}`}
          >
            {o.locked ? <Icon name="lock" size={11} className="shrink-0 text-faint" /> : o.icon && <Icon name={o.icon} size={13} className={`shrink-0 ${on ? 'text-accent' : 'text-dim'}`} />}
            <span className="min-w-0 truncate">{o.label}</span>
            {o.fresh && !o.locked ? <span className="shrink-0 border border-accent px-1 text-[11px] font-normal leading-[14px] text-accent">New</span> : o.badge !== undefined && o.badge !== null && o.badge !== false && <span className={`num shrink-0 text-[11px] font-normal ${o.alert ? 'text-warn' : 'text-faint'}`}>{o.badge}</span>}
          </button>
        )
      })}
      {right !== undefined && <div className="ml-auto flex shrink-0 items-center gap-1 pl-2 pr-2">{right}</div>}
    </div>
  )
}

/** A panel whose body can be folded away. Closed panels show only their heading. */
export function Fold({ title, icon, right, children, open: initial = true, className = '', bodyClass = '', keep }: { title: ReactNode; icon?: IconName; right?: ReactNode; children: ReactNode; open?: boolean; className?: string; bodyClass?: string; /** A name under which open or closed is remembered. */ keep?: string }) {
  const [openState, setOpenState] = useState(initial)
  const [keptOpen, setKeptOpen] = useKept<boolean>(`fold:${keep ?? ''}`, initial)
  const open = keep ? keptOpen : openState
  const setOpen = keep ? setKeptOpen : setOpenState
  return (
    <section className={`shrink-0 border border-line bg-panel ${className}`}>
      <header className="flex h-8 items-center justify-between gap-2 pl-3 pr-2">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="t-title flex min-w-0 flex-1 items-center gap-2 text-left hover:text-accent">
          <Icon name={open ? 'minus' : 'plus'} size={10} className="shrink-0 text-dim" />
          {icon && <Icon name={icon} size={13} className="shrink-0 text-dim" />}
          <span className="truncate">{title}</span>
        </button>
        {right}
      </header>
      {open && <div className={`border-t border-line ${bodyClass}`}>{children}</div>}
    </section>
  )
}

/**
 * The drawer: details of one thing, at the right-hand edge, over the news
 * feed and never over the list it was opened from (which stays live: another
 * row can be picked without closing it). There is one drawer at a time; the
 * frame gives it its place (the element with id "sb-drawer").
 */
export function Drawer({ open, onClose, title, children, width = 420, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number; footer?: ReactNode }) {
  const box = useRef<HTMLElement>(null)
  useLayer(open, onClose, { box })
  if (!open) return null
  const host = typeof document !== 'undefined' ? document.getElementById('sb-drawer') : null
  const drawer = (
    <aside ref={box} role="dialog" aria-label={typeof title === 'string' ? title : 'Details'} data-layer="drawer" className="pointer-events-auto absolute bottom-0 right-0 top-0 z-[35] flex min-h-0 flex-col border-l border-line2 bg-carbon outline-none" style={{ width, maxWidth: '100%' }}>
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line bg-panel pl-3 pr-1">
        <span className="t-title min-w-0 truncate">{title}</span>
        <IconBtn icon="close" tone="ghost" title="Close (Esc)" onClick={onClose} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <div className="shrink-0 border-t border-line bg-panel p-2">{footer}</div>}
    </aside>
  )
  return host ? createPortal(drawer, host) : drawer
}

/** A tile. The same as `Stat`: kept under its old name for the screens that use it. */
export const Kpi = Stat

/** A small supporting figure on one line: label left, value right. Quieter than a tile. */
export function Mini({ label, icon, value, tone, title }: { label: string; icon?: IconName; value: ReactNode; tone?: string; /** Said on hover when the label is a short form. */ title?: string }) {
  return (
    <div className="min-w-0 border border-line px-2 py-1" title={title}>
      <FitLabel icon={icon} label={label} size={11} className="gap-1 text-[11px] text-faint" />
      <div className={`num text-xs ${tone ?? 'text-fg'}`}>{value}</div>
    </div>
  )
}

/** A status mark. Use it only for a status that is NOT the default one: a list whose every row says "On sale" says nothing. */
export function Tag({ children, tone = 'dim', icon }: { children?: ReactNode; tone?: 'dim' | 'accent' | 'pos' | 'neg' | 'warn'; icon?: IconName }) {
  const c = { dim: 'border-line2 text-dim', accent: 'border-accent text-accent', pos: 'border-pos text-pos', neg: 'border-neg text-neg', warn: 'border-warn text-warn' }[tone]
  return (
    <span className={`inline-block whitespace-nowrap border px-[5px] text-[11px] leading-4 ${c}`}>
      {icon && <Icon name={icon} size={10} className={`inline-block ${children !== undefined ? 'mr-[3px]' : ''}`} style={{ verticalAlign: -1 }} />}
      {children}
    </span>
  )
}

export function Empty({ text, icon, children }: { text: string; icon?: IconName; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-24 flex-col items-center justify-center gap-3 px-6 py-6 text-center">
      {icon && <Icon name={icon} size={22} className="text-line2" />}
      <div className="max-w-sm text-xs leading-snug text-dim">{text}</div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- the redesign's shared pieces

/**
 * The frame of an ordinary (non-3D) screen: a 16px gutter, 8px between
 * panels, and one column that scrolls when the window is short.
 */
export function Page({ children, className = '', keep }: { children: ReactNode; className?: string; keep?: string }) {
  const ref = useKeptScroll(keep)
  return (
    <div ref={ref} className={`flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-4 ${className}`}>
      {children}
    </div>
  )
}

export interface Figure {
  label: string
  value: ReactNode
  tone?: FigureTone
  icon?: IconName
  title?: string
  onClick?: () => void
}
/**
 * A one-line strip of figures: what a screen needs to say at a glance
 * (headcount, payroll, morale, raise requests), or the status of a 3D place.
 * Given children it can be opened for the detail behind the line.
 */
export function Strip({ items, right, children, keep, className = '' }: { items: Figure[]; right?: ReactNode; /** The detail behind the line; when given, the strip can be opened. */ children?: ReactNode; /** A name under which open or closed is remembered. */ keep?: string; className?: string }) {
  const [open, setOpen] = useKept<boolean>(`strip:${keep ?? ''}`, false)
  const can = children !== undefined && children !== null && children !== false
  return (
    <section className={`shrink-0 border border-line bg-panel ${className}`}>
      <div className="flex min-h-9 items-center gap-x-4 gap-y-1 px-3 py-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-5 gap-y-1">
          {items.map((f) => {
            const body = (
              <>
                <span className="text-[11px] text-dim">
                  <Lead icon={f.icon} />
                  {f.label}
                </span>
                <span className={`num text-[13px] font-semibold ${f.tone ? TONE_TEXT[f.tone] : 'text-fg'}`}>{f.value}</span>
              </>
            )
            return f.onClick ? (
              <button key={f.label} type="button" onClick={f.onClick} title={f.title} className="flex items-baseline gap-2 whitespace-nowrap hover:[&>span:first-child]:text-fg">
                {body}
              </button>
            ) : (
              <span key={f.label} title={f.title} className="flex items-baseline gap-2 whitespace-nowrap">
                {body}
              </span>
            )
          })}
        </div>
        {right}
        {can && <IconBtn icon={open ? 'minus' : 'plus'} tone="ghost" title={open ? 'Show less' : 'Show more'} aria-expanded={open} onClick={() => setOpen(!open)} />}
      </div>
      {can && open && <div className="border-t border-line">{children}</div>}
    </section>
  )
}

/** What the colours of a set of bars mean. Any bars that use colour carry one of these. */
export function Legend({ items, className = '' }: { items: { label: string; tone?: 'accent' | 'pos' | 'neg' | 'warn' | 'dim' | 'fg'; color?: string }[]; className?: string }) {
  const bg = { accent: 'bg-accent', pos: 'bg-pos', neg: 'bg-neg', warn: 'bg-warn', dim: 'bg-mute', fg: 'bg-fg' }
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-dim ${className}`}>
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-[5px] whitespace-nowrap">
          <span aria-hidden className={`h-2 w-2 shrink-0 ${i.color ? '' : bg[i.tone ?? 'accent']}`} style={i.color ? { background: i.color } : undefined} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

/**
 * A company's (or anything's) own colour, as a small square beside its name.
 * The name itself is always drawn in a readable text colour: brand colours
 * are never used for text.
 */
export function Swatch({ color, children, className = '' }: { color: string; children?: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-[6px] ${className}`}>
      <span aria-hidden className="h-2 w-2 shrink-0 border border-line2" style={{ background: color }} />
      {children !== undefined && <span className="min-w-0 truncate">{children}</span>}
    </span>
  )
}

/** A key the player can press, as a chip. */
export function Key({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

/** A compact drop-down with its label in front: a filter, a picker of one thing out of many (a device type, a store). */
export function Pick<T extends string | number>({ label, value, options, onChange, className = '' }: { label: string; value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <label className={`flex min-w-0 items-center gap-2 text-[11px] text-dim ${className}`}>
      <span className="shrink-0">{label}</span>
      <select
        className="h-7 min-w-0 rounded-none border border-line2 bg-raise px-1 text-xs text-fg outline-none focus:border-accent"
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value)
          if (o) onChange(o.value)
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** A row of filter chips: one is on. Use for a handful of filters ("Needs you", "All"); for many, use `Pick`. */
export function Filters<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; count?: number; alert?: boolean }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div role="group" aria-label={label ?? 'Filter'} className="flex min-w-0 items-center gap-1">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={`flex h-7 items-center gap-[6px] whitespace-nowrap border px-2 text-xs ${value === o.value ? 'border-accent bg-accent/10 text-accent' : 'border-line2 text-dim hover:border-fg hover:text-fg'}`}>
          {o.label}
          {o.count !== undefined && <span className={`num text-[11px] ${value === o.value ? '' : o.alert && o.count > 0 ? 'text-warn' : 'text-faint'}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * A trend in a table cell: the last twelve months as a line, no axes. The
 * line is the quiet colour; `tone` colours it when the trend itself is the
 * news (falling, sold out).
 */
export function Spark({ values, width = 72, height = 20, tone = 'dim', title }: { values: number[]; width?: number; height?: number; tone?: 'dim' | 'pos' | 'neg' | 'warn' | 'accent'; title?: string }) {
  const stroke = { dim: 'var(--color-dim)', pos: 'var(--color-pos)', neg: 'var(--color-neg)', warn: 'var(--color-warn)', accent: 'var(--color-accent)' }[tone]
  const v = values.filter((x) => Number.isFinite(x))
  if (v.length < 2) return <span aria-hidden className="inline-block" style={{ width, height }} />
  const max = Math.max(...v, 1e-9)
  const min = Math.min(...v, 0)
  const span = max - min || 1
  const step = (width - 2) / (v.length - 1)
  const pts = v.map((y, i) => `${(1 + i * step).toFixed(1)},${(height - 2 - ((y - min) / span) * (height - 4)).toFixed(1)}`).join(' ')
  return (
    <svg role="img" aria-label={title ?? 'Trend'} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="inline-block align-middle">
      {title && <title>{title}</title>}
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinejoin="miter" />
    </svg>
  )
}

/**
 * A question mark that opens a short explanation: how a screen works, what a
 * figure means. What used to be a permanent "How it works" panel.
 */
export function Help({ title = 'How this works', children }: { title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useLayer(open, () => setOpen(false))
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [open])
  return (
    <div ref={box} className="relative inline-flex">
      <IconBtn icon="help" tone="ghost" title={title} aria-expanded={open} onClick={() => setOpen(!open)} />
      {open && (
        <div role="note" className="absolute right-0 top-8 z-30 w-[320px] max-w-[80vw] border border-line2 bg-panel p-3 text-xs leading-relaxed text-dim">
          <div className="t-title mb-1">{title}</div>
          {children}
        </div>
      )}
    </div>
  )
}
