// The canvas every 3D view is drawn in. It is the ordinary one, with the
// things that go wrong around it looked after: a browser with 3D graphics
// turned off, a graphics driver that drops the picture, a scene that throws,
// and a window dragged to a screen with a different pixel density. None of
// them is allowed to leave a black rectangle: the player is told what
// happened in plain words and given a way to try again, and the rest of the
// game goes on working.
import { Canvas, type CanvasProps, useFrame, useThree } from '@react-three/fiber'
import { Component, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type * as THREE from 'three'
import { useSettings } from '../store/settings'
import { Pace, fence, lostCopy, sweep } from './canvasHelp'

let known: boolean | null = null
/** Whether this browser can draw 3D at all. Asked once; asked again only after it has said no. */
export function webglAvailable(again = false): boolean {
  if (known && !again) return true
  if (known === false && !again) return false
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null
    known = !!gl
    // hand the context straight back: a browser allows only a handful at a time
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    known = false
  }
  return known
}

function Notice({ title, children, action, onAction }: { title: string; children: ReactNode; action?: string; onAction?: () => void }) {
  return (
    <div className="absolute inset-0 z-[5] flex items-center justify-center bg-bg/90 p-4" role="alert">
      <div className="w-[420px] max-w-full border border-line2 bg-panel">
        <div className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-warn">{title}</div>
        <div className="space-y-2 p-3 text-[11px] leading-relaxed text-dim">
          {children}
          {action && (
            <button type="button" onClick={onAction} className="mt-1 border border-accent bg-raise px-3 py-[5px] text-[10px] font-semibold uppercase tracking-wider text-fg hover:bg-accent/15">
              {action}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Catches a scene that throws while it is being put together or drawn. */
class SceneGuard extends Component<{ children: ReactNode; onError: (e: Error) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error) {
    this.props.onError(error)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** Where a camera stood and what it looked at, kept while its view is rebuilt. */
interface Pose {
  position: [number, number, number]
  target: [number, number, number]
}

/**
 * Tells the canvas that it has started, and when its picture is lost and when
 * the browser is ready to draw again. A view rebuilt after a loss is given the
 * camera it had, so the player is looking at the same thing when it returns.
 */
function ContextWatch({ onLost, onBack, onReady, pose }: { onLost: () => void; onBack: () => void; onReady: () => void; pose: { current: Pose | null } }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  useEffect(() => onReady(), [onReady])
  useEffect(() => {
    const kept = pose.current
    if (!kept || !controls) return
    pose.current = null
    camera.position.set(...kept.position)
    controls.target.set(...kept.target)
    controls.update()
  }, [camera, controls, pose])
  useEffect(() => {
    const el = gl.domElement
    const lost = (e: Event) => {
      // without this the browser never offers the picture back
      e.preventDefault()
      if (controls) pose.current = { position: camera.position.toArray(), target: controls.target.toArray() }
      onLost()
    }
    el.addEventListener('webglcontextlost', lost)
    el.addEventListener('webglcontextrestored', onBack)
    return () => {
      el.removeEventListener('webglcontextlost', lost)
      el.removeEventListener('webglcontextrestored', onBack)
    }
  }, [gl, camera, controls, onLost, onBack, pose])
  return null
}

/**
 * Keeps the picture as sharp as the screen it is on. The canvas works out how
 * many pixels to draw when it is made; dragged to a screen of another
 * density, or with the page zoomed, it has to be told to work it out again.
 */
function DensityWatch({ dpr }: { dpr: CanvasProps['dpr'] }) {
  const setDpr = useThree((s) => s.setDpr)
  const low = Array.isArray(dpr) ? dpr[0] : (dpr ?? 1)
  const high = Array.isArray(dpr) ? dpr[1] : (dpr ?? 1)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    let query: MediaQueryList | null = null
    const watch = () => {
      query?.removeEventListener('change', changed)
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      query.addEventListener('change', changed)
    }
    const changed = () => {
      setDpr([low, high])
      watch()
    }
    watch()
    return () => query?.removeEventListener('change', changed)
  }, [setDpr, low, high])
  return null
}

/**
 * Slowly circles the camera round what it looks at, a set number of degrees
 * a second whatever the screen's refresh rate. (The controls' own
 * auto-rotation turns a fixed step each frame, so it runs nearly three times
 * as fast on a 165 Hz screen as on a 60 Hz one.)
 */
export function AutoTurn({ speed }: { speed: number }) {
  const controls = useThree((s) => s.controls) as unknown as (THREE.EventDispatcher<{ start: object; end: object }> & { target: THREE.Vector3; update: () => void }) | null
  const camera = useThree((s) => s.camera)
  /** The player has hold of the camera: it is theirs until they let go. */
  const held = useRef(false)
  useEffect(() => {
    if (!controls) return
    const start = () => (held.current = true)
    const end = () => (held.current = false)
    controls.addEventListener('start', start)
    controls.addEventListener('end', end)
    return () => {
      controls.removeEventListener('start', start)
      controls.removeEventListener('end', end)
    }
  }, [controls])
  useFrame((_, dt) => {
    if (!controls || held.current) return
    // the same way round as the controls' own auto-rotation turned
    sweep(camera.position, controls.target, -speed, dt)
    controls.update()
  })
  return null
}

/**
 * Keeps the camera over the place it is showing. Dragging and zooming toward
 * the pointer both move the point the camera looks at; left alone, it can be
 * carried off across the countryside or under the ground until the site is
 * lost. The point is held within `span` of the middle and between the ground
 * and `top`, and the camera is moved with it so the view does not swing.
 */
export function CameraFence({ span, top }: { span: number; top: number }) {
  const controls = useThree((s) => s.controls) as unknown as (THREE.EventDispatcher<{ change: object }> & { target: THREE.Vector3 }) | null
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    if (!controls) return
    const keep = () => {
      const t = controls.target
      const was = { x: t.x, y: t.y, z: t.z }
      if (!fence(t, span, top)) return
      camera.position.x += t.x - was.x
      camera.position.y += t.y - was.y
      camera.position.z += t.z - was.z
    }
    controls.addEventListener('change', keep)
    return () => controls.removeEventListener('change', keep)
  }, [controls, camera, span, top])
  return null
}

// ---------------------------------------------------------------- keeping up

const strain = { on: false, subs: new Set<() => void>() }
const setStrain = (on: boolean) => {
  if (strain.on === on) return
  strain.on = on
  for (const f of strain.subs) f()
}
// a change of quality setting is a fresh start: what was too much before may not be now
useSettings.subscribe((now, was) => {
  if (now.settings.quality !== was.settings.quality) setStrain(false)
})
/**
 * True once this computer has shown that it cannot keep up with the optional
 * shading at the middle quality setting. Views that have something optional
 * to give up read this, and put a StrainWatch in their canvas while they are
 * still spending it.
 */
export const useStrain = () =>
  useSyncExternalStore(
    (f) => {
      strain.subs.add(f)
      return () => strain.subs.delete(f)
    },
    () => strain.on,
  )

/** Times the frames of the canvas it is in, and raises the strain flag when they run long (under about 46 a second). */
export function StrainWatch() {
  const pace = useMemo(() => new Pace(), [])
  useFrame((_, dt) => {
    if (!document.hidden && pace.frame(dt)) setStrain(true)
  })
  return null
}

/** How long a lost picture is waited for before the view is rebuilt from scratch. */
const REBUILD_AFTER_MS = 2500
/** How long a view that has room on screen may take to start before it is called a failure. */
const START_WITHIN_MS = 6000

export function SafeCanvas({ children, dpr, what = '3D view', ...rest }: CanvasProps & { what?: string }) {
  const [able, setAble] = useState(() => webglAvailable())
  const [attempt, setAttempt] = useState(0)
  const [lost, setLost] = useState(false)
  const [broke, setBroke] = useState<Error | null>(null)
  /** Times the view has been rebuilt on its own after a lost picture: after a couple, the player is asked instead. */
  const rebuilt = useRef(0)
  const retry = useCallback(() => {
    setBroke(null)
    setLost(false)
    setAble(webglAvailable(true))
    setAttempt((n) => n + 1)
  }, [])
  const pose = useRef<Pose | null>(null)
  const onLost = useCallback(() => setLost(true), [])
  // the browser can draw again. What was drawn into textures before the loss (the surroundings that light every
  // surface, the shadows) is gone for good, so the view is not patched up: it is built again, whole
  const onBack = retry
  useEffect(() => {
    if (!lost) return
    // a browser that does not offer the picture back within a moment is not waited for: a fresh canvas gets a fresh one
    const id = window.setTimeout(() => {
      if (rebuilt.current >= 3) return
      rebuilt.current++
      retry()
    }, REBUILD_AFTER_MS)
    return () => window.clearTimeout(id)
  }, [lost, retry])
  // a view that has stayed up for a while has earned its retries back
  useEffect(() => {
    if (lost || broke) return
    const id = window.setTimeout(() => (rebuilt.current = 0), 20000)
    return () => window.clearTimeout(id)
  }, [lost, broke, attempt])

  // a browser that offers 3D can still refuse to start one more view (too many open, or the driver gone): the canvas
  // then never calls back and would stay blank for good, so a view that has room on screen but has not started is told so
  const box = useRef<HTMLDivElement>(null)
  const ready = useRef(false)
  const onReady = useCallback(() => {
    ready.current = true
  }, [])
  useEffect(() => {
    if (!able || broke) return
    ready.current = false
    let waited = 0
    const id = window.setInterval(() => {
      const el = box.current
      if (ready.current) return window.clearInterval(id)
      // a view that is not on screen (no room, or the tab hidden) is not started at all: that is not a failure
      if (!el || el.clientWidth < 2 || el.clientHeight < 2 || document.hidden) return
      waited += 500
      if (waited >= START_WITHIN_MS) {
        window.clearInterval(id)
        setBroke(new Error('The browser did not start the 3D view.'))
      }
    }, 500)
    return () => window.clearInterval(id)
  }, [able, broke, attempt])

  const copy = lostCopy(what)
  if (!able) {
    return (
      <div className="relative h-full w-full bg-bg" data-3d="unavailable">
        <Notice title={copy.offTitle} action="Try again" onAction={retry}>
          <p className="text-fg">{copy.off}</p>
          <p>{copy.offHelp}</p>
        </Notice>
      </div>
    )
  }
  return (
    <div ref={box} className="relative h-full w-full" data-3d={broke ? 'broken' : lost ? 'lost' : 'ok'} onContextMenu={(e) => e.preventDefault()}>
      {!broke && (
        <SceneGuard key={attempt} onError={setBroke}>
          <Canvas dpr={dpr} {...rest}>
            <ContextWatch onLost={onLost} onBack={onBack} onReady={onReady} pose={pose} />
            <DensityWatch dpr={dpr} />
            {children}
          </Canvas>
        </SceneGuard>
      )}
      {broke && (
        <Notice title={copy.brokeTitle} action="Try again" onAction={retry}>
          <p className="text-fg">{copy.broke}</p>
          <p className="num break-words text-[10px] text-faint">{broke.message.slice(0, 200)}</p>
        </Notice>
      )}
      {lost && !broke && (
        <Notice title={copy.lostTitle} action="Bring it back now" onAction={retry}>
          <p className="text-fg">{copy.lost}</p>
        </Notice>
      )}
    </div>
  )
}
