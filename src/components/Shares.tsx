// Company, Shares: what the company is worth and who owns it, raising money
// (an investor or a listing while private; new shares, buybacks and dividends
// once listed), and the other companies with what a stake or the whole of
// each would cost.
import { useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { sfx } from '../audio/sfx'
import { acquire, buyBackShares, buyRivalStake, fmtDate, fundingRound, listCompany, monthLabel, player, sellRivalStake, sellShares, setPayout } from '../sim/game'
import { IPO_MIN_VALUE, founderStake, issueBlocked, marketCap, netWorth, raiseBlocked, rivalValue, roundQuote, stakePrice, trailing, valuation } from '../sim/stock'
import type { GameState } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { type RivalRow, boardRules, buybackQuote, rivalRows, sharePrice, stakeAfterIssue, stakeAfterSale } from './CompanyFigures'
import { Icon } from './icons'
import { type Column, ConfirmBtn, Empty, type Figure, Head, Help, Panel, Row, Slider, Spark, Strip, Swatch, Table, Tag, chart, int, money, pct } from './ui'

/** The colours of the investors in the ownership bar, in the order they arrived. The founder is the accent, the public the quiet grey. */
const HOLDER_COLORS = ['#5a9bd4', '#9c6ade', '#5fb8c9', '#c9a25a']

/** A reason something cannot be done yet, in place of the control. */
function Blocked({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-start gap-[6px] text-xs leading-snug text-dim">
      <Icon name="hourglass" size={12} className="mt-[2px] shrink-0 text-faint" />
      <span>{children}</span>
    </div>
  )
}

/** A line saying what holding half or less means, shown wherever a choice would take the founder there. */
function ControlNote({ stake }: { stake: number }) {
  if (stake > 0.5) return null
  return <div className="mt-1 text-xs leading-snug text-warn">With half the shares or less, the board can replace you if results disappoint.</div>
}

/** Raising money while the company is private: sell a part to an investor, or list on the stock market. */
function RaisePrivate({ g }: { g: GameState }) {
  const { act, say } = useStore.getState()
  const k = g.stock
  const [stake, setStake] = useState(0.1)
  const [float, setFloat] = useState(0.2)
  const q = roundQuote(g, stake)
  const blocked = raiseBlocked(g)
  const v = valuation(g)
  const months = g.reports.length
  const canList = v >= IPO_MIN_VALUE && months >= 12
  const after = k.founder / (k.shares + q.shares)
  const afterFloat = stakeAfterSale(g, float)
  return (
    <>
      <div className="px-3 py-3">
        <Head icon="briefcase">Sell a part to an investor</Head>
        <div className="mt-1 text-xs leading-snug text-dim">An investor pays cash now for new shares. Your part of the company shrinks for good unless you buy them out later.</div>
        {blocked ? (
          <Blocked>{blocked}.</Blocked>
        ) : (
          <>
            <Slider label="Part of the company to sell" icon="pie" value={stake} min={0.02} max={0.3} step={0.01} format={(x) => pct(x, 0)} onChange={setStake} />
            <Row k={`${q.name} (${q.kind.toLowerCase()}) pays`} v={money(q.cash)} tone="text-pos" />
            <Row k="You would hold" v={pct(after)} tone={after > 0.5 ? undefined : 'text-warn'} />
            <ControlNote stake={after} />
            <ConfirmBtn tone="default" icon="briefcase" className="mt-2 w-full" confirm={`Sell ${pct(stake, 0)} for ${money(q.cash)}?`} onClick={() => { const err = act((s) => fundingRound(s, stake)); if (err) say(err, 'bad'); else (sfx.cash(), say(`${q.name} is in. ${money(q.cash)} is in the bank.`)) }}>
              Sell {pct(stake, 0)} for {money(q.cash)}
            </ConfirmBtn>
          </>
        )}
      </div>
      <div className="border-t border-line px-3 py-3">
        <Head icon="bell">List on the stock market</Head>
        <div className="mt-1 text-xs leading-snug text-dim">Sell a part of the company to the public. It raises a lot at once, the shares get a price every day, and from then on you raise money by selling new shares. A listing cannot be undone.</div>
        {canList ? (
          <>
            <Slider label="Part of the company to sell" icon="pie" value={float} min={0.05} max={0.4} step={0.01} format={(x) => pct(x, 0)} onChange={setFloat} />
            <Row k="Raises about" v={money(((v * float) / (1 - float)) * 0.94)} tone="text-pos" />
            <Row k="You would hold" v={pct(afterFloat)} tone={afterFloat > 0.5 ? undefined : 'text-warn'} />
            <ControlNote stake={afterFloat} />
            <ConfirmBtn tone="default" icon="bell" className="mt-2 w-full" confirm={`List ${pct(float, 0)}? It cannot be undone.`} onClick={() => { const err = act((s) => listCompany(s, float)); if (err) say(err, 'bad'); else (sfx.bell(), say('The opening bell rang. You are a public company.')) }}>
              List the company
            </ConfirmBtn>
          </>
        ) : (
          <div className="mt-2">
            <Row icon={v >= IPO_MIN_VALUE ? 'check' : undefined} k="Company value" v={`${money(v)} / ${money(IPO_MIN_VALUE)}`} tone={v >= IPO_MIN_VALUE ? 'text-pos' : undefined} />
            <Row icon={months >= 12 ? 'check' : undefined} k="Full months of accounts" v={`${Math.min(months, 12)} / 12`} tone={months >= 12 ? 'text-pos' : undefined} />
          </div>
        )}
      </div>
    </>
  )
}

/** A listed company's capital: new shares, buybacks and the dividend. */
function RaiseListed({ g }: { g: GameState }) {
  const { act, say } = useStore.getState()
  const k = g.stock
  const [issue, setIssue] = useState(0.05)
  const [back, setBack] = useState(1e6)
  const blocked = issueBlocked(g)
  const others = k.shares - k.founder
  const most = Math.max(2e6, Math.min(g.cash, others * k.price * 1.04))
  const spend = Math.min(back, most)
  const raise = k.shares * issue * k.price * 0.93
  const afterIssue = stakeAfterIssue(g, issue)
  const bq = buybackQuote(g, spend)
  const canBack = others > 0 && g.cash >= 1e6
  return (
    <>
      <div className="px-3 py-3">
        <Head icon="coins">Sell new shares</Head>
        <div className="mt-1 text-xs leading-snug text-dim">The company prints new shares and sells them a little under today's price. Cash comes in. Every holder's part shrinks, yours included, and the price usually dips.</div>
        {blocked ? (
          <Blocked>{blocked}.</Blocked>
        ) : (
          <>
            <Slider label="New shares, against those in issue" icon="pie" value={issue} min={0.01} max={0.15} step={0.01} format={(x) => pct(x, 0)} onChange={setIssue} />
            <Row k="Raises about" v={money(raise)} tone="text-pos" />
            <Row k="You would hold" v={pct(afterIssue)} tone={afterIssue > 0.5 ? undefined : 'text-warn'} />
            <ControlNote stake={afterIssue} />
            <ConfirmBtn tone="default" icon="coins" className="mt-2 w-full" confirm={`Sell new shares for about ${money(raise)}?`} onClick={() => { const err = act((s) => sellShares(s, issue)); if (err) say(err, 'bad'); else (sfx.cash(), say(`New shares sold. About ${money(raise)} is in the bank.`)) }}>
              Sell {pct(issue, 0)} new shares
            </ConfirmBtn>
          </>
        )}
      </div>
      <div className="border-t border-line px-3 py-3">
        <Head icon="recall">Buy shares back</Head>
        <div className="mt-1 text-xs leading-snug text-dim">The company buys other holders' shares a little over today's price and cancels them. Cash goes out. Your part grows, and the board likes it.</div>
        {canBack ? (
          <>
            <Slider label="Spend" icon="cash" value={spend} min={1e6} max={most} step={1e6} format={(x) => money(x)} onChange={setBack} />
            <Row k="You would hold" v={pct(bq.stake)} tone={bq.stake > 0.5 ? 'text-pos' : undefined} />
            <ConfirmBtn tone="default" icon="recall" className="mt-2 w-full" confirm={`Spend ${money(bq.spent)}?`} onClick={() => { const err = act((s) => buyBackShares(s, Math.min(spend, s.cash))); if (err) say(err, 'bad'); else (sfx.confirm(), say(`Bought back shares for ${money(bq.spent)}. You hold ${pct(founderStake(g))}.`)) }}>
              Buy back for {money(bq.spent)}
            </ConfirmBtn>
          </>
        ) : (
          <Blocked>{others <= 0 ? 'You own every share: there is nothing to buy back.' : `A buyback takes at least ${money(1e6)} of cash in hand.`}</Blocked>
        )}
      </div>
      <div className="border-t border-line px-3 py-3">
        <Head icon="percent">Dividend</Head>
        <div className="mt-1 text-xs leading-snug text-dim">After each profitable month this part of the profit is paid out of the company's cash to every shareholder. It raises the board's confidence month after month. Change it whenever you like.</div>
        <Slider label="Part of each month's profit paid out" value={k.payout} min={0} max={0.5} step={0.05} format={(x) => pct(x, 0)} onChange={(x) => act((s) => setPayout(s, x))} />
        <Row k="Paid out so far" v={money(k.dividendsPaid)} />
      </div>
    </>
  )
}

/** The share price over the months it has been recorded. Behind the strip's "show more". */
function PriceChart({ g }: { g: GameState }) {
  const k = g.stock
  const data = k.history.map((p, i) => ({ month: monthLabel(Math.floor(g.day / 30) - k.history.length + i), price: p }))
  const t = trailing(g)
  return (
    <div className="px-3 py-2">
      <div className="h-40">
        {data.length < 2 ? (
          <Empty icon="shares" text="The share price is recorded at the end of each month. The line starts after two." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
              <XAxis dataKey="month" tick={chart.axis} stroke={chart.grid} minTickGap={30} />
              <YAxis tick={chart.axis} stroke={chart.grid} tickFormatter={(v) => sharePrice(Number(v))} width={64} domain={['auto', 'auto']} />
              <Tooltip {...chart.tooltip} formatter={(v) => [sharePrice(Number(v)), 'Share price']} />
              <Line dataKey="price" stroke="var(--color-accent)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-1 text-[11px] text-dim">
        The price follows what the company earns: over the last twelve months, sales of <span className="num text-fg">{money(t.revenue)}</span> and a profit of <span className={`num ${t.profit >= 0 ? 'text-fg' : 'text-neg'}`}>{money(t.profit)}</span>.
      </div>
    </div>
  )
}

function Owners({ g }: { g: GameState }) {
  const k = g.stock
  const me = player(g)
  const stake = founderStake(g)
  const floated = k.shares - k.founder - k.investors.reduce((a, i) => a + i.shares, 0)
  const safe = g.config.difficulty === 'relaxed' || g.config.unlimitedMoney
  return (
    <div className="px-3 py-2">
      <div role="img" aria-label="Who owns the company" className="mb-2 flex h-2 w-full gap-px">
        <span className="bg-accent" style={{ width: `${stake * 100}%` }} />
        {k.investors.map((inv, i) => (
          <span key={i} style={{ width: `${(inv.shares / k.shares) * 100}%`, background: HOLDER_COLORS[i % HOLDER_COLORS.length] }} />
        ))}
        {floated > 0 && <span className="bg-mute" style={{ width: `${(floated / k.shares) * 100}%` }} />}
      </div>
      <Row k={<Swatch color="var(--color-accent)">You, the founder of {me.name}</Swatch>} v={pct(stake)} />
      {k.investors.map((inv, i) => (
        <Row key={i} k={<span title={`${inv.kind}, since ${fmtDate(inv.day)}. Paid ${money(inv.paid)}.`}><Swatch color={HOLDER_COLORS[i % HOLDER_COLORS.length]}>{inv.name}</Swatch></span>} v={pct(inv.shares / k.shares)} />
      ))}
      {floated > 0 && <Row k={<Swatch color="var(--color-mute)">Public shareholders</Swatch>} v={pct(floated / k.shares)} />}
      {safe && k.shares > k.founder && <div className="pt-1 text-[11px] leading-snug text-dim">In this game the board never removes you, whatever part you hold.</div>}
    </div>
  )
}

export function SharesScreen() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const k = g.stock
  const me = player(g)
  const stake = founderStake(g)
  const board = boardRules(g)
  const rivals = rivalRows(g, rivalValue)
  const held = rivals.some((r) => r.stake > 0)

  const figures: Figure[] = [
    { label: k.listed ? 'Market value' : 'Company value', value: money(marketCap(g)), title: k.listed ? 'Every share at today\'s price' : 'What investors would value the company at today' },
    { label: 'Your part', value: (
        <>
          {pct(stake)}
          <span className="font-sans text-xs font-normal text-dim"> worth </span>
          {money(netWorth(g))}
        </>
      ), tone: stake > 0.5 ? undefined : 'warn', title: stake > 0.5 ? 'You hold more than half: nobody can outvote you.' : 'You hold half or less: the board can replace you if results disappoint.' },
    {
      label: 'Share price',
      value: (
        <span className="inline-flex items-center gap-2">
          {sharePrice(k.price)}
          <Spark values={[...k.history.slice(-11), k.price]} width={56} height={16} title="Share price, last twelve months" />
        </span>
      ),
      title: k.listed ? 'Set by the market every day' : 'The company value divided by its shares. It gets a market price once the company is listed.',
    },
  ]
  // the board only has a say while someone else could outvote the founder
  if (k.investors.length || k.listed) figures.push({ label: 'Board confidence', value: (
      <>
        {int(k.confidence)}
        <span className="font-sans text-xs font-normal text-dim"> of 100</span>
      </>
    ), tone: !board ? undefined : k.confidence <= 8 ? 'neg' : k.confidence < 30 ? 'warn' : undefined, title: board ? 'Follows the share price, monthly profit and the dividend. Near zero for four months and the board votes you out.' : 'Follows the share price, monthly profit and the dividend. It only counts once you hold half the shares or less.' })

  const buyStake = (r: RivalRow) => {
    const err = act((s) => buyRivalStake(s, r.company.id, 0.05))
    if (err) say(err, 'bad')
    else (sfx.confirm(), say(`You now hold ${pct(g.stock.holdings[r.company.id]?.stake ?? 0, 0)} of ${r.company.name}.`))
  }
  const buyOut = (r: RivalRow) => {
    const err = act((s) => acquire(s, r.company.id))
    if (err) say(err, 'bad')
    else (sfx.bell(), say(`${r.company.name} is now part of ${me.name}.`))
  }
  const sell = (r: RivalRow) => {
    act((s) => sellRivalStake(s, r.company.id))
    sfx.cash()
    say(`Sold your stake in ${r.company.name}.`)
  }

  const cols: Column<RivalRow>[] = [
    { id: 'name', head: 'Company', sort: (r) => r.company.name, cell: (r) => <Swatch color={r.company.color} className="text-fg">{r.company.name}</Swatch> },
    { id: 'value', head: 'Value', num: true, drop: 2, sort: (r) => (r.company.acquired ? null : r.value), className: 'text-dim', cell: (r) => (r.company.acquired ? '' : money(r.value)) },
    // the column only exists once there is a stake to show in it
    ...(held ? [{ id: 'stake', head: 'You own', num: true, min: 76, drop: 1, sort: (r: RivalRow) => r.stake || null, cell: (r: RivalRow) => (r.stake > 0 && !r.company.acquired ? pct(r.stake, 0) : '') } satisfies Column<RivalRow>] : []),
    {
      id: 'buyout',
      head: 'To buy it all',
      title: 'What the rest of the company costs, at the premium a takeover takes. Paid from cash in hand.',
      num: true,
      min: 112,
      sort: (r) => (r.company.acquired ? null : r.buyout),
      first: 'asc',
      cell: (r) => (r.company.acquired ? <Tag tone="pos" icon="check">Yours</Tag> : <span className={r.affordable ? 'text-fg' : 'text-dim'}>{money(r.buyout)}</span>),
    },
  ]

  return (
    <Columns>
      {board && k.lowDays > 0 && (
        <div role="alert" className="flex shrink-0 items-start gap-2 border border-neg bg-panel px-3 py-2 text-xs leading-snug text-fg">
          <Icon name="alert" size={13} className="mt-[1px] shrink-0 text-neg" />
          <span>The board has lost confidence in you. If it stays this low for four months they vote you out. A profitable month, a dividend or a rising share price brings it back; holding more than half the shares takes the vote away from them.</span>
        </div>
      )}
      <Strip items={figures} keep="shares">
        <PriceChart g={g} />
      </Strip>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,7fr)_minmax(300px,4fr)] gap-2">
        <Panel
          title="Other companies"
          icon="rivals"
          count={rivals.filter((r) => !r.company.acquired).length}
          bodyClass="overflow-y-auto overflow-x-hidden"
          keep="shares:rivals"
          right={
            <Help title="Stakes and takeovers">
              Point at a company for what you can do with it. A stake is bought 5% at a time, up to 49%, from cash in hand; it pays you a small part of what the company earns every month and can be sold again at any time. Buying a company outright costs a premium over its value and cannot be undone: its devices are withdrawn, and its customers and some of what it knows come to you. The button only appears for a company you have the cash for.
            </Help>
          }
        >
          <Table
            label="Other companies"
            cols={cols}
            rows={rivals}
            rowKey={(r) => r.company.id}
            keep="shares:rivals"
            firstMin={112}
            actionWidth={204}
            rowClass={(r) => (r.company.acquired ? '[&>td]:text-dim' : '')}
            action={(r) => {
              if (r.company.acquired) return null
              const five = stakePrice(r.company, Math.min(0.05, 0.49 - r.stake))
              const canStake = r.stake < 0.489 && g.cash >= five
              return (
                <>
                  {r.stake > 0 && (
                    <ConfirmBtn small tone="default" confirm="Sell it all?" title={`Sell your whole stake at today's value, less a 3% fee: about ${money(r.value * r.stake * 0.97)}.`} onClick={() => sell(r)}>
                      Sell
                    </ConfirmBtn>
                  )}
                  {canStake && (
                    <ConfirmBtn small tone="default" confirm={`Pay ${money(five)}?`} title={`Buy 5% of ${r.company.name} for ${money(five)}.`} onClick={() => buyStake(r)}>
                      Buy 5%
                    </ConfirmBtn>
                  )}
                  {r.affordable && (
                    <ConfirmBtn small tone="default" confirm={`Pay ${money(r.buyout)}?`} title={`Buy all of ${r.company.name} for ${money(r.buyout)}. Its devices are withdrawn; its customers and know-how come to you. This cannot be undone.`} onClick={() => buyOut(r)}>
                      Buy out
                    </ConfirmBtn>
                  )}
                </>
              )
            }}
          />
        </Panel>
        <div className="flex min-h-0 flex-col gap-2">
          <Panel title="Who owns the company" icon="pie" className="shrink-0">
            <Owners g={g} />
          </Panel>
          <Panel title={k.listed ? 'Shares and dividend' : 'Raise money'} icon="bank" className="flex-1" bodyClass="overflow-y-auto" keep="shares:raise">
            {k.listed ? <RaiseListed g={g} /> : <RaisePrivate g={g} />}
          </Panel>
        </div>
      </div>
    </Columns>
  )
}

/** This page keeps its two columns inside the window and lets each scroll by itself, so the money controls stay beside the list. */
function Columns({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col gap-2 p-4">{children}</div>
}
