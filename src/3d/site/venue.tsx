// Event venue pieces: stage, screen, rigging and seating. One unit is one
// metre and one floor tile. The stage and screen face +Z; seating faces -Z,
// so with rotation left alone the audience looks north at the stage.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Product } from '../../sim/types'
import { B, C, DARK, S, STEEL, Sign, WALNUT, hash } from './kit'
import { OfficeItem } from './office'
import { DisplayTable } from './store'

export interface VenueCtx {
  glow: number
  company: string
  logo?: string
  color: string
  seed: number
  /** Share of seats taken, 0-1, and whether the crowd is on its feet. */
  crowd: number
  cheer: boolean
  /** True while a show is running: lights sweep and the screen is live. */
  show: boolean
  /** What the big screen shows during a show. */
  screen?: THREE.Texture
  products: Product[]
}

export const STAGE_H = 0.9
const SHIRTS = ['#c9553d', '#31506b', '#e9e4da', '#3f7d4d', '#d6a24f', '#6a5a7a', '#2c3036', '#8a5a44', '#4f8fd6']
const SKIN = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#6b4423']
const HAIR = ['#1c1612', '#3b2a1e', '#6b4a2e', '#c9a46a', '#101010']

/** A seated member of the audience, from the lap up: the row in front hides the rest. */
function Spectator({ x, y, z, n, cheer }: { x: number; y: number; z: number; n: number; cheer: boolean }) {
  const shirt = SHIRTS[Math.floor(hash(n) * SHIRTS.length)]
  const skin = SKIN[Math.floor(hash(n + 1) * SKIN.length)]
  const up = cheer && hash(n + 2) > 0.35
  return (
    <group position={[x, y, z]}>
      <B p={[0, 0.06, -0.14]} s={[0.3, 0.12, 0.36]} c="#2b3140" r={0.04} cast={false} />
      <B p={[0, 0.3, 0.02]} s={[0.32, 0.5, 0.2]} c={shirt} r={0.07} rough={0.9} />
      <S p={[0, 0.7, 0.02]} r={0.105} c={skin} detail={1} rough={0.75} cast={false} />
      <S p={[0, 0.735, 0.035]} r={0.11} c={HAIR[Math.floor(hash(n + 3) * HAIR.length)]} detail={1} rough={0.95} scale={[1, 0.8, 1]} cast={false} />
      {up && (
        <>
          <B p={[-0.22, 0.66, 0]} s={[0.08, 0.42, 0.08]} c={shirt} r={0.03} rot={[0, 0, 0.25]} cast={false} />
          <B p={[0.22, 0.66, 0]} s={[0.08, 0.42, 0.08]} c={shirt} r={0.03} rot={[0, 0, -0.25]} cast={false} />
        </>
      )}
    </group>
  )
}

/** Two rows of six seats on a riser `h` metres high. */
function SeatBlock({ h, c }: { h: number; c: VenueCtx }) {
  const step = h > 0 ? 0.24 : 0
  return (
    <>
      {h > 0 && <B p={[0, h / 2, 0]} s={[2.98, h, 1.98]} c="#2b2d31" r={0.01} rough={0.8} />}
      {step > 0 && <B p={[0, h + step / 2, 0.5]} s={[2.98, step, 0.98]} c="#2b2d31" r={0.01} rough={0.8} />}
      {[0, 1].map((row) => {
        const base = h + row * step
        const z = row ? 0.56 : -0.44
        return (
          <group key={row}>
            {Array.from({ length: 6 }, (_, i) => {
              const x = -1.25 + i * 0.5
              const n = c.seed * 31 + row * 7 + i
              return (
                <group key={i}>
                  <B p={[x, base + 0.21, z]} s={[0.06, 0.42, 0.34]} c={DARK} r={0.008} cast={false} />
                  <B p={[x, base + 0.455, z]} s={[0.44, 0.08, 0.42]} c={c.color} r={0.03} rough={0.95} />
                  <B p={[x, base + 0.76, z + 0.2]} s={[0.44, 0.56, 0.06]} c={c.color} r={0.03} rough={0.95} />
                  {hash(n + 11) < c.crowd && <Spectator x={x} y={base + 0.495} z={z} n={n} cheer={c.cheer} />}
                </group>
              )
            })}
          </group>
        )
      })}
    </>
  )
}

/** A beam of light swinging from a lamp. Live: never baked. */
function Beam({ p, color, phase }: { p: [number, number, number]; color: string; phase: number }) {
  const ref = useRef<THREE.Group>(null)
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), [color])
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * 0.6 + phase
    ref.current.rotation.set(0.9 + Math.sin(t) * 0.25, 0, Math.sin(t * 0.7) * 0.5)
  })
  return (
    <group ref={ref} position={p}>
      <mesh position={[0, -4.5, 0]} material={material} userData={{ live: true }}>
        <cylinderGeometry args={[0.08, 1.3, 9, 16, 1, true]} />
      </mesh>
    </group>
  )
}

/** The model for one venue item. Kinds shared with the office use the office model. */
export function VenueItem({ kind, c }: { kind: string; c: VenueCtx }) {
  switch (kind) {
    case 'stage':
      return (
        <>
          <B p={[0, STAGE_H / 2, -0.33]} s={[5.96, STAGE_H, 3.3]} c="#17181b" r={0.02} rough={0.5} />
          <B p={[0, STAGE_H + 0.006, -0.33]} s={[5.8, 0.012, 3.14]} c="#23252a" r={0} rough={0.25} cast={false} />
          <B p={[0.5, STAGE_H - 0.1, 1.326]} s={[4.9, 0.04, 0.012]} c="#ffffff" r={0} glow="#ffd9a8" glowPower={0.6 + c.glow} cast={false} />
          {/* two steps up at stage left; the stage itself is the third */}
          <B p={[-2.45, 0.15, 1.77]} s={[0.9, 0.3, 0.3]} c="#23252a" r={0.008} rough={0.6} />
          <B p={[-2.45, 0.3, 1.47]} s={[0.9, 0.6, 0.3]} c="#23252a" r={0.008} rough={0.6} />
          {/* lectern */}
          <B p={[2.0, STAGE_H + 0.5, 0.7]} s={[0.5, 1.0, 0.4]} c={WALNUT} r={0.02} rough={0.35} />
          <B p={[2.0, STAGE_H + 1.03, 0.68]} s={[0.56, 0.04, 0.46]} c={WALNUT} r={0.01} rot={[-0.2, 0, 0]} cast={false} />
          {/* a plinth for the device */}
          <C p={[0, STAGE_H + 0.5, 0.2]} r={[0.22, 0.26]} h={1.0} c="#e9e6e0" seg={20} rough={0.35} />
          <C p={[0, STAGE_H + 1.006, 0.2]} r={[0.2, 0.2]} h={0.012} c="#ffffff" glow="#fff1d6" glowPower={0.6 * c.glow} seg={20} cast={false} />
        </>
      )
    case 'screen':
      return (
        <>
          {[-2.8, 2.8].map((x) => (
            <group key={x}>
              <B p={[x, 0.05, 0]} s={[0.4, 0.1, 0.9]} c={DARK} r={0.01} />
              <B p={[x, 2.75, 0]} s={[0.16, 5.3, 0.16]} c={STEEL} r={0.01} metal={0.7} rough={0.4} />
            </group>
          ))}
          <B p={[0, 5.36, 0]} s={[5.9, 0.16, 0.16]} c={STEEL} r={0.01} metal={0.7} rough={0.4} />
          <B p={[0, 3.3, 0]} s={[5.4, 3.6, 0.14]} c="#0c0d0f" r={0.01} rough={0.5} />
          {c.screen ? (
            <mesh position={[0, 3.3, 0.076]}>
              <planeGeometry args={[5.24, 3.44]} />
              <meshBasicMaterial map={c.screen} toneMapped={false} />
            </mesh>
          ) : (
            <>
              <B p={[0, 3.3, 0.074]} s={[5.24, 3.44, 0.008]} c="#0c1622" r={0} glow="#2b4f86" glowPower={0.5 + 0.5 * c.glow} rough={0.15} cast={false} />
              <Sign p={[0, 3.3, 0.084]} size={[3.6, 1.8]} name={c.company} logo={c.logo} glow={0.8 + 0.5 * c.glow} />
            </>
          )}
        </>
      )
    case 'lights':
      return (
        <>
          <B p={[0, 0.05, 0]} s={[0.9, 0.1, 0.9]} c={DARK} r={0.01} />
          {[-0.2, 0.2].map((x) => [-0.2, 0.2].map((z) => <B key={`${x}${z}`} p={[x, 3.3, z]} s={[0.05, 6.4, 0.05]} c={STEEL} r={0.008} metal={0.7} rough={0.4} />))}
          {Array.from({ length: 8 }, (_, i) => (
            <B key={i} p={[0, 0.6 + i * 0.8, 0]} s={[0.44, 0.04, 0.44]} c={STEEL} r={0.006} metal={0.7} rough={0.4} cast={false} />
          ))}
          <B p={[0, 6.54, 0.2]} s={[0.9, 0.08, 0.9]} c={DARK} r={0.01} />
          {[-0.28, 0.28].map((x, i) => (
            <group key={x}>
              <B p={[x, 6.36, 0.4]} s={[0.2, 0.28, 0.24]} c="#15171a" r={0.03} />
              <C p={[x, 6.24, 0.53]} r={[0.09, 0.09]} h={0.03} c="#ffffff" glow={['#ffd9a8', '#a8d0ff'][(i + c.seed) % 2]} glowPower={(c.show ? 3 : 0.6) * (0.5 + c.glow)} seg={12} rot={[0.9, 0, 0]} cast={false} />
              {c.show && <Beam p={[x, 6.24, 0.53]} color={['#ffd9a8', '#a8d0ff'][(i + c.seed) % 2]} phase={c.seed + i * 2.1} />}
            </group>
          ))}
        </>
      )
    case 'speakers':
      return (
        <>
          <B p={[0, 0.05, 0]} s={[0.9, 0.1, 0.9]} c={DARK} r={0.01} />
          <B p={[0, 0.55, 0]} s={[0.84, 0.9, 0.8]} c="#15171a" r={0.02} rough={0.8} />
          <C p={[0, 0.55, 0.404]} r={[0.3, 0.3]} h={0.012} c="#26282c" seg={20} rot={[Math.PI / 2, 0, 0]} cast={false} />
          {Array.from({ length: 5 }, (_, i) => (
            <group key={i} position={[0, 1.24 + i * 0.44, 0.04 + i * 0.03]} rotation={[0.06 * i, 0, 0]}>
              <B p={[0, 0, 0]} s={[0.8, 0.4, 0.5]} c="#1b1d22" r={0.02} rough={0.8} />
              <B p={[0, 0, 0.253]} s={[0.7, 0.3, 0.008]} c="#0b0c0e" r={0} rough={0.9} cast={false} />
            </group>
          ))}
        </>
      )
    case 'camera':
      return (
        <>
          <B p={[0, 0.3, 0]} s={[1.96, 0.6, 1.96]} c="#23252a" r={0.012} rough={0.7} />
          {[-0.9, 0.9].map((x) => (
            <B key={x} p={[x, 1.1, 0.9]} s={[0.05, 1.0, 0.05]} c={STEEL} r={0.008} cast={false} />
          ))}
          <B p={[0, 1.58, 0.9]} s={[1.86, 0.05, 0.05]} c={STEEL} r={0.008} cast={false} />
          {[-0.45, 0.45].map((x) => (
            <group key={x} position={[x, 0.6, -0.2]}>
              <C p={[0, 0.7, 0]} r={[0.01, 0.3]} h={1.4} c={DARK} seg={3} />
              <B p={[0, 1.5, -0.1]} s={[0.24, 0.22, 0.5]} c="#16181b" r={0.02} />
              <C p={[0, 1.5, -0.42]} r={[0.08, 0.1]} h={0.16} c="#0b0c0e" seg={14} rot={[Math.PI / 2, 0, 0]} cast={false} />
              <B p={[0, 1.66, 0.1]} s={[0.14, 0.1, 0.02]} c="#081018" r={0} glow="#7fd1ff" glowPower={0.8 * c.glow} cast={false} />
              <S p={[0.08, 1.6, -0.34]} r={0.015} c="#e5484d" glow="#ff2a2a" glowPower={c.show ? 2 : 0.3} cast={false} />
            </group>
          ))}
        </>
      )
    case 'seats':
      return <SeatBlock h={0} c={c} />
    case 'seats_mid':
      return <SeatBlock h={0.5} c={c} />
    case 'seats_high':
      return <SeatBlock h={1.0} c={c} />
    case 'demo':
      return <DisplayTable products={c.products} seed={c.seed} />
  }
  return <OfficeItem kind={kind} c={{ glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed }} />
}
