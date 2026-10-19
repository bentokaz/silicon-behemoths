// Models of the e-reader, the smart ring, the action camera and the drone. Units are mm, and each stands in the
// space buildDevice uses: X = width, Y = height, Z = thickness, front at +Z. A ring lies flat with its finger
// axis upright; a drone's body runs along Z, nose at +Z, with its arms and propellers round it.
import * as THREE from 'three'
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { droneShape, ringShape, selfieScreen } from '../sim/geometry'
import type { Body, DeviceDesign } from '../sim/types'
import { type Ctx, addParts, buildSlab, disc, lift, litScreen, logoTexture, mesh, panelInfoOf, placeOnFace, plate, slab } from './buildDevice'
import { darkMatte, darkPlastic, lightMaterial, rubber } from './materials'
import { screenTexture } from './screens'

const noPick = (o: THREE.Object3D) => o.traverse((x) => (x.raycast = () => {}))
/** Marks a group as a placed part, so the studio can pick it and move it. */
function asPart(g: THREE.Group, id: string) {
  g.traverse((o) => (o.userData.partId = id))
  g.userData.partRoot = id
}

// ---------------------------------------------------------------- e-reader

/** A slab whose screen is e-ink: matte, unlit, set into a bezel in the body's own colour. */
export function buildEreader(d: DeviceDesign, c: Ctx): THREE.Group {
  const b = d.body
  const root = buildSlab(b, c, { carrier: 'body', wallpaper: d.wallpaper })
  const io = d.specs.io ?? []
  for (const o of [...root.children]) {
    const m = o as THREE.Mesh
    if (o.userData.tear !== 'screen' || !m.isMesh) continue
    const mat = m.material as THREE.MeshPhysicalMaterial
    if (mat.map) {
      // ink on paper: no glow, no gloss. A front light, if it has one, warms it a little
      m.material = new THREE.MeshStandardMaterial({ map: mat.map, roughness: 0.92, metalness: 0, emissive: io.includes('light') ? (io.includes('warm') ? '#fff1dc' : '#ffffff') : '#000000', emissiveMap: mat.map, emissiveIntensity: io.includes('light') ? 0.16 : 0 })
      mat.dispose()
      // the ink sits a hair below the bezel, behind its matte glass
      m.position.z -= lift(0.01)
    } else {
      // the bezel is part of the body: the same colour, matte, around a screen sunk a little into it
      m.material = (c.m.back as THREE.MeshPhysicalMaterial).clone()
      ;(m.material as THREE.MeshPhysicalMaterial).clearcoat = 0
      ;(m.material as THREE.MeshPhysicalMaterial).roughness = Math.max(0.55, (m.material as THREE.MeshPhysicalMaterial).roughness)
      mat.dispose()
    }
  }
  // page-turn keys in the wide side bezel, or along the edge where the bezel is thin
  if (io.includes('pages')) {
    const g = new THREE.Group()
    const keyMat = (c.m.frame as THREE.MeshPhysicalMaterial).clone()
    const inBezel = b.bezelSide >= 9
    for (const k of [1, -1]) {
      const len = Math.min(22, b.height * 0.12)
      if (inBezel) {
        const key = mesh(slab(2.2, len, 1.1, 0.5, 0.2), keyMat)
        key.position.set(b.width / 2 - b.bezelSide / 2, k * (len / 2 + 3), b.thickness / 2 + lift(0.03))
        g.add(key)
      } else {
        const key = mesh(slab(len, 1.8, 0.9, 0.5, 0.2), keyMat)
        key.rotation.y = Math.PI / 2
        key.position.set(b.width / 2 + lift(0.02), k * (len / 2 + 3), 0)
        g.add(key)
      }
    }
    g.userData.tear = 'screen'
    noPick(g)
    root.add(g)
  }
  // a stylus clipped to the right-hand edge by its magnet
  if (io.includes('stylus')) {
    const pen = new THREE.Group()
    const len = b.height * 0.86
    const r = Math.min(4.4, b.thickness * 0.62)
    const barrel = mesh(new THREE.CylinderGeometry(r, r, len * 0.86, 28), (c.m.frame as THREE.MeshPhysicalMaterial).clone())
    pen.add(barrel)
    const cone = mesh(new THREE.CylinderGeometry(r, r * 0.25, len * 0.12, 28), (c.m.frame as THREE.MeshPhysicalMaterial).clone())
    cone.position.y = -len * 0.49
    const nib = mesh(new THREE.ConeGeometry(r * 0.25, len * 0.03, 16), darkPlastic())
    nib.rotation.x = Math.PI
    nib.position.y = -len * 0.565
    const cap = mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), (c.m.frame as THREE.MeshPhysicalMaterial).clone())
    cap.position.y = len * 0.43
    pen.add(cone, nib, cap)
    pen.position.set(b.width / 2 + r + 0.15, 0, 0)
    noPick(pen)
    root.add(pen)
  }
  addParts(root, d, 'body', c)
  return root
}

// ---------------------------------------------------------------- action camera

/** A small rugged box: a rear screen, the lens in its housing on the other side, a selfie screen beside it. */
export function buildActioncam(d: DeviceDesign, c: Ctx): THREE.Group {
  const b = d.body
  const root = buildSlab(b, c, { carrier: 'body', wallpaper: d.wallpaper })
  const io = d.specs.io ?? []
  if (io.includes('front')) {
    const f = selfieScreen(b)
    const g = new THREE.Group()
    // a black glass window, and the lit screen inside it
    const glass = mesh(plate(f.w + 2, f.h + 2, f.r + 1), c.m.glass, false)
    glass.position.z = lift(0.04)
    const tex = screenTexture('actioncam', d.wallpaper + 1, f.w, f.h, c.detail, panelInfoOf(c))
    const scr = mesh(plate(f.w, f.h, f.r), litScreen(tex, d.specs.panel), false)
    scr.position.z = lift(0.06)
    g.add(glass, scr)
    // on the lens side, whose x runs the other way
    g.rotation.y = Math.PI
    g.position.set(-f.x, f.y, -b.thickness / 2 - lift(0.02))
    g.userData.tear = 'cover'
    noPick(g)
    root.add(g)
  }
  if (io.includes('mount')) {
    // two fingers that fold out of the underside to take a mount, with the pin hole through them
    const g = new THREE.Group()
    const mat = darkPlastic()
    const t = 3
    for (const k of [-1, 1]) {
      const fing = mesh(slab(t, 9, 1.2, Math.min(15, b.thickness * 0.55), 0.6), mat)
      fing.rotation.x = Math.PI / 2
      fing.position.set(k * 3.4, -b.height / 2 + lift(0.02), Math.min(7.5, b.thickness * 0.27))
      g.add(fing)
    }
    const pin = mesh(new THREE.CylinderGeometry(1.4, 1.4, 10.4, 16), rubber('#2a2c30'))
    pin.rotation.z = Math.PI / 2
    pin.position.set(0, -b.height / 2 - 5.2, 0)
    g.add(pin)
    noPick(g)
    root.add(g)
  }
  addParts(root, d, 'body', c)
  // the big lens bulges out of its barrel behind a bright retaining ring, as an action camera's does
  for (const p of d.parts) {
    if (p.kind !== 'camera' || p.face !== 'back') continue
    const r = Math.min(p.w, p.h) / 2
    const g = new THREE.Group()
    const ring = mesh(new THREE.RingGeometry(r * 0.84, r * 1.02, 64), new THREE.MeshPhysicalMaterial({ color: '#9aa0a8', metalness: 0.9, roughness: 0.3 }), false)
    ring.position.z = 2.1 + lift(0.03)
    const dome = mesh(new THREE.SphereGeometry(r * 0.84, 40, 12, 0, Math.PI * 2, 0, Math.PI * 0.32), c.m.lens)
    dome.rotation.x = Math.PI / 2
    // the cap of a sphere whose rim meets the barrel's top
    dome.scale.set(1, 0.5, 1)
    dome.position.z = 2.1 - r * 0.84 * Math.cos(Math.PI * 0.32) * 0.5 + lift(0.01)
    g.add(ring, dome)
    placeOnFace(g, b, 'actioncam', 'back', p.x, p.y, 0)
    noPick(g)
    root.add(g)
  }
  return root
}

// ---------------------------------------------------------------- ring

/** The outline of a ring's band cut through, in (radius, height), counter-clockwise so its faces look out. */
function bandProfile(inner: number, outer: number, h: number, r: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = []
  const rr = Math.max(0.05, Math.min(r, (outer - inner) / 2 - 0.02, h / 2 - 0.02))
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2)
      pts.push(new THREE.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr))
    }
  }
  // up the outside, across the top, down the inside, across the bottom
  arc(outer - rr, -h / 2 + rr, -Math.PI / 2)
  arc(outer - rr, h / 2 - rr, 0)
  arc(inner + rr, h / 2 - rr, Math.PI / 2)
  arc(inner + rr, -h / 2 + rr, Math.PI)
  pts.push(pts[0].clone())
  return pts
}

/** A curved strip of the band's surface: `radius` from the axis, `w` along the band (mm of arc) centred on `angle`, `h` tall. */
function strip(radius: number, angle: number, w: number, h: number, y: number, inside = false): THREE.BufferGeometry {
  const len = w / radius
  const g = new THREE.CylinderGeometry(radius, radius, h, Math.max(4, Math.ceil(len * 24)), 1, true, angle - len / 2, len)
  g.translate(0, y, 0)
  if (inside) {
    // seen from the middle of the ring: turn its faces inward
    const idx = g.index!
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i)
      idx.setX(i, idx.getX(i + 2))
      idx.setX(i + 2, a)
    }
    const n = g.attributes.normal
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i))
  }
  return g
}

/**
 * A smart ring. The band is turned (a lathe), polished or brushed in the frame material; the sensors look in through
 * a dark window inside its back, and the name is engraved round the outside at the front.
 */
export function buildRing(d: DeviceDesign, c: Ctx): THREE.Group {
  const b = d.body
  const root = new THREE.Group()
  const { outer, inner, round } = ringShape(b)
  const geo = toCreasedNormals(new THREE.LatheGeometry(bandProfile(inner, outer, b.height, round), 128), 0.5)
  const band = mesh(geo, c.m.frame)
  band.userData.body = true
  band.userData.carrier = 'body'
  // the band is solid: the teardown takes it away whole and shows what was inside
  band.userData.tear = 'hide'
  root.add(band)
  // the inside of the band is a dark resin sleeve over the electronics
  const sleeve = mesh(strip(inner - lift(0.03), Math.PI, 2 * Math.PI * inner * 0.999, b.height - 2 * Math.min(round, b.height * 0.3) - 0.2, 0, true), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(b.backColor).lerp(new THREE.Color('#1b1c20'), 0.8), roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 }), false)
  sleeve.userData.tear = 'hide'
  noPick(sleeve)
  root.add(sleeve)
  // it rests on its charging dock: a low puck with a post the ring sits round
  const dock = new THREE.Group()
  const dockR = outer * 1.32
  const dockH = ringDock(b)
  const puckMat = new THREE.MeshPhysicalMaterial({ color: '#3b3d42', roughness: 0.45, metalness: 0.1, clearcoat: 0.4, clearcoatRoughness: 0.3 })
  const puck = mesh(new THREE.CylinderGeometry(dockR * 0.96, dockR, dockH, 64), puckMat)
  puck.position.y = -b.height / 2 - dockH / 2
  const post = mesh(new THREE.CylinderGeometry(inner * 0.5, inner * 0.56, b.height * 0.3, 48), puckMat)
  post.position.y = -b.height / 2 + b.height * 0.15
  const pad = mesh(new THREE.RingGeometry(inner * 1.02, outer * 1.04, 64), new THREE.MeshPhysicalMaterial({ color: '#2a2c30', roughness: 0.7 }), false)
  pad.rotation.x = -Math.PI / 2
  pad.position.y = -b.height / 2 + lift(0.02)
  const led = mesh(new THREE.CircleGeometry(Math.min(0.4, dockH * 0.1), 16), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.6 }), false)
  led.position.set(0, -b.height / 2 - dockH * 0.45, dockR * 0.995)
  dock.add(puck, post, pad, led)
  noPick(dock)
  root.add(dock)
  for (const p of d.parts) {
    const g = new THREE.Group()
    if (p.kind === 'island') {
      // the window in the sleeve at the palm side, and the green and red LEDs and the photodiodes behind it
      const angle = Math.PI + p.x / inner
      const win = mesh(strip(inner - lift(0.06), angle, p.w, p.h, p.y, true), new THREE.MeshPhysicalMaterial({ color: '#050607', roughness: 0.08, metalness: 0, clearcoat: 1 }), false)
      g.add(win)
      const dots = [
        [-p.w * 0.28, '#3dff7a'],
        [0, '#20242a'],
        [p.w * 0.28, '#ff3d3d'],
      ] as const
      for (const [dx, col] of dots) {
        const a = angle + dx / inner
        const bump = mesh(new THREE.SphereGeometry(Math.min(0.5, p.h * 0.12), 16, 8), col === '#20242a' ? darkMatte() : new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.45, roughness: 0.3 }), false)
        bump.scale.set(1, 1, 0.45)
        bump.position.set(Math.sin(a) * (inner - lift(0.08)), p.y, Math.cos(a) * (inner - lift(0.08)))
        bump.lookAt(0, p.y, 0)
        g.add(bump)
      }
    } else if (p.kind === 'logo') {
      // engraved round the outside: a darker or a brighter cut, whichever reads against the band
      const r = p.face === 'back' ? inner - lift(0.07) : outer + lift(0.03)
      const angle = p.face === 'back' ? Math.PI + p.x / r : p.x / r
      const light = new THREE.Color(b.frameColor).getHSL({ h: 0, s: 0, l: 0 }).l
      const mat = new THREE.MeshPhysicalMaterial({ color: light > 0.45 ? '#2f3237' : '#e6e8ec', metalness: 0.5, roughness: 0.5, alphaMap: logoTexture(p.text || ' '), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
      const logo = mesh(strip(r, angle, p.w, p.h, p.y, p.face === 'back'), mat, false)
      g.add(logo)
    } else if (p.kind === 'light') {
      const a = p.x / outer
      const dot = mesh(new THREE.CircleGeometry(Math.min(p.w, p.h) / 2, 16), lightMaterial(p.color ?? '#8dffa8'), false)
      dot.position.set(Math.sin(a) * (outer + lift(0.03)), p.y, Math.cos(a) * (outer + lift(0.03)))
      dot.lookAt(dot.position.clone().multiplyScalar(2))
      g.add(dot)
    } else continue
    asPart(g, p.id)
    // the parts go with the band when the teardown takes it away
    band.add(g)
  }
  return root
}

// ---------------------------------------------------------------- drone

/** A bar from a to b, `w` across and `t` deep, rounded off at its ends. */
function bar(a: THREE.Vector3, b: THREE.Vector3, w: number, t: number, taper = 0.75): THREE.BufferGeometry {
  const len = a.distanceTo(b)
  // built along +Y, wide across X and thin through Z, then laid along the line with its thin side upright
  const g = new THREE.CylinderGeometry((w / 2) * taper, w / 2, len, 18, 1)
  g.scale(1, 1, t / w)
  const dir = b.clone().sub(a).normalize()
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
  const up = new THREE.Vector3().crossVectors(side, dir).normalize()
  g.applyMatrix4(new THREE.Matrix4().makeBasis(side, dir, up))
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return g
}

/** One blade of a propeller, lying along +X from the hub: wide near the root, narrowing to a rounded tip. */
function blade(r: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  const w = r * 0.13
  s.moveTo(r * 0.08, -w * 0.35)
  s.bezierCurveTo(r * 0.35, -w * 0.9, r * 0.75, -w * 0.7, r * 0.97, -w * 0.25)
  s.quadraticCurveTo(r * 1.0, 0, r * 0.97, w * 0.2)
  s.bezierCurveTo(r * 0.7, w * 0.55, r * 0.35, w * 0.6, r * 0.08, w * 0.35)
  s.lineTo(r * 0.08, -w * 0.35)
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.6, r * 0.012), bevelEnabled: false, curveSegments: 10 })
  g.rotateX(-Math.PI / 2)
  return g
}

/**
 * A folding camera drone: a rounded body, four arms out to motors with two-bladed propellers, landing feet under
 * the motors, and the camera hanging from the nose on its gimbal.
 */
export function buildDrone(d: DeviceDesign, c: Ctx): THREE.Group {
  const b = d.body
  const io = d.specs.io ?? []
  const sh = droneShape(b)
  const L = b.thickness
  const root = new THREE.Group()
  // ---- the body: a rounded box seen from above, with rounded top and bottom edges
  const geo = slab(b.width, L, sh.plan, b.height, sh.round, b.edge === 'round' ? 8 : 3)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, -b.height / 2, 0)
  const body = mesh(geo, c.m.frame)
  body.userData.body = true
  body.userData.carrier = 'body'
  root.add(body)
  // the top shell's panel, in the second colour
  const inset = sh.round + 3
  const top = mesh(plate(b.width - 2 * inset, L - 2 * inset, Math.max(1, sh.plan - inset)), c.m.back, false)
  top.rotation.x = -Math.PI / 2
  top.position.y = b.height / 2 + lift(0.02)
  top.userData.tear = 'cover'
  noPick(top)
  root.add(top)
  // the battery's latch line across the top, where the bay at the tail begins
  const seam = mesh(new THREE.PlaneGeometry(b.width - 2 * inset - 2, 0.7), darkMatte(), false)
  seam.rotation.x = -Math.PI / 2
  seam.position.set(0, b.height / 2 + lift(0.035), -L * 0.04)
  seam.userData.tear = 'cover'
  noPick(seam)
  root.add(seam)
  // ---- the eyes that watch for obstacles: a pair on the nose, and on the tail for all-round sensing
  const eyes = (z: number, sign: number) => {
    for (const k of [-1, 1]) {
      const g = new THREE.Group()
      const r = Math.min(3.2, b.height * 0.08)
      const ring = mesh(new THREE.CircleGeometry(r * 1.35, 28), c.m.glass, false)
      const core = mesh(new THREE.CircleGeometry(r * 0.55, 20), c.m.core, false)
      core.position.z = lift(0.02)
      g.add(ring, core)
      g.position.set(k * Math.min(b.width / 2 - sh.plan * 0.7 - r, b.width * 0.24), b.height * 0.22, z + sign * lift(0.03))
      if (sign < 0) g.rotation.y = Math.PI
      noPick(g)
      root.add(g)
    }
  }
  if (io.includes('avoid') || io.includes('omni')) eyes(L / 2, 1)
  if (io.includes('omni')) eyes(-L / 2, -1)
  // ---- arms, motors, propellers and feet
  const armMat = c.m.frame
  const motorMat = new THREE.MeshPhysicalMaterial({ color: '#2b2d31', metalness: 0.75, roughness: 0.38 })
  const propMat = new THREE.MeshPhysicalMaterial({ color: '#202226', metalness: 0, roughness: 0.55, side: THREE.DoubleSide })
  const discMat = new THREE.MeshBasicMaterial({ color: '#c8ccd2', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide })
  const footMat = rubber()
  const blades: THREE.BufferGeometry[] = []
  const footY = -b.height / 2 - droneFeet(b)
  sh.motors.forEach((m, i) => {
    const sx = Math.sign(m.x)
    const sz = Math.sign(m.z)
    // the arm leaves the side of the body near its corner, and runs out to the motor
    const rootZ = sz * Math.min(L / 2 - sh.plan * 0.6 - sh.arm, Math.abs(m.z) * 0.58)
    const from = new THREE.Vector3(sx * (b.width / 2 - 1.5), sh.armY - (i < 2 ? 0 : sh.arm * 0.35), rootZ)
    const to = new THREE.Vector3(m.x, sh.armY, m.z)
    root.add(mesh(bar(from, to, sh.arm, sh.arm * 0.62), armMat))
    if (io.includes('fold')) {
      // the hinge the arm folds on
      const knuckle = mesh(new THREE.CylinderGeometry(sh.arm * 0.48, sh.arm * 0.48, sh.arm * 0.8, 20), motorMat)
      knuckle.position.copy(from).add(to.clone().sub(from).normalize().multiplyScalar(sh.arm * 0.7))
      root.add(knuckle)
    }
    // the motor: a mount in the body colour, a dark bell on top, the hub cap
    const mount = mesh(new THREE.CylinderGeometry(sh.motorR * 1.05, sh.motorR * 0.92, sh.motorH * 0.55, 28), armMat)
    mount.position.set(m.x, sh.armY + sh.motorH * 0.08, m.z)
    const bell = mesh(new THREE.CylinderGeometry(sh.motorR * 0.9, sh.motorR * 0.9, sh.motorH * 0.42, 28), motorMat)
    bell.position.set(m.x, sh.armY + sh.motorH * 0.56, m.z)
    const hub = mesh(new THREE.CylinderGeometry(sh.motorR * 0.32, sh.motorR * 0.38, sh.motorH * 0.2, 20), motorMat)
    hub.position.set(m.x, sh.armY + sh.motorH * 0.87, m.z)
    root.add(mount, bell, hub)
    // two blades, set at an angle that differs from motor to motor, as they would have stopped
    const yTop = sh.armY + sh.motorH * 0.8
    const turn = [0.5, 2.1, 1.2, 2.7][i] * (sx * sz)
    for (const k of [0, Math.PI]) {
      const g = blade(sh.propR)
      g.rotateX(0.12 * (k ? -1 : 1))
      g.rotateY(turn + k)
      g.translate(m.x, yTop, m.z)
      blades.push(g)
    }
    const spin = mesh(new THREE.RingGeometry(sh.propR * 0.3, sh.propR, 64), discMat, false)
    spin.rotation.x = -Math.PI / 2
    spin.position.set(m.x, yTop + 0.4, m.z)
    spin.renderOrder = 2
    noPick(spin)
    root.add(spin)
    // a navigation light under each motor: green on the right, red on the left, white at the back
    const navCol = i >= 2 ? '#ffffff' : sx > 0 ? '#3dff7a' : '#ff3d3d'
    const nav = mesh(new THREE.SphereGeometry(Math.min(1.6, sh.motorR * 0.22), 16, 8), lightMaterial(navCol), false)
    nav.position.set(m.x + sx * sh.motorR * 0.55, sh.armY - sh.motorH * 0.2, m.z)
    noPick(nav)
    root.add(nav)
    // a foot down to the desk
    const legTop = sh.armY - sh.motorH * 0.15
    const leg = mesh(new THREE.CylinderGeometry(sh.arm * 0.2, sh.arm * 0.28, legTop - footY, 12), armMat)
    leg.position.set(m.x, (legTop + footY) / 2, m.z)
    const foot = mesh(new THREE.SphereGeometry(sh.arm * 0.34, 14, 8), footMat)
    foot.scale.set(1, 0.6, 1)
    foot.position.set(m.x, footY + sh.arm * 0.2, m.z)
    root.add(leg, foot)
  })
  const props = mesh(mergeGeometries(blades), propMat)
  root.add(props)
  // ---- the camera on its gimbal, hanging from the nose where the camera part is
  const cam = d.parts.find((p) => p.kind === 'camera')
  if (cam) root.add(gimbal(b, cam.x, cam.y, Math.max(cam.w, cam.h), io.includes('gimbal'), c, cam.id))
  addParts(root, d, 'body', c, (p) => p.kind !== 'camera')
  return root
}

/** A camera head between the two arms of a yoke that hangs from the nose. A three-axis gimbal shows its roll and yaw motors too. */
function gimbal(b: Body, x: number, y: number, dia: number, threeAxis: boolean, c: Ctx, id: string): THREE.Group {
  const g = new THREE.Group()
  const L = b.thickness
  const head = Math.max(dia * 1.5, 11)
  const z = L / 2 + head / 2 + 2.2
  const dark = new THREE.MeshPhysicalMaterial({ color: '#17181b', metalness: 0.3, roughness: 0.45 })
  // the yoke: a bar out of the nose above the head, and an arm down each side of it
  const yokeT = Math.max(1.4, head * 0.11)
  const bridge = mesh(slab(head + 2 * yokeT + 2, head * 0.75, yokeT, yokeT * 1.6, yokeT * 0.4), c.m.frame)
  bridge.rotation.x = -Math.PI / 2
  bridge.position.set(x, y + head / 2 + yokeT * 0.8 - yokeT * 0.8, z - head * 0.42)
  g.add(bridge)
  for (const k of [-1, 1]) {
    const arm = mesh(slab(yokeT, head * 0.92, yokeT * 0.45, head * 0.62, yokeT * 0.3), c.m.frame)
    arm.position.set(x + k * (head / 2 + yokeT / 2 + 0.6), y + head * 0.2, z - head * 0.31)
    g.add(arm)
  }
  // the tilt axis through the arms, and the motors that turn it
  const axle = mesh(new THREE.CylinderGeometry(head * 0.16, head * 0.16, head + 2 * yokeT + 1.6, 20), dark)
  axle.rotation.z = Math.PI / 2
  axle.position.set(x, y, z)
  g.add(axle)
  if (threeAxis) {
    const yaw = mesh(new THREE.CylinderGeometry(head * 0.3, head * 0.3, yokeT * 1.4, 24), dark)
    yaw.position.set(x, y + head / 2 + yokeT * 1.6, z - head * 0.42)
    const roll = mesh(new THREE.CylinderGeometry(head * 0.26, head * 0.26, yokeT * 1.2, 24), dark)
    roll.rotation.x = Math.PI / 2
    roll.position.set(x, y + head * 0.55, z - head * 0.42 - head * 0.36)
    g.add(yaw, roll)
  }
  // the head and its lens
  const box = mesh(slab(head, head * 0.9, head * 0.18, head * 0.95, head * 0.12), dark)
  box.position.set(x, y, z - head * 0.47)
  g.add(box)
  const r = dia / 2
  const barrel = mesh(disc(r, 1.8), dark)
  barrel.position.set(x, y, z + head * 0.48)
  const glass = mesh(disc(r * 0.84, 0.12), c.m.lens)
  glass.position.set(x, y, z + head * 0.48 + 1.8)
  const core = mesh(new THREE.CircleGeometry(r * 0.48, 32), c.m.core, false)
  core.position.set(x, y, z + head * 0.48 + 1.95)
  const iris = mesh(new THREE.RingGeometry(r * 0.48, r * 0.58, 32), darkMatte(), false)
  iris.position.set(x, y, z + head * 0.48 + 1.94)
  g.add(barrel, glass, core, iris)
  asPart(g, id)
  return g
}

/** How far below the body a drone's feet reach, so that the gimbal clears the desk. */
const droneFeet = (b: Body) => Math.max(2.5, b.height * 0.06)

/** Height of the charging dock a ring sits on. */
const ringDock = (b: Body) => Math.max(4, b.height * 0.6)

/** How large the models of these types are, for framing the camera, and how far they reach below their middle. */
export function moreFrame(d: DeviceDesign): { radius: number; bottom: number } {
  const b = d.body
  if (d.type === 'ring') return { radius: Math.hypot(b.width * 1.32, b.height + ringDock(b)) * 0.62, bottom: b.height / 2 + ringDock(b) }
  const sh = droneShape(b)
  const drop = droneFeet(b)
  return { radius: Math.hypot(2 * sh.spanX, b.height + drop + sh.motorH, 2 * sh.spanZ) * 0.42, bottom: b.height / 2 + drop }
}
