/**
 * Sudoku API SDK - Abstract Base Class
 * 
 * This abstract class defines the interface for interacting with the Sudoku API.
 * Implementations can use different HTTP clients (fetch, Playwright, etc.)
 */

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
} from './types';

export abstract class SudokuSDK {
  protected baseUrl: string;
  protected apiDelay: number;
  protected timeout: number;

  constructor(options: SDKOptions = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost';
    this.apiDelay = options.apiDelay || 0;
    this.timeout = options.timeout || 30000;
  }

  // ============================================
  // Abstract HTTP Methods (to be implemented)
  // ============================================

  protected abstract get<T>(path: string): Promise<SDKResponse<T>>;
  protected abstract post<T>(path: string, body: unknown): Promise<SDKResponse<T>>;

  // ============================================
  // Rate Limiting Helper
  // ============================================

  protected async delay(ms?: number): Promise<void> {
    const delayMs = ms ?? this.apiDelay;
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // ============================================
  // Health & Info Endpoints
  // ============================================

  async health(): Promise<SDKResponse<HealthResponse>> {
    return this.get<HealthResponse>('/health');
  }

  async daily(): Promise<SDKResponse<DailyResponse>> {
    await this.delay();
    return this.get<DailyResponse>('/api/daily');
  }

  // ============================================
  // Puzzle Endpoints
  // ============================================

  async getPuzzle(seed: string, difficulty: Difficulty = 'medium'): Promise<SDKResponse<PuzzleResponse>> {
    await this.delay();
    return this.get<PuzzleResponse>(`/api/puzzle/${seed}?d=${difficulty}`);
  }

  async analyzePuzzle(seed: string, difficulty: Difficulty = 'medium'): Promise<SDKResponse<AnalyzeResponse>> {
    await this.delay();
    return this.get<AnalyzeResponse>(`/api/puzzle/${seed}/analyze?d=${difficulty}`);
  }

  // ============================================
  // Session Endpoints
  // ============================================

  async startSession(request: SessionStartRequest): Promise<SDKResponse<SessionStartResponse>> {
    await this.delay();
    return this.post<SessionStartResponse>('/api/session/start', request);
  }

  /**
   * Convenience method: Get puzzle and start session in one call
   */
  async startGame(seed: string, difficulty: Difficulty, deviceId: string): Promise<{
    puzzle: SDKResponse<PuzzleResponse>;
    session: SDKResponse<SessionStartResponse>;
  }> {
    const puzzle = await this.getPuzzle(seed, difficulty);
    const session = await this.startSession({
      seed,
      difficulty,
      device_id: deviceId,
    });
    return { puzzle, session };
  }

  // ============================================
  // Solve Endpoints
  // ============================================

  async solveNext(request: SolveRequest): Promise<SDKResponse<SolveNextResponse>> {
    await this.delay();
    return this.post<SolveNextResponse>('/api/solve/next', {
      token: request.token,
      board: request.board,
      candidates: request.candidates || Array(81).fill([]),
    });
  }

  async solveAll(request: SolveRequest): Promise<SDKResponse<SolveAllResponse>> {
    await this.delay();
    return this.post<SolveAllResponse>('/api/solve/all', {
      token: request.token,
      board: request.board,
      candidates: request.candidates || Array(81).fill([]),
    });
  }

  async solveFull(
    token: string,
    board: Board,
    mode: 'human' | 'fast' = 'human'
  ): Promise<SDKResponse<SolveFullResponse>> {
    await this.delay();
    return this.post<SolveFullResponse>(`/api/solve/full?mode=${mode}`, {
      token,
      board,
    });
  }

  // ============================================
  // Validate Endpoints
  // ============================================

  async validate(request: ValidateRequest): Promise<SDKResponse<ValidateResponse>> {
    await this.delay();
    return this.post<ValidateResponse>('/api/validate', request);
  }

  async validateCustom(request: CustomValidateRequest): Promise<SDKResponse<CustomValidateResponse>> {
    await this.delay();
    return this.post<CustomValidateResponse>('/api/custom/validate', request);
  }

  // ============================================
  // High-level Test Helpers
  // ============================================

  /**
   * Create a valid board with no conflicts for testing
   */
  createPartialBoard(values: Array<{ index: number; value: number }>): Board {
    const board = Array(81).fill(0);
    for (const { index, value } of values) {
      board[index] = value;
    }
    return board;
  }

  /**
   * Create a board with a conflict (same digit in same row)
   */
  createConflictingBoard(): Board {
    const board = Array(81).fill(0);
    board[0] = 5;
    board[1] = 5; // Same row conflict
    return board;
  }

  /**
   * Check if a board is completely solved (no zeros)
   */
  isSolved(board: Board): boolean {
    return board.length === 81 && board.every(cell => cell >= 1 && cell <= 9);
  }

  /**
   * Count empty cells in a board
   */
  countEmpty(board: Board): number {
    return board.filter(cell => cell === 0).length;
  }

  /**
   * Count filled cells in a board
   */
  countFilled(board: Board): number {
    return board.filter(cell => cell !== 0).length;
  }
}

export default SudokuSDK;
