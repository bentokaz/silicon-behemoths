// The canvas every 3D view is drawn in. It is the ordinary one, with the
// things that go wrong around it looked after: a browser with 3D graphics
// turned off, a graphics driver that drops the picture, a scene that throws,
// and a window dragged to a screen with a different pixel density. None of
// them is allowed to leave a black rectangle: the player is told what
// happened in plain words and given a way to try again, and the rest of the
// game goes on working.
import { Canvas, type CanvasProps, useFrame, useThree } from '@react-three/fiber'
import { Component, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type * as THREE from 'three'
import { useSettings } from '../store/settings'
import { Meter, Pace, Sharpener, fence, isSoftwareRenderer, lostCopy, sweep } from './canvasHelp'

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

interface Disposable {
  dispose(): void
}

/**
 * Lets go of everything a scene was drawn with. Shapes, materials and
 * pictures are shared between views and kept for the next one (a desk is
 * built once, not once per visit), and the renderer leaves a note on each one
 * it has drawn so that it can clean up after it. Those notes point back at the
 * renderer: unless they are taken off, every view ever opened stays in memory
 * for good, canvas, scene and all, behind the things it shared. Disposing
 * them takes the notes off; what is shared is simply sent to the graphics
 * card again by whichever view draws it next.
 */
function releaseScene(scene: THREE.Scene, gl: THREE.WebGLRenderer) {
  const held = new Set<Disposable>()
  const keep = (v: unknown) => {
    if (v && typeof (v as Disposable).dispose === 'function') held.add(v as Disposable)
  }
  const material = (m: THREE.Material | undefined) => {
    if (!m) return
    keep(m)
    for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture) keep(v)
    const uniforms = (m as THREE.ShaderMaterial).uniforms
    if (uniforms) for (const u of Object.values(uniforms)) if (u?.value && (u.value as THREE.Texture).isTexture) keep(u.value)
    // and the pictures the renderer itself hands every material: its lighting table is one shared by every renderer
    // there has ever been, and is the note that kept each of them alive
    const drawn = (gl.properties.get(m) as { uniforms?: Record<string, { value: unknown }> } | undefined)?.uniforms
    if (drawn) for (const u of Object.values(drawn)) if (u?.value && (u.value as THREE.Texture).isTexture) keep(u.value)
  }
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    keep(mesh.geometry)
    if (Array.isArray(mesh.material)) mesh.material.forEach(material)
    else material(mesh.material)
    if ((o as THREE.InstancedMesh).isInstancedMesh) keep(o)
    const light = o as THREE.DirectionalLight
    if (light.isLight && light.shadow) keep(light.shadow)
  })
  if ((scene.background as THREE.Texture | null)?.isTexture) keep(scene.background)
  if (scene.environment) keep(scene.environment)
  // once the view has finished coming down (it draws no more frames)
  window.setTimeout(() => {
    for (const r of held) {
      try {
        r.dispose()
      } catch {
        /* already gone */
      }
    }
  }, 0)
}

/**
 * The shading laid over a finished picture (see the views' EffectComposer) is
 * drawn with shapes and materials of its own that are in no scene: the one
 * triangle that covers the screen is shared by every view there has ever
 * been, and held each of them in memory in the same way. This finds what the
 * shading holds and lets go of it when the view that used it closes. Pass the
 * returned function as the composer's `ref`.
 */
export function useShadingRelease(): (composer: unknown) => void {
  const last = useRef<unknown>(null)
  useLayoutEffect(
    () => () => {
      const held = new Set<Disposable>()
      const seen = new Set<object>()
      const walk = (v: unknown, depth: number) => {
        if (!v || typeof v !== 'object' || depth > 5 || seen.has(v) || ArrayBuffer.isView(v)) return
        seen.add(v)
        const o = v as Record<string, unknown> & Partial<Disposable>
        // the view's own scene, camera and renderer are not the shading's to let go of
        if (o.isWebGLRenderer || o.isScene || o.isCamera || (typeof Element !== 'undefined' && v instanceof Element)) return
        if ((o.isBufferGeometry || o.isMaterial || o.isTexture || o.isRenderTarget || o.isWebGLRenderTarget) && typeof o.dispose === 'function') held.add(o as Disposable)
        if (Array.isArray(v)) {
          for (let i = 0; i < Math.min(v.length, 64); i++) walk(v[i], depth + 1)
          return
        }
        for (const k of Object.keys(o)) walk(o[k], depth + 1)
      }
      walk(last.current, 0)
      last.current = null
      window.setTimeout(() => {
        for (const r of held) {
          try {
            r.dispose()
          } catch {
            /* already gone */
          }
        }
      }, 0)
    },
    [],
  )
  return useCallback((composer: unknown) => {
    // kept even after the shading is switched off: what it shared still points at this view's renderer
    if (composer) last.current = composer
  }, [])
}

/** Placed first in every canvas, so that it is the first thing taken down, while the scene is still whole. */
function Release() {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => () => releaseScene(scene, gl), [scene, gl])
  return null
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
function ContextWatch({ onLost, onBack, onReady, onSoftware, pose }: { onLost: () => void; onBack: () => void; onReady: () => void; onSoftware: () => void; pose: { current: Pose | null } }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    try {
      const ctx = gl.getContext()
      const info = ctx.getExtension('WEBGL_debug_renderer_info')
      const name = String(info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER))
      if (isSoftwareRenderer(name)) onSoftware()
    } catch {
      /* a browser that will not say is taken at its word */
    }
  }, [gl, onSoftware])
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
function DensityWatch({ dpr, adaptive, onRatio }: { dpr: CanvasProps['dpr']; adaptive: boolean; onRatio: (ratio: number) => void }) {
  const apply = useCallback(() => onRatio(ratioFor(dpr, adaptive)), [onRatio, dpr, adaptive])
  useEffect(() => {
    apply()
    if (typeof window.matchMedia !== 'function') return
    let query: MediaQueryList | null = null
    const watch = () => {
      query?.removeEventListener('change', changed)
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      query.addEventListener('change', changed)
    }
    const changed = () => {
      apply()
      watch()
    }
    watch()
    return () => query?.removeEventListener('change', changed)
  }, [apply])
  // a window made much smaller (or bigger) is a different amount of work: what was learned for the old size is dropped
  const area = useThree((s) => s.size.width * s.size.height)
  const learnedAt = useRef(area)
  useEffect(() => {
    if (!adaptive || sharp.now === 1 || Math.abs(area - learnedAt.current) < learnedAt.current * 0.2) return
    learnedAt.current = area
    sharp.reset()
    apply()
  }, [area, adaptive, apply])
  // a computer that cannot keep up at full sharpness is given a slightly softer picture rather than a slow one
  const meter = useMemo(() => new Meter(), [])
  useFrame((_, dt) => {
    if (!adaptive || document.hidden) return
    const average = meter.frame(dt)
    if (average === null) return
    if (!sharp.feed(average)) return
    learnedAt.current = area
    apply()
  })
  return null
}

/**
 * How sharply the views that adapt are being drawn, 0.6 to 1. It is learned
 * once and kept from one view to the next, so that each building opened does
 * not start sharp and slow and work its way down again; a change of quality
 * setting starts it afresh.
 */
const sharp = new Sharpener()
/** Pixels drawn per pixel of page: the screen's own density, held within the range a view asks for, less whatever has been given up for speed. */
function ratioFor(dpr: CanvasProps['dpr'], adaptive: boolean): number {
  const low = Array.isArray(dpr) ? dpr[0] : (dpr ?? 1)
  const high = Array.isArray(dpr) ? dpr[1] : (dpr ?? 1)
  const full = Math.min(high, Math.max(low, (typeof window !== 'undefined' && window.devicePixelRatio) || 1))
  return +(adaptive ? full * sharp.now : full).toFixed(3)
}
useSettings.subscribe((now, was) => {
  if (now.settings.quality !== was.settings.quality) sharp.reset()
})

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
/** Set once the player has put the note about software drawing away: it is not shown again this visit. */
let softwareTold = false
/** How long a view that has room on screen may take to start before it is called a failure. */
const START_WITHIN_MS = 6000

export function SafeCanvas({ children, dpr, what = '3D view', adaptive = false, ...rest }: CanvasProps & { what?: string; /** Draw a little less sharply when frames run long, rather than slowly. */ adaptive?: boolean }) {
  const [able, setAble] = useState(() => webglAvailable())
  // the canvas is told one figure, and told again when it changes: left to work it out itself, it would go back to full
  // sharpness every time the view around it was drawn again
  const [ratio, setRatio] = useState(() => ratioFor(dpr, adaptive))
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
  // a browser drawing 3D on the processor alone manages a frame or two a second, whatever the settings: say why
  const [software, setSoftware] = useState(false)
  const onSoftware = useCallback(() => {
    if (!softwareTold) setSoftware(true)
  }, [])
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
          <Canvas dpr={ratio} {...rest}>
            <Release />
            <ContextWatch onLost={onLost} onBack={onBack} onReady={onReady} onSoftware={onSoftware} pose={pose} />
            <DensityWatch dpr={dpr} adaptive={adaptive} onRatio={setRatio} />
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
      {software && !broke && !lost && (
        <div className="absolute inset-x-0 bottom-0 z-[4] flex items-start gap-3 border-t border-warn bg-panel/95 px-3 py-2 text-[11px] leading-snug text-warn" role="status">
          <span className="min-w-0 flex-1">
            This browser is drawing 3D without the graphics card, so the {what} will be slow whatever the quality setting. Turn on hardware acceleration in the browser's settings and restart it, or try another browser. The rest of the game is not affected.
          </span>
          <button
            type="button"
            onClick={() => {
              softwareTold = true
              setSoftware(false)
            }}
            className="shrink-0 border border-warn px-2 py-[2px] uppercase tracking-wider hover:bg-warn/10"
          >
            Hide
          </button>
        </div>
      )}
      {lost && !broke && (
        <Notice title={copy.lostTitle} action="Bring it back now" onAction={retry}>
          <p className="text-fg">{copy.lost}</p>
        </Notice>
      )}
    </div>
  )
}
