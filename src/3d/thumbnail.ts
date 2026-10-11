// Renders small device images with one shared offscreen renderer, so lists can
// show 3D thumbnails without opening a WebGL context per row.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { DeviceDesign, DeviceType } from '../sim/types'
import { buildDevice, deviceFrame, disposeDevice } from './buildDevice'

const W = 180
const H = 220
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
const cache = new Map<string, string>()

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
}
const BACK: [number, number, number] = [-0.36, 0.12, -0.92]

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setSize(W, H)
  renderer.setPixelRatio(2)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
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
  try {
    if (!renderer) setup()
    // small screen artwork is plenty at this size
    const device = buildDevice(design, null, logo, -1, 0.4)
    scene.add(device)
    const dir = ANGLES[design.type] ?? BACK
    // the frame is portrait, so a wide device has to stand further back to fit across it
    const wide = design.body.width > design.body.height * 1.2 ? 1.18 : 1
    const dist = deviceFrame(design).radius * 5.4 * wide
    camera.position.set(dir[0] * dist, dir[1] * dist, dir[2] * dist)
    camera.near = dist * 0.05
    camera.far = dist * 4
    camera.updateProjectionMatrix()
    camera.lookAt(0, 0, 0)
    renderer!.render(scene, camera)
    const url = renderer!.domElement.toDataURL('image/png')
    scene.remove(device)
    disposeDevice(device)
    cache.set(key, url)
    if (cache.size > 300) cache.delete(cache.keys().next().value!)
    return url
  } catch {
    return ''
  }
}
