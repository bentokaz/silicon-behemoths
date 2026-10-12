// Owners: what used to be After-sales and "Fans and feedback", as one page.
// It leads with how owners feel and any recall waiting for a decision, then
// what they say, then support, then the warranty and the other policies.
import { type ReactNode, useState } from 'react'
import { sfx } from '../audio/sfx'
import { DAYS_PER_YEAR } from '../data/catalog'
import { RECALL_DEADLINE, fmtDate, player, recallProduct, setCare } from '../sim/game'
import { RECALL_FAULTS, RECALL_MIN_UNITS, TRADE_CREDIT, TRADE_PULL, UPDATE_YEARS, WARRANTY_YEARS, careBonus, planAttach, recallCost, repairBenches, updatesCost, warrantyLoad } from '../sim/care'
import { FAN_CYCLE, dailyTickets } from '../sim/growth'
import { storeStats } from '../sim/sites'
import { staffEffects } from '../sim/staff'
import type { Product } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { lockProps } from './Progress'
import { Icon } from './icons'
import { Btn, type Column, ConfirmBtn, Fold, Headline, Help, Legend, type LockProps, Meter, Page, Panel, Row, Slider, Strip, Table, Tag, int, money, num, pct, price } from './ui'

// ------------------------------------------------------------------ recall

/** A fault serious enough for a recall, waiting for the player: what each way out costs, and one button. */
function RecallCard({ p, lead }: { p: Product; lead: boolean }) {
  const g = useGame()
  const { act, say, focus } = useStore.getState()
  const cost = recallCost(p)
  const left = Math.max(0, RECALL_DEADLINE - (g.day - p.recall!.day))
  const short = g.cash < cost
  const recall = () => {
    const err = act((s) => recallProduct(s, p.id))
    if (err) return say(err, 'bad')
    sfx.confirm()
    say(`${p.name} was recalled and repaired for ${money(cost)}.`)
  }
  return (
    <section className="shrink-0 border border-warn bg-panel" aria-label={`Recall decision for ${p.name}`}>
      <header className="flex h-8 items-center gap-2 border-b border-line pl-3 pr-2">
        <Icon name="recall" size={13} className="shrink-0 text-warn" />
        <span className="t-title min-w-0 flex-1 truncate">
          Recall decision:{' '}
          <button type="button" className="underline-offset-2 hover:underline" title={`Open ${p.name}`} onClick={() => focus(p.id)}>
            {p.name}
          </button>
        </span>
        <span className="shrink-0 text-[11px] text-dim">
          <span className="num text-fg">{pct(p.defectRate)}</span> of units are faulty
        </span>
        <Tag tone="warn" icon="hourglass">
          {int(left)} days left
        </Tag>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-x-6 px-3 py-2">
        <div>
          <div className="text-xs font-semibold text-fg">Recall and repair</div>
          <div className="mt-[2px] text-xs leading-snug text-dim">
            All {num(p.unitsSold)} units sold are repaired for {money(cost)}, and the bill grows with every unit sold. Faults fall to 1% and brand reputation gains 1 point.
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-fg">Leave it</div>
          <div className="mt-[2px] text-xs leading-snug text-dim">
            After {fmtDate(p.recall!.day + RECALL_DEADLINE)} it becomes a scandal: brand reputation loses 5 points and {num(g.fans * 0.15)} fans leave. Its owners stay unhappy.
          </div>
        </div>
        <ConfirmBtn tone={lead ? 'primary' : 'default'} icon="recall" confirm={`Click again to pay ${money(cost)}`} disabled={short} title={short ? `Not enough cash: the recall costs ${money(cost)}.` : undefined} onClick={recall}>
          Recall for {money(cost)}
        </ConfirmBtn>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ policy

/** One policy: its name and its switch on a line, what it costs or does under it. */
function Policy({ title, note, children }: { title: string; note: ReactNode; children?: ReactNode }) {
  return (
    <div className="border-b border-line px-3 py-2 last:border-0">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <span className="whitespace-nowrap text-xs text-fg">{title}</span>
        {children}
      </div>
      <div className="mt-1 text-[11px] leading-snug text-dim">{note}</div>
    </div>
  )
}

/** A few options side by side, of which one is on. Locked, each is dashed and says what opens it. */
function Seg<T extends string | number | boolean>({ label, value, options, onChange, lock, off }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; lock: LockProps; /** Why the options that are not on cannot be chosen. */ off?: string | null }) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0">
      {options.map((o) => (
        <Btn key={String(o.value)} small active={value === o.value} disabled={!lock.locked && !!off && value !== o.value} title={off && value !== o.value ? off : undefined} onClick={() => value !== o.value && onChange(o.value)} {...lock} lockMark="corner" className={`-ml-px first:ml-0 ${lock.locked ? "min-w-11" : "min-w-8"}`}>
          {o.label}
        </Btn>
      ))}
    </div>
  )
}

const ON_OFF = [
  { value: false, label: 'Off' },
  { value: true, label: 'On' },
]

// ------------------------------------------------------------------ the page

interface Said {
  product: Product
  day: number
  stars: number
  text: string
}

export function CareScreen() {
  const g = useGame()
  const { act, say, focus, go } = useStore.getState()
  const [allSaid, setAllSaid] = useState(false)
  const c = g.care
  const m = c.last
  const set = (patch: Parameters<typeof setCare>[1], quiet = false) => {
    const err = act((s) => setCare(s, patch))
    if (err) say(err, 'bad')
    else if (!quiet) sfx.toggle()
  }
  const mine = g.products.filter((p) => p.companyId === 'player' && p.status === 'sale')
  const sat = mine.length ? mine.reduce((a, p) => a + p.satisfaction, 0) / mine.length : 0
  const open = g.products.filter((p) => p.companyId === 'player' && p.recall?.state === 'open').sort((a, b) => a.recall!.day - b.recall!.day)
  const benches = repairBenches(g)
  const canRefurb = !!g.factory || g.stores.some((st) => storeStats(st.site).repairs > 0)
  const tickets = dailyTickets(g)
  const capacity = staffEffects(g).support + 20
  const answered = Math.min(capacity, tickets)
  const unanswered = Math.round(tickets) - Math.round(answered)
  const said: Said[] = mine.flatMap((p) => p.feedback.map((f) => ({ ...f, product: p }))).sort((a, b) => b.day - a.day).slice(0, 30)
  // until the policy opens, every lever is shown as it stands but cannot be moved
  const lock = lockProps(g, 'carePolicy')
  const fanYears = Math.round((FAN_CYCLE / DAYS_PER_YEAR) * 10) / 10

  const cols: Column<Product>[] = [
    {
      id: 'device',
      head: 'Device',
      sort: (p) => p.name,
      cell: (p) => (
        <span className="flex items-center gap-2 text-fg">
          <span className="min-w-0 truncate">{p.name}</span>
          {p.recall?.state === 'open' && <Tag tone="warn">Recall open</Tag>}
          {p.recall?.state === 'done' && <Tag tone="pos">Recalled</Tag>}
          {p.recall?.state === 'ignored' && <Tag tone="neg">Scandal</Tag>}
        </span>
      ),
    },
    {
      id: 'sat',
      head: 'Satisfaction',
      min: 150,
      sort: (p) => p.satisfaction,
      first: 'asc',
      cell: (p) => (
        <span className="flex items-center gap-2">
          <Meter value={p.satisfaction} tone={p.satisfaction > 0.7 ? 'pos' : p.satisfaction >= 0.5 ? 'dim' : 'neg'} />
          <span className="num w-9 shrink-0 text-right text-fg">{pct(p.satisfaction, 0)}</span>
        </span>
      ),
    },
    { id: 'review', head: 'Review', title: 'The average review score, out of 10', num: true, min: 72, drop: 2, sort: (p) => p.reviewAvg, cell: (p) => <span className="text-dim">{p.reviewAvg.toFixed(1)}</span> },
    {
      id: 'faults',
      head: 'Faults',
      title: `The share of units that develop a fault. Over ${pct(RECALL_FAULTS, 0)} with ${int(RECALL_MIN_UNITS)} units sold, a recall has to be decided.`,
      num: true,
      min: 72,
      drop: 1,
      sort: (p) => p.defectRate,
      cell: (p) => <span className={p.defectRate > 0.03 ? 'text-warn' : 'text-dim'}>{pct(p.defectRate)}</span>,
    },
  ]

  return (
    <Page keep="owners">
      <div className="flex shrink-0 items-stretch gap-2">
        <div className="w-[240px] shrink-0">
          <Headline label="Owner satisfaction" icon="morale" value={mine.length ? pct(sat, 0) : 'Not yet'} sub={mine.length ? (mine.length === 1 ? 'of the one device on sale' : `average of ${int(mine.length)} devices on sale`) : 'no device is on sale'} tone={!mine.length ? undefined : sat > 0.7 ? 'pos' : sat >= 0.5 ? undefined : 'warn'} />
        </div>
        <Strip
          className="flex min-w-0 flex-1 flex-col justify-center"
          items={[
            { label: 'Owners', value: num(g.owners), icon: 'staff', title: 'People using your devices' },
            { label: 'Fans', value: num(g.fans), icon: 'heart', title: `Owners who come back: a fan buys again about every ${fanYears} years` },
            { label: 'Brand reputation', value: int(Math.round(player(g).brand * 100)), icon: 'brand', title: 'Out of 100. Moved by review scores, recalls and scandals.' },
            { label: 'Appeal from policy', value: `+${pct(careBonus(g))}`, icon: 'shield', title: 'Buyers trust what is backed. The warranty, software updates and trade-in add this much to the appeal of every device.' },
          ]}
        />
      </div>

      {open.map((p, i) => (
        <RecallCard key={p.id} p={p} lead={i === 0} />
      ))}

      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_clamp(300px,34%,400px)] items-start gap-2">
        <div className="flex min-w-0 flex-col gap-2">
          <Panel title="How owners feel" icon="morale" right={mine.length > 0 ? <Legend className="pr-1" items={[{ label: 'Over 70%', tone: 'pos' }, { label: 'Under 50%', tone: 'neg' }]} /> : undefined}>
            <Table label="Owner satisfaction by device" cols={cols} rows={mine} rowKey={(p) => p.id} keep="owners:devices" onRow={(p) => focus(p.id)} rowTitle={(p) => `Open ${p.name}`} empty="Owner satisfaction appears once a device is on sale." />
          </Panel>
          <Panel
            title="What owners say"
            icon="review"
            right={
              said.length > 8 ? (
                <Btn small tone="ghost" aria-expanded={allSaid} onClick={() => setAllSaid(!allSaid)}>
                  {allSaid ? 'Show fewer' : `Show all ${int(said.length)}`}
                </Btn>
              ) : undefined
            }
          >
            {said.length === 0 && <div className="px-3 py-6 text-center text-xs text-dim">Owner comments arrive weekly once a device is selling. They point at what to fix in the next model.</div>}
            {(allSaid ? said : said.slice(0, 8)).map((f, i) => (
              <button key={i} type="button" onClick={() => focus(f.product.id)} title={`${f.stars} out of 5, ${fmtDate(f.day)}. Open ${f.product.name}.`} className="flex min-h-8 w-full items-center gap-3 border-b border-line px-3 py-1 text-left last:border-0 hover:bg-hover">
                <span className={`num flex w-7 shrink-0 items-center gap-1 text-xs ${f.stars >= 4 ? 'text-pos' : f.stars <= 2 ? 'text-neg' : 'text-dim'}`}>
                  <Icon name="star" size={11} />
                  {f.stars}
                </span>
                <span className="min-w-0 flex-1 text-xs text-fg">{f.text}</span>
                <span className="max-w-[40%] shrink-0 truncate text-[11px] text-dim">{f.product.name}</span>
              </button>
            ))}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <Panel
            title="Support"
            icon="headset"
            bodyClass="px-3 py-2"
            right={
              <Help title="How support works">
                <p>Owners raise tickets every day, more of them when devices are faulty. Owners who get no answer are less satisfied.</p>
                <p className="mt-2">A support agent answers about 120 tickets a day. A Head of Support makes the help desk answer up to 40% more. A support bar in a store raises satisfaction as well.</p>
              </Help>
            }
          >
            <div className="flex items-center gap-3">
              <span className="shrink-0 text-xs text-dim">Tickets answered a day</span>
              <Meter value={answered} max={Math.max(tickets, 1)} tone={unanswered > 0 ? 'neg' : 'pos'} />
              <span className="shrink-0 text-xs text-dim">
                <span className="num text-fg">{int(Math.round(answered))}</span> of <span className="num text-fg">{int(Math.round(tickets))}</span>
              </span>
            </div>
            {unanswered > 0 && (
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[11px] leading-snug text-dim">Owners who get no answer are less satisfied.</span>
                <Btn small icon="hire" className="shrink-0" onClick={() => go({ tab: 'staff', view: 'hire', role: 'support' })}>
                  Hire support
                </Btn>
              </div>
            )}
          </Panel>

          <Panel
            title="Warranty and policy"
            icon="shield"
            right={
              <Help title="How the policies work">
                <p>Every faulty unit is repaired at your cost while it is under warranty. A longer warranty costs more per fault, makes owners happier and makes buyers trust you.</p>
                <p className="mt-2">Software updates keep owners happy and bring them back. The bill grows with every device in use.</p>
                <p className="mt-2">
                  Keep the fault rate under {pct(RECALL_FAULTS, 0)}: test stations and a control room in the factory do that. Above it, once {int(RECALL_MIN_UNITS)} units are sold, a recall has to be decided.
                </p>
              </Help>
            }
          >
            {lock.locked && (
              <button type="button" onClick={lock.onLocked} className="flex w-full items-start gap-2 border-b border-line px-3 py-2 text-left text-[11px] leading-snug text-dim hover:bg-hover hover:text-fg">
                <Icon name="lock" size={12} className="mt-[1px] shrink-0 text-faint" />
                <span>{lock.locked}</span>
              </button>
            )}
            <Policy
              title="Warranty, years"
              note={
                <>
                  A faulty unit costs {pct(warrantyLoad(g), 0)} of its build cost to repair.{benches > 0 && ` Repair benches in your stores cut that by ${pct(Math.min(0.3, benches * 0.06), 0)}.`}
                </>
              }
            >
              <Seg label="Warranty, years" value={c.warrantyYears} options={WARRANTY_YEARS.map((y) => ({ value: y, label: int(y) }))} onChange={(y) => set({ warrantyYears: y })} lock={lock} />
            </Policy>
            <Policy title="Updates, years" note={`${money(updatesCost(g))} a month at today's number of owners.`}>
              <Seg label="Software updates, years" value={c.updateYears} options={UPDATE_YEARS.map((y) => ({ value: y, label: int(y) }))} onChange={(y) => set({ updateYears: y })} lock={lock} />
            </Policy>
            <Policy title="Trade-in" note={`Fans get credit for their old device and upgrade about ${pct(TRADE_PULL - 1, 0)} sooner. Each of those sales costs ${pct(TRADE_CREDIT, 0)} of the price.`}>
              <Seg label="Trade-in" value={c.tradeIn} options={ON_OFF} onChange={(v) => set({ tradeIn: v })} lock={lock} />
            </Policy>
            {(c.tradeIn || c.refurb) && (
              <Policy title="Refurbish trade-ins" note={canRefurb || c.refurb ? 'Traded-in devices are repaired and sold on, earning back most of the credit.' : 'Needs a factory or a store with a repair bench.'}>
                <Seg label="Refurbish trade-ins" value={c.refurb} options={ON_OFF} onChange={(v) => set({ refurb: v })} lock={lock} off={canRefurb || c.refurb ? null : 'Refurbishing needs a factory or a store with a repair bench.'} />
              </Policy>
            )}
            <Policy
              title="Care plan"
              note={
                c.plan ? (
                  <>
                    <span className="num text-fg">{num(c.subscribers)}</span> members. {pct(planAttach(g, sat || 0.6))} of owners would join at this price. About two fifths of the income goes back out on claims.
                  </>
                ) : (
                  `A monthly subscription that covers accidents. ${pct(planAttach(g, sat || 0.6))} of owners would join at ${price(c.planPrice)} a month.`
                )
              }
            >
              <Seg label="Care plan" value={c.plan} options={ON_OFF} onChange={(v) => set({ plan: v })} lock={lock} />
            </Policy>
            {c.plan && (
              <div className="border-b border-line px-3 py-1 last:border-0">
                <Slider {...lock} label="Care plan price a month" icon="tag" value={c.planPrice} min={2} max={40} step={1} format={(v) => price(v)} onChange={(v) => set({ planPrice: v }, true)} />
              </div>
            )}
          </Panel>

          <Fold title="Last month" icon="receipt" open={false} keep="owners:last" bodyClass="px-3 py-1">
            <Row k="Repairs" v={num(m.repairs)} />
            <Row k="Repair bill" v={money(m.repairCost)} />
            <Row k="Software updates" v={money(m.updates)} />
            {(c.tradeIn || m.tradeIns > 0) && <Row k="Trade-ins" v={num(m.tradeIns)} />}
            {(c.refurb || m.refurbIncome > 0) && <Row k="Refurbished sales" v={money(m.refurbIncome)} />}
            {(c.plan || m.planIncome > 0) && <Row k="Care plan income" v={money(m.planIncome)} />}
          </Fold>
        </div>
      </div>
    </Page>
  )
}
