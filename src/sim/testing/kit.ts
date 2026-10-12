// Things a player bot knows how to do, built from the real actions: design
// and price a device, keep it in stock, find desks for people, build rooms.
import { marketLevel } from '../../data/catalog'
import { segmentInfo, segmentsOf } from '../../data/devices'
import * as G from '../game'
import { bestSegment } from '../market'
import { pendingUnits, factoryLine } from '../ops'
import { has } from '../progress'
import { deriveVariant, generateDesign } from '../rivals'
import { evaluate } from '../scoring'
import { ITEMS, ROOMS, gridAt, inPlot, itemAt, reachable } from '../sites'
import { type DeviceDesign, type DeviceType, type GameState, type Role, type Site, monthCosts } from '../types'
import { hasType } from '../world'
import type { Play } from './play'

export const mine = (s: GameState) => s.products.filter((p) => p.companyId === 'player')
export const onSale = (s: GameState) => mine(s).filter((p) => p.status === 'sale')
export const lastProfit = (s: GameState) => {
  const r = s.reports[s.reports.length - 1]
  return r ? r.revenue + r.other - monthCosts(r) : 0
}
export const types = (s: GameState): DeviceType[] => (['phone', 'tablet', 'watch', 'laptop', 'desktop', 'console', 'earbuds', 'tv', 'foldable', 'headset', 'speaker', 'handheld'] as DeviceType[]).filter((t) => hasType(s, t))

/** The price that should earn most for a design: the bot's reading of the market. */
export function bestPrice(s: GameState, design: DeviceDesign): { price: number; cost: number; seg: string } {
  const ev = evaluate(design, s.levels, marketLevel(s.day), s.features, s.chips)
  const probe = { raw: ev.raw, featureBonus: ev.featureBonus, price: 0, type: design.type }
  let best = { price: Math.round(ev.unitCost * 2), score: -1, seg: segmentsOf(design.type)[0].id }
  for (const seg of segmentsOf(design.type)) {
    for (const m of [1.6, 1.8, 2.0, 2.3, 2.7, 3.2]) {
      const price = Math.round((ev.unitCost * m) / 0.85)
      const u = bestSegment({ ...probe, price }, G.player(s), s.day)
      const score = Math.pow(u.u, 3.5) * (m - 1) * seg.size
      if (u.seg.id === seg.id && score > best.score) best = { price, score, seg: seg.id }
    }
  }
  return { price: best.price, cost: ev.unitCost, seg: best.seg }
}

export interface LaunchOpts {
  /** Multiplies the price the bot thinks best. */
  price?: number
  family?: string
  variant?: string
  design?: DeviceDesign
  /** Share of cash to put into the first production run. */
  stockShare?: number
  marketing?: number
  keynote?: number
  mode?: 'contract' | 'factory'
  quantity?: number
}

/** Design, price and start a device. Returns the refusal, or null. */
export function launch(p: Play, type: DeviceType, o: LaunchOpts = {}): string | null | undefined {
  const s = p.s
  const design = o.design ?? G.starterDesign(s, type)
  const best = bestPrice(s, design)
  const price = Math.max(1, Math.round(best.price * (o.price ?? 1)))
  const pace = Math.max(0, ...mine(s).filter((x) => x.type === type).map((x) => Math.max(0, ...x.history.slice(-4))))
  const want = Math.max(4000, Math.min(400000, pace ? Math.round(pace * 3) : Math.round(segmentInfo(best.seg).size * 0.004 * Math.max(0.05, G.player(s).awareness * 3))))
  const quantity = o.quantity ?? Math.max(2000, Math.min(want, Math.floor((Math.max(0, s.cash) * (o.stockShare ?? 0.45)) / (best.cost * 1.1))))
  const mode = o.mode ?? (factoryLine(s)?.running ? 'factory' : 'contract')
  const family = o.family ?? `Bot ${type} ${mine(s).length + 1}-${p.serial++}`
  const marketing = o.marketing ?? Math.min(400e3, Math.max(50e3, Math.max(0, s.cash) * 0.05))
  return p.act('startProduct', (g) => G.startProduct(g, { design, family, variant: o.variant ?? '', price, tiers: [], quantity, mode, marketing, keynote: o.keynote }), { type, family, price, quantity, mode, marketing, keynote: o.keynote })
}

/** Order more of whatever is running short. */
export function restock(p: Play, cashShare = 0.5) {
  const s = p.s
  for (const x of onSale(s)) {
    const pace = Math.max(...x.history.slice(-3), x.monthUnits, 0)
    if (x.stock + pendingUnits(s, x.id) < pace * 1.2 && s.day - x.launchDay < 480) {
      const qty = Math.min(Math.round(pace * 2) + 1000, Math.floor((Math.max(0, s.cash) * cashShare) / (x.unitCost * 1.1)))
      if (qty > 500) p.act('orderProduction', (g) => G.orderProduction(g, x.id, qty, factoryLine(g)?.running ? 'factory' : 'contract'), x.id, qty)
    }
  }
}

/** A clear rectangle of open ground with nothing standing on it, or null. */
export function freeRect(site: Site, w: number, h: number, margin = 0): [number, number, number, number] | null {
  for (let y = margin; y + h <= site.h - margin; y++) {
    next: for (let x = margin; x + w <= site.w - margin; x++) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (gridAt(site, x + i, y + j) || itemAt(site, x + i, y + j)) continue next
      return [x, y, x + w - 1, y + h - 1]
    }
  }
  return null
}

/** Put one item down somewhere it is allowed, trying the tiles of every room that takes it. */
export function placeAnywhere(p: Play, ref: string, kind: string): boolean {
  const site = G.siteOf(p.s, ref)
  if (!site) return false
  const def = ITEMS[site.kind][kind]
  if (!def) return false
  const spots: [number, number][] = []
  for (let y = 0; y < site.h; y++) {
    for (let x = 0; x < site.w; x++) {
      const n = gridAt(site, x, y)
      const type = n ? site.rooms.find((r) => r.n === n)?.type : 'out'
      if (type && def.rooms.includes(type) && !itemAt(site, x, y)) spots.push([x, y])
    }
  }
  for (let tries = 0; tries < 12 && spots.length; tries++) {
    const [x, y] = spots.splice(Math.floor(p.rnd() * spots.length), 1)[0]
    if (p.act('placeItem', (g) => G.placeItem(g, ref, kind, x, y, 0), ref, kind, x, y) === null) return true
  }
  return false
}

export const seatCount = (s: GameState) => reachable(s.office).filter((i) => ITEMS.office[i.kind]?.seats).length

/** Build a room of a type at head office if there is none, moving to a bigger plot when the land runs out. */
export function ensureRoom(p: Play, type: string, w = 5, h = 4, furnish: string[] = []): boolean {
  const s = p.s
  if (s.office.rooms.some((r) => r.type === type) && !furnish.length) return true
  if (!s.office.rooms.some((r) => r.type === type)) {
    let spot = freeRect(s.office, w, h, 0)
    if (!spot && p.act('upgradeOffice', (g) => G.upgradeOffice(g)) === null) spot = freeRect(s.office, w, h, 1)
    if (!spot) return false
    const [x0, y0, x1, y1] = spot
    if (p.act('zoneRoom', (g) => G.zoneRoom(g, 'office', type, x0, y0, x1, y1, 'rect', undefined, undefined, true), type, x0, y0, x1, y1) !== null) return false
  }
  for (const kind of furnish) placeAnywhere(p, 'office', kind)
  return true
}

/** Make sure there are at least `n` desks people can reach. */
export function ensureSeats(p: Play, n: number): boolean {
  for (let guard = 0; guard < 40 && seatCount(p.s) < n; guard++) {
    if (placeAnywhere(p, 'office', 'desk')) continue
    // no floor left for a desk: add another open office
    const spot = freeRect(p.s.office, 6, 4, 0) ?? freeRect(p.s.office, 4, 3, 0)
    if (spot) {
      if (p.act('zoneRoom', (g) => G.zoneRoom(g, 'office', 'work', ...spot, 'rect', undefined, undefined, true), 'work', ...spot) !== null) return false
    } else if (p.act('upgradeOffice', (g) => G.upgradeOffice(g)) !== null) return false
  }
  return seatCount(p.s) >= n
}

/** Hire the best value applicant, of one job if given. Finds them a desk first. */
export function hireOne(p: Play, role?: Role): boolean {
  const s = p.s
  const pool = s.candidates.filter((e) => !role || e.role === role).sort((a, b) => b.skill / b.salary - a.skill / a.salary)
  if (!pool.length) return false
  if (!ensureSeats(p, s.staff.length + 1)) return false
  return p.act('hire', (g) => G.hire(g, pool[0].id), pool[0].id, role) === null
}

/** Fill any executive seat someone would take and the company can pay for. */
export function hireExecs(p: Play, cashFloor = 2e6) {
  const s = p.s
  for (const c of [...s.execPool].sort((a, b) => b.skill - a.skill)) {
    if (!c.exec || s.staff.some((e) => e.exec === c.exec) || s.cash < cashFloor + c.salary * 12) continue
    if (!ensureSeats(p, s.staff.length + 1)) return
    p.act('hireExec', (g) => G.hireExec(g, c.id), c.id, c.exec)
  }
}

/** Start researching whatever can be researched, spending a share of revenue on it. */
export function research(p: Play, budget: number, wide = false) {
  const s = p.s
  if (!has(s, 'research')) return
  s.rdBudget = Math.max(0, Math.round(budget))
  const want = wide ? 4 : 2
  if (s.activeResearch.length >= want) return
  const tracks = ['chipset', 'display', 'camera', 'battery', 'materials', 'design', 'charging']
  const ids = [...tracks, ...['hz90', 'hz120', 'punch', 'ip68', 'wireless', 'periscope', 'fpdisplay', 'hz144', 'sat', 'udc', 'hz240', 'nfc', 'stereo'].map((f) => `f:${f}`)]
  for (const id of ids) {
    if (s.activeResearch.length >= want) break
    if (s.activeResearch.includes(id)) continue
    const item = G.researchItem(s, id)
    if (item.available) p.act('toggleResearch', (g) => G.toggleResearch(g, id), id)
  }
}

/** A Pro, Lite or Max of something already on sale. */
export function launchVariant(p: Play, variant: 'Pro' | 'Lite' | 'Max') {
  const s = p.s
  const base = onSale(s).filter((x) => !x.variant && !mine(s).some((y) => y.family === x.family && y.variant === variant && y.status !== 'ended'))[0]
  if (!base) return
  let design: DeviceDesign
  try {
    design = deriveVariant(base.design, variant as never, s.levels, s.features)
  } catch (e) {
    p.flag(`threw: deriveVariant: ${String((e as Error)?.stack ?? e).slice(0, 300)}`)
    return
  }
  launch(p, base.type, { design, family: base.family, variant, stockShare: 0.2 })
}

/** A random design of a type, the way a rival would draw one, at the company's own levels. */
export function randomDesign(p: Play, type: DeviceType): DeviceDesign {
  const seg = p.pick(segmentsOf(type))
  return generateDesign(p.dice, { segment: seg.id, levels: p.s.levels, mLevel: marketLevel(p.s.day), layout: p.int(0, 4), palette: ['#22262c', '#d8d8dc'], logo: 'BOT' })
}

export const roomTypes = (site: Site) => Object.keys(ROOMS[site.kind])
export const itemKinds = (site: Site) => Object.keys(ITEMS[site.kind])
export const inside = (site: Site, x: number, y: number) => inPlot(site, x, y)
