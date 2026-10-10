// Factory machinery, with moving parts while the line is running.
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import { B, C, CHARCOAL, DARK, Person, S, STEEL, WHITE, hash } from './kit'

export interface FactoryCtx {
  /** True if this item is on a working line that has orders to build. */
  running: boolean
  /** For conveyors: direction of travel in the item's own (already rotated) frame. */
  flow?: [number, number]
  glow: number
  seed: number
}

const YELLOW = '#e2b93b'
const CARTON = '#b98d5a'

/** Red/amber/green signal tower on top of a machine. */
function StackLight({ p, state, glow }: { p: [number, number, number]; state: 'run' | 'idle'; glow: number }) {
  return (
    <group position={p}>
      <C p={[0, 0.1, 0]} r={[0.015, 0.015]} h={0.2} c={STEEL} seg={8} cast={false} />
      {['#3fe08a', '#ffb347', '#ff4d4f'].map((col, i) => {
        const lit = (state === 'run' && i === 0) || (state === 'idle' && i === 1)
        return <C key={col} p={[0, 0.24 + i * 0.07, 0]} r={[0.035, 0.035]} h={0.06} c={lit ? col : '#30343a'} glow={lit ? col : undefined} glowPower={2 * glow} seg={12} cast={false} />
      })}
    </group>
  )
}

function Carton({ p, s = 0.3 }: { p: [number, number, number]; s?: number }) {
  return (
    <>
      <B p={p} s={[s, s * 0.7, s * 0.8]} c={CARTON} r={0.008} rough={0.9} />
      <B p={[p[0], p[1] + s * 0.352, p[2]]} s={[s * 0.16, 0.002, s * 0.8]} c="#d9c39a" r={0} cast={false} />
    </>
  )
}

function Pallet({ p, boxes }: { p: [number, number, number]; boxes: number }) {
  return (
    <group position={p}>
      <B p={[0, 0.06, 0]} s={[0.84, 0.03, 0.8]} c="#a07a4f" r={0} rough={0.95} />
      {[-0.34, 0, 0.34].map((x) => (
        <B key={x} p={[x, 0.025, 0]} s={[0.1, 0.05, 0.8]} c="#8a6843" r={0} rough={0.95} cast={false} />
      ))}
      {Array.from({ length: boxes }, (_, i) => (
        <Carton key={i} p={[-0.21 + (i % 2) * 0.42, 0.21 + Math.floor(i / 4) * 0.27, -0.19 + (Math.floor(i / 2) % 2) * 0.38]} s={0.38} />
      ))}
    </group>
  )
}

/** Boxes travelling along a one-tile belt. */
function BeltBoxes({ dir, running }: { dir: [number, number]; running: boolean }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.visible = running
    if (!running) return
    const t = (clock.elapsedTime * 0.5) % 1
    ref.current.children.forEach((child, i) => {
      const u = ((t + i * 0.5) % 1) - 0.5
      child.position.set(dir[0] * u, 0.56, dir[1] * u)
    })
  })
  return (
    <group ref={ref}>
      {[0, 1].map((i) => (
        <group key={i}>
          <B p={[0, 0, 0]} s={[0.2, 0.05, 0.3]} c="#22262b" r={0.012} rough={0.4} cast={false} />
          <B p={[0, 0.027, 0]} s={[0.17, 0.004, 0.26]} c="#16324a" r={0} rough={0.2} cast={false} />
        </group>
      ))}
    </group>
  )
}

function RobotArm({ running, glow }: { running: boolean; glow: number }) {
  const turn = useRef<THREE.Group>(null)
  const elbow = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!turn.current || !elbow.current || !running) return
    const t = clock.elapsedTime
    turn.current.rotation.y = Math.sin(t * 0.9) * 1.1
    elbow.current.rotation.z = -0.9 + Math.sin(t * 1.8) * 0.35
  })
  return (
    <group position={[-0.25, 0, -0.2]}>
      <C p={[0, 0.2, 0]} r={[0.2, 0.26]} h={0.4} c={CHARCOAL} seg={20} />
      <group ref={turn} position={[0, 0.4, 0]}>
        <C p={[0, 0.1, 0]} r={[0.15, 0.17]} h={0.2} c={YELLOW} seg={20} rough={0.5} />
        <group rotation={[0, 0, 0.5]} position={[0, 0.2, 0]}>
          <B p={[0, 0.35, 0]} s={[0.13, 0.7, 0.14]} c={YELLOW} r={0.04} rough={0.5} />
          <C p={[0, 0.7, 0]} r={[0.09, 0.09]} h={0.18} c={CHARCOAL} seg={16} rot={[Math.PI / 2, 0, 0]} />
          <group ref={elbow} position={[0, 0.7, 0]} rotation={[0, 0, -0.9]}>
            <B p={[0, 0.3, 0]} s={[0.1, 0.6, 0.11]} c={YELLOW} r={0.035} rough={0.5} />
            <C p={[0, 0.62, 0]} r={[0.05, 0.06]} h={0.1} c={CHARCOAL} seg={12} />
            <B p={[0, 0.7, 0]} s={[0.16, 0.03, 0.05]} c={STEEL} metal={0.9} rough={0.3} cast={false} />
            <C p={[0, 0.73, 0]} r={[0.012, 0.012]} h={0.02} c="#fff" glow="#7fd1ff" glowPower={2 * glow} seg={8} cast={false} />
          </group>
        </group>
      </group>
    </group>
  )
}

/** The model for one factory item. */
export function FactoryItem({ kind, c }: { kind: string; c: FactoryCtx }) {
  const state = c.running ? 'run' : 'idle'
  switch (kind) {
    case 'dock_in':
    case 'dock_out': {
      const out = kind === 'dock_out'
      return (
        <>
          <B p={[0, 0.02, 0]} s={[1.96, 0.04, 0.96]} c={out ? '#2f6b4c' : '#2f5a8f'} r={0} rough={0.6} cast={false} />
          {[-0.96, 0.96].map((x) => (
            <B key={x} p={[x, 1.3, -0.44]} s={[0.08, 2.6, 0.08]} c={YELLOW} rough={0.5} />
          ))}
          <B p={[0, 2.64, -0.44]} s={[2.0, 0.1, 0.1]} c={YELLOW} rough={0.5} />
          {Array.from({ length: 9 }, (_, i) => (
            <B key={i} p={[0, 0.2 + i * 0.27, -0.45]} s={[1.84, 0.25, 0.03]} c={i % 2 ? '#aeb4ba' : '#bcc2c8'} r={0} metal={0.6} rough={0.45} cast={false} />
          ))}
          <B p={[0, 2.82, -0.42]} s={[0.9, 0.2, 0.02]} c={out ? '#123322' : '#12233a'} r={0} glow={out ? '#3fe08a' : '#5aa9ff'} glowPower={0.9 * c.glow} cast={false} />
          <Pallet p={[-0.5, 0.04, 0.05]} boxes={out ? 8 : 4} />
          <Pallet p={[0.5, 0.04, 0.05]} boxes={out ? 6 : 8} />
        </>
      )
    }
    case 'conveyor': {
      const dir = c.flow ?? [1, 0]
      const alongX = dir[0] !== 0
      return (
        <group rotation={[0, alongX ? 0 : Math.PI / 2, 0]}>
          <B p={[0, 0.5, 0]} s={[1.0, 0.05, 0.46]} c="#23262b" r={0} rough={0.85} />
          {[-0.25, 0.25].map((z) => (
            <B key={z} p={[0, 0.52, z]} s={[1.0, 0.1, 0.04]} c={STEEL} r={0} metal={0.8} rough={0.4} cast={false} />
          ))}
          {[-0.4, 0.4].map((x) => [-0.2, 0.2].map((z) => <B key={`${x}${z}`} p={[x, 0.24, z]} s={[0.04, 0.48, 0.04]} c={STEEL} r={0} metal={0.8} rough={0.4} cast={false} />))}
          {[-0.33, 0, 0.33].map((x) => (
            <C key={x} p={[x, 0.47, 0]} r={[0.03, 0.03]} h={0.44} c="#3a3f46" seg={8} rot={[Math.PI / 2, 0, 0]} cast={false} />
          ))}
          <BeltBoxes dir={[alongX ? dir[0] : dir[1], 0]} running={c.running} />
        </group>
      )
    }
    case 'smt':
      return (
        <>
          <B p={[0, 0.5, 0]} s={[2.9, 1.0, 0.86]} c={WHITE} r={0.02} rough={0.45} metal={0.2} />
          <B p={[0, 1.28, 0]} s={[2.9, 0.56, 0.86]} c="#dfe3e6" r={0.02} rough={0.45} metal={0.2} />
          {[-0.95, 0, 0.95].map((x) => (
            <group key={x}>
              <B p={[x, 1.26, 0.435]} s={[0.78, 0.4, 0.01]} c="#12202e" r={0} glass={0.55} cast={false} />
              <B p={[x, 1.1, 0.3]} s={[0.6, 0.02, 0.2]} c="#2f6b4c" r={0} glow={c.running ? '#3fe08a' : undefined} glowPower={0.4 * c.glow} cast={false} />
            </group>
          ))}
          <B p={[1.2, 0.72, 0.445]} s={[0.3, 0.22, 0.02]} c="#0b1016" r={0} glow="#58b6ff" glowPower={0.8 * c.glow} cast={false} />
          <B p={[0, 0.06, 0.44]} s={[2.9, 0.1, 0.02]} c={YELLOW} r={0} cast={false} />
          <StackLight p={[1.3, 1.56, -0.3]} state={state} glow={c.glow} />
          <B p={[-1.47, 0.78, 0]} s={[0.06, 0.12, 0.4]} c={DARK} r={0} cast={false} />
          <B p={[1.47, 0.78, 0]} s={[0.06, 0.12, 0.4]} c={DARK} r={0} cast={false} />
        </>
      )
    case 'robot':
      return (
        <>
          <B p={[0, 0.02, 0]} s={[1.96, 0.04, 1.96]} c="#3a3f46" r={0} rough={0.7} cast={false} />
          {[-0.94, 0.94].map((x) => [-0.94, 0.94].map((z) => <B key={`${x}${z}`} p={[x, 0.95, z]} s={[0.06, 1.9, 0.06]} c={YELLOW} r={0} />))}
          {[-0.94, 0.94].map((x) => (
            <B key={x} p={[x, 1.0, 0]} s={[0.02, 1.5, 1.82]} c="#cfe6f5" glass={0.14} r={0} cast={false} />
          ))}
          <B p={[0, 1.0, -0.94]} s={[1.82, 1.5, 0.02]} c="#cfe6f5" glass={0.14} r={0} cast={false} />
          <B p={[0.45, 0.42, 0.3]} s={[0.8, 0.84, 0.7]} c={WHITE} r={0.015} rough={0.45} metal={0.2} />
          <B p={[0.45, 0.86, 0.3]} s={[0.3, 0.03, 0.45]} c="#1b1e22" r={0.01} cast={false} />
          <RobotArm running={c.running} glow={c.glow} />
          <StackLight p={[0.88, 1.9, 0.88]} state={state} glow={c.glow} />
        </>
      )
    case 'manual':
      return (
        <>
          <B p={[0, 0.86, -0.12]} s={[0.94, 0.04, 0.56]} c="#c9b28a" r={0.01} rough={0.6} />
          {[-0.42, 0.42].map((x) => (
            <B key={x} p={[x, 0.43, -0.12]} s={[0.05, 0.86, 0.5]} c={STEEL} r={0} metal={0.8} rough={0.4} />
          ))}
          <B p={[0, 1.5, -0.36]} s={[0.94, 0.04, 0.12]} c={STEEL} r={0} metal={0.8} rough={0.4} cast={false} />
          <B p={[0, 1.47, -0.3]} s={[0.7, 0.015, 0.06]} c="#fff" r={0} glow="#fff4dc" glowPower={1.6 * c.glow} cast={false} />
          {[-0.44, 0.44].map((x) => (
            <B key={x} p={[x, 1.2, -0.38]} s={[0.03, 0.62, 0.03]} c={STEEL} r={0} metal={0.8} rough={0.4} cast={false} />
          ))}
          {['#c9553d', '#2f6f8f', '#e2b93b'].map((col, i) => (
            <B key={col} p={[-0.28 + i * 0.28, 0.93, -0.3]} s={[0.2, 0.1, 0.14]} c={col} r={0.008} cast={false} />
          ))}
          <B p={[0, 0.89, 0]} s={[0.16, 0.02, 0.3]} c="#22262b" r={0.01} cast={false} />
          <Person who={{ look: c.seed * 37 + 11, color: '#3b6ea5' }} pose="stand" busy={c.running} p={[0, 0, 0.3]} />
        </>
      )
    case 'test':
      return (
        <>
          <B p={[0, 0.9, -0.05]} s={[0.84, 1.8, 0.7]} c="#2b3038" r={0.02} rough={0.5} metal={0.3} />
          <B p={[0, 1.36, 0.305]} s={[0.56, 0.36, 0.01]} c="#081018" r={0} glow={c.running ? '#3fe08a' : '#3a5a7a'} glowPower={0.9 * c.glow} cast={false} />
          <B p={[0, 0.9, 0.3]} s={[0.6, 0.3, 0.02]} c="#12151a" r={0} glass={0.5} cast={false} />
          <B p={[0, 0.82, 0.2]} s={[0.16, 0.02, 0.3]} c="#22262b" r={0.01} cast={false} />
          {[-0.2, 0, 0.2].map((x) => (
            <C key={x} p={[x, 0.56, 0.305]} r={[0.03, 0.03]} h={0.02} c={['#e5484d', '#f2b631', '#4cc38a'][Math.round(x * 5 + 1)]} seg={12} rot={[Math.PI / 2, 0, 0]} cast={false} />
          ))}
          <StackLight p={[0.3, 1.8, -0.2]} state={state} glow={c.glow} />
        </>
      )
    case 'pack':
      return (
        <>
          <B p={[-0.3, 0.6, 0]} s={[1.2, 1.2, 0.86]} c={WHITE} r={0.02} rough={0.45} metal={0.2} />
          <B p={[-0.3, 1.0, 0.435]} s={[0.9, 0.3, 0.01]} c="#12202e" r={0} glass={0.5} cast={false} />
          <B p={[-0.3, 1.5, 0]} s={[0.7, 0.6, 0.6]} c="#3d6ea8" r={0.03} rough={0.5} />
          <B p={[0.62, 0.5, 0]} s={[0.66, 0.06, 0.6]} c="#23262b" r={0} rough={0.85} />
          {[0.36, 0.88].map((x) => (
            <B key={x} p={[x, 0.25, 0]} s={[0.05, 0.5, 0.5]} c={STEEL} r={0} metal={0.8} rough={0.4} cast={false} />
          ))}
          <Carton p={[0.5, 0.64, 0.02]} s={0.28} />
          <Carton p={[0.8, 0.64, -0.05]} s={0.28} />
          {c.seed % 2 === 0 && <Carton p={[0.66, 0.84, 0]} s={0.26} />}
          <StackLight p={[-0.8, 1.2, -0.3]} state={state} glow={c.glow} />
        </>
      )
    case 'rack':
      return (
        <>
          {[-0.94, 0, 0.94].map((x) => [-0.36, 0.36].map((z) => <B key={`${x}${z}`} p={[x, 1.3, z]} s={[0.06, 2.6, 0.06]} c="#2f5a8f" r={0} rough={0.5} />))}
          {[0.12, 0.98, 1.84].map((y, level) => (
            <group key={y}>
              <B p={[0, y, 0]} s={[1.9, 0.06, 0.8]} c="#d17a2f" r={0} rough={0.6} />
              {[-0.66, -0.22, 0.22, 0.66].map((x, i) => hash(c.seed + level * 7 + i) > 0.25 && <Carton key={x} p={[x, y + 0.2, 0]} s={0.4} />)}
            </group>
          ))}
        </>
      )
    case 'pallets':
      return <Pallet p={[0, 0, 0]} boxes={4 + (c.seed % 3) * 4} />
  }
  return <S p={[0, 0.4, 0]} r={0.3} c="#ff00ff" />
}
