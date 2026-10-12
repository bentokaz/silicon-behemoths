// How the company grows, on screen: the card that explains a locked place,
// the strip that announces a new one, the tree of everything there is to earn,
// and the executive seats.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { sfx } from '../audio/sfx'
import { fmtDate, hireExec } from '../sim/game'
import { CAPS, type CapId, type Capability, GROWTH_STAGES, type ReqState, START_WITH, type Where, capOf, capsOfExec, execAvailable, execNeeds, has, isNear, lockTip, needText, nextReq, ratioOf, reqsOf, vacantSeats } from '../sim/progress'
import { EXECS, TRAITS, execOf } from '../sim/staff'
import { EXEC_IDS, type Employee, type ExecId, type GameState } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Icon, type IconName } from './icons'
import { Btn, Head, IconBtn, type LockProps, Meter, Tag, money, num, pct, useLayer } from './ui'

const iconOf = (c: Capability) => c.icon as IconName
/** Where "take me there" leads for something that is open. */
const homeOf = (c: Capability): Where => c.home ?? { tab: c.tabs?.[0] ?? 'goals' }
const GROWTH: Where = { tab: 'goals', view: 'growth' }
const SEARCH: Where = { tab: 'staff', view: 'execs' }

function amount(r: ReqState): string {
  if (r.unit === 'money') return `${money(r.have, 1)} / ${money(r.need, 0)}`
  if (r.unit === 'pct') return `${pct(r.have, 0)} / ${pct(r.need, 0)}`
  if (r.need === 1) return r.done ? 'done' : 'not yet'
  return `${num(r.have)} / ${num(r.need)}`
}

/** A list of requirements with live progress. */
function Reqs({ list, mode }: { list: ReqState[]; mode: 'all' | 'any' }) {
  return (
    <div>
      <div className="label mb-1 text-faint">{list.length < 2 ? 'What it takes' : mode === 'any' ? 'What it takes: any one of' : 'What it takes: all of'}</div>
      {list.map((r) => (
        <div key={r.label} className="border-b border-line py-[5px] last:border-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className={`flex items-center gap-[6px] text-[11px] leading-snug ${r.done ? 'text-pos' : 'text-fg'}`}>
              <Icon name={r.done ? 'check' : 'box'} size={r.done ? 11 : 8} className={r.done ? 'shrink-0' : 'mx-[1.5px] shrink-0 text-faint'} />
              {r.label}
            </span>
            <span className={`num shrink-0 text-[11px] ${r.done ? 'text-pos' : 'text-dim'}`}>{amount(r)}</span>
          </div>
          {r.need > 1 && !r.done && <Meter value={r.have} max={r.need} className="mt-[3px]" />}
        </div>
      ))}
    </div>
  )
}

/** What a capability is, why it matters and what it takes. Shared by the floating card and the in-screen pane. */
function CapBody({ g, cap, close }: { g: GameState; cap: Capability; close?: () => void }) {
  const { go } = useStore.getState()
  const next = nextReq(g, cap.id)
  return (
    <>
      <div className="px-3 py-2">
        <div className="text-[12px] leading-relaxed text-fg">{cap.what}</div>
        <div className="mt-2 text-[11px] leading-snug text-dim">{cap.why}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {cap.opens.map((o) => (
            <Tag key={o}>{o}</Tag>
          ))}
        </div>
      </div>
      <div className="border-t border-line px-3 py-2">
        <Reqs list={reqsOf(g, cap.id)} mode={cap.mode} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
        <span className="text-[11px] text-faint">Everything still to open is under Company, Growth.</span>
        {/* one way on: to where the next thing it takes is done, or to the list of everything */}
        <Btn small icon="arrowRight" onClick={() => (close?.(), sfx.confirm(), go(next?.where ?? GROWTH))}>
          Show me how
        </Btn>
      </div>
    </>
  )
}

function CapHead({ cap, right }: { cap: Capability; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-3 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-line2 text-dim">
        <Icon name={iconOf(cap)} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold text-fg">{cap.name}</span>
        <span className="label flex items-center gap-1 text-faint">
          <Icon name="lock" size={9} />
          Not open yet
        </span>
      </span>
      {right}
    </div>
  )
}

/**
 * The card for a locked place: opened from the navigation, a hotkey's screen,
 * the city, or anything else that tried to go somewhere not yet earned.
 */
export function LockCard() {
  const g = useGame()
  const card = useStore((s) => s.lockCard)
  const railOpen = useStore((s) => s.railOpen)
  const close = () => useStore.getState().showLock(null)
  const shown = !!card && !has(g, card.cap)
  const box = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  useLayer(shown, close, { box })
  // where it was asked for is a place in the window; the card is placed in its own frame, which starts lower when a notice sits above the game
  const [frame, setFrame] = useState({ top: 0, height: 0 })
  useLayoutEffect(() => {
    const r = host.current?.getBoundingClientRect()
    if (r) setFrame((was) => (was.top === r.top && was.height === r.height ? was : { top: r.top, height: r.height }))
  }, [shown, card?.y])
  if (!card || !shown) return null
  const cap = capOf(card.cap)
  // beside the navigation when it was asked for there, otherwise over the middle of the screen
  const style = card.y !== undefined ? { left: (railOpen ? 172 : 52) + 8, top: Math.max(48, Math.min(card.y - frame.top - 24, (frame.height || window.innerHeight) - 420)), maxHeight: 'calc(100% - 56px)' } : { left: '50%', top: 76, transform: 'translateX(-50%)', maxHeight: 'calc(100% - 84px)' }
  return (
    <div ref={host} className="absolute inset-0 z-40" onClick={close}>
      <div ref={box} className="absolute w-[340px] max-w-[calc(100%-16px)] overflow-y-auto border border-line2 bg-panel outline-none" style={style} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${cap.name}: not open yet`}>
        <CapHead cap={cap} right={<IconBtn icon="close" tone="ghost" title="Close (Esc)" onClick={close} />} />
        <CapBody g={g} cap={cap} close={close} />
      </div>
    </div>
  )
}

/** The same explanation, filling the part of a screen that is not open yet. */
export function LockedPane({ id }: { id: CapId }) {
  const g = useGame()
  const cap = capOf(id)
  return (
    <div className="flex h-full min-h-48 items-center justify-center p-4">
      <div className="w-[380px] max-w-full border border-line bg-panel">
        <CapHead cap={cap} />
        <CapBody g={g} cap={cap} />
      </div>
    </div>
  )
}

/** One line across a screen whose controls are partly locked: what is missing, and a way to see what it takes. */
export function LockNote({ id }: { id: CapId }) {
  const g = useGame()
  if (has(g, id)) return null
  const cap = capOf(id)
  return (
    <button onClick={() => useStore.getState().showLock(id)} className="flex w-full shrink-0 items-center gap-2 border border-line bg-panel px-3 py-[6px] text-left hover:border-line2" title={`${cap.name} is not open yet: ${needText(g, id)}`}>
      <Icon name="lock" size={12} className="shrink-0 text-faint" />
      <span className="shrink-0 text-[11px] font-semibold text-fg">{cap.name}</span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-dim">
        {cap.opens.join(', ')}. Not open yet: {needText(g, id)} first.
      </span>
      <span className="label shrink-0 text-faint">What it takes</span>
    </button>
  )
}

/**
 * What to hand a control that belongs to a capability, so that while the
 * capability is locked the control is dimmed behind a lock, says what opens
 * it, and a click shows the card instead of doing anything. Nothing once it
 * is open. Pass `card: false` where leaving the screen would lose work.
 */
export function lockProps(g: GameState, id: CapId, card = true): LockProps {
  const tip = lockTip(g, id)
  if (!tip) return {}
  return { locked: tip, onLocked: card ? () => useStore.getState().showLock(id) : undefined }
}

// ---------------------------------------------------------------- the tree

function TreeCard({ g, cap }: { g: GameState; cap: Capability }) {
  const { go } = useStore.getState()
  const open = has(g, cap.id)
  const near = !open && isNear(g, cap.id)
  const next = nextReq(g, cap.id)
  const day = g.unlocks?.[cap.id]
  return (
    <div className={`border bg-panel ${open ? 'border-line2' : near ? 'border-accent/50' : 'border-line'}`}>
      <div className="flex items-center gap-2 px-2 py-[6px]">
        <Icon name={iconOf(cap)} size={15} className={open ? 'text-accent' : near ? 'text-dim' : 'text-faint'} />
        <span className={`min-w-0 flex-1 truncate text-[11px] font-semibold ${open ? 'text-fg' : near ? 'text-fg' : 'text-dim'}`}>{cap.name}</span>
        {open ? (
          <Tag tone="pos" icon="check">
            open
          </Tag>
        ) : near ? (
          <Tag tone="accent" icon="hourglass">
            next
          </Tag>
        ) : (
          <Tag icon="lock">later</Tag>
        )}
      </div>
      <div className="border-t border-line px-2 py-[6px]">
        <div className={`text-[11px] leading-snug ${open ? 'text-dim' : 'text-dim'}`}>{open ? cap.what : cap.why}</div>
        {!open && (
          <div className="mt-2">
            <Reqs list={reqsOf(g, cap.id)} mode={cap.mode} />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-[5px]">
        <span className="num truncate text-[11px] text-faint">{open ? (day !== undefined ? `since ${fmtDate(day)}` : '') : `${pct(ratioOf(g, cap.id), 0)} of the way`}</span>
        {open ? (
          <Btn small tone="ghost" icon="arrowRight" className="shrink-0 whitespace-nowrap" onClick={() => go(homeOf(cap))}>
            Go
          </Btn>
        ) : (
          next?.where && (
            <Btn small tone={near ? 'default' : 'ghost'} icon="arrowRight" className="shrink-0 whitespace-nowrap" onClick={() => go(next.where!)} title={next.label}>
              Work on it
            </Btn>
          )
        )}
      </div>
    </div>
  )
}

function SeatChip({ g, id }: { g: GameState; id: ExecId }) {
  const { go } = useStore.getState()
  const def = EXECS[id]
  const holder = execOf(g, id)
  const vacant = !holder && !!g.execSeats?.[id]
  const ready = !holder && execAvailable(g, id) && g.execPool.some((e) => e.exec === id)
  return (
    <button onClick={() => go(SEARCH)} title={`${def.title}. ${def.effect}`} className={`min-w-0 border px-2 py-[5px] text-left hover:bg-hover ${vacant ? 'border-warn/60' : holder ? 'border-line2' : ready ? 'border-accent/50' : 'border-line'}`}>
      <span className="flex items-center justify-between gap-1">
        <span className="num text-[11px]" style={{ color: holder || ready ? def.color : undefined }}>
          {def.short}
        </span>
        <Icon name={holder ? 'check' : vacant ? 'alert' : ready ? 'hire' : 'lock'} size={10} className={holder ? 'text-pos' : vacant ? 'text-warn' : ready ? 'text-accent' : 'text-faint'} />
      </span>
      <span className={`block truncate text-[11px] ${holder ? 'text-fg' : vacant ? 'text-warn' : ready ? 'text-dim' : 'text-faint'}`}>{holder ? holder.name : vacant ? 'Seat empty' : ready ? 'Would join' : 'Not yet'}</span>
    </button>
  )
}

/** Everything the company can grow into: what is open, what is next and what each takes. */
export function GrowthTree() {
  const g = useGame()
  const open = CAPS.filter((c) => has(g, c.id)).length
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] gap-2">
        <div className="border border-line bg-panel p-3">
          <div className="flex items-baseline justify-between">
            <Head icon="branch" className="text-faint">
              Company growth
            </Head>
            <span className="num text-[13px] text-fg">
              {open} <span className="text-faint">of {CAPS.length} open</span>
            </span>
          </div>
          <Meter value={open} max={CAPS.length} className="mt-2" />
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="label mr-1 text-faint">{GROWTH_STAGES[0]}</span>
            {START_WITH.map((x) => (
              <Tag key={x} tone="pos">
                {x}
              </Tag>
            ))}
          </div>
        </div>
        <div className="border border-line bg-panel p-3">
          <Head icon="briefcase" className="mb-2 text-faint">
            Executive seats
          </Head>
          <div className="grid grid-cols-7 gap-1">
            {EXEC_IDS.map((id) => (
              <SeatChip key={id} g={g} id={id} />
            ))}
          </div>
        </div>
      </div>
      {/* one band for each stage of growth, read from the top down; cards keep a readable width at any size */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {[1, 2, 3, 4].map((stage) => {
          const list = CAPS.filter((c) => c.stage === stage)
          const done = list.filter((c) => has(g, c.id)).length
          return (
            <section key={stage} className="border border-line bg-carbon">
              <header className="flex h-8 items-center justify-between border-b border-line bg-panel px-2">
                <span className="flex items-center gap-2 text-[11px] font-semibold text-fg">
                  <span className={`h-3 w-[3px] ${done ? 'bg-accent' : 'bg-line2'}`} />
                  <span className="num text-faint">{stage}</span>
                  {GROWTH_STAGES[stage]}
                </span>
                <span className={`num text-[11px] ${done === list.length ? 'text-pos' : 'text-faint'}`}>
                  {done} / {list.length} open
                </span>
              </header>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(236px,1fr))] items-start gap-2 p-2">
                {list.map((c) => (
                  <TreeCard key={c.id} g={g} cap={c} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- executives

function useHireExec() {
  const { act, say } = useStore.getState()
  return (e: Employee) => {
    const err = act((s) => hireExec(s, e.id))
    if (err) say(err, 'bad')
    else (sfx.hire(), say(`${e.name} joined as ${e.exec ? EXECS[e.exec].title : 'an executive'}.`))
  }
}

function Seat({ g, id }: { g: GameState; id: ExecId }) {
  const hireOne = useHireExec()
  const def = EXECS[id]
  const holder = execOf(g, id)
  const seat = g.execSeats?.[id]
  const pool = g.execPool.filter((e) => e.exec === id)
  const needs = execNeeds(g, id)
  const runs = capsOfExec(id)
  return (
    <div className={`border bg-panel ${!holder && seat ? 'border-warn/60' : 'border-line'}`}>
      <div className="flex items-center gap-2 border-b border-line px-2 py-[6px]">
        <span className="num flex h-6 w-9 shrink-0 items-center justify-center border text-[11px]" style={{ borderColor: def.color, color: def.color }}>
          {def.short}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold text-fg">{def.title}</span>
          <span className="block truncate text-[11px] text-dim" title={def.effect}>
            {def.effect}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {runs.map((c) => (
            <Tag key={c.id} tone={has(g, c.id) ? 'pos' : 'dim'} icon={has(g, c.id) ? 'check' : 'lock'}>
              {c.name}
            </Tag>
          ))}
        </span>
      </div>
      <div className="px-2 py-[6px]">
        {holder ? (
          <button className="flex w-full items-center gap-3 text-left hover:text-accent" onClick={() => useStore.getState().openPerson(holder.id)}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] text-fg">{holder.name}</span>
              <span className="num block text-[11px] text-dim">
                skill {Math.floor(holder.skill)} / {money(holder.salary, 0)} a month / morale {Math.round(holder.morale)}
              </span>
            </span>
            <Tag tone="pos" icon="check">
              in the seat
            </Tag>
          </button>
        ) : (
          <>
            {seat && (
              <div className="mb-1 flex items-start gap-[6px] text-[11px] leading-snug text-warn">
                <Icon name="alert" size={12} className="mt-[1px] shrink-0" />
                <span>
                  Empty since {fmtDate(seat.vacant ?? g.day)}. {def.gap} Everything this seat opened stays open.
                </span>
              </div>
            )}
            {pool.map((e) => (
              <div key={e.id} className="flex items-center gap-3 border-b border-line py-[5px] last:border-0">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[12px] text-fg">{e.name}</span>
                    {e.traits.map((t) => (
                      <span key={t} title={TRAITS[t]?.note}>
                        <Tag>{TRAITS[t]?.name ?? t}</Tag>
                      </span>
                    ))}
                  </span>
                  <span className="mt-[3px] flex items-center gap-2">
                    <Meter value={e.skill} max={100} tone={e.skill >= 75 ? 'pos' : 'accent'} className="!w-20" />
                    <span className="num text-[11px] text-dim">
                      skill {Math.floor(e.skill)} / {money(e.salary, 0)} a month
                    </span>
                  </span>
                </span>
                <Btn small tone="primary" icon="hire" data-coach-target={`exec exec-${id}`} onClick={() => hireOne(e)}>
                  Hire
                </Btn>
              </div>
            ))}
            {!pool.length && needs.some((r) => !r.done) && (
              <div>
                <div className="mb-1 text-[11px] leading-snug text-dim">Nobody will take this seat yet. They want to see a company that is ready for them.</div>
                <Reqs list={needs} mode="all" />
              </div>
            )}
            {!pool.length && !needs.some((r) => !r.done) && <div className="text-[11px] text-dim">The search is on. A shortlist arrives with the next batch of applicants.</div>}
          </>
        )}
      </div>
    </div>
  )
}

/** The Executives view of the Staff screen: every seat, who holds it and who would take it. */
export function Executives() {
  const g = useGame()
  if (!has(g, 'execs')) return <LockedPane id="execs" />
  const gone = vacantSeats(g)
  return (
    <div className="p-2">
      <div className="mb-2 max-w-[760px] text-[11px] leading-snug text-dim">
        An executive runs one side of the company. Each opens part of the business and lends everyone a modest lift in their field, more the more skilled they are. They are staff like anyone else: they need a desk, they like an executive desk of their own, rivals will try to lure them away, and they cost about twice the going rate. Signing one costs a month of their pay.
        {gone.length > 0 && <span className="text-warn"> {gone.length === 1 ? 'One seat is' : `${gone.length} seats are`} empty.</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {EXEC_IDS.map((id) => (
          <Seat key={id} g={g} id={id} />
        ))}
      </div>
    </div>
  )
}

/** The best candidate for each seat that could be filled today, for the reception card. */
export function ExecShortlist({ close }: { close?: () => void }) {
  const g = useGame()
  const hireOne = useHireExec()
  if (!has(g, 'execs')) return null
  const best = EXEC_IDS.map((id) => g.execPool.filter((e) => e.exec === id).sort((a, b) => b.skill - a.skill)[0]).filter((e): e is Employee => !!e)
  if (!best.length) return null
  return (
    <div className="mt-2 border-t border-line2 pt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-[6px] text-[11px] text-dim">
          <Icon name="briefcase" size={11} />
          Executive search
        </span>
        <button className="text-[11px] text-faint hover:text-accent" onClick={() => (close?.(), useStore.getState().go(SEARCH))}>
          All seats
        </button>
      </div>
      {best.slice(0, 3).map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-2 border-b border-line py-[5px] last:border-0">
          <span className="min-w-0">
            <span className="block truncate text-[11px] text-fg">{e.name}</span>
            <span className="block truncate text-[11px]" style={{ color: EXECS[e.exec!].color }}>
              {EXECS[e.exec!].title}
            </span>
            <span className="num block text-[11px] text-faint">
              skill {Math.round(e.skill)} / {money(e.salary, 0)} a month
            </span>
          </span>
          <Btn small tone="primary" className="shrink-0" onClick={() => hireOne(e)}>
            Hire
          </Btn>
        </div>
      ))}
    </div>
  )
}
