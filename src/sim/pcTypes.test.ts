// The PC tower, the monitor and the mouse: their starting designs and the rivals' designs for every one of their
// segments are buildable, score sensibly, lay out inside and are judged by what their buyers care about.
import { describe, expect, it } from 'vitest'
import { marketLevel } from '../data/catalog'
import { PSUS, caseAppeal, segmentsOf, towerForm } from '../data/devices'
import { defaultConfig, newGame, starterDesign } from './game'
import { layoutInternals } from './internals'
import { generateDesign } from './rivals'
import { evaluate, thermal } from './scoring'
import type { DeviceType } from './types'

const NEW: DeviceType[] = ['tower', 'monitor', 'mouse']
const game = () => newGame({ ...defaultConfig(), seed: 11, unlimitedMoney: true })

describe('PC towers, monitors and mice', () => {
  it('start from designs with no errors', () => {
    const s = game()
    for (const type of NEW) {
      const d = starterDesign(s, type)
      const ev = evaluate(d, s.levels, marketLevel(s.day), s.features, s.chips)
      const errors = ev.report.issues.filter((i) => i.level === 'error').map((i) => i.text)
      expect(errors, type).toEqual([])
      expect(ev.unitCost, type).toBeGreaterThan(0)
      for (const k of ['perf', 'display', 'camera', 'battery', 'design'] as const) expect(Number.isFinite(ev.raw[k]) && ev.raw[k] > 0, `${type} ${k}`).toBe(true)
      expect(layoutInternals(d, s.levels, s.chips).comps.length, type).toBeGreaterThan(4)
    }
  })

  it('give every rival segment a design that can be sold', () => {
    const s = game()
    const levels = { display: 5, chipset: 5, camera: 5, battery: 5, charging: 5, materials: 5, design: 5 }
    for (const type of NEW) {
      for (const seg of segmentsOf(type)) {
        const d = generateDesign({ rng: 3 }, { segment: seg.id, levels, mLevel: 5, layout: 0, palette: ['#202226'], logo: 'ACME', logoImage: false })
        const ev = evaluate(d, levels, 5)
        expect(ev.report.issues.filter((i) => i.level === 'error').map((i) => i.text), seg.id).toEqual([])
        expect(ev.report.pct, seg.id).toBeGreaterThan(40)
      }
    }
    void s
  })

  it('build towers in their form factors, cooled and powered', () => {
    const levels = { display: 5, chipset: 5, camera: 5, battery: 5, charging: 5, materials: 5, design: 5 }
    const forms = new Set<string>()
    for (const seg of segmentsOf('tower')) {
      const d = generateDesign({ rng: 5 }, { segment: seg.id, levels, mLevel: 5, layout: 0, palette: ['#202226'], logo: 'ACME', logoImage: false })
      forms.add(towerForm(d.body))
      expect(thermal(d)!.headroom, seg.id).toBeGreaterThan(0.85)
      expect(PSUS[d.specs.psu ?? 1].watts, seg.id).toBeGreaterThan(thermal(d)!.heat + 90)
    }
    expect(forms.size).toBeGreaterThan(1)
  })

  it('lets gamers want glass and lighting, and professionals a plain case', () => {
    const s = game()
    const d = starterDesign(s, 'tower')
    const lit = { ...d.body, pc: { side: 'glass' as const, front: 'mesh' as const, fans: 3, fanSize: 120 as const, feet: 'tall' as const }, rgb: { zones: ['fans', 'ram', 'gpu', 'strip'], color: '#ff00ff', color2: '#00ffff', effect: 'wave' as const } }
    const plain = { ...lit, pc: { ...lit.pc, side: 'solid' as const }, rgb: { ...lit.rgb, effect: 'off' as const } }
    expect(caseAppeal(lit, 'tower', 'pc-game')).toBeGreaterThan(caseAppeal(plain, 'tower', 'pc-game'))
    expect(caseAppeal(plain, 'tower', 'pc-work')).toBeGreaterThan(caseAppeal(lit, 'tower', 'pc-work'))
  })
})
