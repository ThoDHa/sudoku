import { useState, useCallback, useEffect, useRef } from 'react'
import { loadWasm, isWasmReady, getWasmApi, preloadWasm, type SudokuWasmAPI } from '../lib/wasm'
import {
  type Move,
  type FindNextMoveResult,
  type SolveAllResult,
  type ValidateBoardResult,
  type ValidateCustomResult,
} from '../types/sudoku'
import { logger } from '../lib/logger'

// Re-export types for convenience
export type { Move, FindNextMoveResult, SolveAllResult, ValidateBoardResult }

interface UseWasmSolverOptions {
  /** Preload WASM on mount (default: true) */
  preloadOnMount?: boolean
}

interface UseWasmSolverReturn {
  /** Whether WASM is loaded and ready */
  isReady: boolean
  /** Whether WASM is currently loading */
  isLoading: boolean
  /** Error message if WASM failed to load */
  error: string | null
  /** Load WASM manually */
  load: () => Promise<boolean>

  // Solver functions (return null if WASM not available)
  findNextMove: (
    cells: number[],
    candidates: number[][],
    givens: number[],
  ) => FindNextMoveResult | null
  solveAll: (cells: number[], candidates: number[][], givens: number[]) => SolveAllResult | null
  validateBoard: (board: number[], solution: number[]) => ValidateBoardResult | null
  validateCustom: (givens: number[]) => ValidateCustomResult | null
  getPuzzle: (
    seed: string,
    difficulty: string,
  ) => { givens: number[]; solution: number[]; puzzleId: string } | null

  /** The raw WASM API (null if not loaded) */
  api: SudokuWasmAPI | null
}

/**
 * Run a synchronous WASM call; returns null if WASM isn't loaded or the call throws.
 */
function callWasm<T>(
  api: SudokuWasmAPI | null,
  fn: (api: SudokuWasmAPI) => T,
  label: string,
): T | null {
  if (!api) return null
  try {
    return fn(api)
  } catch (err) {
    logger.error(`WASM ${label} error:`, err)
    return null
  }
}

/**
 * React hook to use the WASM Sudoku solver.
 * Provides synchronous access to solver functions when WASM is loaded.
 */
export function useWasmSolver(options: UseWasmSolverOptions = {}): UseWasmSolverReturn {
  const { preloadOnMount = true } = options

  const [isReady, setIsReady] = useState(isWasmReady())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [api, setApi] = useState<SudokuWasmAPI | null>(getWasmApi())

  const loadingRef = useRef(false)

  // Preload on mount if requested
  useEffect(() => {
    if (preloadOnMount && !isWasmReady()) {
      preloadWasm()
    }
  }, [preloadOnMount])

  // Check if WASM became ready (from preload)
  useEffect(() => {
    const checkReady = () => {
      const ready = isWasmReady()
      if (ready && !isReady) {
        setIsReady(true)
        setApi(getWasmApi())
        setError(null)
      }
    }

    // Check immediately
    checkReady()

    // Also listen for the wasmReady event
    const handler = () => {
      checkReady()
    }
    window.addEventListener('wasmReady', handler)

    return () => {
      window.removeEventListener('wasmReady', handler)
    }
  }, [isReady])

  const load = useCallback(async (): Promise<boolean> => {
    if (isReady) return true
    if (loadingRef.current) return false

    loadingRef.current = true
    setIsLoading(true)
    setError(null)

    try {
      const wasmApi = await loadWasm()
      setApi(wasmApi)
      setIsReady(true)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load WASM'
      setError(message)
      // Stryker disable next-line StringLiteral: warn-level log message text is not behaviorally significant
      logger.warn('WASM load failed:', message)
      return false
    } finally {
      loadingRef.current = false
      setIsLoading(false)
    }
  }, [isReady])

  // Synchronous solver functions (return null if not ready)
  const findNextMove = useCallback(
    (cells: number[], candidates: number[][], givens: number[]): FindNextMoveResult | null =>
      callWasm(api, (a) => a.findNextMove(cells, candidates, givens), 'findNextMove'),
    [api],
  )

  const solveAll = useCallback(
    (cells: number[], candidates: number[][], givens: number[]): SolveAllResult | null =>
      callWasm(api, (a) => a.solveAll(cells, candidates, givens), 'solveAll'),
    [api],
  )

  const validateBoard = useCallback(
    (board: number[], solution: number[]): ValidateBoardResult | null =>
      callWasm(api, (a) => a.validateBoard(board, solution), 'validateBoard'),
    [api],
  )

  const validateCustom = useCallback(
    (givens: number[]): ValidateCustomResult | null =>
      callWasm(api, (a) => a.validateCustomPuzzle(givens), 'validateCustom'),
    [api],
  )

  const getPuzzle = useCallback(
    (
      seed: string,
      difficulty: string,
    ): { givens: number[]; solution: number[]; puzzleId: string } | null =>
      callWasm(
        api,
        (a) => {
          const result = a.getPuzzleForSeed(seed, difficulty)
          if (result.error) return null
          return { givens: result.givens, solution: result.solution, puzzleId: result.puzzleId }
        },
        'getPuzzle',
      ),
    [api],
  )

  return {
    isReady,
    isLoading,
    error,
    load,
    findNextMove,
    solveAll,
    validateBoard,
    validateCustom,
    getPuzzle,
    api,
  }
}

/**
 * Context-free utility: Check if WASM is available right now
 */
export { isWasmReady }

/**
 * Context-free utility: Get the WASM API if loaded
 */
export { getWasmApi }

/**
 * Context-free utility: Try to load WASM and return the API
 */
export { loadWasm }
