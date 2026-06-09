import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Default `/` for standalone deploy at admin.hakalive.com.
// For backend embed at api.hakalive.com/admin, set VITE_BASE_PATH=/admin/ at build time.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  base: process.env.VITE_BASE_PATH ?? '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3010',
    },
  },
})
