import { beforeAll, describe, expect, it } from 'vitest'
import { EXTRAS } from '../data/catalog'
import { ioOptions, TYPES } from '../data/devices'
import { CHIP_MODELS, PART_NOTES, featurePart } from '../data/featureParts'
import { DEVICE_TYPES } from '../sim/types'
import { FEATURE_MODELS } from '../sim/internals'

// the printed labels on a few parts draw on a canvas: a do-nothing one is enough to build the geometry
beforeAll(() => {
  const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true })
  ;(globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) }
})

// features shown by demonstrations of their own (a headset's sensing, a speaker's listening, a handheld's controls)
const OWN_DEMO = (type: string, id: string) => type === 'headset' || type === 'speaker' || (type === 'handheld' && (id === 'gyro' || id === 'dock' || id === 'paddles'))

describe('every special feature is a part of its own', () => {
  const keys: [string, string][] = []
  for (const type of DEVICE_TYPES) {
    for (const id of TYPES[type].extras) keys.push([type, `extra:${id}`])
    for (const io of ioOptions(type)) if (!io.size && !OWN_DEMO(type, io.id)) keys.push([type, `io:${io.id}`])
  }

  it('has a part, and only chips are drawn as chips', () => {
    const missing = keys.filter(([t, k]) => !featurePart(t as never, k)).map(([t, k]) => `${t} ${k}`)
    expect(missing).toEqual([])
    for (const e of EXTRAS) expect(featurePart('phone', `extra:${e.id}`), e.id).toBeTruthy()
    const chips = keys.filter(([t, k]) => CHIP_MODELS.has(featurePart(t as never, k)!.model)).map(([, k]) => k.split(':')[1])
    // processors, memory and the like: nothing that is really a coil, an aerial, a sensor or a sheet
    for (const id of chips) expect(['esim', 'translate', 'earc', 'vrr', 'stream', 'dict', 'ink', 'assist', 'edit', 'track', 'sync', 'memory', 'poll']).toContain(id)
    expect(chips.length / keys.length).toBeLessThan(0.2)
  })

  it('draws every model as itself, never the generic block', async () => {
    const { buildFeature } = await import('./teardown')
    const models = new Set(keys.map(([t, k]) => featurePart(t as never, k)!.model))
    for (const m of models) {
      const g = buildFeature(m, 20, 16, 4, 0)
      expect(g.userData.generic, m).toBeUndefined()
      expect(g.children.length, m).toBeGreaterThan(1)
      expect(PART_NOTES[m] ?? FEATURE_MODELS[m] ?? ['wheel', 'switch', 'weight'].includes(m), m).toBeTruthy()
    }
    expect(buildFeature('nothing-like-it', 10, 10, 2).userData.generic).toBe(true)
  })

  it('gives most features a model no other feature on the same device shares', () => {
    for (const type of DEVICE_TYPES) {
      const parts = keys.filter(([t]) => t === type).map(([, k]) => featurePart(type, k)!)
      const looks = new Set(parts.map((p) => `${p.model}:${p.v ?? 0}`))
      // water grades are one seal at three strengths; everything else should look its own
      expect(looks.size, type).toBeGreaterThanOrEqual(parts.length - 3)
    }
  })
})
