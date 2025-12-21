import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useBackgroundManager } from './useBackgroundManager'

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
 * Simulate pageshow event
 */
function simulatePageShow() {
  window.dispatchEvent(new Event('pageshow'))
}

/**
 * Simulate freeze event
 */
function simulateFreeze() {
  document.dispatchEvent(new Event('freeze'))
}

/**
 * Simulate resume event
 */
function simulateResume() {
  document.dispatchEvent(new Event('resume'))
}

/**
 * Simulate window blur
 */
function simulateWindowBlur() {
  window.dispatchEvent(new Event('blur'))
}

/**
 * Simulate window focus
 */
function simulateWindowFocus() {
  window.dispatchEvent(new Event('focus'))
}

// =============================================================================
// TESTS
// =============================================================================

describe('useBackgroundManager', () => {
  beforeEach(() => {
    mockVisibilityState = 'visible'
    
    // Mock document.visibilityState
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => mockVisibilityState,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================
  describe('Initial State', () => {
    it('starts with visible state when page is visible', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      expect(result.current.isHidden).toBe(false)
      expect(result.current.visibilityState).toBe('visible')
      expect(result.current.shouldPauseOperations).toBe(false)
      expect(result.current.isInDeepPause).toBe(false)
    })

    it('starts with hidden state when page is hidden', () => {
      mockVisibilityState = 'hidden'
      
      const { result } = renderHook(() => useBackgroundManager())
      
      expect(result.current.isHidden).toBe(true)
      expect(result.current.visibilityState).toBe('hidden')
      expect(result.current.shouldPauseOperations).toBe(true)
      expect(result.current.isInDeepPause).toBe(true)
    })

    it('returns forceResume and forcePause functions', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      expect(typeof result.current.forceResume).toBe('function')
      expect(typeof result.current.forcePause).toBe('function')
    })
  })

  // ===========================================================================
  // Enabled/Disabled Tests
  // ===========================================================================
  describe('Enabled Option', () => {
    it('does not pause operations when disabled', () => {
      mockVisibilityState = 'hidden'
      
      const { result } = renderHook(() => useBackgroundManager({ enabled: false }))
      
      expect(result.current.shouldPauseOperations).toBe(false)
    })

    it('pauses operations when enabled (default)', () => {
      mockVisibilityState = 'hidden'
      
      const { result } = renderHook(() => useBackgroundManager({ enabled: true }))
      
      expect(result.current.shouldPauseOperations).toBe(true)
    })

    it('does not set up event listeners when disabled', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
      
      renderHook(() => useBackgroundManager({ enabled: false }))
      
      expect(addEventListenerSpy).not.toHaveBeenCalledWith('visibilitychange', expect.any(Function))
      
      addEventListenerSpy.mockRestore()
    })
  })

  // ===========================================================================
  // Visibility Change Tests
  // ===========================================================================
  describe('Visibility Change', () => {
    it('updates state when page becomes hidden', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      expect(result.current.isHidden).toBe(false)
      
      act(() => {
        simulateVisibilityChange('hidden')
      })
      
      expect(result.current.isHidden).toBe(true)
      expect(result.current.visibilityState).toBe('hidden')
      expect(result.current.shouldPauseOperations).toBe(true)
      expect(result.current.isInDeepPause).toBe(true)
    })

    it('updates state when page becomes visible', () => {
      mockVisibilityState = 'hidden'
      const { result } = renderHook(() => useBackgroundManager())
      
      expect(result.current.isHidden).toBe(true)
      
      act(() => {
        simulateVisibilityChange('visible')
      })
      
      expect(result.current.isHidden).toBe(false)
      expect(result.current.visibilityState).toBe('visible')
      expect(result.current.shouldPauseOperations).toBe(false)
      expect(result.current.isInDeepPause).toBe(false)
    })

    it('clears forcePaused when page becomes visible', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      // Force pause
      act(() => {
        result.current.forcePause()
      })
      expect(result.current.shouldPauseOperations).toBe(true)
      
      // Page becomes hidden then visible
      act(() => {
        simulateVisibilityChange('hidden')
      })
      act(() => {
        simulateVisibilityChange('visible')
      })
      
      // Force pause should be cleared
      expect(result.current.shouldPauseOperations).toBe(false)
    })

    it('clears forceResumed when page becomes hidden', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      // Force resume (while visible - the typical use case)
      act(() => {
        result.current.forceResume()
      })
      // forceResumed is set but doesn't affect shouldPauseOperations when visible
      expect(result.current.shouldPauseOperations).toBe(false)
      
      // Now hide page - forceResumed should be cleared
      act(() => {
        simulateVisibilityChange('hidden')
      })
      
      // Force resume should be cleared, should pause now
      expect(result.current.shouldPauseOperations).toBe(true)
    })
  })

  // ===========================================================================
  // Pagehide/Pageshow Tests
  // ===========================================================================
  describe('Pagehide/Pageshow Events', () => {
    it('enters deep pause on pagehide', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      act(() => {
        simulatePageHide()
      })
      
      expect(result.current.isHidden).toBe(true)
      expect(result.current.visibilityState).toBe('hidden')
      expect(result.current.isInDeepPause).toBe(true)
      expect(result.current.shouldPauseOperations).toBe(true)
    })

    it('exits deep pause on pageshow', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      act(() => {
        simulatePageHide()
      })
      
      act(() => {
        simulatePageShow()
      })
      
      expect(result.current.isHidden).toBe(false)
      expect(result.current.visibilityState).toBe('visible')
      expect(result.current.isInDeepPause).toBe(false)
      expect(result.current.shouldPauseOperations).toBe(false)
    })
  })

  // ===========================================================================
  // Freeze/Resume Tests (Chrome/Android)
  // ===========================================================================
  describe('Freeze/Resume Events', () => {
    it('enters deep pause on freeze', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      act(() => {
        simulateFreeze()
      })
      
      expect(result.current.isHidden).toBe(true)
      expect(result.current.visibilityState).toBe('hidden')
      expect(result.current.isInDeepPause).toBe(true)
      expect(result.current.shouldPauseOperations).toBe(true)
    })

    it('exits deep pause on resume', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      act(() => {
        simulateFreeze()
      })
      
      act(() => {
        simulateResume()
      })
      
      expect(result.current.isHidden).toBe(false)
      expect(result.current.visibilityState).toBe('visible')
      expect(result.current.isInDeepPause).toBe(false)
      expect(result.current.shouldPauseOperations).toBe(false)
    })

    it('clears forcePaused on resume', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      // Force pause
      act(() => {
        result.current.forcePause()
      })
      expect(result.current.shouldPauseOperations).toBe(true)
      
      // Freeze then resume
      act(() => {
        simulateFreeze()
      })
      act(() => {
        simulateResume()
      })
      
      // Force pause should be cleared
      expect(result.current.shouldPauseOperations).toBe(false)
    })
  })

  // ===========================================================================
  // Window Blur/Focus Tests
  // ===========================================================================
  describe('Window Blur/Focus', () => {
    it('responds to window blur event', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      act(() => {
        simulateWindowBlur()
      })
      
      // The handler checks document.visibilityState, which we control
      // In a real scenario, blur might or might not change visibility
      // Here we just verify it doesn't crash
      expect(result.current).toBeDefined()
    })

    it('responds to window focus event', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      act(() => {
        simulateWindowFocus()
      })
      
      expect(result.current).toBeDefined()
    })
  })

  // ===========================================================================
  // Force Pause/Resume Tests
  // ===========================================================================
  describe('Force Pause/Resume', () => {
    it('forcePause sets shouldPauseOperations to true', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      expect(result.current.shouldPauseOperations).toBe(false)
      
      act(() => {
        result.current.forcePause()
      })
      
      expect(result.current.shouldPauseOperations).toBe(true)
    })

    it('forceResume affects shouldPauseOperations calculation', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      // Start visible, shouldPauseOperations is false
      expect(result.current.shouldPauseOperations).toBe(false)
      
      // Force resume while visible just sets the flag
      act(() => {
        result.current.forceResume()
      })
      
      // Still not pausing (was already not pausing)
      expect(result.current.shouldPauseOperations).toBe(false)
    })

    it('forcePause clears forceResumed state', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      // Force resume first (while visible)
      act(() => {
        result.current.forceResume()
      })
      expect(result.current.shouldPauseOperations).toBe(false)
      
      // Force pause should set pause state
      act(() => {
        result.current.forcePause()
      })
      expect(result.current.shouldPauseOperations).toBe(true)
    })

    it('forceResume clears forcePaused and deepPause', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      // Force pause while visible
      act(() => {
        result.current.forcePause()
      })
      expect(result.current.shouldPauseOperations).toBe(true)
      
      // Force resume should clear the pause state
      act(() => {
        result.current.forceResume()
      })
      expect(result.current.shouldPauseOperations).toBe(false)
      expect(result.current.isInDeepPause).toBe(false)
    })
  })

  // ===========================================================================
  // Cleanup Tests
  // ===========================================================================
  describe('Cleanup', () => {
    it('removes event listeners on unmount', () => {
      const docRemoveEventListenerSpy = vi.spyOn(document, 'removeEventListener')
      const winRemoveEventListenerSpy = vi.spyOn(window, 'removeEventListener')
      
      const { unmount } = renderHook(() => useBackgroundManager())
      
      unmount()
      
      expect(docRemoveEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
      expect(docRemoveEventListenerSpy).toHaveBeenCalledWith('freeze', expect.any(Function))
      expect(docRemoveEventListenerSpy).toHaveBeenCalledWith('resume', expect.any(Function))
      expect(winRemoveEventListenerSpy).toHaveBeenCalledWith('blur', expect.any(Function))
      expect(winRemoveEventListenerSpy).toHaveBeenCalledWith('focus', expect.any(Function))
      expect(winRemoveEventListenerSpy).toHaveBeenCalledWith('pagehide', expect.any(Function))
      expect(winRemoveEventListenerSpy).toHaveBeenCalledWith('pageshow', expect.any(Function))
      
      docRemoveEventListenerSpy.mockRestore()
      winRemoveEventListenerSpy.mockRestore()
    })
  })

  // ===========================================================================
  // Integration Tests
  // ===========================================================================
  describe('Integration Scenarios', () => {
    it('handles rapid visibility changes', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      // Rapid hide/show cycles
      for (let i = 0; i < 5; i++) {
        act(() => {
          simulateVisibilityChange('hidden')
        })
        expect(result.current.shouldPauseOperations).toBe(true)
        
        act(() => {
          simulateVisibilityChange('visible')
        })
        expect(result.current.shouldPauseOperations).toBe(false)
      }
    })

    it('handles mixed events (freeze + visibility)', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      // Freeze first
      act(() => {
        simulateFreeze()
      })
      expect(result.current.isInDeepPause).toBe(true)
      
      // Then resume
      act(() => {
        simulateResume()
      })
      expect(result.current.isInDeepPause).toBe(false)
      
      // Then visibility change
      act(() => {
        simulateVisibilityChange('hidden')
      })
      expect(result.current.isInDeepPause).toBe(true)
    })

    it('forceResume clears forcePaused state when visible', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      // Force pause first
      act(() => {
        result.current.forcePause()
      })
      expect(result.current.shouldPauseOperations).toBe(true)
      
      // Force resume should override
      act(() => {
        result.current.forceResume()
      })
      expect(result.current.shouldPauseOperations).toBe(false)
    })

    it('forcePause takes precedence over visibility visible', () => {
      const { result } = renderHook(() => useBackgroundManager())
      
      expect(result.current.shouldPauseOperations).toBe(false)
      
      // Force pause should override visible state
      act(() => {
        result.current.forcePause()
      })
      
      expect(result.current.shouldPauseOperations).toBe(true)
    })
  })
})
