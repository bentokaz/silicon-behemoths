import { describe, expect, it } from 'vitest'
import { DEFAULT_OS_LOOK, OS_LOOK_CHOICES } from '../sim/tech'
import type { OsLook } from '../sim/types'
import { type OsScreen, paintOsLook } from './osLook'

const KINDS: OsScreen[] = ['phone', 'tablet', 'desktop', 'watch', 'tv', 'console', 'handheld', 'ereader', 'display']

/** A canvas that writes down every call and every setting, so that two paintings can be compared. */
function recorder(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = []
  const grad = { addColorStop: (o: number, c: string) => log.push(`stop ${o} ${c}`) }
  const target: Record<string, unknown> = {}
  const ctx = new Proxy(target, {
    get: (_, k: string) => {
      if (k === 'measureText') return (s: string) => ({ width: s.length * 6, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 2 })
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient' || k === 'createPattern') return (...a: unknown[]) => (log.push(`${k} ${a.map((x) => (typeof x === 'number' ? x.toFixed(1) : '')).join(',')}`), grad)
      if (k === 'getImageData' || k === 'createImageData') return () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 })
      if (k === 'canvas') return { width: 300, height: 300 }
      if (k in target) return target[k]
      return (...a: unknown[]) => log.push(`${k}(${a.map((x) => (typeof x === 'number' ? x.toFixed(1) : String(x))).join(',')})`)
    },
    set: (_, k: string, v) => {
      target[k] = v
      log.push(`${k}=${String(v)}`)
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, log }
}

const paint = (look: OsLook, kind: OsScreen, screen: 'home' | 'lock') => {
  const r = recorder()
  const size = kind === 'phone' || kind === 'ereader' || kind === 'watch' ? [180, 360] : [440, 260]
  paintOsLook(r.ctx, look, size[0], size[1], kind, screen, 0.3)
  return r.log.join('\n')
}

// what each choice is for, and where it cannot show: the motion setting moves things rather than drawing them,
// an e-reader's paper screen has no wallpaper, and so on
const NOT_ON: Partial<Record<keyof typeof OS_LOOK_CHOICES, OsScreen[]>> = {
  motion: KINDS,
  wallStyle: ['ereader'],
  // a watch has no dock: its apps are a honeycomb and its face has complications
  dock: ['watch'],
  // the choices made for one kind of screen show on that kind
  watchFace: KINDS.filter((k) => k !== 'watch'),
  tvRow: KINDS.filter((k) => k !== 'tv' && k !== 'console'),
  taskbar: KINDS.filter((k) => k !== 'desktop'),
}

describe('a kind of screen can be set apart from the shared look', () => {
  it('uses its own choices there and the shared look everywhere else', () => {
    const look: OsLook = { ...DEFAULT_OS_LOOK, kinds: { watch: { accent: '#00ff00', watchFace: 'rings' } } }
    expect(paint(look, 'watch', 'lock')).not.toBe(paint(DEFAULT_OS_LOOK, 'watch', 'lock'))
    expect(paint(look, 'phone', 'home')).toBe(paint(DEFAULT_OS_LOOK, 'phone', 'home'))
  })
})

describe('every choice of the OS look shows on every screen', () => {
  for (const key of Object.keys(OS_LOOK_CHOICES) as (keyof typeof OS_LOOK_CHOICES)[]) {
    it(key, () => {
      const dead: string[] = []
      for (const kind of KINDS) {
        if (NOT_ON[key]?.includes(kind)) continue
        const values = OS_LOOK_CHOICES[key] as readonly string[]
        for (const v of values) {
          const look = { ...DEFAULT_OS_LOOK, [key]: v } as OsLook
          const other = { ...DEFAULT_OS_LOOK, [key]: values.find((x) => x !== v) } as OsLook
          const same = (['home', 'lock'] as const).every((s) => paint(look, kind, s) === paint(other, kind, s))
          if (same) dead.push(`${kind}:${v}`)
        }
      }
      expect(dead).toEqual([])
    })
  }
})
