import { it } from 'vitest'
import { curveTiles } from './curves'
import { defaultConfig, newGame, removeRoom, upgradeOffice, zoneRoom } from './game'

function campus(tiers = 2) {
  const s = newGame({ ...defaultConfig(), seed: 7, unlimitedMoney: true })
  for (let i = 0; i < tiers; i++) upgradeOffice(s)
  removeRoom(s, 'office', s.office.rooms[0].n)
  s.office.items = []
  return s
}
const len = (spans: [number, number][]) => spans.reduce((a, [u, v]) => a + v - u, 0)

it('scratch chains', () => {
  const out: string[] = []
  for (let w = 3; w <= 40; w++) {
    for (let h = 3; h <= 40; h++) {
      for (const sweep of [360, 180, 90]) {
        const s = campus(4)
        if (zoneRoom(s, 'office', 'atrium', 4, 4, 3 + w, 3 + h, 'round', undefined, { sweep })) continue
        zoneRoom(s, 'office', 'soft', 1, 1, 6 + w, 6 + h)
        const bad = [...curveTiles(s.office).values()].filter((t) => !t.beyond && (['n', 's', 'e', 'w'] as const).some((k) => len(t.shape.sides[k]) <= 0.98))
        if (bad.length) out.push(`${sweep} ${w}x${h}: ${bad.map((t) => `${t.shape.x},${t.shape.y}`).join(' ')}`)
      }
    }
  }
  console.log('GROUND LEFT:\n' + out.join('\n'))
})
