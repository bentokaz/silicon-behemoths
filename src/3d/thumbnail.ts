// Renders small device images with one shared offscreen renderer, so lists can
// show 3D thumbnails without opening a WebGL context per row.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { DeviceDesign } from '../sim/types'
import { buildDevice, disposeDevice } from './buildDevice'

const W = 180
const H = 220
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
const cache = new Map<string, string>()

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

/** Data URL of a device seen from the back at three-quarter angle. */
export function deviceThumbnail(key: string, design: DeviceDesign, logo?: string): string {
  const hit = cache.get(key)
  if (hit) return hit
  try {
    if (!renderer) setup()
    const device = buildDevice(design, null, logo)
    scene.add(device)
    const dist = Math.max(design.body.height, design.body.width * 1.6) * 2.75
    camera.position.set(-dist * 0.36, dist * 0.12, -dist * 0.92)
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
