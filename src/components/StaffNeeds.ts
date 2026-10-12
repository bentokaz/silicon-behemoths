// Who on the staff needs the player, and why. Nothing here draws anything:
// the People page filters and sorts by it, and it is tested on its own.
import { UNMANAGED_AT, seatedStaff, teamBonus } from '../sim/staff'
import type { Employee, GameState } from '../sim/types'

/** Why someone needs the player, most pressing first. */
export type Need = 'raise' | 'leaving' | 'desk' | 'lead'
export const NEEDS: Need[] = ['raise', 'leaving', 'desk', 'lead']

/** Days of very low morale after which someone walks out (the rule in the simulation's daily step). */
export const QUIT_AFTER = 45

/** What has to be known about the company to judge one person. */
export interface Facts {
  /** Ids of the people who have a desk. */
  seated: ReadonlySet<string>
  /** Ids of the people who have a working lead, or null while nobody needs one (a small company, or teams not open yet). */
  led: ReadonlySet<string> | null
}

/** `teamsOpen` is whether the player can make teams at all: a lead nobody can appoint is not something that needs them. */
export function factsOf(g: GameState, teamsOpen: boolean): Facts {
  const seated = new Set(seatedStaff(g).map((e) => e.id))
  if (!teamsOpen || g.staff.length <= UNMANAGED_AT) return { seated, led: null }
  const led = new Set<string>()
  for (const t of g.teams) if (teamBonus(g, t) > 0) for (const id of t.members) led.add(id)
  return { seated, led }
}

type Who = Pick<Employee, 'id' | 'ask' | 'lowDays' | 'traits'>

/** Days until this person quits if nothing changes, or null when they are not on the way out. Loyal people never go. */
export function daysToQuit(e: Pick<Employee, 'lowDays' | 'traits'>): number | null {
  if (e.lowDays <= 0 || e.traits.includes('loyal')) return null
  return Math.max(1, QUIT_AFTER + 1 - e.lowDays)
}

/** The most pressing reason this person needs the player, or null when they are simply working. */
export function needOf(e: Who, f: Facts): Need | null {
  if (e.ask) return 'raise'
  if (daysToQuit(e) !== null) return 'leaving'
  if (!f.seated.has(e.id)) return 'desk'
  if (f.led && !f.led.has(e.id)) return 'lead'
  return null
}

export const needsYou = (e: Who, f: Facts) => needOf(e, f) !== null

/** How many people need the player, in all and by reason (each person is counted once, under their most pressing reason). */
export function needCounts(staff: readonly Who[], f: Facts): Record<Need, number> & { total: number } {
  const out = { raise: 0, leaving: 0, desk: 0, lead: 0, total: 0 }
  for (const e of staff) {
    const n = needOf(e, f)
    if (!n) continue
    out[n]++
    out.total++
  }
  return out
}

/**
 * Where a person stands when the list is ordered by status: the needs first,
 * most pressing first, then people away on a course. Someone who is simply
 * working has no status, and goes last whichever way the column is sorted.
 */
export function statusRank(e: Who & Pick<Employee, 'trainingUntil'>, f: Facts, day: number): number | null {
  const n = needOf(e, f)
  if (n) return NEEDS.indexOf(n)
  return e.trainingUntil !== undefined && e.trainingUntil > day ? NEEDS.length : null
}

/** Which filter the People page opens on: the people who need the player, whenever there are any. */
export function defaultFilter(needing: number): 'needs' | 'all' {
  return needing > 0 ? 'needs' : 'all'
}
