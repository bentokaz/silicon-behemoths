// Small pieces the People, Teams and Hiring pages share: how a person's name,
// skill and morale are drawn in a row.
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store/game'
import { UNHAPPY } from '../store/highlight'
import { EXECS, ROLE_INFO, jobTitle } from '../sim/staff'
import { type Employee, ROLES, type Role } from '../sim/types'
import { Icon, roleIcon } from './icons'
import { Meter, Page } from './ui'

/** The colour a morale figure is written in: red when unhappy, amber when low, plain otherwise. */
export const moraleTone = (m: number): 'neg' | 'warn' | undefined => (m < UNHAPPY ? 'neg' : m < 50 ? 'warn' : undefined)
export const moraleText = (m: number) => ({ neg: 'text-neg', warn: 'text-warn', none: 'text-fg' })[moraleTone(m) ?? 'none']

/** How pleasant the campus is to work in, in a word. */
export const comfortWord = (c: number) => (c >= 0.7 ? 'good' : c >= 0.35 ? 'fair' : 'poor')

/** The job's icon, in the job's colour: a mark, never text. */
export function RoleDot({ role, exec }: { role: Role; exec?: Employee['exec'] }) {
  return <Icon name={exec ? 'briefcase' : roleIcon(role)} size={13} className="shrink-0" style={{ color: exec ? EXECS[exec].color : ROLE_INFO[role].color }} />
}

/** A person's name behind the mark of their job. The job itself is said on hover, and in its own column where there is room. */
export function Name({ e }: { e: Pick<Employee, 'name' | 'role' | 'exec'> }) {
  return (
    <span className="flex min-w-0 items-center gap-2" title={`${e.name}, ${jobTitle(e).toLowerCase()}`}>
      <RoleDot role={e.role} exec={e.exec} />
      <span className="min-w-0 truncate text-fg">{e.name}</span>
    </span>
  )
}

/** A figure out of a hundred with a short bar in front of it, for a table cell. The bar is plain: the figure carries any colour. */
export function Level({ value, tone = 'text-fg' }: { value: number; tone?: string }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <Meter value={value} max={100} tone="dim" className="!w-10 shrink-0" />
      <span className={`w-5 text-right ${tone}`}>{Math.floor(value)}</span>
    </span>
  )
}

/** The options of a job filter: every job, by name. */
export const ROLE_OPTIONS: { value: 'all' | Role; label: string }[] = [{ value: 'all', label: 'All roles' }, ...ROLES.map((r) => ({ value: r, label: ROLE_INFO[r].name }))]

/** How wide the card for one person is. */
export const CARD_W = 380

/**
 * The frame of the People, Teams and Hiring pages. While a person's card is
 * open it keeps the page clear of it: the card sits at the right-hand edge
 * and the list it was opened from stays whole beside it, with its least
 * important columns let go, never half under the card.
 */
export function PeoplePage({ children }: { children: ReactNode }) {
  const open = useStore((s) => !!s.person)
  const box = useRef<HTMLDivElement>(null)
  const [pad, setPad] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!open || !el) return setPad(0)
    const measure = () => {
      const host = document.getElementById('sb-drawer')
      if (host) setPad(Math.max(0, Math.round(el.getBoundingClientRect().right - (host.getBoundingClientRect().right - CARD_W))))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [open])
  return (
    <div ref={box} className="h-full min-h-0" style={{ paddingRight: pad }}>
      <Page>{children}</Page>
    </div>
  )
}
