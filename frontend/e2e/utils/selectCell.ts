import { Page, Locator, expect } from '@playwright/test';

/**
 * selectCell
 * - Ensures the cell at (row, col) is scrolled into view, clicked, and focused
 * - Throws if the element cannot be focused
 * - Returns the Playwright Locator for the cell so callers can continue interacting
 */
export async function selectCell(page: Page, row: number, col: number): Promise<Locator> {
  const sel = `[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`;
  const cell = page.locator(sel).first();
  await cell.scrollIntoViewIfNeeded();
  await cell.click();

  // Ensure tabindex is 0 which indicates the cell is focusable/selected
  await expect(cell).toHaveAttribute('tabindex', '0');

  // Try to focus explicitly and verify document.activeElement
  const focused = await page.evaluate((s: string) => {
    const el = document.querySelector(s) as HTMLElement | null;
    if (!el) return false;
    (el as HTMLElement).focus();
    return document.activeElement === el;
  }, sel);

  if (!focused) {
    throw new Error(`selectCell: failed to focus cell ${row},${col}`);
  }

  return cell;
}
