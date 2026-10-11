// 3D view of a buildable site: the land around it, the rooms and walls, what
// stands in them, and the cursor for building.
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { ITEMS, type LineStats, SITE_TIERS, areaTiles, canPlace, gridAt, inPlot, isBoundary, itemAt, reachable, tilesOf } from '../sim/sites'
import { ROLE_INFO } from '../sim/staff'
import type { Employee, Product, Site, SiteItem } from '../sim/types'
import { themeColor } from '../store/theme'
import { Environs, MOODS, type Mood } from './site/env'
import { FactoryItem } from './site/factory'
import { Baked, LivePerson, type PersonLook, hash } from './site/kit'
import { OfficeItem } from './site/office'
import { Shoppers, StoreItem } from './site/store'
import { Batch, CUT_H, Ground, STOREY, Structure, type ViewMode, WALL_T } from './site/structure'
import { STAGE_H, VenueItem } from './site/venue'

export type AreaShape = 'rect' | 'round'
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
  /** Office: seated employees, in desk order. */
  seated?: Employee[]
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

export function SiteView({ site, mode, mood, tool, company, color, logo, selectedRoom, sealed, onTile, onEdge, onArea, onPreview, seated = [], line, producing = false, products = [], busy = 0, show, autoRotate }: Props) {
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

  // a half-finished drag does not survive a change of tool
  useEffect(() => setAnchor(null), [tool?.type, tool && 'room' in tool ? tool.room : ''])
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setAnchor(null)
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // who sits where: seats are filled in the order they were built
  const occupant = useMemo(() => {
    const map = new Map<string, PersonLook>()
    if (site.kind !== 'office') return map
    const seats = reachable(site).filter((i) => ITEMS.office[i.kind]?.seats)
    seats.forEach((seat, i) => {
      const e = seated[i]
      if (e) map.set(seat.id, { look: e.look, color: ROLE_INFO[e.role].color })
    })
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev, seated])

  // free floor next to the fixtures, for shoppers to stand on
  const shopperSpots = useMemo(() => {
    if (site.kind !== 'store') return []
    const spots: [number, number][] = []
    for (let i = 0; i < w * h; i++) {
      const x = Math.floor(hash(i * 3 + 1) * w)
      const y = Math.floor(hash(i * 7 + 2) * h)
      if (!gridAt(site, x, y) || itemAt(site, x, y)) continue
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
  const sigOf = (items: { item: SiteItem }[]) =>
    items
      .map(({ item }) => {
        const who = occupant.get(item.id)
        return `${item.id}:${item.x},${item.y},${item.rot}:${who ? who.look + who.color : ''}:${line?.linked.has(item.id) ? 1 : 0}${line?.flow.get(item.id)?.join('') ?? ''}`
      })
      .join('|') + `#${glowKey}${running ? 'r' : ''}${company}${logo?.length ?? 0}${color}${productKey}${show ? `${show.crowd.toFixed(2)}${show.cheer ? 'c' : ''}${show.presenter ? 'p' : ''}${show.screen?.uuid ?? ''}` : ''}`

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

  const stage = site.kind === 'venue' && show?.presenter ? site.items.find((i) => i.kind === 'stage') : undefined
  const sun: [number, number, number] = [M.sunDir[0] * span * 1.4, M.sunDir[1] * span * 1.4, M.sunDir[2] * span * 1.4]
  const far = span * 7 + 420
  const near = Math.min(1.5, Math.max(0.4, span / 40))
  const reach = Math.max(14, span * 0.8)
  const height = mode === 'full' ? site.floors * STOREY : 0
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ fov: 30, near, far, position: [span * 0.75, span * 0.95 + height, span * 1.2 + 6] }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: mood === 'night' ? 1.25 : 1, powerPreference: 'high-performance' }}>
      <color attach="background" args={[M.sky]} />
      <fog attach="fog" args={[M.sky, span * 3 + 80, far * 0.9]} />
      <hemisphereLight args={[mood === 'night' ? '#6a7fa8' : '#fff4e6', mood === 'night' ? '#14161c' : '#4a4338', M.hemi + (mood === 'night' ? 0.35 : 0)]} />
      <directionalLight
        color={M.sunColor}
        intensity={M.sun}
        position={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
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
      {mood !== 'day' && <pointLight position={[0, 7, 0]} color="#ffd9a8" intensity={(mood === 'night' ? 5 : 2) * span} distance={span * 1.5} decay={1.4} />}
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
          if (!hover || hover.x !== t.x || hover.y !== t.y || hover.edge.x !== t.edge.x || hover.edge.y !== t.edge.y || hover.edge.side !== t.edge.side) setHover(t)
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
            const glow = M.glow
            return (
              <group key={item.id} position={[item.x - w / 2 + fw / 2, 0, item.y - h / 2 + fh / 2]} rotation-y={(-item.rot * Math.PI) / 2}>
                {site.kind === 'office' && <OfficeItem kind={item.kind} c={{ who: occupant.get(item.id), glow, company, logo, color, seed }} />}
                {site.kind === 'factory' && <FactoryItem kind={item.kind} c={{ running: (line?.linked.has(item.id) ?? false) && running, flow, glow, seed }} />}
                {site.kind === 'store' && <StoreItem kind={item.kind} c={{ products, glow, company, logo, color, seed }} />}
                {site.kind === 'venue' && <VenueItem kind={item.kind} c={{ glow, company, logo, color, seed, crowd: show?.crowd ?? 0, cheer: show?.cheer ?? false, show: !!show, screen: show?.screen, products }} />}
              </group>
            )
          })}
        </Baked>
      ))}
      {site.kind === 'store' && <Shoppers spots={shopperSpots} count={Math.round(busy * shopperSpots.length)} />}
      {stage && <LivePerson who={{ look: 4242, color: '#1c1e22' }} p={[stage.x - w / 2 + 3 + 1.1, STAGE_H + 0.012, stage.y - h / 2 + 2 + 0.6]} rotY={Math.PI} arms={show?.cheer ? 'up' : 'down'} />}

      {roomTiles.length > 0 && <Tint tiles={roomTiles} w={w} h={h} color={accent} opacity={0.16} y={0.014} />}
      {sealedTiles.length > 0 && <Tint tiles={sealedTiles} w={w} h={h} color={neg} opacity={0.22} y={0.016} />}
      {preview && preview.good.length > 0 && <Tint tiles={preview.good} w={w} h={h} color={accent} opacity={0.45} />}
      {preview && preview.bad.length > 0 && <Tint tiles={preview.bad} w={w} h={h} color={neg} opacity={0.45} />}
      {edgeCursor}

      <EffectComposer multisampling={4}>
        <N8AO halfRes aoRadius={0.8} distanceFalloff={1} intensity={mood === 'night' ? 1.2 : 2} quality="medium" />
      </EffectComposer>
      {import.meta.env.DEV && <DevHandle />}
      <OrbitControls makeDefault target={[0, height * 0.35 + 0.5, 0]} minDistance={near * 6} maxDistance={span * 3 + 40} maxPolarAngle={Math.PI * 0.485} enablePan panSpeed={0.8} autoRotate={autoRotate} autoRotateSpeed={0.5} />
    </Canvas>
  )
}
