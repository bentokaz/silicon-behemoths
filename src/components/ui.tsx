// Shared dashboard primitives: panels, buttons, sliders, readouts.
import { type ButtonHTMLAttributes, type ReactNode, type ThHTMLAttributes, useLayoutEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './icons'

/** An icon set into a line of text, sitting on the text's own baseline. */
export function Lead({ icon, size = 11 }: { icon?: IconName; size?: number }) {
  if (!icon) return null
  return <Icon name={icon} size={size} className="mr-[5px] inline-block" style={{ verticalAlign: -Math.round(size * 0.18) }} />
}

export function money(v: number, digits = 2): string {
  const a = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(digits)}B`
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(digits)}M`
  if (a >= 1e4) return `${sign}$${(a / 1e3).toFixed(1)}K`
  return `${sign}$${Math.round(a).toLocaleString()}`
}

export function num(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `${(v / 1e3).toFixed(1)}K`
  return Math.round(v).toLocaleString()
}

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`

export function Panel({ title, icon, right, children, className = '', bodyClass = '' }: { title?: ReactNode; icon?: IconName; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`flex min-h-0 flex-col border border-line bg-panel ${className}`}>
      {title !== undefined && (
        <header className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-line px-2">
          <span className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg">
            <span className="h-3 w-[3px] shrink-0 bg-accent" />
            {icon && <Icon name={icon} size={13} className="text-dim" />}
            <span className="truncate">{title}</span>
          </span>
          {right}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClass}`}>{children}</div>
    </section>
  )
}

type Tone = 'default' | 'primary' | 'danger' | 'ghost'
const BTN_TONES: Record<Tone, string> = {
  default: 'border-line2 bg-raise text-fg hover:border-accent hover:text-accent',
  primary: 'border-accent bg-accent font-semibold text-carbon hover:bg-transparent hover:text-accent',
  danger: 'border-neg/60 bg-transparent text-neg hover:bg-neg hover:text-carbon',
  ghost: 'border-transparent bg-transparent text-dim hover:text-fg',
}
const BTN_ON = 'border-accent bg-accent/10 text-accent'
// The icon carries its own colour: the unlayered `button { color: inherit }` in
// index.css outranks the text-colour classes above, so they cannot tint it.
const ICON_TONES: Record<Tone, string> = {
  default: 'text-fg opacity-70 group-hover/btn:text-accent group-hover/btn:opacity-100',
  primary: 'text-carbon group-hover/btn:text-accent',
  danger: 'text-neg group-hover/btn:text-carbon',
  ghost: 'text-dim group-hover/btn:text-fg',
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; active?: boolean; small?: boolean; icon?: IconName }
/** A button. With `icon`, the icon sits left of the label and is a touch dimmer than it until the button is hovered or active. */
export function Btn({ tone = 'default', active, small, icon, className = '', children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`group/btn rounded-none border ${small ? 'h-6 px-2 text-[11px]' : 'h-7 px-3 text-xs'} uppercase tracking-wider transition-colors disabled:pointer-events-none disabled:opacity-35 ${icon ? 'inline-flex items-center justify-center gap-[6px]' : ''} ${active ? BTN_ON : BTN_TONES[tone]} ${className}`}
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
      {...rest}
      title={title}
      aria-label={title}
      className={`group/btn inline-flex shrink-0 items-center justify-center rounded-none border align-middle ${small ? 'h-6 w-6' : 'h-7 w-7'} transition-colors disabled:pointer-events-none disabled:opacity-35 ${active ? BTN_ON : BTN_TONES[tone]} ${className}`}
    >
      <Icon name={icon} size={small ? 12 : 14} className={active ? 'text-accent' : tone === 'default' ? 'text-fg group-hover/btn:text-accent' : ICON_TONES[tone]} />
    </button>
  )
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

export function Slider({ label, icon, value, min, max, step = 1, onChange, format, disabled, hint }: { label: string; icon?: IconName; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; disabled?: boolean; hint?: string }) {
  return (
    <label className="block py-1" title={hint}>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-dim">
          <Lead icon={icon} />
          {label}
        </span>
        <span className="num text-[11px] text-fg">{format ? format(value) : value}</span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export function Choice<T extends string | number>({ label, icon, value, options, onChange }: { label: string; icon?: IconName; value: T; options: { value: T; label: string; locked?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
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

export function TextInput({ value, onChange, className = '', ...rest }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; maxLength?: number }) {
  return <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} className={`h-7 rounded-none border border-line2 bg-raise px-2 text-xs outline-none focus:border-accent ${className}`} style={{ userSelect: 'text' }} />
}

export function NumInput({ value, onChange, className = '', min = 0, step = 1 }: { value: number; onChange: (v: number) => void; className?: string; min?: number; step?: number }) {
  return <input type="number" min={min} step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} className={`num h-7 rounded-none border border-line2 bg-raise px-2 text-xs outline-none focus:border-accent ${className}`} />
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
  if (!open) return null
  return (
    <div className="absolute inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-carbon/60" onClick={onClose} />
      <aside className="relative flex h-full min-h-0 flex-col border-l border-line2 bg-carbon" style={{ width, maxWidth: '100%' }}>
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
      {sub !== undefined && <div className="num mt-1 truncate text-[10px] text-faint">{sub}</div>}
    </div>
  )
}

/** A small supporting figure, visually quieter than a Kpi. */
export function Mini({ label, icon, value, tone }: { label: string; icon?: IconName; value: ReactNode; tone?: string }) {
  return (
    <div className="border border-line px-2 py-1">
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
