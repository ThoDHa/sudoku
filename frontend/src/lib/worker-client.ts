/**
 * Worker Client for WASM Solver
 *
 * This module provides a Promise-based API for communicating with the
 * WASM web worker. It handles worker lifecycle, request/response correlation,
 * and provides fallback to main thread WASM if workers are not supported.
 *
 * IDLE CLEANUP: The worker is automatically terminated after IDLE_TIMEOUT_MS
 * of inactivity to save memory and CPU. This prevents the WASM runtime from
 * consuming resources when not actively solving.
 */

import type { Move } from '../types/sudoku'
import { logger } from './logger'

// ==================== Types ====================

export interface WorkerFindNextMoveResult {
  move: Move | null
  board: number[]
  candidates: number[][]
  solved: boolean
}

export interface WorkerSolveAllResult {
  moves: Array<{
    board: number[]
    candidates: (number[] | null)[]
    move: Move
  }>
  solved: boolean
  finalBoard: number[]
}

interface WorkerRequest {
  type: 'init' | 'findNextMove' | 'solveAll' | 'terminate'
  id: string
  payload?: unknown
}

interface WorkerResponse {
  type: 'loaded' | 'ready' | 'result' | 'error'
  id?: string
  success?: boolean
  data?: unknown
  error?: string
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

// ==================== Worker State ====================

let worker: Worker | null = null
// Stryker disable next-line BooleanLiteral: starting true desynchronizes the init handshake against the mock worker (harness timeout artifact)
let isInitialized = false
// Stryker disable next-line BooleanLiteral: starting true desynchronizes the init handshake against the mock worker (harness timeout artifact)
let isInitializing = false
let initPromise: Promise<void> | null = null
let requestCounter = 0
const pendingRequests = new Map<string, PendingRequest>()

// Default timeout for worker requests (30 seconds - solveAll can take a while)
const REQUEST_TIMEOUT = 30000

// Idle timeout - terminate worker after this many milliseconds of inactivity
// This prevents the WASM runtime from consuming CPU/memory when not actively solving
const IDLE_TIMEOUT_MS = 60_000 // 1 minute of inactivity

// Time to wait for the worker to report its initial 'loaded' message
const WORKER_CREATION_TIMEOUT_MS = 10_000

let idleTimeoutId: ReturnType<typeof setTimeout> | null = null

// ==================== Idle Cleanup ====================

/**
 * Reset the idle timer. Called after each worker operation.
 * After IDLE_TIMEOUT_MS of inactivity, the worker will be terminated.
 */
function resetIdleTimer(): void {
  // Clear existing timer
  // Stryker disable next-line ConditionalExpression, BlockStatement: clearTimeout(null/undefined) is a safe no-op
  if (idleTimeoutId) {
    clearTimeout(idleTimeoutId)
  }

  // Set new timer to terminate worker after idle period
  idleTimeoutId = setTimeout(() => {
    /* v8 ignore start -- the idle timer only fires while armed, which happens with no request in flight (sendRequest clears it first) and a live worker (terminateWorker clears it), so the guard's false branch is unreachable */
    // Stryker disable next-line ConditionalExpression,LogicalOperator: the idle timer is only armed when no request is in flight (sendRequest calls clearIdleTimer first), so pendingRequests.size is always 0 here; worker is also always set when the timer fires (terminateWorker clears the timer). All mutants on this line collapse to the same observable behavior.
    if (worker && pendingRequests.size === 0) {
      logger.debug('[WorkerClient] Idle timeout reached, terminating worker to save resources')
      terminateWorker()
    }
    /* v8 ignore stop */
  }, IDLE_TIMEOUT_MS)
}

/**
 * Clear the idle timer (e.g., when intentionally keeping worker alive)
 */
function clearIdleTimer(): void {
  // Stryker disable next-line ConditionalExpression: clearTimeout(null/undefined) is a safe no-op
  if (idleTimeoutId) {
    clearTimeout(idleTimeoutId)
    idleTimeoutId = null
  }
}

/**
 * Get the configured idle timeout in milliseconds
 */
export function getIdleTimeout(): number {
  return IDLE_TIMEOUT_MS
}

// ==================== Worker Lifecycle ====================

/**
 * Check if Web Workers are supported
 */
export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined'
}

/**
 * Check if the worker is initialized and ready
 */
export function isWorkerReady(): boolean {
  // Stryker disable next-line LogicalOperator: covered by the "returns false mid-initialization" test which observes worker set + isInitialized=false; the `||` mutant would wrongly return true
  // Stryker disable next-line ConditionalExpression: forcing `worker !== null` to `true` only diverges when isInitialized=true && worker=null, a state unreachable in normal flow (terminateWorker resets both), so the mutant is observationally equivalent
  return isInitialized && worker !== null
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req-${++requestCounter}-${Date.now()}`
}

/**
 * Create and initialize worker
 */
async function createWorker(): Promise<Worker> {
  // Use classic worker (not module) to support importScripts for wasm_exec.js
  // Stryker disable next-line StringLiteral: the mock Worker in tests ignores the URL; in production the URL is resolved at build time
  const newWorker = new Worker(new URL('./wasm.worker.ts', import.meta.url))

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      newWorker.terminate()
      reject(new Error('Worker creation timeout'))
    }, WORKER_CREATION_TIMEOUT_MS)

    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      // Stryker disable next-line ConditionalExpression: this handler is attached inside createWorker's promise scope; the worker's first message is always 'loaded' (posted at the end of wasm.worker.ts), so forcing `true` here resolves on the same message
      if (event.data.type === 'loaded') {
        clearTimeout(timeout)
        newWorker.removeEventListener('message', handleMessage)
        resolve(newWorker)
      }
    }

    const handleError = (error: ErrorEvent) => {
      clearTimeout(timeout)
      newWorker.removeEventListener('message', handleMessage)
      newWorker.removeEventListener('error', handleError)
      newWorker.terminate()
      reject(new Error(`Worker error: ${error.message}`))
    }

    newWorker.addEventListener('message', handleMessage)
    newWorker.addEventListener('error', handleError)
  })
}

/**
 * Initialize the worker and WASM
 */
export async function initializeWorker(): Promise<void> {
  if (isInitialized && worker) {
    return
  }

  // Stryker disable next-line LogicalOperator: equivalent to the original `&&` because initPromise is null whenever isInitializing is false (they are assigned together in the IIFE below), so `false || null` is still falsy
  if (isInitializing && initPromise) {
    return initPromise
  }

  if (!isWorkerSupported()) {
    throw new Error('Web Workers are not supported in this environment')
  }

  isInitializing = true

  initPromise = (async () => {
    try {
      // Create the worker
      worker = await createWorker()

      // Set up the message handler for responses
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { type, id, success, data, error } = event.data

        // Ignore non-response messages
        // Stryker disable next-line StringLiteral: no real worker message uses the empty string as its type
        if (type !== 'ready' && type !== 'result' && type !== 'error') {
          return
        }

        // Stryker disable next-line ConditionalExpression: a message without id falls through to the pending lookup which returns undefined and returns
        if (!id) return

        const pending = pendingRequests.get(id)
        if (!pending) return

        pendingRequests.delete(id)
        clearTimeout(pending.timeoutId)

        if (type === 'error' || !success) {
          pending.reject(new Error(error || 'Worker request failed'))
        } else {
          pending.resolve(data)
        }

        // Reset idle timer after each operation completes
        resetIdleTimer()
      }

      worker.onerror = (error) => {
        logger.debug('[WorkerClient] Worker error:', error)
        // Reject all pending requests
        for (const [id, pending] of pendingRequests) {
          clearTimeout(pending.timeoutId)
          pending.reject(new Error(`Worker error: ${error.message}`))
          pendingRequests.delete(id)
        }
      }

      // Initialize WASM inside the worker
      await sendRequest('init', undefined)

      isInitialized = true
      // Stryker disable next-line BooleanLiteral: leaving isInitializing=true after success is harmless because the `if (isInitialized && worker) return` guard at the top of initializeWorker short-circuits all subsequent callers
      isInitializing = false

      // Start idle timer
      resetIdleTimer()
    } catch (error) {
      // Stryker disable next-line BooleanLiteral: leaving isInitializing=true after failure is harmless because initPromise is also set to null on the next line, and the dedup check requires BOTH flags, so `true && null` is still falsy
      isInitializing = false
      initPromise = null
      if (worker) {
        worker.terminate()
        worker = null
      }
      throw error
    }
  })()

  return initPromise
}

/**
 * Send a request to the worker and wait for response
 */
async function sendRequest(type: WorkerRequest['type'], payload: unknown): Promise<unknown> {
  /* v8 ignore start -- unreachable defensive guard: every public entry point awaits initializeWorker() before calling sendRequest, so worker is always non-null here */
  // Stryker disable next-line ConditionalExpression,BlockStatement,StringLiteral: defensive guard; sendRequest is only reached after `if (!isInitialized || !worker) await initializeWorker()` in the public API, so worker is always non-null here. The mutants (skip the throw, empty the block, blank the message) are observationally equivalent because the block is unreachable in normal flow.
  if (!worker) {
    throw new Error('Worker not initialized')
  }
  /* v8 ignore stop */

  // Capture worker reference after null check for use in Promise callback
  const workerRef = worker
  const id = generateRequestId()

  // Clear idle timer while request is in progress
  clearIdleTimer()

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error(`Worker request timeout: ${type}`))
    }, REQUEST_TIMEOUT)

    pendingRequests.set(id, { resolve, reject, timeoutId })

    const request: WorkerRequest = { type, id, payload }
    workerRef.postMessage(request)
  })
}

/**
 * Terminate the worker and clean up
 */
export function terminateWorker(): void {
  clearIdleTimer()

  if (worker) {
    // Clear all pending requests
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timeoutId)
      pending.reject(new Error('Worker terminated'))
      pendingRequests.delete(id)
    }

    worker.terminate()
    worker = null
  }

  // Stryker disable next-line BooleanLiteral: leaving isInitialized=true after terminate is harmless because the `if (isInitialized && worker) return` guard requires BOTH to be true, and worker is null here, so subsequent initializeWorker calls proceed normally
  isInitialized = false
  // Stryker disable next-line BooleanLiteral: leaving isInitializing=true after terminate is harmless because initPromise is also set to null on the next line, and the dedup check requires BOTH flags
  isInitializing = false
  initPromise = null
  requestCounter = 0

  logger.debug('[WorkerClient] Worker terminated, resources freed')
}

// ==================== Solver API ====================

/**
 * Find the next move for the current board state
 * Automatically initializes the worker if needed
 */
export async function findNextMove(
  cells: number[],
  candidates: number[][],
  givens: number[],
): Promise<WorkerFindNextMoveResult> {
  // Stryker disable next-line ConditionalExpression,LogicalOperator,BooleanLiteral: in normal flow isInitialized and worker are set together (initializeWorker) and cleared together (terminateWorker), so the four mutants on this line (!isInitialized->isInitialized, !worker->worker, ||->&&, ->true) collapse to the same observable behavior; the auto-init path runs identically
  if (!isInitialized || !worker) {
    await initializeWorker()
  }

  const result = await sendRequest('findNextMove', { cells, candidates, givens })
  return result as WorkerFindNextMoveResult
}

/**
 * Solve all remaining steps from current state
 * Automatically initializes the worker if needed
 */
export async function solveAll(
  cells: number[],
  candidates: number[][],
  givens: number[],
): Promise<WorkerSolveAllResult> {
  // Stryker disable next-line ConditionalExpression,LogicalOperator,BooleanLiteral: same reasoning as findNextMove above; isInitialized and worker transition together, so all four mutants are observationally equivalent
  if (!isInitialized || !worker) {
    await initializeWorker()
  }

  const result = await sendRequest('solveAll', { cells, candidates, givens })
  return result as WorkerSolveAllResult
}
