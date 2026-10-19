import { describe, expect, it } from 'vitest'
import { editText, fitValue, inferField, parseTyped, placesOf, readField, stepValue } from './numField'

describe('parseTyped', () => {
  it('reads figures with units, signs and separators', () => {
    expect(parseTyped('95')).toBe(95)
    expect(parseTyped(' 95 mm ')).toBe(95)
    expect(parseTyped('95.5mm')).toBe(95.5)
    expect(parseTyped('-3.5 deg')).toBe(-3.5)
    expect(parseTyped('−2')).toBe(-2)
    expect(parseTyped('40%')).toBe(40)
    expect(parseTyped('$2,400')).toBe(2400)
    expect(parseTyped('.5')).toBe(0.5)
  })
  it('multiplies by k, M and B but not by a unit that starts with one', () => {
    expect(parseTyped('1.5M')).toBe(1.5e6)
    expect(parseTyped('$20k')).toBe(20000)
    expect(parseTyped('2B')).toBe(2e9)
    expect(parseTyped('8 Mb')).toBe(8)
    expect(parseTyped('5 mm')).toBe(5)
  })
  it('is null without a figure', () => {
    expect(parseTyped('')).toBeNull()
    expect(parseTyped('mm')).toBeNull()
    expect(parseTyped('-')).toBeNull()
    expect(parseTyped('.')).toBeNull()
  })
})

describe('fitting a value', () => {
  it('clamps and snaps', () => {
    expect(fitValue(200, { min: 0, max: 100 })).toBe(100)
    expect(fitValue(-5, { min: 0, max: 100 })).toBe(0)
    expect(fitValue(95.37, { min: 0, max: 100, step: 0.5, snap: true })).toBe(95.5)
    expect(fitValue(0.1 + 0.2, { min: 0, max: 1, step: 0.05, snap: true })).toBe(0.3)
    expect(fitValue(3, { min: 2, max: 6, step: 2, snap: true })).toBe(4)
    expect(fitValue(NaN, { min: 5, max: 10 })).toBe(5)
  })
  it('reads typed text into a value, scaled', () => {
    expect(readField('95 mm', { min: 50, max: 90, step: 0.5, snap: true })).toBe(90)
    expect(readField('40%', { min: 0, max: 1, step: 0.05, snap: true, scale: 100 })).toBe(0.4)
    expect(readField('abc', { min: 0, max: 1 })).toBeNull()
  })
  it('steps by arrow keys', () => {
    expect(stepValue(10, 1, { min: 0, max: 100, step: 0.5 })).toBe(10.5)
    expect(stepValue(10, -1, { min: 0, max: 100, step: 0.5, big: true })).toBe(5)
    expect(stepValue(99, 1, { min: 0, max: 100, step: 5 })).toBe(100)
  })
  it('shows a value for editing', () => {
    expect(placesOf(0.25)).toBe(2)
    expect(placesOf(0.5)).toBe(1)
    expect(placesOf(10)).toBe(0)
    expect(editText(95.5000001, 2)).toBe('95.5')
  })
})

describe('inferField', () => {
  it('finds the unit of a plain readout', () => {
    expect(inferField((v) => `${v.toFixed(1)} mm`, 50, 90)).toEqual({ scale: 1, unit: 'mm' })
    expect(inferField((v) => `${Math.round(v)} mm`, 500, 1900)).toEqual({ scale: 1, unit: 'mm' })
    expect(inferField((v) => `${v} deg`, 0, 345)).toEqual({ scale: 1, unit: 'deg' })
  })
  it('finds a percentage of a fraction', () => {
    expect(inferField((v) => `${Math.round(v * 100)}%`, 0, 1)).toEqual({ scale: 100, unit: '%' })
  })
  it('reads money readouts', () => {
    const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`)
    expect(inferField(money, 0, 20e6)).toEqual({ scale: 1, unit: '' })
  })
  it('leaves readouts that are words or do not show the value alone', () => {
    expect(inferField((v) => (v ? `${Math.round(v * 100)}%` : 'Off'), 0, 1)).toBeNull()
    expect(inferField(() => '$5.0M', 5, 9)).toBeNull()
  })
})
