/**
 * PROFILING GAP COVERAGE
 *
 * New profiling tests closing coverage gaps the scout identified. Built on the
 * shared helper foundation (cdp.ts / timing.ts) so they do not duplicate the
 * plumbing extracted from the legacy specs.
 *
 * Coverage added (priority order per D5):
 *   1. Candidate-toggle (notes-mode) render — biggest gap: a full board of
 *      pencil marks is up to 729 candidate cells on mobile and was completely
 *      uncovered. Measures render latency + DOM-node growth.
 *   2. History undo/redo throughput — undo/redo cycle latency after a move
 *      sequence.
 *
 * Deferred (captured as task files, closure): hint/autosolve latency
 * (needs the hint UX feedback model from source to measure reliably from E2E —
 * the hint emits a transient annotation, not a persistent board change, so a
 * black-box "click → board-change" timer hangs on its timeout), daily-puzzle
 * load, board interaction throughput beyond selection.
 *
 * Tag: @profiling
 */

import { test, expect } from '../fixtures'
import type { Page } from '@playwright/test'
import { setupGameAndWaitForBoard } from '../utils/board-wait'
import { measureTime, summarize } from './helpers/timing'

// Empirical thresholds (ms / nodes), documented per . Calibrated on
// chrome-desktop then given headroom for mobile; revisited after the first run.
const GAP_THRESHOLDS = {
  CANDIDATE_TOGGLE_PER_CELL: 600, // notes-mode toggle of a candidate on one cell
  CANDIDATE_NODE_GROWTH_PER_MARK: 60, // a candidate mark adds a bounded number of DOM nodes
  UNDO_REDO_PER_OP: 400, // a single undo or redo
} as const

const SEED = 'Pgap1'

async function getDOMNodeCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('*').length)
}

async function notesModeButton(page: Page) {
  // Controls.tsx: aria-label flips "Notes mode on"/"off", title="Notes mode".
  return page.getByRole('button', { name: /notes mode/i })
}

async function enableNotesMode(page: Page): Promise<void> {
  const btn = await notesModeButton(page)
  await expect(btn).toBeVisible()
  const pressed = (await btn.getAttribute('aria-pressed')) === 'true'
  if (!pressed) {
    await btn.click()
  }
  await expect(btn).toHaveAttribute('aria-pressed', 'true')
}

async function findEmptyCells(page: Page, max: number) {
  const cells = page.locator('[role="gridcell"][aria-label*="empty"]')
  const count = Math.min(await cells.count(), max)
  return { cells, count }
}

test.describe.serial('@profiling Gap Coverage', () => {
  test.describe('Candidate-Toggle (Notes Mode) Render', () => {
    test('candidate-toggle render stays responsive across many cells', async ({ page }) => {
      await setupGameAndWaitForBoard(page, { seed: SEED, difficulty: 'easy' })
      await enableNotesMode(page)

      const { cells, count } = await findEmptyCells(page, 10)
      test.skip(count < 5, 'Need at least 5 empty cells for candidate-toggle profiling')

      const timings: number[] = []
      for (let i = 0; i < count; i++) {
        const cell = cells.nth(i)
        // Time: focus the cell + toggle one candidate digit + wait for the
        // candidate mark to render (stable data-value on a .candidate-grid child).
        const { duration } = await measureTime(async () => {
          await cell.click()
          await page.keyboard.press(String((i % 9) + 1))
          // Candidate marks render inside .candidate-grid; waiting for any such
          // element on this cell confirms the render completed.
          await expect(cell.locator('.candidate-grid')).toBeVisible()
        })
        timings.push(duration)
      }

      const stats = summarize(timings)
      console.log(
        `Candidate-toggle — avg ${stats.avg.toFixed(2)}ms, p95 ${stats.p95.toFixed(2)}ms, max ${stats.max.toFixed(2)}ms (${count} cells)`,
      )
      expect(stats.avg).toBeLessThan(GAP_THRESHOLDS.CANDIDATE_TOGGLE_PER_CELL)
      expect(stats.max).toBeLessThan(GAP_THRESHOLDS.CANDIDATE_TOGGLE_PER_CELL * 1.5)
    })

    test('candidate marks do not leak DOM nodes', async ({ page }) => {
      // The big mobile risk (D5 #1): 729 candidate cells worth of DOM. Verify
      // node growth is proportional to marks, not unbounded. Uses
      // document.querySelectorAll('*') (reliable on every engine) rather than
      // CDP `Nodes`, which read 0 on some emulated contexts (vacuous pass).
      await setupGameAndWaitForBoard(page, { seed: SEED, difficulty: 'easy' })
      await enableNotesMode(page)

      const before = await getDOMNodeCount(page)

      const { cells, count } = await findEmptyCells(page, 15)
      let marksToggled = 0
      for (let i = 0; i < count; i++) {
        const cell = cells.nth(i)
        await cell.click()
        // Toggle up to 3 candidate digits per cell.
        for (let d = 1; d <= 3; d++) {
          await page.keyboard.press(String(d))
          marksToggled++
        }
      }
      await expect(page.locator('.candidate-grid').first()).toBeVisible()

      const after = await getDOMNodeCount(page)
      const growthPerMark = (after - before) / Math.max(marksToggled, 1)
      console.log(
        `Candidate nodes — before ${before}, after ${after}, marks ${marksToggled}, growth/mark ${growthPerMark.toFixed(1)}`,
      )

      // Proportional, not unbounded. Each mark adds a small constant node set.
      expect(growthPerMark).toBeLessThan(GAP_THRESHOLDS.CANDIDATE_NODE_GROWTH_PER_MARK)
    })
  })

  test.describe('History Undo/Redo Throughput', () => {
    test('undo/redo cycle latency stays bounded', async ({ page }) => {
      await setupGameAndWaitForBoard(page, { seed: SEED, difficulty: 'easy' })

      const undo = page.getByRole('button', { name: /^Undo$/ })
      const redo = page.getByRole('button', { name: /^Redo$/ })

      // Make 5 moves to populate history. canUndo becomes true after a move.
      const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]')
      const placed = Math.min(await emptyCells.count(), 5)
      test.skip(placed < 3, 'Need at least 3 empty cells to build undo history')
      for (let i = 0; i < placed; i++) {
        await emptyCells.nth(i).click()
        await page.keyboard.press(String((i % 9) + 1))
      }
      await expect(undo).toBeEnabled()

      // Measure undo back to start, then redo back to end.
      const { duration: undoDuration } = await measureTime(async () => {
        for (let i = 0; i < placed; i++) {
          await undo.click()
          // canRedo enables after the first undo; keep going.
        }
      })

      await expect(redo).toBeEnabled()
      const { duration: redoDuration } = await measureTime(async () => {
        for (let i = 0; i < placed; i++) {
          await redo.click()
        }
      })

      const perUndo = undoDuration / placed
      const perRedo = redoDuration / placed
      console.log(
        `Undo/Redo — undo ${perUndo.toFixed(2)}ms/op, redo ${perRedo.toFixed(2)}ms/op (${placed} ops each)`,
      )

      expect(perUndo).toBeLessThan(GAP_THRESHOLDS.UNDO_REDO_PER_OP)
      expect(perRedo).toBeLessThan(GAP_THRESHOLDS.UNDO_REDO_PER_OP)
    })
  })
})
