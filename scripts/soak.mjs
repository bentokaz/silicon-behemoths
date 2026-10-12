// Runs the soak harness (src/sim/soak.diag.test.ts) on every core and sums up what it found.
//
//   node scripts/soak.mjs soak [--count=1014] [--years-cap=1000] [--shards=N]
//   node scripts/soak.mjs economy [--seeds=6] [--years=30] [--persona=sensible]
//   node scripts/soak.mjs site [--count=256] [--ops=1500]
//   node scripts/soak.mjs device [--count=128] [--per-type=40]
//   node scripts/soak.mjs report [soak|economy|site|device]
//
// Results go to soak-out/ (or --out=dir): one .jsonl per shard, and progress.log,
// which gains a line as each game starts and ends, so a stall is easy to see.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'

const [mode = 'soak', ...rest] = process.argv.slice(2)
const flags = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')))
const out = flags.out ?? 'soak-out'

const read = (kind) =>
  existsSync(out)
    ? readdirSync(out)
        .filter((f) => f.startsWith(kind + '-') && f.endsWith('.jsonl'))
        .flatMap((f) => readFileSync(`${out}/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
    : []

const pct = (list, q) => {
  if (!list.length) return NaN
  const s = [...list].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}
const money = (v) => (!Number.isFinite(v) ? '   -  ' : Math.abs(v) >= 1e12 ? (v / 1e12).toFixed(1) + 'T' : Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : (v / 1e6).toFixed(1) + 'M').padStart(8)

function findings(rows) {
  const all = new Map()
  for (const r of rows) {
    for (const f of r.findings ?? []) {
      const key = (f.detail ?? f.rule).replace(/-?\d+(\.\d+)?(e[+-]?\d+)?/g, '#').slice(0, 150)
      const e = all.get(key) ?? { ...f, count: 0, runs: 0 }
      e.count += f.count ?? 1
      e.runs++
      all.set(key, e)
    }
  }
  return [...all.values()].sort((a, b) => a.rule.localeCompare(b.rule) || b.runs - a.runs)
}

function report(kind) {
  const rows = read(kind)
  const lines = []
  const say = (t = '') => lines.push(t)
  say(`== ${kind}: ${rows.length} runs`)
  if (!rows.length) return lines.join('\n')
  if (kind === 'soak' || kind === 'economy') {
    const days = rows.reduce((a, r) => a + r.daysPlayed, 0)
    const actions = rows.reduce((a, r) => a + r.tally.actions, 0)
    const rejected = rows.reduce((a, r) => a + r.tally.rejected, 0)
    const threw = rows.reduce((a, r) => a + r.tally.threw, 0)
    const wall = rows.reduce((a, r) => a + r.wallMs, 0)
    say(`game-years ${(days / 360).toFixed(0)}, actions ${actions}, refused ${rejected}, threw ${threw}, crashed runs ${rows.filter((r) => r.crashed).length}, cpu ${(wall / 3600e3).toFixed(2)} h`)
    say(`runs reaching 30y ${rows.filter((r) => r.daysPlayed >= 30 * 360).length}, 100y ${rows.filter((r) => r.daysPlayed >= 100 * 360).length}`)
    // ---- by persona
    say('\npersona        runs  bankrupt ousted  med.end-day  med.cash-end   max.cash   med.share  caps(med)')
    for (const name of [...new Set(rows.map((r) => r.persona))]) {
      const list = rows.filter((r) => r.persona === name)
      const limited = list.filter((r) => !/ unlimited/.test(r.label))
      say(`${name.padEnd(13)} ${String(list.length).padStart(5)} ${String(limited.filter((r) => r.over?.reason === 'bankrupt').length).padStart(9)} ${String(limited.filter((r) => r.over?.reason === 'ousted').length).padStart(6)} ${String(pct(list.map((r) => r.daysPlayed), 0.5)).padStart(12)} ${money(pct(limited.map((r) => r.cash.end), 0.5))}      ${money(Math.max(...limited.map((r) => r.maxCash), 0))} ${(pct(list.map((r) => r.playerShare), 0.5) * 100).toFixed(1).padStart(8)}%  ${pct(list.map((r) => Object.keys(r.unlocks).length), 0.5)}`)
    }
    // ---- performance and size
    const ms = (k) => rows.map((r) => r.msPerDay?.[k]).filter((v) => v !== undefined)
    say(`\nms per game day: year 1 median ${pct(ms('y1'), 0.5)?.toFixed(3)} p95 ${pct(ms('y1'), 0.95)?.toFixed(3)} | year 50 median ${pct(ms('y50'), 0.5)?.toFixed(3)} p95 ${pct(ms('y50'), 0.95)?.toFixed(3)} | year 100 median ${pct(ms('y100'), 0.5)?.toFixed(3)} p95 ${pct(ms('y100'), 0.95)?.toFixed(3)}`)
    const long = rows.filter((r) => r.daysPlayed >= 100 * 360)
    say(`save size: all runs median ${(pct(rows.map((r) => r.jsonBytes), 0.5) / 1e6).toFixed(2)} MB, max ${(Math.max(...rows.map((r) => r.jsonBytes)) / 1e6).toFixed(2)} MB; after 100 years median ${(pct(long.map((r) => r.jsonBytes), 0.5) / 1e6).toFixed(2)} MB, max ${(Math.max(0, ...long.map((r) => r.jsonBytes)) / 1e6).toFixed(2)} MB`)
    say(`rivals alive at the end (runs past 30y): min ${Math.min(...rows.filter((r) => r.daysPlayed >= 10800).map((r) => r.rivalsAlive))}, median ${pct(rows.filter((r) => r.daysPlayed >= 10800).map((r) => r.rivalsAlive), 0.5)}; biggest rival's share median ${(pct(rows.filter((r) => r.daysPlayed >= 10800).map((r) => r.topRivalShare), 0.5) * 100).toFixed(1)}% max ${(Math.max(0, ...rows.filter((r) => r.daysPlayed >= 10800).map((r) => r.topRivalShare)) * 100).toFixed(1)}%`)
    // ---- capabilities reached in guided games
    const guided = rows.filter((r) => / guided/.test(r.label))
    const caps = new Map()
    for (const r of guided) for (const [id, day] of Object.entries(r.unlocks)) caps.set(id, [...(caps.get(id) ?? []), day])
    say(`\nguided games ${guided.length}; capability: runs that opened it, median day`)
    for (const [id, list] of [...caps.entries()].sort((a, b) => pct(a[1], 0.5) - pct(b[1], 0.5))) say(`  ${id.padEnd(11)} ${String(list.length).padStart(5)}  day ${pct(list, 0.5)}`)
    if (kind === 'economy') {
      say('\nstart      difficulty progression  runs bankrupt  day-of-bankruptcy(med)   cash y1 med    y5 med    y10 med    y30 med    y30 p10    y30 p90   units(med)')
      const key = (r) => r.label.split(' ').slice(2, 5).join(' ')
      for (const k of [...new Set(rows.map(key))]) {
        const list = rows.filter((r) => key(r) === k)
        const dead = list.filter((r) => r.over)
        const [start, diff, prog] = k.split(' ')
        const c = (y, q = 0.5) => money(pct(list.map((r) => r.cash[y]).filter((v) => v !== undefined), q))
        say(`${start.padEnd(10)} ${diff.padEnd(10)} ${prog.padEnd(11)} ${String(list.length).padStart(5)} ${String(dead.length).padStart(8)}  ${String(dead.length ? pct(dead.map((r) => r.over.day), 0.5) : '-').padStart(12)}          ${c('y1')}  ${c('y5')}   ${c('y10')}   ${c('y30')}   ${c('y30', 0.1)}   ${c('y30', 0.9)}   ${String(Math.round(pct(list.map((r) => r.units), 0.5))).padStart(10)}`)
      }
    }
    // ---- what the game says when it refuses
    const refusals = new Map()
    for (const r of rows) for (const [k, n] of Object.entries(r.tally.refusals ?? {})) refusals.set(k, (refusals.get(k) ?? 0) + n)
    writeFileSync(`${out}/${kind}-refusals.txt`, [...refusals.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => `${String(n).padStart(8)}  ${k}`).join('\n'))
    say(`\n${refusals.size} distinct refusal texts written to ${out}/${kind}-refusals.txt`)
  } else if (kind === 'site') {
    say(`actions ${rows.reduce((a, r) => a + r.tally.actions, 0)}, refused ${rows.reduce((a, r) => a + r.tally.rejected, 0)}, threw ${rows.reduce((a, r) => a + r.tally.threw, 0)}`)
  } else if (kind === 'device') {
    say(`designs ${rows.reduce((a, r) => a + r.designs, 0)}, calls ${rows.reduce((a, r) => a + r.calls, 0)}`)
  }
  const found = findings(rows)
  say(`\n${found.length} distinct findings`)
  for (const f of found) {
    say(`  [${f.runs} runs, ${f.count}x] ${f.detail.slice(0, Number(flags.width ?? 400))}\n      first: ${f.where}`)
    if (flags.trail) say(`      ${(f.trail ?? []).slice(-Number(flags.trail)).join('\n      ')}`)
  }
  return lines.join('\n')
}

if (mode === 'report') {
  for (const kind of rest.filter((a) => !a.startsWith('--')).length ? rest.filter((a) => !a.startsWith('--')) : ['soak', 'economy', 'site', 'device']) console.log(report(kind) + '\n')
  process.exit(0)
}

const shards = Number(flags.shards ?? Math.max(1, cpus().length - 2))
mkdirSync(out, { recursive: true })
for (const f of readdirSync(out)) if (f.startsWith(mode + '-') || f === 'progress.log') rmSync(`${out}/${f}`)
const pass = { count: 'SOAK_COUNT', 'years-cap': 'SOAK_YEARS_CAP', seeds: 'SOAK_SEEDS', years: 'SOAK_YEARS', persona: 'SOAK_PERSONA', ops: 'SOAK_OPS', 'per-type': 'SOAK_PER_TYPE', strict: 'SOAK_STRICT' }
const extra = Object.fromEntries(Object.entries(pass).filter(([k]) => flags[k] !== undefined).map(([k, v]) => [v, String(flags[k] ?? '1')]))
const started = Date.now()
let left = shards
console.log(`${mode}: ${shards} shards, results in ${out}/`)
for (let i = 0; i < shards; i++) {
  const child = spawn('npx', ['vitest', 'run', 'src/sim/soak.diag.test.ts', '--reporter=dot'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SOAK: '1', SOAK_MODE: mode, SOAK_SHARD: String(i), SOAK_SHARDS: String(shards), SOAK_OUT: out, ...extra } })
  let tail = ''
  child.stdout.on('data', (d) => (tail = (tail + d).slice(-700)))
  child.stderr.on('data', (d) => (tail = (tail + d).slice(-700)))
  child.on('exit', (code) => {
    if (code) console.log(`shard ${i} exited with ${code}:\n${tail}`)
    if (--left === 0) {
      const text = report(mode)
      writeFileSync(`${out}/${mode}-report.txt`, text)
      console.log(text)
      console.log(`\nwall time ${((Date.now() - started) / 60000).toFixed(1)} min`)
    }
  })
}
