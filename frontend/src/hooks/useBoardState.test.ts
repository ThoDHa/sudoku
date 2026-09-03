import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useBoardState } from './useBoardState'
import { TOTAL_CELLS } from '../lib/constants'

const zeros = () => new Array(TOTAL_CELLS).fill(0)

describe('useBoardState', () => {
  describe('lazy initialization from a partial (mixed) initial board', () => {
    // A board with SOME givens and SOME empties: distinguishes .some() from .every()
    // and distinguishes the "copy initialBoard" branch from the "default zeros" branch.
    const mixedBoard = () => {
      const b = zeros()
      b[0] = 5
      b[40] = 7
      return b
    }

    it('seeds givenCells from a mixed initial board (kills every()->some() and arrow mutants on L22)', () => {
      const initial = mixedBoard()
      const { result } = renderHook(() => useBoardState({ initialBoard: initial }))

      expect(result.current.givenCells).toEqual(initial)
      expect(result.current.givenCells[0]).toBe(5)
      expect(result.current.givenCells[40]).toBe(7)
      expect(result.current.givenCells[1]).toBe(0)
    })

    it('seeds board from a mixed initial board (L30 branch)', () => {
      const initial = mixedBoard()
      const { result } = renderHook(() => useBoardState({ initialBoard: initial }))

      expect(result.current.board).toEqual(initial)
    })
  })

  describe('lazy initialization from a fully-filled initial board', () => {
    // A board with NO empties: required to kill the `v === 0` equality mutant on the
    // .some() predicate, which is indistinguishable from the original on a mixed board.
    const fullBoard = () => {
      const solved = [
        5, 3, 4, 6, 7, 8, 9, 1, 2, 6, 7, 2, 1, 9, 5, 3, 4, 8, 1, 9, 8, 3, 4, 2, 5, 6, 7, 8, 5, 9, 7,
        6, 1, 4, 2, 3, 4, 2, 6, 8, 5, 3, 7, 9, 1, 7, 1, 3, 9, 2, 4, 8, 5, 6, 9, 6, 1, 5, 3, 7, 2, 8,
        4, 2, 8, 7, 4, 1, 9, 6, 3, 5, 3, 4, 5, 2, 8, 6, 1, 7, 9,
      ]
      return solved
    }

    it('seeds givenCells from a fully-filled board (kills v===0 mutant on L22/L30)', () => {
      const initial = fullBoard()
      const { result } = renderHook(() => useBoardState({ initialBoard: initial }))

      expect(result.current.givenCells).toEqual(initial)
      expect(result.current.board).toEqual(initial)
    })
  })

  describe('lazy initialization with a degenerate initial board', () => {
    it('falls back to the default zeros when the board is the wrong length (kills the true-conditional on L22/L30)', () => {
      const shortBoard = new Array(TOTAL_CELLS - 1).fill(0)
      shortBoard[0] = 5
      const { result } = renderHook(() => useBoardState({ initialBoard: shortBoard }))

      expect(result.current.givenCells).toHaveLength(TOTAL_CELLS)
      expect(result.current.givenCells.every((v) => v === 0)).toBe(true)
      expect(result.current.board).toHaveLength(TOTAL_CELLS)
    })

    it('falls back to the default zeros when the board is all empty (L22/L30 cond false)', () => {
      const { result } = renderHook(() => useBoardState({ initialBoard: zeros() }))

      expect(result.current.givenCells).toEqual(zeros())
      expect(result.current.board).toEqual(zeros())
    })
  })

  describe('setGivenCells effect on initialBoard change (L42 effect)', () => {
    it('re-seeds givenCells when initialBoard later becomes a non-zero board', () => {
      const initial = zeros()
      const { result, rerender } = renderHook(({ b }) => useBoardState({ initialBoard: b }), {
        initialProps: { b: initial },
      })

      const next = zeros()
      next[5] = 9
      rerender({ b: next })

      expect(result.current.givenCells).toEqual(next)
      expect(result.current.givenCells[5]).toBe(9)
    })

    it('does not re-seed givenCells when initialBoard changes to all-zeros', () => {
      const initial = zeros()
      initial[0] = 4
      const { result, rerender } = renderHook(({ b }) => useBoardState({ initialBoard: b }), {
        initialProps: { b: initial },
      })

      rerender({ b: zeros() })

      // The L42 effect guard rejects an all-zero board, so the original seed is retained.
      expect(result.current.givenCells[0]).toBe(4)
    })
  })

  describe('boardRef synchronization (L37 effect)', () => {
    it('keeps boardRef.current in sync after updateBoard (kills the deps[] and empty-block mutants)', () => {
      const { result } = renderHook(() => useBoardState({ initialBoard: zeros() }))
      const next = zeros()
      next[10] = 3

      act(() => result.current.updateBoard(next))

      // The ref-sync effect runs after the state update commits.
      expect(result.current.boardRef.current).toEqual(next)
    })

    it('keeps boardRef.current in sync after a direct setBoard call', () => {
      const { result } = renderHook(() => useBoardState({ initialBoard: zeros() }))
      const next = zeros()
      next[20] = 8

      act(() => result.current.setBoard(next))

      expect(result.current.boardRef.current).toEqual(next)
    })
  })

  describe('isGivenCell', () => {
    it('returns true for cells seeded as givens and false for empty cells', () => {
      const initial = zeros()
      initial[0] = 5
      initial[80] = 1
      const { result } = renderHook(() => useBoardState({ initialBoard: initial }))

      expect(result.current.isGivenCell(0)).toBe(true)
      expect(result.current.isGivenCell(80)).toBe(true)
      expect(result.current.isGivenCell(1)).toBe(false)
      expect(result.current.isGivenCell(40)).toBe(false)
    })

    it('reflects givenCells changes after setGivenCells', () => {
      const { result } = renderHook(() => useBoardState({ initialBoard: zeros() }))

      act(() => result.current.setGivenCells([...zeros(), ,] as number[]))

      const givens = zeros()
      givens[12] = 6
      act(() => result.current.setGivenCells(givens))

      expect(result.current.isGivenCell(12)).toBe(true)
      expect(result.current.isGivenCell(13)).toBe(false)
    })
  })

  describe('updateBoard', () => {
    it('replaces the board state', () => {
      const { result } = renderHook(() => useBoardState({ initialBoard: zeros() }))
      const next = zeros()
      next[0] = 1

      act(() => result.current.updateBoard(next))

      expect(result.current.board).toEqual(next)
    })
  })

  describe('short initial boards', () => {
    it('falls back to the 81-cell zero board when initialBoard is not 81 long', () => {
      // The length check keeps the board shape total; only the fallback branch gives 81 cells.
      const { result } = renderHook(() => useBoardState({ initialBoard: [1, 2, 3] }))

      expect(result.current.board).toHaveLength(TOTAL_CELLS)
      expect(result.current.board).toEqual(zeros())
      expect(result.current.givenCells).toEqual(zeros())
    })
  })
})
