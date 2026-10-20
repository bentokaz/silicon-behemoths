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
  // upstairs, off the plot is a drop like any open part of the floor
  const floor = (tx: number, ty: number) => (!inside(tx, ty) ? !nav.upstairs : nav.walk[ty * w + tx] === 1)
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
    else {
      // caught on a door frame or a corner: ease sideways toward the middle of the way through, so a doorway funnels rather than snags
      const step = Math.hypot(sx, sz)
      if (Math.abs(sx) > Math.abs(sz)) {
        const mid = Math.floor(z + nav.h / 2) + 0.5 - nav.h / 2
        const nz = z + Math.sign(mid - z) * Math.min(Math.abs(mid - z), step)
        if (nz !== z && standable(nav, x, nz)) z = nz
      } else {
        const mid = Math.floor(x + nav.w / 2) + 0.5 - nav.w / 2
        const nx = x + Math.sign(mid - x) * Math.min(Math.abs(mid - x), step)
        if (nx !== x && standable(nav, nx, z)) x = nx
      }
    }
  }
  return [x, z]
}

/** How close the walker comes to anyone else, metres between the two. */
const PERSON = 0.5
/** Metres from one storey's floor to the next (the view's STOREY). */
const STOREY_H = 3
/** Metres a second up or down a flight of stairs; an escalator carries you a little slower and steadier. */
const CLIMB_SPEED = 1.3

/**
 * A flight of stairs or an escalator, as the walker meets it: its middle,
 * the way it rises (a unit vector on the plot), half its length and its
 * width. `up` flights rise from the floor being walked; the others come up
 * into it from the floor below, and are gone down.
 */
export interface Flight {
  id: string
  kind: string
  cx: number
  cz: number
  dx: number
  dz: number
  half: number
  width: number
  up: boolean
}
/** A lift door on the floor being walked, and the floors its shaft stops at. */
export interface LiftStop {
  x: number
  z: number
  floors: number[]
}
/** Where a point is against a flight: along it from its middle toward the top, and across it. */
const onFlight = (f: Flight, x: number, z: number): [number, number] => [(x - f.cx) * f.dx + (z - f.cz) * f.dz, -(x - f.cx) * f.dz + (z - f.cz) * f.dx]
const inFlight = (f: Flight, x: number, z: number, pad = 0) => {
  const [a, c] = onFlight(f, x, z)
  return Math.abs(a) <= f.half + pad && Math.abs(c) <= f.width / 2 + pad
}
/** Says which floor a number key picks: 0 the ground floor. */
const floorWord = (n: number) => (n ? `floor ${n}` : 'the ground floor')

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
export function Walk({ nav, on, onActive, onLeave, floor = 0, flights = [], lifts = [], onFloor, onHint, crowd }: {
  nav: Nav
  on: boolean
  onActive: (active: boolean) => void
  onLeave: () => void
  /** The storey being walked, 0 the ground floor. */
  floor?: number
  flights?: Flight[]
  lifts?: LiftStop[]
  /** Asks the view to show another storey: the walker has gone up or down. */
  onFloor?: (floor: number) => void
  /** A line for the screen to show while walking: what a key does here. */
  onHint?: (text: string | null) => void
  /** The people about: told where the walker is, so they step round them. */
  crowd?: { setWalker(at: { x: number; z: number; yaw: number } | null): void; blocks(x: number, z: number, r: number): boolean } | null
}) {
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
    /** Height of the floor underfoot. */
    base: 0,
    /** On a flight: from where to where, with the height at each end, and how far along. */
    climb: null as null | { pts: [number, number, number][]; t: number; len: number; to: number },
    /** The flight just come off: nothing happens on it again until the walker has stepped clear of it. */
    guard: '',
    /** The lift's floor list is showing. */
    menu: false,
    hint: '' as string,
  })
  const crowdRef = useRef(crowd)
  crowdRef.current = crowd
  const flightsRef = useRef(flights)
  flightsRef.current = flights
  const liftsRef = useRef(lifts)
  liftsRef.current = lifts
  const floorRef = useRef(floor)
  floorRef.current = floor
  const toFloor = useRef(onFloor)
  toFloor.current = onFloor
  const hintRef = useRef(onHint)
  hintRef.current = onHint
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
      // not inside someone: the nearest clear place round about
      const cr = crowdRef.current
      if (cr?.blocks(s.x, s.z, PERSON)) {
        for (let k = 0; k < 24; k++) {
          const a2 = k * 2.4
          const d = 0.7 + Math.floor(k / 8) * 0.7
          const tx = s.x + Math.cos(a2) * d
          const tz = s.z + Math.sin(a2) * d
          if (standable(navRef.current, tx, tz) && !cr.blocks(tx, tz, PERSON)) {
            s.x = tx
            s.z = tz
            break
          }
        }
      }
      s.base = floorRef.current * STOREY_H
      s.climb = null
      s.menu = false
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
      if (s.phase === 'walk' && e.code === 'KeyE') {
        const lift = nearLift()
        s.menu = !!lift && !s.menu
      } else if (s.phase === 'walk' && s.menu && /^(Digit|Numpad)\d$/.test(e.code)) {
        const n = Number(e.code.slice(-1))
        const lift = nearLift()
        if (lift && lift.floors.includes(n) && n !== floorRef.current) {
          // the doors close, and open on the floor asked for
          s.base = n * STOREY_H
          s.x = lift.x
          s.z = lift.z
          s.guard = ''
          toFloor.current?.(n)
        }
        s.menu = false
      }
      // the walk has the keys: nothing else on the screen acts on them meanwhile
      if (s.phase === 'walk' || s.phase === 'in') e.stopImmediatePropagation()
    }
    const nearLift = () => liftsRef.current.find((l) => Math.hypot(l.x - s.x, l.z - s.z) < 1.4)
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
      // off a flight and somewhere no one can stand (a lift door onto furniture, the floor changed under them): onto the nearest floor
      if (!s.climb && s.phase === 'walk' && Math.round(s.base / STOREY_H) === floorRef.current && !standable(n, s.x, s.z)) [s.x, s.z] = startAt(n, s.x, s.z)
      if (s.climb) {
        // on a flight: carried along it, up or down, at a steady pace; the keys wait until the far end
        const c = s.climb
        c.t = Math.min(c.len, c.t + CLIMB_SPEED * dt)
        let d = c.t
        for (let i = 1; i < c.pts.length; i++) {
          const [ax, ay, az] = c.pts[i - 1]
          const [bx, by, bz] = c.pts[i]
          const seg = Math.hypot(bx - ax, bz - az) || 1e-6
          if (d <= seg || i === c.pts.length - 1) {
            const u = Math.min(1, d / seg)
            s.x = ax + (bx - ax) * u
            s.z = az + (bz - az) * u
            s.base = ay + (by - ay) * u
            break
          }
          d -= seg
        }
        s.bob += CLIMB_SPEED * dt * 5.2
        if (c.t >= c.len) {
          s.climb = null
          s.base = c.to * STOREY_H
          toFloor.current?.(c.to)
        }
      } else if (s.phase === 'walk' && (fwd || side) && Math.round(s.base / STOREY_H) === floorRef.current) {
        const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED) / Math.hypot(fwd, side)
        const sin = Math.sin(s.yaw)
        const cos = Math.cos(s.yaw)
        const dx = (-sin * fwd + cos * side) * speed * dt
        const dz = (-cos * fwd - sin * side) * speed * dt
        // stepping onto a flight: up the stairs from their foot, or down them from the floor they come up into
        const ahead = Math.max(0.35, Math.hypot(dx, dz) * 4)
        const mx = dx / (Math.hypot(dx, dz) || 1)
        const mz = dz / (Math.hypot(dx, dz) || 1)
        const at = floorRef.current * STOREY_H
        for (const f of flightsRef.current) {
          if (f.id.slice(1) === s.guard) continue
          const tx = s.x + mx * ahead
          const tz = s.z + mz * ahead
          if (!inFlight(f, tx, tz) || inFlight(f, s.x, s.z, -0.05)) continue
          const along = mx * f.dx + mz * f.dz
          if (f.up && along > 0.35) {
            const foot: [number, number, number] = [f.cx - f.dx * f.half, at, f.cz - f.dz * f.half]
            const top: [number, number, number] = [f.cx + f.dx * (f.half - 0.5), at + STOREY_H, f.cz + f.dz * (f.half - 0.5)]
            // and on a step past the top, off the stairwell (snapped back to the nearest floor if there is none there)
            const off: [number, number, number] = [f.cx + f.dx * (f.half + 0.5), at + STOREY_H, f.cz + f.dz * (f.half + 0.5)]
            const pts: [number, number, number][] = [[s.x, at, s.z], foot, top, off]
            s.climb = { pts, t: 0, len: Math.hypot(foot[0] - s.x, foot[2] - s.z) + Math.hypot(top[0] - foot[0], top[2] - foot[2]) + 1, to: floorRef.current + 1 }
            s.guard = f.id.slice(1)
            break
          }
          if (!f.up && along < -0.2) {
            const top: [number, number, number] = [f.cx + f.dx * (f.half - 0.5), at, f.cz + f.dz * (f.half - 0.5)]
            const out: [number, number, number] = [f.cx - f.dx * (f.half + 0.5), at - STOREY_H, f.cz - f.dz * (f.half + 0.5)]
            const pts: [number, number, number][] = [[s.x, at, s.z], top, out]
            s.climb = { pts, t: 0, len: Math.hypot(top[0] - s.x, top[2] - s.z) + Math.hypot(out[0] - top[0], out[2] - top[2]), to: floorRef.current - 1 }
            s.guard = f.id.slice(1)
            break
          }
        }
        if (s.climb) return
        // clear of the flight just come off: it can be taken again
        if (s.guard && !flightsRef.current.some((f) => f.id.slice(1) === s.guard && inFlight(f, s.x, s.z, BODY))) s.guard = ''
        let [nx, nz] = slide(n, s.x, s.z, dx, dz)
        // people are in the way as walls are: the walker stops short rather than walking into someone (but can always step away)
        if (crowd && crowd.blocks(nx, nz, PERSON) && !crowd.blocks(s.x, s.z, PERSON)) [nx, nz] = [s.x, s.z]
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
    if (import.meta.env.DEV) Object.assign(window, { sbWalk: { yaw: s.yaw, pitch: s.pitch, phase: s.phase, x: s.x, z: s.z, base: s.base, floor: floorRef.current, climbing: !!s.climb, flights: flightsRef.current.length, lifts: liftsRef.current.length }, sbWalkGo: (x: number, z: number, yaw: number) => ((s.x = x), (s.z = z), (s.yaw = yaw)) })
    look.set(s.pitch, s.yaw, 0)
    aim.setFromEuler(look)
    const eyeY = s.base + EYE + Math.sin(s.bob) * 0.025
    crowd?.setWalker(s.phase === 'walk' && !s.climb ? { x: s.x, z: s.z, yaw: s.yaw } : null)
    // what a key does here, for the screen to say
    if (s.phase === 'walk') {
      const lift = liftsRef.current.find((l) => Math.hypot(l.x - s.x, l.z - s.z) < 1.4)
      if (!lift && s.menu) s.menu = false
      const hint = s.climb ? '' : s.menu && lift ? `Lift: press ${lift.floors.filter((f) => f !== floorRef.current).map((f) => `${f} for ${floorWord(f)}`).join(', ')}` : lift ? 'E: call the lift' : ''
      if (hint !== s.hint) {
        s.hint = hint
        hintRef.current?.(hint || null)
      }
    }

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
