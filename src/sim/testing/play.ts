// A game being played by a bot through the real action API, with everything
// it does counted and checked. Mirrors what the store does round each action
// (components call `act`, which runs the action and then stepProgress).
import { type GameConfig, type GameState } from '../types'
import { newGame, tick } from '../game'
import { stepProgress } from '../progress'
import { type RngHolder, rand } from '../rng'
import { checkState } from './invariants'

export interface Finding {
  rule: string
  detail: string
  /** What was being played when it was first seen. */
  where: string
  /** The last things the bot did before it. */
  trail: string[]
  count: number
}

export interface Tally {
  actions: number
  rejected: number
  threw: number
  days: number
  byAction: Record<string, { ok: number; no: number }>
  /** Every distinct refusal text seen, with how often and which action gave it. */
  refusals: Record<string, number>
}

export const newTally = (): Tally => ({ actions: 0, rejected: 0, threw: 0, days: 0, byAction: {}, refusals: {} })

const brief = (v: unknown): string => {
  try {
    const t = JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x === undefined ? '∅' : typeof x === 'object' && x !== null && 'design' in x ? '{order}' : x))
    return t === undefined ? String(v) : t.length > 160 ? t.slice(0, 160) + '…' : t
  } catch {
    return String(v)
  }
}

/** Collapses the numbers and ids in a message so that the same fault found a thousand times is one finding. */
export const ruleKey = (text: string) => text.replace(/-?\d+(\.\d+)?(e[+-]?\d+)?/g, '#').replace(/\b[a-z]#\b/g, 'id').slice(0, 140)

export class Play {
  s: GameState
  /** The bot's own dice, apart from the game's. */
  dice: RngHolder
  tally = newTally()
  findings = new Map<string, Finding>()
  trail: string[] = []
  label: string
  /** Check everything after each action instead of only every few days. Slow; for hunting. */
  strict = false
  /** Called before each action when tracing a hang. */
  trace?: (line: string) => void
  /** Cash that moved outside the books on purpose. */
  offBooks = 0
  /** Counts the devices the bot has named. */
  serial = 0
  /** Time spent inside tick, in milliseconds. */
  tickMs = 0

  constructor(cfg: GameConfig, label: string, botSeed = cfg.seed) {
    this.label = label
    this.dice = { rng: (botSeed * 2654435761) | 0 }
    this.s = newGame(cfg)
  }

  rnd = () => rand(this.dice)
  int = (lo: number, hi: number) => lo + Math.floor(this.rnd() * (hi - lo + 1))
  pick = <T,>(list: readonly T[]): T => list[Math.floor(this.rnd() * list.length)]
  chance = (p: number) => this.rnd() < p

  flag(text: string) {
    const i = text.indexOf(': ')
    const rule = i > 0 ? text.slice(0, i) : text
    const key = ruleKey(text)
    const f = this.findings.get(key)
    if (f) f.count++
    else this.findings.set(key, { rule, detail: text, where: `${this.label} day ${this.s.day}`, trail: this.trail.slice(-12), count: 1 })
  }

  check(light = false) {
    let found: string[]
    try {
      found = checkState(this.s, { light, offBooks: this.offBooks })
    } catch (e) {
      found = [`check-threw: ${String((e as Error)?.stack ?? e).slice(0, 400)}`]
    }
    for (const f of found) this.flag(f)
    return found.length
  }

  /**
   * Do one thing. An action that answers with a string has refused; one that
   * throws is a bug. Returns what the action returned (undefined if it threw).
   */
  act<T>(name: string, fn: (s: GameState) => T, ...args: unknown[]): T | undefined {
    const line = `${name}(${args.map(brief).join(', ')})`
    this.trace?.(line)
    this.trail.push(`d${this.s.day} ${line}`)
    if (this.trail.length > 40) this.trail.splice(0, 20)
    const row = (this.tally.byAction[name] ??= { ok: 0, no: 0 })
    this.tally.actions++
    let out: T | undefined
    try {
      out = fn(this.s)
      stepProgress(this.s)
    } catch (e) {
      this.tally.threw++
      row.no++
      this.flag(`threw: ${name}: ${String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ').slice(0, 400)}`)
      return undefined
    }
    const refusal = typeof out === 'string' && name !== 'createTeam' ? out : out && typeof out === 'object' && 'error' in out && typeof (out as { error: unknown }).error === 'string' && !(out as { done?: number }).done ? ((out as { error: string }).error) : null
    if (refusal !== null) {
      this.tally.rejected++
      row.no++
      const key = `${name}: ${ruleKey(refusal)}`
      this.tally.refusals[key] = (this.tally.refusals[key] ?? 0) + 1
      if (!refusal.trim()) this.flag(`empty-refusal: ${name} refused without saying why`)
    } else row.ok++
    if (this.strict && this.check(false)) this.strict = false
    return out
  }

  /** Let time pass, a day at a time when asked to check daily. */
  run(days: number, checkEvery = 30) {
    let left = Math.max(0, Math.floor(days))
    while (left > 0 && !this.s.gameOver) {
      const step = Math.min(left, checkEvery - (this.s.day % checkEvery) || checkEvery)
      const d0 = this.s.day
      const t0 = performance.now()
      try {
        tick(this.s, step)
      } catch (e) {
        this.flag(`threw: tick: ${String((e as Error)?.stack ?? e).split('\n').slice(0, 5).join(' | ').slice(0, 500)}`)
        // a tick that throws leaves the day half done: nothing after it can be trusted
        this.s.gameOver = true
        this.s.overReason = this.s.overReason ?? 'bankrupt'
        this.crashed = true
        return
      }
      this.tickMs += performance.now() - t0
      this.tally.days += this.s.day - d0
      left -= step
      if (this.s.day % checkEvery === 0) this.check(false)
    }
  }
  crashed = false
}
