// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: base:'./' makes Vite emit relative asset URLs so file:// works.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
