/**
 * Sudoku Game Interaction API for Customer Simulations
 * 
 * This module provides functions for agents to interact with the Sudoku game
 * via Playwright. Each function returns structured data about what happened.
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';

export interface GameState {
  board: number[]; // 81 cells, 0 = empty
  selectedCell: number | null;
  timer: string;
  difficulty: string;
  isComplete: boolean;
  notesMode: boolean;
  hintsAvailable: boolean;
  errorMessage: string | null;
}

export interface ActionResult {
  success: boolean;
  message: string;
  gameState?: GameState;
  error?: string;
}

export class SudokuGameSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private baseUrl: string;
  private deviceType: 'desktop' | 'tablet' | 'mobile';

  constructor(baseUrl: string = 'http://localhost', deviceType: 'desktop' | 'tablet' | 'mobile' = 'desktop') {
    this.baseUrl = baseUrl;
    this.deviceType = deviceType;
  }

  async start(): Promise<ActionResult> {
    try {
      this.browser = await chromium.launch({ headless: true });
      
      const viewport = this.getViewport();
      this.context = await this.browser.newContext({ viewport });
      this.page = await this.context.newPage();
      
      return { success: true, message: 'Browser session started' };
    } catch (error) {
      return { success: false, message: 'Failed to start browser', error: String(error) };
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  private getViewport(): { width: number; height: number } {
    switch (this.deviceType) {
      case 'mobile': return { width: 375, height: 667 };
      case 'tablet': return { width: 768, height: 1024 };
      case 'desktop': return { width: 1440, height: 900 };
    }
  }

  async goToHomepage(): Promise<ActionResult> {
    if (!this.page) return { success: false, message: 'No page available' };
    
    try {
      await this.page.goto(this.baseUrl);
      await this.page.waitForLoadState('networkidle');
      
      const title = await this.page.title();
      return { success: true, message: `Loaded homepage: ${title}` };
    } catch (error) {
      return { success: false, message: 'Failed to load homepage', error: String(error) };
    }
  }

  async startGame(difficulty: 'easy' | 'medium' | 'hard' | 'expert'): Promise<ActionResult> {
    if (!this.page) return { success: false, message: 'No page available' };
    
    try {
      await this.page.goto(`${this.baseUrl}/play`);
      await this.page.waitForLoadState('networkidle');
      
      const button = this.page.locator(`button:has-text("${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}")`).first();
      await button.click();
      
      await this.page.waitForURL(/\/game\//, { timeout: 15000 });
      await this.page.waitForSelector('.game-background', { timeout: 15000 });
      
      const state = await this.getGameState();
      return { success: true, message: `Started ${difficulty} game`, gameState: state };
    } catch (error) {
      return { success: false, message: `Failed to start ${difficulty} game`, error: String(error) };
    }
  }

  async getGameState(): Promise<GameState> {
    if (!this.page) throw new Error('No page available');
    
    const board: number[] = [];
    const cells = await this.page.locator('.sudoku-cell').all();
    
    for (const cell of cells) {
      const text = await cell.textContent();
      const value = text ? parseInt(text.trim()) || 0 : 0;
      board.push(value);
    }
    
    const timer = await this.page.locator('text=/\\d+:\\d+/').first().textContent().catch(() => '0:00') || '0:00';
    const isComplete = await this.page.locator('text=/Completed|Congratulations/i').isVisible().catch(() => false);
    const notesButton = this.page.locator('button[title*="Notes"]');
    const notesMode = (await notesButton.getAttribute('class'))?.includes('active') || false;
    
    return {
      board,
      selectedCell: null,
      timer,
      difficulty: 'unknown',
      isComplete,
      notesMode,
      hintsAvailable: true,
      errorMessage: null
    };
  }

  async clickCell(index: number): Promise<ActionResult> {
    if (!this.page) return { success: false, message: 'No page available' };
    
    try {
      const cells = this.page.locator('.sudoku-cell');
      await cells.nth(index).click();
      return { success: true, message: `Clicked cell ${index}` };
    } catch (error) {
      return { success: false, message: `Failed to click cell ${index}`, error: String(error) };
    }
  }

  async enterNumber(digit: number): Promise<ActionResult> {
    if (!this.page) return { success: false, message: 'No page available' };
    
    try {
      // Try keyboard first
      await this.page.keyboard.press(digit.toString());
      return { success: true, message: `Entered digit ${digit}` };
    } catch (error) {
      // Fallback to button click
      try {
        const button = this.page.locator(`button:has-text("${digit}")`).first();
        await button.click();
        return { success: true, message: `Entered digit ${digit} via button` };
      } catch (e) {
        return { success: false, message: `Failed to enter digit ${digit}`, error: String(e) };
      }
    }
  }

  async useHint(): Promise<ActionResult> {
    if (!this.page) return { success: false, message: 'No page available' };
    
    try {
      const hintButton = this.page.getByRole('button', { name: /Hint/i });
      await hintButton.click();
      await this.page.waitForTimeout(1000); // Wait for hint animation
      
      const state = await this.getGameState();
      return { success: true, message: 'Used hint', gameState: state };
    } catch (error) {
      return { success: false, message: 'Failed to use hint', error: String(error) };
    }
  }

  async undo(): Promise<ActionResult> {
    if (!this.page) return { success: false, message: 'No page available' };
    
    try {
      await this.page.keyboard.press('Control+z');
      return { success: true, message: 'Undo performed' };
    } catch (error) {
      return { success: false, message: 'Failed to undo', error: String(error) };
    }
  }

  async redo(): Promise<ActionResult> {
    if (!this.page) return { success: false, message: 'No page available' };
    
    try {
      await this.page.keyboard.press('Control+Shift+z');
      return { success: true, message: 'Redo performed' };
    } catch (error) {
      return { success: false, message: 'Failed to redo', error: String(error) };
    }
  }

  async toggleNotes(): Promise<ActionResult> {
    if (!this.page) return { success: false, message: 'No page available' };
    
    try {
      await this.page.keyboard.press('n');
      return { success: true, message: 'Toggled notes mode' };
    } catch (error) {
      return { success: false, message: 'Failed to toggle notes', error: String(error) };
    }
  }

  async validate(): Promise<ActionResult> {
    if (!this.page) return { success: false, message: 'No page available' };
    
    try {
      await this.page.keyboard.press('v');
      await this.page.waitForTimeout(500);
      
      // Check for validation message
      const message = await this.page.locator('[role="alert"], .toast, .validation-message').textContent().catch(() => null);
      return { success: true, message: message || 'Validation requested' };
    } catch (error) {
      return { success: false, message: 'Failed to validate', error: String(error) };
    }
  }

  async erase(): Promise<ActionResult> {
    if (!this.page) return { success: false, message: 'No page available' };
    
    try {
      await this.page.keyboard.press('Backspace');
      return { success: true, message: 'Erased cell' };
    } catch (error) {
      return { success: false, message: 'Failed to erase', error: String(error) };
    }
  }

  async navigateWithArrows(direction: 'up' | 'down' | 'left' | 'right'): Promise<ActionResult> {
    if (!this.page) return { success: false, message: 'No page available' };
    
    try {
      const key = `Arrow${direction.charAt(0).toUpperCase() + direction.slice(1)}`;
      await this.page.keyboard.press(key);
      return { success: true, message: `Navigated ${direction}` };
    } catch (error) {
      return { success: false, message: `Failed to navigate ${direction}`, error: String(error) };
    }
  }

  async openMenu(): Promise<ActionResult> {
    if (!this.page) return { success: false, message: 'No page available' };
    
    try {
      const menuButton = this.page.locator('header button').last();
      await menuButton.click();
      await this.page.waitForTimeout(300);
      return { success: true, message: 'Opened menu' };
    } catch (error) {
      return { success: false, message: 'Failed to open menu', error: String(error) };
    }
  }

  async toggleDarkMode(): Promise<ActionResult> {
    if (!this.page) return { success: false, message: 'No page available' };
    
    try {
      await this.openMenu();
      const themeToggle = this.page.locator('button:has-text("Dark"), button:has-text("Light")').first();
      if (await themeToggle.isVisible()) {
        await themeToggle.click();
        return { success: true, message: 'Toggled dark mode' };
      }
      return { success: false, message: 'Theme toggle not found' };
    } catch (error) {
      return { success: false, message: 'Failed to toggle dark mode', error: String(error) };
    }
  }

  async takeScreenshot(name: string): Promise<ActionResult> {
    if (!this.page) return { success: false, message: 'No page available' };
    
    try {
      await this.page.screenshot({ path: `screenshots/${name}.png` });
      return { success: true, message: `Screenshot saved: ${name}.png` };
    } catch (error) {
      return { success: false, message: 'Failed to take screenshot', error: String(error) };
    }
  }

  async getVisibleElements(): Promise<string[]> {
    if (!this.page) return [];
    
    const elements: string[] = [];
    
    // Check for various UI elements
    const checks = [
      { selector: '.sudoku-board', name: 'game_board' },
      { selector: 'button[title="Undo"]', name: 'undo_button' },
      { selector: 'button[title="Redo"]', name: 'redo_button' },
      { selector: 'button[title*="Notes"]', name: 'notes_button' },
      { selector: 'button[title="Erase"]', name: 'erase_button' },
      { selector: 'button:has-text("Hint")', name: 'hint_button' },
      { selector: 'text=/\\d+:\\d+/', name: 'timer' },
      { selector: 'header', name: 'header' },
    ];
    
    for (const check of checks) {
      if (await this.page.locator(check.selector).first().isVisible().catch(() => false)) {
        elements.push(check.name);
      }
    }
    
    return elements;
  }
}

// Export a factory function for creating sessions
export async function createGameSession(
  deviceType: 'desktop' | 'tablet' | 'mobile' = 'desktop',
  baseUrl: string = 'http://localhost'
): Promise<SudokuGameSession> {
  const session = new SudokuGameSession(baseUrl, deviceType);
  await session.start();
  return session;
}
