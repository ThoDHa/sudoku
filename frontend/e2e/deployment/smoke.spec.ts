import { test, expect } from '@playwright/test'
import { waitForHintProcessing } from '../utils/hint-wait'

/**
 * Post-Deploy Smoke Test
 *
 * Exercises the critical user path against a production build of the app
 * (the same bundle that ships), not the dev server. Designed to run as a
 * deploy gate: a broken artifact that builds clean but fails to load, run
 * the WASM solver, or accept input is caught here before publish.
 *
 * Point it at any deployed URL via PLAYWRIGHT_BASE_URL. The URL must include
 * the full base path the app was built with:
 *   - GitHub Pages deploy:   PLAYWRIGHT_BASE_URL=https://user.github.io/sudoku/
 *   - Local prod-build CI:   PLAYWRIGHT_BASE_URL=http://localhost:4174/sudoku/
 *   - Self-hosted nginx:     PLAYWRIGHT_BASE_URL=http://localhost/
 *
 * Tag: @deployment
 *
 * Intentionally narrow: one test, the critical path, deterministic waits on
 * rendered state rather than fixed sleeps, and positive assertions only (no
 * visibility guards, no weak disjunctions). Broader coverage lives in the
 * integration suite; this is the "does the deployed artifact work at all"
 * tripwire.
 *
 * Blind spots (covered elsewhere, not by this smoke):
 * - Stale service worker serving broken WASM from a prior deploy
 *   (PWA-1 owns the SW / offline regression suite; globalSetup unregisters
 *   SWs before the smoke runs, so this gate exercises a SW-free cold load).
 * - First-visit onboarding flow (globalSetup seeds onboarding-complete via
 *   storageState; a broken onboarding modal that blocks first-visit users
 *   is not caught here).
 */

test.describe('@deployment Post-Deploy Smoke', () => {
  test('critical path: load, start game, place digit, receive hint', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'PLAYWRIGHT_BASE_URL must be set so the smoke targets a deployed artifact')

    await test.step('LOAD: homepage shell renders', async () => {
      // Navigate to baseURL itself (not '/') so the smoke works regardless of
      // the deployed base path (root for self-hosted, /sudoku/ for Pages).
      await page.goto(baseURL)
      await expect(page).toHaveTitle(/Sudoku/)
      await expect(page.locator('header')).toBeVisible()
    })

    await test.step('START GAME: easy board mounts with puzzle cells', async () => {
      // Waiting on cells with values proves the puzzle-data pipeline (which
      // runs through the bundled puzzle bank, not the WASM solver) delivered
      // a real, playable puzzle.
      const playButton = page.getByRole('button', { name: /easy Play/i })
      await playButton.click()
      await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 })
      await expect(page.locator('.sudoku-board')).toBeVisible({ timeout: 15000 })
      // waitForSelector (not toBeVisible) because the board renders many
      // value-cells; strict mode rejects a visibility assertion on a
      // multi-element locator. Matches the setupGameAndWaitForBoard helper.
      await page.waitForSelector('[role="gridcell"][aria-label*="value"]', {
        timeout: 15000,
        state: 'visible',
      })
    })

    await test.step('PLACE DIGIT: keyboard entry updates the cell', async () => {
      // Selecting an empty cell and entering a digit exercises the input
      // pipeline and React state.
      const emptyCell = page
        .locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]')
        .first()
      await emptyCell.scrollIntoViewIfNeeded()
      await emptyCell.click()
      await expect(emptyCell).toHaveClass(/ring/)

      const ariaLabel = await emptyCell.getAttribute('aria-label')
      const match = ariaLabel?.match(/Row (\d+), Column (\d+)/)
      const row = match ? parseInt(match[1], 10) : 5
      const col = match ? parseInt(match[2], 10) : 1

      await page.keyboard.press('4')
      await expect(async () => {
        await expect(
          page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}, value 4"]`),
        ).toBeVisible()
      }).toPass({ timeout: 5000 })
    })

    await test.step('RECEIVE HINT: WASM solver loaded and UI reacted', async () => {
      // Clicking Hint triggers findNextMove, the WASM solver entry point.
      //
      // The deploy-correctness signal we actually need is that the SHIPPED
      // WASM artifact loaded and the Go runtime published its API. The app's
      // `withWasm` wrapper (src/lib/wasm.ts) intentionally degrades to a
      // null fallback when WASM fails, so a "no hint found" toast renders
      // identically whether WASM ran and found nothing OR WASM never loaded.
      // Asserting `window.SudokuWasm` is defined after the click is the only
      // way to tell a working artifact from a broken one. This is the single
      // step that proves the shipped WASM bundle is functional end-to-end.
      const hintButton = page.locator('button:has-text("Hint")')
      await hintButton.first().click()
      await waitForHintProcessing(page)

      await expect
        .poll(
          async () => await page.evaluate(() => typeof (window as any).SudokuWasm !== 'undefined'),
          { timeout: 10000 },
        )
        .toBe(true)

      // WASM is proven live above; confirm the hint flow surfaced feedback.
      // Pin to the first message container and require non-whitespace
      // content (the hint toast, not some unrelated stale banner).
      await expect(page.locator('.validation-message').first()).toContainText(/\S/, {
        timeout: 10000,
      })
    })
  })
})
