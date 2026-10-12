// Shared dashboard primitives: panels, buttons, sliders, readouts.
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject, type ThHTMLAttributes, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { keepView, keptView, viewKept } from '../store/focus'
import { readNumber } from './format'
import { Icon, type IconName } from './icons'

export { int, money, num, pct } from './format'

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

/** True when the player has asked their system for less motion. */
export const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Panel({ title, icon, right, children, className = '', bodyClass = '', keep }: { title?: ReactNode; icon?: IconName; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; /** A name for the body's scroll position, so it is found where it was left. */ keep?: string }) {
  const body = useKeptScroll(keep)
  const tight = useTight(body)
  return (
    <section className={`flex min-h-0 flex-col border border-line bg-panel ${className}`}>
      {title !== undefined && (
        <header className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-line px-2">
          <span className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg">
            <span className="h-3 w-[3px] shrink-0 bg-accent" />
            {icon && <Icon name={icon} size={13} className="text-dim" />}
            <span className="truncate" title={typeof title === "string" ? title : undefined}>
              {title}
            </span>
          </span>
          {right}
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

type Tone = 'default' | 'primary' | 'danger' | 'ghost'
const BTN_TONES: Record<Tone, string> = {
  default: 'border-line2 bg-raise text-fg enabled:hover:border-accent enabled:hover:text-accent',
  primary: 'border-accent bg-accent font-semibold text-carbon enabled:hover:bg-transparent enabled:hover:text-accent',
  danger: 'border-neg/60 bg-transparent text-neg enabled:hover:bg-neg enabled:hover:text-carbon',
  ghost: 'border-transparent bg-transparent text-dim enabled:hover:text-fg',
}
const BTN_ON = 'border-accent bg-accent/10 text-accent'
// The icon carries its own colour: the unlayered `button { color: inherit }` in
// index.css outranks the text-colour classes above, so they cannot tint it.
const ICON_TONES: Record<Tone, string> = {
  default: 'text-fg opacity-70 group-enabled/btn:group-hover/btn:text-accent group-enabled/btn:group-hover/btn:opacity-100',
  primary: 'text-carbon group-enabled/btn:group-hover/btn:text-accent',
  danger: 'text-neg group-enabled/btn:group-hover/btn:text-carbon',
  ghost: 'text-dim group-enabled/btn:group-hover/btn:text-fg',
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
/** How a locked control looks: dimmed, and plainly not something to press. */
const LOCKED = 'cursor-not-allowed opacity-45'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; active?: boolean; small?: boolean; icon?: IconName } & LockProps
/**
 * A button. With `icon`, the icon sits left of the label and is a touch dimmer than it until the button is hovered or active.
 * With `locked` it is dimmed behind a lock and does nothing of its own; it stays hoverable so the tooltip can say why.
 */
export function Btn({ tone = 'default', active, small, icon, locked, onLocked, lockMark = 'inline', className = '', children, ...rest }: BtnProps) {
  if (locked) {
    const corner = lockMark === 'corner'
    return (
      <button
        {...rest}
        type="button"
        aria-disabled
        title={locked}
        onClick={(e) => (e.preventDefault(), e.stopPropagation(), onLocked?.())}
        className={`rounded-none border ${small ? 'h-6 px-2 text-[11px]' : 'h-7 px-3 text-xs'} uppercase tracking-wider ${corner ? 'relative' : 'inline-flex items-center justify-center gap-[5px] whitespace-nowrap'} ${LOCKED} ${active ? BTN_ON : tone === 'ghost' ? 'border-transparent bg-transparent text-dim' : 'border-line2 bg-raise text-dim'} ${className}`}
      >
        <Icon name="lock" size={corner ? 8 : small ? 10 : 11} className={`${corner ? 'absolute right-[3px] top-[3px]' : 'shrink-0'} ${active ? 'text-accent' : 'text-dim'}`} />
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
      className={`group/btn rounded-none border ${small ? 'h-6 px-2 text-[11px]' : 'h-7 px-3 text-xs'} uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${icon ? 'inline-flex items-center justify-center gap-[6px]' : ''} ${active ? BTN_ON : BTN_TONES[tone]} ${className}`}
    >
      {icon && <Icon name={icon} size={small ? 12 : 13} className={active ? 'text-accent' : tone === 'primary' ? '' : ICON_TONES[tone]} />}
      {children}
    </button>
  )
}

type IconBtnProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'children'> & { icon: IconName; title: string; tone?: Tone; active?: boolean; small?: boolean }
/** A square button that is only an icon. The title is its tooltip and its name for screen readers. */
export function IconBtn({ icon, title, tone = 'default', active, small = true, className = '', ...rest }: IconBtnProps) {
  return (
    <button
      type="button"
      {...rest}
      title={title}
      aria-label={title}
      aria-pressed={rest['aria-pressed'] ?? (active === undefined ? undefined : active)}
      className={`group/btn inline-flex shrink-0 items-center justify-center rounded-none border align-middle ${small ? 'h-6 w-6' : 'h-7 w-7'} transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${active ? BTN_ON : BTN_TONES[tone]} ${className}`}
    >
      <Icon name={icon} size={small ? 12 : 14} className={active ? 'text-accent' : tone === 'default' ? 'text-fg group-enabled/btn:group-hover/btn:text-accent' : ICON_TONES[tone]} />
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

/** A small uppercase heading inside a panel, with an optional icon. */
export function Head({ icon, children, right, className = '' }: { icon?: IconName; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`label flex items-center gap-[5px] ${className}`}>
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

export function Stat({ label, icon, value, sub, tone }: { label: string; icon?: IconName; value: ReactNode; sub?: ReactNode; tone?: 'pos' | 'neg' | 'warn' | 'accent' }) {
  const color = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : tone === 'warn' ? 'text-warn' : tone === 'accent' ? 'text-accent' : 'text-fg'
  return (
    <div className="border border-line bg-panel px-3 py-2">
      <FitLabel icon={icon} label={label} size={11} className="label gap-[5px]" />
      <div className={`num mt-1 text-lg leading-none ${color}`}>{value}</div>
      {sub !== undefined && <div className="num mt-1 text-[11px] text-dim">{sub}</div>}
    </div>
  )
}

export function Slider({ label, icon, value, min, max, step = 1, onChange, format, disabled, hint, locked, onLocked }: { label: string; icon?: IconName; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; disabled?: boolean; hint?: string } & LockProps) {
  return (
    <label className={`block py-1 ${locked ? LOCKED : ''}`} title={locked || hint} onClick={locked ? (e) => (e.preventDefault(), onLocked?.()) : undefined}>
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
        className="h-6 min-w-0 max-w-[62%] flex-1 rounded-none border border-line2 bg-raise px-1 text-[11px] outline-none focus:border-accent"
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
      <div className="flex items-start gap-[5px] pb-1 text-[10px] leading-snug text-faint" data-lock-note>
        <Icon name="lock" size={10} className="mt-[2px] shrink-0" />
        <span>{lockNote}</span>
      </div>
    </div>
  )
}

export function Meter({ value, max = 1, tone = 'accent', className = '' }: { value: number; max?: number; tone?: 'accent' | 'pos' | 'neg' | 'warn' | 'dim'; className?: string }) {
  const bg = { accent: 'bg-accent', pos: 'bg-pos', neg: 'bg-neg', warn: 'bg-warn', dim: 'bg-faint' }[tone]
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
  axis: { fill: 'var(--color-dim)', fontSize: 10, fontFamily: 'Cascadia Mono, Consolas, monospace' },
  grid: 'var(--color-line)',
  tooltip: {
    contentStyle: { background: 'var(--color-panel)', border: '1px solid var(--color-line2)', borderRadius: 0, fontSize: 11, fontFamily: 'Cascadia Mono, Consolas, monospace' },
    labelStyle: { color: 'var(--color-dim)' },
    itemStyle: { padding: 0 },
  },
}

// ---------------------------------------------------------------- layout helpers

/**
 * Underlined tab bar. With `fit`, the tabs share the width instead of running
 * off the side: when every tab has an icon and the full labels no longer fit,
 * only the chosen tab keeps its label and the rest show their icon and count
 * (the label is the tooltip); without icons the labels are shortened.
 */
export function Tabs<T extends string>({ value, options, onChange, className = '', fit }: { value: T; options: { value: T; label: ReactNode; badge?: ReactNode; icon?: IconName }[]; onChange: (v: T) => void; className?: string; fit?: boolean }) {
  const strip = useRef<HTMLDivElement>(null)
  const [tight, setTight] = useState(false)
  const iconic = !!fit && options.every((o) => o.icon)
  const shape = options.map((o) => `${o.value}/${typeof o.label === 'string' ? o.label : ''}/${typeof o.badge === 'object' ? '' : (o.badge ?? '')}`).join('|')
  useLayoutEffect(() => {
    const el = strip.current
    if (!el || !iconic) return setTight(false)
    const check = () => {
      let need = 0
      el.querySelectorAll('[data-ruler]').forEach((r) => (need += r.getBoundingClientRect().width))
      setTight(need > el.clientWidth + 0.5)
    }
    check()
    const watch = new ResizeObserver(check)
    watch.observe(el)
    return () => watch.disconnect()
  }, [iconic, shape])
  const tab = fit ? 'min-w-0 shrink gap-1 px-2 tracking-[0.08em] [&>*]:shrink-0' : 'gap-2 px-3 tracking-[0.14em]'
  const base = 'flex h-8 items-center whitespace-nowrap border-b-2 text-[11px] uppercase transition-colors'
  return (
    <div ref={strip} className={`relative flex shrink-0 border-b border-line ${className}`}>
      {options.map((o) => {
        const on = value === o.value
        const bare = tight && !on
        return (
          <button key={o.value} onClick={() => onChange(o.value)} title={fit && typeof o.label === 'string' ? o.label : undefined} aria-label={bare && typeof o.label === 'string' ? o.label : undefined} className={`${base} ${tab} ${on ? 'border-accent text-accent' : 'border-transparent text-dim hover:text-fg'}`}>
            {o.icon && <Icon name={o.icon} size={bare ? 15 : 13} className={on ? 'text-accent' : 'text-dim'} />}
            {bare ? null : fit ? <span className="!shrink truncate">{o.label}</span> : o.label}
            {o.badge !== undefined && <span className="num text-[10px] text-faint">{o.badge}</span>}
          </button>
        )
      })}
      {iconic && (
        // the same tabs at their full width, never shown: what the strip would need
        <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0 h-0 w-0 overflow-hidden">
          <div className="flex w-max">
            {options.map((o) => (
              <button key={o.value} data-ruler tabIndex={-1} disabled className={`${base} shrink-0 gap-1 px-2 tracking-[0.08em]`}>
                {o.icon && <Icon name={o.icon} size={13} />}
                <span>{o.label}</span>
                {o.badge !== undefined && <span className="num text-[10px]">{o.badge}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** A panel whose body can be folded away. Closed panels show only their heading. */
export function Fold({ title, icon, right, children, open: initial = true, className = '', bodyClass = '' }: { title: ReactNode; icon?: IconName; right?: ReactNode; children: ReactNode; open?: boolean; className?: string; bodyClass?: string }) {
  const [open, setOpen] = useState(initial)
  return (
    <section className={`shrink-0 border border-line bg-panel ${className}`}>
      <header className="flex h-8 items-center justify-between px-2">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-fg hover:text-accent">
          <Icon name={open ? 'minus' : 'plus'} size={9} className="text-accent" />
          {icon && <Icon name={icon} size={13} className="text-dim" />}
          <span className="truncate">{title}</span>
        </button>
        {right}
      </header>
      {open && <div className={`border-t border-line ${bodyClass}`}>{children}</div>}
    </section>
  )
}

/** A slide-over panel covering the right side of its positioned parent. */
export function Drawer({ open, onClose, title, children, width = 420, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number; footer?: ReactNode }) {
  const box = useRef<HTMLElement>(null)
  useLayer(open, onClose, { box })
  if (!open) return null
  return (
    <div className="absolute inset-0 z-[35] flex justify-end">
      <div className="absolute inset-0 bg-carbon/60" onClick={onClose} />
      <aside ref={box} role="dialog" aria-label={typeof title === 'string' ? title : 'Details'} className="relative flex h-full min-h-0 flex-col border-l border-line2 bg-carbon outline-none" style={{ width, maxWidth: '100%' }}>
        <header className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-panel px-3">
          <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-fg">{title}</span>
          <button onClick={onClose} className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center text-dim hover:text-accent" title="Close (Esc)" aria-label="Close">
            <Icon name="close" size={13} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="shrink-0 border-t border-line bg-panel p-2">{footer}</div>}
      </aside>
    </div>
  )
}

/** A headline number. Use for the few figures that matter most on a screen. */
export function Kpi({ label, icon, value, sub, tone }: { label: string; icon?: IconName; value: ReactNode; sub?: ReactNode; tone?: 'pos' | 'neg' | 'warn' | 'accent' }) {
  const color = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : tone === 'warn' ? 'text-warn' : tone === 'accent' ? 'text-accent' : 'text-fg'
  return (
    <div className="border border-line bg-panel px-3 py-2">
      <FitLabel icon={icon} label={label} size={12} className="label gap-[5px] text-faint" />
      <div className={`num mt-1 text-xl font-semibold leading-none ${color}`}>{value}</div>
      {sub !== undefined && (
        <div className="num mt-1 truncate text-[10px] text-faint" title={typeof sub === 'string' ? sub : undefined}>
          {sub}
        </div>
      )}
    </div>
  )
}

/** A small supporting figure, visually quieter than a Kpi. */
export function Mini({ label, icon, value, tone, title }: { label: string; icon?: IconName; value: ReactNode; tone?: string; /** Said on hover when the label is a short form. */ title?: string }) {
  return (
    <div className="border border-line px-2 py-1" title={title}>
      <FitLabel icon={icon} label={label} size={10} className="gap-1 text-[9px] uppercase tracking-[0.12em] text-faint" />
      <div className={`num text-xs ${tone ?? 'text-dim'}`}>{value}</div>
    </div>
  )
}

export function Tag({ children, tone = 'dim', icon }: { children?: ReactNode; tone?: 'dim' | 'accent' | 'pos' | 'neg' | 'warn'; icon?: IconName }) {
  const c = { dim: 'border-line2 text-dim', accent: 'border-accent text-accent', pos: 'border-pos/60 text-pos', neg: 'border-neg/60 text-neg', warn: 'border-warn/60 text-warn' }[tone]
  return (
    <span className={`num inline-block whitespace-nowrap border px-1 text-[9px] uppercase leading-4 tracking-wider ${c}`}>
      {icon && <Icon name={icon} size={9} className={`inline-block ${children !== undefined ? 'mr-[3px]' : ''}`} style={{ verticalAlign: -1 }} />}
      {children}
    </span>
  )
}

export function Empty({ text, icon, children }: { text: string; icon?: IconName; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-24 flex-col items-center justify-center gap-3 px-6 py-6 text-center">
      {icon && <Icon name={icon} size={22} className="text-line2" />}
      <div className="max-w-sm text-[11px] leading-snug text-faint">{text}</div>
      {children}
    </div>
  )
}
