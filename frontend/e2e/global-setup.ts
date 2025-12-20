/**
 * Global setup for Playwright tests
 * 
 * This file runs once before all tests and sets up any global state.
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  // Create a browser context to set up localStorage
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Navigate to the app to set localStorage
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:5173';
  await page.goto(baseURL);
  
  // Set onboarding complete so it doesn't block tests
  await page.evaluate(() => {
    localStorage.setItem('sudoku_onboarding_complete', 'true');
  });
  
  // Save storage state
  await context.storageState({ path: 'e2e/.auth/storage-state.json' });
  
  await browser.close();
}

export default globalSetup;
