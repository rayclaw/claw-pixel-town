import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../static',
    emptyOutDir: false,
  },
  base: '/static/',
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
    },
  },
})
