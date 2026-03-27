import { test, expect, Page } from '@playwright/test';
import { setupGameAndWaitForBoard } from '../utils/board-wait';

/**
 * Hint Candidate Highlighting Bug Test
 * 
 * Reproduces bug where when a cell has multiple candidates and hint identifies
 * only ONE as valid, ALL candidates are highlighted green instead of just the correct one.
 * 
 * Bug report: User provided debug output showing the issue on puzzle daily-2026-03-21,
 * difficulty impossible, puzzleId static-162.
 * 
 * Root cause analysis:
 * In Board.tsx line 210:
 *   const isRelevantDigit = singleDigit ? d === singleDigit : isTarget
 * When singleDigit is null (no highlightedDigit) but isTarget is true (cell is in hint targets),
 * ALL candidates in that cell become "relevant" and get highlighted green.
 * 
 * Expected: Only the digit being placed should be green, other candidates should be:
 * - Neutral (if not eliminated)
 * - Red with strikethrough (if eliminated)
 * 
 * Tag: @integration @hints @bug
 */

test.describe('@integration Hint Candidate Highlighting Bug', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
      localStorage.setItem('sudoku_preferences', JSON.stringify({ showDailyReminder: false }));
    });
  });

  function getHintButton(page: Page) {
    return page.locator('button[title*="hint" i], button:has-text("💡"), button:has-text("Hint")').first();
  }

  async function dismissModals(page: Page) {
    const modalButtons = [
      page.getByRole('button', { name: /Got it/i }),
      page.getByRole('button', { name: /Let Me Fix It/i }),
      page.getByRole('button', { name: /Check & Fix/i }),
      page.getByRole('button', { name: /Close/i }),
      page.getByRole('button', { name: /OK/i }),
    ];
    
    for (const button of modalButtons) {
      if (await button.isVisible().catch(() => false)) {
        await button.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(100);
        break;
      }
    }
    
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(50);
  }

  async function waitForHintProcessing(page: Page) {
    await Promise.race([
      page.locator('.fixed.z-50, [class*="toast"], [role="alert"]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}),
    ]);
    await page.waitForTimeout(100);
    await dismissModals(page);
  }

  async function openMenu(page: Page): Promise<void> {
    const menuButton = page.locator('button[title="Menu"]').first();
    await menuButton.click();
    await page.waitForTimeout(300);
  }

  async function clickAutoFillNotes(page: Page): Promise<void> {
    await openMenu(page);
    
    const autoFillButton = page.locator('button:has-text("Auto-fill Notes")');
    await autoFillButton.waitFor({ state: 'visible', timeout: 5000 });
    await autoFillButton.click();
    await page.waitForTimeout(500);
    
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(100);
  }

  async function captureHighlightState(page: Page) {
    return await page.evaluate(() => {
      const results: { 
        idx: number; 
        greenDigits: number[]; 
        redDigits: number[];
        allCandidates: number[] 
      }[] = [];
      const cells = document.querySelectorAll('[data-cell-idx]');
      
      cells.forEach((cell) => {
        const idx = parseInt(cell.getAttribute('data-cell-idx') || '-1');
        if (idx < 0) return;
        
        const candidateGrid = cell.querySelector('.candidate-grid');
        if (!candidateGrid) return;
        
        const greenDigits: number[] = [];
        const redDigits: number[] = [];
        const allCandidates: number[] = [];
        
        const digits = candidateGrid.querySelectorAll('.candidate-digit');
        digits.forEach((digitEl, i) => {
          const text = digitEl.textContent?.trim();
          const digit = i + 1;
          
          if (text && /^[1-9]$/.test(text)) {
            allCandidates.push(digit);
            
            const classes = digitEl.className || '';
            
            if (classes.includes('text-hint-text')) {
              greenDigits.push(digit);
            }
            if (classes.includes('text-error-text') || classes.includes('line-through')) {
              redDigits.push(digit);
            }
          }
        });
        
        if (greenDigits.length > 0 || redDigits.length > 0) {
          results.push({ idx, greenDigits, redDigits, allCandidates });
        }
      });
      
      return results;
    });
  }

  test('BUG: only the correct candidate should be highlighted green, not all candidates', async ({ page }) => {
    await setupGameAndWaitForBoard(page, { 
      seed: 'daily-2026-03-21', 
      difficulty: 'impossible',
      checkWasm: true
    });
    
    await clickAutoFillNotes(page);
    
    const hintButton = getHintButton(page);
    await expect(hintButton).toBeEnabled({ timeout: 10000 });
    
    for (let i = 0; i < 10; i++) {
      await dismissModals(page);
      if (await hintButton.isEnabled().catch(() => false)) {
        await hintButton.click();
        await waitForHintProcessing(page);
      }
      await page.waitForTimeout(100);
    }
    
    const cellsWithGreenCandidates = await captureHighlightState(page);
    
    const buggyCells = cellsWithGreenCandidates.filter(cell => 
      cell.allCandidates.length > 1 && cell.greenDigits.length > 1
    );
    
    for (const cell of cellsWithGreenCandidates) {
      if (cell.allCandidates.length > 1) {
        expect(cell.greenDigits.length).toBe(1);
      }
    }
  });

  test('multi-hint: trigger many hints to catch the bug in various states', async ({ page }) => {
    await setupGameAndWaitForBoard(page, { 
      seed: 'daily-2026-03-21', 
      difficulty: 'impossible',
      checkWasm: true
    });
    
    await clickAutoFillNotes(page);
    
    const hintButton = getHintButton(page);
    await expect(hintButton).toBeEnabled({ timeout: 10000 });
    
    let buggyCellsFound = 0;
    
    for (let i = 0; i < 20; i++) {
      await dismissModals(page);
      
      if (!(await hintButton.isEnabled().catch(() => false))) {
        break;
      }
      
      await hintButton.click();
      await page.waitForTimeout(300);
      
      const highlightState = await captureHighlightState(page);
      
      const buggyCells = highlightState.filter(cell => 
        cell.allCandidates.length > 1 && cell.greenDigits.length > 1
      );
      
      buggyCellsFound += buggyCells.length;
      
      await dismissModals(page);
      await page.waitForTimeout(100);
    }
    
    expect(buggyCellsFound).toBe(0);
  });

  test('immediate check: capture state right after hint click before dismissal', async ({ page }) => {
    await setupGameAndWaitForBoard(page, { 
      seed: 'daily-2026-03-21', 
      difficulty: 'impossible',
      checkWasm: true
    });
    
    await clickAutoFillNotes(page);
    
    const hintButton = getHintButton(page);
    await expect(hintButton).toBeEnabled({ timeout: 10000 });
    
    await dismissModals(page);
    await hintButton.click();
    
    await page.waitForTimeout(50);
    
    const immediateHighlight = await captureHighlightState(page);
    
    await page.waitForTimeout(200);
    
    const afterWaitHighlight = await captureHighlightState(page);
    
    const buggyCellsImmediate = immediateHighlight.filter(cell => 
      cell.allCandidates.length > 1 && cell.greenDigits.length > 1
    );
    
    const buggyCellsAfter = afterWaitHighlight.filter(cell => 
      cell.allCandidates.length > 1 && cell.greenDigits.length > 1
    );
    
    expect(buggyCellsImmediate.length).toBe(0);
    expect(buggyCellsAfter.length).toBe(0);
  });

  test('check cell background highlighting and candidate highlighting separately', async ({ page }) => {
    await setupGameAndWaitForBoard(page, { 
      seed: 'daily-2026-03-21', 
      difficulty: 'impossible',
      checkWasm: true
    });
    
    await clickAutoFillNotes(page);
    
    const hintButton = getHintButton(page);
    await expect(hintButton).toBeEnabled({ timeout: 10000 });
    
    for (let i = 0; i < 5; i++) {
      await dismissModals(page);
      if (await hintButton.isEnabled().catch(() => false)) {
        await hintButton.click();
        await page.waitForTimeout(200);
      }
    }
    
    const highlightAnalysis = await page.evaluate(() => {
      const results: {
        cellsWithGreenCandidates: { idx: number; greenDigits: number[]; allCandidates: number[] }[];
      } = {
        cellsWithGreenCandidates: []
      };
      
      const cells = document.querySelectorAll('[data-cell-idx]');
      
      cells.forEach((cell) => {
        const idx = parseInt(cell.getAttribute('data-cell-idx') || '-1');
        if (idx < 0) return;
        
        const candidateGrid = cell.querySelector('.candidate-grid');
        if (!candidateGrid) return;
        
        const greenDigits: number[] = [];
        const allCandidates: number[] = [];
        
        const digits = candidateGrid.querySelectorAll('.candidate-digit');
        digits.forEach((digitEl, i) => {
          const text = digitEl.textContent?.trim();
          const digit = i + 1;
          
          if (text && /^[1-9]$/.test(text)) {
            allCandidates.push(digit);
            
            const digitClasses = digitEl.className || '';
            if (digitClasses.includes('text-hint-text')) {
              greenDigits.push(digit);
            }
          }
        });
        
        if (greenDigits.length > 0) {
          results.cellsWithGreenCandidates.push({ idx, greenDigits, allCandidates });
        }
      });
      
      return results;
    });
    
    const buggyCells = highlightAnalysis.cellsWithGreenCandidates.filter(cell => 
      cell.allCandidates.length > 1 && cell.greenDigits.length > 1
    );
    
    expect(buggyCells.length).toBe(0);
  });
});
