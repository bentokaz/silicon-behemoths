// What the building itself is, apart from what stands in it: the grid, the
// rooms and their styles, the walls, the cut corners and curves, the ground
// finishes and the look. The walls and floors are rebuilt only when this
// changes, so putting a desk down on a large campus no longer puts the whole
// building up again.
import type { Site } from '../../sim/types'

const MEMO = new WeakMap<Site, { rev: number; key: string }>()

/** FNV-1a over a string, as eight hex digits. */
function fnv(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** A short key that changes whenever the plan of the site does, and not when only its furniture does. */
export function planKey(site: Site): string {
  const m = MEMO.get(site)
  if (m && m.rev === site.rev) return m.key
  const text = `${site.kind}|${site.tier}|${site.w}x${site.h}|${site.facade}|${site.roof}|${site.floors}|${site.grid.join(',')}|${JSON.stringify(site.rooms)}|${JSON.stringify(site.walls)}|${JSON.stringify(site.cuts ?? null)}|${JSON.stringify(site.curves ?? null)}|${JSON.stringify(site.floor)}`
  const key = `${fnv(text)}${text.length.toString(36)}`
  MEMO.set(site, { rev: site.rev, key })
  return key
}
