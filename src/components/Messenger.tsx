// The messenger: the one place the game speaks to the player outside a
// dialog. A strip of fixed height along the bottom of the screen area, always
// there, so nothing it says ever moves the layout or lies over a panel. One
// line at a time, one action:
//   1. the answer to what the player just did (hired, saved, refused)
//   2. what needs them (a device sold out)
//   3. what has just opened
//   4. the step of the guide, while the guide is running (when the guide's
//      card is folded away; open, the card says it, see GuideCard)
//   5. otherwise, quietly, the latest news
import { useEffect, useRef, useState } from 'react'
import { sfx } from '../audio/sfx'
import { fmtDate } from '../sim/game'
import type { GameState } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { type Note, currentNote } from '../store/notes'
import { STEPS, atStep, following, goStep, stepsOf, suits } from './Guide'
import { Icon, type IconName } from './icons'
import { Btn, ConfirmIconBtn, IconBtn, useKept } from './ui'

/** The height of the strip. The frame leaves exactly this much for it. */
export const STRIP_H = 48

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
      <Icon name={NOTE_ICON[note.tone]} size={16} className={`shrink-0 ${NOTE_TONE[note.tone]}`} />
      {NOTE_WORD[note.kind] && <span className={`shrink-0 px-1.5 text-2xs font-semibold leading-[18px] ${note.tone === 'new' ? 'bg-accent/15 text-accent' : 'bg-warn/15 text-warn'}`}>{NOTE_WORD[note.kind]}</span>}
      <span className={`line-clamp-2 min-w-0 text-sm leading-5 ${note.tone === 'bad' ? 'text-neg' : 'text-fg'}`} title={note.text}>
        {note.text}
        {note.count > 1 && <span className="num ml-2 text-2xs text-dim">x{note.count}</span>}
      </span>
      {note.action && (
        <Btn small className="shrink-0" icon="arrowRight" onClick={() => act(note)}>
          {note.action.label}
        </Btn>
      )}
      {waiting > 0 && (
        <span className="num shrink-0 text-2xs text-dim" title={`${waiting} more waiting`}>
          +{waiting}
        </span>
      )}
      <IconBtn icon="close" tone="ghost" title="Dismiss" onClick={() => dismiss(note.id)} />
    </div>
  )
}

/** The guide's card is open (not folded into the strip). Remembered for the session. */
export const useGuideOpen = () => useKept<boolean>('guide:card', true)

/**
 * The guide's step, for either face. It is held as done until the player
 * moves on (so nothing is ever skipped unseen), it goes to the place of the
 * next step by itself, and it has one action.
 */
function useGuide(g: GameState) {
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
  const leave = () => change((s) => void (s.guide = -1))
  return { step, done, at, total: mine.length, next, advance, leave, here: atStep(step), upcoming: mine.slice(at + 1, at + 3).map((i) => STEPS[i].title) }
}

/** The guide's own action: in the accent, but outlined, so the screen's one filled button stays the screen's. */
const GO = '!border-accent !text-accent [&_svg]:!text-accent enabled:hover:!bg-accent/10'

/** What the step points at is outlined on the screen itself. */
const Outline = ({ target }: { target?: string }) => (target ? <style>{`[data-coach-target~="${target}"]{outline:2px solid var(--color-accent);outline-offset:2px}`}</style> : null)

function GuideLine({ g }: { g: GameState }) {
  const guide = useGuide(g)
  const [, setOpen] = useGuideOpen()
  if (!guide) return null
  const { step, done, at, total, next, advance, leave, here } = guide
  return (
    <div role="status" data-note="guide" className="flex h-full min-w-0 flex-1 items-center justify-center gap-3">
      <Icon name={done ? 'check' : 'goals'} size={16} className={`shrink-0 ${done ? 'text-pos' : 'text-accent'}`} />
      <span className="num shrink-0 bg-raise px-1.5 text-2xs leading-[18px] text-dim" title={`Guide: step ${at + 1} of ${total}`}>
        {at + 1}/{total}
      </span>
      <span className="line-clamp-2 min-w-0 text-sm leading-5 text-dim" title={step.text}>
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
      <IconBtn icon="expand" tone="ghost" title="Open the guide's card" onClick={() => setOpen(true)} />
      <ConfirmIconBtn icon="close" title="Leave the guide (it can be brought back under Save and settings)" onClick={leave} />
      {!done && <Outline target={step.target} />}
    </div>
  )
}

/**
 * The guide, open: a card at the bottom right of the screen with the step in
 * large type, what to do in a sentence, one action, how far along the guided
 * start is, and what comes next. It folds into the strip at the bottom.
 */
export function GuideCard() {
  const g = useGame()
  const guide = useGuide(g)
  const [, setOpen] = useGuideOpen()
  if (!guide) return null
  const { step, done, at, total, next, advance, leave, here, upcoming } = guide
  return (
    <aside role="status" aria-label="Guide" data-note="guide-card" className="sb-rise pointer-events-auto absolute bottom-3 right-3 z-30 flex w-[360px] max-w-[calc(100%-24px)] flex-col border border-line2 bg-panel shadow-[0_16px_40px_rgb(0_0_0/0.55)]">
      <header className="flex h-10 items-center gap-3 border-b border-line pl-4 pr-1">
        <Icon name="goals" size={15} className="shrink-0 text-accent" />
        <span className="text-xs font-semibold text-fg">Getting started</span>
        <span className="num text-2xs text-dim">
          {at + 1} of {total}
        </span>
        <span className="flex-1" />
        <IconBtn icon="minus" tone="ghost" small title="Fold the guide into the bar at the bottom" onClick={() => setOpen(false)} />
        <ConfirmIconBtn icon="close" small title="Leave the guide (it can be brought back under Save and settings)" onClick={leave} />
      </header>
      <div className="h-1 w-full bg-line" aria-hidden>
        <div className="h-full bg-accent" style={{ width: `${((at + (done ? 1 : 0)) / Math.max(1, total)) * 100}%` }} />
      </div>
      <div className="px-4 pb-4 pt-3">
        <div className={`t-section flex items-center gap-2 ${done ? 'text-pos' : ''}`}>
          {done && <Icon name="check" size={17} className="shrink-0 text-pos" />}
          {step.title}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-dim">{done ? (next ? `Done. Next: ${next.title}.` : 'Done.') : step.text}</p>
        <div className="mt-4 flex items-center gap-2">
          {!step.done || done ? (
            <Btn icon={next ? 'arrowRight' : 'check'} className={GO} onClick={advance}>
              {next ? 'Next' : 'Finish'}
            </Btn>
          ) : (
            <>
              {!here && (
                <Btn icon="arrowRight" className={GO} onClick={() => goStep(step)}>
                  {step.designer ? 'New device' : 'Show me'}
                </Btn>
              )}
              {here && <span className="text-xs text-accent">Do it here: it is outlined.</span>}
              <span className="flex-1" />
              <Btn tone="ghost" small onClick={advance} title="Leave this step undone and go on to the next">
                Skip
              </Btn>
            </>
          )}
        </div>
        {upcoming.length > 0 && (
          <div className="mt-4 border-t border-line pt-3 text-xs text-faint">
            <span className="text-dim">Then:</span> {upcoming.join(', ')}
          </div>
        )}
      </div>
      {!done && <Outline target={step.target} />}
    </aside>
  )
}

/** With nothing to say: the latest news that is about the player's own company, quietly. */
function Ticker({ g }: { g: GameState }) {
  const last = g.news.find((n) => n.kind !== 'rival')
  if (!last) return <div className="flex-1" />
  return (
    <div data-note="news" className="flex h-full min-w-0 flex-1 items-center justify-center gap-3 text-xs text-dim">
      <span className="num shrink-0 text-2xs text-faint">{fmtDate(last.day)}</span>
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
  const designing = useStore((s) => s.designing)
  const [cardOpen] = useGuideOpen()
  const note = currentNote(notes)
  // the guide speaks here only when its card is folded away (or cannot be shown: in the designer)
  const guide = !g.gameOver && !showing && g.guide >= 0 && g.guide < STEPS.length && (!cardOpen || designing)
  return (
    <div data-chrome="strip" aria-label="Messages" className="flex shrink-0 items-center border-t border-line bg-panel px-4" style={{ height: STRIP_H }}>
      {note ? <NoteLine key={note.id} note={note} waiting={notes.length - 1} /> : guide ? <GuideLine g={g} /> : <Ticker g={g} />}
    </div>
  )
}
