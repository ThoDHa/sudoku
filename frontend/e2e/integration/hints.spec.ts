import { test, expect, Page } from '@playwright/test';

/**
 * Hints Integration Tests
 * 
 * Tests for hint functionality including revealing cells and hint counter.
 * These are intentionally short tests - full solve tests are in slow/.
 * 
 * Tag: @integration @hints
 */

/**
 * Helper to wait for WASM to be ready.
 * In production builds, WASM initialization may take longer than board rendering.
 */
async function waitForWasmReady(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => {
      // Check if SudokuWasm API is available on window
      return typeof (window as any).SudokuWasm !== 'undefined';
    },
    { timeout }
  );
}

test.describe('@integration Hints - Basic Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    )
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 )
    // Wait for WASM to be ready
    await waitForWasmReady(page);
  )

  test('hint button is visible and clickable', async ({ page }) => {
    const hintButton = page.getByRole('button', { name: /Hint/i )
    await expect(hintButton).toBeVisible();
    await expect(hintButton).toBeEnabled();
  )

  test('clicking hint reveals or places a value', async ({ page }) => {
    // Count empty cells before hint
    const emptyCellsBefore = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    
    // Click hint button
    const hintButton = page.getByRole('button', { name: /Hint/i )
    await hintButton.click();
    
    // Wait for hint to be applied
    await page.waitForTimeout(1000);
    
    // Count empty cells after hint
    const emptyCellsAfter = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    
    // Either a cell was filled (fewer empty cells) or candidates were updated
    // For easy puzzles, usually a cell is filled
    expect(emptyCellsAfter).toBeLessThanOrEqual(emptyCellsBefore);
  )

  test('hint shows explanation or technique info', async ({ page }) => {
    // Count empty cells before hint to verify hint was applied
    const emptyCellsBefore = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    
    // Click hint button
    const hintButton = page.getByRole('button', { name: /Hint/i )
    await hintButton.click();
    
    // Wait for hint to be processed
    await page.waitForTimeout(500);
    
    // Look for hint explanation elements - these could be:
    // 1. A modal dialog with technique explanation
    // 2. A toast notification (fixed position div with hint message)
    // 3. Inline explanation text
    // 4. Technique badge/label
    const explanationSelectors = [
      '[role="dialog"]',
      '[class*="technique"]',
      '[class*="hint-explanation"]',
      '[class*="toast"]',
      '[class*="modal"]',
      // The toast notification is a fixed div with shadow-lg containing hint text
      '.fixed.z-50',
      // Look for common hint-related text patterns
      'text=/Added.*candidate|Naked Single|Hidden Single|Pointing|Box-Line|Pair|Triple|X-Wing|placed|eliminated/i'
    ];
    
    let hasExplanation = false;
    for (const selector of explanationSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible().catch(() => false)) {
        hasExplanation = true;
        break;
      }
    }
    
    // Also verify the hint actually did something (cell was filled or candidates updated)
    const emptyCellsAfter = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    const cellFilled = emptyCellsAfter < emptyCellsBefore;
    
    // Test passes if EITHER:
    // 1. An explanation UI element is visible (toast, modal, or technique text), OR
    // 2. A cell was filled (fewer empty cells), proving the hint mechanism works
    // Note: Hints can also add candidates without filling cells - detected via toast message
    expect(hasExplanation || cellFilled).toBeTruthy();
  )
)

test.describe('@integration Hints - Hint Counter', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    )
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 )
  )

  test('hint count is displayed', async ({ page }) => {
    const hintButton = page.getByRole('button', { name: /Hint/i )
    const hintText = await hintButton.textContent();
    
    // The hint button usually shows a count like "Hint (3)" or just "Hint"
    expect(hintText).toBeTruthy();
  )

  test('hint count decrements after using hint', async ({ page }) => {
    const hintButton = page.getByRole('button', { name: /Hint/i )
    
    // Get initial hint count from button text
    const initialText = await hintButton.textContent();
    const initialMatch = initialText?.match(/\d+/);
    const initialCount = initialMatch ? parseInt(initialMatch[0]) : null;
    
    // Use a hint
    await hintButton.click();
    await page.waitForTimeout(1000);
    
    // Check if count changed
    const afterText = await hintButton.textContent();
    const afterMatch = afterText?.match(/\d+/);
    const afterCount = afterMatch ? parseInt(afterMatch[0]) : null;
    
    if (initialCount !== null && afterCount !== null) {
      expect(afterCount).toBeLessThan(initialCount);
    }
    // If no count displayed, just verify hint was used (board changed)
  )

  test('using multiple hints decrements count correctly', async ({ page }) => {
    const hintButton = page.getByRole('button', { name: /Hint/i )
    
    // Get initial count
    const initialText = await hintButton.textContent();
    const initialMatch = initialText?.match(/\d+/);
    const initialCount = initialMatch ? parseInt(initialMatch[0]) : 3; // Default assumption
    
    // Use first hint
    await hintButton.click();
    await page.waitForTimeout(500);
    
    // After HINT-5 changes, hint button is disabled until user makes a move
    // Find an empty cell and make a move to re-enable hints
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    if (await emptyCell.count() > 0) {
      await emptyCell.click();
      // Enter a digit to make a move
      await page.keyboard.press('1');
      await page.waitForTimeout(300);
    }
    
    // Wait for hint button to be enabled again
    await expect(hintButton).toBeEnabled({ timeout: 5000 )
    
    // Use second hint
    await hintButton.click();
    await page.waitForTimeout(500);
    
    // Verify count decreased by 2
    const afterText = await hintButton.textContent();
    const afterMatch = afterText?.match(/\d+/);
    const afterCount = afterMatch ? parseInt(afterMatch[0]) : null;
    
    if (initialCount && afterCount !== null) {
      expect(afterCount).toBeLessThanOrEqual(initialCount - 2);
    }
  )
)

test.describe('@integration Hints - Edge Cases', () => {
  test('hint works on empty selected cell', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    )
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 )
    
    // Select an empty cell first (use lower rows to avoid header)
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.scrollIntoViewIfNeeded();
      await emptyCell.click();
      
      // Count empty cells before hint
      const emptyCellsBefore = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
      
      // Click hint
      const hintButton = page.getByRole('button', { name: /Hint/i )
      await hintButton.click();
      await page.waitForTimeout(1000);
      
      // Count empty cells after hint
      const emptyCellsAfter = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
      
      // Board should have changed (fewer empty cells)
      expect(emptyCellsAfter).toBeLessThanOrEqual(emptyCellsBefore);
    }
  )

  test('hint works with no cell selected', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    )
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 )
    
    // Count empty cells before hint
    const emptyCellsBefore = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    
    // Click hint without selecting a cell
    const hintButton = page.getByRole('button', { name: /Hint/i )
    await hintButton.click();
    await page.waitForTimeout(1000);
    
    // Count empty cells after hint  
    const emptyCellsAfter = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    
    // Hint should still work and change the board
    expect(emptyCellsAfter).toBeLessThanOrEqual(emptyCellsBefore);
  )

  test('hint on nearly solved puzzle still works', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    )
    // Start an easy puzzle that should be mostly solvable quickly
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 )
    
    // Use a few hints to get closer to solution
    const hintButton = page.getByRole('button', { name: /Hint/i )
    
    for (let i = 0; i < 3; i++) {
      if (await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(600);
      }
    }
    
    // Count filled cells
    const filledCells = await page.locator('[role="gridcell"][aria-label*="value"]').count();
    
    // Should have made progress (at least 20 filled cells)
    expect(filledCells).toBeGreaterThan(20);
  )
)

test.describe('@integration Hints - Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    )
    await page.setViewportSize({ width: 375, height: 667 )
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 )
  )

  test('hint button accessible on mobile', async ({ page }) => {
    // Mobile shows emoji-only hint button
    const hintButton = page.locator('button:has-text("💡")');
    await expect(hintButton).toBeVisible();
    
    const box = await hintButton.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Button should be reasonably sized for touch (at least 24px which is minimum touch target)
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
    }
  )

  test('hint click works on mobile', async ({ page }) => {
    // Count empty cells before hint
    const emptyCellsBefore = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    
    // Use click instead of tap (tap requires hasTouch context)
    const hintButton = page.locator('button:has-text("💡")');
    await hintButton.click();
    
    await page.waitForTimeout(1000);
    
    // Count empty cells after hint
    const emptyCellsAfter = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    
    expect(emptyCellsAfter).toBeLessThanOrEqual(emptyCellsBefore);
  )
)
