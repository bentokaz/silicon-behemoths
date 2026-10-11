// Who sits at which desk. The game only knows how many people have a desk;
// which one is theirs is decided here, for the 3D view, and remembered so
// that nobody changes desks just because a colleague left. People are given
// a desk in a room that suits their job where there is one.
import { ITEMS, reachable, roomAt } from '../../sim/sites'
import type { Employee, Role, Site } from '../../sim/types'

const HOME: Record<Role, string[]> = { engineer: ['eng'], software: ['soft', 'server'], designer: ['studio'], researcher: ['lab'], marketer: ['media'], support: ['support'] }
const SPECIALIST = new Set(Object.values(HOME).flat())

/** Employee id to the id of their desk, kept for as long as the page is open. The name guards against another game reusing the id. */
const memory = new Map<string, { seat: string; who: string }>()
const stamp = (e: Employee) => `${e.name}/${e.look}/${e.role}`

function fit(site: Site, e: Employee, seat: { kind: string; x: number; y: number }): number {
  const room = roomAt(site, seat.x, seat.y)?.type ?? ''
  let score = 0
  if (HOME[e.role].includes(room)) score += 3
  else if (SPECIALIST.has(room)) score -= 1
  if (seat.kind === 'helpdesk') score += e.role === 'support' ? 3 : -2
  if (seat.kind === 'exec') score -= 1
  return score
}

/** Who sits at each seat, by the seat's item id. */
export function seatOwners(site: Site, seated: Employee[]): Map<string, Employee> {
  const map = new Map<string, Employee>()
  if (site.kind !== 'office') return map
  const seats = reachable(site).filter((i) => ITEMS.office[i.kind]?.seats)
  const valid = new Map(seats.map((s) => [s.id, s]))
  const here = new Set(seated.map((e) => e.id))
  for (const id of [...memory.keys()]) if (!here.has(id)) memory.delete(id)
  const waiting: Employee[] = []
  for (const e of seated) {
    const kept = memory.get(e.id)
    if (kept && kept.who === stamp(e) && valid.has(kept.seat) && !map.has(kept.seat)) map.set(kept.seat, e)
    else waiting.push(e)
  }
  for (const e of waiting) {
    let best: (typeof seats)[number] | undefined
    let bestScore = -Infinity
    for (const s of seats) {
      if (map.has(s.id)) continue
      const score = fit(site, e, s)
      if (score > bestScore) {
        bestScore = score
        best = s
      }
    }
    if (!best) break
    map.set(best.id, e)
    memory.set(e.id, { seat: best.id, who: stamp(e) })
  }
  return map
}
