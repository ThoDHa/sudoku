/**
 * WASM Module Loader for Sudoku Solver
 *
 * This module provides a TypeScript interface to the Go-based Sudoku solver
 * compiled to WebAssembly. It enables offline solving capabilities.
 */

/// <reference types="vite/client" />

import { logger } from './logger'
import type {
  CellRef,
  Candidate,
  TechniqueRef,
  Highlights,
  Move,
  BoardState,
  Conflict,
  MoveResult,
  SolveAllResult,
  SolveWithStepsResult,
  AnalyzePuzzleResult,
  ValidateBoardResult,
  ValidateCustomResult,
  PuzzleForSeedResult,
  FindNextMoveResult,
  SudokuWasmAPI,
} from '../types/sudoku'

// ==================== Type Definitions ====================
// Shared solver/WASM types live in ../types/sudoku (single source of truth) and
// are re-exported here to preserve this module's public API.
export type {
  CellRef,
  Candidate,
  TechniqueRef,
  Highlights,
  Move,
  BoardState,
  Conflict,
  MoveResult,
  SolveAllResult,
  SolveWithStepsResult,
  AnalyzePuzzleResult,
  ValidateBoardResult,
  ValidateCustomResult,
  PuzzleForSeedResult,
  FindNextMoveResult,
  SudokuWasmAPI,
}

// ==================== Global State ====================

// Time to wait for the Go runtime to signal readiness before giving up.
const WASM_READY_TIMEOUT_MS = 5000
// Brief settle delay after a rapid unload/reload to avoid a Go importObject race.
const WASM_RELOAD_DELAY_MS = 100

let wasmInstance: SudokuWasmAPI | null = null
let wasmLoadPromise: Promise<SudokuWasmAPI> | null = null
let wasmLoadError: Error | null = null
let goInstance: GoInstance | null = null
let wasmScriptElement: HTMLScriptElement | null = null
let wasmAbortController: AbortController | null = null
let wasmRecentlyUnloaded = false

// Extend globalThis for TypeScript
declare global {
  interface Window {
    Go: new () => GoInstance
    SudokuWasm: SudokuWasmAPI
    gc?: () => void // For manual garbage collection in development
  }
}

interface GoInstance {
  importObject: WebAssembly.Imports
  run(instance: WebAssembly.Instance): Promise<void>
  exit?: (code: number) => void
  _inst?: WebAssembly.Instance
}

// ==================== Loader Functions ====================

/**
 * Check if WASM is loaded and ready
 */
export function isWasmReady(): boolean {
  return wasmInstance !== null
}

/**
 * Check if WASM failed to load
 */
export function hasWasmError(): boolean {
  return wasmLoadError !== null
}

/**
 * Get WASM load error if any
 */
export function getWasmError(): Error | null {
  return wasmLoadError
}

/**
 * Get the WASM API if loaded, otherwise null
 */
export function getWasmApi(): SudokuWasmAPI | null {
  return wasmInstance
}

/**
 * Unload WASM and free memory
 * This removes the WASM instance, Go runtime, and script from memory
 * Call this when WASM is no longer needed to save ~4MB RAM
 */
export function unloadWasm(): void {
  logger.debug('[WASM] Unloading WASM module...')

  // Abort any in-progress fetch first
  if (wasmAbortController) {
    wasmAbortController.abort()
    wasmAbortController = null
  }

  // Clear WASM instance and API
  wasmInstance = null
  wasmLoadPromise = null
  wasmLoadError = null

  // Clear Go instance
  if (goInstance) {
    // Try to exit Go runtime cleanly if supported
    if (goInstance.exit) {
      try {
        goInstance.exit(0)
      } catch (e) {
        logger.debug('[WASM] Error during Go exit:', e)
      }
    }
    goInstance = null
  }

  // Remove wasm_exec.js script from DOM
  if (wasmScriptElement && wasmScriptElement.parentNode) {
    wasmScriptElement.parentNode.removeChild(wasmScriptElement)
    wasmScriptElement = null
  }

  // Clear global references
  // Stryker disable next-line ConditionalExpression, StringLiteral: defensive SSR guard; the test environment always defines `window`, so `typeof window !== 'undefined'` (and its `'undefined' -> ''` string-literal mutant) always evaluate true here, matching the always-enter behavior
  if (typeof window !== 'undefined') {
    // Stryker disable next-line ConditionalExpression: delete on an absent property is a no-op (returns true), so always-entering this block is observationally identical to guarding on window.SudokuWasm
    if (window.SudokuWasm) {
      // @ts-expect-error - We know this exists and want to delete it
      delete window.SudokuWasm
    }
    // Stryker disable next-line ConditionalExpression: same as above; delete on an absent property is a no-op, so the guard is observationally irrelevant in every environment
    if (window.Go) {
      // @ts-expect-error - We know this exists and want to delete it
      delete window.Go
    }
  }

  // Force garbage collection if available (mainly for development)
  // Stryker disable next-line ConditionalExpression,LogicalOperator,StringLiteral: in the test/browser environment window is always defined; the full chain (typeof window !== 'undefined' && 'gc' in window && typeof window.gc === 'function') and its mutants all evaluate consistently. Production-only optimization; covered when gc is absent (the guard correctly skips).
  if (typeof window !== 'undefined' && 'gc' in window && typeof window.gc === 'function') {
    window.gc()
  }

  // Mark as recently unloaded to handle rapid reload scenarios
  wasmRecentlyUnloaded = true

  logger.debug('[WASM] WASM module unloaded, memory freed')
}

/**
 * Abort an in-progress WASM load
 * Call this when navigating away from a page that initiated WASM loading
 * to prevent wasted bandwidth on the 3.3MB download
 */
export function abortWasmLoad(): void {
  if (wasmAbortController) {
    logger.debug('[WASM] Aborting WASM fetch...')
    wasmAbortController.abort()
    wasmAbortController = null
    wasmLoadPromise = null
  }
}

/**
 * Get base URL for assets (handles GitHub Pages subpath)
 */
function getBaseUrl(): string {
  // Use Vite's BASE_URL which is automatically set based on the `base` config in vite.config.ts
  // This handles GitHub Pages subpath correctly (e.g., https://thodha.github.io/sudoku/)
  const baseUrl = import.meta.env.BASE_URL || '/'
  logger.debug('[WASM] BASE_URL resolved to:', baseUrl)
  logger.debug('[WASM] import.meta.env.BASE_URL value:', import.meta.env.BASE_URL)
  return baseUrl
}

/**
 * Load the Go WASM support script (wasm_exec.js)
 */
async function loadWasmExec(): Promise<void> {
  // Check if Go is already defined (script already loaded)
  // Stryker disable next-line StringLiteral: `typeof window !== ''` is always true (typeof always returns a non-empty string), so the `'undefined' -> ''` mutant collapses to `true && window.Go`, which matches the original behavior in every environment the suite runs in
  if (typeof window !== 'undefined' && window.Go) {
    return
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const scriptUrl = `${getBaseUrl()}wasm_exec.js`
    script.src = scriptUrl
    logger.debug('[WASM] Loading wasm_exec.js from:', scriptUrl)
    script.async = true
    script.onload = () => {
      logger.debug('[WASM] wasm_exec.js loaded successfully')
      resolve()
    }
    script.onerror = () => {
      logger.error('[WASM] Failed to load wasm_exec.js from:', scriptUrl)
      reject(new Error('Failed to load wasm_exec.js'))
    }
    document.head.appendChild(script)

    // Store reference for cleanup
    wasmScriptElement = script
  })
}

/**
 * Load and initialize the WASM module
 * Returns the WASM API or throws if loading fails
 */
export async function loadWasm(): Promise<SudokuWasmAPI> {
  // Return cached instance if already loaded
  if (wasmInstance) {
    return wasmInstance
  }

  // Return existing promise if already loading
  if (wasmLoadPromise) {
    return wasmLoadPromise
  }

  // If previously failed, try again
  // Stryker disable next-line ConditionalExpression: assigning null over an already-null wasmLoadError is a no-op; the only observable case (clearing a real error before retry) is identical under the mutant
  if (wasmLoadError) {
    wasmLoadError = null
  }

  wasmLoadPromise = (async () => {
    try {
      // Load wasm_exec.js first
      logger.debug('[WASM] Loading wasm_exec.js from:', `${getBaseUrl()}wasm_exec.js`)
      await loadWasmExec()
      logger.debug('[WASM] wasm_exec.js loaded')

      // Ensure Go is available
      // Stryker disable next-line ConditionalExpression,StringLiteral: when window is defined (always, in tests/browser) the `typeof window === 'undefined'` half is false, so the condition collapses to `!window.Go`; the `'undefined' -> ''` string-literal mutant behaves identically (typeof window === '' is always false). The "Go runtime not available" test kills the !window.Go half directly.
      if (typeof window === 'undefined' || !window.Go) {
        throw new Error('Go runtime not available')
      }

      const go = new window.Go()
      goInstance = go // Store reference for cleanup

      // Give Go runtime time to fully initialize importObject
      // This prevents race conditions after rapid unload/reload cycles
      // Only delay if we recently unloaded (rapid reload scenario)
      if (wasmRecentlyUnloaded) {
        await new Promise((resolve) => setTimeout(resolve, WASM_RELOAD_DELAY_MS))
        wasmRecentlyUnloaded = false
      }

      logger.debug('[WASM] Go instance created')

      // Create AbortController for the fetch
      wasmAbortController = new AbortController()

      // Fetch and instantiate the WASM module
      logger.debug('[WASM] Fetching WASM from:', `${getBaseUrl()}sudoku.wasm`)
      const wasmResponse = await fetch(`${getBaseUrl()}sudoku.wasm`, {
        signal: wasmAbortController.signal,
      })
      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch WASM: ${wasmResponse.status}`)
      }
      logger.debug('[WASM] WASM fetched, instantiating...')

      // Clear the abort controller since fetch completed
      wasmAbortController = null

      let result: WebAssembly.WebAssemblyInstantiatedSource
      if (WebAssembly.instantiateStreaming) {
        logger.debug('[WASM] Using streaming instantiation')
        result = await WebAssembly.instantiateStreaming(wasmResponse, go.importObject)
      } else {
        // Fallback for older browsers
        logger.debug('[WASM] Falling back to buffer instantiation')
        const wasmBuffer = await wasmResponse.arrayBuffer()
        result = await WebAssembly.instantiate(wasmBuffer, go.importObject)
      }
      logger.debug('[WASM] WASM instantiated, running Go...')

      // Run the Go program (this sets up window.SudokuWasm)
      // Don't await this - it blocks forever (intentionally)
      logger.debug('[WASM] Starting Go program...')
      try {
        const goPromise = go.run(result.instance)
        // Check if go.run returns a promise and handle errors
        // Stryker disable next-line ConditionalExpression,LogicalOperator: the Go mock and the real Go runtime both return a thenable promise (always truthy with a .catch method), so widening `&&` to `||` or forcing either operand to `true` enters the same branch and attaches the same catch handler
        if (goPromise && typeof goPromise.catch === 'function') {
          goPromise.catch((error) => {
            logger.error('[WASM] Go program error:', error)
          })
        }
      } catch (error) {
        logger.error('[WASM] Immediate Go program error:', error)
        throw error
      }

      // Wait for the WASM to signal it's ready
      logger.debug('[WASM] Waiting for wasmReady event...')
      await new Promise<void>((resolve, reject) => {
        // Wait for the wasmReady event
        const handler = () => {
          logger.debug('[WASM] wasmReady event received successfully!')
          clearTimeout(timeout)
          window.removeEventListener('wasmReady', handler)
          resolve()
        }

        const timeout = setTimeout(() => {
          logger.error('[WASM] Timeout waiting for wasmReady event after 5 seconds')
          logger.debug('[WASM] window.SudokuWasm available:', !!window.SudokuWasm)
          if (window.SudokuWasm) {
            logger.debug('[WASM] SudokuWasm object keys:', Object.keys(window.SudokuWasm))
          }
          window.removeEventListener('wasmReady', handler)
          reject(new Error('WASM initialization timeout'))
        }, WASM_READY_TIMEOUT_MS)

        // Check if already ready
        if (window.SudokuWasm) {
          logger.debug('[WASM] SudokuWasm already available')
          clearTimeout(timeout)
          window.removeEventListener('wasmReady', handler)
          resolve()
          return
        }

        window.addEventListener('wasmReady', handler)
      })

      // Verify the API is available
      if (!window.SudokuWasm) {
        throw new Error('SudokuWasm not available after initialization')
      }

      wasmInstance = window.SudokuWasm
      return wasmInstance
    } catch (error) {
      // Clean up abort controller on any error
      wasmAbortController = null

      // Don't store abort as an error - it's intentional cancellation
      if (error instanceof Error && error.name === 'AbortError') {
        logger.debug('[WASM] WASM fetch was aborted')
        wasmLoadPromise = null
        throw error
      }

      wasmLoadError = error instanceof Error ? error : new Error(String(error))
      wasmLoadPromise = null
      throw wasmLoadError
    }
  })()

  return wasmLoadPromise
}

/**
 * Initialize WASM in the background (don't wait for result)
 * Use this for eager loading on app startup
 */
export function preloadWasm(): void {
  loadWasm().catch((error) => {
    logger.debug('WASM preload failed:', error.message)
  })
}

// ==================== Convenience Wrapper Functions ====================

/**
 * Run a WASM API call with graceful fallback.
 * Loads WASM on demand; if WASM is unavailable (or the call throws), returns
 * `fallback` instead. Load errors are already logged inside loadWasm, so the
 * catch here is an intentional "WASM unavailable" signal, not a silent swallow.
 */
async function withWasm<T>(fn: (api: SudokuWasmAPI) => T, fallback: T): Promise<T> {
  try {
    const api = await loadWasm()
    return fn(api)
  } catch {
    return fallback
  }
}

/** Find the next move for the current board state; null if WASM unavailable. */
export function wasmFindNextMove(
  cells: number[],
  candidates: number[][],
  givens: number[],
): Promise<FindNextMoveResult | null> {
  return withWasm((api) => api.findNextMove(cells, candidates, givens), null)
}

/** Solve all remaining steps from current state; null if WASM unavailable. */
export function wasmSolveAll(
  cells: number[],
  candidates: number[][],
  givens: number[],
): Promise<SolveAllResult | null> {
  return withWasm((api) => api.solveAll(cells, candidates, givens), null)
}

/** Solve a puzzle and return all steps; null if WASM unavailable. */
export function wasmSolveWithSteps(
  givens: number[],
  maxSteps?: number,
): Promise<SolveWithStepsResult | null> {
  return withWasm((api) => api.solveWithSteps(givens, maxSteps), null)
}

/** Fast solve via backtracking; null if WASM unavailable or no solution. */
export function wasmSolve(grid: number[]): Promise<number[] | null> {
  return withWasm((api) => api.solve(grid), null)
}

/** Validate a board against the known solution; null if WASM unavailable. */
export function wasmValidateBoard(
  board: number[],
  solution: number[],
): Promise<ValidateBoardResult | null> {
  return withWasm((api) => api.validateBoard(board, solution), null)
}

/** Validate a custom puzzle; null if WASM unavailable. */
export function wasmValidateCustom(givens: number[]): Promise<ValidateCustomResult | null> {
  return withWasm((api) => api.validateCustomPuzzle(givens), null)
}

/** Generate a puzzle for a given seed; null if WASM unavailable. */
export function wasmGetPuzzle(
  seed: string,
  difficulty: string,
): Promise<PuzzleForSeedResult | null> {
  return withWasm((api) => api.getPuzzleForSeed(seed, difficulty), null)
}

/** Analyze puzzle difficulty; null if WASM unavailable. */
export function wasmAnalyzePuzzle(givens: number[]): Promise<AnalyzePuzzleResult | null> {
  return withWasm((api) => api.analyzePuzzle(givens), null)
}

/** Check for conflicts in a grid; empty array if WASM unavailable. */
export function wasmFindConflicts(grid: number[]): Promise<Conflict[]> {
  return withWasm((api) => api.findConflicts(grid), [])
}

/** Check if a grid is valid (no conflicts); false if WASM unavailable. */
export function wasmIsValid(grid: number[]): Promise<boolean> {
  return withWasm((api) => api.isValid(grid), false)
}

// ==================== Version Management ====================

/**
 * Get the WASM solver version
 * Returns null if WASM not loaded
 */
export function getWasmVersion(): string | null {
  if (!wasmInstance) return null
  try {
    return wasmInstance.getVersion()
  } catch {
    return null
  }
}
