import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-electron', // Ensure files are built to dist-electron
    rollupOptions: {
      input: path.resolve(__dirname, 'src/index.html'), // Specify path to the source index.html
    },
    target: 'electron', // Ensure Electron target
    emptyOutDir: true, // Clear the output directory before building
  },
  server: {
    port: 5173, // Default port for Vite dev server
  }
});
