// Repeats one run of the soak, for looking closely at something it found.
//
//   node scripts/soak-one.mjs <id> [--mode=soak|diff|economy] [--count=1014] [--years-cap=1000] [--trace] [--strict] [--out=soak-out]
//
// --mode=diff plays the run twice in step, with and without its saves and loads, and writes where the two part.
// --trace writes every action to <out>/trace.log as it is made, so a hang shows its last call.
import { spawnSync } from 'node:child_process'

const [id, ...rest] = process.argv.slice(2)
const flags = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')))
const env = { ...process.env, SOAK: '1', SOAK_MODE: flags.mode ?? 'soak', SOAK_ONLY: id, SOAK_OUT: flags.out ?? 'soak-out' }
if (flags.count) env.SOAK_COUNT = flags.count
if (flags['years-cap']) env.SOAK_YEARS_CAP = flags['years-cap']
if ('trace' in flags) env.SOAK_TRACE = '1'
if ('strict' in flags) env.SOAK_STRICT = '1'
if (flags.seeds) env.SOAK_SEEDS = flags.seeds
if (flags.years) env.SOAK_YEARS = flags.years
if (flags.persona) env.SOAK_PERSONA = flags.persona
const r = spawnSync('npx', ['vitest', 'run', 'src/sim/soak.diag.test.ts', '--reporter=dot'], { shell: true, stdio: 'inherit', env })
process.exit(r.status ?? 1)
