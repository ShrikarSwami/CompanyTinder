import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 }
})

build: {
  outDir: 'dist-electron',   // Ensure Vite builds to dist-electron
  rollupOptions: {
    input: 'src/index.html'  // Specify the path to index.html in the src folder
  }
}
