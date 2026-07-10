/**
 * Solver Service - WASM-only sudoku solving
 *
 * All solving, validation, and puzzle generation is done locally via WASM.
 * No API calls required.
 *
 * Note: getPuzzle uses static puzzle data for standard seeds to avoid WASM loading.
 * WASM is only needed for solving, hints, and custom puzzle validation.
 */

import { loadWasm, isWasmReady, getWasmApi, unloadWasm, type SudokuWasmAPI } from './wasm'
import {
  initializeWorker,
  terminateWorker,
  isWorkerSupported,
  isWorkerReady,
  findNextMove as workerFindNextMove,
  solveAll as workerSolveAll,
} from './worker-client'

import { getPuzzleForSeed as getStaticPuzzle } from './puzzles-data'
import { logger } from './logger'
import {
  validatePuzzle as dpValidatePuzzle,
  validateBoardAgainstSolution as dpValidateBoard,
} from './dp-solver'

// ==================== Types ====================
// The shared sudoku types live in types/sudoku.ts. This module re-exports the
// ones it shares with the rest of the app and only declares the few that carry
// solver-service-specific fields.

import type {
  CellRef,
  Candidate,
  TechniqueRef,
  Highlights,
  Move as SudokuMove,
  ValidateBoardResult,
  ValidateCustomResult as SudokuValidateCustomResult,
} from '../types/sudoku'

export type { CellRef, Candidate, TechniqueRef, Highlights, ValidateBoardResult }

export interface Move extends SudokuMove {
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

/**
 * Raw solve shape returned by both the worker and the main-thread WASM API,
 * before it is normalized into the public SolveAllResult.
 */
interface RawSolveResult {
  moves: Array<{ board: number[]; candidates: (number[] | null)[]; move: Move | null }>
  solved: boolean
  finalBoard: number[]
}

/** Normalize a raw worker/main-thread solve result into the public SolveAllResult. */
function toSolveAllResult(result: RawSolveResult): SolveAllResult {
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

export interface ValidateCustomResult extends SudokuValidateCustomResult {
  puzzle_id?: string
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
 * Worker mode is strongly preferred because:
 * 1. WASM runs in a separate thread - no UI blocking
 * 2. Worker can be terminated to free memory/CPU
 * 3. Idle cleanup automatically terminates worker after inactivity
 *
 * Falls back to main thread only if workers are not supported.
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

/**
 * Force worker mode on (unless workers not supported)
 * This ensures WASM always runs in a worker when available
 */
export function enableWorkerMode(): void {
  useWorkerMode = isWorkerSupported()
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
      logger.debug('[SolverService] Worker mode initialized')
      return
    } catch (error) {
      logger.debug(
        '[SolverService] Worker initialization failed, falling back to main thread:',
        error,
      )
      useWorkerMode = false
    }
  }

  // Fallback to main thread WASM
  await getApi()
  logger.debug('[SolverService] Main thread mode initialized')
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
      logger.debug('[SolverService] Worker terminated')
    }

    // Also clean up main thread WASM if it was loaded
    wasmApi = null
    unloadWasm()
    logger.debug('[SolverService] Solver cleaned up successfully')
  } catch (error) {
    logger.debug('[SolverService] Error during solver cleanup:', error)
  }
}

// ==================== WASM Solver Functions ====================

export async function solveAll(
  board: number[],
  candidates: number[][],
  givens: number[],
): Promise<SolveAllResult> {
  // Use worker if available
  if (isUsingWorkerMode()) {
    try {
      return toSolveAllResult(await workerSolveAll(board, candidates, givens))
    } catch (error) {
      logger.debug('[SolverService] Worker solveAll failed, falling back:', error)
      // Fall through to main thread
    }
  }

  // Fallback to main thread WASM
  const api = await getApi()
  return toSolveAllResult(api.solveAll(board, candidates, givens))
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
  givens: number[],
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
      logger.debug('[SolverService] Worker findNextMove failed, falling back:', error)
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
  _deviceId: string,
): Promise<ValidateCustomResult> {
  // Use pure TypeScript solver - no WASM needed for validation!
  // This avoids loading 3.3MB WASM just to check if a puzzle is valid
  const result = dpValidatePuzzle(givens)

  if (result.valid && result.unique && result.solution) {
    // Stryker disable next-line MethodExpression: hash output is always 8 hex chars via padStart(8,'0'), so slice(0,16) never truncates
    const puzzleId = 'custom-' + hashGivens(givens).slice(0, 16)
    return {
      valid: true,
      unique: true,
      puzzle_id: puzzleId,
      solution: result.solution,
    }
  }

  // Build result object, only including defined properties
  const response: ValidateCustomResult = { valid: result.valid }
  // Stryker disable next-line ConditionalExpression: assigning response.unique = undefined is observationally identical to omitting the key
  if (result.unique !== undefined) response.unique = result.unique
  // Stryker disable next-line ConditionalExpression: assigning response.reason = undefined is observationally identical to omitting the key
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
  // Stryker disable next-line UpdateOperator: i-- from 0 is an infinite loop the harness times out on
  for (let i = 0; i < givens.length; i++) {
    /* v8 ignore next -- givens is always a dense array at every call site; the `?? 0` only satisfies noUncheckedIndexedAccess and its fallback is unreachable at runtime */
    const val = givens[i] ?? 0
    // Stryker disable next-line ArithmeticOperator: the recurrence is linear in val, so replacing `+ val` with `- val` negates the accumulated hash at every step (h' = -h). The result is passed through Math.abs() before being returned, which erases the sign, making the two variants produce identical output for every practical input.
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
  solution: number[],
): Promise<SolveAllResult> {
  // Main-thread only: the worker client does not expose checkAndFixWithSolution.
  const api = await getApi()
  const result = api.checkAndFixWithSolution(board, candidates, givens, solution)
  try {
    // Stryker disable OptionalChaining: the surrounding try/catch swallows any TypeError from removing '?., making these observationally equivalent
    /* v8 ignore start -- defensive debug logging: the WASM contract guarantees a well-formed result, so the optional-chaining null branches and the non-array `movesCount` fallback are unreachable; the try/catch also swallows any access error */
    logger.debug('[Check&Fix] wasm result', {
      solved: result?.solved,
      movesCount: Array.isArray(result?.moves) ? result.moves.length : 0,
      hasFinalBoard: !!result?.finalBoard,
    })
    /* v8 ignore stop */
    // Stryker restore OptionalChaining
  } catch {
    /* no-op */
  }
  return toSolveAllResult(result)
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
