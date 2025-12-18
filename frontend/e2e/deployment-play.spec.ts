import { test, expect } from '@playwright/test';

test('deployment playflow candidate highlight test', async ({ page }) => {
  // Go to the homepage and click the Easy card's Play button
  await page.goto('https://thodha.github.io/sudoku/', { timeout: 60000 });
  try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch {}
  // Give app time to hydrate
  await page.waitForTimeout(2000);

  // Wait for the Easy label and find the Play button inside its card
  await page.waitForSelector('text=Easy', { timeout: 30000 });
  const easyCard = page.locator('div:has-text("Easy")').first();
  const playBtn = easyCard.locator('button:has-text("Play")').first();
  await expect(playBtn).toBeVisible({ timeout: 15000 });
  await playBtn.click();

  // Wait for navigation to /game/
  await page.waitForURL(/\/game\//, { timeout: 30000 });

  // Wait for the board to render
  await page.waitForSelector('.sudoku-board', { timeout: 30000 });

  const cells = page.locator('.sudoku-board [role="gridcell"]');
  const count = await cells.count();
  if (count === 0) throw new Error('No grid cells found');

  // Find first empty cell
  let emptyIndex = -1;
  for (let i = 0; i < count; i++) {
    const t = (await cells.nth(i).innerText()).trim();
    if (t === '') { emptyIndex = i; break; }
  }
  if (emptyIndex === -1) throw new Error('No empty cell found to test');

  const cell = cells.nth(emptyIndex);
  await cell.click();

  // Toggle notes mode
  const notesBtn = page.getByRole('button', { name: /Notes mode/i }).first();
  await expect(notesBtn).toBeVisible({ timeout: 5000 });
  await notesBtn.click();

  // Click digit 1 button to add candidate
  const digit1 = page.getByRole('button', { name: /Enter 1,/i }).first();
  await expect(digit1).toBeVisible({ timeout: 5000 });
  await digit1.click();

  await page.waitForTimeout(250);

  // Click same digit again to remove candidate
  await digit1.click();
  await page.waitForTimeout(500);

  const classAttr = await cell.getAttribute('class') || '';
  console.log('cell class after removing candidate:', classAttr);

  const stillHighlighted = classAttr.includes('cell-primary') || classAttr.includes('cell-secondary') || classAttr.includes('accent-light') || classAttr.includes('cell-selected');
  expect(stillHighlighted).toBeFalsy();
});
