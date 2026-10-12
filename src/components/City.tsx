// The city screen: the company's world as a place to look at and walk into,
// and the home screen. Each of the company's places wears a plate that says
// how it stands; the regions are a layer over the same view, with a plate on
// each island and the details of one in the drawer. One row of controls in a
// corner is all the chrome there is.
import { useEffect, useMemo, useRef, useState } from 'react'
import { CityView, type Focus, type Pose, type Sky } from '../3d/CityView'
import { type Place, districts, places, shortages, traffic } from '../3d/city/plan'
import { type CityPlate, cityPlates, regionPlates } from '../3d/city/plates'
import { sfx } from '../audio/sfx'
import { SUPPLY_LABELS } from '../data/catalog'
import { type CapId, capOfTab, has } from '../sim/progress'
import { aim, keepView, takeAim } from '../store/focus'
import { type Tab, useGame, useStore } from '../store/game'
import { keyName, keysFor } from '../store/settings'
import { lockProps } from './Progress'
import { RegionDrawer, type RegionView } from './Regions'
import { Icon, type IconName } from './icons'
import { Btn, Key, Stage3D, reducedMotion, useKept, useLayer } from './ui'

const SKIES: { id: Sky; label: string; icon: IconName; title: string }[] = [
  { id: 'auto', label: 'Clock', icon: 'clock', title: 'The day goes by with the game clock' },
  { id: 'day', label: 'Day', icon: 'day', title: 'Always daylight' },
  { id: 'dusk', label: 'Dusk', icon: 'dusk', title: 'Always dusk' },
  { id: 'night', label: 'Night', icon: 'night', title: 'Always night' },
]
/** The screen each kind of place opens. */
const LEADS: Record<Place['kind'], Tab> = { office: 'office', factory: 'factory', venue: 'venue', store: 'stores', rival: 'rivals', research: 'research', exchange: 'shares', port: 'products', board: 'marketing', region: 'world' }
const VERBS: Record<Place['kind'], string> = { office: 'go in', factory: 'go in', venue: 'go in', store: 'go in', rival: 'see the company', research: 'see the research', exchange: 'see your shares', port: 'see your devices and stock', board: 'see your campaigns', region: 'open the region' }
/** Remembers, on this computer, that the player has seen how the view is moved. */
const HINT_SEEN = 'sb-city-hint'
const hintSeen = () => {
  try {
    return localStorage.getItem(HINT_SEEN) === '1'
  } catch {
    return true
  }
}

/** The one control for the light in the view: it shows the current choice and opens a short menu of the four. */
function LightMenu({ sky, onPick }: { sky: Sky; onPick: (sky: Sky) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useLayer(open, () => setOpen(false))
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [open])
  const now = SKIES.find((s) => s.id === sky) ?? SKIES[0]
  return (
    <div ref={box} className="relative">
      <Btn small tone="ghost" icon={now.icon} title="The light in the view" aria-haspopup="menu" aria-expanded={open} onClick={() => (sfx.toggle(), setOpen(!open))}>
        Light: {now.label}
      </Btn>
      {open && (
        <div role="menu" aria-label="Light" className="absolute left-[-1px] top-[29px] z-20 min-w-[calc(100%+2px)] border border-line2 bg-panel">
          {SKIES.map((s) => (
            <button key={s.id} type="button" role="menuitemradio" aria-checked={s.id === sky} title={s.title} onClick={() => (sfx.toggle(), onPick(s.id), setOpen(false))} className={`flex h-7 w-full items-center gap-2 whitespace-nowrap px-2 text-left text-xs hover:bg-hover ${s.id === sky ? 'text-fg' : 'text-dim hover:text-fg'}`}>
              <Icon name={s.icon} size={13} className={s.id === sky ? 'text-accent' : ''} />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function CityScreen() {
  const g = useGame()
  const speed = useStore((s) => s.speed)
  // the regions are a layer of this view: the same screen under a second id, so old links to it land here with the layer on
  const regions = useStore((s) => s.tab === 'world')
  const lockCard = useStore((s) => s.lockCard)
  const [sky, setSky] = useKept<Sky>('city:sky', 'auto')
  const [hover, setHover] = useState<string | null>(null)
  const [focus, setFocus] = useState<Focus | null>(null)
  const [pose, setPose] = useState<Pose>('home')
  const [view, setView] = useState<RegionView>(null)
  const [hint, setHint] = useState(() => !hintSeen())
  const leaving = useRef(0)
  const flights = useRef(0)
  /** A lock card opened from a building the camera flew to: when it closes, the camera goes back. */
  const lockFlew = useRef(false)
  useEffect(() => () => window.clearTimeout(leaving.current), [])

  const all = districts(g)
  const list = places(g)
  const moving = traffic(g, list)
  const plates = cityPlates(g)
  const islands = useMemo(() => regionPlates(g, all), [g, all.map((d) => `${d.region.id}${d.open ? 1 : 0}`).join(), g.stores.length, g.day]) // eslint-disable-line react-hooks/exhaustive-deps
  const fly = (to: 'home' | 'world' | 'back') => setFocus({ to, key: ++flights.current })
  const flyTo = (p: Place, keep = false) => setFocus({ to: 'place', x: p.x, z: p.z, h: p.h, dist: Math.max(keep ? 90 : 46, Math.max(p.w, p.d) * (keep ? 2.2 : 1.5)), keep, key: ++flights.current })

  // the layer comes on with the whole bay in view, and goes off back at the overview
  const layer = useRef<boolean | null>(null)
  useEffect(() => {
    const was = layer.current
    layer.current = regions
    if (regions) {
      // a region asked for from somewhere else is the one opened
      const aimed = takeAim('region')
      if (aimed) setView(aimed)
      fly('world')
    } else if (was) {
      setView(null)
      fly('home')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions])

  // once the card that says what a locked place takes is closed, the camera returns to where it was
  useEffect(() => {
    if (lockCard || !lockFlew.current) return
    lockFlew.current = false
    fly('back')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockCard])

  // the line about moving the view is for the first visit: it goes once the view has been moved, and does not come back
  useEffect(() => {
    if (!hint || pose !== 'away') return
    setHint(false)
    try {
      localStorage.setItem(HINT_SEEN, '1')
    } catch {
      /* storage is off: the line shows again next time */
    }
  }, [hint, pose])

  /** A place that is not open yet: the camera leans in, the card says what it takes, and the camera goes back when the card closes. */
  const lockAt = (p: Place, cap: CapId) => {
    sfx.toggle()
    lockFlew.current = true
    flyTo(p, true)
    useStore.getState().showLock(cap)
  }
  const openRegion = (id: string, from?: Place) => {
    if (!has(g, 'world')) return from ? lockAt(from, 'world') : void (sfx.toggle(), useStore.getState().showLock('world'))
    sfx.toggle()
    setView(id)
    if (!regions) useStore.getState().go({ tab: 'world' })
  }
  const enter = (p: Place) => {
    if (p.kind === 'region') return openRegion(p.region, p)
    const cap = capOfTab(LEADS[p.kind])
    if (cap && !has(g, cap)) return lockAt(p, cap)
    sfx.confirm()
    flyTo(p)
    // the camera goes in first, then the place opens
    window.clearTimeout(leaving.current)
    leaving.current = window.setTimeout(() => {
      if (p.store) aim('store', p.store.id)
      // a rival's tower opens that company under Devices, Rivals
      if (p.company) keepView('rivals:company', p.company.id)
      useStore.getState().go({ tab: LEADS[p.kind] })
    }, reducedMotion() ? 0 : 640)
  }
  /** A plate goes straight to where its place is run. */
  const openPlate = (plate: CityPlate) => {
    sfx.confirm()
    if (plate.storeId) aim('store', plate.storeId)
    useStore.getState().go(plate.where)
  }
  const verb = (p: Place) => {
    const cap = p.kind === 'region' ? 'world' : capOfTab(LEADS[p.kind])
    return cap && !has(g, cap) ? 'Not open yet. Click to see what it takes.' : `Click to ${VERBS[p.kind]}.`
  }

  // the port's plate also says, on hover, which kinds of component are running late: the empty slots on its quay
  const short = shortages(g)
  const shown = short.length ? plates.map((p) => (p.placeId === 'port' ? { ...p, notes: [...p.notes, `Empty slots on the quay: ${short.map((c) => SUPPLY_LABELS[c].toLowerCase()).join(', ')} in short supply.`] } : p)) : plates

  const rest: Pose = regions ? 'world' : 'home'
  const keys = (['camForward', 'camLeft', 'camBack', 'camRight'] as const).map((id) => keysFor(id).slice(0, 1).map(keyName).join('')).join('')
  const home = keysFor('camHome').slice(0, 1).map(keyName).join('')
  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div className="absolute inset-0 isolate">
        <Stage3D label="Drawing the city">
          <CityView
            g={g}
            all={all}
            list={list}
            traffic={moving}
            sky={sky}
            speed={speed}
            plates={shown}
            regionPlates={islands}
            regions={regions}
            selectedRegion={view && view !== 'all' ? view : null}
            hover={hover}
            onHover={setHover}
            onPick={enter}
            onPlate={openPlate}
            onRegion={(id) => openRegion(id)}
            verb={verb}
            focus={focus}
            onPose={setPose}
          />
        </Stage3D>
      </div>

      {/* the toolbar: one row, in one corner */}
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex">
        <div className="pointer-events-auto flex items-center border border-line2 bg-panel">
          <Btn small tone="ghost" icon="world" active={regions} title={regions ? 'Hide the regions' : 'Show how you stand in each region, on its island'} onClick={() => (sfx.toggle(), regions ? useStore.getState().setTab('city') : useStore.getState().go({ tab: 'world' }))} {...lockProps(g, 'world')}>
            Regions
          </Btn>
          {regions && (
            <Btn small tone="ghost" active={view === 'all'} title="The six regions as a table" onClick={() => (sfx.toggle(), setView(view === 'all' ? null : 'all'))}>
              All regions
            </Btn>
          )}
          <span aria-hidden className="h-4 w-px bg-line2" />
          <LightMenu sky={sky} onPick={setSky} />
          {pose !== rest && (
            <>
              <span aria-hidden className="h-4 w-px bg-line2" />
              <Btn small tone="ghost" icon="city" title={regions ? 'Back to the view of every region' : `Back to the view the city opens on${home ? ` (${home})` : ''}`} onClick={() => (sfx.toggle(), fly(rest))}>
                Back to overview
              </Btn>
            </>
          )}
        </div>
      </div>

      {hint && (
        <div data-bottom-bar className="pointer-events-none absolute bottom-2 left-2 z-10 flex max-w-[calc(100%-16px)] items-center gap-[6px] overflow-hidden whitespace-nowrap border border-line2 bg-panel px-2 py-[5px] text-xs text-dim">
          Click a building to go in.
          <Key>Drag</Key> turns, <Key>Right-drag</Key> or <Key>{keys}</Key> moves, <Key>Scroll</Key> zooms.
        </div>
      )}

      <RegionDrawer view={regions ? view : null} onView={setView} />
    </div>
  )
}
