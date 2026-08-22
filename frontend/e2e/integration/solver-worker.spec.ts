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

test.describe('Solver worker mode', () => {
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
