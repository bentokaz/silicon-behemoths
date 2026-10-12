import { beforeEach, describe, expect, it } from 'vitest'
import { freshSign, maybeAsk, noteRefusal, noteTrouble, recentSigns, resetTrouble, useFeedback } from './trouble'

describe('noticing trouble', () => {
  beforeEach(resetTrouble)

  it('asks nothing while all is quiet', () => {
    expect(freshSign()).toBeNull()
    expect(maybeAsk()).toBe(false)
    expect(useFeedback.getState().ask).toBeNull()
  })

  it('takes the same refusal three times as being stuck, not once or twice', () => {
    noteRefusal('Not enough cash')
    noteRefusal('Pick a room first')
    noteRefusal('Not enough cash')
    expect(freshSign()).toBeNull()
    noteRefusal('Not enough cash')
    expect(freshSign()?.kind).toBe('stuck')
    expect(useFeedback.getState().flagged).toBe(true)
  })

  it('asks once about fresh trouble, most serious first, and not again straight away', () => {
    noteTrouble('rage', 'clicked "Launch" 5 times in a row')
    noteTrouble('error', 'boom')
    expect(maybeAsk()).toBe(true)
    expect(useFeedback.getState().ask?.kind).toBe('error')
    useFeedback.getState().dismiss()
    noteTrouble('slow', 'frames 200 ms apart')
    expect(maybeAsk()).toBe(false)
    expect(recentSigns()).toHaveLength(3)
  })

  it('stays quiet while the form is open and clears the mark when it opens', () => {
    noteTrouble('error', 'boom')
    useFeedback.getState().open('bug')
    expect(useFeedback.getState().flagged).toBe(false)
    expect(maybeAsk()).toBe(false)
  })

  it('lets old trouble go', () => {
    noteTrouble('error', 'boom')
    expect(freshSign(Date.now() + 5 * 60e3)).toBeNull()
  })
})
