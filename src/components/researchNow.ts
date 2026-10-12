// What the company is researching right now, and how long it will take.
// One place, so the Research screen, the lab benches on the campus and the
// Research park in the city all say the same numbers. Pure functions of the
// game state: no React, no store.
import { DAYS_PER_MONTH, MAX_LEVEL, TRACK_INFO, featureInfo } from '../data/catalog'
import { researchItem } from '../sim/game'
import { staffEffects } from '../sim/staff'
import type { GameState, Track } from '../sim/types'
import { int } from './format'

/** A length of time in the words a player counts in: days up to two months, then months, then years. */
export function timeSpan(days: number): string {
  if (days < 60) return `${int(days)} ${days === 1 ? 'day' : 'days'}`
  const months = Math.round(days / 30)
  if (months < 48) return `${int(months)} months`
  return `${int(Math.round(days / 360))} years`
}

export interface RunningResearch {
  /** The research id: a track name (that track's next level) or 'f:' + a feature id. */
  id: string
  /** "Display level 5: MicroLED panel", or the name of a feature. */
  name: string
  /** How far along it is, from 0 to 1. */
  progress: number
  /** Days until it is finished at today's budget, or null while nothing is being spent on it. */
  daysLeft: number | null
}

/** What a research project is called, everywhere it is named. */
export function researchName(g: GameState, id: string): string {
  if (id.startsWith('f:')) return featureInfo(id.slice(2))?.name ?? id
  const t = id as Track
  const next = Math.min(MAX_LEVEL, g.levels[t] + 1)
  return `${TRACK_INFO[t].name} level ${next}: ${TRACK_INFO[t].unlocks[next]}`
}

/**
 * Money that reaches each project in a day: the monthly budget, spread over
 * the month, lifted by the research staff, split evenly between the projects.
 * The same sum the simulation does each day (`stepResearch`).
 */
export function researchPerDay(g: GameState, budget = g.rdBudget, projects = g.activeResearch.length): number {
  if (budget <= 0 || projects <= 0) return 0
  return ((budget / DAYS_PER_MONTH) * g.config.researchSpeed * staffEffects(g).research) / projects
}

/** What is still to pay on a project. Nothing when it is already owned. */
export function researchLeft(g: GameState, id: string): number {
  const item = researchItem(g, id)
  return item.done ? 0 : Math.max(0, item.cost - (g.progress[id] ?? 0))
}

/**
 * Days until a project is finished at a given budget shared between a given
 * number of projects (today's budget and today's projects when left out).
 * Null when nothing would be spent on it.
 */
export function researchDays(g: GameState, id: string, budget = g.rdBudget, projects = g.activeResearch.length): number | null {
  const each = researchPerDay(g, budget, projects)
  if (each <= 0) return null
  return Math.max(1, Math.ceil(researchLeft(g, id) / each))
}

/** The monthly budget that finishes a project in a given number of days, shared between a number of projects. */
export function researchBudgetFor(g: GameState, id: string, days: number, projects = Math.max(1, g.activeResearch.length)): number {
  const lift = g.config.researchSpeed * staffEffects(g).research
  if (days <= 0 || lift <= 0) return 0
  return ((researchLeft(g, id) / days) * DAYS_PER_MONTH * projects) / lift
}

/** The projects being researched now, in the order they were started. */
export function runningResearch(g: GameState): RunningResearch[] {
  return g.activeResearch.map((id) => {
    const item = researchItem(g, id)
    return {
      id,
      name: researchName(g, id),
      progress: item.cost > 0 ? Math.max(0, Math.min(1, (g.progress[id] ?? 0) / item.cost)) : 0,
      daysLeft: researchDays(g, id),
    }
  })
}
