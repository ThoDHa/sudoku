/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

// Base path for GitHub Pages deployment
// Set VITE_BASE_PATH=/repo-name/ for GitHub Pages, or leave empty for root
const base = process.env.VITE_BASE_PATH || '/'

// Get git commit hash at build time
const getCommitHash = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  base,
  define: {
    __COMMIT_HASH__: JSON.stringify(getCommitHash()),
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Separate React and related libraries
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor'
            }
            if (id.includes('@headlessui') || id.includes('@heroicons')) {
              return 'ui-vendor'
            }
            if (id.includes('date-fns')) {
              return 'date-vendor'
            }
            // Separate utility libraries for better caching
            if (id.includes('lodash') || id.includes('clsx') || id.includes('class-variance-authority')) {
              return 'utils-vendor'
            }
          }

          // Separate WASM-related modules for lazy loading
          if (id.includes('src/lib/wasm.ts') || id.includes('src/lib/solver-service.ts')) {
            return 'wasm-solver'
          }
          
          // Separate large components into their own chunks
          if (id.includes('src/hooks/useAutoSolve.ts')) {
            return 'auto-solve'
          }
          if (id.includes('src/hooks/useSudokuGame.ts') || id.includes('src/hooks/useGameTimer.ts') || id.includes('src/hooks/useBackgroundManager.ts')) {
            return 'game-logic'
          }
          if (id.includes('src/components/Board.tsx') || id.includes('src/components/History.tsx')) {
            return 'game-components'
          }
          // Separate Game page from other pages for better loading
          if (id.includes('src/pages/Game.tsx')) {
            return 'game-page'
          }
          if (id.includes('src/pages/')) {
            return 'pages'
          }
          if (id.includes('src/components/')) {
            return 'ui-components'
          }
        }
      }
    },
    // Adjusted chunk size warning limit - we have optimized chunking
    // Largest chunk is now 634KB (UI components), down from 770KB main bundle
    chunkSizeWarningLimit: 650
  },
  plugins: [
    react(),
    VitePWA({
      // Use 'prompt' instead of 'autoUpdate' to prevent background update checks
      // This reduces battery usage by not waking the app to check for updates
      // Users will be prompted to update when a new version is available
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sudoku',
        short_name: 'Sudoku',
        description: 'Learn Sudoku solving techniques with an educational puzzle app',
        theme_color: '#3b82f6',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: base,
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Force immediate activation of new service worker
        skipWaiting: true,
        clientsClaim: true,
        // Only precache WASM files (large, rarely change, needed for offline)
        globPatterns: ['**/*.wasm', 'wasm_exec.js'],
        // Allow larger files to be precached (for WASM - ~4MB)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        // Cache strategies - NetworkFirst for app, CacheFirst for static assets
        runtimeCaching: [
          {
            // App JS/CSS/HTML - NetworkFirst with battery-friendly settings
            urlPattern: /\.(?:js|css|html)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-assets',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 1 // 1 day instead of 7
              },
              networkTimeoutSeconds: 1, // Reduced from 3 to 1 second for battery savings
              cacheableResponse: {
                statuses: [0, 200]
              },
              // Add plugins for better background behavior
              plugins: [{
                cacheKeyWillBeUsed: async ({ request, mode }) => {
                  // Add version parameter for cache busting
                  const url = new URL(request.url)
                  if (mode === 'read' && document.hidden) {
                    // When reading from cache while page is hidden, prefer cache
                    url.searchParams.set('cache-mode', 'prefer-cache')
                  }
                  return url
                }
              }]
            }
          },
          {
            // Images and icons - CacheFirst (they rarely change)
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // WASM files - CacheFirst (large files that rarely change)
            urlPattern: /\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wasm-cache',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ],
        // Don't cache API calls
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    fileParallelism: false,
    setupFiles: ['./src/test-setup.ts'],
  },
})
