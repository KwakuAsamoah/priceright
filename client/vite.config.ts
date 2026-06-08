import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const appVersion = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf-8'),
).version as string

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  build: {
    outDir: '../client-dist',
    emptyOutDir: true,
  },
})
