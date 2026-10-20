// What a client asks of a design, and how each ask is checked against the
// design as it stands. Pure: the same design always gives the same answer.
import { MATERIALS } from '../data/catalog'
import type { ContractReq, DeviceDesign, DeviceType } from './types'

export type ReqKind = ContractReq['kind']

export const CAMO_NAMES: Record<string, string> = { woodland: 'Woodland', desert: 'Desert', urban: 'Urban grey', arctic: 'Arctic' }

/** Saturation, 0-1, of a CSS hex colour (greys are 0). */
export function saturation(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0
  const n = parseInt(m[1], 16)
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b)
  return hi === 0 ? 0 : (hi - lo) / hi
}

/** Litres the body takes up. */
export const volumeL = (d: DeviceDesign) => (d.body.width * d.body.height * d.body.thickness) / 1e6

/** How loud it runs under load, in dB; types that make no noise of their own read 20. */
export function noiseDb(d: DeviceDesign): number {
  const cool = d.specs.cooling ?? 0
  if (d.type === 'tower') {
    const fans = d.body.pc?.fans ?? 2
    return Math.round(24 + fans * 3.2 - (d.body.pc?.front === 'solid' ? 3 : 0) - cool * 1.5)
  }
  if (d.type === 'desktop' || d.type === 'console') return Math.round(40 - cool * 4.5)
  if (d.type === 'laptop') return Math.round(36 - Math.min(cool, 3) * 2)
  if (d.type === 'drone') return 70
  return 20
}

export const isSecure = (d: DeviceDesign) => !!d.specs.io?.includes('secure') || d.specs.extras.includes('face') || d.parts.some((p) => p.kind === 'fingerprint')

/** Which asks make sense for a kind of device. */
export function reqApplies(kind: ReqKind, type: DeviceType): boolean {
  if (kind === 'quiet') return ['laptop', 'desktop', 'console', 'tower'].includes(type)
  if (kind === 'flight') return type === 'drone'
  if (kind === 'rgb') return type === 'tower' || type === 'mouse'
  if (kind === 'battery') return type !== 'drone' && !['desktop', 'tower', 'tv', 'monitor', 'mouse'].includes(type)
  return true
}

/** One ask, checked: whether it holds and what the design has instead. */
export function checkReq(r: ContractReq, d: DeviceDesign, stats: { lifeHours: number }): { ok: boolean; have: string } {
  const b = d.body
  switch (r.kind) {
    case 'wood': {
      const ok = b.frameMat === 'wood' || b.backMat === 'wood'
      return { ok, have: ok ? 'Wood' : `${MATERIALS.find((m) => m.id === b.backMat)?.name ?? b.backMat} back` }
    }
    case 'calm': {
      const s = Math.max(saturation(b.frameColor), saturation(b.backColor))
      return { ok: s <= 0.35, have: `${Math.round(s * 100)}% colour` }
    }
    case 'camo':
      return { ok: !!b.camo, have: b.camo ? CAMO_NAMES[b.camo] : 'Plain finish' }
    case 'matte':
      return { ok: b.backFinish === 'matte', have: b.backFinish === 'matte' ? 'Matte' : 'Gloss' }
    case 'maxLong': {
      const l = Math.round(Math.max(b.width, b.height))
      return { ok: l <= (r.value ?? 0), have: `${l} mm` }
    }
    case 'maxVolume': {
      const v = volumeL(d)
      return { ok: v <= (r.value ?? 0), have: `${v.toFixed(1)} L` }
    }
    case 'quiet': {
      const n = noiseDb(d)
      return { ok: n <= (r.value ?? 0), have: `${n} dB` }
    }
    case 'flight': {
      const m = Math.round(stats.lifeHours * 60)
      return { ok: m >= (r.value ?? 0), have: `${m} min` }
    }
    case 'battery':
      return { ok: stats.lifeHours >= (r.value ?? 0), have: `${stats.lifeHours.toFixed(1)} h` }
    case 'secure': {
      const ok = isSecure(d)
      return { ok, have: ok ? 'Fitted' : 'Not fitted' }
    }
    case 'rgb':
      return { ok: !!b.rgb, have: b.rgb ? 'Lit' : 'Unlit' }
  }
}

export function reqLabel(r: ContractReq): string {
  switch (r.kind) {
    case 'wood': return 'Wooden finish'
    case 'calm': return 'Calm colour'
    case 'camo': return 'Camouflage pattern'
    case 'matte': return 'Matte finish'
    case 'maxLong': return `No longer than ${r.value} mm`
    case 'maxVolume': return `Small: under ${r.value} L`
    case 'quiet': return `Quiet: ${r.value} dB or less`
    case 'flight': return `Flies ${r.value} min or more`
    case 'battery': return `Lasts ${r.value} h or more`
    case 'secure': return 'Secure: biometric lock or encrypted link'
    case 'rgb': return 'RGB lighting'
  }
}

/** All asks against a design: each result, and whether every one holds. */
export function checkAll(reqs: ContractReq[] | undefined, d: DeviceDesign, stats: { lifeHours: number }) {
  const rows = (reqs ?? []).map((r) => ({ req: r, ...checkReq(r, d, stats) }))
  return { rows, ok: rows.every((x) => x.ok), met: rows.filter((x) => x.ok).length }
}
