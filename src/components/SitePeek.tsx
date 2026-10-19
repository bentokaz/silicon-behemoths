// The card beside the build palette: what a piece of furniture or a kind of
// room does, what it costs to put in and to keep, where it goes and what it
// waits on, shown while the pointer rests on its row. Everything said here is
// read from the simulation's own data, so it cannot drift from what happens.
import { ITEMS, type ItemDef, OUT, ROOMS, ROOM_EFFECT, type RoomDef, TILE_UPKEEP } from '../sim/sites'
import { ROLE_INFO } from '../sim/staff'
import type { SiteKind } from '../sim/types'
import { Icon } from './icons'
import { money, num } from './ui'

const one = (v: number) => (Math.round(v * 10) / 10).toString()

/** What a piece of furniture does, line by line, in the terms the simulation counts. */
export function itemEffects(kind: SiteKind, d: ItemDef): string[] {
  const out: string[] = []
  if (d.seats) out.push('Seats one employee: only seated staff work')
  if (d.station) out.push(`One ${ROLE_INFO[d.station].name.toLowerCase()} works 25% better here`)
  if (d.meet) out.push(`${d.meet} places for team meetings`)
  if (d.comfort && kind === 'office') out.push(`+${one(d.comfort)} comfort, which keeps morale up`)
  if (d.comfort && kind === 'store') out.push(`+${one(d.comfort)} decor, which adds to the store's appeal`)
  if (d.prestige && kind === 'office') out.push(`+${one(d.prestige)} prestige, which draws better applicants`)
  if (d.visitors) out.push(`Serves ${num(d.visitors)} shoppers a day`)
  if (d.crowd) out.push(`${num(d.crowd)} seats for the audience`)
  if (d.show) out.push(`+${one(d.show)} to the production of a show`)
  if (d.cap) out.push(d.stage === 'test' ? `Tests ${num(d.cap)} units a day` : `${num(d.cap)} units a day`)
  if (d.flat) out.push('Lies flat: people walk over it')
  return out
}

function Head({ name, right }: { name: string; right: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5">
      <span className="t-title min-w-0 truncate">{name}</span>
      <span className="num shrink-0 text-xs text-accent">{right}</span>
    </div>
  )
}
function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs leading-5">
      <span className="shrink-0 text-dim">{k}</span>
      <span className="num min-w-0 text-right text-fg">{v}</span>
    </div>
  )
}
function Effects({ lines }: { lines: string[] }) {
  if (!lines.length) return null
  return (
    <ul className="mt-1 flex flex-col gap-[3px]">
      {lines.map((l) => (
        <li key={l} className="flex items-start gap-2 text-xs leading-snug text-fg">
          <span aria-hidden className="mt-[5px] h-[5px] w-[5px] shrink-0 bg-accent" />
          {l}
        </li>
      ))}
    </ul>
  )
}
function Why({ text }: { text?: string }) {
  if (!text) return null
  return (
    <div className="mt-2 flex items-start gap-[6px] border-t border-line pt-2 text-xs leading-snug text-warn">
      <Icon name="lock" size={11} className="mt-[2px] shrink-0" />
      <span>{text}</span>
    </div>
  )
}

/** A piece of furniture: its effect, its price and running cost, where it goes, and why it cannot be had yet. */
export function ItemPeek({ kind, def, why }: { kind: SiteKind; def: ItemDef; why?: string }) {
  const homes = def.rooms.map((r) => (r === OUT ? 'Open ground' : ROOMS[kind][r]?.name)).filter(Boolean)
  return (
    <>
      <Head name={def.name} right={money(def.cost)} />
      <div className="px-4 py-3">
        <div className="text-xs leading-snug text-dim">{def.note}</div>
        <Effects lines={itemEffects(kind, def)} />
        <div className="mt-2 border-t border-line pt-1">
          <Line k="Size" v={`${def.w} x ${def.h} m`} />
          <Line k="Running cost" v={def.run ? `${money(def.run)} a day` : 'none'} />
          <Line k="Sold back for" v={money(def.cost / 2)} />
        </div>
        <div className="mt-1 text-xs leading-snug">
          <span className="text-dim">Goes in: </span>
          <span className="text-fg">{homes.join(', ')}</span>
        </div>
        <Why text={why} />
      </div>
    </>
  )
}

/** A kind of room: what it is for, what a square metre costs to build and to keep, and what can stand in it. */
export function RoomPeek({ kind, id, def, perM2, floors, why }: { kind: SiteKind; id: string; def: RoomDef; /** Build cost of a square metre, upper floors included. */ perM2: number; floors: number; why?: string }) {
  const takes = Object.values(itemsFor(kind, id)).map((d) => d.name)
  return (
    <>
      <Head name={def.name} right={`${money(perM2)} a m²`} />
      <div className="px-4 py-3">
        <div className="text-xs leading-snug text-fg">{ROOM_EFFECT[kind]?.[id] ?? def.note}</div>
        {ROOM_EFFECT[kind]?.[id] && <div className="mt-1 text-xs leading-snug text-dim">{def.note}</div>}
        <div className="mt-2 border-t border-line pt-1">
          <Line k="Upkeep" v={`${money(TILE_UPKEEP * floors)} a m² a month`} />
          <Line k="Finishes" v={num(def.styles.length)} />
        </div>
        {takes.length > 0 && (
          <div className="mt-1 text-xs leading-snug">
            <span className="text-dim">Takes: </span>
            <span className="text-fg">{takes.join(', ')}</span>
          </div>
        )}
        <Why text={why} />
      </div>
    </>
  )
}

/** The furniture that can stand in a kind of room. */
const itemsFor = (kind: SiteKind, room: string): Record<string, ItemDef> => Object.fromEntries(Object.entries(ITEMS[kind]).filter(([, d]) => d.rooms.includes(room)))
