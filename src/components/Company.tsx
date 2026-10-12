// Staff and office screens.
import { useEffect } from 'react'
import { sfx } from '../audio/sfx'
import { assignTeam, autoTeams, createTeam, declineRaise, deleteTeam, fire, fmtDate, giveRaise, headhunt, hire, renameTeam, setLead, setPolicy, train, upgradeOffice } from '../sim/game'
import { has, locked, vacantSeats } from '../sim/progress'
import { ROOMS, SITE_TIERS, builtTiles, reachable, sealedRooms, sumOf, upkeep } from '../sim/sites'
import { HOURS, PERKS, TEAM_SPAN, meetingFactor, perksCost, teamBonus, teamOf, unmanaged } from '../sim/staff'
import type { StaffPolicy } from '../sim/types'
import { EXECS, HEADHUNT_COST, ROLE_INFO, TRAITS, inTraining, jobTitle, marketPay, monthlySalaries, seatedStaff, staffEffects, titleFor, trainingCost } from '../sim/staff'
import { type Employee, ROLES, type Role } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Executives, LockedPane } from './Progress'
import { SiteBuilder } from './SiteBuilder'
import { Icon, roleIcon } from './icons'
import { Btn, Choice, ConfirmBtn, ConfirmIconBtn, Drawer, Empty, Fold, Head, IconBtn, Kpi, Meter, Mini, NameInput, Panel, Row, Tabs, Tag, Th, money, pct, pressable, useKept } from './ui'

// ------------------------------------------------------------------ staff

const skillTone = (s: number) => (s >= 70 ? 'pos' : s >= 45 ? 'accent' : 'dim') as 'pos' | 'accent' | 'dim'
const moraleTone = (m: number) => (m >= 65 ? 'pos' : m >= 40 ? 'warn' : 'neg') as 'pos' | 'warn' | 'neg'

/** The job's icon, in the job's colour. */
function RoleDot({ role, exec }: { role: Role; exec?: Employee['exec'] }) {
  return <Icon name={exec ? 'briefcase' : roleIcon(role)} size={12} className="mr-2 inline-block" style={{ color: exec ? EXECS[exec].color : ROLE_INFO[role].color, verticalAlign: -2 }} />
}

function PersonRow({ e, children, status }: { e: Employee; children?: React.ReactNode; status?: React.ReactNode }) {
  return (
    <>
      <td className="text-fg">
        {e.name}
        {!e.exec && titleFor(e.skill) && <span className="ml-2 text-[10px] text-faint">{titleFor(e.skill)}</span>}
      </td>
      <td className={e.exec ? 'text-fg' : 'text-dim'}>
        <RoleDot role={e.role} exec={e.exec} />
        {jobTitle(e)}
      </td>
      <td className="w-28">
        <div className="flex items-center gap-2">
          <Meter value={e.skill} max={100} tone={skillTone(e.skill)} />
          <span className="num w-6 text-right text-fg">{Math.floor(e.skill)}</span>
        </div>
      </td>
      <td>
        <div className="flex flex-wrap gap-1">
          {e.traits.map((t) => (
            <span key={t} title={TRAITS[t]?.note}>
              <Tag>{TRAITS[t]?.name ?? t}</Tag>
            </span>
          ))}
        </div>
      </td>
      <td className="num r text-dim">{money(e.salary)}</td>
      {status}
      <td className="r">{children}</td>
    </>
  )
}

/** The card for whoever was clicked, on any screen. */
export function PersonCard() {
  const g = useGame()
  const id = useStore((s) => s.person)
  const e = g.staff.find((x) => x.id === id)
  if (!e) return null
  return <EmployeeDrawer e={e} seated={seatedStaff(g).some((x) => x.id === e.id)} onClose={() => useStore.getState().openPerson(null)} />
}

function EmployeeDrawer({ e, seated, onClose }: { e: Employee; seated: boolean; onClose: () => void }) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const market = marketPay(e)
  const training = inTraining(e, g.day)
  const courses = locked(g, 'people')
  return (
    <Drawer open onClose={onClose} width={380} title={e.name}>
      <div className="space-y-3 p-2">
        <div className="grid grid-cols-3 gap-1">
          <Mini label="Role" icon={e.exec ? 'briefcase' : roleIcon(e.role)} value={e.exec ? EXECS[e.exec].short : ROLE_INFO[e.role].name} tone="text-fg" />
          <Mini label="Skill" icon="medal" value={`${Math.floor(e.skill)} of ${e.potential}`} tone="text-fg" />
          <Mini label="Joined" icon="calendar" value={fmtDate(e.hiredDay)} />
        </div>
        {e.exec && (
          <div className="border p-2" style={{ borderColor: EXECS[e.exec].color }}>
            <Head icon="briefcase" className="mb-1 text-faint">
              {EXECS[e.exec].title}
            </Head>
            <div className="text-[11px] leading-snug text-fg">{EXECS[e.exec].effect}</div>
            <div className="mt-1 text-[10px] leading-snug text-faint">The lift follows their skill and morale, and only counts while they have a desk. They would like an executive desk of their own. If the seat falls empty, what it opened stays open: {EXECS[e.exec].gap.charAt(0).toLowerCase() + EXECS[e.exec].gap.slice(1)}</div>
          </div>
        )}
        <div className="border border-line p-2">
          <div className="flex items-baseline justify-between">
            <Head icon="morale" className="text-faint">
              Morale
            </Head>
            <span className={`num text-sm ${{ pos: 'text-pos', warn: 'text-warn', neg: 'text-neg' }[moraleTone(e.morale)]}`}>{Math.round(e.morale)}</span>
          </div>
          <Meter value={e.morale} max={100} tone={moraleTone(e.morale)} />
          <div className="mt-2 text-[10px] leading-snug text-faint">Morale follows office comfort, fair pay, having a desk and the people around them. Unhappy people work less and eventually quit.</div>
        </div>
        <div className="border border-line p-2">
          <Head icon="star" className="mb-1 text-faint">
            Traits
          </Head>
          {e.traits.length === 0 && <div className="text-[11px] text-dim">Nothing unusual.</div>}
          {e.traits.map((t) => (
            <div key={t} className="py-[2px] text-[11px]">
              <span className="text-fg">{TRAITS[t]?.name}</span> <span className="text-dim">{TRAITS[t]?.note}</span>
            </div>
          ))}
        </div>
        <div className="border border-line p-2">
          <Head icon="cash" className="mb-1 text-faint">
            Pay
          </Head>
          <Row icon="cash" k="Salary" v={`${money(e.salary)} / month`} />
          <Row icon="chart" k="Market rate for this skill" v={money(market)} tone={market > e.salary * 1.1 ? 'text-warn' : undefined} />
          {e.ask ? (
            <div className="mt-2">
              <div className="text-[11px] text-warn">Asking for {money(e.ask)} a month.</div>
              <div className="mt-1 flex gap-1">
                <Btn small tone="primary" icon="check" className="flex-1" onClick={() => (act((s) => giveRaise(s, e.id)), sfx.confirm())}>
                  Agree
                </Btn>
                <Btn small icon="close" className="flex-1" onClick={() => act((s) => declineRaise(s, e.id))}>
                  Refuse
                </Btn>
              </div>
            </div>
          ) : (
            <Btn small icon="raise" className="mt-2 w-full" onClick={() => (act((s) => giveRaise(s, e.id)), say(`${e.name} got an 8% raise.`))}>
              Give an 8% raise
            </Btn>
          )}
        </div>
        <div className="border border-line p-2">
          <Head icon="training" className="mb-1 text-faint">
            Development
          </Head>
          {training ? (
            <div className="text-[11px] text-accent">On a course until {fmtDate(e.trainingUntil!)}. Not working until then.</div>
          ) : courses ? (
            <button className="flex w-full items-start gap-[6px] text-left text-[11px] leading-snug text-faint hover:text-dim" onClick={() => useStore.getState().showLock('people')}>
              <Icon name="lock" size={11} className="mt-[2px] shrink-0" />
              Training courses come with a Head of People.
            </button>
          ) : (
            <Btn
              small
              icon="training"
              className="w-full"
              disabled={e.skill >= e.potential}
              onClick={() => {
                const err = act((s) => train(s, e.id))
                if (err) say(err, 'bad')
                else say(`${e.name} starts a 30-day course.`)
              }}
            >
              {e.skill >= e.potential ? 'At full potential' : `Send on a course (${money(trainingCost(e))}, 30 days)`}
            </Btn>
          )}
          {!seated && (
            <div className="mt-2 flex items-center gap-[6px] text-[11px] text-warn">
              <Icon name="desk" size={12} />
              No desk: not contributing. Add a desk on the campus.
            </div>
          )}
        </div>
        <div className={`border border-line p-2 ${has(g, 'teams') ? '' : 'hidden'}`}>
          <Head icon="team" className="mb-1 text-faint">
            Team
          </Head>
          <Choice label="Works in" value={teamOf(g, e.id)?.id ?? ''} options={[{ value: '', label: 'No team' }, ...g.teams.map((t) => ({ value: t.id, label: t.name }))]} onChange={(v) => act((s) => assignTeam(s, e.id, v || null))} />
          {teamOf(g, e.id) && (
            <Btn small icon="crown" className="mt-1 w-full" active={teamOf(g, e.id)?.leadId === e.id} onClick={() => act((s) => setLead(s, teamOf(s, e.id)!.id, teamOf(s, e.id)!.leadId === e.id ? undefined : e.id))}>
              {teamOf(g, e.id)?.leadId === e.id ? 'Leads this team' : 'Make team lead'}
            </Btn>
          )}
        </div>
        <ConfirmBtn small icon="fire" className="w-full" confirm={`Let ${e.name.split(' ')[0]} go for good?`} onClick={() => (act((s) => fire(s, e.id)), onClose(), say(`${e.name} has left the company.`))}>
          Let {e.name.split(' ')[0]} go
        </ConfirmBtn>
      </div>
    </Drawer>
  )
}

export function Staff() {
  const g = useGame()
  const { act, say, setTab } = useStore.getState()
  const [view, setView] = useKept<"team" | "teams" | "policy" | "hire" | "execs">("staff:view", () => (g.staff.length ? "team" : "hire"))
  // "take me there" from a requirement lands on the right view, filtered to the right job
  const hint = useStore((s) => s.hint)
  useEffect(() => {
    if (hint?.tab !== 'staff') return
    if (hint.view === 'team' || hint.view === 'teams' || hint.view === 'policy' || hint.view === 'hire' || hint.view === 'execs') setView(hint.view)
    setRole(hint.role ?? 'all')
    useStore.getState().takeHint()
  }, [hint])
  const lockIcon = (cap: 'teams' | 'people' | 'execs', icon: 'team' | 'policy' | 'briefcase') => (has(g, cap) ? icon : 'lock')
  const gone = vacantSeats(g).length
  const execsWaiting = new Set(g.execPool.map((e) => e.exec)).size
  const loose = unmanaged(g)
  const meet = meetingFactor(g)
  const [role, setRole] = useKept<"all" | Role>("staff:role", "all")
  const setOpenId = useStore.getState().openPerson
  const fx = staffEffects(g)
  const seated = new Set(seatedStaff(g).map((e) => e.id))
  const byRole = (list: Employee[]) => list.filter((e) => role === 'all' || e.role === role)
  const asks = g.staff.filter((e) => e.ask).length
  return (
    <div className="relative flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="grid shrink-0 grid-cols-4 gap-2">
        <Kpi label="Headcount" icon="staff" value={g.staff.length} sub={`${fx.seated} at desks${fx.idle ? `, ${fx.idle} without` : ''}`} tone={fx.idle ? 'warn' : undefined} />
        <Kpi label="Payroll" icon="cash" value={money(monthlySalaries(g))} sub="per month" />
        <Kpi label="Morale" icon="morale" value={g.staff.length ? Math.round(fx.morale) : '--'} tone={g.staff.length ? moraleTone(fx.morale) : undefined} sub={`office comfort ${pct(fx.comfort, 0)}`} />
        <Kpi label="Raise requests" icon="raise" value={asks} tone={asks ? 'warn' : undefined} sub={asks ? 'open a person to respond' : 'none waiting'} />
      </div>
      <div className="grid shrink-0 grid-cols-6 gap-1">
        <Mini label="Research speed" icon="research" value={`${fx.research.toFixed(2)}x`} tone={fx.research > 1 ? 'text-pos' : undefined} />
        <Mini label="Development time" icon="hourglass" value={`${Math.round(fx.devTime * 100)}%`} tone={fx.devTime < 1 ? 'text-pos' : undefined} />
        <Mini label="Design polish" icon="design" value={`+${pct(fx.polish)}`} tone={fx.polish > 0 ? 'text-pos' : undefined} />
        <Mini label="Awareness growth" icon="eye" value={`${fx.marketing.toFixed(2)}x`} tone={fx.marketing > 1 ? 'text-pos' : undefined} />
        <Mini label="Software team" icon="code" value={fx.software.toFixed(1)} tone={fx.software > 0 ? 'text-pos' : undefined} />
        <Mini label="Support, tickets / day" icon="headset" value={Math.round(fx.support + 20)} />
      </div>
      <div className="flex shrink-0 items-center justify-between">
        <Tabs value={view} onChange={setView} options={[{ value: 'team', label: 'People', icon: 'staff', badge: g.staff.length }, { value: 'teams', label: 'Teams', icon: lockIcon('teams', 'team'), badge: loose ? `${loose} unled` : g.teams.length || undefined }, { value: 'policy', label: 'Policies', icon: lockIcon('people', 'policy') }, { value: 'hire', label: 'Applicants', icon: 'hire', badge: g.candidates.length }, { value: 'execs', label: 'Executives', icon: lockIcon('execs', 'briefcase'), badge: !has(g, 'execs') ? undefined : gone ? `${gone} empty` : execsWaiting || undefined }]} className="min-w-0 flex-1" fit />
        <div className="flex gap-1 pl-2">
          <Btn small active={role === 'all'} onClick={() => setRole('all')}>
            All
          </Btn>
          {ROLES.map((r) => (
            <IconBtn key={r} icon={roleIcon(r)} active={role === r} onClick={() => setRole(r)} title={`${ROLE_INFO[r].name}s. ${ROLE_INFO[r].effect}`} />
          ))}
        </div>
      </div>
      <Panel className="flex-1" bodyClass="overflow-auto" keep={`staff:${view}`}>
        {view === 'team' &&
          (g.staff.length === 0 ? (
            <Empty icon="staff" text="Nobody works here yet. You run the company alone until you hire.">
              <Btn tone="primary" icon="hire" onClick={() => setView('hire')}>
                See applicants
              </Btn>
            </Empty>
          ) : (
            <table className="grid-table">
              <thead>
                <tr>
                  <Th icon="person">Name</Th>
                  <Th icon="briefcase">Role</Th>
                  <Th icon="medal">Skill</Th>
                  <Th icon="star">Traits</Th>
                  <Th icon="cash" r>
                    Salary / mo
                  </Th>
                  <Th icon="morale" className="w-24">
                    Morale
                  </Th>
                  <Th icon="info">Status</Th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {byRole(g.staff).map((e) => (
                  <tr key={e.id} className="row cursor-pointer" {...pressable(() => setOpenId(e.id))}>
                    <PersonRow
                      e={e}
                      status={
                        <>
                          <td>
                            <Meter value={e.morale} max={100} tone={moraleTone(e.morale)} />
                          </td>
                          <td>{e.ask ? <Tag tone="warn" icon="raise">wants a raise</Tag> : inTraining(e, g.day) ? <Tag tone="accent" icon="training">training</Tag> : seated.has(e.id) ? <Tag tone="pos" icon="check">working</Tag> : <Tag tone="neg" icon="desk">no desk</Tag>}</td>
                        </>
                      }
                    >
                      <span title="Open">
                        <Icon name="arrowRight" size={11} className="inline-block text-faint" />
                      </span>
                    </PersonRow>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        {view === 'execs' && <Executives />}
        {view === 'teams' && !has(g, 'teams') && <LockedPane id="teams" />}
        {view === 'policy' && !has(g, 'people') && <LockedPane id="people" />}
        {view === 'teams' && has(g, 'teams') && (
          <div className="p-2">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="max-w-[640px] text-[11px] leading-snug text-dim">
                A team with a lead gets more done: the lead gives up part of their own work to lift everyone else, by more the more skilled they are. One lead can look after {TEAM_SPAN} people. Once the company passes {TEAM_SPAN} people, anyone without a lead works at 90%. Teams also need somewhere to meet: one place at a meeting table for every two members.
              </div>
              <div className="flex shrink-0 gap-1">
                <Btn small icon="sort" data-coach-target="teams" onClick={() => (act((s) => autoTeams(s)), sfx.confirm(), say('Everyone was sorted into teams by role.'))} disabled={g.staff.length < 2}>
                  Organise by role
                </Btn>
                <Btn small tone="primary" icon="plus" onClick={() => act((s) => createTeam(s, ''))}>
                  New team
                </Btn>
              </div>
            </div>
            <div className="mb-2 grid grid-cols-4 gap-1">
              <Mini label="Teams with a lead" icon="crown" value={g.teams.filter((t) => teamBonus(g, t) > 0).length} tone="text-fg" />
              <Mini label="People without a lead" icon="person" value={loose} tone={loose ? 'text-warn' : undefined} />
              <Mini label="Meeting places" icon="seat" value={sumOf(g.office, 'meet', reachable(g.office))} />
              <Mini label="Meeting space" icon="rooms" value={meet >= 1 ? 'enough' : `${pct(meet, 0)} effective`} tone={meet >= 1 ? undefined : 'text-warn'} />
            </div>
            {g.teams.length === 0 && <Empty icon="team" text="No teams yet. Create one and add people from their page, or let the game sort everyone by role." />}
            <div className="grid grid-cols-2 gap-2">
              {g.teams.map((t) => {
                const members = t.members.map((id) => g.staff.find((e) => e.id === id)).filter((e): e is Employee => !!e)
                const bonus = teamBonus(g, t)
                return (
                  <div key={t.id} className="border border-line">
                    <div className="flex items-center gap-2 border-b border-line px-2 py-[5px]">
                      <NameInput aria-label="Team name" title="Rename this team" value={t.name} onChange={(v) => act((s) => renameTeam(s, t.id, v))} maxLength={24} className="h-6 flex-1 !border-transparent !bg-transparent !px-0 text-xs uppercase tracking-wider text-fg" />
                      <span className={`num text-[11px] ${bonus > 0 ? 'text-pos' : 'text-warn'}`}>{bonus > 0 ? `+${pct(bonus, 0)} output` : members.length < 2 ? 'needs 2 people' : 'no lead'}</span>
                      <ConfirmIconBtn icon="bin" title={`Disband ${t.name || "this team"}`} onClick={() => act((s) => deleteTeam(s, t.id))} />
                    </div>
                    {members.length > TEAM_SPAN && <div className="border-b border-line px-2 py-1 text-[10px] text-warn">Too many for one lead: the bonus is spread thin.</div>}
                    {members.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 border-b border-line px-2 py-[4px] text-[11px] last:border-b-0">
                        <RoleDot role={e.role} exec={e.exec} />
                        <button className="flex-1 truncate text-left text-fg hover:text-accent" onClick={() => setOpenId(e.id)}>
                          {e.name}
                        </button>
                        <span className="num w-6 text-right text-dim">{Math.floor(e.skill)}</span>
                        <IconBtn icon="crown" tone={t.leadId === e.id ? 'primary' : 'ghost'} title={t.leadId === e.id ? `${e.name} leads this team. Click to stand them down.` : `Make ${e.name} the team lead`} onClick={() => act((s) => setLead(s, t.id, t.leadId === e.id ? undefined : e.id))} />
                        <IconBtn icon="close" tone="ghost" title={`Take ${e.name} off this team`} onClick={() => act((s) => assignTeam(s, e.id, null))} />
                      </div>
                    ))}
                    <div className="px-2 py-[5px]">
                      <Choice label="Add" icon="hire" value="" options={[{ value: '', label: g.staff.some((e) => !teamOf(g, e.id)) ? 'Choose someone without a team' : 'Everyone has a team' }, ...g.staff.filter((e) => !teamOf(g, e.id)).map((e) => ({ value: e.id, label: `${e.name} (${ROLE_INFO[e.role].name.toLowerCase()}, ${Math.floor(e.skill)})` }))]} onChange={(v) => v && act((s) => assignTeam(s, v, t.id))} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {view === 'policy' && has(g, 'people') && (
          <div className="grid grid-cols-2 gap-2 p-2">
            <div className="border border-line p-2">
              <Head icon="clock" className="mb-2 text-faint">
                Working hours
              </Head>
              {(Object.keys(HOURS) as StaffPolicy['hours'][]).map((h) => (
                <button key={h} onClick={() => (act((s) => setPolicy(s, { hours: h })), sfx.toggle())} className={`mb-1 block w-full border p-2 text-left ${g.policy.hours === h ? 'border-accent bg-accent/10' : 'border-line hover:border-line2'}`}>
                  <div className="flex items-baseline justify-between">
                    <span className={`text-xs uppercase tracking-wider ${g.policy.hours === h ? 'text-accent' : 'text-fg'}`}>{HOURS[h].name}</span>
                    <span className="num text-[10px] text-dim">
                      output {Math.round(HOURS[h].output * 100)}% / morale {HOURS[h].morale > 0 ? '+' : ''}
                      {HOURS[h].morale}
                    </span>
                  </div>
                  <div className="mt-[2px] text-[11px] text-dim">{HOURS[h].note}</div>
                </button>
              ))}
            </div>
            <div className="border border-line p-2">
              <Head icon="heart" className="mb-2 text-faint">
                Perks
              </Head>
              {PERKS.map((p, i) => (
                <button key={p.name} onClick={() => (act((s) => setPolicy(s, { perks: i })), sfx.toggle())} className={`mb-1 flex w-full items-baseline justify-between border p-2 text-left ${g.policy.perks === i ? 'border-accent bg-accent/10' : 'border-line hover:border-line2'}`}>
                  <span className={`text-xs uppercase tracking-wider ${g.policy.perks === i ? 'text-accent' : 'text-fg'}`}>{p.name}</span>
                  <span className="num text-[10px] text-dim">
                    {money(p.perHead, 0)} a head / morale +{p.morale}
                  </span>
                </button>
              ))}
              <div className="mt-2 text-[11px] leading-snug text-dim">
                Free lunches, health cover, shuttle buses, on-site childcare. Perks lift everyone's morale and are paid monthly with salaries. At today's headcount: <span className="num text-fg">{money(perksCost(g), 0)}</span> a month.
              </div>
            </div>
          </div>
        )}
        {view === 'hire' && byRole(g.candidates).length === 0 && (
          <Empty icon="hire" text={role === 'all' ? 'Everyone who applied this month has been seen. A new batch arrives next month, or a recruiter can find one now.' : `No ${ROLE_INFO[role].name.toLowerCase()} is applying at the moment. A new batch arrives each month, with at least one of every job.`}>
            {role !== 'all' && (
              <Btn icon="staff" onClick={() => setRole('all')}>
                Show every applicant
              </Btn>
            )}
          </Empty>
        )}
        {view === 'hire' && byRole(g.candidates).length > 0 && (
          <table className="grid-table">
            <thead>
              <tr>
                <Th icon="person">Name</Th>
                <Th icon="briefcase">Role</Th>
                <Th icon="medal">Skill</Th>
                <Th icon="star">Traits</Th>
                <Th icon="cash" r>
                  Salary / mo
                </Th>
                <th />
              </tr>
            </thead>
            <tbody>
              {byRole(g.candidates).map((e) => (
                <tr key={e.id} className="row">
                  <PersonRow e={e}>
                    <Btn
                      small
                      tone="primary"
                      icon="hire"
                      data-coach-target={`hire hire-${e.role}`}
                      onClick={() => {
                        const err = act((s) => hire(s, e.id))
                        if (err) say(err, 'bad')
                        else (sfx.confirm(), say(`${e.name} joined as a ${ROLE_INFO[e.role].name.toLowerCase()}.`))
                      }}
                    >
                      Hire
                    </Btn>
                  </PersonRow>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="text-[10px] text-faint">Hiring costs one month of salary. A new batch of applicants arrives each month; a better-known, more impressive company attracts better ones.</span>
        <div className="flex shrink-0 gap-1 whitespace-nowrap">
          {fx.idle > 0 && (
            <Btn small tone="primary" icon="desk" onClick={() => setTab('office')}>
              Add desks
            </Btn>
          )}
          <Btn
            small
            icon="search"
            onClick={() => {
              const err = act((s) => headhunt(s))
              if (err) say(err, 'bad')
              else (setView('hire'), say('A recruiter found a stronger batch of applicants.'))
            }}
          >
            Headhunt ({money(HEADHUNT_COST, 0)})
          </Btn>
        </div>
      </div>
    </div>
  )
}

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
          <div className="mt-1 text-[10px] leading-snug text-faint">Comfort lifts morale: build a lounge, a fitness room or an atrium garden. Prestige attracts better applicants and helps fan events.</div>
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
        <div className="py-1 text-[10px] leading-snug text-faint">Each holds a station that boosts one person of that role. Stations only go in their own kind of room.</div>
      </Fold>
      <Fold title="More land" icon="plot" open={!!next} bodyClass="p-2">
        {next ? (
          <>
            <div className="text-sm text-fg">{next.name}</div>
            <div className="text-[11px] leading-snug text-dim">{next.blurb}</div>
            <div className="num mt-1 text-[10px] text-faint">
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
            <div className="mt-1 text-[10px] text-faint">Every room and everything in it is rebuilt on the new plot as it stands, with open land all around to grow into.</div>
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
