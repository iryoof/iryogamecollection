import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Eigene Domain iryo.bid: die Seite liegt in der Wurzel, nicht mehr unter
  // /iryogamecollection/. frontend/public/CNAME hält die Domain für den
  // Pages-Deploy fest. Alle Links im Code gehen über import.meta.env.BASE_URL,
  // deshalb bleibt ein Wechsel hier folgenlos für sie.
  base: '/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false
  },
  build: {
    target: 'esnext',
    minify: 'terser'
  }
})
