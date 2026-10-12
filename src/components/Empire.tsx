// The company as an institution: who owns it, where in the world it sells,
// how it looks after owners, and the goals on the way to becoming a behemoth.
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
