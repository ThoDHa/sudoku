/**
 * Playwright Test Helpers for Hint / Technique Processing
 *
 * Shared wait helpers for the Hint and Technique Hint flows. Both flows are
 * pure local WASM (findNextMove) with no network I/O, so networkidle resolves
 * instantly and cannot gate them. The reliable gate-release signal is the
 * spinner rendered on the Hint / Technique buttons.
 */

import type { Page } from '@playwright/test';

/**
 * Dismiss any open modals or toasts that might be blocking clicks.
 *
 * Tries common modal action buttons, then falls back to Escape.
 */
export async function dismissModals(page: Page): Promise<void> {
  const modalButtons = [
    page.getByRole('button', { name: /Got it/i }),
    page.getByRole('button', { name: /Let Me Fix It/i }),
    page.getByRole('button', { name: /Check & Fix/i }),
    page.getByRole('button', { name: /Close/i }),
    page.getByRole('button', { name: /OK/i }),
  ];

  for (const button of modalButtons) {
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(100);
      break; // Only click the first visible button
    }
  }

  // Press Escape to close any residual modal
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(50);
}

/**
 * Wait for hint / technique processing to settle, then dismiss any modals.
 *
 * Signal: the svg.animate-spin spinner on the Hint / Technique buttons. Both
 * handleNext and handleTechniqueHint set hintLoading / techniqueHintLoading
 * true (rendering the spinner) before awaiting the WASM findNextMove call,
 * and clear it in a finally block at the same moment the re-entry gate
 * releases (gate.end() in Game.tsx). Waiting for the spinner to appear then
 * disappear is therefore the reliable "hint fully settled, gate free" signal.
 *
 * This matters because two older signals race:
 *  - networkidle resolves instantly: the hint is pure local WASM with no
 *    network I/O, and the PWA service worker holds connections anyway (see
 *    PROF-003). It returns long before the computation finishes.
 *  - the .validation-message toast can be stale from a prior hint (toasts
 *    linger 3000-4000ms), so waiting on it directly can resolve before the
 *    new hint settles, letting the next click hit a held gate and silently
 *    no-op (handleTechniqueHint early-returns at Game.tsx:1079).
 *
 * Bounds are generous because the suites run under full parallel load
 * (workers: all CPUs, multiple projects): findNextMove is CPU-bound and
 * contended, so render + computation can take several seconds.
 */
export async function waitForHintProcessing(page: Page): Promise<void> {
  const hintSpinner = page
    .locator('button:has-text("Technique"), button:has-text("Hint")')
    .locator('svg.animate-spin');

  // Confirm the action actually started (spinner rendered). A cached hint can
  // settle within a single render tick, so fall back if it never appears.
  const started = await hintSpinner
    .first()
    .waitFor({ state: 'visible', timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (started) {
    await hintSpinner.first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  }

  // The gate has released; confirm the real feedback toast rendered. Resolves
  // immediately on the fast common path; generous bound for contended WASM.
  await page
    .locator('.validation-message')
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});
  await page.waitForTimeout(100);

  await dismissModals(page);
}

/**
 * Wait for the hint / technique feedback toast to be cleared from the screen.
 *
 * Use after a run of prep hints, before handing control back to a test that
 * will read or assert on toast state. Each hint schedules an independent
 * setValidationMessage(null) timer (3000-4000ms); useVisibilityAwareTimeout
 * does not cancel prior timers when a new toast is set, so rapid prep hints
 * leave pending clearers that can wipe out a later (e.g. technique) toast
 * right after it appears. Once the toast is gone, every such timer has fired
 * and the board is quiescent.
 */
export async function waitForHintToastCleared(page: Page): Promise<void> {
  await page
    .locator('.validation-message')
    .first()
    .waitFor({ state: 'hidden', timeout: 6000 })
    .catch(() => {});
}
