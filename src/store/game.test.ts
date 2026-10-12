// The parts of the store that are about the interface rather than the
// simulation: what happens to a design when the designer is left, and what
// must not follow the player from one game into the next.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { defaultConfig } from '../sim/game'
import { keepView, viewKept } from './focus'
import { useStore } from './game'

const st = () => useStore.getState()
const start = () => st().begin({ ...defaultConfig(), seed: 7, startType: 'phone', progression: 'open' })

beforeAll(() => {
  // the store shows its messages with a timer on the window
  ;(globalThis as { window?: unknown }).window ??= globalThis
})

describe('the design on the bench', () => {
  beforeEach(start)

  it('is set aside, not lost, when the designer is left with changes made', () => {
    st().openDesigner()
    st().setBody({ width: st().draft!.body.width + 2 })
    const draft = st().draft
    expect(st().past.length).toBe(1)
    st().setTab('products')
    expect(st().designing).toBe(false)
    expect(st().kept).toBe(true)
    expect(st().draft).toBe(draft)
    // asking for the designer again picks it up, undo history and all
    st().openDesigner()
    expect(st().designing).toBe(true)
    expect(st().kept).toBe(false)
    expect(st().draft).toBe(draft)
    expect(st().past.length).toBe(1)
    st().undo()
    expect(st().draft).not.toBe(draft)
  })

  it('is not kept when nothing was changed', () => {
    st().openDesigner()
    st().setTab('products')
    expect(st().kept).toBe(false)
    st().openDesigner()
    st().closeDesigner()
    expect(st().kept).toBe(false)
  })

  it('is thrown away when that is what was asked, or once it has been launched', () => {
    st().openDesigner()
    st().setBody({ width: st().draft!.body.width + 2 })
    const draft = st().draft
    st().closeDesigner(true)
    expect(st().kept).toBe(false)
    st().openDesigner()
    expect(st().draft).not.toBe(draft)
    expect(st().past.length).toBe(0)
  })

  it('gives way to a design that was asked for by name', () => {
    st().openDesigner()
    st().setBody({ width: st().draft!.body.width + 2 })
    const draft = st().draft
    st().closeDesigner()
    expect(st().kept).toBe(true)
    st().openDesigner({ type: 'phone' })
    expect(st().kept).toBe(false)
    expect(st().draft).not.toBe(draft)
    expect(st().past.length).toBe(0)
  })

  it('is left alone when the designer is asked for while it is already open', () => {
    st().openDesigner()
    st().setBody({ width: st().draft!.body.width + 2 })
    const draft = st().draft
    st().openDesigner()
    expect(st().draft).toBe(draft)
    expect(st().past.length).toBe(1)
  })
})

describe('what belongs to one game', () => {
  beforeEach(start)

  it('does not follow the player into another: no year-end summary, card, message or design from the last one', () => {
    st().openDesigner()
    st().setBody({ width: st().draft!.body.width + 2 })
    st().setTab('staff')
    useStore.setState({ yearEnd: 2027, person: 'e1', inspect: 'p1' })
    st().say('Saved.')
    keepView('staff:view', 'teams')
    const next = JSON.parse(JSON.stringify(st().game))
    for (const leave of [() => st().quit(), () => st().resume(next), () => start()]) {
      useStore.setState({ yearEnd: 2027, person: 'e1', inspect: 'p1', kept: true })
      keepView('staff:view', 'teams')
      leave()
      expect(st().yearEnd).toBeNull()
      expect(st().person).toBeNull()
      expect(st().inspect).toBeNull()
      expect(st().toast).toBeNull()
      expect(st().kept).toBe(false)
      expect(st().draft).toBeNull()
      expect(st().designing).toBe(false)
      expect(viewKept('staff:view')).toBe(false)
    }
  })

  it('closes a device or a person left open when another screen is chosen', () => {
    useStore.setState({ person: 'e1', inspect: 'p1' })
    st().setTab('finance')
    expect(st().tab).toBe('finance')
    expect(st().person).toBeNull()
    expect(st().inspect).toBeNull()
  })
})
