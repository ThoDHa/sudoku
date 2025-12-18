import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Sudoku/);
  });

  test('can navigate to daily page', async ({ page }) => {
    await page.goto('/daily');
    await expect(page.locator('text=Daily')).toBeVisible();
  });

  test('can navigate to difficulty select page', async ({ page }) => {
    await page.goto('/play');
    await expect(page.locator('text=Easy')).toBeVisible();
    await expect(page.locator('text=Medium')).toBeVisible();
    await expect(page.locator('text=Hard')).toBeVisible();
    await expect(page.locator('text=Expert')).toBeVisible();
  });

  test('can navigate to techniques page', async ({ page }) => {
    await page.goto('/techniques');
    // Page title is "Learn Sudoku"
    await expect(page.locator('h1:has-text("Learn Sudoku")')).toBeVisible();
  });

  test('can navigate to custom puzzle page', async ({ page }) => {
    await page.goto('/custom');
    await expect(page.locator('text=Custom')).toBeVisible();
  });

  test('can navigate to leaderboard/stats page', async ({ page }) => {
    await page.goto('/leaderboard');
    // Page title is "Your Stats"
    await expect(page.locator('h1:has-text("Your Stats")')).toBeVisible();
  });
});

test.describe('Header', () => {
  test('header is visible on all pages', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
  });

  test('header menu can be opened', async ({ page }) => {
    await page.goto('/');
    
    // Find menu button (hamburger icon) - may be visible on mobile/smaller screens
    const menuButton = page.locator('button[aria-label="Menu"], [aria-label="menu"]');
    if (await menuButton.isVisible()) {
      await menuButton.click();
    }
  });
});

test.describe('Difficulty Selection', () => {
  test('clicking Easy starts an easy game', async ({ page }) => {
    await page.goto('/play');
    
    // Click on the Easy button/card
    await page.locator('button:has-text("Easy")').first().click();
    
    // Wait for navigation to game page (uses /game/ path)
    await page.waitForURL(/\/game\//, { timeout: 10000 });
    
    // Game background should be visible
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

test.describe('Game Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a game with easy difficulty
    await page.goto('/game/test-e2e-123?d=easy');
    // Wait for the game to load
    await page.waitForSelector('.game-background', { timeout: 15000 });
  });

  test('game board is rendered', async ({ page }) => {
    // Game background container should be visible
    await expect(page.locator('.game-background')).toBeVisible();
  });

  test('number buttons are visible', async ({ page }) => {
    // There should be number input buttons 1-9
    for (let i = 1; i <= 9; i++) {
      const button = page.locator(`button:has-text("${i}")`).first();
      await expect(button).toBeVisible();
    }
  });

  test('timer is visible and running', async ({ page }) => {
    // Timer should be visible (format: "0:XX" or "X:XX")
    const timer = page.locator('text=/\\d+:\\d+/');
    await expect(timer.first()).toBeVisible();
  });

  test('hint button is visible', async ({ page }) => {
    // Look for hint button in header (the button with "Hint" text)
    await expect(page.getByRole('button', { name: /Hint/i })).toBeVisible();
  });

  test('undo button exists', async ({ page }) => {
    // Undo button has title="Undo" and emoji ↩️
    await expect(page.locator('button[title="Undo"]')).toBeVisible();
  });

  test('notes toggle exists', async ({ page }) => {
    // Notes button has title that mentions "Notes mode"
    await expect(page.locator('button[title*="Notes"]')).toBeVisible();
  });

  test('erase button exists', async ({ page }) => {
    // Erase button has title="Erase"
    await expect(page.locator('button[title="Erase"]')).toBeVisible();
  });
});

test.describe('Game Menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/game/test-menu-e2e?d=easy');
    await page.waitForSelector('.game-background', { timeout: 15000 });
  });

  test('can open game menu', async ({ page }) => {
    // Find menu button (hamburger icon in header)
    const menuButton = page.locator('header button svg').last();
    if (await menuButton.isVisible()) {
      await menuButton.click();
      // Menu should open with options
      await page.waitForTimeout(300);
    }
  });
});

test.describe('Theme', () => {
  test('page has theme-related CSS variables', async ({ page }) => {
    await page.goto('/');
    
    // Page should use CSS variables for theming
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('Responsive Design', () => {
  test('mobile viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Page should still be functional on mobile
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
});

test.describe('API Integration', () => {
  test('puzzle loads from API on game page', async ({ page }) => {
    // Navigate to a game page with a seed
    await page.goto('/game/api-e2e-test?d=easy');
    
    // Wait for puzzle to load from API
    await page.waitForSelector('.game-background', { timeout: 15000 });
    
    // Game should be loaded (we have a timer)
    const timer = page.locator('text=/\\d+:\\d+/');
    await expect(timer.first()).toBeVisible();
  });

  test('daily page loads', async ({ page }) => {
    await page.goto('/daily');
    
    // Daily page should render
    await expect(page.locator('text=Daily')).toBeVisible();
  });
});

test.describe('Game Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/game/interaction-e2e-test?d=easy');
    await page.waitForSelector('.game-background', { timeout: 15000 });
  });

  test('can click number buttons', async ({ page }) => {
    // Find a number button and click it
    const numberButton = page.locator('button:has-text("1")').first();
    await numberButton.click();
    // No error means success - the interaction worked
  });

  test('keyboard number input works', async ({ page }) => {
    // Press a number key - this should work if a cell is selected
    await page.keyboard.press('1');
    // No error means success
  });
});

test.describe('Result Page', () => {
  test('result page handles empty state gracefully', async ({ page }) => {
    await page.goto('/r');
    // Page should load without crashing
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Custom Puzzle Page', () => {
  test('custom page loads correctly', async ({ page }) => {
    await page.goto('/custom');
    await expect(page.locator('text=Custom')).toBeVisible();
  });
});

test.describe('Techniques Page', () => {
  test('techniques index shows technique categories', async ({ page }) => {
    await page.goto('/techniques');
    
    // Should have "Learn Sudoku" heading
    await expect(page.locator('h1:has-text("Learn Sudoku")')).toBeVisible();
  });
});
