// Building blocks for site models. Geometry and materials are cached and
// shared, so a floor with hundreds of desks stays cheap to draw.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Employee } from '../../sim/types'

type V3 = [number, number, number]

const geos = new Map<string, THREE.BufferGeometry>()
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geos.get(key)
  if (!g) geos.set(key, (g = make()))
  return g as T
}
export const boxGeo = (w: number, h: number, d: number, r: number) =>
  cached(`b${w},${h},${d},${r}`, () => (r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d)))
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
  const key = `${color}|${look.rough ?? 0.7}|${look.metal ?? 0}|${look.glow ?? ''}|${look.glowPower ?? 1}|${look.glass ?? 1}|${look.flat ? 1 : 0}`
  let m = mats.get(key)
  if (!m) {
    m =
      look.glass !== undefined
        ? new THREE.MeshPhysicalMaterial({ color, roughness: look.rough ?? 0.05, metalness: 0, transparent: true, opacity: look.glass, side: THREE.DoubleSide, depthWrite: false })
        : new THREE.MeshStandardMaterial({ color, roughness: look.rough ?? 0.7, metalness: look.metal ?? 0, emissive: look.glow ?? '#000000', emissiveIntensity: look.glow ? (look.glowPower ?? 1) : 0, flatShading: !!look.flat })
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
export function C({ p, r, h, c, seg = 20, rot, cast = true, ...look }: PartProps & { r: [number, number]; h: number; seg?: number }) {
  return <mesh position={p} rotation={rot} geometry={cylGeo(r[0], r[1], h, seg)} material={mat(c, look)} castShadow={cast} receiveShadow />
}

/** A faceted ball, used for foliage and ornaments. */
export function S({ p, r, c, detail = 1, cast = true, scale, ...look }: PartProps & { r: number; detail?: number; scale?: V3 }) {
  return <mesh position={p} scale={scale} geometry={sphereGeo(r, detail)} material={mat(c, look)} castShadow={cast} receiveShadow />
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

// ---------------------------------------------------------------- people

const SKIN = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#6b4423']
const HAIR = ['#1c1612', '#3b2a1e', '#6b4a2e', '#c9a46a', '#101010', '#7a2f1e']
const TROUSERS = ['#2b3140', '#3a3f47', '#4b4237', '#252a33']

export interface PersonLook {
  look: number
  /** Shirt colour. */
  color: string
}
export const lookOf = (e: Employee, color: string): PersonLook => ({ look: e.look, color })

/**
 * A stylised person. pose 'sit' fits an office chair; 'stand' is upright.
 * busy people sway a little so the room feels alive.
 */
export function Person({ who, pose = 'sit', busy = true, p = [0, 0, 0], rotY = 0 }: { who: PersonLook; pose?: 'sit' | 'stand'; busy?: boolean; p?: V3; rotY?: number }) {
  const ref = useRef<THREE.Group>(null)
  const phase = useMemo(() => (who.look % 97) / 9, [who.look])
  useFrame(({ clock }) => {
    if (!ref.current || !busy) return
    const t = clock.elapsedTime * (pose === 'sit' ? 1.6 : 0.8) + phase
    ref.current.rotation.y = Math.sin(t * 0.37) * 0.12
    ref.current.position.y = Math.sin(t) * 0.006
  })
  const skin = SKIN[who.look % SKIN.length]
  const hair = HAIR[(who.look >> 3) % HAIR.length]
  const legs = TROUSERS[(who.look >> 5) % TROUSERS.length]
  const longHair = (who.look >> 7) % 3 === 0
  const sit = pose === 'sit'
  const hip = sit ? 0.44 : 0.84
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <group ref={ref}>
        {/* legs */}
        {sit ? (
          <>
            <B p={[-0.07, hip - 0.02, -0.13]} s={[0.1, 0.1, 0.34]} c={legs} r={0.04} />
            <B p={[0.07, hip - 0.02, -0.13]} s={[0.1, 0.1, 0.34]} c={legs} r={0.04} />
            <B p={[-0.07, hip - 0.22, -0.27]} s={[0.09, 0.4, 0.09]} c={legs} r={0.035} />
            <B p={[0.07, hip - 0.22, -0.27]} s={[0.09, 0.4, 0.09]} c={legs} r={0.035} />
          </>
        ) : (
          <>
            <B p={[-0.07, hip / 2, 0]} s={[0.1, hip, 0.11]} c={legs} r={0.04} />
            <B p={[0.07, hip / 2, 0]} s={[0.1, hip, 0.11]} c={legs} r={0.04} />
          </>
        )}
        {/* torso, arms reaching forward when seated at a desk */}
        <B p={[0, hip + 0.25, 0]} s={[0.3, 0.46, 0.17]} c={who.color} r={0.07} rough={0.9} />
        <B p={[-0.18, hip + (sit ? 0.24 : 0.2), sit ? -0.1 : 0]} s={[0.075, sit ? 0.2 : 0.42, sit ? 0.3 : 0.085]} c={who.color} r={0.035} rough={0.9} cast={false} />
        <B p={[0.18, hip + (sit ? 0.24 : 0.2), sit ? -0.1 : 0]} s={[0.075, sit ? 0.2 : 0.42, sit ? 0.3 : 0.085]} c={who.color} r={0.035} rough={0.9} cast={false} />
        {/* head */}
        <C p={[0, hip + 0.51, 0]} r={[0.04, 0.045]} h={0.06} c={skin} seg={10} cast={false} />
        <S p={[0, hip + 0.63, 0]} r={0.1} c={skin} detail={2} rough={0.75} />
        <S p={[0, hip + 0.665, 0.012]} r={0.104} c={hair} detail={2} rough={0.95} scale={[1, 0.82, 1]} cast={false} />
        {longHair && <B p={[0, hip + 0.56, 0.075]} s={[0.17, 0.2, 0.06]} c={hair} r={0.03} rough={0.95} cast={false} />}
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- trees

/** Many trees drawn as three instanced meshes. Each tree is [x, z, size]. */
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

/** Deterministic pseudo-random number in [0, 1) from an integer. */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
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

/** A lit sign showing the company's logo image, or its name if there is none. */
export function Sign({ p, size, name, logo, rotY = 0, glow = 0.9 }: { p: V3; size: [number, number]; name: string; logo?: string; rotY?: number; glow?: number }) {
  const material = useMemo(() => {
    const map = logo ? imageTex(logo) : textTexture(name.toUpperCase())
    return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: glow, transparent: true, roughness: 0.4 })
  }, [name, logo, glow])
  const w = logo ? Math.min(size[0], size[1]) : size[0]
  const h = logo ? Math.min(size[0], size[1]) : size[0] / 4
  return (
    <mesh position={p} rotation={[0, rotY, 0]} material={material}>
      <planeGeometry args={[w, Math.min(h, size[1])]} />
    </mesh>
  )
}
