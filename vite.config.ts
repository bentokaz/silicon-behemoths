import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // relative paths, so the build works from a sub-folder such as GitHub Pages
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5183, strictPort: true },
  build: {
    // the big libraries go in files of their own: they download side by side and stay cached between updates
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'three', test: /node_modules[\\/](three|@react-three|three-stdlib|postprocessing|n8ao|maath|troika|meshline|camera-controls|detect-gpu|stats-gl|suspend-react|its-fine)/ },
            { name: 'charts', test: /node_modules[\\/](recharts|d3-|victory-vendor|decimal\.js|react-smooth|recharts-scale)/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store)[\\/]/ },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1400,
  },
})
