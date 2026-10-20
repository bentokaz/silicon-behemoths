import { describe, expect, it } from 'vitest'
import { newSite } from '../../sim/sites'
import type { OfficeLife } from '../../sim/life'
import { meetingTopic, tableJoins } from './meetings'

describe('meetings', () => {
  it('joins meeting tables that stand end to end in one room', () => {
    const site = newSite('office', 0)
    site.rooms = [{ n: 1, type: 'meeting', style: 0 }]
    for (let y = 2; y < 6; y++) for (let x = 2; x < 10; x++) site.grid[y * site.w + x] = 1
    site.items = [
      { id: 'a', kind: 'meeting', x: 2, y: 2, rot: 0 },
      { id: 'b', kind: 'meeting', x: 4, y: 2, rot: 0 },
      { id: 'c', kind: 'meeting', x: 8, y: 2, rot: 0 },
    ]
    const j = tableJoins(site)
    expect(j.get('a')).toEqual([false, true])
    expect(j.get('b')).toEqual([true, false])
    expect(j.has('c')).toBe(false)
  })

  it('meets about what the company is doing, unreleased work behind frosted glass', () => {
    const office = { dev: [{ product: { name: 'Behemoth X' }, progress: 0.4, daysLeft: 30 }], research: [], os: { name: 'BehemOS', version: 2, own: true, quality: 0, industry: 0, project: { progress: 0.2, daysLeft: 40 }, services: 0 }, campaigns: [], onSale: [], support: { tickets: 0, capacity: 0, load: 0 } } as unknown as OfficeLife
    const seen = new Set([0, 1, 2, 3].map((t) => meetingTopic(office, t, 5).text))
    expect([...seen].some((t) => t.startsWith('Behemoth X'))).toBe(true)
    expect([...seen].some((t) => t === 'Sprint planning for BehemOS 3')).toBe(true)
    expect(meetingTopic(office, 1, 5).secret).toBe(true)
    expect(meetingTopic(undefined, 1, 5).text).toBe('Weekly planning')
  })
})
