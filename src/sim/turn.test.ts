import { describe, expect, it } from 'vitest'
import { defaultConfig, newGame, starterDesign } from './game'
import { canTurn, clampPart, knobTurn, turnPart } from './geometry'
import type { PlacedPart } from './types'

describe('turning a part', () => {
  it('reads the knob against the frame the part had when it was taken', () => {
    // the pointer a quarter turn round from the knob: 90 from where it started, however often it is asked
    const at = [-Math.sin(Math.PI / 2), Math.cos(Math.PI / 2)] as const
    let rot = 0
    for (let i = 0; i < 5; i++) rot = knobTurn(0, at[0], at[1])
    expect(rot).toBe(90)
    // the old reading added the angle to the turn already made, from the frame of the part as last drawn: it ran on
    expect(knobTurn(30, 0, 1)).toBe(30)
    expect(knobTurn(350, 0, 1)).toBe(345)
    expect(knobTurn(0, 0.0001, -1)).toBe(180)
  })

  it('never shrinks a part to fit a turn, and turning it back gives the part it was', () => {
    const d = starterDesign(newGame(defaultConfig()), 'phone')
    const b = d.body
    // a bar across the back turns a quarter and keeps its size
    const bar: PlacedPart = clampPart(b, { ...d.parts[0], id: 'bar', kind: 'island', face: 'back', x: 0, y: 0, w: b.width - 8, h: 6, rot: 0 }, 'phone')
    // a strip down the back, longer than the phone is wide: it cannot lie across
    const wide = { ...bar, w: 6, h: b.width + 10 }
    expect(turnPart(b, bar, 90, 'phone')?.rot).toBe(90)
    expect(turnPart(b, bar, 90, 'phone')?.w).toBe(bar.w)
    const big = clampPart(b, wide, 'phone')
    expect(turnPart(b, big, 90, 'phone')).toBeNull()
    const there = turnPart(b, bar, 45, 'phone')!
    expect(turnPart(b, there, 0, 'phone')).toMatchObject({ w: bar.w, h: bar.h, rot: 0 })
  })

  it('does not offer a turn where none can be drawn', () => {
    const d = starterDesign(newGame(defaultConfig()), 'phone')
    const p = d.parts[0]
    expect(canTurn({ ...p, face: 'left' }, 'phone')).toBe(false)
    expect(canTurn({ ...p, face: 'back' }, 'ring')).toBe(false)
    expect(canTurn({ ...p, face: 'back' }, 'phone')).toBe(true)
  })
})
