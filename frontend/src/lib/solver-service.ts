/**
 * Solver Service - WASM-only sudoku solving
 * 
 * All solving, validation, and puzzle generation is done locally via WASM.
 * No API calls required.
 * 
 * Note: getPuzzle uses static puzzle data for standard seeds to avoid WASM loading.
 * WASM is only needed for solving, hints, and custom puzzle validation.
 */

import {
  loadWasm,
  isWasmReady,
  getWasmApi,
  unloadWasm,
  type SudokuWasmAPI,
} from './wasm'
import {
  initializeWorker,
  terminateWorker,
  isWorkerSupported,
  isWorkerReady,
  findNextMove as workerFindNextMove,
  solveAll as workerSolveAll,
} from './worker-client'

import { getPuzzleForSeed as getStaticPuzzle } from './puzzles-data'
import { debugLog } from './debug'
import { validatePuzzle as dpValidatePuzzle, validateBoard as dpValidateBoard } from './dp-solver'

// ==================== Types ====================

export interface CellRef {
  row: number
  col: number
}

export interface Candidate {
  row: number
  col: number
  digit: number
}

export interface TechniqueRef {
  title: string
  slug: string
  url: string
}

export interface Highlights {
  primary: CellRef[]
  secondary?: CellRef[]
}

export interface Move {
  step_index: number
  technique: string
  action: string
  digit: number
  targets: CellRef[]
  eliminations?: Candidate[]
  explanation: string
  refs: TechniqueRef
  highlights: Highlights
  userEntryCount?: number
}

export interface SolveAllResult {
  moves: Array<{
    board: number[]
    candidates: (number[] | null)[]
    move: Move
  }>
  solved: boolean
  finalBoard: number[]
}

export interface ValidateBoardResult {
  valid: boolean
  reason?: string
  message?: string
  incorrectCells?: number[]
}

export interface ValidateCustomResult {
  valid: boolean
  unique?: boolean
  reason?: string
  puzzle_id?: string
  solution?: number[]
}

export interface PuzzleResult {
  puzzle_id: string
  seed: string
  difficulty: string
  givens: number[]
  solution: number[]
  puzzle_index?: number
}

// ==================== Solver Mode Configuration ====================

/**
 * Whether to use the Web Worker for WASM operations.
 * Falls back to main thread if workers are not supported.
 */
let useWorkerMode = true

/**
 * Set whether to use Web Worker mode for solving.
 * If disabled, solving happens on the main thread (may cause UI blocking).
 */
export function setWorkerMode(enabled: boolean): void {
  useWorkerMode = enabled
}

/**
 * Check if we're currently using worker mode
 */
export function isUsingWorkerMode(): boolean {
  return useWorkerMode && isWorkerSupported()
}

// ==================== WASM Solver ====================

let wasmApi: SudokuWasmAPI | null = null

/**
 * Get the WASM API, waiting for it to load if necessary
 */
async function getApi(): Promise<SudokuWasmAPI> {
  if (!wasmApi) {
    // Wait for WASM to load
    await loadWasm()
    wasmApi = getWasmApi()
  }
  if (!wasmApi) {
    throw new Error('WASM not loaded')
  }
  return wasmApi
}

/**
 * Initialize the solver (loads WASM if not already loaded)
 * Uses Web Worker if supported, otherwise falls back to main thread
 */
export async function initializeSolver(): Promise<void> {
  if (isUsingWorkerMode()) {
    try {
      await initializeWorker()
      debugLog('[SolverService] Worker mode initialized')
      return
    } catch (error) {
      console.warn('[SolverService] Worker initialization failed, falling back to main thread:', error)
      useWorkerMode = false
    }
  }
  
  // Fallback to main thread WASM
  await getApi()
  debugLog('[SolverService] Main thread mode initialized')
}

/**
 * Cleanup solver and free memory
 * Call this when solver is no longer needed to save ~4MB RAM
 * Safe to call multiple times
 */
export function cleanupSolver(): void {
  try {
    // Terminate worker if using worker mode
    if (isWorkerReady()) {
      terminateWorker()
      debugLog('[SolverService] Worker terminated')
    }
    
    // Also clean up main thread WASM if it was loaded
    wasmApi = null
    unloadWasm()
    debugLog('[SolverService] Solver cleaned up successfully')
  } catch (error) {
    console.warn('[SolverService] Error during solver cleanup:', error)
  }
}

// ==================== WASM Solver Functions ====================

export async function solveAll(
  board: number[],
  candidates: number[][],
  givens: number[]
): Promise<SolveAllResult> {
  // Use worker if available
  if (isUsingWorkerMode()) {
    try {
      const result = await workerSolveAll(board, candidates, givens)
      return {
        moves: result.moves.map((m) => ({
          board: m.board,
          candidates: m.candidates,
          move: m.move as Move,
        })),
        solved: result.solved,
        finalBoard: result.finalBoard,
      }
    } catch (error) {
      console.warn('[SolverService] Worker solveAll failed, falling back:', error)
      // Fall through to main thread
    }
  }
  
  // Fallback to main thread WASM
  const api = await getApi()
  const result = api.solveAll(board, candidates, givens)
  return {
    moves: result.moves.map((m) => ({
      board: m.board,
      candidates: m.candidates,
      move: m.move as Move,
    })),
    solved: result.solved,
    finalBoard: result.finalBoard,
  }
}

export interface FindNextMoveResult {
  move: Move | null
  board: number[]
  candidates: number[][]
  solved: boolean
}

/**
 * Find the next move for the current board state.
 * This is more efficient than solveAll when only one move is needed (e.g., hints).
 * It uses the same error detection logic as solveAll but returns after the first move.
 */
export async function findNextMove(
  board: number[],
  candidates: number[][],
  givens: number[]
): Promise<FindNextMoveResult> {
  // Use worker if available
  if (isUsingWorkerMode()) {
    try {
      const result = await workerFindNextMove(board, candidates, givens)
      return {
        move: result.move as Move | null,
        board: result.board,
        candidates: result.candidates,
        solved: result.solved,
      }
    } catch (error) {
      console.warn('[SolverService] Worker findNextMove failed, falling back:', error)
      // Fall through to main thread
    }
  }
  
  // Fallback to main thread WASM
  const api = await getApi()
  const result = api.findNextMove(board, candidates, givens)
  return {
    move: result.move as Move | null,
    board: result.board.cells,
    candidates: result.board.candidates,
    solved: result.solved,
  }
}

export function validateBoard(board: number[], solution: number[]): ValidateBoardResult {
  // Use pure TypeScript - no WASM needed!
  // The solution is already known at puzzle load time
  return dpValidateBoard(board, solution)
}

export async function validateCustomPuzzle(
  givens: number[],
  _deviceId: string
): Promise<ValidateCustomResult> {
  // Use pure TypeScript solver - no WASM needed for validation!
  // This avoids loading 3.3MB WASM just to check if a puzzle is valid
  const result = dpValidatePuzzle(givens)
  
  if (result.valid && result.unique && result.solution) {
    const puzzleId = 'custom-' + hashGivens(givens).slice(0, 16)
    return { 
      valid: true, 
      unique: true, 
      puzzle_id: puzzleId,
      solution: result.solution 
    }
  }
  
  // Build result object, only including defined properties
  const response: ValidateCustomResult = { valid: result.valid }
  if (result.unique !== undefined) response.unique = result.unique
  if (result.reason) response.reason = result.reason
  if (result.solution) response.solution = result.solution
  return response
}

export function getPuzzle(seed: string, difficulty: string): PuzzleResult {
  // All puzzles come from the static pool - no WASM needed!
  // The seed is hashed to deterministically select a puzzle index
  const staticPuzzle = getStaticPuzzle(seed, difficulty)
  if (!staticPuzzle) {
    throw new Error(`Failed to load puzzle for seed "${seed}" with difficulty "${difficulty}"`)
  }
  
  return {
    puzzle_id: `static-${staticPuzzle.puzzleIndex}`,
    seed: seed,
    difficulty: difficulty,
    givens: staticPuzzle.givens,
    solution: staticPuzzle.solution,
    puzzle_index: staticPuzzle.puzzleIndex,
  }
}

// ==================== Daily Seed Generation ====================

/**
 * Generate a daily seed based on the current date (UTC).
 * This ensures all users get the same puzzle for a given day.
 */
export function getDailySeed(): { date_utc: string; seed: string } {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  const date_utc = `${year}-${month}-${day}`
  const seed = `daily-${date_utc}`
  return { date_utc, seed }
}

// ==================== WASM Initialization ====================

export { isWasmReady }

// ==================== Helpers ====================

function hashGivens(givens: number[]): string {
  let hash = 0
  for (let i = 0; i < givens.length; i++) {
    const val = givens[i] ?? 0
    hash = ((hash << 5) - hash + val) | 0
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

/**
 * Check and fix incorrect user entries by comparing against the known solution.
 * Removes any user entries that don't match the solution, then continues solving.
 * Used when the modal "Too Many Conflicts" appears and user clicks "Check & Fix".
 */
export async function checkAndFixWithSolution(
  board: number[],
  candidates: number[][],
  givens: number[],
  solution: number[]
): Promise<SolveAllResult> {
  // Use worker if available
  if (isUsingWorkerMode()) {
    try {
      // Note: Worker client will need to be updated to support this new function
      // For now, fall back to main thread
      console.warn('[SolverService] checkAndFixWithSolution not yet implemented in worker, using main thread')
    } catch (error) {
      console.warn('[SolverService] Worker checkAndFixWithSolution failed, falling back:', error)
    }
  }
  
  // Fallback to main thread WASM
  const api = await getApi()
  const result = api.checkAndFixWithSolution(board, candidates, givens, solution)
  return {
    moves: result.moves.map((m) => ({
      board: m.board,
      candidates: m.candidates,
      move: m.move as Move,
    })),
    solved: result.solved,
    finalBoard: result.finalBoard,
  }
}

// Default export for backward compatibility
export default {
  solveAll,
  findNextMove,
  checkAndFixWithSolution,
  validateBoard,
  validateCustomPuzzle,
  getPuzzle,
}
