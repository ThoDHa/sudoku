import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 * 
 * Test Organization:
 * - @smoke: Fast tests for basic functionality (navigation, page load)
 * - @slow: Long-running tests (auto-solve, full game completion)
 * - @api: API endpoint tests (no browser UI)
 * - @deployment: Deployment verification tests (requires DEPLOYMENT_URL env var)
 * 
 * Running specific test types:
 * - Smoke tests: npx playwright test --grep @smoke
 * - Exclude slow: npx playwright test --grep-invert @slow
 * - API only: npx playwright test --grep @api
 * - Deployment: DEPLOYMENT_URL=https://example.com npx playwright test --grep @deployment
 */

export default defineConfig({
  testDir: './e2e',
  
  // Test execution
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  
  // Timeouts
  timeout: 60000, // 60s default test timeout
  expect: {
    timeout: 10000, // 10s for expect assertions
  },
  
  // Reporting
  reporter: process.env.CI 
    ? [['html'], ['github']] 
    : [['html'], ['list']],
  
  // Shared settings
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000, // 15s action timeout
  },
  
  // Browser projects - Chrome desktop + mobile (Pixel 5 + iPhone 12)
  projects: [
    // Desktop Chrome - primary browser
    {
      name: 'chrome-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    
    // Mobile Android (Pixel 5)
    {
      name: 'pixel-5',
      use: { ...devices['Pixel 5'] },
    },
    
    // Mobile iOS (iPhone 12)
    {
      name: 'iphone-12',
      use: { ...devices['iPhone 12'] },
    },
  ],
  
  // Web server configuration (optional)
  // Uncomment to auto-start the dev server before tests
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120000,
  // },
});
