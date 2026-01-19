import { test, expect } from '@playwright/test';

/**
 * Resume Bug Direct Reproduction Test
 *
 * Directly reproduces the bug where:
 * 1. User has saved game with random P-seed
 * 2. Resume modal shows daily seed (most recent saved game)
 * 3. Navigation goes to daily seed
 * 4. Restoration fails because saved game has different seed
 *
 * Tag: @bug @resume
 */

test.describe('@bug Resume Bug - Direct Reproduction', () => {
  test.beforeEach(async ({ page }) => {
    // Clear all storage
    await page.evaluate(() => {
      const prefix = 'sudoku_game_';
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      sessionStorage.clear();
    )
  )

  test('resume bug: saved P-seed but resume shows daily seed', async ({ page }) => {
    // Console messages collection
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    )

    // Step 1: Create a saved game with random P-seed
    const randomSeed = `P${Date.now()}`;
    await page.goto(`/${randomSeed}?d=medium`);
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    // Play one move to trigger auto-save
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    await page.keyboard.press('5');

    // Wait for auto-save
    await page.waitForTimeout(1500);

    // Verify saved game has correct seed
    const savedAfterFirst = await page.evaluate(() => {
      const prefix = 'sudoku_game_';
      const games: any[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          const data = localStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            games.push({
              seed: key.slice(prefix.length),
              savedAt: parsed.savedAt,
            )
          }
        }
      }
      return games;
    )

    expect(savedAfterFirst).toHaveLength(1);
    expect(savedAfterFirst[0].seed).toBe(randomSeed);
    console.log('[TEST] Saved game with seed:', randomSeed);

    // Step 2: Navigate away from the game
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForTimeout(500);

    // Step 3: Navigate back to a DAILY seed (simulating resume modal showing wrong seed)
    const today = new Date().toISOString().split('T')[0];
    const dailySeed = `daily-${today}`;
    await page.goto(`/${dailySeed}?d=medium`);
    await page.waitForTimeout(3000);

    // Check restoration logs
    const restorationLogs = consoleMessages.filter(msg =>
      msg.includes('RESTORATION') || msg.includes('RESTORATION FLAG RESET')
    );
    console.log('[TEST] Restoration logs:', restorationLogs);

    // Check if restoration attempted with wrong seed
    const seedMismatch = restorationLogs.some(log =>
      log.includes(dailySeed) && log.includes(randomSeed)
    );

    // Check if restoration was attempted with daily seed
    const dailyRestorationAttempt = restorationLogs.some(log =>
      log.includes(dailySeed) && log.includes('Attempting to load saved state')
    );

    console.log('[TEST] Daily seed:', dailySeed);
    console.log('[TEST] Random seed saved:', randomSeed);
    console.log('[TEST] Daily restoration attempted:', dailyRestorationAttempt);
    console.log('[TEST] Seed mismatch in logs:', seedMismatch);

    // The bug: Restoration should attempt to load daily seed, but saved game has random seed
    if (dailyRestorationAttempt && savedAfterFirst[0].seed !== dailySeed) {
      console.log('[TEST] ✅ BUG REPRODUCED: Restoration attempted for daily seed, but saved game has different seed');
    } else {
      console.log('[TEST] ❌ BUG NOT REPRODUCED: Check logic');
    }

    // Verify saved games after navigating to daily seed
    const savedAfterDailyNav = await page.evaluate(() => {
      const prefix = 'sudoku_game_';
      const games: any[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          const data = localStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            games.push({
              seed: key.slice(prefix.length),
              savedAt: parsed.savedAt,
              isComplete: parsed.isComplete,
            )
          }
        }
      }
      return games;
    )

    console.log('[TEST] Saved games after daily navigation:', savedAfterDailyNav);
  )
)
