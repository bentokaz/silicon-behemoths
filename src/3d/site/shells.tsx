// The building around a site floor, and the world outside it. Each tier of
// office, factory and store has its own shell. The floor is centred on the
// origin; the back (-Z) and left (-X) walls are full height, the others are
// left open or glazed so the interior stays visible.
import { useMemo } from 'react'
import * as THREE from 'three'
import { RING_INNER } from '../../sim/sites'
import { B, C, DARK, S, STEEL, Sign, Trees, WHITE, hash, mat } from './kit'

export type Mood = 'day' | 'dusk' | 'night'
export const MOODS: Record<Mood, { sky: string; ground: number; sun: number; sunColor: string; sunDir: [number, number, number]; hemi: number; glow: number }> = {
  day: { sky: '#a8c8e4', ground: 1, sun: 2.5, sunColor: '#fff3dd', sunDir: [0.5, 1, 0.45], hemi: 0.75, glow: 0.7 },
  dusk: { sky: '#d98f66', ground: 0.72, sun: 1.5, sunColor: '#ffab72', sunDir: [0.9, 0.38, 0.5], hemi: 0.45, glow: 1.25 },
  night: { sky: '#0a0f1e', ground: 0.3, sun: 0.22, sunColor: '#9db4e0', sunDir: [-0.4, 1, 0.5], hemi: 0.2, glow: 2 },
}

export interface ShellProps {
  shell: string
  w: number
  h: number
  mood: Mood
  company: string
  color: string
  logo?: string
}

const H = 3
const GLASS = '#bfe0f2'
const dim = (hex: string, f: number) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString()

function Ground({ color, size = 400, y = -0.03, mood }: { color: string; size?: number; y?: number; mood: Mood }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, y, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshLambertMaterial color={dim(color, MOODS[mood].ground)} />
    </mesh>
  )
}

/** A flat patch on the ground: paths, roads, lawns, water. */
function Patch({ p, s, c, mood, glossy = false }: { p: [number, number]; s: [number, number]; c: string; mood: Mood; glossy?: boolean }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[p[0], -0.02, p[1]]} receiveShadow>
      <planeGeometry args={s} />
      {glossy ? <meshStandardMaterial color={dim(c, MOODS[mood].ground)} roughness={0.08} metalness={0.3} /> : <meshLambertMaterial color={dim(c, MOODS[mood].ground)} />}
    </mesh>
  )
}

/** A straight run of full-height glass with mullions, from (x1,z1) to (x2,z2). */
function Glazing({ from, to, height = H, frame = WHITE, y = 0 }: { from: [number, number]; to: [number, number]; height?: number; frame?: string; y?: number }) {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  const rotY = -Math.atan2(dz, dx)
  const bays = Math.max(1, Math.round(len / 2))
  return (
    <group position={[(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2]} rotation={[0, rotY, 0]}>
      <B p={[0, height / 2, 0]} s={[len, height, 0.03]} c={GLASS} glass={0.16} r={0} cast={false} />
      {Array.from({ length: bays + 1 }, (_, i) => (
        <B key={i} p={[-len / 2 + (i * len) / bays, height / 2, 0]} s={[0.06, height, 0.09]} c={frame} r={0} metal={0.4} rough={0.4} />
      ))}
      <B p={[0, height - 0.04, 0]} s={[len, 0.08, 0.1]} c={frame} r={0} metal={0.4} rough={0.4} />
      <B p={[0, 0.04, 0]} s={[len, 0.08, 0.1]} c={frame} r={0} metal={0.4} rough={0.4} cast={false} />
    </group>
  )
}

/** A solid wall along the back (-Z) or left (-X) edge, with optional lit windows. */
function Wall({ side, w, h, color, windows = 0, sill = 1, winH = 1.3, glow, height = H, rough = 0.9 }: { side: 'back' | 'left'; w: number; h: number; color: string; windows?: number; sill?: number; winH?: number; glow: number; height?: number; rough?: number }) {
  const len = side === 'back' ? w + 0.3 : h
  const pos: [number, number, number] = side === 'back' ? [0, height / 2, -h / 2 - 0.075] : [-w / 2 - 0.075, height / 2, 0]
  return (
    <group position={pos} rotation={[0, side === 'back' ? 0 : Math.PI / 2, 0]}>
      <B p={[0, 0, 0]} s={[len, height, 0.15]} c={color} r={0} rough={rough} />
      {Array.from({ length: windows }, (_, i) => {
        const x = -len / 2 + ((i + 0.5) * len) / windows
        const ww = Math.min(1.5, (len / windows) * 0.62)
        return (
          <group key={i} position={[x, sill + winH / 2 - height / 2, 0.078]}>
            <B p={[0, 0, 0]} s={[ww, winH, 0.01]} c="#9cc4e8" r={0} glow="#bcdcf7" glowPower={0.5 * glow} rough={0.1} cast={false} />
            <B p={[0, 0, 0.006]} s={[0.04, winH, 0.02]} c={DARK} r={0} cast={false} />
            <B p={[0, 0, 0.006]} s={[ww, 0.04, 0.02]} c={DARK} r={0} cast={false} />
            <B p={[0, -winH / 2 - 0.03, 0.03]} s={[ww + 0.1, 0.05, 0.1]} c={WHITE} r={0} cast={false} />
          </group>
        )
      })}
    </group>
  )
}

/** Low kerbs on the open sides so the floor has a clean edge. */
function Kerbs({ w, h, color = '#3a3531' }: { w: number; h: number; color?: string }) {
  return (
    <>
      <B p={[0, 0.06, h / 2 + 0.05]} s={[w + 0.3, 0.12, 0.1]} c={color} r={0} />
      <B p={[w / 2 + 0.05, 0.06, 0]} s={[0.1, 0.12, h]} c={color} r={0} />
    </>
  )
}

function Car({ p, rotY = 0, color }: { p: [number, number, number]; rotY?: number; color: string }) {
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <B p={[0, 0.42, 0]} s={[1.75, 0.5, 4.1]} c={color} r={0.16} rough={0.3} metal={0.5} />
      <B p={[0, 0.88, -0.15]} s={[1.55, 0.5, 2.2]} c="#10151b" r={0.2} rough={0.1} metal={0.4} />
      {[-0.82, 0.82].map((x) => [-1.3, 1.3].map((z) => <C key={`${x}${z}`} p={[x, 0.3, z]} r={[0.31, 0.31]} h={0.22} c="#14161a" seg={16} rot={[0, 0, Math.PI / 2]} />))}
      <B p={[0, 0.45, 2.05]} s={[1.4, 0.1, 0.03]} c="#fff" r={0} glow="#fff4dc" glowPower={0.6} cast={false} />
      <B p={[0, 0.5, -2.05]} s={[1.4, 0.08, 0.03]} c="#400" r={0} glow="#ff2a2a" glowPower={0.6} cast={false} />
    </group>
  )
}

function Truck({ p, rotY = 0, color }: { p: [number, number, number]; rotY?: number; color: string }) {
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <B p={[0, 1.6, -1.2]} s={[2.4, 2.6, 7.4]} c={color} r={0.04} rough={0.6} />
      <B p={[0, 1.35, 3.3]} s={[2.3, 2.1, 1.7]} c={WHITE} r={0.12} rough={0.4} />
      <B p={[0, 1.75, 4.16]} s={[2.0, 0.8, 0.03]} c="#10151b" r={0} rough={0.1} cast={false} />
      {[-1.05, 1.05].map((x) => [3.3, -0.4, -2.2, -3.6].map((z) => <C key={`${x}${z}`} p={[x, 0.45, z]} r={[0.46, 0.46]} h={0.3} c="#14161a" seg={16} rot={[0, 0, Math.PI / 2]} />))}
    </group>
  )
}

/** Boxy buildings for a city backdrop. `base` is the y of their feet. */
function Skyline({ around, count, base = 0, minH = 6, maxH = 30, glow, seed = 1 }: { around: number; count: number; base?: number; minH?: number; maxH?: number; glow: number; seed?: number }) {
  const mesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.2 }), count)
    const lit = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#141a22', emissive: '#ffd9a0', emissiveIntensity: 0.25 * glow, roughness: 0.3 }), count * 3)
    const mx = new THREE.Matrix4()
    const col = new THREE.Color()
    let k = 0
    for (let i = 0; i < count; i++) {
      const a = hash(i * 3 + seed) * Math.PI * 2
      const r = around + hash(i * 7 + seed) * around * 1.6
      const bw = 5 + hash(i * 11 + seed) * 9
      const bd = 5 + hash(i * 13 + seed) * 9
      const bh = minH + hash(i * 17 + seed) * (maxH - minH)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      mx.compose(new THREE.Vector3(x, base + bh / 2, z), new THREE.Quaternion(), new THREE.Vector3(bw, bh, bd))
      m.setMatrixAt(i, mx)
      m.setColorAt(i, col.setHSL(0.6, 0.08, 0.2 + hash(i * 19 + seed) * 0.2))
      // a few lit floors on each tower
      for (let f = 0; f < 3; f++) {
        const fy = base + bh * (0.25 + 0.25 * f) + hash(i + f) * 2
        mx.compose(new THREE.Vector3(x, fy, z), new THREE.Quaternion(), new THREE.Vector3(bw + 0.05, 0.5, bd + 0.05))
        lit.setMatrixAt(k++, mx)
      }
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    lit.instanceMatrix.needsUpdate = true
    return [m, lit]
  }, [around, count, base, minH, maxH, glow, seed])
  return (
    <>
      <primitive object={mesh[0]} />
      <primitive object={mesh[1]} />
    </>
  )
}

/** Trees scattered in a band around the site, clear of the building. */
function useScatter(count: number, inner: number, outer: number, seed: number, skip?: (x: number, z: number) => boolean): [number, number, number][] {
  return useMemo(() => {
    const out: [number, number, number][] = []
    for (let i = 0; out.length < count && i < count * 4; i++) {
      const a = hash(i * 5 + seed) * Math.PI * 2
      const r = inner + Math.sqrt(hash(i * 9 + seed)) * (outer - inner)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (skip?.(x, z)) continue
      out.push([x, z, 1.6 + hash(i * 3 + seed) * 1.6])
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, inner, outer, seed])
}

function Lamp({ p, glow }: { p: [number, number, number]; glow: number }) {
  return (
    <group position={p}>
      <C p={[0, 2, 0]} r={[0.05, 0.07]} h={4} c={DARK} seg={8} />
      <B p={[0, 4, 0.3]} s={[0.12, 0.06, 0.7]} c={DARK} r={0} cast={false} />
      <B p={[0, 3.96, 0.5]} s={[0.1, 0.02, 0.26]} c="#fff" r={0} glow="#ffe2b0" glowPower={glow} cast={false} />
    </group>
  )
}

// ---------------------------------------------------------------- shells

function Garage({ w, h, mood }: ShellProps) {
  const glow = MOODS[mood].glow
  const trees = useScatter(9, Math.max(w, h) * 0.9 + 6, 34, 4, (x, z) => z > 2 && Math.abs(x) < 6)
  return (
    <>
      <Ground color="#5d7a4a" mood={mood} />
      <Patch p={[0, h / 2 + 9]} s={[w + 2, 18]} c="#8b8e92" mood={mood} />
      <Patch p={[0, h / 2 + 19.5]} s={[90, 7]} c="#3b3e43" mood={mood} />
      <Wall side="back" w={w} h={h} color="#8f5444" windows={2} sill={1.5} winH={0.8} glow={glow} />
      <Wall side="left" w={w} h={h} color="#87503f" glow={glow} />
      <Kerbs w={w} h={h} color="#55504a" />
      {/* door posts on the open front; the lintel is left out so it does not block the view */}
      {[-w / 2, w / 2].map((x) => (
        <B key={x} p={[x, H / 2, h / 2 + 0.05]} s={[0.2, H, 0.2]} c={WHITE} r={0} />
      ))}
      {/* shelving and a workbench against the back wall */}
      <group position={[w / 2 - 1.4, 0, -h / 2 + 0.3]}>
        {[0.5, 1.2, 1.9].map((y) => (
          <B key={y} p={[0, y, 0]} s={[2.2, 0.05, 0.45]} c="#8a6843" r={0} />
        ))}
        {[-1.05, 1.05].map((x) => (
          <B key={x} p={[x, 1.1, 0]} s={[0.06, 2.2, 0.45]} c={STEEL} r={0} metal={0.7} rough={0.5} />
        ))}
        {[['#b98d5a', -0.7, 0.72], ['#c9553d', -0.1, 0.66], ['#2f6f8f', 0.55, 0.7], ['#b98d5a', -0.4, 1.4], ['#e2b93b', 0.4, 1.38], ['#4a5568', 0, 2.08]].map(([c, x, y], i) => (
          <B key={i} p={[x as number, y as number, 0]} s={[0.5, 0.36, 0.36]} c={c as string} r={0.01} cast={false} />
        ))}
      </group>
      {[-w / 4, w / 4].map((x) => (
        <group key={x}>
          <B p={[x, H - 0.25, 0]} s={[0.14, 0.05, h * 0.5]} c={WHITE} r={0} cast={false} />
          <B p={[x, H - 0.285, 0]} s={[0.1, 0.02, h * 0.48]} c="#fff" r={0} glow="#f4f8ff" glowPower={1.2 * glow} cast={false} />
        </group>
      ))}
      <Car p={[w / 2 + 3.4, 0, h / 2 + 5]} rotY={0.08} color="#3d5a80" />
      <group position={[-w / 2 - 2.2, 0, h / 2 + 3]}>
        <C p={[0, 0.55, 0]} r={[0.04, 0.04]} h={1.1} c={DARK} seg={8} />
        <B p={[0, 1.2, 0]} s={[0.25, 0.22, 0.45]} c="#c9553d" r={0.04} />
      </group>
      <Trees at={trees} />
    </>
  )
}

function Loft({ w, h, mood }: ShellProps) {
  const glow = MOODS[mood].glow
  return (
    <>
      <Ground color="#4c4f54" mood={mood} />
      <Patch p={[0, h / 2 + 12]} s={[120, 8]} c="#2f3237" mood={mood} />
      <Wall side="back" w={w} h={h} color="#8a4f3f" windows={Math.floor(w / 3)} sill={0.9} winH={2.4} glow={glow} height={4} />
      <Wall side="left" w={w} h={h} color="#834b3c" windows={Math.floor(h / 3)} sill={0.9} winH={2.4} glow={glow} height={4} />
      <Kerbs w={w} h={h} />
      {/* steel columns and a beam, the bones of the old warehouse */}
      {Array.from({ length: Math.floor(w / 4) + 1 }, (_, i) => {
        const x = -w / 2 + 0.2 + (i * (w - 0.4)) / Math.floor(w / 4)
        return (
          <group key={i}>
            <B p={[x, 2, -h / 2 + 0.2]} s={[0.2, 4, 0.2]} c="#2a2d31" r={0} metal={0.6} rough={0.5} />
            <B p={[x, 3.9, 0]} s={[0.16, 0.26, h]} c="#2a2d31" r={0} metal={0.6} rough={0.5} cast={false} />
            {[-h / 4, h / 4].map((z) => (
              <group key={z}>
                <C p={[x, 3.4, z]} r={[0.008, 0.008]} h={0.8} c={DARK} seg={6} cast={false} />
                <C p={[x, 2.95, z]} r={[0.07, 0.2]} h={0.16} c="#1d1f22" seg={16} cast={false} />
                <S p={[x, 2.9, z]} r={0.06} c="#fff" glow="#ffd9a0" glowPower={2.2 * glow} cast={false} />
              </group>
            ))}
          </group>
        )
      })}
      <Skyline around={34} count={26} minH={8} maxH={22} glow={glow} seed={3} />
      {[-12, 0, 12].map((x) => (
        <Lamp key={x} p={[x, 0, h / 2 + 7]} glow={2 * glow} />
      ))}
      <Car p={[-6, 0, h / 2 + 11]} rotY={Math.PI / 2} color="#b23b3b" />
      <Car p={[9, 0, h / 2 + 13.6]} rotY={-Math.PI / 2} color="#d8d8dc" />
    </>
  )
}

function Tower({ w, h, mood }: ShellProps) {
  const glow = MOODS[mood].glow
  return (
    <>
      <Ground color="#33363b" y={-60} size={900} mood={mood} />
      {/* the floor plate and the storeys below it */}
      <B p={[0, -0.3, 0]} s={[w + 0.6, 0.5, h + 0.6]} c="#d9dcdf" r={0} />
      <B p={[0, -30.5, 0]} s={[w, 60, h]} c="#1b2430" r={0} rough={0.2} metal={0.6} />
      {Array.from({ length: 14 }, (_, i) => (
        <B key={i} p={[0, -4 - i * 4, 0]} s={[w + 0.3, 0.3, h + 0.3]} c="#c4c8cc" r={0} cast={false} />
      ))}
      <Glazing from={[-w / 2, -h / 2]} to={[w / 2, -h / 2]} height={3.4} frame="#2a2d31" />
      <Glazing from={[-w / 2, h / 2]} to={[-w / 2, -h / 2]} height={3.4} frame="#2a2d31" />
      <Kerbs w={w} h={h} color="#2a2d31" />
      <B p={[0, 3.5, -h / 2]} s={[w + 0.6, 0.25, 0.5]} c="#d9dcdf" r={0} />
      <B p={[-w / 2, 3.5, 0]} s={[0.5, 0.25, h + 0.6]} c="#d9dcdf" r={0} />
      <Skyline around={50} count={70} base={-60} minH={25} maxH={78} glow={glow} seed={8} />
    </>
  )
}

function Hq({ w, h, mood, company, logo, color }: ShellProps) {
  const glow = MOODS[mood].glow
  const trees = useScatter(46, Math.max(w, h) * 0.62 + 4, 60, 12, (x, z) => (z > h / 2 + 3 && z < h / 2 + 22 && Math.abs(x) < 20) || (Math.abs(x + w / 2 + 12) < 7 && Math.abs(z) < 6))
  return (
    <>
      <Ground color="#5f8250" mood={mood} />
      <Patch p={[0, h / 2 + 4]} s={[w + 14, 8]} c="#c9c2b4" mood={mood} />
      <Patch p={[0, h / 2 + 14]} s={[44, 12]} c="#3b3e43" mood={mood} />
      <Patch p={[0, h / 2 + 24]} s={[140, 8]} c="#2f3237" mood={mood} />
      <Patch p={[-w / 2 - 12, 0]} s={[12, 10]} c="#4e8fb5" mood={mood} glossy />
      <Glazing from={[-w / 2, -h / 2]} to={[w / 2, -h / 2]} height={3.6} />
      <Glazing from={[-w / 2, h / 2]} to={[-w / 2, -h / 2]} height={3.6} />
      <Kerbs w={w} h={h} color="#d9d6d0" />
      {/* a white roof plane floating over the back third, on slim columns */}
      <B p={[0, 3.75, -h / 2 + h * 0.16]} s={[w + 3, 0.22, h * 0.32 + 3]} c={WHITE} r={0.04} rough={0.4} />
      <B p={[-w / 2 + w * 0.08, 3.75, 0]} s={[w * 0.16 + 3, 0.22, h + 3]} c={WHITE} r={0.04} rough={0.4} />
      {Array.from({ length: Math.floor(w / 4) + 1 }, (_, i) => (
        <C key={i} p={[-w / 2 + (i * w) / Math.floor(w / 4), 1.85, -h / 2 + h * 0.32]} r={[0.07, 0.07]} h={3.7} c={WHITE} seg={12} />
      ))}
      {/* sign, flags and parked cars out front */}
      <group position={[w / 2 + 3, 0, h / 2 + 6]}>
        <B p={[0, 0.9, 0]} s={[4.4, 1.8, 0.4]} c="#17191c" r={0.03} rough={0.5} />
        <Sign p={[0, 0.95, 0.21]} size={[3.8, 1.3]} name={company} logo={logo} glow={0.4 + 0.5 * glow} />
      </group>
      {[0, 1.2, 2.4].map((dx, i) => (
        <group key={dx} position={[-w / 2 - 3 + dx, 0, h / 2 + 6]}>
          <C p={[0, 3.5, 0]} r={[0.03, 0.04]} h={7} c={STEEL} seg={8} metal={0.8} rough={0.3} />
          <B p={[0.6, 6.4, 0]} s={[1.2, 0.75, 0.02]} c={i === 1 ? color : WHITE} r={0} rough={0.9} cast={false} />
        </group>
      ))}
      {['#3d5a80', '#d8d8dc', '#1f2226', '#b23b3b', '#e9e4da', '#4a6b52'].map((c, i) => (
        <Car key={i} p={[-13 + i * 5.2, 0, h / 2 + 14]} rotY={i % 2 ? Math.PI : 0} color={c} />
      ))}
      {[-16, 16].map((x) => (
        <Lamp key={x} p={[x, 0, h / 2 + 8.5]} glow={2 * glow} />
      ))}
      <Trees at={trees} />
    </>
  )
}

/** The ring campus: a glass ring around a private park. */
function Ring({ w, mood, company, logo }: ShellProps) {
  const glow = MOODS[mood].glow
  const g = MOODS[mood].ground
  const R = w / 2 - 0.4
  const r = R * RING_INNER
  const parkRaw = useScatter(46, 1.5, r - 3, 21, (x, z) => Math.hypot(x - 2.5, z + 1.5) < 4.4)
  // courtyard trees are kept small so the ring stays the star
  const park = useMemo<[number, number, number][]>(() => parkRaw.map(([x, z, s]) => [x, z, s * 0.42]), [parkRaw])
  const outside = useScatter(170, R + 7, R + 70, 33, (x, z) => Math.abs(x) < 5 && z > 0)
  const fins = useMemo(() => {
    const n = 96
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 3.5, 0.3), mat(WHITE, { rough: 0.4, metal: 0.3 }), n * 2)
    const mx = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      q.setFromEuler(new THREE.Euler(0, -a, 0))
      mx.compose(new THREE.Vector3(Math.cos(a) * (R + 0.95), 1.75, Math.sin(a) * (R + 0.95)), q, new THREE.Vector3(1, 1, 1))
      m.setMatrixAt(i, mx)
      mx.compose(new THREE.Vector3(Math.cos(a) * (r - 0.95), 1.75, Math.sin(a) * (r - 0.95)), q, new THREE.Vector3(1, 1, 1))
      m.setMatrixAt(n + i, mx)
    }
    m.castShadow = true
    m.instanceMatrix.needsUpdate = true
    return m
  }, [R, r])
  const flat = (inner: number, outer: number, y: number, color: string, look: { rough?: number; metal?: number; glow?: string } = {}) => (
    <mesh rotation-x={-Math.PI / 2} position={[0, y, 0]} receiveShadow castShadow={y > 1}>
      <ringGeometry args={[inner, outer, 128]} />
      <meshStandardMaterial color={color} roughness={look.rough ?? 0.8} metalness={look.metal ?? 0} emissive={look.glow ?? '#000'} emissiveIntensity={look.glow ? 0.5 * glow : 0} side={THREE.DoubleSide} />
    </mesh>
  )
  return (
    <>
      <Ground color="#6a8f57" mood={mood} size={600} />
      {/* rolling ground beyond the campus */}
      {[[80, -70, 46], [-95, -40, 60], [-60, 90, 50], [100, 70, 55]].map(([x, z, s], i) => (
        <S key={i} p={[x, -s * 0.9, z]} r={s} c={dim('#5e8550', g)} detail={3} rough={1} cast={false} />
      ))}
      {/* courtyard: lawn, a loop path, a pond and an orchard */}
      {flat(0, r - 0.8, -0.015, dim('#6fa05a', g), { rough: 1 })}
      {flat(r - 5, r - 4, -0.008, dim('#d9cfba', g), { rough: 0.9 })}
      <mesh rotation-x={-Math.PI / 2} position={[2.5, -0.004, -1.5]}>
        <circleGeometry args={[3.4, 48]} />
        <meshStandardMaterial color={dim('#4e8fb5', Math.max(0.5, g))} roughness={0.05} metalness={0.4} />
      </mesh>
      <Trees at={park} />
      {/* a smooth floor under the square tiles, so the ring's edges are not jagged */}
      {flat(r - 0.85, R + 0.85, -0.004, '#9a7a58', { rough: 0.6 })}
      {/* curved glass inside and out, with white fins */}
      {[R + 0.8, r - 0.8].map((rad) => (
        <mesh key={rad} position={[0, 1.75, 0]} material={mat(GLASS, { glass: 0.13 })}>
          <cylinderGeometry args={[rad, rad, 3.5, 128, 1, true]} />
        </mesh>
      ))}
      <primitive object={fins} />
      {/* roof canopy: two slim white rims, the outer one carrying solar panels */}
      {flat(R + 0.6, R + 2.2, 3.56, WHITE, { rough: 0.35 })}
      {flat(R + 0.9, R + 2.0, 3.575, '#1b2a44', { rough: 0.25, metal: 0.6 })}
      {flat(r - 2.1, r - 0.6, 3.56, WHITE, { rough: 0.35 })}
      {flat(R + 2.18, R + 2.24, 3.5, '#fff', { glow: '#ffe2b0' })}
      {/* perimeter road, entrance plaza and sign */}
      {flat(R + 4, R + 6.5, -0.012, dim('#3b3e43', g), { rough: 0.9 })}
      <Patch p={[0, R + 3]} s={[8, 4.4]} c="#d9cfba" mood={mood} />
      <group position={[0, 0, R + 7.6]}>
        <B p={[0, 0.7, 0]} s={[6, 1.4, 0.5]} c={WHITE} r={0.04} rough={0.35} />
        <Sign p={[0, 0.72, 0.26]} size={[5, 1]} name={company} logo={logo} glow={0.2 + 0.4 * glow} />
      </group>
      {Array.from({ length: 10 }, (_, i) => {
        const a = 1.0 + i * 0.12
        return <Car key={i} p={[Math.cos(a) * (R + 8.6), 0, Math.sin(a) * (R + 8.6)]} rotY={-a} color={['#3d5a80', '#d8d8dc', '#1f2226', '#b23b3b', '#e9e4da'][i % 5]} />
      })}
      <Trees at={outside} />
    </>
  )
}

function Factory({ w, h, mood, company, logo }: ShellProps) {
  const glow = MOODS[mood].glow
  return (
    <>
      <Ground color="#4a4d52" mood={mood} />
      <Patch p={[0, h / 2 + 14]} s={[w + 40, 26]} c="#3a3d42" mood={mood} />
      <Wall side="back" w={w} h={h} color="#6f8496" windows={Math.floor(w / 2.5)} sill={3.3} winH={0.9} glow={glow} height={5} rough={0.6} />
      <Wall side="left" w={w} h={h} color="#687c8d" windows={Math.floor(h / 2.5)} sill={3.3} winH={0.9} glow={glow} height={5} rough={0.6} />
      {/* corrugation: thin vertical ribs along both walls */}
      {Array.from({ length: Math.floor(w) }, (_, i) => (
        <B key={`b${i}`} p={[-w / 2 + i + 0.5, 1.6, -h / 2 + 0.01]} s={[0.05, 3.2, 0.03]} c="#5d7181" r={0} cast={false} />
      ))}
      {Array.from({ length: Math.floor(h) }, (_, i) => (
        <B key={`l${i}`} p={[-w / 2 + 0.01, 1.6, -h / 2 + i + 0.5]} s={[0.03, 3.2, 0.05]} c="#586c7c" r={0} cast={false} />
      ))}
      <Kerbs w={w} h={h} color="#c9a227" />
      {/* roof trusses, kept slim so the floor stays visible */}
      {Array.from({ length: Math.floor(w / 6) + 1 }, (_, i) => {
        const x = -w / 2 + 0.3 + (i * (w - 0.6)) / Math.max(1, Math.floor(w / 6))
        return (
          <group key={i}>
            <B p={[x, 4.8, 0]} s={[0.12, 0.18, h]} c="#3a4550" r={0} metal={0.6} rough={0.5} cast={false} />
            <B p={[x, 2.5, -h / 2 + 0.25]} s={[0.22, 5, 0.22]} c="#3a4550" r={0} metal={0.6} rough={0.5} />
            {[-h / 3, 0, h / 3].map((z) => (
              <group key={z}>
                <C p={[x, 4.5, z]} r={[0.2, 0.34]} h={0.25} c="#22272d" seg={16} cast={false} />
                <C p={[x, 4.37, z]} r={[0.3, 0.3]} h={0.02} c="#fff" glow="#f4f8ff" glowPower={1.6 * glow} seg={16} cast={false} />
              </group>
            ))}
          </group>
        )
      })}
      <group position={[w / 2 - 3, 0, -h / 2 - 0.2]}>
        <Sign p={[0, 4.2, 0.36]} size={[4.6, 1]} name={company} logo={logo} glow={0.3 + 0.4 * glow} />
      </group>
      {/* yard: trucks, containers and silos */}
      <Truck p={[-w / 2 + 4, 0, h / 2 + 9]} rotY={Math.PI} color="#d9dcdf" />
      <Truck p={[-w / 2 + 9, 0, h / 2 + 11]} rotY={Math.PI} color="#2f5a8f" />
      {[['#b23b3b', 0, 0], ['#2f6f8f', 0, 2.7], ['#d17a2f', 2.8, 0], ['#3f7d4d', 0, 0, 2.7]].map(([c, dx, dz, dy], i) => (
        <B key={i} p={[w / 2 + 5 + (dx as number), 1.3 + ((dy as number) ?? 0), h / 2 + 8 + (dz as number)]} s={[2.5, 2.6, 6]} c={c as string} r={0.03} rough={0.6} rot={[0, Math.PI / 2, 0]} />
      ))}
      {[0, 3.4].map((dx) => (
        <group key={dx} position={[-w / 2 - 5 - dx, 0, -h / 2 + 4]}>
          <C p={[0, 4, 0]} r={[1.5, 1.5]} h={8} c="#c4c8cc" seg={24} metal={0.5} rough={0.4} />
          <C p={[0, 8.6, 0]} r={[0.2, 1.5]} h={1.2} c="#b4b8bc" seg={24} metal={0.5} rough={0.4} />
        </group>
      ))}
      {[-14, 0, 14].map((x) => (
        <Lamp key={x} p={[x, 0, h / 2 + 3]} glow={2 * glow} />
      ))}
    </>
  )
}

function Mall({ w, h, mood, company, logo }: ShellProps) {
  const glow = MOODS[mood].glow
  return (
    <>
      <Ground color="#d6d1c8" mood={mood === 'night' ? 'dusk' : 'day'} />
      <Wall side="back" w={w} h={h} color="#f1efea" glow={glow} height={3.6} rough={0.6} />
      <Wall side="left" w={w} h={h} color="#eceae5" glow={glow} height={3.6} rough={0.6} />
      <B p={[0, 3.4, -h / 2 + 0.08]} s={[w, 0.05, 0.05]} c="#fff" r={0} glow="#fff1d6" glowPower={1.6 * glow} cast={false} />
      <B p={[-w / 2 + 0.08, 3.4, 0]} s={[0.05, 0.05, h]} c="#fff" r={0} glow="#fff1d6" glowPower={1.6 * glow} cast={false} />
      {/* shopfront header with the sign */}
      {[-w / 2, w / 2].map((x) => (
        <B key={x} p={[x, 1.8, h / 2 + 0.05]} s={[0.25, 3.6, 0.25]} c="#17191c" r={0} />
      ))}
      <B p={[0, 3.2, h / 2 + 0.05]} s={[w + 0.25, 0.8, 0.3]} c="#17191c" r={0} />
      <Sign p={[0, 3.2, h / 2 + 0.21]} size={[Math.min(w * 0.6, 4.5), 0.6]} name={company} logo={logo} glow={0.8 + 0.4 * glow} />
      <B p={[w / 2 + 0.05, 0.06, 0]} s={[0.1, 0.12, h]} c="#17191c" r={0} />
      {/* the mall concourse and the shops across it */}
      <Patch p={[0, h / 2 + 5]} s={[60, 10]} c="#e6e1d8" mood="day" glossy />
      {[-18, -6, 6, 18].map((x, i) => (
        <group key={x} position={[x, 0, h / 2 + 12]}>
          <B p={[0, 2.2, 0]} s={[11, 4.4, 2]} c={['#22262b', '#e9e4da', '#3b4a5a', '#5a3b3b'][i]} r={0} rough={0.6} />
          <B p={[0, 1.5, -1.02]} s={[9, 2.6, 0.02]} c="#fff4dc" r={0} glow={['#ffd9a0', '#a8d0ff', '#ffc4d6', '#c8ffd9'][i]} glowPower={0.7} cast={false} />
        </group>
      ))}
      {[-9, 9].map((x) => (
        <group key={x} position={[x, 0, h / 2 + 5]}>
          <B p={[0, 0.25, 0]} s={[2.4, 0.5, 0.9]} c="#b9b1a3" r={0.04} rough={0.6} />
          <S p={[0, 1.0, 0]} r={0.6} c="#3f7d4d" rough={0.95} flat />
        </group>
      ))}
    </>
  )
}

function Street({ w, h, mood, company, logo }: ShellProps) {
  const glow = MOODS[mood].glow
  const trees = useMemo<[number, number, number][]>(() => [-14, -5, 5, 14].map((x) => [x, h / 2 + 4.5, 2.2]), [h])
  return (
    <>
      <Ground color="#55585d" mood={mood} />
      <Patch p={[0, h / 2 + 4]} s={[90, 7]} c="#b9b4aa" mood={mood} />
      <Patch p={[0, h / 2 + 11.5]} s={[90, 8]} c="#2f3237" mood={mood} />
      <Wall side="back" w={w} h={h} color="#d9d3c7" glow={glow} height={4} rough={0.8} />
      <Wall side="left" w={w} h={h} color="#d2ccc0" glow={glow} height={4} rough={0.8} />
      {/* glass storefront with a door gap in the middle */}
      <Glazing from={[-w / 2, h / 2]} to={[-1, h / 2]} height={3} frame="#17191c" />
      <Glazing from={[1, h / 2]} to={[w / 2, h / 2]} height={3} frame="#17191c" />
      <B p={[0, 3.5, h / 2]} s={[w + 0.3, 1, 0.35]} c="#17191c" r={0} />
      <Sign p={[0, 3.5, h / 2 + 0.19]} size={[Math.min(w * 0.6, 5), 0.7]} name={company} logo={logo} glow={0.8 + 0.4 * glow} />
      <B p={[w / 2 + 0.05, 0.06, 0]} s={[0.1, 0.12, h]} c="#17191c" r={0} />
      {/* the neighbours */}
      {[-1, 1].map((sx) => (
        <B key={sx} p={[sx * (w / 2 + 6.2), 4.5, -1]} s={[12, 9, h + 2]} c={sx < 0 ? '#8a6a55' : '#6f7882'} r={0} rough={0.9} />
      ))}
      <Skyline around={38} count={22} minH={10} maxH={30} glow={glow} seed={5} />
      {[-10, 10].map((x) => (
        <Lamp key={x} p={[x, 0, h / 2 + 6.8]} glow={2 * glow} />
      ))}
      <Trees at={trees} />
      <Car p={[-7, 0, h / 2 + 10]} rotY={Math.PI / 2} color="#e2b93b" />
      <Car p={[8, 0, h / 2 + 13]} rotY={-Math.PI / 2} color="#3d5a80" />
    </>
  )
}

/** A freestanding glass cube on a plaza. */
function Cube({ w, h, mood, company, logo }: ShellProps) {
  const glow = MOODS[mood].glow
  const top = 6
  const trees = useMemo<[number, number, number][]>(() => {
    const out: [number, number, number][] = []
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) for (const row of [0, 1]) out.push([sx * (w / 2 + 6 + row * 4.5), -h / 2 + i * 5 - 2, 2.4])
    return out
  }, [w, h])
  const corners: [number, number][] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
  return (
    <>
      <Ground color="#bdb8ae" mood={mood} />
      {/* plaza paving joints and two long pools */}
      {Array.from({ length: 9 }, (_, i) => (
        <Patch key={i} p={[0, -h / 2 - 16 + i * 6]} s={[90, 0.08]} c="#8e897f" mood={mood} />
      ))}
      {[-1, 1].map((sx) => (
        <Patch key={sx} p={[sx * (w / 2 + 3), 0]} s={[2.2, h + 6]} c="#4e8fb5" mood={mood} glossy />
      ))}
      {corners.map((c, i) => (
        <Glazing key={i} from={c} to={corners[(i + 1) % 4]} height={top} frame="#c9cdd2" />
      ))}
      <B p={[0, top + 0.02, 0]} s={[w + 0.1, 0.04, h + 0.1]} c={GLASS} glass={0.08} r={0} cast={false} />
      {Array.from({ length: Math.floor(w / 4) + 1 }, (_, i) => (
        <B key={i} p={[-w / 2 + (i * w) / Math.floor(w / 4), top, 0]} s={[0.06, 0.1, h]} c="#c9cdd2" r={0} metal={0.6} rough={0.3} cast={false} />
      ))}
      {/* the logo floats high in the cube */}
      <Sign p={[0, top - 1.6, 0]} size={[Math.min(w * 0.4, 4), 1.4]} name={company} logo={logo} glow={1 + 0.5 * glow} />
      <Sign p={[0, top - 1.6, 0]} rotY={Math.PI} size={[Math.min(w * 0.4, 4), 1.4]} name={company} logo={logo} glow={1 + 0.5 * glow} />
      <Skyline around={60} count={40} minH={14} maxH={50} glow={glow} seed={14} />
      <Trees at={trees} />
      {[-1, 1].map((sx) => [-1, 1].map((sz) => <Lamp key={`${sx}${sz}`} p={[sx * (w / 2 + 9), 0, sz * (h / 2 + 5)]} glow={2 * glow} />))}
    </>
  )
}

export function Shell(props: ShellProps) {
  switch (props.shell) {
    case 'garage':
      return <Garage {...props} />
    case 'loft':
      return <Loft {...props} />
    case 'tower':
      return <Tower {...props} />
    case 'hq':
      return <Hq {...props} />
    case 'ring':
      return <Ring {...props} />
    case 'factory':
      return <Factory {...props} />
    case 'mall':
      return <Mall {...props} />
    case 'street':
      return <Street {...props} />
    case 'cube':
      return <Cube {...props} />
  }
  return <Ground color="#444" mood={props.mood} />
}

