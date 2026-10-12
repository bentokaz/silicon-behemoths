// Draws many ready-made meshes as a few. Where Baked (kit.tsx) folds the
// small parts of furniture into one material, this keeps every material as it
// is and joins the meshes that share one: two hundred shops in the city, each
// with its own walls, roof, glass and paving, become one mesh of walls, one
// of roofs and so on, instead of sixteen hundred things to draw.
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { rest, wake } from './kit'

interface Source {
  geo: THREE.BufferGeometry
  at: THREE.Matrix4
}

/** The attributes this knows how to carry across, with what a mesh that lacks one is given. */
const CARRIED: [name: string, size: number, fill: number][] = [
  ['color', 3, 1],
  ['uv', 2, 0],
]

/** One geometry out of many, each moved to where its mesh stands. Triangles only; indices are written out. */
export function joinGeometries(parts: Source[]): THREE.BufferGeometry {
  let count = 0
  for (const p of parts) count += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count
  const P = new Float32Array(count * 3)
  const N = new Float32Array(count * 3)
  // an attribute is carried only if some part has it
  const extra = CARRIED.filter(([name]) => parts.some((p) => p.geo.attributes[name])).map(([name, size, fill]) => ({ name, size, fill, out: new Float32Array(count * size) }))
  const normal = new THREE.Matrix3()
  let o = 0
  for (const part of parts) {
    const pos = part.geo.attributes.position
    const nor = part.geo.attributes.normal
    const index = part.geo.index
    const n = index ? index.count : pos.count
    const e = part.at.elements
    const ne = normal.getNormalMatrix(part.at).elements
    // a mirrored mesh has its triangles wound the other way, to keep facing out
    const flip = part.at.determinant() < 0
    for (let i = 0; i < n; i++) {
      const k = flip ? i - (i % 3) + [0, 2, 1][i % 3] : i
      const v = index ? index.getX(k) : k
      const x = pos.getX(v)
      const y = pos.getY(v)
      const z = pos.getZ(v)
      P[o * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]
      P[o * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
      P[o * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
      if (nor) {
        const nx = nor.getX(v)
        const ny = nor.getY(v)
        const nz = nor.getZ(v)
        const ax = ne[0] * nx + ne[3] * ny + ne[6] * nz
        const ay = ne[1] * nx + ne[4] * ny + ne[7] * nz
        const az = ne[2] * nx + ne[5] * ny + ne[8] * nz
        const len = Math.hypot(ax, ay, az) || 1
        N[o * 3] = ax / len
        N[o * 3 + 1] = ay / len
        N[o * 3 + 2] = az / len
      } else N[o * 3 + 1] = 1
      for (const a of extra) {
        const src = part.geo.attributes[a.name]
        for (let c = 0; c < a.size; c++) a.out[o * a.size + c] = src ? src.getComponent(v, c) : a.fill
      }
      o++
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(P, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3))
  for (const a of extra) g.setAttribute(a.name, new THREE.BufferAttribute(a.out, a.size))
  return g
}

/**
 * Renders its children, then joins the meshes among them that share a
 * material into one mesh each and hides the originals. Anything that moves,
 * and anything drawn many times over as one instanced mesh already, is left
 * as it is: mark a moving mesh with userData.live. `sig` says when what is
 * inside has changed and must be joined again.
 */
export function Merged({ sig, children }: { sig: string | number; children: ReactNode }) {
  const src = useRef<THREE.Group>(null)
  const [out, setOut] = useState<THREE.Mesh[]>([])
  useLayoutEffect(() => {
    const root = src.current
    if (!root) return
    wake(root)
    root.updateWorldMatrix(true, true)
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
    const groups = new Map<string, { material: THREE.Material; parts: Source[]; cast: boolean; receive: boolean; order: number }>()
    const done = new Set<THREE.Object3D>()
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh || mesh.userData.live || Array.isArray(mesh.material)) return
      if (!mesh.geometry?.attributes.position || mesh.geometry.morphAttributes.position) return
      // whatever drew the mesh may have hidden it for reasons of its own: that stays hidden, and out of the join
      if (!mesh.visible && !mesh.userData.joined) return
      const key = `${mesh.material.uuid}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}|${mesh.renderOrder}`
      let g = groups.get(key)
      if (!g) groups.set(key, (g = { material: mesh.material, parts: [], cast: mesh.castShadow, receive: mesh.receiveShadow, order: mesh.renderOrder }))
      g.parts.push({ geo: mesh.geometry, at: new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld) })
      mesh.visible = false
      mesh.userData.joined = true
      done.add(mesh)
    })
    rest(root, done)
    const meshes: THREE.Mesh[] = []
    for (const g of groups.values()) {
      const mesh = new THREE.Mesh(joinGeometries(g.parts), g.material)
      mesh.castShadow = g.cast
      mesh.receiveShadow = g.receive
      mesh.renderOrder = g.order
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
