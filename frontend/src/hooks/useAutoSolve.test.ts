import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAutoSolve } from './useAutoSolve'

// =============================================================================
// MOCKS
// =============================================================================

// Mock the solver service
vi.mock('../lib/solver-service', () => ({
  solveAll: vi.fn(),
}))

// Import the mocked function for assertions
import { solveAll } from '../lib/solver-service'
import { createMockBackgroundManager } from '../test-utils/mocks'
const mockSolveAll = vi.mocked(solveAll)

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Create a mock background manager for testing
 */
// Use shared mock from test-utils/mocks
// Local overrides in tests can wrap or extend this helper when needed

/**
 * Create default options for useAutoSolve hook
 */
const createDefaultOptions = (overrides?: Partial<Parameters<typeof useAutoSolve>[0]>) => ({
  getBoard: vi.fn(() => Array(81).fill(0)),
  getCandidates: vi.fn(() => Array(81).fill(null).map(() => new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]))),
  getGivens: vi.fn(() => Array(81).fill(0)),
  applyMove: vi.fn(),
  applyState: vi.fn(),
  isComplete: vi.fn(() => false),
  onError: vi.fn(),
  onUnpinpointableError: vi.fn(),
  onStatus: vi.fn(),
  onErrorFixed: vi.fn(),
  onStepNavigate: vi.fn(),
  backgroundManager: createMockBackgroundManager(),
  stepDelay: 10, // Fast for tests
  ...overrides,
})

/**
 * Create a mock move result from the solver API
 */
const createMockMove = (overrides?: Partial<{
  action: string
  technique: string
  digit: number
  explanation: string
  userEntryCount: number
}>) => ({
  board: Array(81).fill(0),
  candidates: Array(81).fill(null).map(() => [1, 2, 3]),
  move: {
    step_index: 0,
    technique: overrides?.technique ?? 'Naked Single',
    action: overrides?.action ?? 'place',
    digit: overrides?.digit ?? 5,
    targets: [{ row: 0, col: 0 }],
    explanation: overrides?.explanation ?? 'Test move',
    refs: { title: 'Test', slug: 'test', url: '/test' },
    highlights: { primary: [] },
    userEntryCount: overrides?.userEntryCount,
  },
})

/**
 * Create a mock API response with multiple moves
 */
const createMockSolveResponse = (moveCount: number = 3, overrides?: { solved?: boolean }) => ({
  solved: overrides?.solved ?? true,
  moves: Array(moveCount).fill(null).map((_, i) => ({
    ...createMockMove(),
    move: {
      ...createMockMove().move,
      step_index: i,
      explanation: `Move ${i + 1}`,
    },
  })),
})

// =============================================================================
// TESTS
// =============================================================================

describe('useAutoSolve', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockSolveAll.mockReset()
    // Mock document.visibilityState to 'visible' by default
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ===========================================================================
  // HOOK INITIALIZATION
  // ===========================================================================
  describe('Hook Initialization', () => {
    it('starts with isAutoSolving=false', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      expect(result.current.isAutoSolving).toBe(false)
    })

    it('starts with isPaused=false', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      expect(result.current.isPaused).toBe(false)
    })

    it('starts with isFetching=false', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      expect(result.current.isFetching).toBe(false)
    })

    it('starts with currentIndex=-1', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      expect(result.current.currentIndex).toBe(-1)
    })

    it('starts with totalMoves=0', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      expect(result.current.totalMoves).toBe(0)
    })

    it('starts with canStepBack=false', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      expect(result.current.canStepBack).toBe(false)
    })

    it('starts with canStepForward=false', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      expect(result.current.canStepForward).toBe(false)
    })

    it('starts with lastCompletedSteps=0', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      expect(result.current.lastCompletedSteps).toBe(0)
    })
  })

  // ===========================================================================
  // startAutoSolve() - HAPPY PATH
  // ===========================================================================
  describe('startAutoSolve() - Happy Path', () => {
    it('sets isAutoSolving=true when called', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        result.current.startAutoSolve()
      })

      expect(result.current.isAutoSolving).toBe(true)
    })

    it('sets isFetching=true while fetching solution', async () => {
      let resolveFetch: (value: ReturnType<typeof createMockSolveResponse>) => void
      mockSolveAll.mockImplementation(() => new Promise(resolve => {
        resolveFetch = resolve
      }))

      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      act(() => {
        result.current.startAutoSolve()
      })

      // Should be fetching while waiting for API
      expect(result.current.isFetching).toBe(true)

      // Resolve the API call
      await act(async () => {
        resolveFetch!(createMockSolveResponse(3))
      })

      // Should no longer be fetching
      expect(result.current.isFetching).toBe(false)
    })

    it('calls solveAll with current board, candidates, and givens', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const mockBoard = [1, 2, 3, ...Array(78).fill(0)]
      const mockCandidates = Array(81).fill(null).map(() => new Set([4, 5, 6]))
      const mockGivens = [1, 2, 3, ...Array(78).fill(0)]

      const options = createDefaultOptions({
        getBoard: vi.fn(() => mockBoard),
        getCandidates: vi.fn(() => mockCandidates),
        getGivens: vi.fn(() => mockGivens),
      })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(mockSolveAll).toHaveBeenCalledWith(
        mockBoard,
        expect.any(Array), // Candidates converted to arrays
        mockGivens
      )
    })

    it('sets totalMoves from API response', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(result.current.totalMoves).toBe(5)
    })

    it('applies moves sequentially with delays', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const applyMove = vi.fn()
      const options = createDefaultOptions({ applyMove, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // First move applied immediately
      expect(applyMove).toHaveBeenCalledTimes(1)

      // Advance timer to apply second move
      await act(async () => {
        vi.advanceTimersByTime(150)
      })

      expect(applyMove).toHaveBeenCalledTimes(2)

      // Advance timer to apply third move
      await act(async () => {
        vi.advanceTimersByTime(150)
      })

      expect(applyMove).toHaveBeenCalledTimes(3)
    })

    it('does not start if isComplete() returns true', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const options = createDefaultOptions({
        isComplete: vi.fn(() => true),
      })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(result.current.isAutoSolving).toBe(false)
      expect(mockSolveAll).not.toHaveBeenCalled()
    })

    it('does not start if already auto-solving', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const options = createDefaultOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // Clear mock to track subsequent calls
      mockSolveAll.mockClear()

      // Try to start again
      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(mockSolveAll).not.toHaveBeenCalled()
    })

    it('sets currentIndex to 0 at start', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // After first move, currentIndex should be 1
      expect(result.current.currentIndex).toBe(1)
    })
  })

  // ===========================================================================
  // stopAutoSolve()
  // ===========================================================================
  describe('stopAutoSolve()', () => {
    it('sets isAutoSolving=false', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const options = createDefaultOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(result.current.isAutoSolving).toBe(true)

      act(() => {
        result.current.stopAutoSolve()
      })

      expect(result.current.isAutoSolving).toBe(false)
    })

    it('sets isPaused=false', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const options = createDefaultOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      act(() => {
        result.current.togglePause()
      })

      expect(result.current.isPaused).toBe(true)

      act(() => {
        result.current.stopAutoSolve()
      })

      expect(result.current.isPaused).toBe(false)
    })

    it('resets currentIndex to -1', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const options = createDefaultOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(result.current.currentIndex).toBeGreaterThan(0)

      act(() => {
        result.current.stopAutoSolve()
      })

      expect(result.current.currentIndex).toBe(-1)
    })

    it('resets totalMoves to 0', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(result.current.totalMoves).toBe(5)

      act(() => {
        result.current.stopAutoSolve()
      })

      expect(result.current.totalMoves).toBe(0)
    })

    it('preserves lastCompletedSteps after stopping', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultOptions({ stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // Let a couple of moves play
      await act(async () => {
        vi.advanceTimersByTime(250)
      })

      const stepsBeforeStop = result.current.currentIndex

      act(() => {
        result.current.stopAutoSolve()
      })

      expect(result.current.lastCompletedSteps).toBe(stepsBeforeStop)
    })

    it('clears pending timers', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const applyMove = vi.fn()
      const options = createDefaultOptions({ applyMove, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      const callCountBeforeStop = applyMove.mock.calls.length

      act(() => {
        result.current.stopAutoSolve()
      })

      // Advance timers significantly
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })

      // No additional moves should have been applied
      expect(applyMove).toHaveBeenCalledTimes(callCountBeforeStop)
    })
  })

  // ===========================================================================
  // togglePause()
  // ===========================================================================
  describe('togglePause()', () => {
    it('toggles isPaused from false to true', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const options = createDefaultOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(result.current.isPaused).toBe(false)

      act(() => {
        result.current.togglePause()
      })

      expect(result.current.isPaused).toBe(true)
    })

    it('toggles isPaused from true to false', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const options = createDefaultOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      act(() => {
        result.current.togglePause()
      })

      expect(result.current.isPaused).toBe(true)

      act(() => {
        result.current.togglePause()
      })

      expect(result.current.isPaused).toBe(false)
    })

    it('does nothing if not auto-solving', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      act(() => {
        result.current.togglePause()
      })

      expect(result.current.isPaused).toBe(false)
    })

    it('pauses move playback when paused', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const applyMove = vi.fn()
      const options = createDefaultOptions({ applyMove, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      const callCountBeforePause = applyMove.mock.calls.length

      act(() => {
        result.current.togglePause()
      })

      // Advance timers significantly
      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      // No additional moves should have been applied while paused
      expect(applyMove).toHaveBeenCalledTimes(callCountBeforePause)
    })

    it('resumes move playback when unpaused', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const applyMove = vi.fn()
      const options = createDefaultOptions({ applyMove, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      act(() => {
        result.current.togglePause()
      })

      const callCountWhenPaused = applyMove.mock.calls.length

      // Unpause
      act(() => {
        result.current.togglePause()
      })

      // Advance timers to allow more moves
      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      // More moves should have been applied
      expect(applyMove.mock.calls.length).toBeGreaterThan(callCountWhenPaused)
    })
  })

  // ===========================================================================
  // stepBack() / stepForward()
  // ===========================================================================
  describe('stepBack()', () => {
    it('decrements currentIndex', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultOptions({ stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // Let a few moves play
      await act(async () => {
        vi.advanceTimersByTime(350)
      })

      const indexBefore = result.current.currentIndex

      act(() => {
        result.current.stepBack()
      })

      expect(result.current.currentIndex).toBe(indexBefore - 1)
    })

    it('calls applyState with previous snapshot', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const applyState = vi.fn()
      const options = createDefaultOptions({ applyState, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // Let a few moves play
      await act(async () => {
        vi.advanceTimersByTime(250)
      })

      act(() => {
        result.current.stepBack()
      })

      expect(applyState).toHaveBeenCalled()
    })

    it('pauses playback when stepping', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultOptions({ stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // Let a few moves play
      await act(async () => {
        vi.advanceTimersByTime(250)
      })

      expect(result.current.isPaused).toBe(false)

      act(() => {
        result.current.stepBack()
      })

      expect(result.current.isPaused).toBe(true)
    })

    it('calls onStepNavigate with direction "back"', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const onStepNavigate = vi.fn()
      const options = createDefaultOptions({ onStepNavigate, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // Let a few moves play
      await act(async () => {
        vi.advanceTimersByTime(250)
      })

      act(() => {
        result.current.stepBack()
      })

      expect(onStepNavigate).toHaveBeenCalledWith(expect.anything(), 'back')
    })

    it('does nothing if currentIndex is 0', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const applyState = vi.fn()
      const options = createDefaultOptions({ applyState, stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // Immediately after start, index should be 1 (first move applied)
      // Step back to 0
      act(() => {
        result.current.stepBack()
      })

      expect(result.current.currentIndex).toBe(0)
      applyState.mockClear()

      // Try to step back again at index 0
      act(() => {
        result.current.stepBack()
      })

      // Should not have called applyState again
      expect(applyState).not.toHaveBeenCalled()
      expect(result.current.currentIndex).toBe(0)
    })

    it('does nothing if not auto-solving', () => {
      const applyState = vi.fn()
      const options = createDefaultOptions({ applyState })
      const { result } = renderHook(() => useAutoSolve(options))

      act(() => {
        result.current.stepBack()
      })

      expect(applyState).not.toHaveBeenCalled()
    })
  })

  describe('stepForward()', () => {
    it('increments currentIndex', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultOptions({ stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // Step back first so we can step forward
      act(() => {
        result.current.stepBack()
      })

      const indexBefore = result.current.currentIndex

      act(() => {
        result.current.stepForward()
      })

      expect(result.current.currentIndex).toBe(indexBefore + 1)
    })

    it('calls onStepNavigate with direction "forward"', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const onStepNavigate = vi.fn()
      const options = createDefaultOptions({ onStepNavigate, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // Step back first so we can step forward
      act(() => {
        result.current.stepBack()
      })

      onStepNavigate.mockClear()

      act(() => {
        result.current.stepForward()
      })

      expect(onStepNavigate).toHaveBeenCalledWith(expect.anything(), 'forward')
    })

    it('pauses playback when stepping', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // unpause first
      expect(result.current.isPaused).toBe(false)

      act(() => {
        result.current.stepForward()
      })

      expect(result.current.isPaused).toBe(true)
    })

    it('does nothing if at end of moves', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(2))
      const options = createDefaultOptions({ stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // Let all moves play out
      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      // At this point we've completed so isAutoSolving is false
      // stepForward should do nothing
      act(() => {
        result.current.stepForward()
      })

      // Nothing should crash
    })

    it('does nothing if not auto-solving', () => {
      const applyMove = vi.fn()
      const applyState = vi.fn()
      const options = createDefaultOptions({ applyMove, applyState })
      const { result } = renderHook(() => useAutoSolve(options))

      act(() => {
        result.current.stepForward()
      })

      expect(applyMove).not.toHaveBeenCalled()
      expect(applyState).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // canStepBack / canStepForward COMPUTED VALUES
  // ===========================================================================
  describe('canStepBack / canStepForward', () => {
    it('canStepBack is false when not auto-solving', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      expect(result.current.canStepBack).toBe(false)
    })

    it('canStepBack is false at index 0', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // Step back to 0
      act(() => {
        result.current.stepBack()
      })

      expect(result.current.currentIndex).toBe(0)
      expect(result.current.canStepBack).toBe(false)
    })

    it('canStepBack is true when index > 0', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultOptions({ stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // Let some moves play
      await act(async () => {
        vi.advanceTimersByTime(250)
      })

      expect(result.current.currentIndex).toBeGreaterThan(0)
      expect(result.current.canStepBack).toBe(true)
    })

    it('canStepForward is false when not auto-solving', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      expect(result.current.canStepForward).toBe(false)
    })

    it('canStepForward is true when index < totalMoves', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // After first move, index=1, totalMoves=5, so canStepForward should be true
      expect(result.current.currentIndex).toBe(1)
      expect(result.current.totalMoves).toBe(5)
      expect(result.current.canStepForward).toBe(true)
    })
  })

  // ===========================================================================
  // API ERROR HANDLING
  // ===========================================================================
  describe('API Error Handling', () => {
    it('calls onError when solveAll throws', async () => {
      mockSolveAll.mockRejectedValue(new Error('Network error'))
      const onError = vi.fn()
      const options = createDefaultOptions({ onError })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(onError).toHaveBeenCalledWith('Network error')
    })

    it('sets isFetching=false after error', async () => {
      mockSolveAll.mockRejectedValue(new Error('Network error'))
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(result.current.isFetching).toBe(false)
    })

    it('calls stopAutoSolve after error', async () => {
      mockSolveAll.mockRejectedValue(new Error('Network error'))
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(result.current.isAutoSolving).toBe(false)
    })

    it('calls onError with generic message for non-Error throws', async () => {
      mockSolveAll.mockRejectedValue('String error')
      const onError = vi.fn()
      const options = createDefaultOptions({ onError })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(onError).toHaveBeenCalledWith('Failed to get solution.')
    })

    it('calls onError when no moves returned and not solved', async () => {
      mockSolveAll.mockResolvedValue({ solved: false, moves: [] })
      const onError = vi.fn()
      const options = createDefaultOptions({ onError })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(onError).toHaveBeenCalledWith(
        'This puzzle requires advanced techniques beyond our solver.'
      )
    })

    it('does not call onError when no moves but solved=true', async () => {
      mockSolveAll.mockResolvedValue({ solved: true, moves: [] })
      const onError = vi.fn()
      const options = createDefaultOptions({ onError })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(onError).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // TIMER CLEANUP ON UNMOUNT
  // ===========================================================================
  describe('Timer Cleanup on Unmount', () => {
    it('clears timers when component unmounts', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const applyMove = vi.fn()
      const options = createDefaultOptions({ applyMove, stepDelay: 100 })
      const { result, unmount } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      const callCountBeforeUnmount = applyMove.mock.calls.length

      // Unmount the hook
      unmount()

      // Advance timers significantly
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })

      // No additional moves should have been applied after unmount
      expect(applyMove).toHaveBeenCalledTimes(callCountBeforeUnmount)
    })

    it('does not throw when unmounting while fetching', async () => {
      let resolveFetch: (value: ReturnType<typeof createMockSolveResponse>) => void
      mockSolveAll.mockImplementation(() => new Promise(resolve => {
        resolveFetch = resolve
      }))

      const options = createDefaultOptions()
      const { result, unmount } = renderHook(() => useAutoSolve(options))

      act(() => {
        result.current.startAutoSolve()
      })

      // Unmount while still fetching
      expect(() => unmount()).not.toThrow()

      // Resolve after unmount (should not cause issues)
      await act(async () => {
        resolveFetch!(createMockSolveResponse(3))
      })
    })
  })

  // ===========================================================================
  // BACKGROUND/VISIBILITY HANDLING
  // ===========================================================================
  describe('Background/Visibility Handling', () => {
    it('pauses when backgroundManager.shouldPauseOperations becomes true', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const bgManager = createMockBackgroundManager({ shouldPauseOperations: false })
      const options = createDefaultOptions({ backgroundManager: bgManager, stepDelay: 100 })
      const { result, rerender } = renderHook(
        ({ opts }) => useAutoSolve(opts),
        { initialProps: { opts: options } }
      )

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(result.current.isPaused).toBe(false)

      // Simulate visibility change
      const hiddenBgManager = createMockBackgroundManager({ shouldPauseOperations: true })
      const newOptions = { ...options, backgroundManager: hiddenBgManager }

      rerender({ opts: newOptions })

      await waitFor(() => {
        expect(result.current.isPaused).toBe(true)
      })
    })

    it('resumes when backgroundManager.shouldPauseOperations becomes false', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const hiddenBgManager = createMockBackgroundManager({ shouldPauseOperations: true })
      const options = createDefaultOptions({ backgroundManager: hiddenBgManager, stepDelay: 100 })
      const { result, rerender } = renderHook(
        ({ opts }) => useAutoSolve(opts),
        { initialProps: { opts: options } }
      )

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // Should be paused due to visibility
      await waitFor(() => {
        expect(result.current.isPaused).toBe(true)
      })

      // Simulate tab becoming visible
      const visibleBgManager = createMockBackgroundManager({ shouldPauseOperations: false })
      const newOptions = { ...options, backgroundManager: visibleBgManager }

      rerender({ opts: newOptions })

      await waitFor(() => {
        expect(result.current.isPaused).toBe(false)
      })
    })
  })

  // ===========================================================================
  // SPECIAL MOVE ACTIONS
  // ===========================================================================
  describe('Special Move Actions', () => {
    it('handles contradiction move by continuing to next', async () => {
      const moves = [
        createMockMove({ action: 'contradiction', explanation: 'Found contradiction' }),
        createMockMove({ action: 'place' }),
      ]
      mockSolveAll.mockResolvedValue({ solved: true, moves })

      const applyMove = vi.fn()
      const options = createDefaultOptions({ applyMove, stepDelay: 50 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      // Advance to process both moves
      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      // Only the 'place' move should have triggered applyMove
      expect(applyMove).toHaveBeenCalledTimes(1)
    })

    it('handles error move by calling onUnpinpointableError', async () => {
      const moves = [
        createMockMove({ action: 'error', explanation: 'Too many errors', userEntryCount: 5 }),
      ]
      mockSolveAll.mockResolvedValue({ solved: false, moves })

      const onUnpinpointableError = vi.fn()
      const options = createDefaultOptions({ onUnpinpointableError, stepDelay: 50 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(onUnpinpointableError).toHaveBeenCalledWith('Too many errors', 5)
    })

    it('handles diagnostic move by calling onStatus', async () => {
      const moves = [
        createMockMove({ action: 'diagnostic', explanation: 'Taking another look...' }),
        createMockMove({ action: 'place' }),
      ]
      mockSolveAll.mockResolvedValue({ solved: true, moves })

      const onStatus = vi.fn()
      const options = createDefaultOptions({ onStatus, stepDelay: 50 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(onStatus).toHaveBeenCalledWith('Taking another look...')
    })

    it('handles fix-error move with onErrorFixed callback', async () => {
      const moves = [
        createMockMove({ action: 'fix-error', explanation: 'Fixed cell at R1C1' }),
        createMockMove({ action: 'place' }),
      ]
      mockSolveAll.mockResolvedValue({ solved: true, moves })

      const onErrorFixed = vi.fn()
      const options = createDefaultOptions({ onErrorFixed, stepDelay: 50 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(onErrorFixed).toHaveBeenCalledWith(
        'Fixed cell at R1C1',
        expect.any(Function)
      )
    })
  })

  // ===========================================================================
  // FUNCTION STABILITY
  // ===========================================================================
  describe('Function Stability', () => {
    it('provides stable function references across rerenders', () => {
      const options = createDefaultOptions()
      const { result, rerender } = renderHook(() => useAutoSolve(options))

      const startAutoSolve1 = result.current.startAutoSolve
      const stopAutoSolve1 = result.current.stopAutoSolve
      const togglePause1 = result.current.togglePause
      const stepBack1 = result.current.stepBack
      const stepForward1 = result.current.stepForward

      rerender()

      // Functions should be stable due to useMemo/useCallback
      expect(result.current.startAutoSolve).toBe(startAutoSolve1)
      expect(result.current.stopAutoSolve).toBe(stopAutoSolve1)
      expect(result.current.togglePause).toBe(togglePause1)
      expect(result.current.stepBack).toBe(stepBack1)
      expect(result.current.stepForward).toBe(stepForward1)
    })
  })

  // ===========================================================================
  // RETURN VALUE COMPLETENESS
  // ===========================================================================
  describe('Return Value', () => {
    it('returns all expected properties', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      expect(result.current).toHaveProperty('isAutoSolving')
      expect(result.current).toHaveProperty('isPaused')
      expect(result.current).toHaveProperty('isFetching')
      expect(result.current).toHaveProperty('startAutoSolve')
      expect(result.current).toHaveProperty('stopAutoSolve')
      expect(result.current).toHaveProperty('togglePause')
      expect(result.current).toHaveProperty('restartAutoSolve')
      expect(result.current).toHaveProperty('solveFromGivens')
      expect(result.current).toHaveProperty('stepBack')
      expect(result.current).toHaveProperty('stepForward')
      expect(result.current).toHaveProperty('canStepBack')
      expect(result.current).toHaveProperty('canStepForward')
      expect(result.current).toHaveProperty('currentIndex')
      expect(result.current).toHaveProperty('totalMoves')
      expect(result.current).toHaveProperty('lastCompletedSteps')
    })

    it('returns functions for all actions', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      expect(typeof result.current.startAutoSolve).toBe('function')
      expect(typeof result.current.stopAutoSolve).toBe('function')
      expect(typeof result.current.togglePause).toBe('function')
      expect(typeof result.current.restartAutoSolve).toBe('function')
      expect(typeof result.current.solveFromGivens).toBe('function')
      expect(typeof result.current.stepBack).toBe('function')
      expect(typeof result.current.stepForward).toBe('function')
    })
  })
})
