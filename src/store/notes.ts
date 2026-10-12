// The messenger's queue. Everything the game says to the player outside a
// dialog goes through here and is shown in one strip, one line at a time:
// what the player just did (a hire, a save, a refusal), what needs them (a
// device sold out), and what has just opened. Pure, so it can be tested.
import type { Where } from '../sim/progress'

export type NoteKind = 'say' | 'alert' | 'unlock'

export interface NoteAction {
  label: string
  /** A place to go. */
  where?: Where
  /** A device to open. */
  productId?: string
  /** A person to open. */
  personId?: string
}

export interface Note {
  id: number
  kind: NoteKind
  text: string
  tone: 'ok' | 'bad' | 'warn' | 'new'
  /** Notes that say the same thing are one note with a count. */
  key: string
  count: number
  /** How long it stays once it is the one on show, in ms. 0 stays until dismissed. */
  ttl: number
  action?: NoteAction
}

export type NewNote = Omit<Note, 'id' | 'count' | 'key' | 'ttl'> & { key?: string; ttl?: number }

/** What is shown first: the answer to what the player just did, then what needs them, then what is new. */
const RANK: Record<NoteKind, number> = { say: 0, alert: 1, unlock: 2 }
/** The most alerts kept waiting; older ones give way. */
export const MAX_ALERTS = 6
const TTL: Record<NoteKind, number> = { say: 3400, alert: 9000, unlock: 0 }

let serial = 0

/**
 * Add a note. A note that repeats one already waiting is counted on it, not
 * queued again. Only the latest answer to the player's own action is kept:
 * a new one replaces an older one that has not gone yet.
 */
export function pushNote(queue: readonly Note[], add: NewNote): Note[] {
  const key = add.key ?? `${add.kind}:${add.text}`
  const ttl = add.ttl ?? (add.kind === 'say' && add.tone === 'bad' ? 5200 : TTL[add.kind])
  const same = queue.find((n) => n.key === key)
  if (same) return queue.map((n) => (n === same ? { ...n, count: n.count + 1, text: add.text, action: add.action ?? n.action } : n))
  const note: Note = { ...add, id: ++serial, key, ttl, count: 1 }
  let next = add.kind === 'say' ? queue.filter((n) => n.kind !== 'say') : [...queue]
  next = [...next, note]
  const alerts = next.filter((n) => n.kind === 'alert')
  if (alerts.length > MAX_ALERTS) {
    const gone = new Set(alerts.slice(0, alerts.length - MAX_ALERTS).map((n) => n.id))
    next = next.filter((n) => !gone.has(n.id))
  }
  return next
}

/** The one note on show: by kind, then oldest first. */
export function currentNote(queue: readonly Note[]): Note | undefined {
  let best: Note | undefined
  for (const n of queue) if (!best || RANK[n.kind] < RANK[best.kind]) best = n
  return best
}

export const dropNote = (queue: readonly Note[], id: number): Note[] => queue.filter((n) => n.id !== id)

/** Take away the notes that match: the announcements of a place that has now been visited, say. */
export const dropNotes = (queue: readonly Note[], gone: (n: Note) => boolean): Note[] => queue.filter((n) => !gone(n))
