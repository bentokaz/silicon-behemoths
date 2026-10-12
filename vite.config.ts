import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { type Plugin, defineConfig } from 'vite'

/**
 * The menu needs only its own script and React. The rest (the game's screens, the 3D library, the 3D scenes and
 * the charts) is asked for here as well, at low priority: the browser brings it down behind the menu's files
 * instead of only starting on it once the menu is up, so the first screen of a new game is not kept waiting.
 */
const fetchTheRestQuietly = (): Plugin => ({
  name: 'fetch-the-rest-quietly',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      if (!ctx.bundle) return html
      const later = Object.values(ctx.bundle)
        .filter((c) => c.type === 'chunk' && /^assets\/(three|Shell|SiteScene|charts)-/.test(c.fileName))
        // the order they are needed in: the screens and the 3D library first, the charts last
        .sort((a, b) => ['Shell', 'three', 'SiteScene', 'charts'].findIndex((n) => a.fileName.includes(`/${n}-`)) - ['Shell', 'three', 'SiteScene', 'charts'].findIndex((n) => b.fileName.includes(`/${n}-`)))
      return {
        html,
        tags: later.map((c) => ({ tag: 'link', attrs: { rel: 'modulepreload', fetchpriority: 'low', crossorigin: true, href: `./${c.fileName}` }, injectTo: 'head' as const })),
      }
    },
  },
})

export default defineConfig({
  // relative paths, so the build works from a sub-folder such as GitHub Pages
  base: './',
  plugins: [react(), tailwindcss(), fetchTheRestQuietly()],
  // the day the build was made, so a report says which version it came from
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  server: { port: 5183, strictPort: true },
  build: {
    // the big libraries go in files of their own: they download side by side and stay cached between updates.
    // A group takes what it names and whatever that needs, so the order matters: React is claimed first, for the
    // file the menu needs. Left to the 3D group (which also needs React), it rode along in the 1.4 MB 3D file, and
    // the menu could not show until all of that had come down.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', priority: 30, test: /node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store)[\\/]/ },
            { name: 'charts', priority: 20, test: /node_modules[\\/](recharts|d3-|victory-vendor|decimal\.js|react-smooth|recharts-scale)/ },
            { name: 'three', priority: 10, test: /node_modules[\\/](three|@react-three|three-stdlib|postprocessing|n8ao|maath|troika|meshline|camera-controls|detect-gpu|stats-gl|suspend-react|its-fine)/ },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1400,
  },
})
