import { test, expect } from '@playwright/test';

/**
 * Navigation & Smoke Tests
 * 
 * Fast tests that verify basic page loading and navigation.
 * These should be run first to catch obvious deployment issues.
 * 
 * Tag: @smoke
 */

test.describe('@smoke Navigation', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Sudoku/);
    await expect(page.locator('header')).toBeVisible();
  )

  test('can navigate to homepage with difficulty selection', async ({ page }) => {
    await page.goto('/');
    // Homepage shows difficulty cards - check for difficulty badges
    await expect(page.locator('text=easy').first()).toBeVisible();
    await expect(page.locator('text=medium').first()).toBeVisible();
    await expect(page.locator('text=hard').first()).toBeVisible();
  )

  test('homepage shows daily or practice mode', async ({ page }) => {
    await page.goto('/');
    // Should show either "Daily Sudoku" or "Practice Mode"
    const dailyHeading = page.locator('h1:has-text("Daily Sudoku")');
    const practiceHeading = page.locator('h1:has-text("Practice Mode")');
    const completedHeading = page.locator('h1:has-text("Daily Complete")');
    
    // Wait for any of these to be visible (one must be true)
    await expect(dailyHeading.or(practiceHeading).or(completedHeading)).toBeVisible();
  )

  test('can navigate to techniques/learn page', async ({ page }) => {
    await page.goto('/techniques');
    await expect(page.locator('h1:has-text("Learn Sudoku")')).toBeVisible();
  )

  test('can navigate to custom puzzle page', async ({ page }) => {
    await page.goto('/custom');
    await expect(page.locator('text=Custom')).toBeVisible();
  )

  test('can navigate to leaderboard/stats page', async ({ page }) => {
    await page.goto('/leaderboard');
    // Leaderboard shows difficulty sections with Best/Assisted times
    await expect(page.locator('text=Best').first()).toBeVisible();
    await expect(page.locator('text=easy').first()).toBeVisible();
  )

  test('result page handles empty state gracefully', async ({ page }) => {
    await page.goto('/r');
    await expect(page.locator('body')).toBeVisible();
  )
)

test.describe('@smoke Difficulty Selection', () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    )
  )

  test('clicking Easy starts an easy game', async ({ page }) => {
    await page.goto('/');
    // Find the Easy card and click its Play button
    const easyCard = page.locator('button:has-text("easy")').first();
    await easyCard.click();
    // Wait for game board to appear (route can be /daily-YYYY-MM-DD or /P{timestamp})
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    // Verify URL changed to game route with easy difficulty
    expect(page.url()).toMatch(/\/(daily-\d{4}-\d{2}-\d{2}|P\d+)\?d=easy/);
  )

  test('clicking Medium starts a medium game', async ({ page }) => {
    await page.goto('/');
    const mediumCard = page.locator('button:has-text("medium")').first();
    await mediumCard.click();
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    expect(page.url()).toMatch(/\/(daily-\d{4}-\d{2}-\d{2}|P\d+)\?d=medium/);
  )

  test('clicking Hard starts a hard game', async ({ page }) => {
    await page.goto('/');
    const hardCard = page.locator('button:has-text("hard")').first();
    await hardCard.click();
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    expect(page.url()).toMatch(/\/(daily-\d{4}-\d{2}-\d{2}|P\d+)\?d=hard/);
  )

  test('clicking Extreme starts an extreme game', async ({ page }) => {
    await page.goto('/');
    const extremeCard = page.locator('button:has-text("extreme")').first();
    await extremeCard.click();
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    expect(page.url()).toMatch(/\/(daily-\d{4}-\d{2}-\d{2}|P\d+)\?d=extreme/);
  )
)

test.describe('@smoke Game Page Elements', () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    )
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('.game-background', { timeout: 15000 )
  )

  test('game board is rendered with 81 cells', async ({ page }) => {
    await expect(page.locator('.game-background')).toBeVisible();
    await expect(page.getByRole("grid", { name: "Sudoku puzzle" }))).toBeVisible();
    const cells = page.locator('.sudoku-cell');
    await expect(cells).toHaveCount(81);
  )

  test('number buttons 1-9 are visible', async ({ page }) => {
    for (let i = 1; i <= 9; i++) {
      const button = page.locator(`button:has-text("${i}")`).first();
      await expect(button).toBeVisible();
    }
  )

  test('timer is visible', async ({ page }) => {
    const timer = page.locator('.font-mono').first();
    await expect(timer).toBeVisible();
  )

  test('control buttons are visible', async ({ page }) => {
    await expect(page.locator('button[title="Undo"]')).toBeVisible();
    await expect(page.locator('button[title*="Notes"]')).toBeVisible();
    await expect(page.locator('button[title="Erase"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Hint/i })).toBeVisible();
  )
)

test.describe('@smoke Responsive Design', () => {
  test('mobile viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 )
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
  )

  test('tablet viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 )
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
  )

  test('desktop viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 )
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
  )

  test('game works on mobile viewport', async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    )
    await page.setViewportSize({ width: 375, height: 667 )
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('.game-background', { timeout: 15000 )
    await expect(page.getByRole("grid", { name: "Sudoku puzzle" }))).toBeVisible();
  )
)

test.describe('@smoke In-Game Menu Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    )
  )

  test('New Game from menu shows single confirmation when in-progress game exists', async ({ page }) => {
    // Start a game and make some progress
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )
    
    // Make a move to create an in-progress game
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    await emptyCell.click();
    await page.keyboard.press('5');
    
    // Wait for auto-save
    await page.waitForTimeout(1000);
    
    // Open the menu (hamburger button in header) - wait for it to be visible and clickable
    const menuButton = page.locator('header button[title="Menu"]');
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    
    // Wait for menu to be visible
    await expect(page.locator('text=Menu')).toBeVisible({ timeout: 10000 )
    
    // Click New Game to expand submenu
    await page.locator('button:has-text("New Game")').click();
    
    // Select a difficulty
    await page.locator('button:has-text("medium")').click();
    
    // Should show SINGLE confirmation modal from Menu.tsx
    await expect(page.locator('text=Start New Game?')).toBeVisible();
    
    // Count confirmation modals - should only be 1
    const modalCount = await page.locator('text=Start New Game?').count();
    expect(modalCount).toBe(1);
    
    // Confirm and navigate
    await page.locator('button:has-text("Start New")').click();
    
    // Should navigate to new game without additional prompts
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    expect(page.url()).toContain('d=medium');
    
    // Verify no additional confirmation modal appeared
    await expect(page.locator('text=Start New Game?')).not.toBeVisible();
  )

    test('New Game from menu cancels correctly', async ({ page }) => {
    // Start a game and make some progress to create an in-progress save
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.getByTestId('game-background').toBeVisible({ timeout: 15000 )
    
    // Make a move
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    await emptyCell.click();
    await page.keyboard.press('3');
    
    // Wait for auto-save
    await page.waitForTimeout(1000);

    // Capture initial URL so we can assert it remains after cancel
    const initialGameUrl = page.url();
    
    // Open menu and try New Game - wait for button to be visible first
    const menuButton = page.locator('header button[title="Menu"]');
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    
    // Wait for menu to open before interacting
    await expect(page.locator('text=Menu')).toBeVisible({ timeout: 10000 )
    await page.locator('button:has-text("New Game")').click();
    await page.locator('button:has-text("hard")').click();
    
    // Confirmation modal appears
    await expect(page.locator('text=Start New Game?')).toBeVisible();
    
    // Cancel
    await page.locator('button:has-text("Cancel")').click();
    
    // Modal closes, still on original game
    await expect(page.locator('text=Start New Game?')).not.toBeVisible();
    // Ensure URL did not change from the original game
    expect(page.url()).toBe(initialGameUrl);
    expect(page.url()).toContain('d=easy');
  )

  test('New Game from menu does not show duplicate in-progress prompt', async ({ page }) => {
    // Regression test for bug: "Game in Progress" modal should NOT appear when
    // starting new game from menu, because Menu already handled confirmation

    // Start a game and make some progress to create an in-progress save
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    // Make a move to ensure game is saved
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    await emptyCell.click();
    await page.keyboard.press('5');

    // Wait for auto-save
    await page.waitForTimeout(1500);

    // Capture initial URL so we can ensure navigation happened to a new route
    const initialGameUrl = page.url();

    // Open menu and start a new game WITHOUT in-progress confirmation
    // (because Menu should handle to confirmation and set skip flag)
    const menuButton = page.locator('header button[title="Menu"]');
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    // Wait for menu to open
    await expect(page.locator('text=Menu')).toBeVisible({ timeout: 10000 )
    await page.locator('button:has-text("New Game")').click();

    // Select a difficulty
    await page.locator('button:has-text("medium")').click();

    // Menu should show single confirmation modal; click Start New to proceed
    await expect(page.locator('text=Start New Game?')).toBeVisible({ timeout: 5000 )
    await page.locator('button:has-text("Start New")').click();

    // Wait for navigation to complete to a new game route
    await expect(page.getByTestId('game-background')).toBeVisible({ timeout: 15000 )
    const newUrl = page.url();
    expect(newUrl).not.toBe(initialGameUrl);
    expect(newUrl).toContain('d=medium');

    // CRITICAL: "Game in Progress" modal should NOT appear (no duplicate)
    await expect(page.locator('text=Game In Progress')).not.toBeVisible();
    await expect(page.locator('button:has-text("Resume")')).not.toBeVisible();
  )

  test('seed change does not show in-progress modal', async ({ page }) => {
    // Test that changing puzzle seed directly doesn't trigger in-progress modal
    // Start a game and save progress
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    // Make a move to create saved progress
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    await emptyCell.click();
    await page.keyboard.press('5');

    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Get current URL (has a seed)
    const currentUrl = page.url();
    const seedMatch = currentUrl.match(/[?&]d=([^&]+)/);
    const currentSeed = seedMatch ? seedMatch[1] : '';

    // Simulate seed change by navigating directly to same seed
    if (currentSeed) {
      // Reload same seed URL (simulates returning to same game)
      await page.goto(`/?d=${currentSeed}`);
    }

    // Should navigate without in-progress modal (same seed)
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )

    // Now navigate to a different seed directly
    await page.goto('/?d=medium');

    // Should NOT show in-progress modal (new game from same page)
    await expect(page.locator('text=Game In Progress')).not.toBeVisible();
    await expect(page.getByRole("grid", { name: "Sudoku puzzle" }))).toBeVisible({ timeout: 15000 )
  )
)
