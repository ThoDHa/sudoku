/**
 * Sudoku API SDK Types
 * 
 * Shared type definitions for the SDK implementations.
 */

// ============================================
// Core Types
// ============================================

export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme' | 'impossible';

/** 81-element array, 0 = empty cell, 1-9 = value */
export type Board = number[];

/** 81-element array of possible digits for each cell */
export type Candidates = number[][];

export interface CellRef {
  row: number;  // 0-8
  col: number;  // 0-8
}

export interface CandidateRef {
  row: number;
  col: number;
  digit: number;
}

// ============================================
// Request Types
// ============================================

export interface SessionStartRequest {
  seed: string;
  difficulty: Difficulty;
  device_id: string;
}

export interface SolveRequest {
  token: string;
  board: Board;
  candidates?: Candidates;
}

export interface ValidateRequest {
  token: string;
  board: Board;
}

export interface CustomValidateRequest {
  givens: Board;
  device_id: string;
}

// ============================================
// Response Types
// ============================================

export interface HealthResponse {
  status: string;
  version: string;
}

export interface DailyResponse {
  date_utc: string;
  seed: string;
  puzzle_index: number;
}

export interface PuzzleResponse {
  puzzle_id: string;
  seed: string;
  difficulty: Difficulty;
  givens: Board;
  puzzle_index: number;
}

export interface AnalyzeResponse {
  seed: string;
  difficulty: Difficulty;
  givens_count: number;
  required_difficulty: string;
  status: string;
  techniques: Record<string, number>;
}

export interface PracticeResponse {
  seed: string;
  difficulty: string;
  givens: Board;
  technique: string;
  puzzle_index: number;
  cached: boolean;
  error?: string;
  message?: string;
}

export interface SessionStartResponse {
  token: string;
  puzzle_id: string;
  started_at: string;
}

export interface TechniqueRefs {
  title: string;
  slug: string;
  url: string;
}

export interface MoveHighlights {
  primary: CellRef[];
  secondary?: CellRef[];
}

export interface Move {
  step_index: number;
  technique: string;
  /** 
   * Action types:
   * - 'assign': Place a digit in a cell
   * - 'candidate': Add/fill candidates
   * - 'eliminate': Remove candidates
   * - 'contradiction': Detected impossible state (user made wrong move)
   * - 'clear-candidates': Too many contradictions, clearing candidates to retry
   * - 'fix-conflict': Direct conflict detected (same digit in row/col/box)
   * - 'fix-error': Blocking cell detected (user entry blocks all candidates in another cell)
   * - 'unpinpointable-error': Complex error that can't be traced to a single cell
   */
  action: 'assign' | 'candidate' | 'eliminate' | 'contradiction' | 'clear-candidates' | 'fix-conflict' | 'fix-error' | 'unpinpointable-error';
  digit: number;
  targets: CellRef[];
  eliminations?: CandidateRef[];
  explanation: string;
  refs?: TechniqueRefs;
  highlights?: MoveHighlights;
}

export interface SolveNextResponse {
  board: Board;
  candidates: Candidates;
  move: Move | null;
}

export interface SolveStepResult {
  board: Board;
  candidates: Candidates;
  move: Move;
}

export interface SolveAllResponse {
  moves: SolveStepResult[];
  solved: boolean;
  finalBoard: Board;
}

export interface SolveFullResponse {
  moves?: SolveStepResult[];
  final_board: Board;
  stopped_reason?: 'completed' | 'stalled' | 'max_steps_reached';
}

export interface ValidateResponse {
  valid: boolean;
  reason?: string;
  message?: string;
}

export interface CustomValidateResponse {
  valid: boolean;
  unique?: boolean;
  puzzle_id?: string;
  reason?: string;
}

// ============================================
// SDK Response Wrapper
// ============================================

export interface SDKResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

// ============================================
// SDK Options
// ============================================

export interface SDKOptions {
  baseUrl?: string;
  /** Delay between API calls in ms (for rate limiting) */
  apiDelay?: number;
  /** Default timeout for requests in ms */
  timeout?: number;
}
