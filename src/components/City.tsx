// The city screen: the company's world as a place to look at and walk into.
// The view fills the screen; a strip of districts along the top and a line of
// plain words along the bottom are all the chrome there is.
import { useEffect, useMemo, useRef, useState } from 'react'
import { CityView, type Focus, type Sky } from '../3d/CityView'
import { ISLAND, type Place, districts, places, traffic } from '../3d/city/plan'
import { sfx } from '../audio/sfx'
import { capOfTab, has } from '../sim/progress'
import { aim } from '../store/focus'
import { type Tab, useGame, useStore } from '../store/game'
import { keyName, keysFor } from '../store/settings'
import { Icon, type IconName } from './icons'
import { Btn, Stage3D, reducedMotion } from './ui'

const SKIES: { id: Sky; label: string; icon: IconName }[] = [
  { id: 'auto', label: 'Follow the game clock', icon: 'clock' },
  { id: 'day', label: 'Daylight', icon: 'day' },
  { id: 'dusk', label: 'Dusk', icon: 'dusk' },
  { id: 'night', label: 'Night', icon: 'night' },
]
/** The screen each kind of place opens. */
const LEADS: Record<Place['kind'], Tab> = { office: 'office', factory: 'factory', venue: 'venue', store: 'stores', rival: 'rivals', research: 'research', exchange: 'shares', port: 'products', board: 'marketing', region: 'world' }
const VERBS: Record<Place['kind'], string> = { office: 'go in', factory: 'go in', venue: 'go in', store: 'go in', rival: 'size them up', research: 'see the research', exchange: 'see your shares', port: 'see your devices and stock', board: 'see your campaigns', region: 'see the region' }
const HOME_FOCUS = { x: 0, z: -10, h: 0, dist: 480 }

export function CityScreen() {
  const g = useGame()
  const speed = useStore((s) => s.speed)
  const [sky, setSky] = useState<Sky>('auto')
  const [names, setNames] = useState(true)
  const [hover, setHover] = useState<string | null>(null)
  const [focus, setFocus] = useState<Focus | null>(null)
  const leaving = useRef(0)
  const flights = useRef(0)
  useEffect(() => () => window.clearTimeout(leaving.current), [])

  const all = districts(g)
  const list = places(g)
  const moving = traffic(g, list)
  const hovered = list.find((p) => p.id === hover)
  const attention = useMemo(() => list.filter((p) => p.warn), [list])
  const fly = (f: Omit<Focus, 'key'>) => setFocus({ ...f, key: ++flights.current })

  const enter = (p: Place) => {
    // a place the company has not earned yet says what it takes, and the camera stays where it is:
    // flying in and then not going anywhere left the view zoomed on a building for no reason
    const cap = capOfTab(LEADS[p.kind])
    if (cap && !has(g, cap)) return void (sfx.toggle(), useStore.getState().showLock(cap))
    sfx.confirm()
    fly({ x: p.x, z: p.z, h: p.h, dist: p.kind === 'region' ? 300 : Math.max(46, Math.max(p.w, p.d) * 1.5) })
    // the camera goes in first, then the place opens
    window.clearTimeout(leaving.current)
    leaving.current = window.setTimeout(() => {
      if (p.store) aim('store', p.store.id)
      if (p.kind === 'region') aim('region', p.region)
      useStore.getState().setTab(LEADS[p.kind])
    }, reducedMotion() ? 0 : 640)
  }

  const move = `${keysFor('camForward').slice(0, 1).map(keyName).join('')}${keysFor('camLeft').slice(0, 1).map(keyName).join('')}${keysFor('camBack').slice(0, 1).map(keyName).join('')}${keysFor('camRight').slice(0, 1).map(keyName).join('')}`
  const info = hovered ? `${hovered.name}: ${hovered.lines.join(', ')}.${hovered.warn ? ` ${hovered.warn}.` : ''} Click to ${VERBS[hovered.kind]}.` : `Your company's world. Click a building to go in. Drag to turn, right-drag or ${move} to move, scroll to zoom.${speed ? '' : ' The game is paused, so the streets are still.'}`

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div className="absolute inset-0 isolate">
        <Stage3D label="Drawing the city">
          <CityView g={g} all={all} list={list} traffic={moving} sky={sky} speed={speed} names={names} hover={hover} onHover={setHover} onPick={enter} focus={focus} />
        </Stage3D>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-2">
        <div className="pointer-events-auto flex flex-wrap border border-line2 bg-panel/95">
          {all.map((d) => (
            <Btn
              key={d.region.id}
              small
              tone="ghost"
              className="flex items-center gap-[6px]"
              title={d.home ? 'Your home city' : d.open ? `Look at ${d.region.name}` : `${d.region.name}: you do not sell there yet`}
              onClick={() => (sfx.toggle(), fly(d.home ? HOME_FOCUS : { x: d.x, z: d.z, h: 0, dist: ISLAND.w * 1.7 }))}
            >
              <Icon name={d.home ? 'campus' : 'world'} size={12} className={d.open ? '' : 'text-faint'} />
              <span className={d.open ? '' : 'text-faint'}>{d.region.name}</span>
              {d.home && <span className="num text-[9px] text-accent">HOME</span>}
              {!d.open && <span className="num text-[9px] text-faint">NOT ENTERED</span>}
            </Btn>
          ))}
        </div>
        <div className="pointer-events-auto flex gap-2">
          <div className="flex border border-line2 bg-panel/95">
            <Btn small className="flex items-center gap-[6px]" tone="ghost" title="Show or hide the name tags" active={names} onClick={() => setNames(!names)}>
              <Icon name="tag" size={13} />
              Names
            </Btn>
          </div>
          <div className="flex border border-line2 bg-panel/95">
            {SKIES.map((s) => (
              <Btn key={s.id} small className="flex items-center !px-2" tone="ghost" title={s.label} active={sky === s.id} onClick={() => setSky(s.id)}>
                <Icon name={s.icon} size={15} />
              </Btn>
            ))}
          </div>
        </div>
      </div>

      {attention.length > 0 && (
        <div className="pointer-events-none absolute bottom-12 right-2 flex w-[250px] flex-col gap-1">
          {attention.slice(0, 5).map((p) => (
            <button key={p.id} onClick={() => enter(p)} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)} className="pointer-events-auto flex items-start gap-2 border border-warn/60 bg-panel/95 px-2 py-[5px] text-left hover:bg-hover">
              <Icon name="alert" size={13} className="mt-[1px] text-warn" />
              <span className="min-w-0">
                <span className="block truncate text-[10px] uppercase tracking-wider text-fg">{p.name}</span>
                <span className="block text-[10px] leading-snug text-dim">{p.warn}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div data-bottom-bar className="pointer-events-none absolute inset-x-0 bottom-0 p-2">
        <div className={`pointer-events-auto inline-block max-w-full border bg-panel/95 px-3 py-[7px] text-[11px] ${hovered ? 'border-accent text-fg' : 'border-line2 text-dim'}`}>{info}</div>
      </div>
    </div>
  )
}
