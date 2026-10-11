// Screens that say what a room is busy with: the project a lab is on, the
// campaigns a marketing suite is running, how hard the support lines are
// ringing. Also the small lights that go with them, and the lobby showcase.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { ITEMS, itemAt, wallAt } from '../../sim/sites'
import type { Product, Site, SiteItem } from '../../sim/types'
import { rnd } from './crowd'
import { B, Baked, DARK } from './kit'
import { DeviceProp } from './props'
import { CUT_H, WALL_T } from './structure'
import { useTick } from './tick'

export type Tone = 'accent' | 'pos' | 'warn' | 'neg' | 'dim'

/** What a screen shows. */
export interface BoardText {
  title: string
  line: string
  sub?: string
  /** 0-1, drawn as a bar. */
  bar?: number
  tone?: Tone
  /** Extra lines under the main one, for lists. */
  rows?: string[]
}

export interface Palette {
  accent: string
  pos: string
  warn: string
  neg: string
}

const FONT = '"Cascadia Mono", "JetBrains Mono", Consolas, monospace'

function fitText(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text
  let t = text
  while (t.length > 3 && g.measureText(t + '..').width > max) t = t.slice(0, -1)
  return t + '..'
}

/** Paints a screen: a hard-edged panel, the heading, what is happening and how far along it is. */
function draw(canvas: HTMLCanvasElement, c: BoardText, pal: Palette) {
  const g = canvas.getContext('2d')!
  const W = canvas.width
  const H = canvas.height
  const tone = c.tone === 'pos' ? pal.pos : c.tone === 'warn' ? pal.warn : c.tone === 'neg' ? pal.neg : c.tone === 'dim' ? '#7d858f' : pal.accent
  g.fillStyle = '#080a0d'
  g.fillRect(0, 0, W, H)
  g.fillStyle = tone
  g.fillRect(0, 0, W, 6)
  g.fillRect(0, 0, 6, H)
  const pad = 26
  const u = H / 176
  g.textBaseline = 'alphabetic'
  g.font = `600 ${Math.round(24 * u)}px ${FONT}`
  g.fillStyle = tone
  g.fillText(fitText(g, c.title.toUpperCase(), W - pad * 2), pad, 40 * u)
  g.font = `600 ${Math.round(40 * u)}px ${FONT}`
  g.fillStyle = '#f1ece6'
  g.fillText(fitText(g, c.line, W - pad * 2), pad, 90 * u)
  let y = 90 * u
  if (c.rows) {
    g.font = `${Math.round(22 * u)}px ${FONT}`
    g.fillStyle = '#c3bbb1'
    for (const row of c.rows) {
      y += 30 * u
      if (y > H - 14) break
      g.fillText(fitText(g, row, W - pad * 2), pad, y)
    }
  }
  if (c.bar !== undefined) {
    const by = H - 46 * u
    g.fillStyle = '#23272d'
    g.fillRect(pad, by, W - pad * 2, 20 * u)
    g.fillStyle = tone
    g.fillRect(pad, by, (W - pad * 2) * Math.min(1, Math.max(0, c.bar)), 20 * u)
  }
  if (c.sub) {
    g.font = `${Math.round(21 * u)}px ${FONT}`
    g.fillStyle = '#a39a91'
    g.fillText(fitText(g, c.sub, W - pad * 2), pad, c.bar !== undefined ? H - 58 * u : Math.min(H - 16, y + 34 * u))
  }
}

const keyOf = (c: BoardText) => `${c.title}|${c.line}|${c.sub ?? ''}|${c.bar === undefined ? '' : Math.round(c.bar * 50)}|${c.tone ?? ''}|${c.rows?.join('/') ?? ''}`

/** A glowing panel that redraws only when what it says changes. `text` may depend on the hour. */
export function Face({ p, rotY, size, text, palette, glow }: { p: [number, number, number]; rotY: number; size: [number, number]; text: BoardText | (() => BoardText); palette: Palette; glow: number }) {
  const made = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = Math.round((512 * size[1]) / size[0])
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
    return { canvas, tex, material, shown: '' }
  }, [size[0], size[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      made.tex.dispose()
      made.material.dispose()
    },
    [made],
  )
  const since = useRef(1)
  const refresh = () => {
    const c = typeof text === 'function' ? text() : text
    const key = keyOf(c) + palette.accent
    if (key === made.shown) return
    made.shown = key
    draw(made.canvas, c, palette)
    made.tex.needsUpdate = true
  }
  useEffect(refresh)
  // screens that follow the clock look again once a second
  useTick((dt) => {
    if (typeof text !== 'function') return
    since.current += dt
    if (since.current < 1) return
    since.current = 0
    refresh()
  }, 15)
  // a little dimmer by day so it does not read as a hole in the picture
  useEffect(() => {
    made.material.color.setScalar(glow > 1 ? 1 : 0.82)
  }, [made, glow])
  return (
    <mesh position={p} rotation={[0, rotY, 0]} material={made.material} userData={{ live: true }}>
      <planeGeometry args={size} />
    </mesh>
  )
}

// ---------------------------------------------------------------- room boards

export interface BoardPlace {
  room: number
  type: string
  x: number
  z: number
  rotY: number
}

const BOARD_W = 1.9
const BOARD_H = 0.72

/** Where to hang each room's board: on its north wall if it can be, else the west, clear of doors and tall furniture. */
export function boardPlaces(site: Site, types: Set<string>): BoardPlace[] {
  const out: BoardPlace[] = []
  const { w, h } = site
  const tall = (x: number, y: number) => {
    const it = itemAt(site, x, y)
    return !!it && !ITEMS[site.kind][it.kind]?.flat
  }
  for (const room of site.rooms) {
    if (!types.has(room.type)) continue
    let cx = 0
    let cy = 0
    let n = 0
    for (let i = 0; i < site.grid.length; i++) {
      if (site.grid[i] !== room.n) continue
      cx += i % w
      cy += (i / w) | 0
      n++
    }
    if (!n) continue
    cx /= n
    cy /= n
    const inRoom = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && site.grid[y * w + x] === room.n && !site.cuts?.[`${x},${y}`]
    let best: BoardPlace | null = null
    let bestScore = Infinity
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!inRoom(x, y)) continue
        // two tiles side by side against the north wall
        if (inRoom(x + 1, y) && !inRoom(x, y - 1) && !inRoom(x + 1, y - 1) && !wallAt(site, x, y, 'n') && !wallAt(site, x + 1, y, 'n')) {
          const score = Math.abs(x + 1 - (cx + 0.5)) + (tall(x, y) || tall(x + 1, y) ? 40 : 0) + (y - cy > 0 ? 100 : 0)
          if (score < bestScore) {
            bestScore = score
            best = { room: room.n, type: room.type, x: x + 1 - w / 2, z: y - h / 2 + WALL_T / 2 + 0.035, rotY: 0 }
          }
        }
        // or one above the other against the west wall
        if (inRoom(x, y + 1) && !inRoom(x - 1, y) && !inRoom(x - 1, y + 1) && !wallAt(site, x, y, 'w') && !wallAt(site, x, y + 1, 'w')) {
          const score = 20 + Math.abs(y + 1 - (cy + 0.5)) + (tall(x, y) || tall(x, y + 1) ? 40 : 0) + (x - cx > 0 ? 100 : 0)
          if (score < bestScore) {
            bestScore = score
            best = { room: room.n, type: room.type, x: x - w / 2 + WALL_T / 2 + 0.035, z: y + 1 - h / 2, rotY: Math.PI / 2 }
          }
        }
      }
    }
    if (best) out.push(best)
  }
  return out
}

/** Height of the middle of a board: on posts above a cut-away wall, or on the wall itself. */
export const boardY = (cut: boolean) => (cut ? CUT_H + 0.7 : 1.8)

/** The corners of a board, for pointing at. */
export function boardBox(p: BoardPlace, cut: boolean): [number, number, number, number, number, number] {
  const y = boardY(cut)
  const along = p.rotY === 0
  return [p.x - (along ? BOARD_W / 2 : 0.02), y - BOARD_H / 2, p.z - (along ? 0.02 : BOARD_W / 2), p.x + (along ? BOARD_W / 2 : 0.1), y + BOARD_H / 2, p.z + (along ? 0.1 : BOARD_W / 2)]
}

export function RoomBoards({ places, cut, text, palette, glow }: { places: BoardPlace[]; cut: boolean; text: (p: BoardPlace) => BoardText | (() => BoardText); palette: Palette; glow: number }) {
  const y = boardY(cut)
  const sig = places.map((p) => `${p.x},${p.z},${p.rotY}`).join('|') + (cut ? 'c' : 'w')
  return (
    <>
      <Baked sig={sig}>
        {places.map((p) => (
          <group key={p.room} position={[p.x, 0, p.z]} rotation={[0, p.rotY, 0]}>
            <B p={[0, y, 0.02]} s={[BOARD_W + 0.08, BOARD_H + 0.08, 0.05]} c="#101216" r={0.006} rough={0.5} cast={false} />
            {cut &&
              [-0.8, 0.8].map((x) => (
                <B key={x} p={[x, (CUT_H + y - BOARD_H / 2) / 2, 0]} s={[0.035, y - BOARD_H / 2 - CUT_H + 0.02, 0.035]} c={DARK} r={0.006} cast={false} />
              ))}
          </group>
        ))}
      </Baked>
      {places.map((p) => {
        const off = 0.05
        const px = p.x + (p.rotY === 0 ? 0 : off)
        const pz = p.z + (p.rotY === 0 ? off : 0)
        return <Face key={p.room} p={[px, y, pz]} rotY={p.rotY} size={[BOARD_W, BOARD_H]} text={text(p)} palette={palette} glow={glow} />
      })}
    </>
  )
}

// ---------------------------------------------------------------- lights

const col = new THREE.Color()
const M = new THREE.Matrix4()
const E = new THREE.Euler()
const Q = new THREE.Quaternion()
const V = new THREE.Vector3()
const S = new THREE.Vector3()

function local(site: Site, item: SiteItem, lx: number, ly: number, lz: number, out: THREE.Vector3): number {
  const def = ITEMS[site.kind][item.kind]
  const turned = item.rot % 2 === 1
  const cx = item.x - site.w / 2 + (turned ? def.h : def.w) / 2
  const cz = item.y - site.h / 2 + (turned ? def.w : def.h) / 2
  const a = (-item.rot * Math.PI) / 2
  out.set(cx + lx * Math.cos(a) + lz * Math.sin(a), ly, cz - lx * Math.sin(a) + lz * Math.cos(a))
  return a
}

/** The lights on the server racks. They flicker faster the more the software side has on. */
export function RackLights({ site, racks, activity }: { site: Site; racks: SiteItem[]; activity: number }) {
  const count = racks.length * 12
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.018, 0.008), new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, count))
    m.userData.live = true
    m.frustumCulled = false
    m.count = count
    racks.forEach((rack, r) => {
      for (let i = 0; i < 12; i++) {
        const a = local(site, rack, -0.1 + (i % 2) * 0.2, 0.22 + i * 0.145, 0.441, V)
        M.compose(V, Q.setFromEuler(E.set(0, a, 0)), S.set(1, 1, 1))
        m.setMatrixAt(r * 12 + i, M)
        m.setColorAt(r * 12 + i, col.set('#2fbf74'))
      }
    })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [racks, count])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    },
    [mesh],
  )
  const n = useRef(0)
  const owed = useRef(0)
  useTick((dt) => {
    if (!count) return
    // each light changes about once every few seconds when idle, several times a second when busy
    owed.current += count * dt * (0.25 + activity * 3.5)
    let changed = false
    while (owed.current >= 1) {
      owed.current -= 1
      const k = ++n.current
      const i = Math.floor(rnd(k * 1.37) * count)
      const r = rnd(k * 2.11)
      mesh.setColorAt(i, col.set(r < 0.22 ? '#0d2a1a' : r > 0.93 ? '#ffb347' : activity > 0.5 && r > 0.8 ? '#7fd1ff' : '#3fe08a'))
      changed = true
    }
    if (changed) mesh.instanceColor!.needsUpdate = true
  }, 15)
  if (!count) return null
  return <primitive object={mesh} />
}

/** The call lights on the support consoles: steady green when the team is on top of things, flashing red when it is not. */
export function CallLights({ site, consoles, load, palette }: { site: Site; consoles: SiteItem[]; load: number; palette: Palette }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.024, 0.024, 0.085, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, consoles.length))
    m.userData.live = true
    m.frustumCulled = false
    m.count = consoles.length
    consoles.forEach((it, i) => {
      local(site, it, -0.33, 0.9, -0.3, V)
      m.setMatrixAt(i, M.makeTranslation(V.x, V.y, V.z))
    })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consoles])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    },
    [mesh],
  )
  useTick((_, now) => {
    const mat = mesh.material as THREE.MeshBasicMaterial
    if (load >= 1) mat.color.set(palette.neg).multiplyScalar(Math.sin(now * 11) > 0 ? 1 : 0.25)
    else if (load >= 0.75) mat.color.set(palette.warn).multiplyScalar(0.65 + 0.35 * Math.sin(now * 3.5))
    else mat.color.set(palette.pos)
  }, 15)
  if (!consoles.length) return null
  return <primitive object={mesh} />
}

// ---------------------------------------------------------------- showcase

/** The device in a lobby case, turning slowly; every few seconds the next product takes its place. */
export function Showcase({ site, item, products, offset }: { site: Site; item: SiteItem; products: Product[]; offset: number }) {
  const ref = useRef<THREE.Group>(null)
  const [index, setIndex] = useState(offset)
  const turn = useRef(offset)
  const pos = useMemo(() => {
    const v = new THREE.Vector3()
    local(site, item, 0, 1.04, 0, v)
    return v
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, item.id, item.x, item.y])
  useTick((dt) => {
    turn.current += dt * 0.6
    if (ref.current) ref.current.rotation.y = turn.current
    if (products.length > 1) {
      const want = offset + Math.floor(turn.current / 5.4)
      if (want !== index) setIndex(want)
    }
  }, 15)
  if (!products.length) return null
  const product = products[index % products.length]
  return (
    <group ref={ref} position={pos}>
      <Baked sig={product.id}>
        <DeviceProp product={product} p={[0, 0, 0]} />
      </Baked>
    </group>
  )
}
