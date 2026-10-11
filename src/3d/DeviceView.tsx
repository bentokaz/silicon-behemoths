// The 3D studio: an isolated canvas that shows one device under a three-point
// lighting rig. Used read-only in the dashboard and interactively in the designer.
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { TYPES } from '../data/devices'
import type { Carrier } from '../sim/geometry'
import type { DeviceDesign, DeviceType, Face } from '../sim/types'
import { buildDevice, deviceFrame, disposeDevice, pointToFace } from './buildDevice'

export type ViewName = 'back' | 'front' | 'side' | 'bottom'
type Views = Record<ViewName, [number, number, number]>
/** Camera directions; the distance is set from the size of the device. */
const VIEWS: Views = {
  back: [-0.33, 0.15, -0.93],
  front: [0.33, 0.15, 0.93],
  side: [0.98, 0.09, -0.13],
  bottom: [0.13, -0.86, -0.49],
}
/** Things that sit on a desk are viewed from higher up; their fourth view looks down on them. */
const DESK_VIEWS: Partial<Record<DeviceType, Views>> = {
  laptop: { back: [-0.4, 0.42, -0.82], front: [0.34, 0.5, 0.8], side: [0.95, 0.28, 0.12], bottom: [0.3, 0.9, 0.3] },
  desktop: { back: [-0.42, 0.2, -0.88], front: [0.3, 0.14, 0.94], side: [0.97, 0.12, 0.2], bottom: [0.18, -0.72, 0.67] },
  tv: { back: [-0.42, 0.2, -0.88], front: [0.28, 0.12, 0.95], side: [0.97, 0.12, 0.2], bottom: [0.18, -0.72, 0.67] },
  console: { back: [-0.42, 0.34, -0.84], front: [0.4, 0.36, 0.84], side: [0.93, 0.26, 0.24], bottom: [0.24, 0.9, 0.36] },
  earbuds: { back: [-0.44, 0.34, -0.83], front: [0.36, 0.4, 0.84], side: [0.93, 0.28, 0.24], bottom: [0.2, -0.82, 0.54] },
}
const viewDir = (d: DeviceDesign, v: ViewName) => (DESK_VIEWS[d.type] ?? VIEWS)[v]
/** What the fourth view button shows for a device type. */
export const fourthView = (type: DeviceType): string => (type === 'laptop' || type === 'console' ? 'top' : type === 'desktop' || type === 'tv' ? 'under' : 'bottom')
/** Camera distance per unit of device radius, for a 26 degree lens. */
const FRAMING = 5.3

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
  /** Uploaded company logo, shown on logo parts that ask for it. */
  logo?: string
  /** Preview one of the design's extra colourways; -1 shows the main colour. */
  colorIndex?: number
}

function Rig({ dir, dist, nonce }: { dir: [number, number, number]; dist: number; nonce: number }) {
  const { camera, controls } = useThree()
  useEffect(() => {
    camera.position.set(dir[0] * dist, dir[1] * dist, dir[2] * dist)
    camera.lookAt(0, 0, 0)
    ;(controls as unknown as { update?: () => void } | null)?.update?.()
    // re-aim only when the view is chosen or the device changes size, not on every edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, nonce, Math.round(dist / 40), camera, controls])
  return null
}

function Device({ design, selectedId, onPick, onDrag, logo, colorIndex = -1, scale }: Props & { scale: number }) {
  const group = useMemo(() => buildDevice(design, selectedId, logo, colorIndex), [design, selectedId, logo, colorIndex])
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
    const id = (front?.object.userData.partId as string | undefined) ?? (hit && hit.distance - front.distance < 3 * scale ? (hit.object.userData.partId as string) : null)
    onPick(id)
    if (id) {
      dragging.current = true
      if (controls) controls.enabled = false
    }
  }
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current || !onDrag) return
    e.stopPropagation()
    // the nearest solid under the pointer; the hit is converted into that solid's own space
    const hit = e.intersections.find((i) => i.object.userData.body && i.face)
    if (!hit?.face) return
    const local = hit.object.worldToLocal(hit.point.clone())
    const f = pointToFace(design.type, hit.object.userData.carrier as Carrier, local, hit.face.normal)
    if (f) onDrag(f.face, f.x, f.y)
  }
  return <primitive object={group} onPointerDown={down} onPointerMove={move} />
}

export function DeviceView(props: Props) {
  const { design } = props
  const { radius, bottom } = deviceFrame(design)
  // everything in the studio scales with the device, so a watch and a TV are lit alike
  const k = radius / 87
  const dist = radius * FRAMING
  const desk = !!DESK_VIEWS[design.type]
  const view = props.view ?? TYPES[design.type].hero
  const dir = viewDir(design, view)
  // a laptop's deck and a console's lid face straight up into the key light, so they need less of it
  const sun = design.type === 'laptop' || design.type === 'console' ? 0.5 : design.type === 'earbuds' ? 0.75 : 1
  const floorY = -bottom - (desk ? 0.3 * Math.min(k, 1) : 8 * k)
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 26, near: 5 * k, far: 6000 * k, position: [dir[0] * dist, dir[1] * dist, dir[2] * dist] }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onPointerMissed={() => props.onPick?.(null)}
    >
      <color attach="background" args={['#0a0c0f']} />
      <fog attach="fog" args={['#0a0c0f', 900 * k, 2200 * k]} />

      {/* three-point rig: warm key, cool fill, hard rim */}
      <directionalLight
        color="#ffe3c2"
        intensity={1.9 * sun}
        position={[220 * k, 320 * k, 380 * k]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.4 * k}
        shadow-camera-left={-170 * k}
        shadow-camera-right={170 * k}
        shadow-camera-top={170 * k}
        shadow-camera-bottom={-170 * k}
        shadow-camera-near={50 * k}
        shadow-camera-far={1200 * k}
      />
      <directionalLight color="#b9d2ff" intensity={0.9} position={[-320 * k, 80 * k, 260 * k]} />
      <directionalLight color="#ffffff" intensity={1.5 * sun} position={[-160 * k, 260 * k, -380 * k]} />
      <ambientLight intensity={0.12} />

      <Environment resolution={256} frames={1} environmentIntensity={0.5}>
        <color attach="background" args={['#050608']} />
        <Lightformer form="rect" intensity={5} color="#fff1e0" position={[4, 6, 6]} scale={[8, 5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={2.2} color="#cfe0ff" position={[-8, 1, 3]} scale={[3, 9, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={6} color="#ffffff" position={[-3, 5, -8]} scale={[9, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[8, -1, -4]} scale={[2, 10, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={1.2} color="#9fb4c8" position={[0, -7, 0]} scale={6} target={[0, 0, 0]} />
      </Environment>

      <Device {...props} scale={k} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]} receiveShadow>
        <planeGeometry args={[3000 * k, 3000 * k]} />
        <meshLambertMaterial color="#1b1f25" />
      </mesh>

      <EffectComposer multisampling={4}>
        <N8AO aoRadius={9 * k} distanceFalloff={1} intensity={2.2} quality="medium" />
      </EffectComposer>

      <OrbitControls makeDefault enablePan={false} minDistance={dist * 0.3} maxDistance={dist * 2.4} autoRotate={props.autoRotate} autoRotateSpeed={0.9} />
      <Rig dir={dir} dist={dist} nonce={props.viewNonce ?? 0} />
    </Canvas>
  )
}
