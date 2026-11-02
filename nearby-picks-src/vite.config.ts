import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base so the build works from any sub-path (e.g. username.github.io/nearby-picks/).
export default defineConfig({
  base: './',
  // MapLibre alone is ~1 MB minified; that's expected for a map-first app.
  build: {
    chunkSizeWarningLimit: 1500,
    // The built app is committed at ../nearby-picks so GitHub Pages serves it at /nearby-picks/.
    outDir: '../nearby-picks',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        // Serve MapLibre's worker as .js: every static host sends a JavaScript MIME type for that.
        assetFileNames: (info) =>
          (info.names?.[0] ?? '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Nearby Picks',
        short_name: 'Nearby Picks',
        description: 'Well-reviewed trails and food near your home point.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f6f5f1',
        theme_color: '#2f6b4f',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + bundled spot data are precached; MapLibre's bundle is large.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Basemap style JSON, vector tiles, fonts and sprites: whatever you've viewed works offline.
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'basemap',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'tile.openstreetmap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-raster',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
