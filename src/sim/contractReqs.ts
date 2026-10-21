// What a client asks of a design, and how each ask is checked against the
// design as it stands. Pure: the same design always gives the same answer.
import { MATERIALS } from '../data/catalog'
import { TYPES, ioOptions } from '../data/devices'
import { kindsFor } from './geometry'
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

/** Hue (degrees), saturation and value (0-1) of a CSS hex colour. */
export function hsv(hex: string): { h: number; s: number; v: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return { h: 0, s: 0, v: 0 }
  const n = parseInt(m[1], 16)
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), d = hi - lo
  let h = 0
  if (d > 0) h = hi === r ? ((g - b) / d + 6) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s: hi === 0 ? 0 : d / hi, v: hi }
}
const colours = (d: DeviceDesign) => [d.body.frameColor, d.body.backColor]
/** High-visibility yellow, lime or orange. */
export const isHiVis = (hex: string) => { const c = hsv(hex); return c.s >= 0.75 && c.v >= 0.85 && c.h >= 15 && c.h <= 95 }
export const isGold = (hex: string) => { const c = hsv(hex); return c.s >= 0.35 && c.s <= 0.85 && c.v >= 0.6 && c.h >= 36 && c.h <= 52 }
export const isPale = (hex: string) => { const c = hsv(hex); return c.s <= 0.25 && c.v >= 0.8 }
export const isBright = (hex: string) => { const c = hsv(hex); return c.s >= 0.6 && c.v >= 0.7 }
/** Radios that reach a cloud: an air-gapped device has none of them. */
export const CLOUD_EXTRAS = ['esim', 'mmwave', 'sat']
const IP: Record<string, number> = { ip54: 54, ip68: 68, ip69: 69 }
export const ipOf = (d: DeviceDesign) => Math.max(0, ...d.specs.extras.map((e) => IP[e] ?? 0))
export const CONNECT_EXTRAS = ['esim', 'mmwave']
export const IP_IDS = IP

/** Which asks make sense for a kind of device (what it can have at all). */
export function reqApplies(kind: ReqKind, type: DeviceType): boolean {
  const T = TYPES[type]
  const kinds = kindsFor(type)
  switch (kind) {
    case 'quiet': return ['laptop', 'desktop', 'console', 'tower'].includes(type)
    case 'flight': return type === 'drone'
    case 'rgb': case 'noRgb': return type === 'tower' || type === 'mouse'
    // only a device that has a cell: not a mains one, not a drone (flight time), not a wired mouse
    case 'battery': return type !== 'drone' && !T.mains && type !== 'mouse'
    case 'noCamera': return kinds.includes('camera') && !['actioncam', 'drone'].includes(type)
    case 'noLitLogo': return kinds.includes('light')
    case 'noLogo': case 'livery': return kinds.includes('logo')
    case 'ip': return T.extras.some((e) => e in IP)
    case 'connect': return T.extras.some((e) => CONNECT_EXTRAS.includes(e))
    case 'airgap': return T.extras.some((e) => CLOUD_EXTRAS.includes(e)) || !T.mains
    case 'refresh': case 'panel': return !T.noScreen && !['ereader', 'ring'].includes(type)
    case 'secure': return ioOptions(type).some((o) => o.id === 'secure') || T.extras.includes('face') || kinds.includes('fingerprint')
    case 'matte': return type !== 'speaker'
    default: return true
  }
}

export interface ReqStats {
  lifeHours: number
  /** Grams, and the selling price: known only once the device exists. */
  weight?: number
  price?: number
}

/** One ask, checked: whether it holds and what the design has instead. */
export function checkReq(r: ContractReq, d: DeviceDesign, stats: ReqStats): { ok: boolean; have: string } {
  const b = d.body
  const yes = (ok: boolean, a: string, no: string) => ({ ok, have: ok ? a : no })
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
    case 'rugged': return yes(!!b.rugged, 'Bumpers and reinforced corners', 'Standard shell')
    case 'antimicrobial': return yes(b.coating === 'antimicrobial', 'Antimicrobial coating', 'Uncoated')
    case 'hivis': return yes(colours(d).some(isHiVis), 'Hi-vis colour', 'Not hi-vis')
    case 'gold': return yes(colours(d).some(isGold), 'Gold', 'No gold')
    case 'pale': return yes(colours(d).every(isPale), 'Pale', 'Not pale')
    case 'bright': return yes(colours(d).some(isBright), 'Bright', 'Not bright')
    case 'airgap': {
      const radios = d.specs.extras.filter((e) => CLOUD_EXTRAS.includes(e))
      return yes(!!b.airgap && !radios.length, 'Air-gapped, no cloud', radios.length ? `Has ${radios.join(', ')}` : 'Cloud features on')
    }
    case 'livery': {
      const ok = !!b.coBrand?.name && (!r.text || b.coBrand.name.toLowerCase() === r.text.toLowerCase()) && d.parts.some((p) => p.kind === 'logo')
      return yes(ok, b.coBrand?.name ?? '', b.coBrand ? 'Logo part missing or wrong name' : 'Own branding only')
    }
    case 'noCamera': return yes(!d.parts.some((p) => p.kind === 'camera'), 'No camera', 'Has a camera')
    case 'noRgb': return yes(!b.rgb, 'Unlit', 'RGB lighting fitted')
    case 'noLitLogo': return yes(!d.parts.some((p) => p.kind === 'light'), 'Nothing lit', 'Lit parts fitted')
    case 'noLogo': return yes(!d.parts.some((p) => p.kind === 'logo') && !b.coBrand, 'No branding', 'Branding showing')
    case 'ip': {
      const ip = ipOf(d)
      return { ok: ip >= (r.value ?? 0), have: ip ? `IP${ip}` : 'Unsealed' }
    }
    case 'refresh': return { ok: d.specs.refresh >= (r.value ?? 0), have: `${d.specs.refresh} Hz` }
    case 'connect': {
      const ok = d.specs.extras.some((e) => CONNECT_EXTRAS.includes(e))
      return yes(ok, 'Cellular fitted', 'No cellular')
    }
    case 'panel': return { ok: d.specs.panel >= (r.value ?? 0), have: `Panel grade ${d.specs.panel}` }
    case 'maxWeight': {
      if (stats.weight === undefined) return { ok: true, have: 'Checked at launch' }
      return { ok: stats.weight <= (r.value ?? 0), have: `${Math.round(stats.weight)} g` }
    }
    case 'maxPrice': case 'minPrice': {
      if (stats.price === undefined) return { ok: true, have: 'Checked at sale' }
      return { ok: r.kind === 'maxPrice' ? stats.price <= (r.value ?? 0) : stats.price >= (r.value ?? 0), have: `$${Math.round(stats.price).toLocaleString('en-US')}` }
    }
    case 'material': {
      const ids = (r.text ?? '').split('|')
      const have = [b.frameMat, b.backMat].find((m) => ids.includes(m))
      return yes(!!have, MATERIALS.find((m) => m.id === have)?.name ?? '', MATERIALS.find((m) => m.id === b.backMat)?.name ?? b.backMat)
    }
    case 'exclusive': return yes((d.colors?.length ?? 0) > 0, `${d.colors?.length} extra colourways`, 'Standard colours only')
  }
}

export function reqLabel(r: ContractReq): string {
  const need = r.needs ? ` (needs ${r.needs} research)` : ''
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
    case 'rugged': return 'Rugged shell: bumpers and reinforced corners'
    case 'antimicrobial': return 'Antimicrobial coating'
    case 'hivis': return 'Hi-vis colours'
    case 'gold': return 'Gold finish'
    case 'pale': return 'Pale colours'
    case 'bright': return 'Bright colours'
    case 'airgap': return 'Air-gapped: no cloud features'
    case 'livery': return `${r.text ?? 'Client'} logo and livery`
    case 'noCamera': return 'Must not have a camera'
    case 'noRgb': return 'No RGB lighting'
    case 'noLitLogo': return 'No lit logo or light strips'
    case 'noLogo': return 'No visible branding'
    case 'ip': return `Sealed to IP${r.value} or better${need}`
    case 'refresh': return `${r.value} Hz screen or faster${need}`
    case 'connect': return `5G or eSIM${need}`
    case 'panel': return `Wide-gamut screen: panel grade ${r.value}+`
    case 'maxWeight': return `Weighs ${r.value} g or less`
    case 'maxPrice': return `Price ceiling $${r.value}`
    case 'minPrice': return `Premium: priced at $${r.value} or more`
    case 'material': return `Made of ${(r.text ?? '').split('|').map((i) => MATERIALS.find((m) => m.id === i)?.name ?? i).join(' or ').toLowerCase()}`
    case 'exclusive': return 'Exclusive colourway'
  }
}

/** All asks against a design: each result, and whether every one holds. */
export function checkAll(reqs: ContractReq[] | undefined, d: DeviceDesign, stats: ReqStats) {
  const rows = (reqs ?? []).map((r) => ({ req: r, ...checkReq(r, d, stats) }))
  return { rows, ok: rows.every((x) => x.ok), met: rows.filter((x) => x.ok).length }
}
