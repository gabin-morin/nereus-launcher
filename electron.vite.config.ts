import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'src/main/main.ts'),
        external: ['electron', '@electron-toolkit/utils']
      }
    }
  },
  preload: {
  plugins: [externalizeDepsPlugin()],
  build: {
    rollupOptions: {
      input: path.resolve(__dirname, 'src/preload/preload.ts'),
      external: ['electron'],
      output: {
        format: 'cjs',
        entryFileNames: '[name].js'
      }
    }
  }
},
  renderer: {
  plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'src/renderer/index.html')
      }
    }
  }
})