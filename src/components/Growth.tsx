// Growth: advertising campaigns, fans and owner feedback, events, and stores.
import { useState } from 'react'
import { sfx } from '../audio/sfx'
import { TYPES, segmentsOf } from '../data/devices'
import { autoVenue, buildVenue, closeStore, fmtDate, openStore, player, scheduleEvent, setCampaignBudget, startCampaign, stopCampaign } from '../sim/game'
import { CHANNELS, EVENTS, EVENT_LEAD, OWN_VENUE, channelFit, dailyTickets, eventBlocked, hasStage, keynoteReach, nextFair } from '../sim/growth'
import { homeRegion, openRegions, regionInfo } from '../sim/regions'
import { SITE_TIERS, sitePrestige, storeStats, tierOf, upkeep, venueStats } from '../sim/sites'
import { staffEffects } from '../sim/staff'
import type { ChannelId, EventType, GameState } from '../sim/types'
import { takeAim } from '../store/focus'
import { useGame, useStore } from '../store/game'
import { SiteBuilder } from './SiteBuilder'
import { Icon, channelIcon, eventIcon } from './icons'
import { Btn, Choice, Empty, Fold, Head, IconBtn, Kpi, Lead, Meter, Mini, Panel, Slider, Tabs, Tag, Th, money, num, pct } from './ui'

const own = (g: GameState) => g.products.filter((p) => p.companyId === 'player' && p.status !== 'ended')

// ------------------------------------------------------------------ campaigns

function Campaigns() {
  const g = useGame()
  const { act, say, focus } = useStore.getState()
  const [channel, setChannel] = useState<ChannelId>('online')
  const [target, setTarget] = useState('brand')
  const [monthly, setMonthly] = useState(100e3)
  const [region, setRegion] = useState('all')
  const regions = openRegions(g)
  const def = CHANNELS[channel]
  const products = own(g)
  const product = products.find((p) => p.id === target)
  const budget = Math.max(monthly, def.min)
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-2">
      <Panel title="New campaign" icon="plus" bodyClass="overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(CHANNELS) as ChannelId[]).map((id) => (
            <button key={id} onClick={() => setChannel(id)} className={`border p-2 text-left ${channel === id ? 'border-accent bg-accent/10' : 'border-line hover:border-line2'}`}>
              <div className={`flex items-center gap-[6px] text-[11px] font-semibold uppercase tracking-wider ${channel === id ? 'text-accent' : 'text-fg'}`}>
                <Icon name={channelIcon(id)} size={13} className={channel === id ? '' : 'text-dim'} />
                <span className="min-w-0 truncate">{CHANNELS[id].name}</span>
              </div>
              <div className="num text-[10px] text-faint">from {money(CHANNELS[id].min, 0)} / mo</div>
            </button>
          ))}
        </div>
        <div className="mt-2 text-[11px] leading-snug text-dim">{def.note}</div>
        <div className="mt-2">
          <Choice label="Advertise" icon="marketing" value={target} options={[{ value: 'brand', label: 'The company (awareness)' }, ...products.map((p) => ({ value: p.id, label: p.name }))]} onChange={setTarget} />
          {regions.length > 1 && <Choice label="Where" icon="pin" value={region} options={[{ value: 'all', label: 'Everywhere you sell' }, ...regions.map((r) => ({ value: r.id, label: `${r.name} only` }))]} onChange={setRegion} />}
          <Slider label="Monthly budget" icon="cash" value={budget} min={def.min} max={Math.max(5e6, def.min * 10)} step={10e3} format={(v) => money(v)} onChange={setMonthly} />
        </div>
        {product && (
          <div className="mt-1 border border-line p-2">
            <Head icon="target" className="mb-1 text-faint">
              How well this channel reaches each {TYPES[product.type].name.toLowerCase()} segment
            </Head>
            {segmentsOf(product.type).map((s) => {
              const fit = channelFit(channel, s)
              return (
                <div key={s.id} className="flex items-center gap-2 py-[2px]">
                  <span className="w-28 truncate text-[11px] text-dim">{s.name}</span>
                  <Meter value={fit} max={2} tone={fit >= 1.3 ? 'pos' : fit >= 0.9 ? 'accent' : 'dim'} />
                </div>
              )
            })}
          </div>
        )}
        <Btn
          tone="primary"
          icon="play"
          className="mt-3 h-9 w-full"
          onClick={() => {
            const err = act((s) => startCampaign(s, channel, target, budget, region === 'all' ? undefined : region))
            if (err) say(err, 'bad')
            else (sfx.confirm(), say('Campaign started. It is billed daily until you stop it.'))
          }}
        >
          Start campaign at {money(budget, 1)} / month
        </Btn>
      </Panel>
      <Panel title={`Running campaigns (${g.campaigns.length})`} icon="marketing" bodyClass="overflow-auto">
        {g.campaigns.length === 0 ? (
          <Empty icon="marketing" text="Nothing is running. Brand campaigns raise awareness of the company; product campaigns build interest in one device with the segments a channel reaches." />
        ) : (
          <table className="grid-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Advertising</th>
                <th className="w-44">Monthly budget</th>
                <th className="r">Spent</th>
                <th className="w-24">Interest</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {g.campaigns.map((c) => {
                const p = g.products.find((x) => x.id === c.target)
                const buzz = p ? Math.max(0, ...Object.values(p.buzz)) : 0
                return (
                  <tr key={c.id} className="row">
                    <td className="text-fg">
                      <Lead icon={channelIcon(c.channel)} size={12} />
                      {CHANNELS[c.channel].name}
                      {c.region && <span className="ml-2 text-[10px] text-faint">{regionInfo(c.region).name}</span>}
                    </td>
                    <td className={p ? 'cursor-pointer text-accent' : 'text-dim'} onClick={() => p && focus(p.id)}>
                      {p ? p.name : 'Company'}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <input type="range" className="flex-1" min={CHANNELS[c.channel].min} max={Math.max(5e6, CHANNELS[c.channel].min * 10)} step={10e3} value={c.monthly} onChange={(e) => act((s) => setCampaignBudget(s, c.id, Number(e.target.value)))} />
                        <span className="num w-14 text-right text-[11px] text-fg">{money(c.monthly, 1)}</span>
                      </div>
                    </td>
                    <td className="num r text-dim">{money(c.spent, 1)}</td>
                    <td>{p ? <Meter value={buzz} tone={buzz > 0.5 ? 'pos' : 'accent'} /> : <span className="text-[10px] text-faint">brand only</span>}</td>
                    <td className="r">
                      <IconBtn icon="stop" tone="ghost" title="Stop this campaign" onClick={() => act((s) => stopCampaign(s, c.id))} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}

// ------------------------------------------------------------------ fans

function Fans() {
  const g = useGame()
  const { focus, setTab } = useStore.getState()
  const products = own(g).filter((p) => p.status === 'sale')
  const tickets = dailyTickets(g)
  const capacity = staffEffects(g).support + 20
  const feed = products.flatMap((p) => p.feedback.map((f) => ({ ...f, product: p }))).sort((a, b) => b.day - a.day).slice(0, 30)
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-2">
      <div className="flex min-h-0 flex-col gap-2">
        <Panel title="How owners feel, by device" icon="morale" className="flex-1" bodyClass="overflow-auto">
          {products.length === 0 ? (
            <Empty icon="morale" text="Owner satisfaction appears once a device is on sale." />
          ) : (
            <table className="grid-table">
              <thead>
                <tr>
                  <Th icon="devices">Device</Th>
                  <Th icon="morale" className="w-40">
                    Satisfaction
                  </Th>
                  <Th icon="star" r>
                    Review
                  </Th>
                  <Th icon="alert" r>
                    Faults
                  </Th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="row cursor-pointer" onClick={() => focus(p.id)}>
                    <td className="text-fg">{p.name}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Meter value={p.satisfaction} tone={p.satisfaction > 0.7 ? 'pos' : p.satisfaction > 0.5 ? 'accent' : 'neg'} />
                        <span className="num w-8 text-right text-fg">{pct(p.satisfaction, 0)}</span>
                      </div>
                    </td>
                    <td className="num r text-dim">{p.reviewAvg.toFixed(1)}</td>
                    <td className={`num r ${p.defectRate > 0.03 ? 'text-warn' : 'text-dim'}`}>{pct(p.defectRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Customer support" icon="headset" className="shrink-0" bodyClass="p-2">
          <div className="flex items-center gap-2">
            <span className="w-28 text-[11px] text-dim">Tickets answered</span>
            <Meter value={Math.min(capacity, tickets)} max={Math.max(tickets, 1)} tone={capacity >= tickets ? 'pos' : 'neg'} />
            <span className="num w-24 text-right text-[11px] text-fg">
              {Math.round(Math.min(capacity, tickets))} / {Math.round(tickets)} a day
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] leading-snug text-faint">Unanswered owners are less satisfied. Support agents answer about 120 tickets a day each; a support bar in a store helps too.</span>
            {capacity < tickets && (
              <Btn small icon="hire" onClick={() => setTab('staff')}>
                Hire support
              </Btn>
            )}
          </div>
        </Panel>
      </div>
      <Panel title="What owners are saying" icon="review" bodyClass="overflow-y-auto">
        {feed.length === 0 && <Empty icon="review" text="Owner comments arrive weekly once a device is selling. They point at what to fix in the next model." />}
        {feed.map((f, i) => (
          <button key={i} onClick={() => focus(f.product.id)} className="flex w-full items-start gap-3 border-b border-line px-2 py-[6px] text-left hover:bg-hover">
            <span className={`num flex w-8 shrink-0 items-center gap-[3px] text-[11px] ${f.stars >= 4 ? 'text-pos' : f.stars <= 2 ? 'text-neg' : 'text-dim'}`} title={`${f.stars} out of 5`}>
              <Icon name="star" size={11} />
              {f.stars}
            </span>
            <span className="flex-1 text-[12px] text-fg">{f.text}</span>
            <span className="num shrink-0 text-right text-[9px] text-faint">
              {f.product.name}
              <br />
              {fmtDate(f.day)}
            </span>
          </button>
        ))}
      </Panel>
    </div>
  )
}

// ------------------------------------------------------------------ events

function EventCard({ type }: { type: EventType }) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const def = EVENTS[type]
  const inDev = g.products.filter((p) => p.companyId === 'player' && p.status === 'dev' && !g.events.some((e) => e.type === 'keynote' && e.productId === p.id && !e.done))
  const [venue, setVenue] = useState(0)
  const [productId, setProductId] = useState('')
  const [days, setDays] = useState(30)
  const pid = productId || inDev[0]?.id
  const blocked = eventBlocked(g, type, venue, pid)
  const fair = nextFair(g.day)
  const reach = type === 'keynote' ? keynoteReach(g, venue) : def.venues[venue].reach
  const product = g.products.find((p) => p.id === pid)
  const when = type === 'keynote' ? (product ? `on release day, ${fmtDate(g.day + product.devDaysLeft)}` : '') : type === 'expo' ? `${fair.name}, ${fmtDate(fair.day)}` : `${fmtDate(g.day + days)}`
  return (
    <div className="flex flex-col border border-line bg-panel p-3">
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg">
        <Icon name={eventIcon(type)} size={14} className="text-accent" />
        {def.name}
      </div>
      <div className="mt-1 min-h-12 text-[11px] leading-snug text-dim">{def.note}</div>
      <div className="mt-2 flex-1">
        <Choice label="Venue" icon="venue" value={venue} options={def.venues.map((v, i) => ({ value: i, label: `${v.name} (${money(v.cost, 1)})`, locked: type === 'keynote' && i === 3 && !hasStage(g) }))} onChange={setVenue} />
        {type === 'keynote' && inDev.length > 0 && <Choice label="Device" icon="devices" value={pid ?? ''} options={inDev.map((p) => ({ value: p.id, label: p.name }))} onChange={setProductId} />}
        {(type === 'fanfest' || type === 'devcon') && <Slider label="Hold it in" icon="calendar" value={days} min={EVENT_LEAD} max={180} format={(v) => `${v} days`} onChange={setDays} />}
        <div className="flex items-center gap-2 py-1">
          <span className="flex w-14 items-center gap-1 text-[10px] uppercase tracking-wider text-faint">
            <Icon name="target" size={10} />
            Reach
          </span>
          <Meter value={reach} max={1.1} tone={reach >= 0.9 ? 'pos' : 'accent'} />
        </div>
        {type === 'keynote' && venue === OWN_VENUE && g.venue && <div className="text-[10px] leading-snug text-faint">Your venue seats {venueStats(g.venue).seats}. More seats and better production carry a show further.</div>}
        {when && !blocked && (
          <div className="num py-1 text-[10px] text-faint">
            <Lead icon="calendar" size={10} />
            {when}
          </div>
        )}
      </div>
      {blocked ? (
        <div className="mt-2 flex items-start gap-2 border border-line px-2 py-[7px] text-[11px] text-faint">
          <Icon name="lock" size={12} className="mt-[1px]" />
          <span>{blocked}</span>
        </div>
      ) : (
        <Btn
          tone="primary"
          icon="calendar"
          className="mt-2"
          onClick={() => {
            const err = act((s) => scheduleEvent(s, type, venue, pid, days))
            if (err) say(err, 'bad')
            else (sfx.confirm(), say(`${def.name} booked.`))
          }}
        >
          Book for {money(def.venues[venue].cost, 1)}
        </Btn>
      )}
    </div>
  )
}

function Events() {
  const g = useGame()
  const { watch } = useStore.getState()
  const upcoming = g.events.filter((e) => !e.done).sort((a, b) => a.day - b.day)
  const past = g.events.filter((e) => e.done).sort((a, b) => b.day - a.day)
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="grid shrink-0 grid-cols-4 gap-2">
        {(Object.keys(EVENTS) as EventType[]).map((t) => (
          <EventCard key={t} type={t} />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        <Panel title={`Booked (${upcoming.length})`} icon="calendar" bodyClass="overflow-y-auto">
          {upcoming.length === 0 && <Empty icon="calendar" text="Nothing is booked." />}
          {upcoming.map((e) => (
            <div key={e.id} className="flex items-center justify-between border-b border-line px-2 py-[6px]">
              <span className="text-[12px] text-fg">
                <Lead icon={eventIcon(e.type)} size={12} />
                {EVENTS[e.type].name} <span className="text-dim">/ {EVENTS[e.type].venues[e.venue].name}</span>
                {e.productId && <span className="text-dim"> / {g.products.find((p) => p.id === e.productId)?.name}</span>}
              </span>
              <span className="num text-[11px] text-accent">
                <Lead icon="hourglass" size={10} />
                {Math.max(0, e.day - g.day)} days
              </span>
            </div>
          ))}
        </Panel>
        <Panel title="How they went" icon="star" bodyClass="overflow-y-auto">
          {past.length === 0 && <Empty icon="star" text="Results appear here after each event. The score depends on the venue, your marketers and how good the thing you showed really was." />}
          {past.map((e) => (
            <div key={e.id} className="flex items-start gap-3 border-b border-line px-2 py-[6px]">
              <span className={`num w-8 shrink-0 text-lg leading-none ${(e.score ?? 0) >= 70 ? 'text-pos' : (e.score ?? 0) >= 45 ? 'text-fg' : 'text-neg'}`}>{e.score}</span>
              <div className="flex-1">
                <div className="text-[11px] text-fg">
                  <Lead icon={eventIcon(e.type)} />
                  {EVENTS[e.type].name} <span className="text-faint">/ {fmtDate(e.day)}</span>
                </div>
                <div className="text-[11px] text-dim">{e.summary}</div>
              </div>
              {e.type === 'keynote' && e.beats && (
                <IconBtn icon="play" title="Watch the keynote again" onClick={() => watch(e.id)} />
              )}
            </div>
          ))}
        </Panel>
      </div>
    </div>
  )
}

export function MarketingScreen() {
  const g = useGame()
  const me = player(g)
  const [view, setView] = useState<'campaigns' | 'fans' | 'events'>('campaigns')
  const spend = g.campaigns.reduce((a, c) => a + c.monthly, 0)
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="grid shrink-0 grid-cols-4 gap-2">
        <Kpi label="Awareness" icon="eye" value={pct(me.awareness)} sub="share of buyers who know you exist" tone="accent" />
        <Kpi label="Brand reputation" icon="brand" value={Math.round(me.brand * 100)} sub="moved by review scores" />
        <Kpi label="Fans" icon="heart" value={num(g.fans)} sub={`buy again about every ${Math.round(800 / 360 * 10) / 10} years`} />
        <Kpi label="Campaign spend" icon="cash" value={money(spend, 1)} sub={`${g.campaigns.length} running, per month`} />
      </div>
      <Tabs value={view} onChange={setView} options={[{ value: 'campaigns', label: 'Campaigns', icon: 'marketing', badge: g.campaigns.length }, { value: 'fans', label: 'Fans and feedback', icon: 'heart' }, { value: 'events', label: 'Events', icon: 'mic', badge: g.events.filter((e) => !e.done).length || undefined }]} />
      <div className="min-h-0 flex-1">
        {view === 'campaigns' && <Campaigns />}
        {view === 'fans' && <Fans />}
        {view === 'events' && <Events />}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ stores

export function StoresScreen() {
  const g = useGame()
  const { act, say } = useStore.getState()
  // a store picked in the city view opens straight away
  const [openId, setOpenId] = useState<string>(() => takeAim('store') ?? 'list')
  const [region, setRegion] = useState(homeRegion(g))
  const regions = openRegions(g)
  const store = g.stores.find((s) => s.id === openId)
  const onSale = g.products.filter((p) => p.companyId === 'player' && p.status === 'sale')
  const open = (tier: number) => {
    const err = act((s) => openStore(s, tier, region))
    if (err) return say(err, 'bad')
    sfx.confirm()
    setOpenId(useStore.getState().game!.stores.at(-1)!.id)
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs value={store ? store.id : 'list'} onChange={setOpenId} options={[{ value: 'list', label: 'All stores', icon: 'stores' as const, badge: g.stores.length }, ...g.stores.map((s) => ({ value: s.id, label: s.name, icon: 'pin' as const }))]} className="bg-panel" />
      <div className="min-h-0 flex-1">
        {!store ? (
          <div className="h-full overflow-y-auto p-2">
            {regions.length > 1 && (
              <div className="mb-2 flex items-center gap-2 border border-line bg-panel px-2 py-[6px]">
                <span className="flex items-center gap-[5px] text-[10px] uppercase tracking-wider text-dim">
                  <Icon name="pin" size={11} />
                  Open the next store in
                </span>
                {regions.map((r) => (
                  <Btn key={r.id} small active={region === r.id} onClick={() => setRegion(r.id)}>
                    {r.name}
                  </Btn>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {SITE_TIERS.store.map((t, i) => (
                <div key={t.name} className="border border-line bg-panel p-3">
                  <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg">
                    <Icon name="stores" size={14} className="text-accent" />
                    {t.name}
                  </div>
                  <div className="mt-1 min-h-8 text-[11px] leading-snug text-dim">{t.blurb}</div>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    <Mini label="Plot" icon="plot" value={`${t.w} x ${t.h} m`} />
                    <Mini label="Passers-by" icon="person" value={`${num(t.traffic ?? 0)} / day`} />
                    <Mini label="Rent / mo" icon="receipt" value={money(t.rent, 0)} />
                  </div>
                  <Btn tone="primary" icon="plus" className="mt-3 w-full" onClick={() => open(i)}>
                    Open one for {money(t.cost, 1)}
                  </Btn>
                </div>
              ))}
            </div>
            <Panel title="Your stores" icon="stores" className="mt-2" bodyClass="overflow-auto">
              {g.stores.length === 0 ? (
                <Empty icon="stores" text="Your own stores sell at full price, with no retailer taking 15%, and every visitor learns your name. Each one is yours to design: mark out the rooms, choose the cladding, lay out the tables." />
              ) : (
                <table className="grid-table">
                  <thead>
                    <tr>
                      <Th icon="stores">Store</Th>
                      <Th icon="pin">Location</Th>
                      <Th icon="info">Status</Th>
                      <Th icon="person" r>
                        Visitors / day
                      </Th>
                      <Th icon="package" r>
                        Sold this month
                      </Th>
                      <Th icon="layers" r>
                        Sold in total
                      </Th>
                      <Th icon="receipt" r>
                        Cost / month
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.stores.map((s) => {
                      const st = storeStats(s.site)
                      return (
                        <tr key={s.id} className="row cursor-pointer" onClick={() => setOpenId(s.id)}>
                          <td className="text-fg">{s.name}</td>
                          <td className="text-dim">
                            {s.location} <span className="text-faint">/ {regionInfo(s.region).name}</span>
                          </td>
                          <td>{st.open ? <Tag tone="pos" icon="check">trading</Tag> : <Tag tone="neg" icon="lock">closed</Tag>}</td>
                          <td className="num r text-dim">{num(s.lastVisitors)}</td>
                          <td className="num r text-fg">{num(s.monthUnits)}</td>
                          <td className="num r text-dim">{num(s.unitsTotal)}</td>
                          <td className="num r text-dim">{money(upkeep(s.site) + st.wages, 1)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        ) : (
          (() => {
            const st = storeStats(store.site)
            return (
              <SiteBuilder key={store.id} siteRef={`store:${store.id}`} site={store.site} products={onSale} busy={st.capacity ? store.lastVisitors / st.capacity : 0}>
                <Fold title={store.name} icon="stores" right={st.open ? <Tag tone="pos" icon="check">trading</Tag> : <Tag tone="neg" icon="lock">closed</Tag>} bodyClass="p-2">
                  {st.problem && <div className="mb-2 text-[11px] text-warn">{st.problem}</div>}
                  {st.open && !onSale.length && <div className="mb-2 text-[11px] text-warn">You have nothing on sale to put on the tables.</div>}
                  <div className="grid grid-cols-2 gap-1">
                    <Mini label="Visitors / day" icon="person" value={num(store.lastVisitors)} tone="text-fg" />
                    <Mini label="Can serve" icon="staff" value={num(st.capacity)} />
                    <Mini label="Sold this month" icon="package" value={num(store.monthUnits)} tone="text-fg" />
                    <Mini label="Cost / month" icon="receipt" value={money(upkeep(store.site) + st.wages, 1)} />
                  </div>
                  <div className="mt-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] text-dim">
                        <Lead icon="heart" />
                        Appeal
                      </span>
                      <span className="num text-[11px] text-fg">{pct(st.appeal, 0)}</span>
                    </div>
                    <Meter value={st.appeal} tone={st.appeal > 0.75 ? 'pos' : st.appeal > 0.5 ? 'accent' : 'warn'} />
                    <div className="mt-1 text-[10px] leading-snug text-faint">Appeal turns more visitors into buyers. Add plants, a logo wall and benches, give the building its own cladding, and leave the floor uncrowded.</div>
                  </div>
                </Fold>
                <Fold title="Manage" icon="system" open={false} bodyClass="p-2">
                  <div className="text-[10px] leading-snug text-faint">Each checkout, support bar and repair bench needs one member of staff. A support bar makes every owner a little happier; repair benches cut the cost of warranty work.</div>
                  <Btn small tone="danger" icon="lock" className="mt-2 w-full" onClick={() => (act((s) => closeStore(s, store.id)), setOpenId('list'))}>
                    Close this store
                  </Btn>
                </Fold>
              </SiteBuilder>
            )
          })()
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ venue

export function VenueScreen() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const [rehearse, setRehearse] = useState(false)
  const next = SITE_TIERS.venue[g.venue ? g.venue.tier + 1 : 0]
  const buy = () => {
    const err = act((s) => buildVenue(s))
    if (err) say(err, 'bad')
    else sfx.confirm()
  }
  if (!g.venue) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="w-[520px] border border-line bg-panel p-4">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg">
            <Icon name="venue" size={14} className="text-accent" />A venue of your own
          </div>
          <div className="mt-2 text-[12px] leading-relaxed text-dim">
            Hired theatres do the job, but the companies people remember launch on their own stage. Buy a plot and build it your way: an open-air amphitheatre or a hall with a foyer, the stage, the screen, the rigging and every block of seats. Keynotes held there cost a fraction of an arena, and the bigger and better equipped it is, the further each show carries.
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1">
            <Mini label="First plot" icon="pin" value={next.name} tone="text-fg" />
            <Mini label="Size" icon="plot" value={`${next.w} x ${next.h} m`} />
            <Mini label="Upkeep / month" icon="receipt" value={money(next.rent, 1)} />
          </div>
          <Btn tone="primary" icon="plot" className="mt-3 h-9 w-full" onClick={buy}>
            Buy the plot for {money(next.cost, 1)}
          </Btn>
        </div>
      </div>
    )
  }
  const st = venueStats(g.venue)
  const shows = g.events.filter((e) => e.done && e.type === 'keynote' && e.venue === OWN_VENUE)
  return (
    <SiteBuilder siteRef="venue" site={g.venue} products={g.products.filter((p) => p.companyId === 'player' && p.status === 'sale')} show={rehearse ? { crowd: 0.92, cheer: false, presenter: true } : undefined}>
      <Fold title="Venue" icon="venue" right={st.ready ? <Tag tone="pos" icon="check">ready</Tag> : <Tag tone="warn" icon="alert">not ready</Tag>} bodyClass="p-2">
        {st.problem && <div className="mb-2 text-[11px] text-warn">{st.problem}</div>}
        <div className="grid grid-cols-2 gap-1">
          <Mini label="Seats" icon="seat" value={num(st.seats)} tone="text-fg" />
          <Mini label="Shows held" icon="mic" value={shows.length} />
          <Mini label="Prestige" icon="brand" value={sitePrestige(g.venue).toFixed(0)} />
          <Mini label="Upkeep / month" icon="receipt" value={money(upkeep(g.venue), 1)} />
        </div>
        {(
          [
            ['Production', st.production, 'Screens, lights, sound and cameras for the size of the crowd.', 'camera'],
            ['Reach', st.reach / 1.1, 'How far a keynote here carries. A hired arena is the full bar.', 'target'],
          ] as const
        ).map(([label, v, note, icon]) => (
          <div key={label} className="mt-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-dim">
                <Lead icon={icon} />
                {label}
              </span>
              <span className="num text-[11px] text-fg">{pct(v, 0)}</span>
            </div>
            <Meter value={v} tone={v > 0.75 ? 'pos' : v > 0.4 ? 'accent' : 'warn'} />
            <div className="mt-1 text-[10px] leading-snug text-faint">{note}</div>
          </div>
        ))}
        <Btn small icon={rehearse ? 'stop' : 'mic'} className="mt-2 w-full" active={rehearse} onClick={() => setRehearse(!rehearse)}>
          {rehearse ? 'End the rehearsal' : 'Rehearse with a full house'}
        </Btn>
        {!g.venue.items.length && (
          <Btn
            small
            tone="primary"
            icon="build"
            className="mt-2 w-full"
            onClick={() => {
              const err = act((s) => autoVenue(s))
              if (err) say(err, 'bad')
              else sfx.zone()
            }}
          >
            Lay out a starter stage
          </Btn>
        )}
      </Fold>
      <Fold title="More land" icon="plot" open={false} bodyClass="p-2">
        {next ? (
          <>
            <div className="text-sm text-fg">{next.name}</div>
            <div className="text-[11px] leading-snug text-dim">{next.blurb}</div>
            <div className="num mt-1 text-[10px] text-faint">
              {next.w} x {next.h} m, upkeep {money(next.rent, 1)} / mo
            </div>
            <Btn tone="primary" icon="truck" className="mt-2 w-full" onClick={buy}>
              Move for {money(next.cost, 1)}
            </Btn>
            <div className="mt-1 text-[10px] text-faint">Everything you have built is moved across as it stands.</div>
          </>
        ) : (
          <div className="text-[11px] text-dim">This is the largest venue site there is.</div>
        )}
      </Fold>
    </SiteBuilder>
  )
}
