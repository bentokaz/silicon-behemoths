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

const GROUND: Record<Env, string> = { suburb: '#587f45', estate: '#6d7075', park: '#5a8447', valley: '#638b4b', industrial: '#70736f', mall: '#2b2a28', street: '#4a4d52', plaza: '#b3aea2' }
/** What shows above and beyond the walls of a mall, where the sky would be out of doors: the dim upper reaches of the building, and after dark the night beyond its roof light. */
export const INDOOR_SKY: Record<Mood, string> = { day: '#8d887e', dusk: '#5f5650', night: '#1c1d23' }
/** True for surroundings that are indoors, where there is no sky, weather or traffic. */
export const isIndoor = (env: Env) => env === 'mall'
/**
 * The light indoors. By day the roof light does the work. As it goes the
 * hall's own lamps come up, and by night they are all there is: plainly
 * warmer and lower than daylight, an evening in a place that is still open,
 * with the shop signs and the shopfronts brighter than the hall around them.
 * The light keeps much the same slant at every hour, so the walls of the
 * hall are lit as well as its floor. It never gets dark in there.
 */
export const INDOOR_MOODS: typeof MOODS = {
  day: { ...MOODS.day, sky: INDOOR_SKY.day, sunDir: [0.4, 1, 0.4] },
  dusk: { sky: INDOOR_SKY.dusk, ground: 0.9, sun: 1.5, sunColor: '#ffdcb4', sunDir: [0.37, 1, 0.41], hemi: 0.5, glow: 1.25 },
  night: { sky: INDOOR_SKY.night, ground: 0.72, sun: 0.82, sunColor: '#ffbd7e', sunDir: [0.34, 1, 0.42], hemi: 0.4, glow: 1.6 },
}
/** How bright the hall's lit glass and lamps are, and whether its shop signs are lit, at each hour. */
const INDOOR_GLOW: Record<Mood, { lit: number; signs: number }> = { day: { lit: 0.5, signs: 0 }, dusk: { lit: 1.2, signs: 0.8 }, night: { lit: 1.7, signs: 1 } }
const signs = new Map<number, THREE.Material>()
/** The material of a lit shop sign: its own colour, glowing, whatever the light around it. */
function signLit(level: number): THREE.Material {
  let m = signs.get(level)
  if (!m) signs.set(level, (m = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(level, level, level), toneMapped: false })))
  return m
}
/** The light a site stands in: the hour's own out of doors, the hall's indoors. */
export const moodOf = (env: Env, mood: Mood) => (isIndoor(env) ? INDOOR_MOODS[mood] : MOODS[mood])
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

const SIGNS = ['#c9553d', '#2f5d8a', '#3f7d4d', '#2c3036', '#d6a24f', '#7a4f8a', '#2f7d7a']
const UNIT_WALLS = ['#e4e1da', '#d6cdbb', '#cfd6da', '#dcd3c8']
/** Height of a ground-floor unit, which is also the level of the gallery above it. */
const DECK = 5.2

/**
 * The inside of a shopping mall round a unit: the unit stands in a well
 * open to the roof, on the north side of a tiled concourse, with other
 * shops beside it and across the way, a gallery of more shops above them
 * and a glazed roof over the concourse. Everything near the camera's usual
 * place (south and east) is kept low or set back, so the unit stays in view.
 */
function mall(b: Batch, w: number, h: number, dim: (hex: string) => string, mood: Mood) {
  const hw = w / 2
  const hh = h / 2
  const front = hh
  const across = front + 12
  const reach = hw + 36
  const back = -hh - 11
  const end = across + 10.4
  const wall = '#dedad2'
  const steel = '#3a3d42'
  /** The roof's steelwork is painted pale, so that seen from above it is a light tracery rather than bars across the view. */
  const frame = '#b9bdc2'

  // columns stand along the near side of the concourse only, and clear of the unit: opposite, they would be
  // between the camera and the shop. The hall's lamps hang from the trusses they carry
  const top = 13.2
  const cols: number[] = []
  for (let x = hw + 4.7; x < reach - 2; x += 9) cols.push(x, -x)
  const hung = [front + 3.6, across - 3.6]
  /** How much of a lamp's pool of light falls on a spot of the floor, once the roof light has gone: 0 to 1. */
  const pool = (x: number, z: number) => {
    let best = 0
    for (const lx of cols) for (const lz of hung) best = Math.max(best, 1 - Math.hypot(x - lx, z - lz) / 6.5)
    return best * best * (3 - 2 * best)
  }
  const lamplight = mood === 'night' ? 0.34 : mood === 'dusk' ? 0.12 : 0

  // ---- the concourse floor: large polished tiles in two tones and a dark inlay along each row of shopfronts. By
  // day there is a pale band down the middle under the roof light; by night the roof light is dark, and the floor
  // is brightest under each of the hall's lamps instead
  const tone = ['#d9d3c6', '#cfc8ba']
  const band = mood === 'day' ? '#e6e1d6' : mood === 'dusk' ? '#dcd6ca' : null
  for (let x = -reach; x < reach; x += 2) {
    for (let z = front; z < across; z += 2) {
      const mid = z >= front + 4 && z < front + 8
      const chequer = tone[(Math.round(x / 2) + Math.round(z / 2)) & 1]
      b.quad('floor3', x, z, Math.min(reach, x + 2), Math.min(across, z + 2), -0.02, dim(mid && band ? band : chequer), (0.97 + hash(x * 13 + z * 7) * 0.05) * (1 + lamplight * pool(x + 1, z + 1)))
    }
  }
  for (const z of [front + 0.5, across - 0.5]) b.quad('floor3', -reach, z - 0.12, reach, z + 0.12, -0.015, dim('#4a4640'))
  for (const z of [front + 4, front + 8]) b.quad('floor3', -reach, z - 0.05, reach, z + 0.05, -0.015, dim('#8c857a'))

  /** A ground-floor shop facing the concourse: a lit glass front under a coloured sign band. `face` is 1 to look south, -1 north. */
  const unit = (x0: number, x1: number, z0: number, z1: number, face: 1 | -1, seed: number) => {
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    const bw = x1 - x0
    b.box('wall', cx, DECK / 2, cz, bw, DECK, z1 - z0, UNIT_WALLS[seed % UNIT_WALLS.length], 0.96 + hash(seed) * 0.06)
    const fz = face > 0 ? z1 + 0.03 : z0 - 0.03
    b.box('lit', cx, 1.75, fz, bw - 1.1, 3.1, 0.06, '#27353f')
    b.box('sign', cx, 3.85, fz + face * 0.05, bw - 0.5, 0.8, 0.16, SIGNS[seed % SIGNS.length])
    b.box('trim', cx, 0.1, fz, bw - 1.1, 0.2, 0.1, steel)
    // mullions and a door frame
    for (const u of [0.25, 0.5, 0.75]) b.box('trim', x0 + bw * u, 1.75, fz + face * 0.02, 0.07, 3.1, 0.08, steel)
    // the party wall shows between one shop and the next
    b.box('wall', x0, DECK / 2, cz + face * 0.2, 0.35, DECK, z1 - z0 + 0.4, wall)
  }
  /** A shop on the gallery, set back behind its walkway: a taller box with a lit front. */
  const upper = (x0: number, x1: number, z0: number, z1: number, face: 1 | -1, seed: number) => {
    const cx = (x0 + x1) / 2
    const top = 10.6
    b.box('wall', cx, (DECK + top) / 2, (z0 + z1) / 2, x1 - x0, top - DECK, z1 - z0, UNIT_WALLS[(seed + 2) % UNIT_WALLS.length], 0.94 + hash(seed + 5) * 0.06)
    const fz = face > 0 ? z1 + 0.03 : z0 - 0.03
    b.box('lit', cx, DECK + 1.7, fz, x1 - x0 - 1.2, 2.8, 0.06, '#27353f')
    b.box('sign', cx, DECK + 3.6, fz + face * 0.05, x1 - x0 - 0.6, 0.7, 0.14, SIGNS[(seed + 3) % SIGNS.length])
    b.box('trim', cx, DECK + 0.12, fz, x1 - x0 - 1.2, 0.2, 0.1, steel)
    for (const u of [0.2, 0.4, 0.6, 0.8]) b.box('trim', x0 + (x1 - x0) * u, DECK + 1.7, fz + face * 0.02, 0.07, 2.8, 0.08, steel)
  }
  /** The floor of a gallery: the same polished tiles as the concourse, a size smaller, with a dark line inside its open edge. */
  const deck = (x0: number, z0: number, x1: number, z1: number, edge: number) => {
    for (let x = x0; x < x1 - 0.01; x += 2) {
      for (let z = z0; z < z1 - 0.01; z += 2) b.quad('floor3', x, z, Math.min(x1, x + 2), Math.min(z1, z + 2), DECK + 0.01, dim(tone[(Math.round((x - x0) / 2) + Math.round((z - z0) / 2)) & 1]), 0.95 + hash(x * 11 + z * 5) * 0.05)
    }
    b.quad('floor3', x0, edge - 0.09, x1, edge + 0.09, DECK + 0.016, dim('#6f695f'))
  }
  /** The edge of a gallery: the slab's rim, a glass balustrade and its rail, from one point to another along x or z. */
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    const lx = Math.abs(x1 - x0)
    const lz = Math.abs(z1 - z0)
    b.box('trim', cx, DECK - 0.15, cz, lx + 0.3, 0.5, lz + 0.3, '#c9c4b8')
    b.box('glass', cx, DECK + 0.62, cz, Math.max(lx, 0.04), 1.0, Math.max(lz, 0.04), '#bfe0f2')
    b.box('trim', cx, DECK + 1.16, cz, lx + 0.08, 0.07, lz + 0.08, steel)
    const n = Math.max(1, Math.round(Math.max(lx, lz) / 2.4))
    for (let i = 0; i <= n; i++) b.box('trim', x0 + ((x1 - x0) * i) / n, DECK + 0.6, z0 + ((z1 - z0) * i) / n, 0.06, 1.1, 0.06, steel)
  }

  // ---- this side of the concourse: shops either side of the unit, their roofs the gallery walkway
  let seed = 3
  for (const sx of [-1, 1]) {
    for (let x = hw + 0.2; x < reach - 1; x += 9) {
      const x1 = Math.min(reach, x + 9)
      unit(sx > 0 ? x : -x1, sx > 0 ? x1 : -x, -hh - 1, front - 0.3, 1, seed++)
    }
    // the walkway on top, tiled, and its balustrade along the concourse and round the well the unit stands in
    deck(sx > 0 ? hw + 0.2 : -reach, -hh - 1, sx > 0 ? reach : -hw - 0.2, front - 0.3, front - 1.1)
    // a line of light under the gallery's edge, over the shopfronts
    b.box('lit', sx * (hw + 0.25 + reach) * 0.5, DECK - 0.43, front - 0.22, reach - hw - 0.6, 0.06, 0.22, '#27353f')
    rail(sx * (hw + 0.25), front - 0.3, sx * reach, front - 0.3)
    rail(sx * (hw + 0.25), -hh - 0.9, sx * (hw + 0.25), front - 0.3)
  }
  // behind the unit: the service wall, the walkway carried across above it, and the gallery's own shops along the back
  b.box('wall', 0, DECK / 2, -hh - 0.6, w + 0.8, DECK, 0.8, wall)
  b.box('trim', 0, 2.2, -hh - 0.18, 1.1, 2.2, 0.06, '#8a8f95')
  rail(-hw - 0.25, -hh - 0.9, hw + 0.25, -hh - 0.9)
  deck(-reach, -hh - 5, reach, -hh - 1, -hh - 4.4)
  b.box('wall', 0, DECK / 2, (back + -hh - 1) / 2, reach * 2, DECK, -hh - 1 - back, '#cbc6bc')
  for (let x = -reach; x < reach - 1; x += 12) upper(x + 0.3, Math.min(reach, x + 12) - 0.3, back, -hh - 5, 1, seed++)

  // ---- across the concourse: another row of shops with the gallery above. This is the side the view is usually
  // from, so the gallery's own shops are only fronts on a low wall at the back, not a storey that would hide the floor
  for (let x = -reach; x < reach - 1; x += 10) unit(x, Math.min(reach, x + 10), across + 0.3, across + 10, -1, seed++)
  deck(-reach, across + 0.3, reach, across + 10, across + 1.1)
  b.box('lit', 0, DECK - 0.43, across + 0.22, reach * 2 - 0.6, 0.06, 0.22, '#27353f')
  rail(-reach, across + 0.3, reach, across + 0.3)
  const crown = 8.8
  b.box('wall', 0, crown / 2, end, reach * 2, crown, 0.8, '#cbc6bc')
  for (let x = -reach; x < reach - 1; x += 12) {
    const x1 = Math.min(reach, x + 12)
    const cx = (x + x1) / 2
    const bw = x1 - x
    const sign = SIGNS[seed++ % SIGNS.length]
    b.box('lit', cx, DECK + 1.5, end - 0.43, bw - 1.4, 2.4, 0.06, '#27353f')
    b.box('sign', cx, DECK + 3.05, end - 0.46, bw - 0.8, 0.5, 0.12, sign)
    b.box('trim', cx, DECK + 0.12, end - 0.44, bw - 1.4, 0.2, 0.1, steel)
    for (const u of [0.2, 0.4, 0.6, 0.8]) b.box('trim', x + bw * u, DECK + 1.5, end - 0.47, 0.07, 2.4, 0.08, steel)
    // seen from across the hall these fronts have their backs to the view: each shop is told by the canopy
    // over its door, in its own colour, and by the pier between it and the next
    b.box('wall', cx, crown - 0.36, end - 1.3, bw - 1, 0.12, 1.8, sign, 0.74)
    b.box('trim', cx, crown - 0.5, end - 2.16, bw - 1, 0.3, 0.08, '#2c3036')
    b.box('wall', x, (DECK + crown) / 2, end - 0.75, 0.5, crown - DECK, 0.9, wall)
  }

  // ---- the outside of that row, which the view looks over from far back: a plinth, piers, the lit back windows
  // of the shops above, and the yard doors of the ones below
  const out = end + 0.4
  b.box('trim', 0, 0.4, out + 0.05, reach * 2 + 1.6, 0.8, 0.1, '#6b675f')
  b.box('trim', 0, DECK, out + 0.04, reach * 2 + 1.6, 0.22, 0.08, '#a8a398')
  b.box('trim', 0, crown + 0.08, end, reach * 2 + 1.8, 0.16, 1.05, steel)
  for (let x = -reach, i = 0; x < reach - 1; x += 10, i++) {
    const x1 = Math.min(reach, x + 10)
    const cx = (x + x1) / 2
    const bw = x1 - x
    b.box('wall', x, crown / 2, out + 0.1, 0.7, crown, 0.2, '#d6d1c7')
    b.box('lit', cx, DECK + 2, out + 0.03, bw - 3, 1.1, 0.06, '#27353f')
    for (const u of [0.25, 0.5, 0.75]) b.box('trim', x + 1.5 + (bw - 3) * u, DECK + 2, out + 0.05, 0.07, 1.1, 0.06, steel)
    b.box('trim', cx, DECK + 2.62, out + 0.06, bw - 2.8, 0.1, 0.1, steel)
    if (i % 2) {
      // a goods door under a lamp
      b.box('trim', cx - 1.6, 1.5, out + 0.04, 2.6, 3, 0.08, '#8a8f95')
      for (let k = 1; k < 6; k++) b.box('trim', cx - 1.6, k * 0.5, out + 0.09, 2.6, 0.04, 0.02, '#6f747a')
      b.box('lit', cx - 1.6, 3.35, out + 0.1, 0.9, 0.12, 0.2, '#27353f')
    } else {
      // a staff door, a lamp over it, and a grille for the plant
      b.box('trim', cx + 1.4, 1.1, out + 0.04, 1.1, 2.2, 0.08, '#5a5e63')
      b.box('lit', cx + 1.4, 2.5, out + 0.1, 0.5, 0.1, 0.18, '#27353f')
      b.box('trim', cx - 1.8, 3.4, out + 0.04, 2.4, 1.1, 0.06, '#8a8f95')
      for (let k = 0; k < 5; k++) b.box('trim', cx - 1.8, 2.98 + k * 0.21, out + 0.08, 2.3, 0.05, 0.03, '#5a5e63')
    }
  }
  b.box('wall', reach, crown / 2, out + 0.1, 0.7, crown, 0.2, '#d6d1c7')
  // the yard along the back of the row
  b.quad('floor8', -reach - 0.8, out, reach + 0.8, out + 4.6, -0.04, dim('#5c5953'))
  b.quad('floor8', -reach - 0.8, out + 4.6, reach + 0.8, out + 4.9, -0.035, dim('#8c877c'))

  // ---- the hall itself: end walls, and a glazed roof over the concourse carried on columns
  for (const sx of [-1, 1]) b.box('wall', sx * (reach + 0.4), top / 2, (back + end) / 2, 0.8, top, end - back + 0.8, '#c4bfb5')
  b.box('wall', 0, top / 2, back - 0.4, reach * 2 + 1.6, top, 0.8, '#c4bfb5')
  for (const x of cols) {
    b.box('wall', x, top / 2, front + 0.5, 0.5, top, 0.5, '#e9e6e0')
    b.box('trim', x, 0.25, front + 0.5, 0.7, 0.5, 0.7, '#8c857a')
    // a truss from each column across to the gallery opposite, with the glazing bars of the roof light between
    b.box('trim', x, top + 0.15, (front + across) / 2, 0.14, 0.34, across - front - 0.4, frame)
  }
  for (const z of [front + 0.5, across - 0.5]) b.box('trim', 0, top + 0.4, z, reach * 2, 0.14, 0.14, frame)
  for (let x = -reach + 1.5; x < reach; x += 4.5) b.box('trim', x, top + 0.5, (front + across) / 2, 0.04, 0.04, across - front - 1, frame)

  // ---- what stands on the concourse: benches and planters down the middle, a kiosk, a way up, a directory
  const planter = (x: number, z: number, s: number, y = 0) => {
    b.box('wall', x, y + 0.3, z, 2.6, 0.6, 1.1, '#3b3d40')
    b.box('wall', x, y + 0.63, z, 2.4, 0.08, 0.9, '#3a2f26')
    for (let i = 0; i < 4; i++) b.box('wall', x - 0.9 + i * 0.6, y + 0.95 + hash(s + i) * 0.25, z + (hash(s + i * 3) - 0.5) * 0.3, 0.55, 0.6 + hash(s + i * 5) * 0.4, 0.55, i % 2 ? '#4f8a52' : '#3f7d4d')
  }
  const bench = (x: number, z: number, y = 0) => {
    b.box('wall', x, y + 0.42, z, 2.2, 0.09, 0.55, '#9a7650')
    for (const dx of [-0.9, 0.9]) b.box('trim', x + dx, y + 0.2, z, 0.08, 0.4, 0.5, steel)
  }
  /** A lamp standard: a slim post with a lit head. */
  const lamp = (x: number, z: number, y: number, h: number) => {
    b.box('trim', x, y + h / 2, z, 0.09, h, 0.09, steel)
    b.box('trim', x, y + 0.08, z, 0.3, 0.16, 0.3, steel)
    b.box('trim', x, y + h, z, 0.7, 0.06, 0.7, steel)
    b.box('lit', x, y + h + 0.1, z, 0.56, 0.14, 0.56, '#27353f')
  }
  /** A café table with four stools round it. */
  const table = (x: number, z: number, y: number, s: number) => {
    b.box('wall', x, y + 0.74, z, 0.82, 0.05, 0.82, '#e9e6e0')
    b.box('trim', x, y + 0.36, z, 0.1, 0.72, 0.1, steel)
    for (const [dx, dz] of [[-0.72, 0], [0.72, 0], [0, -0.72], [0, 0.72]]) b.box('wall', x + dx, y + 0.23, z + dz, 0.34, 0.46, 0.34, SIGNS[s % SIGNS.length], 0.9)
  }
  const mid = front + 6
  for (let i = -3; i <= 3; i++) {
    const x = i * 9 + 4.5
    if (Math.abs(x) > reach - 6) continue
    planter(x, mid, i + 9)
    bench(x, mid - 1.15)
    bench(x, mid + 1.15)
    // a bin beside every other one
    if (i % 2 === 0) b.box('trim', x + 1.9, 0.45, mid, 0.42, 0.9, 0.42, '#5a5e63')
  }
  // a kiosk: a counter on three sides under a canopy with a lit band
  const kx = -(hw + 9)
  for (const [dx, dz, sx, sz] of [[0, -1.2, 3, 0.5], [-1.25, 0, 0.5, 2.9], [1.25, 0, 0.5, 2.9]]) b.box('wall', kx + dx, 0.55, mid + dz, sx, 1.1, sz, '#2c3036')
  b.box('trim', kx, 1.12, mid, 3.1, 0.05, 3, '#c9c4b8')
  for (const dx of [-1.4, 1.4]) for (const dz of [-1.4, 1.4]) b.box('trim', kx + dx, 1.4, mid + dz, 0.08, 2.8, 0.08, steel)
  b.box('wall', kx, 2.9, mid, 3.4, 0.2, 3.4, '#2c3036')
  b.box('lit', kx, 2.62, mid + 1.72, 3.2, 0.36, 0.05, '#27353f')
  b.box('sign', kx, 2.62, mid - 1.72, 3.2, 0.36, 0.05, SIGNS[4])
  // an escalator up to the gallery opposite, drawn as stepped flights between glass sides
  const ex = hw + 14
  for (let i = 0; i < 13; i++) b.box('trim', ex + i * 0.75, 0.2 + i * 0.4, across - 2, 0.8, 0.4, 1.6, i % 2 ? '#4a4d52' : '#5a5e63')
  for (const dz of [-0.85, 0.85]) for (let i = 0; i < 13; i++) b.box('glass', ex + i * 0.75, 0.95 + i * 0.4, across - 2 + dz, 0.75, 0.9, 0.04, '#bfe0f2')
  b.box('wall', ex + 10.4, DECK / 2 - 0.1, across - 2, 1.6, DECK - 0.2, 1.8, '#c9c4b8')
  // a directory by the door, and one further along
  for (const x of [hw + 2.2, -(hw + 20)]) {
    b.box('wall', x, 1.05, front + 2.2, 0.9, 2.1, 0.22, '#2c3036')
    b.box('lit', x, 1.25, front + 2.33, 0.74, 1.4, 0.03, '#27353f')
  }

  // ---- what stands on the galleries. The one across the way lies under the view, so it is furnished like a street:
  // lamps along the balustrade, planters and benches down the middle, and tables outside the shops
  const walk = across + 4.7
  for (let x = -reach + 5, i = 0; x < reach - 3; x += 6, i++) {
    if (i % 3 === 0) planter(x, walk, i * 7 + 31, DECK)
    else if (i % 3 === 1) {
      bench(x, walk - 0.4, DECK)
      b.box('trim', x + 1.7, DECK + 0.42, walk - 0.4, 0.4, 0.84, 0.4, '#5a5e63')
    } else {
      table(x - 1.1, walk + 1.5, DECK, i)
      table(x + 1.1, walk + 2.9, DECK, i + 2)
      table(x - 1.3, walk + 3.4, DECK, i + 4)
    }
  }
  // (none opposite the unit: that is where the view usually stands, and a lamp there would be in its face)
  for (let x = -reach + 3.5; x < reach - 1; x += 9) if (Math.abs(x) > hw + 13) lamp(x, across + 1.6, DECK, 2.6)
  // a directory at the head of the escalator, and a rug of darker tile where it lands
  b.quad('floor3', ex + 9.4, across + 0.5, ex + 13.4, across + 4.2, DECK + 0.02, dim('#8c857a'))
  b.box('wall', ex + 13, DECK + 1.05, across + 3.6, 0.22, 2.1, 0.9, '#2c3036')
  b.box('lit', ex + 12.87, DECK + 1.25, across + 3.6, 0.03, 1.4, 0.74, '#27353f')
  // this side: lamps along the balustrade, a bench or a planter between them, clear of the well the unit stands in
  for (const sx of [-1, 1]) {
    for (let x = hw + 9.2, i = 0; x < reach - 2; x += 9, i++) {
      lamp(sx * x, front - 1.5, DECK, 2.6)
      if (i % 2) planter(sx * (x + 4.5), front - 3.2, i * 5 + (sx > 0 ? 3 : 17), DECK)
      else bench(sx * (x + 4.5), front - 2.6, DECK)
    }
  }
  // ---- the hall's own lamps: a pair hung from each truss over the concourse
  for (const x of cols) {
    for (const z of hung) {
      b.box('trim', x, top - 0.55, z, 0.04, 1.1, 0.04, frame)
      b.box('trim', x, top - 1.13, z, 1.5, 0.08, 0.5, frame)
      b.box('lit', x, top - 1.19, z, 1.36, 0.05, 0.38, '#27353f')
    }
  }
  // ---- the outside of the end walls and the back, which the view can turn to: piers, a plinth and a high strip of windows
  const zm = (back + end) / 2
  for (const sx of [-1, 1]) {
    const face = sx * (reach + 0.8)
    b.box('trim', face + sx * 0.05, 0.4, zm, 0.1, 0.8, end - back + 0.8, '#6b675f')
    b.box('trim', face - sx * 0.4, top + 0.08, zm, 1.05, 0.16, end - back + 1, steel)
    for (let z = back, i = 0; z < end; z += 8.3, i++) {
      b.box('wall', face + sx * 0.1, top / 2, z, 0.2, top, 0.7, '#d6d1c7')
      if (z + 8.3 <= end + 0.5) b.box('lit', face + sx * 0.03, top - 2.4, z + 4.15, 0.06, 1.2, 5.6, '#27353f')
    }
  }
  b.box('trim', 0, 0.4, back - 0.85, reach * 2 + 1.6, 0.8, 0.1, '#6b675f')
  b.box('trim', 0, top + 0.08, back - 0.4, reach * 2 + 1.8, 0.16, 1.05, steel)
  for (let x = -reach; x <= reach; x += 10.25) b.box('wall', x, top / 2, back - 0.9, 0.7, top, 0.2, '#d6d1c7')
}

interface Layout {
  meshes: THREE.Mesh[]
  trees: [number, number, number][]
  cars: { x: number; z: number; rot: number; seed: number }[]
}

function build(env: Env, w: number, h: number, mood: Mood): Layout {
  const b = new Batch()
  const M = moodOf(env, mood)
  const dimHex = (hex: string) => `#${new THREE.Color(hex).multiplyScalar(M.ground).getHexString()}`
  const lit = mood !== 'day'
  const trees: Layout['trees'] = []
  const cars: Layout['cars'] = []
  const hw = w / 2
  const hh = h / 2
  const far = Math.max(w, h) * 4 + 160
  /** How far south the view usually stands (see the camera's home in SiteView): tall buildings across the way keep behind it. */
  const stand = Math.max(w, h) * 1.2 + 10

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
      // on an industrial estate the cars stand at the kerb, leaving both lanes to the lorries (see yard.ts)
      const off = env === 'industrial' ? 3.6 : 2.2
      cars.push({ x, z: rz + (i % 2 ? off : -off), rot: i % 2 ? Math.PI / 2 : -Math.PI / 2, seed: i * 7 + w })
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
      block(b, i * 15, Math.max(hh + 2.5 + 16 + 8, stand + 7), 14, 14, 4 + Math.floor(hash(i + 20) * 4), ['#c9b9a3', '#d9d2c4', '#b9c0c6', '#a89684'][(i + 10) % 4], i + 40, lit)
      block(b, i * 15, -hh - 12, 14, 16, 3 + Math.floor(hash(i + 60) * 5), ['#b5a08a', '#c9c2b2'][(i + 10) % 2], i + 80, lit)
      trees.push([i * 15 + 7, hh + 2.5 + 10.5, 1.6])
    }
  } else if (env === 'plaza') {
    b.quad('floor6', -hw - 14, -hh - 14, hw + 14, hh + 2.5, -0.025, dimHex('#c4bfb3'))
    for (let i = -4; i <= 4; i++) {
      for (const [z, base] of [[Math.max(hh + 2.5 + 16 + 12, stand + 10), 8], [-hh - 34, 12]] as const) block(b, i * 24, z, 20, 20, base + Math.floor(hash(i + z) * 14), ['#bfc6cc', '#9fb0bd', '#d9d6cf', '#8fa3b3'][(i + 8) % 4], i * 3 + z, lit)
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) block(b, sx * (hw + 34), -hh + i * 26, 20, 20, 10 + Math.floor(hash(i + sx * 9) * 12), ['#bfc6cc', '#d9d6cf', '#9fb0bd'][i], i + 30 + sx, lit)
    for (let i = 0; i < 10; i++) for (const sx of [-1, 1]) trees.push([sx * (hw + 6 + (i % 2) * 5), -hh - 10 + i * ((h + 12) / 10), 1.8])
  } else if (env === 'mall') {
    mall(b, w, h, dimHex, mood)
  }

  const hall = INDOOR_GLOW[mood]
  // a shop sign in the mall is a painted band by day and lit from within once the lamps are on
  const sign = () => (hall.signs ? { material: signLit(hall.signs), cast: false } : surface('trim'))
  return { meshes: b.build((k) => (k === 'sign' ? sign() : surface(k, k === 'lit' ? (indoor ? hall.lit : Math.round(M.glow * 5) / 10) : 0))), trees, cars }
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
