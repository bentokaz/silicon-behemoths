// Sites, Stores: what each store earns, the sites on offer for the next one,
// and one store at a time in 3D. One picker chooses between all stores (the
// table) and a single store; the city sends the player to a store through
// `aim('store', id)`.
import { useEffect, useState } from 'react'
import { sfx } from '../audio/sfx'
import { RETAIL_CUT, canAfford, closeStore, copyLayout, fitOutQuote, fitOutStore, layoutQuote, layoutValue, storeOpenCost, storeOutlook } from '../sim/game'
import { type StoreAdvice, storeAdvice } from '../sim/retail'
import { type StoreMonth, storeMonth, storesMonth } from '../sim/insight'
import { regionInfo } from '../sim/regions'
import { SITE_TIERS, type StoreStats, storeStats, tierOf } from '../sim/sites'
import type { Store } from '../sim/types'
import { takeAim } from '../store/focus'
import { useGame, useStore } from '../store/game'
import { SiteBuilder } from './SiteBuilder'
import { OpenStoresDrawer } from './StoresOpen'
import { PROFIT_NOTE, VISITORS_HELP, copyCost, monthNote, profitLabel, signTone, storeLabel, storeStatus, visitorsADay, visitorsNote } from './SitesFigures'
import { BarRow, Detail, Fact, Note, Sec } from './SitesParts'
import { Icon } from './icons'
import { Btn, type Column, ConfirmBtn, Drawer, Help, Page, Panel, Pick, Strip, Table, Tag, int, money, num, pct, useKept } from './ui'

const TONE = { pos: 'text-pos', neg: 'text-neg' } as const
/** Each piece of store advice in a few words, for the table. */
const FIX_LABEL: Record<StoreAdvice['id'], string> = { closed: 'Finish the store', stock: 'Restock', capacity: 'More tables', awareness: 'Campaign here', appeal: 'Add decor', devices: 'Newer devices', margin: 'Raise prices', rent: 'Cheaper site', staff: 'Fewer staff' }
/** An amount coloured by its sign. */
const Signed = ({ v }: { v: number }) => {
  const tone = signTone(v)
  return <span className={tone ? TONE[tone] : 'text-fg'}>{money(v)}</span>
}

// ------------------------------------------------------------------ copying a layout

interface LayoutRow {
  store: Store
  fits: boolean
  needs: [number, number]
  cost: number
  same: boolean
  error: string | null
}

/**
 * Chooses which other store to copy a layout from, in the drawer. Each row
 * shows how much room the layout needs and what copying it here would come
 * to; choosing one says what will be replaced, and the button asks again
 * before anything is.
 */
function LayoutPicker({ store, onClose }: { store: Store; onClose: () => void }) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const [pick, setPick] = useState<string | null>(null)
  const rows: LayoutRow[] = g.stores
    .filter((s) => s.id !== store.id)
    .map((s) => {
      const q = layoutQuote(g, s.id, store.id)
      return { store: s, fits: q.needs[0] > 0 && q.needs[0] <= store.site.w && q.needs[1] <= store.site.h, needs: q.needs, cost: q.cost, same: q.same, error: q.error }
    })
  const chosen = g.stores.find((s) => s.id === pick && s.id !== store.id)
  const quote = chosen ? layoutQuote(g, chosen.id, store.id) : null
  const confirm = () => {
    if (!chosen) return
    const err = act((s) => copyLayout(s, chosen.id, store.id))
    if (err) return say(err, 'bad')
    sfx.zone()
    say(`${store.name} now has the layout of ${chosen.name}.`, 'ok')
    onClose()
  }
  const cols: Column<LayoutRow>[] = [
    { id: 'store', head: 'Copy from', cell: (r) => storeLabel(r.store), sort: (r) => r.store.name },
    { id: 'needs', head: 'Layout', title: 'The part of its plot the layout uses', num: true, min: 96, cell: (r) => (r.needs[0] ? `${r.needs[0]} x ${r.needs[1]} m` : '--') },
    {
      id: 'cost',
      head: 'Cost here',
      title: 'What building the copy costs, less what the furniture cleared from this store sells for',
      min: 104,
      className: 'text-right',
      sort: (r) => (r.fits && !r.error ? r.cost : null),
      first: 'asc',
      cell: (r) => (!r.fits ? <span className="text-neg">No room</span> : r.same ? <span className="text-dim">The same</span> : r.error ? <span className="text-warn">Cannot</span> : <span className="num text-fg">{copyCost(r.cost)}</span>),
    },
  ]
  return (
    <Drawer
      open
      onClose={onClose}
      width={440}
      title={`Copy a layout to ${store.name}`}
      footer={
        chosen && quote && quote.same ? (
          <div className="flex items-start gap-2 text-[11px] leading-snug text-dim">
            <Icon name="check" size={13} className="mt-[1px] shrink-0 text-pos" />
            <span>
              {store.name} already has the layout of {chosen.name}, down to the last piece of furniture. There is nothing to rebuild and nothing to pay.
            </span>
          </div>
        ) : chosen && quote && quote.error ? (
          <Note tone="warn">{quote.error}</Note>
        ) : chosen && quote ? (
          <div>
            <Note tone="warn">
              This replaces everything built at {store.name}: its rooms and walls are cleared and its furniture is sold for {money(quote.resale)}. The copy of {chosen.name} costs {money(quote.build)} to build. It cannot be undone.
            </Note>
            <div className="mt-2 flex gap-2">
              <ConfirmBtn tone="primary" large icon="layers" className="min-w-0 flex-1" confirm={`Replace everything at ${store.name}?`} onClick={confirm}>
                Replace the layout: {copyCost(quote.cost)}
              </ConfirmBtn>
              <Btn large tone="ghost" onClick={() => setPick(null)}>
                Cancel
              </Btn>
            </div>
          </div>
        ) : (
          <div className="text-[11px] leading-snug text-dim">Choose a store to copy. Its rooms, walls, doors and glass, floors, cladding, roof, storeys and every piece of furniture come across; the name and the sales figures stay with this store. Nothing changes until you confirm.</div>
        )
      }
    >
      <div className="border-b border-line px-3 py-2 text-[11px] leading-snug text-dim">
        {store.name} is {/^[aeiou]/i.test(tierOf(store.site).name) ? 'an' : 'a'} {tierOf(store.site).name.toLowerCase()}, <span className="num text-fg">{store.site.w} x {store.site.h} m</span>, with <span className="num text-fg">{money(layoutValue(store.site))}</span> of building and fittings on it now.
      </div>
      <Table
        label="Stores to copy a layout from"
        cols={cols}
        rows={rows}
        rowKey={(r) => r.store.id}
        selected={pick}
        onRow={(r) => (r.fits ? setPick(pick === r.store.id ? null : r.store.id) : say(r.error ?? `The layout of ${r.store.name} needs ${r.needs[0]} x ${r.needs[1]} m, more than this plot has.`, 'bad'))}
        rowTitle={(r) => r.error ?? (r.fits ? undefined : `Needs ${r.needs[0]} x ${r.needs[1]} m: more than this plot has`)}
        rowClass={(r) => (r.fits ? '' : '[&>td]:text-faint')}
        firstMin={170}
        empty="There is no other store to copy from yet. Open a second one and either can take the other's layout."
      />
    </Drawer>
  )
}

// ------------------------------------------------------------------ all stores

interface StoreRow {
  store: Store
  stats: StoreStats
  m: StoreMonth
  /** What to fix first, in a few words, and the whole advice. */
  fix: { label: string; text: string } | null
}

interface Offer {
  tier: number
  name: string
  blurb: string
  plot: string
  passers: number
  rent: number
  /** The plot plus the fit-out, when a copy of another store was asked for. */
  price: number
  /** Why it cannot be opened, if it cannot. */
  blocked?: string
  /** Expected profit a month of one such store in the best region for it, and that region. */
  profit: number
  best?: string
}

export function StoresScreen() {
  const g = useGame()
  const { act, say, go } = useStore.getState()
  // 'list' is the table of every store; anything else is the id of the store that is open
  const [openId, setOpenId] = useKept<string>('stores:open', 'list')
  // a store picked in the city view opens straight away
  useEffect(() => {
    const aimed = takeAim('store')
    if (aimed) setOpenId(aimed)
  }, [setOpenId])
  /** The open-stores drawer: the kind of site and the layout it starts with. */
  const [opening, setOpening] = useState<{ tier: number; layout: string } | null>(null)
  const [picking, setPicking] = useState(false)
  const show = (id: string) => (setPicking(false), setOpening(null), setOpenId(id))

  const store = g.stores.find((s) => s.id === openId)
  const onSale = g.products.filter((p) => p.companyId === 'player' && p.status === 'sale')
  const drawer = opening && <OpenStoresDrawer key={`${opening.tier}:${opening.layout}`} tier={opening.tier} layout={opening.layout} onClose={() => setOpening(null)} onOpened={(ids) => (ids.length === 1 ? show(ids[0]) : setOpening(null))} />
  const fitOut = (st: Store) => {
    const q = fitOutQuote(useStore.getState().game!, st.id)
    const err = act((s) => fitOutStore(s, st.id))
    if (err) return say(err, 'bad')
    sfx.zone()
    say(`${st.name} has the standard fit-out now, for ${money(q.cost)}.`, 'ok')
  }

  const picker = g.stores.length > 0 && (
    <div className="flex h-9 shrink-0 items-center border-b border-line bg-panel px-3">
      <Pick label="Store" value={store ? store.id : 'list'} options={[{ value: 'list', label: `All stores (${g.stores.length})` }, ...g.stores.map((s) => ({ value: s.id, label: storeLabel(s) }))]} onChange={show} />
    </div>
  )

  if (store) {
    const st = storeStats(store.site)
    const m = storeMonth(g, store.id)
    const tier = tierOf(store.site)
    const advice = storeAdvice(g, store)
    const fit = fitOutQuote(g, store.id)
    // the one or two things that would turn it round, most valuable first
    const todo = [...(fit.better ? [{ id: 'fitout', text: `Refit to the standard fit-out: about ${money(fit.after)} a month instead of ${money(fit.before)} with the shelves stocked.` }] : []), ...advice].slice(0, 2)
    const rest = advice.filter((a) => !todo.includes(a))
    return (
      <div className="flex h-full min-h-0 flex-col">
        {picker}
        {drawer}
        {picking && <LayoutPicker key={store.id} store={store} onClose={() => setPicking(false)} />}
        <div className="min-h-0 flex-1">
          <SiteBuilder key={store.id} siteRef={`store:${store.id}`} site={store.site} products={onSale} busy={st.capacity ? store.lastVisitors / st.capacity : 0} status={storeStatus(g, store)}>
           <Detail>
            {(st.problem || (st.open && !onSale.length)) && (
              <Sec>
                {st.problem && <Note tone="warn">{st.problem}</Note>}
                {st.open && !onSale.length && <Note tone="warn">You have nothing on sale to put on the tables.</Note>}
              </Sec>
            )}
            {todo.length > 0 && (
              <Sec title={m.profit < 0 ? 'To make it pay' : 'What would help most'}>
                {todo.map((a, i) => (
                  <div key={a.id} className="mb-1 flex items-start gap-2">
                    <span className={`num mt-[1px] shrink-0 text-[11px] ${m.profit < 0 ? 'text-warn' : 'text-accent'}`}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Note tone={m.profit < 0 ? 'warn' : undefined}>{a.text}</Note>
                      {a.id === 'fitout' && (
                        <ConfirmBtn small tone="primary" icon="layers" className="mt-1" confirm={`Clear the floor and refit for ${money(fit.cost)}?`} disabled={!canAfford(g, fit.cost)} title={`Builds the standard fit-out for ${money(fit.build)}; the furniture there now sells for ${money(fit.resale)}`} onClick={() => fitOut(store)}>
                          Fit out: {money(fit.cost)}
                        </ConfirmBtn>
                      )}
                    </div>
                  </div>
                ))}
              </Sec>
            )}
            <Sec title={m.partial ? 'This month, projected' : 'Last month'}>
              <Fact k="Units sold" v={num(m.units)} num />
              <Fact k="Revenue" v={money(m.revenue)} num />
              <Fact k="Devices sold, cost to build" v={money(-m.cogs)} num />
              <Fact k="Rent, upkeep and wages" v={money(-m.costs)} num />
              <Fact k="Profit" v={money(m.profit)} num tone={signTone(m.profit)} title={PROFIT_NOTE} />
            </Sec>
            {rest.length > 0 && (
              <Sec title="Also worth a look">
                {rest.map((a) => (
                  <div key={a.id} className="mb-1">
                    <Note>{a.text}</Note>
                  </div>
                ))}
              </Sec>
            )}
            <Sec title="Visitors">
              <Fact k="Passers-by a day" v={int(tier.traffic ?? 0)} num />
              <Fact k="Can serve a day" v={int(st.capacity)} num title="What the display tables and demo pods can serve, with a little more for each stock rack" />
              <Fact k="Visitors a day" v={num(visitorsADay(store, m))} num />
              <BarRow label="Appeal" share={st.appeal} tone={st.appeal > 0.5 ? 'accent' : 'warn'} title="Appeal keeps people who reach the door and turns more of them into buyers. Add plants, a logo wall and benches, give the building its own cladding, and leave the floor uncrowded." />
              <div className="mt-1">
                <Note>{visitorsNote(tier.traffic ?? 0, st.capacity, st.open)}</Note>
              </div>
            </Sec>
            <Sec title="Store">
              <Fact k="Site" v={`${tier.name}, ${store.site.w} x ${store.site.h} m`} />
              <div className="mt-1 flex flex-col gap-1">
                <Btn small icon="layers" disabled={g.stores.length < 2} title={g.stores.length < 2 ? 'There is no other store to copy from yet' : 'Rebuild this store to the layout of another one'} onClick={() => setPicking(true)}>
                  Copy a layout from another store
                </Btn>
                <Btn small icon="plus" title="Choose regions for new stores fitted out exactly like this one" onClick={() => setOpening({ tier: store.site.tier, layout: store.id })}>
                  Open another like this
                </Btn>
                <ConfirmBtn small icon="lock" confirm="Close it for good?" title="Closes the store and gives up the plot. Everything built there is lost." onClick={() => (act((s) => closeStore(s, store.id)), show('list'), say(`${store.name} is closed.`, 'ok'))}>
                  Close this store
                </ConfirmBtn>
              </div>
            </Sec>
           </Detail>
          </SiteBuilder>
        </div>
      </div>
    )
  }

  const bare = g.stores.map((st) => ({ st, q: fitOutQuote(g, st.id) })).filter((x) => x.q.better)
  const bareCost = bare.reduce((a, x) => a + x.q.cost, 0)
  const rows: StoreRow[] = g.stores.map((s) => {
    const fit = bare.find((x) => x.st === s)
    const first = storeAdvice(g, s)[0]
    return { store: s, stats: storeStats(s.site), m: storeMonth(g, s.id), fix: fit ? { label: 'Fit it out', text: `Refit to the standard fit-out: about ${money(fit.q.after)} a month with the shelves stocked.` } : first ? { label: FIX_LABEL[first.id], text: first.text } : null }
  })
  const empty = g.stores.length > 0 && onSale.length > 0 && onSale.every((p) => p.stock <= 0)
  const all = storesMonth(g)
  const storeCols: Column<StoreRow>[] = [
    {
      id: 'name',
      head: 'Store',
      sort: (r) => r.store.name,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate text-fg">{r.store.name}</span>
          {!r.stats.open && <Tag tone="neg">Not trading</Tag>}
        </span>
      ),
    },
    { id: 'region', head: 'Region', min: 150, drop: 2, sort: (r) => regionInfo(r.store.region).name, cell: (r) => <span className="text-dim">{regionInfo(r.store.region).name}</span> },
    { id: 'profit', head: 'Profit', title: `${monthNote(all.partial)} ${PROFIT_NOTE}`, num: true, sort: (r) => r.m.profit, cell: (r) => <Signed v={r.m.profit} /> },
    { id: 'revenue', head: 'Revenue', title: monthNote(all.partial), num: true, sort: (r) => r.m.revenue, cell: (r) => money(r.m.revenue) },
    { id: 'visitors', head: 'Visitors a day', title: 'How many of the passers-by come in', num: true, min: 116, drop: 1, sort: (r) => visitorsADay(r.store, r.m), cell: (r) => <span className="text-dim">{num(visitorsADay(r.store, r.m))}</span> },
    { id: 'units', head: 'Units', title: `Devices sold. ${monthNote(all.partial)}`, num: true, min: 72, drop: 3, sort: (r) => r.m.units, cell: (r) => <span className="text-dim">{num(r.m.units)}</span> },
    { id: 'fix', head: 'Do first', title: 'The one thing that would help this store most. Open the store for the details.', min: 120, sort: (r) => r.fix?.label ?? '', cell: (r) => (r.fix ? <span className={r.m.profit < 0 ? 'text-warn' : 'text-dim'} title={r.fix.text}>{r.fix.label}</span> : <span className="text-faint">Nothing</span>) },
  ]

  const offers: Offer[] = SITE_TIERS.store.map((t, tier) => {
    const price = storeOpenCost(g, tier) ?? t.cost
    const top = storeOutlook(g, tier)[0]
    const blocked = !canAfford(g, price) ? `Not enough cash: ${money(price)} is needed` : undefined
    return { tier, name: t.name, blurb: t.blurb, plot: `${t.w} x ${t.h} m`, passers: t.traffic ?? 0, rent: t.rent, price, blocked, profit: top?.profit ?? 0, best: top?.region }
  })
  const offerCols: Column<Offer>[] = [
    { id: 'site', head: 'Site', cell: (o) => <span className="text-fg">{o.name}</span> },
    { id: 'plot', head: 'Plot', num: true, drop: 3, cell: (o) => <span className="text-dim">{o.plot}</span> },
    { id: 'passers', head: 'Passers-by a day', title: 'The foot traffic of the site. How many come in depends on the region and the store: see the question mark.', num: true, min: 128, drop: 2, cell: (o) => int(o.passers) },
    { id: 'rent', head: 'Rent a month', num: true, min: 104, drop: 1, cell: (o) => <span className="text-dim">{money(o.rent)}</span> },
    { id: 'price', head: 'Price', title: 'The plot with the standard fit-out: a sales floor, display tables, a checkout, accessory walls and plants', num: true, cell: (o) => money(o.price) },
    { id: 'profit', head: 'Profit a month', title: 'What one such store would make in a month in the best region for it, at today\'s prices and devices, with the shelves stocked', num: true, min: 116, cell: (o) => (o.best ? <span title={`In ${regionInfo(o.best).name}`}><Signed v={o.profit} /></span> : <span className="text-faint">--</span>) },
  ]
  const fitAll = () => {
    for (const { st } of bare) {
      const err = act((s) => fitOutStore(s, st.id))
      if (err) return say(err, 'bad')
    }
    sfx.zone()
    say(`${bare.length} stores have the standard fit-out now, for ${money(bareCost)}.`, 'ok')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {picker}
      {drawer}
      <Page keep="stores">
        {empty && (
          <div className="flex flex-wrap items-center gap-3 border border-neg/60 bg-panel px-3 py-2">
            <Icon name="warehouse" size={14} className="shrink-0 text-neg" />
            <span className="min-w-0 flex-1 text-xs leading-snug text-fg">Nothing you sell is in stock, so every store is paying rent and wages and selling nothing. Order a production run, and set a reorder point so the shelves do not empty again. Your stores are served before retailers once stock arrives.</span>
            <Btn small tone="primary" icon="package" onClick={() => go({ tab: 'products' })}>
              Order stock
            </Btn>
          </div>
        )}
        {bare.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border border-warn/60 bg-panel px-3 py-2">
            <Icon name="layers" size={14} className="shrink-0 text-warn" />
            <span className="min-w-0 flex-1 text-xs leading-snug text-fg">
              {bare.length === 1 ? `${bare[0].st.name} is` : `${bare.length} stores are`} fitted out more thinly than the standard fit-out: too few tables to serve the people walking in, and too little to make them stay. Refitting {bare.length === 1 ? 'it' : 'them'} adds about <span className="num text-pos">{money(bare.reduce((a, x) => a + x.q.after - x.q.before, 0))}</span> a month.
            </span>
            <ConfirmBtn small tone="primary" icon="layers" confirm={`Refit ${bare.length === 1 ? 'it' : `all ${bare.length}`} for ${money(bareCost)}?`} disabled={!canAfford(g, bareCost)} title="Clears each store's floor, sells its furniture for half price and builds the standard fit-out" onClick={fitAll}>
              {bare.length === 1 ? 'Fit it out' : `Fit out all ${bare.length}`}: {money(bareCost)}
            </ConfirmBtn>
          </div>
        )}
        {g.stores.length > 1 && (
          <Strip
            items={[
              { label: `${profitLabel(all.partial)}, all stores`, value: money(all.profit), tone: signTone(all.profit), title: `${monthNote(all.partial)} ${PROFIT_NOTE}` },
              { label: 'Revenue', value: money(all.revenue) },
              { label: 'Units', value: num(all.units) },
            ]}
          />
        )}
        {g.stores.length > 0 && (
          <Panel title="Your stores" icon="stores" count={g.stores.length} right={<span className="text-[11px] text-faint">{all.partial ? 'This month, projected' : 'Last month'}</span>}>
            <Table label="Your stores" cols={storeCols} rows={rows} rowKey={(r) => r.store.id} onRow={(r) => show(r.store.id)} sort={{ col: 'profit', dir: 'desc' }} keep="stores" rowTitle={(r) => (r.stats.open ? undefined : r.stats.problem)} />
          </Panel>
        )}
        <Panel
          title="Open a store"
          icon="pin"
          right={
            <>
              <Btn small tone="primary" icon="plus" title="Open one or many stores: pick the regions, the site, the layout and how many" onClick={() => setOpening({ tier: Math.max(0, offers.findIndex((o) => !o.blocked && o.profit > 0)), layout: '' })}>
                Open stores
              </Btn>
              <Help title="Passers-by and visitors">{VISITORS_HELP}</Help>
            </>
          }
        >
          {g.stores.length === 0 && (
            <div className="border-b border-line px-3 py-2 text-xs leading-relaxed text-dim">
              Your own stores sell at full price, with no retailer taking {pct(RETAIL_CUT, 0)}, and every visitor learns your name. Each one is yours to lay out: the rooms, the tables, the cladding.
            </div>
          )}
          <Table
            label="Sites on offer"
            cols={offerCols}
            rows={offers}
            rowKey={(o) => o.name}
            rowTitle={(o) => o.blurb}
            actionAlways={() => true}
            actionWidth={128}
            action={(o) => (
              <Btn small icon="plus" className="w-full" disabled={!!o.blocked} title={o.blocked ?? `Choose the regions and how many ${o.name.toLowerCase()}s to open`} onClick={() => setOpening({ tier: o.tier, layout: '' })}>
                Open...
              </Btn>
            )}
          />
        </Panel>
      </Page>
    </div>
  )
}
