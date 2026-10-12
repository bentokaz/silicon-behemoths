import { describe, expect, it } from 'vitest'
import { marketLevel } from '../data/catalog'
import { COOLERS, FLIP, RIVALS, segmentsOf } from '../data/devices'
import { SAVE_VERSION, addCoverCamera, defaultConfig, migrate, newGame, starterDesign } from './game'
import { HINGE_CLEAR, coverScreen, isCoverCam, isFlip, partExtent } from './geometry'
import { type Box, type Comp, type Internals, layoutInternals, specShares, weightShares } from './internals'
import { generateDesign, layoutParts } from './rivals'
import { budWeight, costMaturity, deviceWeight, evaluate, foldedThickness, maxBattery, weightParts } from './scoring'
import { priceIndex } from './world'
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

describe('what the teardown shows', () => {
  const s = newGame(defaultConfig())
  const tvOf = (specs: Partial<DeviceDesign['specs']>, body: Partial<DeviceDesign['body']> = {}) => {
    const d = starterDesign(s, 'tv')
    return layoutInternals({ ...d, body: { ...d.body, ...body }, specs: { ...d.specs, ...specs } }, flat(8))
  }

  it('shares the weight of every type out among its components, to the gram', () => {
    const designs: DeviceDesign[] = DEVICE_TYPES.map((type) => starterDesign(s, type))
    for (const type of DEVICE_TYPES) for (const seg of segmentsOf(type)) for (const level of [1, 5, 8]) designs.push(generateDesign({ rng: 77 + level }, { segment: seg.id, levels: flat(level), mLevel: 3 + level / 2, layout: level % 5, palette: ['#20242b'], logo: 'RIVAL' }))
    for (const d of designs) {
      const n = layoutInternals(d, flat(8))
      const w = weightShares(d, n)
      const total = evaluate(d, flat(8), marketLevel(0)).report.weight
      // the breakdown is of the weight evaluate() reports, and changes nothing about it
      expect(w.total, d.type).toBeCloseTo(total, 6)
      expect(weightParts(d).reduce((a, p) => a + p.grams, 0), d.type).toBeCloseTo(deviceWeight(d), 6)
      const sum = Object.values(w.comps).reduce((a, x) => a + x, 0) + w.rest.reduce((a, x) => a + x.grams, 0)
      expect(sum / total, d.type).toBeCloseTo(1, 9)
      // every component that is drawn weighs something, and none of them more than the whole device
      for (const c of n.comps) {
        expect(w.comps[c.id], `${d.type} ${c.id}`).toBeGreaterThan(0)
        expect(w.comps[c.id], `${d.type} ${c.id}`).toBeLessThan(total)
      }
      for (const r of w.rest) expect(r.grams, `${d.type} ${r.label}`).toBeGreaterThan(0)
    }
    // the cells weigh what the capacity says, whatever else is inside
    const phone = starterDesign(s, 'phone')
    const pw = weightShares(phone, layoutInternals(phone, s.levels))
    expect(pw.comps.battery).toBeCloseTo(phone.specs.battery * 0.011, 6)
    const buds = starterDesign(s, 'earbuds')
    const bw = weightShares(buds, layoutInternals(buds, s.levels))
    expect(bw.rest.find((r) => r.key === 'buds')!.grams).toBeCloseTo(budWeight(buds), 6)
  })

  it('lights a television by its panel and its picture processor', () => {
    const light = (specs: Partial<DeviceDesign['specs']>) => tvOf(specs).comps.find((c) => c.id === 'backlight')!
    // an LCD with the entry processor is lit from its edges; faster ones dim it zone by zone, the fastest in many more
    expect(light({ panel: 0, chipTier: 0 }).n).toBe(0)
    expect(light({ panel: 0, chipTier: 0 }).label).toBe('Edge-lit LED backlight')
    const full = light({ panel: 0, chipTier: 1 }).n!
    const mini = light({ panel: 0, chipTier: 2 }).n!
    expect(full).toBeGreaterThan(10)
    expect(mini).toBeGreaterThan(full * 3)
    expect(light({ panel: 0, chipTier: 1, refresh: 120 }).n!).toBeGreaterThan(light({ panel: 0, chipTier: 1, refresh: 60 }).n!)
    expect(light({ panel: 0, chipTier: 1 }).note).toBeTruthy()
    // a panel that lights itself has no backlight and no driver board for one
    expect(light({ panel: 3, chipTier: 2 }).n).toBe(0)
    expect(light({ panel: 3 }).label).toMatch(/Self-lit/)
    expect(tvOf({ panel: 3 }).comps.some((c) => c.id === 'leddrv')).toBe(false)
    expect(tvOf({ panel: 0 }).comps.some((c) => c.id === 'leddrv')).toBe(true)
  })

  it('fills the back of a television from its specs', () => {
    const d = starterDesign(s, 'tv')
    const n = layoutInternals(d, s.levels)
    const ids = n.comps.map((c) => c.id)
    for (const id of ['chassis', 'psu', 'board', 'tcon', 'wifi', 'keys', 'heatsink', 'chip']) expect(ids, id).toContain(id)
    // a socket on the main board under every port the design has on its back, where the port is
    const ports = d.parts.filter((p) => p.kind === 'port' && p.face === 'back')
    expect(ports.length).toBeGreaterThan(0)
    for (const p of ports) {
      const c = n.comps.find((x) => x.partId === p.id)!
      expect(c, p.text).toBeDefined()
      expect(Math.abs(c.box.c[0] + p.x), p.text).toBeLessThan(2)
      expect(Math.abs(c.box.c[1] - p.y), p.text).toBeLessThan(2)
    }
    // four wall-mount points, a mount for each foot or one for a pedestal
    expect(n.comps.filter((c) => c.id.startsWith('vesa')).length).toBe(4)
    expect(tvOf({}, { stand: 'feet' }).comps.filter((c) => c.id.startsWith('mount')).length).toBe(2)
    expect(tvOf({}, { stand: 'pedestal' }).comps.filter((c) => c.id.startsWith('mount')).length).toBe(1)
    // the speakers follow the sound system chosen, each with a lead to the main board
    const sound = (speakers: number) => tvOf({ speakers }, { thickness: 60 }).comps
    expect(sound(0).filter((c) => c.kind === 'speaker').length).toBe(2)
    expect(sound(2).some((c) => c.id === 'woofer')).toBe(true)
    expect(sound(3).filter((c) => c.kind === 'speaker').length).toBe(6)
    expect(sound(4).filter((c) => c.id.startsWith('exciter')).length).toBe(2)
    for (const k of [0, 2, 3, 4]) expect(sound(k).filter((c) => c.id.startsWith('lead:')).length, `sound ${k}`).toBe(sound(k).filter((c) => c.kind === 'speaker' || c.id === 'woofer' || c.id.startsWith('exciter')).length)
    // a wider or faster panel is fed through more ribbons, and a tuner and voice control bring their own parts
    const ribbons = (specs: Partial<DeviceDesign['specs']>, body: Partial<DeviceDesign['body']> = {}) => tvOf(specs, body).comps.filter((c) => c.id.startsWith('pflex')).length
    expect(ribbons({ refresh: 120 })).toBeGreaterThan(ribbons({ refresh: 60 }))
    expect(ribbons({ refresh: 60 }, { width: 1900, height: 1080 })).toBeGreaterThan(ribbons({ refresh: 60 }, { width: 960, height: 550 }))
    expect(tvOf({ io: ['hdmi', 'aerial', 'voice'] }).comps.some((c) => c.id === 'tuner')).toBe(true)
    expect(tvOf({ io: ['hdmi', 'aerial', 'voice'] }).comps.some((c) => c.id === 'voicemics')).toBe(true)
    expect(tvOf({ io: ['hdmi'] }).comps.some((c) => c.id === 'tuner' || c.id === 'voicemics')).toBe(false)
    // the looms run between the boards without crossing any of them
    const loomed = tvOf({ panel: 0, chipTier: 1, speakers: 3, io: ['hdmi', 'usb', 'aerial', 'lan', 'hdmi4', 'optical', 'voice'] }, { thickness: 60 })
    const boards = loomed.comps.filter((c) => c.kind === 'board' || c.kind === 'psu')
    let crossings = 0
    for (const c of loomed.comps.filter((x) => x.text === 'clips' && x.path)) {
      for (let i = 1; i + 2 < c.path!.length; i++) {
        const [p, q] = [c.path![i], c.path![i + 1]]
        for (const bd of boards) if (Math.min(p[0], q[0]) < bd.box.c[0] + bd.box.s[0] / 2 && Math.max(p[0], q[0]) > bd.box.c[0] - bd.box.s[0] / 2 && Math.min(p[1], q[1]) < bd.box.c[1] + bd.box.s[1] / 2 && Math.max(p[1], q[1]) > bd.box.c[1] - bd.box.s[1] / 2) crossings++
      }
    }
    expect(crossings).toBe(0)
  })

  it('builds a speaker round its drivers, in every shape', () => {
    const base = starterDesign(s, 'speaker')
    for (const form of ['column', 'orb', 'block'] as const) {
      for (const screen of [false, true]) {
        for (let driver = 0; driver < 5; driver++) {
          const body = { ...base.body, form, screen, width: 180, height: 200, thickness: 180 }
          const d: DeviceDesign = { ...base, body, specs: { ...base.specs, driver, mics: driver % 4 } }
          d.parts = layoutParts(body, { type: 'speaker', layout: 1, cams: 0, sensor: 0, periscope: false, front: 'notch', fingerprint: 'none', flash: true, stereo: false, logo: '', logoImage: false, io: d.specs.io })
          const n = layoutInternals(d, flat(8))
          const tag = `${form}${screen ? ' with screen' : ''}, drivers ${driver}`
          expect(faults(n), tag).toEqual([])
          const ids = n.comps.map((c) => c.id)
          for (const id of ['psu', 'amp', 'chamber', 'wadding', 'board', 'chip', 'mics', 'ledring', 'touch', 'cable0', 'ribbon']) expect(ids, `${tag}: ${id}`).toContain(id)
          // a port only where the chamber is tuned with one, a lead to every driver, a lamp bar on a block and a ring on the others
          expect(ids.includes('bassport'), tag).toBe(driver === 1 || driver === 3)
          expect(n.comps.filter((c) => c.id.startsWith('lead:')).length, tag).toBe(n.comps.filter((c) => c.kind === 'driver').length)
          expect(n.comps.find((c) => c.id === 'ledring')!.v, tag).toBe(form === 'block' ? 1 : 0)
          expect(n.comps.find((c) => c.id === 'mics')!.n, tag).toBe([2, 4, 6, 8][driver % 4])
          expect(n.comps.find((c) => c.id === 'touch')!.n, tag).toBe(d.parts.filter((p) => p.face === 'top' && p.kind === 'button').length)
          expect(ids.includes('display'), tag).toBe(screen)
          // the power supply and the amplifier are sized from the drivers, and say so
          expect(n.comps.find((c) => c.id === 'amp')!.n, tag).toBe([1, 2, 3, 7, 4][driver])
          expect(n.comps.find((c) => c.id === 'amp')!.note, tag).toBeTruthy()
        }
      }
    }
  })

  it('takes an earbud apart along the shape it was designed with', () => {
    const d = starterDesign(s, 'earbuds')
    const stem = layoutInternals({ ...d, body: { ...d.body, buds: 'stem' }, specs: { ...d.specs, anc: 3 } }, flat(8))
    const bean = layoutInternals({ ...d, body: { ...d.body, buds: 'bean' }, specs: { ...d.specs, anc: 3 } }, flat(8))
    const zone = (n: Internals) => n.zones.find((z) => z.id === 'bud')!
    // a stem makes the bud long one way; a bean is nearly round
    expect(zone(stem).box.s[0]).toBeGreaterThan(zone(bean).box.s[0] * 1.4)
    expect(stem.comps.some((c) => c.id === 'stemboard')).toBe(true)
    expect(bean.comps.some((c) => c.id === 'stemboard')).toBe(false)
    // the microphones are on the stem where there is one, and on the round board where there is not
    expect(stem.comps.find((c) => c.id === 'stemboard')!.n).toBe(2)
    expect(bean.comps.find((c) => c.id === 'budboard')!.n).toBe(2)
    for (const n of [stem, bean]) {
      const of = (id: string) => n.comps.find((c) => c.id === id)!
      // outer half at the bottom, then the cell, the board and the driver, and the half with the ear tip on top
      const order = ['budcap', 'budcell', 'budboard', 'driver', 'budtip'].map((id) => of(id).layer)
      expect(order).toEqual([...order].sort((a, b) => a - b))
      expect(of('budcell').box.c[1]).toBeLessThan(of('budboard').box.c[1])
      expect(of('budboard').box.c[1]).toBeLessThan(of('driver').box.c[1])
      // the driver sits inside the half with the nozzle
      expect(of('driver').box.c[1]).toBeGreaterThan(of('budtip').box.c[1] - of('budtip').box.s[1] / 2)
    }
  })

  it('says where a part comes from when no row of the Internals panel sets it', () => {
    const note = (type: DeviceDesign['type'], id: string) => layoutInternals(starterDesign(s, type), s.levels).comps.find((c) => c.id === id)?.note
    expect(note('phone', 'thermal')).toMatch(/chip tier/)
    expect(note('tablet', 'thermal')).toMatch(/chip tier/)
    expect(note('laptop', 'fan0')).toMatch(/no cooling row/)
    expect(note('handheld', 'fan0')).toMatch(/chip tier/)
    expect(note('headset', 'fan0')).toBeTruthy()
    expect(note('tv', 'psu')).toBeTruthy()
    expect(note('speaker', 'psu')).toBeTruthy()
    // what a row does set carries no such note
    expect(note('phone', 'battery')).toBeUndefined()
    expect(note('desktop', 'heatsink')).toBeUndefined()
  })

  it('pulls the optics of a headset out by the face', () => {
    const n = layoutInternals(starterDesign(s, 'headset'), s.levels)
    for (const id of ['lensL', 'lensR', 'panelL', 'panelR']) expect(n.comps.find((c) => c.id === id)!.back, id).toBeGreaterThan(0)
    // the lens leaves further than the display behind it, and nothing else goes that way
    expect(n.comps.find((c) => c.id === 'lensL')!.back!).toBeGreaterThan(n.comps.find((c) => c.id === 'panelL')!.back!)
    expect(n.comps.filter((c) => c.back && !['lens', 'display', 'sensor', 'motor'].includes(c.kind))).toEqual([])
  })
})

describe('old saves', () => {
  it('gives a book foldable from before the cover camera was a part its camera, once', () => {
    const g = newGame(defaultConfig())
    const d = starterDesign(g, 'foldable')
    expect(isFlip(d.body)).toBe(false)
    const had = d.parts.filter((p) => isCoverCam(d, p))
    expect(had.length).toBe(1)
    // as it was saved before: the same design without that part
    const old: DeviceDesign = JSON.parse(JSON.stringify({ ...d, parts: d.parts.filter((p) => !isCoverCam(d, p)) }))
    const before = evaluate(old, g.levels, marketLevel(0), g.features)
    expect(addCoverCamera(old)).toBe(true)
    const cam = old.parts.filter((p) => isCoverCam(old, p))
    expect(cam.length).toBe(1)
    // it is where laying the device out again puts it, on the cover screen, with an id of its own
    expect(cam[0].x).toBeCloseTo(had[0].x, 6)
    expect(cam[0].y).toBeCloseTo(had[0].y, 6)
    expect(cam[0].w).toBeCloseTo(had[0].w, 6)
    expect(cam[0].sensor).toBe(had[0].sensor)
    expect(new Set(old.parts.map((p) => p.id)).size).toBe(old.parts.length)
    const cover = coverScreen(old.body)
    expect(Math.abs(cam[0].x - cover.x)).toBeLessThan(cover.w / 2)
    // the design it gives is the one a new save has, issue for issue
    expect(evaluate(old, g.levels, marketLevel(0), g.features).report.issues.map((i) => i.text)).toEqual(evaluate(d, g.levels, marketLevel(0), g.features).report.issues.map((i) => i.text))
    expect(before.report.weight).toBeCloseTo(evaluate(old, g.levels, marketLevel(0), g.features).report.weight, 6)
    // a second pass adds nothing, and flips and other types are left alone
    expect(addCoverCamera(old)).toBe(false)
    const flip = generateDesign({ rng: 43 }, { segment: 'f-value', levels: flat(6), mLevel: 6, layout: 1, palette: ['#20242b'], logo: 'RIVAL', flip: true })
    expect(addCoverCamera(flip)).toBe(false)
    expect(addCoverCamera(starterDesign(g, 'phone'))).toBe(false)
  })

  it('does it on loading a save of any version, for every product, and changes nothing a product was launched with', () => {
    const g = newGame(defaultConfig())
    const d = starterDesign(g, 'foldable')
    const stripped: DeviceDesign = { ...d, parts: d.parts.filter((p) => !isCoverCam(d, p)) }
    // a save of today's version, made before the part existed: one of the player's products and one of a rival's
    const template = g.products[0]
    expect(template).toBeDefined()
    const mk = (id: string, companyId: string): typeof template => ({ ...JSON.parse(JSON.stringify(template)), id, companyId, type: 'foldable', design: JSON.parse(JSON.stringify(stripped)) })
    g.products.push(mk('old1', 'player'), mk('old2', template.companyId))
    const saved = JSON.parse(JSON.stringify(g)) as typeof g
    expect(saved.version).toBe(SAVE_VERSION)
    const m = migrate(saved)
    for (const id of ['old1', 'old2']) {
      const p = m.products.find((x) => x.id === id)!
      expect(p.design.parts.filter((q) => isCoverCam(p.design, q)).length, id).toBe(1)
      // what it was launched with is as it was
      expect(p.costParts).toEqual(template.costParts)
      expect(p.designPct).toBe(template.designPct)
      expect(p.price).toBe(template.price)
    }
    // products that were not foldables are untouched, and loading it again changes nothing
    expect(m.products.find((p) => p.id === template.id)!.design).toEqual(template.design)
    const again = JSON.parse(JSON.stringify(migrate(JSON.parse(JSON.stringify(m)))))
    expect(again.products).toEqual(JSON.parse(JSON.stringify(m.products)))
    expect(m.version).toBe(SAVE_VERSION)
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

  it('lets the cost of making things fall as the market matures, so that a top device can still be sold at a profit', () => {
    expect(costMaturity(3)).toBe(1)
    expect(costMaturity(8)).toBeCloseTo(Math.pow(0.94, 5), 6)
    const lv = flat(8)
    for (const type of DEVICE_TYPES) {
      const seg = [...segmentsOf(type)].sort((a, b) => b.priceRef - a.priceRef)[0]
      const d = generateDesign({ rng: 9 }, { segment: seg.id, levels: lv, mLevel: 8, layout: 0, palette: ['#20242b'], logo: 'X' })
      const late = evaluate(d, lv, 8)
      const early = evaluate(d, lv, 3)
      // the same design costs less to make late in the game than it would have at the start, part for part
      expect(late.unitCost, type).toBeCloseTo(early.unitCost * costMaturity(8), 0)
      expect(late.costScale).toBeCloseTo(costMaturity(8), 6)
      // and what is left of the price the top segment expects by then, after the shops' cut and a contract maker's premium, is a profit
      const price = seg.priceRef * priceIndex(12.5 * 360)
      if (type !== 'console') expect(price * 0.85 - late.unitCost * 1.1, type).toBeGreaterThan(0.15 * price)
    }
  })
})
