// Shared builder for offices, factories and stores: the 3D view fills the
// space, with a floating build palette and whatever stats the screen passes in.
import { type ReactNode, useEffect, useState } from 'react'
import { type Edge, type SiteTool, SiteView } from '../3d/SiteView'
import type { Mood } from '../3d/site/shells'
import { sfx } from '../audio/sfx'
import { paintFloor, placeItem, placeWall, player, removeItem, removeWall, rotateItem } from '../sim/game'
import { FLOORS, ITEMS, type LineStats, WALLS, tierOf, wallAt } from '../sim/sites'
import type { Employee, Product, Site, SiteItem, SiteWall } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Btn, Tabs, money } from './ui'

interface Props {
  /** 'office', 'factory' or 'store:<id>'. */
  siteRef: string
  site: Site
  /** Cards shown down the right-hand side. */
  children?: ReactNode
  seated?: Employee[]
  line?: LineStats | null
  producing?: boolean
  products?: Product[]
  busy?: number
}

const FACING = ['north', 'east', 'south', 'west']

export function SiteBuilder({ siteRef, site, children, seated, line, producing, products, busy }: Props) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const defs = ITEMS[site.kind]
  const groups = [...new Set(Object.values(defs).map((d) => d.group)), 'Walls', 'Floors']
  const [open, setOpen] = useState(true)
  const [group, setGroup] = useState(groups[0])
  const [tool, setTool] = useState<SiteTool>(null)
  const [rot, setRot] = useState(0)
  const [mood, setMood] = useState<Mood>('day')
  const me = player(g)
  const active: SiteTool = tool?.type === 'item' ? { ...tool, rot } : tool

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT') return
      if (e.key.toLowerCase() === 'r') setRot((r) => (r + 1) % 4)
      else if (e.key === 'Escape') setTool(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const report = (err: string | null | void, ok?: () => void) => {
    if (err) say(err, 'bad')
    else ok?.()
  }
  const onTile = (x: number, y: number, item: SiteItem | undefined) => {
    if (!active) return
    if (active.type === 'item') report(act((s) => placeItem(s, siteRef, active.kind, x, y, active.rot)), sfx.cash)
    else if (active.type === 'floor') act((s) => paintFloor(s, siteRef, x, y, active.id))
    else if (active.type === 'rotate' && item) report(act((s) => rotateItem(s, siteRef, item.id)))
    else if (active.type === 'remove' && item) (act((s) => removeItem(s, siteRef, item.id)), sfx.click())
  }
  const onEdge = (e: Edge) => {
    if (active?.type !== 'wall') return
    // clicking a wall of the same kind takes it down again
    if (wallAt(site, e.x, e.y, e.side)?.kind === active.kind) act((s) => removeWall(s, siteRef, e.x, e.y, e.side))
    else report(act((s) => placeWall(s, siteRef, e.x, e.y, e.side, active.kind)), sfx.click)
  }

  const info =
    tool?.type === 'item'
      ? `${defs[tool.kind].name}: ${defs[tool.kind].note} Facing ${FACING[rot]} (press R to turn).`
      : tool?.type === 'wall'
        ? `${WALLS[tool.kind].name}: click a tile edge to build, click it again to remove.`
        : tool?.type === 'floor'
          ? 'Click tiles to change their finish. Flooring is free.'
          : tool?.type === 'rotate'
            ? 'Click an item to turn it a quarter turn.'
            : tool?.type === 'remove'
              ? 'Click an item to sell it for half its price.'
              : 'Pick something to build. Drag to orbit, right-drag to pan, scroll to zoom.'

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div className="absolute inset-0">
        <SiteView key={`${site.kind}-${site.tier}`} site={site} mood={mood} tool={active} company={me.name} color={me.color} logo={me.logo} onTile={onTile} onEdge={onEdge} seated={seated} line={line} producing={producing} products={products} busy={busy} />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
        <div className="pointer-events-auto flex items-center gap-2">
          <Btn small tone={open ? 'default' : 'primary'} active={open} onClick={() => setOpen(!open)}>
            Build
          </Btn>
          <div className="flex border border-line2 bg-panel/95">
            <Btn small tone="ghost" active={tool?.type === 'rotate'} onClick={() => setTool(tool?.type === 'rotate' ? null : { type: 'rotate' })}>
              Turn
            </Btn>
            <Btn small tone="ghost" active={tool?.type === 'remove'} onClick={() => setTool(tool?.type === 'remove' ? null : { type: 'remove' })}>
              Remove
            </Btn>
          </div>
          <span className="num border border-line2 bg-panel/95 px-2 py-[5px] text-[10px] uppercase tracking-wider text-dim">
            {tierOf(site).name} <span className="text-faint">/ {site.w} x {site.h} m</span>
          </span>
        </div>
        <div className="pointer-events-auto flex border border-line2 bg-panel/95">
          {(['day', 'dusk', 'night'] as Mood[]).map((m) => (
            <Btn key={m} small tone="ghost" active={mood === m} onClick={() => setMood(m)}>
              {m}
            </Btn>
          ))}
        </div>
      </div>

      {open && (
        <div className="absolute bottom-12 left-2 top-12 flex w-[250px] flex-col border border-line2 bg-panel/95">
          <Tabs value={group} options={groups.map((x) => ({ value: x, label: x }))} onChange={setGroup} className="flex-wrap" />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {group === 'Walls' &&
              (Object.keys(WALLS) as SiteWall['kind'][]).map((k) => {
                const on = tool?.type === 'wall' && tool.kind === k
                return (
                  <button key={k} onClick={() => setTool(on ? null : { type: 'wall', kind: k })} className={`flex w-full items-baseline justify-between border-b border-l-2 border-b-line px-2 py-[7px] text-left ${on ? 'border-l-accent bg-accent/10 text-accent' : 'border-l-transparent text-fg hover:bg-hover'}`}>
                    <span className="text-xs uppercase tracking-wider">{WALLS[k].name}</span>
                    <span className="num text-[11px] text-dim">{money(WALLS[k].cost)}</span>
                  </button>
                )
              })}
            {group === 'Floors' &&
              FLOORS[site.kind].map((f) => {
                const on = tool?.type === 'floor' && tool.id === f.id
                return (
                  <button key={f.id} onClick={() => setTool(on ? null : { type: 'floor', id: f.id })} className={`flex w-full items-center gap-2 border-b border-l-2 border-b-line px-2 py-[7px] text-left ${on ? 'border-l-accent bg-accent/10 text-accent' : 'border-l-transparent text-fg hover:bg-hover'}`}>
                    <span className="h-4 w-4 shrink-0 border border-line2" style={{ background: f.color }} />
                    <span className="text-xs uppercase tracking-wider">{f.name}</span>
                  </button>
                )
              })}
            {Object.entries(defs)
              .filter(([, d]) => d.group === group)
              .map(([kind, d]) => {
                const on = tool?.type === 'item' && tool.kind === kind
                return (
                  <button key={kind} onClick={() => setTool(on ? null : { type: 'item', kind, rot })} className={`flex w-full items-baseline justify-between gap-2 border-b border-l-2 border-b-line px-2 py-[7px] text-left ${on ? 'border-l-accent bg-accent/10 text-accent' : 'border-l-transparent text-fg hover:bg-hover'}`}>
                    <span className="truncate text-xs uppercase tracking-wider">
                      {d.name}
                      {(d.w > 1 || d.h > 1) && <span className="num ml-2 text-[9px] text-faint">{d.w}x{d.h}</span>}
                    </span>
                    <span className="num shrink-0 text-[11px] text-dim">{money(d.cost)}</span>
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {children && <div className="pointer-events-none absolute bottom-12 right-2 top-12 flex w-[270px] flex-col gap-2 overflow-y-auto [&>*]:pointer-events-auto">{children}</div>}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2">
        <div className="pointer-events-auto inline-block max-w-full border border-line2 bg-panel/95 px-3 py-[7px] text-[11px] text-dim">{info}</div>
      </div>
    </div>
  )
}
