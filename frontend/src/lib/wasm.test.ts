import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * WASM Module Unit Tests
 *
 * Tests the WASM loader and API wrapper module which manages
 * WebAssembly loading for the Sudoku solver.
 */

// Mock logger before importing the module
let loggerMock = vi.fn()
let errorMock = vi.fn()
vi.mock('./logger', () => ({
  logger: {
    debug: loggerMock,
    error: errorMock,
    warn: vi.fn(),
    info: vi.fn(),
  },
  enableDebug: vi.fn(),
  disableDebug: vi.fn(),
}))

// Store original globals
const originalWindow = globalThis.window
const originalFetch = globalThis.fetch
const originalWebAssembly = globalThis.WebAssembly

// Create mock WASM API
function createMockWasmApi() {
  return {
    createBoard: vi.fn().mockReturnValue({ cells: [], candidates: [] }),
    createBoardWithCandidates: vi.fn().mockReturnValue({ cells: [], candidates: [] }),
    findNextMove: vi
      .fn()
      .mockReturnValue({ move: null, board: { cells: [], candidates: [] }, solved: false }),
    solveWithSteps: vi
      .fn()
      .mockReturnValue({ moves: [], status: 'solved', finalBoard: [], solved: true }),
    analyzePuzzle: vi
      .fn()
      .mockReturnValue({ difficulty: 'easy', techniques: {}, status: 'analyzed' }),
    solveAll: vi.fn().mockReturnValue({ moves: [], solved: true, finalBoard: [] }),
    solve: vi.fn().mockReturnValue([]),
    hasUniqueSolution: vi.fn().mockReturnValue(true),
    isValid: vi.fn().mockReturnValue(true),
    findConflicts: vi.fn().mockReturnValue([]),
    generateFullGrid: vi.fn().mockReturnValue([]),
    carveGivens: vi.fn().mockReturnValue([]),
    carveGivensWithSubset: vi.fn().mockReturnValue({}),
    validateCustomPuzzle: vi.fn().mockReturnValue({ valid: true, unique: true }),
    validateBoard: vi.fn().mockReturnValue({ valid: true }),
    getPuzzleForSeed: vi.fn().mockReturnValue({
      givens: [],
      solution: [],
      puzzleId: 'test',
      seed: 'test',
      difficulty: 'easy',
    }),
    getVersion: vi.fn().mockReturnValue('1.0.0'),
  }
}

// Structural shape every MockGo variant honors; keeps reassignments assignable
// even when a test's ad-hoc class omits optional GoInstance fields like _inst.
interface MockGoInstance {
  importObject: WebAssembly.Imports
  run(instance: WebAssembly.Instance): Promise<void>
  exit?(code: number): void
  _inst?: WebAssembly.Instance | null
}
type MockGoConstructor = new () => MockGoInstance

// Create mock Go class
function createMockGoClass(): MockGoConstructor {
  return class MockGo {
    importObject = { go: {} }
    _inst: WebAssembly.Instance | null = null
    exit = vi.fn()

    run = vi.fn().mockImplementation(() => {
      // Simulate Go runtime setting up SudokuWasm
      return Promise.resolve()
    })
  }
}

describe('wasm module', () => {
  // Drive loadWasm through its async ready handshake (shared by every load test).
  const runLoadCycle = async (loadWasm: () => Promise<unknown>) => {
    const loadPromise = loadWasm()
    await vi.waitFor(() => {
      if (wasmReadyHandler) {
        wasmReadyHandler()
      }
    })
    await loadPromise
  }
  let mockWasmApi: ReturnType<typeof createMockWasmApi>
  let MockGoClass: MockGoConstructor
  let wasmReadyHandler: (() => void) | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    loggerMock.mockClear()
    errorMock.mockClear()

    mockWasmApi = createMockWasmApi()
    MockGoClass = createMockGoClass()
    wasmReadyHandler = null

    // Mock window with Go and SudokuWasm
    const mockWindow = {
      Go: MockGoClass,
      SudokuWasm: undefined as ReturnType<typeof createMockWasmApi> | undefined,
      gc: vi.fn(),
      location: { origin: 'https://example.com' },
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'wasmReady') {
          wasmReadyHandler = handler
        }
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }

    // @ts-expect-error - Mocking window
    globalThis.window = mockWindow

    // Mock document for script loading
    const mockScript = {
      src: '',
      async: false,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      parentNode: {
        removeChild: vi.fn(),
      },
    }

    globalThis.document = {
      createElement: vi.fn().mockReturnValue(mockScript),
      head: {
        appendChild: vi.fn((script: typeof mockScript) => {
          // Simulate successful script load
          setTimeout(() => {
            if (script.onload) {
              // Set Go on window when script loads
              // @ts-expect-error - Mocking
              globalThis.window.Go = MockGoClass
              script.onload()
            }
          }, 0)
        }),
      },
    } as unknown as Document

    // Mock fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    })

    // Mock WebAssembly
    globalThis.WebAssembly = {
      ...originalWebAssembly,
      instantiateStreaming: vi.fn().mockResolvedValue({
        instance: { exports: {} },
        module: {},
      }),
      instantiate: vi.fn().mockResolvedValue({
        instance: { exports: {} },
        module: {},
      }),
    } as typeof WebAssembly

    // Mock import.meta.env
    vi.stubGlobal('import', { meta: { env: { BASE_URL: '/' } } })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.window = originalWindow
    globalThis.fetch = originalFetch
    globalThis.WebAssembly = originalWebAssembly
  })

  // ==================== State Functions ====================

  describe('isWasmReady()', () => {
    it('should return false when WASM is not loaded', async () => {
      const { isWasmReady } = await import('./wasm')
      expect(isWasmReady()).toBe(false)
    })

    it('should return true after WASM is loaded', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm, isWasmReady } = await import('./wasm')

      // Start loading and immediately set SudokuWasm
      const loadPromise = loadWasm()

      // Trigger wasmReady event
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          // @ts-expect-error - Mocking
          globalThis.window.SudokuWasm = mockWasmApi
          wasmReadyHandler()
        }
      })

      await loadPromise
      expect(isWasmReady()).toBe(true)
    })

    it('should return false after unloadWasm is called', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm, unloadWasm, isWasmReady } = await import('./wasm')

      const loadPromise = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          // @ts-expect-error - Mocking
          globalThis.window.SudokuWasm = mockWasmApi
          wasmReadyHandler()
        }
      })
      await loadPromise

      expect(isWasmReady()).toBe(true)
      unloadWasm()
      expect(isWasmReady()).toBe(false)
    })
  })

  describe('hasWasmError()', () => {
    it('should return false when no error occurred', async () => {
      const { hasWasmError } = await import('./wasm')
      expect(hasWasmError()).toBe(false)
    })

    it('should return true after load failure', async () => {
      // Make fetch fail
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'))

      const { loadWasm, hasWasmError } = await import('./wasm')

      await expect(loadWasm()).rejects.toThrow('Network error')
      expect(hasWasmError()).toBe(true)
    })

    it('should return false after successful retry following error', async () => {
      const { loadWasm, hasWasmError } = await import('./wasm')

      // First call fails
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'))
      await expect(loadWasm()).rejects.toThrow('Network error')
      expect(hasWasmError()).toBe(true)

      // Reset modules to clear state
      vi.resetModules()

      // Setup for successful load
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const freshModule = await import('./wasm')
      expect(freshModule.hasWasmError()).toBe(false)
    })
  })

  describe('getWasmError()', () => {
    it('should return null when no error occurred', async () => {
      const { getWasmError } = await import('./wasm')
      expect(getWasmError()).toBe(null)
    })

    it('should return the error after load failure', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Test error message'))

      const { loadWasm, getWasmError } = await import('./wasm')

      await expect(loadWasm()).rejects.toThrow()
      const error = getWasmError()
      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toBe('Test error message')
    })
  })

  describe('getWasmApi()', () => {
    it('should return null when WASM is not loaded', async () => {
      const { getWasmApi } = await import('./wasm')
      expect(getWasmApi()).toBe(null)
    })

    it('should return the API after WASM is loaded', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm, getWasmApi } = await import('./wasm')

      await runLoadCycle(loadWasm)

      const api = getWasmApi()
      expect(api).toBe(mockWasmApi)
    })
  })

  // ==================== loadWasm ====================

  describe('loadWasm()', () => {
    it('should return cached instance if already loaded', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm } = await import('./wasm')

      const loadPromise1 = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })
      const api1 = await loadPromise1

      // Second call should return same instance without new fetch
      const fetchCallCount = vi.mocked(globalThis.fetch).mock.calls.length
      const api2 = await loadWasm()

      expect(api1).toBe(api2)
      expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(fetchCallCount)
    })

    it('should return existing promise if already loading', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm } = await import('./wasm')

      // Start first load - both calls should return the same eventual result
      const promise1 = loadWasm()
      const promise2 = loadWasm()

      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })

      // Both should resolve to the same API
      const [result1, result2] = await Promise.all([promise1, promise2])
      expect(result1).toBe(result2)
      expect(result1).toBe(mockWasmApi)
    })

    it('should clear previous error and retry on new call', async () => {
      const { loadWasm, hasWasmError } = await import('./wasm')

      // First call fails
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('First error'))
      await expect(loadWasm()).rejects.toThrow('First error')
      expect(hasWasmError()).toBe(true)

      // Setup for successful retry
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      } as unknown as Response)

      await runLoadCycle(loadWasm)

      expect(hasWasmError()).toBe(false)
    })

    it('should throw error when fetch fails', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Fetch failed'))

      const { loadWasm } = await import('./wasm')

      await expect(loadWasm()).rejects.toThrow('Fetch failed')
    })

    it('should throw error when fetch returns non-ok response', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as Response)

      const { loadWasm } = await import('./wasm')

      await expect(loadWasm()).rejects.toThrow('Failed to fetch WASM: 404')
    })

    it('should throw error when Go runtime is not available', async () => {
      // @ts-expect-error - Removing Go
      globalThis.window.Go = undefined

      // Make script load but not set Go
      // @ts-expect-error - Mocking
      globalThis.document.head.appendChild = vi.fn((script: { onload: () => void }) => {
        setTimeout(() => {
          if (script.onload) {
            script.onload()
          }
        }, 0)
      })

      const { loadWasm } = await import('./wasm')

      await expect(loadWasm()).rejects.toThrow('Go runtime not available')
    })

    it('should throw error on WASM initialization timeout', async () => {
      vi.useFakeTimers()

      try {
        const { loadWasm } = await import('./wasm')

        const loadPromise = loadWasm()

        // Attach rejection handler before advancing time to prevent unhandled rejection
        // This catches the rejection when it happens during timer advancement
        let error: Error | null = null as Error | null
        const catchPromise = loadPromise.catch((e) => {
          error = e as Error
        })

        // Fast-forward past the 5 second timeout
        await vi.advanceTimersByTimeAsync(5100)

        // Wait for the rejection to be handled
        await catchPromise

        expect(error).not.toBeNull()
        expect(error?.message).toBe('WASM initialization timeout')
      } finally {
        // Ensure timers are restored even if test fails
        vi.useRealTimers()
      }
    })

    it('should throw error when SudokuWasm not available after init', async () => {
      // This test verifies the code path where wasmReady fires but SudokuWasm is still undefined
      // The code checks window.SudokuWasm AFTER the wasmReady event is handled

      const { loadWasm } = await import('./wasm')

      const loadPromise = loadWasm()

      // Wait for the wasmReady handler to be registered
      await vi.waitFor(() => {
        expect(wasmReadyHandler).not.toBeNull()
      })

      // Trigger wasmReady but SudokuWasm is NOT set (undefined)
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = undefined
      wasmReadyHandler!()

      await expect(loadPromise).rejects.toThrow('SudokuWasm not available after initialization')
    })

    it('should use streaming instantiation when available', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)

      expect(globalThis.WebAssembly.instantiateStreaming).toHaveBeenCalled()
    })

    it('should fallback to buffer instantiation when streaming not available', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      // Remove instantiateStreaming
      // @ts-expect-error - Mocking
      globalThis.WebAssembly.instantiateStreaming = undefined

      const { loadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)

      expect(globalThis.WebAssembly.instantiate).toHaveBeenCalled()
    })

    it('should resolve immediately if SudokuWasm already available', async () => {
      // Set SudokuWasm before loading
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm } = await import('./wasm')

      const api = await loadWasm()
      expect(api).toBe(mockWasmApi)
      // The already-ready branch must log its exact message (kills the L350 string mutant)
      expect(loggerMock).toHaveBeenCalledWith('[WASM] SudokuWasm already available')
    })

    it('should not store abort error as wasmLoadError', async () => {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      vi.mocked(globalThis.fetch).mockRejectedValue(abortError)

      const { loadWasm, hasWasmError } = await import('./wasm')

      await expect(loadWasm()).rejects.toThrow('Aborted')
      expect(hasWasmError()).toBe(false)
    })
  })

  // ==================== preloadWasm ====================

  describe('preloadWasm()', () => {
    it('should call loadWasm without waiting', async () => {
      const { preloadWasm } = await import('./wasm')
      // Should not throw even if we don't await
      preloadWasm()

      // Wait a moment for the fetch to be initiated
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Trigger wasmReady event
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })

      expect(globalThis.fetch).toHaveBeenCalled()
    })

    it('should catch and warn on preload failure', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Preload failed'))

      const { preloadWasm } = await import('./wasm')

      preloadWasm()

      // Wait for the promise to settle
      await vi.waitFor(() => {
        expect(loggerMock).toHaveBeenCalledWith('WASM preload failed:', 'Preload failed')
      })
    })
  })

  // ==================== abortWasmLoad ====================

  describe('abortWasmLoad()', () => {
    it('should do nothing when no load in progress', async () => {
      const { abortWasmLoad } = await import('./wasm')

      // Should not throw
      expect(() => abortWasmLoad()).not.toThrow()
    })

    it('should clear wasmLoadPromise after abort', async () => {
      const { loadWasm, abortWasmLoad, isWasmReady } = await import('./wasm')

      // Start loading but don't complete
      vi.mocked(globalThis.fetch).mockImplementation(() => new Promise(() => {}))
      loadWasm().catch(() => {})

      abortWasmLoad()

      expect(isWasmReady()).toBe(false)
    })
  })

  // ==================== unloadWasm ====================

  describe('unloadWasm()', () => {
    it('should clear wasmInstance', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm, unloadWasm, isWasmReady, getWasmApi } = await import('./wasm')

      await runLoadCycle(loadWasm)

      expect(isWasmReady()).toBe(true)
      expect(getWasmApi()).not.toBe(null)

      unloadWasm()

      expect(isWasmReady()).toBe(false)
      expect(getWasmApi()).toBe(null)
    })

    it('should handle Go exit error gracefully', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      // Make Go.exit throw
      MockGoClass = class extends MockGoClass {
        exit = vi.fn().mockImplementation(() => {
          throw new Error('Exit error')
        })
      }
      // @ts-expect-error - Mocking
      globalThis.window.Go = MockGoClass

      const { loadWasm, unloadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)

      // Should not throw
      expect(() => unloadWasm()).not.toThrow()
    })

    it('should delete global SudokuWasm and Go references', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm, unloadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)

      unloadWasm()

      expect(globalThis.window.SudokuWasm).toBeUndefined()
    })

    it('should call gc if available', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      const gcMock = vi.fn()
      globalThis.window.gc = gcMock

      const { loadWasm, unloadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)

      unloadWasm()

      expect(gcMock).toHaveBeenCalled()
    })

    it('should abort in-progress fetch', async () => {
      const { loadWasm, unloadWasm } = await import('./wasm')

      // Start loading but don't complete
      vi.mocked(globalThis.fetch).mockImplementation(() => new Promise(() => {}))
      loadWasm().catch(() => {})

      // unloadWasm should abort the fetch
      expect(() => unloadWasm()).not.toThrow()
    })

    it('skips deleting window.Go during unload when it is already absent', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      // @ts-expect-error - Force the false branch of the `if (window.Go)` guard
      globalThis.window.Go = undefined

      const { unloadWasm } = await import('./wasm')

      expect(() => unloadWasm()).not.toThrow()
      // SudokuWasm is still removed even though Go was already gone.
      expect(globalThis.window.SudokuWasm).toBeUndefined()
    })
  })

  // ==================== Load Error Handling ====================

  describe('loadWasm() error wrapping', () => {
    it('wraps a non-Error rejection into an Error and stores it as the load error', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      // Reject the WASM fetch with a bare string (not an Error instance) so the
      // `error instanceof Error ? error : new Error(String(error))` false branch runs.
      globalThis.fetch = vi.fn().mockRejectedValue('network-blew-up')

      const { loadWasm, getWasmError, hasWasmError } = await import('./wasm')

      await expect(loadWasm()).rejects.toThrow('network-blew-up')
      expect(hasWasmError()).toBe(true)
      const err = getWasmError()
      expect(err).toBeInstanceOf(Error)
      expect(err?.message).toBe('network-blew-up')
    })
  })

  // ==================== API Wrapper Functions ====================

  describe('wasmFindNextMove()', () => {
    it('should return result when WASM loads successfully', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      const expectedResult = {
        move: { technique: 'NakedSingle' },
        board: { cells: [], candidates: [] },
        solved: false,
      }
      mockWasmApi.findNextMove.mockReturnValue(expectedResult)

      const { wasmFindNextMove } = await import('./wasm')

      const resultPromise = wasmFindNextMove([], [], [])

      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })

      const result = await resultPromise
      expect(result).toEqual(expectedResult)
      expect(mockWasmApi.findNextMove).toHaveBeenCalledWith([], [], [])
    })

    it('should return null when WASM fails to load', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Load failed'))

      const { wasmFindNextMove } = await import('./wasm')

      const result = await wasmFindNextMove([], [], [])
      expect(result).toBe(null)
    })
  })

  describe('wasmSolveAll()', () => {
    it('should return result when WASM loads successfully', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      const expectedResult = { moves: [], solved: true, finalBoard: [1, 2, 3] }
      mockWasmApi.solveAll.mockReturnValue(expectedResult)

      const { wasmSolveAll } = await import('./wasm')

      const resultPromise = wasmSolveAll([0], [[1, 2]], [0])

      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })

      const result = await resultPromise
      expect(result).toEqual(expectedResult)
      expect(mockWasmApi.solveAll).toHaveBeenCalledWith([0], [[1, 2]], [0])
    })

    it('should return null when WASM fails to load', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Load failed'))

      const { wasmSolveAll } = await import('./wasm')

      const result = await wasmSolveAll([], [], [])
      expect(result).toBe(null)
    })
  })

  describe('wasmSolveWithSteps()', () => {
    it('should return result when WASM loads successfully', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      const expectedResult = { moves: [], status: 'solved', finalBoard: [], solved: true }
      mockWasmApi.solveWithSteps.mockReturnValue(expectedResult)

      const { wasmSolveWithSteps } = await import('./wasm')

      const resultPromise = wasmSolveWithSteps([0, 1, 2], 100)

      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })

      const result = await resultPromise
      expect(result).toEqual(expectedResult)
      expect(mockWasmApi.solveWithSteps).toHaveBeenCalledWith([0, 1, 2], 100)
    })

    it('should return null when WASM fails to load', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Load failed'))

      const { wasmSolveWithSteps } = await import('./wasm')

      const result = await wasmSolveWithSteps([])
      expect(result).toBe(null)
    })
  })

  describe('wasmSolve()', () => {
    it('should return solution when WASM loads successfully', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      const expectedSolution = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      mockWasmApi.solve.mockReturnValue(expectedSolution)

      const { wasmSolve } = await import('./wasm')

      const resultPromise = wasmSolve([0, 0, 0])

      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })

      const result = await resultPromise
      expect(result).toEqual(expectedSolution)
      expect(mockWasmApi.solve).toHaveBeenCalledWith([0, 0, 0])
    })

    it('should return null when WASM fails to load', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Load failed'))

      const { wasmSolve } = await import('./wasm')

      const result = await wasmSolve([])
      expect(result).toBe(null)
    })
  })

  describe('wasmValidateBoard()', () => {
    it('should return validation result when WASM loads successfully', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      const expectedResult = { valid: true }
      mockWasmApi.validateBoard.mockReturnValue(expectedResult)

      const { wasmValidateBoard } = await import('./wasm')

      const resultPromise = wasmValidateBoard([1, 2], [1, 2])

      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })

      const result = await resultPromise
      expect(result).toEqual(expectedResult)
      expect(mockWasmApi.validateBoard).toHaveBeenCalledWith([1, 2], [1, 2])
    })

    it('should return null when WASM fails to load', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Load failed'))

      const { wasmValidateBoard } = await import('./wasm')

      const result = await wasmValidateBoard([], [])
      expect(result).toBe(null)
    })
  })

  describe('wasmValidateCustom()', () => {
    it('should return validation result when WASM loads successfully', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      const expectedResult = { valid: true, unique: true, solution: [1, 2, 3] }
      mockWasmApi.validateCustomPuzzle.mockReturnValue(expectedResult)

      const { wasmValidateCustom } = await import('./wasm')

      const resultPromise = wasmValidateCustom([0, 1, 2])

      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })

      const result = await resultPromise
      expect(result).toEqual(expectedResult)
      expect(mockWasmApi.validateCustomPuzzle).toHaveBeenCalledWith([0, 1, 2])
    })

    it('should return null when WASM fails to load', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Load failed'))

      const { wasmValidateCustom } = await import('./wasm')

      const result = await wasmValidateCustom([])
      expect(result).toBe(null)
    })
  })

  describe('wasmGetPuzzle()', () => {
    it('should return puzzle when WASM loads successfully', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      const expectedResult = {
        givens: [1],
        solution: [1],
        puzzleId: 'test',
        seed: 'seed',
        difficulty: 'easy',
      }
      mockWasmApi.getPuzzleForSeed.mockReturnValue(expectedResult)

      const { wasmGetPuzzle } = await import('./wasm')

      const resultPromise = wasmGetPuzzle('test-seed', 'medium')

      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })

      const result = await resultPromise
      expect(result).toEqual(expectedResult)
      expect(mockWasmApi.getPuzzleForSeed).toHaveBeenCalledWith('test-seed', 'medium')
    })

    it('should return null when WASM fails to load', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Load failed'))

      const { wasmGetPuzzle } = await import('./wasm')

      const result = await wasmGetPuzzle('seed', 'easy')
      expect(result).toBe(null)
    })
  })

  describe('wasmAnalyzePuzzle()', () => {
    it('should return analysis when WASM loads successfully', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      const expectedResult = {
        difficulty: 'hard',
        techniques: { NakedSingle: 5 },
        status: 'analyzed',
      }
      mockWasmApi.analyzePuzzle.mockReturnValue(expectedResult)

      const { wasmAnalyzePuzzle } = await import('./wasm')

      const resultPromise = wasmAnalyzePuzzle([0, 1, 2])

      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })

      const result = await resultPromise
      expect(result).toEqual(expectedResult)
      expect(mockWasmApi.analyzePuzzle).toHaveBeenCalledWith([0, 1, 2])
    })

    it('should return null when WASM fails to load', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Load failed'))

      const { wasmAnalyzePuzzle } = await import('./wasm')

      const result = await wasmAnalyzePuzzle([])
      expect(result).toBe(null)
    })
  })

  describe('wasmFindConflicts()', () => {
    it('should return conflicts when WASM loads successfully', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      const expectedResult = [{ cell1: 0, cell2: 1, value: 5, type: 'row' }]
      mockWasmApi.findConflicts.mockReturnValue(expectedResult)

      const { wasmFindConflicts } = await import('./wasm')

      const resultPromise = wasmFindConflicts([1, 1, 0])

      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })

      const result = await resultPromise
      expect(result).toEqual(expectedResult)
      expect(mockWasmApi.findConflicts).toHaveBeenCalledWith([1, 1, 0])
    })

    it('should return empty array when WASM fails to load', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Load failed'))

      const { wasmFindConflicts } = await import('./wasm')

      const result = await wasmFindConflicts([])
      expect(result).toEqual([])
    })
  })

  describe('wasmIsValid()', () => {
    it('should return true when grid is valid and WASM loads', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      mockWasmApi.isValid.mockReturnValue(true)

      const { wasmIsValid } = await import('./wasm')

      const resultPromise = wasmIsValid([1, 2, 3])

      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })

      const result = await resultPromise
      expect(result).toBe(true)
      expect(mockWasmApi.isValid).toHaveBeenCalledWith([1, 2, 3])
    })

    it('should return false when grid is invalid', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      mockWasmApi.isValid.mockReturnValue(false)

      const { wasmIsValid } = await import('./wasm')

      const resultPromise = wasmIsValid([1, 1, 1])

      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })

      const result = await resultPromise
      expect(result).toBe(false)
    })

    it('should return false when WASM fails to load', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Load failed'))

      const { wasmIsValid } = await import('./wasm')

      const result = await wasmIsValid([])
      expect(result).toBe(false)
    })
  })

  // ==================== getWasmVersion ====================

  describe('getWasmVersion()', () => {
    it('should return null when WASM is not loaded', async () => {
      const { getWasmVersion } = await import('./wasm')
      expect(getWasmVersion()).toBe(null)
    })

    it('should return version when WASM is loaded', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      mockWasmApi.getVersion.mockReturnValue('2.0.0')

      const { loadWasm, getWasmVersion } = await import('./wasm')

      await runLoadCycle(loadWasm)

      expect(getWasmVersion()).toBe('2.0.0')
    })

    it('should return null when getVersion throws', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      mockWasmApi.getVersion.mockImplementation(() => {
        throw new Error('Version error')
      })

      const { loadWasm, getWasmVersion } = await import('./wasm')

      await runLoadCycle(loadWasm)

      expect(getWasmVersion()).toBe(null)
    })
  })

  // ==================== loadWasmExec (via loadWasm) ====================

  describe('loadWasmExec (internal)', () => {
    it('should skip loading if Go is already defined', async () => {
      // Go is already mocked on window
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)

      // document.createElement should not have been called for script
      // (script loading is skipped when Go exists)
    })

    it('should handle script load error', async () => {
      // @ts-expect-error - Removing Go
      globalThis.window.Go = undefined

      // Make script fail to load
      // @ts-expect-error - Mocking
      globalThis.document.head.appendChild = vi.fn((script: { onerror: () => void }) => {
        setTimeout(() => {
          if (script.onerror) {
            script.onerror()
          }
        }, 0)
      })

      const { loadWasm } = await import('./wasm')

      await expect(loadWasm()).rejects.toThrow('Failed to load wasm_exec.js')
    })
  })

  // ==================== Mutation-Kill Assertions ====================

  describe('mutation-kill: loadWasm log sequence (exact strings)', () => {
    it('emits the expected debug messages and fetch URL during a streaming load (L253,L255,L273,L279,L280,L286,L293,L301,L305,L320)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)

      expect(loggerMock).toHaveBeenCalledWith(
        '[WASM] Loading wasm_exec.js from:',
        expect.stringMatching(/\/wasm_exec\.js$/),
      )
      expect(loggerMock).toHaveBeenCalledWith('[WASM] wasm_exec.js loaded')
      expect(loggerMock).toHaveBeenCalledWith('[WASM] Go instance created')
      expect(loggerMock).toHaveBeenCalledWith(
        '[WASM] Fetching WASM from:',
        expect.stringMatching(/\/sudoku\.wasm$/),
      )
      expect(loggerMock).toHaveBeenCalledWith('[WASM] WASM fetched, instantiating...')
      expect(loggerMock).toHaveBeenCalledWith('[WASM] Using streaming instantiation')
      expect(loggerMock).toHaveBeenCalledWith('[WASM] WASM instantiated, running Go...')
      expect(loggerMock).toHaveBeenCalledWith('[WASM] Starting Go program...')
      expect(loggerMock).toHaveBeenCalledWith('[WASM] Waiting for wasmReady event...')

      // Fetch must be called with the WASM URL and an options object carrying the abort signal
      const fetchCalls = vi.mocked(globalThis.fetch).mock.calls
      const wasmFetch = fetchCalls.find(
        (c) => typeof c[0] === 'string' && /sudoku\.wasm$/.test(c[0]),
      )
      expect(wasmFetch).toBeDefined()
      expect(wasmFetch?.[1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }))
    })

    it('emits the buffer-instantiation log when streaming is unavailable (L297)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      // @ts-expect-error - Mocking
      globalThis.WebAssembly.instantiateStreaming = undefined

      const { loadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)

      expect(loggerMock).toHaveBeenCalledWith('[WASM] Falling back to buffer instantiation')
    })
  })

  describe('mutation-kill: loadWasmExec script element', () => {
    it('sets the script src to wasm_exec.js and async=true, logs the load (L211,L213,L214,L216)', async () => {
      // @ts-expect-error - Removing Go so the script-load path runs
      globalThis.window.Go = undefined
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const createdScripts: { src: string; async: boolean }[] = []
      // @ts-expect-error - Mocking
      globalThis.document.createElement = vi.fn(() => {
        const s = { src: '', async: false, onload: null as null | (() => void), onerror: null }
        createdScripts.push(s)
        return s
      })
      // @ts-expect-error - Mocking
      globalThis.document.head.appendChild = vi.fn((script: { onload: () => void }) => {
        setTimeout(() => {
          // @ts-expect-error - Mocking
          globalThis.window.Go = MockGoClass
          script.onload()
        }, 0)
      })

      const { loadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)

      expect(createdScripts.length).toBe(1)
      expect(createdScripts[0]?.src).toBe('/wasm_exec.js')
      expect(createdScripts[0]?.async).toBe(true)
      expect(loggerMock).toHaveBeenCalledWith('[WASM] Loading wasm_exec.js from:', '/wasm_exec.js')
      expect(loggerMock).toHaveBeenCalledWith('[WASM] wasm_exec.js loaded successfully')
    })

    it('logs an error when the script fails to load (L220)', async () => {
      // @ts-expect-error - Removing Go
      globalThis.window.Go = undefined
      // @ts-expect-error - Mocking
      globalThis.document.head.appendChild = vi.fn((script: { onerror: () => void }) => {
        setTimeout(() => script.onerror(), 0)
      })

      const { loadWasm } = await import('./wasm')

      await expect(loadWasm()).rejects.toThrow('Failed to load wasm_exec.js')

      expect(errorMock).toHaveBeenCalledWith(
        '[WASM] Failed to load wasm_exec.js from:',
        '/wasm_exec.js',
      )
    })
  })

  describe('mutation-kill: Go program error attachment', () => {
    it('logs an async Go program error via the attached catch (L309)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      MockGoClass = class extends MockGoClass {
        run = vi.fn().mockReturnValue(Promise.reject(new Error('go boom')))
      }
      // @ts-expect-error - Mocking
      globalThis.window.Go = MockGoClass

      const { loadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)

      expect(errorMock).toHaveBeenCalledWith('[WASM] Go program error:', expect.any(Error))
    })
  })

  describe('mutation-kill: wasmReady timeout logs', () => {
    it('logs the timeout error and SudokuWasm availability (L331,L332,L336)', async () => {
      vi.useFakeTimers()
      try {
        const { loadWasm } = await import('./wasm')

        const loadPromise = loadWasm()
        const caught = loadPromise.catch(() => {})

        await vi.advanceTimersByTimeAsync(5100)
        await caught

        expect(errorMock).toHaveBeenCalledWith(
          '[WASM] Timeout waiting for wasmReady event after 5 seconds',
        )
        expect(loggerMock).toHaveBeenCalledWith('[WASM] window.SudokuWasm available:', false)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('mutation-kill: abort path log', () => {
    it('logs a debug message when the fetch is aborted (L365)', async () => {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      vi.mocked(globalThis.fetch).mockRejectedValue(abortError)

      const { loadWasm } = await import('./wasm')

      await expect(loadWasm()).rejects.toThrow('Aborted')

      expect(loggerMock).toHaveBeenCalledWith('[WASM] WASM fetch was aborted')
    })
  })

  describe('mutation-kill: unloadWasm cleanup side-effects', () => {
    it('calls goInstance.exit(0) during unload (L133,L135,L136)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const exitSpy = vi.fn()
      MockGoClass = class {
        importObject = { go: {} }
        exit = exitSpy
        run = vi.fn().mockResolvedValue(undefined)
      }
      // @ts-expect-error - Mocking
      globalThis.window.Go = MockGoClass

      const { loadWasm, unloadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)
      unloadWasm()

      expect(exitSpy).toHaveBeenCalledWith(0)
      expect(loggerMock).toHaveBeenCalledWith('[WASM] Unloading WASM module...')
      expect(loggerMock).toHaveBeenCalledWith('[WASM] WASM module unloaded, memory freed')
    })

    it('logs when Go.exit throws during unload (L138,L139)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      MockGoClass = class {
        importObject = { go: {} }
        exit = vi.fn(() => {
          throw new Error('exit failed')
        })
        run = vi.fn().mockResolvedValue(undefined)
      }
      // @ts-expect-error - Mocking
      globalThis.window.Go = MockGoClass

      const { loadWasm, unloadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)
      expect(() => unloadWasm()).not.toThrow()

      expect(loggerMock).toHaveBeenCalledWith('[WASM] Error during Go exit:', expect.any(Error))
    })

    it('does not call exit when the Go instance has no exit method (L135)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      MockGoClass = class {
        importObject = { go: {} }
        run = vi.fn().mockResolvedValue(undefined)
      }
      // @ts-expect-error - Mocking
      globalThis.window.Go = MockGoClass

      const { loadWasm, unloadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)
      // No exit method present: unload must not throw and must not log an exit error
      expect(() => unloadWasm()).not.toThrow()
      expect(loggerMock).not.toHaveBeenCalledWith('[WASM] Error during Go exit:', expect.any(Error))
    })

    it('aborts an in-progress fetch via the abort controller (L122)', async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort')
      try {
        const { loadWasm, unloadWasm } = await import('./wasm')

        vi.mocked(globalThis.fetch).mockImplementation(() => new Promise(() => {}))
        loadWasm().catch(() => {})

        await vi.waitFor(() => expect(abortSpy).not.toHaveBeenCalled())
        unloadWasm()

        expect(abortSpy).toHaveBeenCalled()
      } finally {
        abortSpy.mockRestore()
      }
    })

    it('removes the wasm_exec.js script element from the DOM (L146)', async () => {
      // @ts-expect-error - Removing Go so the script-load path runs and stores wasmScriptElement
      globalThis.window.Go = undefined
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const removeChild = vi.fn()
      const mockScript = {
        src: '',
        async: false,
        onload: null as null | (() => void),
        onerror: null,
        parentNode: { removeChild },
      }
      // @ts-expect-error - Mocking
      globalThis.document.createElement = vi.fn(() => mockScript)
      // @ts-expect-error - Mocking
      globalThis.document.head.appendChild = vi.fn((script: { onload: () => void }) => {
        setTimeout(() => {
          // @ts-expect-error - Mocking
          globalThis.window.Go = MockGoClass
          script.onload()
        }, 0)
      })

      const { loadWasm, unloadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)
      unloadWasm()

      expect(removeChild).toHaveBeenCalledWith(mockScript)
    })

    it('deletes the global Go reference (L157)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm, unloadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)
      unloadWasm()

      expect(globalThis.window.Go).toBeUndefined()
    })
  })

  describe('mutation-kill: wasmReady event-driven log', () => {
    it('logs when the wasmReady event is received (L324)', async () => {
      // Do NOT pre-set SudokuWasm; let the wasmReady handler fire instead of the immediate check
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = undefined

      const { loadWasm } = await import('./wasm')

      const loadPromise = loadWasm()
      await vi.waitFor(() => expect(wasmReadyHandler).not.toBeNull())
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      wasmReadyHandler!()
      await loadPromise

      expect(loggerMock).toHaveBeenCalledWith('[WASM] wasmReady event received successfully!')
    })
  })

  describe('mutation-kill: abortWasmLoad side effects', () => {
    it('calls abort() on the active AbortController and clears state (L179,L180,L181)', async () => {
      const { loadWasm, abortWasmLoad } = await import('./wasm')

      // Start a load that hangs on fetch so wasmAbortController stays set.
      vi.mocked(globalThis.fetch).mockImplementation(() => new Promise(() => {}))
      loadWasm().catch(() => {})

      // Wait for the AbortController to be created inside loadWasm.
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort')
      try {
        await vi.waitFor(() => expect(abortSpy).not.toHaveBeenCalled())

        abortWasmLoad()

        // Original calls .abort() and emits the debug log. The empty-body mutant
        // and the `if (false)` / empty-block mutants skip both effects.
        expect(abortSpy).toHaveBeenCalled()
        expect(loggerMock).toHaveBeenCalledWith('[WASM] Aborting WASM fetch...')
      } finally {
        abortSpy.mockRestore()
      }
    })
  })

  describe('mutation-kill: BASE_URL fallback and resolution logs', () => {
    it('falls back to "/" when import.meta.env.BASE_URL is empty (L194)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      // Empty BASE_URL: the original `|| '/'` returns '/'; the `&& '/'` and `|| ''`
      // mutants return '' (empty), producing a relative URL that breaks the path checks.
      vi.stubEnv('BASE_URL', '')

      const createdScripts: { src: string }[] = []
      // @ts-expect-error - Mocking
      globalThis.window.Go = undefined
      // @ts-expect-error - Mocking
      globalThis.document.createElement = vi.fn(() => {
        const s = { src: '', async: false, onload: null as null | (() => void), onerror: null }
        createdScripts.push(s)
        return s
      })
      // @ts-expect-error - Mocking
      globalThis.document.head.appendChild = vi.fn((script: { onload: () => void }) => {
        setTimeout(() => {
          // @ts-expect-error - Mocking
          globalThis.window.Go = MockGoClass
          script.onload()
        }, 0)
      })

      const { loadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)

      // Original resolves baseUrl to '/'; mutant would yield '' -> relative 'wasm_exec.js'.
      expect(createdScripts.some((s) => s.src === '/wasm_exec.js')).toBe(true)
      // L195/L196 log-message mutants: the empty-string mutants would emit "" instead.
      expect(loggerMock).toHaveBeenCalledWith('[WASM] BASE_URL resolved to:', '/')
      expect(loggerMock).toHaveBeenCalledWith('[WASM] import.meta.env.BASE_URL value:', '')
    })
  })

  describe('mutation-kill: loadWasmExec script element creation', () => {
    it('creates a "script" element (L210)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.Go = undefined
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const createElementSpy = vi.fn(() => ({
        src: '',
        async: false,
        onload: null as null | (() => void),
        onerror: null,
      }))
      // @ts-expect-error - Mocking
      globalThis.document.createElement = createElementSpy
      // @ts-expect-error - Mocking
      globalThis.document.head.appendChild = vi.fn((script: { onload: () => void }) => {
        setTimeout(() => {
          // @ts-expect-error - Mocking
          globalThis.window.Go = MockGoClass
          script.onload()
        }, 0)
      })

      const { loadWasm } = await import('./wasm')
      await runLoadCycle(loadWasm)

      // Mutant replaces 'script' with ''; the original tag name is required for production.
      expect(createElementSpy).toHaveBeenCalledWith('script')
    })
  })

  describe('mutation-kill: wasmReady listener removal', () => {
    it('removes the wasmReady listener by exact event name on the early-resolve path (L344)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)

      // On the early-resolve path (SudokuWasm already set), the handler must be removed
      // using the exact 'wasmReady' event name. The empty-string mutant leaves it attached.
      expect(globalThis.window.removeEventListener).toHaveBeenCalledWith(
        'wasmReady',
        expect.any(Function),
      )
    })

    it('removes the wasmReady listener by exact event name on the event-driven path (L326)', async () => {
      // Do NOT pre-set SudokuWasm; let the wasmReady handler fire.
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = undefined

      const { loadWasm } = await import('./wasm')
      const loadPromise = loadWasm()
      await vi.waitFor(() => expect(wasmReadyHandler).not.toBeNull())
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      wasmReadyHandler!()
      await loadPromise

      expect(globalThis.window.removeEventListener).toHaveBeenCalledWith(
        'wasmReady',
        expect.any(Function),
      )
    })

    it('removes the wasmReady listener by exact event name on the timeout path (L336)', async () => {
      vi.useFakeTimers()
      try {
        const { loadWasm } = await import('./wasm')

        const loadPromise = loadWasm()
        const caught = loadPromise.catch(() => {})

        await vi.advanceTimersByTimeAsync(5100)
        await caught

        expect(globalThis.window.removeEventListener).toHaveBeenCalledWith(
          'wasmReady',
          expect.any(Function),
        )
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('mutation-kill: rapid reload delay after unload', () => {
    it('waits WASM_RELOAD_DELAY_MS before refetching after a recent unload (L169,L268,L269,L270)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm, unloadWasm } = await import('./wasm')

      // First load + unload cycle primes wasmRecentlyUnloaded=true (L169).
      await runLoadCycle(loadWasm)
      unloadWasm()

      // Reload: original awaits a setTimeout(WASM_RELOAD_DELAY_MS) and then sets
      // wasmRecentlyUnloaded=false. The mutants (skip the await, pin the flag true,
      // or empty the if-block) all skip observable delay.
      vi.useFakeTimers()
      try {
        const fetchCountBefore = vi.mocked(globalThis.fetch).mock.calls.length
        const loadPromise = loadWasm()

        // The fetch must NOT happen immediately; the original waits one tick.
        await Promise.resolve()
        await Promise.resolve()
        expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(fetchCountBefore)

        // Flush the reload-delay timer; now the fetch proceeds and the wasmReady
        // handler gets registered.
        await vi.advanceTimersByTimeAsync(200)
        await vi.waitFor(() => {
          if (wasmReadyHandler) {
            // @ts-expect-error - Mocking
            globalThis.window.SudokuWasm = mockWasmApi
            wasmReadyHandler()
          }
        })
        await loadPromise

        // The reload-delay path was exercised end-to-end.
        expect(loggerMock).toHaveBeenCalledWith('[WASM] WASM instantiated, running Go...')
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('mutation-kill: synchronous go.run error path', () => {
    it('logs and rethrows when go.run throws synchronously (L314,L315)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      MockGoClass = class extends MockGoClass {
        run = vi.fn(() => {
          throw new Error('go boom sync')
        })
      }
      // @ts-expect-error - Mocking
      globalThis.window.Go = MockGoClass

      const { loadWasm } = await import('./wasm')

      await expect(loadWasm()).rejects.toThrow('go boom sync')
      expect(errorMock).toHaveBeenCalledWith(
        '[WASM] Immediate Go program error:',
        expect.any(Error),
      )
    })
  })

  describe('mutation-kill: wasmReady timeout with SudokuWasm present', () => {
    it('logs object keys when SudokuWasm is set at timeout (L333,L334)', async () => {
      vi.useFakeTimers()
      try {
        // Do NOT pre-set SudokuWasm; let the load register the wasmReady handler
        // and reach the pending Promise. Then set SudokuWasm just before the
        // timeout fires so the `if (window.SudokuWasm)` branch inside the timeout
        // executes.
        // @ts-expect-error - Mocking
        globalThis.window.SudokuWasm = undefined

        const { loadWasm } = await import('./wasm')

        const loadPromise = loadWasm()
        const caught = loadPromise.catch(() => {})

        // Wait for the handler to register, then set SudokuWasm so the timeout
        // handler's `if (window.SudokuWasm)` branch executes.
        await vi.waitFor(() => expect(wasmReadyHandler).not.toBeNull())
        // @ts-expect-error - Mocking
        globalThis.window.SudokuWasm = mockWasmApi

        await vi.advanceTimersByTimeAsync(5100)
        await caught

        // Original enters the block and logs keys; the `if (false)` mutant and the
        // empty-block mutant skip the log entirely.
        expect(loggerMock).toHaveBeenCalledWith('[WASM] SudokuWasm object keys:', expect.any(Array))
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('mutation-kill: defensive guards when window is missing globals', () => {
    it('does not throw when window.gc is not a function (L164 chain)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      // Provide 'gc' as a non-function value. The original guard skips the call;
      // mutants that force the condition true would call undefined()/string and throw.
      globalThis.window.gc = undefined
      // 'gc' in window must still be true for some mutants to enter
      Object.defineProperty(globalThis.window, 'gc', {
        value: undefined,
        configurable: true,
        writable: true,
        enumerable: true,
      })

      const { loadWasm, unloadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)

      // Under the original guard, window.gc() is NOT called (typeof undefined !== 'function').
      // Under the mutants that force the condition true, calling undefined() throws.
      expect(() => unloadWasm()).not.toThrow()
    })

    it('unloadWasm is a no-op (no throw) when window is entirely undefined (L152,L164)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm, unloadWasm } = await import('./wasm')
      await runLoadCycle(loadWasm)

      // Temporarily simulate a non-browser (SSR) environment by removing window entirely.
      // @ts-expect-error - Mocking
      globalThis.window = undefined
      try {
        // Original skips the window-touched branches via typeof guard.
        // The `if (true)` mutant would dereference undefined.SudokuWasm and throw.
        expect(() => unloadWasm()).not.toThrow()
      } finally {
        // Restore a minimal window for afterEach cleanup.
        globalThis.window = {
          Go: MockGoClass,
          SudokuWasm: undefined,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        } as unknown as typeof globalThis.window
      }
    })
  })

  // ==================== Mutation-Kill: attributable (perTest) ====================

  describe('mutation-kill: in-flight load dedup (attributable)', () => {
    it('reuses the in-flight promise for a concurrent call instead of starting a second load (L246)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm } = await import('./wasm')

      // Two synchronous calls: the second hits the in-flight-promise guard immediately
      // (synchronous top of loadWasm), so it is attributable to this test.
      const p1 = loadWasm()
      const p2 = loadWasm()
      const [a, b] = await Promise.all([p1, p2])

      expect(a).toBe(b)
      // Original returns the same in-flight promise -> exactly one fetch. If the guard is
      // forced false or emptied, the second call kicks off a fresh load and fetches twice.
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1)
    })
  })

  describe('mutation-kill: loadWasmExec Go guard and script-URL log (attributable)', () => {
    it('creates the wasm_exec.js script when Go is absent and logs the URL twice (L210,L218)', async () => {
      // @ts-expect-error - Removing Go forces the script-creation branch
      globalThis.window.Go = undefined
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const created: { src: string; async: boolean }[] = []
      // @ts-expect-error - Mocking
      globalThis.document.createElement = vi.fn(() => {
        const s = { src: '', async: false, onload: null as null | (() => void), onerror: null }
        created.push(s)
        return s
      })
      // @ts-expect-error - Mocking
      globalThis.document.head.appendChild = vi.fn((script: { onload: () => void }) => {
        setTimeout(() => {
          // @ts-expect-error - Mocking
          globalThis.window.Go = MockGoClass
          script.onload()
        }, 0)
      })

      const { loadWasm } = await import('./wasm')
      await runLoadCycle(loadWasm)

      // L210: when Go is absent the guard is false, so loadWasmExec builds a script.
      // Forcing the guard true early-returns, no script is created (and loadWasm then
      // throws 'Go runtime not available').
      expect(created.length).toBe(1)

      // L218: loadWasmExec logs the script URL. loadWasm already logs the same message
      // once unconditionally (its own pre-log), so on the script path the message must
      // appear exactly twice. Blanking L218's literal drops the count to one.
      const loadingLogs = loggerMock.mock.calls.filter(
        (c) => c[0] === '[WASM] Loading wasm_exec.js from:',
      )
      expect(loadingLogs.length).toBe(2)
    })
  })

  describe('mutation-kill: rapid-reload delay scheduling (attributable)', () => {
    it('schedules the reload-delay timer on a reload after unload (L173,L275)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm, unloadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)
      unloadWasm() // sets wasmRecentlyUnloaded = true (L173); also clears window.SudokuWasm/Go
      // @ts-expect-error - restore SudokuWasm so the reload's ready check resolves
      globalThis.window.SudokuWasm = mockWasmApi

      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
      try {
        await runLoadCycle(loadWasm)
        // The reload path awaits setTimeout(_, WASM_RELOAD_DELAY_MS=100). If L173 fails to
        // set the flag, or L275's guard is forced false/emptied, that timer is never scheduled.
        const delayCall = setTimeoutSpy.mock.calls.find((c) => c[1] === 100)
        expect(delayCall).toBeDefined()
      } finally {
        setTimeoutSpy.mockRestore()
      }
    }, 15000)

    it('clears the recently-unloaded flag after the delay so a later retry does not re-delay (L277)', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi

      const { loadWasm, unloadWasm } = await import('./wasm')

      await runLoadCycle(loadWasm)
      unloadWasm() // wasmRecentlyUnloaded = true; also clears window.SudokuWasm/Go

      // Reload attempt whose fetch fails AFTER the reload-delay block runs (which clears the
      // flag at L277). The failure leaves wasmInstance null and wasmLoadPromise null.
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('reload fetch failed'))
      await expect(loadWasm()).rejects.toThrow('reload fetch failed')

      // @ts-expect-error - restore SudokuWasm so the retry's ready check resolves
      globalThis.window.SudokuWasm = mockWasmApi

      // Now retry. The flag was cleared to false at L277, so this retry must NOT schedule the
      // 100ms reload delay. If L277 pins the flag true instead, the retry re-delays.
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
      try {
        await runLoadCycle(loadWasm)
        const delayCall = setTimeoutSpy.mock.calls.find((c) => c[1] === 100)
        expect(delayCall).toBeUndefined()
      } finally {
        setTimeoutSpy.mockRestore()
      }
    }, 15000)
  })
})
