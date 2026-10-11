import { it } from 'vitest'
import type { Body } from './crowd'
import { bigOffice, crowdFor } from './scene.fixture'

it('dbg', () => {
  for (let seed = 1; seed < 6; seed++) one(seed)
})
function one(seed: number) {
  const s = bigOffice(60, seed)
  const { crowd, nav } = crowdFor(s)
  const walking = new Map<Body, number>()
  let longest = 0
  let where = ''
  for (let t = 7; t < 23; t += 1 / 30 / 45) {
    crowd.step(1 / 30, 1, t)
    for (const b of crowd.bodies) {
      if (b.mode === 2 || b.mode === 1 || b.mode === 6) {
        const w = (walking.get(b) ?? 0) + 1 / 30
        walking.set(b, w)
        if (w > longest) {
          longest = w
          where = `${b.id} at ${t.toFixed(2)} tile ${nav.tileAt(b.x, b.z) % nav.w},${Math.floor(nav.tileAt(b.x, b.z) / nav.w)} path ${b.pathAt}/${b.pathLen}`
        }
      } else walking.set(b, 0)
    }
  }
  console.log(`seed ${seed} ghosts=${crowd.ghosts} longest walk ${longest.toFixed(1)}s (${where}) on site at 23h: ${crowd.bodies.filter((b) => b.mode !== 0).length}`)
}
