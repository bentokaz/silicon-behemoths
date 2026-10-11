// Draws the crowd. Every person is a handful of boxes and balls, and all of
// them share four instanced meshes, so sixty people walking about cost four
// draw calls. Limbs are posed by hand each frame: there is no skeleton.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Act, type Body, type Crowd, Kind, Mode } from './crowd'
import { DARK, HAIR, SKIN, TROUSERS } from './kit'
import { Pose } from './spots'
import { useTick } from './tick'

const BOXES = 11
const BALLS = 4
const MARKS = 2
// box slots
const TORSO = 0
const THIGH = 1
const SHIN = 3
const FOOT = 5
const ARM = 7
const LONG = 9
const PROP = 10
// ball slots
const HEAD = 0
const HAIRB = 1
const HAND = 2

/** Resting joint angles for each pose: lean, head, left arm, right arm, spread, thighs (l, r), knees (l, r). */
const REST: Record<number, number[]> = {
  [Pose.Stand]: [0, 0, 0.06, 0.06, 0.07, 0, 0, 0, 0],
  [Pose.Sit]: [0, 0, 0.5, 0.5, 0.05, 1.5, 1.5, 1.5, 1.5],
  [Pose.Type]: [0.06, 0.08, 1.12, 1.12, 0.02, 1.5, 1.5, 1.5, 1.5],
  [Pose.StandType]: [0.04, 0.1, 0.9, 0.9, 0.02, 0, 0, 0, 0],
  [Pose.Perch]: [0.08, 0.1, 1.0, 1.0, 0.03, 1.2, 1.2, 1.1, 1.1],
  [Pose.Lounge]: [-0.2, 0, 0.45, 0.45, 0.1, 1.45, 1.45, 1.3, 1.3],
  [Pose.Run]: [0.14, 0, 0.6, 0.6, 0.06, 0, 0, 0, 0],
  [Pose.Stretch]: [0, -0.15, 1.5, 1.5, 0.22, 0, 0, 0, 0],
  [Pose.Curl]: [0, 0, 0.8, 0.8, 0.05, 0, 0, 0, 0],
  [Pose.Write]: [0, -0.1, 0.1, 2.0, 0.05, 0, 0, 0, 0],
  [Pose.Play]: [0.12, 0, 0.3, 1.0, 0.1, 0.15, -0.15, 0.2, 0.2],
  [Pose.Hold]: [0.03, 0.3, 0.1, 1.3, 0.02, 0, 0, 0, 0],
  [Pose.Phone]: [0, 0, 0.45, 2.6, 0.02, 1.5, 1.5, 1.5, 1.5],
  [Pose.Look]: [0, 0, 0.06, 0.06, 0.07, 0, 0, 0, 0],
  [Pose.Pack]: [0.25, 0.3, 1.1, 1.1, 0.02, 0, 0, 0, 0],
  [Pose.Meet]: [0.05, 0, 0.95, 0.95, 0.05, 1.5, 1.5, 1.5, 1.5],
  // on a high stool at a counter: legs hang nearly straight, so the knees stay clear of it
  [Pose.Bar]: [0.1, 0.05, 1.0, 1.0, 0.04, 0.55, 0.55, 0.75, 0.75],
}
const AMP = 9
const HIP = 10

const R = new THREE.Matrix4()
const TF = new THREE.Matrix4()
const F1 = new THREE.Matrix4()
const F2 = new THREE.Matrix4()
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
      m.boxes.setColorAt(bx + ARM + k, col.set(b.shirt))
    }
    m.boxes.setColorAt(bx + LONG, col.set(hair))
    m.boxes.setColorAt(bx + PROP, col.set(b.kind === Kind.Shopper ? '#ece7dc' : '#b98b56'))
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

/** Writes one person's parts. */
function pose(m: Meshes, i: number, b: Body, dt: number) {
  const c = b.cur
  const walking = b.mode === Mode.Walk || b.mode === Mode.In || b.mode === Mode.Out
  const rest = REST[walking ? Pose.Stand : b.pose] ?? REST[Pose.Stand]
  const k = b.shown ? Math.min(1, dt * 9) : 1
  const slump = b.slump
  for (let j = 0; j < 9; j++) {
    let goal = rest[j]
    if (slump && j === 0) goal += walking ? 0.2 : 0.26
    if (slump && j === 1) goal += 0.38
    if (b.carry && (j === 2 || j === 3) && b.pose !== Pose.Pack) goal = 1.12
    c[j] += (goal - c[j]) * k
  }
  c[AMP] += ((walking ? 1 : 0) - c[AMP]) * k
  c[HIP] += ((walking ? 0.86 : b.hip) - c[HIP]) * k

  let lean = c[0]
  let head = c[1]
  let armL = c[2]
  let armR = c[3]
  const spread = c[4]
  let thighL = c[5]
  let thighR = c[6]
  let kneeL = c[7]
  let kneeR = c[8]
  let turn = 0
  let side = 0
  let bob = 0
  const t = b.cycle
  if (c[AMP] > 0.02) {
    const a = c[AMP] * (slump ? 0.6 : 1)
    const s = Math.sin(t)
    thighL += 0.5 * s * a
    thighR -= 0.5 * s * a
    kneeL += Math.max(0, Math.sin(t + 2.2)) * 0.75 * a
    kneeR += Math.max(0, Math.sin(t + 2.2 + Math.PI)) * 0.75 * a
    if (!b.carry) {
      armL -= 0.42 * s * a
      armR += (b.bag ? 0.15 : 0.42) * s * a
    }
    bob = Math.abs(Math.cos(t)) * 0.035 * a
  } else if (b.mode === Mode.Do) {
    const p = b.seed
    switch (b.pose) {
      case Pose.Type:
      case Pose.StandType:
      case Pose.Perch: {
        const rate = slump ? 3 : 9
        armL += 0.05 * Math.sin(t * rate + p)
        armR += 0.05 * Math.sin(t * rate + p + 2)
        head += 0.03 * Math.sin(t * 0.7 + p)
        break
      }
      case Pose.Run: {
        const s = Math.sin(t * 9.5)
        thighL += 0.85 * s
        thighR -= 0.85 * s
        kneeL += Math.max(0, Math.sin(t * 9.5 + 2.2)) * 1.3
        kneeR += Math.max(0, Math.sin(t * 9.5 + 2.2 + Math.PI)) * 1.3
        armL -= 0.7 * s
        armR += 0.7 * s
        bob = Math.abs(Math.cos(t * 9.5)) * 0.05
        break
      }
      case Pose.Stretch: {
        const s = Math.sin(t * 0.9 + p)
        armL += 1.35 * s
        armR += 1.35 * s
        lean += 0.18 * Math.max(0, -s)
        break
      }
      case Pose.Curl:
        armL += 0.9 * Math.sin(t * 3)
        armR -= 0.9 * Math.sin(t * 3)
        break
      case Pose.Write:
        armR += 0.25 * Math.sin(t * 5 + p)
        turn = 0.2 * Math.sin(t * 0.4 + p)
        break
      case Pose.Play:
        armR += 0.7 * Math.sin(t * 7 + p)
        side = 0.22 * Math.sin(t * 3.3 + p)
        bob = Math.abs(Math.sin(t * 3.3 + p)) * 0.03
        break
      case Pose.Hold:
        head += 0.06 * Math.sin(t * 0.9 + p)
        armR += 0.08 * Math.sin(t * 1.7 + p)
        break
      case Pose.Look:
      case Pose.Stand:
        turn = 0.55 * Math.sin(t * 0.55 + p)
        lean += 0.015 * Math.sin(t * 1.1 + p)
        break
      case Pose.Pack:
        armL += 0.3 * Math.sin(t * 6)
        armR += 0.3 * Math.sin(t * 6 + 1.6)
        break
      case Pose.Meet:
        turn = 0.35 * Math.sin(t * 0.5 + p)
        armR += Math.max(0, Math.sin(t * 1.3 + p)) * 0.5
        break
    }
  }

  const hip = c[HIP]
  const cy = Math.cos(b.yaw)
  const sy = Math.sin(b.yaw)
  R.makeRotationY(b.yaw).setPosition(b.x + side * cy, b.y + bob, b.z - side * sy)
  const bx = i * BOXES
  const sx = i * BALLS

  for (let leg = 0; leg < 2; leg++) {
    const sgn = leg ? 1 : -1
    F1.multiplyMatrices(R, A.makeRotationX(leg ? thighR : thighL).setPosition(sgn * 0.08, hip, 0))
    box(m, bx + THIGH + leg, F1, 0.125, 0.44, 0.135, 0, -0.2, 0)
    F2.multiplyMatrices(F1, A.makeRotationX(-(leg ? kneeR : kneeL)).setPosition(0, -0.42, 0))
    box(m, bx + SHIN + leg, F2, 0.108, 0.4, 0.112, 0, -0.18, 0)
    box(m, bx + FOOT + leg, F2, 0.108, 0.07, 0.22, 0, -0.405, -0.045)
  }

  TF.multiplyMatrices(R, A.makeRotationX(-lean).setPosition(0, hip, 0))
  box(m, bx + TORSO, TF, 0.34, 0.54, 0.2, 0, 0.3, 0.01)

  let prop = false
  for (let arm = 0; arm < 2; arm++) {
    const sgn = arm ? 1 : -1
    B.makeRotationZ(sgn * spread)
    B.multiply(A.makeRotationX(arm ? armR : armL)).setPosition(sgn * 0.215, 0.53, 0.01)
    F1.multiplyMatrices(TF, B)
    box(m, bx + ARM + arm, F1, 0.088, 0.46, 0.092, 0, -0.22, 0)
    ball(m, sx + HAND + arm, F1, 0.047, 0.047, 0.047, 0, -0.48, 0)
    if (arm && b.bag && !b.carry) {
      box(m, bx + PROP, F1, 0.24, 0.27, 0.09, 0, -0.66, 0)
      prop = true
    }
  }
  if (b.carry) {
    box(m, bx + PROP, TF, 0.38, 0.25, 0.3, 0, 0.3, -0.32)
    prop = true
  }
  if (!prop) m.boxes.setMatrixAt(bx + PROP, ZERO)

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
}

const GOLD = '#f2b631'
const BLUE = '#5aa2f0'
const SPARK = '#fff3c9'

export function People({ crowd, cap, neg, markers = true }: { crowd: Crowd; cap: number; neg: string; markers?: boolean }) {
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
        pose(m, i, b, dt)
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
