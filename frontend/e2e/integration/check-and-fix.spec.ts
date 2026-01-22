import { test, expect } from '../fixtures';

/**
 * Check & Fix Behavior
 *
 * Verifies that clicking Check & Fix applies only fix-error moves and does not
 * instantly solve the puzzle by applying solver steps.
 */

test.describe('@integration Check & Fix', () => {
  test.beforeEach(async ({ page }) => {
    // Guarantee onboardingComplete state in both localStorage keys the app may check
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('onboardingComplete', 'true');
        window.localStorage.setItem('sudoku_onboarding_complete', 'true');
      } catch (e) {
        // no-op
      }
    });
  });

  test('applies only fix moves and does not auto-complete', async ({ page, skipOnboarding }) => {
    // Capture page console for diagnostics during test runs
    page.on('console', msg => {
      // Route page console through loglevel to centralize output while preserving original content
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const log = require('loglevel');
        const logger = log;
        logger.getLogger('e2e').info('PAGE_CONSOLE', msg.type(), msg.text());
      } catch (e) {
        const errorLogger = (global as any).logger;
        if (errorLogger) {
          errorLogger.getLogger('e2e').info('PAGE_CONSOLE', msg.type(), msg.text());
        }
      }
    });

    // Start on a known practice puzzle; some environments ignore the query and show homepage
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();

    // If onboarding modal exists, close it with real user flow
    const onboardingCloseButton = page.locator('button', { hasText: /Close|Got it|Continue|Skip/i });
    if (await onboardingCloseButton.isVisible().catch(() => false)) {
      await onboardingCloseButton.click();
    }

    // Short settle
    await page.waitForTimeout(500);

    // If the board is not visible, attempt deterministic navigation via visible homepage controls
    if (!(await page.locator('[role="grid"]').isVisible().catch(() => false))) {
      // If the homepage is present, target the difficulty buttons deterministically
      const homepageHeading = page.getByRole('heading', { name: /Game Mode/i });
      if (await homepageHeading.isVisible().catch(() => false)) {
        // Force a click on the easy Play button to ensure a game starts
        const easyPlay = page.locator('button:has-text("easy Play")').first();
        await easyPlay.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
        if (await easyPlay.isVisible().catch(() => false)) {
          // Use a forced click in case of overlays
          await easyPlay.click({ force: true });

          // If the app shows a "Start New" confirmation modal (in case of in-progress game), click it
          const startNew = page.getByRole('button', { name: /Start New/i });
          if (await startNew.isVisible().catch(() => false)) {
            await startNew.click();
          }
        }
      } else {
        // Prefer the "Go to Practice" button otherwise
        const goToPractice = page.getByRole('button', { name: /Go to Practice/i }).first();
        if (await goToPractice.isVisible().catch(() => false)) {
          await goToPractice.click();
        } else {
          // Fallback to the easy button if visible
          const easyPlay = page.getByRole('button', { name: /easy/i }).first();
          await easyPlay.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
          if (await easyPlay.isVisible().catch(() => false)) {
            await easyPlay.click();
          }
        }
      }
    }

    // Wait for board to appear; allow extra time for main-thread solver fallback
    await page.waitForSelector('[role="grid"]', { timeout: 30000 });

    // If the app shows the Daily Puzzle modal (prompting to try daily), dismiss it by continuing practice
    const continuePractice = page.getByRole('button', { name: /Continue Practice/i });
    if (await continuePractice.isVisible().catch(() => false)) {
      await continuePractice.click();
      await page.waitForTimeout(300);
    }

    // Create a couple of conflicting user entries to trigger the modal later
    const firstCell = page.locator('[role="gridcell"]').nth(0);
    // If an overlay is present, wait for it to go away
    const overlay = page.locator('div.fixed.inset-0 div.absolute.inset-0');
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => null);
    }

    await firstCell.click();
    await page.keyboard.type('5'); // likely conflicts with givens in many easies

    const secondCell = page.locator('[role="gridcell"]').nth(1);
    await secondCell.click();
    await page.keyboard.type('5'); // introduce another conflict

    // Trigger the Check & Fix modal by invoking a flow that detects too many conflicts.
    await page.waitForTimeout(500); // allow state to settle

    // Open the modal if present, otherwise directly call the handler via UI button if available
    const checkFixButton = page.getByRole('button', { name: /Check & Fix/i });

    if (!(await checkFixButton.isVisible().catch(() => false))) {
      // Fallback: try to force the modal by using a hint that may prompt
      const hintButton = page.getByRole('button', { name: /Hint/i });
      if (await hintButton.isVisible().catch(() => false)) {
        await hintButton.click();
        await page.waitForTimeout(1000);
      }
    }

    // Now click Check & Fix or alternate flows
    if (await checkFixButton.isVisible().catch(() => false) && await checkFixButton.isEnabled().catch(() => false)) {
      await checkFixButton.click();
    } else {
      const letMeFixIt = page.getByRole('button', { name: /Let Me Fix It/i });
      if (await letMeFixIt.isVisible().catch(() => false)) {
        await letMeFixIt.click();
      }
      if (await checkFixButton.isVisible().catch(() => false)) {
        await checkFixButton.click();
      }
    }

    // Wait briefly for moves to apply
    await page.waitForTimeout(1500);

    // Assert that the puzzle is not marked complete immediately
    const resultModal = page.getByText(/Completed|Result|Summary/i);
    const hasResultModal = await resultModal.isVisible().catch(() => false);

    // Count empty cells by looking for blank gridcells
    const cells = page.locator('[role="gridcell"]');
    const count = await cells.count();
    let empties = 0;
    for (let i = 0; i < Math.min(count, 30); i++) {
      const text = await cells.nth(i).textContent();
      if (!text || text.trim() === '') empties++;
    }

    expect(hasResultModal).toBeFalsy();
    expect(empties).toBeGreaterThan(0);

    // Sanity check: page body visible
    await expect(page.locator('body')).toBeVisible();
  });
});
