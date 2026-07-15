import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useToastClearTimer } from './useToastClearTimer'

/**
 * Stand-in for the real useVisibilityAwareTimeout `setTimeout`: a plain
 * cancelable timeout. Injecting it lets us test the cancel-prior semantic in
 * isolation from the visibility/pagehide machinery (which has its own test).
 */
function makeVisibilitySetTimeout() {
  return (cb: () => void, delay: number) => {
    const id = window.setTimeout(cb, delay)
    return () => window.clearTimeout(id)
  }
}

describe('useToastClearTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('cancels the prior clearer when a new one is scheduled so the latest toast survives its full duration', () => {
    const { result } = renderHook(() => useToastClearTimer(makeVisibilitySetTimeout()))
    const clearA = vi.fn()
    const clearB = vi.fn()

    // Toast A: scheduled to clear after 3000ms.
    act(() => result.current(3000, clearA))

    // Toast B arrives 500ms later, inside A's window.
    act(() => vi.advanceTimersByTime(500))
    act(() => result.current(3000, clearB))

    // At A's original fire time (t=3000), A must NOT have fired: it was canceled.
    act(() => vi.advanceTimersByTime(2500))
    expect(clearA).not.toHaveBeenCalled()
    expect(clearB).not.toHaveBeenCalled()

    // At B's fire time (t=3500), only B's clearer fires.
    act(() => vi.advanceTimersByTime(500))
    expect(clearA).not.toHaveBeenCalled()
    expect(clearB).toHaveBeenCalledTimes(1)
  })

  it('fires the clearer after the delay when only one toast is scheduled', () => {
    const { result } = renderHook(() => useToastClearTimer(makeVisibilitySetTimeout()))
    const clear = vi.fn()

    act(() => result.current(2000, clear))

    act(() => vi.advanceTimersByTime(1999))
    expect(clear).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('allows scheduling a new clearer after the previous one fired naturally', () => {
    const { result } = renderHook(() => useToastClearTimer(makeVisibilitySetTimeout()))
    const clearA = vi.fn()
    const clearB = vi.fn()

    act(() => result.current(1000, clearA))
    act(() => vi.advanceTimersByTime(1000))
    expect(clearA).toHaveBeenCalledTimes(1)

    // No pending clearer; scheduling again must not throw and must fire normally.
    act(() => result.current(1000, clearB))
    act(() => vi.advanceTimersByTime(1000))
    expect(clearB).toHaveBeenCalledTimes(1)
  })

  it('cancels the pending clearer on unmount', () => {
    const { result, unmount } = renderHook(() => useToastClearTimer(makeVisibilitySetTimeout()))
    const clear = vi.fn()

    act(() => result.current(1000, clear))
    unmount()

    act(() => vi.advanceTimersByTime(2000))
    expect(clear).not.toHaveBeenCalled()
  })
})
// =============================================================================
// Mutation-killing tests added for cluster F4 retry (iteration 2).
// =============================================================================

describe('mutation-killing: scheduleToastClear uses the latest visibilitySetTimeout (L35 deps)', () => {
  it('routes through the latest visibilitySetTimeout after the prop changes', () => {
    const visibilitySetTimeout1 = vi.fn(() => () => undefined)
    const visibilitySetTimeout2 = vi.fn(() => () => undefined)
    const { result, rerender } = renderHook(({ vst }) => useToastClearTimer(vst), {
      initialProps: { vst: visibilitySetTimeout1 },
    })

    rerender({ vst: visibilitySetTimeout2 })
    act(() => {
      result.current(1000, () => undefined)
    })

    // Original deps [visibilitySetTimeout] captured the second. The [] mutant
    // captured the first.
    expect(visibilitySetTimeout2).toHaveBeenCalledTimes(1)
    expect(visibilitySetTimeout1).not.toHaveBeenCalled()
  })
})
