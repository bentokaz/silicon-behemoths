import { it } from 'vitest'
import { Mode } from './crowd'
import { bigOffice, crowdFor } from './scene.fixture'

it('bench: a day for sixty people', () => {
  const s = bigOffice(60)
  const { crowd } = crowdFor(s)
  let t = 6.5
  // warm up
  for (let i = 0; i < 600; i++) crowd.step(1 / 60, 1, (t += 1 / 60 / 45))
  const frames = 60 * 45 * 12
  let worst = 0
  let walking = 0
  const t0 = performance.now()
  for (let i = 0; i < frames; i++) {
    const a = performance.now()
    crowd.step(1 / 60, 1, (t += 1 / 60 / 45))
    const d = performance.now() - a
    if (d > worst) worst = d
    if (i % 60 === 0) for (const b of crowd.bodies) if (b.mode === Mode.Walk) walking++
  }
  const ms = (performance.now() - t0) / frames
  console.log(`BENCH bodies=${crowd.bodies.length} avg=${(ms * 1000).toFixed(1)}us worst=${worst.toFixed(2)}ms walkers/sample=${(walking / (frames / 60)).toFixed(1)} end=${t.toFixed(1)}`)
})
