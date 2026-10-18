// Company, Overview: four things and nothing else. Cash, last month's profit,
// what needs the player (grouped, each item with its place and one action),
// and the company's devices with reorder.
import { useState } from 'react'
import { sfx } from '../audio/sfx'
import { DAYS_PER_MONTH } from '../data/catalog'
import { fmtDate, monthLabel } from '../sim/game'
import { nextGoals } from '../sim/goals'
import type { Attention } from '../sim/insight'
import type { GameState } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { PLACE_NAME, cashThisMonth, cashTrend, monthFigures, needsYou, placeOf, placeReorders, reorderPlan, reorderable } from './CompanyFigures'
import { MyDevices } from './Devices'
import { Icon } from './icons'
import { Btn, ConfirmBtn, Headline, Page, Panel, Spark, Stat, money, moneyDelta, num, pct } from './ui'

/** How many items the list shows before the rest go behind "more". */
const SHOWN = 4

/** One thing that needs the player: its tone, what it is, where it is, and the one thing to do about it. */
function Need({ g, item }: { g: GameState; item: Attention }) {
  const { act, say, go, focus, openPerson } = useStore.getState()
  const [open, setOpen] = useState(false)
  const products = (item.productIds ?? []).map((id) => g.products.find((p) => p.id === id)).filter((p) => !!p)
  const people = (item.personIds ?? []).map((id) => g.staff.find((e) => e.id === id)).filter((e) => !!e)
  const behind = products.length + people.length
  // a single device or person is named in the sentence already: the list is for several
  const lists = behind > 1
  const plan = reorderable(item) ? reorderPlan(g, item.productIds ?? []) : null
  const reorder = () => {
    if (!plan) return
    const taken = act((s) => placeReorders(s, plan))
    if (!taken) return say('The orders could not be placed.', 'bad')
    sfx.cash()
    say(`Ordered ${num(plan.units)} units of ${taken === 1 ? plan.lines[0].name : `${taken} devices`}, about ${money(plan.cost)}. You pay as they are built.`)
  }
  const tone = item.tone === 'neg' ? 'text-neg' : 'text-warn'
  return (
    <li className="border-b border-line last:border-0">
      <div className="flex min-h-9 items-center gap-2 py-1 pl-3 pr-2">
        <Icon name="alert" size={13} className={`shrink-0 ${tone}`} />
        {lists ? (
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} title={open ? 'Hide the list' : 'Show which ones'} className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs leading-snug text-fg hover:text-accent">
            <span className="min-w-0">{item.text}</span>
            <Icon name={open ? 'chevronUp' : 'chevronDown'} size={10} className="shrink-0 text-dim" />
          </button>
        ) : (
          <span className="min-w-0 flex-1 text-xs leading-snug text-fg">{item.text}</span>
        )}
        <span className="shrink-0 text-[11px] text-dim" title={`This is at the ${PLACE_NAME[item.place]} in the city`}>
          {PLACE_NAME[item.place]}
        </span>
        {plan && plan.lines.length > 0 ? (
          <ConfirmBtn small tone="default" icon="truck" className="shrink-0" confirm={`Order for about ${money(plan.cost)}?`} title={`Order the suggested run of ${plan.lines.length === 1 ? plan.lines[0].name : `each of ${plan.lines.length} devices`}: ${num(plan.units)} units, about ${money(plan.cost)}, paid as they are built.`} onClick={reorder}>
            {plan.lines.length === 1 ? 'Reorder' : 'Reorder all'}
          </ConfirmBtn>
        ) : (
          <Btn small icon="arrowRight" className="shrink-0" onClick={() => (products.length === 1 && people.length === 0 ? focus(products[0].id) : go(placeOf(item)))}>
            Open
          </Btn>
        )}
      </div>
      {lists && open && (
        <ul className="border-t border-line bg-carbon py-1">
          {products.map((p) => {
            const line = plan?.lines.find((l) => l.id === p.id)
            return (
              <li key={p.id}>
                <button type="button" onClick={() => focus(p.id)} className="flex h-7 w-full items-center justify-between gap-3 pl-8 pr-3 text-left text-xs text-dim hover:bg-hover hover:text-fg">
                  <span className="min-w-0 truncate">{p.name}</span>
                  {line && (
                    <span className="shrink-0 text-[11px]">
                      <span className="num">{num(line.units)}</span> units, <span className="num">{money(line.cost)}</span>
                    </span>
                  )}
                </button>
              </li>
            )
          })}
          {people.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => openPerson(e.id)} className="flex h-7 w-full items-center pl-8 pr-3 text-left text-xs text-dim hover:bg-hover hover:text-fg">
                <span className="min-w-0 truncate">{e.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function NeedsYou({ g }: { g: GameState }) {
  const list = needsYou(g)
  const [all, setAll] = useState(false)
  const shown = all ? list : list.slice(0, SHOWN)
  return (
    <Panel title="Needs you" icon="alert" info="Everything that is costing you sales or people right now, worst first, each with where it is and the one thing to do about it. Nothing here means the company can run on its own for a while." count={list.length || undefined} className="shrink-0">
      {list.length === 0 ? (
        <div className="flex h-9 items-center gap-2 px-3 text-xs text-dim">
          <Icon name="check" size={13} className="shrink-0 text-pos" />
          Nothing needs you.
        </div>
      ) : (
        <>
          <ul>
            {shown.map((item) => (
              <Need key={item.id} g={g} item={item} />
            ))}
          </ul>
          {list.length > SHOWN && (
            <div className="border-t border-line px-1 py-1">
              <Btn small tone="ghost" onClick={() => setAll(!all)}>
                {all ? 'Show fewer' : `${list.length - SHOWN} more`}
              </Btn>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

export function Dashboard() {
  const g = useGame()
  const { go } = useStore.getState()
  const f = monthFigures(g)
  const free = g.config.unlimitedMoney
  const debt = g.cash < 0 && !free
  const moved = cashThisMonth(g)
  const sold = g.reports.some((r) => r.revenue > 0) || g.cur.revenue > 0
  const goal = nextGoals(g, 1)[0]
  const closes = (Math.floor(g.day / DAYS_PER_MONTH) + 1) * DAYS_PER_MONTH
  return (
    <Page keep="overview">
      <div className="grid shrink-0 grid-cols-2 gap-3">
        <Headline
          label="Cash"
          icon="cash"
          info="Money in the bank. Below zero the company runs on its overdraft; stay in debt too long and it goes bankrupt. Click the cash figure at the top for where it comes from."
          tone={debt ? 'neg' : undefined}
          value={
            <span className="flex items-end justify-between gap-3">
              <span>{free ? 'Unlimited' : money(g.cash)}</span>
              {!free && <Spark values={cashTrend(g)} width={120} height={24} tone={debt ? 'neg' : 'accent'} title="Cash at the end of each of the last twelve months, and today" />}
            </span>
          }
          sub={free ? 'Money is not counted in this game' : debt ? `In debt for ${g.debtDays} ${g.debtDays === 1 ? 'day' : 'days'}` : g.reports.length ? `${moneyDelta(moved)} since ${monthLabel(f.month)} closed` : g.day > 0 ? `${moneyDelta(moved)} since the start` : 'What you start with'}
        />
        {f.partial ? (
          <Stat label="Profit, this month so far" icon="trendUp" info="Income from sales and anything else that came in, less every cost of the month: salaries, production, marketing, research, buildings, overheads and interest." value={sold ? money(f.profit) : <span className="font-sans">No sales yet</span>} tone={sold ? (f.profit >= 0 ? 'pos' : 'neg') : undefined} sub={`The first month closes on ${fmtDate(closes)}`} />
        ) : (
          <Stat label={`Profit, ${monthLabel(f.month)}`} info="Income from sales and anything else that came in, less every cost of the month: salaries, production, marketing, research, buildings, overheads and interest." icon={f.profit >= 0 ? 'trendUp' : 'trendDown'} value={money(f.profit)} tone={f.profit >= 0 ? 'pos' : 'neg'} sub={`Income ${money(f.income)}, costs ${money(f.costs)}`} />
        )}
      </div>

      <NeedsYou g={g} />

      <Panel title="Your devices" icon="devices" className="shrink-0">
        <MyDevices compact limit={6} />
      </Panel>

      {goal && (
        <button type="button" onClick={() => go({ tab: 'goals', view: 'goals' })} className="flex shrink-0 items-center gap-2 self-start px-1 text-left text-[11px] text-dim hover:text-fg" title="Every goal, and what the company can still grow into, is under Company, Growth">
          <Icon name="goals" size={11} className="shrink-0" />
          <span>
            Next goal: {goal.goal.name}, {pct(goal.progress, 0)} of the way
          </span>
        </button>
      )}
    </Page>
  )
}
