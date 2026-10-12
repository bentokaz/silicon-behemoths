// Teams, a page of the campus: each team is a card with its lead and members
// as rows. A person is moved with one pick; "Organise by role" does it all.
import { sfx } from '../audio/sfx'
import { assignTeam, autoTeams, createTeam, deleteTeam, renameTeam, setLead } from '../sim/game'
import { reachable, sumOf } from '../sim/sites'
import { ROLE_INFO, TEAM_SPAN, inTraining, meetingFactor, staffEffects, teamBonus, teamOf, unmanaged } from '../sim/staff'
import type { Employee, Team } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { PeoplePage, RoleDot } from './StaffParts'
import { Btn, ConfirmBtn, ConfirmIconBtn, Empty, type Figure, Help, Mini, NameInput, Panel, Pick, Strip, Tag, int, num, pct, pressable } from './ui'

/** A multiplier as the change it makes: 1.31 is +31%, 0.89 is -11%. */
const lift = (m: number) => `${m > 1 ? '+' : ''}${pct(m - 1, 0)}`

/** A pick that takes a share of its row, its list as wide as that share. */
const PICK = 'min-w-0 [&>select]:w-0 [&>select]:flex-1'

function Member({ e, lead }: { e: Employee; lead?: boolean }) {
  return (
    <div {...pressable(() => useStore.getState().openPerson(e.id))} title={`Open ${e.name}`} className="flex h-8 cursor-pointer items-center gap-2 border-b border-line px-3 text-xs hover:bg-hover">
      <RoleDot role={e.role} exec={e.exec} />
      <span className="min-w-0 flex-1 truncate text-fg">{e.name}</span>
      {lead && (
        <Tag tone="accent" icon="crown">
          Lead
        </Tag>
      )}
    </div>
  )
}

function TeamCard({ t }: { t: Team }) {
  const g = useGame()
  const { act } = useStore.getState()
  const members = t.members.map((id) => g.staff.find((e) => e.id === id)).filter((e): e is Employee => !!e)
  const lead = members.find((e) => e.id === t.leadId)
  const bonus = teamBonus(g, t)
  const others = g.staff.filter((e) => !t.members.includes(e.id)).sort((a, b) => Number(!!teamOf(g, a.id)) - Number(!!teamOf(g, b.id)) || a.name.localeCompare(b.name))
  const state =
    bonus > 0 ? (
      <span className="text-[11px] text-pos" title="How much more each member gets done under this lead">
        <span className="num">+{pct(bonus, 0)}</span> work done
      </span>
    ) : members.length < 2 ? (
      <Tag tone="warn">Needs 2 people</Tag>
    ) : !lead ? (
      <Tag tone="warn">No lead</Tag>
    ) : inTraining(lead, g.day) ? (
      <Tag tone="warn">Lead on a course</Tag>
    ) : null
  return (
    <Panel
      title={<NameInput aria-label="Team name" title="Rename this team" value={t.name} onChange={(v) => act((s) => renameTeam(s, t.id, v))} maxLength={24} className="!h-6 w-36 !border-transparent !bg-transparent !px-0 !text-[13px] font-semibold text-fg hover:!border-line2 focus:!border-accent focus:!px-1" />}
      right={
        <>
          {members.length > TEAM_SPAN && (
            <span title={`One lead can look after ${TEAM_SPAN} people. With more, the lift is spread thin.`}>
              <Tag tone="warn">Over {TEAM_SPAN} people</Tag>
            </span>
          )}
          {state}
          <ConfirmIconBtn icon="bin" title={`Disband ${t.name || 'this team'}`} onClick={() => act((s) => deleteTeam(s, t.id))} />
        </>
      }
    >
      {lead && <Member e={lead} lead />}
      {members
        .filter((e) => e !== lead)
        .map((e) => (
          <Member key={e.id} e={e} />
        ))}
      <div className="flex items-center gap-3 px-3 py-2">
        {members.length > 0 && <Pick label="Lead" className={`${PICK} flex-[3]`} value={lead?.id ?? ''} options={[{ value: '', label: 'Nobody' }, ...members.map((e) => ({ value: e.id, label: `${e.name}, skill ${Math.floor(e.skill)}` }))]} onChange={(v) => act((s) => setLead(s, t.id, v || undefined))} />}
        <Pick
          label="Add"
          className={`${PICK} flex-[2]`}
          value=""
          options={[{ value: '', label: others.length ? 'A person' : 'Nobody left' }, ...others.map((e) => ({ value: e.id, label: `${e.name}, ${ROLE_INFO[e.role].name.toLowerCase()}${teamOf(g, e.id) ? `, from ${teamOf(g, e.id)!.name}` : ''}` }))]}
          onChange={(v) => v && act((s) => assignTeam(s, v, t.id))}
        />
      </div>
    </Panel>
  )
}

export function StaffTeams() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const fx = staffEffects(g)
  const loose = unmanaged(g)
  const meet = meetingFactor(g)
  const places = sumOf(g.office, 'meet', reachable(g.office))
  const wanted = Math.ceil(g.teams.reduce((a, t) => a + (t.leadId ? t.members.length : 0), 0) / 2)
  const free = g.staff.filter((e) => !teamOf(g, e.id))
  // someone "Organise by role" would find a lead for: not under one now, and not the only one in their job
  const led = new Set(g.teams.filter((t) => t.leadId && t.members.length >= 2).flatMap((t) => t.members))
  const missing = g.staff.some((e) => !led.has(e.id) && g.staff.filter((x) => x.role === e.role).length >= 2)
  const organise = () => {
    const err = act((s) => autoTeams(s))
    if (err) return say(err, 'bad')
    sfx.confirm()
    say('Everyone was sorted into teams by role, each under the best lead for it.')
  }
  const figures: Figure[] = [
    { label: 'Teams with a lead', value: g.teams.filter((t) => teamBonus(g, t) > 0).length },
    { label: 'People without a lead', value: loose, tone: loose ? 'warn' : undefined, title: `Once the company passes ${TEAM_SPAN} people, anyone without a lead works at 90%.` },
    { label: 'Meeting places', value: int(places), title: 'Places at meeting tables on the campus. Teams want one for every two members.' },
    ...(meet < 1 ? [{ label: 'Places needed', value: int(wanted), tone: 'warn' as const, title: `Short of meeting places, leads lift their teams by ${pct(meet, 0)} of what they could. Add meeting tables under Campus, Build.` }] : []),
  ]
  return (
    <PeoplePage>
      <Strip
        keep="teams"
        items={figures}
        right={
          <span className="flex shrink-0 items-center gap-1">
            <Help title="How teams work">
              A team with a lead gets more done: the lead gives up part of their own work to lift everyone else, by more the more skilled they are. One lead can look after {TEAM_SPAN} people. Once the company passes {TEAM_SPAN} people, anyone without a lead works at 90%. Teams also need somewhere to meet: one place at a meeting table for every two members. Open a person to move them or take them off a team.
            </Help>
            {g.teams.length > 0 && !missing ? (
              <ConfirmBtn tone="default" icon="sort" data-coach-target="teams" confirm="Replace every team?" title="Disbands the teams you have and sorts everyone again by role" onClick={organise}>
                Organise by role
              </ConfirmBtn>
            ) : (
              <Btn tone={missing ? 'primary' : 'default'} icon="sort" data-coach-target="teams" disabled={g.staff.length < 2} title={g.staff.length < 2 ? 'A team takes at least two people.' : 'Sorts everyone into teams by role and picks the best lead for each'} onClick={organise}>
                Organise by role
              </Btn>
            )}
          </span>
        }
      >
        <div className="p-3">
          <div className="label mb-2">What your people add, with their leads and their hours counted in</div>
          <div className="grid grid-cols-3 gap-1 min-[1100px]:grid-cols-6">
            <Mini label="Research speed" value={lift(fx.research)} tone={fx.research > 1 ? 'text-pos' : undefined} />
            <Mini label="Development time" value={lift(fx.devTime)} tone={fx.devTime < 1 ? 'text-pos' : undefined} />
            <Mini label="Design polish" value={`+${pct(fx.polish)}`} tone={fx.polish > 0 ? 'text-pos' : undefined} />
            <Mini label="Awareness growth" value={lift(fx.marketing)} tone={fx.marketing > 1 ? 'text-pos' : undefined} />
            <Mini label="Software team" value={num(fx.software)} tone={fx.software > 0 ? 'text-pos' : undefined} title="The combined strength of your software engineers" />
            <Mini label="Support tickets a day" value={int(Math.round(fx.support + 20))} />
          </div>
        </div>
      </Strip>
      {g.teams.length === 0 ? (
        <section className="flex min-h-0 flex-1 flex-col border border-line bg-panel">
          <Empty icon="team" text={g.staff.length < 2 ? 'No teams yet. A team takes at least two people.' : 'No teams yet. Organise by role sorts everyone in one go, or start a team and add people to it.'} />
        </section>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] items-start gap-2">
          {g.teams.map((t) => (
            <TeamCard key={t.id} t={t} />
          ))}
          {free.length > 0 && (
            <Panel title="No team" count={free.length}>
              {free.map((e) => (
                <Member key={e.id} e={e} />
              ))}
            </Panel>
          )}
          <Btn icon="plus" className="!h-8" title="Start an empty team and add people to it" onClick={() => act((s) => createTeam(s, ''))}>
            New team
          </Btn>
        </div>
      )}
    </PeoplePage>
  )
}
