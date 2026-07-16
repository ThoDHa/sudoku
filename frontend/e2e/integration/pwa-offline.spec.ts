import { test, expect } from '../fixtures'

/**
 * PWA offline mode (PWA-2) integration test.
 *
 * Proves the end-to-end contract of the user-configurable, default-OFF offline
 * mode: with the preference enabled BEFORE first navigation, main.tsx registers
 * the service worker; once the worker controls the page, going offline and
 * reloading still serves the precached app shell.
 *
 * Why chrome-desktop only: service-worker activation is deterministic on a real
 * Chromium desktop, but the mobile emulators' SW lifecycle timing is flaky (the
 * worker often has not claimed the client by the time we go offline). The
 * offline mode feature itself is platform-agnostic; this test guards the
 * registration + offline-serve contract where it is reliably observable.
 */
test.describe('PWA offline mode (PWA-2)', () => {
  test('serves the precached app shell when offline after enabling the preference', async ({
    page,
    context,
  }) => {
    // Mobile SW activation is timing-sensitive; restrict to chrome-desktop.
    test.skip(test.info().project.name !== 'chrome-desktop', 'chrome-desktop only')

    // Enable the offline-mode preference BEFORE first navigation so main.tsx
    // registers the service worker on load. The default is OFF, so without this
    // no service worker would ever be registered.
    await page.addInitScript(() => localStorage.setItem('sudoku_offline_mode_enabled', 'true'))

    await page.goto('/')

    // Wait for the service worker to install and activate, then give
    // clientsClaim a moment to take hold before reloading.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    })

    // Reload so the now-active worker controls the page.
    await page.reload()

    const registration = await page.evaluate(() => navigator.serviceWorker.getRegistration())
    expect(registration, 'service worker should be registered when preference is ON').not.toBeNull()
    expect(registration?.active, 'registered service worker should be active').not.toBeNull()

    // Go offline and reload: the precached shell must render from the SW cache.
    await context.setOffline(true)
    try {
      await page.reload()
      // The homepage h1 is present in every homepage state (Daily Sudoku /
      // Game Mode / Daily Complete), mirroring the assertion homepage.spec.ts
      // relies on, so it is a reliable signal that the React shell rendered.
      const heading = page.locator(
        'h1:has-text("Daily Sudoku"), h1:has-text("Game Mode"), h1:has-text("Daily Complete")',
      )
      await expect(heading, 'app shell should render from cache while offline').toBeVisible({
        timeout: 30000,
      })
    } finally {
      await context.setOffline(false)
    }
  })
})
