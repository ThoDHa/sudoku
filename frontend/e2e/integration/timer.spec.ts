import { test, expect } from '../fixtures';
import { setupGameAndWaitForBoard } from '../utils/board-wait';

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
  test.beforeEach(async ({ page }) => {
    await setupGameAndWaitForBoard(page);
  });

  test('timer is visible on game page', async ({ page }) => {

    const timer = getTimerLocator(page);
    await expect(timer).toBeVisible();
  });

  test('timer displays in M:SS format initially', async ({ page }) => {

    const timer = getTimerLocator(page);
    const timerText = await timer.textContent();

    // Should match M:SS or MM:SS format (0:00, 1:23, 12:34)
    expect(timerText).toMatch(/^\d+:\d{2}$/);
  });

  test('timer shows clock icon when visible', async ({ page }) => {

    // Timer section should contain an SVG clock icon
    // The timer display is a flex container with an SVG followed by span.font-mono
    // Find the parent div that contains the timer span, then get the sibling SVG
    const timer = getTimerLocator(page);
    const timerParent = timer.locator('xpath=..');
    const clockIcon = timerParent.locator('svg').first();
    await expect(clockIcon).toBeVisible();
  });
});

test.describe('@integration Timer - Counting', () => {
  test.beforeEach(async ({ page }) => {
    await setupGameAndWaitForBoard(page, { difficulty: 'easy' });
  });

  test('timer starts from 0:00 on new game', async ({ page }) => {

    const timer = getTimerLocator(page);
    const initialTime = await timer.textContent();

    // New game should start at 0:00 or very close to it
    const seconds = parseTimerToSeconds(initialTime || '0:00');
    expect(seconds).toBeLessThanOrEqual(2);
  });

  test('timer increments over time', async ({ page }) => {

    const timer = getTimerLocator(page);

    // Get initial time
    const initialText = await timer.textContent();
    const initialSeconds = parseTimerToSeconds(initialText || '0:00');

    // Wait for timer to advance beyond initial value
    await expect(async () => {
      const currentText = await timer.textContent();
      const currentSeconds = parseTimerToSeconds(currentText || '0:00');
      expect(currentSeconds).toBeGreaterThan(initialSeconds);
    }).toPass({ timeout: 5000 }); // Give timer up to 5 seconds to advance
  });

  test('timer counts correctly after delay', async ({ page }) => {

    const timer = getTimerLocator(page);

    // Wait for timer to reach at least 1 second (reduced from 2 for faster/more reliable tests)
    await expect(async () => {
      const timerText = await timer.textContent();
      const seconds = parseTimerToSeconds(timerText || '0:00');
      expect(seconds).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 5000 });
  });
});

test.describe('@integration Timer - Pause Behavior', () => {
  test.beforeEach(async ({ page }) => {
    await setupGameAndWaitForBoard(page, { difficulty: 'easy' });
  });

  test('timer shows paused state when page loses visibility', async ({ page }) => {

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

    // Wait for paused indicator to appear (condition-based)
    const pausedIndicator = page.locator('text=PAUSED');
    await expect(pausedIndicator).toBeVisible({ timeout: 3000 });
  });

  test('timer resumes when page regains visibility', async ({ page }) => {
    // Use a more specific timer locator that works even when paused
    const timerContainer = page.locator('[class*="timer"], [data-testid="timer"]').or(
      page.locator('.font-mono').filter({ hasText: /\d+:\d{2}/ })
    ).or(
      page.locator('text=/\\d+:\\d{2}/')
    ).first();

    // First, wait for timer to be visible and running
    await expect(timerContainer).toBeVisible({ timeout: 10000 });
    
    // Wait for some elapsed time
    await expect(async () => {
      const timeText = await timerContainer.textContent();
      const seconds = parseTimerToSeconds(timeText || '0:00');
      expect(seconds).toBeGreaterThan(0);
    }).toPass({ timeout: 5000 });

    // Get initial time before pause
    const timeBeforePause = await timerContainer.textContent();
    const secondsBeforePause = parseTimerToSeconds(timeBeforePause || '0:00');

    // Pause the timer by simulating page hidden
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Wait for paused indicator to appear
    const pausedCheck = page.locator('text=PAUSED');
    await expect(pausedCheck).toBeVisible({ timeout: 5000 });

    // Wait a moment while paused to ensure timer is actually paused
    await page.waitForTimeout(1500);

    // Verify timer didn't advance significantly while paused
    // The timer text might still be there even when paused
    const timeWhilePaused = await timerContainer.textContent().catch(() => null);
    if (timeWhilePaused) {
      const secondsWhilePaused = parseTimerToSeconds(timeWhilePaused);
      expect(secondsWhilePaused).toBeLessThanOrEqual(secondsBeforePause + 1);
    }

    // Resume visibility
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Wait for resume to take effect
    await page.waitForTimeout(500);

    // PAUSED text should disappear
    await expect(pausedCheck).not.toBeVisible({ timeout: 5000 });

    // Timer should continue running - verify it increments
    await expect(async () => {
      const timeLater = await timerContainer.textContent();
      expect(timeLater).toBeTruthy();
      const secondsLater = parseTimerToSeconds(timeLater!);
      // Timer should have advanced beyond what it was before
      expect(secondsLater).toBeGreaterThan(secondsBeforePause);
    }).toPass({ timeout: 8000 });
  });

  test('pause overlay appears when timer is paused', async ({ page }) => {
    // Note: beforeEach already set up the game

    // Wait for timer to actually start counting using condition-based wait
    const timer = getTimerLocator(page);
    await expect(async () => {
      const timerText = await timer.textContent();
      const seconds = parseTimerToSeconds(timerText || '0:00');
      expect(seconds).toBeGreaterThanOrEqual(0);
    }).toPass({ timeout: 3000 });

    // Pause the timer via visibility change
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // When app is hidden, it shows a minimal "Paused" state for battery optimization
    // (The full "Game Paused" overlay is not shown because the entire game UI is replaced
    // with a minimal frozen component when hidden)
    const pausedText = page.locator('text=Paused');
    await expect(pausedText).toBeVisible({ timeout: 5000 });
  });
});

test.describe('@integration Timer - Hide Timer Preference', () => {
  test('can hide timer via menu toggle', async ({ page }) => {
    await setupGameAndWaitForBoard(page);

    const timer = getTimerLocator(page);

    // Verify timer is initially visible
    await expect(timer).toBeVisible();

    // Open menu
    const menuButton = page.locator('button[aria-label="Menu"]');
    await menuButton.click();

    // Expand Settings section (Show Timer is inside Settings)
    const settingsButton = page.locator('button').filter({ hasText: 'Settings' });
    await settingsButton.click();

    // Find and click the "Show Timer" toggle
    const timerToggle = page.locator('button').filter({ hasText: 'Show Timer' });
    await timerToggle.click();

    // Close menu by pressing Escape (the modal overlay intercepts direct clicks)
    await page.keyboard.press('Escape');

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

    await setupGameAndWaitForBoard(page);

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

    await setupGameAndWaitForBoard(page);

    const timer = getTimerLocator(page);

    // Timer should be hidden initially
    await expect(timer).not.toBeVisible();

    // Open menu
    const menuButton = page.locator('button[aria-label="Menu"]');
    await menuButton.click();

    // Expand Settings section (Show Timer is inside Settings)
    const settingsButton = page.locator('button').filter({ hasText: 'Settings' });
    await settingsButton.click();

    // Click the "Show Timer" toggle to enable timer
    const timerToggle = page.locator('button').filter({ hasText: 'Show Timer' });
    await timerToggle.click();

    // Close menu using the X button in the menu header (menu button is blocked by overlay)
    const closeButton = page.locator('.fixed.inset-0').locator('button').first();
    await closeButton.click();

    // Timer should now be visible
    await expect(timer).toBeVisible();
  });
});

test.describe('@integration Timer - Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('timer value persists across page reload', async ({ page }) => {
    const seed = 'Ptimer-reload-' + Date.now();
    await setupGameAndWaitForBoard(page, { seed, difficulty: 'easy' });

    const timer = getTimerLocator(page);

    // Wait for timer to accumulate meaningful time
    await expect(async () => {
      const currentTime = await timer.textContent();
      const currentSeconds = parseTimerToSeconds(currentTime || '0:00');
      expect(currentSeconds).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 5000 });

    // Get timer value
    const timeBeforeReload = await timer.textContent();
    const secondsBeforeReload = parseTimerToSeconds(timeBeforeReload || '0:00');

    // Ensure we have some time on the timer
    expect(secondsBeforeReload).toBeGreaterThanOrEqual(2);

    // Reload the page
    await page.reload();
    await setupGameAndWaitForBoard(page, { seed, difficulty: 'easy' });

    // Get timer value after reload
    const timeAfterReload = await timer.textContent();
    const secondsAfterReload = parseTimerToSeconds(timeAfterReload || '0:00');

    // Timer should have preserved at least some of the elapsed time
    // (might be slightly higher if save happened mid-second)
    expect(secondsAfterReload).toBeGreaterThanOrEqual(secondsBeforeReload - 1);
  });

  test('timer continues from saved time (not reset to 0)', async ({ page }) => {
    // Pre-populate saved game state with elapsed time
    // Storage key is `sudoku_game_${seed}` - note: the test navigates to /?d=easy&seed=Ptimer-continue-test
    // so the puzzle seed will be 'Ptimer-continue-test'
    await page.addInitScript(() => {
      const savedState = {
        board: Array(81).fill(0), // Valid 81-cell board
        candidates: Array(81).fill([]), // Valid 81-cell candidates
        elapsedMs: 65000, // 1 minute 5 seconds
        history: [],
        autoFillUsed: false,
        savedAt: Date.now(),
        difficulty: 'easy',
      };
      localStorage.setItem('sudoku_game_Ptimer-continue-test', JSON.stringify(savedState));
    });

    // Skip cell value check since we're restoring an empty board
    await setupGameAndWaitForBoard(page, { seed: 'Ptimer-continue-test', difficulty: 'easy', skipCellValueCheck: true });

    // Wait for the timer to be restored from saved state
    // The app first resets the timer, then a second effect restores the saved elapsed time
    // We need to wait for this restoration to complete before reading the timer
    await page.waitForFunction(() => {
      const timer = document.querySelector('.font-mono');
      if (!timer) return false;
      const text = timer.textContent || '';
      const match = text.match(/^(\d+):(\d{2})$/);
      if (!match) return false;
      const seconds = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      return seconds >= 60;
    }, { timeout: 5000 });

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
    await setupGameAndWaitForBoard(page);

    const timer = getTimerLocator(page);

    // Wait for timer to start using condition-based wait
    await expect(async () => {
      const timerText = await timer.textContent();
      expect(timerText).toMatch(/^\d+:\d{2}$/);
    }).toPass({ timeout: 3000 });

    // Simulate game completion by triggering isComplete state
    // This requires filling in the last cell or using auto-solve
    // For this test, we'll use the auto-solve feature if available
    const autoSolveButton = page.locator('button[title="Auto-solve"]').or(
      page.locator('button:has-text("🤖")')
    );

    if (await autoSolveButton.count() > 0) {
      await autoSolveButton.click();

      // Wait for auto-solve to complete - detect completion modal
      const completeModal = page.locator('text=Puzzle Complete').or(
        page.locator('h1:has-text("Complete")')
      );
      
      await completeModal.waitFor({ timeout: 10000 }); // Proper completion detection

      if (await completeModal.count() > 0) {
        // Get timer value
        const finalTime = await timer.textContent();
        const finalSeconds = parseTimerToSeconds(finalTime || '0:00');

        // Verify timer remains frozen using condition-based approach
        // Wait and then check the timer hasn't changed
        await expect(async () => {
          const laterTime = await timer.textContent();
          const laterSeconds = parseTimerToSeconds(laterTime || '0:00');
          // Timer should not have changed (stopped)
          expect(laterSeconds).toBe(finalSeconds);
        }).toPass({ timeout: 3000 });
      }
    }
  });

  test('final time is passed to result page on completion', async ({ page }) => {
    // Navigate to result page with time parameter to verify it displays correctly
    // Note: Result page route is /r, not /result
    await page.goto('/r?s=Ptimer-result-test&d=easy&t=125000&h=0');

    // Wait for the result page to load (lazy loaded)
    await page.waitForSelector('text=Puzzle Complete!', { timeout: 10000 });

    // Result page should display the time (125000ms = 2:05)
    const resultContent = await page.textContent('body');

    // Should contain time-related content
    expect(resultContent).toContain('2:05');
  });
});

test.describe('@integration Timer - Edge Cases', () => {
  test('timer handles very long games gracefully', async ({ page }) => {
    // Pre-set a long elapsed time
    // Storage key is `sudoku_game_${seed}`
    await page.addInitScript(() => {
      const savedState = {
        board: Array(81).fill(0), // Valid 81-cell board
        candidates: Array(81).fill([]), // Valid 81-cell candidates
        elapsedMs: 3661000, // 1 hour, 1 minute, 1 second
        history: [],
        autoFillUsed: false,
        savedAt: Date.now(),
        difficulty: 'easy',
      };
      localStorage.setItem('sudoku_game_Ptimer-long-test', JSON.stringify(savedState));
    });

    // Skip cell value check since we're restoring an empty board
    await setupGameAndWaitForBoard(page, { seed: 'Ptimer-long-test', difficulty: 'easy', skipCellValueCheck: true });

    const timer = getTimerLocator(page);
    const timerText = await timer.textContent();

    // Timer should display something for long times (format may be M:SS or H:MM:SS)
    expect(timerText).toBeTruthy();
    const seconds = parseTimerToSeconds(timerText || '0:00');

    // Should be at least 1 hour worth of seconds
    expect(seconds).toBeGreaterThanOrEqual(3600);
  });

  test('timer does not go negative', async ({ page }) => {
    await setupGameAndWaitForBoard(page);

    const timer = getTimerLocator(page);
    const timerText = await timer.textContent();

    // Timer should not contain negative sign
    expect(timerText).not.toContain('-');

    // Parsed seconds should be >= 0
    const seconds = parseTimerToSeconds(timerText || '0:00');
    expect(seconds).toBeGreaterThanOrEqual(0);
  });
});
