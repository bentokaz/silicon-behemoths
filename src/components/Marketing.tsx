// Marketing: the Campaigns page (awareness and what is running, with the form
// for a new campaign behind one button) and the Events page (what is booked,
// what can be booked, and how past events went).
import { type ReactNode, useState } from 'react'
import { sfx } from '../audio/sfx'
import { TYPES, segmentsOf } from '../data/devices'
import { fmtDate, player, scheduleEvent, setCampaignBudget, startCampaign, stopCampaign } from '../sim/game'
import { CHANNELS, EVENTS, EVENT_LEAD, OWN_VENUE, channelFit, eventBlocked, hasStage, keynoteReach, nextFair } from '../sim/growth'
import { type CapId, capOf, capOfChannel, has, lockTip } from '../sim/progress'
import { openRegions, regionInfo } from '../sim/regions'
import { venueStats } from '../sim/sites'
import { staffEffects } from '../sim/staff'
import type { Campaign, ChannelId, EventType, GameEvent, GameState } from '../sim/types'
import { useGame, useStore, useView } from '../store/game'
import { LockedPane } from './Progress'
import { Icon, type IconName, channelIcon, eventIcon } from './icons'
import { Btn, Choice, type Column, Drawer, Fold, Headline, Help, Legend, Meter, Page, Panel, Slider, Strip, Table, int, money, pct, useKept } from './ui'

const own = (g: GameState) => g.products.filter((p) => p.companyId === 'player' && p.status !== 'ended')
const CHANNEL_IDS = Object.keys(CHANNELS) as ChannelId[]
const EVENT_TYPES = Object.keys(EVENTS) as EventType[]
const budgetMax = (channel: ChannelId) => Math.max(5e6, CHANNELS[channel].min * 10)

/** A line with a lock in front: why something cannot be chosen or done. */
function Reason({ children }: { children: string }) {
  return (
    <div className="flex items-start gap-[6px] text-[11px] leading-snug text-dim">
      <Icon name="lock" size={11} className="mt-[2px] shrink-0 text-faint" />
      <span>{children}</span>
    </div>
  )
}

/** One of a short list of options with a figure at the right, of which one is chosen. A locked one is dashed and opens what it takes. */
function Option({ on, locked, onClick, icon, name, children }: { on: boolean; locked?: string | null; onClick: () => void; icon?: IconName; name: string; children?: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} aria-disabled={locked ? true : undefined} title={locked ?? undefined} onClick={onClick} className={`flex h-8 w-full items-center gap-2 border px-2 text-left text-xs ${locked ? 'cursor-not-allowed border-dashed border-line2 text-dim' : on ? 'border-accent bg-accent/10 text-fg' : 'border-line2 text-fg hover:border-fg hover:bg-hover'}`}>
      {(locked || icon) && <Icon name={locked ? 'lock' : icon!} size={13} className={`shrink-0 ${on && !locked ? 'text-accent' : 'text-dim'}`} />}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {children}
    </button>
  )
}

// ------------------------------------------------------------------ campaigns

/** The form for a new campaign, in the drawer. */
function NewCampaign({ open, onClose }: { open: boolean; onClose: () => void }) {
  const g = useGame()
  const { act, say, showLock } = useStore.getState()
  const [picked, setChannel] = useKept<ChannelId>('campaign:channel', 'online')
  const [aim, setTarget] = useKept('campaign:target', 'brand')
  const [monthly, setMonthly] = useKept('campaign:monthly', 100e3)
  const [where, setRegion] = useKept('campaign:region', 'all')
  const regions = openRegions(g)
  const products = own(g)
  // a channel since locked by loading another game, a device since discontinued or a region since left is no longer a choice
  const channel = has(g, capOfChannel(picked)) ? picked : 'online'
  const target = aim === 'brand' || products.some((p) => p.id === aim) ? aim : 'brand'
  const region = where === 'all' || regions.some((r) => r.id === where) ? where : 'all'
  const def = CHANNELS[channel]
  const product = products.find((p) => p.id === target)
  const budget = Math.max(monthly, def.min)
  const lockedCaps = [...new Set(CHANNEL_IDS.map(capOfChannel).filter((c) => !has(g, c)))] as CapId[]
  const running = g.campaigns.some((c) => c.channel === channel && c.target === target && c.region === (region === 'all' ? undefined : region))
  const start = () => {
    const err = act((s) => startCampaign(s, channel, target, budget, region === 'all' ? undefined : region))
    if (err) return say(err, 'bad')
    sfx.confirm()
    say(`${def.name} campaign started at ${money(budget)} a month. It is billed daily until you stop it.`)
    onClose()
  }
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New campaign"
      footer={
        <div className="space-y-2">
          {running && <Reason>That campaign is already running. Change its budget in the list.</Reason>}
          <Btn tone="primary" large icon="play" className="w-full" data-coach-target="campaign" disabled={running} title={running ? 'That campaign is already running.' : undefined} onClick={start}>
            Start at {money(budget)} a month
          </Btn>
        </div>
      }
    >
      <div className="space-y-3 p-3">
        <div>
          <div className="label mb-1 flex justify-between px-[9px]">
            <span>Channel</span>
            <span>Least a month</span>
          </div>
          <div role="radiogroup" aria-label="Channel" className="space-y-1">
            {CHANNEL_IDS.map((id) => {
              const cap = capOfChannel(id)
              return (
                <Option key={id} on={channel === id} locked={lockTip(g, cap)} icon={channelIcon(id)} name={CHANNELS[id].name} onClick={() => (has(g, cap) ? setChannel(id) : showLock(cap))}>
                  <span className="num shrink-0 text-[11px] text-dim">{money(CHANNELS[id].min)}</span>
                </Option>
              )
            })}
          </div>
          <div className="mt-2 text-xs leading-snug text-dim">{def.note}</div>
          {lockedCaps.map((c) => (
            <div key={c} className="mt-2">
              <Reason>{lockTip(g, c) ?? `${capOf(c).name} is not open yet.`}</Reason>
            </div>
          ))}
        </div>
        <div>
          <Choice label="Advertise" icon="marketing" value={target} options={[{ value: 'brand', label: 'The company (awareness)' }, ...products.map((p) => ({ value: p.id, label: p.name }))]} onChange={setTarget} />
          {regions.length > 1 && <Choice label="Where" icon="pin" value={region} options={[{ value: 'all', label: 'Everywhere you sell' }, ...regions.map((r) => ({ value: r.id, label: `${r.name} only` }))]} onChange={setRegion} />}
          <Slider label="Monthly budget" icon="cash" value={budget} min={def.min} max={budgetMax(channel)} step={10e3} format={(v) => money(v)} onChange={setMonthly} />
        </div>
        {product && (
          <div className="border-t border-line pt-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-fg">Who this channel reaches</span>
              <Legend items={[{ label: 'Reaches well', tone: 'pos' }, { label: 'Ordinary or weak', tone: 'dim' }]} />
            </div>
            {segmentsOf(product.type).map((s) => {
              const fit = channelFit(channel, s)
              return (
                <div key={s.id} className="flex items-center gap-2 py-[3px]" title={`${s.name}, a kind of ${TYPES[product.type].name.toLowerCase()} buyer`}>
                  <span className="w-32 shrink-0 truncate text-[11px] text-dim">{s.name}</span>
                  <Meter value={fit} max={2} tone={fit >= 1.3 ? 'pos' : 'dim'} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Drawer>
  )
}

function Campaigns() {
  const g = useGame()
  const me = player(g)
  const { act, say, focus, go } = useStore.getState()
  const [adding, setAdding] = useState(false)
  const marketers = g.staff.filter((e) => e.role === 'marketer').length
  const regions = openRegions(g)
  const spend = g.campaigns.reduce((a, c) => a + c.monthly, 0)
  const productOf = (c: Campaign) => g.products.find((x) => x.id === c.target)
  const cols: Column<Campaign>[] = [
    {
      id: 'channel',
      head: 'Channel',
      sort: (c) => CHANNELS[c.channel].name,
      cell: (c) => (
        <span className="flex items-center gap-2 text-fg">
          <Icon name={channelIcon(c.channel)} size={13} className="shrink-0 text-dim" />
          <span className="min-w-0 truncate">
            {CHANNELS[c.channel].name}
            {c.region && <span className="text-dim">, {regionInfo(c.region).name} only</span>}
          </span>
        </span>
      ),
    },
    {
      id: 'target',
      head: 'Advertises',
      min: 140,
      drop: 2,
      sort: (c) => productOf(c)?.name ?? '',
      cell: (c) => {
        const p = productOf(c)
        if (!p) return <span className="text-dim">The company</span>
        return (
          <button type="button" className="max-w-full truncate align-middle text-fg underline-offset-2 hover:underline" title={`Open ${p.name}`} onClick={() => focus(p.id)}>
            {p.name}
          </button>
        )
      },
    },
    {
      id: 'budget',
      head: 'Budget a month',
      min: 230,
      sort: (c) => c.monthly,
      first: 'desc',
      cell: (c) => (
        <span className="flex items-center gap-2">
          <input type="range" aria-label={`Monthly budget of the ${CHANNELS[c.channel].name} campaign`} aria-valuetext={money(c.monthly)} className="min-w-12 flex-1" min={CHANNELS[c.channel].min} max={budgetMax(c.channel)} step={10e3} value={c.monthly} onChange={(e) => act((s) => setCampaignBudget(s, c.id, Number(e.target.value)))} />
          <span className="num w-14 shrink-0 text-right text-fg">{money(c.monthly)}</span>
        </span>
      ),
    },
    {
      id: 'interest',
      head: 'Interest',
      title: 'Interest in the advertised device, in the segment that has heard most of it. A campaign for the company builds awareness instead.',
      min: 104,
      drop: 1,
      sort: (c) => {
        const p = productOf(c)
        return p ? Math.max(0, ...Object.values(p.buzz)) : null
      },
      first: 'desc',
      cell: (c) => {
        const p = productOf(c)
        if (!p) return <span className="text-faint">Awareness</span>
        const buzz = Math.max(0, ...Object.values(p.buzz))
        return (
          <span className="flex items-center gap-2" title={`${pct(buzz, 0)} interest in ${p.name}`}>
            <Meter value={buzz} tone="accent" />
          </span>
        )
      },
    },
  ]
  return (
    <>
      <div className="flex shrink-0 items-stretch gap-2">
        <div className="w-[240px] shrink-0">
          <Headline label="Awareness" icon="eye" value={pct(me.awareness)} sub="of buyers know you exist" info="The share of buyers who have heard of you. A buyer who has never heard of you does not consider your devices, however good they are. Campaigns, events, every sale and your fans raise it, region by region." />
        </div>
        <Strip
          className="flex min-w-0 flex-1 flex-col justify-center"
          keep={regions.length > 1 ? 'marketing:regions' : undefined}
          items={[
            { label: 'Campaign spend a month', value: money(spend), icon: 'cash' },
            { label: 'Marketers', value: int(marketers), icon: 'staff', title: `Your marketing staff make every campaign and event work ${pct(Math.max(0, staffEffects(g).marketing - 1), 0)} harder.`, onClick: () => go({ tab: 'staff', view: 'team', role: 'marketer' }) },
          ]}
        >
          {regions.length > 1 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-1 px-3 py-2">
              {regions.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-[11px] text-dim" title={r.name}>{r.name}</span>
                  <Meter value={g.regions[r.id]?.awareness ?? 0} tone="accent" />
                  <span className="num w-10 shrink-0 text-right text-xs text-fg">{pct(g.regions[r.id]?.awareness ?? 0, 0)}</span>
                </div>
              ))}
            </div>
          )}
        </Strip>
      </div>
      <Panel
        title="Running campaigns"
        icon="marketing"
        count={g.campaigns.length || undefined}
        className="shrink-0"
        right={
          <Btn tone={adding ? 'default' : 'primary'} active={adding ? true : undefined} icon="plus" data-coach-target={adding ? undefined : 'campaign'} onClick={() => setAdding(!adding)}>
            New campaign
          </Btn>
        }
      >
        <Table
          label="Running campaigns"
          cols={cols}
          rows={g.campaigns}
          rowKey={(c) => c.id}
          keep="marketing:campaigns"
          firstMin={170}
          actionWidth={76}
          actionAlways={() => true}
          action={(c) => (
            <Btn small tone="ghost" icon="stop" title={`Stop the ${CHANNELS[c.channel].name} campaign. Nothing more is billed.`} onClick={() => (act((s) => stopCampaign(s, c.id)), say(`${CHANNELS[c.channel].name} campaign stopped.`))}>
              Stop
            </Btn>
          )}
          empty="Nothing is running. A campaign for the company raises awareness; one for a device builds interest in it."
        />
      </Panel>
      <NewCampaign open={adding} onClose={() => setAdding(false)} />
    </>
  )
}

// ------------------------------------------------------------------ events

/** What each kind of event is for, in a few words. */
const EVENT_FOR: Record<EventType, string> = {
  keynote: 'Launch hype for one device',
  expo: 'Awareness, and interest in every device',
  fanfest: 'More fans',
  devcon: 'A better operating system',
}

/** Devices in development that have no keynote booked yet. */
const unveilable = (g: GameState) => g.products.filter((p) => p.companyId === 'player' && p.status === 'dev' && !g.events.some((e) => e.type === 'keynote' && e.productId === p.id && !e.done))

/** The form for booking one kind of event, in the drawer. */
function BookEvent({ type, onClose }: { type: EventType; onClose: () => void }) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const def = EVENTS[type]
  const inDev = unveilable(g)
  const [venue, setVenue] = useState(0)
  const [productId, setProductId] = useState('')
  const [days, setDays] = useState(30)
  const pid = inDev.some((p) => p.id === productId) ? productId : inDev[0]?.id
  const product = g.products.find((p) => p.id === pid)
  const ownLocked = type === 'keynote' && !hasStage(g) ? (g.venue ? `Your venue is not ready. ${venueStats(g.venue).problem ?? ''}`.trim() : 'Build a venue of your own first, under Sites, Venue.') : null
  const cost = def.venues[venue].cost
  const blocked = eventBlocked(g, type, venue, pid) ?? (g.cash < cost ? `Not enough cash: this costs ${money(cost)}.` : null)
  const fair = nextFair(g.day)
  const when = type === 'keynote' ? (product ? `Release day, ${fmtDate(g.day + product.devDaysLeft)}` : 'Release day') : type === 'expo' ? `${fair.name}, ${fmtDate(fair.day)}` : fmtDate(g.day + days)
  const book = () => {
    const err = act((s) => scheduleEvent(s, type, venue, pid, days))
    if (err) return say(err, 'bad')
    sfx.confirm()
    say(`${def.name} booked: ${when}.`)
    onClose()
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title={`Book a ${def.name.toLowerCase()}`}
      footer={
        <div className="space-y-2">
          {blocked && <Reason>{blocked}</Reason>}
          <Btn tone="primary" large icon="calendar" className="w-full" disabled={!!blocked} title={blocked ?? undefined} onClick={book}>
            Book for {money(cost)}
          </Btn>
        </div>
      }
    >
      <div className="space-y-3 p-3">
        <div className="text-xs leading-snug text-dim">{def.note}</div>
        <div>
          <div className="label mb-1 flex items-center gap-2 px-[9px]">
            <span className="min-w-0 flex-1">Venue</span>
            <span className="w-20 shrink-0">Reach</span>
            <span className="w-14 shrink-0 text-right">Cost</span>
          </div>
          <div role="radiogroup" aria-label="Venue" className="space-y-1">
            {def.venues.map((v, i) => {
              const locked = type === 'keynote' && i === OWN_VENUE ? ownLocked : null
              const reach = type === 'keynote' ? keynoteReach(g, i) : v.reach
              return (
                <Option key={v.name} on={venue === i} locked={locked} name={v.name} onClick={() => !locked && setVenue(i)}>
                  <span className="w-20 shrink-0" title={`Reach ${pct(Math.min(1, reach), 0)}`}>
                    <Meter value={locked ? 0 : reach} max={1.1} tone="accent" />
                  </span>
                  <span className="num w-14 shrink-0 text-right text-[11px] text-dim">{money(v.cost)}</span>
                </Option>
              )
            })}
          </div>
          {ownLocked && (
            <div className="mt-2">
              <Reason>{ownLocked}</Reason>
            </div>
          )}
          {type === 'keynote' && venue === OWN_VENUE && g.venue && !ownLocked && <div className="mt-2 text-[11px] leading-snug text-dim">Your venue seats {int(venueStats(g.venue).seats)}. More seats and better production carry a show further.</div>}
        </div>
        <div>
          {type === 'keynote' && inDev.length > 0 && <Choice label="Device" icon="devices" value={pid ?? ''} options={inDev.map((p) => ({ value: p.id, label: p.name }))} onChange={setProductId} />}
          {(type === 'fanfest' || type === 'devcon') && <Slider label="Days from now" icon="hourglass" value={days} min={EVENT_LEAD} max={180} format={(v) => int(v)} onChange={setDays} />}
          <div className="flex items-baseline justify-between gap-3 py-1">
            <span className="text-[11px] text-dim">
              <Icon name="calendar" size={11} className="mr-[5px] inline-block" style={{ verticalAlign: -2 }} />
              Date
            </span>
            <span className="text-xs text-fg">{when}</span>
          </div>
        </div>
      </div>
    </Drawer>
  )
}

function Events() {
  const g = useGame()
  const { watch, focus } = useStore.getState()
  const [booking, setBooking] = useState<EventType | null>(null)
  const upcoming = g.events.filter((e) => !e.done).sort((a, b) => a.day - b.day)
  const past = g.events.filter((e) => e.done).sort((a, b) => b.day - a.day)
  const firstDev = unveilable(g)[0]
  const fair = nextFair(g.day)
  const blockedFor = (t: EventType) => eventBlocked(g, t, 0, firstDev?.id)
  const nameOf = (e: GameEvent) => g.products.find((p) => p.id === e.productId)

  const booked: Column<GameEvent>[] = [
    {
      id: 'event',
      head: 'Event',
      sort: (e) => EVENTS[e.type].name,
      cell: (e) => {
        const p = nameOf(e)
        return (
          <span className="flex items-center gap-2 text-fg">
            <Icon name={eventIcon(e.type)} size={13} className="shrink-0 text-dim" />
            <span className="min-w-0 truncate">
              {EVENTS[e.type].name}
              {p && <span className="text-dim">, {p.name}</span>}
            </span>
          </span>
        )
      },
    },
    { id: 'venue', head: 'Venue', min: 150, drop: 2, sort: (e) => EVENTS[e.type].venues[e.venue].name, cell: (e) => <span className="text-dim">{EVENTS[e.type].venues[e.venue].name}</span> },
    { id: 'date', head: 'Date', min: 104, sort: (e) => e.day, first: 'asc', cell: (e) => <span className="num text-fg">{fmtDate(e.day)}</span> },
    { id: 'left', head: 'Days left', num: true, min: 84, drop: 1, sort: (e) => e.day, first: 'asc', cell: (e) => int(Math.max(0, e.day - g.day)) },
    { id: 'cost', head: 'Paid', num: true, min: 76, sort: (e) => e.cost, cell: (e) => <span className="text-dim">{money(e.cost)}</span> },
  ]

  const offer: Column<EventType>[] = [
    {
      id: 'event',
      head: 'Event',
      cell: (t) => (
        <span className="flex items-center gap-2 text-fg">
          <Icon name={eventIcon(t)} size={13} className="shrink-0 text-dim" />
          <span className="min-w-0 truncate">{EVENTS[t].name}</span>
        </span>
      ),
    },
    { id: 'for', head: 'What it brings', min: 250, drop: 1, cell: (t) => <span className="text-dim">{EVENT_FOR[t]}</span> },
    {
      id: 'when',
      head: 'Date',
      min: 320,
      cell: (t) => {
        const blocked = blockedFor(t)
        if (blocked)
          return (
            <span className="flex items-center gap-[6px] text-dim" title={blocked}>
              <Icon name="lock" size={11} className="shrink-0 text-faint" />
              <span className="min-w-0 truncate">{blocked}</span>
            </span>
          )
        if (t === 'keynote') return <span className="text-fg">The device&apos;s release day</span>
        if (t === 'expo')
          return (
            <span className="text-fg">
              {fair.name}, <span className="num">{fmtDate(fair.day)}</span>
            </span>
          )
        return <span className="text-fg">A day you choose</span>
      },
    },
    { id: 'cost', head: 'From', num: true, min: 76, cell: (t) => <span className="text-dim">{money(Math.min(...EVENTS[t].venues.map((v) => v.cost)))}</span> },
  ]

  const done: Column<GameEvent>[] = [
    {
      id: 'event',
      head: 'Event',
      cell: (e) => (
        <span className="flex items-center gap-2" title={e.summary}>
          <Icon name={eventIcon(e.type)} size={13} className="shrink-0 text-dim" />
          <span className="shrink-0 text-fg">{EVENTS[e.type].name}</span>
          <span className="min-w-0 truncate text-dim">{e.summary}</span>
        </span>
      ),
    },
    { id: 'date', head: 'Date', min: 104, sort: (e) => e.day, cell: (e) => <span className="num text-dim">{fmtDate(e.day)}</span> },
    { id: 'score', head: 'Score', title: 'Out of 100', num: true, min: 72, sort: (e) => e.score ?? 0, cell: (e) => <span className={(e.score ?? 0) >= 70 ? 'text-pos' : (e.score ?? 0) >= 45 ? 'text-fg' : 'text-neg'}>{int(e.score ?? 0)}</span> },
  ]

  return (
    <>
      <Panel title="Booked" icon="calendar" count={upcoming.length || undefined} className="shrink-0">
        <Table label="Booked events" cols={booked} rows={upcoming} rowKey={(e) => e.id} keep="marketing:booked" firstMin={190} onRow={(e) => e.productId && focus(e.productId)} canRow={(e) => !!nameOf(e)} rowTitle={(e) => (e.productId ? `Open ${nameOf(e)?.name ?? 'the device'}` : undefined)} empty="Nothing is booked." />
      </Panel>
      <Panel
        title="Book an event"
        icon="mic"
        className="shrink-0"
        right={
          <Help title="How events work">
            <p>Each event has a few venues. A bigger venue costs more and reaches further.</p>
            <p className="mt-2">How an event goes is scored out of 100. The score depends on the venue, your marketers and how good the thing you showed really was: a weak device on a big stage gets found out.</p>
            <p className="mt-2">A launch keynote can also be booked in a device&apos;s launch plan, and it is held in your own venue once you have built one under Sites, Venue.</p>
          </Help>
        }
      >
        <Table
          label="Events that can be booked"
          cols={offer}
          rows={EVENT_TYPES}
          rowKey={(t) => t}
          firstMin={170}
          actionWidth={84}
          actionAlways={() => true}
          action={(t) => {
            const blocked = blockedFor(t)
            return (
              <Btn small icon="calendar" active={booking === t ? true : undefined} disabled={!!blocked} title={blocked ?? undefined} onClick={() => setBooking(booking === t ? null : t)}>
                Book
              </Btn>
            )
          }}
        />
      </Panel>
      {past.length > 0 && (
        <Fold
          keep="marketing:past"
          open={false}
          icon="star"
          title={
            <>
              Past events <span className="num pl-1 text-[11px] font-normal text-faint">{past.length}</span>
            </>
          }
        >
          <Table
            label="Past events"
            cols={done}
            rows={past}
            rowKey={(e) => e.id}
            keep="marketing:past"
            firstMin={260}
            actionWidth={124}
            actionAlways={() => true}
            action={(e) =>
              e.type === 'keynote' && e.beats ? (
                <Btn small tone="ghost" icon="play" onClick={() => watch(e.id)}>
                  Watch again
                </Btn>
              ) : null
            }
          />
        </Fold>
      )}
      {booking && <BookEvent key={booking} type={booking} onClose={() => setBooking(null)} />}
    </>
  )
}

export function MarketingScreen() {
  const g = useGame()
  const [view] = useView<'campaigns' | 'events'>('marketing', 'campaigns')
  if (view === 'events' && !has(g, 'events')) return <LockedPane id="events" />
  return <Page keep={`marketing:${view}`}>{view === 'events' ? <Events /> : <Campaigns />}</Page>
}
