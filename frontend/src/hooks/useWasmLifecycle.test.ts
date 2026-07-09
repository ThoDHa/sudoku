import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// MOCKS

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

// Mock logger
vi.mock('../lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
  enableDebug: vi.fn(),
  disableDebug: vi.fn(),
}))

// Import after mocks are set up
import { useWasmLifecycle } from './useWasmLifecycle'
import { logger } from '../lib/logger'

type HookResult = { current: ReturnType<typeof useWasmLifecycle> }

function actCancelUnload(result: HookResult) {
  act(() => {
    result.current.cancelUnload()
  })
}



// UTILITIES

/**
 * Helper to change the mocked route and trigger re-render
 */
function setMockPathname(pathname: string) {
  mockPathname = pathname
}

// Keep the mock pathname helper and the real window.location.pathname in sync.
function setPath(p: string) {
  setMockPathname(p)
  ;(window as unknown as { location: { pathname: string } }).location.pathname = p
}

// TESTS

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

  // INITIALIZATION TESTS
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
        useWasmLifecycle({ unloadDelay: 5000, enableLogging: true }),
      )

      expect(result.current).toBeDefined()
    })
  })

  // isWasmRoute DETECTION TESTS
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

  // loadWasm BEHAVIOR TESTS
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
      const consoleErrorSpy = logger.error
      vi.mocked(logger.error).mockClear()
      mockInitializeSolver.mockRejectedValueOnce(new Error('WASM load failed'))

      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle())

      await act(async () => {
        await result.current.loadWasm()
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[WasmLifecycle] Failed to initialize WASM solver:',
        expect.any(Error),
      )
      vi.mocked(logger.error).mockClear()
    })

    it('logs success when enableLogging is true', async () => {
      const loggerWarnSpy = logger.warn
      vi.mocked(logger.warn).mockClear()
      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle({ enableLogging: true }))

      await act(async () => {
        await result.current.loadWasm()
      })

      expect(loggerWarnSpy).toHaveBeenCalledWith('[WasmLifecycle] WASM loaded successfully')
      vi.mocked(logger.warn).mockClear()
    })
  })

  // unloadWasm BEHAVIOR TESTS
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
      const consoleErrorSpy = logger.error
      vi.mocked(logger.error).mockClear()
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
        expect.any(Error),
      )
      vi.mocked(logger.error).mockClear()
    })

    it('logs success when enableLogging is true', async () => {
      const loggerWarnSpy = logger.warn
      vi.mocked(logger.warn).mockClear()
      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle({ enableLogging: true }))

      await act(async () => {
        await result.current.unloadWasm()
      })

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        '[WasmLifecycle] WASM unloaded - freed ~4MB memory',
      )
      vi.mocked(logger.warn).mockClear()
    })
  })

  // cancelUnload BEHAVIOR TESTS
  describe('cancelUnload Behavior', () => {
    it('cancels a scheduled unload', async () => {
      // Start on a WASM route
      setPath('/game123')
      const { result, rerender } = renderHook(() => useWasmLifecycle())

      // Wait for WASM to load
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Navigate away to schedule unload
      setPath('/')
      rerender()

      // Cancel the unload before it fires
      actCancelUnload(result)

      // Advance past the unload delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })

      // cleanupSolver should NOT have been called because we cancelled
      expect(mockCleanupSolver).not.toHaveBeenCalled()
    })

    it('logs cancellation when enableLogging is true', async () => {
      const loggerWarnSpy = logger.warn
      vi.mocked(logger.warn).mockClear()

      // Start on a WASM route
      setPath('/game123')
      const { result, rerender } = renderHook(() => useWasmLifecycle({ enableLogging: true }))

      // Wait for WASM to load
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Navigate away to schedule unload
      setPath('/')
      rerender()

      // Cancel the unload
      actCancelUnload(result)

      expect(loggerWarnSpy).toHaveBeenCalledWith('[WasmLifecycle] Cancelled scheduled WASM unload')
      vi.mocked(logger.warn).mockClear()
    })

    it('does nothing if no unload is scheduled', () => {
      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle())

      // Should not throw
      expect(() => {
        actCancelUnload(result)
      }).not.toThrow()
    })
  })

  // ROUTE CHANGE EFFECTS TESTS
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
      setPath('/game123')
      const { rerender } = renderHook(() => useWasmLifecycle({ unloadDelay: 2000 }))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      vi.clearAllMocks()

      // Navigate away
      setPath('/')
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
      setPath('/game123')
      const { rerender } = renderHook(() => useWasmLifecycle({ unloadDelay: 2000 }))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      vi.clearAllMocks()

      // Navigate away (schedules unload)
      setPath('/')
      rerender()

      // Return to game route before unload fires
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000) // Half the delay
      })

      setPath('/game456')
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
      setPath('/game123')
      const { rerender } = renderHook(() => useWasmLifecycle())

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      vi.clearAllMocks()

      // Navigate to another game route
      setPath('/game456')
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

  // DELAYED UNLOAD TESTS
  describe('Delayed Unload', () => {
    it('uses default 2000ms delay', async () => {
      setPath('/game123')
      const { rerender } = renderHook(() => useWasmLifecycle())

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      vi.clearAllMocks()

      // Navigate away
      setPath('/')
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
      setPath('/game123')
      const { rerender } = renderHook(() => useWasmLifecycle({ unloadDelay: 5000 }))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      vi.clearAllMocks()

      // Navigate away
      setPath('/')
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
      setPath('/game123')
      const { rerender } = renderHook(() => useWasmLifecycle({ unloadDelay: 2000 }))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      vi.clearAllMocks()

      // Navigate away
      setPath('/')
      rerender()

      // Partway through delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })

      // Navigate back - this updates window.location.pathname
      setPath('/game456')
      rerender()

      // Complete the original delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })

      // Should NOT have unloaded because we're back on a WASM route
      expect(mockCleanupSolver).not.toHaveBeenCalled()
    })
  })

  // CLEANUP TESTS
  describe('Cleanup on Unmount', () => {
    it('clears pending timeout on unmount', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

      setPath('/game123')
      const { rerender, unmount } = renderHook(() => useWasmLifecycle())

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Navigate away to schedule unload
      setPath('/')
      rerender()

      // Unmount before the unload fires
      unmount()

      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })
  })

  // LOGGING TESTS
  describe('Logging', () => {
    it('does not log when enableLogging is false', async () => {
      const loggerWarnSpy = logger.warn
      vi.mocked(logger.warn).mockClear()

      setMockPathname('/')
      const { result } = renderHook(() => useWasmLifecycle({ enableLogging: false }))

      await act(async () => {
        await result.current.loadWasm()
      })

      expect(loggerWarnSpy).not.toHaveBeenCalled()
      vi.mocked(logger.warn).mockClear()
    })

    it('logs route entry when enableLogging is true', async () => {
      const loggerWarnSpy = logger.warn
      vi.mocked(logger.warn).mockClear()

      setMockPathname('/')
      const { rerender } = renderHook(() => useWasmLifecycle({ enableLogging: true }))

      // Navigate to game route
      setMockPathname('/game123')
      rerender()

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(loggerWarnSpy).toHaveBeenCalledWith('[WasmLifecycle] Entering WASM route: /game123')
      vi.mocked(logger.warn).mockClear()
    })

    it('logs route exit when enableLogging is true', async () => {
      const loggerWarnSpy = logger.warn
      vi.mocked(logger.warn).mockClear()

      setPath('/game123')
      const { rerender } = renderHook(() => useWasmLifecycle({ enableLogging: true }))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Navigate away
      setMockPathname('/')
      rerender()

      expect(loggerWarnSpy).toHaveBeenCalledWith('[WasmLifecycle] Leaving WASM route: /')
      vi.mocked(logger.warn).mockClear()
    })

    it('logs scheduled unload when enableLogging is true', async () => {
      const loggerWarnSpy = logger.warn
      vi.mocked(logger.warn).mockClear()

      setPath('/game123')
      const { rerender } = renderHook(() =>
        useWasmLifecycle({ enableLogging: true, unloadDelay: 3000 }),
      )

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Navigate away
      setMockPathname('/')
      rerender()

      expect(loggerWarnSpy).toHaveBeenCalledWith('[WasmLifecycle] Scheduled WASM unload in 3000ms')
      vi.mocked(logger.warn).mockClear()
    })
  })

  describe('mutation-kill targets', () => {
    it('does not log route-entry by default (enableLogging defaults to false)', async () => {
      const loggerWarnSpy = logger.warn
      vi.mocked(logger.warn).mockClear()

      setMockPathname('/')
      const { rerender } = renderHook(() => useWasmLifecycle())

      setMockPathname('/game123')
      rerender()

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(loggerWarnSpy).not.toHaveBeenCalled()
    })

    it('clears a pending unload timeout when scheduling a new one', async () => {
      setPath('/game123')
      const { rerender } = renderHook(() => useWasmLifecycle({ unloadDelay: 5000 }))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Navigate away (schedules first unload)
      setPath('/')
      rerender()

      // Navigate to another non-WASM route before timeout fires; scheduleUnload
      // is called again and must clear the previous pending timeout
      setPath('/techniques')
      rerender()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000)
      })

      // Cleanup happened (exactly once, not twice from a stale timeout)
      expect(mockCleanupSolver.mock.calls.length).toBeGreaterThanOrEqual(1)
    })

    it('reloads WASM when re-entering a game route after unload fires', async () => {
      setPath('/game1')
      const { rerender } = renderHook(() => useWasmLifecycle({ unloadDelay: 1000 }))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(mockInitializeSolver).toHaveBeenCalledTimes(1)

      // Leave and let unload fire
      setPath('/')
      rerender()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500)
      })

      expect(mockCleanupSolver).toHaveBeenCalled()

      // Re-enter a game route; should load again
      vi.clearAllMocks()
      setPath('/game2')
      rerender()

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(mockInitializeSolver).toHaveBeenCalled()
    })
  })

  describe('mutation-kill: callback dependency arrays', () => {
    it('picks up a changed enableLogging prop in log/loadWasm/unloadWasm/cancelUnload (L40,L63,L93,L102)', async () => {
      const loggerWarnSpy = logger.warn
      vi.mocked(loggerWarnSpy).mockClear()

      setMockPathname('/')

      // Mount with logging disabled; log captures enableLogging=false.
      const { result, rerender } = renderHook(
        ({ enableLogging }) => useWasmLifecycle({ enableLogging }),
        { initialProps: { enableLogging: false } },
      )

      // Flip the prop: under the original deps arrays, log (and every callback
      // that depends on it) must rebuild with enableLogging=true. The empty-deps
      // mutant keeps the stale false value, so the calls below stay silent.
      rerender({ enableLogging: true })

      await act(async () => {
        await result.current.loadWasm()
      })
      expect(loggerWarnSpy).toHaveBeenCalledWith('[WasmLifecycle] WASM loaded successfully')

      vi.mocked(loggerWarnSpy).mockClear()
      await act(async () => {
        await result.current.unloadWasm()
      })
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        '[WasmLifecycle] WASM unloaded - freed ~4MB memory',
      )

      vi.mocked(loggerWarnSpy).mockClear()
      // cancelUnload only logs when a timeout is pending, so schedule one first
      setPath('/game1')
      rerender({ enableLogging: true })
      await act(async () => {
        await vi.runAllTimersAsync()
      })
      setPath('/')
      rerender({ enableLogging: true })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      // Now a timeout is pending; cancel it and observe the log
      actCancelUnload(result)
      // The mutant would keep enableLogging=false and skip this log
      expect(loggerWarnSpy).toHaveBeenCalledWith('[WasmLifecycle] Cancelled scheduled WASM unload')
    })

    it('picks up a changed unloadDelay in scheduleUnload (L84)', async () => {
      const loggerWarnSpy = logger.warn
      vi.mocked(loggerWarnSpy).mockClear()

      setPath('/game1')
      const { rerender } = renderHook(
        ({ unloadDelay }) => useWasmLifecycle({ unloadDelay, enableLogging: true }),
        { initialProps: { unloadDelay: 2000 } },
      )

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Flip unloadDelay: scheduleUnload must rebuild and use the new value.
      rerender({ unloadDelay: 5000 })

      // Navigate away to trigger scheduleUnload
      setPath('/')
      rerender({ unloadDelay: 5000 })

      // The empty-deps mutant would log the stale "2000ms" message.
      expect(loggerWarnSpy).toHaveBeenCalledWith('[WasmLifecycle] Scheduled WASM unload in 5000ms')
    })

    it('does not schedule an unload when navigating between two WASM routes (L114)', async () => {
      const loggerWarnSpy = logger.warn
      vi.mocked(loggerWarnSpy).mockClear()

      setPath('/game1')
      const { rerender } = renderHook(() =>
        useWasmLifecycle({ enableLogging: true, unloadDelay: 500 }),
      )

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      vi.mocked(loggerWarnSpy).mockClear()

      // Navigate WASM -> WASM. The original skips the else-if; the `true`/`||`
      // mutants enter it and call scheduleUnload, which logs the schedule message.
      setPath('/game2')
      rerender()

      // Advance past the unload delay to let any (mutant-spawned) timer fire its log.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })

      expect(loggerWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Scheduled WASM unload'),
      )
    })
  })
})
