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

/** `body` is the slab the part sits on: the whole device, or a laptop's lid or base. */
function buildPart(p: PlacedPart, body: Body, m: Mats, logoUrl?: string): THREE.Group {
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
      if (p.crown) {
        // a watch crown: a knurled cylinder standing off the case
        g.add(mesh(disc(r * 0.55, 0.9), m.frame))
        const cap = mesh(new THREE.CylinderGeometry(r, r, 1.9, 28), m.frame)
        cap.rotation.x = Math.PI / 2
        cap.position.z = 1.85
        g.add(cap)
        const ring = mesh(new THREE.TorusGeometry(r * 0.72, r * 0.09, 8, 28), m.dark, false)
        ring.position.z = 2.82
        g.add(ring)
      } else g.add(mesh(slab(p.w, p.h, p.h / 2, 0.55, 0.15), m.frame))
      break
    case 'port': {
      // slim ports are pill-shaped; tall ones (USB-A, HDMI) are nearly square-cornered
      const hole = mesh(plate(p.w, p.h, p.h > 4 && p.w > p.h * 1.5 ? 0.7 : p.h / 2), m.dark, false)
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
      const mat = new THREE.MeshPhysicalMaterial({ color: '#e9edf2', metalness: 1, roughness: 0.3, alphaMap: logoTexture(p.text || ' '), transparent: true, depthWrite: false })
      const l = mesh(new THREE.PlaneGeometry(p.w, p.h), mat, false)
      l.position.z = 0.05
      g.add(l)
      break
    }
  }
  placeOnFace(g, body, p.face, p.x, p.y, p.rot)
  g.traverse((o) => (o.userData.partId = p.id))
  return g
}

function highlight(p: PlacedPart): THREE.LineLoop {
  const w = (p.w + 1.6) / 2
  const h = (p.h + 1.6) / 2
  const pts = [new THREE.Vector3(-w, -h, 0), new THREE.Vector3(w, -h, 0), new THREE.Vector3(w, h, 0), new THREE.Vector3(-w, h, 0)]
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: themeColor('accent', '#ff6b1a'), depthTest: false }))
  line.renderOrder = 20
  line.position.z = 2.6
  line.raycast = () => {}
  return line
}

// ------------------------------------------------------------ device

function materials(d: DeviceDesign, colorIndex: number): Mats {
  const b = d.body
  const alt = colorIndex >= 0 ? d.colors?.[colorIndex] : undefined
  return {
    frame: frameMaterial(b.frameMat, alt?.frame ?? b.frameColor),
    back: backMaterial(b.backMat, alt?.back ?? b.backColor, b.backFinish),
    glass: blackGlass(),
    lens: lensGlass(),
    core: lensCore(),
    dark: darkMatte(),
  }
}

/** A slab with a screen on its +Z face: a phone, a tablet, a watch case, or a laptop lid. */
function buildSlab(b: Body, wallpaper: number, m: Mats, screenOn = true): THREE.Group {
  const root = new THREE.Group()
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
  root.add(backPlate)
  if (!screenOn) return root

  const frontPlate = mesh(plate(capW, capH, capR), m.glass, false)
  frontPlate.position.z = b.thickness / 2 + 0.02
  const scr = screenRect(b)
  const tex = wallpaperTexture(wallpaper)
  const screenMat = new THREE.MeshPhysicalMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.45, roughness: 0.14, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.1 })
  const screen = mesh(plate(Math.min(scr.w, capW - 0.1), Math.min(scr.h, capH - 0.1), Math.min(scr.r, capR)), screenMat, false)
  screen.position.set(scr.cx, scr.cy, b.thickness / 2 + 0.04)
  root.add(frontPlate, screen)
  return root
}

const STRAP_LOOK: Record<string, THREE.MeshPhysicalMaterialParameters> = {
  silicone: { roughness: 0.85, metalness: 0 },
  nylon: { roughness: 1, metalness: 0, sheen: 0.6, sheenRoughness: 0.8 },
  leather: { roughness: 0.65, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.6 },
  steel: { roughness: 0.3, metalness: 1 },
  titanium: { roughness: 0.45, metalness: 0.9 },
}
export const STRAP_LENGTH = 40

/** Two bands that curl away behind the case, each built from short segments. */
function buildStrap(b: Body): THREE.Group {
  const g = new THREE.Group()
  const id = b.strap ?? 'silicone'
  const metal = id === 'steel' || id === 'titanium'
  const mat = new THREE.MeshPhysicalMaterial({ color: metal ? b.frameColor : (b.strapColor ?? '#1b1d21'), ...(STRAP_LOOK[id] ?? STRAP_LOOK.silicone) })
  const width = Math.min(b.width * 0.66, 28)
  const thick = metal ? 2.6 : 2.2
  const segments = metal ? 8 : 5
  const len = STRAP_LENGTH / segments
  for (const dir of [1, -1]) {
    let y = (dir * b.height) / 2 - dir * 1.5
    let z = -b.thickness * 0.2
    for (let i = 0; i < segments; i++) {
      const angle = ((i + 0.5) / segments) * 1.25
      const geo = slab(width, len + (metal ? -0.5 : 0.6), metal ? 0.6 : 1.2, thick, 0.4, 2)
      geo.translate(0, 0, -thick / 2)
      const seg = mesh(geo, mat)
      const cy = Math.cos(angle) * len
      const cz = -Math.sin(angle) * len
      seg.position.set(0, y + (dir * cy) / 2, z + cz / 2)
      // tilt each link so its length follows the curve away from the case
      seg.rotation.x = -dir * angle
      g.add(seg)
      y += dir * cy
      z += cz
    }
  }
  return g
}

function addParts(target: THREE.Object3D, parts: PlacedPart[], body: Body, m: Mats, selectedId: string | null | undefined, logoUrl?: string) {
  for (const p of parts) {
    const g = buildPart(p, body, m, logoUrl)
    if (p.id === selectedId) g.add(highlight(p))
    target.add(g)
  }
}

/** Lid angle past vertical, in radians. */
const LID_TILT = 0.3
const LID_SHARE = 0.38

/**
 * A laptop, open on the desk. The lid is a slab whose "front" is the screen;
 * the base carries the keyboard and the ports along its sides.
 */
function buildLaptop(d: DeviceDesign, m: Mats, selectedId: string | null | undefined, logoUrl?: string): THREE.Group {
  const b = d.body
  const root = new THREE.Group()
  const lidBody: Body = { ...b, thickness: Math.max(3, b.thickness * LID_SHARE) }
  const baseBody: Body = { ...b, thickness: b.thickness - lidBody.thickness, bezelTop: 0, bezelBottom: 0, bezelSide: 0 }
  const baseT = baseBody.thickness

  // ---- base: built as a slab facing +Z, then laid flat so its deck faces up
  const base = buildSlab(baseBody, 0, { ...m, back: m.frame }, false)
  const deck = new THREE.Group()
  const top = baseT / 2
  const keysW = b.width - 34
  const cols = Math.max(10, Math.floor(keysW / 19))
  const pitch = keysW / cols
  const rows = 5
  const blockH = rows * pitch * 0.94 + pitch * 0.5
  const blockY = b.height / 2 - 16 - blockH / 2
  const well = mesh(plate(keysW + 4, blockH + 4, 2.5), m.dark, false)
  well.position.set(0, blockY, top + 0.03)
  deck.add(well)
  const keyGeo = slab(pitch * 0.86, pitch * 0.8, 1.6, 0.9, 0.25, 2)
  const keyMat = new THREE.MeshPhysicalMaterial({ color: '#17191c', roughness: 0.6, metalness: 0 })
  const keys = new THREE.InstancedMesh(keyGeo, keyMat, cols * rows + cols)
  const mat4 = new THREE.Matrix4()
  let n = 0
  for (let row = 0; row < rows; row++) {
    const y = blockY + blockH / 2 - pitch * 0.5 - pitch * 0.5 - row * pitch * 0.94
    for (let c = 0; c < cols; c++) {
      // the bottom row has a wide space bar
      if (row === rows - 1 && c > 3 && c < cols - 4) continue
      mat4.makeTranslation(-keysW / 2 + pitch / 2 + c * pitch, y, top + 0.05)
      keys.setMatrixAt(n++, mat4)
    }
  }
  // function row: half-height keys along the top
  for (let c = 0; c < cols; c++) {
    mat4.makeScale(1, 0.5, 1).setPosition(-keysW / 2 + pitch / 2 + c * pitch, blockY + blockH / 2 - pitch * 0.28, top + 0.05)
    keys.setMatrixAt(n++, mat4)
  }
  keys.count = n
  keys.castShadow = true
  keys.receiveShadow = true
  deck.add(keys)
  const spaceW = (cols - 8) * pitch - pitch * 0.14
  const space = mesh(slab(spaceW, pitch * 0.8, 1.6, 0.9, 0.25, 2), keyMat)
  space.position.set(0, blockY + blockH / 2 - pitch - (rows - 1) * pitch * 0.94, top + 0.05)
  deck.add(space)
  const padH = Math.max(40, Math.min(90, b.height / 2 + blockY - blockH / 2 - 14))
  const pad = mesh(plate(Math.min(130, b.width * 0.38), padH, 3), new THREE.MeshPhysicalMaterial({ color: '#0e0f11', roughness: 0.25, metalness: 0, clearcoat: 0.4, transparent: true, opacity: 0.55 }), false)
  pad.position.set(0, blockY - blockH / 2 - 7 - padH / 2, top + 0.04)
  deck.add(pad)
  base.add(deck)
  addParts(base, d.parts.filter((p) => isSide(p.face)), baseBody, m, selectedId, logoUrl)
  base.rotation.x = -Math.PI / 2
  base.position.y = baseT / 2
  root.add(base)

  // ---- lid: hinged along the back edge of the base
  const hinge = new THREE.Group()
  hinge.position.set(0, baseT, -b.height / 2 + lidBody.thickness / 2)
  hinge.rotation.x = -LID_TILT
  const lid = buildSlab(lidBody, d.wallpaper, m)
  addParts(lid, d.parts.filter((p) => !isSide(p.face)), lidBody, m, selectedId, logoUrl)
  lid.position.y = b.height / 2
  hinge.add(lid)
  root.add(hinge)
  const barrel = mesh(new THREE.CylinderGeometry(baseT * 0.42, baseT * 0.42, b.width * 0.62, 20), m.dark)
  barrel.rotation.z = Math.PI / 2
  barrel.position.set(0, baseT * 0.62, -b.height / 2 + lidBody.thickness / 2)
  root.add(barrel)

  // centre the open laptop on the origin so it orbits nicely
  root.position.y = -b.height * 0.36
  const wrap = new THREE.Group()
  wrap.add(root)
  return wrap
}

/**
 * Builds the model for any device type.
 * colorIndex >= 0 previews one of the design's extra colourways.
 */
export function buildDevice(d: DeviceDesign, selectedId?: string | null, logoUrl?: string, colorIndex = -1): THREE.Group {
  const m = materials(d, colorIndex)
  if (d.type === 'laptop') return buildLaptop(d, m, selectedId, logoUrl)
  const root = buildSlab(d.body, d.wallpaper, m)
  if (d.type === 'watch') root.add(buildStrap(d.body))
  addParts(root, d.parts, d.body, m, selectedId, logoUrl)
  return root
}

/** Radius of a sphere that contains the device, for framing the camera. */
export function deviceRadius(d: DeviceDesign): number {
  const b = d.body
  if (d.type === 'laptop') return Math.hypot(b.width, b.height * 1.15) / 2
  if (d.type === 'watch') return Math.hypot(b.width, b.height + STRAP_LENGTH * 1.3) / 2
  return Math.hypot(b.width, b.height) / 2
}

/** Height of the lowest point of the model below its origin, for placing the floor. */
export function deviceBottom(d: DeviceDesign): number {
  const b = d.body
  if (d.type === 'laptop') return b.height * 0.36
  if (d.type === 'watch') return b.height / 2 + STRAP_LENGTH * 0.72
  return b.height / 2
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
