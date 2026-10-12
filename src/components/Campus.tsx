// Campus, Build: the 3D campus builder with the campus's own figures on its
// status strip, and the toggles that pick people out on it.
import { useEffect } from 'react'
import { sfx } from '../audio/sfx'
import { upgradeOffice } from '../sim/game'
import { ROOMS, SITE_TIERS, builtTiles, reachable, sealedRooms, sumOf, upkeep } from '../sim/sites'
import { seatedStaff, staffEffects } from '../sim/staff'
import { useGame, useStore } from '../store/game'
import { type Highlight, highlightCounts, stillUseful, useHighlight } from '../store/highlight'
import { SiteBuilder } from './SiteBuilder'
import { comfortWord } from './StaffParts'
import { roleIcon } from './icons'
import { Btn, ConfirmBtn, type Figure, Fold, Row, int, money, pct } from './ui'

const TOGGLES: { id: Highlight; label: string; title: string }[] = [
  { id: 'raise', label: 'Raise requests', title: 'Mark the people who are asking for a raise. Click one to answer.' },
  { id: 'unhappy', label: 'Unhappy', title: 'Mark the people whose morale is low. Click one to see why.' },
  { id: 'desks', label: 'Empty desks', title: 'Mark the desks nobody sits at.' },
]

const SPECIALIST = [
  ['lab', 'Research lab', 'researchers', 'researcher'],
  ['eng', 'Hardware workshop', 'hardware engineers', 'engineer'],
  ['server', 'Server room', 'software engineers', 'software'],
  ['studio', 'Design studio', 'designers', 'designer'],
  ['media', 'Marketing suite', 'marketers', 'marketer'],
  ['support', 'Support centre', 'support agents', 'support'],
] as const

export function OfficeScreen() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const fx = staffEffects(g)
  const seated = seatedStaff(g)
  const next = SITE_TIERS.office[g.office.tier + 1]
  const sealed = sealedRooms(g.office)
  const kinds = new Set(g.office.rooms.map((r) => r.type))
  const on = useHighlight((s) => s.on)
  const counts = highlightCounts(g.staff, fx.seats)
  // a highlight with nothing left to mark (the last raise was agreed) is let go of
  const useful = stillUseful(on, counts)
  useEffect(() => {
    if (on !== useful) useHighlight.getState().set(useful)
  }, [on, useful])

  const status: Figure[] = [
    { label: 'Desks', value: `${int(fx.seated)}/${int(fx.seats)}`, tone: fx.idle ? 'warn' : undefined, title: 'Desks with someone at them, out of all the desks people can reach' },
    { label: 'Comfort', value: pct(fx.comfort, 0), tone: g.staff.length && fx.comfort < 0.35 ? 'warn' : undefined, title: `Comfort is ${comfortWord(fx.comfort)}. Lounges, fitness rooms and gardens raise it, and everyone's morale follows.` },
    { label: 'Upkeep a month', value: money(upkeep(g.office)) },
    ...(fx.idle ? [{ label: 'No desk', value: int(fx.idle), tone: 'warn' as const, title: 'People with no desk get nothing done. Desks go to people in the order they were hired.' }] : []),
  ]
  // nobody hired: nothing to pick out, so no toggles at all
  const shown = g.staff.length ? TOGGLES.filter((t) => counts[t.id] > 0) : []
  const tools = shown.length ? (
    <>
      {shown.map((t) => (
        <Btn key={t.id} small active={on === t.id} title={t.title} data-highlight={t.id} onClick={() => useHighlight.getState().toggle(t.id)}>
          {t.label} <span className="num">{int(counts[t.id])}</span>
        </Btn>
      ))}
    </>
  ) : undefined

  return (
    <SiteBuilder siteRef="office" site={g.office} seated={seated} idle={g.staff.filter((e) => !seated.includes(e))} products={g.products.filter((p) => p.companyId === 'player' && p.status !== 'ended').sort((a, b) => b.launchDay - a.launchDay)} status={status} tools={tools}>
      <Fold title="Campus" icon="campus" bodyClass="px-3 py-2">
        <Row k="Rooms" v={int(g.office.rooms.length)} />
        <Row k="Floor built" v={`${int(builtTiles(g.office))} m²`} />
        <Row k="Meeting places" v={int(sumOf(g.office, 'meet', reachable(g.office)))} />
        <Row k="Prestige" v={int(Math.round(fx.prestige))} />
        {sealed.length > 0 && <div className="mt-2 text-[11px] leading-snug text-warn">{sealed.length === 1 ? `The ${ROOMS.office[sealed[0].type].name.toLowerCase()} has no door.` : `${sealed.length} rooms have no door.`} Nothing in a sealed room counts.</div>}
        <div className="mt-2 text-[11px] leading-snug text-dim">Comfort lifts morale: build a lounge, a fitness room or an atrium garden. Prestige attracts better applicants and helps fan events.</div>
      </Fold>
      <Fold title="Specialist rooms" icon="rooms" open={false} bodyClass="px-3 py-2">
        {SPECIALIST.map(([id, name, who, role]) => (
          <Row key={id} icon={roleIcon(role)} k={name} v={kinds.has(id) ? 'Built' : `+25% for ${who}`} tone={kinds.has(id) ? 'text-pos' : undefined} />
        ))}
        <div className="mt-2 text-[11px] leading-snug text-dim">Each holds a station that lifts one person of that job. Stations only go in their own kind of room.</div>
      </Fold>
      <Fold title="More land" icon="plot" open={false} bodyClass="px-3 py-2">
        {next ? (
          <>
            <div className="text-xs text-fg">{next.name}</div>
            <div className="mt-1 text-[11px] leading-snug text-dim">{next.blurb}</div>
            <Row k="Plot" v={`${int(next.w)} x ${int(next.h)} m`} />
            <Row k="Land a month" v={money(next.rent)} />
            <ConfirmBtn
              tone="default"
              confirm={`Pay ${money(next.cost)} and move?`}
              icon="truck"
              className="mt-2 w-full"
              onClick={() => {
                const err = act((s) => upgradeOffice(s))
                if (err) say(err, 'bad')
                else sfx.zone()
              }}
            >
              Move for {money(next.cost)}
            </ConfirmBtn>
            <div className="mt-2 text-[11px] leading-snug text-dim">Every room and everything in it is rebuilt on the new plot as it stands, with open land all around to grow into.</div>
          </>
        ) : (
          <div className="text-[11px] leading-snug text-dim">You own the campus, the largest plot there is. The rest is up to you.</div>
        )}
      </Fold>
    </SiteBuilder>
  )
}
