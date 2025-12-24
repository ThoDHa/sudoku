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
  });

  test('can navigate to homepage with difficulty selection', async ({ page }) => {
    await page.goto('/');
    // Homepage shows difficulty cards - check for difficulty badges
    await expect(page.locator('text=easy').first()).toBeVisible();
    await expect(page.locator('text=medium').first()).toBeVisible();
    await expect(page.locator('text=hard').first()).toBeVisible();
  });

  test('homepage shows daily or practice mode', async ({ page }) => {
    await page.goto('/');
    // Should show either "Daily Sudoku" or "Practice Mode"
    const dailyHeading = page.locator('h1:has-text("Daily Sudoku")');
    const practiceHeading = page.locator('h1:has-text("Practice Mode")');
    const completedHeading = page.locator('h1:has-text("Daily Complete")');
    
    // Wait for any of these to be visible (one must be true)
    await expect(dailyHeading.or(practiceHeading).or(completedHeading)).toBeVisible();
  });

  test('can navigate to techniques/learn page', async ({ page }) => {
    await page.goto('/techniques');
    await expect(page.locator('h1:has-text("Learn Sudoku")')).toBeVisible();
  });

  test('can navigate to custom puzzle page', async ({ page }) => {
    await page.goto('/custom');
    await expect(page.locator('text=Custom')).toBeVisible();
  });

  test('can navigate to leaderboard/stats page', async ({ page }) => {
    await page.goto('/leaderboard');
    // Leaderboard shows difficulty sections with Best/Assisted times
    await expect(page.locator('text=Best').first()).toBeVisible();
    await expect(page.locator('text=easy').first()).toBeVisible();
  });

  test('result page handles empty state gracefully', async ({ page }) => {
    await page.goto('/r');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('@smoke Difficulty Selection', () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
  });

  test('clicking Easy starts an easy game', async ({ page }) => {
    await page.goto('/');
    // Find the Easy card and click its Play button
    const easyCard = page.locator('button:has-text("easy")').first();
    await easyCard.click();
    await page.waitForURL(/\/(p|game)\//, { timeout: 10000 });
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
  });

  test('clicking Medium starts a medium game', async ({ page }) => {
    await page.goto('/');
    const mediumCard = page.locator('button:has-text("medium")').first();
    await mediumCard.click();
    await page.waitForURL(/\/(p|game)\//, { timeout: 10000 });
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
  });

  test('clicking Hard starts a hard game', async ({ page }) => {
    await page.goto('/');
    const hardCard = page.locator('button:has-text("hard")').first();
    await hardCard.click();
    await page.waitForURL(/\/(p|game)\//, { timeout: 10000 });
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
  });

  test('clicking Extreme starts an extreme game', async ({ page }) => {
    await page.goto('/');
    const extremeCard = page.locator('button:has-text("extreme")').first();
    await extremeCard.click();
    await page.waitForURL(/\/(p|game)\//, { timeout: 10000 });
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
  });
});

test.describe('@smoke Game Page Elements', () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/smoke-test-seed?d=easy');
    await page.waitForSelector('.game-background', { timeout: 15000 });
  });

  test('game board is rendered with 81 cells', async ({ page }) => {
    await expect(page.locator('.game-background')).toBeVisible();
    await expect(page.locator('.sudoku-board')).toBeVisible();
    const cells = page.locator('.sudoku-cell');
    await expect(cells).toHaveCount(81);
  });

  test('number buttons 1-9 are visible', async ({ page }) => {
    for (let i = 1; i <= 9; i++) {
      const button = page.locator(`button:has-text("${i}")`).first();
      await expect(button).toBeVisible();
    }
  });

  test('timer is visible', async ({ page }) => {
    const timer = page.locator('.font-mono').first();
    await expect(timer).toBeVisible();
  });

  test('control buttons are visible', async ({ page }) => {
    await expect(page.locator('button[title="Undo"]')).toBeVisible();
    await expect(page.locator('button[title*="Notes"]')).toBeVisible();
    await expect(page.locator('button[title="Erase"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Hint/i })).toBeVisible();
  });
});

test.describe('@smoke Responsive Design', () => {
  test('mobile viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
  });

  test('tablet viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
  });

  test('desktop viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
  });

  test('game works on mobile viewport', async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/mobile-test?d=easy');
    await page.waitForSelector('.game-background', { timeout: 15000 });
    await expect(page.locator('.sudoku-board')).toBeVisible();
  });
});
