// Physically based materials for device bodies and parts.
import * as THREE from 'three'
import type { Body } from '../sim/types'

type Params = THREE.MeshPhysicalMaterialParameters

const FRAME: Record<string, Params> = {
  plastic: { metalness: 0, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 },
  aluminium: { metalness: 0.85, roughness: 0.42, anisotropy: 0.4 },
  steel: { metalness: 1, roughness: 0.22 },
  titanium: { metalness: 0.85, roughness: 0.46, anisotropy: 0.6 },
  liquidmetal: { metalness: 1, roughness: 0.26, clearcoat: 0.3, clearcoatRoughness: 0.15 },
  graphene: { metalness: 0.45, roughness: 0.5, sheen: 0.6, sheenRoughness: 0.4 },
  wood: { metalness: 0, roughness: 0.7, clearcoat: 0.12, clearcoatRoughness: 0.6 },
}

const BACK: Record<string, Params> = {
  plastic: { metalness: 0, roughness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.4 },
  aluminium: { metalness: 0.85, roughness: 0.42, anisotropy: 0.4 },
  glass: { metalness: 0, roughness: 0.16, clearcoat: 0.6, clearcoatRoughness: 0.12, ior: 1.52, reflectivity: 0.4 },
  ceramic: { metalness: 0.05, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.14, reflectivity: 0.5 },
  sapphire: { metalness: 0, roughness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.06, ior: 1.77, reflectivity: 0.6 },
  graphene: { metalness: 0.45, roughness: 0.5, sheen: 0.6, sheenRoughness: 0.4 },
  wood: { metalness: 0, roughness: 0.7, clearcoat: 0.12, clearcoatRoughness: 0.6 },
}

/** Linear luminance of a CSS colour, 0 (black) to 1 (white). */
export function linearLuminance(color: string): number {
  const c = new THREE.Color(color)
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
}

/**
 * Keeps a finish true to its colour under the studio's bright soft boxes. A metal's reflection is tinted by its own
 * colour, but at a glancing angle every surface mirrors white; on a near-black metal that white sheen was all that
 * showed, so a black aluminium deck facing the lights came out mid-grey. Real dark finishes are coatings (anodising,
 * PVD, DLC) over the metal: a dyed, slightly dielectric skin. So the darker the colour, the less metal and the weaker
 * the white sheen and the mirrored surroundings; pale and mid colours are left as they were. Very low roughness is
 * floored too: a pin-sharp reflection of a soft box turns into a white sliver that flickers as the model turns.
 */
export function colourTrue(p: Params, color: string): Params {
  const metal = p.metalness ?? 0
  const out: Params = { ...p, roughness: Math.max(p.roughness ?? 0.5, metal > 0.5 ? 0.2 : 0.08) }
  // 0 for black, 1 from a mid grey (linear 0.12, about #606060) up
  const t = Math.min(1, Math.sqrt(linearLuminance(color) / 0.12))
  if (t >= 1) return out
  // glossy black glass or ceramic is meant to mirror the room, so a dielectric keeps its sheen; only metals are tamed
  const k = Math.min(1, metal / 0.6) * (1 - t)
  out.metalness = metal * (1 - 0.6 * (1 - t))
  out.specularIntensity = 1 - 0.6 * k
  out.envMapIntensity = 1 - 0.55 * k
  if (out.clearcoat) out.clearcoat *= 1 - 0.45 * k
  if (out.sheen) out.sheen *= 1 - 0.65 * k
  return out
}

let woodTex: THREE.CanvasTexture | null = null
/** Light, neutral wood: growth rings, fine grain and pores, so a colour multiplied over it reads as stained timber. */
function woodTexture(): THREE.CanvasTexture {
  if (woodTex) return woodTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#e6e6e6'
  g.fillRect(0, 0, S, S)
  // wavy ring bands running along x, tileable in both directions
  for (let y = 0; y < S; y++) {
    const ring = Math.sin((y / S) * Math.PI * 2 * 7 + Math.sin((y / S) * Math.PI * 2 * 3) * 1.6)
    const v = 200 + ring * 26
    g.fillStyle = `rgb(${v},${v},${v})`
    g.fillRect(0, y, S, 1)
  }
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 420; i++) {
    const y = rnd() * S
    const x = rnd() * S
    const l = 30 + rnd() * 120
    const dark = rnd() < 0.7
    g.strokeStyle = dark ? `rgba(70,70,70,${0.08 + rnd() * 0.18})` : `rgba(255,255,255,${0.1 + rnd() * 0.2})`
    g.lineWidth = 0.5 + rnd() * 0.9
    const dy = (rnd() - 0.5) * 2
    for (const dx of [0, -S]) {
      g.beginPath()
      g.moveTo(x + dx, y)
      g.lineTo(x + dx + l, y + dy)
      g.stroke()
    }
  }
  for (let i = 0; i < 160; i++) {
    g.fillStyle = 'rgba(60,60,60,0.25)'
    g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 5, 0.8)
  }
  woodTex = new THREE.CanvasTexture(c)
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping
  woodTex.colorSpace = THREE.SRGBColorSpace
  woodTex.anisotropy = 8
  return woodTex
}

type CamoKind = NonNullable<Body['camo']>
const CAMO: Record<CamoKind, string[]> = {
  woodland: ['#4b5a2e', '#2c3a1d', '#6b5a35', '#161b10'],
  desert: ['#c8a870', '#a98756', '#8a6b43', '#d9c394'],
  urban: ['#8a8d90', '#5c6064', '#3a3d41', '#b4b6b8'],
  arctic: ['#f0f3f5', '#c9d0d6', '#9ba5ae', '#e1e6ea'],
}
const camoTex = new Map<string, THREE.CanvasTexture>()
/** Irregular overlapping blotches in four tones, tileable. */
function camoTexture(kind: CamoKind): THREE.CanvasTexture {
  const hit = camoTex.get(kind)
  if (hit) return hit
  const S = 256
  const cols = CAMO[kind] ?? CAMO.woodland
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = cols[0]
  g.fillRect(0, 0, S, S)
  let seed = 11 + kind.length
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let layer = 1; layer < cols.length; layer++) {
    g.fillStyle = cols[layer]
    for (let i = 0; i < 22; i++) {
      const x = rnd() * S
      const y = rnd() * S
      const r = 14 + rnd() * 30
      const jit = Array.from({ length: 10 }, () => rnd() * 0.15)
      for (const dx of [0, -S, S]) {
        for (const dy of [0, -S, S]) {
          g.beginPath()
          if (kind === 'urban') g.rect(x + dx - r, y + dy - r * 0.6, r * 2, r * 1.2)
          else {
            for (let k = 0; k <= 9; k++) {
              const a = (k / 9) * Math.PI * 2
              const rr = r * (0.55 + 0.6 * Math.sin(a * 3 + i) * Math.cos(a * 2 + layer) + jit[k])
              const px = x + dx + Math.cos(a) * rr * 1.3
              const py = y + dy + Math.sin(a) * rr * 0.8
              if (k === 0) g.moveTo(px, py)
              else g.lineTo(px, py)
            }
          }
          g.fill()
        }
      }
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  camoTex.set(kind, t)
  return t
}

/** Adds the wood grain or camouflage skin to a material that asked for one. */
function skin(m: THREE.MeshPhysicalMaterial, wood: boolean, camo?: CamoKind): THREE.MeshPhysicalMaterial {
  if (camo) {
    m.map = camoTexture(camo)
    m.color.set('#ffffff')
    m.metalness = Math.min(m.metalness, 0.1)
    m.roughness = Math.max(m.roughness, 0.7)
    m.clearcoat = 0
  } else if (wood) {
    m.map = woodTexture()
    m.roughness = 0.62
  }
  return m
}

export function frameMaterial(mat: string, color: string, camo?: CamoKind): THREE.MeshPhysicalMaterial {
  return skin(new THREE.MeshPhysicalMaterial({ color, ...colourTrue(FRAME[mat] ?? FRAME.aluminium, color) }), mat === 'wood', camo)
}

export function backMaterial(mat: string, color: string, finish: 'gloss' | 'matte', camo?: CamoKind): THREE.MeshPhysicalMaterial {
  const p = { ...(BACK[mat] ?? FRAME[mat] ?? BACK.glass) }
  if (finish === 'matte') {
    // frosted / bead-blasted variant of the same material
    p.roughness = Math.max(p.roughness ?? 0.3, mat === 'aluminium' ? 0.45 : 0.55)
    p.clearcoat = (p.clearcoat ?? 0) * 0.15
    p.sheen = 0.4
    p.sheenRoughness = 0.5
  }
  return skin(new THREE.MeshPhysicalMaterial({ color, ...colourTrue(p, color) }), mat === 'wood', camo)
}

export const blackGlass = () => new THREE.MeshPhysicalMaterial({ color: '#040506', metalness: 0, roughness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.08, reflectivity: 0.5 })

export const lensGlass = () =>
  new THREE.MeshPhysicalMaterial({ color: '#05070c', metalness: 0.2, roughness: 0, clearcoat: 1, clearcoatRoughness: 0, reflectivity: 1, ior: 1.9, iridescence: 0.6, iridescenceIOR: 1.6 })

export const lensCore = () => new THREE.MeshPhysicalMaterial({ color: '#0b1630', metalness: 0.6, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0, iridescence: 1, iridescenceIOR: 1.8 })

export const darkMatte = () => new THREE.MeshPhysicalMaterial({ color: '#050505', metalness: 0.1, roughness: 0.8 })

export const flashMaterial = () => new THREE.MeshPhysicalMaterial({ color: '#f4ecd0', emissive: '#ffe9b0', emissiveIntensity: 0.25, roughness: 0.25, clearcoat: 1 })

/** Moulded dark plastic: rear panels, the inside of an earbud case. */
export const darkPlastic = () => new THREE.MeshPhysicalMaterial({ color: '#15161a', metalness: 0, roughness: 0.62 })

/** Rubber feet and soft ear tips. */
export const rubber = (color = '#0c0c0d') => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.9, sheen: 0.3, sheenRoughness: 0.7 })

/** Contacts and pins inside sockets. */
export const contactMetal = () => new THREE.MeshPhysicalMaterial({ color: '#c8b27a', metalness: 1, roughness: 0.35 })

let weave: THREE.CanvasTexture | null = null
/** One repeat of a plain weave, as shades of grey: bright threads, dark gaps between them. */
function weaveTexture(): THREE.CanvasTexture {
  if (weave) return weave
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#8c8c8c'
  g.fillRect(0, 0, 64, 64)
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      // each thread passes over one and under the next
      const over = (x + y) % 2 === 0
      g.fillStyle = over ? '#f2f2f2' : '#b4b4b4'
      g.fillRect(x * 8 + (over ? 0 : 1), y * 8 + (over ? 1 : 0), over ? 8 : 6, over ? 6 : 8)
      g.fillStyle = '#4a4a4a'
      g.fillRect(x * 8 + 7, y * 8 + 7, 2, 2)
    }
  }
  weave = new THREE.CanvasTexture(c)
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping
  weave.anisotropy = 8
  return weave
}
/** Edge of one repeat of the weave, mm. Geometry wrapped in fabric gives its UVs in these. */
export const WEAVE = 5.6

/** Knitted acoustic fabric: matt, a little fuzzy at grazing angles, with a weave that shows up close. */
export function fabric(color: string): THREE.MeshPhysicalMaterial {
  const t = weaveTexture()
  return new THREE.MeshPhysicalMaterial({ color, map: t, bumpMap: t, bumpScale: 0.6, metalness: 0, roughness: 0.96, sheen: 0.5, sheenRoughness: 0.7, sheenColor: '#ffffff' })
}

/** A lit indicator or light bar. */
export const lightMaterial = (color: string) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, roughness: 0.35 })
