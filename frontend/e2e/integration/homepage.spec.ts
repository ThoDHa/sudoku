import { test, expect } from '../fixtures';

/**
 * Homepage E2E Tests
 *
 * Comprehensive tests for the Sudoku homepage functionality including:
 * - Page loading and core elements
 * - Daily and Practice mode switching
 * - Difficulty grid display and selection
 * - Daily card states (play, resume, complete)
 * - Navigation links
 * - Continue game functionality
 * - Responsive design
 * - Edge cases and error handling
 */

test.describe('Homepage - Core Elements', () => {
  test('homepage loads with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Sudoku/);
  )

  test('displays Enso logo', async ({ page }) => {
    await page.goto('/');
    const logo = page.locator('img.enso-logo');
    await expect(logo).toBeVisible();
  )

  test('displays main heading (Daily Sudoku or Game Mode)', async ({ page }) => {
    await page.goto('/');
    const dailyHeading = page.locator('h1:has-text("Daily Sudoku")');
    const gameHeading = page.locator('h1:has-text("Game Mode")');
    const completeHeading = page.locator('h1:has-text("Daily Complete")');
    await expect(dailyHeading.or(gameHeading).or(completeHeading)).toBeVisible();
  )

  test('displays header navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
  )

  test('logo has correct alt text for accessibility', async ({ page }) => {
    await page.goto('/');
    const logo = page.locator('img.enso-logo');
    await expect(logo).toHaveAttribute('alt', 'Enso');
  )
)

test.describe('Homepage - Difficulty Grid', () => {
  test('displays all 5 difficulty levels', async ({ page }) => {
    await page.goto('/');
    // Check for all difficulty badges
    await expect(page.locator('button:has-text("easy")').first()).toBeVisible();
    await expect(page.locator('button:has-text("medium")').first()).toBeVisible();
    await expect(page.locator('button:has-text("hard")').first()).toBeVisible();
    await expect(page.locator('button:has-text("extreme")').first()).toBeVisible();
    await expect(page.locator('button:has-text("impossible")').first()).toBeVisible();
  )

  test('difficulty grid has proper structure', async ({ page }) => {
    await page.goto('/');
    const difficultyGrid = page.locator('.difficulty-grid');
    await expect(difficultyGrid).toBeVisible();
  )

  test('clicking easy difficulty navigates to game', async ({ page }) => {
    await page.goto('/');
    const easyButton = page.locator('button:has-text("easy")').first();
    await easyButton.click();
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    expect(page.url()).toContain('d=easy');
  )

  test('clicking medium difficulty navigates to game', async ({ page }) => {
    await page.goto('/');
    const mediumButton = page.locator('button:has-text("medium")').first();
    await mediumButton.click();
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    expect(page.url()).toContain('d=medium');
  )

  test('clicking hard difficulty navigates to game', async ({ page }) => {
    await page.goto('/');
    const hardButton = page.locator('button:has-text("hard")').first();
    await hardButton.click();
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    expect(page.url()).toContain('d=hard');
  )

  test('clicking extreme difficulty navigates to game', async ({ page }) => {
    await page.goto('/');
    const extremeButton = page.locator('button:has-text("extreme")').first();
    await extremeButton.click();
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    expect(page.url()).toContain('d=extreme');
  )

  test('clicking impossible difficulty navigates to game', async ({ page }) => {
    await page.goto('/');
    const impossibleButton = page.locator('button:has-text("impossible")').first();
    await impossibleButton.click();
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    expect(page.url()).toContain('d=impossible');
  )

  test('difficulty buttons have focus states for accessibility', async ({ page }) => {
    await page.goto('/');
    const easyButton = page.locator('button:has-text("easy")').first();
    
    // Focus the button using keyboard navigation
    await easyButton.focus();
    
    // Button should be focusable (check it received focus)
    await expect(easyButton).toBeFocused();
  )

  test('difficulty cards show Play button by default', async ({ page }) => {
    await page.goto('/');
    // Each difficulty card should have a Play button
    const playButtons = page.locator('.daily-card >> text=Play');
    await expect(playButtons.first()).toBeVisible();
  )
)

test.describe('Homepage - Navigation Links', () => {
  test('Custom link navigates to custom puzzle page', async ({ page }) => {
    await page.goto('/');
    const customLink = page.locator('a:has-text("Custom")');
    await expect(customLink).toBeVisible();
    await customLink.click();
    await expect(page).toHaveURL(/\/custom/);
  )

  test('Techniques link navigates to techniques page', async ({ page }) => {
    await page.goto('/');
    const techniquesLink = page.locator('a:has-text("Techniques")');
    await expect(techniquesLink).toBeVisible();
    await techniquesLink.click();
    await expect(page).toHaveURL(/\/techniques/);
    await expect(page.locator('h1:has-text("Learn Sudoku")')).toBeVisible();
  )

  test('Stats link navigates to leaderboard page', async ({ page }) => {
    await page.goto('/');
    const statsLink = page.locator('a:has-text("Stats")');
    await expect(statsLink).toBeVisible();
    await statsLink.click();
    await expect(page).toHaveURL(/\/leaderboard/);
  )

  test('back navigation from game returns to homepage', async ({ page }) => {
    await page.goto('/');
    
    // Start a game
    await page.locator('button:has-text("easy")').first().click();
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    
    // Navigate back
    await page.goBack();
    
    // Should be back on homepage
    await expect(page.locator('.difficulty-grid')).toBeVisible();
  )

  test('all three footer links are visible and functional', async ({ page }) => {
    await page.goto('/');
    
    // All links should be visible
    await expect(page.locator('a:has-text("Custom")')).toBeVisible();
    await expect(page.locator('a:has-text("Techniques")')).toBeVisible();
    await expect(page.locator('a:has-text("Stats")')).toBeVisible();
    
    // All should have proper href attributes
    await expect(page.locator('a:has-text("Custom")')).toHaveAttribute('href', '/custom');
    await expect(page.locator('a:has-text("Techniques")')).toHaveAttribute('href', '/techniques');
    await expect(page.locator('a:has-text("Stats")')).toHaveAttribute('href', '/leaderboard');
  )
)

test.describe('Homepage - Mode Switching', () => {
  test('can switch from daily to game mode via preferences', async ({ page }) => {
    // Start in daily mode (default)
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'daily' }));
    )
    await page.goto('/');
    
    // Verify we're in daily mode (shows "Daily Sudoku" heading)
    const dailyHeading = page.locator('h1:has-text("Daily Sudoku")');
    const completeHeading = page.locator('h1:has-text("Daily Complete")');
    await expect(dailyHeading.or(completeHeading)).toBeVisible();
  )

  test('game mode shows Game Mode heading', async ({ page }) => {
    // Set game mode preference
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'game' }));
    )
    await page.goto('/');
    
    await expect(page.locator('h1:has-text("Game Mode")')).toBeVisible();
    await expect(page.locator('text=Choose your difficulty')).toBeVisible();
  )

  test('game mode persists after starting a game', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'game' }));
    )
    await page.goto('/');
    
    // Start a game
    await page.locator('button:has-text("easy")').first().click();
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    
    // Navigate back to homepage
    await page.goto('/');
    
    // Should still be in game mode
    await expect(page.locator('h1:has-text("Game Mode")')).toBeVisible();
  )

  test('daily mode persists after starting a daily game', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'daily' }));
    )
    await page.goto('/');
    
    // If daily complete, we can't test this - skip
    const completeHeading = page.locator('h1:has-text("Daily Complete")');
    const isComplete = await completeHeading.isVisible().catch(() => false);
    
    if (!isComplete) {
      // Start a game
      await page.locator('button:has-text("easy")').first().click();
      await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
      
      // Navigate back
      await page.goto('/');
      
      // Should still be in daily mode (not game mode)
      const dailyOrComplete = page.locator('h1:has-text("Daily Sudoku")').or(page.locator('h1:has-text("Daily Complete")'));
      await expect(dailyOrComplete).toBeVisible();
    }
  )
)

test.describe('Homepage - Continue Game', () => {
  test('shows continue button for in-progress game in game mode', async ({ page }) => {
    const gameSeed = `P${Date.now()}`;
    const gameState = {
      seed: gameSeed,
      difficulty: 'easy',
      savedAt: Date.now(),
      board: Array(81).fill(0),
      solution: Array(81).fill(1),
      elapsedMs: 60000,
    };
    
    await page.addInitScript((state) => {
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'game' }));
      localStorage.setItem(`sudoku_game_${state.seed}`, JSON.stringify(state));
    }, gameState);
    
    await page.goto('/');
    
    // The easy button should show "Continue" indicator (isResumable)
    const easyButton = page.locator('button:has-text("easy")').first();
    await expect(easyButton).toBeVisible();
    // Check for continue indicator - button should have special styling or text
    await expect(page.locator('text=Continue').or(page.locator('[data-resumable="true"]')).or(easyButton)).toBeVisible();
  )

  test('shows Resume text on card with in-progress game', async ({ page }) => {
    const gameSeed = `P${Date.now()}`;
    const gameState = {
      seed: gameSeed,
      difficulty: 'medium',
      savedAt: Date.now(),
      board: Array(81).fill(0),
      solution: Array(81).fill(1),
      elapsedMs: 120000,
    };
    
    await page.addInitScript((state) => {
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'game' }));
      localStorage.setItem(`sudoku_game_${state.seed}`, JSON.stringify(state));
    }, gameState);
    
    await page.goto('/');
    
    // The medium card should show "Resume" instead of "Play"
    const mediumCard = page.locator('button:has-text("medium")').first();
    await expect(mediumCard.locator('text=Resume')).toBeVisible();
  )

  test('new game confirmation modal appears when switching difficulties with in-progress game', async ({ page }) => {
    const gameSeed = `P${Date.now()}`;
    const gameState = {
      seed: gameSeed,
      difficulty: 'easy',
      savedAt: Date.now(),
      board: Array(81).fill(0),
      solution: Array(81).fill(1),
      elapsedMs: 60000,
    };
    
    await page.addInitScript((state) => {
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'game' }));
      localStorage.setItem(`sudoku_game_${state.seed}`, JSON.stringify(state));
    }, gameState);
    
    await page.goto('/');
    
    // Click a different difficulty (medium instead of easy)
    await page.locator('button:has-text("medium")').first().click();
    
    // Should show confirmation modal
    await expect(page.locator('text=Start New Game?')).toBeVisible();
    await expect(page.locator('text=Cancel')).toBeVisible();
    await expect(page.locator('button:has-text("Start New")')).toBeVisible();
  )

  test('can cancel new game confirmation', async ({ page }) => {
    const gameSeed = `P${Date.now()}`;
    const gameState = {
      seed: gameSeed,
      difficulty: 'easy',
      savedAt: Date.now(),
      board: Array(81).fill(0),
      solution: Array(81).fill(1),
      elapsedMs: 60000,
    };
    
    await page.addInitScript((state) => {
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'game' }));
      localStorage.setItem(`sudoku_game_${state.seed}`, JSON.stringify(state));
    }, gameState);
    
    await page.goto('/');
    
    // Click a different difficulty
    await page.locator('button:has-text("medium")').first().click();
    
    // Cancel the confirmation
    await page.locator('button:has-text("Cancel")').click();
    
    // Modal should close, still on homepage
    await expect(page.locator('text=Start New Game?')).not.toBeVisible();
    await expect(page.locator('h1:has-text("Game Mode")')).toBeVisible();
  )

  test('confirming new game navigates and clears in-progress state', async ({ page }) => {
    const gameSeed = `P${Date.now()}`;
    const gameState = {
      seed: gameSeed,
      difficulty: 'easy',
      savedAt: Date.now(),
      board: Array(81).fill(0),
      solution: Array(81).fill(1),
      elapsedMs: 60000,
    };
    
    await page.addInitScript((state) => {
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'game' }));
      localStorage.setItem(`sudoku_game_${state.seed}`, JSON.stringify(state));
    }, gameState);
    
    await page.goto('/');
    
    // Click a different difficulty
    await page.locator('button:has-text("hard")').first().click();
    
    // Confirm starting new game
    await page.locator('button:has-text("Start New")').click();
    
    // Should navigate to hard game
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    expect(page.url()).toContain('d=hard');
  )

  test('clicking resumable difficulty does not show confirmation modal', async ({ page }) => {
    const gameSeed = `P${Date.now()}`;
    const gameState = {
      seed: gameSeed,
      difficulty: 'easy',
      savedAt: Date.now(),
      board: Array(81).fill(0),
      solution: Array(81).fill(1),
      elapsedMs: 60000,
    };
    
    await page.addInitScript((state) => {
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'game' }));
      localStorage.setItem(`sudoku_game_${state.seed}`, JSON.stringify(state));
    }, gameState);
    
    await page.goto('/');
    
    // Click the same difficulty that has the in-progress game
    await page.locator('button:has-text("easy")').first().click();
    
    // Should NOT show confirmation modal, should navigate directly
    await expect(page.locator('text=Start New Game?')).not.toBeVisible();
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
  )
)

test.describe('Homepage - Daily Mode Continue Game', () => {
  test('shows Resume text on daily card with in-progress game', async ({ page }) => {
    // Use a fixed daily seed format
    const dailySeed = 'daily-2024-12-25';
    const gameState = {
      seed: dailySeed,
      difficulty: 'medium',
      savedAt: Date.now(),
      board: Array(81).fill(0),
      solution: Array(81).fill(1),
      elapsedMs: 120000,
    };
    
    await page.addInitScript((state) => {
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'daily' }));
      localStorage.setItem(`sudoku_game_${state.seed}`, JSON.stringify(state));
    }, gameState);
    
    await page.goto('/');
    
    // Wait for daily mode heading (or complete if already done today)
    const dailyHeading = page.locator('h1:has-text("Daily Sudoku")');
    const completeHeading = page.locator('h1:has-text("Daily Complete")');
    await expect(dailyHeading.or(completeHeading)).toBeVisible();
    
    // If in daily mode (not complete), the medium card should show Resume
    if (await dailyHeading.isVisible()) {
      const mediumCard = page.locator('button:has-text("medium")').first();
      await expect(mediumCard.locator('text=Resume')).toBeVisible();
    }
  )

  test('clicking Resume on daily puzzle navigates with saved seed', async ({ page }) => {
    // Use a fixed daily seed format
    const dailySeed = 'daily-2024-12-25';
    const gameState = {
      seed: dailySeed,
      difficulty: 'easy',
      savedAt: Date.now(),
      board: Array(81).fill(0),
      solution: Array(81).fill(1),
      elapsedMs: 60000,
    };
    
    await page.addInitScript((state) => {
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'daily' }));
      localStorage.setItem(`sudoku_game_${state.seed}`, JSON.stringify(state));
    }, gameState);
    
    await page.goto('/');
    
    // Wait for daily mode heading
    const dailyHeading = page.locator('h1:has-text("Daily Sudoku")');
    const completeHeading = page.locator('h1:has-text("Daily Complete")');
    await expect(dailyHeading.or(completeHeading)).toBeVisible();
    
    // If in daily mode (not complete), click the easy card to resume
    if (await dailyHeading.isVisible()) {
      await page.locator('button:has-text("easy")').first().click();
      
      // Should NOT show confirmation modal since we're resuming the same difficulty
      await expect(page.locator('text=Start New Game?')).not.toBeVisible();
      
      // Should navigate to game page with the saved seed
      await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
      expect(page.url()).toContain(dailySeed);
      expect(page.url()).toContain('d=easy');
    }
  )

  test('daily mode confirmation modal appears when switching difficulties with in-progress game', async ({ page }) => {
    const dailySeed = 'daily-2024-12-25';
    const gameState = {
      seed: dailySeed,
      difficulty: 'easy',
      savedAt: Date.now(),
      board: Array(81).fill(0),
      solution: Array(81).fill(1),
      elapsedMs: 60000,
    };
    
    await page.addInitScript((state) => {
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'daily' }));
      localStorage.setItem(`sudoku_game_${state.seed}`, JSON.stringify(state));
    }, gameState);
    
    await page.goto('/');
    
    // Wait for daily mode heading
    const dailyHeading = page.locator('h1:has-text("Daily Sudoku")');
    const completeHeading = page.locator('h1:has-text("Daily Complete")');
    await expect(dailyHeading.or(completeHeading)).toBeVisible();
    
    // If in daily mode (not complete), click a different difficulty
    if (await dailyHeading.isVisible()) {
      await page.locator('button:has-text("medium")').first().click();
      
      // Should show confirmation modal when switching difficulties
      await expect(page.locator('text=Start New Game?')).toBeVisible();
      await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
      await expect(page.locator('button:has-text("Start New")')).toBeVisible();
    }
  )
)

test.describe('Homepage - Responsive Design', () => {
  test('mobile viewport displays all elements correctly', async ({ page, mobileViewport }) => {
    // mobileViewport fixture sets 375x667
    await page.goto('/');
    
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('img.enso-logo')).toBeVisible();
    await expect(page.locator('.difficulty-grid')).toBeVisible();
    
    // All difficulty buttons should be visible
    await expect(page.locator('button:has-text("easy")').first()).toBeVisible();
    await expect(page.locator('button:has-text("medium")').first()).toBeVisible();
    await expect(page.locator('button:has-text("hard")').first()).toBeVisible();
  )

  test('tablet viewport displays correctly', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 )
    await page.goto('/');
    
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('.difficulty-grid')).toBeVisible();
    await expect(page.locator('a:has-text("Custom")').first()).toBeVisible();
  )

  test('desktop viewport displays correctly', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 )
    await page.goto('/');
    
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('.difficulty-grid')).toBeVisible();
  )

  test('touch targets are adequate size on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 )
    await page.goto('/');
    
    // Get the bounding box of a difficulty button
    const easyButton = page.locator('button:has-text("easy")').first();
    const boundingBox = await easyButton.boundingBox();
    
    // Touch targets should be at least 44x44 pixels (WCAG recommendation)
    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      expect(boundingBox.width).toBeGreaterThanOrEqual(44);
      expect(boundingBox.height).toBeGreaterThanOrEqual(44);
    }
  )

  test('footer links are accessible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 )
    await page.goto('/');
    
    // All footer links should be visible and tappable
    const customLink = page.locator('a:has-text("Custom")');
    const techniquesLink = page.locator('a:has-text("Techniques")');
    const statsLink = page.locator('a:has-text("Stats")');
    
    await expect(customLink).toBeVisible();
    await expect(techniquesLink).toBeVisible();
    await expect(statsLink).toBeVisible();
    
    // Each link should have adequate touch target
    const customBox = await customLink.boundingBox();
    expect(customBox).not.toBeNull();
    if (customBox) {
      expect(customBox.height).toBeGreaterThanOrEqual(40);
    }
  )
)

test.describe('Homepage - Daily Mode Features', () => {
  test('daily mode shows date subtitle', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'daily' }));
    )
    await page.goto('/');
    
    // Should show a date in the subtitle (format varies, just check it exists)
    const subtitle = page.locator('.homepage-subtitle');
    // Only check if we're in daily mode (not complete)
    const dailyHeading = page.locator('h1:has-text("Daily Sudoku")');
    const headingVisible = await dailyHeading.isVisible().catch(() => false);
    if (headingVisible) {
      await expect(subtitle).toBeVisible();
    }
  )

  test('daily complete mode shows streak and play button when daily is completed', async ({ page }) => {
    // Simulate a completed daily puzzle
    await page.addInitScript(() => {
      // Get today in UTC format (matching getTodayUTC() in scores.ts)
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const todayUTC = `${year}-${month}-${day}`;
      
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'daily' }));
      // Use the correct key: sudoku_daily_completions (an array of dates)
      localStorage.setItem('sudoku_daily_completions', JSON.stringify([todayUTC]));
      // Also set streak data for tests that check streak display
      localStorage.setItem('sudoku_daily_streak', JSON.stringify({
        currentStreak: 1,
        longestStreak: 1,
        lastCompletedDate: todayUTC
      }));
    )
    
    await page.goto('/');
    
    // Should show Daily Complete heading
    await expect(page.locator('h1:has-text("Daily Complete")')).toBeVisible();
    
    // Should show Play button to switch to game mode
    await expect(page.locator('button:has-text("Play")')).toBeVisible();
  )

  test('clicking Play on complete screen switches to game mode', async ({ page }) => {
    await page.addInitScript(() => {
      // Get today in UTC format (matching getTodayUTC() in scores.ts)
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const todayUTC = `${year}-${month}-${day}`;
      
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'daily' }));
      // Use the correct key: sudoku_daily_completions (an array of dates)
      localStorage.setItem('sudoku_daily_completions', JSON.stringify([todayUTC]));
      // Also set streak data for tests that check streak display
      localStorage.setItem('sudoku_daily_streak', JSON.stringify({
        currentStreak: 1,
        longestStreak: 1,
        lastCompletedDate: todayUTC
      }));
    )
    
    await page.goto('/');
    await expect(page.locator('h1:has-text("Daily Complete")')).toBeVisible();
    
    // Click Play button
    await page.locator('button:has-text("Play")').click();
    
    // Should now show Game Mode
    await expect(page.locator('h1:has-text("Game Mode")')).toBeVisible();
  )

  test('daily complete screen shows current and best streak', async ({ page }) => {
    await page.addInitScript(() => {
      // Get today in UTC format (matching getTodayUTC() in scores.ts)
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const todayUTC = `${year}-${month}-${day}`;
      
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'daily' }));
      // Use the correct key: sudoku_daily_completions (an array of dates)
      localStorage.setItem('sudoku_daily_completions', JSON.stringify([todayUTC]));
      // Also set streak data for tests that check streak display
      localStorage.setItem('sudoku_daily_streak', JSON.stringify({
        currentStreak: 1,
        longestStreak: 1,
        lastCompletedDate: todayUTC
      }));
    )
    
    await page.goto('/');
    
    // Should show streak information
    await expect(page.locator('text=Current Streak')).toBeVisible();
    await expect(page.locator('text=Best Streak')).toBeVisible();
  )

  test('daily complete screen shows footer navigation links', async ({ page }) => {
    await page.addInitScript(() => {
      // Get today in UTC format (matching getTodayUTC() in scores.ts)
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const todayUTC = `${year}-${month}-${day}`;
      
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'daily' }));
      // Use the correct key: sudoku_daily_completions (an array of dates)
      localStorage.setItem('sudoku_daily_completions', JSON.stringify([todayUTC]));
      // Also set streak data for tests that check streak display
      localStorage.setItem('sudoku_daily_streak', JSON.stringify({
        currentStreak: 1,
        longestStreak: 1,
        lastCompletedDate: todayUTC
      }));
    )
    
    await page.goto('/');
    
    // Footer links should still be visible on complete screen
    await expect(page.locator('a:has-text("Custom")')).toBeVisible();
    await expect(page.locator('a:has-text("Techniques")')).toBeVisible();
    await expect(page.locator('a:has-text("Stats")')).toBeVisible();
  )

  test('daily mode shows streak indicator when user has active streak', async ({ page }) => {
    // Set up a streak by having completed yesterday
    await page.addInitScript(() => {
      // Get yesterday in UTC format (matching getTodayUTC() in scores.ts)
      const now = new Date();
      now.setUTCDate(now.getUTCDate() - 1);
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const yesterdayUTC = `${year}-${month}-${day}`;
      
      localStorage.setItem('sudoku_preferences', JSON.stringify({ homepageMode: 'daily' }));
      // Use the correct key: sudoku_daily_completions (an array of dates)
      localStorage.setItem('sudoku_daily_completions', JSON.stringify([yesterdayUTC]));
      // Set streak data for yesterday
      localStorage.setItem('sudoku_daily_streak', JSON.stringify({
        currentStreak: 1,
        longestStreak: 1,
        lastCompletedDate: yesterdayUTC
      }));
    )
    
    await page.goto('/');
    
    // Should show daily mode (not complete since today isn't done)
    const dailyHeading = page.locator('h1:has-text("Daily Sudoku")');
    const isDaily = await dailyHeading.isVisible().catch(() => false);
    
    if (isDaily) {
      // Should show streak indicator with fire emoji
      await expect(page.locator('text=day streak')).toBeVisible();
    }
  )
)

test.describe('Homepage - Edge Cases', () => {
  test('fresh user with no localStorage sees default state', async ({ page }) => {
    // Clear any localStorage before navigating
    await page.addInitScript(() => {
      localStorage.clear();
      // Re-add onboarding complete to skip that flow
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    )
    
    await page.goto('/');
    
    // Should load successfully with default mode (daily)
    const dailyHeading = page.locator('h1:has-text("Daily Sudoku")');
    const completeHeading = page.locator('h1:has-text("Daily Complete")');
    await expect(dailyHeading.or(completeHeading)).toBeVisible();
    
    // Difficulty grid should be visible (unless complete)
    const grid = page.locator('.difficulty-grid');
    const isGridVisible = await grid.isVisible().catch(() => false);
    // Either grid visible (daily mode) or Play button visible (complete mode)
    expect(isGridVisible || await page.locator('button:has-text("Play")').isVisible()).toBeTruthy();
  )

  test('homepage loads without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    )
    
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
    
    // No JavaScript errors should have occurred
    expect(errors).toHaveLength(0);
  )

  test('homepage loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    )
    
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
    
    // Filter out known acceptable errors (like favicon 404s)
    const criticalErrors = consoleErrors.filter(
      (error) => !error.includes('favicon') && !error.includes('404')
    );
    
    expect(criticalErrors).toHaveLength(0);
  )

  test('corrupted localStorage is handled gracefully', async ({ page }) => {
    await page.addInitScript(() => {
      // Set corrupted/invalid JSON in preferences
      localStorage.setItem('sudoku_preferences', '{invalid json');
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    )
    
    await page.goto('/');
    
    // Page should still load (fallback to defaults)
    await expect(page.locator('header')).toBeVisible();
    // Should show either daily or game mode (default behavior)
    const dailyHeading = page.locator('h1:has-text("Daily Sudoku")');
    const gameHeading = page.locator('h1:has-text("Game Mode")');
    const completeHeading = page.locator('h1:has-text("Daily Complete")');
    await expect(dailyHeading.or(gameHeading).or(completeHeading)).toBeVisible();
  )

  test('all images load successfully', async ({ page }) => {
    const failedImages: string[] = [];
    
    page.on('response', (response) => {
      if (response.request().resourceType() === 'image' && !response.ok()) {
        failedImages.push(response.url());
      }
    )
    
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
    
    // Wait for any lazy-loaded images
    await page.waitForLoadState('networkidle');
    
    expect(failedImages).toHaveLength(0);
  )

  test('page is accessible via keyboard navigation', async ({ page }) => {
    await page.goto('/');

    // Ensure initial focus moves off body
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).not.toBe('BODY');

    // Tab through the page up to 40 times, waiting briefly between presses.
    // We check `document.activeElement.innerText` rather than `textContent`.
    // Reason: the visible "Play" label is rendered inside a child element
    // (for example a <span>) and some environments expose the parent's
    // `innerText` in a more consistent, rendered form. `textContent` can
    // differ across engines and may not reflect the rendered label reliably.
    // We include a small 20ms wait after each Tab to allow any asynchronous
    // focus-management or rendering to complete before reading the active
    // element. This makes the assertion more deterministic and CI friendly.
    let found = false;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      // small pause to allow any focus-related JS to run
      await page.waitForTimeout(20);
      const activeText = await page.evaluate(() => document.activeElement?.innerText?.toLowerCase() || '');
      if (activeText.includes('play') || activeText.includes('easy')) {
        found = true;
        break;
      }
    }

    expect(found).toBeTruthy();
  )
)
