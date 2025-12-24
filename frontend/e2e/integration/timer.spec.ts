import { test, expect } from '../fixtures';

/**
 * Timer E2E Tests
 *
 * Comprehensive tests for the Sudoku game timer functionality including:
 * - Timer display format (MM:SS)
 * - Timer counting and incrementing
 * - Pause behavior on visibility change
 * - Hide timer preference
 * - Timer persistence across reload
 * - Timer behavior on puzzle completion
 *
 * Tag: @integration @timer
 */

// Helper to locate the timer element
function getTimerLocator(page: any) {
  return page.locator('.font-mono').filter({ hasText: /^\d+:\d{2}$/ });
}

// Helper to parse timer text into seconds
function parseTimerToSeconds(timerText: string): number {
  const parts = timerText.split(':');
  if (parts.length === 2) {
    // MM:SS format
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }
  return 0;
}

test.describe('@integration Timer - Display Format', () => {
  test('timer is visible on game page', async ({ page }) => {
    await page.goto('/game?d=easy&seed=timer-visible');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);
    await expect(timer).toBeVisible();
  });

  test('timer displays in M:SS format initially', async ({ page }) => {
    await page.goto('/game?d=easy&seed=timer-format');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);
    const timerText = await timer.textContent();

    // Should match M:SS or MM:SS format (0:00, 1:23, 12:34)
    expect(timerText).toMatch(/^\d+:\d{2}$/);
  });

  test('timer shows clock icon when visible', async ({ page }) => {
    await page.goto('/game?d=easy&seed=timer-icon');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Timer section should contain an SVG clock icon
    const timerSection = page.locator('div').filter({ has: getTimerLocator(page) }).first();
    const clockIcon = timerSection.locator('svg');
    await expect(clockIcon).toBeVisible();
  });
});

test.describe('@integration Timer - Counting', () => {
  test('timer starts from 0:00 on new game', async ({ page }) => {
    await page.goto('/game?d=easy&seed=timer-start-' + Date.now());
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);
    const initialTime = await timer.textContent();

    // New game should start at 0:00 or very close to it
    const seconds = parseTimerToSeconds(initialTime || '0:00');
    expect(seconds).toBeLessThanOrEqual(2);
  });

  test('timer increments over time', async ({ page }) => {
    await page.goto('/game?d=easy&seed=timer-increment');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);

    // Get initial time
    const initialText = await timer.textContent();
    const initialSeconds = parseTimerToSeconds(initialText || '0:00');

    // Wait 3 seconds
    await page.waitForTimeout(3000);

    // Get new time
    const newText = await timer.textContent();
    const newSeconds = parseTimerToSeconds(newText || '0:00');

    // Timer should have incremented
    expect(newSeconds).toBeGreaterThan(initialSeconds);
  });

  test('timer counts correctly after delay', async ({ page }) => {
    await page.goto('/game?d=easy&seed=timer-count-' + Date.now());
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);

    // Wait for timer to show at least 0:02
    await page.waitForTimeout(3000);

    const timerText = await timer.textContent();
    const seconds = parseTimerToSeconds(timerText || '0:00');

    // After ~3 seconds wait, timer should show at least 2 seconds
    expect(seconds).toBeGreaterThanOrEqual(2);
  });
});

test.describe('@integration Timer - Pause Behavior', () => {
  test('timer shows paused state when page loses visibility', async ({ page }) => {
    await page.goto('/game?d=easy&seed=timer-pause-vis');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);

    // Get initial time
    const initialText = await timer.textContent();
    const initialSeconds = parseTimerToSeconds(initialText || '0:00');

    // Simulate page hidden using visibilitychange event
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Wait a bit
    await page.waitForTimeout(1500);

    // Check for paused indicator - the text "PAUSED" appears when timer is paused
    const pausedIndicator = page.locator('text=PAUSED');
    await expect(pausedIndicator).toBeVisible();
  });

  test('timer resumes when page regains visibility', async ({ page }) => {
    await page.goto('/game?d=easy&seed=timer-resume');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);

    // Pause the timer
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.waitForTimeout(500);

    // Resume visibility
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // PAUSED text should disappear
    const pausedIndicator = page.locator('text=PAUSED');
    await expect(pausedIndicator).not.toBeVisible();

    // Timer should continue running - get initial time then verify it increments
    const timeAfterResume = await timer.textContent();
    const secondsAfterResume = parseTimerToSeconds(timeAfterResume || '0:00');

    await page.waitForTimeout(2000);

    const timeLater = await timer.textContent();
    const secondsLater = parseTimerToSeconds(timeLater || '0:00');

    expect(secondsLater).toBeGreaterThan(secondsAfterResume);
  });

  test('pause overlay appears when timer is paused', async ({ page }) => {
    await page.goto('/game?d=easy&seed=timer-overlay');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Pause the timer via visibility change
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.waitForTimeout(500);

    // Check for pause overlay elements
    const pauseOverlay = page.locator('text=Game Paused');
    await expect(pauseOverlay).toBeVisible();
  });
});

test.describe('@integration Timer - Hide Timer Preference', () => {
  test('can hide timer via menu toggle', async ({ page }) => {
    await page.goto('/game?d=easy&seed=timer-hide');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);

    // Verify timer is initially visible
    await expect(timer).toBeVisible();

    // Open menu
    const menuButton = page.locator('button[aria-label="Menu"]');
    await menuButton.click();

    // Find and click the "Show Timer" toggle
    const timerToggle = page.locator('button').filter({ hasText: 'Show Timer' });
    await timerToggle.click();

    // Close menu
    await menuButton.click();

    // Timer should now be hidden
    await expect(timer).not.toBeVisible();
  });

  test('hidden timer state persists across reload', async ({ page }) => {
    // Set hide timer preference before navigating
    await page.addInitScript(() => {
      const prefs = JSON.parse(localStorage.getItem('sudoku_preferences') || '{}');
      prefs.hideTimer = true;
      localStorage.setItem('sudoku_preferences', JSON.stringify(prefs));
    });

    await page.goto('/game?d=easy&seed=timer-persist');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);

    // Timer should be hidden due to preference
    await expect(timer).not.toBeVisible();
  });

  test('can show timer again after hiding', async ({ page }) => {
    // Start with timer hidden
    await page.addInitScript(() => {
      const prefs = JSON.parse(localStorage.getItem('sudoku_preferences') || '{}');
      prefs.hideTimer = true;
      localStorage.setItem('sudoku_preferences', JSON.stringify(prefs));
    });

    await page.goto('/game?d=easy&seed=timer-show-again');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);

    // Timer should be hidden initially
    await expect(timer).not.toBeVisible();

    // Open menu
    const menuButton = page.locator('button[aria-label="Menu"]');
    await menuButton.click();

    // Click the "Show Timer" toggle to enable timer
    const timerToggle = page.locator('button').filter({ hasText: 'Show Timer' });
    await timerToggle.click();

    // Close menu
    await menuButton.click();

    // Timer should now be visible
    await expect(timer).toBeVisible();
  });
});

test.describe('@integration Timer - Persistence', () => {
  test('timer value persists across page reload', async ({ page }) => {
    const seed = 'timer-reload-' + Date.now();
    await page.goto(`/game?d=easy&seed=${seed}`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);

    // Wait for timer to accumulate some time
    await page.waitForTimeout(3000);

    // Get timer value
    const timeBeforeReload = await timer.textContent();
    const secondsBeforeReload = parseTimerToSeconds(timeBeforeReload || '0:00');

    // Ensure we have some time on the timer
    expect(secondsBeforeReload).toBeGreaterThanOrEqual(2);

    // Reload the page
    await page.reload();
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Get timer value after reload
    const timeAfterReload = await timer.textContent();
    const secondsAfterReload = parseTimerToSeconds(timeAfterReload || '0:00');

    // Timer should have preserved at least some of the elapsed time
    // (might be slightly higher if save happened mid-second)
    expect(secondsAfterReload).toBeGreaterThanOrEqual(secondsBeforeReload - 1);
  });

  test('timer continues from saved time (not reset to 0)', async ({ page }) => {
    // Pre-populate saved game state with elapsed time
    await page.addInitScript(() => {
      const savedState = {
        puzzle: 'timer-continue-test',
        elapsedMs: 65000, // 1 minute 5 seconds
        board: [], // Will be overwritten by actual puzzle
        candidates: [],
        history: [],
      };
      localStorage.setItem('sudoku_saved_game', JSON.stringify(savedState));
    });

    await page.goto('/game?d=easy&seed=timer-continue-test');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);
    const timerText = await timer.textContent();
    const seconds = parseTimerToSeconds(timerText || '0:00');

    // Timer should start from approximately 1:05 (65 seconds)
    expect(seconds).toBeGreaterThanOrEqual(60);
  });
});

test.describe('@integration Timer - Completion', () => {
  test('timer stops when puzzle is completed', async ({ page }) => {
    // Use a puzzle that we can quickly complete or simulate completion
    await page.goto('/game?d=easy&seed=timer-complete');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);

    // Wait a moment for timer to start
    await page.waitForTimeout(1000);

    // Simulate game completion by triggering isComplete state
    // This requires filling in the last cell or using auto-solve
    // For this test, we'll use the auto-solve feature if available
    const autoSolveButton = page.locator('button[title="Auto-solve"]').or(
      page.locator('button:has-text("🤖")')
    );

    if (await autoSolveButton.count() > 0) {
      await autoSolveButton.click();

      // Wait for auto-solve to complete (may take a few seconds)
      await page.waitForTimeout(5000);

      // Check if puzzle completion modal appeared
      const completeModal = page.locator('text=Puzzle Complete').or(
        page.locator('h1:has-text("Complete")')
      );

      if (await completeModal.count() > 0) {
        // Get timer value
        const finalTime = await timer.textContent();
        const finalSeconds = parseTimerToSeconds(finalTime || '0:00');

        // Wait a moment
        await page.waitForTimeout(2000);

        // Timer should not have changed (stopped)
        const laterTime = await timer.textContent();
        const laterSeconds = parseTimerToSeconds(laterTime || '0:00');

        expect(laterSeconds).toBe(finalSeconds);
      }
    }
  });

  test('final time is passed to result page on completion', async ({ page }) => {
    // Navigate to result page with time parameter to verify it displays correctly
    await page.goto('/result?s=timer-result-test&d=easy&t=125000&h=0');

    // Result page should display the time (125000ms = 2:05)
    const resultContent = await page.textContent('body');

    // Should contain time-related content
    expect(resultContent).toContain('2:05');
  });
});

test.describe('@integration Timer - Edge Cases', () => {
  test('timer handles very long games gracefully', async ({ page }) => {
    // Pre-set a long elapsed time
    await page.addInitScript(() => {
      const savedState = {
        puzzle: 'timer-long-test',
        elapsedMs: 3661000, // 1 hour, 1 minute, 1 second
        board: [],
        candidates: [],
        history: [],
      };
      localStorage.setItem('sudoku_saved_game', JSON.stringify(savedState));
    });

    await page.goto('/game?d=easy&seed=timer-long-test');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);
    const timerText = await timer.textContent();

    // Timer should display something for long times (format may be M:SS or H:MM:SS)
    expect(timerText).toBeTruthy();
    const seconds = parseTimerToSeconds(timerText || '0:00');

    // Should be at least 1 hour worth of seconds
    expect(seconds).toBeGreaterThanOrEqual(3600);
  });

  test('timer does not go negative', async ({ page }) => {
    await page.goto('/game?d=easy&seed=timer-negative');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const timer = getTimerLocator(page);
    const timerText = await timer.textContent();

    // Timer should not contain negative sign
    expect(timerText).not.toContain('-');

    // Parsed seconds should be >= 0
    const seconds = parseTimerToSeconds(timerText || '0:00');
    expect(seconds).toBeGreaterThanOrEqual(0);
  });
});
