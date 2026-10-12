// Sums up an economy study (node scripts/soak.mjs economy --out=<dir>) by difficulty and by start:
// how many companies failed and when, and how much cash the rest had at years 1, 5, 10 and 30.
//   node scripts/soak-economy.mjs <dir> [<dir> ...]
import { readFileSync, readdirSync } from 'node:fs'

const q = (list, p) => {
  const a = list.filter((v) => v !== undefined && Number.isFinite(v)).sort((x, y) => x - y)
  return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN
}
const M = (v) => (!Number.isFinite(v) ? '-' : Math.abs(v) >= 1e12 ? (v / 1e12).toFixed(1) + 'T' : Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : (v / 1e6).toFixed(1) + 'M').padStart(8)

for (const dir of process.argv.slice(2)) {
  const rows = readdirSync(dir)
    .filter((f) => /^economy-\d+\.jsonl$/.test(f))
    .flatMap((f) => readFileSync(`${dir}/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
  console.log(`\n== ${dir}: ${rows.length} runs of ${rows[0]?.persona}, ${(rows.reduce((a, r) => a + r.daysPlayed, 0) / 360).toFixed(0)} game-years, ${rows.reduce((a, r) => a + r.findings.length, 0)} findings`)
  const line = (name, list) => {
    const dead = list.filter((r) => r.over)
    const c = (y, p = 0.5) => M(q(list.map((r) => r.cash[y]), p))
    return `${name.padEnd(26)} ${String(list.length).padStart(4)} ${String(dead.filter((r) => r.over.reason === 'bankrupt').length).padStart(5)} ${String(dead.filter((r) => r.over.reason === 'ousted').length).padStart(5)} ${String(dead.length ? q(dead.map((r) => r.over.day), 0.5) : '-').padStart(7)} |${c('y1', 0.1)}${c('y1')}${c('y1', 0.9)} |${c('y5', 0.1)}${c('y5')}${c('y5', 0.9)} |${c('y10', 0.1)}${c('y10')}${c('y10', 0.9)} |${c('y30', 0.1)}${c('y30')}${c('y30', 0.9)} | ${String(q(list.map((r) => Object.keys(r.unlocks).length), 0.5)).padStart(3)}`
  }
  console.log(`${''.padEnd(26)} runs  bust ousted med.day |  cash y1: p10  median     p90 |      y5: p10  median     p90 |     y10: p10  median     p90 |     y30: p10  median     p90 | caps`)
  const part = (label) => label.split(' ')
  for (const prog of ['guided', 'open']) for (const diff of ['relaxed', 'normal', 'tough']) console.log(line(`${diff} ${prog}`, rows.filter((r) => part(r.label)[3] === diff && part(r.label)[4] === prog)))
  console.log('-- by start (every difficulty, both kinds of progression)')
  for (const start of [...new Set(rows.map((r) => part(r.label)[2]))]) console.log(line(start, rows.filter((r) => part(r.label)[2] === start)))
  console.log('-- by start, normal difficulty only')
  for (const start of [...new Set(rows.map((r) => part(r.label)[2]))]) console.log(line(start, rows.filter((r) => part(r.label)[2] === start && part(r.label)[3] === 'normal')))
  const inc = rows.filter((r) => r.income)
  if (inc.length) console.log(`income over the months on the books, median: sales ${M(q(inc.map((r) => r.income.revenue), 0.5))}, everything else ${M(q(inc.map((r) => r.income.other), 0.5))}; chip licences over the whole game median ${M(q(inc.map((r) => r.income.licence), 0.5))} p90 ${M(q(inc.map((r) => r.income.licence), 0.9))} max ${M(Math.max(...inc.map((r) => r.income.licence)))}`)
}
