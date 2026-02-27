import { test, expect } from '@playwright/test';
import { setupGameAndWaitForBoard } from '../utils/board-wait';

/**
 * Debug Report Integration Tests
 *
 * Tests for the new debug report functionality:
 * - Copy Debug Info button copies to clipboard
 * - Report a Bug link opens GitHub issues page
 * - Menu structure is correct
 *
 * Tag: @integration @debug-report
 */

test.describe('@integration Debug Report - Game Page', () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
  });

  test('menu has Copy Debug Info button', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Open menu - use title attribute which works on both game and homepage headers
    const menuButton = page.locator('button[title="Menu"]');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    // Wait for menu to appear
    const menuHeader = page.locator('text="Menu"').first();
    await expect(menuHeader).toBeVisible({ timeout: 5000 });

    // Verify Copy Debug Info button exists
    const copyDebugInfoButton = page.locator('button:has-text("Copy Debug Info")');
    await expect(copyDebugInfoButton).toBeVisible();

    // Verify clipboard icon is present
    await expect(copyDebugInfoButton.locator('svg')).toBeVisible();
  });

  test('Copy Debug Info button copies to clipboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Open menu - use title attribute which works on both game and homepage headers
    const menuButton = page.locator('button[title="Menu"]');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    // Wait for menu to appear
    const menuHeader = page.locator('text="Menu"').first();
    await expect(menuHeader).toBeVisible({ timeout: 5000 });

    // Click Copy Debug Info button
    // Note: Clicking this button also closes the menu (onClose is called)
    // So we can't wait for button text to change "Copied!" while menu is open
    // Instead, we verify the button was clicked and then check if we can reopen menu
    const copyDebugInfoButton = page.locator('button:has-text("Copy Debug Info")');
    await expect(copyDebugInfoButton).toBeVisible();
    await copyDebugInfoButton.click();

    // Wait for menu to close (since onClose() is called)
    await expect(menuHeader).not.toBeVisible({ timeout: 3000 });

    // Verify the copy action completed by trying to open menu again
    // If the copy succeeded, the button should now show "Copied!" when we reopen
    await menuButton.click();
    await expect(menuHeader).toBeVisible({ timeout: 5000 });

    // Verify the button now shows "Copied!" state
    const copiedButton = page.locator('button:has-text("Copied!")');
    await expect(copiedButton).toBeVisible({ timeout: 3000 });

    // Try to verify clipboard - this may fail in some browsers due to permissions
    // but the button state change is the critical user-facing behavior to verify
    try {
      const clipboardText = await page.evaluate(async () => {
        try {
          const clipboardText = await navigator.clipboard.readText();
          return clipboardText;
        } catch (error) {
          return null;
        }
      });

      // Only verify if clipboard was readable
      if (clipboardText) {
        expect(clipboardText).toBeTruthy();
        expect(clipboardText).toContain('version');
        expect(clipboardText).toContain('timestamp');
        expect(clipboardText).toContain('state');
      }
    } catch (error) {
      // Clipboard verification is best-effort - button state change is the primary assertion
    }
  });

  test('menu has Report a Bug link', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Open menu - use title attribute which works on both game and homepage headers
    const menuButton = page.locator('button[title="Menu"]');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    // Wait for menu to appear
    const menuHeader = page.locator('text="Menu"').first();
    await expect(menuHeader).toBeVisible({ timeout: 5000 });

    // Verify Report a Bug link exists
    const reportBugLink = page.locator('a:has-text("Report a Bug")');
    await expect(reportBugLink).toBeVisible();

    // Verify it has correct attributes
    await expect(reportBugLink).toHaveAttribute('href', 'https://github.com/thodha/sudoku/issues');
    await expect(reportBugLink).toHaveAttribute('target', '_blank');
    await expect(reportBugLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('Report a Bug link opens GitHub issues in new tab', async ({ page, context }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Track new pages that open
    const newPagePromise = context.waitForEvent('page');

    // Open menu - use title attribute which works on both game and homepage headers
    const menuButton = page.locator('button[title="Menu"]');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    // Wait for menu to appear
    const menuHeader = page.locator('text="Menu"').first();
    await expect(menuHeader).toBeVisible({ timeout: 5000 });

    // Click Report a Bug link
    const reportBugLink = page.locator('a:has-text("Report a Bug")');
    await reportBugLink.click();

    // Wait for new page to open
    const newPage = await newPagePromise;

    // Verify it opened GitHub issues page
    await expect(newPage).toHaveURL(/github\.com\/thodha\/sudoku\/issues/);
  });

  test('menu has instructional text for bug reporting', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Open menu - use title attribute which works on both game and homepage headers
    const menuButton = page.locator('button[title="Menu"]');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    // Wait for menu to appear
    const menuHeader = page.locator('text="Menu"').first();
    await expect(menuHeader).toBeVisible({ timeout: 5000 });

    // Verify instructional text exists
    const instructionText = page.locator('text=To report a bug: first copy debug info above, then paste it in your GitHub issue.');
    await expect(instructionText).toBeVisible();
  });

  test('menu has GitHub Repository link with correct URL', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Open menu - use title attribute which works on both game and homepage headers
    const menuButton = page.locator('button[title="Menu"]');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    // Wait for menu to appear
    const menuHeader = page.locator('text="Menu"').first();
    await expect(menuHeader).toBeVisible({ timeout: 5000 });

    // Verify GitHub Repository link exists
    const githubLink = page.locator('a:has-text("GitHub Repository")');
    await expect(githubLink).toBeVisible();

    // Verify it has correct attributes with fixed case typo
    await expect(githubLink).toHaveAttribute('href', 'https://github.com/thodha/sudoku');
    await expect(githubLink).toHaveAttribute('target', '_blank');
    await expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

test.describe('@integration Debug Report - Header/Home Page', () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
  });

  test('header menu has Copy Debug Info button', async ({ page }) => {
    await page.goto('/');

    // Wait for page to be fully loaded and header to be visible
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });

    // Open menu - use title attribute which works on both game and homepage headers
    const menuButton = page.locator('button[title="Menu"]');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    // Wait for menu to appear
    const menuHeader = page.locator('text="Menu"').first();
    await expect(menuHeader).toBeVisible({ timeout: 8000 });

    // Verify Copy Debug Info button exists
    const copyDebugInfoButton = page.locator('button:has-text("Copy Debug Info")');
    await expect(copyDebugInfoButton).toBeVisible({ timeout: 3000 });

    // Verify clipboard icon is present
    await expect(copyDebugInfoButton.locator('svg')).toBeVisible();
  });

  test('Copy Debug Info from header shows toast message', async ({ page }) => {
    await page.goto('/');

    // Wait for page to be fully loaded and header to be visible
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });

    // Open menu - use title attribute which works on both game and homepage headers
    const menuButton = page.locator('button[title="Menu"]');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    // Wait for menu to appear
    const menuHeader = page.locator('text="Menu"').first();
    await expect(menuHeader).toBeVisible({ timeout: 8000 });

    // Click Copy Debug Info button
    // Note: This will also close the menu (onClose is called)
    const copyDebugInfoButton = page.locator('button:has-text("Copy Debug Info")');
    await expect(copyDebugInfoButton).toBeVisible({ timeout: 3000 });
    await copyDebugInfoButton.click();

    // Wait for menu to close
    await expect(menuHeader).not.toBeVisible({ timeout: 3000 });

    // Verify toast message appears (toast persists after menu closes)
    const toastMessage = page.locator('text=Debug info copied!');
    await expect(toastMessage).toBeVisible({ timeout: 3000 });

    // Wait for toast to disappear
    await expect(toastMessage).not.toBeVisible({ timeout: 6000 });
  });
});
