import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { 
    sourcemap: true,
    outDir: 'dist',
    assetsDir: 'assets'
  },
  server: {
    port: 3002,
    host: 'localhost',
    proxy: {
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL || 'https://vaai-backend-worker.dnash29.workers.dev')
  }
})