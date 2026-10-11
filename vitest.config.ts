import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // long headless runs of the simulation need more than the default five seconds
    testTimeout: 30000,
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
