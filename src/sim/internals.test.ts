import { describe, expect, it } from 'vitest'
import { marketLevel } from '../data/catalog'
import { COOLERS, FLIP, RIVALS, SEGMENTS, segmentsOf } from '../data/devices'
import { defaultConfig, newGame, starterDesign } from './game'
import { HINGE_CLEAR, coverScreen, isCoverCam, isFlip, partExtent } from './geometry'
import { type Box, type Comp, type Internals, layoutInternals, specShares } from './internals'
import { generateDesign, layoutParts } from './rivals'
import { evaluate, foldedThickness, maxBattery } from './scoring'
import { DEVICE_TYPES, type DeviceDesign, type Levels } from './types'

const TOL = 0.06
const boxes = (c: Comp): Box[] => [c.box, ...(c.more ?? [])]
const inside = (a: Box, z: Box) => [0, 1, 2].every((i) => a.c[i] - a.s[i] / 2 >= z.c[i] - z.s[i] / 2 - TOL && a.c[i] + a.s[i] / 2 <= z.c[i] + z.s[i] / 2 + TOL)
const overlap = (a: Box, b: Box) => [0, 1, 2].every((i) => Math.abs(a.c[i] - b.c[i]) < (a.s[i] + b.s[i]) / 2 - TOL)

/** Everything wrong with a layout, as text: components outside their cavity, and solid components sharing space. */
function faults(n: Internals): string[] {
  const out: string[] = []
  for (const c of n.comps) {
    const zone = n.zones.find((z) => z.id === c.zone)
    if (!zone) out.push(`${c.id}: no zone ${c.zone}`)
    else for (const bx of boxes(c)) if (!inside(bx, zone.box)) out.push(`${c.id} is outside ${c.zone}: ${bx.c.map((v) => v.toFixed(1))} / ${bx.s.map((v) => v.toFixed(1))} in ${zone.box.c.map((v) => v.toFixed(1))} / ${zone.box.s.map((v) => v.toFixed(1))}`)
    if (boxes(c).some((bx) => bx.s.some((v) => !(v > 0) || !Number.isFinite(v)))) out.push(`${c.id} has no size`)
  }
  const anchor = (c: Comp) => n.zones.find((z) => z.id === c.zone)?.anchor
  const solid = n.comps.filter((c) => !c.over)
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      if (anchor(solid[i]) !== anchor(solid[j])) continue
      if (boxes(solid[i]).some((a) => boxes(solid[j]).some((bb) => overlap(a, bb)))) out.push(`${solid[i].id} overlaps ${solid[j].id}`)
    }
  }
  const ids = new Set<string>()
  for (const c of n.comps) {
    if (ids.has(c.id)) out.push(`two components called ${c.id}`)
    ids.add(c.id)
  }
  return out
}

const flat = (v: number): Levels => ({ display: v, chipset: v, camera: v, battery: v, charging: v, materials: v, design: v })

describe('the inside of a device', () => {
  it('lays out every starter design with nothing overlapping and nothing outside the body', () => {
    const s = newGame(defaultConfig())
    for (const type of DEVICE_TYPES) {
      const d = starterDesign(s, type)
      const n = layoutInternals(d, s.levels, s.chips)
      expect(faults(n).map((x) => `${type}: ${x}`)).toEqual([])
      expect(n.comps.length, type).toBeGreaterThan(5)
      // a starter design fits, so nothing in it is flagged
      expect(n.comps.filter((c) => !c.fits).map((c) => c.id), type).toEqual([])
    }
  })

  it('does the same for rival designs of every type, segment and size, at every level of technology', () => {
    let count = 0
    const bad: string[] = []
    for (const type of DEVICE_TYPES) {
      for (const seg of segmentsOf(type)) {
        for (const level of [0, 2, 4, 6, 8]) {
          for (let layout = 0; layout < 5; layout++) {
            const holder = { rng: 1000 + level * 97 + layout * 13 + seg.id.length }
            const d = generateDesign(holder, { segment: seg.id, levels: flat(level), mLevel: 3 + level / 2, layout, palette: ['#20242b'], logo: 'RIVAL' })
            const n = layoutInternals(d, flat(level))
            for (const x of faults(n)) bad.push(`${seg.id} level ${level} layout ${layout}${isFlip(d.body) ? ' flip' : ''}: ${x}`)
            // and again without the levels, as the product inspector sees a rival's device
            if (!faults(n).length) for (const x of faults(layoutInternals(d))) bad.push(`${seg.id} level ${level} layout ${layout}, levels unknown: ${x}`)
            count++
          }
        }
      }
    }
    const kinds = [...new Set(bad.map((x) => x.replace(/ level \d layout \d/, '').replace(/[-\d.,]+ \/ [-\d.,]+ in [-\d.,]+ \/ [-\d.,]+/, '')))]
    expect(kinds.slice(0, 50).concat(bad.slice(0, 8))).toEqual([])
    expect(count).toBeGreaterThan(800)
  })

  it('flags a battery too large for the body, where evaluate does', () => {
    const s = newGame(defaultConfig())
    for (const type of ['phone', 'tablet', 'watch', 'laptop', 'earbuds', 'foldable', 'headset', 'handheld'] as const) {
      const d = starterDesign(s, type)
      const cap = maxBattery(d.body, s.levels.battery, type)
      const big: DeviceDesign = { ...d, specs: { ...d.specs, battery: Math.round(cap * 1.4) } }
      const n = layoutInternals(big, s.levels)
      const cells = n.comps.filter((c) => c.kind === 'battery' && c.specs.includes('battery') && c.zone !== 'bud')
      expect(cells.length, type).toBeGreaterThan(0)
      expect(cells.every((c) => !c.fits && (c.clash?.length ?? 0) > 0), type).toBe(true)
      expect(evaluate(big, s.levels, marketLevel(0), s.features).report.issues.some((i) => i.text.startsWith('Battery does not fit')), type).toBe(true)
      expect(layoutInternals(d, s.levels).comps.every((c) => c.fits), type).toBe(true)
    }
  })

  it('moves and resizes components when the specs change', () => {
    const s = newGame(defaultConfig())
    const volume = (n: Internals, id: string) => {
      const c = n.comps.find((x) => x.id === id)!
      return boxes(c).reduce((a, bx) => a + bx.s[0] * bx.s[1] * bx.s[2], 0)
    }
    const phone = starterDesign(s, 'phone')
    const cap = maxBattery(phone.body, s.levels.battery, 'phone')
    const small = layoutInternals({ ...phone, specs: { ...phone.specs, battery: Math.round(cap * 0.4) } }, s.levels)
    const full = layoutInternals({ ...phone, specs: { ...phone.specs, battery: cap } }, s.levels)
    expect(volume(full, 'battery')).toBeGreaterThan(volume(small, 'battery') * 2)
    // a faster chip is a bigger package with better cooling under it
    const entry = layoutInternals({ ...phone, specs: { ...phone.specs, chipTier: 0 } }, s.levels)
    const flagship = layoutInternals({ ...phone, specs: { ...phone.specs, chipTier: 2 } }, s.levels)
    expect(volume(flagship, 'chip')).toBeGreaterThan(volume(entry, 'chip'))
    expect(flagship.comps.find((c) => c.id === 'thermal')!.label).toBe('Vapour chamber')
    expect(entry.comps.find((c) => c.id === 'thermal')!.label).toBe('Graphite pad')
    // wireless charging adds a coil to the back cover
    expect(layoutInternals({ ...phone, specs: { ...phone.specs, extras: ['wireless'] } }, s.levels).comps.find((c) => c.id === 'coil')?.host).toBe('cover')
    expect(layoutInternals({ ...phone, specs: { ...phone.specs, extras: [] } }, s.levels).comps.some((c) => c.id === 'coil')).toBe(false)
    // the camera modules follow the lenses
    const cam = phone.parts.find((p) => p.kind === 'camera' && p.face === 'back')!
    const moved: DeviceDesign = { ...phone, parts: phone.parts.map((p) => (p.id === cam.id ? { ...p, x: p.x + 9, y: p.y - 30 } : p)) }
    const a = layoutInternals(phone, s.levels).comps.find((c) => c.partId === cam.id)!
    const bb = layoutInternals(moved, s.levels).comps.find((c) => c.partId === cam.id)!
    // the back is seen from behind, so a part's x runs against the body's
    expect(bb.box.c[0] - a.box.c[0]).toBeCloseTo(-9, 1)
    expect(bb.box.c[1] - a.box.c[1]).toBeCloseTo(-30, 1)
    // a console grows fans with its cooling, and a graphics chip beside its processor
    const box = starterDesign(s, 'console')
    const fans = (cooling: number) => layoutInternals({ ...box, specs: { ...box.specs, cooling } }, flat(8)).comps.filter((c) => c.kind === 'fan').length
    expect(fans(0)).toBe(1)
    expect(fans(1)).toBe(2)
    expect(fans(COOLERS.length - 1)).toBe(3)
    expect(layoutInternals({ ...box, specs: { ...box.specs, gpu: 3 } }, flat(8)).comps.some((c) => c.id === 'gpu')).toBe(true)
    // a desktop's graphics card grows with its tier
    const desk = starterDesign(s, 'desktop')
    const card = (gpu: number) => layoutInternals({ ...desk, body: { ...desk.body, thickness: 70 }, specs: { ...desk.specs, gpu } }, flat(8))
    expect(card(0).comps.some((c) => c.id === 'gpu')).toBe(false)
    expect(volume(card(3), 'gpu')).toBeGreaterThan(volume(card(1), 'gpu'))
    // a headset's lenses reach further forward the simpler they are
    const visor = starterDesign(s, 'headset')
    const lens = (optics: number) => layoutInternals({ ...visor, body: { ...visor.body, thickness: 80 }, specs: { ...visor.specs, optics } }, flat(8)).comps.find((c) => c.id === 'lensL')!.box.s[2]
    expect(lens(0)).toBeGreaterThan(lens(3))
    // a speaker's microphones and drivers follow the lists
    const spk = starterDesign(s, 'speaker')
    const big = { ...spk.body, width: 200, height: 240, thickness: 200 }
    expect(layoutInternals({ ...spk, specs: { ...spk.specs, mics: 3 } }, flat(8)).comps.find((c) => c.id === 'mics')!.n).toBe(8)
    expect(layoutInternals({ ...spk, body: big, specs: { ...spk.specs, driver: 2 } }, flat(8)).comps.filter((c) => c.kind === 'radiator').length).toBe(2)
    expect(layoutInternals({ ...spk, specs: { ...spk.specs, driver: 4 } }, flat(8)).comps.find((c) => c.id === 'woofer')!.fits).toBe(false)
  })

  it('shares out the unit cost by the rows of the Internals panel', () => {
    const s = newGame(defaultConfig())
    for (const type of DEVICE_TYPES) {
      const d = starterDesign(s, type)
      const ev = evaluate(d, s.levels, marketLevel(0), s.features, s.chips)
      const shares = specShares(d, ev, s.chips)
      const { refresh: _same, ...rows } = shares
      const total = Object.values(rows).reduce((a, x) => a + x.cost, 0)
      expect(total, type).toBeGreaterThan(0)
      expect(total, type).toBeLessThanOrEqual(ev.unitCost + 0.01)
      // every component that names a row names one that exists
      for (const c of layoutInternals(d, s.levels).comps) for (const key of c.specs) expect(shares[key], `${type} ${c.id} ${key}`).toBeDefined()
    }
  })
})

describe('flips', () => {
  const lv = flat(6)
  const make = (segment: string, layout: number, flip?: boolean) => generateDesign({ rng: 42 + layout }, { segment, levels: lv, mLevel: 6, layout, palette: ['#20242b'], logo: 'RIVAL', flip })

  it('gives some makers a flip for their everyday foldable, and none for the dearer ones', () => {
    const makers = RIVALS.filter((r) => r.segments.includes('f-value'))
    const flips = makers.filter((r) => isFlip(make('f-value', r.layout).body))
    expect(flips.length).toBeGreaterThan(0)
    expect(flips.length).toBeLessThan(makers.length)
    for (const seg of ['f-flag', 'f-work']) for (let layout = 0; layout < 5; layout++) expect(isFlip(make(seg, layout).body), seg).toBe(false)
    // the player's starting foldable is a book
    expect(isFlip(starterDesign(newGame(defaultConfig()), 'foldable').body)).toBe(false)
  })

  it('builds a flip that can be sold: the size of a tall phone, its parts clear of the hinge', () => {
    for (let layout = 0; layout < 5; layout++) {
      const d = make('f-value', layout, true)
      const b = d.body
      expect(b.width).toBeGreaterThanOrEqual(FLIP.width[0])
      expect(b.width).toBeLessThanOrEqual(FLIP.width[1])
      expect(b.height).toBeGreaterThanOrEqual(FLIP.height[0])
      expect(b.height).toBeLessThanOrEqual(FLIP.height[1])
      const ev = evaluate(d, lv, 6)
      expect(ev.report.issues.filter((i) => i.level === 'error').map((i) => i.text), `layout ${layout}`).toEqual([])
      // it is scored as the phone it opens into, not as a tablet that is too small
      const book = evaluate(make('f-value', layout, false), lv, 6)
      expect(ev.raw.display).toBeGreaterThan(book.raw.display * 0.95)
      expect(ev.report.weight).toBeLessThan(book.report.weight)
      expect(ev.unitCost).toBeLessThan(book.unitCost)
      for (const p of d.parts) {
        const e = partExtent(p)
        if (p.face === 'front' || p.face === 'back') expect(Math.abs(p.y) - e.h / 2, `${p.kind} on the ${p.face}`).toBeGreaterThanOrEqual(2.9)
        if (p.face === 'left' || p.face === 'right') expect(Math.abs(p.x) - e.w / 2, `${p.kind} on the ${p.face} edge`).toBeGreaterThanOrEqual(HINGE_CLEAR - 1e-6)
        expect(isCoverCam(d, p)).toBe(false)
      }
      // the cameras are on the half with the cover screen, which is the upper one
      const cams = d.parts.filter((p) => p.kind === 'camera' && p.face === 'back')
      expect(cams.length).toBeGreaterThan(0)
      expect(cams.every((p) => p.y > 0)).toBe(true)
      const cover = coverScreen(b)
      expect(cover.y - cover.h / 2).toBeGreaterThan(HINGE_CLEAR)
      expect(cover.y + cover.h / 2).toBeLessThan(b.height / 2)
      expect(foldedThickness(d)).toBeGreaterThan(2 * b.thickness)
      // the simple editor lays one out the same way
      const again = layoutParts(b, { type: 'foldable', layout: 1, cams: 2, sensor: 2, periscope: false, front: 'punch', fingerprint: 'side', flash: true, stereo: true, logo: 'TEST', logoImage: false })
      expect(again.every((p) => !(p.face === 'back' && Math.abs(p.y) < HINGE_CLEAR))).toBe(true)
    }
  })

  it('sizes the cover screen by the option chosen', () => {
    const d = make('f-value', 1, true)
    const area = (cover: number) => {
      const c = coverScreen({ ...d.body, cover })
      return c.w * c.h
    }
    expect(area(0)).toBeLessThan(area(1))
    expect(area(1)).toBeLessThan(area(2))
    // a bigger one costs more in display, and nothing else
    const cost = (cover: number) => evaluate({ ...d, body: { ...d.body, cover } }, lv, 6).costParts
    expect(cost(2).displays).toBeGreaterThan(cost(0).displays)
    expect(cost(2).semis).toBe(cost(0).semis)
  })
})

describe('rough edges', () => {
  it('says so when a speaker has more sockets than its back panel holds', () => {
    const s = newGame(defaultConfig())
    const d = starterDesign(s, 'speaker')
    const small: DeviceDesign = { ...d, body: { ...d.body, form: 'orb', width: 76, height: 60, thickness: 76 }, specs: { ...d.specs, driver: 0, io: ['aux', 'lan'] } }
    small.parts = layoutParts(small.body, { type: 'speaker', layout: 1, cams: 0, sensor: 0, periscope: false, front: 'notch', fingerprint: 'none', flash: true, stereo: false, logo: '', logoImage: false, io: small.specs.io })
    const issues = evaluate(small, flat(8), 5).report.issues.map((i) => i.text)
    expect(issues.some((t) => t.startsWith('The back panel is too small for its'))).toBe(true)
    // and the sockets that were squeezed in are not each reported as clipping as well
    expect(issues.filter((t) => t === 'Parts are clipping into each other').length).toBe(0)
    const roomy = evaluate(d, flat(8), 5).report.issues.map((i) => i.text)
    expect(roomy.some((t) => t.startsWith('The back panel is too small'))).toBe(false)
  })

  it('keeps every segment of the market reachable by a rival', () => {
    expect(SEGMENTS.length).toBeGreaterThan(30)
  })
})
