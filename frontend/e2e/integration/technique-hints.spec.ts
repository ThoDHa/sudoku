import { test, expect, Page, Locator } from '@playwright/test'
import { setupGameAndWaitForBoard, waitForWasmReady } from '../utils/board-wait'
import { dismissModals, waitForHintProcessing, waitForHintToastCleared } from '../utils/hint-wait'

/**
 * Technique Hints Integration Tests
 *
 * Tests for "Give Technique" feature - shows technique name and explanation
 * without applying the move to the board. This helps players learn which
 * technique to use without giving away the specific move.
 *
 * Tag: @integration @technique-hints
 */

/**
 * Get the hint button that works on both mobile (emoji 💡) and desktop (text "Hint").
 */
function getHintButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Get a hint' })
}

/**
 * Get the technique hint button that works on both mobile (emoji ?) and desktop (text "Technique").
 */
function getTechniqueButton(page: Page): Locator {
  return page.locator('button:has-text("Technique"), button:has-text("?")').first()
}

/**
 * Helper to prepare board for technique hints.
 * Clicks the regular Hint button multiple times to ensure candidates are filled.
 * The first few hints often fill cells with values; we need enough hints
 * to get past the initial value placements and have candidates on the board.
 */
async function prepBoardForTechniqueHint(page: Page) {
  // Wait for WASM to be ready before clicking hint buttons
  await waitForWasmReady(page)

  const hintButton = getHintButton(page)
  // Use 6 hints to ensure we get past initial value placements and have candidates
  for (let i = 0; i < 6; i++) {
    // Make sure no modal is blocking
    await dismissModals(page)

    if (await hintButton.isEnabled().catch(() => false)) {
      await hintButton.click()
      // Wait for hint processing to complete before next hint
      await waitForHintProcessing(page)
    }
  }

  // Let the last hint's toast clear before handing control back.
  await waitForHintToastCleared(page)
}

test.describe('@integration Technique Hints - Basic Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Set localStorage before navigation to skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true')
    })
    await setupGameAndWaitForBoard(page)

    // Wait for WASM to be ready - critical for hint functionality
    // Production builds may take longer to initialize WASM than to render the board
    await waitForWasmReady(page)
  })

  test('technique hint button is visible and clickable', async ({ page }) => {
    // Look for the button with "Technique" text (or emoji on mobile)
    const techniqueButton = getTechniqueButton(page)
    await expect(techniqueButton).toBeVisible()
    await expect(techniqueButton).toBeEnabled()
  })

  test('clicking technique hint shows technique modal', async ({ page }) => {
    // Prep board with candidates first
    await prepBoardForTechniqueHint(page)

    const techniqueButton = getTechniqueButton(page)
    await techniqueButton.click()

    // Wait for processing
    await waitForHintProcessing(page)

    // The technique hint can show different outcomes:
    // 1. "Got it" button in a modal (deprecated behavior)
    // 2. Toast with "Fill in some candidates first" message
    // 3. Toast with "Try: {TechniqueName}" and "Learn more" link
    // 4. An error message if puzzle has issues

    // Check if any UI indication appeared
    const gotItButton = page.getByRole('button', { name: /Got it/i })
    const toastVisible = await page
      .locator('.fixed.z-50')
      .isVisible()
      .catch(() => false)
    const gotItVisible = await gotItButton.isVisible().catch(() => false)

    // The hint must surface some UI feedback (a toast or the Got-it modal).
    // The former `|| true` made this assertion always pass, letting a
    // no-feedback regression slip through silently; it is dropped so a missing
    // toast/modal now fails here.
    expect(toastVisible || gotItVisible).toBeTruthy()

    // Close modal if visible
    if (gotItVisible) {
      await gotItButton.click()
      await expect(gotItButton).not.toBeVisible({ timeout: 3000 })
    }
  })
})

test.describe('@integration Technique Hints - Counter', () => {
  test.beforeEach(async ({ page }) => {
    // Set localStorage before navigation to skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true')
    })
    await setupGameAndWaitForBoard(page)
    // Wait for WASM to be ready
    await waitForWasmReady(page)
  })

  test('can use technique hint multiple times with moves in between', async ({ page }) => {
    // Prep board with candidates first
    await prepBoardForTechniqueHint(page)

    const techniqueButton = getTechniqueButton(page)

    // Use 1 technique hint
    await techniqueButton.click()

    // Wait for processing
    await waitForHintProcessing(page)

    // Close modal if visible
    const gotItButton = page.getByRole('button', { name: /Got it/i })
    if (await gotItButton.isVisible().catch(() => false)) {
      await gotItButton.click()
      await expect(gotItButton).not.toBeVisible({ timeout: 3000 })
    }

    // Make a move to re-enable technique button
    // Click digit button first to enter multi-fill mode
    const digitButton = page.locator('button[aria-label^="Enter 4,"]')
    if (await digitButton.isVisible().catch(() => false)) {
      await digitButton.click()

      // Find an empty cell in a lower row (row 5+) that won't be obscured by sticky header
      const emptyCell = page
        .locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]')
        .first()
      if ((await emptyCell.count()) > 0) {
        await emptyCell.scrollIntoViewIfNeeded()
        await emptyCell.click()
      }
    }

    // Wait for button to potentially re-enable
    await page.waitForTimeout(500)

    // Use another technique hint if button is enabled
    if (await techniqueButton.isEnabled().catch(() => false)) {
      await techniqueButton.click()
      await waitForHintProcessing(page)

      if (await gotItButton.isVisible().catch(() => false)) {
        await gotItButton.click()
      }
    }

    // The flow above is tolerance-guarded (button may be disabled on some
    // boards), but success must still mean the app is left in a valid state:
    // the board is still rendered. A crash or unhandled error leaves the grid
    // detached, failing this guard. (Replaces a tautological expect(true).)
    await expect(page.locator('[role="grid"]')).toBeVisible()
  })
})

test.describe('@integration Technique Hints - Mobile', () => {
  test.use({ hasTouch: true })

  test.beforeEach(async ({ page }) => {
    // Set localStorage before navigation to skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true')
    })
    await page.setViewportSize({ width: 375, height: 667 })
    await setupGameAndWaitForBoard(page)
    // Wait for WASM to be ready
    await waitForWasmReady(page)
  })

  test('technique hint button accessible on mobile', async ({ page }) => {
    // On mobile, find the technique button (may show just emoji)
    const techniqueButton = getTechniqueButton(page)
    await expect(techniqueButton).toBeVisible()

    const box = await techniqueButton.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      // Button should be reasonably sized for touch
      expect(box.width).toBeGreaterThanOrEqual(24)
      expect(box.height).toBeGreaterThanOrEqual(24)
    }
  })

  test('technique hint tap works on mobile viewport', async ({ page }) => {
    // Use hint once to prep board (hint button disables until user makes a move)
    const hintBtn = getHintButton(page)
    await hintBtn.tap()
    await waitForHintProcessing(page)

    // Count empty cells before
    const emptyCellsBefore = await page.locator('[role="gridcell"][aria-label*="empty"]').count()

    // Find technique button
    const techniqueButton = getTechniqueButton(page)
    await techniqueButton.tap()

    // Wait for technique hint processing
    await waitForHintProcessing(page)

    // Count empty cells after - technique hint shouldn't change board state
    const emptyCellsAfter = await page.locator('[role="gridcell"][aria-label*="empty"]').count()
    expect(emptyCellsAfter).toBeLessThanOrEqual(emptyCellsBefore)

    // Close modal if visible
    const gotItButton = page.getByRole('button', { name: /Got it/i })
    if (await gotItButton.isVisible().catch(() => false)) {
      await gotItButton.tap()
    }
  })

  test('technique modal fits within mobile viewport', async ({ page }) => {
    // Use hint once to prep board (hint button disables until user makes a move)
    const hintBtn = getHintButton(page)
    await hintBtn.tap()
    await waitForHintProcessing(page)

    const techniqueButton = getTechniqueButton(page)
    await techniqueButton.tap()

    // Wait for processing
    await waitForHintProcessing(page)

    // Check for toast with fixed z-50 class
    const toastVisible = await page
      .locator('.fixed.z-50')
      .isVisible()
      .catch(() => false)

    // If "Learn more" is visible, click it to open the modal
    const learnMoreButton = page.locator('text=Learn more')
    const gotItButton = page.getByRole('button', { name: /Got it/i })

    if (await learnMoreButton.isVisible().catch(() => false)) {
      await learnMoreButton.tap()
      await expect(gotItButton).toBeVisible({ timeout: 3000 })
    }

    // If modal is visible, verify the button is accessible (within reasonable bounds)
    if (await gotItButton.isVisible().catch(() => false)) {
      const box = await gotItButton.boundingBox()
      expect(box).not.toBeNull()
      if (box) {
        // Button should be horizontally within viewport
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(375)
        // Button should be accessible (even if scrolled, y should be reasonable)
        expect(box.y).toBeGreaterThanOrEqual(0)
      }

      // Close modal
      await gotItButton.tap()
      await expect(gotItButton).not.toBeVisible({ timeout: 3000 })
    }

    // Tolerance-guarded flow (modal may not appear on every board), but the app
    // must end in a valid state: board still rendered. (Replaces expect(true).)
    await expect(page.locator('[role="grid"]')).toBeVisible()
  })
})

test.describe('@integration Technique Hints - Edge Cases', () => {
  test('technique hint on nearly solved puzzle still works', async ({ page }) => {
    // Set localStorage before navigation to skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true')
    })
    await setupGameAndWaitForBoard(page)
    // Wait for WASM to be ready
    await waitForWasmReady(page)

    // Use a few regular hints to get closer to solution
    const hintButton = getHintButton(page)

    for (let i = 0; i < 3; i++) {
      if (await hintButton.isEnabled().catch(() => false)) {
        await hintButton.click()
        await waitForHintProcessing(page)
      }
    }

    // Now try technique hint
    const techniqueButton = getTechniqueButton(page)
    if (
      (await techniqueButton.isVisible()) &&
      (await techniqueButton.isEnabled().catch(() => false))
    ) {
      await techniqueButton.click()
      await waitForHintProcessing(page)

      // Should either show modal or toast
      const gotItButton = page.getByRole('button', { name: /Got it/i })
      const isModalVisible = await gotItButton.isVisible().catch(() => false)

      if (isModalVisible) {
        await gotItButton.click()
      }
      // Test passes if no errors occurred
    }
  })

  test('technique hint works with no cell selected', async ({ page }) => {
    // Set localStorage before navigation to skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true')
    })
    await setupGameAndWaitForBoard(page)
    // Wait for WASM to be ready
    await waitForWasmReady(page)

    // Prep board with hints first
    await prepBoardForTechniqueHint(page)

    // Click technique hint without selecting a cell first
    const techniqueButton = getTechniqueButton(page)
    await techniqueButton.click()

    // Wait for processing
    await waitForHintProcessing(page)

    // Close modal if visible
    const gotItButton = page.getByRole('button', { name: /Got it/i })
    if (await gotItButton.isVisible().catch(() => false)) {
      await gotItButton.click()
    }

    // Clicking a technique hint with no cell selected must not crash the app:
    // the board stays rendered in a stable state. (Replaces expect(true).)
    await expect(page.locator('[role="grid"]')).toBeVisible()
  })
})
