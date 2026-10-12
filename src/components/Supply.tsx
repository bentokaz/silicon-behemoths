// Component supply: what the parts every device is made of cost today, which
// are in short supply, and fixing a price for a year. It affects every device,
// so it lives with the company's money (Company, Finance), not at the factory.
import { sfx } from '../audio/sfx'
import { SUPPLY_LABELS } from '../data/catalog'
import { fmtDate, lockSupply } from '../sim/game'
import { LOCK_DAYS, LOCK_FEE } from '../sim/ops'
import { useGame, useStore } from '../store/game'
import { type SupplyRow, supplyRows } from './CompanyFigures'
import { lockProps } from './Progress'
import { Icon, supplyIcon } from './icons'
import { type Column, ConfirmBtn, Help, Spark, Table, money, pct } from './ui'

/** The price range the small bar spans: three quarters of normal to not quite double. */
const LOW = 0.75
const HIGH = 1.8
const at = (v: number) => `${Math.max(0, Math.min(1, (v - LOW) / (HIGH - LOW))) * 100}%`

/** A price against normal, as a bar with a mark where normal is. One quiet colour: the figure beside it carries the tone. */
function PriceBar({ value }: { value: number }) {
  return (
    <span aria-hidden className="relative inline-block h-1 w-16 shrink-0 bg-line align-middle">
      <span className="absolute inset-y-0 left-0 bg-mute" style={{ width: at(value) }} />
      <span className="absolute -inset-y-[3px] w-px bg-fg" style={{ left: at(1) }} />
    </span>
  )
}

const toneOf = (v: number) => (v > 1.15 ? 'text-neg' : v > 1.05 ? 'text-warn' : 'text-fg')

/** What the fold on Finance says in its "?". */
export function SupplyHelp() {
  return (
    <Help title="How component supply works">
      Every device is built from these five kinds of part, so their prices move the unit cost of everything you make. Prices drift, and now and then a shortage pushes one kind up for months. The bar shows today's price against normal; the mark is normal. Fixing a price holds today's price for {LOCK_DAYS} days whatever the market does, for a fee of {money(LOCK_FEE)}. It is worth doing while a price is normal, not after it has risen.
    </Help>
  )
}

/** One row for each kind of part: its price against normal, whether it is short or fixed, and fixing it. */
export function Supply() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const rows = supplyRows(g)
  const lock = lockProps(g, 'factory')
  const poor = g.cash < LOCK_FEE && !g.config.unlimitedMoney
  const fix = (r: SupplyRow) => {
    const err = act((s) => lockSupply(s, r.cat))
    if (err) say(err, 'bad')
    else (sfx.confirm(), say(`${SUPPLY_LABELS[r.cat]}: price fixed until ${fmtDate(g.day + LOCK_DAYS)}.`))
  }
  const cols: Column<SupplyRow>[] = [
    {
      id: 'cat',
      head: 'Parts',
      sort: (r) => SUPPLY_LABELS[r.cat],
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <Icon name={supplyIcon(r.cat)} size={13} className="shrink-0 text-dim" />
          <span className="truncate text-fg">{SUPPLY_LABELS[r.cat]}</span>
        </span>
      ),
    },
    {
      id: 'price',
      head: 'Price',
      title: "Today's market price as a share of the normal price",
      num: true,
      min: 150,
      sort: (r) => r.price,
      cell: (r) => (
        <span className="inline-flex items-center justify-end gap-2" title={`${pct(r.price, 0)} of the normal price`}>
          <PriceBar value={r.price} />
          <span className={`inline-block w-10 ${toneOf(r.price)}`}>{pct(r.price, 0)}</span>
        </span>
      ),
    },
    { id: 'trend', head: '12 months', min: 96, drop: 2, cell: (r) => <Spark values={r.trend} tone={r.shortDays > 0 ? 'warn' : 'dim'} title={`${SUPPLY_LABELS[r.cat]}: price over the last twelve months`} /> },
    {
      id: 'state',
      head: 'State',
      min: 220,
      sort: (r) => (r.fixedUntil !== null ? 1 : r.shortDays > 0 ? 2 : 0),
      first: 'desc',
      // said only when it is not the ordinary state
      cell: (r) =>
        r.fixedUntil !== null ? (
          <span className="text-dim" title={`You pay ${pct(r.paying, 0)} of the normal price whatever the market does.`}>
            Price fixed until {fmtDate(r.fixedUntil)}
          </span>
        ) : r.shortDays > 0 ? (
          <span className="text-warn">
            Shortage, {r.shortDays} {r.shortDays === 1 ? 'day' : 'days'} left
          </span>
        ) : null,
    },
  ]
  return (
    <Table
      label="Component supply"
      cols={cols}
      rows={rows}
      rowKey={(r) => r.cat}
      firstMin={170}
      actionWidth={132}
      action={(r) =>
        r.fixedUntil !== null ? null : (
          <ConfirmBtn small tone="default" icon="lock" {...lock} disabled={poor} confirm={`Pay ${money(LOCK_FEE)}?`} title={poor ? `Fixing a price costs ${money(LOCK_FEE)}, which is more than there is in the bank.` : `Hold today's price for ${LOCK_DAYS} days. The fee is ${money(LOCK_FEE)}.`} onClick={() => fix(r)}>
            Fix the price
          </ConfirmBtn>
        )
      }
    />
  )
}
