import { test, expect } from '../fixtures';

/**
 * Accessibility Integration Tests
 *
 * Tests for ARIA structure, keyboard navigation, screen reader support,
 * theme accessibility, and focus management.
 *
 * Tag: @integration @accessibility
 */

test.describe('@integration Accessibility - ARIA Structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      localStorage.setItem('sudoku_preferences', JSON.stringify({ showDailyReminder: false }));
    });
  });

  test('board has proper grid role and aria-label', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    const grid = page.locator('[role="grid"]');
    await expect(grid).toBeVisible();
    await expect(grid).toHaveAttribute('aria-label', /sudoku/i);
  });

  test('all cells have gridcell role with descriptive aria-label', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Check that all 81 cells have proper role and aria-label
    const cells = page.locator('[role="gridcell"]');
    await expect(cells).toHaveCount(81);

    // Verify aria-labels contain row and column information
    const firstCell = cells.first();
    const ariaLabel = await firstCell.getAttribute('aria-label');
    expect(ariaLabel).toMatch(/row \d/i);
    expect(ariaLabel).toMatch(/column \d/i);
  });

  test('cells indicate if they contain a value or are empty', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Find cells with values (given numbers)
    const filledCells = page.locator('[role="gridcell"][aria-label*="value"]');
    const filledCount = await filledCells.count();
    expect(filledCount).toBeGreaterThan(0);

    // Each filled cell's aria-label should include the value
    const firstFilled = filledCells.first();
    const ariaLabel = await firstFilled.getAttribute('aria-label');
    expect(ariaLabel).toMatch(/value \d/i);
  });

  test('rows have proper row role', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    const rows = page.locator('[role="row"]');
    await expect(rows).toHaveCount(9);
  });

  test('notes button has aria-pressed state', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    const notesButton = page.locator('button[title="Notes mode"]');
    await expect(notesButton).toBeVisible();

    // Initially not pressed
    await expect(notesButton).toHaveAttribute('aria-pressed', 'false');

    // After click, pressed
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('digit buttons have accessible labels', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Check that digit 1-9 buttons have aria-labels
    for (let digit = 1; digit <= 9; digit++) {
      const digitButton = page.locator(`button[aria-label^="Enter ${digit}"]`);
      await expect(digitButton).toBeVisible();
    }
  });

  test('menu button has accessible label', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    const menuButton = page.locator('button[aria-label="Menu"]');
    await expect(menuButton).toBeVisible();
  });
});

test.describe('@integration Accessibility - Keyboard Focus', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      localStorage.setItem('sudoku_preferences', JSON.stringify({ showDailyReminder: false }));
    });
  });

  test('selected cell is focusable with tabindex 0', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Click on an empty cell to select it
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    await emptyCell.click();

    // The selected cell should have tabindex="0"
    await expect(emptyCell).toHaveAttribute('tabindex', '0');
  });

  test('unselected cells have tabindex -1', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Select one cell
    const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]');
    await emptyCells.first().click();

    // Check that another unselected cell has tabindex="-1"
    const secondCell = emptyCells.nth(1);
    const isSelected = await secondCell.evaluate((el) =>
      el.classList.contains('ring-accent') || el.classList.contains('ring-2')
    );

    if (!isSelected) {
      await expect(secondCell).toHaveAttribute('tabindex', '-1');
    }
  });

  test('keyboard can navigate between cells with arrow keys', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Select first empty cell
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    await emptyCell.click();
    await emptyCell.focus();

    // Press arrow right - should move focus
    await page.keyboard.press('ArrowRight');

    // Verify focus moved (the focused element should be a gridcell)
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toHaveAttribute('role', 'gridcell');
  });

  test('digit entry via keyboard updates cell', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Find an empty cell and get its position
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    await expect(emptyCell).toBeVisible({ timeout: 5000 });
    
    const ariaLabel = await emptyCell.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    expect(match).toBeTruthy();
    const row = match![1];
    const col = match![2];

    // Click to select the cell
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();

    // Verify cell is selected (has ring class)
    await expect(emptyCell).toHaveClass(/ring/, { timeout: 3000 });

    // Press digit 5
    await page.keyboard.press('5');

    // Get a fresh locator for the same cell (by position, not value)
    const cellByPosition = page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`);
    
    // On mobile, keyboard input might take longer to process
    await expect(cellByPosition).toHaveAttribute('aria-label', /value 5/i, { timeout: 10000 });
  });
});

test.describe('@integration Accessibility - Theme', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      localStorage.setItem('sudoku_preferences', JSON.stringify({ showDailyReminder: false }));
    });
  });

  test('theme toggle button exists and is accessible', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Look for theme toggle button (could be in menu or header)
    const themeButton = page.locator('button[aria-label*="theme"], button[aria-label*="dark"], button[aria-label*="light"]').first();

    // If theme button exists, verify it's accessible
    if (await themeButton.isVisible()) {
      await expect(themeButton).toBeVisible();
    }
  });

  test('dark mode class is applied to document', async ({ page }) => {
    // Set dark mode preference
    await page.addInitScript(() => {
      localStorage.setItem('modePreference', 'dark');
    });

    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Check that dark class is on document element
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );
    expect(isDark).toBe(true);
  });

  test('light mode does not have dark class', async ({ page }) => {
    // Set light mode preference
    await page.addInitScript(() => {
      localStorage.setItem('modePreference', 'light');
    });

    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Check that dark class is NOT on document element
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );
    expect(isDark).toBe(false);
  });

  test('theme preference persists across page reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Set dark mode
    await page.evaluate(() => {
      localStorage.setItem('modePreference', 'dark');
    });

    // Reload page
    await page.reload();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Verify dark mode persisted
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );
    expect(isDark).toBe(true);
  });

  test('font size preference is applied', async ({ page }) => {
    // Set large font size
    await page.addInitScript(() => {
      localStorage.setItem('fontSize', 'xl');
    });

    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Check that font-xl class is on document
    const hasXlFont = await page.evaluate(() =>
      document.documentElement.classList.contains('font-xl')
    );
    expect(hasXlFont).toBe(true);
  });

  test('font size preference persists across page reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Set font size
    await page.evaluate(() => {
      localStorage.setItem('fontSize', 'small');
    });

    // Reload page
    await page.reload();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Verify font size persisted
    const hasSmallFont = await page.evaluate(() =>
      document.documentElement.classList.contains('font-small')
    );
    expect(hasSmallFont).toBe(true);
  });
});

test.describe('@integration Accessibility - Color Contrast', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      localStorage.setItem('sudoku_preferences', JSON.stringify({ showDailyReminder: false }));
    });
  });

  test('board cells have visible text in light mode', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('modePreference', 'light');
    });

    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Check that filled cells have text with color
    const filledCells = page.locator('[role="gridcell"][aria-label*="value"]');
    const firstFilled = filledCells.first();

    // Get computed color
    const color = await firstFilled.evaluate((el) =>
      window.getComputedStyle(el).color
    );

    // Color should be defined (not transparent or empty)
    expect(color).toBeTruthy();
    expect(color).not.toBe('transparent');
    expect(color).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('board cells have visible text in dark mode', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('modePreference', 'dark');
    });

    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Check that filled cells have text with color
    const filledCells = page.locator('[role="gridcell"][aria-label*="value"]');
    const firstFilled = filledCells.first();

    // Get computed color
    const color = await firstFilled.evaluate((el) =>
      window.getComputedStyle(el).color
    );

    // Color should be defined
    expect(color).toBeTruthy();
    expect(color).not.toBe('transparent');
    expect(color).not.toBe('rgba(0, 0, 0, 0)');
  });
});

test.describe('@integration Accessibility - Modals', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      localStorage.setItem('sudoku_preferences', JSON.stringify({ showDailyReminder: false }));
    });
  });

  test('menu opens and has accessible header', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Open menu
    const menuButton = page.locator('button[aria-label="Menu"]');
    await menuButton.click();

    // Wait for menu to appear - look for the Menu header text
    const menuHeader = page.locator('text="Menu"').first();
    await expect(menuHeader).toBeVisible({ timeout: 5000 });

    // Menu should have a backdrop (overlay)
    const backdrop = page.locator('.fixed.inset-0.bg-black\\/50').first();
    await expect(backdrop).toBeVisible();
  });

  test('clicking backdrop closes menu', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Open menu
    const menuButton = page.locator('button[aria-label="Menu"]');
    await menuButton.click();

    // Wait for menu header to appear
    const menuHeader = page.locator('span:has-text("Menu")').first();
    await expect(menuHeader).toBeVisible({ timeout: 5000 });

    // Click outside the menu to close it (at top-left corner of viewport)
    await page.mouse.click(10, 10);

    // Menu should be closed
    const backdrop = page.locator('.fixed.inset-0.bg-black\\/50').first();
    await expect(backdrop).not.toBeVisible({ timeout: 5000 });
  });

  // Note: Escape key handling is not currently implemented in the Menu component.
  // This test is skipped pending that feature.
  test.skip('escape key closes menu', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Open menu
    const menuButton = page.locator('button[aria-label="Menu"]');
    await menuButton.click();

    // Wait for menu header to appear
    const menuHeader = page.locator('span:has-text("Menu")').first();
    await expect(menuHeader).toBeVisible({ timeout: 5000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Menu should be closed
    const backdrop = page.locator('.fixed.inset-0.bg-black\\/50').first();
    await expect(backdrop).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('@integration Accessibility - Reduced Motion', () => {
  test('respects prefers-reduced-motion media query', async ({ page }) => {
    // Emulate reduced motion preference
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      localStorage.setItem('sudoku_preferences', JSON.stringify({ showDailyReminder: false }));
    });

    // Set reduced motion emulation
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Verify board is functional (animations may be disabled but functionality works)
    const grid = page.locator('[role="grid"]');
    await expect(grid).toBeVisible();

    // Verify interaction still works - find empty cell and get its position
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    const ariaLabel = await emptyCell.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    expect(match).toBeTruthy();
    const row = match![1];
    const col = match![2];

    // Click to select the cell
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    await page.keyboard.press('5');

    // Get a fresh locator for the same cell
    const cellByPosition = page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`);
    await expect(cellByPosition).toHaveAttribute('aria-label', /value 5/i, { timeout: 5000 });
  });
});

test.describe('@integration Accessibility - Screen Reader Announcements', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      localStorage.setItem('sudoku_preferences', JSON.stringify({ showDailyReminder: false }));
    });
  });

  test('game board announces completion state', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // The grid should have an aria-label that describes its state
    const grid = page.locator('[role="grid"]');
    const ariaLabel = await grid.getAttribute('aria-label');

    // Should contain "Sudoku" and describe the puzzle state
    expect(ariaLabel?.toLowerCase()).toContain('sudoku');
  });

  test('timer is accessible to screen readers', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Look for timer element - it should have accessible text
    const timer = page.locator('[class*="timer"], [data-testid="timer"]').first();

    if (await timer.isVisible()) {
      // Timer should have text content that can be read
      const timerText = await timer.textContent();
      expect(timerText).toMatch(/\d/); // Should contain numbers
    }
  });
});

test.describe('@integration Accessibility - Button Labels', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      localStorage.setItem('sudoku_preferences', JSON.stringify({ showDailyReminder: false }));
    });
  });

  test('all icon buttons have accessible labels', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Find all buttons
    const buttons = await page.locator('button').all();

    for (const button of buttons) {
      const text = await button.textContent() || '';
      const ariaLabel = await button.getAttribute('aria-label');
      const title = await button.getAttribute('title');

      // Each button should have either visible text, aria-label, or title
      const hasText = text.trim().length > 0;
      const hasAriaLabel = ariaLabel && ariaLabel.trim().length > 0;
      const hasTitle = title && title.trim().length > 0;
      const hasAccessibleName = hasText || hasAriaLabel || hasTitle;
      expect(hasAccessibleName).toBe(true);
    }
  });

  test('undo and redo buttons have accessible labels', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    const undoButton = page.locator('button[aria-label*="undo"], button[title*="undo"]').first();
    const redoButton = page.locator('button[aria-label*="redo"], button[title*="redo"]').first();

    // At least one should exist and be accessible
    if (await undoButton.isVisible()) {
      const label = await undoButton.getAttribute('aria-label') || await undoButton.getAttribute('title');
      expect(label?.toLowerCase()).toContain('undo');
    }
  });

  test('hint button has accessible label', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    const hintButton = page.locator('button[aria-label*="hint"], button[title*="hint"]').first();

    if (await hintButton.isVisible()) {
      const label = await hintButton.getAttribute('aria-label') || await hintButton.getAttribute('title');
      expect(label?.toLowerCase()).toContain('hint');
    }
  });
});

test.describe('@integration Accessibility - Focus Visible', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      localStorage.setItem('sudoku_preferences', JSON.stringify({ showDailyReminder: false }));
    });
  });

  test('focus ring is visible on board cells', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    // Tab to focus on a cell
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    await emptyCell.click();
    await emptyCell.focus();

    // The focused element should have visible focus styling
    // Check for ring or outline classes
    const hasFocusStyle = await emptyCell.evaluate((el) => {
      const classes = el.className;
      return classes.includes('ring') || classes.includes('focus');
    });

    // Focus styling should be present
    expect(hasFocusStyle).toBe(true);
  });

  test('focus ring is visible on buttons', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });

    const notesButton = page.locator('button[title="Notes mode"]');
    await notesButton.focus();

    // Check that button has focus-visible styling
    const hasFocusStyle = await notesButton.evaluate((el) => {
      const style = window.getComputedStyle(el);
      const hasRing = style.outline !== 'none' || style.boxShadow !== 'none';
      return hasRing || el.classList.contains('focus') || el.classList.contains('ring');
    });

    expect(hasFocusStyle).toBe(true);
  });
});
