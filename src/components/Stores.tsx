// Sites, Stores: what each store earns, the sites on offer for the next one,
// and one store at a time in 3D. One picker chooses between all stores (the
// table) and a single store; the city sends the player to a store through
// `aim('store', id)`.
import { useEffect, useState } from 'react'
import { sfx } from '../audio/sfx'
import { RETAIL_CUT, canAfford, closeStore, copyLayout, layoutQuote, layoutValue, newLayoutQuote, openStore } from '../sim/game'
import { type StoreMonth, storeMonth, storesMonth } from '../sim/insight'
import { homeRegion, openRegions, regionInfo } from '../sim/regions'
import { SITE_TIERS, type StoreStats, storeStats, tierOf } from '../sim/sites'
import type { Store } from '../sim/types'
import { takeAim } from '../store/focus'
import { useGame, useStore } from '../store/game'
import { SiteBuilder } from './SiteBuilder'
import { PROFIT_NOTE, VISITORS_HELP, copyCost, monthNote, profitLabel, signTone, storeLabel, storeStatus, visitorsADay, visitorsNote } from './SitesFigures'
import { BarRow, Detail, Fact, Note, Sec } from './SitesParts'
import { Icon } from './icons'
import { Btn, type Column, ConfirmBtn, Drawer, Help, Page, Panel, Pick, Strip, Table, Tag, int, money, num, pct, useKept } from './ui'

const TONE = { pos: 'text-pos', neg: 'text-neg' } as const
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
}

export function StoresScreen() {
  const g = useGame()
  const { act, say } = useStore.getState()
  // 'list' is the table of every store; anything else is the id of the store that is open
  const [openId, setOpenId] = useKept<string>('stores:open', 'list')
  // a store picked in the city view opens straight away
  useEffect(() => {
    const aimed = takeAim('store')
    if (aimed) setOpenId(aimed)
  }, [setOpenId])
  const [region, setRegion] = useKept<string>('stores:region', () => homeRegion(g))
  /** Store whose layout the next one opened is fitted out with; empty for the standard fit-out. */
  const [layout, setLayout] = useKept<string>('stores:layout', '')
  const [picking, setPicking] = useState(false)
  const show = (id: string) => (setPicking(false), setOpenId(id))

  const regions = openRegions(g)
  const where = regions.some((r) => r.id === region) ? region : homeRegion(g)
  const store = g.stores.find((s) => s.id === openId)
  const model = g.stores.find((s) => s.id === layout)
  const onSale = g.products.filter((p) => p.companyId === 'player' && p.status === 'sale')

  const open = (o: Offer) => {
    const err = act((s) => openStore(s, o.tier, where, model?.id))
    if (err) return say(err, 'bad')
    sfx.confirm()
    setLayout('')
    show(useStore.getState().game!.stores.at(-1)!.id)
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
    return (
      <div className="flex h-full min-h-0 flex-col">
        {picker}
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
            <Sec title={m.partial ? 'This month, projected' : 'Last month'}>
              <Fact k="Units sold" v={num(m.units)} num />
              <Fact k="Revenue" v={money(m.revenue)} num />
              <Fact k="Rent, upkeep and wages" v={money(-m.costs)} num />
              <Fact k="Profit" v={money(m.profit)} num tone={signTone(m.profit)} title={PROFIT_NOTE} />
            </Sec>
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
                <Btn small icon="plus" title="Choose a site for a new store fitted out exactly like this one" onClick={() => (setLayout(store.id), show('list'))}>
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

  const rows: StoreRow[] = g.stores.map((s) => ({ store: s, stats: storeStats(s.site), m: storeMonth(g, s.id) }))
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
  ]

  const offers: Offer[] = SITE_TIERS.store.map((t, tier) => {
    const fit = model ? newLayoutQuote(g, model.id, tier) : null
    const price = t.cost + (fit && !fit.error ? fit.cost : 0)
    const blocked = fit?.error ? `No room: the layout of ${model!.name} needs ${fit.needs[0]} x ${fit.needs[1]} m` : !canAfford(g, price) ? `Not enough cash: ${money(price)} is needed` : undefined
    return { tier, name: t.name, blurb: t.blurb, plot: `${t.w} x ${t.h} m`, passers: t.traffic ?? 0, rent: t.rent, price, blocked }
  })
  const offerCols: Column<Offer>[] = [
    { id: 'site', head: 'Site', cell: (o) => <span className="text-fg">{o.name}</span> },
    // (with one region open there is nothing to tell apart)
    ...(regions.length > 1 ? [{ id: 'region', head: 'Region', min: 150, drop: 2, cell: () => <span className="text-dim">{regionInfo(where).name}</span> } satisfies Column<Offer>] : []),
    { id: 'plot', head: 'Plot', num: true, drop: 3, cell: (o) => <span className="text-dim">{o.plot}</span> },
    { id: 'passers', head: 'Passers-by a day', title: 'The foot traffic of the site. How many come in depends on the region and the store: see the question mark.', num: true, min: 128, cell: (o) => int(o.passers) },
    { id: 'rent', head: 'Rent a month', num: true, min: 104, drop: 1, cell: (o) => <span className="text-dim">{money(o.rent)}</span> },
    { id: 'price', head: 'Price', title: model ? `The plot, and the fit-out as a copy of ${model.name}` : 'The plot with a standard fit-out: a sales floor, a display table and a checkout', num: true, cell: (o) => money(o.price) },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      {picker}
      <Page keep="stores">
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
              {regions.length > 1 && <Pick label="Region" value={where} options={regions.map((r) => ({ value: r.id, label: r.name }))} onChange={setRegion} />}
              {g.stores.length > 0 && <Pick label="Fit-out" value={model ? model.id : ''} options={[{ value: '', label: 'Standard' }, ...g.stores.map((s) => ({ value: s.id, label: `Copy of ${s.name}` }))]} onChange={setLayout} />}
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
              <ConfirmBtn small tone="default" icon="plus" className="w-full" confirm={`Pay ${money(o.price)}?`} disabled={!!o.blocked} title={o.blocked ?? `Open a ${o.name.toLowerCase()} in ${regionInfo(where).name} for ${money(o.price)}`} onClick={() => open(o)}>
                Open
              </ConfirmBtn>
            )}
          />
        </Panel>
      </Page>
    </div>
  )
}
