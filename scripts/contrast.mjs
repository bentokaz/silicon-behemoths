// Prints the contrast of every text and background pair the interface uses, in all four themes.
//   node scripts/contrast.mjs
// The same check runs as a test (src/store/contrast.test.ts) and fails under 4.5:1.
// (Node 22.18 or later: it reads the TypeScript module directly.)
import { readFileSync } from 'node:fs'
const { audit, readThemes, table } = await import('../src/store/contrast.ts')
const results = audit(readThemes(readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')))
console.log(table(results))
const worst = results.reduce((a, r) => (r.ratio < a.ratio ? r : a))
console.log(`\nLowest: ${worst.text} on ${worst.on} in ${worst.theme}, ${worst.ratio.toFixed(2)}:1. ${results.filter((r) => r.ratio < 4.5).length} pairs under 4.5:1.`)
