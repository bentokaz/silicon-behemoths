// 3D view of a buildable site: the land around it, the rooms and walls, what
// stands in them, and the cursor for building.
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { nearestBay } from '../sim/curves'
import { ITEMS, type LineStats, SITE_TIERS, type ShapeOpts, areaOf, areaTiles, canPlace, curveFor, gridAt, inPlot, isBoundary, itemAt, reachable, roomOf, tilesOf } from '../sim/sites'
import { ROLE_INFO } from '../sim/staff'
import { inTraining } from '../sim/staff'
import type { Employee, Product, Site, SiteItem, SiteKind } from '../sim/types'
import { QUALITY, isHeld, useSettings } from '../store/settings'
import { themeColor } from '../store/theme'
import { BayCursor, CurveOutline } from './site/curved'
import { Environs, MOODS, type Mood } from './site/env'
import { FactoryItem } from './site/factory'
import { Baked, LivePerson, Person, type PersonLook, hash } from './site/kit'
import { OfficeItem } from './site/office'
import { Shoppers, StoreItem } from './site/store'
import { Batch, CUT_H, Ground, STOREY, Structure, type ViewMode, WALL_T } from './site/structure'
import { STAGE_H, VenueItem } from './site/venue'

export type AreaShape = 'rect' | 'round' | 'ring' | 'diag'
export type SiteTool =
  | { type: 'item'; kind: string; rot: number }
  | { type: 'room'; room: string; shape: AreaShape; opts?: ShapeOpts }
  | { type: 'clear'; shape: AreaShape; opts?: ShapeOpts }
  | { type: 'ground'; id: string; shape: AreaShape; opts?: ShapeOpts }
  | { type: 'edge'; kind: 'wall' | 'glass' | 'door' | 'open' }
  | { type: 'rotate' }
  | { type: 'remove' }
  | null

export interface Edge {
  x: number
  y: number
  side: 'n' | 'w'
  /** Set when the pointer is on a bay of curved wall instead: which curve of the site, and which bay. */
  curve?: number
  bay?: string
}

/** A show in progress at a venue. */
export interface ShowState {
  /** Share of seats filled, 0-1. */
  crowd: number
  cheer: boolean
  screen?: THREE.Texture
  presenter: boolean
}

interface Props {
  site: Site
  mode: ViewMode
  mood: Mood
  tool: SiteTool
  company: string
  color: string
  logo?: string
  /** Room to outline, and rooms with no way in. */
  selectedRoom?: number
  sealed?: number[]
  onTile?: (x: number, y: number, item: SiteItem | undefined) => void
  onEdge?: (edge: Edge) => void
  /** An area tool was dragged out from one corner to the other. */
  onArea?: (x0: number, y0: number, x1: number, y1: number) => void
  /** Tiles the area tool would cover right now (0 when not dragging one out). */
  onPreview?: (tiles: number) => void
  /** Office: seated employees, in desk order, and everyone without a desk. */
  seated?: Employee[]
  idle?: Employee[]
  /** A person in the view was clicked. */
  onPerson?: (employeeId: string) => void
  /** Day of the game, for telling who is away on a course. */
  day?: number
  /** Factory: the line, and whether it has work. */
  line?: LineStats | null
  producing?: boolean
  /** Store and venue: what is on sale; store: how busy it is (0-1). */
  products?: Product[]
  busy?: number
  show?: ShowState
  /** Slowly circle the site instead of waiting for the mouse. */
  autoRotate?: boolean
}

const CHUNK = 8

/** Who sits at each seat: seats are filled in the order they were built. */
export function seatOwners(site: Site, seated: Employee[]): Map<string, Employee> {
  const map = new Map<string, Employee>()
  if (site.kind !== 'office') return map
  reachable(site)
    .filter((i) => ITEMS.office[i.kind]?.seats)
    .forEach((seat, i) => seated[i] && map.set(seat.id, seated[i]))
  return map
}

/** The model for one placed item of any kind of site. */
function ItemModel({ kind, item, c }: { kind: SiteKind; item: string; c: { glow: number; company: string; logo?: string; color: string; seed: number; who?: PersonLook; devices?: Product[]; products: Product[]; running?: boolean; flow?: [number, number]; show?: ShowState; fill?: number } }) {
  if (kind === 'office') return <OfficeItem kind={item} c={{ who: c.who, glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed, devices: c.devices }} />
  if (kind === 'factory') return <FactoryItem kind={item} c={{ running: !!c.running, flow: c.flow, glow: c.glow, seed: c.seed, fill: c.fill }} />
  if (kind === 'store') return <StoreItem kind={item} c={{ products: c.products, glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed }} />
  return <VenueItem kind={item} c={{ glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed, crowd: c.show?.crowd ?? 0, cheer: c.show?.cheer ?? false, show: !!c.show, screen: c.show?.screen, products: c.products }} />
}

/** Shadows are drawn once and kept until something on the site changes. */
function StaticShadows({ sig }: { sig: string }) {
  const gl = useThree((s) => s.gl)
  const left = useRef(6)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl])
  useEffect(() => {
    left.current = 6
  }, [sig])
  useFrame(() => {
    if (left.current > 0) {
      left.current--
      gl.shadowMap.needsUpdate = true
    }
  })
  return null
}

/** Keyboard camera: slide, turn and zoom with the keys set under System. */
export function CameraKeys({ span, home }: { span: number; home: [number, number, number] }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const held = useRef(new Set<string>())
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey) return
      held.current.add(e.code)
      if (isHeld(new Set([e.code]), 'camHome') && controls) {
        camera.position.set(...home)
        controls.target.set(0, 0.5, 0)
        controls.update()
      }
    }
    const up = (e: KeyboardEvent) => held.current.delete(e.code)
    const clear = () => held.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [camera, controls, home])
  useFrame((_, dt) => {
    const h = held.current
    if (!h.size || !controls) return
    const speed = useSettings.getState().settings.cameraSpeed
    const step = Math.min(0.05, dt)
    const offset = camera.position.clone().sub(controls.target)
    const dist = offset.length()
    const forward = new THREE.Vector3(-offset.x, 0, -offset.z).normalize()
    const right = new THREE.Vector3(-forward.z, 0, forward.x)
    const move = new THREE.Vector3()
    if (isHeld(h, 'camForward')) move.add(forward)
    if (isHeld(h, 'camBack')) move.sub(forward)
    if (isHeld(h, 'camRight')) move.add(right)
    if (isHeld(h, 'camLeft')) move.sub(right)
    if (move.lengthSq()) {
      move.normalize().multiplyScalar((6 + dist * 0.9) * step * speed)
      controls.target.add(move)
      // stay over the plot and a little beyond
      controls.target.x = THREE.MathUtils.clamp(controls.target.x, -span, span)
      controls.target.z = THREE.MathUtils.clamp(controls.target.z, -span, span)
    }
    const turn = (isHeld(h, 'camTurnLeft') ? 1 : 0) - (isHeld(h, 'camTurnRight') ? 1 : 0)
    if (turn) offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * 1.6 * step * speed)
    const zoom = (isHeld(h, 'camOut') ? 1 : 0) - (isHeld(h, 'camIn') ? 1 : 0)
    if (zoom) offset.multiplyScalar(1 + zoom * 1.4 * step * speed)
    camera.position.copy(controls.target).add(offset)
    controls.update()
  })
  return null
}

/** A small marker that bobs above someone who needs attention. */
function Marker({ p, color }: { p: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.position.y = p[1] + Math.sin(clock.elapsedTime * 3 + p[0]) * 0.06
    ref.current.rotation.y = clock.elapsedTime * 1.5
  })
  return (
    <mesh ref={ref} position={p} userData={{ live: true }}>
      <octahedronGeometry args={[0.11, 0]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} roughness={0.4} />
    </mesh>
  )
}

/** People with no desk: they wander the open ground until they are given somewhere to work. */
function Walkers({ site, people, onPerson, neg }: { site: Site; people: Employee[]; onPerson?: (id: string) => void; neg: string }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const free = useMemo(() => {
    const out: [number, number][] = []
    for (let y = 0; y < site.h; y++) for (let x = 0; x < site.w; x++) if (!gridAt(site, x, y) && !itemAt(site, x, y) && site.floor[`${x},${y}`] !== 'water') out.push([x, y])
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev])
  const state = useRef<{ x: number; z: number; tx: number; tz: number; wait: number; face: number }[]>([])
  const walkable = (x: number, z: number) => {
    const tx = Math.floor(x + site.w / 2)
    const ty = Math.floor(z + site.h / 2)
    return inPlot(site, tx, ty) && !gridAt(site, tx, ty) && !itemAt(site, tx, ty) && site.floor[`${tx},${ty}`] !== 'water'
  }
  const shown = people.slice(0, 24)
  useFrame((_, dt) => {
    if (!free.length) return
    const step = Math.min(0.1, dt)
    shown.forEach((e, i) => {
      let s = state.current[i]
      const pickSpot = (n: number) => free[Math.floor(hash(e.look + n) * free.length)]
      if (!s) {
        const [x, y] = pickSpot(i)
        s = state.current[i] = { x: x - site.w / 2 + 0.5, z: y - site.h / 2 + 0.5, tx: 0, tz: 0, wait: hash(e.look) * 3, face: 0 }
        s.tx = s.x
        s.tz = s.z
      }
      const dx = s.tx - s.x
      const dz = s.tz - s.z
      const d = Math.hypot(dx, dz)
      if (d < 0.08) {
        s.wait -= step
        if (s.wait <= 0) {
          // somewhere new, but only if the way there is clear
          const [x, y] = pickSpot(Math.floor(performance.now() / 700) + i * 13)
          const nx = x - site.w / 2 + 0.5
          const nz = y - site.h / 2 + 0.5
          const far = Math.hypot(nx - s.x, nz - s.z)
          let clear = far < 14
          for (let k = 1; clear && k < far * 2; k++) clear = walkable(s.x + ((nx - s.x) * k) / (far * 2), s.z + ((nz - s.z) * k) / (far * 2))
          if (clear) {
            s.tx = nx
            s.tz = nz
          }
          s.wait = 1.5 + hash(e.look + i) * 4
        }
      } else {
        const v = Math.min(d, 1.1 * step)
        s.x += (dx / d) * v
        s.z += (dz / d) * v
        s.face = Math.atan2(-dx, -dz)
      }
      const g = refs.current[i]
      if (g) {
        g.position.set(s.x, d < 0.08 ? 0 : Math.abs(Math.sin(performance.now() / 110 + i)) * 0.035, s.z)
        g.rotation.y = s.face
      }
    })
  })
  if (!free.length) return null
  return (
    <>
      {shown.map((e, i) => (
        <group
          key={e.id}
          ref={(g) => {
            refs.current[i] = g
            g?.traverse((o) => {
              o.userData.live = true
            })
          }}
          onClick={(ev) => {
            ev.stopPropagation()
            onPerson?.(e.id)
          }}
        >
          <Person who={{ look: e.look, color: ROLE_INFO[e.role].color }} pose="stand" arms="down" />
          <mesh position={[0, 2.0, 0]}>
            <octahedronGeometry args={[0.11, 0]} />
            <meshStandardMaterial color={neg} emissive={neg} emissiveIntensity={0.9} />
          </mesh>
        </group>
      ))}
    </>
  )
}

/** Development only: lets the camera be driven from the console for close-up checks of the models. */
function DevHandle() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    Object.assign(window, { sbView: { camera, controls, gl, scene } })
  }, [camera, controls, gl, scene])
  return null
}

/** A flat tint over a set of tiles, drawn as one mesh. */
function Tint({ tiles, w, h, color, opacity, y = 0.02 }: { tiles: [number, number][]; w: number; h: number; color: string; opacity: number; y?: number }) {
  const geo = useMemo(() => {
    const b = new Batch()
    for (const [x, z] of tiles) b.quad('t', x - w / 2 + 0.04, z - h / 2 + 0.04, x - w / 2 + 0.96, z - h / 2 + 0.96, y, '#ffffff')
    return b.build(() => ({ material: new THREE.MeshBasicMaterial() }))[0]?.geometry ?? null
  }, [tiles, w, h, y])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  return (
    <mesh geometry={geo} renderOrder={5}>
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}

export function SiteView({ site, mode, mood, tool, company, color, logo, selectedRoom, sealed, onTile, onEdge, onArea, onPreview, seated = [], idle = [], onPerson, day = 0, line, producing = false, products = [], busy = 0, show, autoRotate }: Props) {
  const prefs = useSettings((s) => s.settings)
  const Q = QUALITY[prefs.quality]
  const { w, h } = site
  const tier = SITE_TIERS[site.kind][site.tier]
  const M = MOODS[mood]
  const span = Math.max(w, h)
  const [hover, setHover] = useState<{ x: number; y: number; edge: Edge } | null>(null)
  const [anchor, setAnchor] = useState<[number, number] | null>(null)
  const accent = themeColor('accent', '#ff6b1a')
  const neg = themeColor('neg', '#ff4d4f')
  const areaTool = tool?.type === 'room' || tool?.type === 'clear' || tool?.type === 'ground'
  const shape: AreaShape = tool && 'shape' in tool ? tool.shape : 'rect'
  const opts = tool && 'shape' in tool ? tool.opts : undefined
  const optsKey = `${opts?.thick ?? ''}|${opts?.sweep ?? ''}|${opts?.turn ?? ''}`

  // a half-finished drag does not survive a change of tool
  useEffect(() => setAnchor(null), [tool?.type, tool && 'room' in tool ? tool.room : ''])
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setAnchor(null)
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // who sits where: seats are filled in the order they were built
  const owners = useMemo(() => seatOwners(site, seated), [site, site.rev, seated]) // eslint-disable-line react-hooks/exhaustive-deps
  const occupant = useMemo(() => {
    const map = new Map<string, PersonLook>()
    // someone on a course is not at their desk
    for (const [id, e] of owners) if (!inTraining(e, day)) map.set(id, { look: e.look, color: ROLE_INFO[e.role].color })
    return map
  }, [owners, day])
  /** Seats whose occupant wants something: a raise, or is close to quitting. */
  const flags = useMemo(() => {
    const out: { item: SiteItem; color: string }[] = []
    for (const item of site.items) {
      const e = owners.get(item.id)
      if (!e || inTraining(e, day)) continue
      if (e.ask) out.push({ item, color: '#f2b631' })
      else if (e.morale < 35) out.push({ item, color: neg })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owners, site, site.rev, day, neg])

  // free floor next to the fixtures, for shoppers to stand on
  const shopperSpots = useMemo(() => {
    if (site.kind !== 'store') return []
    const spots: [number, number][] = []
    for (let i = 0; i < w * h; i++) {
      const x = Math.floor(hash(i * 3 + 1) * w)
      const y = Math.floor(hash(i * 7 + 2) * h)
      if (!gridAt(site, x, y) || itemAt(site, x, y) || roomOf(site, gridAt(site, x, y))?.type === 'stock') continue
      if (spots.some(([sx, sz]) => Math.abs(sx - (x - w / 2 + 0.5)) < 0.9 && Math.abs(sz - (y - h / 2 + 0.5)) < 0.9)) continue
      spots.push([x - w / 2 + 0.5 + (hash(i) - 0.5) * 0.3, y - h / 2 + 0.5 + (hash(i + 9) - 0.5) * 0.3])
      if (spots.length >= 14) break
    }
    return spots
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev, w, h])

  // items grouped into blocks of floor, so a change only rebuilds the block it is in
  const glowKey = Math.round(M.glow * 10)
  const chunks = useMemo(() => {
    const map = new Map<string, { key: string; items: { item: SiteItem; index: number }[] }>()
    site.items.forEach((item, index) => {
      if (!ITEMS[site.kind][item.kind]) return
      const key = `${Math.floor(item.x / CHUNK)},${Math.floor(item.y / CHUNK)}`
      let c = map.get(key)
      if (!c) map.set(key, (c = { key, items: [] }))
      c.items.push({ item, index })
    })
    return [...map.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev])

  const running = !!line?.running && producing
  const productKey = products.map((p) => p.id).join('.')
  const ctxFor = (item: { id?: string; kind: string }, seed: number, flow?: [number, number]) => ({ who: item.id ? occupant.get(item.id) : undefined, glow: M.glow, company, logo, color, seed, devices: site.kind === 'office' ? products : undefined, products, running: !!item.id && (line?.linked.has(item.id) ?? false) && running, flow, show, fill: Math.round(busy * 5) / 5 })
  const sigOf = (items: { item: SiteItem }[]) =>
    items
      .map(({ item }) => {
        const who = occupant.get(item.id)
        return `${item.id}:${item.x},${item.y},${item.rot}:${who ? who.look + who.color : ''}:${line?.linked.has(item.id) ? 1 : 0}${line?.flow.get(item.id)?.join('') ?? ''}`
      })
      .join('|') + `#${glowKey}${running ? 'r' : ''}${site.kind === 'factory' ? Math.round(busy * 5) : ''}${company}${logo?.length ?? 0}${color}${productKey}${show ? `${show.crowd.toFixed(2)}${show.cheer ? 'c' : ''}${show.presenter ? 'p' : ''}${show.screen?.uuid ?? ''}` : ''}`

  const locate = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const fx = e.point.x + w / 2
    const fy = e.point.z + h / 2
    const x = Math.min(w - 1, Math.max(0, Math.floor(fx)))
    const y = Math.min(h - 1, Math.max(0, Math.floor(fy)))
    const u = fx - x
    const v = fy - y
    // nearest of the tile's four edges, expressed as a north or west edge
    const d = [v, 1 - v, u, 1 - u]
    const k = d.indexOf(Math.min(...d))
    const edge: Edge = k === 0 ? { x, y, side: 'n' } : k === 1 ? { x, y: y + 1, side: 'n' } : k === 2 ? { x, y, side: 'w' } : { x: x + 1, y, side: 'w' }
    // a curved wall close by wins over the grid edge
    const bay = tool?.type === 'edge' ? nearestBay(site, fx, fy, 0.6) : null
    return { x, y, edge: bay ? { ...edge, curve: bay.curve, bay: bay.bay } : edge }
  }

  // ---- cursor
  const preview = useMemo(() => {
    if (!hover || !tool) return null
    if (areaTool) {
      const from = anchor ?? [hover.x, hover.y]
      // a room with a curved wall takes every tile the curve touches
      const all = areaTiles(from[0], from[1], hover.x, hover.y, shape, opts, tool.type === 'room').filter(([x, y]) => inPlot(site, x, y))
      const good = all.filter(([x, y]) => (tool.type === 'clear' ? !!gridAt(site, x, y) : !gridAt(site, x, y) && !(tool.type === 'room' && itemAt(site, x, y))))
      const bad = tool.type === 'room' ? all.filter(([x, y]) => gridAt(site, x, y) || itemAt(site, x, y)) : []
      const curve = anchor ? curveFor(from[0], from[1], hover.x, hover.y, shape, opts) : null
      return { good, bad, curve, area: tool.type === 'room' ? Math.round(areaOf(good, curve)) : good.length }
    }
    if (tool.type === 'item') {
      const def = ITEMS[site.kind][tool.kind]
      if (!def) return null
      const tiles = tilesOf(def, hover.x, hover.y, tool.rot)
      return canPlace(site, tool.kind, hover.x, hover.y, tool.rot) ? { good: [], bad: tiles } : { good: tiles, bad: [] }
    }
    if (tool.type === 'rotate' || tool.type === 'remove') {
      const target = itemAt(site, hover.x, hover.y)
      const tiles = target ? tilesOf(ITEMS[site.kind][target.kind], target.x, target.y, target.rot) : ([[hover.x, hover.y]] as [number, number][])
      return target ? { good: tiles, bad: [] } : { good: [], bad: tiles }
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover?.x, hover?.y, anchor, tool, site, site.rev, areaTool, shape, optsKey])

  const previewCount = areaTool && anchor && preview ? ('area' in preview && preview.area !== undefined ? preview.area : preview.good.length) : 0
  useEffect(() => onPreview?.(previewCount), [previewCount, onPreview])

  const roomTiles = useMemo(() => {
    if (!selectedRoom) return []
    const out: [number, number][] = []
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (site.grid[y * w + x] === selectedRoom) out.push([x, y])
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev, selectedRoom, w, h])
  const sealedTiles = useMemo(() => {
    if (!sealed?.length) return []
    const set = new Set(sealed)
    const out: [number, number][] = []
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (set.has(site.grid[y * w + x])) out.push([x, y])
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev, sealed?.join(','), w, h])

  // the item itself, shown where it would go
  let ghost: React.ReactNode = null
  if (hover && tool?.type === 'item' && ITEMS[site.kind][tool.kind]) {
    const def = ITEMS[site.kind][tool.kind]
    const turned = tool.rot % 2 === 1
    const fw = turned ? def.h : def.w
    const fh = turned ? def.w : def.h
    ghost = (
      <group position={[hover.x - w / 2 + fw / 2, 0.03, hover.y - h / 2 + fh / 2]} rotation-y={(-tool.rot * Math.PI) / 2}>
        <ItemModel kind={site.kind} item={tool.kind} c={ctxFor({ kind: tool.kind }, 7)} />
      </group>
    )
  }

  let edgeCursor: React.ReactNode = null
  if (hover && tool?.type === 'edge' && hover.edge.bay !== undefined && hover.edge.curve !== undefined) {
    edgeCursor = <BayCursor site={site} curve={hover.edge.curve} bay={hover.edge.bay} height={mode === 'cut' ? CUT_H : STOREY - 0.1} color={accent} />
  } else if (hover && tool?.type === 'edge') {
    const ok = isBoundary(site, hover.edge.x, hover.edge.y, hover.edge.side)
    const ex = hover.edge.x - w / 2 + (hover.edge.side === 'n' ? 0.5 : 0)
    const ez = hover.edge.y - h / 2 + (hover.edge.side === 'w' ? 0.5 : 0)
    const eh = mode === 'cut' ? CUT_H : STOREY - 0.1
    edgeCursor = (
      <mesh position={[ex, eh / 2 + 0.02, ez]} rotation={[0, hover.edge.side === 'w' ? Math.PI / 2 : 0, 0]} renderOrder={6}>
        <boxGeometry args={[1, eh + 0.06, WALL_T + 0.06]} />
        <meshBasicMaterial color={ok ? accent : neg} transparent opacity={0.45} depthWrite={false} />
      </mesh>
    )
  }

  const venueStage = site.kind === 'venue' ? site.items.find((i) => i.kind === 'stage') : undefined
  const stage = show?.presenter ? venueStage : undefined
  const sun: [number, number, number] = [M.sunDir[0] * span * 1.4, M.sunDir[1] * span * 1.4, M.sunDir[2] * span * 1.4]
  const far = span * 7 + 420
  const near = Math.min(1.5, Math.max(0.4, span / 40))
  const reach = Math.max(14, span * 0.8)
  const height = mode === 'full' ? site.floors * STOREY : 0
  const home = useMemo<[number, number, number]>(() => [span * 0.75, span * 0.95 + height, span * 1.2 + 6], [span, height])
  const shadowSig = `${site.rev}|${mood}|${mode}|${seated.length}|${day > 0 ? Math.floor(day / 30) : 0}|${show ? show.crowd.toFixed(1) + show.cheer : ''}|${glowKey}`
  return (
    <Canvas shadows={Q.shadows > 0} dpr={[1, Q.dpr]} camera={{ fov: 30, near, far, position: home }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: mood === 'night' ? 1.25 : 1, powerPreference: 'high-performance' }}>
      <color attach="background" args={[M.sky]} />
      <fog attach="fog" args={[M.sky, span * 3 + 80, far * 0.9]} />
      <hemisphereLight args={[mood === 'night' ? '#6a7fa8' : '#fff4e6', mood === 'night' ? '#14161c' : '#4a4338', M.hemi + (mood === 'night' ? 0.35 : 0)]} />
      <directionalLight
        color={M.sunColor}
        intensity={M.sun}
        position={sun}
        castShadow={Q.shadows > 0}
        shadow-mapSize={[Q.shadows || 512, Q.shadows || 512]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.05}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-near={1}
        shadow-camera-far={span * 5 + 60}
      />
      {/* after dark the rooms are lit from within */}
      {mood !== 'day' && site.kind !== 'venue' && <pointLight position={[0, 2.3, 0]} color="#ffd9a8" intensity={(mood === 'night' ? 5 : 2) * span} distance={span * 1.5} decay={1.4} />}
      {/* a venue is lit from the stage outward */}
      {mood !== 'day' && site.kind === 'venue' && <pointLight position={venueStage ? [venueStage.x - w / 2 + 3, 9, venueStage.y - h / 2 + 7] : [0, 9, 0]} color="#ffe2bd" intensity={(mood === 'night' ? 9 : 4) * span} distance={span * 2} decay={1.2} />}
      <Environment resolution={128} frames={1} environmentIntensity={mood === 'night' ? 0.12 : 0.4}>
        <color attach="background" args={[M.sky]} />
        <Lightformer form="rect" intensity={3} color="#fff1e0" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#cfe0ff" position={[-8, 2, 0]} scale={[4, 6, 1]} target={[0, 0, 0]} />
      </Environment>

      <Environs env={tier.env} w={w} h={h} mood={mood} />
      <Ground site={site} dim={mood === 'night' ? 0.6 : mood === 'dusk' ? 0.85 : 1} />
      <Structure site={site} mode={mode} glow={mood === 'day' ? 0 : M.glow * 0.6} />

      {/* invisible pick surface over the whole plot */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0.005, 0]}
        onPointerMove={(e) => {
          const t = locate(e)
          if (!hover || hover.x !== t.x || hover.y !== t.y || hover.edge.x !== t.edge.x || hover.edge.y !== t.edge.y || hover.edge.side !== t.edge.side || hover.edge.bay !== t.edge.bay || hover.edge.curve !== t.edge.curve) setHover(t)
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          if (e.delta > 5) return
          const t = locate(e)
          if (tool?.type === 'edge') onEdge?.(t.edge)
          else if (areaTool) {
            if (!anchor) setAnchor([t.x, t.y])
            else {
              onArea?.(anchor[0], anchor[1], t.x, t.y)
              setAnchor(null)
            }
          } else onTile?.(t.x, t.y, itemAt(site, t.x, t.y))
        }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {chunks.map((chunk) => (
        <Baked key={chunk.key} sig={sigOf(chunk.items)}>
          {chunk.items.map(({ item, index }) => {
            const def = ITEMS[site.kind][item.kind]
            const turned = item.rot % 2 === 1
            const fw = turned ? def.h : def.w
            const fh = turned ? def.w : def.h
            const seed = Math.floor(hash(item.x * 13 + item.y * 7 + index) * 1000)
            let flow: [number, number] | undefined
            if (site.kind === 'factory' && line) {
              const f = line.flow.get(item.id)
              if (f) {
                // world direction to the item's own frame
                const a = (item.rot * Math.PI) / 2
                flow = [Math.round(f[0] * Math.cos(a) - f[1] * Math.sin(a)), Math.round(f[0] * Math.sin(a) + f[1] * Math.cos(a))]
              }
            }
            return (
              <group key={item.id} position={[item.x - w / 2 + fw / 2, 0, item.y - h / 2 + fh / 2]} rotation-y={(-item.rot * Math.PI) / 2}>
                <ItemModel kind={site.kind} item={item.kind} c={ctxFor(item, seed, flow)} />
              </group>
            )
          })}
        </Baked>
      ))}
      {site.kind === 'store' && <Shoppers spots={shopperSpots} count={Math.round(busy * shopperSpots.length)} />}
      {stage && <LivePerson who={{ look: 4242, color: '#1c1e22' }} p={[stage.x - w / 2 + 3 + 1.1, STAGE_H + 0.012, stage.y - h / 2 + 2 + 0.6]} rotY={Math.PI} arms={show?.cheer ? 'up' : 'down'} />}

      {roomTiles.length > 0 && <Tint tiles={roomTiles} w={w} h={h} color={accent} opacity={0.16} y={0.014} />}
      {sealedTiles.length > 0 && <Tint tiles={sealedTiles} w={w} h={h} color={neg} opacity={0.22} y={0.016} />}
      {preview && preview.good.length > 0 && <Tint tiles={preview.good} w={w} h={h} color={accent} opacity={ghost ? 0.22 : 0.45} />}
      {preview && preview.bad.length > 0 && <Tint tiles={preview.bad} w={w} h={h} color={neg} opacity={0.5} />}
      {preview && 'curve' in preview && preview.curve && <CurveOutline spec={preview.curve} w={w} h={h} color={accent} />}
      {ghost}
      {flags.map(({ item, color: c }) => {
        const def = ITEMS.office[item.kind]
        const turned = item.rot % 2 === 1
        return <Marker key={item.id} p={[item.x - w / 2 + (turned ? def.h : def.w) / 2, 1.75, item.y - h / 2 + (turned ? def.w : def.h) / 2]} color={c} />
      })}
      {site.kind === 'office' && prefs.walkers && idle.length > 0 && <Walkers site={site} people={idle} onPerson={onPerson} neg={neg} />}
      {edgeCursor}

      {Q.shadows > 0 && <StaticShadows sig={shadowSig} />}
      {Q.ao && (
        <EffectComposer multisampling={4}>
          <N8AO halfRes aoRadius={0.8} distanceFalloff={1} intensity={mood === 'night' ? 1.2 : 2} quality="medium" />
        </EffectComposer>
      )}
      {!autoRotate && <CameraKeys span={span} home={home} />}
      {import.meta.env.DEV && <DevHandle />}
      <OrbitControls makeDefault target={[0, height * 0.35 + 0.5, 0]} minDistance={near * 6} maxDistance={span * 3 + 40} maxPolarAngle={Math.PI * 0.485} enablePan screenSpacePanning={false} panSpeed={1.3 * prefs.cameraSpeed} rotateSpeed={0.9 * prefs.cameraSpeed} zoomSpeed={1.2 * prefs.cameraSpeed} zoomToCursor={prefs.zoomToPointer} enableDamping dampingFactor={0.2} autoRotate={autoRotate} autoRotateSpeed={0.5} />
    </Canvas>
  )
}
