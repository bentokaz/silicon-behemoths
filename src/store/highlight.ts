// What the campus view is asked to point out: the people asking for a raise,
// the unhappy ones, or the desks nobody sits at. One at a time, or nothing.
// The People page turns one on before it sends the player to the campus; the
// 3D view reads it every frame without going through React.
import { create } from 'zustand'

export type Highlight = 'raise' | 'unhappy' | 'desks'

/** Morale under which someone counts as unhappy: the same line at which the campus draws them slumped. */
export const UNHAPPY = 35

interface Store {
  on: Highlight | null
  set(on: Highlight | null): void
  /** Turn one on, or off again when it is the one that is on. */
  toggle(h: Highlight): void
}

export const useHighlight = create<Store>((set, get) => ({
  on: null,
  set: (on) => set({ on }),
  toggle: (h) => set({ on: get().on === h ? null : h }),
}))

/** What is known about one person, whether they come from the game or from the 3D crowd. */
export interface Marked {
  ask?: number | boolean
  morale: number
}

export const wantsRaise = (p: Marked) => !!p.ask
export const isUnhappy = (p: Marked) => p.morale < UNHAPPY

/** Whether a highlight picks this person out. Empty desks pick out nobody. */
export function picks(h: Highlight | null, p: Marked): boolean {
  return h === 'raise' ? wantsRaise(p) : h === 'unhappy' ? isUnhappy(p) : false
}

/** How many things each highlight would mark. `seats` is every usable desk, taken or not. */
export function highlightCounts(staff: readonly Marked[], seats: number): Record<Highlight, number> {
  return {
    raise: staff.filter(wantsRaise).length,
    unhappy: staff.filter(isUnhappy).length,
    desks: Math.max(0, seats - staff.length),
  }
}

/** The highlight worth turning on when the player asks to see their people on the campus: the most pressing one that marks anything. */
export function bestHighlight(counts: Record<Highlight, number>): Highlight | null {
  return counts.raise ? 'raise' : counts.unhappy ? 'unhappy' : counts.desks ? 'desks' : null
}

/** A highlight that marks nothing any more is let go of. */
export function stillUseful(on: Highlight | null, counts: Record<Highlight, number>): Highlight | null {
  return on && counts[on] > 0 ? on : null
}

/** The seats nobody owns, out of all there are. */
export function emptySeats<S>(seats: readonly S[], owned: Iterable<S | null | undefined>): S[] {
  const taken = new Set<S>()
  for (const s of owned) if (s) taken.add(s)
  return seats.filter((s) => !taken.has(s))
}
