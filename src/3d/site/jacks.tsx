// The pallet trucks the warehouse hands push about a factory: a pair of
// forks, a pump and a handle, with a couple of cartons on while there is a
// load. All of them share one instanced mesh and follow their hands' bodies.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { type Body, type Crowd, Kind, Mode, Tool } from './crowd'
import { FactoryCrowd } from './factorycrowd'
import { useTick } from './tick'

/** Boxes per truck: two forks, the pump, the handle, its grip, and two cartons. */
const PARTS = 7
const STEEL = '#c2402f'
const DARK = '#22262b'
const CARTON = '#b98b56'
const R = new THREE.Matrix4()
const A = new THREE.Matrix4()
const OUT = new THREE.Matrix4()
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
const col = new THREE.Color()

export function Jacks({ crowd, cap = 4 }: { crowd: Crowd; cap?: number }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.2 }), cap * PARTS)
    m.frustumCulled = false
    m.userData.live = true
    m.receiveShadow = true
    for (let i = 0; i < cap; i++) {
      for (let k = 0; k < PARTS; k++) {
        m.setMatrixAt(i * PARTS + k, ZERO)
        m.setColorAt(i * PARTS + k, col.set(k < 3 ? STEEL : k < 5 ? DARK : k === 5 ? CARTON : '#c49a62'))
      }
    }
    return m
  }, [cap])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    },
    [mesh],
  )
  useTick(() => {
    let n = 0
    const part = (i: number, w: number, h: number, d: number, x: number, y: number, z: number, tilt = 0) => {
      if (tilt) A.makeRotationX(tilt).scale(V.set(w, h, d)).setPosition(x, y, z)
      else A.makeScale(w, h, d).setPosition(x, y, z)
      mesh.setMatrixAt(i, OUT.multiplyMatrices(R, A))
    }
    for (const b of crowd.bodies as Body[]) {
      if (n >= cap) break
      if (b.kind !== Kind.Hand || b.tool !== Tool.Jack) continue
      const i = n++ * PARTS
      if (b.mode === Mode.Off) {
        for (let k = 0; k < PARTS; k++) mesh.setMatrixAt(i + k, ZERO)
        continue
      }
      // the truck's own frame: in front of whoever pushes it (-Z is the way they face)
      R.makeRotationY(b.yaw).setPosition(b.x, b.y, b.z)
      part(i, 0.13, 0.05, 0.72, -0.19, 0.075, -0.92)
      part(i + 1, 0.13, 0.05, 0.72, 0.19, 0.075, -0.92)
      part(i + 2, 0.46, 0.34, 0.16, 0, 0.2, -0.52)
      part(i + 3, 0.035, 0.74, 0.035, 0, 0.68, -0.44, -0.24)
      part(i + 4, 0.3, 0.035, 0.035, 0, 1.03, -0.35)
      if (FactoryCrowd.loaded(b)) {
        part(i + 5, 0.44, 0.3, 0.4, 0, 0.25, -0.86)
        part(i + 6, 0.36, 0.24, 0.34, 0.02, 0.52, -0.9)
      } else {
        mesh.setMatrixAt(i + 5, ZERO)
        mesh.setMatrixAt(i + 6, ZERO)
      }
    }
    for (; n < cap; n++) for (let k = 0; k < PARTS; k++) mesh.setMatrixAt(n * PARTS + k, ZERO)
    mesh.instanceMatrix.needsUpdate = true
  }, 6)
  return <primitive object={mesh} />
}

const V = new THREE.Vector3()
