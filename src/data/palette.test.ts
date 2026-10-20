import { describe, expect, it } from 'vitest'
import { defaultConfig, newGame, starterDesign } from '../sim/game'
import type { Product } from '../sim/types'
import { DEVICE_PALETTE, houseColours, inHouseColours } from './palette'

describe('device colours', () => {
  const s = newGame(defaultConfig())
  const made = (type: Product['type'], back: string, frame: string, launchDay: number, companyId = 'player') => {
    const d = starterDesign(s, type)
    return { companyId, type, launchDay, design: { ...d, body: { ...d.body, backColor: back, frameColor: frame } } } as Product
  }

  it('offers named colours, each a real hex once', () => {
    const all = DEVICE_PALETTE.flatMap((f) => f.colours)
    expect(all.length).toBeGreaterThan(30)
    expect(new Set(all.map((c) => c.hex)).size).toBe(all.length)
    for (const c of all) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('remembers the company colours, newest first, each once, and never a rival', () => {
    const products = [made('phone', '#111111', '#222222', 10), made('watch', '#333333', '#111111', 50), made('phone', '#999999', '#999999', 90, 'rival')]
    expect(houseColours(products)).toEqual(['#333333', '#111111', '#222222'])
  })

  it('starts a new design from the last one of its kind, or of any kind', () => {
    const products = [made('phone', '#111111', '#222222', 10), made('watch', '#333333', '#444444', 50)]
    const phone = inHouseColours(starterDesign(s, 'phone'), products, 'phone')
    expect([phone.body.backColor, phone.body.frameColor]).toEqual(['#111111', '#222222'])
    const tablet = inHouseColours(starterDesign(s, 'tablet'), products, 'tablet')
    expect([tablet.body.backColor, tablet.body.frameColor]).toEqual(['#333333', '#444444'])
    const first = starterDesign(s, 'phone')
    expect(inHouseColours(first, [], 'phone')).toBe(first)
  })
})
