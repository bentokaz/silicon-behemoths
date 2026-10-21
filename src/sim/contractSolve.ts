// Builds a design that meets a contract's asks within what the designer really
// allows, so that an ask is only ever offered when it can be met. The same
// builder lets the tests prove it. It works from the company's own levels and
// researched features, and judges the result with the real evaluator.
import { marketLevel } from '../data/catalog'
import { TYPES, coolersFor, ioOptions, sizeLimits } from '../data/devices'
import { CLOUD_EXTRAS, CONNECT_EXTRAS, IP_IDS, noiseDb, type ReqStats } from './contractReqs'
import { starterDesign } from './game'
import { facesFor, kindsFor } from './geometry'
import { evaluate, maxBattery } from './scoring'
import type { ContractReq, DeviceDesign, DeviceType, GameState } from './types'

const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

export const baseDesign = (s: GameState, type: DeviceType): DeviceDesign => copy(starterDesign(s, type))

export function evalDesign(s: GameState, d: DeviceDesign) {
  const r = evaluate(d, s.levels, marketLevel(s.day), s.features, s.chips).report
  return { lifeHours: r.lifeHours, weight: r.weight }
}

/** The most this kind of device can do, with the levels the company has. Cached per call site by the caller. */
export interface Limits {
  lifeMax: number
  weightMin: number
  quietMin: number
}

function bigBattery(s: GameState, d: DeviceDesign) {
  const T = TYPES[d.type]
  d.body.thickness = Math.max(d.body.thickness, T.maxThickness)
  d.specs.battery = maxBattery(d.body, s.levels.battery, d.type)
  if (d.specs.refresh > 60) d.specs.refresh = 60
}

function lightest(s: GameState, d: DeviceDesign) {
  const lim = sizeLimits(d.type, d.body.fold)
  d.body.width = lim.width[0]
  d.body.height = lim.height[0]
  d.body.frameMat = d.body.backMat = 'wood'
  d.specs.battery = Math.min(d.specs.battery, maxBattery(d.body, s.levels.battery, d.type))
}

export function limitsFor(s: GameState, type: DeviceType): Limits {
  const big = baseDesign(s, type)
  const lim = sizeLimits(type, big.body.fold)
  big.body.width = lim.width[1]
  big.body.height = lim.height[1]
  bigBattery(s, big)
  const small = baseDesign(s, type)
  lightest(s, small)
  const q = baseDesign(s, type)
  applyReq(s, q, { kind: 'quiet' })
  return { lifeMax: evalDesign(s, big).lifeHours, weightMin: evalDesign(s, small).weight, quietMin: noiseDb(q) }
}

const PRIORITY: Record<string, number> = { maxLong: 0, battery: 8, flight: 8, maxWeight: 9 }

/** Change a design so that one ask holds. */
export function applyReq(s: GameState, d: DeviceDesign, r: ContractReq) {
  const b = d.body
  const T = TYPES[d.type]
  switch (r.kind) {
    case 'wood': b.frameMat = b.backMat = 'wood'; break
    case 'calm': b.frameColor = '#8a8a8a'; b.backColor = '#d8d4cc'; break
    case 'camo': b.camo = 'woodland'; break
    case 'matte': b.backFinish = 'matte'; break
    case 'maxLong': {
      if (Math.max(b.width, b.height) > (r.value ?? 0)) {
        const lim = sizeLimits(d.type, b.fold)
        b.width = lim.width[0]
        b.height = lim.height[0]
      }
      break
    }
    case 'quiet': {
      const best = coolersFor(d.type).reduce((k, c, i) => (c.level <= s.levels.materials ? i : k), 0)
      d.specs.cooling = best
      if (d.type === 'tower' && b.pc) { b.pc.fans = 1; b.pc.front = 'solid' }
      break
    }
    case 'flight': case 'battery': bigBattery(s, d); break
    case 'secure': {
      if (ioOptions(d.type).some((o) => o.id === 'secure')) d.specs.io = [...new Set([...(d.specs.io ?? []), 'secure'])]
      else if (kindsFor(d.type).includes('fingerprint')) d.parts.push({ id: 'cs-fp', kind: 'fingerprint', face: facesFor('fingerprint', d.type)[0], x: 0, y: 0, rot: 0, w: 12, h: 12 })
      else d.specs.extras = [...new Set([...d.specs.extras, 'face'])]
      break
    }
    case 'rgb': b.rgb ??= { zones: [], color: '#ff2a2a', color2: '#2a2aff', effect: 'static' }; break
    case 'rugged': b.rugged = true; break
    case 'antimicrobial': b.coating = 'antimicrobial'; break
    case 'hivis': b.frameColor = b.backColor = '#ffe600'; break
    case 'gold': b.frameColor = b.backColor = '#d4af37'; break
    case 'pale': b.frameColor = b.backColor = '#f1f1ee'; break
    case 'bright': b.frameColor = b.backColor = '#e8212b'; break
    case 'airgap': b.airgap = true; d.specs.extras = d.specs.extras.filter((e) => !CLOUD_EXTRAS.includes(e)); break
    case 'livery': {
      const name = r.text ?? 'Client'
      b.coBrand = { name, color: '#1e6fd9' }
      const face = facesFor('logo', d.type)[0]
      d.parts = d.parts.filter((p) => p.kind !== 'logo')
      d.parts.push({ id: 'cs-logo', kind: 'logo', face, x: 0, y: 0, rot: 0, w: 30, h: 10, text: name })
      break
    }
    case 'noCamera': d.parts = d.parts.filter((p) => p.kind !== 'camera'); break
    case 'noRgb': b.rgb = undefined; break
    case 'noLitLogo': d.parts = d.parts.filter((p) => p.kind !== 'light'); break
    case 'noLogo': d.parts = d.parts.filter((p) => p.kind !== 'logo'); b.coBrand = undefined; break
    case 'ip': {
      const ids = Object.keys(IP_IDS).filter((i) => T.extras.includes(i) && IP_IDS[i] >= (r.value ?? 0)).sort((a, c) => IP_IDS[a] - IP_IDS[c])
      d.specs.extras = [...new Set([...d.specs.extras.filter((e) => !(e in IP_IDS)), ids[0]])]
      break
    }
    case 'refresh': d.specs.refresh = Math.max(d.specs.refresh, r.value ?? 0); break
    case 'connect': d.specs.extras = [...new Set([...d.specs.extras, CONNECT_EXTRAS.find((e) => T.extras.includes(e))!])]; break
    case 'panel': d.specs.panel = Math.max(d.specs.panel, r.value ?? 0); break
    case 'maxWeight': lightest(s, d); break
    case 'material': {
      const id = (r.text ?? '').split('|')[0]
      b.frameMat = b.backMat = id
      break
    }
    case 'exclusive': d.colors = [{ name: 'Exclusive', frame: '#2b2b2b', back: '#c8a24a' }]; break
    default: break
  }
}

/** A design built to meet the asks, and the numbers the checks need from it. */
export function solveDesign(s: GameState, type: DeviceType, reqs: ContractReq[]): { design: DeviceDesign; stats: ReqStats } {
  const d = baseDesign(s, type)
  const order = [...reqs].sort((a, c) => (PRIORITY[a.kind] ?? 4) - (PRIORITY[c.kind] ?? 4))
  for (const r of order) applyReq(s, d, r)
  // a material ask goes last of the looks: weight and colour asks set materials too
  for (const r of order) if (r.kind === 'material') applyReq(s, d, r)
  const e = evalDesign(s, d)
  const price = reqs.find((r) => r.kind === 'maxPrice' || r.kind === 'minPrice')?.value
  return { design: d, stats: { lifeHours: e.lifeHours, weight: e.weight, price } }
}
