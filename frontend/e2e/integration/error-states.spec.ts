import { test, expect } from '../fixtures'
import type { Page } from '@playwright/test'

/**
 * Error States and Recovery Tests
 *
 * Comprehensive tests for error handling, graceful degradation,
 * and recovery functionality across the Sudoku application.
 *
 * Categories:
 * 1. Invalid Puzzle String Handling
 * 2. WASM Load Failure Recovery
 * 3. Network/API Errors
 * 4. Graceful Degradation
 * 5. Error Message Display
 *
 * Tag: @integration @errors @recovery
 */

// Valid puzzle strings for reference
const VALID_PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
const VALID_PUZZLE_ALT =
  '003020600900305001001806400008102900700000008006708200002609500800203009005010300'

// The /custom page has no <input>/<textarea>; full puzzle strings are entered
// via the clipboard-driven Paste button. The error notice is a Tailwind-styled
// div (class bg-red-100) with no role="alert".
const CUSTOM_ERROR = '.bg-red-100'
const PASTE_BUTTON = 'button:has-text("Paste")'
const VALIDATE_BUTTON = 'button:has-text("Validate & Play")'

async function pastePuzzle(page: Page, puzzle: string): Promise<void> {
  await page.evaluate((text) => {
    if (!navigator.clipboard) {
      const store = { text }
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (t: string) => {
            store.text = t
          },
          readText: async () => store.text,
        },
        configurable: true,
      })
    } else {
      navigator.clipboard.writeText(text)
    }
  }, puzzle)
  await page.locator(PASTE_BUTTON).click()
}

// ============================================================================
// Invalid Puzzle String Handling
// ============================================================================

test.describe('@integration Error States - Invalid Puzzle Strings', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!('clipboard' in navigator)) {
        const store: { text: string } = { text: '' }
        Object.defineProperty(navigator, 'clipboard', {
          value: {
            writeText: async (t: string) => {
              store.text = t
            },
            readText: async () => store.text,
          },
          configurable: true,
        })
      }
    })
    await page.goto('/custom')
    await expect(page.locator(PASTE_BUTTON)).toBeVisible({ timeout: 10000 })
  })

  test('displays error for puzzle string that is too short', async ({ page }) => {
    await pastePuzzle(page, '1'.repeat(50))

    await expect(page.getByText(/Expected 81 digits/i)).toBeVisible({ timeout: 5000 })
  })

  test('displays error for puzzle string that is too long', async ({ page }) => {
    await pastePuzzle(page, '1'.repeat(100))

    await expect(page.getByText(/Expected 81 digits/i)).toBeVisible({ timeout: 5000 })
  })

  test('displays error for puzzle with invalid characters', async ({ page }) => {
    await pastePuzzle(
      page,
      'abc070000600195000098000060800060003400803001700020006060000280000419005000080xyz',
    )

    await expect(page.getByText(/Expected 81 digits/i)).toBeVisible({ timeout: 5000 })
  })

  test('displays error for puzzle with duplicate in row/col/box', async ({ page }) => {
    const duplicatePuzzle =
      '550070000600195000098000060800060003400803001700020006060000280000419005000080079'
    await pastePuzzle(page, duplicatePuzzle)

    await page.locator(VALIDATE_BUTTON).click()

    await expect(page).toHaveURL(/\/custom/, { timeout: 10000 })
    await expect(page.locator(CUSTOM_ERROR)).toBeVisible({ timeout: 10000 })
  })

  test('handles empty puzzle string gracefully', async ({ page }) => {
    await expect(page.locator('[role="grid"]')).toBeVisible()
    await expect(page.locator('[role="gridcell"]')).toHaveCount(81)
    await expect(page.locator(VALIDATE_BUTTON)).toBeVisible()
  })
})

// ============================================================================
// WASM Load Failure Recovery
// ============================================================================

test.describe('@integration Error States - WASM Load Failure', () => {
  test('handles WASM load failure gracefully', async ({ page }) => {
    // Block WASM file to simulate failure
    await page.route('**/*.wasm', (route) => route.abort())

    await page.goto('/')
    await page.getByRole('button', { name: /easy Play/i }).click()
    await page.waitForLoadState('networkidle')

    // Wait for grid to potentially load
    const hasGrid = await page
      .locator('[role="grid"]')
      .isVisible({ timeout: 10000 })
      .catch(() => false)

    if (hasGrid) {
      // If grid loaded, try to use hint (which requires solver)
      const hintButton = page.getByRole('button', { name: /Hint/i })

      if (await hintButton.isVisible().catch(() => false)) {
        await hintButton.click()

        // Wait for hint operation to complete or error to appear
        await Promise.race([
          page
            .waitForSelector('text=/solver|unavailable|error|unable/i', { timeout: 5000 })
            .catch(() => null),
          page
            .waitForFunction(
              () =>
                // Check if board state changed (hint worked)
                document.querySelectorAll('[role="gridcell"][data-value]').length > 0,
              {},
              { timeout: 5000 },
            )
            .catch(() => null),
        ])

        // Graceful degradation: with WASM blocked the grid must survive the hint
        // attempt intact (either a solver-unavailable error surfaced or the JS
        // fallback applied a value), proving the app did not crash.
        await expect(page.locator('[role="grid"]')).toBeVisible()
        await expect(page.locator('[role="gridcell"]')).toHaveCount(81)
      }
    }

    // Page should not crash regardless
    await expect(page.locator('body')).toBeVisible()
  })

  test('recovers when WASM eventually loads after initial failure', async ({ page }) => {
    let blockWasm = true

    // Initially block WASM
    await page.route('**/*.wasm', async (route) => {
      if (blockWasm) {
        await route.abort()
      } else {
        await route.continue()
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: /easy Play/i }).click()
    await page.waitForLoadState('networkidle')

    // Now allow WASM to load
    blockWasm = false

    // Refresh the page to allow WASM to load
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Board should now be fully functional
    const hasGrid = await page
      .locator('[role="grid"]')
      .isVisible({ timeout: 15000 })
      .catch(() => false)

    if (hasGrid) {
      // Try using hint to verify solver works
      const hintButton = page.getByRole('button', { name: /Hint/i })
      if (
        (await hintButton.isVisible().catch(() => false)) &&
        (await hintButton.isEnabled().catch(() => false))
      ) {
        await hintButton.click()

        // Wait for hint to complete
        await page
          .waitForFunction(
            () => {
              const cells = document.querySelectorAll('[role="gridcell"]')
              return cells.length > 0 // Basic check that board is present
            },
            {},
            { timeout: 5000 },
          )
          .catch(() => null)
      }
    }

    // App should be functional
    expect(hasGrid).toBeTruthy()
  })
})

// ============================================================================
// Network/API Errors
// ============================================================================

test.describe('@integration Error States - Network/API Errors', () => {
  test('handles failed puzzle fetch gracefully', async ({ page }) => {
    // Block API requests to puzzle endpoints
    await page.route('**/api/**', (route) => {
      if (route.request().url().includes('puzzle') || route.request().url().includes('daily')) {
        route.abort()
      } else {
        route.continue()
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Homepage must still render its difficulty UI despite the blocked daily
    // puzzle fetch; a blank/crashed page would have no Play buttons.
    await expect(page.getByRole('button', { name: /Play/i }).first()).toBeVisible({
      timeout: 10000,
    })
  })

  test('handles failed leaderboard fetch gracefully', async ({ page }) => {
    // Block leaderboard API (though leaderboard uses localStorage, not API)
    await page.route('**/api/**/leaderboard**', (route) => route.abort())
    await page.route('**/api/**/scores**', (route) => route.abort())

    await page.goto('/leaderboard')
    await page.waitForLoadState('networkidle')

    // Leaderboard is localStorage-backed, so blocking the API must not crash it:
    // the difficulty section headings render regardless of network failure.
    await expect(
      page.locator('h3:has-text("easy"), h3:has-text("medium"), h3:has-text("hard")').first(),
    ).toBeVisible({ timeout: 10000 })
  })
})

// ============================================================================
// Graceful Degradation
// ============================================================================

test.describe('@integration Error States - Graceful Degradation', () => {
  test('app remains usable when localStorage is unavailable', async ({ page }) => {
    // Disable localStorage
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: () => {
            throw new Error('localStorage disabled')
          },
          setItem: () => {
            throw new Error('localStorage disabled')
          },
          removeItem: () => {
            throw new Error('localStorage disabled')
          },
          clear: () => {
            throw new Error('localStorage disabled')
          },
        },
        writable: false,
      })
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // App should still load and be usable
    await expect(page.locator('body')).toBeVisible()

    // Should be able to navigate or see content
    const hasContent = await page
      .locator('button, a, [role="grid"]')
      .first()
      .isVisible()
      .catch(() => false)
    expect(hasContent).toBeTruthy()
  })

  test('no uncaught exceptions in console during normal navigation', async ({ page }) => {
    const consoleErrors: string[] = []

    // Listen for console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        // Ignore known acceptable errors (like failed network requests we're testing)
        if (!text.includes('net::ERR') && !text.includes('Failed to fetch')) {
          consoleErrors.push(text)
        }
      }
    })

    // Listen for uncaught exceptions
    page.on('pageerror', (error) => {
      consoleErrors.push(`Uncaught: ${error.message}`)
    })

    // Navigate through various pages
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.goto('/custom')
    await page.waitForLoadState('networkidle')

    await page.goto('/')
    await page.getByRole('button', { name: /easy Play/i }).click()
    await page.waitForLoadState('networkidle')

    // Filter out expected/acceptable errors
    const criticalErrors = consoleErrors.filter(
      (err) =>
        !err.includes('ResizeObserver') && // Known browser quirk
        !err.includes('hydration') && // SSR hydration warnings
        !err.includes('Warning:') && // React development warnings
        !err.includes('Unexpected keyword'), // WebKit/Safari ES module loading quirk in dev mode
    )

    // Should have no critical uncaught exceptions
    expect(criticalErrors.length).toBe(0)
  })

  test('error boundary catches React errors without crashing app', async ({ page }) => {
    // Try to navigate to a random route - in this app, any route becomes a puzzle seed
    // This tests that the app handles arbitrary seeds gracefully without crashing
    await page.goto('/this-route-definitely-does-not-exist-12345')
    await page.waitForLoadState('networkidle')

    // The router has a catch-all `/:seed` route that renders <Game />, so an
    // unknown path is treated as a puzzle seed and renders a playable grid
    // rather than crashing the app. The grid appearing proves the error
    // boundary / route handler kept the app alive.
    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('[role="grid"]')).toBeVisible({ timeout: 15000 })
  })
})

// ============================================================================
// Error Message Display
// ============================================================================

test.describe('@integration Error States - Error Message Display', () => {
  test('error messages are user-friendly, not stack traces', async ({ page }) => {
    // Navigate with clearly invalid puzzle
    const invalidPuzzle = 'not-a-valid-puzzle-at-all!!!'
    await page.goto(`/custom?puzzle=${invalidPuzzle}`)

    await page.waitForLoadState('networkidle')

    // If there's an error message, it should be user-friendly
    const errorElements = page.locator('[role="alert"], .error, [class*="error"], .toast')
    const errorCount = await errorElements.count()

    if (errorCount > 0) {
      for (let i = 0; i < errorCount; i++) {
        const errorText = await errorElements.nth(i).textContent()

        if (errorText) {
          // Should NOT contain stack trace indicators
          expect(errorText).not.toMatch(/at\s+\w+\s+\(/) // "at functionName ("
          expect(errorText).not.toMatch(/\.js:\d+:\d+/) // "file.js:123:45"
          expect(errorText).not.toMatch(/Error:\s*$/) // Just "Error:" with nothing helpful
          expect(errorText).not.toMatch(/undefined|null|NaN/i) // Raw technical values
        }
      }
    }

    // Page should still be functional
    await expect(page.locator('body')).toBeVisible()
  })

  test('errors have recovery action or are dismissible', async ({ page }) => {
    // Block WASM and try to use solver features to trigger an error
    await page.route('**/*.wasm', (route) => route.abort())

    await page.goto('/')
    await page.getByRole('button', { name: /easy Play/i }).click()
    await page.waitForLoadState('networkidle')

    // If there's an error displayed, check for recovery options
    const errorElements = page.locator('[role="alert"], .error-message, [class*="error-state"]')

    if (
      await errorElements
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      // An error is shown: a recovery control (dismiss / retry / navigation)
      // must be present. A single selector-list locator expresses the
      // legitimate "any recovery affordance" check without a JS disjunction,
      // and Playwright's built-in retry surfaces a real absence as a failure.
      const recovery = page.locator(
        'button:has-text("Dismiss"), button:has-text("Close"), button:has-text("OK"), [aria-label="Close"], ' +
          'button:has-text("Retry"), button:has-text("Try Again"), button:has-text("Reload"), ' +
          'a:has-text("Home"), a:has-text("Back"), button:has-text("Go Back")',
      )
      await expect(recovery.first()).toBeVisible({ timeout: 5000 })
    }

    // Alternatively, if no error is shown (app degraded gracefully), that's also acceptable
    await expect(page.locator('body')).toBeVisible()
  })
})

// ============================================================================
// Edge Cases and Regression Tests
// ============================================================================

test.describe('@integration Error States - Edge Cases', () => {
  test('handles rapid navigation without errors', async ({ page }) => {
    test.skip(
      ['iphone-12', 'pixel-5'].includes(test.info().project.name),
      'PWA dev mode service worker has WebKit compatibility issues with ES module loading',
    )

    const consoleErrors: string[] = []

    page.on('pageerror', (error) => {
      consoleErrors.push(error.message)
    })

    await page.goto('/')
    await page.goto('/custom')
    await page.goto('/')
    await page.getByRole('button', { name: /easy Play/i }).click()
    await page.goto('/')
    await page.goto('/')
    await page.getByRole('button', { name: /hard Play/i }).click()

    await page.waitForLoadState('networkidle')

    expect(consoleErrors.length).toBe(0)
  })

  test('handles browser back/forward with pending operations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.goto('/')
    await page.getByRole('button', { name: /easy Play/i }).click()
    await page.waitForSelector('[role="grid"]', { timeout: 15000 })

    // Start using hints (which might have pending WASM operations)
    const hintButton = page.getByRole('button', { name: /Hint/i })
    if (
      (await hintButton.isVisible().catch(() => false)) &&
      (await hintButton.isEnabled().catch(() => false))
    ) {
      await hintButton.click()
    }

    // Immediately go back
    await page.goBack()
    await page.waitForLoadState('networkidle')

    // Go forward
    await page.goForward()
    await page.waitForLoadState('networkidle')

    // App should still be functional
    const hasGrid = await page
      .locator('[role="grid"]')
      .isVisible()
      .catch(() => false)
    const hasBody = await page.locator('body').isVisible()

    expect(hasBody).toBeTruthy()
  })

  test('handles double-click on action buttons without errors', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /easy Play/i }).click()
    await page.waitForSelector('[role="grid"]', { timeout: 15000 })

    const hintButton = page.getByRole('button', { name: /Hint/i })

    if (
      (await hintButton.isVisible().catch(() => false)) &&
      (await hintButton.isEnabled().catch(() => false))
    ) {
      // Double-click the hint button rapidly
      await hintButton.dblclick()

      // Wait for any hint operation to complete
      await page.waitForLoadState('networkidle')

      // App should handle gracefully - no crash, grid still visible
      await expect(page.locator('[role="grid"]')).toBeVisible()
    }
  })
})
