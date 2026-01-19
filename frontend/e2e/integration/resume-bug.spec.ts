import { test, expect } from '@playwright/test';

/**
 * Resume Bug Reproduction Test
 *
 * Reproduces the resume functionality bug where:
 * 1. Resume button shows daily game with seed daily-YYYY-MM-DD
 * 2. Navigation goes to that seed
 * 3. Restoration fails because saved game has random P-prefixed seed
 * 4. Infinite loop occurs
 *
 * Tag: @bug @resume
 */

test.describe('@bug Resume Bug - Seed Mismatch', () => {
  test.beforeEach(async ({ page }) => {
    // Clear all game states and session storage
    await page.evaluate(() => {
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
    )
  )

  test('resume daily game shows correct seed in localStorage', async ({ page }) => {
    // Collect console messages
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
      console.log('[PLAYWRIGHT]', msg.text());
    )

    // Navigate to daily game
    const today = new Date().toISOString().split('T')[0];
    const dailySeed = `daily-${today}`;
    await page.goto(`/${dailySeed}?d=medium`);
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    // Play one move to trigger auto-save
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    await page.keyboard.press('5');

    // Wait for auto-save (500ms debounce + idle callback)
    await page.waitForTimeout(1000);

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
              )
            } catch (e) {
              console.error('Failed to parse:', e);
            }
          }
        }
      }
      return games;
    )

    console.log('[PLAYWRIGHT] Saved games:', savedGames);

    // Check if game was saved with correct seed
    expect(savedGames).toHaveLength(1);
    expect(savedGames[0].seed).toBe(dailySeed);
    console.log('[PLAYWRIGHT] ✅ Game saved with correct seed:', dailySeed);

    // Navigate away from the game
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();

    // Navigate back - should show resume modal if there's an in-progress game
    await page.goto(`/${dailySeed}?d=medium`);
    await page.waitForTimeout(2000);

    // Check console for in-progress check output
    const inProgressLogs = consoleMessages.filter(msg =>
      msg.includes('IN-PROGRESS CHECK')
    );
    console.log('[PLAYWRIGHT] In-progress check logs:', inProgressLogs);

    // Check restoration logs
    const restorationLogs = consoleMessages.filter(msg =>
      msg.includes('RESTORATION')
    );
    console.log('[PLAYWRIGHT] Restoration logs:', restorationLogs);

    // Verify no seed mismatch in logs
    const seedMismatchFound = restorationLogs.some(log =>
      log.includes('daily-') && log.includes('P')
    );
    if (seedMismatchFound) {
      console.error('[PLAYWRIGHT] ❌ BUG REPRODUCED: Seed mismatch detected!');
    } else {
      console.log('[PLAYWRIGHT] ✅ No seed mismatch detected');
    }
  )
)
