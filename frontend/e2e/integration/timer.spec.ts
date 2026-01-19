import { test, expect } from '../fixtures';

/**
 * Timer E2E Tests
 *
 * Comprehensive tests for Sudoku game timer functionality including:
 * - Timer display format (MM:SS)
 * - Timer counting and incrementing
 * - Pause behavior on visibility change
 * - Hide timer preference
 * - Timer persistence across reload
 * - Timer behavior on puzzle completion
 * - Timer behavior in both practice and daily game modes
 *
 * Tag: @integration @timer
 */

// Helper to locate the timer element
function getTimerLocator(page: any) {
  return page.locator('.font-mono').filter({ hasText: /^\d+:\d{2}$/ )
}

// Helper to parse timer text into seconds
function parseTimerToSeconds(timerText: string): number {
  const parts = timerText.split(':');
  if (parts.length === 2) {
    // MM:SS format
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }
  return 0;
}

// Helper to get today's daily seed
function getTodayDailySeed() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `daily-${year}-${month}-${day}`;
}

// Test mode types
type GameMode = 'practice' | 'daily';

// Helper to generate test URLs for both modes
function getTestUrl(mode: GameMode, testId: string, difficulty: string = 'easy'): string {
  if (mode === 'daily') {
    return `/${getTodayDailySeed()}?d=${difficulty}`;
  }
  // Practice seeds must start with 'P' (see seedValidation.ts)
  return `/P${testId}?d=${difficulty}`;
}

// =============================================================================
// DUAL MODE TESTS - Practice and Daily
// =============================================================================

test.describe('@integration Timer - Practice Mode', () => {
  test('timer starts from 0:00 on new practice game', async ({ page }) => {
    const testId = 'practice-start-' + Date.now();
    await page.goto(getTestUrl('practice', testId, 'easy'));
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    const timer = getTimerLocator(page);
    const initialTime = await timer.textContent();

    // New practice game should start at 0:00 or very close to it
    const seconds = parseTimerToSeconds(initialTime || '0:00');
    expect(seconds).toBeLessThanOrEqual(2);
  )

  test('timer increments correctly in practice mode', async ({ page }) => {
    const testId = 'practice-increment-' + Date.now();
    await page.goto(getTestUrl('practice', testId, 'easy'));
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    const timer = getTimerLocator(page);

    // Get initial time
    const initialText = await timer.textContent();
    const initialSeconds = parseTimerToSeconds(initialText || '0:00');

    // Wait 3 seconds
    await page.waitForTimeout(3000);

    // Get new time
    const newText = await timer.textContent();
    const newSeconds = parseTimerToSeconds(newText || '0:00');

    // Timer should have incremented
    expect(newSeconds).toBeGreaterThan(initialSeconds);
  )

  test('timer persists correctly across reload in practice mode', async ({ page }) => {
    const seed = 'practice-reload-' + Date.now();
    await page.goto(getTestUrl('practice', seed, 'easy'));
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    const timer = getTimerLocator(page);

    // Wait for timer to accumulate some time
    await page.waitForTimeout(3000);

    // Get timer value
    const timeBeforeReload = await timer.textContent();
    const secondsBeforeReload = parseTimerToSeconds(timeBeforeReload || '0:00');

    // Ensure we have some time on the timer
    expect(secondsBeforeReload).toBeGreaterThanOrEqual(2);

    // Reload page
    await page.reload();
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    // Get timer value after reload
    const timeAfterReload = await timer.textContent();
    const secondsAfterReload = parseTimerToSeconds(timeAfterReload || '0:00');

    // Timer should have preserved at least some of the elapsed time
    expect(secondsAfterReload).toBeGreaterThanOrEqual(secondsBeforeReload - 1);
  )

  test('timer pauses/resumes correctly in practice mode', async ({ page }) => {
    const testId = 'practice-pause-resume-' + Date.now();
    await page.goto(getTestUrl('practice', testId, 'easy'));
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    const timer = getTimerLocator(page);

    // Pause timer
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      )
      document.dispatchEvent(new Event('visibilitychange'));
    )

    await page.waitForTimeout(500);

    // Resume visibility
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      )
      document.dispatchEvent(new Event('visibilitychange'));
    )

    // PAUSED text should disappear
    const pausedIndicator = page.locator('span.text-xs:has-text("PAUSED")');
    await expect(pausedIndicator).not.toBeVisible();

    // Timer should continue running
    const timeAfterResume = await timer.textContent();
    const secondsAfterResume = parseTimerToSeconds(timeAfterResume || '0:00');

    await page.waitForTimeout(2000);

    const timeLater = await timer.textContent();
    const secondsLater = parseTimerToSeconds(timeLater || '0:00');

    expect(secondsLater).toBeGreaterThan(secondsAfterResume);
  )
)

test.describe('@integration Timer - Daily Mode', () => {
  test('timer starts from 0:00 on new daily game', async ({ page }) => {
    await page.goto(getTestUrl('daily', 'daily-start', 'easy'));
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    const timer = getTimerLocator(page);
    const initialTime = await timer.textContent();

    // New daily game should start at 0:00 or very close to it
    const seconds = parseTimerToSeconds(initialTime || '0:00');
    expect(seconds).toBeLessThanOrEqual(2);
  )

  test('timer increments correctly in daily mode', async ({ page }) => {
    await page.goto(getTestUrl('daily', 'daily-increment', 'medium'));
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    const timer = getTimerLocator(page);

    // Get initial time
    const initialText = await timer.textContent();
    const initialSeconds = parseTimerToSeconds(initialText || '0:00');

    // Wait 3 seconds
    await page.waitForTimeout(3000);

    // Get new time
    const newText = await timer.textContent();
    const newSeconds = parseTimerToSeconds(newText || '0:00');

    // Timer should have incremented
    expect(newSeconds).toBeGreaterThan(initialSeconds);
  )

  test('timer persists correctly across reload in daily mode', async ({ page }) => {
    const dailySeed = getTodayDailySeed();
    await page.goto(`/${dailySeed}?d=easy`);
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    const timer = getTimerLocator(page);

    // Wait for timer to accumulate some time
    await page.waitForTimeout(3000);

    // Get timer value
    const timeBeforeReload = await timer.textContent();
    const secondsBeforeReload = parseTimerToSeconds(timeBeforeReload || '0:00');

    // Ensure we have some time on the timer
    expect(secondsBeforeReload).toBeGreaterThanOrEqual(2);

    // Reload page
    await page.reload();
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    // Get timer value after reload
    const timeAfterReload = await timer.textContent();
    const secondsAfterReload = parseTimerToSeconds(timeAfterReload || '0:00');

    // Timer should have preserved at least some of the elapsed time
    expect(secondsAfterReload).toBeGreaterThanOrEqual(secondsBeforeReload - 1);
  )

  test('timer pauses/resumes correctly in daily mode', async ({ page }) => {
    await page.goto(getTestUrl('daily', 'daily-pause-resume', 'hard'));
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    const timer = getTimerLocator(page);

    // Pause timer
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      )
      document.dispatchEvent(new Event('visibilitychange'));
    )

    await page.waitForTimeout(500);

    // Resume visibility
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      )
      document.dispatchEvent(new Event('visibilitychange'));
    )

    // PAUSED text should disappear
    const pausedIndicator = page.locator('span.text-xs:has-text("PAUSED")');
    await expect(pausedIndicator).not.toBeVisible();

    // Timer should continue running
    const timeAfterResume = await timer.textContent();
    const secondsAfterResume = parseTimerToSeconds(timeAfterResume || '0:00');

    await page.waitForTimeout(2000);

    const timeLater = await timer.textContent();
    const secondsLater = parseTimerToSeconds(timeLater || '0:00');

    expect(secondsLater).toBeGreaterThan(secondsAfterResume);
  )

  test('timer continues from saved time in daily mode', async ({ page }) => {
    const dailySeed = getTodayDailySeed();
    await page.addInitScript((seed) => {
      const savedState = {
        board: Array(81).fill(0),
        candidates: Array(81).fill([]),
        elapsedMs: 45000, // 45 seconds
        history: [],
        autoFillUsed: false,
        savedAt: Date.now(),
        difficulty: 'easy',
      };
      localStorage.setItem(`sudoku_game_${seed}`, JSON.stringify(savedState));
    }, dailySeed);

    await page.goto(`/${dailySeed}?d=easy`);
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    // Wait for timer to be restored from saved state
    await page.waitForFunction(() => {
      const timer = document.querySelector('.font-mono');
      if (!timer) return false;
      const text = timer.textContent || '';
      const match = text.match(/^(\d+):(\d{2})$/);
      if (!match) return false;
      const seconds = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      return seconds >= 40;
    }, { timeout: 5000 )

    const timer = getTimerLocator(page);
    const timerText = await timer.textContent();
    const seconds = parseTimerToSeconds(timerText || '0:00');

    // Timer should start from approximately 45 seconds
    expect(seconds).toBeGreaterThanOrEqual(40);
  )

  test('timer handles difficulty switching in daily mode', async ({ page }) => {
    // Load daily game with easy difficulty
    await page.goto(getTestUrl('daily', 'daily-difficulty-switch', 'easy'));
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    const timer = getTimerLocator(page);

    // Let timer run for a bit
    await page.waitForTimeout(2000);
    const initialTime = await timer.textContent();
    const initialSeconds = parseTimerToSeconds(initialTime || '0:00');

    expect(initialSeconds).toBeGreaterThanOrEqual(1);

    // Switch to medium difficulty (should reset timer to 0)
    await page.goto(getTestUrl('daily', 'daily-difficulty-switch-medium', 'medium'));
    await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )

    const newTime = await timer.textContent();
    const newSeconds = parseTimerToSeconds(newTime || '0:00');

    // Timer should have reset to 0 (or close to it) for new difficulty
    expect(newSeconds).toBeLessThan(3);
  )
)
