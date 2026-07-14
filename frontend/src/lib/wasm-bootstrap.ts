/**
 * Shared WASM Bootstrap
 *
 * The fetch → instantiate → Go-run → readiness core extracted from the
 * main-thread loader (wasm.ts) and the worker loader (wasm.worker.ts).
 * Both paths implement the identical bootstrap; only the readiness strategy
 * differs (main thread listens for the 'wasmReady' window event, the worker
 * polls globalThis.SudokuWasm). Parameterizing that strategy here stops the
 * dual-path type drift documented in ARCH-1.
 */

import type { SudokuWasmAPI } from '../types/sudoku'

/**
 * Go runtime instance shape produced by the `new Go()` constructor exported
 * by wasm_exec.js. Shared between the main-thread and worker load paths so
 * neither file needs its own copy.
 */
export interface GoInstance {
  importObject: WebAssembly.Imports
  run(instance: WebAssembly.Instance): Promise<void>
  exit?: (code: number) => void
  _inst?: WebAssembly.Instance
}

/**
 * Logger subset the bootstrap calls. The main-thread path passes the shared
 * application logger; the worker path omits it and the bootstrap stays silent.
 */
export interface WasmLogger {
  debug(...args: unknown[]): void
  error(...args: unknown[]): void
}

export interface InstantiateSudokuWasmOptions {
  /** Absolute or relative URL of the .wasm binary. */
  wasmUrl: string
  /** Go runtime instance (already constructed via `new Go()`). */
  go: GoInstance
  /** AbortSignal for the fetch; main-thread abort support. */
  signal?: AbortSignal
  /**
   * Resolves once the Go runtime has signaled readiness. The main-thread path
   * listens for the 'wasmReady' window event; the worker path polls the
   * global SudokuWasm.
   */
  waitForReadiness: () => Promise<void>
  /**
   * Reads the published SudokuWasm API from the appropriate global
   * (window.SudokuWasm on the main thread, globalThis.SudokuWasm in the
   * worker).
   */
  getApi: () => SudokuWasmAPI | undefined
  /** Optional logger; when omitted the bootstrap is silent. */
  logger?: WasmLogger
}

const silentLogger: WasmLogger = {
  debug() {},
  error() {},
}

/**
 * Fetch, instantiate, and boot the Go WASM solver, then wait for it to
 * publish the SudokuWasm API. Returns the API or throws.
 */
export async function instantiateSudokuWasm(
  options: InstantiateSudokuWasmOptions,
): Promise<SudokuWasmAPI> {
  const { wasmUrl, go, signal, waitForReadiness, getApi, logger } = options
  const log = logger ?? silentLogger

  const wasmResponse = signal ? await fetch(wasmUrl, { signal }) : await fetch(wasmUrl)
  if (!wasmResponse.ok) {
    throw new Error(`Failed to fetch WASM: ${wasmResponse.status}`)
  }
  log.debug('[WASM] WASM fetched, instantiating...')

  let result: WebAssembly.WebAssemblyInstantiatedSource
  if (WebAssembly.instantiateStreaming) {
    log.debug('[WASM] Using streaming instantiation')
    result = await WebAssembly.instantiateStreaming(wasmResponse, go.importObject)
  } else {
    log.debug('[WASM] Falling back to buffer instantiation')
    const wasmBuffer = await wasmResponse.arrayBuffer()
    result = await WebAssembly.instantiate(wasmBuffer, go.importObject)
  }
  log.debug('[WASM] WASM instantiated, running Go...')

  log.debug('[WASM] Starting Go program...')
  try {
    const goPromise = go.run(result.instance)
    // Stryker disable next-line ConditionalExpression,LogicalOperator: the Go mock and the real Go runtime both return a thenable promise (always truthy with a .catch method), so widening `&&` to `||` or forcing either operand to `true` enters the same branch and attaches the same catch handler
    if (goPromise && typeof goPromise.catch === 'function') {
      goPromise.catch((error) => {
        log.error('[WASM] Go program error:', error)
      })
    }
  } catch (error) {
    log.error('[WASM] Immediate Go program error:', error)
    throw error
  }

  await waitForReadiness()

  const api = getApi()
  if (!api) {
    throw new Error('SudokuWasm not available after initialization')
  }
  return api
}
