import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useCompletion } from './useCompletion'
import { createCompletePuzzle, createEmptyPuzzle } from '../test-utils'

describe('useCompletion', () => {
  it('starts with isComplete=false', () => {
    const { result } = renderHook(() => useCompletion({}))
    expect(result.current.isComplete).toBe(false)
  })

  it('sets isComplete=true and fires onComplete for a full valid board', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useCompletion({ onComplete }))
    act(() => {
      result.current.checkCompletion(createCompletePuzzle())
    })
    expect(result.current.isComplete).toBe(true)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('keeps isComplete=false for a partially-filled board and does not fire onComplete', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useCompletion({ onComplete }))
    const partial = createEmptyPuzzle()
    partial[0] = 5
    act(() => {
      result.current.checkCompletion(partial)
    })
    expect(result.current.isComplete).toBe(false)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('keeps isComplete=false for a full but invalid board', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useCompletion({ onComplete }))
    act(() => {
      result.current.checkCompletion(Array(81).fill(1))
    })
    expect(result.current.isComplete).toBe(false)
    expect(onComplete).not.toHaveBeenCalled()
  })

  // Guards the else-branch: after a completion, an incomplete board MUST reset
  // isComplete back to false.
  it('resets isComplete to false when a complete board becomes incomplete', () => {
    const { result } = renderHook(() => useCompletion({ onComplete: vi.fn() }))
    act(() => {
      result.current.checkCompletion(createCompletePuzzle())
    })
    expect(result.current.isComplete).toBe(true)
    const partial = createCompletePuzzle()
    partial[0] = 0
    act(() => {
      result.current.checkCompletion(partial)
    })
    expect(result.current.isComplete).toBe(false)
  })

  // Guards the onCompleteRef sync effect + its dependency array: the hook must
  // invoke the LATEST onComplete after the prop changes, not the initial one.
  it('invokes the latest onComplete after the callback prop changes', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderHook(({ cb }) => useCompletion({ onComplete: cb }), {
      initialProps: { cb: first },
    })
    rerender({ cb: second })
    act(() => {
      result.current.checkCompletion(createCompletePuzzle())
    })
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('does not throw when onComplete is omitted and the board is solved', () => {
    const { result } = renderHook(() => useCompletion({}))
    expect(() => {
      act(() => {
        result.current.checkCompletion(createCompletePuzzle())
      })
    }).not.toThrow()
  })

  it('setIsComplete allows manual override of the flag in both directions', () => {
    const { result } = renderHook(() => useCompletion({}))
    act(() => {
      result.current.setIsComplete(true)
    })
    expect(result.current.isComplete).toBe(true)
    act(() => {
      result.current.setIsComplete(false)
    })
    expect(result.current.isComplete).toBe(false)
  })
})
