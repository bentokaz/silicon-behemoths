// Research, page "Technology": the tree and the one project being looked at.
// One trunk per track climbing level by level, features branching off, dashed
// links where a level also needs another track. What is already owned is
// folded into one stub per track, so the tree opens on what can be done next.
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useLayoutEffect, useRef } from 'react'
import { sfx } from '../audio/sfx'
import { FEATURES, type FeatureInfo, MAX_LEVEL, TRACK_INFO, TRUNK_REQS, featureCost, marketLevel, researchCost } from '../data/catalog'
import { researchItem, setResearchBudget, toggleResearch, trunkBlocked } from '../sim/game'
import { staffEffects } from '../sim/staff'
import { type GameState, TRACKS, type Track } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Icon, trackIcon } from './icons'
import { researchBudgetFor, researchDays, researchPerDay, runningResearch, timeSpan as span } from './researchNow'
import { Btn, Help, IconBtn, Lead, Legend, Meter, Panel, Row, int, money, pct, useKept } from './ui'

// ---------------------------------------------------------------- the geometry of the tree

const LABEL_W = 136
const COL_W = 164
const NODE_W = 144
const NODE_H = 44
const FEAT_W = 128
const FEAT_H = 30
const FEAT_IN = 28
const HEAD_H = 24
const PAD = 12
const BAND = 6 + NODE_H + 6
const BAND_FEAT = BAND + FEAT_H + 6

type Sel = { kind: 'trunk'; track: Track; level: number } | { kind: 'feature'; id: string }
type NodeState = 'owned' | 'open' | 'running' | 'blocked' | 'future'

function trunkState(g: GameState, t: Track, level: number): NodeState {
  if (level <= g.levels[t]) return 'owned'
  if (level > g.levels[t] + 1) return 'future'
  if (trunkBlocked(g, t, level)) return 'blocked'
  return g.activeResearch.includes(t) ? 'running' : 'open'
}
function featureState(g: GameState, f: FeatureInfo): NodeState {
  if (g.features.includes(f.id)) return 'owned'
  if (g.levels[f.track] < f.level) return 'future'
  return g.activeResearch.includes(`f:${f.id}`) ? 'running' : 'open'
}

/** How a node looks. What is owned is the quietest thing in the tree; what can be done next wears the accent; what is being done is filled. */
const NODE_LOOK: Record<NodeState, string> = {
  owned: 'border-line bg-panel text-dim',
  open: 'border-accent bg-panel text-fg',
  running: 'border-accent bg-accent/10 text-fg',
  blocked: 'border-dashed border-warn bg-panel text-dim',
  future: 'border-dashed border-line2 bg-panel text-faint',
}

// ---------------------------------------------------------------- the budget

/** The step the budget moves in at a given size: fine when small, coarse when large. */
const budgetStep = (v: number) => (v < 1e6 ? 10e3 : v < 5e6 ? 50e3 : v < 20e6 ? 100e3 : 500e3)
const snap = (v: number) => Math.round(v / budgetStep(v)) * budgetStep(v)
/** A round figure at or above `v`, to two figures. */
function roundUp(v: number): number {
  const unit = Math.pow(10, Math.floor(Math.log10(Math.max(1, v))) - 1)
  return Math.ceil(v / unit) * unit
}

/**
 * The monthly budget. The slider is finer at the low end, where the first
 * projects are paid for, and the range marked on it is where the project in
 * hand is finished in six months to two years.
 */
function BudgetSlider({ value, max, mark, onChange }: { value: number; max: number; mark: [number, number] | null; onChange: (v: number) => void }) {
  // position along the slider, 0 to 1: the square root of the share of the top budget
  const at = (v: number) => Math.sqrt(Math.max(0, Math.min(1, v / max)))
  const set = (v: number) => onChange(Math.max(0, Math.min(max, snap(v))))
  const keys = (e: ReactKeyboardEvent) => {
    const step = budgetStep(value)
    const to = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? value + step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? value - budgetStep(value - 1) : e.key === 'PageUp' ? value + step * 10 : e.key === 'PageDown' ? value - step * 10 : e.key === 'Home' ? 0 : e.key === 'End' ? max : null
    if (to === null) return
    e.preventDefault()
    set(to)
  }
  // the thumb is 6px wide: its centre travels from 3px to 3px short of the end
  const x = (p: number) => `calc(3px + (100% - 6px) * ${p.toFixed(4)})`
  return (
    <div className="relative h-[14px]">
      {mark && mark[0] < max && (
        <div aria-hidden className="pointer-events-none absolute top-[4px] h-[6px] bg-mute" style={{ left: x(at(mark[0])), right: `calc(100% - ${x(at(mark[1]))})` }} />
      )}
      <input type="range" aria-label="Monthly research budget" aria-valuetext={money(value)} className="absolute inset-0 w-full" min={0} max={1000} step={1} value={Math.round(at(value) * 1000)} onKeyDown={keys} onChange={(e) => set(max * Math.pow(Number(e.target.value) / 1000, 2))} />
    </div>
  )
}

// ---------------------------------------------------------------- the screen

export function Research() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const [opened, setOpened] = useKept<Track[]>('research:opened', [])
  const [picked, setPicked] = useKept<Sel>('research:node', () => {
    const t = TRACKS.find((k) => g.levels[k] < MAX_LEVEL && researchItem(g, k).available) ?? TRACKS[0]
    return { kind: 'trunk', track: t, level: Math.min(MAX_LEVEL, g.levels[t] + 1) }
  })
  const scroller = useRef<HTMLDivElement>(null)

  // ---- which levels are on show
  const ownedFeatures = (t: Track) => FEATURES.filter((f) => f.track === t && g.features.includes(f.id)).length
  /** A track with nothing behind it has nothing to fold. */
  const foldable = (t: Track) => g.levels[t] > 0 || ownedFeatures(t) > 0
  const isOpen = (t: Track) => opened.includes(t) || !foldable(t)
  const base = TRACKS.some((t) => opened.includes(t) && foldable(t)) ? 0 : Math.min(...TRACKS.map((t) => g.levels[t]))
  const colX = (level: number) => PAD + (level - base) * COL_W

  // a level that has been folded away since it was picked gives way to the next one of its track
  const sel: Sel = (() => {
    if (picked.kind === 'trunk') return !isOpen(picked.track) && picked.level <= g.levels[picked.track] ? { kind: 'trunk', track: picked.track, level: Math.min(MAX_LEVEL, g.levels[picked.track] + 1) } : picked
    const f = FEATURES.find((x) => x.id === picked.id)
    if (!f) return { kind: 'trunk', track: TRACKS[0], level: Math.min(MAX_LEVEL, g.levels[TRACKS[0]] + 1) }
    return !isOpen(f.track) && g.features.includes(f.id) ? { kind: 'trunk', track: f.track, level: Math.min(MAX_LEVEL, g.levels[f.track] + 1) } : picked
  })()

  // ---- where each feature sits: under its own level in an open track; in a folded one, only those still to do, in a row from the stub
  const featCol = new Map<string, number>()
  for (const t of TRACKS) {
    const mine = FEATURES.filter((f) => f.track === t).sort((a, b) => a.level - b.level)
    if (isOpen(t)) {
      const used = new Set<number>()
      for (const f of mine) {
        let col = f.level
        while (used.has(col)) col++
        used.add(col)
        featCol.set(f.id, col)
      }
      continue
    }
    let last = -1
    for (const f of mine) {
      if (g.features.includes(f.id)) continue
      last = Math.max(f.level, g.levels[t], last + 1)
      featCol.set(f.id, last)
    }
  }
  const shown = FEATURES.filter((f) => featCol.has(f.id))
  const tops: number[] = []
  let height = 0
  for (const t of TRACKS) {
    tops.push(height)
    height += shown.some((f) => f.track === t) ? BAND_FEAT : BAND
  }
  const row = (t: Track) => tops[TRACKS.indexOf(t)]
  const trunkY = (t: Track) => row(t) + 6
  const featY = (t: Track) => trunkY(t) + NODE_H + 6
  const lastCol = Math.max(MAX_LEVEL, ...featCol.values())
  const width = colX(lastCol) + NODE_W + PAD
  /** The first level of a track that has a box of its own. */
  const firstCol = (t: Track) => (isOpen(t) ? 0 : g.levels[t])
  /** The box that stands for a level: its own, or the stub it is folded into. */
  const boxCol = (t: Track, level: number) => Math.max(level, firstCol(t))

  // ---- open on the frontier, with the picked node in view
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollLeft = 0
    const node = el.querySelector<HTMLElement>('[data-picked]')
    if (!node) return
    const r = node.getBoundingClientRect()
    const s = el.getBoundingClientRect()
    if (r.right > s.left + el.clientWidth - PAD) el.scrollLeft += Math.min(r.right - (s.left + el.clientWidth - PAD), r.left - (s.left + LABEL_W + PAD))
    if (r.bottom > s.top + el.clientHeight - PAD) el.scrollTop += Math.min(r.bottom - (s.top + el.clientHeight - PAD), r.top - (s.top + HEAD_H + PAD))
    else if (r.top < s.top + HEAD_H) el.scrollTop -= s.top + HEAD_H + PAD - r.top
  }, [base])

  const toggle = (id: string) => {
    const was = g.activeResearch.includes(id)
    const paid = g.progress[id] ?? 0
    const name = runningResearch(g).find((p) => p.id === id)?.name
    const err = act((s) => toggleResearch(s, id))
    if (err) return say(err, 'bad')
    sfx.confirm()
    if (was) say(paid > 0 ? `Stopped ${name}. The ${money(paid)} already paid is kept for when you start it again.` : `Stopped ${name}.`)
  }
  const fold = (t: Track, open: boolean) => {
    setOpened(open ? [...opened.filter((k) => k !== t), t] : opened.filter((k) => k !== t))
    setPicked({ kind: 'trunk', track: t, level: open ? g.levels[t] : Math.min(MAX_LEVEL, g.levels[t] + 1) })
  }

  // ---- connector lines
  const QUIET = 'var(--color-line2)'
  const lines: ReactNode[] = []
  for (const t of TRACKS) {
    const y = trunkY(t) + NODE_H / 2
    // what is behind a stub: a line coming in from the left
    if (!isOpen(t) && g.levels[t] > base) lines.push(<line key={`${t}in`} x1={0} y1={y} x2={colX(g.levels[t])} y2={y} stroke="var(--color-line)" strokeWidth={1} />)
    for (let l = firstCol(t); l < MAX_LEVEL; l++) lines.push(<line key={`${t}${l}`} x1={colX(l) + NODE_W} y1={y} x2={colX(l + 1)} y2={y} stroke={l < g.levels[t] ? 'var(--color-line)' : QUIET} strokeWidth={1} />)
    // a level that also needs another track
    for (const [lvl, req] of Object.entries(TRUNK_REQS[t] ?? {})) {
      const level = Number(lvl)
      if (level <= g.levels[t]) continue
      for (const k of TRACKS) {
        const need = req[k]
        if (need === undefined) continue
        // one that is already met says nothing. What is drawn is what holds up the very next level, and what the picked level still needs.
        if (g.levels[k] >= need) continue
        if (level !== g.levels[t] + 1 && !(sel.kind === 'trunk' && sel.track === t && sel.level === level)) continue
        const down = TRACKS.indexOf(k) < TRACKS.indexOf(t)
        const x1 = colX(boxCol(k, need)) + NODE_W / 2 + 22
        const y1 = trunkY(k) + (down ? NODE_H : 0)
        const x2 = colX(level) + NODE_W / 2 - 22
        const y2 = trunkY(t) + (down ? 0 : NODE_H)
        const mid = (y1 + y2) / 2
        // in the warning colour when it is what holds up the very next level
        const stroke = level === g.levels[t] + 1 ? 'var(--color-warn)' : 'var(--color-mute)'
        lines.push(
          <g key={`${t}${lvl}${k}`}>
            <path d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`} fill="none" stroke={stroke} strokeWidth={1} strokeDasharray="4 3" />
            <rect x={x2 - 2.5} y={y2 - 2.5} width={5} height={5} fill={stroke} />
          </g>,
        )
      }
    }
  }
  for (const f of shown) {
    const col = featCol.get(f.id)!
    // from its own level when it sits under it, otherwise along the row from the stub
    const from = col === f.level ? col : boxCol(f.track, f.level)
    const x = colX(from) + 14
    lines.push(<path key={f.id} d={`M${x},${trunkY(f.track) + NODE_H} V${featY(f.track) + FEAT_H / 2} H${colX(col) + FEAT_IN}`} fill="none" stroke={g.features.includes(f.id) ? 'var(--color-line)' : QUIET} strokeWidth={1} />)
  }
  const industry = marketLevel(g.day)
  const industryX = colX(industry) + NODE_W / 2

  // ---- the picked node
  const detail = (() => {
    if (sel.kind === 'feature') {
      const f = FEATURES.find((x) => x.id === sel.id)!
      const state = featureState(g, f)
      const item = researchItem(g, `f:${f.id}`)
      return { id: item.id, icon: trackIcon(f.track), title: f.name, sub: f.note, state, cost: featureCost(f), why: state === 'future' ? `${item.blocked}.` : `A branch of ${TRACK_INFO[f.track].name} level ${f.level}.` }
    }
    const state = trunkState(g, sel.track, sel.level)
    const blocked = trunkBlocked(g, sel.track, sel.level)
    const why = state === 'owned' ? '' : state === 'future' ? `Research ${TRACK_INFO[sel.track].name} level ${sel.level - 1} first.${blocked ? ` ${blocked}.` : ''}` : blocked ? `${blocked}.` : ''
    return { id: sel.track as string, icon: trackIcon(sel.track), title: `${TRACK_INFO[sel.track].name} level ${sel.level}`, sub: TRACK_INFO[sel.track].unlocks[sel.level], state, cost: sel.level === 0 ? 0 : researchCost(sel.level), why }
  })()
  const startable = detail.state === 'open'
  const live = detail.state === 'open' || detail.state === 'running'
  const paid = live ? (g.progress[detail.id] ?? 0) : 0

  // ---- time against the budget
  const running = runningResearch(g)
  const fx = staffEffects(g)
  // the project the slider is read against: the picked one when it can be worked on, else the slowest one running
  const sharing = g.activeResearch.length + (startable ? 1 : 0)
  const slowest = running.reduce<(typeof running)[number] | null>((a, p) => (!a || (p.daysLeft ?? 0) > (a.daysLeft ?? 0) ? p : a), null)
  const ref = live ? detail.id : (slowest?.id ?? null)
  const days = ref ? researchDays(g, ref, g.rdBudget, sharing) : null
  const dearest = Math.max(...TRACKS.map((t) => (g.levels[t] < MAX_LEVEL ? researchCost(g.levels[t] + 1) : 0)))
  const budgetMax = roundUp(Math.max(1e6, dearest, g.rdBudget))
  const mark: [number, number] | null = ref ? [researchBudgetFor(g, ref, 720, sharing), researchBudgetFor(g, ref, 180, sharing)] : null
  const runway = g.rdBudget > 0 ? g.cash / g.rdBudget : Infinity
  const others = sharing - 1

  const timeLine = (() => {
    if (!ref) return g.rdBudget > 0 ? { warn: true, text: 'No project is running, so none of this is spent. Pick one in the tree and start it.' } : { warn: false, text: 'Pick a project in the tree to see how long a budget takes.' }
    if (days === null) return { warn: g.activeResearch.length > 0, text: g.activeResearch.length > 0 ? 'Nothing moves at $0 a month. Slide to set a budget.' : 'Slide to set a budget and see how long this takes.' }
    const share = others > 0 ? `, sharing the budget with ${int(others)} other ${others === 1 ? 'project' : 'projects'}` : ''
    if (startable) return { warn: false, text: `Started now, this is done in about ${span(days)}${share}.` }
    if (detail.state === 'running') return { warn: false, text: `Done in about ${span(days)}${share}.` }
    return { warn: false, text: `What is running is done in about ${span(days)}.` }
  })()

  // ---- one box of the tree
  const box = (key: string, state: NodeState, on: boolean, x: number, y: number, w: number, h: number, title: string, onClick: () => void, body: ReactNode, share?: number) => (
    <button key={key} type="button" data-picked={on ? '' : undefined} aria-pressed={on} onClick={onClick} title={title} className={`absolute overflow-hidden border px-2 text-left transition-colors hover:border-fg ${NODE_LOOK[state]} ${on ? 'outline outline-1 outline-offset-2 outline-accent' : ''}`} style={{ left: x, top: y, width: w, height: h }}>
      {share !== undefined && <span aria-hidden className="absolute inset-y-0 left-0 bg-accent/30" style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />}
      <span className="relative flex h-full flex-col justify-center">{body}</span>
    </button>
  )
  const NAME = 'line-clamp-2 text-xs leading-[13px]'
  const STATUS = 'whitespace-nowrap text-[11px] leading-[14px]'

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] gap-2 p-4">
      <Panel
        title="Technology tree"
        icon="research"
        bodyClass="flex flex-col"
        right={
          <Help title="How research works">
            <p>Each row is a track that climbs level by level. A higher level brings better parts to the designer. The smaller boxes are optional features that branch off a level.</p>
            <p className="mt-2">A dashed link means a level also needs another track to have reached a level first. The dashed upright line is where the leading rivals are today.</p>
            <p className="mt-2">The monthly budget is split evenly between the projects that are running. Stopping a project keeps what has been paid into it.</p>
            <div className="mt-2 border-t border-line pt-1">
              <Row k="Research staff" v={fx.research === 1 ? 'no effect' : `${fx.research > 1 ? '+' : ''}${pct(fx.research - 1, 0)} speed`} tone={fx.research > 1 ? 'text-pos' : fx.research < 1 ? 'text-neg' : undefined} />
              <Row k="Each project gets, a month" v={money(researchPerDay(g) * 30)} />
              <Row k="Spent this month" v={money(g.cur.rd)} />
            </div>
          </Help>
        }
      >
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
          <div className="flex" style={{ width: LABEL_W + width }}>
            {/* the names of the tracks stay put while the tree is moved sideways */}
            <div className="sticky left-0 z-[3] shrink-0 border-r border-line bg-panel" style={{ width: LABEL_W }}>
              <div className="sticky top-0 z-[1] border-b border-line bg-panel" style={{ height: HEAD_H }} />
              <div className="relative" style={{ height }}>
                {TRACKS.map((t) => (
                  <div key={t} className="absolute left-0 flex w-full items-start gap-1 border-t border-line pl-3 pr-1 first:border-t-0" style={{ top: row(t), height: (tops[TRACKS.indexOf(t) + 1] ?? height) - row(t), paddingTop: 9 }}>
                    <Icon name={trackIcon(t)} size={14} className="mt-[1px] shrink-0 text-dim" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold leading-[15px] text-fg">{TRACK_INFO[t].name}</div>
                      <div className="text-[11px] text-dim">{`Level ${g.levels[t]} of ${MAX_LEVEL}`}</div>
                    </div>
                    {opened.includes(t) && foldable(t) && <IconBtn small icon="minus" tone="ghost" title={`Fold the owned levels of ${TRACK_INFO[t].name} away`} onClick={() => fold(t, false)} />}
                  </div>
                ))}
              </div>
            </div>
            <div className="shrink-0" style={{ width }}>
              <div className="sticky top-0 z-[2] border-b border-line bg-panel" style={{ height: HEAD_H }}>
                <div className="relative h-full">
                  {Array.from({ length: MAX_LEVEL - base + 1 }, (_, i) => base + i).map((l) => (
                    <div key={l} className="label absolute top-[5px]" style={{ left: colX(l) }}>
                      {`Level ${l}`}
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative" style={{ height }}>
                {TRACKS.map((t, i) => i > 0 && <div key={t} className="absolute left-0 w-full border-t border-line" style={{ top: row(t) }} />)}
                <svg width={width} height={height} className="absolute inset-0" aria-hidden>
                  {industry >= base - 0.4 && <line x1={industryX} y1={0} x2={industryX} y2={height} stroke="var(--color-dim)" strokeWidth={1} strokeDasharray="2 4" />}
                  {lines}
                </svg>
                {TRACKS.map((t) => {
                  const lv = g.levels[t]
                  const open = isOpen(t)
                  return Array.from({ length: MAX_LEVEL - firstCol(t) + 1 }, (_, i) => firstCol(t) + i).map((l) => {
                    const st = trunkState(g, t, l)
                    const name = TRACK_INFO[t].unlocks[l]
                    // the stub: everything this track already has, in one box that opens
                    if (!open && l === lv)
                      return box(`${t}${l}`, 'owned', false, colX(l), trunkY(t), NODE_W, NODE_H, `${TRACK_INFO[t].name}: show the owned levels`, () => fold(t, true), (
                        <>
                          <span className={NAME}>{name}</span>
                          <span className={STATUS}>
                            <Lead icon="plus" size={9} />
                            {lv === 0 ? 'Level 0 owned' : `Levels 0 to ${lv} owned`}
                          </span>
                        </>
                      ))
                    const on = sel.kind === 'trunk' && sel.track === t && sel.level === l
                    const share = st === 'running' ? (g.progress[t] ?? 0) / researchCost(l) : undefined
                    const need = st === 'blocked' ? TRACKS.find((k) => (TRUNK_REQS[t]?.[l]?.[k] ?? 0) > g.levels[k]) : undefined
                    return box(`${t}${l}`, st, on, colX(l), trunkY(t), NODE_W, NODE_H, `${TRACK_INFO[t].name} level ${l}: ${name}`, () => setPicked({ kind: 'trunk', track: t, level: l }), (
                      <>
                        <span className={NAME}>{name}</span>
                        {st === 'running' ? (
                          <span className={STATUS}>{`${pct(share ?? 0, 0)} paid`}</span>
                        ) : st === 'blocked' && need ? (
                          <span className={`${STATUS} text-warn`}>
                            <Lead icon="lock" size={10} />
                            {`${TRACK_INFO[need].name} level ${TRUNK_REQS[t]![l]![need]}`}
                          </span>
                        ) : st === 'open' ? (
                          // only what can be started now wears its price; the rest say theirs when picked
                          <span className={`${STATUS} num`}>{money(researchCost(l))}</span>
                        ) : null}
                      </>
                    ), share)
                  })
                })}
                {shown.map((f) => {
                  const st = featureState(g, f)
                  const id = `f:${f.id}`
                  const on = sel.kind === 'feature' && sel.id === f.id
                  const share = st === 'running' ? (g.progress[id] ?? 0) / featureCost(f) : undefined
                  return box(id, st, on, colX(featCol.get(f.id)!) + FEAT_IN, featY(f.track), FEAT_W, FEAT_H, `${f.name}: ${f.note}`, () => setPicked({ kind: 'feature', id: f.id }), <span className="line-clamp-2 text-[11px] leading-[13px]">{f.name}</span>, share)
                })}
              </div>
            </div>
          </div>
        </div>
        <Legend
          className="shrink-0 border-t border-line px-3 py-[6px]"
          items={[
            { label: 'Owned', color: OUTLINE('var(--color-mute)') },
            { label: 'Can be researched', color: OUTLINE('var(--color-accent)') },
            { label: 'Being researched', tone: 'accent' },
            { label: 'Needs another track', color: OUTLINE('var(--color-warn)') },
            { label: 'Leading rivals', color: UPRIGHT('var(--color-dim)') },
          ]}
        />
      </Panel>

      <div className="flex min-h-0 flex-col gap-2">
        <Panel title={detail.title} icon={detail.icon} selected className="shrink-0" bodyClass="px-3 py-2">
          <div className="text-xs text-fg">{detail.sub}</div>
          {detail.why && <div className={`mt-[2px] text-xs leading-snug ${detail.state === 'blocked' || detail.state === 'future' ? 'text-warn' : 'text-dim'}`}>{detail.why}</div>}
          <div className="mt-1">
            {detail.state === 'owned' ? (
              <div className="py-[3px] text-xs text-dim">
                <Lead icon="check" />
                You own this.
              </div>
            ) : (
              <Row k={paid > 0 ? `Cost, ${pct(paid / detail.cost, 0)} paid` : 'Cost'} v={money(detail.cost)} />
            )}
          </div>
          {/* the budget and the start: what the guide's research step points at */}
          <div data-coach-target="research" className="mt-2 border-t border-line pt-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-dim">Research budget, a month</span>
              <span className="num text-[13px] font-semibold text-fg">{money(g.rdBudget)}</span>
            </div>
            <div className="mt-1">
              <BudgetSlider value={g.rdBudget} max={budgetMax} mark={mark} onChange={(v) => {
                  const err = act((s) => setResearchBudget(s, v))
                  if (err) useStore.getState().say(err, 'bad')
                }}
              />
            </div>
            <div className={`mt-1 min-h-[30px] text-[11px] leading-[15px] ${timeLine.warn ? 'text-warn' : 'text-dim'}`}>{timeLine.text}</div>
            {mark && (
              <div className="flex items-center gap-[6px] text-[11px] text-dim">
                <span aria-hidden className="h-[6px] w-3 shrink-0 bg-mute" />
                Marked: done in 6 months to 2 years.
              </div>
            )}
            {runway < 12 && (
              <div className="mt-1 text-[11px] leading-[15px] text-warn">
                <Lead icon="alert" />
                {runway < 1 ? 'That is more than all your cash in one month.' : `That is all your cash in ${span(Math.floor(runway) * 30)}, before any income.`}
              </div>
            )}
            {detail.state === 'running' ? (
              <div className="mt-2 flex h-9 items-center gap-2 border border-line px-3 text-xs text-dim">
                <Icon name="play" size={12} className="shrink-0 text-accent" />
                Being researched. Stop it in the list below.
              </div>
            ) : detail.state !== 'owned' ? (
              <Btn tone="primary" large icon={startable ? 'play' : 'lock'} className="mt-2 w-full" disabled={!startable} title={startable ? undefined : detail.why} onClick={() => toggle(detail.id)}>
                Start research
              </Btn>
            ) : null}
          </div>
        </Panel>

        <Panel title="Running" icon="play" count={running.length || undefined} className="min-h-[72px]" bodyClass="overflow-y-auto">
          {running.length === 0 && <div className="px-3 py-2 text-xs text-dim">Nothing is being researched.</div>}
          {running.map((p) => (
            <div key={p.id} className="flex items-center gap-2 border-b border-line py-[6px] pl-3 pr-1 last:border-0">
              <button type="button" className="min-w-0 flex-1 text-left" title="Show it in the tree" onClick={() => setPicked(p.id.startsWith('f:') ? { kind: 'feature', id: p.id.slice(2) } : { kind: 'trunk', track: p.id as Track, level: Math.min(MAX_LEVEL, g.levels[p.id as Track] + 1) })}>
                <div className="text-xs leading-[15px] text-fg">{p.name}</div>
                <div className="mt-[2px] flex items-center gap-2">
                  <Meter value={p.progress} />
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-dim">{`${pct(p.progress, 0)}${p.daysLeft !== null ? `, ${span(p.daysLeft)} left` : ''}`}</span>
                </div>
              </button>
              <Btn small tone="ghost" icon="stop" title={`Stop researching ${p.name}. What is paid is kept.`} onClick={() => toggle(p.id)}>
                Stop
              </Btn>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  )
}

// A legend mark is a small square of one colour. An outlined box and an upright
// line are drawn with the same square: the colour, with the panel showing through.
const OUTLINE = (color: string) => `linear-gradient(var(--color-panel), var(--color-panel)) center / 6px 6px no-repeat, ${color}`
const UPRIGHT = (color: string) => `linear-gradient(${color}, ${color}) center / 2px 100% no-repeat`
