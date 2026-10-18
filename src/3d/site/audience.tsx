// The seated audience of a venue: one small figure in every seat that is
// taken, all of them in two instanced meshes however big the house. They fill
// the seats the player built, clap when the house applauds and get to their
// feet for an ovation. The guests who walk in and out are drawn with the rest
// of the crowd; these are everyone else. The keynote replay uses it too.
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ITEMS, stageOf } from '../../sim/sites'
import type { Site } from '../../sim/types'
import { Body, Kind, Mode } from './crowd'
import { HAIR, SKIN, hash } from './kit'
import { People } from './People'
import { Pose, STAGE_H, frameOf, frameX, frameZ, seatPlaces, seatRank, stageMarks } from './spots'
import { useTick } from './tick'

const SHIRTS = ['#c9553d', '#31506b', '#e9e4da', '#3f7d4d', '#d6a24f', '#6a5a7a', '#2c3036', '#8a5a44', '#4f8fd6', '#7a8f9c']
const LEGS = ['#2b3140', '#3a3f47', '#4b4237', '#252a33']
/** Boxes per figure: torso, lap, shins, two arms. Balls: head and hair. */
const BOXES = 5
const BALLS = 2
/** Height of a seat's top above the floor of its row. */
const SEAT = 0.5

const M = new THREE.Matrix4()
const Q = new THREE.Quaternion()
const QY = new THREE.Quaternion()
const E = new THREE.Euler()
const V = new THREE.Vector3()
const S = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
const col = new THREE.Color()

export interface House {
  /** Share of all the seats that are taken, 0-1. */
  house: number
  /** 0-1: how hard the house is clapping. */
  applause: number
  /** On its feet. */
  ovation: boolean
}

interface Props {
  site: Site
  /** Read every frame. */
  state: () => House
  /** Seats to leave empty whatever the house: someone is walking to them, or sitting in them, as one of the crowd. Keys are `${item id}:${seat index}`. */
  skip?: (key: string) => boolean
  /** When the crowd itself says who is in which seat: exactly these seats are drawn taken, and `house` is not used. */
  filled?: (key: string) => boolean
}

export function Audience({ site, state, skip, filled }: Props) {
  const seats = useMemo(() => {
    const list = seatPlaces(site)
    // the house fills from the front, row by row, and empties from the back
    const order = seatRank(list)
    return { list, order, keys: list.map((s) => `${s.item.id}:${s.index}`) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, site.rev])
  const n = seats.list.length
  const meshes = useMemo(() => {
    const cloth = new THREE.MeshStandardMaterial({ roughness: 0.9 })
    const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cloth, Math.max(1, n * BOXES))
    const balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), cloth, Math.max(1, n * BALLS))
    for (const m of [boxes, balls]) {
      m.frustumCulled = false
      m.userData.live = true
      m.receiveShadow = true
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    }
    for (let i = 0; i < n; i++) {
      const shirt = SHIRTS[Math.floor(hash(i * 3.1 + 2) * SHIRTS.length)]
      const legs = LEGS[Math.floor(hash(i * 5.3 + 4) * LEGS.length)]
      boxes.setColorAt(i * BOXES, col.set(shirt))
      boxes.setColorAt(i * BOXES + 1, col.set(legs))
      boxes.setColorAt(i * BOXES + 2, col.set(legs))
      boxes.setColorAt(i * BOXES + 3, col.set(shirt))
      boxes.setColorAt(i * BOXES + 4, col.set(shirt))
      balls.setColorAt(i * BALLS, col.set(SKIN[Math.floor(hash(i * 7.7 + 1) * SKIN.length)]))
      balls.setColorAt(i * BALLS + 1, col.set(HAIR[Math.floor(hash(i * 9.1 + 3) * HAIR.length)]))
      for (let k = 0; k < BOXES; k++) boxes.setMatrixAt(i * BOXES + k, ZERO)
      for (let k = 0; k < BALLS; k++) balls.setMatrixAt(i * BALLS + k, ZERO)
    }
    return { boxes, balls }
  }, [n])
  useEffect(
    () => () => {
      for (const m of [meshes.boxes, meshes.balls]) {
        m.geometry.dispose()
        m.dispose()
      }
      ;(meshes.boxes.material as THREE.Material).dispose()
    },
    [meshes],
  )
  /** For each seat: 0 empty, 1 seated, 2 standing with arms up, 3 on their feet for a moment as they take the seat or leave it. */
  const shown = useMemo(() => new Uint8Array(Math.max(1, n)), [meshes]) // eslint-disable-line react-hooks/exhaustive-deps
  /** When each seat was last taken or given up. */
  const since = useMemo(() => new Float32Array(Math.max(1, n)).fill(-10), [meshes]) // eslint-disable-line react-hooks/exhaustive-deps
  const smooth = useRef({ house: -1, clap: 0 })

  useTick((dt, now) => {
    if (!n) return
    const st = state()
    const sm = smooth.current
    // the house fills and empties over a few seconds, never in one jump (except on the very first look)
    const first = sm.house < 0
    sm.house = first ? st.house : sm.house + Math.max(-dt * 0.4, Math.min(dt * 0.4, st.house - sm.house))
    sm.clap += (st.applause - sm.clap) * Math.min(1, dt * 6)
    const full = Math.round(sm.house * n)
    const clapping = sm.clap > 0.03 || st.ovation
    const { boxes, balls } = meshes
    let bodies = false
    let arms = false
    for (let i = 0; i < n; i++) {
      const taken = filled ? filled(seats.keys[i]) : seats.order[i] < full && !(skip && skip(seats.keys[i]))
      const up = taken && st.ovation && hash(i * 2.3 + 9) > 0.3
      let want = taken ? (up ? 2 : 1) : 0
      // nobody appears in a seat or vanishes from one sitting down: they are on their feet for a moment first
      const was = shown[i]
      if (!first && taken !== (was === 1 || was === 2 || (was === 3 && since[i] > 0))) since[i] = taken ? now : -now
      if (taken && want === 1 && now - since[i] < 0.5) want = 3
      else if (!taken && was !== 0 && since[i] < 0 && now + since[i] < 0.4) want = 3
      const changed = was !== want
      if (!changed && !(want && clapping)) continue
      const p = seats.list[i]
      const bi = i * BOXES
      if (!want) {
        shown[i] = 0
        for (let k = 0; k < BOXES; k++) boxes.setMatrixAt(bi + k, ZERO)
        for (let k = 0; k < BALLS; k++) balls.setMatrixAt(i * BALLS + k, ZERO)
        bodies = arms = true
        continue
      }
      QY.setFromAxisAngle(UP, p.face)
      const cos = Math.cos(p.face)
      const sin = Math.sin(p.face)
      // a point in the seat's own frame (x to the sitter's right, z behind them), out in the world
      const at = (x: number, y: number, z: number) => V.set(p.x + x * cos + z * sin, p.y + y, p.z - x * sin + z * cos)
      const rise = want >= 2 ? 0.36 : 0
      const phase = hash(i * 1.37) * 6.28
      if (changed) {
        shown[i] = want
        const tall = 0.9 + hash(i * 4.9) * 0.2
        boxes.setMatrixAt(bi, M.compose(at(0, SEAT + 0.29 + rise, 0.03), QY, S.set(0.33, 0.52 * tall, 0.2)))
        if (want >= 2) {
          // on their feet: legs straight down in front of the seat
          boxes.setMatrixAt(bi + 1, M.compose(at(0, 0.44, -0.12), QY, S.set(0.28, 0.88, 0.15)))
          boxes.setMatrixAt(bi + 2, ZERO)
        } else {
          boxes.setMatrixAt(bi + 1, M.compose(at(0, SEAT + 0.065, -0.14), QY, S.set(0.3, 0.13, 0.42)))
          boxes.setMatrixAt(bi + 2, M.compose(at(0, 0.27, -0.31), QY, S.set(0.27, 0.5, 0.12)))
        }
        const head = SEAT + 0.29 + rise + 0.26 * tall + 0.13
        balls.setMatrixAt(i * BALLS, M.compose(at(0, head, 0.02), QY, S.set(0.105, 0.105, 0.105)))
        balls.setMatrixAt(i * BALLS + 1, M.compose(at(0, head + 0.035, 0.036), QY, S.set(0.112, 0.09, 0.112)))
        bodies = true
      }
      // ---- arms: in the lap, clapping in front of the chest, or up in the air
      const clap = want === 2 ? 0 : sm.clap
      for (let arm = 0; arm < 2; arm++) {
        const sgn = arm ? 1 : -1
        if (want === 3) {
          Q.copy(QY)
          boxes.setMatrixAt(bi + 3 + arm, M.compose(at(sgn * 0.245, SEAT + 0.36 + 0.1, 0.03), Q, S.set(0.085, 0.46, 0.085)))
        } else if (want === 2) {
          const wave = Math.sin(now * 7 + phase) * 0.12
          Q.setFromEuler(E.set(0, 0, sgn * (-0.22 + wave * sgn)))
          Q.premultiply(QY)
          boxes.setMatrixAt(bi + 3 + arm, M.compose(at(sgn * 0.25, SEAT + 0.36 + 0.5 + 0.2, 0.02), Q, S.set(0.085, 0.46, 0.085)))
        } else if (clap > 0.03) {
          // forearms up in front, hands meeting in the middle and parting again
          const beat = Math.sin(now * (14 + (i % 5)) + phase)
          const gap = 0.05 + 0.055 * (1 + beat) * clap + (1 - clap) * 0.1
          Q.setFromEuler(E.set(1.0, 0, sgn * 0.5))
          Q.premultiply(QY)
          boxes.setMatrixAt(bi + 3 + arm, M.compose(at(sgn * (gap + 0.08), SEAT + 0.36 + 0.02 * clap, -0.17), Q, S.set(0.08, 0.34, 0.08)))
        } else {
          Q.setFromEuler(E.set(1.25, 0, 0))
          Q.premultiply(QY)
          boxes.setMatrixAt(bi + 3 + arm, M.compose(at(sgn * 0.2, SEAT + 0.2, -0.12), Q, S.set(0.08, 0.36, 0.08)))
        }
      }
      arms = true
    }
    if (bodies) balls.instanceMatrix.needsUpdate = true
    if (bodies || arms) boxes.instanceMatrix.needsUpdate = true
  }, 6)

  if (!n) return null
  return (
    <>
      <primitive object={meshes.boxes} />
      <primitive object={meshes.balls} />
    </>
  )
}

/**
 * The presenter of a keynote replay: on stage, talking to the house, arms up
 * when it cheers. With `walk` they come on from the wings at stage left and
 * cross to the middle as it goes from 0 to 1; without it they stand at the
 * lectern. Drawn the same way as everyone in a crowd.
 */
export function Presenter({ site, cheer, walk }: { site: Site; cheer: boolean; /** Read every frame: 0 in the wings, 1 at the middle mark; null to stand at the lectern. */ walk?: () => number | null }) {
  const stage = useMemo(() => stageOf(site), [site, site.rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const cast = useMemo(() => {
    const b = new Body()
    b.id = 'presenter'
    b.kind = Kind.Host
    b.look = 4242
    b.seed = 4259
    b.shirt = '#1c1e22'
    b.mode = Mode.Do
    b.pose = Pose.Present
    return { bodies: [b], version: 0 }
  }, [])
  const b = cast.bodies[0]
  const marks = stage ? stageMarks(ITEMS.venue[stage.kind]?.w ?? 6, ITEMS.venue[stage.kind]?.h ?? 4) : null
  const place = (k: number | null) => {
    if (!stage || !marks) return
    const f = frameOf(site, stage)
    const [lx, lz] = k === null ? marks.lectern : [marks.wings[0] + (marks.centre[0] + 0.75 - marks.wings[0]) * k, marks.wings[1] + (marks.centre[1] - marks.wings[1]) * k]
    const x = frameX(f, lx, lz)
    const z = frameZ(f, lx, lz)
    const moved = Math.hypot(x - b.x, z - b.z)
    b.x = x
    b.z = z
    b.y = STAGE_H + 0.012
    const walking = k !== null && k < 1 && moved > 0.0005
    b.mode = walking ? Mode.Walk : Mode.Do
    b.striding = walking
    b.speed = walking ? 1.3 : 0
    // across the stage toward the house's left while walking on, then turned to face the house
    b.yaw = walking ? f.a + Math.PI / 2 + 0.25 : f.a + Math.PI
    return moved
  }
  if (b.x === 0 && b.z === 0) place(walk ? walk() : null)
  b.cheer = cheer
  useTick((dt) => {
    const moved = place(walk ? walk() : null) ?? 0
    b.cycle += b.striding ? (moved * Math.PI) / Math.max(0.3, b.stride) : dt
  }, 4)
  if (!stage) return null
  return <People crowd={cast} cap={1} neg="#ff4d4f" markers={false} />
}
