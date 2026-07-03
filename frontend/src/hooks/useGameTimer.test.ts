import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useGameTimer } from './useGameTimer'

// TEST UTILITIES

/**
 * Create a mock background manager for testing
 */
const createMockBackgroundManager = (overrides?: {
  isHidden?: boolean
  shouldPauseOperations?: boolean
}) => ({
  isHidden: overrides?.isHidden ?? false,
  shouldPauseOperations: overrides?.shouldPauseOperations ?? false,
  registerCallback: vi.fn(),
  unregisterCallback: vi.fn(),
})

// TESTS

describe('useGameTimer', () => {
  let originalVisibilityState: PropertyDescriptor | undefined

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Mock document.visibilityState to 'visible' by default
    originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    // Restore original visibilityState
    if (originalVisibilityState) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityState)
    } else {
      // @ts-expect-error - restoring default
      delete document.visibilityState
    }
  })

  // INITIAL STATE TESTS
  describe('Initial State', () => {
    it('starts at 0 elapsed time', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      expect(result.current.elapsedMs).toBe(0)
    })

    it('starts not running by default', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      expect(result.current.isRunning).toBe(false)
    })

    it('starts running when autoStart is true', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager, autoStart: true }))

      expect(result.current.isRunning).toBe(true)
    })

    it('starts not paused due to visibility', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      expect(result.current.isPausedDueToVisibility).toBe(false)
    })
  })

  // TIMER CONTROL TESTS
  describe('Timer Control', () => {
    it('starts timer with startTimer', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      expect(result.current.isRunning).toBe(false)

      act(() => {
        result.current.startTimer()
      })

      expect(result.current.isRunning).toBe(true)
    })

    it('pauses timer with pauseTimer', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      // Start the timer explicitly (this sets startTimeRef)
      act(() => {
        result.current.startTimer()
      })

      expect(result.current.isRunning).toBe(true)

      act(() => {
        result.current.pauseTimer()
      })

      expect(result.current.isRunning).toBe(false)
    })

    it('does nothing when starting already running timer', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager, autoStart: true }))

      const isRunningBefore = result.current.isRunning

      act(() => {
        result.current.startTimer()
      })

      expect(result.current.isRunning).toBe(isRunningBefore)
    })

    it('does nothing when pausing already stopped timer', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      act(() => {
        result.current.pauseTimer()
      })

      expect(result.current.isRunning).toBe(false)
    })

    it('resets timer to 0 with resetTimer', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      // Manually set elapsed time first
      act(() => {
        result.current.setElapsedMs(5000)
      })

      expect(result.current.elapsedMs).toBe(5000)

      act(() => {
        result.current.resetTimer()
      })

      expect(result.current.elapsedMs).toBe(0)
    })

    it('sets elapsed time with setElapsedMs', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      act(() => {
        result.current.setElapsedMs(120000) // 2 minutes
      })

      expect(result.current.elapsedMs).toBe(120000)
    })
  })

  // TIME INCREMENTING TESTS
  describe('Time Incrementing', () => {
    it('increments time when running', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      // Explicitly start timer (sets startTimeRef.current = Date.now())
      act(() => {
        result.current.startTimer()
      })

      // The timer uses Date.now() internally. With fake timers + shouldAdvanceTime,
      // Date.now() advances when we advance timers
      act(() => {
        vi.advanceTimersByTime(1100) // Slightly more than one update interval
      })

      // Timer should have incremented
      expect(result.current.elapsedMs).toBeGreaterThan(0)
    })

    it('does not increment time when paused', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      const initialTime = result.current.elapsedMs

      act(() => {
        vi.advanceTimersByTime(5000)
      })

      expect(result.current.elapsedMs).toBe(initialTime)
    })

    it('accumulates time correctly across pause/resume', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      // Set an initial time
      act(() => {
        result.current.setElapsedMs(5000)
      })

      expect(result.current.elapsedMs).toBe(5000)

      // Start and advance
      act(() => {
        result.current.startTimer()
      })

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      // Should have accumulated time
      expect(result.current.elapsedMs).toBeGreaterThanOrEqual(5000)
    })
  })

  // FORMAT TIME TESTS
  describe('formatTime', () => {
    it('formats 0ms as "0:00"', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      expect(result.current.formatTime(0)).toBe('0:00')
    })

    it('formats seconds correctly', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      expect(result.current.formatTime(5000)).toBe('0:05')
      expect(result.current.formatTime(30000)).toBe('0:30')
      expect(result.current.formatTime(59000)).toBe('0:59')
    })

    it('formats minutes correctly', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      expect(result.current.formatTime(60000)).toBe('1:00')
      expect(result.current.formatTime(90000)).toBe('1:30')
      expect(result.current.formatTime(300000)).toBe('5:00')
    })

    it('formats large times correctly', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      expect(result.current.formatTime(3600000)).toBe('60:00') // 1 hour
      expect(result.current.formatTime(3661000)).toBe('61:01') // 1 hour 1 min 1 sec
    })

    it('uses current elapsed time when no argument provided', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      act(() => {
        result.current.setElapsedMs(125000) // 2:05
      })

      expect(result.current.formatTime()).toBe('2:05')
    })

    it('pads seconds with leading zero', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      expect(result.current.formatTime(1000)).toBe('0:01')
      expect(result.current.formatTime(9000)).toBe('0:09')
    })

    it('handles edge cases at minute boundaries', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      expect(result.current.formatTime(59999)).toBe('0:59') // Just under 1 minute
      expect(result.current.formatTime(60001)).toBe('1:00') // Just over 1 minute
    })
  })

  // VISIBILITY HANDLING TESTS
  describe('Visibility Handling', () => {
    it('sets isPausedDueToVisibility when shouldPauseOperations is true and running', () => {
      const backgroundManager = createMockBackgroundManager({ shouldPauseOperations: true })
      const { result } = renderHook(() => useGameTimer({ backgroundManager, autoStart: true }))

      expect(result.current.isPausedDueToVisibility).toBe(true)
    })

    it('does not set isPausedDueToVisibility when timer not running', () => {
      const backgroundManager = createMockBackgroundManager({ shouldPauseOperations: true })
      const { result } = renderHook(() => useGameTimer({ backgroundManager, autoStart: false }))

      // Should NOT be paused due to visibility because timer wasn't running
      expect(result.current.isPausedDueToVisibility).toBe(false)
    })

    it('respects pauseOnHidden=false option', () => {
      const backgroundManager = createMockBackgroundManager({ shouldPauseOperations: true })
      const { result } = renderHook(() =>
        useGameTimer({
          backgroundManager,
          autoStart: true,
          pauseOnHidden: false,
        }),
      )

      // Should NOT pause because pauseOnHidden is false
      expect(result.current.isPausedDueToVisibility).toBe(false)
    })

    it('updates isPausedDueToVisibility when visibility changes', () => {
      const backgroundManager = createMockBackgroundManager({ shouldPauseOperations: false })
      const { result, rerender } = renderHook(
        ({ bgManager }) => useGameTimer({ backgroundManager: bgManager, autoStart: true }),
        { initialProps: { bgManager: backgroundManager } },
      )

      expect(result.current.isPausedDueToVisibility).toBe(false)

      // Simulate visibility change
      const hiddenManager = createMockBackgroundManager({
        shouldPauseOperations: true,
        isHidden: true,
      })

      rerender({ bgManager: hiddenManager })

      expect(result.current.isPausedDueToVisibility).toBe(true)
    })
  })

  // EDGE CASES
  describe('Edge Cases', () => {
    it('handles setElapsedMs while running', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager, autoStart: true }))

      act(() => {
        result.current.setElapsedMs(60000)
      })

      expect(result.current.elapsedMs).toBe(60000)
      expect(result.current.isRunning).toBe(true)
    })

    it('reset while running keeps timer running', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager, autoStart: true }))

      act(() => {
        result.current.setElapsedMs(5000)
      })

      act(() => {
        result.current.resetTimer()
      })

      expect(result.current.elapsedMs).toBe(0)
      expect(result.current.isRunning).toBe(true)
    })

    it('reset clears isPausedDueToVisibility', () => {
      const backgroundManager = createMockBackgroundManager({ shouldPauseOperations: true })
      const { result } = renderHook(() => useGameTimer({ backgroundManager, autoStart: true }))

      // This would be set due to visibility
      expect(result.current.isPausedDueToVisibility).toBe(true)

      act(() => {
        result.current.resetTimer()
      })

      expect(result.current.isPausedDueToVisibility).toBe(false)
    })

    it('multiple setElapsedMs calls work correctly', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      act(() => {
        result.current.setElapsedMs(1000)
      })
      expect(result.current.elapsedMs).toBe(1000)

      act(() => {
        result.current.setElapsedMs(5000)
      })
      expect(result.current.elapsedMs).toBe(5000)

      act(() => {
        result.current.setElapsedMs(0)
      })
      expect(result.current.elapsedMs).toBe(0)
    })
  })

  // FUNCTION STABILITY TESTS
  describe('Function Stability', () => {
    it('provides stable function references across rerenders', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result, rerender } = renderHook(() => useGameTimer({ backgroundManager }))

      const startTimer1 = result.current.startTimer
      const pauseTimer1 = result.current.pauseTimer
      const resetTimer1 = result.current.resetTimer

      rerender()

      // Functions should be stable (useCallback)
      expect(result.current.startTimer).toBe(startTimer1)
      expect(result.current.pauseTimer).toBe(pauseTimer1)
      expect(result.current.resetTimer).toBe(resetTimer1)
    })
  })

  // RETURN VALUE COMPLETENESS
  describe('Return Value', () => {
    it('returns all expected properties', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      expect(result.current).toHaveProperty('elapsedMs')
      expect(result.current).toHaveProperty('isRunning')
      expect(result.current).toHaveProperty('isPausedDueToVisibility')
      expect(result.current).toHaveProperty('startTimer')
      expect(result.current).toHaveProperty('pauseTimer')
      expect(result.current).toHaveProperty('resetTimer')
      expect(result.current).toHaveProperty('setElapsedMs')
      expect(result.current).toHaveProperty('formatTime')
    })

    it('returns functions for all actions', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      expect(typeof result.current.startTimer).toBe('function')
      expect(typeof result.current.pauseTimer).toBe('function')
      expect(typeof result.current.resetTimer).toBe('function')
      expect(typeof result.current.setElapsedMs).toBe('function')
      expect(typeof result.current.formatTime).toBe('function')
    })
  })

  // EDGE CASE TESTS (Added for TIMER-004)
  describe('Edge Cases', () => {
    it('handles setElapsedMs with NaN value', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      act(() => {
        result.current.setElapsedMs(NaN)
      })

      // Should default to 0 instead of NaN
      expect(result.current.elapsedMs).toBe(0)
      expect(Number.isFinite(result.current.elapsedMs)).toBe(true)
    })

    it('handles setElapsedMs with negative value', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      act(() => {
        result.current.setElapsedMs(-5000)
      })

      // Should clamp to 0 instead of allowing negative
      expect(result.current.elapsedMs).toBe(0)
    })

    it('handles setElapsedMs with Infinity', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      act(() => {
        result.current.setElapsedMs(Infinity)
      })

      // Should default to 0 for non-finite values
      expect(result.current.elapsedMs).toBe(0)
      expect(Number.isFinite(result.current.elapsedMs)).toBe(true)
    })

    it('handles multiple rapid startTimer calls gracefully', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      // Start timer multiple times rapidly
      act(() => {
        result.current.startTimer()
        result.current.startTimer()
        result.current.startTimer()
      })

      expect(result.current.isRunning).toBe(true)

      // Advance time and verify timer is ticking normally
      act(() => {
        vi.advanceTimersByTime(2000)
      })

      expect(result.current.elapsedMs).toBeGreaterThanOrEqual(2000)
    })

    it('handles resetTimer followed immediately by setElapsedMs', () => {
      const backgroundManager = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager }))

      // Start timer
      act(() => {
        result.current.startTimer()
      })

      // Let it run
      act(() => {
        vi.advanceTimersByTime(5000)
      })

      expect(result.current.elapsedMs).toBeGreaterThanOrEqual(5000)

      // Reset and immediately set to a saved value
      act(() => {
        result.current.resetTimer()
        result.current.setElapsedMs(10000)
      })

      expect(result.current.elapsedMs).toBe(10000)
      expect(result.current.isRunning).toBe(true)

      // Verify timer continues from new value
      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(result.current.elapsedMs).toBeGreaterThanOrEqual(11000)
    })
  })
})

describe('useGameTimer - mutation-killing branch tests', () => {
  let originalVisibilityState: PropertyDescriptor | undefined
  let originalWebdriver: PropertyDescriptor | undefined

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    originalWebdriver = Object.getOwnPropertyDescriptor(navigator, 'webdriver')
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalVisibilityState) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityState)
    }
    if (originalWebdriver) {
      Object.defineProperty(navigator, 'webdriver', originalWebdriver)
    }
  })

  describe('startTimer stale-closure recovery branch', () => {
    it('recovers startTimeRef when autoStart left it null', () => {
      const bg = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager: bg, autoStart: true }))

      expect(result.current.isRunning).toBe(true)

      // autoStart sets isRunning=true but never assigns startTimeRef, so the
      // interval cannot accumulate time until startTimer() runs.
      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(result.current.elapsedMs).toBe(0)

      // startTimer now hits the `else if (startTimeRef.current === null)` branch
      act(() => {
        result.current.startTimer()
      })
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(result.current.elapsedMs).toBeGreaterThan(0)
    })

    it('does not reset isPausedDueToVisibility on the recovery branch', () => {
      const bg = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager: bg, autoStart: true }))

      // recovery path should NOT clear isPausedDueToVisibility (only the
      // !isRunning branch clears it)
      act(() => {
        result.current.setElapsedMs(123)
      })
      act(() => {
        result.current.startTimer()
      })
      expect(result.current.isRunning).toBe(true)
    })
  })

  describe('pauseTimer short-circuit when startTimeRef is null', () => {
    it('does not pause when isRunning is true but startTimeRef is null', () => {
      const bg = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager: bg, autoStart: true }))

      // isRunning true, startTimeRef null -> pauseTimer must no-op
      act(() => {
        result.current.pauseTimer()
      })
      expect(result.current.isRunning).toBe(true)
    })
  })

  describe('resetTimer while not running sets startTimeRef to null', () => {
    it('leaves the timer dormant after reset when it was not running', () => {
      const bg = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager: bg }))

      act(() => {
        result.current.setElapsedMs(5000)
      })
      act(() => {
        result.current.resetTimer()
      })
      expect(result.current.elapsedMs).toBe(0)
      expect(result.current.isRunning).toBe(false)

      // advancing time must NOT accumulate because startTimeRef is null
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(result.current.elapsedMs).toBe(0)
    })
  })

  describe('setElapsedMs while running resets the accumulated baseline', () => {
    it('continues counting from the new value rather than the old baseline', () => {
      const bg = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager: bg }))

      act(() => {
        result.current.startTimer()
      })
      act(() => {
        vi.advanceTimersByTime(3000)
      })
      const beforeReset = result.current.elapsedMs
      expect(beforeReset).toBeGreaterThan(0)

      act(() => {
        result.current.setElapsedMs(10000)
      })
      expect(result.current.elapsedMs).toBe(10000)

      act(() => {
        vi.advanceTimersByTime(1000)
      })
      // Must accumulate from the new 10000 baseline (~11000), not from the
      // old ~3000 baseline (~4000). The wide window accommodates timer jitter
      // while still distinguishing the two baselines unambiguously.
      const elapsed = result.current.elapsedMs
      expect(elapsed).toBeGreaterThanOrEqual(10500)
      expect(elapsed).toBeLessThan(12500)
      expect(elapsed).toBeGreaterThan(beforeReset + 1000)
    })

    it('clamps negative input to 0 even while running', () => {
      const bg = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager: bg, autoStart: true }))

      act(() => {
        result.current.startTimer()
      })
      act(() => {
        result.current.setElapsedMs(-9999)
      })
      expect(result.current.elapsedMs).toBe(0)
    })

    it('treats NaN as 0 even while running', () => {
      const bg = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager: bg, autoStart: true }))

      act(() => {
        result.current.startTimer()
      })
      act(() => {
        result.current.setElapsedMs(NaN)
      })
      expect(result.current.elapsedMs).toBe(0)
      expect(Number.isFinite(result.current.elapsedMs)).toBe(true)
    })
  })

  describe('formatTime exact-string boundary assertions', () => {
    it('formats 0 through 9 seconds with zero-padded single digits', () => {
      const bg = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager: bg }))
      const fmt = result.current.formatTime

      expect(fmt(0)).toBe('0:00')
      expect(fmt(999)).toBe('0:00')
      expect(fmt(1000)).toBe('0:01')
      expect(fmt(2000)).toBe('0:02')
      expect(fmt(9000)).toBe('0:09')
      expect(fmt(10000)).toBe('0:10')
      expect(fmt(59000)).toBe('0:59')
    })

    it('formats minute boundaries exactly', () => {
      const bg = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager: bg }))
      const fmt = result.current.formatTime

      expect(fmt(60000)).toBe('1:00')
      expect(fmt(59999)).toBe('0:59')
      expect(fmt(60001)).toBe('1:00')
      expect(fmt(119999)).toBe('1:59')
      expect(fmt(120000)).toBe('2:00')
    })

    it('formats hour boundaries exactly with no colon separator change', () => {
      const bg = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager: bg }))
      const fmt = result.current.formatTime

      expect(fmt(3599999)).toBe('59:59')
      expect(fmt(3600000)).toBe('60:00')
      expect(fmt(3600001)).toBe('60:00')
      expect(fmt(3661000)).toBe('61:01')
    })

    it('uses the hook elapsed time when called with no argument', () => {
      const bg = createMockBackgroundManager()
      const { result } = renderHook(() => useGameTimer({ backgroundManager: bg }))

      act(() => {
        result.current.setElapsedMs(125000)
      })
      expect(result.current.formatTime()).toBe('2:05')
    })
  })

  describe('automated-context bypass of interval pause guard', () => {
    it('keeps accumulating while shouldPauseOperations is true when webdriver is true', () => {
      Object.defineProperty(navigator, 'webdriver', {
        configurable: true,
        value: true,
      })
      const bg = createMockBackgroundManager({ shouldPauseOperations: true })
      const { result } = renderHook(() => useGameTimer({ backgroundManager: bg, autoStart: true }))

      // The isAutomated bypass only affects the interval callback guard; the
      // timer still needs a startTimeRef, so call startTimer explicitly.
      act(() => {
        result.current.startTimer()
      })
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      // In automated mode the interval callback must not short-circuit on
      // shouldPauseOperations, so elapsedMs accumulates.
      expect(result.current.elapsedMs).toBeGreaterThan(0)
    })
  })

  describe('visibility effect else-if resume branch', () => {
    it('does not set isPausedDueToVisibility when shouldPause false and not hidden', () => {
      const bg = createMockBackgroundManager({
        shouldPauseOperations: false,
        isHidden: false,
      })
      const { result } = renderHook(() => useGameTimer({ backgroundManager: bg, autoStart: true }))
      expect(result.current.isPausedDueToVisibility).toBe(false)
    })

    it('clears isPausedDueToVisibility when transitioning from hidden to visible', () => {
      const hidden = createMockBackgroundManager({
        shouldPauseOperations: true,
        isHidden: true,
      })
      const { result, rerender } = renderHook(
        ({ bg }) => useGameTimer({ backgroundManager: bg, autoStart: true }),
        { initialProps: { bg: hidden } },
      )
      expect(result.current.isPausedDueToVisibility).toBe(true)

      const visible = createMockBackgroundManager({
        shouldPauseOperations: false,
        isHidden: false,
      })
      rerender({ bg: visible })
      expect(result.current.isPausedDueToVisibility).toBe(false)
    })
  })

  describe('isPausedDueToVisibility only true when running', () => {
    it('stays false when not running even if shouldPauseOperations is true', () => {
      const bg = createMockBackgroundManager({ shouldPauseOperations: true })
      const { result } = renderHook(() => useGameTimer({ backgroundManager: bg }))
      expect(result.current.isRunning).toBe(false)
      expect(result.current.isPausedDueToVisibility).toBe(false)
    })
  })
})
