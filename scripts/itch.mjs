// Builds the game and packs it as a zip that itch.io accepts as an HTML game
// (index.html at the top level of the archive).
import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'

const out = 'silicon-behemoths-itch.zip'
execSync('npm run build', { stdio: 'inherit' })
if (existsSync(out)) rmSync(out)
// bsdtar ships with Windows 10 and later and writes zip archives with -a
execSync(`tar -a -c -f ../${out} *`, { cwd: 'dist', stdio: 'inherit' })
console.log(`\nWrote ${out}. Upload it on itch.io as an HTML game and tick "This file will be played in the browser".`)
