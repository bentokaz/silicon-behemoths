import { describe, expect, it } from 'vitest'
import { int, money, moneyDelta, num, pct, price, readNumber } from './format'

describe('writing numbers', () => {
  it('writes every amount to three significant figures', () => {
    expect(money(0)).toBe('$0')
    expect(money(449)).toBe('$449')
    expect(money(1200)).toBe('$1.2K')
    expect(money(1234)).toBe('$1.23K')
    expect(money(9150)).toBe('$9.15K')
    expect(money(14000)).toBe('$14K')
    expect(money(12345)).toBe('$12.3K')
    expect(money(123456)).toBe('$123K')
    expect(money(2.74e6)).toBe('$2.74M')
    expect(money(17.14e6)).toBe('$17.1M')
    expect(money(3.41e9)).toBe('$3.41B')
    expect(money(3.5e12)).toBe('$3.5T')
  })

  it('never writes a trailing zero', () => {
    expect(money(250_000)).toBe('$250K')
    expect(money(100_000)).toBe('$100K')
    expect(money(22e6)).toBe('$22M')
    expect(money(2.5e6)).toBe('$2.5M')
    expect(money(1e9)).toBe('$1B')
    expect(money(1.05e6)).toBe('$1.05M')
    expect(money(10.5e6)).toBe('$10.5M')
    expect(pct(0.5)).toBe('50%')
    expect(pct(0.123)).toBe('12.3%')
  })

  it('writes the same amount the same way whatever precision the screen asked for', () => {
    expect(money(1.234e9, 1)).toBe('$1.23B')
    expect(money(1.234e9, 0)).toBe('$1.23B')
    expect(money(2.5e6, 0)).toBe('$2.5M')
  })

  it('writes a figure the player sets in full', () => {
    expect(price(1299)).toBe('$1,299')
    expect(price(449)).toBe('$449')
    expect(price(-20)).toBe('-$20')
    expect(price(NaN)).toBe('--')
  })

  it('writes a change with its sign', () => {
    expect(moneyDelta(1200)).toBe('+$1.2K')
    expect(moneyDelta(-340)).toBe('-$340')
    expect(moneyDelta(0)).toBe('$0')
    expect(moneyDelta(-0.2)).toBe('$0')
  })

  it('never shows a minus in front of nothing', () => {
    expect(money(-0.4)).toBe('$0')
    expect(money(-0)).toBe('$0')
    expect(num(-0.4)).toBe('0')
    expect(num(-0)).toBe('0')
    expect(int(-0.2)).toBe('0')
    expect(pct(-0.0001)).toBe('0%')
    expect(pct(-0.004, 0)).toBe('0%')
    expect(money(-1500)).toBe('-$1.5K')
    expect(pct(-0.05)).toBe('-5%')
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
    expect(money(999_999)).toBe('$1M')
    expect(money(999_400)).toBe('$999K')
    expect(money(999_500)).toBe('$1M')
    expect(money(999_999_999)).toBe('$1B')
    expect(num(999_999)).toBe('1M')
    expect(money(999.6)).toBe('$1K')
    expect(money(999.4)).toBe('$999')
    // a rival's unlimited stock is a thousand billion, not "1000.00B"
    expect(num(1e12)).toBe('1T')
  })

  it('groups digits with commas whatever the language of the browser', () => {
    expect(int(1234567)).toBe('1,234,567')
    expect(num(1234)).toBe('1.23K')
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
