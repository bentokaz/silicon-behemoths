// Split out of Screens.tsx for the interface redesign.
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MAX_LEVEL, SUPPLY_LABELS, TRACK_INFO, marketLevel, researchCost } from '../data/catalog'
import { SEGMENTS, TYPES, segmentInfo, segmentsOf } from '../data/devices'
import { companyOf, fmtDate, monthLabel, player, trailingUnits } from '../sim/game'
import { OUTSIDE_OPTION, attraction, segmentDemand } from '../sim/market'
import { factoryLine, marketPrice, pendingUnits } from '../sim/ops'
import { nextGoals, stageOf } from '../sim/goals'
import { type CapId, capOfTab, guided, has, lockTip, needText, nextCaps } from '../sim/progress'
import { REGIONS } from '../sim/regions'
import { sealedRooms } from '../sim/sites'
import { staffEffects, unmanaged } from '../sim/staff'
import { founderStake, marketCap } from '../sim/stock'
import { COST_KEYS, DEVICE_TYPES, type DeviceType, type GameState, type Product, SUPPLY_CATS, TRACKS, monthCosts } from '../sim/types'
import { hasType, unlockBlocked, unlockCost } from '../sim/world'
import { type Tab, useGame, useStore } from '../store/game'
import { goStep, guideStep } from './Guide'
import { Thumb, statusIcon, statusText, statusTone } from './Inspector'
import { COST_ICON, Icon, type IconName, TAB_ICON, trackIcon, typeIcon } from './icons'
import { Btn, Empty, Fold, Head, IconBtn, Kpi, Lead, Meter, Mini, NameInput, Panel, Tabs, Tag, Th, chart, money, num, pct, pressable, useKept, useLayer } from './ui'

// ------------------------------------------------------------------ finance

import { FinanceChart } from './Overview'

const mine = (g: GameState) => g.products.filter((p) => p.companyId === 'player').sort((a, b) => b.launchDay - a.launchDay)

const COST_LABELS: Record<(typeof COST_KEYS)[number], string> = { production: 'Production', rd: 'R&D', marketing: 'Marketing', development: 'Development', overhead: 'Overhead', salaries: 'Salaries', facilities: 'Facilities', interest: 'Interest' }

export function Finance() {
  const g = useGame()
  const year = g.reports.slice(-12)
  const income = year.reduce((a, r) => a + r.revenue + r.other, 0)
  const costs = year.reduce((a, r) => a + monthCosts(r), 0)
  const stockValue = mine(g).filter((p) => p.status !== 'ended').reduce((a, p) => a + p.stock * p.unitCost, 0)
  const rows = [...g.reports].reverse().slice(0, 36)
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="grid shrink-0 grid-cols-4 gap-2">
        <Kpi label="Cash" icon="cash" value={g.config.unlimitedMoney ? 'UNLIMITED' : money(g.cash)} tone="accent" />
        <Kpi label="Income, 12 months" icon="coins" value={money(income)} sub={`of which licensing and services ${money(year.reduce((a, r) => a + r.other, 0), 1)}`} />
        <Kpi label="Costs, 12 months" icon="receipt" value={money(costs)} />
        <Kpi label="Profit, 12 months" icon={income - costs >= 0 ? 'trendUp' : 'trendDown'} value={money(income - costs)} tone={income - costs >= 0 ? 'pos' : 'neg'} sub={`unsold stock at cost ${money(stockValue, 1)}`} />
      </div>
      <div className="grid shrink-0 grid-cols-9 gap-1">
        <Mini label="Shares, stakes" title="Raised from shares and stakes, last 12 months" icon="shares" value={money(year.reduce((a, r) => a + (r.funding ?? 0), 0), 1)} />
        {COST_KEYS.map((k) => (
          <Mini key={k} label={COST_LABELS[k]} title={`${COST_LABELS[k]}, last 12 months`} icon={COST_ICON[k]} value={money(year.reduce((a, r) => a + r[k], 0), 1)} />
        ))}
      </div>
      <Panel title="Income, costs and cash, last 36 months" icon="chart" className="h-56 shrink-0">
        <FinanceChart g={g} months={36} />
      </Panel>
      <Panel title="Monthly statement" icon="doc" className="flex-1" bodyClass="overflow-auto">
        <table className="grid-table ledger">
          <thead>
            <tr>
              <th>Month</th>
              <th className="r">Units</th>
              <th className="r">Sales</th>
              <th className="r" title="Income other than device sales: licensing, services, care plans">Other</th>
              {COST_KEYS.map((k) => (
                <th key={k} className="r">
                  {COST_LABELS[k]}
                </th>
              ))}
              <th className="r">Profit</th>
              <th className="r" title="Cash in the bank when the month closed">Cash</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const profit = r.revenue + r.other - monthCosts(r)
              return (
                <tr key={r.month} className="row">
                  <td className="num text-fg">{monthLabel(r.month)}</td>
                  <td className="num r text-dim">{num(r.units)}</td>
                  <td className="num r text-fg">{money(r.revenue)}</td>
                  <td className="num r text-dim">{money(r.other)}</td>
                  {COST_KEYS.map((k) => (
                    <td key={k} className="num r text-faint">
                      {money(r[k])}
                    </td>
                  ))}
                  <td className={`num r ${profit >= 0 ? 'text-pos' : 'text-neg'}`}>{money(profit)}</td>
                  <td className="num r text-fg">{money(r.cash)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty icon="doc" text="The first statement closes at the end of the month." />}
      </Panel>
    </div>
  )
}
