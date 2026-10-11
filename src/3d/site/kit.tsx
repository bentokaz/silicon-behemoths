// Building blocks for site models. Geometry and materials are cached and
// shared, and whole groups of models are merged into a handful of meshes
// (see Baked), so a campus with thousands of parts stays cheap to draw.
import { useFrame } from '@react-three/fiber'
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type V3 = [number, number, number]

const geos = new Map<string, THREE.BufferGeometry>()
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geos.get(key)
  if (!g) geos.set(key, (g = make()))
  return g as T
}
/** A box. Small radii give a single chamfer, larger ones a rounded edge. */
export const boxGeo = (w: number, h: number, d: number, r: number) =>
  cached(`b${w},${h},${d},${r}`, () => {
    const rr = Math.min(r, w / 2, h / 2, d / 2)
    return rr > 0.004 ? new RoundedBoxGeometry(w, h, d, rr >= 0.05 ? 3 : 1, rr) : new THREE.BoxGeometry(w, h, d)
  })
export const cylGeo = (top: number, bottom: number, h: number, seg: number) => cached(`c${top},${bottom},${h},${seg}`, () => new THREE.CylinderGeometry(top, bottom, h, seg))
export const sphereGeo = (r: number, detail = 1) => cached(`s${r},${detail}`, () => new THREE.IcosahedronGeometry(r, detail))

export interface Look {
  /** Roughness, 0-1. */
  rough?: number
  metal?: number
  /** Emissive colour; the material glows with it. */
  glow?: string
  glowPower?: number
  /** 0-1 opacity for glass. */
  glass?: number
  flat?: boolean
}
const mats = new Map<string, THREE.Material>()
export function mat(color: string, look: Look = {}): THREE.Material {
  const power = look.glow ? Math.round((look.glowPower ?? 1) * 10) / 10 : 0
  const key = `${color}|${look.rough ?? 0.7}|${look.metal ?? 0}|${look.glow ?? ''}|${power}|${look.glass ?? 1}|${look.flat ? 1 : 0}`
  let m = mats.get(key)
  if (!m) {
    m =
      look.glass !== undefined
        ? new THREE.MeshPhysicalMaterial({ color, roughness: look.rough ?? 0.05, metalness: 0, transparent: true, opacity: look.glass, side: THREE.DoubleSide, depthWrite: false })
        : new THREE.MeshStandardMaterial({ color, roughness: look.rough ?? 0.7, metalness: look.metal ?? 0, emissive: look.glow ?? '#000000', emissiveIntensity: power, flatShading: !!look.flat })
    mats.set(key, m)
  }
  return m
}

interface PartProps extends Look {
  p: V3
  c: string
  rot?: V3
  /** Cast a shadow. Small details skip it. */
  cast?: boolean
}

/** A box with softened edges. s = [width, height, depth], r = edge radius. */
export function B({ p, s, c, r = 0.012, rot, cast = true, ...look }: PartProps & { s: V3; r?: number }) {
  return <mesh position={p} rotation={rot} geometry={boxGeo(s[0], s[1], s[2], r)} material={mat(c, look)} castShadow={cast} receiveShadow />
}

/** A cylinder or cone standing on its axis. r = [top radius, bottom radius]. */
export function C({ p, r, h, c, seg = 16, rot, cast = true, ...look }: PartProps & { r: [number, number]; h: number; seg?: number }) {
  return <mesh position={p} rotation={rot} geometry={cylGeo(r[0], r[1], h, seg)} material={mat(c, look)} castShadow={cast} receiveShadow />
}

/** A faceted ball, used for foliage and ornaments. */
export function S({ p, r, c, detail = 1, cast = true, scale, ...look }: PartProps & { r: number; detail?: number; scale?: V3 }) {
  return <mesh position={p} scale={scale} geometry={sphereGeo(r, detail)} material={mat(c, look)} castShadow={cast} receiveShadow />
}

// ---------------------------------------------------------------- baking

const baked = new Map<string, THREE.Material>()
/** One shared material for every part that differs only in colour; the colour moves to the vertices. */
function bakeMaterial(m: THREE.MeshStandardMaterial): { key: string; material: THREE.Material; tint: boolean } {
  if (m.transparent) return { key: m.uuid, material: m, tint: false }
  const key = `${m.roughness}|${m.metalness}|${m.flatShading ? 1 : 0}|${m.emissive.getHex()}|${m.emissiveIntensity}`
  let out = baked.get(key)
  if (!out) {
    out = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: m.roughness, metalness: m.metalness, flatShading: m.flatShading, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity })
    baked.set(key, out)
  }
  return { key, material: out, tint: true }
}

/**
 * Renders its children, then merges every plain mesh among them into one mesh
 * per material and hides the originals. Anything animated or textured must
 * set userData.live (or use a material with a map) to be left alone.
 * `sig` says when the contents have changed and need merging again.
 */
export function Baked({ sig, children }: { sig: string | number; children: ReactNode }) {
  const src = useRef<THREE.Group>(null)
  const [out, setOut] = useState<THREE.Mesh[]>([])
  useLayoutEffect(() => {
    const root = src.current
    if (!root) return
    root.updateWorldMatrix(true, true)
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
    const groups = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean }>()
    const m = new THREE.Matrix4()
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || mesh.userData.live || Array.isArray(mesh.material)) return
      const source = mesh.material as THREE.MeshStandardMaterial
      if (source.map || !('roughness' in source)) return
      const b = bakeMaterial(source)
      const key = b.key + (mesh.castShadow ? 'c' : 'n')
      let g = groups.get(key)
      if (!g) groups.set(key, (g = { material: b.material, geos: [], cast: mesh.castShadow }))
      const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
      for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name)
      geo.applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld))
      if (b.tint) {
        const n = geo.attributes.position.count
        const colors = new Float32Array(n * 3)
        const { r, g: gg, b: bb } = source.color
        for (let i = 0; i < n; i++) {
          colors[i * 3] = r
          colors[i * 3 + 1] = gg
          colors[i * 3 + 2] = bb
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      }
      g.geos.push(geo)
      mesh.visible = false
    })
    const meshes: THREE.Mesh[] = []
    for (const g of groups.values()) {
      const merged = mergeGeometries(g.geos)
      for (const geo of g.geos) geo.dispose()
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, g.material)
      mesh.castShadow = g.cast
      mesh.receiveShadow = true
      meshes.push(mesh)
    }
    setOut(meshes)
    return () => {
      for (const mesh of meshes) mesh.geometry.dispose()
    }
  }, [sig])
  return (
    <>
      <group ref={src}>{children}</group>
      {out.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------- colours

export const WOOD = '#b28d66'
export const WALNUT = '#6a4c38'
export const OAK_PALE = '#d9c3a0'
export const STEEL = '#9aa0a6'
export const DARK = '#1f2226'
export const CHARCOAL = '#2c3036'
export const WHITE = '#eceae6'
export const FABRIC = '#4a5568'
export const LEAF = ['#3f7d4d', '#356b42', '#4a8f58', '#2f5f3a']
export const CAR_PAINT = ['#d8dadd', '#1d2023', '#7a1f24', '#2c4a6e', '#8c9094', '#3e5a48', '#c9c2b2']

// ---------------------------------------------------------------- people

const SKIN = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#6b4423']
const HAIR = ['#1c1612', '#3b2a1e', '#6b4a2e', '#c9a46a', '#101010', '#7a2f1e']
const TROUSERS = ['#2b3140', '#3a3f47', '#4b4237', '#252a33']

export interface PersonLook {
  look: number
  /** Shirt colour. */
  color: string
}

/** A stylised person, standing or sitting on a 0.45 m seat. Does not move, so it can be baked. */
export function Person({ who, pose = 'sit', p = [0, 0, 0], rotY = 0, arms = 'desk' }: { who: PersonLook; pose?: 'sit' | 'stand'; p?: V3; rotY?: number; arms?: 'desk' | 'down' | 'up' }) {
  const skin = SKIN[who.look % SKIN.length]
  const hair = HAIR[(who.look >> 3) % HAIR.length]
  const legs = TROUSERS[(who.look >> 5) % TROUSERS.length]
  const longHair = (who.look >> 7) % 3 === 0
  const sit = pose === 'sit'
  const hip = sit ? 0.5 : 0.86
  const reach = sit && arms === 'desk'
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      {sit ? (
        <>
          <B p={[-0.08, hip, -0.14]} s={[0.12, 0.12, 0.4]} c={legs} r={0.04} />
          <B p={[0.08, hip, -0.14]} s={[0.12, 0.12, 0.4]} c={legs} r={0.04} />
          <B p={[-0.08, hip / 2 - 0.01, -0.3]} s={[0.1, hip - 0.02, 0.1]} c={legs} r={0.035} />
          <B p={[0.08, hip / 2 - 0.01, -0.3]} s={[0.1, hip - 0.02, 0.1]} c={legs} r={0.035} />
          <B p={[-0.08, 0.035, -0.36]} s={[0.1, 0.07, 0.2]} c={DARK} r={0.03} cast={false} />
          <B p={[0.08, 0.035, -0.36]} s={[0.1, 0.07, 0.2]} c={DARK} r={0.03} cast={false} />
        </>
      ) : (
        <>
          <B p={[-0.08, hip / 2 + 0.03, 0]} s={[0.12, hip - 0.06, 0.13]} c={legs} r={0.04} />
          <B p={[0.08, hip / 2 + 0.03, 0]} s={[0.12, hip - 0.06, 0.13]} c={legs} r={0.04} />
          <B p={[-0.08, 0.035, -0.03]} s={[0.11, 0.07, 0.22]} c={DARK} r={0.03} cast={false} />
          <B p={[0.08, 0.035, -0.03]} s={[0.11, 0.07, 0.22]} c={DARK} r={0.03} cast={false} />
        </>
      )}
      <B p={[0, hip + 0.3, 0.01]} s={[0.34, 0.52, 0.2]} c={who.color} r={0.07} rough={0.9} />
      {reach ? (
        <>
          <B p={[-0.2, hip + 0.3, -0.13]} s={[0.085, 0.085, 0.36]} c={who.color} r={0.035} rough={0.9} cast={false} rot={[0.35, 0, 0]} />
          <B p={[0.2, hip + 0.3, -0.13]} s={[0.085, 0.085, 0.36]} c={who.color} r={0.035} rough={0.9} cast={false} rot={[0.35, 0, 0]} />
          <S p={[-0.2, hip + 0.235, -0.31]} r={0.045} c={skin} cast={false} />
          <S p={[0.2, hip + 0.235, -0.31]} r={0.045} c={skin} cast={false} />
        </>
      ) : arms === 'up' ? (
        <>
          <B p={[-0.23, hip + 0.66, 0]} s={[0.085, 0.42, 0.085]} c={who.color} r={0.035} rough={0.9} cast={false} rot={[0, 0, 0.25]} />
          <B p={[0.23, hip + 0.66, 0]} s={[0.085, 0.42, 0.085]} c={who.color} r={0.035} rough={0.9} cast={false} rot={[0, 0, -0.25]} />
          <S p={[-0.285, hip + 0.89, 0]} r={0.045} c={skin} cast={false} />
          <S p={[0.285, hip + 0.89, 0]} r={0.045} c={skin} cast={false} />
        </>
      ) : (
        <>
          <B p={[-0.215, hip + 0.3, 0.01]} s={[0.085, 0.46, 0.09]} c={who.color} r={0.035} rough={0.9} cast={false} />
          <B p={[0.215, hip + 0.3, 0.01]} s={[0.085, 0.46, 0.09]} c={who.color} r={0.035} rough={0.9} cast={false} />
          <S p={[-0.215, hip + 0.04, 0.01]} r={0.045} c={skin} cast={false} />
          <S p={[0.215, hip + 0.04, 0.01]} r={0.045} c={skin} cast={false} />
        </>
      )}
      <C p={[0, hip + 0.585, 0.01]} r={[0.045, 0.05]} h={0.07} c={skin} seg={10} cast={false} />
      <S p={[0, hip + 0.71, 0.005]} r={0.105} c={skin} detail={2} rough={0.75} />
      <S p={[0, hip + 0.745, 0.02]} r={0.11} c={hair} detail={2} rough={0.95} scale={[1, 0.8, 1]} cast={false} />
      {longHair && <B p={[0, hip + 0.64, 0.09]} s={[0.18, 0.22, 0.06]} c={hair} r={0.03} rough={0.95} cast={false} />}
    </group>
  )
}

/** A person who shifts their weight and looks about. Kept out of baking. */
export function LivePerson({ who, p = [0, 0, 0], rotY = 0, arms }: { who: PersonLook; p?: V3; rotY?: number; arms?: 'down' | 'up' }) {
  const ref = useRef<THREE.Group>(null)
  const phase = useMemo(() => (who.look % 97) / 9, [who.look])
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      o.userData.live = true
    })
  })
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * 0.8 + phase
    ref.current.rotation.y = rotY + Math.sin(t * 0.37) * 0.25
  })
  return (
    <group ref={ref} position={p}>
      <Person who={who} pose="stand" arms={arms ?? 'down'} />
    </group>
  )
}

// ---------------------------------------------------------------- shared models

/** A parked car, about 4.4 m long, nose toward +Z. */
export function Car({ seed = 0, p = [0, 0, 0], rotY = 0, glow = 0 }: { seed?: number; p?: V3; rotY?: number; glow?: number }) {
  const paint = CAR_PAINT[seed % CAR_PAINT.length]
  const suv = seed % 3 === 0
  const top = suv ? 1.62 : 1.42
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      {/* body: sills, main shell, bonnet and boot slightly lower than the waist */}
      <B p={[0, 0.34, 0]} s={[1.74, 0.2, 4.1]} c={DARK} r={0.05} rough={0.8} />
      <B p={[0, 0.66, 0]} s={[1.8, 0.5, 4.36]} c={paint} r={0.14} rough={0.35} metal={0.5} />
      {/* cabin: dark glass band with a painted roof on top */}
      <B p={[0, (0.9 + top) / 2 - 0.02, suv ? -0.25 : -0.2]} s={[1.62, top - 0.9, suv ? 2.7 : 2.3]} c="#141a20" r={0.16} rough={0.12} metal={0.6} />
      <B p={[0, top - 0.035, suv ? -0.25 : -0.2]} s={[1.5, 0.07, suv ? 2.4 : 1.9]} c={paint} r={0.03} rough={0.35} metal={0.5} cast={false} />
      {/* wheels sit inside the body sides, tyres proud of the sills */}
      {[-1, 1].map((sx) =>
        [-1.38, 1.38].map((z) => (
          <group key={`${sx}${z}`} position={[sx * 0.8, 0.33, z]} rotation={[0, 0, Math.PI / 2]}>
            <C p={[0, 0, 0]} r={[0.33, 0.33]} h={0.24} c="#15171a" seg={18} rough={0.9} />
            <C p={[0, sx * -0.125, 0]} r={[0.19, 0.19]} h={0.012} c="#b8bcc2" seg={12} metal={0.8} rough={0.35} cast={false} />
          </group>
        )),
      )}
      {/* lights and plates sit just proud of the bumpers */}
      {[-0.6, 0.6].map((x) => (
        <group key={x}>
          <B p={[x, 0.72, 2.165]} s={[0.36, 0.12, 0.04]} c="#f4f6f8" r={0.02} glow="#fff6e0" glowPower={0.25 + glow * 0.5} cast={false} />
          <B p={[x, 0.74, -2.165]} s={[0.36, 0.1, 0.04]} c="#8c1218" r={0.02} glow="#ff2a2a" glowPower={0.2 + glow * 0.4} cast={false} />
        </group>
      ))}
      <B p={[0, 0.5, 2.17]} s={[0.9, 0.14, 0.03]} c="#0e0f11" r={0.01} cast={false} />
      <B p={[0, 0.52, -2.17]} s={[0.5, 0.12, 0.03]} c="#e9e6dc" r={0.01} cast={false} />
      {[-1, 1].map((sx) => (
        <B key={sx} p={[sx * 0.95, 1.0, 0.72]} s={[0.14, 0.09, 0.07]} c={paint} r={0.02} rough={0.35} metal={0.5} cast={false} />
      ))}
    </group>
  )
}

/** An outdoor tree with a full crown, about 5 m tall at scale 1. */
export function Tree({ seed = 0, scale = 1, p = [0, 0, 0] }: { seed?: number; scale?: number; p?: V3 }) {
  const k = scale * (0.85 + hash(seed) * 0.3)
  const spin = hash(seed + 5) * 6
  return (
    <group position={p} rotation={[0, spin, 0]} scale={k}>
      <C p={[0, 1.05, 0]} r={[0.1, 0.17]} h={2.1} c="#5b4636" seg={8} rough={0.95} />
      <S p={[0, 3.25, 0]} r={1.35} c={LEAF[seed % 4]} rough={0.95} flat />
      <S p={[0.75, 2.6, 0.3]} r={0.9} c={LEAF[(seed + 1) % 4]} rough={0.95} flat />
      <S p={[-0.7, 2.75, -0.35]} r={0.95} c={LEAF[(seed + 2) % 4]} rough={0.95} flat />
      <S p={[0.1, 2.5, -0.75]} r={0.8} c={LEAF[(seed + 3) % 4]} rough={0.95} flat />
    </group>
  )
}

/** A potted plant. */
export function Plant({ p = [0, 0, 0] as V3, scale = 1, seed = 0 }) {
  return (
    <group position={p} scale={scale}>
      <C p={[0, 0.16, 0]} r={[0.17, 0.13]} h={0.32} c="#d8d2c6" rough={0.85} />
      <C p={[0, 0.3, 0]} r={[0.15, 0.15]} h={0.03} c="#3b2e25" rough={1} cast={false} />
      {[[0, 0.6, 0, 0.25], [0.13, 0.46, 0.09, 0.18], [-0.13, 0.48, -0.07, 0.19], [0.03, 0.82, -0.04, 0.16], [-0.06, 0.68, 0.12, 0.15]].map(([x, y, z, r], i) => (
        <S key={i} p={[x, y, z]} r={r} c={LEAF[(i + seed) % LEAF.length]} rough={0.95} flat />
      ))}
    </group>
  )
}

/** A swivel office chair, facing -Z (toward a desk). */
export function Chair({ z = 0.24, color = CHARCOAL, rotY = 0, x = 0 }: { z?: number; color?: string; rotY?: number; x?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <C p={[0, 0.03, 0]} r={[0.27, 0.29]} h={0.04} c={DARK} seg={5} metal={0.6} rough={0.4} />
      <C p={[0, 0.235, 0]} r={[0.028, 0.032]} h={0.37} c={STEEL} seg={8} metal={0.9} rough={0.3} cast={false} />
      <B p={[0, 0.455, 0]} s={[0.46, 0.08, 0.44]} c={color} r={0.03} rough={0.95} />
      <B p={[0, 0.56, 0.2]} s={[0.05, 0.2, 0.04]} c={DARK} r={0.01} cast={false} />
      <B p={[0, 0.8, 0.215]} s={[0.44, 0.5, 0.06]} c={color} r={0.03} rough={0.95} rot={[-0.1, 0, 0]} />
      {[-0.245, 0.245].map((ax) => (
        <group key={ax}>
          <B p={[ax, 0.555, 0.03]} s={[0.03, 0.16, 0.03]} c={DARK} r={0.008} cast={false} />
          <B p={[ax, 0.645, 0.03]} s={[0.05, 0.03, 0.26]} c={DARK} r={0.012} cast={false} />
        </group>
      ))}
    </group>
  )
}

/** Deterministic pseudo-random number in [0, 1) from an integer. */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Many trees drawn as instanced meshes, for the land around a plot. Each tree is [x, z, size]. */
export function Trees({ at }: { at: [number, number, number][] }) {
  const meshes = useMemo(() => {
    const trunk = new THREE.InstancedMesh(cylGeo(0.07, 0.11, 1, 7), mat('#5b4636', { rough: 0.95 }), at.length)
    const crownA = new THREE.InstancedMesh(sphereGeo(1, 1), mat(LEAF[0], { rough: 0.95, flat: true }), at.length)
    const crownB = new THREE.InstancedMesh(sphereGeo(1, 1), mat(LEAF[1], { rough: 0.95, flat: true }), at.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    at.forEach(([x, z, size], i) => {
      const h = 1.1 * size
      m.compose(new THREE.Vector3(x, h / 2, z), q, new THREE.Vector3(size, h, size))
      trunk.setMatrixAt(i, m)
      const spin = q.clone().setFromEuler(new THREE.Euler(0, i * 1.7, 0))
      m.compose(new THREE.Vector3(x, h + 0.55 * size, z), spin, new THREE.Vector3(0.85 * size, 0.8 * size, 0.85 * size))
      crownA.setMatrixAt(i, m)
      m.compose(new THREE.Vector3(x + 0.3 * size, h + 0.2 * size, z - 0.2 * size), spin, new THREE.Vector3(0.6 * size, 0.55 * size, 0.6 * size))
      crownB.setMatrixAt(i, m)
    })
    for (const mesh of [trunk, crownA, crownB]) {
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.instanceMatrix.needsUpdate = true
    }
    return [trunk, crownA, crownB]
  }, [at])
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

/** A canvas texture with centred text, for signs and logo walls. */
const textCache = new Map<string, THREE.CanvasTexture>()
export function textTexture(text: string, fg = '#ffffff', bg = 'transparent'): THREE.CanvasTexture {
  const key = `${text}|${fg}|${bg}`
  const hit = textCache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 256
  const g = c.getContext('2d')!
  if (bg !== 'transparent') {
    g.fillStyle = bg
    g.fillRect(0, 0, 1024, 256)
  }
  g.fillStyle = fg
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  let size = 170
  g.font = `600 ${size}px Bahnschrift, "Segoe UI", sans-serif`
  const w = g.measureText(text).width
  if (w > 960) size = (size * 960) / w
  g.font = `600 ${size}px Bahnschrift, "Segoe UI", sans-serif`
  g.fillText(text, 512, 134)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  textCache.set(key, t)
  return t
}

const imgCache = new Map<string, THREE.Texture>()
export function imageTex(url: string): THREE.Texture {
  let t = imgCache.get(url)
  if (!t) {
    t = new THREE.TextureLoader().load(url)
    t.colorSpace = THREE.SRGBColorSpace
    imgCache.set(url, t)
  }
  return t
}

/** A lit sign showing the company's logo image, or its name if there is none. Faces +Z. */
export function Sign({ p, size, name, logo, rotY = 0, glow = 0.9, color = '#ffffff' }: { p: V3; size: [number, number]; name: string; logo?: string; rotY?: number; glow?: number; color?: string }) {
  const material = useMemo(() => {
    const map = logo ? imageTex(logo) : textTexture(name.toUpperCase(), color)
    // polygon offset keeps the sign from flickering against the panel it is mounted on
    return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: glow, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  }, [name, logo, glow, color])
  const w = logo ? Math.min(size[0], size[1]) : size[0]
  const h = logo ? Math.min(size[0], size[1]) : size[0] / 4
  return (
    <mesh position={p} rotation={[0, rotY, 0]} material={material}>
      <planeGeometry args={[w, Math.min(h, size[1])]} />
    </mesh>
  )
}
