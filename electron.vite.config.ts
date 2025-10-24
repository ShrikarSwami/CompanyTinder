import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'
import { builtinModules } from 'node:module'

const externals = ['keytar', 'better-sqlite3', ...builtinModules, ...builtinModules.map(m => `node:${m}`)]

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') },
        external: externals
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') },
        external: externals
      }
    }
  },
  renderer: {
    build: {
      rollupOptions: {
        // use your existing Vite root HTML
        input: resolve(__dirname, 'index.html')
      }
    }
  }
})
