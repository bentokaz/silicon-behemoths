import { describe, expect, it } from 'vitest'
import { int, money, num, pct, readNumber } from './format'

describe('writing numbers', () => {
  it('writes money in short form above ten thousand', () => {
    expect(money(0)).toBe('$0')
    expect(money(9999)).toBe('$9,999')
    expect(money(12345)).toBe('$12.3K')
    expect(money(2.5e6)).toBe('$2.50M')
    expect(money(2.5e6, 1)).toBe('$2.5M')
    expect(money(2.5e6, 0)).toBe('$3M')
    expect(money(1.25e9)).toBe('$1.25B')
    expect(money(3.5e12)).toBe('$3.50T')
  })

  it('writes a valuation the same way whatever precision the screen asked for', () => {
    expect(money(1.234e9, 1)).toBe('$1.23B')
    expect(money(1.234e9, 0)).toBe('$1.23B')
  })

  it('never shows a minus in front of nothing', () => {
    expect(money(-0.4)).toBe('$0')
    expect(money(-0)).toBe('$0')
    expect(num(-0.4)).toBe('0')
    expect(num(-0)).toBe('0')
    expect(int(-0.2)).toBe('0')
    expect(pct(-0.0001)).toBe('0.0%')
    expect(pct(-0.004, 0)).toBe('0%')
    expect(money(-1500)).toBe('-$1,500')
    expect(pct(-0.05)).toBe('-5.0%')
  })

  it('never shows a raw value', () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined as unknown as number]) {
      expect(money(bad)).toBe('--')
      expect(num(bad)).toBe('--')
      expect(int(bad)).toBe('--')
      expect(pct(bad)).toBe('--')
    }
    expect(money(1e21)).not.toMatch(/e\+/)
    expect(money(1e30)).not.toMatch(/e\+/)
    expect(num(1e21)).not.toMatch(/e\+/)
  })

  it('moves up a unit instead of writing a thousand of the one below', () => {
    expect(money(999_999)).toBe('$1.00M')
    expect(money(999_949)).toBe('$999.9K')
    expect(money(999_999_999)).toBe('$1.00B')
    expect(num(999_999)).toBe('1.00M')
    expect(money(9_999.6)).toBe('$10,000')
  })

  it('groups digits with commas whatever the language of the browser', () => {
    expect(int(1234567)).toBe('1,234,567')
    expect(num(1234)).toBe('1,234')
  })

  it('reads what was typed into a number field', () => {
    expect(readNumber('')).toBe(0)
    expect(readNumber('   ')).toBe(0)
    expect(readNumber('abc')).toBe(0)
    expect(readNumber('-5')).toBe(0)
    expect(readNumber('1.5')).toBe(2)
    expect(readNumber('1.5', { whole: false })).toBe(1.5)
    expect(readNumber('1e30')).toBe(1e9)
    expect(readNumber('250', { min: 100, max: 200 })).toBe(200)
    expect(readNumber('', { min: 100 })).toBe(100)
    expect(readNumber('-5', { min: -10 })).toBe(-5)
  })
})
