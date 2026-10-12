// Builds the game and packs it as a zip that itch.io accepts as an HTML game
// (index.html at the top level of the archive).
import { execSync } from 'node:child_process'
import { closeSync, existsSync, openSync, readSync, rmSync } from 'node:fs'

const out = 'silicon-behemoths-itch.zip'
execSync('npm run build', { stdio: 'inherit' })
if (existsSync(out)) rmSync(out)
// bsdtar ships with Windows 10 and later and writes zip archives with -a. It is named in full
// because a Git shell puts GNU tar first on the path, and that one writes a tar whatever the name.
const sysTar = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\tar.exe`
const tar = process.platform === 'win32' && existsSync(sysTar) ? `"${sysTar}"` : 'bsdtar'
execSync(`${tar} -a -c -f ../${out} *`, { cwd: 'dist', stdio: 'inherit' })
// a zip starts with the letters PK: anything else would be refused by itch.io
const head = Buffer.alloc(2)
const fd = openSync(out, 'r')
readSync(fd, head, 0, 2, 0)
closeSync(fd)
if (head.toString() !== 'PK') throw new Error(`${out} is not a zip archive`)
console.log(`\nWrote ${out}. Upload it on itch.io as an HTML game and tick "This file will be played in the browser".`)
