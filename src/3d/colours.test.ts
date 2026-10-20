import { beforeAll, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { defaultConfig, newGame, starterDesign } from '../sim/game'
import { DEVICE_TYPES, type DeviceDesign } from '../sim/types'

// the screens, labels and logos draw on canvases: one that takes every call and answers with itself is enough here
beforeAll(() => {
  const ctx: object = new Proxy(function () {}, {
    get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'canvas' ? { width: 8, height: 8 } : k === Symbol.toPrimitive ? () => 0 : ctx),
    apply: () => ctx,
    set: () => true,
  })
  const canvas = () => ({ width: 8, height: 8, style: {}, getContext: () => ctx, toDataURL: () => '' })
  ;(globalThis as { document?: unknown }).document = { createElement: canvas }
})

/** Every colour any surface of a built model shows. */
function colours(g: THREE.Object3D): Set<string> {
  const out = new Set<string>()
  g.traverse((o) => {
    const ms = (o as THREE.Mesh).material
    for (const m of Array.isArray(ms) ? ms : ms ? [ms] : []) {
      const c = (m as THREE.MeshStandardMaterial).color
      if (c) out.add(c.getHexString())
    }
  })
  return out
}

describe('every colour field changes the model', () => {
  const s = newGame(defaultConfig())
  for (const type of DEVICE_TYPES) {
    it(type, async () => {
      const { buildDevice } = await import('./buildDevice')
      const d = starterDesign(s, type)
      const build = (patch: Partial<DeviceDesign['body']>) => colours(buildDevice({ ...d, body: { ...d.body, ...patch } }))
      const base = build({})
      // an odd colour nothing else in a model uses
      for (const field of ['frameColor', 'backColor'] as const) {
        const now = build({ [field]: '#13ab57' })
        const changed = [...now].some((c) => !base.has(c))
        expect(changed, `${type} ${field}`).toBe(true)
      }
    })
  }
})
