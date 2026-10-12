// Prints what the soak kept about findings whose text matches a pattern: where first seen, the trail, the design.
//   node scripts/soak-peek.mjs <kind> <pattern> [--out=soak-out] [--max=1] [--chars=1500]
import { readFileSync, readdirSync } from 'node:fs'

const [kind, pattern, ...rest] = process.argv.slice(2)
const flags = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')))
const out = flags.out ?? 'soak-out'
const re = new RegExp(pattern)
let shown = 0
for (const f of readdirSync(out).filter((f) => f.startsWith(kind + '-') && f.endsWith('.jsonl'))) {
  for (const line of readFileSync(`${out}/${f}`, 'utf8').split('\n').filter(Boolean)) {
    const row = JSON.parse(line)
    for (const x of row.findings ?? []) {
      if (!re.test(x.detail) || shown >= Number(flags.max ?? 1)) continue
      shown++
      console.log(`${x.detail.slice(0, 300)}\n  ${x.where ?? row.label ?? ''}\n  ${(x.trail ?? []).slice(-Number(flags.trail ?? 8)).join('\n  ')}\n  ${(x.design ?? '').slice(0, Number(flags.chars ?? 1500))}`)
    }
  }
}
