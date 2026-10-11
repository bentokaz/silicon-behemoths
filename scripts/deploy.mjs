// Publishes the production build to the gh-pages branch, which GitHub Pages serves.
import { execSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })
const remote = execSync('git remote get-url origin').toString().trim()
const rev = execSync('git rev-parse --short HEAD').toString().trim()

run('npm run build')
// stop Pages from running the files through Jekyll
writeFileSync('dist/.nojekyll', '')
rmSync('dist/.git', { recursive: true, force: true })
run('git init -q -b gh-pages', 'dist')
run('git add -A', 'dist')
run(`git -c user.name="kiyokaz" -c user.email="kiyokaz@gmail.com" commit -q -m "Deploy ${rev}"`, 'dist')
run(`git push -f "${remote}" gh-pages`, 'dist')
rmSync('dist/.git', { recursive: true, force: true })
