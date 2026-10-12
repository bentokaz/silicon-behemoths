// Production orders: every run being made, by a contract maker or the company's own factory.
// Split out of Operations.tsx for the interface redesign: orders belong with the devices now.
import { useState } from 'react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, YAxis } from 'recharts'
import { sfx } from '../audio/sfx'
import { SUPPLY_LABELS } from '../data/catalog'
import { TYPES } from '../data/devices'
import { autoLine, buildFactory, cancelOrder, fmtDate, lockSupply, roomCost, zoneable } from '../sim/game'
import { CONTRACT, FACTORY_SAVING, LOCK_DAYS, LOCK_FEE, buildCost, factoryLine, marketPrice, orderLeft } from '../sim/ops'
import { ITEMS, SITE_TIERS, starterLine, tierOf, upkeep } from '../sim/sites'
import { SUPPLY_CATS } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { SiteBuilder } from './SiteBuilder'
import { Icon, type IconName, supplyIcon, typeIcon } from './icons'
import { Btn, ConfirmBtn, ConfirmIconBtn, Empty, Fold, Kpi, Lead, Meter, Mini, Panel, Tabs, Tag, Th, money, num, pct, pressable, useKept } from './ui'

export function Orders() {
  const g = useGame()
  const { act, focus, say } = useStore.getState()
  const line = factoryLine(g)
  if (!g.orders.length) return <Empty icon="package" text="No production runs are in progress. Open a device and order a run from its Manage tab, or set one up when you launch." />
  return (
    <table className="grid-table">
      <thead>
        <tr>
          <Th icon="devices">Device</Th>
          <Th icon="truck">Route</Th>
          <Th icon="gauge" className="w-64">
            Progress
          </Th>
          <Th icon="package" r>
            Built
          </Th>
          <Th icon="tag" r>
            Cost each
          </Th>
          <Th icon="cash" r>
            Left to pay
          </Th>
          <Th icon="info">Status</Th>
          <th />
        </tr>
      </thead>
      <tbody>
        {g.orders.map((o) => {
          const p = g.products.find((x) => x.id === o.productId)
          if (!p) return null
          const each = buildCost(g, p, o.mode)
          const waiting = o.mode === 'contract' ? Math.max(0, CONTRACT.leadDays - (g.day - o.placedDay)) : 0
          const stalled = o.mode === 'factory' && !line?.running
          return (
            <tr key={o.id} className="row cursor-pointer" {...pressable(() => focus(p.id))}>
              <td className="text-fg">
                <Lead icon={typeIcon(p.type)} size={12} />
                {p.name}
              </td>
              <td className="text-dim">
                <Lead icon={o.mode === 'contract' ? 'doc' : 'factory'} />
                {o.mode === 'contract' ? 'Contract maker' : 'Own factory'}
              </td>
              <td>
                <Meter value={o.done} max={o.quantity} tone={stalled ? 'neg' : 'accent'} />
              </td>
              <td className="num r text-fg">
                {num(o.done)} / {num(o.quantity)}
              </td>
              <td className="num r text-dim">{money(each)}</td>
              <td className="num r text-dim">{money(orderLeft(o) * each, 1)}</td>
              <td>{stalled ? <Tag tone="neg" icon="alert">line down</Tag> : waiting ? <Tag tone="warn" icon="hourglass">starts in {waiting}d</Tag> : <Tag tone="pos" icon="build">building</Tag>}</td>
              <td className="r">
                <ConfirmIconBtn icon="close" title="Cancel the units not yet built" onClick={(e) => (e.stopPropagation(), act((s) => cancelOrder(s, o.id)), say(`The rest of the ${p.name} run is cancelled.`))} onKeyDown={(e) => e.stopPropagation()} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
