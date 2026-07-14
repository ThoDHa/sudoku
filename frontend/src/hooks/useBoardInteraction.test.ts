import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { useBoardInteraction } from './useBoardInteraction'

function emptyBoard(): number[] {
  return Array(81).fill(0)
}

function makePointerEvent(clientX = 0, clientY = 0): { clientX: number; clientY: number } {
  return { clientX, clientY }
}

// Build a fake cell element that handleBoardPointerMove's elementFromPoint
// -> closest -> getAttribute chain will resolve to `idx`.
function makeFakeCellElement(idx: number): {
  el: HTMLElement
  cellEl: { getAttribute: (name: string) => string | null }
} {
  const cellEl = { getAttribute: vi.fn().mockReturnValue(String(idx)) }
  const el = { closest: vi.fn().mockReturnValue(cellEl) } as unknown as HTMLElement
  return { el, cellEl }
}

// Drive a drag: pointerDown on startIdx, then pointerMove resolving to each
// target idx in turn, then pointerUp. Returns the recorded selection arrays.
function dragThrough(
  result: { current: ReturnType<typeof useBoardInteraction> },
  boardEl: HTMLElement,
  startIdx: number,
  path: number[],
  onCellSelectMultiple: Mock,
) {
  act(() => result.current.handleDragStart(startIdx))
  for (const idx of path) {
    const { el } = makeFakeCellElement(idx)
    const original = document.elementFromPoint
    document.elementFromPoint = vi.fn().mockReturnValue(el)
    act(() => result.current.handleBoardPointerMove(makePointerEvent() as never))
    document.elementFromPoint = original
  }
  act(() => result.current.handleBoardPointerUp())
  void boardEl
  return onCellSelectMultiple.mock.calls.map((c) => c[0]) as number[][]
}

function lastSelection(mock: Mock): number[] {
  const calls = mock.mock.calls as unknown[][]
  return calls[calls.length - 1]![0] as number[]
}

describe('useBoardInteraction', () => {
  let originalElementFromPoint: typeof document.elementFromPoint

  beforeEach(() => {
    originalElementFromPoint = document.elementFromPoint
  })

  afterEach(() => {
    document.elementFromPoint = originalElementFromPoint
  })

  describe('tabStopCell (roving tabindex)', () => {
    it('returns the selected cell when one is selected', () => {
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: 42,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
        }),
      )
      expect(result.current.tabStopCell).toBe(42)
    })

    it('returns the first non-given cell when no cell is selected', () => {
      const initialBoard = emptyBoard()
      initialBoard[0] = 5
      initialBoard[1] = 7
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard,
          board: emptyBoard(),
          onCellClick: vi.fn(),
        }),
      )
      expect(result.current.tabStopCell).toBe(2)
    })

    it('falls back to cell 0 when the board is entirely given', () => {
      const initialBoard = Array(81).fill(9)
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard,
          board: [...initialBoard],
          onCellClick: vi.fn(),
        }),
      )
      expect(result.current.tabStopCell).toBe(0)
    })
  })

  describe('handleCellClick', () => {
    it('forwards the click to onCellClick', () => {
      const onCellClick = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick,
        }),
      )
      act(() => result.current.handleCellClick(7))
      expect(onCellClick).toHaveBeenCalledWith(7)
    })
  })

  describe('handleCellKeyDown', () => {
    function key(key: string): { key: string; preventDefault: ReturnType<typeof vi.fn> } {
      return { key, preventDefault: vi.fn() }
    }

    it('ArrowRight selects the next non-given cell to the right', () => {
      const initialBoard = emptyBoard()
      initialBoard[1] = 5 // given, must be skipped
      const onCellClick = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: 0,
          initialBoard,
          board: emptyBoard(),
          onCellClick,
        }),
      )
      act(() => result.current.handleCellKeyDown(key('ArrowRight') as never, 0))
      expect(onCellClick).toHaveBeenCalledWith(2)
    })

    it('ArrowDown selects the cell directly below', () => {
      const onCellClick = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: 0,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick,
        }),
      )
      act(() => result.current.handleCellKeyDown(key('ArrowDown') as never, 0))
      expect(onCellClick).toHaveBeenCalledWith(9)
    })

    it('does not move past the board edge', () => {
      const onCellClick = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: 0,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick,
        }),
      )
      act(() => result.current.handleCellKeyDown(key('ArrowUp') as never, 0))
      expect(onCellClick).not.toHaveBeenCalled()
    })

    it('digit key calls onCellChange with that value on an empty cell', () => {
      const onCellChange = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: 0,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
          onCellChange,
        }),
      )
      act(() => result.current.handleCellKeyDown(key('5') as never, 0))
      expect(onCellChange).toHaveBeenCalledWith(0, 5)
    })

    it('digit key is ignored on a given cell', () => {
      const initialBoard = emptyBoard()
      initialBoard[0] = 5
      const onCellChange = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: 0,
          initialBoard,
          board: [...initialBoard],
          onCellClick: vi.fn(),
          onCellChange,
        }),
      )
      act(() => result.current.handleCellKeyDown(key('7') as never, 0))
      expect(onCellChange).not.toHaveBeenCalled()
    })

    it('Backspace clears the cell via onCellChange(idx, 0)', () => {
      const onCellChange = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: 0,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
          onCellChange,
        }),
      )
      act(() => result.current.handleCellKeyDown(key('Backspace') as never, 0))
      expect(onCellChange).toHaveBeenCalledWith(0, 0)
    })

    it('Enter activates the cell via onCellClick', () => {
      const onCellClick = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: 3,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick,
        }),
      )
      act(() => result.current.handleCellKeyDown(key('Enter') as never, 3))
      expect(onCellClick).toHaveBeenCalledWith(3)
    })

    it('Space activates the cell via onCellClick', () => {
      const onCellClick = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: 3,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick,
        }),
      )
      act(() => result.current.handleCellKeyDown(key(' ') as never, 3))
      expect(onCellClick).toHaveBeenCalledWith(3)
    })
  })

  describe('drag multi-select state machine', () => {
    it('does not start a drag on a given cell', () => {
      const onCellSelectMultiple = vi.fn()
      const initialBoard = emptyBoard()
      initialBoard[0] = 5
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard,
          board: [...initialBoard],
          onCellClick: vi.fn(),
          onCellSelectMultiple,
        }),
      )
      dragThrough(result, {} as HTMLElement, 0, [1], onCellSelectMultiple)
      expect(onCellSelectMultiple).not.toHaveBeenCalled()
    })

    it('does not start a drag on a user-filled cell', () => {
      const onCellSelectMultiple = vi.fn()
      const board = emptyBoard()
      board[0] = 8
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board,
          onCellClick: vi.fn(),
          onCellSelectMultiple,
        }),
      )
      dragThrough(result, {} as HTMLElement, 0, [1], onCellSelectMultiple)
      expect(onCellSelectMultiple).not.toHaveBeenCalled()
    })

    it('accumulates cells along an L-shaped drag path', () => {
      const onCellSelectMultiple = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
          onCellSelectMultiple,
        }),
      )
      dragThrough(result, {} as HTMLElement, 0, [1, 2, 11, 20], onCellSelectMultiple)
      expect(lastSelection(onCellSelectMultiple)).toEqual([0, 1, 2, 11, 20])
    })

    it('trims the trail when the pointer revisits a previous cell', () => {
      const onCellSelectMultiple = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
          onCellSelectMultiple,
        }),
      )
      // 0 -> 1 -> 2, then back to 1: trail should trim to [0, 1]
      dragThrough(result, {} as HTMLElement, 0, [1, 2, 1], onCellSelectMultiple)
      expect(lastSelection(onCellSelectMultiple)).toEqual([0, 1])
    })

    it('re-accumulates correctly after a backtrack', () => {
      const onCellSelectMultiple = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
          onCellSelectMultiple,
        }),
      )
      // 0 -> 1 -> 2 -> 1 (backtrack) -> 10 (down from cell 1)
      dragThrough(result, {} as HTMLElement, 0, [1, 2, 1, 10], onCellSelectMultiple)
      expect(lastSelection(onCellSelectMultiple)).toEqual([0, 1, 10])
    })

    it('skips given cells when bridging a gap in the path', () => {
      const onCellSelectMultiple = vi.fn()
      const initialBoard = emptyBoard()
      initialBoard[1] = 5 // given: must be skipped when bridging 0 -> 2
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard,
          board: [...initialBoard],
          onCellClick: vi.fn(),
          onCellSelectMultiple,
        }),
      )
      dragThrough(result, {} as HTMLElement, 0, [2], onCellSelectMultiple)
      expect(lastSelection(onCellSelectMultiple)).toEqual([0, 2])
    })

    it('suppresses the click that follows a multi-cell drag', () => {
      const onCellClick = vi.fn()
      const onCellSelectMultiple = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick,
          onCellSelectMultiple,
        }),
      )
      dragThrough(result, {} as HTMLElement, 0, [1, 2], onCellSelectMultiple)
      // Synthetic click after pointerup should be suppressed.
      act(() => result.current.handleCellClick(2))
      expect(onCellClick).not.toHaveBeenCalled()
    })

    it('does not suppress a click after a single-cell tap (no movement)', () => {
      const onCellClick = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick,
        }),
      )
      act(() => result.current.handleDragStart(0))
      act(() => result.current.handleBoardPointerUp())
      act(() => result.current.handleCellClick(0))
      expect(onCellClick).toHaveBeenCalledWith(0)
    })

    it('resets the trail so the next drag starts fresh', () => {
      const onCellSelectMultiple = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
          onCellSelectMultiple,
        }),
      )
      // First drag
      dragThrough(result, {} as HTMLElement, 0, [1], onCellSelectMultiple)
      onCellSelectMultiple.mockClear()
      // Second drag from a different start
      dragThrough(result, {} as HTMLElement, 3, [4], onCellSelectMultiple)
      expect(lastSelection(onCellSelectMultiple)).toEqual([3, 4])
    })

    it('fires onDragEnd with the final trail on a multi-cell drag', () => {
      const onDragEnd = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
          onDragEnd,
        }),
      )
      dragThrough(result, {} as HTMLElement, 0, [1, 2], vi.fn())
      expect(onDragEnd).toHaveBeenCalledTimes(1)
      expect(onDragEnd).toHaveBeenCalledWith([0, 1, 2])
    })

    it('does not fire onDragEnd for a single-cell drag (no movement)', () => {
      const onDragEnd = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
          onDragEnd,
        }),
      )
      act(() => result.current.handleDragStart(0))
      act(() => result.current.handleBoardPointerUp())
      expect(onDragEnd).not.toHaveBeenCalled()
    })

    it('passes the backtracked trail to onDragEnd, not the full history', () => {
      const onDragEnd = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
          onDragEnd,
        }),
      )
      // 0 -> 1 -> 2 -> 1 (backtrack), then pointerUp: trail is [0, 1]
      dragThrough(result, {} as HTMLElement, 0, [1, 2, 1], vi.fn())
      expect(onDragEnd).toHaveBeenCalledWith([0, 1])
    })
  })

  describe('focus indicator state', () => {
    it('handleGridFocus sets focusedCell when a cell receives focus', () => {
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
        }),
      )
      const target = document.createElement('div')
      target.setAttribute('data-cell-idx', '17')
      act(() =>
        result.current.handleGridFocus({
          target,
        } as never),
      )
      expect(result.current.focusedCell).toBe(17)
    })

    it('handleGridBlur clears focusedCell when focus leaves the grid', () => {
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
        }),
      )
      const target = document.createElement('div')
      target.setAttribute('data-cell-idx', '5')
      act(() => result.current.handleGridFocus({ target } as never))
      expect(result.current.focusedCell).toBe(5)

      // relatedTarget has no data-cell-idx -> focus left the grid
      const elsewhere = document.createElement('button')
      act(() => result.current.handleGridBlur({ relatedTarget: elsewhere } as never))
      expect(result.current.focusedCell).toBeNull()
    })

    it('handleGridBlur keeps focusedCell when focus moves to another cell', () => {
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
        }),
      )
      const target = document.createElement('div')
      target.setAttribute('data-cell-idx', '5')
      act(() => result.current.handleGridFocus({ target } as never))

      const nextCell = document.createElement('div')
      nextCell.setAttribute('data-cell-idx', '6')
      act(() => result.current.handleGridBlur({ relatedTarget: nextCell } as never))
      expect(result.current.focusedCell).toBe(5)
    })

    it('handleGridFocus ignores targets without a cell index', () => {
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
        }),
      )
      const target = document.createElement('div') // no data-cell-idx
      act(() => result.current.handleGridFocus({ target } as never))
      expect(result.current.focusedCell).toBeNull()
    })
  })

  describe('cellRefCallbacks', () => {
    it('returns 81 stable callbacks', () => {
      const { result, rerender } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
        }),
      )
      expect(result.current.cellRefCallbacks).toHaveLength(81)
      const firstRender = result.current.cellRefCallbacks
      rerender()
      expect(result.current.cellRefCallbacks).toBe(firstRender)
    })
  })
})
