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

// Fire a board pointer-move that hit-tests onto cell `idx`.
function movePointerTo(
  result: { current: ReturnType<typeof useBoardInteraction> },
  idx: number,
): void {
  const { el } = makeFakeCellElement(idx)
  const original = document.elementFromPoint
  document.elementFromPoint = vi.fn().mockReturnValue(el)
  act(() => result.current.handleBoardPointerMove(makePointerEvent() as never))
  document.elementFromPoint = original
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
    movePointerTo(result, idx)
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

    it('never offers a tab stop beyond the last cell of the grid', () => {
      // Every cell of the 9x9 grid is a given, so the fallback (cell 0) applies.
      // Index 81 lies outside the grid and must not be reachable by tabbing even
      // though it holds a non-given value.
      const initialBoard = Array(82).fill(9)
      initialBoard[81] = 0
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

    it('recomputes the tab stop when the selection changes', () => {
      const initialBoard = emptyBoard()
      initialBoard[0] = 5
      const { result, rerender } = renderHook(
        ({ sel }: { sel: number | null }) =>
          useBoardInteraction({
            selectedCell: sel,
            initialBoard,
            board: emptyBoard(),
            onCellClick: vi.fn(),
          }),
        { initialProps: { sel: null as number | null } },
      )
      expect(result.current.tabStopCell).toBe(1)
      rerender({ sel: 42 })
      expect(result.current.tabStopCell).toBe(42)
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

    it('does not wrap onto the next row when moving right off the last column', () => {
      // Cell 8 is row 0, column 8. Stepping right lands on column 9, which is
      // off-grid; cell 9 (row 1, column 0) must not be selected instead.
      const onCellClick = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: 8,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick,
        }),
      )
      act(() => result.current.handleCellKeyDown(key('ArrowRight') as never, 8))
      expect(onCellClick).not.toHaveBeenCalled()
    })

    it('does not wrap onto the previous row when moving left off the first column', () => {
      // Cell 9 is row 1, column 0. Stepping left lands on column -1, which is
      // off-grid; cell 8 (row 0, column 8) must not be selected instead.
      const onCellClick = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: 9,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick,
        }),
      )
      act(() => result.current.handleCellKeyDown(key('ArrowLeft') as never, 9))
      expect(onCellClick).not.toHaveBeenCalled()
    })

    it('does not move below the last row even when the board array is longer than the grid', () => {
      // Navigation is bounded by the 9x9 geometry, not by the length of the
      // array it is handed: row 9 does not exist even if index 85 does.
      const initialBoard = Array(90).fill(0)
      const onCellClick = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: 76,
          initialBoard,
          board: [...initialBoard],
          onCellClick,
        }),
      )
      act(() => result.current.handleCellKeyDown(key('ArrowDown') as never, 76))
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

    it('Delete clears the cell via onCellChange(idx, 0)', () => {
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
      act(() => result.current.handleCellKeyDown(key('Delete') as never, 0))
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

    it('does not start a drag on a given cell whose value is absent from the working board', () => {
      // A cell is unselectable when it is a given OR already filled. Both arms
      // are checked independently, so a given must be rejected on its own even
      // if the working board reports the cell as empty.
      const onCellSelectMultiple = vi.fn()
      const initialBoard = emptyBoard()
      initialBoard[0] = 5
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard,
          board: emptyBoard(),
          onCellClick: vi.fn(),
          onCellSelectMultiple,
        }),
      )
      dragThrough(result, {} as HTMLElement, 0, [1], onCellSelectMultiple)
      expect(onCellSelectMultiple).not.toHaveBeenCalled()
    })

    it('skips a given cell when bridging even if the working board reports it empty', () => {
      const onCellSelectMultiple = vi.fn()
      const initialBoard = emptyBoard()
      initialBoard[1] = 5 // given: must be skipped when bridging 0 -> 2
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard,
          board: emptyBoard(),
          onCellClick: vi.fn(),
          onCellSelectMultiple,
        }),
      )
      dragThrough(result, {} as HTMLElement, 0, [2], onCellSelectMultiple)
      expect(lastSelection(onCellSelectMultiple)).toEqual([0, 2])
    })

    it('bridges every skipped cell when the pointer jumps a gap', () => {
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
      // The pointer reports 1 then jumps to 4: cells 2 and 3 are bridged from
      // the trail tip, not from the drag start.
      dragThrough(result, {} as HTMLElement, 0, [1, 4], onCellSelectMultiple)
      expect(lastSelection(onCellSelectMultiple)).toEqual([0, 1, 2, 3, 4])
    })

    it('ignores a pointer move when no drag is in progress', () => {
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
      movePointerTo(result, 5)
      expect(onCellSelectMultiple).not.toHaveBeenCalled()
    })

    it('ignores a pointer move once the drag has ended', () => {
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
      dragThrough(result, {} as HTMLElement, 0, [1], onCellSelectMultiple)
      onCellSelectMultiple.mockClear()
      movePointerTo(result, 5)
      expect(onCellSelectMultiple).not.toHaveBeenCalled()
    })

    it('suppresses only the first click after a multi-cell drag', () => {
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
      act(() => result.current.handleCellClick(2)) // synthetic click: suppressed
      act(() => result.current.handleCellClick(7)) // genuine click: must pass through
      expect(onCellClick).toHaveBeenCalledTimes(1)
      expect(onCellClick).toHaveBeenCalledWith(7)
    })

    it('clears the suppression flag after the event cycle when no click follows', () => {
      // Nothing synthesizes a click after a pointercancel, so the safety-net
      // timer must disarm suppression or the next real click would be eaten.
      vi.useFakeTimers()
      try {
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
        act(() => {
          vi.runAllTimers()
        })
        act(() => result.current.handleCellClick(2))
        expect(onCellClick).toHaveBeenCalledWith(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('does not let a finished tap disarm the suppression of a later drag', () => {
      // A tap arms no suppression, so it must leave no timer behind: one firing
      // mid-drag would disarm the suppression that drag is about to need.
      vi.useFakeTimers()
      try {
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
        act(() => result.current.handleDragStart(0))
        act(() => result.current.handleBoardPointerUp())

        act(() => result.current.handleDragStart(0))
        movePointerTo(result, 1)
        movePointerTo(result, 2)
        act(() => {
          vi.runAllTimers()
        })
        act(() => result.current.handleBoardPointerUp())
        act(() => result.current.handleCellClick(2))
        expect(onCellClick).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
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

  describe('coverage gap closures (defensive and effect branches)', () => {
    function key(k: string): { key: string; preventDefault: ReturnType<typeof vi.fn> } {
      return { key: k, preventDefault: vi.fn() }
    }

    it('ArrowLeft selects the next non-given cell to the left', () => {
      const onCellClick = vi.fn()
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: 2,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick,
        }),
      )
      act(() => result.current.handleCellKeyDown(key('ArrowLeft') as never, 2))
      expect(onCellClick).toHaveBeenCalledWith(1)
    })

    it('every digit key 1-9 calls onCellChange with its value', () => {
      for (let d = 1; d <= 9; d++) {
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
        act(() => result.current.handleCellKeyDown(key(String(d)) as never, 0))
        expect(onCellChange).toHaveBeenCalledWith(0, d)
      }
    })

    it('Backspace is ignored on a given cell', () => {
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
      act(() => result.current.handleCellKeyDown(key('Backspace') as never, 0))
      expect(onCellChange).not.toHaveBeenCalled()
    })

    function renderDragHook() {
      const onCellSelectMultiple = vi.fn()
      const hook = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
          onCellSelectMultiple,
        }),
      )
      return { result: hook.result, onCellSelectMultiple }
    }

    it('handleBoardPointerMove ignores a move when elementFromPoint returns null', () => {
      const { result, onCellSelectMultiple } = renderDragHook()
      act(() => result.current.handleDragStart(0))
      const original = document.elementFromPoint
      document.elementFromPoint = (() => null) as typeof document.elementFromPoint
      act(() => result.current.handleBoardPointerMove({ clientX: 1, clientY: 1 } as never))
      document.elementFromPoint = original
      expect(onCellSelectMultiple).not.toHaveBeenCalled()
    })

    it('handleBoardPointerMove ignores an element with no cell ancestor', () => {
      const { result, onCellSelectMultiple } = renderDragHook()
      act(() => result.current.handleDragStart(0))
      const strayEl = { closest: () => null } as unknown as HTMLElement
      const original = document.elementFromPoint
      document.elementFromPoint = (() => strayEl) as typeof document.elementFromPoint
      act(() => result.current.handleBoardPointerMove({ clientX: 1, clientY: 1 } as never))
      document.elementFromPoint = original
      expect(onCellSelectMultiple).not.toHaveBeenCalled()
    })

    it('handleBoardPointerMove ignores a cell whose index attribute is not numeric', () => {
      const { result, onCellSelectMultiple } = renderDragHook()
      act(() => result.current.handleDragStart(0))
      const cellEl = { getAttribute: () => 'abc' }
      const strayEl = { closest: () => cellEl } as unknown as HTMLElement
      const original = document.elementFromPoint
      document.elementFromPoint = (() => strayEl) as typeof document.elementFromPoint
      act(() => result.current.handleBoardPointerMove({ clientX: 1, clientY: 1 } as never))
      document.elementFromPoint = original
      expect(onCellSelectMultiple).not.toHaveBeenCalled()
    })

    it('handleBoardPointerMove ignores a move onto the same cell as the last event', () => {
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
      // dragStart(0) seeds lastEnteredCellRef with 0; resolving the pointer back
      // to 0 hits the same-cell guard and skips handleDragEnter.
      act(() => result.current.handleDragStart(0))
      const { el } = makeFakeCellElement(0)
      const original = document.elementFromPoint
      document.elementFromPoint = (() => el) as typeof document.elementFromPoint
      act(() => result.current.handleBoardPointerMove({ clientX: 0, clientY: 0 } as never))
      document.elementFromPoint = original
      expect(onCellSelectMultiple).not.toHaveBeenCalled()
    })

    it('handleGridFocus ignores a cell whose index attribute is not numeric', () => {
      const { result } = renderHook(() =>
        useBoardInteraction({
          selectedCell: null,
          initialBoard: emptyBoard(),
          board: emptyBoard(),
          onCellClick: vi.fn(),
        }),
      )
      const target = document.createElement('div')
      target.setAttribute('data-cell-idx', 'abc')
      act(() => result.current.handleGridFocus({ target } as never))
      expect(result.current.focusedCell).toBeNull()
    })

    describe('focus management effect (requestAnimationFrame)', () => {
      let rafCallbacks: Array<(t: number) => void>
      let origRAF: typeof window.requestAnimationFrame
      let origCancel: typeof window.cancelAnimationFrame

      beforeEach(() => {
        rafCallbacks = []
        origRAF = window.requestAnimationFrame
        origCancel = window.cancelAnimationFrame
        window.requestAnimationFrame = ((cb: (t: number) => void) => {
          rafCallbacks.push(cb)
          return rafCallbacks.length
        }) as typeof window.requestAnimationFrame
        window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame
      })

      afterEach(() => {
        window.requestAnimationFrame = origRAF
        window.cancelAnimationFrame = origCancel
      })

      function renderFocusHook(initialSel: number | null) {
        return renderHook(
          ({ sel }: { sel: number | null }) =>
            useBoardInteraction({
              selectedCell: sel,
              initialBoard: emptyBoard(),
              board: emptyBoard(),
              onCellClick: vi.fn(),
            }),
          { initialProps: { sel: initialSel } },
        )
      }

      it('focuses the selected cell once its ref is set, on the next frame', () => {
        const { result, rerender } = renderFocusHook(null)
        const el = document.createElement('div')
        el.focus = vi.fn() as unknown as HTMLDivElement['focus']
        act(() => result.current.cellRefCallbacks[5]!(el))
        rerender({ sel: 5 })
        act(() => rafCallbacks.forEach((cb) => cb(0)))
        expect(el.focus).toHaveBeenCalled()
      })

      it('schedules no frame when the selected cell has no element yet', () => {
        // Cell 0 is selected but never had a ref attached, so there is nothing
        // to focus and no frame should be requested.
        renderFocusHook(0)
        expect(rafCallbacks).toHaveLength(0)
      })

      it('does not throw when the cell element is detached before the frame fires', () => {
        const { result, rerender } = renderFocusHook(null)
        const el = document.createElement('div')
        el.focus = vi.fn() as unknown as HTMLDivElement['focus']
        act(() => result.current.cellRefCallbacks[5]!(el))
        rerender({ sel: 5 })
        // The cell unmounts between the effect and the frame: React clears the ref.
        act(() => result.current.cellRefCallbacks[5]!(null))
        act(() => rafCallbacks.forEach((cb) => cb(0)))
        expect(el.focus).not.toHaveBeenCalled()
      })

      it('skips focusing when unmounted before the frame fires', () => {
        const { result, rerender, unmount } = renderFocusHook(null)
        const el = document.createElement('div')
        el.focus = vi.fn() as unknown as HTMLDivElement['focus']
        act(() => result.current.cellRefCallbacks[5]!(el))
        rerender({ sel: 5 })
        unmount()
        act(() => rafCallbacks.forEach((cb) => cb(0)))
        expect(el.focus).not.toHaveBeenCalled()
      })

      it('blurs the active element when selection becomes null', () => {
        const blurSpy = vi.spyOn(document.body, 'blur')
        const { rerender } = renderFocusHook(5)
        rerender({ sel: null })
        act(() => rafCallbacks.forEach((cb) => cb(0)))
        expect(blurSpy).toHaveBeenCalled()
        blurSpy.mockRestore()
      })

      it('skips blurring when unmounted before the frame fires', () => {
        const blurSpy = vi.spyOn(document.body, 'blur')
        const { rerender, unmount } = renderFocusHook(5)
        rerender({ sel: null })
        unmount()
        act(() => rafCallbacks.forEach((cb) => cb(0)))
        expect(blurSpy).not.toHaveBeenCalled()
        blurSpy.mockRestore()
      })

      it('skips the blur path when the active element has no blur method', () => {
        // document.activeElement is always an Element with blur in real browsers;
        // force a non-Element to exercise the defensive 'blur' in activeElement guard.
        Object.defineProperty(document, 'activeElement', {
          get: () => ({}) as Element,
          configurable: true,
        })
        const { rerender } = renderFocusHook(5)
        rerender({ sel: null })
        act(() => rafCallbacks.forEach((cb) => cb(0)))
        delete (document as unknown as { activeElement: unknown }).activeElement
      })
    })
  })
})
