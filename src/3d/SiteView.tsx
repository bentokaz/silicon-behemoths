// 3D view of a buildable site (office, factory or store): the floor, the
// building around it, everything placed on it, and the cursor for building.
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { FLOORS, ITEMS, type LineStats, SITE_TIERS, itemAt, tilesOf, validTile } from '../sim/sites'
import { ROLE_INFO } from '../sim/staff'
import type { Employee, Product, Site, SiteItem, SiteWall } from '../sim/types'
import { themeColor } from '../store/theme'
import { FactoryItem } from './site/factory'
import { B, DARK, type PersonLook, WHITE, hash } from './site/kit'
import { OfficeItem } from './site/office'
import { MOODS, type Mood, Shell } from './site/shells'
import { Shoppers, StoreItem } from './site/store'

export type SiteTool =
  | { type: 'item'; kind: string; rot: number }
  | { type: 'wall'; kind: SiteWall['kind'] }
  | { type: 'floor'; id: string }
  | { type: 'rotate' }
  | { type: 'remove' }
  | null

export interface Edge {
  x: number
  y: number
  side: 'n' | 'w'
}

interface Props {
  site: Site
  mood: Mood
  tool: SiteTool
  company: string
  color: string
  logo?: string
  onTile: (x: number, y: number, item: SiteItem | undefined) => void
  onEdge: (edge: Edge) => void
  /** Office: seated employees, in desk order. */
  seated?: Employee[]
  /** Factory: the line, and whether it has work. */
  line?: LineStats | null
  producing?: boolean
  /** Store: what is on sale, and how busy the store is (0-1). */
  products?: Product[]
  busy?: number
}

const WALL_H = 2.5

function WallSegment({ wall, w, h }: { wall: SiteWall; w: number; h: number }) {
  const x = wall.x - w / 2 + (wall.side === 'n' ? 0.5 : 0)
  const z = wall.y - h / 2 + (wall.side === 'w' ? 0.5 : 0)
  return (
    <group position={[x, 0, z]} rotation={[0, wall.side === 'w' ? Math.PI / 2 : 0, 0]}>
      {wall.kind === 'wall' && <B p={[0, WALL_H / 2, 0]} s={[1, WALL_H, 0.1]} c="#e6e2da" r={0} rough={0.9} />}
      {wall.kind === 'glass' && (
        <>
          <B p={[0, WALL_H / 2, 0]} s={[1, WALL_H, 0.03]} c="#bfe0f2" glass={0.2} r={0} cast={false} />
          <B p={[0, WALL_H - 0.03, 0]} s={[1, 0.06, 0.07]} c={DARK} r={0} />
          <B p={[0, 0.03, 0]} s={[1, 0.06, 0.07]} c={DARK} r={0} cast={false} />
          <B p={[-0.5, WALL_H / 2, 0]} s={[0.05, WALL_H, 0.07]} c={DARK} r={0} />
        </>
      )}
      {wall.kind === 'door' && (
        <>
          <B p={[-0.47, WALL_H / 2, 0]} s={[0.06, WALL_H, 0.12]} c={WHITE} r={0} />
          <B p={[0.47, WALL_H / 2, 0]} s={[0.06, WALL_H, 0.12]} c={WHITE} r={0} />
          <B p={[0, WALL_H - 0.2, 0]} s={[1, 0.4, 0.1]} c="#e6e2da" r={0} />
          {/* the leaf stands ajar */}
          <group position={[-0.44, 0, 0]} rotation={[0, 1.1, 0]}>
            <B p={[0.42, 1.05, 0]} s={[0.84, 2.1, 0.04]} c="#8a6a4f" r={0.006} rough={0.5} />
            <B p={[0.76, 1.0, 0.035]} s={[0.03, 0.12, 0.03]} c="#c9cdd2" r={0.01} metal={0.9} rough={0.3} cast={false} />
          </group>
        </>
      )}
    </group>
  )
}

/** Floor tiles, grouped into one instanced mesh per finish. */
function Floor({ site, dimming, base }: { site: Site; dimming: number; base?: string }) {
  const meshes = useMemo(() => {
    const defs = FLOORS[site.kind]
    const byId = new Map<string, [number, number][]>()
    for (let x = 0; x < site.w; x++) {
      for (let y = 0; y < site.h; y++) {
        if (!validTile(site, x, y)) continue
        const id = site.floor[`${x},${y}`] ?? base ?? defs[0].id
        if (!byId.has(id)) byId.set(id, [])
        byId.get(id)!.push([x, y])
      }
    }
    const geo = new THREE.BoxGeometry(1, 0.06, 1)
    const out: THREE.InstancedMesh[] = []
    for (const [id, tiles] of byId) {
      const def = defs.find((f) => f.id === id) ?? defs[0]
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: def.color, roughness: def.rough }), tiles.length)
      const mx = new THREE.Matrix4()
      const col = new THREE.Color()
      tiles.forEach(([x, y], i) => {
        mx.makeTranslation(x - site.w / 2 + 0.5, -0.03, y - site.h / 2 + 0.5)
        m.setMatrixAt(i, mx)
        // a little variation between boards and slabs
        m.setColorAt(i, col.set(def.color).multiplyScalar((0.93 + hash(x * 31 + y * 17) * 0.14) * dimming))
      })
      m.receiveShadow = true
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      out.push(m)
    }
    return out
  }, [site, site.floor, site.w, site.h, dimming, base])
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

export function SiteView({ site, mood, tool, company, color, logo, onTile, onEdge, seated = [], line, producing = false, products = [], busy = 0 }: Props) {
  const { w, h } = site
  const tier = SITE_TIERS[site.kind][site.tier]
  const M = MOODS[mood]
  const span = Math.max(w, h)
  const [hover, setHover] = useState<{ x: number; y: number; edge: Edge } | null>(null)
  const accent = themeColor('accent', '#ff6b1a')
  const neg = themeColor('neg', '#ff4d4f')
  const lite = site.items.length > 220

  // who sits where: seats are filled in the order they were built
  const occupant = useMemo(() => {
    const map = new Map<string, PersonLook>()
    if (site.kind !== 'office') return map
    const seats = site.items.filter((i) => ITEMS.office[i.kind]?.seats)
    seats.forEach((seat, i) => {
      const e = seated[i]
      if (e) map.set(seat.id, { look: e.look, color: ROLE_INFO[e.role].color })
    })
    return map
  }, [site, site.items, seated])

  // free floor next to the fixtures, for shoppers to stand on
  const shopperSpots = useMemo(() => {
    if (site.kind !== 'store') return []
    const spots: [number, number][] = []
    for (let i = 0; i < w * h; i++) {
      const x = Math.floor(hash(i * 3 + 1) * w)
      const y = Math.floor(hash(i * 7 + 2) * h)
      if (!validTile(site, x, y) || itemAt(site, x, y)) continue
      if (spots.some(([sx, sz]) => Math.abs(sx - (x - w / 2 + 0.5)) < 0.9 && Math.abs(sz - (y - h / 2 + 0.5)) < 0.9)) continue
      spots.push([x - w / 2 + 0.5 + (hash(i) - 0.5) * 0.3, y - h / 2 + 0.5 + (hash(i + 9) - 0.5) * 0.3])
      if (spots.length >= 14) break
    }
    return spots
  }, [site, site.items, w, h])

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
  let cursor: React.ReactNode = null
  if (hover && tool) {
    if (tool.type === 'wall') {
      const ex = hover.edge.x - w / 2 + (hover.edge.side === 'n' ? 0.5 : 0)
      const ez = hover.edge.y - h / 2 + (hover.edge.side === 'w' ? 0.5 : 0)
      cursor = (
        <mesh position={[ex, WALL_H / 2, ez]} rotation={[0, hover.edge.side === 'w' ? Math.PI / 2 : 0, 0]}>
          <boxGeometry args={[1, WALL_H, 0.12]} />
          <meshBasicMaterial color={accent} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )
    } else {
      const def = tool.type === 'item' ? ITEMS[site.kind][tool.kind] : undefined
      const tiles = def && tool.type === 'item' ? tilesOf(def, hover.x, hover.y, tool.rot) : ([[hover.x, hover.y]] as [number, number][])
      const target = itemAt(site, hover.x, hover.y)
      const bad = tool.type === 'item' ? tiles.some(([x, y]) => !validTile(site, x, y) || itemAt(site, x, y)) : tool.type === 'floor' ? !validTile(site, hover.x, hover.y) : !target
      cursor = tiles.map(([x, y]) => (
        <mesh key={`${x},${y}`} rotation-x={-Math.PI / 2} position={[x - w / 2 + 0.5, 0.02, y - h / 2 + 0.5]}>
          <planeGeometry args={[0.94, 0.94]} />
          <meshBasicMaterial color={bad ? neg : accent} transparent opacity={0.5} depthWrite={false} />
        </mesh>
      ))
    }
  }

  const sun: [number, number, number] = [M.sunDir[0] * span * 1.4, M.sunDir[1] * span * 1.4, M.sunDir[2] * span * 1.4]
  const far = site.shape === 'ring' ? 900 : 600
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 30, near: 0.2, far, position: [span * 0.85, span * (site.shape === 'ring' ? 0.8 : 1.0), span * 1.25] }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: mood === 'night' ? 1.25 : 1 }}>
      <color attach="background" args={[M.sky]} />
      <fog attach="fog" args={[M.sky, span * 3.5, far * 0.85]} />
      <hemisphereLight args={[mood === 'night' ? '#5a6f9a' : '#fff4e6', mood === 'night' ? '#101216' : '#4a4338', M.hemi]} />
      <directionalLight
        color={M.sunColor}
        intensity={M.sun}
        position={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-span * 0.95}
        shadow-camera-right={span * 0.95}
        shadow-camera-top={span * 0.95}
        shadow-camera-bottom={-span * 0.95}
        shadow-camera-near={1}
        shadow-camera-far={span * 5}
      />
      {/* at night the room is lit from within */}
      {mood !== 'day' && site.shape !== 'ring' && <pointLight position={[0, 3.2, 0]} color="#ffd9a8" intensity={mood === 'night' ? span * 9 : span * 3} distance={span * 1.6} decay={1.6} />}
      <Environment resolution={128} frames={1} environmentIntensity={mood === 'night' ? 0.12 : 0.4}>
        <color attach="background" args={[M.sky]} />
        <Lightformer form="rect" intensity={3} color="#fff1e0" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#cfe0ff" position={[-8, 2, 0]} scale={[4, 6, 1]} target={[0, 0, 0]} />
      </Environment>

      <Shell shell={tier.shell} w={w} h={h} mood={mood} company={company} color={color} logo={logo} />
      <Floor site={site} dimming={mood === 'night' ? 0.75 : 1} base={tier.shell === 'garage' ? 'concrete' : undefined} />

      {/* invisible pick surface over the whole footprint */}
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
          if (tool?.type === 'wall') onEdge(t.edge)
          else onTile(t.x, t.y, itemAt(site, t.x, t.y))
        }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {site.walls.map((wall) => (
        <WallSegment key={wall.id} wall={wall} w={w} h={h} />
      ))}

      {site.items.map((item, index) => {
        const def = ITEMS[site.kind][item.kind]
        if (!def) return null
        const turned = item.rot % 2 === 1
        const fw = turned ? def.h : def.w
        const fh = turned ? def.w : def.h
        const seed = Math.floor(hash(item.x * 13 + item.y * 7 + index) * 1000)
        const linked = line?.linked.has(item.id) ?? false
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
            {site.kind === 'office' && <OfficeItem kind={item.kind} c={{ who: occupant.get(item.id), lite, glow: M.glow, company, logo, seed }} />}
            {site.kind === 'factory' && <FactoryItem kind={item.kind} c={{ running: linked && !!line?.running && producing, flow, glow: M.glow, seed }} />}
            {site.kind === 'store' && <StoreItem kind={item.kind} c={{ products, glow: M.glow, company, logo, seed, staffed: true }} />}
          </group>
        )
      })}
      {site.kind === 'store' && <Shoppers spots={shopperSpots} count={Math.round(busy * shopperSpots.length)} />}

      {cursor}

      <EffectComposer multisampling={4}>
        <N8AO aoRadius={0.7} distanceFalloff={1} intensity={mood === 'night' ? 1.2 : 2} quality="medium" />
      </EffectComposer>
      <OrbitControls makeDefault target={[0, 0.6, 0]} minDistance={3} maxDistance={span * 3.4} maxPolarAngle={Math.PI * 0.485} enablePan panSpeed={0.7} />
    </Canvas>
  )
}
