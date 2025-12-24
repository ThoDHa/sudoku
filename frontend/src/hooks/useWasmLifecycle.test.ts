import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest'

// =============================================================================
// MOCKS
// =============================================================================

// Mock react-router-dom
let mockPathname = '/'
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPathname }),
}))

// Mock solver-service
const mockInitializeSolver = vi.fn().mockResolvedValue(undefined)
const mockCleanupSolver = vi.fn()

vi.mock('../lib/solver-service', () => ({
  initializeSolver: () => mockInitializeSolver(),
  cleanupSolver: () => mockCleanupSolver(),
}))

// Import after mocks are set up
import { useWasmLifecycle } from './useWasmLifecycle'

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Helper to change the mocked route and trigger re-render
 */
function setMockPathname(pathname: string) {
  mockPathname = pathname
}

// =============================================================================
// TESTS
// =============================================================================

describe('useWasmLifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockPathname = '/'
    // Reset window.location.pathname for the scheduleUnload double-check
    Object.defineProperty(window, 'location', {
      value: { pathname: '/' },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // INITIALIZATION TESTS
  // ===========================================================================
  describe('Initialization', () => {
    it('returns expected interface', () => {
      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle())

      expect(result.current).toHaveProperty('isWasmRoute')
      expect(result.current).toHaveProperty('loadWasm')
      expect(result.current).toHaveProperty('unloadWasm')
      expect(result.current).toHaveProperty('cancelUnload')
    })

    it('returns functions for loadWasm, unloadWasm, and cancelUnload', () => {
      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle())

      expect(typeof result.current.loadWasm).toBe('function')
      expect(typeof result.current.unloadWasm).toBe('function')
      expect(typeof result.current.cancelUnload).toBe('function')
    })

    it('returns boolean for isWasmRoute', () => {
      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle())

      expect(typeof result.current.isWasmRoute).toBe('boolean')
    })

    it('accepts optional configuration', () => {
      setMockPathname('/')
      const { result } = renderHook(() =>
        useWasmLifecycle({ unloadDelay: 5000, enableLogging: true })
      )

      expect(result.current).toBeDefined()
    })
  })

  // ===========================================================================
  // isWasmRoute DETECTION TESTS
  // ===========================================================================
  describe('isWasmRoute Detection', () => {
    it('returns false for homepage (/)', () => {
      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle())

      expect(result.current.isWasmRoute).toBe(false)
    })

    it('returns false for result page (/r)', () => {
      setMockPathname('/r')
      const { result } = renderHook(() => useWasmLifecycle())

      expect(result.current.isWasmRoute).toBe(false)
    })

    it('returns false for techniques page (/techniques)', () => {
      setMockPathname('/techniques')
      const { result } = renderHook(() => useWasmLifecycle())

      expect(result.current.isWasmRoute).toBe(false)
    })

    it('returns false for technique page (/technique)', () => {
      setMockPathname('/technique')
      const { result } = renderHook(() => useWasmLifecycle())

      expect(result.current.isWasmRoute).toBe(false)
    })

    it('returns false for technique subpath (/technique/naked-pairs)', () => {
      setMockPathname('/technique/naked-pairs')
      const { result } = renderHook(() => useWasmLifecycle())

      expect(result.current.isWasmRoute).toBe(false)
    })

    it('returns false for custom page (/custom)', () => {
      setMockPathname('/custom')
      const { result } = renderHook(() => useWasmLifecycle())

      expect(result.current.isWasmRoute).toBe(false)
    })

    it('returns false for leaderboard page (/leaderboard)', () => {
      setMockPathname('/leaderboard')
      const { result } = renderHook(() => useWasmLifecycle())

      expect(result.current.isWasmRoute).toBe(false)
    })

    it('returns true for game route with seed (/:seed)', () => {
      setMockPathname('/abc123')
      const { result } = renderHook(() => useWasmLifecycle())

      expect(result.current.isWasmRoute).toBe(true)
    })

    it('returns true for custom puzzle route (/c/:encoded)', () => {
      setMockPathname('/c/eyJwdXp6bGUiOiIxMjM0NTY3ODkifQ')
      const { result } = renderHook(() => useWasmLifecycle())

      expect(result.current.isWasmRoute).toBe(true)
    })

    it('returns true for numeric seed route', () => {
      setMockPathname('/12345')
      const { result } = renderHook(() => useWasmLifecycle())

      expect(result.current.isWasmRoute).toBe(true)
    })
  })

  // ===========================================================================
  // loadWasm BEHAVIOR TESTS
  // ===========================================================================
  describe('loadWasm Behavior', () => {
    it('calls initializeSolver when loadWasm is invoked', async () => {
      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle())

      await act(async () => {
        await result.current.loadWasm()
      })

      expect(mockInitializeSolver).toHaveBeenCalled()
    })

    it('handles initialization errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInitializeSolver.mockRejectedValueOnce(new Error('WASM load failed'))

      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle())

      await act(async () => {
        await result.current.loadWasm()
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[WasmLifecycle] Failed to initialize WASM solver:',
        expect.any(Error)
      )
      consoleErrorSpy.mockRestore()
    })

    it('logs success when enableLogging is true', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle({ enableLogging: true }))

      await act(async () => {
        await result.current.loadWasm()
      })

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WasmLifecycle] WASM loaded successfully')
      consoleWarnSpy.mockRestore()
    })
  })

  // ===========================================================================
  // unloadWasm BEHAVIOR TESTS
  // ===========================================================================
  describe('unloadWasm Behavior', () => {
    it('calls cleanupSolver when unloadWasm is invoked', async () => {
      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle())

      await act(async () => {
        await result.current.unloadWasm()
      })

      expect(mockCleanupSolver).toHaveBeenCalled()
    })

    it('handles cleanup errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockCleanupSolver.mockImplementationOnce(() => {
        throw new Error('Cleanup failed')
      })

      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle())

      await act(async () => {
        await result.current.unloadWasm()
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[WasmLifecycle] Error during WASM cleanup:',
        expect.any(Error)
      )
      consoleErrorSpy.mockRestore()
    })

    it('logs success when enableLogging is true', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle({ enableLogging: true }))

      await act(async () => {
        await result.current.unloadWasm()
      })

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WasmLifecycle] WASM unloaded - freed ~4MB memory')
      consoleWarnSpy.mockRestore()
    })
  })

  // ===========================================================================
  // cancelUnload BEHAVIOR TESTS
  // ===========================================================================
  describe('cancelUnload Behavior', () => {
    it('cancels a scheduled unload', async () => {
      // Start on a WASM route
      setMockPathname('/game123')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/game123'
      const { result, rerender } = renderHook(() => useWasmLifecycle())

      // Wait for WASM to load
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Navigate away to schedule unload
      setMockPathname('/')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/'
      rerender()

      // Cancel the unload before it fires
      act(() => {
        result.current.cancelUnload()
      })

      // Advance past the unload delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })

      // cleanupSolver should NOT have been called because we cancelled
      expect(mockCleanupSolver).not.toHaveBeenCalled()
    })

    it('logs cancellation when enableLogging is true', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Start on a WASM route
      setMockPathname('/game123')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/game123'
      const { result, rerender } = renderHook(() => useWasmLifecycle({ enableLogging: true }))

      // Wait for WASM to load
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Navigate away to schedule unload
      setMockPathname('/')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/'
      rerender()

      // Cancel the unload
      act(() => {
        result.current.cancelUnload()
      })

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WasmLifecycle] Cancelled scheduled WASM unload')
      consoleWarnSpy.mockRestore()
    })

    it('does nothing if no unload is scheduled', () => {
      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle())

      // Should not throw
      expect(() => {
        act(() => {
          result.current.cancelUnload()
        })
      }).not.toThrow()
    })
  })

  // ===========================================================================
  // ROUTE CHANGE EFFECTS TESTS
  // ===========================================================================
  describe('Route Change Effects', () => {
    it('loads WASM when entering a game route from homepage', async () => {
      // Start on homepage
      setMockPathname('/')
      const { rerender } = renderHook(() => useWasmLifecycle())

      expect(mockInitializeSolver).not.toHaveBeenCalled()

      // Navigate to game route
      setMockPathname('/game123')
      rerender()

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(mockInitializeSolver).toHaveBeenCalled()
    })

    it('schedules unload when leaving a game route', async () => {
      // Start on game route
      setMockPathname('/game123')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/game123'
      const { rerender } = renderHook(() => useWasmLifecycle({ unloadDelay: 2000 }))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      vi.clearAllMocks()

      // Navigate away
      setMockPathname('/')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/'
      rerender()

      // Should not unload immediately
      expect(mockCleanupSolver).not.toHaveBeenCalled()

      // Advance past the delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500)
      })

      expect(mockCleanupSolver).toHaveBeenCalled()
    })

    it('cancels scheduled unload when returning to game route', async () => {
      // Start on game route
      setMockPathname('/game123')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/game123'
      const { rerender } = renderHook(() => useWasmLifecycle({ unloadDelay: 2000 }))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      vi.clearAllMocks()

      // Navigate away (schedules unload)
      setMockPathname('/')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/'
      rerender()

      // Return to game route before unload fires
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000) // Half the delay
      })

      setMockPathname('/game456')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/game456'
      rerender()

      // Wait for remainder of original delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })

      // Cleanup should NOT have been called
      expect(mockCleanupSolver).not.toHaveBeenCalled()
    })

    it('does not load WASM when navigating between non-WASM routes', async () => {
      setMockPathname('/')
      const { rerender } = renderHook(() => useWasmLifecycle())

      // Navigate to another non-WASM route
      setMockPathname('/techniques')
      rerender()

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(mockInitializeSolver).not.toHaveBeenCalled()
    })

    it('does not unload WASM when navigating between WASM routes', async () => {
      setMockPathname('/game123')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/game123'
      const { rerender } = renderHook(() => useWasmLifecycle())

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      vi.clearAllMocks()

      // Navigate to another game route
      setMockPathname('/game456')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/game456'
      rerender()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })

      expect(mockCleanupSolver).not.toHaveBeenCalled()
    })

    it('loads WASM when entering custom puzzle route', async () => {
      setMockPathname('/')
      const { rerender } = renderHook(() => useWasmLifecycle())

      // Navigate to custom puzzle
      setMockPathname('/c/encoded-puzzle-data')
      rerender()

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(mockInitializeSolver).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // DELAYED UNLOAD TESTS
  // ===========================================================================
  describe('Delayed Unload', () => {
    it('uses default 2000ms delay', async () => {
      setMockPathname('/game123')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/game123'
      const { rerender } = renderHook(() => useWasmLifecycle())

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      vi.clearAllMocks()

      // Navigate away
      setMockPathname('/')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/'
      rerender()

      // At 1500ms, should not have unloaded
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500)
      })
      expect(mockCleanupSolver).not.toHaveBeenCalled()

      // At 2500ms, should have unloaded
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(mockCleanupSolver).toHaveBeenCalled()
    })

    it('uses custom unloadDelay from options', async () => {
      setMockPathname('/game123')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/game123'
      const { rerender } = renderHook(() => useWasmLifecycle({ unloadDelay: 5000 }))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      vi.clearAllMocks()

      // Navigate away
      setMockPathname('/')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/'
      rerender()

      // At 4000ms, should not have unloaded
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000)
      })
      expect(mockCleanupSolver).not.toHaveBeenCalled()

      // At 5500ms, should have unloaded
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500)
      })
      expect(mockCleanupSolver).toHaveBeenCalled()
    })

    it('does not unload if navigated back to WASM route during delay', async () => {
      setMockPathname('/game123')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/game123'
      const { rerender } = renderHook(() => useWasmLifecycle({ unloadDelay: 2000 }))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      vi.clearAllMocks()

      // Navigate away
      setMockPathname('/')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/'
      rerender()

      // Partway through delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })

      // Navigate back - this updates window.location.pathname
      setMockPathname('/game456')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/game456'
      rerender()

      // Complete the original delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })

      // Should NOT have unloaded because we're back on a WASM route
      expect(mockCleanupSolver).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // CLEANUP TESTS
  // ===========================================================================
  describe('Cleanup on Unmount', () => {
    it('clears pending timeout on unmount', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

      setMockPathname('/game123')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/game123'
      const { rerender, unmount } = renderHook(() => useWasmLifecycle())

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Navigate away to schedule unload
      setMockPathname('/')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/'
      rerender()

      // Unmount before the unload fires
      unmount()

      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })
  })

  // ===========================================================================
  // LOGGING TESTS
  // ===========================================================================
  describe('Logging', () => {
    it('does not log when enableLogging is false', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle({ enableLogging: false }))

      await act(async () => {
        await result.current.loadWasm()
      })

      expect(consoleWarnSpy).not.toHaveBeenCalled()
      consoleWarnSpy.mockRestore()
    })

    it('logs route entry when enableLogging is true', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      setMockPathname('/')
      const { rerender } = renderHook(() => useWasmLifecycle({ enableLogging: true }))

      // Navigate to game route
      setMockPathname('/game123')
      rerender()

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WasmLifecycle] Entering WASM route: /game123')
      consoleWarnSpy.mockRestore()
    })

    it('logs route exit when enableLogging is true', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      setMockPathname('/game123')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/game123'
      const { rerender } = renderHook(() => useWasmLifecycle({ enableLogging: true }))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Navigate away
      setMockPathname('/')
      rerender()

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WasmLifecycle] Leaving WASM route: /')
      consoleWarnSpy.mockRestore()
    })

    it('logs scheduled unload when enableLogging is true', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      setMockPathname('/game123')
      ;(window as unknown as { location: { pathname: string } }).location.pathname = '/game123'
      const { rerender } = renderHook(() => useWasmLifecycle({ enableLogging: true, unloadDelay: 3000 }))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Navigate away
      setMockPathname('/')
      rerender()

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WasmLifecycle] Scheduled WASM unload in 3000ms')
      consoleWarnSpy.mockRestore()
    })
  })
})
