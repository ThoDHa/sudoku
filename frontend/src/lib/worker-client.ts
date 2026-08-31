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
import type { WorkerRequest, WorkerRequestBody, WorkerResponse } from './workerProtocol'

// ==================== Types ====================

export class WorkerTerminatedError extends Error {
  constructor() {
    super('Worker terminated')
    this.name = 'WorkerTerminatedError'
  }
}

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

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

// ==================== Worker State ====================

let worker: Worker | null = null
// The worker of a completed initialization cycle, until the module lets go of
// it. Distinct from `worker`, which is held from creation (earlier) so a
// failed or crashed half-initialized cycle can still be torn down.
let readyWorker: Worker | null = null
let initPromise: Promise<Worker> | null = null
let requestCounter = 0
const pendingRequests = new Map<string, PendingRequest>()

// Default timeout for worker requests (30 seconds - solveAll can take a while)
const REQUEST_TIMEOUT = 30000

// Idle timeout - terminate worker after this many milliseconds of inactivity
// This prevents the WASM runtime from consuming CPU/memory when not actively solving
const IDLE_TIMEOUT_MS = 60_000 // 1 minute of inactivity

// Time to wait for the worker to report its initial 'loaded' message
const WORKER_CREATION_TIMEOUT_MS = 10_000

let idleTimeoutId: ReturnType<typeof setTimeout> | undefined
// Replaced every time the module lets go of a worker. An initialization that
// started under an older token has been superseded: it must not adopt the
// worker it created, nor write state that now belongs to a later cycle.
let workerToken = {}

// ==================== Idle Cleanup ====================

/**
 * Reset the idle timer. Called after each worker operation.
 * After IDLE_TIMEOUT_MS of inactivity, the worker will be terminated.
 */
function resetIdleTimer(): void {
  clearTimeout(idleTimeoutId)

  // Set new timer to terminate worker after idle period
  idleTimeoutId = setTimeout(() => {
    // Terminating unconditionally is safe: a request clears this timer when it
    // starts, and any request armed beforehand is settled first by its own
    // REQUEST_TIMEOUT, which is shorter than IDLE_TIMEOUT_MS.
    logger.debug('[WorkerClient] Idle timeout reached, terminating worker to save resources')
    terminateWorker()
  }, IDLE_TIMEOUT_MS)
}

/**
 * Clear the idle timer (e.g., when intentionally keeping worker alive)
 */
function clearIdleTimer(): void {
  clearTimeout(idleTimeoutId)
  idleTimeoutId = undefined
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
  return readyWorker !== null
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
  const newWorker = new Worker(new URL('./wasm.worker.ts', import.meta.url))

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      newWorker.terminate()
      reject(new Error('Worker creation timeout'))
    }, WORKER_CREATION_TIMEOUT_MS)

    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      // The worker's first message is 'loaded' (posted at the end of
      // wasm.worker.ts); anything else it might emit first leaves this
      // handshake waiting until the creation timeout rejects it.
      if (event.data.type === 'loaded') {
        clearTimeout(timeout)
        newWorker.removeEventListener('message', handleMessage)
        newWorker.removeEventListener('error', handleError)
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
 * Run (or join) the current initialization cycle and resolve with its worker.
 */
async function ensureWorker(): Promise<Worker> {
  // Deduplicates every caller: fresh after a discard (initPromise is nulled),
  // shared while a cycle is in flight, and already-resolved once ready.
  if (initPromise) {
    return initPromise
  }

  if (!isWorkerSupported()) {
    throw new Error('Web Workers are not supported in this environment')
  }

  initPromise = (async () => {
    const token = workerToken
    try {
      // Create the worker
      const created = await createWorker()

      // Something let go of the worker while this one was being built, so this
      // cycle is stale. Terminate what it made rather than adopting it, or the
      // thread leaks with nothing referencing it.
      if (token !== workerToken) {
        created.terminate()
        throw new Error('Worker initialization superseded')
      }

      worker = created

      // Set up the message handler for responses
      created.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data

        // Only these three settle a request. `loaded` belongs to createWorker's
        // handshake and carries no id, and event.data is not validated at
        // runtime, so a type outside the protocol lands here too. Both must be
        // rejected before the lookup below: past that point the entry is gone
        // and its timeout cleared, so returning would strand the promise.
        if (message.type !== 'ready' && message.type !== 'result' && message.type !== 'error') {
          return
        }

        const pending = pendingRequests.get(message.id)
        if (!pending) return

        pendingRequests.delete(message.id)
        clearTimeout(pending.timeoutId)

        // `type` is the sole success signal: `error` is the only failure arm,
        // and `ready` differs from `result` only in having no data to carry.
        if (message.type === 'error') {
          pending.reject(new Error(message.error || 'Worker request failed'))
        } else {
          pending.resolve(message.data)
        }

        // Reset idle timer after each operation completes
        resetIdleTimer()
      }

      created.onerror = (error) => {
        logger.error('[WorkerClient] Worker error:', error)
        // Reject all pending requests
        for (const [id, pending] of pendingRequests) {
          clearTimeout(pending.timeoutId)
          pending.reject(new Error(`Worker error: ${error.message}`))
          pendingRequests.delete(id)
        }

        // The worker is gone. Keeping the state would leave isWorkerReady
        // reporting ready, and each later request would be posted into a dead
        // worker and wait out REQUEST_TIMEOUT before the caller could fall back.
        // Dropping it here means the next call re-initializes instead.
        discardWorker()
      }

      // Initialize WASM inside the worker
      await sendRequest(created, { type: 'init' })

      readyWorker = created

      // Start idle timer
      resetIdleTimer()

      return created
    } catch (error) {
      if (token === workerToken) {
        discardWorker()
      }
      throw error
    }
  })()

  return initPromise
}

/**
 * Initialize the worker and WASM
 */
export async function initializeWorker(): Promise<void> {
  await ensureWorker()
}

/**
 * Send a request to the worker and wait for response.
 *
 * Takes the request body (the `WorkerRequest` arm minus `id`) so each call
 * site's payload is compile-checked against its arm; attaching the
 * correlation id is this function's concern.
 */
async function sendRequest(target: Worker, body: WorkerRequestBody): Promise<unknown> {
  const id = generateRequestId()

  // Clear idle timer while request is in progress
  clearIdleTimer()

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error(`Worker request timeout: ${body.type}`))
    }, REQUEST_TIMEOUT)

    pendingRequests.set(id, { resolve, reject, timeoutId })

    // Object spread distributes over the body union, so the composed value
    // is checked against WorkerRequest arm by arm; no cast needed.
    const request: WorkerRequest = { ...body, id }
    target.postMessage(request)
  })
}

/**
 * Drop every reference to the current worker and reset the module to its
 * uninitialized state. Settling outstanding requests is the caller's job: a
 * deliberate terminate and a crash owe their callers different errors.
 */
function discardWorker(): void {
  clearIdleTimer()
  workerToken = {}

  worker?.terminate()
  worker = null
  readyWorker = null

  initPromise = null
  requestCounter = 0
}

/**
 * Terminate the worker and clean up
 */
export function terminateWorker(): void {
  // Unconditional: iterating an empty map is a no-op, and leaving entries behind
  // while discardWorker resets requestCounter is how a regenerated id could
  // collide with a live pending request.
  for (const [id, pending] of pendingRequests) {
    clearTimeout(pending.timeoutId)
    pending.reject(new WorkerTerminatedError())
    pendingRequests.delete(id)
  }

  discardWorker()

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
  const target = readyWorker ?? (await ensureWorker())

  const result = await sendRequest(target, {
    type: 'findNextMove',
    payload: { cells, candidates, givens },
  })
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
  const target = readyWorker ?? (await ensureWorker())

  const result = await sendRequest(target, {
    type: 'solveAll',
    payload: { cells, candidates, givens },
  })
  return result as WorkerSolveAllResult
}
