// Fuzzes the device model: random designs of every type through scoring,
// the internal layout, the part layout, the rival generator and the variants.
// Nothing may throw, nothing may come out as NaN, and every score stays in range.
import { MATERIALS, MAX_LEVEL, RAM_OPTIONS, REFRESH, STORAGE_OPTIONS, featuresAtLevels } from '../../data/catalog'
import { ANC, COOLERS, FLIP_COVERS, GPUS, HEAD_STRAPS, HINGES, MIC_ARRAYS, OPTICS, SPEAKERS, STANDS, STRAPS, TYPES, driverOptions, inputOptions, ioOptions, segmentsOf, sizeLimits } from '../../data/devices'
import { devPlan } from '../game'
import { clampPart, facesFor, kindsFor, newPart, nextPartId } from '../geometry'
import { layoutInternals, specShares, weightShares } from '../internals'
import { bestSegment, makeFeedback, makeReviews } from '../market'
import { VARIANTS, deriveVariant, generateDesign, layoutParts } from '../rivals'
import { type RngHolder, rand } from '../rng'
import { evaluate, thermal, weightParts } from '../scoring'
import { type CustomChip, DEVICE_TYPES, type DeviceDesign, type DeviceType, type Levels, type Product, SUBS, TRACKS } from '../types'
import { designProblem } from '../validate'
import { scan } from './invariants'
import { ruleKey } from './play'

export interface DeviceFuzzResult {
  designs: number
  /** Designs pushed beyond the editor's range that the game would refuse to start. */
  refused: number
  calls: number
  findings: { rule: string; detail: string; count: number; design?: string }[]
}

export function fuzzDevices(seed: number, perType: number, wild: number): DeviceFuzzResult {
  const dice: RngHolder = { rng: (seed * 2654435761) | 0 }
  const rnd = () => rand(dice)
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1))
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]
  const chance = (q: number) => rnd() < q
  const odd = () => pick([NaN, -1, 0, 1e9, -1e9, Infinity, 0.5, 99])
  const found = new Map<string, { rule: string; detail: string; count: number; design?: string }>()
  let calls = 0
  let designs = 0
  let refused = 0
  /** Set while a design pushed beyond what the editor offers is being judged. */
  let beyond = false
  const flag = (raw: string, d?: DeviceDesign) => {
    const text = (beyond ? raw.replace(/^([a-z-]+): /, '$1-wild: ') : raw).replace(/ \((phone|tablet|watch|laptop|desktop|console|earbuds|tv|foldable|headset|speaker|handheld)\)/, '')
    const key = ruleKey(text.replace(/ \[[a-z]+\]$/, ''))
    const f = found.get(key)
    if (f) f.count++
    else found.set(key, { rule: text.split(': ')[0], detail: text, count: 1, design: d ? JSON.stringify(d).slice(0, 4000) : undefined })
  }
  const safe = <T,>(name: string, d: DeviceDesign, fn: () => T): T | undefined => {
    calls++
    try {
      const out = fn()
      const bad: string[] = []
      // a helper handed a body that is not a body gives back what it was given: only what the game would accept is judged
      if (!beyond) scan(out, name, bad, 3)
      for (const b of bad) flag(`device-${b.replace(/\[\d+\]/g, '[]')} (${d.type})`, d)
      return out
    } catch (e) {
      const frame = (String((e as Error)?.stack).split('\n')[1] ?? '').trim().replace(/\(.*[\\/]/, '(')
      flag(`device-threw: ${name.replace(/ .*/, '')}: ${String((e as Error)?.message ?? e).slice(0, 90)} ${frame.slice(0, 60)} [${d.type}]`, d)
      return undefined
    }
  }
  const levelsOf = (): Levels => {
    const base = int(0, MAX_LEVEL)
    const lv = {} as Levels
    for (const t of TRACKS) lv[t] = Math.max(0, Math.min(MAX_LEVEL, chance(0.6) ? base : int(0, MAX_LEVEL)))
    return lv
  }

  const mutate = (d: DeviceDesign, lv: Levels, w: number) => {
    const T = TYPES[d.type]
    const b = d.body
    const s = d.specs

    const idx = (n: number) => (chance(w) ? odd() : int(0, Math.max(0, n - 1)))
    const dim = (lo: number, hi: number) => (chance(w) ? odd() : Math.round((lo + rnd() * (hi - lo)) * 10) / 10)
    for (let n = int(1, 8); n > 0; n--) {
      switch (int(0, 22)) {
        case 0: b.width = dim(sizeLimits(d.type, b.fold).width[0], sizeLimits(d.type, b.fold).width[1]); break
        case 1: b.height = dim(sizeLimits(d.type, b.fold).height[0], sizeLimits(d.type, b.fold).height[1]); break
        case 2: b.thickness = dim(2, T.maxThickness); break
        case 3: b.corner = dim(0, 40); break
        case 4: b.bezelTop = dim(0, 20); b.bezelBottom = dim(0, 20); b.bezelSide = dim(0, 12); break
        case 5: b.frameMat = chance(w) ? 'unobtainium' : pick(MATERIALS).id; b.backMat = chance(w) ? 'constructor' : pick(MATERIALS).id; break
        case 6: b.edge = pick(['flat', 'round'] as const); b.backFinish = pick(['gloss', 'matte'] as const); break
        case 7: s.panel = idx(MAX_LEVEL + 1); s.refresh = chance(w) ? odd() : pick(REFRESH).hz; break
        case 8: s.chipGen = idx(MAX_LEVEL + 1); s.chipTier = idx(3); break
        case 9: s.ram = chance(w) ? odd() : pick(RAM_OPTIONS); s.storage = chance(w) ? odd() : pick(STORAGE_OPTIONS); break
        case 10: s.battery = chance(w) ? odd() : int(0, 30000); s.charging = idx(MAX_LEVEL + 1); break
        case 11: s.extras = ['nfc', 'stereo', 'ip68', 'wireless', 'sat'].filter(() => chance(0.4)); if (chance(w)) s.extras.push('warp'); break
        case 12: s.gpu = idx(GPUS.length); s.cooling = idx(COOLERS.length); break
        case 13: s.keyboard = idx(inputOptions(d.type)?.length ?? 1); s.speakers = idx(SPEAKERS.length); break
        case 14: s.io = ioOptions(d.type).filter(() => chance(0.4)).map((x) => x.id); if (chance(w)) s.io.push('nope'); break
        case 15: s.driver = idx(driverOptions(d.type).length); s.anc = idx(ANC.length); s.mics = idx(MIC_ARRAYS.length); break
        case 16: s.hinge = idx(HINGES.length); s.optics = idx(OPTICS.length); break
        case 17: b.stand = chance(w) ? 'none' : pick(STANDS).id; b.strap = chance(w) ? 'rope' : pick([...STRAPS.map((x) => x.id), ...HEAD_STRAPS.map((x) => x.id)]); break
        case 18: b.buds = pick(['stem', 'bean'] as const); b.form = pick(['column', 'orb', 'block'] as const); b.screen = chance(0.5); break
        case 19: if (d.type === 'foldable') { b.fold = pick(['book', 'flip'] as const); b.cover = idx(FLIP_COVERS.length); const to = sizeLimits(d.type, b.fold); b.width = to.width[2]; b.height = to.height[2] } break
        case 20: {
          // a part of any kind this type takes, anywhere on any face it may sit on
          const kinds = kindsFor(d.type)
          if (!kinds.length) break
          const kind = pick(kinds)
          const made = safe('newPart', d, () => newPart(kind, d, int(0, lv.camera)))
          if (!made) break
          const faces = facesFor(kind, d.type)
          const placed = safe('clampPart', d, () => clampPart(b, { ...made, id: nextPartId(d), face: faces.length ? pick(faces) : made.face, x: chance(w) ? odd() : int(-200, 200), y: chance(w) ? odd() : int(-200, 200), w: chance(0.3) ? dim(1, 40) : made.w, h: chance(0.3) ? dim(1, 40) : made.h, rot: pick([0, 90, 180, 270]) }, d.type))
          if (placed) d.parts.push(placed)
          break
        }
        case 21: if (d.parts.length) d.parts.splice(int(0, d.parts.length - 1), 1); break
        default: if (d.parts.length && chance(0.5)) d.parts = d.parts.map((q) => (chance(0.3) ? (safe('clampPart', d, () => clampPart(b, { ...q, x: q.x + int(-30, 30), y: q.y + int(-30, 30) }, d.type)) ?? q) : q))
      }
    }
  }

  const judge = (d: DeviceDesign, lv: Levels, mLevel: number, strictRange: boolean) => {
    designs++
    const before = JSON.stringify(d)
    const chips: CustomChip[] = chance(0.3) ? [{ id: 'h1', name: 'Own', gen: lv.chipset, power: rnd(), graphics: rnd(), efficiency: 0, status: 'ready', devDaysLeft: 0, quality: 0.9 + rnd() * 0.18, licenceFee: 0, licenceIncome: 0 }] : []
    if (chips.length && chance(0.5)) d.specs.customChip = 'h1'
    const feats = chance(0.5) ? undefined : featuresAtLevels(lv).filter(() => chance(0.7))
    const ev = safe('evaluate', d, () => evaluate(d, lv, mLevel, feats, chips))
    const again = safe('evaluate', d, () => evaluate(d, lv, mLevel, feats, chips))
    if (ev && again && JSON.stringify(ev) !== JSON.stringify(again)) flag(`device-unstable: evaluate gives two answers for one design (${d.type})`, d)
    if (ev) {
      const r = ev.report
      if (!(r.pct >= 0 && r.pct <= 100)) flag(`device-range: design score ${r.pct} (${d.type})`, d)
      // a row with nothing to win (max 0) is a penalty, and scores zero or less
      for (const row of r.breakdown) if (!(row.score <= row.max + 1e-9) || (row.max > 0 && row.score < -1e-9)) flag(`device-range: breakdown ${row.key} scores ${row.score} of ${row.max} (${d.type})`, d)
      for (const k of SUBS) if (!(ev.raw[k] >= 0)) flag(`device-range: raw ${k} is ${ev.raw[k]} (${d.type})`, d)
      if (strictRange) {
        if (!(ev.unitCost > 0)) flag(`device-range: unit cost ${ev.unitCost} (${d.type})`, d)
        const parts = Object.values(ev.costParts)
        if (parts.some((v) => !(v >= 0))) flag(`device-range: a negative cost part ${JSON.stringify(ev.costParts)} (${d.type})`, d)
        if (Math.abs(parts.reduce((a, v) => a + v, 0) - ev.unitCost) > 0.02 + ev.unitCost * 1e-6) flag(`device-range: cost parts add up to ${parts.reduce((a, v) => a + v, 0)}, unit cost is ${ev.unitCost} (${d.type})`, d)
        if (!(r.weight > 0) || !(r.lifeHours >= 0) || !(r.diag >= 0) || !(r.sbr >= 0 && r.sbr <= 1.0001) || !(r.maxBattery >= 0)) flag(`device-range: weight ${r.weight} life ${r.lifeHours} diag ${r.diag} sbr ${r.sbr} maxBattery ${r.maxBattery} (${d.type})`, d)
        if (!(ev.featureBonus >= 0 && ev.featureBonus < 1)) flag(`device-range: feature bonus ${ev.featureBonus} (${d.type})`, d)
      }
      for (const i of r.issues) if (!i.text || (i.level !== 'error' && i.level !== 'warn')) flag(`device-issue: an issue without text or level (${d.type})`, d)
      for (const i of r.issues) if (i.partId && !d.parts.some((q) => q.id === i.partId)) flag(`device-issue: an issue names part ${i.partId}, which the design does not have (${d.type})`, d)
      safe('specShares', d, () => specShares(d, ev, chips))
      // the market must be able to read whatever scoring produced
      const maker = { brand: 0.4, software: 0 }
      const probe = { raw: ev.raw, featureBonus: ev.featureBonus, price: Math.max(1, Math.round(ev.unitCost * 2)), type: d.type }
      const fit = safe('bestSegment', d, () => bestSegment(probe, maker, Math.round(mLevel * 900)))
      if (fit && !(fit.u >= 0)) flag(`device-range: appeal ${fit.u} (${d.type})`, d)
      const p = { ...probe, id: 'p', design: d, name: 'X', reviewAvg: 7, satisfaction: 0.7, defectRate: 0.02, tiers: [], buzz: {} } as unknown as Product
      const reviews = safe('makeReviews', d, () => makeReviews(dice, p, maker, Math.round(mLevel * 900), r.issues.filter((i) => i.level === 'warn').map((i) => i.text)))
      for (const rv of reviews ?? []) if (!(rv.score >= 1 && rv.score <= 10) || !rv.pros.length || !rv.cons.length) flag(`device-range: review ${JSON.stringify(rv).slice(0, 120)} (${d.type})`, d)
      const fb = safe('makeFeedback', d, () => makeFeedback(dice, p, maker, Math.round(mLevel * 900), rnd()))
      if (fb && (!fb.text || !(fb.stars >= 1 && fb.stars <= 5))) flag(`device-range: feedback ${JSON.stringify(fb)} (${d.type})`, d)
    }
    const inner = safe('layoutInternals', d, () => layoutInternals(d, lv, chips))
    if (inner) safe('weightShares', d, () => weightShares(d, inner))
    safe('layoutInternals', d, () => layoutInternals(d))
    safe('weightParts', d, () => weightParts(d))
    safe('thermal', d, () => thermal(d, chips))
    const plan = safe('devPlan', d, () => devPlan(d))
    if (plan && strictRange && (!(plan.cost > 0) || !(plan.days >= 10))) flag(`device-range: development ${JSON.stringify(plan)} (${d.type})`, d)
    for (const v of VARIANTS) {
      const out = safe(`deriveVariant ${v.id}`, d, () => deriveVariant(d, v.id, lv, feats ?? featuresAtLevels(lv)))
      if (out && chance(0.25)) safe('evaluate variant', out, () => evaluate(out, lv, mLevel, feats, chips))
    }
    delete d.specs.customChip
    const after = JSON.stringify(d)
    if (chips.length ? false : after !== before) flag(`device-mutated: judging a design changed it (${d.type})`, d)
  }

  for (const type of DEVICE_TYPES) {
    for (let n = 0; n < perType; n++) {
      const lv = levelsOf()
      const mLevel = chance(0.5) ? Math.max(...TRACKS.map((t) => lv[t])) : rnd() * MAX_LEVEL
      const seg = pick(segmentsOf(type))
      const made = (() => {
        calls++
        try {
          return generateDesign(dice, { segment: seg.id, levels: lv, mLevel, layout: int(0, 6), palette: ['#22262c', '#d8d8dc', '#3f5870'], logo: 'FUZZ', logoImage: chance(0.2), flip: type === 'foldable' ? pick([true, false, undefined]) : undefined })
        } catch (e) {
          flag(`device-threw: generateDesign ${seg.id}: ${String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ').slice(0, 300)}`)
          return undefined
        }
      })()
      if (!made) continue
      // what a rival builds must be something a rival could sell
      const own = safe('evaluate', made, () => evaluate(made, lv, mLevel))
      const errors = own?.report.issues.filter((i) => i.level === 'error') ?? []
      if (errors.length) flag(`rival-design-error: a generated ${seg.id} design does not pass its own check: ${errors[0].text}`, made)
      const refusal = designProblem(made)
      if (refusal) flag(`design-refused: a generated ${seg.id} design is turned away: ${refusal}`, made)
      judge(made, lv, mLevel, true)
      // the simple editor's layouts
      const body = made.body
      safe('layoutParts', made, () => layoutParts(body, { type, layout: int(0, 6), cams: int(0, 5), sensor: int(0, MAX_LEVEL), periscope: chance(0.3), front: pick(['notch', 'punch', 'under'] as const), fingerprint: pick(['side', 'back', 'display', 'none'] as const), flash: chance(0.5), stereo: chance(0.5), logo: pick(['', 'A', 'LONGLOGONAME']), logoImage: chance(0.3), io: made.specs.io }))
      // then pushed about within what the editor offers, and (when asked) beyond it
      const d: DeviceDesign = JSON.parse(JSON.stringify(made))
      mutate(d, lv, 0)
      const turned = designProblem(d)
      if (turned) flag(`design-refused: a design made of choices the editor offers is turned away: ${turned}`, d)
      judge(d, lv, mLevel, true)
      if (wild > 0) {
        const x: DeviceDesign = JSON.parse(JSON.stringify(made))
        beyond = true
        mutate(x, lv, wild)
        // a design the game would refuse to start is not one it has to be able to score
        const problem = safe('designProblem', x, () => designProblem(x))
        if (problem === null) {
          beyond = false
          judge(x, lv, mLevel, true)
        } else refused++
        beyond = false
      }
    }
  }
  return { designs, refused, calls, findings: [...found.values()] }
}

export const DEVICE_FUZZ_TYPES: DeviceType[] = DEVICE_TYPES
