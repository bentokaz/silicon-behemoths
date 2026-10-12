// The messenger: the one place the game speaks to the player outside a
// dialog. A strip of fixed height along the bottom of the screen area, always
// there, so nothing it says ever moves the layout or lies over a panel. One
// line at a time, one action:
//   1. the answer to what the player just did (hired, saved, refused)
//   2. what needs them (a device sold out)
//   3. what has just opened
//   4. the step of the guide, while the guide is running
//   5. otherwise, quietly, the latest news
import { useEffect, useRef, useState } from 'react'
import { sfx } from '../audio/sfx'
import { fmtDate } from '../sim/game'
import type { GameState } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { type Note, currentNote } from '../store/notes'
import { STEPS, atStep, following, goStep, stepsOf, suits } from './Guide'
import { Icon, type IconName } from './icons'
import { Btn, ConfirmIconBtn, IconBtn } from './ui'

/** The height of the strip. The frame leaves exactly this much for it. */
export const STRIP_H = 44

const NOTE_ICON: Record<Note['tone'], IconName> = { ok: 'check', bad: 'ban', warn: 'alert', new: 'unlock' }
const NOTE_TONE: Record<Note['tone'], string> = { ok: 'text-pos', bad: 'text-neg', warn: 'text-warn', new: 'text-accent' }
const NOTE_WORD: Record<Note['kind'], string> = { say: '', alert: 'Needs you', unlock: 'New' }

function act(note: Note) {
  const st = useStore.getState()
  const a = note.action
  st.dismiss(note.id)
  if (!a) return
  sfx.confirm()
  if (a.where) st.go(a.where)
  if (a.productId) st.focus(a.productId)
  if (a.personId) st.openPerson(a.personId)
}

function NoteLine({ note, waiting }: { note: Note; waiting: number }) {
  const { dismiss } = useStore.getState()
  const [held, setHeld] = useState(false)
  // a line with a time limit goes by itself, unless the pointer or the keyboard is on it
  useEffect(() => {
    if (!note.ttl || held) return
    const t = window.setTimeout(() => dismiss(note.id), note.ttl)
    return () => window.clearTimeout(t)
  }, [note.id, note.ttl, note.count, held, dismiss])
  return (
    <div role={note.tone === 'bad' ? 'alert' : 'status'} data-note={note.kind} className="flex h-full min-w-0 flex-1 items-center justify-center gap-3" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
      <Icon name={NOTE_ICON[note.tone]} size={15} className={`shrink-0 ${NOTE_TONE[note.tone]}`} />
      {NOTE_WORD[note.kind] && <span className={`shrink-0 border px-[5px] text-[11px] leading-4 ${note.tone === 'new' ? 'border-accent text-accent' : 'border-warn text-warn'}`}>{NOTE_WORD[note.kind]}</span>}
      <span className={`line-clamp-2 min-w-0 text-xs leading-4 ${note.tone === 'bad' ? 'text-neg' : 'text-fg'}`} title={note.text}>
        {note.text}
        {note.count > 1 && <span className="num ml-2 text-[11px] text-dim">x{note.count}</span>}
      </span>
      {note.action && (
        <Btn small className="shrink-0" icon="arrowRight" onClick={() => act(note)}>
          {note.action.label}
        </Btn>
      )}
      {waiting > 0 && (
        <span className="num shrink-0 text-[11px] text-dim" title={`${waiting} more waiting`}>
          +{waiting}
        </span>
      )}
      <IconBtn icon="close" tone="ghost" title="Dismiss" onClick={() => dismiss(note.id)} />
    </div>
  )
}

/**
 * The guide's step. It is held as done until the player moves on (so nothing
 * is ever skipped unseen), it goes to the place of the next step by itself,
 * and it has one action.
 */
function GuideLine({ g }: { g: GameState }) {
  const { act: change } = useStore.getState()
  // re-read where the player is, so "Show me" comes and goes
  useStore((s) => s.tab)
  useStore((s) => s.designing)
  useStore((s) => s.views)
  useStore((s) => s.inspect)
  const step = STEPS[g.guide]
  const passed = !!step && !suits(g, step)
  // a step that is not for this kind of game is never shown: move past it
  useEffect(() => {
    if (passed) change((s) => void (s.guide = following(s, s.guide)))
  }, [passed, g.guide, change])
  // once a step has been done it stays done, whatever happens next, until the player moves on
  const latch = useRef<{ step: number; game: GameState | null }>({ step: -1, game: null })
  const doneNow = !!step && !passed && !!step.done?.(g)
  if (doneNow) latch.current = { step: g.guide, game: g }
  const done = doneNow || (latch.current.step === g.guide && latch.current.game === g)
  const rang = useRef(-1)
  useEffect(() => {
    if (done && rang.current !== g.guide) (rang.current = g.guide), sfx.confirm()
  }, [done, g.guide])
  if (!step || passed) return null
  const mine = stepsOf(g)
  const at = mine.indexOf(g.guide)
  const nextAt = following(g, g.guide)
  const next = nextAt >= 0 ? STEPS[nextAt] : undefined
  const advance = () => {
    change((s) => void (s.guide = following(s, s.guide)))
    // the next step is read where it is done
    if (next && !next.designer && (next.tab || next.where)) goStep(next)
    sfx.toggle()
  }
  const here = atStep(step)
  return (
    <div role="status" data-note="guide" className="flex h-full min-w-0 flex-1 items-center justify-center gap-3">
      <Icon name={done ? 'check' : 'goals'} size={15} className={`shrink-0 ${done ? 'text-pos' : 'text-accent'}`} />
      <span className="num shrink-0 border border-line2 px-[5px] text-[11px] leading-4 text-dim" title={`Guide: step ${at + 1} of ${mine.length}`}>
        {at + 1}/{mine.length}
      </span>
      <span className="line-clamp-2 min-w-0 text-xs leading-4 text-dim" title={step.text}>
        <span className={`mr-2 font-semibold ${done ? 'text-pos' : 'text-fg'}`}>{done ? `Done: ${step.title}` : step.title}</span>
        {!done && step.text}
        {done && next && `Next: ${next.title}.`}
      </span>
      {!step.done || done ? (
        <Btn small className="shrink-0" icon={next ? 'arrowRight' : 'check'} onClick={advance}>
          {next ? 'Next' : 'Finish'}
        </Btn>
      ) : (
        <>
          {!here && (
            <Btn small className="shrink-0" icon="arrowRight" onClick={() => goStep(step)}>
              {step.designer ? 'New device' : 'Show me'}
            </Btn>
          )}
          <Btn small tone="ghost" className="shrink-0" onClick={advance} title="Leave this step undone and go on to the next">
            Skip
          </Btn>
        </>
      )}
      <ConfirmIconBtn icon="close" title="Leave the guide (it can be brought back under Save and settings)" onClick={() => change((s) => void (s.guide = -1))} />
      {/* what the step points at is outlined on the screen itself */}
      {step.target && !done && <style>{`[data-coach-target~="${step.target}"]{outline:2px solid var(--color-accent);outline-offset:2px}`}</style>}
    </div>
  )
}

/** With nothing to say: the latest news that is about the player's own company, quietly. */
function Ticker({ g }: { g: GameState }) {
  const last = g.news.find((n) => n.kind !== 'rival')
  if (!last) return <div className="flex-1" />
  return (
    <div data-note="news" className="flex h-full min-w-0 flex-1 items-center justify-center gap-3 text-xs text-faint">
      <span className="num shrink-0 text-[11px]">{fmtDate(last.day)}</span>
      <span className="min-w-0 truncate" title={last.text}>
        {last.text}
      </span>
    </div>
  )
}

export function Messenger() {
  const g = useGame()
  const notes = useStore((s) => s.notes)
  const showing = useStore((s) => s.showing)
  const note = currentNote(notes)
  const guide = !g.gameOver && !showing && g.guide >= 0 && g.guide < STEPS.length
  return (
    <div data-chrome="strip" aria-label="Messages" className="flex shrink-0 items-center border-t border-line bg-panel px-3" style={{ height: STRIP_H }}>
      {note ? <NoteLine key={note.id} note={note} waiting={notes.length - 1} /> : guide ? <GuideLine g={g} /> : <Ticker g={g} />}
    </div>
  )
}
