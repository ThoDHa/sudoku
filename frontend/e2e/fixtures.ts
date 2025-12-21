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
  // Auto-skip onboarding for all tests
  skipOnboarding: [async ({ page }, use) => {
    await page.addInitScript(() => {
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
