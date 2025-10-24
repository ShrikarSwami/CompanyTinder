import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'
import { builtinModules } from 'node:module'

const externals = [
  'keytar',
  'better-sqlite3',
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`)
]

export default defineConfig({
  // Main -> dist-electron/main.js
  main: {
    build: {
      lib: {
        entry: 'electron/main.ts',
        formats: ['cjs'],
        fileName: () => 'main'
      },
      rollupOptions: { external: externals, output: { entryFileNames: 'main.js' } }
    }
  },

  // Preload -> dist-electron/preload.mjs
  preload: {
    build: {
      lib: {
        entry: { index: 'electron/preload.ts' },
        formats: ['es'],
        fileName: () => 'preload'
      },
      rollupOptions: { external: externals, output: { entryFileNames: 'preload.mjs' } }
    }
  },

  // Tell electron-vite to use your ROOT index.html (not src/renderer)
  renderer: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    }
  }
})
