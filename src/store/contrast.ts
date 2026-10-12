// Contrast of the interface's colours, worked out from the theme tokens in
// index.css. Used by the test that keeps every text/background pair the
// interface draws at 4.5:1 or better in all four themes.

export type Rgb = [number, number, number]

export function hex(c: string): Rgb {
  const h = c.trim().replace('#', '')
  const f = h.length === 3 ? h.replace(/./g, (x) => x + x) : h
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]
}

const lin = (v: number) => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
export const luminance = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

/** WCAG contrast ratio of two opaque colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** One colour laid over another at the given opacity. */
export const over = (top: Rgb, under: Rgb, alpha: number): Rgb => [0, 1, 2].map((i) => Math.round(top[i] * alpha + under[i] * (1 - alpha))) as Rgb

export type Tokens = Record<string, string>

/** The colour tokens of every theme, read from the text of index.css. The first block (`@theme`) is Ember; the others override it. */
export function readThemes(css: string): Record<string, Tokens> {
  const out: Record<string, Tokens> = {}
  const blocks = [...css.matchAll(/(@theme|\[data-theme='(\w+)'\])\s*\{([^}]*)\}/g)]
  let base: Tokens = {}
  for (const b of blocks) {
    const tokens: Tokens = {}
    for (const m of b[3].matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)) tokens[m[1]] = m[2]
    if (b[1] === '@theme') (base = tokens), (out.ember = tokens)
    else out[b[2]] = { ...base, ...tokens }
  }
  return out
}

/** A background the interface puts text on: a token, or a token tinted over another. */
export type Ground = string | { tint: string; alpha: number; on: string }

/** Every surface text is drawn on. */
export const GROUNDS: Record<string, Ground> = {
  carbon: 'carbon',
  panel: 'panel',
  raise: 'raise',
  hover: 'hover',
  // the selected nav item, a pressed toggle, a selected option
  'accent 10% on panel': { tint: 'accent', alpha: 0.1, on: 'panel' },
  'accent 10% on raise': { tint: 'accent', alpha: 0.1, on: 'raise' },
  'accent 15% on panel': { tint: 'accent', alpha: 0.15, on: 'panel' },
  'warn 10% on panel': { tint: 'warn', alpha: 0.1, on: 'panel' },
  // a panel floating over a 3D view at 90%: worst case is the same panel over white sky, which the views never show; taken over carbon
  'panel 90% on carbon': { tint: 'panel', alpha: 0.9, on: 'carbon' },
}

/** Text colours and the surfaces each is allowed on. Everything the components draw must be one of these pairs. */
export const PAIRS: { text: string; on: string[] }[] = [
  { text: 'fg', on: Object.keys(GROUNDS) },
  { text: 'dim', on: Object.keys(GROUNDS) },
  // the quietest text is kept off tinted surfaces: a selected option or a pressed toggle uses dim for its second line
  { text: 'faint', on: ['carbon', 'panel', 'raise', 'hover', 'panel 90% on carbon'] },
  { text: 'accent', on: Object.keys(GROUNDS) },
  { text: 'pos', on: ['carbon', 'panel', 'raise', 'hover', 'panel 90% on carbon'] },
  { text: 'neg', on: ['carbon', 'panel', 'raise', 'hover', 'panel 90% on carbon'] },
  { text: 'warn', on: ['carbon', 'panel', 'raise', 'hover', 'warn 10% on panel', 'panel 90% on carbon'] },
]
/** Filled controls: dark text on a solid signal colour. */
export const FILLS = ['accent', 'pos', 'neg', 'warn']

export function ground(t: Tokens, g: Ground): Rgb {
  return typeof g === 'string' ? hex(t[g]) : over(hex(t[g.tint]), hex(t[g.on]), g.alpha)
}

export interface PairResult {
  theme: string
  text: string
  on: string
  ratio: number
}

/** The ratio of every pair in every theme. */
export function audit(themes: Record<string, Tokens>): PairResult[] {
  const out: PairResult[] = []
  for (const [theme, t] of Object.entries(themes)) {
    for (const p of PAIRS) for (const on of p.on) out.push({ theme, text: p.text, on, ratio: contrast(hex(t[p.text]), ground(t, GROUNDS[on])) })
    for (const f of FILLS) out.push({ theme, text: 'carbon', on: `${f} fill`, ratio: contrast(hex(t.carbon), hex(t[f])) })
  }
  return out
}

/** The audit as a Markdown table: one row per pair, one column per theme. */
export function table(results: PairResult[]): string {
  const themes = [...new Set(results.map((r) => r.theme))]
  const rows = [...new Set(results.map((r) => `${r.text} on ${r.on}`))]
  const cell = (row: string, theme: string) => results.find((r) => r.theme === theme && `${r.text} on ${r.on}` === row)?.ratio.toFixed(2) ?? ''
  return [`| Pair | ${themes.join(' | ')} |`, `|---|${themes.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row} | ${themes.map((t) => cell(row, t)).join(' | ')} |`)].join('\n')
}
