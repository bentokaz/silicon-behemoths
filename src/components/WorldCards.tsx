// Small cards that open beside something clicked in a building: the bench
// shows the research, the reception the applicants, the dock the orders.
// Each does the one or two things you would want on the spot and links to the
// full screen for the rest.
import type { ReactNode } from 'react'
import type { Target } from '../3d/SiteView'
import { meetingSlot } from '../3d/site/crowd'
import { sfx } from '../audio/sfx'
import { TYPES } from '../data/devices'
import { hire, researchItem, setCampaignBudget, stopCampaign, toggleResearch } from '../sim/game'
import { devProgress, factoryLife, officeLife, researchLines, storeLife } from '../sim/life'
import { ROLE_INFO, staffEffects, titleFor } from '../sim/staff'
import { TRACKS } from '../sim/types'
import { type Tab, useGame, useStore } from '../store/game'
import { Icon, type IconName } from './icons'
import { Btn, Meter, Row, Tag, money, num, pct } from './ui'

const TITLES: Record<Target['kind'], { title: string; icon: IconName }> = {
  research: { title: 'Research', icon: 'research' },
  product: { title: 'Device', icon: 'devices' },
  campaign: { title: 'Campaigns', icon: 'marketing' },
  applicants: { title: 'Applicants', icon: 'person' },
  os: { title: 'Software', icon: 'labs' },
  team: { title: 'Team meetings', icon: 'staff' },
  support: { title: 'Support', icon: 'care' },
  orders: { title: 'Production', icon: 'factory' },
  quality: { title: 'Testing', icon: 'factory' },
  takings: { title: 'Takings', icon: 'stores' },
  person: { title: 'Person', icon: 'person' },
}

const hourText = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

function Frame({ target, close, children, more }: { target: Target; close: () => void; children: ReactNode; more?: { label: string; tab: Tab } }) {
  const t = TITLES[target.kind]
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return (
    <div className="w-[264px] border border-line2 bg-panel/95 text-left" onPointerDown={stop} onPointerUp={stop} onClick={stop} onWheel={stop} onContextMenu={stop}>
      <div className="flex h-7 items-center justify-between border-b border-line px-2">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg">
          <Icon name={t.icon} size={13} className="text-accent" />
          {t.title}
        </span>
        <button className="flex h-5 w-5 items-center justify-center text-faint hover:text-fg" onClick={close} title="Close">
          <Icon name="close" size={11} />
        </button>
      </div>
      <div className="max-h-[260px] overflow-y-auto p-2">{children}</div>
      {more && (
        <button
          className="flex h-7 w-full items-center justify-between border-t border-line px-2 text-[10px] uppercase tracking-wider text-dim hover:bg-hover hover:text-accent"
          onClick={() => {
            useStore.getState().setTab(more.tab)
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

function ResearchCard({ target, close }: { target: Target; close: () => void }) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const lines = researchLines(g)
  const ideas = TRACKS.map((t) => researchItem(g, t))
    .filter((i) => i.available && !g.activeResearch.includes(i.id))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, lines.length ? 2 : 3)
  const step = g.rdBudget >= 1e6 ? 250e3 : 50e3
  const toggle = (id: string) => {
    const err = act((s) => toggleResearch(s, id))
    if (err) say(err, 'bad')
    else sfx.toggle()
  }
  return (
    <Frame target={target} close={close} more={{ label: 'Open the research tree', tab: 'research' }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-dim">Budget a month</span>
        <span className="flex items-center gap-1">
          <Btn small className="!px-2" disabled={g.rdBudget <= 0} onClick={() => act((s) => void (s.rdBudget = Math.max(0, s.rdBudget - step)))} title="Spend less">
            -
          </Btn>
          <span className="num w-16 text-center text-xs text-fg">{money(g.rdBudget, 1)}</span>
          <Btn small className="!px-2" onClick={() => act((s) => void (s.rdBudget += step))} title="Spend more: research goes faster">
            +
          </Btn>
        </span>
      </div>
      {lines.length === 0 && <Note>Nothing is being researched. Start a project and the benches get to work.</Note>}
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
          <div className="num mt-[2px] text-[10px] text-dim">
            {pct(l.progress, 0)}
            {l.daysLeft !== undefined ? `, about ${l.daysLeft} days left` : ''}
          </div>
        </div>
      ))}
      {ideas.length > 0 && <div className="mb-1 mt-2 text-[10px] uppercase tracking-wider text-dim">Could start</div>}
      {ideas.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-2 py-[3px]">
          <span className="min-w-0 truncate text-[11px] text-dim" title={i.name}>
            {i.name}
          </span>
          <Btn small className="shrink-0" onClick={() => toggle(i.id)}>
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
          tone="primary"
          className="mt-2 h-8 w-full"
          onClick={() => {
            close()
            openDesigner()
          }}
        >
          Design a new device
        </Btn>
      </Frame>
    )
  }
  const progress = devProgress(g, p)
  return (
    <Frame target={target} close={close} more={{ label: 'All devices', tab: 'products' }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm text-fg">{p.name}</span>
        <Tag tone={p.status === 'dev' ? 'accent' : p.stock <= 0 ? 'warn' : 'pos'}>{p.status === 'dev' ? 'in development' : p.stock <= 0 ? 'sold out' : 'on sale'}</Tag>
      </div>
      <div className="mb-2 text-[10px] uppercase tracking-wider text-faint">{TYPES[p.type].name}</div>
      {p.status === 'dev' ? (
        <>
          <Meter value={progress} />
          <div className="num mt-1 text-[10px] text-dim">
            {pct(progress, 0)} developed, release in {p.devDaysLeft} days
          </div>
        </>
      ) : (
        <>
          <Row k="Price" v={money(p.price, 0)} />
          <Row k="In stock" v={num(p.stock)} tone={p.stock <= 0 ? 'text-warn' : undefined} />
          <Row k="Sold" v={num(p.unitsSold)} />
          <Row k="Reviews" v={`${p.reviewAvg.toFixed(1)} / 10`} />
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
  // the one on this screen first, then the rest
  const list = [...all].sort((a, b) => (a.id === target.id ? -1 : 0) - (b.id === target.id ? -1 : 0))
  return (
    <Frame target={target} close={close} more={{ label: all.length ? 'Plan campaigns' : 'Plan a campaign', tab: 'marketing' }}>
      {!list.length && <Note>No campaigns are running. The marketing suite shows them here as posters once there are.</Note>}
      {list.map((c) => {
        const step = Math.max(10e3, Math.round((c.monthly * 0.2) / 10e3) * 10e3)
        return (
          <div key={c.id} className="border-b border-line py-[5px] last:border-0">
            <div className="text-[11px] text-fg">{c.channel}</div>
            <div className="text-[10px] text-dim">
              For {c.target.toLowerCase() === 'the brand' ? 'the brand' : c.target}. Spent {money(c.spent, 1)} so far.
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                <Btn small className="!px-2" onClick={() => act((s) => setCampaignBudget(s, c.id, c.monthly - step))} title="Spend less">
                  -
                </Btn>
                <span className="num w-20 text-center text-[11px] text-fg">{money(c.monthly, 0)}/mo</span>
                <Btn small className="!px-2" onClick={() => act((s) => setCampaignBudget(s, c.id, c.monthly + step))} title="Spend more">
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
    <Frame target={target} close={close} more={{ label: `All ${g.candidates.length} applicants`, tab: 'staff' }}>
      {!list.length && <Note>Nobody is waiting to be seen.</Note>}
      {list.length > 0 && <Note tone={free > 0 ? 'text-dim' : 'text-warn'}>{free > 0 ? `${free} free ${free === 1 ? 'desk' : 'desks'}. Hiring costs a month's pay up front.` : 'There is no free desk: anyone hired now has nowhere to work.'}</Note>}
      {list.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-2 border-b border-line py-[5px] last:border-0">
          <span className="min-w-0">
            <span className="flex items-center gap-[6px] text-[11px] text-fg">
              <span className="h-2 w-2 shrink-0" style={{ background: ROLE_INFO[e.role].color }} />
              <span className="truncate">{e.name}</span>
            </span>
            <span className="block truncate text-[10px] text-dim">
              {titleFor(e.skill) ? `${titleFor(e.skill)} ${ROLE_INFO[e.role].name.toLowerCase()}` : ROLE_INFO[e.role].name}
            </span>
            <span className="num block text-[10px] text-faint">
              skill {Math.round(e.skill)} / {money(e.salary, 0)} a month
            </span>
          </span>
          <Btn
            small
            tone="primary"
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
    </Frame>
  )
}

function OsCard({ target, close }: { target: Target; close: () => void }) {
  const g = useGame()
  const os = officeLife(g).os
  return (
    <Frame target={target} close={close} more={{ label: 'Open the labs', tab: 'labs' }}>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-fg">
          {os.name} {os.own ? os.version : ''}
        </span>
        <Tag tone={os.own ? 'pos' : 'dim'}>{os.own ? 'your own' : 'licensed'}</Tag>
      </div>
      {!os.own && !os.project && <Note>Your devices run stock software, the same as everyone else. Your own system starts in the labs.</Note>}
      {os.own && (
        <>
          <Row k="Quality" v={Math.round(os.quality)} tone={os.quality >= os.industry ? 'text-pos' : 'text-warn'} />
          <Row k="What buyers expect" v={Math.round(os.industry)} />
          <Row k="Services income" v={os.services > 0 ? `${money(os.services, 1)} a month` : 'none'} />
        </>
      )}
      {os.project && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-dim">Next version</div>
          <Meter value={os.project.progress} className="mt-1" />
          <div className="num mt-1 text-[10px] text-dim">
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
    <Frame target={target} close={close} more={{ label: 'Manage teams', tab: 'staff' }}>
      {!teams.length && <Note>No team has a lead yet. Teams with a lead meet here every day, and get more done for it.</Note>}
      {teams.map((t, k) => {
        const slot = meetingSlot(k, Math.max(1, tables))
        return (
          <div key={t.id} className="flex items-center justify-between gap-2 border-b border-line py-[4px] last:border-0">
            <span className="min-w-0">
              <span className="block truncate text-[11px] text-fg">{t.name}</span>
              <span className="block truncate text-[10px] text-dim">
                {t.lead}, {t.members.length} people
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="num block text-[11px] text-fg">{hourText(slot.start)}</span>
              <span className="num block text-[10px] text-pos">+{pct(t.bonus, 0)}</span>
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
    <Frame target={target} close={close} more={{ label: 'After-sales', tab: 'care' }}>
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
          <div className="num mt-[2px] text-[10px] text-dim">
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
  return (
    <Frame target={target} close={close}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="truncate text-sm text-fg">{st.name}</span>
        <Tag tone={st.open ? 'pos' : 'neg'}>{st.open ? 'trading' : 'closed'}</Tag>
      </div>
      <Row k="Visitors a day" v={num(st.visitors)} />
      <Row k="Sold a day" v={num(st.perDay)} />
      <Row k="Sold this month" v={num(st.monthUnits)} />
      <Row k="Sold since opening" v={num(st.unitsTotal)} />
      {st.soldOut.size > 0 && <Note tone="mt-1 text-warn">{st.soldOut.size === 1 ? 'One device has' : `${st.soldOut.size} devices have`} sold out, and left gaps on the tables.</Note>}
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
  }
  return null
}
