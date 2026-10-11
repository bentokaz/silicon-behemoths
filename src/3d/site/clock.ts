// The time of day on site. A game day passes in a second, far too fast for
// anyone to walk to lunch in, so the buildings keep a slower clock of their
// own that runs with the game's speed and stops when the game is paused.
// It is never saved: it only decides who is where in the 3D views.
import type { Mood } from './env'

/** Real seconds for one working hour at normal speed. */
const SECONDS_PER_HOUR = 45
/** Nights pass this much faster, so the campus is not left empty for long. */
const NIGHT_RUSH = 14
/** How fast the clock runs, and how briskly people move, at each game speed. */
const RATE: Record<number, { clock: number; move: number }> = { 0: { clock: 0, move: 1 }, 1: { clock: 1, move: 1 }, 2: { clock: 1.7, move: 1.45 }, 4: { clock: 2.6, move: 2 } }

export const campus = {
  /** Hours since the first midnight; the hour of the day is this modulo 24. */
  t: 8.4,
}

export const hourOf = (t: number) => ((t % 24) + 24) % 24
export const dayOf = (t: number) => Math.floor(t / 24)
export const isNight = (hour: number) => hour >= 20.5 || hour < 6.5

/** Moves the clock on by `dt` real seconds. Returns how much faster than usual people should move. */
export function advanceClock(dt: number, speed: number): number {
  const rate = RATE[speed] ?? RATE[1]
  if (rate.clock > 0) campus.t += (dt / SECONDS_PER_HOUR) * rate.clock * (isNight(hourOf(campus.t)) ? NIGHT_RUSH : 1)
  return rate.move
}

/** The light that goes with an hour of the day. */
export function moodAt(hour: number): Mood {
  if (hour >= 7.2 && hour < 17.6) return 'day'
  if ((hour >= 6.2 && hour < 7.2) || (hour >= 17.6 && hour < 19.4)) return 'dusk'
  return 'night'
}

/** 14.5 becomes "14:30". */
export function clockText(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.floor((hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m - (m % 5)).padStart(2, '0')}`
}
