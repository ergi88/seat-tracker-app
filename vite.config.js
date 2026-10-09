import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/* GitHub Pages serves the app under /<repo>/; the deploy workflow sets
 * BASE_PATH from the repository name. Locally it is the root. */
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILT_AT__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Seat Tracker',
        short_name: 'Seats',
        description: 'Your ticket requests, seats, listings and sales, on the phone.',
        id: base,
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f2f3f6',
        theme_color: '#f2f3f6',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          { name: 'New request', url: base + '#/add', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Money', url: base + '#/money', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] }
        ]
      },
      workbox: {
        /* the app shell only: team data is never cached by the service
         * worker (it lives in IndexedDB, per signed-in person) */
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        runtimeCaching: []
      }
    })
  ]
});
