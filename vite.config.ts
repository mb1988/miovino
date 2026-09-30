import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Runs the Worker (API + D1 + R2) inside the dev server; not during unit tests.
    ...(process.env.VITEST ? [] : [cloudflare()]),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'MioVino — My Wine Cellar',
        short_name: 'MioVino',
        description: 'Your private digital wine cellar and tasting journal.',
        theme_color: '#1a0f14',
        background_color: '#1a0f14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['push-sw.js'],
        // Push notifications (monthly drinking reminder).
        importScripts: ['push-sw.js'],
        // Pages always try the network first, so an expired Cloudflare Access session can redirect to login;
        // the cached shell is used only when offline. The API is never cached.
        navigateFallback: null,
        runtimeCaching: [
          { urlPattern: ({ request }) => request.mode === 'navigate', handler: 'NetworkFirst', options: { cacheName: 'pages', networkTimeoutSeconds: 4 } },
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
})
