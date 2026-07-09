import { test, expect } from '@playwright/test'
import { setupGameAndWaitForBoard, waitForBoard } from '../utils/board-wait'
import { selectCell } from '../utils/selectCell'

// These tests capture the shared link through a clipboard stub (see beforeEach),
// so they do not depend on the OS clipboard. They remain desktop-only because the
// mobile projects have unrelated touch/viewport concerns; the receiving-side
// overlay they exercise is browser-agnostic.
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
    // Headless/containerized Chromium may not expose navigator.clipboard even with
    // permissions granted (the CI Docker sidecar does not), which makes the app
    // fall back to execCommand and makes readText() throw. Install a capturing stub
    // so the app's writeText and the test's readText work identically everywhere.
    await page.addInitScript(() => {
      let copied = ''
      const stub = {
        writeText: (text: string) => {
          copied = String(text)
          return Promise.resolve()
        },
        readText: () => Promise.resolve(copied),
      }
      try {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: stub })
      } catch {
        try {
          navigator.clipboard.writeText = stub.writeText
          navigator.clipboard.readText = stub.readText
        } catch {
          /* leave as-is; the assertions will surface any failure */
        }
      }
    })
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

  test('reopening a shared link with local progress prompts, and Keep mine preserves it', async ({
    page,
  }) => {
    const shared = await fillFirstEmptyCell(page, 5, '4')
    const stateUrl = await shareVia(page, 'Share my current game')

    // A further move that exists only locally, after the link was created.
    const later = await fillFirstEmptyCell(page, 6, '5')
    // Let the debounced autosave persist the later move before we navigate away.
    await page.waitForTimeout(700)

    await page.goto(stateUrl)
    await waitForBoard(page)

    // The recipient has their own progress, so they are asked to choose.
    await expect(page.getByText('Open shared position?')).toBeVisible()
    await page.getByRole('button', { name: 'Keep mine' }).click()

    // Their later, local-only move survives, and the one-time params are consumed.
    const laterCell = page.locator(
      `[role="gridcell"][aria-label^="Row ${later.row}, Column ${later.col}"]`,
    )
    await expect(laterCell).toHaveAttribute('aria-label', new RegExp(`value ${later.value}`))
    expect(new URL(page.url()).searchParams.has('s')).toBe(false)
    void shared
  })

  test('reopening a shared link and choosing Open shared discards local progress', async ({
    page,
  }) => {
    const shared = await fillFirstEmptyCell(page, 5, '4')
    const stateUrl = await shareVia(page, 'Share my current game')

    const later = await fillFirstEmptyCell(page, 6, '5')
    await page.waitForTimeout(700)

    await page.goto(stateUrl)
    await waitForBoard(page)

    await expect(page.getByText('Open shared position?')).toBeVisible()
    await page.getByRole('button', { name: 'Open shared' }).click()

    // The shared move is present; the later local-only move is gone.
    const sharedCell = page.locator(
      `[role="gridcell"][aria-label^="Row ${shared.row}, Column ${shared.col}"]`,
    )
    await expect(sharedCell).toHaveAttribute('aria-label', new RegExp(`value ${shared.value}`))
    const laterCell = page.locator(
      `[role="gridcell"][aria-label^="Row ${later.row}, Column ${later.col}"]`,
    )
    await expect(laterCell).toHaveAttribute('aria-label', /empty/)
  })
})
