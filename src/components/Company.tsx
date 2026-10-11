// Staff and office screens, plus the company logo uploader.
import { useRef, useState } from 'react'
import { sfx } from '../audio/sfx'
import { assignTeam, autoTeams, createTeam, declineRaise, deleteTeam, fire, fmtDate, giveRaise, headhunt, hire, renameTeam, setLead, setPolicy, train, upgradeOffice } from '../sim/game'
import { ROOMS, SITE_TIERS, builtTiles, reachable, sealedRooms, sumOf, upkeep } from '../sim/sites'
import { HOURS, PERKS, TEAM_SPAN, meetingFactor, perksCost, teamBonus, teamOf, unmanaged } from '../sim/staff'
import type { StaffPolicy } from '../sim/types'
import { HEADHUNT_COST, ROLE_INFO, TRAITS, inTraining, monthlySalaries, salaryFor, seatedStaff, staffEffects, titleFor, trainingCost } from '../sim/staff'
import { type Employee, ROLES, type Role } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { SiteBuilder } from './SiteBuilder'
import { Btn, Choice, Drawer, Empty, Fold, Kpi, Meter, Mini, Panel, Row, Tabs, Tag, TextInput, money, pct } from './ui'

// ------------------------------------------------------------------ logo

/** Read an image file and return it as a 256 px square PNG data URL. */
export function readLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Choose an image file'))
    if (file.size > 8e6) return reject(new Error('That image is larger than 8 MB'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = 256
      const scale = Math.min(256 / img.width, 256 / img.height)
      const w = img.width * scale
      const h = img.height * scale
      c.getContext('2d')!.drawImage(img, (256 - w) / 2, (256 - h) / 2, w, h)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error('That file could not be read as an image')))
    img.src = url
  })
}

export function LogoPicker({ value, onChange }: { value?: string; onChange: (logo: string | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const { say } = useStore.getState()
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-line2 bg-raise">{value ? <img src={value} alt="Company logo" className="h-full w-full object-contain" /> : <span className="label text-faint">none</span>}</div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) readLogo(file).then(onChange, (err: Error) => say(err.message, 'bad'))
        }}
      />
      <Btn small onClick={() => input.current?.click()}>
        {value ? 'Replace' : 'Upload logo'}
      </Btn>
      {value && (
        <Btn small tone="ghost" onClick={() => onChange(undefined)}>
          Remove
        </Btn>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ staff

const skillTone = (s: number) => (s >= 70 ? 'pos' : s >= 45 ? 'accent' : 'dim') as 'pos' | 'accent' | 'dim'
const moraleTone = (m: number) => (m >= 65 ? 'pos' : m >= 40 ? 'warn' : 'neg') as 'pos' | 'warn' | 'neg'

function RoleDot({ role }: { role: Role }) {
  return <span className="mr-2 inline-block h-2 w-2" style={{ background: ROLE_INFO[role].color }} />
}

function PersonRow({ e, children, status }: { e: Employee; children?: React.ReactNode; status?: React.ReactNode }) {
  return (
    <>
      <td className="text-fg">
        {e.name}
        {titleFor(e.skill) && <span className="ml-2 text-[10px] text-faint">{titleFor(e.skill)}</span>}
      </td>
      <td className="text-dim">
        <RoleDot role={e.role} />
        {ROLE_INFO[e.role].name}
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

function EmployeeDrawer({ e, seated, onClose }: { e: Employee; seated: boolean; onClose: () => void }) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const market = salaryFor(e.skill)
  const training = inTraining(e, g.day)
  return (
    <Drawer open onClose={onClose} width={380} title={e.name}>
      <div className="space-y-3 p-2">
        <div className="grid grid-cols-3 gap-1">
          <Mini label="Role" value={ROLE_INFO[e.role].name} tone="text-fg" />
          <Mini label="Skill" value={`${Math.floor(e.skill)} of ${e.potential}`} tone="text-fg" />
          <Mini label="Joined" value={fmtDate(e.hiredDay)} />
        </div>
        <div className="border border-line p-2">
          <div className="flex items-baseline justify-between">
            <span className="label text-faint">Morale</span>
            <span className={`num text-sm ${{ pos: 'text-pos', warn: 'text-warn', neg: 'text-neg' }[moraleTone(e.morale)]}`}>{Math.round(e.morale)}</span>
          </div>
          <Meter value={e.morale} max={100} tone={moraleTone(e.morale)} />
          <div className="mt-2 text-[10px] leading-snug text-faint">Morale follows office comfort, fair pay, having a desk and the people around them. Unhappy people work less and eventually quit.</div>
        </div>
        <div className="border border-line p-2">
          <div className="label mb-1 text-faint">Traits</div>
          {e.traits.length === 0 && <div className="text-[11px] text-dim">Nothing unusual.</div>}
          {e.traits.map((t) => (
            <div key={t} className="py-[2px] text-[11px]">
              <span className="text-fg">{TRAITS[t]?.name}</span> <span className="text-dim">{TRAITS[t]?.note}</span>
            </div>
          ))}
        </div>
        <div className="border border-line p-2">
          <div className="label mb-1 text-faint">Pay</div>
          <Row k="Salary" v={`${money(e.salary)} / month`} />
          <Row k="Market rate for this skill" v={money(market)} tone={market > e.salary * 1.1 ? 'text-warn' : undefined} />
          {e.ask ? (
            <div className="mt-2">
              <div className="text-[11px] text-warn">Asking for {money(e.ask)} a month.</div>
              <div className="mt-1 flex gap-1">
                <Btn small tone="primary" className="flex-1" onClick={() => (act((s) => giveRaise(s, e.id)), sfx.confirm())}>
                  Agree
                </Btn>
                <Btn small className="flex-1" onClick={() => act((s) => declineRaise(s, e.id))}>
                  Refuse
                </Btn>
              </div>
            </div>
          ) : (
            <Btn small className="mt-2 w-full" onClick={() => (act((s) => giveRaise(s, e.id)), say(`${e.name} got an 8% raise.`))}>
              Give an 8% raise
            </Btn>
          )}
        </div>
        <div className="border border-line p-2">
          <div className="label mb-1 text-faint">Development</div>
          {training ? (
            <div className="text-[11px] text-accent">On a course until {fmtDate(e.trainingUntil!)}. Not working until then.</div>
          ) : (
            <Btn
              small
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
          {!seated && <div className="mt-2 text-[11px] text-warn">No desk: not contributing. Add a desk on the campus.</div>}
        </div>
        <div className="border border-line p-2">
          <div className="label mb-1 text-faint">Team</div>
          <Choice label="Works in" value={teamOf(g, e.id)?.id ?? ''} options={[{ value: '', label: 'No team' }, ...g.teams.map((t) => ({ value: t.id, label: t.name }))]} onChange={(v) => act((s) => assignTeam(s, e.id, v || null))} />
          {teamOf(g, e.id) && (
            <Btn small className="mt-1 w-full" active={teamOf(g, e.id)?.leadId === e.id} onClick={() => act((s) => setLead(s, teamOf(s, e.id)!.id, teamOf(s, e.id)!.leadId === e.id ? undefined : e.id))}>
              {teamOf(g, e.id)?.leadId === e.id ? 'Leads this team' : 'Make team lead'}
            </Btn>
          )}
        </div>
        <Btn small tone="danger" className="w-full" onClick={() => (act((s) => fire(s, e.id)), onClose())}>
          Let {e.name.split(' ')[0]} go
        </Btn>
      </div>
    </Drawer>
  )
}

export function Staff() {
  const g = useGame()
  const { act, say, setTab } = useStore.getState()
  const [view, setView] = useState<'team' | 'teams' | 'policy' | 'hire'>(g.staff.length ? 'team' : 'hire')
  const loose = unmanaged(g)
  const meet = meetingFactor(g)
  const [role, setRole] = useState<'all' | Role>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const fx = staffEffects(g)
  const seated = new Set(seatedStaff(g).map((e) => e.id))
  const open = g.staff.find((e) => e.id === openId)
  const byRole = (list: Employee[]) => list.filter((e) => role === 'all' || e.role === role)
  const asks = g.staff.filter((e) => e.ask).length
  return (
    <div className="relative flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="grid shrink-0 grid-cols-4 gap-2">
        <Kpi label="Headcount" value={g.staff.length} sub={`${fx.seated} at desks${fx.idle ? `, ${fx.idle} without` : ''}`} tone={fx.idle ? 'warn' : undefined} />
        <Kpi label="Payroll" value={money(monthlySalaries(g))} sub="per month" />
        <Kpi label="Morale" value={g.staff.length ? Math.round(fx.morale) : '--'} tone={g.staff.length ? moraleTone(fx.morale) : undefined} sub={`office comfort ${pct(fx.comfort, 0)}`} />
        <Kpi label="Raise requests" value={asks} tone={asks ? 'warn' : undefined} sub={asks ? 'open a person to respond' : 'none waiting'} />
      </div>
      <div className="grid shrink-0 grid-cols-6 gap-1">
        <Mini label="Research speed" value={`${fx.research.toFixed(2)}x`} tone={fx.research > 1 ? 'text-pos' : undefined} />
        <Mini label="Development time" value={`${Math.round(fx.devTime * 100)}%`} tone={fx.devTime < 1 ? 'text-pos' : undefined} />
        <Mini label="Design polish" value={`+${pct(fx.polish)}`} tone={fx.polish > 0 ? 'text-pos' : undefined} />
        <Mini label="Awareness growth" value={`${fx.marketing.toFixed(2)}x`} tone={fx.marketing > 1 ? 'text-pos' : undefined} />
        <Mini label="Software team" value={fx.software.toFixed(1)} tone={fx.software > 0 ? 'text-pos' : undefined} />
        <Mini label="Support, tickets / day" value={Math.round(fx.support + 20)} />
      </div>
      <div className="flex shrink-0 items-center justify-between">
        <Tabs value={view} onChange={setView} options={[{ value: 'team', label: 'People', badge: g.staff.length }, { value: 'teams', label: 'Teams', badge: loose ? `${loose} unled` : g.teams.length || undefined }, { value: 'policy', label: 'Policies' }, { value: 'hire', label: 'Applicants', badge: g.candidates.length }]} className="flex-1" />
        <div className="flex gap-1 pl-2">
          <Btn small active={role === 'all'} onClick={() => setRole('all')}>
            All
          </Btn>
          {ROLES.map((r) => (
            <Btn key={r} small active={role === r} onClick={() => setRole(r)} title={ROLE_INFO[r].effect}>
              {ROLE_INFO[r].name.split(' ')[0]}
            </Btn>
          ))}
        </div>
      </div>
      <Panel className="flex-1" bodyClass="overflow-auto">
        {view === 'team' &&
          (g.staff.length === 0 ? (
            <Empty text="Nobody works here yet. You run the company alone until you hire.">
              <Btn tone="primary" onClick={() => setView('hire')}>
                See applicants
              </Btn>
            </Empty>
          ) : (
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Skill</th>
                  <th>Traits</th>
                  <th className="r">Salary / mo</th>
                  <th className="w-24">Morale</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {byRole(g.staff).map((e) => (
                  <tr key={e.id} className="row cursor-pointer" onClick={() => setOpenId(e.id)}>
                    <PersonRow
                      e={e}
                      status={
                        <>
                          <td>
                            <Meter value={e.morale} max={100} tone={moraleTone(e.morale)} />
                          </td>
                          <td>{e.ask ? <Tag tone="warn">wants a raise</Tag> : inTraining(e, g.day) ? <Tag tone="accent">training</Tag> : seated.has(e.id) ? <Tag tone="pos">working</Tag> : <Tag tone="neg">no desk</Tag>}</td>
                        </>
                      }
                    >
                      <span className="num text-[10px] text-faint">OPEN</span>
                    </PersonRow>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        {view === 'teams' && (
          <div className="p-2">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="max-w-[640px] text-[11px] leading-snug text-dim">
                A team with a lead gets more done: the lead gives up part of their own work to lift everyone else, by more the more skilled they are. One lead can look after {TEAM_SPAN} people. Once the company passes {TEAM_SPAN} people, anyone without a lead works at 90%. Teams also need somewhere to meet: one place at a meeting table for every two members.
              </div>
              <div className="flex shrink-0 gap-1">
                <Btn small onClick={() => (act((s) => autoTeams(s)), sfx.confirm(), say('Everyone was sorted into teams by role.'))} disabled={g.staff.length < 2}>
                  Organise by role
                </Btn>
                <Btn small tone="primary" onClick={() => act((s) => createTeam(s, ''))}>
                  New team
                </Btn>
              </div>
            </div>
            <div className="mb-2 grid grid-cols-4 gap-1">
              <Mini label="Teams with a lead" value={g.teams.filter((t) => teamBonus(g, t) > 0).length} tone="text-fg" />
              <Mini label="People without a lead" value={loose} tone={loose ? 'text-warn' : undefined} />
              <Mini label="Meeting places" value={sumOf(g.office, 'meet', reachable(g.office))} />
              <Mini label="Meeting space" value={meet >= 1 ? 'enough' : `${pct(meet, 0)} effective`} tone={meet >= 1 ? undefined : 'text-warn'} />
            </div>
            {g.teams.length === 0 && <Empty text="No teams yet. Create one and add people from their page, or let the game sort everyone by role." />}
            <div className="grid grid-cols-2 gap-2">
              {g.teams.map((t) => {
                const members = t.members.map((id) => g.staff.find((e) => e.id === id)).filter((e): e is Employee => !!e)
                const bonus = teamBonus(g, t)
                return (
                  <div key={t.id} className="border border-line">
                    <div className="flex items-center gap-2 border-b border-line px-2 py-[5px]">
                      <TextInput value={t.name} onChange={(v) => act((s) => renameTeam(s, t.id, v))} maxLength={24} className="h-6 flex-1 !border-transparent !bg-transparent !px-0 text-xs uppercase tracking-wider text-fg" />
                      <span className={`num text-[11px] ${bonus > 0 ? 'text-pos' : 'text-warn'}`}>{bonus > 0 ? `+${pct(bonus, 0)} output` : members.length < 2 ? 'needs 2 people' : 'no lead'}</span>
                      <Btn small tone="ghost" onClick={() => act((s) => deleteTeam(s, t.id))}>
                        Disband
                      </Btn>
                    </div>
                    {members.length > TEAM_SPAN && <div className="border-b border-line px-2 py-1 text-[10px] text-warn">Too many for one lead: the bonus is spread thin.</div>}
                    {members.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 border-b border-line px-2 py-[4px] text-[11px] last:border-b-0">
                        <RoleDot role={e.role} />
                        <button className="flex-1 truncate text-left text-fg hover:text-accent" onClick={() => setOpenId(e.id)}>
                          {e.name}
                        </button>
                        <span className="num w-6 text-right text-dim">{Math.floor(e.skill)}</span>
                        <Btn small tone={t.leadId === e.id ? 'primary' : 'ghost'} onClick={() => act((s) => setLead(s, t.id, t.leadId === e.id ? undefined : e.id))}>
                          {t.leadId === e.id ? 'Lead' : 'Make lead'}
                        </Btn>
                        <Btn small tone="ghost" onClick={() => act((s) => assignTeam(s, e.id, null))}>
                          Remove
                        </Btn>
                      </div>
                    ))}
                    <div className="px-2 py-[5px]">
                      <Choice label="Add" value="" options={[{ value: '', label: g.staff.some((e) => !teamOf(g, e.id)) ? 'Choose someone without a team' : 'Everyone has a team' }, ...g.staff.filter((e) => !teamOf(g, e.id)).map((e) => ({ value: e.id, label: `${e.name} (${ROLE_INFO[e.role].name.toLowerCase()}, ${Math.floor(e.skill)})` }))]} onChange={(v) => v && act((s) => assignTeam(s, v, t.id))} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {view === 'policy' && (
          <div className="grid grid-cols-2 gap-2 p-2">
            <div className="border border-line p-2">
              <div className="label mb-2 text-faint">Working hours</div>
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
              <div className="label mb-2 text-faint">Perks</div>
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
        {view === 'hire' && (
          <table className="grid-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Skill</th>
                <th>Traits</th>
                <th className="r">Salary / mo</th>
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
        <div className="flex gap-1">
          {fx.idle > 0 && (
            <Btn small tone="primary" onClick={() => setTab('office')}>
              Add desks
            </Btn>
          )}
          <Btn
            small
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
      {open && <EmployeeDrawer e={open} seated={seated.has(open.id)} onClose={() => setOpenId(null)} />}
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
    <SiteBuilder siteRef="office" site={g.office} seated={seatedStaff(g)}>
      <Fold title="Campus" bodyClass="p-2">
        <div className="grid grid-cols-2 gap-1">
          <Mini label="Desks used" value={`${fx.seated} of ${fx.seats}`} tone={fx.idle ? 'text-warn' : 'text-fg'} />
          <Mini label="Without a desk" value={fx.idle} tone={fx.idle ? 'text-warn' : undefined} />
          <Mini label="Rooms" value={`${g.office.rooms.length} / ${builtTiles(g.office)} m²`} />
          <Mini label="Upkeep / month" value={money(upkeep(g.office), 1)} />
          <Mini label="Prestige" value={fx.prestige.toFixed(0)} />
          <Mini label="Meeting places" value={sumOf(g.office, 'meet', reachable(g.office))} />
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
      <Fold title="Specialist rooms" open={false} bodyClass="px-2 py-1">
        {(
          [
            ['lab', 'Research lab', 'researchers'],
            ['eng', 'Hardware workshop', 'hardware engineers'],
            ['server', 'Server room', 'software engineers'],
            ['studio', 'Design studio', 'designers'],
            ['media', 'Marketing suite', 'marketers'],
            ['support', 'Support centre', 'support agents'],
          ] as const
        ).map(([id, name, who]) => (
          <Row key={id} k={name} v={kinds.has(id) ? 'built' : `+25% for ${who}`} tone={kinds.has(id) ? 'text-pos' : undefined} />
        ))}
        <div className="py-1 text-[10px] leading-snug text-faint">Each holds a station that boosts one person of that role. Stations only go in their own kind of room.</div>
      </Fold>
      <Fold title="More land" open={!!next} bodyClass="p-2">
        {next ? (
          <>
            <div className="text-sm text-fg">{next.name}</div>
            <div className="text-[11px] leading-snug text-dim">{next.blurb}</div>
            <div className="num mt-1 text-[10px] text-faint">
              {next.w} x {next.h} m, land {money(next.rent, 1)} / mo
            </div>
            <Btn
              tone="primary"
              className="mt-2 h-9 w-full"
              onClick={() => {
                const err = act((s) => upgradeOffice(s))
                if (err) say(err, 'bad')
                else sfx.zone()
              }}
            >
              Move for {money(next.cost, 1)}
            </Btn>
            <div className="mt-1 text-[10px] text-faint">Every room and everything in it is rebuilt on the new plot as it stands, with open land all around to grow into.</div>
          </>
        ) : (
          <div className="text-[11px] text-dim">You own the campus, the largest plot there is. The rest is up to you.</div>
        )}
      </Fold>
      <Fold title="Team effects" open={false} bodyClass="px-2 py-1">
        <Row k="Research speed" v={`${fx.research.toFixed(2)}x`} />
        <Row k="Development time" v={`${Math.round(fx.devTime * 100)}%`} />
        <Row k="Design polish" v={`+${pct(fx.polish)}`} />
        <Row k="Awareness growth" v={`${fx.marketing.toFixed(2)}x`} />
        <Row k="Average morale" v={g.staff.length ? Math.round(fx.morale) : '--'} />
      </Fold>
    </SiteBuilder>
  )
}
