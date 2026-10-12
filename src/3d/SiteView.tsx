// The door to the 3D view of a site. The view itself (SiteScene) and the 3D
// library under it are well over a megabyte of script; this file is the few
// lines the rest of the game needs in order to show one. Keeping the two
// apart means the menu, which reaches this file through the screens it
// shares parts with, no longer waits for all of that before it can appear:
// the scene is fetched in the background a moment after the page opens, and
// is there by the time anyone asks for it.
//
// It also keeps a mark over the view until the view has really drawn: the
// script may still be on its way, the scene takes a second or more to build,
// and the first frame waits on the graphics card compiling every material.
// All of that used to be a black rectangle.
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../components/icons'
import type { SiteViewProps } from './SiteScene'

export { seatOwners } from './site/seats'
export type { Target } from './site/pick'
export type { AreaNote, AreaShape, Edge, EdgeRun, MonthFigures, ResearchNow, RunInfo, ShowState, SiteLife, SiteTool, SiteViewProps } from './SiteScene'

const load = () => import('./SiteScene').then((m) => ({ default: m.SiteScene }))
const Scene = lazy(load)

// fetch the scene while the player is still reading the menu, without holding the menu up for it
if (typeof window !== 'undefined') window.setTimeout(() => void load().catch(() => {}), 1200)

/** The longest the mark waits for a first frame before it gets out of the way of whatever is there. */
const MARK_MS = 20000

const WHAT: Record<string, string> = { office: 'campus', factory: 'factory', store: 'store', venue: 'venue' }

export function SiteView(props: SiteViewProps) {
  const [drawn, setDrawn] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const onDrawn = useCallback(() => setDrawn(true), [])
  useEffect(() => {
    if (drawn) return
    // a view that cannot start says so itself (no 3D in this browser, or it broke): the mark must not sit on top of that
    const watch = window.setInterval(() => box.current?.querySelector('[data-3d="unavailable"], [data-3d="broken"]') && setDrawn(true), 300)
    const give = window.setTimeout(() => setDrawn(true), MARK_MS)
    return () => (window.clearInterval(watch), window.clearTimeout(give))
  }, [drawn])
  return (
    <div ref={box} className="relative h-full w-full">
      <Suspense fallback={null}>
        <Scene {...props} onDrawn={onDrawn} />
      </Suspense>
      {!drawn && (
        <div role="status" data-3d-mark className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-carbon">
          <Icon name="layers" size={22} className="text-line2" />
          <span className="text-[11px] text-faint">Drawing the {WHAT[props.site.kind] ?? 'view'}</span>
        </div>
      )}
    </div>
  )
}
