// The small pieces that float over a site's 3D view: a labelled menu (view,
// light), the one-line status strip that opens for its detail, and the
// one-line hint with keys as chips and a "?" for the rest. Each is as small
// as it can be: the view is the screen.
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './icons'
import { Btn, type Figure, IconBtn, Key, Lead, useLayer } from './ui'

/** Closes something when the pointer goes down anywhere outside it. */
function useClickAway(open: boolean, box: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && close()
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [open, box, close])
}

export interface MenuOption<T extends string> {
  value: T
  label: string
  icon: IconName
  /** A figure or a word at the right of the row: the time on the clock, "now". */
  note?: string
  title?: string
}

/**
 * One button that says what it sets and what it is set to, and opens a short
 * list of the choices, each with its name. Takes the place of a row of bare
 * icons. Esc and a click elsewhere close it.
 */
export function SiteMenu<T extends string>({ label, value, options, onChange, title }: { label: string; value: T; options: MenuOption<T>[]; onChange: (v: T) => void; title?: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)
  useLayer(open, close)
  useClickAway(open, box, close)
  const now = options.find((o) => o.value === value) ?? options[0]
  return (
    <div ref={box} className="relative bg-panel/95">
      <Btn small icon={now.icon} aria-haspopup="menu" aria-expanded={open} title={title ?? `${label}: ${now.label}`} onClick={() => setOpen(!open)}>
        {label}
        <span className="text-dim">{now.label}</span>
        <Icon name="chevronDown" size={10} className="text-dim" />
      </Btn>
      {open && (
        <div role="menu" aria-label={label} className="absolute left-0 top-8 z-30 min-w-[176px] border border-line2 bg-panel py-1">
          {options.map((o) => {
            const on = o.value === value
            return (
              <button key={o.value} type="button" role="menuitemradio" aria-checked={on} title={o.title} onClick={() => (onChange(o.value), close())} className={`flex h-7 w-full items-center gap-2 whitespace-nowrap px-2 text-left text-xs ${on ? 'bg-accent/10 text-accent' : 'text-fg hover:bg-hover'}`}>
                <Icon name={o.icon} size={13} className={on ? 'text-accent' : 'text-dim'} />
                <span className="flex-1">{o.label}</span>
                {o.note && <span className="num text-[11px] text-dim">{o.note}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * The status of a site in one line of figures, at the top right of the view.
 * A click opens the detail behind it (the cards the screen passes in), which
 * hangs under the line and scrolls within the view; it starts closed on every
 * visit.
 */
export function SiteStatus({ items, children, open, onOpen }: { items: Figure[]; children?: ReactNode; open: boolean; onOpen: (open: boolean) => void }) {
  const can = children !== undefined && children !== null && children !== false
  useLayer(open && can, () => onOpen(false))
  const tone = { pos: 'text-pos', neg: 'text-neg', warn: 'text-warn', accent: 'text-accent' } as const
  return (
    <>
      <div data-site-status className="pointer-events-auto flex h-7 max-w-full shrink-0 items-center border border-line2 bg-panel/95">
        <div role={can ? 'button' : undefined} tabIndex={can ? 0 : undefined} aria-expanded={can ? open : undefined} title={can ? (open ? 'Show less' : 'Show the detail') : undefined} onClick={can ? () => onOpen(!open) : undefined} onKeyDown={can ? (e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onOpen(!open)) : undefined} className={`flex h-full min-w-0 items-center gap-x-4 overflow-hidden pl-3 ${can ? 'cursor-pointer pr-2 hover:bg-hover' : 'pr-3'}`}>
          {items.map((f) => {
            const body = (
              <>
                <span className="text-[11px] text-dim">
                  <Lead icon={f.icon} />
                  {f.label}
                </span>
                <span className={`num text-xs font-semibold ${f.tone ? tone[f.tone] : 'text-fg'}`}>{f.value}</span>
              </>
            )
            return f.onClick ? (
              <button key={f.label} type="button" title={f.title} onClick={(e) => (e.stopPropagation(), f.onClick?.())} className="flex shrink-0 items-baseline gap-[6px] whitespace-nowrap hover:[&>span:first-child]:text-fg">
                {body}
              </button>
            ) : (
              <span key={f.label} title={f.title} className="flex shrink-0 items-baseline gap-[6px] whitespace-nowrap">
                {body}
              </span>
            )
          })}
          {can && <Icon name={open ? 'chevronUp' : 'chevronDown'} size={11} className="shrink-0 text-dim" />}
        </div>
      </div>
      {can && open && <div className="pointer-events-auto flex min-h-0 w-[300px] max-w-full flex-col gap-2 overflow-y-auto">{children}</div>}
    </>
  )
}

/** A piece of the hint line: words, or a key to press. */
export type HintPart = string | { key: string }

/**
 * The hint: one line that says what a click does right now, with the keys
 * that matter as chips, and a "?" that opens everything else (the camera,
 * the other keys, the long form of what the tool does). The line itself
 * lets clicks through to the view; only the "?" takes them.
 */
export function SiteHint({ parts, tone = 'dim', help }: { parts: HintPart[]; tone?: 'dim' | 'warn' | 'live'; help: ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)
  useLayer(open, close)
  useClickAway(open, box, close)
  return (
    <div data-bottom-bar className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center gap-1">
      <div ref={box} className="pointer-events-auto relative shrink-0 bg-panel/95">
        <IconBtn icon="help" title="Keys and how the view works" aria-expanded={open} active={open ? true : undefined} onClick={() => setOpen(!open)} />
        {open && (
          <div role="note" className="absolute bottom-8 left-0 z-30 max-h-[70vh] w-[340px] max-w-[80vw] overflow-y-auto border border-line2 bg-panel p-3 text-xs leading-relaxed text-dim">
            {help}
          </div>
        )}
      </div>
      <div className={`flex h-7 min-w-0 items-center gap-[6px] overflow-hidden whitespace-nowrap border bg-panel/95 px-2 text-xs ${tone === 'warn' ? 'border-warn text-warn' : tone === 'live' ? 'border-accent text-fg' : 'border-line2 text-dim'}`}>
        {parts.map((p, i) =>
          typeof p === 'string' ? (
            <span key={i} className={i === 0 ? 'min-w-0 truncate' : 'shrink-0'}>
              {p}
            </span>
          ) : (
            <span key={i} className="shrink-0">
              <Key>{p.key}</Key>
            </span>
          ),
        )}
      </div>
    </div>
  )
}

/** A row of the help: a key or two, and what they do. */
export function HelpKeys({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-[2px]">
      <span className="flex w-[104px] shrink-0 flex-wrap gap-1">
        {keys.map((k) => (
          <Key key={k}>{k}</Key>
        ))}
      </span>
      <span className="min-w-0 text-[11px] leading-snug text-dim">{children}</span>
    </div>
  )
}
