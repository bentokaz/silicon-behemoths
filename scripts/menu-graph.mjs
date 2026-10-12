// Lists the source files the menu loads without being asked (everything the
// entry imports statically), and how each file under src/3d got in there.
// The menu should not need the 3D code at all. Run: node scripts/menu-graph.mjs
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const find = (from, spec) => {
  const base = resolve(dirname(from), spec)
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) if (existsSync(base + ext) && !existsSync(join(base + ext, '.'))) return base + ext
  for (const ext of ['.ts', '.tsx']) if (existsSync(base + ext)) return base + ext
  return null
}
const why = new Map()
const queue = [join(root, 'src/main.tsx')]
why.set(queue[0], null)
const libs = new Map()
while (queue.length) {
  const file = queue.shift()
  const src = readFileSync(file, 'utf8')
  // static imports and re-exports that carry something at run time (type-only ones are erased)
  for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\s)([^'"]*?from\s+)?['"]([^'"]+)['"]/gm)) {
    const names = m[1] ?? ''
    if (/^\{[^}]*\}\s*from/.test(names.trim()) && names.replace(/[{}]/g, '').split(',').every((n) => !n.trim() || n.trim().startsWith('type ') || n.trim() === 'from')) continue
    const spec = m[2]
    if (!spec.startsWith('.')) {
      if (!libs.has(spec)) libs.set(spec, file)
      continue
    }
    const to = find(file, spec)
    if (to && !why.has(to)) {
      why.set(to, file)
      queue.push(to)
    }
  }
}
const rel = (f) => relative(root, f).replace(/\\/g, '/')
const chain = (f) => {
  const out = []
  for (let cur = f; cur; cur = why.get(cur)) out.push(rel(cur))
  return out.reverse().join(' > ')
}
const in3d = [...why.keys()].filter((f) => rel(f).startsWith('src/3d/'))
console.log(`${why.size} source files are loaded before the menu; ${in3d.length} of them are 3D code.`)
for (const f of in3d.slice(0, 12)) console.log('  ', chain(f))
const heavy = [...libs].filter(([name]) => /^(three|@react-three|postprocessing|n8ao|recharts)/.test(name))
for (const [name, file] of heavy) console.log(`library ${name} first needed by ${chain(file)}`)
process.exitCode = heavy.length ? 1 : 0
