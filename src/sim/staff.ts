// People: who can be hired, how they feel, and what the ones at their desks
// contribute to research, development, marketing, software and support.
import { ITEMS, reachable, sitePrestige, sumOf } from './sites'
import { type RngHolder, clamp, int, pick, rand, range } from './rng'
import { EXEC_IDS, type Employee, type ExecId, type GameState, ROLES, type Role, type StaffPolicy, type Team } from './types'

export const ROLE_INFO: Record<Role, { name: string; effect: string; color: string }> = {
  engineer: { name: 'Hardware engineer', effect: 'Shortens device and chip development', color: '#4f8fd6' },
  software: { name: 'Software engineer', effect: 'Builds your operating system', color: '#8f7ad6' },
  designer: { name: 'Designer', effect: 'Adds polish to the design score at release', color: '#d6a24f' },
  researcher: { name: 'Researcher', effect: 'Speeds up research', color: '#58b98a' },
  marketer: { name: 'Marketer', effect: 'Grows awareness faster and lifts events', color: '#d65f7c' },
  support: { name: 'Support agent', effect: 'Answers owners, keeping satisfaction up', color: '#5fb8c9' },
}

export const TRAITS: Record<string, { name: string; note: string }> = {
  fast: { name: 'Fast learner', note: 'Gains skill twice as quickly.' },
  perfectionist: { name: 'Perfectionist', note: 'Contributes 25% more.' },
  ambitious: { name: 'Ambitious', note: 'Contributes 15% more, asks for raises sooner.' },
  star: { name: 'Star', note: 'Contributes 35% more, but lowers team morale.' },
  social: { name: 'Team player', note: 'Lifts everyone’s morale a little.' },
  loyal: { name: 'Loyal', note: 'Will not quit, even when unhappy.' },
  frugal: { name: 'Modest', note: 'Happy with 10% less pay than the market.' },
  steady: { name: 'Unflappable', note: 'Not bothered by crunch.' },
}
const TRAIT_OUTPUT: Record<string, number> = { perfectionist: 1.25, ambitious: 1.15, star: 1.35 }

const FIRST = ['Aiko', 'Mateo', 'Priya', 'Jonas', 'Lena', 'Omar', 'Sofia', 'Kenji', 'Amara', 'Lucas', 'Ines', 'Dmitri', 'Nia', 'Felix', 'Yara', 'Tomas', 'Mei', 'Ravi', 'Elsa', 'Kofi', 'Hana', 'Marco', 'Zoe', 'Idris', 'Noor', 'Pablo', 'Greta', 'Tariq', 'Ana', 'Sven']
const LAST = ['Tanaka', 'Silva', 'Nair', 'Berg', 'Novak', 'Haddad', 'Rossi', 'Okafor', 'Lind', 'Moreau', 'Petrov', 'Kim', 'Alvarez', 'Schmidt', 'Okada', 'Mbeki', 'Costa', 'Ivanova', 'Park', 'Dubois', 'Khan', 'Larsen', 'Reyes', 'Wu', 'Osei', 'Fontaine', 'Yilmaz', 'Brandt', 'Sato', 'Mendes']
const ROLE_LIST: Role[] = ['engineer', 'software', 'designer', 'researcher', 'marketer', 'support']

/** What the market pays per month for a given skill. */
export const salaryFor = (skill: number) => Math.round((2500 + Math.pow(skill, 1.6) * 9) / 50) * 50
export const titleFor = (skill: number) => (skill >= 80 ? 'Principal' : skill >= 60 ? 'Senior' : skill >= 40 ? '' : 'Junior')
export const trainingCost = (e: Employee) => 3000 + Math.round(e.skill) * 120
export const HEADHUNT_COST = 40e3

export function makeCandidate(s: GameState, boost = 0): Employee {
  // most applicants are average; a few are excellent. A well-known, impressive company attracts better ones.
  const draw = prestige(s) * 0.5 + (s.companies[0]?.awareness ?? 0) * 10
  const skill = clamp(Math.round(18 + 62 * Math.pow(range(s, 0, 1), 1.5) + range(s, 0, 10) + Math.min(15, draw) + boost), 10, 97)
  const traits: string[] = []
  const pool = Object.keys(TRAITS)
  const count = rand(s) < 0.35 ? 2 : rand(s) < 0.8 ? 1 : 0
  while (traits.length < count) {
    const t = pick(s, pool)
    if (!traits.includes(t)) traits.push(t)
  }
  const market = salaryFor(skill) * (traits.includes('frugal') ? 0.9 : 1) * (traits.includes('star') ? 1.15 : 1)
  return {
    id: `e${s.nextId++}`,
    name: `${pick(s, FIRST)} ${pick(s, LAST)}`,
    role: pick(s, ROLE_LIST),
    skill,
    potential: Math.min(100, skill + int(s, 8, 30)),
    salary: Math.round((market * range(s, 0.92, 1.12)) / 50) * 50,
    hiredDay: 0,
    look: int(s, 0, 9999),
    morale: 70,
    traits,
    lowDays: 0,
  }
}

export function refreshCandidates(s: GameState, boost = 0) {
  s.candidates = Array.from({ length: 9 }, () => makeCandidate(s, boost))
  // a guided company opens screens by hiring its first researcher, marketer and so on,
  // so every batch has at least one of each job: nobody waits months for the dice
  if (s.config.progression !== 'guided') return
  for (const role of ROLES) {
    if (s.candidates.some((e) => e.role === role)) continue
    const spare = s.candidates.filter((e) => s.candidates.filter((x) => x.role === e.role).length > 1).sort((a, b) => a.skill - b.skill)[0]
    if (spare) spare.role = role
  }
}

// ---------------------------------------------------------------- executives
// A handful of seats at the top. Whoever holds one is an ordinary employee
// (a desk, morale, raises, rivals who want them) with `exec` set. They do no
// line work; each lends the whole company a modest lift in their own field,
// and leaves a gap when they go.

export interface ExecDef {
  title: string
  short: string
  /** The kind of desk they keep, and how they dress. */
  role: Role
  color: string
  /** What the seat does for the company, in a sentence. */
  effect: string
  /** What an empty seat costs, once it has been filled before. */
  gap: string
}
export const EXECS: Record<ExecId, ExecDef> = {
  cfo: { title: 'Chief Financial Officer', short: 'CFO', role: 'support', color: '#c9a25a', effect: 'Keeps the books: overheads fall by up to 10%.', gap: 'Overheads run 5% higher.' },
  cmo: { title: 'Head of Marketing', short: 'CMO', role: 'marketer', color: '#d65f7c', effect: 'Sharpens every message: awareness grows up to 15% faster.', gap: 'Awareness grows 8% slower.' },
  people: { title: 'Head of People', short: 'HR', role: 'support', color: '#8fc66a', effect: 'Looks after the staff: everyone’s morale settles up to 8 points higher.', gap: 'Morale settles 4 points lower.' },
  coo: { title: 'Head of Operations', short: 'COO', role: 'engineer', color: '#e08a3a', effect: 'Leans on suppliers: building devices costs up to 5% less.', gap: 'Building devices costs 2% more.' },
  sales: { title: 'Head of Sales', short: 'CSO', role: 'marketer', color: '#5a9bd4', effect: 'Runs the shops and the offices abroad: they cost up to 15% less to run.', gap: 'Stores and offices abroad cost 8% more to run.' },
  care: { title: 'Head of Support', short: 'CCO', role: 'support', color: '#5fb8c9', effect: 'Organises the help desk: it answers up to 40% more tickets.', gap: 'The help desk answers 15% fewer tickets.' },
  cto: { title: 'Chief Technology Officer', short: 'CTO', role: 'researcher', color: '#58b98a', effect: 'Points the labs the right way: research runs up to 15% faster.', gap: 'Research runs 8% slower.' },
}
/** An executive costs this many times the going rate for their skill. */
export const EXEC_PAY = 2
/** The job title to show for anyone: an executive's seat, or the ordinary role. */
export const jobTitle = (e: Pick<Employee, 'role' | 'exec'>) => (e.exec ? EXECS[e.exec].title : ROLE_INFO[e.role].name)
export const execOf = (s: GameState, id: ExecId) => s.staff.find((e) => e.exec === id)
/** What the market pays this person: executives command a multiple; modest people accept a little less. */
export const marketPay = (e: Pick<Employee, 'skill' | 'traits' | 'exec'>) => salaryFor(e.skill) * (e.exec ? EXEC_PAY : 1) * (e.traits.includes('frugal') ? 0.9 : 1)

/**
 * Someone who would take an executive seat. Drawn from a stream of its own
 * (`n` tells candidates of one month apart), so the main dice are untouched.
 */
export function makeExec(s: GameState, id: ExecId, n: number): Employee {
  const dice: RngHolder = { rng: (s.config.seed * 7919 + Math.floor(s.day / 30) * 104729 + EXEC_IDS.indexOf(id) * 1299709 + n * 15485863) | 0 }
  const skill = clamp(Math.round(50 + 38 * Math.pow(rand(dice), 1.4) + Math.min(8, prestige(s) * 0.25)), 45, 96)
  const traits: string[] = []
  const pool = Object.keys(TRAITS)
  if (rand(dice) < 0.6) traits.push(pick(dice, pool))
  const person: Employee = { id: `x${s.day}-${id}-${n}`, name: `${pick(dice, FIRST)} ${pick(dice, LAST)}`, role: EXECS[id].role, exec: id, skill, potential: Math.min(100, skill + int(dice, 3, 10)), salary: 0, hiredDay: 0, look: int(dice, 0, 9999), morale: 72, traits, lowDays: 0 }
  person.salary = Math.round((marketPay(person) * range(dice, 0.95, 1.1)) / 100) * 100
  return person
}

export interface ExecFx {
  /** Multipliers on overheads, on the cost of building devices, and on running stores and overseas offices. */
  overhead: number
  production: number
  outposts: number
  /** Multipliers on awareness growth, research speed and support capacity. */
  marketing: number
  research: number
  support: number
  /** Points added to everyone's morale target. */
  morale: number
}
/**
 * What the executives add. A seat that was never filled does nothing; one that
 * is filled helps in proportion to its holder's skill and mood; one that was
 * filled and now stands empty costs a little until someone takes it again.
 */
export function execFx(s: GameState, seated?: Employee[]): ExecFx {
  const k = (id: ExecId): number => {
    const e = execOf(s, id)
    if (!e) return s.execSeats?.[id] ? -1 : 0
    if (inTraining(e, s.day) || !(seated ??= seatedStaff(s)).includes(e)) return 0
    return (e.skill / 100) * (0.6 + 0.4 * (e.morale / 100))
  }
  const mult = (id: ExecId, best: number, gap: number) => {
    const v = k(id)
    return v < 0 ? 1 + gap : 1 + best * v
  }
  const people = k('people')
  return { overhead: mult('cfo', -0.1, 0.05), production: mult('coo', -0.05, 0.02), outposts: mult('sales', -0.15, 0.08), marketing: mult('cmo', 0.15, -0.08), research: mult('cto', 0.15, -0.08), support: mult('care', 0.4, -0.15), morale: people < 0 ? -4 : 8 * people }
}
/** Executive desks the staff can reach: an executive with one of their own is happier. */
const execDesks = (s: GameState) => reachable(s.office).filter((i) => i.kind === 'exec').length

const seatCount = (s: GameState) => reachable(s.office).filter((i) => ITEMS.office[i.kind]?.seats).length
export const prestige = (s: GameState) => sitePrestige(s.office)

// ---------------------------------------------------------------- teams and policies

export const newPolicy = (): StaffPolicy => ({ hours: 'standard', perks: 0 })
export const HOURS: Record<StaffPolicy['hours'], { name: string; note: string; output: number; morale: number }> = {
  relaxed: { name: 'Four-day week', note: 'People are happier and get a little less done.', output: 0.92, morale: 8 },
  standard: { name: 'Standard hours', note: 'A normal working week.', output: 1, morale: 0 },
  crunch: { name: 'Crunch', note: 'Everyone works late. More gets done, and morale drains.', output: 1.15, morale: -14 },
}
export const PERKS = [
  { name: 'None', perHead: 0, morale: 0 },
  { name: 'Basics', perHead: 150, morale: 4 },
  { name: 'Generous', perHead: 400, morale: 8 },
  { name: 'Lavish', perHead: 900, morale: 13 },
]
/** A lead can properly look after this many people. */
export const TEAM_SPAN = 8
/** Above this headcount, people without a lead lose their way. */
export const UNMANAGED_AT = 8

export const teamOf = (s: GameState, employeeId: string) => s.teams.find((t) => t.members.includes(employeeId))
const leadOf = (s: GameState, t: Team) => (t.leadId ? s.staff.find((e) => e.id === t.leadId) : undefined)

/** Teams need somewhere to meet: one seat for every two members. Without it leads are half as effective. */
export function meetingFactor(s: GameState): number {
  const members = s.teams.reduce((a, t) => a + (t.leadId ? t.members.length : 0), 0)
  if (!members) return 1
  const seats = sumOf(s.office, 'meet', reachable(s.office))
  return Math.min(1, 0.5 + seats / members)
}

/** How much a team's lead lifts its members: 0 with no lead. */
export function teamBonus(s: GameState, t: Team, meetFactor = meetingFactor(s)): number {
  const lead = leadOf(s, t)
  if (!lead || inTraining(lead, s.day)) return 0
  const size = t.members.filter((id) => s.staff.some((e) => e.id === id)).length
  if (size < 2) return 0
  let bonus = 0.08 + 0.14 * (lead.skill / 100)
  if (lead.traits.includes('social')) bonus += 0.04
  if (lead.traits.includes('star')) bonus -= 0.04
  return bonus * Math.min(1, TEAM_SPAN / size) * meetFactor
}

/** Each employee's output multiplier from how they are managed. */
function management(s: GameState): Map<string, number> {
  const out = new Map<string, number>()
  const meet = meetingFactor(s)
  for (const t of s.teams) {
    const bonus = teamBonus(s, t, meet)
    if (bonus <= 0) continue
    for (const id of t.members) out.set(id, id === t.leadId ? 0.6 : 1 + bonus)
  }
  if (s.staff.length > UNMANAGED_AT) for (const e of s.staff) if (!out.has(e.id)) out.set(e.id, 0.9)
  return out
}
/** People with no working lead, once the company is big enough to need them. */
export function unmanaged(s: GameState): number {
  if (s.staff.length <= UNMANAGED_AT) return 0
  const m = management(s)
  return s.staff.filter((e) => m.get(e.id) === 0.9).length
}

/** Employees who have a desk, in hiring order. */
export function seatedStaff(s: GameState): Employee[] {
  return s.staff.slice(0, seatCount(s))
}
export const inTraining = (e: Employee, day: number) => e.trainingUntil !== undefined && e.trainingUntil > day

export interface Effects {
  /** Multiplier on research progress. */
  research: number
  /** Multiplier on development days (below 1 is faster). */
  devTime: number
  /** Multiplier on awareness gained from sales. */
  marketing: number
  /** Fraction added to the design score at release. */
  polish: number
  /** Combined strength of the software team. */
  software: number
  /** Combined strength of the hardware team, for chip projects. */
  hardware: number
  /** Support tickets the team can answer per day. */
  support: number
  comfort: number
  prestige: number
  morale: number
  seats: number
  seated: number
  idle: number
}

/** How much one employee contributes right now. 1.0 is an average, content person. */
export function output(e: Employee, boosted: boolean): number {
  let v = (e.skill / 50) * (0.6 + 0.5 * (e.morale / 100)) * (boosted ? 1.25 : 1)
  for (const t of e.traits) v *= TRAIT_OUTPUT[t] ?? 1
  return v
}

export function staffEffects(s: GameState): Effects {
  const seats = seatCount(s)
  const seated = seatedStaff(s)
  const working = seated.filter((e) => !inTraining(e, s.day))
  const items = reachable(s.office)
  const managed = management(s)
  const hours = HOURS[s.policy.hours].output
  const power = (role: Role) => {
    // the most skilled people of a role get its stations
    let stations = items.filter((i) => ITEMS.office[i.kind]?.station === role).length
    return working
      .filter((e) => e.role === role && !e.exec)
      .sort((a, b) => b.skill - a.skill)
      .reduce((sum, e) => sum + output(e, stations-- > 0) * (managed.get(e.id) ?? 1) * hours, 0)
  }
  const comfortPoints = sumOf(s.office, 'comfort', items)
  const top = execFx(s, seated)
  return {
    research: (1 + 0.15 * power('researcher')) * top.research,
    devTime: 1 / (1 + 0.12 * power('engineer')),
    marketing: (1 + 0.15 * power('marketer')) * top.marketing,
    polish: Math.min(0.12, 0.02 * power('designer')),
    software: power('software'),
    hardware: power('engineer'),
    support: power('support') * 120 * top.support,
    comfort: seated.length ? Math.min(1, comfortPoints / (seated.length * 1.1 + 2)) : Math.min(1, comfortPoints / 2),
    prestige: prestige(s),
    morale: s.staff.length ? s.staff.reduce((a, e) => a + e.morale, 0) / s.staff.length : 0,
    seats,
    seated: seated.length,
    idle: s.staff.length - seated.length,
  }
}

export const monthlySalaries = (s: GameState) => s.staff.reduce((a, e) => a + e.salary, 0)

export interface StaffNote {
  text: string
  alert?: boolean
}

/** Daily: morale drifts toward what conditions justify; courses finish; the miserable quit. */
export function stepStaff(s: GameState, crunch: boolean): StaffNote[] {
  if (!s.staff.length) return []
  const notes: StaffNote[] = []
  const fx = staffEffects(s)
  const seated = new Set(seatedStaff(s).map((e) => e.id))
  const mood = clamp(s.staff.reduce((a, e) => a + (e.traits.includes('social') ? 3 : 0) - (e.traits.includes('star') ? 4 : 0), 0), -12, 12)
  const top = execFx(s)
  const suites = s.staff.some((e) => e.exec) ? execDesks(s) : 0
  let execs = 0
  for (const e of [...s.staff]) {
    if (e.trainingUntil !== undefined && s.day >= e.trainingUntil) {
      const gain = Math.min(e.potential - e.skill, int(s, 4, 8) + (e.traits.includes('fast') ? 2 : 0))
      e.skill += Math.max(0, gain)
      e.trainingUntil = undefined
      notes.push({ text: `${e.name} finished a training course (+${Math.max(0, gain).toFixed(0)} skill).` })
    }
    const fair = e.salary / marketPay(e)
    let target = 50 + 28 * fx.comfort + (fair >= 1.1 ? 12 : fair >= 0.9 ? 0 : -20) + mood + PERKS[s.policy.perks].morale + top.morale
    // an executive wants an office: an executive desk of their own lifts them, a plain desk rankles a little
    if (e.exec) target += execs++ < suites ? 6 : -3
    target += e.traits.includes('steady') ? Math.max(-4, HOURS[s.policy.hours].morale) : HOURS[s.policy.hours].morale
    if (teamOf(s, e.id)?.leadId) target += 3
    if (crunch && !e.traits.includes('steady')) target -= 12
    if (e.ask) target -= 10
    if (!seated.has(e.id)) target -= 15
    if (e.traits.includes('loyal')) target += 5
    e.morale = clamp(e.morale + (clamp(target, 0, 100) - e.morale) * 0.03, 0, 100)
    e.lowDays = e.morale < 25 ? e.lowDays + 1 : 0
    if (e.lowDays > 45 && !e.traits.includes('loyal')) {
      s.staff = s.staff.filter((x) => x !== e)
      dropFromTeams(s, e.id)
      notes.push({ text: `${e.name} quit. Morale had been very low for weeks.`, alert: true })
    }
  }
  return notes
}

/** Monthly: people at desks learn, and anyone now underpaid asks for a raise. */
export function monthlyStaff(s: GameState): StaffNote[] {
  const notes: StaffNote[] = []
  for (const e of seatedStaff(s)) {
    if (!inTraining(e, s.day)) e.skill = Math.min(e.potential, e.skill + (e.traits.includes('fast') ? 0.5 : 0.25))
  }
  for (const e of s.staff) {
    if (e.ask) continue
    const market = marketPay(e)
    const gap = e.traits.includes('ambitious') ? 1.06 : 1.12
    if (market > e.salary * gap && s.day - e.hiredDay > 120 && s.day >= (e.raiseAfter ?? 0)) {
      e.ask = Math.round(market / 50) * 50
      notes.push({ text: `${e.name} is asking for a raise to $${e.ask.toLocaleString()} a month.` })
    }
  }
  return notes
}

/** Remove someone from every team, and from leading one. */
export function dropFromTeams(s: GameState, employeeId: string) {
  for (const t of s.teams) {
    t.members = t.members.filter((id) => id !== employeeId)
    if (t.leadId === employeeId) t.leadId = undefined
  }
}

/** Monthly cost of the perks policy. */
export const perksCost = (s: GameState) => s.staff.length * PERKS[s.policy.perks].perHead
