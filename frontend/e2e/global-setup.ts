/**
 * Global setup for Playwright tests
 *
 * This file runs once before all tests and sets up any global state:
 * auth/onboarding storage state plus a warmup pass over the slow suite's
 * heavy entry routes.
 */

/**
 * Routes the slow specs enter on whose first cold transform starves their
 * short entry waits. A cold dev server needs ~11s to serve the seeded-puzzle
 * page (measured, 15s wait budget); one request per route during setup drops
 * that to ~2s before any worker starts. The homepage is already warmed by the
 * baseURL visit below.
 *
 * App.tsx renders every /<seed-or-P-name>?d= route with the same lazy Game
 * component (route /:seed), so one warmed route per named shape covers the
 * suite: hint-consistency.spec.ts's /P<timestamp><n> seeds are generated at
 * runtime and load the identical chunk, and the hard shape (entry route of
 * the skipped hard-puzzle test in full-solve.spec.ts) stays listed so
 * un-skipping it needs no new warmup entry.
 */
const slowSuiteWarmupRoutes = ['/P-full-solve-medium?d=medium', '/P-full-solve-hard?d=hard']

import { chromium, FullConfig } from '@playwright/test'
import { cleanAllureResults } from '../test/clean-allure-results'
import { waitForBoard } from './utils/board-wait'

async function globalSetup(config: FullConfig) {
  // Bound allure-results to this run's output (skipped under ALLURE_SKIP_CLEAN)
  cleanAllureResults()

  // Create a browser context to set up localStorage
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  // Navigate to the app to set localStorage
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:5173'
  await page.goto(baseURL)

  // Aggressively unregister service workers, clear caches, and log diagnostics to traces
  await page.evaluate(async () => {
    try {
      if ('serviceWorker' in navigator) {
        try {
          let regs = await navigator.serviceWorker.getRegistrations()
          for (const r of regs) {
            try {
              await r.unregister()
            } catch {
              // Silent failure - ignore
            }
          }
          // give the browser a moment to settle
          await new Promise((res) => setTimeout(res, 100))
          regs = await navigator.serviceWorker.getRegistrations()
        } catch {
          // Silent failure - ignore
        }
      }

      if ('caches' in window) {
        try {
          const keys = await caches.keys()
          for (const k of keys) {
            try {
              await caches.delete(k)
            } catch {
              // Silent failure - ignore
            }
          }
        } catch {
          // Silent failure - ignore
        }
      }

      // Log IndexedDB databases when available for diagnostics (do not attempt destructive actions)
      if (typeof indexedDB !== 'undefined' && 'databases' in indexedDB) {
        try {
          // `databases()` is an experimental API absent from the DOM lib types;
          // the `'databases' in` guard above proves it is present at runtime.
          await (
            indexedDB as IDBFactory & {
              databases(): Promise<Array<{ name: string; version: number }>>
            }
          ).databases()
        } catch {
          // Silent failure - ignore
        }
      }
    } catch {
      // Silent failure - ignore
    }
  })

  // Set onboarding complete so it doesn't block tests
  await page.evaluate(() => {
    localStorage.setItem('sudoku_onboarding_complete', 'true')
    // Disable daily reminder modal to prevent blocking tests
    // The preferences are stored as a JSON object in 'sudoku_preferences' key
    const currentPrefs = JSON.parse(localStorage.getItem('sudoku_preferences') || '{}')
    localStorage.setItem(
      'sudoku_preferences',
      JSON.stringify({
        ...currentPrefs,
        showDailyReminder: false,
      }),
    )
    // Clear any existing game saves to prevent "Game In Progress" modals
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('sudoku_game_')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key))
  })

  // Save storage state
  await context.storageState({ path: 'e2e/.auth/storage-state.json' })

  // Warm the heavy slow-suite routes last: any game state or service worker
  // this pass creates stays out of the saved storage state and dies with this
  // context. 60s covers the first cold transform; later requests hit the
  // dev server's warm module cache.
  for (const route of slowSuiteWarmupRoutes) {
    await page.goto(`${baseURL}${route}`, { timeout: 60000 })
    await waitForBoard(page, { timeout: 60000 })
  }

  await browser.close()
}

export default globalSetup
