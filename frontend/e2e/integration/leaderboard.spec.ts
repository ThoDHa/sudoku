import { test, expect } from '../fixtures';

/**
 * Leaderboard/Stats Page E2E Tests
 *
 * Tests the leaderboard page functionality including:
 * - Page loading and navigation
 * - Empty state handling
 * - Score display (pure and assisted)
 * - Time formatting
 * - Responsive design
 */

// Helper to create a mock score object
function createMockScore(
  difficulty: string,
  timeMs: number,
  options: {
    hintsUsed?: number;
    techniqueHintsUsed?: number;
    autoSolveUsed?: boolean;
    seed?: string;
  } = {}
) {
  return {
    seed: options.seed ?? `test-${Date.now()}`,
    difficulty,
    timeMs,
    hintsUsed: options.hintsUsed ?? 0,
    techniqueHintsUsed: options.techniqueHintsUsed ?? 0,
    mistakes: 0,
    completedAt: new Date().toISOString(),
    autoSolveUsed: options.autoSolveUsed ?? false,
  };
}

test.describe('Leaderboard Page', () => {
  test.describe('Page Load & Navigation', () => {
    test('leaderboard page loads successfully', async ({ page }) => {
      await page.goto('/leaderboard');

      // Should show leaderboard content with difficulty cards
      await expect(page.locator('text=Best').first()).toBeVisible();
      await expect(page.locator('text=Assisted').first()).toBeVisible();
    });

    test('displays all five difficulty levels', async ({ page }) => {
      await page.goto('/leaderboard');

      // All difficulties should be visible
      await expect(page.locator('h3:has-text("easy")')).toBeVisible();
      await expect(page.locator('h3:has-text("medium")')).toBeVisible();
      await expect(page.locator('h3:has-text("hard")')).toBeVisible();
      await expect(page.locator('h3:has-text("extreme")')).toBeVisible();
      await expect(page.locator('h3:has-text("impossible")')).toBeVisible();
    });

    test('can navigate to leaderboard from homepage', async ({ page }) => {
      await page.goto('/');

      // Find and click the leaderboard/stats link in header (not the homepage card)
      const statsLink = page.locator('header a[href="/leaderboard"]');
      await statsLink.click();

      // Should be on leaderboard page
      await expect(page).toHaveURL('/leaderboard');
      await expect(page.locator('text=Best').first()).toBeVisible();
    });

    test('back to puzzles link navigates to homepage', async ({ page }) => {
      await page.goto('/leaderboard');

      // Click back link
      const backLink = page.locator('a:has-text("Back to puzzles")');
      await expect(backLink).toBeVisible();
      await backLink.click();

      // Should be back on homepage
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Empty State', () => {
    test('shows "No times" when no scores exist', async ({ page }) => {
      // Clear any existing scores before loading
      await page.addInitScript(() => {
        localStorage.removeItem('sudoku_scores');
      });

      await page.goto('/leaderboard');

      // Each difficulty should show "No times" for both Best and Assisted
      const noTimesText = page.locator('text=No times');
      // 5 difficulties × 2 categories = 10 "No times" entries
      await expect(noTimesText.first()).toBeVisible();
      const count = await noTimesText.count();
      expect(count).toBe(10);
    });

    test('empty state shows for specific difficulty when others have scores', async ({ page }) => {
      // Add a score only for easy difficulty
      await page.addInitScript(() => {
        const scores = [
          {
            seed: 'test-1',
            difficulty: 'easy',
            timeMs: 120000,
            hintsUsed: 0,
            techniqueHintsUsed: 0,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: false,
          },
        ];
        localStorage.setItem('sudoku_scores', JSON.stringify(scores));
      });

      await page.goto('/leaderboard');

      // Easy should show a time
      const easyCard = page.locator('div').filter({ hasText: /^easy/ }).first();
      await expect(easyCard).toBeVisible();

      // Other difficulties should still show "No times"
      const noTimesCount = await page.locator('text=No times').count();
      // 4 difficulties with no pure scores + 5 difficulties with no assisted = 9
      expect(noTimesCount).toBe(9);
    });
  });

  test.describe('Populated State - Pure Scores', () => {
    test('displays best pure time for each difficulty', async ({ page }) => {
      await page.addInitScript(() => {
        const scores = [
          {
            seed: 'test-easy',
            difficulty: 'easy',
            timeMs: 90000, // 1:30
            hintsUsed: 0,
            techniqueHintsUsed: 0,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: false,
          },
          {
            seed: 'test-medium',
            difficulty: 'medium',
            timeMs: 180000, // 3:00
            hintsUsed: 0,
            techniqueHintsUsed: 0,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: false,
          },
        ];
        localStorage.setItem('sudoku_scores', JSON.stringify(scores));
      });

      await page.goto('/leaderboard');

      // Check that times are displayed
      await expect(page.locator('text=1:30')).toBeVisible();
      await expect(page.locator('text=3:00')).toBeVisible();
    });

    test('shows best time when multiple scores exist for same difficulty', async ({ page }) => {
      await page.addInitScript(() => {
        const scores = [
          {
            seed: 'test-1',
            difficulty: 'easy',
            timeMs: 180000, // 3:00 - worse time
            hintsUsed: 0,
            techniqueHintsUsed: 0,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: false,
          },
          {
            seed: 'test-2',
            difficulty: 'easy',
            timeMs: 90000, // 1:30 - best time
            hintsUsed: 0,
            techniqueHintsUsed: 0,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: false,
          },
          {
            seed: 'test-3',
            difficulty: 'easy',
            timeMs: 120000, // 2:00 - middle time
            hintsUsed: 0,
            techniqueHintsUsed: 0,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: false,
          },
        ];
        localStorage.setItem('sudoku_scores', JSON.stringify(scores));
      });

      await page.goto('/leaderboard');

      // Should show the best time (1:30), not the others
      const easyCard = page.locator('div').filter({ has: page.locator('h3:has-text("easy")') });
      await expect(easyCard.locator('text=1:30')).toBeVisible();
    });
  });

  test.describe('Populated State - Assisted Scores', () => {
    test('displays assisted score with hint icon', async ({ page }) => {
      await page.addInitScript(() => {
        const scores = [
          {
            seed: 'test-assisted',
            difficulty: 'hard',
            timeMs: 300000, // 5:00
            hintsUsed: 2,
            techniqueHintsUsed: 0,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: false,
          },
        ];
        localStorage.setItem('sudoku_scores', JSON.stringify(scores));
      });

      await page.goto('/leaderboard');

      // Hard card should show time and hint icon
      const hardCard = page.locator('div').filter({ has: page.locator('h3:has-text("hard")') });
      await expect(hardCard.locator('text=5:00')).toBeVisible();
      await expect(hardCard.locator('text=💡2')).toBeVisible();
    });

    test('displays assisted score with technique hint icon', async ({ page }) => {
      await page.addInitScript(() => {
        const scores = [
          {
            seed: 'test-technique',
            difficulty: 'extreme',
            timeMs: 600000, // 10:00
            hintsUsed: 0,
            techniqueHintsUsed: 3,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: false,
          },
        ];
        localStorage.setItem('sudoku_scores', JSON.stringify(scores));
      });

      await page.goto('/leaderboard');

      // Extreme card should show technique hint icon
      const extremeCard = page.locator('div').filter({ has: page.locator('h3:has-text("extreme")') });
      await expect(extremeCard.locator('text=10:00')).toBeVisible();
      await expect(extremeCard.locator('text=❓3')).toBeVisible();
    });

    test('displays auto-solve indicator for auto-solved puzzles', async ({ page }) => {
      await page.addInitScript(() => {
        const scores = [
          {
            seed: 'test-autosolve',
            difficulty: 'impossible',
            timeMs: 45000, // 0:45
            hintsUsed: 0,
            techniqueHintsUsed: 0,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: true,
          },
        ];
        localStorage.setItem('sudoku_scores', JSON.stringify(scores));
      });

      await page.goto('/leaderboard');

      // Impossible card should show robot icon for auto-solve
      const impossibleCard = page.locator('div').filter({ has: page.locator('h3:has-text("impossible")') });
      await expect(impossibleCard.locator('text=0:45')).toBeVisible();
      await expect(impossibleCard.locator('text=🤖')).toBeVisible();
    });

    test('separates pure and assisted scores correctly', async ({ page }) => {
      await page.addInitScript(() => {
        const scores = [
          // Pure score - faster
          {
            seed: 'test-pure',
            difficulty: 'medium',
            timeMs: 120000, // 2:00
            hintsUsed: 0,
            techniqueHintsUsed: 0,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: false,
          },
          // Assisted score - slower but with hints
          {
            seed: 'test-assisted',
            difficulty: 'medium',
            timeMs: 180000, // 3:00
            hintsUsed: 1,
            techniqueHintsUsed: 0,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: false,
          },
        ];
        localStorage.setItem('sudoku_scores', JSON.stringify(scores));
      });

      await page.goto('/leaderboard');

      const mediumCard = page.locator('div').filter({ has: page.locator('h3:has-text("medium")') });

      // Best row should show 2:00 (pure score)
      const bestRow = mediumCard.locator('div').filter({ hasText: 'Best' });
      await expect(bestRow.locator('text=2:00')).toBeVisible();

      // Assisted row should show 3:00 with hint icon
      const assistedRow = mediumCard.locator('div').filter({ hasText: 'Assisted' });
      await expect(assistedRow.locator('text=3:00')).toBeVisible();
    });
  });

  test.describe('Time Formatting', () => {
    test('formats times under 1 minute correctly (M:SS)', async ({ page }) => {
      await page.addInitScript(() => {
        const scores = [
          {
            seed: 'test-fast',
            difficulty: 'easy',
            timeMs: 45000, // 45 seconds = 0:45
            hintsUsed: 0,
            techniqueHintsUsed: 0,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: false,
          },
        ];
        localStorage.setItem('sudoku_scores', JSON.stringify(scores));
      });

      await page.goto('/leaderboard');
      await expect(page.locator('text=0:45')).toBeVisible();
    });

    test('formats times under 1 hour correctly (M:SS)', async ({ page }) => {
      await page.addInitScript(() => {
        const scores = [
          {
            seed: 'test-medium-time',
            difficulty: 'medium',
            timeMs: 754000, // 12:34
            hintsUsed: 0,
            techniqueHintsUsed: 0,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: false,
          },
        ];
        localStorage.setItem('sudoku_scores', JSON.stringify(scores));
      });

      await page.goto('/leaderboard');
      await expect(page.locator('text=12:34')).toBeVisible();
    });

    test('formats times over 1 hour correctly (H:MM:SS)', async ({ page }) => {
      await page.addInitScript(() => {
        const scores = [
          {
            seed: 'test-long',
            difficulty: 'hard',
            timeMs: 3723000, // 1:02:03
            hintsUsed: 0,
            techniqueHintsUsed: 0,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: false,
          },
        ];
        localStorage.setItem('sudoku_scores', JSON.stringify(scores));
      });

      await page.goto('/leaderboard');
      await expect(page.locator('text=1:02:03')).toBeVisible();
    });
  });

  test.describe('Responsive Design', () => {
    test('layout works on mobile viewport', async ({ page, mobileViewport }) => {
      // mobileViewport fixture sets 375x667
      void mobileViewport; // Ensure fixture is used

      await page.goto('/leaderboard');

      // All difficulties should still be visible
      await expect(page.locator('h3:has-text("easy")')).toBeVisible();
      await expect(page.locator('h3:has-text("medium")')).toBeVisible();
      await expect(page.locator('h3:has-text("hard")')).toBeVisible();
      await expect(page.locator('h3:has-text("extreme")')).toBeVisible();
      await expect(page.locator('h3:has-text("impossible")')).toBeVisible();

      // Back link should be visible
      await expect(page.locator('a:has-text("Back to puzzles")')).toBeVisible();
    });

    test('all data is accessible on small screens', async ({ page, mobileViewport }) => {
      void mobileViewport;

      await page.addInitScript(() => {
        const scores = [
          {
            seed: 'test-mobile',
            difficulty: 'easy',
            timeMs: 90000,
            hintsUsed: 0,
            techniqueHintsUsed: 0,
            mistakes: 0,
            completedAt: new Date().toISOString(),
            autoSolveUsed: false,
          },
        ];
        localStorage.setItem('sudoku_scores', JSON.stringify(scores));
      });

      await page.goto('/leaderboard');

      // Time should be visible
      await expect(page.locator('text=1:30')).toBeVisible();

      // Both Best and Assisted labels should be visible
      await expect(page.locator('text=Best').first()).toBeVisible();
      await expect(page.locator('text=Assisted').first()).toBeVisible();
    });

    test('layout works on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });

      await page.goto('/leaderboard');

      // All difficulties should be visible in grid layout
      await expect(page.locator('h3:has-text("easy")')).toBeVisible();
      await expect(page.locator('h3:has-text("impossible")')).toBeVisible();
    });
  });

  test.describe('Difficulty Card Styling', () => {
    test('each difficulty has distinct color styling', async ({ page }) => {
      await page.goto('/leaderboard');

      // Check that difficulty cards have their unique border colors
      const easyCard = page.locator('div.border-green-500').filter({ hasText: 'easy' });
      const mediumCard = page.locator('div.border-yellow-500').filter({ hasText: 'medium' });
      const hardCard = page.locator('div.border-orange-500').filter({ hasText: 'hard' });
      const extremeCard = page.locator('div.border-red-500').filter({ hasText: 'extreme' });
      const impossibleCard = page.locator('div.border-purple-500').filter({ hasText: 'impossible' });

      await expect(easyCard).toBeVisible();
      await expect(mediumCard).toBeVisible();
      await expect(hardCard).toBeVisible();
      await expect(extremeCard).toBeVisible();
      await expect(impossibleCard).toBeVisible();
    });
  });
});
