import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest'

// =============================================================================
// MOCKS
// =============================================================================

// Mock the wasm module
const mockIsWasmReady = vi.fn(() => false)
const mockGetWasmApi = vi.fn(() => null)
const mockLoadWasm = vi.fn()
const mockPreloadWasm = vi.fn()

vi.mock('../lib/wasm', () => ({
  isWasmReady: () => mockIsWasmReady(),
  getWasmApi: () => mockGetWasmApi(),
  loadWasm: () => mockLoadWasm(),
  preloadWasm: () => mockPreloadWasm(),
}))

// Import after mocks are set up
import { useWasmSolver, isWasmReady, getWasmApi, loadWasm } from './useWasmSolver'
import type { SudokuWasmAPI, FindNextMoveResult, SolveAllResult, ValidateBoardResult, ValidateCustomResult } from '../lib/wasm'

// =============================================================================
// MOCK API FACTORY
// =============================================================================

/**
 * Create a mock WASM API for testing
 */
function createMockWasmApi(): SudokuWasmAPI {
  return {
    createBoard: vi.fn(),
    createBoardWithCandidates: vi.fn(),
    findNextMove: vi.fn().mockReturnValue({
      move: { step_index: 1, technique: 'Naked Single', action: 'assign', digit: 5, targets: [{ row: 0, col: 0 }], explanation: 'Test', refs: { title: 'Test', slug: 'test', url: '/test' }, highlights: { primary: [] } },
      board: { cells: [], candidates: [] },
      solved: false,
    } as FindNextMoveResult),
    solveWithSteps: vi.fn(),
    analyzePuzzle: vi.fn(),
    solveAll: vi.fn().mockReturnValue({
      moves: [],
      solved: true,
      finalBoard: Array(81).fill(0),
    } as SolveAllResult),
    solve: vi.fn(),
    hasUniqueSolution: vi.fn(),
    isValid: vi.fn(),
    findConflicts: vi.fn(),
    generateFullGrid: vi.fn(),
    carveGivens: vi.fn(),
    carveGivensWithSubset: vi.fn(),
    validateCustomPuzzle: vi.fn().mockReturnValue({
      valid: true,
      unique: true,
      solution: Array(81).fill(0),
    } as ValidateCustomResult),
    validateBoard: vi.fn().mockReturnValue({
      valid: true,
    } as ValidateBoardResult),
    getPuzzleForSeed: vi.fn().mockReturnValue({
      givens: Array(81).fill(0),
      solution: Array(81).fill(0),
      puzzleId: 'test-puzzle-id',
      seed: 'test-seed',
      difficulty: 'medium',
    }),
    getVersion: vi.fn().mockReturnValue('1.0.0'),
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('useWasmSolver', () => {
  let mockApi: SudokuWasmAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockApi = createMockWasmApi()
    mockIsWasmReady.mockReturnValue(false)
    mockGetWasmApi.mockReturnValue(null)
    mockLoadWasm.mockResolvedValue(mockApi)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // INITIALIZATION TESTS
  // ===========================================================================
  describe('Initialization', () => {
    it('returns expected interface', () => {
      const { result } = renderHook(() => useWasmSolver())

      expect(result.current).toHaveProperty('isReady')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('load')
      expect(result.current).toHaveProperty('findNextMove')
      expect(result.current).toHaveProperty('solveAll')
      expect(result.current).toHaveProperty('validateBoard')
      expect(result.current).toHaveProperty('validateCustom')
      expect(result.current).toHaveProperty('getPuzzle')
      expect(result.current).toHaveProperty('api')
    })

    it('returns correct types for each property', () => {
      const { result } = renderHook(() => useWasmSolver())

      expect(typeof result.current.isReady).toBe('boolean')
      expect(typeof result.current.isLoading).toBe('boolean')
      expect(result.current.error).toBeNull()
      expect(typeof result.current.load).toBe('function')
      expect(typeof result.current.findNextMove).toBe('function')
      expect(typeof result.current.solveAll).toBe('function')
      expect(typeof result.current.validateBoard).toBe('function')
      expect(typeof result.current.validateCustom).toBe('function')
      expect(typeof result.current.getPuzzle).toBe('function')
    })

    it('starts with isReady false when WASM not loaded', () => {
      mockIsWasmReady.mockReturnValue(false)
      const { result } = renderHook(() => useWasmSolver())

      expect(result.current.isReady).toBe(false)
    })

    it('starts with isReady true when WASM already loaded', () => {
      mockIsWasmReady.mockReturnValue(true)
      mockGetWasmApi.mockReturnValue(mockApi)
      const { result } = renderHook(() => useWasmSolver())

      expect(result.current.isReady).toBe(true)
    })

    it('starts with isLoading false', () => {
      const { result } = renderHook(() => useWasmSolver())

      expect(result.current.isLoading).toBe(false)
    })

    it('starts with error null', () => {
      const { result } = renderHook(() => useWasmSolver())

      expect(result.current.error).toBeNull()
    })

    it('starts with api null when WASM not loaded', () => {
      mockGetWasmApi.mockReturnValue(null)
      const { result } = renderHook(() => useWasmSolver())

      expect(result.current.api).toBeNull()
    })

    it('starts with api set when WASM already loaded', () => {
      mockIsWasmReady.mockReturnValue(true)
      mockGetWasmApi.mockReturnValue(mockApi)
      const { result } = renderHook(() => useWasmSolver())

      expect(result.current.api).toBe(mockApi)
    })
  })

  // ===========================================================================
  // PRELOAD ON MOUNT TESTS
  // ===========================================================================
  describe('Preload on Mount', () => {
    it('calls preloadWasm by default when WASM not ready', () => {
      mockIsWasmReady.mockReturnValue(false)
      renderHook(() => useWasmSolver())

      expect(mockPreloadWasm).toHaveBeenCalled()
    })

    it('does not call preloadWasm when WASM already ready', () => {
      mockIsWasmReady.mockReturnValue(true)
      mockGetWasmApi.mockReturnValue(mockApi)
      renderHook(() => useWasmSolver())

      expect(mockPreloadWasm).not.toHaveBeenCalled()
    })

    it('does not call preloadWasm when preloadOnMount is false', () => {
      mockIsWasmReady.mockReturnValue(false)
      renderHook(() => useWasmSolver({ preloadOnMount: false }))

      expect(mockPreloadWasm).not.toHaveBeenCalled()
    })

    it('calls preloadWasm when preloadOnMount is true', () => {
      mockIsWasmReady.mockReturnValue(false)
      renderHook(() => useWasmSolver({ preloadOnMount: true }))

      expect(mockPreloadWasm).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // LOAD FUNCTION TESTS
  // ===========================================================================
  describe('load() Function', () => {
    it('returns true immediately if already ready', async () => {
      mockIsWasmReady.mockReturnValue(true)
      mockGetWasmApi.mockReturnValue(mockApi)
      const { result } = renderHook(() => useWasmSolver())

      let loadResult: boolean = false
      await act(async () => {
        loadResult = await result.current.load()
      })

      expect(loadResult).toBe(true)
      expect(mockLoadWasm).not.toHaveBeenCalled()
    })

    it('calls loadWasm when not ready', async () => {
      const { result } = renderHook(() => useWasmSolver())

      await act(async () => {
        await result.current.load()
      })

      expect(mockLoadWasm).toHaveBeenCalled()
    })

    it('sets isLoading true while loading', async () => {
      let resolveLoad: (value: SudokuWasmAPI) => void
      mockLoadWasm.mockImplementation(() => new Promise((resolve) => {
        resolveLoad = resolve
      }))

      const { result } = renderHook(() => useWasmSolver())

      // Start loading
      let loadPromise: Promise<boolean>
      act(() => {
        loadPromise = result.current.load()
      })

      // Should be loading
      expect(result.current.isLoading).toBe(true)

      // Resolve the load
      await act(async () => {
        resolveLoad!(mockApi)
        await loadPromise
      })

      // Should no longer be loading
      expect(result.current.isLoading).toBe(false)
    })

    it('sets isReady true after successful load', async () => {
      const { result } = renderHook(() => useWasmSolver())

      expect(result.current.isReady).toBe(false)

      await act(async () => {
        await result.current.load()
      })

      expect(result.current.isReady).toBe(true)
    })

    it('sets api after successful load', async () => {
      const { result } = renderHook(() => useWasmSolver())

      expect(result.current.api).toBeNull()

      await act(async () => {
        await result.current.load()
      })

      expect(result.current.api).toBe(mockApi)
    })

    it('returns true on successful load', async () => {
      const { result } = renderHook(() => useWasmSolver())

      let loadResult: boolean = false
      await act(async () => {
        loadResult = await result.current.load()
      })

      expect(loadResult).toBe(true)
    })

    it('sets error on load failure', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockLoadWasm.mockRejectedValue(new Error('WASM load failed'))

      const { result } = renderHook(() => useWasmSolver())

      await act(async () => {
        await result.current.load()
      })

      expect(result.current.error).toBe('WASM load failed')
      expect(result.current.isReady).toBe(false)
      consoleWarnSpy.mockRestore()
    })

    it('returns false on load failure', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockLoadWasm.mockRejectedValue(new Error('WASM load failed'))

      const { result } = renderHook(() => useWasmSolver())

      let loadResult: boolean = true
      await act(async () => {
        loadResult = await result.current.load()
      })

      expect(loadResult).toBe(false)
      consoleWarnSpy.mockRestore()
    })

    it('handles non-Error exceptions', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockLoadWasm.mockRejectedValue('string error')

      const { result } = renderHook(() => useWasmSolver())

      await act(async () => {
        await result.current.load()
      })

      expect(result.current.error).toBe('Failed to load WASM')
      consoleWarnSpy.mockRestore()
    })

    it('prevents concurrent loads', async () => {
      let resolveLoad: (value: SudokuWasmAPI) => void
      mockLoadWasm.mockImplementation(() => new Promise((resolve) => {
        resolveLoad = resolve
      }))

      const { result } = renderHook(() => useWasmSolver())

      // Start first load
      let loadPromise1: Promise<boolean>
      let loadPromise2: Promise<boolean>
      act(() => {
        loadPromise1 = result.current.load()
        loadPromise2 = result.current.load()
      })

      // Resolve the load
      await act(async () => {
        resolveLoad!(mockApi)
        await Promise.all([loadPromise1, loadPromise2])
      })

      // Should have only called loadWasm once
      expect(mockLoadWasm).toHaveBeenCalledTimes(1)
    })
  })

  // ===========================================================================
  // WASM READY EVENT TESTS
  // ===========================================================================
  describe('wasmReady Event', () => {
    it('updates state when wasmReady event fires', async () => {
      const { result } = renderHook(() => useWasmSolver())

      expect(result.current.isReady).toBe(false)

      // Simulate WASM becoming ready
      mockIsWasmReady.mockReturnValue(true)
      mockGetWasmApi.mockReturnValue(mockApi)

      await act(async () => {
        window.dispatchEvent(new Event('wasmReady'))
      })

      expect(result.current.isReady).toBe(true)
      expect(result.current.api).toBe(mockApi)
    })

    it('clears error when wasmReady event fires', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockLoadWasm.mockRejectedValue(new Error('Initial failure'))

      const { result } = renderHook(() => useWasmSolver())

      // Trigger an error
      await act(async () => {
        await result.current.load()
      })

      expect(result.current.error).toBe('Initial failure')

      // Simulate WASM becoming ready
      mockIsWasmReady.mockReturnValue(true)
      mockGetWasmApi.mockReturnValue(mockApi)

      await act(async () => {
        window.dispatchEvent(new Event('wasmReady'))
      })

      expect(result.current.error).toBeNull()
      consoleWarnSpy.mockRestore()
    })

    it('removes event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      const { unmount } = renderHook(() => useWasmSolver())

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('wasmReady', expect.any(Function))
      removeEventListenerSpy.mockRestore()
    })
  })

  // ===========================================================================
  // SOLVER METHOD TESTS - API NOT READY
  // ===========================================================================
  describe('Solver Methods When API Not Ready', () => {
    it('findNextMove returns null when API not ready', () => {
      const { result } = renderHook(() => useWasmSolver())

      const moveResult = result.current.findNextMove([], [[]], [])

      expect(moveResult).toBeNull()
    })

    it('solveAll returns null when API not ready', () => {
      const { result } = renderHook(() => useWasmSolver())

      const solveResult = result.current.solveAll([], [[]], [])

      expect(solveResult).toBeNull()
    })

    it('validateBoard returns null when API not ready', () => {
      const { result } = renderHook(() => useWasmSolver())

      const validateResult = result.current.validateBoard([], [])

      expect(validateResult).toBeNull()
    })

    it('validateCustom returns null when API not ready', () => {
      const { result } = renderHook(() => useWasmSolver())

      const validateResult = result.current.validateCustom([])

      expect(validateResult).toBeNull()
    })

    it('getPuzzle returns null when API not ready', () => {
      const { result } = renderHook(() => useWasmSolver())

      const puzzleResult = result.current.getPuzzle('seed', 'medium')

      expect(puzzleResult).toBeNull()
    })
  })

  // ===========================================================================
  // SOLVER METHOD TESTS - API READY
  // ===========================================================================
  describe('Solver Methods When API Ready', () => {
    beforeEach(() => {
      mockIsWasmReady.mockReturnValue(true)
      mockGetWasmApi.mockReturnValue(mockApi)
    })

    it('findNextMove calls API and returns result', () => {
      const { result } = renderHook(() => useWasmSolver())

      const cells = Array(81).fill(0)
      const candidates = Array(81).fill([1, 2, 3])
      const givens = Array(81).fill(0)

      const moveResult = result.current.findNextMove(cells, candidates, givens)

      expect(mockApi.findNextMove).toHaveBeenCalledWith(cells, candidates, givens)
      expect(moveResult).not.toBeNull()
      expect(moveResult?.move?.technique).toBe('Naked Single')
    })

    it('solveAll calls API and returns result', () => {
      const { result } = renderHook(() => useWasmSolver())

      const cells = Array(81).fill(0)
      const candidates = Array(81).fill([1, 2, 3])
      const givens = Array(81).fill(0)

      const solveResult = result.current.solveAll(cells, candidates, givens)

      expect(mockApi.solveAll).toHaveBeenCalledWith(cells, candidates, givens)
      expect(solveResult).not.toBeNull()
      expect(solveResult?.solved).toBe(true)
    })

    it('validateBoard calls API and returns result', () => {
      const { result } = renderHook(() => useWasmSolver())

      const board = Array(81).fill(0)
      const solution = Array(81).fill(0)

      const validateResult = result.current.validateBoard(board, solution)

      expect(mockApi.validateBoard).toHaveBeenCalledWith(board, solution)
      expect(validateResult).not.toBeNull()
      expect(validateResult?.valid).toBe(true)
    })

    it('validateCustom calls API validateCustomPuzzle and returns result', () => {
      const { result } = renderHook(() => useWasmSolver())

      const givens = Array(81).fill(0)

      const validateResult = result.current.validateCustom(givens)

      expect(mockApi.validateCustomPuzzle).toHaveBeenCalledWith(givens)
      expect(validateResult).not.toBeNull()
      expect(validateResult?.valid).toBe(true)
    })

    it('getPuzzle calls API and returns structured result', () => {
      const { result } = renderHook(() => useWasmSolver())

      const puzzleResult = result.current.getPuzzle('test-seed', 'hard')

      expect(mockApi.getPuzzleForSeed).toHaveBeenCalledWith('test-seed', 'hard')
      expect(puzzleResult).not.toBeNull()
      expect(puzzleResult?.puzzleId).toBe('test-puzzle-id')
      expect(puzzleResult?.givens).toBeDefined()
      expect(puzzleResult?.solution).toBeDefined()
    })

    it('getPuzzle returns null when API returns error', () => {
      (mockApi.getPuzzleForSeed as Mock).mockReturnValue({
        error: 'Puzzle not found',
        givens: [],
        solution: [],
        puzzleId: '',
        seed: '',
        difficulty: '',
      })

      const { result } = renderHook(() => useWasmSolver())

      const puzzleResult = result.current.getPuzzle('bad-seed', 'medium')

      expect(puzzleResult).toBeNull()
    })
  })

  // ===========================================================================
  // SOLVER METHOD ERROR HANDLING TESTS
  // ===========================================================================
  describe('Solver Methods Error Handling', () => {
    beforeEach(() => {
      mockIsWasmReady.mockReturnValue(true)
      mockGetWasmApi.mockReturnValue(mockApi)
    })

    it('findNextMove returns null and logs error on exception', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      ;(mockApi.findNextMove as Mock).mockImplementation(() => {
        throw new Error('WASM error')
      })

      const { result } = renderHook(() => useWasmSolver())

      const moveResult = result.current.findNextMove([], [[]], [])

      expect(moveResult).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('WASM findNextMove error:', expect.any(Error))
      consoleErrorSpy.mockRestore()
    })

    it('solveAll returns null and logs error on exception', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      ;(mockApi.solveAll as Mock).mockImplementation(() => {
        throw new Error('WASM error')
      })

      const { result } = renderHook(() => useWasmSolver())

      const solveResult = result.current.solveAll([], [[]], [])

      expect(solveResult).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('WASM solveAll error:', expect.any(Error))
      consoleErrorSpy.mockRestore()
    })

    it('validateBoard returns null and logs error on exception', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      ;(mockApi.validateBoard as Mock).mockImplementation(() => {
        throw new Error('WASM error')
      })

      const { result } = renderHook(() => useWasmSolver())

      const validateResult = result.current.validateBoard([], [])

      expect(validateResult).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('WASM validateBoard error:', expect.any(Error))
      consoleErrorSpy.mockRestore()
    })

    it('validateCustom returns null and logs error on exception', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      ;(mockApi.validateCustomPuzzle as Mock).mockImplementation(() => {
        throw new Error('WASM error')
      })

      const { result } = renderHook(() => useWasmSolver())

      const validateResult = result.current.validateCustom([])

      expect(validateResult).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('WASM validateCustom error:', expect.any(Error))
      consoleErrorSpy.mockRestore()
    })

    it('getPuzzle returns null and logs error on exception', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      ;(mockApi.getPuzzleForSeed as Mock).mockImplementation(() => {
        throw new Error('WASM error')
      })

      const { result } = renderHook(() => useWasmSolver())

      const puzzleResult = result.current.getPuzzle('seed', 'medium')

      expect(puzzleResult).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('WASM getPuzzle error:', expect.any(Error))
      consoleErrorSpy.mockRestore()
    })
  })

  // ===========================================================================
  // RE-EXPORT TESTS
  // ===========================================================================
  describe('Re-exports', () => {
    it('re-exports isWasmReady from wasm module', () => {
      mockIsWasmReady.mockReturnValue(true)

      const result = isWasmReady()

      expect(result).toBe(true)
      expect(mockIsWasmReady).toHaveBeenCalled()
    })

    it('re-exports getWasmApi from wasm module', () => {
      mockGetWasmApi.mockReturnValue(mockApi)

      const result = getWasmApi()

      expect(result).toBe(mockApi)
      expect(mockGetWasmApi).toHaveBeenCalled()
    })

    it('re-exports loadWasm from wasm module', async () => {
      mockLoadWasm.mockResolvedValue(mockApi)

      const result = await loadWasm()

      expect(result).toBe(mockApi)
      expect(mockLoadWasm).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // INTEGRATION TESTS
  // ===========================================================================
  describe('Integration Scenarios', () => {
    it('full flow: load then use solver methods', async () => {
      const { result } = renderHook(() => useWasmSolver())

      // Initially not ready
      expect(result.current.isReady).toBe(false)
      expect(result.current.findNextMove([], [[]], [])).toBeNull()

      // Load WASM
      await act(async () => {
        await result.current.load()
      })

      // Now ready and methods work
      expect(result.current.isReady).toBe(true)
      expect(result.current.findNextMove([], [[]], [])).not.toBeNull()
    })

    it('handles multiple renders with stable references', async () => {
      const { result, rerender } = renderHook(() => useWasmSolver())

      const initialLoad = result.current.load

      rerender()

      // load function should be stable (memoized with useCallback)
      expect(result.current.load).toBe(initialLoad)
    })

    it('solver methods update when api changes', async () => {
      const { result } = renderHook(() => useWasmSolver())

      // Initially returns null
      const initialResult = result.current.findNextMove([], [[]], [])
      expect(initialResult).toBeNull()

      // Load API
      await act(async () => {
        await result.current.load()
      })

      // Now returns actual result
      const loadedResult = result.current.findNextMove([], [[]], [])
      expect(loadedResult).not.toBeNull()
    })
  })
})
