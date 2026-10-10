// Physically based materials for device bodies and parts.
import * as THREE from 'three'

type Params = THREE.MeshPhysicalMaterialParameters

const FRAME: Record<string, Params> = {
  plastic: { metalness: 0, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 },
  aluminium: { metalness: 0.9, roughness: 0.25, anisotropy: 0.5 },
  steel: { metalness: 1, roughness: 0.07 },
  titanium: { metalness: 0.9, roughness: 0.3, anisotropy: 0.7 },
  liquidmetal: { metalness: 1, roughness: 0.14, clearcoat: 0.6, clearcoatRoughness: 0.05 },
  graphene: { metalness: 0.45, roughness: 0.5, sheen: 0.6, sheenRoughness: 0.4 },
}

const BACK: Record<string, Params> = {
  plastic: { metalness: 0, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25 },
  aluminium: { metalness: 0.9, roughness: 0.25, anisotropy: 0.5 },
  glass: { metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.52, reflectivity: 0.6 },
  ceramic: { metalness: 0.05, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, reflectivity: 0.7 },
  sapphire: { metalness: 0, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0, ior: 1.77, reflectivity: 0.9 },
  graphene: { metalness: 0.45, roughness: 0.5, sheen: 0.6, sheenRoughness: 0.4 },
}

export function frameMaterial(mat: string, color: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, ...(FRAME[mat] ?? FRAME.aluminium) })
}

export function backMaterial(mat: string, color: string, finish: 'gloss' | 'matte'): THREE.MeshPhysicalMaterial {
  const p = { ...(BACK[mat] ?? BACK.glass) }
  if (finish === 'matte') {
    // frosted / bead-blasted variant of the same material
    p.roughness = Math.max(p.roughness ?? 0.3, mat === 'aluminium' ? 0.45 : 0.55)
    p.clearcoat = (p.clearcoat ?? 0) * 0.15
    p.sheen = 0.4
    p.sheenRoughness = 0.5
  }
  return new THREE.MeshPhysicalMaterial({ color, ...p })
}

export const blackGlass = () => new THREE.MeshPhysicalMaterial({ color: '#040506', metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, reflectivity: 0.7 })

export const lensGlass = () =>
  new THREE.MeshPhysicalMaterial({ color: '#05070c', metalness: 0.2, roughness: 0, clearcoat: 1, clearcoatRoughness: 0, reflectivity: 1, ior: 1.9, iridescence: 0.6, iridescenceIOR: 1.6 })

export const lensCore = () => new THREE.MeshPhysicalMaterial({ color: '#0b1630', metalness: 0.6, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0, iridescence: 1, iridescenceIOR: 1.8 })

export const darkMatte = () => new THREE.MeshPhysicalMaterial({ color: '#050505', metalness: 0.1, roughness: 0.8 })

export const flashMaterial = () => new THREE.MeshPhysicalMaterial({ color: '#f4ecd0', emissive: '#ffe9b0', emissiveIntensity: 0.25, roughness: 0.25, clearcoat: 1 })
