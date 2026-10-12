// Split out of Empire.tsx for the interface redesign.
import { useEffect, useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { sfx } from '../audio/sfx'
import { RECALL_DEADLINE, acquire, buyBackShares, buyRivalStake, enterRegion, fmtDate, fundingRound, listCompany, monthLabel, player, recallProduct, sellRivalStake, sellShares, setCare, setPayout, setRegionPrice } from '../sim/game'
import { UPDATE_YEARS, WARRANTY_YEARS, careBonus, planAttach, repairBenches, updatesCost, warrantyLoad } from '../sim/care'
import { GOALS, type Goal, STAGES, stageOf } from '../sim/goals'
import { REGIONS, type RegionDef, entryBlocked, homeOf, homeRegion, regionOverheads } from '../sim/regions'
import { IPO_MIN_VALUE, RAISE_GAP, founderStake, ipoBlocked, issueBlocked, marketCap, netWorth, raiseBlocked, rivalValue, roundQuote, stakeIn, stakePrice, takeoverPrice, trailing, valuation } from '../sim/stock'
import type { GameState } from '../sim/types'
import { takeAim } from '../store/focus'
import { useGame, useStore } from '../store/game'
import { LockNote, lockProps } from './Progress'
import { Icon, type IconName } from './icons'
import { Btn, ConfirmBtn, Empty, Head, Kpi, Lead, type LockProps, Meter, Mini, Panel, Row, Slider, Tabs, Tag, chart, money, num, pct, pressable, useKept } from './ui'

// ------------------------------------------------------------------ goals

function GoalRow({ goal, g }: { goal: Goal; g: GameState }) {
  const done = g.goals[goal.id]
  const p = done !== undefined ? 1 : goal.progress(g)
  const prize = [goal.cash ? money(goal.cash, goal.cash >= 1e6 ? 1 : 0) : '', goal.fans ? `${num(goal.fans)} fans` : ''].filter(Boolean).join(' + ')
  return (
    <div className={`border-b border-line px-2 py-[6px] ${done !== undefined ? 'opacity-70' : ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`min-w-0 break-words text-xs ${done !== undefined ? 'text-pos' : 'text-fg'}`}>
          {done !== undefined && <Lead icon="check" size={12} />}
          {goal.name}
        </span>
        <span className="num shrink-0 text-[11px] text-dim">{done !== undefined ? fmtDate(done) : prize}</span>
      </div>
      <div className="text-[11px] leading-snug text-dim">{goal.note}</div>
      {done === undefined && <Meter value={p} tone={p > 0.66 ? 'pos' : 'accent'} className="mt-1" />}
    </div>
  )
}

const GROUP_ICON: Record<Goal['group'], IconName> = { Products: 'devices', Company: 'campus', Reach: 'world', Money: 'cash' }

export function GoalsScreen() {
  const g = useGame()
  const stage = stageOf(g)
  const groups: Goal['group'][] = ['Products', 'Company', 'Reach', 'Money']
  const [view, setView] = useKept<'open' | 'all'>('goals:list', 'open')
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="shrink-0 border border-line bg-panel p-3">
        <div className="flex items-baseline justify-between">
          <div>
            <Head icon="goals" className="text-faint">
              Standing
            </Head>
            <div className="text-base text-accent">{stage.name}</div>
          </div>
          <span className="num text-[13px] text-fg">
            {stage.done} <span className="text-faint">of {stage.total} goals</span>
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          {STAGES.map((name, i) => (
            <div key={name} className="flex-1">
              <div className={`h-[3px] ${i <= stage.index ? 'bg-accent' : 'bg-line2'}`} />
              <div className={`mt-1 truncate text-[11px] ${i === stage.index ? 'text-fg' : 'text-faint'}`}>{name}</div>
            </div>
          ))}
        </div>
      </div>
      <Tabs value={view} onChange={setView} options={[{ value: 'open', label: 'Still to do', icon: 'hourglass', badge: stage.total - stage.done }, { value: 'all', label: 'Everything', icon: 'feed' }]} />
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-2">
        {groups.map((group) => {
          const list = GOALS.filter((x) => x.group === group && (view === 'all' || g.goals[x.id] === undefined)).sort((a, b) => (g.goals[a.id] !== undefined ? 1 : 0) - (g.goals[b.id] !== undefined ? 1 : 0) || b.progress(g) - a.progress(g))
          return (
            <Panel key={group} title={group} icon={GROUP_ICON[group]} bodyClass="overflow-y-auto overflow-x-hidden" right={<span className="num text-[11px] text-faint">{GOALS.filter((x) => x.group === group && g.goals[x.id] !== undefined).length} / {GOALS.filter((x) => x.group === group).length}</span>}>
              {list.length === 0 && <Empty icon="check" text="All done here." />}
              {list.map((goal) => (
                <GoalRow key={goal.id} goal={goal} g={g} />
              ))}
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
