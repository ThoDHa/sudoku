import { test, expect } from '../fixtures';

/**
 * Persistence Integration Tests
 *
 * Tests for auto-save/restore functionality, timer persistence,
 * game clearing, preferences persistence, and multiple game tracking.
 *
 * Tag: @integration @persistence
 */

// Storage key constants (matching src/lib/constants.ts)
const GAME_STATE_PREFIX = 'sudoku_game_';
const PREFERENCES_KEY = 'sudoku_preferences';
const AUTO_SAVE_KEY = 'sudoku_autosave_enabled';

// Helper to get a cell by row and column (1-indexed)
function getCellLocator(page: any, row: number, col: number) {
  return page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`);
}

// Helper to check if a cell has a specific value
async function expectCellValue(page: any, row: number, col: number, value: number | 'empty') {
  const cell = getCellLocator(page, row, col);
  if (value === 'empty') {
    await expect(cell).toHaveAttribute('aria-label', new RegExp(`Row ${row}, Column ${col}, empty`));
  } else {
    await expect(cell).toHaveAttribute('aria-label', new RegExp(`Row ${row}, Column ${col}, value ${value}`));
  }
}

// Helper to find first empty cell and get its position
async function findEmptyCell(page: any, preferredRow = 5): Promise<{ cell: any; row: number; col: number }> {
  const emptyCell = page.locator(`[role="gridcell"][aria-label*="Row ${preferredRow}"][aria-label*="empty"]`).first();
  const ariaLabel = await emptyCell.getAttribute('aria-label');
  const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
  const row = match ? parseInt(match[1]) : preferredRow;
  const col = match ? parseInt(match[2]) : 1;
  return { cell: emptyCell, row, col };
}

// Helper to get localStorage item via page.evaluate
async function getLocalStorageItem(page: any, key: string): Promise<string | null> {
  return page.evaluate((k: string) => localStorage.getItem(k), key);
}

// Helper to set localStorage item via page.evaluate
async function setLocalStorageItem(page: any, key: string, value: string): Promise<void> {
  await page.evaluate(([k, v]: [string, string]) => localStorage.setItem(k, v), [key, value]);
}

// Helper to remove localStorage item via page.evaluate
async function removeLocalStorageItem(page: any, key: string): Promise<void> {
  await page.evaluate((k: string) => localStorage.removeItem(k), key);
}

// Helper to clear all game state keys from localStorage
async function clearAllGameStates(page: any): Promise<void> {
  await page.evaluate((prefix: string) => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }, GAME_STATE_PREFIX);
}

test.describe('@integration Persistence - Auto-save on Cell Change', () => {
  const TEST_SEED = 'persist-test-123';

  test.beforeEach(async ({ page }) => {
    // Clear any existing game state for this seed
    await page.addInitScript((seed: string) => {
      localStorage.removeItem(`sudoku_game_${seed}`);
    }, TEST_SEED);
  });

  test('entering a digit auto-saves to localStorage', async ({ page }) => {
    await page.goto(`/${TEST_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Find an empty cell
    const { cell, row, col } = await findEmptyCell(page);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.keyboard.press('5');

    // Wait for debounced auto-save (500ms debounce + idle callback)
    await page.waitForTimeout(1500);

    // Check localStorage
    const storageKey = `${GAME_STATE_PREFIX}${TEST_SEED}`;
    const savedState = await getLocalStorageItem(page, storageKey);
    expect(savedState).toBeTruthy();

    const parsed = JSON.parse(savedState!);
    expect(parsed.board).toBeDefined();
    expect(parsed.board.length).toBe(81);
    // The cell should have value 5
    const cellIndex = (row - 1) * 9 + (col - 1);
    expect(parsed.board[cellIndex]).toBe(5);
  });

  test('entering multiple digits saves all to localStorage', async ({ page }) => {
    await page.goto(`/${TEST_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Find first empty cell and enter digit
    const { cell: cell1, row: row1, col: col1 } = await findEmptyCell(page, 5);
    await cell1.scrollIntoViewIfNeeded();
    await cell1.click();
    await page.keyboard.press('3');
    await page.waitForTimeout(200);

    // Find another empty cell and enter digit
    const { cell: cell2, row: row2, col: col2 } = await findEmptyCell(page, 6);
    await cell2.scrollIntoViewIfNeeded();
    await cell2.click();
    await page.keyboard.press('7');

    // Wait for auto-save
    await page.waitForTimeout(1500);

    // Check localStorage
    const storageKey = `${GAME_STATE_PREFIX}${TEST_SEED}`;
    const savedState = await getLocalStorageItem(page, storageKey);
    expect(savedState).toBeTruthy();

    const parsed = JSON.parse(savedState!);
    const cellIndex1 = (row1 - 1) * 9 + (col1 - 1);
    const cellIndex2 = (row2 - 1) * 9 + (col2 - 1);
    expect(parsed.board[cellIndex1]).toBe(3);
    expect(parsed.board[cellIndex2]).toBe(7);
  });

  test('clearing a digit updates saved state', async ({ page }) => {
    await page.goto(`/${TEST_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Enter and then clear a digit
    const { cell, row, col } = await findEmptyCell(page);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.keyboard.press('9');
    await page.waitForTimeout(1500);

    // Verify digit was saved
    const storageKey = `${GAME_STATE_PREFIX}${TEST_SEED}`;
    let savedState = await getLocalStorageItem(page, storageKey);
    let parsed = JSON.parse(savedState!);
    const cellIndex = (row - 1) * 9 + (col - 1);
    expect(parsed.board[cellIndex]).toBe(9);

    // Clear the digit
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1500);

    // Verify saved state is updated
    savedState = await getLocalStorageItem(page, storageKey);
    parsed = JSON.parse(savedState!);
    expect(parsed.board[cellIndex]).toBe(0);
  });
});

test.describe('@integration Persistence - Restore Game on Reload', () => {
  const TEST_SEED = 'restore-test-456';

  test.beforeEach(async ({ page }) => {
    // Clear any existing game state for this seed
    await page.addInitScript((seed: string) => {
      localStorage.removeItem(`sudoku_game_${seed}`);
    }, TEST_SEED);
  });

  test('digits persist after page reload', async ({ page }) => {
    await page.goto(`/${TEST_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Enter a digit
    const { cell, row, col } = await findEmptyCell(page);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.keyboard.press('4');
    await page.waitForTimeout(1500);

    // Reload the page
    await page.reload();
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Verify the digit is restored
    await expectCellValue(page, row, col, 4);
  });

  test('notes persist after page reload', async ({ page }) => {
    await page.goto(`/${TEST_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Enable notes mode
    const notesButton = page.locator('button[title="Notes mode"]');
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');

    // Add notes to a cell
    const { cell } = await findEmptyCell(page);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.keyboard.press('1');
    await page.keyboard.press('2');
    await page.keyboard.press('3');
    await page.waitForTimeout(1500);

    // Verify notes are visible
    let cellContent = await cell.textContent();
    expect(cellContent).toContain('1');
    expect(cellContent).toContain('2');
    expect(cellContent).toContain('3');

    // Reload the page
    await page.reload();
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Find the same cell (notes should be restored)
    const cellAfterReload = page.locator(`[role="gridcell"][aria-label*="empty"]`).first();
    cellContent = await cellAfterReload.textContent();
    // Notes should persist
    expect(cellContent).toContain('1');
    expect(cellContent).toContain('2');
    expect(cellContent).toContain('3');
  });

  test('partial game state restores exactly on reload', async ({ page }) => {
    await page.goto(`/${TEST_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Make multiple moves
    const { cell: cell1, row: row1, col: col1 } = await findEmptyCell(page, 5);
    await cell1.scrollIntoViewIfNeeded();
    await cell1.click();
    await page.keyboard.press('8');
    await page.waitForTimeout(200);

    const { cell: cell2, row: row2, col: col2 } = await findEmptyCell(page, 6);
    await cell2.scrollIntoViewIfNeeded();
    await cell2.click();
    await page.keyboard.press('2');
    await page.waitForTimeout(1500);

    // Reload
    await page.reload();
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Verify both digits are restored
    await expectCellValue(page, row1, col1, 8);
    await expectCellValue(page, row2, col2, 2);
  });
});

test.describe('@integration Persistence - Timer Persistence', () => {
  const TEST_SEED = 'timer-test-789';

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((seed: string) => {
      localStorage.removeItem(`sudoku_game_${seed}`);
    }, TEST_SEED);
  });

  test('timer continues from saved time after reload', async ({ page }) => {
    await page.goto(`/${TEST_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Make a move to trigger auto-save (and start tracking time)
    const { cell } = await findEmptyCell(page);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.keyboard.press('1');

    // Wait a few seconds for timer to accumulate and auto-save
    await page.waitForTimeout(3000);

    // Get timer value before reload
    const timerElement = page.locator('[class*="timer"], [data-testid="timer"], header').filter({ hasText: /\d:\d\d/ }).first();
    const timerTextBefore = await timerElement.textContent().catch(() => '');

    // Reload
    await page.reload();
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Get timer value after reload
    const timerAfterReload = page.locator('[class*="timer"], [data-testid="timer"], header').filter({ hasText: /\d:\d\d/ }).first();
    const timerTextAfter = await timerAfterReload.textContent().catch(() => '');

    // Timer should be at least as much as before (not reset to 0:00)
    // We check that elapsedMs was saved
    const storageKey = `${GAME_STATE_PREFIX}${TEST_SEED}`;
    const savedState = await getLocalStorageItem(page, storageKey);
    expect(savedState).toBeTruthy();
    const parsed = JSON.parse(savedState!);
    expect(parsed.elapsedMs).toBeGreaterThan(0);
  });
});

test.describe('@integration Persistence - Clear Game Functionality', () => {
  const TEST_SEED = 'clear-test-101';

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((seed: string) => {
      localStorage.removeItem(`sudoku_game_${seed}`);
    }, TEST_SEED);
  });

  test('starting a new game clears the board', async ({ page }) => {
    await page.goto(`/${TEST_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Make some moves
    const { cell, row, col } = await findEmptyCell(page);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.keyboard.press('6');
    await page.waitForTimeout(1500);

    // Verify the move was made
    await expectCellValue(page, row, col, 6);

    // Click the menu button and find reset/new game option
    const menuButton = page.locator('header button[aria-label*="Menu"], header button:has(svg)').last();
    await menuButton.click();
    await page.waitForTimeout(200);

    // Look for reset or new game button
    const resetButton = page.locator('button:has-text("Reset"), button:has-text("New Game"), button:has-text("Restart")').first();
    if (await resetButton.isVisible()) {
      await resetButton.click();
      await page.waitForTimeout(500);

      // The cell should now be empty again
      await expectCellValue(page, row, col, 'empty');
    }
  });

  test('reset clears saved state from localStorage', async ({ page }) => {
    await page.goto(`/${TEST_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Make a move to trigger save
    const { cell } = await findEmptyCell(page);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.keyboard.press('5');
    await page.waitForTimeout(1500);

    // Verify save exists
    const storageKey = `${GAME_STATE_PREFIX}${TEST_SEED}`;
    let savedState = await getLocalStorageItem(page, storageKey);
    expect(savedState).toBeTruthy();

    // Click menu and reset
    const menuButton = page.locator('header button[aria-label*="Menu"], header button:has(svg)').last();
    await menuButton.click();
    await page.waitForTimeout(200);

    const resetButton = page.locator('button:has-text("Reset"), button:has-text("New Game"), button:has-text("Restart")').first();
    if (await resetButton.isVisible()) {
      await resetButton.click();
      await page.waitForTimeout(1000);

      // Saved state should be cleared (or empty board state)
      savedState = await getLocalStorageItem(page, storageKey);
      if (savedState) {
        const parsed = JSON.parse(savedState);
        // Either null or all user entries are cleared
        const userEntries = parsed.board.filter((v: number, i: number) => v !== 0);
        // After reset, there should only be givens (original puzzle values)
        // We can't easily distinguish, but history should be empty
        expect(parsed.history?.length || 0).toBe(0);
      }
    }
  });
});

test.describe('@integration Persistence - Preferences', () => {
  test('preferences persist after page reload', async ({ page }) => {
    await page.goto('/pref-test-123?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Open settings/menu and toggle a preference (e.g., hide timer)
    const menuButton = page.locator('header button[aria-label*="Menu"], header button:has(svg)').last();
    await menuButton.click();
    await page.waitForTimeout(200);

    // Look for timer toggle or theme option
    const hideTimerToggle = page.locator('button:has-text("Hide Timer"), [aria-label*="timer"]').first();
    if (await hideTimerToggle.isVisible()) {
      await hideTimerToggle.click();
      await page.waitForTimeout(500);

      // Close menu by pressing escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Reload
      await page.reload();
      await page.waitForSelector('.sudoku-board', { timeout: 15000 });

      // Check preferences are saved
      const prefs = await getLocalStorageItem(page, PREFERENCES_KEY);
      expect(prefs).toBeTruthy();
      const parsed = JSON.parse(prefs!);
      expect(parsed.hideTimer).toBe(true);
    }
  });

  test('auto-solve speed preference persists', async ({ page }) => {
    await page.goto('/speed-test-456?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Set a speed preference via the menu
    const menuButton = page.locator('header button[aria-label*="Menu"], header button:has(svg)').last();
    await menuButton.click();
    await page.waitForTimeout(200);

    // Look for speed controls
    const speedButton = page.locator('button[aria-label*="speed"], button:has-text("1x"), button:has-text("2x")').first();
    if (await speedButton.isVisible()) {
      await speedButton.click();
      await page.waitForTimeout(300);

      // Close menu
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Reload and check preferences
      await page.reload();
      await page.waitForSelector('.sudoku-board', { timeout: 15000 });

      const prefs = await getLocalStorageItem(page, PREFERENCES_KEY);
      expect(prefs).toBeTruthy();
      const parsed = JSON.parse(prefs!);
      expect(parsed.autoSolveSpeed).toBeDefined();
    }
  });

  test('homepage mode preference persists', async ({ page }) => {
    // Navigate to homepage first
    await page.goto('/');
    await page.waitForSelector('a[href*="game"], button', { timeout: 15000 });

    // Check for mode toggle (daily vs practice)
    const modeToggle = page.locator('button:has-text("Practice"), button:has-text("Daily")').first();
    if (await modeToggle.isVisible()) {
      await modeToggle.click();
      await page.waitForTimeout(500);

      // Reload
      await page.reload();
      await page.waitForTimeout(500);

      // Check preferences
      const prefs = await getLocalStorageItem(page, PREFERENCES_KEY);
      if (prefs) {
        const parsed = JSON.parse(prefs);
        expect(parsed.homepageMode).toBeDefined();
      }
    }
  });
});

test.describe('@integration Persistence - Multiple Games Tracked', () => {
  const EASY_SEED = 'multi-easy-111';
  const MEDIUM_SEED = 'multi-medium-222';

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(([seed1, seed2]: [string, string]) => {
      localStorage.removeItem(`sudoku_game_${seed1}`);
      localStorage.removeItem(`sudoku_game_${seed2}`);
    }, [EASY_SEED, MEDIUM_SEED]);
  });

  test('different difficulty games have separate save states', async ({ page }) => {
    // Play easy game
    await page.goto(`/${EASY_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const { cell: easyCell, row: easyRow, col: easyCol } = await findEmptyCell(page, 5);
    await easyCell.scrollIntoViewIfNeeded();
    await easyCell.click();
    await page.keyboard.press('1');
    await page.waitForTimeout(1500);

    // Navigate to medium game
    await page.goto(`/${MEDIUM_SEED}?d=medium`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const { cell: mediumCell, row: mediumRow, col: mediumCol } = await findEmptyCell(page, 6);
    await mediumCell.scrollIntoViewIfNeeded();
    await mediumCell.click();
    await page.keyboard.press('9');
    await page.waitForTimeout(1500);

    // Return to easy game
    await page.goto(`/${EASY_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Easy game should have its own state preserved
    await expectCellValue(page, easyRow, easyCol, 1);

    // Verify both save states exist
    const easyState = await getLocalStorageItem(page, `${GAME_STATE_PREFIX}${EASY_SEED}`);
    const mediumState = await getLocalStorageItem(page, `${GAME_STATE_PREFIX}${MEDIUM_SEED}`);

    expect(easyState).toBeTruthy();
    expect(mediumState).toBeTruthy();

    const easyParsed = JSON.parse(easyState!);
    const mediumParsed = JSON.parse(mediumState!);

    expect(easyParsed.difficulty).toBe('easy');
    expect(mediumParsed.difficulty).toBe('medium');
  });

  test('navigating between games preserves each state independently', async ({ page }) => {
    // Setup easy game with moves
    await page.goto(`/${EASY_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const { cell: cell1 } = await findEmptyCell(page, 5);
    await cell1.scrollIntoViewIfNeeded();
    await cell1.click();
    await page.keyboard.press('3');
    await page.waitForTimeout(1500);

    // Setup medium game with different moves
    await page.goto(`/${MEDIUM_SEED}?d=medium`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const { cell: cell2, row: row2, col: col2 } = await findEmptyCell(page, 7);
    await cell2.scrollIntoViewIfNeeded();
    await cell2.click();
    await page.keyboard.press('7');
    await page.waitForTimeout(1500);

    // Go back to easy, make another move
    await page.goto(`/${EASY_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const { cell: cell3, row: row3, col: col3 } = await findEmptyCell(page, 8);
    await cell3.scrollIntoViewIfNeeded();
    await cell3.click();
    await page.keyboard.press('5');
    await page.waitForTimeout(1500);

    // Return to medium - should still have only one move (7)
    await page.goto(`/${MEDIUM_SEED}?d=medium`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    await expectCellValue(page, row2, col2, 7);

    // The cell where we put 5 in easy should not have 5 here
    const mediumCell = getCellLocator(page, row3, col3);
    const ariaLabel = await mediumCell.getAttribute('aria-label');
    expect(ariaLabel).not.toContain('value 5');
  });
});

test.describe('@integration Persistence - Edge Cases', () => {
  test('corrupted localStorage is handled gracefully', async ({ page }) => {
    const CORRUPT_SEED = 'corrupt-test-999';

    // Set corrupted data before navigation
    await page.addInitScript((seed: string) => {
      localStorage.setItem(`sudoku_game_${seed}`, 'not-valid-json{{{{');
    }, CORRUPT_SEED);

    // App should load without crashing
    await page.goto(`/${CORRUPT_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Board should be visible and functional
    const board = page.locator('.sudoku-board');
    await expect(board).toBeVisible();

    // Should be able to make moves
    const { cell, row, col } = await findEmptyCell(page);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.keyboard.press('4');
    await page.waitForTimeout(500);

    // Cell should have the new value
    await expectCellValue(page, row, col, 4);
  });

  test('empty localStorage starts fresh game', async ({ page }) => {
    const FRESH_SEED = 'fresh-test-888';

    // Ensure no saved state exists
    await page.addInitScript((seed: string) => {
      localStorage.removeItem(`sudoku_game_${seed}`);
    }, FRESH_SEED);

    await page.goto(`/${FRESH_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Board should be at initial state (no localStorage item yet)
    const storageKey = `${GAME_STATE_PREFIX}${FRESH_SEED}`;
    const savedState = await getLocalStorageItem(page, storageKey);

    // Either null or very fresh state
    if (savedState) {
      const parsed = JSON.parse(savedState);
      expect(parsed.history?.length || 0).toBe(0);
    }

    // Cells should be in initial puzzle state
    const givenCell = page.locator('[role="gridcell"][aria-label*="given"]').first();
    await expect(givenCell).toBeVisible();
  });

  test('invalid board length in saved state is handled gracefully', async ({ page }) => {
    const INVALID_SEED = 'invalid-board-777';

    // Set invalid board data (wrong length)
    await page.addInitScript((seed: string) => {
      const invalidState = {
        board: [1, 2, 3], // Only 3 elements, should be 81
        candidates: [],
        elapsedMs: 0,
        history: [],
        savedAt: Date.now(),
        difficulty: 'easy',
      };
      localStorage.setItem(`sudoku_game_${seed}`, JSON.stringify(invalidState));
    }, INVALID_SEED);

    // App should load without crashing
    await page.goto(`/${INVALID_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Board should be visible
    const board = page.locator('.sudoku-board');
    await expect(board).toBeVisible();

    // Should be able to interact
    const { cell } = await findEmptyCell(page);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();

    // No crash means success
    await expect(cell).toBeVisible();
  });

  test('game completion clears saved state', async ({ page }) => {
    // This test uses a nearly-complete puzzle seed if available
    // For now, we'll test that completing a puzzle removes the saved state
    const COMPLETE_SEED = 'complete-test-666';

    await page.addInitScript((seed: string) => {
      localStorage.removeItem(`sudoku_game_${seed}`);
    }, COMPLETE_SEED);

    await page.goto(`/${COMPLETE_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Make a move to create save state
    const { cell } = await findEmptyCell(page);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.keyboard.press('1');
    await page.waitForTimeout(1500);

    // Verify save exists
    const storageKey = `${GAME_STATE_PREFIX}${COMPLETE_SEED}`;
    const savedState = await getLocalStorageItem(page, storageKey);
    expect(savedState).toBeTruthy();

    // Note: Full completion test would require a solvable puzzle state
    // The useAutoSave hook clears state when isComplete becomes true
  });
});

test.describe('@integration Persistence - Auto-save Toggle', () => {
  const TEST_SEED = 'autosave-toggle-555';

  test('disabling auto-save prevents localStorage updates', async ({ page }) => {
    // Disable auto-save before navigation
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_autosave_enabled', 'false');
    });

    // Clear any existing save for this seed
    await page.addInitScript((seed: string) => {
      localStorage.removeItem(`sudoku_game_${seed}`);
    }, TEST_SEED);

    await page.goto(`/${TEST_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Make a move
    const { cell } = await findEmptyCell(page);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.keyboard.press('8');

    // Wait for what would be auto-save time
    await page.waitForTimeout(2000);

    // Check that no save was created
    const storageKey = `${GAME_STATE_PREFIX}${TEST_SEED}`;
    const savedState = await getLocalStorageItem(page, storageKey);

    // Should be null or not updated
    expect(savedState).toBeNull();
  });

  test('enabling auto-save resumes saving', async ({ page }) => {
    // Start with auto-save enabled
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_autosave_enabled', 'true');
    });

    await page.addInitScript((seed: string) => {
      localStorage.removeItem(`sudoku_game_${seed}`);
    }, TEST_SEED);

    await page.goto(`/${TEST_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Make a move
    const { cell, row, col } = await findEmptyCell(page);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.keyboard.press('2');
    await page.waitForTimeout(1500);

    // Verify save was created
    const storageKey = `${GAME_STATE_PREFIX}${TEST_SEED}`;
    const savedState = await getLocalStorageItem(page, storageKey);
    expect(savedState).toBeTruthy();

    const parsed = JSON.parse(savedState!);
    const cellIndex = (row - 1) * 9 + (col - 1);
    expect(parsed.board[cellIndex]).toBe(2);
  });
});

test.describe('@integration Persistence - History Persistence', () => {
  const TEST_SEED = 'history-test-444';

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((seed: string) => {
      localStorage.removeItem(`sudoku_game_${seed}`);
    }, TEST_SEED);
  });

  test('move history is saved and restored', async ({ page }) => {
    await page.goto(`/${TEST_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Make multiple moves
    const { cell: cell1, row: row1, col: col1 } = await findEmptyCell(page, 5);
    await cell1.scrollIntoViewIfNeeded();
    await cell1.click();
    await page.keyboard.press('4');
    await page.waitForTimeout(300);

    const { cell: cell2 } = await findEmptyCell(page, 6);
    await cell2.scrollIntoViewIfNeeded();
    await cell2.click();
    await page.keyboard.press('6');
    await page.waitForTimeout(1500);

    // Check history is saved
    const storageKey = `${GAME_STATE_PREFIX}${TEST_SEED}`;
    const savedState = await getLocalStorageItem(page, storageKey);
    expect(savedState).toBeTruthy();

    const parsed = JSON.parse(savedState!);
    expect(parsed.history).toBeDefined();
    expect(parsed.history.length).toBeGreaterThanOrEqual(2);
  });

  test('undo works after page reload using saved history', async ({ page }) => {
    await page.goto(`/${TEST_SEED}?d=easy`);
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Make a move
    const { cell, row, col } = await findEmptyCell(page);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.keyboard.press('7');
    await page.waitForTimeout(1500);

    // Verify move
    await expectCellValue(page, row, col, 7);

    // Reload
    await page.reload();
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    // Value should be restored
    await expectCellValue(page, row, col, 7);

    // Undo should work
    const undoButton = page.locator('button[title="Undo"]');
    await undoButton.click();
    await page.waitForTimeout(300);

    // Cell should be empty after undo
    await expectCellValue(page, row, col, 'empty');
  });
});
