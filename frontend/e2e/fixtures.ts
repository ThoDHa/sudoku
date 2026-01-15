/**
 * Playwright Test Fixtures for Sudoku E2E Tests
 *
 * Provides reusable fixtures that eliminate duplicated beforeEach patterns:
 * - skipOnboarding: Auto-skips the onboarding modal for all tests
 * - sdk: Provides a PlaywrightUISDK instance ready to use
 * - mobileViewport: Sets mobile viewport dimensions (must be explicitly used)
 */

import { test as base, Page } from '@playwright/test';
import { PlaywrightUISDK } from './sdk';

type SudokuFixtures = {
  skipOnboarding: void;
  sdk: PlaywrightUISDK;
  mobileViewport: void;
};

export const test = base.extend<SudokuFixtures>({
  // Capture console debug messages to a log file for debug traces
  // This writes matching DEBUG_SAVE/DEBUG_ERASE lines to frontend/console-debug.log
  // It uses page.on('console') which runs inside the test process
  // Note: This is safe for CI runs and produces a plain-text log for quick inspection.
  _captureConsole: [async ({ page }, use) => {
    const fs = await import('fs')
    const path = await import('path')
    const fsp = fs.promises
    const logPath = path.resolve(process.cwd(), 'console-debug.log')
    try {
      // Clear previous log
      await fsp.writeFile(logPath, '')
    } catch (e) {
      // ignore
    }
    page.on('console', async msg => {
      try {
        const text = msg.text()
        if (/DEBUG_SAVE|DEBUG_ERASE/.test(text)) {
          const line = `${new Date().toISOString()} ${msg.type()} ${text}\n`
          await fsp.appendFile(logPath, line)
        }
      } catch (e) {
        // ignore logging errors
      }
    })
    await use()
  }, { auto: true }],
  // Auto-skip onboarding for all tests and enable test debug flag
  skipOnboarding: [async ({ page }, use) => {
    await page.addInitScript(() => {
      (window as any).__ENABLE_TEST_DEBUG__ = true;
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await use();
  }, { auto: true }],

  // Provide SDK instance
  sdk: async ({ page }, use) => {
    await use(new PlaywrightUISDK({ page }));
  },

  // Mobile viewport helper (not auto, must be explicitly used)
  mobileViewport: async ({ page }, use) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await use();
  },
});

export { expect } from '@playwright/test';
