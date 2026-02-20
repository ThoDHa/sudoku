/**
 * Playwright Test Helper for Board Selection
 *
 * This module provides a reusable helper to wait for the sudoku board
 * to appear in E2E tests.
 *
 * Note: WASM is now loaded lazily on-demand (when hints/solve are requested).
 * Tests that need WASM functionality should call waitForWasmReady explicitly.
 */

/**
 * Wait for WASM to be ready.
 * Only needed for tests that require hint/solve functionality.
 * Most tests don't need this since WASM loads on-demand.
 */
export async function waitForWasmReady(page: any, timeout = 30000) {
  await page.waitForFunction(
    () => {
      // Check if SudokuWasm API is available on window
      return typeof (window as any).SudokuWasm !== 'undefined';
    },
    { timeout }
  );
}

/**
 * Wait for the sudoku board to be visible
 *
 * This helper waits for .sudoku-board selector to appear.
 * WASM is no longer awaited by default since it loads on-demand.
 *
 * @param page - Playwright Page instance
 * @param options - Optional configuration
 * @returns Promise that resolves when board is visible
 */
export async function waitForBoard(page: any, options: {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Whether to check WASM readiness (default: false - WASM loads on-demand) */
  checkWasm?: boolean
} = {}): Promise<void> {
  const {
    timeout = 30000,
    checkWasm = false
  } = options

  // Phase 1: Wait for WASM to be ready (if explicitly requested)
  // Note: WASM is now lazy-loaded, so most tests don't need this
  if (checkWasm) {
    try {
      await page.waitForFunction(
        () => {
          return typeof (window as any).SudokuWasm !== 'undefined'
        },
        { timeout: Math.min(timeout, 10000) }
      )
    } catch {
      // Continue - WASM will load on-demand when needed
      console.log('[waitForBoard] WASM not yet loaded - will load on-demand')
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
  /** Board wait timeout (default: 30000) */
  boardTimeout?: number
  /** Skip waiting for cells with values (for saved state tests with empty boards) */
  skipCellValueCheck?: boolean
  /** Skip navigation - just wait for the board (use after page.goto or page.reload) */
  skipNavigation?: boolean
  /** Wait for WASM to be ready (default: false - WASM loads on-demand) */
  checkWasm?: boolean
} = {}): Promise<void> {
  const {
    difficulty = 'easy',
    seed,
    custom,
    boardTimeout = 30000,
    skipCellValueCheck = false,
    skipNavigation = false,
    checkWasm = false
  } = options

  // Navigate based on options provided (unless skipped)
  if (!skipNavigation) {
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
  }

  // Wait for board to appear
  await waitForBoard(page, { timeout: boardTimeout, checkWasm })
  
  // Phase 3: Wait for puzzle data to actually load (unless skipped)
  // The board div appears before the puzzle data is rendered - we need to wait for actual cells
  // Look for cells with values (either "given" or filled cells)
  // Note: skipCellValueCheck is useful for saved state tests where the board may appear empty
  if (!skipCellValueCheck) {
    await page.waitForSelector('[role="gridcell"][aria-label*="value"]', {
      timeout: boardTimeout,
      state: 'visible'
    })
  }
}
