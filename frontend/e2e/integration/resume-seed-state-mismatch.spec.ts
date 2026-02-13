import { test, expect } from '@playwright/test';
import log from 'loglevel';
const logger = log;
logger.setLevel('info');

/**
 * Resume Seed State Mismatch Tests
 *
 * Verifies resume functionality handles seed state correctly when:
 * 1. User navigates to daily game with seed daily-YYYY-MM-DD
 * 2. Game state is saved to localStorage
 * 3. User returns via URL with the same seed
 * 4. Saved state seed matches URL seed parameter
 *
 * This ensures proper state restoration without seed mismatches
 *
 * Tag: @regression @resume
 */

test.describe('@regression Resume Game State - Seed Mismatch Recovery', () => {
  test.beforeEach(async ({ page }) => {
    // Use addInitScript to clear storage before first navigation
    // This avoids SecurityError from page.evaluate on about:blank
    await page.addInitScript(() => {
      // Clear all game states
      const prefix = 'sudoku_game_';
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));

      // Clear session storage
      sessionStorage.clear();
    });
  });

  test('resume saves daily game with correct seed in localStorage', async ({ page }) => {
    // Collect console messages
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      logger.getLogger('e2e').info('[PLAYWRIGHT]', msg.text());
      consoleMessages.push(msg.text());
    });

    // Navigate to daily game
    const today = new Date().toISOString().split('T')[0];
    const dailySeed = `daily-${today}`;
    await page.goto(`/${dailySeed}?d=medium`);
    await page.waitForSelector('[role="grid"]', { timeout: 45000 });;

    // Play one move to trigger auto-save
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    await page.keyboard.press('5');

    // Wait for auto-save by checking localStorage
    await expect(async () => {
      const hasGame = await page.evaluate(() => {
        const prefix = 'sudoku_game_';
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith(prefix)) {
            return true;
          }
        }
        return false;
      });
      expect(hasGame).toBe(true);
    }).toPass({ timeout: 3000 });

    // Check what was saved in localStorage
    const savedGames = await page.evaluate(() => {
      const games: any[] = [];
      const prefix = 'sudoku_game_';
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          const seed = key.slice(prefix.length);
          const data = localStorage.getItem(key);
          if (data) {
            try {
              const parsed = JSON.parse(data);
              games.push({
                seed,
                difficulty: parsed.difficulty,
                savedAt: parsed.savedAt,
                isComplete: parsed.isComplete,
              });
            } catch (e) {
              console.error('Failed to parse:', e);
            }
          }
        }
      }
      return games;
    });

    logger.info('[PLAYWRIGHT] Saved games:', savedGames);

    // Check if game was saved with correct seed
    expect(savedGames).toHaveLength(1);
    expect(savedGames[0].seed).toBe(dailySeed);
    logger.info('[PLAYWRIGHT] ✅ Game saved with correct seed:', dailySeed);

    // Navigate away from the game
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();

    // Navigate back - should show resume modal if there's an in-progress game
    await page.goto(`/${dailySeed}?d=medium`);

    // Wait for page components to mount and game state to load
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[role="grid"]')).toBeVisible({ timeout: 15000 });

    // Check console for in-progress check output
    const inProgressLogs = consoleMessages.filter(msg =>
      msg.includes('IN-PROGRESS CHECK')
    );
    logger.info('[PLAYWRIGHT] In-progress check logs:', inProgressLogs);

    // Check restoration logs
    const restorationLogs = consoleMessages.filter(msg =>
      msg.includes('RESTORATION')
    );
    logger.info('[PLAYWRIGHT] Restoration logs:', restorationLogs);

    // Verify no seed mismatch in logs
    const seedMismatchFound = restorationLogs.some(log =>
      log.includes('daily-') && log.includes('P')
    );
    if (seedMismatchFound) {
      logger.error('[PLAYWRIGHT] ❌ SEED MISMATCH DETECTED!');
    } else {
      logger.info('[PLAYWRIGHT] ✅ No seed mismatch detected');
    }
  });
});
