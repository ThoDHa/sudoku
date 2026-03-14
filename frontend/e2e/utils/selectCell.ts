import { test, Page, Locator, expect, TestInfo } from '@playwright/test';

const TOUCH_PROJECTS = new Set(['pixel-5', 'iphone-12']);

/**
 * Determine whether the current test is running on a touch device project.
 * Accepts an optional TestInfo; falls back to test.info() when omitted
 * (works from any function running inside a Playwright test).
 */
export function isTouchProject(testInfo?: TestInfo): boolean {
  const info = testInfo ?? test.info();
  return TOUCH_PROJECTS.has(info.project.name);
}

/**
 * Tap or click a locator based on whether the test runs on a touch device.
 * Use this for inline cell interactions that don't need the full selectCell
 * focus verification flow.
 *
 * testInfo is optional: when omitted the function reads test.info() automatically.
 */
export async function tapOrClick(locator: Locator, testInfo?: TestInfo): Promise<void> {
  if (isTouchProject(testInfo)) {
    await locator.tap();
  } else {
    await locator.click();
  }
}

/**
 * selectCell
 * - Ensures the cell at (row, col) is scrolled into view, activated (tap on
 *   touch devices, click on desktop), and focused
 * - Throws if the element cannot be focused
 * - Returns the Playwright Locator for the cell so callers can continue interacting
 */
export async function selectCell(page: Page, row: number, col: number): Promise<Locator> {
  const sel = `[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`;
  const cell = page.locator(sel).first();
  await cell.scrollIntoViewIfNeeded();
  await tapOrClick(cell);

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
