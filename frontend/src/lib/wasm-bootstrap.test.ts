import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  instantiateSudokuWasm,
  type GoInstance,
  type InstantiateSudokuWasmOptions,
} from './wasm-bootstrap'
import type { SudokuWasmAPI } from '../types/sudoku'

const mockInstance = {} as WebAssembly.Instance
const apiStub = { solve: vi.fn() } as unknown as SudokuWasmAPI

function makeResponse(opts: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  } as unknown as Response
}

// Wrap a vi.fn-based run implementation in a GoInstance so we can vary what
// go.run returns (resolved promise, rejected promise, truthy non-thenable,
// falsy, or a synchronously throwing function) without TS complaints.
function makeGo(run: unknown): GoInstance {
  return {
    importObject: {},
    run: run as GoInstance['run'],
  }
}

function makeOptions(
  overrides: Partial<InstantiateSudokuWasmOptions> & { go: GoInstance },
): InstantiateSudokuWasmOptions {
  return {
    wasmUrl: '/sudoku.wasm',
    waitForReadiness: async () => {},
    getApi: () => apiStub,
    ...overrides,
  }
}

describe('instantiateSudokuWasm', () => {
  let originalFetch: typeof globalThis.fetch
  let originalStreaming: typeof WebAssembly.instantiateStreaming
  let originalInstantiate: typeof WebAssembly.instantiate

  beforeEach(() => {
    originalFetch = globalThis.fetch
    originalStreaming = WebAssembly.instantiateStreaming
    originalInstantiate = WebAssembly.instantiate

    // Default happy-path stubs; individual tests override as needed.
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(makeResponse()) as unknown as typeof globalThis.fetch
    WebAssembly.instantiateStreaming = vi.fn().mockResolvedValue({
      instance: mockInstance,
    }) as unknown as typeof WebAssembly.instantiateStreaming
    WebAssembly.instantiate = vi
      .fn()
      .mockResolvedValue({ instance: mockInstance }) as unknown as typeof WebAssembly.instantiate
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    WebAssembly.instantiateStreaming = originalStreaming
    WebAssembly.instantiate = originalInstantiate
  })

  describe('fetch and response handling', () => {
    it('fetches without a signal when none is provided', async () => {
      const go = makeGo(vi.fn().mockResolvedValue(undefined))
      await instantiateSudokuWasm(makeOptions({ go }))
      expect(globalThis.fetch).toHaveBeenCalledWith('/sudoku.wasm')
    })

    it('forwards the AbortSignal to fetch when provided', async () => {
      const controller = new AbortController()
      const go = makeGo(vi.fn().mockResolvedValue(undefined))
      await instantiateSudokuWasm(makeOptions({ go, signal: controller.signal }))
      expect(globalThis.fetch).toHaveBeenCalledWith('/sudoku.wasm', {
        signal: controller.signal,
      })
    })

    it('throws a descriptive error when the response is not ok', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
          makeResponse({ ok: false, status: 500 }),
        ) as unknown as typeof globalThis.fetch
      const go = makeGo(vi.fn())
      await expect(instantiateSudokuWasm(makeOptions({ go }))).rejects.toThrow(
        'Failed to fetch WASM: 500',
      )
    })
  })

  describe('instantiation paths', () => {
    it('uses streaming instantiation and logs the streaming branch', async () => {
      const go = makeGo(vi.fn().mockResolvedValue(undefined))
      const logger = { debug: vi.fn(), error: vi.fn() }
      await instantiateSudokuWasm(makeOptions({ go, logger }))
      expect(WebAssembly.instantiateStreaming).toHaveBeenCalledWith(
        expect.anything(),
        go.importObject,
      )
      expect(logger.debug).toHaveBeenCalledWith('[WASM] Using streaming instantiation')
    })

    it('falls back to buffer instantiation when instantiateStreaming is unavailable', async () => {
      const response = makeResponse()
      globalThis.fetch = vi.fn().mockResolvedValue(response) as unknown as typeof globalThis.fetch
      // Force the falsy branch of the streaming capability check.
      WebAssembly.instantiateStreaming =
        undefined as unknown as typeof WebAssembly.instantiateStreaming

      const go = makeGo(vi.fn().mockResolvedValue(undefined))
      const logger = { debug: vi.fn(), error: vi.fn() }
      await instantiateSudokuWasm(makeOptions({ go, logger }))

      expect(response.arrayBuffer).toHaveBeenCalledTimes(1)
      expect(WebAssembly.instantiate).toHaveBeenCalledTimes(1)
      expect(WebAssembly.instantiate).toHaveBeenCalledWith(expect.any(ArrayBuffer), go.importObject)
      expect(logger.debug).toHaveBeenCalledWith('[WASM] Falling back to buffer instantiation')
    })
  })

  describe('logger selection', () => {
    it('uses the provided logger for debug output', async () => {
      const go = makeGo(vi.fn().mockResolvedValue(undefined))
      const logger = { debug: vi.fn(), error: vi.fn() }
      await instantiateSudokuWasm(makeOptions({ go, logger }))
      expect(logger.debug).toHaveBeenCalledWith('[WASM] WASM fetched, instantiating...')
      expect(logger.debug).toHaveBeenCalledWith('[WASM] WASM instantiated, running Go...')
      expect(logger.debug).toHaveBeenCalledWith('[WASM] Starting Go program...')
    })

    it('runs silently using the silentLogger when no logger is provided', async () => {
      // No logger — silentLogger must swallow debug calls without throwing.
      const go = makeGo(vi.fn().mockResolvedValue(undefined))
      const result = await instantiateSudokuWasm(makeOptions({ go }))
      expect(result).toBe(apiStub)
    })
  })

  describe('go.run promise handling', () => {
    it('logs the Go program error when goPromise rejects', async () => {
      const goError = new Error('go boom')
      const go = makeGo(vi.fn().mockRejectedValue(goError))
      const logger = { debug: vi.fn(), error: vi.fn() }
      // The function still resolves: the .catch handler swallows the rejection.
      await expect(instantiateSudokuWasm(makeOptions({ go, logger }))).resolves.toBe(apiStub)
      // Flush the microtask queue so the rejection handler has run.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(logger.error).toHaveBeenCalledWith('[WASM] Go program error:', goError)
    })

    it('does not attach a catch when goPromise is truthy but lacks a catch method', async () => {
      const truthyNoCatch = { notACatch: true }
      const go = makeGo(vi.fn().mockReturnValue(truthyNoCatch))
      const logger = { debug: vi.fn(), error: vi.fn() }
      await expect(instantiateSudokuWasm(makeOptions({ go, logger }))).resolves.toBe(apiStub)
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('does not attach a catch when goPromise is falsy', async () => {
      const go = makeGo(vi.fn().mockReturnValue(undefined))
      const logger = { debug: vi.fn(), error: vi.fn() }
      await expect(instantiateSudokuWasm(makeOptions({ go, logger }))).resolves.toBe(apiStub)
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('rethrows and logs when go.run throws synchronously', async () => {
      const syncError = new Error('sync boom')
      const go = makeGo(
        vi.fn(() => {
          throw syncError
        }),
      )
      const logger = { debug: vi.fn(), error: vi.fn() }
      await expect(instantiateSudokuWasm(makeOptions({ go, logger }))).rejects.toThrow(syncError)
      expect(logger.error).toHaveBeenCalledWith('[WASM] Immediate Go program error:', syncError)
    })

    it('silentLogger.error swallows async Go errors when no logger is provided', async () => {
      // Exercises silentLogger.error via the goPromise.catch handler so the
      // silentLogger.error function is entered at least once.
      const go = makeGo(vi.fn().mockRejectedValue(new Error('silent boom')))
      await expect(instantiateSudokuWasm(makeOptions({ go }))).resolves.toBe(apiStub)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    it('silentLogger.error swallows the immediate error path when no logger is provided', async () => {
      // Exercises silentLogger.error via the synchronous catch block.
      const go = makeGo(
        vi.fn(() => {
          throw new Error('silent sync boom')
        }),
      )
      await expect(instantiateSudokuWasm(makeOptions({ go }))).rejects.toThrow('silent sync boom')
    })
  })

  describe('api resolution', () => {
    it('throws when getApi returns undefined after readiness', async () => {
      const go = makeGo(vi.fn().mockResolvedValue(undefined))
      await expect(
        instantiateSudokuWasm(makeOptions({ go, getApi: () => undefined })),
      ).rejects.toThrow('SudokuWasm not available after initialization')
    })

    it('returns the API published by getApi on the happy path', async () => {
      const go = makeGo(vi.fn().mockResolvedValue(undefined))
      const result = await instantiateSudokuWasm(makeOptions({ go }))
      expect(result).toBe(apiStub)
    })
  })
})
