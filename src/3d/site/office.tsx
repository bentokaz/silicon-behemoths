// Office furniture. One unit is one metre and one floor tile. Each model is
// centred on its footprint with its front toward +Z.
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import { B, C, CHARCOAL, DARK, FABRIC, LEAF, OAK_PALE, type PersonLook, Person, S, STEEL, Sign, WALNUT, WHITE, WOOD, hash } from './kit'

export interface OfficeCtx {
  /** Who sits here, if anyone. */
  who?: PersonLook
  /** Drop the smallest details when the floor is very full. */
  lite: boolean
  /** How strongly screens and lamps glow (higher at night). */
  glow: number
  company: string
  logo?: string
  seed: number
}

function Chair({ z = 0.24, color = CHARCOAL, rotY = 0, x = 0 }: { z?: number; color?: string; rotY?: number; x?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <C p={[0, 0.03, 0]} r={[0.26, 0.28]} h={0.035} c={DARK} seg={5} metal={0.6} rough={0.4} />
      <C p={[0, 0.22, 0]} r={[0.025, 0.03]} h={0.36} c={STEEL} seg={8} metal={0.9} rough={0.3} cast={false} />
      <B p={[0, 0.43, 0]} s={[0.44, 0.07, 0.42]} c={color} r={0.03} rough={0.95} />
      <B p={[0, 0.74, 0.2]} s={[0.42, 0.5, 0.06]} c={color} r={0.03} rough={0.95} rot={[-0.12, 0, 0]} />
      <B p={[-0.24, 0.58, 0.03]} s={[0.04, 0.03, 0.26]} c={DARK} cast={false} />
      <B p={[0.24, 0.58, 0.03]} s={[0.04, 0.03, 0.26]} c={DARK} cast={false} />
    </group>
  )
}

function Monitor({ x = 0, z = -0.34, y = 0.75, w = 0.52, glow, on }: { x?: number; z?: number; y?: number; w?: number; glow: number; on: boolean }) {
  return (
    <group position={[x, y, z]}>
      <C p={[0, 0.006, 0]} r={[0.09, 0.1]} h={0.012} c={DARK} seg={16} cast={false} />
      <B p={[0, 0.11, 0.01]} s={[0.03, 0.22, 0.03]} c={DARK} cast={false} />
      <B p={[0, 0.3, 0]} s={[w, 0.31, 0.02]} c="#0c0d0f" r={0.008} rough={0.35} />
      <B p={[0, 0.3, 0.011]} s={[w - 0.02, 0.29, 0.002]} c="#0f1b2a" r={0} glow={on ? '#8fbdea' : undefined} glowPower={0.75 * glow} rough={0.2} cast={false} />
    </group>
  )
}

function Laptop({ p, glow }: { p: [number, number, number]; glow: number }) {
  return (
    <group position={p}>
      <B p={[0, 0.008, 0]} s={[0.3, 0.014, 0.21]} c="#b9bcc0" metal={0.7} rough={0.35} cast={false} />
      <B p={[0, 0.11, -0.115]} s={[0.3, 0.2, 0.01]} c="#b9bcc0" metal={0.7} rough={0.35} rot={[-0.22, 0, 0]} cast={false} />
      <B p={[0, 0.11, -0.108]} s={[0.28, 0.18, 0.002]} c="#102030" r={0} glow="#9ec3ea" glowPower={0.7 * glow} rot={[-0.22, 0, 0]} cast={false} />
    </group>
  )
}

function Plant({ p = [0, 0, 0] as [number, number, number], scale = 1, seed = 0 }) {
  return (
    <group position={p} scale={scale}>
      <C p={[0, 0.16, 0]} r={[0.17, 0.13]} h={0.32} c="#d8d2c6" rough={0.85} />
      <C p={[0, 0.315, 0]} r={[0.15, 0.15]} h={0.02} c="#3b2e25" rough={1} cast={false} />
      {[[0, 0.62, 0, 0.25], [0.13, 0.48, 0.09, 0.18], [-0.13, 0.5, -0.07, 0.19], [0.03, 0.84, -0.04, 0.16], [-0.06, 0.7, 0.12, 0.15]].map(([x, y, z, r], i) => (
        <S key={i} p={[x, y, z]} r={r} c={LEAF[(i + seed) % LEAF.length]} rough={0.95} flat />
      ))}
    </group>
  )
}

function Desk({ c, top = WOOD, height = 0.73, chair = true }: { c: OfficeCtx; top?: string; height?: number; chair?: boolean }) {
  return (
    <>
      <B p={[0, height, -0.16]} s={[0.94, 0.035, 0.54]} c={top} r={0.014} rough={0.5} />
      {[-0.41, 0.41].map((x) => (
        <group key={x}>
          <B p={[x, height / 2, -0.16]} s={[0.05, height - 0.03, 0.07]} c={WHITE} metal={0.5} rough={0.4} />
          <B p={[x, 0.015, -0.16]} s={[0.07, 0.03, 0.52]} c={WHITE} metal={0.5} rough={0.4} cast={false} />
        </group>
      ))}
      <B p={[0, height - 0.12, -0.4]} s={[0.78, 0.18, 0.015]} c={CHARCOAL} cast={false} />
      <Monitor y={height + 0.018} glow={c.glow} on={!!c.who} />
      <B p={[-0.02, height + 0.027, -0.1]} s={[0.32, 0.014, 0.11]} c="#26282c" r={0.006} cast={false} />
      {!c.lite && (
        <>
          <B p={[0.25, height + 0.03, -0.09]} s={[0.05, 0.022, 0.085]} c="#26282c" r={0.01} cast={false} />
          <C p={[-0.34, height + 0.065, -0.02]} r={[0.035, 0.03]} h={0.09} c={hash(c.seed) > 0.5 ? '#e9e4da' : '#c9553d'} seg={12} cast={false} />
          <B p={[0.3, 0.27, -0.2]} s={[0.3, 0.5, 0.42]} c={WHITE} r={0.01} metal={0.3} rough={0.5} />
        </>
      )}
      {chair && <Chair />}
    </>
  )
}

function Sofa({ w = 1.8, color = FABRIC }: { w?: number; color?: string }) {
  const seats = Math.round(w / 0.8)
  return (
    <>
      <B p={[0, 0.2, 0]} s={[w, 0.2, 0.78]} c={color} r={0.05} rough={1} />
      <B p={[0, 0.5, 0.32]} s={[w, 0.5, 0.16]} c={color} r={0.06} rough={1} />
      <B p={[-w / 2 + 0.08, 0.38, 0]} s={[0.16, 0.34, 0.78]} c={color} r={0.06} rough={1} />
      <B p={[w / 2 - 0.08, 0.38, 0]} s={[0.16, 0.34, 0.78]} c={color} r={0.06} rough={1} />
      {Array.from({ length: seats }, (_, i) => (
        <B key={i} p={[-(w - 0.4) / 2 + ((i + 0.5) * (w - 0.4)) / seats, 0.36, -0.04]} s={[(w - 0.44) / seats, 0.13, 0.56]} c={color} r={0.05} rough={1} cast={false} />
      ))}
      {[-1, 1].map((sx) => [-1, 1].map((sz) => <C key={`${sx}${sz}`} p={[sx * (w / 2 - 0.1), 0.05, sz * 0.3]} r={[0.025, 0.02]} h={0.1} c={WALNUT} seg={8} cast={false} />))}
    </>
  )
}

function Fish() {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * 0.5
    ref.current.children.forEach((f, i) => {
      f.position.x = Math.sin(t + i * 2.1) * 0.6
      f.position.y = 1.0 + Math.sin(t * 1.3 + i) * 0.14
      f.position.z = Math.cos(t * 0.8 + i * 1.3) * 0.12
    })
  })
  return (
    <group ref={ref}>
      {['#ff8a3d', '#ffd166', '#5ec8e8', '#ff5d73', '#f4f4f4'].map((col, i) => (
        <S key={i} p={[0, 1, 0]} r={0.035} c={col} scale={[1.8, 0.9, 0.6]} glow={col} glowPower={0.25} cast={false} />
      ))}
    </group>
  )
}

/** The model for one office item. */
export function OfficeItem({ kind, c }: { kind: string; c: OfficeCtx }) {
  switch (kind) {
    case 'desk':
      return (
        <>
          <Desk c={c} />
          {c.who && <Person who={c.who} p={[0, 0, 0.22]} />}
        </>
      )
    case 'standing':
      return (
        <>
          <Desk c={c} top={OAK_PALE} height={1.08} chair={false} />
          <B p={[0, 0.012, 0.3]} s={[0.6, 0.02, 0.4]} c="#2b2f36" r={0.01} rough={1} cast={false} />
          {c.who && <Person who={c.who} pose="stand" p={[0, 0, 0.3]} />}
        </>
      )
    case 'exec':
      return (
        <>
          <B p={[0, 0.74, -0.14]} s={[1.86, 0.05, 0.74]} c={WALNUT} r={0.02} rough={0.35} />
          <B p={[-0.82, 0.37, -0.14]} s={[0.06, 0.72, 0.7]} c={WALNUT} rough={0.4} />
          <B p={[0.6, 0.37, -0.14]} s={[0.5, 0.72, 0.7]} c={WALNUT} rough={0.4} />
          <B p={[0, 0.5, -0.47]} s={[1.7, 0.4, 0.02]} c={WALNUT} rough={0.4} cast={false} />
          <Monitor x={-0.2} z={-0.36} y={0.77} w={0.7} glow={c.glow} on={!!c.who} />
          <Laptop p={[0.45, 0.77, -0.16]} glow={c.glow} />
          <C p={[-0.72, 0.9, -0.34]} r={[0.02, 0.02]} h={0.3} c={STEEL} metal={0.9} rough={0.3} seg={8} cast={false} />
          <C p={[-0.72, 1.08, -0.34]} r={[0.07, 0.12]} h={0.12} c="#e8dcc0" glow="#ffe2a8" glowPower={0.8 * c.glow} seg={16} cast={false} />
          <Chair color="#3a2a22" x={-0.1} z={0.32} />
          {c.who && <Person who={c.who} p={[-0.1, 0, 0.3]} />}
        </>
      )
    case 'bench':
      return (
        <>
          <B p={[0, 0.88, 0]} s={[1.9, 0.045, 0.8]} c="#d9dde1" r={0.01} metal={0.5} rough={0.3} />
          {[-0.88, 0.88].map((x) => (
            <B key={x} p={[x, 0.43, 0]} s={[0.06, 0.86, 0.72]} c={STEEL} metal={0.8} rough={0.35} />
          ))}
          <B p={[0, 0.3, 0]} s={[1.7, 0.03, 0.66]} c={STEEL} metal={0.8} rough={0.35} cast={false} />
          <B p={[0, 1.42, -0.34]} s={[1.9, 0.03, 0.2]} c="#d9dde1" metal={0.5} rough={0.3} />
          {[-0.9, 0.9].map((x) => (
            <B key={x} p={[x, 1.16, -0.38]} s={[0.03, 0.52, 0.03]} c={STEEL} metal={0.8} rough={0.35} cast={false} />
          ))}
          <B p={[-0.55, 1.06, -0.12]} s={[0.44, 0.3, 0.36]} c="#eceff2" r={0.02} rough={0.4} />
          <B p={[-0.55, 1.08, 0.062]} s={[0.26, 0.17, 0.004]} c="#06140c" r={0} glow="#55e39f" glowPower={0.9 * c.glow} cast={false} />
          <B p={[0.05, 0.93, 0.05]} s={[0.36, 0.05, 0.3]} c="#2f6b4c" r={0.006} rough={0.5} cast={false} />
          <C p={[0.5, 0.94, 0.1]} r={[0.07, 0.09]} h={0.07} c={DARK} seg={16} cast={false} />
          <C p={[0.5, 1.08, 0.06]} r={[0.03, 0.03]} h={0.24} c={STEEL} metal={0.9} rough={0.3} seg={8} rot={[0.3, 0, 0]} cast={false} />
          <C p={[0.5, 1.2, 0.0]} r={[0.035, 0.045]} h={0.1} c={DARK} seg={12} cast={false} />
          {!c.lite && [0.72, 0.84].map((x, i) => <C key={x} p={[x, 1.5, -0.34]} r={[0.035, 0.045]} h={0.13} c={i ? '#9fe3c4' : '#f2b631'} glass={0.6} seg={12} cast={false} />)}
          <C p={[0.15, 0.4, 0.55]} r={[0.17, 0.17]} h={0.04} c={CHARCOAL} seg={16} />
          <C p={[0.15, 0.2, 0.55]} r={[0.025, 0.14]} h={0.4} c={STEEL} metal={0.8} rough={0.35} seg={8} cast={false} />
        </>
      )
    case 'server':
      return (
        <>
          <B p={[0, 1.0, 0]} s={[0.62, 2.0, 0.86]} c="#15171a" r={0.012} rough={0.45} metal={0.5} />
          <B p={[0, 1.0, 0.432]} s={[0.54, 1.9, 0.006]} c="#0a0c0e" r={0} rough={0.15} metal={0.3} cast={false} />
          {Array.from({ length: 12 }, (_, i) => (
            <B key={i} p={[-0.1 + (i % 2) * 0.2, 0.22 + i * 0.145, 0.437]} s={[0.16, 0.014, 0.003]} c="#06140a" r={0} glow={hash(c.seed + i) > 0.82 ? '#ffb347' : '#3fe08a'} glowPower={1.3 * c.glow} cast={false} />
          ))}
          <B p={[0, 2.04, 0]} s={[0.5, 0.05, 0.7]} c={STEEL} metal={0.8} rough={0.4} cast={false} />
        </>
      )
    case 'devrig':
      return (
        <>
          <B p={[0, 0.45, 0]} s={[0.9, 0.9, 0.5]} c={WHITE} r={0.012} rough={0.5} />
          <B p={[0, 1.3, -0.2]} s={[0.9, 0.8, 0.03]} c={CHARCOAL} />
          {Array.from({ length: 6 }, (_, i) => (
            <group key={i} position={[-0.28 + (i % 3) * 0.28, 1.12 + Math.floor(i / 3) * 0.36, -0.16]}>
              <B p={[0, 0, 0]} s={[0.13, 0.26, 0.014]} c="#101114" r={0.01} cast={false} />
              <B p={[0, 0, 0.008]} s={[0.115, 0.24, 0.002]} c="#101820" r={0} glow={['#7fd1ff', '#ffd27f', '#9dffb0'][i % 3]} glowPower={0.7 * c.glow} cast={false} />
            </group>
          ))}
          <Laptop p={[0, 0.9, 0.05]} glow={c.glow} />
        </>
      )
    case 'design':
      return (
        <>
          <B p={[0, 0.9, 0]} s={[1.9, 0.05, 0.86]} c={OAK_PALE} r={0.014} rough={0.55} />
          {[-0.82, 0.82].map((x) => [-0.34, 0.34].map((z) => <B key={`${x}${z}`} p={[x, 0.44, z]} s={[0.06, 0.88, 0.06]} c={DARK} />))}
          <B p={[0, 0.3, 0]} s={[1.6, 0.03, 0.7]} c={OAK_PALE} rough={0.6} cast={false} />
          {[['#e8e4dc', -0.6, 0.1, 0.07], ['#3b3d42', -0.42, 0.14, 0.075], ['#c8b89a', -0.24, 0.08, 0.07], ['#2e4a3c', 0.5, -0.15, 0.16]].map(([col, x, z, w], i) => (
            <B key={i} p={[x as number, 0.935, z as number]} s={[w as number, 0.012, (w as number) * 2.1]} c={col as string} r={0.006} rough={0.3} metal={0.3} cast={false} />
          ))}
          <B p={[0.1, 0.93, 0.18]} s={[0.42, 0.006, 0.3]} c="#f4f1ea" r={0} cast={false} />
          {!c.lite && ['#d65f7c', '#d6a24f', '#4f8fd6', '#58b98a', '#e9e9e9'].map((col, i) => <B key={col} p={[0.6 + i * 0.07, 0.94, 0.26]} s={[0.055, 0.02, 0.1]} c={col} r={0.004} cast={false} />)}
          <C p={[0.78, 1.1, -0.3]} r={[0.015, 0.015]} h={0.4} c={STEEL} metal={0.9} rough={0.3} seg={8} cast={false} />
          <C p={[0.72, 1.3, -0.24]} r={[0.05, 0.09]} h={0.1} c={DARK} glow="#ffe9c2" glowPower={0.5 * c.glow} seg={16} rot={[0.5, 0, 0.3]} cast={false} />
        </>
      )
    case 'media':
      return (
        <>
          <B p={[-0.2, 1.1, -0.42]} s={[1.3, 2.1, 0.03]} c="#dfe3e8" r={0} rough={0.95} />
          <B p={[-0.2, 0.015, 0.05]} s={[1.3, 0.02, 0.9]} c="#dfe3e8" r={0} rough={0.95} cast={false} />
          <C p={[-0.2, 2.18, -0.42]} r={[0.035, 0.035]} h={1.4} c={DARK} seg={10} rot={[0, 0, Math.PI / 2]} cast={false} />
          <C p={[0.72, 0.85, 0.1]} r={[0.018, 0.018]} h={1.7} c={DARK} seg={8} />
          <B p={[0.66, 1.7, 0.05]} s={[0.1, 0.5, 0.5]} c={DARK} r={0.02} rot={[0, 0.5, 0]} />
          <B p={[0.6, 1.7, 0.02]} s={[0.01, 0.44, 0.44]} c="#fff6e6" r={0} glow="#fff1d6" glowPower={1.1 * c.glow} rot={[0, 0.5, 0]} cast={false} />
          <C p={[0.2, 0.6, 0.38]} r={[0.012, 0.012]} h={1.2} c={DARK} seg={8} />
          <B p={[0.2, 1.26, 0.38]} s={[0.14, 0.1, 0.1]} c="#16181b" r={0.01} />
          <C p={[0.2, 1.26, 0.3]} r={[0.035, 0.04]} h={0.08} c="#0b0c0e" seg={14} rot={[Math.PI / 2, 0, 0]} cast={false} />
          <C p={[-0.2, 0.4, -0.05]} r={[0.2, 0.2]} h={0.8} c={WHITE} seg={24} rough={0.4} />
        </>
      )
    case 'helpdesk':
      return (
        <>
          <Desk c={c} top="#e9e6e0" />
          <Monitor x={0.36} z={-0.3} w={0.34} glow={c.glow} on={!!c.who} />
          <B p={[-0.32, 0.84, -0.08]} s={[0.12, 0.16, 0.04]} c={DARK} r={0.03} cast={false} />
          {c.who && <Person who={c.who} p={[0, 0, 0.22]} />}
        </>
      )
    case 'meeting':
      return (
        <>
          <B p={[0, 0.74, 0]} s={[1.5, 0.05, 0.86]} c={WALNUT} r={0.03} rough={0.35} />
          {[-0.5, 0.5].map((x) => (
            <B key={x} p={[x, 0.37, 0]} s={[0.1, 0.72, 0.5]} c={DARK} r={0.02} />
          ))}
          <C p={[0, 0.79, 0]} r={[0.07, 0.11]} h={0.05} c={DARK} seg={3} cast={false} />
          {[-0.5, 0, 0.5].map((x) => (
            <group key={x}>
              <Chair x={x} z={0.72} />
              <Chair x={x} z={-0.72} rotY={Math.PI} />
            </group>
          ))}
        </>
      )
    case 'booth':
      return (
        <>
          <B p={[0, 1.08, -0.42]} s={[0.92, 2.16, 0.06]} c="#2f3a44" rough={0.9} />
          <B p={[-0.43, 1.08, 0]} s={[0.06, 2.16, 0.9]} c="#2f3a44" rough={0.9} />
          <B p={[0.43, 1.08, 0]} s={[0.06, 2.16, 0.9]} c="#2f3a44" rough={0.9} />
          <B p={[0, 2.19, 0]} s={[0.92, 0.06, 0.92]} c="#2f3a44" rough={0.9} />
          <B p={[0, 1.08, 0.43]} s={[0.8, 2.04, 0.02]} c="#bfe0f2" glass={0.22} r={0} cast={false} />
          <B p={[0, 2.14, 0]} s={[0.5, 0.02, 0.5]} c="#fff4dc" r={0} glow="#ffe9c2" glowPower={1.2 * c.glow} cast={false} />
          <B p={[0, 0.9, -0.3]} s={[0.7, 0.03, 0.22]} c={OAK_PALE} cast={false} />
          <C p={[0, 0.5, 0.05]} r={[0.16, 0.16]} h={0.05} c={FABRIC} seg={16} cast={false} />
          <C p={[0, 0.25, 0.05]} r={[0.02, 0.12]} h={0.5} c={STEEL} metal={0.8} rough={0.35} seg={8} cast={false} />
        </>
      )
    case 'whiteboard':
      return (
        <>
          <B p={[0, 1.25, -0.3]} s={[0.94, 0.95, 0.03]} c="#fafafa" r={0.006} rough={0.25} />
          <B p={[0, 1.25, -0.317]} s={[0.98, 0.99, 0.02]} c={STEEL} metal={0.8} rough={0.4} cast={false} />
          {[-0.42, 0.42].map((x) => (
            <group key={x}>
              <B p={[x, 0.4, -0.3]} s={[0.03, 0.8, 0.03]} c={STEEL} metal={0.8} rough={0.4} cast={false} />
              <B p={[x, 0.03, -0.3]} s={[0.04, 0.03, 0.44]} c={STEEL} metal={0.8} rough={0.4} cast={false} />
            </group>
          ))}
          {!c.lite &&
            [['#d6455a', -0.22, 1.45, 0.3], ['#2f6fd6', 0.1, 1.3, 0.42], ['#1f9d6b', -0.1, 1.12, 0.36], ['#222', 0.2, 1.52, 0.2]].map(([col, x, y, w], i) => (
              <B key={i} p={[x as number, y as number, -0.283]} s={[w as number, 0.014, 0.002]} c={col as string} r={0} rot={[0, 0, (hash(c.seed + i) - 0.5) * 0.3]} cast={false} />
            ))}
        </>
      )
    case 'reception':
      return (
        <>
          <B p={[0, 0.55, 0.1]} s={[1.9, 1.1, 0.12]} c={WHITE} r={0.03} rough={0.4} />
          <B p={[0, 1.11, -0.08]} s={[1.94, 0.04, 0.5]} c={WALNUT} r={0.015} rough={0.35} />
          <B p={[-0.9, 0.55, -0.15]} s={[0.1, 1.1, 0.5]} c={WHITE} r={0.03} rough={0.4} />
          <B p={[0.9, 0.55, -0.15]} s={[0.1, 1.1, 0.5]} c={WHITE} r={0.03} rough={0.4} />
          <B p={[0, 0.12, 0.165]} s={[1.86, 0.03, 0.01]} c="#fff" r={0} glow="#ffd9a8" glowPower={1.4 * c.glow} cast={false} />
          <Sign p={[0, 0.62, 0.166]} size={[1.1, 0.5]} name={c.company} logo={c.logo} glow={0.6 * c.glow} />
          <Monitor x={0.4} z={-0.2} y={0.78} w={0.4} glow={c.glow} on />
          <Chair z={-0.5} rotY={Math.PI} />
        </>
      )
    case 'stage':
      return (
        <>
          <B p={[0, 0.2, 0]} s={[3.9, 0.4, 2.9]} c="#17181b" r={0.02} rough={0.5} />
          <B p={[0, 0.405, 0]} s={[3.7, 0.01, 2.7]} c="#202226" r={0} rough={0.25} cast={false} />
          <B p={[0, 1.8, -1.35]} s={[3.8, 2.7, 0.1]} c="#0c0d0f" rough={0.6} />
          <B p={[0, 1.8, -1.295]} s={[3.5, 2.0, 0.01]} c="#101826" r={0} glow="#2b4f86" glowPower={0.9 * c.glow} cast={false} />
          <Sign p={[0, 1.85, -1.28]} size={[2.4, 1.3]} name={c.company} logo={c.logo} glow={1.2 * c.glow} />
          <B p={[-1.1, 0.95, 0.5]} s={[0.5, 1.1, 0.4]} c={WALNUT} r={0.02} rough={0.35} />
          <B p={[-1.1, 1.52, 0.46]} s={[0.56, 0.03, 0.44]} c={WALNUT} rot={[0.25, 0, 0]} cast={false} />
          <B p={[0, 3.2, 0.9]} s={[3.9, 0.08, 0.08]} c={STEEL} metal={0.8} rough={0.4} cast={false} />
          {[-1.4, -0.5, 0.5, 1.4].map((x, i) => (
            <group key={x}>
              <C p={[x, 3.08, 0.9]} r={[0.07, 0.1]} h={0.18} c={DARK} seg={12} rot={[0.5, 0, 0]} cast={false} />
              <C p={[x, 3.0, 0.86]} r={[0.09, 0.09]} h={0.01} c="#fff" glow={['#ffd9a8', '#a8d0ff'][i % 2]} glowPower={2 * c.glow} seg={12} rot={[0.5, 0, 0]} cast={false} />
            </group>
          ))}
          <B p={[0, 0.1, 1.38]} s={[3.9, 0.02, 0.02]} c="#fff" r={0} glow="#ffd9a8" glowPower={1.2 * c.glow} cast={false} />
        </>
      )
    case 'coffee':
      return (
        <>
          <B p={[0, 0.45, -0.1]} s={[1.9, 0.9, 0.56]} c="#ece6da" r={0.015} rough={0.6} />
          <B p={[0, 0.92, -0.08]} s={[1.96, 0.04, 0.64]} c="#2b2d31" r={0.012} rough={0.25} />
          <B p={[-0.5, 1.13, -0.16]} s={[0.4, 0.38, 0.36]} c="#17191c" r={0.03} rough={0.3} metal={0.7} />
          <B p={[-0.5, 1.22, 0.022]} s={[0.24, 0.05, 0.004]} c="#201008" r={0} glow="#ff9a3c" glowPower={1.2 * c.glow} cast={false} />
          <C p={[-0.56, 1.0, 0.04]} r={[0.03, 0.025]} h={0.07} c="#f4f4f4" seg={12} cast={false} />
          <B p={[0.0, 1.06, -0.2]} s={[0.16, 0.26, 0.16]} c="#b9bcc0" r={0.02} metal={0.8} rough={0.3} />
          <C p={[0.0, 1.25, -0.2]} r={[0.07, 0.05]} h={0.12} c="#3b2a1e" glass={0.5} seg={12} cast={false} />
          {!c.lite && [0.42, 0.52, 0.62].map((x) => <C key={x} p={[x, 1.0, -0.14]} r={[0.035, 0.03]} h={0.12} c="#f4f4f4" seg={12} cast={false} />)}
          <B p={[0.72, 1.02, -0.18]} s={[0.2, 0.16, 0.28]} c={OAK_PALE} r={0.01} cast={false} />
          {[-0.4, 0.4].map((x) => (
            <group key={x}>
              <C p={[x, 0.72, 0.42]} r={[0.17, 0.17]} h={0.05} c={WALNUT} seg={16} />
              <C p={[x, 0.36, 0.42]} r={[0.02, 0.02]} h={0.7} c={STEEL} metal={0.9} rough={0.3} seg={8} cast={false} />
              <C p={[x, 0.015, 0.42]} r={[0.17, 0.19]} h={0.03} c={STEEL} metal={0.9} rough={0.3} seg={16} cast={false} />
            </group>
          ))}
        </>
      )
    case 'sofa':
      return <Sofa />
    case 'armchair':
      return (
        <>
          <B p={[0, 0.22, 0]} s={[0.74, 0.2, 0.72]} c="#8a5a44" r={0.05} rough={0.85} />
          <B p={[0, 0.52, 0.28]} s={[0.74, 0.5, 0.16]} c="#8a5a44" r={0.06} rough={0.85} />
          <B p={[-0.31, 0.38, 0]} s={[0.12, 0.3, 0.72]} c="#8a5a44" r={0.05} rough={0.85} />
          <B p={[0.31, 0.38, 0]} s={[0.12, 0.3, 0.72]} c="#8a5a44" r={0.05} rough={0.85} />
          <B p={[0, 0.36, -0.04]} s={[0.5, 0.12, 0.52]} c="#946450" r={0.05} rough={0.9} cast={false} />
          {[-1, 1].map((sx) => [-1, 1].map((sz) => <C key={`${sx}${sz}`} p={[sx * 0.3, 0.06, sz * 0.28]} r={[0.022, 0.018]} h={0.12} c={WALNUT} seg={8} cast={false} />))}
        </>
      )
    case 'pingpong':
      return (
        <>
          <B p={[0, 0.76, 0]} s={[1.86, 0.03, 0.9]} c="#1d5c8f" r={0.006} rough={0.5} />
          <B p={[0, 0.777, 0]} s={[0.012, 0.004, 0.9]} c="#fff" r={0} cast={false} />
          <B p={[0, 0.85, 0]} s={[0.01, 0.14, 0.96]} c="#f4f4f4" r={0} glass={0.55} cast={false} />
          {[-0.7, 0.7].map((x) => [-0.36, 0.36].map((z) => <B key={`${x}${z}`} p={[x, 0.37, z]} s={[0.04, 0.74, 0.04]} c={DARK} cast={false} />))}
          <C p={[0.5, 0.79, 0.2]} r={[0.07, 0.07]} h={0.012} c="#c0392b" seg={16} cast={false} />
          <S p={[-0.4, 0.8, -0.15]} r={0.018} c="#ff8a3d" cast={false} />
        </>
      )
    case 'arcade':
      return (
        <>
          <B p={[0, 0.5, 0]} s={[0.62, 1.0, 0.66]} c="#1b1d22" r={0.015} rough={0.6} />
          <B p={[0, 1.34, -0.1]} s={[0.62, 0.7, 0.46]} c="#1b1d22" r={0.015} rough={0.6} />
          <B p={[0, 1.36, 0.135]} s={[0.5, 0.42, 0.01]} c="#081018" r={0} glow="#3ad0ff" glowPower={1.1 * c.glow} rot={[-0.18, 0, 0]} cast={false} />
          <B p={[0, 1.76, 0.1]} s={[0.6, 0.14, 0.06]} c="#200820" r={0} glow="#ff4fa3" glowPower={1.3 * c.glow} cast={false} />
          <B p={[0, 1.04, 0.24]} s={[0.6, 0.05, 0.3]} c="#2a2d33" rot={[0.2, 0, 0]} cast={false} />
          <C p={[-0.14, 1.11, 0.24]} r={[0.012, 0.012]} h={0.1} c={STEEL} seg={8} cast={false} />
          <S p={[-0.14, 1.17, 0.24]} r={0.03} c="#e5484d" cast={false} />
          {[0.06, 0.16].map((x, i) => (
            <C key={x} p={[x, 1.08, 0.26]} r={[0.025, 0.025]} h={0.02} c={['#f2b631', '#36c5d6'][i]} seg={12} cast={false} />
          ))}
        </>
      )
    case 'plant':
      return <Plant seed={c.seed} />
    case 'tree':
      return (
        <>
          <B p={[0, 0.25, 0]} s={[0.7, 0.5, 0.7]} c="#d8d2c6" r={0.04} rough={0.85} />
          <B p={[0, 0.5, 0]} s={[0.62, 0.02, 0.62]} c="#3b2e25" r={0} rough={1} cast={false} />
          <C p={[0, 1.1, 0]} r={[0.035, 0.06]} h={1.2} c="#6b5444" seg={8} rough={0.95} />
          {[[0, 2.0, 0, 0.5], [0.3, 1.75, 0.15, 0.36], [-0.28, 1.8, -0.12, 0.38], [0.05, 2.4, -0.1, 0.32], [-0.1, 1.6, 0.28, 0.3]].map(([x, y, z, r], i) => (
            <S key={i} p={[x, y, z]} r={r} c={LEAF[(i + c.seed) % LEAF.length]} rough={0.95} flat />
          ))}
        </>
      )
    case 'bookshelf':
      return (
        <>
          <B p={[0, 1.0, -0.3]} s={[0.94, 2.0, 0.34]} c={WALNUT} r={0.008} rough={0.5} />
          {Array.from({ length: 5 }, (_, row) => (
            <group key={row}>
              <B p={[0, 0.22 + row * 0.38, -0.27]} s={[0.86, 0.3, 0.3]} c="#221a15" r={0} cast={false} />
              {!c.lite &&
                Array.from({ length: 7 }, (_, i) => {
                  const h = 0.18 + hash(c.seed + row * 9 + i) * 0.1
                  return <B key={i} p={[-0.36 + i * 0.12, 0.08 + row * 0.38 + h / 2, -0.2]} s={[0.09, h, 0.2]} c={['#c9553d', '#2f6f8f', '#e9e4da', '#3f7d4d', '#d6a24f', '#4a5568', '#8a5a44'][(i + row * 3) % 7]} r={0.004} cast={false} />
                })}
            </group>
          ))}
        </>
      )
    case 'rug':
      return (
        <>
          <B p={[0, 0.012, 0]} s={[1.9, 0.02, 1.9]} c={['#8c3b3b', '#31506b', '#5a6b3f', '#6a5a7a'][c.seed % 4]} r={0.008} rough={1} cast={false} />
          <B p={[0, 0.024, 0]} s={[1.5, 0.004, 1.5]} c="#e6dccb" r={0} rough={1} cast={false} />
          <B p={[0, 0.028, 0]} s={[1.3, 0.004, 1.3]} c={['#8c3b3b', '#31506b', '#5a6b3f', '#6a5a7a'][c.seed % 4]} r={0} rough={1} cast={false} />
        </>
      )
    case 'logowall':
      return (
        <>
          <B p={[0, 1.25, -0.38]} s={[1.94, 2.5, 0.12]} c="#191b1f" r={0.01} rough={0.7} />
          <B p={[0, 1.3, -0.315]} s={[1.6, 0.9, 0.01]} c="#101114" r={0} glow="#3a2a1a" glowPower={0.6 * c.glow} cast={false} />
          <Sign p={[0, 1.3, -0.305]} size={[1.5, 0.8]} name={c.company} logo={c.logo} glow={1.3 * c.glow} />
          <B p={[0, 0.08, -0.3]} s={[1.9, 0.02, 0.02]} c="#fff" r={0} glow="#ffd9a8" glowPower={1.5 * c.glow} cast={false} />
        </>
      )
    case 'aquarium':
      return (
        <>
          <B p={[0, 0.35, 0]} s={[1.9, 0.7, 0.6]} c={WALNUT} r={0.012} rough={0.4} />
          <B p={[0, 1.05, 0]} s={[1.86, 0.7, 0.56]} c="#6fc3e8" glass={0.3} r={0.01} cast={false} />
          <B p={[0, 0.74, 0]} s={[1.8, 0.07, 0.5]} c="#d9cdb2" r={0} rough={1} cast={false} />
          <B p={[0, 1.43, 0]} s={[1.9, 0.06, 0.6]} c={DARK} r={0.012} />
          <B p={[0, 1.39, 0]} s={[1.7, 0.01, 0.4]} c="#fff" r={0} glow="#bfe9ff" glowPower={1.4 * c.glow} cast={false} />
          {[-0.6, -0.1, 0.5].map((x, i) => (
            <S key={x} p={[x, 0.9, 0.05 - i * 0.06]} r={0.1 + i * 0.02} c={LEAF[i]} scale={[0.6, 1.6, 0.6]} flat cast={false} />
          ))}
          <Fish />
        </>
      )
    case 'sculpture':
      return (
        <>
          <B p={[0, 0.4, 0]} s={[0.5, 0.8, 0.5]} c="#e9e6e0" r={0.01} rough={0.35} />
          <mesh position={[0, 1.25, 0]} rotation={[0.4, c.seed, 0.2]} castShadow>
            <torusKnotGeometry args={[0.24, 0.07, 120, 14, 2, 3]} />
            <meshStandardMaterial color="#c9a25a" metalness={1} roughness={0.22} />
          </mesh>
        </>
      )
  }
  return <B p={[0, 0.25, 0]} s={[0.8, 0.5, 0.8]} c="#ff00ff" />
}

export { Chair, Plant, Sofa }
