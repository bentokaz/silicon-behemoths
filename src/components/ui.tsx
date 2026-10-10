// Shared dashboard primitives: panels, buttons, sliders, readouts.
import type { ButtonHTMLAttributes, ReactNode } from 'react'

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

export function Panel({ title, right, children, className = '', bodyClass = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`flex min-h-0 flex-col border border-line bg-panel ${className}`}>
      {title !== undefined && (
        <header className="flex h-8 shrink-0 items-center justify-between border-b border-line px-2">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg">
            <span className="h-3 w-[3px] bg-accent" />
            {title}
          </span>
          {right}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClass}`}>{children}</div>
    </section>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'primary' | 'danger' | 'ghost'; active?: boolean; small?: boolean }
export function Btn({ tone = 'default', active, small, className = '', ...rest }: BtnProps) {
  const tones = {
    default: 'border-line2 bg-raise text-fg hover:border-accent hover:text-accent',
    primary: 'border-accent bg-accent font-semibold text-carbon hover:bg-transparent hover:text-accent',
    danger: 'border-neg/60 bg-transparent text-neg hover:bg-neg hover:text-carbon',
    ghost: 'border-transparent bg-transparent text-dim hover:text-fg',
  }
  return (
    <button
      {...rest}
      className={`rounded-none border ${small ? 'h-6 px-2 text-[11px]' : 'h-7 px-3 text-xs'} uppercase tracking-wider transition-colors disabled:pointer-events-none disabled:opacity-35 ${active ? 'border-accent bg-accent/10 text-accent' : tones[tone]} ${className}`}
    />
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'pos' | 'neg' | 'warn' | 'accent' }) {
  const color = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : tone === 'warn' ? 'text-warn' : tone === 'accent' ? 'text-accent' : 'text-fg'
  return (
    <div className="border border-line bg-panel px-3 py-2">
      <div className="label">{label}</div>
      <div className={`num mt-1 text-lg leading-none ${color}`}>{value}</div>
      {sub !== undefined && <div className="num mt-1 text-[11px] text-dim">{sub}</div>}
    </div>
  )
}

export function Slider({ label, value, min, max, step = 1, onChange, format, disabled, hint }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; disabled?: boolean; hint?: string }) {
  return (
    <label className="block py-1" title={hint}>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-dim">{label}</span>
        <span className="num text-[11px] text-fg">{format ? format(value) : value}</span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; locked?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-[11px] text-dim">{label}</span>
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

export function Row({ k, v, tone }: { k: ReactNode; v: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-[3px] last:border-0">
      <span className="text-[11px] text-dim">{k}</span>
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
