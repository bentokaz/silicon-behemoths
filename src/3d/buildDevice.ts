// Builds a three.js model of a device from its DeviceDesign. Units are mm.
// A device is made of one or two solids ("carriers") that parts sit on. Each
// stands upright in its own space: X = width, Y = height, Z = thickness, with
// its front at +Z. A phone is one such solid; a laptop is a lid and a base.
import * as THREE from 'three'
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HINGES, MIC_ARRAYS, headStrap, standInfo } from '../data/devices'
import { type Carrier, GRIP, faceSize, partExtent, carrierBody, caseShape, consoleFans, consoleShape, coverScreen, designFace, edgeBevel, faceBasis, faceSink, handheldControls, headsetEyes, isCoverCam, isEdge, isFlip, isRing, laptopDeck, mountOf, screenRect, speakerShape, standLift, standMount, visorShape } from '../sim/geometry'
import { clamp } from '../sim/rng'
import { panelName } from '../sim/scoring'
import type { Body, DeviceDesign, DeviceType, Face, OsLook, PlacedPart, Specs } from '../sim/types'
import { themeColor } from '../store/theme'
import { WEAVE, backMaterial, blackGlass, contactMetal, darkMatte, darkPlastic, fabric, flashMaterial, frameMaterial, lensCore, lensGlass, lightMaterial, rubber } from './materials'
import { screenTexture } from './screens'
import { buildActioncam, buildDrone, buildEreader, buildRing, moreFrame } from './buildMore'
import { buildMouse, buildTower, towerLift } from './buildPc'

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
export function plate(w: number, h: number, r: number | [number, number, number, number]): THREE.ShapeGeometry {
  const g = new THREE.ShapeGeometry(roundedRectShape(w, h, r), 16)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5)
  return g
}

/** Rounded slab from z = 0 to z = depth. `r` may be one radius or one for each corner, as for roundedRectShape. */
export function slab(w: number, h: number, r: number | [number, number, number, number], depth: number, bevel: number, segments = 3): THREE.BufferGeometry {
  const b = Math.min(bevel, depth / 2 - 0.01, w / 2 - 0.02, h / 2 - 0.02)
  const inner = (v: number) => Math.max(v - b, 0.05)
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w - 2 * b, h - 2 * b, typeof r === 'number' ? inner(r) : [inner(r[0]), inner(r[1]), inner(r[2]), inner(r[3])]), {
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

export function disc(radius: number, height: number): THREE.CylinderGeometry {
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
export function smoothBevels(g: THREE.BufferGeometry, axis: 0 | 1 | 2): THREE.BufferGeometry {
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

function faceDepth(b: Body, face: Face, type: DeviceType): number {
  return (face === 'front' || face === 'back' ? b.thickness / 2 : face === 'left' || face === 'right' ? b.width / 2 : b.height / 2) - faceSink(b, face, type)
}

/** Position and orient an object on a face of a solid, so its local +Z points out of the face. */
export function placeOnFace(obj: THREE.Object3D, solid: Body, type: DeviceType, face: Face, x: number, y: number, rotDeg: number) {
  const [X, Y, Z] = faceBasis(type, face).map((v) => new THREE.Vector3(v[0], v[1], v[2]))
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z))
  obj.position.copy(X.multiplyScalar(x)).add(Y.multiplyScalar(y)).add(Z.multiplyScalar(faceDepth(solid, face, type)))
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
export function logoTexture(text: string): THREE.CanvasTexture {
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

export interface Mats {
  frame: THREE.Material
  back: THREE.Material
  glass: THREE.Material
  lens: THREE.Material
  core: THREE.Material
  dark: THREE.Material
}

/** What the builders need to know besides the design itself. */
export interface Ctx {
  type: DeviceType
  body: Body
  m: Mats
  specs: Specs
  selectedId?: string | null
  logoUrl?: string
  /** Below 1 for thumbnails: smaller screen artwork. */
  detail: number
  /** True if the front has a chin plate in the body colour below the screen. */
  chin: boolean
  /** The look of the operating system the device runs, for the screens that show its home screen. */
  look?: OsLook
}

/** A bottom bezel this tall on a desktop is covered with a plate in the body colour. */
const CHIN_MIN = 18

export function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadow = true): THREE.Mesh {
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
export const lift = (n: number) => n * layerScale
/** The same scale for code that draws on top of a finished model: handles, guides, demonstrations. */
export const layerScaleOf = (d: DeviceDesign) => Math.min(12, Math.max(1, deviceFrame(d).radius / 87))

/** Black holes vanish on a near-black shell, so there they get a paler surround. */
const isDim = (p: PlacedPart, c: Ctx) => luminance(surfaceUnder(p, c)) < 0.05
const satin = () => new THREE.MeshPhysicalMaterial({ color: '#3d4046', metalness: 0.7, roughness: 0.4 })
const recess = () => new THREE.MeshPhysicalMaterial({ color: '#2a2d33', metalness: 0.2, roughness: 0.7 })
/** The dark anodised barrel round a front camera, catching a little light at its bevel. */
const cameraRim = () => new THREE.MeshPhysicalMaterial({ color: '#4a4f58', metalness: 0.85, roughness: 0.3 })

/**
 * A cut-out hanging from the top edge of the screen (a notch, or a waterdrop when it is narrow and fully rounded),
 * centred on the origin with its top at `top`. Its lower corners are rounded by `r`; where it meets the edge it flares
 * out into the bezel with small inward fillets, as the cut in a real panel does, instead of a sharp inside corner.
 */
function notchGeometry(w: number, h: number, r: number, top: number): THREE.ShapeGeometry {
  const f = clamp(Math.min(w, h) * 0.22, 0.5, 1.6)
  const bottom = -h / 2
  const side = top - f
  const re = Math.max(0.05, Math.min(r, w / 2 - 0.001, side - bottom - 0.001))
  const s = new THREE.Shape()
  s.moveTo(-w / 2 - f, top)
  s.lineTo(w / 2 + f, top)
  s.absarc(w / 2 + f, side, f, Math.PI / 2, Math.PI, false)
  s.lineTo(w / 2, bottom + re)
  s.absarc(w / 2 - re, bottom + re, re, 0, -Math.PI / 2, true)
  s.lineTo(-w / 2 + re, bottom)
  s.absarc(-w / 2 + re, bottom + re, re, -Math.PI / 2, -Math.PI, true)
  s.lineTo(-w / 2, side)
  s.absarc(-w / 2 - f, side, f, 0, Math.PI / 2, false)
  return new THREE.ShapeGeometry(s, 24)
}

/** A round grille flat on a surface: a fan outlet or a woofer. Its +Z points out of the surface. */
export function roundGrille(r: number, blades = 0): THREE.Group {
  const g = new THREE.Group()
  const hole = mesh(new THREE.CircleGeometry(r * 0.94, 48), darkMatte(), false)
  hole.position.z = lift(0.03)
  const rim = mesh(new THREE.RingGeometry(r * 0.94, r, 48), satin(), false)
  rim.position.z = lift(0.04)
  g.add(hole, rim)
  const bars = recess()
  for (const k of [0.3, 0.52, 0.74]) {
    const ring = mesh(new THREE.RingGeometry(r * k, r * (k + 0.05), 48), bars, false)
    ring.position.z = lift(0.045)
    g.add(ring)
  }
  for (let i = 0; i < Math.max(blades, 3); i++) {
    // spokes holding the rings, or more of them for the blades of a fan seen through the grille
    const spoke = mesh(new THREE.PlaneGeometry(r * 0.07, r * 1.8), bars, false)
    spoke.rotation.z = (i / Math.max(blades, 3)) * Math.PI
    spoke.position.z = lift(0.045)
    g.add(spoke)
  }
  const hub = mesh(new THREE.CircleGeometry(r * 0.2, 32), satin(), false)
  hub.position.z = lift(0.05)
  g.add(hub)
  g.traverse((o) => (o.raycast = () => {}))
  return g
}

/** Invisible plate that lets a part made of small pieces be picked anywhere inside its outline. */
function pickPlate(w: number, h: number): THREE.Mesh {
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
  o.position.z = lift(0.02)
  return o
}

/** Stands in for a console's dark rear panel when asking how light a surface is. */
const REAR_PANEL = darkPlastic()
/** The black plastic of a display's port panel. */
const portPanel = () => new THREE.MeshPhysicalMaterial({ color: '#101114', metalness: 0, roughness: 0.58 })

/** The material a part on this face is seen against. */
function surfaceUnder(p: PlacedPart, c: Ctx): THREE.Material {
  const m = c.m
  if (c.type === 'earbuds') return m.back
  if (c.type === 'headset') return p.face === 'front' ? m.back : m.frame
  if (c.type === 'speaker') return p.face === 'back' ? REAR_PANEL : m.frame
  if (c.type === 'handheld') return p.face === 'front' ? m.glass : m.frame
  if (c.type === 'console') return p.face === 'front' ? m.back : p.face === 'back' ? REAR_PANEL : m.frame
  if (c.type === 'laptop') return p.face === 'back' ? m.back : m.frame
  // a logo on the front of a screen sits on the chin if there is one, otherwise on the black bezel
  if (p.face === 'front') return c.type === 'desktop' && c.chin ? m.back : m.glass
  return p.face === 'back' ? m.back : m.frame
}
const luminance = (mat: THREE.Material) => {
  const col = (mat as THREE.MeshPhysicalMaterial).color
  return col ? 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b : 0
}

/**
 * How lettering is finished, by how light the surface under it is (0 to 1, linear). The same rule for every device:
 * a dark steel inlay on a pale surface, a bright one on a mid-tone, and on a dark surface a pale matt print, because
 * polished metal there only mirrors the dark around it and cannot be read. The bright inlay is satin, not a mirror,
 * for the same reason: on a mid-grey lid lying flat under the lights a mirror showed as a darker grey than the lid.
 */
export function logoFinish(light: number): { color: string; metalness: number; roughness: number; finish: 'dark inlay' | 'bright inlay' | 'print' } {
  if (light > 0.5) return { color: '#3a3d43', metalness: 0.6, roughness: 0.45, finish: 'dark inlay' }
  if (light > 0.2) return { color: '#f1f3f6', metalness: 0.4, roughness: 0.5, finish: 'bright inlay' }
  return { color: '#aeb3ba', metalness: 0, roughness: 0.55, finish: 'print' }
}

/** `solid` is the carrier the part sits on and `face` the face of that carrier. */
export function buildPart(p: PlacedPart, solid: Body, face: Face, c: Ctx): THREE.Group {
  const g = new THREE.Group()
  const m = c.m
  const edge = isEdge(p.face, c.type)
  const r = Math.min(p.w, p.h) / 2
  switch (p.kind) {
    case 'camera': {
      // a camera in the screen, or in a foldable's cover screen, is a hole in glass rather than a lens standing proud
      if (p.face === 'front' || isCoverCam(c, p)) {
        if (p.underDisplay) {
          const ring = mesh(new THREE.RingGeometry(r * 0.8, r, 32), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18 }), false)
          ring.position.z = lift(0.07)
          g.add(ring)
        } else {
          // a hole through the display: black glass, the bevelled rim of the lens barrel, the lens and its coated core
          const hole = mesh(new THREE.CircleGeometry(r, 48), m.glass, false)
          hole.position.z = lift(0.07)
          const rim = mesh(new THREE.RingGeometry(r * 0.6, r * 0.8, 48), cameraRim(), false)
          rim.position.z = lift(0.08)
          const lens = mesh(new THREE.CircleGeometry(r * 0.6, 40), m.lens, false)
          lens.position.z = lift(0.08)
          const core = mesh(new THREE.CircleGeometry(r * 0.3, 32), m.core, false)
          core.position.z = lift(0.09)
          g.add(hole, rim, lens, core)
          if (c.type === 'headset') {
            // a tracking camera looks out through dark glass: a pale rim and a wide lens show where
            const rim = mesh(new THREE.RingGeometry(r * 0.8, r, 40), new THREE.MeshPhysicalMaterial({ color: '#6b7078', metalness: 0.8, roughness: 0.35 }), false)
            rim.position.z = lift(0.08)
            core.scale.setScalar(1.45)
            g.add(rim)
          }
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
      // a port panel on the back of a screen is moulded plastic: in mirror-black glass it caught the back light and showed white
      const black = c.type === 'desktop' || c.type === 'tv' ? portPanel() : m.glass
      const mat = p.finish === 'frame' ? m.frame : p.finish === 'black' ? black : m.back
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
      // the cut-out is the same black glass as the bezel, so where it meets the bezel the two are one surface
      const top = screenRect(solid).cy + screenRect(solid).h / 2
      const reach = top - (p.y + p.h / 2)
      const attached = p.face === 'front' && Math.abs(p.rot % 180) < 1 && reach < 0.8 && reach > -p.h / 2
      const n = mesh(attached ? notchGeometry(p.w, p.h, p.r ?? 3, top - p.y + 0.05) : plate(p.w, p.h, Math.min(p.r ?? 3, p.w / 2, p.h / 2)), m.glass, false)
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
      const pr = p.h > 4 ? Math.min(1.2, p.h * 0.14) : p.h / 2
      const hole = mesh(plate(p.w, p.h, pr), m.dark, false)
      hole.position.z = lift(0.03)
      g.add(hole)
      if (isDim(p, c)) {
        const rimW = Math.max(0.35, p.h * 0.09)
        const surround = mesh(plate(p.w + 2 * rimW, p.h + 2 * rimW, pr + rimW), satin(), false)
        surround.position.z = lift(0.025)
        g.add(surround)
      }
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
      if (isRing(p, c.type)) {
        // the ring of light round the top of a speaker, as wide and as deep as the part
        const ring = mesh(new THREE.RingGeometry(0.87, 1, 72), lightMaterial(p.color ?? '#ffffff'), false)
        ring.scale.set(p.w / 2, p.h / 2, 1)
        ring.position.z = lift(0.04)
        g.add(ring)
        break
      }
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
      if (isDim(p, c)) {
        const bed = mesh(plate(p.w + hr * 1.6, p.h + hr * 1.6, hr * 1.8), recess(), false)
        bed.position.z = lift(0.02)
        g.add(bed)
      }
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
      if (isDim(p, c)) {
        const bed = mesh(plate(p.w + pitch * 0.6, p.h + pitch * 0.6, pitch * 0.5), recess(), false)
        bed.position.z = lift(0.02)
        g.add(bed)
      }
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
      // the name of the finish is for the designer's panel, not for the material
      const { finish: _name, ...look } = logoFinish(luminance(surfaceUnder(p, c)))
      void _name
      const mat = new THREE.MeshPhysicalMaterial({ ...look, alphaMap: logoTexture(p.text || ' '), transparent: true, depthWrite: false })
      const l = mesh(new THREE.PlaneGeometry(p.w, p.h), mat, false)
      l.position.z = lift(0.05)
      g.add(l)
      break
    }
  }
  placeOnFace(g, solid, c.type, face, p.x, p.y, p.rot)
  g.traverse((o) => (o.userData.partId = p.id))
  // the studio moves whole parts about: this marks the group that is the part
  g.userData.partRoot = p.id
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

/** Adds the parts that belong on one of the device's solids, or only those of them that `only` picks. */
/**
 * The part as it is drawn. A part is kept on its face when the body changes, but not cut down to it: a grille made
 * for a wide console, on a body since made narrow, would hang out past both sides in mid-air. Here it is drawn no
 * larger than the face it is on, and kept within it.
 */
function fitted(p: PlacedPart, d: DeviceDesign): PlacedPart {
  const face = faceSize(d.body, p.face, d.type)
  const size = partExtent(p)
  const k = Math.min(1, (face.w * 0.96) / Math.max(size.w, 1e-6), (face.h * 0.96) / Math.max(size.h, 1e-6))
  if (k >= 1) return p
  const w = p.w * k
  const h = p.h * k
  const reachX = Math.max(0, face.w / 2 - (size.w * k) / 2)
  const reachY = Math.max(0, face.h / 2 - (size.h * k) / 2)
  return { ...p, w, h, x: Math.min(reachX, Math.max(-reachX, p.x)), y: Math.min(reachY, Math.max(-reachY, p.y)) }
}

export function addParts(target: THREE.Object3D, d: DeviceDesign, carrier: Carrier, c: Ctx, only?: (p: PlacedPart) => boolean) {
  const solid = carrierBody(d.body, d.type, carrier)
  const mine = d.parts.filter((p) => mountOf(d.type, p.face).carrier === carrier && (!only || only(p)))
  // raised plates first, so anything placed on one can be lifted onto it
  const plates = mine.filter((p) => p.kind === 'island')
  let n = 0
  // cut-outs next, lowest of the flat parts, so the cameras set in them always draw on top
  for (const placed of [...plates, ...mine.filter((q) => q.kind === 'notch'), ...mine.filter((q) => q.kind !== 'island' && q.kind !== 'notch')]) {
    const p = fitted(placed, d)
    const g = buildPart(p, solid, mountOf(d.type, p.face).face, c)
    // flat parts dropped on top of one another (a logo over a vent) would share a plane and flicker: each sits a hair above the last
    if (p.kind !== 'island') g.translateZ(lift(0.004) * (n++ % 6))
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
    frame: frameMaterial(b.frameMat, alt?.frame ?? b.frameColor, b.camo),
    back: backMaterial(b.backMat, alt?.back ?? b.backColor, b.backFinish, b.camo),
    glass: blackGlass(),
    lens: lensGlass(),
    core: lensCore(),
    dark: darkMatte(),
  }
}

/** What a screen's artwork says about its own panel. Thumbnails leave it out. */
export const panelInfoOf = (c: Ctx) => (c.detail < 1 ? undefined : { name: panelName(c.type, c.specs.panel) ?? '', hz: c.specs.refresh, lcd: c.specs.panel === 0, level: c.specs.panel })
/** A lit screen showing the given artwork. A better panel is brighter, and its anti-glare coating mirrors less of the room. */
export const litScreen = (tex: THREE.Texture, panel: number) =>
  new THREE.MeshPhysicalMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.3 + 0.036 * Math.min(panel, 8), roughness: 0.14, metalness: 0, clearcoat: 0.62 - 0.045 * Math.min(panel, 8), clearcoatRoughness: 0.1 })

export interface SlabOptions {
  carrier: Carrier
  /** Wallpaper index for the screen; leave out for a slab with no screen. */
  wallpaper?: number
  /** Cover a tall bottom bezel with a plate in the body colour (an all-in-one's chin). */
  chin?: boolean
  /** Corner radius of the screen, where it does not follow the corners of the body. */
  screenRadius?: number
}

/** A slab with a screen on its +Z face: a phone, a tablet, a watch case, a laptop lid, a display panel. */
export function buildSlab(b: Body, c: Ctx, o: SlabOptions): THREE.Group {
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
  backPlate.userData.tear = 'cover'
  root.add(backPlate)
  if (o.wallpaper === undefined) return root

  const frontPlate = mesh(plate(capW, capH, capR), m.glass, false)
  frontPlate.position.z = b.thickness / 2 + lift(0.02)
  frontPlate.userData.tear = 'screen'
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
  const sr = Math.min(o.screenRadius ?? Math.max(scr.r, capR - inset), sw / 2, sh / 2)
  // the interface names its own panel, and a better panel is a little brighter
  const panel = c.specs.panel
  const screen = mesh(plate(sw, sh, sr), litScreen(screenTexture(c.type, o.wallpaper, sw, sh, c.detail, panelInfoOf(c), c.look), panel), false)
  screen.position.set((x0 + x1) / 2, (y0 + y1) / 2, b.thickness / 2 + lift(0.04))
  screen.userData.tear = 'screen'
  root.add(screen)

  if (o.chin && b.bezelBottom >= CHIN_MIN) {
    const top = y0 - 1.2
    const bottom = -capH / 2
    const chin = mesh(plate(capW, top - bottom, [0.8, 0.8, capR, capR]), m.back, false)
    chin.position.set(0, (top + bottom) / 2, b.thickness / 2 + lift(0.03))
    chin.userData.tear = 'screen'
    root.add(chin)
  }
  return root
}

const METAL_FRAMES = ['aluminium', 'steel', 'titanium', 'liquidmetal']

/**
 * The plastic breaks a metal frame needs so its aerials can see out: a pair on
 * each long edge, and two more across the top for a satellite link.
 */
function antennaBands(b: Body, c: Ctx): THREE.Group {
  const g = new THREE.Group()
  const flat = b.thickness - 2 * edgeBevel(b) - 0.2
  if (!METAL_FRAMES.includes(b.frameMat) || flat < 1) return g
  const mat = new THREE.MeshPhysicalMaterial({ color: luminance(c.m.frame) > 0.25 ? '#7c8086' : '#5d626a', roughness: 0.75, metalness: 0 })
  const inset = Math.max(b.corner, 6) + 5
  const band = (x: number, y: number, across: boolean) => {
    const o = mesh(new THREE.BoxGeometry(across ? 1.3 : 0.1, across ? 0.1 : 1.3, flat), mat, false)
    o.position.set(x, y, 0)
    o.raycast = () => {}
    g.add(o)
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) band((sx * b.width) / 2, sy * (b.height / 2 - inset), false)
  if (c.specs.extras.includes('sat')) for (const sx of [-1, 1]) band(sx * (b.width / 2 - inset - 4), b.height / 2, true)
  return g
}

/**
 * What some special features show on the outside of a slab: the dark window of an infrared blaster in the top edge,
 * the second speaker's holes beside it, and the end of the stylus at the bottom edge.
 */
function featuresOnBody(b: Body, c: Ctx): THREE.Group {
  const g = new THREE.Group()
  const has = (id: string) => c.specs.extras.includes(id)
  const flat = Math.max(0.6, b.thickness - 2 * edgeBevel(b) - 0.4)
  const edgeX = Math.max(0, b.width / 2 - Math.max(b.corner, 6) - 6)
  if (has('ir')) {
    const win = mesh(new THREE.BoxGeometry(Math.min(6, b.width * 0.08), 0.3, Math.min(2.2, flat)), new THREE.MeshPhysicalMaterial({ color: '#1c0a0d', roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }), false)
    win.position.set(-edgeX * 0.55, b.height / 2 - 0.08, 0)
    g.add(win)
  }
  if (has('stereo')) {
    const hole = new THREE.CylinderGeometry(0.42, 0.42, 0.4, 10)
    const dark = new THREE.MeshPhysicalMaterial({ color: '#0b0c0e', roughness: 0.9 })
    for (let i = 0; i < 5; i++) {
      const o = mesh(hole, dark, false)
      o.position.set(edgeX * 0.5 + (i - 2) * 1.5, b.height / 2 - 0.12, 0)
      g.add(o)
    }
  }
  if (has('stylus')) {
    const pen = Math.min(5.5, b.width * 0.08, flat)
    const cap = mesh(new THREE.CylinderGeometry(pen / 2, pen / 2, 0.6, 20), new THREE.MeshPhysicalMaterial({ color: '#e7e8e4', roughness: 0.4, clearcoat: 0.3 }), false)
    cap.position.set(edgeX, -b.height / 2 + 0.15, 0)
    g.add(cap)
  }
  g.traverse((o) => (o.raycast = () => {}))
  return g
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
  const { w: keysW, h: blockH, y: blockY, cols, rows, pitch } = laptopDeck(b)
  // the keyboard chosen under Internals: flat membrane keys, backlit keys with light
  // between them, tall mechanical caps, or one sheet of glass with lit outlines
  const kb = d.specs.keyboard ?? 0
  const glassKeys = kb >= 3
  const keyT = kb === 2 ? 1.8 : glassKeys ? 0.3 : 0.9
  const cap = kb === 2 ? 0.8 : glassKeys ? 0.9 : 0.86
  const lit = kb === 1 || glassKeys
  const well = mesh(plate(keysW + 4, blockH + 4, 2.5), lit ? new THREE.MeshStandardMaterial({ color: '#0b0c0e', emissive: '#dfe8ff', emissiveIntensity: glassKeys ? 0.55 : 0.3, roughness: 0.8 }) : m.dark, false)
  well.position.set(0, blockY, top + lift(0.03))
  deck.add(well)
  const keyGeo = slab(pitch * cap, pitch * (cap - 0.06), 1.6, keyT, 0.25, 2)
  // glass keys are etched, not polished: a keyboard that mirrors the lamps would be hard to look at
  const keyMat = new THREE.MeshPhysicalMaterial({ color: glassKeys ? '#0b0c0f' : kb === 2 ? '#202327' : '#17191c', roughness: glassKeys ? 0.4 : kb === 2 ? 0.5 : 0.6, metalness: 0, clearcoat: glassKeys ? 0.25 : 0, clearcoatRoughness: 0.5 })
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
  const space = mesh(slab(spaceW, pitch * (cap - 0.06), 1.6, keyT, 0.25, 2), keyMat)
  space.position.set(0, blockY + blockH / 2 - pitch - (rows - 1) * pitch * 0.94, top + lift(0.05))
  deck.add(space)
  const padH = Math.max(40, Math.min(90, b.height / 2 + blockY - blockH / 2 - 14))
  const pad = mesh(plate(Math.min(130, b.width * 0.38), padH, 3), new THREE.MeshPhysicalMaterial({ color: '#0e0f11', roughness: 0.32, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.3, transparent: true, opacity: 0.55 }), false)
  pad.position.set(0, blockY - blockH / 2 - 7 - padH / 2, top + lift(0.04))
  deck.add(pad)
  // the keyboard is scenery: pointing at it means pointing at the deck underneath
  deck.traverse((o) => (o.raycast = () => {}))
  base.add(deck)
  addParts(base, d, 'base', c)
  base.rotation.x = -Math.PI / 2
  base.position.y = baseT / 2

  // ---- lid: hinged along the back edge of the base
  const hinge = new THREE.Group()
  hinge.position.set(0, baseT, -b.height / 2 + lidBody.thickness / 2)
  hinge.rotation.x = -LID_TILT
  const lid = buildSlab(lidBody, c, { carrier: 'lid', wallpaper: d.wallpaper })
  addParts(lid, d, 'lid', c)
  lid.position.y = b.height / 2
  hinge.add(lid)
  const barrel = mesh(new THREE.CylinderGeometry(baseT * 0.42, baseT * 0.42, b.width * 0.62, 20), m.dark)
  barrel.rotation.z = Math.PI / 2
  barrel.position.set(0, baseT * 0.62, -b.height / 2 + lidBody.thickness / 2)
  // everything hangs from a group at the middle of the shut laptop, so that it can be turned over about that point
  const lidT = lidBody.thickness
  const whole = baseT + lidT
  const over = new THREE.Group()
  over.position.y = whole / 2
  for (const o of [base, hinge, barrel]) {
    o.position.y -= whole / 2
    over.add(o)
  }
  root.add(over)

  // centre the open laptop on the origin so it orbits nicely
  root.position.y = -b.height * 0.36
  const wrap = new THREE.Group()
  wrap.add(root)
  const ease = (x: number) => {
    const k = Math.min(1, Math.max(0, x))
    return k * k * (3 - 2 * k)
  }
  // shut the lid, then turn the whole thing over onto it, lifting it clear of the desk as it goes
  wrap.userData.shut = (amount: number) => {
    const a = ease(amount / 0.5)
    const f = ease((amount - 0.45) / 0.55)
    hinge.rotation.x = -LID_TILT + (Math.PI / 2 + LID_TILT) * a
    hinge.position.set(0, baseT - whole / 2 + (lidT / 2) * a, -b.height / 2 + (lidT / 2) * (1 - a))
    barrel.visible = a < 0.98
    over.rotation.x = Math.PI * f
    over.position.y = whole / 2 + (b.height / 2) * Math.sin(Math.PI * f)
  }
  return wrap
}

// ------------------------------------------------------------ desktop and TV

/** A material with the gloss taken off, for surfaces that face straight up into the lights. */
function flatted(source: THREE.Material): THREE.MeshPhysicalMaterial {
  const mat = (source as THREE.MeshPhysicalMaterial).clone()
  mat.roughness = Math.max(mat.roughness, 0.62)
  mat.metalness = Math.min(mat.metalness, 0.3)
  mat.clearcoat = 0
  return mat
}

/** The stand of a desktop or TV, in the space of its panel. The desk is at y = -height/2 - lift. */
function buildStand(b: Body, type: DeviceType, m: Mats): THREE.Group {
  const g = new THREE.Group()
  const id = standInfo(type, b.stand).id
  const liftH = standLift(b, type)
  const floor = -b.height / 2 - liftH
  const back = -b.thickness / 2
  // a stand's flat tops face the lights and would glare
  const mat = flatted(m.frame)
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
      // a desk clamp, an upright post, two arm segments with joints, and a VESA plate behind the panel
      const clampZ = back - 120
      const postTop = floor + Math.max(150, b.height * 0.42)
      add(flatSlab(120, 110, 16, 10, 3), 0, floor, clampZ)
      add(new THREE.BoxGeometry(70, 40, 12), 0, floor + 30, clampZ - 52)
      add(new THREE.CylinderGeometry(12, 12, postTop - floor, 24), 0, (postTop + floor) / 2, clampZ)
      const joint = (y: number, z: number, r: number) => {
        const o = add(new THREE.CylinderGeometry(r, r, 30, 24), 0, y, z)
        o.rotation.z = Math.PI / 2
      }
      const link = (y0: number, z0: number, y1: number, z1: number) => {
        const o = add(new THREE.BoxGeometry(22, 14, Math.hypot(y1 - y0, z1 - z0)), 0, (y0 + y1) / 2, (z0 + z1) / 2)
        o.rotation.x = -Math.atan2(y1 - y0, z1 - z0)
      }
      const tipZ = back - 36
      const wristY = mount.y + 10
      const elbowY = postTop + 36
      const midZ = (clampZ + tipZ) / 2
      joint(postTop, clampZ, 18)
      link(postTop, clampZ, elbowY, midZ)
      joint(elbowY, midZ, 16)
      link(elbowY, midZ, wristY, tipZ)
      joint(wristY, tipZ, 15)
      // VESA plate: a neck to the block and four screw heads on a square
      add(new THREE.BoxGeometry(30, 30, 24), 0, wristY, back - 28)
      const vs = Math.min(mount.w, mount.h) * 0.35
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const h = add(new THREE.CylinderGeometry(4, 4, 4, 12), sx * vs, mount.y + sy * vs, back - 20)
        h.rotation.x = Math.PI / 2
      }
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
  // the bigger speaker systems show: a woofer in the back, and up-firing drivers along the top
  const sound = d.specs.speakers ?? 0
  if (sound === 2 || sound === 3) {
    const woofer = roundGrille(Math.min(64, b.height * 0.09))
    placeOnFace(woofer, b, d.type, 'back', -b.width * 0.3, d.type === 'tv' ? -b.height * 0.12 : b.height * 0.16, 0)
    // above anything placed on the back where it sits (a vent, a logo), so the two never share a plane
    woofer.translateZ(lift(0.04))
    woofer.userData.tear = 'cover'
    root.add(woofer)
  }
  if (sound === 3 && b.thickness >= 12) {
    for (const side of [-1, 1]) {
      const g = new THREE.Group()
      const w = b.width * 0.14
      const h = Math.min(b.thickness * 0.4, 14)
      const bed = mesh(plate(w + 3, h + 3, h * 0.4), recess(), false)
      bed.position.z = lift(0.02)
      const slot = mesh(plate(w, h, h * 0.35), darkMatte(), false)
      slot.position.z = lift(0.03)
      g.add(bed, slot)
      g.traverse((o) => (o.raycast = () => {}))
      placeOnFace(g, b, d.type, 'top', side * b.width * 0.28, 0, 0)
      root.add(g)
    }
  }
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
  const { bevel, rim, pw, ph } = consoleShape(b)
  const geo = slab(b.width, b.height, b.corner, b.thickness, bevel, b.edge === 'round' ? 8 : 3)
  geo.translate(0, 0, -b.thickness / 2)
  const shell = mesh(geo, m.frame)
  shell.userData.body = true
  shell.userData.carrier = 'body'
  root.add(shell)

  // front and rear panels, leaving a rim of shell around them
  const pr = Math.max(b.corner - bevel - rim, 0.6)
  const front = mesh(plate(pw, ph, pr), m.back, false)
  front.position.z = b.thickness / 2 + lift(0.02)
  const rear = mesh(plate(pw, ph, pr), darkPlastic(), false)
  rear.rotation.y = Math.PI
  rear.position.z = -b.thickness / 2 - lift(0.02)
  root.add(front, rear)

  // the cooling system shows at the back: one exhaust fan, or more of them
  for (const at of consoleFans(b, d.specs.cooling ?? 0)) {
    const fan = roundGrille(at.r, 7)
    placeOnFace(fan, b, 'console', 'back', at.x, at.y, 0)
    fan.translateZ(lift(0.02))
    root.add(fan)
  }

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
function buildBud(style: 'stem' | 'bean', m: Mats, withStem = true, anc = 0): THREE.Group {
  const g = new THREE.Group()
  // noise cancelling listens to the outside: a microphone slot on the outer face, two on the adaptive kinds
  const mic = (x: number, y: number, z: number) => {
    const o = mesh(new THREE.CircleGeometry(0.75, 20), m.dark, false)
    o.rotation.y = Math.PI
    o.position.set(x, y, z)
    g.add(o)
  }
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
      if (anc > 0) mic(0, -10, -4.63)
      if (anc >= 3) mic(0, -17, -4.63)
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
  if (anc > 0) mic(-1.6, 0, -BUD_BEAN * 0.7 - 0.02)
  if (anc >= 3) mic(1.6, 0, -BUD_BEAN * 0.7 - 0.02)
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
  const deck = insert(seam + lift(0.03), false)
  deck.userData.tear = 'guts'
  root.add(deck)

  // ---- the two wells: one bud seated, one empty
  const headR = style === 'stem' ? BUD_HEAD : BUD_BEAN
  const wx = Math.min(Math.max(b.width * 0.24, headR + 1.2), b.width / 2 - headR - 0.6)
  const well = mesh(new THREE.CircleGeometry(headR * 0.86, 40), m.dark, false)
  well.rotation.x = -Math.PI / 2
  well.position.set(wx, seam + lift(0.05), 0)
  const wellRing = mesh(new THREE.RingGeometry(headR * 0.86, headR * 0.98, 40), m.frame, false)
  wellRing.rotation.x = -Math.PI / 2
  wellRing.position.set(wx, seam + lift(0.06), 0)
  well.userData.tear = wellRing.userData.tear = 'guts'
  root.add(well, wellRing)
  const seated = buildBud(style, m, false, d.specs.anc ?? 0)
  if (style === 'stem') {
    // head above the deck, ear tip turned in towards the middle of the case
    seated.position.set(-wx, seam + BUD_HEAD * 0.95 * 0.34, 0)
    seated.rotation.y = Math.PI / 2
  } else {
    // lying in its well, touch surface up
    seated.position.set(-wx, seam + 1.6, 0)
    seated.rotation.x = Math.PI / 2
  }
  seated.userData.tear = 'guts'
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
  const loose = buildBud(style, m, true, d.specs.anc ?? 0)
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
  loose.userData.tear = 'bud'
  root.add(loose)
  addParts(root, d, 'body', c)

  // centre the open case and the loose bud on the origin
  const f = earbudsFrame(b)
  root.position.set(0, -f.cy, -f.cz)
  const wrap = new THREE.Group()
  wrap.add(root)
  return wrap
}

/** Where the loose earbud lies, in the space of the case's lower shell. */
export function looseBudAt(b: Body): THREE.Vector3 {
  const cs = caseShape(b)
  return new THREE.Vector3(b.width * (b.buds === 'bean' ? 0.16 : 0.1), -cs.shell / 2 + 7, b.thickness / 2 + BUD_REACH - 14)
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

// ------------------------------------------------------------ foldable

/**
 * One half of a foldable: a slab with rounded outer corners and a square end on
 * the hinge line at x = 0. `side` is -1 for the half to the left of the hinge.
 */
function halfSlab(b: Body, side: number, bevel: number): THREE.BufferGeometry {
  const hw = b.width / 2
  const geo = slab(hw + bevel, b.height, side < 0 ? [b.corner, 0.05, 0.05, b.corner] : [0.05, b.corner, b.corner, 0.05], b.thickness, bevel, b.edge === 'round' ? 10 : 3)
  geo.translate((side * (hw - bevel)) / 2, 0, -b.thickness / 2)
  // the slab overshoots the hinge line by the width of its bevel; pressing that flat leaves a square end
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) if (pos.getX(i) * side < 0) pos.setX(i, 0)
  return geo
}

/**
 * A foldable, built open and flat. A book's left-hand half swings round to lie
 * on the other, its cover screen outermost; a flip's upper half folds down over
 * its lower one. A spine turns with it at half the speed to cover the gap;
 * fold(0..1) on the returned group poses it.
 */
function buildFoldable(d: DeviceDesign, c: Ctx): THREE.Group {
  const m = c.m
  const D = d.body
  const flip = isFlip(D)
  // a flip is built as a book lying on its side: the halves, the screen and the spine are made in the book's own axes
  // and turned a quarter turn, while the solids that parts sit on, and their outer plates, keep the axes of the design
  const b: Body = flip ? { ...D, width: D.height, height: D.width, bezelSide: (D.bezelTop + D.bezelBottom) / 2, bezelTop: D.bezelSide, bezelBottom: D.bezelSide } : D
  const quarter = flip ? -Math.PI / 2 : 0
  const hinge = HINGES[d.specs.hinge ?? 0] ?? HINGES[0]
  const t = b.thickness
  const hw = b.width / 2
  const bevel = edgeBevel(b)
  // the hinge line: just in front of the glass, by half the gap the hinge leaves when shut
  const axis = t / 2 + hinge.gap / 2
  const wrap = new THREE.Group()
  const spin = new THREE.Group()
  spin.rotation.z = quarter
  const root = new THREE.Group()
  const right = new THREE.Group()
  const left = new THREE.Group()
  const leftPivot = new THREE.Group()
  const spinePivot = new THREE.Group()
  leftPivot.position.z = spinePivot.position.z = axis
  left.position.z = -axis
  leftPivot.add(left)
  // the fixed half goes in last: it is the one handles and demonstrations attach to
  root.add(leftPivot, spinePivot, right)
  spin.add(root)
  wrap.add(spin)
  const leftD = new THREE.Group()
  const rightD = new THREE.Group()
  leftD.rotation.z = rightD.rotation.z = -quarter
  left.add(leftD)
  right.add(rightD)

  const capW = hw - bevel
  const capH = b.height - 2 * bevel
  const capR = Math.max(b.corner - bevel, 0.05)
  const corners = (side: number): [number, number, number, number] => (side < 0 ? [capR, 0.05, 0.05, capR] : [0.05, capR, capR, 0.05])
  // the lit area, kept inside the flat glass as on any slab
  const scr = screenRect(b)
  const x1 = Math.min(scr.w / 2, capW - 0.05)
  const y0 = Math.max(scr.cy - scr.h / 2, -capH / 2 + 0.05)
  const y1 = Math.min(scr.cy + scr.h / 2, capH / 2 - 0.05)
  const sh = y1 - y0
  const inset = Math.min(capW - x1, y0 + capH / 2, capH / 2 - y1)
  const sr = Math.min(Math.max(scr.r, capR - inset), x1, sh / 2)
  const panel = c.specs.panel
  // the picture is drawn upright for the design, whichever way the halves lie
  const inner = litScreen(screenTexture('foldable', d.wallpaper, flip ? sh : 2 * x1, flip ? 2 * x1 : sh, c.detail, panelInfoOf(c), c.look), panel)
  for (const side of [-1, 1]) {
    const half = side < 0 ? left : right
    const solid = halfSlab(b, side, bevel)
    if (flip) solid.rotateZ(quarter)
    const body = mesh(solid, m.frame)
    body.userData.body = true
    body.userData.carrier = 'body'
    body.userData.half = side
    ;(side < 0 ? leftD : rightD).add(body)
    const glass = mesh(plate(capW, capH, corners(side)), m.glass, false)
    glass.position.set((side * capW) / 2, 0, t / 2 + lift(0.02))
    // each half shows its half of the one picture
    const geo = plate(x1, sh, side < 0 ? [sr, 0.02, 0.02, sr] : [0.02, sr, sr, 0.02])
    const uv = geo.attributes.uv
    const pos = geo.attributes.position
    for (let i = 0; i < uv.count; i++) {
      const across = (pos.getX(i) + (side * x1) / 2 + x1) / (2 * x1)
      const up = pos.getY(i) / sh + 0.5
      if (flip) uv.setXY(i, up, 1 - across)
      else uv.setXY(i, across, up)
    }
    const screen = mesh(geo, inner, false)
    screen.position.set((side * x1) / 2, (y0 + y1) / 2, t / 2 + lift(0.04))
    glass.userData.tear = screen.userData.tear = 'screen'
    half.add(glass, screen)
  }

  // ---- the outsides, in the axes of the design: `folding` is the half that swings over
  const outer = (folding: boolean, mat: THREE.Material) => {
    const pw = flip ? D.width - 2 * bevel : D.width / 2 - bevel
    const ph = flip ? D.height / 2 - bevel : D.height - 2 * bevel
    // seen from behind, so left and right are the other way round
    const r: [number, number, number, number] = flip ? (folding ? [capR, capR, 0.05, 0.05] : [0.05, 0.05, capR, capR]) : folding ? [0.05, capR, capR, 0.05] : [capR, 0.05, 0.05, capR]
    const o = mesh(plate(pw, ph, r), mat, false)
    o.rotation.y = Math.PI
    o.position.set(flip ? 0 : ((folding ? -1 : 1) * pw) / 2, flip ? ((folding ? 1 : -1) * ph) / 2 : 0, -t / 2 - lift(0.02))
    o.userData.tear = 'cover'
    return o
  }
  // the fixed half has a plain back: a book's cameras are there
  rightD.add(outer(false, m.back))
  // the half that folds over carries the cover screen: all glass on a book, a window in the back of a flip unless it fills it
  const cov = coverScreen(D)
  const glazed = !flip || (D.cover ?? 1) >= 2
  leftD.add(outer(true, glazed ? m.glass : m.back))
  if (!glazed) {
    const win = mesh(plate(cov.w + 3, cov.h + 3, cov.r + 1.5), m.glass, false)
    win.rotation.y = Math.PI
    win.position.set(-cov.x, cov.y, -t / 2 - lift(0.03))
    win.userData.tear = 'cover'
    leftD.add(win)
  }
  const cover = mesh(plate(cov.w, cov.h, cov.r), litScreen(screenTexture('phone', d.wallpaper, cov.w, cov.h, c.detail, panelInfoOf(c), c.look), panel), false)
  // a flip's cover screen is read with the phone shut and its hinge uppermost, so it is drawn the other way up
  if (flip) cover.rotation.x = Math.PI
  else cover.rotation.y = Math.PI
  cover.position.set(-cov.x, cov.y, -t / 2 - lift(0.04))
  cover.userData.tear = 'cover'
  leftD.add(cover)

  // the crease down the middle of the inner screen: deeper with a simpler hinge, gone with the best
  const crease = new THREE.Group()
  const creaseW = [3.4, 2.2, 1.2, 0][d.specs.hinge ?? 0] ?? 0
  if (creaseW > 0) {
    ;[[1, 0.07], [0.45, 0.1], [0.12, 0.16]].forEach(([k, opacity], i) => {
      const o = mesh(new THREE.PlaneGeometry(creaseW * k, sh), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity, depthWrite: false }), false)
      o.position.set(0, (y0 + y1) / 2, t / 2 + lift(0.05 + 0.005 * i))
      o.raycast = () => {}
      crease.add(o)
    })
  }
  crease.userData.tear = 'screen'
  right.add(crease)

  // the spine: a rounded cover that lies hidden inside the two halves while they are open
  const spineW = 2 * t + hinge.gap
  const lip = hinge.gap / 2 + 0.15
  const reach = t * 0.92 + hinge.gap / 2
  const section = new THREE.Shape()
  section.moveTo(-spineW / 2, lip)
  section.lineTo(spineW / 2, lip)
  section.absellipse(0, lip, spineW / 2, reach - lip, 0, Math.PI, false)
  const length = b.height - 1.2
  const spineGeo = new THREE.ExtrudeGeometry(section, { depth: length, bevelEnabled: false, curveSegments: 20 })
  spineGeo.rotateX(-Math.PI / 2)
  spineGeo.translate(0, -length / 2, 0)
  const spine = mesh(smoothBevels(spineGeo, 1), m.frame)
  spine.raycast = () => {}
  spine.userData.tear = 'hide'
  spinePivot.add(spine)

  // each part goes with the half it sits on
  const folding = (p: PlacedPart) =>
    flip ? (p.face === 'top' ? true : p.face === 'bottom' ? false : p.face === 'left' || p.face === 'right' ? p.x > 0 : p.y > 0) : p.face === 'left' ? true : p.face === 'right' ? false : p.face === 'back' ? p.x > 0 : p.x < 0
  addParts(leftD, d, 'body', c, folding)
  addParts(rightD, d, 'body', c, (p) => !folding(p))

  wrap.userData.fold = (amount: number) => {
    const k = Math.min(1, Math.max(0, amount))
    leftPivot.rotation.y = Math.PI * k
    spinePivot.rotation.y = (Math.PI * k) / 2
    // keep what is left of it in the middle of the view
    root.position.set((-hw / 2) * k, 0, -axis * k)
    crease.visible = k < 0.004
  }
  return wrap
}

/** Pose a foldable between open (0) and shut (1). Does nothing to any other model. */
export function setFold(model: THREE.Object3D, amount: number) {
  ;(model.userData.fold as ((k: number) => void) | undefined)?.(amount)
}

// ------------------------------------------------------------ headset

/** How far a headset's band loops behind the point where it meets the visor. */
const BAND_REACH = 168

/**
 * A band of rectangular section swept along a path. `side` is the direction of
 * its width, and must be at right angles to the path all the way along.
 */
function sweep(path: THREE.Vector3[], side: THREE.Vector3, width: number, thick: number): THREE.BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const t = new THREE.Vector3()
  const n = new THREE.Vector3()
  const p = new THREE.Vector3()
  // each face: its two edges as [across, along the width] offsets, and which way it looks
  const faces: [number, number, number, number, number, number][] = [
    [1, -1, 1, 1, 1, 0],
    [-1, 1, -1, -1, -1, 0],
    [1, 1, -1, 1, 0, 1],
    [-1, -1, 1, -1, 0, -1],
  ]
  faces.forEach(([a0, s0, a1, s1, fn, fs], f) => {
    let run = 0
    path.forEach((at, k) => {
      t.copy(path[Math.min(k + 1, path.length - 1)]).sub(path[Math.max(k - 1, 0)]).normalize()
      n.crossVectors(t, side).normalize()
      if (k > 0) run += at.distanceTo(path[k - 1])
      for (const [a, s] of [[a0, s0], [a1, s1]]) {
        p.copy(at).addScaledVector(n, (a * thick) / 2).addScaledVector(side, (s * width) / 2)
        pos.push(p.x, p.y, p.z)
        nor.push(n.x * fn + side.x * fs, n.y * fn + side.y * fs, n.z * fn + side.z * fs)
        uv.push(run / WEAVE, a === a0 && s === s0 ? 0 : (fs ? thick : width) / WEAVE)
      }
      if (k === 0) return
      const v = f * path.length * 2 + (k - 1) * 2
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3)
    })
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** Press everything beyond a plane across Z flat onto it, so that an extrusion ends there in a flat face. */
function pressFlat(g: THREE.BufferGeometry, z: number, above: boolean) {
  const pos = g.attributes.position
  const nor = g.attributes.normal
  for (let i = 0; i < pos.count; i++) {
    if (above ? pos.getZ(i) <= z : pos.getZ(i) >= z) continue
    pos.setZ(i, z)
    nor?.setXYZ(i, 0, 0, above ? 1 : -1)
  }
}

/** The outline of a headset seen from behind: a rounded rectangle with an arch cut up into the middle of its lower edge, for the nose. */
function visorProfile(w: number, h: number, r: number, nose: { w: number; h: number; f: number }): THREE.Shape {
  const rr = Math.max(0.01, Math.min(r, w / 2 - 0.001, h / 2 - 0.001))
  const x = -w / 2
  const y = -h / 2
  const nw = Math.min(nose.w / 2, w / 2 - rr - nose.f - 1)
  const s = new THREE.Shape()
  s.moveTo(x + rr, y)
  if (nw > 2 && nose.h > 1) {
    s.lineTo(-nw - nose.f, y)
    s.bezierCurveTo(-nw, y, -nw, y + nose.h, 0, y + nose.h)
    s.bezierCurveTo(nw, y + nose.h, nw, y, nw + nose.f, y)
  }
  s.lineTo(x + w - rr, y)
  s.absarc(x + w - rr, y + rr, rr, -Math.PI / 2, 0, false)
  s.lineTo(x + w, y + h - rr)
  s.absarc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2, false)
  s.lineTo(x + rr, y + h)
  s.absarc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + rr)
  s.absarc(x + rr, y + rr, rr, Math.PI, 1.5 * Math.PI, false)
  return s
}

/** The measurements of a headset that both its model and its framing need. */
function headsetFrame(b: Body, specs: Specs) {
  const id = headStrap(b.strap).id
  const soft = id === 'soft'
  const pack = id === 'pack'
  // thickness and height of the band, and the height of whatever sits at the back of the head
  const thick = soft ? 3 : 5
  const tall = soft ? 26 : 22
  const rearH = pack ? 52 : soft ? tall : 46
  const z0 = -b.thickness / 2 + 14
  // the band leans down so that its back rests on the desk
  const tilt = Math.asin(Math.min(0.4, Math.max(0, (b.height / 2 - rearH / 2 - 0.4) / BAND_REACH)))
  const rearY = -BAND_REACH * Math.sin(tilt)
  const rearZ = z0 - BAND_REACH * Math.cos(tilt)
  const wands = (specs.keyboard ?? 0) > 0
  // controllers with tracking rings lie side by side; the others are turned in towards each other
  const ringed = specs.keyboard === 1
  const top = b.height / 2 + (soft ? 34 : 0)
  const front = b.thickness / 2 + (wands ? (ringed ? 136 : 80) : 0)
  const rear = rearZ - (pack ? 25 : soft ? 4 : 15)
  return { soft, pack, thick, tall, z0, tilt, rearY, rearZ, wands, ringed, cy: (top - b.height / 2) / 2, cz: (front + rear) / 2, height: top + b.height / 2, depth: front - rear }
}

/** One hand controller, lying on the desk with its head towards +Z. The origin is on the desk under its middle. */
function buildWand(level: number, m: Mats): THREE.Group {
  const g = new THREE.Group()
  const shell = flatted(m.frame)
  const dark = darkPlastic()
  // the grip tapers away from the head and leans down so that its end rests on the desk
  const grip = new THREE.CylinderGeometry(12.2, 9.6, 64, 32)
  grip.rotateX(Math.PI / 2)
  const handle = mesh(grip, shell)
  handle.position.set(0, 12.2, -22)
  handle.rotation.x = -0.081
  const end = mesh(new THREE.SphereGeometry(9.6, 28, 20), shell)
  end.position.set(0, 9.6, -53.9)
  const head = mesh(new THREE.SphereGeometry(17, 40, 28), shell)
  head.scale.set(1.1, 0.75, 1.1)
  head.position.set(0, 13.6, 22)
  // the trigger under the forefinger
  const trigger = mesh(slab(11, 8, 3, 6, 1.6, 3), dark)
  trigger.position.set(0, 9.5, 36.2)
  g.add(handle, end, head, trigger)
  // the thumb plate on top of the head: a stick and two buttons
  const top = 13.6 + 12.75
  const plateTop = mesh(new THREE.CylinderGeometry(10.5, 10.5, 1.6, 40), dark)
  plateTop.position.set(0, top - 0.9, 22)
  const stem = mesh(new THREE.CylinderGeometry(2, 2, 4, 20), dark)
  stem.position.set(-3, top + 1.6, 19.5)
  const cap = mesh(new THREE.CylinderGeometry(4.6, 4.6, 1.8, 28), rubber('#1b1d21'))
  cap.position.set(-3, top + 3.8, 19.5)
  g.add(plateTop, stem, cap)
  for (const [x, z] of [[4.6, 26.5], [5.6, 19]]) {
    const key = mesh(new THREE.CylinderGeometry(2.3, 2.3, 1.2, 20), level >= 3 ? satin() : rubber('#2a2d33'))
    key.position.set(x, top + 0.3, z)
    g.add(key)
  }
  if (level === 1) {
    // older controllers carry a ring of tracking lights that the headset's cameras watch
    const ring = mesh(new THREE.TorusGeometry(27, 2.6, 14, 56), shell)
    ring.rotation.x = Math.PI / 2 - 0.5
    ring.position.set(0, 19.5, 36)
    g.add(ring)
  } else {
    // self-tracked ones have cameras of their own instead: a trim ring round the thumb plate
    const trim = mesh(new THREE.TorusGeometry(10.9, 0.7, 10, 48), level >= 3 ? lightMaterial('#7fc4ff') : satin())
    trim.rotation.x = Math.PI / 2
    trim.position.set(0, top - 0.2, 22)
    g.add(trim)
  }
  g.traverse((o) => (o.raycast = () => {}))
  return g
}

/**
 * A headset on the desk: the visor, which is the solid that parts sit on, with
 * the face cushion and lenses behind it, the band looping back to rest on the
 * desk, and any controllers lying in front.
 */
function buildHeadset(d: DeviceDesign, c: Ctx): THREE.Group {
  const b = d.body
  const m = c.m
  const v = visorShape(b)
  const f = headsetFrame(b, d.specs)
  const w = b.width
  const h = b.height
  const depth = b.thickness
  const root = new THREE.Group()
  const scenery = new THREE.Group()

  // ---- visor: a front section that carries the front plate, and a rear one cut away for the nose and bored for the lenses
  const round = b.edge === 'round'
  const kind = d.specs.optics ?? 0
  const waveguide = kind >= 4
  const { gw, gh, wall, lr, apart } = headsetEyes(b, kind)
  const nose = { w: clamp(w * 0.2, 30, 40), h: Math.min(clamp(h * 0.26, 18, 28), h / 2 - lr * 0.86), f: 6 }
  const rearD = clamp(depth * 0.38, 16, 34)
  const split = -depth / 2 + rearD
  const frontGeo = slab(w, h, b.corner, depth - rearD + v.bevel, v.bevel, round ? 8 : 3)
  pressFlat(frontGeo, v.bevel, false)
  frontGeo.translate(0, 0, split - v.bevel)
  const bv = Math.min(v.bevel, rearD / 2)
  const rearShape = visorProfile(w - 2 * bv, h - 2 * bv, Math.max(b.corner - bv, 0.05), { w: nose.w + 2 * bv, h: nose.h + bv, f: nose.f })
  for (const sx of [-1, 1]) {
    const bore = waveguide ? new THREE.Path(roundedRectShape(lr * 2.1, lr * 1.7, lr * 0.3).getPoints(6).map((p) => new THREE.Vector2(p.x + sx * apart, p.y))) : new THREE.Path().absarc(sx * apart, 0, lr, 0, Math.PI * 2, true)
    rearShape.holes.push(bore)
  }
  const rearRaw = new THREE.ExtrudeGeometry(rearShape, { depth: rearD - bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: round ? 8 : 3, curveSegments: 20 })
  rearRaw.translate(0, 0, bv)
  const rearGeo = smoothBevels(rearRaw, 2)
  pressFlat(rearGeo, rearD, true)
  rearGeo.translate(0, 0, -depth / 2)
  const shell = mesh(mergeGeometries([frontGeo, rearGeo]) ?? frontGeo, m.frame)
  shell.userData.body = true
  shell.userData.carrier = 'body'
  // the teardown view opens the shell: this is where its two sections meet, the patch of that wall that closes the
  // nose relief, and the bores, which it clears away to show the lenses
  shell.userData.inner = { z: split, x: nose.w / 2 + nose.f + 2, y: -h / 2 + nose.h + 3, bores: [-1, 1].map((sx) => ({ x: sx * apart, y: 0, r: lr * (waveguide ? 1.5 : 1.25) })) }
  root.add(shell)
  const front = mesh(plate(w - 2 * v.bevel - 2 * v.rim, h - 2 * v.bevel - 2 * v.rim, Math.max(b.corner - v.bevel - v.rim, 1)), m.back, false)
  front.position.z = depth / 2 + lift(0.02)
  front.userData.tear = 'cover'
  root.add(front)

  // ---- the face side: a rigid frame, a cushion that curves round the face and arches over the nose, and a soft flap that keeps the light out there
  const deep = 15
  const arch = { w: nose.w + 4, h: nose.h, f: nose.f }
  const gr = Math.max(b.corner - 3, 4)
  const ring = (grow: number, cut: number) => {
    const o = visorProfile(gw + 2 * grow, gh + 2 * grow, gr + grow, arch)
    o.holes.push(visorProfile(gw - 2 * cut, gh - 2 * cut, Math.max(gr - cut, 2), { w: arch.w + 1.6 * cut, h: arch.h, f: arch.f }))
    return o
  }
  const rimGeo = new THREE.ExtrudeGeometry(ring(1, wall * 0.5), { depth: 3.2, bevelEnabled: false, curveSegments: 16 })
  rimGeo.translate(0, 0, -depth / 2 - 3)
  scenery.add(mesh(rimGeo, darkPlastic()))
  const cushionGeo = new THREE.ExtrudeGeometry(ring(0, wall), { depth: deep - 3, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 3, curveSegments: 16 })
  cushionGeo.translate(0, 0, -depth / 2 - deep - 0.5)
  // its far edge reaches further back at the temples than at the nose
  const cp = cushionGeo.attributes.position
  for (let i = 0; i < cp.count; i++) {
    const far = (-depth / 2 - 5 - cp.getZ(i)) / (deep - 2)
    if (far > 0) cp.setZ(i, cp.getZ(i) - Math.min(1, far) * 11 * Math.pow((2 * cp.getX(i)) / gw, 2))
  }
  cushionGeo.computeVertexNormals()
  scenery.add(mesh(cushionGeo, rubber('#1b1c20')))
  const flapW = arch.w / 2 + wall * 0.8 - 1
  const flapH = arch.h + wall - 1
  const fy = -gh / 2
  const flap = new THREE.Shape()
  flap.moveTo(-flapW - arch.f, fy)
  flap.bezierCurveTo(-flapW, fy, -flapW, fy + flapH, 0, fy + flapH)
  flap.bezierCurveTo(flapW, fy + flapH, flapW, fy, flapW + arch.f, fy)
  flap.lineTo(flapW + arch.f - 1.4, fy)
  flap.bezierCurveTo(flapW - 1.4, fy, flapW - 1.4, fy + flapH - 1.4, 0, fy + flapH - 1.4)
  flap.bezierCurveTo(-flapW + 1.4, fy + flapH - 1.4, -flapW + 1.4, fy, -flapW - arch.f + 1.4, fy)
  const flapGeo = new THREE.ExtrudeGeometry(flap, { depth: deep - 1, bevelEnabled: false, curveSegments: 14 })
  flapGeo.translate(0, 0, -depth / 2 - deep - 1)
  scenery.add(mesh(flapGeo, rubber('#101114')))
  // the wall inside the cushion, open where the lenses look through
  const wallShape = visorProfile(gw - wall + 2, gh - wall + 2, Math.max(gr - wall * 0.5, 2), { w: arch.w + 0.8 * wall - 2, h: arch.h - 1, f: arch.f })
  for (const sx of [-1, 1]) {
    wallShape.holes.push(waveguide ? new THREE.Path(roundedRectShape(lr * 2.1, lr * 1.7, lr * 0.3).getPoints(6).map((p) => new THREE.Vector2(p.x + sx * apart, p.y))) : new THREE.Path().absarc(sx * apart, 0, lr, 0, Math.PI * 2, true))
  }
  const wallPlate = mesh(new THREE.ShapeGeometry(wallShape, 20), darkPlastic(), false)
  wallPlate.rotation.y = Math.PI
  wallPlate.position.z = -depth / 2 - lift(0.02)
  scenery.add(wallPlate)
  const picture = screenTexture('headset', d.wallpaper, 1, 1, c.detail)
  const glassMat = lensGlass()
  glassMat.transparent = true
  glassMat.opacity = 0.42
  glassMat.depthWrite = false
  // each lens sits a little way down its bore, with the display at the far end
  const recess = Math.min(5, rearD * 0.3)
  const far = -(rearD - recess - 0.3)
  for (const sx of [-1, 1]) {
    if (!waveguide) {
      const sleeveGeo = new THREE.CylinderGeometry(lr * 0.985, lr * 0.985, rearD - 0.6, 40, 1, true)
      sleeveGeo.rotateX(Math.PI / 2)
      const sleeve = mesh(sleeveGeo, new THREE.MeshPhysicalMaterial({ color: '#0b0c0e', roughness: 0.7, metalness: 0, side: THREE.BackSide }), false)
      sleeve.position.set(sx * apart, 0, -depth / 2 + rearD / 2)
      sleeve.userData.tear = 'hide'
      scenery.add(sleeve)
    }
    const eye = new THREE.Group()
    eye.rotation.y = Math.PI
    eye.position.set(sx * apart, 0, -depth / 2 + recess)
    eye.userData.tear = 'hide'
    // the display, seen through the lens
    const lit = mesh(waveguide ? plate(lr * 2, lr * 1.6, lr * 0.25) : new THREE.CircleGeometry(lr * 0.96, 48), new THREE.MeshBasicMaterial({ map: picture, color: '#8a8a8a', toneMapped: false }), false)
    lit.position.z = far
    eye.add(lit)
    if (waveguide) {
      // waveguides are flat plates, not lenses
      const slabGlass = mesh(plate(lr * 2.06, lr * 1.66, lr * 0.3), glassMat, false)
      slabGlass.position.z = lift(0.06)
      eye.add(slabGlass)
    } else {
      const rim = mesh(new THREE.RingGeometry(lr * 0.88, lr * 0.985, 56), kind >= 2 ? satin() : m.dark, false)
      rim.position.z = lift(0.05)
      eye.add(rim)
      if (kind === 1) {
        // a thick moulded lens bulges towards the eye
        const dome = new THREE.SphereGeometry(lr * 0.9, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2)
        dome.rotateX(Math.PI / 2)
        const lens = mesh(dome, glassMat, false)
        lens.scale.z = 0.3
        lens.position.z = lift(0.04)
        eye.add(lens)
      } else {
        const lens = mesh(new THREE.CircleGeometry(lr * 0.9, 56), glassMat, false)
        lens.position.z = lift(0.06)
        eye.add(lens)
        // a Fresnel lens is cut in rings; a pancake lens is a smooth stack with a dark iris
        const marks = kind === 0 ? [0.3, 0.44, 0.58, 0.72, 0.84] : [0.62]
        for (const k of marks) {
          const mark = mesh(new THREE.RingGeometry(lr * k, lr * (k + (kind === 0 ? 0.012 : 0.03)), 56), new THREE.MeshBasicMaterial({ color: kind === 0 ? '#ffffff' : '#000000', transparent: true, opacity: kind === 0 ? 0.16 : 0.3, depthWrite: false }), false)
          mark.position.z = lift(0.07)
          eye.add(mark)
        }
      }
    }
    scenery.add(eye)
  }

  // ---- the band, hinged where it meets the visor and leaning down to rest on the desk
  const strapColor = b.strapColor ?? '#2f3237'
  const bandMat = f.soft ? fabric(strapColor) : m.frame
  const padMat = rubber(strapColor)
  const band = new THREE.Group()
  band.position.z = f.z0
  band.rotation.x = -f.tilt
  const half = w / 2 - 1 + f.thick / 2
  const path = [new THREE.Vector3(half, 0, 12)]
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI
    path.push(new THREE.Vector3(half * Math.cos(a), 0, -BAND_REACH * Math.sin(a)))
  }
  path.push(new THREE.Vector3(-half, 0, 12))
  band.add(mesh(sweep(path, new THREE.Vector3(0, 1, 0), f.tall, f.thick), bandMat))
  const behind = (geoIn: THREE.BufferGeometry, mat: THREE.Material, z: number) => {
    const o = mesh(geoIn, mat)
    o.position.z = -BAND_REACH + z
    band.add(o)
    return o
  }
  if (f.soft) {
    // a buckle where the two ends of the strap meet
    behind(slab(36, 18, 5, 3.6, 1, 2), m.frame, -f.thick / 2 - 3.2)
  } else {
    // a cradle for the back of the head, with a cushion inside it
    behind(slab(82, 46, 18, 9, 2.5, 3), padMat, -1.5)
    if (f.pack) behind(slab(92, 52, 15, 24, 5, 4), m.frame, -24.5).userData.tear = 'pack'
    else {
      behind(slab(74, 40, 16, 7.5, 2.4, 3), m.frame, -8)
      const dial = new THREE.CylinderGeometry(10.5, 10.5, 6, 36)
      dial.rotateX(Math.PI / 2)
      behind(dial, m.dark, -10.5)
    }
  }
  scenery.add(band)
  // the pivots at the temples
  for (const sx of [-1, 1]) {
    const cap = new THREE.CylinderGeometry(8.5, 8.5, 2.2, 36)
    cap.rotateZ(Math.PI / 2)
    const o = mesh(cap, m.frame)
    o.position.set(sx * (w / 2 - 1 + f.thick + 0.7), 0, f.z0 + 3)
    scenery.add(o)
  }
  if (f.soft) {
    // a strap over the top of the head, from the visor to the back of the band
    const p0 = new THREE.Vector3(0, h / 2 - 1.2, -depth / 2 + 12)
    const p2 = new THREE.Vector3(0, f.rearY + f.tall / 2 - 3, f.rearZ + 1.5)
    const p1 = new THREE.Vector3(0, h / 2 + 78, (p0.z + p2.z) / 2 - 6)
    const over = new THREE.QuadraticBezierCurve3(p0, p1, p2).getPoints(40)
    scenery.add(mesh(sweep(over, new THREE.Vector3(1, 0, 0), 22, 2.4), bandMat))
  }

  // ---- controllers on the desk in front
  if (f.wands) {
    for (const sx of [-1, 1]) {
      const wand = buildWand(d.specs.keyboard ?? 0, m)
      wand.position.set(sx * w * (f.ringed ? 0.3 : 0.34), -h / 2, depth / 2 + (f.ringed ? 72 : 52))
      wand.rotation.y = -sx * (f.ringed ? 0.42 : 0.95)
      scenery.add(wand)
    }
  }
  scenery.traverse((o) => (o.raycast = () => {}))
  root.add(scenery)
  addParts(root, d, 'body', c)

  // centre visor, band and controllers together on the origin
  root.position.set(0, -f.cy, -f.cz)
  const wrap = new THREE.Group()
  wrap.add(root)
  return wrap
}

// ------------------------------------------------------------ speaker

/** A flat cap closing the end of a body: a fan from the middle to an outline at height y. */
function fanCap(outline: number[][], y: number, up: boolean): THREE.BufferGeometry {
  const pos = [0, y, 0]
  for (const p of outline) pos.push(p[0], y, p[2])
  // which way round the outline runs decides which way a fan faces
  let area = 0
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length]
    area += p[0] * q[2] - q[0] * p[2]
  })
  const idx: number[] = []
  for (let i = 0; i < outline.length; i++) {
    const a = i + 1
    const b = ((i + 1) % outline.length) + 1
    if (area < 0 === up) idx.push(0, a, b)
    else idx.push(0, b, a)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/**
 * Round the flat cuts in an orb, as shares of its radius: how close to the edge a
 * point of the mesh is pulled onto it (more than one cell of the mesh), and how wide a band is stretched to follow.
 */
const ORB_WELD = 0.055
const ORB_BAND = 0.24

/**
 * A smart speaker: a fabric body in one of three shapes, with a flat top that
 * carries the controls, a flat panel cut into the back for the sockets and, if
 * it has a screen, a flat cut into the front for that.
 */
function buildSpeaker(d: DeviceDesign, c: Ctx): THREE.Group {
  const b = d.body
  const m = c.m
  const s = speakerShape(b)
  const root = new THREE.Group()
  const rx = b.width / 2
  const rz = b.thickness / 2
  const hy = b.height / 2
  const round = s.form !== 'block'
  const N = s.form === 'orb' ? 192 : 96

  // the outline seen from above, from the middle of the front and round
  const ring: [number, number][] = []
  if (round) for (let i = 0; i <= N; i++) ring.push([rx * Math.sin((i / N) * Math.PI * 2), rz * Math.cos((i / N) * Math.PI * 2)])
  else for (const p of roundedRectShape(b.width, b.thickness, s.corner).getSpacedPoints(N)) ring.push([p.x, p.y])
  // heights up the side, how far the outline is drawn in at each, and how much of the flats is left there
  const levels: { y: number; kx: number; kz: number; flat: number }[] = []
  if (s.form === 'orb') {
    const top = Math.asin(hy / s.ry)
    for (let i = 0; i <= 64; i++) {
      const a = -top + (2 * top * i) / 64
      levels.push({ y: s.ry * Math.sin(a), kx: Math.cos(a), kz: Math.cos(a), flat: 1 })
    }
  } else {
    // where the side rounds over into the top and the base, the flats fade out with it, so they end in a curve and not a notch
    const drawn = (y: number, inset: number, round: number) => levels.push({ y, kx: (rx - inset) / rx, kz: (rz - inset) / rz, flat: 1 - inset / round })
    const foot = Math.min(s.bevel, 3)
    for (let i = 0; i <= 4; i++) drawn(-hy + foot * (1 - Math.cos((i / 4) * (Math.PI / 2))), foot * (1 - Math.sin((i / 4) * (Math.PI / 2))), foot)
    for (let i = 0; i <= 12; i++) drawn(hy - s.bevel * (1 - Math.sin((i / 12) * (Math.PI / 2))), s.bevel * (1 - Math.cos((i / 12) * (Math.PI / 2))), s.bevel)
  }
  // the flats: nothing reaches further back than the panel, or further forward than the screen
  const backZ = -(rz - s.backSink)
  const frontZ = rz - s.frontSink
  const at = (i: number, j: number) => {
    const L = levels[j]
    const x = ring[i][0] * L.kx
    const z = ring[i][1] * L.kz
    if (s.form !== 'orb') {
      // the flats follow the side as it rounds over
      const reach = rz * L.kz
      return [x, L.y, Math.min(reach - s.frontSink * L.flat, Math.max(-(reach - s.backSink * L.flat), z))]
    }
    // an orb is cut by flat planes. The edge of each cut is a circle that crosses the mesh at a slant, so the
    // points just outside it are slid along the surface onto that circle, or the edge would be a staircase.
    // The band beyond them is stretched to make up the difference, so the weave is not bunched up at the edge.
    for (const [side, sink] of [[1, s.frontSink], [-1, s.backSink]]) {
      if (sink <= 0) continue
      const cut = 1 - sink / rz
      const depth = (side * z) / rz
      if (depth >= cut) return [x, L.y, side * cut * rz]
      if (depth > cut - ORB_BAND) {
        const moved = depth > cut - ORB_WELD ? cut : cut - ((cut - ORB_WELD - depth) * ORB_BAND) / (ORB_BAND - ORB_WELD)
        const k = Math.sqrt(1 - moved * moved) / Math.hypot(x / rx, L.y / s.ry)
        return [x * k, L.y * k, side * moved * rz]
      }
    }
    return [x, L.y, z]
  }

  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  // the weave runs round the outline and up the side, a whole number of times round so that it meets itself
  const along = [0]
  for (let i = 1; i <= N; i++) along.push(along[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]))
  const repeats = Math.max(1, Math.round(along[N] / WEAVE)) / along[N]
  let area = 0
  for (let i = 0; i < N; i++) area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  let up = 0
  for (let j = 0; j < levels.length; j++) {
    if (j > 0) up += Math.hypot(levels[j].y - levels[j - 1].y, (levels[j].kx - levels[j - 1].kx) * rx)
    for (let i = 0; i <= N; i++) {
      pos.push(...at(i, j))
      uv.push(along[i] * repeats, up / WEAVE)
    }
  }
  for (let j = 0; j < levels.length - 1; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i
      const e = a + N + 1
      if (area < 0) idx.push(a, a + 1, e, a + 1, e + 1, e)
      else idx.push(a, e, a + 1, a + 1, e, e + 1)
    }
  }
  const sideGeo = new THREE.BufferGeometry()
  sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  sideGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  sideGeo.setIndex(idx)
  const body = mesh(toCreasedNormals(sideGeo, 0.3), fabric(`#${(m.back as THREE.MeshPhysicalMaterial).color.getHexString()}`))
  body.userData.body = true
  body.userData.carrier = 'body'
  root.add(body)
  const outlineAt = (j: number) => Array.from({ length: N }, (_, i) => at(i, j))
  // the top is a plate in the trim material; the base is plain
  const lid = mesh(fanCap(outlineAt(levels.length - 1), hy, true), flatted(m.frame))
  const base = mesh(fanCap(outlineAt(0), -hy, false), darkPlastic())
  lid.userData.body = true
  lid.userData.carrier = 'body'
  body.userData.tear = lid.userData.tear = 'cover'
  base.raycast = () => {}
  root.add(lid, base)

  // the panel at the back that the sockets sit in
  const panel = mesh(plate(s.backW + 3, s.backH + 2, round ? Math.min(s.backW, s.backH) * (s.form === 'orb' ? 0.3 : 0.08) + 1 : 3), darkPlastic(), false)
  panel.rotation.y = Math.PI
  panel.position.z = backZ - lift(0.02)
  panel.userData.tear = 'cover'
  root.add(panel)
  if (s.screen) {
    const glassR = s.form === 'orb' ? (s.screen.w + 5) / 2 : s.screen.r + 2.5
    const glass = mesh(plate(s.screen.w + 5, s.screen.h + 5, glassR), m.glass, false)
    glass.position.set(0, s.screen.y, frontZ + lift(0.02))
    const screen = mesh(plate(s.screen.w, s.screen.h, s.screen.r), litScreen(screenTexture('speaker', d.wallpaper, s.screen.w, s.screen.h, c.detail, panelInfoOf(c), c.look), c.specs.panel), false)
    screen.position.set(0, s.screen.y, frontZ + lift(0.04))
    glass.userData.tear = screen.userData.tear = 'cover'
    root.add(glass, screen)
  }

  // the microphones: pinholes in the top, round the controls or along the back edge
  const count = (MIC_ARRAYS[d.specs.mics ?? 0] ?? MIC_ARRAYS[0]).count
  const holeGeo = new THREE.CircleGeometry(0.6, 14)
  holeGeo.rotateX(-Math.PI / 2)
  const holes = new THREE.InstancedMesh(holeGeo, m.dark, count)
  const mat4 = new THREE.Matrix4()
  for (let i = 0; i < count; i++) {
    const a = ((i + 0.5) / count) * Math.PI * 2
    if (round) mat4.makeTranslation(s.capX * 0.7 * Math.sin(a), hy + lift(0.03), s.capZ * 0.7 * Math.cos(a))
    else mat4.makeTranslation((i - (count - 1) / 2) * Math.min(9, (2 * s.capX - 16) / count), hy + lift(0.03), -(s.capZ - 5))
    holes.setMatrixAt(i, mat4)
  }
  holes.raycast = () => {}
  holes.userData.tear = 'cover'
  root.add(holes)
  addParts(root, d, 'body', c)
  return root
}

// ------------------------------------------------------------ handheld

/**
 * A handheld: a slab whose front is glass between two plates of controls, with
 * shoulder buttons along the top, triggers behind them and grips on the back.
 * The controls are part of the model, not parts: what can be placed goes between them.
 */
function buildHandheld(d: DeviceDesign, c: Ctx): THREE.Group {
  const b = d.body
  const m = c.m
  const t = b.thickness
  // the screen sits between the controls, well clear of the corners of the body, so its own corners are only slightly rounded
  const root = buildSlab(b, { ...c, m: { ...m, back: m.frame } }, { carrier: 'body', wallpaper: d.wallpaper, screenRadius: Math.min(4, Math.max(1, Math.min(b.bezelTop, b.bezelBottom) * 1.4)) })
  const bevel = edgeBevel(b)
  const capW = b.width - 2 * bevel
  const capH = b.height - 2 * bevel
  const capR = Math.max(b.corner - bevel, 0.05)
  const scr = screenRect(b)
  const level = d.specs.keyboard ?? 0
  const controls = new THREE.Group()
  const dark = darkPlastic()
  const z = t / 2 + lift(0.03)

  // the plates either side of the glass
  const inner = scr.w / 2 + Math.min(5, Math.max(0.8, Math.min(b.bezelTop, b.bezelBottom)))
  const plateW = capW / 2 - inner
  if (plateW > 6) {
    for (const side of [-1, 1]) {
      const o = mesh(plate(plateW, capH, side < 0 ? [capR, 1.2, 1.2, capR] : [1.2, capR, capR, 1.2]), m.back, false)
      o.position.set(side * (inner + plateW / 2), 0, z)
      controls.add(o)
    }
  }
  const k = handheldControls(b)
  const put = (o: THREE.Object3D, x: number, y: number, dz = 0) => {
    o.position.set(x, y, z + dz)
    controls.add(o)
  }
  // the top tier of controls is plain to see: a lit ring under each stick, metal caps and keys, and stops and paddles behind
  const pro = level >= 3
  const stick = (x: number, y: number) => {
    put(mesh(new THREE.CircleGeometry(k.r * 1.12, 40), m.dark, false), x, y, lift(0.02))
    // better sticks get a metal collar
    put(mesh(new THREE.RingGeometry(k.r * 1.12, k.r * 1.27, 40), level >= 1 ? satin() : dark, false), x, y, lift(0.025))
    if (pro) put(mesh(new THREE.RingGeometry(k.r * 1.3, k.r * 1.4, 48), new THREE.MeshStandardMaterial({ color: '#7fc4ff', emissive: '#7fc4ff', emissiveIntensity: 0.7, roughness: 0.4 }), false), x, y, lift(0.03))
    put(mesh(disc(k.r * 0.42, 3.4), pro ? satin() : dark), x, y)
    put(mesh(disc(k.r * 0.86, 2.2), rubber('#1b1d21')), x, y, 3.2)
    put(mesh(new THREE.RingGeometry(k.r * 0.5, k.r * 0.66, 40), m.dark, false), x, y, 5.4 + lift(0.02))
    // a knurled metal rim round the cap from the analogue tier up
    if (level >= 2) put(mesh(new THREE.RingGeometry(k.r * 0.78, k.r * 0.86, 40), satin(), false), x, y, 5.4 + lift(0.03))
  }
  const cross = (x: number, y: number) => {
    put(mesh(new THREE.CircleGeometry(k.r * 1.12, 40), m.dark, false), x, y, lift(0.02))
    const arm = slab(k.r * 1.84, k.r * 0.62, k.r * 0.12, 1.5, 0.3, 2)
    put(mesh(arm, dark), x, y)
    const upright = mesh(arm, dark)
    upright.rotation.z = Math.PI / 2
    put(upright, x, y)
  }
  const keys = (x: number, y: number) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      put(mesh(disc(k.r * 0.36, 1.4), pro ? satin() : dark), x + dx * k.r * 0.74, y + dy * k.r * 0.74)
      put(mesh(new THREE.RingGeometry(k.r * 0.14, k.r * 0.2, 24), satin(), false), x + dx * k.r * 0.74, y + dy * k.r * 0.74, 1.4 + lift(0.02))
    }
  }
  if (plateW > 2 * k.r * 1.3) {
    stick(-k.x, k.up)
    cross(-k.x, k.down)
    keys(k.x, k.up)
    stick(k.x, k.down)
    // two small menu keys by the top corners of the screen
    for (const side of [-1, 1]) put(mesh(slab(5.2, 2.4, 1.2, 0.7, 0.2, 2), dark), side * (inner + 5), capH / 2 - 6)
  }

  // shoulder buttons along the top, each with a trigger behind and below it
  const outer = b.width / 2 - Math.max(b.corner * 0.75, 5)
  const deep = Math.max(6, t * 0.6)
  for (const side of [-1, 1]) {
    const shoulder = mesh(flatSlab(40, deep, 2.4, 4.2, 1.2), dark)
    shoulder.position.set(side * (outer - 20), b.height / 2 - 1, -t / 2 + deep / 2 + 0.8)
    // analogue triggers have a longer throw, so they stand further out
    const trigger = mesh(slab(30, 15, 5, level >= 2 ? 7 : 4.5, 1.5, 3), dark)
    trigger.rotation.y = Math.PI
    trigger.position.set(side * (outer - 17), b.height / 2 - 9.5, -t / 2 + 0.6)
    const dome = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2)
    dome.rotateX(-Math.PI / 2)
    const grip = mesh(dome, m.frame)
    const reach = GRIP / 2 - 6
    grip.scale.set(reach, b.height * 0.42, Math.min(10, Math.max(5, t * 0.4)))
    grip.position.set(side * (b.width / 2 - 4 - reach), -b.height * 0.07, -t / 2 + 0.5)
    grip.userData.tear = 'cover'
    controls.add(shoulder, trigger, grip)
    // paddles behind the grips: an option on any tier, and built in, in metal, on the top one
    if ((d.specs.io ?? []).includes('paddles') || pro) {
      for (const dy of [9, -13]) {
        const paddle = mesh(slab(6.5, 17, 3, 2.6, 0.8, 2), pro ? satin() : dark)
        paddle.rotation.y = Math.PI
        paddle.position.set(side * (b.width / 2 - GRIP + 4), -b.height * 0.07 + dy, -t / 2 + 0.4)
        paddle.userData.tear = 'cover'
        controls.add(paddle)
      }
    }
    if (pro) {
      // a trigger stop: a small switch beside each trigger that shortens its throw
      const stop = mesh(slab(9, 4.2, 1.6, 2.2, 0.6, 2), satin())
      stop.rotation.y = Math.PI
      stop.position.set(side * (outer - 37), b.height / 2 - 12, -t / 2 + 0.3)
      stop.userData.tear = 'cover'
      const nib = mesh(slab(3.4, 3, 1, 1.4, 0.4, 2), lightMaterial('#7fc4ff'))
      nib.rotation.y = Math.PI
      nib.position.set(side * (outer - 38.6), b.height / 2 - 12, -t / 2 - 1.6)
      nib.userData.tear = 'cover'
      controls.add(stop, nib)
    }
  }
  controls.traverse((o) => (o.raycast = () => {}))
  root.add(controls)
  addParts(root, d, 'body', c)
  if ((d.specs.io ?? []).includes('dock')) root.add(buildDock(b))
  return root
}

/** Height of the tray of a handheld's dock, under the handheld. */
export const DOCK_BASE = 9

/**
 * The TV dock a handheld is sold with, when it is: a tray it stands in, a wall behind with the sockets for the
 * television, and a low lip in front. It is an accessory, so nothing can be fitted to it or picked on it.
 */
function buildDock(b: Body): THREE.Group {
  const g = new THREE.Group()
  const t = b.thickness
  const shell = new THREE.MeshPhysicalMaterial({ color: '#1d1f23', metalness: 0, roughness: 0.6 })
  const w = b.width * 0.62
  const deep = t + 46
  const tray = mesh(flatSlab(w, deep, 9, DOCK_BASE, 2.2), shell)
  tray.position.set(0, -b.height / 2 - DOCK_BASE - 0.5, -9)
  const wallH = b.height * 0.5
  const wall = mesh(slab(w, wallH, 7, 7.5, 2), shell)
  wall.position.set(0, -b.height / 2 + wallH / 2 - 3, -t / 2 - 9.4)
  const lipGeo = flatSlab(w, 7, 2.2, 4.4, 1.4)
  const lip = mesh(lipGeo, shell)
  lip.position.set(0, -b.height / 2 - 0.5, t / 2 + 4.6)
  const light = mesh(new THREE.BoxGeometry(w * 0.16, 1, 0.6), lightMaterial('#8dffa8'), false)
  light.position.set(0, -b.height / 2 + 1.8, t / 2 + 8.1)
  g.add(tray, wall, lip, light)
  // the sockets on the back of the wall: power, video out and two for controllers or a network adapter
  const hole = darkMatte()
  ;[[-0.3, 12, 8], [-0.1, 15, 5.2], [0.1, 13, 5], [0.28, 13, 5]].forEach(([x, sw, sh]) => {
    const o = mesh(plate(sw, sh, 1), hole, false)
    o.rotation.y = Math.PI
    o.position.set(x * w, -b.height / 2 + wallH * 0.3, -t / 2 - 16.95)
    g.add(o)
  })
  g.userData.prop = 'dock'
  g.traverse((o) => (o.raycast = () => {}))
  return g
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
    case 'tower':
      return { radius: Math.hypot(b.width, b.height, b.thickness) * 0.47, bottom: b.height / 2 + towerLift(d) }
    case 'mouse':
      return { radius: Math.hypot(b.width, b.height, b.thickness) * 0.52, bottom: b.height / 2 }
    case 'desktop':
    case 'monitor':
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
    case 'headset': {
      const f = headsetFrame(b, d.specs)
      return { radius: Math.hypot(b.width + 14, f.height, f.depth) * 0.43, bottom: f.height / 2 }
    }
    case 'speaker':
      return { radius: Math.hypot(b.width, b.height, b.thickness) * 0.5, bottom: b.height / 2 }
    case 'ring':
    case 'drone':
      return moreFrame(d)
    default:
      return { radius: Math.hypot(b.width, b.height) / 2, bottom: b.height / 2 }
  }
}

/**
 * Builds the model for any device type.
 * colorIndex >= 0 previews one of the design's extra colourways; detail below
 * 1 is for thumbnails.
 */
export function buildDevice(d: DeviceDesign, selectedId?: string | null, logoUrl?: string, colorIndex = -1, detail = 1, look?: OsLook): THREE.Group {
  const c: Ctx = { type: d.type, body: d.body, m: materials(d, colorIndex), specs: d.specs, selectedId, logoUrl, detail, chin: d.type === 'desktop' && d.body.bezelBottom >= CHIN_MIN, look }
  layerScale = Math.min(12, Math.max(1, deviceFrame(d).radius / 87))
  switch (d.type) {
    case 'laptop':
      return buildLaptop(d, c)
    case 'desktop':
    case 'monitor':
    case 'tv':
      return buildPanel(d, c)
    case 'tower':
      return buildTower(d, c)
    case 'mouse':
      return buildMouse(d, c)
    case 'console':
      return buildConsole(d, c)
    case 'earbuds':
      return buildEarbuds(d, c)
    case 'foldable':
      return buildFoldable(d, c)
    case 'headset':
      return buildHeadset(d, c)
    case 'speaker':
      return buildSpeaker(d, c)
    case 'handheld':
      return buildHandheld(d, c)
    case 'ereader':
      return buildEreader(d, c)
    case 'actioncam':
      return buildActioncam(d, c)
    case 'ring':
      return buildRing(d, c)
    case 'drone':
      return buildDrone(d, c)
    default: {
      const root = buildSlab(d.body, c, { carrier: 'body', wallpaper: d.wallpaper })
      if (d.type === 'watch') root.add(buildStrap(d.body))
      else root.add(antennaBands(d.body, c), featuresOnBody(d.body, c))
      addParts(root, d, 'body', c)
      return root
    }
  }
}

export function disposeDevice(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    // what the teardown view shares between models is marked, and is not thrown away with any one of them
    if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose()
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    const drop = (x: THREE.Material) => !x.userData.shared && x.dispose()
    if (Array.isArray(mat)) mat.forEach(drop)
    else if (mat) drop(mat)
  })
}
