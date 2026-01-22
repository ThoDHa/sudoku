import { test, expect } from '@playwright/test'
import log from 'loglevel'
const logger = log
logger.setLevel('info')

/**
 * Game Mode Transition E2E Tests
 * 
 * Tests to verify that when user starts a practice game on one difficulty,
 * then uses menu to start a new game on a different difficulty,
 * the game starts correctly with the new difficulty.
 * 
 * Bug Fix: Added key={seed} prop to Game component to force remount
 * when seed changes, ensuring GameContent receives fresh hooks and URL params.
 */

test.describe('Game Mode Transitions', () => {
  test.beforeEach(async ({ page }) => {
    // Clear all saved games before each test
    await page.goto('http://localhost:5173/')
    await page.evaluate(() => {
      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith('sudoku_game_state_')) {
          localStorage.removeItem(key)
        }
      })
    })
  })

  test('should change difficulty from impossible to easy via menu', async ({ page }) => {
    // Step 1: Navigate to practice game with impossible difficulty
    await page.goto('http://localhost:5173/P9999999999?d=impossible')
    await page.waitForLoadState('networkidle')

    // Verify we're on impossible puzzle
    const impossibleUrl = page.url()
    expect(impossibleUrl).toContain('d=impossible')
    logger.info(`Starting URL: ${impossibleUrl}`)

    // Step 2: Open menu and select "New Game" → "Easy"
    await page.click('button[aria-label="Menu"]')
    await page.waitForSelector('text=New Game', { state: 'visible', timeout: 10000 })
    
    await page.click('text=New Game')
    await page.waitForSelector('text=Easy', { state: 'visible', timeout: 10000 })
    
    // Step 3: Click "Easy" to start new game
    const easyPromise = page.waitForNavigation({ url: /\/P\d+\?d=easy$/, timeout: 15000 })
    await page.click('text=Easy')
    
    // Wait for navigation to complete
    await easyPromise

    // Step 4: Verify new game is on easy difficulty
    const easyUrl = page.url()
    logger.info(`After navigation URL: ${easyUrl}`)
    
    // Verify URL has easy difficulty parameter
    expect(easyUrl).toMatch(/\?d=easy$/)
    
    // Verify URL does NOT still have impossible difficulty
    expect(easyUrl).not.toContain('d=impossible')
  })

  test('should change difficulty from easy to impossible via menu', async ({ page }) => {
    // Step 1: Navigate to practice game with easy difficulty
    await page.goto('http://localhost:5173/P8888888888?d=easy')
    await page.waitForLoadState('networkidle')

    // Verify we're on easy puzzle
    const easyUrl = page.url()
    expect(easyUrl).toContain('d=easy')
    logger.info(`Starting URL: ${easyUrl}`)

    // Step 2: Open menu and select "New Game" → "Impossible"
    await page.click('button[aria-label="Menu"]')
    await page.waitForSelector('text=New Game', { state: 'visible', timeout: 10000 })
    
    await page.click('text=New Game')
    await page.waitForSelector('text=Impossible', { state: 'visible', timeout: 10000 })
    
    const impossiblePromise = page.waitForNavigation({ url: /\/P\d+\?d=impossible$/, timeout: 15000 })
    await page.click('text=Impossible')
    
    await impossiblePromise

    // Step 3: Verify new game is on impossible difficulty
    const impossibleUrl = page.url()
    logger.info(`After navigation URL: ${impossibleUrl}`)
    
    // Verify URL has impossible difficulty parameter
    expect(impossibleUrl).toMatch(/\?d=impossible$/)
    
    // Verify URL does NOT still have easy difficulty
    expect(impossibleUrl).not.toContain('d=easy')
  })

  test('should preserve difficulty when restarting same puzzle', async ({ page }) => {
    // Navigate to practice game with medium difficulty
    await page.goto('http://localhost:5173/P7777777777?d=medium')
    await page.waitForLoadState('networkidle')

    const mediumUrl = page.url()
    expect(mediumUrl).toMatch(/\?d=medium$/)
    logger.info(`Starting URL: ${mediumUrl}`)

    // Open menu and restart puzzle
    await page.click('button[aria-label="Menu"]')
    await page.waitForSelector('text=Restart Puzzle', { state: 'visible', timeout: 10000 })
    
    await page.click('text=Restart Puzzle')
    
    await page.waitForTimeout(500) // Wait for restart

    // Verify same difficulty after restart
    const currentUrl = page.url()
    expect(currentUrl).toMatch(/\?d=medium$/)
  })
})
