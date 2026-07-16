import { test, expect, type Page } from '@playwright/test'

/**
 * Custom Puzzle Integration Tests
 *
 * Tests for the /custom route, entering custom puzzles,
 * and validation of invalid puzzle inputs.
 *
 * Tag: @integration @custom
 */

// The /custom page renders a Board (role="grid") with digit buttons and a
// clipboard-driven Paste button; there is no <input>/<textarea>. The error
// notice is a div styled with Tailwind red utilities (no role="alert").
const BOARD = '[role="grid"]'
const ERROR_NOTICE = '.bg-red-100'
const PASTE_BUTTON = 'button:has-text("Paste")'
const VALIDATE_BUTTON = 'button:has-text("Validate & Play")'
const CLEAR_BUTTON = 'button:has-text("Clear All")'

async function pastePuzzle(page: Page, puzzle: string): Promise<void> {
  await page.evaluate((text) => {
    const store = { text }
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (t: string) => {
          store.text = t
        },
        readText: async () => store.text,
      },
      configurable: true,
    })
  }, puzzle)
  await page.locator(PASTE_BUTTON).click()
}

test.describe('@integration Custom Puzzle - Page Load', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true')
      const store: { text: string } = { text: '' }
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (t: string) => {
            store.text = t
          },
          readText: async () => store.text,
        },
        configurable: true,
      })
    })
  })

  test('custom puzzle page loads', async ({ page }) => {
    await page.goto('/custom')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('text=Custom')).toBeVisible()
  })

  test('custom page has input area or empty board', async ({ page }) => {
    await page.goto('/custom')

    await expect(page.locator(BOARD)).toBeVisible({ timeout: 5000 })
  })

  test('custom page has play/validate button', async ({ page }) => {
    await page.goto('/custom')

    await expect(page.locator(VALIDATE_BUTTON)).toBeVisible({ timeout: 5000 })
  })
})

test.describe('@integration Custom Puzzle - Input', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true')
      const store: { text: string } = { text: '' }
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (t: string) => {
            store.text = t
          },
          readText: async () => store.text,
        },
        configurable: true,
      })
    })
    await page.goto('/custom')

    await expect(page.locator(BOARD)).toBeVisible({ timeout: 5000 })
  })

  test('can enter digits into custom puzzle board', async ({ page }) => {
    const cell = page.locator('[role="gridcell"][aria-label*="Row 5, Column 1"]')
    await expect(cell).toBeVisible()
    await cell.click()

    await page.locator('button:text-is("5")').click()

    await expect(cell).toContainText('5')
  })

  test('can paste puzzle string', async ({ page }) => {
    const puzzleString =
      '003020600900305001001806400008102900700000008006708200002609500800203009005010300'
    await pastePuzzle(page, puzzleString)

    const givenCell = page.locator('[role="gridcell"][aria-label*="Row 1, Column 3"]')
    await expect(givenCell).toContainText('3', { timeout: 5000 })
  })

  test('clear button resets custom input', async ({ page }) => {
    const cell1 = page.locator('[role="gridcell"][aria-label*="Row 5, Column 1"]')
    const cell2 = page.locator('[role="gridcell"][aria-label*="Row 5, Column 2"]')

    await cell1.click()
    await page.locator('button:text-is("1")').click()
    await expect(cell1).toContainText('1')

    await cell2.click()
    await page.locator('button:text-is("2")').click()
    await expect(cell2).toContainText('2')

    await page.locator(CLEAR_BUTTON).click()

    await expect(cell1).not.toContainText(/[1-9]/)
    await expect(cell2).not.toContainText(/[1-9]/)
  })
})

test.describe('@integration Custom Puzzle - Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true')
      const store: { text: string } = { text: '' }
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (t: string) => {
            store.text = t
          },
          readText: async () => store.text,
        },
        configurable: true,
      })
    })
    await page.goto('/custom')

    await expect(page.locator(BOARD)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(VALIDATE_BUTTON)).toBeVisible()
  })

  test('valid puzzle is accepted', async ({ page }) => {
    const validPuzzle =
      '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
    await pastePuzzle(page, validPuzzle)

    await expect(page.locator('[role="gridcell"][aria-label*="Row 1, Column 2"]')).toContainText(
      '3',
    )

    await page.locator(VALIDATE_BUTTON).click()

    await expect(page).toHaveURL(/\/c\//, { timeout: 15000 })
  })

  test('invalid puzzle shows error - too short', async ({ page }) => {
    await pastePuzzle(page, '53007')

    await expect(page.getByText(/Expected 81 digits/i)).toBeVisible({ timeout: 5000 })
  })

  test('invalid puzzle shows error - duplicate in row', async ({ page }) => {
    const invalidPuzzle =
      '550070000600195000098000060800060003400803001700020006060000280000419005000080079'
    await pastePuzzle(page, invalidPuzzle)

    await page.locator(VALIDATE_BUTTON).click()

    await expect(page).toHaveURL(/\/custom/, { timeout: 10000 })
    await expect(page.locator(ERROR_NOTICE)).toBeVisible({ timeout: 10000 })
  })

  test('invalid puzzle shows error - invalid characters', async ({ page }) => {
    await pastePuzzle(
      page,
      'abc070000600195000098000060800060003400803001700020006060000280000419005000080xyz',
    )

    await expect(page.getByText(/Expected 81 digits/i)).toBeVisible({ timeout: 5000 })
  })

  test('unsolvable puzzle shows error', async ({ page }) => {
    const unsolvablePuzzle =
      '123456789000000000000000000000000000000000000000000000000000000000000000123456789'
    await pastePuzzle(page, unsolvablePuzzle)

    await page.locator(VALIDATE_BUTTON).click()

    await expect(page).toHaveURL(/\/custom/, { timeout: 15000 })
    await expect(page.locator(ERROR_NOTICE)).toBeVisible({ timeout: 15000 })
  })
})

test.describe('@integration Custom Puzzle - Board Input Mode', () => {
  test('entering all cells manually works', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true')
    })
    await page.goto('/custom')

    const cells = page.locator('[role="gridcell"]')
    await expect(cells.first()).toBeVisible({ timeout: 5000 })
    await expect(cells).toHaveCount(81, { timeout: 5000 })

    const testDigits = [
      { row: 5, col: 1, digit: '5' },
      { row: 5, col: 2, digit: '3' },
      { row: 5, col: 5, digit: '7' },
    ]

    for (const { row, col, digit } of testDigits) {
      const cell = page.locator(`[role="gridcell"][aria-label*="Row ${row}, Column ${col}"]`)
      await cell.scrollIntoViewIfNeeded()
      await cell.click()

      await page.locator(`button:text-is("${digit}")`).click()

      await expect(cell).toContainText(digit)
    }
  })
})

test.describe('@integration Custom Puzzle - Mobile', () => {
  test.use({ hasTouch: true })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true')
    })
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/custom')

    await expect(page.locator('text=Custom')).toBeVisible({ timeout: 5000 })
  })

  test('custom page is usable on mobile', async ({ page }) => {
    await expect(page.locator('text=Custom')).toBeVisible()

    await expect(page.locator(VALIDATE_BUTTON)).toBeVisible()
  })

  test('can enter puzzle on mobile', async ({ page }) => {
    await expect(page.locator(BOARD)).toBeVisible()

    const cell = page.locator('[role="gridcell"][aria-label*="Row 5, Column 1"]')
    await cell.scrollIntoViewIfNeeded()
    await cell.tap()

    await page.locator('button:text-is("9")').tap()

    await expect(cell).toContainText('9')
  })
})
