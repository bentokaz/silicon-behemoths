// Small cards that open beside something clicked in a building: the bench
// shows the research, the reception the applicants, the dock the orders.
// Each does the one or two things you would want on the spot and links to the
// full screen for the rest. The card of a room (its finish, furnishing it,
// knocking it down) is here too: it opens beside the floor that was clicked.
import type { ReactNode } from 'react'
import type { Target } from '../3d/SiteView'
import { meetingSlot } from '../3d/site/crowd'
import { sfx } from '../audio/sfx'
import { TYPES } from '../data/devices'
import { fmtDate, hire, researchItem, setCampaignBudget, stopCampaign, toggleResearch } from '../sim/game'
import { devProgress, factoryLife, officeLife, researchLines, storeLife, venueLife } from '../sim/life'
import { type CapId, capOfTab, lockTip } from '../sim/progress'
import { ITEMS, ROOMS, roomTiles } from '../sim/sites'
import { ROLE_INFO, staffEffects, titleFor } from '../sim/staff'
import { type Room, type Site, TRACKS } from '../sim/types'
import { type Tab, useGame, useStore } from '../store/game'
import { ExecShortlist, lockProps } from './Progress'
import { storeMonth } from './SiteInsight'
import { Icon, type IconName } from './icons'
import { Btn, ConfirmBtn, Meter, Row, Tag, money, moneyDelta, num, pct, price, useLayer } from './ui'

const TITLES: Record<Target['kind'], { title: string; icon: IconName }> = {
  research: { title: 'Research', icon: 'research' },
  product: { title: 'Device', icon: 'devices' },
  campaign: { title: 'Campaigns', icon: 'marketing' },
  applicants: { title: 'Applicants', icon: 'person' },
  room: { title: 'Room', icon: 'rooms' },
  os: { title: 'Software', icon: 'labs' },
  team: { title: 'Team meetings', icon: 'staff' },
  support: { title: 'Support', icon: 'care' },
  orders: { title: 'Production', icon: 'factory' },
  quality: { title: 'Testing', icon: 'factory' },
  takings: { title: 'This store', icon: 'stores' },
  person: { title: 'Person', icon: 'person' },
  venue: { title: 'Venue', icon: 'venue' },
}

const hourText = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

/** Where a card's link at the bottom leads: a screen, perhaps a view inside it, and the capability it waits on when that is not the screen's own. */
interface More {
  label: string
  tab: Tab
  view?: string
  cap?: CapId
}

function Frame({ target, close, children, more, title, count }: { target: Target; close: () => void; children: ReactNode; more?: More; title?: string; /** A figure beside the title. */ count?: ReactNode }) {
  const g = useGame()
  const t = TITLES[target.kind]
  // a link to somewhere not open yet wears a lock, says what opens it, and shows the card for it instead of going
  const cap = more ? (more.cap ?? capOfTab(more.tab)) : undefined
  const tip = cap ? lockTip(g, cap) : null
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  // Esc puts the card away, and only the card
  useLayer(true, close)
  return (
    <div className="w-[264px] border border-line2 bg-panel/95 text-left" onPointerDown={stop} onPointerUp={stop} onClick={stop} onWheel={stop} onContextMenu={stop}>
      <div className="flex h-7 items-center justify-between border-b border-line px-2">
        <span className="flex items-center gap-2 text-[11px] font-semibold text-fg">
          <Icon name={t.icon} size={13} className="text-accent" />
          {title ?? t.title}
          {count !== undefined && <span className="num font-normal text-faint">{count}</span>}
        </span>
        <button className="flex h-6 w-6 items-center justify-center text-faint hover:text-fg" onClick={close} title="Close (Esc)" aria-label="Close">
          <Icon name="close" size={11} />
        </button>
      </div>
      <div className="max-h-[260px] overflow-y-auto p-2">{children}</div>
      {more && tip && cap && (
        <button aria-disabled title={tip} className="flex h-7 w-full cursor-not-allowed items-center justify-between gap-2 border-t border-line px-2 text-[11px] text-faint" onClick={() => useStore.getState().showLock(cap)}>
          <span className="truncate">{more.label}</span>
          <Icon name="lock" size={10} className="shrink-0" />
        </button>
      )}
      {more && !tip && (
        <button
          className="flex h-7 w-full items-center justify-between border-t border-line px-2 text-[11px] text-dim hover:bg-hover hover:text-accent"
          onClick={() => {
            useStore.getState().go({ tab: more.tab, view: more.view })
            close()
          }}
        >
          {more.label}
          <Icon name="expand" size={10} />
        </button>
      )}
    </div>
  )
}

const Note = ({ children, tone = 'text-dim' }: { children: ReactNode; tone?: string }) => <div className={`text-[11px] leading-snug ${tone}`}>{children}</div>

/**
 * The line a card shows while the part of the company it belongs to is not
 * open yet: a lock, what opens it, and the full card for it on a click.
 * Nothing once it is open.
 */
function LockLine({ id }: { id: CapId }) {
  const g = useGame()
  const tip = lockTip(g, id)
  if (!tip) return null
  return (
    <button data-lock-line onClick={() => useStore.getState().showLock(id)} title="See what it takes" className="mb-2 flex w-full items-start gap-[6px] border border-line px-2 py-[5px] text-left text-[11px] leading-snug text-dim hover:border-line2">
      <Icon name="lock" size={11} className="mt-[2px] shrink-0 text-faint" />
      <span>{tip}</span>
    </button>
  )
}

function ResearchCard({ target, close }: { target: Target; close: () => void }) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const lines = researchLines(g)
  const ideas = TRACKS.map((t) => researchItem(g, t))
    .filter((i) => i.available && !g.activeResearch.includes(i.id))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, lines.length ? 2 : 3)
  const step = g.rdBudget >= 1e6 ? 250e3 : 50e3
  // While Research is locked nothing can be started or funded; stopping and spending less are always allowed, as they are in the simulation.
  const lock = lockProps(g, 'research')
  const toggle = (id: string) => {
    const err = act((s) => toggleResearch(s, id))
    if (err) say(err, 'bad')
    else sfx.toggle()
  }
  return (
    <Frame target={target} close={close} more={{ label: 'Open the research tree', tab: 'research' }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-dim">Budget a month</span>
        <span className="flex items-center gap-1">
          <Btn small className="!px-2" disabled={g.rdBudget <= 0} onClick={() => act((s) => void (s.rdBudget = Math.max(0, s.rdBudget - step)))} title="Spend less">
            -
          </Btn>
          <span className="num w-16 text-center text-xs text-fg">{money(g.rdBudget)}</span>
          <Btn small className="!px-2" {...lock} lockMark="corner" onClick={() => act((s) => void (s.rdBudget += step))} title="Spend more: research goes faster">
            +
          </Btn>
        </span>
      </div>
      <LockLine id="research" />
      {lines.length === 0 && !lock.locked && <Note>Nothing is being researched. Start a project and the benches get to work.</Note>}
      {lines.length > 0 && g.rdBudget <= 0 && <Note tone="text-warn">There is no budget, so nothing moves. Raise it above.</Note>}
      {lines.map((l) => (
        <div key={l.id} className="border-b border-line py-[5px] last:border-0">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] leading-snug text-fg">{l.name}</span>
            <Btn small tone="ghost" className="shrink-0 !px-1" onClick={() => toggle(l.id)}>
              Stop
            </Btn>
          </div>
          <Meter value={l.progress} tone="pos" className="mt-1" />
          <div className="num mt-[2px] text-[11px] text-dim">
            {pct(l.progress, 0)}
            {l.daysLeft !== undefined ? `, about ${l.daysLeft} days left` : ''}
          </div>
        </div>
      ))}
      {ideas.length > 0 && <div className="mb-1 mt-2 text-[11px] text-dim">Could start</div>}
      {ideas.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-2 py-[3px]">
          <span className="min-w-0 truncate text-[11px] text-dim" title={i.name}>
            {i.name}
          </span>
          <Btn small className="shrink-0" {...lock} onClick={() => toggle(i.id)}>
            Start
          </Btn>
        </div>
      ))}
    </Frame>
  )
}

function ProductCard({ target, close }: { target: Target; close: () => void }) {
  const g = useGame()
  const { focus, openDesigner } = useStore.getState()
  const p = g.products.find((x) => x.id === target.id && x.companyId === 'player')
  if (!p) {
    return (
      <Frame target={target} close={close} more={{ label: 'All devices', tab: 'products' }}>
        <Note>Nothing is being developed here yet. Prototypes appear on these benches as soon as a device is in the works.</Note>
        <Btn
          icon="plus"
          className="mt-2 w-full"
          onClick={() => {
            close()
            openDesigner()
          }}
        >
          New device
        </Btn>
      </Frame>
    )
  }
  const progress = devProgress(g, p)
  return (
    <Frame target={target} close={close} more={{ label: 'All devices', tab: 'products' }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] text-fg">{p.name}</span>
        <Tag tone={p.status === 'dev' ? 'accent' : p.stock <= 0 ? 'warn' : 'pos'}>{p.status === 'dev' ? 'in development' : p.stock <= 0 ? 'sold out' : 'on sale'}</Tag>
      </div>
      <div className="mb-2 text-[11px] text-faint">{TYPES[p.type].name}</div>
      {p.status === 'dev' ? (
        <>
          <Meter value={progress} />
          <div className="num mt-1 text-[11px] text-dim">
            {pct(progress, 0)} developed, release in {p.devDaysLeft} days
          </div>
        </>
      ) : (
        <>
          <Row k="Price" v={price(p.price)} />
          <Row k="In stock" v={num(p.stock)} tone={p.stock <= 0 ? 'text-warn' : undefined} />
          <Row k="Sold" v={num(p.unitsSold)} />
          <Row k="Reviews" v={`${Math.round(p.reviewAvg * 10) / 10} of 10`} />
        </>
      )}
      <Btn
        className="mt-2 w-full"
        onClick={() => {
          focus(p.id)
          close()
        }}
      >
        Open its details
      </Btn>
    </Frame>
  )
}

function CampaignCard({ target, close }: { target: Target; close: () => void }) {
  const g = useGame()
  const { act } = useStore.getState()
  const all = officeLife(g).campaigns
  // as with research: spending more waits on Marketing, spending less and stopping never do
  const lock = lockProps(g, 'marketing')
  // the one on this screen first, then the rest
  const list = [...all].sort((a, b) => (a.id === target.id ? -1 : 0) - (b.id === target.id ? -1 : 0))
  return (
    <Frame target={target} close={close} more={{ label: all.length ? 'Plan campaigns' : 'Plan a campaign', tab: 'marketing' }}>
      <LockLine id="marketing" />
      {!list.length && !lock.locked && <Note>No campaigns are running. The marketing suite shows them here as posters once there are.</Note>}
      {list.map((c) => {
        const step = Math.max(10e3, Math.round((c.monthly * 0.2) / 10e3) * 10e3)
        return (
          <div key={c.id} className="border-b border-line py-[5px] last:border-0">
            <div className="text-[11px] text-fg">{c.channel}</div>
            <div className="text-[11px] text-dim">
              For {c.target.toLowerCase() === 'the brand' ? 'the brand' : c.target}. Spent {money(c.spent)} so far.
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                <Btn small className="!px-2" onClick={() => act((s) => setCampaignBudget(s, c.id, c.monthly - step))} title="Spend less">
                  -
                </Btn>
                <span className="num w-24 text-center text-[11px] text-fg">{money(c.monthly)} a month</span>
                <Btn small className="!px-2" {...lock} lockMark="corner" onClick={() => act((s) => setCampaignBudget(s, c.id, c.monthly + step))} title="Spend more">
                  +
                </Btn>
              </span>
              <Btn small tone="danger" onClick={() => (act((s) => stopCampaign(s, c.id)), sfx.toggle())}>
                Stop
              </Btn>
            </div>
          </div>
        )
      })}
    </Frame>
  )
}

function ApplicantsCard({ target, close }: { target: Target; close: () => void }) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const fx = staffEffects(g)
  const free = fx.seats - fx.seated
  // whoever was clicked comes first
  const list = [...g.candidates].sort((a, b) => (a.id === target.id ? -1 : 0) - (b.id === target.id ? -1 : 0)).slice(0, 5)
  return (
    <Frame target={target} close={close} more={{ label: `All ${g.candidates.length} under Hiring`, tab: 'staff', view: 'hire' }}>
      {!list.length && <Note>Nobody is waiting to be seen.</Note>}
      {list.length > 0 && <Note tone={free > 0 ? 'text-dim' : 'text-warn'}>{free > 0 ? `${free} free ${free === 1 ? 'desk' : 'desks'}. Hiring costs a month's pay up front.` : 'There is no free desk: anyone hired now has nowhere to work.'}</Note>}
      {list.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-2 border-b border-line py-[5px] last:border-0">
          <span className="min-w-0">
            <span className="flex items-center gap-[6px] text-[11px] text-fg">
              <span className="h-2 w-2 shrink-0" style={{ background: ROLE_INFO[e.role].color }} />
              <span className="truncate">{e.name}</span>
            </span>
            <span className="block truncate text-[11px] text-dim">
              {titleFor(e.skill) ? `${titleFor(e.skill)} ${ROLE_INFO[e.role].name.toLowerCase()}` : ROLE_INFO[e.role].name}
            </span>
            <span className="num block text-[11px] text-faint">
              skill {Math.round(e.skill)}, {price(e.salary)} a month
            </span>
          </span>
          <Btn
            small
            className="shrink-0"
            onClick={() => {
              const err = act((s) => hire(s, e.id))
              if (err) say(err, 'bad')
              else sfx.hire()
            }}
          >
            Hire
          </Btn>
        </div>
      ))}
      <ExecShortlist close={close} />
    </Frame>
  )
}

function OsCard({ target, close }: { target: Target; close: () => void }) {
  const g = useGame()
  const os = officeLife(g).os
  return (
    <Frame target={target} close={close} more={{ label: 'Open Labs', tab: 'labs' }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-fg">
          {os.name} {os.own ? os.version : ''}
        </span>
        <Tag tone={os.own ? 'pos' : 'dim'}>{os.own ? 'your own' : 'licensed'}</Tag>
      </div>
      {!os.own && !os.project && <Note>Your devices run stock software, the same as everyone else. Your own system starts under Research, Labs.</Note>}
      <div className="mt-2 empty:hidden">
        <LockLine id="labs" />
      </div>
      {os.own && (
        <>
          <Row k="Quality" v={Math.round(os.quality)} tone={os.quality >= os.industry ? 'text-pos' : 'text-warn'} />
          <Row k="What buyers expect" v={Math.round(os.industry)} />
          <Row k="Services income" v={os.services > 0 ? `${money(os.services)} a month` : 'none'} />
        </>
      )}
      {os.project && (
        <div className="mt-2">
          <div className="text-[11px] text-dim">Next version</div>
          <Meter value={os.project.progress} className="mt-1" />
          <div className="num mt-1 text-[11px] text-dim">
            {pct(os.project.progress, 0)} done, {os.project.daysLeft} days to go
          </div>
        </div>
      )}
    </Frame>
  )
}

function TeamCard({ target, close }: { target: Target; close: () => void }) {
  const g = useGame()
  const life = officeLife(g)
  const teams = life.teams.filter((t) => t.leadId && t.members.length >= 2)
  const tables = g.office.items.filter((i) => i.kind === 'meeting').length
  return (
    <Frame target={target} close={close} more={{ label: 'Manage teams', tab: 'staff', view: 'teams', cap: 'teams' }}>
      <LockLine id="teams" />
      {!teams.length && <Note>No team has a lead yet. Teams with a lead meet here every day, and get more done for it.</Note>}
      {teams.map((t, k) => {
        const slot = meetingSlot(k, Math.max(1, tables))
        return (
          <div key={t.id} className="flex items-center justify-between gap-2 border-b border-line py-[4px] last:border-0">
            <span className="min-w-0">
              <span className="block truncate text-[11px] text-fg">{t.name}</span>
              <span className="block truncate text-[11px] text-dim">
                {t.lead}, {t.members.length} people
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="num block text-[11px] text-fg">{hourText(slot.start)}</span>
              <span className="num block text-[11px] text-pos">+{pct(t.bonus, 0)}</span>
            </span>
          </div>
        )
      })}
    </Frame>
  )
}

function SupportCard({ target, close }: { target: Target; close: () => void }) {
  const g = useGame()
  const s = officeLife(g).support
  const tone = s.load >= 1 ? 'neg' : s.load >= 0.75 ? 'warn' : 'pos'
  return (
    <Frame target={target} close={close} more={{ label: 'Open Owners', tab: 'care' }}>
      <LockLine id="care" />
      <Row k="Tickets a day" v={num(s.tickets)} />
      <Row k="The team can answer" v={num(s.capacity)} />
      <Meter value={Math.min(1, s.load)} tone={tone} className="mt-2" />
      <Note tone={tone === 'neg' ? 'mt-1 text-neg' : tone === 'warn' ? 'mt-1 text-warn' : 'mt-1 text-dim'}>
        {s.load >= 1 ? 'The lines are swamped. Owners are waiting, and it shows in how they rate you. Hire support agents or cut the fault rate.' : s.load >= 0.75 ? 'Busy, but coping. Another agent would give some room.' : 'Calm. Everyone who calls gets an answer.'}
      </Note>
    </Frame>
  )
}

function OrdersCard({ target, close }: { target: Target; close: () => void }) {
  const g = useGame()
  const f = factoryLife(g)
  return (
    <Frame target={target} close={close} more={{ label: 'Order more from Devices', tab: 'products' }}>
      {f.line?.running ? <Row k="Line output a day" v={num(f.line.throughput)} /> : <Note tone="text-warn">{f.line?.problem ?? 'There is no line yet.'}</Note>}
      <Row k="In the warehouse" v={num(f.stock)} />
      {!f.orders.length && <Note tone="mt-1 text-dim">No production orders are open.</Note>}
      {f.orders.map((o) => (
        <div key={o.id} className="border-b border-line py-[5px] last:border-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[11px] text-fg">{o.product}</span>
            <Tag>{o.mode === 'factory' ? 'this line' : 'contractor'}</Tag>
          </div>
          <Meter value={o.done} max={o.quantity} className="mt-1" />
          <div className="num mt-[2px] text-[11px] text-dim">
            {num(o.done)} of {num(o.quantity)} built
          </div>
        </div>
      ))}
    </Frame>
  )
}

function QualityCard({ target, close }: { target: Target; close: () => void }) {
  const g = useGame()
  const f = factoryLife(g)
  const line = f.line
  return (
    <Frame target={target} close={close}>
      {!line?.running ? (
        <Note tone="text-warn">{line?.problem ?? 'There is no line yet.'}</Note>
      ) : (
        <>
          <Row k="Pulled off the line here" v={pct(f.caught)} />
          <Row k="Still ship faulty" v={pct(line.defectRate)} tone={line.defectRate > 0.03 ? 'text-warn' : 'text-pos'} />
          <Row k="Units tested" v={pct(Math.min(1, line.caps.test / Math.max(1, line.throughput)), 0)} />
          <Note tone="mt-1 text-dim">Every unit that fails here goes in the red bin instead of to a customer. More test stations cover more of the line.</Note>
        </>
      )}
    </Frame>
  )
}

function TakingsCard({ target, close, siteRef }: { target: Target; close: () => void; siteRef: string }) {
  const g = useGame()
  const st = storeLife(g, siteRef.replace('store:', ''))
  if (!st) return null
  const month = storeMonth(g, siteRef.replace('store:', ''))
  return (
    <Frame target={target} close={close} title={st.name} more={{ label: 'All stores', tab: 'stores' }}>
      {!st.open && (
        <div className="mb-1">
          <Tag tone="neg">closed</Tag>
        </div>
      )}
      {month && (
        <>
          <Row k={month.partial ? 'Profit this month, projected' : 'Profit this month'} v={moneyDelta(month.profit)} tone={month.profit < 0 ? 'text-neg' : 'text-pos'} />
          <Row k="Takings" v={money(month.revenue)} />
          <Row k="Costs" v={money(month.costs)} />
        </>
      )}
      <Row k="Visitors a day" v={num(st.visitors)} />
      <Row k="Sold a day" v={num(st.perDay)} />
      <Row k="Sold this month" v={num(st.monthUnits)} />
      <Row k="Sold since opening" v={num(st.unitsTotal)} />
      {st.soldOut.size > 0 && <Note tone="mt-1 text-warn">{st.soldOut.size === 1 ? 'One device has' : `${st.soldOut.size} devices have`} sold out, and left gaps on the tables.</Note>}
    </Frame>
  )
}

/** What each part of a venue is for, in a line. */
const VENUE_NOTES: Record<string, string> = {
  stage: 'Where the presenter stands. A venue needs one before it can hold a keynote.',
  screen: 'The device goes up here at the reveal. The biggest single lift to the production.',
  lights: 'Moving heads that sweep the house during a show.',
  speakers: 'Carries the show to the back row.',
  camera: 'The press and the livestream film from here. A show is only as big as the audience that sees it.',
  seats: 'Twelve seats on the flat. Guests fill them when the doors open.',
  seats_mid: 'Twelve seats on a low riser, so the rows behind can see.',
  seats_high: 'Twelve seats on a tall riser, for the back of the house.',
  demo: 'Guests try the device here on their way out.',
  reception: 'Where guests collect their badges before the doors open.',
  logowall: 'Your name, lit, for every photograph taken in the foyer.',
  people: 'On a show day the crew sets up in the morning, the presenter rehearses, the doors open after lunch and the house fills for the keynote.',
}

function VenueCard({ target, close }: { target: Target; close: () => void }) {
  const g = useGame()
  const v = venueLife(g)
  if (!v) return null
  const def = target.id ? ITEMS.venue[target.id] : undefined
  const st = v.stats
  const here = v.upcoming.filter((e) => e.here)
  return (
    <Frame target={target} close={close} title={target.id === 'people' ? 'Show day' : target.label} more={{ label: 'Book an event', tab: 'marketing', cap: 'events' }}>
      <LockLine id="events" />
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex flex-wrap gap-1">
          {def?.crowd ? <Tag tone="accent">{def.crowd} seats</Tag> : null}
          {def?.show ? <Tag tone="accent">production +{def.show}</Tag> : null}
        </span>
        <Tag tone={st.ready ? 'pos' : 'warn'}>{st.ready ? 'ready for a keynote' : 'not ready'}</Tag>
      </div>
      <Note>{VENUE_NOTES[target.id ?? ''] ?? def?.note ?? ''}</Note>
      {st.problem && <Note tone="mt-1 text-warn">{st.problem}</Note>}
      <div className="mt-2">
        <Row k="Seats in the house" v={num(st.seats)} />
        <Row k="A show here fills" v={pct(v.draw, 0)} />
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-[11px] text-dim">Production</span>
        <span className="num text-[11px] text-dim">{pct(st.production, 0)}</span>
      </div>
      <Meter value={st.production} tone={st.production > 0.7 ? 'pos' : st.production > 0.35 ? 'accent' : 'warn'} className="mt-[2px]" />
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-[11px] text-dim">Reach of a keynote here</span>
        <span className="num text-[11px] text-dim">{pct(st.reach / 1.1, 0)}</span>
      </div>
      <Meter value={st.reach / 1.1} tone="accent" className="mt-[2px]" />
      <div className="mb-1 mt-3 text-[11px] text-dim">Coming up</div>
      {!v.upcoming.length && <Note>Nothing is booked. A keynote for a device in development can be held on this stage.</Note>}
      {v.upcoming.slice(0, 4).map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-2 border-b border-line py-[4px] last:border-0">
          <span className="min-w-0">
            <span className="block truncate text-[11px] text-fg">{e.product ?? e.kind}</span>
            <span className="block truncate text-[11px] text-dim">
              {e.product ? `${e.kind}, ` : ''}
              {e.here ? 'on this stage' : e.place.toLowerCase()}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="num block text-[11px] text-fg">{e.daysLeft === 0 ? 'today' : `in ${e.daysLeft} d`}</span>
            <span className="num block text-[11px] text-faint">{fmtDate(e.day)}</span>
          </span>
        </div>
      ))}
      {here.length > 0 && <Note tone="mt-1 text-dim">Until the day, the house rehearses each morning and fills each afternoon.</Note>}
      {v.last && (
        <div className="mt-2">
          <Row k={`Last show: ${v.last.product}`} v={`score ${v.last.score}`} tone={v.last.score >= 70 ? 'text-pos' : v.last.score >= 45 ? undefined : 'text-neg'} />
          <Row k="Keynotes held here" v={v.held} />
        </div>
      )}
    </Frame>
  )
}

/**
 * The card of a room, opened beside the floor that was clicked: its finish,
 * a way into furnishing it, and knocking it down. The builder does the work
 * (so that each change is a step that can be undone); this is only the card.
 */
export function RoomCard({ target, close, site, room, onStyle, onFurnish, onDemolish }: { target: Target; close: () => void; site: Site; room: Room; onStyle: (style: number) => void; onFurnish: () => void; onDemolish: () => void }) {
  const def = ROOMS[site.kind][room.type]
  if (!def) return null
  return (
    <Frame target={target} close={close} title={def.name} count={`${num(roomTiles(site, room.n))} m\u00b2`}>
      <div className="mb-1 text-[11px] text-dim">Finish</div>
      <div className="grid grid-cols-2 gap-1">
        {def.styles.map((st, i) => (
          <button key={st.name} type="button" aria-pressed={room.style === i} onClick={() => onStyle(i)} className={`flex items-center gap-2 border px-[6px] py-[5px] text-left text-[11px] ${room.style === i ? 'border-accent bg-accent/10 text-accent' : 'border-line2 text-dim hover:border-fg hover:text-fg'}`}>
            <span aria-hidden className="flex h-4 w-6 shrink-0 border border-line2">
              <span className="flex-1" style={{ background: st.floor }} />
              <span className="flex-1" style={{ background: st.wall }} />
            </span>
            <span className="truncate">{st.name}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Btn small icon="furnish" className="flex-1" onClick={onFurnish}>
          Furnish
        </Btn>
        <ConfirmBtn small icon="demolish" className="flex-1" confirm="Knock it down?" title="Knocks the room down. Everything inside is sold for half its price. Undo brings it back." onClick={onDemolish}>
          Demolish
        </ConfirmBtn>
      </div>
    </Frame>
  )
}

/** The card for whatever was clicked in the building. */
export function WorldCard({ target, close, siteRef }: { target: Target; close: () => void; siteRef: string }) {
  switch (target.kind) {
    case 'research':
      return <ResearchCard target={target} close={close} />
    case 'product':
      return <ProductCard target={target} close={close} />
    case 'campaign':
      return <CampaignCard target={target} close={close} />
    case 'applicants':
      return <ApplicantsCard target={target} close={close} />
    case 'os':
      return <OsCard target={target} close={close} />
    case 'team':
      return <TeamCard target={target} close={close} />
    case 'support':
      return <SupportCard target={target} close={close} />
    case 'orders':
      return <OrdersCard target={target} close={close} />
    case 'quality':
      return <QualityCard target={target} close={close} />
    case 'takings':
      return <TakingsCard target={target} close={close} siteRef={siteRef} />
    case 'venue':
      return <VenueCard target={target} close={close} />
  }
  return null
}
