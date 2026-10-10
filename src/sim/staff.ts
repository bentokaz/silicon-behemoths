// Staff and office rules: who can be hired, what furniture does, and how the
// people sitting at desks change research, development and marketing.
import { int, pick, range } from './rng'
import type { Employee, GameState, Office, OfficeItemKind, Role } from './types'

export const ROLE_INFO: Record<Role, { name: string; effect: string; color: string }> = {
  engineer: { name: 'Engineer', effect: 'Shortens device development', color: '#4f8fd6' },
  designer: { name: 'Designer', effect: 'Adds polish to the design score at release', color: '#d6a24f' },
  researcher: { name: 'Researcher', effect: 'Speeds up research', color: '#58b98a' },
  marketer: { name: 'Marketer', effect: 'Grows awareness faster from sales', color: '#d65f7c' },
}

export const ITEM_INFO: Record<OfficeItemKind, { name: string; cost: number; note: string }> = {
  desk: { name: 'Desk', cost: 1500, note: 'Seats one employee. Staff without a desk do no work.' },
  bench: { name: 'Lab bench', cost: 12000, note: 'Each bench boosts one researcher.' },
  server: { name: 'Server rack', cost: 20000, note: 'Each rack boosts one engineer.' },
  meeting: { name: 'Meeting table', cost: 8000, note: 'Raises comfort.' },
  coffee: { name: 'Coffee bar', cost: 2500, note: 'Raises comfort.' },
  sofa: { name: 'Sofa', cost: 1800, note: 'Raises comfort.' },
  plant: { name: 'Plant', cost: 300, note: 'Raises comfort a little.' },
  wall: { name: 'Partition', cost: 250, note: 'Decoration only. Divides the floor.' },
}
const COMFORT: Partial<Record<OfficeItemKind, number>> = { meeting: 2.5, coffee: 2, sofa: 1.5, plant: 0.6 }

export const OFFICE_TIERS = [
  { name: 'Garage', w: 8, h: 6, cost: 0 },
  { name: 'Studio', w: 12, h: 8, cost: 150e3 },
  { name: 'Office floor', w: 16, h: 10, cost: 600e3 },
  { name: 'Headquarters', w: 20, h: 14, cost: 2.5e6 },
  { name: 'Campus', w: 26, h: 18, cost: 10e6 },
]
/** Monthly rent per floor tile. */
export const RENT_PER_TILE = 60

export function defaultOffice(): Office {
  return {
    tier: 0,
    w: OFFICE_TIERS[0].w,
    h: OFFICE_TIERS[0].h,
    items: [
      { id: 'o1', kind: 'desk', x: 2, y: 2, rot: 0 },
      { id: 'o2', kind: 'desk', x: 4, y: 2, rot: 0 },
      { id: 'o3', kind: 'plant', x: 0, y: 0, rot: 0 },
    ],
  }
}

const FIRST = ['Aiko', 'Mateo', 'Priya', 'Jonas', 'Lena', 'Omar', 'Sofia', 'Kenji', 'Amara', 'Lucas', 'Ines', 'Dmitri', 'Nia', 'Felix', 'Yara', 'Tomas', 'Mei', 'Ravi', 'Elsa', 'Kofi', 'Hana', 'Marco', 'Zoe', 'Idris']
const LAST = ['Tanaka', 'Silva', 'Nair', 'Berg', 'Novak', 'Haddad', 'Rossi', 'Okafor', 'Lind', 'Moreau', 'Petrov', 'Kim', 'Alvarez', 'Schmidt', 'Okada', 'Mbeki', 'Costa', 'Ivanova', 'Park', 'Dubois', 'Khan', 'Larsen', 'Reyes', 'Wu']
const ROLE_LIST: Role[] = ['engineer', 'designer', 'researcher', 'marketer']

export const salaryFor = (skill: number) => Math.round((2500 + Math.pow(skill, 1.6) * 9) / 50) * 50

export function makeCandidate(s: GameState): Employee {
  // most applicants are average; a few are excellent
  const skill = Math.round(20 + 65 * Math.pow(range(s, 0, 1), 1.5) + range(s, 0, 10))
  return { id: `e${s.nextId++}`, name: `${pick(s, FIRST)} ${pick(s, LAST)}`, role: pick(s, ROLE_LIST), skill, salary: Math.round((salaryFor(skill) * range(s, 0.9, 1.15)) / 50) * 50, hiredDay: 0, look: int(s, 0, 9999) }
}

export function refreshCandidates(s: GameState) {
  s.candidates = Array.from({ length: 8 }, () => makeCandidate(s))
}

export interface Effects {
  /** Multiplier on research progress. */
  research: number
  /** Multiplier on development days (below 1 is faster). */
  devTime: number
  /** Multiplier on awareness gained from sales. */
  marketing: number
  /** Fraction added to the design score at release. */
  polish: number
  comfort: number
  desks: number
  seated: number
  idle: number
}

export const countItems = (o: Office, kind: OfficeItemKind) => o.items.filter((i) => i.kind === kind).length

/** Employees who have a desk, in hiring order. */
export function seatedStaff(s: GameState): Employee[] {
  return s.staff.slice(0, countItems(s.office, 'desk'))
}

export function staffEffects(s: GameState): Effects {
  const desks = countItems(s.office, 'desk')
  const seated = seatedStaff(s)
  const comfortPoints = s.office.items.reduce((a, i) => a + (COMFORT[i.kind] ?? 0), 0)
  const comfort = seated.length ? Math.min(1, comfortPoints / (seated.length * 1.2 + 1)) : 0
  const productivity = 0.85 + 0.3 * comfort
  const power = (role: Role) => seated.filter((e) => e.role === role).reduce((a, e) => a + (e.skill / 50) * productivity, 0)
  const headcount = (role: Role) => seated.filter((e) => e.role === role).length
  return {
    research: 1 + 0.15 * power('researcher') + 0.05 * Math.min(countItems(s.office, 'bench'), headcount('researcher')),
    devTime: 1 / (1 + 0.12 * power('engineer') + 0.04 * Math.min(countItems(s.office, 'server'), headcount('engineer'))),
    marketing: 1 + 0.15 * power('marketer'),
    polish: Math.min(0.12, 0.02 * power('designer')),
    comfort,
    desks,
    seated: seated.length,
    idle: s.staff.length - seated.length,
  }
}

export const monthlySalaries = (s: GameState) => s.staff.reduce((a, e) => a + e.salary, 0)
export const monthlyRent = (o: Office) => o.w * o.h * RENT_PER_TILE
