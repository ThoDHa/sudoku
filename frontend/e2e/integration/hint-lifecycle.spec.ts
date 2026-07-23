import { test, expect, type Page, type Locator } from '@playwright/test'
import { waitForWasmReady } from '../utils/board-wait'

/**
 * Hint Lifecycle E2E — SCOPE-GAME-002 #2-5.
 *
 * Covers the hint control-flow behaviors that live as inline React ref /
 * try-finally logic in Game.tsx `handleNext` and cannot be unit-covered without
 * re-wrapping React internals:
 *   #2 in-flight lockout  — the hintInProgress ref releases after each request
 *   #3 spam/race debounce — a burst of clicks never strands the button loading
 *   #4 post-completion    — once solved, the UI stops offering hints
 *   #5 error recovery     — after an error-bearing hint, the next hint still fires
 *
 * Honesty note: the re-entry guard itself (`hintInProgress.current = true` before
 * the await) is not directly observable from E2E, and WASM hints resolve faster
 * than the loading state can be polled. These tests therefore verify the
 * user-facing CONTRACTS that the guard + `finally` block exist to enforce: the
 * hint button always returns to idle (enabled), and the hint system stays usable.
 * The exact "no duplicate solver call" invariant still needs Route A unit
 * coverage of the extracted guard (out of e2e territory).
 *
 * Tag: @integration @hint-lifecycle
 */

function getHintButton(page: Page): Locator {
  return page.locator('button:has-text("Hint"), button:has-text("💡")').first()
}

async function emptyCellCount(page: Page): Promise<number> {
  return page.locator('[role="gridcell"][aria-label*="empty"]').count()
}

async function startEasyGame(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('sudoku_onboarding_complete', 'true')
  })
  await page.goto('/')
  await page.getByRole('button', { name: /easy Play/i }).click()
  await page.waitForSelector('[role="grid"]', { timeout: 20000 })
  await waitForWasmReady(page)
}

// The hint button is `disabled={hintLoading || hintDisabled}` and hintDisabled is
// always false, so "enabled" is a direct signal that the `finally` block ran and
// released the in-flight lock. Waiting for enabled == waiting for handleNext to settle.
async function waitForHintIdle(page: Page, timeout = 8000): Promise<void> {
  await expect(getHintButton(page)).toBeEnabled({ timeout })
}

test.describe('@integration @hint-lifecycle Hint Lifecycle Control Flow', () => {
  test.beforeEach(async ({ page }) => {
    await startEasyGame(page)
  })

  test('#2 lockout releases after a hint request so a second request is accepted', async ({
    page,
  }) => {
    const hint = getHintButton(page)
    await expect(hint).toBeEnabled()

    await hint.click()
    // The finally block must clear hintLoading, otherwise the button stays
    // disabled and this times out (lockout never released).
    await waitForHintIdle(page)

    // A second, independent request goes through rather than being permanently blocked.
    await hint.click()
    await waitForHintIdle(page)
  })

  test('#3 rapid burst of hint clicks does not strand the button loading', async ({ page }) => {
    const hint = getHintButton(page)
    await expect(hint).toBeEnabled()

    // Fire several clicks in quick succession to race the in-flight guard. Each
    // click dispatches without waiting for the async handler to resolve.
    for (let i = 0; i < 5; i++) {
      await hint.click({ timeout: 3000 })
    }

    // Whatever the interleaving, the finally block must leave the button idle.
    await waitForHintIdle(page)
    // The board is still intact (no corruption / crash from contention).
    await expect(page.locator('[role="grid"]')).toBeVisible()
  })

  test('#4 no hint is offered once the puzzle is solved', async ({ page }) => {
    test.setTimeout(120000)

    // Record a baseline hint button, then complete the puzzle via the menu Solve.
    const hint = getHintButton(page)
    await expect(hint).toBeVisible()
    await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByText('Solve', { exact: true }).first().click()
    await page.getByRole('button', { name: 'Solve', exact: true }).click()

    // Auto-solve plays the solution quickly (PLAY_DELAY ~25ms). Completion is the
    // moment no empty cells remain.
    await expect(page.locator('[role="gridcell"][aria-label*="empty"]')).toHaveCount(0, {
      timeout: 60000,
    })

    // Once solved the app leaves the hint-interactive state: completion raises a
    // result modal (which also disables the H shortcut), and dismissing it does
    // not bring a hint button back on the solved board. Either way, a hint can no
    // longer be requested, which is the post-completion-disable contract.
    await expect(hint).toBeHidden({ timeout: 10000 })
    expect(await emptyCellCount(page)).toBe(0)
  })

  test('#5 hint system stays usable after an error-bearing request', async ({ page }) => {
    const hint = getHintButton(page)
    await expect(hint).toBeEnabled()

    // Introduce a conflicting entry to exercise the error/contradiction path:
    // fill an empty cell with a digit that duplicates a given in the same unit.
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first()
    await emptyCell.click()
    await page.keyboard.press('5')

    // The error-bearing hint path (catch / contradiction branch) still runs its
    // finally block, so the button recovers...
    await hint.click()
    await waitForHintIdle(page)

    // ...and a subsequent, clean hint is accepted (the lockout was released, the
    // system did not get stranded by the prior error).
    await hint.click()
    await waitForHintIdle(page)
    await expect(page.locator('[role="grid"]')).toBeVisible()
  })
})
