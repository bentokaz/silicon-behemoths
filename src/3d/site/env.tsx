// What lies around a plot: the ground, the road outside, neighbouring
// buildings and trees. Everything static is generated into a few merged
// meshes; nothing here can be built on.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { TierDef } from '../../sim/sites'
import { Baked, Car, Trees, hash } from './kit'
import { Batch, surface } from './structure'

export type Mood = 'day' | 'dusk' | 'night'
export const MOODS: Record<Mood, { sky: string; ground: number; sun: number; sunColor: string; sunDir: [number, number, number]; hemi: number; glow: number }> = {
  day: { sky: '#a8c8e4', ground: 1, sun: 2.2, sunColor: '#fff3dd', sunDir: [0.5, 1, 0.45], hemi: 0.65, glow: 0.7 },
  dusk: { sky: '#d98f66', ground: 0.72, sun: 1.5, sunColor: '#ffab72', sunDir: [0.9, 0.38, 0.5], hemi: 0.45, glow: 1.25 },
  night: { sky: '#0a0f1e', ground: 0.3, sun: 0.22, sunColor: '#9db4e0', sunDir: [-0.4, 1, 0.5], hemi: 0.2, glow: 2 },
}

type Env = TierDef['env']

const GROUND: Record<Env, string> = { suburb: '#587f45', estate: '#6d7075', park: '#5a8447', valley: '#638b4b', industrial: '#70736f', mall: '#c9c4b8', street: '#4a4d52', plaza: '#b3aea2' }
const PAVE = '#a9a59b'
const ROAD = '#34373b'

/** An office or apartment block with ribbon windows. */
function block(b: Batch, x: number, z: number, w: number, d: number, floors: number, color: string, seed: number, lit: boolean) {
  const h = floors * 3.2
  b.box('wall', x, h / 2, z, w, h, d, color, 0.92 + hash(seed) * 0.14)
  for (let f = 0; f < floors; f++) {
    const on = lit && hash(seed + f * 7) > 0.45
    b.box(on ? 'lit' : 'pane', x, f * 3.2 + 1.9, z, w + 0.06, 1.5, d + 0.06, '#27353f')
  }
  b.box('trim', x, h + 0.2, z, w + 0.2, 0.4, d + 0.2, '#3a3d42')
  if (floors > 2) b.box('trim', x + w * 0.2, h + 0.9, z - d * 0.15, w * 0.25, 1.0, d * 0.3, '#8a8f95')
}

/** A low industrial unit with a roller door. */
function shed(b: Batch, x: number, z: number, w: number, d: number, h: number, color: string, seed: number, doorSide: 1 | -1) {
  b.box('wall', x, h / 2, z, w, h, d, color, 0.92 + hash(seed) * 0.14)
  b.box('trim', x, h + 0.15, z, w + 0.3, 0.3, d + 0.3, '#5a5e63')
  const dz = z + doorSide * (d / 2 + 0.03)
  b.box('trim', x - w * 0.2, 1.8, dz, Math.min(4, w * 0.3), 3.6, 0.06, '#8a8f95')
  b.box('pane', x + w * 0.25, 2.2, dz, Math.min(3, w * 0.25), 1.2, 0.06, '#27353f')
}

/** A house with a pitched roof, drawn as a body and a stack of slimmer slabs. */
function house(b: Batch, x: number, z: number, seed: number, lit: boolean) {
  const w = 8 + Math.floor(hash(seed) * 3)
  const d = 6.5
  const wallColor = ['#e4dccb', '#d6cdbb', '#c9b9a3', '#dfe3e2'][seed % 4]
  const roofColor = ['#6b3f34', '#4a4d52', '#5a4638'][seed % 3]
  b.box('wall', x, 1.6, z, w, 3.2, d, wallColor)
  for (let i = 0; i < 5; i++) b.box('wall', x, 3.2 + 0.2 + i * 0.4, z, w + 0.5, 0.4, (d + 0.6) * (1 - i * 0.2), roofColor, 1 - i * 0.03)
  b.box('trim', x - w * 0.25, 1.05, z - d / 2 - 0.03, 1.0, 2.1, 0.06, '#5a4638')
  for (const sx of [0.05, 0.3]) b.box(lit && hash(seed + sx * 10) > 0.4 ? 'lit' : 'pane', x + w * sx, 1.7, z - d / 2 - 0.03, 1.3, 1.2, 0.06, '#27353f')
  b.box('wall', x + w * 0.3, 4.6, z + 1, 0.7, 1.6, 0.7, '#8a5a4a')
}

/** A stack of shipping containers. */
function containers(b: Batch, x: number, z: number, seed: number) {
  const colors = ['#b5462f', '#2f5d8a', '#3f7d4d', '#c9a227', '#8a8f95']
  for (let i = 0; i < 3; i++) {
    const n = 1 + Math.floor(hash(seed + i) * 3)
    for (let k = 0; k < n; k++) b.box('wall', x, 1.3 + k * 2.6, z + i * 2.6, 6, 2.5, 2.45, colors[(seed + i + k) % 5], 0.9 + hash(seed + i * 3 + k) * 0.2)
  }
}

interface Layout {
  meshes: THREE.Mesh[]
  trees: [number, number, number][]
  cars: { x: number; z: number; rot: number; seed: number }[]
}

function build(env: Env, w: number, h: number, mood: Mood): Layout {
  const b = new Batch()
  const M = MOODS[mood]
  const dimHex = (hex: string) => `#${new THREE.Color(hex).multiplyScalar(M.ground).getHexString()}`
  const lit = mood !== 'day'
  const trees: Layout['trees'] = []
  const cars: Layout['cars'] = []
  const hw = w / 2
  const hh = h / 2
  const far = Math.max(w, h) * 4 + 160

  /** A flat frame around the plot: the plot itself is left open so ponds can be sunk into it. */
  const frame = (key: string, out: number, inner: number, y: number, color: string) => {
    const x0 = -hw - inner
    const x1 = hw + inner
    const z0 = -hh - inner
    const z1 = hh + inner
    b.quad(key, -out, -out, out, z0, y, color)
    b.quad(key, -out, z1, out, out, y, color)
    b.quad(key, -out, z0, x0, z1, y, color)
    b.quad(key, x1, z0, out, z1, y, color)
  }
  frame('floor10', far, 0, -0.08, dimHex(GROUND[env]))
  const indoor = env === 'mall'

  if (!indoor) {
    // pavement round the plot, then the road along the south side
    const a = 2.5
    b.quad('floor8', -hw - a, -hh - a, hw + a, -hh, -0.03, dimHex(PAVE))
    b.quad('floor8', -hw - a, hh, hw + a, hh + a, -0.03, dimHex(PAVE))
    b.quad('floor8', -hw - a, -hh, -hw, hh, -0.03, dimHex(PAVE))
    b.quad('floor8', hw, -hh, hw + a, hh, -0.03, dimHex(PAVE))
    const rz = hh + a + 4.5
    b.quad('floor9', -far, rz - 4.5, far, rz + 4.5, -0.05, dimHex(ROAD))
    b.quad('floor8', -far, rz + 4.5, far, rz + 7, -0.03, dimHex(PAVE))
    for (let x = -far; x < far; x += 6) b.quad('floor8', x, rz - 0.08, x + 3, rz + 0.08, -0.035, dimHex('#d9d6cc'))
    // a drive from the road to the plot
    b.quad('floor9', -3, hh, 3, rz - 4.5, -0.02, dimHex(ROAD))
    for (let i = 0; i < 9; i++) {
      const x = -far * 0.5 + i * (far / 9) + hash(i * 3) * 8
      if (Math.abs(x) < 6) continue
      cars.push({ x, z: rz + (i % 2 ? 2.2 : -2.2), rot: i % 2 ? Math.PI / 2 : -Math.PI / 2, seed: i * 7 + w })
    }
  }

  const ring = (step: number, depth: number, each: (x: number, z: number, i: number, facing: 1 | -1) => void) => {
    // plots along the far side of the road, then behind and beside the site
    let i = 0
    for (let x = -far * 0.6; x < far * 0.6; x += step) each(x, hh + 2.5 + 9 + 7 + depth / 2, i++, -1)
    for (let x = -far * 0.6; x < far * 0.6; x += step) each(x, -hh - 2.5 - 8 - depth / 2, i++, 1)
    for (let z = -hh - 2; z < hh + 4; z += step) {
      each(-hw - 2.5 - 10 - depth / 2, z, i++, 1)
      each(hw + 2.5 + 10 + depth / 2, z, i++, 1)
    }
  }

  if (env === 'suburb') {
    ring(14, 7, (x, z, i) => {
      house(b, x, z, i + w, lit)
      trees.push([x + 6, z + 3, 2.2 + hash(i) * 1.2], [x - 5.5, z - 4 + hash(i + 2) * 8, 1.8 + hash(i + 1)])
    })
  } else if (env === 'estate' || env === 'industrial') {
    ring(env === 'estate' ? 22 : 34, env === 'estate' ? 14 : 22, (x, z, i, facing) => {
      const r = hash(i * 5 + h)
      if (env === 'industrial' && r > 0.75) containers(b, x - 3, z - 4, i)
      else shed(b, x, z, (env === 'estate' ? 16 : 26) + r * 4, env === 'estate' ? 12 : 20, (env === 'estate' ? 5 : 8) + r * 3, ['#9ea4aa', '#6e8296', '#b9b4a8', '#7d8a80'][i % 4], i, facing)
      if (env === 'estate' && r > 0.5) trees.push([x + 11, z - 5, 2 + r])
    })
    if (env === 'industrial') {
      for (const [x, z] of [[-hw - 40, -hh - 50], [hw + 55, -hh - 40]]) {
        b.box('wall', x, 16, z, 3, 32, 3, '#b9b4a8')
        b.box('wall', x, 30, z, 3.3, 2, 3.3, '#b5462f')
      }
    }
  } else if (env === 'park' || env === 'valley') {
    ring(env === 'park' ? 30 : 60, 18, (x, z, i) => {
      const r = hash(i * 9 + w)
      if (env === 'park' || r > 0.6) block(b, x, z, 18 + r * 6, 14, env === 'park' ? 2 + Math.floor(r * 4) : 2, ['#d9d6cf', '#bfc6cc', '#c9c2b2', '#e4e1da'][i % 4], i, lit)
      for (let k = 0; k < (env === 'park' ? 3 : 7); k++) trees.push([x - 14 + hash(i * 11 + k) * 28, z - 12 + hash(i * 13 + k) * 24 + (env === 'valley' ? 0 : 12), 2 + hash(i + k) * 2])
    })
    if (env === 'valley') {
      // low hills on the horizon
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2
        const r = far * 0.75
        b.box('wall', Math.cos(ang) * r, 6 + hash(i) * 10, Math.sin(ang) * r, 120 + hash(i + 3) * 80, 12 + hash(i) * 20, 90, '#4f7a45', M.ground * (0.8 + hash(i + 5) * 0.3))
      }
    }
    // a belt of trees just outside the pavement
    for (let i = 0; i < Math.floor((w + h) / 3); i++) {
      const t = hash(i * 17 + w)
      const side = i % 3
      const x = side === 0 ? -hw - 5 - hash(i) * 3 : side === 1 ? hw + 5 + hash(i) * 3 : -hw + t * w
      const z = side === 2 ? -hh - 5 - hash(i) * 3 : -hh + t * h
      trees.push([x, z, 2.2 + hash(i + 9) * 1.6])
    }
  } else if (env === 'street') {
    // party walls either side, a terrace across the road and one behind
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const bw = 12 + hash(i + sx) * 6
        block(b, sx * (hw + 0.4 + bw / 2 + i * 15), 0, bw, h + 4, 4 + Math.floor(hash(i * 3 + sx + 5) * 3), ['#c9b9a3', '#b5a08a', '#d9d2c4', '#a89684'][(i + (sx > 0 ? 1 : 0)) % 4], i * 5 + sx, lit)
      }
    }
    for (let i = -5; i <= 5; i++) {
      block(b, i * 15, hh + 2.5 + 16 + 8, 14, 14, 4 + Math.floor(hash(i + 20) * 4), ['#c9b9a3', '#d9d2c4', '#b9c0c6', '#a89684'][(i + 10) % 4], i + 40, lit)
      block(b, i * 15, -hh - 12, 14, 16, 3 + Math.floor(hash(i + 60) * 5), ['#b5a08a', '#c9c2b2'][(i + 10) % 2], i + 80, lit)
      trees.push([i * 15 + 7, hh + 2.5 + 10.5, 1.6])
    }
  } else if (env === 'plaza') {
    b.quad('floor6', -hw - 14, -hh - 14, hw + 14, hh + 2.5, -0.025, dimHex('#c4bfb3'))
    for (let i = -4; i <= 4; i++) {
      for (const [z, base] of [[hh + 2.5 + 16 + 12, 8], [-hh - 34, 12]] as const) block(b, i * 24, z, 20, 20, base + Math.floor(hash(i + z) * 14), ['#bfc6cc', '#9fb0bd', '#d9d6cf', '#8fa3b3'][(i + 8) % 4], i * 3 + z, lit)
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) block(b, sx * (hw + 34), -hh + i * 26, 20, 20, 10 + Math.floor(hash(i + sx * 9) * 12), ['#bfc6cc', '#d9d6cf', '#9fb0bd'][i], i + 30 + sx, lit)
    for (let i = 0; i < 10; i++) for (const sx of [-1, 1]) trees.push([sx * (hw + 6 + (i % 2) * 5), -hh - 10 + i * ((h + 12) / 10), 1.8])
  } else if (env === 'mall') {
    // the concourse: a polished floor, pillars, and shopfronts opposite and to each side
    b.quad('floor3', -hw - 30, hh, hw + 30, hh + 12, -0.02, dimHex('#d9d4c8'))
    const front = (x: number, z: number, bw: number, depth: number, seed: number, rot: boolean) => {
      const sx = rot ? depth : bw
      const sz = rot ? bw : depth
      b.box('wall', x, 3, z, sx, 6, sz, ['#e4e1da', '#d6cdbb', '#cfd6da'][seed % 3])
      const fx = rot ? x + (x > 0 ? -depth / 2 - 0.03 : depth / 2 + 0.03) : x
      const fz = rot ? z : z - depth / 2 - 0.03
      b.box('lit', fx, 1.7, fz, rot ? 0.06 : bw - 1.2, 3, rot ? bw - 1.2 : 0.06, '#27353f')
      b.box('trim', fx, 3.7, fz, rot ? 0.1 : bw - 0.6, 0.7, rot ? bw - 0.6 : 0.1, ['#c9553d', '#2f5d8a', '#3f7d4d', '#2c3036', '#d6a24f'][seed % 5])
    }
    for (let i = -3; i <= 3; i++) front(i * 11, hh + 12 + 5, 10, 10, i + 5, false)
    for (const sx of [-1, 1]) {
      front(sx * (hw + 5.2), 0, h, 10, sx + 3, true)
      for (let i = 0; i < 3; i++) b.box('trim', sx * (hw * 0.5 + i * 10), 3.5, hh + 6, 0.7, 7, 0.7, '#e9e6e0')
    }
    b.box('wall', 0, 3, -hh - 5.2, w + 21, 6, 10, '#d9d6cf')
    for (let i = -2; i <= 2; i++) b.box('wall', i * 9, 0.25, hh + 6, 2.4, 0.5, 1, '#8c8e90')
  }

  return { meshes: b.build((k) => surface(k, k === 'lit' ? (env === 'mall' ? 0.9 : Math.round(M.glow * 5) / 10) : 0)), trees, cars }
}

export function Environs({ env, w, h, mood }: { env: Env; w: number; h: number; mood: Mood }) {
  const layout = useMemo(() => build(env, w, h, mood), [env, w, h, mood])
  useEffect(() => () => layout.meshes.forEach((m) => m.geometry.dispose()), [layout])
  return (
    <>
      {layout.meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
      <Trees at={layout.trees} />
      <Baked sig={`${env}${w}${h}${mood}`}>
        {layout.cars.map((c, i) => (
          <Car key={i} seed={c.seed} p={[c.x, -0.05, c.z]} rotY={c.rot} glow={mood === 'day' ? 0 : 1} />
        ))}
      </Baked>
    </>
  )
}
