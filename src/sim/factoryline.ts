// Factory lines as a graph. Every machine block has an input face and an
// output face, set by which way it is turned: parts go in at the back (local
// -X) and come out at the front of the flow (local +X). Where one block's
// output face meets the next block's input face the two are joined; where it
// meets anything else the joint is blocked. A line runs when parts can get
// from a receiving dock to a shipping dock through board assembly, device
// assembly and packaging, in that order. Several machines of one kind in a row
// pass parts through each other and share the work, so their capacities add;
// the slowest stage sets the line's output.
import type { Site, SiteItem } from './types'
import { ITEMS, type Stage, itemTiles, reachable } from './sites'

/** East, south, west, north as tile steps; a turn of one quarter moves one along. */
export const DIRS: readonly [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

/** The stages a line must pass through, in order. Testing is optional and goes after assembly. */
export const RANK: Record<Stage, number> = { in: 0, belt: -1, smt: 1, assembly: 2, test: 3, pack: 4, out: 5 }
const NEEDED = ['smt', 'assembly', 'pack'] as const
const BIT: Partial<Record<Stage, number>> = { smt: 1, assembly: 2, pack: 4 }
const ALL = 7
export const STAGE_NAME: Record<Stage, string> = { in: 'receiving dock', out: 'shipping dock', belt: 'conveyor', smt: 'board assembly', assembly: 'device assembly', test: 'testing', pack: 'packaging' }

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
}

/** One line: everything joined, directly or through other blocks, to one or more receiving docks. */
export interface LineReport {
  /** Id of the first receiving dock on it. */
  id: string
  running: boolean
  problem?: string
  /** Units a day each stage on a working path can handle. */
  caps: Caps
  throughput: number
  /** The stage that sets the output; null when the line does not run. */
  bottleneck: CapStage | null
  runCost: number
  /** Every block joined to this line. */
  items: string[]
  /** Blocks on a working path from a receiving dock to a shipping dock. */
  live: string[]
  /** Blocked joints on this line. */
  blocked: Joint[]
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
}

const zeroCaps = (): Caps => ({ smt: 0, assembly: 0, test: 0, pack: 0 })

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

/** Which faces of a line block take parts in and which one sends them on, as indexes into DIRS. */
export function portsOf(stage: Stage | undefined, rot: number): { out: number | null; ins: number[] } {
  const r = ((rot % 4) + 4) % 4
  if (!stage) return { out: null, ins: [] }
  if (stage === 'in') return { out: r, ins: [] }
  if (stage === 'out') return { out: null, ins: [(r + 2) % 4] }
  // a conveyor takes parts from behind or from either side, so a run of belt can turn a corner
  if (stage === 'belt') return { out: r, ins: [0, 1, 2, 3].filter((d) => d !== r) }
  return { out: r, ins: [(r + 2) % 4] }
}

const nameOf = (site: Site, it: SiteItem) => ITEMS[site.kind][it.kind]?.name ?? it.kind
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

const MEMO = new WeakMap<Site, { rev: number; items: SiteItem[]; n: number; sig: string; stats: LineStats }>()

/** Works out what a factory floor can produce from which faces meet which. */
export function lineStats(site: Site): LineStats {
  const sig = site.items.map((i) => `${i.x},${i.y},${i.rot}`).join(';')
  const m = MEMO.get(site)
  if (m && m.rev === site.rev && m.items === site.items && m.n === site.items.length && m.sig === sig) return m.stats
  const stats = compute(site)
  MEMO.set(site, { rev: site.rev, items: site.items, n: site.items.length, sig, stats })
  return stats
}

function compute(site: Site): LineStats {
  const all = site.items.filter((it) => ITEMS[site.kind]?.[it.kind])
  const blocks = all.filter((it) => stageOf(site, it))
  const owner = new Map<string, SiteItem>()
  for (const it of all) for (const [x, y] of itemTiles(site, it)) owner.set(`${x},${y}`, it)
  const byId = new Map(blocks.map((b) => [b.id, b]))

  // ---- joints: every output face, and what it meets
  const joints: Joint[] = []
  const next = new Map<string, string[]>()
  const prev = new Map<string, string[]>()
  for (const a of blocks) {
    const ports = portsOf(stageOf(site, a), a.rot)
    if (ports.out === null) continue
    const d = ports.out
    const met = new Map<SiteItem, [number, number][]>()
    for (const [x, y] of faceCells(boxOf(site, a), d)) {
      const b = owner.get(`${x},${y}`)
      if (!b || b === a) continue
      met.set(b, [...(met.get(b) ?? []), [x, y]])
    }
    for (const [b, cells] of met) {
      const cx = cells.reduce((s, c) => s + c[0], 0) / cells.length + 0.5 - DIRS[d][0] * 0.5
      const cy = cells.reduce((s, c) => s + c[1], 0) / cells.length + 0.5 - DIRS[d][1] * 0.5
      const bs = stageOf(site, b)
      const bp = portsOf(bs, b.rot)
      const ok = !!bs && bp.ins.includes((d + 2) % 4)
      let why: string | undefined
      if (!ok) {
        if (!bs) why = `The ${lower(nameOf(site, b))} is in the way of the ${lower(nameOf(site, a))}'s output.`
        else if (bp.out === (d + 2) % 4) why = `The ${lower(nameOf(site, a))} and the ${lower(nameOf(site, b))} face each other output to output.`
        else if (bs === 'in') why = `A receiving dock takes nothing in: the ${lower(nameOf(site, a))} feeds into its back.`
        else why = `The ${lower(nameOf(site, a))}'s output meets the side of the ${lower(nameOf(site, b))}. Turn one of them.`
      }
      joints.push({ from: a.id, to: b.id, x: cx, y: cy, dir: d, ok, why })
      if (ok) {
        next.set(a.id, [...(next.get(a.id) ?? []), b.id])
        prev.set(b.id, [...(prev.get(b.id) ?? []), a.id])
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
    while (queue.length) {
      const [id, rank, mask] = queue.shift()!
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
    let runCost = 0
    const counted = onPath.size ? onPath : new Set(group.filter((b) => linked.has(b.id)).map((b) => b.id))
    for (const id of counted) {
      const b = byId.get(id)!
      const st = stageById(id)
      const def = ITEMS.factory[b.kind]
      if (st === 'smt' || st === 'assembly' || st === 'test' || st === 'pack') {
        caps[st] += def.cap ?? 0
        if (onPath.size) runCost += def.run ?? 0
      }
    }
    const ids = new Set(group.map((b) => b.id))
    const blocked = joints.filter((j) => !j.ok && ids.has(j.from))
    const running = onPath.size > 0
    const throughput = running ? Math.min(caps.smt, caps.assembly, caps.pack) : 0
    const bottleneck = running ? NEEDED.reduce<CapStage>((a, k) => (caps[k] < caps[a] ? k : a), 'smt') : null
    let problem: string | undefined
    if (!running) {
      const reachedOut = group.some((b) => stageOf(site, b) === 'out' && linked.has(b.id))
      if (blocked.length) problem = `Logistics blocked: ${blocked[0].why}`
      else if (order.length) {
        const at = byId.get(order[0].at)!
        const after = (Object.keys(RANK) as Stage[]).find((s) => RANK[s] === order[0].after)!
        problem = `The ${lower(nameOf(site, at))} comes after ${STAGE_NAME[after]}: parts go through board assembly, device assembly, testing and packaging, in that order.`
      } else if (!reachedOut) problem = deadEnd ? `Parts stop at the ${lower(nameOf(site, byId.get(deadEnd)!))}: its output leads nowhere. Link it to a shipping dock.` : 'Link the line to a shipping dock.'
      else {
        const missing = NEEDED.filter((k) => !((shortOf < 0 ? 0 : shortOf) & BIT[k]!))
        const names = { smt: 'a board assembly line', assembly: 'an assembly cell or bench', pack: 'a packaging line' }
        problem = `The line still needs ${missing.map((k) => names[k]).join(' and ')}.`
      }
    }
    for (const id of onPath) live.add(id)
    lines.push({ id: docks[0].id, running, problem, caps, throughput, bottleneck, runCost, items: group.map((b) => b.id), live: [...onPath], blocked })
  }

  const flow = new Map<string, [number, number]>()
  for (const b of blocks) if (stageOf(site, b) === 'belt' && linked.has(b.id)) flow.set(b.id, [...DIRS[((b.rot % 4) + 4) % 4]] as [number, number])

  const working = lines.filter((l) => l.running)
  const caps = zeroCaps()
  for (const l of working.length ? working : lines) for (const k of Object.keys(caps) as CapStage[]) caps[k] += l.caps[k]
  const throughput = working.reduce((a, l) => a + l.throughput, 0)
  const runCost = working.reduce((a, l) => a + l.runCost, 0)
  const base = { caps, runCost, linked, live, flow, lines, joints, loose }
  if (!working.length) {
    const problem = !blocks.some((b) => stageOf(site, b) === 'in')
      ? site.rooms.some((r) => r.type === 'hall')
        ? 'Place a receiving dock to start a line.'
        : 'Zone a production hall, then lay a line in it.'
      : (lines.find((l) => l.blocked.length)?.problem ?? lines[0]?.problem ?? 'The line is not finished.')
    return { ...base, running: false, problem, throughput: 0, defectRate: 0, runCost: 0 }
  }
  // untested output ships with 6% faults; full test coverage brings it under 1%,
  // and a staffed control room trims what is left
  const tested = working.reduce((a, l) => a + Math.min(l.caps.test, l.throughput), 0)
  const coverage = Math.min(1, tested / throughput)
  const watch = reachable(site).filter((i) => i.kind === 'console' || i.kind === 'qa').length
  const defectRate = (0.06 - 0.052 * coverage) * (1 - Math.min(0.4, watch * 0.1))
  return { ...base, running: true, throughput, defectRate }
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
