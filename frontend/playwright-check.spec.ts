import { test, expect } from '@playwright/test';

test.setTimeout(60000);

test('deployment candidate highlight test', async ({ page }) => {
  // Load deployed site
  await page.goto('https://thodha.github.io/sudoku/');

  // Wait for the board to render
  await page.waitForSelector('.sudoku-board', { timeout: 15000 });

  const cells = page.locator('.sudoku-board [role="gridcell"]');
  const count = await cells.count();
  if (count === 0) throw new Error('No grid cells found');

  // Find first empty cell (no inner text)
  let emptyIndex = -1;
  for (let i = 0; i < count; i++) {
    const t = (await cells.nth(i).innerText()).trim();
    if (t === '') { emptyIndex = i; break; }
  }
  if (emptyIndex === -1) throw new Error('No empty cell found to test');

  const cell = cells.nth(emptyIndex);
  await cell.click();

  // Toggle notes mode (Notes button uses aria-label "Notes mode")
  const notesBtn = page.getByRole('button', { name: /Notes mode/i }).first();
  await notesBtn.click();

  // Click digit 1 button to add candidate (aria-label like "Enter 1, X remaining")
  const digit1 = page.getByRole('button', { name: /Enter 1,/i }).first();
  await digit1.click();

  // Give the UI a moment
  await page.waitForTimeout(250);

  // Click same digit again to remove candidate
  await digit1.click();
  await page.waitForTimeout(500);

  // Inspect the cell class to see if highlight classes remain
  const classAttr = await cell.getAttribute('class') || '';
  console.log('cell class after removing candidate:', classAttr);

  // Check for highlight indicators used by the app
  const stillHighlighted = classAttr.includes('cell-primary') || classAttr.includes('cell-secondary') || classAttr.includes('accent-light') || classAttr.includes('cell-selected');

  expect(stillHighlighted).toBeFalsy();
});
