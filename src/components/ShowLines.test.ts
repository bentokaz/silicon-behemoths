import { describe, expect, it } from 'vitest'
import { clockText, pressLines } from './ShowLines'

describe('the keynote pre-show', () => {
  it('counts down as a broadcast clock, never below zero', () => {
    expect(clockText(4.5)).toBe('00:05')
    expect(clockText(0.2)).toBe('00:01')
    expect(clockText(-3)).toBe('00:00')
    expect(clockText(75)).toBe('01:15')
  })
  it('has the press talk up a strong device and doubt a weak one', () => {
    const strong = pressLines(0.9, ['Camera', 'Battery'], 'Nova')
    const weak = pressLines(0.1, ['Camera'], 'Nova')
    expect(strong).toHaveLength(3)
    expect(strong[0][0]).toMatch(/camera/)
    expect(strong.map((q) => q[0]).join(' ')).not.toEqual(weak.map((q) => q[0]).join(' '))
  })
})
