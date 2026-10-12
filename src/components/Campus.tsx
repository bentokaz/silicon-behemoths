// Split out of Company.tsx for the interface redesign.
import { useEffect } from 'react'
import { sfx } from '../audio/sfx'
import { assignTeam, autoTeams, createTeam, declineRaise, deleteTeam, fire, fmtDate, giveRaise, headhunt, hire, renameTeam, setLead, setPolicy, train, upgradeOffice } from '../sim/game'
import { has, locked, vacantSeats } from '../sim/progress'
import { ROOMS, SITE_TIERS, builtTiles, reachable, sealedRooms, sumOf, upkeep } from '../sim/sites'
import { HOURS, PERKS, TEAM_SPAN, meetingFactor, perksCost, teamBonus, teamOf, unmanaged } from '../sim/staff'
import type { StaffPolicy } from '../sim/types'
import { EXECS, HEADHUNT_COST, ROLE_INFO, TRAITS, inTraining, jobTitle, marketPay, monthlySalaries, seatedStaff, staffEffects, titleFor, trainingCost } from '../sim/staff'
import { type Employee, ROLES, type Role } from '../sim/types'
import { useGame, useStore, useView } from '../store/game'
import { Executives, LockedPane } from './Progress'
import { SiteBuilder } from './SiteBuilder'
import { Icon, roleIcon } from './icons'
import { Btn, Choice, ConfirmBtn, ConfirmIconBtn, Drawer, Empty, Fold, Head, IconBtn, Kpi, Meter, Mini, NameInput, Panel, Row, Tabs, Tag, Th, money, pct, pressable, useKept } from './ui'

// ------------------------------------------------------------------ office

export function OfficeScreen() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const fx = staffEffects(g)
  const next = SITE_TIERS.office[g.office.tier + 1]
  const sealed = sealedRooms(g.office)
  const kinds = new Set(g.office.rooms.map((r) => r.type))
  return (
    <SiteBuilder siteRef="office" site={g.office} seated={seatedStaff(g)} idle={g.staff.filter((e) => !seatedStaff(g).includes(e))} products={g.products.filter((p) => p.companyId === 'player' && p.status !== 'ended').sort((a, b) => b.launchDay - a.launchDay)}>
      <Fold title="Campus" icon="campus" bodyClass="p-2">
        <div className="grid grid-cols-2 gap-1">
          <Mini label="Desks used" icon="desk" value={`${fx.seated} of ${fx.seats}`} tone={fx.idle ? 'text-warn' : 'text-fg'} />
          <Mini label="Without a desk" icon="person" value={fx.idle} tone={fx.idle ? 'text-warn' : undefined} />
          <Mini label="Rooms" icon="rooms" value={`${g.office.rooms.length} / ${builtTiles(g.office)} m²`} />
          <Mini label="Upkeep / month" icon="receipt" value={money(upkeep(g.office), 1)} />
          <Mini label="Prestige" icon="brand" value={fx.prestige.toFixed(0)} />
          <Mini label="Meeting places" icon="seat" value={sumOf(g.office, 'meet', reachable(g.office))} />
        </div>
        {sealed.length > 0 && <div className="mt-2 text-[11px] text-warn">{sealed.length === 1 ? `The ${ROOMS.office[sealed[0].type].name.toLowerCase()} has no door.` : `${sealed.length} rooms have no door.`} Nothing in a sealed room counts.</div>}
        <div className="mt-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-dim">Comfort</span>
            <span className="num text-[11px] text-fg">{pct(fx.comfort, 0)}</span>
          </div>
          <Meter value={fx.comfort} tone={fx.comfort > 0.7 ? 'pos' : fx.comfort > 0.35 ? 'accent' : 'warn'} />
          <div className="mt-1 text-[11px] leading-snug text-faint">Comfort lifts morale: build a lounge, a fitness room or an atrium garden. Prestige attracts better applicants and helps fan events.</div>
        </div>
      </Fold>
      <Fold title="Specialist rooms" icon="rooms" open={false} bodyClass="px-2 py-1">
        {(
          [
            ['lab', 'Research lab', 'researchers', 'researcher'],
            ['eng', 'Hardware workshop', 'hardware engineers', 'engineer'],
            ['server', 'Server room', 'software engineers', 'software'],
            ['studio', 'Design studio', 'designers', 'designer'],
            ['media', 'Marketing suite', 'marketers', 'marketer'],
            ['support', 'Support centre', 'support agents', 'support'],
          ] as const
        ).map(([id, name, who, role]) => (
          <Row key={id} icon={roleIcon(role)} k={name} v={kinds.has(id) ? 'built' : `+25% for ${who}`} tone={kinds.has(id) ? 'text-pos' : undefined} />
        ))}
        <div className="py-1 text-[11px] leading-snug text-faint">Each holds a station that boosts one person of that role. Stations only go in their own kind of room.</div>
      </Fold>
      <Fold title="More land" icon="plot" open={!!next} bodyClass="p-2">
        {next ? (
          <>
            <div className="text-[13px] text-fg">{next.name}</div>
            <div className="text-[11px] leading-snug text-dim">{next.blurb}</div>
            <div className="num mt-1 text-[11px] text-faint">
              {next.w} x {next.h} m, land {money(next.rent, 1)} / mo
            </div>
            <ConfirmBtn
              confirm={`Pay ${money(next.cost, 1)} and move?`}
              tone="primary"
              icon="truck"
              className="mt-2 h-9 w-full"
              onClick={() => {
                const err = act((s) => upgradeOffice(s))
                if (err) say(err, 'bad')
                else sfx.zone()
              }}
            >
              Move for {money(next.cost, 1)}
            </ConfirmBtn>
            <div className="mt-1 text-[11px] text-faint">Every room and everything in it is rebuilt on the new plot as it stands, with open land all around to grow into.</div>
          </>
        ) : (
          <div className="text-[11px] text-dim">You own the campus, the largest plot there is. The rest is up to you.</div>
        )}
      </Fold>
      <Fold title="Team effects" icon="staff" open={false} bodyClass="px-2 py-1">
        <Row icon="research" k="Research speed" v={`${fx.research.toFixed(2)}x`} />
        <Row icon="hourglass" k="Development time" v={`${Math.round(fx.devTime * 100)}%`} />
        <Row icon="design" k="Design polish" v={`+${pct(fx.polish)}`} />
        <Row icon="eye" k="Awareness growth" v={`${fx.marketing.toFixed(2)}x`} />
        <Row icon="morale" k="Average morale" v={g.staff.length ? Math.round(fx.morale) : '--'} />
      </Fold>
    </SiteBuilder>
  )
}
