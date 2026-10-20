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
export function meetingTopic(office: OfficeLife | undefined, team: number, day: number): Topic {
  if (!office) return { text: 'Weekly planning', secret: false }
  const n = team * 7 + day * 3
  const options: Topic[] = []
  for (const d of office.dev) {
    const name = d.product.name
    options.push({ text: pick([`${name}: battery tests`, `${name}: design review`, `${name}: launch plan`, `${name}: bill of materials`], n) ?? name, secret: true })
  }
  for (const r of office.research) options.push({ text: `Research review: ${r.name}`, secret: true })
  if (office.os.own) options.push(office.os.project ? { text: `Sprint planning for ${office.os.name} ${office.os.version + 1}`, secret: true } : { text: `${office.os.name} ${office.os.version}: bug triage`, secret: false })
  if (office.chip) options.push({ text: `${office.chip.name} tape-out review`, secret: true })
  for (const c of office.campaigns) options.push({ text: `Campaign check-in: ${c.target}`, secret: false })
  const sale = office.onSale[0]
  if (sale) options.push({ text: `${sale.name}: sales numbers`, secret: false })
  if (office.support.tickets > 0) options.push({ text: `Support queue: ${office.support.tickets} open tickets`, secret: false })
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
