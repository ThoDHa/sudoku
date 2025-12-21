import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useVisibilityAwareTimeout } from './useVisibilityAwareTimeout'

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
      
      act(() => {
        result.current.setTimeout(callback, 1000)
      })
      
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
      
      act(() => {
        result.current.cancelAll()
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
  // Visibility Change Tests
  // ===========================================================================
  describe('Visibility Change Behavior', () => {
    it('cancels timeouts when page becomes hidden', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()
      
      act(() => {
        result.current.setTimeout(callback, 1000)
      })
      
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
      
      act(() => {
        result.current.setTimeout(callback, 1000)
      })
      
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      
      expect(callback).not.toHaveBeenCalled()
    })

    it('does not fire callback if page becomes hidden before timeout', () => {
      const { result } = renderHook(() => useVisibilityAwareTimeout())
      const callback = vi.fn()
      
      act(() => {
        result.current.setTimeout(callback, 1000)
      })
      
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
      
      act(() => {
        result.current.setTimeout(callback, 1000)
      })
      
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
      
      act(() => {
        result.current.setTimeout(callback, 1000)
      })
      
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
      
      act(() => {
        result.current.setTimeout(callback, 1000)
      })
      
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
      
      act(() => {
        result.current.setTimeout(callback, 1000)
      })
      
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
      
      act(() => {
        result.current.setTimeout(callback, 0)
      })
      
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
      act(() => {
        result.current.cancelAll()
      })
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
})
