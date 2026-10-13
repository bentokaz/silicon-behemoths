// Goals: milestones on the way from a garage to a behemoth. Each pays a small
// reward the first time it is reached.
import { DEVICE_TYPES, type GameState, monthCosts, wasReleased } from './types'
import { type CapId, has } from './progress'
import { REGIONS } from './regions'
import { builtTiles, lineStats } from './sites'
import { founderStake, marketCap } from './stock'

export interface Goal {
  id: string
  group: 'Products' | 'Company' | 'Reach' | 'Money'
  name: string
  note: string
  /** Progress from 0 to 1. */
  progress: (s: GameState) => number
  /** Cash reward. */
  cash: number
  fans?: number
  /** The capability (sim/progress.ts) this goal is about. Until it is open, the goal is not suggested. */
  needs?: CapId
}

const mine = (s: GameState) => s.products.filter((p) => p.companyId === 'player')
const units = (s: GameState) => s.companies[0].unitsTotal
const ratio = (v: number, target: number) => Math.max(0, Math.min(1, v / target))
const bestReview = (s: GameState) => mine(s).filter(wasReleased).reduce((m, p) => Math.max(m, p.reviewAvg), 0)
const bestMonth = (s: GameState) => s.reports.reduce((m, r) => Math.max(m, r.revenue), 0)
const share = (s: GameState) => {
  const last = s.shareHistory[s.shareHistory.length - 1]
  if (!last) return 0
  const total = Object.values(last.units).reduce((a, b) => a + b, 0)
  return total ? (last.units.player ?? 0) / total : 0
}

export const GOALS: Goal[] = [
  { id: 'launch', group: 'Products', name: 'Ship it', note: 'Put your first device on sale.', progress: (s) => (mine(s).some(wasReleased) ? 1 : 0), cash: 100e3 },
  { id: 'u10k', group: 'Products', name: 'Ten thousand', note: 'Sell 10,000 devices.', progress: (s) => ratio(units(s), 10e3), cash: 150e3 },
  { id: 'u100k', group: 'Products', name: 'Six figures', note: 'Sell 100,000 devices.', progress: (s) => ratio(units(s), 100e3), cash: 500e3 },
  { id: 'u1m', group: 'Products', name: 'The first million', note: 'Sell a million devices.', progress: (s) => ratio(units(s), 1e6), cash: 2e6 },
  { id: 'u10m', group: 'Products', name: 'In every pocket', note: 'Sell ten million devices.', progress: (s) => ratio(units(s), 10e6), cash: 10e6 },
  { id: 'u100m', group: 'Products', name: 'Behemoth', note: 'Sell a hundred million devices.', progress: (s) => ratio(units(s), 100e6), cash: 50e6 },
  { id: 'rev8', group: 'Products', name: 'Critics’ choice', note: 'Launch a device with a review average of 8 or more.', progress: (s) => ratio(bestReview(s), 8), cash: 300e3, fans: 2000 },
  { id: 'rev9', group: 'Products', name: 'Instant classic', note: 'Launch a device with a review average of 9 or more.', progress: (s) => ratio(bestReview(s), 9), cash: 1.5e6, fans: 20e3 },
  { id: 'types3', group: 'Products', name: 'Ecosystem', note: 'Have three kinds of device on sale at once.', progress: (s) => ratio(new Set(mine(s).filter((p) => p.status === 'sale').map((p) => p.type)).size, 3), cash: 1e6 },
  { id: 'typesAll', group: 'Products', name: 'Everything maker', note: `Have every kind of device on sale at once (${DEVICE_TYPES.length}).`, progress: (s) => ratio(new Set(mine(s).filter((p) => p.status === 'sale').map((p) => p.type)).size, DEVICE_TYPES.length), cash: 8e6 },
  { id: 'chip', needs: 'labs', group: 'Products', name: 'Own silicon', note: 'Finish a chip of your own.', progress: (s) => (s.chips.some((c) => c.status === 'ready') ? 1 : 0), cash: 1e6 },
  { id: 'os', needs: 'labs', group: 'Products', name: 'Own platform', note: 'Ship your own operating system.', progress: (s) => (s.os.own ? 1 : 0), cash: 1e6 },

  { id: 'variants', group: 'Products', name: 'A full range', note: 'Sell three versions of the same device at once (such as a Pro and a Lite).', progress: (s) => { const by = new Map<string, number>(); for (const p of mine(s)) if (p.status === 'sale') by.set(p.family, (by.get(p.family) ?? 0) + 1); return ratio(Math.max(0, ...by.values()), 3) }, cash: 800e3 },
  { id: 'design90', group: 'Products', name: 'Object of desire', note: 'Ship a device with a design score of 90% or more.', progress: (s) => ratio(mine(s).filter(wasReleased).reduce((m, p) => Math.max(m, p.designPct), 0), 90), cash: 600e3, fans: 5000 },
  { id: 'hit', group: 'Products', name: 'A hit', note: 'Sell a million units of a single device.', progress: (s) => ratio(mine(s).reduce((m, p) => Math.max(m, p.unitsSold), 0), 1e6), cash: 3e6 },
  { id: 'lines4', needs: 'research', group: 'Products', name: 'Branching out', note: 'Open four kinds of device.', progress: (s) => ratio(s.types ? s.types.length : DEVICE_TYPES.length, 4), cash: 1.5e6 },
  { id: 'happy', group: 'Products', name: 'Loved', note: 'Have a device on sale with owner satisfaction of 85% or more.', progress: (s) => ratio(mine(s).filter((p) => p.status === 'sale').reduce((m, p) => Math.max(m, p.satisfaction), 0), 0.85), cash: 500e3, fans: 8000 },
  { id: 'staff10', group: 'Company', name: 'A real team', note: 'Employ 10 people.', progress: (s) => ratio(s.staff.length, 10), cash: 100e3 },
  { id: 'staff50', group: 'Company', name: 'All hands', note: 'Employ 50 people.', progress: (s) => ratio(s.staff.length, 50), cash: 600e3 },
  { id: 'staff150', group: 'Company', name: 'Org chart', note: 'Employ 150 people.', progress: (s) => ratio(s.staff.length, 150), cash: 3e6 },
  { id: 'teams', needs: 'teams', group: 'Company', name: 'Chain of command', note: 'Run three teams, each with a lead.', progress: (s) => ratio(s.teams.filter((t) => t.leadId && s.staff.some((e) => e.id === t.leadId)).length, 3), cash: 200e3 },
  { id: 'rooms', group: 'Company', name: 'Room for everyone', note: 'Build six different kinds of room on the Campus.', progress: (s) => ratio(new Set(s.office.rooms.map((r) => r.type)).size, 6), cash: 250e3 },
  { id: 'hq', group: 'Company', name: 'Headquarters', note: 'Move to a headquarters site or larger.', progress: (s) => ratio(s.office.tier, 3), cash: 1e6 },
  { id: 'campus', group: 'Company', name: 'The campus', note: 'Build 2,000 square metres of rooms on a campus.', progress: (s) => (s.office.tier >= 4 ? ratio(builtTiles(s.office), 2000) : s.office.tier / 8), cash: 10e6 },
  { id: 'factory', needs: 'factory', group: 'Company', name: 'Made here', note: 'Run a working production line in your own factory.', progress: (s) => (!s.factory ? 0 : lineStats(s.factory).running ? 1 : 0.5), cash: 500e3 },
  { id: 'venue', needs: 'venue', group: 'Company', name: 'Our own stage', note: 'Host a keynote at a venue you built.', progress: (s) => (s.events.some((e) => e.done && e.type === 'keynote' && e.venue === 3) ? 1 : s.venue ? 0.5 : 0), cash: 1e6, fans: 10e3 },

  { id: 'morale', group: 'Company', name: 'A good place to work', note: 'Keep average morale at 80 or more with at least 20 staff.', progress: (s) => (s.staff.length >= 20 ? ratio(s.staff.reduce((a, e) => a + e.morale, 0) / s.staff.length, 80) : s.staff.length / 40), cash: 500e3 },
  { id: 'tower', group: 'Company', name: 'Skyline', note: 'Give the Campus building five storeys.', progress: (s) => ratio(s.office.floors, 5), cash: 1e6 },
  { id: 'crisis', group: 'Company', name: 'Steady hands', note: 'Deal with five incidents.', progress: (s) => ratio(s.incidents.filter((i) => i.done).length, 5), cash: 400e3 },
  { id: 'care', needs: 'carePolicy', group: 'Reach', name: 'Looked after', note: 'Sign up 100,000 care plan members.', progress: (s) => ratio(s.care.subscribers, 100e3), cash: 1e6 },
  { id: 'flagships', needs: 'stores', group: 'Reach', name: 'On every high street', note: 'Run a store in three different regions.', progress: (s) => ratio(new Set(s.stores.map((st) => st.region)).size, 3), cash: 2e6 },
  { id: 'fans100k', group: 'Reach', name: 'A following', note: 'Reach 100,000 fans.', progress: (s) => ratio(s.fans, 100e3), cash: 500e3 },
  { id: 'fans1m', group: 'Reach', name: 'A movement', note: 'Reach a million fans.', progress: (s) => ratio(s.fans, 1e6), cash: 4e6 },
  { id: 'store1', needs: 'stores', group: 'Reach', name: 'Open for business', note: 'Open your first store.', progress: (s) => ratio(s.stores.length, 1), cash: 200e3 },
  { id: 'store5', needs: 'stores', group: 'Reach', name: 'High street name', note: 'Run five stores.', progress: (s) => ratio(s.stores.length, 5), cash: 2e6 },
  { id: 'regions3', needs: 'world', group: 'Reach', name: 'Going abroad', note: 'Sell in three regions.', progress: (s) => ratio(REGIONS.filter((r) => s.regions[r.id]?.open).length, 3), cash: 1.5e6 },
  { id: 'regionsAll', needs: 'world', group: 'Reach', name: 'Worldwide', note: 'Sell in every region.', progress: (s) => ratio(REGIONS.filter((r) => s.regions[r.id]?.open).length, REGIONS.length), cash: 6e6 },
  { id: 'share10', group: 'Reach', name: 'On the chart', note: 'Take 10% of all devices sold in a month.', progress: (s) => ratio(share(s), 0.1), cash: 2e6 },
  { id: 'share30', group: 'Reach', name: 'Market leader', note: 'Take 30% of all devices sold in a month.', progress: (s) => ratio(share(s), 0.3), cash: 15e6 },
  { id: 'keynote', needs: 'events', group: 'Reach', name: 'One more thing', note: 'Score 85 or more at a launch keynote.', progress: (s) => ratio(s.events.reduce((m, e) => (e.done && e.type === 'keynote' ? Math.max(m, e.score ?? 0) : m), 0), 85), cash: 1e6, fans: 15e3 },

  { id: 'rev10m', group: 'Money', name: 'Eight figures', note: 'Earn $10M from sales in one month.', progress: (s) => ratio(bestMonth(s), 10e6), cash: 500e3 },
  { id: 'rev100m', group: 'Money', name: 'Nine figures', note: 'Earn $100M from sales in one month.', progress: (s) => ratio(bestMonth(s), 100e6), cash: 5e6 },
  { id: 'profit1', group: 'Money', name: 'In the black', note: 'Finish a month in profit.', progress: (s) => (s.reports.some((r) => r.revenue + r.other - monthCosts(r) > 0) ? 1 : 0), cash: 100e3 },
  { id: 'stake', needs: 'shares', group: 'Money', name: 'A seat at their table', note: 'Own a quarter of a rival.', progress: (s) => ratio(Math.max(0, ...Object.values(s.stock.holdings).map((h) => h.stake)), 0.25), cash: 1e6 },
  { id: 'backed', needs: 'shares', group: 'Money', name: 'Backed', note: 'Close a funding round with an investor.', progress: (s) => (s.stock.investors.length || s.stock.listed ? 1 : 0), cash: 0, fans: 500 },
  { id: 'ipo', needs: 'shares', group: 'Money', name: 'Ring the bell', note: 'List the company on the stock market.', progress: (s) => (s.stock.listed ? 1 : 0), cash: 0, fans: 20e3 },
  { id: 'cap1b', group: 'Money', name: 'Unicorn', note: 'Be worth a billion dollars.', progress: (s) => ratio(marketCap(s), 1e9), cash: 5e6 },
  { id: 'cap100b', group: 'Money', name: 'Mega cap', note: 'Be worth a hundred billion dollars.', progress: (s) => ratio(marketCap(s), 100e9), cash: 100e6 },
  { id: 'buyout', needs: 'shares', group: 'Money', name: 'Consolidation', note: 'Buy a rival outright.', progress: (s) => (s.companies.some((c) => c.acquired) ? 1 : 0), cash: 0, fans: 50e3 },
  { id: 'control', needs: 'shares', group: 'Money', name: 'Still yours', note: 'Be listed and still own more than half the company.', progress: (s) => (s.stock.listed && founderStake(s) > 0.5 ? 1 : 0), cash: 2e6 },
]

export const STAGES = ['Garage startup', 'Upstart', 'Challenger', 'Contender', 'Major player', 'Industry giant', 'Silicon behemoth']
/** The company's standing, from how many goals it has reached. */
export function stageOf(s: GameState): { name: string; index: number; done: number; total: number } {
  const done = Object.keys(s.goals).length
  const index = Math.min(STAGES.length - 1, Math.floor((done / GOALS.length) * (STAGES.length - 0.01)))
  return { name: STAGES[index], index, done, total: GOALS.length }
}

/** Marks newly reached goals and returns them. The caller pays the rewards. */
export function checkGoals(s: GameState): Goal[] {
  const hit: Goal[] = []
  for (const g of GOALS) {
    if (s.goals[g.id] !== undefined) continue
    if (g.progress(s) >= 1) {
      s.goals[g.id] = s.day
      hit.push(g)
    }
  }
  return hit
}

/** The unreached goals closest to completion, for the dashboard. Goals about something still locked wait their turn. */
export function nextGoals(s: GameState, count = 4): { goal: Goal; progress: number }[] {
  return GOALS.filter((g) => s.goals[g.id] === undefined && (!g.needs || has(s, g.needs)))
    .map((goal) => ({ goal, progress: goal.progress(s) }))
    .sort((a, b) => b.progress - a.progress)
    .slice(0, count)
}
