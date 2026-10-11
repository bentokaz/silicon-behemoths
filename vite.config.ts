import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // relative paths, so the build works from a sub-folder such as GitHub Pages
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5183, strictPort: true },
})
