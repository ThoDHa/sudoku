/**
 * WASM Module Loader for Sudoku Solver
 * 
 * This module provides a TypeScript interface to the Go-based Sudoku solver
 * compiled to WebAssembly. It enables offline solving capabilities.
 */

/// <reference types="vite/client" />

import { debugLog } from './debug'

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
  action: string; // "assign" | "eliminate" | "candidate" | "fix-error" | "fix-conflict" | "contradiction" | "unpinpointable-error"
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
  incorrectCells?: number[];
}

export interface ValidateCustomResult {
  valid: boolean;
  unique?: boolean;
  reason?: string;
  solution?: number[];
}

export interface PuzzleForSeedResult {
  givens: number[];
  solution: number[];
  puzzleId: string;
  seed: string;
  difficulty: string;
  error?: string;
}

export interface FindNextMoveResult {
  move: Move | null;
  board: BoardState;
  solved: boolean;
}

// The WASM API interface
export interface SudokuWasmAPI {
  // Human solver
  createBoard(givens: number[]): BoardState;
  createBoardWithCandidates(cells: number[], candidates: number[][]): BoardState;
  findNextMove(cells: number[], candidates: number[][], givens: number[]): FindNextMoveResult;
  solveWithSteps(givens: number[], maxSteps?: number): SolveWithStepsResult;
  analyzePuzzle(givens: number[]): AnalyzePuzzleResult;
  solveAll(cells: number[], candidates: number[][], givens: number[]): SolveAllResult;
  checkAndFixWithSolution(cells: number[], candidates: number[][], givens: number[], solution: number[]): SolveAllResult;

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
  validateBoard(board: number[], solution: number[]): ValidateBoardResult;

  // Utility
  getPuzzleForSeed(seed: string, difficulty: string): PuzzleForSeedResult;
  getVersion(): string;
}

// ==================== Global State ====================

let wasmInstance: SudokuWasmAPI | null = null;
let wasmLoadPromise: Promise<SudokuWasmAPI> | null = null;
let wasmLoadError: Error | null = null;
let goInstance: GoInstance | null = null;
let wasmScriptElement: HTMLScriptElement | null = null;
let wasmAbortController: AbortController | null = null;

// Extend globalThis for TypeScript
declare global {
  interface Window {
    Go: new () => GoInstance;
    SudokuWasm: SudokuWasmAPI;
    gc?: () => void; // For manual garbage collection in development
  }
}

interface GoInstance {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
  exit?: (code: number) => void;
  _inst?: WebAssembly.Instance;
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
 * Unload WASM and free memory
 * This removes the WASM instance, Go runtime, and script from memory
 * Call this when WASM is no longer needed to save ~4MB RAM
 */
export function unloadWasm(): void {
  debugLog('[WASM] Unloading WASM module...')
  
  // Abort any in-progress fetch first
  if (wasmAbortController) {
    wasmAbortController.abort();
    wasmAbortController = null;
  }
  
  // Clear WASM instance and API
  wasmInstance = null;
  wasmLoadPromise = null;
  wasmLoadError = null;
  
  // Clear Go instance
  if (goInstance) {
    // Try to exit Go runtime cleanly if supported
    if (goInstance.exit) {
      try {
        goInstance.exit(0);
      } catch (e) {
        debugLog('[WASM] Error during Go exit:', e);
      }
    }
    goInstance = null;
  }
  
  // Remove wasm_exec.js script from DOM
  if (wasmScriptElement && wasmScriptElement.parentNode) {
    wasmScriptElement.parentNode.removeChild(wasmScriptElement);
    wasmScriptElement = null;
  }
  
  // Clear global references
  if (typeof window !== 'undefined') {
    if (window.SudokuWasm) {
      // @ts-expect-error - We know this exists and want to delete it
      delete window.SudokuWasm;
    }
    if (window.Go) {
      // @ts-expect-error - We know this exists and want to delete it  
      delete window.Go;
    }
  }
  
  // Force garbage collection if available (mainly for development)
  if (typeof window !== 'undefined' && 'gc' in window && typeof window.gc === 'function') {
    window.gc();
  }
  
  debugLog('[WASM] WASM module unloaded, memory freed')
}

/**
 * Abort an in-progress WASM load
 * Call this when navigating away from a page that initiated WASM loading
 * to prevent wasted bandwidth on the 3.3MB download
 */
export function abortWasmLoad(): void {
  if (wasmAbortController) {
    debugLog('[WASM] Aborting WASM fetch...')
    wasmAbortController.abort();
    wasmAbortController = null;
    wasmLoadPromise = null;
  }
}

/**
 * Get base URL for assets (handles GitHub Pages subpath)
 */
function getBaseUrl(): string {
  return import.meta.env.BASE_URL || '/';
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
    script.src = `${getBaseUrl()}wasm_exec.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load wasm_exec.js'));
    document.head.appendChild(script);
    
    // Store reference for cleanup
    wasmScriptElement = script;
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
      debugLog('[WASM] Loading wasm_exec.js from:', `${getBaseUrl()}wasm_exec.js`)
      await loadWasmExec();
      debugLog('[WASM] wasm_exec.js loaded')

      // Ensure Go is available
      if (typeof window === 'undefined' || !window.Go) {
        throw new Error('Go runtime not available');
      }

      const go = new window.Go();
      goInstance = go; // Store reference for cleanup

      // Create AbortController for the fetch
      wasmAbortController = new AbortController();

      // Fetch and instantiate the WASM module
      debugLog('[WASM] Fetching WASM from:', `${getBaseUrl()}sudoku.wasm`)
      const wasmResponse = await fetch(`${getBaseUrl()}sudoku.wasm`, {
        signal: wasmAbortController.signal
      });
      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch WASM: ${wasmResponse.status}`);
      }
      debugLog('[WASM] WASM fetched, instantiating...')
      
      // Clear the abort controller since fetch completed
      wasmAbortController = null;

      let result: WebAssembly.WebAssemblyInstantiatedSource;
      if (WebAssembly.instantiateStreaming) {
        debugLog('[WASM] Using streaming instantiation')
        result = await WebAssembly.instantiateStreaming(wasmResponse, go.importObject);
      } else {
        // Fallback for older browsers
        debugLog('[WASM] Falling back to buffer instantiation')
        const wasmBuffer = await wasmResponse.arrayBuffer();
        result = await WebAssembly.instantiate(wasmBuffer, go.importObject);
      }
      debugLog('[WASM] WASM instantiated, running Go...')

      // Run the Go program (this sets up window.SudokuWasm)
      // Don't await this - it blocks forever (intentionally)
      go.run(result.instance);

      // Wait for the WASM to signal it's ready
      await new Promise<void>((resolve, reject) => {
        // Wait for the wasmReady event
        const handler = () => {
          debugLog('[WASM] wasmReady event received')
          clearTimeout(timeout);
          window.removeEventListener('wasmReady', handler);
          resolve();
        };

        const timeout = setTimeout(() => {
          window.removeEventListener('wasmReady', handler);
          reject(new Error('WASM initialization timeout'));
        }, 5000);

        // Check if already ready
        if (window.SudokuWasm) {
          debugLog('[WASM] SudokuWasm already available')
          clearTimeout(timeout);
          window.removeEventListener('wasmReady', handler);
          resolve();
          return;
        }

        window.addEventListener('wasmReady', handler);
      });

      // Verify the API is available
      if (!window.SudokuWasm) {
        throw new Error('SudokuWasm not available after initialization');
      }

      wasmInstance = window.SudokuWasm;
      return wasmInstance;
    } catch (error) {
      // Clean up abort controller on any error
      wasmAbortController = null;
      
      // Don't store abort as an error - it's intentional cancellation
      if (error instanceof Error && error.name === 'AbortError') {
        debugLog('[WASM] WASM fetch was aborted')
        wasmLoadPromise = null;
        throw error;
      }
      
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
    debugLog('WASM preload failed:', error.message);
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
  candidates: number[][],
  givens: number[]
): Promise<FindNextMoveResult | null> {
  try {
    const api = await loadWasm();
    return api.findNextMove(cells, candidates, givens);
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
 * Validate a board by comparing against the known solution
 * Returns null if WASM not loaded
 */
export async function wasmValidateBoard(
  board: number[],
  solution: number[]
): Promise<ValidateBoardResult | null> {
  try {
    const api = await loadWasm();
    return api.validateBoard(board, solution);
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
