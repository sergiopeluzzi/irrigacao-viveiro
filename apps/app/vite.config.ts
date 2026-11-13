import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Irrigação do Viveiro',
        short_name: 'Irrigação',
        description: 'Controle da irrigação e adubação do viveiro de mudas.',
        lang: 'pt-BR',
        theme_color: '#2f6b3a',
        background_color: '#f6f8f4',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      // A API nunca é cacheada: só o "casco" do app funciona offline.
      workbox: { navigateFallbackDenylist: [/^\/api/] },
    }),
  ],
  server: { port: 5174 },
})
