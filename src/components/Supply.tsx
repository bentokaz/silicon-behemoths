// Component supply: what the parts every device is made of cost this month.
// Split out of Operations.tsx for the interface redesign: supply belongs with the company's finances now.
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

export function Supply() {
  const g = useGame()
  const { act, say } = useStore.getState()
  return (
    <div className="grid grid-cols-5 gap-2 p-2">
      {SUPPLY_CATS.map((c) => {
        const price = marketPrice(g.supply, c)
        const lock = g.supply.locks[c]
        const locked = lock && lock.until > g.day
        const short = g.supply.shockDays[c] > 0
        const data = [...g.supply.history[c], price].map((v, i) => ({ i, v }))
        return (
          <div key={c} className="border border-line bg-panel p-2">
            <div className="flex items-center justify-between">
              <span className="flex min-w-0 items-center gap-[6px] text-[11px] font-semibold text-fg">
                <Icon name={supplyIcon(c)} size={13} className="text-dim" />
                <span className="truncate" title={SUPPLY_LABELS[c]}>
                  {SUPPLY_LABELS[c]}
                </span>
              </span>
              {short ? <Tag tone="neg" icon="alert">shortage</Tag> : price > 1.08 ? <Tag tone="warn" icon="trendUp">dear</Tag> : price < 0.94 ? <Tag tone="pos" icon="trendDown">cheap</Tag> : <Tag>normal</Tag>}
            </div>
            <div className={`num mt-2 text-2xl font-semibold leading-none ${price > 1.15 ? 'text-neg' : price > 1.05 ? 'text-warn' : 'text-fg'}`}>x{price.toFixed(2)}</div>
            <div className="num mt-1 text-[11px] text-faint">market price against normal</div>
            <div className="mt-2 h-16">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
                  <YAxis hide domain={[0.75, 1.8]} />
                  <ReferenceLine y={1} stroke="var(--color-line2)" strokeDasharray="2 3" />
                  <Line dataKey="v" stroke={short ? 'var(--color-neg)' : 'var(--color-accent)'} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {locked ? (
              <div className="mt-2 border border-accent px-2 py-1 text-[11px] text-accent">
                <Lead icon="lock" />
                Fixed at x{lock.value.toFixed(2)} until {fmtDate(lock.until)}
              </div>
            ) : (
              <Btn
                small
                icon="lock"
                className="mt-2 w-full"
                onClick={() => {
                  const err = act((s) => lockSupply(s, c))
                  if (err) say(err, 'bad')
                  else (sfx.confirm(), say(`${SUPPLY_LABELS[c]} fixed at x${price.toFixed(2)} for a year.`))
                }}
              >
                Fix this price ({money(LOCK_FEE, 0)})
              </Btn>
            )}
          </div>
        )
      })}
      <div className="col-span-5 text-[11px] leading-snug text-dim">
        Component prices drift, and now and then a shortage pushes one category up for months. A fixed-price contract holds today's price for {LOCK_DAYS} days, whatever the market does. It is worth buying while prices are normal, not after they have risen.
      </div>
    </div>
  )
}
