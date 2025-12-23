import { useState, useCallback, useEffect, useRef } from 'react'
import {
  loadWasm,
  isWasmReady,
  getWasmApi,
  preloadWasm,
  type SudokuWasmAPI,
  type Move,
  type FindNextMoveResult,
  type SolveAllResult,
  type ValidateBoardResult,
  type ValidateCustomResult,
} from '../lib/wasm'

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
  findNextMove: (cells: number[], candidates: number[][], givens: number[]) => FindNextMoveResult | null
  solveAll: (cells: number[], candidates: number[][], givens: number[]) => SolveAllResult | null
  validateBoard: (board: number[], solution: number[]) => ValidateBoardResult | null
  validateCustom: (givens: number[]) => ValidateCustomResult | null
  getPuzzle: (seed: string, difficulty: string) => { givens: number[], solution: number[], puzzleId: string } | null
  
  /** The raw WASM API (null if not loaded) */
  api: SudokuWasmAPI | null
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
    const handler = () => checkReady()
    window.addEventListener('wasmReady', handler)
    
    return () => window.removeEventListener('wasmReady', handler)
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
      console.warn('WASM load failed:', message)
      return false
    } finally {
      loadingRef.current = false
      setIsLoading(false)
    }
  }, [isReady])
  
  // Synchronous solver functions (return null if not ready)
  const findNextMove = useCallback((cells: number[], candidates: number[][], givens: number[]): FindNextMoveResult | null => {
    if (!api) return null
    try {
      return api.findNextMove(cells, candidates, givens)
    } catch (err) {
      console.error('WASM findNextMove error:', err)
      return null
    }
  }, [api])
  
  const solveAll = useCallback((cells: number[], candidates: number[][], givens: number[]): SolveAllResult | null => {
    if (!api) return null
    try {
      return api.solveAll(cells, candidates, givens)
    } catch (err) {
      console.error('WASM solveAll error:', err)
      return null
    }
  }, [api])
  
  const validateBoard = useCallback((board: number[], solution: number[]): ValidateBoardResult | null => {
    if (!api) return null
    try {
      return api.validateBoard(board, solution)
    } catch (err) {
      console.error('WASM validateBoard error:', err)
      return null
    }
  }, [api])
  
  const validateCustom = useCallback((givens: number[]): ValidateCustomResult | null => {
    if (!api) return null
    try {
      return api.validateCustomPuzzle(givens)
    } catch (err) {
      console.error('WASM validateCustom error:', err)
      return null
    }
  }, [api])
  
  const getPuzzle = useCallback((seed: string, difficulty: string): { givens: number[], solution: number[], puzzleId: string } | null => {
    if (!api) return null
    try {
      const result = api.getPuzzleForSeed(seed, difficulty)
      if (result.error) return null
      return { givens: result.givens, solution: result.solution, puzzleId: result.puzzleId }
    } catch (err) {
      console.error('WASM getPuzzle error:', err)
      return null
    }
  }, [api])
  
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
