/**
 * HINT / AUTOSOLVE LATENCY ( spec 1)
 *
 * Measures click-to-result latency for the hint action. Round-1
 * deferred this because the hint emits a TRANSIENT toast, not a persistent
 * board mutation, so the old `PlaywrightUISDK.waitForMove` (which waits for a
 * board change) hangs forever on hints. This spec waits on the real DOM signal
 * the hint produces.
 *
 * Signal contract:
 *   trigger  — page.keyboard.press('h') (document listener, Game.tsx:1767).
 *              Profile-independent: the hint button's "Hint" label is
 *              `hidden sm:inline` (GameHeader.tsx:295), so on the mobile
 *              projects the accessible name reduces to the 💡 emoji and
 *              `getByRole('button', { name: /hint/i })` MISSES. The keyboard
 *              shortcut avoids that fragility on every project.
 *   endpoint — `.validation-message` toast becomes visible (Game.tsx:2434).
 *              Fires on every hint outcome (success technique, contradiction,
 *              "no move" error), so it is reliable across hint paths. Transience
 *              is 3000ms (TOAST_DURATION_INFO, constants.ts:65), ample for
 *              Playwright's 100ms assertion poll.
 *
 * Two-regime split ( planning decision): the first hint of a session
 * pays the one-time lazy WASM init (findNextMove triggers the WASM download,
 * board-wait.ts:7-8). Subsequent hits on the same board signature return the
 * CACHED hint (Game.tsx:971-973) but still render the toast, so they measure
 * the steady-state hint-display path (cache lookup + React toast render). The
 * split prevents the cold cost from inflating the steady-state guard.
 *
 * Tag: @profiling
 */

import { test, expect } from '../fixtures'
import { setupGameAndWaitForBoard } from '../utils/board-wait'
import { measureTime, summarize } from './helpers/timing'

// E2E thresholds (ms). These bundle Playwright automation overhead + React
// render + the auto-retrying assertion poll, so they are looser than a unit
// test's view of the same path. Calibrated from the first healthy green run
// across all 3 chromium projects ( pattern: generous headroom for
// the inherently-variable cold WASM path, tighter for the steady-state path).
//
// Empirical basis (first green run, 3 projects):
//   first hint (cold WASM) — 186-334ms across projects (localhost dev server;
//     the lazy WASM download is fast locally but inherently variable, so the
//     guard catches a catastrophic blow-up, not a 2x wobble).
//   subsequent hints (cache-hit) — avg 83-123ms, max 111-229ms across
//     projects. The steady-state path is stable and gets a tight guard.
const HINT_THRESHOLDS = {
  FIRST_HINT_COLD_MS: 5000, // first hint: lazy WASM init + first findNextMove
  SUBSEQUENT_HINT_AVG_MS: 1000, // cached hint: cache lookup + toast render
  SUBSEQUENT_HINT_MAX_MS: 3000, // max single subsequent hint (noise ceiling)
  // Steady-state hints are very fast (~100ms cached), so a single-sample ratio
  // is dominated by run noise. The drift guard compares 3-sample half-medians
  // with a 3.0x tolerance: the median absorbs one-off CI CPU spikes, and the
  // wider tolerance covers Playwright's ~100ms poll quantization on top of
  // localhost-calibrated steady-state timings.
  NO_DRIFT_RATIO: 3.0,
  NO_DRIFT_HALF_SIZE: 3,
} as const

const HINT_SEQUENCE_LENGTH = 7
const SEED = 'Phint1'

// The toast auto-dismisses at 3000ms (TOAST_DURATION_INFO); allow headroom for
// the assertion poll cadence and any visibility-aware timeout scheduling
// (visibilityAwareTimeout, Game.tsx:1033) before the next hint starts.
const TOAST_CLEAR_TIMEOUT_MS = 6000

test.describe.serial('@profiling Hint / Autosolve Latency', () => {
  test('hint latency stays bounded across first (cold) and subsequent (cached) hints', async ({
    page,
  }) => {
    // WASM loads lazily on the first hint (checkWasm: false mirrors production).
    await setupGameAndWaitForBoard(page, { seed: SEED, difficulty: 'easy' })

    const toast = page.locator('.validation-message')
    const timings: number[] = []

    for (let i = 0; i < HINT_SEQUENCE_LENGTH; i++) {
      // Ensure no stale toast from a previous hint is visible, so the
      // toBeVisible() endpoint only matches THIS hint's toast (absence-to-
      // presence). The auto-dismiss fires at TOAST_DURATION_INFO (3000ms).
      await expect(toast).toHaveCount(0, { timeout: TOAST_CLEAR_TIMEOUT_MS })

      const { duration } = await measureTime(async () => {
        await page.keyboard.press('h')
        await expect(toast.first()).toBeVisible()
      })
      timings.push(duration)
    }

    const firstHint = timings[0]
    const subsequent = timings.slice(1)
    const subsequentStats = summarize(subsequent)

    console.log(
      `Hint latency — first(cold) ${firstHint.toFixed(2)}ms; ` +
        `subsequent(cached) avg ${subsequentStats.avg.toFixed(2)}ms, ` +
        `p95 ${subsequentStats.p95.toFixed(2)}ms, max ${subsequentStats.max.toFixed(2)}ms ` +
        `(${subsequent.length} samples)`,
    )

    // Cold path: the first hint pays the WASM init. Generous ceiling so it
    // catches a real regression (WASM load blowing up) without flaking on
    // mobile emulation overhead.
    expect(firstHint).toBeLessThan(HINT_THRESHOLDS.FIRST_HINT_COLD_MS)

    // Steady state: cached hint + toast render. Tight guard; a regression in
    // the cache path or render path shows up here.
    expect(subsequentStats.avg).toBeLessThan(HINT_THRESHOLDS.SUBSEQUENT_HINT_AVG_MS)
    expect(subsequentStats.max).toBeLessThan(HINT_THRESHOLDS.SUBSEQUENT_HINT_MAX_MS)

    // No drift across the steady-state sequence: the second half's median
    // must not be dramatically slower than the first half's (catches
    // accumulating state, toast queueing, or cache degradation). Uses
    // half-medians rather than averages because the median absorbs one-off
    // CI Docker CPU spikes that would otherwise flake the avg-based ratio.
    const half = HINT_THRESHOLDS.NO_DRIFT_HALF_SIZE
    const firstHalf = summarize(subsequent.slice(0, half))
    const secondHalf = summarize(subsequent.slice(-half))
    console.log(
      `Hint drift — first-${half} median ${firstHalf.median.toFixed(2)}ms, ` +
        `last-${half} median ${secondHalf.median.toFixed(2)}ms ` +
        `(ratio ${(secondHalf.median / firstHalf.median).toFixed(2)}x)`,
    )
    expect(secondHalf.median).toBeLessThan(firstHalf.median * HINT_THRESHOLDS.NO_DRIFT_RATIO)
  })
})
