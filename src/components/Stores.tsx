// Split out of Growth.tsx for the interface redesign.
import { useEffect, useState } from 'react'
import { sfx } from '../audio/sfx'
import { TYPES, segmentsOf } from '../data/devices'
import { autoVenue, buildVenue, closeStore, copyLayout, fmtDate, layoutQuote, layoutValue, newLayoutQuote, openStore, player, scheduleEvent, setCampaignBudget, startCampaign, stopCampaign } from '../sim/game'
import { capOfChannel, has, lockTip } from '../sim/progress'
import { CHANNELS, EVENTS, EVENT_LEAD, OWN_VENUE, channelFit, dailyTickets, eventBlocked, hasStage, keynoteReach, nextFair } from '../sim/growth'
import { homeRegion, openRegions, regionInfo } from '../sim/regions'
import { SITE_TIERS, sitePrestige, storeStats, tierOf, upkeep, venueStats } from '../sim/sites'
import { staffEffects } from '../sim/staff'
import type { ChannelId, EventType, GameState, Store } from '../sim/types'
import { takeAim } from '../store/focus'
import { useGame, useStore, useView } from '../store/game'
import { LockedPane } from './Progress'
import { SiteBuilder } from './SiteBuilder'
import { Icon, channelIcon, eventIcon } from './icons'
import { Btn, Choice, ConfirmBtn, Drawer, Empty, Fold, Head, IconBtn, Kpi, Lead, Meter, Mini, Panel, Slider, Tabs, Tag, Th, money, num, pct, pressable, useKept } from "./ui"

// ------------------------------------------------------------------ stores

/** What a copy costs, in words: a price, or what comes back when the fittings cleared are worth more than the copy. */
const copyCost = (cost: number) => (cost >= 0 ? money(cost, 0) : `${money(-cost, 0)} back`)

/**
 * Chooses which other store to copy a layout from. Each one shows its plot,
 * how much room its layout needs, what it is worth and what copying it here
 * would come to; choosing one asks before anything is replaced.
 */
function LayoutPicker({ store, onClose }: { store: Store; onClose: () => void }) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const [pick, setPick] = useState<string | null>(null)
  const others = g.stores.filter((s) => s.id !== store.id)
  const chosen = others.find((s) => s.id === pick)
  const quote = chosen ? layoutQuote(g, chosen.id, store.id) : null
  const confirm = () => {
    if (!chosen) return
    const err = act((s) => copyLayout(s, chosen.id, store.id))
    if (err) return say(err, 'bad')
    sfx.zone()
    say(`${store.name} now has the layout of ${chosen.name}.`)
    onClose()
  }
  return (
    <Drawer
      open
      onClose={onClose}
      width={440}
      title={`Copy a layout to ${store.name}`}
      footer={
        chosen && quote && quote.same ? (
          // already built alike: nothing to replace, nothing to pay
          <div>
            <div className="flex items-start gap-2 text-[11px] leading-snug text-dim">
              <Icon name="check" size={13} className="mt-[1px] shrink-0 text-pos" />
              <span>
                {store.name} already has the layout of {chosen.name}, down to the last piece of furniture. There is nothing to rebuild and nothing to pay.
              </span>
            </div>
            <div className="mt-2 flex gap-2">
              <Btn icon="close" className="flex-1" onClick={() => setPick(null)}>
                Choose another
              </Btn>
            </div>
          </div>
        ) : chosen && quote && !quote.error ? (
          <div>
            <div className="flex items-start gap-2 text-[11px] leading-snug text-warn">
              <Icon name="alert" size={13} className="mt-[1px] shrink-0" />
              <span>
                This replaces everything built at {store.name}: its rooms and walls are cleared and its furniture is sold for {money(quote.resale, 0)}. The copy of {chosen.name} costs {money(quote.build, 0)} to build.
              </span>
            </div>
            <div className="mt-2 flex gap-2">
              <Btn tone="primary" icon="layers" className="flex-1" onClick={confirm}>
                Replace the layout: {copyCost(quote.cost)}
              </Btn>
              <Btn icon="close" onClick={() => setPick(null)}>
                Cancel
              </Btn>
            </div>
          </div>
        ) : (
          <div className="text-[11px] leading-snug text-faint">Choose a store to copy. Rooms, curved and slanted walls, doors and glass, floor finishes, cladding, roof, storeys and every piece of furniture come across; sales figures and the name stay with this store. Nothing changes until you confirm.</div>
        )
      }
    >
      <div className="border-b border-line px-3 py-2 text-[11px] text-dim">
        <Lead icon="plot" />
        {store.name} is a {tierOf(store.site).name.toLowerCase()}, <span className="num text-fg">{store.site.w} x {store.site.h} m</span>, with {money(layoutValue(store.site), 0)} of building and fittings on it now.
      </div>
      {others.length === 0 && <Empty icon="stores" text="There is no other store to copy from yet. Open a second one and either can take the other's layout." />}
      {others.map((s) => {
        const q = layoutQuote(g, s.id, store.id)
        const fits = q.needs[0] <= store.site.w && q.needs[1] <= store.site.h && q.needs[0] > 0
        const on = pick === s.id
        return (
          <button key={s.id} disabled={!fits} onClick={() => setPick(on ? null : s.id)} className={`block w-full border-b border-l-2 border-b-line px-3 py-2 text-left disabled:cursor-default ${on ? 'border-l-accent bg-accent/10' : 'border-l-transparent hover:bg-hover disabled:hover:bg-transparent'}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={`truncate text-xs font-semibold ${on ? 'text-accent' : fits ? 'text-fg' : 'text-faint'}`}>{s.name}</span>
              <span className="shrink-0 text-[11px] text-faint">
                {s.location} / {regionInfo(s.region).name}
              </span>
            </div>
            <div className="mt-[6px] grid grid-cols-4 gap-1">
              <Mini label="Plot" icon="plot" value={`${s.site.w} x ${s.site.h} m`} />
              <Mini label="Layout" icon="rooms" value={q.needs[0] ? `${q.needs[0]} x ${q.needs[1]} m` : 'none'} tone={fits ? 'text-fg' : 'text-neg'} />
              <Mini label="Worth" icon="cash" value={money(layoutValue(s.site), 0)} />
              <Mini label="To copy here" icon="receipt" value={!fits ? 'no room' : q.same ? 'the same' : copyCost(q.cost)} tone={!fits ? 'text-neg' : q.same ? 'text-dim' : q.error ? 'text-warn' : 'text-fg'} />
            </div>
            {q.error && <div className={`mt-1 text-[11px] leading-snug ${fits ? 'text-warn' : 'text-neg'}`}>{q.error}</div>}
          </button>
        )
      })}
    </Drawer>
  )
}

export function StoresScreen() {
  const g = useGame()
  const { act, say } = useStore.getState()
  // a store picked in the city view opens straight away
  const [openId, setOpenId] = useKept<string>('stores:open', 'list')
  useEffect(() => {
    const aimed = takeAim('store')
    if (aimed) setOpenId(aimed)
  }, [setOpenId])
  const [region, setRegion] = useState(homeRegion(g))
  /** Store whose layout the next one opened is fitted out with; empty for the standard fit-out. */
  const [layout, setLayout] = useState('')
  const [picking, setPicking] = useState(false)
  const regions = openRegions(g)
  const store = g.stores.find((s) => s.id === openId)
  const model = g.stores.find((s) => s.id === layout)
  const onSale = g.products.filter((p) => p.companyId === 'player' && p.status === 'sale')
  const open = (tier: number) => {
    const err = act((s) => openStore(s, tier, region, model?.id))
    if (err) return say(err, 'bad')
    sfx.confirm()
    setOpenId(useStore.getState().game!.stores.at(-1)!.id)
  }
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {store && picking && <LayoutPicker store={store} onClose={() => setPicking(false)} />}
      <Tabs value={store ? store.id : 'list'} onChange={setOpenId} options={[{ value: 'list', label: 'All stores', icon: 'stores' as const, badge: g.stores.length }, ...g.stores.map((s) => ({ value: s.id, label: s.name, icon: 'pin' as const }))]} className="bg-panel" fit />
      <div className="min-h-0 flex-1">
        {!store ? (
          <div className="h-full overflow-y-auto p-2">
            {regions.length > 1 && (
              <div className="mb-2 flex items-center gap-2 border border-line bg-panel px-2 py-[6px]">
                <span className="flex items-center gap-[5px] text-[11px] text-dim">
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
            {g.stores.length > 0 && (
              <div className="mb-2 border border-line bg-panel px-2 py-[2px]">
                <Choice label="Fit the next store out as" icon="layers" value={model ? model.id : ''} options={[{ value: '', label: 'Standard: a sales floor, a table and a checkout' }, ...g.stores.map((s) => ({ value: s.id, label: `A copy of ${s.name} (${s.location.toLowerCase()})` }))]} onChange={setLayout} />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {SITE_TIERS.store.map((t, i) => {
                const fit = model ? newLayoutQuote(g, model.id, i) : null
                return (
                <div key={t.name} className="border border-line bg-panel p-3">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-fg">
                    <Icon name="stores" size={14} className="text-accent" />
                    {t.name}
                  </div>
                  <div className="mt-1 min-h-8 text-[11px] leading-snug text-dim">{t.blurb}</div>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    <Mini label="Plot" icon="plot" value={`${t.w} x ${t.h} m`} />
                    <Mini label="Passers-by" icon="person" value={`${num(t.traffic ?? 0)} / day`} />
                    <Mini label="Rent / mo" icon="receipt" value={money(t.rent, 0)} />
                  </div>
                  {model && fit && (
                    <div className={`mt-2 flex items-baseline justify-between gap-2 border border-line px-2 py-1 text-[11px] ${fit.error ? 'text-neg' : 'text-dim'}`}>
                      <span className="min-w-0 truncate">
                        <Lead icon="layers" />
                        {fit.error ? `No room: ${model.name}'s layout is ${fit.needs[0]} x ${fit.needs[1]} m` : `Fitted out like ${model.name}`}
                      </span>
                      {!fit.error && <span className="num shrink-0 text-fg">+ {money(fit.cost, 0)}</span>}
                    </div>
                  )}
                  <ConfirmBtn tone="primary" confirm={`Pay ${money(t.cost + (fit && !fit.error ? fit.cost : 0), 1)}?`} icon="plus" className="mt-3 w-full" disabled={!!fit?.error} onClick={() => open(i)}>
                    Open one for {money(t.cost + (fit && !fit.error ? fit.cost : 0), 1)}
                  </ConfirmBtn>
                </div>
                )
              })}
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
                        <tr key={s.id} className="row cursor-pointer" {...pressable(() => setOpenId(s.id))}>
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
                    <div className="mt-1 text-[11px] leading-snug text-faint">Appeal turns more visitors into buyers. Add plants, a logo wall and benches, give the building its own cladding, and leave the floor uncrowded.</div>
                  </div>
                </Fold>
                <Fold title="Manage" icon="system" open={false} bodyClass="p-2">
                  <div className="text-[11px] leading-snug text-faint">Each checkout, support bar and repair bench needs one member of staff. A support bar makes every owner a little happier; repair benches cut the cost of warranty work.</div>
                  <Btn small icon="layers" className="mt-2 w-full" disabled={g.stores.length < 2} title={g.stores.length < 2 ? 'There is no other store to copy from yet' : 'Rebuild this store to the layout of another one'} onClick={() => setPicking(true)}>
                    Copy layout from...
                  </Btn>
                  <Btn small icon="plus" className="mt-1 w-full" title="Choose a plot for a new store fitted out exactly like this one" onClick={() => (setLayout(store.id), setOpenId('list'))}>
                    Open another like this
                  </Btn>
                  <ConfirmBtn small icon="lock" className="mt-2 w-full" confirm="Close it for good?" title="Closes the store and gives up the plot. Everything built there is lost." onClick={() => (act((s) => closeStore(s, store.id)), setOpenId('list'), say(`${store.name} is closed.`))}>
                    Close this store
                  </ConfirmBtn>
                </Fold>
              </SiteBuilder>
            )
          })()
        )}
      </div>
    </div>
  )
}
