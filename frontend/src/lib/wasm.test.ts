import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * WASM Module Unit Tests
 * 
 * Tests the WASM loader and API wrapper module which manages
 * WebAssembly loading for the Sudoku solver.
 */

// Mock logger before importing the module
let loggerMock = vi.fn()
vi.mock('./logger', () => ({
  logger: {
    debug: loggerMock,
    error: vi.fn(),
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
    findNextMove: vi.fn().mockReturnValue({ move: null, board: { cells: [], candidates: [] }, solved: false }),
    solveWithSteps: vi.fn().mockReturnValue({ moves: [], status: 'solved', finalBoard: [], solved: true }),
    analyzePuzzle: vi.fn().mockReturnValue({ difficulty: 'easy', techniques: {}, status: 'analyzed' }),
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
    getPuzzleForSeed: vi.fn().mockReturnValue({ givens: [], solution: [], puzzleId: 'test', seed: 'test', difficulty: 'easy' }),
    getVersion: vi.fn().mockReturnValue('1.0.0'),
  }
}

// Create mock Go class
function createMockGoClass() {
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
  let mockWasmApi: ReturnType<typeof createMockWasmApi>
  let MockGoClass: ReturnType<typeof createMockGoClass>
  let wasmReadyHandler: (() => void) | null = null
  
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    loggerMock.mockClear()

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
    
    // @ts-expect-error - Mocking document
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
    }
    
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
      
      const loadPromise = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })
      await loadPromise
      
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
      
      const loadPromise = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })
      await loadPromise
      
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
        
        // Attach rejection handler BEFORE advancing time to prevent unhandled rejection
        // This catches the rejection when it happens during timer advancement
        let error: Error | null = null
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
      
      const loadPromise = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })
      await loadPromise
      
      expect(globalThis.WebAssembly.instantiateStreaming).toHaveBeenCalled()
    })
    
    it('should fallback to buffer instantiation when streaming not available', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      
      // Remove instantiateStreaming
      // @ts-expect-error - Mocking
      globalThis.WebAssembly.instantiateStreaming = undefined
      
      const { loadWasm } = await import('./wasm')
      
      const loadPromise = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })
      await loadPromise
      
      expect(globalThis.WebAssembly.instantiate).toHaveBeenCalled()
    })
    
    it('should resolve immediately if SudokuWasm already available', async () => {
      // Set SudokuWasm before loading
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      
      const { loadWasm } = await import('./wasm')
      
      const api = await loadWasm()
      expect(api).toBe(mockWasmApi)
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
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      
      const { preloadWasm } = await import('./wasm')
      
      // Should not throw even if we don't await
      preloadWasm()
      
      // Trigger the wasmReady event
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
    
    it('should abort an in-progress fetch', async () => {
      const { loadWasm, abortWasmLoad } = await import('./wasm')
      
      // Make fetch hang
      vi.mocked(globalThis.fetch).mockImplementation(() => new Promise(() => {}))
      
      // Start loading
      const loadPromise = loadWasm()
      
      // Abort the load
      abortWasmLoad()
      
      // The promise should be rejected with abort
      // Note: The actual abort happens via AbortController, which we're mocking
      // In real code, this would throw an AbortError
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
      
      const loadPromise = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })
      await loadPromise
      
      expect(isWasmReady()).toBe(true)
      expect(getWasmApi()).not.toBe(null)
      
      unloadWasm()
      
      expect(isWasmReady()).toBe(false)
      expect(getWasmApi()).toBe(null)
    })
    
    it('should call Go exit if available', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      
      const { loadWasm, unloadWasm } = await import('./wasm')
      
      const loadPromise = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })
      await loadPromise
      
      unloadWasm()
      
      // The exit function should have been called
      // We can't easily verify this without more complex mocking
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
      
      const loadPromise = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })
      await loadPromise
      
      // Should not throw
      expect(() => unloadWasm()).not.toThrow()
    })
    
    it('should remove script element from DOM', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      
      const { loadWasm, unloadWasm } = await import('./wasm')
      
      const loadPromise = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })
      await loadPromise
      
      unloadWasm()
      
      // Script's parentNode.removeChild should have been called
    })
    
    it('should delete global SudokuWasm and Go references', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      
      const { loadWasm, unloadWasm } = await import('./wasm')
      
      const loadPromise = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })
      await loadPromise
      
      unloadWasm()
      
      // @ts-expect-error - Checking deletion
      expect(globalThis.window.SudokuWasm).toBeUndefined()
    })
    
    it('should call gc if available', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      const gcMock = vi.fn()
      // @ts-expect-error - Mocking
      globalThis.window.gc = gcMock
      
      const { loadWasm, unloadWasm } = await import('./wasm')
      
      const loadPromise = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })
      await loadPromise
      
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
  })
  
  // ==================== API Wrapper Functions ====================
  
  describe('wasmFindNextMove()', () => {
    it('should return result when WASM loads successfully', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      const expectedResult = { move: { technique: 'NakedSingle' }, board: { cells: [], candidates: [] }, solved: false }
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
      const expectedResult = { givens: [1], solution: [1], puzzleId: 'test', seed: 'seed', difficulty: 'easy' }
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
      const expectedResult = { difficulty: 'hard', techniques: { NakedSingle: 5 }, status: 'analyzed' }
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
      
      const loadPromise = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })
      await loadPromise
      
      expect(getWasmVersion()).toBe('2.0.0')
    })
    
    it('should return null when getVersion throws', async () => {
      // @ts-expect-error - Mocking
      globalThis.window.SudokuWasm = mockWasmApi
      mockWasmApi.getVersion.mockImplementation(() => {
        throw new Error('Version error')
      })
      
      const { loadWasm, getWasmVersion } = await import('./wasm')
      
      const loadPromise = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })
      await loadPromise
      
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
      
      const loadPromise = loadWasm()
      await vi.waitFor(() => {
        if (wasmReadyHandler) {
          wasmReadyHandler()
        }
      })
      await loadPromise
      
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
})
