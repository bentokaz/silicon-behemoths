// Shared builder for campuses, factories, stores and venues: the 3D view fills
// the space, with a floating palette for zoning rooms, furnishing them and
// choosing how the building looks, plus whatever stats the screen passes in.
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { type AreaNote, type AreaShape, type EdgeRun, type RunInfo, type ShowState, type SiteLife, type SiteTool, SiteView, type Target, seatOwners } from '../3d/SiteView'
import { campus, clockText, firstLook, hourOf, moodAt } from '../3d/site/clock'
import type { Mood } from '../3d/site/env'
import type { ViewMode } from '../3d/site/structure'
import { sfx } from '../audio/sfx'
import { MIN_THICK } from '../sim/curves'
import { clearZone, fillRoom, lookCost, paintArea, placeItems, player, removeItems, removeRoom, roomCost, rotateItem, setEdges, setLook, setRoomStyle, zoneRoom } from '../sim/game'
import { factoryLife, officeLife, storeLife, venueLife } from '../sim/life'
import { type CapId, has } from '../sim/progress'
import { FACADES, GROUNDS, ITEMS, type LineStats, MAX_FLOORS, OUT, ROOFS, ROOMS, builtTiles, gridAt, groundsFor, itemAllowed, needsOf, roomNames, roomOf, roomTiles, sealedRooms, tierOf } from '../sim/sites'
import type { Employee, Product, Site, SiteItem } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { actionFor, keyName, keysFor } from '../store/settings'
import { WorldCard } from './WorldCards'
import { Icon, type IconName } from './icons'
import { Btn, ConfirmBtn, Tabs, modalOpen, money } from './ui'

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
const SHAPE_ICONS: Record<AreaShape, IconName> = { rect: 'box', round: 'round', ring: 'ring', diag: 'diagonal', fill: 'fill' }
const SHAPE_NAMES: Record<AreaShape, string> = { rect: 'Box', round: 'Round', ring: 'Ring', diag: 'Slant', fill: 'Fill' }
const SHAPE_NOTES: Record<AreaShape, string> = {
  rect: 'A plain rectangle. Drawn across half or more of a courtyard with a curved wall, it takes the whole courtyard',
  round: 'A circle or oval with a smooth curved wall, inside the box you mark out',
  ring: 'A curved building round an open courtyard',
  diag: 'A triangle: the square corner sits where you click first',
  fill: 'One click fills a courtyard: all the open ground closed in with the tile you click, up to every wall, round every curve, and out to the edge of the plot where that closes it',
}
/** The shapes each tab offers. Only rooms are built by filling a courtyard. */
const ROOM_SHAPES: AreaShape[] = ['rect', 'round', 'ring', 'diag', 'fill']
const GROUND_SHAPES: AreaShape[] = ['rect', 'round', 'ring', 'diag']
/** How much of a full turn a round shape covers. */
const ARCS: { sweep: number; name: string; icon: IconName; note: string }[] = [
  { sweep: 360, name: 'Full', icon: 'round', note: 'The whole circle' },
  { sweep: 270, name: '3/4', icon: 'arc34', note: 'Three quarters of the circle, open at one corner' },
  { sweep: 180, name: 'Half', icon: 'arc', note: 'A half circle or crescent filling the box, open along one side' },
  { sweep: 90, name: '1/4', icon: 'arc14', note: 'A quarter turn filling the box: a long sweeping curve' },
]
/** Which way the open side of an arc faces, by quarter turn. */
const OPEN_SIDE: Record<number, string[]> = { 180: ['south', 'west', 'north', 'east'], 90: ['south-east', 'south-west', 'north-west', 'north-east'], 270: ['south-east', 'south-west', 'north-west', 'north-east'] }
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
  const alive = true
  // the first look at a site is always in working hours
  useState(() => firstLook(siteRef))
  const [light, setLight] = useState<Mood | 'clock'>('clock')
  const clock = useSiteClock()
  const mood: Mood = light === 'clock' ? clock.light : light
  const speed = useStore((s) => s.speed)
  const storeId = siteRef.startsWith('store:') ? siteRef.slice(6) : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const life = useMemo<SiteLife | undefined>(() => (siteRef === 'office' ? { office: officeLife(g) } : siteRef === 'factory' ? { factory: factoryLife(g) } : storeId ? { store: storeLife(g, storeId) ?? undefined } : siteRef === 'venue' ? { venue: venueLife(g) } : undefined), [g, siteRef, storeId, useStore.getState().rev])
  const card = useCallback((target: Target, close: () => void) => <WorldCard target={target} close={close} siteRef={siteRef} />, [siteRef])
  const [thick, setThick] = useState(5)
  const [sweep, setSweep] = useState(360)
  const [mode, setMode] = useState<ViewMode>('cut')
  const [selected, setSelected] = useState(0)
  const [pending, setPending] = useState(0)
  const me = player(g)
  /** The shape in hand for the tool in hand: demolishing and laying ground are drawn, never filled, so Fill falls back to a box there. */
  const drawn: AreaShape = shape === 'fill' && (tool ? tool.type !== 'room' : tab !== 'Rooms') ? 'rect' : shape
  const curvy = drawn === 'round' || drawn === 'ring'
  const active: SiteTool = tool?.type === 'item' ? { ...tool, rot } : tool && 'shape' in tool ? { ...tool, shape: drawn, opts: curvy ? { thick, sweep, turn: rot } : undefined } : tool
  const room = selected ? roomOf(site, selected) : undefined
  const sealed = sealedRooms(site)
  /** What the area tool says about the ground under it: that it would fill a courtyard, or why it cannot. */
  const [note, setNote] = useState<AreaNote | undefined>(undefined)
  const onPreview = useCallback((n: number, about?: AreaNote) => {
    setPending(n)
    setNote(about)
  }, [])
  /** What the tool being dragged across the plot would do right now. */
  const [run, setRun] = useState<RunInfo | null>(null)
  const onRun = useCallback((info: RunInfo | null) => setRun(info), [])
  const [cutOff, setCutOff] = useState(0)
  const onCutOff = useCallback((n: number) => setCutOff(n), [])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      // not while typing, and not behind a dialog that is waiting for an answer
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || modalOpen() || useStore.getState().game?.gameOver) return
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
    if (active.type === 'rotate' && item) report(act((s) => rotateItem(s, siteRef, item.id)), sfx.toggle)
  }
  /** One sound for a whole run, and a word about it when something did not go as asked. */
  const ran = (out: { done: number; error: string | null }, sound: () => void) => {
    if (out.done) sound()
    if (out.error) say(out.error, 'bad')
  }
  // a click places one; pressing and dragging lays a row, all in one action
  const onRow = (x0: number, y0: number, x1: number, y1: number) => {
    if (active?.type === 'item') ran(act((s) => placeItems(s, siteRef, active.kind, x0, y0, x1, y1, active.rot)), sfx.build)
  }
  const onEdges = (wall: EdgeRun) => {
    if (active?.type === 'edge') ran(act((s) => setEdges(s, siteRef, wall, active.kind)), sfx.build)
  }
  const onSell = (ids: string[]) => {
    if (active?.type === 'remove') ran(act((s) => removeItems(s, siteRef, ids)), sfx.cash)
  }
  const onArea = (x0: number, y0: number, x1: number, y1: number, apart: boolean) => {
    if (!active) return
    // (demolishing and laying ground never fill: see `drawn`)
    const box = active.type !== 'item' && 'shape' in active && active.shape !== 'fill' ? active.shape : 'rect'
    if (active.type === 'room' && active.shape === 'fill') {
      // one click on a courtyard: the room takes all of it
      report(act((s) => fillRoom(s, siteRef, active.room, x0, y0, apart)), sfx.zone)
    } else if (active.type === 'room') {
      // starting inside a room of the same kind extends it; floor laid against one joins it, unless it is asked to stand apart
      const start = roomOf(site, gridAt(site, x0, y0))
      report(act((s) => zoneRoom(s, siteRef, active.room, x0, y0, x1, y1, box, !apart && start?.type === active.room ? start.n : undefined, active.opts, apart)), sfx.zone)
    } else if (active.type === 'clear') (act((s) => clearZone(s, siteRef, x0, y0, x1, y1, box, active.opts)), sfx.demolish())
    else if (active.type === 'ground') (act((s) => paintArea(s, siteRef, x0, y0, x1, y1, box, active.id, active.opts)), sfx.toggle())
  }

  const turnKey = keyName(keysFor('rotate')[0] ?? 'KeyR')
  const areaHint = `Click one corner, then the opposite corner. Esc cancels.${curvy && sweep < 360 ? ` The arc is open to the ${OPEN_SIDE[sweep][rot]} (${turnKey} turns it).` : ''}`
  const legend = site.kind === 'office' && (idle?.length || (seated ?? []).some((e) => e.ask || e.morale < 35)) ? ' Markers over people: red is unhappy or has no desk, gold wants a raise, blue over an empty chair is away on a course.' : ''
  const pointAt = site.kind === 'office' ? 'Point at a bench, a screen, the reception or a person and click to see what they are doing.' : site.kind === 'factory' ? 'Click a dock or a test station to see what the line is making.' : site.kind === 'store' ? 'Click a checkout or a table to see how the store is doing.' : site.kind === 'venue' ? 'Click the stage, the screen or a block of seats to see what it adds and what is booked.' : ''
  const keyOf = (id: Parameters<typeof keysFor>[0]) => keysFor(id).slice(0, 1).map(keyName).join('')
  // with a tool that paints as it is dragged, the left button is the tool's
  const camHint = `While this tool is in hand a left-drag is the tool's: right-drag or ${keyOf('camForward')}${keyOf('camLeft')}${keyOf('camBack')}${keyOf('camRight')} moves the view, ${keyOf('camTurnLeft')} and ${keyOf('camTurnRight')} (or a middle-drag) turn it, scroll zooms.`
  const blocked = run?.blocked ? ` ${run.blocked} ${run.blocked === 1 ? 'spot is' : 'spots are'} in the way and will be skipped.` : ''
  const edgeDef = tool?.type === 'edge' ? EDGES.find((e) => e.kind === tool.kind) : undefined
  // what a run of wall passes over, and why: stretches that are no wall, stretches a curve cuts too short for a door, and doors that glazing leaves alone
  const cutShort = run?.short ?? 0
  const notWall = (run?.blocked ?? 0) - cutShort
  const passed =
    (notWall > 0 ? ` ${notWall} of the line ${notWall === 1 ? 'is' : 'are'} not wall.` : '') +
    (cutShort ? ` ${cutShort} ${cutShort === 1 ? 'stretch is' : 'stretches are'} cut short by a curved wall and cannot take ${tool?.type === 'edge' && tool.kind === 'open' ? 'an opening' : 'a door'}.` : '') +
    (run?.kept ? ` ${run.kept === 1 ? 'The door in the run stays' : `The ${run.kept} doors in the run stay`} as ${run.kept === 1 ? 'it is' : 'they are'}.` : '')
  /** Said with the wall tool in hand, before anything is dragged: what each kind does that is not obvious. */
  const edgeTip = tool?.type !== 'edge' ? '' : tool.kind === 'glass' ? ' Glazing a run leaves the doors in it standing, so a front can be glazed in one sweep without losing its way in; click a door on its own to glaze over it.' : tool.kind === 'door' || tool.kind === 'open' ? ` ${tool.kind === 'door' ? 'A door' : 'An opening'} needs a full metre of straight wall or a bay of curved wall: a straight stretch that a curve cuts short cannot take one.` : ''
  const roomTool = tool?.type === 'room' ? rooms[tool.room] : undefined
  const apartTip = 'Hold Alt as you click to keep it a room of its own.'
  const info =
    tool?.type === 'item'
      ? run
        ? `${defs[tool.kind].name}: ${run.count} for ${money(run.cost, 0)}.${blocked} Let go to place ${run.count === 1 ? 'it' : 'them'}. Esc cancels.`
        : `${defs[tool.kind].name}: ${defs[tool.kind].note} Goes in: ${roomNames(site.kind, defs[tool.kind])}. Facing ${FACING[rot]} (${turnKey} turns it). Click to place one, or press and drag to lay a row. ${camHint}`
      : tool?.type === 'room' && roomTool
        ? drawn === 'fill'
          ? pending
            ? `${roomTool.name}: fill this courtyard, ${pending} m² for ${money(roomCost(site, tool.room, pending), 0)}. The room takes all the open ground closed in here and shares every wall round it, curved ones included.${note?.rim ? ` The edge of the plot closes ${note.rim} m of it: the room gets a wall of its own there.` : ''} Click to build. ${apartTip}`
            : note?.error
              ? `${roomTool.name}: ${note.error}`
              : `${roomTool.name}: ${roomTool.note} Click open ground that buildings close in, such as the courtyard of a ring or a yard between a building and the edge of the plot, to fill it with this room in one go. Esc cancels.`
          : pending
            ? note?.filled
              ? `${roomTool.name}: this box covers half or more of the courtyard, so the room takes all of it and shares the curved wall all round: ${pending} m² for ${money(roomCost(site, tool.room, pending), 0)}. Click to build, or draw a smaller box for a room that stands clear of the curve. ${apartTip}`
              : `${roomTool.name}: ${pending} m² for ${money(roomCost(site, tool.room, pending), 0)}.${note?.yard ? ` This courtyard is ${note.yard} m²: a box across half of it or more (${Math.ceil(note.yard / 2)} m²) takes all of it.` : ''} Click to build. ${apartTip}`
            : `${roomTool.name}: ${roomTool.note} ${areaHint} Floor laid against a room of the same kind joins it into one room; hold Alt on the second click for a separate room.${note?.yard ? ` This courtyard has a curved wall: a box across half or more of its ${note.yard} m² takes the whole courtyard, so no slivers of ground are left against the curve; a smaller box stays a box.` : ''}`
        : tool?.type === 'clear'
          ? pending
            ? `Demolish ${pending} m² of rooms. Anything inside is sold for half its price.`
            : `Demolish rooms. ${areaHint}`
          : tool?.type === 'ground'
            ? `${GROUNDS.find((x) => x.id === tool.id)?.name}: lay it on open land. Free. ${areaHint}`
            : tool?.type === 'edge'
              ? run
                ? `${edgeDef?.name}: ${run.count} ${run.count === 1 ? 'stretch' : 'stretches'} of wall${run.cost ? ` for ${money(run.cost, 0)}` : ', free'}.${passed} Let go to build. Esc cancels.`
                : `${edgeDef?.name}: click a stretch of wall, or press and drag along a wall to do a run of it; on a curved wall the run follows the curve. ${edgeDef?.note}${edgeTip} ${camHint}`
              : tool?.type === 'rotate'
                ? 'Click an item to turn it a quarter turn.'
                : tool?.type === 'remove'
                  ? run
                    ? run.count
                      ? `Sell ${run.count} ${run.count === 1 ? 'item' : 'items'} for ${money(run.cost, 0)} back. Let go to sell. Esc cancels.`
                      : 'Nothing on that line to sell.'
                    : `Click an item to sell it for half its price, or press and drag across several to sell them all. ${camHint}`
                  : sealed.length
                    ? `${sealed.length === 1 ? `The ${rooms[sealed[0].type].name.toLowerCase()} has` : `${sealed.length} rooms have`} no door, so nothing inside counts. Add one from the Walls tab.`
                    : site.rooms.length
                      ? `${pointAt} Click a room's floor to restyle it. Drag to turn, right-drag or ${keysFor('camForward').slice(0, 1).map(keyName).join('')}${keysFor('camLeft').slice(0, 1).map(keyName).join('')}${keysFor('camBack').slice(0, 1).map(keyName).join('')}${keysFor('camRight').slice(0, 1).map(keyName).join('')} to move, scroll to zoom.${legend}`
                      : 'An empty plot. Open Rooms and mark out your first room.'

  const tiles = builtTiles(site)
  // furniture that only goes in rooms the company cannot build yet stays off the list until it can
  const items = Object.entries(defs).filter(([kind, d]) => d.group === group && itemAllowed(site, kind) && (!room || d.rooms.includes(room.type)) && (!needsOf(site.kind, 'item', kind) || has(g, needsOf(site.kind, 'item', kind) as CapId)))

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
          onRow={onRow}
          onEdges={onEdges}
          onSell={onSell}
          onRun={onRun}
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
          <Btn small data-coach-target="build" className={toolCls} tone={open ? 'default' : 'primary'} active={open} onClick={() => setOpen(!open)}>
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
              <Btn small className="flex items-center gap-[5px] !px-2" tone="ghost" title={light === 'clock' ? `Site time ${clock.time}. The light follows the site clock: day, dusk, then a short night. People come in around eight and go home after five. The clock runs with the game speed and stops when the game is paused.` : `Site time ${clock.time}. The light is held at ${light}; people still keep to the clock. Click to let the light follow the clock again.`} active={light === 'clock'} onClick={() => setLight('clock')}>
                <Icon name="clock" size={15} />
                <span className="num text-[11px]">{clock.time}</span>
                <span className={`text-[9px] uppercase tracking-wider ${light === 'clock' ? 'text-accent' : 'text-faint'}`}>{light === 'clock' ? 'auto' : 'held'}</span>
              </Btn>
            )}
            {(['day', 'dusk', 'night'] as Mood[]).map((m) => (
              <Btn key={m} small className="flex items-center !px-2" tone="ghost" title={`Hold the light at ${m === 'day' ? 'daylight' : m}, whatever the site clock says. People still come and go by the clock.`} active={light === m} onClick={() => setLight(m)}>
                <Icon name={m} size={15} />
              </Btn>
            ))}
          </div>
        </div>
      </div>

      {open && (
        <div data-coach-target="build" className="absolute bottom-12 left-2 top-12 flex w-[262px] flex-col border border-line2 bg-panel/95">
          {/* five tabs in 262 px: the chosen one keeps its name, the others are their icon, named by tooltip and to screen readers */}
          <Tabs fit value={tab} options={(['Rooms', 'Furnish', 'Walls', 'Grounds', 'Look'] as Tab[]).map((x) => ({ value: x, label: x, icon: TAB_ICONS[x] }))} onChange={setTab} />
          {(tab === 'Rooms' || tab === 'Grounds') && (
            <div className="border-b border-line px-2 py-[6px]">
              <div className={`grid gap-1 ${tab === 'Rooms' ? 'grid-cols-5' : 'grid-cols-4'}`}>
                {(tab === 'Rooms' ? ROOM_SHAPES : GROUND_SHAPES).map((sh) => (
                  <Btn key={sh} small className="!h-[34px] !px-0" active={(tab === 'Rooms' ? shape : drawn) === sh} onClick={() => setShape(sh)} title={SHAPE_NOTES[sh]}>
                    <span className="flex flex-col items-center gap-[3px] py-[2px] text-[9px] leading-none">
                      <Icon name={SHAPE_ICONS[sh]} size={14} />
                      {SHAPE_NAMES[sh]}
                    </span>
                  </Btn>
                ))}
              </div>
              {curvy && (
                <div className="mt-1 grid grid-cols-5 gap-1">
                  {ARCS.map((a) => (
                    <Btn key={a.sweep} small className="!h-[34px] !px-0" active={sweep === a.sweep} onClick={() => setSweep(a.sweep)} title={a.note}>
                      <span className="flex flex-col items-center gap-[3px] py-[2px] text-[9px] leading-none">
                        <Icon name={a.icon} size={14} />
                        {a.name}
                      </span>
                    </Btn>
                  ))}
                  <Btn small className="!h-[34px] !px-0" disabled={sweep >= 360} onClick={() => setRot((r) => (r + 1) % 4)} title={sweep < 360 ? `Turn the arc. It is open to the ${OPEN_SIDE[sweep][rot]}.` : 'A full circle has no open side to turn'}>
                    <span className="flex flex-col items-center gap-[3px] py-[2px] text-[9px] leading-none">
                      <Icon name="turn" size={14} />
                      Turn
                    </span>
                  </Btn>
                </div>
              )}
              {shape === 'ring' && (
                <div className="mt-[6px] flex items-center gap-[5px]">
                  <span className="mr-1 text-[10px] uppercase tracking-wider text-dim" title="How deep the building is, from its outer wall to the courtyard">
                    Depth
                  </span>
                  <Btn small className="!px-2" data-repeat aria-label="Shallower" title="Shallower" disabled={thick <= MIN_THICK} onClick={() => setThick((t) => Math.max(MIN_THICK, t - 1))}>
                    -
                  </Btn>
                  <input type="range" aria-label="Depth of the building" min={MIN_THICK} max={16} step={1} value={thick} onChange={(e) => setThick(Number(e.target.value))} className="min-w-0 flex-1" title="How deep the building is, from its outer wall to the courtyard" />
                  <Btn small className="!px-2" data-repeat aria-label="Deeper" title="Deeper" disabled={thick >= 16} onClick={() => setThick((t) => Math.min(16, t + 1))}>
                    +
                  </Btn>
                  <span className="num w-9 text-right text-[11px] text-fg">{thick} m</span>
                </div>
              )}
            </div>
          )}
          {tab === 'Furnish' && <Tabs value={group} options={groups.map((x) => ({ value: x, label: x }))} onChange={setGroup} className="flex-wrap" />}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'Rooms' &&
              Object.entries(rooms).map(([id, r]) => {
                const on = tool?.type === 'room' && tool.room === id
                // a room that comes with a capability the company has not earned yet: dim, and it says what it takes
                const need = needsOf(site.kind, 'room', id) as CapId | undefined
                const shut = !!need && !has(g, need)
                return (
                  <button key={id} onClick={() => (shut ? useStore.getState().showLock(need!) : pick(on ? null : { type: 'room', room: id, shape }))} className={`${row(on)} ${shut ? 'opacity-45' : ''}`}>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-xs uppercase tracking-wider">
                        <span className="h-3 w-3 shrink-0 border border-line2" style={{ background: r.styles[0].floor }} />
                        {r.name}
                        {shut && <Icon name="lock" size={10} />}
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
              groundsFor(site).map((f) => {
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
              <ConfirmBtn small className="flex-1" confirm="Knock it down?" title="Knocks the room down. Everything inside is sold for half its price." onClick={() => (act((s) => removeRoom(s, siteRef, room.n)), sfx.demolish(), setSelected(0))}>
                Demolish
              </ConfirmBtn>
            </div>
          </div>
        </div>
      )}

      {children && <div className="pointer-events-none absolute bottom-12 right-2 top-12 flex w-[270px] flex-col gap-2 overflow-y-auto [&>*]:pointer-events-auto">{children}</div>}

      <div data-bottom-bar className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-2 p-2">
        {cutOff > 0 && (
          <div
            className="pointer-events-auto flex shrink-0 items-center gap-[6px] border border-warn bg-panel/95 px-2 py-[7px] text-[11px] text-warn"
            title="Nobody can walk to these rooms from the street: a room has no door, its door is blocked by furniture, or it only leads into another closed-off room. People who work there appear at their desks instead of walking in. Add or clear a door from the Walls tab."
          >
            <Icon name="alert" size={13} />
            <span className="num">{cutOff}</span>
            <span className="uppercase tracking-wider">{cutOff === 1 ? 'room cut off' : 'rooms cut off'}</span>
          </div>
        )}
        <div className={`pointer-events-auto inline-block min-w-0 max-w-full border bg-panel/95 px-3 py-[7px] text-[11px] ${(sealed.length && !tool) || (tool?.type === 'room' && drawn === 'fill' && note?.error) ? 'border-warn text-warn' : pending || (run && tool) ? 'border-accent text-fg' : 'border-line2 text-dim'}`}>{info}</div>
      </div>
    </div>
  )
}
