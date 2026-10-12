// Pieces the three Sites pages (Factory, Stores, Venue) share: the one calm
// panel shown before a site exists, and the plain sections of the detail that
// sits behind a 3D view's status strip.
import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import { Meter, pct } from './ui'

/**
 * A site the company does not own yet: what it is for in two lines, what it
 * costs to keep, and the one action that buys it.
 */
export function SiteIntro({ icon, title, children, facts, action }: { icon: IconName; title: string; /** Two lines on what the site does for the company. */ children: ReactNode; facts: { label: string; value: ReactNode }[]; /** The one primary action. */ action: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto p-4">
      <section className="w-[460px] max-w-full border border-line bg-panel">
        <header className="flex h-8 items-center gap-2 border-b border-line px-3">
          <Icon name={icon} size={13} className="shrink-0 text-dim" />
          <span className="t-title">{title}</span>
        </header>
        <div className="p-3">
          <p className="text-xs leading-relaxed text-dim">{children}</p>
          <dl className="mt-3 border-t border-line">
            {facts.map((f) => (
              <div key={f.label} className="flex items-baseline justify-between gap-3 border-b border-line py-[5px]">
                <dt className="text-[11px] text-faint">{f.label}</dt>
                <dd className="text-xs text-fg">{f.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex">{action}</div>
        </div>
      </section>
    </div>
  )
}

/** The detail behind a 3D view's status strip: one plain card of sections (`Sec`), on a surface of its own because it lies over the view. */
export function Detail({ children }: { children: ReactNode }) {
  return <div className="shrink-0 border border-line2 bg-panel">{children}</div>
}

/** One section of the detail behind a status strip: an optional small heading with a count and something at its right, over its rows. */
export function Sec({ title, count, right, children }: { title?: string; count?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="border-b border-line px-3 py-2 last:border-b-0">
      {title !== undefined && (
        <div className="mb-1 flex h-6 items-center justify-between gap-2">
          <span className="flex items-baseline gap-2 text-[11px] font-semibold text-dim">
            {title}
            {count !== undefined && <span className="num font-normal text-faint">{count}</span>}
          </span>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

/** A line of plain words in a section: a reason, a hint. */
export function Note({ tone = 'dim', children }: { tone?: 'dim' | 'warn' | 'neg'; children: ReactNode }) {
  return (
    <div className={`flex items-start gap-[6px] text-[11px] leading-snug ${tone === 'warn' ? 'text-warn' : tone === 'neg' ? 'text-neg' : 'text-dim'}`}>
      {tone !== 'dim' && <Icon name="alert" size={12} className="mt-[1px] shrink-0" />}
      <span>{children}</span>
    </div>
  )
}

/** A fact in a section: its name at the left, what it is at the right. Figures go in the number face (`num`), words do not. */
export function Fact({ k, v, num = false, tone, title }: { k: string; v: ReactNode; num?: boolean; tone?: 'pos' | 'neg' | 'warn'; title?: string }) {
  return (
    <div className="flex h-6 items-center justify-between gap-3" title={title}>
      <span className="min-w-0 truncate text-[11px] text-dim">{k}</span>
      <span className={`shrink-0 text-xs ${num ? 'num' : ''} ${tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : tone === 'warn' ? 'text-warn' : 'text-fg'}`}>{v}</span>
    </div>
  )
}

/** A share as a bar with its name and its figure on one line. `value` is the figure shown; without it the share is shown as a percentage. */
export function BarRow({ label, share, value, tone = 'accent', title }: { label: string; /** 0 to 1. */ share: number; value?: ReactNode; tone?: 'accent' | 'pos' | 'neg' | 'warn' | 'dim'; title?: string }) {
  return (
    <div className="flex h-6 items-center gap-2" title={title}>
      <span className="w-[104px] shrink-0 truncate text-[11px] text-dim">{label}</span>
      <Meter value={share} tone={tone} className="min-w-0 flex-1" />
      <span className="num w-12 shrink-0 text-right text-[11px] text-fg">{value ?? pct(share, 0)}</span>
    </div>
  )
}
