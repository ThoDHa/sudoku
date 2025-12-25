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
let isInitializing = false
let initPromise: Promise<void> | null = null

// ==================== WASM Initialization ====================

async function initializeWasm(): Promise<void> {
  if (wasmApi) {
    return // Already initialized
  }
  
  if (isInitializing && initPromise) {
    return initPromise // Already initializing, wait for it
  }
  
  isInitializing = true
  
  initPromise = (async () => {
    try {
      // Load wasm_exec.js using importScripts (worker-compatible)
      // In production, this will be at the root. In dev, it's served from public/
      importScripts('/wasm_exec.js')
      
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
            return true
          }
          return false
        }
        
        // Check immediately
        if (checkReady()) return
        
        // Poll for SudokuWasm to become available
        const maxAttempts = 50 // 5 seconds max
        let attempts = 0
        const interval = setInterval(() => {
          attempts++
          if (checkReady()) {
            clearInterval(interval)
          } else if (attempts >= maxAttempts) {
            clearInterval(interval)
            reject(new Error('WASM initialization timeout'))
          }
        }, 100)
      })
      
      // SudokuWasm is guaranteed to be defined after the Promise resolves
      if (!SudokuWasm) {
        throw new Error('SudokuWasm not available after initialization')
      }
      wasmApi = SudokuWasm
      isInitializing = false
      
    } catch (error) {
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
        if (!wasmApi) {
          await initializeWasm()
        }
        
        // wasmApi is guaranteed after initializeWasm()
        if (!wasmApi) {
          throw new Error('WASM API not available after initialization')
        }
        
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
          }
        }
        self.postMessage(response)
        break
      }
      
      case 'solveAll': {
        // Ensure WASM is initialized
        if (!wasmApi) {
          await initializeWasm()
        }
        
        // wasmApi is guaranteed after initializeWasm()
        if (!wasmApi) {
          throw new Error('WASM API not available after initialization')
        }
        
        const { cells, candidates, givens } = payload as SolveAllPayload
        const result = wasmApi.solveAll(cells, candidates, givens)
        
        const response: WorkerResponse = {
          type: 'result',
          id,
          success: true,
          data: result
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
          error: `Unknown message type: ${type}`
        }
        self.postMessage(response)
      }
    }
  } catch (error) {
    const response: WorkerResponse = {
      type: 'error',
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
    self.postMessage(response)
  }
}

// Signal that the worker script has loaded (not that WASM is ready yet)
self.postMessage({ type: 'loaded' })

export {} // Make this a module
