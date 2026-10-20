import { describe, expect, it } from 'vitest'
import { CASE_FRONTS, CASE_SIDES, PSUS, coolersFor, maxFans } from '../data/devices'
import { defaultConfig, newGame, starterDesign } from './game'
import { layoutInternals } from './internals'
import type { DeviceDesign } from './types'

// every form a case can take, with every panel, fan count, card and cooler: what is drawn inside must stay inside
describe('a tower holds its parts', () => {
  const base = starterDesign(newGame(defaultConfig()), 'tower')
  const sizes: [number, number, number][] = [
    [150, 140, 250], // the smallest box there is
    [175, 330, 370], // small form factor
    [220, 470, 450], // mid tower
    [235, 600, 600], // the largest
    [280, 280, 300], // cube
    [460, 150, 380], // horizontal
    [460, 600, 250], // wide and shallow
  ]
  it('keeps every part that fits within the walls, for every combination', () => {
    const bad: string[] = []
    for (const [W, H, D] of sizes) {
      for (const side of CASE_SIDES.map((x) => x.id))
        for (const front of CASE_FRONTS.map((x) => x.id))
          for (const fanSize of [120, 140] as const)
            for (let fans = 0; fans <= Math.max(0, maxFans({ width: W, height: H }, fanSize)); fans += 2)
              for (const gpu of [0, 3])
                for (let cooling = 0; cooling < coolersFor('tower').length; cooling++) {
                  const d: DeviceDesign = {
                    ...base,
                    body: { ...base.body, width: W, height: H, thickness: D, pc: { side, front, fans, fanSize, feet: 'pads' } },
                    specs: { ...base.specs, gpu, cooling, psu: PSUS.length - 1 },
                  }
                  for (const c of layoutInternals(d).comps) {
                    if (c.fits === false) continue
                    const half = [W / 2, H / 2, D / 2]
                    const out = [0, 1, 2].some((i) => Math.abs(c.box.c[i]) + c.box.s[i] / 2 > half[i] + 0.5)
                    const empty = c.box.s.some((v) => !(v > 0) || !Number.isFinite(v))
                    if (out || empty) bad.push(`${W}x${H}x${D} ${side}/${front} ${fans}x${fanSize} gpu${gpu} cool${cooling}: ${c.id} ${c.box.c.map((v) => v.toFixed(0))} ${c.box.s.map((v) => v.toFixed(0))}`)
                  }
                }
    }
    expect([...new Set(bad.map((b) => b.split(': ')[1].split(' ')[0]))], bad.slice(0, 6).join('\n')).toEqual([])
  })

  it('keeps the big parts of the usual sizes out of one another', () => {
    const solid = /^(psu|gpu|cooler|radiator|fan\d|exhaust|bay\d|odd)$/
    const clash: string[] = []
    for (const sz of base.body && [[235, 540, 520], [220, 470, 450], [175, 330, 370], [280, 280, 300], [430, 150, 380]]) {
      const [W, H, D] = sz
      for (const front of CASE_FRONTS.map((x) => x.id))
        for (const gpu of [0, 1, 3])
          for (let cooling = 0; cooling < coolersFor('tower').length; cooling++) {
            const d: DeviceDesign = { ...base, body: { ...base.body, width: W, height: H, thickness: D, pc: { side: 'glass', front, fans: 3, fanSize: 120, feet: 'pads' } }, specs: { ...base.specs, gpu, cooling } }
            const cs = layoutInternals(d).comps.filter((c) => solid.test(c.id) && c.fits !== false)
            for (let i = 0; i < cs.length; i++)
              for (let j = i + 1; j < cs.length; j++) {
                const a = cs[i].box
                const b = cs[j].box
                const over = [0, 1, 2].every((k) => Math.abs(a.c[k] - b.c[k]) < (a.s[k] + b.s[k]) / 2 - 2)
                if (over) clash.push(`${W}x${H}x${D} ${front} gpu${gpu} cool${cooling}: ${cs[i].id}/${cs[j].id}`)
              }
          }
    }
    // one example of each pair that meets
    expect([...new Map(clash.map((c) => [c.split(': ')[1], c])).values()]).toEqual([])
  })
})
