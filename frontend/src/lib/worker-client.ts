/**
 * Worker Client for WASM Solver
 * 
 * This module provides a Promise-based API for communicating with the
 * WASM web worker. It handles worker lifecycle, request/response correlation,
 * and provides fallback to main thread WASM if workers are not supported.
 */

import type { Move } from './wasm'

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
let isInitialized = false
let isInitializing = false
let initPromise: Promise<void> | null = null
let requestCounter = 0
const pendingRequests = new Map<string, PendingRequest>()

// Default timeout for worker requests (30 seconds - solveAll can take a while)
const REQUEST_TIMEOUT = 30000

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
  return isInitialized && worker !== null
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req-${++requestCounter}-${Date.now()}`
}

/**
 * Create and initialize the worker
 */
async function createWorker(): Promise<Worker> {
  // Use Vite's worker import syntax for proper bundling
  const newWorker = new Worker(
    new URL('./wasm.worker.ts', import.meta.url),
    { type: 'module' }
  )
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      newWorker.terminate()
      reject(new Error('Worker creation timeout'))
    }, 10000)
    
    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
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
        if (type !== 'ready' && type !== 'result' && type !== 'error') {
          return
        }
        
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
      }
      
      worker.onerror = (error) => {
        console.error('[WorkerClient] Worker error:', error)
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
      isInitializing = false
      
    } catch (error) {
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
  if (!worker) {
    throw new Error('Worker not initialized')
  }
  
  // Capture worker reference after null check for use in Promise callback
  const workerRef = worker
  const id = generateRequestId()
  
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
  
  isInitialized = false
  isInitializing = false
  initPromise = null
  requestCounter = 0
}

// ==================== Solver API ====================

/**
 * Find the next move for the current board state
 * Automatically initializes the worker if needed
 */
export async function findNextMove(
  cells: number[],
  candidates: number[][],
  givens: number[]
): Promise<WorkerFindNextMoveResult> {
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
  givens: number[]
): Promise<WorkerSolveAllResult> {
  if (!isInitialized || !worker) {
    await initializeWorker()
  }
  
  const result = await sendRequest('solveAll', { cells, candidates, givens })
  return result as WorkerSolveAllResult
}
