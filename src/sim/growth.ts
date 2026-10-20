// Growth: advertising channels, the fan base, and events the company can host.
import { type SegmentInfo, segmentsOf } from '../data/devices'
import { DAYS_PER_YEAR } from '../data/catalog'
import { bestSegment } from './market'
import { clamp, rand } from './rng'
import { addAwareness } from './regions'
import { sitePrestige, sumOf, venueStats } from './sites'
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
  social: { name: 'Creators and social', note: 'Strong with younger buyers and anything photogenic.', min: 30e3, reach: 0.8, segs: { gamer: 1.6, mainstream: 1.3, camera: 1.3, 'w-smart': 1.3, 'w-fit': 1.3, 't-main': 1.1, 'v-play': 1.4, 'h-pocket': 1.3, 'f-value': 1.2, 's-mini': 1.1 }, other: 0.8 },
  tv: { name: 'Television', note: 'Mass reach for mass-market products. Expensive to start.', min: 400e3, reach: 1.6, segs: { budget: 1.4, mainstream: 1.4, 't-budget': 1.3, 't-main': 1.3, 'l-budget': 1.2, 'w-fit': 1.1, 's-mini': 1.3, 's-screen': 1.3, 'h-pocket': 1.2 }, other: 0.7 },
  outdoor: { name: 'Billboards and transit', note: 'Builds a premium image in big cities.', min: 150e3, reach: 1.3, segs: { flagship: 1.3, business: 1.2, 'w-lux': 1.4, 'l-ultra': 1.2, 'f-flag': 1.4, 'f-work': 1.2, 'v-pro': 1.2 }, other: 0.8 },
  press: { name: 'Reviewer programme', note: 'Loaner units and briefings for enthusiasts and professionals.', min: 50e3, reach: 0.5, segs: { camera: 1.5, flagship: 1.4, 't-pro': 1.5, 'l-pro': 1.5, 'l-ultra': 1.2, 'f-flag': 1.3, 'v-mixed': 1.3, 'v-pro': 1.6, 's-hifi': 1.5, 'h-elite': 1.4 }, other: 0.7 },
  esports: { name: 'Esports sponsorship', note: 'Reaches gamers and almost nobody else.', min: 120e3, reach: 0.7, segs: { gamer: 2, 'l-game': 2, 'h-pc': 2, 'h-elite': 1.8, 'v-play': 1.7, 'h-pocket': 1.2 }, other: 0.3 },
}
export const channelFit = (ch: ChannelId, seg: SegmentInfo) => CHANNELS[ch].segs[seg.id] ?? CHANNELS[ch].other

/** Interest fades by this share each day without advertising. */
export const BUZZ_DECAY = 0.03

/**
 * Daily effect of one campaign, given what it spends today.
 * Returns the awareness gained as a fraction of the audience not yet reached.
 */
export function campaignDay(s: GameState, c: Pick<Campaign, 'channel'>, spend: number, product: Product | undefined, skill = staffEffects(s).marketing): number {
  const def = CHANNELS[c.channel]
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
      { name: 'Your own venue', cost: 250e3, reach: 0.85 },
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

export const hasStage = (s: GameState) => !!s.venue && venueStats(s.venue).ready
/** The index of "your own venue" in the keynote venue list. */
export const OWN_VENUE = 3
/** Seats a hired venue holds, for the replay. */
export const VENUE_SEATS = [0, 420, 1400]
/** How far a keynote carries from a given venue. */
export const keynoteReach = (s: GameState, venue: number) => (venue === OWN_VENUE && s.venue ? venueStats(s.venue).reach : EVENTS.keynote.venues[venue].reach)

/** The keynote still to come that unveils a device, as its headline or one of the others. */
export const keynoteFor = (s: GameState, id?: string) => s.events.find((e) => e.type === 'keynote' && !e.done && (e.productId === id || !!e.extraIds?.includes(id ?? '')))
/** Most devices one keynote unveils besides the headline one. */
export const MAX_KEYNOTE_EXTRAS = 3

/** Why the other devices cannot join a keynote for `productId`, or null if they can. */
export function extrasBlocked(s: GameState, productId: string | undefined, extras: string[]): string | null {
  if (!Array.isArray(extras)) return 'List the other devices'
  if (extras.length > MAX_KEYNOTE_EXTRAS) return `A keynote unveils at most ${MAX_KEYNOTE_EXTRAS + 1} devices`
  if (new Set(extras).size !== extras.length || extras.includes(productId ?? '')) return 'Each device appears once'
  for (const id of extras) {
    const p = s.products.find((x) => x.id === id)
    if (!p || p.companyId !== 'player' || p.status !== 'dev') return 'Only your devices still in development can be unveiled'
    if (keynoteFor(s, id)) return `${p.name} already has a keynote booked`
  }
  return null
}

/** Moves a device's reviews by the hands-on area's verdict; the average follows. */
export function applyPress(p: Product, nudge: number) {
  if (!p.reviews?.length || !nudge) return
  for (const r of p.reviews) r.score = clamp(r.score + nudge, 1, 10)
  p.reviewAvg = p.reviews.reduce((a, r) => a + r.score, 0) / p.reviews.length
}

/** Why an event cannot be booked, or null if it can. */
export function eventBlocked(s: GameState, type: EventType, venue: number, productId?: string): string | null {
  if (!Object.hasOwn(EVENTS, type)) return 'There is no such kind of event'
  if (!Number.isInteger(venue) || !EVENTS[type].venues[venue]) return 'Pick a venue'
  if (type === 'keynote') {
    const p = s.products.find((x) => x.id === productId)
    if (!p || p.companyId !== 'player' || p.status !== 'dev') return 'A keynote needs a device that is still in development'
    if (keynoteFor(s, productId)) return 'This device already has a keynote booked'
    if (venue === OWN_VENUE && !hasStage(s)) return s.venue ? 'Your venue is not ready. ' + (venueStats(s.venue).problem ?? '') : 'Build a venue of your own first'
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
  const v = e.type === 'keynote' ? { ...def.venues[e.venue], reach: keynoteReach(s, e.venue) } : def.venues[e.venue]
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
    const luck = rand(s)
    score = 100 * (0.45 * wow + 0.25 * Math.min(1, v.reach) + 0.15 * crew + 0.15 * luck)
    // a full house at a venue that carries further than any hired hall still cannot make more than total hype
    p.hype = clamp((score / 100) * (0.5 + 0.5 * v.reach), 0, 1)
    addAwareness(s, 0.05 * v.reach * (score / 100))
    const seats = e.venue === OWN_VENUE && s.venue ? sumOf(s.venue, 'crowd') : (VENUE_SEATS[e.venue] ?? 0)
    e.beats = { wow, reach: v.reach, crew, luck, seats }
    // the other devices on the bill: each judged on its own, and a strong one lifts the night a little
    const others = (e.extraIds ?? []).map((id) => s.products.find((x) => x.id === id)).filter((x): x is Product => !!x && x.status !== 'ended')
    const wows = others.map((x) => clamp(bestSegment(x, me, s.day).u / 1.15, 0, 1))
    if (others.length) score = Math.min(100, score + 6 * Math.max(0, wows.reduce((a, w) => a + w, 0) / wows.length - 0.4) + 2 * others.length + (e.withOs && s.os.own ? 2 : 0))
    const viewers = Math.round(seats + 4000 + 400000 * Math.min(1, v.reach) * (0.4 + wow) * (1 + 0.15 * others.length))
    const lines = [p, ...others].map((x, i) => {
      const w = i === 0 ? wow : wows[i - 1]
      const press = Math.round(clamp(100 * (0.6 * w + 0.15 * crew + 0.25 * luck) + (i === 0 ? 0 : -4), 0, 100))
      const hype = i === 0 ? clamp((score / 100) * (0.5 + 0.5 * v.reach), 0, 1) : clamp((score / 100) * (0.35 + 0.4 * v.reach) * (0.5 + 0.5 * w), 0, 1)
      x.hype = Math.max(i === 0 ? 0 : x.hype, hype)
      // the hands-on area: up to about half a point either way on every review, now or when they come in
      const nudge = ((press - 50) / 50) * 0.5
      if (x.status !== 'dev') applyPress(x, nudge)
      else x.pressNudge = nudge
      const preorders = Math.round((s.fans * (0.01 + 0.06 * w) + viewers * 0.004 * w) * (0.4 + hype) * (i === 0 ? 1 : 0.7))
      return { id: x.id, wow: w, press, preorders, hype }
    })
    p.hype = lines[0].hype
    e.stats = { viewers, press: Math.round(lines.reduce((a, l) => a + l.press, 0) / lines.length), lines }
    s.fans += s.fans * 0.04 * (score / 100) + 3000 * v.reach * (score / 100)
    detail = others.length ? `${p.name} and ${others.length} more ${others.length === 1 ? 'device were' : 'devices were'} unveiled at the ${v.name.toLowerCase()}.` : `${p.name} was unveiled at the ${v.name.toLowerCase()}.`
  } else if (e.type === 'expo') {
    const quality = mine.length ? mine.reduce((a, p) => a + clamp(bestSegment(p, me, s.day).u, 0, 1.2), 0) / mine.length / 1.2 : 0.2
    score = 100 * (0.4 * v.reach + 0.3 * quality + 0.15 * crew + 0.15 * rand(s))
    addAwareness(s, 0.07 * v.reach * (score / 100))
    for (const p of mine) for (const seg of segmentsOf(p.type)) p.buzz[seg.id] = clamp((p.buzz[seg.id] ?? 0) + 0.25 * v.reach, 0, 1)
    detail = `Your ${v.name.toLowerCase()} drew the crowds.`
  } else if (e.type === 'fanfest') {
    score = 100 * (0.45 * v.reach + 0.25 * crew + 0.15 * Math.min(1, (fx.prestige + (s.venue ? sitePrestige(s.venue) : 0)) / 30) + 0.15 * rand(s))
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
