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

  // PWA plugin: enabled in dev only when explicitly requested via env
const pwaPlugins = [VitePWA({
  // autoUpdate so a new deploy takes over returning browsers automatically.
  // 'prompt' left users stranded on stale cached bundles because no update
  // prompt was ever wired, so the waiting worker never activated.
  registerType: 'autoUpdate',
  // Enable dev service worker only when ENABLE_PWA_IN_DEV is truthy
  devOptions: {
    enabled: !!process.env.ENABLE_PWA_IN_DEV,
    type: 'module'
  },
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
        // App JS/CSS/HTML - NetworkFirst so a fresh deploy is preferred over cache.
        // The 3s timeout keeps offline/slow loads usable without pinning users to a
        // stale bundle the way the old 1s timeout did.
        urlPattern: /\.(?:js|css|html)$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'app-assets',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24 * 1
          },
          networkTimeoutSeconds: 3,
          cacheableResponse: {
            statuses: [0, 200]
          }
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
})];

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
        manualChunks: undefined
      }
    },
    chunkSizeWarningLimit: 1000
  },

  plugins: [
    react(),
    ...pwaPlugins
  ],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.mjs'],
    fileParallelism: false,
    setupFiles: ['allure-vitest/setup', './test/test-setup.ts'],
    reporters: [
      'default',
      ['allure-vitest/reporter', { 
        resultsDir: './allure-results',
        links: {
          issue: {
            urlTemplate: 'https://github.com/allure-framework/allure-js/issues/%s'
          }
        }
      }]
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      // Critical paths requiring high coverage
      include: [
        'src/lib/**/*.ts',
        'src/hooks/**/*.ts',
      ],
      // Exclude non-critical files
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/test-setup.ts',
        'src/vite-env.d.ts',
        'src/main.tsx',
        // Re-exports and constants (trivial)
        'src/lib/constants.ts',
        'src/lib/hooks.ts',
        'src/lib/cache-version.ts',
        // Pure re-export barrel (no logic; delegates to solver-service)
        'src/lib/api.ts',
        // Context providers (tested via integration)
        'src/lib/GameContext.tsx',
        'src/lib/BackgroundManagerContext.tsx',
        // Data-only files (lookup tables, no logic to test)
        'src/lib/techniques.ts',
        'src/lib/themes.ts',
      ],
      // Coverage thresholds for critical paths. Set to the TEST-001 target
      // (85/75/85/85); measured coverage sits above this (89/81/89/89), so the
      // floor leaves headroom for minor fluctuations while still guarding the
      // critical lib/hooks paths against regressions.
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 85,
        lines: 85,
      },
    },
  },
})
