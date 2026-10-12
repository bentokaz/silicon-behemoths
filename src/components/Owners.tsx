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

// ------------------------------------------------------------------ after-sales

function Option({ on, onClick, title, note, right, locked, onLocked }: { on: boolean; onClick: () => void; title: string; note: string; right?: string } & LockProps) {
  // locked, the switch is dimmed behind a lock but what it would do stays readable
  return (
    <button onClick={locked ? onLocked : onClick} aria-pressed={on} aria-disabled={locked ? true : undefined} title={locked || undefined} className={`block w-full border p-2 text-left ${locked ? 'cursor-not-allowed border-line' : on ? 'border-accent bg-accent/10' : 'border-line hover:border-line2'}`}>
      <div className="flex items-baseline justify-between">
        <span className={`text-xs ${locked ? 'text-dim opacity-45' : on ? 'text-accent' : 'text-fg'}`}>
          <Lead icon={locked ? 'lock' : on ? 'check' : 'ban'} size={12} />
          {title}
        </span>
        {right && <span className="num text-[11px] text-dim">{right}</span>}
      </div>
      <div className="mt-[2px] text-[11px] leading-snug text-dim">{note}</div>
    </button>
  )
}

export function CareScreen() {
  const g = useGame()
  const { act, say, focus } = useStore.getState()
  const c = g.care
  const set = (patch: Parameters<typeof setCare>[1]) => {
    const err = act((s) => setCare(s, patch))
    if (err) say(err, 'bad')
    else sfx.toggle()
  }
  const mine = g.products.filter((p) => p.companyId === 'player' && p.status === 'sale')
  const sat = mine.length ? mine.reduce((a, p) => a + p.satisfaction, 0) / mine.length : 0.6
  const recalls = g.products.filter((p) => p.companyId === 'player' && p.recall)
  const benches = repairBenches(g)
  const m = c.last
  // until Care policies opens, every lever here is shown as it stands but cannot be moved
  const lock = lockProps(g, 'carePolicy')
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="grid shrink-0 grid-cols-5 gap-2">
        <Kpi label="Owners" icon="staff" value={num(g.owners)} sub="people using your devices" tone="accent" />
        <Kpi label="Owner satisfaction" icon="morale" value={mine.length ? pct(sat, 0) : '--'} sub="average across devices on sale" tone={sat > 0.7 ? 'pos' : sat > 0.5 ? undefined : 'warn'} />
        <Kpi label="Appeal from after-sales" icon="heart" value={`+${pct(careBonus(g))}`} sub="buyers trust what is backed" />
        <Kpi label="Care plan members" icon="shield" value={num(c.subscribers)} sub={c.plan ? `${money(c.subscribers * c.planPrice * 0.6, 1)} a month after claims` : 'not offered'} />
        <Kpi label="Open recalls" icon="recall" value={recalls.filter((p) => p.recall?.state === 'open').length} tone={recalls.some((p) => p.recall?.state === 'open') ? 'neg' : undefined} sub="decide before they become scandals" />
      </div>
      <LockNote id="carePolicy" />
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2">
        <Panel title="Warranty and repairs" icon="shield" bodyClass="space-y-2 overflow-y-auto p-2">
          <div className="text-[11px] leading-snug text-dim">Every faulty unit is repaired at your cost while it is under warranty. A longer warranty costs more per fault, makes owners happier and makes buyers trust you.</div>
          <div className="grid grid-cols-3 gap-1">
            {WARRANTY_YEARS.map((y) => (
              <Btn key={y} active={c.warrantyYears === y} onClick={() => set({ warrantyYears: y })} {...lock} lockMark="corner">
                {y} year{y > 1 ? 's' : ''}
              </Btn>
            ))}
          </div>
          <Row icon="receipt" k="Cost per faulty unit" v={`${pct(warrantyLoad(g), 0)} of build cost`} />
          <Row icon="wrench" k="Repair benches in your stores" v={benches ? `${benches} (-${Math.min(30, benches * 6)}% repair cost)` : 'none'} tone={benches ? 'text-pos' : undefined} />
          <Row icon="wrench" k="Repairs last month" v={num(m.repairs)} />
          <Row icon="cash" k="Repair bill last month" v={money(m.repairCost, 1)} />
          <div className="border-t border-line pt-2">
            <Head icon="recall" className="mb-1 text-faint">
              Recalls
            </Head>
            {recalls.length === 0 && <div className="text-[11px] text-dim">No device has needed one. Keep the fault rate under 4%: test stations and a control room in the factory do that.</div>}
            {recalls.map((p) => (
              <div key={p.id} className="mb-1 border border-line p-2">
                <div className="flex items-baseline justify-between">
                  <button className="text-xs text-fg hover:text-accent" onClick={() => focus(p.id)}>
                    {p.name}
                  </button>
                  {p.recall!.state === 'open' ? <Tag tone="neg" icon="hourglass">{Math.max(0, RECALL_DEADLINE - (g.day - p.recall!.day))} days left</Tag> : p.recall!.state === 'done' ? <Tag tone="pos" icon="check">recalled</Tag> : <Tag tone="warn" icon="ban">ignored</Tag>}
                </div>
                <div className="num text-[11px] text-dim">
                  fault rate {pct(p.defectRate)} / {num(p.unitsSold)} sold
                </div>
                {p.recall!.state === 'open' && (
                  <Btn
                    small
                    tone="primary"
                    icon="recall"
                    className="mt-1 w-full"
                    onClick={() => {
                      const err = act((s) => recallProduct(s, p.id))
                      if (err) say(err, 'bad')
                      else sfx.confirm()
                    }}
                  >
                    Recall and repair ({money(p.recall!.cost, 1)})
                  </Btn>
                )}
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Software updates" icon="refresh" bodyClass="space-y-2 overflow-y-auto p-2">
          <div className="text-[11px] leading-snug text-dim">How long each device keeps getting updates after it is sold. Owners of well-supported devices stay happy and come back; the bill grows with every device in use.</div>
          <div className="grid grid-cols-5 gap-1">
            {UPDATE_YEARS.map((y) => (
              <Btn key={y} active={c.updateYears === y} onClick={() => set({ updateYears: y })} className="!px-0" {...lock} lockMark="corner">
                {y} yr
              </Btn>
            ))}
          </div>
          <Row icon="receipt" k="Cost at today's owner count" v={`${money(updatesCost(g), 1)} / month`} />
          <Row icon="cash" k="Billed last month" v={money(m.updates, 1)} />
          <div className="border-t border-line pt-2">
            <Head icon="swap" className="mb-1 text-faint">
              Trade-in programme
            </Head>
            <Option {...lock} on={c.tradeIn} onClick={() => set({ tradeIn: !c.tradeIn })} title={c.tradeIn ? 'Running' : 'Not offered'} note="Fans get credit for their old device when they buy a new one. They upgrade about 30% sooner; each of those sales costs you 6% of the price." />
            <div className="mt-1">
              <Option {...lock} on={c.refurb} onClick={() => set({ refurb: !c.refurb })} title={c.refurb ? 'Refurbishing' : 'No refurbishing'} note="Traded-in devices are refurbished and sold on, earning back most of the credit. Needs a factory or a store with a repair bench." />
            </div>
            <Row icon="swap" k="Trade-ins last month" v={num(m.tradeIns)} />
            <Row icon="coins" k="Refurbished sales last month" v={money(m.refurbIncome, 1)} />
          </div>
        </Panel>
        <Panel title="Care plan" icon="heart" bodyClass="space-y-2 overflow-y-auto p-2">
          <div className="text-[11px] leading-snug text-dim">A monthly subscription that covers accidents and gets owners to the front of the queue. Happy owners sign up more readily; about two fifths of the income goes back out on claims.</div>
          <Option {...lock} on={c.plan} onClick={() => set({ plan: !c.plan })} title={c.plan ? 'On sale' : 'Not offered'} note={c.plan ? 'Members join and leave gradually as the price and their satisfaction change.' : 'Turn it on to start signing up owners.'} />
          <Slider {...lock} label="Price" icon="tag" value={c.planPrice} min={2} max={40} step={1} format={(v) => `$${v} / month`} onChange={(v) => act((s) => setCare(s, { planPrice: v }))} />
          <Row icon="percent" k="Owners who would join at this price" v={pct(planAttach(g, sat))} />
          <Row icon="staff" k="Members now" v={num(c.subscribers)} />
          <Row icon="coins" k="Income last month" v={money(m.planIncome, 1)} tone="text-pos" />
          <Row icon="receipt" k="Claims last month (est.)" v={money(m.planIncome * 0.4, 1)} />
          <div className="border-t border-line pt-2 text-[11px] leading-snug text-faint">Support agents at head office and support bars in your stores also raise satisfaction. Their effect shows on each device's page.</div>
        </Panel>
      </div>
    </div>
  )
}
