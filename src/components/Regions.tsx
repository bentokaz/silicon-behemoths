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

// ------------------------------------------------------------------ world

/** Land on a 46 x 21 grid, as runs of [region, first column, last column] per row. */
const LAND: [string, number, number][][] = [
  [['na', 1, 3], ['na', 6, 13], ['na', 15, 18], ['eu', 23, 25], ['ea', 27, 43]],
  [['na', 1, 4], ['na', 5, 14], ['na', 15, 18], ['eu', 22, 26], ['ea', 27, 44]],
  [['na', 2, 3], ['na', 5, 14], ['na', 16, 17], ['eu', 20, 20], ['eu', 23, 26], ['ea', 27, 43]],
  [['na', 6, 14], ['eu', 20, 26], ['ea', 27, 41]],
  [['na', 6, 14], ['eu', 20, 26], ['ea', 27, 38]],
  [['na', 6, 13], ['eu', 20, 21], ['eu', 23, 26], ['ea', 28, 38], ['ea', 39, 40]],
  [['na', 7, 12], ['eu', 20, 20], ['eu', 24, 24], ['me', 25, 29], ['ea', 30, 37], ['ea', 39, 39]],
  [['na', 8, 11], ['me', 19, 29], ['sa', 30, 32], ['ea', 33, 37]],
  [['la', 8, 10], ['me', 19, 28], ['sa', 30, 34], ['ea', 35, 36]],
  [['la', 9, 13], ['me', 19, 27], ['sa', 30, 35], ['sa', 37, 37]],
  [['la', 10, 14], ['me', 19, 27], ['sa', 31, 31], ['sa', 33, 35], ['sa', 37, 37]],
  [['la', 11, 15], ['me', 20, 27], ['sa', 34, 34]],
  [['la', 12, 16], ['me', 22, 26], ['sa', 33, 34], ['sa', 36, 38]],
  [['la', 12, 17], ['me', 23, 26], ['sa', 34, 39]],
  [['la', 13, 17], ['me', 23, 26], ['sa', 36, 39]],
  [['la', 13, 17], ['me', 23, 26], ['me', 28, 28], ['sa', 35, 40]],
  [['la', 13, 16], ['me', 23, 26], ['me', 28, 28], ['sa', 35, 40]],
  [['la', 13, 16], ['me', 23, 25], ['sa', 35, 40]],
  [['la', 13, 15], ['me', 24, 25], ['sa', 38, 40], ['sa', 44, 44]],
  [['la', 13, 14], ['sa', 43, 44]],
  [['la', 13, 14]],
]
const DOTS = LAND.flatMap((row, y) => row.flatMap(([region, a, b]) => Array.from({ length: b - a + 1 }, (_, i) => ({ region, x: a + i, y }))))

function WorldMap({ g, selected, onSelect }: { g: GameState; selected: string; onSelect: (id: string) => void }) {
  const [hover, setHover] = useState('')
  return (
    <svg viewBox="-1 -1 48 23" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      {DOTS.map((d, i) => {
        const st = g.regions[d.region]
        const on = d.region === selected
        const lit = d.region === hover
        return (
          <rect
            key={i}
            x={d.x + 0.14}
            y={d.y + 0.14}
            width={0.72}
            height={0.72}
            fill={st?.open ? 'var(--color-accent)' : 'var(--color-dim)'}
            opacity={st?.open ? 0.3 + 0.7 * Math.sqrt(st.awareness) : on || lit ? 0.6 : 0.28}
            stroke={on ? 'var(--color-fg)' : 'none'}
            strokeWidth={0.08}
            className="cursor-pointer"
            onMouseEnter={() => setHover(d.region)}
            onMouseLeave={() => setHover('')}
            onClick={() => onSelect(d.region)}
          />
        )
      })}
    </svg>
  )
}

function RegionPanel({ r }: { r: RegionDef }) {
  const g = useGame()
  const { act, say, setTab } = useStore.getState()
  const st = g.regions[r.id]
  const home = homeRegion(g) === r.id
  const blocked = entryBlocked(g, r.id)
  const based = g.companies.filter((c) => !c.isPlayer && c.alive && homeOf(c) === r.id)
  const stores = g.stores.filter((s) => s.region === r.id)
  const peak = Math.max(1, ...st.history)
  return (
    <div className="space-y-2 p-2">
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-fg">{r.name}</span>
          {home ? <Tag tone="accent" icon="home">home</Tag> : st.open ? <Tag tone="pos" icon="check">selling</Tag> : <Tag icon="lock">not entered</Tag>}
        </div>
        <div className="text-[11px] leading-snug text-dim">{r.blurb}</div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Mini label="Share of world demand" icon="market" value={pct(r.share, 0)} tone="text-fg" />
        <Mini label="Buyers lean" icon="target" value={r.wealth > 1.05 ? 'premium' : r.wealth < 0.9 ? 'budget' : 'balanced'} />
        <Mini label="Duties and shipping" icon="ship" value={home ? 'none (home)' : pct(r.tariff, 0)} />
        <Mini label="Running cost / month" icon="receipt" value={home ? 'none (home)' : money(r.overhead, 0)} />
      </div>
      {st.open ? (
        <>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-dim">
                <Lead icon="eye" />
                Awareness here
              </span>
              <span className="num text-[11px] text-fg">{pct(st.awareness)}</span>
            </div>
            <Meter value={st.awareness} tone="accent" />
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Mini label="Sold this month" icon="package" value={num(st.monthUnits)} tone="text-fg" />
            <Mini label="Your stores" icon="stores" value={stores.length} />
          </div>
          <div>
            <Head icon="market" className="mb-1 text-faint">
              Units a month
            </Head>
            <div className="flex h-12 items-end gap-[2px] border-b border-line">
              {st.history.slice(-24).map((u, i) => (
                <span key={i} className="flex-1 bg-accent/70" style={{ height: `${Math.max(2, (u / peak) * 100)}%` }} />
              ))}
              {!st.history.length && <span className="pb-1 text-[11px] text-faint">Recorded at each month end.</span>}
            </div>
          </div>
          <Slider label="Local price" icon="tag" value={st.priceAdj} min={0.7} max={1.4} step={0.01} format={(v) => `${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}% on list`} onChange={(v) => act((s) => setRegionPrice(s, r.id, v))} hint={r.wealth < 0.9 ? 'Buyers here are price-sensitive: a lower local price can sell far more.' : r.wealth > 1.05 ? 'Buyers here will pay more for the same device.' : undefined} />
          <div className="flex gap-1">
            <Btn small icon="marketing" className="flex-1" onClick={() => setTab('marketing')}>
              Advertise here
            </Btn>
            <Btn small icon="stores" className="flex-1" onClick={() => setTab('stores')}>
              Open a store
            </Btn>
          </div>
        </>
      ) : (
        <>
          <div className="text-[11px] leading-snug text-dim">Setting up means a local distributor, certification and a small office. You start with a little of the name you have made elsewhere, and build from there.</div>
          {blocked ? (
            <div className="flex items-start gap-2 border border-line px-2 py-[7px] text-[11px] text-faint">
              <Icon name="lock" size={12} className="mt-[1px]" />
              <span>{blocked}</span>
            </div>
          ) : (
            <Btn
              tone="primary"
              icon="pin"
              className="h-9 w-full"
              onClick={() => {
                const err = act((s) => enterRegion(s, r.id))
                if (err) say(err, 'bad')
                else (sfx.launch(), say(`You now sell in ${r.name}.`))
              }}
            >
              Enter for {money(r.entry, 1)}
            </Btn>
          )}
        </>
      )}
      <div>
        <Head icon="rivals" className="mb-1 text-faint">
          Based here ({based.length})
        </Head>
        {based.length === 0 && <div className="text-[11px] text-dim">No major rival calls this region home.</div>}
        {based.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-[2px] text-[11px]">
            <span className="text-fg">
              <span className="mr-2 inline-block h-2 w-2" style={{ background: c.color }} />
              {c.name}
            </span>
            <span className="num text-dim" title="Brand reputation">
              <Lead icon="brand" size={10} />
              {Math.round(c.brand * 100)}
            </span>
          </div>
        ))}
        <div className="mt-1 text-[11px] leading-snug text-faint">Rivals are strongest at home and patchier abroad.</div>
      </div>
    </div>
  )
}

export function WorldScreen() {
  const g = useGame()
  // a region picked in the city view is the one shown first
  const [selected, setSelected] = useKept('world:region', () => homeRegion(g))
  // a region picked in the city wins over the one last looked at
  useEffect(() => {
    const aimed = takeAim('region')
    if (aimed) setSelected(aimed)
  }, [setSelected])
  const open = REGIONS.filter((r) => g.regions[r.id].open)
  const total = open.reduce((a, r) => a + (g.regions[r.id].history.at(-1) ?? 0), 0)
  const region = REGIONS.find((r) => r.id === selected) ?? REGIONS[0]
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="grid shrink-0 grid-cols-4 gap-2">
        <Kpi label="Regions" icon="world" value={`${open.length} of ${REGIONS.length}`} sub="where your devices are sold" tone="accent" />
        <Kpi label="World reach" icon="target" value={pct(open.reduce((a, r) => a + r.share, 0), 0)} sub="of global demand you can sell to" />
        <Kpi label="World awareness" icon="eye" value={pct(player(g).awareness)} sub="each region counted by its size" />
        <Kpi label="Overseas running costs" icon="receipt" value={money(regionOverheads(g), 1)} sub="per month" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-2">
        <div className="flex min-h-0 flex-col gap-2">
          <Panel title="World" icon="world" className="flex-1" bodyClass="p-3" right={<span className="num text-[11px] text-faint">brighter = better known / grey = not entered</span>}>
            <WorldMap g={g} selected={selected} onSelect={setSelected} />
          </Panel>
          <Panel className="shrink-0" bodyClass="@container overflow-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Region</th>
                  <th className="r">World demand</th>
                  <th className="w-32">Awareness</th>
                  <th className="r">Units last month</th>
                  <th className="r @max-[640px]:hidden">Share of your sales</th>
                  <th className="r">Local price</th>
                </tr>
              </thead>
              <tbody>
                {REGIONS.map((r) => {
                  const st = g.regions[r.id]
                  return (
                    <tr key={r.id} className={`row cursor-pointer ${selected === r.id ? 'bg-accent/10' : ''}`} {...pressable(() => setSelected(r.id))}>
                      <td className={st.open ? 'text-fg' : 'text-faint'}>
                        {r.name}
                        {homeRegion(g) === r.id && (
                          <span className="ml-2" title="Your home region">
                            <Icon name="home" size={11} className="inline-block text-accent" style={{ verticalAlign: -1 }} />
                          </span>
                        )}
                      </td>
                      <td className="num r text-dim">{pct(r.share, 0)}</td>
                      <td>{st.open ? <Meter value={st.awareness} tone="accent" /> : <span className="text-[11px] text-faint">not entered ({money(r.entry, 1)})</span>}</td>
                      <td className="num r text-fg">{st.open ? num(st.history.at(-1) ?? 0) : '--'}</td>
                      <td className="num r text-dim @max-[640px]:hidden">{st.open && total > 0 ? pct((st.history.at(-1) ?? 0) / total, 0) : '--'}</td>
                      <td className="num r text-dim">{st.open ? `${st.priceAdj >= 1 ? '+' : ''}${Math.round((st.priceAdj - 1) * 100)}%` : '--'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Panel>
        </div>
        <Panel title="Region" icon="pin" bodyClass="overflow-y-auto">
          <RegionPanel key={region.id} r={region} />
        </Panel>
      </div>
    </div>
  )
}
