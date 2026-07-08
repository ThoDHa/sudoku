import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useBoardValidation } from './useBoardValidation'

const SOLVED = [
  5, 3, 4, 6, 7, 8, 9, 1, 2, 6, 7, 2, 1, 9, 5, 3, 4, 8, 1, 9, 8, 3, 4, 2, 5, 6, 7, 8, 5, 9, 7, 6,
  1, 4, 2, 3, 4, 2, 6, 8, 5, 3, 7, 9, 1, 7, 1, 3, 9, 2, 4, 8, 5, 6, 9, 6, 1, 5, 3, 7, 2, 8, 4, 2,
  8, 7, 4, 1, 9, 6, 3, 5, 3, 4, 5, 2, 8, 6, 1, 7, 9,
]

describe('useBoardValidation', () => {
  it('marks the game complete when the board is fully filled and a valid solution', () => {
    const setIsComplete = vi.fn()
    const { result } = renderHook(() => useBoardValidation({ setIsComplete }))

    act(() => result.current.checkCompletion(SOLVED))

    expect(setIsComplete).toHaveBeenCalledWith(true)
    expect(setIsComplete).toHaveBeenCalledTimes(1)
  })

  it('marks the game incomplete when the board still has empty cells', () => {
    const setIsComplete = vi.fn()
    const { result } = renderHook(() => useBoardValidation({ setIsComplete }))
    const incomplete = [...SOLVED]
    incomplete[0] = 0

    act(() => result.current.checkCompletion(incomplete))

    expect(setIsComplete).toHaveBeenCalledWith(false)
  })

  it('marks the game incomplete when the board is full but contains a duplicate', () => {
    const setIsComplete = vi.fn()
    const { result } = renderHook(() => useBoardValidation({ setIsComplete }))
    const invalid = [...SOLVED]
    invalid[1] = invalid[0]!

    act(() => result.current.checkCompletion(invalid))

    expect(setIsComplete).toHaveBeenCalledWith(false)
  })

  it('marks the game incomplete for an all-zeros board', () => {
    const setIsComplete = vi.fn()
    const { result } = renderHook(() => useBoardValidation({ setIsComplete }))

    act(() => result.current.checkCompletion(new Array(81).fill(0)))

    expect(setIsComplete).toHaveBeenCalledWith(false)
  })

  it('exposes isValidSolution on the returned API and matches validationUtils', () => {
    const { result } = renderHook(() => useBoardValidation({ setIsComplete: vi.fn() }))

    expect(result.current.isValidSolution(SOLVED)).toBe(true)
    expect(result.current.isValidSolution(new Array(81).fill(0))).toBe(false)
  })

  it('returns a stable checkCompletion that depends on setIsComplete', () => {
    const setIsComplete = vi.fn()
    const { result, rerender } = renderHook(({ cb }) => useBoardValidation({ setIsComplete: cb }), {
      initialProps: { cb: setIsComplete },
    })
    const first = result.current.checkCompletion
    rerender({ cb: setIsComplete })
    expect(result.current.checkCompletion).toBe(first)
  })
})
// =============================================================================
// Mutation-killing tests added for cluster F4 retry (iteration 2).
// =============================================================================

describe('mutation-killing: checkCompletion uses the latest setIsComplete (L26 deps)', () => {
  it('invokes the latest setIsComplete after the prop changes', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderHook(
      ({ cb }) => useBoardValidation({ setIsComplete: cb }),
      { initialProps: { cb: first } },
    )

    rerender({ cb: second })
    act(() => {
      result.current.checkCompletion(SOLVED)
    })

    // Original deps [setIsComplete] captured second. The [] mutant captured first.
    expect(second).toHaveBeenCalledWith(true)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })
})
