// The regions, as the city shows them: each is an island with a plate on it
// (see City.tsx), and what there is to read or decide about one opens here, in
// the drawer. The same six rows as a table are one click further.
import { sfx } from '../audio/sfx'
import { enterRegion, fmtDate, setRegionPrice } from '../sim/game'
import { REGIONS, type RegionDef, entryBlocked, homeOf, homeRegion, regionOverheads } from '../sim/regions'
import type { GameState } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { lockProps } from './Progress'
import { Icon } from './icons'
import { Btn, type Column, ConfirmBtn, Drawer, Head, Meter, Row, Slider, Swatch, Table, int, money, num, pct } from './ui'

/** Which region the drawer shows: one of them, or all six as a table. */
export type RegionView = string | 'all' | null

const stateOf = (g: GameState, r: RegionDef) => (homeRegion(g) === r.id ? 'Home' : g.regions[r.id]?.open ? 'Selling' : 'Not entered')
const storesIn = (g: GameState, id: string) => g.stores.filter((s) => s.region === id).length
/** What it costs each month to be in a region: nothing at home, nothing where the company is not. */
const overheadOf = (g: GameState, r: RegionDef) => (homeRegion(g) !== r.id && g.regions[r.id]?.open ? r.overhead : 0)

/** One region: how the company stands there and what it can do about it. */
function RegionBody({ r }: { r: RegionDef }) {
  const g = useGame()
  const { act, say, go } = useStore.getState()
  const st = g.regions[r.id]
  const home = homeRegion(g) === r.id
  const blocked = entryBlocked(g, r.id)
  const based = g.companies.filter((c) => !c.isPlayer && c.alive && homeOf(c) === r.id)
  const months = st.history.slice(-24)
  const peak = Math.max(1, ...months)
  return (
    <div className="space-y-4 p-3">
      <div>
        <div className="text-xs text-fg">{home ? 'Your home market.' : st.open ? `You have sold here since ${fmtDate(st.since)}.` : 'You do not sell here yet.'}</div>
        <div className="mt-1 text-xs leading-relaxed text-dim">{r.blurb}</div>
      </div>

      {st.open ? (
        <>
          <div>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-dim">Awareness here</span>
              <span className="num text-fg">{pct(st.awareness, 0)}</span>
            </div>
            <Meter value={st.awareness} tone="accent" />
          </div>
          <div>
            <Row k="Sold this month" v={num(st.monthUnits)} tone="text-fg" />
            <Row k="Your stores" v={int(storesIn(g, r.id))} />
            <Row k="Running cost a month" v={home ? 'None at home' : money(r.overhead)} />
            <Row k="Duties and shipping" v={home ? 'None at home' : pct(r.tariff, 0)} />
          </div>
          {months.length > 1 && (
            <div>
              <Head className="mb-1">Units a month</Head>
              <div className="flex h-12 items-end gap-[2px] border-b border-line" role="img" aria-label={`Units sold a month, last ${months.length} months, most ${num(peak)}`}>
                {months.map((u, i) => (
                  <span key={i} className="flex-1 bg-accent" style={{ height: `${Math.max(2, (u / peak) * 100)}%` }} />
                ))}
              </div>
            </div>
          )}
          <Slider
            label="Local price"
            value={st.priceAdj}
            min={0.7}
            max={1.4}
            step={0.01}
            format={(v) => (Math.round((v - 1) * 100) === 0 ? 'List price' : `${v > 1 ? '+' : '-'}${pct(Math.abs(v - 1), 0)} on list`)}
            onChange={(v) => act((s) => setRegionPrice(s, r.id, v))}
            hint={r.wealth < 0.9 ? 'Buyers here watch the price: a lower local price can sell far more.' : r.wealth > 1.05 ? 'Buyers here will pay more for the same device.' : undefined}
          />
          <div className="flex gap-2">
            <Btn icon="marketing" className="flex-1" onClick={() => go({ tab: 'marketing' })} {...lockProps(g, 'marketing')}>
              Advertise here
            </Btn>
            <Btn icon="stores" className="flex-1" onClick={() => go({ tab: 'stores' })} {...lockProps(g, 'stores')}>
              Stores
            </Btn>
          </div>
        </>
      ) : (
        <>
          <div>
            <Row k="Share of world demand" v={pct(r.share, 0)} tone="text-fg" />
            <Row k="Buyers lean" v={r.wealth > 1.05 ? 'Premium' : r.wealth < 0.9 ? 'Budget' : 'Balanced'} />
            <Row k="Duties and shipping" v={pct(r.tariff, 0)} />
            <Row k="Running cost a month" v={money(r.overhead)} />
          </div>
          <div className="text-xs leading-relaxed text-dim">Setting up means a local distributor, certification and a small office. You start with a little of the name you have made elsewhere, and build from there.</div>
          {blocked ? (
            <div className="flex items-start gap-2 border border-dashed border-line2 px-2 py-[7px] text-xs text-dim">
              <Icon name="lock" size={12} className="mt-[2px] shrink-0" />
              <span>{blocked}</span>
            </div>
          ) : (
            <ConfirmBtn
              tone="primary"
              large
              icon="pin"
              className="w-full"
              confirm={`Click again to spend ${money(r.entry)}`}
              {...lockProps(g, 'world')}
              onClick={() => {
                const err = act((s) => enterRegion(s, r.id))
                if (err) say(err, 'bad')
                else (sfx.launch(), say(`You now sell in ${r.name}.`))
              }}
            >
              Enter for {money(r.entry)}
            </ConfirmBtn>
          )}
        </>
      )}

      <div>
        <Head className="mb-1">Rivals based here</Head>
        {based.length === 0 && <div className="text-xs text-dim">No major rival calls this region home.</div>}
        {based.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-[3px] text-xs">
            <Swatch color={c.color} className="text-fg">
              {c.name}
            </Swatch>
            <span className="text-dim">
              Brand <span className="num text-fg">{int(c.brand * 100)}</span>
            </span>
          </div>
        ))}
        {based.length > 0 && <div className="mt-1 text-[11px] leading-snug text-faint">Rivals are strongest at home and patchier abroad.</div>}
      </div>
    </div>
  )
}

/** The six regions as one table. A row opens that region. */
function RegionsTable({ onPick }: { onPick: (id: string) => void }) {
  const g = useGame()
  const cols: Column<RegionDef>[] = [
    { id: 'name', head: 'Region', cell: (r) => r.name, sort: (r) => r.name },
    { id: 'state', head: 'State', min: 100, cell: (r) => <span className={g.regions[r.id]?.open ? 'text-fg' : 'text-dim'}>{stateOf(g, r)}</span>, sort: (r) => stateOf(g, r) },
    { id: 'aware', head: 'Awareness', num: true, min: 108, cell: (r) => (g.regions[r.id]?.open ? pct(g.regions[r.id].awareness, 0) : ''), sort: (r) => (g.regions[r.id]?.open ? g.regions[r.id].awareness : -1) },
    { id: 'stores', head: 'Stores', num: true, min: 76, cell: (r) => (g.regions[r.id]?.open ? int(storesIn(g, r.id)) : ''), sort: (r) => storesIn(g, r.id) },
    { id: 'sold', head: 'Sold', title: 'Units sold last month', num: true, min: 72, cell: (r) => (g.regions[r.id]?.open ? num(g.regions[r.id].history.at(-1) ?? 0) : ''), sort: (r) => g.regions[r.id]?.history.at(-1) ?? -1 },
    { id: 'cost', head: 'Overheads', title: 'What being there costs each month', num: true, min: 112, cell: (r) => (overheadOf(g, r) ? money(overheadOf(g, r)) : ''), sort: (r) => overheadOf(g, r) },
  ]
  return (
    <div className="p-3">
      <Table cols={cols} rows={REGIONS} rowKey={(r) => r.id} onRow={(r) => onPick(r.id)} firstMin={132} keep="regions:table" label="All regions" />
      <div className="mt-2 text-xs text-dim">
        Overseas running costs come to <span className="num text-fg">{money(regionOverheads(g))}</span> a month.
      </div>
    </div>
  )
}

/**
 * The regions' drawer: one region, or all six as a table. Opened from an
 * island or its plate in the city; "All regions" and a row of the table go
 * between the two.
 */
export function RegionDrawer({ view, onView }: { view: RegionView; onView: (view: RegionView) => void }) {
  const region = REGIONS.find((r) => r.id === view)
  return (
    <Drawer
      open={view !== null}
      onClose={() => onView(null)}
      title={region ? region.name : 'All regions'}
      width={region ? 380 : 640}
      footer={
        region ? (
          <Btn tone="ghost" icon="world" onClick={() => onView('all')}>
            All regions
          </Btn>
        ) : undefined
      }
    >
      {region ? <RegionBody key={region.id} r={region} /> : <RegionsTable onPick={onView} />}
    </Drawer>
  )
}
