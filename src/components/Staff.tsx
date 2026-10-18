// The people side of the campus: the People page (with Policies and
// Executives inside it), and the card for one person. Teams and Hiring are
// pages of their own, in StaffTeams.tsx and StaffHiring.tsx.
import { type ReactNode, useEffect, useState } from 'react'
import { sfx } from '../audio/sfx'
import { assignTeam, declineRaise, fire, fmtDate, giveRaise, setLead, train } from '../sim/game'
import { has, locked, lockTip, vacantSeats } from '../sim/progress'
import { EXECS, ROLE_INFO, TRAITS, inTraining, jobTitle, marketPay, monthlySalaries, seatedStaff, staffEffects, teamOf, titleFor, trainingCost } from '../sim/staff'
import type { Employee, Role } from '../sim/types'
import { useGame, useStore, useView } from '../store/game'
import { bestHighlight, highlightCounts, useHighlight } from '../store/highlight'
import { Executives, LockedPane } from './Progress'
import { StaffHiring } from './StaffHiring'
import { type Need, daysToQuit, defaultFilter, factsOf, needCounts, needOf, statusRank } from './StaffNeeds'
import { CARD_W, Level, Name, PeoplePage, ROLE_OPTIONS, comfortWord, moraleText, moraleTone } from './StaffParts'
import { StaffPolicies } from './StaffPolicies'
import { StaffTeams } from './StaffTeams'
import { Btn, Choice, type Column, ConfirmBtn, Drawer, Empty, type Figure, Filters, Head, Meter, Pick, Status, Strip, Table, Tabs, Tag, money, pct, price, useKept } from './ui'

type View = 'team' | 'teams' | 'policy' | 'hire' | 'execs'

/** Go and look at the campus, with whatever most needs seeing picked out there, or the empty desks when those are asked for. */
function showOnCampus(g: { staff: Employee[] }, seats: number, want?: 'desks') {
  const counts = highlightCounts(g.staff, seats)
  useHighlight.getState().set(want ? (counts[want] ? want : null) : bestHighlight(counts))
  useStore.getState().go({ tab: 'office' })
}

// ---------------------------------------------------------------- the card for one person

/** The card for whoever was clicked, on any screen. */
export function PersonCard() {
  const g = useGame()
  const id = useStore((s) => s.person)
  const e = g.staff.find((x) => x.id === id)
  if (!e) return null
  return <EmployeeDrawer e={e} seated={seatedStaff(g).some((x) => x.id === e.id)} onClose={() => useStore.getState().openPerson(null)} />
}

/** One fact about a person: what it is on the left, the fact on the right. */
function Fact({ k, children, num, tone = 'text-fg' }: { k: string; children: ReactNode; num?: boolean; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1 last:border-0">
      <span className="text-[11px] text-dim">{k}</span>
      <span className={`text-xs ${num ? 'num' : ''} ${tone}`}>{children}</span>
    </div>
  )
}

function EmployeeDrawer({ e, seated, onClose }: { e: Employee; seated: boolean; onClose: () => void }) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const market = marketPay(e)
  const training = inTraining(e, g.day)
  const courses = locked(g, 'people')
  const team = teamOf(g, e.id)
  const leads = team?.leadId === e.id
  const first = e.name.split(' ')[0]
  const going = daysToQuit(e)
  const grade = !e.exec && titleFor(e.skill)
  const raiseTo = Math.round((e.salary * 1.08) / 50) * 50
  const tone = moraleTone(e.morale)
  return (
    <Drawer
      open
      onClose={onClose}
      width={CARD_W}
      title={e.name}
      footer={
        <ConfirmBtn icon="fire" className="w-full" confirm={`Let ${first} go for good?`} onClick={() => (act((s) => fire(s, e.id)), onClose(), say(`${e.name} has left the company.`))}>
          Let {first} go
        </ConfirmBtn>
      }
    >
      <div className="space-y-4 p-3">
        {/* the one decision, when there is one */}
        {e.ask ? (
          <section className="border border-warn p-3" data-person-decision>
            <div className="text-xs leading-snug text-fg">
              {first} asks for <span className="num">{price(e.ask)}</span> a month, up from <span className="num">{price(e.salary)}</span>.
            </div>
            <div className="mt-1 text-[11px] leading-snug text-dim">Agreeing lifts their morale. Refusing lowers it, and they will not ask again for six months.</div>
            <div className="mt-3 flex gap-2">
              <Btn tone="primary" large icon="check" className="flex-1" onClick={() => (act((s) => giveRaise(s, e.id)), sfx.confirm(), say(`${e.name} now earns ${price(e.ask!)} a month.`))}>
                Agree
              </Btn>
              <Btn large className="flex-1" onClick={() => (act((s) => declineRaise(s, e.id)), say(`${e.name} was refused a raise.`))}>
                Refuse
              </Btn>
            </div>
          </section>
        ) : !seated ? (
          <section className="border border-neg p-3" data-person-decision>
            <div className="text-xs leading-snug text-fg">{first} has no desk and gets nothing done.</div>
            <div className="mt-1 text-[11px] leading-snug text-dim">Desks go to people in the order they were hired. Add one on the campus.</div>
            <Btn icon="desk" className="mt-3 w-full" onClick={() => showOnCampus(g, staffEffects(g).seats, 'desks')}>
              Add a desk on the campus
            </Btn>
          </section>
        ) : going !== null ? (
          <section className="border border-neg p-3" data-person-decision>
            <div className="text-xs leading-snug text-fg">
              {first} will quit in about <span className="num">{going}</span> {going === 1 ? 'day' : 'days'} unless their morale picks up.
            </div>
            <div className="mt-1 text-[11px] leading-snug text-dim">A raise lifts morale at once. A more comfortable campus, shorter hours and perks lift it over time.</div>
          </section>
        ) : null}

        <section>
          <Fact k="Job">
            {grade ? `${grade} ` : ''}
            {grade ? jobTitle(e).toLowerCase() : jobTitle(e)}
          </Fact>
          <Fact k="Skill" num>
            {Math.floor(e.skill)} <span className="font-sans text-[11px] text-dim">of a possible</span> {e.potential}
          </Fact>
          <Fact k="Salary" num>
            {price(e.salary)} <span className="font-sans text-[11px] text-dim">a month</span>
          </Fact>
          <Fact k="Going rate for this skill" num tone={market > e.salary * 1.1 ? 'text-warn' : 'text-fg'}>
            {price(market)}
          </Fact>
          <Fact k="Joined" num>
            {fmtDate(e.hiredDay)}
          </Fact>
          {!e.ask && (
            <Btn icon="raise" className="mt-2 w-full" onClick={() => (act((s) => giveRaise(s, e.id)), say(`${e.name} now earns ${price(raiseTo)} a month.`))}>
              Raise to {price(raiseTo)}
            </Btn>
          )}
        </section>

        {e.exec && (
          <section>
            <Head icon="briefcase">{EXECS[e.exec].title}</Head>
            <div className="mt-1 text-xs leading-snug text-fg">{EXECS[e.exec].effect}</div>
            <div className="mt-1 text-[11px] leading-snug text-dim">The lift follows their skill and morale, and only counts while they have a desk. They would like an executive desk of their own. If the seat falls empty, what it opened stays open: {EXECS[e.exec].gap.charAt(0).toLowerCase() + EXECS[e.exec].gap.slice(1)}</div>
          </section>
        )}

        <section>
          <Head icon="morale" right={<span className={`num text-xs font-normal ${moraleText(e.morale)}`}>{Math.round(e.morale)}</span>}>
            Morale
          </Head>
          <Meter value={e.morale} max={100} tone={tone ?? 'dim'} className="mt-2" />
          <div className="mt-2 text-[11px] leading-snug text-dim">Morale follows the comfort of the campus, fair pay, having a desk and the people around them. Unhappy people get less done and in the end quit.</div>
        </section>

        {e.traits.length > 0 && (
          <section>
            <Head icon="star">Traits</Head>
            {e.traits.map((t) => (
              <div key={t} className="mt-1 text-[11px] leading-snug">
                <span className="text-fg">{TRAITS[t]?.name ?? t}.</span> <span className="text-dim">{TRAITS[t]?.note}</span>
              </div>
            ))}
          </section>
        )}

        {has(g, 'teams') && (
          <section>
            <Head icon="team">Team</Head>
            <Choice label="Works in" value={team?.id ?? ''} options={[{ value: '', label: 'No team' }, ...g.teams.map((t) => ({ value: t.id, label: t.name }))]} onChange={(v) => act((s) => assignTeam(s, e.id, v || null))} />
            {team && (
              <Btn icon="crown" className="mt-1 w-full" active={leads} onClick={() => act((s) => setLead(s, team.id, leads ? undefined : e.id))}>
                {leads ? `Leads ${team.name}` : `Make ${first} the lead`}
              </Btn>
            )}
          </section>
        )}

        <section>
          <Head icon="training">Training</Head>
          {training ? (
            <div className="mt-1 text-[11px] leading-snug text-fg">On a course until {fmtDate(e.trainingUntil!)}. Not working until then.</div>
          ) : courses ? (
            <Btn className="mt-2 w-full" locked={lockTip(g, 'people') ?? 'Training courses come with a Head of People.'} onLocked={() => useStore.getState().showLock('people')}>
              Send on a course
            </Btn>
          ) : (
            <Btn
              icon="training"
              className="mt-2 w-full"
              disabled={e.skill >= e.potential}
              title={e.skill >= e.potential ? `${first} has learned all they can.` : 'Thirty days away from their desk, then a jump in skill.'}
              onClick={() => {
                const err = act((s) => train(s, e.id))
                if (err) say(err, 'bad')
                else say(`${e.name} starts a 30-day course.`)
              }}
            >
              {e.skill >= e.potential ? 'At full potential' : `Send on a 30-day course, ${money(trainingCost(e))}`}
            </Btn>
          )}
        </section>
      </div>
    </Drawer>
  )
}


// ---------------------------------------------------------------- the People page

/** Up to this many people fit on the page at a glance: no job filter is offered. */
const FEW = 8

const NEED_TAG: Record<Need, { tone: 'warn' | 'neg' | 'dim'; text: (e: Employee) => string }> = {
  raise: { tone: 'warn', text: (e) => `Asks ${price(e.ask ?? 0)}` },
  leaving: { tone: 'neg', text: (e) => (daysToQuit(e) === 1 ? 'May quit tomorrow' : `May quit in ${daysToQuit(e) ?? 0} days`) },
  desk: { tone: 'neg', text: () => 'No desk' },
  lead: { tone: 'dim', text: () => 'No lead' },
}

/** People, with Policies and Executives as two more views of the same page. */
function People({ view }: { view: 'team' | 'policy' | 'execs' }) {
  const g = useGame()
  const { act, say, openPerson, go, setView, showLock } = useStore.getState()
  const open = useStore((s) => s.person)
  const [role, setRole] = useKept<'all' | Role>('staff:role', 'all')
  // the filter picked on this visit: until one is picked, the page opens on whoever needs the player
  const [picked, setPicked] = useState<'needs' | 'all' | null>(null)
  const fx = staffEffects(g)
  const facts = factsOf(g, has(g, 'teams'))
  const needs = needCounts(g.staff, facts)
  const filter = needs.total === 0 ? 'all' : (picked ?? defaultFilter(needs.total))
  const asks = g.staff.filter((e) => e.ask).length
  const gone = has(g, 'execs') ? vacantSeats(g).length : 0

  if (!g.staff.length && view === 'team' && !has(g, 'people') && !has(g, 'execs'))
    return (
      <PeoplePage>
        <section className="flex min-h-0 flex-1 flex-col border border-line bg-panel">
          <Empty icon="staff" text="Nobody works here yet. You run the company alone until you hire.">
            <Btn tone="primary" icon="hire" onClick={() => go({ tab: 'staff', view: 'hire' })}>
              Go to Hiring
            </Btn>
          </Empty>
        </section>
      </PeoplePage>
    )

  const rows = g.staff.filter((e) => (role === 'all' || e.role === role) && (filter === 'all' || needOf(e, facts) !== null))
  const cols: Column<Employee>[] = [
    { id: 'name', head: 'Name', cell: (e) => <Name e={e} />, sort: (e) => e.name },
    { id: 'role', head: 'Role', cell: (e) => <span className="text-dim">{jobTitle(e)}</span>, sort: (e) => jobTitle(e), min: 172, drop: 3 },
    { id: 'skill', head: 'Skill', num: true, cell: (e) => <Level value={e.skill} />, sort: (e) => e.skill, min: 92, drop: 1 },
    { id: 'morale', head: 'Morale', num: true, cell: (e) => <Level value={e.morale} tone={moraleText(e.morale)} />, sort: (e) => e.morale, first: 'asc', min: 92 },
    { id: 'salary', head: 'Salary', title: 'Salary a month. Click to sort.', num: true, cell: (e) => price(e.salary), sort: (e) => e.salary, min: 88, drop: 2 },
    {
      id: 'status',
      head: 'Status',
      title: 'People who need you come first. Click to sort.',
      // someone who is simply working has no status to show
      cell: (e) => {
        const n = needOf(e, facts)
        if (n) return <Status tone={NEED_TAG[n].tone}>{NEED_TAG[n].text(e)}</Status>
        return inTraining(e, g.day) ? <Status tone="accent">On a course</Status> : null
      },
      sort: (e) => statusRank(e, facts, g.day),
      first: 'asc',
      min: 160,
      className: 'pl-4',
    },
  ]

  const figures: Figure[] = [
    { label: 'People', value: g.staff.length },
    { label: 'Payroll a month', value: money(monthlySalaries(g)) },
    { label: 'Morale', value: g.staff.length ? Math.round(fx.morale) : '--', tone: g.staff.length ? moraleTone(fx.morale) : undefined, title: 'The average of everyone. Under 35 a person is unhappy; under 25 for six weeks and they quit.' },
    { label: 'Raise requests', value: asks, tone: asks ? 'warn' : undefined, onClick: asks ? () => (setPicked('needs'), setRole('all'), setView('staff', 'team')) : undefined, title: asks ? 'Show the people who are asking' : undefined },
  ]

  return (
    <PeoplePage>
      {g.staff.length > 0 && (
        <Strip
          items={figures}
          right={
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              <Btn small tone="ghost" title="How pleasant the campus is to work in. Lounges, fitness rooms and gardens raise it, and everyone's morale follows. Opens Campus, Build." onClick={() => go({ tab: 'office' })}>
                Campus comfort is {comfortWord(fx.comfort)}, <span className="num">{pct(fx.comfort, 0)}</span>
              </Btn>
              <Btn small tone="ghost" icon="campus" title="See everyone at their desks, with the people who need you marked. Opens Campus, Build." onClick={() => showOnCampus(g, fx.seats)}>
                Show on the campus
              </Btn>
            </span>
          }
        />
      )}
      <section className="flex min-h-0 flex-1 flex-col border border-line bg-panel">
        <Tabs
          value={view}
          onChange={(v) => setView('staff', v)}
          onLocked={(v) => showLock(v === 'policy' ? 'people' : 'execs')}
          options={[
            { value: 'team', label: 'People' },
            { value: 'policy', label: 'Policies', locked: lockTip(g, 'people') },
            { value: 'execs', label: 'Executives', locked: lockTip(g, 'execs'), badge: gone ? `${gone} empty` : undefined, alert: !!gone },
          ]}
          right={
            // a filter with one choice, or a job pick for a handful of people, is only something more to read
            view === 'team' && (needs.total > 0 || g.staff.length > FEW) ? (
              <>
                {needs.total > 0 && (
                  <Filters
                    label="Which people"
                    value={filter}
                    onChange={setPicked}
                    options={[
                      { value: 'needs', label: 'Needs you', count: needs.total, alert: true },
                      { value: 'all', label: 'All', count: g.staff.length },
                    ]}
                  />
                )}
                {(g.staff.length > FEW || role !== 'all') && <Pick label="Role" value={role} options={ROLE_OPTIONS} onChange={setRole} className="ml-2" />}
              </>
            ) : undefined
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === 'team' &&
            (g.staff.length === 0 ? (
              <Empty icon="staff" text="Nobody works here yet. You run the company alone until you hire.">
                <Btn tone="primary" icon="hire" onClick={() => go({ tab: 'staff', view: 'hire' })}>
                  Go to Hiring
                </Btn>
              </Empty>
            ) : (
              <Table
                label="People"
                cols={cols}
                rows={rows}
                rowKey={(e) => e.id}
                onRow={(e) => openPerson(e.id)}
                selected={open}
                sort={{ col: 'status', dir: 'asc' }}
                keep="staff:people"
                firstMin={170}
                actionWidth={104}
                actionAlways={(e) => !!e.ask}
                action={(e) => {
                  const n = needOf(e, facts)
                  if (n === 'raise')
                    return (
                      <Btn small title={`Pay ${e.name} ${price(e.ask ?? e.salary)} a month`} onClick={() => (act((s) => giveRaise(s, e.id)), sfx.confirm(), say(`${e.name} now earns ${price(e.ask ?? e.salary)} a month.`))}>
                        Agree
                      </Btn>
                    )
                  if (n === 'desk')
                    return (
                      <Btn small tone="ghost" title="Opens Campus, Build" onClick={() => showOnCampus(g, fx.seats, 'desks')}>
                        Add a desk
                      </Btn>
                    )
                  if (n === 'lead')
                    return (
                      <Btn small tone="ghost" title="Opens Campus, Teams" onClick={() => go({ tab: 'staff', view: 'teams' })}>
                        Teams
                      </Btn>
                    )
                  return (
                    <Btn small tone="ghost" onClick={() => openPerson(e.id)}>
                      Open
                    </Btn>
                  )
                }}
                empty={`No ${role === 'all' ? 'one' : ROLE_INFO[role].name.toLowerCase()} ${filter === 'needs' ? 'needs you right now' : 'works here yet'}.`}
              />
            ))}
          {view === 'policy' && (has(g, 'people') ? <StaffPolicies /> : <LockedPane id="people" />)}
          {view === 'execs' && <Executives />}
        </div>
      </section>
    </PeoplePage>
  )
}

export function Staff() {
  const g = useGame()
  const [view] = useView<View>('staff', 'team')
  const [hireRole, setHireRole] = useKept<'all' | Role>('hire:role', 'all')
  // "take me there" from the guide or a requirement lands on Hiring filtered to the job it asked for
  const hint = useStore((s) => s.hint)
  useEffect(() => {
    if (hint?.tab !== 'staff') return
    if ((hint.view ?? view) === 'hire') setHireRole(hint.role ?? 'all')
    useStore.getState().takeHint()
  }, [hint]) // eslint-disable-line react-hooks/exhaustive-deps
  if (view === 'hire') return <StaffHiring role={hireRole} setRole={setHireRole} />
  if (view === 'teams')
    return has(g, 'teams') ? (
      <StaffTeams />
    ) : (
      <PeoplePage>
        <LockedPane id="teams" />
      </PeoplePage>
    )
  return <People view={view} />
}
