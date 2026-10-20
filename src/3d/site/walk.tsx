// Walking a site at eye height: the keys move, the mouse looks round (with
// the pointer locked to the view, or by dragging where the browser will not
// lock it), and walls, furniture and water are in the way while doors and
// openings are not. Entering glides the camera down from where it was to a
// person's eyes on the spot it was looking at; leaving glides it back.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { isHeld } from '../../store/settings'
import type { Nav } from './nav'

/** Eye height, metres. */
export const EYE = 1.62
/** Half the width of a person, for keeping clear of walls. */
export const BODY = 0.3
/** How far beyond the plot one can wander, metres: the pavement and a little of the street. */
const ROAM = 6
const WALK_SPEED = 1.6
const RUN_SPEED = 3.6
/** Seconds the camera takes to come down to eye height, and to go back. */
const GLIDE_IN = 0.85
const GLIDE_OUT = 0.7
/** Field of view while walking: the overview's long lens is far too narrow at eye height. */
const WALK_FOV = 70
const WALK_NEAR = 0.12

/** The eight points round a person's edge, as unit offsets. */
const RIM: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]]

/**
 * Whether a person can stand at a point of the world (x, z): the tile under
 * them is one to stand on, and every tile their body reaches into is joined
 * to it through open floor, a door or an opening, never through a wall.
 * Off the plot is the street, open up to a few metres out.
 */
export function standable(nav: Nav, x: number, z: number, r = BODY): boolean {
  const { w, h } = nav
  const px = x + w / 2
  const py = z + h / 2
  if (px < -ROAM || py < -ROAM || px > w + ROAM || py > h + ROAM) return false
  const ax = Math.floor(px)
  const ay = Math.floor(py)
  const inside = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < w && ty < h
  const floor = (tx: number, ty: number) => !inside(tx, ty) || nav.walk[ty * w + tx] === 1
  /** Whether the edge between tile (tx, ty) and its neighbour (dx, dy) away can be crossed. */
  const cross = (tx: number, ty: number, dx: number, dy: number): boolean => {
    const ex = dx > 0 ? tx + 1 : tx
    const ey = dy > 0 ? ty + 1 : ty
    const side = dx ? 'w' : 'n'
    // both tiles off the plot: the open street
    if (!inside(tx, ty) && !inside(tx + dx, ty + dy)) return true
    // the plot's edges and everything inside it, as the walking map has them
    if (ex < 0 || ey < 0 || ex > w || ey > h) return true
    return nav.pass(ex, ey, side)
  }
  if (!floor(ax, ay)) return false
  for (const [ox, oy] of RIM) {
    const bx = Math.floor(px + ox * r)
    const by = Math.floor(py + oy * r)
    if (bx === ax && by === ay) continue
    if (!floor(bx, by)) return false
    const sx = bx - ax
    const sy = by - ay
    if (sx && sy) {
      // round a corner: either way round will do, as long as the tile passed through is floor too
      const viaX = floor(ax + sx, ay) && cross(ax, ay, sx, 0) && cross(ax + sx, ay, 0, sy)
      const viaY = floor(ax, ay + sy) && cross(ax, ay, 0, sy) && cross(ax, ay + sy, sx, 0)
      if (!viaX && !viaY) return false
    } else if (!cross(ax, ay, sx, sy)) return false
  }
  return true
}

/** Where to start walking from a point the camera was looking at: that spot if one can stand there, else the nearest floor, else the way in. */
export function startAt(nav: Nav, x: number, z: number): [number, number] {
  if (standable(nav, x, z)) return [x, z]
  const tile = nav.tileAt(x, z)
  const near = tile >= 0 ? nav.nearest(tile) : -1
  if (near >= 0 && standable(nav, nav.cx(near), nav.cz(near))) return [nav.cx(near), nav.cz(near)]
  if (nav.entry >= 0) return [nav.cx(nav.entry), nav.cz(nav.entry)]
  return [nav.outside[0], nav.outside[1]]
}

/** Moves a person from (x, z) by (dx, dz), sliding along whatever is in the way. */
export function slide(nav: Nav, x: number, z: number, dx: number, dz: number): [number, number] {
  // long steps are taken in parts, so a fast frame never carries anyone through a wall
  const parts = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1))
  for (let i = 0; i < parts; i++) {
    const sx = dx / parts
    const sz = dz / parts
    if (standable(nav, x + sx, z + sz)) (x += sx), (z += sz)
    else if (sx && standable(nav, x + sx, z)) x += sx
    else if (sz && standable(nav, x, z + sz)) z += sz
  }
  return [x, z]
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const look = new THREE.Euler(0, 0, 0, 'YXZ')
/** Radians of turn for each pixel the mouse moves. */
const LOOK = 0.0024
/** How far up or down the walker can look, short of straight up. */
const PITCH = 1.35
/** Pixels in one mouse event past which it is a glitch (Chrome sends these as the pointer is taken, and now and then besides). */
const SPIKE = 180
/** An angle kept between -pi and pi. */
const wrap = (a: number) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2
/** Take the pointer for looking round: raw movement where the browser offers it, plain pointer lock where not; a drag looks round where neither works. */
function takePointer(dom: HTMLElement) {
  try {
    const raw = (dom.requestPointerLock as unknown as (o?: { unadjustedMovement?: boolean }) => Promise<void> | undefined)?.call(dom, { unadjustedMovement: true })
    raw?.catch?.(() => {
      try {
        ;(dom.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {})
      } catch {
        /* dragging it is */
      }
    })
  } catch {
    /* dragging it is */
  }
}
const aim = new THREE.Quaternion()
const lookAt = new THREE.Matrix4()
const UP = new THREE.Vector3(0, 1, 0)

interface Controls {
  target: THREE.Vector3
  enabled: boolean
  update: () => void
}

/**
 * The walk itself. `on` asks for it; `onActive` says when the camera is the
 * walker's, from the start of the glide down to the end of the glide back;
 * `onLeave` asks the screen to end the walk (Esc, or the pointer let go).
 */
export function Walk({ nav, on, onActive, onLeave }: { nav: Nav; on: boolean; onActive: (active: boolean) => void; onLeave: () => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const dom = useThree((s) => s.gl.domElement)
  const st = useRef({
    phase: 'off' as 'off' | 'in' | 'walk' | 'out',
    t: 0,
    x: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    bob: 0,
    from: new THREE.Vector3(),
    fromQ: new THREE.Quaternion(),
    fov: 30,
    near: 0.4,
    /** Where the overview camera stood, and what it looked at, to go back to. */
    home: new THREE.Vector3(),
    homeAim: new THREE.Vector3(),
    keys: new Set<string>(),
    drag: false,
    /** Mouse movement since the last frame, in pixels: turned into a look once a frame, never smoothed. */
    dx: 0,
    dy: 0,
    /** Mouse events still to ignore: the first ones after the pointer is taken or let go jump. */
    skip: 0,
  })
  const navRef = useRef(nav)
  navRef.current = nav
  const leave = useRef(onLeave)
  leave.current = onLeave
  const active = useRef(onActive)
  active.current = onActive

  // ---- going in and coming out
  useEffect(() => {
    const s = st.current
    if (on && (s.phase === 'off' || s.phase === 'out')) {
      if (s.phase === 'off') {
        s.home.copy(camera.position)
        s.homeAim.copy(controls?.target ?? new THREE.Vector3())
        s.fov = camera.fov
        s.near = camera.near
      }
      const target = controls?.target ?? new THREE.Vector3()
      ;[s.x, s.z] = startAt(navRef.current, target.x, target.z)
      // facing the way the camera faced
      s.yaw = Math.atan2(-(target.x - camera.position.x), -(target.z - camera.position.z))
      s.pitch = 0
      s.from.copy(camera.position)
      s.fromQ.copy(camera.quaternion)
      s.phase = 'in'
      s.t = 0
      if (controls) controls.enabled = false
      active.current(true)
      // the pointer is held by the view while walking; where the browser will not, the mouse looks round by dragging
      takePointer(dom)
    } else if (!on && (s.phase === 'in' || s.phase === 'walk')) {
      s.from.copy(camera.position)
      s.fromQ.copy(camera.quaternion)
      s.phase = 'out'
      s.t = 0
      if (document.pointerLockElement === dom) document.exitPointerLock()
    }
  }, [on, camera, controls, dom])

  // ---- keys and the mouse
  useEffect(() => {
    const s = st.current
    const typing = (e: Event) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }
    const down = (e: KeyboardEvent) => {
      if (s.phase === 'off' || typing(e)) return
      if (e.code === 'Escape') {
        e.preventDefault()
        leave.current()
        return
      }
      s.keys.add(e.code)
      // the walk has the keys: nothing else on the screen acts on them meanwhile
      if (s.phase === 'walk' || s.phase === 'in') e.stopImmediatePropagation()
    }
    const up = (e: KeyboardEvent) => s.keys.delete(e.code)
    const blur = () => s.keys.clear()
    const move = (e: MouseEvent) => {
      if (s.phase !== 'walk' && s.phase !== 'in') return
      if (document.pointerLockElement !== dom && !s.drag) return
      // the first events after the pointer is taken carry the jump to the middle of the screen
      if (s.skip > 0) {
        s.skip--
        return
      }
      const dx = e.movementX || 0
      const dy = e.movementY || 0
      // a single event further than any hand moves in a few milliseconds is the browser's glitch, not the mouse
      if (Math.abs(dx) > SPIKE || Math.abs(dy) > SPIKE) return
      s.dx += dx
      s.dy += dy
    }
    const press = (e: MouseEvent) => {
      if (s.phase !== 'walk' && s.phase !== 'in') return
      if (document.pointerLockElement !== dom) {
        // a click on the view takes the pointer again, if the browser lets it; until then a drag looks round
        s.drag = true
        takePointer(dom)
      }
    }
    const release = () => (s.drag = false)
    let held = false
    const lock = () => {
      const now = document.pointerLockElement === dom
      s.skip = 2
      s.dx = 0
      s.dy = 0
      // the browser let go of the pointer (Esc does that before any key reaches the page): the walk ends with it
      if (held && !now && (s.phase === 'walk' || s.phase === 'in')) leave.current()
      held = now
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    window.addEventListener('mousemove', move)
    dom.addEventListener('mousedown', press)
    window.addEventListener('mouseup', release)
    document.addEventListener('pointerlockchange', lock)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
      window.removeEventListener('mousemove', move)
      dom.removeEventListener('mousedown', press)
      window.removeEventListener('mouseup', release)
      document.removeEventListener('pointerlockchange', lock)
      if (document.pointerLockElement === dom) document.exitPointerLock()
    }
  }, [dom])

  // put the camera back as it was if the view goes away mid-walk
  useEffect(
    () => () => {
      const s = st.current
      if (s.phase === 'off') return
      camera.fov = s.fov
      camera.near = s.near
      camera.updateProjectionMatrix()
      if (controls) controls.enabled = true
    },
    [camera, controls],
  )

  useFrame((_, raw) => {
    const s = st.current
    if (s.phase === 'off') return
    const dt = Math.min(0.05, raw)
    const n = navRef.current

    if (s.phase === 'walk' || s.phase === 'in') {
      const k = s.keys
      // the usual keys, and whatever the camera's own keys have been set to
      const held = (code: string, action: string) => k.has(code) || isHeld(k, action)
      const fwd = (held('KeyW', 'camForward') || k.has('ArrowUp') ? 1 : 0) - (held('KeyS', 'camBack') || k.has('ArrowDown') ? 1 : 0)
      const side = (held('KeyD', 'camRight') || k.has('ArrowRight') ? 1 : 0) - (held('KeyA', 'camLeft') || k.has('ArrowLeft') ? 1 : 0)
      if (s.phase === 'walk' && (fwd || side)) {
        const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED) / Math.hypot(fwd, side)
        const sin = Math.sin(s.yaw)
        const cos = Math.cos(s.yaw)
        const dx = (-sin * fwd + cos * side) * speed * dt
        const dz = (-cos * fwd - sin * side) * speed * dt
        const [nx, nz] = slide(n, s.x, s.z, dx, dz)
        const moved = Math.hypot(nx - s.x, nz - s.z)
        s.x = nx
        s.z = nz
        s.bob += moved * 5.2
      }
    }

    // the look follows the mouse exactly: what moved since the last frame, applied once
    if (s.dx || s.dy) {
      s.yaw = wrap(s.yaw - s.dx * LOOK)
      s.pitch = THREE.MathUtils.clamp(s.pitch - s.dy * LOOK, -PITCH, PITCH)
      s.dx = 0
      s.dy = 0
    }
    if (import.meta.env.DEV) (window as unknown as { sbWalk?: unknown }).sbWalk = { yaw: s.yaw, pitch: s.pitch, phase: s.phase }
    look.set(s.pitch, s.yaw, 0)
    aim.setFromEuler(look)
    const eyeY = EYE + Math.sin(s.bob) * 0.025

    if (s.phase === 'walk') {
      camera.position.set(s.x, eyeY, s.z)
      camera.quaternion.copy(aim)
    } else if (s.phase === 'in') {
      s.t = Math.min(1, s.t + dt / GLIDE_IN)
      const e = ease(s.t)
      camera.position.lerpVectors(s.from, new THREE.Vector3(s.x, eyeY, s.z), e)
      camera.quaternion.slerpQuaternions(s.fromQ, aim, e)
      camera.fov = THREE.MathUtils.lerp(s.fov, WALK_FOV, e)
      camera.near = THREE.MathUtils.lerp(s.near, WALK_NEAR, Math.min(1, e * 4))
      camera.updateProjectionMatrix()
      if (s.t >= 1) s.phase = 'walk'
    } else if (s.phase === 'out') {
      s.t = Math.min(1, s.t + dt / GLIDE_OUT)
      const e = ease(s.t)
      lookAt.lookAt(s.home, s.homeAim, UP)
      const back = new THREE.Quaternion().setFromRotationMatrix(lookAt)
      camera.position.lerpVectors(s.from, s.home, e)
      camera.quaternion.slerpQuaternions(s.fromQ, back, e)
      camera.fov = THREE.MathUtils.lerp(WALK_FOV, s.fov, e)
      camera.near = THREE.MathUtils.lerp(WALK_NEAR, s.near, e)
      camera.updateProjectionMatrix()
      if (s.t >= 1) {
        s.phase = 'off'
        s.keys.clear()
        camera.position.copy(s.home)
        camera.fov = s.fov
        camera.near = s.near
        camera.updateProjectionMatrix()
        if (controls) {
          controls.target.copy(s.homeAim)
          controls.enabled = true
          controls.update()
        }
        active.current(false)
      }
    }
  })
  return null
}
