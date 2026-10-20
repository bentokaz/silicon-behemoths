// Physically based materials for device bodies and parts.
import * as THREE from 'three'

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

export function frameMaterial(mat: string, color: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, ...colourTrue(FRAME[mat] ?? FRAME.aluminium, color) })
}

export function backMaterial(mat: string, color: string, finish: 'gloss' | 'matte'): THREE.MeshPhysicalMaterial {
  const p = { ...(BACK[mat] ?? FRAME[mat] ?? BACK.glass) }
  if (finish === 'matte') {
    // frosted / bead-blasted variant of the same material
    p.roughness = Math.max(p.roughness ?? 0.3, mat === 'aluminium' ? 0.45 : 0.55)
    p.clearcoat = (p.clearcoat ?? 0) * 0.15
    p.sheen = 0.4
    p.sheenRoughness = 0.5
  }
  return new THREE.MeshPhysicalMaterial({ color, ...colourTrue(p, color) })
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
