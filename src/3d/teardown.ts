// Opens a built device model up and shows what is inside it. The layout comes
// from sim/internals.ts; this file only draws it. A model is rigged the first
// time it is opened: its shell is cut in two along the seam, the piece that
// comes off is hung on a hinge of its own, and the components are stood in the
// tray. Everything a rig shares with other rigs (simple shapes, materials,
// printed labels) is made once and marked so that disposing of a model leaves it alone.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { caseShape, isFlip } from '../sim/geometry'
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
  const m = share(new THREE.MeshStandardMaterial({ map: t, roughness: style === 'label' ? 0.82 : 0.7, metalness: 0 }))
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
  cy(g, dia, h * 0.16, M.darkSteel, 0, 0, h / 2 - h * 0.08)
  part(g, RING, M.rubber, dia * 0.96, dia * 0.96, 1, 0, 0, h / 2 + 0.03, false)
  const c = part(g, CONE, M.cone, dia * 0.84, dia * 0.84, h * 0.42, 0, 0, h / 2 - h * 0.3, false)
  ;(c.material as THREE.Material).side = THREE.DoubleSide
  cy(g, dia * 0.3, h * 0.12, small ? M.pale : M.black, 0, 0, h / 2 - h * 0.44)
  cy(g, dia * 0.5, h * 0.4, M.steel, 0, 0, -h / 2 + h * 0.2)
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
      if (c.zone === 'bud') {
        cy(g, Math.min(a, b), h, M.pcb[1])
        for (let i = 0; i < (c.n ?? 0); i++) cy(g, 1.3, 0.5, M.steel, Math.cos(i * 2.1) * a * 0.3, Math.sin(i * 2.1) * a * 0.3, top + 0.25, true)
        break
      }
      bx(g, a, b, h, M.pcb[v] ?? M.pcb[0])
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
        const mat = c.kind === 'pipe' ? M.copper : c.kind === 'cable' ? (v === 1 ? M.blueCap : M.black) : M.flex
        const t = Math.max(0.3, Math.min(a, b, h) > 0 ? h : 1)
        for (let i = 0; i + 1 < pts.length; i++) {
          const len = pts[i].distanceTo(pts[i + 1])
          if (len < 0.05) continue
          const seg = new THREE.Group()
          seg.position.copy(pts[i]).add(pts[i + 1]).multiplyScalar(0.5)
          seg.rotation.z = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x)
          g.add(seg)
          if (c.kind === 'pipe') bx(seg, len + t * 0.8, t * 1.5, t * 0.6, mat)
          else {
            const o = part(seg, CYL_LOW, mat, t, t, len + t * 0.5)
            o.rotation.y = Math.PI / 2
          }
        }
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
      if (v === 4) bx(g, a, b, h, M.green, 0, 0, 0, false)
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
        // an LED backlight: a white reflector with a grid of lamps
        bx(g, a, b, h, M.white, 0, 0, 0, false)
        const cols = 14
        const rows = 8
        const leds = new THREE.InstancedMesh(BOX, M.led, cols * rows)
        const m4 = new THREE.Matrix4()
        const s = Math.max(1.5, a / 220)
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) leds.setMatrixAt(i * rows + j, m4.makeScale(s, s, 0.1).setPosition(-a / 2 + ((i + 0.5) * a) / cols, -b / 2 + ((j + 0.5) * b) / rows, top))
        g.add(leds)
      } else if (v === 7) {
        // MicroLED tiles, butted together
        const cols = 6
        const rows = 4
        const tiles = new THREE.InstancedMesh(BOX, M.graphite, cols * rows)
        const m4 = new THREE.Matrix4()
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) tiles.setMatrixAt(i * rows + j, m4.makeScale((a / cols) * 0.985, (b / rows) * 0.985, h).setPosition(-a / 2 + ((i + 0.5) * a) / cols, -b / 2 + ((j + 0.5) * b) / rows, 0))
        tiles.receiveShadow = true
        g.add(tiles)
      } else if (v === 8 || v === 9) {
        // half of an earbud's shell: the outer cap, or the inner half with its ear tip
        const dome = new THREE.Mesh(DOME, M.white)
        dome.scale.set(a / 2, b / 2, h * (v === 8 ? 1 : 0.6))
        dome.position.z = v === 8 ? -top : top
        if (v === 9) {
          dome.rotation.x = Math.PI
          cy(g, a * 0.36, h * 0.3, M.white, 0, 0, -top + h * 0.6 + h * 0.15)
          cy(g, a * 0.52, h * 0.24, M.pale, 0, 0, top - h * 0.12)
        }
        dome.castShadow = true
        g.add(dome)
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
        draw({ ...c, kind: 'board', v: 3 }, g, a, b, Math.min(h, 1.6), toLocal)
        g.children.forEach((o) => (o.position.z += -top + Math.min(h, 1.6) / 2))
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
      // the barrel, open at both ends, with its elements inside: one thick one, or a thin folded stack
      cy(g, dia, h, M.black)
      part(g, RING, v >= 2 ? M.steel : M.grey, dia * 1.02, dia * 1.02, 1, 0, 0, top + 0.05, false)
      const els = v >= 2 ? 2 : 1
      for (let i = 0; i < els; i++) part(g, DISC, M.lensGlass, dia * 0.9, dia * 0.9, 1, 0, 0, top - 0.3 - i * Math.min(2.4, h * 0.3) + 0.06, false)
      if (v === 0) for (const k of [0.34, 0.52, 0.7]) part(g, RING, M.pale, dia * k, dia * k, 1, 0, 0, top + 0.08, false)
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
function cutGeometry(src: THREE.BufferGeometry, axis: 0 | 1 | 2, at: number, keep: 1 | -1, open: boolean, inner?: Inner): THREE.BufferGeometry {
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
}

/** What a rig remembers from one rebuild of the model to the next, so that components ease to a new size instead of jumping. */
export interface RigMemory {
  boxes: Map<string, { c: THREE.Vector3; s: THREE.Vector3 }>
  fresh: boolean
  /** Components to bounce, with the time each was asked for. */
  pulse: Map<string, number>
}
export const newRigMemory = (): RigMemory => ({ boxes: new Map(), fresh: true, pulse: new Map() })

export interface Rig {
  internals: Internals
  comps: Map<string, Drawn>
  /** Pose everything: `open` and `explode` run from 0 to 1, `dt` is the time since the last frame in seconds. */
  pose(open: number, explode: number, dt: number, mem: RigMemory, now: number): void
  /** Outline the components that `match` picks, and the one that is selected. */
  highlight(match: ((c: Comp) => boolean) | null, picked: string | null): void
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
    case 'speaker':
      return { cover: ['front', 'back', 'left', 'right', 'top', 'bottom'], screen: [] }
    default:
      return { cover: ['back'], screen: ['front'] }
  }
}

/** The face that has to look at the camera while the device is open, where it matters. */
export function openFace(d: DeviceDesign): Face | undefined {
  return d.type === 'phone' || d.type === 'tablet' || d.type === 'watch' || d.type === 'foldable' || d.type === 'handheld' || d.type === 'desktop' || d.type === 'tv' ? 'back' : undefined
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
  if (d.type === 'console') return { w: zu + 2 * z.wall + (b.height > b.width ? 3 : 0), h: zv + 2 * z.wall + (b.height > b.width ? 0 : 3), r: 1.5, cu: 0, cv: 0 }
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
    const at = new THREE.Group()
    const p = looseBudAt(b)
    at.position.set(p.x, -caseShape(b).shell / 2, p.z)
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
    const lidMesh = new THREE.Mesh(cutGeometry(mesh.geometry, z.cut.axis, cutAt, z.cut.side, false), mesh.material as THREE.Material)
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
    } else if (d.type === 'console') {
      const tower = b.height > b.width
      move = tower ? hinged(new THREE.Vector3(z.cut.at, 0, -b.thickness / 2), yaw, 1.83, up, 6) : hinged(new THREE.Vector3(0, z.cut.at, -b.thickness / 2), pitch, -1.75, up, 6)
    } else if (d.type === 'headset') move = hinged(new THREE.Vector3(0, b.height / 2, z.cut.at), pitch, -1.9, up, 5)
    else if (d.type === 'desktop' || d.type === 'tv') move = hinged(new THREE.Vector3(0, b.height / 2, seam.z), pitch, 1.83, up, size * 0.02)
    // a laptop's bottom plate is laid flat behind it, inside up
    else if (d.type === 'laptop') move = hinged(new THREE.Vector3(0, -(b.height / 2 + 6), seam.z), pitch, -Math.PI, up, 5)
    else if (d.type === 'foldable') {
      // each half's back swings outwards, away from the hinge
      const flip = isFlip(b)
      const out = z.id === 'left' ? 1 : -1
      move = flip ? hinged(new THREE.Vector3(0, out * (b.height / 2 + g), seam.z), pitch, out * Math.PI, up, 2.4) : hinged(new THREE.Vector3(-out * (b.width / 2 + g), 0, seam.z), yaw, out * Math.PI, up, 2.4)
    } else if (b.width > b.height * 1.15) move = hinged(new THREE.Vector3(0, b.height / 2 + g, seam.z), pitch, Math.PI, up, 2.4)
    else move = hinged(new THREE.Vector3(-(b.width / 2 + g), 0, seam.z), yaw, Math.PI, up, Math.max(1.2, size * 0.012))
    covers.push({ zone: z.id, group: coverG, move, stack })
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
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(t, 2.4, zy, 2.4, M.black, sx * (zx / 2 + 1.2) * k, z.box.c[1], sz * (zz / 2 + 1.2) * k, false)
    const flat = (o: THREE.Mesh, y: number) => {
      o.rotation.x = -Math.PI / 2
      o.position.set(0, y, 0)
      ;(o.material as THREE.Material).side = THREE.DoubleSide
    }
    if (round) {
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
  for (const c of n.comps) {
    const z = zoneOf.get(c.zone)
    if (!z) continue
    const g = new THREE.Group()
    g.quaternion.copy(basisQuat(c.ax))
    g.position.set(c.box.c[0], c.box.c[1], c.box.c[2])
    const inv = g.quaternion.clone().invert()
    const origin = g.position.clone()
    const [a, bb, h] = localSize(c.ax, c.box.s)
    draw(c, g, a, bb, h, (p) => new THREE.Vector3(p[0], p[1], p[2]).sub(origin).applyQuaternion(inv))
    g.traverse((o) => (o.userData.comp = c.id))
    const host = c.host === 'cover' ? coverOf.get(c.zone === 'body' || c.zone === 'hinge' ? 'main' : c.zone) : c.host === 'screen' ? screenG : null
    const parent = host ?? (guts && c.zone === 'main' ? guts : trayOf(z.anchor))
    parent.add(g)
    if (host || parent === guts) shown.push(g)
    const zu = z.id === 'body' || z.id === 'hinge' ? (mainZone ?? z) : z
    const up = dirVec(zu.up)
    const depth = zu.box.s[Math.abs(zu.up) - 1]
    comps.set(c.id, { c, g, at: origin, size: [a, bb, h], up, gap: c.host === 'tray' ? Math.max(3.5, Math.min(depth * 0.9, size * 0.12)) : 0 })
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
  for (const o of shown) o.visible = false

  const accent = new THREE.LineBasicMaterial({ color: themeColor('accent', '#ff6b1a'), depthTest: false, transparent: true, toneMapped: false })
  const fill = new THREE.MeshBasicMaterial({ color: themeColor('accent', '#ff6b1a'), transparent: true, opacity: 0.16, depthWrite: false, depthTest: false, toneMapped: false })
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const ident = new THREE.Quaternion()
  const shut = model.userData.shut as ((k: number) => void) | undefined
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
        if (cv.stack && e > 0) {
          pos.lerp(cv.stack, e)
          quat.slerp(ident, e)
        }
        cv.group.position.copy(pos)
        cv.group.quaternion.copy(quat)
      }
      screenG.position.copy(screenDir).multiplyScalar(screenGap * e)
      // keep the pair of them in the middle of the view while the cover lies beside the tray
      const aside = k * (1 - e)
      if (tall) model.position.set((b.width / 2 + Math.max(2, size * 0.03)) * 0.84 * aside, 0, 0)
      else if (d.type === 'speaker') model.position.set(-b.width * 0.6 * smooth((open - 0.34) / 0.4), 0, 0)
      else model.position.set(0, 0, 0)
      const ease = 1 - Math.exp(-dt * 9)
      for (const [id, it] of comps) {
        let cur = mem.boxes.get(id)
        const target = new THREE.Vector3(...it.size)
        if (!cur) {
          cur = { c: it.at.clone(), s: mem.fresh ? target.clone() : target.clone().multiplyScalar(0.05) }
          mem.boxes.set(id, cur)
        }
        cur.c.lerp(it.at, ease)
        cur.s.lerp(target, ease)
        if (cur.c.distanceToSquared(it.at) < 1e-5) cur.c.copy(it.at)
        if (cur.s.distanceToSquared(target) < 1e-5) cur.s.copy(target)
        it.g.position.copy(cur.c).addScaledVector(it.up, it.gap * it.c.layer * (it.c.zone === 'bud' ? 0.75 * k : e))
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
      for (const id of [...mem.boxes.keys()]) if (!comps.has(id)) mem.boxes.delete(id)
      mem.fresh = false
    },
    highlight(match, picked) {
      for (const it of comps.values()) {
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
