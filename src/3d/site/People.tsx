// Draws the crowd. Every person is a handful of boxes and balls, and all of
// them share four instanced meshes, so sixty people walking about cost four
// draw calls. Limbs are posed by hand each frame: there is no skeleton, but
// arms have a shoulder and an elbow and legs a hip and a knee, and each pose
// is a set of joint angles the body eases toward.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Act, type Body, Kind, Mode, Tool } from './crowd'
import { DARK, HAIR, SKIN, TROUSERS } from './kit'
import { Pose } from './spots'
import { useTick } from './tick'

const BOXES = 14
const BALLS = 4
const MARKS = 2
// box slots
const TORSO = 0
const THIGH = 1
const SHIN = 3
const FOOT = 5
const UARM = 7
const FARM = 9
const LONG = 11
const PROP = 12
const PROP2 = 13
// ball slots
const HEAD = 0
const HAIRB = 1
const HAND = 2

/** Lengths of the upper arm and the forearm. */
const UPPER = 0.25
const FORE = 0.22
/** Hip to knee, and knee to ankle. */
const THIGH_L = 0.42
const SHIN_L = 0.405
/** Share of a stride a foot spends on the ground: a little over half, so both are down as the weight changes over. */
const STANCE = 0.56
/** How far a planted foot can be from the hip before the hip has to come down. */
const REACH = 0.812
const FOOT_F = [0, 0]
const FOOT_UP = [0, 0]
const FOOT_DOWN = [0, 0]
const SPLAY = [0, 0]

// What someone has in their hands.
const Prop = { None: 0, Box: 1, Bag: 2, Tray: 3, Cup: 4, Device: 5, Phone: 6, Weights: 7, Broom: 8, Clipboard: 9 } as const
const PROP_COLOR: Record<number, [string, string]> = {
  [Prop.Box]: ['#b98b56', '#b98b56'],
  [Prop.Bag]: ['#ece7dc', '#ece7dc'],
  [Prop.Tray]: ['#8a6a4f', '#e9e4da'],
  [Prop.Cup]: ['#f4f4f4', '#f4f4f4'],
  [Prop.Device]: ['#1c2028', '#1c2028'],
  [Prop.Phone]: ['#1c2028', '#1c2028'],
  [Prop.Weights]: ['#2b2f36', '#2b2f36'],
  [Prop.Broom]: ['#b28d66', '#3a3d42'],
  [Prop.Clipboard]: ['#d9c3a0', '#f4f1ea'],
}

/**
 * Resting joint angles for each pose, in radians:
 * lean, head, shoulder (l, r), spread (l, r), thigh (l, r), knee (l, r), elbow (l, r), turn-in (l, r).
 * A shoulder angle swings the arm forward and up; an elbow only ever bends the forearm forward from there;
 * turn-in swings the bent forearm across the body.
 */
const REST: Record<number, number[]> = {
  [Pose.Stand]: [0, 0, 0.04, 0.04, 0.07, 0.07, 0, 0, 0, 0, 0.14, 0.14, 0.1, 0.1],
  [Pose.Look]: [0, 0, 0.04, 0.04, 0.07, 0.07, 0, 0, 0, 0, 0.14, 0.14, 0.1, 0.1],
  [Pose.Queue]: [0, 0.06, 0.02, 0.1, 0.06, 0.05, 0.04, -0.03, 0.02, 0.1, 0.12, 0.5, 0.1, 0.5],
  [Pose.Sit]: [0, 0, 0.45, 0.45, 0.05, 0.05, 1.5, 1.5, 1.5, 1.5, 0.75, 0.75, 0.25, 0.25],
  [Pose.Type]: [0.06, 0.08, 0.37, 0.37, 0.03, 0.03, 1.5, 1.5, 1.5, 1.5, 1.22, 1.22, 0.45, 0.45],
  [Pose.StandType]: [0.03, 0.12, 0.29, 0.29, 0.03, 0.03, 0, 0, 0, 0, 1.16, 1.16, 0.45, 0.45],
  [Pose.Tend]: [0.03, 0.02, 0.75, 0.75, 0.04, 0.04, 0, 0, 0, 0, 0.5, 0.5, 0.25, 0.25],
  [Pose.Perch]: [0.08, 0.12, 0.45, 0.45, 0.04, 0.04, 1.2, 1.2, 1.1, 1.1, 1.1, 1.1, 0.3, 0.3],
  [Pose.Lounge]: [-0.2, 0, 0.5, 0.5, 0.1, 0.1, 1.45, 1.45, 1.3, 1.3, 0.6, 0.6, 0.4, 0.4],
  [Pose.Run]: [0.14, 0, 0.1, 0.1, 0.06, 0.06, 0, 0, 0, 0, 1.5, 1.5, 0.1, 0.1],
  [Pose.Stretch]: [0, -0.15, 1.6, 1.6, 0.25, 0.25, 0, 0, 0, 0, 0.06, 0.06, 0, 0],
  [Pose.Curl]: [0, 0, 0.05, 0.05, 0.08, 0.08, 0, 0, 0, 0, 1.2, 1.2, 0.05, 0.05],
  [Pose.Write]: [0, -0.1, 0.06, 1.5, 0.06, 0.05, 0, 0, 0, 0, 0.15, 0.55, 0.1, 0.15],
  [Pose.Play]: [0.12, 0, 0.2, 0.5, 0.12, 0.2, 0.15, -0.15, 0.2, 0.2, 0.6, 1.2, 0.2, 0.1],
  [Pose.Hold]: [0.03, 0.32, 0.15, 0.25, 0.03, 0.03, 0, 0, 0, 0, 1.3, 1.75, 0.5, 0.35],
  [Pose.Phone]: [0, 0.02, 0.45, 0.95, 0.05, 0.02, 1.5, 1.5, 1.5, 1.5, 0.75, 2.55, 0.25, 0.95],
  [Pose.Pack]: [0.25, 0.3, 0.7, 0.7, 0.03, 0.03, 0, 0, 0, 0, 0.7, 0.7, 0.2, 0.2],
  [Pose.Meet]: [0.05, 0, 1.0, 1.0, 0.05, 0.05, 1.5, 1.5, 1.5, 1.5, 0.15, 0.15, 0.2, 0.2],
  // on a high stool at a counter: legs hang nearly straight, so the knees stay clear of it
  [Pose.Bar]: [0.1, 0.05, 0.42, 0.42, 0.04, 0.04, 0.55, 0.55, 0.75, 0.75, 0.65, 0.65, 0.2, 0.2],
  [Pose.Present]: [0, 0, 0.5, 0.3, 0.06, 1.0, 0, 0, 0, 0, 1.2, 0.3, 0.3, 0],
  [Pose.Shake]: [0.16, -0.08, 0.04, 1.0, 0.07, 0.03, 0, 0, 0, 0, 0.14, 0.3, 0.1, 0.1],
  [Pose.Sweep]: [0.16, 0.2, 0.25, 0.5, 0.03, 0.03, 0, 0, 0, 0, 1.3, 0.9, 0.6, 0.5],
  [Pose.Fix]: [-0.04, -0.3, 1.9, 1.7, 0.08, 0.08, 0, 0, 0, 0, 0.5, 0.7, 0.1, 0.1],
  [Pose.Film]: [0.04, 0.05, 0.55, 0.55, 0.03, 0.03, 0, 0, 0, 0, 1.2, 1.2, 0.35, 0.35],
}
/** Arms only: lean, head, shoulders, spreads, elbows, turn-ins. */
const CARRY = [0.02, 0, 0.2, 0.2, 0.03, 0.03, 1.4, 1.4, 0.15, 0.15]
const CLAP = [0.02, 0, 0.6, 0.6, 0.03, 0.03, 1.45, 1.45, 0.8, 0.8]
/** Both hands on the handle of a pallet truck, low in front. */
const PUSH = [0.1, 0.05, 0.42, 0.42, 0.02, 0.02, 0.5, 0.5, 0.12, 0.12]
const CHEER = [-0.04, -0.2, 2.85, 2.85, 0.3, 0.3, 0.2, 0.2, 0, 0]
const ARMS = [0, 1, 2, 3, 4, 5, 10, 11, 12, 13]
/** A seat at a canteen table (USE.lunch): nobody pushes a pallet truck there. */
const LUNCH = 8
const AMP = 14
const HIP = 15

const R = new THREE.Matrix4()
const TF = new THREE.Matrix4()
const F1 = new THREE.Matrix4()
const F2 = new THREE.Matrix4()
const HL = new THREE.Matrix4()
const HR = new THREE.Matrix4()
const A = new THREE.Matrix4()
const B = new THREE.Matrix4()
const OUT = new THREE.Matrix4()
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
const col = new THREE.Color()

interface Meshes {
  boxes: THREE.InstancedMesh
  balls: THREE.InstancedMesh
  marks: THREE.InstancedMesh
  blobs: THREE.InstancedMesh
  cap: number
}

function build(cap: number): Meshes {
  const flesh = new THREE.MeshStandardMaterial({ roughness: 0.88 })
  const boxes = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 1, 0.17), flesh, cap * BOXES)
  const balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), flesh, cap * BALLS)
  const marks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), cap * MARKS)
  const blob = new THREE.CircleGeometry(1, 14)
  blob.rotateX(-Math.PI / 2)
  const blobs = new THREE.InstancedMesh(blob, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }), cap)
  for (const m of [boxes, balls, marks, blobs]) {
    m.frustumCulled = false
    m.userData.live = true
    m.count = 0
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  }
  boxes.receiveShadow = true
  balls.receiveShadow = true
  blobs.renderOrder = 2
  // every instance needs a colour before the first frame
  for (let i = 0; i < cap * BOXES; i++) boxes.setColorAt(i, col.set('#ffffff'))
  for (let i = 0; i < cap * BALLS; i++) balls.setColorAt(i, col.set('#ffffff'))
  for (let i = 0; i < cap * MARKS; i++) marks.setColorAt(i, col.set('#ffffff'))
  return { boxes, balls, marks, blobs, cap }
}

function paint(m: Meshes, bodies: Body[]) {
  const n = Math.min(bodies.length, m.cap)
  for (let i = 0; i < n; i++) {
    const b = bodies[i]
    const skin = SKIN[b.look % SKIN.length]
    const hair = HAIR[(b.look >> 3) % HAIR.length]
    const legs = TROUSERS[(b.look >> 5) % TROUSERS.length]
    const bx = i * BOXES
    m.boxes.setColorAt(bx + TORSO, col.set(b.shirt))
    for (let k = 0; k < 2; k++) {
      m.boxes.setColorAt(bx + THIGH + k, col.set(legs))
      m.boxes.setColorAt(bx + SHIN + k, col.set(legs))
      m.boxes.setColorAt(bx + FOOT + k, col.set(DARK))
      m.boxes.setColorAt(bx + UARM + k, col.set(b.shirt))
      m.boxes.setColorAt(bx + FARM + k, col.set(b.shirt))
    }
    m.boxes.setColorAt(bx + LONG, col.set(hair))
    // whatever they hold is coloured when it is first put in their hands
    b.prop = -1
    const sx = i * BALLS
    m.balls.setColorAt(sx + HEAD, col.set(skin))
    m.balls.setColorAt(sx + HAIRB, col.set(hair))
    m.balls.setColorAt(sx + HAND, col.set(skin))
    m.balls.setColorAt(sx + HAND + 1, col.set(skin))
  }
  m.boxes.instanceColor!.needsUpdate = true
  m.balls.instanceColor!.needsUpdate = true
}

const box = (m: Meshes, i: number, frame: THREE.Matrix4, w: number, l: number, d: number, x: number, y: number, z: number) => {
  A.makeScale(w, l, d).setPosition(x, y, z)
  m.boxes.setMatrixAt(i, OUT.multiplyMatrices(frame, A))
}
const ball = (m: Meshes, i: number, frame: THREE.Matrix4, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
  A.makeScale(sx, sy, sz).setPosition(x, y, z)
  m.balls.setMatrixAt(i, OUT.multiplyMatrices(frame, A))
}

function hide(m: Meshes, i: number) {
  for (let k = 0; k < BOXES; k++) m.boxes.setMatrixAt(i * BOXES + k, ZERO)
  for (let k = 0; k < BALLS; k++) m.balls.setMatrixAt(i * BALLS + k, ZERO)
  m.blobs.setMatrixAt(i, ZERO)
}

/** What a body has in its hands right now. */
function propOf(b: Body, walking: boolean): number {
  if (b.carry) return Prop.Box
  if (b.tool === Tool.Broom) return Prop.Broom
  if (b.tool === Tool.Clipboard) return Prop.Clipboard
  if (b.bag) return Prop.Bag
  if (walking) return b.act === Act.Lunch && !b.leaving ? Prop.Tray : b.act === Act.Coffee && (b.seed & 1) === 0 ? Prop.Cup : Prop.None
  if (b.mode !== Mode.Do) return Prop.None
  switch (b.pose) {
    case Pose.Hold:
      return Prop.Device
    case Pose.Phone:
      return Prop.Phone
    case Pose.Curl:
      return Prop.Weights
    case Pose.Sit:
    case Pose.Bar:
    case Pose.Lounge:
      return (b.act === Act.Coffee || b.act === Act.Lunch) && b.clap <= 0 ? Prop.Cup : Prop.None
  }
  return Prop.None
}

/** Writes one person's parts. */
function pose(m: Meshes, i: number, b: Body, dt: number): boolean {
  const c = b.cur
  const walking = b.mode === Mode.Walk || b.mode === Mode.In || b.mode === Mode.Out || b.striding
  const rest = REST[walking ? Pose.Stand : b.pose] ?? REST[Pose.Stand]
  const k = b.shown ? Math.min(1, dt * 9) : 1
  const slump = b.slump
  const prop = propOf(b, walking)
  const bothHands = prop === Prop.Box || prop === Prop.Tray
  // whatever the hands are busy with wins over what the pose would have them do
  const arms = b.cheer ? CHEER : b.clap > 0.05 ? CLAP : b.tool === Tool.Jack && b.mode !== Mode.Off ? PUSH : bothHands && b.pose !== Pose.Pack ? CARRY : null
  for (let j = 0; j < 14; j++) {
    let goal = rest[j]
    if (arms) {
      const a = ARMS.indexOf(j)
      if (a >= 0 && (a > 1 || arms !== CARRY) && !(arms === PUSH && b.mode === Mode.Do && b.spot && b.spot.use & LUNCH)) goal = arms[a]
    }
    if (slump && j === 0) goal += walking ? 0.2 : 0.26
    if (slump && j === 1) goal += 0.38
    c[j] += (goal - c[j]) * k
  }
  c[AMP] += ((walking ? 1 : 0) - c[AMP]) * k
  c[HIP] += ((walking ? 0.86 : b.hip) - c[HIP]) * k

  let lean = c[0]
  let head = c[1]
  let shL = c[2]
  let shR = c[3]
  let spL = c[4]
  let spR = c[5]
  let thighL = c[6]
  let thighR = c[7]
  let kneeL = c[8]
  let kneeR = c[9]
  let elL = c[10]
  let elR = c[11]
  let inL = c[12]
  let inR = c[13]
  let turn = 0
  let side = 0
  let bob = 0
  const t = b.cycle
  const p = b.seed
  let stance = 0.08
  let splayed = false
  if (c[AMP] > 0.02) {
    const a = c[AMP]
    // ---- the gait: each foot is planted while it bears weight and swung through while it does not, and the hip and
    // knee follow from where the foot is. The step is as long as the ground covered, so a planted foot stays put.
    const S = b.stride
    const u = t / (Math.PI * 2)
    let low = 0.86
    for (let leg = 0; leg < 2; leg++) {
      let ph = u + leg * 0.5
      ph -= Math.floor(ph)
      let f: number
      let lift = 0
      if (ph < STANCE) {
        f = S * (STANCE - 2 * ph)
        FOOT_DOWN[leg] = 1
        // the heel comes down first and the toe leaves last: the ankle is a little off the ground at both ends
        const edge = Math.abs(f) / 0.4
        lift = 0.07 * edge * edge
        const reach = 0.035 + lift + Math.sqrt(Math.max(0.01, REACH * REACH - f * f))
        if (reach < low) low = reach
      } else {
        const k = (ph - STANCE) / (1 - STANCE)
        FOOT_DOWN[leg] = 0
        f = S * STANCE * (2 * (k * k * (3 - 2 * k)) - 1)
        lift = 0.035 + 0.1 * Math.sin(Math.PI * Math.pow(k, 0.8)) * Math.min(1, S / 0.5)
      }
      FOOT_F[leg] = f * a
      FOOT_UP[leg] = lift * a
    }
    const drop = (0.86 - low) * a
    // stepping sideways along a row of seats: the same planted feet, but out to the side instead of fore and aft
    const sideways = b.sidle !== 0
    for (let leg = 0; leg < 2; leg++) {
      const down = c[HIP] - drop - 0.035 - FOOT_UP[leg]
      let f = FOOT_F[leg]
      if (sideways) {
        SPLAY[leg] = Math.asin(Math.max(-0.6, Math.min(0.6, (f * b.sidle) / 0.82)))
        f = FOOT_DOWN[leg] ? 0 : 0.04
        splayed = true
      }
      const d = Math.min(THIGH_L + SHIN_L - 0.002, Math.hypot(f, down))
      const knee = Math.PI - Math.acos(Math.max(-1, Math.min(1, (THIGH_L * THIGH_L + SHIN_L * SHIN_L - d * d) / (2 * THIGH_L * SHIN_L))))
      const thigh = Math.atan2(f, down) + Math.acos(Math.max(-1, Math.min(1, (THIGH_L * THIGH_L + d * d - SHIN_L * SHIN_L) / (2 * THIGH_L * d))))
      if (leg) {
        thighR += (thigh - thighR) * a
        kneeR += (knee - kneeR) * a
      } else {
        thighL += (thigh - thighL) * a
        kneeL += (knee - kneeL) * a
      }
    }
    bob = -drop
    stance = 0.08 - 0.012 * a
    lean += 0.025 * a * Math.min(1, b.speed / 1.6)
    // how far forward the left foot is, -1 to 1: the arms swing against the legs, less on a short step
    const s = Math.cos(t)
    const swing = sideways ? 0 : Math.min(1, S / 0.7)
    if (!arms) {
      // the elbow closes a little as the hand comes forward
      const one = prop === Prop.Bag || prop === Prop.Cup || prop === Prop.Broom
      shL -= 0.34 * s * a * swing
      elL += (0.16 + 0.24 * Math.max(0, -s)) * a
      if (prop === Prop.Cup) {
        shR += (0.15 - shR) * a
        elR += (1.5 - elR) * a
        inR += (0.3 - inR) * a
      } else {
        shR += (one ? 0.1 : 0.34) * s * a * swing
        elR += (0.16 + (one ? 0.05 : 0.24) * Math.max(0, s)) * a
      }
    }
  } else if (b.cheer) {
    const s = Math.sin(t * 7 + p)
    shL += 0.18 * s
    shR -= 0.18 * s
    bob = Math.abs(s) * 0.03
  } else if (b.clap > 0.05) {
    // hands come together and part, a little out of time with the neighbours
    const s = Math.sin(t * (15 + (p % 5)) + p)
    inL += 0.24 * s * b.clap
    inR += 0.24 * s * b.clap
    head += 0.03 * Math.sin(t * 1.3 + p)
  } else if (b.mode === Mode.Do) {
    switch (b.pose) {
      case Pose.Type:
      case Pose.StandType:
      case Pose.Perch: {
        // fingers on the keys: the forearms bob, the upper arms hardly move
        const rate = slump ? 3 : 9
        elL += 0.045 * Math.sin(t * rate + p)
        elR += 0.045 * Math.sin(t * rate + p + 2)
        inL += 0.06 * Math.sin(t * 1.9 + p)
        inR += 0.06 * Math.sin(t * 2.3 + p + 1)
        head += 0.03 * Math.sin(t * 0.7 + p)
        break
      }
      case Pose.Tend:
        shL += 0.08 * Math.sin(t * 1.7 + p)
        elR += 0.2 * Math.sin(t * 2.6 + p)
        head += 0.08 * Math.sin(t * 0.6 + p)
        break
      case Pose.Run: {
        const s = Math.sin(t * 9.5)
        thighL += 0.6 * s
        thighR -= 0.6 * s
        kneeL += Math.max(0, Math.sin(t * 9.5 + 2.2)) * 1.05
        kneeR += Math.max(0, Math.sin(t * 9.5 + 2.2 + Math.PI)) * 1.05
        shL -= 0.6 * s
        shR += 0.6 * s
        bob = Math.abs(Math.cos(t * 9.5)) * 0.05
        break
      }
      case Pose.Stretch: {
        // arms sweep up overhead and down to the sides, with a slow bend forward at the bottom
        const s = Math.sin(t * 0.9 + p)
        shL += 1.3 * s
        shR += 1.3 * s
        spL += 0.5 * Math.max(0, -s)
        spR += 0.5 * Math.max(0, -s)
        lean += 0.22 * Math.max(0, -s)
        break
      }
      case Pose.Curl: {
        const s = Math.sin(t * 3)
        elL += 0.95 * s
        elR -= 0.95 * s
        break
      }
      case Pose.Write:
        shR += 0.2 * Math.sin(t * 5 + p)
        elR += 0.25 * Math.sin(t * 3.1 + p)
        turn = 0.2 * Math.sin(t * 0.4 + p)
        break
      case Pose.Play:
        shR += 0.5 * Math.sin(t * 7 + p)
        elR += 0.4 * Math.sin(t * 7 + p + 1)
        side = 0.22 * Math.sin(t * 3.3 + p)
        bob = Math.abs(Math.sin(t * 3.3 + p)) * 0.03
        break
      case Pose.Hold:
        // the other hand taps and swipes at the screen
        head += 0.06 * Math.sin(t * 0.9 + p)
        elL += 0.12 * Math.sin(t * 4.3 + p)
        inL += 0.1 * Math.sin(t * 2.1 + p)
        break
      case Pose.Phone:
        turn = 0.25 * Math.sin(t * 0.5 + p)
        elL += 0.25 * Math.max(0, Math.sin(t * 1.1 + p))
        break
      case Pose.Look:
      case Pose.Stand:
        turn = 0.55 * Math.sin(t * 0.55 + p)
        lean += 0.015 * Math.sin(t * 1.1 + p)
        break
      case Pose.Queue:
        // weight from one foot to the other, and a glance up the line
        side = 0.03 * Math.sin(t * 0.7 + p)
        turn = 0.3 * Math.sin(t * 0.45 + p)
        head += 0.2 * Math.max(0, Math.sin(t * 0.3 + p))
        break
      case Pose.Pack:
        elL += 0.3 * Math.sin(t * 6)
        elR += 0.3 * Math.sin(t * 6 + 1.6)
        break
      case Pose.Meet:
        turn = 0.35 * Math.sin(t * 0.5 + p)
        elR += Math.max(0, Math.sin(t * 1.3 + p)) * 0.9
        shR -= Math.max(0, Math.sin(t * 1.3 + p)) * 0.35
        break
      case Pose.Sit:
      case Pose.Bar:
      case Pose.Lounge:
        turn = 0.3 * Math.sin(t * 0.4 + p)
        if (prop === Prop.Cup) {
          // now and then the cup comes up for a sip
          const sip = Math.max(0, Math.sin(t * 0.8 + p) - 0.6) * 2.5
          shR += 0.5 * sip
          elR += 1.3 * sip
          inR += 0.3 * sip
        }
        break
      case Pose.Present: {
        // one arm out toward the screen, the other making the point
        const g = Math.sin(t * 1.6 + p)
        elL += 0.5 * g
        shL += 0.2 * Math.sin(t * 0.9 + p)
        spR += 0.15 * Math.sin(t * 0.7 + p)
        turn = 0.5 * Math.sin(t * 0.35 + p)
        break
      }
      case Pose.Shake: {
        const g = Math.sin(t * 9)
        elR += 0.16 * g
        shR += 0.06 * g
        head += 0.1 * Math.max(0, Math.sin(t * 4.5))
        break
      }
      case Pose.Sweep: {
        const g = Math.sin(t * 2.6 + p)
        shL += 0.16 * g
        shR += 0.22 * g
        elR -= 0.2 * g
        lean += 0.04 * g
        break
      }
      case Pose.Fix:
        elL += 0.3 * Math.sin(t * 3.4 + p)
        elR += 0.3 * Math.sin(t * 2.7 + p + 1)
        shR += 0.12 * Math.sin(t * 1.3 + p)
        break
      case Pose.Film:
        turn = 0.12 * Math.sin(t * 0.4 + p)
        break
    }
  }
  // an elbow bends one way only
  if (elL < 0) elL = 0
  if (elR < 0) elR = 0

  const hip = c[HIP] + bob
  const cy = Math.cos(b.yaw)
  const sy = Math.sin(b.yaw)
  R.makeRotationY(b.yaw).setPosition(b.x + side * cy, b.y, b.z - side * sy)
  const bx = i * BOXES
  const sx = i * BALLS

  for (let leg = 0; leg < 2; leg++) {
    const sgn = leg ? 1 : -1
    if (splayed) F1.multiplyMatrices(R, B.makeRotationZ(SPLAY[leg]).multiply(A.makeRotationX(leg ? thighR : thighL)).setPosition(sgn * stance, hip, 0))
    else F1.multiplyMatrices(R, A.makeRotationX(leg ? thighR : thighL).setPosition(sgn * stance, hip, 0))
    box(m, bx + THIGH + leg, F1, 0.125, 0.44, 0.135, 0, -0.2, 0)
    F2.multiplyMatrices(F1, A.makeRotationX(-(leg ? kneeR : kneeL)).setPosition(0, -0.42, 0))
    box(m, bx + SHIN + leg, F2, 0.108, 0.4, 0.112, 0, -0.18, 0)
    box(m, bx + FOOT + leg, F2, 0.108, 0.07, 0.22, 0, -0.405, -0.045)
  }

  TF.multiplyMatrices(R, A.makeRotationX(-lean).setPosition(0, hip, 0))
  box(m, bx + TORSO, TF, 0.34, 0.54, 0.2, 0, 0.3, 0.01)

  for (let arm = 0; arm < 2; arm++) {
    const sgn = arm ? 1 : -1
    // shoulder: out to the side, forward and up, then turned so the elbow hinges the right way
    B.makeRotationZ(sgn * (arm ? spR : spL))
    B.multiply(A.makeRotationX(arm ? shR : shL))
    B.multiply(A.makeRotationY(sgn * (arm ? inR : inL))).setPosition(sgn * 0.215, 0.53, 0.01)
    F1.multiplyMatrices(TF, B)
    box(m, bx + UARM + arm, F1, 0.09, UPPER + 0.05, 0.094, 0, -UPPER / 2 + 0.01, 0)
    const H = arm ? HR : HL
    H.multiplyMatrices(F1, A.makeRotationX(arm ? elR : elL).setPosition(0, -UPPER, 0))
    box(m, bx + FARM + arm, H, 0.08, FORE + 0.04, 0.084, 0, -FORE / 2, 0)
    ball(m, sx + HAND + arm, H, 0.047, 0.047, 0.047, 0, -FORE - 0.025, 0)
  }

  // ---- whatever is in their hands
  let fresh = false
  if (b.prop !== prop) {
    b.prop = prop
    const colours = PROP_COLOR[prop]
    if (colours) {
      m.boxes.setColorAt(bx + PROP, col.set(colours[0]))
      m.boxes.setColorAt(bx + PROP2, col.set(colours[1]))
      fresh = true
    }
  }
  let second = false
  switch (prop) {
    case Prop.Box:
      box(m, bx + PROP, TF, 0.38, 0.25, 0.3, 0, 0.3, -0.34)
      break
    case Prop.Tray:
      box(m, bx + PROP, TF, 0.42, 0.02, 0.3, 0, 0.3, -0.36)
      box(m, bx + PROP2, TF, 0.16, 0.05, 0.16, 0.06, 0.335, -0.36)
      second = true
      break
    case Prop.Bag:
      box(m, bx + PROP, HR, 0.24, 0.27, 0.09, 0, -FORE - 0.19, 0)
      break
    case Prop.Cup:
      box(m, bx + PROP, HR, 0.062, 0.085, 0.062, 0, -FORE - 0.03, -0.055)
      break
    case Prop.Device:
    case Prop.Phone:
      box(m, bx + PROP, HR, 0.074, 0.15, 0.014, 0, -FORE - 0.05, -0.035)
      break
    case Prop.Weights:
      box(m, bx + PROP, HR, 0.2, 0.075, 0.075, 0, -FORE - 0.03, 0)
      box(m, bx + PROP2, HL, 0.2, 0.075, 0.075, 0, -FORE - 0.03, 0)
      second = true
      break
    case Prop.Broom: {
      // a long handle from the upper hand down to a head on the floor in front
      F1.multiplyMatrices(TF, A.makeRotationX(-0.62).setPosition(0.02, 0.36, -0.2))
      box(m, bx + PROP, F1, 0.03, 1.36, 0.03, 0, -0.52, 0)
      box(m, bx + PROP2, F1, 0.34, 0.07, 0.09, 0, -1.2, 0)
      second = true
      break
    }
    case Prop.Clipboard:
      box(m, bx + PROP, HL, 0.17, 0.24, 0.016, 0.03, -FORE - 0.04, -0.05)
      box(m, bx + PROP2, HL, 0.14, 0.19, 0.008, 0.03, -FORE - 0.04, -0.061)
      second = true
      break
    default:
      m.boxes.setMatrixAt(bx + PROP, ZERO)
  }
  if (!second) m.boxes.setMatrixAt(bx + PROP2, ZERO)

  B.makeRotationY(turn)
  B.multiply(A.makeRotationX(-head)).setPosition(0, 0.6, 0.01)
  F1.multiplyMatrices(TF, B)
  ball(m, sx + HEAD, F1, 0.105, 0.105, 0.105, 0, 0.11, -0.005)
  ball(m, sx + HAIRB, F1, 0.112, 0.09, 0.112, 0, 0.145, 0.016)
  if ((b.look >> 7) % 3 === 0) box(m, bx + LONG, F1, 0.19, 0.24, 0.07, 0, 0.04, 0.085)
  else m.boxes.setMatrixAt(bx + LONG, ZERO)

  // a soft dark patch on the floor stands in for a shadow
  if (b.y < 0.3) m.blobs.setMatrixAt(i, A.makeScale(0.27, 1, 0.27).setPosition(b.x, b.y + 0.014, b.z))
  else m.blobs.setMatrixAt(i, ZERO)
  b.shown = true
  return fresh
}

const GOLD = '#f2b631'
const BLUE = '#5aa2f0'
const SPARK = '#fff3c9'

/** Anything with people in it to draw: a crowd, or a cast put together by hand. */
export interface Cast {
  bodies: Body[]
  /** Bumped when the set of bodies changes. */
  version: number
}

export function People({ crowd, cap, neg, markers = true }: { crowd: Cast; cap: number; neg: string; markers?: boolean }) {
  const m = useMemo(() => build(cap), [cap])
  useEffect(
    () => () => {
      for (const mesh of [m.boxes, m.balls, m.marks, m.blobs]) {
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
        mesh.dispose()
      }
    },
    [m],
  )
  const seen = useMemo(() => ({ version: -1 }), [m]) // eslint-disable-line react-hooks/exhaustive-deps

  useTick((dt, now) => {
    const bodies = crowd.bodies
    const n = Math.min(bodies.length, cap)
    if (seen.version !== crowd.version) {
      seen.version = crowd.version
      for (const b of bodies) b.shown = false
      paint(m, bodies)
      for (let i = 0; i < n; i++) hide(m, i)
    }
    m.boxes.count = n * BOXES
    m.balls.count = n * BALLS
    m.blobs.count = n
    m.marks.count = markers ? n * MARKS : 0
    let recolour = false
    for (let i = 0; i < n; i++) {
      const b = bodies[i]
      const mi = i * MARKS
      let mark = 0
      if (b.mode === Mode.Off) {
        if (b.shown) {
          hide(m, i)
          b.shown = false
        }
        // an empty chair with a badge over it: away on a course
        if (markers && b.training && b.seat && !b.quit) {
          const s = b.seat
          A.makeRotationY(now * 1.2).scale(SCALE.set(0.13, 0.13, 0.035)).setPosition(s.x, 1.45 + Math.sin(now * 2 + i) * 0.04, s.z)
          m.marks.setMatrixAt(mi, A)
          m.marks.setColorAt(mi, col.set(BLUE))
          mark = 1
        }
      } else {
        if (pose(m, i, b, dt)) recolour = true
        if (markers && b.kind === Kind.Staff && !b.quit) {
          const top = b.y + b.cur[HIP] + 1.08
          const working = b.mode === Mode.Do && (b.act === Act.Desk || b.act === Act.Station || b.act === Act.Meet)
          if (b.ask || b.slump || !b.seat) {
            A.makeRotationY(now * 1.5).scale(SCALE.set(0.085, 0.11, 0.085)).setPosition(b.x, top + 0.06 + Math.sin(now * 3 + i) * 0.05, b.z)
            m.marks.setMatrixAt(mi, A)
            m.marks.setColorAt(mi, col.set(b.ask ? GOLD : neg))
            mark = 1
          } else if (b.shining && working) {
            // two small glints circling the head: this one is on a roll
            for (let k = 0; k < 2; k++) {
              const a = now * 2.2 + i + k * Math.PI
              const tw = 0.02 + 0.02 * Math.abs(Math.sin(now * 5 + i * 1.7 + k * 2))
              A.makeRotationY(a).scale(SCALE.set(tw, tw * 1.7, tw)).setPosition(b.x + Math.cos(a) * 0.2, top - 0.12 + Math.sin(a * 1.3) * 0.05, b.z + Math.sin(a) * 0.2)
              m.marks.setMatrixAt(mi + k, A)
              m.marks.setColorAt(mi + k, col.set(SPARK))
            }
            mark = 2
          }
        }
      }
      if (mark < 1) m.marks.setMatrixAt(mi, ZERO)
      if (mark < 2) m.marks.setMatrixAt(mi + 1, ZERO)
    }
    if (recolour) m.boxes.instanceColor!.needsUpdate = true
    m.boxes.instanceMatrix.needsUpdate = true
    m.balls.instanceMatrix.needsUpdate = true
    m.blobs.instanceMatrix.needsUpdate = true
    m.marks.instanceMatrix.needsUpdate = true
    if (m.marks.instanceColor) m.marks.instanceColor.needsUpdate = true
  }, 5)

  return (
    <>
      <primitive object={m.blobs} />
      <primitive object={m.boxes} />
      <primitive object={m.balls} />
      <primitive object={m.marks} />
    </>
  )
}

const SCALE = new THREE.Vector3()
