// Says what is in each file of the production build, biggest first, and which
// files the page needs before the menu can show. Run: node scripts/bundle-report.mjs
// (builds into a throwaway folder; dist/ is left alone).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'

const out = mkdtempSync(join(tmpdir(), 'sb-bundle-'))
const kb = (n) => `${(n / 1024).toFixed(0).padStart(6)} kB`
const pkg = (id) => {
  const at = id.lastIndexOf('node_modules')
  if (at < 0) return id.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/').split('/').slice(0, 2).join('/')
  const rest = id.slice(at + 13).replace(/\\/g, '/').split('/')
  return rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]
}
try {
  await build({
    logLevel: 'warn',
    build: { outDir: out, emptyOutDir: true },
    plugins: [
      {
        name: 'bundle-report',
        generateBundle(_, bundle) {
          const chunks = Object.values(bundle).filter((c) => c.type === 'chunk')
          const entry = chunks.find((c) => c.isEntry)
          // everything the entry pulls in without being asked: this is what stands between the player and the menu
          const first = new Set()
          const walk = (c) => {
            if (!c || first.has(c.fileName)) return
            first.add(c.fileName)
            for (const f of c.imports) walk(bundle[f])
          }
          walk(entry)
          for (const c of chunks.sort((a, b) => b.code.length - a.code.length)) {
            console.log(`\n${kb(c.code.length)}  ${c.fileName}${first.has(c.fileName) ? '   [needed for the menu]' : c.isDynamicEntry ? '   [loaded later]' : ''}`)
            const by = new Map()
            for (const [id, m] of Object.entries(c.modules)) by.set(pkg(id), (by.get(pkg(id)) ?? 0) + m.renderedLength)
            for (const [name, size] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`   ${kb(size)}  ${name}`)
          }
          const total = chunks.filter((c) => first.has(c.fileName)).reduce((a, c) => a + c.code.length, 0)
          console.log(`\nBefore the menu: ${kb(total)} of script in ${first.size} files.`)
        },
      },
    ],
  })
} finally {
  rmSync(out, { recursive: true, force: true })
}
