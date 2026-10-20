// Opens a built device model up and shows what is inside it. The layout comes
// from sim/internals.ts; this file only draws it. A model is rigged the first
// time it is opened: its shell is cut in two along the seam, the piece that
// comes off is hung on a hinge of its own, and the components are stood in the
// tray. Everything a rig shares with other rigs (simple shapes, materials,
// printed labels) is made once and marked so that disposing of a model leaves it alone.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { caseShape, droneShape, isFlip, speakerShape, standMount } from '../sim/geometry'
import type { Box, Comp, Dir, Internals, V3, Zone } from '../sim/internals'
import type { DeviceDesign, Face, PlacedPart } from '../sim/types'
import { themeColor } from '../store/theme'
import { looseBudAt, roundedRectShape } from './buildDevice'

// ---------------------------------------------------------------- shared shapes and materials

const share = <T extends { userData: Record<string, unknown> }>(x: T): T => {
  x.userData.shared = true
  return x
}
const BOX = share(new THREE.BoxGeometry(1, 1, 1))
const CYL = share(new THREE.CylinderGeometry(0.5, 0.5, 1, 28).rotateX(Math.PI / 2))
const CYL_LOW = share(new THREE.CylinderGeometry(0.5, 0.5, 1, 12).rotateX(Math.PI / 2))
const CONE = share(new THREE.CylinderGeometry(0.5, 0.2, 1, 28, 1, true).rotateX(Math.PI / 2))
const DISC = share(new THREE.CircleGeometry(0.5, 36))
const RING = share(new THREE.RingGeometry(0.44, 0.5, 44))
const PLANE = share(new THREE.PlaneGeometry(1, 1))
const DOME = share(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2))
const EDGES = share(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)))
const BALL = share(new THREE.SphereGeometry(0.5, 10, 8))
const LUMP = share(new THREE.IcosahedronGeometry(0.5, 1))
/** An arc of wall, open top and bottom, bulging towards +Y: the back of a round chamber. */
const ARC = share(new THREE.CylinderGeometry(0.5, 0.5, 1, 28, 1, true, Math.PI - 1.25, 2.5).rotateX(Math.PI / 2))
const TORUS = share(new THREE.TorusGeometry(0.36, 0.14, 8, 20))
/** The axes an earbud is laid out in, as directions of the bud's own: across is down its stem, along is its own X, up is the way its ear tip points. */
const BUD_AXES = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)))
const Z_AXIS = new THREE.Vector3(0, 0, 1)

const std = (color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) => share(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }))
// matte boards, brushed cans, satin cell wrap: nothing in here is glossy
const M = {
  pcb: [std('#1d4634', 0.86), std('#17191c', 0.86), std('#1a3552', 0.86), std('#6a5527', 0.86)],
  mask: std('#2b6a4c', 0.8),
  black: std('#141518', 0.72),
  grey: std('#3b3e44', 0.7),
  pale: std('#8f9399', 0.7),
  white: std('#d9dbd6', 0.8),
  steel: std('#7d8188', 0.56, 0.8),
  darkSteel: std('#55585e', 0.55, 0.75),
  alu: std('#a3a7ad', 0.55, 0.7),
  zinc: std('#5d6167', 0.74, 0.25),
  copper: std('#a8683c', 0.5, 0.85),
  gold: std('#b99a55', 0.45, 0.9),
  wrap: std('#26282c', 0.52, 0.1),
  label: std('#b8bbb6', 0.8),
  graphite: std('#2a2c30', 0.62, 0.25),
  flex: std('#9a5a22', 0.62, 0.1),
  flexDark: std('#1a1a1d', 0.65),
  rubber: std('#0f0f11', 0.92),
  cone: std('#1d1e21', 0.82),
  glass: share(new THREE.MeshPhysicalMaterial({ color: '#0a0d14', roughness: 0.18, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.2 })),
  lensGlass: share(new THREE.MeshPhysicalMaterial({ color: '#6f8196', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.45, depthWrite: false })),
  led: std('#efe6c4', 0.4, 0, { emissive: '#ffe9b0', emissiveIntensity: 0.25 }),
  green: std('#7dffa0', 0.4, 0, { emissive: '#7dffa0', emissiveIntensity: 0.9 }),
  yellow: std('#b79a2e', 0.7),
  blueCap: std('#27405f', 0.6),
  ribbon: std('#c9ccd1', 0.4, 0.9),
  film: std('#31271d', 0.7, 0.2),
  liner: std('#202226', 0.8, 0.1, { side: THREE.DoubleSide }),
  phenolic: std('#8a6a35', 0.86),
  galv: std('#8b9096', 0.62, 0.55),
  galvDark: std('#70757b', 0.66, 0.5),
  reflector: std('#dfe1dc', 0.9),
  wool: std('#cfcdc4', 0.98),
  red: std('#8c2a22', 0.7),
  ferrite: std('#2b2c30', 0.8, 0.2),
  shell: std('#2c2e33', 0.86, 0.05, { side: THREE.DoubleSide }),
  ledOff: std('#f1ead2', 0.5, 0, { emissive: '#ffe9b0', emissiveIntensity: 0.12 }),
  blue: std('#5ab4ff', 0.5, 0, { emissive: '#5ab4ff', emissiveIntensity: 0.5 }),
  eyeGlass: share(new THREE.MeshPhysicalMaterial({ color: '#2a3442', roughness: 0.2, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide })),
  ceramic: std('#e6e0cf', 0.6),
  seal: std('#3b5674', 0.88, 0.05),
  irWindow: share(new THREE.MeshPhysicalMaterial({ color: '#2a0c10', roughness: 0.15, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.1 })),
  dotLens: std('#5a1d24', 0.25, 0.1, { emissive: '#ff2a3a', emissiveIntensity: 0.18 }),
  penBody: std('#e7e8e4', 0.45, 0.05),
  tungsten: std('#43464c', 0.5, 0.8),
  redLed: std('#ff3a3a', 0.4, 0, { emissive: '#ff2a2a', emissiveIntensity: 0.9 }),
  amberLed: std('#ffb35a', 0.4, 0, { emissive: '#ff9a3a', emissiveIntensity: 0.9 }),
  acrylic: share(new THREE.MeshPhysicalMaterial({ color: '#cfe6ff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false })),
  diffuser: std('#e8ecef', 0.9, 0, { transparent: true, opacity: 0.85 }),
  titanium: std('#8a8d92', 0.38, 0.85),
}

/**
 * Nothing in here is drawn above this plane (in world space). It stands far out of the way except while a
 * speaker's sleeve is being lifted off: then it rides up with the rim of the sleeve, so that what is inside comes
 * into view under the sleeve as it rises instead of showing through it. The view has to allow materials to clip.
 */
const REVEAL = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e9)
for (const m of Object.values(M).flat()) m.clippingPlanes = [REVEAL]

const glows = new Map<string, THREE.MeshStandardMaterial>()
/** A surface lit by RGB lighting in a colour: bright, so that it reads through a side panel. Kept, one for each colour. */
export function glowMat(color: string): THREE.MeshStandardMaterial {
  let m = glows.get(color)
  if (!m) {
    m = std(color, 0.35, 0, { emissive: color, emissiveIntensity: 1.8, toneMapped: false })
    m.userData.glow = true
    m.clippingPlanes = [REVEAL]
    glows.set(color, m)
  }
  return m
}

const boxCache = new Map<string, THREE.BufferGeometry>()
/** A box with rounded edges, kept so that the next model to want the same one gets it for nothing. */
function rbox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const q = (v: number) => Math.max(0.2, Math.round(v * 4) / 4)
  const rr = Math.max(0.05, Math.min(r, q(w) / 2 - 0.02, q(h) / 2 - 0.02, q(d) / 2 - 0.02))
  const key = `${q(w)}|${q(h)}|${q(d)}|${rr.toFixed(2)}`
  let g = boxCache.get(key)
  if (!g) {
    g = share(new RoundedBoxGeometry(q(w), q(h), q(d), 3, rr))
    boxCache.set(key, g)
    if (boxCache.size > 500) {
      const old = boxCache.keys().next().value!
      boxCache.get(old)!.dispose()
      boxCache.delete(old)
    }
  }
  return g
}

const textCache = new Map<string, THREE.MeshStandardMaterial>()
/** Lettering as a material: etched pale on a dark package, or printed dark on a pale label. Lines are split at '|'. */
function printed(text: string, style: 'etch' | 'label' | 'pcb'): THREE.MeshStandardMaterial {
  const key = `${style}|${text}`
  const hit = textCache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = 256
  c.height = style === 'label' ? 160 : 128
  const g = c.getContext('2d')!
  g.fillStyle = style === 'label' ? '#b9bcb7' : style === 'pcb' ? '#1d4634' : '#16171a'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = style === 'label' ? '#1c1d20' : style === 'pcb' ? '#c9d6cc' : '#8b9097'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const lines = text.split('|')
  lines.forEach((line, i) => {
    let size = i === 0 ? (style === 'label' ? 44 : 40) : 20
    g.font = `600 ${size}px Bahnschrift, "Segoe UI", sans-serif`
    const wide = g.measureText(line).width
    if (wide > c.width - 24) size = (size * (c.width - 24)) / wide
    g.font = `600 ${size}px Bahnschrift, "Segoe UI", sans-serif`
    g.fillText(line, c.width / 2, c.height * (lines.length === 1 ? 0.5 : i === 0 ? 0.4 : 0.76))
  })
  if (style === 'label') {
    // the small print and warning marks every cell carries
    g.fillRect(14, c.height - 14, c.width - 28, 2)
    g.fillRect(14, 12, 40, 2)
    g.strokeStyle = '#1c1d20'
    g.lineWidth = 2
    g.strokeRect(c.width - 44, 8, 30, 18)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  const m = share(new THREE.MeshStandardMaterial({ map: t, roughness: style === 'label' ? 0.82 : 0.7, metalness: 0, clippingPlanes: [REVEAL] }))
  textCache.set(key, m)
  if (textCache.size > 240) {
    const old = textCache.keys().next().value!
    textCache.get(old)!.map?.dispose()
    textCache.get(old)!.dispose()
    textCache.delete(old)
  }
  return m
}

// ---------------------------------------------------------------- small helpers

const dirVec = (d: Dir) => new THREE.Vector3(Math.abs(d) === 1 ? Math.sign(d) : 0, Math.abs(d) === 2 ? Math.sign(d) : 0, Math.abs(d) === 3 ? Math.sign(d) : 0)
const basisQuat = (ax: [Dir, Dir, Dir]) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(dirVec(ax[0]), dirVec(ax[1]), dirVec(ax[2])))
/** The axes a cavity is laid out in, from the way its opening faces: the same ones the layout used. */
const zoneAxes = (up: Dir): [Dir, Dir, Dir] => (up === -3 ? [-1, 2, -3] : up === 3 ? [1, 2, 3] : up === 2 ? [1, -3, 2] : up === 1 ? [-3, 2, 1] : up === -2 ? [1, 3, -2] : [3, 2, -1])
const localSize = (ax: [Dir, Dir, Dir], s: V3): V3 => [s[Math.abs(ax[0]) - 1], s[Math.abs(ax[1]) - 1], s[Math.abs(ax[2]) - 1]]
const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x))
  return k * k * (3 - 2 * k)
}
/** A repeatable scatter from a name. */
function seeded(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

function part(g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const o = new THREE.Mesh(geo, mat)
  o.scale.set(Math.max(sx, 0.01), Math.max(sy, 0.01), Math.max(sz, 0.01))
  o.position.set(x, y, z)
  o.castShadow = shadow
  o.receiveShadow = true
  g.add(o)
  return o
}
const bx = (g: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true) => part(g, BOX, mat, w, h, d, x, y, z, shadow)
/** A cylinder standing along the component's own up axis. */
const cy = (g: THREE.Object3D, dia: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, low = false) => part(g, low ? CYL_LOW : CYL, mat, dia, dia, len, x, y, z)
/** A box with rounded edges. Its geometry comes in quarter-millimetre steps, and is stretched the last little way to the exact size. */
function rb(g: THREE.Object3D, w: number, h: number, d: number, r: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const q = (v: number) => Math.max(0.2, Math.round(v * 4) / 4)
  const o = new THREE.Mesh(rbox(w, h, d, r), mat)
  o.scale.set(Math.max(w, 0.01) / q(w), Math.max(h, 0.01) / q(h), Math.max(d, 0.01) / q(d))
  o.position.set(x, y, z)
  o.castShadow = true
  o.receiveShadow = true
  g.add(o)
  return o
}
/** A flat face lying on top of something, facing up. */
/** How much further apart stacked surfaces are kept on a large device, where the depth buffer is coarser: 1 for a phone. */
let layer = 1
function face(g: THREE.Object3D, w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, round = false): THREE.Mesh {
  const o = part(g, round ? DISC : PLANE, mat, w, h, 1, x, y, z + 0.03 * (layer - 1), false)
  // a hair above the surface it lies on: it must not take that surface's shadow of itself
  o.receiveShadow = false
  return o
}

/** A group whose own up axis is turned to lie along one of the component's axes, with the sizes to match. */
function turned(g: THREE.Group, axis: 0 | 1 | 2 | undefined, a: number, b: number, h: number): { g: THREE.Object3D; a: number; b: number; h: number } {
  if (axis === undefined || axis === 2) return { g, a, b, h }
  const t = new THREE.Group()
  if (axis === 0) {
    t.rotation.y = Math.PI / 2
    g.add(t)
    return { g: t, a: h, b, h: a }
  }
  t.rotation.x = -Math.PI / 2
  g.add(t)
  return { g: t, a, b: h, h: b }
}

/** Blades round a hub, lying flat: a fan seen from above. Returns the part that turns. */
function rotor(g: THREE.Object3D, dia: number, h: number, z: number, blades = 9): THREE.Group {
  const spin = new THREE.Group()
  spin.position.z = z
  cy(spin, dia * 0.3, h, M.grey)
  for (let i = 0; i < blades; i++) {
    const blade = bx(spin, dia * 0.32, dia * 0.085, h * 0.8, M.grey, 0, 0, 0, false)
    const a = (i / blades) * Math.PI * 2
    blade.position.set(Math.cos(a) * dia * 0.31, Math.sin(a) * dia * 0.31, 0)
    blade.rotation.set(0.5, 0, a + 0.5)
  }
  g.add(spin)
  return spin
}

/** A cone driver looking up: basket, cone, dust cap and the magnet behind it. */
function cone(g: THREE.Object3D, dia: number, h: number, small = false) {
  // the rim of the basket, with the roll of the surround inside it
  cy(g, dia, h * 0.1, M.darkSteel, 0, 0, h / 2 - h * 0.05)
  const roll = part(g, TORUS, M.rubber, dia * 0.9, dia * 0.9, Math.min(h * 0.5, dia * 0.5), 0, 0, h / 2 - h * 0.02, false)
  roll.rotation.z = 0.2
  const c = part(g, CONE, M.cone, dia * 0.78, dia * 0.78, h * 0.4, 0, 0, h / 2 - h * 0.26, false)
  ;(c.material as THREE.Material).side = THREE.DoubleSide
  // the dust cap is a shallow dome in the throat of the cone
  const cap = part(g, DOME, small ? M.pale : M.black, dia * 0.15, dia * 0.15, h * 0.1, 0, 0, h / 2 - h * 0.44, false)
  cap.receiveShadow = true
  // the legs of the basket run down to the magnet: its top plate, the ferrite ring and the back plate
  if (!small && dia > 5) {
    for (let i = 0; i < 4; i++) {
      const leg = bx(g, Math.hypot(dia * 0.25, h * 0.48), dia * 0.07, Math.max(0.3, dia * 0.02), M.darkSteel, 0, 0, 0, false)
      const an = (i / 4) * Math.PI * 2 + 0.4
      leg.position.set(Math.cos(an) * dia * 0.36, Math.sin(an) * dia * 0.36, h * 0.16)
      leg.rotation.set(0, 0, an)
      leg.rotateY(-Math.atan2(h * 0.48, dia * 0.25))
    }
  }
  cy(g, dia * 0.46, h * 0.07, M.steel, 0, 0, -h * 0.1)
  cy(g, dia * 0.56, h * 0.26, M.ferrite, 0, 0, -h * 0.27)
  cy(g, dia * 0.46, h * 0.07, M.steel, 0, 0, -h * 0.44)
}

/** Many copies of a box, each with its own size and place: fins, ribs, lamps. */
function boxes(g: THREE.Object3D, mat: THREE.Material, list: [number, number, number, number, number, number][], geo: THREE.BufferGeometry = BOX, shadow = false): THREE.InstancedMesh {
  const o = new THREE.InstancedMesh(geo, mat, list.length)
  const m4 = new THREE.Matrix4()
  list.forEach(([sx, sy, sz, x, y, z], i) => o.setMatrixAt(i, m4.makeScale(Math.max(sx, 0.01), Math.max(sy, 0.01), Math.max(sz, 0.01)).setPosition(x, y, z)))
  o.castShadow = shadow
  o.receiveShadow = true
  g.add(o)
  return o
}

/**
 * A run of cable or ribbon through points given in the component's own space. Round when `wide` is 0; otherwise a
 * flat ribbon that wide, lying on its face. With `clips` it is tied down along the way and ends in a plug at each end.
 */
function strand(g: THREE.Object3D, pts: THREE.Vector3[], t: number, mat: THREE.Material, wide = 0, clips = false) {
  const dir = new THREE.Vector3()
  const side = new THREE.Vector3()
  const upv = new THREE.Vector3()
  const m4 = new THREE.Matrix4()
  const ties: [number, number, number, number, number, number][] = []
  for (let i = 0; i + 1 < pts.length; i++) {
    const len = pts[i].distanceTo(pts[i + 1])
    if (len < 0.05) continue
    dir.copy(pts[i + 1]).sub(pts[i]).normalize()
    const o = new THREE.Mesh(wide ? BOX : CYL_LOW, mat)
    o.position.copy(pts[i]).add(pts[i + 1]).multiplyScalar(0.5)
    if (wide) {
      // a ribbon keeps its face up where it runs along the floor, and against the wall where it climbs
      upv.copy(Math.abs(dir.z) > 0.9 ? new THREE.Vector3(0, 1, 0) : Z_AXIS)
      side.crossVectors(upv, dir).normalize()
      upv.crossVectors(dir, side)
      o.quaternion.setFromRotationMatrix(m4.makeBasis(dir, side, upv))
      o.scale.set(len + (i + 2 < pts.length ? wide * 0.5 : 0), wide, t)
    } else {
      o.quaternion.setFromUnitVectors(Z_AXIS, dir)
      o.scale.set(t, t, len)
      if (i + 2 < pts.length) part(g, BALL, mat, t, t, t, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z, false)
    }
    o.receiveShadow = true
    g.add(o)
    if (clips) {
      // a loom runs square to the chassis, so a clip lies either across it or along it
      const every = Math.max(70, t * 34)
      const n = Math.floor(len / every)
      const along = Math.abs(dir.x) > Math.abs(dir.y)
      const cw = Math.max(t * 1.5, 3)
      const cl = (wide || t) + Math.max(3, t * 1.6)
      for (let k = 1; k <= n; k++) {
        const at = (k * len) / (n + 1)
        ties.push([along ? cw : cl, along ? cl : cw, t + 0.5, pts[i].x + dir.x * at, pts[i].y + dir.y * at, pts[i].z + dir.z * at])
      }
    }
  }
  if (clips) {
    if (ties.length) boxes(g, M.black, ties)
    const w = (wide || t * 2.4) + 2
    boxes(g, M.white, [pts[0], pts[pts.length - 1]].map((p) => [w, Math.max(4, t * 2.2), t + 3.2, p.x, p.y, p.z + 1.4]))
  }
}

// ---------------------------------------------------------------- the special features

/** A row of copper bars round a rectangle: one turn of a flat coil. */
function loop(g: THREE.Object3D, w: number, h: number, t: number, z: number, mat: THREE.Material) {
  for (const s of [-1, 1]) {
    bx(g, w, t, t * 0.6, mat, 0, (s * (h - t)) / 2, z, false)
    bx(g, t, h, t * 0.6, mat, (s * (w - t)) / 2, 0, z, false)
  }
}

/** A special feature as the part it really is: each one has a shape of its own, so that it can be told apart at a glance. */
function drawFeature(c: Comp, g: THREE.Group, a: number, b: number, h: number) {
  const top = h / 2
  const v = c.v ?? 0
  const s = Math.min(a, b)
  switch (c.model) {
    case 'sat': {
      // a ceramic patch aerial with its silver patch and feed, and the radio in its can beside it, on a small board
      bx(g, a, b, h * 0.22, M.pcb[0], 0, 0, -top + h * 0.11)
      const tile = Math.min(a * 0.52, b * 0.92)
      const px = -a / 2 + tile / 2 + a * 0.04
      rb(g, tile, tile, h * 0.5, Math.min(0.5, tile * 0.05), M.ceramic, px, 0, -top + h * 0.47)
      face(g, tile * 0.7, tile * 0.7, M.alu, px, 0, -top + h * 0.72 + 0.02)
      cy(g, tile * 0.1, h * 0.1, M.gold, px + tile * 0.14, tile * 0.14, -top + h * 0.75, true)
      const cw = a * 0.36
      rb(g, cw, b * 0.74, h * 0.62, 0.2, M.steel, a / 2 - cw / 2 - a * 0.04, 0, -top + h * 0.53)
      face(g, cw * 0.7, b * 0.3, printed('SAT', 'etch'), a / 2 - cw / 2 - a * 0.04, 0, -top + h * 0.84 + 0.02)
      // the short coaxial lead between them
      const lead = part(g, CYL_LOW, M.black, h * 0.14, h * 0.14, a * 0.16, a / 2 - cw - a * 0.08, -b * 0.3, -top + h * 0.4, false)
      lead.rotation.y = Math.PI / 2
      break
    }
    case 'nfc': {
      // a flat rectangular spiral of copper on a ferrite sheet, its two contacts at one end
      bx(g, a, b, h * 0.45, M.ferrite, 0, 0, -top + h * 0.22, false)
      const t = Math.max(0.25, s * 0.035)
      for (let i = 0; i < 6; i++) {
        const k = 1 - i * 0.12
        loop(g, a * 0.92 * k, b * 0.9 * k, t, -top + h * 0.6, M.copper)
      }
      for (const sy of [-1, 1]) bx(g, t * 2.4, t * 2, h * 0.3, M.gold, a * 0.47 - t * 1.2, sy * t * 1.6, -top + h * 0.7, false)
      break
    }
    case 'wireless': {
      // litz wire wound flat on a ferrite disc, and round it the ring of magnets that lines the charger up
      const dia = s
      cy(g, dia * 0.86, h * 0.3, M.ferrite, 0, 0, -top + h * 0.15, true)
      for (let i = 0; i < 9; i++) {
        const o = part(g, RING, M.copper, dia * (0.8 - i * 0.06), dia * (0.8 - i * 0.06), 1, 0, 0, -top + h * 0.34, false)
        ;(o.material as THREE.Material).side = THREE.DoubleSide
      }
      const n = 18
      for (let i = 0; i < n; i++) {
        const an = (i / n) * Math.PI * 2
        const m = bx(g, dia * 0.07, dia * 0.035, h * 0.4, v === 1 ? M.gold : M.darkSteel, Math.cos(an) * dia * 0.46, Math.sin(an) * dia * 0.46, -top + h * 0.2, false)
        m.rotation.z = an
      }
      for (const sx of [-1, 1]) bx(g, dia * 0.035, dia * 0.22, h * 0.2, M.copper, sx * dia * 0.03, -dia * 0.5, -top + h * 0.3, false)
      break
    }
    case 'uwb': {
      // three small gold aerials set out in an L, a known distance apart, and the radio between them
      bx(g, a, b, h * 0.3, M.pcb[2], 0, 0, -top + h * 0.15)
      const p = s * 0.28
      for (const [x, y] of [[-0.3, 0.28], [0.3, 0.28], [-0.3, -0.28]] as const) {
        bx(g, p, p, h * 0.25, M.gold, x * a, y * b, -top + h * 0.42, false)
        cy(g, p * 0.16, h * 0.3, M.copper, x * a + p * 0.2, y * b, -top + h * 0.5, true)
      }
      rb(g, s * 0.32, s * 0.32, h * 0.6, 0.15, M.steel, a * 0.26, -b * 0.24, -top + h * 0.6)
      break
    }
    case 'stylus': {
      // the silo: a channel open at the top; in it the pen, its tip at the bottom edge, the catch spring at the far end
      const len = b
      const dia = Math.min(a, h) * 0.78
      bx(g, a, len, h * 0.12, M.black, 0, 0, -top + h * 0.06, false)
      for (const sx of [-1, 1]) bx(g, a * 0.08, len, h * 0.85, M.black, (sx * (a - a * 0.08)) / 2, 0, -top + h * 0.42, false)
      const pen = new THREE.Group()
      pen.rotation.x = Math.PI / 2
      pen.position.z = -top + h * 0.12 + dia / 2
      g.add(pen)
      part(pen, CYL, M.penBody, dia, dia, len * 0.82, 0, len * 0.04, 0)
      part(pen, CYL, M.grey, dia * 0.6, dia * 0.6, len * 0.08, 0, -len * 0.41, 0)
      part(pen, CYL, M.black, dia * 0.22, dia * 0.22, len * 0.05, 0, -len * 0.47, 0)
      // the band where it charges, and the spring catch behind it
      part(pen, CYL, M.gold, dia * 1.02, dia * 1.02, len * 0.03, 0, len * 0.3, 0)
      for (let i = 0; i < 5; i++) {
        const r = part(g, TORUS, M.steel, dia * 1.1, dia * 1.1, dia * 0.6, 0, len / 2 - len * 0.015 - i * dia * 0.18, -top + h * 0.12 + dia / 2, false)
        r.rotation.x = Math.PI / 2
      }
      break
    }
    case 'ir': {
      // a small board with the infrared lamp, its dome lens, and the dark window it shines through at the top edge
      bx(g, a, b, h * 0.3, M.pcb[1], 0, 0, -top + h * 0.15)
      const o = part(g, BALL, M.irWindow, s * 0.55, s * 0.55, s * 0.55, -a * 0.1, 0, -top + h * 0.35)
      o.scale.z = Math.min(s * 0.55, h * 0.9)
      bx(g, a * 0.9, b * 0.16, h * 0.6, M.irWindow, 0, b / 2 - b * 0.08, -top + h * 0.6, false)
      bx(g, s * 0.2, s * 0.14, h * 0.2, M.gold, a * 0.32, -b * 0.2, -top + h * 0.38, false)
      break
    }
    case 'stereo': {
      // a sealed speaker box with its steel mesh face, a rubber gasket round it, and the flex tail to the board
      rb(g, a, b, h * 0.8, Math.min(a, b, h) * 0.12, M.black, 0, 0, -top + h * 0.4)
      face(g, a * 0.74, b * 0.6, M.darkSteel, 0, 0, -top + h * 0.8 + 0.02)
      for (let i = 0; i < 7; i++) bx(g, a * 0.7, b * 0.025, 0.06, M.grey, 0, (i - 3) * b * 0.08, -top + h * 0.8 + 0.06, false)
      loop(g, a * 0.86, b * 0.76, Math.max(0.25, b * 0.06), -top + h * 0.82, M.rubber)
      bx(g, a * 0.18, b * 0.6, h * 0.15, M.flex, a * 0.55, 0, -top + h * 0.1, false)
      break
    }
    case 'haptics': {
      // the case of a linear motor, its lid cut away: the tungsten mass between two springs, and the coil under it
      const t = Math.max(0.12, Math.min(a, b) * 0.05)
      bx(g, a, b, h * 0.1, M.steel, 0, 0, -top + h * 0.05)
      for (const sy of [-1, 1]) bx(g, a, t, h * 0.9, M.steel, 0, (sy * (b - t)) / 2, -top + h * 0.5, false)
      for (const sx of [-1, 1]) bx(g, t, b, h * 0.9, M.steel, (sx * (a - t)) / 2, 0, -top + h * 0.5, false)
      bx(g, a * 0.36, b * 0.62, h * 0.55, M.tungsten, 0, 0, -top + h * 0.45)
      cy(g, Math.min(a * 0.3, b * 0.5), h * 0.2, M.copper, 0, 0, -top + h * 0.2, true)
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const r = part(g, TORUS, M.ribbon, b * 0.4, b * 0.4, b * 0.3, sx * (a * 0.24 + i * a * 0.055), 0, -top + h * 0.45, false)
          r.rotation.y = Math.PI / 2
        }
      }
      bx(g, a * 0.6, b * 0.3, top * 0.02 + 0.08, M.steel, -a * 0.2, 0, top, false)
      bx(g, a * 0.2, 1.2, h * 0.3, M.flex, 0, b / 2 + 0.4, -top + h * 0.15, false)
      break
    }
    case 'face': {
      // a bracket carrying, left to right, the infrared camera, the flood lamp and the dot projector
      rb(g, a, b, h * 0.32, Math.min(0.4, b * 0.08), M.alu, 0, 0, -top + h * 0.16)
      const lens = Math.min(b * 0.8, a * 0.22)
      const barrel = (x: number, dia: number, tall: number, mat: THREE.Material, glass: THREE.Material) => {
        cy(g, dia, tall, M.darkSteel, x, 0, -top + h * 0.32 + tall / 2, true)
        face(g, dia * 0.72, dia * 0.72, glass, x, 0, -top + h * 0.32 + tall + 0.02, true)
        part(g, RING, mat, dia * 0.86, dia * 0.86, 1, x, 0, -top + h * 0.32 + tall + 0.03, false)
      }
      barrel(-a * 0.33, lens, h * 0.62, M.steel, M.glass)
      bx(g, lens * 0.6, lens * 0.6, h * 0.36, M.black, -a * 0.04, 0, -top + h * 0.5)
      face(g, lens * 0.42, lens * 0.42, M.ledOff, -a * 0.04, 0, -top + h * 0.68 + 0.02)
      barrel(a * 0.3, lens * 1.05, h * 0.68, M.steel, M.dotLens)
      bx(g, a * 0.12, b * 0.5, h * 0.12, M.flex, a / 2, 0, -top + h * 0.1, false)
      break
    }
    case 'gasket': {
      // the adhesive seal round the opening, and a second line inside it for the higher grades
      const t = Math.max(0.5, Math.min(1.4, s * 0.02))
      loop(g, a, b, t, 0, M.seal)
      if (v >= 1) loop(g, a - t * 3.2, b - t * 3.2, t * 0.7, 0, M.seal)
      if (v >= 2) loop(g, a - t * 6, b - t * 6, t * 0.5, 0, M.rubber)
      break
    }
    case 'mmwave': {
      // a strip of four patch aerials steered as one beam, with its radio chip at one end
      bx(g, a, b, h * 0.3, M.pcb[1], 0, 0, -top + h * 0.15)
      const p = Math.min(b * 0.62, (a * 0.7) / 4)
      for (let i = 0; i < 4; i++) bx(g, p, p, h * 0.2, M.gold, -a / 2 + a * 0.08 + p / 2 + i * p * 1.35, 0, -top + h * 0.4, false)
      rb(g, a * 0.2, b * 0.7, h * 0.6, 0.15, M.steel, a / 2 - a * 0.12, 0, -top + h * 0.6)
      break
    }
    case 'mobo':
      drawBoard(g, a, b, h, v === 1)
      break
    case 'stockcooler': {
      // a round finned block with a fan on it, the stock cooler in the box with the processor
      const dia = Math.min(a, b)
      cy(g, dia * 0.86, h * 0.55, M.alu, 0, 0, -top + h * 0.28)
      for (let i = 0; i < 24; i++) {
        const an = (i / 24) * Math.PI * 2
        const f = bx(g, dia * 0.2, 0.8, h * 0.5, M.alu, Math.cos(an) * dia * 0.38, Math.sin(an) * dia * 0.38, -top + h * 0.28, false)
        f.rotation.z = an
      }
      part(g, RING, M.black, dia * 0.9, dia * 0.9, 1, 0, 0, -top + h * 0.6, false)
      rotor(g, dia * 0.8, h * 0.18, -top + h * 0.68)
      if (c.glow) part(g, RING, glowMat(c.glow), dia * 0.84, dia * 0.84, 1, 0, 0, -top + h * 0.62, false)
      cy(g, dia * 0.28, h * 0.08, c.glow ? glowMat(c.glow) : M.black, 0, 0, top - h * 0.18, true)
      break
    }
    case 'aircooler': {
      // a tower of thin fins on four heat pipes, a fan clipped to its front and a cap on top; low-profile, the fan lies on it
      const lowP = v === 1
      const fins = Math.max(12, Math.round((lowP ? h * 0.5 : h * 0.82) / 2.2))
      const finH = lowP ? h * 0.5 : h * 0.82
      const z0 = -top + h - finH
      const plates = new THREE.InstancedMesh(BOX, M.alu, fins)
      const m4 = new THREE.Matrix4()
      for (let i = 0; i < fins; i++) plates.setMatrixAt(i, m4.makeScale(a * 0.92, b, 0.4).setPosition(0, 0, z0 + ((i + 0.5) * finH) / fins))
      plates.castShadow = plates.receiveShadow = true
      g.add(plates)
      bx(g, a * 0.6, Math.min(44, b * 0.4), 9, M.copper, 0, 0, -top + 4.5)
      for (let i = 0; i < 4; i++) cy(g, 6, h * 0.95, M.copper, (i % 2 ? 1 : -1) * a * 0.18, (i - 1.5) * Math.min(12, b * 0.1), -top + h * 0.48, true)
      if (lowP) {
        part(g, RING, M.black, Math.min(a, b) * 0.98, Math.min(a, b) * 0.98, 1, 0, 0, top + 0.1, false)
        rotor(g, Math.min(a, b) * 0.9, 6, top - 3)
      } else {
        // the fan stands on the front face of the stack, its axis across it
        const fanG = new THREE.Group()
        fanG.rotation.y = -Math.PI / 2
        fanG.position.set(-a / 2 - 13, 0, z0 + finH / 2)
        g.add(fanG)
        const fd = Math.min(b, finH) * 0.98
        for (const s of [-1, 1]) {
          bx(fanG, fd, 4, 25, M.black, 0, (s * (fd - 4)) / 2, 0, false)
          bx(fanG, 4, fd, 25, M.black, (s * (fd - 4)) / 2, 0, 0, false)
        }
        part(fanG, RING, M.black, fd * 0.96, fd * 0.96, 25, 0, 0, 0, false)
        rotor(fanG, fd * 0.88, 8, 0)
        if (c.glow) part(fanG, RING, glowMat(c.glow), fd * 0.9, fd * 0.9, 1, 0, 0, 12.6, false)
        bx(g, a * 0.98, b * 1.01, 8, M.black, 0, 0, top - 4)
        if (c.glow) bx(g, a * 0.7, b * 0.85, 1, glowMat(c.glow), 0, 0, top + 0.2, false)
      }
      break
    }
    case 'pump': {
      // the pump block on the processor: a ring of light round a polished cap, and the two hose fittings
      const dia = Math.min(a, b)
      rb(g, dia * 0.9, dia * 0.9, h * 0.25, 2, M.darkSteel, 0, 0, -top + h * 0.12)
      cy(g, dia * 0.86, h * 0.7, M.black, 0, 0, -top + h * 0.6, true)
      part(g, RING, c.glow ? glowMat(c.glow) : M.steel, dia * 0.84, dia * 0.84, 1, 0, 0, top - h * 0.04, false)
      part(g, DISC, M.glass, dia * 0.64, dia * 0.64, 1, 0, 0, top - h * 0.03, false)
      for (const s of [-1, 1]) {
        const o = part(g, CYL, M.steel, dia * 0.16, dia * 0.16, dia * 0.22, dia * 0.5, s * dia * 0.18, 0, true)
        o.rotation.z = Math.PI / 2
      }
      break
    }
    case 'radiator': {
      const t = turned(g, c.axis, a, b, h)
      const n = Math.max(1, c.n ?? 2)
      const along = t.a >= t.b
      const len = along ? t.a : t.b
      const wide = along ? t.b : t.a
      // the core of fins and tubes, the end tanks, and the fans pushing air through it from below
      const coreT = t.h * 0.5
      bx(t.g, t.a * (along ? 0.88 : 1), t.b * (along ? 1 : 0.88), coreT, M.black, 0, 0, t.h / 2 - coreT / 2)
      const lines = 30
      for (let i = 0; i < lines; i++) {
        const k = (i + 0.5) / lines - 0.5
        bx(t.g, along ? 0.6 : t.a * 0.98, along ? t.b * 0.98 : 0.6, coreT + 0.2, M.darkSteel, along ? k * len * 0.86 : 0, along ? 0 : k * len * 0.86, t.h / 2 - coreT / 2, false)
      }
      for (const s of [-1, 1]) bx(t.g, along ? len * 0.06 : wide, along ? wide : len * 0.06, coreT * 1.1, M.black, along ? (s * len * 0.47) : 0, along ? 0 : s * len * 0.47, t.h / 2 - coreT / 2)
      const fd = Math.min(len / n, wide) * 0.96
      for (let i = 0; i < n; i++) {
        const k = (i - (n - 1) / 2) * (len / n)
        const fx = along ? k : 0
        const fy = along ? 0 : k
        const fz = -t.h / 2 + t.h * 0.24
        part(t.g, RING, M.black, fd, fd, t.h * 0.46, fx, fy, fz, false)
        rotor(t.g, fd * 0.88, 6, fz).position.set(fx, fy, fz)
        if (c.glow) part(t.g, RING, glowMat(c.glow), fd * 0.92, fd * 0.92, 1, fx, fy, -t.h / 2 + 0.1, false)
      }
      break
    }
    case 'ram': {
      // a memory module on edge: its board between two heat spreaders, and a light bar along the top
      bx(g, a * 0.25, b, h * 0.9, M.pcb[0], 0, 0, -top + h * 0.45)
      for (const s of [-1, 1]) bx(g, a * 0.32, b * 0.97, h * 0.82, M.darkSteel, s * a * 0.32, 0, -top + h * 0.47)
      bx(g, a * 0.95, b * 0.96, h * 0.12, c.glow ? glowMat(c.glow) : M.white, 0, 0, top - h * 0.06, false)
      break
    }
    case 'gpu': {
      // a graphics card out of its slot: the board and backplate on top, the shroud and fans facing down, its bracket at the back, the lit edge towards the window
      bx(g, a, 1.6, h * 0.92, M.pcb[1], 0, b / 2 - 4, -h * 0.04)
      bx(g, a * 0.99, 2, h * 0.92, M.darkSteel, 0, b / 2 - 1, -h * 0.04)
      rb(g, a * 0.97, b - 6, h * 0.95, 3, v === 1 ? M.grey : M.wrap, -a * 0.01, -3, 0)
      // fins showing between the fans
      for (let i = 0; i < 18; i++) bx(g, 0.6, (b - 8) * 0.8, h * 0.8, M.alu, -a / 2 + ((i + 0.5) * a) / 18, -3, 0, false)
      const under = new THREE.Group()
      under.rotation.x = Math.PI / 2
      under.position.y = -b / 2 + 0.2
      g.add(under)
      const n = Math.max(1, c.n ?? 2)
      const dia = Math.min((a / n) * 0.9, h * 0.84)
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * (a / n) - a * 0.02
        part(under, RING, M.black, dia * 1.04, dia * 1.04, 1, x, 0, -0.1, false)
        rotor(under, dia * 0.92, 3, -1.6).position.x = x
        if (c.glow && v >= 2) part(under, RING, glowMat(c.glow), dia * 0.99, dia * 0.99, 1, x, 0, -0.2, false)
      }
      bx(g, 1.4, b, h * 0.98, M.steel, a / 2 + 0.7, 0, 0)
      for (let i = 0; i < 3; i++) bx(g, 1.6, 4.6, 12, M.black, a / 2 + 1.6, -b * 0.15, -h * 0.3 + i * 15, false)
      // the edge seen through the glass: a light bar if it is lit, the name if not, and the power plug
      if (c.glow) bx(g, a * 0.6, Math.min(4, b * 0.12), 1, glowMat(c.glow), -a * 0.1, -b * 0.15, h / 2 + 0.4, false)
      else face(g, a * 0.32, Math.min(10, b * 0.4), printed('GRAPHICS', 'etch'), -a * 0.1, 0, h / 2 + 0.05)
      bx(g, 18, 8, 10, M.black, -a * 0.18, b / 2 - 8, h / 2)
      break
    }
    case 'shroud': {
      // the steel cover over the power supply along the floor, with the badge on its side
      bx(g, a, 1.4, h, M.zinc, 0, b / 2 - 0.7, 0)
      bx(g, a, b, 1.4, M.zinc, 0, 0, top - 0.7)
      face(g, Math.min(60, a * 0.25), Math.min(16, b * 0.3), printed('POWER', 'etch'), -a * 0.2, 0, top + 0.05)
      for (let i = 0; i < 9; i++) bx(g, 2, b * 0.4, 0.3, M.black, a * 0.18 + i * 5, -b * 0.1, top + 0.1, false)
      if (c.glow) bx(g, a * 0.94, 2, 1.4, glowMat(c.glow), 0, b / 2 - 2, top - 1)
      break
    }
    case 'casefan': {
      const t = turned(g, c.axis, a, b, h)
      const fd = Math.min(t.a, t.b)
      const bar = Math.max(3, fd * 0.04)
      for (const s of [-1, 1]) {
        bx(t.g, fd, bar, t.h, M.black, 0, (s * (fd - bar)) / 2, 0, false)
        bx(t.g, bar, fd, t.h, M.black, (s * (fd - bar)) / 2, 0, 0, false)
      }
      part(t.g, RING, M.black, fd * 0.98, fd * 0.98, t.h, 0, 0, 0, false)
      rotor(t.g, fd * 0.88, t.h * 0.4, 0)
      if (c.glow) {
        part(t.g, RING, glowMat(c.glow), fd * 0.94, fd * 0.94, 1, 0, 0, t.h / 2 + 0.1, false)
        part(t.g, RING, glowMat(c.glow), fd * 0.94, fd * 0.94, 1, 0, 0, -t.h / 2 - 0.1, false)
        cy(t.g, fd * 0.3, t.h * 0.42, glowMat(c.glow), 0, 0, 0, true)
      }
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) bx(t.g, bar * 1.4, bar * 1.4, t.h + 0.4, M.rubber, (sx * (fd - bar * 1.4)) / 2, (sy * (fd - bar * 1.4)) / 2, 0, false)
      break
    }
    case 'mousesensor':
      bx(g, a, b, h * 0.6, M.black, 0, 0, -top + h * 0.3)
      part(g, BALL, M.lensGlass, Math.min(a, b) * 0.4, Math.min(a, b) * 0.4, h * 0.6, 0, b * 0.15, -top)
      bx(g, a * 0.2, b * 0.1, h * 0.3, M.red, a * 0.3, -b * 0.3, -top + h * 0.15, false)
      break
    case 'switch':
      // a button switch: its housing, the plunger the button presses, and (hot-swap) the socket it sits in
      bx(g, a, b, h * 0.7, M.black, 0, 0, -top + h * 0.35)
      bx(g, a * 0.3, b * 0.3, h * 0.4, v === 1 ? M.blueCap : M.red, 0, 0, top - h * 0.2)
      if (v === 1) bx(g, a * 1.1, b * 1.1, h * 0.15, M.gold, 0, 0, -top + 0.1, false)
      break
    case 'wheel': {
      const t = turned(g, c.axis, a, b, h)
      const dia = Math.min(t.a, t.b)
      cy(t.g, dia, t.h * 0.8, v === 2 ? M.alu : M.rubber, 0, 0, 0)
      // a tilting wheel rocks on two pins at the ends of its axle
      if (v === 1) for (const s of [-1, 1]) bx(t.g, dia * 0.2, dia * 0.2, t.h * 0.3, M.gold, 0, 0, s * t.h * 0.75, false)
      const ridges = 24
      for (let i = 0; i < ridges; i++) {
        const an = (i / ridges) * Math.PI * 2
        const rg = bx(t.g, dia * 0.06, dia * 0.06, t.h * 0.78, M.black, Math.cos(an) * dia * 0.5, Math.sin(an) * dia * 0.5, 0, false)
        rg.rotation.z = an
      }
      cy(t.g, dia * 0.4, t.h * 0.84, c.glow ? glowMat(c.glow) : M.steel, 0, 0, 0, true)
      cy(t.g, 2, t.h * 1.4, M.steel, 0, 0, 0, true)
      break
    }
    case 'weight':
      // a tungsten slug with its screw cap and the slot a coin turns it by
      cy(g, Math.min(a, b), h * 0.85, M.tungsten, 0, 0, -h * 0.075)
      cy(g, Math.min(a, b) * 0.8, h * 0.15, M.steel, 0, 0, top - h * 0.075, true)
      bx(g, Math.min(a, b) * 0.6, Math.min(a, b) * 0.1, h * 0.05, M.black, 0, 0, top, false)
      break
    case 'esim':
      bx(g, a, b, h * 0.7, M.black, 0, 0, -top + h * 0.35)
      face(g, a * 0.8, b * 0.5, printed('eSIM', 'etch'), 0, 0, -top + h * 0.7 + 0.02)
      for (let i = 0; i < 4; i++) bx(g, a * 0.12, b * 0.1, h * 0.3, M.gold, (i - 1.5) * a * 0.24, -b / 2, -top + h * 0.15, false)
      break
    default:
      if (!drawMore(c.model ?? '', g, a, b, h, v, c.glow)) {
        // nothing knows this model: a plain block, marked so that a test can tell
        g.userData.generic = true
        rb(g, a, b, h, Math.min(a, b, h) * 0.12, M.steel)
      }
  }
}

/** A chip package on its own: the body, a lid or die, and its pins or balls. `look` tells the kinds apart. */
function chipPart(g: THREE.Group, a: number, b: number, h: number, look: 'lid' | 'grid' | 'stack' | 'qfn' | 'bga' | 'sim') {
  const top = h / 2
  bx(g, a, b, h * 0.7, M.black, 0, 0, -top + h * 0.35)
  const s = Math.min(a, b)
  if (look === 'lid') rb(g, a * 0.8, b * 0.8, h * 0.3, s * 0.05, M.steel, 0, 0, top - h * 0.15)
  if (look === 'grid') for (let i = 0; i < 4; i++) bx(g, a * 0.34, b * 0.34, h * 0.1, M.graphite, (i % 2 ? 1 : -1) * a * 0.2, (i < 2 ? 1 : -1) * b * 0.2, top - h * 0.25, false)
  if (look === 'stack') for (let i = 0; i < 3; i++) bx(g, a * (0.9 - i * 0.1), b * (0.9 - i * 0.1), h * 0.1, i % 2 ? M.grey : M.black, 0, 0, -top + h * (0.75 + i * 0.1), false)
  if (look === 'bga') bx(g, a * 0.5, b * 0.5, h * 0.2, M.lensGlass, 0, 0, top - h * 0.2)
  const pins = look === 'qfn' ? 6 : 4
  if (look === 'qfn' || look === 'sim')
    for (let i = 0; i < pins; i++) for (const sy of [-1, 1]) bx(g, a * 0.08, b * 0.12, h * 0.3, M.gold, (i - (pins - 1) / 2) * (a / pins), (sy * b) / 2, -top + h * 0.15, false)
  else for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) part(g, BALL, M.zinc, s * 0.08, s * 0.08, h * 0.2, (i - 2) * a * 0.18, (j - 2) * b * 0.18, -top, false)
}

/** A small board under a part, the colour of the device's boards. */
const plate = (g: THREE.Group, a: number, b: number, h: number, k = 0.25, i = 0) => bx(g, a, b, h * k, M.pcb[i], 0, 0, -h / 2 + (h * k) / 2)

/**
 * The models of the features that have no socket outside (health sensors, radios, sheets under the screen, the
 * mechanical extras of mice and drones): each one is drawn as the part it is. False when the model is not known.
 */
function drawMore(model: string, g: THREE.Group, a: number, b: number, h: number, v: number, glow?: string): boolean {
  const top = h / 2
  const s = Math.min(a, b)
  switch (model) {
    case 'ppg': {
      // a disc (or a strip, in a ring or a bud) with lamps round photodiodes: green for the pulse, red and infrared for oxygen
      const round = v === 0 || v === 1
      if (round) cy(g, s, h * 0.4, M.black, 0, 0, -top + h * 0.2)
      else rb(g, a, b, h * 0.4, s * 0.2, M.black, 0, 0, -top + h * 0.2)
      if (round) part(g, DOME, M.lensGlass, s * 0.48, s * 0.48, h * 0.6, 0, 0, -top + h * 0.4)
      const lamps = v === 1 ? [M.redLed, M.redLed, M.irWindow] : [M.green, M.green]
      const n = round ? 4 : 2
      for (let i = 0; i < n; i++) {
        const an = (i / n) * Math.PI * 2 + 0.4
        const r = round ? s * 0.3 : a * 0.3
        bx(g, s * 0.12, s * 0.12, h * 0.3, lamps[i % lamps.length], Math.cos(an) * r, round ? Math.sin(an) * r : 0, -top + h * 0.55, false)
      }
      for (const sx of [-1, 1]) bx(g, s * 0.16, s * 0.1, h * 0.2, M.graphite, round ? sx * s * 0.12 : 0, round ? -sx * s * 0.12 : sx * b * 0.25, -top + h * 0.5, false)
      bx(g, a * 0.14, b * 0.5, h * 0.2, M.flex, a * 0.55, 0, -top + h * 0.1, false)
      return true
    }
    case 'gps': {
      // a square ceramic patch with its silver top and feed pin, on a ground plane (on a drone, raised on a short mast)
      const z0 = v === 1 ? -top + h * 0.5 : -top
      if (v === 1) cy(g, s * 0.12, h * 0.5, M.black, 0, 0, -top + h * 0.25)
      bx(g, a, b, h * 0.12, M.pcb[0], 0, 0, z0 + h * 0.06)
      rb(g, s * 0.7, s * 0.7, h * (v === 1 ? 0.3 : 0.6), s * 0.04, M.ceramic, 0, 0, z0 + h * (v === 1 ? 0.27 : 0.42))
      face(g, s * 0.5, s * 0.5, M.alu, 0, 0, z0 + h * (v === 1 ? 0.43 : 0.73))
      cy(g, s * 0.08, h * 0.1, M.gold, s * 0.08, s * 0.08, z0 + h * (v === 1 ? 0.45 : 0.75), true)
      return true
    }
    case 'modem': {
      plate(g, a, b, h, 0.25, 2)
      rb(g, a * 0.62, b * 0.8, h * 0.6, 0.15, M.steel, -a * 0.12, 0, -top + h * 0.55)
      for (let i = 0; i < 6; i++) bx(g, a * 0.5, 0.05, 0.05, M.darkSteel, -a * 0.12, (i - 2.5) * b * 0.12, top - h * 0.12, false)
      for (const sy of [-1, 1]) {
        cy(g, s * 0.12, h * 0.4, M.gold, a * 0.36, sy * b * 0.3, -top + h * 0.45, true)
        const lead = part(g, CYL_LOW, M.black, s * 0.06, s * 0.06, a * 0.4, a * 0.56, sy * b * 0.3, -top + h * 0.55, false)
        lead.rotation.y = Math.PI / 2
      }
      return true
    }
    case 'electrode': {
      // titanium rings in the sensor window and the crown's contact, or two pads in a band
      const t = Math.max(0.3, s * 0.06)
      if (v === 0) {
        for (const k of [1, 0.66]) part(g, RING, M.titanium, s * k, s * k, 1, 0, 0, top, false)
        cy(g, s * 0.64, h * 0.4, M.black, 0, 0, -top + h * 0.3)
        bx(g, s * 0.2, s * 0.6, h * 0.2, M.flex, s * 0.5, 0, -top + h * 0.1, false)
      } else for (const sx of [-1, 1]) rb(g, a * 0.4, b * 0.8, h * 0.8, t, M.titanium, sx * a * 0.26, 0, 0)
      return true
    }
    case 'thermistor': {
      bx(g, a, b * 0.5, h * 0.4, M.flex, 0, 0, -top + h * 0.2, false)
      rb(g, b * 0.9, b * 0.9, h, b * 0.2, M.copper, -a / 2 + b * 0.5, 0, 0)
      bx(g, b * 0.3, b * 0.2, h * 0.5, M.black, -a / 2 + b * 0.5, 0, top, false)
      bx(g, b * 0.5, b * 0.6, h * 0.5, M.gold, a / 2 - b * 0.3, 0, -top + h * 0.3, false)
      return true
    }
    case 'pressure': {
      // a soft air pad and the pressure sensor in its steel can over it
      rb(g, a, b, h * 0.5, Math.min(b, h) * 0.24, M.rubber, 0, 0, -top + h * 0.25)
      cy(g, s * 0.5, h * 0.5, M.steel, 0, 0, -top + h * 0.7, true)
      cy(g, s * 0.1, h * 0.1, M.black, 0, 0, top, true)
      bx(g, a * 0.16, b * 0.4, h * 0.2, M.flex, a * 0.55, 0, -top + h * 0.1, false)
      return true
    }
    case 'spectro': {
      cy(g, s, h * 0.4, M.black, 0, 0, -top + h * 0.2)
      const cols = [M.redLed, M.amberLed, M.green, M.blue, M.ledOff, M.redLed, M.amberLed, M.green]
      cols.forEach((m, i) => {
        const an = (i / cols.length) * Math.PI * 2
        bx(g, s * 0.1, s * 0.1, h * 0.3, m, Math.cos(an) * s * 0.38, Math.sin(an) * s * 0.38, -top + h * 0.55, false)
      })
      for (let i = 0; i < 9; i++) bx(g, s * 0.12, s * 0.12, h * 0.2, M.graphite, ((i % 3) - 1) * s * 0.15, (Math.floor(i / 3) - 1) * s * 0.15, -top + h * 0.5, false)
      part(g, DOME, M.lensGlass, s * 0.5, s * 0.5, h * 0.5, 0, 0, -top + h * 0.4)
      return true
    }
    case 'imu': {
      // a MEMS package with its lid cut away: the proof mass on its springs and the comb fingers that read it
      bx(g, a, b, h * 0.3, M.black, 0, 0, -top + h * 0.15)
      const t = s * 0.08
      for (const sx of [-1, 1]) bx(g, t, b * 0.9, h * 0.6, M.grey, (sx * (a - t)) / 2, 0, -top + h * 0.5, false)
      for (const sy of [-1, 1]) bx(g, a * 0.9, t, h * 0.6, M.grey, 0, (sy * (b - t)) / 2, -top + h * 0.5, false)
      bx(g, a * 0.44, b * 0.44, h * 0.4, M.alu, 0, 0, -top + h * 0.5)
      for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) bx(g, a * 0.14, s * 0.03, h * 0.25, M.steel, sx * a * 0.31, (i - 2) * b * 0.08, -top + h * 0.5, false)
      if (v >= 2) cy(g, s * 0.25, h * 0.3, M.copper, 0, 0, top - h * 0.1, true)
      if (v === 3) rb(g, a * 1.1, b * 1.1, h * 0.2, 0.1, M.rubber, 0, 0, -top - h * 0.05)
      return true
    }
    case 'eda': {
      bx(g, a, b, h * 0.4, M.flex, 0, 0, -top + h * 0.2, false)
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) bx(g, a * 0.3, b * 0.08, h * 0.4, M.gold, sx * a * 0.25, (i - 1) * b * 0.25, top - h * 0.2, false)
      bx(g, a * 0.12, b * 0.6, h * 0.5, M.titanium, 0, 0, top - h * 0.2, false)
      return true
    }
    case 'wifimod': {
      // an M.2 card: gold edge fingers, the radio under its shield, two aerial sockets with their leads
      bx(g, a, b, h * 0.25, M.pcb[v === 1 ? 2 : 1], 0, 0, -top + h * 0.12)
      for (let i = 0; i < 9; i++) bx(g, a * 0.06, b * 0.08, h * 0.27, M.gold, (i - 4) * a * 0.1, -b / 2 + b * 0.04, -top + h * 0.12, false)
      rb(g, a * 0.7, b * 0.5, h * 0.45, 0.15, M.steel, 0, b * 0.05, -top + h * 0.47)
      for (const sx of [-1, 1]) {
        cy(g, s * 0.12, h * 0.3, M.gold, sx * a * 0.25, b * 0.4, -top + h * 0.4, true)
        bx(g, s * 0.05, b * 0.6, s * 0.05, sx < 0 ? M.black : M.pale, sx * a * 0.25, b * 0.72, -top + h * 0.55, false)
      }
      if (v === 2) bx(g, a * 0.06, b * 1.05, h * 1.6, M.steel, a / 2, 0, 0)
      return true
    }
    case 'touchpad': {
      bx(g, a, b, h * 0.5, M.flex, 0, 0, -top + h * 0.25, false)
      for (let i = 0; i < 6; i++) {
        bx(g, a * 0.86, s * 0.04, h * 0.3, M.copper, 0, (i - 2.5) * b * 0.15, top - h * 0.15, false)
        bx(g, s * 0.04, b * 0.86, h * 0.3, M.copper, (i - 2.5) * a * 0.15, 0, top - h * 0.15, false)
      }
      bx(g, a * 0.2, b * 0.7, h * 0.5, M.flex, a * 0.6, 0, -top + h * 0.25, false)
      return true
    }
    case 'prox': {
      bx(g, a, b, h * 0.6, M.black, 0, 0, -top + h * 0.3)
      for (const sx of [-1, 1]) part(g, DOME, sx < 0 ? M.irWindow : M.lensGlass, a * 0.3, a * 0.3, h * 0.5, sx * a * 0.22, 0, -top + h * 0.6)
      return true
    }
    case 'btradio': {
      plate(g, a, b, h, 0.3, v === 1 ? 2 : 0)
      rb(g, a * 0.55, b * 0.7, h * 0.5, 0.1, M.steel, -a * 0.15, 0, -top + h * 0.55)
      // the folded chip aerial: a ceramic block with its meander line
      bx(g, a * 0.24, b * 0.5, h * 0.4, M.ceramic, a * 0.34, 0, -top + h * 0.5)
      for (let i = 0; i < 4; i++) bx(g, a * 0.2, b * 0.04, h * 0.05, M.alu, a * 0.34, (i - 1.5) * b * 0.1, -top + h * 0.72, false)
      return true
    }
    case 'mic': {
      cy(g, s, h * 0.7, M.steel, 0, 0, -top + h * 0.35)
      part(g, DISC, M.darkSteel, s * 0.8, s * 0.8, 1, 0, 0, -top + h * 0.71, false)
      for (let i = 0; i < 5; i++) bx(g, s * 0.7, s * 0.03, 0.04, M.black, 0, (i - 2) * s * 0.13, -top + h * 0.73, false)
      part(g, RING, M.rubber, s * 1.1, s * 1.1, 1, 0, 0, top, false)
      return true
    }
    case 'micarray': {
      bx(g, a, b, h * 0.3, M.pcb[v === 1 ? 0 : 1], 0, 0, -top + h * 0.15)
      const n = v === 1 ? 3 : 4
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * (a / n)
        cy(g, b * 0.42, h * 0.5, M.steel, x, 0, -top + h * 0.55, true)
        part(g, RING, M.rubber, b * 0.5, b * 0.5, 1, x, 0, -top + h * 0.82, false)
      }
      return true
    }
    case 'lightsensor': {
      bx(g, a, b, h * 0.2, M.pcb[1], 0, 0, -top + h * 0.1)
      bx(g, s * 0.3, s * 0.3, h * 0.2, M.black, 0, 0, -top + h * 0.3)
      part(g, DOME, M.diffuser, s * 0.9, s * 0.9, h * 0.75, 0, 0, -top + h * 0.25)
      return true
    }
    case 'lightguide': {
      // a clear sheet over the page, lit from a row of lamps along one edge
      bx(g, a, b, h * 0.7, M.acrylic, 0, 0, 0, false)
      bx(g, a, Math.max(1, b * 0.03), h, M.flex, 0, -b / 2 - b * 0.015, 0, false)
      const n = 12
      for (let i = 0; i < n; i++) bx(g, a * 0.03, Math.max(0.8, b * 0.02), h, i % 2 ? M.ledOff : M.amberLed, (i - (n - 1) / 2) * (a / n), -b / 2 + b * 0.01, 0, false)
      return true
    }
    case 'ledstrip': {
      bx(g, a, b, h * 0.4, M.flex, 0, 0, -top + h * 0.2, false)
      const n = 12
      for (let i = 0; i < n; i++) bx(g, (a / n) * 0.45, b * 0.7, h * 0.6, i % 2 ? M.amberLed : M.ledOff, (i - (n - 1) / 2) * (a / n), 0, -top + h * 0.7, false)
      return true
    }
    case 'pagekeys': {
      bx(g, a * 0.4, b, h * 0.2, M.flex, -a * 0.2, 0, -top + h * 0.1, false)
      for (const sy of [-1, 1]) {
        bx(g, a * 0.5, b * 0.18, h * 0.4, M.steel, 0, sy * b * 0.25, -top + h * 0.35)
        rb(g, a * 0.9, b * 0.4, h * 0.45, Math.min(a, b) * 0.15, M.graphite, a * 0.05, sy * b * 0.25, top - h * 0.22)
      }
      return true
    }
    case 'digitiser': {
      // a sheet of fine copper loops, the grid the pen's coil is found on
      bx(g, a, b, h * 0.5, M.film, 0, 0, -top + h * 0.25, false)
      const n = 14
      for (let i = 0; i < n; i++) {
        bx(g, a * 0.96, Math.max(0.3, b * 0.004), h * 0.4, M.copper, 0, (i - (n - 1) / 2) * (b / n), top - h * 0.2, false)
        bx(g, Math.max(0.3, a * 0.004), b * 0.96, h * 0.4, M.copper, (i - (n - 1) / 2) * (a / n), 0, top - h * 0.2, false)
      }
      return true
    }
    case 'colourfilter': {
      const n = 10
      const cols = [M.redLed, M.green, M.blue]
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) bx(g, (a / n) * 0.96, (b / n) * 0.96, h, cols[(i + j) % 3], (i - (n - 1) / 2) * (a / n), (j - (n - 1) / 2) * (b / n), 0, false)
      return true
    }
    case 'selfiescreen': {
      rb(g, a, b, h * 0.6, s * 0.05, M.black, 0, 0, -top + h * 0.3)
      face(g, a * 0.9, b * 0.9, M.eyeGlass, 0, 0, -top + h * 0.6 + 0.02)
      bx(g, a * 0.5, b * 0.2, h * 0.3, M.flex, 0, -b * 0.6, -top + h * 0.15, false)
      return true
    }
    case 'mountfingers': {
      for (const sx of [-1, 1]) {
        bx(g, a * 0.18, b, h * 0.9, M.black, sx * a * 0.18, 0, 0)
        cy(g, b * 0.5, a * 0.2, M.steel, sx * a * 0.18, 0, top - h * 0.2, true).rotation.y = Math.PI / 2
      }
      bx(g, a * 0.9, b * 0.3, h * 0.2, M.darkSteel, 0, 0, -top + h * 0.1)
      return true
    }
    case 'imagesensor': {
      bx(g, a, b, h * 0.4, M.ceramic, 0, 0, -top + h * 0.2)
      bx(g, a * 0.7, b * 0.6, h * 0.2, M.irWindow, 0, 0, -top + h * 0.5)
      bx(g, a * 0.8, b * 0.7, h * 0.15, M.lensGlass, 0, 0, top - h * 0.1, false)
      for (let i = 0; i < 8; i++) bx(g, a * 0.05, b * 0.08, h * 0.2, M.gold, (i - 3.5) * a * 0.11, -b / 2 + b * 0.04, -top + h * 0.3, false)
      return true
    }
    case 'lensmount': {
      cy(g, s, h * 0.5, M.steel, 0, 0, -top + h * 0.25)
      part(g, DISC, M.black, s * 0.7, s * 0.7, 1, 0, 0, -top + h * 0.51, false)
      for (let i = 0; i < 3; i++) {
        const an = (i / 3) * Math.PI * 2
        bx(g, s * 0.22, s * 0.08, h * 0.4, M.alu, Math.cos(an) * s * 0.42, Math.sin(an) * s * 0.42, -top + h * 0.7, false).rotation.z = an + Math.PI / 2
      }
      part(g, DISC, M.glass, s * 0.5, s * 0.5, 1, 0, 0, -top + h * 0.53, false)
      return true
    }
    case 'arm': {
      // a carbon arm on its hinge, the motor and a folded propeller at the far end
      rb(g, a * 0.6, b * 0.85, h * 0.5, a * 0.15, M.graphite, 0, -b * 0.05, -top + h * 0.3)
      cy(g, a * 0.9, h * 0.6, M.steel, 0, -b / 2 + a * 0.45, -top + h * 0.3, true)
      cy(g, a, h * 0.6, M.darkSteel, 0, b / 2 - a * 0.5, -top + h * 0.5)
      bx(g, a * 0.3, b * 0.5, h * 0.08, M.black, 0, b * 0.15, top - h * 0.04, false)
      return true
    }
    case 'stereocam': {
      const pairs = v === 1 ? 2 : 1
      for (let p = 0; p < pairs; p++) {
        const y = pairs === 1 ? 0 : (p ? 1 : -1) * b * 0.25
        bx(g, a, b / pairs * 0.8, h * 0.4, M.black, 0, y, -top + h * 0.2)
        for (const sx of [-1, 1]) {
          cy(g, Math.min(b / pairs, a) * 0.5, h * 0.6, M.darkSteel, sx * a * 0.36, y, -top + h * 0.6, true)
          part(g, DISC, M.glass, Math.min(b / pairs, a) * 0.36, Math.min(b / pairs, a) * 0.36, 1, sx * a * 0.36, y, top + 0.02, false)
        }
      }
      return true
    }
    case 'gimbal': {
      // three motors at right angles, and the camera they hold level
      cy(g, s * 0.3, h * 0.2, M.darkSteel, 0, 0, top - h * 0.1)
      bx(g, s * 0.1, s * 0.1, h * 0.4, M.black, 0, 0, top - h * 0.4)
      bx(g, a * 0.8, s * 0.1, s * 0.1, M.black, 0, 0, 0)
      for (const sx of [-1, 1]) cy(g, s * 0.24, s * 0.12, M.darkSteel, sx * a * 0.42, 0, 0).rotation.y = Math.PI / 2
      rb(g, a * 0.5, b * 0.5, h * 0.4, s * 0.06, M.graphite, 0, 0, -top + h * 0.25)
      cy(g, s * 0.3, b * 0.3, M.black, 0, -b * 0.3, -top + h * 0.25).rotation.x = Math.PI / 2
      part(g, DISC, M.glass, s * 0.22, s * 0.22, 1, 0, -b * 0.46, -top + h * 0.25, false).rotation.x = Math.PI / 2
      return true
    }
    case 'antennas': {
      for (const sx of [-1, 1]) {
        cy(g, a * 0.4, b * 0.95, sx < 0 ? M.white : M.black, sx * a * 0.25, 0, 0).rotation.x = Math.PI / 2
        bx(g, a * 0.5, b * 0.05, h * 0.6, M.gold, sx * a * 0.25, -b / 2, 0, false)
      }
      return true
    }
    case 'packcell': {
      rb(g, a, b, h, Math.min(a, h) * 0.12, M.graphite, 0, 0, 0)
      for (const sx of [-1, 1]) bx(g, a * 0.04, b * 0.9, h * 0.2, M.steel, sx * a * 0.5, 0, 0, false)
      for (let i = 0; i < 4; i++) bx(g, a * 0.08, b * 0.02, h * 0.1, i < 3 ? M.green : M.ledOff, (i - 1.5) * a * 0.14, b / 2, top - h * 0.2, false)
      for (let i = 0; i < 4; i++) bx(g, a * 0.1, b * 0.04, h * 0.3, M.gold, (i - 1.5) * a * 0.16, -b / 2, 0, false)
      return true
    }
    case 'lidar': {
      cy(g, s, h * 0.3, M.black, 0, 0, -top + h * 0.15)
      cy(g, s * 0.8, h * 0.55, M.irWindow, 0, 0, -top + h * 0.6)
      cy(g, s * 0.84, h * 0.08, M.steel, 0, 0, top - h * 0.04, true)
      bx(g, s * 0.2, s * 0.06, h * 0.3, M.redLed, s * 0.3, 0, -top + h * 0.6, false)
      return true
    }
    case 'drivebay': {
      // a caddy on rails: its tray, the drive in it, the latch at the front
      bx(g, a, b, h * 0.15, M.zinc, 0, 0, -top + h * 0.075)
      for (const sx of [-1, 1]) bx(g, a * 0.05, b, h * 0.8, M.zinc, sx * a * 0.475, 0, 0)
      rb(g, a * 0.86, b * 0.9, h * 0.6, 1, M.alu, 0, -b * 0.02, -top + h * 0.45)
      bx(g, a, b * 0.04, h, M.black, 0, b / 2, 0)
      bx(g, a * 0.3, b * 0.02, h * 0.3, M.blue, a * 0.3, b / 2 + b * 0.02, 0, false)
      return true
    }
    case 'colorimeter': {
      // the factory's measuring puck on the panel, its cable trailing away
      cy(g, s, h * 0.6, M.graphite, 0, 0, -top + h * 0.3)
      part(g, DISC, M.lensGlass, s * 0.4, s * 0.4, 1, 0, 0, -top - 0.02, false)
      cy(g, s * 0.7, h * 0.3, M.white, 0, 0, top - h * 0.25)
      cy(g, s * 0.06, s * 0.6, M.black, s * 0.6, 0, top - h * 0.2).rotation.y = Math.PI / 2
      return true
    }
    case 'backlight': {
      // a board of mini lamps in zones
      bx(g, a, b, h * 0.4, M.white, 0, 0, -top + h * 0.2)
      const nx = 16
      const ny = 10
      const lamps = new THREE.InstancedMesh(BOX, M.ledOff, nx * ny)
      const m4 = new THREE.Matrix4()
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) lamps.setMatrixAt(i * ny + j, m4.makeScale((a / nx) * 0.3, (b / ny) * 0.3, h * 0.4).setPosition((i - (nx - 1) / 2) * (a / nx), (j - (ny - 1) / 2) * (b / ny), -top + h * 0.6))
      g.add(lamps)
      return true
    }
    case 'kvm': {
      plate(g, a, b, h, 0.2, 1)
      for (const sx of [-1, 1]) rb(g, a * 0.24, b * 0.4, h * 0.6, 0.3, M.steel, sx * a * 0.3, b * 0.25, -top + h * 0.5)
      bx(g, a * 0.2, b * 0.25, h * 0.5, M.black, 0, -b * 0.25, -top + h * 0.45)
      bx(g, a * 0.06, b * 0.12, h * 0.4, M.red, 0, -b * 0.25, top - h * 0.2, false)
      chipPart(subGroup(g, -a * 0.3, -b * 0.25, -top + h * 0.3), a * 0.2, a * 0.2, h * 0.2, 'qfn')
      return true
    }
    case 'dongle': {
      rb(g, a * 0.9, b * 0.5, h, Math.min(a, h) * 0.2, M.black, 0, b * 0.25, 0)
      bx(g, a * 0.85, b * 0.5, h * 0.5, M.steel, 0, -b * 0.25, 0)
      for (const sx of [-1, 1]) bx(g, a * 0.15, b * 0.1, h * 0.1, M.black, sx * a * 0.2, -b * 0.3, h * 0.26, false)
      return true
    }
    case 'thumbbuttons': {
      bx(g, a * 0.2, b, h, M.pcb[1], -a * 0.4, 0, 0)
      for (const sy of [-1, 1]) {
        bx(g, a * 0.4, b * 0.2, h * 0.5, M.black, -a * 0.1, sy * b * 0.24, 0)
        rb(g, a * 0.4, b * 0.44, h * 0.8, Math.min(b, h) * 0.08, glow ? glowMat(glow) : M.graphite, a * 0.3, sy * b * 0.26, 0)
      }
      return true
    }
    case 'dpibutton': {
      bx(g, a, b, h * 0.4, M.black, 0, 0, -top + h * 0.2)
      rb(g, a * 0.7, b * 0.8, h * 0.5, Math.min(a, b) * 0.2, M.graphite, 0, 0, top - h * 0.25)
      for (let i = 0; i < 3; i++) bx(g, a * 0.12, b * 0.1, h * 0.1, M.green, a * 0.45, (i - 1) * b * 0.25, -top + h * 0.5, false)
      return true
    }
    case 'chargedock': {
      rb(g, a, b, h * 0.7, h * 0.3, M.black, 0, 0, -top + h * 0.35)
      part(g, RING, glow ? glowMat(glow) : M.green, s * 0.9, s * 0.9, 1, 0, 0, -top + h * 0.72, false)
      for (const sx of [-1, 1]) bx(g, s * 0.05, s * 0.1, h * 0.4, M.gold, sx * s * 0.06, 0, top - h * 0.1, false)
      return true
    }
    case 'jack': {
      // the barrel the plug goes into, along b, and the spring contacts down its side
      rb(g, a, b, h, Math.min(a, h) * 0.15, M.black, 0, 0, 0)
      cy(g, Math.min(a, h) * 0.6, b * 0.1, M.steel, 0, -b / 2, 0).rotation.x = Math.PI / 2
      part(g, DISC, M.rubber, Math.min(a, h) * 0.4, Math.min(a, h) * 0.4, 1, 0, -b / 2 - b * 0.051, 0, false).rotation.x = Math.PI / 2
      for (let i = 0; i < 4; i++) bx(g, a * 0.2, b * 0.06, h * 0.5, M.gold, a / 2 + a * 0.05, (i - 1.5) * b * 0.2, -h * 0.2, false)
      return true
    }
    case 'cardslot': {
      // the steel cage, the card half in it, and the contacts it lands on
      bx(g, a, b, h * 0.15, M.steel, 0, 0, top - h * 0.075)
      bx(g, a, b, h * 0.15, M.steel, 0, 0, -top + h * 0.075)
      bx(g, a * 0.86, b * 0.95, h * 0.5, M.blueCap, 0, -b * 0.12, 0)
      for (let i = 0; i < 8; i++) bx(g, a * 0.06, b * 0.12, h * 0.1, M.gold, (i - 3.5) * a * 0.1, b * 0.3, -h * 0.2, false)
      return true
    }
    case 'vapour': {
      // a flat copper chamber over the chips: its edge seam and the wick columns showing through
      rb(g, a, b, h, Math.min(a, b) * 0.06, M.copper, 0, 0, 0)
      loop(g, a * 0.94, b * 0.96, Math.max(0.4, s * 0.02), top, M.darkSteel)
      for (let i = 0; i < 6; i++) for (let j = 0; j < 10; j++) part(g, DISC, M.flex, s * 0.04, s * 0.04, 1, (i - 2.5) * a * 0.14, (j - 4.5) * b * 0.09, top + 0.02, false)
      return true
    }
    case 'asic':
      chipPart(g, a, b, h, v === 1 ? 'qfn' : 'lid')
      return true
    case 'npu':
      chipPart(g, a, b, h, 'grid')
      return true
    case 'flash':
      chipPart(g, a, b, h, 'stack')
      return true
    case 'mcu':
      chipPart(g, a, b, h, 'qfn')
      return true
    case 'scaler':
      chipPart(g, a, b, h, 'bga')
      return true
    default:
      return false
  }
}

/** A group set at a point within another, for drawing a part at an offset. */
function subGroup(g: THREE.Group, x: number, y: number, z: number): THREE.Group {
  const o = new THREE.Group()
  o.position.set(x, y, z)
  g.add(o)
  return o
}

/** A main board: the black board, the heat sinks over its power stages, the cover over its rear ports, the socket, the memory and card slots and the chipset. */
function drawBoard(g: THREE.Group, a: number, b: number, h: number, itx: boolean) {
  const top = h / 2
  bx(g, a, b, h, M.pcb[1])
  // the rear edge is +a, the top +b
  bx(g, a * 0.5, 14, 13, M.darkSteel, a * 0.15, b / 2 - 16, top + 6.5)
  bx(g, 14, b * 0.3, 13, M.darkSteel, a / 2 - 16, b * 0.2, top + 6.5)
  rb(g, 28, b * 0.3, 26, 2, M.black, a / 2 - 14, b * 0.22, top + 13)
  bx(g, 1, b * 0.28, 22, M.alu, a / 2 - 28.5, b * 0.22, top + 11, false)
  const sx = itx ? a * 0.05 : 0
  const sy = itx ? b * 0.14 : b * 0.24
  bx(g, 50, 50, 2.2, M.steel, sx, sy, top + 1.1)
  // memory slots in front of the socket, card slots below it
  const slots = itx ? 2 : 4
  for (let i = 0; i < slots; i++) bx(g, 5, Math.min(140, b * 0.5), 6, M.black, sx - (itx ? 36 : 50) - i * 8.5, sy, top + 3, false)
  const slotY = sy - (itx ? 70 : 104)
  for (let i = 0; i < (itx ? 1 : 3); i++) {
    const y = slotY - i * 40
    if (y < -b / 2 + 8) break
    bx(g, Math.min(90, a * 0.4), 3.4, 5, i === 0 ? M.steel : M.black, a / 2 - Math.min(90, a * 0.4) / 2 - 22, y, top + 2.5, false)
  }
  if (!itx) {
    rb(g, 44, 44, 9, 2, M.darkSteel, -a * 0.22, -b * 0.3, top + 4.5)
    face(g, 30, 8, printed('CHIPSET', 'etch'), -a * 0.22, -b * 0.3, top + 9.05)
  }
  bx(g, 7, 54, 10, M.black, -a / 2 + 6, -b * 0.02, top + 5)
  // a scatter of capacitors near the power stages
  for (let i = 0; i < 10; i++) cy(g, 5, 8, M.wrap, a * 0.4 - i * 9, b / 2 - 30, top + 4, true)
}

/** Every component of a layout, drawn where it sits: what shows of the insides of a closed device, through glass. */
export function drawComps(n: Internals): THREE.Group {
  const root = new THREE.Group()
  for (const c of n.comps) {
    const g = new THREE.Group()
    g.quaternion.copy(basisQuat(c.ax))
    g.position.set(c.box.c[0], c.box.c[1], c.box.c[2])
    const inv = g.quaternion.clone().invert()
    const origin = g.position.clone()
    const [a, bb, h] = localSize(c.ax, c.box.s)
    draw(c, g, a, bb, h, (p) => new THREE.Vector3(p[0], p[1], p[2]).sub(origin).applyQuaternion(inv))
    root.add(g)
  }
  root.traverse((o) => (o.raycast = () => {}))
  return root
}

/**
 * A feature's model on its own, a x b x h in its own axes and centred on the origin, for showing it outside the
 * teardown. Its materials are copies, so that whoever shows it may fade them without touching the teardown's.
 */
export function buildFeature(model: string, a: number, b: number, h: number, v = 0): THREE.Group {
  const g = new THREE.Group()
  drawFeature({ id: model, kind: 'feature', zone: '', host: 'tray', box: { c: [0, 0, 0], s: [a, b, h] }, ax: [1, 2, 3], fits: true, layer: 0, specs: [], label: '', model, v }, g, a, b, h)
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.material && !Array.isArray(m.material)) m.material = m.material.clone()
    m.raycast = () => {}
  })
  return g
}

// ---------------------------------------------------------------- drawing one component

/** Draws a component in its own axes, centred on the origin: `a` across, `b` along, `h` up. */
function draw(c: Comp, g: THREE.Group, a: number, b: number, h: number, toLocal: (p: V3) => THREE.Vector3) {
  const rnd = seeded(c.id)
  const top = h / 2
  const v = c.v ?? 0
  switch (c.kind) {
    case 'battery': {
      if (v === 1) {
        // a coin cell
        cy(g, Math.min(a, b), h, M.steel)
        cy(g, Math.min(a, b) * 0.8, 0.2, M.darkSteel, 0, 0, top)
        break
      }
      const boxes: [THREE.Vector3, V3][] = [[new THREE.Vector3(), [a, b, h]]]
      for (const m of c.more ?? []) boxes.push([toLocal(m.c), localSize(c.ax, m.s)])
      for (const [at, s] of boxes) rb(g, s[0], s[1], s[2], Math.min(s[2] * 0.3, 1.6 + Math.min(a, b) * 0.01), M.wrap, at.x, at.y, at.z)
      // the printed label, and the tab the leads come out of
      const lw = Math.min(a * 0.72, b * 1.6)
      const lh = Math.min(b * 0.5, lw * 0.6)
      const lab = face(g, lw, lh, printed(c.text ?? '', 'label'), 0, 0, top + 0.03)
      if (b > a * 1.3) {
        lab.rotation.z = Math.PI / 2
        lab.scale.set(Math.min(b * 0.6, a * 1.5), Math.min(a * 0.62, b * 0.4), 1)
      } else if (c.n === 1) lab.rotation.z = Math.PI
      bx(g, Math.min(a * 0.3, 14 + a * 0.05), Math.min(b * 0.05, 3) + 0.6, Math.max(0.2, h * 0.3), M.flex, a * 0.2, b / 2 - 0.2, 0, false)
      break
    }
    case 'board': {
      if (v === 5) {
        // the strip that runs down an earbud's stem: a microphone at each station, and the charging contacts at its foot
        bx(g, a, b, h, M.pcb[1])
        const n = c.n ?? 0
        for (let i = 0; i < n; i++) bx(g, 1.5, Math.min(b * 0.7, 1.4), 0.5, M.steel, -a / 2 + ((i + 0.7) * a) / (n + 0.6), 0, -top - 0.25, false)
        for (const s of [-1, 1]) bx(g, 0.9, 0.9, 0.5, M.gold, a / 2 - 0.9, s * b * 0.24, -top - 0.2, false)
        bx(g, 1.2, b * 0.7, 0.4, M.flex, -a / 2 + 0.2, 0, 0, false)
        break
      }
      if (c.zone === 'bud') {
        cy(g, Math.min(a, b), h, M.pcb[1])
        for (let i = 0; i < (c.n ?? 0); i++) cy(g, 1.3, 0.5, M.steel, Math.cos(i * 2.1) * a * 0.3, Math.sin(i * 2.1) * a * 0.3, top + 0.25, true)
        for (let i = 0; i < 5; i++) bx(g, 0.9, 0.5, 0.3, M.pale, Math.cos(i * 1.3 + 0.6) * a * 0.22, Math.sin(i * 1.3 + 0.6) * a * 0.22, top + 0.15, false)
        break
      }
      bx(g, a, b, h, v === 4 ? M.pcb[0] : (M.pcb[v] ?? M.pcb[0]))
      if (v === 4) {
        // a wireless module: its can, and the two small sockets the aerial leads snap on to
        rb(g, a * 0.6, b * 0.66, Math.max(1.4, h * 1.8), 0.3, M.steel, -a * 0.12, 0, top + Math.max(1.4, h * 1.8) / 2)
        for (const s of [-1, 1]) cy(g, 2.2, 1.2, M.gold, a * 0.36, s * b * 0.24, top + 0.6, true)
        break
      }
      // a scatter of small parts, so that it reads as a populated board
      const n = Math.max(6, Math.min(56, Math.round((a * b) / (18 + Math.sqrt(a * b)))))
      const u = Math.max(0.5, Math.min(3.2, Math.sqrt(a * b) / 34))
      const bits = new THREE.InstancedMesh(BOX, v === 3 ? M.black : M.pale, n)
      const m4 = new THREE.Matrix4()
      const q = new THREE.Quaternion()
      for (let i = 0; i < n; i++) {
        const tall = 0.25 * u + rnd() * 0.3 * u
        m4.compose(new THREE.Vector3((rnd() - 0.5) * (a - 2 * u), (rnd() - 0.5) * (b - 2 * u), top + tall / 2), q, new THREE.Vector3((0.6 + rnd() * 1.2) * u, (0.4 + rnd() * 0.6) * u, tall))
        bits.setMatrixAt(i, m4)
      }
      bits.receiveShadow = true
      g.add(bits)
      if (v === 3 || c.id === 'psu') {
        // an open power board: a transformer, a choke and a row of capacitors
        bx(g, a * 0.24, b * 0.2, Math.min(a * 0.2, 16), M.yellow, -a * 0.2, b * 0.2, top + Math.min(a * 0.2, 16) / 2)
        for (let i = 0; i < 3; i++) cy(g, a * 0.09, Math.min(a * 0.22, 18), M.black, a * (0.1 + i * 0.12), -b * 0.25, top + Math.min(a * 0.22, 18) / 2)
      }
      break
    }
    case 'chip': {
      // a package on its substrate; the fast ones carry a metal lid
      bx(g, a, b, h * 0.3, M.mask, 0, 0, -top + h * 0.15)
      const lidded = v >= 2
      bx(g, a * 0.86, b * 0.86, h * 0.7, lidded ? M.steel : M.black, 0, 0, -top + h * 0.3 + h * 0.35)
      face(g, a * (lidded ? 0.6 : 0.8), b * (lidded ? 0.42 : 0.56), printed(c.text ?? '', 'etch'), 0, 0, top + 0.03)
      break
    }
    case 'mem': {
      bx(g, a, b, h, M.black)
      if (c.text && Math.min(a, b) > 3) face(g, a * 0.8, b * 0.6, printed(c.text, 'etch'), 0, 0, top + 0.02)
      break
    }
    case 'shield': {
      if (v === 1) {
        // an open can: a fence soldered to the board, and its lid, which lifts off as the device opens
        const t = Math.max(0.12, Math.min(a, b) * 0.02)
        for (const s of [-1, 1]) {
          bx(g, a, t, h * 0.8, M.steel, 0, (s * (b - t)) / 2, -top + h * 0.4, false)
          bx(g, t, b, h * 0.8, M.steel, (s * (a - t)) / 2, 0, -top + h * 0.4, false)
        }
        const lid = bx(g, a, b, Math.max(0.1, h * 0.12), M.steel, 0, 0, top)
        g.userData.lid = { o: lid, z: top, rise: Math.max(2.2, h * 2.4) }
        break
      }
      rb(g, a, b, h, Math.min(a, b, h) * 0.12, M.steel)
      for (let i = 0; i < 3; i++) cy(g, Math.min(a, b) * 0.08, 0.05, M.darkSteel, (i - 1) * a * 0.28, 0, top + 0.02, true)
      if (v === 2) {
        // a tuner: the aerial socket stands out of one end of the can
        const o = part(g, CYL_LOW, M.steel, Math.min(h * 0.8, 9), Math.min(h * 0.8, 9), 9, 0, b / 2 + 4, 0)
        o.rotation.x = Math.PI / 2
        const pin = part(g, CYL_LOW, M.gold, 1.4, 1.4, 11, 0, b / 2 + 4.4, 0, false)
        pin.rotation.x = Math.PI / 2
      }
      break
    }
    case 'sheet':
      bx(g, a, b, h, v === 1 ? M.copper : M.graphite, 0, 0, 0, false)
      break
    case 'pipe':
    case 'cable':
    case 'flex': {
      if (c.path && c.path.length > 1) {
        const pts = c.path.map(toLocal)
        // a round cable says how thick it is; a ribbon says how wide
        const t = Math.max(0.3, c.kind === 'cable' && v !== 2 && c.n ? c.n : Math.min(a, b, h))
        const tied = c.text === 'clips'
        if (c.kind === 'flex') {
          // a flat ribbon from a board to the edge of the panel: silver, with a stiffener and a plug at each end
          const w = Math.max(2, c.n ?? 12)
          strand(g, pts, 0.25, M.ribbon, w)
          for (const [i, p] of [pts[0], pts[pts.length - 1]].entries()) bx(g, w + 2.5, i ? 5 : 4, i ? 0.9 : 1.8, i ? M.film : M.white, p.x, p.y + (i ? -2 : 0), p.z + (i ? 0.2 : 0.7), false)
        } else if (c.kind === 'pipe') {
          for (let i = 0; i + 1 < pts.length; i++) {
            const len = pts[i].distanceTo(pts[i + 1])
            if (len < 0.05) continue
            const o = bx(g, len + t * 0.8, t * 1.5, t * 0.6, M.copper)
            o.position.copy(pts[i]).add(pts[i + 1]).multiplyScalar(0.5)
            o.rotation.z = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x)
          }
        } else if (v === 2) strand(g, pts, Math.min(t, 0.5), M.pale, Math.max(3, c.n ?? 10), tied)
        else if (v === 3) {
          // a twisted pair: a red and a black lead side by side
          const off = new THREE.Vector3(0, 0, t * 0.5)
          strand(g, pts, t * 0.55, M.black, 0, tied)
          strand(g, pts.map((p) => p.clone().add(off)), t * 0.5, M.red)
        } else strand(g, pts, v === 4 ? t * 0.7 : t, v === 1 ? M.blueCap : v === 4 ? M.grey : M.black, 0, tied)
        break
      }
      // a ribbon with a connector at each end
      const long = a >= b
      bx(g, a, b, h, v === 1 || v === 3 ? M.flexDark : M.flex, 0, 0, 0, false)
      if (v === 2) cy(g, Math.min(a, b) * 2.2, h * 1.2, M.steel, 0, 0, 0, true)
      else for (const s of [-1, 1]) bx(g, long ? Math.min(a * 0.14, 3) : a * 0.9, long ? b * 0.9 : Math.min(b * 0.14, 3), h + 0.5, M.black, long ? s * a * 0.46 : 0, long ? 0 : s * b * 0.46, 0.2, false)
      break
    }
    case 'fan': {
      const t = turned(g, c.axis, a, b, h)
      const dia = Math.min(t.a, t.b)
      // a housing with the rotor in it; a blower has a square outlet as well
      part(t.g, RING, M.black, dia, dia, 1, 0, 0, t.h / 2, false)
      cy(t.g, dia, t.h * 0.3, M.black, 0, 0, -t.h * 0.35)
      if (v === 1) bx(t.g, dia * 0.5, dia * 0.94, t.h * 0.96, M.black, dia * 0.25, 0, 0)
      g.userData.spin = rotor(t.g, dia * 0.86, t.h * 0.6, t.h * 0.1)
      break
    }
    case 'heatsink': {
      const t = turned(g, c.axis, a, b, h)
      bx(t.g, t.a, t.b, t.h * 0.14, v >= 2 ? M.copper : M.alu, 0, 0, -t.h / 2 + t.h * 0.07)
      const n = Math.max(5, Math.min(30, Math.round(t.a / Math.max(2.2, t.a * 0.045))))
      const fins = new THREE.InstancedMesh(BOX, M.alu, n)
      const m4 = new THREE.Matrix4()
      for (let i = 0; i < n; i++) fins.setMatrixAt(i, m4.makeScale(Math.max(0.3, (t.a / n) * 0.42), t.b * 0.98, t.h * 0.86).setPosition(-t.a / 2 + ((i + 0.5) * t.a) / n, 0, t.h * 0.07))
      fins.castShadow = fins.receiveShadow = true
      t.g.add(fins)
      if (v === 3) {
        // a radiator carries its own fans
        const dia = Math.min(t.a / (c.n ?? 2), t.b) * 0.9
        for (let i = 0; i < (c.n ?? 2); i++) {
          const x = (i - ((c.n ?? 2) - 1) / 2) * (t.a / (c.n ?? 2))
          part(t.g, RING, M.black, dia, dia, 1, x, 0, t.h / 2 + 0.05, false)
          rotor(t.g, dia * 0.86, 2, t.h / 2 - 1.2).position.x = x
        }
      }
      break
    }
    case 'pump': {
      cy(g, Math.min(a, b), h * 0.3, M.copper, 0, 0, -top + h * 0.15)
      cy(g, Math.min(a, b) * 0.9, h * 0.7, M.black, 0, 0, -top + h * 0.3 + h * 0.35)
      for (const s of [-1, 1]) cy(g, Math.min(a, b) * 0.16, h * 0.3, M.steel, s * a * 0.2, 0, top)
      break
    }
    case 'camera': {
      const small = (c.n ?? 0) === 2
      const side = Math.min(a, b)
      bx(g, a, b, h * (small ? 0.4 : 0.34), M.black, 0, 0, -top + h * (small ? 0.2 : 0.17))
      if ((c.n ?? 0) === 1) {
        // a periscope: the light turns a corner inside a long prism block
        bx(g, a, b, h * 0.5, M.darkSteel, 0, 0, -top + h * 0.34 + h * 0.25)
        face(g, side * 0.5, side * 0.5, M.glass, 0, 0, -top + h * 0.84 + 0.03)
        break
      }
      const barrel = side * (0.62 + 0.02 * Math.min(v, 8))
      cy(g, Math.min(barrel, side * 0.92), h * 0.6, M.darkSteel, 0, 0, -top + h * 0.34 + h * 0.3)
      face(g, barrel * 0.7, barrel * 0.7, M.glass, 0, 0, top - h * 0.06 + 0.03, true)
      bx(g, Math.min(a * 0.3, 2.4), b * 0.3, Math.max(0.12, h * 0.05), M.flex, a * 0.5, 0, -top + 0.1, false)
      break
    }
    case 'led':
      if (c.glow) bx(g, a, b, h, glowMat(c.glow), 0, 0, 0, false)
      else if (v === 4) bx(g, a, b, h, M.green, 0, 0, 0, false)
      else {
        bx(g, a, b, h * 0.6, M.white, 0, 0, -top + h * 0.3)
        face(g, a * 0.6, b * 0.6, M.led, 0, 0, -top + h * 0.6 + 0.02)
      }
      break
    case 'coil': {
      const t = turned(g, c.axis, a, b, h)
      if (v === 1) {
        // an aerial loop on a dark film
        bx(t.g, t.a, t.b, t.h * 0.4, M.film, 0, 0, 0, false)
        for (let i = 0; i < 3; i++) {
          const k = 1 - i * 0.16
          for (const s of [-1, 1]) {
            bx(t.g, t.a * k, 0.22, t.h * 0.5, M.copper, 0, (s * t.b * k) / 2 - s * 0.2, t.h * 0.3, false)
            bx(t.g, 0.22, t.b * k, t.h * 0.5, M.copper, (s * t.a * k) / 2 - s * 0.2, 0, t.h * 0.3, false)
          }
        }
        break
      }
      const dia = Math.min(t.a, t.b)
      cy(t.g, dia, t.h * 0.3, M.film, 0, 0, -t.h * 0.3)
      for (let i = 0; i < 6; i++) {
        const o = part(t.g, RING, M.copper, dia * (0.96 - i * 0.1), dia * (0.96 - i * 0.1), 1, 0, 0, t.h * 0.1, false)
        ;(o.material as THREE.Material).side = THREE.DoubleSide
      }
      break
    }
    case 'speaker': {
      if (v === 2) {
        // a sealed box with its drivers in the face, a gasket round each, and the terminals on one end
        rb(g, a, b, h * 0.78, Math.min(a, b, h) * 0.1, M.black, 0, 0, -top + h * 0.39)
        const n = Math.max(1, c.n ?? 1)
        const dia = Math.min(b * 0.82, (a / n) * 0.74)
        for (let i = 0; i < n; i++) {
          const x = (i - (n - 1) / 2) * (a / n) * 0.92
          const hold = new THREE.Group()
          hold.position.set(x, 0, -top + h * 0.78 - h * 0.1)
          // a TV's drivers are long ovals: a round one, stretched
          hold.scale.set(i === 1 && n > 1 ? 0.55 : Math.min(1.5, ((a / n) * 0.8) / dia), 1, 1)
          g.add(hold)
          cone(hold, i === 1 && n > 1 ? dia * 0.8 : dia, h * 0.44, i === 1 && n > 1)
        }
        bx(g, 5, Math.min(b * 0.4, 8), 2.4, M.white, -a / 2 + 4, 0, -top + h * 0.78 + 1.2, false)
        break
      }
      rb(g, a, b, h, Math.min(a, b, h) * 0.14, M.black)
      face(g, a * 0.7, b * 0.62, M.grey, 0, 0, top + 0.03)
      bx(g, a * 0.76, b * 0.68, 0.1, M.steel, 0, 0, top - 0.06, false)
      break
    }
    case 'motor': {
      if (v === 0) {
        // an offset weight on a small motor
        const o = part(g, CYL, M.steel, Math.min(a, h) * 0.9, Math.min(a, h) * 0.9, b * 0.6)
        o.rotation.x = Math.PI / 2
        const w = part(g, CYL, M.darkSteel, Math.min(a, h), Math.min(a, h) * 0.6, b * 0.22, 0, b * 0.4, -h * 0.1)
        w.rotation.x = Math.PI / 2
        break
      }
      rb(g, a, b, h, Math.min(a, b, h) * 0.12, M.steel)
      bx(g, a * 0.5, b * 0.3, 0.1, M.darkSteel, 0, 0, top + 0.03, false)
      bx(g, a * 0.2, 1.2, h * 0.3, M.flex, 0, b / 2, -top + h * 0.15, false)
      break
    }
    case 'port': {
      if (v === 1) {
        // a row of contacts for the dock
        bx(g, a, b, h * 0.5, M.black, 0, 0, -top + h * 0.25)
        for (let i = 0; i < 6; i++) bx(g, a * 0.09, b * 0.6, h * 0.5, M.gold, (i - 2.5) * a * 0.15, 0, 0, false)
        break
      }
      bx(g, a, b, h, M.steel)
      const long = a >= b
      bx(g, long ? a * 0.82 : a * 0.5, long ? b * 0.5 : b * 0.82, h * 0.5, M.black, 0, 0, 0.02, false)
      break
    }
    case 'tray':
      bx(g, a, b, h, M.steel)
      face(g, a * 0.6, b * 0.66, M.gold, -a * 0.08, 0, top + 0.02)
      break
    case 'antenna':
      if (v === 2) {
        // a printed aerial: a copper meander on a strip of film stuck to the chassis
        bx(g, a, b, h * 0.5, M.film, 0, 0, -top + h * 0.25, false)
        bx(g, a * 0.86, b * 0.14, h * 0.3, M.copper, 0, b * 0.28, top - h * 0.2, false)
        for (let i = 0; i < 4; i++) bx(g, a * 0.05, b * 0.56, h * 0.3, M.copper, -a * 0.36 + i * a * 0.24, 0, top - h * 0.2, false)
        break
      }
      bx(g, a, b, h, v === 1 ? M.copper : M.pale, 0, 0, 0, false)
      if (v !== 1) bx(g, a * 0.9, b * 1.04, h * 0.2, M.copper, 0, 0, h * 0.2, false)
      break
    case 'display': {
      // the stack shows at its edge: glass on top, then the panel, then whatever backs it
      const lcd = v === 0
      const micro = v >= 5
      const layers: [number, THREE.Material][] = lcd ? [[0.3, M.steel], [0.34, M.white], [0.14, M.black], [0.22, M.glass]] : micro ? [[0.3, M.blueCap], [0.3, M.black], [0.4, M.glass]] : [[0.24, M.copper], [0.3, M.black], [0.46, M.glass]]
      let z = -top
      // a screen that lifts off the front keeps the rounded corners of the glass
      const outline = c.host === 'screen' ? roundedRectShape(a, b, Math.max(0.3, c.n ?? 1)) : null
      for (const [k, mat] of layers) {
        if (outline) {
          const o = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: h * k, bevelEnabled: false, curveSegments: 8 }), mat)
          o.position.z = z
          g.add(o)
        } else bx(g, a, b, h * k, mat, 0, 0, z + (h * k) / 2, false)
        z += h * k
      }
      // on the back: the driver board and the ribbon that plugs into the logic board
      const u = Math.max(1, Math.min(a, b) / 60)
      bx(g, Math.min(a * 0.3, 40 * u), 4 * u, 0.4 * u, M.pcb[1], 0, -b / 2 + 5 * u, -top - 0.2 * u, false)
      bx(g, 7 * u, 12 * u, 0.2 * u, M.flex, a * 0.1, -b / 2 + 12 * u, -top - 0.1 * u, false)
      break
    }
    case 'plate': {
      if (v === 0) {
        // the keyboard from below: a steel pan riveted through, with the light sheet over it if the keys are lit
        bx(g, a, b, h, (c.n ?? 0) === 1 || (c.n ?? 0) === 3 ? M.white : M.darkSteel, 0, 0, 0, false)
        const cols = Math.max(6, Math.round(a / 19))
        const dots = new THREE.InstancedMesh(CYL_LOW, M.steel, cols * 5)
        const m4 = new THREE.Matrix4()
        for (let i = 0; i < cols; i++) for (let j = 0; j < 5; j++) dots.setMatrixAt(i * 5 + j, m4.makeScale(1.6, 1.6, h * 0.4).setPosition(-a / 2 + ((i + 0.5) * a) / cols, -b / 2 + ((j + 0.5) * b) / 5, top))
        g.add(dots)
      } else if (v === 1) {
        bx(g, a, b, h, M.steel, 0, 0, 0, false)
        bx(g, a * 0.3, b * 0.2, h * 1.6, M.pcb[0], 0, b * 0.3, top, false)
      } else if (v === 4) {
        bx(g, a, b, h, M.darkSteel)
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) cy(g, Math.min(a, b) * 0.1, 1.6, M.steel, sx * a * 0.36, sy * b * 0.3, top + 0.8, true)
      } else if (v === 5) {
        // an LED backlight on its white reflector: a grid of dimming zones with a lamp in each, or strips along two edges.
        // All of it keeps inside its own thickness: the chassis lies directly on top
        const base = h * 0.4
        const rise = h - base
        const zb = -top + base
        bx(g, a, b, base, M.reflector, 0, 0, -top + base / 2, false)
        const zones = c.n ?? 0
        const lamp = Math.max(1.6, a / 260)
        if (zones > 0) {
          const rows = Math.max(1, Math.round(Math.sqrt((zones * b) / a)))
          const cols = Math.max(1, Math.round(zones / rows))
          const list: [number, number, number, number, number, number][] = []
          for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) list.push([lamp, lamp, rise * 0.5, -a / 2 + ((i + 0.5) * a) / cols, -b / 2 + ((j + 0.5) * b) / rows, zb + rise * 0.25])
          boxes(g, M.ledOff, list)
          // the low walls that keep the light of one zone out of the next
          const walls: [number, number, number, number, number, number][] = []
          const wt = Math.max(0.6, a / 900)
          for (let i = 1; i < cols; i++) walls.push([wt, b, rise * 0.8, -a / 2 + (i * a) / cols, 0, zb + rise * 0.4])
          for (let j = 1; j < rows; j++) walls.push([a, wt, rise * 0.8, 0, -b / 2 + (j * b) / rows, zb + rise * 0.4])
          if (walls.length) boxes(g, M.white, walls)
        } else {
          // edge-lit: a light guide over the reflector, and a strip of lamps along the bottom and the top
          bx(g, a * 0.985, b * 0.95, rise * 0.5, M.pale, 0, 0, zb + rise * 0.25, false)
          const n = Math.max(12, Math.min(72, Math.round(a / 16)))
          const list: [number, number, number, number, number, number][] = []
          for (const s2 of [-1, 1]) {
            bx(g, a * 0.97, b * 0.016, rise * 0.3, M.white, 0, s2 * b * 0.488, zb + rise * 0.15, false)
            for (let i = 0; i < n; i++) list.push([lamp * 1.4, b * 0.009, rise * 0.5, -a * 0.47 + ((i + 0.5) * a * 0.94) / n, s2 * b * 0.488, zb + rise * 0.55])
          }
          boxes(g, M.ledOff, list)
        }
      } else if (v === 10) {
        // a television's back chassis: galvanised steel pressed into ribs, with a flange round it and a screw at every boss
        bx(g, a, b, h, M.galv, 0, 0, 0)
        const ribs: [number, number, number, number, number, number][] = []
        const rh = Math.min(1.1, Math.max(0.5, a / 1400))
        for (let j = 0; j < 4; j++) ribs.push([a * 0.9, b * 0.018, rh, 0, -b * 0.36 + j * b * 0.24, top + rh / 2])
        for (let i = 0; i < 5; i++) ribs.push([a * 0.012, b * 0.84, rh, -a * 0.4 + i * a * 0.2, 0, top + rh / 2])
        for (const s of [-1, 1]) {
          ribs.push([a, b * 0.012, rh * 2.4, 0, s * b * 0.494, top + rh * 1.2])
          ribs.push([a * 0.007, b, rh * 2.4, s * a * 0.4965, 0, top + rh * 1.2])
        }
        boxes(g, M.galvDark, ribs)
        const screws: [number, number, number, number, number, number][] = []
        const sd = Math.max(3, a / 300)
        for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) if ((i + j) % 2 === 0) screws.push([sd, sd, rh * 1.5, -a * 0.45 + i * a * 0.1125, -b * 0.42 + j * b * 0.21, top + rh * 0.75])
        boxes(g, M.darkSteel, screws, CYL_LOW)
      } else if (v === 11) {
        // a wall-mount point: a threaded boss pressed up out of a square pad
        bx(g, a, b, Math.min(h * 0.2, 1.4), M.galvDark, 0, 0, -top + Math.min(h * 0.2, 1.4) / 2)
        cy(g, Math.min(a, b) * 0.62, h, M.steel, 0, 0, 0)
        part(g, DISC, M.black, Math.min(a, b) * 0.3, Math.min(a, b) * 0.3, 1, 0, 0, top + 0.04, false)
      } else if (v === 8 || v === 9) {
        // the two halves of an earbud's shell are cut from the bud itself when the model is rigged
      } else if (v === 7) {
        // MicroLED tiles, butted together
        const cols = 6
        const rows = 4
        const tiles = new THREE.InstancedMesh(BOX, M.graphite, cols * rows)
        const m4 = new THREE.Matrix4()
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) tiles.setMatrixAt(i * rows + j, m4.makeScale((a / cols) * 0.985, (b / rows) * 0.985, h).setPosition(-a / 2 + ((i + 0.5) * a) / cols, -b / 2 + ((j + 0.5) * b) / rows, 0))
        tiles.receiveShadow = true
        g.add(tiles)
      } else bx(g, a, b, h, v === 6 ? M.graphite : M.zinc, 0, 0, 0, false)
      break
    }
    case 'stick': {
      if (v === 2) {
        // a memory module standing on edge in its socket, under a heat spreader
        bx(g, a * 0.9, b * 1.04, h * 0.14, M.black, 0, 0, -top + h * 0.07)
        bx(g, a * 0.34, b, h * 0.86, M.darkSteel, 0, 0, h * 0.07)
        break
      }
      if (v === 3) {
        bx(g, a, b, h, M.steel)
        bx(g, a * 0.9, b * 0.7, 0.1, M.black, 0, 0, top + 0.02, false)
        break
      }
      const long = a >= b
      bx(g, a, b, h * 0.3, v === 1 ? M.pcb[1] : M.pcb[0], 0, 0, -top + h * 0.15)
      const n = v === 1 ? 3 : 4
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n - 0.5
        bx(g, long ? (a / n) * 0.72 : a * 0.7, long ? b * 0.7 : (b / n) * 0.72, h * 0.6, M.black, long ? k * a * 0.9 : 0, long ? 0 : k * b * 0.9, -top + h * 0.3 + h * 0.3, false)
      }
      bx(g, long ? 1.2 : a, long ? b : 1.2, h * 0.32, M.gold, long ? -a / 2 + 0.6 : 0, long ? 0 : -b / 2 + 0.6, -top + h * 0.16, false)
      if (c.text && v === 1) {
        const lab = face(g, long ? a * 0.5 : b * 0.5, long ? b * 0.6 : a * 0.6, printed(c.text, 'label'), 0, 0, top + 0.03)
        if (!long) lab.rotation.z = Math.PI / 2
      }
      break
    }
    case 'card': {
      // a graphics card: board, shroud, and a fan for every tier
      bx(g, a, b, h * 0.1, M.pcb[1], 0, 0, -top + h * 0.05)
      rb(g, a * 0.98, b * 0.94, h * 0.8, Math.min(4, h * 0.1), M.grey, 0, 0, -top + h * 0.1 + h * 0.4)
      const n = Math.max(1, c.n ?? 1)
      const dia = Math.min((a / n) * 0.86, b * 0.8)
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * (a / n)
        part(g, DISC, M.black, dia, dia, 1, x, 0, top - h * 0.1 + 0.04, false)
        rotor(g, dia * 0.9, h * 0.12, top - h * 0.04).position.x = x
      }
      bx(g, a * 0.2, 1.4, h * 0.5, M.gold, -a * 0.2, -b / 2, -top + h * 0.2, false)
      break
    }
    case 'psu': {
      if (v === 1) {
        // an open power board, as in the back of a television: mains comes in at one end past the fuse and the filter,
        // is smoothed by the big capacitors, chopped through the transformer, and leaves past a row of small ones
        const t = Math.min(1.6, h * 0.2)
        const z = -top + t
        const up = h - t
        bx(g, a, b, t, M.phenolic, 0, 0, -top + t / 2)
        const u = Math.min(a, b)
        const bits: [number, number, number, number, number, number][] = []
        for (let i = 0; i < 46; i++) bits.push([u * (0.012 + rnd() * 0.02), u * (0.008 + rnd() * 0.012), up * (0.06 + rnd() * 0.08), (rnd() - 0.5) * a * 0.9, (rnd() - 0.5) * b * 0.9, z + up * 0.05])
        boxes(g, M.black, bits)
        // mains inlet, fuse and the filter: a white plug, a glass tube, a blue capacitor and a common-mode choke
        bx(g, a * 0.16, b * 0.05, up * 0.5, M.white, -a * 0.34, -b * 0.44, z + up * 0.25)
        const fuse = part(g, CYL_LOW, M.pale, up * 0.2, up * 0.2, a * 0.1, -a * 0.1, -b * 0.44, z + up * 0.14, false)
        fuse.rotation.y = Math.PI / 2
        bx(g, a * 0.12, b * 0.05, up * 0.62, M.blueCap, -a * 0.33, -b * 0.34, z + up * 0.31)
        const choke = part(g, TORUS, M.copper, a * 0.17, a * 0.17, up * 0.9, -a * 0.1, -b * 0.32, z + up * 0.3)
        choke.receiveShadow = true
        // the reservoir capacitors, standing; each has a scored silver top
        const cd = Math.min(a * 0.13, up * 1.5)
        for (let i = 0; i < 3; i++) {
          const x = a * 0.14 + i * (cd * 1.12)
          cy(g, cd, up * 0.96, M.wrap, x, -b * 0.34, z + up * 0.48)
          part(g, DISC, M.alu, cd * 0.86, cd * 0.86, 1, x, -b * 0.34, z + up * 0.96 + 0.03, false)
        }
        // the switching transistors on a finned heat sink along each side
        for (const s of [-1, 1]) {
          const fins: [number, number, number, number, number, number][] = []
          const len = b * 0.34
          const nf = Math.max(6, Math.round(len / Math.max(4, u * 0.03)))
          bx(g, a * 0.012, len, up * 0.9, M.alu, s * a * 0.44, s * b * 0.02, z + up * 0.45)
          for (let i = 0; i < nf; i++) fins.push([a * 0.045, (len / nf) * 0.4, up * 0.86, s * (a * 0.44 - a * 0.026), s * b * 0.02 - len / 2 + ((i + 0.5) * len) / nf, z + up * 0.45])
          boxes(g, M.alu, fins, BOX, true)
          for (let i = 0; i < 3; i++) bx(g, a * 0.012, len * 0.16, up * 0.5, M.black, s * (a * 0.44 - a * 0.056), s * b * 0.02 + (i - 1) * len * 0.3, z + up * 0.28, false)
        }
        // the transformer in its yellow tape, in a ferrite core, and a second, smaller one for standby power
        for (const [k, x, y] of [[1, -a * 0.08, b * 0.02], [0.6, a * 0.2, b * 0.06]] as const) {
          bx(g, a * 0.2 * k, b * 0.13 * k, up * 0.82 * Math.min(1, k + 0.25), M.ferrite, x, y, z + up * 0.41 * Math.min(1, k + 0.25))
          bx(g, a * 0.15 * k, b * 0.145 * k, up * 0.66 * Math.min(1, k + 0.25), M.yellow, x, y, z + up * 0.4 * Math.min(1, k + 0.25), false)
        }
        if (c.figure) face(g, a * 0.11, b * 0.05, printed(c.figure, 'label'), -a * 0.08, b * 0.02, z + up * 0.82 + 0.05)
        // the output side: a row of small capacitors, two chokes and the plugs the harnesses leave from
        for (let i = 0; i < 6; i++) cy(g, cd * 0.5, up * 0.72, M.wrap, -a * 0.3 + i * cd * 0.62, b * 0.3, z + up * 0.36, true)
        for (let i = 0; i < 2; i++) {
          const o = part(g, TORUS, M.copper, a * 0.11, a * 0.11, up * 0.7, a * 0.16 + i * a * 0.13, b * 0.28, z + up * 0.22)
          o.receiveShadow = true
        }
        for (let i = 0; i < 3; i++) bx(g, a * 0.12, b * 0.035, up * 0.4, M.white, -a * 0.3 + i * a * 0.3, b * 0.44, z + up * 0.2, false)
        break
      }
      rb(g, a, b, h, Math.min(2, h * 0.08), v === 2 ? M.black : M.darkSteel)
      const dia = Math.min(a, b) * 0.7
      part(g, DISC, M.black, dia, dia, 1, 0, 0, top + 0.04, false)
      for (let i = 1; i <= 3; i++) part(g, RING, M.steel, dia * i * 0.3, dia * i * 0.3, 1, 0, 0, top + 0.06, false)
      break
    }
    case 'drive': {
      rb(g, a, b, h, Math.min(1.5, h * 0.1), M.darkSteel)
      if (v === 1) {
        // an optical drive: the mouth of the slot, and the hub the disc sits on
        bx(g, a * 0.94, 1, h * 0.3, M.black, 0, -b / 2, 0, false)
        cy(g, Math.min(a, b) * 0.22, 0.8, M.darkSteel, 0, b * 0.05, top + 0.2)
      } else face(g, a * 0.7, b * 0.5, M.label, 0, 0, top + 0.03)
      break
    }
    case 'hinge': {
      const t = turned(g, c.axis === 0 ? 0 : c.axis === 1 ? 1 : 2, a, b, h)
      // built along its own long axis, which `turned` has stood upright
      const len = t.h
      const wide = Math.min(t.a, t.b)
      if (v === 4) {
        bx(t.g, t.a, t.b, len * 0.8, M.darkSteel)
        cy(t.g, wide * 0.8, len, M.steel)
        break
      }
      cy(t.g, wide * (v >= 2 ? 0.34 : 0.5), len, M.darkSteel)
      const n = Math.max(2, c.n ?? 2)
      for (let i = 0; i < n; i++) {
        const z = ((i + 0.5) / n - 0.5) * len * 0.92
        bx(t.g, t.a * 0.96, t.b * 0.9, (len / n) * (v >= 2 ? 0.34 : 0.5), M.steel, 0, 0, z)
        if (v === 1 || v === 2) cy(t.g, wide * 0.42, (len / n) * 0.2, M.gold, 0, 0, z + (len / n) * 0.3, true)
      }
      break
    }
    case 'sensor': {
      const dia = Math.min(a, b)
      if (v === 0) {
        // the sensor board behind a watch's back window: lamps and the photodiodes that read them
        cy(g, dia, h * 0.5, M.pcb[2], 0, 0, -top + h * 0.25)
        const n = Math.max(1, c.n ?? 1)
        for (let i = 0; i < Math.min(8, n * 2); i++) {
          const an = (i / Math.min(8, n * 2)) * Math.PI * 2
          bx(g, dia * 0.1, dia * 0.1, h * 0.5, i % 2 ? M.black : M.green, Math.cos(an) * dia * 0.3, Math.sin(an) * dia * 0.3, 0, false)
        }
        cy(g, dia * 0.22, h * 0.5, M.black, 0, 0, 0, true)
      } else if (v === 3) {
        const o = part(g, RING, M.black, dia, dia, 1, 0, 0, 0, false)
        ;(o.material as THREE.Material).side = THREE.DoubleSide
        for (let i = 0; i < 8; i++) cy(g, 1.4, 0.4, M.led, Math.cos(i * 0.785) * dia * 0.47, Math.sin(i * 0.785) * dia * 0.47, 0.1, true)
      } else if (v === 2) cy(g, dia, h, M.copper)
      else {
        bx(g, a, b, h, M.black, 0, 0, 0, false)
        part(g, RING, M.steel, dia, dia, 1, 0, 0, top + 0.02, false)
      }
      break
    }
    case 'driver': {
      const t = turned(g, c.axis, a, b, h)
      const dia = Math.min(t.a, t.b)
      if (v === 3) {
        // a ring of small tweeters, each looking outwards
        const n = c.n ?? 6
        cy(t.g, dia * 0.5, t.h * 0.3, M.black, 0, 0, -t.h * 0.35)
        for (let i = 0; i < n; i++) {
          const an = ((i + 0.5) / n) * Math.PI * 2
          const holder = new THREE.Group()
          holder.position.set(Math.cos(an) * dia * 0.36, Math.sin(an) * dia * 0.36, 0)
          holder.rotation.set(0, Math.PI / 2, 0)
          holder.rotateX(-an)
          t.g.add(holder)
          cone(holder, Math.min(t.h * 0.8, dia * 0.26), dia * 0.14, true)
        }
      } else if (v === 4) {
        // a ribbon tweeter: a pleated foil between two magnets
        bx(t.g, t.a, t.b, t.h * 0.6, M.black, 0, 0, -t.h * 0.2)
        bx(t.g, t.a * 0.5, t.b * 0.9, t.h * 0.3, M.ribbon, 0, 0, t.h * 0.2, false)
      } else if (v === 2) {
        cy(t.g, dia, t.h * 0.5, M.steel, 0, 0, -t.h * 0.25)
        cy(t.g, dia * 0.6, t.h * 0.5, M.black, 0, 0, t.h * 0.25)
      } else if (v === 14) {
        // a planar driver: a flat film between rows of magnets
        bx(t.g, dia, dia, t.h * 0.5, M.darkSteel)
        for (let i = 0; i < 4; i++) bx(t.g, dia * 0.9, dia * 0.1, t.h * 0.7, M.steel, 0, (i - 1.5) * dia * 0.22, 0, false)
      } else if (v >= 10) {
        const n = c.n ?? 1
        for (let i = 0; i < n; i++) cone(t.g, dia * (i ? 0.6 : 1), t.h / n)
        if (n > 1) cy(t.g, dia * 0.55, t.h * 0.3, M.gold, 0, 0, t.h * 0.3)
        if (v === 15) part(t.g, DISC, M.blueCap, dia * 0.7, dia * 0.7, 1, 0, 0, t.h / 2 - t.h * 0.2, false)
        if (v === 12) part(t.g, DISC, M.pale, dia * 0.7, dia * 0.7, 1, 0, 0, t.h / 2 - t.h * 0.2, false)
      } else if (v === 1) {
        bx(t.g, dia * 1.1, dia * 1.1, t.h * 0.3, M.black, 0, 0, t.h * 0.2)
        cone(t.g, dia * 0.9, t.h, true)
      } else cone(t.g, dia, t.h)
      break
    }
    case 'radiator': {
      const t = turned(g, c.axis, a, b, h)
      const o = cy(t.g, 1, t.h * 0.6, M.rubber)
      o.scale.set(t.a, t.b, t.h * 0.6)
      part(t.g, DISC, M.grey, t.a * 0.7, t.b * 0.7, 1, 0, 0, t.h * 0.31, false)
      break
    }
    case 'mic': {
      const n = c.n ?? 2
      if (v === 1) {
        bx(g, a, b * 0.16, h * 0.5, M.pcb[0], 0, b * 0.4, -top + h * 0.25, false)
        for (let i = 0; i < n; i++) bx(g, 2.6, 2, h * 0.6, M.steel, (i - (n - 1) / 2) * Math.min(9, a / n), b * 0.4, 0.2, false)
        break
      }
      // a ring of board with a microphone at each station
      const ring = part(g, RING, M.pcb[0], Math.min(a, b), Math.min(a, b), 1, 0, 0, -top + 0.1, false)
      ;(ring.material as THREE.Material).side = THREE.DoubleSide
      ring.scale.set(a, b, 1)
      for (let i = 0; i < n; i++) {
        const an = ((i + 0.5) / n) * Math.PI * 2
        bx(g, 3, 2.2, h * 0.8, M.steel, Math.sin(an) * a * 0.47, -Math.cos(an) * b * 0.47, 0, false).rotation.z = an
      }
      break
    }
    case 'lens': {
      const dia = Math.min(a, b)
      if (v >= 4) {
        // a waveguide: a flat plate of glass with a projector at its edge
        bx(g, a, b * 0.82, Math.max(1.2, h * 0.3), M.lensGlass, 0, 0, -top + Math.max(1.2, h * 0.3) / 2, false)
        bx(g, a * 0.24, b * 0.2, Math.max(2, h * 0.8), M.black, 0, b * 0.42, 0)
        break
      }
      // the barrel, with its elements inside: one thick one, or a thin folded stack. The eye looks in at the bottom,
      // where the glass bulges out of a bright retaining ring; the display sits against the top.
      cy(g, dia, h, M.black)
      part(g, RING, v >= 2 ? M.steel : M.grey, dia * 1.02, dia * 1.02, 1, 0, 0, top + 0.05, false)
      const els = v >= 2 ? 2 : 1
      for (let i = 0; i < els; i++) part(g, DISC, M.lensGlass, dia * 0.9, dia * 0.9, 1, 0, 0, top - 0.3 - i * Math.min(2.4, h * 0.3) + 0.06, false)
      if (v === 0) for (const k of [0.34, 0.52, 0.7]) part(g, RING, M.pale, dia * k, dia * k, 1, 0, 0, top + 0.08, false)
      const rim = part(g, TORUS, v >= 2 ? M.steel : M.darkSteel, dia * 1.02, dia * 1.02, dia * 0.12, 0, 0, -top, false)
      rim.receiveShadow = true
      const eye = part(g, DOME, M.eyeGlass, dia * 0.44, dia * 0.44, dia * (v >= 2 ? 0.05 : v === 1 ? 0.1 : 0.16), 0, 0, -top + 0.02, false)
      eye.rotation.x = Math.PI
      // a Fresnel lens is ridged in rings; the others are smooth
      if (v === 0) for (const k of [0.3, 0.46, 0.62, 0.78]) part(g, RING, M.pale, dia * k, dia * k, 1, 0, 0, -top - dia * 0.02 * (1 - k) * 6 - 0.3, false).rotation.x = Math.PI
      break
    }
    case 'control': {
      const side = Math.min(a, b)
      if (v <= 1) {
        // a stick module: the box, the stem, and either two pots or the magnets of a Hall sensor
        bx(g, side * 0.74, side * 0.74, h * 0.6, v === 1 ? M.blueCap : M.steel, 0, 0, -top + h * 0.3)
        cy(g, side * 0.26, h * 0.4, M.black, 0, 0, top - h * 0.2)
        if (v === 1) for (const s of [-1, 1]) cy(g, side * 0.14, h * 0.3, M.ribbon, s * side * 0.3, s * side * 0.3, -top + h * 0.6, true)
        else {
          bx(g, side * 0.2, side * 0.44, h * 0.44, M.pale, side * 0.47, 0, -top + h * 0.3, false)
          bx(g, side * 0.44, side * 0.2, h * 0.44, M.pale, 0, side * 0.47, -top + h * 0.3, false)
        }
      } else if (v === 2 || v === 3) {
        cy(g, side, Math.min(h, 1.2), M.pcb[0], 0, 0, -top + Math.min(h, 1.2) / 2)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) cy(g, side * 0.2, 0.3, M.gold, dx * side * 0.28, dy * side * 0.28, -top + Math.min(h, 1.2) + 0.15, true)
      } else if (v === 4) bx(g, a, b, h, M.steel)
      else {
        // a trigger: the lever, its switch or sensor, and on the best tier the motor that pushes back
        bx(g, a * 0.5, b * 0.8, h * 0.5, M.black, -a * 0.2, 0, 0)
        bx(g, a * 0.22, b * 0.5, h * 0.4, v >= 6 ? M.blueCap : M.steel, a * 0.2, 0, -top + h * 0.2)
        if (v >= 7) {
          const o = part(g, CYL, M.steel, Math.min(b, h) * 0.6, Math.min(b, h) * 0.6, a * 0.3, a * 0.34, 0, h * 0.1)
          o.rotation.y = Math.PI / 2
          cy(g, Math.min(b, h) * 0.5, h * 0.2, M.gold, a * 0.1, 0, h * 0.2, true)
        }
      }
      break
    }
    case 'baffle': {
      // the chamber the drivers work into, with its front cut away: a floor, a top plate, and the back of its wall
      const t = Math.max(0.8, Math.min(1.6, h * 0.03))
      if (v === 1) {
        bx(g, a, b, t, M.shell, 0, 0, -top + t / 2)
        bx(g, a, b * 0.55, t, M.shell, 0, b * 0.225, top - t / 2)
        bx(g, a, t, h, M.shell, 0, b / 2 - t / 2, 0)
        for (const s of [-1, 1]) bx(g, t, b * 0.4, h, M.shell, s * (a / 2 - t / 2), b * 0.3, 0)
      } else {
        const floor = part(g, DISC, M.shell, a, b, 1, 0, 0, -top + 0.05)
        floor.castShadow = false
        const lid = part(g, RING, M.shell, a, b, 1, 0, 0, top)
        lid.scale.set(a, b, 1)
        part(g, ARC, M.shell, a, b, h, 0, 0, 0)
        // ribs up the inside of the wall stiffen it
        for (const an of [-0.8, 0, 0.8]) bx(g, t * 1.6, t * 1.6, h, M.grey, Math.sin(an) * a * 0.485, Math.cos(an) * b * 0.485, 0, false)
      }
      break
    }
    case 'wadding': {
      // loose polyester fill: a few soft lumps pressed against the back wall
      const n = 7
      for (let i = 0; i < n; i++) {
        const o = part(g, LUMP, M.wool, a * (0.3 + rnd() * 0.22), b * (0.5 + rnd() * 0.4), h * (0.3 + rnd() * 0.25), (rnd() - 0.5) * a * 0.7, (rnd() - 0.5) * b * 0.3, (rnd() - 0.5) * h * 0.66)
        o.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3)
      }
      break
    }
    case 'duct': {
      // a bass port: a tube with a flared mouth, open through the floor of the chamber
      const t = turned(g, c.axis, a, b, h)
      const dia = Math.min(t.a, t.b)
      const tube = part(t.g, CYL, M.liner, dia * 0.8, dia * 0.8, t.h, 0, 0, 0)
      tube.receiveShadow = true
      for (const s of [-1, 1]) {
        const lip = part(t.g, TORUS, M.black, dia, dia, dia * 0.5, 0, 0, s * (t.h / 2 - dia * 0.04), false)
        lip.receiveShadow = true
      }
      part(t.g, DISC, M.rubber, dia * 0.66, dia * 0.66, 1, 0, 0, t.h / 2 + 0.06, false)
      break
    }
    case 'amp': {
      // a class-D amplifier: an output coil and capacitor for every channel, and the output chips under a finned heat sink
      const t = Math.min(1.2, h * 0.14)
      const z = -top + t
      const up = h - t
      bx(g, a, b, t, M.pcb[1], 0, 0, -top + t / 2)
      const n = Math.max(1, Math.min(8, c.n ?? 2))
      const fins: [number, number, number, number, number, number][] = []
      const nf = Math.max(5, Math.round(a / 2.6))
      bx(g, a * 0.9, b * 0.3, up * 0.2, M.alu, 0, b * 0.3, z + up * 0.1)
      for (let i = 0; i < nf; i++) fins.push([(a * 0.9) / nf * 0.45, b * 0.3, up * 0.74, -a * 0.45 + ((i + 0.5) * a * 0.9) / nf, b * 0.3, z + up * 0.2 + up * 0.37])
      boxes(g, M.alu, fins, BOX, true)
      const cols = Math.min(n, 4)
      const rows = Math.ceil(n / cols)
      const cell = Math.min((a * 0.9) / cols, (b * 0.5) / rows)
      for (let i = 0; i < n; i++) {
        const x = (i % cols - (cols - 1) / 2) * ((a * 0.9) / cols)
        const y = -b * 0.38 + Math.floor(i / cols) * ((b * 0.5) / rows) + cell * 0.3
        const coil = part(g, TORUS, M.copper, cell * 0.62, cell * 0.62, Math.min(up * 0.9, cell * 1.4), x - cell * 0.14, y, z + Math.min(up * 0.25, cell * 0.2))
        coil.receiveShadow = true
        cy(g, cell * 0.3, Math.min(up * 0.7, cell * 0.8), M.wrap, x + cell * 0.3, y, z + Math.min(up * 0.7, cell * 0.8) / 2, true)
      }
      bx(g, a * 0.2, b * 0.1, up * 0.3, M.white, -a * 0.3, -b * 0.02, z + up * 0.15, false)
      break
    }
    case 'ledring': {
      const n = Math.max(3, c.n ?? 12)
      const list: [number, number, number, number, number, number][] = []
      if (v === 1) {
        bx(g, a, b, h * 0.5, M.white, 0, 0, -top + h * 0.25, false)
        for (let i = 0; i < n; i++) list.push([Math.min(2.2, (a / n) * 0.5), Math.min(2.2, b * 0.6), h * 0.5, -a / 2 + ((i + 0.5) * a) / n, 0, top - h * 0.25])
      } else {
        // a ring of flexible board with a lamp at each station, under the diffuser round the top
        const ring = part(g, RING, M.white, a, b, 1, 0, 0, -top + 0.05, false)
        ;(ring.material as THREE.Material).side = THREE.DoubleSide
        const s = Math.min(2.4, (Math.PI * (a + b)) / 2 / n / 2)
        for (let i = 0; i < n; i++) {
          const an = (i / n) * Math.PI * 2
          list.push([s, s, h * 0.7, Math.cos(an) * a * 0.47, Math.sin(an) * b * 0.47, 0])
        }
      }
      boxes(g, M.blue, list)
      break
    }
    case 'feature':
      drawFeature(c, g, a, b, h)
      break
    case 'touch': {
      // the board the keys on top are touched through: a copper pad under each, and the ribbon it leaves by
      bx(g, a, b, h * 0.6, M.pcb[1], 0, 0, -top + h * 0.3)
      const n = Math.max(1, c.n ?? 3)
      const long = a >= b
      for (let i = 0; i < n; i++) {
        const k = (i - (n - 1) / 2) / n
        part(g, DISC, M.copper, Math.min(a, b) * (n > 1 ? 0.5 : 0.6), Math.min(a, b) * (n > 1 ? 0.5 : 0.6), 1, long ? k * a * 0.94 : 0, long ? 0 : k * b * 0.94, top - h * 0.38, false)
      }
      bx(g, Math.min(4, a * 0.2), Math.min(8, b), h * 0.7, M.flex, 0, b / 2, -top + h * 0.35, false)
      break
    }
    case 'well': {
      const dia = Math.min(a, b)
      cy(g, dia, h, M.liner)
      part(g, DISC, M.rubber, dia * 0.86, dia * 0.86, 1, 0, 0, top + 0.03, false)
      for (const s of [-1, 1]) cy(g, 0.9, 0.5, M.gold, s * dia * 0.16, 0, top + 0.2, true)
      break
    }
  }
}

// ---------------------------------------------------------------- cutting the shell

interface Inner {
  z: number
  x: number
  y: number
  bores: { x: number; y: number; r: number }[]
}

/**
 * One side of a solid cut by a plane across an axis. Everything beyond the plane is pressed flat onto it, which
 * closes the cut with a flat face; with `open` that face is left out, and so are an inner wall and the bores
 * of a shell built in two sections, so that what is left is an open tray.
 */
export function cutGeometry(src: THREE.BufferGeometry, axis: 0 | 1 | 2, at: number, keep: 1 | -1, open: boolean, inner?: Inner): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const uv = g.attributes.uv
  const P: number[] = []
  const N: number[] = []
  const U: number[] = []
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  for (let i = 0; i + 2 < pos.count; i += 3) {
    let pressed = 0
    const flag = [false, false, false]
    for (let k = 0; k < 3; k++) {
      v[k].fromBufferAttribute(pos, i + k)
      flag[k] = (v[k].getComponent(axis) - at) * keep < 0
      if (flag[k]) pressed++
    }
    if (pressed === 3 && open) continue
    if (open && inner) {
      const onWall = v.every((p) => Math.abs(p.z - inner.z) < 0.02)
      const cx = (v[0].x + v[1].x + v[2].x) / 3
      const cyy = (v[0].y + v[1].y + v[2].y) / 3
      if (onWall && !(Math.abs(cx) < inner.x && cyy < inner.y)) continue
      if (v.every((p) => p.z < inner.z + 0.02) && inner.bores.some((b) => v.every((p) => Math.hypot(p.x - b.x, p.y - b.y) < b.r))) continue
    }
    for (let k = 0; k < 3; k++) {
      if (flag[k]) v[k].setComponent(axis, at)
      P.push(v[k].x, v[k].y, v[k].z)
      if (pressed === 3) N.push(axis === 0 ? -keep : 0, axis === 1 ? -keep : 0, axis === 2 ? -keep : 0)
      else if (nor) N.push(nor.getX(i + k), nor.getY(i + k), nor.getZ(i + k))
      else N.push(0, 0, 1)
      if (uv) U.push(uv.getX(i + k), uv.getY(i + k))
    }
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
  if (uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
  return out
}

// ---------------------------------------------------------------- the rig

/** How the cover of one cavity moves as the device opens: where it is, and how it is turned, at k from 0 to 1. */
type Motion = (k: number, pos: THREE.Vector3, quat: THREE.Quaternion) => void

interface Cover {
  zone: string
  group: THREE.Group
  move: Motion
  /** Where it goes in the exploded view instead: straight out along the opening. */
  stack: THREE.Vector3 | null
  /** Its own way of getting there, where a straight line from one place to the other would take it through something. */
  apart?: (k: number, e: number, pos: THREE.Vector3, quat: THREE.Quaternion) => void
}

interface Drawn {
  c: Comp
  g: THREE.Group
  /** Its place and size in the solid it belongs to, as the layout gave them. */
  at: THREE.Vector3
  size: V3
  up: THREE.Vector3
  gap: number
  hl?: THREE.Object3D
  /** The fainter outline it wears while the pointer is on it. */
  hov?: THREE.Object3D
  /** The wash of colour over it when it runs hot. */
  hot?: THREE.Object3D
}

/** What a rig remembers from one rebuild of the model to the next, so that components ease to a new size instead of jumping. */
export interface RigMemory {
  boxes: Map<string, { c: THREE.Vector3; s: THREE.Vector3; comp: Comp }>
  fresh: boolean
  /** Components to bounce, with the time each was asked for. */
  pulse: Map<string, number>
  /** Components the last layout had and this one has not, shrinking away: what each was, and when it went. */
  gone: Map<string, { comp: Comp; t0: number }>
}
export const newRigMemory = (): RigMemory => ({ boxes: new Map(), fresh: true, pulse: new Map(), gone: new Map() })

export interface Rig {
  internals: Internals
  comps: Map<string, Drawn>
  /** Pose everything: `open` and `explode` run from 0 to 1, `dt` is the time since the last frame in seconds. */
  pose(open: number, explode: number, dt: number, mem: RigMemory, now: number): void
  /** Outline the components that `match` picks, the one that is selected, and more faintly the one the pointer is on. */
  highlight(match: ((c: Comp) => boolean) | null, picked: string | null, hovered?: string | null): void
  /** Wash the components that `match` picks in the warning colour, or the error colour when it is `bad`: what runs hot. */
  heat(match: ((c: Comp) => boolean) | null, bad: boolean): void
  /** The objects a pointer can land on: one group for each component. */
  targets(): THREE.Object3D[]
  stats(): { triangles: number; meshes: number; components: number }
}

/** The face whose parts lift off with the cover, and the one whose parts lift off with the screen. */
function partHosts(d: DeviceDesign): { cover: Face[]; screen: Face[] } {
  switch (d.type) {
    case 'laptop':
    case 'earbuds':
      return { cover: [], screen: [] }
    case 'console':
      return { cover: [d.body.height > d.body.width ? 'right' : 'top'], screen: [] }
    case 'headset':
      return { cover: ['front'], screen: [] }
    case 'ring':
      return { cover: [], screen: [] }
    case 'drone':
      return { cover: ['top'], screen: [] }
    case 'tower':
      return { cover: [d.body.width > d.body.height * 1.5 ? 'top' : 'right'], screen: [] }
    case 'mouse':
      return { cover: ['top', 'left', 'right'], screen: [] }
    case 'speaker':
      return { cover: ['front', 'back', 'left', 'right', 'top', 'bottom'], screen: [] }
    default:
      return { cover: ['back'], screen: ['front'] }
  }
}

/** The face that has to look at the camera while the device is open, where it matters. */
export function openFace(d: DeviceDesign): Face | undefined {
  return d.type === 'phone' || d.type === 'tablet' || d.type === 'watch' || d.type === 'foldable' || d.type === 'handheld' || d.type === 'ereader' || d.type === 'actioncam' || d.type === 'desktop' || d.type === 'tv' ? 'back' : undefined
}

/** A lid on a hinge: it lifts a little, then swings about an edge. */
function hinged(pivot: THREE.Vector3, axis: THREE.Vector3, angle: number, normal: THREE.Vector3, pop: number): Motion {
  return (k, pos, quat) => {
    const swing = smooth((k - 0.14) / 0.86)
    quat.setFromAxisAngle(axis, angle * swing)
    pos.copy(pivot).negate().applyQuaternion(quat).add(pivot).addScaledVector(normal, pop * smooth(k / 0.22) * (1 - 0.7 * swing))
  }
}

/** Outline of the solid a cavity is cut into, in the cavity's own plane: size, corner radii and centre. */
function outlineOf(d: DeviceDesign, z: Zone): { w: number; h: number; r: number | [number, number, number, number]; cu: number; cv: number } {
  const b = d.body
  const ax = zoneAxes(z.up)
  const [zu, zv] = localSize(ax, z.box.s)
  if (z.anchor === 'pack') return { w: 92, h: 52, r: 15, cu: 0, cv: 0 }
  if (d.type === 'drone') return { w: b.width, h: b.thickness, r: droneShape(b).plan, cu: 0, cv: 0 }
  if (d.type === 'console') return { w: zu + 2 * z.wall + (b.height > b.width ? 3 : 0), h: zv + 2 * z.wall + (b.height > b.width ? 0 : 3), r: 1.5, cu: 0, cv: 0 }
  if (d.type === 'tower') return { w: zu + 2 * z.wall, h: zv + 2 * z.wall, r: Math.max(0.5, b.corner - z.wall), cu: 0, cv: 0 }
  if (d.type === 'mouse') return { w: b.width - 6, h: b.thickness - 10, r: Math.min(b.width, b.thickness) * 0.42, cu: 0, cv: 0 }
  if (d.type === 'foldable') {
    const flip = isFlip(b)
    const r = b.corner
    if (flip) return z.id === 'main' ? { w: b.width, h: b.height / 2, r: [0.05, 0.05, r, r], cu: 0, cv: -b.height / 4 } : { w: b.width, h: b.height / 2, r: [r, r, 0.05, 0.05], cu: 0, cv: b.height / 4 }
    return z.id === 'main' ? { w: b.width / 2, h: b.height, r: [r, 0.05, 0.05, r], cu: -b.width / 4, cv: 0 } : { w: b.width / 2, h: b.height, r: [0.05, r, r, 0.05], cu: b.width / 4, cv: 0 }
  }
  return { w: b.width, h: b.height, r: b.corner, cu: 0, cv: 0 }
}

const shrink = (r: number | [number, number, number, number], by: number): number | [number, number, number, number] => (typeof r === 'number' ? Math.max(r - by, 0.3) : (r.map((x) => Math.max(x - by, 0.05)) as [number, number, number, number]))

/**
 * Rig a built model for opening. Call once per model, when it is first opened;
 * the model is changed in place and is disposed of as usual.
 */
export function rigTeardown(model: THREE.Object3D, d: DeviceDesign, n: Internals): Rig {
  const b = d.body
  layer = Math.min(10, Math.max(1, Math.max(b.width, b.height) / 170))
  const hidden: THREE.Object3D[] = []
  const shown: THREE.Object3D[] = []
  const covers: Cover[] = []
  const tagged = new Map<string, THREE.Object3D[]>()
  const bodies: THREE.Mesh[] = []
  const roots = new Map<string, THREE.Object3D>()
  model.updateWorldMatrix(true, true)
  model.traverse((o) => {
    const tag = o.userData.tear as string | undefined
    if (tag) tagged.set(tag, [...(tagged.get(tag) ?? []), o])
    if (o.userData.body) bodies.push(o as THREE.Mesh)
    if (o.userData.partRoot) roots.set(o.userData.partRoot as string, o)
  })
  const within = (o: THREE.Object3D, root: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === root) return true
    return false
  }
  const mainCarrier = d.type === 'laptop' ? 'base' : 'body'
  const fixedBody = bodies.filter((m) => m.userData.carrier === mainCarrier && m.userData.half !== -1).pop()
  const anchor = fixedBody?.parent ?? model
  for (const o of tagged.get('hide') ?? []) hidden.push(o)

  // ---- one frame per solid: `tray` holds what stays, and each cavity that is cut gets a cover
  const anchors = new Map<string, THREE.Object3D>([['body', anchor], ['base', anchor]])
  const trays = new Map<string, THREE.Group>()
  const trayOf = (id: string) => {
    let t = trays.get(id)
    if (!t) {
      t = new THREE.Group()
      t.userData.overlay = true
      ;(anchors.get(id) ?? anchor).add(t)
      trays.set(id, t)
      shown.push(t)
    }
    return t
  }
  if (d.type === 'earbuds') {
    // the loose bud is taken apart where it lies: across runs along its stem, and up is the way its ear tip points
    const at = new THREE.Group()
    const loose = (tagged.get('bud') ?? [])[0]
    if (loose) {
      at.position.copy(loose.position)
      at.quaternion.copy(loose.quaternion).multiply(BUD_AXES)
    } else {
      const p = looseBudAt(b)
      at.position.set(p.x, -caseShape(b).shell / 2 + 7, p.z)
    }
    anchor.add(at)
    anchors.set('bud', at)
    for (const o of tagged.get('bud') ?? []) hidden.push(o)
  }
  const packMesh = (tagged.get('pack') ?? [])[0] as THREE.Mesh | undefined
  if (packMesh?.parent) {
    const at = new THREE.Group()
    at.position.copy(packMesh.position).add(new THREE.Vector3(0, 0, 12))
    packMesh.parent.add(at)
    anchors.set('pack', at)
  }

  const frameCol = fixedBody ? ((fixedBody.material as THREE.MeshStandardMaterial).color?.clone() ?? new THREE.Color('#555')) : new THREE.Color('#555')
  const linerMat = new THREE.MeshStandardMaterial({ color: frameCol.clone().multiplyScalar(0.5).lerp(new THREE.Color('#1c1e22'), 0.45), roughness: 0.72, metalness: 0.35, side: THREE.DoubleSide })
  const coverOf = new Map<string, THREE.Group>()
  const size = Math.max(b.width, b.height)
  const pos0 = new THREE.Vector3()
  const quat0 = new THREE.Quaternion()
  const yaw = new THREE.Vector3(0, 1, 0)
  const pitch = new THREE.Vector3(1, 0, 0)

  for (const z of n.zones) {
    if (!z.cut) continue
    const at = anchors.get(z.anchor) ?? anchor
    const mesh = z.anchor === 'pack' ? packMesh : d.type === 'foldable' ? bodies.find((m) => m.userData.half === (z.id === 'left' ? -1 : 1)) : fixedBody
    if (!mesh) continue
    const up = dirVec(z.up)
    const ax = zoneAxes(z.up)
    const [, , depth] = localSize(ax, z.box.s)
    // the mesh's own geometry may sit off the frame's origin (the pack does): cut it where the frame says
    const off = z.anchor === 'pack' ? 12 : 0
    const cutAt = z.cut.at + (z.cut.axis === 2 ? off : 0)
    const inner = mesh.userData.inner as Inner | undefined
    const keepTray = (z.cut.side === 1 ? -1 : 1) as 1 | -1
    const trayMat = (mesh.material as THREE.Material).clone()
    trayMat.side = THREE.DoubleSide
    const tray = new THREE.Mesh(cutGeometry(mesh.geometry, z.cut.axis, cutAt, keepTray, true, inner), trayMat)
    tray.castShadow = tray.receiveShadow = true
    tray.raycast = () => {}
    tray.position.copy(mesh.position)
    mesh.parent!.add(tray)
    shown.push(tray)
    hidden.push(mesh)
    const coverG = new THREE.Group()
    at.add(coverG)
    // Pressing the far side of the shell flat closes the cut, but keeps every triangle of the body in the cover as
    // well as in the tray. Where the body is a plain rounded slab the cover keeps only its own side, and is closed
    // with a flat cap of the same outline instead: a few dozen triangles for some thousands.
    const capped = z.cut.axis === 2 && z.anchor !== 'pack' && d.type !== 'headset' && d.type !== 'console' && z.wall > 0.3 && depth > 0.3
    const lidMesh = new THREE.Mesh(cutGeometry(mesh.geometry, z.cut.axis, cutAt, z.cut.side, capped), mesh.material as THREE.Material)
    lidMesh.castShadow = lidMesh.receiveShadow = true
    lidMesh.raycast = () => {}
    lidMesh.position.set(0, 0, -off)
    lidMesh.userData.cut = true
    coverG.add(lidMesh)
    shown.push(lidMesh)
    coverOf.set(z.id, coverG)

    // ---- the inside of the tray: walls with some thickness to them, a floor, and a liner inside the cover
    const o = outlineOf(d, z)
    const inset = Math.min(0.5, z.wall * 0.4)
    const headset = d.type === 'headset' && z.anchor === 'body'
    const from = headset && inner ? Math.max(0, inner.z - (z.box.c[2] - depth / 2)) : 0
    const holeShape = roundedRectShape(o.w - 2 * z.wall, o.h - 2 * z.wall, shrink(o.r, z.wall))
    if (z.wall > 0.3 && depth - from > 0.3) {
      const ringShape = roundedRectShape(o.w - 2 * inset, o.h - 2 * inset, shrink(o.r, inset))
      ringShape.holes.push(holeShape)
      const frame = new THREE.Group()
      frame.quaternion.copy(basisQuat(ax))
      frame.position.set(z.box.c[0], z.box.c[1], z.box.c[2]).addScaledVector(up, -depth / 2).addScaledVector(dirVec(ax[0]), o.cu).addScaledVector(dirVec(ax[1]), o.cv)
      // the frame is centred on the outline, which a half of a foldable is not
      if (d.type === 'foldable') frame.position.set(0, 0, z.box.c[2]).addScaledVector(up, -depth / 2).addScaledVector(dirVec(ax[0]), o.cu).addScaledVector(dirVec(ax[1]), o.cv)
      const wallGeo = new THREE.ExtrudeGeometry(ringShape, { depth: depth - from - 0.02, bevelEnabled: false, curveSegments: 10 })
      wallGeo.translate(0, 0, from)
      const walls = new THREE.Mesh(wallGeo, linerMat)
      walls.receiveShadow = true
      walls.raycast = () => {}
      frame.add(walls)
      if (!headset) {
        const floor = new THREE.Mesh(new THREE.ShapeGeometry(holeShape, 10), linerMat)
        floor.receiveShadow = true
        floor.raycast = () => {}
        frame.add(floor)
      }
      trayOf(z.anchor).add(frame)
      const liner = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(o.w - 2 * z.wall - 0.6, o.h - 2 * z.wall - 0.6, shrink(o.r, z.wall + 0.3)), 10), M.liner)
      liner.raycast = () => {}
      liner.userData.cut = true
      const lf = new THREE.Group()
      lf.quaternion.copy(frame.quaternion)
      lf.position.copy(frame.position).addScaledVector(up, depth - 0.05 * layer)
      lf.add(liner)
      if (capped) {
        const capMat = (mesh.material as THREE.Material).clone()
        capMat.side = THREE.DoubleSide
        const cap = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(o.w, o.h, o.r), 10), capMat)
        cap.position.z = 0.05 * layer - 0.004 * layer
        cap.receiveShadow = true
        cap.raycast = () => {}
        cap.userData.cut = true
        lf.add(cap)
      }
      coverG.add(lf)
      shown.push(lf)
    }

    // ---- how this cover comes away
    const c = new THREE.Vector3(z.box.c[0], z.box.c[1], z.box.c[2])
    const seam = c.clone().addScaledVector(up, depth / 2)
    const g = Math.max(2, size * 0.03)
    let move: Motion
    let stack: THREE.Vector3 | null = up.clone().multiplyScalar(depth * 5 + size * 0.08)
    if (z.anchor === 'pack') {
      move = (k, pos, quat) => (pos.copy(up).multiplyScalar(34 * smooth(k)), quat.identity())
      stack = null
    } else if (d.type === 'mouse') {
      // a mouse's shell lifts straight up off its base
      move = (k, pos, quat) => (pos.set(0, b.height * 1.5 * smooth(k), 0), quat.identity())
    } else if (d.type === 'console' || d.type === 'tower') {
      const tower = d.type === 'tower' ? z.up === 1 : b.height > b.width
      move = tower ? hinged(new THREE.Vector3(z.cut.at, 0, -b.thickness / 2), yaw, 1.83, up, 6) : hinged(new THREE.Vector3(0, z.cut.at, -b.thickness / 2), pitch, -1.75, up, 6)
    } else if (d.type === 'drone') {
      // a drone's top shell lifts straight up off the body
      move = (k, pos, quat) => (pos.set(0, b.height * 1.6 * smooth(k), 0), quat.identity())
    } else if (d.type === 'headset') {
      // the front plate stays on its hinge when the rest is pulled apart: what comes out then leaves by the face
      move = hinged(new THREE.Vector3(0, b.height / 2, z.cut.at), pitch, -1.9, up, 5)
      stack = null
    }
    else if (d.type === 'desktop' || d.type === 'tv') move = hinged(new THREE.Vector3(0, b.height / 2, seam.z), pitch, 1.83, up, size * 0.02)
    // a laptop's bottom plate is laid flat behind it, inside up
    else if (d.type === 'laptop') move = hinged(new THREE.Vector3(0, -(b.height / 2 + 6), seam.z), pitch, -Math.PI, up, 5)
    else if (d.type === 'foldable') {
      // each half's back swings outwards, away from the hinge
      const flip = isFlip(b)
      const out = z.id === 'left' ? 1 : -1
      // (a flip's two backs go one to each side as well: above and below there is no room for them in the view)
      void flip
      move = hinged(new THREE.Vector3(-out * (b.width / 2 + g), 0, seam.z), yaw, out * Math.PI, up, 2.4)
    } else if (b.width > b.height * 1.15) move = hinged(new THREE.Vector3(0, b.height / 2 + g, seam.z), pitch, Math.PI, up, 2.4)
    else move = hinged(new THREE.Vector3(-(b.width / 2 + g), 0, seam.z), yaw, Math.PI, up, Math.max(1.2, size * 0.012))
    // pulled apart, the cover hangs out along the opening and half its own width to one side, so that it does not hide the rest
    if (stack) {
      move(1, pos0, quat0)
      const aside = pos0.clone().addScaledVector(up, -pos0.dot(up))
      // the back of a television comes away as the last of three sheets, each slid clear of the one before
      if (d.type === 'tv' || d.type === 'desktop') stack.copy(up).multiplyScalar(size * 0.06 * 4.4).add(new THREE.Vector3(b.width * 1.04, 0, 0))
      else if (aside.lengthSq() > 1 && d.type !== 'console' && d.type !== 'headset') stack.addScaledVector(aside.normalize(), Math.min(b.width, b.height) * 0.9)
    }
    let apart: Cover['apart']
    if ((d.type === 'tv' || d.type === 'desktop') && stack) {
      // the back of a screen on a stand swings shut again as it is drawn straight back, clear of the stand that
      // passes through it, and only then rises clear of the sheets under it
      const pivot = new THREE.Vector3(0, b.height / 2, seam.z)
      const far = stack.dot(up)
      const pop = size * 0.02
      apart = (k, e, pos, quat) => {
        const back = smooth(e / 0.5)
        const swing = smooth((k - 0.14) / 0.86) * (1 - back)
        quat.setFromAxisAngle(pitch, 1.83 * swing)
        pos.copy(pivot).negate().applyQuaternion(quat).add(pivot).addScaledVector(up, pop * smooth(k / 0.22) * (1 - 0.7 * swing) + far * back * k)
        pos.y += b.height * 1.16 * smooth((e - 0.5) / 0.5) * k
      }
    }
    covers.push({ zone: z.id, group: coverG, move, stack, apart })
  }

  // ---- covers that are not cut from the shell: a speaker's sleeve, and the works of an earbud case, which lift out whole
  const hosts = partHosts(d)
  if (d.type === 'speaker') {
    const sleeve = new THREE.Group()
    anchor.add(sleeve)
    coverOf.set('main', sleeve)
    const lift = b.height * 1.08
    const aside = b.width * 1.3
    covers.push({ zone: 'main', group: sleeve, stack: null, move: (k, pos, quat) => (pos.set(aside * smooth((k - 0.34) / 0.4), lift * (smooth(k / 0.4) - smooth((k - 0.72) / 0.28)), 0), quat.identity()) })
    // what the sleeve leaves standing: a frame of four posts between the base and a top ring
    const z = n.zones.find((q) => q.id === 'main')!
    const t = trayOf('body')
    const [zx, zy, zz] = z.box.s
    const round = (b.form ?? 'column') !== 'block'
    // four posts between a base and a hoop at the top; on a round speaker they stand on the circle
    const k = round ? 0.7071 : 1
    if ((b.form ?? 'column') !== 'orb') for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(t, 2.4, zy, 2.4, M.black, sx * (zx / 2 + 1.2) * k, z.box.c[1], sz * (zz / 2 + 1.2) * k, false)
    const flat = (o: THREE.Mesh, y: number) => {
      o.rotation.x = -Math.PI / 2
      o.position.set(0, y, 0)
      ;(o.material as THREE.Material).side = THREE.DoubleSide
    }
    if ((b.form ?? 'column') === 'orb') {
      // an orb's frame follows its shell: ribs from the base to the top like lines of longitude, and a hoop at each end and round the middle
      const sh = speakerShape(b)
      const lo = z.box.c[1] - zy / 2
      const hi = z.box.c[1] + zy / 2
      const at = (an: number, y: number) => {
        const k2 = Math.sqrt(Math.max(0.02, 1 - (y / sh.ry) ** 2))
        return new THREE.Vector3(Math.cos(an) * (b.width / 2 - 3.4) * k2, y, Math.sin(an) * (b.thickness / 2 - 3.4) * k2)
      }
      const ribs = 6
      const steps = 8
      const cage = new THREE.InstancedMesh(BOX, M.black, ribs * steps)
      const m4 = new THREE.Matrix4()
      const q = new THREE.Quaternion()
      const yAxis = new THREE.Vector3(0, 1, 0)
      for (let i = 0; i < ribs; i++) {
        for (let j = 0; j < steps; j++) {
          const an = ((i + 0.5) / ribs) * Math.PI * 2
          const p0 = at(an, lo + ((hi - lo) * j) / steps)
          const p1 = at(an, lo + ((hi - lo) * (j + 1)) / steps)
          const len = p0.distanceTo(p1)
          q.setFromUnitVectors(yAxis, p1.clone().sub(p0).normalize())
          cage.setMatrixAt(i * steps + j, m4.compose(p0.add(p1).multiplyScalar(0.5), q, new THREE.Vector3(2, len + 0.6, 2)))
        }
      }
      cage.raycast = () => {}
      cage.receiveShadow = true
      t.add(cage)
      for (const [y, solid] of [[lo - 0.4, true], [hi + 0.6, false], [0, false]] as const) {
        const edge = at(0, y).x * 2 + 2.4
        const edgeZ = at(Math.PI / 2, y).z * 2 + 2.4
        flat(part(t, solid ? DISC : RING, M.black, edge, edgeZ, 1), y)
      }
    } else if (round) {
      flat(part(t, DISC, M.black, zx + 5, zz + 5, 1), z.box.c[1] - zy / 2 - 0.4)
      flat(part(t, RING, M.black, zx + 5, zz + 5, 1), z.box.c[1] + zy / 2 + 0.6)
    } else {
      bx(t, zx + 5.4, 2, zz + 5.4, M.black, 0, z.box.c[1] - zy / 2 - 1, 0)
      for (const s of [-1, 1]) {
        bx(t, zx + 5.4, 1.6, 2.4, M.black, 0, z.box.c[1] + zy / 2 + 0.8, s * (zz / 2 + 1.4), false)
        bx(t, 2.4, 1.6, zz + 5.4, M.black, s * (zx / 2 + 1.4), z.box.c[1] + zy / 2 + 0.8, 0, false)
      }
    }
  }
  let guts: THREE.Group | null = null
  if (d.type === 'earbuds') {
    guts = new THREE.Group()
    anchor.add(guts)
    const cs = caseShape(b)
    covers.push({ zone: 'guts', group: guts, stack: null, move: (k, pos, quat) => (pos.set(0, (cs.shell + 7) * smooth(k), 0), quat.identity()) })
    for (const o of tagged.get('guts') ?? []) guts.attach(o)
    // the mouth of the empty shell, and the frame everything hangs from
    const z = n.zones.find((q) => q.id === 'main')!
    const t = trayOf('body')
    bx(t, z.box.s[0] + 1.2, 0.2, z.box.s[2] + 1.2, M.rubber, 0, cs.shell / 2 + 0.04, 0, false)
    const cage = new THREE.Group()
    for (const s of [-1, 1]) bx(cage, 0.8, z.box.s[1], z.box.s[2] * 0.5, M.black, s * (z.box.s[0] / 2 + 0.5), z.box.c[1], 0, false)
    guts.add(cage)
    shown.push(cage)
  }
  const screenG = new THREE.Group()
  anchor.add(screenG)
  for (const o of tagged.get('cover') ?? []) {
    if (d.type === 'laptop' && !within(o, anchor)) continue
    const half = d.type === 'foldable' ? (within(o, bodies.find((m) => m.userData.half === -1)?.parent ?? anchor) ? 'left' : 'main') : 'main'
    coverOf.get(half)?.attach(o)
  }
  for (const o of tagged.get('screen') ?? []) if (d.type !== 'laptop' && d.type !== 'speaker') screenG.attach(o)
  const sideOf = (p: PlacedPart) => {
    if (d.type !== 'foldable') return 'main'
    const root = roots.get(p.id)
    return root && within(root, bodies.find((m) => m.userData.half === -1)?.parent ?? anchor) ? 'left' : 'main'
  }
  for (const p of d.parts) {
    const root = roots.get(p.id)
    if (!root) continue
    if (hosts.cover.includes(p.face)) coverOf.get(sideOf(p))?.attach(root)
    else if (hosts.screen.includes(p.face)) screenG.attach(root)
  }

  // ---- the components
  const comps = new Map<string, Drawn>()
  const zoneOf = new Map(n.zones.map((z) => [z.id, z]))
  const mainZone = zoneOf.get('main')
  const sheets = d.type === 'tv' || d.type === 'desktop'
  /** Stand one component in its place. A ghost is one the layout no longer has, drawn once more so that it can shrink away. */
  const make = (c: Comp, ghost = false): Drawn | null => {
    const z = zoneOf.get(c.zone)
    if (!z) return null
    const g = new THREE.Group()
    g.quaternion.copy(basisQuat(c.ax))
    g.position.set(c.box.c[0], c.box.c[1], c.box.c[2])
    const inv = g.quaternion.clone().invert()
    const origin = g.position.clone()
    const [a, bb, h] = localSize(c.ax, c.box.s)
    draw(c, g, a, bb, h, (p) => new THREE.Vector3(p[0], p[1], p[2]).sub(origin).applyQuaternion(inv))
    if (ghost) g.traverse((o) => (o.raycast = () => {}))
    else g.traverse((o) => (o.userData.comp = c.id))
    const host = c.host === 'cover' ? coverOf.get(c.zone === 'body' || c.zone === 'hinge' ? 'main' : c.zone) : c.host === 'screen' ? screenG : null
    const parent = host ?? (guts && c.zone === 'main' ? guts : trayOf(z.anchor))
    parent.add(g)
    if (!ghost && (host || parent === guts)) shown.push(g)
    const zu = z.id === 'body' || z.id === 'hinge' ? (mainZone ?? z) : z
    const up = dirVec(zu.up)
    const depth = zu.box.s[Math.abs(zu.up) - 1]
    // a wide, shallow device comes apart in sheets, which have to be moved well clear of each other to be seen at all
    return { c, g, at: origin, size: [a, bb, h], up, gap: c.host !== 'tray' ? 0 : sheets ? size * 0.06 : Math.max(3.5, Math.min(depth * 0.9, size * 0.12)) }
  }
  const ghosts = new Map<string, Drawn>()
  for (const c of n.comps) {
    const it = make(c)
    if (!it) continue
    const { g } = it
    const origin = it.at
    const inv = g.quaternion.clone().invert()
    comps.set(c.id, it)
    // what does not fit is said in the colour the issue list uses
    if (!c.fits) {
      const neg = new THREE.MeshBasicMaterial({ color: themeColor('neg', '#ff5a4a'), transparent: true, opacity: 0.55, depthWrite: false })
      for (const k of c.clash ?? [c.box]) {
        const s = localSize(c.ax, k.s)
        const o = bx(g, s[0] + 0.3, s[1] + 0.3, s[2] + 0.3, neg, 0, 0, 0, false)
        o.position.copy(new THREE.Vector3(k.c[0], k.c[1], k.c[2]).sub(origin).applyQuaternion(inv))
        o.renderOrder = 6
        o.userData.comp = c.id
      }
    }
  }
  // ---- the two halves of an earbud's shell are the loose bud itself, cut across the middle where it lies
  const looseBud = d.type === 'earbuds' ? (tagged.get('bud') ?? [])[0] : undefined
  if (looseBud) {
    const toBud = BUD_AXES.clone().invert()
    for (const [side, id] of [[-1, 'budcap'], [1, 'budtip']] as const) {
      const it = comps.get(id)
      if (!it) continue
      const hold = new THREE.Group()
      const inv = it.g.quaternion.clone().invert()
      hold.quaternion.copy(inv).multiply(toBud)
      hold.position.copy(it.at).negate().applyQuaternion(inv)
      it.g.add(hold)
      for (const child of looseBud.children) {
        const m = child as THREE.Mesh
        if (!m.isMesh) continue
        m.updateMatrix()
        const whole = m.geometry.clone().applyMatrix4(m.matrix)
        const half = cutGeometry(whole, 2, 0, side, true)
        whole.dispose()
        if (!half.attributes.position.count) {
          half.dispose()
          continue
        }
        const mat = (m.material as THREE.Material).clone()
        mat.side = THREE.DoubleSide
        const o = new THREE.Mesh(half, mat)
        o.castShadow = o.receiveShadow = true
        o.userData.comp = id
        hold.add(o)
      }
    }
  }

  // ---- a stand bolted to the back passes through a cut-out in the cover, which is open to the bottom edge so
  // that the cover can swing up past it. The cut-out is made where the cover is drawn, and follows it as it moves.
  const mount = d.type === 'desktop' ? standMount(b, d.type) : null
  const coverMain = coverOf.get('main')
  let notch: { local: THREE.Plane[]; world: THREE.Plane[]; on: THREE.Object3D } | null = null
  if (mount && coverMain && mainZone) {
    const hw = (mount.w - 12) / 2 + 2.5
    const yTop = mount.y + (mount.h - 12) / 2 + 2.5
    const local = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), -hw), new THREE.Plane(new THREE.Vector3(1, 0, 0), -hw), new THREE.Plane(new THREE.Vector3(0, 1, 0), -yTop)]
    const world = local.map((p) => p.clone())
    coverMain.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || o.userData.comp || Array.isArray(m.material)) return
      for (let p: THREE.Object3D | null = o; p && p !== coverMain; p = p.parent) if (p.userData.partRoot) return
      const mat = m.material.clone()
      mat.clippingPlanes = world
      mat.clipIntersection = true
      mat.clipShadows = true
      m.material = mat
    })
    // the cut edge, and the neck that joins the stand to its bracket through it
    const seamZ = mainZone.box.c[2] - mainZone.box.s[2] / 2
    const backZ = -b.thickness / 2
    const ct = Math.max(0.4, seamZ - backZ)
    const low = -b.height / 2
    const rim = new THREE.Group()
    for (const s of [-1, 1]) bx(rim, 1, yTop - low, ct, linerMat, s * (hw + 0.5), (yTop + low) / 2, backZ + ct / 2, false)
    bx(rim, 2 * hw + 2, 1, ct, linerMat, 0, yTop + 0.5, backZ + ct / 2, false)
    rim.traverse((o) => ((o.raycast = () => {}), (o.userData.cut = true)))
    coverMain.add(rim)
    shown.push(rim)
    bx(trayOf('body'), (mount.w - 12) * 0.86, (mount.h - 12) * 0.86, ct + 1.4, M.darkSteel, 0, mount.y, backZ + (ct + 1.4) / 2 + 0.2, false).raycast = () => {}
    notch = { local, world, on: coverMain }
  }
  for (const o of shown) o.visible = false

  const accent = new THREE.LineBasicMaterial({ color: themeColor('accent', '#ff6b1a'), depthTest: false, transparent: true, toneMapped: false })
  const faint = new THREE.LineBasicMaterial({ color: '#e8eaee', depthTest: false, transparent: true, opacity: 0.75, toneMapped: false })
  let heatMat: THREE.MeshBasicMaterial | null = null
  const lift = (it: Drawn, k: number, e: number) => (it.c.back ? -it.gap * 1.25 * it.c.back * e : it.gap * it.c.layer * (it.c.zone === 'bud' ? 0.75 * k : e))
  const fill = new THREE.MeshBasicMaterial({ color: themeColor('accent', '#ff6b1a'), transparent: true, opacity: 0.09, depthWrite: false, depthTest: false, toneMapped: false })
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const ident = new THREE.Quaternion()
  const shut = model.userData.shut as ((k: number) => void) | undefined
  let dock: THREE.Object3D | undefined
  model.traverse((o) => o.userData.prop === 'dock' && (dock = o))
  const dockY = (dock as THREE.Object3D | undefined)?.position.y ?? 0
  const tall = d.type !== 'foldable' && !(b.width > b.height * 1.15) && (d.type === 'phone' || d.type === 'tablet' || d.type === 'watch')
  const screenDir = mainZone ? dirVec(mainZone.up).negate() : new THREE.Vector3(0, 0, 1)
  const screenGap = mainZone ? mainZone.box.s[Math.abs(mainZone.up) - 1] * 2.2 + size * 0.05 : 0

  return {
    internals: n,
    comps,
    pose(open, explode, dt, mem, now) {
      const vis = open > 0.002
      for (const o of shown) o.visible = vis
      for (const o of hidden) o.visible = !vis
      // a laptop is shut and turned over first, and only then opened
      const k = shut ? smooth((open - 0.5) / 0.5) : smooth(open)
      shut?.(Math.min(1, open / 0.5))
      const e = smooth(explode) * k
      for (const cv of covers) {
        cv.move(k, pos, quat)
        if (cv.apart && e > 0) cv.apart(k, e, pos, quat)
        else if (cv.stack && e > 0) {
          pos.lerp(cv.stack, e)
          quat.slerp(ident, e)
        }
        cv.group.position.copy(pos)
        cv.group.quaternion.copy(quat)
      }
      screenG.position.copy(screenDir).multiplyScalar(screenGap * e)
      // keep the pair of them in the middle of the view while the cover lies beside the tray
      const aside = k * (1 - e)
      // only a little: the tray stays near the middle, clear of the panel on the left of the designer, and the cover lies to its right
      if (tall) model.position.set((b.width / 2 + Math.max(2, size * 0.03)) * 0.25 * aside, 0, 0)
      else if (d.type === 'speaker') model.position.set(-b.width * 0.6 * smooth((open - 0.34) / 0.4), 0, 0)
      else model.position.set(0, 0, 0)
      // a handheld is lifted out of its dock before it is opened: the wall of the dock stands where its back swings
      if (dock) {
        const out = (b.height * 0.5 + 6) * smooth(k / 0.16)
        model.position.y = out
        dock.position.y = dockY - out
      }
      const ease = 1 - Math.exp(-dt * 9)
      for (const [id, it] of comps) {
        let cur = mem.boxes.get(id)
        const target = new THREE.Vector3(...it.size)
        if (!cur) {
          cur = { c: it.at.clone(), s: mem.fresh ? target.clone() : target.clone().multiplyScalar(0.05), comp: it.c }
          mem.boxes.set(id, cur)
        }
        cur.comp = it.c
        cur.c.lerp(it.at, ease)
        cur.s.lerp(target, ease)
        if (cur.c.distanceToSquared(it.at) < 1e-5) cur.c.copy(it.at)
        if (cur.s.distanceToSquared(target) < 1e-5) cur.s.copy(target)
        it.g.position.copy(cur.c).addScaledVector(it.up, lift(it, k, e))
        // and each sheet is slid to one side of the one under it, so that both show
        if (sheets && it.c.host === 'tray' && it.c.layer >= 1) it.g.position.x += b.width * 0.52 * e
        it.g.scale.set(cur.s.x / Math.max(target.x, 0.01), cur.s.y / Math.max(target.y, 0.01), cur.s.z / Math.max(target.z, 0.01))
        const t0 = mem.pulse.get(id)
        if (t0 !== undefined) {
          const t = (now - t0) / 620
          if (t >= 1) mem.pulse.delete(id)
          else {
            const hop = Math.sin(Math.PI * t) * (1 - t)
            it.g.position.addScaledVector(it.up, hop * Math.max(1.2, Math.min(it.size[2] * 1.4, size * 0.04)))
            it.g.scale.multiplyScalar(1 + 0.07 * hop)
          }
        }
        const lid = it.g.userData.lid as { o: THREE.Object3D; z: number; rise: number } | undefined
        if (lid) lid.o.position.z = lid.z + lid.rise * smooth((open - 0.55) / 0.45)
        const spin = it.g.userData.spin as THREE.Object3D | undefined
        if (spin && vis) spin.rotation.z += dt * 5
        // the display stack is inside the body until the screen is lifted off it
        if (it.c.kind === 'display' && it.c.host === 'screen') it.g.visible = e > 0.01
      }
      // what the layout no longer has shrinks away where it stood, instead of vanishing
      for (const [id, was] of [...mem.boxes]) {
        if (comps.has(id)) continue
        if (vis && k > 0.5) mem.gone.set(id, { comp: was.comp, t0: now })
        mem.boxes.delete(id)
      }
      for (const [id, was] of [...mem.gone]) {
        const t = (now - was.t0) / 320
        let gh = ghosts.get(id)
        if (comps.has(id) || t >= 1 || !vis) {
          mem.gone.delete(id)
          if (gh) gh.g.visible = false
          continue
        }
        if (!gh) {
          const made = make(was.comp, true)
          if (!made) {
            mem.gone.delete(id)
            continue
          }
          ghosts.set(id, (gh = made))
        }
        gh.g.visible = true
        gh.g.position.copy(gh.at).addScaledVector(gh.up, lift(gh, k, e))
        gh.g.scale.setScalar(Math.max(0.001, 1 - smooth(t)))
      }
      if (d.type === 'speaker' && vis && k < 0.4) {
        anchor.updateWorldMatrix(true, false)
        REVEAL.constant = anchor.localToWorld(pos.set(0, -b.height / 2 + b.height * 1.08 * smooth(k / 0.4), 0)).y
      } else REVEAL.constant = 1e9
      if (notch) {
        notch.on.updateWorldMatrix(true, false)
        notch.world.forEach((p, i) => p.copy(notch!.local[i]).applyMatrix4(notch!.on.matrixWorld))
      }
      mem.fresh = false
    },
    heat(match, bad) {
      for (const it of comps.values()) {
        const on = !!match && match(it.c)
        if (on && !it.hot) {
          heatMat ??= new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false })
          const o = new THREE.Mesh(BOX, heatMat)
          o.scale.set(it.size[0] + 0.5, it.size[1] + 0.5, it.size[2] + 0.5)
          o.renderOrder = 5
          o.raycast = () => {}
          o.userData.overlay = true
          it.g.add(o)
          it.hot = o
        }
        if (it.hot) it.hot.visible = on
      }
      heatMat?.color.set(themeColor(bad ? 'neg' : 'warn', bad ? '#ff5a4a' : '#ffb020'))
    },
    targets: () => [...comps.values()].map((it) => it.g),
    highlight(match, picked, hovered) {
      for (const it of comps.values()) {
        const hov = it.c.id === hovered && it.c.id !== picked
        if (hov && !it.hov) {
          const box = new THREE.LineSegments(EDGES, faint)
          box.renderOrder = 21
          box.scale.set(it.size[0] + 0.4, it.size[1] + 0.4, it.size[2] + 0.4)
          box.raycast = () => {}
          box.userData.overlay = true
          it.g.add(box)
          it.hov = box
        }
        if (it.hov) it.hov.visible = hov
        const on = it.c.id === picked || (!!match && match(it.c))
        if (on && !it.hl) {
          const h = new THREE.Group()
          const box = new THREE.LineSegments(EDGES, accent)
          box.renderOrder = 21
          const glow = new THREE.Mesh(BOX, fill)
          glow.renderOrder = 20
          h.add(box, glow)
          h.scale.set(it.size[0] + 0.6, it.size[1] + 0.6, it.size[2] + 0.6)
          h.traverse((o) => ((o.raycast = () => {}), (o.userData.overlay = true)))
          it.g.add(h)
          it.hl = h
        }
        if (it.hl) it.hl.visible = on
      }
    },
    stats() {
      let triangles = 0
      let meshes = 0
      const count = (o: THREE.Object3D) => {
        const m = o as THREE.Mesh
        if (!m.isMesh || !m.geometry) return
        const g = m.geometry
        const tris = (g.index ? g.index.count : g.attributes.position.count) / 3
        triangles += tris * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1)
        meshes++
      }
      // everything the rig added: the trays and their liners, the cut shells, and the components wherever they ride
      const seen = new Set<THREE.Object3D>()
      const walk = (o: THREE.Object3D) => o.traverse((x) => !seen.has(x) && (seen.add(x), count(x)))
      for (const o of shown) if (!o.userData.partRoot && !o.userData.tear) walk(o)
      for (const it of comps.values()) walk(it.g)
      return { triangles: Math.round(triangles), meshes, components: comps.size }
    },
  }
}
