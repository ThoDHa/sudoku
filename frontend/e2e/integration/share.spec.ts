import { test, expect } from '@playwright/test'
import { setupGameAndWaitForBoard, waitForBoard } from '../utils/board-wait'
import { selectCell } from '../utils/selectCell'

// The clipboard-read permission is Chromium-only; WebKit/mobile projects reject
// it, so these tests are desktop-only. The receiving-side overlay they exercise
// is browser-agnostic.
const CLIPBOARD_UNSUPPORTED = ['pixel-5', 'iphone-12']

async function readClipboard(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText())
}

// Fill the first empty cell in a row and return its 1-indexed coordinates and the
// value that landed, so a later assertion can look for it after a round-trip.
async function fillFirstEmptyCell(
  page: import('@playwright/test').Page,
  row: number,
  digit: string,
): Promise<{ row: number; col: number; value: string }> {
  const empty = page
    .locator(`[role="gridcell"][aria-label*="Row ${row}"][aria-label*="empty"]`)
    .first()
  const label = await empty.getAttribute('aria-label')
  const match = label?.match(/Row (\d+), Column (\d+)/)
  if (!match) {
    throw new Error(`Could not parse an empty cell in row ${row}: ${label}`)
  }
  const col = Number(match[2])
  await selectCell(page, row, col)
  await page.keyboard.press(digit)

  const filled = page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`)
  await expect(filled).toHaveAttribute('aria-label', /value \d/)
  const filledLabel = await filled.getAttribute('aria-label')
  const value = filledLabel?.match(/value (\d)/)?.[1]
  if (!value) {
    throw new Error(`Cell did not accept a value: ${filledLabel}`)
  }
  return { row, col, value }
}

async function shareVia(page: import('@playwright/test').Page, option: string): Promise<string> {
  await page.locator('[data-share-button] button').first().click()
  await page.getByText(option, { exact: true }).click()
  await expect(page.locator('.validation-message')).toContainText('copied to clipboard')
  return readClipboard(page)
}

test.describe('@integration Share to a friend', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      CLIPBOARD_UNSUPPORTED.includes(testInfo.project.name),
      'clipboard-read permission is unsupported on WebKit/mobile projects',
    )
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
    await setupGameAndWaitForBoard(page, { difficulty: 'easy' })
  })

  test('the two share options produce different links (puzzle-only vs current-state)', async ({
    page,
  }) => {
    await fillFirstEmptyCell(page, 5, '4')

    const puzzleUrl = await shareVia(page, 'Share puzzle')
    // Portable seed link with the difficulty pinned, and NO state payload.
    expect(puzzleUrl).toContain('?d=easy')
    expect(puzzleUrl).not.toContain('&s=')

    const stateUrl = await shareVia(page, 'Share my current game')
    // Same seed link, now carrying the player's progress in the s param.
    expect(stateUrl).toContain('&s=')
  })

  test('opening a shared current-game link reproduces my entry', async ({ page }) => {
    const { row, col, value } = await fillFirstEmptyCell(page, 5, '4')

    const stateUrl = await shareVia(page, 'Share my current game')
    expect(stateUrl).toContain('&s=')

    // Open the link as the recipient would.
    await page.goto(stateUrl)
    await waitForBoard(page)

    // The cell the sharer filled is now filled with the same value on the copy.
    const cell = page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`)
    await expect(cell).toHaveAttribute('aria-label', new RegExp(`value ${value}`))
  })
})
