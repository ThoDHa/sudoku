/**
 * Playwright Test Fixtures for Sudoku E2E Tests
 *
 * Provides reusable fixtures that eliminate duplicated beforeEach patterns:
 * - skipOnboarding: Auto-skips the onboarding modal for all tests
 * - sdk: Provides a PlaywrightUISDK instance ready to use
 * - mobileViewport: Sets mobile viewport dimensions (must be explicitly used)
 */

import { test as base } from '@playwright/test'
import { PlaywrightUISDK } from './sdk'

declare global {
  interface Window {
    __ENABLE_TEST_DEBUG__?: boolean
  }
}

type SudokuFixtures = {
  _captureConsole: void
  _passthroughRoute: void
  skipOnboarding: void
  sdk: PlaywrightUISDK
  mobileViewport: void
}

export const test = base.extend<SudokuFixtures>({
  // Pass-through request interception, auto for every test, scoped to the
  // config-spawned dev server (PLAYWRIGHT_BASE_URL unset): that transport
  // fires ~17 parallel untransformed module requests per cold page, and bare
  // Chromium contexts on this host burst-fail them with
  // ERR_INSUFFICIENT_RESOURCES (bare control fails 5/5, pass-through passes
  // 6/6; reproduced at main before this branch). Registering any route
  // handler moves the fetches through the interception layer, which removes
  // the burst failure; no request is modified. External transports (preview,
  // CI production artifacts) serve static files and never burst, so they run
  // interception-free.
  _passthroughRoute: [
    async ({ page }, use) => {
      if (process.env['PLAYWRIGHT_BASE_URL']) {
        await use()
        return
      }
      await page.route('**/*', (route) => route.continue())
      await use()
    },
    { auto: true },
  ],
  // Capture console debug messages to a log file for debug traces
  // This writes matching DEBUG_SAVE/DEBUG_ERASE lines to frontend/console-debug.log
  // It uses page.on('console') which runs inside the test process
  // Note: This is safe for CI runs and produces a plain-text log for quick inspection.
  _captureConsole: [
    async ({ page }, use) => {
      const fs = await import('fs')
      const path = await import('path')
      const fsp = fs.promises
      const logPath = path.resolve(process.cwd(), 'console-debug.log')
      try {
        // Clear previous log
        await fsp.writeFile(logPath, '')
      } catch (e) {
        // ignore
      }
      page.on('console', async (msg) => {
        try {
          const text = msg.text()
          if (/DEBUG_SAVE|DEBUG_ERASE/.test(text)) {
            const line = `${new Date().toISOString()} ${msg.type()} ${text}\n`
            await fsp.appendFile(logPath, line)
          }
        } catch (e) {
          // ignore logging errors
        }
      })
      await use()
    },
    { auto: true },
  ],
  // Auto-skip onboarding for all tests and enable test debug flag
  skipOnboarding: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        window.__ENABLE_TEST_DEBUG__ = true
        localStorage.setItem('sudoku_onboarding_complete', 'true')
        // Force showDailyReminder off without clobbering other preference keys.
        // This runs on every navigation/reload, so overwriting the whole object
        // would wipe any preference a test set (e.g. autoSolveSpeed), making
        // persistence-across-reload tests impossible. Merge into existing prefs
        // instead, preserving both the versioned-envelope and plain shapes.
        const isRec = (v: unknown): v is Record<string, unknown> =>
          typeof v === 'object' && v !== null
        const existingPrefs = localStorage.getItem('sudoku_preferences')
        if (existingPrefs) {
          try {
            const parsed: unknown = JSON.parse(existingPrefs)
            if (parsed && typeof parsed === 'object' && 'data' in parsed) {
              ;(parsed as { data: Record<string, unknown> })['data']['showDailyReminder'] = false
            } else if (isRec(parsed)) {
              parsed['showDailyReminder'] = false
            }
            localStorage.setItem('sudoku_preferences', JSON.stringify(parsed))
          } catch {
            localStorage.setItem('sudoku_preferences', JSON.stringify({ showDailyReminder: false }))
          }
        } else {
          localStorage.setItem('sudoku_preferences', JSON.stringify({ showDailyReminder: false }))
        }
      })
      await use()
    },
    { auto: true },
  ],

  // Provide SDK instance
  sdk: async ({ page }, use) => {
    await use(new PlaywrightUISDK({ page }))
  },

  // Mobile viewport helper (not auto, must be explicitly used)
  // Sets viewport to iPhone SE dimensions for mobile testing
  mobileViewport: async ({ page }, use) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await use()
  },
})

export { expect } from '@playwright/test'
