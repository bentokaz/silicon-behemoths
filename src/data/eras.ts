// Start eras: the year a game begins in, and what that means for the market.
//
// A game always counts its days from 0. The era says which calendar year day 0
// is, how far technology has come by then (the market's tech level, see
// marketLevel in catalog.ts), and which kinds of device and which customer
// segments exist yet. Technology then moves at the game's usual pace from
// wherever the era starts it.
//
// The calendar of the game being played is module state: setEra is called by
// newGame, migrate and tick, and by the store whenever it loads a game, so the
// date and market functions that take only a day number (dateOf, marketLevel,
// priceIndex, segmentDemand, ...) answer for the game in hand. It changes only
// through those calls and never during a tick, so the simulation stays
// deterministic.
import type { DeviceType } from '../sim/types'

export interface EraInfo {
  year: number
  name: string
  blurb: string
  /** The market's tech level on day 0 (today's market is 3). */
  level: number
  /** Research level every track starts at. */
  techLevel: number
  recommended?: boolean
}

/** The year of the present-day start. Games from before eras existed began then. */
export const TODAY = 2026

export const ERAS: EraInfo[] = [
  { year: 2000, name: 'Dot-com', level: 0, techLevel: 0, blurb: 'Small colour screens, slow chips and dial-up. Phones, laptops, desktops, consoles, TVs and handhelds exist; tablets, smartwatches, earbuds and the rest are years away.' },
  { year: 2007, name: 'Smartphone dawn', level: 0.6, techLevel: 0, recommended: true, blurb: 'Touch screens are new and the market is wide open. Build up as tablets, watches and earbuds arrive one by one.' },
  { year: 2010, name: 'App boom', level: 1.2, techLevel: 1, blurb: 'Tablets have just arrived and apps are everywhere. Smartwatches and smart speakers are a few years off.' },
  { year: TODAY, name: 'Today', level: 3, techLevel: 3, blurb: 'Every kind of device is on sale and the leading rivals are well established.' },
]

/** The first calendar year each kind of device is sold in. */
export const TYPE_YEAR: Record<DeviceType, number> = {
  phone: 1995,
  laptop: 1995,
  desktop: 1980,
  console: 1980,
  tv: 1980,
  handheld: 1990,
  tablet: 2010,
  watch: 2014,
  speaker: 2014,
  earbuds: 2016,
  headset: 2016,
  foldable: 2019,
}

/** Customer segments that appear later than their device type. */
export const SEGMENT_YEAR: Record<string, number> = {
  camera: 2010,
  gamer: 2017,
  'l-game': 2004,
  'd-studio': 2004,
  'c-elite': 2013,
  'tv-cinema': 2006,
  'e-hifi': 2018,
  'f-work': 2021,
  'v-pro': 2023,
}

/** Years over which a new kind of device grows from its first buyers to its full market. */
const RAMP_YEARS = 6
/** Share of the full market a new kind of device has in its first year. */
const FIRST_YEAR = 0.25

let year0 = TODAY

/** Sets the calendar the date and market functions answer for. Unknown years mean today. */
export function setEra(year: number | undefined) {
  year0 = ERAS.some((e) => e.year === year) ? (year as number) : TODAY
}
/** Calendar year of day 0 in the game being played. */
export const startYear = () => year0
export const eraInfo = (year: number = year0): EraInfo => ERAS.find((e) => e.year === year) ?? ERAS[ERAS.length - 1]
/** Calendar year, as a fraction, on a game day. */
export const yearAt = (day: number) => year0 + day / 360

/** Whether a kind of device is sold anywhere yet on a game day. */
export const typeOpen = (type: DeviceType, day: number) => yearAt(day) >= (TYPE_YEAR[type] ?? 0)
/** Whether a customer segment exists yet on a game day (its device type must be open too). */
export const segmentOpen = (segment: string, type: DeviceType, day: number) => typeOpen(type, day) && yearAt(day) >= (SEGMENT_YEAR[segment] ?? 0)

/**
 * Buyers in a segment relative to its full size: nothing before it exists,
 * a quarter in the first year, all of them six years on.
 */
export function adoption(segment: string, type: DeviceType, day: number): number {
  if (!segmentOpen(segment, type, day)) return 0
  const since = yearAt(day) - Math.max(TYPE_YEAR[type] ?? 0, SEGMENT_YEAR[segment] ?? 0)
  return Math.min(1, FIRST_YEAR + ((1 - FIRST_YEAR) * since) / RAMP_YEARS)
}

/** The kinds of device that first go on sale in a calendar year. */
export const typesArriving = (year: number): DeviceType[] => (Object.keys(TYPE_YEAR) as DeviceType[]).filter((t) => TYPE_YEAR[t] === year)
