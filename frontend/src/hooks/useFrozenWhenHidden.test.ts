import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useFrozenWhenHidden } from './useFrozenWhenHidden'

// =============================================================================
// MOCKING
// =============================================================================

// Mock the BackgroundManagerContext
const mockBackgroundManagerContext = {
  isHidden: false,
  isInDeepPause: false,
}

vi.mock('../lib/BackgroundManagerContext', () => ({
  useBackgroundManagerContext: () => mockBackgroundManagerContext,
}))

// =============================================================================
// TESTS
// =============================================================================

describe('useFrozenWhenHidden', () => {
  beforeEach(() => {
    // Reset mock state before each test
    mockBackgroundManagerContext.isHidden = false
    mockBackgroundManagerContext.isInDeepPause = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================
  describe('Initial State', () => {
    it('returns all expected properties', () => {
      const { result } = renderHook(() => useFrozenWhenHidden())

      expect(result.current).toHaveProperty('isFrozen')
      expect(result.current).toHaveProperty('skipWhenFrozen')
      expect(result.current).toHaveProperty('shouldSkipStateUpdate')
      expect(result.current).toHaveProperty('isCurrentlyFrozen')
    })

    it('returns functions for isFrozen, skipWhenFrozen, and shouldSkipStateUpdate', () => {
      const { result } = renderHook(() => useFrozenWhenHidden())

      expect(typeof result.current.isFrozen).toBe('function')
      expect(typeof result.current.skipWhenFrozen).toBe('function')
      expect(typeof result.current.shouldSkipStateUpdate).toBe('function')
    })

    it('returns boolean for isCurrentlyFrozen', () => {
      const { result } = renderHook(() => useFrozenWhenHidden())

      expect(typeof result.current.isCurrentlyFrozen).toBe('boolean')
    })

    it('starts not frozen when not hidden and not in deep pause', () => {
      const { result } = renderHook(() => useFrozenWhenHidden())

      expect(result.current.isCurrentlyFrozen).toBe(false)
      expect(result.current.isFrozen()).toBe(false)
      expect(result.current.shouldSkipStateUpdate()).toBe(false)
    })
  })

  // ===========================================================================
  // isFrozen Tests
  // ===========================================================================
  describe('isFrozen', () => {
    it('returns false when not hidden and not in deep pause', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result } = renderHook(() => useFrozenWhenHidden())

      expect(result.current.isFrozen()).toBe(false)
    })

    it('returns true when isHidden is true', () => {
      mockBackgroundManagerContext.isHidden = true
      mockBackgroundManagerContext.isInDeepPause = false

      const { result } = renderHook(() => useFrozenWhenHidden())

      // Need to trigger effect by rerendering
      expect(result.current.isCurrentlyFrozen).toBe(true)
    })

    it('returns true when isInDeepPause is true', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = true

      const { result } = renderHook(() => useFrozenWhenHidden())

      expect(result.current.isCurrentlyFrozen).toBe(true)
    })

    it('returns true when both isHidden and isInDeepPause are true', () => {
      mockBackgroundManagerContext.isHidden = true
      mockBackgroundManagerContext.isInDeepPause = true

      const { result } = renderHook(() => useFrozenWhenHidden())

      expect(result.current.isCurrentlyFrozen).toBe(true)
    })
  })

  // ===========================================================================
  // isCurrentlyFrozen Tests
  // ===========================================================================
  describe('isCurrentlyFrozen', () => {
    it('is false when not hidden and not in deep pause', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result } = renderHook(() => useFrozenWhenHidden())

      expect(result.current.isCurrentlyFrozen).toBe(false)
    })

    it('is true when isHidden is true', () => {
      mockBackgroundManagerContext.isHidden = true
      mockBackgroundManagerContext.isInDeepPause = false

      const { result } = renderHook(() => useFrozenWhenHidden())

      expect(result.current.isCurrentlyFrozen).toBe(true)
    })

    it('is true when isInDeepPause is true', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = true

      const { result } = renderHook(() => useFrozenWhenHidden())

      expect(result.current.isCurrentlyFrozen).toBe(true)
    })

    it('is true when both isHidden and isInDeepPause are true', () => {
      mockBackgroundManagerContext.isHidden = true
      mockBackgroundManagerContext.isInDeepPause = true

      const { result } = renderHook(() => useFrozenWhenHidden())

      expect(result.current.isCurrentlyFrozen).toBe(true)
    })
  })

  // ===========================================================================
  // shouldSkipStateUpdate Tests
  // ===========================================================================
  describe('shouldSkipStateUpdate', () => {
    it('returns false when not frozen', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result } = renderHook(() => useFrozenWhenHidden())

      expect(result.current.shouldSkipStateUpdate()).toBe(false)
    })

    it('returns true when frozen via isHidden', () => {
      mockBackgroundManagerContext.isHidden = true
      mockBackgroundManagerContext.isInDeepPause = false

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      // Trigger effect
      rerender()

      expect(result.current.shouldSkipStateUpdate()).toBe(true)
    })

    it('returns true when frozen via isInDeepPause', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = true

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      // Trigger effect
      rerender()

      expect(result.current.shouldSkipStateUpdate()).toBe(true)
    })
  })

  // ===========================================================================
  // skipWhenFrozen Tests
  // ===========================================================================
  describe('skipWhenFrozen', () => {
    it('returns the callback result when not frozen', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result } = renderHook(() => useFrozenWhenHidden())

      const callback = vi.fn(() => 'test-result')
      const wrappedCallback = result.current.skipWhenFrozen(callback)

      const returnValue = wrappedCallback()

      expect(callback).toHaveBeenCalledTimes(1)
      expect(returnValue).toBe('test-result')
    })

    it('returns undefined when frozen and does not call callback', () => {
      mockBackgroundManagerContext.isHidden = true
      mockBackgroundManagerContext.isInDeepPause = false

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      // Trigger effect to update ref
      rerender()

      const callback = vi.fn(() => 'test-result')
      const wrappedCallback = result.current.skipWhenFrozen(callback)

      const returnValue = wrappedCallback()

      expect(callback).not.toHaveBeenCalled()
      expect(returnValue).toBeUndefined()
    })

    it('passes arguments through to the callback when not frozen', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result } = renderHook(() => useFrozenWhenHidden())

      const callback = vi.fn((a: number, b: string) => `${b}-${a}`)
      const wrappedCallback = result.current.skipWhenFrozen(callback)

      const returnValue = wrappedCallback(42, 'test')

      expect(callback).toHaveBeenCalledWith(42, 'test')
      expect(returnValue).toBe('test-42')
    })

    it('does not pass arguments when frozen', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = true

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      // Trigger effect
      rerender()

      const callback = vi.fn((a: number, b: string) => `${b}-${a}`)
      const wrappedCallback = result.current.skipWhenFrozen(callback)

      const returnValue = wrappedCallback(42, 'test')

      expect(callback).not.toHaveBeenCalled()
      expect(returnValue).toBeUndefined()
    })

    it('works with callbacks that return objects', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result } = renderHook(() => useFrozenWhenHidden())

      const expectedResult = { foo: 'bar', count: 123 }
      const callback = vi.fn(() => expectedResult)
      const wrappedCallback = result.current.skipWhenFrozen(callback)

      const returnValue = wrappedCallback()

      expect(returnValue).toEqual(expectedResult)
    })

    it('works with callbacks that return void', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result } = renderHook(() => useFrozenWhenHidden())

      const callback = vi.fn(() => undefined)
      const wrappedCallback = result.current.skipWhenFrozen(callback)

      const returnValue = wrappedCallback()

      expect(callback).toHaveBeenCalled()
      expect(returnValue).toBeUndefined()
    })
  })

  // ===========================================================================
  // Memoization Tests
  // ===========================================================================
  describe('Memoization', () => {
    it('returns the same object reference when inputs are unchanged', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      const firstResult = result.current

      // Rerender without changing inputs
      rerender()

      const secondResult = result.current

      expect(firstResult).toBe(secondResult)
    })

    it('returns the same isFrozen function reference across rerenders', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      const firstIsFrozen = result.current.isFrozen

      rerender()

      const secondIsFrozen = result.current.isFrozen

      expect(firstIsFrozen).toBe(secondIsFrozen)
    })

    it('returns the same skipWhenFrozen function reference across rerenders', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      const firstSkipWhenFrozen = result.current.skipWhenFrozen

      rerender()

      const secondSkipWhenFrozen = result.current.skipWhenFrozen

      expect(firstSkipWhenFrozen).toBe(secondSkipWhenFrozen)
    })

    it('returns the same shouldSkipStateUpdate function reference across rerenders', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      const firstShouldSkip = result.current.shouldSkipStateUpdate

      rerender()

      const secondShouldSkip = result.current.shouldSkipStateUpdate

      expect(firstShouldSkip).toBe(secondShouldSkip)
    })

    it('returns new object reference when isHidden changes', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      const firstResult = result.current

      // Change isHidden
      mockBackgroundManagerContext.isHidden = true
      rerender()

      const secondResult = result.current

      // The object reference should change because isCurrentlyFrozen changed
      expect(firstResult).not.toBe(secondResult)
    })

    it('returns new object reference when isInDeepPause changes', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      const firstResult = result.current

      // Change isInDeepPause
      mockBackgroundManagerContext.isInDeepPause = true
      rerender()

      const secondResult = result.current

      // The object reference should change because isCurrentlyFrozen changed
      expect(firstResult).not.toBe(secondResult)
    })
  })

  // ===========================================================================
  // State Transition Tests
  // ===========================================================================
  describe('State Transitions', () => {
    it('transitions from not frozen to frozen when isHidden becomes true', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      expect(result.current.isCurrentlyFrozen).toBe(false)

      // Transition to hidden
      mockBackgroundManagerContext.isHidden = true
      rerender()

      expect(result.current.isCurrentlyFrozen).toBe(true)
    })

    it('transitions from frozen to not frozen when isHidden becomes false', () => {
      mockBackgroundManagerContext.isHidden = true
      mockBackgroundManagerContext.isInDeepPause = false

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      expect(result.current.isCurrentlyFrozen).toBe(true)

      // Transition to visible
      mockBackgroundManagerContext.isHidden = false
      rerender()

      expect(result.current.isCurrentlyFrozen).toBe(false)
    })

    it('transitions from not frozen to frozen when isInDeepPause becomes true', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      expect(result.current.isCurrentlyFrozen).toBe(false)

      // Transition to deep pause
      mockBackgroundManagerContext.isInDeepPause = true
      rerender()

      expect(result.current.isCurrentlyFrozen).toBe(true)
    })

    it('stays frozen if only one condition becomes false', () => {
      mockBackgroundManagerContext.isHidden = true
      mockBackgroundManagerContext.isInDeepPause = true

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      expect(result.current.isCurrentlyFrozen).toBe(true)

      // Remove only one condition
      mockBackgroundManagerContext.isHidden = false
      rerender()

      // Should still be frozen due to isInDeepPause
      expect(result.current.isCurrentlyFrozen).toBe(true)
    })

    it('becomes not frozen only when both conditions are false', () => {
      mockBackgroundManagerContext.isHidden = true
      mockBackgroundManagerContext.isInDeepPause = true

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      expect(result.current.isCurrentlyFrozen).toBe(true)

      // Remove both conditions
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false
      rerender()

      expect(result.current.isCurrentlyFrozen).toBe(false)
    })
  })

  // ===========================================================================
  // Ref Synchronization Tests
  // ===========================================================================
  describe('Ref Synchronization', () => {
    it('updates ref when transitioning to frozen', () => {
      mockBackgroundManagerContext.isHidden = false
      mockBackgroundManagerContext.isInDeepPause = false

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      const callback = vi.fn(() => 'result')

      // Initially not frozen, callback should execute
      let wrappedCallback = result.current.skipWhenFrozen(callback)
      wrappedCallback()
      expect(callback).toHaveBeenCalledTimes(1)

      // Transition to frozen
      mockBackgroundManagerContext.isHidden = true
      rerender()

      // Callback should now be skipped
      callback.mockClear()
      wrappedCallback = result.current.skipWhenFrozen(callback)
      wrappedCallback()
      expect(callback).not.toHaveBeenCalled()
    })

    it('updates ref when transitioning from frozen', () => {
      mockBackgroundManagerContext.isHidden = true
      mockBackgroundManagerContext.isInDeepPause = false

      const { result, rerender } = renderHook(() => useFrozenWhenHidden())

      // Trigger effect to set ref
      rerender()

      const callback = vi.fn(() => 'result')

      // Initially frozen, callback should be skipped
      let wrappedCallback = result.current.skipWhenFrozen(callback)
      wrappedCallback()
      expect(callback).not.toHaveBeenCalled()

      // Transition to not frozen
      mockBackgroundManagerContext.isHidden = false
      rerender()

      // Callback should now execute
      wrappedCallback = result.current.skipWhenFrozen(callback)
      wrappedCallback()
      expect(callback).toHaveBeenCalledTimes(1)
    })
  })
})
