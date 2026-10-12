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

const big = (v: number) => money(v, 1)

// ------------------------------------------------------------------ shares

function Raise() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const k = g.stock
  const [stake, setStake] = useState(0.1)
  const [float, setFloat] = useState(0.2)
  const [issue, setIssue] = useState(0.05)
  const [back, setBack] = useState(1e6)
  const run = (err: string | null, ok: () => void) => (err ? say(err, 'bad') : ok())
  const v = valuation(g)
  if (!k.listed) {
    const q = roundQuote(g, stake)
    const blocked = raiseBlocked(g)
    const ipo = ipoBlocked(g)
    return (
      <div className="space-y-3 p-2">
        <div>
          <Head icon="briefcase" className="mb-1 text-faint">
            Private funding round
          </Head>
          <div className="text-[11px] leading-snug text-dim">Sell a slice of the company to an investor for cash now. You keep control as long as you hold more than half; below that, the board can replace you if results disappoint.</div>
          <Slider label="Stake to sell" icon="pie" value={stake} min={0.02} max={0.3} step={0.01} format={(x) => pct(x, 0)} onChange={setStake} />
          <div className="grid grid-cols-3 gap-1">
            <Mini label="Investor" icon="briefcase" value={q.name} tone="text-fg" />
            <Mini label="They pay" icon="cash" value={money(q.cash, 1)} tone="text-pos" />
            <Mini label="You would hold" icon="pie" value={pct(k.founder / (k.shares + q.shares))} />
          </div>
          {blocked ? (
            <div className="mt-2 border border-line px-2 py-[7px] text-[11px] text-faint">{blocked}</div>
          ) : (
            <Btn tone="primary" icon="briefcase" className="mt-2 h-9 w-full" onClick={() => run(act((s) => fundingRound(s, stake)), () => (sfx.cash(), say(`${q.name} is in. ${money(q.cash, 1)} is in the bank.`)))}>
              Sell {pct(stake, 0)} for {money(q.cash, 1)}
            </Btn>
          )}
        </div>
        <div className="border-t border-line pt-3">
          <Head icon="bell" className="mb-1 text-faint">
            Go public
          </Head>
          <div className="text-[11px] leading-snug text-dim">
            List on the stock market. You raise a lot at once, your shares get a price every day, and you can buy stakes in rivals. Needs a valuation of {money(IPO_MIN_VALUE, 0)} and a year of accounts.
          </div>
          <Slider label="Share of the company to float" icon="pie" value={float} min={0.05} max={0.4} step={0.01} format={(x) => pct(x, 0)} onChange={setFloat} disabled={!!ipo} hint={ipo ?? undefined} />
          <div className="grid grid-cols-2 gap-1">
            <Mini label="Would raise about" icon="cash" value={big(((v * float) / (1 - float)) * 0.94)} tone="text-pos" />
            <Mini label="You would hold" icon="pie" value={pct((k.founder / k.shares) * (1 - float))} />
          </div>
          {ipo ? (
            <div className="mt-2 border border-line px-2 py-[7px] text-[11px] text-faint">{ipo}</div>
          ) : (
            <ConfirmBtn tone="primary" icon="bell" className="mt-2 h-9 w-full" confirm={`Float ${pct(float, 0)}? A listing cannot be undone.`} onClick={() => run(act((s) => listCompany(s, float)), () => (sfx.bell(), say('The opening bell rang. You are a public company.')))}>
              List the company
            </ConfirmBtn>
          )}
        </div>
      </div>
    )
  }
  const blocked = issueBlocked(g)
  const others = k.shares - k.founder
  return (
    <div className="space-y-3 p-2">
      <div>
        <Head icon="coins" className="mb-1 text-faint">
          Sell new shares
        </Head>
        <div className="text-[11px] leading-snug text-dim">Raises cash at a small discount to today's price. It dilutes every holder, you included, and the market does not love it.</div>
        <Slider label="New shares, as a share of those in issue" value={issue} min={0.01} max={0.15} step={0.01} format={(x) => pct(x, 0)} onChange={setIssue} disabled={!!blocked} />
        {blocked ? (
          <div className="border border-line px-2 py-[7px] text-[11px] text-faint">{blocked}</div>
        ) : (
          <Btn tone="primary" icon="coins" className="w-full" onClick={() => run(act((s) => sellShares(s, issue)), sfx.cash)}>
            Raise about {big(k.shares * issue * k.price * 0.93)}
          </Btn>
        )}
      </div>
      <div className="border-t border-line pt-3">
        <Head icon="recall" className="mb-1 text-faint">
          Buy shares back
        </Head>
        <div className="text-[11px] leading-snug text-dim">Spend cash to cancel other people's shares. Your stake rises and the board approves.</div>
        <Slider label="Spend" icon="cash" value={Math.min(back, Math.max(1e6, g.cash))} min={1e6} max={Math.max(2e6, Math.min(g.cash, others * k.price * 1.04))} step={1e6} format={(x) => big(x)} onChange={setBack} disabled={others <= 0 || g.cash < 1e6} />
        <Btn icon="recall" className="w-full" disabled={others <= 0 || g.cash < 1e6} onClick={() => run(act((s) => buyBackShares(s, Math.min(back, s.cash))), sfx.confirm)}>
          {others <= 0 ? 'You own every share' : 'Buy back'}
        </Btn>
      </div>
      <div className="border-t border-line pt-3">
        <Head icon="pie" className="mb-1 text-faint">
          Dividends
        </Head>
        <Slider label="Share of each month's profit paid out" icon="percent" value={k.payout} min={0} max={0.5} step={0.05} format={(x) => pct(x, 0)} onChange={(x) => act((s) => setPayout(s, x))} />
        <div className="text-[11px] leading-snug text-dim">
          Paid to all shareholders after a profitable month. Keeps the board on your side. Paid so far: <span className="num text-fg">{big(k.dividendsPaid)}</span>.
        </div>
      </div>
    </div>
  )
}

export function SharesScreen() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const k = g.stock
  const me = player(g)
  const stake = founderStake(g)
  const t = trailing(g)
  const floated = k.shares - k.founder - k.investors.reduce((a, i) => a + i.shares, 0)
  const data = k.history.map((price, i) => ({ month: monthLabel(Math.floor(g.day / 30) - k.history.length + i), price }))
  const rivals = g.companies.filter((c) => !c.isPlayer && (c.alive || c.acquired)).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  const run = (err: string | null, ok: () => void) => (err ? say(err, 'bad') : ok())
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="grid shrink-0 grid-cols-5 gap-2">
        <Kpi label={k.listed ? 'Market value' : 'Valuation'} icon="chart" value={big(marketCap(g))} sub={k.listed ? 'listed' : 'private company'} tone="accent" />
        <Kpi label="Share price" icon="tag" value={`$${k.price.toFixed(2)}`} sub={`${num(k.shares)} shares`} />
        <Kpi label="Your stake" icon="pie" value={pct(stake)} sub={stake > 0.5 ? 'you control the company' : 'the board can outvote you'} tone={stake > 0.5 ? 'pos' : 'warn'} />
        <Kpi label="Your net worth" icon="wallet" value={big(netWorth(g))} sub="your shares at today's price" />
        <Kpi label="Board confidence" icon="staff" value={Math.round(k.confidence)} sub={stake > 0.5 ? 'advisory while you hold control' : k.lowDays ? 'they are losing patience' : 'follows price, profit, dividends'} tone={k.confidence < 25 ? 'neg' : k.confidence < 50 ? 'warn' : 'pos'} />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,7fr)_minmax(0,4fr)] gap-2">
        <div className="flex min-h-0 flex-col gap-2">
          <Panel title="Share price" icon="shares" className="h-[38%] shrink-0" bodyClass="p-1" right={<span className="num text-[11px] text-faint">12-month sales {big(t.revenue)} / profit {big(t.profit)}</span>}>
            {data.length < 2 ? (
              <Empty icon="shares" text="The price is recorded at the end of each month." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                  <XAxis dataKey="month" tick={chart.axis} stroke={chart.grid} minTickGap={30} />
                  <YAxis tick={chart.axis} stroke={chart.grid} tickFormatter={(v) => `$${Number(v).toFixed(v < 10 ? 2 : 0)}`} width={48} domain={['auto', 'auto']} />
                  <Tooltip {...chart.tooltip} formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Price']} />
                  <Line type="monotone" dataKey="price" stroke="var(--color-accent)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>
          <Panel title="Other companies" icon="rivals" className="flex-1" bodyClass="@container overflow-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="@max-[640px]:hidden">Based in</th>
                  <th className="r">Worth</th>
                  <th className="r">You own</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rivals.map((c) => {
                  const own = stakeIn(g, c.id)
                  const worth = c.value ?? rivalValue(c)
                  return (
                    <tr key={c.id} className="row">
                      <td className="text-fg">
                        <span className="mr-2 inline-block h-2 w-2" style={{ background: c.color }} />
                        {c.name}
                      </td>
                      <td className="text-dim @max-[640px]:hidden">{REGIONS.find((r) => r.id === homeOf(c))?.name}</td>
                      <td className="num r text-dim">{c.acquired ? '--' : big(worth)}</td>
                      <td className="num r text-fg">{c.acquired ? <Tag tone="pos" icon="check">yours</Tag> : own ? pct(own, 0) : '--'}</td>
                      <td className="r whitespace-nowrap">
                        {!c.acquired && (
                          <>
                            {own > 0 && (
                              <Btn small tone="ghost" title="Sell your whole stake at today's price" onClick={() => (act((s) => sellRivalStake(s, c.id)), sfx.cash(), say(`Sold your stake in ${c.name}.`))}>
                                Sell
                              </Btn>
                            )}
                            <Btn small className="ml-1" disabled={own >= 0.489} onClick={() => run(act((s) => buyRivalStake(s, c.id, 0.05)), sfx.confirm)} title="Buy 5% on the market">
                              +5% {big(stakePrice(c, 0.05))}
                            </Btn>
                            <ConfirmBtn small tone="primary" className="ml-1" confirm={`Pay ${big(takeoverPrice(g, c))}?`} onClick={() => run(act((s) => acquire(s, c.id)), () => (sfx.bell(), say(`${c.name} is now part of ${me.name}.`)))} title="Buy the whole company. Its devices are withdrawn; its customers and know-how come to you. This cannot be undone.">
                              Buy out {big(takeoverPrice(g, c))}
                            </ConfirmBtn>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Panel>
        </div>
        <div className="flex min-h-0 flex-col gap-2">
          <Panel title="Who owns the company" icon="pie" className="shrink-0" bodyClass="px-2 py-1">
            <Row icon="person" k="You" v={pct(stake)} tone="text-accent" />
            {k.investors.map((inv, i) => (
              <Row key={i} icon="briefcase" k={<span>{inv.name} <span className="text-faint">/ {inv.kind}, {fmtDate(inv.day)}</span></span>} v={pct(inv.shares / k.shares)} />
            ))}
            {floated > 0 && <Row icon="staff" k="Public shareholders" v={pct(floated / k.shares)} />}
            <div className="flex h-2 w-full overflow-hidden border border-line2">
              <span style={{ width: `${stake * 100}%`, background: 'var(--color-accent)' }} />
              {k.investors.map((inv, i) => (
                <span key={i} style={{ width: `${(inv.shares / k.shares) * 100}%`, background: ['#5a9bd4', '#58b368', '#9c6ade', '#d6a24f'][i % 4] }} />
              ))}
            </div>
            <div className="py-1 text-[11px] leading-snug text-faint">{g.config.difficulty === 'relaxed' || g.config.unlimitedMoney ? 'On this difficulty the board never removes you.' : `Next round or issue possible ${Math.max(0, RAISE_GAP - (g.day - k.lastRaise)) ? `in ${RAISE_GAP - (g.day - k.lastRaise)} days` : 'now'}.`}</div>
          </Panel>
          <Panel title={k.listed ? 'Capital' : 'Raise money'} icon="bank" className="flex-1" bodyClass="overflow-y-auto">
            <Raise />
          </Panel>
        </div>
      </div>
    </div>
  )
}
