import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useBackgroundManager } from './useBackgroundManager'

type HookResult = { current: ReturnType<typeof useBackgroundManager> }

function actForcePause(result: HookResult) {
  act(() => {
    result.current.forcePause()
  })
}

function actForceResume(result: HookResult) {
  act(() => {
    result.current.forceResume()
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

    it('reports visibilityState as visible when disabled, even if the document is hidden', () => {
      mockVisibilityState = 'hidden'

      const { result } = renderHook(() => useBackgroundManager({ enabled: false }))

      // A disabled manager ignores the real document state and falls back to
      // the literal 'visible'. Mutants that corrupt that fallback string leak
      // a bogus visibility value to consumers.
      expect(result.current.visibilityState).toBe('visible')
      expect(result.current.isHidden).toBe(false)
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
      actForcePause(result)
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
      actForceResume(result)
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
      actForcePause(result)
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

      actForcePause(result)

      expect(result.current.shouldPauseOperations).toBe(true)
    })

    it('forceResume affects shouldPauseOperations calculation', () => {
      const { result } = renderHook(() => useBackgroundManager())

      // Start visible, shouldPauseOperations is false
      expect(result.current.shouldPauseOperations).toBe(false)

      // Force resume while visible just sets the flag
      actForceResume(result)

      // Still not pausing (was already not pausing)
      expect(result.current.shouldPauseOperations).toBe(false)
    })

    it('forcePause clears forceResumed state', () => {
      const { result } = renderHook(() => useBackgroundManager())

      // Force resume first (while visible)
      actForceResume(result)
      expect(result.current.shouldPauseOperations).toBe(false)

      // Force pause should set pause state
      actForcePause(result)
      expect(result.current.shouldPauseOperations).toBe(true)
    })

    it('forceResume clears forcePaused and deepPause', () => {
      const { result } = renderHook(() => useBackgroundManager())

      // Force pause while visible
      actForcePause(result)
      expect(result.current.shouldPauseOperations).toBe(true)

      // Force resume should clear the pause state
      actForceResume(result)
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

      expect(docRemoveEventListenerSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function),
      )
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
      actForcePause(result)
      expect(result.current.shouldPauseOperations).toBe(true)

      // Force resume should override
      actForceResume(result)
      expect(result.current.shouldPauseOperations).toBe(false)
    })

    it('forcePause takes precedence over visibility visible', () => {
      const { result } = renderHook(() => useBackgroundManager())

      expect(result.current.shouldPauseOperations).toBe(false)

      // Force pause should override visible state
      actForcePause(result)

      expect(result.current.shouldPauseOperations).toBe(true)
    })
  })

  // ===========================================================================
  // Mutation-killing: automation detection bypass
  // ===========================================================================
  describe('Automation detection bypass', () => {
    afterEach(() => {
      // userAgent and webdriver live on Navigator.prototype in jsdom, so
      // our defineProperty created an own-property shadow. Deleting it lets
      // the prototype's original value show through again.
      // @ts-expect-error - removing test-only own-property override
      delete navigator.userAgent
      // @ts-expect-error - removing test-only own-property override
      delete navigator.webdriver
    })

    function setUserAgent(ua: string) {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua })
    }

    it('does not pause when HeadlessChrome user agent is detected, even if hidden', () => {
      setUserAgent('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0')
      const { result } = renderHook(() => useBackgroundManager())

      act(() => {
        simulateVisibilityChange('hidden')
      })

      // Automation detection must keep shouldPauseOperations false so E2E
      // tests keep running. Mutants that break the detection, or that drop
      // the !automated guard, flip this to true.
      expect(result.current.shouldPauseOperations).toBe(false)
    })

    it('does not pause when playwright user agent is detected, even if hidden', () => {
      setUserAgent('Mozilla/5.0 ... playwright/1.40.0')
      const { result } = renderHook(() => useBackgroundManager())

      act(() => {
        simulateVisibilityChange('hidden')
      })

      expect(result.current.shouldPauseOperations).toBe(false)
    })

    it('does not pause when navigator.webdriver is true, even if hidden (webdriver detection)', () => {
      Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true })
      const { result } = renderHook(() => useBackgroundManager())

      act(() => {
        simulateVisibilityChange('hidden')
      })

      expect(result.current.shouldPauseOperations).toBe(false)
    })
  })

  // ===========================================================================
  // Mutation-killing: window blur / focus drive shouldPauseOperations
  // ===========================================================================
  describe('Window blur drives shouldPauseOperations', () => {
    it('sets shouldPauseOperations true on window blur', () => {
      const { result } = renderHook(() => useBackgroundManager())

      expect(result.current.shouldPauseOperations).toBe(false)

      act(() => {
        simulateWindowBlur()
      })

      // isWindowBlurred feeds shouldPauseOperations; mutants that drop the
      // term, skip the setter, or register the wrong event name all leave
      // shouldPauseOperations false here.
      expect(result.current.shouldPauseOperations).toBe(true)
    })

    it('clears shouldPauseOperations on window focus after blur', () => {
      const { result } = renderHook(() => useBackgroundManager())

      act(() => {
        simulateWindowBlur()
      })
      expect(result.current.shouldPauseOperations).toBe(true)

      act(() => {
        simulateWindowFocus()
      })

      // Focus must clear the blur flag; mutants that skip the handler body
      // or register the wrong event name keep shouldPauseOperations true.
      expect(result.current.shouldPauseOperations).toBe(false)
    })
  })

  // ===========================================================================
  // Mutation-killing: enabled gates every effect
  // ===========================================================================
  describe('enabled gates background event effects', () => {
    it('does not react to pagehide when disabled', () => {
      const { result } = renderHook(() => useBackgroundManager({ enabled: false }))

      act(() => {
        simulatePageHide()
      })

      expect(result.current.isHidden).toBe(false)
      expect(result.current.isInDeepPause).toBe(false)
    })

    it('does not react to freeze when disabled', () => {
      const { result } = renderHook(() => useBackgroundManager({ enabled: false }))

      act(() => {
        simulateFreeze()
      })

      expect(result.current.isHidden).toBe(false)
      expect(result.current.isInDeepPause).toBe(false)
    })

    it('does not react to beforeunload when disabled', () => {
      const { result } = renderHook(() => useBackgroundManager({ enabled: false }))

      act(() => {
        window.dispatchEvent(new Event('beforeunload'))
      })

      expect(result.current.isHidden).toBe(false)
    })

    it('reacts to beforeunload when enabled', () => {
      const { result } = renderHook(() => useBackgroundManager({ enabled: true }))

      act(() => {
        window.dispatchEvent(new Event('beforeunload'))
      })

      expect(result.current.isHidden).toBe(true)
      expect(result.current.visibilityState).toBe('hidden')
    })
  })

  // ===========================================================================
  // Mutation-killing: effect deps re-subscribe on enabled flip
  // ===========================================================================
  describe('enabled-flip re-subscribes event listeners', () => {
    it('re-runs visibility listener setup when enabled flips true', () => {
      const { result, rerender } = renderHook(({ enabled }) => useBackgroundManager({ enabled }), {
        initialProps: { enabled: false },
      })

      rerender({ enabled: true })

      act(() => {
        simulateVisibilityChange('hidden')
      })

      expect(result.current.isHidden).toBe(true)
    })

    it('re-runs pagehide listener setup when enabled flips true', () => {
      const { result, rerender } = renderHook(({ enabled }) => useBackgroundManager({ enabled }), {
        initialProps: { enabled: false },
      })

      rerender({ enabled: true })

      act(() => {
        simulatePageHide()
      })

      expect(result.current.isHidden).toBe(true)
    })

    it('re-runs freeze listener setup when enabled flips true', () => {
      const { result, rerender } = renderHook(({ enabled }) => useBackgroundManager({ enabled }), {
        initialProps: { enabled: false },
      })

      rerender({ enabled: true })

      act(() => {
        simulateFreeze()
      })

      expect(result.current.isHidden).toBe(true)
    })
  })

  // ===========================================================================
  // Mutation-killing: beforeunload cleanup
  // ===========================================================================
  describe('beforeunload cleanup', () => {
    it('removes the beforeunload listener on unmount', () => {
      const winRemoveEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      const { unmount } = renderHook(() => useBackgroundManager())
      unmount()

      expect(winRemoveEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))

      winRemoveEventListenerSpy.mockRestore()
    })
  })
})

describe('useBackgroundManager - enabled-dependency re-subscription (mutation coverage)', () => {
  it('subscribes the beforeunload handler after enabled flips false -> true', () => {
    const { result, rerender } = renderHook(
      (props: { enabled: boolean }) => useBackgroundManager(props),
      { initialProps: { enabled: false } },
    )

    // Mounted disabled: the beforeunload effect returned early, so nothing is subscribed.
    expect(result.current.isHidden).toBe(false)

    // Enabling must re-run the effect (its deps track `enabled`). If the deps array is
    // dropped to [], the effect never re-runs and no beforeunload listener is registered.
    rerender({ enabled: true })

    act(() => {
      window.dispatchEvent(new Event('beforeunload'))
    })

    expect(result.current.isHidden).toBe(true)
  })
})
