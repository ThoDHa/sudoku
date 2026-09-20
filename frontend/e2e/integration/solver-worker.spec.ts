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

// Skipped when PLAYWRIGHT_BASE_URL is unset: that is the config-spawned dev
// server (playwright.config.ts webServer), and the suite cannot exercise the
// real worker there. Measured verdict (BUG-28): Vite 8.1.4's dev server
// rewrites `new Worker(new URL('./wasm.worker.ts', import.meta.url))` (no
// options) to a `?worker_file&type=classic` URL that serves the worker entry
// as an UNBUNDLED module, so its `import`/`export` statements reach a classic
// worker and the browser kills it with "Cannot use import statement outside a
// module". worker-client.ts then discards the worker onerror and the poll
// fails with "worker.evaluate: Target page, context or browser has been
// closed" while the page itself stays alive. Reproduced 4/4 on chrome-desktop
// (config webServer twice, manual server cold and warm; ENABLE_PWA_IN_DEV on
// and off; service worker had no registrations in any run); `vite preview`
// control passes 2/2 with the same spec. worker.format: 'iife' and
// worker.plugins are both no-ops on this dev path, so there is no dev-config
// repair; the semantic fix (passing { type: 'module' } at the constructor) is
// a production change and was flagged, not made. Runs against
// PLAYWRIGHT_BASE_URL (every CI path: docker-compose.test.yml and deploy.yml
// set it against built artifacts) are unaffected.
test.describe('Solver worker mode', () => {
  test.skip(
    !process.env['PLAYWRIGHT_BASE_URL'],
    'Vite dev server cannot serve this classic worker; run against a built preview (BUG-28)',
  )

  // Runs on every project, measured not assumed (TEST-13, production preview,
  // --workers=1): time from navigation to SudokuWasm inside the worker is
  // 836-1605ms on chrome-desktop (median 1210), 759-1583ms on pixel-5 (median
  // 884), and 2329-3084ms on iphone-12/WebKit (median 2578) — all comfortably
  // inside this spec's 15s budget, so no project is skipped and the budget
  // needs no raise. WebKit is measured, not inferred: the production worker is
  // classic there too (typeof importScripts === 'function'), and wasm_exec.js
  // loads via importScripts on every project. The 5s readiness poll in
  // wasm.worker.ts bounds only the Go-boot-to-publish phase, which never
  // approached 5s on any project, so it is not the binding constraint.
  // Emulated-mobile caveat: these numbers are this host's protocol emulation,
  // not real-device CPU.

  test('initializes the WASM worker and keeps the solver off the main thread', async ({ page }) => {
    const workerPromise = page.waitForEvent('worker', { timeout: WORKER_BUDGET_MS })

    await page.goto('/12345')

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

    await page.goto('/12345')

    await expect
      .poll(() => page.evaluate(() => typeof (window as { SudokuWasm?: unknown }).SudokuWasm), {
        timeout: WORKER_BUDGET_MS,
      })
      .toBe('object')

    expect(page.workers()).toHaveLength(0)
  })
})
