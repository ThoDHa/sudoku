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

  test('can navigate to play/difficulty selection page', async ({ page }) => {
    await page.goto('/play');
    await expect(page.locator('text=Easy')).toBeVisible();
    await expect(page.locator('text=Medium')).toBeVisible();
    await expect(page.locator('text=Hard')).toBeVisible();
    await expect(page.locator('text=Expert')).toBeVisible();
  });

  test('can navigate to daily page', async ({ page }) => {
    await page.goto('/daily');
    await expect(page.locator('text=Daily')).toBeVisible();
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
    await expect(page.locator('h1:has-text("Your Stats")')).toBeVisible();
  });

  test('result page handles empty state gracefully', async ({ page }) => {
    await page.goto('/r');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('@smoke Difficulty Selection', () => {
  test('clicking Easy starts an easy game', async ({ page }) => {
    await page.goto('/play');
    await page.locator('button:has-text("Easy")').first().click();
    await page.waitForURL(/\/game\//, { timeout: 10000 });
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
  });

  test('clicking Medium starts a medium game', async ({ page }) => {
    await page.goto('/play');
    await page.locator('button:has-text("Medium")').first().click();
    await page.waitForURL(/\/game\//, { timeout: 10000 });
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
  });

  test('clicking Hard starts a hard game', async ({ page }) => {
    await page.goto('/play');
    await page.locator('button:has-text("Hard")').first().click();
    await page.waitForURL(/\/game\//, { timeout: 10000 });
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
  });

  test('clicking Expert starts an expert game', async ({ page }) => {
    await page.goto('/play');
    await page.locator('button:has-text("Expert")').first().click();
    await page.waitForURL(/\/game\//, { timeout: 10000 });
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
  });
});

test.describe('@smoke Game Page Elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/game/smoke-test-seed?d=easy');
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
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/game/mobile-test?d=easy');
    await page.waitForSelector('.game-background', { timeout: 15000 });
    await expect(page.locator('.sudoku-board')).toBeVisible();
  });
});
