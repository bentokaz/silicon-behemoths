// The 3D studio: an isolated canvas that shows one device under a three-point
// lighting rig. Used read-only in the dashboard and interactively in the designer.
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { TYPES } from '../data/devices'
import type { DeviceDesign, DeviceType } from '../sim/types'
import { layoutInternals } from '../sim/internals'
import { LiveDevice, type TearInfo } from './LiveDevice'
import { buildDevice, deviceFrame, disposeDevice } from './buildDevice'
import type { DemoHints } from './demos'
import { useStudio } from './studio'
import { type Rig, newRigMemory, rigTeardown } from './teardown'

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
  headset: { back: [-0.5, 0.42, -0.76], front: [0.46, 0.3, 0.84], side: [0.95, 0.24, 0.2], bottom: [0.22, 0.92, 0.32] },
  speaker: { back: [-0.42, 0.3, -0.86], front: [0.32, 0.5, 0.8], side: [0.93, 0.3, 0.22], bottom: [0.12, 0.95, 0.3] },
}
const viewDir = (d: DeviceDesign, v: ViewName) => (DESK_VIEWS[d.type] ?? VIEWS)[v]
/** What the fourth view button shows for a device type. */
export const fourthView = (type: DeviceType): string => (type === 'laptop' || type === 'console' || type === 'headset' || type === 'speaker' ? 'top' : type === 'desktop' || type === 'tv' ? 'under' : 'bottom')
/** Camera distance per unit of device radius, for a 26 degree lens. */
const FRAMING = 5.3

interface Props {
  design: DeviceDesign
  selectedId?: string | null
  view?: ViewName
  viewNonce?: number
  /** Called when a part (or nothing) is pressed. */
  onPick?: (partId: string | null) => void
  /**
   * Set in the designer: the body eases as it changes and changes that cannot
   * be seen are acted out. With `editable`, parts and the body can also be
   * dragged, resized and turned on the model itself.
   */
  studio?: { editable: boolean; hints?: DemoHints; tear?: TearInfo }
  /** Outside the designer: show the device opened up, as a teardown. */
  teardown?: boolean
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

/** The model as a still object, for the dashboard. The designer uses LiveDevice instead. */
function Device({ design, selectedId, logo, colorIndex = -1, teardown }: Props) {
  const group = useMemo(() => buildDevice(design, selectedId, logo, colorIndex), [design, selectedId, logo, colorIndex])
  useEffect(() => () => disposeDevice(group), [group])
  const opened = useRef(0)
  const mem = useRef(newRigMemory())
  useFrame((_, dt) => {
    const target = teardown ? 1 : 0
    if (!target && opened.current === 0) return
    opened.current += (target - opened.current) * (1 - Math.exp(-dt * (design.type === 'laptop' ? 1.9 : 3.2)))
    if (Math.abs(target - opened.current) < 0.002) opened.current = target
    // the insides are built the first time the device is opened, and without research levels: a rival's device fits as built
    const rig = (group.userData.rig ??= rigTeardown(group, design, layoutInternals(design))) as Rig
    rig.pose(opened.current, 0, Math.min(dt, 0.1), mem.current, performance.now())
  })
  return <primitive object={group} />
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
  const sun = design.type === 'laptop' || design.type === 'console' ? 0.5 : design.type === 'earbuds' ? 0.75 : design.type === 'speaker' ? 0.65 : design.type === 'headset' ? 0.85 : 1
  const floorY = -bottom - (desk ? 0.3 * Math.min(k, 1) : 8 * k)
  // the wide, flat back of a screen or a lid faces away from every lamp, so it gets a fill of its own
  const backFill = design.type === 'tv' || design.type === 'desktop' ? 1.1 : design.type === 'laptop' ? 0.7 : 0
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 26, near: 5 * k, far: 6000 * k, position: [dir[0] * dist, dir[1] * dist, dir[2] * dist] }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onPointerMissed={() => (props.onPick?.(null), props.studio && useStudio.getState().pick && useStudio.setState({ pick: null }))}
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
      {backFill > 0 && <directionalLight color="#d5deea" intensity={backFill} position={[-240 * k, 150 * k, -420 * k]} />}
      <ambientLight intensity={0.12} />

      <Environment resolution={256} frames={1} environmentIntensity={0.5}>
        <color attach="background" args={['#050608']} />
        <Lightformer form="rect" intensity={5} color="#fff1e0" position={[4, 6, 6]} scale={[8, 5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={2.2} color="#cfe0ff" position={[-8, 1, 3]} scale={[3, 9, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={6} color="#ffffff" position={[-3, 5, -8]} scale={[9, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[8, -1, -4]} scale={[2, 10, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={1.2} color="#9fb4c8" position={[0, -7, 0]} scale={6} target={[0, 0, 0]} />
      </Environment>

      {props.studio ? <LiveDevice design={design} selectedId={props.selectedId} onPick={props.onPick} logo={props.logo} colorIndex={props.colorIndex} scale={k} editable={props.studio.editable} hints={props.studio.hints} tear={props.studio.tear} /> : <Device {...props} />}

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
