// The wider world: invented company names, which kinds of device a company
// may build, things that happen to it, and how rivals respond to what it does.
import { DAYS_PER_YEAR, MAX_LEVEL, TRACK_INFO } from '../data/catalog'
import { SEGMENTS, type SegmentInfo, TYPES, segmentInfo } from '../data/devices'
import { clamp, int, pick, rand, range } from './rng'
import { type Company, DEVICE_TYPES, type DeviceType, type GameState, type Incident, type Levels, SUPPLY_CATS, TRACKS } from './types'

// ---------------------------------------------------------------- names

/** Invented names for the seeded rivals, keyed by the name in the data file. */
const ORIGINAL: Record<string, string> = {
  Pear: 'Alder',
  Samsong: 'Sunhwa',
  Xiaomy: 'Minato',
  Gooble: 'Lumio',
  OnePlum: 'Quince',
  Nokai: 'Norvik',
  Sonny: 'Senna',
  Azus: 'Aztra',
  BlockBerry: 'Bramble',
  Lenova: 'Lyra',
  Dull: 'Dalton',
  HB: 'Halberg',
  Fitbyte: 'Stride',
  Garmon: 'Garrow',
  Microsoff: 'Meridian',
  Nintendont: 'Tanuki',
  Segga: 'Vektor',
  LQ: 'Luma',
  Hisenze: 'Hanzo',
  Boze: 'Barden',
  Sennhauser: 'Seidel',
  Ankor: 'Anvil',
}
export const originalName = (name: string) => ORIGINAL[name] ?? name
export const STARTUPS = ['Fable', 'Tessel', 'Corvid', 'Wren', 'Halcyon', 'Ostrava', 'Junco', 'Marlowe', 'Sable', 'Thistle']
/** A product-line word for each rung of a market, from its price sensitivity. */
function lineWord(seg: SegmentInfo): string {
  const first = seg.name.split(' ')[0]
  if (/budget|everyday|family|fit/i.test(seg.id + seg.name)) return seg.sens > 1.9 ? 'Go' : 'Home'
  if (/gam|core|elite/i.test(seg.id + seg.name)) return 'Volt'
  if (/pro|studio|work|hifi|cinema|lux/i.test(seg.id + seg.name)) return seg.sens < 0.85 ? 'Apex' : 'Pro'
  if (/camera/i.test(seg.id)) return 'Lens'
  if (/business|office/i.test(seg.id + seg.name)) return 'Works'
  return seg.sens < 1 ? 'Apex' : seg.sens > 1.6 ? 'Go' : first.length <= 8 ? 'One' : 'One'
}

/** Give a seeded rival an invented name and product lines named after it. */
export function makeOriginal(c: Company) {
  const name = ORIGINAL[c.name]
  if (!name) return
  c.name = name
  const seen = new Set<string>()
  for (const id of Object.keys(c.series)) {
    const seg = segmentInfo(id)
    if (!seg) continue
    let line = `${name} ${TYPES[seg.type].series ? TYPES[seg.type].series + ' ' : ''}${lineWord(seg)}`.trim()
    if (seen.has(line)) line += ' S'
    seen.add(line)
    c.series[id] = line
  }
}

// ---------------------------------------------------------------- which devices a company may build

export interface Unlock {
  cost: number
  needs: Partial<Levels>
  /** Already making one of these makes it cheaper. */
  from: DeviceType[]
}
const UNLOCKS: Record<string, Unlock> = {
  phone: { cost: 2.5e6, needs: {}, from: ['tablet', 'watch'] },
  tablet: { cost: 1.5e6, needs: {}, from: ['phone', 'laptop'] },
  watch: { cost: 1.2e6, needs: {}, from: ['phone', 'earbuds'] },
  earbuds: { cost: 0.8e6, needs: {}, from: ['phone', 'watch', 'speaker'] },
  laptop: { cost: 3e6, needs: { chipset: 3 }, from: ['tablet', 'desktop'] },
  desktop: { cost: 2.5e6, needs: { chipset: 3 }, from: ['laptop', 'tv'] },
  tv: { cost: 3e6, needs: { display: 3 }, from: ['desktop', 'console'] },
  console: { cost: 4e6, needs: { chipset: 4 }, from: ['desktop', 'tv', 'handheld'] },
}
/** What it takes to start making a kind of device. Types added later carry their own terms in the type data. */
export function unlockOf(type: DeviceType): Unlock {
  // the first eight kinds were tuned together here; newer kinds bring their terms with them
  if (Object.hasOwn(UNLOCKS, type)) return UNLOCKS[type]
  const own = Object.hasOwn(TYPES, type) ? TYPES[type].unlock : undefined
  return { cost: own?.cost ?? 4e6, needs: own?.needs ?? {}, from: own?.from ?? [] }
}
export const hasType = (s: GameState, type: DeviceType) => !s.types || s.types.includes(type)
export function unlockCost(s: GameState, type: DeviceType): number {
  const u = unlockOf(type)
  const head = u.from.some((t) => hasType(s, t)) ? 0.6 : 1
  return Math.round((u.cost * head) / 1e5) * 1e5
}
/** Why a device type cannot be opened up yet, or null. */
export function unlockBlocked(s: GameState, type: DeviceType): string | null {
  if (hasType(s, type)) return 'You already make these'
  const u = unlockOf(type)
  for (const t of TRACKS) {
    const need = u.needs[t]
    if (need !== undefined && s.levels[t] < need) return `Needs ${TRACK_INFO[t].name.toLowerCase()} research at level ${need} (you are at level ${s.levels[t]}). Research it first.`
  }
  return null
}
/** The kinds a new company can choose to start with. */
// a new company can begin with anything but the three kinds that need years of research behind them
export const START_TYPES = DEVICE_TYPES.filter((t) => t !== 'foldable' && t !== 'headset' && t !== 'drone')

// ---------------------------------------------------------------- incidents

export interface Choice {
  label: string
  note: string
  /** Cash paid on choosing (negative pays the company). */
  cost?: number
}
interface IncidentDef {
  title: string
  /** Can this happen now? */
  when: (s: GameState) => boolean
  text: (s: GameState, i: Incident) => string
  /** Set up anything the incident refers to; return false to skip it. */
  setup?: (s: GameState, i: Incident) => boolean
  choices: (s: GameState, i: Incident) => Choice[]
  /** Apply the outcome; returns the news line. */
  resolve: (s: GameState, i: Incident, choice: number) => string
  weight: number
}

const me = (s: GameState) => s.companies[0]
const onSale = (s: GameState) => s.products.filter((p) => p.companyId === 'player' && p.status === 'sale')
const revenue = (s: GameState) => Math.max(200e3, s.reports[s.reports.length - 1]?.revenue ?? 0)
const bump = (s: GameState, by: number) => {
  for (const r of Object.values(s.regions)) if (r.open) r.awareness = clamp(r.awareness + (1 - r.awareness) * by, 0, 1)
}

/** How many units a bulk order can still be met with: what was asked for, or what is left in stock if that is less. */
const bulkUnits = (p: { stock: number } | undefined, i: Incident) => Math.max(0, Math.min(Math.floor(p?.stock ?? 0), i.amount ?? 0))
/**
 * What a bulk buyer pays for each unit: a fifth off the list price, but never more than a fifth off what
 * such a device goes for (a quarter over its segment's usual price). A device listed at a million is not
 * bought by the thousand at eight hundred thousand each.
 */
function bulkPrice(s: GameState, p: { price: number; segment?: string; type: DeviceType } | undefined): number {
  if (!p) return 0
  const seg = (p.segment ? segmentInfo(p.segment) : undefined) ?? SEGMENTS.find((x) => x.type === p.type)
  const usual = seg ? seg.priceRef * priceIndex(s.day) * 1.25 : p.price
  return Math.round(Math.min(p.price, usual) * 0.8)
}

export const INCIDENTS: Record<string, IncidentDef> = {
  viral: {
    title: 'A video is going round',
    weight: 3,
    when: (s) => onSale(s).length > 0,
    setup: (s, i) => !!(i.productId = pick(s, onSale(s)).id),
    text: (s, i) => `A creator with millions of followers posted about ${s.products.find((p) => p.id === i.productId)?.name}. It is everywhere this week.`,
    choices: (s) => [
      { label: 'Send them the next one early', note: 'Costs a little, keeps the attention going for months.', cost: Math.round(revenue(s) * 0.02) },
      { label: 'Enjoy it', note: 'A free burst of awareness.' },
    ],
    resolve(s, i, c) {
      const p = s.products.find((x) => x.id === i.productId)
      bump(s, c === 0 ? 0.08 : 0.04)
      if (p) p.hype = Math.min(1, p.hype + (c === 0 ? 0.5 : 0.25))
      return c === 0 ? 'The creator became a regular. Awareness jumped.' : 'The video did its work. Awareness rose.'
    },
  },
  lawsuit: {
    title: 'A patent claim',
    weight: 2,
    when: (s) => me(s).unitsTotal > 50e3,
    text: (s) => `A holding company says your devices infringe one of its patents and wants $${Math.round(revenue(s) * 0.25).toLocaleString('en-US')}.`,
    choices: (s) => [
      { label: 'Settle', note: 'Pay and move on.', cost: Math.round(revenue(s) * 0.25) },
      { label: 'Fight it', note: 'Lawyers cost a third of that. You win about two times in three; lose and you pay double.', cost: Math.round(revenue(s) * 0.08) },
    ],
    resolve(s, _i, c) {
      if (c === 0) return 'The claim was settled quietly.'
      if (rand(s) < 0.66) return 'The court threw the claim out.'
      s.cash -= revenue(s) * 0.5
      s.cur.overhead += revenue(s) * 0.5
      return 'The court sided with the claimant. Damages were doubled.'
    },
  },
  poach: {
    title: 'Someone wants your people',
    weight: 3,
    // somebody has to be doing the poaching: with every rival gone, nobody is
    when: (s) => s.staff.some((e) => e.skill >= 55) && s.companies.some((c) => !c.isPlayer && c.alive),
    setup: (s, i) => {
      const stars = s.staff.filter((e) => e.skill >= 55)
      i.staffId = pick(s, stars).id
      i.rivalId = pick(s, s.companies.filter((c) => !c.isPlayer && c.alive)).id
      return true
    },
    text: (s, i) => `${s.companies.find((c) => c.id === i.rivalId)?.name} has offered ${s.staff.find((e) => e.id === i.staffId)?.name} a job at a third more pay.`,
    choices: (s, i) => {
      const e = s.staff.find((x) => x.id === i.staffId)
      return [
        { label: 'Match the offer', note: `Their salary rises to $${Math.round((e?.salary ?? 0) * 1.33).toLocaleString('en-US')} a month, and they are delighted.` },
        { label: 'Let them go', note: 'You lose them. The team notices.' },
      ]
    },
    resolve(s, i, c) {
      const e = s.staff.find((x) => x.id === i.staffId)
      if (!e) return 'They had already left.'
      if (c === 0) {
        e.salary = Math.round((e.salary * 1.33) / 50) * 50
        e.morale = Math.min(100, e.morale + 25)
        e.ask = undefined
        return `${e.name} stayed, on better pay.`
      }
      s.staff = s.staff.filter((x) => x !== e)
      for (const t of s.teams) {
        t.members = t.members.filter((id) => id !== e.id)
        if (t.leadId === e.id) t.leadId = undefined
      }
      for (const x of s.staff) x.morale = Math.max(0, x.morale - 4)
      return `${e.name} left for ${s.companies.find((x) => x.id === i.rivalId)?.name}.`
    },
  },
  fire: {
    title: 'Fire at a supplier',
    weight: 2,
    when: (s) => SUPPLY_CATS.some((c) => s.supply.shockDays[c] <= 0),
    setup: (s, i) => !!(i.note = pick(s, SUPPLY_CATS.filter((c) => s.supply.shockDays[c] <= 0))),
    text: (_s, i) => `A fire has shut one of the biggest ${i.note} plants. Prices will climb for months.`,
    choices: (s) => [
      { label: 'Buy ahead', note: 'Pay now for stock at today\'s price: the shortage costs you half as much.', cost: Math.round(revenue(s) * 0.06) },
      { label: 'Ride it out', note: 'Take the higher prices as they come.' },
    ],
    resolve(s, i, c) {
      const cat = i.note as (typeof SUPPLY_CATS)[number]
      s.supply.shock[cat] = range(s, 0.3, 0.6) * (c === 0 ? 0.5 : 1)
      s.supply.shockDays[cat] = int(s, 90, 180)
      return c === 0 ? 'Your buyers got in early. The shortage will sting less.' : `The ${cat} shortage has begun.`
    },
  },
  endorse: {
    title: 'A famous face',
    weight: 2,
    when: (s) => onSale(s).length > 0 && me(s).awareness > 0.05,
    text: () => 'A film star\'s agent is offering a year as the face of your brand.',
    choices: (s) => [
      { label: 'Sign them', note: 'A large fee, a big lift in awareness and some fans.', cost: Math.round(Math.max(500e3, revenue(s) * 0.15)) },
      { label: 'Pass', note: 'Nothing changes.' },
    ],
    resolve(s, _i, c) {
      if (c !== 0) return 'You passed on the endorsement.'
      bump(s, 0.1)
      s.fans += 5000 + s.fans * 0.08
      return 'The campaign with your new ambassador is everywhere.'
    },
  },
  breach: {
    title: 'Customer data exposed',
    weight: 1.5,
    when: (s) => s.owners > 100e3,
    text: () => 'A security researcher has found customer records readable from the outside. The story will break tomorrow.',
    choices: (s) => [
      { label: 'Own up and fix it', note: 'Pay for the clean-up and credit monitoring. Trust mostly holds.', cost: Math.round(s.owners * 0.6) },
      { label: 'Play it down', note: 'Free today. If it comes out, the brand and the fans pay.' },
    ],
    resolve(s, _i, c) {
      if (c === 0) {
        me(s).brand = clamp(me(s).brand - 0.01, 0.05, 1)
        return 'You told customers first. Most forgave it.'
      }
      if (rand(s) < 0.6) {
        me(s).brand = clamp(me(s).brand - 0.07, 0.05, 1)
        s.fans *= 0.85
        return 'The cover-up came out. The brand took a real hit.'
      }
      return 'The story faded without much notice.'
    },
  },
  award: {
    title: 'Design award',
    weight: 2,
    when: (s) => onSale(s).some((p) => p.designPct >= 75),
    setup: (s, i) => !!(i.productId = pick(s, onSale(s).filter((p) => p.designPct >= 75)).id),
    text: (s, i) => `${s.products.find((p) => p.id === i.productId)?.name} has won a major industrial design award.`,
    choices: () => [
      { label: 'Throw a party', note: 'Morale across the company jumps.', cost: 80e3 },
      { label: 'Put it in the lobby', note: 'A quiet boost to the brand.' },
    ],
    resolve(s, _i, c) {
      me(s).brand = clamp(me(s).brand + 0.02, 0.05, 1)
      if (c === 0) for (const e of s.staff) e.morale = Math.min(100, e.morale + 12)
      return c === 0 ? 'The whole company celebrated the award.' : 'The trophy sits in the lobby.'
    },
  },
  strike: {
    title: 'Walk-out threat',
    weight: 2,
    when: (s) => s.staff.length >= 8 && s.staff.reduce((a, e) => a + e.morale, 0) / s.staff.length < 50,
    text: () => 'Staff have had enough. A group is threatening to walk out unless conditions improve.',
    choices: (s) => [
      { label: 'A bonus for everyone', note: 'One month of extra pay. Morale recovers.', cost: Math.round(s.staff.reduce((a, e) => a + e.salary, 0)) },
      { label: 'Call their bluff', note: 'Some will leave.' },
    ],
    resolve(s, _i, c) {
      if (c === 0) {
        for (const e of s.staff) e.morale = Math.min(100, e.morale + 22)
        return 'The bonus landed well. People are back at work.'
      }
      const leaving = s.staff.filter((e) => e.morale < 40 && !e.traits.includes('loyal')).slice(0, Math.max(1, Math.floor(s.staff.length * 0.15)))
      s.staff = s.staff.filter((e) => !leaving.includes(e))
      for (const t of s.teams) {
        t.members = t.members.filter((id) => !leaving.some((e) => e.id === id))
        if (leaving.some((e) => e.id === t.leadId)) t.leadId = undefined
      }
      return `${leaving.length} ${leaving.length === 1 ? 'person' : 'people'} walked out.`
    },
  },
  grant: {
    title: 'Research grant',
    weight: 2,
    when: (s) => s.rdBudget > 0,
    text: () => 'A government technology fund will match part of your research spending if you publish some of the results.',
    choices: (s) => [
      { label: 'Take the grant', note: 'Cash now. Rivals learn a little from what you publish.', cost: -Math.round(Math.max(300e3, s.rdBudget * 4)) },
      { label: 'Keep it secret', note: 'No money, no sharing.' },
    ],
    resolve(s, _i, c) {
      if (c !== 0) return 'You kept your research to yourself.'
      for (const r of s.companies) if (!r.isPlayer && r.alive) r.techOffset += 0.03
      return 'The grant arrived. Your papers were widely read.'
    },
  },
  boom: {
    title: 'The economy is booming',
    weight: 1.2,
    when: (s) => !s.economy || s.day > s.economy.until,
    text: () => 'Wages are up and people are spending. Demand for everything should be strong for a year.',
    choices: () => [{ label: 'Good', note: 'About 15% more buyers in every market for a year.' }],
    resolve(s) {
      s.economy = { mult: 1.15, until: s.day + DAYS_PER_YEAR }
      return 'A boom year has begun.'
    },
  },
  slump: {
    title: 'A downturn',
    weight: 1.2,
    when: (s) => s.day > DAYS_PER_YEAR && (!s.economy || s.day > s.economy.until),
    text: () => 'Markets have fallen and shoppers are putting off big purchases. Expect a lean year.',
    choices: () => [{ label: 'Understood', note: 'About 15% fewer buyers in every market for a year. Budget devices hold up best.' }],
    resolve(s) {
      s.economy = { mult: 0.85, until: s.day + DAYS_PER_YEAR }
      return 'A downturn has begun.'
    },
  },
  bulk: {
    title: 'A big order',
    weight: 2,
    when: (s) => onSale(s).some((p) => p.stock > 3000),
    setup: (s, i) => {
      const p = pick(s, onSale(s).filter((x) => x.stock > 3000))
      i.productId = p.id
      i.amount = Math.min(p.stock, int(s, 2000, 12000))
      return true
    },
    text: (s, i) => {
      const p = s.products.find((x) => x.id === i.productId)
      const each = bulkPrice(s, p)
      return `A school network wants ${i.amount?.toLocaleString('en-US')} units of ${p?.name} at ${p && each < Math.round(p.price * 0.8) ? `$${each.toLocaleString('en-US')} each: it will not pay anything like your list price` : `20% off ($${each.toLocaleString('en-US')} each)`}.`
    },
    choices: (s, i) => {
      const p = s.products.find((x) => x.id === i.productId)
      // paid for what can be shipped: stock sold elsewhere since the offer came is not theirs to buy
      const units = bulkUnits(p, i)
      return [
        { label: 'Take the order', note: units < (i.amount ?? 0) ? `Only ${units.toLocaleString('en-US')} are left in stock: they take those, at the discount.` : 'Sold in one go, at a discount.', cost: -units * bulkPrice(s, p) },
        { label: 'Decline', note: 'Keep the stock for full-price buyers.' },
      ]
    },
    resolve(s, i, c) {
      const p = s.products.find((x) => x.id === i.productId)
      if (c !== 0 || !p) return 'You turned the order down.'
      const units = bulkUnits(p, i)
      if (!units) return `There was no stock of ${p.name} left to ship. The order lapsed.`
      const income = units * bulkPrice(s, p)
      p.stock -= units
      p.unitsSold += units
      p.monthUnits += units
      p.revenue += income
      me(s).unitsTotal += units
      me(s).revenueTotal += income
      s.cur.units += units
      s.owners += units
      return `${units.toLocaleString('en-US')} units of ${p.name} shipped to the schools.`
    },
  },
}

/** Days a decision can wait before the first option's opposite happens on its own. */
export const INCIDENT_WAIT = 30

/** Monthly: maybe something happens. Returns the new incident, if any. */
export function rollIncident(s: GameState): Incident | null {
  if (s.day < 90 || s.incidents.some((i) => !i.done)) return null
  if (rand(s) > 0.3) return null
  const pool = Object.entries(INCIDENTS).filter(([id, d]) => d.when(s) && !s.incidents.some((i) => i.kind === id && s.day - i.day < 540))
  if (!pool.length) return null
  let roll = rand(s) * pool.reduce((a, [, d]) => a + d.weight, 0)
  const [kind, def] = pool.find(([, d]) => (roll -= d.weight) <= 0) ?? pool[0]
  const incident: Incident = { id: `i${s.nextId++}`, kind, day: s.day, done: false }
  if (def.setup && !def.setup(s, incident)) return null
  s.incidents.push(incident)
  if (s.incidents.length > 40) s.incidents.shift()
  return incident
}

/** Settle an incident with the chosen option. Returns the news line, or an error. */
export function settleIncident(s: GameState, id: string, choice: number, canAfford: (n: number) => boolean): { error?: string; text?: string } {
  const i = s.incidents.find((x) => x.id === id)
  const def = i && INCIDENTS[i.kind]
  if (!i || !def) return { error: 'There is nothing of that kind waiting for a decision' }
  if (i.done) return { error: 'That has already been dealt with' }
  const options = def.choices(s, i)
  const opt = Number.isInteger(choice) ? options[choice] : undefined
  if (!opt) return { error: 'Pick one of the options' }
  // the cheapest way out is always open, even into debt: otherwise a company at the end of its credit
  // could answer neither way, and the incident would wait for ever
  const cheapest = Math.min(...options.map((o) => Math.max(0, o.cost ?? 0)))
  if (opt.cost && opt.cost > cheapest && !canAfford(opt.cost)) return { error: `Not enough cash: "${opt.label}" costs $${opt.cost.toLocaleString('en-US')}. Pick the other option, or decide later.` }
  if (opt.cost) {
    s.cash -= opt.cost
    if (opt.cost > 0) s.cur.overhead += opt.cost
    else s.cur.other -= opt.cost
  }
  const text = def.resolve(s, i, choice)
  i.done = true
  i.result = text
  return { text }
}

/** Buyers for the big-ticket kinds of device, relative to the sizes in the market data. */
const TYPE_DEMAND: Partial<Record<DeviceType, number>> = { laptop: 0.6, desktop: 0.6, tv: 0.6 }
export const typeDemand = (type: DeviceType) => TYPE_DEMAND[type] ?? 1

/** How many buyers there are this year, relative to normal. */
export const economyNow = (s: GameState) => (s.economy && s.day <= s.economy.until ? s.economy.mult : 1)

/** The day the leading edge of the market reaches the last level of the tech tree (see marketLevel): twelve and a half years in. */
export const PEAK_DAY = (MAX_LEVEL - 3) * 2.5 * DAYS_PER_YEAR
/**
 * Prices people expect drift up over the years, as the devices themselves get
 * dearer to make. Once technology has gone as far as it goes, devices stop
 * getting dearer to make, and so do the prices people expect: left to climb
 * for ever, with costs standing still, they made every company's margin grow
 * without end (a phone that costs 300 to build selling for 9,000 by year 100).
 */
export const priceIndex = (day: number) => Math.pow(1.035, Math.min(day, PEAK_DAY) / DAYS_PER_YEAR)

// ---------------------------------------------------------------- rivals that react

export interface RivalNote {
  text: string
}

/** Monthly: rivals cut prices where they are losing, pull launches forward, and buy each other. */
export function rivalStrategy(s: GameState, endProduct: (id: string) => void): RivalNote[] {
  const notes: RivalNote[] = []
  const mine = onSale(s)
  for (const c of s.companies) {
    if (c.isPlayer || !c.alive) continue
    for (const seg of c.segments) {
      const theirs = s.products.find((p) => p.companyId === c.id && p.segment === seg && p.status === 'sale')
      const threat = mine.filter((p) => (p.segUnits[seg] ?? 0) > 0 && p.history.length > 0).sort((a, b) => (b.history.at(-1) ?? 0) - (a.history.at(-1) ?? 0))[0]
      if (!theirs || !threat) continue
      const lost = (threat.history.at(-1) ?? 0) > (theirs.history.at(-1) ?? 0) * 1.2
      if (!lost) continue
      // losing a segment to the player: answer on price, then bring the next model forward
      if (theirs.price * 0.85 > theirs.unitCost * 1.18 && s.day - (theirs.lastCut ?? -999) > 120 && rand(s) < 0.4) {
        theirs.price = Math.round(theirs.price * 0.95)
        theirs.lastCut = s.day
        if (rand(s) < 0.25) notes.push({ text: `${c.name} cut the price of ${theirs.name} to $${theirs.price} to answer ${threat.name}.` })
      } else if ((c.nextLaunch[seg] ?? 0) - s.day > 90) {
        c.nextLaunch[seg] = s.day + int(s, 30, 80)
        notes.push({ text: `${c.name} is rushing a new ${segmentInfo(seg)?.name.toLowerCase()} model to market.` })
      }
      c.awareness = clamp(c.awareness + 0.004, 0, 1)
    }
  }
  // a strong rival buys a failing one rather than let it die
  const failing = s.companies.find((c) => !c.isPlayer && c.alive && c.weakMonths >= 14 && !(s.stock.holdings[c.id]?.stake > 0.2))
  if (failing && rand(s) < 0.25) {
    const buyer = s.companies.filter((c) => !c.isPlayer && c.alive && c !== failing).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[int(s, 0, 2)]
    if (buyer) {
      for (const seg of failing.segments) {
        if (buyer.segments.includes(seg)) continue
        buyer.segments.push(seg)
        buyer.series[seg] = failing.series[seg]
        buyer.nextLaunch[seg] = s.day + int(s, 60, 200)
      }
      for (const p of s.products) if (p.companyId === failing.id && p.status === 'sale') endProduct(p.id)
      failing.alive = false
      failing.value = 0
      buyer.brand = clamp(buyer.brand + 0.02, 0.05, 1)
      notes.push({ text: `${buyer.name} has bought ${failing.name} and taken over its product lines.` })
    }
  }
  return notes
}
