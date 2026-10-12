// Not part of the game or of `npm test`: the soak and fuzz harness.
//
//   node scripts/soak.mjs soak            the main soak, on every core
//   node scripts/soak.mjs economy         the sensible builder on every start and difficulty
//   node scripts/soak.mjs site | device   the building and device fuzzers
//   node scripts/soak.mjs report          totals and findings from what has been run
//
// One shard of the work runs per process; see scripts/soak.mjs for the knobs.
// A single run can be repeated with SOAK_MODE=soak SOAK_ONLY=<id> (and
// SOAK_TRACE=1 to write every action to soak-out/trace.log as it is made).
import { it } from 'vitest'
import { fuzzDevices } from './testing/devicefuzz'
import { env, envNum, fs } from './testing/node'
import { type RunSpec, diffReload, planEconomy, planSoak, runGame } from './testing/runner'
import { fuzzSites } from './testing/sitefuzz'

const MODE = env('SOAK_MODE') ?? 'soak'
const SHARD = envNum('SOAK_SHARD', 0)
const SHARDS = envNum('SOAK_SHARDS', 1)
const OUT = env('SOAK_OUT') ?? 'soak-out'
const ONLY = env('SOAK_ONLY')

const mine = (i: number) => i % SHARDS === SHARD

it(`soak ${MODE} shard ${SHARD}/${SHARDS}`, () => {
  const f = fs()
  f.mkdirSync(OUT, { recursive: true })
  const file = `${OUT}/${MODE}-${SHARD}.jsonl`
  const log = (line: string) => f.appendFileSync(`${OUT}/progress.log`, `${new Date().toISOString()} [${MODE} ${SHARD}] ${line}\n`)
  const trace = env('SOAK_TRACE') ? (line: string) => f.appendFileSync(`${OUT}/trace.log`, line + '\n') : undefined
  if (!ONLY) f.writeFileSync(file, '')

  if (MODE === 'diff') {
    const spec = planSoak(envNum('SOAK_COUNT', 1014), envNum('SOAK_YEARS_CAP', 1000)).find((s) => String(s.id) === ONLY)!
    f.writeFileSync(`${OUT}/diff-${ONLY}.txt`, diffReload(spec))
  } else if (MODE === 'soak' || MODE === 'economy') {
    const plan: RunSpec[] = MODE === 'soak' ? planSoak(envNum('SOAK_COUNT', 1014), envNum('SOAK_YEARS_CAP', 1000)) : planEconomy(envNum('SOAK_SEEDS', 6), envNum('SOAK_YEARS', 30), env('SOAK_PERSONA') ?? 'sensible')
    const todo = ONLY ? plan.filter((s) => String(s.id) === ONLY) : plan.filter((s) => mine(s.id))
    // the long games first, so that a stall shows early
    todo.sort((a, b) => b.years - a.years)
    for (const spec of todo) {
      if (env('SOAK_STRICT')) spec.strict = true
      log(`start #${spec.id} ${spec.persona} ${spec.years}y`)
      const r = runGame(spec, trace)
      // the same recipe again, without the saves and loads on the way: the end must be identical
      if (MODE === 'soak' && !ONLY && (spec.reloadEvery || spec.id % 9 === 0) && spec.years <= 30) {
        const again = runGame({ ...spec, reloadEvery: undefined })
        if (again.hash !== r.hash) r.findings.push({ rule: spec.reloadEvery ? 'reload-changes-result' : 'non-deterministic', detail: `${spec.reloadEvery ? `saving and loading every ${spec.reloadEvery} months` : 'playing the same game twice'} gave a different end state (day ${r.daysPlayed} against ${again.daysPlayed}, cash ${r.cash.end} against ${again.cash.end})`, where: r.label, trail: [], count: 1 })
      }
      f.appendFileSync(ONLY ? `${OUT}/only-${ONLY}.jsonl` : file, JSON.stringify(r) + '\n')
      log(`done  #${spec.id} ${spec.persona} ${(r.daysPlayed / 360).toFixed(1)}y of ${spec.years} in ${(r.wallMs / 1000).toFixed(1)}s, ${r.tally.actions} actions, ${r.findings.length} findings${r.crashed ? ' CRASHED' : ''}`)
    }
  } else if (MODE === 'site') {
    const sessions = envNum('SOAK_COUNT', 256)
    const ops = envNum('SOAK_OPS', 1500)
    for (let i = 0; i < sessions; i++) {
      if (!mine(i)) continue
      log(`start site #${i}`)
      const r = fuzzSites(i + 1, ops, i % 3 === 2 ? 0.2 : 0, trace)
      f.appendFileSync(file, JSON.stringify(r) + '\n')
      log(`done  site #${i}: ${r.tally.actions} actions, ${r.findings.length} findings`)
    }
  } else if (MODE === 'device') {
    const sessions = envNum('SOAK_COUNT', 128)
    for (let i = 0; i < sessions; i++) {
      if (!mine(i)) continue
      log(`start device #${i}`)
      const r = fuzzDevices(i + 1, envNum('SOAK_PER_TYPE', 40), i % 2 ? 0.25 : 0)
      f.appendFileSync(file, JSON.stringify(r) + '\n')
      log(`done  device #${i}: ${r.designs} designs, ${r.calls} calls, ${r.findings.length} findings`)
    }
  }
}, 24 * 3600 * 1000)
