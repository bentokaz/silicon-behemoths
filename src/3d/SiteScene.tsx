// 3D view of a buildable site: the land around it, the rooms and walls, what
// stands in them, the people who use them, and the cursor for building.
import { Environment, Html, Lightformer, OrbitControls } from '@react-three/drei'
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { type ReactNode, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { AutoTurn, CameraFence, SafeCanvas, useShadingRelease } from './SafeCanvas'
import { type Pt, bayRun, bayStands, curveTiles, nearestBay } from '../sim/curves'
import { money, moneyDelta, num, pct } from '../components/format'
import { EDGE_COST, edgePrice, keepsDoors, partitionRun, roomCost, zonePlan } from '../sim/game'
import type { FactoryLife, OfficeLife, StoreLife, VenueLife } from '../sim/life'
import { turnPlan } from '../sim/game'
import { CLIMB, type Well, blankLevel, liftTop, ceilingAt, storeysOf, wellsOn, ITEMS, type LineStats, ROOMS, SITE_TIERS, type Shape, type ShapeOpts, areaOf, areaTiles, canPartition, canPlace, ceilingOf, curveFor, cutAt, doorFits, fillError, gridAt, inPlot, isBoundary, hasGround, isStage, itemAt, itemTiles, pocketAt, reachable, roomOf, rowSpots, stageOf, tilesOf, wallAt } from '../sim/sites'
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
import { Director, type Shot } from './site/director'
import { FactoryFlow } from './site/factoryflow'
import { FactoryFloor, shippingDocks } from './site/factorylife'
import { Jacks } from './site/jacks'
import { Doors, Dropping, Sparks, SparksView, WallFx, type WallPiece, snapshot, wallChanges, wallHeight } from './site/fx'
import { Baked, Bamboo, type Fit, type PersonLook, Sparing, Tree, hash, idSeed } from './site/kit'
import { DeskScreens, FrontSigns, RoomLights, StageLights } from './site/lights'
import { buildNav, cutOffRooms } from './site/nav'
import { OfficeItem } from './site/office'
import { type Target, itemBox, itemTarget, placeBeside, rayBox } from './site/pick'
import { seatOwners } from './site/seats'
import { buildSpots, seatAisles } from './site/spots'
import { Shoppers, StoreItem } from './site/store'
import { Batch, CUT_H, Ground, STOREY, Structure, type ViewMode, WALL_T, wallTop } from './site/structure'
import { Ceilings, Climb, Storeys, holesOn } from './site/storeys'
import { MeetingLife } from './site/MeetingLife'
import { meetingChains, tableJoins } from './site/meetings'
import { planKey } from './site/plankey'
import { type Flight, type LiftStop, Walk } from './site/walk'
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
  /** Turn the rooms in a box a quarter turn, with their walls and furniture. */
  | { type: 'turn'; shape: AreaShape; opts?: ShapeOpts }
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
  /** Item tool: places it would fit where the money does not reach. */
  poor?: number
  /** Item tool, pointing and not yet dragging: why the thing cannot stand where the pointer is. */
  why?: string
}

/** What the area tool would do where the pointer is, beyond how much ground it covers. */
export interface AreaNote {
  /** The room would take the whole courtyard: a box that covers half of it or more, or the fill tool. */
  filled?: boolean
  /** Open ground, in square metres, in the curved courtyard a box is being drawn in: half of this or more and the box takes it all. */
  yard?: number
  /** Metres of the plot's edge that close the courtyard the fill tool points at, where walls do not go all the way round. */
  rim?: number
  /** Why the tool cannot be used here: the ground is built on, the money is short, or (fill) it is not a courtyard. */
  error?: string
  /** A corner has been set: the next click builds. */
  anchored?: boolean
  /** Things standing on the ground that building here clears away and sells. */
  clears?: number
  /** Turning rooms: what it costs. */
  cost?: number
}

/** The store's month, projected to its end, for the plate over its tills. */
export interface MonthFigures {
  profit: number
  partial?: boolean
}

/** A research project in progress. */
export interface ResearchNow {
  name: string
  /** 0-1 of the way to done. */
  progress: number
  /** Days left at today's budget; null or missing when nothing is being spent. */
  daysLeft?: number | null
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

export interface SiteViewProps {
  site: Site
  /** Offices: the storey being built on, 0 for the ground floor. Floors under it are drawn beneath, those above are left off. */
  floor?: number
  mode: ViewMode
  mood: Mood
  tool: SiteTool
  company: string
  color: string
  logo?: string
  /** Room to outline, and rooms with no way in. */
  selectedRoom?: number
  sealed?: number[]
  /** A tile was clicked with no tool in hand. Return true to have the card of the room there opened beside the click. */
  onTile?: (x: number, y: number, item: SiteItem | undefined) => boolean | void
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
  /** The room under the pointer (0 for open ground), told whenever the pointer moves onto another one. */
  onHoverRoom?: (n: number) => void
  /** Walking: the walker went up or down to another storey. */
  onWalkFloor?: (floor: number) => void
  /** Walking: what a key does where the walker stands, or null. */
  onWalkHint?: (text: string | null) => void
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
  /** A keynote's camera script, read every frame: where the camera is and what it looks at; null leaves the view to the player. */
  director?: () => Shot | null
  /** A keynote: how far the presenter has walked on from the wings, 0-1, read every frame; null to stand at the lectern. */
  presenterWalk?: () => number | null
  /** Game speed (0 paused, 1, 2, 4): how fast the site's own clock runs. */
  speed?: number
  /** What the company is doing, shown in the rooms. Without it the site is a still model. */
  life?: SiteLife
  /** The card to show beside something that was clicked. */
  card?: (target: Target, close: () => void) => ReactNode
  /** Told how many rooms nobody can walk to from the street, though they have a door (it is blocked, or leads only to another such room). */
  onCutOff?: (rooms: number) => void
  /** What the player can spend right now: what a tool would cost more than this is shown as refused. */
  budget?: number
  /** A tool was clicked outside the plot. */
  onOff?: () => void
  /** Room in pixels that panels over the view take at its left, top, right and bottom: cards keep clear of them. */
  clear?: [number, number, number, number]
  /** Store: this month's figures, for the plate over the tills. */
  month?: MonthFigures | null
  /** Office: the projects being researched, as the Research screen names and counts them, for the plates over the labs. */
  research?: ResearchNow[]
  /** Told once the view has drawn its first frames. */
  onDrawn?: () => void
  /** Walk the site at eye height (see site/walk). The view asks for it to end through onWalkEnd: Esc, or the pointer let go. */
  walk?: boolean
  onWalkEnd?: () => void
}

const CHUNK = 8
/** People drawn walking about at each quality setting; the rest stay seated. */
const LIVE_CAP: Record<Quality, number> = { low: 24, medium: 60, high: 90 }
/**
 * A site with this many things on it is drawn sparingly at the middle quality setting (the lowest always is, the
 * highest never): once it is, it stays so until it has shrunk to the second figure, so that selling one desk does not
 * rebuild every model on the plot.
 */
const SPARING_AT = 700
const SPARING_UNTIL = 500
/** Guests drawn walking to their seats at a venue at each quality setting; the rest of the house is drawn seated. */
const VENUE_WALKERS: Record<Quality, number> = { low: 40, medium: 110, high: 180 }
/** Real lamps handed round the lit rooms after dark at each quality setting. */
const ROOM_LAMPS: Record<Quality, number> = { low: 3, medium: 5, high: 7 }
/** What a venue's fittings look like while a show (or a run-through) is on, before anyone has a picture for the screen. */
const ON_AIR: ShowState = { crowd: 0, cheer: false, presenter: false }
const STAGED: Phase[] = ['rehearsal', 'doors', 'show', 'ovation']
/** Heights of the things worth clicking at a venue, in metres. */
const VENUE_TALL: Record<string, number> = { stage: 1.95, screen: 5.4, lights: 6.6, speakers: 3.4, camera: 2.3, seats: 1.05, seats_mid: 1.6, seats_high: 2.3, demo: 1.0, reception: 1.16, logowall: 2.0 }
/** How tall things are to the pointer, where that is more than the usual pick height (see itemBox): what the sell and turn tools find when a click lands on their top. */
const PICK_TALL: Record<string, number> = { otree: 4.4, bamboo: 3.8, tree: 2.2, lamp: 3.4, flag: 6, sculpture: 1.6, sign: 1.6, fountain: 1.7, tank: 3, forklift: 2.2, truck: 3.6, rack: 2.4, stockrack: 2, lights: 6.6, speakers: 3.4, screen: 2, aquarium: 1.6, bookshelf: 2, vending: 1.9, arcade: 1.8, booth: 2.2, lockers: 1.9, stairs: 2.9, lift: 2.9 }
/** Rooms that get a status screen on the wall. */
const BOARD_ROOMS = new Set(['lab', 'eng', 'studio', 'media', 'support', 'server', 'meeting', 'soft'])

interface ItemCtx {
  /** Office meeting tables: joined to another at the left and right ends. */
  join?: [boolean, boolean]
  glow: number
  /** Venue: clear height of the hall the item stands in; missing in the open air. */
  ceiling?: number
  /** Factory: the machine's tier, and how many modules it has. */
  tier?: number
  mods?: number
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
  /** Built from fewer triangles: see Sparing. */
  sparing?: boolean
  /** Trees and bamboo: the room they have to grow in (see Fit). */
  fit?: Fit
}

/** The model for one placed item of any kind of site. */
function ItemModel({ kind, item, c }: { kind: SiteKind; item: string; c: ItemCtx }) {
  return (
    <Sparing.Provider value={!!c.sparing}>
      <ItemKind kind={kind} item={item} c={c} />
    </Sparing.Provider>
  )
}

function ItemKind({ kind, item, c }: { kind: SiteKind; item: string; c: ItemCtx }) {
  // plants that grow the same on every kind of site, and keep clear of the walls beside them
  if (item === 'otree') return <Tree seed={c.seed} fit={c.fit} />
  if (item === 'bamboo') return <Bamboo seed={c.seed} fit={c.fit} />
  // stairs, lifts and escalators look the same in every kind of building
  if (kind !== 'office' && (item === 'stairs' || item === 'lift' || item === 'escalator')) return <Climb kind={item} />
  if (kind === 'office') return <OfficeItem kind={item} c={{ who: c.who, glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed, devices: c.devices, on: c.on, live: c.live, progress: c.progress, busy: c.busy, join: c.join }} />
  if (kind === 'factory') return <FactoryItem kind={item} c={{ running: !!c.running, flow: c.flow, glow: c.glow, seed: c.seed, fill: c.fill, away: c.away, live: c.live, tier: c.tier, mods: c.mods }} />
  if (kind === 'store') return <StoreItem kind={item} c={{ products: c.products, glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed, soldOut: c.soldOut }} />
  return <VenueItem kind={item} c={{ glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed, crowd: c.show?.crowd ?? 0, cheer: c.show?.cheer ?? false, show: !!c.show, screen: c.show?.screen, products: c.products, aisles: c.aisles, live: c.live, ceiling: c.ceiling }} />
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
const keyOffset = new THREE.Vector3()
const keyForward = new THREE.Vector3()
const keyRight = new THREE.Vector3()
const keyMove = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const GROUND: [number, number, number] = [0, 0.5, 0]

export function CameraKeys({ span, home, aim = GROUND }: { span: number; home: [number, number, number]; aim?: [number, number, number] }) {
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
        controls.target.set(...aim)
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
  }, [camera, controls, home, aim])
  useFrame((_, dt) => {
    const h = held.current
    if (!h.size || !controls) return
    const speed = useSettings.getState().settings.cameraSpeed
    const step = Math.min(0.05, dt)
    const offset = keyOffset.copy(camera.position).sub(controls.target)
    const dist = offset.length()
    const forward = keyForward.set(-offset.x, 0, -offset.z).normalize()
    const right = keyRight.set(-forward.z, 0, forward.x)
    const move = keyMove.set(0, 0, 0)
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
    if (turn) offset.applyAxisAngle(UP, turn * 1.6 * step * speed)
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
      <div className="text-[11px] text-fg">{target.label}</div>
      {target.hint && <div className="text-[11px] normal-case tracking-normal text-dim">{target.hint}</div>}
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
const cardClear = { left: 8, top: 50, right: 8, bottom: 46 }
const cardPosition = (el: THREE.Object3D, camera: THREE.Camera, size: { width: number; height: number }): number[] => {
  pin.setFromMatrixPosition(el.matrixWorld).project(camera)
  return placeBeside((pin.x * 0.5 + 0.5) * size.width, (-pin.y * 0.5 + 0.5) * size.height, cardSize.x, cardSize.y, size.width, size.height, 'beside', 8, cardClear.top, cardClear.bottom, cardClear.left, cardClear.right)
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

/** Tells the door (SiteView) that the view is up: after the first frames have been drawn, shaders and all. */
function Drawn({ on }: { on?: () => void }) {
  const n = useRef(0)
  useFrame(() => {
    if (n.current < 3 && ++n.current === 3) on?.()
  })
  return null
}

/** The plot's edge, drawn while a building tool is in hand: this is where the land ends. */
function PlotEdge({ w, h, color }: { w: number; h: number; color: string }) {
  const geo = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w / 2, 0.03, -h / 2), new THREE.Vector3(w / 2, 0.03, -h / 2), new THREE.Vector3(w / 2, 0.03, h / 2), new THREE.Vector3(-w / 2, 0.03, h / 2)]), [w, h])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <lineLoop geometry={geo} renderOrder={6} userData={{ live: true }}>
      <lineBasicMaterial color={color} toneMapped={false} transparent opacity={0.9} depthWrite={false} />
    </lineLoop>
  )
}

/** A small sign over a place that says what is going on there: the project in a lab, the order on the line, a store's month. */
interface Plate {
  key: string
  at: [number, number, number]
  text: string
  figure?: string
  /** 0-1, drawn as a thin bar along the bottom. */
  bar?: number
  tone: 'accent' | 'pos' | 'warn' | 'neg' | 'dim'
  title: string
  target: Target
}
const PLATE_TONE = { accent: 'bg-accent', pos: 'bg-pos', warn: 'bg-warn', neg: 'bg-neg', dim: 'bg-mute' }
const PLATE_TEXT = { accent: 'text-fg', pos: 'text-pos', warn: 'text-warn', neg: 'text-neg', dim: 'text-dim' }

/** What is being researched, for the plates over the labs: the list the builder hands in (the Research screen's own), or failing that the sim's summary of the office. */
const researchOn = (o: OfficeLife, given?: ResearchNow[]): ResearchNow[] => given ?? o.research
const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

/** The way a staircase, an escalator or a lift faces on the plot: the way it rises (the item's own -Z). */
const RISE: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]
/** An item's middle on the plot, in the view's coordinates. */
function middleOf(site: Site, it: SiteItem): [number, number] {
  const d = ITEMS[site.kind][it.kind]
  const turned = it.rot % 2 === 1
  return [it.x + (turned ? d.h : d.w) / 2 - site.w / 2, it.y + (turned ? d.w : d.h) / 2 - site.h / 2]
}

export function SiteScene({ site: ground, floor = 0, mode: chosen, mood, tool, company, color, logo, selectedRoom, sealed, onTile, onRow, onEdges, onSell, onRun, onArea, onPreview, onHoverRoom, seated = [], idle = [], applicants, onPerson, day = 0, line, producing = false, products = [], busy = 0, show, autoRotate, director, presenterWalk, speed = 0, life, card, onCutOff, budget = Infinity, onOff, clear, month, research, onDrawn, walk = false, onWalkEnd, onWalkFloor, onWalkHint }: SiteViewProps) {
  /** The camera is the walker's: from the glide down to eye height until the glide back up. */
  const [walking, setWalking] = useState(false)
  // ---- an upper floor: its own plan, lifted to its height, with the floors under it drawn beneath
  // the floor just over the top one is bare until a room is built on it, which puts the floor up
  const blank = useMemo(() => (floor > (ground.upper?.length ?? 0) ? blankLevel(ground, floor) : undefined), [ground.w, ground.h, ground.tier, floor, ground.upper?.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const level = floor > 0 ? (ground.upper?.[floor - 1] ?? blank) : undefined
  /** The plan the view works on: what is built, picked and drawn with tools. */
  const site = level ?? ground
  const lift = level ? floor * STOREY : 0
  /** Where the stairs and lifts from the floors below come up through this one. */
  const wells = useMemo(() => (level ? wellsOn(ground, floor) : new Map<number, Well>()), [level, floor, ground, ground.rev, level?.rev]) // eslint-disable-line react-hooks/exhaustive-deps
  // ---- for the walker: the flights up from this floor and down from it, and the lifts that stop here
  const flights = useMemo<Flight[]>(() => {
    const out: Flight[] = []
    const floors = storeysOf(ground)
    const add = (plan: Site, up: boolean) => {
      for (const it of plan.items) {
        if (it.kind !== 'stairs' && it.kind !== 'escalator') continue
        const d = ITEMS[plan.kind][it.kind]
        const [cx, cz] = middleOf(plan, it)
        const [dx, dz] = RISE[it.rot % 4]
        out.push({ id: `${up ? 'u' : 'd'}${it.id}`, kind: it.kind, cx, cz, dx, dz, half: d.h / 2, width: d.w, up })
      }
    }
    const here = level ?? ground
    // a flight up leads somewhere only when there is a floor over it
    if (floor + 1 < floors.length) add(here, true)
    if (floor > 0 && floors[floor - 1]) add(floors[floor - 1], false)
    return out
  }, [ground, ground.rev, level, level?.rev, floor]) // eslint-disable-line react-hooks/exhaustive-deps
  const liftStops = useMemo<LiftStop[]>(() => {
    const out: LiftStop[] = []
    const floors = storeysOf(ground)
    floors.forEach((plan, m) => {
      if (m > floor) return
      for (const it of plan.items) {
        if (it.kind !== 'lift') continue
        const top = liftTop(floors, m, it)
        if (top < floor) continue
        const [cx, cz] = middleOf(plan, it)
        const [dx, dz] = RISE[it.rot % 4]
        out.push({ x: cx - dx * 1.4, z: cz - dz * 1.4, floors: Array.from({ length: top - m + 1 }, (_, i) => m + i) })
      }
    })
    return out
  }, [ground, ground.rev, floor, level?.rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const stairHoles = useMemo(() => new Set([...wells].filter(([, w]) => w.kind === 'stairs').map(([i]) => i)), [wells])
  // low cut walls are no use to someone walking about: the walls stand full height, under a roof if the outside was being shown;
  // a venue's hall is walked under its own roof, raised over the rigging; upstairs the outside is the floor's own walls, with no roof over them to hide the rooms
  const mode: ViewMode = walking ? (ground.kind === 'venue' ? 'full' : 'walls') : level && chosen === 'full' ? 'walls' : chosen
  /** An office of several storeys seen from outside: each floor is drawn as built, the ground floor one storey high, each with its roof over what is not built on above. */
  const stacked = mode === 'full' && !level && !!ground.upper?.some((l) => l.rooms.length)
  const endWalk = useCallback(() => onWalkEnd?.(), [onWalkEnd])
  const prefs = useSettings((s) => s.settings)
  const Q = QUALITY[prefs.quality]
  const shading = useShadingRelease()
  const { w, h } = site
  const crowded = useRef(false)
  crowded.current = site.items.length >= (crowded.current ? SPARING_UNTIL : SPARING_AT)
  const sparing = prefs.quality === 'low' || (prefs.quality === 'medium' && crowded.current)
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
  const hoverRoom = hover ? gridAt(site, hover.x, hover.y) : -1
  useEffect(() => {
    if (hoverRoom >= 0) onHoverRoom?.(hoverRoom)
  }, [hoverRoom, onHoverRoom])
  const [anchor, setAnchor] = useState<[number, number] | null>(null)
  /** The view has drawn its first frames. */
  const [up, setUp] = useState(false)
  const drawnRef = useRef(onDrawn)
  drawnRef.current = onDrawn
  const onUp = useCallback(() => (setUp(true), drawnRef.current?.()), [])
  /** The pointer is over the land beyond the plot, where nothing can be built. */
  const [off, setOff] = useState(false)
  // cards keep clear of whatever panels lie over the view
  cardClear.left = clear?.[0] ?? 8
  cardClear.top = clear?.[1] ?? 50
  cardClear.right = clear?.[2] ?? 8
  cardClear.bottom = clear?.[3] ?? 46
  /** Where the button went down with a tool that paints as it is dragged: the tile, the exact spot, and the wall under it. */
  const [drag, setDrag] = useState<{ x: number; y: number; fx: number; fy: number; edge: Edge; bay?: string } | null>(null)
  /** With these tools a left-drag belongs to the tool, not the camera. */
  const dragTool = tool?.type === 'item' || tool?.type === 'edge' || tool?.type === 'remove'
  const accent = themeColor('accent', '#ff6b1a')
  const neg = themeColor('neg', '#ff4d4f')
  const palette = useMemo<Palette>(() => ({ accent, neg, pos: themeColor('pos', '#5fd08a'), warn: themeColor('warn', '#f2b631') }), [accent, neg])
  const areaTool = tool?.type === 'room' || tool?.type === 'clear' || tool?.type === 'ground' || tool?.type === 'turn'
  /** Filling a courtyard is one click on it, and only rooms are built that way: any other area tool draws a box instead. */
  const filling = tool?.type === 'room' && tool.shape === 'fill'
  const shape: Shape = tool && 'shape' in tool && tool.shape !== 'fill' ? tool.shape : 'rect'
  /** The site shows what the company is doing: clocks run, screens are live, things can be clicked. */
  const lively = !!life && !autoRotate && !level
  const office = site.kind === 'office' ? life?.office : undefined
  const cut = mode === 'cut' || mode === 'down'
  const opts = tool && 'shape' in tool ? tool.opts : undefined
  const optsKey = `${opts?.thick ?? ''}|${opts?.sweep ?? ''}|${opts?.turn ?? ''}`

  // a half-finished drag does not survive a change of tool
  useEffect(() => {
    setAnchor(null)
    setDrag(null)
    pressed.current = null
    setOff(false)
  }, [tool?.type, tool && 'room' in tool ? tool.room : '', tool && 'kind' in tool ? tool.kind : ''])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setAnchor(null)
      setDrag(null)
      pressed.current = null
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
  const owners = useMemo(() => seatOwners(ground, seated), [ground, site, site.rev, ground.rev, seatedKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // what each person is called: an executive goes by the seat they hold, not their desk job
  const titles = useMemo(() => new Map([...seated, ...idle].map((e) => [String(e.id), jobTitle(e)])), [seatedKey, idle.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const crowdOn = lively && prefs.walkers && (site.kind !== 'factory' || !!life?.factory) && !(level && (site.kind === 'venue' || site.kind === 'factory'))
  const crowd = useMemo(() => (crowdOn ? (site.kind === 'venue' ? new VenueCrowd() : site.kind === 'factory' ? new FactoryCrowd() : new Crowd()) : null), [crowdOn, site.kind])
  /** Whether the site is in its working day, and where a venue is in its programme: told by the clock when either turns over. */
  const [turn, setTurn] = useState<{ working: boolean; phase: Phase }>({ working: true, phase: 'closed' })
  const onTurn = useCallback((working: boolean, phase: Phase) => setTurn({ working, phase }), [])
  const [darkRooms, setDarkRooms] = useState<ReadonlySet<number>>(() => new Set())
  const nav = useMemo(() => buildNav(site, level ? [...wells].filter(([, w]) => w.lands).map(([i]) => i) : undefined), [site, site.rev, wells]) // eslint-disable-line react-hooks/exhaustive-deps
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
    // on the ground floor, a few of those who work upstairs are seen walking in to the stairs, a lift or an escalator and going up
    const climbs = !level && ground.upper?.length ? site.items.filter((i) => CLIMB.has(i.kind)) : []
    if (climbs.length) {
      const here = new Set(site.items.map((i) => i.id))
      let k = 0
      for (const [id, e] of owners) {
        if (out.length >= cap || k >= 12) break
        if (here.has(id)) continue
        out.push({ e, climb: climbs[k++ % climbs.length].id })
      }
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
  // the walls follow the plan, not the furniture: a desk put down leaves the building standing as it is
  const plan = planKey(site)
  const groundPlan = planKey(ground)
  /** Changes whenever any storey of the building does: what the columns and stairwell rails are drawn from. */
  const storeysSig = `${groundPlan}|${ground.items.length}|${(ground.upper ?? []).map((l) => `${planKey(l)}.${l.items.length}`).join(',')}`
  /** Lifts on the floors below whose shafts come up through this one: their doors are drawn here too. */
  const shafts = useMemo(() => {
    if (!level || ![...wells.values()].some((w) => w.kind === 'lift')) return []
    return storeysOf(ground)
      .slice(0, floor)
      .flatMap((l) => l.items.filter((it) => it.kind === 'lift' && wells.get(it.y * ground.w + it.x)?.kind === 'lift'))
  }, [level, wells, ground, floor])
  const snap = useMemo(() => {
    const shot = snapshot(site)
    // with storeys of their own over it, the ground floor stands one storey high
    // (a venue's hall keeps its full height, its balconies inside it)
    if (stacked && site.kind !== 'venue') shot.floors = 1
    return shot
  }, [site, plan, stacked]) // eslint-disable-line react-hooks/exhaustive-deps
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
  /** The room a tree or a clump of bamboo has: out to the nearest wall, and up to the ceiling indoors. */
  const fitOf = (item: { x?: number; y?: number }): Fit | undefined => {
    if (item.x === undefined || item.y === undefined) return undefined
    const n = gridAt(site, item.x, item.y)
    let reach = 3
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = item.x + dx
        const y = item.y + dy
        if ((!dx && !dy) || !inPlot(site, x, y) || gridAt(site, x, y) === n) continue
        // from the middle of the plant's tile to the nearest point of a tile across a wall
        reach = Math.min(reach, Math.hypot(Math.max(0, Math.abs(dx) - 0.5), Math.max(0, Math.abs(dy) - 0.5)) - WALL_T / 2)
      }
    }
    return [Math.max(0.3, reach), n ? STOREY - 0.3 : 99]
  }
  const joins = useMemo(() => (site.kind === 'office' ? tableJoins(site) : new Map<string, [boolean, boolean]>()), [site, site.rev, site.items.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const ctxFor = (item: { id?: string; kind: string; x?: number; y?: number }, seed: number, flow?: [number, number], glow = M.glow): ItemCtx => {
    const on = shown.get(item.id ?? '')
    return {
      who: item.id ? occupant.get(item.id) : undefined,
      on: !!item.id && liveSeats.has(item.id),
      live: site.kind === 'factory' || item.kind === 'reception' ? crowdOn : liveKinds && (item.kind === 'server' || item.kind === 'helpdesk' || item.kind === 'screen' || item.kind === 'showcase'),
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
      running: !!item.id && ((line?.live ?? line?.linked)?.has(item.id) ?? false) && running,
      flow,
      show: staged,
      fill: Math.round(busy * 5) / 5,
      away: !!item.id && yard.managed.has(item.id),
      aisles: site.kind === 'venue' && 'x' in item ? seatAisles(site, item as SiteItem) : 0,
      tier: 'x' in item ? (item as SiteItem).tier : undefined,
      mods: 'x' in item ? (item as SiteItem).mods?.length : undefined,
      ceiling: site.kind === 'venue' && 'x' in item && gridAt(site, (item as SiteItem).x, (item as SiteItem).y) > 0 ? ceilingAt(site, (item as SiteItem).x, (item as SiteItem).y) : undefined,
      sparing,
      join: item.kind === 'meeting' && item.id ? joins.get(item.id) : undefined,
      fit: item.kind === 'otree' || item.kind === 'bamboo' ? fitOf(item) : undefined,
    }
  }
  const sigOf = (items: { item: SiteItem }[], glow: number) =>
    items
      .map(({ item }) => {
        const who = occupant.get(item.id)
        const on = shown.get(item.id)
        return `${item.id}:${item.x},${item.y},${item.rot}${item.tier ?? ''}${item.mods?.join('') ?? ''}:${who ? who.look + who.color : liveSeats.has(item.id) ? 'L' : ''}:${line?.linked.has(item.id) ? 1 : 0}${line?.flow.get(item.id)?.join('') ?? ''}${on ? on.devices.map((p) => p.id).join('') + (on.progress ?? '') : ''}${yard.managed.has(item.id) ? 'A' : ''}${site.kind === 'venue' ? seatAisles(site, item) || '' : ''}${joins.get(item.id)?.join('') ?? ''}${item.kind === 'otree' || item.kind === 'bamboo' ? `f${fitOf(item)?.map((v) => v.toFixed(2)).join('/')}` : ''}`
      })
      .join('|') + `#${Math.round(glow * 10)}${running ? 'r' : ''}${site.kind === 'factory' ? `${Math.round(busy * 5)}${crowdOn ? 'w' : ''}` : ''}${company}${logo?.length ?? 0}${color}${productKey}${soldKey}${liveKinds ? 'v' : ''}${crowdOn ? 'c' : ''}${researching ? 'R' : ''}${showcaseList[0]?.id ?? ''}${staged ? `s${staged.screen?.uuid ?? ''}` : ''}${sparing ? 'S' : ''}${site.kind === 'venue' ? `F${site.floors}` : ''}`

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
  const model = (item: SiteItem, glow: number) => (
    <group key={item.id} position={place(item)} rotation-y={(-item.rot * Math.PI) / 2}>
      <ItemModel kind={site.kind} item={item.kind} c={ctxFor(item, idSeed(item.id), flowOf(item), glow)} />
    </group>
  )

  const locate = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const fx = e.point.x + w / 2
    const fy = e.point.z + h / 2
    let x = Math.min(w - 1, Math.max(0, Math.floor(fx)))
    let y = Math.min(h - 1, Math.max(0, Math.floor(fy)))
    // the tools that act on furniture take what the pointer is on, a treetop as much as a desk
    const it = tool?.type === 'remove' || tool?.type === 'rotate' ? rayItem(e.ray, e.distance) : undefined
    if (it) (x = it.x), (y = it.y)
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
  /** What the sell tool would take between two corners: everything standing on any tile of the box between them. */
  const sellRun = (x0: number, y0: number, x1: number, y1: number): SiteItem[] => {
    const [ax, bx, ay, by] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)]
    return site.items.filter((it) => ITEMS[site.kind][it.kind] && itemTiles(site, it).some(([x, y]) => x >= ax && x <= bx && y >= ay && y <= by))
  }
  /** The tiles of the box between two corners, on the plot. */
  const boxTiles = (x0: number, y0: number, x1: number, y1: number): [number, number][] => {
    const out: [number, number][] = []
    for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(h - 1, Math.max(y0, y1)); y++) for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(w - 1, Math.max(x0, x1)); x++) out.push([x, y])
    return out
  }
  /**
   * The piece of furniture the pointer's ray meets first, before it reaches the floor: so a click on the crown of
   * a tree or the top of a rack finds it, not the floor tile behind it.
   */
  const pickBox = (it: SiteItem): Target['box'] => {
    const box = itemBox(site, it, PICK_TALL[it.kind])
    if (it.kind !== 'otree' && it.kind !== 'bamboo') return box
    // a crown spreads past the trunk's own metre, as far as it has room to
    const out = Math.min(it.kind === 'otree' ? 1.3 : 0.4, Math.max(0, (fitOf(it)?.[0] ?? 0) - 0.5))
    return [box[0] - out, box[1], box[2] - out, box[3] + out, box[4], box[5] + out]
  }
  const rayItem = (ray: THREE.Ray, floor: number): SiteItem | undefined => {
    let best: SiteItem | undefined
    let near = floor
    for (const it of site.items) {
      if (!ITEMS[site.kind][it.kind]) continue
      const d = rayBox(ray.origin.x, ray.origin.y, ray.origin.z, ray.direction.x, ray.direction.y, ray.direction.z, pickBox(it))
      if (d < near) (near = d), (best = it)
    }
    return best
  }

  // ---- cursor
  const preview = useMemo(() => {
    if (!hover || !tool) return null
    if (areaTool) {
      /** A whole courtyard, shown in its true shape: its open tiles and the corners its curved walls leave over. */
      const yard = (tiles: [number, number][], live = curveTiles(site), pocket = tiles.length ? pocketAt(site, tiles[0][0], tiles[0][1], live) : null) => {
        const note: AreaNote = { filled: true, rim: pocket && !pocket.enclosed ? Math.round(pocket.rim) : undefined, anchored: true }
        const cost = tool.type === 'room' ? roomCost(site, tool.room, tiles.length) : 0
        if (cost > budget) return { good: [] as [number, number][], bad: tiles, curve: null, area: tiles.length, note: { ...note, error: `Not enough cash: this room costs ${money(cost)}` } }
        return { good: tiles, bad: [] as [number, number][], curve: null, area: tiles.length, shapes: (pocket?.curved ?? []).flatMap((key) => live.get(key)?.shape.outside ?? []), note }
      }
      if (filling) {
        const live = curveTiles(site)
        const pocket = pocketAt(site, hover.x, hover.y, live)
        const error = fillError(pocket)
        if (error || !pocket) return { good: [], bad: [[hover.x, hover.y]] as [number, number][], curve: null, area: 0, note: { error: error ?? '' } as AreaNote }
        return yard(pocket.tiles, live, pocket)
      }
      const from = anchor ?? [hover.x, hover.y]
      // turning rooms: where they would stand, in the tool's colour, or the rooms themselves in the warning colour where they cannot
      if (tool.type === 'turn') {
        const plan = turnPlan(site, from[0], from[1], hover.x, hover.y)
        const own = new Set(plan.rooms)
        const mine: [number, number][] = []
        site.grid.forEach((n, i) => own.has(n) && mine.push([i % w, Math.floor(i / w)]))
        const error = plan.error ?? (plan.cost > budget ? `Not enough cash: turning them costs ${money(plan.cost)}` : undefined)
        const note: AreaNote = { anchored: !!anchor, cost: plan.cost, error }
        if (error) return { good: [] as [number, number][], bad: mine.length ? mine : [[hover.x, hover.y]] as [number, number][], curve: null, area: 0, note }
        return { good: [...plan.to.keys()].map((k) => k.split(',').map(Number) as [number, number]), bad: [] as [number, number][], curve: null, area: plan.to.size, note }
      }
      // a box across half or more of a curved courtyard takes the whole of it; one in such a courtyard at all is told so,
      // before the first corner is set as well as after
      const plan = tool.type === 'room' && shape === 'rect' && site.curves?.length ? zonePlan(site, from[0], from[1], hover.x, hover.y, shape, opts) : null
      if (plan?.filled && anchor) return yard(plan.tiles)
      const note: AreaNote = { yard: plan?.yard || undefined, anchored: !!anchor }
      // a room with a curved wall takes every tile the curve touches
      const all = areaTiles(from[0], from[1], hover.x, hover.y, shape, opts, tool.type === 'room').filter(([x, y]) => inPlot(site, x, y))
      // what the sim itself would take: a room is laid on every open tile (whatever stands there is cleared and sold), demolition takes the built ones
      const good = all.filter(([x, y]) => (tool.type === 'clear' ? !!gridAt(site, x, y) : !gridAt(site, x, y)))
      // ground is laid, as the sim lays it, on the strip of open ground outside a slanted or curved wall too
      // (not water: a pond is never dug against a wall)
      // (not water: a pond is never dug against a wall); those strips are tinted in their own shape
      const strips: Pt[][] = []
      let stripTiles = 0
      if (tool.type === 'ground' && tool.id !== 'water') {
        const live = curveTiles(site)
        for (const [x, y] of areaTiles(from[0], from[1], hover.x, hover.y, shape, opts, true)) {
          if (!inPlot(site, x, y) || !gridAt(site, x, y) || !hasGround(site, x, y)) continue
          stripTiles++
          const cut = cutAt(site, x, y)
          const corners: Record<string, Pt> = { nw: [x, y], ne: [x + 1, y], se: [x + 1, y + 1], sw: [x, y + 1] }
          const across: Record<string, string> = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' }
          if (cut) strips.push((['nw', 'ne', 'se', 'sw'] as const).filter((k) => k !== across[cut]).map((k) => corners[k]))
          else strips.push(...(live.get(`${x},${y}`)?.shape.outside ?? []))
        }
      }
      const bad = tool.type === 'room' ? all.filter(([x, y]) => gridAt(site, x, y)) : []
      const curve = anchor ? curveFor(from[0], from[1], hover.x, hover.y, shape, opts) : null
      const area = tool.type === 'room' ? Math.max(good.length ? 1 : 0, Math.round(areaOf(good, curve))) : good.length + stripTiles
      if (tool.type === 'room') {
        const standing = new Set<string>()
        for (const [x, y] of good) {
          const it = itemAt(site, x, y)
          if (it) standing.add(it.id)
        }
        if (standing.size) note.clears = standing.size
        const cost = roomCost(site, tool.room, area)
        // (a first corner inside a room of the same kind extends that room, so built ground is only wrong once the box is drawn)
        if (anchor && !good.length) note.error = 'That land is already built on'
        else if (cost > budget) note.error = `Not enough cash: ${anchor ? 'this room costs' : 'a square metre costs'} ${money(cost)}`
      } else if (anchor && !good.length && !stripTiles) note.error = tool.type === 'clear' ? 'There are no rooms there to knock down' : 'Ground can only be laid on open land'
      // refused: the whole box is drawn in the warning colour
      if (note.error) return { good: [] as [number, number][], bad: all, curve, area, note }
      return { good, bad, curve, area, note, ...(strips.length ? { shapes: strips } : {}) }
    }
    if (tool.type === 'item') {
      const def = ITEMS[site.kind][tool.kind]
      if (!def) return null
      // one where the pointer is, or a row from where the button went down
      // as many as the money covers, in the order they would be laid; the rest are shown as refused
      const can = def.cost > 0 ? Math.floor(budget / def.cost) : Infinity
      let fits = 0
      let poor = 0
      let why: string | undefined
      const spots = (drag ? rowSpots(def, drag.x, drag.y, hover.x, hover.y, tool.rot) : ([[hover.x, hover.y]] as [number, number][])).map(([x, y]) => {
        const no = canPlace(site, tool.kind, x, y, tool.rot, wells)
        why ??= no ?? undefined
        const free = !no
        const ok = free && fits < can
        if (ok) fits++
        else if (free) poor++
        return { x, y, ok }
      })
      const good = spots.filter((s) => s.ok).flatMap((s) => tilesOf(def, s.x, s.y, tool.rot))
      const bad = spots.filter((s) => !s.ok).flatMap((s) => tilesOf(def, s.x, s.y, tool.rot).filter(([x, y]) => inPlot(site, x, y)))
      const count = spots.filter((s) => s.ok).length
      return { good, bad, spots, run: { tool: 'item' as const, count, blocked: spots.length - count, cost: count * def.cost, poor, why: drag ? undefined : why } }
    }
    if (tool.type === 'remove') {
      const items = drag ? sellRun(drag.x, drag.y, hover.x, hover.y) : sellRun(hover.x, hover.y, hover.x, hover.y)
      const good = items.flatMap((it) => tilesOf(ITEMS[site.kind][it.kind], it.x, it.y, it.rot))
      const area = drag ? boxTiles(drag.x, drag.y, hover.x, hover.y) : ([[hover.x, hover.y]] as [number, number][])
      const taken = new Set(good.map(([x, y]) => `${x},${y}`))
      // the box is drawn in the warning colour only while there is nothing in it to sell
      return { good, bad: items.length ? [] : area.filter(([x, y]) => !taken.has(`${x},${y}`)), zone: drag && items.length ? area : undefined, items, run: { tool: 'remove' as const, count: items.length, blocked: 0, cost: items.reduce((a, it) => a + ITEMS[site.kind][it.kind].cost / 2, 0) } }
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
      // a run wholly inside rooms puts up, changes or takes down partitions (see setEdges)
      const parting = partitionRun(site, run.edges ?? [])
      const edges = (run.edges ?? []).map((e) => {
        const inner = parting && canPartition(site, e.x, e.y, e.side)
        const wall = inner || isBoundary(site, e.x, e.y, e.side)
        const short = !inner && wall && !!live && !doorFits(site, e.x, e.y, e.side, live)
        const now = wallAt(site, e.x, e.y, e.side)?.kind ?? (inner ? 'open' : 'wall')
        return { ...e, ok: wall && !short, short, same: kept(now), door: now === 'door', price: edgePrice(site, e.x, e.y, e.side, tool.kind) }
      })
      const bays = (run.bays ?? []).map((bay) => ({ bay, ok: bayStands(site, run.curve!, bay), same: kept(c?.walls?.[bay] ?? 'wall'), door: c?.walls?.[bay] === 'door' }))
      const count = edges.filter((e) => e.ok && !e.same).length + bays.filter((b) => b.ok && !b.same).length
      const cost = edges.reduce((a, e) => a + (e.ok && !e.same ? e.price : 0), 0) + bays.filter((b) => b.ok && !b.same).length * EDGE_COST[tool.kind]
      const left = spare ? edges.filter((e) => e.ok && e.door).length + bays.filter((b) => b.ok && b.door).length : 0
      return { good: [], bad: [], wall: { run, edges, bays }, run: { tool: 'edge' as const, count, blocked: edges.filter((e) => !e.ok).length + bays.filter((b) => !b.ok).length, cost, kept: left, short: edges.filter((e) => e.short).length } }
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover?.x, hover?.y, hover?.edge.x, hover?.edge.y, hover?.edge.side, hover?.edge.bay, hover?.edge.curve, anchor, drag, tool, site, site.rev, areaTool, shape, filling, optsKey, budget])

  // ---- a tool being dragged: say what it would do, and do it when the button comes up
  // (an item that cannot stand where the pointer is says why before anything is pressed)
  const runInfo = preview && 'run' in preview && preview.run && (drag || ('why' in preview.run && preview.run.why)) ? preview.run : null
  const runKey = runInfo ? `${'why' in runInfo ? (runInfo.why ?? '') : ''}|${drag ? 1 : 0}|${runInfo.tool}|${runInfo.count}|${runInfo.blocked}|${runInfo.cost}|${runInfo.kept ?? 0}|${runInfo.short ?? 0}|${runInfo.poor ?? 0}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onRun?.(runInfo), [runKey, onRun])
  const finish = useRef<() => void>(() => {})
  const pressed = useRef<{ drag: NonNullable<typeof drag>; hover: NonNullable<typeof hover> } | null>(null)
  finish.current = () => {
    // a quick click can come up before the view has drawn the press: what it pressed is kept here meanwhile
    const press = pressed.current
    if (!press) return
    pressed.current = null
    const from = drag ?? press.drag
    const to = drag ? hover : press.hover
    setDrag(null)
    if (!to || !tool) return
    if (tool.type === 'item') onRow?.(from.x, from.y, to.x, to.y)
    else if (tool.type === 'edge') onEdges?.(wallRun(from, to))
    else if (tool.type === 'remove') {
      const ids = sellRun(from.x, from.y, to.x, to.y).map((i) => i.id)
      if (ids.length) onSell?.(ids)
    }
  }

  const previewCount = areaTool && (anchor || filling) && preview ? ('area' in preview && preview.area !== undefined ? preview.area : preview.good.length) : 0
  const areaNote = areaTool && preview && 'note' in preview ? preview.note : undefined
  const noteKey = areaNote ? `${areaNote.filled ? 1 : 0}|${areaNote.error ?? ''}|${areaNote.yard ?? 0}|${areaNote.rim ?? 0}|${areaNote.anchored ? 1 : 0}|${areaNote.clears ?? 0}` : ''
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
    const eh = wallTop(mode)
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
    hover && drag && runInfo && (runInfo.count > 1 || runInfo.blocked > 0) ? (
      <Html position={[hover.x - w / 2 + 0.5, cut ? 1.7 : STOREY + 0.4, hover.y - h / 2 + 0.5]} center zIndexRange={[30, 20]} style={{ pointerEvents: 'none' }}>
        <div className="pointer-events-none -translate-y-full whitespace-nowrap border border-accent bg-panel/95 px-2 py-[3px] text-center">
          <div className="num text-[11px] text-fg">
            {runInfo.count} x {runInfo.tool === 'remove' ? '+' : ''}
            {money(runInfo.cost)}
          </div>
          {runInfo.blocked > 0 && <div className="text-[11px] text-neg">{runInfo.blocked} cannot go</div>}
        </div>
      </Html>
    ) : null

  // ---- what the rooms say, and what can be clicked
  const places = useMemo(() => (lively && site.kind === 'office' && mode !== 'full' ? boardPlaces(site, BOARD_ROOMS) : []), [site, site.rev, lively, mode]) // eslint-disable-line react-hooks/exhaustive-deps
  const meetingTables = useMemo(() => meetingChains(site).map((c) => c[0]), [site, site.rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const led = office?.teams.filter((t) => t.leadId && t.members.length >= 2) ?? []
  /** Which of several rooms of one kind this is, so two labs show two different projects. */
  const nth = (roomN: number, type: string) => site.rooms.filter((r) => r.type === type).findIndex((r) => r.n === roomN)

  const meetingText = (roomN: number) => (): BoardText => {
    const hour = hourOf(campus.t)
    const here = meetingTables.map((t, i) => ({ t, i })).filter(({ t }) => gridAt(site, t.x, t.y) === roomN)
    if (!here.length) return { title: 'Meeting room', line: 'No table yet', tone: 'dim' }
    if (!led.length) return { title: 'Meeting room', line: 'No teams with a lead', sub: 'Set up teams under Campus, Teams', tone: 'dim' }
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
        return { title: `Campaigns running: ${o.campaigns.length}`, line: o.campaigns[k % o.campaigns.length].channel, rows: o.campaigns.slice(0, 2).map((c) => `${c.target}  ${money(c.monthly)}/mo`), tone: 'accent' }
      case 'support': {
        const s = o.support
        return { title: 'Support lines', line: `${num(s.tickets)} tickets a day`, bar: Math.min(1, s.load), sub: s.load >= 1 ? `Overloaded: the team can answer ${num(s.capacity)}` : `The team can answer ${num(s.capacity)}`, tone: s.load >= 1 ? 'neg' : s.load >= 0.75 ? 'warn' : 'pos' }
      }
      case 'server':
      case 'soft': {
        const os = o.os
        if (os.project) return { title: os.own ? `${os.name} ${os.version + 1}` : `${os.name} 1`, line: 'Next version in the works', bar: os.project.progress, sub: `${os.project.daysLeft} days to go`, tone: 'accent' }
        if (!os.own) return { title: 'Software', line: 'Running stock software', sub: 'Start your own system under Research, Labs', tone: 'dim' }
        return { title: `${os.name} ${os.version}`, line: os.quality >= os.industry ? 'Ahead of the industry' : 'Behind the industry', sub: os.services > 0 ? `Services earn ${money(os.services)} a month` : `Quality ${Math.round(os.quality)} against ${Math.round(os.industry)}`, tone: os.quality >= os.industry ? 'pos' : 'warn' }
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
        else if (item.kind === 'test') out.push(itemTarget(site, item, 'quality', 'Test station', f.line?.running ? `${pct(f.line.defectRate)} of units ship faulty` : 'Line not running'))
      }
    } else if (site.kind === 'venue' && life?.venue) {
      const v = life.venue
      const next = v.upcoming.find((e) => e.here)
      const when = next ? `${next.product ?? 'A keynote'} in ${next.daysLeft} ${next.daysLeft === 1 ? 'day' : 'days'}` : 'No show booked here'
      for (const item of site.items) {
        const def = ITEMS.venue[item.kind]
        const tall = VENUE_TALL[item.kind]
        if (!def || !tall) continue
        const hint = def.crowd ? `${def.crowd} seats of ${v.stats.seats}` : isStage(item.kind) ? when : def.show ? `Production +${def.show}` : when
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
  // a room's card goes when the room is no longer the one picked (another was, or it was knocked down)
  useEffect(() => {
    setOpen((cur) => (cur?.kind === 'room' && cur.id !== String(selectedRoom ?? 0) ? null : cur))
  }, [selectedRoom])

  // ---- plates: what is going on, said over the place itself
  const plates = useMemo(() => {
    const out: Plate[] = []
    if (!lively || mode === 'full') return out
    const sign = (key: string, kind: Target['kind'], at: [number, number, number], rest: Pick<Plate, 'text' | 'figure' | 'bar' | 'tone' | 'title'>) => out.push({ key, at, target: { key: `plate:${key}`, kind, label: rest.text, box: [0, 0, 0, 0, 0, 0], anchor: at }, ...rest })
    /** The middle of a set of things, in the world. */
    const middle = (pts: [number, number][], y: number): [number, number, number] => [pts.reduce((a, p) => a + p[0], 0) / pts.length - w / 2, y, pts.reduce((a, p) => a + p[1], 0) / pts.length - h / 2]
    const itemMid = (items: SiteItem[]) => items.map((it): [number, number] => [place(it)[0] + w / 2, place(it)[2] + h / 2])
    if (site.kind === 'office' && office) {
      const lines = researchOn(office, research)
      site.rooms
        .filter((r) => r.type === 'lab')
        .slice(0, 6)
        .forEach((r, k) => {
          const tiles: [number, number][] = []
          for (let i = 0; i < site.grid.length; i++) if (site.grid[i] === r.n) tiles.push([(i % w) + 0.5, Math.floor(i / w) + 0.5])
          if (!tiles.length) return
          const l = lines.length ? lines[k % lines.length] : undefined
          const stalled = !!l && office.budget <= 0
          sign(`lab:${r.n}`, 'research', middle(tiles, cut ? 2.2 : STOREY + 0.6), {
            text: l ? l.name : 'No research running',
            figure: l ? `${Math.round(l.progress * 100)}%` : undefined,
            bar: l?.progress,
            tone: !l ? 'dim' : stalled ? 'warn' : 'pos',
            title: !l ? 'Nothing is being researched in this lab. Click to choose a project.' : stalled ? `${l.name}: there is no research budget, so it is not moving. Click to change that.` : `Being researched here: ${l.name}${l.daysLeft ? `, about ${num(l.daysLeft)} days left` : ''}. Click for the research controls.`,
          })
        })
    } else if (site.kind === 'factory' && life?.factory) {
      const f = life.factory
      const machines = site.items.filter((it) => (f.line?.linked.size ? f.line.linked.has(it.id) : !!ITEMS.factory[it.kind]?.stage))
      if (machines.length) {
        const queue = f.orders.filter((o) => o.mode === 'factory' && o.done < o.quantity)
        const o = queue[0]
        const share = o ? o.done / Math.max(1, o.quantity) : 0
        sign('line', 'orders', middle(itemMid(machines), cut ? 3 : STOREY + 0.8), {
          text: o ? `${o.product}${queue.length > 1 ? `, ${queue.length - 1} more queued` : ''}` : f.line?.running ? 'No order on the line' : 'The line is not running',
          figure: o ? `${Math.round(share * 100)}%` : undefined,
          bar: o ? share : undefined,
          tone: !f.line?.running ? 'warn' : o ? 'accent' : 'dim',
          title: o ? `On the line: ${o.product}, ${num(o.done)} of ${num(o.quantity)} built. Click for the orders.` : (f.line?.problem ?? (f.line?.running ? 'The line is ready and has nothing to build. Click for the orders.' : 'The line is not running.')),
        })
      }
    } else if (site.kind === 'store' && life?.store) {
      const st = life.store
      const tills = site.items.filter((it) => it.kind === 'counter')
      const at = tills.length ? middle(itemMid(tills), cut ? 2.2 : STOREY + 0.6) : ([0, cut ? 2.2 : STOREY + 0.6, 0] as [number, number, number])
      sign('tills', 'takings', at, {
        text: !st.open ? 'Closed' : month ? (month.partial ? 'This month, projected' : 'Profit this month') : 'Sold this month',
        figure: !st.open ? undefined : month ? moneyDelta(month.profit) : num(st.monthUnits),
        tone: !st.open ? 'warn' : month ? (month.profit < 0 ? 'neg' : 'pos') : 'accent',
        title: `${st.name}: ${num(st.visitors)} visitors a day, ${num(st.perDay)} sold a day. Click for the takings.`,
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev, life, lively, mode, cut, month?.profit, month?.partial, research])
  useEffect(() => {
    document.body.style.cursor = hot && !tool ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hot, tool])

  const venueStage = site.kind === 'venue' ? stageOf(site) : undefined
  const presenterAt = useRef<[number, number] | null>(null)
  // a show in a hall: the hall's own lights go down for it, whatever the hour outside. Seen with the roof off, that
  // means less of the daylight too
  const houseDown = !!staged && !!venueStage && gridAt(site, venueStage.x, venueStage.y) > 0 && !dark
  const stage = show?.presenter ? venueStage : undefined
  const sun: [number, number, number] = [M.sunDir[0] * span * 1.4, M.sunDir[1] * span * 1.4, M.sunDir[2] * span * 1.4]
  const far = span * 7 + 420
  const near = Math.min(1.5, Math.max(0.4, span / 40))
  const reach = Math.max(14, span * 0.8)
  const height = mode === 'full' ? site.floors * STOREY : 0
  const home = useMemo<[number, number, number]>(() => [span * 0.75, span * 0.95 + height, span * 1.2 + 6], [span, height])
  /** What the camera looks at when a site opens, and again when it is recentred. */
  const aim = useMemo<[number, number, number]>(() => [0, height * 0.35 + 0.5 + lift, 0], [height, lift])
  // with a tool that paints as it is dragged, the left button is the tool's: the middle one turns the view instead
  const mouseButtons = useMemo(() => ({ LEFT: dragTool ? (-1 as THREE.MOUSE) : THREE.MOUSE.ROTATE, MIDDLE: dragTool ? THREE.MOUSE.ROTATE : THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }), [dragTool])
  const touches = useMemo(() => ({ ONE: dragTool ? (-1 as THREE.TOUCH) : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }), [dragTool])
  const shadowSig = `${site.rev}|${standing.rev}|${dropping.size}|${mood}|${mode}|${seated.length}|${liveSeats.size}|${day > 0 ? Math.floor(day / 30) : 0}|${show ? show.crowd.toFixed(1) + show.cheer : ''}|${glowKey}`
  return (
    <SafeCanvas what={site.kind === 'office' ? 'campus view' : `${site.kind} view`} adaptive shadows={Q.shadows > 0 ? 'percentage' : false} dpr={[0.5, Q.dpr]} camera={{ fov: 30, near, far, position: home }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: dark ? 1.25 : 1, powerPreference: 'high-performance' }}>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, span * 3 + 80, far * 0.9]} />
      <hemisphereLight args={[dark ? '#6a7fa8' : '#fff4e6', dark ? '#14161c' : '#4a4338', (M.hemi + (dark ? 0.35 : 0)) * (houseDown ? 0.42 : 1)]} />
      <directionalLight
        color={M.sunColor}
        intensity={M.sun * (houseDown ? 0.2 : 1)}
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
      {/* a venue has a wash on its stage and house lights over the seats, which go down for a show */}
      {site.kind === 'venue' && <StageLights site={site} mood={mood} show={!!staged} down={houseDown} follow={director && stage ? () => presenterAt.current : undefined} />}
      <Environment resolution={128} frames={1} environmentIntensity={dark ? 0.12 : houseDown ? 0.16 : 0.4}>
        <color attach="background" args={[sky]} />
        <Lightformer form="rect" intensity={3} color="#fff1e0" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#cfe0ff" position={[-8, 2, 0]} scale={[4, 6, 1]} target={[0, 0, 0]} />
      </Environment>

      <Environs env={tier.env} w={w} h={h} mood={mood} />
      <Ground site={ground} dim={indoor ? M.ground : mood === 'night' ? 0.6 : mood === 'dusk' ? 0.85 : 1} />
      {/* upstairs: the floors under the one being built on, cut low and faded, seen through the open parts of this one */}
      {level &&
        Array.from({ length: floor }, (_, f) => {
          const plan = f ? ground.upper?.[f - 1] : ground
          if (!plan) return null
          return (
            <group key={`lower${f}`} position-y={f * STOREY}>
              {f > 0 && <Ground site={plan} dim={0.8} upper holes={holesOn(ground, f)} />}
              <Structure site={plan} mode={walking ? 'walls' : 'cut'} glow={0} leaves={false} />
              <Chunk sig={`${f}|${plan.rev}|${plan.items.length}|${glowKey}`} render={() => plan.items.filter((i) => ITEMS[plan.kind][i.kind]).map((i) => model(i, M.glow))} />
            </group>
          )
        })}
      {/* from outside, an office of several storeys: every floor as built, each with its roof over what nothing stands on */}
      {stacked &&
        ground.upper!.map((plan, i) => (
          <group key={`upper${i}`} position-y={(i + 1) * STOREY}>
            <Ground site={plan} dim={1} upper holes={holesOn(ground, i + 1)} />
            {/* (a venue's balconies stand inside its hall: its own walls are theirs) */}
            {ground.kind !== 'venue' && <Structure site={plan} mode="full" glow={mood === 'day' ? 0 : M.glow * 0.6} leaves={false} above={ground.upper![i + 1]} />}
            <Chunk sig={`u${i}|${plan.rev}|${plan.items.length}|${glowKey}`} render={() => plan.items.filter((it) => ITEMS[plan.kind][it.kind]).map((it) => model(it, M.glow))} />
          </group>
        ))}
      {/* columns and slabs under rooms built out over open ground, and rails round the stairwells */}
      {(level || stacked || (walking && !!ground.upper?.length)) && <Storeys ground={ground} from={1} to={walking ? (ground.upper?.length ?? 0) : level ? floor : (ground.upper?.length ?? 0)} sig={storeysSig} />}
      {/* walking: the floors overhead stand over the walker, each seen from below as a ceiling */}
      {walking &&
        (ground.upper ?? []).slice(floor).map((plan, i) => {
          const f = floor + 1 + i
          return (
            <group key={`over${f}`} position-y={f * STOREY}>
              <Ground site={plan} dim={1} upper holes={holesOn(ground, f)} />
              <Structure site={plan} mode="walls" glow={0} leaves={false} />
              <Chunk sig={`o${f}|${plan.rev}|${plan.items.length}|${glowKey}`} render={() => plan.items.filter((it) => ITEMS[plan.kind][it.kind]).map((it) => model(it, M.glow))} />
            </group>
          )
        })}
      {walking && site.kind !== 'venue' && <Ceilings ground={ground} floor={floor} sig={storeysSig} />}
      <group position-y={lift}>
      {level && <Ground site={level} dim={1} upper holes={stairHoles} />}
      {/* the floors below are faded under this one, as seen through its open parts */}
      {level && !walking && (
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.06, 0]} renderOrder={2}>
          <planeGeometry args={[w + 6, h + 6]} />
          <meshBasicMaterial color={sky} transparent opacity={0.45} depthWrite={false} />
        </mesh>
      )}
      {/* a lift's doors on every floor its shaft reaches */}
      {shafts.map((it) => model(it, M.glow))}
      <Structure site={standing} mode={mode} glow={mood === 'day' ? 0 : M.glow * 0.6} leaves={false} dark={cut ? undefined : darkRooms} above={stacked ? ground.upper?.[0] : undefined} />

      {/* pick surface over the whole plot: found by the pointer, never drawn */}
      <mesh
        visible={false}
        rotation-x={-Math.PI / 2}
        position={[0, 0.005, 0]}
        onPointerMove={(e) => {
          if (walking) return
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
          const at = { x: t.x, y: t.y, edge: t.edge }
          const from = { x: t.x, y: t.y, fx: t.fx, fy: t.fy, edge: t.edge, bay: t.edge.bay }
          setHover(at)
          setDrag(from)
          pressed.current = { drag: from, hover: at }
          // the button may come up anywhere, on the plot or off it, and at once
          const up = (ev: PointerEvent) => {
            if (ev.type === 'pointerup' && ev.button !== 0) return
            window.removeEventListener('pointerup', up)
            window.removeEventListener('pointercancel', up)
            finish.current()
          }
          window.addEventListener('pointerup', up)
          window.addEventListener('pointercancel', up)
        }}
        onClick={(e) => {
          // tools that paint as they are dragged act when the button comes up, wherever that is
          if (dragTool || walking) return
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
            // the room that was clicked gets its card right there, beside the pointer
            const n = gridAt(site, t.x, t.y)
            const room = onTile?.(t.x, t.y, itemAt(site, t.x, t.y)) && n ? roomOf(site, n) : undefined
            setOpen(room ? { key: `room:${n}`, kind: 'room', id: String(n), label: ROOMS[site.kind][room.type]?.name ?? 'Room', box: [0, 0, 0, 0, 0, 0], anchor: [t.fx - w / 2, 0.2, t.fy - h / 2] } : null)
          }
        }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial />
      </mesh>

      {/* the land beyond the plot, while a tool is in hand: a click there is answered, not swallowed */}
      {tool && (
        <mesh
          visible={false}
          rotation-x={-Math.PI / 2}
          position={[0, 0.002, 0]}
          onPointerMove={(e) => {
            const out = Math.abs(e.point.x) > w / 2 || Math.abs(e.point.z) > h / 2
            if (out !== off) setOff(out)
          }}
          onPointerOut={() => off && setOff(false)}
          onClick={(e) => {
            if (e.delta > 5 || (Math.abs(e.point.x) <= w / 2 && Math.abs(e.point.z) <= h / 2)) return
            onOff?.()
          }}
        >
          <planeGeometry args={[w + span * 8, h + span * 8]} />
          <meshBasicMaterial />
        </mesh>
      )}
      {tool && <PlotEdge w={w} h={h} color={off ? neg : accent} />}

      {chunks.map((chunk) => {
        const glow = lit.current.get(chunk.key) ?? M.glow
        return <Chunk key={chunk.key} sig={sigOf(chunk.items, glow)} render={() => chunk.items.map(({ item }) => model(item, glow))} />
      })}

      <Heartbeat
        onPulse={(p) => {
          pulse.current = p
        }}
      >
        {lively && <Day crowd={crowd} speed={speed} onTurn={onTurn} />}
        {crowd && <People crowd={crowd} cap={site.kind === 'store' ? cap : site.kind === 'venue' ? VENUE_WALKERS[prefs.quality] + 10 : site.kind === 'factory' ? cap * 2 + 8 : cap + 8} neg={neg} />}
        {crowd instanceof FactoryCrowd && <Jacks crowd={crowd} />}
        {crowd && (site.kind === 'office' || site.kind === 'venue') && <FrontSigns site={site} crowd={crowd} />}
        {crowd && site.kind === 'office' && <DeskScreens site={site} items={liveDesks} crowd={crowd} glow={M.glow} />}
        {/* after dark the rooms are lit from within, the ones with people in them brightest */}
        <RoomLights site={site} crowd={crowd} mood={indoor && mood === 'night' ? 'dusk' : mood} lamps={site.kind === 'venue' ? 0 : ROOM_LAMPS[prefs.quality]} gain={site.kind === 'venue' ? (staged ? 0.05 : 0.15) : indoor ? 0.5 : 1} busy={lively && site.kind === 'factory' && !crowd ? () => running : undefined} onDark={mode === 'cut' ? undefined : setDarkRooms} />
        {site.kind === 'venue' && <Audience site={site} state={houseState} filled={crowd ? filledSeat : undefined} />}
        {stage && !crowd && <Presenter site={site} cheer={!!show?.cheer} walk={presenterWalk} at={presenterAt} />}
        <SparksView sparks={sparks} />
        {site.kind === 'factory' && line && mode !== 'full' && <FactoryFlow site={site} line={line} running={running} speed={speed} />}
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
                <ItemModel kind={site.kind} item={item.kind} c={ctxFor(item, idSeed(item.id), flowOf(item))} />
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
        {site.kind === 'office' && crowd instanceof Crowd && <MeetingLife site={site} crowd={crowd} office={office} palette={palette} glow={M.glow} height={wallTop(mode)} showText={mode !== 'full'} />}
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
        {lively && <Pointer enabled={!tool && !walking} targets={targets} crowd={crowd} titles={titles} hover={hotRef} onHover={onHover} onPick={onPick} consumed={consumed} />}
        {hot && !tool && !walking && hot.target.key !== open?.key && <HoverMark hover={hot} color={accent} />}
        {import.meta.env.DEV && <DevHandle pulse={pulse} crowd={crowd} />}
      </Heartbeat>
      {open && card && !tool && !walking && (
        <Html position={open.anchor} calculatePosition={cardPosition} zIndexRange={[40, 31]}>
          <Sized>{card(open, () => setOpen(null))}</Sized>
        </Html>
      )}
      {/* (put up once the view has drawn: signs mounted while the scene is still loading its parts come up empty) */}
      {up &&
        !tool &&
        !walking &&
        plates.map((p) =>
          p.target.key === open?.key ? null : (
            <Html key={p.key} position={p.at} center zIndexRange={[19, 10]}>
              <button type="button" title={p.title} onClick={() => setOpen(p.target)} onPointerDown={(e) => e.stopPropagation()} className="relative block max-w-[220px] cursor-pointer border border-line2 bg-panel/95 px-2 py-[3px] text-left text-[11px] leading-4 hover:border-fg">
                <span className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className={`min-w-0 truncate ${p.figure ? 'text-fg' : PLATE_TEXT[p.tone]}`}>{p.text}</span>
                  {p.figure && <span className={`num shrink-0 font-semibold ${PLATE_TEXT[p.tone]}`}>{p.figure}</span>}
                </span>
                {p.bar !== undefined && (
                  <span className="absolute inset-x-0 bottom-0 block h-[2px] bg-line">
                    <span className={`block h-full ${PLATE_TONE[p.tone]}`} style={{ width: `${Math.max(0, Math.min(1, p.bar)) * 100}%` }} />
                  </span>
                )}
              </button>
            </Html>
          ),
        )}

      {site.kind === 'store' && !crowdOn && <Shoppers spots={shopperSpots} count={Math.round(busy * shopperSpots.length)} />}

      {roomFloor.tiles.length + roomFloor.shapes.length > 0 && <Tint tiles={roomFloor.tiles} shapes={roomFloor.shapes} w={w} h={h} color={accent} opacity={0.16} y={0.028} inset={0} />}
      {sealedFloor.tiles.length + sealedFloor.shapes.length > 0 && <Tint tiles={sealedFloor.tiles} shapes={sealedFloor.shapes} w={w} h={h} color={neg} opacity={0.22} y={0.03} inset={0} />}
      {preview && (preview.good.length > 0 || ('shapes' in preview && !!preview.shapes?.length)) && <Tint tiles={preview.good} shapes={'shapes' in preview ? preview.shapes : undefined} w={w} h={h} color={accent} opacity={ghost ? 0.22 : 0.45} inset={'shapes' in preview && preview.shapes ? 0 : undefined} />}
      {/* the box the sell tool is being dragged over, faintly, round what it would take */}
      {preview && 'zone' in preview && preview.zone && <Tint tiles={preview.zone} w={w} h={h} color={accent} opacity={0.1} y={0.026} inset={0} />}
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
      </group>

      {Q.shadows > 0 && <StaticShadows sig={shadowSig} />}
      {Q.ao && (
        <EffectComposer ref={shading} multisampling={4}>
          <N8AO halfRes aoRadius={0.8} distanceFalloff={1} intensity={mood === 'night' ? 1.2 : 2} quality="medium" />
        </EffectComposer>
      )}
      <Drawn on={onUp} />
      {!autoRotate && !walking && !director && <CameraKeys span={span} home={home} aim={aim} />}
      <Walk nav={nav} on={walk} onActive={setWalking} onLeave={endWalk} floor={floor} flights={flights} lifts={liftStops} onFloor={onWalkFloor} onHint={onWalkHint} crowd={crowd} />
      {autoRotate && !director && <AutoTurn speed={3} />}
      {director && <Director shot={director} />}
      <CameraFence span={span} top={height + 6} />
      <OrbitControls makeDefault enabled={!walking && !director} target={aim} minDistance={near * 6} maxDistance={span * 3 + 40} maxPolarAngle={Math.PI * 0.485} enablePan screenSpacePanning={false} panSpeed={1.3 * prefs.cameraSpeed} rotateSpeed={0.9 * prefs.cameraSpeed} zoomSpeed={1.2 * prefs.cameraSpeed} zoomToCursor={prefs.zoomToPointer} enableDamping dampingFactor={0.2} mouseButtons={mouseButtons} touches={touches} />
    </SafeCanvas>
  )
}
