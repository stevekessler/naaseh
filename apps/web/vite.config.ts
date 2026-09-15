import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: "Na'aseh",
        short_name: "Na'aseh",
        theme_color: '#06366b',
        background_color: '#f6f8f5',
        display: 'standalone',
        icons: [{ src: '/naaseh_logo.png', sizes: '1536x1024', type: 'image/png', purpose: 'any' }],
      },
      workbox: {
        // Activation must not depend on an older app successfully draining its outbox.
        // Current clients choose when to reload; IndexedDB is independent of shell caches.
        skipWaiting: true,
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        importScripts: ['/push-sw.js'],
      },
    }),
  ],
  server: { proxy: { '/api/v1': 'http://127.0.0.1:3000' } },
});
