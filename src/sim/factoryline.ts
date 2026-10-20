// Factory lines as a graph, and what they can make. Every block has an input
// face and an output face, set by which way it is turned: kits go in at the
// back (local -X) and come out at the front of the flow (local +X). Where one
// block's output face meets the next block's input face the two are joined;
// where it meets anything else the joint is blocked. A line runs when kits can
// get from a receiving dock to a shipping dock through board assembly, device
// assembly and packaging, in that order; component machines (chips, displays,
// cells, casings, cameras, power supplies) and testing may stand anywhere
// before the stage that follows them.
//
// What a line makes is worked out as flows, not item by item, so a floor of a
// thousand blocks costs no more than a short line. Machines of one kind on a
// line share the work, so their capacities add; belts, arms, splitters and
// docks carry only so much, found as the most that can flow from the
// receiving docks to the shipping docks; the slowest of the two sets the
// line's pace. Then the plant as a whole: shifts, power, the crew's rooms,
// breakdowns against servicing, and faults against testing.
import type { Site, SiteItem } from './types'
import { ITEMS, type Part, ROOFS, SOLAR_ROOF_KW, type Stage, UG_SPAN, itemTiles } from './sites'

/** East, south, west, north as tile steps; a turn of one quarter moves one along. */
export const DIRS: readonly [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

/** The stages a line must pass through, in order. Belts and splitters carry whatever stage they are given. */
export const RANK: Record<Stage, number> = { in: 0, belt: -1, split: -1, smt: 1, part: 1, assembly: 2, test: 3, pack: 4, out: 5 }
const NEEDED = ['smt', 'assembly', 'pack'] as const
const BIT: Partial<Record<Stage, number>> = { smt: 1, assembly: 2, pack: 4 }
const ALL = 7
export const STAGE_NAME: Record<Stage, string> = { in: 'receiving dock', out: 'shipping dock', belt: 'conveyor', split: 'splitter', smt: 'board assembly', part: 'components', assembly: 'device assembly', test: 'testing', pack: 'packaging' }
export const PARTS: Part[] = ['chip', 'display', 'cell', 'casing', 'camera', 'psu']
export const PART_NAME: Record<Part, string> = { chip: 'Chips', display: 'Displays', cell: 'Battery cells', casing: 'Casings', camera: 'Camera modules', psu: 'Power supplies' }

// ---------------------------------------------------------------- tiers, modules, the plant

/** What a machine's tier does to it: output, power, running cost, faults and breakdowns. Index 0 is tier I. */
export const TIER = {
  cap: [1, 2.4, 5.5],
  kw: [1, 1.7, 2.8],
  run: [1, 1.6, 2.6],
  defect: [1, 0.6, 0.35],
  wear: [1, 0.7, 0.45],
  /** What going up to tier II, then III, costs, as a share of the machine's price. */
  upgrade: [1.2, 2.6],
} as const
export const TIER_NAME = ['I', 'II', 'III']
export type Module = 'speed' | 'quality' | 'eff'
export const MODULES: Record<Module, { name: string; cost: number; cap: number; kw: number; defect: number; note: string }> = {
  speed: { name: 'Speed module', cost: 60000, cap: 1.35, kw: 1.5, defect: 1.15, note: '35% more output for half again the power, and a few more faults.' },
  quality: { name: 'Quality module', cost: 60000, cap: 0.9, kw: 1, defect: 0.65, note: 'A third fewer faults, a tenth less output.' },
  eff: { name: 'Efficiency module', cost: 45000, cap: 1, kw: 0.65, defect: 1, note: 'A third less power.' },
}
export const MAX_MODS = 2
/** Output a day for each number of shifts, relative to one. */
export const SHIFT_MULT = [1, 1.9, 2.7]
/** Power a factory has from its own grid connection, kW, before any substation, generator or solar. */
export const BASE_GRID = 800
/** Workers a shift who can make do without crew rooms. */
const FREE_CREW = 12
/** What one worker costs a shift, before the region's own wages. */
export const SHIFT_WAGE = 210
/** Cost of a kWh. */
const KWH = 0.12
/** Share of the time a tier I machine is broken down, with nobody servicing it. */
const WEAR = 0.07
/** Faults per unit from a line of tier I machines, before testing. */
const RAW_DEFECT = 0.06

export const tierOf = (it: SiteItem) => Math.max(1, Math.min(3, Math.round(it.tier ?? 1)))
const modsOf = (it: SiteItem) => (it.mods ?? []).filter((m): m is Module => m in MODULES).slice(0, MAX_MODS)
const isMachine = (stage?: Stage) => stage === 'smt' || stage === 'part' || stage === 'assembly' || stage === 'test' || stage === 'pack'

/** One block's output a day (one shift), power and faults, from its kind, tier and modules. */
export function blockSpec(it: SiteItem) {
  const def = ITEMS.factory[it.kind]
  const t = tierOf(it) - 1
  let cap = (def?.cap ?? 0) * TIER.cap[t]
  let kw = (def?.kw ?? 0) * TIER.kw[t]
  let defect = TIER.defect[t]
  for (const m of modsOf(it)) {
    cap *= MODULES[m].cap
    kw *= MODULES[m].kw
    defect *= MODULES[m].defect
  }
  // a dock's tier raises what it takes in; belts have no tier, they are swapped for faster ones
  const belt = (def?.belt ?? 0) * (def?.stage === 'in' ? TIER.cap[t] : 1)
  return { cap, kw, defect, belt, run: (def?.run ?? 0) * TIER.run[t], wear: WEAR * TIER.wear[t], crew: def?.crew ?? 0 }
}

export type CapStage = 'smt' | 'assembly' | 'test' | 'pack'
export type Caps = Record<CapStage, number>

/** Where an output face meets something. */
export interface Joint {
  from: string
  /** The item met; missing when the output faces open floor. */
  to?: string
  /** Middle of the shared edge, in tiles from the plot's north-west corner. */
  x: number
  y: number
  /** Index into DIRS: the way parts leave `from`. */
  dir: number
  ok: boolean
  /** Why a blocked joint is blocked, in plain words. */
  why?: string
  /** Kits a day flowing through it while the line runs flat out (one shift). */
  rate?: number
}

/** What holds a line back, and which blocks. */
export interface Limit {
  kind: 'stage' | 'belt' | 'dock'
  ids: string[]
  reason: string
}

/** One line: everything joined, directly or through other blocks, to one or more receiving docks. */
export interface LineReport {
  /** Id of the first receiving dock on it. */
  id: string
  running: boolean
  problem?: string
  /** Units a day each stage on a working path can handle, on one shift. */
  caps: Caps
  /** Components a day the line makes for itself, on one shift. */
  parts: Record<Part, number>
  /** Kits a day the belts, arms and docks can carry from receiving to shipping, on one shift. */
  logistics: number
  /** Devices a day, in phone-equivalents, after shifts, power, breakdowns, the crew and scrap. */
  throughput: number
  /** The stage that sets the output; null when the line does not run. */
  bottleneck: CapStage | null
  limit?: Limit
  runCost: number
  /** Every block joined to this line. */
  items: string[]
  /** Blocks on a working path from a receiving dock to a shipping dock. */
  live: string[]
  /** Blocked joints on this line. */
  blocked: Joint[]
  /** Buffers on the line. */
  buffers: number
}

/** The plant as a whole: what it draws, who works it and how well it holds up. */
export interface PlantReport {
  shifts: number
  /** kW wanted by everything on working lines, and kW to be had. */
  demand: number
  supply: number
  /** kW of that supply from a solar roof over the halls. */
  solar: number
  /** Share of the wanted power there is, 0-1. */
  power: number
  /** Workers a shift the working lines need, and how many the crew rooms take. */
  crew: number
  housed: number
  /** 0-1: how well the shift copes with its rooms. */
  crewEff: number
  /** Machines on working lines, how many are serviced, and the share of the time they run. */
  machines: number
  serviced: number
  uptime: number
  /** Faults per unit off the machines before testing, and the share testing catches. */
  rawDefect: number
  caught: number
  /** Share of output scrapped after it failed a test. */
  scrap: number
  /** A day: wages, energy and fuel, and the machines' own running costs, at full output. */
  wages: number
  energy: number
  fuel: number
}

export interface LineStats {
  /** True when at least one line runs. */
  running: boolean
  /** Why nothing is running, in plain words. */
  problem?: string
  /** Summed over the lines that run, or over every joined block when none does. */
  caps: Caps
  /** Devices per day, in phone-equivalents, over every working line. */
  throughput: number
  defectRate: number
  /** Cost per day at full output. */
  runCost: number
  /** Ids of every block parts can reach from a receiving dock. */
  linked: Set<string>
  /** Ids of the blocks on a working path. */
  live: Set<string>
  /** Conveyors parts can reach: direction of travel as a tile step. */
  flow: Map<string, [number, number]>
  lines: LineReport[]
  /** Every output face that meets something, joined or blocked. */
  joints: Joint[]
  /** Line blocks not joined to any receiving dock. */
  loose: string[]
  plant: PlantReport
}

const zeroCaps = (): Caps => ({ smt: 0, assembly: 0, test: 0, pack: 0 })
const zeroParts = (): Record<Part, number> => ({ chip: 0, display: 0, cell: 0, casing: 0, camera: 0, psu: 0 })

const stageOf = (site: Site, it: SiteItem): Stage | undefined => (site.kind === 'factory' ? ITEMS.factory[it.kind]?.stage : undefined)

/** Inclusive tile bounds of an item. */
export function boxOf(site: Site, it: SiteItem): [number, number, number, number] {
  const t = itemTiles(site, it)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of t) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  return [x0, y0, x1, y1]
}

/** Tiles just outside one face of a box. */
export function faceCells(box: [number, number, number, number], dir: number): [number, number][] {
  const [x0, y0, x1, y1] = box
  const out: [number, number][] = []
  if (dir === 0) for (let y = y0; y <= y1; y++) out.push([x1 + 1, y])
  else if (dir === 2) for (let y = y0; y <= y1; y++) out.push([x0 - 1, y])
  else if (dir === 1) for (let x = x0; x <= x1; x++) out.push([x, y1 + 1])
  else for (let x = x0; x <= x1; x++) out.push([x, y0 - 1])
  return out
}

/** Which faces of a line block take parts in and which send them on, as indexes into DIRS. The first output is the main one. */
export function portsOf(stage: Stage | undefined, rot: number): { out: number | null; outs: number[]; ins: number[] } {
  const r = ((rot % 4) + 4) % 4
  if (!stage) return { out: null, outs: [], ins: [] }
  if (stage === 'in') return { out: r, outs: [r], ins: [] }
  if (stage === 'out') return { out: null, outs: [], ins: [(r + 2) % 4] }
  // a conveyor takes parts from behind or from either side, so a run of belt can turn a corner
  if (stage === 'belt') return { out: r, outs: [r], ins: [0, 1, 2, 3].filter((d) => d !== r) }
  // a splitter takes them from behind and sends them on ahead and to both sides
  if (stage === 'split') return { out: r, outs: [r, (r + 1) % 4, (r + 3) % 4], ins: [(r + 2) % 4] }
  return { out: r, outs: [r], ins: [(r + 2) % 4] }
}

const nameOf = (site: Site, it: SiteItem) => ITEMS[site.kind][it.kind]?.name ?? it.kind
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

const BY_SIG = new Map<string, { grid: string; rooms: string; stats: LineStats }>()
const MEMO = new WeakMap<Site, { rev: number; items: SiteItem[]; n: number; sig: string; stats: LineStats }>()

/** Works out what a factory floor can produce from which faces meet which, and how the plant around it holds up. */
export function lineStats(site: Site): LineStats {
  const sig = site.items.map((i) => `${i.x},${i.y},${i.rot},${i.tier ?? 1}${i.mods?.join('') ?? ''}`).join(';') + `|${site.shifts ?? 1}|${site.roof}|${(site.upper ?? []).map((u) => `${u.rev}:${u.items.length}`).join(',')}`
  const m = MEMO.get(site)
  if (m && m.rev === site.rev && m.items === site.items && m.n === site.items.length && m.sig === sig) return m.stats
  // a copy of a site already worked out (the game state is copied every day): the same answer, without the max-flow again
  const key = site.items.map((i) => i.id + i.kind).join(';') + sig
  const seen = BY_SIG.get(key)
  if (seen && seen.grid === site.grid.join('') && seen.rooms === JSON.stringify(site.rooms)) {
    MEMO.set(site, { rev: site.rev, items: site.items, n: site.items.length, sig, stats: seen.stats })
    return seen.stats
  }
  const stats = compute(site)
  if (BY_SIG.size > 16) BY_SIG.clear()
  BY_SIG.set(key, { grid: site.grid.join(''), rooms: JSON.stringify(site.rooms), stats })
  MEMO.set(site, { rev: site.rev, items: site.items, n: site.items.length, sig, stats })
  return stats
}

/**
 * The most that can flow from `sources` to `sinks`, each node carrying at most
 * its own capacity (Infinity for machines), along the given edges. Returns the
 * total and the flow on each edge, keyed "from>to".
 */
function maxFlow(nodes: string[], cap: (id: string) => number, edges: [string, string][], sources: string[], sinks: Set<string>): { total: number; on: Map<string, number> } {
  // each node is split in two, in and out, joined by an arc of its capacity
  const index = new Map(nodes.map((id, i) => [id, i]))
  const n = nodes.length * 2 + 2
  const S = n - 2
  const T = n - 1
  const head: number[][] = Array.from({ length: n }, () => [])
  const to: number[] = []
  const res: number[] = []
  const arc = (a: number, b: number, c: number) => {
    head[a].push(to.length)
    to.push(b)
    res.push(c)
    head[b].push(to.length)
    to.push(a)
    res.push(0)
    return to.length - 2
  }
  nodes.forEach((id, i) => arc(i * 2, i * 2 + 1, cap(id)))
  const edgeArc = new Map<string, number>()
  for (const [a, b] of edges) {
    const ia = index.get(a)
    const ib = index.get(b)
    if (ia === undefined || ib === undefined) continue
    edgeArc.set(`${a}>${b}`, arc(ia * 2 + 1, ib * 2, Infinity))
  }
  for (const s of sources) if (index.has(s)) arc(S, index.get(s)! * 2, Infinity)
  for (const t of sinks) if (index.has(t)) arc(index.get(t)! * 2 + 1, T, Infinity)
  let total = 0
  // shortest augmenting paths; a line seldom has more than a few dozen of them
  for (let guard = 0; guard < 400; guard++) {
    const prev = new Int32Array(n).fill(-1)
    prev[S] = -2
    const queue = [S]
    for (let q = 0; q < queue.length && prev[T] === -1; q++) {
      const u = queue[q]
      for (const e of head[u]) {
        if (res[e] > 1e-9 && prev[to[e]] === -1) {
          prev[to[e]] = e
          queue.push(to[e])
        }
      }
    }
    if (prev[T] === -1) break
    let push = Infinity
    for (let v = T; v !== S; v = to[prev[v] ^ 1]) push = Math.min(push, res[prev[v]])
    if (!Number.isFinite(push)) push = 1e9
    for (let v = T; v !== S; v = to[prev[v] ^ 1]) {
      res[prev[v]] -= push
      res[prev[v] ^ 1] += push
    }
    total += push
  }
  const on = new Map<string, number>()
  for (const [k, e] of edgeArc) on.set(k, res[e ^ 1])
  return { total, on }
}

/** Kits a day the forklifts add to a line: those beside a lane that reaches both a receiving dock and a shipping dock of it. */
function forkCarry(site: Site, group: SiteItem[]): number {
  const lanes = new Set(site.items.filter((i) => i.kind === 'lane').map((i) => `${i.x},${i.y}`))
  if (!lanes.size) return 0
  const touching = (it: SiteItem) => itemTiles(site, it).flatMap(([x, y]) => DIRS.map(([dx, dy]) => `${x + dx},${y + dy}`))
  const seen = new Set<string>()
  let total = 0
  for (const start of lanes) {
    if (seen.has(start)) continue
    const comp = [start]
    seen.add(start)
    for (let i = 0; i < comp.length; i++) {
      const [x, y] = comp[i].split(',').map(Number)
      for (const [dx, dy] of DIRS) {
        const k = `${x + dx},${y + dy}`
        if (lanes.has(k) && !seen.has(k)) {
          seen.add(k)
          comp.push(k)
        }
      }
    }
    const set = new Set(comp)
    const near = (it: SiteItem) => touching(it).some((k) => set.has(k))
    if (!group.some((b) => b.kind === 'dock_in' && near(b)) || !group.some((b) => b.kind === 'dock_out' && near(b))) continue
    for (const it of site.items) if (it.kind === 'forklift' && near(it)) total += ITEMS.factory.forklift.carry ?? 0
  }
  return total
}

/** Every item on every floor of a site. */
const allItems = (site: Site) => [site, ...(site.upper ?? [])].flatMap((f) => f.items)

function compute(site: Site): LineStats {
  const all = site.items.filter((it) => ITEMS[site.kind]?.[it.kind])
  const blocks = all.filter((it) => stageOf(site, it))
  const owner = new Map<string, SiteItem>()
  for (const it of all) for (const [x, y] of itemTiles(site, it)) owner.set(`${x},${y}`, it)
  const byId = new Map(blocks.map((b) => [b.id, b]))

  // ---- joints: every output face, and what it meets
  const joints: Joint[] = []
  const next = new Map<string, string[]>()
  for (const a of blocks) {
    const ports = portsOf(stageOf(site, a), a.rot)
    if (a.kind === 'ug_in') {
      // an underground belt: parts go under whatever lies ahead to the exit facing the same way, up to UG_SPAN tiles on
      const d = ((a.rot % 4) + 4) % 4
      let exit: SiteItem | undefined
      for (let k = 2; k <= UG_SPAN && !exit; k++) {
        const o = owner.get(`${a.x + DIRS[d][0] * k},${a.y + DIRS[d][1] * k}`)
        if (o && o.kind === 'ug_out' && ((o.rot % 4) + 4) % 4 === d) exit = o
      }
      const x = a.x + 0.5 + DIRS[d][0] * 0.5
      const y = a.y + 0.5 + DIRS[d][1] * 0.5
      if (exit) {
        joints.push({ from: a.id, to: exit.id, x, y, dir: d, ok: true })
        next.set(a.id, [...(next.get(a.id) ?? []), exit.id])
      } else joints.push({ from: a.id, x, y, dir: d, ok: false, why: `The underground belt entry has no exit ahead of it: place an exit facing the same way within ${UG_SPAN} tiles.` })
      continue
    }
    for (const d of ports.outs) {
      const met = new Map<SiteItem, [number, number][]>()
      for (const [x, y] of faceCells(boxOf(site, a), d)) {
        const b = owner.get(`${x},${y}`)
        if (!b || b === a) continue
        met.set(b, [...(met.get(b) ?? []), [x, y]])
      }
      const side = d !== ports.out
      for (const [b, cells] of met) {
        const cx = cells.reduce((s, c) => s + c[0], 0) / cells.length + 0.5 - DIRS[d][0] * 0.5
        const cy = cells.reduce((s, c) => s + c[1], 0) / cells.length + 0.5 - DIRS[d][1] * 0.5
        const bs = stageOf(site, b)
        const bp = portsOf(bs, b.rot)
        const ok = !!bs && bp.ins.includes((d + 2) % 4)
        // a splitter's side outputs that meet something that cannot take parts are simply not used
        if (!ok && side) continue
        let why: string | undefined
        if (!ok) {
          if (!bs) why = `The ${lower(nameOf(site, b))} is in the way of the ${lower(nameOf(site, a))}'s output.`
          else if (bp.outs.includes((d + 2) % 4)) why = `The ${lower(nameOf(site, a))} and the ${lower(nameOf(site, b))} face each other output to output.`
          else if (bs === 'in') why = `A receiving dock takes nothing in: the ${lower(nameOf(site, a))} feeds into its back.`
          else why = `The ${lower(nameOf(site, a))}'s output meets the side of the ${lower(nameOf(site, b))}. Turn one of them.`
        }
        joints.push({ from: a.id, to: b.id, x: cx, y: cy, dir: d, ok, why })
        if (ok) next.set(a.id, [...(next.get(a.id) ?? []), b.id])
      }
    }
  }

  // ---- lines: blocks joined by any touching output face
  const parent = new Map<string, string>(blocks.map((b) => [b.id, b.id]))
  const find = (id: string): string => {
    let r = id
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(id, r)
    return r
  }
  for (const j of joints) if (j.to && byId.has(j.to)) parent.set(find(j.from), find(j.to))
  const groups = new Map<string, SiteItem[]>()
  for (const b of blocks) groups.set(find(b.id), [...(groups.get(find(b.id)) ?? []), b])

  const linked = new Set<string>()
  const live = new Set<string>()
  const lines: LineReport[] = []
  const loose: string[] = []
  const stageById = (id: string) => stageOf(site, byId.get(id)!)!
  const jointRate = new Map<string, number>()
  for (const group of groups.values()) {
    const docks = group.filter((b) => stageOf(site, b) === 'in')
    if (!docks.length) {
      for (const b of group) loose.push(b.id)
      continue
    }
    // states: (block, highest stage passed, stages done as bits)
    const key = (id: string, rank: number, mask: number) => `${id}|${rank}|${mask}`
    const seen = new Set<string>()
    const back = new Map<string, string[]>()
    const queue: [string, number, number][] = []
    const order: { at: string; after: number }[] = []
    let deadEnd: string | undefined
    let shortOf = -1
    for (const d of docks) {
      seen.add(key(d.id, 0, 0))
      queue.push([d.id, 0, 0])
    }
    const done: string[] = []
    for (let q = 0; q < queue.length; q++) {
      const [id, rank, mask] = queue[q]
      linked.add(id)
      const st = stageById(id)
      if (st === 'out') {
        if (mask === ALL) done.push(key(id, rank, mask))
        else if (shortOf < 0 || bits(mask) > bits(shortOf)) shortOf = mask
        continue
      }
      const outs = next.get(id) ?? []
      if (!outs.length && !deadEnd) deadEnd = id
      for (const to of outs) {
        const ts = stageById(to)
        const r = RANK[ts]
        if (r >= 0 && r < rank) {
          order.push({ at: to, after: rank })
          continue
        }
        const nr = r >= 0 ? r : rank
        const nm = mask | (BIT[ts] ?? 0)
        const k = key(to, nr, nm)
        back.set(k, [...(back.get(k) ?? []), key(id, rank, mask)])
        if (seen.has(k)) continue
        seen.add(k)
        queue.push([to, nr, nm])
      }
    }
    // walk back from every complete arrival: whatever it passes is on a working path
    const good = new Set<string>()
    const stack = [...done]
    while (stack.length) {
      const k = stack.pop()!
      if (good.has(k)) continue
      good.add(k)
      for (const p of back.get(k) ?? []) stack.push(p)
    }
    const onPath = new Set([...good].map((k) => k.split('|')[0]))
    const caps = zeroCaps()
    const parts = zeroParts()
    let runCost = 0
    let buffers = 0
    const counted = onPath.size ? onPath : new Set(group.filter((b) => linked.has(b.id)).map((b) => b.id))
    for (const id of counted) {
      const b = byId.get(id)!
      const st = stageById(id)
      const spec = blockSpec(b)
      if (st === 'smt' || st === 'assembly' || st === 'test' || st === 'pack') caps[st] += spec.cap
      if (st === 'part') parts[ITEMS.factory[b.kind].part!] += spec.cap
      if (ITEMS.factory[b.kind]?.buffer) buffers++
      if (onPath.size) runCost += spec.run
    }
    const ids = new Set(group.map((b) => b.id))
    const blocked = joints.filter((j) => !j.ok && ids.has(j.from))
    const running = onPath.size > 0
    // ---- logistics: the most that belts, arms and docks carry from the receiving docks to the shipping docks
    let logistics = 0
    let limit: Limit | undefined
    const prod = running ? Math.min(caps.smt, caps.assembly, caps.pack) : 0
    if (running) {
      const nodes = [...onPath]
      const capOf = (id: string) => {
        const st = stageById(id)
        if (st === 'belt' || st === 'split' || st === 'in') return blockSpec(byId.get(id)!).belt || Infinity
        return Infinity
      }
      const edges: [string, string][] = []
      for (const a of nodes) for (const b of next.get(a) ?? []) if (onPath.has(b)) edges.push([a, b])
      const sinks = new Set(nodes.filter((id) => stageById(id) === 'out'))
      const flow = maxFlow(nodes, capOf, edges, nodes.filter((id) => stageById(id) === 'in'), sinks)
      logistics = flow.total + forkCarry(site, group)
      // what actually flows at the line's pace: the machines' pace when the belts could carry more
      const pace = Math.min(prod, logistics)
      const k = logistics > 0 ? pace / logistics : 0
      for (const [e, r] of flow.on) jointRate.set(e, r * k)
      if (logistics < prod * 0.999) {
        // the belts are the limit: the ones running full
        const through = new Map<string, number>()
        for (const [e, r] of flow.on) {
          const [a] = e.split('>')
          through.set(a, (through.get(a) ?? 0) + r)
        }
        const full = nodes.filter((id) => Number.isFinite(capOf(id)) && (through.get(id) ?? 0) >= capOf(id) * 0.999)
        const dock = full.length > 0 && full.every((id) => stageById(id) === 'in')
        limit = {
          kind: dock ? 'dock' : 'belt',
          ids: full,
          reason: dock ? `The receiving docks take in ${fmt(logistics)} kits a day; the machines could use ${fmt(prod)}. Add a dock or raise its tier.` : `Belts carry ${fmt(logistics)} kits a day here; the machines could use ${fmt(prod)}. Use faster belts, or a second belt alongside.`,
        }
      } else {
        const stage = NEEDED.reduce<CapStage>((a, s) => (caps[s] < caps[a] ? s : a), 'smt')
        limit = { kind: 'stage', ids: nodes.filter((id) => stageById(id) === stage), reason: `${STAGE_NAME[stage].charAt(0).toUpperCase() + STAGE_NAME[stage].slice(1)} is the slowest stage: ${fmt(caps[stage])} a day. Add another machine of that kind in the row, or raise its tier.` }
      }
    }
    const bottleneck = running ? NEEDED.reduce<CapStage>((a, k) => (caps[k] < caps[a] ? k : a), 'smt') : null
    let problem: string | undefined
    if (!running) {
      const reachedOut = group.some((b) => stageOf(site, b) === 'out' && linked.has(b.id))
      if (blocked.length) problem = `Logistics blocked: ${blocked[0].why}`
      else if (order.length) {
        const at = byId.get(order[0].at)!
        const after = (Object.keys(RANK) as Stage[]).find((s) => RANK[s] === order[0].after)!
        problem = `The ${lower(nameOf(site, at))} comes after ${STAGE_NAME[after]}: kits go through components and board assembly, device assembly, testing and packaging, in that order.`
      } else if (!reachedOut) problem = deadEnd ? `Parts stop at the ${lower(nameOf(site, byId.get(deadEnd)!))}: its output leads nowhere. Link it to a shipping dock.` : 'Link the line to a shipping dock.'
      else {
        const missing = NEEDED.filter((k) => !((shortOf < 0 ? 0 : shortOf) & BIT[k]!))
        const names = { smt: 'a board assembly line', assembly: 'an assembly cell or bench', pack: 'a packaging line' }
        problem = `The line still needs ${missing.map((k) => names[k]).join(' and ')}.`
      }
    }
    for (const id of onPath) live.add(id)
    lines.push({ id: docks[0].id, running, problem, caps, parts, logistics, throughput: running ? Math.min(prod, logistics) : 0, bottleneck, limit, runCost, items: group.map((b) => b.id), live: [...onPath], blocked, buffers })
  }
  for (const j of joints) if (j.to) j.rate = jointRate.get(`${j.from}>${j.to}`)

  const flow = new Map<string, [number, number]>()
  for (const b of blocks) if (stageOf(site, b) === 'belt' && linked.has(b.id)) flow.set(b.id, [...DIRS[((b.rot % 4) + 4) % 4]] as [number, number])

  // ---- the plant: shifts, power, crew, servicing, faults
  const shifts = Math.max(1, Math.min(3, Math.round(site.shifts ?? 1)))
  const mult = SHIFT_MULT[shifts - 1]
  const everything = allItems(site)
  let demand = 0
  let crew = 0
  let machines = 0
  let wearSum = 0
  let defectSum = 0
  for (const id of live) {
    const b = byId.get(id)!
    const spec = blockSpec(b)
    demand += spec.kw
    crew += spec.crew
    if (isMachine(stageById(id))) {
      machines++
      wearSum += spec.wear
      defectSum += spec.defect
    }
  }
  let supply = BASE_GRID
  let fuel = 0
  let serviced = 0
  let housed = 0
  let watch = 0
  for (const it of everything) {
    const def = ITEMS.factory[it.kind]
    if (!def) continue
    if (def.supply) supply += def.supply
    if (def.supply && def.run) fuel += def.run
    if (def.service) serviced += def.service
    if (def.houses) housed += def.houses
    if (it.kind === 'console' || it.kind === 'qa') watch++
  }
  // a solar roof over the halls
  const solar = ROOFS[site.roof]?.id === 'solar' ? site.grid.filter((n) => n > 0).length * SOLAR_ROOF_KW : 0
  supply += solar
  const power = demand > 0 ? Math.min(1, supply / demand) : 1
  const crewEff = crew <= housed + FREE_CREW ? 1 : 0.55 + (0.45 * (housed + FREE_CREW)) / crew
  const wear = machines ? wearSum / machines : 0
  const cover = machines ? Math.min(1, serviced / machines) : 1
  const down = wear * (1 - 0.85 * cover)
  const rawDefect = machines ? (RAW_DEFECT * defectSum) / machines : RAW_DEFECT
  // faults: testing catches most of what it covers; the control room trims the rest
  const working = lines.filter((l) => l.running)
  const base = working.reduce((a, l) => a + l.throughput, 0)
  const tested = working.reduce((a, l) => a + Math.min(l.caps.test, l.throughput), 0)
  const coverage = base > 0 ? Math.min(1, tested / base) : 0
  const caught = 0.87 * coverage
  const scrap = rawDefect * caught * 0.4
  const defectRate = rawDefect * (1 - caught) * (1 - Math.min(0.4, watch * 0.1))
  const pace = mult * power * crewEff * (1 - scrap)
  for (const l of working) {
    // buffers ride out part of the time a machine is down
    const ride = Math.min(0.6, l.buffers * 0.2)
    l.throughput = l.throughput * pace * (1 - down * (1 - ride))
  }
  const wages = crew * shifts * SHIFT_WAGE
  const energy = Math.min(demand, supply) * 8 * shifts * KWH
  const plant: PlantReport = { shifts, demand, supply, solar, power, crew, housed, crewEff, machines, serviced: Math.min(machines, serviced), uptime: 1 - down, rawDefect, caught, scrap, wages, energy, fuel }

  const caps = zeroCaps()
  for (const l of working.length ? working : lines) for (const k of Object.keys(caps) as CapStage[]) caps[k] += l.caps[k]
  const throughput = working.reduce((a, l) => a + l.throughput, 0)
  const runCost = working.reduce((a, l) => a + l.runCost, 0) * mult + (working.length ? wages + energy + fuel : 0)
  const out = { caps, runCost, linked, live, flow, lines, joints, loose, plant }
  if (!working.length) {
    const problem = !blocks.some((b) => stageOf(site, b) === 'in')
      ? site.rooms.some((r) => r.type === 'hall')
        ? 'Place a receiving dock to start a line.'
        : 'Zone a production hall, then lay a line in it.'
      : (lines.find((l) => l.blocked.length)?.problem ?? lines[0]?.problem ?? 'The line is not finished.')
    return { ...out, running: false, problem, throughput: 0, defectRate: 0, runCost: 0 }
  }
  return { ...out, running: true, throughput, defectRate }
}

/** The components each kind of device needs from a factory, one each, worked out from what the device is. */
export function partsFor(type: string): Part[] {
  const T = TYPE_PARTS[type]
  return T ?? ['chip', 'casing']
}
const TYPE_PARTS: Record<string, Part[]> = {
  phone: ['chip', 'display', 'cell', 'casing', 'camera'],
  tablet: ['chip', 'display', 'cell', 'casing', 'camera'],
  foldable: ['chip', 'display', 'cell', 'casing', 'camera'],
  watch: ['chip', 'display', 'cell', 'casing'],
  laptop: ['chip', 'display', 'cell', 'casing', 'camera', 'psu'],
  desktop: ['chip', 'display', 'casing', 'camera', 'psu'],
  tower: ['chip', 'casing', 'psu'],
  console: ['chip', 'casing', 'psu'],
  tv: ['chip', 'display', 'casing', 'psu'],
  monitor: ['chip', 'display', 'casing', 'psu'],
  earbuds: ['chip', 'cell', 'casing'],
  headset: ['chip', 'display', 'cell', 'casing', 'camera'],
  speaker: ['chip', 'casing', 'psu'],
  handheld: ['chip', 'display', 'cell', 'casing'],
  ereader: ['chip', 'display', 'cell', 'casing'],
  ring: ['chip', 'cell', 'casing'],
  actioncam: ['chip', 'display', 'cell', 'casing', 'camera'],
  drone: ['chip', 'cell', 'casing', 'camera'],
  mouse: ['chip', 'cell', 'casing'],
}
/** Share of a unit's cost a component adds when it is bought in ready-made rather than made on the line. */
export const PART_PREMIUM: Record<Part, number> = { chip: 0.04, display: 0.035, cell: 0.025, casing: 0.02, camera: 0.02, psu: 0.02 }

/**
 * What a line's components do to the cost of a device it builds at `units` a
 * day: each one the device needs is bought in ready-made (dearer) for the
 * share the line's own machines cannot cover, and made in-house (cheaper) for
 * the rest. A multiplier on the factory's cost, around 1.
 */
export function partsFactor(type: string, parts: Record<Part, number>, units: number, pace: number): { factor: number; made: Record<Part, number> } {
  const made = zeroParts()
  let factor = 1
  for (const p of partsFor(type)) {
    const share = units > 0 ? Math.min(1, (parts[p] * pace) / units) : 0
    made[p] = share
    factor += PART_PREMIUM[p] * (1 - share) - PART_PREMIUM[p] * share * 0.6
  }
  return { factor, made }
}

const bits = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1)

/**
 * Turns line blocks so each one's output faces the next block toward a
 * shipping dock, without moving anything. Returns the new turn of each block
 * that changes, or null when turning cannot make more of the floor run.
 */
export function planFix(site: Site): Map<string, number> | null {
  if (site.kind !== 'factory') return null
  const blocks = site.items.filter((it) => stageOf(site, it))
  if (!blocks.length) return null
  const owner = new Map<string, SiteItem>()
  for (const it of blocks) for (const [x, y] of itemTiles(site, it)) owner.set(`${x},${y}`, it)
  const touching = (it: SiteItem) => {
    const out = new Set<SiteItem>()
    const box = boxOf(site, it)
    for (let d = 0; d < 4; d++)
      for (const [x, y] of faceCells(box, d)) {
        const b = owner.get(`${x},${y}`)
        if (b && b !== it) out.add(b)
      }
    return out
  }
  // distance, in blocks, from each block to the nearest shipping dock
  const dist = new Map<SiteItem, number>()
  const queue = blocks.filter((b) => stageOf(site, b) === 'out')
  for (const b of queue) dist.set(b, 0)
  while (queue.length) {
    const cur = queue.shift()!
    for (const nb of touching(cur)) {
      if (dist.has(nb) || stageOf(site, nb) === 'out') continue
      dist.set(nb, dist.get(cur)! + 1)
      queue.push(nb)
    }
  }
  const trial: Site = { ...site, items: site.items.map((i) => ({ ...i })) }
  const turns = new Map<string, number>()
  for (let pass = 0; pass < 2; pass++) {
    for (const it of trial.items) {
      const st = stageOf(trial, it)
      const here = dist.get(blocks.find((b) => b.id === it.id)!)
      if (!st || here === undefined) continue
      const def = ITEMS.factory[it.kind]
      const options = def.w === def.h ? [0, 1, 2, 3] : [it.rot, (it.rot + 2) % 4]
      let best = it.rot
      let bestScore = -1
      for (const r of options) {
        const p = portsOf(st, r)
        const box = boxOf(trial, { ...it, rot: r })
        let score = 0
        if (p.out !== null) {
          for (const [x, y] of faceCells(box, p.out)) {
            const b = owner.get(`${x},${y}`)
            const bd = b ? dist.get(b) : undefined
            if (bd !== undefined && bd < here) score = Math.max(score, 10 + (here - bd))
          }
        } else score = 10
        for (const d of p.ins) {
          for (const [x, y] of faceCells(box, d)) {
            const b = owner.get(`${x},${y}`)
            const bd = b ? dist.get(b) : undefined
            if (b && (bd === undefined || bd > here)) score += st === 'belt' ? 0 : 2
          }
        }
        if (score > bestScore || (score === bestScore && r === it.rot)) {
          best = r
          bestScore = score
        }
      }
      if (best !== it.rot) {
        it.rot = best
        turns.set(it.id, best)
      }
    }
  }
  if (!turns.size) return null
  trial.rev = site.rev + 1
  const before = lineStats(site)
  const after = lineStats(trial)
  const score = (s: LineStats) => s.throughput * 10 + s.lines.filter((l) => l.running).length - s.joints.filter((j) => !j.ok).length * 0.01
  return score(after) > score(before) ? turns : null
}

/** Applies planFix in place. Returns how many blocks were turned. */
export function fixLayout(site: Site): number {
  const plan = planFix(site)
  if (!plan) return 0
  for (const it of site.items) {
    const r = plan.get(it.id)
    if (r !== undefined) it.rot = r
  }
  site.rev++
  return plan.size
}
