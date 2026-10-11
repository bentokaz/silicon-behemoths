// How a company grows into its screens. A new company in a guided game has a
// garage, a designer and a few desks; everything else is a capability it earns
// by hiring, researching, building and selling. Each capability is a row of
// data here: what it opens, why it is worth having and what it takes. The
// game records the day each one opened. In an open game (and in every save
// from before this existed) nothing is ever locked.
import { homeRegion } from './regions'
import { ITEMS, ROOMS, needsOf } from './sites'
import { EXECS, execOf, makeExec } from './staff'
import { trailing } from './stock'
import { EXEC_IDS, type ExecId, type GameState, type Role, type SiteKind } from './types'

export type CapId = 'research' | 'market' | 'studio' | 'marketing' | 'execs' | 'finance' | 'events' | 'rivals' | 'care' | 'teams' | 'people' | 'massMedia' | 'shares' | 'factory' | 'carePolicy' | 'stores' | 'world' | 'venue' | 'labs'

/** Somewhere in the interface a requirement can be worked on. */
export interface Where {
  /** A screen id (a Tab in the store). */
  tab: string
  /** A view inside that screen, for the screens that have several. */
  view?: string
  /** Staff applicants: the job to filter to. */
  role?: Role
}

export interface Req {
  /** What to do, as an instruction: "Hire a researcher". */
  label: string
  have: (s: GameState) => number
  need: number
  /** How the numbers read: plain counts unless stated. */
  unit?: 'money' | 'pct'
  where?: Where
}

export interface Capability {
  id: CapId
  name: string
  /** Icon name from components/icons.tsx. */
  icon: string
  /** 1 opens within minutes, 4 is hours in. Decides what the navigation shows as next. */
  stage: 1 | 2 | 3 | 4
  /** Screens this opens. */
  tabs?: string[]
  /** What it is. */
  what: string
  /** Why the player wants it. */
  why: string
  /** One line for the moment it opens. */
  now: string
  /** What becomes available, as short labels. */
  opens: string[]
  /** 'all' needs every requirement; 'any' needs one of them. */
  mode: 'all' | 'any'
  reqs: Req[]
  /** A requirement that also opens it but is not advertised (never lock the player out of something urgent). */
  also?: (s: GameState) => boolean
  /** The executive whose seat this capability leans on, if any. */
  exec?: ExecId
  /** Where "take me there" leads once it is open, when that is not its first screen. */
  home?: Where
}

// ---------------------------------------------------------------- requirements

const mine = (s: GameState) => s.products.filter((p) => p.companyId === 'player')
const launched = (s: GameState) => mine(s).filter((p) => p.status !== 'dev').length
const sold = (s: GameState) => s.companies[0].unitsTotal
const doing = (s: GameState, role: Role) => s.staff.filter((e) => e.role === role && !e.exec).length
/** Money put into research so far. */
const invested = (s: GameState) => s.reports.reduce((a, r) => a + r.rd, s.cur.rd)

const APPLICANTS = (role: Role): Where => ({ tab: 'staff', view: 'hire', role })
const SEARCH: Where = { tab: 'staff', view: 'execs' }
const DEVICES: Where = { tab: 'products' }

const hire = (role: Role, label: string): Req => ({ label, have: (s) => doing(s, role), need: 1, where: APPLICANTS(role) })
const seat = (id: ExecId): Req => ({ label: `Hire a ${EXECS[id].title}`, have: (s) => (execOf(s, id) ? 1 : 0), need: 1, where: SEARCH })
const onSale = (n: number): Req => ({ label: n === 1 ? 'Put your first device on sale' : `Put ${n} devices on sale`, have: launched, need: n, where: DEVICES })
const units = (n: number): Req => ({ label: `Sell ${n.toLocaleString('en-US')} devices`, have: sold, need: n, where: DEVICES })
const owners = (n: number): Req => ({ label: `Reach ${n.toLocaleString('en-US')} owners`, have: (s) => s.owners, need: n, where: DEVICES })
const people = (n: number): Req => ({ label: `Employ ${n} people`, have: (s) => s.staff.length, need: n, where: { tab: 'staff', view: 'hire' } })
const room = (type: string, label: string): Req => ({ label, have: (s) => (s.office.rooms.some((r) => r.type === type) ? 1 : 0), need: 1, where: { tab: 'office' } })
const open = (id: CapId, label: string, where: Where): Req => ({ label, have: (s) => (has(s, id) ? 1 : 0), need: 1, where })

/**
 * What a company must be before someone will take each seat. A capability
 * that leans on a seat repeats these, so its card shows the whole road.
 */
const ATTRACT: Record<ExecId, Req[]> = {
  cfo: [onSale(1)],
  cmo: [open('marketing', 'Open Marketing', APPLICANTS('marketer')), units(25e3)],
  people: [people(8)],
  coo: [units(75e3)],
  sales: [units(150e3)],
  care: [open('care', 'Open After-sales', APPLICANTS('support')), owners(100e3)],
  cto: [open('research', 'Open Research', APPLICANTS('researcher')), { label: 'Put $8M into research', have: invested, need: 8e6, unit: 'money', where: { tab: 'research' } }],
}

// ---------------------------------------------------------------- the capabilities

export const CAPS: Capability[] = [
  {
    id: 'research',
    name: 'Research',
    icon: 'research',
    stage: 1,
    tabs: ['research'],
    what: 'The technology tree and the list of device lines your company can open.',
    why: 'Better screens, chips and cameras, and later whole new kinds of device. Rivals never stop researching.',
    now: 'Set a monthly budget and pick a first project.',
    opens: ['Research screen', 'Technology projects', 'New device lines'],
    mode: 'any',
    reqs: [hire('researcher', 'Hire a researcher'), room('lab', 'Build a research lab')],
  },
  {
    id: 'market',
    name: 'Market',
    icon: 'market',
    stage: 1,
    tabs: ['market'],
    what: 'Every device on sale, the buyers in each segment and what they are choosing.',
    why: 'See who you are up against in each price band before you set a price.',
    now: 'See every device you are up against, segment by segment.',
    opens: ['Market screen'],
    mode: 'all',
    reqs: [{ label: 'Start developing your first device', have: (s) => mine(s).length, need: 1, where: DEVICES }],
  },
  {
    id: 'studio',
    name: 'Design studio',
    icon: 'design',
    stage: 1,
    what: 'The advanced editor, where every camera, button and port can be dragged into place, and a studio for designers on the campus.',
    why: 'Shapes nobody else is selling, and more polish on every design.',
    now: 'The designer has an Advanced mode, and the campus can have a design studio.',
    opens: ['Advanced editor', 'Design studio room', 'Design tables'],
    mode: 'any',
    reqs: [hire('designer', 'Hire a designer'), onSale(1)],
    home: { tab: 'office' },
  },
  {
    id: 'marketing',
    name: 'Marketing',
    icon: 'marketing',
    stage: 1,
    tabs: ['marketing'],
    what: 'Advertising campaigns for a device or for the brand: search ads, creators and reviewers.',
    why: 'Awareness is what turns a good device into sales. Almost nobody has heard of you yet.',
    now: 'Start a first campaign. Search ads are cheap and steady.',
    opens: ['Marketing screen', 'Search, social and reviewer campaigns', 'Marketing suite room'],
    mode: 'all',
    reqs: [hire('marketer', 'Hire a marketer')],
  },
  {
    id: 'execs',
    name: 'Executive search',
    icon: 'briefcase',
    stage: 2,
    what: 'A shortlist of people who could run a whole side of the company: finance, operations, marketing and more.',
    why: 'Each executive opens a part of the business and lends everyone a modest lift in their field.',
    now: 'A finance chief will talk to you. See the shortlist under Staff, Executives.',
    opens: ['Executives shortlist', 'Executive suite room'],
    mode: 'all',
    reqs: [onSale(1)],
    home: SEARCH,
  },
  {
    id: 'finance',
    name: 'Finance',
    icon: 'finance',
    stage: 2,
    tabs: ['finance'],
    exec: 'cfo',
    what: 'Monthly statements: where every dollar came from and went, month by month.',
    why: 'Know which costs are eating the margin. It is also the first step toward investors.',
    now: 'The books are open: statements for every month so far.',
    opens: ['Finance screen', 'Monthly statements'],
    mode: 'all',
    reqs: [...ATTRACT.cfo, seat('cfo')],
  },
  {
    id: 'events',
    name: 'Events',
    icon: 'mic',
    stage: 2,
    what: 'Launch keynotes in hired halls, trade show booths, fan meetups and developer conferences.',
    why: 'A good device on a big stage starts its life with a wave of hype.',
    now: 'Book a keynote with your next launch, or a booth at the next trade show.',
    opens: ['Launch keynotes', 'Trade shows', 'Fan meetups'],
    mode: 'all',
    reqs: [open('marketing', 'Open Marketing', APPLICANTS('marketer')), units(5000)],
    home: { tab: 'marketing' },
  },
  {
    id: 'rivals',
    name: 'Rivals',
    icon: 'rivals',
    stage: 2,
    tabs: ['rivals'],
    what: 'A file on every competitor: what they sell, how they are doing and what they are worth.',
    why: 'Know who is strong, who is fading and where there is room.',
    now: 'You are big enough to be noticed, and to keep files on the others.',
    opens: ['Rivals screen'],
    mode: 'all',
    reqs: [units(10e3)],
  },
  {
    id: 'care',
    name: 'After-sales',
    icon: 'care',
    stage: 2,
    tabs: ['care'],
    what: 'Repairs, support tickets and recalls: what happens after a device is sold.',
    why: 'Owners who are looked after become fans, and fans buy the next one.',
    now: 'See repairs, tickets and how owners feel. The campus can have a support centre.',
    opens: ['After-sales screen', 'Support centre room'],
    mode: 'any',
    reqs: [hire('support', 'Hire a support agent'), owners(10e3)],
    // a recall has a deadline: its screen opens with it, whatever else is true
    also: (s) => mine(s).some((p) => p.recall?.state === 'open'),
  },
  {
    id: 'teams',
    name: 'Teams',
    icon: 'team',
    stage: 2,
    what: 'Groups of people working under a lead.',
    why: 'A team with a good lead gets more done, and past eight people anyone without one slows down.',
    now: 'Sort people into teams under Staff, Teams.',
    opens: ['Teams and leads', 'Organise by role'],
    mode: 'all',
    reqs: [people(5)],
    home: { tab: 'staff', view: 'teams' },
  },
  {
    id: 'people',
    name: 'People policies',
    icon: 'policy',
    stage: 3,
    exec: 'people',
    what: 'Working hours, perks and training courses, and places on the campus to unwind.',
    why: 'Happier people do more and stay longer; courses raise their skill.',
    now: 'Set hours and perks, send people on courses, build a fitness room or an atrium.',
    opens: ['Working hours', 'Perks', 'Training courses', 'Fitness room', 'Atrium garden'],
    mode: 'all',
    reqs: [...ATTRACT.people, seat('people')],
    home: { tab: 'staff', view: 'policy' },
  },
  {
    id: 'massMedia',
    name: 'Mass media',
    icon: 'tv',
    stage: 3,
    exec: 'cmo',
    what: 'Television, billboards and esports sponsorship.',
    why: 'The channels that reach millions, for when search ads have done all they can.',
    now: 'Television, billboards and esports are open to you.',
    opens: ['Television', 'Billboards and transit', 'Esports sponsorship'],
    mode: 'all',
    reqs: [...ATTRACT.cmo, seat('cmo')],
    home: { tab: 'marketing' },
  },
  {
    id: 'shares',
    name: 'Shares',
    icon: 'shares',
    stage: 3,
    tabs: ['shares'],
    exec: 'cfo',
    what: 'Investors, funding rounds, the stock market, and stakes in your rivals.',
    why: 'Raise money without earning it first, and one day buy a competitor outright.',
    now: 'Investors will take a meeting. See what a stake in the company would fetch.',
    opens: ['Shares screen', 'Funding rounds', 'Going public', 'Stakes in rivals'],
    mode: 'all',
    reqs: [{ label: 'Have a Chief Financial Officer', have: (s) => (execOf(s, 'cfo') ? 1 : 0), need: 1, where: SEARCH }, { label: 'Take $20M in twelve months', have: (s) => trailing(s).revenue, need: 20e6, unit: 'money', where: DEVICES }],
  },
  {
    id: 'factory',
    name: 'Factory',
    icon: 'factory',
    stage: 3,
    tabs: ['factory'],
    exec: 'coo',
    what: 'A plant of your own: a production line you lay out machine by machine, and fixed-price supply contracts.',
    why: 'Cheaper units, fewer faults and no waiting on a contractor.',
    now: 'Buy land for a factory, or fix the price of a component for a year.',
    opens: ['Factory screen', 'Your own production line', 'Supply contracts'],
    mode: 'all',
    reqs: [...ATTRACT.coo, seat('coo')],
  },
  {
    id: 'carePolicy',
    name: 'Care policies',
    icon: 'shield',
    stage: 3,
    exec: 'care',
    what: 'Warranty length, years of software updates, trade-ins, refurbishing and a paid care plan.',
    why: 'Longer promises cost money and win loyalty; a care plan is income every month.',
    now: 'Set your warranty and update promises, and offer a care plan.',
    opens: ['Warranty and updates', 'Trade-in and refurbishing', 'Care plan'],
    mode: 'all',
    reqs: [...ATTRACT.care, seat('care')],
    home: { tab: 'care' },
  },
  {
    id: 'stores',
    name: 'Stores',
    icon: 'stores',
    stage: 3,
    tabs: ['stores'],
    exec: 'sales',
    what: 'Shops of your own on the high street, laid out table by table.',
    why: 'Sales with no retailer taking a cut, and a place where people meet the brand.',
    now: 'Open a first store on the high street.',
    opens: ['Stores screen', 'Your own shops'],
    mode: 'all',
    reqs: [...ATTRACT.sales, seat('sales')],
  },
  {
    id: 'world',
    name: 'Regions',
    icon: 'world',
    stage: 3,
    tabs: ['world'],
    what: 'The rest of the world: five more regions, each with its own tastes, prices and costs.',
    why: 'Your home market is a fraction of the buyers there are.',
    now: 'Pick a second region to sell in.',
    opens: ['Regions screen', 'Selling abroad', 'Local pricing'],
    mode: 'any',
    reqs: [seat('sales'), { label: 'Be known to half of your home market', have: (s) => s.regions[homeRegion(s)]?.awareness ?? 0, need: 0.5, unit: 'pct', where: { tab: 'marketing' } }],
  },
  {
    id: 'venue',
    name: 'Venue',
    icon: 'venue',
    stage: 4,
    tabs: ['venue'],
    exec: 'cmo',
    what: 'A hall of your own, built seat by seat, for keynotes on home ground.',
    why: 'Every launch on your own stage, for a fraction of what an arena charges.',
    now: 'Buy land for a venue of your own.',
    opens: ['Venue screen', 'Keynotes at your own venue'],
    mode: 'all',
    reqs: [{ label: 'Have a Head of Marketing', have: (s) => (execOf(s, 'cmo') ? 1 : 0), need: 1, where: SEARCH }, onSale(5)],
  },
  {
    id: 'labs',
    name: 'Labs',
    icon: 'labs',
    stage: 4,
    tabs: ['labs'],
    exec: 'cto',
    what: 'Chips of your own design and your own operating system.',
    why: 'Silicon nobody else has, software that earns every month, and licences rivals pay for.',
    now: 'Start a chip of your own, or the first version of your own operating system.',
    opens: ['Labs screen', 'Custom chips', 'Your own operating system', 'Server room'],
    mode: 'all',
    reqs: [...ATTRACT.cto, seat('cto')],
  },
]

const BY_ID = Object.fromEntries(CAPS.map((c) => [c.id, c])) as Record<CapId, Capability>
export const capOf = (id: CapId) => BY_ID[id]
/** Names for the stages of growth, for the tree. */
export const GROWTH_STAGES = ['Day one', 'First steps', 'First product', 'A growing company', 'An established one']
/** What every company has from its first day. */
export const START_WITH = ['City', 'Campus', 'Device designer', 'Devices', 'Hiring', 'Overview', 'Goals']

/** The capability that opens a screen, if the screen is not there from the start. */
export const capOfTab = (tab: string): CapId | undefined => CAPS.find((c) => c.tabs?.includes(tab))?.id
/** The capability an advertising channel belongs to. */
export const capOfChannel = (channel: string): CapId => (channel === 'tv' || channel === 'outdoor' || channel === 'esports' ? 'massMedia' : 'marketing')

// ---------------------------------------------------------------- reading the state

export const guided = (s: GameState) => s.config.progression === 'guided'
/** Is this capability open? Always true outside a guided game. */
export const has = (s: GameState, id: CapId) => !guided(s) || s.unlocks?.[id] !== undefined

export interface ReqState {
  label: string
  have: number
  need: number
  unit?: Req['unit']
  done: boolean
  where?: Where
}
const read = (s: GameState, r: Req): ReqState => {
  const have = r.have(s)
  return { label: r.label, have: Math.min(have, r.need), need: r.need, unit: r.unit, done: have >= r.need, where: r.where }
}
export const reqsOf = (s: GameState, id: CapId): ReqState[] => BY_ID[id].reqs.map((r) => read(s, r))
function met(s: GameState, c: Capability): boolean {
  if (c.also?.(s)) return true
  const list = c.reqs.map((r) => r.have(s) >= r.need)
  return c.mode === 'any' ? list.some(Boolean) : list.every(Boolean)
}
/** How far along a locked capability is, 0 to 1. */
export function ratioOf(s: GameState, id: CapId): number {
  if (has(s, id)) return 1
  const parts = reqsOf(s, id).map((r) => (r.need ? r.have / r.need : 1))
  return BY_ID[id].mode === 'any' ? Math.max(...parts) : parts.reduce((a, b) => a + b, 0) / parts.length
}
/** The requirement to point the player at: the first one not yet met. */
export const nextReq = (s: GameState, id: CapId): ReqState | undefined => reqsOf(s, id).find((r) => !r.done)

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
/** What is still to do, in a few words: "hire a researcher or build a research lab". */
export function needText(s: GameState, id: CapId): string {
  const c = BY_ID[id]
  const todo = reqsOf(s, id).filter((r) => !r.done)
  if (!todo.length) return ''
  return c.mode === 'any' ? todo.map((r) => lower(r.label)).join(' or ') : lower(todo[0].label)
}
/** Why the player cannot use something that belongs to a capability, or null when they can. */
export function locked(s: GameState, id: CapId): string | null {
  if (has(s, id)) return null
  return `${BY_ID[id].name} is not open yet: ${needText(s, id)} first.`
}
/** The same for a room or a piece of furniture. */
export function siteLocked(s: GameState, kind: SiteKind, what: 'room' | 'item', id: string): string | null {
  const cap = needsOf(kind, what, id) as CapId | undefined
  if (!cap || !BY_ID[cap] || has(s, cap)) return null
  const name = (what === 'room' ? ROOMS[kind][id]?.name : ITEMS[kind][id]?.name) ?? 'That'
  return `${name} comes with ${BY_ID[cap].name}: ${needText(s, cap)} first.`
}

/**
 * How far the company has come, 1 to 4: a stage counts as reached once half
 * of everything before it is open. Locked things up to this stage are shown
 * as next; the rest are kept out of the way.
 */
export function frontier(s: GameState): number {
  for (let n = 4; n > 1; n--) {
    const before = CAPS.filter((c) => c.stage < n)
    if (before.filter((c) => has(s, c.id)).length * 2 >= before.length) return n
  }
  return 1
}
/** Locked, but close enough to show: at the frontier, or already half done. */
export const isNear = (s: GameState, id: CapId) => !has(s, id) && (BY_ID[id].stage <= frontier(s) || ratioOf(s, id) >= 0.5)
export const lockedCaps = (s: GameState) => CAPS.filter((c) => !has(s, c.id))
/**
 * The locked screens the navigation shows, dimmed: only the few nearest to
 * opening, so the menu stays short however much is still ahead.
 */
export const nearTabs = (s: GameState, count = 3): CapId[] =>
  lockedCaps(s)
    .filter((c) => c.tabs?.length)
    .map((c) => ({ id: c.id, stage: c.stage, ratio: ratioOf(s, c.id) }))
    .sort((a, b) => a.stage - b.stage || b.ratio - a.ratio)
    .slice(0, count)
    .map((c) => c.id)
/** The locked capabilities closest to opening. */
export const nextCaps = (s: GameState, count = 3) =>
  lockedCaps(s)
    .map((c) => ({ cap: c, ratio: ratioOf(s, c.id) }))
    .sort((a, b) => a.cap.stage - b.cap.stage || b.ratio - a.ratio)
    .slice(0, count)

// ---------------------------------------------------------------- executives

/** Will anyone take this seat yet? */
export function execAvailable(s: GameState, id: ExecId): boolean {
  if (!guided(s)) return true
  return has(s, 'execs') && ATTRACT[id].every((r) => r.have(s) >= r.need)
}
/** What the company still has to be before someone will take the seat. */
export const execNeeds = (s: GameState, id: ExecId): ReqState[] => (guided(s) ? [...(has(s, 'execs') ? [] : BY_ID.execs.reqs), ...ATTRACT[id]].map((r) => read(s, r)).filter((r, i, all) => all.findIndex((x) => x.label === r.label) === i) : [])
/** The capabilities that lean on a seat. */
export const capsOfExec = (id: ExecId) => CAPS.filter((c) => c.exec === id)
/** Seats that were filled once and now stand empty. */
export const vacantSeats = (s: GameState): ExecId[] => EXEC_IDS.filter((id) => s.execSeats?.[id] && !execOf(s, id))

const SHORTLIST = 2
/** A fresh shortlist for every seat someone would take. Monthly. */
export function refreshExecs(s: GameState) {
  s.execPool = []
  topUp(s)
}
function topUp(s: GameState) {
  s.execPool = (s.execPool ?? []).filter((e) => e.exec && !execOf(s, e.exec))
  for (const id of EXEC_IDS) {
    if (execOf(s, id) || !execAvailable(s, id) || s.execPool.some((e) => e.exec === id)) continue
    // a seat that has just been emptied draws new faces, not the person who left it
    const gone = s.execSeats?.[id]?.vacant
    const shift = gone === undefined ? 0 : SHORTLIST + (gone % 89)
    for (let n = 0; n < SHORTLIST; n++) s.execPool.push(makeExec(s, id, n + shift))
  }
}

function post(s: GameState, kind: 'unlock' | 'alert', text: string) {
  s.news.unshift({ id: s.nextId++, day: s.day, kind, text })
  if (s.news.length > 140) s.news.length = 140
}

// ---------------------------------------------------------------- the step

/**
 * Open whatever has been earned, keep the executive seats and shortlist up to
 * date, and say so in the news. Run daily and after anything the player does.
 * Returns the capabilities that opened just now.
 */
export function stepProgress(s: GameState): CapId[] {
  const opened: CapId[] = []
  s.unlocks ??= {}
  s.execSeats ??= {}
  if (guided(s)) {
    // twice, so something that waits on another capability can open the same day
    for (let pass = 0; pass < 2; pass++) {
      for (const c of CAPS) {
        if (s.unlocks[c.id] !== undefined || !met(s, c)) continue
        s.unlocks[c.id] = s.day
        opened.push(c.id)
        post(s, 'unlock', `Now open: ${c.name}. ${c.now}`)
      }
    }
  }
  for (const id of EXEC_IDS) {
    const held = !!execOf(s, id)
    const seat = s.execSeats[id]
    if (held && (!seat || seat.vacant !== undefined)) s.execSeats[id] = { since: s.day }
    else if (!held && seat && seat.vacant === undefined) {
      seat.vacant = s.day
      const runs = capsOfExec(id).filter((c) => has(s, c.id)).map((c) => c.name)
      post(s, 'alert', `The ${EXECS[id].title} has gone and the seat is empty.${runs.length ? ` ${runs.join(' and ')} ${runs.length > 1 ? 'stay' : 'stays'} open.` : ''} ${EXECS[id].gap} Find a successor under Staff, Executives.`)
    }
  }
  topUp(s)
  return opened
}

/** Give a guided game everything at once. There is no way back. */
export function openEverything(s: GameState) {
  s.config.progression = 'open'
}
