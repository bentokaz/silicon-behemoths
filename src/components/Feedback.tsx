// Reporting a problem or an idea from inside the game, and the small question
// the game asks when it looks as if the player is leaving because of a problem.
import { useEffect, useMemo, useRef, useState } from 'react'
import { sendFeedback } from '../store/cloud'
import { useStore } from '../store/game'
import { type FeedbackKind, type Sign, maybeAsk, noteBack, noteLeaving, noteRefusal, noteTrouble, recentSigns, useFeedback } from '../store/trouble'
import { Icon, type IconName } from './icons'
import { Btn, IconBtn, useLayer } from './ui'

export const FEEDBACK_URL = 'https://bentokaz.itch.io/siliconbehemoths'
export const ISSUES_URL = 'https://github.com/bentokaz/silicon-behemoths/issues'

declare const __BUILD__: string
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'

const KINDS: { id: FeedbackKind; label: string; icon: IconName; ask: string }[] = [
  { id: 'bug', label: 'Something broke', icon: 'alert', ask: 'What happened, and what were you doing just before?' },
  { id: 'confusing', label: 'Something is unclear', icon: 'info', ask: 'What were you trying to do, and where did it stop making sense?' },
  { id: 'idea', label: 'An idea', icon: 'star', ask: 'What would you like the game to do?' },
  { id: 'other', label: 'Anything else', icon: 'review', ask: 'Say whatever is on your mind.' },
]

/** What goes with a report so it can be acted on: nothing personal, nothing from the save beyond where the player was. */
function details(): Record<string, unknown> {
  const st = useStore.getState()
  const g = st.game
  return {
    build: BUILD,
    screen: st.screen === 'game' ? (st.designing ? 'designer' : st.tab) : st.screen,
    day: g?.day ?? null,
    mode: g ? `${g.config.difficulty}${g.config.progression === 'guided' ? ', guided' : ''}${g.config.unlimitedMoney ? ', unlimited money' : ''}` : null,
    start: g?.config.startType ?? null,
    window: `${window.innerWidth} x ${window.innerHeight} @${window.devicePixelRatio}`,
    browser: navigator.userAgent,
    host: location.host,
    seen: recentSigns(),
  }
}

const QUESTION: Record<Sign['kind'], { title: string; text: (s: Sign) => string }> = {
  error: { title: 'That looked like a bug', text: () => 'Something in the game failed a moment ago. It would help a lot to know what you were doing when it happened.' },
  stuck: { title: 'Stuck on something?', text: (s) => `The game kept answering with ${s.note.replace(/ shown \d+ times$/, '')}. If that message did not tell you what to do next, say so and it will get fixed.` },
  rage: { title: 'Is something not responding?', text: () => 'It looked as if you were clicking on something that would not answer. Tell us what it was.' },
  slow: { title: 'Running slowly?', text: () => 'The game has been drawing slowly on this computer. Lowering the detail under Save and settings, Settings usually helps; a quick report helps too.' },
  gameover: { title: 'A rough ending?', text: () => 'If that felt unfair or came out of nowhere, say what happened. Your save from before the debt is still there to go back to.' },
}

/** The small question, bottom right, when it looks as if the player is leaving because of a problem. */
function Ask() {
  const ask = useFeedback((s) => s.ask)
  const { open, dismiss } = useFeedback.getState()
  const screen = useStore((s) => s.screen)
  useLayer(!!ask, () => dismiss())
  if (!ask) return null
  const q = QUESTION[ask.kind]
  // it sits clear of what runs along the bottom: the messenger strip in a game, the footer of the new-company form
  const bottom = screen === 'game' ? 52 : screen === 'new' ? 64 : 16
  return (
    <div className="absolute right-4 z-[80] w-[340px] max-w-[calc(100%-2rem)] border border-line2 bg-panel" style={{ bottom }} role="dialog" aria-label={q.title}>
      <div className="flex h-8 items-center gap-2 border-b border-line pl-3 pr-1">
        <Icon name="review" size={13} className="shrink-0 text-dim" />
        <span className="t-title min-w-0 flex-1 truncate">{q.title}</span>
        <IconBtn icon="close" tone="ghost" small title="Close (Esc)" onClick={() => dismiss()} />
      </div>
      <div className="space-y-3 p-3 text-xs leading-relaxed text-dim">
        <p>{q.text(ask)}</p>
        <div className="flex flex-wrap items-center gap-2">
          {/* an outline button: the screen under this card may have its own filled one */}
          <Btn icon="review" onClick={() => open(ask.kind === 'stuck' ? 'confusing' : 'bug')}>
            Report it
          </Btn>
          <Btn tone="ghost" onClick={() => dismiss()}>
            All fine
          </Btn>
          <Btn tone="ghost" className="ml-auto" title="Never show this question again in this browser" onClick={() => dismiss(true)}>
            Do not ask again
          </Btn>
        </div>
      </div>
    </div>
  )
}

function Form() {
  const form = useFeedback((s) => s.form)
  const close = useFeedback((s) => s.close)
  const [kind, setKind] = useState<FeedbackKind>(form?.kind ?? 'bug')
  const [text, setText] = useState('')
  const [contact, setContact] = useState('')
  const [withDetails, setWithDetails] = useState(true)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [peek, setPeek] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const context = useMemo(details, [form])
  useEffect(() => {
    if (form) (setKind(form.kind), setState('idle'))
  }, [form])
  const box = useRef<HTMLDivElement>(null)
  useLayer(!!form, close, { modal: true, box })
  if (!form) return null
  const K = KINDS.find((k) => k.id === kind)!
  const tooShort = text.trim().length < 3
  const body = `${text.trim()}\n\n---\n${withDetails ? Object.entries(context).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' | ') || 'none' : v}`).join('\n') : `build: ${BUILD}`}`
  const issue = `${ISSUES_URL}/new?title=${encodeURIComponent(`[${K.label}] ${text.trim().split('\n')[0].slice(0, 70)}`)}&body=${encodeURIComponent(body)}`
  const send = async () => {
    setState('sending')
    const ok = await sendFeedback({ kind, message: text.trim(), contact: contact.trim() || null, context: withDetails ? context : { build: BUILD } })
    setState(ok ? 'sent' : 'failed')
    if (ok) setText('')
  }
  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={box} className="flex max-h-full w-[560px] max-w-full flex-col border border-line2 bg-panel outline-none" role="dialog" aria-modal="true" aria-label="Send feedback">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line pl-4 pr-1">
          <Icon name="review" size={13} className="shrink-0 text-dim" />
          <span className="t-title flex-1">Tell us about it</span>
          <IconBtn icon="close" tone="ghost" title="Close (Esc)" onClick={close} />
        </div>
        {state === 'sent' ? (
          <div className="space-y-3 p-4 text-xs leading-relaxed text-dim">
            <p className="flex items-center gap-2 text-pos">
              <Icon name="check" size={14} />
              Sent. Thank you: every report is read.
            </p>
            <div className="flex gap-2">
              <Btn tone="primary" large autoFocus onClick={close}>
                Done
              </Btn>
              <Btn large icon="plus" onClick={() => setState('idle')}>
                Send another
              </Btn>
            </div>
          </div>
        ) : (
          <div className="min-h-0 space-y-3 overflow-y-auto p-4 text-xs text-dim">
            <div className="grid grid-cols-2 gap-1">
              {KINDS.map((k) => (
                <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} className={`flex h-9 items-center gap-2 border px-3 text-left text-xs transition-colors ${kind === k.id ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line2 bg-raise text-fg hover:border-fg'}`}>
                  <Icon name={k.icon} size={14} className={kind === k.id ? 'text-accent' : 'text-dim'} />
                  {k.label}
                </button>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs text-fg">{K.ask}</div>
              <textarea
                autoFocus
                aria-label={K.ask}
                value={text}
                onChange={(e) => setText(e.target.value)}
                // Ctrl+Enter sends, as in most places where Enter itself makes a new line
                onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !tooShort && state !== 'sending' && (e.preventDefault(), void send())}
                maxLength={4000}
                rows={6}
                style={{ userSelect: 'text' }}
                className="max-h-[40vh] min-h-20 w-full resize-y border border-line2 bg-carbon p-2 text-xs leading-relaxed text-fg outline-none focus:border-accent"
                placeholder="A sentence or two is plenty."
              />
              <div className="mt-[2px] flex justify-between text-[11px] text-faint">
                <span>{tooShort ? 'Write a few words to send.' : 'Ctrl+Enter sends.'}</span>
                {text.length > 3600 && <span className={`num ${text.length >= 4000 ? 'text-warn' : ''}`}>{text.length} / 4000</span>}
              </div>
            </div>
            <input aria-label="How to reach you (optional)" style={{ userSelect: 'text' }} value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} className="h-7 w-full border border-line2 bg-carbon px-2 text-xs text-fg outline-none focus:border-accent" placeholder="How to reach you, if you want a reply (optional)" />
            <label className="flex items-start gap-2 text-[11px] leading-snug">
              <input type="checkbox" className="mt-[2px] accent-accent" checked={withDetails} onChange={(e) => setWithDetails(e.target.checked)} />
              <span>
                Include technical details: the screen you were on, the game date, your browser and window size, and any errors the game noticed. No save data and nothing about you.{' '}
                <button type="button" aria-expanded={peek} className="text-fg underline hover:text-accent" onClick={() => setPeek(!peek)}>
                  {peek ? 'Hide them' : 'See them'}
                </button>
              </span>
            </label>
            {peek && <pre className="num max-h-28 overflow-auto border border-line bg-carbon p-2 text-[11px] leading-snug text-dim">{Object.entries(context).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' | ') || 'none' : v}`).join('\n')}</pre>}
            {state === 'failed' && (
              <p className="flex items-start gap-2 text-warn">
                <Icon name="alert" size={14} className="mt-[1px] shrink-0" />
                <span>That did not go through (you may be offline). Your text is still here: try again, or use one of the links below.</span>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Btn tone="primary" large icon="arrowRight" disabled={tooShort || state === 'sending'} title={state === 'sending' ? 'Sending now' : tooShort ? 'Write a few words first' : 'Send it to the maker (Ctrl+Enter)'} onClick={() => void send()}>
                {state === 'sending' ? 'Sending' : 'Send'}
              </Btn>
              <Btn tone="ghost" large title="Close without sending (Esc)" onClick={close}>
                Cancel
              </Btn>
              <span className="ml-auto flex items-center gap-3 text-[11px]">
                <a href={text.trim() ? issue : ISSUES_URL} target="_blank" rel="noreferrer" className="text-dim underline hover:text-fg">
                  Post on GitHub instead
                </a>
                <a href={FEEDBACK_URL} target="_blank" rel="noreferrer" className="text-dim underline hover:text-fg">
                  itch.io comments
                </a>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Installs the watchers and draws the question and the form. Mounted once, above everything. */
export function FeedbackHost() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => noteTrouble('error', `${e.message} (${(e.filename ?? '').split('/').pop()}:${e.lineno})`)
    const onReject = (e: PromiseRejectionEvent) => noteTrouble('error', `unhandled: ${String((e.reason as Error)?.message ?? e.reason).slice(0, 200)}`)
    // clicking the same spot over and over, fast, on something that is not a control that takes repeated clicks
    const clicks: { x: number; y: number; t: number }[] = []
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('canvas, input, textarea, select, [data-repeat]')) return void (clicks.length = 0)
      const now = performance.now()
      clicks.push({ x: e.clientX, y: e.clientY, t: now })
      while (clicks.length && now - clicks[0].t > 1600) clicks.shift()
      const near = clicks.filter((c) => Math.hypot(c.x - e.clientX, c.y - e.clientY) < 28)
      if (near.length >= 5) {
        const label = (el?.closest('button, a, [role=button]') as HTMLElement | null)?.innerText?.trim().slice(0, 40) || el?.tagName.toLowerCase() || 'something'
        noteTrouble('rage', `clicked "${label}" ${near.length} times in a row`)
        clicks.length = 0
      }
    }
    // leaving: the pointer goes up and out toward the tabs and the close button
    const onOut = (e: MouseEvent) => {
      if (!e.relatedTarget && e.clientY <= 0) maybeAsk()
    }
    const onHide = () => (document.visibilityState === 'hidden' ? noteLeaving() : noteBack())
    const onFull = () => {
      if (!document.fullscreenElement) maybeAsk()
    }
    // a game that has slowed to a crawl: frames far apart for several seconds while the page is in view
    let last = performance.now()
    let slowSince = 0
    let raf = 0
    const frame = (now: number) => {
      const dt = now - last
      last = now
      if (document.visibilityState === 'visible' && dt > 110 && dt < 2000) {
        slowSince ||= now
        if (now - slowSince > 6000) (noteTrouble('slow', `frames about ${Math.round(dt)} ms apart`), (slowSince = 0))
      } else slowSince = 0
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    // refusals and endings come through the game's own store
    const stop = useStore.subscribe((s, prev) => {
      if (s.toast && s.toast !== prev.toast && s.toast.tone === 'bad') noteRefusal(s.toast.text)
      if (s.game?.gameOver && !prev.game?.gameOver) noteTrouble('gameover', s.game.overReason ?? 'game over')
    })
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onReject)
    window.addEventListener('pointerdown', onDown, true)
    document.addEventListener('mouseout', onOut)
    document.addEventListener('visibilitychange', onHide)
    document.addEventListener('fullscreenchange', onFull)
    return () => {
      stop()
      cancelAnimationFrame(raf)
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onReject)
      window.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('visibilitychange', onHide)
      document.removeEventListener('fullscreenchange', onFull)
    }
  }, [])
  return (
    <>
      <Ask />
      <Form />
    </>
  )
}

/** The way in to the form: always on screen in the top bar and on the menu. */
export function FeedbackButton({ small, className = '' }: { small?: boolean; className?: string }) {
  const flagged = useFeedback((s) => s.flagged)
  const open = useFeedback((s) => s.open)
  return (
    <Btn small={small} icon="review" className={`relative ${className}`} title="Report a problem or send an idea. It takes a few seconds and goes straight to the maker." onClick={() => open('bug')}>
      Feedback
      {flagged && <span className="absolute -right-[3px] -top-[3px] h-[7px] w-[7px] bg-warn" aria-label="The game noticed a possible problem" />}
    </Btn>
  )
}
