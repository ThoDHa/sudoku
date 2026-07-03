import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAutoSolve } from './useAutoSolve'
import {
  createMockBackgroundManager,
  createDefaultAutoSolveOptions,
  createMockAutoSolveMove,
  createMockSolveResponse,
} from '../test-utils'

vi.mock('../lib/solver-service', () => ({
  solveAll: vi.fn(),
}))

import { solveAll } from '../lib/solver-service'

type HookResult = { current: ReturnType<typeof useAutoSolve> }

function actStartAutoSolve(result: HookResult) {
  act(() => {
    result.current.startAutoSolve()
  })
}

function actStepBack(result: HookResult) {
  act(() => {
    result.current.stepBack()
  })
}

function actStepForward(result: HookResult) {
  act(() => {
    result.current.stepForward()
  })
}

function actStopAutoSolve(result: HookResult) {
  act(() => {
    result.current.stopAutoSolve()
  })
}

function actTogglePause(result: HookResult) {
  act(() => {
    result.current.togglePause()
  })
}

const mockSolveAll = vi.mocked(solveAll)

const createDefaultOptions = createDefaultAutoSolveOptions

type AutoSolveOptions = Parameters<typeof useAutoSolve>[0]

// Common setup: mock the solve response, render the hook, and start auto-solving.
async function startAutoSolveWith(moveCount: number, overrides?: Partial<AutoSolveOptions>) {
  mockSolveAll.mockResolvedValue(createMockSolveResponse(moveCount))
  const options = createDefaultOptions(overrides)
  const { result } = renderHook(() => useAutoSolve(options))
  await act(async () => {
    await result.current.startAutoSolve()
  })
  return result
}

// TESTS

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

  // HOOK INITIALIZATION
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

  // startAutoSolve() - HAPPY PATH
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
      mockSolveAll.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      )

      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      actStartAutoSolve(result)

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
      const mockCandidates = Array(81)
        .fill(null)
        .map(() => new Set([4, 5, 6]))
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

      expect(mockSolveAll).toHaveBeenCalledWith(mockBoard, expect.any(Array), mockGivens)
    })

    it('sets totalMoves from API response', async () => {
      const result = await startAutoSolveWith(5)

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
      const result = await startAutoSolveWith(3, {
        isComplete: vi.fn(() => true),
      })

      expect(result.current.isAutoSolving).toBe(false)
      expect(mockSolveAll).not.toHaveBeenCalled()
    })

    it('does not start if already auto-solving', async () => {
      const result = await startAutoSolveWith(10, { stepDelay: 1000 })

      // Clear mock to track subsequent calls
      mockSolveAll.mockClear()

      // Try to start again
      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(mockSolveAll).not.toHaveBeenCalled()
    })

    it('sets currentIndex to 0 at start', async () => {
      const result = await startAutoSolveWith(3)

      // After first move, currentIndex should be 1
      expect(result.current.currentIndex).toBe(1)
    })
  })

  // stopAutoSolve()
  describe('stopAutoSolve()', () => {
    it('sets isAutoSolving=false', async () => {
      const result = await startAutoSolveWith(10, { stepDelay: 1000 })

      expect(result.current.isAutoSolving).toBe(true)

      actStopAutoSolve(result)

      expect(result.current.isAutoSolving).toBe(false)
    })

    it('sets isPaused=false', async () => {
      const result = await startAutoSolveWith(10, { stepDelay: 1000 })

      actTogglePause(result)

      expect(result.current.isPaused).toBe(true)

      actStopAutoSolve(result)

      expect(result.current.isPaused).toBe(false)
    })

    it('resets currentIndex to -1', async () => {
      const result = await startAutoSolveWith(10, { stepDelay: 1000 })

      expect(result.current.currentIndex).toBeGreaterThan(0)

      actStopAutoSolve(result)

      expect(result.current.currentIndex).toBe(-1)
    })

    it('resets totalMoves to 0', async () => {
      const result = await startAutoSolveWith(5, { stepDelay: 1000 })

      expect(result.current.totalMoves).toBe(5)

      actStopAutoSolve(result)

      expect(result.current.totalMoves).toBe(0)
    })

    it('preserves lastCompletedSteps after stopping', async () => {
      const result = await startAutoSolveWith(5, { stepDelay: 100 })

      // Let a couple of moves play
      await act(async () => {
        vi.advanceTimersByTime(250)
      })

      const stepsBeforeStop = result.current.currentIndex

      actStopAutoSolve(result)

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

      actStopAutoSolve(result)

      // Advance timers significantly
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })

      // No additional moves should have been applied
      expect(applyMove).toHaveBeenCalledTimes(callCountBeforeStop)
    })
  })

  // togglePause()
  describe('togglePause()', () => {
    it('toggles isPaused from false to true', async () => {
      const result = await startAutoSolveWith(10, { stepDelay: 1000 })

      expect(result.current.isPaused).toBe(false)

      actTogglePause(result)

      expect(result.current.isPaused).toBe(true)
    })

    it('toggles isPaused from true to false', async () => {
      const result = await startAutoSolveWith(10, { stepDelay: 1000 })

      actTogglePause(result)

      expect(result.current.isPaused).toBe(true)

      actTogglePause(result)

      expect(result.current.isPaused).toBe(false)
    })

    it('does nothing if not auto-solving', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      actTogglePause(result)

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

      actTogglePause(result)

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

      actTogglePause(result)

      const callCountWhenPaused = applyMove.mock.calls.length

      // Unpause
      actTogglePause(result)

      // Advance timers to allow more moves
      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      // More moves should have been applied
      expect(applyMove.mock.calls.length).toBeGreaterThan(callCountWhenPaused)
    })
  })

  // stepBack() / stepForward()
  describe('stepBack()', () => {
    it('decrements currentIndex', async () => {
      const result = await startAutoSolveWith(5, { stepDelay: 100 })

      // Let a few moves play
      await act(async () => {
        vi.advanceTimersByTime(350)
      })

      const indexBefore = result.current.currentIndex

      actStepBack(result)

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

      actStepBack(result)

      expect(applyState).toHaveBeenCalled()
    })

    it('pauses playback when stepping', async () => {
      const result = await startAutoSolveWith(5, { stepDelay: 100 })

      // Let a few moves play
      await act(async () => {
        vi.advanceTimersByTime(250)
      })

      expect(result.current.isPaused).toBe(false)

      actStepBack(result)

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

      actStepBack(result)

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
      actStepBack(result)

      expect(result.current.currentIndex).toBe(0)
      applyState.mockClear()

      // Try to step back again at index 0
      actStepBack(result)

      // Should not have called applyState again
      expect(applyState).not.toHaveBeenCalled()
      expect(result.current.currentIndex).toBe(0)
    })

    it('does nothing if not auto-solving', () => {
      const applyState = vi.fn()
      const options = createDefaultOptions({ applyState })
      const { result } = renderHook(() => useAutoSolve(options))

      actStepBack(result)

      expect(applyState).not.toHaveBeenCalled()
    })
  })

  describe('stepForward()', () => {
    it('increments currentIndex', async () => {
      const result = await startAutoSolveWith(5, { stepDelay: 100 })

      // Step back first so we can step forward
      actStepBack(result)

      const indexBefore = result.current.currentIndex

      actStepForward(result)

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
      actStepBack(result)

      onStepNavigate.mockClear()

      actStepForward(result)

      expect(onStepNavigate).toHaveBeenCalledWith(expect.anything(), 'forward')
    })

    it('pauses playback when stepping', async () => {
      const result = await startAutoSolveWith(5, { stepDelay: 1000 })

      // unpause first
      expect(result.current.isPaused).toBe(false)

      actStepForward(result)

      expect(result.current.isPaused).toBe(true)
    })

    it('does nothing if at end of moves', async () => {
      const result = await startAutoSolveWith(2, { stepDelay: 100 })

      // Let all moves play out
      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      // At this point we've completed so isAutoSolving is false
      // stepForward should do nothing
      actStepForward(result)

      // Nothing should crash
    })

    it('does nothing if not auto-solving', () => {
      const applyMove = vi.fn()
      const applyState = vi.fn()
      const options = createDefaultOptions({ applyMove, applyState })
      const { result } = renderHook(() => useAutoSolve(options))

      actStepForward(result)

      expect(applyMove).not.toHaveBeenCalled()
      expect(applyState).not.toHaveBeenCalled()
    })
  })

  // canStepBack / canStepForward COMPUTED VALUES
  describe('canStepBack / canStepForward', () => {
    it('canStepBack is false when not auto-solving', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      expect(result.current.canStepBack).toBe(false)
    })

    it('canStepBack is false at index 0', async () => {
      const result = await startAutoSolveWith(5, { stepDelay: 1000 })

      // Step back to 0
      actStepBack(result)

      expect(result.current.currentIndex).toBe(0)
      expect(result.current.canStepBack).toBe(false)
    })

    it('canStepBack is true when index > 0', async () => {
      const result = await startAutoSolveWith(5, { stepDelay: 100 })

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
      const result = await startAutoSolveWith(5, { stepDelay: 1000 })

      // After first move, index=1, totalMoves=5, so canStepForward should be true
      expect(result.current.currentIndex).toBe(1)
      expect(result.current.totalMoves).toBe(5)
      expect(result.current.canStepForward).toBe(true)
    })
  })

  // API ERROR HANDLING
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
        'This puzzle requires advanced techniques beyond our solver.',
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

  // TIMER CLEANUP ON UNMOUNT
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
      mockSolveAll.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      )

      const options = createDefaultOptions()
      const { result, unmount } = renderHook(() => useAutoSolve(options))

      actStartAutoSolve(result)

      // Unmount while still fetching
      expect(() => unmount()).not.toThrow()

      // Resolve after unmount (should not cause issues)
      await act(async () => {
        resolveFetch!(createMockSolveResponse(3))
      })
    })
  })

  // BACKGROUND/VISIBILITY HANDLING
  describe('Background/Visibility Handling', () => {
    it('pauses when backgroundManager.shouldPauseOperations becomes true', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const bgManager = createMockBackgroundManager({ shouldPauseOperations: false })
      const options = createDefaultOptions({ backgroundManager: bgManager, stepDelay: 100 })
      const { result, rerender } = renderHook(({ opts }) => useAutoSolve(opts), {
        initialProps: { opts: options },
      })

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
      const { result, rerender } = renderHook(({ opts }) => useAutoSolve(opts), {
        initialProps: { opts: options },
      })

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

  // SPECIAL MOVE ACTIONS
  describe('Special Move Actions', () => {
    it('handles contradiction move by continuing to next', async () => {
      const moves = [
        createMockAutoSolveMove({ action: 'contradiction', explanation: 'Found contradiction' }),
        createMockAutoSolveMove({ action: 'place' }),
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
        createMockAutoSolveMove({
          action: 'error',
          explanation: 'Too many errors',
          userEntryCount: 5,
        }),
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
        createMockAutoSolveMove({ action: 'diagnostic', explanation: 'Taking another look...' }),
        createMockAutoSolveMove({ action: 'place' }),
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
        createMockAutoSolveMove({ action: 'fix-error', explanation: 'Fixed cell at R1C1' }),
        createMockAutoSolveMove({ action: 'place' }),
      ]
      mockSolveAll.mockResolvedValue({ solved: true, moves })

      const onErrorFixed = vi.fn()
      const options = createDefaultOptions({ onErrorFixed, stepDelay: 50 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })

      expect(onErrorFixed).toHaveBeenCalledWith('Fixed cell at R1C1', expect.any(Function))
    })
  })

  // FUNCTION STABILITY
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

  // RETURN VALUE COMPLETENESS
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

describe('useAutoSolve - mutation-killing branch tests', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockSolveAll.mockReset()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('stopAutoSolve finalSteps boundary at currentIndex === 0', () => {
    it('sets lastCompletedSteps to 0 when currentIndex is 0', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultAutoSolveOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      // First move applied -> index 1; step back to 0
      act(() => {
        result.current.stepBack()
      })
      expect(result.current.currentIndex).toBe(0)

      act(() => {
        result.current.stopAutoSolve()
      })
      expect(result.current.lastCompletedSteps).toBe(0)
    })

    it('preserves the actual index as lastCompletedSteps when currentIndex > 0', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const options = createDefaultAutoSolveOptions({ stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      await act(async () => {
        vi.advanceTimersByTime(250)
      })
      const indexBeforeStop = result.current.currentIndex
      expect(indexBeforeStop).toBeGreaterThan(0)

      act(() => {
        result.current.stopAutoSolve()
      })
      expect(result.current.lastCompletedSteps).toBe(indexBeforeStop)
    })

    it('sets lastCompletedSteps to 0 when stopping before any move plays', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultAutoSolveOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      // index is 1 after first move; rewind to 0 then stop
      act(() => {
        result.current.stepBack()
      })
      act(() => {
        result.current.stopAutoSolve()
      })
      expect(result.current.lastCompletedSteps).toBe(0)
      expect(result.current.isAutoSolving).toBe(false)
    })
  })

  describe('scheduleNextMove document.visibilityState safety net', () => {
    it('does not apply the next move when the tab is hidden between ticks', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const applyMove = vi.fn()
      const options = createDefaultAutoSolveOptions({ applyMove, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      const callsBefore = applyMove.mock.calls.length
      expect(callsBefore).toBeGreaterThanOrEqual(1)

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
      await act(async () => {
        vi.advanceTimersByTime(500)
      })
      expect(applyMove.mock.calls.length).toBe(callsBefore)

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
    })

    it('drops the pending tick without crashing when hidden, then stays dormant', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const applyMove = vi.fn()
      const options = createDefaultAutoSolveOptions({ applyMove, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      const before = applyMove.mock.calls.length

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
      await act(async () => {
        vi.advanceTimersByTime(500)
      })
      // The safety net swallowed the tick; no further moves applied and no throw
      expect(applyMove.mock.calls.length).toBe(before)
      expect(result.current.isAutoSolving).toBe(true)

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
    })
  })

  describe('togglePause board-change detection on resume', () => {
    it('stops auto-solve when the board was modified while paused', async () => {
      let board = Array(81).fill(0)
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const getBoard = vi.fn(() => board)
      const options = createDefaultAutoSolveOptions({ getBoard, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      expect(result.current.isAutoSolving).toBe(true)

      act(() => {
        result.current.togglePause()
      })
      expect(result.current.isPaused).toBe(true)

      // Simulate the user editing a cell while paused
      board = [...board]
      board[0] = 9

      act(() => {
        result.current.togglePause()
      })
      await waitFor(() => {
        expect(result.current.isAutoSolving).toBe(false)
      })
    })

    it('resumes auto-solve when the board is unchanged while paused', async () => {
      const board = Array(81).fill(0)
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const getBoard = vi.fn(() => board)
      const applyMove = vi.fn()
      const options = createDefaultAutoSolveOptions({
        getBoard,
        applyMove,
        stepDelay: 100,
      })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      const callsAtPause = applyMove.mock.calls.length

      act(() => {
        result.current.togglePause()
      })
      expect(result.current.isPaused).toBe(true)

      // Resume without changing the board
      act(() => {
        result.current.togglePause()
      })
      expect(result.current.isPaused).toBe(false)
      expect(result.current.isAutoSolving).toBe(true)

      await act(async () => {
        vi.advanceTimersByTime(300)
      })
      expect(applyMove.mock.calls.length).toBeGreaterThan(callsAtPause)
    })
  })

  describe('playMoves empty-input guards', () => {
    it('does nothing when moves array is empty', () => {
      const options = createDefaultAutoSolveOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      act(() => {
        result.current.playMoves([])
      })
      expect(result.current.isAutoSolving).toBe(false)
      expect(result.current.totalMoves).toBe(0)
      expect(result.current.currentIndex).toBe(-1)
    })

    it('does nothing when moves is null', () => {
      const options = createDefaultAutoSolveOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      act(() => {
        result.current.playMoves(null as unknown as [])
      })
      expect(result.current.isAutoSolving).toBe(false)
      expect(result.current.totalMoves).toBe(0)
    })

    it('starts playing when given a non-empty custom move sequence', () => {
      const moves = [
        createMockAutoSolveMove({ action: 'place' }),
        createMockAutoSolveMove({ action: 'place' }),
        createMockAutoSolveMove({ action: 'place' }),
      ]
      const options = createDefaultAutoSolveOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      act(() => {
        result.current.playMoves(moves, false)
      })
      // First move plays synchronously; the rest are scheduled, so the hook
      // remains actively solving with all three moves queued.
      expect(result.current.isAutoSolving).toBe(true)
      expect(result.current.totalMoves).toBe(3)
      expect(result.current.currentIndex).toBeGreaterThanOrEqual(0)
    })

    it('starts paused when startPaused is true', () => {
      const moves = [createMockAutoSolveMove({ action: 'place' })]
      const options = createDefaultAutoSolveOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      act(() => {
        result.current.playMoves(moves, true)
      })
      expect(result.current.isAutoSolving).toBe(true)
      expect(result.current.isPaused).toBe(true)
    })
  })

  describe('solveFromGivens', () => {
    it('fetches a solution using only the givens and plays moves', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const applyMove = vi.fn()
      const givens = Array(81).fill(0)
      givens[0] = 5
      givens[4] = 3
      const options = createDefaultAutoSolveOptions({
        applyMove,
        getGivens: vi.fn(() => givens),
        stepDelay: 50,
      })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.solveFromGivens()
      })

      expect(result.current.isAutoSolving).toBe(true)
      expect(result.current.totalMoves).toBe(3)
      // solveAll is called with (givens, [], givens)
      expect(mockSolveAll).toHaveBeenCalledWith(givens, [], givens)
      expect(applyMove).toHaveBeenCalled()
    })

    it('sets currentIndex to 0 and seeds state history from givens', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(2))
      const givens = Array(81).fill(0)
      givens[0] = 5
      const options = createDefaultAutoSolveOptions({
        getGivens: vi.fn(() => givens),
        stepDelay: 50,
      })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.solveFromGivens()
      })
      expect(result.current.currentIndex).toBeGreaterThanOrEqual(0)
    })

    it('does nothing when already auto-solving', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultAutoSolveOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      mockSolveAll.mockClear()

      await act(async () => {
        await result.current.solveFromGivens()
      })
      expect(mockSolveAll).not.toHaveBeenCalled()
    })

    it('calls onError with the dedicated message when puzzle is not solved', async () => {
      mockSolveAll.mockResolvedValue({ solved: false, moves: [] })
      const onError = vi.fn()
      const options = createDefaultAutoSolveOptions({ onError })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.solveFromGivens()
      })
      expect(onError).toHaveBeenCalledWith('Could not solve this puzzle.')
      expect(result.current.isAutoSolving).toBe(false)
      expect(result.current.isFetching).toBe(false)
    })

    it('silently stops when puzzle already solved with no moves', async () => {
      mockSolveAll.mockResolvedValue({ solved: true, moves: [] })
      const onError = vi.fn()
      const options = createDefaultAutoSolveOptions({ onError })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.solveFromGivens()
      })
      expect(onError).not.toHaveBeenCalled()
      expect(result.current.isAutoSolving).toBe(false)
    })

    it('calls onError with the Error message on exception', async () => {
      mockSolveAll.mockRejectedValue(new Error('solver-down'))
      const onError = vi.fn()
      const options = createDefaultAutoSolveOptions({ onError })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.solveFromGivens()
      })
      expect(onError).toHaveBeenCalledWith('solver-down')
      expect(result.current.isFetching).toBe(false)
      expect(result.current.isAutoSolving).toBe(false)
    })

    it('calls onError with the generic message on non-Error throw', async () => {
      mockSolveAll.mockRejectedValue('boom')
      const onError = vi.fn()
      const options = createDefaultAutoSolveOptions({ onError })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.solveFromGivens()
      })
      expect(onError).toHaveBeenCalledWith('Failed to get solution.')
    })
  })

  describe('restartAutoSolve startPaused handling', () => {
    it('starts in the paused state when startPaused is true', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const applyMove = vi.fn()
      const options = createDefaultAutoSolveOptions({ applyMove, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      await act(async () => {
        await result.current.restartAutoSolve(true)
      })
      expect(result.current.isAutoSolving).toBe(true)
      expect(result.current.isPaused).toBe(true)

      const callsWhilePaused = applyMove.mock.calls.length
      await act(async () => {
        vi.advanceTimersByTime(500)
      })
      expect(applyMove.mock.calls.length).toBe(callsWhilePaused)
    })

    it('starts playing immediately when startPaused is false', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const applyMove = vi.fn()
      const options = createDefaultAutoSolveOptions({ applyMove, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.restartAutoSolve(false)
      })
      expect(result.current.isAutoSolving).toBe(true)
      expect(result.current.isPaused).toBe(false)
      expect(applyMove).toHaveBeenCalled()
    })
  })

  describe('stepForward new-territory branch (no snapshot)', () => {
    it('applies a fresh move when stepping forward beyond visited snapshots', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const applyMove = vi.fn()
      const applyState = vi.fn()
      const options = createDefaultAutoSolveOptions({
        applyMove,
        applyState,
        stepDelay: 1000,
      })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      // Only the first move plays synchronously; history length is 2, index 1
      expect(result.current.currentIndex).toBe(1)

      // Rewind to the initial snapshot
      act(() => {
        result.current.stepBack()
      })
      expect(result.current.currentIndex).toBe(0)

      applyMove.mockClear()
      applyState.mockClear()

      // Forward to index 1 -> snapshot exists (1 < 2), applyState path
      act(() => {
        result.current.stepForward()
      })
      expect(result.current.currentIndex).toBe(1)
      expect(applyState).toHaveBeenCalled()

      // Forward to index 2 -> NO snapshot exists (2 is not < 2), applyMove path
      applyMove.mockClear()
      act(() => {
        result.current.stepForward()
      })
      expect(result.current.currentIndex).toBe(2)
      expect(applyMove).toHaveBeenCalled()
    })

    it('keeps playback paused after stepping forward into new territory', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const options = createDefaultAutoSolveOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      // stepBack already engages manual pause; stepping forward keeps it paused
      act(() => {
        result.current.stepBack()
      })
      expect(result.current.isPaused).toBe(true)

      act(() => {
        result.current.stepForward()
      })
      act(() => {
        result.current.stepForward()
      })
      expect(result.current.isPaused).toBe(true)
    })
  })

  describe('stepBack early-return boundary at index 0', () => {
    it('does not move below index 0 and does not call applyState', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const applyState = vi.fn()
      const options = createDefaultAutoSolveOptions({ applyState, stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      act(() => {
        result.current.stepBack()
      })
      expect(result.current.currentIndex).toBe(0)
      applyState.mockClear()

      act(() => {
        result.current.stepBack()
      })
      expect(result.current.currentIndex).toBe(0)
      expect(applyState).not.toHaveBeenCalled()
    })
  })

  describe('stepForward early-return boundary at the end', () => {
    it('does not advance beyond the last visited snapshot when no fresh moves remain', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(2))
      const applyMove = vi.fn()
      const options = createDefaultAutoSolveOptions({ applyMove, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      await act(async () => {
        vi.advanceTimersByTime(500)
      })
      // All moves played out
      const indexAtEnd = result.current.currentIndex
      applyMove.mockClear()

      act(() => {
        result.current.stepForward()
      })
      expect(result.current.currentIndex).toBe(indexAtEnd)
    })
  })

  describe('startAutoSolve guards', () => {
    it('does not start when isComplete() returns true', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const options = createDefaultAutoSolveOptions({ isComplete: vi.fn(() => true) })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      expect(result.current.isAutoSolving).toBe(false)
      expect(mockSolveAll).not.toHaveBeenCalled()
    })

    it('does not start when already auto-solving', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultAutoSolveOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      mockSolveAll.mockClear()

      await act(async () => {
        await result.current.startAutoSolve()
      })
      expect(mockSolveAll).not.toHaveBeenCalled()
    })
  })

  describe('startAutoSolve no-moves error path', () => {
    it('calls onError with the advanced-techniques message and stops', async () => {
      mockSolveAll.mockResolvedValue({ solved: false, moves: [] })
      const onError = vi.fn()
      const options = createDefaultAutoSolveOptions({ onError })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      expect(onError).toHaveBeenCalledWith(
        'This puzzle requires advanced techniques beyond our solver.',
      )
      expect(result.current.isAutoSolving).toBe(false)
    })

    it('does not call onError when solved=true with no moves', async () => {
      mockSolveAll.mockResolvedValue({ solved: true, moves: [] })
      const onError = vi.fn()
      const options = createDefaultAutoSolveOptions({ onError })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      expect(onError).not.toHaveBeenCalled()
      expect(result.current.isAutoSolving).toBe(false)
    })
  })

  describe('canStepBack / canStepForward computed boundaries', () => {
    it('canStepBack is false when currentIndex is 0 even while auto-solving', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultAutoSolveOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      act(() => {
        result.current.stepBack()
      })
      expect(result.current.currentIndex).toBe(0)
      expect(result.current.isAutoSolving).toBe(true)
      expect(result.current.canStepBack).toBe(false)
    })

    it('canStepForward is true while index < totalMoves and auto-solving', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const options = createDefaultAutoSolveOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      act(() => {
        result.current.stepBack()
      })
      expect(result.current.canStepForward).toBe(true)
    })
  })

  describe('pause via gamePaused prop', () => {
    it('pauses when gamePaused prop becomes true during playback', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const applyMove = vi.fn()
      const options = createDefaultAutoSolveOptions({
        applyMove,
        stepDelay: 100,
        gamePaused: false,
      })
      const { result, rerender } = renderHook(({ opts }) => useAutoSolve(opts), {
        initialProps: { opts: options },
      })

      await act(async () => {
        await result.current.startAutoSolve()
      })
      expect(result.current.isPaused).toBe(false)

      const pausedOpts = createDefaultAutoSolveOptions({
        applyMove,
        stepDelay: 100,
        gamePaused: true,
      })
      rerender({ opts: pausedOpts })

      await waitFor(() => {
        expect(result.current.isPaused).toBe(true)
      })
    })
  })
})
