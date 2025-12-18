import { test, expect } from '@playwright/test';
import PlaywrightUISDK from './sdk/playwright-ui';

test('deployment sdk candidate highlight test', async ({ page }) => {
  const baseUrl = 'https://thodha.github.io/sudoku';
  const sdk = new PlaywrightUISDK({ page, baseUrl });

  // Instead of navigating directly to a game URL (which may 404 on GitHub Pages),
  // load the homepage and start an Easy game via the UI so the SPA routing works.
  await sdk.health();
  const pageObj = sdk.getPage();

  // Wait for homepage to hydrate
  await pageObj.waitForTimeout(1500);

  // Click the Easy card's Play button
  await pageObj.waitForSelector('text=Easy', { timeout: 15000 });
  const easyCard = pageObj.locator('div:has-text("Easy")').first();
  const playBtn = easyCard.locator('button:has-text("Play")').first();
  await expect(playBtn).toBeVisible({ timeout: 15000 });
  await playBtn.click();

  // Wait for board
  await pageObj.waitForSelector('.sudoku-cell', { timeout: 20000 });

  // Read current board and find an empty cell
  const board = await sdk.readBoardFromDOM();
  let emptyIndex = board.findIndex(v => v === 0);
  if (emptyIndex === -1) throw new Error('No empty cell found');

  // Click the cell
  await sdk.clickCell(emptyIndex);

  // Toggle notes mode via UI button
  const notesBtn = pageObj.getByRole('button', { name: /Notes mode/i }).first();
  await expect(notesBtn).toBeVisible({ timeout: 5000 });
  await notesBtn.click();

  // Enter digit '1' to add candidate, then again to remove
  await sdk.enterDigit(1);
  await pageObj.waitForTimeout(250);
  await sdk.enterDigit(1);
  await pageObj.waitForTimeout(500);

  // Inspect the cell's classes
  const classAttr = await pageObj.locator('.sudoku-cell').nth(emptyIndex).getAttribute('class') || '';
  console.log('cell class after removing candidate:', classAttr);

  const stillHighlighted = classAttr.includes('cell-primary') || classAttr.includes('cell-secondary') || classAttr.includes('accent-light') || classAttr.includes('cell-selected');
  expect(stillHighlighted).toBeFalsy();
});
