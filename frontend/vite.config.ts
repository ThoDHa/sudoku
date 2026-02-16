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
  // Use 'prompt' instead of 'autoUpdate' to prevent background update checks
  // This reduces battery usage by not waking the app to check for updates
  // Users will be prompted to update when a new version is available
  registerType: 'prompt',
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
            if (id.includes('lodash') || id.includes('clsx') || id.includes('class-variance-authority') || id.includes('loglevel')) {
              return 'utils-vendor'
            }
          }

          // Granular application code splitting
          // Split by functionality to reduce initial load time
          // Strategy: shared utilities → specialized features → page-specific code
          if (id.includes('src/') && !id.includes('node_modules')) {
            // WASM and worker files - lazy-loaded separately
            if (id.includes('wasm') || id.includes('worker')) {
              return 'wasm-loader'
            }

            // Solver service and its dependencies - self-contained to avoid circular dependencies
            if (id.includes('solver-service') || id.includes('puzzles-data') || id.includes('dp-solver') || id.includes('seedValidation')) {
              return 'solver-service'
            }

            // Types - move to solver-service to break circular dependency
            if (id.includes('types/sudoku')) {
              return 'solver-service'
            }

            // Homepage route - only loads on homepage
            if (id.includes('pages/Homepage') || id.includes('components/DifficultyGrid') || id.includes('components/DailyCard')) {
              return 'page-home'
            }

            // Game page route - loads only when playing
            if (id.includes('pages/Game') || id.includes('components/ResultModal') || id.includes('components/TechniqueModal') || id.includes('components/TechniquesListModal') || id.includes('components/GameModals') || id.includes('components/DailyPrompt')) {
              return 'page-game'
            }

            // Other pages - Result, Technique, Custom, Leaderboard, About
            if (id.includes('pages/Result') || id.includes('pages/Technique') || id.includes('pages/Custom') || id.includes('pages/Leaderboard') || id.includes('pages/About') || id.includes('components/AboutModal') || id.includes('components/TechniqueDetailView') || id.includes('components/TechniqueDiagram') || id.includes('components/GlossaryModal') || id.includes('components/GlossaryLinkedText') || id.includes('components/ResultSummary') || id.includes('components/AnimatedDiagramView')) {
              return 'pages-other'
            }

            // Game-specific UI components
            if (id.includes('components/Board') || id.includes('components/History') || id.includes('components/Controls') || id.includes('components/GameHeader') || id.includes('components/TimerDisplay')) {
              return 'game-ui'
            }

            // Shared UI components
            if (id.includes('components/Header') || id.includes('components/Menu') || id.includes('components/ErrorBoundary') || id.includes('components/ui') || id.includes('components/DifficultyBadge')) {
              return 'components-shared'
            }

            // Core shared utilities - foundation used everywhere
            if (id.includes('lib/') && !id.includes('node_modules')) {
              return 'app-shared'
            }

            // Shared hooks
            if (id.includes('hooks/') && !id.includes('node_modules')) {
              return 'app-shared'
            }

            // Catch-all for any remaining source files
            return 'app'
          }
        }
      }
    },
    // Increased limit for granular chunks
    // Individual chunks should be smaller, but total app size unchanged
    chunkSizeWarningLimit: 300
  },

  plugins: [
    react(),
    ...pwaPlugins
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
        // Context providers (tested via integration)
        'src/lib/GameContext.tsx',
        'src/lib/BackgroundManagerContext.tsx',
        // Data-only files (lookup tables, no logic to test)
        'src/lib/techniques.ts',
        'src/lib/themes.ts',
      ],
      // Coverage thresholds for critical paths
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
})
