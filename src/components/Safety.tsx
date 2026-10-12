// What the player sees when something goes wrong: a screen that broke, or a
// window too small to play in.
import { Component, type ReactNode, useEffect, useState } from 'react'
import { useStore } from '../store/game'
import { AUTOSAVE, saveGame } from '../store/saves'
import { Icon } from './icons'
import { Btn } from './ui'

export const FEEDBACK_URL = 'https://bentokaz.itch.io/siliconbehemoths'
export const ISSUES_URL = 'https://github.com/bentokaz/silicon-behemoths/issues'

/** Narrowest window the screens are laid out for. */
const MIN_WIDTH = 1180
const MIN_HEIGHT = 620

interface CrashState {
  error: Error | null
  saved: 'no' | 'yes' | 'failed'
}

/** Catches an error in any screen so the page never goes blank, and keeps the game safe. */
export class CrashGuard extends Component<{ children: ReactNode }, CrashState> {
  state: CrashState = { error: null, saved: 'no' }

  static getDerivedStateFromError(error: Error): Partial<CrashState> {
    return { error }
  }

  componentDidCatch() {
    // the game itself is plain data and is still whole: put it in the autosave before anything else
    const { game } = useStore.getState()
    if (!game) return
    saveGame(AUTOSAVE, game).then(
      () => this.setState({ saved: 'yes' }),
      () => this.setState({ saved: 'failed' }),
    )
  }

  render() {
    const { error, saved } = this.state
    if (!error) return this.props.children
    const detail = `${error.name}: ${error.message}\n${(error.stack ?? '').split('\n').slice(1, 6).join('\n')}`
    return (
      <div className="flex h-full items-center justify-center bg-bg p-6">
        <div className="w-[560px] max-w-full border border-neg bg-panel">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-neg">
            <Icon name="alert" size={15} />
            Something broke
          </div>
          <div className="space-y-3 p-4 text-[12px] leading-relaxed text-dim">
            <p className="text-fg">A screen ran into an error and had to stop. {saved === 'yes' ? 'Your company was saved to the Autosave slot a moment ago.' : saved === 'failed' ? 'The game could not write an autosave just now; your last save is still there.' : 'Your saves are untouched.'}</p>
            <p>Reload the page and choose Continue to carry on. If it happens again in the same place, please report it with the lines below.</p>
            <pre className="num max-h-32 overflow-auto border border-line bg-bg p-2 text-[10px] leading-snug text-faint">{detail}</pre>
            <div className="flex flex-wrap gap-2">
              <Btn tone="primary" icon="refresh" onClick={() => window.location.reload()}>
                Reload
              </Btn>
              <Btn icon="doc" onClick={() => void navigator.clipboard?.writeText(detail)}>
                Copy the details
              </Btn>
              <a href={FEEDBACK_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-line2 bg-raise px-3 py-[6px] text-[11px] uppercase tracking-wider text-fg hover:border-accent">
                <Icon name="review" size={13} />
                Report it
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

/** A strip across the top when the window is too small for the game, or the device is a phone. */
export function SizeNotice() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const touchOnly = typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches
  const small = size.w < MIN_WIDTH || size.h < MIN_HEIGHT
  if (hidden || (!small && !touchOnly)) return null
  return (
    <div className="absolute inset-x-0 top-0 z-[70] flex items-center gap-3 border-b border-warn bg-panel px-3 py-2 text-[11px] text-warn">
      <Icon name="alert" size={14} className="shrink-0" />
      <span className="min-w-0 flex-1">
        {touchOnly ? 'This game is made for a computer with a mouse and keyboard. It will not play well on a phone or tablet.' : `This window is ${size.w} x ${size.h}. The game is laid out for ${MIN_WIDTH} x ${MIN_HEIGHT} or larger: make the window bigger, go fullscreen, or zoom the page out.`}
      </span>
      <button onClick={() => setHidden(true)} className="shrink-0 border border-warn px-2 py-[2px] uppercase tracking-wider hover:bg-warn/10">
        Hide
      </button>
    </div>
  )
}

/** Where to send bug reports and ideas. */
export function FeedbackLinks({ className = '' }: { className?: string }) {
  const link = 'inline-flex items-center gap-[6px] border border-line2 bg-raise px-2 py-[5px] text-[10px] uppercase tracking-wider text-dim hover:border-accent hover:text-fg'
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <a href={FEEDBACK_URL} target="_blank" rel="noreferrer" className={link}>
        <Icon name="review" size={12} />
        Leave feedback
      </a>
      <a href={ISSUES_URL} target="_blank" rel="noreferrer" className={link}>
        <Icon name="alert" size={12} />
        Report a bug
      </a>
    </div>
  )
}
