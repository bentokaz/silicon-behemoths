// Hiring, a page of the campus: this month's applicants in one table, and the
// recruiter who can find a stronger batch.
import { sfx } from '../audio/sfx'
import { headhunt, hire } from '../sim/game'
import { HEADHUNT_COST, ROLE_INFO, TRAITS, jobTitle } from '../sim/staff'
import type { Employee, Role } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Level, Name, PeoplePage, ROLE_OPTIONS } from './StaffParts'
import { Btn, type Column, Empty, Help, Panel, Pick, Table, Tag, money, price } from './ui'

/** A job with its article, for a sentence: "a designer", "an engineer". */
const aJob = (role: Role) => {
  const name = ROLE_INFO[role].name.toLowerCase()
  return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`
}

const COLS: Column<Employee>[] = [
  { id: 'name', head: 'Name', cell: (e) => <Name e={e} />, sort: (e) => e.name },
  { id: 'role', head: 'Role', cell: (e) => <span className="text-dim">{jobTitle(e)}</span>, sort: (e) => jobTitle(e), min: 160, drop: 1 },
  { id: 'skill', head: 'Skill', num: true, cell: (e) => <Level value={e.skill} />, sort: (e) => e.skill, min: 92 },
  {
    id: 'traits',
    head: 'Traits',
    cell: (e) => (
      <span className="flex gap-1 pl-2">
        {e.traits.map((t) => (
          <span key={t} title={TRAITS[t]?.note}>
            <Tag>{TRAITS[t]?.name ?? t}</Tag>
          </span>
        ))}
      </span>
    ),
    min: 230,
    drop: 2,
  },
  { id: 'salary', head: 'Salary', title: 'Salary a month. Hiring costs one month of it. Click to sort.', num: true, cell: (e) => price(e.salary), sort: (e) => e.salary, min: 88 },
]

export function StaffHiring({ role, setRole }: { role: 'all' | Role; setRole: (r: 'all' | Role) => void }) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const list = g.candidates.filter((e) => role === 'all' || e.role === role)
  const take = (e: Employee) => {
    const err = act((s) => hire(s, e.id))
    if (err) return say(err, 'bad')
    sfx.confirm()
    say(`${e.name} joined as ${aJob(e.role)}.`)
    // the filter stays, even when that was the last of the job: hire, headhunt, hire again without choosing it twice
  }
  const findMore = () => {
    const err = act((s) => headhunt(s))
    if (err) say(err, 'bad')
    else say('A recruiter found a stronger batch of applicants.')
  }
  return (
    <PeoplePage>
      <Panel
        title="Applicants"
        count={g.candidates.length ? (role === 'all' ? g.candidates.length : `${list.length} of ${g.candidates.length}`) : undefined}
        className="flex-1"
        bodyClass="overflow-y-auto"
        keep="staff:hire"
        right={
          <>
            <Pick label="Role" value={role} options={ROLE_OPTIONS} onChange={setRole} />
            <Help title="How hiring works">Hiring someone costs one month of their salary. A new batch of applicants arrives each month, with at least one for every job; a better-known, more impressive company attracts better ones. A recruiter can bring a stronger batch at once. Everyone you hire needs a desk on the campus before they get anything done.</Help>
            <Btn
              icon="search"
              title="A recruiter replaces this list with a stronger batch at once"
              onClick={findMore}
            >
              Headhunt, {money(HEADHUNT_COST)}
            </Btn>
          </>
        }
      >
        {g.candidates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <Empty icon="hire" text="Everyone who applied this month has been seen. A new batch arrives next month, or a recruiter can find one now." />
            <Btn icon="search" onClick={findMore}>
              Headhunt more, {money(HEADHUNT_COST)}
            </Btn>
          </div>
        ) : list.length === 0 && role !== 'all' ? (
          <div className="flex flex-wrap items-center gap-3 px-3 py-3 text-xs text-dim" data-no-role>
            <span>No {ROLE_INFO[role].name.toLowerCase()} is left among the applicants. A new batch arrives next month, or a recruiter can find one now.</span>
            <Btn small icon="search" title={`A recruiter replaces the list with a stronger batch; the ${ROLE_INFO[role].name.toLowerCase()} filter stays`} onClick={findMore}>
              Headhunt more, {money(HEADHUNT_COST)}
            </Btn>
            <Btn small onClick={() => setRole('all')}>
              Show all roles
            </Btn>
          </div>
        ) : (
          <Table
            label="Applicants"
            cols={COLS}
            rows={list}
            rowKey={(e) => e.id}
            sort={{ col: 'skill', dir: 'desc' }}
            keep="staff:hire"
            firstMin={170}
            actionWidth={88}
            actionAlways={() => true}
            action={(e) => (
              <Btn small icon="hire" data-coach-target={`hire hire-${e.role}`} title={`Costs one month of salary, ${price(e.salary)}`} onClick={() => take(e)}>
                Hire
              </Btn>
            )}
          />
        )}
      </Panel>
    </PeoplePage>
  )
}
