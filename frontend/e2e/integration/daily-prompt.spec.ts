import { test, expect } from '../fixtures';

/**
 * Daily Prompt E2E Tests
 *
 * Tests for the daily puzzle reminder modal that appears when users
 * start practice puzzles without completing the daily puzzle.
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
    // Clear storage to ensure clean state
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    
    // Navigate to practice game (easy difficulty) - use practice seed format
    const seed = `P${Date.now()}`;
    await page.goto(`/${seed}?d=easy`);
    
    // Wait for game to load
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    
    // Modal should appear
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' )
    await expect(modal).toBeVisible({ timeout: 5000 )
    
    // Verify modal content
    await expect(page.locator('button', { hasText: 'Go to Daily' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Continue Practice' })).toBeVisible();
    await expect(page.locator('text=Don\'t show this again')).toBeVisible();
  )

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
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    
    // Modal should NOT appear
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' )
    await expect(modal).not.toBeVisible();
  )

  test('does not show modal if user disabled the preference', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    
    // Disable the preference
    await page.evaluate(() => {
      const prefs = { showDailyReminder: false };
      localStorage.setItem('sudoku_preferences', JSON.stringify(prefs));
    )
    
    // Navigate to practice game
    const seed = `P${Date.now()}`; await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    
    // Modal should NOT appear
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' )
    await expect(modal).not.toBeVisible();
  )

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
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    
    // Modal should NOT appear
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' )
    await expect(modal).not.toBeVisible();
  )

  test('does not show modal when loading daily puzzle', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    
    // Navigate to daily puzzle
    await page.goto('/game?mode=daily');
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    
    // Modal should NOT appear
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' )
    await expect(modal).not.toBeVisible();
  )
)

test.describe('Daily Prompt Modal - Button Functionality', () => {
  test('"Go to Daily" button navigates to today\'s daily puzzle', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    
    // Navigate to practice game
    const seed = `P${Date.now()}`; await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    
    // Wait for modal and click "Go to Daily"
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' )
    await expect(modal).toBeVisible({ timeout: 5000 )
    
    const goToDailyButton = page.locator('button', { hasText: 'Go to Daily' )
    await goToDailyButton.click();
    
    // Should navigate to daily puzzle
    await page.waitForURL('**/daily-*', { timeout: 10000 )
    expect(page.url()).toMatch(/daily-\d{4}-\d{2}-\d{2}/);
    
    // Modal should be closed
    await expect(modal).not.toBeVisible();
  )

  test('"Continue Practice" button closes modal and continues loading practice game', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    
    // Navigate to practice game
    const seed = `P${Date.now()}`; await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    
    // Wait for modal and click "Continue Practice"
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' )
    await expect(modal).toBeVisible({ timeout: 5000 )
    
    const continueButton = page.locator('button', { hasText: 'Continue Practice' )
    await continueButton.click();
    
    // Modal should close
    await expect(modal).not.toBeVisible();
    
    // Should remain on practice game
    expect(page.url()).toContain('d=easy');
    await expect(page.locator('.game-background')).toBeVisible();
  )
)

test.describe('Daily Prompt Modal - Checkbox Persistence', () => {
  test('"Don\'t show this again" checkbox disables future prompts', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    
    // Navigate to practice game
    const seed = `P${Date.now()}`; await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    
    // Wait for modal
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' )
    await expect(modal).toBeVisible({ timeout: 5000 )
    
    // Check the "Don't show again" checkbox
    const checkbox = page.locator('input[type="checkbox"]');
    await checkbox.check();
    
    // Click "Continue Practice"
    const continueButton = page.locator('button', { hasText: 'Continue Practice' )
    await continueButton.click();
    
    // Verify preference was saved
    const showDailyReminder = await page.evaluate(() => {
      const prefs = JSON.parse(localStorage.getItem('sudoku_preferences') || '{}');
      return prefs.showDailyReminder;
    )
    expect(showDailyReminder).toBe(false);
    
    // Navigate to another practice game
    const seed2 = `P${Date.now()}`; await page.goto(`/${seed2}?d=medium`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    
    // Modal should NOT appear this time
    await expect(modal).not.toBeVisible();
  )
)

test.describe('Daily Prompt Modal - Menu Preference Toggle', () => {
  test('menu toggle correctly enables/disables future prompts', async ({ page }) => {
    // Open menu - wait for homepage to load first
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    
    // Wait for page to fully load
    await expect(page.locator('.enso-logo')).toBeVisible({ timeout: 10000 )
    
    // Find and click menu button (hamburger icon button)
    const menuButton = page.locator('button[title="Menu"]');
    await expect(menuButton).toBeVisible({ timeout: 5000 )
    await menuButton.click();
    
    // Wait for menu to open
    const menu = page.locator('text=Settings').first();
    await expect(menu).toBeVisible({ timeout: 5000 )
    
    // Expand settings if collapsed
    const settingsButton = page.locator('button:has-text("Settings")').first();
    
    // Check if settings is already expanded by looking for the content
    const settingsContent = page.locator('.ml-4.py-1.space-y-1').first();
    const isExpanded = await settingsContent.isVisible().catch(() => false);
    
    if (!isExpanded) {
      await settingsButton.click();
      // Wait for expansion animation
      await page.waitForTimeout(500);
    }
    
    // Find the daily reminder toggle button
    const dailyReminderToggle = page.locator('button:has-text("Show Daily Puzzle Reminder")');
    
    // Verify it's visible
    await expect(dailyReminderToggle).toBeVisible({ timeout: 10000 )
    
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
    await page.waitForTimeout(300);
    
    // Navigate to practice game
    const seed = `P${Date.now()}`; await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    
    
    // Modal should NOT appear
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' )
    await expect(modal).not.toBeVisible();
    // Re-enable via menu
    await menuButton.click();
    await expect(menu).toBeVisible({ timeout: 5000 )
    await settingsButton.click();
    await dailyReminderToggle.click();
    
    // Verify it's enabled again (should have bg-accent)
    const finalBgColor = await toggleIndicator.getAttribute('class');
    expect(finalBgColor).toContain('bg-accent');
  )
)

test.describe('Daily Prompt Modal - Daily Reset', () => {
  test('prompt resets for new day', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    
    // Set prompt as shown yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    await page.evaluate((dateStr) => {
      localStorage.setItem('sudoku_daily_prompt_last_shown', dateStr);
    }, yesterdayStr);
    
    // Navigate to practice game
    const seed = `P${Date.now()}`; await page.goto(`/${seed}?d=easy`);
    await expect(page.locator('.game-background')).toBeVisible({ timeout: 15000 )
    
    // Modal SHOULD appear (new day)
    const modal = page.locator('h2', { hasText: 'Daily Puzzle' )
    await expect(modal).toBeVisible({ timeout: 5000 )
  )
)
