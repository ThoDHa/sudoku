import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useVisibilityAwareTimeout } from './useVisibilityAwareTimeout'

type HookResult = { current: ReturnType<typeof useVisibilityAwareTimeout> }

function actCancelAll(result: HookResult) {
  act(() => {
    result.current.cancelAll()
  })
}

function actSetTimeout(result: HookResult, a1: any, a2: any) {
  act(() => {
    result.current.setTimeout(a1, a2)
  })
}

// =============================================================================
// MOCKING UTILITIES
// =============================================================================

/**
 * Mock for document.visibilityState
 */
let mockVisibilityState: 'visible' | 'hidden' = 'visible'

/**
 * Simulate visibility change event
 */
function simulateVisibilityChange(state: 'visible' | 'hidden') {
  mockVisibilityState = state
  document.dispatchEvent(new Event('visibilitychange'))
}

/**
 * Simulate pagehide event
 */
function simulatePageHide() {
  window.dispatchEvent(new Event('pagehide'))
}

/**
 * Simulate freeze event
 */
function simulateFreeze() {
  document.dispatchEvent(new Event('freeze'))
}

// =============================================================================
// TESTS
// =============================================================================

describe('useVisibilityAwareTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockVisibilityState = 'visible'

    // Mock document.visibilityState
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => mockVisibilityState,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // Basic Functionality Tests
  // ===========================================================================
  describe('Basic Functionality', () => {
    it('returns setTimeout and cancelAll functions', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())

      expect(result.current.setTimeout).toBeDefined()
      expect(typeof result.current.setTimeout).toBe('function')
      expect(result.current.cancelAll).toBeDefined()
      expect(typeof result.current.cancelAll).toBe('function')
    })

    it('setTimeout triggers callback after delay', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      actSetTimeout(result, callback, 1000)

      expect(callback).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('setTimeout returns a cancel function', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      let cancel: () => void
      act(() => {
        cancel = result.current.setTimeout(callback, 1000)
      })

      expect(typeof cancel!).toBe('function')
    })

    it('cancel function prevents callback from firing', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      let cancel: () => void
      act(() => {
        cancel = result.current.setTimeout(callback, 1000)
      })

      act(() => {
        cancel!()
      })

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(callback).not.toHaveBeenCalled()
    })

    it('cancelAll cancels all active timeouts', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const callback3 = vi.fn()

      act(() => {
        result.current.setTimeout(callback1, 1000)
        result.current.setTimeout(callback2, 2000)
        result.current.setTimeout(callback3, 3000)
      })

      actCancelAll(result)

      act(() => {
        vi.advanceTimersByTime(5000)
      })

      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).not.toHaveBeenCalled()
      expect(callback3).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // Visibility Change Tests
  // ===========================================================================
  describe('Visibility Change Behavior', () => {
    it('cancels timeouts when page becomes hidden', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      actSetTimeout(result, callback, 1000)

      // Simulate page becoming hidden
      act(() => {
        simulateVisibilityChange('hidden')
      })

      // Advance time past the original timeout
      act(() => {
        vi.advanceTimersByTime(2000)
      })

      expect(callback).not.toHaveBeenCalled()
    })

    it('does not start timeout when page is already hidden', () => {
      // Start with page hidden
      mockVisibilityState = 'hidden'

      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      actSetTimeout(result, callback, 1000)

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      expect(callback).not.toHaveBeenCalled()
    })

    it('does not fire callback if page becomes hidden before timeout', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      actSetTimeout(result, callback, 1000)

      // Advance time partially
      act(() => {
        vi.advanceTimersByTime(500)
      })

      // Hide page
      act(() => {
        simulateVisibilityChange('hidden')
      })

      // Advance past original timeout
      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(callback).not.toHaveBeenCalled()
    })

    it('only fires callback if page is visible when timeout fires', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      actSetTimeout(result, callback, 1000)

      // Callback fires while visible
      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  // ===========================================================================
  // Pagehide Event Tests
  // ===========================================================================
  describe('Pagehide Event', () => {
    it('cancels timeouts on pagehide event', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      actSetTimeout(result, callback, 1000)

      act(() => {
        simulatePageHide()
      })

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      expect(callback).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // Freeze Event Tests (Chrome/Android)
  // ===========================================================================
  describe('Freeze Event', () => {
    it('cancels timeouts on freeze event', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      actSetTimeout(result, callback, 1000)

      act(() => {
        simulateFreeze()
      })

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      expect(callback).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // Multiple Timeout Management Tests
  // ===========================================================================
  describe('Multiple Timeout Management', () => {
    it('handles multiple concurrent timeouts', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      act(() => {
        result.current.setTimeout(callback1, 1000)
        result.current.setTimeout(callback2, 2000)
      })

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(callback2).toHaveBeenCalledTimes(1)
    })

    it('individual cancel only affects that timeout', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      let cancel1: () => void
      act(() => {
        cancel1 = result.current.setTimeout(callback1, 1000)
        result.current.setTimeout(callback2, 1000)
      })

      act(() => {
        cancel1!()
      })

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).toHaveBeenCalledTimes(1)
    })

    it('cancels all timeouts when visibility changes', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const callback3 = vi.fn()

      act(() => {
        result.current.setTimeout(callback1, 1000)
        result.current.setTimeout(callback2, 2000)
        result.current.setTimeout(callback3, 3000)
      })

      act(() => {
        simulateVisibilityChange('hidden')
      })

      act(() => {
        vi.advanceTimersByTime(5000)
      })

      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).not.toHaveBeenCalled()
      expect(callback3).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // Cleanup Tests
  // ===========================================================================
  describe('Cleanup', () => {
    it('cleans up timeouts on unmount', () => {
      const { result, unmount } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      actSetTimeout(result, callback, 1000)

      unmount()

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      expect(callback).not.toHaveBeenCalled()
    })

    it('removes event listeners on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
      const windowRemoveEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      const { unmount } = renderHook(() => useVisibilityAwareTimeout())

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
      expect(removeEventListenerSpy).toHaveBeenCalledWith('freeze', expect.any(Function))
      expect(windowRemoveEventListenerSpy).toHaveBeenCalledWith('pagehide', expect.any(Function))

      removeEventListenerSpy.mockRestore()
      windowRemoveEventListenerSpy.mockRestore()
    })
  })

  // ===========================================================================
  // Edge Cases Tests
  // ===========================================================================
  describe('Edge Cases', () => {
    it('handles zero delay timeout', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      actSetTimeout(result, callback, 0)

      act(() => {
        vi.advanceTimersByTime(0)
      })

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('calling cancel multiple times is safe', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      let cancel: () => void
      act(() => {
        cancel = result.current.setTimeout(callback, 1000)
      })

      // Cancel multiple times - should not throw
      act(() => {
        cancel!()
        cancel!()
        cancel!()
      })

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(callback).not.toHaveBeenCalled()
    })

    it('calling cancelAll when no timeouts is safe', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())

      // Should not throw
      actCancelAll(result)
    })

    it('setTimeout returns no-op cancel function when page is hidden', () => {
      mockVisibilityState = 'hidden'

      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      let cancel: () => void
      act(() => {
        cancel = result.current.setTimeout(callback, 1000)
      })

      // Should be a function that does nothing
      expect(typeof cancel!).toBe('function')

      // Calling it should not throw
      act(() => {
        cancel!()
      })
    })
  })

  describe('mutation-killing visibility-state assertions', () => {
    it('does not cancel timeouts when visibilitychange fires but page stays visible (L28:27, L32:11)', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      actSetTimeout(result, callback, 1000)

      // Dispatch visibilitychange while still visible: handler must read
      // visibilityState === 'hidden' as false, so no cancellation.
      act(() => {
        simulateVisibilityChange('visible')
      })

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('cancels pending timeout when hidden then re-shown before firing (L32:11, L32:24, L33:51)', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      actSetTimeout(result, callback, 1000)

      act(() => {
        vi.advanceTimersByTime(200)
      })
      // Hide: original clears the native timeout; mutants skipping the
      // cancellation block leave it pending.
      act(() => {
        simulateVisibilityChange('hidden')
      })
      // Show again before the 1000ms maturity: isHiddenRef flips back to
      // false, so a still-pending timeout would fire its callback.
      act(() => {
        simulateVisibilityChange('visible')
      })
      act(() => {
        vi.advanceTimersByTime(1000)
      })

      // Original cleared the timeout at hide-time; callback must stay dormant.
      expect(callback).not.toHaveBeenCalled()
    })

    it('does not schedule a new timeout after pagehide (L42:29)', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      act(() => {
        simulatePageHide()
      })

      actSetTimeout(result, callback, 1000)

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      // pagehide must leave isHiddenRef true so setTimeout early-returns.
      expect(callback).not.toHaveBeenCalled()
    })

    it('does not schedule a new timeout after freeze (L51:29)', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()

      act(() => {
        simulateFreeze()
      })

      actSetTimeout(result, callback, 1000)

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      // freeze must leave isHiddenRef true so setTimeout early-returns.
      expect(callback).not.toHaveBeenCalled()
    })
  })
})
// =============================================================================
// Mutation-killing tests added for cluster F4 retry (iteration 2).
// =============================================================================

describe('mutation-killing: hidden-event handlers actually clear pending timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockVisibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => mockVisibilityState,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('clears the pending timeout on pagehide so it cannot fire after re-show (L43 block)', () => {
    const { result } = renderHook(() => useVisibilityAwareTimeout())
    const callback = vi.fn()

    actSetTimeout(result, callback, 1000)

    // pagehide must clear the native timeout. The empty-block mutant leaves it
    // pending; isHiddenRef is later flipped back to visible, so the stale
    // timeout would fire its callback.
    act(() => {
      simulatePageHide()
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    simulateVisibilityChange('visible')
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(callback).not.toHaveBeenCalled()
  })

  it('clears the pending timeout on freeze so it cannot fire after re-show (L52 block)', () => {
    const { result } = renderHook(() => useVisibilityAwareTimeout())
    const callback = vi.fn()

    actSetTimeout(result, callback, 1000)

    act(() => {
      simulateFreeze()
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    simulateVisibilityChange('visible')
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(callback).not.toHaveBeenCalled()
  })
})

describe('mutation-killing: setTimeout no-ops when the page is already hidden (L78 guard)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => mockVisibilityState,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not schedule a hidden-state timeout that later fires after re-show', () => {
    // Start hidden so isHiddenRef is true at mount.
    mockVisibilityState = 'hidden'
    const { result } = renderHook(() => useVisibilityAwareTimeout())
    const callback = vi.fn()

    // Original returns a no-op canceler and schedules nothing. The force-false
    // / empty-block mutants schedule the timeout anyway; once the page becomes
    // visible again the pending timeout fires its callback.
    actSetTimeout(result, callback, 1000)

    mockVisibilityState = 'visible'
    simulateVisibilityChange('visible')
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(callback).not.toHaveBeenCalled()
  })
})
