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
    const stair = (x: number, y: number) => {
      const k = x >= 0 && x < ground.w ? wells.get(y * ground.w + x)?.kind : undefined
      return !!k && k !== 'lift'
    }
    for (const [i, w] of wells) {
      if (w.kind === 'lift') continue
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

/**
 * Walking: the ceiling over every room of a storey, a few centimetres under
 * the floor above (or the roof), open where stairs go on up through it.
 */
export function Ceilings({ ground, floor, sig }: { ground: Site; floor: number; sig: string }) {
  const meshes = useMeshes(() => {
    const b = new Batch()
    const plan = storeysOf(ground)[floor]
    if (!plan) return []
    const holes = holesOn(ground, floor + 1)
    const y = floor * STOREY + STOREY - 0.085
    for (let i = 0; i < plan.grid.length; i++) {
      if (!plan.grid[i] || holes.has(i)) continue
      const x = i % plan.w
      const z = Math.floor(i / plan.w)
      b.box('wall', x + 0.5 - plan.w / 2, y, z + 0.5 - plan.h / 2, 1, 0.07, 1, '#e9e7e2', 0.95)
    }
    return b.build((k) => surface(k))
  }, [sig, floor])
  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  )
}

/** The tiles of a storey left open for the stairs coming up from the floor below. */
export function holesOn(ground: Site, floor: number): Set<number> {
  const out = new Set<number>()
  for (const [i, w] of wellsOn(ground, floor)) if (w.kind !== 'lift') out.add(i)
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

/**
 * A staircase, a lift or an escalator, as it stands on the floor it rises
 * from, laid out as its item is: a flight climbing north to the floor above,
 * a glass lift car, or a moving stair between glass sides.
 */
export function Climb({ kind }: { kind: string }) {
  if (kind === 'lift')
    return (
      <>
        <mesh position={[0, 1.45, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.76, 2.9, 1.76]} />
          <meshStandardMaterial color="#5a6068" roughness={0.35} />
        </mesh>
        <mesh position={[0, 1.2, 0.885]}>
          <boxGeometry args={[1.0, 2.2, 0.02]} />
          <meshStandardMaterial color="#c9ced3" roughness={0.25} />
        </mesh>
      </>
    )
  const esc = kind === 'escalator'
  const long = esc ? 4 : 3
  const wide = esc ? 1.7 : 0.86
  const steps = esc ? 14 : 10
  const run = long / steps
  return (
    <>
      {Array.from({ length: steps }, (_, i) => {
        const top = ((i + 1) / steps) * STOREY - 0.1
        return (
          <mesh key={i} position={[0, top / 2, long / 2 - (i + 0.5) * run]} castShadow receiveShadow>
            <boxGeometry args={[esc ? wide - 0.3 : wide, top, run]} />
            <meshStandardMaterial color={esc ? (i % 2 ? '#3a3d42' : '#45484e') : i % 2 ? '#8d9095' : '#979a9e'} roughness={0.7} />
          </mesh>
        )
      })}
      {[-wide / 2, wide / 2].map((x) =>
        esc ? (
          // glass sides rising with the stair to the north
          <mesh key={x} position={[x * 0.92, STOREY / 2 + 0.3, 0]} rotation-x={-Math.atan2(STOREY, long)}>
            <boxGeometry args={[0.06, 0.9, Math.hypot(STOREY, long)]} />
            <meshStandardMaterial color="#cfe3ec" transparent opacity={0.35} roughness={0.1} />
          </mesh>
        ) : (
          <mesh key={x} position={[x, 2.0, 0]}>
            <boxGeometry args={[0.04, 0.05, long + 0.1]} />
            <meshStandardMaterial color="#2a2d31" roughness={0.4} />
          </mesh>
        ),
      )}
    </>
  )
}
