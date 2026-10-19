// A camera with a script: the keynote's shots, worked out from the stage and
// the house so that they frame a studio, a theatre and a stadium alike. The
// show says which shot and how far into it; the director moves the camera
// there each frame and keeps the orbit controls' target with it, so the view
// can be taken back by hand when the script lets go.
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ITEMS, RIG_TOP, ceilingOf, gridAt, isScreen, stageOf } from '../../sim/sites'
import type { Site } from '../../sim/types'
import { STAGE_H, frameOf, frameX, frameZ, seatPlaces, stageMarks } from './spots'

export type V3 = [number, number, number]
export interface Shot {
  pos: V3
  look: V3
  fov?: number
}

export type ShotName = 'establish' | 'dark' | 'walkon' | 'wall' | 'side' | 'house' | 'crane' | 'orbit'

/** Where everything is, in the stage's own frame: x across (stage left negative), z toward the house, y up. */
export interface Stagecraft {
  shot: (name: ShotName, t: number, presenter?: [number, number] | null) => Shot
  /** Width of the stage and height of the middle of its screen. */
  width: number
  wallMid: number
}

const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

export function stagecraft(site: Site): Stagecraft | null {
  const stage = stageOf(site)
  if (!stage) return null
  const f = frameOf(site, stage)
  const def = ITEMS.venue[stage.kind]
  const W = def?.w ?? 6
  const D = def?.h ?? 4
  const front = D / 2 - 0.68
  // the screen behind the stage, if there is one, and how high its picture stands
  const screen = site.items.find((i) => isScreen(i.kind))
  const indoor = gridAt(site, stage.x, stage.y) > 0
  const top = Math.min(RIG_TOP[screen?.kind ?? 'screen'] ?? 5, indoor ? ceilingOf(site) - 0.4 : 99)
  const wallMid = screen ? Math.max(2.2, (1.6 + top) / 2) : 2.4
  // how far back the house goes
  let back = D / 2 + 10
  let side = W / 2 + 4
  for (const s of seatPlaces(site)) {
    const lx = (s.x - f.cx) * f.cos - (s.z - f.cz) * f.sin
    const lz = (s.x - f.cx) * f.sin + (s.z - f.cz) * f.cos
    if (lz > 0) back = Math.max(back, lz + 1.5)
    side = Math.max(side, Math.abs(lx))
  }
  const roof = indoor ? ceilingOf(site) - 0.6 : 60
  const w = (x: number, y: number, z: number): V3 => [frameX(f, x, z), y, frameZ(f, x, z)]
  const scale = Math.max(1, W / 6)
  const centre = stageMarks(W, D).centre
  const shot = (name: ShotName, t: number, presenter?: [number, number] | null): Shot => {
    // the presenter, in the stage's frame
    let px = centre[0] - 0.45
    let pz = centre[1]
    if (presenter) {
      px = (presenter[0] - f.cx) * f.cos - (presenter[1] - f.cz) * f.sin
      pz = (presenter[0] - f.cx) * f.sin + (presenter[1] - f.cz) * f.cos
    }
    const cap = (y: number) => Math.min(roof, y)
    switch (name) {
      case 'establish': {
        // high at the back of the house, drifting across it
        const k = ease(t / 6)
        return { pos: w(Math.sin(t * 0.18 + 0.6) * side * 0.5, cap(lerp(4 + back * 0.35, 3 + back * 0.25, k)), back + 2 - k * 3), look: w(0, wallMid * 0.8, 0), fov: 36 }
      }
      case 'dark': {
        const k = ease(t / 3)
        return { pos: w(lerp(side * 0.2, 0, k), cap(lerp(3 + back * 0.25, 2.4 + scale, k)), lerp(back - 1, back * 0.6, k)), look: w(0, wallMid * 0.85, 0), fov: 34 }
      }
      case 'walkon': {
        // from the front of the house, house right, following the presenter across
        const dist = 5 + scale * 2.5
        return { pos: w(px + 2.2 + scale, STAGE_H + 1.4, front + dist - t * 0.2), look: [frameX(f, px, pz), STAGE_H + 1.25, frameZ(f, px, pz)], fov: 30 }
      }
      case 'wall': {
        // square on to the screen, the presenter small in front of it, easing in
        const k = ease(t / 5)
        const dist = 4 + W * 0.95
        return { pos: w(Math.sin(t * 0.2) * 0.4, cap(lerp(wallMid * 0.9, wallMid * 0.8, k) + 0.4), front + lerp(dist, dist * 0.82, k)), look: w(0, wallMid * 0.92, -D / 2), fov: 34 }
      }
      case 'side': {
        // from low at stage right, across the presenter to the screen
        const k = ease(t / 5)
        return { pos: w(lerp(W * 0.5 + 5, W * 0.45 + 4, k), STAGE_H + 1.8 + scale * 0.5, front + 7 + scale * 2.5), look: w(px * 0.4 - W * 0.1, wallMid * 0.7, -D * 0.2), fov: 32 }
      }
      case 'house': {
        // from the stage out over the house, to see it react
        const k = ease(t / 3)
        return { pos: w(lerp(-W * 0.2, W * 0.2, k), STAGE_H + 2.2 + scale * 0.6, front - 0.3), look: w(0, 1.0, Math.min(back, front + 8 + back * 0.4)), fov: 40 }
      }
      case 'crane': {
        // pulling up and back from the stage to take in the whole house and the screen over it
        const k = ease(t / 5)
        return { pos: w(Math.sin(t * 0.15) * W * 0.3, cap(lerp(STAGE_H + 2, 4 + back * 0.4, k)), lerp(front + 4, back + 3, k)), look: w(0, wallMid * 0.7, 0), fov: 38 }
      }
      case 'orbit':
      default: {
        const a = t * 0.08 + 0.4
        const r = Math.max(back, W) * 0.9 + 6
        return { pos: w(Math.sin(a) * r * 0.6, cap(3 + back * 0.25), Math.cos(a) * r * 0.5 + D), look: w(0, wallMid * 0.6, 0), fov: 38 }
      }
    }
  }
  return { shot, width: W, wallMid }
}

const AIM = new THREE.Vector3()
/** Puts the camera where `shot` says each frame; while it says nothing the view is left to the player. */
export function Director({ shot }: { shot: () => Shot | null }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  useFrame(() => {
    const s = shot()
    if (!s) return
    camera.position.set(s.pos[0], s.pos[1], s.pos[2])
    AIM.set(s.look[0], s.look[1], s.look[2])
    if (controls) controls.target.copy(AIM)
    camera.lookAt(AIM)
    if (s.fov && Math.abs(camera.fov - s.fov) > 0.01) {
      camera.fov += (s.fov - camera.fov) * 0.1
      camera.updateProjectionMatrix()
    }
  })
  return null
}
