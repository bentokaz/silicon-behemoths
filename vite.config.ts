import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // relative paths, so the build works from a sub-folder such as GitHub Pages
  base: './',
  plugins: [react(), tailwindcss()],
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
