// 3D office: a tiled floor you furnish, with staff sitting at their desks.
// One tile is one unit. The office is centred on the origin.
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { ROLE_INFO } from '../sim/staff'
import type { Employee, Office, OfficeItem } from '../sim/types'
import { themeColor } from '../store/theme'

interface Props {
  office: Office
  /** Seated employees in desk order. */
  seated: Employee[]
  /** True while a build or remove tool is armed, to show the tile cursor. */
  armed: boolean
  removing: boolean
  onTile: (x: number, y: number, item: OfficeItem | undefined) => void
}

const SKIN = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#6b4423']
const WOOD = '#b08a62'
const METAL = '#8b9198'
const DARK = '#22262b'

function Box({ p, s, c, r = 0.7, m = 0, e }: { p: [number, number, number]; s: [number, number, number]; c: string; r?: number; m?: number; e?: string }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={r} metalness={m} emissive={e ?? '#000000'} emissiveIntensity={e ? 0.9 : 0} />
    </mesh>
  )
}

function Chair({ z, flip = false }: { z: number; flip?: boolean }) {
  const d = flip ? -1 : 1
  return (
    <group position={[0, 0, z]}>
      <Box p={[0, 0.3, 0]} s={[0.3, 0.05, 0.3]} c={DARK} />
      <Box p={[0, 0.5, 0.14 * d]} s={[0.3, 0.36, 0.04]} c={DARK} />
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
        <meshStandardMaterial color={METAL} metalness={0.8} roughness={0.35} />
      </mesh>
    </group>
  )
}

function Person({ e, z }: { e: Employee; z: number }) {
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.11, 0.2, 6, 12]} />
        <meshStandardMaterial color={ROLE_INFO[e.role].color} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.86, -0.01]} castShadow>
        <sphereGeometry args={[0.09, 16, 12]} />
        <meshStandardMaterial color={SKIN[e.look % SKIN.length]} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.9, 0.012]} castShadow>
        <sphereGeometry args={[0.092, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.1]} />
        <meshStandardMaterial color={['#1c1612', '#3b2a1e', '#6b4a2e', '#c9a46a', '#101010'][(e.look >> 3) % 5]} roughness={0.9} />
      </mesh>
    </group>
  )
}

function Item({ item, occupant }: { item: OfficeItem; occupant?: Employee }) {
  switch (item.kind) {
    case 'desk':
      return (
        <>
          <Box p={[0, 0.5, -0.12]} s={[0.92, 0.04, 0.5]} c={WOOD} r={0.55} />
          <Box p={[-0.42, 0.25, -0.12]} s={[0.04, 0.5, 0.46]} c={DARK} />
          <Box p={[0.42, 0.25, -0.12]} s={[0.04, 0.5, 0.46]} c={DARK} />
          <Box p={[0, 0.72, -0.28]} s={[0.42, 0.26, 0.02]} c="#0b0c0e" r={0.3} />
          <Box p={[0, 0.72, -0.268]} s={[0.39, 0.23, 0.004]} c="#1a2a3a" e={occupant ? '#7fb2e6' : undefined} />
          <Box p={[0, 0.56, -0.28]} s={[0.04, 0.1, 0.04]} c={DARK} />
          <Box p={[0, 0.53, -0.05]} s={[0.3, 0.012, 0.1]} c="#2b2f36" />
          <Chair z={0.28} />
          {occupant && <Person e={occupant} z={0.26} />}
        </>
      )
    case 'bench':
      return (
        <>
          <Box p={[0, 0.6, 0]} s={[0.92, 0.05, 0.56]} c="#d6dade" r={0.3} m={0.4} />
          <Box p={[-0.4, 0.3, 0]} s={[0.05, 0.6, 0.5]} c={METAL} m={0.7} r={0.4} />
          <Box p={[0.4, 0.3, 0]} s={[0.05, 0.6, 0.5]} c={METAL} m={0.7} r={0.4} />
          <Box p={[-0.22, 0.75, -0.08]} s={[0.3, 0.24, 0.26]} c="#e9ecef" r={0.4} />
          <Box p={[-0.22, 0.78, 0.052]} s={[0.2, 0.1, 0.004]} c="#0c1a14" e="#59e0a0" />
          <mesh position={[0.22, 0.72, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.07, 0.2, 16]} />
            <meshPhysicalMaterial color="#9fe3c4" transmission={0.6} roughness={0.1} thickness={0.1} />
          </mesh>
        </>
      )
    case 'server':
      return (
        <>
          <Box p={[0, 0.7, 0]} s={[0.56, 1.4, 0.7]} c="#15171a" r={0.45} m={0.5} />
          {[0.25, 0.5, 0.75, 1.0, 1.25].map((y) => (
            <Box key={y} p={[0, y, 0.352]} s={[0.44, 0.02, 0.004]} c="#0a1a10" e={y === 0.75 ? '#ffb347' : '#46e08a'} />
          ))}
        </>
      )
    case 'meeting':
      return (
        <>
          <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.36, 0.36, 0.04, 32]} />
            <meshStandardMaterial color={WOOD} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.25, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.12, 0.5, 12]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
          <group rotation={[0, Math.PI / 2, 0]}>
            <Chair z={0.4} />
            <Chair z={-0.4} flip />
          </group>
        </>
      )
    case 'coffee':
      return (
        <>
          <Box p={[0, 0.32, -0.15]} s={[0.9, 0.64, 0.42]} c="#e8e2d8" r={0.6} />
          <Box p={[0, 0.655, -0.15]} s={[0.94, 0.03, 0.46]} c="#2a2c30" r={0.35} />
          <Box p={[-0.2, 0.82, -0.18]} s={[0.24, 0.3, 0.26]} c="#16181b" r={0.3} m={0.6} />
          <Box p={[-0.2, 0.86, -0.048]} s={[0.1, 0.04, 0.004]} c="#201008" e="#ff9a3c" />
          <mesh position={[0.2, 0.71, -0.12]} castShadow>
            <cylinderGeometry args={[0.035, 0.03, 0.08, 12]} />
            <meshStandardMaterial color="#f4f4f4" roughness={0.4} />
          </mesh>
        </>
      )
    case 'sofa':
      return (
        <>
          <Box p={[0, 0.2, 0]} s={[0.9, 0.24, 0.5]} c="#4a5568" r={0.95} />
          <Box p={[0, 0.42, -0.2]} s={[0.9, 0.32, 0.12]} c="#414b5c" r={0.95} />
          <Box p={[-0.42, 0.34, 0]} s={[0.08, 0.2, 0.5]} c="#414b5c" r={0.95} />
          <Box p={[0.42, 0.34, 0]} s={[0.08, 0.2, 0.5]} c="#414b5c" r={0.95} />
        </>
      )
    case 'plant':
      return (
        <>
          <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.16, 0.12, 0.28, 16]} />
            <meshStandardMaterial color="#c9c2b6" roughness={0.8} />
          </mesh>
          {[[0, 0.55, 0, 0.24], [0.12, 0.42, 0.08, 0.17], [-0.12, 0.44, -0.06, 0.18], [0.02, 0.76, -0.04, 0.15]].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]} castShadow>
              <icosahedronGeometry args={[r, 1]} />
              <meshStandardMaterial color={i % 2 ? '#3f7d4d' : '#356b42'} roughness={0.9} flatShading />
            </mesh>
          ))}
        </>
      )
    case 'wall':
      return (
        <>
          <Box p={[0, 0.7, 0]} s={[1, 1.4, 0.07]} c="#d9d5cd" r={0.9} />
          <Box p={[0, 1.42, 0]} s={[1, 0.04, 0.09]} c={METAL} m={0.7} r={0.4} />
        </>
      )
  }
}

export function OfficeView({ office, seated, armed, removing, onTile }: Props) {
  const { w, h } = office
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const at = (x: number, y: number) => office.items.find((i) => i.x === x && i.y === y)
  const span = Math.max(w, h)
  const accent = themeColor('accent', '#ff6b1a')
  const neg = themeColor('neg', '#ff4d4f')

  const grid = useMemo(() => {
    const pts: number[] = []
    for (let x = 0; x <= w; x++) pts.push(x - w / 2, 0.004, -h / 2, x - w / 2, 0.004, h / 2)
    for (let y = 0; y <= h; y++) pts.push(-w / 2, 0.004, y - h / 2, w / 2, 0.004, y - h / 2)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [w, h])

  const desks = office.items.filter((i) => i.kind === 'desk')
  const occupant = new Map(desks.map((d, i) => [d.id, seated[i]]))
  const tileOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => ({ x: Math.min(w - 1, Math.max(0, Math.floor(e.point.x + w / 2))), y: Math.min(h - 1, Math.max(0, Math.floor(e.point.z + h / 2))) })
  const hovered = hover && at(hover.x, hover.y)
  const cursorBad = hover && (removing ? !hovered : !!hovered)

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 32, near: 0.1, far: 400, position: [span * 0.75, span * 0.8, span * 1.05] }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
      <color attach="background" args={['#0c0b0a']} />
      <hemisphereLight args={['#fff4e6', '#3a352f', 0.55]} />
      <directionalLight
        color="#fff0dc"
        intensity={2.2}
        position={[span * 0.6, span * 1.2, span * 0.4]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={0.5}
        shadow-camera-far={span * 4}
      />
      <Environment resolution={128} frames={1} environmentIntensity={0.35}>
        <color attach="background" args={['#101010']} />
        <Lightformer form="rect" intensity={3} color="#fff1e0" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={1.5} color="#cfe0ff" position={[-8, 2, 0]} scale={[4, 6, 1]} target={[0, 0, 0]} />
      </Environment>

      {/* ground outside, then the office floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshLambertMaterial color="#161412" />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        receiveShadow
        onPointerMove={(e) => {
          const t = tileOf(e)
          if (!hover || hover.x !== t.x || hover.y !== t.y) setHover(t)
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          if (e.delta > 5) return
          const t = tileOf(e)
          onTile(t.x, t.y, at(t.x, t.y))
        }}
      >
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color="#8a7460" roughness={0.75} />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#000000" transparent opacity={0.16} />
      </lineSegments>

      {/* two full walls with windows, two low kerbs so the view stays open */}
      <mesh position={[0, 1.1, -h / 2 - 0.06]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.24, 2.2, 0.12]} />
        <meshStandardMaterial color="#e2ddd4" roughness={0.9} />
      </mesh>
      <mesh position={[-w / 2 - 0.06, 1.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.12, 2.2, h]} />
        <meshStandardMaterial color="#d8d3ca" roughness={0.9} />
      </mesh>
      {Array.from({ length: Math.floor(w / 2) }, (_, i) => (
        <mesh key={`wb${i}`} position={[-w / 2 + 1 + i * 2, 1.3, -h / 2 + 0.005]}>
          <planeGeometry args={[1.3, 1.0]} />
          <meshStandardMaterial color="#9cc4e8" emissive="#a9d0f2" emissiveIntensity={0.55} roughness={0.1} />
        </mesh>
      ))}
      {Array.from({ length: Math.floor(h / 2) }, (_, i) => (
        <mesh key={`wl${i}`} position={[-w / 2 + 0.005, 1.3, -h / 2 + 1 + i * 2]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[1.3, 1.0]} />
          <meshStandardMaterial color="#9cc4e8" emissive="#a9d0f2" emissiveIntensity={0.55} roughness={0.1} />
        </mesh>
      ))}
      <mesh position={[0, 0.08, h / 2 + 0.05]} receiveShadow>
        <boxGeometry args={[w + 0.24, 0.16, 0.1]} />
        <meshStandardMaterial color="#3a3531" />
      </mesh>
      <mesh position={[w / 2 + 0.05, 0.08, 0]} receiveShadow>
        <boxGeometry args={[0.1, 0.16, h]} />
        <meshStandardMaterial color="#3a3531" />
      </mesh>

      {office.items.map((item) => (
        <group key={item.id} position={[item.x - w / 2 + 0.5, 0, item.y - h / 2 + 0.5]} rotation-y={(-item.rot * Math.PI) / 2}>
          <Item item={item} occupant={occupant.get(item.id)} />
        </group>
      ))}

      {hover && (armed || hovered) && (
        <mesh rotation-x={-Math.PI / 2} position={[hover.x - w / 2 + 0.5, 0.012, hover.y - h / 2 + 0.5]}>
          <planeGeometry args={[0.96, 0.96]} />
          <meshBasicMaterial color={armed && cursorBad ? neg : accent} transparent opacity={armed ? 0.45 : 0.2} />
        </mesh>
      )}

      <EffectComposer multisampling={4}>
        <N8AO aoRadius={0.6} distanceFalloff={1} intensity={2} quality="medium" />
      </EffectComposer>
      <OrbitControls makeDefault target={[0, 0.4, 0]} minDistance={4} maxDistance={span * 3.2} maxPolarAngle={Math.PI * 0.47} enablePan panSpeed={0.6} />
    </Canvas>
  )
}
