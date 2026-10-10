// Growth: advertising channels, the fan base, and events the company can host.
import { type SegmentInfo, segmentsOf } from '../data/devices'
import { DAYS_PER_YEAR } from '../data/catalog'
import { bestSegment } from './market'
import { clamp, rand } from './rng'
import { ITEMS } from './sites'
import { staffEffects } from './staff'
import type { Campaign, ChannelId, EventType, GameEvent, GameState, Product } from './types'

export interface ChannelDef {
  name: string
  note: string
  /** Smallest monthly budget the channel accepts. */
  min: number
  /** How well it builds company awareness. */
  reach: number
  /** How strongly each segment responds; anything not listed uses `other`. */
  segs: Record<string, number>
  other: number
}
export const CHANNELS: Record<ChannelId, ChannelDef> = {
  online: { name: 'Search and display ads', note: 'Cheap, measurable, works everywhere.', min: 20e3, reach: 1, segs: {}, other: 1 },
  social: { name: 'Creators and social', note: 'Strong with younger buyers and anything photogenic.', min: 30e3, reach: 0.8, segs: { gamer: 1.6, mainstream: 1.3, camera: 1.3, 'w-smart': 1.3, 'w-fit': 1.3, 't-main': 1.1 }, other: 0.8 },
  tv: { name: 'Television', note: 'Mass reach for mass-market products. Expensive to start.', min: 400e3, reach: 1.6, segs: { budget: 1.4, mainstream: 1.4, 't-budget': 1.3, 't-main': 1.3, 'l-budget': 1.2, 'w-fit': 1.1 }, other: 0.7 },
  outdoor: { name: 'Billboards and transit', note: 'Builds a premium image in big cities.', min: 150e3, reach: 1.3, segs: { flagship: 1.3, business: 1.2, 'w-lux': 1.4, 'l-ultra': 1.2 }, other: 0.8 },
  press: { name: 'Reviewer programme', note: 'Loaner units and briefings for enthusiasts and professionals.', min: 50e3, reach: 0.5, segs: { camera: 1.5, flagship: 1.4, 't-pro': 1.5, 'l-pro': 1.5, 'l-ultra': 1.2 }, other: 0.7 },
  esports: { name: 'Esports sponsorship', note: 'Reaches gamers and almost nobody else.', min: 120e3, reach: 0.7, segs: { gamer: 2, 'l-game': 2 }, other: 0.3 },
}
export const channelFit = (ch: ChannelId, seg: SegmentInfo) => CHANNELS[ch].segs[seg.id] ?? CHANNELS[ch].other

/** Interest fades by this share each day without advertising. */
export const BUZZ_DECAY = 0.03

/**
 * Daily effect of one campaign, given what it spends today.
 * Returns the awareness gained as a fraction of the audience not yet reached.
 */
export function campaignDay(s: GameState, c: Campaign, spend: number, product: Product | undefined): number {
  const def = CHANNELS[c.channel]
  const skill = staffEffects(s).marketing
  if (product) {
    for (const seg of segmentsOf(product.type)) {
      const gain = 1 - Math.exp((-spend * channelFit(c.channel, seg) * skill) / 330e3)
      const cur = product.buzz[seg.id] ?? 0
      product.buzz[seg.id] = clamp(cur + (1 - cur) * gain, 0, 1)
    }
  }
  // a product campaign also lifts the brand, just less than a brand campaign does
  return 1 - Math.exp((-spend * def.reach * skill * (product ? 0.6 : 1.5)) / 9e6)
}

// ---------------------------------------------------------------- fans

/** Typical gap between a fan's purchases, in days. */
export const FAN_CYCLE = 800

/** How happy owners of a product are, 0-1. */
export function productSatisfaction(p: Product, software: number, supportGap: number, storeSupport: number, longUpdates: boolean): number {
  return clamp(0.25 + 0.065 * p.reviewAvg - p.defectRate * 4 + software * 1.5 - supportGap * 0.1 + Math.min(0.06, storeSupport * 0.02) + (longUpdates ? 0.03 : 0), 0, 1)
}

/** Support tickets raised per day by the people who own the company's devices. */
export const dailyTickets = (s: GameState) => {
  const faults = s.products.filter((p) => p.companyId === 'player' && p.status === 'sale').reduce((a, p) => a + p.monthUnits * p.defectRate, 0) / 30
  return s.owners * 0.0003 + faults * 3
}

// ---------------------------------------------------------------- events

export interface VenueDef {
  name: string
  cost: number
  reach: number
}
export interface EventDef {
  name: string
  note: string
  venues: VenueDef[]
}
export const EVENTS: Record<EventType, EventDef> = {
  keynote: {
    name: 'Launch keynote',
    note: 'Unveil a device on the day it goes on sale. A great product on a big stage creates launch hype; a weak one gets found out.',
    venues: [
      { name: 'Livestream', cost: 150e3, reach: 0.4 },
      { name: 'Theatre', cost: 1.2e6, reach: 0.7 },
      { name: 'Arena', cost: 6e6, reach: 1 },
      { name: 'Your campus stage', cost: 500e3, reach: 0.85 },
    ],
  },
  expo: {
    name: 'Trade show booth',
    note: 'Show your line-up at the next big industry fair. Raises awareness and interest in everything you sell.',
    venues: [
      { name: 'Small booth', cost: 200e3, reach: 0.3 },
      { name: 'Large booth', cost: 900e3, reach: 0.6 },
      { name: 'Headline pavilion', cost: 3.5e6, reach: 1 },
    ],
  },
  fanfest: {
    name: 'Fan meetup',
    note: 'Bring your fans together. Grows the fan base. Needs at least 20,000 fans.',
    venues: [
      { name: 'City meetup', cost: 80e3, reach: 0.4 },
      { name: 'Fan convention', cost: 600e3, reach: 0.8 },
    ],
  },
  devcon: {
    name: 'Developer conference',
    note: 'Win over app developers. Improves your operating system. Needs your own OS.',
    venues: [
      { name: 'Online sessions', cost: 250e3, reach: 0.5 },
      { name: 'Conference centre', cost: 2e6, reach: 1 },
    ],
  },
}
export const FAIRS = [
  { name: 'Mobile World', dayOfYear: 50 },
  { name: 'ElectroFair', dayOfYear: 245 },
]
export const EVENT_LEAD = 14

/** The next trade fair at least `lead` days away. */
export function nextFair(day: number, lead = EVENT_LEAD): { name: string; day: number } {
  const year = Math.floor(day / DAYS_PER_YEAR)
  for (let y = year; ; y++) {
    for (const f of FAIRS) {
      const d = y * DAYS_PER_YEAR + f.dayOfYear
      if (d >= day + lead) return { name: f.name, day: d }
    }
  }
}

export const hasStage = (s: GameState) => s.office.items.some((i) => i.kind === 'stage' && ITEMS.office.stage)

/** Why an event cannot be booked, or null if it can. */
export function eventBlocked(s: GameState, type: EventType, venue: number, productId?: string): string | null {
  if (!EVENTS[type].venues[venue]) return 'Pick a venue'
  if (type === 'keynote') {
    const p = s.products.find((x) => x.id === productId)
    if (!p || p.companyId !== 'player' || p.status !== 'dev') return 'A keynote needs a device that is still in development'
    if (s.events.some((e) => e.type === 'keynote' && e.productId === productId && !e.done)) return 'This device already has a keynote booked'
    if (venue === 3 && !hasStage(s)) return 'Build an auditorium stage in your office first'
  }
  if (type === 'fanfest' && s.fans < 20e3) return 'You need at least 20,000 fans'
  if (type === 'devcon' && !s.os.own) return 'You need your own operating system'
  if (type !== 'keynote' && s.events.some((e) => e.type === type && !e.done)) return 'One of these is already booked'
  return null
}

const verdict = (score: number) => (score >= 85 ? 'A triumph.' : score >= 70 ? 'It went very well.' : score >= 50 ? 'A solid showing.' : score >= 30 ? 'It fell flat.' : 'It was an embarrassment.')

/** Runs an event that is due today and applies its effects. Returns the news line. */
export function resolveEvent(s: GameState, e: GameEvent): string {
  const me = s.companies[0]
  const def = EVENTS[e.type]
  const v = def.venues[e.venue]
  const fx = staffEffects(s)
  const crew = Math.min(1, (fx.marketing - 1) / 0.6)
  const mine = s.products.filter((p) => p.companyId === 'player' && p.status !== 'ended')
  let score = 0
  let detail = ''
  if (e.type === 'keynote') {
    const p = s.products.find((x) => x.id === e.productId)
    if (!p || p.status === 'ended') {
      e.done = true
      e.score = 0
      return (e.summary = 'The keynote was cancelled because the device was shelved.')
    }
    const wow = clamp(bestSegment(p, me, s.day).u / 1.15, 0, 1)
    score = 100 * (0.45 * wow + 0.25 * v.reach + 0.15 * crew + 0.15 * rand(s))
    p.hype = (score / 100) * (0.5 + 0.5 * v.reach)
    me.awareness += (1 - me.awareness) * 0.05 * v.reach * (score / 100)
    s.fans += s.fans * 0.04 * (score / 100) + 3000 * v.reach * (score / 100)
    detail = `${p.name} was unveiled at the ${v.name.toLowerCase()}.`
  } else if (e.type === 'expo') {
    const quality = mine.length ? mine.reduce((a, p) => a + clamp(bestSegment(p, me, s.day).u, 0, 1.2), 0) / mine.length / 1.2 : 0.2
    score = 100 * (0.4 * v.reach + 0.3 * quality + 0.15 * crew + 0.15 * rand(s))
    me.awareness += (1 - me.awareness) * 0.07 * v.reach * (score / 100)
    for (const p of mine) for (const seg of segmentsOf(p.type)) p.buzz[seg.id] = clamp((p.buzz[seg.id] ?? 0) + 0.25 * v.reach, 0, 1)
    detail = `Your ${v.name.toLowerCase()} drew the crowds.`
  } else if (e.type === 'fanfest') {
    score = 100 * (0.45 * v.reach + 0.25 * crew + 0.15 * Math.min(1, fx.prestige / 20) + 0.15 * rand(s))
    s.fans += (s.fans * 0.1 + 8000) * v.reach * (score / 100)
    detail = 'Fans met the team and each other.'
  } else {
    const dev = Math.min(1, fx.software / 6)
    score = 100 * (0.4 * v.reach + 0.3 * dev + 0.15 * crew + 0.15 * rand(s))
    s.os.quality += 4 * v.reach * (score / 100)
    detail = 'Developers got early access and a roadmap.'
  }
  e.done = true
  e.score = Math.round(score)
  e.summary = `${detail} ${verdict(score)}`
  return `${def.name}: ${e.summary} (score ${e.score})`
}
