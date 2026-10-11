// Research as a branching tree: one trunk per track, features branching off
// trunk levels, and dashed links where one track depends on another.
import { useState } from 'react'
import { sfx } from '../audio/sfx'
import { FEATURES, MAX_LEVEL, TRACK_INFO, TRUNK_REQS, featureCost, marketLevel, researchCost } from '../data/catalog'
import { researchItem, toggleResearch, trunkBlocked } from '../sim/game'
import { staffEffects } from '../sim/staff'
import { type GameState, TRACKS, type Track } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Icon, trackIcon } from './icons'
import { Btn, IconBtn, Lead, Meter, Panel, Row, Slider, money } from './ui'

const LABEL_W = 132
const COL_W = 150
const BAND_H = 108
const NODE_W = 128
const NODE_H = 38
const FEAT_W = 132
const FEAT_H = 28
const HEAD_H = 26

const trunkX = (level: number) => LABEL_W + level * COL_W
const bandY = (row: number) => HEAD_H + row * BAND_H
const trunkY = (row: number) => bandY(row) + 10
const featY = (row: number) => bandY(row) + 66
const featX = (level: number) => trunkX(level) + 34

type Sel = { kind: 'trunk'; track: Track; level: number } | { kind: 'feature'; id: string }

function trunkState(g: GameState, t: Track, level: number): 'owned' | 'next' | 'blocked' | 'future' {
  if (level <= g.levels[t]) return 'owned'
  if (level > g.levels[t] + 1) return 'future'
  return trunkBlocked(g, t, level) ? 'blocked' : 'next'
}

export function Research() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const [sel, setSel] = useState<Sel>({ kind: 'trunk', track: 'display', level: Math.min(MAX_LEVEL, g.levels.display + 1) })
  const industry = marketLevel(g.day)
  const fx = staffEffects(g)
  const perItem = g.activeResearch.length ? (g.rdBudget * g.config.researchSpeed * fx.research) / g.activeResearch.length : 0
  const width = trunkX(MAX_LEVEL) + NODE_W + 40
  const height = bandY(TRACKS.length) + 8

  const toggle = (id: string) => {
    const err = act((s) => toggleResearch(s, id))
    if (err) say(err, 'bad')
    else sfx.confirm()
  }

  // ---- connector lines
  const lines: React.ReactNode[] = []
  TRACKS.forEach((t, row) => {
    for (let l = 0; l < MAX_LEVEL; l++) {
      const on = g.levels[t] > l
      lines.push(<line key={`${t}${l}`} x1={trunkX(l) + NODE_W} y1={trunkY(row) + NODE_H / 2} x2={trunkX(l + 1)} y2={trunkY(row) + NODE_H / 2} stroke={on ? 'var(--color-accent)' : 'var(--color-line2)'} strokeWidth={on ? 2 : 1} />)
    }
    // cross-track requirements
    for (const [lvl, req] of Object.entries(TRUNK_REQS[t] ?? {})) {
      for (const k of TRACKS) {
        const need = req[k]
        if (need === undefined) continue
        const from = TRACKS.indexOf(k)
        const met = g.levels[k] >= need
        const down = from < row
        const x1 = trunkX(need) + NODE_W / 2 + 22
        const y1 = trunkY(from) + (down ? NODE_H : 0)
        const x2 = trunkX(Number(lvl)) + NODE_W / 2 - 22
        const y2 = trunkY(row) + (down ? 0 : NODE_H)
        const mid = (y1 + y2) / 2
        lines.push(
          <g key={`${t}${lvl}${k}`}>
            <path d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`} fill="none" stroke={met ? 'var(--color-faint)' : 'var(--color-warn)'} strokeWidth={1} strokeDasharray="4 3" />
            <rect x={x2 - 2.5} y={y2 - 2.5} width={5} height={5} fill={met ? 'var(--color-faint)' : 'var(--color-warn)'} />
          </g>,
        )
      }
    }
  })
  FEATURES.forEach((f) => {
    const row = TRACKS.indexOf(f.track)
    const on = g.features.includes(f.id)
    const x = trunkX(f.level) + 16
    lines.push(<path key={f.id} d={`M${x},${trunkY(row) + NODE_H} V${featY(row) + FEAT_H / 2} H${featX(f.level)}`} fill="none" stroke={on ? 'var(--color-accent)' : 'var(--color-line2)'} strokeWidth={on ? 2 : 1} />)
  })

  // ---- detail of the selected node
  const detail = (() => {
    if (sel.kind === 'feature') {
      const f = FEATURES.find((x) => x.id === sel.id)!
      const item = researchItem(g, `f:${f.id}`)
      return { id: item.id, icon: trackIcon(f.track), title: f.name, sub: `Branch of ${TRACK_INFO[f.track].name} level ${f.level}`, note: f.note, cost: featureCost(f), item, startable: true }
    }
    const state = trunkState(g, sel.track, sel.level)
    const item = researchItem(g, sel.track)
    const blocked = trunkBlocked(g, sel.track, sel.level)
    return {
      id: sel.track,
      icon: trackIcon(sel.track),
      title: `${TRACK_INFO[sel.track].name} level ${sel.level}`,
      sub: TRACK_INFO[sel.track].unlocks[sel.level],
      note: state === 'owned' ? 'You own this level.' : state === 'future' ? `Research level ${sel.level - 1} first.${blocked ? ' ' + blocked + '.' : ''}` : (blocked ?? 'Ready to research.'),
      cost: sel.level === 0 ? 0 : researchCost(sel.level),
      item: { ...item, done: state === 'owned' },
      startable: state === 'next' || state === 'blocked',
    }
  })()
  const active = g.activeResearch.includes(detail.id) && detail.startable
  const progress = g.progress[detail.id] ?? 0
  const eta = active && perItem > 0 ? Math.ceil(((detail.cost - progress) / perItem) * 30) : 0

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] gap-2 p-2">
      <Panel title="Technology tree" icon="research" right={<span className="label">click a node to inspect it</span>} bodyClass="overflow-auto">
        <div className="relative" style={{ width, height }}>
          <svg width={width} height={height} className="absolute inset-0">
            {/* where the leading rivals are */}
            <line x1={trunkX(industry) + NODE_W / 2} y1={HEAD_H - 6} x2={trunkX(industry) + NODE_W / 2} y2={height} stroke="var(--color-warn)" strokeWidth={1} strokeDasharray="2 4" opacity={0.7} />
            {lines}
          </svg>
          <div className="num absolute text-[9px] text-warn" style={{ left: trunkX(industry) + NODE_W / 2 + 4, top: 2 }}>
            INDUSTRY {industry.toFixed(1)}
          </div>
          {Array.from({ length: MAX_LEVEL + 1 }, (_, l) => (
            <div key={l} className="label absolute text-faint" style={{ left: trunkX(l), top: 6 }}>
              Level {l}
            </div>
          ))}
          {TRACKS.map((t, row) => (
            <div key={t}>
              <div className="absolute border-t border-line" style={{ left: 0, top: bandY(row), width }} />
              <div className="absolute px-2" style={{ left: 0, top: trunkY(row) + 2, width: LABEL_W }}>
                <div className={`flex items-center gap-[6px] text-xs font-semibold uppercase tracking-wider ${g.activeResearch.includes(t) ? 'text-accent' : 'text-fg'}`}>
                  <Icon name={trackIcon(t)} size={14} className={g.activeResearch.includes(t) ? '' : 'text-dim'} />
                  {TRACK_INFO[t].name}
                </div>
                <div className="num pl-5 text-[10px] text-dim">
                  L{g.levels[t]} / {MAX_LEVEL}
                </div>
              </div>
              {Array.from({ length: MAX_LEVEL + 1 }, (_, l) => {
                const st = trunkState(g, t, l)
                const picked = sel.kind === 'trunk' && sel.track === t && sel.level === l
                const running = (st === 'next' || st === 'blocked') && g.activeResearch.includes(t)
                const cls = st === 'owned' ? 'border-accent bg-accent/15 text-fg' : st === 'next' ? 'border-fg bg-raise text-fg' : st === 'blocked' ? 'border-dashed border-warn bg-raise text-dim' : 'border-line2 bg-panel text-faint'
                return (
                  <button key={l} onClick={() => setSel({ kind: 'trunk', track: t, level: l })} title={TRACK_INFO[t].unlocks[l]} className={`absolute overflow-hidden border px-2 text-left transition-colors hover:border-accent ${cls} ${picked ? 'outline outline-1 outline-offset-2 outline-accent' : ''}`} style={{ left: trunkX(l), top: trunkY(row), width: NODE_W, height: NODE_H }}>
                    <div className="truncate text-[11px] leading-tight">{TRACK_INFO[t].unlocks[l]}</div>
                    <div className="num whitespace-nowrap text-[9px] leading-tight text-dim">
                      {st === 'owned' ? (
                        <>
                          <Lead icon="check" size={9} />
                          OWNED
                        </>
                      ) : running ? (
                        <>
                          <Lead icon="play" size={9} />
                          RESEARCHING
                        </>
                      ) : st === 'blocked' ? (
                        <>
                          <Lead icon="lock" size={9} />
                          NEEDS OTHER TECH
                        </>
                      ) : (
                        money(researchCost(l), 1)
                      )}
                    </div>
                    {running && <div className="absolute bottom-0 left-0 h-[3px] bg-accent" style={{ width: `${Math.min(100, ((g.progress[t] ?? 0) / researchCost(l)) * 100)}%` }} />}
                  </button>
                )
              })}
            </div>
          ))}
          {FEATURES.map((f) => {
            const row = TRACKS.indexOf(f.track)
            const id = `f:${f.id}`
            const owned = g.features.includes(f.id)
            const open = g.levels[f.track] >= f.level
            const running = g.activeResearch.includes(id)
            const picked = sel.kind === 'feature' && sel.id === f.id
            const cls = owned ? 'border-accent bg-accent/15 text-fg' : open ? 'border-fg bg-raise text-fg' : 'border-line2 bg-panel text-faint'
            return (
              <button key={f.id} onClick={() => setSel({ kind: 'feature', id: f.id })} title={f.note} className={`absolute overflow-hidden border px-2 text-left transition-colors hover:border-accent ${cls} ${picked ? 'outline outline-1 outline-offset-2 outline-accent' : ''}`} style={{ left: featX(f.level), top: featY(row), width: FEAT_W, height: FEAT_H }}>
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[11px]">{f.name}</span>
                  <span className="num shrink-0 text-[9px] text-dim">{owned ? <Icon name="check" size={10} className="text-accent" /> : running ? <Icon name="play" size={10} className="text-accent" /> : money(featureCost(f), 1)}</span>
                </div>
                {running && <div className="absolute bottom-0 left-0 h-[3px] bg-accent" style={{ width: `${Math.min(100, ((g.progress[id] ?? 0) / featureCost(f)) * 100)}%` }} />}
              </button>
            )
          })}
        </div>
      </Panel>

      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        <Panel title={detail.title} icon={detail.icon} className="shrink-0" bodyClass="px-2 py-2">
          <div className="text-sm text-fg">{detail.sub}</div>
          <div className="mt-1 text-[11px] leading-snug text-dim">{detail.note}</div>
          <div className="mt-2">
            <Row icon="cash" k="Cost" v={detail.cost ? money(detail.cost) : 'starting tech'} />
            {!detail.item.done && detail.startable && <Row icon="coins" k="Invested" v={`${money(progress)} (${Math.round((progress / detail.cost) * 100)}%)`} />}
            {eta > 0 && <Row icon="hourglass" k="Finishes in about" v={`${eta} days`} />}
          </div>
          {detail.item.done ? (
            <div className="num mt-2 border border-accent px-2 py-1 text-center text-[11px] text-accent">
              <Lead icon="check" />
              OWNED
            </div>
          ) : (
            <Btn tone={active ? 'default' : 'primary'} icon={active ? 'stop' : detail.startable && detail.item.available ? 'play' : 'lock'} className="mt-2 h-9 w-full" disabled={!active && !(detail.startable && detail.item.available)} onClick={() => toggle(detail.id)}>
              {active ? 'Stop researching' : detail.startable && detail.item.available ? 'Start research' : 'Locked'}
            </Btn>
          )}
        </Panel>
        <Panel title="R&D budget" icon="cash" className="shrink-0" bodyClass="px-2 py-1">
          <Slider label="Monthly budget" icon="cash" value={g.rdBudget} min={0} max={Math.max(2e6, Math.ceil((g.cash * 0.25) / 1e5) * 1e5, g.rdBudget)} step={10e3} format={(v) => money(v)} onChange={(v) => act((s) => void (s.rdBudget = v))} />
          <Row icon="play" k="Projects running" v={g.activeResearch.length} />
          <Row icon="coins" k="Per project, per month" v={money(perItem)} />
          <Row icon="staff" k="Staff bonus" v={`${fx.research.toFixed(2)}x`} tone={fx.research > 1 ? 'text-pos' : undefined} />
          <Row icon="receipt" k="Spent this month" v={money(g.cur.rd)} />
          {g.rdBudget > 0 && !g.activeResearch.length && (
            <div className="py-1 text-[11px] text-warn">
              <Lead icon="alert" />
              Start at least one project, or no money is spent.
            </div>
          )}
          {g.rdBudget === 0 && g.activeResearch.length > 0 && (
            <div className="py-1 text-[11px] text-warn">
              <Lead icon="alert" />
              Set a budget to make progress.
            </div>
          )}
        </Panel>
        <Panel title="Running projects" icon="play" className="shrink-0" bodyClass="px-2 py-1">
          {g.activeResearch.length === 0 && <div className="py-1 text-[11px] text-faint">Nothing is being researched.</div>}
          {g.activeResearch.map((id) => {
            const item = researchItem(g, id)
            return (
              <div key={id} className="py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px]">{item.name}</span>
                  <IconBtn icon="stop" tone="ghost" title={`Stop researching ${item.name}`} className="!h-5 !w-5 hover:!text-neg" onClick={() => toggle(id)} />
                </div>
                <Meter value={g.progress[id] ?? 0} max={item.cost || 1} />
              </div>
            )
          })}
        </Panel>
        <Panel title="How it works" icon="info" className="shrink-0" bodyClass="px-2 py-2 text-[11px] leading-snug text-dim">
          Each row is a track that climbs level by level. Smaller boxes below are optional features that branch off a level. Dashed links show a level that also needs another track. The amber line is where leading rivals are today. The budget is split evenly between running projects.
        </Panel>
      </div>
    </div>
  )
}
