// Event venue pieces: stage, screen, rigging and seating. One unit is one
// metre and one floor tile. The stage and screen face +Z; seating faces -Z,
// so with rotation left alone the audience looks north at the stage.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Product } from '../../sim/types'
import { B, C, DARK, S, STEEL, Sign, WALNUT } from './kit'
import { OfficeItem } from './office'
import { LEGROOM, STAGE_H, STAIR_W, STAIR_X, seatRows } from './spots'
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
  /** Seating: which sides are open to an aisle (1 left, 2 right), where a raised block has steps. */
  aisles?: number
  /** The people here are drawn by the view, walking about. */
  live?: boolean
  /** Clear height under the roof of the hall this stands in, in metres; missing in the open air. Rigging is cut down to fit. */
  ceiling?: number
}

export { STAGE_H }

/** Two rows of six seats on a riser `h` metres high. Whoever sits in them is drawn by the view (see audience.tsx). */
function SeatBlock({ h, c }: { h: number; c: VenueCtx }) {
  const rows = seatRows(h)
  return (
    <>
      {h > 0 && <B p={[0, h / 2, 0]} s={[2.98, h, 1.98]} c="#2b2d31" r={0.01} rough={0.8} />}
      {h > 0 && <B p={[0, (h + rows[1].y) / 2, 0.5]} s={[2.98, rows[1].y - h, 0.98]} c="#2b2d31" r={0.01} rough={0.8} />}
      {/* steps down each side that is open to an aisle: a tread for each row and a half step up to it, each with a lit nosing */}
      {h > 0 &&
        [-1, 1].map((side) =>
          (c.aisles ?? 0) & (side < 0 ? 1 : 2)
            ? rows.map(({ y, z }, i) => {
                const below = i ? rows[0].y : h >= 1 ? h - 0.26 : 0
                const mid = (below + y) / 2
                const x = side * (1.49 + STAIR_X)
                const at = z - LEGROOM
                return (
                  <group key={`${side}${i}`}>
                    <B p={[x, y / 2, at + 0.125]} s={[STAIR_W, y, 0.75]} c="#2b2d31" r={0.006} rough={0.8} />
                    <B p={[x, mid / 2, at - 0.375]} s={[STAIR_W, mid, 0.25]} c="#2b2d31" r={0.006} rough={0.8} />
                    <B p={[x, y + 0.004, at - 0.235]} s={[STAIR_W - 0.02, 0.008, 0.02]} c="#ffffff" r={0} glow="#ffd9a8" glowPower={0.5 + 0.9 * c.glow} cast={false} />
                    <B p={[x, mid + 0.004, at - 0.485]} s={[STAIR_W - 0.02, 0.008, 0.02]} c="#ffffff" r={0} glow="#ffd9a8" glowPower={0.5 + 0.9 * c.glow} cast={false} />
                  </group>
                )
              })
            : null,
        )}
      {rows.map(({ y: base, z }) => (
        <group key={z}>
          {Array.from({ length: 6 }, (_, i) => {
            const x = -1.25 + i * 0.5
            return (
              <group key={i}>
                <B p={[x, base + 0.21, z]} s={[0.06, 0.42, 0.34]} c={DARK} r={0} cast={false} />
                <B p={[x, base + 0.455, z]} s={[0.44, 0.08, 0.42]} c={c.color} r={0} rough={0.95} cast={false} />
                <B p={[x, base + 0.76, z + 0.2]} s={[0.44, 0.56, 0.06]} c={c.color} r={0} rough={0.95} />
              </group>
            )
          })}
        </group>
      ))}
    </>
  )
}

/** A beam of light swinging from a lamp. Live: never baked. */
function Beam({ p, color, phase, day, len = 9 }: { p: [number, number, number]; color: string; phase: number; day: boolean; len?: number }) {
  const ref = useRef<THREE.Group>(null)
  // light added to a bright sky does not show: by day the beam is a pale haze in the air instead
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: day ? '#fffaf0' : color, transparent: true, opacity: day ? 0.2 : 0.1, depthWrite: false, blending: day ? THREE.NormalBlending : THREE.AdditiveBlending, side: THREE.DoubleSide }),
    [color, day],
  )
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * 0.6 + phase
    ref.current.rotation.set(0.9 + Math.sin(t) * 0.25, 0, Math.sin(t * 0.7) * 0.5)
  })
  return (
    <group ref={ref} position={p}>
      <mesh position={[0, -len / 2, 0]} material={material} userData={{ live: true }}>
        <cylinderGeometry args={[0.08, 1.3 * (len / 9), len, 16, 1, true]} />
      </mesh>
    </group>
  )
}

const BEAMS = ['#ffd9a8', '#a8d0ff', '#ffffff', '#ff9ec9']

/**
 * A stage W wide and D deep, facing +Z: the platform, two steps up at stage
 * left, drapes at the back, a lectern and a plinth for the device. The big
 * ones (`rig` is the height of their truss) carry a lighting truss on two
 * towers over the front of the stage, with a moving head every metre and a
 * half; it is cut down to fit under a low roof.
 */
function Stage({ W, D, c, rig }: { W: number; D: number; c: VenueCtx; rig?: number }) {
  const back = -D / 2 + 0.02
  const front = D / 2 - 0.68
  const mid = (back + front) / 2
  const depth = front - back
  const top = rig ? Math.max(3.4, Math.min(rig, (c.ceiling ?? 99) - 0.35)) : 0
  const heads = rig ? Math.max(4, Math.round((W - 1) / 1.5)) : 0
  return (
    <>
      <B p={[0, STAGE_H / 2, mid]} s={[W - 0.04, STAGE_H, depth]} c="#17181b" r={0.02} rough={0.5} />
      <B p={[0, STAGE_H + 0.006, mid]} s={[W - 0.2, 0.012, depth - 0.16]} c="#23252a" r={0} rough={0.25} cast={false} />
      <B p={[0.5, STAGE_H - 0.1, front + 0.006]} s={[W - 1.1, 0.04, 0.012]} c="#ffffff" r={0} glow="#ffd9a8" glowPower={0.6 + c.glow} cast={false} />
      {/* two steps up at stage left; the stage itself is the third */}
      <B p={[-W / 2 + 0.55, 0.15, front + 0.45]} s={[0.9, 0.3, 0.3]} c="#23252a" r={0.008} rough={0.6} />
      <B p={[-W / 2 + 0.55, 0.3, front + 0.15]} s={[0.9, 0.6, 0.3]} c="#23252a" r={0.008} rough={0.6} />
      {/* black drapes at the back corners and a skirt along the back: something dark behind whoever is speaking, whatever the light */}
      {[-W / 2 + 0.28, W / 2 - 0.28].map((x) => (
        <B key={x} p={[x, STAGE_H + 1.5, back + 0.14]} s={[0.5, 3.0, 0.22]} c="#0e0f11" r={0.01} rough={0.95} />
      ))}
      <B p={[0, STAGE_H + 0.35, back + 0.08]} s={[W - 0.1, 0.7, 0.1]} c="#0e0f11" r={0.01} rough={0.95} />
      {/* lectern */}
      <B p={[W / 2 - 1.0, STAGE_H + 0.5, front - 0.62]} s={[0.5, 1.0, 0.4]} c={WALNUT} r={0.02} rough={0.35} />
      <B p={[W / 2 - 1.0, STAGE_H + 1.03, front - 0.64]} s={[0.56, 0.04, 0.46]} c={WALNUT} r={0.01} rot={[-0.2, 0, 0]} cast={false} />
      {/* a plinth for the device */}
      <C p={[0, STAGE_H + 0.5, front - 1.12]} r={[0.22, 0.26]} h={1.0} c="#e9e6e0" seg={20} rough={0.35} />
      <C p={[0, STAGE_H + 1.006, front - 1.12]} r={[0.2, 0.2]} h={0.012} c="#ffffff" glow="#fff1d6" glowPower={0.6 * c.glow} seg={20} cast={false} />
      {rig ? (
        <>
          {/* box-truss towers at the front corners and a bar across between them */}
          {[-W / 2 + 0.3, W / 2 - 0.3].map((x) => (
            <group key={x}>
              {[-0.15, 0.15].map((dx) => [-0.15, 0.15].map((dz) => <B key={`${dx}${dz}`} p={[x + dx, STAGE_H + (top - STAGE_H) / 2, front - 0.3 + dz]} s={[0.04, top - STAGE_H, 0.04]} c="#9aa0a6" r={0.006} metal={0.8} rough={0.35} cast={false} />))}
              <B p={[x, STAGE_H + 0.03, front - 0.3]} s={[0.5, 0.06, 0.5]} c={DARK} r={0.01} cast={false} />
            </group>
          ))}
          {[-0.15, 0.15].map((dz) => [-0.15, 0.15].map((dy) => <B key={`${dz}${dy}`} p={[0, top + dy, front - 0.3 + dz]} s={[W - 0.3, 0.04, 0.04]} c="#9aa0a6" r={0.006} metal={0.8} rough={0.35} cast={false} />))}
          {Array.from({ length: heads }, (_, i) => {
            const x = -W / 2 + 0.9 + (i * (W - 1.8)) / Math.max(1, heads - 1)
            const color = BEAMS[(i + c.seed) % BEAMS.length]
            return (
              <group key={i}>
                <B p={[x, top - 0.3, front - 0.3]} s={[0.22, 0.26, 0.22]} c="#15171a" r={0.03} cast={false} />
                <C p={[x, top - 0.45, front - 0.24]} r={[0.08, 0.08]} h={0.03} c="#ffffff" glow={color} glowPower={(c.show ? 3 : 0.5) * (0.5 + c.glow)} seg={10} rot={[0.5, 0, 0]} cast={false} />
                {c.show && i % 2 === 0 && <Beam p={[x, top - 0.45, front - 0.24]} color={color} phase={c.seed + i * 1.7} day={c.glow < 1} len={top + 1} />}
              </group>
            )
          })}
        </>
      ) : null}
    </>
  )
}

/**
 * A wall of LEDs W wide on two posts: its picture is 16 by 10.5 and sits
 * clear of the stage floor. Under a roof too low for it the picture shrinks
 * to fit, keeping its shape.
 */
function Screen({ W, c }: { W: number; c: VenueCtx }) {
  const aspect = 5.24 / 3.44
  let pw = W - 0.76
  let ph = pw / aspect
  let bottom = W >= 10 ? 1.7 : 1.58
  if (c.ceiling) {
    const room = c.ceiling - 0.45 - bottom
    if (ph > room) {
      bottom = Math.max(1.0, Math.min(bottom, c.ceiling * 0.3))
      ph = Math.max(0.9, c.ceiling - 0.45 - bottom)
      pw = ph * aspect
    }
  }
  const cy = bottom + ph / 2
  const top = bottom + ph + 0.18
  return (
    <>
      {[-W / 2 + 0.2, W / 2 - 0.2].map((x) => (
        <group key={x}>
          <B p={[x, 0.05, 0]} s={[0.4, 0.1, 0.9]} c={DARK} r={0.01} />
          <B p={[x, top / 2, 0]} s={[0.16, top, 0.16]} c={STEEL} r={0.01} metal={0.7} rough={0.4} />
        </group>
      ))}
      <B p={[0, top + 0.02, 0]} s={[W - 0.1, 0.16, 0.16]} c={STEEL} r={0.01} metal={0.7} rough={0.4} />
      <B p={[0, cy, 0]} s={[pw + 0.16, ph + 0.16, 0.14]} c="#0c0d0f" r={0.01} rough={0.5} />
      {c.screen ? (
        <mesh position={[0, cy, 0.076]}>
          <planeGeometry args={[pw, ph]} />
          <meshBasicMaterial map={c.screen} toneMapped={false} />
        </mesh>
      ) : (
        <>
          <B p={[0, cy, 0.074]} s={[pw, ph, 0.008]} c="#0c1622" r={0} glow="#2b4f86" glowPower={0.5 + 0.5 * c.glow} rough={0.15} cast={false} />
          <Sign p={[0, cy, 0.084]} size={[pw * 0.69, ph * 0.52]} name={c.company} logo={c.logo} glow={0.8 + 0.5 * c.glow} />
        </>
      )}
    </>
  )
}

/** The model for one venue item. Kinds shared with the office use the office model. */
export function VenueItem({ kind, c }: { kind: string; c: VenueCtx }) {
  switch (kind) {
    case 'stage':
      return <Stage W={6} D={4} c={c} />
    case 'stage_l':
      return <Stage W={10} D={5} c={c} rig={7.0} />
    case 'stage_xl':
      return <Stage W={16} D={6} c={c} rig={9.6} />
    case 'screen':
      return <Screen W={6} c={c} />
    case 'screen_l':
      return <Screen W={10} c={c} />
    case 'screen_xl':
      return <Screen W={16} c={c} />
    case 'lights':
      return (
        <group scale={[1, c.ceiling ? Math.min(1, (c.ceiling - 0.25) / 6.6) : 1, 1]}>
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
              {c.show && <Beam p={[x, 6.24, 0.53]} color={['#ffd9a8', '#a8d0ff'][(i + c.seed) % 2]} phase={c.seed + i * 2.1} day={c.glow < 1} />}
            </group>
          ))}
        </group>
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
  return <OfficeItem kind={kind} c={{ glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed, live: c.live }} />
}
