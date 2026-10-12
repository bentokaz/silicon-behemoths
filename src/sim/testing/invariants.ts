// Invariants of a GameState: things that must hold after every tick and every
// action, whatever the player did. Used by the soak harness and by the
// regression tests. Each broken rule comes back as "rule: detail".
import { FEATURES, MAX_LEVEL } from '../../data/catalog'
import { SEGMENTS } from '../../data/devices'
import { bayStands, curveTiles } from '../curves'
import { careBonus, careSatisfaction, planAttach, recallCost, repairBenches, updatesCost, warrantyLoad } from '../care'
import { SAVE_VERSION, dateOf, devPlan, fmtDate, layoutQuote, monthLabel, newLayoutQuote, researchItem, starterDesign, trailingUnits } from '../game'
import { GOALS, nextGoals, stageOf } from '../goals'
import { CHANNELS, EVENTS, dailyTickets, nextFair } from '../growth'
import { devProgress, factoryLife, officeLife, researchLines, storeLife, venueLife } from '../life'
import { bestSegment, launchHype, segmentDemand, tierAverages } from '../market'
import { buildCost, factoryLine, pendingUnits, supplyPrice } from '../ops'
import { CAPS, capOfTab, execAvailable, execNeeds, frontier, guided, has, lockTip, locked, nearTabs, needText, nextCaps, nextReq, ratioOf, reqsOf, vacantSeats } from '../progress'
import { REGIONS, entryBlocked, regionIncome, regionOverheads, rivalReach, worldAwareness } from '../regions'
import { execFx, meetingFactor, monthlySalaries, perksCost, staffEffects, teamBonus, unmanaged } from '../staff'
import { founderStake, holdingIncome, ipoBlocked, issueBlocked, marketCap, netWorth, raiseBlocked, rivalValue, roundQuote, stakePrice, takeoverPrice, trailing, valuation } from '../stock'
import { chipAdoption, chipProjectCost, chipProjectDays, industryOs, osProjectDays, osShipQuality, servicesPerMonth, softwareBonus } from '../tech'
import { FACADES, GROUNDS, ITEMS, MAX_FLOORS, ROOFS, ROOMS, SITE_TIERS, cutAt, doorFits, gridAt, inPlot, isBoundary, itemTiles, lineStats, storeStats, typeAt, venueStats } from '../sites'
import { INCIDENTS, economyNow, typeDemand, unlockBlocked, unlockCost } from '../world'
import { COST_KEYS, DEVICE_TYPES, EXEC_IDS, type GameState, type MonthReport, ROLES, type Site, SUPPLY_CATS, TRACKS, monthCosts, wasReleased } from '../types'

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

/** Every number in a value that is not finite, every undefined inside an array, and anything that is not plain JSON. */
export function scan(v: unknown, path: string, out: string[], limit = 12): void {
  if (out.length >= limit) return
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`non-finite: ${path} = ${v}`)
    return
  }
  if (v === null || typeof v === 'string' || typeof v === 'boolean' || v === undefined) return
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      if (v[i] === undefined) out.push(`undefined-in-array: ${path}[${i}]`)
      else scan(v[i], `${path}[${i}]`, out, limit)
    }
    return
  }
  if (typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype) {
    out.push(`not-json: ${path} is ${typeof v}`)
    return
  }
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) scan(x, `${path}.${k}`, out, limit)
}

const unique = (ids: (string | number)[], what: string, out: string[]) => {
  const seen = new Set<string | number>()
  for (const id of ids) {
    if (seen.has(id)) {
      out.push(`duplicate-id: ${what} ${id}`)
      return
    }
    seen.add(id)
  }
}

const within = (v: number, lo: number, hi: number) => typeof v === 'number' && v >= lo - 1e-9 && v <= hi + 1e-9

/** Checks one plot: grid, rooms, walls, cuts, curves, ground and furniture agree with each other. */
export function checkSite(site: Site, label: string): string[] {
  const out: string[] = []
  const bad = (rule: string, detail: string) => out.push(`site-${rule}: ${label} ${detail}`)
  const tier = SITE_TIERS[site.kind]?.[site.tier]
  if (!tier) return [`site-tier: ${label} has no tier ${site.tier}`]
  if (site.w !== tier.w || site.h !== tier.h) bad('size', `is ${site.w}x${site.h}, its tier says ${tier.w}x${tier.h}`)
  if (site.grid.length !== site.w * site.h) bad('grid', `has ${site.grid.length} tiles for ${site.w}x${site.h}`)
  const rooms = new Map(site.rooms.map((r) => [r.n, r]))
  if (rooms.size !== site.rooms.length) bad('rooms', 'two rooms share a number')
  const used = new Set<number>()
  for (const n of site.grid) {
    if (!Number.isInteger(n) || n < 0) bad('grid', `holds ${n}`)
    else if (n) used.add(n)
  }
  for (const n of used) if (!rooms.has(n)) bad('orphan-tiles', `tiles numbered ${n} belong to no room`)
  for (const r of site.rooms) {
    if (!used.has(r.n)) bad('empty-room', `room ${r.n} (${r.type}) has no tiles`)
    if (r.n >= site.nextRoom) bad('next-room', `room ${r.n} is not below nextRoom ${site.nextRoom}`)
    const def = own(ROOMS[site.kind], r.type) ? ROOMS[site.kind][r.type] : undefined
    if (!def) bad('room-type', `room ${r.n} is an unknown type ${r.type}`)
    else if (!def.styles[r.style]) bad('room-style', `room ${r.n} has style ${r.style}`)
  }
  if (!FACADES[site.facade]) bad('facade', `is ${site.facade}`)
  if (!ROOFS[site.roof]) bad('roof', `is ${site.roof}`)
  if (!Number.isInteger(site.floors) || site.floors < 1 || site.floors > MAX_FLOORS) bad('floors', `is ${site.floors}`)
  const curved = site.curves?.length ? curveTiles(site) : new Map<string, unknown>()
  // furniture
  const taken = new Map<string, string>()
  unique(site.items.map((i) => i.id), `${label} item`, out)
  for (const it of site.items) {
    const def = own(ITEMS[site.kind], it.kind) ? ITEMS[site.kind][it.kind] : undefined
    if (!def) {
      bad('item-kind', `item ${it.id} is an unknown kind ${it.kind}`)
      continue
    }
    if (!Number.isInteger(it.x) || !Number.isInteger(it.y) || ![0, 1, 2, 3].includes(it.rot)) {
      bad('item-place', `${it.kind} ${it.id} at ${it.x},${it.y} rot ${it.rot}`)
      continue
    }
    let room = -1
    for (const [x, y] of itemTiles(site, it)) {
      const key = `${x},${y}`
      if (!inPlot(site, x, y)) bad('item-off-plot', `${it.kind} ${it.id} at ${key}`)
      else {
        if (cutAt(site, x, y)) bad('item-on-cut', `${it.kind} ${it.id} at ${key}`)
        if (curved.has(key)) bad('item-on-curve', `${it.kind} ${it.id} at ${key}`)
        if (!def.rooms.includes(typeAt(site, x, y))) bad('item-wrong-room', `${it.kind} ${it.id} at ${key} stands in ${typeAt(site, x, y)}`)
        const n = gridAt(site, x, y)
        if (room >= 0 && n !== room) bad('item-straddles', `${it.kind} ${it.id} at ${key}`)
        room = n
      }
      if (taken.has(key)) bad('item-overlap', `${it.kind} ${it.id} and ${taken.get(key)} share ${key}`)
      taken.set(key, it.id)
    }
  }
  // walls
  unique(site.walls.map((w) => `${w.x},${w.y},${w.side}`), `${label} wall place`, out)
  unique(site.walls.map((w) => w.id), `${label} wall`, out)
  for (const w of site.walls) {
    if (!['glass', 'door', 'open'].includes(w.kind)) bad('wall-kind', `${w.id} is ${w.kind}`)
    if (!isBoundary(site, w.x, w.y, w.side)) bad('orphan-wall', `${w.kind} ${w.id} at ${w.x},${w.y},${w.side} is on no wall`)
    else if (w.kind !== 'glass' && !doorFits(site, w.x, w.y, w.side)) bad('short-door', `${w.kind} ${w.id} at ${w.x},${w.y},${w.side} has no whole metre of wall`)
  }
  for (const key of Object.keys(site.cuts ?? {})) {
    const [x, y] = key.split(',').map(Number)
    if (!gridAt(site, x, y)) bad('orphan-cut', `cut at ${key} is on open ground`)
    if (!['ne', 'nw', 'se', 'sw'].includes(site.cuts![key])) bad('cut-corner', `cut at ${key} is ${site.cuts![key]}`)
  }
  site.curves?.forEach((c, i) => {
    if (!rooms.has(c.room)) bad('orphan-curve', `curve ${i} belongs to room ${c.room}, which is gone`)
    for (const [bay, kind] of Object.entries(c.walls ?? {})) {
      if (!['glass', 'door', 'open'].includes(kind)) bad('bay-kind', `curve ${i} bay ${bay} is ${kind}`)
      if (!bayStands(site, i, bay)) bad('orphan-bay', `curve ${i} has a ${kind} in bay ${bay}, where no wall stands`)
    }
    for (const key of Object.keys(c.square ?? {})) {
      const [x, y] = key.split(',').map(Number)
      if (!inPlot(site, x, y)) bad('square-off-plot', `curve ${i} squares off ${key}`)
    }
  })
  for (const [key, id] of Object.entries(site.floor)) {
    const [x, y] = key.split(',').map(Number)
    if (!inPlot(site, x, y)) bad('floor-off-plot', `ground finish at ${key}`)
    if (!GROUNDS.some((g) => g.id === id)) bad('floor-kind', `ground finish ${id} at ${key}`)
  }
  // the readouts built on a plot never fail on it
  try {
    if (site.kind === 'factory') {
      const l = lineStats(site)
      if (![l.throughput, l.defectRate, l.runCost].every(Number.isFinite) || l.defectRate < 0 || l.defectRate > 1 || l.throughput < 0) bad('line-stats', JSON.stringify({ t: l.throughput, d: l.defectRate, r: l.runCost }))
    } else if (site.kind === 'store') {
      const st = storeStats(site)
      if (![st.capacity, st.appeal, st.wages].every(Number.isFinite) || st.appeal < 0 || st.appeal > 1) bad('store-stats', JSON.stringify(st))
    } else if (site.kind === 'venue') {
      const v = venueStats(site)
      if (![v.seats, v.production, v.reach].every(Number.isFinite) || v.reach < 0) bad('venue-stats', JSON.stringify(v))
    }
  } catch (e) {
    bad('stats-throw', String((e as Error)?.stack ?? e).slice(0, 300))
  }
  return out
}

/** Numbers that are not finite, anywhere in a value: through arrays, plain objects, maps and sets. */
function badNumbers(v: unknown, path: string, out: string[], depth = 0): void {
  if (out.length >= 6 || depth > 8) return
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${path} = ${v}`)
  } else if (v instanceof Map) for (const [k, x] of v) badNumbers(x, `${path}.get(${String(k)})`, out, depth + 1)
  else if (v instanceof Set) for (const x of v) badNumbers(x, `${path}{}`, out, depth + 1)
  else if (Array.isArray(v)) v.forEach((x, i) => badNumbers(x, `${path}[${i > 2 ? 'n' : i}]`, out, depth + 1))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) badNumbers(x, `${path}.${k}`, out, depth + 1)
}

/**
 * Everything the screens read from the game besides the state itself: none of
 * it may fail or come out as something that is not a number, whatever state
 * the company is in. Changes nothing (the state is the same text afterwards).
 */
export function checkReadouts(s: GameState): string[] {
  const out: string[] = []
  const ask = (name: string, fn: () => unknown) => {
    try {
      const bad: string[] = []
      badNumbers(fn(), name, bad)
      for (const b of bad) out.push(`readout: ${b}`)
    } catch (e) {
      out.push(`readout-threw: ${name}: ${String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ').slice(0, 300)}`)
    }
  }
  const mine = s.products.filter((p) => p.companyId === 'player')
  ask('officeLife', () => officeLife(s))
  ask('factoryLife', () => factoryLife(s))
  ask('venueLife', () => venueLife(s))
  ask('researchLines', () => researchLines(s))
  for (const st of s.stores.slice(0, 4)) ask('storeLife', () => storeLife(s, st.id))
  ask('devProgress', () => mine.slice(-8).map((p) => devProgress(s, p)))
  ask('staffEffects', () => [staffEffects(s), execFx(s), unmanaged(s), meetingFactor(s), s.teams.map((t) => teamBonus(s, t)), monthlySalaries(s), perksCost(s)])
  ask('stock', () => [valuation(s), marketCap(s), founderStake(s), netWorth(s), trailing(s), roundQuote(s, 0.1), raiseBlocked(s), ipoBlocked(s), issueBlocked(s), holdingIncome(s), s.companies.map((c) => [rivalValue(c), stakePrice(c, 0.1), takeoverPrice(s, c)])])
  ask('progress', () => [frontier(s), nearTabs(s), nextCaps(s).map((c) => c.ratio), vacantSeats(s), CAPS.map((c) => [ratioOf(s, c.id), needText(s, c.id), lockTip(s, c.id), locked(s, c.id), reqsOf(s, c.id).map((r) => r.have)]), EXEC_IDS.map((id) => [execAvailable(s, id), execNeeds(s, id).length])])
  ask('goals', () => [stageOf(s), nextGoals(s, 99).map((g) => g.progress), GOALS.map((g) => g.progress(s))])
  ask('research', () => [...TRACKS, ...FEATURES.map((f) => `f:${f.id}`)].map((id) => researchItem(s, id).cost))
  ask('lines', () => DEVICE_TYPES.map((t) => [unlockCost(s, t), unlockBlocked(s, t)]))
  ask('care', () => [updatesCost(s), planAttach(s, 0.7), repairBenches(s), warrantyLoad(s), careBonus(s), careSatisfaction(s), mine.slice(-5).map((p) => recallCost(p))])
  ask('tech', () => [chipProjectCost(s.levels.chipset), chipProjectDays(s), s.chips.map((c) => chipAdoption(s, c)), osProjectDays(s, !s.os.own), osShipQuality(s, s.os.features), softwareBonus(s), servicesPerMonth(s), industryOs(s.day)])
  ask('ops', () => [factoryLine(s)?.throughput, SUPPLY_CATS.map((c) => supplyPrice(s, c)), mine.slice(-5).map((p) => [buildCost(s, p, 'contract'), buildCost(s, p, 'factory'), pendingUnits(s, p.id)])])
  ask('regions', () => [worldAwareness(s), regionOverheads(s), REGIONS.map((r) => [regionIncome(s, r.id), entryBlocked(s, r.id)]), s.companies.map((c) => REGIONS.map((r) => rivalReach(c, r.id)))])
  ask('market', () => [trailingUnits(s).map((x) => x.units), economyNow(s), dailyTickets(s), mine.filter((p) => p.status === 'sale').slice(-5).map((p) => [bestSegment(p, s.companies[0], s.day).u, launchHype(p, s.day), tierAverages(p)])])
  ask('incidents', () => s.incidents.filter((i) => !i.done).map((i) => [INCIDENTS[i.kind].text(s, i), INCIDENTS[i.kind].choices(s, i).map((c) => c.cost ?? 0)]))
  ask('dates', () => [dateOf(s.day).year, fmtDate(s.day).length, monthLabel(Math.floor(s.day / 30)).length, nextFair(s.day).day])
  ask('designs', () => (s.day % 90 === 0 ? (s.types ?? DEVICE_TYPES).map((t) => devPlan(starterDesign(s, t), s).cost) : []))
  if (s.stores.length > 1) ask('layoutQuote', () => [layoutQuote(s, s.stores[0].id, s.stores[1].id).cost, newLayoutQuote(s, s.stores[0].id, 0).cost])
  return out
}

const net = (r: MonthReport) => r.revenue + r.other + r.funding - monthCosts(r)

export interface CheckOpts {
  /** Skip the checks of the plots (the slowest part), for the checks made after every single action. */
  light?: boolean
  /** Skip the round trip through JSON, which costs as much as several days of simulation. */
  noJson?: boolean
  /** Cash moved outside the books on purpose (a migration refund). */
  offBooks?: number
}

/** Every broken rule in a state. An empty list means it is sound. */
export function checkState(s: GameState, opts: CheckOpts = {}): string[] {
  const out: string[] = []
  const bad = (rule: string, detail: string) => out.push(`${rule}: ${detail}`)
  scan(s, 's', out)
  if (out.length) return out
  if (s.version !== SAVE_VERSION) bad('version', `${s.version}`)
  if (!Number.isInteger(s.day) || s.day < 0) bad('day', `${s.day}`)
  if (!Number.isInteger(s.nextId)) bad('next-id', `${s.nextId}`)
  if (s.gameOver && !s.overReason) bad('game-over', 'no reason given')
  if (s.debtDays < 0 || !Number.isInteger(s.debtDays)) bad('debt-days', `${s.debtDays}`)

  // ---- the books: every dollar that moved is on a line of a monthly report
  const tol = (v: number) => 1 + Math.abs(v) * 1e-9
  for (const r of [...s.reports, s.cur]) {
    for (const k of COST_KEYS) if (r[k] < -tol(r[k]) && k !== 'overhead' && k !== 'facilities') bad('negative-cost', `month ${r.month} ${k} = ${r[k]}`)
    if (r.revenue < -1e-6 || r.other < -1e-6 || r.units < 0) bad('negative-income', `month ${r.month} revenue ${r.revenue} other ${r.other} units ${r.units}`)
  }
  for (let i = 1; i < s.reports.length; i++) {
    const a = s.reports[i - 1]
    const b = s.reports[i]
    if (b.month !== a.month + 1) bad('report-order', `month ${a.month} is followed by ${b.month}`)
    if (Math.abs(b.cash - a.cash - net(b)) > tol(b.cash) + tol(net(b))) bad('books', `month ${b.month}: cash moved ${(b.cash - a.cash).toFixed(2)} but the lines add up to ${net(b).toFixed(2)}`)
  }
  const last = s.reports[s.reports.length - 1]
  const opening = last ? last.cash : s.reports.length === 0 && s.cur.month === 0 ? s.config.startCash : undefined
  if (opening !== undefined && Math.abs(s.cash - opening - net(s.cur) - (opts.offBooks ?? 0)) > tol(s.cash) + tol(net(s.cur))) bad('books', `this month: cash moved ${(s.cash - opening).toFixed(2)} but the lines add up to ${net(s.cur).toFixed(2)}`)
  if (s.cur.month !== Math.floor(s.day / 30)) bad('report-month', `day ${s.day} but the open report is month ${s.cur.month}`)

  // ---- companies and products
  unique(s.companies.map((c) => c.id), 'company', out)
  if (!s.companies[0]?.isPlayer || s.companies[0].id !== 'player') bad('player', 'the first company is not the player')
  const companies = new Map(s.companies.map((c) => [c.id, c]))
  for (const c of s.companies) {
    if (!within(c.brand, 0.05, 1)) bad('brand', `${c.id} ${c.brand}`)
    if (!within(c.awareness, 0, 1)) bad('awareness', `${c.id} ${c.awareness}`)
    if ((c.value ?? 0) < 0) bad('value', `${c.id} ${c.value}`)
    if (c.unitsYear.length > 12 || (c.revYear?.length ?? 0) > 12 || (c.valueHistory?.length ?? 0) > 60) bad('unbounded', `company ${c.id} history`)
    if (c.unitsTotal < 0 || c.revenueTotal < 0) bad('negative-total', `${c.id}`)
    for (const seg of c.segments) if (!SEGMENTS.some((x) => x.id === seg)) bad('segment', `${c.id} sells in ${seg}`)
  }
  unique(s.products.map((p) => p.id), 'product', out)
  const products = new Map(s.products.map((p) => [p.id, p]))
  const names = new Set<string>()
  for (const p of s.products) {
    const c = companies.get(p.companyId)
    if (!c) {
      bad('product-company', `${p.id} belongs to ${p.companyId}`)
      continue
    }
    if (!DEVICE_TYPES.includes(p.type) || p.type !== p.design.type) bad('product-type', `${p.id} ${p.type}/${p.design.type}`)
    if (!(p.price >= 1) || !Number.isInteger(p.price)) bad('price', `${p.id} ${p.name} price ${p.price}`)
    if (p.stock < 0) bad('negative-stock', `${p.id} ${p.stock}`)
    if (c.isPlayer && !Number.isInteger(p.stock)) bad('fractional-stock', `${p.id} ${p.stock}`)
    if (p.unitsSold < 0 || p.monthUnits < 0 || p.revenue < 0 || p.carry < 0) bad('negative-sales', `${p.id} sold ${p.unitsSold} month ${p.monthUnits} revenue ${p.revenue} carry ${p.carry}`)
    if (!(p.unitCost > 0)) bad('unit-cost', `${p.id} ${p.unitCost}`)
    if (!within(p.defectRate, 0, 1)) bad('defect-rate', `${p.id} ${p.defectRate}`)
    if (!within(p.satisfaction, 0, 1)) bad('satisfaction', `${p.id} ${p.satisfaction}`)
    if (!within(p.hype, 0, 1)) bad('hype', `${p.id} ${p.hype}`)
    if (p.marketing < 0) bad('marketing', `${p.id} ${p.marketing}`)
    if (wasReleased(p) && !within(p.reviewAvg, 1, 10)) bad('review', `${p.id} ${p.reviewAvg}`)
    if (p.devDaysLeft < 0 && p.status === 'dev') bad('dev-days', `${p.id} ${p.devDaysLeft}`)
    for (const [k, v] of Object.entries(p.buzz)) if (!within(v, 0, 1)) bad('buzz', `${p.id} ${k} ${v}`)
    for (const t of p.tiers) if (!(t.price > p.price) || !(t.storage > p.design.specs.storage)) bad('tier', `${p.id} tier ${t.storage} at ${t.price} against base ${p.design.specs.storage} at ${p.price}`)
    if (p.history.length > 60 || p.feedback.length > 14) bad('unbounded', `product ${p.id} history ${p.history.length} feedback ${p.feedback.length}`)
    if (p.status === 'ended' && p.endDay === undefined) bad('end-day', `${p.id}`)
    if (c.isPlayer && p.status !== 'ended') {
      if (names.has(p.name)) bad('duplicate-name', `two live devices are called ${p.name}`)
      names.add(p.name)
    }
    if (p.recall && !['open', 'done', 'ignored'].includes(p.recall.state)) bad('recall', `${p.id}`)
  }
  for (const [id, v] of Object.entries(s.monthShare)) {
    if (!companies.has(id)) bad('share-company', id)
    if (v < 0) bad('negative-share', `${id} ${v}`)
  }
  // nobody sells more than there are buyers: rivals only reach the segments' own demand
  const month = s.shareHistory[s.shareHistory.length - 1]
  if (month) {
    const day = (month.month + 1) * 30 - 15
    const demand = SEGMENTS.reduce((a, seg) => a + segmentDemand(seg, day) * typeDemand(seg.type) * 30, 0)
    const rivals = Object.entries(month.units).reduce((a, [id, v]) => a + (id === 'player' ? 0 : v), 0)
    if (rivals > demand * 1.15 * 1.1 * 1.02) bad('oversold', `rivals sold ${Math.round(rivals)} in month ${month.month}; there were about ${Math.round(demand)} buyers`)
  }

  // ---- research
  for (const t of TRACKS) if (!Number.isInteger(s.levels[t]) || s.levels[t] < 0 || s.levels[t] > MAX_LEVEL) bad('level', `${t} ${s.levels[t]}`)
  if (Object.keys(s.levels).length !== TRACKS.length) bad('level', `extra tracks: ${Object.keys(s.levels).join(',')}`)
  unique(s.features, 'feature', out)
  for (const f of s.features) if (!FEATURES.some((x) => x.id === f)) bad('feature', f)
  unique(s.activeResearch, 'active research', out)
  for (const id of s.activeResearch) if (!(TRACKS as string[]).includes(id) && !(id.startsWith('f:') && FEATURES.some((f) => f.id === id.slice(2)))) bad('research-id', id)
  for (const [k, v] of Object.entries(s.progress)) if (v < 0) bad('progress', `${k} ${v}`)
  if (s.rdBudget < 0) bad('rd-budget', `${s.rdBudget}`)
  if (s.types) {
    unique(s.types, 'device line', out)
    for (const t of s.types) if (!DEVICE_TYPES.includes(t)) bad('device-line', t)
  }

  // ---- people
  unique(s.staff.map((e) => e.id), 'employee', out)
  unique(s.candidates.map((e) => e.id), 'candidate', out)
  const staff = new Set(s.staff.map((e) => e.id))
  for (const e of [...s.staff, ...s.candidates, ...s.execPool]) {
    if (!ROLES.includes(e.role)) bad('role', `${e.id} ${e.role}`)
    if (!(e.salary > 0)) bad('salary', `${e.id} ${e.name} ${e.salary}`)
    if (!within(e.morale, 0, 100)) bad('morale', `${e.id} ${e.morale}`)
    if (!within(e.skill, 0, 100) || !within(e.potential, 0, 100)) bad('skill', `${e.id} skill ${e.skill} potential ${e.potential}`)
    if (e.ask !== undefined && !(e.ask > 0)) bad('ask', `${e.id} ${e.ask}`)
    if (e.exec && !EXEC_IDS.includes(e.exec)) bad('exec-seat', `${e.id} ${e.exec}`)
  }
  for (const id of EXEC_IDS) {
    const held = s.staff.filter((e) => e.exec === id).length
    if (held > 1) bad('exec-seat', `${held} people hold ${id}`)
    const seat = s.execSeats[id]
    if (held && (!seat || seat.vacant !== undefined)) bad('exec-seat', `${id} is held but its seat says ${JSON.stringify(seat)}`)
    if (!held && seat && seat.vacant === undefined) bad('exec-seat', `${id} is empty but its seat does not say since when`)
    if (held && s.execPool.some((e) => e.exec === id)) bad('exec-pool', `${id} is held and still on the shortlist`)
  }
  for (const e of s.execPool) if (!e.exec) bad('exec-pool', `${e.id} has no seat`)
  unique(s.teams.map((t) => t.id), 'team', out)
  const inTeam = new Set<string>()
  for (const t of s.teams) {
    for (const m of t.members) {
      if (!staff.has(m)) bad('team-member', `team ${t.id} lists ${m}, who does not work here`)
      if (inTeam.has(m)) bad('team-member', `${m} is in two teams`)
      inTeam.add(m)
    }
    if (t.leadId !== undefined && !t.members.includes(t.leadId)) bad('team-lead', `team ${t.id} is led by ${t.leadId}, who is not in it`)
  }
  if (![0, 1, 2, 3].includes(s.policy.perks) || !['relaxed', 'standard', 'crunch'].includes(s.policy.hours)) bad('policy', JSON.stringify(s.policy))

  // ---- operations
  unique(s.orders.map((o) => o.id), 'order', out)
  for (const o of s.orders) {
    const p = products.get(o.productId)
    if (!p || p.companyId !== 'player') bad('order-product', `${o.id} is for ${o.productId}`)
    if (!Number.isInteger(o.quantity) || o.quantity <= 0 || !Number.isInteger(o.done) || o.done < 0 || o.done > o.quantity) bad('order-quantity', `${o.id} ${o.done}/${o.quantity}`)
  }
  for (const c of SUPPLY_CATS) {
    if (!within(s.supply.index[c], 0.8, 1.25) || s.supply.shock[c] < 0 || s.supply.shockDays[c] < 0) bad('supply', `${c} index ${s.supply.index[c]} shock ${s.supply.shock[c]} days ${s.supply.shockDays[c]}`)
    if (s.supply.history[c].length > 37) bad('unbounded', `supply history ${c}`)
  }
  unique(s.campaigns.map((c) => c.id), 'campaign', out)
  for (const c of s.campaigns) {
    if (!own(CHANNELS, c.channel)) bad('campaign-channel', `${c.id} ${c.channel}`)
    else if (!(c.monthly >= CHANNELS[c.channel].min)) bad('campaign-budget', `${c.id} ${c.monthly}`)
    if (c.target !== 'brand' && products.get(c.target)?.companyId !== 'player') bad('campaign-target', `${c.id} advertises ${c.target}`)
    if (c.region !== undefined && !REGIONS.some((r) => r.id === c.region)) bad('campaign-region', `${c.id} ${c.region}`)
    if (c.spent < 0) bad('campaign-spent', `${c.id} ${c.spent}`)
  }
  unique(s.events.map((e) => e.id), 'event', out)
  for (const e of s.events) {
    if (!own(EVENTS, e.type) || !EVENTS[e.type].venues[e.venue]) bad('event', `${e.id} ${e.type} venue ${e.venue}`)
    if (e.productId !== undefined && !products.has(e.productId)) bad('event-product', `${e.id} ${e.productId}`)
    if (!Number.isInteger(e.day)) bad('event-day', `${e.id} ${e.day}`)
    if (e.done && e.score !== undefined && !within(e.score, 0, 100)) bad('event-score', `${e.id} ${e.score}`)
  }
  unique(s.chips.map((c) => c.id), 'chip', out)
  for (const c of s.chips) {
    if (c.licenceFee < 0 || c.licenceIncome < 0 || !within(c.power, 0, 1) || !within(c.graphics, 0, 1) || !within(c.efficiency, 0, 1) || c.power + c.graphics + c.efficiency > 2 + 1e-6) bad('chip', JSON.stringify(c))
    if (!c.name) bad('chip-name', c.id)
  }
  if (s.os.quality < 0 || s.os.servicesIncome < 0) bad('os', JSON.stringify(s.os))
  unique(s.os.features, 'os feature', out)

  // ---- owners, regions, care
  if (s.owners < 0 || s.fans < 0) bad('owners', `owners ${s.owners} fans ${s.fans}`)
  for (const r of REGIONS) {
    const st = s.regions[r.id]
    if (!st) {
      bad('region', `${r.id} is missing`)
      continue
    }
    if (!within(st.awareness, 0, 1)) bad('awareness', `region ${r.id} ${st.awareness}`)
    if (!within(st.priceAdj, 0.7, 1.4)) bad('region-price', `${r.id} ${st.priceAdj}`)
    if (st.history.length > 36 || st.monthUnits < 0) bad('unbounded', `region ${r.id}`)
  }
  if (Object.keys(s.regions).length !== REGIONS.length) bad('region', `unknown regions: ${Object.keys(s.regions).join(',')}`)
  if (!s.regions[s.config.home ?? 'na']?.open) bad('region', 'the home region is closed')
  const care = s.care
  if (care.subscribers < 0 || !within(care.planPrice, 2, 40) || ![1, 2, 3].includes(care.warrantyYears) || ![2, 3, 4, 5, 7].includes(care.updateYears)) bad('care', JSON.stringify({ ...care, month: 0, last: 0 }))

  // ---- shares
  const k = s.stock
  if (!(k.shares > 0) || !(k.founder > 0) || k.founder > k.shares + 1e-6 || !(k.price > 0)) bad('stock', `shares ${k.shares} founder ${k.founder} price ${k.price}`)
  if (!within(k.payout, 0, 0.5) || !within(k.confidence, 0, 100) || !within(k.sentiment, -1, 1)) bad('stock', `payout ${k.payout} confidence ${k.confidence} sentiment ${k.sentiment}`)
  const held = k.investors.reduce((a, i) => a + i.shares, 0)
  if (k.investors.some((i) => !(i.shares > 0))) bad('investor', 'an investor holds nothing')
  if (held + k.founder > k.shares + 1e-6 || (!k.listed && Math.abs(held + k.founder - k.shares) > 1e-6)) bad('stock', `founder ${k.founder} and investors ${held} against ${k.shares} shares in issue`)
  if (k.history.length > 120) bad('unbounded', 'share price history')
  for (const [id, h] of Object.entries(k.holdings)) {
    const c = companies.get(id)
    if (!c || c.isPlayer) bad('holding', `a stake in ${id}`)
    if (!(h.stake > 0) || h.stake > 0.49 + 1e-9 || h.paid < 0) bad('holding', `${id} stake ${h.stake} paid ${h.paid}`)
  }

  // ---- progression
  for (const id of Object.keys(s.unlocks)) if (!CAPS.some((c) => c.id === id)) bad('unlock', id)
  for (const { goal } of nextGoals(s, 99)) if (goal.needs && !has(s, goal.needs)) bad('goal-locked', `${goal.id} is suggested while ${goal.needs} is locked`)
  if (guided(s)) {
    for (const c of CAPS) {
      if (has(s, c.id)) continue
      const next = nextReq(s, c.id)
      const tab = next?.where?.tab
      const cap = tab ? capOfTab(tab) : undefined
      if (cap && !has(s, cap)) bad('points-at-locked', `${c.id} asks to "${next!.label}" on the ${tab} screen, which is locked`)
      if (next?.where?.view === 'execs' && !has(s, 'execs')) bad('points-at-locked', `${c.id} asks to "${next.label}" in the executive search, which is locked`)
    }
  }
  unique(s.incidents.map((i) => i.id), 'incident', out)
  if (s.incidents.filter((i) => !i.done).length > 1) bad('incidents', 'more than one is waiting')
  for (const g of Object.keys(s.goals)) if (s.goals[g] > s.day) bad('goal', `${g} reached on day ${s.goals[g]}`)

  // ---- lists that must not grow for ever
  if (s.news.length > 140 || s.reports.length > 240 || s.shareHistory.length > 120 || s.incidents.length > 40 || s.candidates.length > 9 || s.execPool.length > 14) bad('unbounded', `news ${s.news.length} reports ${s.reports.length} shares ${s.shareHistory.length} incidents ${s.incidents.length} candidates ${s.candidates.length} execs ${s.execPool.length}`)
  unique(s.news.map((n) => n.id), 'news', out)

  // ---- plots
  unique(s.stores.map((st) => st.id), 'store', out)
  for (const st of s.stores) if (!REGIONS.some((r) => r.id === st.region)) bad('store-region', `${st.id} ${st.region}`)
  if (!opts.light) {
    if (s.office.kind !== 'office' || (s.factory && s.factory.kind !== 'factory') || (s.venue && s.venue.kind !== 'venue')) bad('site-kind', 'a plot is of the wrong kind')
    out.push(...checkSite(s.office, 'office'))
    if (s.factory) out.push(...checkSite(s.factory, 'factory'))
    if (s.venue) out.push(...checkSite(s.venue, 'venue'))
    for (const st of s.stores) out.push(...checkSite(st.site, `store ${st.id}`))
    // a save is the state as JSON: nothing may be lost or changed by the trip
    // the screens' own sums, asked for once a month
    if (!opts.noJson) out.push(...checkReadouts(s))
    const json = opts.noJson ? '' : JSON.stringify(s)
    if (!opts.noJson && JSON.stringify(JSON.parse(json)) !== json) bad('json', 'the state does not survive a round trip through JSON')
  }
  return out
}
