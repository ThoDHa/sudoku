/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

// React Compiler via plugin-react v6's first-party reactCompilerPreset, run
// through @rolldown/plugin-babel. plugin-react v6 dropped the v5 `babel: {}`
// option (it uses oxc, not babel, for JSX), so the previous
// `react({ babel: { plugins: [RC] } })` config was silently ignored and the
// compiler never ran in any environment.
//
// reactCompilerPreset's default applyToEnvironmentHook gates on
// `consumer === 'client'`, which excludes the vitest (non-client) environment.
// This app is a SPA with no SSR: client is the only real consumer in real
// builds, and forcing the hook true in vitest aligns the test transform with
// production so tests exercise RC-memoized code (required for the identity
// stability tests and for safely removing manual useMemo/useCallback).
const reactCompilerPresetAllEnvs = (() => {
  const preset = reactCompilerPreset({ target: '19' })
  return {
    ...preset,
    rolldown: {
      ...preset.rolldown,
      applyToEnvironmentHook: () => true,
    },
  }
})()

// The React Compiler is ON for ALL environments including coverage. Istanbul
// (the coverage provider) instruments the SOURCE before RC's babel transform,
// so RC's cache-invalidation branches (_c, $[) are NOT tracked — coverage
// measures the code developers wrote, not the compiler's emitted cache code.
// This eliminates the need for VITE_SKIP_RC and the unmemoized-cascade perf
// regression it caused during FE-7's manual-memoization sweep.
const enableReactCompiler = !process.env.VITE_SKIP_RC

// Dev server only: strip the CSP <meta> tag from the served index.html.
// The tag exists for the GitHub Pages deploy (Pages cannot set response
// headers); nginx delivers the same policy as an HTTP header. In dev, Vite
// serves application CSS by injecting inline <style> elements and
// plugin-react injects an inline refresh preamble script, both of which the
// strict policy (style-src 'self'; script-src without 'unsafe-inline')
// blocks - leaving the dev app unstyled and logging CSP violations.
// apply: 'serve' keeps `vite build` output untouched, so the built HTML
// (Pages) and nginx keep the full CSP.
const stripCspMetaInDev: Plugin = {
  name: 'strip-csp-meta-in-dev',
  apply: 'serve',
  transformIndexHtml(html) {
    // [^>]* is safe: the content attribute holds no '>', and bounding at the
    // first '>' means a reformatted tag can never swallow following elements.
    const stripped = html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/, '')
    if (stripped === html) {
      console.warn(
        '[strip-csp-meta-in-dev] No CSP meta tag matched in index.html; ' +
          'dev-served CSS and the react-refresh preamble will be CSP-blocked',
      )
    }
    return stripped
  },
}

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
// Exported so stryker.vitest.config.ts wires the identical plugin rather than
// its own copy. Without it, `virtual:pwa-register` does not resolve and every
// test transitively importing pwaRegistration.ts fails to load under Stryker.
export const pwaPlugins = [
  VitePWA({
    // autoUpdate so a new deploy takes over returning browsers automatically.
    // 'prompt' left users stranded on stale cached bundles because no update
    // prompt was ever wired, so the waiting worker never activated.
    registerType: 'autoUpdate',
    // Enable dev service worker only when ENABLE_PWA_IN_DEV is truthy
    devOptions: {
      enabled: !!process.env.ENABLE_PWA_IN_DEV,
      type: 'module',
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
          type: 'image/png',
        },
        {
          src: 'pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
        },
        {
          src: 'pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ],
    },
    workbox: {
      // Force immediate activation of new service worker
      skipWaiting: true,
      clientsClaim: true,
      // Precache the app shell (HTML/JS/CSS/icons) plus the WASM solver so an
      // installed PWA boots fully offline. autoUpdate + revisioned precache
      // handles invalidation, so no manual cache wipe is needed on deploy.
      globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
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
              maxAgeSeconds: 60 * 60 * 24 * 1,
            },
            networkTimeoutSeconds: 3,
            cacheableResponse: {
              statuses: [0, 200],
            },
          },
        },
        {
          // Images and icons - CacheFirst (they rarely change)
          urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico)$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'images-cache',
            expiration: {
              maxEntries: 30,
              maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
            },
            cacheableResponse: {
              statuses: [0, 200],
            },
          },
        },
      ],
      // Serve the precached shell for offline SPA navigations (/, /daily-..., /c/<encoded>).
      // Keep API requests out of the fallback so they fail clean when offline, and
      // keep the deployed quality reports out of it too: /reports/ and /test-report/
      // are plain static sites published beside the app, and an SW-served app shell
      // answers those navigations with the game homepage (BUG-27). Unanchored on
      // purpose: under a base path (github.io/sudoku/) the pathname starts with
      // /sudoku/, so an anchored /^\/reports\// would never match.
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/api\//, /\/reports(\/|$)/, /\/test-report(\/|$)/],
    },
  }),
]

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
        manualChunks: undefined,
      },
    },
    chunkSizeWarningLimit: 1000,
  },

  plugins: [
    stripCspMetaInDev,
    react(),
    ...(enableReactCompiler ? [babel({ presets: [reactCompilerPresetAllEnvs] })] : []),
    ...pwaPlugins,
  ],
  server: {
    host: true,
    watch: {
      // Artifact directories are never dev-server inputs. Allure results in
      // particular can reach hundreds of thousands of files, which exhausts
      // inotify watchers (ENOSPC) and prevents the dev server from starting.
      // dev-dist/ stays watched: vite-plugin-pwa writes and serves it in dev.
      ignored: [
        '**/allure-results/**',
        '**/test-results/**',
        '**/playwright-report/**',
        '**/coverage/**',
        '**/reports/**',
        '**/.stryker-tmp/**',
      ],
    },
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
    // Reset allure-results once per run so reporter output stays bounded
    // (see test/clean-allure-results.ts for the ALLURE_SKIP_CLEAN contract).
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['allure-vitest/setup', './test/test-setup.ts'],
    reporters: [
      'default',
      [
        'allure-vitest/reporter',
        {
          resultsDir: './allure-results',
          links: {
            issue: {
              urlTemplate: 'https://github.com/allure-framework/allure-js/issues/%s',
            },
          },
        },
      ],
    ],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      // Critical paths requiring high coverage
      include: ['src/lib/**/*.ts', 'src/hooks/**/*.ts'],
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
        // Browser service-worker/Cache-API integration shim (registerSW,
        // unregister + cache wipe). Mirrors cache-version.ts: a thin wrapper
        // over browser-only APIs whose real behavior is proven by the
        // pwa-offline e2e, not jsdom unit tests.
        'src/lib/pwaRegistration.ts',
        // Pure re-export barrel (no logic; delegates to solver-service)
        'src/lib/api.ts',
        // Context providers (tested via integration)
        'src/lib/GameContext.tsx',
        'src/lib/BackgroundManagerContext.tsx',
        // Data-only files (lookup tables, no logic to test)
        'src/lib/techniques.ts',
        'src/lib/themes.ts',
      ],
      // Coverage thresholds. Istanbul (chosen over v8 so the React Compiler can
      // stay ON during coverage — measuring source, not RC-emitted cache branches)
      // tracks branch coverage slightly differently: defensive guards sealed with
      // /* istanbul ignore next */ still show their conditional branch as uncovered
      // (~18 branches across 9 files, all provably-unreachable defensive code).
      // Branches threshold is 99% to accommodate this; statements/functions/lines
      // remain at the hard 100 contract.
      thresholds: {
        statements: 99,
        branches: 99,
        functions: 100,
        lines: 100,
      },
    },
  },
})
