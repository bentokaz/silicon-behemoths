// How the company grows, on screen: the card that explains a locked place,
// the strip that announces a new one, the tree of everything there is to earn,
// and the executive seats.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { sfx } from '../audio/sfx'
import { fmtDate, hireExec } from '../sim/game'
import { CAPS, type CapId, type Capability, GROWTH_STAGES, type ReqState, START_WITH, type Where, capOf, capsOfExec, execAvailable, execNeeds, has, isNear, lockTip, needText, nextReq, ratioOf, reqsOf, vacantSeats } from '../sim/progress'
import { EXECS, TRAITS, execOf } from '../sim/staff'
import { EXEC_IDS, type Employee, type ExecId, type GameState } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { capName } from '../store/game'
import { type CardPlace, placeCard } from './CompanyFigures'
import { Icon, type IconName } from './icons'
import { Fold, Panel } from './ui'
import { Btn, Head, Help, IconBtn, type LockProps, Meter, Tag, money, num, pct, price, useLayer } from './ui'

const iconOf = (c: Capability) => c.icon as IconName
/** Where "take me there" leads for something that is open. */
const homeOf = (c: Capability): Where => c.home ?? { tab: c.tabs?.[0] ?? 'goals' }
const GROWTH: Where = { tab: 'goals', view: 'growth' }
const SEARCH: Where = { tab: 'staff', view: 'execs' }

/** The progression rules still spell a few things the way the screens were named before they were regrouped. This is how they read now. */
const plain = (text: string) => text.replace(/After-sales/g, 'Owners').replace(/ screen$/, ' page')

/** "3 of 5": the figures in the number face, the word between them not. */
function Of({ a, b, tail }: { a: string; b: string; tail?: string }) {
  return (
    <>
      <span className="num">{a}</span> of <span className="num">{b}</span>
      {tail ? ` ${tail}` : ''}
    </>
  )
}

function amount(r: ReqState): React.ReactNode {
  if (r.unit === 'money') return <Of a={money(r.have)} b={money(r.need)} />
  if (r.unit === 'pct') return <Of a={pct(r.have, 0)} b={pct(r.need, 0)} />
  if (r.need === 1) return r.done ? 'Done' : 'Not yet'
  return <Of a={num(r.have)} b={num(r.need)} />
}

/** A list of requirements with live progress. */
function Reqs({ list, mode }: { list: ReqState[]; mode: 'all' | 'any' }) {
  return (
    <div>
      <div className="label mb-1">{list.length < 2 ? 'What it takes' : mode === 'any' ? 'What it takes: any one of' : 'What it takes: all of'}</div>
      {list.map((r) => (
        <div key={r.label} className="border-b border-line py-[5px] last:border-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className={`flex items-center gap-[6px] text-xs leading-snug ${r.done ? 'text-pos' : 'text-fg'}`}>
              <Icon name={r.done ? 'check' : 'box'} size={r.done ? 11 : 8} className={r.done ? 'shrink-0' : 'mx-[1.5px] shrink-0 text-faint'} />
              {plain(r.label)}
            </span>
            <span className={`shrink-0 text-[11px] ${r.done ? 'text-pos' : 'text-dim'}`}>{amount(r)}</span>
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
        <div className="text-xs leading-relaxed text-fg">{plain(cap.what)}</div>
        <div className="mt-2 text-xs leading-snug text-dim">{plain(cap.why)}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {cap.opens.map((o) => (
            <Tag key={o}>{plain(o)}</Tag>
          ))}
        </div>
      </div>
      <div className="border-t border-line px-3 py-2">
        <Reqs list={reqsOf(g, cap.id)} mode={cap.mode} />
      </div>
      <div className="flex items-center justify-end border-t border-line px-3 py-2">
        {/* one way on: to where the next thing it takes is done, or to the list of everything */}
        <Btn small icon="arrowRight" title={next ? plain(next.label) : 'Everything still to open is under Company, Growth'} onClick={() => (close?.(), sfx.confirm(), go(next?.where ?? GROWTH))}>
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
        <span className="t-title block truncate">{capName(cap.id)}</span>
        <span className="label flex items-center gap-1">
          <Icon name="lock" size={10} />
          Not open yet
        </span>
      </span>
      {right}
    </div>
  )
}

/**
 * The card for a locked place: opened from the navigation, a hotkey's screen,
 * the city, or anything else that tried to go somewhere not yet earned. It
 * sits beside the item of the menu it was asked for from (or in the middle of
 * the screen when it was asked for elsewhere), always inside the window, clear
 * of the message strip and of an open drawer. Esc, or a click anywhere else,
 * closes it.
 */
export function LockCard() {
  const g = useGame()
  const card = useStore((s) => s.lockCard)
  const railOpen = useStore((s) => s.railOpen)
  const close = () => useStore.getState().showLock(null)
  const shown = !!card && !has(g, card.cap)
  const box = useRef<HTMLDivElement>(null)
  useLayer(shown, close, { box })
  const [place, setPlace] = useState<CardPlace | null>(null)
  const y = card?.y
  const capId = card?.cap
  useLayoutEffect(() => {
    if (!shown) return setPlace(null)
    const put = () => {
      const el = box.current
      if (!el) return
      const edge = (q: string, side: 'top' | 'bottom' | 'left' | 'right') => document.querySelector(q)?.getBoundingClientRect()[side]
      const next = placeCard({
        y,
        height: el.scrollHeight + 2,
        win: { w: window.innerWidth, h: window.innerHeight },
        rail: edge('[data-chrome="nav"]', 'right') ?? 0,
        top: edge('[data-chrome="top"]', 'bottom') ?? 0,
        bottom: edge('[data-chrome="strip"]', 'top') ?? window.innerHeight,
        right: edge('[data-layer="drawer"]', 'left') ?? window.innerWidth,
      })
      setPlace((was) => (was && was.left === next.left && was.top === next.top && was.width === next.width && was.maxHeight === next.maxHeight ? was : next))
    }
    put()
    window.addEventListener('resize', put)
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(put)
    if (box.current) watch?.observe(box.current)
    return () => (window.removeEventListener('resize', put), watch?.disconnect())
  }, [shown, y, capId, railOpen])
  useEffect(() => {
    if (!shown) return
    const away = (e: PointerEvent) => {
      const at = e.target as Element | null
      // the menu's own items open, change and close the card themselves
      if (!at || box.current?.contains(at) || at.closest?.('[data-chrome="nav"]')) return
      useStore.getState().showLock(null)
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [shown])
  if (!card || !shown) return null
  const cap = capOf(card.cap)
  const body = (
    <div ref={box} data-layer="lock-card" className="pointer-events-auto fixed z-40 overflow-y-auto border border-line2 bg-panel outline-none" style={place ? { left: place.left, top: place.top, width: place.width, maxHeight: place.maxHeight } : { left: 0, top: 0, width: 340, visibility: 'hidden' }} role="dialog" aria-label={`${capName(cap.id)}: not open yet`}>
      <CapHead cap={cap} right={<IconBtn icon="close" tone="ghost" title="Close (Esc)" onClick={close} />} />
      <CapBody g={g} cap={cap} close={close} />
    </div>
  )
  // it belongs with the other floating layers, in the frame's own place for them
  const host = typeof document !== 'undefined' ? document.getElementById('sb-drawer') : null
  return host ? createPortal(body, host) : body
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
  const name = capName(id)
  return (
    <button onClick={() => useStore.getState().showLock(id)} className="flex w-full shrink-0 items-center gap-2 border border-line bg-panel px-3 py-[6px] text-left hover:border-line2" title={`${name} is not open yet: ${plain(needText(g, id))}`}>
      <Icon name="lock" size={12} className="shrink-0 text-faint" />
      <span className="shrink-0 text-xs font-semibold text-fg">{name}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-dim">
        {cap.opens.map(plain).join(', ')}. Not open yet: {plain(needText(g, id))} first.
      </span>
      <span className="shrink-0 text-[11px] text-dim">What it takes</span>
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
  return { locked: plain(tip).replace(capOf(id).name, capName(id)), onLocked: card ? () => useStore.getState().showLock(id) : undefined }
}

// ---------------------------------------------------------------- the tree

function TreeCard({ g, cap }: { g: GameState; cap: Capability }) {
  const { go } = useStore.getState()
  const open = has(g, cap.id)
  const name = capName(cap.id)
  // what is already open is one quiet line: the name and the way there
  if (open) {
    const day = g.unlocks?.[cap.id]
    return (
      <div className="flex h-9 items-center gap-2 border border-line bg-panel pl-2 pr-1" title={`${plain(cap.what)}${day !== undefined ? ` Open since ${fmtDate(day)}.` : ''}`}>
        <Icon name={iconOf(cap)} size={15} className="shrink-0 text-dim" />
        <span className="min-w-0 flex-1 truncate text-xs text-fg">{name}</span>
        <Icon name="check" size={11} className="shrink-0 text-pos" />
        <Btn small tone="ghost" className="shrink-0" onClick={() => go(homeOf(cap))} title={`Go to ${name}`}>
          Go
        </Btn>
      </div>
    )
  }
  const near = isNear(g, cap.id)
  const next = nextReq(g, cap.id)
  return (
    <div className={`border bg-panel ${near ? 'border-line2' : 'border-line'}`}>
      <div className="flex items-center gap-2 px-2 py-[6px]">
        <Icon name={iconOf(cap)} size={15} className={near ? 'text-dim' : 'text-faint'} />
        <span className={`min-w-0 flex-1 truncate text-xs font-semibold ${near ? 'text-fg' : 'text-dim'}`}>{name}</span>
        {near ? <Tag tone="accent">Next</Tag> : <Tag icon="lock">Later</Tag>}
      </div>
      <div className="border-t border-line px-2 py-[6px]">
        <div className="text-xs leading-snug text-dim">{plain(cap.why)}</div>
        <div className="mt-2">
          <Reqs list={reqsOf(g, cap.id)} mode={cap.mode} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line py-1 pl-2 pr-1">
        <span className="truncate text-[11px] text-dim">
          <span className="num">{pct(ratioOf(g, cap.id), 0)}</span> of the way
        </span>
        {next?.where && (
          <Btn small tone={near ? 'default' : 'ghost'} icon="arrowRight" className="shrink-0" onClick={() => go(next.where!)} title={plain(next.label)}>
            Work on it
          </Btn>
        )}
      </div>
    </div>
  )
}

/** One executive seat on one line: its full title, and who holds it or why nobody does. */
function SeatChip({ g, id }: { g: GameState; id: ExecId }) {
  const { go } = useStore.getState()
  const def = EXECS[id]
  const holder = execOf(g, id)
  const vacant = !holder && !!g.execSeats?.[id]
  const ready = !holder && execAvailable(g, id) && g.execPool.some((e) => e.exec === id)
  const state = holder ? holder.name : vacant ? 'Seat empty' : ready ? 'Someone would join' : 'Not yet'
  return (
    <button onClick={() => go(SEARCH)} title={`${def.title} (${def.short}). ${def.effect}`} className={`flex h-8 min-w-0 items-center gap-2 border px-2 text-left text-xs hover:bg-hover ${vacant ? 'border-warn' : 'border-line'}`}>
      <span aria-hidden className="h-2 w-2 shrink-0 border border-line2" style={{ background: holder || ready ? def.color : 'transparent' }} />
      <span className={`min-w-0 flex-1 truncate ${holder || ready || vacant ? 'text-fg' : 'text-dim'}`}>{def.title}</span>
      <span className={`max-w-[45%] shrink-0 truncate text-[11px] ${vacant ? 'text-warn' : ready ? 'text-accent' : 'text-dim'}`}>{state}</span>
    </button>
  )
}

/** A stage of growth is opened out while something in it is within reach; what is all done, or all far off, is one line. */
function Stage({ g, stage }: { g: GameState; stage: number }) {
  const list = CAPS.filter((c) => c.stage === stage)
  const done = list.filter((c) => has(g, c.id)).length
  const reach = list.some((c) => isNear(g, c.id))
  return (
    <Fold
      title={GROWTH_STAGES[stage]}
      open={reach}
      keep={`growth:stage:${stage}`}
      right={
        <span className={`shrink-0 pr-1 text-[11px] ${done === list.length ? 'text-pos' : 'text-dim'}`}>
          <Of a={String(done)} b={String(list.length)} tail="open" />
        </span>
      }
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(236px,1fr))] items-start gap-2 p-2">
        {list.map((c) => (
          <TreeCard key={c.id} g={g} cap={c} />
        ))}
      </div>
    </Fold>
  )
}

/** Everything the company can grow into: what is open, what is next and what each takes. It is laid into the Growth page, under the goals. */
export function GrowthTree() {
  const g = useGame()
  const open = CAPS.filter((c) => has(g, c.id)).length
  // the seats are shown once there is something to say about one of them
  const seats = has(g, 'execs') || EXEC_IDS.some((id) => execOf(g, id) || g.execSeats?.[id])
  return (
    <>
      <Panel
        title="Company growth"
        icon="branch"
        className="shrink-0"
        right={
          <span className="pr-1 text-[11px] text-dim">
            <Of a={String(open)} b={String(CAPS.length)} tail="open" />
          </span>
        }
      >
        <div className="px-3 py-2">
          <Meter value={open} max={CAPS.length} />
          <div className="mt-2 text-xs leading-snug text-dim">Each part of the company opens once you have done what it takes. The ones marked Next are within reach now.</div>
          {seats && (
            <>
              <div className="label mb-1 mt-3">Executive seats</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-1">
                {EXEC_IDS.map((id) => (
                  <SeatChip key={id} g={g} id={id} />
                ))}
              </div>
            </>
          )}
        </div>
      </Panel>
      {[1, 2, 3, 4].map((stage) => (
        <Stage key={stage} g={g} stage={stage} />
      ))}
    </>
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

/** A skill out of a hundred with a short plain bar in front of it. */
function SkillMark({ value }: { value: number }) {
  return (
    <span className="flex shrink-0 items-center gap-2" title={`Skill ${Math.floor(value)} of 100`}>
      <Meter value={value} max={100} tone="dim" className="!w-10" />
      <span className="num w-5 text-right text-xs text-fg">{Math.floor(value)}</span>
    </span>
  )
}

/** One executive seat: its full title, what it does, and who holds it or would take it. */
function Seat({ g, id }: { g: GameState; id: ExecId }) {
  const hireOne = useHireExec()
  const def = EXECS[id]
  const holder = execOf(g, id)
  const seat = g.execSeats?.[id]
  const pool = g.execPool.filter((e) => e.exec === id)
  const needs = execNeeds(g, id)
  const toOpen = capsOfExec(id).filter((c) => !has(g, c.id))
  const vacated = !holder && !!seat
  return (
    <section className={`border ${vacated ? 'border-warn' : 'border-line'}`}>
      <header className="flex h-8 items-center justify-between gap-2 border-b border-line px-3">
        <span className="t-title flex min-w-0 items-center gap-2">
          <span aria-hidden className="h-2 w-2 shrink-0 border border-line2" style={{ background: def.color }} />
          <span className="truncate">{def.title}</span>
        </span>
        {vacated && <Tag tone="warn">Empty since {fmtDate(seat.vacant ?? g.day)}</Tag>}
      </header>
      <div className="px-3 py-2">
        <div className="text-[11px] leading-snug text-dim">
          {def.effect}
          {toOpen.length > 0 && ` Opens ${toOpen.map((c) => c.name).join(' and ')}.`}
          {vacated && <span className="text-warn"> {def.gap} Everything this seat opened stays open.</span>}
        </div>
        {holder && (
          <button type="button" title={`Open ${holder.name}`} className="mt-2 flex h-8 w-full items-center gap-3 border border-line px-2 text-left text-xs hover:border-line2 hover:bg-hover" onClick={() => useStore.getState().openPerson(holder.id)}>
            <span className="min-w-0 flex-1 truncate text-fg">{holder.name}</span>
            <SkillMark value={holder.skill} />
            <span className="num w-[76px] shrink-0 text-right text-dim" title="Salary a month">
              {price(holder.salary)}
            </span>
          </button>
        )}
        {!holder &&
          pool.map((e) => (
            <div key={e.id} className="mt-2 flex h-8 items-center gap-3 text-xs" title={e.traits.map((t) => TRAITS[t]?.name ?? t).join(', ') || undefined}>
              <span className="min-w-0 flex-1 truncate text-fg">{e.name}</span>
              <SkillMark value={e.skill} />
              <span className="num w-[76px] shrink-0 text-right text-dim" title="Salary a month. Signing costs one month of it.">
                {price(e.salary)}
              </span>
              <Btn small icon="hire" data-coach-target={`exec exec-${id}`} title={`Costs one month of salary, ${price(e.salary)}`} onClick={() => hireOne(e)}>
                Hire
              </Btn>
            </div>
          ))}
        {!holder && !pool.length && needs.some((r) => !r.done) && (
          <div className="mt-2">
            <div className="mb-1 text-[11px] leading-snug text-dim">Nobody will take this seat yet. They want to see a company that is ready for them.</div>
            <Reqs list={needs} mode="all" />
          </div>
        )}
        {!holder && !pool.length && !needs.some((r) => !r.done) && <div className="mt-2 text-[11px] leading-snug text-dim">The search is on. A shortlist arrives with the next batch of applicants.</div>}
      </div>
    </section>
  )
}

/** Executives, a view inside the People page: every seat, who holds it and who would take it. */
export function Executives() {
  const g = useGame()
  if (!has(g, 'execs')) return <LockedPane id="execs" />
  const gone = vacantSeats(g)
  const filled = EXEC_IDS.filter((id) => execOf(g, id)).length
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs text-dim">
          <span className="num text-fg">{filled}</span> of <span className="num text-fg">{EXEC_IDS.length}</span> seats filled.
          {gone.length > 0 && <span className="text-warn"> {gone.length === 1 ? 'One that was held is' : `${gone.length} that were held are`} empty.</span>}
        </span>
        <Help title="What executives do">An executive runs one side of the company. Each opens part of the business and lends everyone a modest lift in their field, more the more skilled they are. They are staff like anyone else: they need a desk, they like an executive desk of their own, rivals will try to lure them away, and they cost about twice the going rate. Signing one costs a month of their pay.</Help>
      </div>
      <div className="grid grid-cols-1 items-start gap-2 min-[900px]:grid-cols-2">
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
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-[6px] text-[11px] font-semibold text-dim">
          <Icon name="briefcase" size={11} />
          Executive search
        </span>
        <Btn small tone="ghost" onClick={() => (close?.(), useStore.getState().go(SEARCH))}>
          All seats
        </Btn>
      </div>
      {best.slice(0, 3).map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-2 border-b border-line py-[5px] last:border-0">
          <span className="min-w-0">
            <span className="block truncate text-xs text-fg">{e.name}</span>
            <span className="flex min-w-0 items-center gap-[6px] text-[11px] text-dim">
              <span aria-hidden className="h-2 w-2 shrink-0 border border-line2" style={{ background: EXECS[e.exec!].color }} />
              <span className="truncate">{EXECS[e.exec!].title}</span>
            </span>
            <span className="block text-[11px] text-dim">
              skill <span className="num text-fg">{Math.round(e.skill)}</span>, <span className="num text-fg">{price(e.salary)}</span> a month
            </span>
          </span>
          <Btn small className="shrink-0" title={`Costs one month of salary, ${price(e.salary)}`} onClick={() => hireOne(e)}>
            Hire
          </Btn>
        </div>
      ))}
    </div>
  )
}
