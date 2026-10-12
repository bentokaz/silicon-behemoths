// 3D view of a buildable site: the land around it, the rooms and walls, what
// stands in them, the people who use them, and the cursor for building.
import { Environment, Html, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { type ReactNode, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { type Pt, bayRun, bayStands, curveTiles, nearestBay } from '../sim/curves'
import { EDGE_COST, keepsDoors, zonePlan } from '../sim/game'
import type { FactoryLife, OfficeLife, StoreLife, VenueLife } from '../sim/life'
import { ITEMS, type LineStats, SITE_TIERS, type Shape, type ShapeOpts, areaOf, areaTiles, canPlace, curveFor, cutAt, doorFits, fillError, gridAt, inPlot, isBoundary, itemAt, lineTiles, pocketAt, reachable, roomOf, rowSpots, tilesOf, wallAt } from '../sim/sites'
import { ROLE_INFO, inTraining, jobTitle } from '../sim/staff'
import type { Employee, Product, Site, SiteItem, SiteKind } from '../sim/types'
import { QUALITY, type Quality, isHeld, useSettings } from '../store/settings'
import { themeColor } from '../store/theme'
import { People } from './site/People'
import { Audience, Presenter } from './site/audience'
import { type BoardPlace, type BoardText, CallLights, Face, type Palette, RackLights, RoomBoards, Showcase, boardBox, boardPlaces, boardY } from './site/boards'
import { advanceClock, campus, hourOf } from './site/clock'
import { type Body, Crowd, Kind, type StaffEntry, describe, meetingSlot } from './site/crowd'
import { BayCursor, CurveOutline } from './site/curved'
import { Environs, type Mood, isIndoor, moodOf } from './site/env'
import { FactoryItem } from './site/factory'
import { FactoryCrowd } from './site/factorycrowd'
import { FactoryFloor, shippingDocks } from './site/factorylife'
import { Jacks } from './site/jacks'
import { Doors, Dropping, Sparks, SparksView, WallFx, type WallPiece, snapshot, wallChanges, wallHeight } from './site/fx'
import { Baked, type PersonLook, hash } from './site/kit'
import { DeskScreens, RoomLights } from './site/lights'
import { buildNav, cutOffRooms } from './site/nav'
import { OfficeItem } from './site/office'
import { type Target, itemTarget, placeBeside, rayBox } from './site/pick'
import { seatOwners } from './site/seats'
import { buildSpots, seatAisles } from './site/spots'
import { Shoppers, StoreItem } from './site/store'
import { Batch, CUT_H, Ground, STOREY, Structure, type ViewMode, WALL_T } from './site/structure'
import { Heartbeat, type Pulse, useTick } from './site/tick'
import { VenueItem } from './site/venue'
import { type Phase, VenueCrowd } from './site/venuecrowd'
import { planYard } from './site/yard'

export { seatOwners }
export type { Target }

/** How an area tool marks out its ground: the four drawn shapes, and (for rooms) filling the courtyard under the pointer in one click. */
export type AreaShape = 'rect' | 'round' | 'ring' | 'diag' | 'fill'
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

/** A run of wall marked out with the wall tool: straight edges, or the bays of one curved wall. */
export interface EdgeRun {
  edges?: { x: number; y: number; side: 'n' | 'w' }[]
  curve?: number
  bays?: string[]
}

/** What a tool being dragged would do if the button were let go now. */
export interface RunInfo {
  tool: 'item' | 'edge' | 'remove'
  /** Places it would act on, and places in the run where it cannot. */
  count: number
  blocked: number
  /** What it would cost, or for a sale what would come back. */
  cost: number
  /** Wall tool: doors in the run that glazing it would leave standing. */
  kept?: number
  /** Wall tool: stretches a curved wall cuts too short for a door or an opening. */
  short?: number
}

/** What the area tool would do where the pointer is, beyond how much ground it covers. */
export interface AreaNote {
  /** The room would take the whole courtyard: a box that covers most of it, or the fill tool. */
  filled?: boolean
  /** Why the fill tool cannot be used here. */
  error?: string
}

/** A show in progress at a venue. */
export interface ShowState {
  /** Share of seats filled, 0-1. */
  crowd: number
  cheer: boolean
  screen?: THREE.Texture
  presenter: boolean
}

/** What is going on at the site, for the rooms to show. */
export interface SiteLife {
  office?: OfficeLife
  factory?: FactoryLife
  store?: StoreLife
  venue?: VenueLife
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
  /** The item tool was clicked, or pressed and dragged from one tile to another: a row goes down between them. */
  onRow?: (x0: number, y0: number, x1: number, y1: number) => void
  /** The wall tool was clicked on a stretch of wall or dragged along a run of it. */
  onEdges?: (run: EdgeRun) => void
  /** The sell tool was clicked on, or dragged across, these items. */
  onSell?: (itemIds: string[]) => void
  /** Told what a drag in progress would do, and null when there is none. */
  onRun?: (info: RunInfo | null) => void
  /** An area tool was marked out from one corner to the other. `apart` is set when the key for a separate room was held. */
  onArea?: (x0: number, y0: number, x1: number, y1: number, apart: boolean) => void
  /** Tiles the area tool would cover right now (0 when not dragging one out), and anything worth saying about it. */
  onPreview?: (tiles: number, note?: AreaNote) => void
  /** Office: seated employees, in desk order, and everyone without a desk. */
  seated?: Employee[]
  idle?: Employee[]
  /** Office: the first few people who have applied for a job, who wait in the lobby. */
  applicants?: Employee[]
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
  /** Game speed (0 paused, 1, 2, 4): how fast the site's own clock runs. */
  speed?: number
  /** What the company is doing, shown in the rooms. Without it the site is a still model. */
  life?: SiteLife
  /** The card to show beside something that was clicked. */
  card?: (target: Target, close: () => void) => ReactNode
  /** Told how many rooms nobody can walk to from the street, though they have a door (it is blocked, or leads only to another such room). */
  onCutOff?: (rooms: number) => void
}

const CHUNK = 8
/** People drawn walking about at each quality setting; the rest stay seated. */
const LIVE_CAP: Record<Quality, number> = { low: 24, medium: 60, high: 90 }
/** Guests drawn walking to their seats at a venue at each quality setting; the rest of the house is drawn seated. */
const VENUE_WALKERS: Record<Quality, number> = { low: 40, medium: 110, high: 180 }
/** Real lamps handed round the lit rooms after dark at each quality setting. */
const ROOM_LAMPS: Record<Quality, number> = { low: 3, medium: 5, high: 7 }
/** What a venue's fittings look like while a show (or a run-through) is on, before anyone has a picture for the screen. */
const ON_AIR: ShowState = { crowd: 0, cheer: false, presenter: false }
const STAGED: Phase[] = ['rehearsal', 'doors', 'show', 'ovation']
/** Heights of the things worth clicking at a venue, in metres. */
const VENUE_TALL: Record<string, number> = { stage: 1.95, screen: 5.4, lights: 6.6, speakers: 3.4, camera: 2.3, seats: 1.05, seats_mid: 1.6, seats_high: 2.3, demo: 1.0, reception: 1.16, logowall: 2.0 }
/** Rooms that get a status screen on the wall. */
const BOARD_ROOMS = new Set(['lab', 'eng', 'studio', 'media', 'support', 'server', 'meeting', 'soft'])

interface ItemCtx {
  glow: number
  company: string
  logo?: string
  color: string
  seed: number
  who?: PersonLook
  devices?: Product[]
  products: Product[]
  running?: boolean
  flow?: [number, number]
  show?: ShowState
  fill?: number
  on?: boolean
  live?: boolean
  progress?: number
  busy?: boolean
  soldOut?: Set<string>
  away?: boolean
  aisles?: number
}

/** The model for one placed item of any kind of site. */
function ItemModel({ kind, item, c }: { kind: SiteKind; item: string; c: ItemCtx }) {
  if (kind === 'office') return <OfficeItem kind={item} c={{ who: c.who, glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed, devices: c.devices, on: c.on, live: c.live, progress: c.progress, busy: c.busy }} />
  if (kind === 'factory') return <FactoryItem kind={item} c={{ running: !!c.running, flow: c.flow, glow: c.glow, seed: c.seed, fill: c.fill, away: c.away, live: c.live }} />
  if (kind === 'store') return <StoreItem kind={item} c={{ products: c.products, glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed, soldOut: c.soldOut }} />
  return <VenueItem kind={item} c={{ glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed, crowd: c.show?.crowd ?? 0, cheer: c.show?.cheer ?? false, show: !!c.show, screen: c.show?.screen, products: c.products, aisles: c.aisles }} />
}

/** One block of furniture, merged into a few meshes. Only looked at again when its signature changes. */
const Chunk = memo(
  function Chunk({ sig, render }: { sig: string; render: () => ReactNode }) {
    return <Baked sig={sig}>{render()}</Baked>
  },
  (a, b) => a.sig === b.sig,
)

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

/** Development only: lets the camera and the site's clock be driven from the console for close-up checks. */
function DevHandle({ pulse, crowd }: { pulse: React.RefObject<Pulse | null>; crowd: Crowd | null }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    Object.assign(window, { sbView: { camera, controls, gl, scene, crowd, campus, beat: (dt: number, n = 1) => { for (let i = 0; i < n; i++) pulse.current?.beat(dt) } } })
  }, [camera, controls, gl, scene, crowd, pulse])
  return null
}

/**
 * A flat tint over a set of tiles, drawn as one mesh. `shapes` are odd-shaped
 * pieces of floor, in metres from the plot's corner. Each tile is drawn a
 * little short of its edges so the tiles can be counted; with `inset` at 0
 * they meet, and the tint is one unbroken sheet with the shapes beside it.
 */
function Tint({ tiles, shapes, w, h, color, opacity, y = 0.02, inset = 0.04 }: { tiles: [number, number][]; shapes?: Pt[][]; w: number; h: number; color: string; opacity: number; y?: number; inset?: number }) {
  const geo = useMemo(() => {
    const b = new Batch()
    for (const [x, z] of tiles) b.quad('t', x - w / 2 + inset, z - h / 2 + inset, x - w / 2 + 1 - inset, z - h / 2 + 1 - inset, y, '#ffffff')
    for (const p of shapes ?? []) b.poly('t', p.map(([x, z]): Pt => [x - w / 2, z - h / 2]), y, '#ffffff')
    return b.build(() => ({ material: new THREE.MeshBasicMaterial() }))[0]?.geometry ?? null
  }, [tiles, shapes, w, h, y, inset])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  return (
    <mesh geometry={geo} renderOrder={5}>
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}

/**
 * The floor of some rooms, for tinting: whole tiles, and the true shape of
 * the tiles a slanted or curved wall crosses, including the part of a tile
 * beyond another room's curved wall where these rooms own it.
 */
function floorOf(site: Site, rooms: Set<number>): { tiles: [number, number][]; shapes: Pt[][] } {
  const tiles: [number, number][] = []
  const shapes: Pt[][] = []
  if (!rooms.size) return { tiles, shapes }
  const curved = curveTiles(site)
  for (let y = 0; y < site.h; y++) {
    for (let x = 0; x < site.w; x++) {
      const n = site.grid[y * site.w + x]
      if (!n) continue
      const edge = curved.get(`${x},${y}`)
      if (edge) {
        if (rooms.has(n)) shapes.push(...edge.shape.inside)
        if (edge.beyond && rooms.has(edge.beyond)) shapes.push(...edge.shape.outside)
        continue
      }
      if (!rooms.has(n)) continue
      const cut = cutAt(site, x, y)
      if (!cut) {
        tiles.push([x, y])
        continue
      }
      // half the tile: the three corners the cut leaves
      const corners: Record<string, Pt> = { nw: [x, y], ne: [x + 1, y], se: [x + 1, y + 1], sw: [x, y + 1] }
      shapes.push((['nw', 'ne', 'se', 'sw'] as const).filter((k) => k !== cut).map((k) => corners[k]))
    }
  }
  return { tiles, shapes }
}

/**
 * Most models shown for a row being dragged out. A row is one straight line
 * of tiles, so this is more than the widest plot can hold: every spot of a
 * run is previewed.
 */
const GHOSTS = 256
const ghostAt = new THREE.Matrix4()
const ghostTurn = new THREE.Matrix4()
const ghostInv = new THREE.Matrix4()
const ghostPart = new THREE.Matrix4()
const ghostEach = new THREE.Matrix4()

interface GhostPart {
  mesh: THREE.InstancedMesh
  /** Where the part sits in the model. */
  rel: THREE.Matrix4
  /** The pattern's own instanced mesh, when the part is one: each of its instances is drawn at every spot. */
  from: THREE.InstancedMesh | null
  each: number
}

/**
 * The item in hand, shown at every spot it would go: one under the pointer,
 * or a whole row being dragged out. The model is built once, out of sight, as
 * a pattern; each of its meshes is then drawn for all the spots together as
 * one instanced mesh, so a row of sixty costs the same few draw calls as a
 * single item. Spots where it cannot go are drawn in one flat, see-through
 * warning colour.
 */
function RowGhosts({ spots, rot, ox, oz, warn, children }: { spots: { x: number; y: number; ok: boolean }[]; rot: number; ox: number; oz: number; warn: string; children: ReactNode }) {
  const pattern = useRef<THREE.Group>(null)
  const holder = useRef<THREE.Group>(null)
  const built = useRef<{ sig: string; room: number; good: GhostPart[]; bad: GhostPart[] }>({ sig: '', room: 0, good: [], bad: [] })
  const tint = useMemo(() => new THREE.MeshStandardMaterial({ color: warn, emissive: warn, emissiveIntensity: 0.45, roughness: 0.8, transparent: true, opacity: 0.62, depthWrite: false }), [warn])
  useEffect(() => () => tint.dispose(), [tint])
  const clear = () => {
    const b = built.current
    for (const part of [...b.good, ...b.bad]) {
      holder.current?.remove(part.mesh)
      // the geometry and the materials belong to the pattern (or are shared): only the instances are this mesh's own
      part.mesh.dispose()
    }
    built.current = { sig: '', room: 0, good: [], bad: [] }
  }
  useEffect(() => clear, []) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const root = pattern.current
    const out = holder.current
    if (!root || !out) return
    // ---- the meshes of the pattern that would be seen, and where each sits in the model
    root.updateWorldMatrix(true, true)
    ghostInv.copy(root.matrixWorld).invert()
    const sources: THREE.Mesh[] = []
    const walk = (o: THREE.Object3D) => {
      for (const child of o.children) {
        if (!child.visible) continue
        const mesh = child as THREE.Mesh
        if (mesh.isMesh && mesh.geometry?.attributes.position) sources.push(mesh)
        walk(child)
      }
    }
    walk(root)
    const matOf = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.material.map((x) => x.uuid).join('+') : m.material.uuid)
    const sig = sources.map((m) => `${m.geometry.uuid}:${matOf(m)}:${(m as THREE.InstancedMesh).count ?? 1}:${m.matrixWorld.elements.map((v) => Math.round(v * 1000)).join(',')}`).join('|') + `#${tint.uuid}`
    const need = Math.max(1, spots.length)
    let b = built.current
    if (b.sig !== sig || b.room < need) {
      clear()
      // room for the row to grow without building everything again at each tile
      const room = Math.min(GHOSTS, Math.max(8, 2 ** Math.ceil(Math.log2(need))))
      const make = (src: THREE.Mesh, material: THREE.Material | THREE.Material[]): GhostPart => {
        const from = (src as THREE.InstancedMesh).isInstancedMesh ? (src as THREE.InstancedMesh) : null
        const each = from ? from.count : 1
        const mesh = new THREE.InstancedMesh(src.geometry, material, room * each)
        mesh.count = 0
        mesh.frustumCulled = false
        mesh.castShadow = false
        mesh.receiveShadow = false
        mesh.userData.live = true
        mesh.raycast = () => {}
        out.add(mesh)
        return { mesh, rel: new THREE.Matrix4().multiplyMatrices(ghostInv, src.matrixWorld), from, each }
      }
      b = built.current = { sig, room, good: sources.map((m) => make(m, m.material)), bad: sources.map((m) => make(m, tint)) }
      for (const part of b.bad) part.mesh.renderOrder = 4
    }
    // ---- one instance of every part at every spot
    ghostTurn.makeRotationY((-rot * Math.PI) / 2)
    const fill = (parts: GhostPart[], ok: boolean) => {
      let n = 0
      for (const spot of spots) {
        if (spot.ok !== ok || n >= b.room) continue
        ghostAt.makeTranslation(spot.x + ox, 0.03, spot.y + oz).multiply(ghostTurn)
        for (const part of parts) {
          if (!part.from) part.mesh.setMatrixAt(n, ghostPart.multiplyMatrices(ghostAt, part.rel))
          else {
            ghostPart.multiplyMatrices(ghostAt, part.rel)
            for (let k = 0; k < part.each; k++) {
              part.from.getMatrixAt(k, ghostEach)
              part.mesh.setMatrixAt(n * part.each + k, ghostEach.premultiply(ghostPart))
            }
          }
        }
        n++
      }
      for (const part of parts) {
        part.mesh.count = n * part.each
        part.mesh.visible = n > 0
        part.mesh.instanceMatrix.needsUpdate = true
      }
    }
    fill(b.good, true)
    fill(b.bad, false)
  })
  return (
    <>
      <group ref={pattern} visible={false}>
        {children}
      </group>
      <group ref={holder} />
    </>
  )
}
/** Most items in one go that still drop in (or puff away) one by one. */
const WAVE_MAX = 48

// ---------------------------------------------------------------- the living site

/** Runs the site's clock and the people on it. */
function Day({ crowd, speed, onTurn }: { crowd: Crowd | null; speed: number; onTurn: (working: boolean, phase: Phase) => void }) {
  const last = useRef('')
  useTick((dt) => {
    const pace = advanceClock(dt, speed)
    crowd?.step(dt, pace, campus.t)
    // the few moments in a day the rest of the view cares about: people at their desks or not, and where a venue is in its day
    const hour = hourOf(campus.t)
    const working = hour >= 8.5 && hour < 17.4
    const phase: Phase = crowd instanceof VenueCrowd ? crowd.phase : 'closed'
    const key = `${working}|${phase}`
    if (key !== last.current) {
      last.current = key
      onTurn(working, phase)
    }
  }, 0)
  return null
}

interface Hover {
  target: Target
  body?: Body
}

const ray = new THREE.Raycaster()
const ndc = new THREE.Vector2()

/** Finds what is under the pointer, and tells the view when it is clicked. */
function Pointer({ enabled, targets, crowd, titles, hover, onHover, onPick, consumed }: { enabled: boolean; targets: Target[]; crowd: Crowd | null; titles: Map<string, string>; hover: React.RefObject<Hover | null>; onHover: (h: Hover | null) => void; onPick: (h: Hover) => void; consumed: React.RefObject<number> }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const at = useRef({ x: 0, y: 0, inside: false, downX: 0, downY: 0, moved: true })
  const pick = useRef(onPick)
  pick.current = onPick
  useEffect(() => {
    const el = gl.domElement
    const place = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      at.current.x = ((e.clientX - r.left) / r.width) * 2 - 1
      at.current.y = -((e.clientY - r.top) / r.height) * 2 + 1
      at.current.inside = true
      at.current.moved = true
    }
    const leave = () => {
      at.current.inside = false
      at.current.moved = true
    }
    const down = (e: PointerEvent) => {
      at.current.downX = e.clientX
      at.current.downY = e.clientY
    }
    const up = (e: PointerEvent) => {
      if (e.button !== 0 || Math.hypot(e.clientX - at.current.downX, e.clientY - at.current.downY) > 5) return
      if (hover.current) {
        consumed.current = performance.now()
        pick.current(hover.current)
      }
    }
    el.addEventListener('pointermove', place)
    el.addEventListener('pointerleave', leave)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointermove', place)
      el.removeEventListener('pointerleave', leave)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
    }
  }, [gl, hover, consumed])
  const skip = useRef(0)
  useTick(() => {
    const p = at.current
    if (!enabled || !p.inside) {
      if (hover.current) onHover(null)
      return
    }
    // people move under a still pointer, so look again a few times a second even if it has not moved
    if (!p.moved && ++skip.current % 6) return
    p.moved = false
    ray.setFromCamera(ndc.set(p.x, p.y), camera)
    const o = ray.ray.origin
    const d = ray.ray.direction
    let best: Target | null = null
    let bestT = Infinity
    for (let i = 0; i < targets.length; i++) {
      const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, targets[i].box)
      if (t < bestT) {
        bestT = t
        best = targets[i]
      }
    }
    const person = crowd?.hit(o.x, o.y, o.z, d.x, d.y, d.z)
    if (person && person.t < bestT + 0.35 && person.body.kind !== Kind.Shopper) {
      const b = person.body
      const key = `body:${b.kind}:${b.id}`
      const staff = b.kind === Kind.Staff || b.kind === Kind.Applicant
      const hint = !staff ? describe(b) : b.kind === Kind.Applicant ? (b.hired ? describe(b) : `Applicant, ${ROLE_INFO[b.role!].name.toLowerCase()}`) : `${titles.get(String(b.id)) ?? ROLE_INFO[b.role!].name}. ${describe(b)}`
      if (hover.current?.target.key !== key || hover.current.target.hint !== hint) {
        onHover({ target: { key, kind: !staff ? (b.kind === Kind.Hand ? 'orders' : b.kind === Kind.Front && !(crowd instanceof VenueCrowd) ? 'applicants' : 'venue') : b.kind === Kind.Applicant ? 'applicants' : 'person', id: staff ? b.id : 'people', label: b.name, hint, box: [0, 0, 0, 0, 0, 0], anchor: [b.x, b.y + b.hip + 1.0, b.z] }, body: b })
      }
      return
    }
    if ((best?.key ?? '') !== (hover.current?.target.key ?? '')) onHover(best ? { target: best } : null)
  }, 30)
  return null
}

const BOX_EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))

/** The outline round whatever is under the pointer, and its name. */
function HoverMark({ hover, color }: { hover: Hover; color: string }) {
  const group = useRef<THREE.Group>(null)
  const { target, body } = hover
  useTick(() => {
    if (body && group.current) group.current.position.set(body.x, body.y, body.z)
  }, 31)
  const b = target.box
  return (
    <>
      {body ? (
        <group ref={group} position={[body.x, body.y, body.z]}>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} renderOrder={6} userData={{ live: true }}>
            <ringGeometry args={[0.3, 0.36, 24]} />
            <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} toneMapped={false} />
          </mesh>
          <Html position={[0, body.hip + 1.05, 0]} calculatePosition={labelPosition} zIndexRange={[30, 20]} style={{ pointerEvents: 'none' }}>
            <Label target={target} />
          </Html>
        </group>
      ) : (
        <>
          <lineSegments geometry={BOX_EDGES} position={[(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]} scale={[b[3] - b[0] + 0.06, b[4] - b[1] + 0.04, b[5] - b[2] + 0.06]} renderOrder={6} userData={{ live: true }}>
            <lineBasicMaterial color={color} toneMapped={false} depthTest={false} transparent opacity={0.95} />
          </lineSegments>
          <Html position={target.anchor} calculatePosition={labelPosition} zIndexRange={[30, 20]} style={{ pointerEvents: 'none' }}>
            <Label target={target} />
          </Html>
        </>
      )}
    </>
  )
}

function Label({ target }: { target: Target }) {
  const ref = useRef<HTMLDivElement>(null)
  // how big the label is, for keeping all of it on screen
  useLayoutEffect(() => {
    if (ref.current) labelSize.set(ref.current.offsetWidth, ref.current.offsetHeight)
  })
  return (
    <div ref={ref} className="pointer-events-none whitespace-nowrap border border-line2 bg-panel/95 px-2 py-[3px] text-center">
      <div className="text-[11px] uppercase tracking-wider text-fg">{target.label}</div>
      {target.hint && <div className="text-[10px] normal-case tracking-normal text-dim">{target.hint}</div>}
    </div>
  )
}

const labelSize = new THREE.Vector2(120, 34)
const cardSize = new THREE.Vector2(264, 300)
const pin = new THREE.Vector3()

/** A label sits just above what it names, and slides along the edge of the view rather than off it. */
const labelPosition = (el: THREE.Object3D, camera: THREE.Camera, size: { width: number; height: number }): number[] => {
  pin.setFromMatrixPosition(el.matrixWorld).project(camera)
  return placeBeside((pin.x * 0.5 + 0.5) * size.width, (-pin.y * 0.5 + 0.5) * size.height, labelSize.x, labelSize.y, size.width, size.height, 'above')
}

/** Keeps a card on screen: pinned beside its object, on whichever side has room, and never off any edge of the view. */
const cardPosition = (el: THREE.Object3D, camera: THREE.Camera, size: { width: number; height: number }): number[] => {
  pin.setFromMatrixPosition(el.matrixWorld).project(camera)
  return placeBeside((pin.x * 0.5 + 0.5) * size.width, (-pin.y * 0.5 + 0.5) * size.height, cardSize.x, cardSize.y, size.width, size.height, 'beside')
}

/** Wraps a card so its real size is known to whatever places it. */
function Sized({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => cardSize.set(el.offsetWidth || 264, el.offsetHeight || 300)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  return <div ref={ref}>{children}</div>
}

/** Confetti over the labs each time a research project is finished. */
function Celebrate({ count, places, sparks, palette }: { count: number; places: BoardPlace[]; sparks: Sparks; palette: Palette }) {
  const last = useRef(count)
  useEffect(() => {
    if (count > last.current) for (const p of places) if (p.type === 'lab') sparks.burst(p.x, 1.6, p.z + 0.6, [palette.accent, palette.pos, '#ffffff', palette.warn], 30)
    last.current = count
  }, [count, places, sparks, palette])
  return null
}

const fmtMoney = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`)
const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

export function SiteView({ site, mode, mood, tool, company, color, logo, selectedRoom, sealed, onTile, onRow, onEdges, onSell, onRun, onArea, onPreview, seated = [], idle = [], applicants, onPerson, day = 0, line, producing = false, products = [], busy = 0, show, autoRotate, speed = 0, life, card, onCutOff }: Props) {
  const prefs = useSettings((s) => s.settings)
  const Q = QUALITY[prefs.quality]
  const { w, h } = site
  const tier = SITE_TIERS[site.kind][site.tier]
  // inside a mall there is no sky and no night: what shows past the walls is the dim upper part of the building,
  // and the hall keeps its own lamps on, so the hour only warms and lowers the light a little
  const indoor = isIndoor(tier.env)
  const M = moodOf(tier.env, mood)
  const sky = M.sky
  /** Dark out: the moon for a sun, a cold sky, and the picture lifted a little to make up for it. */
  const dark = mood === 'night' && !indoor
  const span = Math.max(w, h)
  const [hover, setHover] = useState<{ x: number; y: number; edge: Edge } | null>(null)
  const [anchor, setAnchor] = useState<[number, number] | null>(null)
  /** Where the button went down with a tool that paints as it is dragged: the tile, the exact spot, and the wall under it. */
  const [drag, setDrag] = useState<{ x: number; y: number; fx: number; fy: number; edge: Edge; bay?: string } | null>(null)
  /** With these tools a left-drag belongs to the tool, not the camera. */
  const dragTool = tool?.type === 'item' || tool?.type === 'edge' || tool?.type === 'remove'
  const accent = themeColor('accent', '#ff6b1a')
  const neg = themeColor('neg', '#ff4d4f')
  const palette = useMemo<Palette>(() => ({ accent, neg, pos: themeColor('pos', '#5fd08a'), warn: themeColor('warn', '#f2b631') }), [accent, neg])
  const areaTool = tool?.type === 'room' || tool?.type === 'clear' || tool?.type === 'ground'
  /** Filling a courtyard is one click on it, and only rooms are built that way: any other area tool draws a box instead. */
  const filling = tool?.type === 'room' && tool.shape === 'fill'
  const shape: Shape = tool && 'shape' in tool && tool.shape !== 'fill' ? tool.shape : 'rect'
  /** The site shows what the company is doing: clocks run, screens are live, things can be clicked. */
  const lively = !!life && !autoRotate
  const office = site.kind === 'office' ? life?.office : undefined
  const cut = mode === 'cut'
  const opts = tool && 'shape' in tool ? tool.opts : undefined
  const optsKey = `${opts?.thick ?? ''}|${opts?.sweep ?? ''}|${opts?.turn ?? ''}`

  // a half-finished drag does not survive a change of tool
  useEffect(() => {
    setAnchor(null)
    setDrag(null)
  }, [tool?.type, tool && 'room' in tool ? tool.room : '', tool && 'kind' in tool ? tool.kind : ''])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setAnchor(null)
      setDrag(null)
      setOpen(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // ---- effects that live for a moment
  const sparks = useMemo(() => new Sparks(), [])
  const pulse = useRef<Pulse | null>(null)

  // ---- who sits where, and who is drawn walking about
  const seatedKey = seated.map((e) => e.id).join(',')
  const owners = useMemo(() => seatOwners(site, seated), [site, site.rev, seatedKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // what each person is called: an executive goes by the seat they hold, not their desk job
  const titles = useMemo(() => new Map([...seated, ...idle].map((e) => [String(e.id), jobTitle(e)])), [seatedKey, idle.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const crowdOn = lively && prefs.walkers && (site.kind !== 'factory' || !!life?.factory)
  const crowd = useMemo(() => (crowdOn ? (site.kind === 'venue' ? new VenueCrowd() : site.kind === 'factory' ? new FactoryCrowd() : new Crowd()) : null), [crowdOn, site.kind])
  /** Whether the site is in its working day, and where a venue is in its programme: told by the clock when either turns over. */
  const [turn, setTurn] = useState<{ working: boolean; phase: Phase }>({ working: true, phase: 'closed' })
  const onTurn = useCallback((working: boolean, phase: Phase) => setTurn({ working, phase }), [])
  const [darkRooms, setDarkRooms] = useState<ReadonlySet<number>>(() => new Set())
  const nav = useMemo(() => buildNav(site), [site, site.rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const spots = useMemo(() => (crowdOn ? buildSpots(site, nav) : []), [site, nav, crowdOn])
  const cutOff = useMemo(() => {
    if (!crowdOn) return 0
    // a room counts as reachable if any of its floor can be walked to from the way in; with no way in at all, none is
    return cutOffRooms(site, nav).length
  }, [site, nav, crowdOn])
  useEffect(() => onCutOff?.(cutOff), [cutOff, onCutOff])
  const cap = LIVE_CAP[prefs.quality]
  const idleKey = idle.map((e) => e.id).join(',')
  const entries = useMemo(() => {
    const out: StaffEntry[] = []
    if (!crowdOn || site.kind !== 'office') return out
    for (const e of idle.slice(0, Math.min(16, cap))) out.push({ e })
    for (const item of site.items) {
      if (out.length >= cap) break
      const e = owners.get(item.id)
      if (e) out.push({ e, seat: item.id })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owners, idleKey, crowdOn, cap, site, site.rev])
  const liveSeats = useMemo(() => new Set(entries.filter((x) => x.seat).map((x) => x.seat!)), [entries])
  const liveDesks = useMemo(() => site.items.filter((i) => liveSeats.has(i.id)), [site, site.rev, liveSeats]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    crowd?.setSite(site, nav, spots)
  }, [crowd, site, nav, spots])
  useLayoutEffect(() => {
    if (!crowd || site.kind !== 'office') return
    crowd.setStaff(entries, office, day, new Set([...seated, ...idle].map((e) => e.id)))
    crowd.setApplicants(applicants ?? [])
  })
  const shopFloor = life?.store
  useLayoutEffect(() => {
    if (!crowd || site.kind !== 'store') return
    const spotsFor = spots.filter((s) => s.access >= 0).length
    const open = shopFloor?.open ?? false
    crowd.setShop(open ? Math.min(cap, Math.round(busy * Math.min(16, spotsFor * 0.6))) : 0, open && shopFloor ? Math.min(5, Math.ceil(shopFloor.perDay / 30)) : 0)
  })

  // a factory's shift follows the line: how much of it there is, and whether it has orders to work through
  const shift = life?.factory
  useLayoutEffect(() => {
    if (crowd instanceof FactoryCrowd) crowd.setLine(shift?.line?.linked, !!shift?.producing, cap)
  })

  const atDesks = !lively || turn.working
  const venue = site.kind === 'venue' ? life?.venue : undefined
  useLayoutEffect(() => {
    if (!(crowd instanceof VenueCrowd)) return
    crowd.walkers = VENUE_WALKERS[prefs.quality]
    // a show handed in from outside (the rehearse switch) is on now, whatever the clock says
    crowd.setProgramme({ booked: !!venue?.booked, live: !!show, draw: show ? show.crowd : (venue?.draw ?? 0.8) })
  })
  /** What the venue's lights, screen and cameras should be doing. */
  const staged = show ?? (crowd instanceof VenueCrowd && STAGED.includes(turn.phase) ? ON_AIR : undefined)
  const house = useRef({ house: 0, applause: 0, ovation: false })
  const houseState = () => {
    const hs = house.current
    if (crowd instanceof VenueCrowd) {
      hs.house = crowd.house
      hs.applause = crowd.applause
      hs.ovation = crowd.ovation
    } else {
      hs.house = show?.crowd ?? 0
      hs.applause = show?.cheer ? 1 : 0
      hs.ovation = !!show?.cheer
    }
    return hs
  }
  const filledSeat = (key: string) => crowd instanceof VenueCrowd && crowd.seated.has(key)

  // ---- factory: how the lorries come and go
  const linkedKey = life?.factory?.line ? [...life.factory.line.linked].join(',') : ''
  const yard = useMemo(() => planYard(site, lively && site.kind === 'factory' && life?.factory ? shippingDocks(site, life.factory.line?.linked) : []), [site, site.rev, lively, linkedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const occupant = useMemo(() => {
    const map = new Map<string, PersonLook>()
    // someone on a course is not at their desk; someone drawn live is wherever they have walked to; and after hours everyone has gone home
    if (atDesks) for (const [id, e] of owners) if (!liveSeats.has(id) && !inTraining(e, day)) map.set(id, { look: e.look, color: ROLE_INFO[e.role].color })
    return map
  }, [owners, day, liveSeats, atDesks])
  /** Seats whose occupant wants something: a raise, or is close to quitting. Live people carry their own marker. */
  const flags = useMemo(() => {
    const out: { item: SiteItem; color: string }[] = []
    for (const item of site.items) {
      const e = owners.get(item.id)
      if (!e || liveSeats.has(item.id) || inTraining(e, day) || !atDesks) continue
      if (e.ask) out.push({ item, color: '#f2b631' })
      else if (e.morale < 35) out.push({ item, color: neg })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owners, site, site.rev, day, neg, liveSeats, atDesks])

  // free floor next to the fixtures, for shoppers to stand on (when nobody is drawn walking)
  const shopperSpots = useMemo(() => {
    if (site.kind !== 'store' || crowdOn) return []
    const out: [number, number][] = []
    for (let i = 0; i < w * h; i++) {
      const x = Math.floor(hash(i * 3 + 1) * w)
      const y = Math.floor(hash(i * 7 + 2) * h)
      if (!gridAt(site, x, y) || itemAt(site, x, y) || roomOf(site, gridAt(site, x, y))?.type === 'stock') continue
      if (out.some(([sx, sz]) => Math.abs(sx - (x - w / 2 + 0.5)) < 0.9 && Math.abs(sz - (y - h / 2 + 0.5)) < 0.9)) continue
      out.push([x - w / 2 + 0.5 + (hash(i) - 0.5) * 0.3, y - h / 2 + 0.5 + (hash(i + 9) - 0.5) * 0.3])
      if (out.length >= 14) break
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev, w, h, crowdOn])

  // ---- what each bench, table and case has on it
  const devKey = office ? office.dev.map((d) => `${d.product.id}:${Math.round(d.progress * 10)}`).join(',') + '/' + office.onSale.map((p) => p.id).join(',') : ''
  const shown = useMemo(() => {
    const map = new Map<string, { devices: Product[]; progress?: number }>()
    if (site.kind !== 'office') return map
    const dev = office?.dev ?? []
    const sale = office?.onSale ?? products
    let k = 0
    for (const item of site.items) {
      if (item.kind !== 'devrig' && item.kind !== 'design') continue
      if (dev.length) {
        const d = dev[k % dev.length]
        map.set(item.id, { devices: item.kind === 'design' ? [d.product, dev[(k + 1) % dev.length].product] : [d.product], progress: Math.round(d.progress * 10) / 10 })
      } else if (sale.length) map.set(item.id, { devices: [sale[k % sale.length], sale[(k + 1) % sale.length]] })
      k++
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev, devKey, products])
  const showcases = useMemo(() => (site.kind === 'office' ? site.items.filter((i) => i.kind === 'showcase') : []), [site, site.rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const racks = useMemo(() => (site.kind === 'office' && lively ? site.items.filter((i) => i.kind === 'server') : []), [site, site.rev, lively]) // eslint-disable-line react-hooks/exhaustive-deps
  const consoles = useMemo(() => (site.kind === 'office' && lively ? site.items.filter((i) => i.kind === 'helpdesk') : []), [site, site.rev, lively]) // eslint-disable-line react-hooks/exhaustive-deps
  const screens = useMemo(() => (site.kind === 'office' && lively ? site.items.filter((i) => i.kind === 'screen') : []), [site, site.rev, lively]) // eslint-disable-line react-hooks/exhaustive-deps
  const showcaseList = office ? (office.onSale.length ? office.onSale : office.dev.map((d) => d.product)) : products
  const researching = !!office?.research.length && office.budget > 0

  // ---- furniture that has just been put down drops into place before it joins the rest
  const [known, setKnown] = useState(() => ({ site, rev: site.rev, ids: new Set(site.items.map((i) => i.id)) }))
  const [dropping, setDropping] = useState<Set<string>>(() => new Set())
  /** How long each dropping item waits its turn, so a row lands one after another. */
  const dropWait = useRef(new Map<string, number>())
  if (known.site !== site || known.rev !== site.rev) {
    const ids = new Set(site.items.map((i) => i.id))
    if (known.site === site && lively) {
      const fresh = site.items.filter((i) => !known.ids.has(i.id) && ITEMS[site.kind][i.kind])
      if (fresh.length && fresh.length <= WAVE_MAX) {
        fresh.forEach((i, k) => dropWait.current.set(i.id, k * Math.min(0.05, 0.6 / fresh.length)))
        setDropping(new Set([...dropping, ...fresh.map((i) => i.id)]))
      }
    }
    setKnown({ site, rev: site.rev, ids })
  }
  const lastItems = useRef(site.items)
  useEffect(() => {
    // a puff where something was sold and carted away
    if (lively) {
      const now = new Set(site.items.map((i) => i.id))
      const gone = lastItems.current.filter((i) => !now.has(i.id) && ITEMS[site.kind][i.kind])
      if (gone.length <= WAVE_MAX) {
        for (const item of gone) {
          const def = ITEMS[site.kind][item.kind]
          const turned = item.rot % 2 === 1
          sparks.puff(item.x - w / 2 + (turned ? def.h : def.w) / 2, item.y - h / 2 + (turned ? def.w : def.h) / 2, Math.max(def.w, def.h) * 0.45, gone.length > 6 ? 5 : 8)
        }
      }
    }
    lastItems.current = site.items.slice()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev])

  // ---- walls rise when a room is built and crumble when it is knocked down
  const snap = useMemo(() => snapshot(site), [site, site.rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const [standing, setStanding] = useState(snap)
  const [wallFx, setWallFx] = useState<{ pieces: WallPiece[]; falling: boolean; then: Site; id: number } | null>(null)
  const fxId = useRef(0)
  useLayoutEffect(() => {
    if (snap === standing) return
    const changes = lively && mode !== 'full' && standing.kind === snap.kind && standing.w === snap.w ? wallChanges(standing, snap) : { rise: [], fall: [] }
    const n = changes.rise.length + changes.fall.length
    if (!n || n > 500) {
      setWallFx(null)
      setStanding(snap)
    } else if (changes.rise.length) {
      // keep the old walls standing while the new ones come up, then swap the real ones in
      setWallFx({ pieces: changes.rise, falling: false, then: snap, id: ++fxId.current })
    } else {
      setStanding(snap)
      setWallFx({ pieces: changes.fall, falling: true, then: snap, id: ++fxId.current })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap])

  // items grouped into blocks of floor, so a change only rebuilds the block it is in
  const glowKey = Math.round(M.glow * 10)
  const chunks = useMemo(() => {
    const map = new Map<string, { key: string; items: { item: SiteItem; index: number }[] }>()
    site.items.forEach((item, index) => {
      if (!ITEMS[site.kind][item.kind] || dropping.has(item.id)) return
      const key = `${Math.floor(item.x / CHUNK)},${Math.floor(item.y / CHUNK)}`
      let c = map.get(key)
      if (!c) map.set(key, (c = { key, items: [] }))
      c.items.push({ item, index })
    })
    return [...map.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev, dropping])

  // when the light changes, the lamps and screens come on one block of furniture at a time rather than all in
  // one long pause: each block remembers the glow it was last built with and catches up in turn
  const lit = useRef(new Map<string, number>())
  const [, relight] = useState(0)
  for (const c of chunks) if (!lively || !lit.current.has(c.key)) lit.current.set(c.key, M.glow)
  const stale = chunks.find((c) => lit.current.get(c.key) !== M.glow)?.key
  useEffect(() => {
    if (stale === undefined) return
    const id = window.setTimeout(() => {
      lit.current.set(stale, M.glow)
      relight((n) => n + 1)
    }, 70)
    return () => window.clearTimeout(id)
  }, [stale, M.glow])

  const running = !!line?.running && producing
  const productKey = products.map((p) => p.id).join('.')
  const soldOut = life?.store?.soldOut
  const soldKey = soldOut ? [...soldOut].join('.') : ''
  const liveKinds = lively && site.kind === 'office'
  const ctxFor = (item: { id?: string; kind: string }, seed: number, flow?: [number, number], glow = M.glow): ItemCtx => {
    const on = shown.get(item.id ?? '')
    return {
      who: item.id ? occupant.get(item.id) : undefined,
      on: !!item.id && liveSeats.has(item.id),
      live: site.kind === 'factory' ? crowdOn : liveKinds && (item.kind === 'server' || item.kind === 'helpdesk' || item.kind === 'screen' || item.kind === 'showcase'),
      glow,
      company,
      logo,
      color,
      seed,
      devices: site.kind !== 'office' ? undefined : on ? on.devices : item.kind === 'showcase' ? showcaseList.slice(0, 1) : undefined,
      progress: on?.progress,
      busy: item.kind === 'bench' && office ? researching : undefined,
      products,
      soldOut,
      running: !!item.id && (line?.linked.has(item.id) ?? false) && running,
      flow,
      show: staged,
      fill: Math.round(busy * 5) / 5,
      away: !!item.id && yard.managed.has(item.id),
      aisles: site.kind === 'venue' && 'x' in item ? seatAisles(site, item as SiteItem) : 0,
    }
  }
  const sigOf = (items: { item: SiteItem }[], glow: number) =>
    items
      .map(({ item }) => {
        const who = occupant.get(item.id)
        const on = shown.get(item.id)
        return `${item.id}:${item.x},${item.y},${item.rot}:${who ? who.look + who.color : liveSeats.has(item.id) ? 'L' : ''}:${line?.linked.has(item.id) ? 1 : 0}${line?.flow.get(item.id)?.join('') ?? ''}${on ? on.devices.map((p) => p.id).join('') + (on.progress ?? '') : ''}${yard.managed.has(item.id) ? 'A' : ''}${site.kind === 'venue' ? seatAisles(site, item) || '' : ''}`
      })
      .join('|') + `#${Math.round(glow * 10)}${running ? 'r' : ''}${site.kind === 'factory' ? `${Math.round(busy * 5)}${crowdOn ? 'w' : ''}` : ''}${company}${logo?.length ?? 0}${color}${productKey}${soldKey}${liveKinds ? 'v' : ''}${researching ? 'R' : ''}${showcaseList[0]?.id ?? ''}${staged ? `s${staged.screen?.uuid ?? ''}` : ''}`

  const place = (item: SiteItem): [number, number, number] => {
    const def = ITEMS[site.kind][item.kind]
    const turned = item.rot % 2 === 1
    return [item.x - w / 2 + (turned ? def.h : def.w) / 2, 0, item.y - h / 2 + (turned ? def.w : def.h) / 2]
  }
  const flowOf = (item: SiteItem): [number, number] | undefined => {
    if (site.kind !== 'factory' || !line) return undefined
    const f = line.flow.get(item.id)
    if (!f) return undefined
    // world direction to the item's own frame
    const a = (item.rot * Math.PI) / 2
    return [Math.round(f[0] * Math.cos(a) - f[1] * Math.sin(a)), Math.round(f[0] * Math.sin(a) + f[1] * Math.cos(a))]
  }
  const model = (item: SiteItem, index: number, glow: number) => (
    <group key={item.id} position={place(item)} rotation-y={(-item.rot * Math.PI) / 2}>
      <ItemModel kind={site.kind} item={item.kind} c={ctxFor(item, Math.floor(hash(item.x * 13 + item.y * 7 + index) * 1000), flowOf(item), glow)} />
    </group>
  )

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
    return { x, y, fx, fy, edge: bay ? { ...edge, curve: bay.curve, bay: bay.bay } : edge }
  }

  /** The run of wall from where the wall tool went down to where the pointer is now. */
  const wallRun = (from: NonNullable<typeof drag>, to: NonNullable<typeof hover>): EdgeRun => {
    if (from.edge.curve !== undefined && from.edge.bay !== undefined) {
      // along a curved wall: every bay between the first and the last one the pointer has been on
      const c = site.curves?.[from.edge.curve]
      const bays = c ? bayRun(c, from.edge.bay, from.bay ?? from.edge.bay) : []
      return { curve: from.edge.curve, bays: bays.length ? bays : [from.edge.bay] }
    }
    const dx = to.x - from.x
    const dy = to.y - from.y
    if (!dx && !dy) return { edges: [{ x: from.edge.x, y: from.edge.y, side: from.edge.side }] }
    // the line keeps the way of the wall first pressed, unless the drag clearly runs the other way
    const flat = from.edge.side === 'n'
    const alongX = flat ? !(Math.abs(dy) >= 2 && Math.abs(dy) > Math.abs(dx)) : Math.abs(dx) >= 2 && Math.abs(dx) > Math.abs(dy)
    const edges: NonNullable<EdgeRun['edges']> = []
    if (alongX) {
      const line = flat ? from.edge.y : Math.round(from.fy)
      for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x++) edges.push({ x, y: line, side: 'n' })
    } else {
      const line = flat ? Math.round(from.fx) : from.edge.x
      for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y++) edges.push({ x: line, y, side: 'w' })
    }
    return { edges }
  }
  /** What the sell tool would take between two tiles: everything standing on the line. */
  const sellRun = (x0: number, y0: number, x1: number, y1: number): SiteItem[] => {
    const out = new Set<SiteItem>()
    for (const [x, y] of lineTiles(x0, y0, x1, y1)) {
      const item = itemAt(site, x, y)
      if (item) out.add(item)
    }
    return [...out]
  }

  // ---- cursor
  const preview = useMemo(() => {
    if (!hover || !tool) return null
    if (areaTool) {
      /** A whole courtyard, shown in its true shape: its open tiles and the corners its curved walls leave over. */
      const yard = (tiles: [number, number][], live = curveTiles(site)) => {
        const pocket = tiles.length ? pocketAt(site, tiles[0][0], tiles[0][1], live) : null
        return { good: tiles, bad: [] as [number, number][], curve: null, area: tiles.length, shapes: (pocket?.curved ?? []).flatMap((key) => live.get(key)?.shape.outside ?? []), note: { filled: true } as AreaNote }
      }
      if (filling) {
        const live = curveTiles(site)
        const pocket = pocketAt(site, hover.x, hover.y, live)
        const error = fillError(pocket)
        if (error || !pocket) return { good: [], bad: [[hover.x, hover.y]] as [number, number][], curve: null, area: 0, note: { error: error ?? '' } as AreaNote }
        return yard(pocket.tiles, live)
      }
      const from = anchor ?? [hover.x, hover.y]
      // a box that covers most of a curved courtyard takes the whole of it
      const plan = tool.type === 'room' && anchor && shape === 'rect' ? zonePlan(site, from[0], from[1], hover.x, hover.y, shape, opts) : null
      if (plan?.filled) return yard(plan.tiles)
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
      // one where the pointer is, or a row from where the button went down
      const spots = (drag ? rowSpots(def, drag.x, drag.y, hover.x, hover.y, tool.rot) : ([[hover.x, hover.y]] as [number, number][])).map(([x, y]) => ({ x, y, ok: !canPlace(site, tool.kind, x, y, tool.rot) }))
      const good = spots.filter((s) => s.ok).flatMap((s) => tilesOf(def, s.x, s.y, tool.rot))
      const bad = spots.filter((s) => !s.ok).flatMap((s) => tilesOf(def, s.x, s.y, tool.rot).filter(([x, y]) => inPlot(site, x, y)))
      const count = spots.filter((s) => s.ok).length
      return { good, bad, spots, run: { tool: 'item' as const, count, blocked: spots.length - count, cost: count * def.cost } }
    }
    if (tool.type === 'remove') {
      const items = drag ? sellRun(drag.x, drag.y, hover.x, hover.y) : sellRun(hover.x, hover.y, hover.x, hover.y)
      const good = items.flatMap((it) => tilesOf(ITEMS[site.kind][it.kind], it.x, it.y, it.rot))
      const line = drag ? lineTiles(drag.x, drag.y, hover.x, hover.y) : ([[hover.x, hover.y]] as [number, number][])
      const taken = new Set(good.map(([x, y]) => `${x},${y}`))
      return { good, bad: line.filter(([x, y]) => !taken.has(`${x},${y}`)), items, run: { tool: 'remove' as const, count: items.length, blocked: 0, cost: items.reduce((a, it) => a + ITEMS[site.kind][it.kind].cost / 2, 0) } }
    }
    if (tool.type === 'rotate') {
      const target = itemAt(site, hover.x, hover.y)
      const tiles = target ? tilesOf(ITEMS[site.kind][target.kind], target.x, target.y, target.rot) : ([[hover.x, hover.y]] as [number, number][])
      return target ? { good: tiles, bad: [] } : { good: [], bad: tiles }
    }
    if (tool.type === 'edge') {
      const run = drag ? wallRun(drag, hover) : hover.edge.bay !== undefined ? { curve: hover.edge.curve, bays: [hover.edge.bay] } : { edges: [{ x: hover.edge.x, y: hover.edge.y, side: hover.edge.side }] }
      const c = run.curve !== undefined ? site.curves?.[run.curve] : undefined
      // each stretch: a wall that would change, one that is already so, or no wall at all
      const spare = keepsDoors(tool.kind, (run.edges?.length ?? 0) + (run.bays?.length ?? 0))
      const kept = (now: string) => now === tool.kind || (spare && now === 'door')
      // a door or an opening needs its whole metre: a stretch a curved wall cuts short cannot take one
      const way = tool.kind === 'door' || tool.kind === 'open'
      const live = way && site.curves?.length ? curveTiles(site) : undefined
      const edges = (run.edges ?? []).map((e) => {
        const wall = isBoundary(site, e.x, e.y, e.side)
        const short = wall && !!live && !doorFits(site, e.x, e.y, e.side, live)
        const now = wallAt(site, e.x, e.y, e.side)?.kind ?? 'wall'
        return { ...e, ok: wall && !short, short, same: kept(now), door: now === 'door' }
      })
      const bays = (run.bays ?? []).map((bay) => ({ bay, ok: bayStands(site, run.curve!, bay), same: kept(c?.walls?.[bay] ?? 'wall'), door: c?.walls?.[bay] === 'door' }))
      const count = edges.filter((e) => e.ok && !e.same).length + bays.filter((b) => b.ok && !b.same).length
      const left = spare ? edges.filter((e) => e.ok && e.door).length + bays.filter((b) => b.ok && b.door).length : 0
      return { good: [], bad: [], wall: { run, edges, bays }, run: { tool: 'edge' as const, count, blocked: edges.filter((e) => !e.ok).length + bays.filter((b) => !b.ok).length, cost: count * EDGE_COST[tool.kind], kept: left, short: edges.filter((e) => e.short).length } }
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover?.x, hover?.y, hover?.edge.x, hover?.edge.y, hover?.edge.side, hover?.edge.bay, hover?.edge.curve, anchor, drag, tool, site, site.rev, areaTool, shape, filling, optsKey])

  // ---- a tool being dragged: say what it would do, and do it when the button comes up
  const runInfo = drag && preview && 'run' in preview && preview.run ? preview.run : null
  const runKey = runInfo ? `${runInfo.tool}|${runInfo.count}|${runInfo.blocked}|${runInfo.cost}|${runInfo.kept ?? 0}|${runInfo.short ?? 0}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onRun?.(runInfo), [runKey, onRun])
  const finish = useRef<() => void>(() => {})
  finish.current = () => {
    if (!drag) return
    setDrag(null)
    if (!hover || !tool) return
    if (tool.type === 'item') onRow?.(drag.x, drag.y, hover.x, hover.y)
    else if (tool.type === 'edge') onEdges?.(wallRun(drag, hover))
    else if (tool.type === 'remove') {
      const ids = sellRun(drag.x, drag.y, hover.x, hover.y).map((i) => i.id)
      if (ids.length) onSell?.(ids)
    }
  }
  const dragging = !!drag
  useEffect(() => {
    if (!dragging) return
    // the button may come up anywhere, on the plot or off it
    const up = (e: PointerEvent) => e.button === 0 && finish.current()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragging])

  const previewCount = areaTool && (anchor || filling) && preview ? ('area' in preview && preview.area !== undefined ? preview.area : preview.good.length) : 0
  const areaNote = areaTool && preview && 'note' in preview ? preview.note : undefined
  const noteKey = areaNote ? `${areaNote.filled ? 1 : 0}|${areaNote.error ?? ''}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onPreview?.(previewCount, areaNote), [previewCount, noteKey, onPreview])

  // the tint over a picked room, and over rooms with no way in, follows slanted and curved walls
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const roomFloor = useMemo(() => floorOf(site, new Set(selectedRoom ? [selectedRoom] : [])), [site, site.rev, selectedRoom])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sealedFloor = useMemo(() => floorOf(site, new Set(sealed ?? [])), [site, site.rev, sealed?.join(',')])

  // the item itself, shown where it would go: one under the pointer, or every one of a row being dragged out,
  // as it will stand where it can go and in the warning colour where it cannot
  let ghost: React.ReactNode = null
  if (hover && tool?.type === 'item' && ITEMS[site.kind][tool.kind] && preview && 'spots' in preview && preview.spots) {
    const def = ITEMS[site.kind][tool.kind]
    const turned = tool.rot % 2 === 1
    const fw = turned ? def.h : def.w
    const fh = turned ? def.w : def.h
    ghost = (
      <RowGhosts key={tool.kind} spots={preview.spots} rot={tool.rot} ox={-w / 2 + fw / 2} oz={-h / 2 + fh / 2} warn={neg}>
        <ItemModel kind={site.kind} item={tool.kind} c={ctxFor({ kind: tool.kind }, 7)} />
      </RowGhosts>
    )
  }

  // every stretch of wall the wall tool would change: straight edges as boxes, curved bays in their own shape
  let edgeCursor: React.ReactNode = null
  if (hover && tool?.type === 'edge' && preview && 'wall' in preview && preview.wall) {
    const eh = mode === 'cut' ? CUT_H : STOREY - 0.1
    const tone = (ok: boolean, same: boolean) => (!ok ? neg : same ? '#9aa0a6' : accent)
    edgeCursor = (
      <>
        {preview.wall.bays.map((b) => (
          <BayCursor key={b.bay} site={site} curve={preview.wall.run.curve!} bay={b.bay} height={eh} color={tone(b.ok, b.same)} />
        ))}
        {preview.wall.edges.map((e) => (
          <mesh key={`${e.x},${e.y},${e.side}`} position={[e.x - w / 2 + (e.side === 'n' ? 0.5 : 0), eh / 2 + 0.02, e.y - h / 2 + (e.side === 'w' ? 0.5 : 0)]} rotation={[0, e.side === 'w' ? Math.PI / 2 : 0, 0]} renderOrder={6}>
            <boxGeometry args={[1, eh + 0.06, WALL_T + 0.06]} />
            <meshBasicMaterial color={tone(e.ok, e.same)} transparent opacity={e.ok && e.same ? 0.25 : 0.45} depthWrite={false} />
          </mesh>
        ))}
      </>
    )
  }
  // while a tool is being dragged, a tag at the pointer says how many and how much
  const runTag =
    hover && runInfo && (runInfo.count > 1 || runInfo.blocked > 0) ? (
      <Html position={[hover.x - w / 2 + 0.5, mode === 'cut' ? 1.7 : STOREY + 0.4, hover.y - h / 2 + 0.5]} center zIndexRange={[30, 20]} style={{ pointerEvents: 'none' }}>
        <div className="pointer-events-none -translate-y-full whitespace-nowrap border border-accent bg-panel/95 px-2 py-[3px] text-center">
          <div className="num text-[11px] text-fg">
            {runInfo.count} x {runInfo.tool === 'remove' ? '+' : ''}
            {fmtMoney(runInfo.cost)}
          </div>
          {runInfo.blocked > 0 && <div className="text-[10px] text-neg">{runInfo.blocked} cannot go</div>}
        </div>
      </Html>
    ) : null

  // ---- what the rooms say, and what can be clicked
  const places = useMemo(() => (lively && site.kind === 'office' && mode !== 'full' ? boardPlaces(site, BOARD_ROOMS) : []), [site, site.rev, lively, mode]) // eslint-disable-line react-hooks/exhaustive-deps
  const meetingTables = useMemo(() => site.items.filter((i) => i.kind === 'meeting'), [site, site.rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const led = office?.teams.filter((t) => t.leadId && t.members.length >= 2) ?? []
  /** Which of several rooms of one kind this is, so two labs show two different projects. */
  const nth = (roomN: number, type: string) => site.rooms.filter((r) => r.type === type).findIndex((r) => r.n === roomN)

  const meetingText = (roomN: number) => (): BoardText => {
    const hour = hourOf(campus.t)
    const here = meetingTables.map((t, i) => ({ t, i })).filter(({ t }) => gridAt(site, t.x, t.y) === roomN)
    if (!here.length) return { title: 'Meeting room', line: 'No table yet', tone: 'dim' }
    if (!led.length) return { title: 'Meeting room', line: 'No teams with a lead', sub: 'Set up teams under Staff', tone: 'dim' }
    let next: { name: string; start: number } | null = null
    for (let k = 0; k < led.length; k++) {
      const slot = meetingSlot(k, meetingTables.length)
      if (!here.some((x) => x.i === slot.table)) continue
      if (hour >= slot.start && hour < slot.end) return { title: 'Meeting now', line: `${led[k].name} team`, sub: led[k].lead ? `Led by ${led[k].lead}, until ${fmtHour(slot.end)}` : undefined, bar: (hour - slot.start) / (slot.end - slot.start), tone: 'accent' }
      if (slot.start > hour && (!next || slot.start < next.start)) next = { name: led[k].name, start: slot.start }
    }
    return next ? { title: 'Meeting room', line: 'Free', sub: `Next: ${next.name} team at ${fmtHour(next.start)}`, tone: 'pos' } : { title: 'Meeting room', line: 'Free', sub: 'No more meetings today', tone: 'dim' }
  }

  const roomText = (type: string, roomN: number): BoardText | (() => BoardText) => {
    const o = office!
    const k = Math.max(0, nth(roomN, type))
    switch (type) {
      case 'lab': {
        if (!o.research.length) return { title: 'Research', line: 'No project running', sub: 'Click to choose one', tone: 'dim' }
        const r = o.research[k % o.research.length]
        return { title: `Research ${o.research.length > 1 ? `${(k % o.research.length) + 1} of ${o.research.length}` : ''}`, line: r.name, bar: r.progress, sub: o.budget <= 0 ? 'No budget: nothing is being spent' : r.daysLeft !== undefined ? `${Math.round(r.progress * 100)}% done, about ${r.daysLeft} days left` : `${Math.round(r.progress * 100)}% done`, tone: o.budget <= 0 ? 'warn' : 'pos' }
      }
      case 'eng':
      case 'studio': {
        if (!o.dev.length) return o.chip && type === 'eng' ? { title: 'Chip project', line: o.chip.name, sub: `${o.chip.daysLeft} days to go`, tone: 'accent' } : { title: type === 'eng' ? 'Workshop' : 'Design studio', line: 'Nothing in development', sub: 'Design a new device to start', tone: 'dim' }
        const d = o.dev[k % o.dev.length]
        return { title: type === 'eng' ? 'In development' : 'Being designed', line: d.product.name, bar: d.progress, sub: `Release in ${d.daysLeft} days`, tone: 'accent' }
      }
      case 'media':
        if (!o.campaigns.length) return { title: 'Campaigns', line: 'Nothing running', sub: 'Click to plan one', tone: 'dim' }
        return { title: `Campaigns running: ${o.campaigns.length}`, line: o.campaigns[k % o.campaigns.length].channel, rows: o.campaigns.slice(0, 2).map((c) => `${c.target}  ${fmtMoney(c.monthly)}/mo`), tone: 'accent' }
      case 'support': {
        const s = o.support
        return { title: 'Support lines', line: `${Math.round(s.tickets).toLocaleString()} tickets a day`, bar: Math.min(1, s.load), sub: s.load >= 1 ? `Overloaded: the team can answer ${Math.round(s.capacity).toLocaleString()}` : `The team can answer ${Math.round(s.capacity).toLocaleString()}`, tone: s.load >= 1 ? 'neg' : s.load >= 0.75 ? 'warn' : 'pos' }
      }
      case 'server':
      case 'soft': {
        const os = o.os
        if (os.project) return { title: os.own ? `${os.name} ${os.version + 1}` : `${os.name} 1`, line: 'Next version in the works', bar: os.project.progress, sub: `${os.project.daysLeft} days to go`, tone: 'accent' }
        if (!os.own) return { title: 'Software', line: 'Running stock software', sub: 'Start your own system under Labs', tone: 'dim' }
        return { title: `${os.name} ${os.version}`, line: os.quality >= os.industry ? 'Ahead of the industry' : 'Behind the industry', sub: os.services > 0 ? `Services earn ${fmtMoney(os.services)} a month` : `Quality ${Math.round(os.quality)} against ${Math.round(os.industry)}`, tone: os.quality >= os.industry ? 'pos' : 'warn' }
      }
      case 'meeting':
        return meetingText(roomN)
    }
    return { title: type, line: '', tone: 'dim' }
  }

  const targets = useMemo(() => {
    const out: Target[] = []
    if (!lively) return out
    const boardTarget = (p: BoardPlace, kind: Target['kind'], label: string, hint?: string, id?: string) => {
      const box = boardBox(p, cut)
      out.push({ key: `board:${p.room}`, kind, id, label, hint, box, anchor: [p.x, boardY(cut) + 0.3, p.z] })
    }
    if (site.kind === 'office' && office) {
      const o = office
      const researchHint = o.research.length ? o.research.map((r) => r.name).join(', ') : 'Nothing being researched'
      const devHint = o.dev.length ? `${o.dev.length} in development` : 'Nothing in development'
      const campaignAt = (k: number) => (o.campaigns.length ? o.campaigns[k % o.campaigns.length] : undefined)
      let mediaN = 0
      for (const item of site.items) {
        const room = roomOf(site, gridAt(site, item.x, item.y))?.type
        const owner = owners.get(item.id)
        switch (item.kind) {
          case 'bench':
            out.push(itemTarget(site, item, 'research', 'Lab bench', researchHint))
            break
          case 'devrig':
          case 'design': {
            const on = shown.get(item.id)
            const p = on?.devices[0]
            const d = p && o.dev.find((x) => x.product.id === p.id)
            out.push(itemTarget(site, item, 'product', item.kind === 'devrig' ? 'Test rig' : 'Design table', p ? (d ? `${p.name}: ${Math.round(d.progress * 100)}% developed` : p.name) : devHint, p?.id))
            break
          }
          case 'showcase':
            out.push(itemTarget(site, item, 'product', 'Showcase', showcaseList.length ? 'Your devices on show' : 'Nothing to show yet', showcaseList[0]?.id))
            break
          case 'media': {
            const c = campaignAt(mediaN++)
            out.push(itemTarget(site, item, 'campaign', 'Media set', c ? `${c.channel}: ${c.target}` : 'No campaign running', c?.id))
            break
          }
          case 'screen':
            if (room === 'media') {
              const c = campaignAt(mediaN++)
              out.push(itemTarget(site, item, 'campaign', 'Campaign screen', c ? `${c.channel}: ${c.target}` : 'No campaign running', c?.id))
            } else if (room === 'support') out.push(itemTarget(site, item, 'support', 'Support wallboard', `${Math.round(o.support.tickets)} tickets a day`))
            else if (room === 'meeting' || room === 'exec') out.push(itemTarget(site, item, 'team', 'Meeting screen', `${led.length} teams meet here`))
            else out.push(itemTarget(site, item, 'os', 'Software screen', o.os.own ? `${o.os.name} ${o.os.version}` : 'Stock software'))
            break
          case 'reception':
            out.push(itemTarget(site, item, 'applicants', 'Reception', o.applicants ? `${o.applicants} applicants to see` : 'Nobody waiting'))
            break
          case 'server':
            out.push(itemTarget(site, item, 'os', 'Server rack', o.os.own ? `${o.os.name} ${o.os.version}` : 'Stock software'))
            break
          case 'meeting':
            out.push(itemTarget(site, item, 'team', 'Meeting table', led.length ? `${led.length} teams meet here` : 'No teams with a lead yet'))
            break
          default:
            if (owner) {
              const t = itemTarget(site, item, 'person', owner.name, `${jobTitle(owner)}${inTraining(owner, day) ? ', away on a course' : liveSeats.has(item.id) ? ': their desk' : ''}`, owner.id)
              // a live person takes the click themselves; their empty desk still answers for them
              if (liveSeats.has(item.id)) t.box[4] = 0.8
              out.push(t)
            } else if (item.kind === 'helpdesk') out.push(itemTarget(site, item, 'support', 'Support console', `${Math.round(o.support.tickets)} tickets a day`))
        }
      }
      for (const p of places) {
        if (p.type === 'lab') boardTarget(p, 'research', 'Research screen', researchHint)
        else if (p.type === 'eng' || p.type === 'studio') boardTarget(p, 'product', 'Development screen', devHint, o.dev[Math.max(0, nth(p.room, p.type)) % Math.max(1, o.dev.length)]?.product.id)
        else if (p.type === 'media') boardTarget(p, 'campaign', 'Campaign screen', o.campaigns.length ? `${o.campaigns.length} running` : 'No campaign running')
        else if (p.type === 'support') boardTarget(p, 'support', 'Support screen', `${Math.round(o.support.tickets)} tickets a day`)
        else if (p.type === 'server' || p.type === 'soft') boardTarget(p, 'os', 'Software screen', o.os.own ? `${o.os.name} ${o.os.version}` : 'Stock software')
        else if (p.type === 'meeting') boardTarget(p, 'team', 'Meeting room screen', `${led.length} teams meet here`)
      }
    } else if (site.kind === 'factory' && life?.factory) {
      const f = life.factory
      const open = f.orders.length
      for (const item of site.items) {
        if (item.kind === 'dock_out' || item.kind === 'dock_in') out.push(itemTarget(site, item, 'orders', item.kind === 'dock_out' ? 'Shipping dock' : 'Receiving dock', open ? `${open} production ${open === 1 ? 'order' : 'orders'} open` : 'No orders'))
        else if (item.kind === 'test') out.push(itemTarget(site, item, 'quality', 'Test station', f.line?.running ? `${(f.line.defectRate * 100).toFixed(1)}% of units ship faulty` : 'Line not running'))
      }
    } else if (site.kind === 'venue' && life?.venue) {
      const v = life.venue
      const next = v.upcoming.find((e) => e.here)
      const when = next ? `${next.product ?? 'A keynote'} in ${next.daysLeft} ${next.daysLeft === 1 ? 'day' : 'days'}` : 'No show booked here'
      for (const item of site.items) {
        const def = ITEMS.venue[item.kind]
        const tall = VENUE_TALL[item.kind]
        if (!def || !tall) continue
        const hint = def.crowd ? `${def.crowd} seats of ${v.stats.seats}` : item.kind === 'stage' ? when : def.show ? `Production +${def.show}` : when
        const t = itemTarget(site, item, 'venue', def.name, hint, item.kind)
        t.box[4] = tall
        t.anchor[1] = Math.min(tall, 2.6) + 0.1
        out.push(t)
      }
    } else if (site.kind === 'store' && life?.store) {
      const st = life.store
      for (const item of site.items) {
        if (item.kind === 'counter') out.push(itemTarget(site, item, 'takings', 'Checkout', `${Math.round(st.perDay)} sold a day`))
        else if (item.kind === 'table' || item.kind === 'demo') {
          const p = st.products.length ? st.products[0] : undefined
          out.push(itemTarget(site, item, 'product', item.kind === 'table' ? 'Display table' : 'Demo pod', st.products.length ? (st.soldOut.size ? `${st.soldOut.size} sold out` : `${st.products.length} devices on show`) : 'Nothing on sale', p?.id))
        }
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev, life, lively, places, owners, shown, liveSeats, cut, day])

  const [hot, setHot] = useState<Hover | null>(null)
  const hotRef = useRef<Hover | null>(null)
  const [open, setOpen] = useState<Target | null>(null)
  const consumed = useRef(0)
  const onHover = (hv: Hover | null) => {
    hotRef.current = hv
    setHot(hv)
  }
  const onPick = (hv: Hover) => {
    if (hv.target.kind === 'person' && hv.target.id) {
      setOpen(null)
      onPerson?.(hv.target.id)
    } else setOpen(open?.key === hv.target.key ? null : hv.target)
  }
  // cards belong to the calm view: picking up a tool puts them away
  useEffect(() => {
    if (tool) setOpen(null)
  }, [tool])
  useEffect(() => {
    document.body.style.cursor = hot && !tool ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hot, tool])

  const venueStage = site.kind === 'venue' ? site.items.find((i) => i.kind === 'stage') : undefined
  const stage = show?.presenter ? venueStage : undefined
  const sun: [number, number, number] = [M.sunDir[0] * span * 1.4, M.sunDir[1] * span * 1.4, M.sunDir[2] * span * 1.4]
  const far = span * 7 + 420
  const near = Math.min(1.5, Math.max(0.4, span / 40))
  const reach = Math.max(14, span * 0.8)
  const height = mode === 'full' ? site.floors * STOREY : 0
  const home = useMemo<[number, number, number]>(() => [span * 0.75, span * 0.95 + height, span * 1.2 + 6], [span, height])
  // with a tool that paints as it is dragged, the left button is the tool's: the middle one turns the view instead
  const mouseButtons = useMemo(() => ({ LEFT: dragTool ? (-1 as THREE.MOUSE) : THREE.MOUSE.ROTATE, MIDDLE: dragTool ? THREE.MOUSE.ROTATE : THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }), [dragTool])
  const touches = useMemo(() => ({ ONE: dragTool ? (-1 as THREE.TOUCH) : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }), [dragTool])
  const shadowSig = `${site.rev}|${standing.rev}|${dropping.size}|${mood}|${mode}|${seated.length}|${liveSeats.size}|${day > 0 ? Math.floor(day / 30) : 0}|${show ? show.crowd.toFixed(1) + show.cheer : ''}|${glowKey}`
  return (
    <Canvas shadows={Q.shadows > 0} dpr={[1, Q.dpr]} camera={{ fov: 30, near, far, position: home }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: dark ? 1.25 : 1, powerPreference: 'high-performance' }}>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, span * 3 + 80, far * 0.9]} />
      <hemisphereLight args={[dark ? '#6a7fa8' : '#fff4e6', dark ? '#14161c' : '#4a4338', M.hemi + (dark ? 0.35 : 0)]} />
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
      {/* a venue is lit from the stage outward */}
      {mood !== 'day' && site.kind === 'venue' && <pointLight position={venueStage ? [venueStage.x - w / 2 + 3, 9, venueStage.y - h / 2 + 7] : [0, 9, 0]} color="#ffe2bd" intensity={(mood === 'night' ? 9 : 4) * span} distance={span * 2} decay={1.2} />}
      <Environment resolution={128} frames={1} environmentIntensity={dark ? 0.12 : 0.4}>
        <color attach="background" args={[sky]} />
        <Lightformer form="rect" intensity={3} color="#fff1e0" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#cfe0ff" position={[-8, 2, 0]} scale={[4, 6, 1]} target={[0, 0, 0]} />
      </Environment>

      <Environs env={tier.env} w={w} h={h} mood={mood} />
      <Ground site={site} dim={indoor ? M.ground : mood === 'night' ? 0.6 : mood === 'dusk' ? 0.85 : 1} />
      <Structure site={standing} mode={mode} glow={mood === 'day' ? 0 : M.glow * 0.6} leaves={false} dark={mode === 'cut' ? undefined : darkRooms} />

      {/* invisible pick surface over the whole plot */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0.005, 0]}
        onPointerMove={(e) => {
          const t = locate(e)
          if (!hover || hover.x !== t.x || hover.y !== t.y || hover.edge.x !== t.edge.x || hover.edge.y !== t.edge.y || hover.edge.side !== t.edge.side || hover.edge.bay !== t.edge.bay || hover.edge.curve !== t.edge.curve) setHover({ x: t.x, y: t.y, edge: t.edge })
          // a drag along a curved wall runs to the last bay of that wall the pointer was on
          if (drag && drag.edge.curve !== undefined && t.edge.curve === drag.edge.curve && t.edge.bay !== undefined && t.edge.bay[0] === drag.edge.bay?.[0] && t.edge.bay !== drag.bay) setDrag({ ...drag, bay: t.edge.bay })
        }}
        // a drag that wanders off the plot keeps its end where it left
        onPointerOut={() => !drag && setHover(null)}
        onPointerDown={(e) => {
          if (!dragTool || e.button !== 0) return
          const t = locate(e)
          setHover({ x: t.x, y: t.y, edge: t.edge })
          setDrag({ x: t.x, y: t.y, fx: t.fx, fy: t.fy, edge: t.edge, bay: t.edge.bay })
        }}
        onClick={(e) => {
          // tools that paint as they are dragged act when the button comes up, wherever that is
          if (dragTool) return
          if (e.delta > 5) return
          // something standing on the floor was clicked, not the floor itself
          if (performance.now() - consumed.current < 250) return
          const t = locate(e)
          if (filling) {
            // one click fills the courtyard under the pointer
            onArea?.(t.x, t.y, t.x, t.y, e.altKey)
          } else if (areaTool) {
            if (!anchor) setAnchor([t.x, t.y])
            else {
              onArea?.(anchor[0], anchor[1], t.x, t.y, e.altKey)
              setAnchor(null)
            }
          } else {
            if (open) setOpen(null)
            onTile?.(t.x, t.y, itemAt(site, t.x, t.y))
          }
        }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {chunks.map((chunk) => {
        const glow = lit.current.get(chunk.key) ?? M.glow
        return <Chunk key={chunk.key} sig={sigOf(chunk.items, glow)} render={() => chunk.items.map(({ item, index }) => model(item, index, glow))} />
      })}

      <Heartbeat
        onPulse={(p) => {
          pulse.current = p
        }}
      >
        {lively && <Day crowd={crowd} speed={speed} onTurn={onTurn} />}
        {crowd && <People crowd={crowd} cap={site.kind === 'store' ? cap : site.kind === 'venue' ? VENUE_WALKERS[prefs.quality] + 10 : cap + 8} neg={neg} />}
        {crowd instanceof FactoryCrowd && <Jacks crowd={crowd} />}
        {crowd && site.kind === 'office' && <DeskScreens site={site} items={liveDesks} crowd={crowd} glow={M.glow} />}
        {/* after dark the rooms are lit from within, the ones with people in them brightest */}
        <RoomLights site={site} crowd={crowd} mood={indoor && mood === 'night' ? 'dusk' : mood} lamps={site.kind === 'venue' ? 0 : ROOM_LAMPS[prefs.quality]} gain={site.kind === 'venue' ? 0.15 : indoor ? 0.5 : 1} busy={lively && site.kind === 'factory' && !crowd ? () => running : undefined} onDark={mode === 'cut' ? undefined : setDarkRooms} />
        {site.kind === 'venue' && <Audience site={site} state={houseState} filled={crowd ? filledSeat : undefined} />}
        {stage && !crowd && <Presenter site={site} cheer={!!show?.cheer} />}
        <SparksView sparks={sparks} />
        {site.items.map((item, index) =>
          dropping.has(item.id) && ITEMS[site.kind][item.kind] ? (
            <group key={item.id} position={place(item)} rotation-y={(-item.rot * Math.PI) / 2}>
              <Dropping
                delay={dropWait.current.get(item.id) ?? 0}
                x={place(item)[0]}
                z={place(item)[2]}
                size={Math.max(ITEMS[site.kind][item.kind].w, ITEMS[site.kind][item.kind].h)}
                sparks={sparks}
                onDone={() => {
                  dropWait.current.delete(item.id)
                  setDropping((cur) => {
                    const next = new Set(cur)
                    next.delete(item.id)
                    return next
                  })
                }}
              >
                <ItemModel kind={site.kind} item={item.kind} c={ctxFor(item, Math.floor(hash(item.x * 13 + item.y * 7 + index) * 1000), flowOf(item))} />
              </Dropping>
            </group>
          ) : null,
        )}
        {wallFx && (
          <WallFx
            key={wallFx.id}
            pieces={wallFx.pieces}
            falling={wallFx.falling}
            height={wallHeight(mode)}
            sparks={sparks}
            onDone={() => {
              setStanding(wallFx.then)
              setWallFx(null)
            }}
          />
        )}
        {/* every door has a leaf that swings, whichever way the building is being looked at */}
        <Doors site={standing} crowd={crowd} height={wallHeight(mode)} />
        {places.length > 0 && office && <RoomBoards places={places} cut={cut} text={(p) => roomText(p.type, p.room)} palette={palette} glow={M.glow} />}
        {office &&
          screens.map((item) => {
            const p = place(item)
            const a = (-item.rot * Math.PI) / 2
            const room = roomOf(site, gridAt(site, item.x, item.y))
            const type = room?.type === 'exec' ? 'meeting' : room?.type === 'work' ? 'soft' : (room?.type ?? 'soft')
            return <Face key={item.id} p={[p[0] + -0.296 * Math.sin(a), 1.45, p[2] - 0.296 * Math.cos(a)]} rotY={a} size={[1.74, 0.98]} text={roomText(type, room?.n ?? 0)} palette={palette} glow={M.glow} />
          })}
        {racks.length > 0 && office && <RackLights site={site} racks={racks} activity={Math.min(1, (office.os.project ? 0.6 : 0.15) + (office.os.services > 0 ? 0.3 : 0) + (speed ? 0.1 : 0))} />}
        {consoles.length > 0 && office && <CallLights site={site} consoles={consoles} load={office.support.load} palette={palette} />}
        {liveKinds && showcases.map((item, i) => <Showcase key={item.id} site={site} item={item} products={showcaseList} offset={i} />)}
        {office && <Celebrate count={office.researchDone} places={places} sparks={sparks} palette={palette} />}
        {site.kind === 'factory' && lively && life?.factory && <FactoryFloor site={site} life={life.factory} sparks={sparks} plan={yard} />}
        {lively && <Pointer enabled={!tool} targets={targets} crowd={crowd} titles={titles} hover={hotRef} onHover={onHover} onPick={onPick} consumed={consumed} />}
        {hot && !tool && hot.target.key !== open?.key && <HoverMark hover={hot} color={accent} />}
        {import.meta.env.DEV && <DevHandle pulse={pulse} crowd={crowd} />}
      </Heartbeat>
      {open && card && !tool && (
        <Html position={open.anchor} calculatePosition={cardPosition} zIndexRange={[40, 31]}>
          <Sized>{card(open, () => setOpen(null))}</Sized>
        </Html>
      )}

      {site.kind === 'store' && !crowdOn && <Shoppers spots={shopperSpots} count={Math.round(busy * shopperSpots.length)} />}

      {roomFloor.tiles.length + roomFloor.shapes.length > 0 && <Tint tiles={roomFloor.tiles} shapes={roomFloor.shapes} w={w} h={h} color={accent} opacity={0.16} y={0.014} inset={0} />}
      {sealedFloor.tiles.length + sealedFloor.shapes.length > 0 && <Tint tiles={sealedFloor.tiles} shapes={sealedFloor.shapes} w={w} h={h} color={neg} opacity={0.22} y={0.016} inset={0} />}
      {preview && preview.good.length > 0 && <Tint tiles={preview.good} shapes={'shapes' in preview ? preview.shapes : undefined} w={w} h={h} color={accent} opacity={ghost ? 0.22 : 0.45} inset={'shapes' in preview && preview.shapes ? 0 : undefined} />}
      {preview && preview.bad.length > 0 && <Tint tiles={preview.bad} w={w} h={h} color={neg} opacity={0.5} />}
      {preview && 'curve' in preview && preview.curve && <CurveOutline spec={preview.curve} w={w} h={h} color={accent} />}
      {ghost}
      {flags.map(({ item, color: c }) => {
        const def = ITEMS.office[item.kind]
        const turned = item.rot % 2 === 1
        return <Marker key={item.id} p={[item.x - w / 2 + (turned ? def.h : def.w) / 2, 1.75, item.y - h / 2 + (turned ? def.w : def.h) / 2]} color={c} />
      })}
      {edgeCursor}
      {runTag}

      {Q.shadows > 0 && <StaticShadows sig={shadowSig} />}
      {Q.ao && (
        <EffectComposer multisampling={4}>
          <N8AO halfRes aoRadius={0.8} distanceFalloff={1} intensity={mood === 'night' ? 1.2 : 2} quality="medium" />
        </EffectComposer>
      )}
      {!autoRotate && <CameraKeys span={span} home={home} />}
      <OrbitControls makeDefault target={[0, height * 0.35 + 0.5, 0]} minDistance={near * 6} maxDistance={span * 3 + 40} maxPolarAngle={Math.PI * 0.485} enablePan screenSpacePanning={false} panSpeed={1.3 * prefs.cameraSpeed} rotateSpeed={0.9 * prefs.cameraSpeed} zoomSpeed={1.2 * prefs.cameraSpeed} zoomToCursor={prefs.zoomToPointer} enableDamping dampingFactor={0.2} autoRotate={autoRotate} autoRotateSpeed={0.5} mouseButtons={mouseButtons} touches={touches} />
    </Canvas>
  )
}
