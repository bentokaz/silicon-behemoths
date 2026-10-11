// Cursors for curved walls: the outline of a round room before it is built,
// and the bay of curved wall under the pointer.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { type CurveSpec, geomOf, outlineOf } from '../../sim/curves'
import type { Site } from '../../sim/types'
import { Batch, WALL_T } from './structure'

const plain = () => ({ material: new THREE.MeshBasicMaterial() })

/** The true line a round, ring or arc room's wall will follow, drawn on the ground. */
export function CurveOutline({ spec, w, h, color }: { spec: CurveSpec; w: number; h: number; color: string }) {
  const key = `${spec.cx},${spec.cy},${spec.rx},${spec.ry},${spec.t ?? 0},${spec.from ?? 0},${spec.sweep ?? 360}`
  const geo = useMemo(() => {
    const b = new Batch()
    for (const loop of outlineOf(spec)) {
      loop.forEach(([x0, z0], i) => {
        const [x1, z1] = loop[(i + 1) % loop.length]
        const len = Math.hypot(x1 - x0, z1 - z0)
        if (len < 1e-6) return
        b.boxRot('o', (x0 + x1) / 2 - w / 2, 0.06, (z0 + z1) / 2 - h / 2, len + 0.06, 0.05, 0.14, Math.atan2(-(z1 - z0), x1 - x0), '#ffffff')
      })
    }
    return b.build(plain)[0]?.geometry ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, w, h])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  return (
    <mesh geometry={geo} renderOrder={6}>
      <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  )
}

/** A highlight over one bay of a curved wall. */
export function BayCursor({ site, curve, bay, height, color }: { site: Site; curve: number; bay: string; height: number; color: string }) {
  const c = site.curves?.[curve]
  const geo = useMemo(() => {
    if (!c) return null
    const g = geomOf(c)
    const info = g.bays.get(bay)
    if (!info) return null
    const b = new Batch()
    for (const i of info.facets) {
      const f = g.facets[i]
      b.boxRot('o', (f.x0 + f.x1) / 2 - site.w / 2, height / 2 + 0.02, (f.y0 + f.y1) / 2 - site.h / 2, f.len, height + 0.06, WALL_T + 0.06, Math.atan2(-(f.y1 - f.y0), f.x1 - f.x0), '#ffffff')
    }
    return b.build(plain)[0]?.geometry ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.cx, c?.cy, c?.rx, c?.ry, c?.t, c?.from, c?.sweep, bay, height, site.w, site.h])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  return (
    <mesh geometry={geo} renderOrder={6}>
      <meshBasicMaterial color={color} transparent opacity={0.45} depthWrite={false} />
    </mesh>
  )
}
