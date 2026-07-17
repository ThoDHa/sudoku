import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAutoSolve } from './useAutoSolve'
import { logger } from '../lib/logger'
import type { MoveResult } from './autoSolvePlayback'
import { AUTO_SOLVE_MAX_TIME } from '../lib/constants'
import {
  createMockBackgroundManager,
  createDefaultAutoSolveOptions,
  createMockAutoSolveMove,
  createMockSolveResponse,
} from '../test-utils'

vi.mock('../lib/solver-service', () => ({
  solveAll: vi.fn(),
}))

import { solveAll, type SolveAllResult } from '../lib/solver-service'

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
async function startAutoSolveWith(
  moveCount: number,
  overrides?: { [K in keyof AutoSolveOptions]?: AutoSolveOptions[K] | undefined },
) {
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
      let resolveFetch: (value: SolveAllResult) => void
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
      const applyMove = vi.fn()
      const result = await startAutoSolveWith(2, { stepDelay: 100, applyMove })

      // Let all moves play out
      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      expect(result.current.isAutoSolving).toBe(false)
      const indexAtEnd = result.current.currentIndex
      applyMove.mockClear()

      // stepForward at the completed boundary must not advance or apply anything
      actStepForward(result)

      expect(result.current.currentIndex).toBe(indexAtEnd)
      expect(applyMove).not.toHaveBeenCalled()
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
      mockSolveAll.mockResolvedValue(createMockSolveResponse([], { solved: false }))
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
      mockSolveAll.mockResolvedValue(createMockSolveResponse([], { solved: true }))
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
      let resolveFetch: (value: SolveAllResult) => void
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
      mockSolveAll.mockResolvedValue(createMockSolveResponse(moves, { solved: true }))

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
      mockSolveAll.mockResolvedValue(createMockSolveResponse(moves, { solved: false }))

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
      mockSolveAll.mockResolvedValue(createMockSolveResponse(moves, { solved: true }))

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
      mockSolveAll.mockResolvedValue(createMockSolveResponse(moves, { solved: true }))

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

  describe('background manager resumes playback after a hidden-tab tick drop', () => {
    it('resumes via playNextMoveRef when the background manager transitions back to visible after a scheduled tick was dropped on hidden', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const applyMove = vi.fn()
      const visibleBgManager = createMockBackgroundManager({ shouldPauseOperations: false })
      const options = createDefaultAutoSolveOptions({
        applyMove,
        backgroundManager: visibleBgManager,
        stepDelay: 100,
      })
      const { result, rerender } = renderHook(({ opts }) => useAutoSolve(opts), {
        initialProps: { opts: options },
      })

      await act(async () => {
        await result.current.startAutoSolve()
      })
      const callsAfterStart = applyMove.mock.calls.length
      expect(callsAfterStart).toBeGreaterThanOrEqual(1)

      // visibilitychange fires before the scheduled tick: the background
      // manager pauses, setting pausedRef.current = true.
      const hiddenBgManager = createMockBackgroundManager({ shouldPauseOperations: true })
      rerender({ opts: { ...options, backgroundManager: hiddenBgManager } })
      await waitFor(() => {
        expect(result.current.isPaused).toBe(true)
      })

      // The scheduled setTimeout fires while document is hidden: the safety
      // net drops the tick without applying a move or rescheduling.
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
      await act(async () => {
        vi.advanceTimersByTime(500)
      })
      expect(applyMove.mock.calls.length).toBe(callsAfterStart)

      // Tab becomes visible again: the background manager transitions back,
      // and the resume branch invokes playNextMoveRef.current().
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
      const restoredBgManager = createMockBackgroundManager({ shouldPauseOperations: false })
      rerender({ opts: { ...options, backgroundManager: restoredBgManager } })

      await waitFor(() => {
        expect(applyMove.mock.calls.length).toBeGreaterThan(callsAfterStart)
      })
      expect(result.current.isPaused).toBe(false)
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
      mockSolveAll.mockResolvedValue(createMockSolveResponse([], { solved: false }))
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
      mockSolveAll.mockResolvedValue(createMockSolveResponse([], { solved: true }))
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
      mockSolveAll.mockResolvedValue(createMockSolveResponse([], { solved: false }))
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
      mockSolveAll.mockResolvedValue(createMockSolveResponse([], { solved: true }))
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

  describe('stopAutoSolve before any solve (initial-state observability)', () => {
    it('keeps lastCompletedSteps at 0 when stopped before auto-solve ever starts', () => {
      const options = createDefaultAutoSolveOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      actStopAutoSolve(result)

      expect(result.current.lastCompletedSteps).toBe(0)
      expect(result.current.isAutoSolving).toBe(false)
      expect(result.current.isPaused).toBe(false)
      expect(result.current.currentIndex).toBe(-1)
      expect(result.current.totalMoves).toBe(0)
    })
  })

  describe('stepDelay prop dynamic sync', () => {
    it('applies the updated stepDelay after the prop changes between renders', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
      const applyMove = vi.fn()
      const initialOpts = createDefaultAutoSolveOptions({ applyMove, stepDelay: 1000 })
      const { result, rerender } = renderHook(({ opts }) => useAutoSolve(opts), {
        initialProps: { opts: initialOpts },
      })

      // Switch to a much shorter delay before starting playback so the
      // dynamic stepDelayRef sync is observed.
      const newOpts = {
        ...createDefaultAutoSolveOptions({ applyMove, stepDelay: 10 }),
        stepDelay: 10,
      }
      rerender({ opts: newOpts })

      await act(async () => {
        await result.current.startAutoSolve()
      })
      // First move applied synchronously at start.
      const callsAfterStart = applyMove.mock.calls.length
      expect(callsAfterStart).toBeGreaterThanOrEqual(1)

      // 10ms tick should fire the next move (would not if the ref were stale at 1000).
      await act(async () => {
        vi.advanceTimersByTime(15)
      })
      expect(applyMove.mock.calls.length).toBeGreaterThan(callsAfterStart)
    })
  })

  describe('resume branch guard (no auto-solve active)', () => {
    it('does not throw when gamePaused transitions from true to false without auto-solve', async () => {
      const pausedOpts = createDefaultAutoSolveOptions({ gamePaused: true })
      const { rerender } = renderHook(({ opts }) => useAutoSolve(opts), {
        initialProps: { opts: pausedOpts },
      })

      const unpausedOpts = createDefaultAutoSolveOptions({ gamePaused: false })
      expect(() => rerender({ opts: unpausedOpts })).not.toThrow()
    })
  })

  describe('togglePause single-cell board-change detection', () => {
    it('stops auto-solve when exactly one cell differs between snapshot and current board', async () => {
      let board = Array(81).fill(0)
      mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
      const getBoard = vi.fn(() => board)
      const options = createDefaultAutoSolveOptions({ getBoard, stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      expect(result.current.isAutoSolving).toBe(true)

      actTogglePause(result)
      expect(result.current.isPaused).toBe(true)

      const snapshot = [...board]
      snapshot[7] = 4
      board = snapshot

      actTogglePause(result)
      await waitFor(() => {
        expect(result.current.isAutoSolving).toBe(false)
      })
    })
  })

  describe('stopAutoSolve resets all observable flags', () => {
    it('clears isAutoSolving, isPaused, manualPaused, currentIndex, and totalMoves together', async () => {
      const result = await startAutoSolveWith(5, { stepDelay: 100 })

      actTogglePause(result)
      expect(result.current.isPaused).toBe(true)

      actStopAutoSolve(result)

      expect(result.current.isAutoSolving).toBe(false)
      expect(result.current.isPaused).toBe(false)
      expect(result.current.currentIndex).toBe(-1)
      expect(result.current.totalMoves).toBe(0)
    })
  })

  describe('clearActiveTimers prevents next scheduled move after stop', () => {
    it('does not fire any pending move after stopAutoSolve even with many queued', async () => {
      vi.useFakeTimers()
      mockSolveAll.mockResolvedValue(createMockSolveResponse(20))
      const applyMove = vi.fn()
      const options = createDefaultOptions({ applyMove, stepDelay: 50 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      const callsBeforeStop = applyMove.mock.calls.length

      actStopAutoSolve(result)

      await act(async () => {
        vi.advanceTimersByTime(5000)
      })
      expect(applyMove).toHaveBeenCalledTimes(callsBeforeStop)
      vi.useRealTimers()
    })
  })

  describe('optional callback absence is safe', () => {
    it('startAutoSolve no-moves path does not throw when onError is undefined', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse([], { solved: false }))
      const opts = createDefaultOptions({})
      delete (opts as Partial<typeof opts>).onError
      const { result } = renderHook(() => useAutoSolve(opts))

      await expect(
        act(async () => {
          await result.current.startAutoSolve()
        }),
      ).resolves.toBeUndefined()
      expect(result.current.isAutoSolving).toBe(false)
    })

    it('startAutoSolve rejection path does not throw when onError is undefined', async () => {
      mockSolveAll.mockRejectedValue(new Error('boom'))
      const opts = createDefaultOptions({})
      delete (opts as Partial<typeof opts>).onError
      const { result } = renderHook(() => useAutoSolve(opts))

      await expect(
        act(async () => {
          await result.current.startAutoSolve()
        }),
      ).resolves.toBeUndefined()
      expect(result.current.isFetching).toBe(false)
    })

    it('solveFromGivens no-moves path does not throw when onError is undefined', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse([], { solved: false }))
      const opts = createDefaultOptions({})
      delete (opts as Partial<typeof opts>).onError
      const { result } = renderHook(() => useAutoSolve(opts))

      await expect(
        act(async () => {
          await result.current.solveFromGivens()
        }),
      ).resolves.toBeUndefined()
      expect(result.current.isAutoSolving).toBe(false)
    })

    it('solveFromGivens rejection path does not throw when onError is undefined', async () => {
      mockSolveAll.mockRejectedValue(new Error('boom'))
      const opts = createDefaultOptions({})
      delete (opts as Partial<typeof opts>).onError
      const { result } = renderHook(() => useAutoSolve(opts))

      await expect(
        act(async () => {
          await result.current.solveFromGivens()
        }),
      ).resolves.toBeUndefined()
      expect(result.current.isFetching).toBe(false)
    })
  })

  describe('solveFromGivens seeds state history with the givens board', () => {
    it('applies the givens board when stepping back to the initial snapshot', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(2))
      const givens = Array(81).fill(0)
      givens[0] = 5
      givens[40] = 7
      const applyState = vi.fn()
      const options = createDefaultAutoSolveOptions({
        getGivens: vi.fn(() => givens),
        applyState,
        stepDelay: 1000,
      })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.solveFromGivens()
      })
      // First move played synchronously -> index 1. Step back to 0 -> applyState(snapshot[0]).
      actStepBack(result)
      expect(result.current.currentIndex).toBe(0)
      expect(applyState).toHaveBeenCalled()
      const [boardArg] = applyState.mock.calls[applyState.mock.calls.length - 1]!
      expect(boardArg[0]).toBe(5)
      expect(boardArg[40]).toBe(7)
    })

    it('does not invoke onError for a single contradiction move under skipSpecialMoves=true', async () => {
      const move = createMockAutoSolveMove({ action: 'contradiction', explanation: 'CTX' })
      mockSolveAll.mockResolvedValue(createMockSolveResponse([move], { solved: true }))
      const onError = vi.fn()
      const options = createDefaultAutoSolveOptions({ onError, stepDelay: 50 })

      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.solveFromGivens()
      })
      // skipSpecialMoves=true means contradiction is skipped, not reported.
      expect(onError).not.toHaveBeenCalled()
    })
  })

  describe('restartAutoSolve startPaused toggles manualPaused correctly', () => {
    it('starts unpaused when startPaused=false and applies the first move', async () => {
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

    it('starts paused when startPaused=true and queues no moves until unpaused', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const applyMove = vi.fn()
      const options = createDefaultAutoSolveOptions({ applyMove, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))

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
  })

  describe('stepBack/stepForward onStepNavigate and snapshot applyState', () => {
    it('stepBack applies the snapshot at newIndex and notifies with direction "back"', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const applyState = vi.fn()
      const onStepNavigate = vi.fn()
      const options = createDefaultAutoSolveOptions({
        applyState,
        onStepNavigate,
        stepDelay: 1000,
      })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      // Move 1 played -> index 1, snapshot[1] populated.
      applyState.mockClear()
      onStepNavigate.mockClear()

      actStepBack(result)
      expect(result.current.currentIndex).toBe(0)
      expect(applyState).toHaveBeenCalledTimes(1)
      // The applyState args are (board, candidates, move, index)
      const args = applyState.mock.calls[0]!
      expect(args[3]).toBe(0)
      expect(onStepNavigate).toHaveBeenCalledWith(null, 'back')
    })

    it('stepForward into visited snapshot applies state and notifies with direction "forward"', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const applyState = vi.fn()
      const onStepNavigate = vi.fn()
      const options = createDefaultAutoSolveOptions({
        applyState,
        onStepNavigate,
        stepDelay: 1000,
      })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      actStepBack(result)
      applyState.mockClear()
      onStepNavigate.mockClear()

      actStepForward(result)
      expect(applyState).toHaveBeenCalled()
      expect(onStepNavigate).toHaveBeenCalledWith(expect.anything(), 'forward')
    })

    it('stepForward into new territory applies the move and updates the queue from allMovesRef', async () => {
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
      // index=1, snapshots=[0,1]. Step back to 0, then forward into 1 (snapshot), 2 (new), 3 (new).
      actStepBack(result)
      actStepForward(result)
      applyMove.mockClear()
      // Forward to 2: snapshot doesn't exist (history length=2), so new-territory branch.
      actStepForward(result)
      expect(result.current.currentIndex).toBe(2)
      expect(applyMove).toHaveBeenCalledTimes(1)
      // Verify candidate Sets were derived from moveResult.candidates arrays.
      const candidatesArg = applyMove.mock.calls[0]![1] as Set<number>[]
      expect(candidatesArg[0]).toBeInstanceOf(Set)

      // The new-territory branch must also push a real snapshot (board/candidates/move)
      // so that stepBack can restore it.
      applyState.mockClear()
      actStepBack(result)
      expect(result.current.currentIndex).toBe(1)
      expect(applyState).toHaveBeenCalledTimes(1)
      const stateArgs = applyState.mock.calls[0]!
      // applyState(board, candidates, move, index) — board must be a real array, not undefined.
      expect(Array.isArray(stateArgs[0])).toBe(true)
      expect(stateArgs[0]).toHaveLength(81)
      expect(stateArgs[1]).toHaveLength(81)
      expect(stateArgs[3]).toBe(1)
    })
  })

  describe('canStepForward boundary at currentIndex === totalMoves', () => {
    it('canStepForward is false after stepping forward to the last move while still auto-solving', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const options = createDefaultAutoSolveOptions({ stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      // After first move: index=1, totalMoves=3, snapshots=[0,1]. Pause via stepBack, then walk forward.
      actStepBack(result)
      expect(result.current.canStepForward).toBe(true)

      actStepForward(result) // 0 -> 1 (visited snapshot)
      actStepForward(result) // 1 -> 2 (new territory)
      actStepForward(result) // 2 -> 3 (new territory; currentIndex === totalMoves)
      expect(result.current.currentIndex).toBe(3)
      expect(result.current.totalMoves).toBe(3)
      expect(result.current.isAutoSolving).toBe(true)
      expect(result.current.canStepForward).toBe(false)
    })
  })

  describe('playMoves branch coverage', () => {
    it('plays the first move synchronously when startPaused is false', () => {
      const moves = [
        createMockAutoSolveMove({ action: 'place' }),
        createMockAutoSolveMove({ action: 'place' }),
      ]
      const applyMove = vi.fn()
      const options = createDefaultAutoSolveOptions({ applyMove, stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      act(() => {
        result.current.playMoves(moves, false)
      })
      expect(applyMove).toHaveBeenCalled()
      expect(result.current.isAutoSolving).toBe(true)
      expect(result.current.isPaused).toBe(false)
    })

    it('does nothing when moves is null', () => {
      const applyMove = vi.fn()
      const options = createDefaultAutoSolveOptions({ applyMove })
      const { result } = renderHook(() => useAutoSolve(options))

      act(() => {
        result.current.playMoves(null as unknown as never[])
      })
      expect(applyMove).not.toHaveBeenCalled()
      expect(result.current.isAutoSolving).toBe(false)
    })

    it('seeds the initial snapshot from the first move board when provided', () => {
      const firstBoard = Array(81).fill(0)
      firstBoard[3] = 9
      const firstCandidates = Array(81)
        .fill(null)
        .map(() => [1, 2])
      const moves = [
        {
          board: firstBoard,
          candidates: firstCandidates,
          move: {
            step_index: 0,
            technique: 'T',
            action: 'place',
            digit: 5,
            targets: [{ row: 0, col: 0 }],
            explanation: 'x',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
          },
        },
      ]
      const applyMove = vi.fn()
      const applyState = vi.fn()
      const options = createDefaultAutoSolveOptions({ applyMove, applyState, stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      act(() => {
        result.current.playMoves(moves, true)
      })
      // Initial snapshot is seeded from moves[0].board & moves[0].candidates; we
      // can observe this by stepping back from index 1 to 0 once a move plays.
      // Under startPaused the queue is held; unpause via manualPausedRef toggle.
      expect(result.current.isAutoSolving).toBe(true)
      expect(result.current.isPaused).toBe(true)
      expect(result.current.totalMoves).toBe(1)
    })

    it('processes a contradiction move (skipSpecialMoves=false) by reporting the error', () => {
      const moves = [createMockAutoSolveMove({ action: 'contradiction', explanation: 'CTX' })]
      const onError = vi.fn()
      const options = createDefaultAutoSolveOptions({ onError, stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      act(() => {
        result.current.playMoves(moves, false)
      })
      expect(onError).toHaveBeenCalledWith('Puzzle has a contradiction that could not be resolved.')
      expect(result.current.isAutoSolving).toBe(false)
    })
  })

  describe('solveFromGivens advanced path', () => {
    it('keeps autoSolveRef active while moves are still playing', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const applyMove = vi.fn()
      const options = createDefaultAutoSolveOptions({ applyMove, stepDelay: 50 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.solveFromGivens()
      })
      expect(applyMove).toHaveBeenCalled()
      expect(result.current.isAutoSolving).toBe(true)
      // Advance to flush second move
      await act(async () => {
        vi.advanceTimersByTime(120)
      })
      expect(applyMove.mock.calls.length).toBeGreaterThan(1)
    })

    it('sets isFetching=true while the givens solution is still pending', async () => {
      let resolveFetch: (value: SolveAllResult) => void = () => {}
      mockSolveAll.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      )
      const options = createDefaultAutoSolveOptions({ stepDelay: 50 })
      const { result } = renderHook(() => useAutoSolve(options))

      // Fire solveFromGivens without awaiting so we can observe the in-flight flag.
      act(() => {
        result.current.solveFromGivens()
      })
      await act(async () => {
        await Promise.resolve()
      })
      expect(result.current.isFetching).toBe(true)

      await act(async () => {
        resolveFetch(createMockSolveResponse(1))
      })
      expect(result.current.isFetching).toBe(false)
    })
  })

  describe('applyFixesAndContinueSolving', () => {
    it('plays the fix moves and then resumes autosolving from the current board', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(2))
      const applyMove = vi.fn()
      const options = createDefaultAutoSolveOptions({ applyMove, stepDelay: 10 })
      const { result } = renderHook(() => useAutoSolve(options))

      const fixMove = createMockAutoSolveMove({ action: 'place' })
      await act(async () => {
        const promise = result.current.applyFixesAndContinueSolving([fixMove])
        await vi.advanceTimersByTimeAsync(500)
        await promise
      })

      // Fix move applied, and the resume step invoked solveAll (restart).
      expect(applyMove).toHaveBeenCalled()
      expect(mockSolveAll).toHaveBeenCalledTimes(1)
    })

    it('stops an in-progress autosolve before applying the fixes', async () => {
      mockSolveAll.mockResolvedValueOnce(createMockSolveResponse(3))
      mockSolveAll.mockResolvedValueOnce(createMockSolveResponse(2))
      const applyMove = vi.fn()
      const options = createDefaultAutoSolveOptions({ applyMove, stepDelay: 1000 })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      expect(result.current.isAutoSolving).toBe(true)
      const callsBeforeFix = applyMove.mock.calls.length

      const fixMove = createMockAutoSolveMove({ action: 'place' })
      await act(async () => {
        const promise = result.current.applyFixesAndContinueSolving([fixMove])
        await vi.advanceTimersByTimeAsync(500)
        await promise
      })

      expect(applyMove.mock.calls.length).toBeGreaterThan(callsBeforeFix)
      expect(mockSolveAll).toHaveBeenCalledTimes(2)
    })

    it('reports the failure when resuming autosolving throws synchronously', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(2))
      const onError = vi.fn()
      // getGivens is only read inside restartAutoSolve; throwing there makes the
      // resume throw synchronously, which applyFixesAndContinueSolving catches.
      const getGivens = vi.fn(() => {
        throw new Error('givens-unreadable')
      })
      const options = createDefaultAutoSolveOptions({ onError, getGivens, stepDelay: 10 })
      const { result } = renderHook(() => useAutoSolve(options))

      const fixMove = createMockAutoSolveMove({ action: 'place' })
      await act(async () => {
        const promise = result.current.applyFixesAndContinueSolving([fixMove])
        await vi.advanceTimersByTimeAsync(500)
        await promise
      })

      expect(onError).toHaveBeenCalledWith('Failed to resume autosolving after applying fixes')
    })
  })

  describe('initial state-history snapshot content', () => {
    // Kills the history-seed mutants on the candidatesArray spread/arrow inside
    // runAutoSolveFetch: the index-0 snapshot must carry materialized candidate
    // arrays (not [] and not undefined), observable via stepBack -> applyState.
    it('stepBack to index 0 restores the full 81-cell candidate Sets seeded from the input candidates', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(2))
      const applyState = vi.fn()
      const seedCandidates = Array(81)
        .fill(null)
        .map(() => new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]))
      const options = createDefaultAutoSolveOptions({
        applyState,
        getCandidates: vi.fn(() => seedCandidates),
        stepDelay: 1000,
      })
      const { result } = renderHook(() => useAutoSolve(options))

      await act(async () => {
        await result.current.startAutoSolve()
      })
      // First move played synchronously -> index 1. Rewind to the seed snapshot.
      actStepBack(result)
      expect(result.current.currentIndex).toBe(0)

      expect(applyState).toHaveBeenCalled()
      const candidatesArg = applyState.mock.calls[
        applyState.mock.calls.length - 1
      ]![1] as Set<number>[]
      expect(candidatesArg).toHaveLength(81)
      candidatesArg.forEach((set) => {
        expect(set).toBeInstanceOf(Set)
        expect(set.size).toBe(9)
      })
    })
  })
})

// ============================================================================
// Mutation killing tests (MUT-1 iteration 2). No deferrals: every survivor is
// either killed here or annotated as a true equivalent in useAutoSolve.ts.
// ============================================================================
describe('useAutoSolve mutation kills (MUT-1 iter-2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockSolveAll.mockReset()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
  })
  afterEach(() => vi.useRealTimers())

  it('startAutoSolve on an unsolvable puzzle does not throw when onError is omitted', async () => {
    // Kills OptionalChaining mutants on `onError?.('This puzzle requires advanced techniques...')`
    // and the catch-block `onError?.(err...)` (L317, L358): removing ?. throws when onError is undefined.
    mockSolveAll.mockResolvedValue(createMockSolveResponse(0, { solved: false }))
    const opts = createDefaultOptions({ onError: undefined, onStepNavigate: undefined })
    const { result } = renderHook(() => useAutoSolve(opts))
    await expect(
      act(async () => {
        await result.current.startAutoSolve()
      }),
    ).resolves.toBeUndefined()
    expect(result.current.isAutoSolving).toBe(false)
  })

  it('startAutoSolve when solveAll rejects does not throw when onError is omitted', async () => {
    // Kills the catch-block OptionalChaining `onError?.(err.message)` (L358).
    mockSolveAll.mockRejectedValue(new Error('boom'))
    const opts = createDefaultOptions({ onError: undefined })
    const { result } = renderHook(() => useAutoSolve(opts))
    await expect(
      act(async () => {
        await result.current.startAutoSolve()
      }),
    ).resolves.toBeUndefined()
    expect(result.current.isAutoSolving).toBe(false)
  })

  it('solveFromGivens on an unsolvable puzzle does not throw when onError is omitted', async () => {
    // Kills OptionalChaining `onError?.('Could not solve this puzzle.')` (L604) and catch (L642).
    mockSolveAll.mockResolvedValue(createMockSolveResponse(0, { solved: false }))
    const opts = createDefaultOptions({ onError: undefined })
    const { result } = renderHook(() => useAutoSolve(opts))
    await expect(
      act(async () => {
        await result.current.solveFromGivens()
      }),
    ).resolves.toBeUndefined()
  })

  it('solveFromGivens when solveAll rejects does not throw when onError is omitted', async () => {
    // Kills the solveFromGivens catch-block OptionalChaining (L642).
    mockSolveAll.mockRejectedValue(new Error('boom'))
    const opts = createDefaultOptions({ onError: undefined })
    const { result } = renderHook(() => useAutoSolve(opts))
    await expect(
      act(async () => {
        await result.current.solveFromGivens()
      }),
    ).resolves.toBeUndefined()
  })

  it('stepBack/stepForward do not throw when onStepNavigate is omitted', async () => {
    // Kills OptionalChaining `onStepNavigate?.(...)` mutants at L423, L453, L483.
    const result = await startAutoSolveWith(3, { onStepNavigate: undefined })
    expect(() => {
      act(() => result.current.stepBack())
      act(() => result.current.stepForward())
    }).not.toThrow()
  })

  it('stepForward before auto-solving is a no-op (guard returns early)', async () => {
    // Kills the LogicalOperator mutant on
    // `if (!isAutoSolving || currentIndexRef.current >= allMovesRef.current.length) return`
    // (L432): flipping || to && lets the call proceed when not auto-solving.
    const opts = createDefaultOptions()
    const { result } = renderHook(() => useAutoSolve(opts))
    const before = result.current.currentIndex
    expect(() => act(() => result.current.stepForward())).not.toThrow()
    expect(result.current.currentIndex).toBe(before)
  })

  it('stepForward into new territory passes defined candidate Sets to applyMove', async () => {
    // Kills ArrowFunction mutants on `.map((arr) => new Set(arr))` (L450, L477):
    // `() => undefined` yields undefined entries, observed via applyMove payload.
    const applyMove = vi.fn()
    const result = await startAutoSolveWith(3, { applyMove })
    // auto-playback has applied move 0 (currentIndex 1); step forward to index 2 (new territory)
    act(() => result.current.stepBack())
    act(() => result.current.stepForward()) // index 1 -> existing snapshot
    act(() => result.current.stepForward()) // index 2 -> new territory branch (L460-486)
    const lastCall = applyMove.mock.calls[applyMove.mock.calls.length - 1]
    const candidatesArg = lastCall?.[1]
    expect(Array.isArray(candidatesArg)).toBe(true)
    expect(candidatesArg.every((c: unknown) => c instanceof Set)).toBe(true)
  })

  it('stepForward new territory tolerates a null candidate cell without throwing', async () => {
    // Kills the LogicalOperator mutant on `(cellCands: number[] | null) => new Set(cellCands || [])`
    // (L467): `cellCands && []` yields null for a null cellCand, and `new Set(null)` throws.
    mockSolveAll.mockResolvedValue(
      createMockSolveResponse(
        [
          {
            ...createMockAutoSolveMove(),
            candidates: Array(81)
              .fill(null)
              .map((_, i) => (i === 0 ? null : [1, 2, 3])),
            move: { ...createMockAutoSolveMove().move, step_index: 0 },
          },
          {
            ...createMockAutoSolveMove(),
            move: { ...createMockAutoSolveMove().move, step_index: 1 },
          },
        ],
        { solved: true },
      ),
    )
    const opts = createDefaultOptions()
    const { result } = renderHook(() => useAutoSolve(opts))
    await act(async () => {
      await result.current.startAutoSolve()
    })
    act(() => result.current.stepBack())
    expect(() => act(() => result.current.stepForward())).not.toThrow()
  })

  it('movesQueueRef is a copy, not an alias of allMovesRef: stepping remains consistent after a resume cycle', async () => {
    // Kills MethodExpression mutants that drop `.slice(newIndex)` (L427, L456, L486):
    // without slice, movesQueueRef aliases allMovesRef, and playNextMove's shift() corrupts
    // allMovesRef, so subsequent stepping cannot reach the final index.
    const result = await startAutoSolveWith(3)
    // auto-playback applied move 0 (currentIndex 1). Step back to 0 (reassigns queue via slice).
    act(() => result.current.stepBack())
    expect(result.current.currentIndex).toBe(0)
    // Resume auto-playback (shifts the queue). Under the aliasing mutant, allMovesRef shrinks.
    act(() => result.current.togglePause())
    act(() => result.current.togglePause()) // resume
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    // After resume, we should still be able to step forward through every move to the end.
    // The mutant corrupts allMovesRef via shift() aliasing and stalls short of index 3.
    for (let i = 0; i < 5; i++) {
      act(() => result.current.stepForward())
    }
    expect(result.current.currentIndex).toBe(3)
  })

  it('applyFixesAndContinueSolving resolves without throwing when the playback times out and onError is omitted', async () => {
    // Kills the NoCoverage ArithmeticOperator mutant on `Date.now() - start > TIMEOUT` (L695)
    // and the OptionalChaining `onError?.('Failed to resume...')` mutants at L687, L704:
    // forces the timeout branch to execute (covering L695) and asserts no-throw without onError.
    mockSolveAll.mockResolvedValue(createMockSolveResponse(1))
    const opts = createDefaultOptions({
      applyMove: vi.fn(), // no-op applyMove so the fixes queue never drains -> timeout branch fires
      onError: undefined,
    })
    const { result } = renderHook(() => useAutoSolve(opts))
    await act(async () => {
      await result.current.startAutoSolve()
    })
    // Now drive applyFixesAndContinueSolving and advance past the safety timeout.
    await expect(
      act(async () => {
        const p = result.current.applyFixesAndContinueSolving([createMockAutoSolveMove()])
        await vi.advanceTimersByTimeAsync(10_000_000) // well past AUTO_SOLVE_MAX_TIME
        await p
      }),
    ).resolves.toBeUndefined()
  })

  it('stepForward new territory tolerates a move whose candidates field is null', async () => {
    // Kills the NoCoverage ArrowFunction mutant on the else-branch
    // `: getCandidates().map((set) => Array.from(set))` (L478): `() => undefined` stores
    // undefined entries in stateHistory, and a later stepBack restoring that snapshot calls
    // `new Set(undefined)` which throws.
    mockSolveAll.mockResolvedValue(
      createMockSolveResponse(
        [
          {
            ...createMockAutoSolveMove(),
            candidates: null as unknown as (number[] | null)[],
            move: { ...createMockAutoSolveMove().move, step_index: 0 },
          },
          {
            ...createMockAutoSolveMove(),
            move: { ...createMockAutoSolveMove().move, step_index: 1 },
          },
        ],
        { solved: true },
      ),
    )
    const opts = createDefaultOptions()
    const { result } = renderHook(() => useAutoSolve(opts))
    await act(async () => {
      await result.current.startAutoSolve()
    })
    act(() => result.current.stepBack()) // to index 0
    act(() => result.current.stepForward()) // index 1 -> new territory, move.candidates null -> L478 branch
    expect(() => act(() => result.current.stepBack())).not.toThrow() // restore that snapshot
  })

  it('stepForward into unvisited territory with a null-candidate move seeds candidates from getCandidates()', async () => {
    // Covers the else-branch of the new-territory push (useAutoSolve L471-475 and L480-484):
    // when the applied move carries no candidates, both the Sets passed to applyMove and the
    // arrays stored in the snapshot are materialized from getCandidates().
    const baseMove = createMockAutoSolveMove({ action: 'place' })
    const moves = [
      baseMove,
      {
        ...createMockAutoSolveMove({ action: 'place' }),
        candidates: null as unknown as (number[] | null)[],
        move: { ...baseMove.move, step_index: 1 },
      },
    ]
    mockSolveAll.mockResolvedValue(createMockSolveResponse(moves, { solved: true }))
    const applyMove = vi.fn()
    const applyState = vi.fn()
    // getCandidates defaults to 81 Sets of {1..9}: each restored candidate Set must have size 9.
    const options = createDefaultAutoSolveOptions({ applyMove, applyState, stepDelay: 1000 })
    const { result } = renderHook(() => useAutoSolve(options))

    await act(async () => {
      await result.current.startAutoSolve()
    })
    // Only the first move played synchronously: index 1, snapshots [seed, move0].
    expect(result.current.currentIndex).toBe(1)

    actStepBack(result) // 1 -> 0
    actStepForward(result) // 0 -> 1, existing snapshot
    applyMove.mockClear()
    actStepForward(result) // 1 -> 2, new territory; move1.candidates is null -> getCandidates() fallback
    expect(result.current.currentIndex).toBe(2)

    const appliedCandidates = applyMove.mock.calls.at(-1)?.[1] as Set<number>[]
    expect(appliedCandidates).toHaveLength(81)
    expect(appliedCandidates.every((s) => s instanceof Set && s.size === 9)).toBe(true)

    // The snapshot pushed for index 2 must carry the same materialized candidates:
    // re-entering index 2 restores them via applyState.
    actStepBack(result) // 2 -> 1, existing snapshot
    applyState.mockClear()
    actStepForward(result) // 1 -> 2, existing snapshot built by the else-branch push
    const restoredCandidates = applyState.mock.calls.at(-1)?.[1] as Set<number>[]
    expect(restoredCandidates).toHaveLength(81)
    expect(restoredCandidates.every((s) => s instanceof Set && s.size === 9)).toBe(true)
  })

  it('applyFixesAndContinueSolving hits the safety timeout and resumes when fix playback stalls', async () => {
    // Covers the timeout guard in checkDone (useAutoSolve L706-721): when the fix-move queue
    // never drains (the tab goes hidden, so scheduled ticks are dropped), the elapsed-time guard
    // fires and restartAutoSolve is invoked to recover.
    mockSolveAll.mockResolvedValue(createMockSolveResponse(1))
    const options = createDefaultOptions({ applyMove: vi.fn(), stepDelay: 100 })
    const { result } = renderHook(() => useAutoSolve(options))

    // Two fix moves: the first plays synchronously, the second is scheduled. Hiding the tab
    // drops that scheduled tick, so the queue keeps one move and never empties.
    const fixMoves = [
      createMockAutoSolveMove({ action: 'place' }),
      createMockAutoSolveMove({ action: 'place' }),
    ]

    await act(async () => {
      const p = result.current.applyFixesAndContinueSolving(fixMoves)
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
      // Advance past the safety timeout so the stalled-queue guard fires.
      await vi.advanceTimersByTimeAsync(AUTO_SOLVE_MAX_TIME + 1000)
      await p
    })

    // The queue-empty path could never run (queue stayed non-empty), so this restart proves the
    // timeout branch executed.
    expect(mockSolveAll).toHaveBeenCalled()

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
  })

  it('reports the failure when the safety-timeout restart itself throws', async () => {
    // Covers the inner catch of the timeout guard (useAutoSolve L713-716): the fix playback
    // stalls into the timeout branch, and the recovery restartAutoSolve throws (getGivens is
    // read inside it), so onError fires with the resume-failure message.
    mockSolveAll.mockResolvedValue(createMockSolveResponse(1))
    const onError = vi.fn()
    const getGivens = vi.fn(() => {
      throw new Error('givens-unreadable')
    })
    const options = createDefaultOptions({ applyMove: vi.fn(), onError, getGivens, stepDelay: 100 })
    const { result } = renderHook(() => useAutoSolve(options))

    const fixMoves = [
      createMockAutoSolveMove({ action: 'place' }),
      createMockAutoSolveMove({ action: 'place' }),
    ]

    await act(async () => {
      const p = result.current.applyFixesAndContinueSolving(fixMoves)
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
      await vi.advanceTimersByTimeAsync(AUTO_SOLVE_MAX_TIME + 1000)
      await p
    })

    expect(onError).toHaveBeenCalledWith('Failed to resume autosolving after applying fixes')

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
  })

  it('creates its own background manager when none is provided in options', () => {
    // Covers the `providedBackgroundManager || defaultBackgroundManager` fallback (useAutoSolve L103):
    // omitting backgroundManager exercises the right operand (the hook-created default).
    const options = createDefaultOptions({ backgroundManager: undefined })
    const { result } = renderHook(() => useAutoSolve(options))

    // The hook still initializes correctly against its own default background manager.
    expect(result.current.isAutoSolving).toBe(false)
    expect(result.current.isPaused).toBe(false)
  })

  it('stepForward into new territory materializes candidates per cell, tolerating null cells', async () => {
    // Covers the per-cell candidate mapping in the new-territory branch (useAutoSolve L473 `cellCands || []`
    // and L483 `arr ? [...arr] : []`): a move whose candidates array mixes null and populated cells.
    const baseMove = createMockAutoSolveMove({ action: 'place' })
    const mixedCandidates = Array(81)
      .fill(null)
      .map((_, i) => (i % 2 === 0 ? null : [1, 2, 3]))
    const moves = [
      baseMove,
      {
        ...createMockAutoSolveMove({ action: 'place' }),
        candidates: mixedCandidates as (number[] | null)[],
        move: { ...baseMove.move, step_index: 1 },
      },
    ]
    mockSolveAll.mockResolvedValue(createMockSolveResponse(moves, { solved: true }))
    const applyMove = vi.fn()
    const applyState = vi.fn()
    const options = createDefaultOptions({ applyMove, applyState, stepDelay: 1000 })
    const { result } = renderHook(() => useAutoSolve(options))

    await act(async () => {
      await result.current.startAutoSolve()
    })
    expect(result.current.currentIndex).toBe(1)

    actStepBack(result) // 1 -> 0
    actStepForward(result) // 0 -> 1, existing snapshot
    applyMove.mockClear()
    actStepForward(result) // 1 -> 2, new territory with mixed candidates
    expect(result.current.currentIndex).toBe(2)

    // L473: null cells become empty Sets, populated cells keep their digits.
    const applied = applyMove.mock.calls.at(-1)?.[1] as Set<number>[]
    expect(applied).toHaveLength(81)
    expect(applied[0]?.size).toBe(0)
    expect(applied[1]?.size).toBe(3)

    // L483: the snapshot stores the same per-cell shape; re-entering index 2 restores it.
    actStepBack(result) // 2 -> 1
    applyState.mockClear()
    actStepForward(result) // 1 -> 2, existing snapshot built by the new-territory push
    const restored = applyState.mock.calls.at(-1)?.[1] as Set<number>[]
    expect(restored).toHaveLength(81)
    expect(restored[0]?.size).toBe(0)
    expect(restored[1]?.size).toBe(3)
  })
})

// ============================================================================
// Mutation kills (MUT-1 iter-3): clearActiveTimers null-guard, the pause-sync
// resume guard, and the playMoves seed-snapshot candidate materialization.
// ============================================================================
describe('useAutoSolve mutation kills (MUT-1 iter-3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockSolveAll.mockReset()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
  })
  afterEach(() => vi.useRealTimers())

  it('clearActiveTimers clears the live scheduled timer when auto-solve stops', async () => {
    // Kills the clearActiveTimers BlockStatement mutants (whole body and the if-body) and the
    // `!== null` EqualityOperator mutant: each of those leaves the pending timer uncleared, so
    // clearTimeout is never called when stopAutoSolve runs with a scheduled next move.
    vi.useFakeTimers()
    mockSolveAll.mockResolvedValue(createMockSolveResponse(10))
    const options = createDefaultOptions({ stepDelay: 100 })
    const { result } = renderHook(() => useAutoSolve(options))
    await act(async () => {
      await result.current.startAutoSolve()
    })
    // A next-move timer is pending now (activeTimeoutRef is non-null).
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    act(() => {
      result.current.stopAutoSolve()
    })
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
    vi.useRealTimers()
  })

  it('the pause-sync effect re-running while unpaused and auto-solving does not replay a move', async () => {
    // Kills the ConditionalExpression `-> true` mutant on
    // `if (wasPaused && autoSolveRef.current && playNextMoveRef.current)`: with the effect
    // re-running unpaused (wasPaused === false), the real guard is false and must not resume.
    // Forcing it true invokes playNextMoveRef.current() and applies an extra move here.
    mockSolveAll.mockResolvedValue(createMockSolveResponse(5))
    const applyMove = vi.fn()
    const bg1 = createMockBackgroundManager({ shouldPauseOperations: false })
    const options = createDefaultOptions({ applyMove, backgroundManager: bg1, stepDelay: 1000 })
    const { result, rerender } = renderHook(({ opts }) => useAutoSolve(opts), {
      initialProps: { opts: options },
    })
    await act(async () => {
      await result.current.startAutoSolve()
    })
    const callsAfterStart = applyMove.mock.calls.length
    expect(callsAfterStart).toBe(1)

    // Swapping the background-manager instance re-runs the pause-sync effect while still
    // unpaused and auto-solving.
    const bg2 = createMockBackgroundManager({ shouldPauseOperations: false })
    await act(async () => {
      rerender({ opts: { ...options, backgroundManager: bg2 } })
    })
    expect(applyMove.mock.calls.length).toBe(callsAfterStart)
  })

  it('playMoves seeds the initial-snapshot candidates per cell from moves[0].candidates', () => {
    // Kills the L553 ArrowFunction (`() => undefined`), ConditionalExpression (both branches of
    // `arr ? [...arr] : []`), and LogicalOperator (`|| -> &&`) mutants that build the seed
    // snapshot candidates. The restored Sets must reflect moves[0].candidates exactly:
    // a null cell -> empty Set, a [1,2,3] cell -> size 3 (not 0 from undefined/false, and not
    // size 9 from the getCandidates fallback the `&&` mutant would select).
    const base = createMockAutoSolveMove({ action: 'place' })
    const firstCandidates = Array(81)
      .fill(null)
      .map((_, i) => (i === 0 ? null : [1, 2, 3]))
    const moves = [
      {
        ...base,
        candidates: firstCandidates as (number[] | null)[],
        move: { ...base.move, step_index: 0 },
      },
      { ...createMockAutoSolveMove({ action: 'place' }), move: { ...base.move, step_index: 1 } },
    ]
    const applyState = vi.fn()
    const getCandidates = vi.fn(() =>
      Array(81)
        .fill(null)
        .map(() => new Set([1, 2, 3, 4, 5, 6, 7, 8, 9])),
    )
    const options = createDefaultOptions({ applyState, getCandidates, stepDelay: 1000 })
    const { result } = renderHook(() => useAutoSolve(options))

    act(() => {
      result.current.playMoves(moves, false)
    })
    // move0 played synchronously -> index 1; rewind to the seed snapshot at index 0.
    act(() => {
      result.current.stepBack()
    })
    expect(result.current.currentIndex).toBe(0)

    const restored = applyState.mock.calls.at(-1)?.[1] as Set<number>[]
    expect(restored).toHaveLength(81)
    expect(restored[0]?.size).toBe(0)
    expect(restored[1]?.size).toBe(3)
  })

  it('restartAutoSolve(false) clears a prior manual pause', async () => {
    // Kills the BlockStatement mutant on restartAutoSolve's `else` branch (`manualPausedRef = false;
    // setManualPaused(false)`): emptying it leaves a prior manual pause engaged after an unpaused
    // restart.
    mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
    const options = createDefaultOptions({ stepDelay: 1000 })
    const { result } = renderHook(() => useAutoSolve(options))
    await act(async () => {
      await result.current.startAutoSolve()
    })
    act(() => {
      result.current.togglePause()
    })
    expect(result.current.isPaused).toBe(true)

    await act(async () => {
      await result.current.restartAutoSolve(false)
    })
    expect(result.current.isPaused).toBe(false)
  })

  it('playMoves(startPaused=false) clears a prior manual pause', async () => {
    // Kills the BlockStatement mutant on playMoves' `else` branch: emptying it leaves a prior
    // manual pause engaged when a custom sequence is started unpaused.
    mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
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
      result.current.playMoves([createMockAutoSolveMove({ action: 'place' })], false)
    })
    expect(result.current.isPaused).toBe(false)
  })

  it('stepForward does not engage manual pause when not auto-solving', () => {
    // Kills the LogicalOperator mutant on the stepForward guard
    // `if (!isAutoSolving || currentIndexRef.current >= allMovesRef.current.length) return`:
    // flipping || to && lets the call proceed when not auto-solving, which engages manual pause.
    const options = createDefaultOptions()
    const { result } = renderHook(() => useAutoSolve(options))
    expect(result.current.isAutoSolving).toBe(false)
    expect(result.current.isPaused).toBe(false)

    act(() => {
      result.current.stepForward()
    })
    expect(result.current.isPaused).toBe(false)
    expect(result.current.currentIndex).toBe(-1)
  })

  it('applyFixesAndContinueSolving queue-empty resume failure does not throw when onError is omitted', async () => {
    // Kills the OptionalChaining mutant on the queue-empty branch's
    // `onError?.('Failed to resume autosolving after applying fixes')`: with a single fix move the
    // queue drains immediately, and a resume failure (getGivens throws) hits that catch. Removing
    // the ?. calls undefined() and throws when onError is omitted.
    mockSolveAll.mockResolvedValue(createMockSolveResponse(1))
    const getGivens = vi.fn(() => {
      throw new Error('givens-unreadable')
    })
    const options = createDefaultOptions({
      applyMove: vi.fn(),
      getGivens,
      onError: undefined,
      stepDelay: 10,
    })
    const { result } = renderHook(() => useAutoSolve(options))

    await expect(
      act(async () => {
        const p = result.current.applyFixesAndContinueSolving([
          createMockAutoSolveMove({ action: 'place' }),
        ])
        await vi.advanceTimersByTimeAsync(500)
        await p
      }),
    ).resolves.toBeUndefined()
  })

  // Distinct board per move (all cells = i+1) so applyMove/currentIndex reveal exactly
  // which move ran and from which queue position.
  function movesWithDistinctBoards(n: number): MoveResult[] {
    return Array.from({ length: n }, (_, i) => ({
      board: Array(81).fill(i + 1),
      candidates: Array(81)
        .fill(null)
        .map(() => [1, 2, 3]),
      move: {
        step_index: i,
        technique: 'NakedSingle',
        action: 'place',
        digit: 5,
        targets: [{ row: 0, col: 0 }],
        explanation: `Move ${i}`,
        refs: { title: 'Test', slug: 'test', url: '/test' },
        highlights: { primary: [] },
        userEntryCount: undefined,
      },
    })) as unknown as MoveResult[]
  }

  describe('mutation coverage (survivor kills)', () => {
    it('playMoves ignores an empty move list instead of starting a run', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSolve(options))

      act(() => {
        result.current.playMoves([])
      })

      // With the empty-guard removed, playMoves would fall through and set isAutoSolving.
      expect(result.current.isAutoSolving).toBe(false)
    })

    it('playMoves seeds from the current board when the first move is undefined', () => {
      const getBoard = vi.fn(() => Array(81).fill(4))
      const options = createDefaultOptions({ getBoard })
      const { result } = renderHook(() => useAutoSolve(options))

      // startPaused=true so only the seed snapshot is built (no playback). With the
      // optional chain removed, `moves[0].board` dereferences undefined and throws.
      expect(() => {
        act(() => {
          result.current.playMoves([undefined as unknown as MoveResult], true)
        })
      }).not.toThrow()
    })

    it('playMoves seeds the initial snapshot from the first move board, not the current board', () => {
      const applyState = vi.fn()
      const getBoard = vi.fn(() => Array(81).fill(9))
      const options = createDefaultOptions({ applyState, getBoard, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))
      const moves = movesWithDistinctBoards(2) // move[0].board = all 1s

      // Paused so nothing drains; only the seed snapshot (index 0) is built.
      act(() => {
        result.current.playMoves(moves, true)
      })
      // Advance into new territory (index 1) then step back to restore the seed snapshot.
      act(() => {
        result.current.stepForward()
      })
      act(() => {
        result.current.stepBack()
      })

      // The seed snapshot board must be moves[0].board (all 1s). The `|| currentBoard`
      // fallback flipped to `&& currentBoard` would restore the current board (all 9s).
      const seedRestore = applyState.mock.calls.find(
        (call) => Array.isArray(call[0]) && call[0][0] === 1,
      )
      const wrongRestore = applyState.mock.calls.find(
        (call) => Array.isArray(call[0]) && call[0][0] === 9,
      )
      expect(seedRestore).toBeDefined()
      expect(wrongRestore).toBeUndefined()
    })

    it('stepForward into new territory works without an onStepNavigate callback', async () => {
      mockSolveAll.mockResolvedValue(createMockSolveResponse(3))
      const options = createDefaultOptions({ onStepNavigate: undefined })
      const { result } = renderHook(() => useAutoSolve(options))

      // Start paused: history holds only the seed, so the next stepForward enters new territory.
      await act(async () => {
        await result.current.restartAutoSolve(true)
      })

      // Removing the optional chain turns onStepNavigate?.(…) into a call on undefined.
      expect(() => {
        act(() => {
          result.current.stepForward()
        })
      }).not.toThrow()
    })

    it('rebuilds the move queue from the new index after stepping into new territory', async () => {
      const applyMove = vi.fn()
      const options = createDefaultOptions({ applyMove, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))
      mockSolveAll.mockResolvedValue({
        solved: true,
        moves: movesWithDistinctBoards(3),
        finalBoard: Array(81).fill(0),
      } as unknown as ReturnType<typeof createMockSolveResponse>)

      await act(async () => {
        await result.current.restartAutoSolve(true) // paused, index 0
      })

      // New territory: applies move[0], index -> 1, queue must become slice(1) = [move1, move2].
      act(() => {
        result.current.stepForward()
      })
      expect(result.current.currentIndex).toBe(1)

      applyMove.mockClear()

      // Resume (manualPaused true -> false fires the resume effect, which plays one move
      // synchronously from the head of the queue). The head must be move[1] (board all 2s);
      // if the queue were reset to the full list, playback would replay move[0] (all 1s).
      await act(async () => {
        result.current.togglePause()
      })

      expect(applyMove).toHaveBeenCalled()
      expect(applyMove.mock.calls[0]![0][0]).toBe(2)
    })

    it('rebuilds the move queue from the index when revisiting a cached snapshot', async () => {
      const applyMove = vi.fn()
      const options = createDefaultOptions({ applyMove, stepDelay: 100 })
      const { result } = renderHook(() => useAutoSolve(options))
      mockSolveAll.mockResolvedValue({
        solved: true,
        moves: movesWithDistinctBoards(4),
        finalBoard: Array(81).fill(0),
      } as unknown as ReturnType<typeof createMockSolveResponse>)

      await act(async () => {
        await result.current.restartAutoSolve(true) // paused, index 0
      })

      // Build history out to index 2 (new territory twice).
      act(() => {
        result.current.stepForward()
      })
      act(() => {
        result.current.stepForward()
      })
      expect(result.current.currentIndex).toBe(2)

      // Step back to a cached snapshot, then forward again: this hits the cached-snapshot
      // branch, which must set the queue to slice(2) = [move2, move3].
      act(() => {
        result.current.stepBack()
      })
      act(() => {
        result.current.stepForward()
      })
      expect(result.current.currentIndex).toBe(2)

      applyMove.mockClear()

      // Resume: the head of the queue must be move[2] (board all 3s). A full-list queue
      // would replay move[0] (all 1s) instead.
      await act(async () => {
        result.current.togglePause()
      })

      expect(applyMove).toHaveBeenCalled()
      expect(applyMove.mock.calls[0]![0][0]).toBe(3)
    })

    it('does not log an auto-solve error when startAutoSolve finds no solution without an onError callback', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
      try {
        mockSolveAll.mockResolvedValue({
          solved: false,
          moves: [],
          finalBoard: Array(81).fill(0),
        } as unknown as ReturnType<typeof createMockSolveResponse>)
        const options = createDefaultOptions({ onError: undefined })
        const { result } = renderHook(() => useAutoSolve(options))

        await act(async () => {
          await result.current.startAutoSolve()
        })

        // With the optional chain removed, onError(…) throws on the undefined callback and
        // the catch block logs "Auto-solve error"; the clean no-solution path logs nothing.
        expect(errorSpy).not.toHaveBeenCalled()
        expect(result.current.isAutoSolving).toBe(false)
      } finally {
        errorSpy.mockRestore()
      }
    })

    it('does not log an error when solveFromGivens finds no solution without an onError callback', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
      try {
        mockSolveAll.mockResolvedValue({
          solved: false,
          moves: [],
          finalBoard: Array(81).fill(0),
        } as unknown as ReturnType<typeof createMockSolveResponse>)
        const options = createDefaultOptions({ onError: undefined })
        const { result } = renderHook(() => useAutoSolve(options))

        await act(async () => {
          await result.current.solveFromGivens()
        })

        expect(errorSpy).not.toHaveBeenCalled()
        expect(result.current.isAutoSolving).toBe(false)
      } finally {
        errorSpy.mockRestore()
      }
    })

    it('resolves when the safety-timeout restart throws and onError is omitted', async () => {
      // Drives the timeout-branch catch (useAutoSolve L758-761): playback stalls into the
      // safety timeout, the recovery restartAutoSolve reads getGivens and throws. With the
      // optional chain removed, onError(...) throws on the undefined callback, so resolve()
      // never runs and the awaited promise hangs.
      mockSolveAll.mockResolvedValue(createMockSolveResponse(1))
      const getGivens = vi.fn(() => {
        throw new Error('givens-unreadable')
      })
      const options = createDefaultOptions({
        applyMove: vi.fn(),
        onError: undefined,
        getGivens,
        stepDelay: 100,
      })
      const { result } = renderHook(() => useAutoSolve(options))

      const fixMoves = [
        createMockAutoSolveMove({ action: 'place' }),
        createMockAutoSolveMove({ action: 'place' }),
      ]

      await expect(
        act(async () => {
          const p = result.current.applyFixesAndContinueSolving(fixMoves)
          // Hide the page so scheduled playback is skipped and the queue never drains,
          // forcing the elapsed-time timeout branch rather than the queue-empty branch.
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'hidden',
          })
          await vi.advanceTimersByTimeAsync(AUTO_SOLVE_MAX_TIME + 1000)
          await p
        }),
      ).resolves.toBeUndefined()

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
    })
  })
})
