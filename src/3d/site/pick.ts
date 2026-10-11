// Things on a site that can be pointed at and clicked: a lab bench, the
// reception desk, a shipping dock. Each is a box in the world with a label;
// the view tests the pointer's ray against them, so the click lands on the
// object itself rather than on the floor tile behind it.
import { ITEMS } from '../../sim/sites'
import type { Site, SiteItem } from '../../sim/types'

export type TargetKind = 'research' | 'product' | 'campaign' | 'applicants' | 'os' | 'team' | 'support' | 'orders' | 'quality' | 'takings' | 'person'

export interface Target {
  key: string
  kind: TargetKind
  /** The product, campaign, team or employee it stands for, when it is one in particular. */
  id?: string
  /** Shown beside the pointer. */
  label: string
  hint?: string
  /** Corners of the box around it: min x, y, z then max x, y, z. */
  box: [number, number, number, number, number, number]
  /** Where its card is pinned. */
  anchor: [number, number, number]
}

/** Rough heights of the things worth clicking, in metres. */
const HEIGHT: Record<string, number> = { server: 2.05, bench: 1.62, devrig: 1.8, design: 1.05, printer3d: 1.46, showcase: 1.65, media: 2.2, reception: 1.16, meeting: 0.95, desk: 1.08, standing: 1.45, helpdesk: 1.1, exec: 1.1, screen: 2.0, dock_in: 2.8, dock_out: 2.8, test: 1.9, counter: 1.12, table: 1.0, demo: 1.1 }

/** The box an item fills, from its footprint and height. */
export function itemBox(site: Site, item: SiteItem, height?: number): Target['box'] {
  const def = ITEMS[site.kind][item.kind]
  const turned = item.rot % 2 === 1
  const fw = turned ? def.h : def.w
  const fh = turned ? def.w : def.h
  const x0 = item.x - site.w / 2
  const z0 = item.y - site.h / 2
  return [x0 + 0.04, 0, z0 + 0.04, x0 + fw - 0.04, height ?? HEIGHT[item.kind] ?? 1.2, z0 + fh - 0.04]
}

export function itemTarget(site: Site, item: SiteItem, kind: TargetKind, label: string, hint?: string, id?: string): Target {
  const box = itemBox(site, item)
  return { key: `${kind}:${item.id}`, kind, id, label, hint, box, anchor: [(box[0] + box[3]) / 2, box[4] + 0.1, (box[2] + box[5]) / 2] }
}

/** Distance along a ray to where it enters a box, or Infinity if it misses. */
export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Target['box']): number {
  let t0 = 0
  let t1 = Infinity
  for (let a = 0; a < 3; a++) {
    const o = a === 0 ? ox : a === 1 ? oy : oz
    const d = a === 0 ? dx : a === 1 ? dy : dz
    if (Math.abs(d) < 1e-9) {
      if (o < b[a] || o > b[a + 3]) return Infinity
      continue
    }
    const n = (b[a] - o) / d
    const f = (b[a + 3] - o) / d
    t0 = Math.max(t0, Math.min(n, f))
    t1 = Math.min(t1, Math.max(n, f))
    if (t0 > t1) return Infinity
  }
  return t0
}
