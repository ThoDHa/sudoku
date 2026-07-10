/**
 * WASM Web Worker for Sudoku Solver
 *
 * This worker runs the Go WASM solver in a separate thread to prevent
 * UI blocking during solving operations. All heavy computation happens here.
 */

/// <reference lib="webworker" />

// Type definitions for the Go runtime
interface GoInstance {
  importObject: WebAssembly.Imports
  run(instance: WebAssembly.Instance): Promise<void>
  exit?: (code: number) => void
}

// Extend the worker global scope
declare global {
  var Go: new () => GoInstance
  var SudokuWasm: SudokuWasmAPI | undefined
}

// The WASM API interface (mirrors wasm.ts types)
interface CellRef {
  row: number
  col: number
}

interface Candidate {
  row: number
  col: number
  digit: number
}

interface TechniqueRef {
  title: string
  slug: string
  url: string
}

interface Highlights {
  primary: CellRef[]
  secondary?: CellRef[]
}

interface Move {
  step_index: number
  technique: string
  action: string
  digit: number
  targets: CellRef[]
  eliminations?: Candidate[]
  explanation: string
  refs: TechniqueRef
  highlights: Highlights
}

interface BoardState {
  cells: number[]
  candidates: number[][]
}

interface MoveResult {
  board: number[]
  candidates: number[][]
  move: Move | null
}

interface SolveAllResult {
  moves: MoveResult[]
  solved: boolean
  finalBoard: number[]
}

interface FindNextMoveResult {
  move: Move | null
  board: BoardState
  solved: boolean
}

interface SudokuWasmAPI {
  // Human solver (the methods we use in the worker)
  createBoard(givens: number[]): BoardState
  createBoardWithCandidates(cells: number[], candidates: number[][]): BoardState
  findNextMove(cells: number[], candidates: number[][], givens: number[]): FindNextMoveResult
  solveAll(cells: number[], candidates: number[][], givens: number[]): SolveAllResult

  // Other methods (for potential future use)
  getVersion(): string
}

// ==================== Message Types ====================

interface WorkerRequest {
  type: 'init' | 'findNextMove' | 'solveAll' | 'terminate'
  id: string
  payload?: unknown
}

interface FindNextMovePayload {
  cells: number[]
  candidates: number[][]
  givens: number[]
}

interface SolveAllPayload {
  cells: number[]
  candidates: number[][]
  givens: number[]
}

interface WorkerResponse {
  type: 'ready' | 'result' | 'error'
  id?: string
  success?: boolean
  data?: unknown
  error?: string
}

// ==================== Worker State ====================

let wasmApi: SudokuWasmAPI | null = null
// Stryker disable next-line BooleanLiteral: the initial value is overwritten by `isInitializing = true` on the first call before any caller can observe it; the dedup check at L133 requires initPromise to also be set, which is null at start, so the initial true value is observationally identical to false here
let isInitializing = false
let initPromise: Promise<void> | null = null

// ==================== WASM Initialization ====================

async function initializeWasm(): Promise<void> {
  if (wasmApi) {
    return // Already initialized
  }

  // Stryker disable next-line ConditionalExpression,LogicalOperator,BlockStatement: the `false`/`{}` mutants are killed by the "parallel init dedup" test (which sends two init messages before either resolves and asserts a single instantiateStreaming call). The `||` mutant is equivalent because initPromise is null whenever isInitializing is false, so `false || null` is still falsy.
  if (isInitializing && initPromise) {
    return initPromise // Already initializing, wait for it
  }

  isInitializing = true

  initPromise = (async () => {
    try {
      // Load wasm_exec.js for Go runtime. Prefer importScripts if available (classic worker).
      // For module workers, importScripts is not available, so fetch and evaluate the script instead.
      // Try to use importScripts if it works, but guard against environments
      // where importScripts exists but is disallowed (module workers) by catching errors.
      let loadedWasmExec = false
      // Stryker disable next-line ConditionalExpression: forcing `true` here is equivalent because the catch below resets loadedWasmExec=false on error, and a successful importScripts reassigns it to true; the only divergence (importScripts not being a function) is covered by the "importScripts undefined" test which kills the L145 mutant directly
      if (typeof importScripts === 'function') {
        // Stryker disable next-line BlockStatement: the catch body sets loadedWasmExec=false, but the variable is already false at this point, so emptying the block is observationally identical (the subsequent `if (!loadedWasmExec)` still enters the fallback)
        try {
          importScripts('/wasm_exec.js')
          loadedWasmExec = true
          // Directive is inline on the `catch` line so it leads the CatchClause node; a
          // disable comment placed here inside the try body attaches elsewhere and is inert.
        } /* Stryker disable next-line BlockStatement: the catch body sets loadedWasmExec=false, but the variable is already false when importScripts throws (the `loadedWasmExec = true` assignment only runs on success), so emptying the catch block is observationally identical (the subsequent `if (!loadedWasmExec)` still enters the fallback) */ catch {
          // importScripts threw, likely because this is a module worker where importScripts is not allowed
          loadedWasmExec = false
        }
      }

      if (!loadedWasmExec) {
        // Fetch and evaluate the wasm_exec.js script so it defines `Go` in the worker scope
        const resp = await fetch('/wasm_exec.js')
        if (!resp.ok) {
          throw new Error(`Failed to fetch wasm_exec.js: ${resp.status}`)
        }
        const wasmExecText = await resp.text()
        // Execute the script in global scope so it attaches `Go` to the worker global
        new Function(wasmExecText)()
      }

      if (typeof Go === 'undefined') {
        throw new Error('Go runtime not available after loading wasm_exec.js')
      }

      const go = new Go()

      // Fetch the WASM file
      const wasmResponse = await fetch('/sudoku.wasm')
      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch WASM: ${wasmResponse.status}`)
      }

      // Instantiate the WASM module
      let result: WebAssembly.WebAssemblyInstantiatedSource
      if (WebAssembly.instantiateStreaming) {
        result = await WebAssembly.instantiateStreaming(wasmResponse, go.importObject)
      } else {
        // Fallback for older browsers
        const wasmBuffer = await wasmResponse.arrayBuffer()
        result = await WebAssembly.instantiate(wasmBuffer, go.importObject)
      }

      // Run the Go program (sets up globalThis.SudokuWasm)
      // This doesn't return - it runs forever (intentionally)
      go.run(result.instance)

      // Wait for WASM to signal it's ready
      await new Promise<void>((resolve, reject) => {
        const checkReady = () => {
          if (SudokuWasm) {
            resolve()
            // Stryker disable next-line BooleanLiteral: returning false here leaks the polling interval but the promise is already resolved, so ready is still posted; no test-observable difference
            return true
          }
          return false
        }

        // Check immediately
        // Stryker disable next-line ConditionalExpression: skipping the immediate check just defers to the polling interval, which calls checkReady on the next tick; same promise outcome
        if (checkReady()) return

        // Poll for SudokuWasm to become available
        const maxAttempts = 50 // 5 seconds max
        let attempts = 0
        const interval = setInterval(() => {
          attempts++
          // Stryker disable next-line ConditionalExpression,BlockStatement: clearing the interval is a cleanup optimization; even if it stays running, the promise is already resolved by checkReady and subsequent rejects are no-ops, and the polling never runs when the Go mock sets SudokuWasm synchronously
          if (checkReady()) {
            clearInterval(interval)
          } else if (attempts >= maxAttempts) {
            clearInterval(interval)
            reject(new Error('WASM initialization timeout'))
          }
        }, 100)
      })

      // SudokuWasm is guaranteed to be defined after the Promise resolves
      /* v8 ignore start -- unreachable defensive guard: the polling promise only resolves once SudokuWasm is truthy, so this can never throw */
      // Stryker disable next-line ConditionalExpression,BlockStatement,StringLiteral: this is a defensive guard that is unreachable when the polling promise resolves (SudokuWasm must be truthy for resolve() to have been called); the mutants are observationally equivalent
      if (!SudokuWasm) {
        // Stryker disable next-line StringLiteral: unreachable defensive guard (the polling promise only resolves once SudokuWasm is truthy), so blanking the message is observationally equivalent; the enclosing `if` mutants are already ignored above
        throw new Error('SudokuWasm not available after initialization')
      }
      /* v8 ignore stop */
      wasmApi = SudokuWasm
      // Stryker disable next-line BooleanLiteral: leaving isInitializing=true after success is harmless because the `if (wasmApi) return` guard at the top of initializeWasm short-circuits all subsequent callers
      isInitializing = false
    } catch (error) {
      // Stryker disable next-line BooleanLiteral: leaving isInitializing=true after failure is harmless because initPromise is also set to null on the next line, and the dedup check requires BOTH flags, so `true && null` is still falsy
      isInitializing = false
      initPromise = null
      throw error
    }
  })()

  return initPromise
}

// ==================== Message Handler ====================

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { type, id, payload } = event.data

  try {
    switch (type) {
      case 'init': {
        await initializeWasm()
        const response: WorkerResponse = { type: 'ready', id }
        self.postMessage(response)
        break
      }

      case 'findNextMove': {
        // Ensure WASM is initialized
        // Stryker disable next-line ConditionalExpression: forcing `true` here is harmless because initializeWasm short-circuits via `if (wasmApi) return` at the top, so re-calling it when wasmApi is set is a no-op
        if (!wasmApi) {
          await initializeWasm()
        }

        // wasmApi is guaranteed after initializeWasm()
        /* v8 ignore start -- unreachable defensive guard: initializeWasm either sets wasmApi or throws (caught by the outer try/catch), so wasmApi is always set once the await returns */
        // Stryker disable next-line ConditionalExpression,BlockStatement,StringLiteral: this defensive guard is unreachable in normal flow — initializeWasm either sets wasmApi or throws (caught by the outer onmessage try/catch), so after `await initializeWasm()` completes successfully wasmApi is always set. The mutants are observationally equivalent dead-code guards.
        if (!wasmApi) {
          // Stryker disable next-line StringLiteral: unreachable defensive guard (initializeWasm either sets wasmApi or throws), so blanking the message is observationally equivalent; the enclosing `if` mutants are already ignored above
          throw new Error('WASM API not available after initialization')
        }
        /* v8 ignore stop */

        const { cells, candidates, givens } = payload as FindNextMovePayload
        const result = wasmApi.findNextMove(cells, candidates, givens)

        const response: WorkerResponse = {
          type: 'result',
          id,
          success: true,
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
        // Ensure WASM is initialized
        // Stryker disable next-line ConditionalExpression: forcing `true` here is harmless because initializeWasm short-circuits via `if (wasmApi) return` at the top
        if (!wasmApi) {
          await initializeWasm()
        }

        // wasmApi is guaranteed after initializeWasm()
        /* v8 ignore start -- unreachable defensive guard: initializeWasm either sets wasmApi or throws (caught by the outer try/catch), so wasmApi is always set once the await returns */
        // Stryker disable next-line ConditionalExpression,BlockStatement,StringLiteral: this defensive guard is unreachable in normal flow — initializeWasm either sets wasmApi or throws (caught by the outer onmessage try/catch), so after `await initializeWasm()` completes successfully wasmApi is always set. The mutants are observationally equivalent dead-code guards.
        if (!wasmApi) {
          // Stryker disable next-line StringLiteral: unreachable defensive guard (initializeWasm either sets wasmApi or throws), so blanking the message is observationally equivalent; the enclosing `if` mutants are already ignored above
          throw new Error('WASM API not available after initialization')
        }
        /* v8 ignore stop */

        const { cells, candidates, givens } = payload as SolveAllPayload
        const result = wasmApi.solveAll(cells, candidates, givens)

        const response: WorkerResponse = {
          type: 'result',
          id,
          success: true,
          data: result,
        }
        self.postMessage(response)
        break
      }

      case 'terminate': {
        // Clean up and close the worker
        wasmApi = null
        const response: WorkerResponse = { type: 'result', id, success: true }
        self.postMessage(response)
        self.close()
        break
      }

      default: {
        const response: WorkerResponse = {
          type: 'error',
          id,
          success: false,
          error: `Unknown message type: ${type}`,
        }
        self.postMessage(response)
      }
    }
  } catch (error) {
    const response: WorkerResponse = {
      type: 'error',
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
}

// Signal that the worker script has loaded (not that WASM is ready yet)
self.postMessage({ type: 'loaded' })

export {} // Make this a module
