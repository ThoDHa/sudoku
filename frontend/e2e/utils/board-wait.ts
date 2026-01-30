/**
 * Playwright Test Helper for Board Selection
 *
 * This module provides a reusable helper to wait for the sudoku board
 * to appear in E2E tests, with proper WASM initialization handling.
 */

/**
 * Wait for the sudoku board to be visible, with WASM loading consideration
 *
 * This helper:
 * 1. Checks if WASM is already ready (window.SudokuWasm exists)
 * 2. Waits for WASM initialization if not ready
 * 3. Waits for .sudoku-board selector to appear
 *
 * @param page - Playwright Page instance
 * @param options - Optional configuration
 * @returns Promise that resolves when board is visible
 */
export async function waitForBoard(page: any, options: {
  /** Timeout in milliseconds (default: 45000) */
  timeout?: number
  /** Whether to check WASM readiness (default: true) */
  checkWasm?: boolean
} = {}): Promise<void> {
  const {
    timeout = 45000,
    checkWasm = true
  } = options

  // Phase 1: Wait for WASM to be ready (if enabled)
  if (checkWasm) {
    try {
      await page.waitForFunction(
        () => {
          // Check if WASM API is available
          return typeof (window as any).SudokuWasm !== 'undefined'
        },
        { timeout: Math.min(timeout, 10000) }
      )
    } catch (error) {
      // Log but continue - some tests might not need WASM
      console.log('[waitForBoard] WASM readiness check timed out, continuing...')
    }
  }

  // Phase 2: Wait for board selector to be visible
  await page.waitForSelector('.sudoku-board', {
    timeout: timeout,
    state: 'visible'
  })
}

/**
 * Create a beforeEach hook that navigates to a game page and waits for board
 *
 * This is the recommended pattern for E2E tests:
 * test.beforeEach(async ({ page }) => {
 *   await setupGameAndWaitForBoard(page, { difficulty: 'easy' })
 * })
 *
 * @param page - Playwright Page instance
 * @param options - Configuration for game setup
 * @returns Promise that resolves when game is ready
 */
export async function setupGameAndWaitForBoard(page: any, options: {
  /** Difficulty level for Play button (default: 'easy') */
  difficulty?: string
  /** Seed to use instead of clicking Play button */
  seed?: string
  /** Custom puzzle to navigate to */
  custom?: string
  /** Board wait timeout (default: 45000) */
  boardTimeout?: number
} = {}): Promise<void> {
  const {
    difficulty = 'easy',
    seed,
    custom,
    boardTimeout = 45000
  } = options

  // Navigate based on options provided
  if (seed) {
    // Navigate directly to seed route
    await page.goto(`/${seed}?d=${difficulty}`)
  } else if (custom) {
    // Navigate to custom puzzle route
    await page.goto(`/c/${custom}`)
  } else {
    // Navigate to homepage and click Play button
    await page.goto('/')
    const playButton = page.getByRole('button', { name: new RegExp(`${difficulty} Play`, 'i') })
    await playButton.click()
  }

  // Wait for board to appear with WASM consideration
  await waitForBoard(page, { timeout: boardTimeout })
}
