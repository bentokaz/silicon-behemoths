// Builds a three.js model of a device from its DeviceDesign. Units are mm.
// The phone stands upright: X = width, Y = height, Z = thickness, screen at +Z.
import * as THREE from 'three'
import { edgeBevel, isSide, screenRect } from '../sim/geometry'
import type { Body, DeviceDesign, Face, PlacedPart } from '../sim/types'
import { themeColor } from '../store/theme'
import { backMaterial, blackGlass, darkMatte, flashMaterial, frameMaterial, lensCore, lensGlass } from './materials'


export function roundedRectShape(w: number, h: number, radius: number): THREE.Shape {
  const r = Math.max(0.01, Math.min(radius, w / 2 - 0.001, h / 2 - 0.001))
  const x = -w / 2
  const y = -h / 2
  const s = new THREE.Shape()
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x + w, y + h - r)
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false)
  s.lineTo(x + r, y + h)
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + r)
  s.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI, false)
  return s
}

/** Flat plate with UVs stretched over its bounding box. */
function plate(w: number, h: number, r: number): THREE.ShapeGeometry {
  const g = new THREE.ShapeGeometry(roundedRectShape(w, h, r), 16)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5)
  return g
}

function slab(w: number, h: number, r: number, depth: number, bevel: number, segments = 3): THREE.ExtrudeGeometry {
  const b = Math.min(bevel, depth / 2 - 0.01, w / 2 - 0.02, h / 2 - 0.02)
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w - 2 * b, h - 2 * b, Math.max(r - b, 0.05)), {
    depth: depth - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: segments,
    curveSegments: 20,
  })
  g.translate(0, 0, b)
  return g
}

function disc(radius: number, height: number): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, height, 48)
  g.rotateX(Math.PI / 2)
  g.translate(0, 0, height / 2)
  return g
}

// ------------------------------------------------------------ face mapping

const BASIS: Record<Face, [number[], number[], number[]]> = {
  front: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  back: [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
  right: [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
  left: [[0, 1, 0], [0, 0, -1], [-1, 0, 0]],
  top: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  bottom: [[1, 0, 0], [0, 0, 1], [0, -1, 0]],
}

function faceDepth(b: Body, face: Face): number {
  return face === 'front' || face === 'back' ? b.thickness / 2 : face === 'left' || face === 'right' ? b.width / 2 : b.height / 2
}

/** Position and orient an object so its local +Z points out of the face. */
export function placeOnFace(obj: THREE.Object3D, b: Body, face: Face, x: number, y: number, rotDeg: number) {
  const [X, Y, Z] = BASIS[face].map((v) => new THREE.Vector3(v[0], v[1], v[2]))
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z))
  obj.position.copy(X.multiplyScalar(x)).add(Y.multiplyScalar(y)).add(Z.multiplyScalar(faceDepth(b, face)))
  obj.rotateZ((rotDeg * Math.PI) / 180)
}

/** Inverse of placeOnFace: which face a surface point is on, and its face coordinates. */
export function pointToFace(point: THREE.Vector3, normal: THREE.Vector3): { face: Face; x: number; y: number } {
  const ax = Math.abs(normal.x)
  const ay = Math.abs(normal.y)
  const az = Math.abs(normal.z)
  const face: Face = az >= ax && az >= ay ? (normal.z > 0 ? 'front' : 'back') : ax >= ay ? (normal.x > 0 ? 'right' : 'left') : normal.y > 0 ? 'top' : 'bottom'
  const [X, Y] = BASIS[face]
  return { face, x: point.x * X[0] + point.y * X[1] + point.z * X[2], y: point.x * Y[0] + point.y * Y[1] + point.z * Y[2] }
}

// ------------------------------------------------------------ textures

const wallpaperCache = new Map<number, THREE.CanvasTexture>()
const WALLPAPERS: [string, string, string][] = [
  ['#0e2a33', '#1f7f86', '#e8b25a'],
  ['#1a1410', '#b5532a', '#f1d6a8'],
  ['#0b1d16', '#2f8f5b', '#d6f0c2'],
  ['#101319', '#44506a', '#c9d3e6'],
  ['#2a0f14', '#c23b4e', '#f3c9b1'],
  ['#07131f', '#1c5d99', '#9fd6ff'],
]

export function wallpaperTexture(index: number): THREE.CanvasTexture {
  const key = ((index % WALLPAPERS.length) + WALLPAPERS.length) % WALLPAPERS.length
  const hit = wallpaperCache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 1100
  const g = c.getContext('2d')!
  const [a, b, hi] = WALLPAPERS[key]
  const grad = g.createLinearGradient(0, 0, 512, 1100)
  grad.addColorStop(0, a)
  grad.addColorStop(0.6, b)
  grad.addColorStop(1, a)
  g.fillStyle = grad
  g.fillRect(0, 0, 512, 1100)
  // layered dunes
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 ? b : hi
    g.globalAlpha = 0.16 + i * 0.05
    g.beginPath()
    g.moveTo(0, 1100)
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, 620 + i * 110 + Math.sin(x / 90 + i * 1.7 + key) * 60)
    g.lineTo(512, 1100)
    g.fill()
  }
  g.globalAlpha = 1
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.font = '600 120px "Segoe UI", sans-serif'
  g.fillText('09:41', 256, 260)
  g.font = '400 30px "Segoe UI", sans-serif'
  g.globalAlpha = 0.85
  g.fillText('Saturday 10 October', 256, 310)
  g.globalAlpha = 0.9
  for (let i = 0; i < 4; i++) {
    g.fillStyle = ['#f2f2f2', hi, '#1d1f24', b][i]
    g.beginPath()
    g.roundRect(62 + i * 104, 950, 76, 76, 20)
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  wallpaperCache.set(key, t)
  return t
}

const logoCache = new Map<string, THREE.CanvasTexture>()
function logoTexture(text: string): THREE.CanvasTexture {
  const hit = logoCache.get(text)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, 1024, 256)
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  let size = 190
  g.font = `600 ${size}px Bahnschrift, "Segoe UI", sans-serif`
  const width = g.measureText(text).width
  if (width > 980) size = (size * 980) / width
  g.font = `600 ${size}px Bahnschrift, "Segoe UI", sans-serif`
  g.fillText(text, 512, 136)
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 8
  logoCache.set(text, t)
  if (logoCache.size > 200) logoCache.delete(logoCache.keys().next().value!)
  return t
}

const imageCache = new Map<string, THREE.Texture>()
/** Texture for an uploaded logo (a data URL). Loads asynchronously, then stays cached. */
export function imageTexture(url: string): THREE.Texture {
  const hit = imageCache.get(url)
  if (hit) return hit
  const t = new THREE.TextureLoader().load(url)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  imageCache.set(url, t)
  if (imageCache.size > 8) imageCache.delete(imageCache.keys().next().value!)
  return t
}

// ------------------------------------------------------------ parts

interface Mats {
  frame: THREE.Material
  back: THREE.Material
  glass: THREE.Material
  lens: THREE.Material
  core: THREE.Material
  dark: THREE.Material
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadow = true): THREE.Mesh {
  const o = new THREE.Mesh(g, m)
  o.castShadow = shadow
  o.receiveShadow = true
  return o
}

function buildPart(p: PlacedPart, d: DeviceDesign, m: Mats, logoUrl?: string): THREE.Group {
  const g = new THREE.Group()
  const side = isSide(p.face)
  const r = Math.min(p.w, p.h) / 2
  switch (p.kind) {
    case 'camera': {
      if (p.face === 'front') {
        if (p.underDisplay) {
          const ring = mesh(new THREE.RingGeometry(r * 0.8, r, 32), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18 }), false)
          ring.position.z = 0.07
          g.add(ring)
        } else {
          const hole = mesh(new THREE.CircleGeometry(r, 40), m.dark, false)
          hole.position.z = 0.07
          const core = mesh(new THREE.CircleGeometry(r * 0.45, 32), m.core, false)
          core.position.z = 0.09
          g.add(hole, core)
        }
        break
      }
      g.add(mesh(disc(r, 2.1), m.frame))
      const glass = mesh(disc(r * 0.86, 0.12), m.lens)
      glass.position.z = 2.1
      g.add(glass)
      if (p.lens === 'periscope') {
        const core = mesh(plate(r * 0.95, r * 0.95, r * 0.18), m.core, false)
        core.position.z = 2.24
        g.add(core)
      } else {
        const scale = p.lens === 'ultrawide' ? 0.62 : p.lens === 'macro' ? 0.3 : p.lens === 'tele' ? 0.4 : 0.5
        const core = mesh(new THREE.CircleGeometry(r * scale, 40), m.core, false)
        core.position.z = 2.24
        const iris = mesh(new THREE.RingGeometry(r * scale, r * scale * 1.18, 40), m.dark, false)
        iris.position.z = 2.235
        g.add(core, iris)
      }
      break
    }
    case 'island': {
      const mat = p.finish === 'frame' ? m.frame : p.finish === 'black' ? m.glass : m.back
      g.add(mesh(slab(p.w, p.h, p.r ?? 6, 1.3, 0.35), mat))
      break
    }
    case 'flash': {
      g.add(mesh(disc(r, 1.5), m.frame))
      const led = mesh(disc(r * 0.78, 0.1), flashMaterial(), false)
      led.position.z = 1.5
      g.add(led)
      break
    }
    case 'notch': {
      const n = mesh(plate(p.w, p.h, p.r ?? 3), m.dark, false)
      n.position.z = 0.06
      g.add(n)
      break
    }
    case 'button':
      g.add(mesh(slab(p.w, p.h, p.h / 2, 0.55, 0.15), m.frame))
      break
    case 'port': {
      const hole = mesh(plate(p.w, p.h, p.h / 2), m.dark, false)
      hole.position.z = 0.03
      const tongue = mesh(plate(p.w * 0.72, p.h * 0.22, 0.1), m.frame, false)
      tongue.position.z = 0.04
      g.add(hole, tongue)
      break
    }
    case 'grille': {
      const hr = p.h / 2
      const count = Math.max(1, Math.floor(p.w / (hr * 3.2)))
      const span = (count - 1) * hr * 3.2
      for (let i = 0; i < count; i++) {
        const dot = mesh(new THREE.CircleGeometry(hr, 16), m.dark, false)
        dot.position.set(-span / 2 + i * hr * 3.2, 0, 0.03)
        g.add(dot)
      }
      break
    }
    case 'fingerprint': {
      if (side) {
        g.add(mesh(slab(p.w, p.h, p.h / 2, 0.25, 0.08), m.glass))
      } else if (p.face === 'front') {
        const ring = mesh(new THREE.RingGeometry(r * 0.82, r, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }), false)
        ring.position.z = 0.07
        g.add(ring)
      } else {
        const ring = mesh(new THREE.RingGeometry(r * 0.88, r, 48), m.frame, false)
        ring.position.z = 0.05
        const pad = mesh(new THREE.CircleGeometry(r * 0.88, 48), m.dark, false)
        pad.position.z = 0.04
        g.add(pad, ring)
      }
      break
    }
    case 'logo': {
      if (p.useImage && logoUrl) {
        const l = mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshPhysicalMaterial({ map: imageTexture(logoUrl), transparent: true, alphaTest: 0.05, roughness: 0.5, metalness: 0 }), false)
        l.position.z = 0.05
        g.add(l)
        break
      }
      const mat = new THREE.MeshPhysicalMaterial({ color: '#e9edf2', metalness: 1, roughness: 0.12, alphaMap: logoTexture(p.text || ' '), transparent: true, depthWrite: false })
      const l = mesh(new THREE.PlaneGeometry(p.w, p.h), mat, false)
      l.position.z = 0.05
      g.add(l)
      break
    }
  }
  placeOnFace(g, d.body, p.face, p.x, p.y, p.rot)
  g.traverse((o) => (o.userData.partId = p.id))
  return g
}

// ------------------------------------------------------------ device

export function buildDevice(d: DeviceDesign, selectedId?: string | null, logoUrl?: string): THREE.Group {
  const b = d.body
  const root = new THREE.Group()
  const m: Mats = {
    frame: frameMaterial(b.frameMat, b.frameColor),
    back: backMaterial(b.backMat, b.backColor, b.backFinish),
    glass: blackGlass(),
    lens: lensGlass(),
    core: lensCore(),
    dark: darkMatte(),
  }
  const bevel = edgeBevel(b)
  const bodyGeo = slab(b.width, b.height, b.corner, b.thickness, bevel, b.edge === 'round' ? 10 : 3)
  bodyGeo.translate(0, 0, -b.thickness / 2)
  const body = mesh(bodyGeo, m.frame)
  body.userData.body = true
  root.add(body)

  const capW = b.width - 2 * bevel
  const capH = b.height - 2 * bevel
  const capR = Math.max(b.corner - bevel, 0.05)
  const backPlate = mesh(plate(capW, capH, capR), m.back, false)
  backPlate.rotation.y = Math.PI
  backPlate.position.z = -b.thickness / 2 - 0.02
  const frontPlate = mesh(plate(capW, capH, capR), m.glass, false)
  frontPlate.position.z = b.thickness / 2 + 0.02
  root.add(backPlate, frontPlate)

  const scr = screenRect(b)
  const tex = wallpaperTexture(d.wallpaper)
  const screenMat = new THREE.MeshPhysicalMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.45, roughness: 0.14, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.1 })
  const screen = mesh(plate(Math.min(scr.w, capW - 0.1), Math.min(scr.h, capH - 0.1), scr.r), screenMat, false)
  screen.position.set(scr.cx, scr.cy, b.thickness / 2 + 0.04)
  root.add(screen)
  for (const o of [backPlate, frontPlate, screen]) o.userData.decor = true

  for (const p of d.parts) {
    const g = buildPart(p, d, m, logoUrl)
    root.add(g)
    if (p.id === selectedId) {
      const pts = [-1, -1, 1, -1, 1, 1, -1, 1].reduce<THREE.Vector3[]>((acc, v, i, arr) => (i % 2 ? acc : [...acc, new THREE.Vector3((v * (p.w + 1.6)) / 2, (arr[i + 1] * (p.h + 1.6)) / 2, 0)]), [])
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: themeColor('accent', '#ff6b1a'), depthTest: false }))
      line.renderOrder = 20
      line.position.z = 2.6
      line.raycast = () => {}
      g.add(line)
    }
  }
  return root
}

export function disposeDevice(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    mesh.geometry?.dispose()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose()
  })
}
