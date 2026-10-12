// Plays one game from a recipe and reports what happened: what broke, how
// the company did, how big the save grew and how long a day took to simulate.
import { DIFFICULTY, defaultConfig, migrate } from '../game'
import { CAPS } from '../progress'
import { valuation } from '../stock'
import { DEVICE_TYPES, type DeviceType, type Difficulty, type GameConfig } from '../types'
import { adversary, builder, financier, monkey } from './chaos'
import { PERSONAS, type Persona } from './personas'
import { type Finding, Play, type Tally } from './play'

export const ALL_PERSONAS: Record<string, () => Persona> = {
  ...PERSONAS,
  builder,
  monkey: () => monkey(0.25, 'monkey'),
  tameMonkey: () => monkey(0, 'tameMonkey', 3),
  adversary,
  financier,
}
export const PERSONA_NAMES = Object.keys(ALL_PERSONAS)

export interface RunSpec {
  id: number
  persona: string
  years: number
  cfg: GameConfig
  /** Save, load and carry on after this many months, and again every so often: the result must not change. */
  reloadEvery?: number
  /** Check every rule after every action, not only every few days. */
  strict?: boolean
}

export interface RunResult {
  id: number
  persona: string
  label: string
  years: number
  daysPlayed: number
  over?: { day: number; reason: string }
  crashed: boolean
  /** Cash at the end of years 1, 5, 10, 30 and at the end. */
  cash: Record<string, number>
  value: number
  units: number
  staff: number
  products: number
  rivalsAlive: number
  /** Share of the last full month's units taken by the player and by the biggest rival. */
  playerShare: number
  topRivalShare: number
  unlocks: Record<string, number>
  goals: number
  maxCash: number
  jsonBytes: number
  /** Milliseconds per simulated day in the first year, around year 50 and around year 100. */
  msPerDay: Record<string, number>
  wallMs: number
  hash: string
  tally: Tally
  findings: Finding[]
}

export const labelOf = (spec: RunSpec) => {
  const c = spec.cfg
  return `#${spec.id} ${spec.persona} ${c.startType ?? 'all'} ${c.difficulty} ${c.progression ?? 'open'}${c.unlimitedMoney ? ' unlimited' : ''}${c.parody ? ' parody' : ''} home=${c.home ?? 'na'} cash=${c.startCash} rs=${c.researchSpeed} rv=${c.rivalStrength} tl=${c.techLevel} seed=${c.seed} ${spec.years}y`
}

/** A state as text with its keys in order: a save that has been loaded lists them in another order, and is still the same save. */
export const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x))

export function hashOf(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0).toString(16)
}

export function runGame(spec: RunSpec, trace?: (line: string) => void): RunResult {
  const started = performance.now()
  const persona = ALL_PERSONAS[spec.persona]()
  const p = new Play(spec.cfg, labelOf(spec), spec.cfg.seed + spec.id * 31)
  p.strict = !!spec.strict
  p.trace = trace
  const cash: Record<string, number> = {}
  const ms: Record<string, number> = {}
  const msDays: Record<string, number> = {}
  let maxCash = p.s.cash
  p.check()
  persona.setup?.(p)
  p.check()
  const months = spec.years * 12
  for (let m = 0; m < months && !p.crashed; m++) {
    if (p.s.gameOver && spec.persona !== 'adversary') break
    const t0 = p.tickMs
    const d0 = p.s.day
    if (persona.day) {
      for (let d = 0; d < 30 && !p.s.gameOver; d++) {
        p.run(1, 5)
        persona.day(p)
      }
    } else p.run(30, 30)
    const year = Math.floor(m / 12)
    if (year === 0 || year === 49 || year === 99) {
      ms[`y${year + 1}`] = (ms[`y${year + 1}`] ?? 0) + p.tickMs - t0
      msDays[`y${year + 1}`] = (msDays[`y${year + 1}`] ?? 0) + p.s.day - d0
    }
    persona.month(p, m)
    p.check(true)
    maxCash = Math.max(maxCash, p.s.cash)
    if ([12, 60, 120, 360].includes(m + 1)) cash[`y${(m + 1) / 12}`] = p.s.cash
    if (spec.reloadEvery && (m + 1) % spec.reloadEvery === 0) {
      try {
        p.s = migrate(JSON.parse(JSON.stringify(p.s)))
      } catch (e) {
        p.flag(`threw: reload: ${String((e as Error)?.stack ?? e).slice(0, 300)}`)
      }
    }
    if (spec.persona === 'adversary' && p.s.gameOver && m > months - 2) break
  }
  p.check()
  const s = p.s
  const json = JSON.stringify(s)
  const month = s.shareHistory[s.shareHistory.length - 1]
  const total = month ? Object.values(month.units).reduce((a, b) => a + b, 0) : 0
  const rivalTop = month ? Math.max(0, ...Object.entries(month.units).filter(([id]) => id !== 'player').map(([, v]) => v)) : 0
  cash.end = s.cash
  for (const k of Object.keys(ms)) ms[k] = ms[k] / Math.max(1, msDays[k])
  return {
    id: spec.id,
    persona: spec.persona,
    label: p.label,
    years: spec.years,
    daysPlayed: s.day,
    over: s.gameOver && !p.crashed ? { day: s.day, reason: s.overReason ?? '?' } : undefined,
    crashed: p.crashed,
    cash,
    value: valuation(s),
    units: s.companies[0].unitsTotal,
    staff: s.staff.length,
    products: s.products.length,
    rivalsAlive: s.companies.filter((c) => !c.isPlayer && c.alive).length,
    playerShare: total ? (month.units.player ?? 0) / total : 0,
    topRivalShare: total ? rivalTop / total : 0,
    unlocks: { ...s.unlocks },
    goals: Object.keys(s.goals).length,
    maxCash,
    jsonBytes: json.length,
    msPerDay: ms,
    wallMs: performance.now() - started,
    hash: hashOf(canon(s)),
    tally: p.tally,
    findings: [...p.findings.values()],
  }
}

// ---------------------------------------------------------------- recipes

const STARTS: (DeviceType | 'all')[] = [...DEVICE_TYPES, 'all']
const DIFFS: Difficulty[] = ['normal', 'relaxed', 'tough']
const PROGS = ['guided', 'open'] as const
const HOMES = ['na', 'eu', 'ea', 'sa', 'la', 'me']

const mix = (i: number, salt: number) => {
  let h = Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 7, 40503)
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function configFor(i: number, start: DeviceType | 'all', difficulty: Difficulty, progression: 'guided' | 'open', plain = false): GameConfig {
  const cfg: GameConfig = { ...defaultConfig(), difficulty, startCash: DIFFICULTY[difficulty].startCash, seed: 1 + i * 7919, startType: start, progression, home: HOMES[i % HOMES.length], parody: mix(i, 1) < 0.5 }
  if (plain) return cfg
  if (mix(i, 2) < 0.18) cfg.unlimitedMoney = true
  // the sandbox sliders, at their stops
  if (mix(i, 3) < 0.3) {
    cfg.startCash = mix(i, 4) < 0.5 ? 1e6 : 1e9
    cfg.researchSpeed = mix(i, 5) < 0.5 ? 0.5 : 4
    cfg.rivalStrength = mix(i, 6) < 0.5 ? 0.5 : 1.5
    cfg.techLevel = mix(i, 7) < 0.5 ? 0 : 4
  }
  return cfg
}

/** The main soak: every start, difficulty, kind of progression and persona, once round, then again with other seeds. */
export function planSoak(count: number, yearsCap = 1000): RunSpec[] {
  const out: RunSpec[] = []
  for (let i = 0; i < count; i++) {
    const persona = PERSONA_NAMES[i % PERSONA_NAMES.length]
    const start = STARTS[Math.floor(i / PERSONA_NAMES.length) % STARTS.length]
    const difficulty = DIFFS[Math.floor(i / (PERSONA_NAMES.length * STARTS.length)) % DIFFS.length]
    const progression = PROGS[Math.floor(i / (PERSONA_NAMES.length * STARTS.length * DIFFS.length)) % PROGS.length]
    const roll = mix(i, 8)
    const years = Math.min(yearsCap, roll < 0.15 ? 1 : roll < 0.6 ? 10 : roll < 0.9 ? 30 : 100 + Math.floor(mix(i, 9) * 30))
    const spec: RunSpec = { id: i, persona, years, cfg: configFor(i, start, difficulty, progression) }
    // long games must keep running whatever the persona does, or they would never see year 100
    if (years >= 100) spec.cfg.unlimitedMoney = mix(i, 10) < 0.7 || spec.cfg.unlimitedMoney
    if (mix(i, 11) < 0.25) spec.reloadEvery = 1 + Math.floor(mix(i, 12) * 17)
    out.push(spec)
  }
  return out
}

/** The economy study: the sensible builder on every start and difficulty, several seeds each, thirty years. */
export function planEconomy(seeds: number, years = 30, persona = 'sensible'): RunSpec[] {
  const out: RunSpec[] = []
  let i = 0
  for (const progression of PROGS) for (const difficulty of DIFFS) for (const start of STARTS) for (let k = 0; k < seeds; k++) out.push({ id: i, persona, years, cfg: { ...configFor(1000 + k * 13 + i++, start, difficulty, progression, true), home: HOMES[k % HOMES.length] } })
  return out
}

export const ALL_CAPS = CAPS.map((c) => c.id)

/** Where two values first differ, as a path, or null if they are the same. */
export function firstDiff(a: unknown, b: unknown, path = 's'): string | null {
  if (a === b) return null
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return `${path}: ${JSON.stringify(a)?.slice(0, 80)} against ${JSON.stringify(b)?.slice(0, 80)}`
  for (const k of new Set([...Object.keys(a as object), ...Object.keys(b as object)])) {
    const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`)
    if (d) return d
  }
  return null
}

/** Plays a recipe twice in step, one of them saving and loading as the recipe says, and reports the first month and place they part. */
export function diffReload(spec: RunSpec): string {
  const make = () => ({ persona: ALL_PERSONAS[spec.persona](), p: new Play(spec.cfg, labelOf(spec), spec.cfg.seed + spec.id * 31) })
  const a = make()
  const b = make()
  for (const x of [a, b]) x.persona.setup?.(x.p)
  for (let m = 0; m < spec.years * 12; m++) {
    for (const x of [a, b]) {
      if (x.persona.day) {
        for (let d = 0; d < 30 && !x.p.s.gameOver; d++) {
          x.p.run(1, 5)
          x.persona.day(x.p)
        }
      } else x.p.run(30, 30)
      x.persona.month(x.p, m)
    }
    const d0 = firstDiff(JSON.parse(JSON.stringify(a.p.s)), JSON.parse(JSON.stringify(b.p.s)))
    if (d0) return `month ${m}, before any reload this month: ${d0}\n  a: ${a.p.trail.slice(-8).join('\n     ')}\n  b: ${b.p.trail.slice(-8).join('\n     ')}`
    if (spec.reloadEvery && (m + 1) % spec.reloadEvery === 0) {
      b.p.s = migrate(JSON.parse(JSON.stringify(b.p.s)))
      const d1 = firstDiff(JSON.parse(JSON.stringify(a.p.s)), JSON.parse(JSON.stringify(b.p.s)))
      if (d1) return `month ${m}, the reload itself changed the state: ${d1}`
    }
  }
  return 'no difference'
}
