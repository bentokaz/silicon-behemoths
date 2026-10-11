// Builds a three.js model of a device from its DeviceDesign. Units are mm.
// A device is made of one or two solids ("carriers") that parts sit on. Each
// stands upright in its own space: X = width, Y = height, Z = thickness, with
// its front at +Z. A phone is one such solid; a laptop is a lid and a base.
import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { standInfo } from '../data/devices'
import { type Carrier, carrierBody, caseShape, designFace, edgeBevel, faceBasis, isEdge, mountOf, screenRect, standLift, standMount } from '../sim/geometry'
import type { Body, DeviceDesign, DeviceType, Face, PlacedPart } from '../sim/types'
import { themeColor } from '../store/theme'
import { backMaterial, blackGlass, contactMetal, darkMatte, darkPlastic, flashMaterial, frameMaterial, lensCore, lensGlass, lightMaterial, rubber } from './materials'
import { screenTexture } from './screens'

// ------------------------------------------------------------ shapes

/** Rounded rectangle centred on the origin. `radius` may be one number or [top-left, top-right, bottom-right, bottom-left]. */
export function roundedRectShape(w: number, h: number, radius: number | [number, number, number, number]): THREE.Shape {
  const lim = (v: number) => Math.max(0.01, Math.min(v, w / 2 - 0.001, h / 2 - 0.001))
  const [tl, tr, br, bl] = (typeof radius === 'number' ? [radius, radius, radius, radius] : radius).map(lim)
  const x = -w / 2
  const y = -h / 2
  const s = new THREE.Shape()
  s.moveTo(x + bl, y)
  s.lineTo(x + w - br, y)
  s.absarc(x + w - br, y + br, br, -Math.PI / 2, 0, false)
  s.lineTo(x + w, y + h - tr)
  s.absarc(x + w - tr, y + h - tr, tr, 0, Math.PI / 2, false)
  s.lineTo(x + tl, y + h)
  s.absarc(x + tl, y + h - tl, tl, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + bl)
  s.absarc(x + bl, y + bl, bl, Math.PI, 1.5 * Math.PI, false)
  return s
}

/** Flat plate with UVs stretched over its bounding box. */
function plate(w: number, h: number, r: number | [number, number, number, number]): THREE.ShapeGeometry {
  const g = new THREE.ShapeGeometry(roundedRectShape(w, h, r), 16)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5)
  return g
}

/** Rounded slab from z = 0 to z = depth. */
function slab(w: number, h: number, r: number, depth: number, bevel: number, segments = 3): THREE.BufferGeometry {
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
  // a wide bevel shows its facets unless it is shaded smoothly
  return b >= 1.5 ? smoothBevels(g, 2) : g
}

/** A slab lying flat: w along X, d along Z, resting on y = 0. */
function flatSlab(w: number, d: number, r: number, thick: number, bevel: number): THREE.BufferGeometry {
  const g = slab(w, d, r, thick, bevel, 3)
  g.rotateX(-Math.PI / 2)
  return g
}

function disc(radius: number, height: number): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, height, 48)
  g.rotateX(Math.PI / 2)
  g.translate(0, 0, height / 2)
  return g
}

/**
 * Half of a pebble: an upright shape with a w x d rounded outline seen from above,
 * one end rounded off and the other cut flat. Used for the two halves of an earbud
 * case. `flat: 'top'` spans y = -h/2..h/2 with the cut on top; `flat: 'bottom'`
 * spans y = 0..h with the cut underneath.
 */
function cup(w: number, d: number, r: number, h: number, bevel: number, flat: 'top' | 'bottom'): THREE.BufferGeometry {
  const b = Math.min(bevel, h - 0.5, d / 2 - 0.3, w / 2 - 0.3)
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w - 2 * b, d - 2 * b, Math.max(r - b, 0.05)), { depth: h - b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 8, curveSegments: 24 })
  // the extrusion is rounded at both ends; press the far end flat to make the cut
  const pos = g.attributes.position
  const cut = h - b
  for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > cut) pos.setZ(i, cut)
  if (flat === 'top') {
    g.rotateX(-Math.PI / 2)
    g.translate(0, b - h / 2, 0)
  } else {
    g.rotateX(Math.PI / 2)
    g.translate(0, h - b, 0)
  }
  return smoothBevels(g, 1)
}

/**
 * Shade an extruded shape's bevels smoothly while keeping hard edges hard.
 * `axis` is the direction it was extruded along (0 = x, 1 = y, 2 = z); the flat
 * end faces across it are reset afterwards, or the smoothing would shade them unevenly.
 */
function smoothBevels(g: THREE.BufferGeometry, axis: 0 | 1 | 2): THREE.BufferGeometry {
  const out = toCreasedNormals(g, 0.7)
  const pos = out.attributes.position
  const nor = out.attributes.normal
  out.computeBoundingBox()
  const lo = out.boundingBox!.min.getComponent(axis)
  const hi = out.boundingBox!.max.getComponent(axis)
  const at = (i: number) => (axis === 0 ? pos.getX(i) : axis === 1 ? pos.getY(i) : pos.getZ(i))
  for (let i = 0; i < pos.count; i += 3) {
    for (const [end, sign] of [[lo, -1], [hi, 1]]) {
      if (Math.abs(at(i) - end) > 1e-4 || Math.abs(at(i + 1) - end) > 1e-4 || Math.abs(at(i + 2) - end) > 1e-4) continue
      for (let k = i; k < i + 3; k++) nor.setXYZ(k, axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0)
    }
  }
  return out
}

// ------------------------------------------------------------ face mapping

function faceDepth(b: Body, face: Face): number {
  return face === 'front' || face === 'back' ? b.thickness / 2 : face === 'left' || face === 'right' ? b.width / 2 : b.height / 2
}

/** Position and orient an object on a face of a solid, so its local +Z points out of the face. */
function placeOnFace(obj: THREE.Object3D, solid: Body, type: DeviceType, face: Face, x: number, y: number, rotDeg: number) {
  const [X, Y, Z] = faceBasis(type, face).map((v) => new THREE.Vector3(v[0], v[1], v[2]))
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z))
  obj.position.copy(X.multiplyScalar(x)).add(Y.multiplyScalar(y)).add(Z.multiplyScalar(faceDepth(solid, face)))
  obj.rotateZ((rotDeg * Math.PI) / 180)
}

/**
 * Inverse of placeOnFace: which design face a surface point is on, and its face
 * coordinates. `point` and `normal` are in the space of the solid that was hit.
 * Null if parts cannot go on that surface.
 */
export function pointToFace(type: DeviceType, carrier: Carrier, point: THREE.Vector3, normal: THREE.Vector3): { face: Face; x: number; y: number } | null {
  const ax = Math.abs(normal.x)
  const ay = Math.abs(normal.y)
  const az = Math.abs(normal.z)
  const local: Face = az >= ax && az >= ay ? (normal.z > 0 ? 'front' : 'back') : ax >= ay ? (normal.x > 0 ? 'right' : 'left') : normal.y > 0 ? 'top' : 'bottom'
  const face = designFace(type, carrier, local)
  if (!face) return null
  const [X, Y] = faceBasis(type, local)
  return { face, x: point.x * X[0] + point.y * X[1] + point.z * X[2], y: point.x * Y[0] + point.y * Y[1] + point.z * Y[2] }
}

// ------------------------------------------------------------ textures

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

/** What the builders need to know besides the design itself. */
interface Ctx {
  type: DeviceType
  m: Mats
  selectedId?: string | null
  logoUrl?: string
  /** Below 1 for thumbnails: smaller screen artwork. */
  detail: number
  /** True if the front has a chin plate in the body colour below the screen. */
  chin: boolean
}

/** A bottom bezel this tall on a desktop is covered with a plate in the body colour. */
const CHIN_MIN = 18

function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadow = true): THREE.Mesh {
  const o = new THREE.Mesh(g, m)
  o.castShadow = shadow
  o.receiveShadow = true
  return o
}

/**
 * Flat details (holes, plates, logos) are stacked a hair above the surface they
 * sit on. The depth buffer is coarser on a large model seen from far away, so
 * the hair grows with the device: 1 for a phone, about 8 for a TV.
 */
let layerScale = 1
const lift = (n: number) => n * layerScale

/** Invisible plate that lets a part made of small pieces be picked anywhere inside its outline. */
function pickPlate(w: number, h: number): THREE.Mesh {
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
  o.position.z = lift(0.02)
  return o
}

/** The material a part on this face is seen against. */
function surfaceUnder(p: PlacedPart, c: Ctx): THREE.Material {
  const m = c.m
  if (c.type === 'earbuds') return m.back
  if (c.type === 'console') return p.face === 'front' ? m.back : m.frame
  if (c.type === 'laptop') return p.face === 'back' ? m.back : m.frame
  // a logo on the front of a screen sits on the chin if there is one, otherwise on the black bezel
  if (p.face === 'front') return c.type === 'desktop' && c.chin ? m.back : m.glass
  return p.face === 'back' ? m.back : m.frame
}
const luminance = (mat: THREE.Material) => {
  const col = (mat as THREE.MeshPhysicalMaterial).color
  return col ? 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b : 0
}

/** `solid` is the carrier the part sits on and `face` the face of that carrier. */
function buildPart(p: PlacedPart, solid: Body, face: Face, c: Ctx): THREE.Group {
  const g = new THREE.Group()
  const m = c.m
  const edge = isEdge(p.face, c.type)
  const r = Math.min(p.w, p.h) / 2
  switch (p.kind) {
    case 'camera': {
      if (p.face === 'front') {
        if (p.underDisplay) {
          const ring = mesh(new THREE.RingGeometry(r * 0.8, r, 32), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18 }), false)
          ring.position.z = lift(0.07)
          g.add(ring)
        } else {
          const hole = mesh(new THREE.CircleGeometry(r, 40), m.dark, false)
          hole.position.z = lift(0.07)
          const core = mesh(new THREE.CircleGeometry(r * 0.45, 32), m.core, false)
          core.position.z = lift(0.09)
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
      // on a large panel the raised plate is thicker, so it still reads as a step
      const t = Math.max(1.3, lift(0.4))
      g.add(mesh(slab(p.w, p.h, p.r ?? 6, t, Math.min(0.35 * Math.max(1, layerScale / 2), t / 2 - 0.05)), mat))
      g.userData.raise = t
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
      n.position.z = lift(0.06)
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
      } else {
        const t = edge ? 0.55 : Math.min(1.1, 0.4 + r * 0.08)
        g.add(mesh(slab(p.w, p.h, r, t, Math.min(0.15, t / 3)), m.frame))
        if (!edge && r >= 3) {
          // a face button gets a ring so it reads as a button, not a bump
          const ring = mesh(new THREE.RingGeometry(r * 0.52, r * 0.62, 40), m.dark, false)
          ring.position.z = t + lift(0.02)
          g.add(ring)
        }
      }
      break
    case 'port': {
      const round = Math.abs(p.w - p.h) < 0.6
      const squat = p.w < p.h * 1.6
      if (round) {
        // audio jack, aerial, optical: a hole with a metal collar
        const collar = mesh(new THREE.RingGeometry(r * 0.72, r, 32), m.frame, false)
        collar.position.z = lift(0.04)
        const hole = mesh(new THREE.CircleGeometry(r * 0.72, 32), m.dark, false)
        hole.position.z = lift(0.03)
        g.add(hole, collar)
        if (r > 3) {
          const pin = mesh(new THREE.CircleGeometry(r * 0.18, 16), contactMetal(), false)
          pin.position.z = lift(0.05)
          g.add(pin)
        }
        break
      }
      // slim ports are pill-shaped; tall ones (USB-A, HDMI, network, power) are nearly square-cornered
      const hole = mesh(plate(p.w, p.h, p.h > 4 ? Math.min(1.2, p.h * 0.14) : p.h / 2), m.dark, false)
      hole.position.z = lift(0.03)
      g.add(hole)
      if (p.text === 'power') {
        for (const dx of [-0.24, 0, 0.24]) {
          const pin = mesh(plate(p.w * 0.07, p.h * 0.4, 0.2), contactMetal(), false)
          pin.position.set(dx * p.w, dx === 0 ? p.h * 0.08 : -p.h * 0.08, lift(0.04))
          g.add(pin)
        }
      } else if (squat) {
        // a network socket: a row of contacts along the top
        const strip = mesh(plate(p.w * 0.6, p.h * 0.14, 0.2), contactMetal(), false)
        strip.position.set(0, p.h * 0.22, lift(0.04))
        g.add(strip)
      } else {
        const tongue = mesh(plate(p.w * 0.72, p.h * 0.22, 0.1), m.frame, false)
        tongue.position.z = lift(0.04)
        g.add(tongue)
      }
      break
    }
    case 'slot': {
      // a satin surround, so the slot shows up even on a black front panel
      const surround = mesh(plate(p.w + 2.4, p.h + 2.4, p.h / 2 + 1.2), new THREE.MeshPhysicalMaterial({ color: '#3d4046', metalness: 0.7, roughness: 0.4 }), false)
      surround.position.z = lift(0.03)
      const hole = mesh(plate(p.w, p.h, p.h / 2), m.dark, false)
      hole.position.z = lift(0.04)
      // the felt lips of a disc slot
      const lip = mesh(plate(p.w * 0.97, p.h * 0.3, p.h * 0.15), darkPlastic(), false)
      lip.position.z = lift(0.05)
      g.add(surround, hole, lip)
      break
    }
    case 'light': {
      const glow = mesh(plate(p.w, p.h, Math.min(p.w, p.h) / 2), lightMaterial(p.color ?? '#ffffff'), false)
      glow.position.z = lift(0.04)
      g.add(glow)
      break
    }
    case 'grille': {
      const hr = p.h / 2
      const count = Math.max(1, Math.floor(p.w / (hr * 3.2)))
      const span = (count - 1) * hr * 3.2
      const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(hr, 16), m.dark, count)
      const mat4 = new THREE.Matrix4()
      for (let i = 0; i < count; i++) dots.setMatrixAt(i, mat4.makeTranslation(-span / 2 + i * hr * 3.2, 0, lift(0.03)))
      dots.receiveShadow = true
      g.add(dots, pickPlate(p.w, p.h))
      break
    }
    case 'vent': {
      // slots cut into the shell, running along the longer side
      const along = p.w >= p.h
      const long = along ? p.w : p.h
      const short = along ? p.h : p.w
      const pitch = Math.min(7, Math.max(2.2, short / 6))
      const count = Math.max(1, Math.min(16, Math.floor((short + pitch * 0.5) / pitch)))
      const geo = plate(along ? long : pitch * 0.46, along ? pitch * 0.46 : long, pitch * 0.23)
      const slots = new THREE.InstancedMesh(geo, m.dark, count)
      const mat4 = new THREE.Matrix4()
      for (let i = 0; i < count; i++) {
        const o = (i - (count - 1) / 2) * pitch
        slots.setMatrixAt(i, mat4.makeTranslation(along ? 0 : o, along ? o : 0, lift(0.03)))
      }
      slots.receiveShadow = true
      g.add(slots, pickPlate(p.w, p.h))
      break
    }
    case 'fingerprint': {
      if (edge) {
        g.add(mesh(slab(p.w, p.h, p.h / 2, 0.25, 0.08), m.glass))
      } else if (c.type === 'laptop') {
        // the power key on the deck: a low dark key with a ring where the finger goes
        g.add(mesh(slab(p.w, p.h, 1.4, 0.7, 0.2, 2), new THREE.MeshPhysicalMaterial({ color: '#17191c', roughness: 0.6, metalness: 0 })))
        const ring = mesh(new THREE.RingGeometry(r * 0.5, r * 0.62, 32), m.frame, false)
        ring.position.z = 0.7 + lift(0.02)
        g.add(ring)
      } else if (p.face === 'front') {
        const ring = mesh(new THREE.RingGeometry(r * 0.82, r, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }), false)
        ring.position.z = lift(0.07)
        g.add(ring)
      } else {
        const ring = mesh(new THREE.RingGeometry(r * 0.88, r, 48), m.frame, false)
        ring.position.z = lift(0.05)
        const pad = mesh(new THREE.CircleGeometry(r * 0.88, 48), m.dark, false)
        pad.position.z = lift(0.04)
        g.add(pad, ring)
      }
      break
    }
    case 'logo': {
      if (p.useImage && c.logoUrl) {
        const l = mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshPhysicalMaterial({ map: imageTexture(c.logoUrl), transparent: true, alphaTest: 0.05, roughness: 0.5, metalness: 0 }), false)
        l.position.z = lift(0.05)
        g.add(l)
        break
      }
      // bright metal lettering on a dark surface, dark lettering on a pale one
      const pale = luminance(surfaceUnder(p, c)) > 0.5
      const mat = new THREE.MeshPhysicalMaterial({ color: pale ? '#3a3d43' : '#e9edf2', metalness: pale ? 0.6 : 1, roughness: pale ? 0.45 : 0.3, alphaMap: logoTexture(p.text || ' '), transparent: true, depthWrite: false })
      const l = mesh(new THREE.PlaneGeometry(p.w, p.h), mat, false)
      l.position.z = lift(0.05)
      g.add(l)
      break
    }
  }
  placeOnFace(g, solid, c.type, face, p.x, p.y, p.rot)
  g.traverse((o) => (o.userData.partId = p.id))
  return g
}

function highlight(p: PlacedPart): THREE.LineLoop {
  const w = (p.w + 1.6 * layerScale) / 2
  const h = (p.h + 1.6 * layerScale) / 2
  const pts = [new THREE.Vector3(-w, -h, 0), new THREE.Vector3(w, -h, 0), new THREE.Vector3(w, h, 0), new THREE.Vector3(-w, h, 0)]
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: themeColor('accent', '#ff6b1a'), depthTest: false }))
  line.renderOrder = 20
  line.position.z = 2.6
  line.raycast = () => {}
  return line
}

/** Adds the parts that belong on one of the device's solids. */
function addParts(target: THREE.Object3D, d: DeviceDesign, carrier: Carrier, c: Ctx) {
  const solid = carrierBody(d.body, d.type, carrier)
  const mine = d.parts.filter((p) => mountOf(d.type, p.face).carrier === carrier)
  // raised plates first, so anything placed on one can be lifted onto it
  const plates = mine.filter((p) => p.kind === 'island')
  for (const p of [...plates, ...mine.filter((q) => q.kind !== 'island')]) {
    const g = buildPart(p, solid, mountOf(d.type, p.face).face, c)
    if (p.kind !== 'island' && (d.type === 'desktop' || d.type === 'tv')) {
      // a port panel is a real step on something this size, so sockets inside it sit on top of it
      const under = plates.find((i) => i.face === p.face && Math.abs(p.x - i.x) <= i.w / 2 && Math.abs(p.y - i.y) <= i.h / 2)
      if (under) g.translateZ(Math.max(1.3, lift(0.4)))
    }
    if (p.id === c.selectedId) g.add(highlight(p))
    target.add(g)
  }
}

// ------------------------------------------------------------ slabs with screens

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

interface SlabOptions {
  carrier: Carrier
  /** Wallpaper index for the screen; leave out for a slab with no screen. */
  wallpaper?: number
  /** Cover a tall bottom bezel with a plate in the body colour (an all-in-one's chin). */
  chin?: boolean
}

/** A slab with a screen on its +Z face: a phone, a tablet, a watch case, a laptop lid, a display panel. */
function buildSlab(b: Body, c: Ctx, o: SlabOptions): THREE.Group {
  const m = c.m
  const root = new THREE.Group()
  const bevel = edgeBevel(b)
  const bodyGeo = slab(b.width, b.height, b.corner, b.thickness, bevel, b.edge === 'round' ? 10 : 3)
  bodyGeo.translate(0, 0, -b.thickness / 2)
  const body = mesh(bodyGeo, m.frame)
  body.userData.body = true
  body.userData.carrier = o.carrier
  root.add(body)

  const capW = b.width - 2 * bevel
  const capH = b.height - 2 * bevel
  const capR = Math.max(b.corner - bevel, 0.05)
  const backPlate = mesh(plate(capW, capH, capR), m.back, false)
  backPlate.rotation.y = Math.PI
  backPlate.position.z = -b.thickness / 2 - lift(0.02)
  root.add(backPlate)
  if (o.wallpaper === undefined) return root

  const frontPlate = mesh(plate(capW, capH, capR), m.glass, false)
  frontPlate.position.z = b.thickness / 2 + lift(0.02)
  root.add(frontPlate)

  // the lit area: the screen rectangle, kept inside the flat glass and its rounded corners
  const scr = screenRect(b)
  const x0 = Math.max(scr.cx - scr.w / 2, -capW / 2 + 0.05)
  const x1 = Math.min(scr.cx + scr.w / 2, capW / 2 - 0.05)
  const y0 = Math.max(scr.cy - scr.h / 2, -capH / 2 + 0.05)
  const y1 = Math.min(scr.cy + scr.h / 2, capH / 2 - 0.05)
  const sw = x1 - x0
  const sh = y1 - y0
  const inset = Math.min(x0 + capW / 2, capW / 2 - x1, y0 + capH / 2, capH / 2 - y1)
  const sr = Math.min(Math.max(scr.r, capR - inset), sw / 2, sh / 2)
  const tex = screenTexture(c.type, o.wallpaper, sw, sh, c.detail)
  const screenMat = new THREE.MeshPhysicalMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.45, roughness: 0.14, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.1 })
  const screen = mesh(plate(sw, sh, sr), screenMat, false)
  screen.position.set((x0 + x1) / 2, (y0 + y1) / 2, b.thickness / 2 + lift(0.04))
  root.add(screen)

  if (o.chin && b.bezelBottom >= CHIN_MIN) {
    const top = y0 - 1.2
    const bottom = -capH / 2
    const chin = mesh(plate(capW, top - bottom, [0.8, 0.8, capR, capR]), m.back, false)
    chin.position.set(0, (top + bottom) / 2, b.thickness / 2 + lift(0.03))
    root.add(chin)
  }
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

// ------------------------------------------------------------ laptop

/** Lid angle past vertical, in radians. */
const LID_TILT = 0.3

/**
 * A laptop, open on the desk. The lid is a slab whose front is the screen; the
 * base is a slab laid on its back, so its own front is the keyboard deck.
 */
function buildLaptop(d: DeviceDesign, c: Ctx): THREE.Group {
  const b = d.body
  const m = c.m
  const root = new THREE.Group()
  const lidBody = carrierBody(b, 'laptop', 'lid')
  const baseBody = carrierBody(b, 'laptop', 'base')
  const baseT = baseBody.thickness

  // ---- base: built as a slab facing +Z, then laid flat so its deck faces up
  const base = buildSlab(baseBody, { ...c, m: { ...m, back: m.frame } }, { carrier: 'base' })
  const deck = new THREE.Group()
  const top = baseT / 2
  const keysW = b.width - 34
  const cols = Math.max(10, Math.floor(keysW / 19))
  const pitch = keysW / cols
  const rows = 5
  const blockH = rows * pitch * 0.94 + pitch * 0.5
  const blockY = b.height / 2 - 16 - blockH / 2
  const well = mesh(plate(keysW + 4, blockH + 4, 2.5), m.dark, false)
  well.position.set(0, blockY, top + lift(0.03))
  deck.add(well)
  const keyGeo = slab(pitch * 0.86, pitch * 0.8, 1.6, 0.9, 0.25, 2)
  const keyMat = new THREE.MeshPhysicalMaterial({ color: '#17191c', roughness: 0.6, metalness: 0 })
  const keys = new THREE.InstancedMesh(keyGeo, keyMat, cols * rows + cols)
  const mat4 = new THREE.Matrix4()
  let n = 0
  for (let row = 0; row < rows; row++) {
    const y = blockY + blockH / 2 - pitch * 0.5 - pitch * 0.5 - row * pitch * 0.94
    for (let col = 0; col < cols; col++) {
      // the bottom row has a wide space bar
      if (row === rows - 1 && col > 3 && col < cols - 4) continue
      mat4.makeTranslation(-keysW / 2 + pitch / 2 + col * pitch, y, top + lift(0.05))
      keys.setMatrixAt(n++, mat4)
    }
  }
  // function row: half-height keys along the top
  for (let col = 0; col < cols; col++) {
    mat4.makeScale(1, 0.5, 1).setPosition(-keysW / 2 + pitch / 2 + col * pitch, blockY + blockH / 2 - pitch * 0.28, top + lift(0.05))
    keys.setMatrixAt(n++, mat4)
  }
  keys.count = n
  keys.castShadow = true
  keys.receiveShadow = true
  deck.add(keys)
  const spaceW = (cols - 8) * pitch - pitch * 0.14
  const space = mesh(slab(spaceW, pitch * 0.8, 1.6, 0.9, 0.25, 2), keyMat)
  space.position.set(0, blockY + blockH / 2 - pitch - (rows - 1) * pitch * 0.94, top + lift(0.05))
  deck.add(space)
  const padH = Math.max(40, Math.min(90, b.height / 2 + blockY - blockH / 2 - 14))
  const pad = mesh(plate(Math.min(130, b.width * 0.38), padH, 3), new THREE.MeshPhysicalMaterial({ color: '#0e0f11', roughness: 0.25, metalness: 0, clearcoat: 0.4, transparent: true, opacity: 0.55 }), false)
  pad.position.set(0, blockY - blockH / 2 - 7 - padH / 2, top + lift(0.04))
  deck.add(pad)
  // the keyboard is scenery: pointing at it means pointing at the deck underneath
  deck.traverse((o) => (o.raycast = () => {}))
  base.add(deck)
  addParts(base, d, 'base', c)
  base.rotation.x = -Math.PI / 2
  base.position.y = baseT / 2
  root.add(base)

  // ---- lid: hinged along the back edge of the base
  const hinge = new THREE.Group()
  hinge.position.set(0, baseT, -b.height / 2 + lidBody.thickness / 2)
  hinge.rotation.x = -LID_TILT
  const lid = buildSlab(lidBody, c, { carrier: 'lid', wallpaper: d.wallpaper })
  addParts(lid, d, 'lid', c)
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

// ------------------------------------------------------------ desktop and TV

/** The stand of a desktop or TV, in the space of its panel. The desk is at y = -height/2 - lift. */
function buildStand(b: Body, type: DeviceType, m: Mats): THREE.Group {
  const g = new THREE.Group()
  const id = standInfo(type, b.stand).id
  const liftH = standLift(b, type)
  const floor = -b.height / 2 - liftH
  const back = -b.thickness / 2
  // the frame material with the gloss taken off: a stand's flat tops face the lights and would glare
  const mat = (m.frame as THREE.MeshPhysicalMaterial).clone()
  mat.roughness = Math.max(mat.roughness, 0.62)
  mat.metalness = Math.min(mat.metalness, 0.3)
  mat.clearcoat = 0
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const o = mesh(geo, mat)
    o.position.set(x, y, z)
    g.add(o)
    return o
  }
  const mount = standMount(b, type)
  if (mount) {
    // a block bolted to the back, sunk a millimetre into the panel so no seam shows
    const block = slab(mount.w - 12, mount.h - 12, 6, 17, 2)
    add(block, 0, mount.y, back - 16)
    if (id === 'arm') {
      // a leaning plate from the block down to a foot that reaches forward under the screen
      const footT = 7
      const footD = Math.min(230, Math.max(150, b.height * 0.5))
      const drop = mount.y - (floor + footT)
      const lean = drop * 0.3
      const topZ = back - 9
      const len = Math.hypot(drop, lean) + 10
      const neck = slab((mount.w - 12) * 0.7, len, 4, 9, 2.5)
      neck.translate(0, 0, -4.5)
      const o = add(neck, 0, mount.y - drop / 2, topZ - lean / 2)
      o.rotation.x = Math.atan2(lean, drop)
      add(flatSlab(Math.max(190, b.width * 0.36), footD, 16, footT, 2.5), 0, floor, topZ - lean + footD * 0.5 - 22)
    } else {
      // a round column behind the block, on a disc
      const r = Math.min(18, Math.max(11, b.width * 0.022))
      const colZ = back - 16 - r + 3
      const colTop = mount.y + mount.h / 2 - 12
      const col = new THREE.CylinderGeometry(r, r, colTop - floor - 4, 32)
      add(col, 0, (colTop + floor + 4) / 2, colZ)
      const baseR = Math.min(150, Math.max(95, b.width * 0.2))
      const base = new THREE.CylinderGeometry(baseR, baseR + 1.5, 7, 64)
      add(base, 0, floor + 3.5, colZ + baseR * 0.4)
    }
    return g
  }
  if (id === 'pedestal') {
    // TV: a neck under the middle of the bottom edge, on a wide plate
    const neckD = Math.min(b.thickness - 2, 22)
    add(new THREE.BoxGeometry(b.width * 0.1, liftH + 6, neckD), 0, floor + (liftH + 6) / 2 + 2, 0)
    add(flatSlab(b.width * 0.4, Math.min(320, Math.max(180, b.height * 0.36)), 14, 8, 3), 0, floor, 0)
    return g
  }
  // two feet: a riser up into the bottom edge and a bar on the desk, front to back
  const riserW = Math.min(40, Math.max(14, b.width * 0.03))
  const riserD = Math.min(b.thickness - 2, 16)
  const barD = Math.min(300, Math.max(120, b.height * 0.34))
  for (const side of [-1, 1]) {
    const x = side * b.width * 0.36
    add(new THREE.BoxGeometry(riserW, liftH + 4, riserD), x, floor + (liftH + 4) / 2 + 2, 0)
    add(flatSlab(riserW, barD, riserW * 0.3, 7, 2), x, floor, 0)
  }
  return g
}

/** A display on a stand: an all-in-one desktop or a TV. */
function buildPanel(d: DeviceDesign, c: Ctx): THREE.Group {
  const b = d.body
  const root = buildSlab(b, c, { carrier: 'body', wallpaper: d.wallpaper, chin: d.type === 'desktop' })
  addParts(root, d, 'body', c)
  root.add(buildStand(b, d.type, c.m))
  // centre panel and stand together on the origin
  root.position.y = standLift(b, d.type) / 2
  const wrap = new THREE.Group()
  wrap.add(root)
  return wrap
}

// ------------------------------------------------------------ console

const CONSOLE_FEET = 2.6

/** A games console: a shell with a front panel set into it, a plain rear panel, and rubber feet. */
function buildConsole(d: DeviceDesign, c: Ctx): THREE.Group {
  const b = d.body
  const m = c.m
  const root = new THREE.Group()
  const small = Math.min(b.width, b.height)
  const bevel = b.edge === 'round' ? Math.min(6, Math.max(1.5, small * 0.07)) : 0.9
  const geo = slab(b.width, b.height, b.corner, b.thickness, bevel, b.edge === 'round' ? 8 : 3)
  geo.translate(0, 0, -b.thickness / 2)
  const shell = mesh(geo, m.frame)
  shell.userData.body = true
  shell.userData.carrier = 'body'
  root.add(shell)

  // front and rear panels, leaving a rim of shell around them
  const rim = small < 60 ? 1.6 : 3
  const pw = b.width - 2 * bevel - 2 * rim
  const ph = b.height - 2 * bevel - 2 * rim
  const pr = Math.max(b.corner - bevel - rim, 0.6)
  const front = mesh(plate(pw, ph, pr), m.back, false)
  front.position.z = b.thickness / 2 + lift(0.02)
  const rear = mesh(plate(pw, ph, pr), darkPlastic(), false)
  rear.rotation.y = Math.PI
  rear.position.z = -b.thickness / 2 - lift(0.02)
  root.add(front, rear)

  // four rubber feet under the flat part of the underside
  const fx = Math.max(6, b.width / 2 - Math.max(b.corner, 10) - 8)
  const fz = b.thickness / 2 - 24
  const pad = new THREE.CylinderGeometry(Math.min(6, fx - 1), Math.min(6, fx - 1), CONSOLE_FEET + 0.6, 24)
  const padMat = rubber()
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = mesh(pad, padMat)
      foot.position.set(sx * fx, -b.height / 2 - CONSOLE_FEET / 2 + 0.3, sz * fz)
      root.add(foot)
    }
  }
  addParts(root, d, 'body', c)
  return root
}

// ------------------------------------------------------------ earbuds

/** How far the case lid swings open, in radians. */
const LID_OPEN = 1.85
const BUD_HEAD = 7.6
const BUD_BEAN = 8.4

/**
 * One earbud, with the centre of its head at the origin, the ear tip pointing
 * along +Z and, on a stem bud, the stem hanging down. A seated stem bud is
 * built without its stem, which would be out of sight inside the case.
 */
function buildBud(style: 'stem' | 'bean', m: Mats, withStem = true): THREE.Group {
  const g = new THREE.Group()
  const tipMat = rubber('#d9d9dc')
  const aim = new THREE.Vector3(0, -0.3, 1).normalize()
  const along = (o: THREE.Object3D, dist: number) => {
    o.position.copy(aim).multiplyScalar(dist)
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim)
    g.add(o)
  }
  if (style === 'stem') {
    const head = mesh(new THREE.SphereGeometry(BUD_HEAD, 40, 28), m.back)
    head.scale.set(1, 0.95, 0.86)
    g.add(head)
    along(mesh(new THREE.CylinderGeometry(3.1, 3.9, 4.6, 28), m.back), 6.4)
    const tip = mesh(new THREE.SphereGeometry(4.9, 28, 20), tipMat)
    tip.scale.set(1, 0.62, 1)
    along(tip, 9.2)
    // a dark mesh over the outer microphone
    const patch = mesh(new THREE.SphereGeometry(BUD_HEAD * 1.012, 24, 12, Math.PI * 1.36, Math.PI * 0.28, Math.PI * 0.3, Math.PI * 0.16), m.dark, false)
    patch.scale.copy(head.scale)
    g.add(patch)
    if (withStem) {
      const stem = mesh(new THREE.CapsuleGeometry(3, 17, 8, 24), m.back)
      stem.position.set(0, -13.5, -1.6)
      const cap = mesh(new THREE.CylinderGeometry(3.04, 3.04, 1.4, 24), m.frame)
      cap.position.set(0, -21.5, -1.6)
      g.add(stem, cap)
    }
    return g
  }
  const body = mesh(new THREE.SphereGeometry(BUD_BEAN, 40, 28), m.back)
  body.scale.set(1.12, 0.92, 0.7)
  g.add(body)
  along(mesh(new THREE.CylinderGeometry(3.1, 4.2, 4.4, 28), m.back), 5.4)
  const tip = mesh(new THREE.SphereGeometry(4.3, 28, 20), tipMat)
  tip.scale.set(1, 0.62, 1)
  along(tip, 7.6)
  // a trim ring around the touch surface on the outside
  const ring = mesh(new THREE.TorusGeometry(4.6, 0.32, 10, 40), m.frame)
  ring.position.z = -BUD_BEAN * 0.7 + 1.05
  g.add(ring)
  return g
}

/** Where the loose bud lies, in front of the case: its reach in front of the case's front face. */
const BUD_REACH = 34

/**
 * Earbuds: a charging case standing open with one bud seated in it and the
 * other lying on the desk in front. Parts sit on the lower half of the case.
 */
function buildEarbuds(d: DeviceDesign, c: Ctx): THREE.Group {
  const b = d.body
  const m = c.m
  const cs = caseShape(b)
  const style = b.buds === 'bean' ? 'bean' : 'stem'
  const root = new THREE.Group()
  const inner = darkPlastic()
  const rim = 1.5

  // ---- lower shell, centred on the origin: the solid that parts sit on
  const shell = mesh(cup(b.width, b.thickness, cs.foot, cs.shell, cs.bevel, 'top'), m.back)
  shell.userData.body = true
  shell.userData.carrier = 'body'
  root.add(shell)
  const seam = cs.shell / 2
  const insert = (y: number, down: boolean) => {
    const o = mesh(plate(b.width - 2 * rim, b.thickness - 2 * rim, Math.max(cs.foot - rim, 0.5)), inner, false)
    o.rotation.x = down ? Math.PI / 2 : -Math.PI / 2
    o.position.y = y
    return o
  }
  root.add(insert(seam + lift(0.03), false))

  // ---- the two wells: one bud seated, one empty
  const headR = style === 'stem' ? BUD_HEAD : BUD_BEAN
  const wx = Math.min(Math.max(b.width * 0.24, headR + 1.2), b.width / 2 - headR - 0.6)
  const well = mesh(new THREE.CircleGeometry(headR * 0.86, 40), m.dark, false)
  well.rotation.x = -Math.PI / 2
  well.position.set(wx, seam + lift(0.05), 0)
  const wellRing = mesh(new THREE.RingGeometry(headR * 0.86, headR * 0.98, 40), m.frame, false)
  wellRing.rotation.x = -Math.PI / 2
  wellRing.position.set(wx, seam + lift(0.06), 0)
  root.add(well, wellRing)
  const seated = buildBud(style, m, false)
  if (style === 'stem') {
    // head above the deck, ear tip turned in towards the middle of the case
    seated.position.set(-wx, seam + BUD_HEAD * 0.95 * 0.34, 0)
    seated.rotation.y = Math.PI / 2
  } else {
    // lying in its well, touch surface up
    seated.position.set(-wx, seam + 1.6, 0)
    seated.rotation.x = Math.PI / 2
  }
  root.add(seated)

  // ---- lid, swung open on a hinge along the back of the seam
  const hinge = new THREE.Group()
  hinge.position.set(0, seam + 0.4, -b.thickness / 2)
  hinge.rotation.x = -LID_OPEN
  const lid = mesh(cup(b.width, b.thickness, cs.foot, cs.lid, cs.bevel, 'bottom'), m.back)
  lid.position.z = b.thickness / 2
  const lidInsert = insert(-lift(0.03), true)
  lidInsert.position.z = b.thickness / 2
  hinge.add(lid, lidInsert)
  root.add(hinge)
  const barrelW = Math.max(6, Math.min(b.width * 0.45, (b.width - 2 * cs.foot) * 0.9))
  const barrel = mesh(new THREE.CylinderGeometry(1.5, 1.5, barrelW, 20), m.frame)
  barrel.rotation.z = Math.PI / 2
  barrel.position.set(0, seam + 0.2, -b.thickness / 2 - 0.4)
  root.add(barrel)

  // ---- the other bud, lying on the desk in front
  const loose = buildBud(style, m)
  const floor = -cs.shell / 2
  const lz = b.thickness / 2 + BUD_REACH - 14
  if (style === 'stem') {
    // on its side: stem along the desk, ear tip up, resting on the head and the end of the stem
    const X = new THREE.Vector3(0, 0, -1)
    const Y = new THREE.Vector3(-1, 0, 0)
    const Z = new THREE.Vector3(0, 1, 0)
    loose.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z))
    loose.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.09))
    loose.position.set(b.width * 0.1, floor + BUD_HEAD * 0.86, lz)
  } else {
    loose.rotation.x = -Math.PI / 2
    loose.rotation.z = 0.5
    loose.position.set(b.width * 0.16, floor + BUD_BEAN * 0.7 + 0.3, lz)
  }
  root.add(loose)
  addParts(root, d, 'body', c)

  // centre the open case and the loose bud on the origin
  const f = earbudsFrame(b)
  root.position.set(0, -f.cy, -f.cz)
  const wrap = new THREE.Group()
  wrap.add(root)
  return wrap
}

/** Extent of the earbuds model around the centre of the case's lower shell. */
function earbudsFrame(b: Body) {
  const cs = caseShape(b)
  const top = cs.shell / 2 + b.thickness * Math.sin(LID_OPEN) + 1
  const bottom = -cs.shell / 2
  const rear = -b.thickness / 2 - cs.lid * Math.sin(LID_OPEN) - b.thickness * Math.abs(Math.cos(LID_OPEN))
  const front = b.thickness / 2 + BUD_REACH
  return { cy: (top + bottom) / 2, cz: (rear + front) / 2, height: top - bottom, depth: front - rear }
}

// ------------------------------------------------------------ device

/** Size of the model, for framing the camera and placing the desk. */
export function deviceFrame(d: DeviceDesign): { radius: number; bottom: number } {
  const b = d.body
  switch (d.type) {
    case 'laptop':
      return { radius: Math.hypot(b.width, b.height * 1.15) / 2, bottom: b.height * 0.36 }
    case 'watch':
      return { radius: Math.hypot(b.width, b.height + STRAP_LENGTH * 1.3) / 2, bottom: b.height / 2 + STRAP_LENGTH * 0.72 }
    case 'desktop':
    case 'tv': {
      const total = b.height + standLift(b, d.type)
      return { radius: Math.hypot(b.width, total) / 2, bottom: total / 2 }
    }
    case 'console':
      return { radius: Math.hypot(b.width, b.height, b.thickness) * 0.46, bottom: b.height / 2 + CONSOLE_FEET }
    case 'earbuds': {
      const f = earbudsFrame(b)
      return { radius: Math.hypot(b.width, f.height, f.depth) * 0.47, bottom: f.height / 2 }
    }
    default:
      return { radius: Math.hypot(b.width, b.height) / 2, bottom: b.height / 2 }
  }
}

/**
 * Builds the model for any device type.
 * colorIndex >= 0 previews one of the design's extra colourways; detail below
 * 1 is for thumbnails.
 */
export function buildDevice(d: DeviceDesign, selectedId?: string | null, logoUrl?: string, colorIndex = -1, detail = 1): THREE.Group {
  const c: Ctx = { type: d.type, m: materials(d, colorIndex), selectedId, logoUrl, detail, chin: d.type === 'desktop' && d.body.bezelBottom >= CHIN_MIN }
  layerScale = Math.min(12, Math.max(1, deviceFrame(d).radius / 87))
  switch (d.type) {
    case 'laptop':
      return buildLaptop(d, c)
    case 'desktop':
    case 'tv':
      return buildPanel(d, c)
    case 'console':
      return buildConsole(d, c)
    case 'earbuds':
      return buildEarbuds(d, c)
    default: {
      const root = buildSlab(d.body, c, { carrier: 'body', wallpaper: d.wallpaper })
      if (d.type === 'watch') root.add(buildStrap(d.body))
      addParts(root, d, 'body', c)
      return root
    }
  }
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
