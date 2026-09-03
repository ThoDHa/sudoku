/**
 * SELECTION PERFORMANCE REGRESSION TESTS
 *
 * Intent: guard against selection-state and outside-click-detection changes
 * that regress interaction speed. Every test measures a REAL user-facing
 * interaction end to end (including Playwright automation overhead, which is
 * part of what an E2E perf guard must tolerate).
 *
 * Measurement contract: selection state is asserted via the
 * stable `tabindex` contract emitted by Board.tsx (`tabIndex={isSelected ? 0 :
 * -1}`), the same signal used by the `selectCell` helper. We deliberately do
 * NOT time `expect(...).toHaveClass(/ring-2.*ring-accent/)` style assertions:
 * that would measure Playwright's own assertion-polling latency, not the app.
 *
 * Threshold policy: absolute ms guards, documented as E2E
 * thresholds. All configured projects are chromium, so there is no webkit
 * multiplier (the old WEBKIT_MULTIPLIER branch never fired and was removed).
 *
 * Tag: @performance @regression @selection
 */

import { test, expect } from '../fixtures'
import type { Page, Locator } from '@playwright/test'
import { setupGameAndWaitForBoard } from '../utils/board-wait'
import { measureTime, summarize, measureMedian } from './helpers/timing'

// E2E thresholds (ms). These bundle Playwright browser-automation overhead +
// React mount + the auto-retrying assertion poll cadence, so they are
// deliberately looser than the ~30-60ms React render a unit test sees. They
// exist to catch REGRESSIONS (a change that roughly doubles interaction
// latency), not to claim absolute speed.
//
// Empirical basis (chrome-desktop, healthy build, ):
//   single selection ~320ms (first-run mount); rapid-select avg ~190ms/cell
//   single digit entry ~150ms; overwrite avg ~310ms, overwrite max ~470ms
//   single outside-click ~170ms; outside-click cycle ~360ms
//   rapid digit-entry STEP (click+digit+2 polls) ~330-500ms (noisy — compound)
//   5-step mixed sequence ~1300ms
// Single-interaction thresholds are ~2x the measured typical. The compound
// step budget accommodates the stacked auto-retry polls of a 5-step sequence
// while still tripping on a ≥2x regression.
const PERFORMANCE_THRESHOLDS = {
  SELECTION_RESPONSE: 500, // single cell selection (incl. first-run mount)
  DIGIT_ENTRY_RESPONSE: 350, // single digit entry + deselection
  OUTSIDE_CLICK_RESPONSE: 500, // single outside-click; outside-click cycle avg
  DIGIT_ENTRY_SEQUENCE_STEP: 700, // per-step in a 5-step rapid digit-entry / overwrite sequence
  RAPID_INTERACTION: 2500, // full 5-step mixed sequence
} as const

const SEED = 'Pselperf1'

function getCellLocator(page: Page, row: number, col: number): Locator {
  return page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`).first()
}

// Stable selection contract: selected cell is focusable (tabindex 0), any
// non-selected state is not focusable-as-selected (tabindex != 0).
async function expectCellSelected(cell: Locator): Promise<void> {
  await expect(cell).toHaveAttribute('tabindex', '0')
}

async function expectCellNotSelected(cell: Locator): Promise<void> {
  await expect(cell).not.toHaveAttribute('tabindex', '0')
}

async function findEmptyCell(page: Page): Promise<{ row: number; col: number } | null> {
  const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]')
  if ((await emptyCells.count()) === 0) return null
  const firstEmpty = emptyCells.first()
  const ariaLabel = await firstEmpty.getAttribute('aria-label')
  const match = ariaLabel?.match(/Row (\d+), Column (\d+)/)
  return match ? { row: parseInt(match[1], 10), col: parseInt(match[2], 10) } : null
}

interface OutsidePoint {
  name: string
  x: number
  y: number
}

/**
 * Returns one viewport-clamped point guaranteed to be OUTSIDE the board and
 * INSIDE the viewport, for a single outside-click measurement (
 * the old fixed padding=50 could land off-screen on mobile).
 */
async function getSafeOutsidePoint(page: Page): Promise<OutsidePoint> {
  const points = await getSafeOutsidePoints(page)
  return points[0] ?? { name: 'fallback', x: 4, y: 4 }
}

/**
 * Returns up to 4 outside-board points, one per side that actually has space
 * within the viewport. Lets the "all directions" test run only on directions
 * the viewport can host (mobile-safe).
 */
async function getSafeOutsidePoints(page: Page): Promise<OutsidePoint[]> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 }
  const board = page.locator('.sudoku-board').first()
  const box = await board.boundingBox()
  const margin = 6
  const points: OutsidePoint[] = []

  if (!box) return [{ name: 'top', x: viewport.width / 2, y: margin }]

  const insideBoard = (x: number, y: number) =>
    x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  // Above
  const aboveY = clamp(box.y - 6, margin, viewport.height - margin)
  if (!insideBoard(viewport.width / 2, aboveY)) {
    points.push({ name: 'above', x: viewport.width / 2, y: aboveY })
  }
  // Below
  const belowY = clamp(box.y + box.height + 6, margin, viewport.height - margin)
  if (!insideBoard(viewport.width / 2, belowY)) {
    points.push({ name: 'below', x: viewport.width / 2, y: belowY })
  }
  // Left
  const leftX = clamp(box.x - 6, margin, viewport.width - margin)
  if (!insideBoard(leftX, box.y + box.height / 2)) {
    points.push({ name: 'left', x: leftX, y: box.y + box.height / 2 })
  }
  // Right
  const rightX = clamp(box.x + box.width + 6, margin, viewport.width - margin)
  if (!insideBoard(rightX, box.y + box.height / 2)) {
    points.push({ name: 'right', x: rightX, y: box.y + box.height / 2 })
  }

  return points.length > 0 ? points : [{ name: 'top', x: viewport.width / 2, y: margin }]
}

// Serialized because these are latency measurements: parallel workers steal CPU
// and corrupt the timings (confirmed: iphone-12 tests pass in isolation but
// flake under fullyParallel load). Profiling must measure the app, not sibling
// tests.
test.describe.serial('@performance Selection Performance - No Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Seeded puzzle ( /H3) for deterministic empty-cell layout.
    await setupGameAndWaitForBoard(page, { seed: SEED, difficulty: 'easy' })
  })

  test.describe('Cell Selection Performance', () => {
    test('cell selection responds within performance threshold', async ({ page }) => {
      const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]')
      const total = await emptyCells.count()
      test.skip(total < 4, 'Need at least 4 empty cells (1 warmup + 3 samples) for median sampling')
      const samples = Math.min(total - 1, 5)

      // Warmup: the first click on a fresh page pays JIT compile + React mount.
      // Exclude it so a cold page (isolated run, or first test in a file) does
      // not skew the median.
      const warmupCell = emptyCells.nth(total - 1)
      await warmupCell.click()
      await expectCellSelected(warmupCell)

      let i = 0
      const { median, stats } = await measureMedian(async () => {
        const cell = emptyCells.nth(i++)
        await cell.click()
        await expectCellSelected(cell)
      }, samples)

      console.log(
        `Cell selection — median ${median.toFixed(2)}ms over ${samples} samples ` +
          `(avg ${stats.avg.toFixed(2)}ms, max ${stats.max.toFixed(2)}ms)`,
      )
      // Median-of-N: absorbs one-off mobile env spikes that flaked
      // the single-sample guard on iphone-12, while still tripping on a sustained
      // regression (which lifts the whole distribution, median included).
      expect(median).toBeLessThan(PERFORMANCE_THRESHOLDS.SELECTION_RESPONSE)
    })

    test('multiple rapid cell selections maintain performance', async ({ page }) => {
      const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]')
      const cellCount = Math.min(await emptyCells.count(), 10)
      test.skip(cellCount < 5, 'Need at least 5 empty cells for performance testing')

      const { duration } = await measureTime(async () => {
        for (let i = 0; i < 5; i++) {
          const cell = emptyCells.nth(i)
          await cell.click()
          await expectCellSelected(cell)
        }
      })

      const avgPerSelection = duration / 5
      console.log(`Average selection time: ${avgPerSelection.toFixed(2)}ms per cell`)
      expect(avgPerSelection).toBeLessThan(PERFORMANCE_THRESHOLDS.SELECTION_RESPONSE)
    })

    test('selection performance stable across different board regions', async ({ page }) => {
      const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]')
      const cellCount = Math.min(await emptyCells.count(), 5)

      const timings: number[] = []
      for (let i = 0; i < cellCount; i++) {
        const cell = emptyCells.nth(i)
        const { duration } = await measureTime(async () => {
          await cell.click()
          await expectCellSelected(cell)
        })
        timings.push(duration)
      }

      const stats = summarize(timings)
      console.log(`Region timings: ${timings.map((t) => t.toFixed(2)).join(', ')}ms`)
      console.log(`Avg: ${stats.avg.toFixed(2)}ms, Max: ${stats.max.toFixed(2)}ms`)
      expect(stats.avg).toBeLessThan(PERFORMANCE_THRESHOLDS.SELECTION_RESPONSE)
      expect(stats.max).toBeLessThan(PERFORMANCE_THRESHOLDS.SELECTION_RESPONSE * 1.5)
    })
  })

  test.describe('Digit Entry Performance', () => {
    test('digit entry and deselection completes within threshold', async ({ page }) => {
      const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]')
      const samples = Math.min(await emptyCells.count(), 5)
      test.skip(samples < 3, 'Need at least 3 empty cells for median sampling')

      const timings: number[] = []
      for (let i = 0; i < samples; i++) {
        const cell = emptyCells.nth(i)
        await cell.click()
        await expectCellSelected(cell)
        const { duration } = await measureTime(async () => {
          await page.keyboard.press(String((i % 9) + 1))
          await expectCellNotSelected(cell)
        })
        timings.push(duration)
      }

      const stats = summarize(timings)
      console.log(
        `Digit entry — median ${stats.median.toFixed(2)}ms over ${samples} samples ` +
          `(avg ${stats.avg.toFixed(2)}ms, max ${stats.max.toFixed(2)}ms)`,
      )
      expect(stats.median).toBeLessThan(PERFORMANCE_THRESHOLDS.DIGIT_ENTRY_RESPONSE)
    })

    test('rapid digit entry sequence maintains performance', async ({ page }) => {
      const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]')
      const cellCount = Math.min(await emptyCells.count(), 5)
      test.skip(cellCount < 5, 'Need at least 5 empty cells for performance testing')

      const digits = ['1', '2', '3', '4', '5']

      const { duration } = await measureTime(async () => {
        for (let i = 0; i < 5; i++) {
          const cell = emptyCells.nth(i)
          await cell.click()
          await page.keyboard.press(digits[i])
          await expectCellNotSelected(cell)
        }
      })

      const avgPerDigit = duration / 5
      console.log(`Average digit entry time: ${avgPerDigit.toFixed(2)}ms per digit`)
      // Compound step (click+digit+2 auto-retry polls) is noisier than single;
      // use the sequence-step budget.
      expect(avgPerDigit).toBeLessThan(PERFORMANCE_THRESHOLDS.DIGIT_ENTRY_SEQUENCE_STEP)
    })

    test('digit overwriting performance remains stable', async ({ page }) => {
      const emptyCell = await findEmptyCell(page)
      test.skip(!emptyCell, 'No empty cells available for testing')

      const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col)
      const digits = ['1', '2', '3', '4', '5']

      await cell.click()
      await page.keyboard.press('9')

      const timings: number[] = []
      for (const digit of digits) {
        const { duration } = await measureTime(async () => {
          await cell.click()
          await page.keyboard.press(digit)
          await expectCellNotSelected(cell)
        })
        timings.push(duration)
      }

      const stats = summarize(timings)
      console.log(`Overwrite timings: ${timings.map((t) => t.toFixed(2)).join(', ')}ms`)
      console.log(`Avg: ${stats.avg.toFixed(2)}ms, Max: ${stats.max.toFixed(2)}ms`)
      // Same compound-step shape as the rapid digit-entry sequence (click+digit+
      // deselect-poll per iteration), so it uses the sequence-step budget.
      expect(stats.avg).toBeLessThan(PERFORMANCE_THRESHOLDS.DIGIT_ENTRY_SEQUENCE_STEP)
      expect(stats.max).toBeLessThan(PERFORMANCE_THRESHOLDS.DIGIT_ENTRY_SEQUENCE_STEP * 1.5)
    })
  })

  test.describe('Outside-Click Detection Performance', () => {
    test('outside-click detection responds within threshold', async ({ page }) => {
      const emptyCell = await findEmptyCell(page)
      test.skip(!emptyCell, 'No empty cells available for testing')

      const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col)
      const outside = await getSafeOutsidePoint(page)

      const timings: number[] = []
      for (let i = 0; i < 5; i++) {
        await cell.click()
        await expectCellSelected(cell)
        const { duration } = await measureTime(async () => {
          await page.mouse.click(outside.x, outside.y)
          await expectCellNotSelected(cell)
        })
        timings.push(duration)
      }

      const stats = summarize(timings)
      console.log(
        `Outside-click (${outside.name}) — median ${stats.median.toFixed(2)}ms over 5 samples ` +
          `(avg ${stats.avg.toFixed(2)}ms, max ${stats.max.toFixed(2)}ms)`,
      )
      expect(stats.median).toBeLessThan(PERFORMANCE_THRESHOLDS.OUTSIDE_CLICK_RESPONSE)
    })

    test('outside-click performance consistent across available directions', async ({ page }) => {
      const emptyCell = await findEmptyCell(page)
      test.skip(!emptyCell, 'No empty cells available for testing')

      const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col)
      const points = await getSafeOutsidePoints(page)
      test.skip(points.length < 2, 'Viewport too small to test multiple outside-click directions')

      const timings: { direction: string; duration: number }[] = []
      for (const point of points) {
        await cell.click()
        await expectCellSelected(cell)

        const { duration } = await measureTime(async () => {
          await page.mouse.click(point.x, point.y)
          await expectCellNotSelected(cell)
        })
        timings.push({ direction: point.name, duration })
      }

      const stats = summarize(timings.map((t) => t.duration))
      console.log('Outside-click timings by direction:')
      timings.forEach((t) => console.log(`  ${t.direction}: ${t.duration.toFixed(2)}ms`))
      console.log(`Avg: ${stats.avg.toFixed(2)}ms, Max: ${stats.max.toFixed(2)}ms`)
      expect(stats.avg).toBeLessThan(PERFORMANCE_THRESHOLDS.OUTSIDE_CLICK_RESPONSE)
      expect(stats.max).toBeLessThan(PERFORMANCE_THRESHOLDS.OUTSIDE_CLICK_RESPONSE * 1.5)
    })

    test('rapid outside-click sequence maintains performance', async ({ page }) => {
      // Genuine outside-click sequence: reselect + click outside
      // repeatedly, not just cell clicks.
      const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]')
      const cellCount = Math.min(await emptyCells.count(), 5)
      test.skip(cellCount < 2, 'Need at least 2 empty cells for outside-click sequence')
      const outside = await getSafeOutsidePoint(page)

      const { duration } = await measureTime(async () => {
        for (let i = 0; i < cellCount; i++) {
          const cell = emptyCells.nth(i)
          await cell.click()
          await expectCellSelected(cell)
          await page.mouse.click(outside.x, outside.y)
          await expectCellNotSelected(cell)
        }
      })

      const avgPerCycle = duration / cellCount
      console.log(
        `Outside-click sequence: ${duration.toFixed(2)}ms total, ${avgPerCycle.toFixed(2)}ms avg/cycle`,
      )
      // Compound 2-poll step (select-poll + deselect-poll); use the step budget.
      expect(avgPerCycle).toBeLessThan(PERFORMANCE_THRESHOLDS.DIGIT_ENTRY_SEQUENCE_STEP)
    })
  })

  test.describe('Mixed Interaction Performance', () => {
    test('complex interaction sequence completes within threshold', async ({ page }) => {
      // Genuine mixed sequence: select + digit + outside-click.
      const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]')
      const cellCount = Math.min(await emptyCells.count(), 5)
      test.skip(cellCount < 3, 'Need at least 3 empty cells for mixed sequence')
      const outside = await getSafeOutsidePoint(page)

      const { duration } = await measureTime(async () => {
        for (let i = 0; i < cellCount; i++) {
          const cell = emptyCells.nth(i)
          await cell.click()
          await expectCellSelected(cell)
          await page.keyboard.press(String((i % 9) + 1))
          await expectCellNotSelected(cell)
        }
        await page.mouse.click(outside.x, outside.y)
      })

      console.log(`Mixed sequence: ${duration.toFixed(2)}ms total`)
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.RAPID_INTERACTION)
    })
  })

  test.describe('Memory and Resource Usage', () => {
    test('selection state changes do not cause memory leaks', async ({ page }) => {
      const emptyCell = await findEmptyCell(page)
      test.skip(!emptyCell, 'No empty cells available for testing')

      const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col)
      const outside = await getSafeOutsidePoint(page)

      const initialMemory = await page.evaluate(() => {
        return 'memory' in performance
          ? ((performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
              ?.usedJSHeapSize ?? 0)
          : 0
      })

      for (let i = 0; i < 100; i++) {
        await cell.click()
        await page.keyboard.press(String((i % 9) + 1))
        if (i % 10 === 0) {
          await page.mouse.click(outside.x, outside.y)
        }
      }

      const finalMemory = await page.evaluate(() => {
        return 'memory' in performance
          ? ((performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
              ?.usedJSHeapSize ?? 0)
          : 0
      })

      if (initialMemory > 0 && finalMemory > 0) {
        const memoryIncreasePercent = ((finalMemory - initialMemory) / initialMemory) * 100
        console.log(
          `Memory - Initial: ${initialMemory}, Final: ${finalMemory} (${memoryIncreasePercent.toFixed(2)}%)`,
        )
        // Allows for normal GC delays; a leak would blow past this.
        expect(memoryIncreasePercent).toBeLessThan(50)
      }
    })
  })

  test.describe('Performance Monitoring and Reporting', () => {
    test('generate performance baseline report', async ({ page }) => {
      const selectionTimings: number[] = []
      const digitEntryTimings: number[] = []

      const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]')
      const cellCount = Math.min(await emptyCells.count(), 5)
      test.skip(cellCount < 2, 'Need at least 2 empty cells for baseline report')

      for (let i = 0; i < cellCount; i++) {
        const cell = emptyCells.nth(i)
        const { duration } = await measureTime(async () => {
          await cell.click()
          await expectCellSelected(cell)
        })
        selectionTimings.push(duration)
      }

      for (let i = 0; i < cellCount; i++) {
        const cell = emptyCells.nth(i)
        await cell.click()
        const { duration } = await measureTime(async () => {
          await page.keyboard.press(String((i % 9) + 1))
          await expectCellNotSelected(cell)
        })
        digitEntryTimings.push(duration)
      }

      const selection = summarize(selectionTimings)
      const digitEntry = summarize(digitEntryTimings)

      console.log('=== PERFORMANCE BASELINE REPORT ===')
      console.log(
        `Selection  — avg ${selection.avg.toFixed(2)}ms, p95 ${selection.p95.toFixed(2)}ms, max ${selection.max.toFixed(2)}ms`,
      )
      console.log(
        `Digit entry — avg ${digitEntry.avg.toFixed(2)}ms, p95 ${digitEntry.p95.toFixed(2)}ms, max ${digitEntry.max.toFixed(2)}ms`,
      )

      expect(selection.max).toBeLessThan(PERFORMANCE_THRESHOLDS.SELECTION_RESPONSE)
      expect(digitEntry.max).toBeLessThan(PERFORMANCE_THRESHOLDS.DIGIT_ENTRY_RESPONSE)
    })
  })
})
