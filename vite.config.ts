import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
    manifest: { name: 'Tend — Personal activity tracker', short_name: 'Tend', description: 'A little care, every day. Your personal habits and activity journal.', theme_color: '#345e48', background_color: '#f6f7f2', display: 'standalone', start_url: '/', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api(?:\/|$)/], maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, cleanupOutdatedCaches: true },
  })],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } } },
  preview: { strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } } },
  build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'charts', test: /node_modules[\\/](recharts|d3-|victory)/ }, { name: 'tables', test: /node_modules[\\/]@tanstack[\\/](react-table|table-core)/ }, { name: 'validation', test: /node_modules[\\/](zod|react-hook-form|@hookform)/ }, { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }] } } } },
})
