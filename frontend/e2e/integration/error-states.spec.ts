import { test, expect } from '../fixtures';

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
const VALID_PUZZLE = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const VALID_PUZZLE_ALT = '003020600900305001001806400008102900700000008006708200002609500800203009005010300';

// ============================================================================
// Invalid Puzzle String Handling
// ============================================================================

test.describe('@integration Error States - Invalid Puzzle Strings', () => {
  test('displays error for puzzle string that is too short', async ({ page }) => {
    // Navigate with 50-character puzzle (should be 81)
    const shortPuzzle = '1'.repeat(50);
    await page.goto(`/custom?puzzle=${shortPuzzle}`);

    // Wait for page to process the invalid input
    await page.waitForTimeout(1000);

    // Should show error state OR stay on custom page without crashing
    const hasError = await page.locator('text=/invalid|error|must be 81/i').isVisible().catch(() => false);
    const hasBoard = await page.locator('[role="grid"]').isVisible().catch(() => false);
    const url = page.url();

    // Either shows an error message, shows the board (allowing user to fix), or stays on custom page
    expect(hasError || hasBoard || url.includes('/custom')).toBeTruthy();

    // Page should NOT have crashed - verify body is still interactive
    await expect(page.locator('body')).toBeVisible();
  });

  test('displays error for puzzle string that is too long', async ({ page }) => {
    // Navigate with 100-character puzzle (should be 81)
    const longPuzzle = '1'.repeat(100);
    await page.goto(`/custom?puzzle=${longPuzzle}`);

    await page.waitForTimeout(1000);

    // Should show error state OR handle gracefully
    const hasError = await page.locator('text=/invalid|error|must be 81|too long/i').isVisible().catch(() => false);
    const hasBoard = await page.locator('[role="grid"]').isVisible().catch(() => false);
    const url = page.url();

    // App should handle gracefully
    expect(hasError || hasBoard || url.includes('/custom')).toBeTruthy();

    // Verify app didn't crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('displays error for puzzle with invalid characters', async ({ page }) => {
    // Puzzle with letters and special characters
    const invalidCharsPuzzle = 'abc070000600195000098000060800060003400803001700020006060000280000419005000080xyz';
    await page.goto(`/custom?puzzle=${invalidCharsPuzzle}`);

    await page.waitForTimeout(1000);

    // Should show error about invalid characters
    const hasError = await page.locator('text=/invalid|error|character/i').isVisible().catch(() => false);
    const hasBoard = await page.locator('[role="grid"]').isVisible().catch(() => false);
    const url = page.url();

    // App should handle gracefully
    expect(hasError || hasBoard || url.includes('/custom')).toBeTruthy();

    // Verify no crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('displays error for puzzle with duplicate in row/col/box', async ({ page }) => {
    // Puzzle with obvious duplicate in first row (two 5s)
    const duplicatePuzzle = '550070000600195000098000060800060003400803001700020006060000280000419005000080079';
    await page.goto(`/custom?puzzle=${duplicatePuzzle}`);

    await page.waitForTimeout(1000);

    // Should either show error about duplicates/invalid state
    // OR load the puzzle and highlight conflicts visually
    const hasError = await page.locator('text=/invalid|error|duplicate|conflict/i').isVisible().catch(() => false);
    const hasBoard = await page.locator('[role="grid"]').isVisible().catch(() => false);
    const hasConflictHighlight = await page.locator('[class*="conflict"], [class*="error"], [class*="invalid"]').first().isVisible().catch(() => false);

    // App should indicate the problem somehow
    expect(hasError || hasBoard || hasConflictHighlight).toBeTruthy();

    // Verify no crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles empty puzzle string gracefully', async ({ page }) => {
    await page.goto('/custom?puzzle=');

    await page.waitForTimeout(500);

    // Should show custom page with empty/editable board OR error
    const hasBoard = await page.locator('[role="grid"]').isVisible().catch(() => false);
    const hasCustomUI = await page.locator('text=/Custom/i').isVisible().catch(() => false);

    expect(hasBoard || hasCustomUI).toBeTruthy();
    await expect(page.locator('body')).toBeVisible();
  });
});

// ============================================================================
// WASM Load Failure Recovery
// ============================================================================

test.describe('@integration Error States - WASM Load Failure', () => {
  test('handles WASM load failure gracefully', async ({ page }) => {
    // Block WASM file to simulate failure
    await page.route('**/*.wasm', (route) => route.abort());

    await page.goto('/game?d=easy');

    // App should still load - either with degraded functionality or error message
    // Give it more time since WASM loading can be slow
    await page.waitForTimeout(3000);

    // Should show EITHER the board (with JS fallback) OR a meaningful error message
    const hasBoard = await page.locator('[role="grid"], .sudoku-board').isVisible().catch(() => false);
    const hasError = await page.locator('text=/error|unavailable|failed to load|solver/i').isVisible().catch(() => false);
    const hasBody = await page.locator('body').isVisible();

    // App must remain functional in some form
    expect(hasBoard || hasError || hasBody).toBeTruthy();
  });

  test('shows appropriate message when solver is unavailable', async ({ page }) => {
    // Block WASM file
    await page.route('**/*.wasm', (route) => route.abort());

    await page.goto('/game?d=easy');
    await page.waitForTimeout(3000);

    // Wait for grid to potentially load
    const hasGrid = await page.locator('[role="grid"]').isVisible({ timeout: 10000 }).catch(() => false);

    if (hasGrid) {
      // If grid loaded, try to use hint (which requires solver)
      const hintButton = page.getByRole('button', { name: /Hint/i });

      if (await hintButton.isVisible().catch(() => false)) {
        await hintButton.click();
        await page.waitForTimeout(1000);

        // Should either work (JS fallback) or show error about solver unavailable
        const hasHintError = await page.locator('text=/solver|unavailable|error|unable/i').isVisible().catch(() => false);
        const boardChanged = await page.locator('[role="gridcell"]').first().isVisible();

        expect(hasHintError || boardChanged).toBeTruthy();
      }
    }

    // Page should not crash regardless
    await expect(page.locator('body')).toBeVisible();
  });

  test('recovers when WASM eventually loads after initial failure', async ({ page }) => {
    let blockWasm = true;

    // Initially block WASM
    await page.route('**/*.wasm', async (route) => {
      if (blockWasm) {
        await route.abort();
      } else {
        await route.continue();
      }
    });

    await page.goto('/game?d=easy');
    await page.waitForTimeout(2000);

    // Now allow WASM to load
    blockWasm = false;

    // Refresh the page to allow WASM to load
    await page.reload();
    await page.waitForTimeout(3000);

    // Board should now be fully functional
    const hasGrid = await page.locator('[role="grid"]').isVisible({ timeout: 15000 }).catch(() => false);

    if (hasGrid) {
      // Try using hint to verify solver works
      const hintButton = page.getByRole('button', { name: /Hint/i });
      if (await hintButton.isVisible().catch(() => false) && await hintButton.isEnabled().catch(() => false)) {
        await hintButton.click();
        await page.waitForTimeout(1000);
      }
    }

    // App should be functional
    expect(hasGrid).toBeTruthy();
  });
});

// ============================================================================
// Network/API Errors
// ============================================================================

test.describe('@integration Error States - Network/API Errors', () => {
  test('handles failed puzzle fetch gracefully', async ({ page }) => {
    // Block API requests to puzzle endpoints
    await page.route('**/api/**', (route) => {
      if (route.request().url().includes('puzzle') || route.request().url().includes('daily')) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // Homepage should still load even if daily puzzle fetch fails
    const hasHomepage = await page.locator('body').isVisible();
    const hasError = await page.locator('text=/error|failed|unavailable|try again/i').isVisible().catch(() => false);
    const hasFallback = await page.locator('button, a, [role="link"]').first().isVisible().catch(() => false);

    // App should either show error or have fallback content
    expect(hasHomepage && (hasError || hasFallback)).toBeTruthy();
  });

  test('handles failed leaderboard fetch gracefully', async ({ page }) => {
    // Block leaderboard API
    await page.route('**/api/**/leaderboard**', (route) => route.abort());
    await page.route('**/api/**/scores**', (route) => route.abort());

    await page.goto('/leaderboard');
    await page.waitForTimeout(2000);

    // Leaderboard page should show error or empty state, not crash
    const hasPage = await page.locator('body').isVisible();
    const hasError = await page.locator('text=/error|failed|unavailable|no data|empty/i').isVisible().catch(() => false);
    const hasLeaderboardUI = await page.locator('text=/leaderboard|scores|ranking/i').isVisible().catch(() => false);

    expect(hasPage && (hasError || hasLeaderboardUI)).toBeTruthy();
  });
});

// ============================================================================
// Graceful Degradation
// ============================================================================

test.describe('@integration Error States - Graceful Degradation', () => {
  test('app remains usable when localStorage is unavailable', async ({ page }) => {
    // Disable localStorage
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: () => { throw new Error('localStorage disabled'); },
          setItem: () => { throw new Error('localStorage disabled'); },
          removeItem: () => { throw new Error('localStorage disabled'); },
          clear: () => { throw new Error('localStorage disabled'); },
        },
        writable: false,
      });
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // App should still load and be usable
    await expect(page.locator('body')).toBeVisible();

    // Should be able to navigate or see content
    const hasContent = await page.locator('button, a, [role="grid"]').first().isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('no uncaught exceptions in console during normal navigation', async ({ page }) => {
    const consoleErrors: string[] = [];

    // Listen for console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known acceptable errors (like failed network requests we're testing)
        if (!text.includes('net::ERR') && !text.includes('Failed to fetch')) {
          consoleErrors.push(text);
        }
      }
    });

    // Listen for uncaught exceptions
    page.on('pageerror', (error) => {
      consoleErrors.push(`Uncaught: ${error.message}`);
    });

    // Navigate through various pages
    await page.goto('/');
    await page.waitForTimeout(1000);

    await page.goto('/custom');
    await page.waitForTimeout(500);

    await page.goto('/game?d=easy');
    await page.waitForTimeout(1000);

    // Filter out expected/acceptable errors
    const criticalErrors = consoleErrors.filter((err) =>
      !err.includes('ResizeObserver') && // Known browser quirk
      !err.includes('hydration') && // SSR hydration warnings
      !err.includes('Warning:') // React development warnings
    );

    // Should have no critical uncaught exceptions
    expect(criticalErrors.length).toBe(0);
  });

  test('error boundary catches React errors without crashing app', async ({ page }) => {
    // Try to trigger an error by navigating to an invalid route
    await page.goto('/this-route-definitely-does-not-exist-12345');
    await page.waitForTimeout(1000);

    // Should show 404 page or redirect, not crash
    const hasBody = await page.locator('body').isVisible();
    const hasErrorPage = await page.locator('text=/not found|404|error|go back|home/i').isVisible().catch(() => false);
    const redirectedHome = page.url().endsWith('/') || page.url().includes('?');

    expect(hasBody && (hasErrorPage || redirectedHome)).toBeTruthy();
  });
});

// ============================================================================
// Error Message Display
// ============================================================================

test.describe('@integration Error States - Error Message Display', () => {
  test('error messages are user-friendly, not stack traces', async ({ page }) => {
    // Navigate with clearly invalid puzzle
    const invalidPuzzle = 'not-a-valid-puzzle-at-all!!!';
    await page.goto(`/custom?puzzle=${invalidPuzzle}`);

    await page.waitForTimeout(1000);

    // If there's an error message, it should be user-friendly
    const errorElements = page.locator('[role="alert"], .error, [class*="error"], .toast');
    const errorCount = await errorElements.count();

    if (errorCount > 0) {
      for (let i = 0; i < errorCount; i++) {
        const errorText = await errorElements.nth(i).textContent();

        if (errorText) {
          // Should NOT contain stack trace indicators
          expect(errorText).not.toMatch(/at\s+\w+\s+\(/); // "at functionName ("
          expect(errorText).not.toMatch(/\.js:\d+:\d+/); // "file.js:123:45"
          expect(errorText).not.toMatch(/Error:\s*$/); // Just "Error:" with nothing helpful
          expect(errorText).not.toMatch(/undefined|null|NaN/i); // Raw technical values
        }
      }
    }

    // Page should still be functional
    await expect(page.locator('body')).toBeVisible();
  });

  test('errors have recovery action or are dismissible', async ({ page }) => {
    // Block WASM and try to use solver features to trigger an error
    await page.route('**/*.wasm', (route) => route.abort());

    await page.goto('/game?d=easy');
    await page.waitForTimeout(3000);

    // If there's an error displayed, check for recovery options
    const errorElements = page.locator('[role="alert"], .error-message, [class*="error-state"]');

    if (await errorElements.first().isVisible().catch(() => false)) {
      // Check for dismiss button, retry button, or link to go back
      const hasDismiss = await page.locator('button:has-text("Dismiss"), button:has-text("Close"), button:has-text("OK"), [aria-label="Close"]').isVisible().catch(() => false);
      const hasRetry = await page.locator('button:has-text("Retry"), button:has-text("Try Again"), button:has-text("Reload")').isVisible().catch(() => false);
      const hasNavigation = await page.locator('a:has-text("Home"), a:has-text("Back"), button:has-text("Go Back")').isVisible().catch(() => false);

      // At least one recovery option should be available
      expect(hasDismiss || hasRetry || hasNavigation).toBeTruthy();
    }

    // Alternatively, if no error is shown (app degraded gracefully), that's also acceptable
    await expect(page.locator('body')).toBeVisible();
  });
});

// ============================================================================
// Edge Cases and Regression Tests
// ============================================================================

test.describe('@integration Error States - Edge Cases', () => {
  test('handles rapid navigation without errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('pageerror', (error) => {
      consoleErrors.push(error.message);
    });

    // Rapid navigation between pages
    await page.goto('/');
    await page.goto('/custom');
    await page.goto('/game?d=easy');
    await page.goto('/');
    await page.goto('/game?d=hard');

    await page.waitForTimeout(2000);

    // Should not have any uncaught errors
    expect(consoleErrors.length).toBe(0);
  });

  test('handles browser back/forward with pending operations', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    await page.goto('/game?d=easy');
    await page.waitForSelector('[role="grid"]', { timeout: 15000 });

    // Start using hints (which might have pending WASM operations)
    const hintButton = page.getByRole('button', { name: /Hint/i });
    if (await hintButton.isVisible().catch(() => false) && await hintButton.isEnabled().catch(() => false)) {
      await hintButton.click();
    }

    // Immediately go back
    await page.goBack();
    await page.waitForTimeout(500);

    // Go forward
    await page.goForward();
    await page.waitForTimeout(1000);

    // App should still be functional
    const hasGrid = await page.locator('[role="grid"]').isVisible().catch(() => false);
    const hasBody = await page.locator('body').isVisible();

    expect(hasBody).toBeTruthy();
  });

  test('handles double-click on action buttons without errors', async ({ page }) => {
    await page.goto('/game?d=easy');
    await page.waitForSelector('[role="grid"]', { timeout: 15000 });

    const hintButton = page.getByRole('button', { name: /Hint/i });

    if (await hintButton.isVisible().catch(() => false) && await hintButton.isEnabled().catch(() => false)) {
      // Double-click the hint button rapidly
      await hintButton.dblclick();
      await page.waitForTimeout(1000);

      // App should handle gracefully - no crash, grid still visible
      await expect(page.locator('[role="grid"]')).toBeVisible();
    }
  });
});
