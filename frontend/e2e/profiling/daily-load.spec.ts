/**
 * DAILY-PUZZLE LOAD LATENCY (PROF-002 spec 2)
 *
 * Measures time-to-interactive-board for the daily puzzle, split into cold
 * (first visit) and warm (re-visit) regimes. Round-1 (PROF-001) deferred this
 * because `PlaywrightUISDK.daily()` returns a synthetic response and never
 * loads the real daily route.
 *
 * Route clarification (PROF-002 planning): there is no `/daily` route. The
 * daily puzzle is the normal `/:seed` catch-all (App.tsx:60) seeded with
 * `daily-YYYYMMDD` from `getDailySeed()` (solver-service.ts:345). This spec
 * computes the seed inline (UTC date formatting, mirroring getDailySeed) and
 * navigates to `/{seed}?d=easy`.
 *
 * Signal contract:
 *   trigger  — page.goto('/{dailySeed}?d=easy')
 *   endpoint — `.sudoku-board` visible + first `[role="gridcell"][aria-label*="value"]`
 *              (the setupGameAndWaitForBoard board-ready contract; reusing the
 *              lower-level waitForBoard + cell-value wait so the goto sits
 *              inside the measured window).
 *
 * Two-regime split: cold = first page.goto on a fresh page (no service-worker
 * cache, no puzzle pool primed); warm = second page.goto to the same URL (SW /
 * HTTP cache primed). The cache should make warm at least not slower than cold;
 * a warm >> cold result flags a cache regression.
 *
 * Tag: @profiling
 */

import { test, expect } from '../fixtures'
import { waitForBoard } from '../utils/board-wait'
import { measureTime } from './helpers/timing'

// E2E thresholds (ms). Time-to-board bundles network (localhost dev server),
// Vite module evaluation, React mount, and puzzle generation. Calibrated from
// the first healthy green run with ~2x headroom (PROF-001-D7 pattern).
const DAILY_THRESHOLDS = {
  COLD_LOAD_MS: 15000, // first visit: full module + puzzle-gen path
  WARM_LOAD_MS: 12000, // re-visit: SW/HTTP cache should help
  // warm is allowed to be within this factor of cold (catches cache-broken
  // regressions without flaking on dev-server noise where the SW cache is thin).
  WARM_VS_COLD_TOLERANCE: 1.5,
} as const

// Mirror getDailySeed (solver-service.ts:345): UTC YYYY-MM-DD → daily-YYYY-MM-DD.
// Computed at runtime so the spec stays valid across days without a fixture.
function getDailySeed(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  return `daily-${year}-${month}-${day}`
}

test.describe.serial('@profiling Daily-Puzzle Load (cold + warm)', () => {
  test('daily puzzle cold and warm load stay within thresholds', async ({ page }) => {
    const seed = getDailySeed()
    const url = `/${seed}?d=easy`

    // Cold: first navigation on the page. No prior cache state.
    const { duration: coldMs } = await measureTime(async () => {
      await page.goto(url)
      await waitForBoard(page)
      await page.waitForSelector('[role="gridcell"][aria-label*="value"]', {
        state: 'visible',
      })
    })

    // Warm: second navigation to the same URL. The service worker / HTTP
    // cache / puzzle pool are now primed (ENABLE_PWA_IN_DEV=1 in the
    // playwright webServer env, playwright.config.ts:94).
    const { duration: warmMs } = await measureTime(async () => {
      await page.goto(url)
      await waitForBoard(page)
      await page.waitForSelector('[role="gridcell"][aria-label*="value"]', {
        state: 'visible',
      })
    })

    console.log(
      `Daily load (${seed}) — cold ${coldMs.toFixed(2)}ms, warm ${warmMs.toFixed(2)}ms ` +
        `(warm/cold ${(warmMs / coldMs).toFixed(2)}x)`,
    )

    expect(coldMs).toBeLessThan(DAILY_THRESHOLDS.COLD_LOAD_MS)
    expect(warmMs).toBeLessThan(DAILY_THRESHOLDS.WARM_LOAD_MS)
    // Cache effectiveness guard: warm must not be dramatically slower than
    // cold. On the localhost dev server the SW cache is thin, so a strict
    // warm < cold would flake on noise; the tolerance catches a real cache
    // regression (warm blowing past cold) while tolerating run-to-run jitter.
    expect(warmMs).toBeLessThan(coldMs * DAILY_THRESHOLDS.WARM_VS_COLD_TOLERANCE)
  })
})
