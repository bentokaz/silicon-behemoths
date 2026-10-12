// On order: every production run still being made, by a contract maker or the
// company's own factory. It belongs with the devices (Devices, Mine and the
// product drawer); it can also stand alone anywhere a list of runs is wanted.
import { cancelOrder } from '../sim/game'
import { CONTRACT, factoryLine, orderLeft } from '../sim/ops'
import type { ProductionOrder } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { inDays, orderDays } from './DeviceLogic'
import { Thumb } from './Inspector'
import { type Column, ConfirmIconBtn, Empty, Table, Tag, num, pct } from './ui'

/**
 * The runs on order. `filter` narrows them: a device's id, or a test of each
 * order. With `bare` there is no Device column (the list is already about one device).
 */
export function Orders({ filter, bare = false }: { filter?: string | ((o: ProductionOrder) => boolean); bare?: boolean }) {
  const g = useGame()
  const { act, focus, say } = useStore.getState()
  const line = factoryLine(g)
  const rows = g.orders.filter((o) => g.products.some((p) => p.id === o.productId) && (filter === undefined || (typeof filter === 'string' ? o.productId === filter : filter(o))))
  if (!rows.length) return <Empty icon="package" text="Nothing is on order. Under Devices, Mine, press Reorder on a device's row, or open the device and order any number." />
  const product = (o: ProductionOrder) => g.products.find((p) => p.id === o.productId)!
  const device: Column<ProductionOrder> = {
    id: 'device',
    head: 'Device',
    sort: (o) => product(o).name,
    cell: (o) => (
      <span className="flex min-w-0 items-center gap-2">
        <Thumb product={product(o)} className="h-6 w-6 shrink-0" />
        <span className="truncate text-fg">{product(o).name}</span>
      </span>
    ),
  }
  const [units, maker, when]: Column<ProductionOrder>[] = [
    {
      id: 'units',
      head: 'Units',
      title: 'Units still to come, of the units ordered',
      num: true,
      min: 116,
      sort: (o) => orderLeft(o),
      cell: (o) => (
        <span title={`${num(o.done)} of ${num(o.quantity)} built`}>
          <span className="text-fg">{num(orderLeft(o))}</span>
          <span className="text-dim"> of {num(o.quantity)}</span>
        </span>
      ),
    },
    { id: 'maker', head: 'Made by', min: 124, drop: 1, sort: (o) => o.mode, cell: (o) => <span className="text-dim">{o.mode === 'contract' ? 'Contract maker' : 'Own factory'}</span> },
    {
      id: 'when',
      head: 'Progress',
      title: 'How much is built, and when the last unit arrives',
      min: 208,
      sort: (o) => orderDays(g, o) ?? Infinity,
      first: 'asc',
      cell: (o) => {
        const days = orderDays(g, o)
        if (days === null) return <Tag tone="neg" icon="alert">Line stopped</Tag>
        const wait = o.mode === 'contract' ? Math.max(0, CONTRACT.leadDays - (g.day - o.placedDay)) : 0
        return (
          <span className="text-dim">
            {o.done > 0 ? <span className="num text-fg">{pct(o.done / o.quantity, 0)} built</span> : wait > 0 ? `Starts ${inDays(wait)}` : o.mode === 'factory' ? 'Waiting its turn' : 'Starting'}
            {`, all here ${inDays(days)}`}
          </span>
        )
      },
    },
  ]
  // about one device, in the narrow drawer: when it lands comes first and takes the room
  const cols = bare ? [when, units, maker] : [device, units, maker, when]
  return (
    <Table
      label="On order"
      cols={cols}
      rows={rows}
      rowKey={(o) => o.id}
      onRow={bare ? undefined : (o) => focus(o.productId)}
      firstMin={bare ? 190 : 150}
      actionWidth={40}
      actionAlways={() => true}
      rowTitle={(o) => (o.mode === 'factory' && !line?.running ? 'The factory line is stopped: this order cannot move until it runs' : undefined)}
      action={(o) => <ConfirmIconBtn small icon="close" title={`Cancel the ${num(orderLeft(o))} units of ${product(o).name} not yet built`} onClick={() => (act((s) => cancelOrder(s, o.id)), say(`The rest of the ${product(o).name} run is cancelled. Units already built stay in stock.`))} />}
    />
  )
}
