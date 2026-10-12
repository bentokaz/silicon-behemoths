import { describe, expect, it } from 'vitest'
import { MAX_ALERTS, type Note, currentNote, dropNote, dropNotes, pushNote } from './notes'

const say = (text: string, tone: 'ok' | 'bad' = 'ok') => ({ kind: 'say' as const, text, tone })
const alert = (text: string) => ({ kind: 'alert' as const, text, tone: 'warn' as const })
const unlock = (name: string) => ({ kind: 'unlock' as const, text: `Now open: ${name}`, tone: 'new' as const, key: `unlock:${name}` })

describe('the messenger queue', () => {
  it('shows one note at a time: the answer to an action, then what needs the player, then what is new', () => {
    let q: Note[] = []
    q = pushNote(q, unlock('Research'))
    expect(currentNote(q)?.kind).toBe('unlock')
    q = pushNote(q, alert('Vista is sold out'))
    expect(currentNote(q)?.text).toBe('Vista is sold out')
    q = pushNote(q, say('Hired Ada Park.'))
    expect(currentNote(q)?.text).toBe('Hired Ada Park.')
    // as each goes, the next in line shows; nothing is lost
    q = dropNote(q, currentNote(q)!.id)
    expect(currentNote(q)?.text).toBe('Vista is sold out')
    q = dropNote(q, currentNote(q)!.id)
    expect(currentNote(q)?.text).toBe('Now open: Research')
    q = dropNote(q, currentNote(q)!.id)
    expect(currentNote(q)).toBeUndefined()
  })

  it('keeps notes of one kind in the order they came', () => {
    let q: Note[] = []
    q = pushNote(q, unlock('Research'))
    q = pushNote(q, unlock('Market'))
    expect(currentNote(q)?.text).toBe('Now open: Research')
    q = dropNote(q, currentNote(q)!.id)
    expect(currentNote(q)?.text).toBe('Now open: Market')
  })

  it('counts a repeat on the note already waiting instead of queueing it again', () => {
    let q: Note[] = []
    for (let i = 0; i < 10; i++) q = pushNote(q, alert('Vista is sold out'))
    expect(q).toHaveLength(1)
    expect(q[0].count).toBe(10)
  })

  it('keeps only the latest answer to what the player did', () => {
    let q: Note[] = []
    q = pushNote(q, say('Saved to the Quick slot.'))
    q = pushNote(q, say('Price changed.'))
    expect(q.filter((n) => n.kind === 'say')).toHaveLength(1)
    expect(currentNote(q)?.text).toBe('Price changed.')
  })

  it('lets a refusal stay longer than a confirmation, and an announcement until it is dismissed', () => {
    const ok = pushNote([], say('Saved.'))[0]
    const bad = pushNote([], say('Not enough cash.', 'bad'))[0]
    expect(bad.ttl).toBeGreaterThan(ok.ttl)
    expect(pushNote([], unlock('Research'))[0].ttl).toBe(0)
  })

  it('never lets alerts pile up without end', () => {
    let q: Note[] = []
    for (let i = 0; i < 20; i++) q = pushNote(q, alert(`Device ${i} is sold out`))
    expect(q).toHaveLength(MAX_ALERTS)
    // the oldest gave way
    expect(q[0].text).toBe(`Device ${20 - MAX_ALERTS} is sold out`)
  })

  it('takes away the announcements of a place once it has been visited', () => {
    let q: Note[] = []
    q = pushNote(q, unlock('Research'))
    q = pushNote(q, unlock('Market'))
    q = dropNotes(q, (n) => n.key === 'unlock:Research')
    expect(q.map((n) => n.text)).toEqual(['Now open: Market'])
  })

  it('gives every note its own id', () => {
    const q = pushNote(pushNote([], alert('a')), alert('b'))
    expect(new Set(q.map((n) => n.id)).size).toBe(2)
  })
})
