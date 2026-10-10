// The 3D studio: an isolated canvas that shows one device under a three-point
// lighting rig. Used read-only in the dashboard and interactively in the designer.
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { DeviceDesign, Face } from '../sim/types'
import { buildDevice, disposeDevice, pointToFace } from './buildDevice'

export type ViewName = 'back' | 'front' | 'side' | 'bottom'
const VIEWS: Record<ViewName, [number, number, number]> = {
  back: [-150, 70, -430],
  front: [150, 70, 430],
  side: [460, 40, -60],
  bottom: [60, -400, -230],
}

interface Props {
  design: DeviceDesign
  selectedId?: string | null
  view?: ViewName
  viewNonce?: number
  /** Called when a part (or nothing) is pressed. Enables dragging. */
  onPick?: (partId: string | null) => void
  /** Called while a part is dragged across the body surface. */
  onDrag?: (face: Face, x: number, y: number) => void
  autoRotate?: boolean
}

function Rig({ view, nonce }: { view: ViewName; nonce: number }) {
  const { camera, controls } = useThree()
  useEffect(() => {
    camera.position.set(...VIEWS[view])
    camera.lookAt(0, 0, 0)
    ;(controls as unknown as { update?: () => void } | null)?.update?.()
  }, [view, nonce, camera, controls])
  return null
}

function Device({ design, selectedId, onPick, onDrag }: Props) {
  const group = useMemo(() => buildDevice(design, selectedId), [design, selectedId])
  useEffect(() => () => disposeDevice(group), [group])
  const dragging = useRef(false)
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null

  useEffect(() => {
    const up = () => {
      dragging.current = false
      if (controls) controls.enabled = true
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [controls])

  if (!onPick) return <primitive object={group} />

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const hit = e.intersections.find((i) => i.object.userData.partId)
    const front = e.intersections[0]
    // a part only counts if nothing but its own island / the body is in front of it
    const id = (front?.object.userData.partId as string | undefined) ?? (hit && hit.distance - front.distance < 3 ? (hit.object.userData.partId as string) : null)
    onPick(id)
    if (id) {
      dragging.current = true
      if (controls) controls.enabled = false
    }
  }
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current || !onDrag) return
    e.stopPropagation()
    const hit = e.intersections.find((i) => i.object.userData.body && i.face)
    if (!hit?.face) return
    const f = pointToFace(hit.point, hit.face.normal)
    onDrag(f.face, f.x, f.y)
  }
  return <primitive object={group} onPointerDown={down} onPointerMove={move} />
}

export function DeviceView(props: Props) {
  const floorY = -props.design.body.height / 2 - 8
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 26, near: 10, far: 4000, position: VIEWS[props.view ?? 'back'] }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onPointerMissed={() => props.onPick?.(null)}
    >
      <color attach="background" args={['#0a0c0f']} />
      <fog attach="fog" args={['#0a0c0f', 900, 2200]} />

      {/* three-point rig: warm key, cool fill, hard rim */}
      <directionalLight
        color="#ffe3c2"
        intensity={2.4}
        position={[220, 320, 380]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.4}
        shadow-camera-left={-160}
        shadow-camera-right={160}
        shadow-camera-top={160}
        shadow-camera-bottom={-160}
        shadow-camera-near={50}
        shadow-camera-far={1200}
      />
      <directionalLight color="#b9d2ff" intensity={0.9} position={[-320, 80, 260]} />
      <directionalLight color="#ffffff" intensity={3.2} position={[-160, 260, -380]} />
      <ambientLight intensity={0.12} />

      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#050608']} />
        <Lightformer form="rect" intensity={5} color="#fff1e0" position={[4, 6, 6]} scale={[8, 5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={2.2} color="#cfe0ff" position={[-8, 1, 3]} scale={[3, 9, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={6} color="#ffffff" position={[-3, 5, -8]} scale={[9, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[8, -1, -4]} scale={[2, 10, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={1.2} color="#9fb4c8" position={[0, -7, 0]} scale={6} target={[0, 0, 0]} />
      </Environment>

      <Device {...props} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        <meshLambertMaterial color="#1b1f25" />
      </mesh>

      <EffectComposer multisampling={4}>
        <N8AO aoRadius={9} distanceFalloff={1} intensity={2.2} quality="medium" />
      </EffectComposer>

      <OrbitControls makeDefault enablePan={false} minDistance={140} maxDistance={1100} autoRotate={props.autoRotate} autoRotateSpeed={0.9} />
      <Rig view={props.view ?? 'back'} nonce={props.viewNonce ?? 0} />
    </Canvas>
  )
}
