// Models of the PC tower and the mouse. Units are mm, in the space buildDevice uses: X = width, Y = height,
// Z = depth, front at +Z. A tower stands on its feet with its side panel on the right as one faces its front; what
// is inside is drawn from the same layout as its teardown, so the parts chosen show through glass or mesh as they
// are, lit by its RGB lighting. A mouse sits on the desk, nose at +Z, its shell a smooth hump over a flat base.
import * as THREE from 'three'
import { caseFeet, caseOf, rgbOf, rgbOn, towerForm } from '../data/devices'
import { layoutInternals } from '../sim/internals'
import type { DeviceDesign, PlacedPart } from '../sim/types'
import { type Ctx, addParts, mesh, plate, roundGrille, slab } from './buildDevice'
import { darkMatte, darkPlastic, rubber } from './materials'
import { cutGeometry, drawComps } from './teardown'

const noPick = (o: THREE.Object3D) => o.traverse((x) => (x.raycast = () => {}))

/**
 * A see-through panel: tinted tempered glass, four millimetres thick. Light passes through it (transmission, with a
 * smoky tint that deepens with thickness) and the studio's lamps reflect off its clear face, so it reads as a sheet
 * of glass and never as a missing panel.
 */
const glass = () =>
  new THREE.MeshPhysicalMaterial({ color: '#c9d3df', metalness: 0, roughness: 0.03, transmission: 0.92, thickness: 4, ior: 1.52, attenuationColor: '#8a96a6', attenuationDistance: 12, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4, transparent: true, opacity: 1 })
/** A slab of glass w by h with its rounded corners, its clear face at z = 0 and its back 4 mm in. */
function glassPane(w: number, h: number, r: number): THREE.Mesh {
  const geo = slab(w, h, r, 4, 0.6, 2)
  geo.translate(0, 0, -2)
  const o = mesh(geo, glass(), false)
  o.castShadow = false
  return o
}

/**
 * A steel mesh panel: a fine perforated sheet in a solid border, with a dark dust filter just behind it, so that it
 * reads as mesh (light through it, the parts behind it dimmed) and not as an open frame.
 */
function meshPanel(w: number, h: number, r: number, color: string, pitch = 3): THREE.Group {
  const g = new THREE.Group()
  const border = Math.min(12, Math.min(w, h) * 0.06)
  g.add(meshSheet(w - border, h - border, Math.max(0.5, r - border / 2), color, pitch))
  const steel = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.7 })
  for (const [bw, bh, x, y] of [[w, border, 0, h / 2 - border / 2], [w, border, 0, -h / 2 + border / 2], [border, h - 2 * border, w / 2 - border / 2, 0], [border, h - 2 * border, -w / 2 + border / 2, 0]]) {
    const o = mesh(new THREE.BoxGeometry(bw, bh, 1.6), steel)
    o.position.set(x, y, -0.4)
    g.add(o)
  }
  const filter = mesh(plate(w - border, h - border, Math.max(0.5, r - border / 2)), new THREE.MeshStandardMaterial({ color: '#07080a', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }), false)
  filter.position.z = -1.6
  g.add(filter)
  return g
}

const holeTex = new Map<string, THREE.CanvasTexture>()
/** A tiling pattern of round holes as an alpha map: white is metal, black is open. Kept, one for each pattern. */
function holes(kind: 'round' | 'hex'): THREE.CanvasTexture {
  let t = holeTex.get(kind)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#000'
  // about a third open: it reads as a sheet with holes in it, not as holes
  const r = kind === 'hex' ? 9 : 8
  for (const [x, y] of kind === 'hex' ? [[16, 16], [48, 16], [0, 48], [32, 48], [64, 48]] : [[16, 16], [48, 16], [16, 48], [48, 48]]) {
    g.beginPath()
    if (kind === 'hex') for (let i = 0; i < 6; i++) g.lineTo(x + Math.cos(Math.PI / 6 + (i * Math.PI) / 3) * r, y + Math.sin(Math.PI / 6 + (i * Math.PI) / 3) * r)
    else g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.userData.shared = true
  holeTex.set(kind, t)
  return t
}

/** A perforated sheet over w by h with holes `pitch` mm apart. */
function meshSheet(w: number, h: number, r: number, color: string, pitch = 5, kind: 'round' | 'hex' = 'hex'): THREE.Mesh {
  const tex = holes(kind).clone()
  tex.repeat.set(w / (pitch * 2), h / (pitch * 2))
  tex.needsUpdate = true
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.6, alphaMap: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  // no alpha test: the holes blend, so that from across the room a sheet reads as fine mesh (a steel sheet you can half
  // see through) and not as a missing panel, and close up they open out
  const geo = plate(w, h, r)
  // a shape's UVs are in its own units: bring them to 0..1 so that the repeat counts holes
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + w / 2) / w, (uv.getY(i) + h / 2) / h)
  return mesh(geo, m, false)
}

/** Runs the RGB lighting of a model: every glowing surface in it takes the colour of the effect at the time of each frame. */
function animateGlow(root: THREE.Object3D, host: THREE.Object3D, d: DeviceDesign) {
  const rgb = rgbOf(d.body)
  const own = new Map<THREE.Material, THREE.MeshStandardMaterial>()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    const mat = m.material as THREE.MeshStandardMaterial | undefined
    if (!mat || Array.isArray(mat) || !mat.userData?.glow) return
    let mine = own.get(mat)
    if (!mine) {
      mine = mat.clone()
      mine.userData = { glow: true }
      own.set(mat, mine)
    }
    m.material = mine
  })
  // the coloured lamp inside a case follows the lighting too
  const lamps: THREE.PointLight[] = []
  root.traverse((o) => o.userData.rgbLight && lamps.push(o as THREE.PointLight))
  const lampK = lamps.map((l) => l.intensity)
  if (rgb.effect === 'static' || !own.size) return
  const a = new THREE.Color(rgb.color)
  const b = new THREE.Color(rgb.color2)
  const c = new THREE.Color()
  const hsl = { h: 0, s: 0, l: 0 }
  a.getHSL(hsl)
  host.onBeforeRender = () => {
    const t = performance.now() / 1000
    if (rgb.effect === 'breathe') {
      const k = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 2.2))
      for (const m of own.values()) if (m.emissive) m.emissiveIntensity = 1.8 * k; else m.opacity = 0.32 * k
      lamps.forEach((l, i) => (l.intensity = lampK[i] * k))
      return
    }
    if (rgb.effect === 'cycle') c.setHSL((hsl.h + t * 0.08) % 1, Math.max(0.6, hsl.s), Math.min(0.6, Math.max(0.45, hsl.l)))
    else c.copy(a).lerp(b, 0.5 + 0.5 * Math.sin(t * 1.6))
    for (const m of own.values()) {
      m.color.copy(c)
      m.emissive?.copy(c)
    }
    for (const l of lamps) l.color.copy(c)
  }
}

// ---------------------------------------------------------------- tower

/** How far a tower's feet lift it off the floor. */
export const towerLift = (d: DeviceDesign) => caseFeet(caseOf(d.body).feet).lift

export function buildTower(d: DeviceDesign, c: Ctx): THREE.Group {
  const b = d.body
  const m = c.m
  const root = new THREE.Group()
  const pc = caseOf(b)
  // the panels (mesh, a solid door, a solid front) take the body colour; the chassis round them, the frame colour
  const panelColor = `#${((m.back as THREE.MeshStandardMaterial).color ?? new THREE.Color('#1b1d21')).getHexString()}`
  const flat = towerForm(b) === 'htpc'
  const lit = rgbOn(b)
  const rgb = rgbOf(b)
  const W = b.width
  const H = b.height
  const D = b.thickness
  const r = Math.max(0.6, Math.min(b.corner, Math.min(W, H) / 2 - 2))
  const bevel = Math.min(1.4, r * 0.6)
  // the shell, open where the side panel and an open front go
  const windowed = pc.side !== 'solid'
  const openFront = pc.front === 'mesh' || pc.front === 'glass' || pc.front === 'slats'
  let geo = slab(W, H, r, D, bevel, b.edge === 'round' ? 6 : 3)
  geo.translate(0, 0, -D / 2)
  if (windowed) geo = cutGeometry(geo, flat ? 1 : 0, (flat ? H : W) / 2 - 2.2, -1, true)
  if (openFront) geo = cutGeometry(geo, 2, D / 2 - 2.2, -1, true)
  const shell = mesh(geo, m.frame)
  shell.castShadow = false
  shell.userData.body = true
  shell.userData.carrier = 'body'
  root.add(shell)

  // the inside: powder-coated black walls, and everything the layout puts in it, lit by its RGB
  const inside = new THREE.Group()
  inside.userData.tear = 'hide'
  const liner = new THREE.MeshStandardMaterial({ color: '#33363d', roughness: 0.7, metalness: 0.25 })
  const inner = (w: number, h: number, x: number, y: number, z: number, rx: number, ry: number) => {
    const o = mesh(new THREE.PlaneGeometry(w, h), liner, false)
    o.position.set(x, y, z)
    o.rotation.set(rx, ry, 0)
    o.receiveShadow = true
    inside.add(o)
  }
  const t = 2.2
  if (flat) inner(W - 2 * t, D - 2 * t, 0, -H / 2 + t, 0, -Math.PI / 2, 0)
  else inner(D - 2 * t, H - 2 * t, -W / 2 + t, 0, 0, 0, Math.PI / 2)
  inner(W - 2 * t, H - 2 * t, 0, 0, -D / 2 + t, 0, 0)
  inner(W - 2 * t, D - 2 * t, 0, H / 2 - t, 0, Math.PI / 2, 0)
  if (!flat) inner(W - 2 * t, D - 2 * t, 0, -H / 2 + t, 0, -Math.PI / 2, 0)
  if (windowed || openFront) {
    inside.add(drawComps(layoutInternals(d)))
    // the case's own lighting: a soft white bar under the roof near the window, and a fill lower down, so that the
    // card, the cooler and the memory read clearly through it; with RGB on, a coloured wash from the floor as well
    const span = Math.max(W, H, D)
    const lamp = (color: string, k: number, x: number, y: number, z: number) => {
      const o = new THREE.PointLight(color, k * span, span * 0.8, 1)
      o.position.set(x, y, z)
      inside.add(o)
      return o
    }
    lamp('#fff4e8', 0.8, flat ? 0 : W * 0.22, flat ? H * 0.3 : H / 2 - Math.min(40, H * 0.1), D * 0.12)
    lamp('#dfe8f5', 0.55, flat ? 0 : W * 0.2, flat ? -H * 0.2 : -H * 0.15, D * 0.3)
    if (lit) lamp(rgb.color, 0.9, flat ? 0 : W * 0.15, flat ? -H * 0.3 : -H / 2 + Math.min(60, H * 0.15), 0).userData.rgbLight = true
  }
  root.add(inside)

  // the side panel: smoked glass in a black border, or perforated steel
  const sw = (flat ? W : D) - 2 * r * 0.4 - 3
  const sh = (flat ? D : H) - 2 * r * 0.4 - 3
  const side = new THREE.Group()
  side.userData.tear = 'cover'
  if (pc.side === 'glass') {
    const pane = glassPane(sw, sh, Math.max(0.5, r * 0.6))
    const band = 10
    // the black band round the edge of the glass, where it is bonded to its frame
    for (const [w, h, x, y] of [[sw, band, 0, sh / 2 - band / 2], [sw, band, 0, -sh / 2 + band / 2], [band, sh - 2 * band, sw / 2 - band / 2, 0], [band, sh - 2 * band, -sw / 2 + band / 2, 0]]) {
      const o = mesh(new THREE.PlaneGeometry(w, h), darkMatte(), false)
      // printed on the inner face of the glass, seen through it
      o.position.set(x, y, -3.9)
      side.add(o)
    }
    side.add(pane)
  } else if (pc.side === 'mesh') side.add(meshPanel(sw, sh, Math.max(0.5, r * 0.6), panelColor, 2.6))
  else {
    // a solid steel door in the body colour, set into the frame
    const door = mesh(slab(sw, sh, Math.max(0.5, r * 0.6), 1.2, 0.5, 2), m.back, false)
    door.position.z = 1.25
    side.add(door)
  }
  if (windowed || pc.side === 'solid') {
    if (flat) {
      side.rotation.x = -Math.PI / 2
      side.position.set(0, H / 2 - 1.2, 0)
    } else {
      side.rotation.y = Math.PI / 2
      side.position.set(W / 2 - 1.2, 0, 0)
    }
    root.add(side)
  }

  // the front panel
  const fw = W - 2 * bevel
  const fh = H - 2 * bevel
  const front = new THREE.Group()
  front.position.z = D / 2 - 0.6
  if (pc.front === 'mesh') front.add(meshPanel(fw, fh, Math.max(0.5, r - bevel), panelColor, 2.4))
  else if (pc.front === 'glass') {
    const pane = glassPane(fw, fh, Math.max(0.5, r - bevel))
    pane.position.z = 0.6
    front.add(pane)
  } else if (pc.front === 'slats') {
    // wooden slats down the front, with dark mesh behind the gaps
    const back = meshSheet(fw, fh, Math.max(0.5, r - bevel), '#111214', 3)
    back.position.z = -0.8
    front.add(back)
    const n = Math.max(5, Math.round(fw / 14))
    const wood = new THREE.MeshStandardMaterial({ color: '#8a5a34', roughness: 0.7, metalness: 0 })
    for (let i = 0; i < n; i++) {
      const o = mesh(new THREE.BoxGeometry((fw / n) * 0.62, fh * 0.96, 5), wood)
      o.position.set(-fw / 2 + ((i + 0.5) * fw) / n, 0, 2)
      front.add(o)
    }
  } else if (pc.front === 'vents') {
    // a solid face with a slot of mesh down each side
    for (const sx of [-1, 1]) {
      const o = meshSheet(Math.min(14, fw * 0.1), fh * 0.86, 1, '#121315', 2.4)
      o.position.set(sx * (fw / 2 - Math.min(14, fw * 0.1) / 2 - 3), 0, 0.15)
      front.add(o)
    }
  }
  if (pc.front === 'solid' || pc.front === 'vents') {
    const panel = mesh(plate(fw * 0.98, fh * 0.98, Math.max(0.5, r - bevel)), m.back, false)
    panel.position.z = -0.1
    front.add(panel)
  }
  root.add(front)

  // the back: the cover over the board's ports, the slot covers below it, the exhaust fan and the supply's vent
  const n = layoutInternals(d)
  const at = (id: string) => n.comps.find((x) => x.id === id)
  const backZ = -D / 2 - 0.2
  const rear = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: '#2a2c31', roughness: 0.6, metalness: 0.6 })
  const ex = at('exhaust')
  if (ex) {
    const fan = roundGrille(Math.min(ex.box.s[0], ex.box.s[1], ex.box.s[2] < 30 ? 999 : ex.box.s[2]) * 0.48, 7)
    fan.rotation.y = Math.PI
    fan.position.set(ex.box.c[0], ex.box.c[1], backZ)
    rear.add(fan)
  }
  const gpu = at('gpu')
  const board = at('board')
  if (board && !flat) {
    const top = board.box.c[1] + board.box.s[1] / 2
    const io = mesh(new THREE.PlaneGeometry(46, Math.min(160, board.box.s[1] * 0.55)), darkMatte(), false)
    io.rotation.y = Math.PI
    io.position.set(-W / 2 + 2.2 + 8 + 26, top - Math.min(160, board.box.s[1] * 0.55) / 2 - 6, backZ - 0.05)
    rear.add(io)
    const slots = board.box.s[1] > 200 ? 7 : 2
    const slot0 = (gpu ? gpu.box.c[1] + gpu.box.s[1] / 2 : top - board.box.s[1] * 0.6) - 4
    for (let i = 0; i < slots; i++) {
      const o = mesh(new THREE.BoxGeometry(Math.min(110, W * 0.55), 14, 1.2), steel)
      o.position.set(-W / 2 + 2.2 + 12 + Math.min(110, W * 0.55) / 2, slot0 - i * 20, backZ)
      if (o.position.y < -H / 2 + 100) break
      rear.add(o)
    }
  }
  const psu = at('psu')
  if (psu) {
    const pv = roundGrille(Math.min(psu.box.s[0], psu.box.s[1]) * 0.36, 9)
    pv.rotation.y = Math.PI
    pv.position.set(psu.box.c[0] + (flat ? 0 : psu.box.s[0] * 0.18), psu.box.c[1], backZ)
    rear.add(pv)
  }
  noPick(rear)
  root.add(rear)

  // feet, and the light under the case
  const feet = new THREE.Group()
  const lift = caseFeet(pc.feet).lift
  const fx = W / 2 - Math.max(14, r + 8)
  const fz = D / 2 - Math.max(24, r + 10)
  const alu = new THREE.MeshStandardMaterial({ color: '#b9bcc2', roughness: 0.35, metalness: 0.9 })
  const floor = -H / 2
  for (const sx of [-1, 1]) {
    if (pc.feet === 'stand') {
      const rail = mesh(new THREE.BoxGeometry(12, lift, D * 0.92), alu)
      rail.position.set(sx * fx, floor - lift / 2, 0)
      feet.add(rail)
      continue
    }
    for (const sz of [-1, 1]) {
      const x = sx * fx
      const z = sz * fz
      if (pc.feet === 'pads') {
        const o = mesh(new THREE.CylinderGeometry(9, 9, lift, 20), rubber())
        o.position.set(x, floor - lift / 2, z)
        feet.add(o)
      } else if (pc.feet === 'tall') {
        const o = mesh(new THREE.CylinderGeometry(10, 13, lift - 3, 24), alu)
        o.position.set(x, floor - (lift - 3) / 2, z)
        const tip = mesh(new THREE.CylinderGeometry(13, 13, 3, 24), rubber())
        tip.position.set(x, floor - lift + 1.5, z)
        feet.add(o, tip)
      } else {
        const fork = mesh(new THREE.BoxGeometry(18, lift * 0.45, 22), darkPlastic())
        fork.position.set(x, floor - lift * 0.22, z)
        const wheel = mesh(new THREE.CylinderGeometry(lift * 0.3, lift * 0.3, 12, 24), rubber())
        wheel.rotation.z = Math.PI / 2
        wheel.position.set(x, floor - lift + lift * 0.3, z + 4)
        feet.add(fork, wheel)
      }
    }
  }
  if (lit && rgb.zones.includes('floor')) {
    const glowFloor = new THREE.Mesh(plate(W * 1.25, D * 1.15, 20), new THREE.MeshBasicMaterial({ color: rgb.color, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false }))
    glowFloor.material.userData.glow = true
    glowFloor.rotation.x = -Math.PI / 2
    glowFloor.position.y = floor - lift + 0.4
    feet.add(glowFloor)
  }
  noPick(feet)
  root.add(feet)

  // the parts the player places, with a lit strip taking the lighting's colour
  const shown: DeviceDesign = lit && rgb.zones.includes('strip') ? { ...d, parts: d.parts.map((p) => (p.kind === 'light' ? { ...p, color: rgb.color } : p)) } : d
  addParts(root, shown, 'body', c)
  if (lit) animateGlow(root, shell, d)
  return root
}

// ---------------------------------------------------------------- mouse

/** The shape of a mouse's shell: its half-width, its height above the desk and the line of its crest along its length. */
export function mouseShape(d: DeviceDesign) {
  const b = d.body
  const ergo = b.grip !== 'ambi'
  const L = b.thickness
  const n = 2.8
  const mExp = 2.2
  const T = (z: number) => Math.min(1, Math.max(0, (z + L / 2) / L))
  const height = (t: number) => {
    const e = t < 0.38 ? Math.exp(-(((0.38 - t) / 0.42) ** 2)) : Math.exp(-(((t - 0.38) / 0.62) ** 2))
    return b.height * (0.22 + 0.78 * e)
  }
  const half = (t: number) => (b.width / 2) * (0.84 + 0.16 * Math.sin(Math.PI * t)) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 5)), 1 / 5)
  // seen from behind, as its owner sees it, the thumb side is +X
  const crest = (t: number) => (ergo ? 0.1 * b.width * Math.sin(Math.PI * t) : 0)
  // a right-handed shape stands higher on the thumb side
  const tilt = (s: number) => (ergo ? 1 + 0.14 * s : 1)
  const desk = -b.height / 2
  /** Height of the top of the shell over a point of the desk. */
  const top = (x: number, z: number) => {
    const t = T(z)
    const w = Math.max(0.01, half(t))
    const s = Math.max(-1, Math.min(1, (x - crest(t)) / w))
    return desk + height(t) * Math.pow(1 - Math.pow(Math.abs(s), n), 1 / mExp) * tilt(s)
  }
  /** Where the side of the shell is at a height over the desk and a point along its length. */
  const sideX = (y: number, z: number, sign: number) => {
    const t = T(z)
    const h = height(t) * tilt(sign)
    const k = Math.max(0, Math.min(1, (y - desk) / h))
    const c = Math.sqrt(Math.max(0, 1 - Math.pow(k, mExp)))
    return crest(t) + sign * half(t) * Math.pow(c, 2 / n)
  }
  return { L, n, mExp, height, half, crest, tilt, desk, top, sideX }
}

/**
 * A piece of the mouse's shell, lofted along its length: the cross-section at each station is the superellipse of
 * mouseShape, swept from angle `th0` to `th1` (pi is the left foot, pi/2 the crown, 0 the right foot). Rings come
 * closer together at the nose and the tail, where the shape turns fastest, and the normals are those of the smooth
 * surface (worked out from its neighbours, not from the facets), so it shades as one moulding.
 */
function shellPart(sh: ReturnType<typeof mouseShape>, th0: number, th1: number, arc: number, lift = 0, t0 = 0, t1 = 1): THREE.BufferGeometry {
  const rings = 120
  const at = (t: number, th: number) => {
    const z = -sh.L / 2 + t * sh.L
    const cs = Math.cos(th)
    const sn = Math.sin(th)
    const s = Math.sign(cs) * Math.pow(Math.abs(cs), 2 / sh.n)
    const y = sh.desk + Math.max(0.6, sh.height(t) * Math.pow(Math.abs(sn), 2 / sh.mExp) * sh.tilt(s))
    return new THREE.Vector3(sh.crest(t) + sh.half(t) * s, y, z)
  }
  const pos: number[] = []
  const nor: number[] = []
  const e = 1e-3
  for (let i = 0; i <= rings; i++) {
    // cosine spacing: fine at both ends
    const u = (1 - Math.cos((i / rings) * Math.PI)) / 2
    const t = Math.min(1 - e, Math.max(e, t0 + (t1 - t0) * u))
    for (let k = 0; k <= arc; k++) {
      const th = th0 + ((th1 - th0) * k) / arc
      const p = at(t, th)
      const n = new THREE.Vector3().crossVectors(at(t, th + e).sub(at(t, th - e)), at(Math.min(1, t + e), th).sub(at(Math.max(0, t - e), th))).normalize()
      if (!Number.isFinite(n.x) || n.lengthSq() < 0.5) n.set(0, 1, 0)
      p.addScaledVector(n, lift)
      pos.push(p.x, p.y, p.z)
      nor.push(n.x, n.y, n.z)
    }
  }
  const idx: number[] = []
  const per = arc + 1
  for (let i = 0; i < rings; i++)
    for (let k = 0; k < arc; k++) {
      const a = i * per + k
      idx.push(a, a + per, a + 1, a + 1, a + per, a + per + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  return g
}

/** The flat underside: the outline of the foot of the shell, filled. */
function baseGeometry(sh: ReturnType<typeof mouseShape>): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = []
  const n = 64
  for (let i = 0; i <= n; i++) {
    const t = Math.min(0.999, Math.max(0.001, i / n))
    pts.push(new THREE.Vector2(sh.crest(t) + sh.half(t), -sh.L / 2 + t * sh.L))
  }
  for (let i = n; i >= 0; i--) {
    const t = Math.min(0.999, Math.max(0.001, i / n))
    pts.push(new THREE.Vector2(sh.crest(t) - sh.half(t), -sh.L / 2 + t * sh.L))
  }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts), 1)
  // lie it down on the desk, facing down
  g.rotateX(Math.PI / 2)
  g.translate(0, sh.desk + 0.4, 0)
  return g
}

/** A thin strip lying on the shell along a run of points: a seam between the buttons, or a light. */
function ribbon(points: THREE.Vector3[], width: number, mat: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points)
  const g = new THREE.TubeGeometry(curve, Math.max(8, points.length * 4), width / 2, 6, false)
  return mesh(g, mat, false)
}

export function buildMouse(d: DeviceDesign, c: Ctx): THREE.Group {
  const b = d.body
  const root = new THREE.Group()
  const sh = mouseShape(d)
  const lit = rgbOn(b)
  const rgb = rgbOf(b)
  const io = d.specs.io ?? []
  // the shell in mouldings: the top cover and the buttons in the shell colour, the side skirts and the base in the underside colour
  const SKIRT = 0.62
  const top = mesh(shellPart(sh, Math.PI - SKIRT, SKIRT, 64, 0, 0, 0.56), c.m.frame)
  const skirtL = mesh(shellPart(sh, Math.PI, Math.PI - SKIRT, 14), c.m.back)
  const skirtR = mesh(shellPart(sh, SKIRT, 0, 14), c.m.back)
  const base = mesh(baseGeometry(sh), c.m.back, false)
  for (const o of [top, skirtL, skirtR, base]) {
    o.userData.body = true
    o.userData.carrier = 'body'
    root.add(o)
  }
  const shell = top
  const seam = new THREE.MeshStandardMaterial({ color: '#0a0b0d', roughness: 0.8 })
  const zAt = (t: number) => -sh.L / 2 + t * sh.L
  // the two main buttons: separate mouldings over the front of the top, split down the middle, a hair proud of it
  const split = 0.05
  const buttonL = mesh(shellPart(sh, Math.PI - SKIRT, Math.PI / 2 + split, 30, 0, 0.56, 1), c.m.frame)
  const buttonR = mesh(shellPart(sh, Math.PI / 2 - split, SKIRT, 30, 0, 0.56, 1), c.m.frame)
  root.add(buttonL, buttonR)
  // the shadow lines round them: down the middle (broken by the wheel), and across behind them
  const wheelT = 0.74
  const crestAt = (t: number) => sh.crest(t)
  const along: THREE.Vector3[] = []
  for (let t = 0.56; t <= 0.985; t += 0.02) along.push(new THREE.Vector3(crestAt(t), sh.top(crestAt(t), zAt(t)) + 0.05, zAt(t)))
  const fore = along.filter((p) => p.z > zAt(wheelT) + 9)
  const aft = along.filter((p) => p.z < zAt(wheelT) - 9)
  if (fore.length > 1) root.add(ribbon(fore, 1.1, seam))
  if (aft.length > 1) root.add(ribbon(aft, 1.1, seam))
  const across: THREE.Vector3[] = []
  for (let s = -0.8; s <= 0.801; s += 0.05) {
    const x = crestAt(0.56) + s * sh.half(0.56)
    across.push(new THREE.Vector3(x, sh.top(x, zAt(0.56)) + 0.05, zAt(0.56)))
  }
  root.add(ribbon(across, 0.9, seam))
  // the wheel, set into its slot: a rubber tyre with a ribbed tread on a hub
  const wz = zAt(wheelT)
  const wx = crestAt(wheelT)
  const wTop = sh.top(wx, wz)
  const wd = Math.min(20, b.height * 0.48)
  const slot = mesh(plate(9, 22, 3.5), darkMatte(), false)
  slot.rotation.x = -Math.PI / 2
  slot.position.set(wx, wTop + 0.12, wz)
  root.add(slot)
  const wheel = new THREE.Group()
  wheel.position.set(wx, wTop - wd * 0.22, wz)
  const free = io.includes('free')
  const tyre = mesh(new THREE.CylinderGeometry(wd / 2, wd / 2, 6.6, 48), free ? new THREE.MeshStandardMaterial({ color: '#9da2a8', roughness: 0.3, metalness: 0.9 }) : rubber('#17181b'))
  tyre.rotation.z = Math.PI / 2
  wheel.add(tyre)
  const tread = new THREE.InstancedMesh(new THREE.BoxGeometry(5.6, 0.5, 0.7), rubber('#0d0e10'), 32)
  const m4 = new THREE.Matrix4()
  for (let i = 0; i < 32; i++) {
    const an = (i / 32) * Math.PI * 2
    m4.makeRotationX(-an).setPosition(0, Math.sin(an) * wd * 0.5, Math.cos(an) * wd * 0.5)
    tread.setMatrixAt(i, m4)
  }
  wheel.add(tread)
  for (const sx of [-1, 1]) {
    const flange = mesh(new THREE.CylinderGeometry(wd * 0.44, wd * 0.44, 0.4, 32), darkMatte(), false)
    flange.rotation.z = Math.PI / 2
    flange.position.x = sx * 3.4
    wheel.add(flange)
  }
  if (lit && rgb.zones.includes('wheel')) {
    const core = mesh(new THREE.CylinderGeometry(wd * 0.36, wd * 0.36, 7.4, 32), new THREE.MeshStandardMaterial({ color: rgb.color, emissive: rgb.color, emissiveIntensity: 1.8, toneMapped: false }), false)
    ;(core.material as THREE.Material).userData.glow = true
    core.rotation.z = Math.PI / 2
    wheel.add(core)
  }
  root.add(wheel)
  // the sensitivity button behind the wheel, with its three level lamps
  if (io.includes('dpi')) {
    const dz = wz - wd * 0.5 - 7
    const dpi = mesh(slab(7, 9, 2.4, 2, 0.8, 3), c.m.frame)
    dpi.rotation.x = -Math.PI / 2
    dpi.position.set(crestAt(0.6), sh.top(crestAt(0.6), dz) + 0.6, dz)
    root.add(dpi)
    for (let i = 0; i < 3; i++) {
      const lamp = mesh(new THREE.CircleGeometry(0.5, 12), new THREE.MeshBasicMaterial({ color: i < 2 ? '#8dffa8' : '#2a2c30', toneMapped: false }), false)
      lamp.rotation.x = -Math.PI / 2
      const lx = crestAt(0.6) + 5.5
      lamp.position.set(lx, sh.top(lx, dz - 3 + i * 3) + 0.2, dz - 3 + i * 3)
      root.add(lamp)
    }
  }
  // two thumb buttons on the thumb side, set into the skirt
  if (io.includes('side')) {
    const y = sh.desk + b.height * 0.42
    for (const [t, len] of [[0.47, 15], [0.63, 13]] as const) {
      const z = zAt(t)
      const x = sh.sideX(y, z, 1)
      const btn = mesh(slab(len, 6, 2.6, 2.4, 1, 4), c.m.frame)
      btn.rotation.y = Math.PI / 2
      // turned to lie along the side, its face outwards
      btn.position.set(x + 0.4, y, z)
      root.add(btn)
    }
  }
  // the light strips along each lower side, and the glow of the badge
  if (lit && rgb.zones.includes('strip')) {
    const glowMat = new THREE.MeshStandardMaterial({ color: rgb.color, emissive: rgb.color, emissiveIntensity: 1.8, toneMapped: false })
    glowMat.userData.glow = true
    for (const sign of [-1, 1]) {
      const pts: THREE.Vector3[] = []
      for (let t = 0.12; t <= 0.86; t += 0.04) pts.push(new THREE.Vector3(sh.sideX(sh.desk + 3.2, zAt(t), sign) + sign * 0.15, sh.desk + 3.2, zAt(t)))
      root.add(ribbon(pts, 1.2, glowMat))
    }
  }
  // underneath: the gliding feet at nose and tail, and the sensor's window with its lens in the middle
  const ptfe = new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.25 })
  for (const t of [0.1, 0.9]) {
    const foot = mesh(plate(sh.half(t) * 1.3, 6, 3), ptfe, false)
    foot.rotation.x = Math.PI / 2
    foot.position.set(sh.crest(t), sh.desk - 0.3, zAt(t))
    root.add(foot)
  }
  const ring = mesh(new THREE.RingGeometry(3.2, 5.6, 32), ptfe, false)
  ring.rotation.x = Math.PI / 2
  ring.position.set(sh.crest(0.5), sh.desk - 0.25, zAt(0.5))
  const lens = mesh(new THREE.CircleGeometry(3.2, 32), new THREE.MeshPhysicalMaterial({ color: '#2a0d10', roughness: 0.1, clearcoat: 1, emissive: '#ff2030', emissiveIntensity: 0.25 }), false)
  lens.rotation.x = Math.PI / 2
  lens.position.set(sh.crest(0.5), sh.desk - 0.2, zAt(0.5))
  root.add(ring, lens)
  const wireless = io.includes('wireless') || io.includes('bt')
  if (wireless) {
    // the power switch under it
    const sw = mesh(plate(4, 8, 1), darkMatte(), false)
    sw.rotation.x = Math.PI / 2
    sw.position.set(sh.crest(0.3), sh.desk - 0.2, zAt(0.3))
    root.add(sw)
  }
  if (io.includes('wireless')) {
    // the receiver that comes with it, on the desk beside the nose
    const dongle = new THREE.Group()
    const body = mesh(slab(14, 8, 2.5, 5, 1, 3), darkPlastic())
    body.position.z = -2.5
    const plug = mesh(new THREE.BoxGeometry(12, 4.5, 9), new THREE.MeshStandardMaterial({ color: '#b9bcc2', roughness: 0.35, metalness: 0.9 }))
    plug.position.set(0, 0, 0)
    plug.position.y = 6
    dongle.add(body, plug)
    dongle.rotation.x = -Math.PI / 2
    dongle.position.set(b.width * 0.9, sh.desk + 2.5, sh.L * 0.32)
    root.add(dongle)
  } else if (!wireless) {
    // a wired mouse trails its braided cable from the nose, with a strain relief where it leaves
    const nose = new THREE.Vector3(sh.crest(1), sh.desk + b.height * 0.2, sh.L / 2 - 1)
    const relief = mesh(new THREE.CylinderGeometry(2.6, 2.2, 7, 20), rubber('#151619'))
    relief.rotation.x = Math.PI / 2
    relief.position.copy(nose).add(new THREE.Vector3(0, 0, 3))
    root.add(relief)
    const curve = new THREE.CatmullRomCurve3([nose.clone().add(new THREE.Vector3(0, 0, 5)), nose.clone().add(new THREE.Vector3(0, 1, 28)), nose.clone().add(new THREE.Vector3(14, -2, 70)), new THREE.Vector3(30, sh.desk + 1.8, sh.L / 2 + 140)])
    const cable = mesh(new THREE.TubeGeometry(curve, 64, 1.8, 12, false), new THREE.MeshStandardMaterial({ color: '#1d1f23', roughness: 0.95 }))
    root.add(cable)
  }
  // only the shell itself answers the pointer, so that a part can be dragged over it
  root.traverse((x) => !x.userData.body && (x.raycast = () => {}))
  // the placed parts, each brought down onto the curve of the shell where it sits
  const before = new Set(root.children)
  const shown: DeviceDesign = lit && rgb.zones.includes('logo') ? { ...d, parts: d.parts.map((p) => (p.kind === 'logo' ? { ...p, useImage: false } : p)) } : d
  addParts(root, shown, 'body', c)
  for (const o of root.children) {
    if (before.has(o)) continue
    const id = o.userData.partRoot as string | undefined
    const p = d.parts.find((q: PlacedPart) => q.id === id)
    if (!p) continue
    if (p.face === 'top') o.position.y = sh.top(o.position.x, o.position.z) + 0.05
    else if (p.face === 'left' || p.face === 'right') o.position.x = sh.sideX(o.position.y, o.position.z, p.face === 'left' ? -1 : 1) + (p.face === 'left' ? -0.05 : 0.05)
    else if (p.face === 'front') o.position.z = sh.L / 2 - Math.max(1, sh.L * 0.015)
    else if (p.face === 'back') o.position.z = -sh.L / 2 + Math.max(1, sh.L * 0.015)
    if (p.kind === 'logo' && lit && rgb.zones.includes('logo')) {
      o.traverse((x) => {
        const mm = (x as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
        if (mm && 'emissive' in mm && !Array.isArray(mm)) {
          const g = mm.clone()
          g.emissive = new THREE.Color(rgb.color)
          g.emissiveIntensity = 1.4
          g.userData = { glow: true }
          ;(x as THREE.Mesh).material = g
        }
      })
    }
  }
  if (lit) animateGlow(root, shell, d)
  return root
}
