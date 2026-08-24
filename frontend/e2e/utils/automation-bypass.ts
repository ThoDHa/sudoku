import type { Page } from '@playwright/test'

/**
 * Defeat the app's E2E automation bypass for one test's pages.
 *
 * The app deliberately disables focus/visibility pausing under automation
 * (src/lib/automationEnvironment.ts): an unfocused runner window would
 * otherwise pause timers and freeze tests that never asked for a pause. That
 * bypass makes the pause behavior itself unreachable, so tests that cover
 * pausing must switch it off for their own pages.
 *
 * `isAutomatedEnvironment` engages on `navigator.webdriver` or on a
 * `HeadlessChrome`/`playwright` user-agent marker. The chrome-desktop project
 * uses Playwright's Desktop Chrome device, whose user agent carries neither
 * marker, so overriding `webdriver` alone is sufficient there.
 *
 * Call this BEFORE any navigation (the init script only applies to documents
 * loaded after it is installed).
 */
export async function disableAutomationBypass(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Shadows the Navigator.prototype getter with an own property.
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
      configurable: true,
    })
  })
}
