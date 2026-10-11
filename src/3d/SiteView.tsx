// 3D view of a buildable site: the land around it, the rooms and walls, what
// stands in them, the people who use them, and the cursor for building.
import { Environment, Html, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { type ReactNode, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { FactoryLife, OfficeLife, StoreLife } from '../sim/life'
import { ITEMS, type LineStats, SITE_TIERS, areaTiles, canPlace, gridAt, inPlot, isBoundary, itemAt, roomOf, tilesOf } from '../sim/sites'
import { ROLE_INFO, inTraining } from '../sim/staff'
import type { Employee, Product, Site, SiteItem, SiteKind } from '../sim/types'
import { QUALITY, type Quality, isHeld, useSettings } from '../store/settings'
import { themeColor } from '../store/theme'
import { People } from './site/People'
import { type BoardPlace, type BoardText, CallLights, Face, type Palette, RackLights, RoomBoards, Showcase, boardBox, boardPlaces, boardY } from './site/boards'
import { advanceClock, campus, hourOf } from './site/clock'
import { type Body, Crowd, Kind, type StaffEntry, describe, meetingSlot } from './site/crowd'
import { Environs, MOODS, type Mood } from './site/env'
import { FactoryItem } from './site/factory'
import { FactoryFloor } from './site/factorylife'
import { Doors, Dropping, Sparks, SparksView, WallFx, type WallPiece, snapshot, wallChanges, wallHeight } from './site/fx'
import { Baked, LivePerson, type PersonLook, hash } from './site/kit'
import { buildNav } from './site/nav'
import { OfficeItem } from './site/office'
import { type Target, itemTarget, rayBox } from './site/pick'
import { seatOwners } from './site/seats'
import { buildSpots } from './site/spots'
import { Shoppers, StoreItem } from './site/store'
import { Batch, CUT_H, Ground, STOREY, Structure, type ViewMode, WALL_T } from './site/structure'
import { Heartbeat, type Pulse, useTick } from './site/tick'
import { STAGE_H, VenueItem } from './site/venue'

export { seatOwners }
export type { Target }

export type AreaShape = 'rect' | 'round' | 'diag'
export type SiteTool =
  | { type: 'item'; kind: string; rot: number }
  | { type: 'room'; room: string; shape: AreaShape }
  | { type: 'clear'; shape: AreaShape }
  | { type: 'ground'; id: string; shape: AreaShape }
  | { type: 'edge'; kind: 'wall' | 'glass' | 'door' | 'open' }
  | { type: 'rotate' }
  | { type: 'remove' }
  | null

export interface Edge {
  x: number
  y: number
  side: 'n' | 'w'
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
}

/** The model for one placed item of any kind of site. */
function ItemModel({ kind, item, c }: { kind: SiteKind; item: string; c: ItemCtx }) {
  if (kind === 'office') return <OfficeItem kind={item} c={{ who: c.who, glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed, devices: c.devices, on: c.on, live: c.live, progress: c.progress, busy: c.busy }} />
  if (kind === 'factory') return <FactoryItem kind={item} c={{ running: !!c.running, flow: c.flow, glow: c.glow, seed: c.seed, fill: c.fill }} />
  if (kind === 'store') return <StoreItem kind={item} c={{ products: c.products, glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed, soldOut: c.soldOut }} />
  return <VenueItem kind={item} c={{ glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed, crowd: c.show?.crowd ?? 0, cheer: c.show?.cheer ?? false, show: !!c.show, screen: c.show?.screen, products: c.products }} />
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
function CameraKeys({ span, home }: { span: number; home: [number, number, number] }) {
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

// ---------------------------------------------------------------- the living site

/** Runs the site's clock and the people on it. */
function Day({ crowd, speed }: { crowd: Crowd | null; speed: number }) {
  useTick((dt) => {
    const pace = advanceClock(dt, speed)
    crowd?.step(dt, pace, campus.t)
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
function Pointer({ enabled, targets, crowd, hover, onHover, onPick, consumed }: { enabled: boolean; targets: Target[]; crowd: Crowd | null; hover: React.RefObject<Hover | null>; onHover: (h: Hover | null) => void; onPick: (h: Hover) => void; consumed: React.RefObject<number> }) {
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
      const hint = b.kind === Kind.Applicant ? `Applicant, ${ROLE_INFO[b.role!].name.toLowerCase()}` : `${ROLE_INFO[b.role!].name}. ${describe(b)}`
      if (hover.current?.target.key !== key || hover.current.target.hint !== hint) {
        onHover({ target: { key, kind: b.kind === Kind.Applicant ? 'applicants' : 'person', id: b.id, label: b.name, hint, box: [0, 0, 0, 0, 0, 0], anchor: [b.x, b.y + b.hip + 1.0, b.z] }, body: b })
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
          <Html position={[0, body.hip + 1.05, 0]} center zIndexRange={[30, 20]} style={{ pointerEvents: 'none' }}>
            <Label target={target} />
          </Html>
        </group>
      ) : (
        <>
          <lineSegments geometry={BOX_EDGES} position={[(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]} scale={[b[3] - b[0] + 0.06, b[4] - b[1] + 0.04, b[5] - b[2] + 0.06]} renderOrder={6} userData={{ live: true }}>
            <lineBasicMaterial color={color} toneMapped={false} depthTest={false} transparent opacity={0.95} />
          </lineSegments>
          <Html position={target.anchor} center zIndexRange={[30, 20]} style={{ pointerEvents: 'none' }}>
            <Label target={target} />
          </Html>
        </>
      )}
    </>
  )
}

function Label({ target }: { target: Target }) {
  return (
    <div className="pointer-events-none -translate-y-[calc(50%+10px)] whitespace-nowrap border border-line2 bg-panel/95 px-2 py-[3px] text-center">
      <div className="text-[11px] uppercase tracking-wider text-fg">{target.label}</div>
      {target.hint && <div className="text-[10px] normal-case tracking-normal text-dim">{target.hint}</div>}
    </div>
  )
}

/** Keeps a card on screen: pinned beside its object, but never off the edge of the view. */
const cardPosition = (el: THREE.Object3D, camera: THREE.Camera, size: { width: number; height: number }): number[] => {
  const v = new THREE.Vector3().setFromMatrixPosition(el.matrixWorld).project(camera)
  const x = (v.x * 0.5 + 0.5) * size.width + 14
  const y = (-v.y * 0.5 + 0.5) * size.height - 30
  return [Math.max(8, Math.min(size.width - 276, x)), Math.max(52, Math.min(size.height - 390, y))]
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

export function SiteView({ site, mode, mood, tool, company, color, logo, selectedRoom, sealed, onTile, onEdge, onArea, onPreview, seated = [], idle = [], applicants, onPerson, day = 0, line, producing = false, products = [], busy = 0, show, autoRotate, speed = 0, life, card, onCutOff }: Props) {
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
  const palette = useMemo<Palette>(() => ({ accent, neg, pos: themeColor('pos', '#5fd08a'), warn: themeColor('warn', '#f2b631') }), [accent, neg])
  const areaTool = tool?.type === 'room' || tool?.type === 'clear' || tool?.type === 'ground'
  const shape: AreaShape = tool && 'shape' in tool ? tool.shape : 'rect'
  /** The site shows what the company is doing: clocks run, screens are live, things can be clicked. */
  const lively = !!life && !autoRotate
  const office = site.kind === 'office' ? life?.office : undefined
  const cut = mode === 'cut'

  // a half-finished drag does not survive a change of tool
  useEffect(() => setAnchor(null), [tool?.type, tool && 'room' in tool ? tool.room : ''])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setAnchor(null)
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
  const crowdOn = lively && prefs.walkers && (site.kind === 'office' || site.kind === 'store')
  const crowd = useMemo(() => (crowdOn ? new Crowd() : null), [crowdOn])
  const nav = useMemo(() => buildNav(site), [site, site.rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const spots = useMemo(() => (crowdOn ? buildSpots(site, nav) : []), [site, nav, crowdOn])
  const cutOff = useMemo(() => {
    if (!crowdOn || nav.entry < 0) return 0
    // a room counts as reachable if any of its floor can be walked to from the way in
    const ok = new Set<number>()
    const any = new Set<number>()
    for (let i = 0; i < site.grid.length; i++) {
      const room = site.grid[i]
      if (!room) continue
      any.add(room)
      if (nav.reach[i]) ok.add(room)
    }
    return any.size - ok.size
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

  const occupant = useMemo(() => {
    const map = new Map<string, PersonLook>()
    // someone on a course is not at their desk; someone drawn live is wherever they have walked to
    for (const [id, e] of owners) if (!liveSeats.has(id) && !inTraining(e, day)) map.set(id, { look: e.look, color: ROLE_INFO[e.role].color })
    return map
  }, [owners, day, liveSeats])
  /** Seats whose occupant wants something: a raise, or is close to quitting. Live people carry their own marker. */
  const flags = useMemo(() => {
    const out: { item: SiteItem; color: string }[] = []
    for (const item of site.items) {
      const e = owners.get(item.id)
      if (!e || liveSeats.has(item.id) || inTraining(e, day)) continue
      if (e.ask) out.push({ item, color: '#f2b631' })
      else if (e.morale < 35) out.push({ item, color: neg })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owners, site, site.rev, day, neg, liveSeats])

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
  if (known.site !== site || known.rev !== site.rev) {
    const ids = new Set(site.items.map((i) => i.id))
    if (known.site === site && lively) {
      const fresh = site.items.filter((i) => !known.ids.has(i.id) && ITEMS[site.kind][i.kind])
      if (fresh.length && fresh.length <= 4) setDropping(new Set([...dropping, ...fresh.map((i) => i.id)]))
    }
    setKnown({ site, rev: site.rev, ids })
  }
  const lastItems = useRef(site.items)
  useEffect(() => {
    // a puff where something was sold and carted away
    if (lively) {
      const now = new Set(site.items.map((i) => i.id))
      const gone = lastItems.current.filter((i) => !now.has(i.id) && ITEMS[site.kind][i.kind])
      if (gone.length <= 4) {
        for (const item of gone) {
          const def = ITEMS[site.kind][item.kind]
          const turned = item.rot % 2 === 1
          sparks.puff(item.x - w / 2 + (turned ? def.h : def.w) / 2, item.y - h / 2 + (turned ? def.w : def.h) / 2, Math.max(def.w, def.h) * 0.45, 8)
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
      live: liveKinds && (item.kind === 'server' || item.kind === 'helpdesk' || item.kind === 'screen' || item.kind === 'showcase'),
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
      show,
      fill: Math.round(busy * 5) / 5,
    }
  }
  const sigOf = (items: { item: SiteItem }[], glow: number) =>
    items
      .map(({ item }) => {
        const who = occupant.get(item.id)
        const on = shown.get(item.id)
        return `${item.id}:${item.x},${item.y},${item.rot}:${who ? who.look + who.color : liveSeats.has(item.id) ? 'L' : ''}:${line?.linked.has(item.id) ? 1 : 0}${line?.flow.get(item.id)?.join('') ?? ''}${on ? on.devices.map((p) => p.id).join('') + (on.progress ?? '') : ''}`
      })
      .join('|') + `#${Math.round(glow * 10)}${running ? 'r' : ''}${site.kind === 'factory' ? Math.round(busy * 5) : ''}${company}${logo?.length ?? 0}${color}${productKey}${soldKey}${liveKinds ? 'v' : ''}${researching ? 'R' : ''}${showcaseList[0]?.id ?? ''}${show ? `${show.crowd.toFixed(2)}${show.cheer ? 'c' : ''}${show.presenter ? 'p' : ''}${show.screen?.uuid ?? ''}` : ''}`

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
    return { x, y, edge }
  }

  // ---- cursor
  const preview = useMemo(() => {
    if (!hover || !tool) return null
    if (areaTool) {
      const from = anchor ?? [hover.x, hover.y]
      const all = areaTiles(from[0], from[1], hover.x, hover.y, shape).filter(([x, y]) => inPlot(site, x, y))
      const good = all.filter(([x, y]) => (tool.type === 'clear' ? !!gridAt(site, x, y) : !gridAt(site, x, y) && !(tool.type === 'room' && itemAt(site, x, y))))
      const bad = tool.type === 'room' ? all.filter(([x, y]) => gridAt(site, x, y) || itemAt(site, x, y)) : []
      return { good, bad }
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
  }, [hover?.x, hover?.y, anchor, tool, site, site.rev, areaTool, shape])

  const previewCount = areaTool && anchor ? (preview?.good.length ?? 0) : 0
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
  if (hover && tool?.type === 'edge') {
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
              const t = itemTarget(site, item, 'person', owner.name, `${ROLE_INFO[owner.role].name}${inTraining(owner, day) ? ', away on a course' : liveSeats.has(item.id) ? ': their desk' : ''}`, owner.id)
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
  const shadowSig = `${site.rev}|${standing.rev}|${dropping.size}|${mood}|${mode}|${seated.length}|${liveSeats.size}|${day > 0 ? Math.floor(day / 30) : 0}|${show ? show.crowd.toFixed(1) + show.cheer : ''}|${glowKey}`
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
      <Structure site={standing} mode={mode} glow={mood === 'day' ? 0 : M.glow * 0.6} />

      {/* invisible pick surface over the whole plot */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0.005, 0]}
        onPointerMove={(e) => {
          const t = locate(e)
          if (!hover || hover.x !== t.x || hover.y !== t.y || hover.edge.x !== t.edge.x || hover.edge.y !== t.edge.y || hover.edge.side !== t.edge.side) setHover(t)
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          if (e.delta > 5) return
          // something standing on the floor was clicked, not the floor itself
          if (performance.now() - consumed.current < 250) return
          const t = locate(e)
          if (tool?.type === 'edge') onEdge?.(t.edge)
          else if (areaTool) {
            if (!anchor) setAnchor([t.x, t.y])
            else {
              onArea?.(anchor[0], anchor[1], t.x, t.y)
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
        {lively && <Day crowd={crowd} speed={speed} />}
        {crowd && <People crowd={crowd} cap={site.kind === 'office' ? cap + 8 : cap} neg={neg} />}
        <SparksView sparks={sparks} />
        {site.items.map((item, index) =>
          dropping.has(item.id) && ITEMS[site.kind][item.kind] ? (
            <group key={item.id} position={place(item)} rotation-y={(-item.rot * Math.PI) / 2}>
              <Dropping
                x={place(item)[0]}
                z={place(item)[2]}
                size={Math.max(ITEMS[site.kind][item.kind].w, ITEMS[site.kind][item.kind].h)}
                sparks={sparks}
                onDone={() =>
                  setDropping((cur) => {
                    const next = new Set(cur)
                    next.delete(item.id)
                    return next
                  })
                }
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
        {lively && cut && <Doors site={site} nav={nav} crowd={crowd} height={CUT_H} />}
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
        {site.kind === 'factory' && lively && life?.factory && <FactoryFloor site={site} life={life.factory} sparks={sparks} />}
        {lively && <Pointer enabled={!tool} targets={targets} crowd={crowd} hover={hotRef} onHover={onHover} onPick={onPick} consumed={consumed} />}
        {hot && !tool && hot.target.key !== open?.key && <HoverMark hover={hot} color={accent} />}
        {import.meta.env.DEV && <DevHandle pulse={pulse} crowd={crowd} />}
      </Heartbeat>
      {open && card && !tool && (
        <Html position={open.anchor} calculatePosition={cardPosition} zIndexRange={[40, 31]}>
          {card(open, () => setOpen(null))}
        </Html>
      )}

      {site.kind === 'store' && !crowdOn && <Shoppers spots={shopperSpots} count={Math.round(busy * shopperSpots.length)} />}
      {stage && <LivePerson who={{ look: 4242, color: '#1c1e22' }} p={[stage.x - w / 2 + 3 + 1.1, STAGE_H + 0.012, stage.y - h / 2 + 2 + 0.6]} rotY={Math.PI} arms={show?.cheer ? 'up' : 'down'} />}

      {roomTiles.length > 0 && <Tint tiles={roomTiles} w={w} h={h} color={accent} opacity={0.16} y={0.014} />}
      {sealedTiles.length > 0 && <Tint tiles={sealedTiles} w={w} h={h} color={neg} opacity={0.22} y={0.016} />}
      {preview && preview.good.length > 0 && <Tint tiles={preview.good} w={w} h={h} color={accent} opacity={ghost ? 0.22 : 0.45} />}
      {preview && preview.bad.length > 0 && <Tint tiles={preview.bad} w={w} h={h} color={neg} opacity={0.5} />}
      {ghost}
      {flags.map(({ item, color: c }) => {
        const def = ITEMS.office[item.kind]
        const turned = item.rot % 2 === 1
        return <Marker key={item.id} p={[item.x - w / 2 + (turned ? def.h : def.w) / 2, 1.75, item.y - h / 2 + (turned ? def.w : def.h) / 2]} color={c} />
      })}
      {edgeCursor}

      {Q.shadows > 0 && <StaticShadows sig={shadowSig} />}
      {Q.ao && (
        <EffectComposer multisampling={4}>
          <N8AO halfRes aoRadius={0.8} distanceFalloff={1} intensity={mood === 'night' ? 1.2 : 2} quality="medium" />
        </EffectComposer>
      )}
      {!autoRotate && <CameraKeys span={span} home={home} />}
      <OrbitControls makeDefault target={[0, height * 0.35 + 0.5, 0]} minDistance={near * 6} maxDistance={span * 3 + 40} maxPolarAngle={Math.PI * 0.485} enablePan screenSpacePanning={false} panSpeed={1.3 * prefs.cameraSpeed} rotateSpeed={0.9 * prefs.cameraSpeed} zoomSpeed={1.2 * prefs.cameraSpeed} zoomToCursor={prefs.zoomToPointer} enableDamping dampingFactor={0.2} autoRotate={autoRotate} autoRotateSpeed={0.5} />
    </Canvas>
  )
}
