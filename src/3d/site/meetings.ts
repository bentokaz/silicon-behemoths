// Meetings as the view shows them: which meeting tables stand end to end and
// are drawn as one long table, what a team is meeting about (taken from what
// the company is actually doing), and which glass a confidential meeting
// frosts over.
import { edgeSides, gridAt } from '../../sim/sites'
import type { OfficeLife } from '../../sim/life'
import type { Site, SiteItem } from '../../sim/types'

/** Which way an item's own +x runs on the plot, by its quarter turns. */
const ALONG: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

/**
 * Meeting tables that stand end to end in one room, turned the same way, by
 * id: whether each is joined at its own left and right end. Joined ends are
 * drawn as one long table, with the seats running along it.
 */
export function tableJoins(site: Site): Map<string, [boolean, boolean]> {
  const out = new Map<string, [boolean, boolean]>()
  const tables = site.items.filter((i) => i.kind === 'meeting')
  if (tables.length < 2) return out
  const at = new Map(tables.map((t) => [`${t.x},${t.y}`, t]))
  for (const t of tables) {
    const [dx, dy] = ALONG[t.rot % 4]
    const room = gridAt(site, t.x, t.y)
    const near = (k: number) => {
      const o = at.get(`${t.x + dx * 2 * k},${t.y + dy * 2 * k}`)
      return !!o && o.rot % 2 === t.rot % 2 && gridAt(site, o.x, o.y) === room
    }
    const l = near(-1)
    const r = near(1)
    if (l || r) out.set(t.id, [l, r])
  }
  return out
}

/**
 * The meeting tables grouped into chains: tables joined end to end are one long table
 * with one team seated along it. Ordered by first table in the site's item list.
 */
export function meetingChains(site: Site): SiteItem[][] {
  const joins = tableJoins(site)
  const tables = site.items.filter((i) => i.kind === 'meeting')
  const at = new Map(tables.map((t) => [`${t.x},${t.y}`, t]))
  const seen = new Set<string>()
  const out: SiteItem[][] = []
  for (const t of tables) {
    if (seen.has(t.id)) continue
    const chain: SiteItem[] = []
    const stack = [t]
    seen.add(t.id)
    while (stack.length) {
      const c = stack.pop()!
      chain.push(c)
      const j = joins.get(c.id)
      if (!j) continue
      const [dx, dy] = ALONG[c.rot % 4]
      for (const k of [-1, 1]) {
        if (!j[k < 0 ? 0 : 1]) continue
        const o = at.get(`${c.x + dx * 2 * k},${c.y + dy * 2 * k}`)
        if (o && !seen.has(o.id)) {
          seen.add(o.id)
          stack.push(o)
        }
      }
    }
    out.push(chain)
  }
  return out
}

/** What a meeting is about, and whether what is said in it stays in the room. */
export interface Topic {
  text: string
  /** Unreleased work: the glass round the room frosts over while it runs. */
  secret: boolean
}

const pick = <T,>(list: T[], n: number): T | undefined => (list.length ? list[((n % list.length) + list.length) % list.length] : undefined)

/**
 * What a team meets about today, drawn from what the company is doing: a
 * device in development, research under way, the operating system, a
 * campaign, the devices on sale or the support queue. The same team keeps
 * its subject through a day and moves on to another the next.
 */
export function meetingTopic(office: OfficeLife | undefined, team: number, day: number, block = 0, room = 0): Topic {
  if (!office) return { text: 'Weekly planning', secret: false }
  // varies by team and room, moves on every few hours and every day
  const n = team + room * 5 + day * 3 + block
  const v = (k: number) => n + k * 7
  const options: Topic[] = []
  const teamName = office.teams?.length ? office.teams[team % office.teams.length]?.name : undefined
  for (const d of office.dev) {
    const name = d.product.name
    options.push({ text: pick([`${name}: battery tests`, `${name}: design review`, `${name}: launch plan`, `${name}: bill of materials`, `${name}: ${d.daysLeft} days to ship`, `${name}: ${Math.round(d.progress * 100)}% built, what is slipping`], v(1)) ?? name, secret: true })
  }
  for (const r of office.research) options.push({ text: pick([`Research review: ${r.name}`, `${r.name}: next milestone`, `Research budget: ${r.name}`], v(2)) ?? r.name, secret: true })
  if (office.os.own) {
    const os = `${office.os.name} ${office.os.version}`
    options.push(office.os.project ? { text: pick([`Sprint planning for ${office.os.name} ${office.os.version + 1}`, `${office.os.name} ${office.os.version + 1}: ${office.os.project.daysLeft} days to release`], v(3)) ?? os, secret: true } : { text: pick([`${os}: bug triage`, `${os}: quality ${Math.round(office.os.quality)}, what to fix`, `${os}: app store and services`], v(3)) ?? os, secret: false })
  }
  if (office.chip) options.push({ text: pick([`${office.chip.name} tape-out review`, `${office.chip.name}: ${office.chip.daysLeft} days to silicon`], v(4)) ?? office.chip.name, secret: true })
  for (const c of office.campaigns) options.push({ text: pick([`Campaign check-in: ${c.target}`, `${c.channel}: ${c.target}, spend so far`], v(5)) ?? c.target, secret: false })
  for (const sale of office.onSale.slice(0, 3)) options.push({ text: pick([`${sale.name}: sales numbers`, `${sale.name}: price and margin`, `${sale.name}: returns and reviews`], v(6)) ?? sale.name, secret: false })
  if (office.support.tickets >= 1) options.push({ text: `Support queue: ${Math.round(office.support.tickets).toLocaleString('en-US')} open tickets`, secret: false })
  if (office.support.load > 1) options.push({ text: 'Support is over capacity: hiring or tooling?', secret: false })
  if (office.applicants > 0) options.push({ text: `Hiring: ${office.applicants} applicants to review`, secret: false })
  if (office.budget > 0) options.push({ text: `Budget review: research at $${Math.round(office.budget).toLocaleString('en-US')} a month`, secret: false })
  const f = office.factory
  if (f) {
    if (f.running && f.bottleneck) options.push({ text: pick([`Factory bottleneck: ${f.bottleneck}`, `Line output is held up at ${f.bottleneck}`], v(8)) ?? 'Factory line', secret: false })
    if (f.defectRate > 0.01) options.push({ text: `Quality: ${(f.defectRate * 100).toFixed(1)}% defects on the line`, secret: false })
    if (f.idle) options.push({ text: pick(['The line is standing idle: where are the orders?', 'Idle line: what to build next'], v(9)) ?? 'Idle line', secret: false })
  }
  const m = office.finance
  if (m) {
    if (m.runwayMonths !== undefined) options.push({ text: `Cash runway: ${m.runwayMonths.toFixed(1)} months at this burn`, secret: true })
    if (m.monthProfit !== 0) options.push({ text: m.monthProfit > 0 ? `Last month: $${Math.round(m.monthProfit).toLocaleString('en-US')} profit` : `Last month: $${Math.round(-m.monthProfit).toLocaleString('en-US')} loss`, secret: true })
    options.push({ text: m.raiseInDays > 0 ? `Funding: next round possible in ${m.raiseInDays} days` : 'Funding: investors are open to a new round', secret: true })
  }
  if (teamName) options.push({ text: `${teamName} team: weekly sync`, secret: false })
  return pick(options, n) ?? { text: 'Weekly planning', secret: false }
}

/** The glass stretches on a room's walls and partitions: what frosts over when a confidential meeting runs. */
export function glassOf(site: Site, room: number): { x: number; y: number; side: 'n' | 'w' }[] {
  return site.walls.filter((w) => w.kind === 'glass' && edgeSides(w.x, w.y, w.side).some(([x, y]) => gridAt(site, x, y) === room)).map((w) => ({ x: w.x, y: w.y, side: w.side }))
}

/** A meeting going on: the table, the team at it and how many are sat down. */
export interface MeetingNow {
  table: SiteItem
  team: number
  people: number
}
