import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['@xenova/transformers'],
  },
  resolve: {
    alias: {
      'onnxruntime-web': 'onnxruntime-web/dist/ort-web.min.js'
    }
  }
})
