// What the city is made of: the land, streets and filler blocks, the towers
// of rival companies, the port, the research park and the exchange, and the
// player's own sites standing on their plots. Everything static is merged
// into a handful of meshes; only what changes is rebuilt.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { ITEMS, gridAt } from '../../sim/sites'
import type { GameState, Site } from '../../sim/types'
import { Sign, Trees, hash } from '../site/kit'
import { Batch, Ground, STOREY, Structure, surface } from '../site/structure'
import { BOARD_SLOTS, type District, HOME, ISLAND, ISLAND_STREETS, LOTS, PIER, type Place, ROADS, towerFloors } from './plan'

const PAVE = '#a7a399'
const ROAD = '#33363a'
const LAWN = '#5d8a49'
const CONCRETE = '#8b8d8a'
const SEAWALL = '#6d6b64'
const STEEL = '#8a8f95'
const BLOCKS = ['#d9d6cf', '#bfc6cc', '#c9c2b2', '#e4e1da', '#9fb0bd', '#b5a08a']
const BOXES = ['#b5462f', '#2f5d8a', '#3f7d4d', '#c9a227', '#8a8f95', '#d9d6cf']
const SHOPS = ['#d9d6cf', '#c9b9a3', '#b9c0c6', '#a89684', '#e4dccb', '#9aa7a0', '#c4a58c']
/** Height of the ground the company's own plots are drawn on, clear of the paving under them. */
export const PLOT_Y = 0.22

/** A colour seen in a district the company has not entered: darker and greyer. */
function faded(hex: string, on: boolean): string {
  if (on) return hex
  const c = new THREE.Color(hex)
  const grey = (c.r + c.g + c.b) / 3
  c.setRGB((c.r * 0.35 + grey * 0.65) * 0.42, (c.g * 0.35 + grey * 0.65) * 0.42, (c.b * 0.35 + grey * 0.65) * 0.45)
  return `#${c.getHexString()}`
}

export interface CityMats {
  /** Windows that light up after dark. */
  lit: THREE.MeshStandardMaterial
  /** Screens and beacons: always bright. */
  neon: THREE.MeshBasicMaterial
  sea: THREE.MeshStandardMaterial
  of: (key: string) => { material: THREE.Material; cast?: boolean }
  dispose: () => void
}

export function cityMats(): CityMats {
  const lit = new THREE.MeshStandardMaterial({ color: '#27353f', roughness: 0.15, metalness: 0.6, emissive: '#ffb866', emissiveIntensity: 0 })
  const neon = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  const sea = new THREE.MeshStandardMaterial({ color: '#2a6781', roughness: 0.16, metalness: 0.45, envMapIntensity: 1.4 })
  return {
    lit,
    neon,
    sea,
    of: (key) => (key === 'lit' ? { material: lit } : key === 'neon' ? { material: neon, cast: false } : key === 'sea' ? { material: sea, cast: false } : surface(key)),
    dispose: () => [lit, neon, sea].forEach((m) => m.dispose()),
  }
}

/** An office tower with ribbon windows, some of them lit at night. */
function tower(b: Batch, x: number, z: number, w: number, d: number, floors: number, color: string, seed: number, on: boolean, y = 0) {
  const h = floors * 3.2
  b.box('wall', x, y + h / 2, z, w, h, d, faded(color, on), 0.92 + hash(seed) * 0.14)
  for (let f = 0; f < floors; f++) b.box(on && hash(seed + f * 7) > 0.4 ? 'lit' : 'pane', x, y + f * 3.2 + 1.9, z, w + 0.08, 1.5, d + 0.08, '#27353f')
  b.box('trim', x, y + h + 0.25, z, w + 0.3, 0.5, d + 0.3, faded('#3a3d42', on))
  if (floors > 4) b.box('trim', x + w * 0.2, y + h + 1.1, z - d * 0.15, w * 0.25, 1.2, d * 0.3, faded(STEEL, on))
}

/** A small shop with a lit front, facing south. */
function shop(b: Batch, x: number, z: number, seed: number, on: boolean) {
  const w = 15 + Math.floor(hash(seed) * 3) * 2
  const h = 5 + Math.floor(hash(seed + 1) * 2) * 3
  b.box('wall', x, h / 2, z, w, h, 14, faded(SHOPS[seed % SHOPS.length], on), 0.94 + hash(seed + 2) * 0.1)
  b.box(on ? 'lit' : 'pane', x, 1.7, z + 7.05, w - 2, 2.6, 0.1, '#27353f')
  b.box('trim', x, 3.6, z + 7.2, w - 1, 0.7, 0.5, faded(['#c9553d', '#2f5d8a', '#3f7d4d', '#2c3036', '#d6a24f'][seed % 5], on))
  if (h > 6) b.box(on && hash(seed + 4) > 0.4 ? 'lit' : 'pane', x, 6.2, z + 7.05, w - 3, 1.4, 0.1, '#27353f')
  b.box('wall', x, h + 0.15, z, w + 0.3, 0.3, 14.3, faded(['#5a5e63', '#7a5a48', '#4a5560', '#8a8377'][seed % 4], on))
}

function streetLamp(b: Batch, x: number, z: number, on: boolean) {
  b.box('trim', x, 3.2, z, 0.18, 6.4, 0.18, faded('#2f3338', on))
  b.box(on ? 'lit' : 'pane', x, 6.5, z, 0.9, 0.16, 0.5, '#27353f')
}

/** Dashes down the middle of a street. */
function dashes(b: Batch, r: { x0: number; z0: number; x1: number; z1: number }, on: boolean) {
  const alongX = r.x1 - r.x0 > r.z1 - r.z0
  const mid = alongX ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2
  for (let v = (alongX ? r.x0 : r.z0) + 3; v < (alongX ? r.x1 : r.z1) - 3; v += 9) {
    if (alongX) b.quad('floor8', v, mid - 0.14, v + 4, mid + 0.14, 0.13, faded('#d9d6cc', on))
    else b.quad('floor8', mid - 0.14, v, mid + 0.14, v + 4, 0.13, faded('#d9d6cc', on))
  }
}

/** A flat-topped mass of land rising out of the water. */
function land(b: Batch, x: number, z: number, w: number, d: number, on: boolean) {
  b.box('wall', x, -1.15, z, w + 5, 2.1, d + 5, faded(SEAWALL, on))
  b.box('floor8', x, -0.5, z, w, 1, d, faded(PAVE, on))
}

/** The fixed part of the city: land, streets, filler buildings, piers. `taken` lists plots something real stands on. */
export function buildBase(all: District[], taken: Set<string>, mats: CityMats): { meshes: THREE.Mesh[]; trees: [number, number, number][] } {
  const b = new Batch()
  const trees: [number, number, number][] = []
  const free = (x: number, z: number) => !taken.has(`${x},${z}`)
  b.box('sea', 0, -1.6, -80, 6000, 0.2, 6000, '#2a6781')

  for (const d of all) {
    const on = d.open
    if (d.home) {
      const cx = (HOME.x0 + HOME.x1) / 2
      const cz = (HOME.z0 + HOME.z1) / 2
      land(b, cx, cz, HOME.x1 - HOME.x0, HOME.z1 - HOME.z0, true)
      for (const r of ROADS) {
        b.quad('floor9', r.x0, r.z0, r.x1, r.z1, 0.1, ROAD)
        dashes(b, r, true)
      }
      // parks under the campus, the venue and the research park; hard standing under the factory and the port
      for (const [lot, color] of [[LOTS.office, LAWN], [LOTS.venue, LAWN], [LOTS.research, '#668f4f'], [LOTS.factory, CONCRETE], [LOTS.port, '#7f8280']] as const) {
        b.quad(color === LAWN || color === '#668f4f' ? 'floor10' : 'floor8', lot.x - lot.w / 2, lot.z - lot.d / 2, lot.x + lot.w / 2, lot.z + lot.d / 2, 0.1, color)
      }
      for (const [x, z] of d.towers) if (free(x, z)) tower(b, x, z, 19 + hash(x) * 4, 18, 4 + Math.floor(hash(x * 3 + 1) * 7), BLOCKS[Math.abs(Math.round(x)) % BLOCKS.length], Math.round(x + 400), true)
      d.shops.forEach(([x, z], i) => free(x, z) && shop(b, x, z + 1, i * 5 + 3, true))
      // lamps and trees down the avenue and the high street, trees through the parks
      for (let x = HOME.x0 + 9; x < HOME.x1 - 5; x += 22) {
        if (ROADS.some((r) => r.x1 - r.x0 < 20 && x > r.x0 - 4 && x < r.x1 + 15)) continue
        streetLamp(b, x, 7.9, true)
        streetLamp(b, x + 11, 63.2, true)
        if (!BOARD_SLOTS.some(([bx]) => Math.abs(bx - x - 5) < 9)) trees.push([x + 5, 6.6, 2.2 + hash(x) * 0.8])
        trees.push([x + 7, 21.6, 2 + hash(x + 5) * 0.8])
      }
      const scatter = (lot: { x: number; z: number; w: number; d: number }, n: number, keep: (dx: number, dz: number) => boolean, seed: number) => {
        for (let i = 0; i < n; i++) {
          const dx = (hash(seed + i * 3) - 0.5) * (lot.w - 8)
          const dz = (hash(seed + i * 3 + 1) - 0.5) * (lot.d - 8)
          if (keep(dx, dz)) trees.push([lot.x + dx, lot.z + dz, 2.4 + hash(seed + i * 3 + 2) * 1.6])
        }
      }
      // each park keeps clear of the largest plot its site can grow to, so nothing has to move when it does
      scatter(LOTS.office, 80, (dx, dz) => Math.abs(dx) > 41 || Math.abs(dz) > 33, 11)
      scatter(LOTS.venue, 36, (dx, dz) => Math.abs(dx) > 30 || Math.abs(dz) > 24, 501)
      scatter(LOTS.research, 44, (dx, dz) => !LAB_BLOCKS.some(([bx, bz, bw, bd]) => Math.abs(dx - bx) < bw / 2 + 4 && Math.abs(dz - bz) < bd / 2 + 4), 901)
      // the works around the factory plot: silos, a boiler house and its stack, a yard of trailers
      const f = LOTS.factory
      for (const [sx, sz] of [[-64, -15], [-54, -15], [-64, -4]]) {
        b.box('wall', f.x + sx, 6.5, f.z + sz, 7, 13, 7, '#c5c9cc', 0.94 + hash(sx + sz) * 0.08)
        b.box('trim', f.x + sx, 13.3, f.z + sz, 7.4, 0.6, 7.4, '#6f747a')
      }
      b.box('wall', f.x - 58, 3.5, f.z + 15, 22, 7, 14, '#9ea4aa')
      b.box('trim', f.x - 58, 7.2, f.z + 15, 22.6, 0.4, 14.6, '#5a5e63')
      b.box('trim', f.x - 62, 2, f.z + 22.1, 6, 4, 0.2, '#7d8388')
      b.box('wall', f.x - 70, 14, f.z + 18, 2.6, 28, 2.6, '#b9b4a8')
      b.box('wall', f.x - 70, 26, f.z + 18, 2.9, 2, 2.9, '#b5462f')
      b.box('wall', f.x + 44, 1.8, f.z - 22, 6, 3.6, 5, '#d9d6cf')
      b.box('trim', f.x + 44, 3.75, f.z - 22, 7, 0.3, 6, '#3a3d42')
      for (let i = 0; i < 6; i++) {
        b.box('wall', f.x + 44 + i * 4.3, 2.2, f.z + 12, 2.6, 3, 9, i % 3 === 1 ? '#c9ccd1' : '#e9e6e0', 0.92 + hash(i) * 0.1)
        b.box('trim', f.x + 44 + i * 4.3, 0.5, f.z + 12, 2.4, 0.6, 9.4, '#17191c')
      }
      // the pier ships leave from
      b.box('wall', PIER.x, -0.55, (PIER.z0 + PIER.z1) / 2, 14, 1.1, PIER.z1 - PIER.z0 + 8, '#77756e')
      for (let z = PIER.z0 + 6; z < PIER.z1; z += 11) b.box('trim', PIER.x - 6.2, 0.5, z, 0.7, 1, 0.7, '#2f3338')
      continue
    }
    // ---- an island district
    land(b, d.x, d.z, ISLAND.w, ISLAND.d, on)
    for (const [sz, sw] of ISLAND_STREETS) {
      const r = { x0: d.x - ISLAND.w / 2, z0: d.z + sz - sw / 2, x1: d.x + ISLAND.w / 2, z1: d.z + sz + sw / 2 }
      b.quad('floor9', r.x0, r.z0, r.x1, r.z1, 0.1, faded(ROAD, on))
      dashes(b, r, on)
    }
    for (const [x, z] of d.towers) if (free(x, z)) tower(b, x, z, 19 + hash(x + z) * 4, 18, 3 + Math.floor(hash(x * 3 + z) * 7), BLOCKS[Math.abs(Math.round(x + z)) % BLOCKS.length], Math.round(x * 7 + z), on)
    d.shops.forEach(([x, z], i) => free(x, z) && shop(b, x, z + 1, i * 7 + Math.round(d.x), on))
    for (let x = d.x - ISLAND.w / 2 + 9; x < d.x + ISLAND.w / 2 - 4; x += 20) {
      streetLamp(b, x, d.z + ISLAND_STREETS[0][0] + 4.2, on)
      streetLamp(b, x + 10, d.z + ISLAND_STREETS[1][0] + 4.2, on)
      if (on) trees.push([x + 9, d.z + ISLAND_STREETS[0][0] - 4.4, 2.1 + hash(x) * 0.8], [x + 4, d.z + ISLAND.d / 2 - 4, 2 + hash(x + 9)])
    }
    // its pier, pointing home
    const dx = d.dock[0] - d.x
    const dz = d.dock[1] - d.z
    if (Math.abs(dx) > Math.abs(dz)) b.box('wall', d.dock[0] + Math.sign(dx) * 19, -0.55, d.dock[1], 42, 1.1, 11, faded('#77756e', on))
    else b.box('wall', d.dock[0], -0.55, d.dock[1] + 19, 11, 1.1, 42, faded('#77756e', on))
  }
  return { meshes: b.build(mats.of), trees }
}

/** The research park's buildings, as offsets from the middle of its plot: [x, z, width, depth, floors]. */
const LAB_BLOCKS: [number, number, number, number, number][] = [
  [0, -30, 58, 16, 3],
  [-34, 8, 18, 38, 2],
  [6, 30, 28, 14, 2],
  [28, 2, 22, 22, 0],
]

/** Buildings that are always there: the research park and the stock exchange. */
export function buildCivic(g: GameState, mats: CityMats): THREE.Mesh[] {
  const b = new Batch()
  // ---- research park: a long lab, wings that fill in as more is researched, a test pad and a radio mast
  const r = LOTS.research
  const busy = Math.min(3, 1 + Math.floor((g.activeResearch.length + 1) / 2))
  LAB_BLOCKS.forEach(([x, z, w, d, floors], i) => {
    if (!floors) {
      b.box('wall', r.x + x, 0.7, r.z + z, w, 1.4, d, '#c9ced3')
      b.box('trim', r.x + x, 1.45, r.z + z, w - 6, 0.1, d - 6, '#e0a23a')
    } else if (i < busy) tower(b, r.x + x, r.z + z, w, d, floors + (i === 1 && busy > 2 ? 1 : 0), ['#e4e7ea', '#d6dbe0', '#dfe3e6'][i], 71 + i, true)
  })
  const mx = r.x + 42
  const mz = r.z - 40
  b.box('trim', mx, 17, mz, 0.6, 34, 0.6, STEEL)
  b.box('trim', mx, 27, mz, 4, 0.3, 0.3, STEEL)
  b.box('trim', mx, 22, mz, 3, 0.3, 0.3, STEEL)
  b.box('neon', mx, 34.3, mz, 0.5, 0.5, 0.5, '#ff3b30')
  // ---- stock exchange: a hall on a podium behind a row of columns, with a ticker over the door
  const e = LOTS.exchange
  const stone = '#d8d2c4'
  b.box('wall', e.x, 0.9, e.z, 44, 1.8, 28, '#bdb7a9')
  b.box('wall', e.x, 0.45, e.z + 15, 30, 0.9, 3, '#bdb7a9')
  b.box('wall', e.x, 7.3, e.z - 2, 36, 11, 20, stone)
  for (let i = 0; i < 7; i++) b.box('wall', e.x - 15 + i * 5, 6.5, e.z + 10.5, 1.5, 9.4, 1.5, stone, 0.96 + (i % 2) * 0.05)
  b.box('wall', e.x, 11.7, e.z + 3.5, 38, 1, 17, stone, 0.92)
  for (let i = 0; i < 4; i++) b.box('wall', e.x, 12.6 + i * 0.7, e.z + 3.5, 36 - i * 8, 0.7, 16, stone, 0.98 - i * 0.02)
  const hist = g.stock.history
  const up = g.stock.price >= (hist[hist.length - 1] ?? g.stock.price)
  if (g.stock.listed) {
    b.box('neon', e.x, 3.9, e.z + 8.1, 28, 1.2, 0.2, '#0c1410')
    for (let i = 0; i < 14; i++) b.box('neon', e.x - 13 + i * 2, 3.9, e.z + 8.25, 0.9 + hash(i + hist.length) * 0.8, 0.45, 0.1, hash(i * 3 + hist.length) > (up ? 0.3 : 0.7) ? '#3fe08a' : '#ff5a4f')
  } else b.box('pane', e.x, 3.9, e.z + 8.1, 28, 1.2, 0.2, '#27353f')
  return b.build(mats.of)
}

/** Where the company's name goes on its warehouse. */
export const SHED = { x: LOTS.port.x - 66, z: LOTS.port.z - 4, w: 60, d: 24, h: 12 }

/** The port: a warehouse, cranes, and as many containers on the quay as there are devices in stock. */
export function buildPort(stock: number, orders: number, color: string, mats: CityMats): THREE.Mesh[] {
  const b = new Batch()
  const p = LOTS.port
  b.box('wall', SHED.x, SHED.h / 2, SHED.z, SHED.w, SHED.h, SHED.d, '#b9bdc2')
  b.box('trim', SHED.x, SHED.h + 0.3, SHED.z, SHED.w + 1, 0.6, SHED.d + 1, '#5a5e63')
  b.box('wall', SHED.x, 9, SHED.z + SHED.d / 2 + 0.2, SHED.w, 1.6, 0.3, color)
  for (let i = 0; i < 4; i++) b.box('trim', SHED.x - 21 + i * 14, 3, SHED.z + SHED.d / 2 + 0.2, 8, 6, 0.2, '#7d8388')
  // containers: the fuller the warehouse, the higher the stacks
  const count = containers(stock)
  let placed = 0
  for (let row = 0; row < 4 && placed < count; row++) {
    for (let col = 0; col < 10 && placed < count; col++) {
      const stack = Math.min(count - placed, 1 + Math.floor(hash(row * 17 + col * 5) * 3))
      for (let k = 0; k < stack; k++) {
        b.box('wall', p.x - 20 + col * 6.6, 1.4 + k * 2.65, p.z - 18 + row * 9.5, 6.1, 2.6, 2.5, BOXES[(row * 3 + col + k) % BOXES.length], 0.88 + hash(row + col * 3 + k * 7) * 0.2)
        placed++
      }
    }
  }
  // two gantry cranes on the quay
  for (const x of [p.x + 66, p.x + 92]) {
    for (const sx of [-6, 6]) for (const sz of [-5, 5]) b.box('trim', x + sx, 12, p.z + 19 + sz, 0.9, 24, 0.9, '#c9a227')
    b.box('trim', x, 24.5, p.z + 19, 14, 1.3, 12, '#c9a227')
    b.box('trim', x, 26, p.z + 30, 2, 1.5, 50, '#c9a227')
    b.box('trim', x, 21.5, p.z + 40, 2.8, 4.6, 2.8, '#2f3338')
  }
  // a ship alongside while orders are on their way in
  if (orders > 0) {
    const sx = PIER.x - 12.5
    const sz = (PIER.z0 + PIER.z1) / 2 + 4
    b.box('wall', sx, 0.6, sz, 10, 4.4, 40, '#27313d')
    b.box('wall', sx, 3.2, sz, 9.4, 0.8, 39, '#8c2f28')
    for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) b.box('wall', sx, 5 + k * 2.65, sz - 13 + i * 6.6, 6.1, 2.6, 6.1, BOXES[(i + k * 2) % BOXES.length], 0.9)
    b.box('wall', sx, 7.5, sz + 15.5, 8, 8, 5, '#e4e7ea')
  }
  return b.build(mats.of)
}
/** How many containers stand on the quay for a given stock of devices. */
export const containers = (stock: number) => Math.min(110, Math.ceil(10 * Math.log2(1 + stock / 400)))

/** Rival headquarters, and the hoardings round whatever is being built. */
export function buildTowers(list: Place[], mats: CityMats): THREE.Mesh[] {
  const b = new Batch()
  for (const p of list) {
    if (p.kind === 'rival' && p.company) {
      const on = !p.dim
      const floors = towerFloors(p.company)
      const seed = p.company.name.length * 13 + Math.round(p.x)
      // a podium, the tower, and a crown in the company's colour
      b.box('wall', p.x, 1.6, p.z, 22, 3.2, 20, faded('#cfd3d6', on))
      b.box(on ? 'lit' : 'pane', p.x, 1.7, p.z + 10.05, 17, 2.2, 0.1, '#27353f')
      tower(b, p.x, p.z - 1, 16, 14, floors, ['#dfe3e6', '#c5ccd3', '#e9e6e0', '#b9c2cb'][seed % 4], seed, on, 3.2)
      const top = 3.2 + floors * 3.2
      // a dark band for the name to stand out on
      if (on) b.box('wall', p.x, top - 2.2, p.z + 6.02, 15, 3.6, 0.1, '#16181b')
      b.box(on ? 'neon' : 'wall', p.x, top + 1.6, p.z - 1, 16.4, 1.2, 14.4, faded(p.company.color, on))
    } else if (p.kind === 'board') {
      b.box('trim', p.x - 4, 3.5, p.z - 0.4, 0.5, 7, 0.5, '#2f3338')
      b.box('trim', p.x + 4, 3.5, p.z - 0.4, 0.5, 7, 0.5, '#2f3338')
      b.box('wall', p.x, 9.5, p.z - 0.3, 12, 5.6, 0.5, '#16181b')
      b.box('neon', p.x, 6.9, p.z, 12, 0.25, 0.2, '#ffffff')
    } else if (p.kind === 'region') {
      // a board on the quay: the district's name, or the way in to a market not yet entered
      const w = p.dim ? 17 : 46
      const y = p.dim ? 13.2 : 9
      for (const sx of [-w / 2 + 1.5, w / 2 - 1.5]) b.box('trim', p.x + sx, y / 2, p.z + ISLAND.d / 2 - 2.3, 0.8, y, 0.8, '#2f3338')
      b.box('wall', p.x, y, p.z + ISLAND.d / 2 - 2, w, p.dim ? 3.8 : 7, 0.8, '#16181b')
      if (p.dim) b.box('neon', p.x, y - 2.1, p.z + ISLAND.d / 2 - 1.9, w, 0.25, 0.8, '#ffffff')
    } else if ((p.kind === 'factory' || p.kind === 'venue') && !p.site) {
      // an empty plot behind a fence, waiting to be bought
      const w = p.w - 8
      const d = p.d - 8
      for (const [fx, fz, fw, fd] of [[0, -d / 2, w, 0.2], [0, d / 2, w, 0.2], [-w / 2, 0, 0.2, d], [w / 2, 0, 0.2, d]]) b.box('trim', p.x + fx, 1.1, p.z + fz, fw, 2.2, fd, '#6f747a')
      b.box('floor10', p.x, 0.16, p.z, w, 0.1, d, '#7c7a6c')
      b.box('wall', p.x, 4.4, p.z + d / 2 + 0.4, 13, 3.6, 0.5, '#16181b')
      for (const sx of [-5, 5]) b.box('trim', p.x + sx, 1.5, p.z + d / 2 + 0.3, 0.4, 3, 0.4, '#2f3338')
    }
    if (p.building !== undefined && p.site) scaffold(b, p.x, p.z, p.site.w * (p.scale ?? 1), p.site.h * (p.scale ?? 1), Math.max(7, p.site.floors * STOREY + 2) * (p.scale ?? 1), p.id.length)
  }
  return b.build(mats.of)
}

/** Scaffolding round a plot and a tower crane over it. */
function scaffold(b: Batch, x: number, z: number, w: number, d: number, h: number, seed: number) {
  const pole = '#c9ccd1'
  const hw = w / 2 + 1.2
  const hd = d / 2 + 1.2
  const side = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(2, Math.round(len / 3.2))
    for (let i = 0; i <= n; i++) b.box('trim', x + ax + ((bx - ax) * i) / n, h / 2, z + az + ((bz - az) * i) / n, 0.14, h, 0.14, pole)
    for (let y = 2.2; y < h; y += 2.2) {
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az)
      b.box('wall', x + (ax + bx) / 2, y, z + (az + bz) / 2, alongX ? len : 1, 0.1, alongX ? 1 : len, '#a67c52', 0.9)
      b.box('trim', x + (ax + bx) / 2, y + 1, z + (az + bz) / 2, alongX ? len : 0.08, 0.08, alongX ? 0.08 : len, pole)
    }
  }
  side(-hw, hd, hw, hd)
  side(-hw, -hd, hw, -hd)
  side(-hw, -hd, -hw, hd)
  side(hw, -hd, hw, hd)
  // green netting over part of the front
  b.box('wall', x - hw / 2, h * 0.55, z + hd + 0.1, hw * 0.8, h * 0.7, 0.06, '#3f7d4d', 0.8)
  // tower crane
  const cx = x + hw + 4
  const cz = z - hd - 3
  const ch = h + 16 + (seed % 3) * 3
  b.box('trim', cx, ch / 2, cz, 1.1, ch, 1.1, '#e0a23a')
  b.box('trim', cx - 9, ch + 0.6, cz, 34, 0.9, 0.9, '#e0a23a')
  b.box('wall', cx + 6, ch - 0.6, cz, 3, 2.4, 2, '#5a5e63')
  b.box('trim', cx - 18, ch - 4, cz, 0.12, 8, 0.12, '#2f3338')
  b.box('wall', cx, 0.6, cz, 4, 1.2, 4, '#8b8d8a')
}

function useBatch(make: () => THREE.Mesh[], deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const meshes = useMemo(make, deps)
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes])
  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  )
}

/** How things standing out of doors on a site are drawn from far off: [height, colour, how far in from the tile edge]. */
const OUTDOORS: Record<string, [number, string, number?]> = {
  stage: [1.2, '#2c3036'],
  screen: [7, '#16181b', 0.05],
  lights: [8, '#3a3d42', 0.36],
  speakers: [3.2, '#1f2226', 0.15],
  camera: [1.6, '#3a3d42', 0.3],
  seats: [0.9, '#3d4c66', 0.05],
  seats_mid: [1.6, '#3d4c66', 0.05],
  seats_high: [2.4, '#3d4c66', 0.05],
  demo: [1, '#d9d6cf', 0.1],
  fountain: [0.5, '#b9b4a8', 0.1],
  sign: [1.6, '#8c8e90', 0.1],
  planter: [0.5, '#6c9a55', 0.08],
  gbench: [0.5, '#94704c', 0.15],
  bench: [0.5, '#94704c', 0.15],
  hedge: [1, '#3f7d4d', 0.05],
  sculpture: [2.6, '#c9ccd1', 0.25],
  lamp: [4, '#2f3338', 0.45],
  flag: [7, '#c9ccd1', 0.46],
  bikes: [0.9, '#8a8f95', 0.1],
  parking: [0.04, '#3d4045'],
  tank: [5, '#b9bdc2', 0.12],
  truck: [0.04, '#3d4045'],
  pallets: [1.2, '#a67c52', 0.12],
  forklift: [2, '#e0a23a', 0.2],
}

/** What stands in the open on a site, drawn simply: stages and seating, fountains, parked lorries, trees. */
function buildOutdoors(site: Site): { meshes: THREE.Mesh[]; trees: [number, number, number][] } {
  const b = new Batch()
  const trees: [number, number, number][] = []
  for (const it of site.items) {
    const def = ITEMS[site.kind][it.kind]
    if (!def || gridAt(site, it.x, it.y)) continue
    const turned = it.rot % 2 === 1
    const w = turned ? def.h : def.w
    const d = turned ? def.w : def.h
    const x = it.x + w / 2 - site.w / 2
    const z = it.y + d / 2 - site.h / 2
    if (it.kind === 'otree' || it.kind === 'tree') {
      trees.push([x, z, 2.2 + hash(it.x * 7 + it.y) * 1.2])
      continue
    }
    const hint = OUTDOORS[it.kind]
    if (!hint) continue
    const [h, color, inset = 0] = hint
    b.box('wall', x, h / 2 + 0.01, z, w - inset * 2, h, d - inset * 2, color)
    if (it.kind === 'screen') b.box('lit', x, 4, z, w - 0.4, 5, d + 0.02, '#27353f')
    if (it.kind === 'fountain') b.box('floor1', x, 0.56, z, w - 0.8, 0.02, d - 0.8, '#3f7f9c')
    if (it.kind === 'parking') b.box('trim', x, 0.8, z, turned ? 4.2 : 1.8, 1.3, turned ? 1.8 : 4.2, ['#d8dadd', '#1d2023', '#7a1f24', '#2c4a6e'][(it.x + it.y) % 4])
    if (it.kind === 'truck') {
      b.box('wall', x - (turned ? 0.8 : 0), 2.2, z - (turned ? 0 : 0.8), turned ? 5.6 : 2.5, 3, turned ? 2.5 : 5.6, '#e9e6e0')
      b.box('trim', x + (turned ? 3 : 0), 1.6, z + (turned ? 0 : 3), turned ? 1.8 : 2.4, 2.4, turned ? 2.4 : 1.8, '#2c4a6e')
    }
    if (it.kind === 'flag') b.box('wall', x + 0.5, 6.2, z, 1, 0.7, 0.04, '#c9553d')
  }
  return { meshes: b.build((k) => surface(k)), trees }
}

/**
 * One of the company's own sites on its plot: its real footprint, cladding and height, and what stands in its grounds.
 * `scale` draws it smaller than life, for a store that shares its plot with others.
 */
export function SiteModel({ site, x, z, lights, scale = 1 }: { site: Site; x: number; z: number; lights: boolean; scale?: number }) {
  const kerb = useBatch(() => {
    const b = new Batch()
    const w = site.w
    const d = site.h
    for (const [fx, fz, fw, fd] of [[0, -d / 2 - 0.3, w + 1.2, 0.6], [0, d / 2 + 0.3, w + 1.2, 0.6], [-w / 2 - 0.3, 0, 0.6, d], [w / 2 + 0.3, 0, 0.6, d]]) b.box('wall', fx, -0.05, fz, fw, 0.34, fd, '#b9b4a8')
    b.box('floor10', 0, -0.07, 0, w, 0.1, d, LAWN)
    return b.build((k) => surface(k))
  }, [site.w, site.h])
  const outdoors = useMemo(() => buildOutdoors(site), [site, site.rev]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => outdoors.meshes.forEach((m) => m.geometry.dispose()), [outdoors])
  return (
    <group position={[x, PLOT_Y, z]} scale={scale}>
      {kerb}
      <Ground site={site} dim={1} />
      <Structure site={site} mode="full" glow={lights ? 0.6 : 0} />
      {outdoors.meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
      {outdoors.trees.length > 0 && <Trees at={outdoors.trees} />}
    </group>
  )
}

/** Everything standing in the city, apart from the company's own sites and what moves. */
export function CityModel({ g, all, list, mats, lights, color, accent }: { g: GameState; all: District[]; list: Place[]; mats: CityMats; lights: boolean; color: string; accent: string }) {
  const taken = useMemo(() => new Set(list.filter((p) => p.kind === 'store' || p.kind === 'rival').map((p) => p.lot ?? `${p.x},${p.z}`)), [list])
  const takenKey = [...taken].join('|')
  const openKey = all.map((d) => (d.open ? 1 : 0)).join('')
  const base = useMemo(() => buildBase(all, taken, mats), [takenKey, openKey, mats]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => base.meshes.forEach((m) => m.geometry.dispose()), [base])
  const civic = useBatch(() => buildCivic(g, mats), [g.activeResearch.length, g.stock.listed, g.stock.history.length, mats])
  const stock = g.products.filter((p) => p.companyId === 'player' && p.status === 'sale').reduce((a, p) => a + p.stock, 0)
  const port = useBatch(() => buildPort(stock, g.orders.length, color, mats), [containers(stock), g.orders.length > 0, color, mats])
  const towersKey = list.map((p) => `${p.id}:${p.dim ? 0 : 1}:${p.building !== undefined ? 1 : 0}:${p.site ? `${p.site.w}.${p.site.floors}.${p.x}.${p.z}.${p.scale ?? 1}` : ''}:${p.company ? towerFloors(p.company) + p.company.color : ''}`).join('|')
  const towers = useBatch(() => buildTowers(list, mats), [towersKey, mats])
  const me = g.companies[0]
  return (
    <>
      {base.meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
      <Trees at={base.trees} />
      {civic}
      {port}
      {towers}
      {/* names on the buildings: rivals on their towers, yours on the warehouse, the regions on their quays */}
      {list.map((p) => {
        if (p.kind === 'rival' && p.company && !p.dim) return <Sign key={p.id} p={[p.x, 3.2 + towerFloors(p.company) * 3.2 - 2.2, p.z + 6.1]} size={[14, 3.4]} name={p.company.name} glow={lights ? 1.1 : 0.5} />
        if (p.kind === 'board') return <Sign key={p.id} p={[p.x, 9.5, p.z + 0.02]} size={[11, 4.6]} name={p.campaign?.target === 'brand' ? me.name : p.name.replace(/ campaign$/, '')} logo={p.campaign?.target === 'brand' ? me.logo : undefined} glow={lights ? 1.3 : 0.7} />
        if (p.kind === 'region') return <Sign key={p.id} p={[p.x, p.dim ? 13.2 : 9, p.z + ISLAND.d / 2 - 1.55]} size={p.dim ? [14, 3] : [42, 6]} name={p.dim ? (p.locked ?? 'Enter') : p.name} color={p.dim ? accent : '#f2f0ea'} glow={p.dim ? 1.4 : lights ? 0.9 : 0.5} />
        if ((p.kind === 'factory' || p.kind === 'venue') && !p.site) return <Sign key={p.id} p={[p.x, 4.4, p.z + (p.d - 8) / 2 + 0.7]} size={[12, 3]} name={p.locked ?? 'Land for sale'} glow={0.6} />
        return null
      })}
      <Sign p={[SHED.x, 9, SHED.z + SHED.d / 2 + 0.45]} size={[30, 3]} name={me.name} glow={lights ? 1 : 0.5} />
    </>
  )
}

