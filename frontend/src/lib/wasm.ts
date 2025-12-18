/**
 * WASM Module Loader for Sudoku Solver
 * 
 * This module provides a TypeScript interface to the Go-based Sudoku solver
 * compiled to WebAssembly. It enables offline solving capabilities.
 */

// ==================== Type Definitions ====================

export interface CellRef {
  row: number;
  col: number;
}

export interface Candidate {
  row: number;
  col: number;
  digit: number;
}

export interface TechniqueRef {
  title: string;
  slug: string;
  url: string;
}

export interface Highlights {
  primary: CellRef[];
  secondary?: CellRef[];
}

export interface Move {
  step_index: number;
  technique: string;
  action: string; // "assign" | "eliminate" | "candidate" | "fix-error" | "contradiction"
  digit: number;
  targets: CellRef[];
  eliminations?: Candidate[];
  explanation: string;
  refs: TechniqueRef;
  highlights: Highlights;
}

export interface BoardState {
  cells: number[];
  candidates: number[][];
}

export interface Conflict {
  cell1: number;
  cell2: number;
  value: number;
  type: string; // "row" | "column" | "box"
}

export interface MoveResult {
  board: number[];
  candidates: number[][];
  move: Move | null;
}

export interface SolveAllResult {
  moves: MoveResult[];
  solved: boolean;
  finalBoard: number[];
}

export interface SolveWithStepsResult {
  moves: Move[];
  status: string;
  finalBoard: number[];
  solved: boolean;
}

export interface AnalyzePuzzleResult {
  difficulty: string;
  techniques: Record<string, number>;
  status: string;
}

export interface ValidateBoardResult {
  valid: boolean;
  reason?: string;
  message?: string;
  conflicts?: Conflict[];
  conflictCells?: number[];
}

export interface ValidateCustomResult {
  valid: boolean;
  unique?: boolean;
  reason?: string;
}

export interface PuzzleForSeedResult {
  givens: number[];
  puzzleId: string;
  seed: string;
  difficulty: string;
  error?: string;
}

export interface FindNextMoveResult {
  move: Move | null;
  board: BoardState;
}

// The WASM API interface
export interface SudokuWasmAPI {
  // Human solver
  createBoard(givens: number[]): BoardState;
  createBoardWithCandidates(cells: number[], candidates: number[][]): BoardState;
  findNextMove(cells: number[], candidates: number[][]): FindNextMoveResult;
  solveWithSteps(givens: number[], maxSteps?: number): SolveWithStepsResult;
  analyzePuzzle(givens: number[]): AnalyzePuzzleResult;
  solveAll(cells: number[], candidates: number[][], givens: number[]): SolveAllResult;

  // DP solver
  solve(grid: number[]): number[] | null;
  hasUniqueSolution(grid: number[]): boolean;
  isValid(grid: number[]): boolean;
  findConflicts(grid: number[]): Conflict[];
  generateFullGrid(seed: number): number[];
  carveGivens(fullGrid: number[], targetGivens: number, seed: number): number[];
  carveGivensWithSubset(fullGrid: number[], seed: number): Record<string, number[]>;

  // Validation
  validateCustomPuzzle(givens: number[]): ValidateCustomResult;
  validateBoard(board: number[]): ValidateBoardResult;

  // Utility
  getPuzzleForSeed(seed: string, difficulty: string): PuzzleForSeedResult;
  getVersion(): string;
}

// ==================== Global State ====================

let wasmInstance: SudokuWasmAPI | null = null;
let wasmLoadPromise: Promise<SudokuWasmAPI> | null = null;
let wasmLoadError: Error | null = null;

// Extend globalThis for TypeScript
declare global {
  interface Window {
    Go: new () => GoInstance;
    SudokuWasm: SudokuWasmAPI;
  }
}

interface GoInstance {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

// ==================== Loader Functions ====================

/**
 * Check if WASM is loaded and ready
 */
export function isWasmReady(): boolean {
  return wasmInstance !== null;
}

/**
 * Check if WASM failed to load
 */
export function hasWasmError(): boolean {
  return wasmLoadError !== null;
}

/**
 * Get WASM load error if any
 */
export function getWasmError(): Error | null {
  return wasmLoadError;
}

/**
 * Get the WASM API if loaded, otherwise null
 */
export function getWasmApi(): SudokuWasmAPI | null {
  return wasmInstance;
}

/**
 * Load the Go WASM support script (wasm_exec.js)
 */
async function loadWasmExec(): Promise<void> {
  // Check if Go is already defined (script already loaded)
  if (typeof window !== 'undefined' && window.Go) {
    return;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/wasm_exec.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load wasm_exec.js'));
    document.head.appendChild(script);
  });
}

/**
 * Load and initialize the WASM module
 * Returns the WASM API or throws if loading fails
 */
export async function loadWasm(): Promise<SudokuWasmAPI> {
  // Return cached instance if already loaded
  if (wasmInstance) {
    return wasmInstance;
  }

  // Return existing promise if already loading
  if (wasmLoadPromise) {
    return wasmLoadPromise;
  }

  // If previously failed, try again
  if (wasmLoadError) {
    wasmLoadError = null;
  }

  wasmLoadPromise = (async () => {
    try {
      // Load wasm_exec.js first
      await loadWasmExec();

      // Ensure Go is available
      if (typeof window === 'undefined' || !window.Go) {
        throw new Error('Go runtime not available');
      }

      const go = new window.Go();

      // Fetch and instantiate the WASM module
      const wasmResponse = await fetch('/sudoku.wasm');
      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch WASM: ${wasmResponse.status}`);
      }

      const wasmBuffer = await wasmResponse.arrayBuffer();
      const result = await WebAssembly.instantiate(wasmBuffer, go.importObject);

      // Run the Go program (this sets up window.SudokuWasm)
      // Don't await this - it blocks forever (intentionally)
      go.run(result.instance);

      // Wait for the WASM to signal it's ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WASM initialization timeout'));
        }, 5000);

        // Check if already ready
        if (window.SudokuWasm) {
          clearTimeout(timeout);
          resolve();
          return;
        }

        // Wait for the wasmReady event
        const handler = () => {
          clearTimeout(timeout);
          window.removeEventListener('wasmReady', handler);
          resolve();
        };
        window.addEventListener('wasmReady', handler);
      });

      // Verify the API is available
      if (!window.SudokuWasm) {
        throw new Error('SudokuWasm not available after initialization');
      }

      wasmInstance = window.SudokuWasm;
      return wasmInstance;
    } catch (error) {
      wasmLoadError = error instanceof Error ? error : new Error(String(error));
      wasmLoadPromise = null;
      throw wasmLoadError;
    }
  })();

  return wasmLoadPromise;
}

/**
 * Initialize WASM in the background (don't wait for result)
 * Use this for eager loading on app startup
 */
export function preloadWasm(): void {
  loadWasm().catch((error) => {
    console.warn('WASM preload failed:', error.message);
  });
}

// ==================== Convenience Wrapper Functions ====================

/**
 * These functions provide a simpler API that handles WASM loading
 * and falls back gracefully if WASM isn't available
 */

/**
 * Find the next move for the current board state
 * Returns null if WASM not loaded or no move found
 */
export async function wasmFindNextMove(
  cells: number[],
  candidates: number[][]
): Promise<FindNextMoveResult | null> {
  try {
    const api = await loadWasm();
    return api.findNextMove(cells, candidates);
  } catch {
    return null;
  }
}

/**
 * Solve all remaining steps from current state
 * Returns null if WASM not loaded
 */
export async function wasmSolveAll(
  cells: number[],
  candidates: number[][],
  givens: number[]
): Promise<SolveAllResult | null> {
  try {
    const api = await loadWasm();
    return api.solveAll(cells, candidates, givens);
  } catch {
    return null;
  }
}

/**
 * Solve a puzzle and return all steps
 * Returns null if WASM not loaded
 */
export async function wasmSolveWithSteps(
  givens: number[],
  maxSteps?: number
): Promise<SolveWithStepsResult | null> {
  try {
    const api = await loadWasm();
    return api.solveWithSteps(givens, maxSteps);
  } catch {
    return null;
  }
}

/**
 * Fast solve using backtracking (for verification)
 * Returns null if WASM not loaded or no solution
 */
export async function wasmSolve(grid: number[]): Promise<number[] | null> {
  try {
    const api = await loadWasm();
    return api.solve(grid);
  } catch {
    return null;
  }
}

/**
 * Validate a board for conflicts and solvability
 * Returns null if WASM not loaded
 */
export async function wasmValidateBoard(
  board: number[]
): Promise<ValidateBoardResult | null> {
  try {
    const api = await loadWasm();
    return api.validateBoard(board);
  } catch {
    return null;
  }
}

/**
 * Validate a custom puzzle
 * Returns null if WASM not loaded
 */
export async function wasmValidateCustom(
  givens: number[]
): Promise<ValidateCustomResult | null> {
  try {
    const api = await loadWasm();
    return api.validateCustomPuzzle(givens);
  } catch {
    return null;
  }
}

/**
 * Generate a puzzle for a given seed
 * Returns null if WASM not loaded
 */
export async function wasmGetPuzzle(
  seed: string,
  difficulty: string
): Promise<PuzzleForSeedResult | null> {
  try {
    const api = await loadWasm();
    return api.getPuzzleForSeed(seed, difficulty);
  } catch {
    return null;
  }
}

/**
 * Analyze puzzle difficulty
 * Returns null if WASM not loaded
 */
export async function wasmAnalyzePuzzle(
  givens: number[]
): Promise<AnalyzePuzzleResult | null> {
  try {
    const api = await loadWasm();
    return api.analyzePuzzle(givens);
  } catch {
    return null;
  }
}

/**
 * Check for conflicts in a grid
 * Returns empty array if WASM not loaded
 */
export async function wasmFindConflicts(grid: number[]): Promise<Conflict[]> {
  try {
    const api = await loadWasm();
    return api.findConflicts(grid);
  } catch {
    return [];
  }
}

/**
 * Check if a grid is valid (no conflicts)
 * Returns false if WASM not loaded
 */
export async function wasmIsValid(grid: number[]): Promise<boolean> {
  try {
    const api = await loadWasm();
    return api.isValid(grid);
  } catch {
    return false;
  }
}

// ==================== Version Management ====================

/**
 * Get the WASM solver version
 * Returns null if WASM not loaded
 */
export function getWasmVersion(): string | null {
  if (!wasmInstance) return null;
  try {
    return wasmInstance.getVersion();
  } catch {
    return null;
  }
}
