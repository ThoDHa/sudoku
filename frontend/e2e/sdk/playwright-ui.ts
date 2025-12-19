/**
 * Sudoku SDK - Playwright UI Implementation
 *
 * Uses Playwright Page to interact with the Sudoku UI through DOM interactions.
 * Implements the same interface as API SDKs but through clicking cells, buttons,
 * and reading DOM state.
 */

import type { Page } from '@playwright/test';
import { SudokuSDK } from './base';
import type {
  SDKOptions,
  SDKResponse,
  Difficulty,
  Board,
  Candidates,
  HealthResponse,
  DailyResponse,
  PuzzleResponse,
  AnalyzeResponse,
  SessionStartRequest,
  SessionStartResponse,
  SolveRequest,
  SolveNextResponse,
  SolveAllResponse,
  SolveFullResponse,
  ValidateRequest,
  ValidateResponse,
  CustomValidateRequest,
  CustomValidateResponse,
  Move,
  SolveStepResult,
} from './types';

export interface PlaywrightUISDKOptions extends SDKOptions {
  page: Page;
}

export class PlaywrightUISDK extends SudokuSDK {
  private page: Page;
  
  // Internal state tracking
  private currentBoard: Board = [];
  private currentCandidates: Candidates = [];
  private simulatedToken: string = '';
  private currentSeed: string = '';
  private currentDifficulty: Difficulty = 'medium';
  private stepIndex: number = 0;

  constructor(options: PlaywrightUISDKOptions) {
    super(options);
    this.page = options.page;
  }

  // ============================================
  // Abstract Method Implementations
  // ============================================

  /**
   * GET requests through UI navigation and DOM reading
   */
  protected async get<T>(path: string): Promise<SDKResponse<T>> {
    // The UI SDK doesn't make HTTP requests directly
    // This is implemented for interface compliance
    return {
      ok: false,
      status: 0,
      error: 'PlaywrightUISDK does not support direct HTTP requests. Use specific methods.',
    };
  }

  /**
   * POST requests through UI interactions
   */
  protected async post<T>(path: string, body: unknown): Promise<SDKResponse<T>> {
    // The UI SDK doesn't make HTTP requests directly
    // This is implemented for interface compliance
    return {
      ok: false,
      status: 0,
      error: 'PlaywrightUISDK does not support direct HTTP requests. Use specific methods.',
    };
  }

  // ============================================
  // Health & Info Endpoints (UI Simulation)
  // ============================================

  async health(): Promise<SDKResponse<HealthResponse>> {
    try {
      // Check if the page can load the app
      await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });
      const title = await this.page.title();
      
      return {
        ok: true,
        status: 200,
        data: {
          status: 'ok',
          version: 'ui-sdk',
        },
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Failed to load page',
      };
    }
  }

  async daily(): Promise<SDKResponse<DailyResponse>> {
    try {
      await this.delay();
      // Navigate to home and look for daily puzzle info
      await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });
      
      // The daily seed might be exposed in the page or we can extract from URL after clicking
      const today = new Date().toISOString().split('T')[0];
      
      return {
        ok: true,
        status: 200,
        data: {
          date_utc: today,
          seed: `daily-${today}`,
          puzzle_index: 0,
        },
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Failed to get daily',
      };
    }
  }

  // ============================================
  // Puzzle Endpoints (UI Navigation)
  // ============================================

  async getPuzzle(seed: string, difficulty: Difficulty = 'medium'): Promise<SDKResponse<PuzzleResponse>> {
    try {
      await this.delay();
      
      // Navigate to the game URL with seed and difficulty
      const url = `${this.baseUrl}/game/${seed}?d=${difficulty}`;
      await this.page.goto(url, { waitUntil: 'networkidle' });
      
      // Wait for the game board to load
      await this.page.waitForSelector('.sudoku-cell', { timeout: this.timeout });
      
      // Read the initial board state (givens)
      const board = await this.readBoardFromDOM();
      
      // Store state
      this.currentBoard = [...board];
      this.currentCandidates = Array(81).fill([]).map(() => []);
      this.currentSeed = seed;
      this.currentDifficulty = difficulty;
      this.stepIndex = 0;
      
      return {
        ok: true,
        status: 200,
        data: {
          puzzle_id: `${seed}-${difficulty}`,
          seed,
          difficulty,
          givens: board,
          puzzle_index: 0,
        },
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Failed to get puzzle',
      };
    }
  }

  async analyzePuzzle(seed: string, difficulty: Difficulty = 'medium'): Promise<SDKResponse<AnalyzeResponse>> {
    // UI doesn't directly support analysis, return simulated response
    return {
      ok: true,
      status: 200,
      data: {
        seed,
        difficulty,
        givens_count: 0,
        required_difficulty: difficulty,
        status: 'ui-simulated',
        techniques: {},
      },
    };
  }

  // ============================================
  // Session Endpoints (UI Simulation)
  // ============================================

  async startSession(request: SessionStartRequest): Promise<SDKResponse<SessionStartResponse>> {
    try {
      await this.delay();
      
      // The game auto-starts a session when loaded
      // Generate a simulated token based on the request
      this.simulatedToken = `ui-token-${request.seed}-${request.device_id}-${Date.now()}`;
      this.currentSeed = request.seed;
      this.currentDifficulty = request.difficulty;
      
      // If we're not already on the game page, navigate there
      const currentUrl = this.page.url();
      const expectedUrlPattern = `/game/${request.seed}`;
      
      if (!currentUrl.includes(expectedUrlPattern)) {
        const url = `${this.baseUrl}/game/${request.seed}?d=${request.difficulty}`;
        await this.page.goto(url, { waitUntil: 'networkidle' });
        await this.page.waitForSelector('.sudoku-cell', { timeout: this.timeout });
      }
      
      // Read current board state
      this.currentBoard = await this.readBoardFromDOM();
      this.currentCandidates = await this.readCandidatesFromDOM();
      
      return {
        ok: true,
        status: 200,
        data: {
          token: this.simulatedToken,
          puzzle_id: `${request.seed}-${request.difficulty}`,
          started_at: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Failed to start session',
      };
    }
  }

  // ============================================
  // Solve Endpoints (UI Interactions)
  // ============================================

  async solveNext(request: SolveRequest): Promise<SDKResponse<SolveNextResponse>> {
    try {
      await this.delay();
      
      // Read current board state before hint
      const boardBefore = await this.readBoardFromDOM();
      const candidatesBefore = await this.readCandidatesFromDOM();
      
      // Click the hint button
      await this.clickHint();
      
      // Wait for the move to be applied
      await this.waitForMove(boardBefore, candidatesBefore);
      
      // Read new state after hint
      const boardAfter = await this.readBoardFromDOM();
      const candidatesAfter = await this.readCandidatesFromDOM();
      
      // Determine what changed
      const move = this.detectMove(boardBefore, boardAfter, candidatesBefore, candidatesAfter);
      
      this.currentBoard = boardAfter;
      this.currentCandidates = candidatesAfter;
      this.stepIndex++;
      
      return {
        ok: true,
        status: 200,
        data: {
          board: boardAfter,
          candidates: candidatesAfter,
          move,
        },
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Failed to solve next',
      };
    }
  }

  async solveAll(request: SolveRequest): Promise<SDKResponse<SolveAllResponse>> {
    try {
      await this.delay();
      
      const moves: SolveStepResult[] = [];
      let solved = false;
      let iterations = 0;
      const maxIterations = 100;
      
      while (!solved && iterations < maxIterations) {
        const boardBefore = await this.readBoardFromDOM();
        const candidatesBefore = await this.readCandidatesFromDOM();
        
        // Check if already solved
        if (this.isSolved(boardBefore)) {
          solved = true;
          break;
        }
        
        // Click hint
        await this.clickHint();
        await this.waitForMove(boardBefore, candidatesBefore);
        
        const boardAfter = await this.readBoardFromDOM();
        const candidatesAfter = await this.readCandidatesFromDOM();
        
        const move = this.detectMove(boardBefore, boardAfter, candidatesBefore, candidatesAfter);
        
        if (move) {
          moves.push({
            board: boardAfter,
            candidates: candidatesAfter,
            move,
          });
        }
        
        // Check if no progress
        if (JSON.stringify(boardBefore) === JSON.stringify(boardAfter) &&
            JSON.stringify(candidatesBefore) === JSON.stringify(candidatesAfter)) {
          break;
        }
        
        iterations++;
      }
      
      const finalBoard = await this.readBoardFromDOM();
      solved = this.isSolved(finalBoard);
      
      return {
        ok: true,
        status: 200,
        data: {
          moves,
          solved,
          finalBoard,
        },
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Failed to solve all',
      };
    }
  }

  async solveFull(
    token: string,
    board: Board,
    mode: 'human' | 'fast' = 'human'
  ): Promise<SDKResponse<SolveFullResponse>> {
    try {
      await this.delay();
      
      // Use auto-solve feature from menu
      await this.clickAutoSolve();
      
      // Wait for solve to complete by checking for completion or all cells filled
      await this.page.waitForFunction(
        () => {
          const cells = document.querySelectorAll('.sudoku-cell');
          let filledCount = 0;
          cells.forEach(cell => {
            const text = cell.textContent?.trim();
            if (text && /^[1-9]$/.test(text)) filledCount++;
          });
          // Check if solved or if completion modal is visible
          const hasCompletion = document.querySelector('[role="dialog"]') !== null ||
                               document.body.innerText.includes('Congratulations');
          return filledCount === 81 || hasCompletion;
        },
        { timeout: 60000 }
      ).catch(() => {
        // May timeout if puzzle can't be fully solved
      });
      
      const finalBoard = await this.readBoardFromDOM();
      
      return {
        ok: true,
        status: 200,
        data: {
          final_board: finalBoard,
          stopped_reason: this.isSolved(finalBoard) ? 'completed' : 'stalled',
        },
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Failed to solve full',
      };
    }
  }

  // ============================================
  // Validate Endpoints (UI Interactions)
  // ============================================

  async validate(request: ValidateRequest): Promise<SDKResponse<ValidateResponse>> {
    try {
      await this.delay();
      
      // Click validate button or use keyboard shortcut
      await this.clickValidate();
      
      // Wait for validation result to appear (toast, modal, or error highlighting)
      await this.page.waitForSelector(
        '[role="alert"], .toast, .error-cell, [class*="valid"]',
        { timeout: 2000 }
      ).catch(() => {
        // Validation feedback may not always show a distinct element
      });
      
      // Try to read validation message from UI
      const validationResult = await this.readValidationResult();
      
      return {
        ok: true,
        status: 200,
        data: validationResult,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Failed to validate',
      };
    }
  }

  async validateCustom(request: CustomValidateRequest): Promise<SDKResponse<CustomValidateResponse>> {
    // Custom validation not supported through UI
    return {
      ok: false,
      status: 501,
      error: 'Custom validation not supported through UI',
    };
  }

  // ============================================
  // UI Helper Methods
  // ============================================

  /**
   * Click a cell by index (0-80)
   */
  async clickCell(index: number): Promise<void> {
    if (index < 0 || index > 80) {
      throw new Error(`Invalid cell index: ${index}. Must be 0-80.`);
    }
    
    const cells = this.page.locator('.sudoku-cell');
    await cells.nth(index).click();
  }

  /**
   * Enter a digit using keyboard
   */
  async enterDigit(digit: number): Promise<void> {
    if (digit < 1 || digit > 9) {
      throw new Error(`Invalid digit: ${digit}. Must be 1-9.`);
    }
    
    await this.page.keyboard.press(digit.toString());
  }

  /**
   * Click the hint button
   */
  async clickHint(): Promise<void> {
    // Try multiple selectors for the hint button
    const hintButton = this.page.getByRole('button', { name: /Hint/i })
      .or(this.page.locator('button[title*="Hint"]'))
      .or(this.page.locator('button:has-text("Hint")'));
    
    await hintButton.first().click();
  }

  /**
   * Click auto-solve from the menu
   */
  async clickAutoSolve(): Promise<void> {
    // Open menu first
    const menuButton = this.page.locator('header button').last();
    await menuButton.click();
    
    // Wait for menu to appear
    await this.page.waitForSelector('button:has-text("Solve"), button:has-text("Auto")', { timeout: 2000 });
    
    // Look for solve option
    const autoSolve = this.page.locator('button:has-text("Auto"), button:has-text("Solve")').first();
    if (await autoSolve.isVisible()) {
      await autoSolve.click();
    } else {
      // Close menu and fallback to repeated hints
      await this.page.keyboard.press('Escape');
      throw new Error('Solve not found in menu');
    }
  }

  /**
   * Click the validate button
   */
  async clickValidate(): Promise<void> {
    // Try keyboard shortcut first
    try {
      await this.page.keyboard.press('v');
    } catch {
      // Fallback to button
      const validateButton = this.page.getByRole('button', { name: /Validate|Check/i })
        .or(this.page.locator('button[title*="Validate"]'))
        .or(this.page.locator('button:has-text("Check")'));
      
      if (await validateButton.first().isVisible()) {
        await validateButton.first().click();
      }
    }
  }

  /**
   * Read the current board state from DOM
   * Returns 81-element array where 0 = empty, 1-9 = digit
   */
  async readBoardFromDOM(): Promise<Board> {
    const board: Board = [];
    const cells = await this.page.locator('.sudoku-cell').all();
    
    for (const cell of cells) {
      const text = await cell.textContent();
      // Get the main digit (not candidates)
      const digitMatch = text?.match(/^(\d)$/);
      
      if (digitMatch) {
        board.push(parseInt(digitMatch[1]));
      } else {
        // Check for digit in a specific element (not candidates)
        const digitElement = cell.locator(':not(.candidate-grid) > :text-matches("^[1-9]$")').first();
        const digitText = await digitElement.textContent().catch(() => null);
        
        if (digitText && /^[1-9]$/.test(digitText)) {
          board.push(parseInt(digitText));
        } else {
          // Check if cell has a value attribute or data attribute
          const value = await cell.getAttribute('data-value').catch(() => null);
          if (value && /^[1-9]$/.test(value)) {
            board.push(parseInt(value));
          } else {
            board.push(0);
          }
        }
      }
    }
    
    // Ensure we have exactly 81 cells
    while (board.length < 81) {
      board.push(0);
    }
    
    return board.slice(0, 81);
  }

  /**
   * Read candidates from DOM
   * Returns 81-element array where each element is an array of possible digits
   */
  async readCandidatesFromDOM(): Promise<Candidates> {
    const candidates: Candidates = Array(81).fill([]).map(() => []);
    const cells = await this.page.locator('.sudoku-cell').all();
    
    for (let i = 0; i < Math.min(cells.length, 81); i++) {
      const cell = cells[i];
      const candidateGrid = cell.locator('.candidate-grid');
      
      if (await candidateGrid.isVisible().catch(() => false)) {
        const candidateDigits: number[] = [];
        
        // Look for candidate digits (usually in a 3x3 grid)
        for (let d = 1; d <= 9; d++) {
          const candidateElement = candidateGrid.locator(`:text("${d}")`).first();
          const isVisible = await candidateElement.isVisible().catch(() => false);
          if (isVisible) {
            candidateDigits.push(d);
          }
        }
        
        candidates[i] = candidateDigits;
      }
    }
    
    return candidates;
  }

  /**
   * Wait for the board to change after a hint or move
   */
  async waitForMove(previousBoard: Board, previousCandidates: Candidates): Promise<void> {
    const maxWait = 5000;
    
    try {
      // Use waitForFunction for efficient polling
      await this.page.waitForFunction(
        (prevBoardStr: string) => {
          const cells = document.querySelectorAll('.sudoku-cell');
          const currentBoard: number[] = [];
          cells.forEach(cell => {
            const text = cell.textContent?.trim();
            // Check for main digit (not candidates)
            const digitMatch = text?.match(/^(\d)$/);
            currentBoard.push(digitMatch ? parseInt(digitMatch[1]) : 0);
          });
          
          // Also check for candidate changes
          const candidateGrids = document.querySelectorAll('.candidate-grid');
          const hasCandidateChange = candidateGrids.length > 0;
          
          return JSON.stringify(currentBoard) !== prevBoardStr || hasCandidateChange;
        },
        JSON.stringify(previousBoard),
        { timeout: maxWait }
      );
      
      // Small delay for any animations to settle
      await this.page.waitForLoadState('domcontentloaded');
    } catch {
      // Timeout - board didn't change, which is acceptable
    }
  }

  /**
   * Detect what move was made by comparing before/after states
   */
  private detectMove(
    boardBefore: Board,
    boardAfter: Board,
    candidatesBefore: Candidates,
    candidatesAfter: Candidates
  ): Move | null {
    // Check for cell assignment
    for (let i = 0; i < 81; i++) {
      if (boardBefore[i] === 0 && boardAfter[i] !== 0) {
        return {
          step_index: this.stepIndex,
          technique: 'ui-hint',
          action: 'assign',
          digit: boardAfter[i],
          targets: [{ row: Math.floor(i / 9), col: i % 9 }],
          explanation: `Placed ${boardAfter[i]} at row ${Math.floor(i / 9) + 1}, column ${(i % 9) + 1}`,
        };
      }
    }
    
    // Check for candidate eliminations
    const eliminations: { row: number; col: number; digit: number }[] = [];
    for (let i = 0; i < 81; i++) {
      const before = candidatesBefore[i] || [];
      const after = candidatesAfter[i] || [];
      
      for (const digit of before) {
        if (!after.includes(digit)) {
          eliminations.push({ row: Math.floor(i / 9), col: i % 9, digit });
        }
      }
    }
    
    if (eliminations.length > 0) {
      return {
        step_index: this.stepIndex,
        technique: 'ui-hint',
        action: 'eliminate',
        digit: eliminations[0].digit,
        targets: eliminations.map(e => ({ row: e.row, col: e.col })),
        eliminations,
        explanation: `Eliminated ${eliminations.length} candidates`,
      };
    }
    
    // Check for candidate additions
    const additions: { row: number; col: number; digit: number }[] = [];
    for (let i = 0; i < 81; i++) {
      const before = candidatesBefore[i] || [];
      const after = candidatesAfter[i] || [];
      
      for (const digit of after) {
        if (!before.includes(digit)) {
          additions.push({ row: Math.floor(i / 9), col: i % 9, digit });
        }
      }
    }
    
    if (additions.length > 0) {
      return {
        step_index: this.stepIndex,
        technique: 'ui-hint',
        action: 'candidate',
        digit: additions[0].digit,
        targets: additions.map(a => ({ row: a.row, col: a.col })),
        explanation: `Added ${additions.length} candidates`,
      };
    }
    
    return null;
  }

  /**
   * Read validation result from UI
   */
  private async readValidationResult(): Promise<ValidateResponse> {
    // Look for success/error indicators
    const successIndicator = this.page.locator('[role="alert"]:has-text("valid"), .toast:has-text("valid"), .toast:has-text("correct")');
    const errorIndicator = this.page.locator('[role="alert"]:has-text("error"), .toast:has-text("error"), .toast:has-text("incorrect"), .error-cell');
    
    const hasError = await errorIndicator.first().isVisible().catch(() => false);
    const hasSuccess = await successIndicator.first().isVisible().catch(() => false);
    
    if (hasError) {
      const errorMessage = await errorIndicator.first().textContent().catch(() => 'Validation errors found');
      return {
        valid: false,
        reason: 'conflicts',
        message: errorMessage || 'Validation errors found',
      };
    }
    
    if (hasSuccess) {
      return {
        valid: true,
      };
    }
    
    // Check if puzzle is complete
    const board = await this.readBoardFromDOM();
    if (this.isSolved(board)) {
      return {
        valid: true,
        message: 'Puzzle completed!',
      };
    }
    
    return {
      valid: true,
      message: 'No errors found',
    };
  }

  // ============================================
  // State Getters
  // ============================================

  /**
   * Get the current board state
   */
  getCurrentBoard(): Board {
    return [...this.currentBoard];
  }

  /**
   * Get the current candidates
   */
  getCurrentCandidates(): Candidates {
    return this.currentCandidates.map(c => [...c]);
  }

  /**
   * Get the simulated token
   */
  getToken(): string {
    return this.simulatedToken;
  }

  /**
   * Get the Playwright Page instance
   */
  getPage(): Page {
    return this.page;
  }
}

export default PlaywrightUISDK;
