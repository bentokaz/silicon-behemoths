// Shared builder for campuses, factories, stores and venues. The 3D view has
// the screen. Over it float only: one row of tools (Build, undo, redo, view,
// light and whatever the screen adds), a one-line status strip that opens for
// its detail, and a one-line hint. The palette for zoning rooms, furnishing
// them and choosing how the building looks is behind Build, closed on every
// visit. Every change goes through the site history, so it can be undone.
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type AreaNote, type AreaShape, type EdgeRun, type RunInfo, type ShowState, type SiteLife, type SiteTool, SiteView, type Target, seatOwners } from '../3d/SiteView'
import { campus, clockText, firstLook, hourOf, moodAt } from '../3d/site/clock'
import type { Mood } from '../3d/site/env'
import type { ViewMode } from '../3d/site/structure'
import { sfx } from '../audio/sfx'
import { MIN_THICK } from '../sim/curves'
import { DIFFICULTY, EDGE_COST, clearZone, fillRoom, lookCost, paintArea, placeItems, player, removeItems, removeRoom, roomCost, rotateItem, setEdges, setLook, setRoomStyle, zoneRoom } from '../sim/game'
import { factoryLife, officeLife, storeLife, venueLife } from '../sim/life'
import { type CapId, capOf, has, lockTip } from '../sim/progress'
import { FACADES, GROUNDS, ITEMS, type ItemDef, type LineStats, MAX_FLOORS, OUT, ROOFS, ROOMS, builtTiles, gridAt, groundsFor, itemAllowed, needsOf, roomNames, roomOf, sealedRooms, upkeep } from '../sim/sites'
import type { Employee, GameState, Product, Site, SiteItem } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { actionFor, keyName, keysFor } from '../store/settings'
import { canRedo, canUndo, forget, record, redo, undo } from '../store/siteHistory'
import { HelpKeys, type HintPart, SiteHint, SiteMenu, SiteStatus } from './SiteChrome'
import { storeMonth } from './SiteInsight'
import { RoomCard, WorldCard } from './WorldCards'
import { Icon, type IconName } from './icons'
import { runningResearch } from './researchNow'
import { Btn, type Figure, IconBtn, Stage3D, Tabs, modalOpen, money, moneyDelta, num } from './ui'

interface Props {
  /** 'office', 'factory', 'venue' or 'store:<id>'. */
  siteRef: string
  site: Site
  /** The site's status in a few figures, for the one-line strip at the top right. Without it the builder makes its own from the site. */
  status?: Figure[]
  /** The detail behind the strip: cards shown under it when it is opened. Closed on every visit. */
  children?: ReactNode
  /** Extra buttons for the row of tools at the top left. */
  tools?: ReactNode
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
const TABS: Tab[] = ['Rooms', 'Furnish', 'Walls', 'Grounds', 'Look']
const VIEWS: { value: ViewMode; label: string; icon: IconName; title: string }[] = [
  { value: 'cut', label: 'Cutaway', icon: 'cutaway', title: 'Walls cut low and no roof: the view to build in' },
  { value: 'walls', label: 'Walls', icon: 'wallsUp', title: 'Walls at full height, no roof' },
  { value: 'full', label: 'Outside', icon: 'outside', title: 'The finished building, with its roof and upper floors' },
]
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
const FACING = ['north', 'east', 'south', 'west']
type EdgeKind = 'door' | 'glass' | 'open' | 'wall'
const EDGE_ICONS: Record<EdgeKind, IconName> = { door: 'door', glass: 'glass', open: 'opening', wall: 'wall' }
const EDGES: { kind: EdgeKind; name: string; note: string }[] = [
  { kind: 'door', name: 'Door', note: 'A way in. Every room needs one.' },
  { kind: 'glass', name: 'Glass wall', note: 'Lets light and views through.' },
  { kind: 'open', name: 'Opening', note: 'Removes the wall so two rooms flow together.' },
  { kind: 'wall', name: 'Plain wall', note: 'Puts the wall back.' },
]
const KIND_NAME: Record<Site['kind'], string> = { office: 'campus', factory: 'factory', store: 'store', venue: 'venue' }

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

/** How far down the view the top row reaches: the tools, and the status line beside or under them (not the detail that hangs from it). */
function useBottom(ref: React.RefObject<HTMLElement | null>, fallback: number): number {
  const [bottom, setBottom] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const parts = () => [el.firstElementChild, el.querySelector('[data-site-status]')].filter(Boolean) as HTMLElement[]
    const measure = () => {
      const top = el.getBoundingClientRect().top - el.offsetTop
      const low = Math.max(0, ...parts().map((p) => p.getBoundingClientRect().bottom - top))
      setBottom(low ? Math.round(low) : fallback)
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    for (const p of parts()) watch.observe(p)
    return () => watch.disconnect()
  }, [ref, fallback])
  return bottom
}

/** A row of the palette: a thing to pick. One that cannot be used is dashed and says why underneath; it is never faded. */
function PickRow({ on, off, why, title, onClick, children, right }: { on: boolean; /** Cannot be used now. */ off?: boolean; /** The reason, shown under the name and on hover. */ why?: string; title?: string; onClick: () => void; children: ReactNode; right?: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} aria-disabled={off ? true : undefined} title={why ?? title} onClick={onClick} className={`flex w-full items-start justify-between gap-2 border-b border-l-2 border-b-line px-2 py-[6px] text-left ${on ? 'border-l-accent bg-accent/10' : off ? 'cursor-not-allowed border-l-transparent' : 'border-l-transparent hover:bg-hover'}`}>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-2 text-xs ${on ? 'text-accent' : off ? 'text-dim' : 'text-fg'}`}>{children}</span>
        {why && (
          <span className="mt-[2px] flex items-center gap-[5px] text-[11px] leading-snug text-dim">
            <Icon name={off ? 'lock' : 'info'} size={10} className="shrink-0" />
            <span className="min-w-0 truncate">{why}</span>
          </span>
        )}
      </span>
      {right !== undefined && <span className={`num shrink-0 text-[11px] leading-4 ${on ? 'text-accent' : 'text-dim'}`}>{right}</span>}
    </button>
  )
}

/** What the builder shows of a site when the screen passes no figures of its own. */
function defaultStatus(site: Site): Figure[] {
  const tiles = builtTiles(site)
  const things = site.items.filter((i) => ITEMS[site.kind][i.kind]).length
  return [
    // a site that works without rooms (an open-air venue) is not "0 m² built": it is open air
    tiles ? { label: 'Built', value: `${num(tiles)} m²`, title: `${num(site.rooms.length)} ${site.rooms.length === 1 ? 'room' : 'rooms'} on a plot of ${site.w} x ${site.h} m` } : { label: 'Built', value: things ? 'Open air' : 'Nothing yet', title: `A plot of ${site.w} x ${site.h} m with no rooms on it` },
    { label: 'Things', value: num(things), title: 'Furniture, machines and fittings standing on the site' },
    { label: 'Upkeep a month', value: money(upkeep(site)), title: 'Land, and keeping every built square metre lit, cleaned and insured' },
  ]
}

export function SiteBuilder({ siteRef, site, status, children, tools, seated, idle, line, producing, products, busy, show }: Props) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const defs = ITEMS[site.kind]
  const rooms = ROOMS[site.kind]
  const groups = useMemo(() => [...new Set(Object.values(defs).map((d) => d.group))], [defs])
  // closed on every visit: the first thing seen is the place, not a list
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState(false)
  const [tab, setTab] = useState<Tab>(site.rooms.length || site.items.length ? 'Furnish' : 'Rooms')
  const [group, setGroup] = useState(groups[0])
  const [tool, setTool] = useState<SiteTool>(null)
  const [rot, setRot] = useState(0)
  const [shape, setShape] = useState<AreaShape>('rect')
  // the first look at a site is always in working hours
  useState(() => firstLook(siteRef))
  const [light, setLight] = useState<Mood | 'clock'>('clock')
  const clock = useSiteClock()
  const mood: Mood = light === 'clock' ? clock.light : light
  const speed = useStore((s) => s.speed)
  const storeId = siteRef.startsWith('store:') ? siteRef.slice(6) : ''
  const rev = useStore((s) => s.rev)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const life = useMemo<SiteLife | undefined>(() => (siteRef === 'office' ? { office: officeLife(g) } : siteRef === 'factory' ? { factory: factoryLife(g) } : storeId ? { store: storeLife(g, storeId) ?? undefined } : siteRef === 'venue' ? { venue: venueLife(g) } : undefined), [g, siteRef, storeId, rev])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const research = useMemo(() => (siteRef === 'office' ? runningResearch(g) : undefined), [g, siteRef, rev])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const month = useMemo(() => (storeId ? storeMonth(g, storeId) : null), [g, storeId, rev])
  const [thick, setThick] = useState(5)
  const [sweep, setSweep] = useState(360)
  const [mode, setMode] = useState<ViewMode>('cut')
  const [selected, setSelected] = useState(0)
  const [pending, setPending] = useState(0)
  const me = player(g)
  /** What can be spent right now: what would cost more is shown as refused before it is clicked. */
  const budget = g.config.unlimitedMoney ? Infinity : g.cash + DIFFICULTY[g.config.difficulty].overdraft
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

  // the history belongs to this visit: leaving the builder drops it
  useEffect(() => () => forget(siteRef), [siteRef])

  // ---- every change is a step that can be undone
  /** Runs one of the sim's building actions as a step. Says whether anything came of it. */
  const step = <T,>(label: string, fn: (s: GameState) => T): { out: T; changed: boolean } => {
    const before = `${site.rev}|${g.cash}`
    const out = act((s) => record(s, siteRef, label, fn))
    return { out, changed: `${site.rev}|${g.cash}` !== before }
  }
  const refuse = (text: string) => say(text, 'bad')
  const undoStep = () => {
    const out = act((s) => undo(s, siteRef))
    if (out.done) {
      sfx.toggle()
      setSelected(0)
      say(`Undone: ${out.label}${out.cash ? `, ${moneyDelta(out.cash)}` : ''}.${out.note ? ` ${out.note}` : ''}`)
    } else if (out.note) refuse(out.note)
  }
  const redoStep = () => {
    const out = act((s) => redo(s, siteRef))
    if (out.done) {
      sfx.toggle()
      setSelected(0)
      say(`Done again: ${out.label}${out.cash ? `, ${moneyDelta(out.cash)}` : ''}.`)
    } else if (out.note) refuse(out.note)
  }
  const undoable = canUndo(g, siteRef)
  const redoable = canRedo(g, siteRef)

  // ---- keys
  const live = useRef({ undoStep, redoStep, note, run, drawn })
  live.current = { undoStep, redoStep, note, run, drawn }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      // not while typing, and not behind a dialog that is waiting for an answer
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || modalOpen() || useStore.getState().game?.gameOver) return
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'KeyZ' || e.code === 'KeyY')) {
        e.preventDefault()
        if (e.code === 'KeyY' || e.shiftKey) live.current.redoStep()
        else live.current.undoStep()
        return
      }
      const action = actionFor(e, ['Building'])
      if (action === 'rotate') setRot((r) => (r + 1) % 4)
      else if (action === 'cancel') {
        // the first press takes back a half-drawn box or a drag (the view does that itself); the next puts the tool away
        const half = (live.current.note?.anchored && live.current.drawn !== 'fill') || (!!live.current.run && !live.current.run.why)
        if (!half) setTool(null)
      } else if (action === 'sell') (setTool((cur) => (cur?.type === 'remove' ? null : { type: 'remove' })), setSelected(0))
      else if (action === 'viewNext') setMode((m) => (m === 'cut' ? 'walls' : m === 'walls' ? 'full' : 'cut'))
      else if (action === 'buildMenu') setOpen((o) => !o)
      else if (action === 'undo') live.current.undoStep()
      else if (action === 'redo') live.current.redoStep()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const pick = (next: SiteTool) => {
    setTool(next)
    if (next) setSelected(0)
  }
  const onTile = (x: number, y: number, item: SiteItem | undefined) => {
    if (!active) {
      // a person at their desk comes before the room they sit in
      const who = item && seatOwners(site, seated ?? []).get(item.id)
      if (who) {
        setSelected(0)
        useStore.getState().openPerson(who.id)
        return false
      }
      setSelected(gridAt(site, x, y))
      return true
    }
    if (active.type === 'rotate') {
      if (!item) return void refuse('There is nothing there to turn. Click a piece of furniture.')
      const { out } = step(`Turn ${defs[item.kind]?.name.toLowerCase() ?? 'item'}`, (s) => rotateItem(s, siteRef, item.id))
      if (out) refuse(out)
      else sfx.toggle()
    }
  }
  /** One sound for a whole run, and a word about it when something did not go as asked. */
  const ran = (out: { done: number; error: string | null }, sound: () => void) => {
    if (out.done) sound()
    if (out.error) refuse(out.error)
  }
  // a click places one; pressing and dragging lays a row, all in one step
  const onRow = (x0: number, y0: number, x1: number, y1: number) => {
    if (active?.type !== 'item') return
    const kind = active.kind
    const turn = active.rot
    ran(step(defs[kind].name, (s) => placeItems(s, siteRef, kind, x0, y0, x1, y1, turn)).out, sfx.build)
  }
  const onEdges = (wall: EdgeRun) => {
    if (active?.type !== 'edge') return
    const kind = active.kind
    ran(step(EDGES.find((e) => e.kind === kind)!.name, (s) => setEdges(s, siteRef, wall, kind)).out, sfx.build)
  }
  const onSell = (ids: string[]) => {
    if (active?.type === 'remove') ran(step(ids.length === 1 ? 'Sale' : `Sale of ${ids.length}`, (s) => removeItems(s, siteRef, ids)).out, sfx.cash)
  }
  const onArea = (x0: number, y0: number, x1: number, y1: number, apart: boolean) => {
    if (!active) return
    // (demolishing and laying ground never fill: see `drawn`)
    const box = active.type !== 'item' && 'shape' in active && active.shape !== 'fill' ? active.shape : 'rect'
    if (active.type === 'room') {
      const type = active.room
      const opts = active.opts
      // one click on a courtyard: the room takes all of it. Otherwise: starting inside a room of the same kind extends it;
      // floor laid against one joins it, unless it is asked to stand apart
      const start = roomOf(site, gridAt(site, x0, y0))
      const into = !apart && start?.type === type ? start.n : undefined
      const { out } = step(rooms[type].name, (s) => (active.shape === 'fill' ? fillRoom(s, siteRef, type, x0, y0, apart) : zoneRoom(s, siteRef, type, x0, y0, x1, y1, box, into, opts, apart)))
      if (out) refuse(out)
      else sfx.zone()
    } else if (active.type === 'clear') {
      const opts = active.opts
      if (step('Demolition', (s) => clearZone(s, siteRef, x0, y0, x1, y1, box, opts)).changed) sfx.demolish()
      else refuse('There are no rooms there to knock down.')
    } else if (active.type === 'ground') {
      const id = active.id
      const opts = active.opts
      if (step(GROUNDS.find((x) => x.id === id)?.name ?? 'Ground', (s) => paintArea(s, siteRef, x0, y0, x1, y1, box, id, opts)).changed) sfx.toggle()
      else refuse('Ground can only be laid on open land, and that is all built on or already laid with it.')
    }
  }
  const onOff = useCallback(() => useStore.getState().say('That is outside your plot. You can build inside the outlined land.', 'bad'), [])
  const look = (name: string, change: { facade?: number; roof?: number; floors?: number }) => {
    const { out } = step(name, (s) => setLook(s, siteRef, change))
    if (out) return refuse(out)
    sfx.zone()
    setMode('full')
  }

  // ---- the card beside whatever was clicked
  const card = (target: Target, close: () => void) => {
    if (target.kind !== 'room') return <WorldCard target={target} close={close} siteRef={siteRef} />
    const r = roomOf(site, Number(target.id))
    if (!r) return null
    const shut = () => (close(), setSelected(0))
    return (
      <RoomCard
        target={target}
        close={shut}
        site={site}
        room={r}
        onStyle={(i) => {
          if (step(`${rooms[r.type].name} finish`, (s) => setRoomStyle(s, siteRef, r.n, i)).changed) sfx.toggle()
        }}
        onFurnish={() => (close(), setTab('Furnish'), setOpen(true))}
        onDemolish={() => {
          step(`${rooms[r.type].name} demolition`, (s) => removeRoom(s, siteRef, r.n))
          sfx.demolish()
          shut()
        }}
      />
    )
  }

  // ---- what is said along the bottom: one line
  const k = (id: string) => keyName(keysFor(id)[0] ?? '')
  const key = (id: string): HintPart[] => (keysFor(id).length ? [{ key: k(id) }] : [])
  const edgeDef = tool?.type === 'edge' ? EDGES.find((e) => e.kind === tool.kind) : undefined
  const roomTool = tool?.type === 'room' ? rooms[tool.room] : undefined
  const itemTool = tool?.type === 'item' ? defs[tool.kind] : undefined
  const things = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`
  let hint: HintPart[]
  let hintTone: 'dim' | 'warn' | 'live' = 'dim'
  if (itemTool) {
    if (run?.why) {
      hintTone = 'warn'
      hint = [`${itemTool.name}: ${run.why.replace(`${itemTool.name} goes in`, 'it goes in')}`, ...key('cancel'), 'puts it away']
    } else if (run) {
      hintTone = 'live'
      hint = [`${itemTool.name}: ${num(run.count)} for ${money(run.cost)}${run.poor ? `, not enough cash for ${num(run.poor)} more` : ''}${run.blocked - (run.poor ?? 0) > 0 ? `, ${things(run.blocked - (run.poor ?? 0), 'spot is', 'spots are')} in the way` : ''}. Let go to place`, ...key('cancel'), 'cancels']
    } else if (itemTool.cost > budget) {
      hintTone = 'warn'
      hint = [`${itemTool.name}: not enough cash, it costs ${money(itemTool.cost)}`, ...key('cancel'), 'puts it away']
    } else hint = [`${itemTool.name}, ${money(itemTool.cost)}: click to place one, drag for a row`, ...key('rotate'), `turns it (facing ${FACING[rot]})`, ...key('cancel'), 'done']
  } else if (tool?.type === 'room' && roomTool) {
    const cost = money(roomCost(site, tool.room, pending))
    if (note?.error) {
      hintTone = 'warn'
      hint = [`${roomTool.name}: ${note.error}`, ...key('cancel'), 'cancels']
    } else if (drawn === 'fill') {
      hintTone = pending ? 'live' : 'dim'
      hint = pending ? [`${roomTool.name}: fill this courtyard, ${num(pending)} m² for ${cost}. Click to build`] : [`${roomTool.name}: click open ground that buildings close in to fill it`, ...key('cancel'), 'done']
    } else if (note?.anchored) {
      hintTone = 'live'
      hint = [`${roomTool.name}: ${num(pending)} m² for ${cost}${note.filled ? ', the whole courtyard' : ''}${note.clears ? `, ${things(note.clears, 'thing', 'things')} standing there sold` : ''}. Click the opposite corner`, { key: 'Alt' }, 'keeps it a room of its own', ...key('cancel'), 'cancels']
    } else hint = [`${roomTool.name}, ${money(roomCost(site, tool.room, 1))} a m²: click one corner, then the opposite one`, ...(curvy && sweep < 360 ? [...key('rotate'), `turns the arc (open to the ${OPEN_SIDE[sweep][rot]})`] : []), ...key('cancel'), 'done']
  } else if (tool?.type === 'clear') {
    if (note?.error) (hintTone = 'warn'), (hint = [`Demolish: ${note.error}`, ...key('cancel'), 'cancels'])
    else if (note?.anchored) (hintTone = 'live'), (hint = [`Demolish ${num(pending)} m². What stands inside is sold at half price. Click the opposite corner`, ...key('cancel'), 'cancels'])
    else hint = ['Demolish: click one corner of what to knock down, then the opposite one', ...key('cancel'), 'done']
  } else if (tool?.type === 'ground') {
    const name = GROUNDS.find((x) => x.id === tool.id)?.name ?? 'Ground'
    if (note?.error) (hintTone = 'warn'), (hint = [`${name}: ${note.error}`, ...key('cancel'), 'cancels'])
    else if (note?.anchored) (hintTone = 'live'), (hint = [`${name}: ${num(pending)} m², free. Click the opposite corner`, ...key('cancel'), 'cancels'])
    else hint = [`${name}, free: click one corner of open land, then the opposite one`, ...key('cancel'), 'done']
  } else if (tool?.type === 'edge' && edgeDef) {
    if (run) {
      const cutShort = run.short ?? 0
      const notWall = run.blocked - cutShort
      hintTone = run.count ? 'live' : 'warn'
      hint = [`${edgeDef.name}: ${things(run.count, 'stretch', 'stretches')} of wall, ${run.cost ? money(run.cost) : 'free'}${notWall > 0 ? `, ${num(notWall)} not wall` : ''}${cutShort ? `, ${num(cutShort)} too short beside a curve` : ''}${run.kept ? `, ${things(run.kept, 'door stays', 'doors stay')}` : ''}. Let go to build`, ...key('cancel'), 'cancels']
    } else hint = [`${edgeDef.name}, ${EDGE_COST[edgeDef.kind] ? `${money(EDGE_COST[edgeDef.kind])} a metre` : 'free'}: click a stretch of wall, or drag along it`, ...key('cancel'), 'done']
  } else if (tool?.type === 'rotate') hint = ['Turn: click a piece of furniture to turn it a quarter turn', ...key('cancel'), 'done']
  else if (tool?.type === 'remove') {
    if (run) (hintTone = run.count ? 'live' : 'warn'), (hint = run.count ? [`Sell ${things(run.count, 'thing', 'things')} for ${money(run.cost)} back. Let go to sell`, ...key('cancel'), 'cancels'] : ['Nothing on that line to sell'])
    else hint = ['Sell: click a thing, or drag across several. Half the price comes back', ...key('cancel'), 'done']
  } else if (sealed.length) {
    hintTone = 'warn'
    hint = [`${sealed.length === 1 ? `The ${rooms[sealed[0].type].name.toLowerCase()} has` : `${num(sealed.length)} rooms have`} no door, so nothing inside counts. Add one under Build, Walls`]
  } else if (!site.rooms.length && !site.items.length) hint = ['An empty plot. Open Build and mark out a first room', ...key('buildMenu')]
  else {
    const what = site.kind === 'office' ? 'Click a person, a bench or a screen to see what is going on there' : site.kind === 'factory' ? 'Click a dock or a test station to see what the line is making' : site.kind === 'store' ? 'Click a checkout or a table to see how the store is doing' : 'Click the stage, the screen or a block of seats to see what it adds'
    hint = [`${what}${site.rooms.length ? ', or a floor to restyle the room' : ''}`]
  }

  const dragTool = tool?.type === 'item' || tool?.type === 'edge' || tool?.type === 'remove'
  const markers = site.kind === 'office' && (idle?.length || (seated ?? []).some((e) => e.ask || e.morale < 35))
  const help = (
    <>
      <div className="t-title mb-1">The view</div>
      <HelpKeys keys={['Drag']}>{dragTool ? 'belongs to the tool in hand: use a middle-drag to turn the view' : 'turns the view'}</HelpKeys>
      <HelpKeys keys={['Right-drag', ...['camForward', 'camLeft', 'camBack', 'camRight'].map(k).filter(Boolean)]}>moves it</HelpKeys>
      <HelpKeys keys={['Scroll', k('camIn'), k('camOut')].filter(Boolean)}>zooms</HelpKeys>
      <HelpKeys keys={[k('camTurnLeft'), k('camTurnRight'), k('camHome')].filter(Boolean)}>turn it, and bring it back to the middle</HelpKeys>
      <HelpKeys keys={[k('viewNext')].filter(Boolean)}>next view: cutaway, walls, outside</HelpKeys>
      <div className="t-title mb-1 mt-3">Building</div>
      <HelpKeys keys={[k('buildMenu')].filter(Boolean)}>opens and closes Build</HelpKeys>
      <HelpKeys keys={['Ctrl+Z', k('undo')].filter(Boolean)}>undo the last change, with its money</HelpKeys>
      <HelpKeys keys={['Ctrl+Shift+Z', k('redo')].filter(Boolean)}>do it again</HelpKeys>
      <HelpKeys keys={[k('rotate')].filter(Boolean)}>turns the thing in hand</HelpKeys>
      <HelpKeys keys={[k('sell')].filter(Boolean)}>the sell tool</HelpKeys>
      <HelpKeys keys={[k('cancel')].filter(Boolean)}>takes back a half-drawn box, then puts the tool away</HelpKeys>
      <div className="mt-2 text-[11px] leading-snug text-dim">Undo on the same day gives back exactly what the step cost. Once a day has passed the building is still put back, but the money follows ordinary prices: things sell at half, building work is not refunded.</div>
      {itemTool && (
        <>
          <div className="t-title mb-1 mt-3">{itemTool.name}</div>
          <div className="text-[11px] leading-snug text-dim">
            {itemTool.note} Goes in: {roomNames(site.kind, itemTool)}.
          </div>
        </>
      )}
      {roomTool && (
        <>
          <div className="t-title mb-1 mt-3">{roomTool.name}</div>
          <div className="text-[11px] leading-snug text-dim">
            {roomTool.note} {SHAPE_NOTES[drawn]}. Floor laid against a room of the same kind joins it into one room; hold Alt on the last click for a separate room. Anything standing on the ground is sold at half price.{note?.yard ? ` This courtyard has a curved wall: a box across half or more of its ${num(note.yard)} m² takes the whole courtyard.` : ''}
            {note?.rim ? ` The edge of the plot closes ${num(note.rim)} m of it: the room gets a wall of its own there.` : ''}
          </div>
        </>
      )}
      {edgeDef && (
        <>
          <div className="t-title mb-1 mt-3">{edgeDef.name}</div>
          <div className="text-[11px] leading-snug text-dim">
            {edgeDef.note} Walls stand wherever two rooms meet, or a room meets the outdoors. On a curved wall a drag follows the curve.
            {edgeDef.kind === 'glass' ? ' Glazing a run leaves the doors in it standing; click a door on its own to glaze over it.' : edgeDef.kind === 'door' || edgeDef.kind === 'open' ? ' It needs a full metre of straight wall or a bay of curved wall.' : ''}
          </div>
        </>
      )}
      {markers ? (
        <>
          <div className="t-title mb-1 mt-3">Markers over people</div>
          <div className="text-[11px] leading-snug text-dim">Red is unhappy or has no desk, gold wants a raise, blue over an empty chair is away on a course.</div>
        </>
      ) : null}
    </>
  )

  // ---- the strip: the screen's figures, or the builder's own, and what is wrong with the building
  const figures: Figure[] = [...(status ?? defaultStatus(site))]
  if (cutOff > 0) figures.push({ label: cutOff === 1 ? 'Room cut off' : 'Rooms cut off', value: num(cutOff), tone: 'warn', icon: 'alert', title: 'Nobody can walk to these rooms from the street: a room has no door, its door is blocked by furniture, or it only leads into another closed-off room. People who work there appear at their desks instead of walking in. Add or clear a door under Build, Walls.' })

  // ---- where things are, so that nothing floating lies on anything else
  const bar = useRef<HTMLDivElement>(null)
  const barBottom = useBottom(bar, 44)
  const PALETTE_W = 288
  const clear = useMemo<[number, number, number, number]>(() => [open ? PALETTE_W + 16 : 8, barBottom + 6, detail && children ? 316 : 8, 44], [open, barBottom, detail, children])

  const tiles = builtTiles(site)
  // furniture that only goes in rooms the company cannot build yet stays off the list until it can
  const items = Object.entries(defs).filter(([kind, d]) => d.group === group && itemAllowed(site, kind) && (!room || d.rooms.includes(room.type)) && (!needsOf(site.kind, 'item', kind) || has(g, needsOf(site.kind, 'item', kind) as CapId)))
  /** Why a piece of furniture cannot be put down yet: its room is not built, or the money is not there. */
  const itemWhy = (d: ItemDef): string | undefined => {
    if (!d.rooms.some((r) => r === OUT || site.rooms.some((x) => x.type === r))) {
      const first = rooms[d.rooms.find((r) => r !== OUT) ?? '']?.name.toLowerCase()
      return first ? `Needs ${/^[aeiou]/.test(first) ? 'an' : 'a'} ${first}${d.rooms.filter((r) => r !== OUT).length > 1 ? ' or another room it goes in' : ''}` : 'Needs a room it goes in'
    }
    return d.cost > budget ? `Not enough cash: ${money(d.cost)}` : undefined
  }
  const lookRow = (name: string, color: string, fitted: boolean, cost: number, onClick: () => void) => {
    const short = !fitted && cost > budget
    return (
      <PickRow key={name} on={fitted} off={short} why={short ? `Not enough cash: ${money(cost)}` : undefined} onClick={() => (fitted ? undefined : short ? refuse(`Not enough cash: ${name.toLowerCase()} costs ${money(cost)}.`) : onClick())} right={fitted ? 'fitted' : cost ? money(cost) : 'free'}>
        <span aria-hidden className="h-3 w-3 shrink-0 border border-line2" style={{ background: color }} />
        {name}
      </PickRow>
    )
  }
  const toolBtn = (type: 'rotate' | 'remove' | 'clear', label: string, icon: IconName, title: string) => (
    <Btn small tone="ghost" icon={icon} title={title} className="flex-1" active={tool?.type === type ? true : undefined} onClick={() => pick(tool?.type === type ? null : type === 'clear' ? { type, shape } : { type })}>
      {label}
    </Btn>
  )

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div className="absolute inset-0 isolate">
        <Stage3D label={`Drawing the ${KIND_NAME[site.kind]}`}>
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
            onOff={onOff}
            budget={budget}
            clear={clear}
            month={month}
            research={research}
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
        </Stage3D>
      </div>

      {/* one row: the tools at the left, the status at the right; the status drops under the tools when there is no room beside them */}
      <div ref={bar} className="pointer-events-none absolute inset-x-2 bottom-12 top-2 z-20 flex flex-wrap content-start items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="flex bg-panel/95">
            <Btn small icon="build" data-coach-target="build" active={open} aria-expanded={open} title={`${open ? 'Close' : 'Open'} the build menu${keysFor('buildMenu').length ? ` (${k('buildMenu')})` : ''}`} onClick={() => setOpen(!open)}>
              Build
            </Btn>
          </div>
          <div className="flex bg-panel/95">
            <IconBtn icon="undo" title={undoable ? `Undo: ${undoable} (Ctrl+Z)` : 'Nothing to undo yet'} disabled={!undoable} onClick={undoStep} />
            <IconBtn icon="redo" title={redoable ? `Redo: ${redoable} (Ctrl+Shift+Z)` : 'Nothing to redo'} disabled={!redoable} className="-ml-px" onClick={redoStep} />
          </div>
          <SiteMenu label="View" value={mode} options={VIEWS} onChange={setMode} />
          <SiteMenu
            label="Light"
            value={light}
            onChange={setLight}
            title={light === 'clock' ? `Site time ${clock.time}. The light follows the site's clock.` : `Site time ${clock.time}. The light is held; people still keep to the clock.`}
            options={[
              { value: 'clock', label: 'Clock', icon: 'clock', note: clock.time, title: 'The light follows the site clock: day, dusk, then a short night. People come in around eight and go home after five. The clock runs with the game speed and stops when the game is paused.' },
              { value: 'day', label: 'Day', icon: 'day', title: 'Hold the light at daylight, whatever the site clock says. People still come and go by the clock.' },
              { value: 'dusk', label: 'Dusk', icon: 'dusk', title: 'Hold the light at dusk. People still come and go by the clock.' },
              { value: 'night', label: 'Night', icon: 'night', title: 'Hold the light at night. People still come and go by the clock.' },
            ]}
          />
          {tools && <div className="flex flex-wrap items-center gap-1 bg-panel/95">{tools}</div>}
        </div>
        <div className="pointer-events-none ml-auto flex max-h-[calc(100%-36px)] min-h-0 max-w-full flex-col items-end gap-2">
          <SiteStatus items={figures} open={detail} onOpen={setDetail}>
            {children}
          </SiteStatus>
        </div>
      </div>

      {open && (
        <div data-coach-target="build" data-site-palette className="absolute left-2 z-10 flex flex-col border border-line2 bg-panel/95" style={{ top: 48, width: PALETTE_W, maxHeight: 'calc(100% - 96px)' }}>
          <Tabs value={tab} options={TABS.map((x) => ({ value: x, label: x }))} onChange={(t) => (setTab(t), setTool(null))} className="[&>button]:flex-1 [&>button]:justify-center [&>button]:px-1" />
          {(tab === 'Rooms' || tab === 'Grounds') && (
            <div className="shrink-0 border-b border-line px-2 py-[6px]">
              <div className={`grid gap-1 ${tab === 'Rooms' ? 'grid-cols-5' : 'grid-cols-4'}`}>
                {(tab === 'Rooms' ? ROOM_SHAPES : GROUND_SHAPES).map((sh) => (
                  <Btn key={sh} small className="!h-[38px] !px-0" active={(tab === 'Rooms' ? shape : drawn) === sh} onClick={() => setShape(sh)} title={SHAPE_NOTES[sh]}>
                    <span className="flex flex-col items-center gap-[3px] text-[11px] leading-none">
                      <Icon name={SHAPE_ICONS[sh]} size={14} />
                      {SHAPE_NAMES[sh]}
                    </span>
                  </Btn>
                ))}
              </div>
              {curvy && (
                <div className="mt-1 grid grid-cols-5 gap-1">
                  {ARCS.map((a) => (
                    <Btn key={a.sweep} small className="!h-[38px] !px-0" active={sweep === a.sweep} onClick={() => setSweep(a.sweep)} title={a.note}>
                      <span className="flex flex-col items-center gap-[3px] text-[11px] leading-none">
                        <Icon name={a.icon} size={14} />
                        {a.name}
                      </span>
                    </Btn>
                  ))}
                  <Btn small className="!h-[38px] !px-0" disabled={sweep >= 360} onClick={() => setRot((r) => (r + 1) % 4)} title={sweep < 360 ? `Turn the arc. It is open to the ${OPEN_SIDE[sweep][rot]}.` : 'A full circle has no open side to turn'}>
                    <span className="flex flex-col items-center gap-[3px] text-[11px] leading-none">
                      <Icon name="turn" size={14} />
                      Turn
                    </span>
                  </Btn>
                </div>
              )}
              {shape === 'ring' && (
                <div className="mt-[6px] flex items-center gap-[5px]">
                  <span className="mr-1 text-[11px] text-dim" title="How deep the building is, from its outer wall to the courtyard">
                    Depth
                  </span>
                  <IconBtn small icon="minus" data-repeat title={thick <= MIN_THICK ? `${MIN_THICK} m is the shallowest a ring can be` : 'Shallower'} disabled={thick <= MIN_THICK} onClick={() => setThick((t) => Math.max(MIN_THICK, t - 1))} />
                  <input type="range" aria-label="Depth of the building" min={MIN_THICK} max={16} step={1} value={thick} onChange={(e) => setThick(Number(e.target.value))} className="min-w-0 flex-1" title="How deep the building is, from its outer wall to the courtyard" />
                  <IconBtn small icon="plus" data-repeat title={thick >= 16 ? '16 m is the deepest a ring can be' : 'Deeper'} disabled={thick >= 16} onClick={() => setThick((t) => Math.min(16, t + 1))} />
                  <span className="num w-9 text-right text-[11px] text-fg">{thick} m</span>
                </div>
              )}
            </div>
          )}
          {tab === 'Furnish' && (
            <div role="group" aria-label="Kind of furniture" className="flex shrink-0 flex-wrap gap-1 border-b border-line px-2 py-[6px]">
              {groups.map((x) => (
                <button key={x} type="button" aria-pressed={group === x} onClick={() => setGroup(x)} className={`h-6 border px-2 text-[11px] ${group === x ? 'border-accent bg-accent/10 text-accent' : 'border-line2 text-dim hover:border-fg hover:text-fg'}`}>
                  {x}
                </button>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'Rooms' &&
              Object.entries(rooms).map(([id, r]) => {
                const on = tool?.type === 'room' && tool.room === id
                // a room that comes with a part of the company not open yet says what opens it
                const need = needsOf(site.kind, 'room', id) as CapId | undefined
                const shut = !!need && !has(g, need)
                const poor = !shut && roomCost(site, id, 1) > budget
                return (
                  <PickRow
                    key={id}
                    on={on}
                    off={shut || poor}
                    why={shut ? `Opens with ${capOf(need!).name}` : poor ? `Not enough cash: ${money(roomCost(site, id, 1))} a m²` : undefined}
                    title={shut ? (lockTip(g, need!) ?? undefined) : r.note}
                    onClick={() => (shut ? useStore.getState().showLock(need!) : poor ? refuse(`Not enough cash: a square metre of ${r.name.toLowerCase()} costs ${money(roomCost(site, id, 1))}.`) : pick(on ? null : { type: 'room', room: id, shape }))}
                    right={`${money(roomCost(site, id, 1))} a m²`}
                  >
                    <span aria-hidden className="h-3 w-3 shrink-0 border border-line2" style={{ background: r.styles[0].floor }} />
                    <span className="min-w-0 truncate">{r.name}</span>
                  </PickRow>
                )
              })}
            {tab === 'Furnish' && room && (
              <div className="flex items-center justify-between border-b border-line py-[2px] pl-2 text-[11px] text-dim">
                <span className="min-w-0 truncate">For the {rooms[room.type].name.toLowerCase()}</span>
                <Btn small tone="ghost" onClick={() => setSelected(0)}>
                  Show all
                </Btn>
              </div>
            )}
            {tab === 'Furnish' &&
              (items.length ? (
                items.map(([kind, d]) => {
                  const on = tool?.type === 'item' && tool.kind === kind
                  const why = itemWhy(d)
                  return (
                    <PickRow key={kind} on={on} off={!!why} why={why} title={`${d.note} Goes in: ${roomNames(site.kind, d)}.`} onClick={() => (why ? refuse(`${d.name}: ${why.charAt(0).toLowerCase()}${why.slice(1)}. It goes in: ${roomNames(site.kind, d)}.`) : pick(on ? null : { type: 'item', kind, rot }))} right={money(d.cost)}>
                      <span className="min-w-0 truncate">{d.name}</span>
                      {(d.w > 1 || d.h > 1) && (
                        <span className="num shrink-0 text-[11px] text-dim">
                          {d.w} x {d.h} m
                        </span>
                      )}
                    </PickRow>
                  )
                })
              ) : (
                <div className="px-2 py-3 text-[11px] text-dim">Nothing of this kind goes in that room.</div>
              ))}
            {tab === 'Walls' &&
              EDGES.map((e) => {
                const on = tool?.type === 'edge' && tool.kind === e.kind
                const cost = EDGE_COST[e.kind]
                const none = !tiles
                return (
                  <PickRow key={e.kind} on={on} off={none} why={none ? 'Needs a room: walls stand where rooms meet' : undefined} title={e.note} onClick={() => (none ? refuse('There are no walls yet. Build a room first.') : pick(on ? null : { type: 'edge', kind: e.kind }))} right={cost ? `${money(cost)} a metre` : 'free'}>
                    <Icon name={EDGE_ICONS[e.kind]} size={13} className="shrink-0" />
                    {e.name}
                  </PickRow>
                )
              })}
            {tab === 'Grounds' &&
              groundsFor(site).map((f) => {
                const on = tool?.type === 'ground' && tool.id === f.id
                return (
                  <PickRow key={f.id} on={on} onClick={() => pick(on ? null : { type: 'ground', id: f.id, shape })} right="free">
                    <span aria-hidden className="h-3 w-3 shrink-0 border border-line2" style={{ background: f.color }} />
                    {f.name}
                  </PickRow>
                )
              })}
            {tab === 'Look' && (
              <>
                <div className="border-b border-line px-2 pb-1 pt-2 text-[11px] text-dim">Cladding</div>
                {FACADES.map((f, i) => lookRow(f.name, f.color, site.facade === i, lookCost(site, { facade: i }), () => look(`${f.name} cladding`, { facade: i })))}
                <div className="border-b border-line px-2 pb-1 pt-2 text-[11px] text-dim">Roof</div>
                {ROOFS.map((r, i) => lookRow(r.name, r.color, site.roof === i, lookCost(site, { roof: i }), () => look(`${r.name} roof`, { roof: i })))}
                <div className="flex items-center justify-between gap-2 px-2 py-2">
                  <span className="text-[11px] text-dim" title="Upper floors hold the departments you do not manage desk by desk. They add prestige and upkeep, and make new rooms cost more.">
                    Storeys <span className="num text-fg">{site.floors}</span>
                  </span>
                  <span className="flex gap-1">
                    <Btn small disabled={site.floors <= 1} title={site.floors <= 1 ? 'A building keeps at least one storey' : 'Take the top storey off. Nothing is refunded.'} onClick={() => look('Storey removed', { floors: site.floors - 1 })}>
                      Remove
                    </Btn>
                    <Btn small disabled={site.floors >= MAX_FLOORS || !tiles || lookCost(site, { floors: site.floors + 1 }) > budget} title={!tiles ? 'Build a room first' : site.floors >= MAX_FLOORS ? `${MAX_FLOORS} storeys is the most a building can have` : lookCost(site, { floors: site.floors + 1 }) > budget ? `Not enough cash: another storey costs ${money(lookCost(site, { floors: site.floors + 1 }))}` : 'Upper floors add prestige and upkeep, and make new rooms cost more'} onClick={() => look('Storey added', { floors: site.floors + 1 })}>
                      Add{tiles && site.floors < MAX_FLOORS ? ` for ${money(lookCost(site, { floors: site.floors + 1 }))}` : ''}
                    </Btn>
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="flex shrink-0 border-t border-line">
            {toolBtn('rotate', 'Turn', 'turn', 'Turn a piece of furniture a quarter turn')}
            {toolBtn('remove', 'Sell', 'sell', `Sell furniture for half its price${keysFor('sell').length ? ` (${k('sell')})` : ''}`)}
            {toolBtn('clear', 'Demolish', 'demolish', 'Knock down rooms. What stands inside is sold for half its price.')}
          </div>
        </div>
      )}

      <SiteHint parts={hint} tone={hintTone} help={help} />
    </div>
  )
}
