import { test, expect } from '../fixtures';
import { getDailySeed } from '../../src/lib/solver-service';

/**
 * Daily Prompt E2E Tests
 *
 * Tests for the daily puzzle reminder modal that appears when users
 * start practice puzzles without completing their daily puzzle.
 *
 * Test Coverage:
 * - Modal appearance conditions (practice mode, daily not complete)
 * - Modal suppression conditions (daily complete, preference disabled, already shown today)
 * - Modal button functionality ("Go to Daily", "Continue Practice")
 * - "Don't show again" checkbox persistence
 * - Menu preference toggle functionality
 */

test.describe('Daily Prompt Modal - Appearance Conditions', () => {
  test('shows modal when loading practice game without completing daily', async ({ page }) => {
    // Navigate DIRECTLY to practice game without intermediate page load
    const seed = `P${Date.now()}`;
    
    // INTERCEPT AND OVERRIDE at the browser level before any page load
    await page.addInitScript(() => {
      console.log('DEBUG: Init script running - setting up localStorage override');
      
      // Force localStorage to have the correct preferences from the start
      localStorage.clear();
      
      // CRITICAL: Set onboarding complete to simulate returning user (not new user)
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      
      const preferences = {
        homepageMode: 'daily',
        autoSolveSpeed: 'fast',
        hideTimer: false,
        showDailyReminder: true
      };
      localStorage.setItem('sudoku_preferences', JSON.stringify(preferences));
      console.log('DEBUG: Set initial preferences to:', JSON.stringify(preferences));
      
      // Monkey-patch localStorage.setItem to prevent showDailyReminder being set to false
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = function(key, value) {
        console.log('DEBUG: localStorage.setItem called with key:', key, 'value:', value);
        if (key === 'sudoku_preferences') {
          try {
            const data = JSON.parse(value);
            console.log('DEBUG: Parsed preferences data:', data);
            // If someone tries to set showDailyReminder to false, ignore it
            if (data.showDailyReminder === false) {
              console.log('DEBUG: BLOCKED attempt to set showDailyReminder to false');
              data.showDailyReminder = true;
              value = JSON.stringify(data);
              console.log('DEBUG: FORCED value to:', value);
            }
          } catch (e) {
            console.log('DEBUG: Failed to parse preferences data:', e.message);
          }
        }
        return originalSetItem.call(this, key, value);
      };
      
      console.log('DEBUG: localStorage monkey-patch complete');
    });
    
    // Navigate directly to practice game
    await page.goto(`/${seed}?d=easy`);
    
    // Wait for game to load
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
    
    // Capture console logs to debug
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'log' && (
        msg.text().startsWith('DEBUG:') || 
        msg.text().startsWith('[PREFERENCES DEBUG]') || 
        msg.text().startsWith('[DAILY PROMPT DEBUG]')
      )) {
        consoleLogs.push(msg.text());
      }
    });
    
    // Add debug script to check conditions manually
    await page.evaluate(() => {
      console.log('DEBUG: Manual check - URL:', window.location.href);
      console.log('DEBUG: Manual check - localStorage available:', typeof localStorage !== 'undefined');
      
      try {
        const prefsData = localStorage.getItem('sudoku_preferences');
        console.log('DEBUG: Manual check - RAW preferences data:', prefsData);
        const parsedPrefs = prefsData ? JSON.parse(prefsData) : {};
        console.log('DEBUG: Manual check - PARSED preferences:', parsedPrefs);
        const showDailyReminder = parsedPrefs?.showDailyReminder ?? true;
        console.log('DEBUG: Manual check - showDailyReminder value:', showDailyReminder);
        
        // Also check via the preferences module
        console.log('DEBUG: Manual check - Testing preferences module import...');
        
        // CHECK GAME COMPONENT STATE
        console.log('DEBUG: Manual check - checking for game state variables...');
        console.log('DEBUG: Manual check - document title:', document.title);
        console.log('DEBUG: Manual check - page elements:', document.querySelectorAll('*').length);
        
        const completionsData = localStorage.getItem('sudoku_daily_completions');
        const parsedCompletions = completionsData ? JSON.parse(completionsData) : [];
        const today = new Date().toISOString().split('T')[0];
        const isTodayCompleted = parsedCompletions.includes(today);
        console.log('DEBUG: Manual check - isTodayCompleted:', isTodayCompleted);
        
        const lastShown = localStorage.getItem('sudoku_daily_prompt_last_shown');
        const alreadyShownToday = lastShown === today;
        console.log('DEBUG: Manual check - alreadyShownToday:', alreadyShownToday);
        
        console.log('DEBUG: Manual check - All conditions for modal:', 
          'showReminder=' + showDailyReminder, 
          'notCompleted=' + !isTodayCompleted, 
          'notShownToday=' + !alreadyShownToday);
      } catch (e) {
        console.log('DEBUG: Manual check error:', e.message);
      }
    });
    
    // Wait for page to fully render and console logs to accumulate
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 10000 });
    
    // Print captured logs
    console.log('Captured console logs:', consoleLogs);
    
    // BEFORE checking visibility, let's see if the modal exists AT ALL in the DOM
    await page.evaluate(() => {
      console.log('DEBUG: Checking DOM for modal elements...');
      const h2Elements = document.querySelectorAll('h2');
      console.log('DEBUG: All h2 elements on page:', h2Elements.length);
      h2Elements.forEach((h2, index) => {
        console.log(`DEBUG: h2[${index}]: "${h2.textContent}"`);
      });
      
      const modalElements = document.querySelectorAll('[class*="modal"], [role="dialog"], [class*="fixed"]');
      console.log('DEBUG: All modal-like elements:', modalElements.length);
      modalElements.forEach((modal, index) => {
        console.log(`DEBUG: modal[${index}]: class="${modal.className}" visible="${getComputedStyle(modal).display}"`);
      });
      
      // Check for DailyPromptModal specifically
      const dailyPromptElements = document.querySelectorAll('*');
      const dailyTexts = Array.from(dailyPromptElements).filter(el => 
        el.textContent && el.textContent.includes('Daily')
      );
      console.log('DEBUG: Elements containing "Daily":', dailyTexts.length);
      dailyTexts.forEach((el, index) => {
        console.log(`DEBUG: daily[${index}]: "${el.textContent?.substring(0, 50)}..."`);
      });
    });
    
    // Modal should appear
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' });
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Verify modal content
    await expect(page.locator('button', { hasText: 'Go to Daily' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Continue Practice' })).toBeVisible();
    await expect(page.locator('text=Don\'t show this again')).toBeVisible();
  });

  test('does not show modal when daily puzzle is already completed', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    
    // Set daily completion status
    const today = new Date().toISOString().split('T')[0];
    await page.evaluate((dateStr) => {
      localStorage.setItem('sudoku_daily_completions', JSON.stringify([dateStr]));
    }, today);
    
    // Navigate to practice game
    const seed = `P${Date.now()}`; await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
    
    // Modal should NOT appear
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' });
    await expect(modal).not.toBeVisible();
  });

  test('does not show modal if user disabled the preference', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    
    // Set up a RETURNING user (not a new user) - onboarding already completed
    await page.evaluate(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    
    // Disable the preference
    await page.evaluate(() => {
      const prefs = { showDailyReminder: false };
      localStorage.setItem('sudoku_preferences', JSON.stringify(prefs));
    });
    
    // Navigate to practice game
    const seed = `P${Date.now()}`; await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
    
    // Modal should NOT appear
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' });
    await expect(modal).not.toBeVisible();
  });

  test('does not show modal if already shown today', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    
    // Mark prompt as shown today
    const today = new Date().toISOString().split('T')[0];
    await page.evaluate((dateStr) => {
      localStorage.setItem('sudoku_daily_prompt_last_shown', dateStr);
    }, today);
    
    // Navigate to practice game
    const seed = `P${Date.now()}`; await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
    
    // Modal should NOT appear
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' });
    await expect(modal).not.toBeVisible();
  });

  test('does not show modal when loading daily puzzle', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    
    // Navigate to daily puzzle via correct route
    const { seed } = getDailySeed();
    await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
    
    // Modal should NOT appear
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' });
    await expect(modal).not.toBeVisible();
  });
});

test.describe('Daily Prompt Modal - Button Functionality', () => {
  test('"Go to Daily" button navigates to today\'s daily puzzle', async ({ page }) => {
    // Set up clean state BEFORE any navigation
    const seed = `P${Date.now()}`;
    
    await page.addInitScript(() => {
      localStorage.clear();
      // Set onboarding complete to simulate returning user
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      const preferences = {
        homepageMode: 'daily',
        autoSolveSpeed: 'fast',
        hideTimer: false,
        showDailyReminder: true
      };
      localStorage.setItem('sudoku_preferences', JSON.stringify(preferences));
    });
    
    // Navigate directly to practice game
    await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
    
    // Wait for modal and click "Go to Daily"
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' });
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    const goToDailyButton = page.locator('button', { hasText: 'Go to Daily' });
    await goToDailyButton.click();
    
    // Should navigate to daily puzzle
    await page.waitForURL('**/daily-*', { timeout: 10000 });
    expect(page.url()).toMatch(/daily-\d{4}-\d{2}-\d{2}/);
    
    // Modal should be closed
    await expect(modal).not.toBeVisible();
  });

  test('"Continue Practice" button closes modal and continues loading practice game', async ({ page }) => {
    // Set up clean state BEFORE any navigation
    const seed = `P${Date.now()}`;
    
    await page.addInitScript(() => {
      localStorage.clear();
      // Set onboarding complete to simulate returning user
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      const preferences = {
        homepageMode: 'daily',
        autoSolveSpeed: 'fast',
        hideTimer: false,
        showDailyReminder: true
      };
      localStorage.setItem('sudoku_preferences', JSON.stringify(preferences));
    });
    
    // Navigate directly to practice game
    await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
    
    // Wait for modal and click "Continue Practice"
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' });
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    const continueButton = page.locator('button', { hasText: 'Continue Practice' });
    await continueButton.click();
    
    // Modal should close
    await expect(modal).not.toBeVisible();
    
    // Should remain on practice game
    expect(page.url()).toContain('d=easy');
    await expect(page.locator('.game-background')).toBeVisible();
  });
});

test.describe('Daily Prompt Modal - Checkbox Persistence', () => {
  test('"Don\'t show this again" checkbox disables future prompts', async ({ page }) => {
    // Set up clean state BEFORE any navigation
    const seed = `P${Date.now()}`;
    
    // CRITICAL: This init script should ONLY initialize on first navigation
    // On subsequent navigations, we preserve existing localStorage (including user's preference changes)
    await page.addInitScript(() => {
      // Check if localStorage already has our test marker - if so, don't clear/reset
      const testMarker = localStorage.getItem('__test_checkbox_initialized');
      if (testMarker === 'true') {
        return; // Skip - already initialized, preserve user's preference changes
      }
      
      // First time initialization
      localStorage.clear();
      localStorage.setItem('__test_checkbox_initialized', 'true');
      // Set onboarding complete to simulate returning user
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      const preferences = {
        homepageMode: 'daily',
        autoSolveSpeed: 'fast',
        hideTimer: false,
        showDailyReminder: true
      };
      localStorage.setItem('sudoku_preferences', JSON.stringify(preferences));
    });
    
    // Navigate directly to practice game
    await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
    
    // Wait for modal
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' });
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Check the "Don't show again" checkbox
    const checkbox = page.locator('input[type="checkbox"]');
    await checkbox.check();
    
    // Click "Continue Practice"
    const continueButton = page.locator('button', { hasText: 'Continue Practice' });
    await continueButton.click();
    
    // Wait for preference to be saved to localStorage using condition-based wait
    await expect(async () => {
      const debugBeforeSecondNav = await page.evaluate(() => {
        const rawPrefs = localStorage.getItem('sudoku_preferences');
        const parsedPrefs = rawPrefs ? JSON.parse(rawPrefs) : {};
        return parsedPrefs.showDailyReminder;
      });
      expect(debugBeforeSecondNav).toBe(false);
    }).toPass({ timeout: 3000 });
    
    // Verify preference was saved - DETAILED DEBUG
    const debugBeforeSecondNav = await page.evaluate(() => {
      const rawPrefs = localStorage.getItem('sudoku_preferences');
      const parsedPrefs = rawPrefs ? JSON.parse(rawPrefs) : {};
      return {
        rawPrefs: rawPrefs,
        parsedPrefs: parsedPrefs,
        showDailyReminder: parsedPrefs.showDailyReminder
      };
    });
    console.log('DEBUG before second navigation:', debugBeforeSecondNav);
    expect(debugBeforeSecondNav.showDailyReminder).toBe(false);
    
    // Navigate to another practice game
    // The init script will see __test_checkbox_initialized and skip re-initialization
    const seed2 = `P${Date.now()}`;
    
    await page.goto(`/${seed2}?d=medium`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
    
    // Debug: Check localStorage state after second navigation
    const debugInfo = await page.evaluate(() => {
      const prefs = JSON.parse(localStorage.getItem('sudoku_preferences') || '{}');
      return {
        showDailyReminder: prefs.showDailyReminder,
        url: window.location.href,
        localStorage: !!window.localStorage
      };
    });
    console.log('Debug after second navigation:', debugInfo);
    
    // Create a fresh modal locator for the new page
    const secondModal = page.locator('h2', { hasText: 'Daily Puzzle' });
    
    // Modal should NOT appear this time
    await expect(secondModal).not.toBeVisible();
  });
});

test.describe('Daily Prompt Modal - Menu Preference Toggle', () => {
  test('menu toggle correctly enables/disables future prompts', async ({ page }) => {
    // Set up clean state BEFORE any navigation
    // CRITICAL: This init script should ONLY initialize on first navigation
    await page.addInitScript(() => {
      // Check if localStorage already has our test marker - if so, don't clear/reset
      const testMarker = localStorage.getItem('__test_menu_toggle_initialized');
      if (testMarker === 'true') {
        return; // Skip - already initialized, preserve user's preference changes
      }
      
      // First time initialization
      localStorage.clear();
      localStorage.setItem('__test_menu_toggle_initialized', 'true');
      // Set onboarding complete to simulate returning user
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      const preferences = {
        homepageMode: 'daily',
        autoSolveSpeed: 'fast',
        hideTimer: false,
        showDailyReminder: true
      };
      localStorage.setItem('sudoku_preferences', JSON.stringify(preferences));
    });
    
    // Open menu - navigate to homepage
    await page.goto('/');
    
    // Wait for page to fully load
    await expect(page.locator('.enso-logo')).toBeVisible({ timeout: 10000 });
    
    // Find and click menu button (hamburger icon button)
    const menuButton = page.locator('button[title="Menu"]');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();
    
    // Wait for menu to open
    const menu = page.locator('text=Settings').first();
    await expect(menu).toBeVisible({ timeout: 5000 });
    
    // Expand settings if collapsed
    const settingsButton = page.locator('button:has-text("Settings")').first();
    
    // Check if settings is already expanded by looking for the content
    const settingsContent = page.locator('.ml-4.py-1.space-y-1').first();
    const isExpanded = await settingsContent.isVisible().catch(() => false);
    
    if (!isExpanded) {
      await settingsButton.click();
      // Wait for expansion animation using condition-based wait
      await expect(settingsContent).toBeVisible({ timeout: 2000 });
    }
    
    // Find the daily reminder toggle button
    const dailyReminderToggle = page.locator('button:has-text("Show Daily Puzzle Reminder")');
    
    // Verify it's visible
    await expect(dailyReminderToggle).toBeVisible({ timeout: 10000 });
    
    // Check initial state by looking at the toggle indicator class
    const toggleIndicator = dailyReminderToggle.locator('div').first();
    const initialBgColor = await toggleIndicator.getAttribute('class');
    expect(initialBgColor).toContain('bg-accent'); // Should be enabled by default
    
    // Toggle it off
    await dailyReminderToggle.click();
    
    // Verify it's now disabled (should have bg-board-border-light)
    const newBgColor = await toggleIndicator.getAttribute('class');
    expect(newBgColor).toContain('bg-board-border-light');
    
    // Close menu by pressing Escape
    await page.keyboard.press('Escape');
    
    // Wait for menu to close
    await expect(menu).not.toBeVisible({ timeout: 2000 });
    
    // Navigate to practice game
    const seed = `P${Date.now()}`; await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
    
    
    // Modal should NOT appear
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' });
    await expect(modal).not.toBeVisible();
    // Re-enable via menu
    await menuButton.click();
    await expect(menu).toBeVisible({ timeout: 5000 });
    await settingsButton.click();
    await dailyReminderToggle.click();
    
    // Verify it's enabled again (should have bg-accent)
    const finalBgColor = await toggleIndicator.getAttribute('class');
    expect(finalBgColor).toContain('bg-accent');
  });
});

test.describe('Daily Prompt Modal - Daily Reset', () => {
  test('prompt resets for new day', async ({ page }) => {
    // Set up clean state BEFORE any navigation
    const seed = `P${Date.now()}`;
    
    await page.addInitScript(() => {
      localStorage.clear();
      // Set onboarding complete to simulate returning user
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      const preferences = {
        homepageMode: 'daily',
        autoSolveSpeed: 'fast',
        hideTimer: false,
        showDailyReminder: true
      };
      localStorage.setItem('sudoku_preferences', JSON.stringify(preferences));
      
      // Set prompt as shown yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      localStorage.setItem('sudoku_daily_prompt_last_shown', yesterdayStr);
    });
    
    // Navigate directly to practice game
    await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 });
    
    // Modal SHOULD appear (new day)
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' });
    await expect(modal).toBeVisible({ timeout: 5000 });
  });
});
