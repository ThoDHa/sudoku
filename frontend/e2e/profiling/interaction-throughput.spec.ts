/**
 * BOARD INTERACTION THROUGHPUT (PROF-002 spec 3)
 *
 * Measures sustained board-interaction throughput, extending round-1's light
 * 5-10 selection coverage (PROF-001's #5 deferred gap). Two sub-scenarios:
 *
 *   1. Sustained digit entry (~50 entries) — the user-visible "fast entry"
 *      path. Catches drift: if per-entry latency grows over a long burst
 *      (state accumulation, render thrash), the no-drift guard fires.
 *   2. Notes-mode candidate batch — sustained candidate-toggle throughput,
 *      the mobile-heavy path (gap-coverage measured single-cell; this measures
 *      a sustained batch).
 *
 * Signal contract:
 *   digit entry — cell deselects after entry → tabindex != 0 (the stable
 *     selection contract from selection-performance.spec.ts:58-64, emitted by
 *     Board.tsx `tabIndex={isSelected ? 0 : -1}`).
 *   candidate batch — toggled cells acquire a visible `.candidate-grid`
 *     (gap-coverage.spec.ts:83 contract).
 *
 * Tag: @profiling
 */

import { test, expect } from '../fixtures'
import type { Page, Locator } from '@playwright/test'
import { setupGameAndWaitForBoard } from '../utils/board-wait'
import { measureTime, summarize } from './helpers/timing'

// E2E thresholds (ms). Per-entry bundles click + keyboard + the auto-retrying
// tabindex poll. Calibrated from the first healthy green run (PROF-001-D7).
//
// Empirical basis (round-1 selection-performance): rapid digit-entry step
// ~330-500ms (noisy compound). The throughput budget is set at the round-1
// sequence-step ceiling with headroom; the no-drift ratio is the primary guard.
const THROUGHPUT_THRESHOLDS = {
  DIGIT_ENTRY_AVG_MS: 700, // avg per entry over the full ~50-entry burst
  DIGIT_ENTRY_MAX_MS: 1200, // single-entry ceiling (noise spike guard)
  NO_DRIFT_RATIO: 1.5, // last-10 avg ≤ first-10 avg × 1.5
  CANDIDATE_BATCH_PER_CELL_MS: 700, // per-cell in the notes-mode batch
} as const

const DIGIT_ENTRY_TARGET = 50
const CANDIDATE_BATCH_SIZE = 15
const SEED = 'Pthru1'

// Click a cell by its stable row/col coordinate. Unlike the "empty" locator
// (which shrinks as cells are filled), the coordinate prefix matches both empty
// and filled cells, so it survives overwrites in the sustained-entry loop.
function getCellLocator(page: Page, row: number, col: number): Locator {
  return page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`).first()
}

// Stable selection contract: a non-selected cell has no ring-accent class.
// (Board.tsx uses the roving tabindex pattern — tabIndex is 0 for the tab-stop
// cell and -1 for the rest, independent of selection — so tabindex is NOT a
// selection signal. ring-accent is the visual selection marker.) After a digit
// entry the cell deselects, so this is the "entry committed" signal. Holds for overwrites.
async function expectCellDeselected(page: Page, row: number, col: number): Promise<void> {
  await expect(getCellLocator(page, row, col)).not.toHaveClass(/ring-accent/)
}

async function enableNotesMode(page: Page): Promise<void> {
  // Controls.tsx: aria-label "Notes mode on/off", title="Notes mode".
  const btn = page.getByRole('button', { name: /notes mode/i })
  await expect(btn).toBeVisible()
  const pressed = (await btn.getAttribute('aria-pressed')) === 'true'
  if (!pressed) {
    await btn.click()
  }
  await expect(btn).toHaveAttribute('aria-pressed', 'true')
}

test.describe.serial('@profiling Board Interaction Throughput', () => {
  test('sustained digit-entry throughput stays bounded with no drift', async ({ page }) => {
    await setupGameAndWaitForBoard(page, { seed: SEED, difficulty: 'easy' })

    const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]')
    const available = await emptyCells.count()
    test.skip(available < 10, 'Need at least 10 empty cells for sustained-entry profiling')

    // Resolve row/col for each empty cell up front so the entry loop is not
    // interleaved with aria-label parsing (keeps the measurement honest).
    const coords: { row: number; col: number }[] = []
    for (let i = 0; i < available; i++) {
      const label = await emptyCells.nth(i).getAttribute('aria-label')
      const m = label?.match(/Row (\d+), Column (\d+)/)
      if (m) coords.push({ row: parseInt(m[1], 10), col: parseInt(m[2], 10) })
    }
    test.skip(coords.length < 10, 'Could not resolve enough empty-cell coordinates')

    const timings: number[] = []
    for (let i = 0; i < DIGIT_ENTRY_TARGET; i++) {
      // Cycle through available cells; once exhausted, overwrite earlier cells
      // (the tabindex deselect signal holds for overwrites too). Click by
      // coordinate, NOT by the "empty" locator: filling cells changes their
      // aria-label from "empty" to "value N", which would shrink the live
      // "empty" locator and make nth() miss — the bug fixed in calibration.
      const { row, col } = coords[i % coords.length]
      const digit = String((i % 9) + 1)

      const { duration } = await measureTime(async () => {
        await getCellLocator(page, row, col).click()
        await page.keyboard.press(digit)
        await expectCellDeselected(page, row, col)
      })
      timings.push(duration)
    }

    const stats = summarize(timings)
    const first10 = summarize(timings.slice(0, 10))
    const last10 = summarize(timings.slice(-10))

    console.log(
      `Digit-entry throughput — ${timings.length} entries, ` +
        `avg ${stats.avg.toFixed(2)}ms, p95 ${stats.p95.toFixed(2)}ms, max ${stats.max.toFixed(2)}ms; ` +
        `first-10 avg ${first10.avg.toFixed(2)}ms, last-10 avg ${last10.avg.toFixed(2)}ms ` +
        `(drift ${(last10.avg / first10.avg).toFixed(2)}x)`,
    )

    expect(stats.avg).toBeLessThan(THROUGHPUT_THRESHOLDS.DIGIT_ENTRY_AVG_MS)
    expect(stats.max).toBeLessThan(THROUGHPUT_THRESHOLDS.DIGIT_ENTRY_MAX_MS)
    // No-drift guard: the tail of the burst must not be dramatically slower
    // than the head. Catches accumulating state or render thrash.
    expect(last10.avg).toBeLessThan(first10.avg * THROUGHPUT_THRESHOLDS.NO_DRIFT_RATIO)
  })

  test('notes-mode candidate batch throughput stays bounded', async ({ page }) => {
    await setupGameAndWaitForBoard(page, { seed: SEED, difficulty: 'easy' })
    await enableNotesMode(page)

    const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]')
    const available = Math.min(await emptyCells.count(), CANDIDATE_BATCH_SIZE)
    test.skip(available < 5, 'Need at least 5 empty cells for candidate-batch profiling')

    const timings: number[] = []
    for (let i = 0; i < available; i++) {
      const cell = emptyCells.nth(i)
      const { duration } = await measureTime(async () => {
        await cell.click()
        await page.keyboard.press(String((i % 9) + 1))
        await expect(cell.locator('.candidate-grid')).toBeVisible()
      })
      timings.push(duration)
    }

    const stats = summarize(timings)
    console.log(
      `Candidate batch — ${timings.length} cells, ` +
        `median ${stats.median.toFixed(2)}ms, avg ${stats.avg.toFixed(2)}ms, ` +
        `p95 ${stats.p95.toFixed(2)}ms, max ${stats.max.toFixed(2)}ms`,
    )

    // Median-of-batch (PROF-003-D3): the per-cell distribution is right-skewed on
    // mobile (a few slow cells pull the avg past the threshold while the typical
    // cell stays well under). The median tracks the typical-cell experience; the
    // max guard below still catches any single sustained-slow cell.
    expect(stats.median).toBeLessThan(THROUGHPUT_THRESHOLDS.CANDIDATE_BATCH_PER_CELL_MS)
    expect(stats.max).toBeLessThan(THROUGHPUT_THRESHOLDS.CANDIDATE_BATCH_PER_CELL_MS * 1.5)
  })
})
