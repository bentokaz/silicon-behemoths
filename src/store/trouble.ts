// Watches for signs that the player has hit a problem (an error, the same
// refusal over and over, clicking at something that does not answer, a game
// that has slowed to a crawl) so the game can ask about it at the right moment
// instead of leaving them to go away annoyed. Nothing here leaves the browser
// unless the player sends a report.
import { create } from 'zustand'

export type Trouble = 'error' | 'stuck' | 'rage' | 'slow' | 'gameover'
export type FeedbackKind = 'bug' | 'confusing' | 'idea' | 'other'

export interface Sign {
  kind: Trouble
  /** What happened, in a few words, for the report. */
  note: string
  at: number
}

interface FeedbackStore {
  /** The report form, and what it opens on. */
  form: { kind: FeedbackKind } | null
  /** The small question shown when it looks as if something went wrong. */
  ask: Sign | null
  /** True once trouble has been seen and not yet asked about: the feedback button shows a mark. */
  flagged: boolean
  open(kind?: FeedbackKind): void
  close(): void
  dismiss(forGood?: boolean): void
}

/** How long a sign of trouble stays fresh enough to ask about. */
const FRESH = 120e3
/** Shortest gap between two questions. */
const GAP = 8 * 60e3
const NEVER = 'sb-feedback-never'
const LEFT = 'sb-feedback-left'

const signs: Sign[] = []
const refusals: { text: string; at: number }[] = []
let lastAsk = 0

const read = (key: string, where: Storage | undefined) => {
  try {
    return where?.getItem(key) ?? null
  } catch {
    return null
  }
}
const write = (key: string, value: string | null, where: Storage | undefined) => {
  try {
    if (value === null) where?.removeItem(key)
    else where?.setItem(key, value)
  } catch {
    /* storage unavailable */
  }
}
const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage)
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage)

export const useFeedback = create<FeedbackStore>((set) => ({
  form: null,
  ask: null,
  flagged: false,
  open: (kind = 'bug') => set({ form: { kind }, ask: null, flagged: false }),
  close: () => set({ form: null }),
  dismiss(forGood) {
    if (forGood) write(NEVER, '1', local())
    set({ ask: null, flagged: false })
  },
}))

/** The freshest sign of trouble, most serious first, or null when all is quiet. */
export function freshSign(now = Date.now()): Sign | null {
  const order: Trouble[] = ['error', 'stuck', 'rage', 'slow', 'gameover']
  const live = signs.filter((s) => now - s.at < FRESH)
  for (const kind of order) {
    const hit = live.filter((s) => s.kind === kind).pop()
    if (hit) return hit
  }
  return null
}

/** Everything seen lately, oldest first, for the technical part of a report. */
export const recentSigns = (now = Date.now()) => signs.filter((s) => now - s.at < 10 * 60e3).map((s) => `${s.kind}: ${s.note}`)

/** Record a sign of trouble. */
export function noteTrouble(kind: Trouble, note: string) {
  const now = Date.now()
  // one of each kind every few seconds is plenty
  if (signs.some((s) => s.kind === kind && now - s.at < 4000)) return
  signs.push({ kind, note: note.slice(0, 300), at: now })
  if (signs.length > 30) signs.shift()
  if (!useFeedback.getState().form) useFeedback.setState({ flagged: true })
}

/** A refusal shown to the player ("Not enough cash"...). The same one three times in a row means they are stuck. */
export function noteRefusal(text: string) {
  const now = Date.now()
  refusals.push({ text, at: now })
  while (refusals.length && now - refusals[0].at > 45e3) refusals.shift()
  const same = refusals.filter((r) => r.text === text).length
  if (same >= 3) {
    noteTrouble('stuck', `"${text}" shown ${same} times`)
    refusals.length = 0
  }
}

/**
 * Ask about the trouble, if there is some fresh, the player has not said never,
 * the form is not already open and they were not asked a moment ago.
 * `leaving` is why now: the pointer left for the tab bar, the page came back
 * after being hidden, or fullscreen was dropped.
 */
export function maybeAsk(): boolean {
  const st = useFeedback.getState()
  const now = Date.now()
  if (st.form || st.ask || read(NEVER, local()) || now - lastAsk < GAP) return false
  const sign = freshSign(now)
  if (!sign) return false
  lastAsk = now
  useFeedback.setState({ ask: sign })
  return true
}

/** Remember, as the page is hidden, that the player left on a sour note; ask when they are back. */
export function noteLeaving() {
  if (freshSign()) write(LEFT, String(Date.now()), session())
}
export function noteBack() {
  const left = Number(read(LEFT, session()) ?? 0)
  write(LEFT, null, session())
  if (!left) return
  // the trouble may have aged out while they were away: bring the last sign back for the question
  const last = signs[signs.length - 1]
  if (last && Date.now() - left < 30 * 60e3) {
    last.at = Date.now()
    maybeAsk()
  }
}

/** For tests. */
export function resetTrouble() {
  signs.length = 0
  refusals.length = 0
  lastAsk = 0
  write(NEVER, null, local())
  write(LEFT, null, session())
  useFeedback.setState({ form: null, ask: null, flagged: false })
}
