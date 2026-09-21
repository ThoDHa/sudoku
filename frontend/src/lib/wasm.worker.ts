/**
 * WASM Web Worker for Sudoku Solver
 *
 * This worker runs the Go WASM solver in a separate thread to prevent
 * UI blocking during solving operations. All heavy computation happens here.
 */

/// <reference lib="webworker" />

import { instantiateSudokuWasm, type GoInstance } from './wasm-bootstrap'
import { loadGoRuntime } from './wasm-exec-loader'
import type { SudokuWasmAPI } from '../types/sudoku'
import type { WorkerRequest, WorkerResponse } from './workerProtocol'

// Extend the worker global scope
declare global {
  var Go: new () => GoInstance
  var SudokuWasm: SudokuWasmAPI | undefined
}

// ==================== Worker State ====================

let initPromise: Promise<SudokuWasmAPI> | null = null

// ==================== WASM Initialization ====================

async function initializeWasm(): Promise<SudokuWasmAPI> {
  // Deduplicates every message: nulled when a cycle fails or the worker is
  // told to terminate, held resolved while the current API stays valid.
  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    try {
      // Load wasm_exec.js by executing it as an ES module. This is a module
      // worker, so the classic script-loading global does not exist here, and
      // the worker script's CSP carries no 'unsafe-eval', so a fetch-and-eval
      // would be blocked. BASE_URL is inlined at build (/sudoku/ on Pages, /
      // elsewhere), so both assets resolve under the deploy base like the
      // main thread's.
      await loadGoRuntime(`${import.meta.env.BASE_URL}wasm_exec.js`)

      if (typeof Go === 'undefined') {
        throw new Error('Go runtime not available after loading wasm_exec.js')
      }

      const go = new Go()

      // Fetch, instantiate, boot Go, and wait for readiness via the shared
      // bootstrap. The readiness strategy (polling) and the API global reader
      // are worker-specific.
      return await instantiateSudokuWasm({
        wasmUrl: `${import.meta.env.BASE_URL}sudoku.wasm`,
        go,
        waitForReadiness: waitForWasmReadyPoll,
        getApi: () => SudokuWasm,
      })
    } catch (error) {
      initPromise = null
      throw error
    }
  })()

  return initPromise
}

/**
 * Worker readiness strategy: poll globalThis.SudokuWasm every 100ms for up
 * to 5 seconds. Resolves immediately if SudokuWasm is already set when called.
 */
function waitForWasmReadyPoll(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Resolving here, without ever arming the poll, is the expected path when
    // the Go runtime published the API before readiness is checked.
    if (SudokuWasm) {
      resolve()
      return
    }

    // Poll for SudokuWasm to become available
    const maxAttempts = 50 // 5 seconds max
    let attempts = 0
    const interval = setInterval(() => {
      attempts++
      if (SudokuWasm) {
        clearInterval(interval)
        resolve()
      } else if (attempts >= maxAttempts) {
        clearInterval(interval)
        reject(new Error('WASM initialization timeout'))
      }
    }, 100)
  })
}

// ==================== Message Handler ====================

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  // Kept whole rather than destructured: narrowing follows `message` through
  // the switch, so each case sees its own arm's payload type. `id` is common
  // to every arm, so pulling it out does not affect the narrowing.
  const message = event.data
  const { id } = message

  try {
    switch (message.type) {
      case 'init': {
        await initializeWasm()
        const response: WorkerResponse = { type: 'ready', id }
        self.postMessage(response)
        break
      }

      case 'findNextMove': {
        const api = await initializeWasm()

        const { cells, candidates, givens } = message.payload
        const result = api.findNextMove(cells, candidates, givens)

        const response: WorkerResponse = {
          type: 'result',
          id,
          data: {
            move: result.move,
            board: result.board.cells,
            candidates: result.board.candidates,
            solved: result.solved,
          },
        }
        self.postMessage(response)
        break
      }

      case 'solveAll': {
        const api = await initializeWasm()

        const { cells, candidates, givens } = message.payload
        const result = api.solveAll(cells, candidates, givens)

        const response: WorkerResponse = {
          type: 'result',
          id,
          data: result,
        }
        self.postMessage(response)
        break
      }

      case 'terminate': {
        // Drop the dedup state so a later message re-initializes instead of
        // receiving the retired API, then clean up and close the worker
        initPromise = null
        const response: WorkerResponse = { type: 'result', id }
        self.postMessage(response)
        self.close()
        break
      }

      default: {
        // Unreachable per the union, but event.data is not validated at
        // runtime, so an out-of-protocol type still lands here. The switch
        // narrows `message` to never in this arm; `event.data` is the same
        // value un-narrowed, so its `type` stays readable without a cast.
        const response: WorkerResponse = {
          type: 'error',
          id,
          error: `Unknown message type: ${event.data.type}`,
        }
        self.postMessage(response)
      }
    }
  } catch (error) {
    const response: WorkerResponse = {
      type: 'error',
      id,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
}

// Signal that the worker script has loaded (not that WASM is ready yet)
const loadedSignal: WorkerResponse = { type: 'loaded' }
self.postMessage(loadedSignal)

export {} // Make this a module
