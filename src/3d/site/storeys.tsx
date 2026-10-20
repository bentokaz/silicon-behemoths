// What holds the upper floors of a building up and joins them: columns and a
// slab under any room built out over open ground, and around each stairwell a
// rail where the stairs from the floor below come up, with the lift doors on
// every floor a lift's shaft reaches.
import { gridAt, storeysOf, wellsOn } from '../../sim/sites'
import type { Site } from '../../sim/types'
import { Batch, STOREY, surface, useMeshes } from './structure'

const COLUMN = '#b9bcc0'
const SLAB = '#c9c6bf'
const RAIL = '#2a2d31'

/** Whether a tile of a storey has a room on it. */
const built = (l: Site | undefined, x: number, y: number) => !!l && gridAt(l, x, y) > 0

/**
 * The meshes for the storeys from `from` up to `to` (1 is the first floor):
 * under each room tile with no room beneath it, the underside of its floor
 * slab, and a column at each outer corner of the overhang and every few
 * metres along it, down to whatever stands below. Around the stairwells, a
 * rail on the sides the stairs do not come up on.
 */
export function storeyMeshes(ground: Site, from: number, to: number) {
  const b = new Batch()
  const floors = storeysOf(ground)
  const ox = -ground.w / 2
  const oz = -ground.h / 2
  for (let f = Math.max(1, from); f <= to && f < floors.length; f++) {
    const l = floors[f]
    const below = floors[f - 1]
    const base = f * STOREY
    const over = (x: number, y: number) => built(l, x, y) && !built(below, x, y)
    const posts = new Set<string>()
    for (let y = 0; y < l.h; y++) {
      for (let x = 0; x < l.w; x++) {
        if (!over(x, y)) continue
        // the slab's underside, a little below the floor
        b.box('wall', ox + x + 0.5, base - 0.13, oz + y + 0.5, 1, 0.22, 1, SLAB, 0.9)
        // a column at each corner of the tile that is an outer corner of the overhang, and on a 4 m grid inside it
        for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]] as const) {
          const around = [over(cx - 1, cy - 1), over(cx, cy - 1), over(cx - 1, cy), over(cx, cy)].filter(Boolean).length
          if (around === 1 || around === 3 || (cx % 4 === 0 && cy % 4 === 0)) posts.add(`${cx},${cy}`)
        }
      }
    }
    for (const key of posts) {
      const [cx, cy] = key.split(',').map(Number)
      // down to the highest floor under it with a room at this corner, or to the ground
      let foot = 0
      for (let j = f - 1; j >= 0; j--) {
        const fl = floors[j]
        if (built(fl, cx, cy) || built(fl, cx - 1, cy) || built(fl, cx, cy - 1) || built(fl, cx - 1, cy - 1)) {
          foot = (j + 1) * STOREY
          break
        }
      }
      const h = base - 0.24 - foot
      if (h > 0.2) b.box('trim', ox + cx, foot + h / 2, oz + cy, 0.26, h, 0.26, COLUMN)
    }
    // rails round the stairwells on this floor
    const wells = wellsOn(ground, f)
    const stair = (x: number, y: number) => wells.get(y * ground.w + x)?.kind === 'stairs'
    for (const [i, w] of wells) {
      if (w.kind !== 'stairs') continue
      const x = i % ground.w
      const y = Math.floor(i / ground.w)
      const rail = (px: number, pz: number, sx: number, sz: number) => {
        b.box('trim', px, base + 1.0, pz, sx, 0.05, sz, RAIL)
        b.box('trim', px, base + 0.5, pz, Math.min(sx, 0.04), 1.0, Math.min(sz, 0.04), RAIL)
      }
      // the flight rises to the north on the floor below whatever its turn: rail every side but where it meets another stairwell tile or arrives
      if (!stair(x - 1, y)) rail(ox + x, oz + y + 0.5, 0.04, 1)
      if (!stair(x + 1, y)) rail(ox + x + 1, oz + y + 0.5, 0.04, 1)
      if (!stair(x, y + 1)) rail(ox + x + 0.5, oz + y + 1, 1, 0.04)
    }
  }
  return b.build((k) => surface(k))
}

/** The tiles of a storey left open for the stairs coming up from the floor below. */
export function holesOn(ground: Site, floor: number): Set<number> {
  const out = new Set<number>()
  for (const [i, w] of wellsOn(ground, floor)) if (w.kind === 'stairs') out.add(i)
  return out
}

/** Columns, slab undersides and stairwell rails for the storeys from `from` to `to`. */
export function Storeys({ ground, from, to, sig }: { ground: Site; from: number; to: number; /** Changes whenever any storey does. */ sig: string }) {
  const meshes = useMeshes(() => storeyMeshes(ground, from, to), [sig, from, to])
  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  )
}
