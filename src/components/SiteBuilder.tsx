// Shared builder for campuses, factories, stores and venues: the 3D view fills
// the space, with a floating palette for zoning rooms, furnishing them and
// choosing how the building looks, plus whatever stats the screen passes in.
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { type AreaShape, type Edge, type ShowState, type SiteLife, type SiteTool, SiteView, type Target, seatOwners } from '../3d/SiteView'
import { campus, clockText, hourOf, moodAt } from '../3d/site/clock'
import type { Mood } from '../3d/site/env'
import type { ViewMode } from '../3d/site/structure'
import { sfx } from '../audio/sfx'
import { clearZone, lookCost, paintArea, placeItem, player, removeItem, removeRoom, roomCost, rotateItem, setEdge, setLook, setRoomStyle, zoneRoom } from '../sim/game'
import { factoryLife, officeLife, storeLife } from '../sim/life'
import { FACADES, GROUNDS, ITEMS, type LineStats, MAX_FLOORS, OUT, ROOFS, ROOMS, builtTiles, gridAt, roomNames, roomOf, roomTiles, sealedRooms, tierOf } from '../sim/sites'
import type { Employee, Product, Site, SiteItem } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { actionFor, keyName, keysFor } from '../store/settings'
import { WorldCard } from './WorldCards'
import { Icon, type IconName } from './icons'
import { Btn, Tabs, money } from './ui'

interface Props {
  /** 'office', 'factory', 'venue' or 'store:<id>'. */
  siteRef: string
  site: Site
  /** Cards shown down the right-hand side. */
  children?: ReactNode
  seated?: Employee[]
  /** Office: people with no desk, who walk the grounds. */
  idle?: Employee[]
  line?: LineStats | null
  producing?: boolean
  products?: Product[]
  busy?: number
  show?: ShowState
}

type Tab = 'Rooms' | 'Furnish' | 'Walls' | 'Grounds' | 'Look'
const FACING = ['north', 'east', 'south', 'west']
const VIEWS: { id: ViewMode; label: string; icon: IconName }[] = [
  { id: 'cut', label: 'Cutaway', icon: 'cutaway' },
  { id: 'walls', label: 'Walls', icon: 'wallsUp' },
  { id: 'full', label: 'Outside', icon: 'outside' },
]
const TAB_ICONS: Record<Tab, IconName> = { Rooms: 'rooms', Furnish: 'furnish', Walls: 'walls', Grounds: 'grounds', Look: 'look' }
const SHAPE_ICONS: Record<AreaShape, IconName> = { rect: 'box', round: 'round', diag: 'diagonal' }
const EDGE_ICONS: Record<string, IconName> = { door: 'door', glass: 'glass', open: 'opening', wall: 'wall' }
/** A toolbar button: an icon with its name beside it. */
const toolCls = 'flex items-center gap-[6px]'
const EDGES: { kind: 'door' | 'glass' | 'open' | 'wall'; name: string; cost: number; note: string }[] = [
  { kind: 'door', name: 'Door', cost: 300, note: 'A way in. Every room needs one.' },
  { kind: 'glass', name: 'Glass wall', cost: 120, note: 'Lets light and views through.' },
  { kind: 'open', name: 'Opening', cost: 0, note: 'Removes the wall so two rooms flow together.' },
  { kind: 'wall', name: 'Plain wall', cost: 0, note: 'Puts the wall back.' },
]

/** The time on the site's own clock, and the light that goes with it. Only re-renders when either changes. */
function useSiteClock(): { time: string; light: Mood } {
  const read = () => {
    const hour = hourOf(campus.t)
    return `${clockText(hour)}|${moodAt(hour)}`
  }
  const [now, setNow] = useState(read)
  useEffect(() => {
    const id = window.setInterval(() => setNow(read()), 400)
    return () => window.clearInterval(id)
  }, [])
  const [time, light] = now.split('|')
  return { time, light: light as Mood }
}

const row = (on: boolean) => `flex w-full items-baseline justify-between gap-2 border-b border-l-2 border-b-line px-2 py-[7px] text-left ${on ? 'border-l-accent bg-accent/10 text-accent' : 'border-l-transparent text-fg hover:bg-hover'}`

export function SiteBuilder({ siteRef, site, children, seated, idle, line, producing, products, busy, show }: Props) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const defs = ITEMS[site.kind]
  const rooms = ROOMS[site.kind]
  const groups = [...new Set(Object.values(defs).map((d) => d.group))]
  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState<Tab>(site.rooms.length ? 'Furnish' : 'Rooms')
  const [group, setGroup] = useState(groups[0])
  const [tool, setTool] = useState<SiteTool>(null)
  const [rot, setRot] = useState(0)
  const [shape, setShape] = useState<AreaShape>('rect')
  // sites that have people on them follow their own clock unless a time of day is picked by hand
  const alive = site.kind !== 'venue'
  const [light, setLight] = useState<Mood | 'clock'>(alive ? 'clock' : 'day')
  const clock = useSiteClock()
  const mood: Mood = light === 'clock' ? clock.light : light
  const speed = useStore((s) => s.speed)
  const storeId = siteRef.startsWith('store:') ? siteRef.slice(6) : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const life = useMemo<SiteLife | undefined>(() => (siteRef === 'office' ? { office: officeLife(g) } : siteRef === 'factory' ? { factory: factoryLife(g) } : storeId ? { store: storeLife(g, storeId) ?? undefined } : undefined), [g, siteRef, storeId, useStore.getState().rev])
  const card = useCallback((target: Target, close: () => void) => <WorldCard target={target} close={close} siteRef={siteRef} />, [siteRef])
  const [mode, setMode] = useState<ViewMode>('cut')
  const [selected, setSelected] = useState(0)
  const [pending, setPending] = useState(0)
  const me = player(g)
  const active: SiteTool = tool?.type === 'item' ? { ...tool, rot } : tool && 'shape' in tool ? { ...tool, shape } : tool
  const room = selected ? roomOf(site, selected) : undefined
  const sealed = sealedRooms(site)
  const onPreview = useCallback((n: number) => setPending(n), [])
  const [cutOff, setCutOff] = useState(0)
  const onCutOff = useCallback((n: number) => setCutOff(n), [])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT') return
      const action = actionFor(e, ['Building'])
      if (action === 'rotate') setRot((r) => (r + 1) % 4)
      else if (action === 'cancel') setTool(null)
      else if (action === 'sell') (setTool((cur) => (cur?.type === 'remove' ? null : { type: 'remove' })), setSelected(0))
      else if (action === 'viewNext') setMode((m) => (m === 'cut' ? 'walls' : m === 'walls' ? 'full' : 'cut'))
      else if (action === 'buildMenu') setOpen((o) => !o)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const report = (err: string | null | void, ok?: () => void) => {
    if (err) {
      say(err, 'bad')
      sfx.error()
    } else ok?.()
  }
  const pick = (next: SiteTool) => {
    setTool(next)
    if (next) setSelected(0)
  }
  const onTile = (x: number, y: number, item: SiteItem | undefined) => {
    if (!active) {
      // a person at their desk comes before the room they sit in
      const who = item && seatOwners(site, seated ?? []).get(item.id)
      if (who) return useStore.getState().openPerson(who.id)
      setSelected(gridAt(site, x, y))
      return
    }
    if (active.type === 'item') report(act((s) => placeItem(s, siteRef, active.kind, x, y, active.rot)), sfx.build)
    else if (active.type === 'rotate' && item) report(act((s) => rotateItem(s, siteRef, item.id)), sfx.toggle)
    else if (active.type === 'remove' && item) (act((s) => removeItem(s, siteRef, item.id)), sfx.cash())
  }
  const onArea = (x0: number, y0: number, x1: number, y1: number) => {
    if (!active) return
    if (active.type === 'room') {
      // starting inside a room of the same kind extends it
      const start = roomOf(site, gridAt(site, x0, y0))
      report(act((s) => zoneRoom(s, siteRef, active.room, x0, y0, x1, y1, active.shape, start?.type === active.room ? start.n : undefined)), sfx.zone)
    } else if (active.type === 'clear') (act((s) => clearZone(s, siteRef, x0, y0, x1, y1, active.shape)), sfx.demolish())
    else if (active.type === 'ground') (act((s) => paintArea(s, siteRef, x0, y0, x1, y1, active.shape, active.id)), sfx.toggle())
  }
  const onEdge = (e: Edge) => {
    if (active?.type === 'edge') report(act((s) => setEdge(s, siteRef, e.x, e.y, e.side, active.kind)), sfx.build)
  }

  const areaHint = 'Click one corner, then the opposite corner. Esc cancels.'
  const legend = site.kind === 'office' && (idle?.length || (seated ?? []).some((e) => e.ask || e.morale < 35)) ? ' Markers over people: red is unhappy or has no desk, gold wants a raise, blue over an empty chair is away on a course.' : ''
  const pointAt = site.kind === 'office' ? 'Point at a bench, a screen, the reception or a person and click to see what they are doing.' : site.kind === 'factory' ? 'Click a dock or a test station to see what the line is making.' : site.kind === 'store' ? 'Click a checkout or a table to see how the store is doing.' : ''
  const info =
    tool?.type === 'item'
      ? `${defs[tool.kind].name}: ${defs[tool.kind].note} Goes in: ${roomNames(site.kind, defs[tool.kind])}. Facing ${FACING[rot]} (${keyName(keysFor('rotate')[0] ?? 'KeyR')} turns it).`
      : tool?.type === 'room'
        ? pending
          ? `${rooms[tool.room].name}: ${pending} m² for ${money(roomCost(site, tool.room, pending), 0)}. Click to build.`
          : `${rooms[tool.room].name}: ${rooms[tool.room].note} ${areaHint} Start inside a room of the same kind to extend it.`
        : tool?.type === 'clear'
          ? pending
            ? `Demolish ${pending} m² of rooms. Anything inside is sold for half its price.`
            : `Demolish rooms. ${areaHint}`
          : tool?.type === 'ground'
            ? `${GROUNDS.find((x) => x.id === tool.id)?.name}: lay it on open land. Free. ${areaHint}`
            : tool?.type === 'edge'
              ? `${EDGES.find((e) => e.kind === tool.kind)?.name}: click a stretch of wall. ${EDGES.find((e) => e.kind === tool.kind)?.note}`
              : tool?.type === 'rotate'
                ? 'Click an item to turn it a quarter turn.'
                : tool?.type === 'remove'
                  ? 'Click an item to sell it for half its price.'
                  : sealed.length
                    ? `${sealed.length === 1 ? `The ${rooms[sealed[0].type].name.toLowerCase()} has` : `${sealed.length} rooms have`} no door, so nothing inside counts. Add one from the Walls tab.`
                    : cutOff
                      ? `${cutOff === 1 ? 'One room cannot' : `${cutOff} rooms cannot`} be walked to from the street: a door is blocked by furniture, or only leads to another closed-off room. People there appear at their desks instead of walking in. Add or clear a door from the Walls tab.`
                      : site.rooms.length
                      ? `${pointAt} Click a room's floor to restyle it. Drag to turn, right-drag or ${keysFor('camForward').slice(0, 1).map(keyName).join('')}${keysFor('camLeft').slice(0, 1).map(keyName).join('')}${keysFor('camBack').slice(0, 1).map(keyName).join('')}${keysFor('camRight').slice(0, 1).map(keyName).join('')} to move, scroll to zoom.${legend}`
                      : 'An empty plot. Open Rooms and mark out your first room.'

  const tiles = builtTiles(site)
  const items = Object.entries(defs).filter(([, d]) => d.group === group && (!room || d.rooms.includes(room.type)))

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div className="absolute inset-0">
        <SiteView
          key={`${site.kind}-${site.tier}`}
          site={site}
          mode={mode}
          mood={mood}
          tool={active}
          company={me.name}
          color={me.color}
          logo={me.logo}
          selectedRoom={selected}
          sealed={sealed.map((r) => r.n)}
          onTile={onTile}
          onEdge={onEdge}
          onArea={onArea}
          onPreview={onPreview}
          seated={seated}
          idle={idle}
          applicants={siteRef === 'office' ? g.candidates.slice(0, 3) : undefined}
          day={g.day}
          speed={speed}
          life={life}
          card={card}
          onCutOff={onCutOff}
          onPerson={(id) => useStore.getState().openPerson(id)}
          line={line}
          producing={producing}
          products={products}
          busy={busy}
          show={show}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <Btn small className={toolCls} tone={open ? 'default' : 'primary'} active={open} onClick={() => setOpen(!open)}>
            <Icon name="build" size={13} />
            Build
          </Btn>
          <div className="flex border border-line2 bg-panel/95">
            <Btn small className={toolCls} tone="ghost" title="Turn an item a quarter turn" active={tool?.type === 'rotate'} onClick={() => pick(tool?.type === 'rotate' ? null : { type: 'rotate' })}>
              <Icon name="turn" size={13} />
              Turn
            </Btn>
            <Btn small className={toolCls} tone="ghost" title="Sell an item for half its price" active={tool?.type === 'remove'} onClick={() => pick(tool?.type === 'remove' ? null : { type: 'remove' })}>
              <Icon name="sell" size={13} />
              Sell
            </Btn>
            <Btn small className={toolCls} tone="ghost" title="Knock down rooms" active={tool?.type === 'clear'} onClick={() => pick(tool?.type === 'clear' ? null : { type: 'clear', shape })}>
              <Icon name="demolish" size={13} />
              Demolish
            </Btn>
          </div>
          <span className="num border border-line2 bg-panel/95 px-2 py-[5px] text-[10px] uppercase tracking-wider text-dim">
            {tierOf(site).name} <span className="text-faint">/ {site.w} x {site.h} m / {tiles} m² built</span>
          </span>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <div className="flex border border-line2 bg-panel/95">
            {VIEWS.map((v) => (
              <Btn key={v.id} small className="flex items-center !px-2" tone="ghost" title={v.label} active={mode === v.id} onClick={() => setMode(v.id)}>
                <Icon name={v.icon} size={15} />
              </Btn>
            ))}
          </div>
          <div className="flex border border-line2 bg-panel/95">
            {alive && (
              <Btn small className="flex items-center gap-[5px] !px-2" tone="ghost" title={`The time on site: ${clock.time}. People come in around eight and go home after five; the clock runs with the game and stops when it is paused. Click to let the light follow it.`} active={light === 'clock'} onClick={() => setLight('clock')}>
                <Icon name="clock" size={15} />
                <span className="num text-[11px]">{clock.time}</span>
              </Btn>
            )}
            {(['day', 'dusk', 'night'] as Mood[]).map((m) => (
              <Btn key={m} small className="flex items-center !px-2" tone="ghost" title={m === 'day' ? 'Always show daylight' : m === 'dusk' ? 'Always show dusk' : 'Always show night'} active={light === m} onClick={() => setLight(m)}>
                <Icon name={m} size={15} />
              </Btn>
            ))}
          </div>
        </div>
      </div>

      {open && (
        <div className="absolute bottom-12 left-2 top-12 flex w-[262px] flex-col border border-line2 bg-panel/95">
          <Tabs value={tab} options={(['Rooms', 'Furnish', 'Walls', 'Grounds', 'Look'] as Tab[]).map((x) => ({
              value: x,
              label: (
                <span className="flex items-center gap-[5px]" title={x}>
                  <Icon name={TAB_ICONS[x]} size={13} />
                  {tab === x && x}
                </span>
              ),
            }))} onChange={setTab} className="flex-wrap" />
          {(tab === 'Rooms' || tab === 'Grounds') && (
            <div className="flex items-center gap-2 border-b border-line px-2 py-[6px]">
              <span className="text-[10px] uppercase tracking-wider text-dim">Shape</span>
              {(['rect', 'round', 'diag'] as AreaShape[]).map((sh) => (
                <Btn key={sh} small active={shape === sh} onClick={() => setShape(sh)} title={sh === 'diag' ? 'A triangle: the square corner sits where you click first' : sh === 'round' ? 'A circle or oval inside the box you mark out' : undefined}>
                  <span className="flex items-center gap-[5px]">
                    <Icon name={SHAPE_ICONS[sh]} size={12} />
                    {sh === 'rect' ? 'Box' : sh === 'round' ? 'Round' : 'Diagonal'}
                  </span>
                </Btn>
              ))}
            </div>
          )}
          {tab === 'Furnish' && <Tabs value={group} options={groups.map((x) => ({ value: x, label: x }))} onChange={setGroup} className="flex-wrap" />}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'Rooms' &&
              Object.entries(rooms).map(([id, r]) => {
                const on = tool?.type === 'room' && tool.room === id
                return (
                  <button key={id} onClick={() => pick(on ? null : { type: 'room', room: id, shape })} className={row(on)}>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-xs uppercase tracking-wider">
                        <span className="h-3 w-3 shrink-0 border border-line2" style={{ background: r.styles[0].floor }} />
                        {r.name}
                      </span>
                      <span className="mt-[2px] block text-[10px] normal-case leading-snug tracking-normal text-dim">{r.note}</span>
                    </span>
                    <span className="num shrink-0 text-[11px] text-dim">{money(r.cost, 0)}/m²</span>
                  </button>
                )
              })}
            {tab === 'Furnish' && room && (
              <div className="flex items-center justify-between border-b border-line px-2 py-[6px] text-[10px] uppercase tracking-wider text-dim">
                <span>For the {rooms[room.type].name}</span>
                <Btn small tone="ghost" onClick={() => setSelected(0)}>
                  Show all
                </Btn>
              </div>
            )}
            {tab === 'Furnish' &&
              (items.length ? (
                items.map(([kind, d]) => {
                  const on = tool?.type === 'item' && tool.kind === kind
                  const usable = d.rooms.some((r) => r === OUT || site.rooms.some((x) => x.type === r))
                  return (
                    <button key={kind} onClick={() => pick(on ? null : { type: 'item', kind, rot })} className={row(on)}>
                      <span className={`truncate text-xs uppercase tracking-wider ${usable ? '' : 'text-faint'}`}>
                        {d.name}
                        {(d.w > 1 || d.h > 1) && (
                          <span className="num ml-2 text-[9px] text-faint">
                            {d.w}x{d.h}
                          </span>
                        )}
                      </span>
                      <span className="num shrink-0 text-[11px] text-dim">{money(d.cost, 0)}</span>
                    </button>
                  )
                })
              ) : (
                <div className="px-2 py-3 text-[11px] text-dim">Nothing in this group goes in that room.</div>
              ))}
            {tab === 'Walls' && (
              <>
                <div className="border-b border-line px-2 py-2 text-[11px] leading-snug text-dim">Walls stand wherever two rooms meet, or a room meets the outdoors. Change any stretch of them here.</div>
                {EDGES.map((e) => {
                  const on = tool?.type === 'edge' && tool.kind === e.kind
                  return (
                    <button key={e.kind} onClick={() => pick(on ? null : { type: 'edge', kind: e.kind })} className={row(on)}>
                      <span className="flex items-center gap-2 text-xs uppercase tracking-wider">
                        <Icon name={EDGE_ICONS[e.kind]} size={14} />
                        {e.name}
                      </span>
                      <span className="num text-[11px] text-dim">{e.cost ? money(e.cost, 0) : 'free'}</span>
                    </button>
                  )
                })}
              </>
            )}
            {tab === 'Grounds' &&
              GROUNDS.map((f) => {
                const on = tool?.type === 'ground' && tool.id === f.id
                return (
                  <button key={f.id} onClick={() => pick(on ? null : { type: 'ground', id: f.id, shape })} className={`${row(on)} !items-center !justify-start`}>
                    <span className="h-4 w-4 shrink-0 border border-line2" style={{ background: f.color }} />
                    <span className="text-xs uppercase tracking-wider">{f.name}</span>
                  </button>
                )
              })}
            {tab === 'Look' && (
              <div className="space-y-3 p-2">
                <div className="text-[11px] leading-snug text-dim">How the building looks from outside. Switch to the Outside view to see it.</div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">Cladding</div>
                  {FACADES.map((f, i) => {
                    const cost = lookCost(site, { facade: i })
                    return (
                      <button key={f.id} onClick={() => report(act((s) => setLook(s, siteRef, { facade: i })), () => (sfx.zone(), setMode('full')))} className={`${row(site.facade === i)} !items-center`}>
                        <span className="flex items-center gap-2 text-xs uppercase tracking-wider">
                          <span className="h-4 w-4 shrink-0 border border-line2" style={{ background: f.color }} />
                          {f.name}
                        </span>
                        <span className="num text-[11px] text-dim">{site.facade === i ? 'fitted' : cost ? money(cost, 0) : 'free'}</span>
                      </button>
                    )
                  })}
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">Roof</div>
                  {ROOFS.map((r, i) => {
                    const cost = lookCost(site, { roof: i })
                    return (
                      <button key={r.id} onClick={() => report(act((s) => setLook(s, siteRef, { roof: i })), () => (sfx.zone(), setMode('full')))} className={`${row(site.roof === i)} !items-center`}>
                        <span className="flex items-center gap-2 text-xs uppercase tracking-wider">
                          <span className="h-4 w-4 shrink-0 border border-line2" style={{ background: r.color }} />
                          {r.name}
                        </span>
                        <span className="num text-[11px] text-dim">{site.roof === i ? 'fitted' : cost ? money(cost, 0) : 'free'}</span>
                      </button>
                    )
                  })}
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-dim">
                    <span>Storeys</span>
                    <span className="num text-fg">{site.floors}</span>
                  </div>
                  <div className="flex gap-2">
                    <Btn small className="flex-1" disabled={site.floors <= 1} onClick={() => report(act((s) => setLook(s, siteRef, { floors: site.floors - 1 })), () => setMode('full'))}>
                      Remove one
                    </Btn>
                    <Btn small className="flex-1" disabled={site.floors >= MAX_FLOORS || !tiles} onClick={() => report(act((s) => setLook(s, siteRef, { floors: site.floors + 1 })), () => (sfx.zone(), setMode('full')))}>
                      Add one {tiles ? `(${money(lookCost(site, { floors: site.floors + 1 }), 0)})` : ''}
                    </Btn>
                  </div>
                  <div className="mt-1 text-[10px] leading-snug text-dim">Upper floors hold the departments you do not manage desk by desk. They add prestige and upkeep, and make new rooms cost more.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {room && !tool && (
        <div className={`absolute bottom-12 ${open ? 'left-[278px]' : 'left-2'} w-[250px] border border-line2 bg-panel/95`}>
          <div className="flex items-center justify-between border-b border-line px-2 py-[6px]">
            <span className="text-xs uppercase tracking-wider text-fg">{rooms[room.type].name}</span>
            <span className="num text-[10px] text-dim">{roomTiles(site, room.n)} m²</span>
          </div>
          <div className="space-y-2 p-2">
            <div className="text-[10px] uppercase tracking-wider text-dim">Finish</div>
            <div className="grid grid-cols-2 gap-1">
              {rooms[room.type].styles.map((st, i) => (
                <button key={st.name} onClick={() => (act((s) => setRoomStyle(s, siteRef, room.n, i)), sfx.toggle())} className={`flex items-center gap-2 border px-[6px] py-[5px] text-left text-[10px] uppercase tracking-wider ${room.style === i ? 'border-accent text-accent' : 'border-line2 text-dim hover:text-fg'}`}>
                  <span className="flex h-4 w-6 shrink-0 border border-line2">
                    <span className="flex-1" style={{ background: st.floor }} />
                    <span className="flex-1" style={{ background: st.wall }} />
                  </span>
                  <span className="truncate">{st.name}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Btn small className="flex-1" onClick={() => (setTab('Furnish'), setOpen(true))}>
                Furnish
              </Btn>
              <Btn small tone="danger" className="flex-1" onClick={() => (act((s) => removeRoom(s, siteRef, room.n)), sfx.demolish(), setSelected(0))}>
                Demolish
              </Btn>
            </div>
          </div>
        </div>
      )}

      {children && <div className="pointer-events-none absolute bottom-12 right-2 top-12 flex w-[270px] flex-col gap-2 overflow-y-auto [&>*]:pointer-events-auto">{children}</div>}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2">
        <div className={`pointer-events-auto inline-block max-w-full border bg-panel/95 px-3 py-[7px] text-[11px] ${(sealed.length || cutOff) && !tool ? 'border-warn text-warn' : pending ? 'border-accent text-fg' : 'border-line2 text-dim'}`}>{info}</div>
      </div>
    </div>
  )
}
