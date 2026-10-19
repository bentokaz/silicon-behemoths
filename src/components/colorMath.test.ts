import { describe, expect, it } from 'vitest'
import { hexToHsv, hexToRgb, hsvToHex, parseHex, pushRecent, rgbToHex } from './colorMath'

describe('colour maths', () => {
  it('parses hex in its short and long forms', () => {
    expect(parseHex('#ABC')).toBe('#aabbcc')
    expect(parseHex('abc')).toBe('#aabbcc')
    expect(parseHex(' #1a2B3c ')).toBe('#1a2b3c')
    expect(parseHex('1a2b3')).toBeNull()
    expect(parseHex('#ggg')).toBeNull()
    expect(parseHex('')).toBeNull()
  })
  it('converts between hex and rgb', () => {
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 })
    expect(rgbToHex({ r: 255, g: 128, b: 0 })).toBe('#ff8000')
    expect(rgbToHex({ r: 300, g: -4, b: 15.6 })).toBe('#ff0010')
  })
  it('converts to hsv and back', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 })
    expect(hexToHsv('#00ff00').h).toBeCloseTo(120)
    expect(hexToHsv('#0000ff').h).toBeCloseTo(240)
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 })
    expect(hsvToHex({ h: 60, s: 1, v: 1 })).toBe('#ffff00')
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000')
    for (const hex of ['#17191d', '#c8b89a', '#2f4f73', '#8c2f39', '#ffffff', '#5ab4ff']) expect(hsvToHex(hexToHsv(hex))).toBe(hex)
  })
  it('keeps recent colours first, unique and few', () => {
    expect(pushRecent(['#111111', '#222222'], '#222')).toEqual(['#222222', '#111111'])
    expect(pushRecent([], 'nope')).toEqual([])
    expect(pushRecent(Array.from({ length: 8 }, (_, i) => `#00000${i}`), '#ffffff')).toHaveLength(8)
  })
})
