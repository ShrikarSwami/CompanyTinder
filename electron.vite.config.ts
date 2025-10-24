import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'
import { builtinModules } from 'node:module'

// keep native modules external
const externals = [
  'keytar',
  'better-sqlite3',
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`)
]

export default defineConfig({
  // Main process -> produces dist-electron/main.js in dev
  main: {
    entry: 'electron/main.ts',
    vite: {
      build: {
        rollupOptions: { external: externals }
      }
    }
  },

  // Preload -> produces dist-electron/preload.mjs in dev
  preload: {
    input: { index: 'electron/preload.ts' },
    vite: {
      build: {
        rollupOptions: { external: externals }
      }
    }
  },

  // Renderer uses your root index.html
  renderer: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    }
  }
})
