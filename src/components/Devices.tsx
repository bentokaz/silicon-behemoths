// The Devices destination: Mine (the company's own devices, with what each
// needs), Market (one device type, who wins its buyers) and Rivals (the
// companies). Details of one device open in the drawer (Inspector.tsx).
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TYPES, segmentInfo, segmentsOf } from '../data/devices'
import { companyOf, monthLabel, renameCompany, trailingUnits, valuation } from '../sim/game'
import { type Why, productProfit, productTrend, reorderQuote, suggestReorder, whyLines } from '../sim/insight'
import { segmentDemand } from '../sim/market'
import { rivalValue } from '../sim/stock'
import { type Company, DEVICE_TYPES, type DeviceType, type GameState, type Product } from '../sim/types'
import { priceIndex } from '../sim/world'
import { keepView, keptView, viewKept } from '../store/focus'
import { useGame, useStore } from '../store/game'
import { families, inDays, lastMonth, makesText, marketView, onOrder, orderFamilies, score, shareSeries, statusNote } from './DeviceLogic'
import { InlinePrice, PriceNote, quoteWords, reorder, reorderMany, useDrawerInset } from './DeviceParts'
import { Thumb } from './Inspector'
import { Orders } from './Orders'
import type { SortState } from './tablesort'
import { Btn, type Column, ConfirmBtn, Empty, Filters, Fold, IconBtn, Legend, NameInput, Page, Panel, Pick, Spark, Swatch, Table, type TableGroup, Tag, chart, money, moneyDelta, num, pct, price } from './ui'

/** The game object is changed in place as days pass: this number is what moves, and what anything remembered must be keyed on. */
const useRev = () => useStore((s) => s.rev)

const ownDevices = (g: GameState) => g.products.filter((p) => p.companyId === 'player').sort((a, b) => b.launchDay - a.launchDay)

/** Where the page stops for the drawer: the page's own frame, padded on the right by however far the drawer reaches over it. */
function DevicePage({ children, keep }: { children: ReactNode; keep: string }) {
  const box = useRef<HTMLDivElement>(null)
  const inset = useDrawerInset(box)
  return (
    <div ref={box} className="h-full min-h-0" style={{ paddingRight: inset }}>
      <Page keep={keep}>{children}</Page>
    </div>
  )
}

// ------------------------------------------------------------------ the company's own devices

interface Facts {
  why: Why[]
  /** Units worth ordering now, 0 when none are needed. */
  reorder: number
  trend: number[]
  profit: number
  order: ReturnType<typeof onOrder>
}

function factsOf(g: GameState, rows: readonly Product[]): Map<string, Facts> {
  return new Map(rows.map((p) => [p.id, { why: whyLines(g, p), reorder: suggestReorder(g, p), trend: productTrend(g, p), profit: productProfit(g, p).month, order: onOrder(g, p.id) }]))
}

/** Whether the trend is itself the news: sold out, or last month well under the three before it. */
function trendTone(p: Product, trend: number[]): 'dim' | 'warn' | 'neg' {
  if (p.status === 'sale' && p.stock <= 0) return 'neg'
  if (trend.length < 3) return 'dim'
  const before = trend.slice(-4, -1)
  const usual = before.reduce((a, b) => a + b, 0) / before.length
  return usual > 0 && trend[trend.length - 1] < usual * 0.6 ? 'warn' : 'dim'
}

const TONE = { neg: 'text-neg', warn: 'text-warn', pos: 'text-pos', dim: 'text-dim' } as const

/**
 * The columns of the company's own devices: name with its thumbnail and the
 * one line that says why it sells as it does, price (changed in place), stock
 * with what is on order, twelve months of sales, last month's profit, review.
 * And the row's own action: Reorder, for a device that needs more made.
 */
function useOwnTable(g: GameState, rows: readonly Product[], compact: boolean) {
  const rev = useRev()
  const facts = useMemo(() => factsOf(g, rows), [g, rows, rev])
  const [typing, setTyping] = useState<{ id: string; value: number } | null>(null)
  const f = (p: Product) => facts.get(p.id)!
  const cols: Column<Product>[] = [
    {
      id: 'device',
      head: 'Device',
      sort: (p) => p.name,
      cell: (p) => {
        const { why } = f(p)
        const top = why[0]
        const line = top && top.tone !== 'dim' ? top : undefined
        const status = statusNote(p)
        // the line under the name already says "Sold out" or "recall": the mark would say it twice
        const mark = status && !(line && (line.kind === 'soldout' || line.kind === 'recall') && p.status === 'sale') ? status : null
        const edit = typing?.id === p.id ? typing.value : null
        return (
          <span className="flex min-w-0 items-center gap-2">
            <Thumb product={p} className="h-7 w-7 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2 leading-tight">
                <span className={`max-w-full shrink-0 truncate ${p.status === 'ended' ? 'text-dim' : 'font-semibold text-fg'}`}>{p.name}</span>
                {mark && (
                  <span className="min-w-0 overflow-hidden" title={mark.text}>
                    <Tag tone={mark.tone}>{mark.text}</Tag>
                  </span>
                )}
              </span>
              {edit !== null ? (
                <PriceNote g={g} p={p} value={edit} className="truncate" />
              ) : (
                line && (
                  <span title={why.map((w) => w.text).join(' ')} className={`block truncate text-[11px] leading-tight ${TONE[line.tone]}`}>
                    {line.text}
                  </span>
                )
              )}
            </span>
          </span>
        )
      },
    },
    ...(compact
      ? []
      : [
          {
            id: 'price',
            head: 'Price',
            num: true,
            min: 84,
            sort: (p: Product) => p.price,
            cell: (p: Product) => (p.status === 'ended' ? <span className="text-dim">{price(p.price)}</span> : <InlinePrice p={p} onTyping={(v) => setTyping(v === null ? null : { id: p.id, value: v })} />),
          },
        ]),
    {
      id: 'stock',
      head: 'Stock',
      title: 'Units in the warehouse, and what is on order',
      min: 116,
      num: true,
      sort: (p) => (p.status === 'ended' ? null : p.stock),
      first: 'asc',
      cell: (p) => {
        const { order } = f(p)
        if (p.status === 'ended') return <span className="text-dim">{p.stock > 0 ? num(p.stock) : '--'}</span>
        return (
          <span className="flex flex-col items-end leading-tight">
            <span className={p.stock <= 0 && p.status === 'sale' ? 'text-neg' : 'text-fg'}>{num(p.stock)}</span>
            {order && (
              <span className={`font-sans text-[11px] ${order.days === null ? 'text-warn' : 'text-dim'}`} title={order.days === null ? 'On order from your factory, but the line is stopped' : 'On order: when the last unit arrives'}>
                <span className="num">+{num(order.units)}</span> {order.days === null ? 'line stopped' : inDays(order.days)}
              </span>
            )}
          </span>
        )
      },
    },
    {
      id: 'trend',
      head: '12 months',
      title: 'Units sold a month over the last twelve months. Sorts by last month.',
      min: 92,
      drop: compact ? 1 : 2,
      className: 'text-right',
      sort: (p) => f(p).trend.at(-1) ?? null,
      first: 'desc',
      cell: (p) => {
        const { trend } = f(p)
        return <Spark values={trend} tone={trendTone(p, trend)} title={trend.length ? `${num(trend[trend.length - 1])} sold last month` : 'No full month on sale yet'} />
      },
    },
    {
      id: 'profit',
      head: 'Profit / mo',
      title: 'Last full month: what its sales brought in, less what those units cost to build. An estimate.',
      num: true,
      min: 96,
      drop: 1,
      sort: (p) => (p.unitsSold > 0 ? f(p).profit : null),
      cell: (p) => {
        const v = f(p).profit
        return p.unitsSold > 0 && f(p).trend.length ? <span className={v > 0 ? 'text-pos' : v < 0 ? 'text-neg' : 'text-dim'}>{moneyDelta(v)}</span> : <span className="text-dim">--</span>
      },
    },
    ...(compact ? [] : [{ id: 'review', head: 'Review', title: 'Average press score out of 10', num: true, min: 72, drop: 3, sort: (p: Product) => p.reviewAvg || null, cell: (p: Product) => <span className="text-dim">{score(p.reviewAvg)}</span> }]),
  ]
  const action = (p: Product) => {
    const n = f(p).reorder
    if (n <= 0) return null
    return (
      <Btn small icon="package" title={quoteWords(g, p, n)} onClick={() => reorder(p, n)}>
        Reorder {num(n)}
      </Btn>
    )
  }
  /** Rows whose Reorder is what they need: sold out, or nearly, with something worth ordering. */
  const needs = (p: Product) => f(p).reorder > 0 && (p.stock <= 0 || f(p).why.some((w) => w.kind === 'soldout'))
  /** Everything worth ordering now, for the one button that orders it all. */
  const wanted = rows.filter(needs).map((p) => ({ p, units: f(p).reorder }))
  return { cols, action, needs, facts, wanted }
}

/** The guide's "Read the reviews" step points at the player's rows: they carry its name. */
function useCoachRows(deps: unknown) {
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    box.current?.querySelectorAll('tr[data-row]').forEach((tr) => tr.setAttribute('data-coach-target', 'device'))
  }, [deps])
  return box
}

const NoDevices = () => (
  <Empty icon="devices" text="No devices yet. Design one: shape it, choose what goes inside, set a price and order a first run.">
    <Btn icon="plus" onClick={() => useStore.getState().openDesigner()}>
      New device
    </Btn>
  </Empty>
)

/**
 * The company's devices as rows, for another screen (the Overview): the ones
 * that need something first, then by last month's profit. `compact` leaves
 * out price and review; `limit` shows that many and a way to the rest.
 */
export function MyDevices({ compact = false, limit }: { compact?: boolean; limit?: number }) {
  const g = useGame()
  const inspect = useStore((s) => s.inspect)
  const { focus, go } = useStore.getState()
  const rev = useRev()
  const all = useMemo(() => ownDevices(g).filter((p) => p.status !== 'ended'), [g, rev])
  const { cols, action, needs, facts } = useOwnTable(g, all, compact)
  const box = useCoachRows(all.length)
  if (!all.length) return <NoDevices />
  const ordered = [...all].sort((a, b) => Number(needs(b)) - Number(needs(a)) || (facts.get(b.id)?.profit ?? 0) - (facts.get(a.id)?.profit ?? 0))
  const rows = limit ? ordered.slice(0, limit) : ordered
  return (
    <div ref={box}>
      <Table label="Your devices" cols={cols} rows={rows} rowKey={(p) => p.id} onRow={(p) => focus(p.id)} selected={inspect} action={action} actionAlways={needs} actionWidth={120} firstMin={compact ? 170 : 200} keep={`devices:${compact ? 'brief' : 'list'}`} />
      {rows.length < all.length && (
        <div className="border-t border-line px-1 py-1">
          <Btn small tone="ghost" icon="arrowRight" onClick={() => go({ tab: 'products' })}>
            All {all.length} devices
          </Btn>
        </div>
      )}
    </div>
  )
}

const MINE_SORT = 'devices:mine'

export function Products() {
  const g = useGame()
  const inspect = useStore((s) => s.inspect)
  const { focus } = useStore.getState()
  const [show, setShow] = useState<'current' | 'all'>('current')
  const [type, setType] = useState<'any' | DeviceType>('any')
  const rev = useRev()
  const all = useMemo(() => ownDevices(g), [g, rev])
  const current = all.filter((p) => p.status !== 'ended')
  const types = DEVICE_TYPES.filter((t) => all.some((p) => p.type === t))
  const rows = useMemo(() => (show === 'all' ? all : all.filter((p) => p.status !== 'ended')).filter((p) => type === 'any' || p.type === type), [all, show, type])
  const { cols, action, needs, wanted } = useOwnTable(g, rows, false)
  const wantedCost = wanted.reduce((a, w) => a + reorderQuote(g, w.p, w.units).cost, 0)
  const box = useCoachRows(`${rows.length}:${show}:${type}`)

  // Families of two or more models are groups; the table orders the rows inside each, and the groups follow the
  // same column. The table keeps its own sort, so it is read back after a heading is pressed.
  const [, bump] = useState(0)
  const sort = viewKept(`sort:${MINE_SORT}`) ? keptView<SortState | null>(`sort:${MINE_SORT}`) : null
  const fam = useMemo(() => families(rows, (p) => p.family), [rows])
  const by = sort ? cols.find((c) => c.id === sort.col)?.sort : undefined
  const groups: TableGroup<Product>[] | undefined = fam.grouped
    ? orderFamilies(fam.groups, by, sort?.dir ?? 'asc').map((f) => ({
        key: f.key,
        label: f.label ?? 'Other devices',
        right: f.label ? `${f.rows.length} models` : undefined,
        rows: f.rows,
      }))
    : undefined

  if (!all.length)
    return (
      <DevicePage keep="products">
        <Panel className="flex-1">
          <NoDevices />
        </Panel>
      </DevicePage>
    )
  const ended = all.length - current.length
  return (
    <DevicePage keep="products">
      <Panel
        title="Your devices"
        count={rows.length}
        className="shrink-0"
        right={
          (ended > 0 || types.length > 1 || wanted.length > 1) && (
            <>
              {wanted.length > 1 && (
                <ConfirmBtn small tone="default" icon="package" confirm={`Click again: about ${money(wantedCost)}`} title={`Order what each of the ${wanted.length} devices that are sold out or nearly so needs: about ${money(wantedCost)} in all, paid as the units arrive`} onClick={() => reorderMany(wanted)}>
                  Reorder all {wanted.length}
                </ConfirmBtn>
              )}
              {types.length > 1 && <Pick label="Type" value={type} onChange={setType} options={[{ value: 'any' as const, label: 'Every type' }, ...types.map((t) => ({ value: t, label: TYPES[t].plural }))]} />}
              {ended > 0 && (
                <Filters
                  label="Which devices"
                  value={show}
                  onChange={setShow}
                  options={[
                    { value: 'current', label: 'Current', count: current.length },
                    { value: 'all', label: 'With ended', count: all.length },
                  ]}
                />
              )}
            </>
          )
        }
      >
        <div ref={box} onClickCapture={(e) => (e.target as HTMLElement).closest('th') && window.setTimeout(() => bump((n) => n + 1), 0)}>
          <Table
            label="Your devices"
            cols={cols}
            rows={groups ? undefined : rows}
            groups={groups}
            rowKey={(p) => p.id}
            onRow={(p) => focus(p.id)}
            selected={inspect}
            action={action}
            actionAlways={needs}
            actionWidth={120}
            firstMin={220}
            keep={MINE_SORT}
            empty="No devices of this type."
          />
        </div>
      </Panel>
      {g.orders.length > 0 && (
        <Fold
          keep="devices:orders"
          icon="truck"
          title={
            <>
              On order <span className="num ml-1 text-[11px] font-normal text-faint">{g.orders.length}</span>
            </>
          }
        >
          <Orders />
        </Fold>
      )}
    </DevicePage>
  )
}

// ------------------------------------------------------------------ market

/** Market share by units: the player against the five biggest rivals and everyone else. */
function ShareLines({ g }: { g: GameState }) {
  const months = g.shareHistory.length
  const s = useMemo(() => shareSeries(g.shareHistory, g.companies, monthLabel), [g, months]) // eslint-disable-line react-hooks/exhaustive-deps
  if (s.data.length < 2) return <Empty icon="pie" text="Market share appears after the first two months." />
  const colour = (l: (typeof s.lines)[number]) => l.color ?? 'var(--color-accent)'
  // (everyone else is one figure in the legend: as a line it would sit far above the rest and flatten them)
  const drawn = s.lines.filter((l) => l.id !== 'others')
  const mine = (id: string) => companyOf(g, id)?.isPlayer
  return (
    <div className="flex h-full min-h-0 flex-col gap-1 p-2">
      <Legend items={s.lines.map((l) => ({ label: `${l.name} ${pct(l.last / 100)}`, ...(l.id === 'others' ? { tone: 'dim' as const } : l.color ? { color: l.color } : { tone: 'accent' as const }) }))} />
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={s.data} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis dataKey="month" tick={chart.axis} stroke={chart.grid} minTickGap={36} />
            <YAxis tick={chart.axis} stroke={chart.grid} unit="%" />
            <Tooltip {...chart.tooltip} formatter={(v, id) => [pct(Number(v) / 100), s.lines.find((l) => l.id === id)?.name ?? String(id)]} />
            {[...drawn].reverse().map((l) => (
              <Line key={l.id} dataKey={l.id} stroke={colour(l)} strokeWidth={mine(l.id) ? 2.5 : 1.25} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function Market() {
  const g = useGame()
  const inspect = useStore((s) => s.inspect)
  const { focus } = useStore.getState()
  const rev = useRev()
  const counts = useMemo(() => new Map(DEVICE_TYPES.map((t) => [t, g.products.filter((p) => p.status === 'sale' && p.type === t).length])), [g, rev])
  const [type, setTypeKept] = useState<DeviceType>(() => (viewKept('market:type') ? keptView<DeviceType>('market:type') : (g.products.find((p) => p.companyId === 'player' && p.status !== 'ended')?.type ?? g.types?.[0] ?? 'phone')))
  const [seg, setSegKept] = useState<string>(() => (viewKept('market:seg') ? keptView<string>('market:seg') : 'all'))
  const setType = (t: DeviceType) => (keepView('market:type', t), keepView('market:seg', 'all'), setTypeKept(t), setSegKept('all'))
  const setSeg = (s: string) => (keepView('market:seg', s), setSegKept(s))
  const segs = segmentsOf(type)
  const info = segs.find((s) => s.id === seg)
  const view = useMemo(() => marketView(g, type, info?.id), [g, rev, type, info?.id])
  const n = view.ranked.length
  const index = priceIndex(g.day)

  const cols: Column<Product>[] = [
    {
      id: 'device',
      head: 'Device',
      sort: (p) => p.name,
      cell: (p) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="num w-5 shrink-0 text-right text-[11px] text-faint">{view.rank.get(p.id)}</span>
          <Thumb product={p} className="h-7 w-7 shrink-0" />
          <span className={`truncate ${p.companyId === 'player' ? 'font-semibold text-fg' : 'text-fg'}`}>{p.name}</span>
          {p.companyId === 'player' && (
            <Tag tone={p.stock <= 0 ? 'neg' : 'accent'}>
              #{view.rank.get(p.id)} of {n}
            </Tag>
          )}
        </span>
      ),
    },
    { id: 'maker', head: 'Maker', min: 128, drop: 2, sort: (p) => companyOf(g, p.companyId).name, cell: (p) => <Swatch color={companyOf(g, p.companyId).color} className="text-dim">{companyOf(g, p.companyId).name}</Swatch> },
    ...(info ? [] : [{ id: 'segment', head: 'Segment', min: 132, drop: 3, sort: (p: Product) => (p.segment ? segmentInfo(p.segment).name : null), cell: (p: Product) => <span className="text-dim">{p.segment ? segmentInfo(p.segment).name : '--'}</span> }]),
    { id: 'price', head: 'Price', num: true, min: 80, sort: (p) => p.price, cell: (p) => <span className="text-fg">{price(p.price)}</span> },
    { id: 'units', head: 'Last month', title: 'Units sold last month', num: true, min: 96, sort: (p) => lastMonth(p), cell: (p) => <span className={info ? 'text-dim' : 'text-fg'}>{num(lastMonth(p))}</span> },
    { id: 'review', head: 'Review', title: 'Average press score out of 10', num: true, min: 72, drop: 4, sort: (p) => p.reviewAvg || null, cell: (p) => <span className="text-dim">{score(p.reviewAvg)}</span> },
    ...(info ? [{ id: 'win', head: 'Wins', title: `Of ten ${info.name.toLowerCase()} buyers choosing today, the share that picks this device`, num: true, min: 72, sort: (p: Product) => view.win?.get(p.id) ?? 0, cell: (p: Product) => <span className="text-fg">{pct(view.win?.get(p.id) ?? 0)}</span> }] : []),
  ]
  const typeOptions = DEVICE_TYPES.filter((t) => t === type || (counts.get(t) ?? 0) > 0).map((t) => ({ value: t, label: `${TYPES[t].plural} (${counts.get(t) ?? 0})` }))
  const tile = (on: boolean) => `min-w-0 border px-3 py-2 text-left ${on ? 'border-accent bg-accent/10' : 'border-line bg-panel hover:border-line2 hover:bg-hover'}`
  return (
    <DevicePage keep="market">
      <div className="grid shrink-0 gap-2" style={{ gridTemplateColumns: `repeat(${segs.length + 1}, minmax(0, 1fr))` }}>
        <button type="button" aria-pressed={!info} onClick={() => setSeg('all')} className={tile(!info)} title="Every segment: all the buyers of this kind of device in a year">
          <div className="truncate text-xs font-semibold text-fg">Every segment</div>
          <div className="truncate text-[11px] text-dim">
            <span className="num">{num(segs.reduce((a, s) => a + segmentDemand(s, g.day) * 360, 0))}</span> buyers a year
          </div>
        </button>
        {segs.map((s) => (
          <button type="button" key={s.id} aria-pressed={seg === s.id} onClick={() => setSeg(s.id)} className={tile(seg === s.id)} title={`${s.name}: ${num(segmentDemand(s, g.day) * 360)} buyers a year, who expect to pay about ${price(s.priceRef * index)}`}>
            <div className="truncate text-xs font-semibold text-fg">{s.name}</div>
            <div className="truncate text-[11px] text-dim">
              <span className="num">{num(segmentDemand(s, g.day) * 360)}</span> at <span className="num">{money(s.priceRef * index)}</span>
            </div>
          </button>
        ))}
      </div>
      <Panel
        title={info ? `Who wins ${info.name.toLowerCase()} buyers today` : `On sale, by last month's sales`}
        count={n}
        className="min-h-[220px] flex-1"
        bodyClass="overflow-y-auto"
        keep={`market:${type}`}
        right={<Pick label="Type" value={type} onChange={setType} options={typeOptions} />}
      >
        <Table
          label={`${TYPES[type].plural} on sale`}
          cols={cols}
          groups={[
            { key: 'mine', label: null, rows: view.mine },
            { key: 'rest', label: null, rows: view.rest },
          ]}
          rowKey={(p) => p.id}
          onRow={(p) => focus(p.id)}
          selected={inspect}
          firstMin={230}
          keep={`market:${info ? 'seg' : 'all'}`}
          empty={`No ${TYPES[type].plural.toLowerCase()} are on sale.`}
        />
      </Panel>
      <Fold title="Market share by units: you and the five biggest" icon="pie" keep="market:share" open={typeof window === 'undefined' || window.innerHeight >= 760} bodyClass="h-44">
        <ShareLines g={g} />
      </Fold>
    </DevicePage>
  )
}

// ------------------------------------------------------------------ rivals

interface CompanyRow {
  c: Company
  units: number
  share: number
  rank: number
  value: number
  makes: { short: string; full: string }
}

/** How many of a company's devices are listed before "Show all". */
const FEW = 8

function CompanyDevices({ g, company, onClose }: { g: GameState; company: Company; onClose: () => void }) {
  const inspect = useStore((s) => s.inspect)
  const { act, focus } = useStore.getState()
  const rev = useRev()
  const [all, setAll] = useState(false)
  const [naming, setNaming] = useState(false)
  useEffect(() => (setAll(false), setNaming(false)), [company.id])
  const onSale = useMemo(() => g.products.filter((p) => p.companyId === company.id && p.status === 'sale').sort((a, b) => lastMonth(b) - lastMonth(a)), [g, rev, company.id])
  const rows = all ? onSale : onSale.slice(0, FEW)
  // (no stock here: what a rival holds is not known, and the simulation gives rivals stock without end)
  const cols: Column<Product>[] = [
    {
      id: 'device',
      head: 'Device',
      sort: (p) => p.name,
      cell: (p) => (
        <span className="flex min-w-0 items-center gap-2">
          <Thumb product={p} className="h-7 w-7 shrink-0" />
          <span className="truncate text-fg">{p.name}</span>
        </span>
      ),
    },
    { id: 'price', head: 'Price', num: true, min: 76, sort: (p) => p.price, cell: (p) => <span className="text-fg">{price(p.price)}</span> },
    { id: 'units', head: 'Last month', title: 'Units sold last month', num: true, min: 92, sort: (p) => lastMonth(p), cell: (p) => <span className="text-dim">{num(lastMonth(p))}</span> },
    { id: 'review', head: 'Review', title: 'Average press score out of 10', num: true, min: 68, drop: 1, sort: (p) => p.reviewAvg || null, cell: (p) => <span className="text-dim">{score(p.reviewAvg)}</span> },
  ]
  return (
    <Panel
      selected
      className="shrink-0 self-start"
      title={naming ? <NameInput autoFocus aria-label={`Rename ${company.name}`} value={company.name} maxLength={18} onChange={(v) => {
            const err = act((s) => renameCompany(s, company.id, v))
            if (err) useStore.getState().say(err, 'bad')
          }} onBlur={() => setNaming(false)} className="h-6 w-40" /> : <Swatch color={company.color}>{company.name}</Swatch>}
      count={naming ? undefined : `${onSale.length} on sale`}
      right={
        <>
          {!company.isPlayer && !naming && <IconBtn small icon="edit" tone="ghost" title="Rename this company" onClick={() => setNaming(true)} />}
          <IconBtn small icon="close" tone="ghost" title="Close this company's devices" onClick={onClose} />
        </>
      }
    >
      <div className="border-b border-line px-3 py-2 text-[11px] leading-snug text-dim">
        {company.alive ? '' : 'Bankrupt. '}
        <span className="num text-fg">{pct(company.awareness, 0)}</span> of buyers know it. It has taken <span className="num text-fg">{money(company.revenueTotal)}</span> in all{company.software ? ', and its software ' : '.'}
        {company.software ? (
          <>
            {company.software > 0 ? 'adds ' : 'costs it '}
            <span className="num text-fg">{pct(Math.abs(company.software))}</span> appeal.
          </>
        ) : null}
      </div>
      <Table label={`${company.name}: devices on sale`} cols={cols} rows={rows} rowKey={(p) => p.id} onRow={(p) => focus(p.id)} selected={inspect} firstMin={160} keep="rivals:devices" empty="This company has nothing on sale." />
      {onSale.length > FEW && (
        <div className="px-1 py-1">
          <Btn small tone="ghost" icon={all ? 'chevronUp' : 'chevronDown'} onClick={() => setAll(!all)}>
            {all ? `Show the top ${FEW}` : `Show all ${onSale.length}`}
          </Btn>
        </div>
      )}
    </Panel>
  )
}

export function Rivals() {
  const g = useGame()
  const rev = useRev()
  const [companyId, setCompanyState] = useState<string | null>(() => (viewKept('rivals:company') ? keptView<string | null>('rivals:company') : null))
  const setCompany = (id: string | null) => (keepView('rivals:company', id), setCompanyState(id))
  // a company asked for while this page is already open (the drawer's link to a device's maker)
  useEffect(() => {
    const on = () => setCompanyState(keptView<string | null>('rivals:company') ?? null)
    window.addEventListener('sb:rivals-company', on)
    return () => window.removeEventListener('sb:rivals-company', on)
  }, [])
  const rows = useMemo(() => {
    const trailing = trailingUnits(g)
    const total = trailing.reduce((a, t) => a + t.units, 0) || 1
    const order = [...trailing].sort((a, b) => b.units - a.units)
    return order.map(({ company: c, units }, i): CompanyRow => {
      const types = c.isPlayer ? DEVICE_TYPES.filter((t) => g.products.some((p) => p.companyId === c.id && p.type === t && p.status !== 'ended')) : [...new Set(c.segments.map((s) => segmentInfo(s).type))]
      return { c, units, share: units / total, rank: i + 1, value: c.isPlayer ? valuation(g) : c.alive ? (c.value ?? rivalValue(c)) : 0, makes: makesText(types) }
    })
  }, [g, rev])
  const company = companyId ? g.companies.find((c) => c.id === companyId) : undefined
  const cols: Column<CompanyRow>[] = [
    {
      id: 'company',
      head: 'Company',
      sort: (r) => r.c.name,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="num w-5 shrink-0 text-right text-[11px] text-faint">{r.rank}</span>
          <Swatch color={r.c.color} className={r.c.alive ? (r.c.isPlayer ? 'font-semibold text-fg' : 'text-fg') : 'text-dim'}>
            {r.c.name}
          </Swatch>
          {r.c.isPlayer && (
            <Tag tone="accent">
              You, #{r.rank} of {rows.length}
            </Tag>
          )}
          {!r.c.alive && <Tag>{r.c.acquired ? 'Bought' : 'Bankrupt'}</Tag>}
        </span>
      ),
    },
    { id: 'value', head: 'Value', title: 'What the company is worth', num: true, min: 84, drop: 2, sort: (r) => r.value, cell: (r) => <span className="text-dim">{r.value > 0 ? money(r.value) : '--'}</span> },
    { id: 'units', head: 'Last month', title: 'Units sold last month, every device', num: true, min: 96, sort: (r) => r.c.unitsYear.at(-1) ?? 0, cell: (r) => <span className="text-dim">{num(r.c.unitsYear.at(-1) ?? 0)}</span> },
    { id: 'share', head: 'Share', title: 'Share of all units sold over the last twelve months', num: true, min: 72, sort: (r) => r.share, cell: (r) => <span className="text-fg">{pct(r.share)}</span> },
    { id: 'makes', head: 'Makes', min: 168, drop: 3, sort: (r) => r.makes.full, cell: (r) => <span className="text-dim" title={r.makes.full}>{r.makes.short}</span> },
    { id: 'trend', head: '12 months', title: 'Units sold a month over the last twelve months', min: 92, drop: 4, className: 'text-right', cell: (r) => <Spark values={r.c.unitsYear} title={`${r.c.name}: units a month, last twelve months`} /> },
  ]
  const me = rows.filter((r) => r.c.isPlayer)
  const others = rows.filter((r) => !r.c.isPlayer)
  return (
    <DevicePage keep="rivals">
      <div className="@container min-h-0">
        <div className={`grid items-start gap-2 ${company ? 'grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @max-[860px]:grid-cols-1' : 'grid-cols-1'}`}>
          <Panel title="Companies" count={rows.length} className={company ? '@max-[860px]:order-2' : ''}>
            <Table
              label="Companies"
              cols={cols}
              groups={[
                { key: 'me', label: null, rows: me },
                { key: 'others', label: null, rows: others },
              ]}
              rowKey={(r) => r.c.id}
              onRow={(r) => setCompany(r.c.id === companyId ? null : r.c.id)}
              selected={companyId}
              firstMin={200}
              keep="rivals:companies"
              rowTitle={(r) => (r.c.id === companyId ? undefined : `Show what ${r.c.isPlayer ? 'you have' : `${r.c.name} has`} on sale`)}
            />
          </Panel>
          {company && <CompanyDevices g={g} company={company} onClose={() => setCompany(null)} />}
        </div>
      </div>
    </DevicePage>
  )
}
