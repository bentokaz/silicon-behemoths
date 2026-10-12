// The door to the 3D view of a site. The view itself (SiteScene) and the 3D
// library under it are well over a megabyte of script; this file is the few
// lines the rest of the game needs in order to show one. Keeping the two
// apart means the menu, which reaches this file through the screens it
// shares parts with, no longer waits for all of that before it can appear:
// the scene is fetched in the background a moment after the page opens, and
// is there by the time anyone asks for it.
import { Suspense, lazy } from 'react'
import type { SiteViewProps } from './SiteScene'

export { seatOwners } from './site/seats'
export type { Target } from './site/pick'
export type { AreaNote, AreaShape, Edge, EdgeRun, RunInfo, ShowState, SiteLife, SiteTool, SiteViewProps } from './SiteScene'

const load = () => import('./SiteScene').then((m) => ({ default: m.SiteScene }))
const Scene = lazy(load)

// fetch the scene while the player is still reading the menu, without holding the menu up for it
if (typeof window !== 'undefined') window.setTimeout(() => void load().catch(() => {}), 1200)

function Waiting() {
  return <div className="num flex h-full w-full items-center justify-center bg-bg text-[11px] text-faint">Loading the 3D view</div>
}

export function SiteView(props: SiteViewProps) {
  return (
    <Suspense fallback={<Waiting />}>
      <Scene {...props} />
    </Suspense>
  )
}
