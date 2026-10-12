import { configDefaults, defineConfig } from 'vitest/config'

// the soak harness and the other diagnostics are run on purpose (scripts/soak.mjs sets SOAK), never by "npm test"
const diag = process.env.SOAK ? [] : ['**/*.diag.test.ts']

export default defineConfig({
  test: {
    // long headless runs of the simulation need more than the default five seconds
    testTimeout: 30000,
    exclude: [...configDefaults.exclude, '.claude/**', ...diag],
  },
})
