// The city's plates: that what needs the player is on a plate for every item
// the simulation lists, and which plates show, in what form, for a view.
import { describe, expect, it } from 'vitest'
import { defaultConfig, newGame } from '../../sim/game'
import { attention } from '../../sim/insight'
import { districts } from './plan'
import { MARK, PLATE_FAR, PLATE_SHARE, PLATE_TOP, type PlateBox, arrange, cityPlates, covered, regionPlates } from './plates'

const VIEW = { w: 1008, h: 536 }
const box = (id: string, x: number, y: number, over: Partial<PlateBox> = {}): PlateBox => ({ id, x, y, w: 160, h: 59, needs: 0, rank: 0, dist: 400, ...over })
const rectOf = (b: PlateBox, at: { left: number; top: number; form: string }) => (at.form === 'full' ? { x0: at.left, y0: at.top, x1: at.left + b.w, y1: at.top + b.h } : { x0: at.left, y0: at.top, x1: at.left + MARK, y1: at.top + MARK })
const overlap = (a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

describe('which plates show', () => {
  it('shows a near plate in full, with its foot on the place', () => {
    const at = arrange([box('a', 500, 300)], VIEW, false).get('a')!
    expect(at).toEqual({ form: 'full', left: 420, top: 241 })
  })

  it('never lays one plate on another: the one that needs the player keeps the room, the other is left out or is a mark', () => {
    const quiet = box('quiet', 500, 300, { rank: 0 })
    const needy = box('needy', 520, 310, { rank: 6, needs: 2 })
    const first = arrange([quiet, needy], VIEW, false)
    expect(first.get('needy')!.form).toBe('full')
    expect(first.get('quiet')!.form).toBe('none')
    // two that both need something: the more important place is in full, the other a mark that stands clear of it
    const both = [box('campus', 500, 300, { rank: 0, needs: 1 }), box('store', 520, 310, { rank: 6, needs: 1 })]
    const second = arrange(both, VIEW, false)
    expect(second.get('campus')!.form).toBe('full')
    expect(second.get('store')!.form).toBe('mark')
    expect(overlap(rectOf(both[0], second.get('campus')!), rectOf(both[1], second.get('store')!))).toBe(false)
  })

  it('from far off shows only what needs the player, as a mark', () => {
    const boxes = [box('quiet', 300, 300, { dist: PLATE_FAR + 1 }), box('needy', 600, 300, { dist: PLATE_FAR + 1, needs: 3 }), box('near', 800, 400, { dist: PLATE_FAR })]
    const at = arrange(boxes, VIEW, false)
    expect(at.get('quiet')!.form).toBe('none')
    expect(at.get('needy')!.form).toBe('mark')
    expect(at.get('near')!.form).toBe('full')
  })

  it('keeps the plates under a fifth of the view, however many places there are', () => {
    // a grid of sixty places, none on top of another
    const boxes = Array.from({ length: 60 }, (_, i) => box(`p${i}`, 90 + (i % 6) * 166, 110 + Math.floor(i / 6) * 64, { rank: i % 7, needs: i % 5 === 0 ? 1 : 0 }))
    const at = arrange(boxes, VIEW, false)
    expect(covered(boxes, at, VIEW)).toBeLessThanOrEqual(0.2)
    const full = boxes.filter((b) => at.get(b.id)!.form === 'full')
    expect(full.reduce((a, b) => a + b.w * b.h, 0)).toBeLessThanOrEqual(VIEW.w * VIEW.h * PLATE_SHARE)
    // whatever needs the player is still there, in one form or the other
    for (const b of boxes) if (b.needs) expect(at.get(b.id)!.form).not.toBe('none')
    const shown = boxes.filter((b) => at.get(b.id)!.form !== 'none').map((b) => rectOf(b, at.get(b.id)!))
    let clashes = 0
    for (const a of shown) for (const b of shown) if (a !== b && overlap(a, b)) clashes++
    expect(clashes).toBe(0)
  })

  it('always shows the plate under the pointer in full', () => {
    const boxes = [box('a', 500, 300, { needs: 5 }), box('b', 505, 302, { pinned: true, dist: PLATE_FAR * 3 })]
    const at = arrange(boxes, VIEW, false)
    expect(at.get('b')!.form).toBe('full')
    expect(at.get('a')!.form).toBe('mark')
  })

  it('with the regions layer on shows the districts in full and the buildings as marks', () => {
    const boxes = [box('campus', 500, 300, { needs: 2 }), box('venue', 300, 300), box('region:eu', 150, 200, { region: true, dist: 900 }), box('region:na', 520, 330, { region: true, dist: 800 })]
    const on = arrange(boxes, VIEW, true)
    expect(on.get('region:eu')!.form).toBe('full')
    expect(on.get('region:na')!.form).toBe('full')
    expect(on.get('campus')!.form).toBe('mark')
    expect(on.get('venue')!.form).toBe('none')
    const off = arrange(boxes, VIEW, false)
    expect(off.get('region:eu')!.form).toBe('none')
    expect(off.get('region:na')!.form).toBe('none')
    expect(off.get('campus')!.form).toBe('full')
  })

  it('keeps a plate inside the view and under the toolbar', () => {
    const at = arrange([box('edge', 10, 20), box('right', VIEW.w - 5, 400)], VIEW, false)
    expect(at.get('edge')!.left).toBeGreaterThanOrEqual(0)
    expect(at.get('edge')!.top).toBeGreaterThanOrEqual(PLATE_TOP)
    expect(at.get('right')!.left + 160).toBeLessThanOrEqual(VIEW.w)
  })
})

describe('what the plates say', () => {
  const rich = () => newGame({ ...defaultConfig(), seed: 7, unlimitedMoney: true })

  it('gives a new company a plate on its campus and one on the port, with nothing needing it', () => {
    const plates = cityPlates(rich())
    expect(plates.map((p) => p.placeId)).toEqual(expect.arrayContaining(['office', 'port']))
    for (const p of plates) expect(p.lines.length).toBeLessThanOrEqual(3)
    // the port's plate leads to the devices, which are open from the first day
    expect(plates.find((p) => p.placeId === 'port')!.where).toEqual({ tab: 'products' })
  })

  it('puts everything that needs the player on a plate, the homeless on the campus', () => {
    const g = rich()
    // a debt before the company has anything to do with the exchange has no building of its own
    g.config.unlimitedMoney = false
    g.cash = -5000
    const todo = attention(g)
    expect(todo.some((a) => a.id === 'debt')).toBe(true)
    const plates = cityPlates(g)
    for (const a of todo) expect(plates.some((p) => p.notes.includes(a.text)), a.id).toBe(true)
    expect(plates.reduce((a, p) => a + p.needs, 0)).toBe(todo.length)
    const campus = plates.find((p) => p.placeId === 'office')!
    expect(campus.tone).toBe('neg')
    expect(campus.lines.at(-1)!.text).toMatch(/^In debt/)
    expect(campus.where).toEqual({ tab: 'finance' })
  })

  it('gives every district a plate that says how the company stands there', () => {
    const g = rich()
    const all = regionPlates(g, districts(g))
    expect(all).toHaveLength(6)
    expect(all.filter((r) => r.state === 'home')).toHaveLength(1)
    expect(all.find((r) => r.state === 'home')!.line).toMatch(/^Home: 0 stores, awareness \d+%$/)
    for (const r of all.filter((x) => x.state === 'closed')) expect(r.line).toBe('Not entered')
  })
})
