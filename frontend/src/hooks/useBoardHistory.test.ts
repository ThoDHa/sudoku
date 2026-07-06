import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useBoardHistory, type Move } from './useBoardHistory'
import { MAX_MOVE_HISTORY } from '../lib/constants'
import type { StateDiff } from '../lib/diffUtils'

function makeMove(overrides: Partial<Move> = {}): Move {
  return {
    step_index: 0,
    technique: 'Naked Single',
    action: 'assign',
    digit: 1,
    targets: [{ row: 0, col: 0 }],
    explanation: 'test',
    refs: { title: 't', slug: 's', url: 'u' },
    highlights: { primary: [{ row: 0, col: 0 }] },
    ...overrides,
  }
}

const STATE_DIFF: StateDiff = {
  boardChanges: [{ idx: 0, oldValue: 0, newValue: 5 }],
  candidateChanges: [{ idx: 1, oldMask: 0, newMask: 2 }],
}

describe('useBoardHistory', () => {
  describe('limitHistory', () => {
    it('returns the history unchanged when at or below the cap (kills <= -> < mutant)', () => {
      const { result } = renderHook(() =>
        useBoardHistory({
          setBoard: vi.fn(),
          setCandidates: vi.fn(),
          boardRef: { current: [] },
          candidatesRef: { current: new Uint16Array() },
        }),
      )

      const at = Array.from({ length: MAX_MOVE_HISTORY }, () => makeMove())
      const out = result.current.limitHistory(at, MAX_MOVE_HISTORY - 1)
      expect(out.history).toBe(at)
      expect(out.index).toBe(MAX_MOVE_HISTORY - 1)
    })

    it('trims the oldest excess entries and shifts the index when over the cap', () => {
      const { result } = renderHook(() =>
        useBoardHistory({
          setBoard: vi.fn(),
          setCandidates: vi.fn(),
          boardRef: { current: [] },
          candidatesRef: { current: new Uint16Array() },
        }),
      )

      const over = Array.from({ length: MAX_MOVE_HISTORY + 5 }, () => makeMove())
      const out = result.current.limitHistory(over, MAX_MOVE_HISTORY + 2)

      // excess = 5, so the first 5 are dropped and the index drops by 5 (clamped at 0).
      expect(out.history.length).toBe(MAX_MOVE_HISTORY)
      expect(out.history).toEqual(over.slice(5))
      expect(out.index).toBe(MAX_MOVE_HISTORY - 3)
    })

    it('clamps the adjusted index at 0 when the excess exceeds the current index', () => {
      const { result } = renderHook(() =>
        useBoardHistory({
          setBoard: vi.fn(),
          setCandidates: vi.fn(),
          boardRef: { current: [] },
          candidatesRef: { current: new Uint16Array() },
        }),
      )

      const over = Array.from({ length: MAX_MOVE_HISTORY + 10 }, () => makeMove())
      const out = result.current.limitHistory(over, 3)
      expect(out.index).toBe(0)
    })
  })

  describe('undo', () => {
    function setupHistory(history: Move[], index: number, board: number[], candidates: Uint16Array) {
      const setBoard = vi.fn()
      const setCandidates = vi.fn()
      const boardRef = { current: board }
      const candidatesRef = { current: candidates }
      const { result } = renderHook(() =>
        useBoardHistory({ setBoard, setCandidates, boardRef, candidatesRef }),
      )
      act(() => {
        result.current.setHistory(history)
        result.current.setHistoryIndex(index)
      })
      return { result, setBoard, setCandidates, boardRef, candidatesRef }
    }

    it('is a no-op when the history index is below zero', () => {
      const { result, setBoard } = setupHistory([makeMove()], -1)

      act(() => result.current.undo())

      expect(setBoard).not.toHaveBeenCalled()
      expect(result.current.historyIndex).toBe(-1)
    })

    it('is a no-op when the current move is missing', () => {
      // index 5 points past the single entry; currentMove is undefined
      const { result, setBoard } = setupHistory([makeMove()], 5)

      act(() => result.current.undo())

      expect(setBoard).not.toHaveBeenCalled()
    })

    it('unapplies the stateDiff, updates state, and updates refs synchronously', () => {
      const move = makeMove({ stateDiff: STATE_DIFF })
      const currentBoard = [5, ...new Array(80).fill(0)]
      const currentCandidates = new Uint16Array(81)
      currentCandidates[1] = 2
      const { result, setBoard, setCandidates, boardRef, candidatesRef } = setupHistory(
        [move],
        0,
        currentBoard,
        currentCandidates,
      )

      act(() => result.current.undo())

      // unapplyStateDiff reverts idx 0 to oldValue 0 and idx 1 mask to oldMask 0
      expect(setBoard).toHaveBeenCalledTimes(1)
      expect(setBoard.mock.calls[0][0][0]).toBe(0)
      expect(setCandidates).toHaveBeenCalledTimes(1)
      expect(boardRef.current[0]).toBe(0)
      expect(candidatesRef.current[1]).toBe(0)
      expect(result.current.historyIndex).toBe(-1)
    })

    it('falls back to boardBefore/candidatesBefore when no stateDiff is present', () => {
      const prevBoard = new Array(81).fill(0)
      prevBoard[3] = 9
      // candidatesBefore is flattened as raw values into a Uint16Array (see hook L98)
      const move = makeMove({ boardBefore: prevBoard, candidatesBefore: [[5, 6]] })
      const { result, setBoard, setCandidates, boardRef, candidatesRef } = setupHistory(
        [move],
        0,
        new Array(81).fill(0),
        new Uint16Array(81),
      )

      act(() => result.current.undo())

      expect(setBoard).toHaveBeenCalledWith(prevBoard)
      const expectedCandidates = new Uint16Array([5, 6])
      expect(setCandidates).toHaveBeenCalledWith(expectedCandidates)
      expect(boardRef.current).toBe(prevBoard)
      expect(candidatesRef.current).toEqual(expectedCandidates)
      expect(result.current.historyIndex).toBe(-1)
    })

    it('does nothing when the prior move has neither stateDiff nor boardBefore', () => {
      const move = makeMove()
      const { result, setBoard } = setupHistory([move], 0, new Array(81).fill(0), new Uint16Array(81))

      act(() => result.current.undo())

      expect(setBoard).not.toHaveBeenCalled()
      expect(result.current.historyIndex).toBe(-1)
    })
  })

  describe('redo', () => {
    function setupHistory(history: Move[], index: number, board: number[], candidates: Uint16Array) {
      const setBoard = vi.fn()
      const setCandidates = vi.fn()
      const boardRef = { current: board }
      const candidatesRef = { current: candidates }
      const { result } = renderHook(() =>
        useBoardHistory({ setBoard, setCandidates, boardRef, candidatesRef }),
      )
      act(() => {
        result.current.setHistory(history)
        result.current.setHistoryIndex(index)
      })
      return { result, setBoard, setCandidates, boardRef, candidatesRef }
    }

    it('is a no-op when already at the last entry (>= length - 1)', () => {
      const { result, setBoard } = setupHistory(
        [makeMove()],
        0,
        new Array(81).fill(0),
        new Uint16Array(81),
      )

      act(() => result.current.redo())

      expect(setBoard).not.toHaveBeenCalled()
      expect(result.current.historyIndex).toBe(0)
    })

    it('is a no-op when the next move is missing', () => {
      const { result, setBoard } = setupHistory(
        [makeMove()],
        5,
        new Array(81).fill(0),
        new Uint16Array(81),
      )

      act(() => result.current.redo())

      expect(setBoard).not.toHaveBeenCalled()
    })

    it('applies the next move stateDiff and advances the index', () => {
      const move0 = makeMove()
      const move1 = makeMove({ stateDiff: STATE_DIFF })
      const currentBoard = new Array(81).fill(0)
      const currentCandidates = new Uint16Array(81)
      const { result, setBoard, setCandidates, boardRef, candidatesRef } = setupHistory(
        [move0, move1],
        0,
        currentBoard,
        currentCandidates,
      )

      act(() => result.current.redo())

      // applyStateDiff applies idx 0 -> 5 and idx 1 mask -> 2
      expect(setBoard).toHaveBeenCalledTimes(1)
      expect(setBoard.mock.calls[0][0][0]).toBe(5)
      expect(setCandidates).toHaveBeenCalledTimes(1)
      expect(boardRef.current[0]).toBe(5)
      expect(candidatesRef.current[1]).toBe(2)
      expect(result.current.historyIndex).toBe(1)
    })

    it('does nothing when the next move has no stateDiff', () => {
      const move0 = makeMove()
      const move1 = makeMove()
      const { result, setBoard } = setupHistory(
        [move0, move1],
        0,
        new Array(81).fill(0),
        new Uint16Array(81),
      )

      act(() => result.current.redo())

      expect(setBoard).not.toHaveBeenCalled()
      expect(result.current.historyIndex).toBe(1)
    })
  })

  describe('canUndo / canRedo derived flags', () => {
    it('reflects whether undo and redo are available', () => {
      const { result } = renderHook(() =>
        useBoardHistory({
          setBoard: vi.fn(),
          setCandidates: vi.fn(),
          boardRef: { current: [] },
          candidatesRef: { current: new Uint16Array() },
        }),
      )

      // empty: index -1, length 0
      expect(result.current.canUndo).toBe(false)
      expect(result.current.canRedo).toBe(false)

      act(() => {
        result.current.setHistory([makeMove(), makeMove()])
        result.current.setHistoryIndex(0)
      })

      expect(result.current.canUndo).toBe(true)
      expect(result.current.canRedo).toBe(true)
    })
  })

  describe('ref synchronization effects', () => {
    it('keeps historyRef and historyIndexRef current after changes (kills empty-block/deps mutants)', () => {
      const { result } = renderHook(() =>
        useBoardHistory({
          setBoard: vi.fn(),
          setCandidates: vi.fn(),
          boardRef: { current: [] },
          candidatesRef: { current: new Uint16Array() },
        }),
      )

      const history = [makeMove()]
      act(() => {
        result.current.setHistory(history)
        result.current.setHistoryIndex(7)
      })

      expect(result.current.historyRef.current).toEqual(history)
      expect(result.current.historyIndexRef.current).toBe(7)
    })
  })
})
