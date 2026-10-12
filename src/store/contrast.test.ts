import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { audit, contrast, hex, over, readThemes, table } from './contrast'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

describe('contrast', () => {
  it('computes the WCAG ratio', () => {
    expect(contrast(hex('#000000'), hex('#ffffff'))).toBeCloseTo(21, 5)
    expect(contrast(hex('#777777'), hex('#ffffff'))).toBeCloseTo(4.48, 1)
    expect(over(hex('#ffffff'), hex('#000000'), 0.5)).toEqual([128, 128, 128])
  })

  it('reads all four themes from index.css', () => {
    const themes = readThemes(css)
    expect(Object.keys(themes).sort()).toEqual(['ember', 'ice', 'rose', 'volt'])
    for (const t of Object.values(themes)) for (const k of ['carbon', 'panel', 'raise', 'hover', 'line', 'line2', 'fg', 'dim', 'faint', 'accent', 'pos', 'neg', 'warn']) expect(t[k], k).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('every text and background pair in every theme is 4.5:1 or better', () => {
    const results = audit(readThemes(css))
    // CONTRAST_TABLE=1 npx vitest run src/store/contrast.test.ts  prints the whole table
    if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CONTRAST_TABLE) console.log('\n' + table(results))
    const failing = results.filter((r) => r.ratio < 4.5).map((r) => `${r.theme}: ${r.text} on ${r.on} = ${r.ratio.toFixed(2)}`)
    expect(failing).toEqual([])
  })
})
