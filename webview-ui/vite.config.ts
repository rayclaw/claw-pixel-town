import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    outDir: '../static',
    emptyOutDir: false,
  },
  // Use '/' for Cloudflare Pages, '/static/' for Rust server
  base: process.env.VITE_BASE_PATH || (mode === 'cloudflare' ? '/' : '/static/'),
  server: {
    proxy: {
      '/agents': 'http://localhost:3800',
      '/health': 'http://localhost:3800',
      '/status': 'http://localhost:3800',
      '/join': 'http://localhost:3800',
      '/push': 'http://localhost:3800',
      '/leave': 'http://localhost:3800',
      '/broadcast': 'http://localhost:3800',
      '/set_state': 'http://localhost:3800',
      '/channels': 'http://localhost:3800',
      '/bots': 'http://localhost:3800',
      '/user': 'http://localhost:3800',
      '/lobby': 'http://localhost:3800',
      '/auth': 'http://localhost:3800',
    },
  },
}))
