// Renders small device images with one shared offscreen renderer, so lists can
// show 3D thumbnails without opening a WebGL context per row.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { DeviceDesign, DeviceType } from '../sim/types'
import { webglAvailable } from './SafeCanvas'
import { buildDevice, deviceFrame, disposeDevice, setFold } from './buildDevice'

const W = 180
const H = 220
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
const cache = new Map<string, string>()
/**
 * Pictures kept. A long game has several hundred devices on its lists, its
 * own and its rivals'; with fewer kept than a list shows, scrolling it would
 * draw the same ones over and over.
 */
const KEEP = 800
/** When drawing last failed for want of 3D graphics: it is not tried again for a while, so a list of 300 does not fail 300 times. */
let failedAt = -Infinity
const RETRY_MS = 15000

/**
 * Where the camera stands for each type, as a direction. Phones, tablets and
 * watches show their back; anything with a stand, a lid or a front panel shows
 * its front from slightly above.
 */
const ANGLES: Partial<Record<DeviceType, [number, number, number]>> = {
  laptop: [0.38, 0.5, 0.78],
  desktop: [0.34, 0.16, 0.93],
  tv: [0.34, 0.14, 0.93],
  console: [0.42, 0.4, 0.82],
  earbuds: [0.4, 0.42, 0.82],
  foldable: [0.5, 0.2, 0.84],
  headset: [0.5, 0.36, 0.79],
  speaker: [0.36, 0.46, 0.81],
  handheld: [0.3, 0.22, 0.93],
  ereader: [0.3, 0.16, 0.94],
  ring: [0.34, 0.66, 0.67],
  drone: [0.52, 0.42, 0.74],
  tower: [0.62, 0.26, 0.74],
  monitor: [0.34, 0.16, 0.93],
  mouse: [-0.42, 0.62, -0.66],
}
const BACK: [number, number, number] = [-0.36, 0.12, -0.92]

function setup() {
  renderer?.dispose()
  renderer = null
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setSize(W, H)
  renderer.setPixelRatio(2)
  renderer.toneMapping = THREE.NeutralToneMapping
  scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.55
  const key = new THREE.DirectionalLight('#ffe3c2', 2.2)
  key.position.set(-200, 300, -380)
  const rim = new THREE.DirectionalLight('#ffffff', 2)
  rim.position.set(260, 200, 300)
  scene.add(key, rim)
  camera = new THREE.PerspectiveCamera(24, W / H, 10, 3000)
}

/** Data URL of a device at three-quarter angle. */
export function deviceThumbnail(key: string, design: DeviceDesign, logo?: string): string {
  const hit = cache.get(key)
  if (hit) return hit
  if (performance.now() - failedAt < RETRY_MS) return ''
  try {
    if (!webglAvailable()) throw new Error('no WebGL')
    // the browser takes a picture away from a page that has too many, or when the graphics driver restarts: start again
    if (!renderer || renderer.getContext().isContextLost()) setup()
    // small screen artwork is plenty at this size
    const device = buildDevice(design, null, logo, -1, 0.4)
    // a foldable is shown part-way open, like a book, so that it does not pass for a tablet
    setFold(device, 0.3)
    scene.add(device)
    const dir = ANGLES[design.type] ?? BACK
    // the frame is portrait, so a wide device has to stand further back to fit across it
    const wide = design.body.width > design.body.height * 1.2 ? 1.18 : 1
    const dist = deviceFrame(design).radius * 5.4 * wide
    camera.position.set(dir[0] * dist, dir[1] * dist, dir[2] * dist)
    // the model lies within a fifth of the distance of its centre: a near plane close to it keeps the depth buffer fine enough for its decals
    camera.near = dist * 0.55
    camera.far = dist * 1.8
    camera.updateProjectionMatrix()
    camera.lookAt(0, 0, 0)
    renderer!.render(scene, camera)
    const url = renderer!.domElement.toDataURL('image/png')
    scene.remove(device)
    disposeDevice(device)
    // a picture taken as the context went is blank: it is not kept, and the next one starts afresh
    if (renderer!.getContext().isContextLost()) return ''
    cache.set(key, url)
    if (cache.size > KEEP) cache.delete(cache.keys().next().value!)
    return url
  } catch {
    failedAt = performance.now()
    return ''
  }
}
