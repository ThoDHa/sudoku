import { test, expect } from '../fixtures'

/**
 * Solver Web Worker E2E Tests
 *
 * The unit suite cannot prove this. It drives a MockWorker, so it verifies the
 * client against whatever protocol that mock happens to speak; a divergence
 * between the mock and wasm.worker.ts leaves worker mode dead in a real browser
 * while every unit test passes. These assertions run against the real worker.
 *
 * The discriminator is where the WASM API lands. wasm.ts sets SudokuWasm on the
 * main-thread window; wasm.worker.ts sets it on the worker's own globalThis.
 * They are therefore mutually exclusive, and which one holds it says which mode
 * is live without any logging or test-only accessor.
 *
 * Assert early: the worker self-terminates on the idle timeout, and leaving a
 * game route tears it down.
 */

const WORKER_BUDGET_MS = 15000

// Routes are joined onto the effective base the way e2e/global-setup.ts joins
// its warmup routes: a base-path baseURL (the /sudoku/ Pages transport,
// mirroring deploy.yml) ends in '/', and Playwright resolves a leading-slash
// goto against the ORIGIN root, which under that base never reaches the app.
const appBase = (process.env['PLAYWRIGHT_BASE_URL'] || 'http://localhost:5173').replace(/\/+$/, '')
const gameRoute = (path: string): string => `${appBase}${path}`

// Budget history (TEST-13, measured 2026-08-22 against the then-shipped
// classic production worker under a production preview, --workers=1): time
// from navigation to SudokuWasm inside the worker was 836-1605ms on
// chrome-desktop (median 1210), 759-1583ms on pixel-5 (median 884), and
// 2329-3084ms on iphone-12/WebKit (median 2578) — all comfortably inside this
// 15s budget, so no project was skipped and the budget needed no raise. Those numbers are SUPERSEDED by the DEC-2 module-worker switch
// (2026-09-21): the worker now loads wasm_exec.js via a dynamic import and
// its fetch/compile profile may differ. Budget validation for the module
// worker is this spec passing on all three projects against both transports
// (vite preview at base / and /sudoku/, and the dev server); a fresh
// measurement campaign is deferred, not required. The 5s readiness poll in
// wasm.worker.ts bounds only the Go-boot-to-publish phase, which never
// approached 5s on any project, so it is not the binding constraint.
// Emulated-mobile caveat: the numbers above are this host's protocol
// emulation, not real-device CPU.

test.describe('Solver worker mode', () => {
  test('initializes the WASM worker and keeps the solver off the main thread', async ({ page }) => {
    const workerPromise = page.waitForEvent('worker', { timeout: WORKER_BUDGET_MS })

    await page.goto(gameRoute('/12345'))

    const worker = await workerPromise
    expect(worker.url()).toMatch(/wasm\.worker/)

    // The init handshake resolved. This is the assertion that fails if the
    // worker and the client disagree about the shape of the ready response:
    // initializeWorker rejects, solver-service falls back, and the WASM API
    // never appears inside the worker.
    await expect
      .poll(
        () => worker.evaluate(() => typeof (globalThis as { SudokuWasm?: unknown }).SudokuWasm),
        {
          timeout: WORKER_BUDGET_MS,
        },
      )
      .toBe('object')

    // And the main thread never took the fallback path.
    const mainThreadApi = await page.evaluate(
      () => typeof (window as { SudokuWasm?: unknown }).SudokuWasm,
    )
    expect(mainThreadApi).toBe('undefined')
  })

  test('falls back to the main thread when workers are unavailable', async ({ page }) => {
    // The negative control. Without it the assertions above could pass on a
    // build where the worker path is dead but something else defines the global.
    await page.addInitScript(() => {
      delete (window as { Worker?: unknown }).Worker
    })

    await page.goto(gameRoute('/12345'))

    await expect
      .poll(() => page.evaluate(() => typeof (window as { SudokuWasm?: unknown }).SudokuWasm), {
        timeout: WORKER_BUDGET_MS,
      })
      .toBe('object')

    expect(page.workers()).toHaveLength(0)
  })
})
