// Company, Finance: four figures for the last full month, where the costs
// went, income against costs over time, and behind a fold each the monthly
// statement and the supply of components.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { monthLabel } from '../sim/game'
import { type GameState, monthCosts } from '../sim/types'
import { useGame } from '../store/game'
import { type CostGroupId, type LedgerRow, costGroups, ledger, monthFigures, shortages } from './CompanyFigures'
import { Supply, SupplyHelp } from './Supply'
import { type Column, Empty, Fold, Legend, Page, Panel, Stat, Table, Tag, chart, money, moneyDelta, num, pct } from './ui'

/** Income against costs, month by month. Cash is a level, not a flow, and is not drawn here: it has its own line in the Cash tile on Overview. */
export function FinanceChart({ g, months = 24 }: { g: GameState; months?: number }) {
  const data = g.reports.slice(-months).map((r) => ({ month: monthLabel(r.month), Income: Math.round(r.revenue + r.other), Costs: Math.round(monthCosts(r)) }))
  if (data.length < 2) return <Empty icon="chart" text="Income and costs are drawn here once two months have closed." />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={chart.grid} vertical={false} />
        <XAxis dataKey="month" tick={chart.axis} stroke={chart.grid} minTickGap={30} />
        <YAxis tick={chart.axis} stroke={chart.grid} tickFormatter={(v) => money(Number(v))} width={56} />
        <Tooltip {...chart.tooltip} formatter={(v) => money(Number(v))} />
        <Line dataKey="Income" stroke="var(--color-accent)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
        <Line dataKey="Costs" stroke="var(--color-dim)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** The five groups of cost keep one colour each wherever they are drawn. None of them is a signal colour: a cost is not good or bad by its kind. */
const GROUP_COLOR: Record<CostGroupId, string> = { people: '#5a9bd4', production: '#c9a25a', marketing: '#9c6ade', research: '#5fb8c9', other: 'var(--color-mute)' }

function CostBar({ g }: { g: GameState }) {
  const f = monthFigures(g)
  const groups = costGroups(g.reports[g.reports.length - 1] ?? g.cur)
  if (f.costs <= 0) return <div className="px-3 py-4 text-xs text-dim">Nothing has been spent yet.</div>
  return (
    <div className="px-3 py-3">
      <div role="img" aria-label={`Costs by group: ${groups.map((c) => `${c.label} ${pct(c.share, 0)}`).join(', ')}`} className="flex h-3 w-full gap-px">
        {groups.map((c) => c.amount > 0 && <span key={c.id} title={`${c.label}: ${money(c.amount)}, ${pct(c.share, 0)} of costs`} style={{ width: `${c.share * 100}%`, background: GROUP_COLOR[c.id] }} />)}
      </div>
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-2">
        {groups.map((c) => (
          <div key={c.id} title={c.holds} className="min-w-0">
            <Legend items={[{ label: c.label, color: GROUP_COLOR[c.id] }]} className="[&>span]:whitespace-normal" />
            <div className="num mt-[2px] pl-[13px] text-xs text-fg">
              {money(c.amount)} <span className="text-dim">{pct(c.share, 0)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Finance() {
  const g = useGame()
  const f = monthFigures(g)
  const of = f.partial ? 'this month so far' : monthLabel(f.month)
  // each figure against the same figure of the month before
  const change = (now: number, was: number | undefined) => (was === undefined ? (f.partial ? 'no month has closed yet' : 'the first full month') : `${moneyDelta(now - was)} against ${monthLabel(f.month - 1)}`)
  const rows = ledger(g)
  const cost = (id: CostGroupId, head: string, title: string, drop: number): Column<LedgerRow> => ({ id, head, title, num: true, drop, sort: (r) => r[id], className: 'text-dim', cell: (r) => money(r[id]) })
  const cols: Column<LedgerRow>[] = [
    { id: 'month', head: 'Month', sort: (r) => r.month, first: 'desc', cell: (r) => <span className="num text-fg">{monthLabel(r.month)}</span> },
    { id: 'units', head: 'Units', title: 'Devices sold in the month', num: true, drop: 9, sort: (r) => r.units, className: 'text-dim', cell: (r) => num(r.units) },
    { id: 'income', head: 'Income', title: 'Device sales, licensing, services and care plans', num: true, sort: (r) => r.income, className: 'text-fg', cell: (r) => money(r.income) },
    cost('people', 'People', 'Salaries', 4),
    cost('production', 'Production', 'Building devices', 5),
    cost('marketing', 'Marketing', 'Campaigns, events and keynotes', 6),
    cost('research', 'Research', 'Research budget and device development', 7),
    cost('other', 'Other', 'Overheads, buildings and interest', 8),
    { id: 'costs', head: 'Costs', title: 'Everything spent in the month', num: true, sort: (r) => r.costs, className: 'text-fg', cell: (r) => money(r.costs) },
    { id: 'profit', head: 'Profit', num: true, sort: (r) => r.profit, cell: (r) => <span className={r.profit >= 0 ? 'text-pos' : 'text-neg'}>{money(r.profit)}</span> },
    { id: 'cash', head: 'Cash', title: 'Cash in the bank when the month closed', num: true, sort: (r) => r.cash, className: 'text-fg', cell: (r) => money(r.cash) },
  ]
  const short = shortages(g).length
  return (
    <Page keep="finance">
      <div className="grid shrink-0 grid-cols-4 gap-3">
        <Stat label={`Income, ${of}`} icon="coins" value={money(f.income)} sub={change(f.income, f.before?.income)} />
        <Stat label={`Costs, ${of}`} icon="receipt" value={money(f.costs)} sub={change(f.costs, f.before?.costs)} />
        <Stat info="Income from sales and anything else that came in, less every cost of the month: salaries, production, marketing, research, buildings, overheads and interest." label={`Profit, ${of}`} icon={f.profit >= 0 ? 'trendUp' : 'trendDown'} value={money(f.profit)} tone={f.profit >= 0 ? 'pos' : 'neg'} sub={change(f.profit, f.before?.profit)} />
        <Stat label={f.partial ? 'Cash today' : `Cash, end of ${monthLabel(f.month)}`} icon="cash" value={g.config.unlimitedMoney ? 'Unlimited' : money(f.cash)} tone={f.cash < 0 && !g.config.unlimitedMoney ? 'neg' : undefined} sub={g.config.unlimitedMoney ? 'money is not counted in this game' : change(f.cash, f.before?.cash)} />
      </div>

      <Panel title={`Where the costs went, ${of}`} icon="pie" className="shrink-0">
        <CostBar g={g} />
      </Panel>

      {g.reports.length >= 2 && (
        <Panel title="Income against costs" icon="chart" className="shrink-0" right={<Legend items={[{ label: 'Income', tone: 'accent' }, { label: 'Costs', color: 'var(--color-dim)' }]} className="pr-1" />}>
          <div className="h-44">
            <FinanceChart g={g} months={36} />
          </div>
        </Panel>
      )}

      <Fold title="Monthly detail" icon="doc" open={false} keep="finance:detail">
        <Table label="Monthly statement" cols={cols} rows={rows} rowKey={(r) => String(r.month)} firstMin={76} keep="finance:ledger" empty="The first statement closes at the end of the month." />
      </Fold>

      {/* opens by itself while a shortage is costing money, and closes again when it is over; in between it is the player's to open */}
      <Fold
        key={short ? 'short' : 'calm'}
        title="Component supply"
        icon="package"
        open={short > 0}
        right={
          <span className="flex items-center gap-2">
            {short > 0 && <Tag tone="warn">{short === 1 ? '1 shortage' : `${short} shortages`}</Tag>}
            <SupplyHelp />
          </span>
        }
      >
        <Supply />
      </Fold>
    </Page>
  )
}
