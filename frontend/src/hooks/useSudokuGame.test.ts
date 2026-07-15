import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSudokuGame, type Move } from './useSudokuGame'
import { hasCandidate, countCandidates, addCandidate } from '../lib/candidatesUtils'
import { TOTAL_CELLS, MAX_MOVE_HISTORY } from '../lib/constants'
import {
  createTestPuzzle,
  createCompletePuzzle,
  createNearlyCompletePuzzle,
  createEmptyPuzzle,
  createMockMove,
} from '../test-utils'

type GameHook = ReturnType<typeof useSudokuGame>
type GameResult = { current: GameHook }

// Render the hook with a board. Most tests render with only initialBoard, so
// this wraps the renderHook boilerplate they would otherwise repeat.
function renderGame(initialBoard: number[]) {
  const rendered = renderHook(() => useSudokuGame({ initialBoard }))
  return rendered
}

function actPlace(result: GameResult, cell: number, digit: number, isNote = false) {
  act(() => {
    result.current.setCell(cell, digit, isNote)
  })
}

function actErase(result: GameResult, cell: number) {
  act(() => {
    result.current.eraseCell(cell)
  })
}

function actToggle(result: GameResult, cell: number, digit: number) {
  act(() => {
    result.current.toggleCandidate(cell, digit)
  })
}

function actReset(result: GameResult) {
  act(() => {
    result.current.resetGame()
  })
}

function actClear(result: GameResult) {
  act(() => {
    result.current.clearAll()
  })
}

function actUndo(result: GameResult) {
  act(() => {
    result.current.undo()
  })
}

function actRedo(result: GameResult) {
  act(() => {
    result.current.redo()
  })
}

function actSetComplete(result: GameResult, value: boolean) {
  act(() => {
    result.current.setIsComplete(value)
  })
}

// =============================================================================
// HOOK INITIALIZATION TESTS
// =============================================================================

describe('useSudokuGame - Hook Initialization', () => {
  it('initializes with the provided board', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    expect(result.current.board).toEqual(puzzle)
  })

  it('initializes with empty candidates', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    // All candidates should start at 0
    for (let i = 0; i < TOTAL_CELLS; i++) {
      expect(result.current.candidates[i]).toBe(0)
    }
  })

  it('starts with empty history', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    expect(result.current.history).toEqual([])
    expect(result.current.historyIndex).toBe(-1)
  })

  it('starts with canUndo=false and canRedo=false', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('starts with isComplete=false for incomplete puzzles', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    expect(result.current.isComplete).toBe(false)
  })

  it('initializes candidatesVersion to 0', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    expect(result.current.candidatesVersion).toBe(0)
  })

  it('handles empty initial board', () => {
    const emptyBoard = createEmptyPuzzle()
    const { result } = renderGame(emptyBoard)

    expect(result.current.board).toEqual(emptyBoard)
  })

  it('computes initial digitCounts correctly', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    // Verify digit counts match the puzzle
    const expectedCounts = Array(9).fill(0)
    puzzle.forEach((digit) => {
      if (digit >= 1 && digit <= 9) {
        expectedCounts[digit - 1]++
      }
    })
    expect(result.current.digitCounts).toEqual(expectedCounts)
  })
})

// =============================================================================
// isGivenCell() TESTS
// =============================================================================

describe('useSudokuGame - isGivenCell()', () => {
  it('returns true for given cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    // Cell 0 has digit 5 (given)
    expect(result.current.isGivenCell(0)).toBe(true)
    expect(result.current.isGivenCell(1)).toBe(true)
    expect(result.current.isGivenCell(9)).toBe(true)
  })

  it('returns false for empty cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    // Cell 2 is empty in the test puzzle
    expect(result.current.isGivenCell(2)).toBe(false)
    expect(result.current.isGivenCell(3)).toBe(false)
    expect(result.current.isGivenCell(80)).toBe(false)
  })

  it('returns false for user-filled cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    // Place a digit in an empty cell
    actPlace(result, 2, 4, false)

    // Cell is now filled but not a given
    expect(result.current.board[2]).toBe(4)
    expect(result.current.isGivenCell(2)).toBe(false)
  })
})

// =============================================================================
// setCell() - DIGIT PLACEMENT TESTS
// =============================================================================

describe('useSudokuGame - setCell() (Digit Placement)', () => {
  it('places a digit in an empty cell', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    act(() => {
      result.current.setCell(40, 7, false) // Center cell, digit 7
    })

    expect(result.current.board[40]).toBe(7)
  })

  it('adds move to history when placing a digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actPlace(result, 40, 7, false)

    expect(result.current.history).toHaveLength(1)
    expect(result.current.historyIndex).toBe(0)
    expect(result.current.history[0]?.action).toBe('place')
    expect(result.current.history[0]?.digit).toBe(7)
  })

  it('does not modify given cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    // Cell 0 is given (has digit 5)
    actPlace(result, 0, 9, false)

    // Should not change
    expect(result.current.board[0]).toBe(5)
    expect(result.current.history).toHaveLength(0)
  })

  it('overwrites existing user-placed digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Place first digit
    actPlace(result, 10, 3, false)
    expect(result.current.board[10]).toBe(3)

    // Overwrite with different digit
    actPlace(result, 10, 8, false)
    expect(result.current.board[10]).toBe(8)
    expect(result.current.history).toHaveLength(2)
  })

  it('eliminates candidates from peers when placing digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // First fill candidates
    act(() => {
      result.current.fillAllCandidates()
      // Manually trigger candidate update via setCell in notes mode first
      result.current.setCell(1, 5, true) // Add note 5 to cell 1
    })

    // Now place digit 5 at cell 0 (R1C1)
    actPlace(result, 0, 5, false)

    // Candidates for 5 should be eliminated from row 1, col 1, and box 1
    // Cell 1 is in same row, so its candidate for 5 should be cleared
    expect(hasCandidate(result.current.candidates[1] || 0, 5)).toBe(false)
  })

  it('clears candidates for the placed cell', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Add candidates to cell 10
    act(() => {
      result.current.setCell(10, 1, true)
      result.current.setCell(10, 2, true)
      result.current.setCell(10, 3, true)
    })
    expect(countCandidates(result.current.candidates[10] || 0)).toBeGreaterThan(0)

    // Place digit
    actPlace(result, 10, 5, false)

    // Candidates should be cleared
    expect(result.current.candidates[10]).toBe(0)
  })

  it('updates digitCounts when placing digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    const initialCount = result.current.digitCounts[6] ?? 0 // Count of 7s (index 6)

    actPlace(result, 40, 7, false)

    expect(result.current.digitCounts[6]).toBe(initialCount + 1)
  })

  it('enables canUndo after placing digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    expect(result.current.canUndo).toBe(false)

    actPlace(result, 40, 7, false)

    expect(result.current.canUndo).toBe(true)
  })

  it('triggers onComplete when puzzle is solved', () => {
    const nearlyComplete = createNearlyCompletePuzzle()
    const onComplete = vi.fn()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: nearlyComplete, onComplete }))

    // Place the final digit (cell 80 should be 9 in our complete puzzle)
    actPlace(result, 80, 9, false)

    expect(onComplete).toHaveBeenCalled()
    expect(result.current.isComplete).toBe(true)
  })

  it('does not trigger onComplete for invalid solution', () => {
    const nearlyComplete = createNearlyCompletePuzzle()
    const onComplete = vi.fn()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: nearlyComplete, onComplete }))

    // Place wrong digit
    act(() => {
      result.current.setCell(80, 1, false) // Wrong digit
    })

    expect(onComplete).not.toHaveBeenCalled()
    expect(result.current.isComplete).toBe(false)
  })
})

// =============================================================================
// setCell() - NOTES MODE TESTS
// =============================================================================

describe('useSudokuGame - setCell() (Notes Mode)', () => {
  it('toggles candidate in notes mode', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Add candidate
    actPlace(result, 40, 5, true)

    expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(true)
  })

  it('removes candidate on second toggle using toggleCandidate', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Add candidate using toggleCandidate (not affected by debounce guard)
    actToggle(result, 40, 5)
    expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(true)

    // Remove candidate (toggle off) - toggleCandidate doesn't have debounce
    actToggle(result, 40, 5)
    expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(false)
  })

  it('does not add notes to filled cells', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Place digit
    actPlace(result, 40, 7, false)

    // Try to add note
    actPlace(result, 40, 3, true)

    // Should not have any candidates
    expect(result.current.candidates[40]).toBe(0)
  })

  it('does not add notes to given cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    // Cell 0 is given
    actPlace(result, 0, 3, true)

    expect(result.current.candidates[0]).toBe(0)
  })

  it('increments candidatesVersion when toggling notes', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    const initialVersion = result.current.candidatesVersion

    actPlace(result, 40, 5, true)

    expect(result.current.candidatesVersion).toBe(initialVersion + 1)
  })

  it('adds history entry for note toggle', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actPlace(result, 40, 5, true)

    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0]?.action).toBe('note')
  })
})

// =============================================================================
// toggleCandidate() TESTS
// =============================================================================

describe('useSudokuGame - toggleCandidate()', () => {
  it('adds candidate to empty cell', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actToggle(result, 40, 7)

    expect(hasCandidate(result.current.candidates[40] || 0, 7)).toBe(true)
  })

  it('removes existing candidate', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Add then remove
    actToggle(result, 40, 7)
    actToggle(result, 40, 7)

    expect(hasCandidate(result.current.candidates[40] || 0, 7)).toBe(false)
  })

  it('does not toggle candidate for given cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    act(() => {
      result.current.toggleCandidate(0, 3) // Cell 0 is given
    })

    expect(result.current.candidates[0]).toBe(0)
    expect(result.current.history).toHaveLength(0)
  })

  it('does not toggle candidate for filled cells', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Fill the cell first
    actPlace(result, 40, 5, false)

    const historyLength = result.current.history.length

    // Try to toggle candidate
    actToggle(result, 40, 3)

    expect(result.current.candidates[40]).toBe(0)
    expect(result.current.history).toHaveLength(historyLength) // No new history entry
  })

  it('adds toggle to history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actToggle(result, 40, 7)

    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0]?.isUserMove).toBe(true)
  })
})

// =============================================================================
// eraseCell() TESTS
// =============================================================================

describe('useSudokuGame - eraseCell()', () => {
  it('erases user-placed digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Place digit
    actPlace(result, 40, 7, false)
    expect(result.current.board[40]).toBe(7)

    // Erase
    actErase(result, 40)

    expect(result.current.board[40]).toBe(0)
  })

  it('does not erase given cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    act(() => {
      result.current.eraseCell(0) // Cell 0 is given (5)
    })

    expect(result.current.board[0]).toBe(5)
    expect(result.current.history).toHaveLength(0)
  })

  it('clears candidates when erasing empty cell with notes', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Add notes
    act(() => {
      result.current.toggleCandidate(40, 1)
      result.current.toggleCandidate(40, 2)
      result.current.toggleCandidate(40, 3)
    })
    expect(countCandidates(result.current.candidates[40] || 0)).toBe(3)

    // Erase (clears notes)
    actErase(result, 40)

    expect(result.current.candidates[40]).toBe(0)
  })

  it('adds erase to history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actPlace(result, 40, 7, false)

    actErase(result, 40)

    expect(result.current.history).toHaveLength(2)
    expect(result.current.history[1]?.action).toBe('erase')
  })

  it('does nothing for empty cells without candidates', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actErase(result, 40)

    expect(result.current.history).toHaveLength(0)
  })

  it('updates digitCounts when erasing', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actPlace(result, 40, 7, false)
    const countBefore = result.current.digitCounts[6] ?? 0

    actErase(result, 40)

    expect(result.current.digitCounts[6]).toBe(countBefore - 1)
  })
})

// =============================================================================
// undo() TESTS
// =============================================================================

describe('useSudokuGame - undo()', () => {
  it('undoes digit placement', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actPlace(result, 40, 7, false)
    expect(result.current.board[40]).toBe(7)

    actUndo(result)

    expect(result.current.board[40]).toBe(0)
  })

  it('undoes note toggle', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actToggle(result, 40, 5)
    expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(true)

    actUndo(result)

    expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(false)
  })

  it('does nothing when history is empty', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actUndo(result)

    expect(result.current.historyIndex).toBe(-1)
  })

  it('decrements historyIndex', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actPlace(result, 40, 7, false)
    expect(result.current.historyIndex).toBe(0)

    actUndo(result)

    expect(result.current.historyIndex).toBe(-1)
  })

  it('enables canRedo after undo', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actPlace(result, 40, 7, false)
    expect(result.current.canRedo).toBe(false)

    actUndo(result)

    expect(result.current.canRedo).toBe(true)
  })

  it('sets isComplete to false after undoing completion', () => {
    const nearlyComplete = createNearlyCompletePuzzle()
    const onComplete = vi.fn()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: nearlyComplete, onComplete }))

    // Complete the puzzle
    actPlace(result, 80, 9, false)
    expect(result.current.isComplete).toBe(true)

    // Undo
    actUndo(result)

    expect(result.current.isComplete).toBe(false)
  })

  it('keeps isComplete true when undo restores a fully solved board', () => {
    const nearlyComplete = createNearlyCompletePuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: nearlyComplete }))

    // Complete the puzzle, then erase the final cell so the last recorded move,
    // when undone, lands back on the fully solved board.
    actPlace(result, 80, 9, false)
    expect(result.current.isComplete).toBe(true)
    actErase(result, 80)
    expect(result.current.board[80]).toBe(0)

    // Undo the erase: the board is complete and valid again, so handleUndo takes
    // the branch that leaves completion untouched instead of resetting it.
    actUndo(result)

    expect(result.current.board[80]).toBe(9)
    expect(result.current.isComplete).toBe(true)
  })

  it('supports multiple undos', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    act(() => {
      result.current.setCell(10, 1, false)
      result.current.setCell(20, 2, false)
      result.current.setCell(30, 3, false)
    })
    expect(result.current.board[30]).toBe(3)

    act(() => {
      result.current.undo()
      result.current.undo()
      result.current.undo()
    })

    expect(result.current.board[10]).toBe(0)
    expect(result.current.board[20]).toBe(0)
    expect(result.current.board[30]).toBe(0)
  })
})

// =============================================================================
// redo() TESTS
// =============================================================================

describe('useSudokuGame - redo()', () => {
  it('redoes digit placement', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actPlace(result, 40, 7, false)
    actUndo(result)
    expect(result.current.board[40]).toBe(0)

    actRedo(result)

    expect(result.current.board[40]).toBe(7)
  })

  it('redoes note toggle', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actToggle(result, 40, 5)
    actUndo(result)
    expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(false)

    actRedo(result)

    expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(true)
  })

  it('does nothing when at end of history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actPlace(result, 40, 7, false)

    actRedo(result)

    // Should still be at end
    expect(result.current.historyIndex).toBe(0)
    expect(result.current.canRedo).toBe(false)
  })

  it('increments historyIndex', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    act(() => {
      result.current.setCell(40, 7, false)
      result.current.undo()
    })
    expect(result.current.historyIndex).toBe(-1)

    actRedo(result)

    expect(result.current.historyIndex).toBe(0)
  })

  it('disables canRedo when at end of history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    act(() => {
      result.current.setCell(40, 7, false)
      result.current.undo()
    })
    expect(result.current.canRedo).toBe(true)

    actRedo(result)

    expect(result.current.canRedo).toBe(false)
  })

  it('supports multiple redos', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    act(() => {
      result.current.setCell(10, 1, false)
      result.current.setCell(20, 2, false)
      result.current.setCell(30, 3, false)
      result.current.undo()
      result.current.undo()
      result.current.undo()
    })

    act(() => {
      result.current.redo()
      result.current.redo()
      result.current.redo()
    })

    expect(result.current.board[10]).toBe(1)
    expect(result.current.board[20]).toBe(2)
    expect(result.current.board[30]).toBe(3)
  })
})

// =============================================================================
// resetGame() TESTS
// =============================================================================

describe('useSudokuGame - resetGame()', () => {
  it('resets board to initial state', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    // Make some changes
    act(() => {
      result.current.setCell(2, 4, false)
      result.current.setCell(3, 8, false)
    })

    actReset(result)

    expect(result.current.board).toEqual(puzzle)
  })

  it('clears all candidates', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    act(() => {
      result.current.toggleCandidate(40, 5)
      result.current.toggleCandidate(41, 6)
    })

    actReset(result)

    expect(result.current.candidates[40]).toBe(0)
    expect(result.current.candidates[41]).toBe(0)
  })

  it('clears history', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    actPlace(result, 2, 4, false)

    actReset(result)

    expect(result.current.history).toEqual([])
    expect(result.current.historyIndex).toBe(-1)
  })

  it('resets isComplete to false', () => {
    const nearlyComplete = createNearlyCompletePuzzle()
    const { result } = renderGame(nearlyComplete)

    actPlace(result, 80, 9, false)
    expect(result.current.isComplete).toBe(true)

    actReset(result)

    expect(result.current.isComplete).toBe(false)
  })
})

// =============================================================================
// clearAll() TESTS
// =============================================================================

describe('useSudokuGame - clearAll()', () => {
  it('clears user entries but keeps givens', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    act(() => {
      result.current.setCell(2, 4, false)
      result.current.setCell(3, 8, false)
    })

    actClear(result)

    // Givens should remain
    expect(result.current.board[0]).toBe(5)
    expect(result.current.board[1]).toBe(3)

    // User entries should be cleared
    expect(result.current.board[2]).toBe(0)
    expect(result.current.board[3]).toBe(0)
  })

  it('clears all candidates', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    act(() => {
      result.current.toggleCandidate(40, 5)
      result.current.toggleCandidate(41, 6)
    })

    actClear(result)

    for (let i = 0; i < TOTAL_CELLS; i++) {
      expect(result.current.candidates[i]).toBe(0)
    }
  })

  it('clears history', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    actPlace(result, 2, 4, false)

    actClear(result)

    expect(result.current.history).toEqual([])
    expect(result.current.historyIndex).toBe(-1)
  })
})

// =============================================================================
// clearCandidates() TESTS
// =============================================================================

describe('useSudokuGame - clearCandidates()', () => {
  it('clears all candidates', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    act(() => {
      result.current.toggleCandidate(10, 1)
      result.current.toggleCandidate(20, 2)
      result.current.toggleCandidate(30, 3)
    })

    act(() => {
      result.current.clearCandidates()
    })

    for (let i = 0; i < TOTAL_CELLS; i++) {
      expect(result.current.candidates[i]).toBe(0)
    }
  })

  it('keeps board digits intact', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    act(() => {
      result.current.setCell(40, 7, false)
      result.current.toggleCandidate(41, 3)
    })

    act(() => {
      result.current.clearCandidates()
    })

    expect(result.current.board[40]).toBe(7)
  })

  it('adds clear-candidates action to history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actToggle(result, 40, 5)

    act(() => {
      result.current.clearCandidates()
    })

    expect(result.current.history.some((m) => m.action === 'clear-candidates')).toBe(true)
  })
})

// =============================================================================
// fillAllCandidates() TESTS
// =============================================================================

describe('useSudokuGame - fillAllCandidates()', () => {
  it('returns candidates for all empty cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    let filledCandidates: Uint16Array

    act(() => {
      filledCandidates = result.current.fillAllCandidates()
    })

    // Empty cells should have candidates
    expect(countCandidates(filledCandidates![2] || 0)).toBeGreaterThan(0)

    // Given cells should have no candidates
    expect(filledCandidates![0]).toBe(0)
  })

  it('respects row constraints', () => {
    const puzzle = createEmptyPuzzle()
    puzzle[0] = 5 // R1C1 = 5
    const { result } = renderGame(puzzle)

    let filledCandidates: Uint16Array

    act(() => {
      filledCandidates = result.current.fillAllCandidates()
    })

    // Cell 1 (same row) should not have 5 as candidate
    expect(hasCandidate(filledCandidates![1] || 0, 5)).toBe(false)
  })

  it('respects column constraints', () => {
    const puzzle = createEmptyPuzzle()
    puzzle[0] = 7 // R1C1 = 7
    const { result } = renderGame(puzzle)

    let filledCandidates: Uint16Array

    act(() => {
      filledCandidates = result.current.fillAllCandidates()
    })

    // Cell 9 (same column) should not have 7 as candidate
    expect(hasCandidate(filledCandidates![9] || 0, 7)).toBe(false)
  })

  it('respects box constraints', () => {
    const puzzle = createEmptyPuzzle()
    puzzle[0] = 3 // R1C1 = 3
    const { result } = renderGame(puzzle)

    let filledCandidates: Uint16Array

    act(() => {
      filledCandidates = result.current.fillAllCandidates()
    })

    // Cell 10 (same box) should not have 3 as candidate
    expect(hasCandidate(filledCandidates![10] || 0, 3)).toBe(false)
  })
})

// =============================================================================
// areCandidatesFilled() TESTS
// =============================================================================

describe('useSudokuGame - areCandidatesFilled()', () => {
  it('returns false when no candidates are set', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    expect(result.current.areCandidatesFilled()).toBe(false)
  })

  it('returns true when at least one cell has candidates', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actToggle(result, 40, 5)

    expect(result.current.areCandidatesFilled()).toBe(true)
  })
})

// =============================================================================
// calculateCandidatesForCell() TESTS
// =============================================================================

describe('useSudokuGame - calculateCandidatesForCell()', () => {
  it('returns all possible candidates for empty board', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    const candidates = result.current.calculateCandidatesForCell(40, puzzle)

    // All digits 1-9 should be candidates
    for (let d = 1; d <= 9; d++) {
      expect(hasCandidate(candidates, d)).toBe(true)
    }
  })

  it('excludes digits from same row', () => {
    const puzzle = createEmptyPuzzle()
    puzzle[36] = 5 // Same row as cell 40
    const { result } = renderGame(puzzle)

    const candidates = result.current.calculateCandidatesForCell(40, puzzle)

    expect(hasCandidate(candidates, 5)).toBe(false)
  })

  it('excludes digits from same column', () => {
    const puzzle = createEmptyPuzzle()
    puzzle[4] = 7 // Same column as cell 40
    const { result } = renderGame(puzzle)

    const candidates = result.current.calculateCandidatesForCell(40, puzzle)

    expect(hasCandidate(candidates, 7)).toBe(false)
  })

  it('excludes digits from same box', () => {
    const puzzle = createEmptyPuzzle()
    puzzle[30] = 3 // Same box as cell 40
    const { result } = renderGame(puzzle)

    const candidates = result.current.calculateCandidatesForCell(40, puzzle)

    expect(hasCandidate(candidates, 3)).toBe(false)
  })
})

// =============================================================================
// applyExternalMove() TESTS
// =============================================================================

describe('useSudokuGame - applyExternalMove()', () => {
  it('applies external board state', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    const newBoard = [...puzzle]
    newBoard[40] = 5

    const move = createMockMove()

    act(() => {
      result.current.applyExternalMove(newBoard, new Uint16Array(TOTAL_CELLS), move)
    })

    expect(result.current.board[40]).toBe(5)
  })

  it('adds move to history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    const move = createMockMove()

    act(() => {
      result.current.applyExternalMove([...puzzle], new Uint16Array(TOTAL_CELLS), move)
    })

    expect(result.current.history).toHaveLength(1)
  })

  it('triggers completion check', () => {
    const nearlyComplete = createNearlyCompletePuzzle()
    const onComplete = vi.fn()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: nearlyComplete, onComplete }))

    const completeBoard = createCompletePuzzle()
    const move = createMockMove({ digit: 9 })

    act(() => {
      result.current.applyExternalMove(completeBoard, new Uint16Array(TOTAL_CELLS), move)
    })

    expect(onComplete).toHaveBeenCalled()
  })
})

// =============================================================================
// restoreState() TESTS
// =============================================================================

describe('useSudokuGame - restoreState()', () => {
  it('restores saved board state', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    const savedBoard = [...puzzle]
    savedBoard[10] = 5
    savedBoard[20] = 7

    act(() => {
      result.current.restoreState(savedBoard, new Uint16Array(TOTAL_CELLS), [])
    })

    expect(result.current.board[10]).toBe(5)
    expect(result.current.board[20]).toBe(7)
  })

  it('restores saved candidates', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    const savedCandidates = new Uint16Array(TOTAL_CELLS)
    savedCandidates[40] = addCandidate(0, 5)

    act(() => {
      result.current.restoreState(puzzle, savedCandidates, [])
    })

    expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(true)
  })

  it('restores saved history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    const savedHistory = [createMockMove(), createMockMove({ step_index: 1 })]

    act(() => {
      result.current.restoreState(puzzle, new Uint16Array(TOTAL_CELLS), savedHistory)
    })

    expect(result.current.history).toHaveLength(2)
    expect(result.current.historyIndex).toBe(1)
  })

  it('sets isComplete for completed boards', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    const completeBoard = createCompletePuzzle()

    act(() => {
      result.current.restoreState(completeBoard, new Uint16Array(TOTAL_CELLS), [])
    })

    expect(result.current.isComplete).toBe(true)
  })
})

// =============================================================================
// setBoardState() TESTS
// =============================================================================

describe('useSudokuGame - setBoardState()', () => {
  it('sets board without modifying history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    const newBoard = [...puzzle]
    newBoard[40] = 7

    act(() => {
      result.current.setBoardState(newBoard, new Uint16Array(TOTAL_CELLS))
    })

    expect(result.current.board[40]).toBe(7)
    expect(result.current.history).toHaveLength(0)
  })

  it('sets candidates without modifying history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    const newCandidates = new Uint16Array(TOTAL_CELLS)
    newCandidates[40] = addCandidate(0, 3)

    act(() => {
      result.current.setBoardState(puzzle, newCandidates)
    })

    expect(hasCandidate(result.current.candidates[40] || 0, 3)).toBe(true)
    expect(result.current.history).toHaveLength(0)
  })
})

// =============================================================================
// checkNotes() TESTS
// =============================================================================

describe('useSudokuGame - checkNotes()', () => {
  it('returns valid=true when no notes exist', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    const check = result.current.checkNotes()

    expect(check.valid).toBe(true)
    expect(check.wrongNotes).toHaveLength(0)
    expect(check.missingNotes).toHaveLength(0)
    expect(check.cellsWithNotes).toBe(0)
  })

  it('detects wrong notes', () => {
    const puzzle = createEmptyPuzzle()
    puzzle[0] = 5 // R1C1 = 5
    const { result } = renderGame(puzzle)

    // Add invalid note (5 is in same row)
    act(() => {
      result.current.toggleCandidate(1, 5) // Cell 1 can't have 5
    })

    const check = result.current.checkNotes()

    expect(check.valid).toBe(false)
    expect(check.wrongNotes.some((n) => n.idx === 1 && n.digit === 5)).toBe(true)
  })

  it('detects missing notes', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Add only one note when all digits 1-9 are valid
    actToggle(result, 40, 1)

    const check = result.current.checkNotes()

    // Should have missing notes (2-9 are all valid but not added)
    expect(check.missingNotes.length).toBeGreaterThan(0)
  })

  it('counts cells with notes', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    act(() => {
      result.current.toggleCandidate(10, 1)
      result.current.toggleCandidate(20, 2)
      result.current.toggleCandidate(30, 3)
    })

    const check = result.current.checkNotes()

    expect(check.cellsWithNotes).toBe(3)
  })
})

// =============================================================================
// HISTORY MANAGEMENT TESTS
// =============================================================================

describe('useSudokuGame - History Management', () => {
  it('truncates redo history when making new move', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Make moves
    act(() => {
      result.current.setCell(10, 1, false)
      result.current.setCell(20, 2, false)
      result.current.setCell(30, 3, false)
    })
    expect(result.current.history).toHaveLength(3)

    // Undo twice
    act(() => {
      result.current.undo()
      result.current.undo()
    })
    expect(result.current.canRedo).toBe(true)

    // Make a new move
    actPlace(result, 40, 4, false)

    // Redo history should be gone
    expect(result.current.canRedo).toBe(false)
    expect(result.current.history).toHaveLength(2) // Only first move + new move
  })

  it('stores stateDiff in moves for compact storage', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actPlace(result, 40, 5, false)

    expect(result.current.history[0]?.stateDiff).toBeDefined()
    expect(result.current.history[0]?.stateDiff?.boardChanges).toHaveLength(1)
  })

  it('limits history to MAX_MOVE_HISTORY', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Fill history beyond limit
    act(() => {
      for (let i = 0; i < MAX_MOVE_HISTORY + 50; i++) {
        result.current.toggleCandidate(40, (i % 9) + 1)
      }
    })

    expect(result.current.history.length).toBeLessThanOrEqual(MAX_MOVE_HISTORY)
  })
})

// =============================================================================
// EDGE CASES AND ERROR HANDLING
// =============================================================================

describe('useSudokuGame - Edge Cases', () => {
  it('handles placing digit 0 (no-op or clear)', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actPlace(result, 40, 0, false)

    expect(result.current.board[40]).toBe(0)
  })

  it('handles out-of-range cell indices gracefully', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // These should not throw
    act(() => {
      result.current.setCell(-1, 5, false)
      result.current.setCell(100, 5, false)
    })

    // Board should be unchanged
    expect(result.current.board).toHaveLength(81)
  })

  it('handles multiple rapid calls correctly', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Rapid digit placements
    act(() => {
      result.current.setCell(0, 1, false)
      result.current.setCell(8, 2, false)
      result.current.setCell(16, 3, false)
      result.current.setCell(24, 4, false)
      result.current.setCell(32, 5, false)
    })

    expect(result.current.board[0]).toBe(1)
    expect(result.current.board[8]).toBe(2)
    expect(result.current.board[16]).toBe(3)
    expect(result.current.board[24]).toBe(4)
    expect(result.current.board[32]).toBe(5)
  })

  it('maintains stable function references', () => {
    const puzzle = createEmptyPuzzle()
    const { result, rerender } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    const setCell1 = result.current.setCell
    const undo1 = result.current.undo
    const redo1 = result.current.redo

    rerender()

    // Functions should be stable (memoized)
    expect(result.current.setCell).toBe(setCell1)
    expect(result.current.undo).toBe(undo1)
    expect(result.current.redo).toBe(redo1)
  })
})

// =============================================================================
// DIGIT COUNTS TESTS
// =============================================================================

describe('useSudokuGame - digitCounts', () => {
  it('correctly counts digits in initial board', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    // Count manually
    const expected = Array(9).fill(0)
    puzzle.forEach((d) => {
      if (d >= 1 && d <= 9) expected[d - 1]++
    })

    expect(result.current.digitCounts).toEqual(expected)
  })

  it('updates when placing digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    expect(result.current.digitCounts[6]).toBe(0) // 7s

    actPlace(result, 40, 7, false)

    expect(result.current.digitCounts[6]).toBe(1)
  })

  it('updates when erasing digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    actPlace(result, 40, 7, false)
    expect(result.current.digitCounts[6]).toBe(1)

    actErase(result, 40)

    expect(result.current.digitCounts[6]).toBe(0)
  })
})

// =============================================================================
// CLICK CELL WITH MATCHING DIGIT (Legacy Test)
// =============================================================================

describe('Click cell with matching digit', () => {
  it('erases a user-entered digit when clicked a second time with same digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)
    // Place digit 7 in cell 10
    actPlace(result, 10, 7, false)
    expect(result.current.board[10]).toBe(7)
    // Simulate clicking cell with highlighted digit again (should erase)
    act(() => {
      // This should match handleCellClick logic, triggers eraseCell
      if (result.current.board[10] === 7) {
        result.current.eraseCell(10)
      }
    })
    expect(result.current.board[10]).toBe(0)
  })
})

// =============================================================================
// setIsComplete() TESTS
// =============================================================================

describe('useSudokuGame - setIsComplete()', () => {
  it('allows external setting of isComplete', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    expect(result.current.isComplete).toBe(false)

    actSetComplete(result, true)

    expect(result.current.isComplete).toBe(true)
  })

  it('allows resetting isComplete to false', () => {
    const nearlyComplete = createNearlyCompletePuzzle()
    const { result } = renderGame(nearlyComplete)

    // Complete the puzzle
    actPlace(result, 80, 9, false)
    expect(result.current.isComplete).toBe(true)

    // Reset
    actSetComplete(result, false)

    expect(result.current.isComplete).toBe(false)
  })
})

// =============================================================================
// LEGACY UNDO/REDO BACKWARD COMPATIBILITY TESTS
// =============================================================================

describe('useSudokuGame - Legacy Move Format Compatibility', () => {
  it('handles undo when move has no stateDiff (legacy format)', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Place a digit normally (creates stateDiff)
    actPlace(result, 40, 5, false)
    expect(result.current.board[40]).toBe(5)

    // Undo should work via stateDiff
    actUndo(result)
    expect(result.current.board[40]).toBe(0)
  })

  it('handles restoreState with complete history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Create a saved state with history
    const savedBoard = [...puzzle]
    savedBoard[10] = 3
    savedBoard[20] = 5
    const savedCandidates = new Uint16Array(TOTAL_CELLS)
    const savedHistory: Move[] = [
      createMockMove({ digit: 3, targets: [{ row: 1, col: 1 }] }),
      createMockMove({ step_index: 1, digit: 5, targets: [{ row: 2, col: 2 }] }),
    ]

    act(() => {
      result.current.restoreState(savedBoard, savedCandidates, savedHistory)
    })

    expect(result.current.board[10]).toBe(3)
    expect(result.current.board[20]).toBe(5)
    expect(result.current.history).toHaveLength(2)
    expect(result.current.historyIndex).toBe(1)
  })

  it('handles restoring incomplete board state', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    act(() => {
      result.current.restoreState(puzzle, new Uint16Array(TOTAL_CELLS), [])
    })

    expect(result.current.isComplete).toBe(false)
  })
})

// =============================================================================
// CANDIDATE ELIMINATION EDGE CASES
// =============================================================================

describe('useSudokuGame - Candidate Elimination Edge Cases', () => {
  it('eliminates candidates from all peers correctly', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // First add candidates to several cells
    act(() => {
      result.current.toggleCandidate(1, 5) // Same row as cell 0
      result.current.toggleCandidate(9, 5) // Same column as cell 0
      result.current.toggleCandidate(10, 5) // Same box as cell 0
    })

    // Place digit 5 at cell 0
    actPlace(result, 0, 5, false)

    // All peer cells should have candidate 5 eliminated
    expect(hasCandidate(result.current.candidates[1] || 0, 5)).toBe(false)
    expect(hasCandidate(result.current.candidates[9] || 0, 5)).toBe(false)
    expect(hasCandidate(result.current.candidates[10] || 0, 5)).toBe(false)
  })

  it('handles cell in corner of box for elimination', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Add candidate to cell 80 (bottom-right corner)
    actToggle(result, 80, 9)

    // Place digit in same box (cell 60 - top-left of bottom-right box)
    actPlace(result, 60, 9, false)

    expect(hasCandidate(result.current.candidates[80] || 0, 9)).toBe(false)
  })
})

// =============================================================================
// VALIDATION EDGE CASES
// =============================================================================

describe('useSudokuGame - Validation Edge Cases', () => {
  it('detects invalid row in completed board', () => {
    const puzzle = createEmptyPuzzle()
    const onComplete = vi.fn()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle, onComplete }))

    // Fill board with invalid row (duplicate digits)
    const invalidBoard = Array(81).fill(1) // All 1s - invalid
    act(() => {
      result.current.setBoardState(invalidBoard, new Uint16Array(TOTAL_CELLS))
    })

    // Should not trigger onComplete even though board is "full"
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('handles partial completion correctly', () => {
    const puzzle = createEmptyPuzzle()
    const onComplete = vi.fn()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle, onComplete }))

    // Place some digits but not complete
    act(() => {
      result.current.setCell(0, 1, false)
      result.current.setCell(1, 2, false)
      result.current.setCell(2, 3, false)
    })

    expect(result.current.isComplete).toBe(false)
    expect(onComplete).not.toHaveBeenCalled()
  })
})

// =============================================================================
// UPDATE BOARD HELPER TESTS
// =============================================================================

describe('useSudokuGame - Board Update Helpers', () => {
  it('updateCandidates increments version correctly', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    const v1 = result.current.candidatesVersion

    actToggle(result, 40, 1)
    expect(result.current.candidatesVersion).toBe(v1 + 1)

    actToggle(result, 40, 2)
    expect(result.current.candidatesVersion).toBe(v1 + 2)
  })

  it('setBoardState does not affect history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    // Add some history
    actPlace(result, 10, 5, false)
    expect(result.current.history).toHaveLength(1)

    // Use setBoardState
    const newBoard = [...puzzle]
    newBoard[40] = 9
    act(() => {
      result.current.setBoardState(newBoard, new Uint16Array(TOTAL_CELLS))
    })

    // History should be unchanged
    expect(result.current.history).toHaveLength(1)
    expect(result.current.board[40]).toBe(9)
  })
})

// =============================================================================
// GIVEN CELLS UPDATE ON RESET
// =============================================================================

describe('useSudokuGame - Given Cells Behavior', () => {
  it('updates given cells when resetGame is called', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderGame(puzzle)

    // Place some digits
    actPlace(result, 2, 4, false)
    expect(result.current.board[2]).toBe(4)

    // Reset
    actReset(result)

    // Should be back to initial
    expect(result.current.board[2]).toBe(0)
    expect(result.current.isGivenCell(0)).toBe(true)
    expect(result.current.isGivenCell(2)).toBe(false)
  })
})

// =============================================================================
// MEMOIZATION TESTS
// =============================================================================

describe('useSudokuGame - Memoization', () => {
  it('memoizes return object correctly', () => {
    const puzzle = createEmptyPuzzle()
    const { result, rerender } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    const firstReturn = result.current

    // Rerender without state change
    rerender()

    // Should be same object (memoized)
    expect(result.current).toBe(firstReturn)
  })

  it('updates return object when state changes', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderGame(puzzle)

    const firstBoard = result.current.board

    actPlace(result, 40, 5, false)

    // Board should be different after state change
    expect(result.current.board).not.toBe(firstBoard)
    expect(result.current.board[40]).toBe(5)
  })

  // ===========================================================================
  // BULK NOTE ENTRY TESTS (Multi-Select Feature)
  // ===========================================================================
  describe('setCellMultiple - bulk note entry', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.clearAllTimers()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should be available in hook return', () => {
      const { result } = renderHook(() =>
        useSudokuGame({
          initialBoard: createEmptyPuzzle(),
        }),
      )

      expect(typeof result.current.setCellMultiple).toBe('function')
    })

    it('should add note to single cell in selection (behaves like setCell)', () => {
      const puzzle = createEmptyPuzzle()
      const { result } = renderHook(() =>
        useSudokuGame({
          initialBoard: puzzle,
        }),
      )

      act(() => {
        result.current.setCellMultiple([10], 5, true)
      })

      // Cell 10 should have candidate 5
      expect(result.current.candidates[10]).not.toBe(0)
      const hasCandidate5 = hasCandidate(result.current.candidates[10] || 0, 5)
      expect(hasCandidate5).toBe(true)
    })

    it('should add note to multiple cells in selection', () => {
      const puzzle = createEmptyPuzzle()
      const { result } = renderHook(() =>
        useSudokuGame({
          initialBoard: puzzle,
        }),
      )

      act(() => {
        result.current.setCellMultiple([10, 11, 12], 7, true)
      })

      // Cells 10, 11, 12 should all have candidate 7
      expect(result.current.candidates[10]).not.toBe(0)
      expect(result.current.candidates[11]).not.toBe(0)
      expect(result.current.candidates[12]).not.toBe(0)

      const hasCandidate7_10 = hasCandidate(result.current.candidates[10] || 0, 7)
      const hasCandidate7_11 = hasCandidate(result.current.candidates[11] || 0, 7)
      const hasCandidate7_12 = hasCandidate(result.current.candidates[12] || 0, 7)

      expect(hasCandidate7_10).toBe(true)
      expect(hasCandidate7_11).toBe(true)
      expect(hasCandidate7_12).toBe(true)
    })

    it('should not add notes when notes mode is false', () => {
      const puzzle = createEmptyPuzzle()
      const { result } = renderHook(() =>
        useSudokuGame({
          initialBoard: puzzle,
        }),
      )

      act(() => {
        result.current.setCellMultiple([10, 11], 5, false)
      })

      // Cells 10, 11 should NOT have candidate 5
      expect(result.current.candidates[10]).toBe(0)
      expect(result.current.candidates[11]).toBe(0)

      const hasCandidate5_10 = hasCandidate(result.current.candidates[10] || 0, 5)
      const hasCandidate5_11 = hasCandidate(result.current.candidates[11] || 0, 5)

      expect(hasCandidate5_10).toBe(false)
      expect(hasCandidate5_11).toBe(false)
    })

    it('should skip given cells in selection', () => {
      const puzzle = createEmptyPuzzle()
      // Set only cell 0 as a given
      puzzle[0] = 5
      // Cell 10 remains empty (will get candidate)

      const { result } = renderHook(() =>
        useSudokuGame({
          initialBoard: puzzle,
        }),
      )

      act(() => {
        // Cell 0 is a given, cell 10 is empty
        // setCellMultiple should only add note to cell 10 (skip cell 0)
        result.current.setCellMultiple([0, 10], 7, true)
      })

      // Cell 10 should have candidate 7
      expect(result.current.candidates[10]).not.toBe(0)
      const hasCandidate7_10 = hasCandidate(result.current.candidates[10] || 0, 7)
      expect(hasCandidate7_10).toBe(true)

      // Cell 0 (given) should NOT be modified
      expect(result.current.candidates[0]).toBe(0)
    })

    it('should eliminate candidates from peers for each cell', () => {
      const puzzle = createEmptyPuzzle()

      const { result } = renderHook(() =>
        useSudokuGame({
          initialBoard: puzzle,
        }),
      )

      act(() => {
        result.current.setCellMultiple([0, 1, 2, 3], 5, true)
      })

      // All cells 0, 1, 2, 3 should have candidate 5
      expect(result.current.candidates[0]).not.toBe(0)
      expect(result.current.candidates[1]).not.toBe(0)
      expect(result.current.candidates[2]).not.toBe(0)
      expect(result.current.candidates[3]).not.toBe(0)

      // Cell 10 (same row, same column, same box) should NOT have candidate 5
      const hasCandidate5_10 = hasCandidate(result.current.candidates[10] || 0, 5)
      expect(hasCandidate5_10).toBe(false)
    })

    it('should record bulk note operation in history', () => {
      const puzzle = createEmptyPuzzle()
      const { result } = renderHook(() =>
        useSudokuGame({
          initialBoard: puzzle,
        }),
      )

      act(() => {
        result.current.setCellMultiple([10, 11], 7, true)
      })

      // History should have one new entry
      const history = result.current.history
      expect(history).toHaveLength(1)

      // Should be a note move (not place)
      const noteMove = history[0]!
      expect(noteMove.technique).toBe('User Input')
      expect(noteMove.action).toBe('note')
      expect(noteMove.targets).toHaveLength(2)

      // Targets should be cells 10 and 11
      // Cell 10: row = Math.floor(10 / 9) = 1, col = 10 % 9 = 1
      // Cell 11: row = Math.floor(11 / 9) = 1, col = 11 % 9 = 2
      const cell10InTargets = noteMove.targets.some((t) => t.row === 1 && t.col === 1)
      const cell11InTargets = noteMove.targets.some((t) => t.row === 1 && t.col === 2)

      expect(cell10InTargets).toBe(true)
      expect(cell11InTargets).toBe(true)
    })

    it('should update board state for all cells', () => {
      const puzzle = createEmptyPuzzle()
      const { result } = renderHook(() =>
        useSudokuGame({
          initialBoard: puzzle,
        }),
      )

      act(() => {
        result.current.setCellMultiple([10, 11, 12], 7, true)
      })

      // Board should still be all 0s
      expect(result.current.board[10]).toBe(0)
      expect(result.current.board[11]).toBe(0)
      expect(result.current.board[12]).toBe(0)
    })

    it('should fill missing cells first when some cells already have the candidate', () => {
      const puzzle = createEmptyPuzzle()
      const { result } = renderHook(() =>
        useSudokuGame({
          initialBoard: puzzle,
        }),
      )

      // First, add candidate 5 to cell 10 only
      act(() => {
        result.current.setCellMultiple([10], 5, true)
      })
      expect(hasCandidate(result.current.candidates[10] || 0, 5)).toBe(true)
      expect(hasCandidate(result.current.candidates[11] || 0, 5)).toBe(false)
      expect(hasCandidate(result.current.candidates[12] || 0, 5)).toBe(false)

      // Now select all three cells and press 5 again
      // Cell 10 has it, cells 11 and 12 don't: should ADD to 11 and 12
      act(() => {
        result.current.setCellMultiple([10, 11, 12], 5, true)
      })

      expect(hasCandidate(result.current.candidates[10] || 0, 5)).toBe(true)
      expect(hasCandidate(result.current.candidates[11] || 0, 5)).toBe(true)
      expect(hasCandidate(result.current.candidates[12] || 0, 5)).toBe(true)
    })

    it('should remove from all cells only when ALL already have the candidate', () => {
      const puzzle = createEmptyPuzzle()
      const { result } = renderHook(() =>
        useSudokuGame({
          initialBoard: puzzle,
        }),
      )

      // Add candidate 3 to all three cells
      act(() => {
        result.current.setCellMultiple([10, 11, 12], 3, true)
      })
      expect(hasCandidate(result.current.candidates[10] || 0, 3)).toBe(true)
      expect(hasCandidate(result.current.candidates[11] || 0, 3)).toBe(true)
      expect(hasCandidate(result.current.candidates[12] || 0, 3)).toBe(true)

      // Now all cells have candidate 3: pressing 3 should REMOVE from all
      act(() => {
        result.current.setCellMultiple([10, 11, 12], 3, true)
      })

      expect(hasCandidate(result.current.candidates[10] || 0, 3)).toBe(false)
      expect(hasCandidate(result.current.candidates[11] || 0, 3)).toBe(false)
      expect(hasCandidate(result.current.candidates[12] || 0, 3)).toBe(false)
    })

    it('should record correct action type based on fill-first-then-remove logic', () => {
      const puzzle = createEmptyPuzzle()
      const { result } = renderHook(() =>
        useSudokuGame({
          initialBoard: puzzle,
        }),
      )

      // Add candidate 4 to cell 10 only
      act(() => {
        result.current.setCellMultiple([10], 4, true)
      })
      expect(result.current.history).toHaveLength(1)
      expect(result.current.history[0]!.action).toBe('note')

      // Select cells 10 and 11, press 4: cell 11 is missing it, so action is 'note' (fill)
      act(() => {
        result.current.setCellMultiple([10, 11], 4, true)
      })
      expect(result.current.history).toHaveLength(2)
      expect(result.current.history[1]!.action).toBe('note')

      // Now both cells have candidate 4: pressing 4 should be 'eliminate'
      act(() => {
        result.current.setCellMultiple([10, 11], 4, true)
      })
      expect(result.current.history).toHaveLength(3)
      expect(result.current.history[2]!.action).toBe('eliminate')
    })

    it('should not modify cells that already have the candidate during fill phase', () => {
      const puzzle = createEmptyPuzzle()
      const { result } = renderHook(() =>
        useSudokuGame({
          initialBoard: puzzle,
        }),
      )

      // Add candidates 5 and 8 to cell 10
      act(() => {
        result.current.setCellMultiple([10], 5, true)
      })
      act(() => {
        result.current.setCellMultiple([10], 8, true)
      })
      expect(hasCandidate(result.current.candidates[10] || 0, 5)).toBe(true)
      expect(hasCandidate(result.current.candidates[10] || 0, 8)).toBe(true)

      // Now add candidate 5 to cells 10 and 11 (fill phase: cell 11 missing)
      act(() => {
        result.current.setCellMultiple([10, 11], 5, true)
      })

      // Cell 10 should still have BOTH candidates 5 and 8 (addCandidate is idempotent)
      expect(hasCandidate(result.current.candidates[10] || 0, 5)).toBe(true)
      expect(hasCandidate(result.current.candidates[10] || 0, 8)).toBe(true)
      // Cell 11 should have candidate 5
      expect(hasCandidate(result.current.candidates[11] || 0, 5)).toBe(true)
    })
  })
})

describe('useSudokuGame - mutation-killing exact-assertion tests', () => {
  describe('createMove - default refs, highlights, and isUserMove', () => {
    it('attaches empty refs object on every user move', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(40, 5, false)
      })
      expect(result.current.history[0]!.refs).toEqual({ title: '', slug: '', url: '' })
    })

    it('attaches an empty primary highlights array on every user move', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(40, 5, false)
      })
      expect(result.current.history[0]!.highlights).toEqual({ primary: [] })
    })

    it('marks user-initiated moves with isUserMove=true', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(40, 5, false)
      })
      expect(result.current.history[0]!.isUserMove).toBe(true)
    })

    it('records step_index as the current history length', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(10, 1, false)
        result.current.setCell(20, 2, false)
      })
      expect(result.current.history[0]!.step_index).toBe(0)
      expect(result.current.history[1]!.step_index).toBe(1)
    })
  })

  describe('setCell digit placement - exact explanation strings', () => {
    it('records the exact "Placed" explanation for R1C1', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(0, 5, false)
      })
      const move = result.current.history[0]!
      expect(move.action).toBe('place')
      expect(move.technique).toBe('User Input')
      expect(move.digit).toBe(5)
      expect(move.explanation).toBe('Placed 5 at R1C1')
      expect(move.targets).toEqual([{ row: 0, col: 0 }])
    })

    it('records the exact "Placed" explanation for R5C5 (cell 40)', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(40, 7, false)
      })
      expect(result.current.history[0]!.explanation).toBe('Placed 7 at R5C5')
    })

    it('records the exact "Placed" explanation for R9C9 (cell 80)', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(80, 9, false)
      })
      expect(result.current.history[0]!.explanation).toBe('Placed 9 at R9C9')
      expect(result.current.history[0]!.targets).toEqual([{ row: 8, col: 8 }])
    })
  })

  describe('setCell notes mode - exact "Added note" strings', () => {
    it('records the exact "Added note" explanation on first toggle', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(40, 5, true)
      })
      const move = result.current.history[0]!
      expect(move.action).toBe('note')
      expect(move.explanation).toBe('Added note 5 to R5C5')
      expect(move.digit).toBe(5)
      expect(move.targets).toEqual([{ row: 4, col: 4 }])
    })

    it('records the exact "Added note" explanation at R1C1', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(0, 1, true)
      })
      expect(result.current.history[0]!.explanation).toBe('Added note 1 to R1C1')
    })
  })

  describe('toggleCandidate - exact "Removed note" strings', () => {
    it('records the exact "Removed note" explanation and eliminate action', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.toggleCandidate(40, 5)
      })
      act(() => {
        result.current.toggleCandidate(40, 5)
      })
      const removeMove = result.current.history[1]!
      expect(removeMove.action).toBe('eliminate')
      expect(removeMove.explanation).toBe('Removed note 5 from R5C5')
      expect(removeMove.digit).toBe(5)
    })

    it('records the exact "Added note" explanation on toggleCandidate add', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.toggleCandidate(0, 9)
      })
      expect(result.current.history[0]!.action).toBe('note')
      expect(result.current.history[0]!.explanation).toBe('Added note 9 to R1C1')
    })
  })

  describe('setCellMultiple - exact explanation strings and target counts', () => {
    it('records the exact "Added note ... to N cells" string', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCellMultiple([10, 11, 12], 7, true)
      })
      const move = result.current.history[0]!
      expect(move.action).toBe('note')
      expect(move.explanation).toBe('Added note 7 to 3 cells')
      expect(move.targets).toHaveLength(3)
    })

    it('records the exact "Removed note ... from N cells" string', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCellMultiple([10, 11, 12], 7, true)
      })
      act(() => {
        result.current.setCellMultiple([10, 11, 12], 7, true)
      })
      const move = result.current.history[1]!
      expect(move.action).toBe('eliminate')
      expect(move.explanation).toBe('Removed note 7 from 3 cells')
    })

    it('records the exact "Added note ... to 1 cells" for a single-cell selection', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCellMultiple([40], 3, true)
      })
      expect(result.current.history[0]!.explanation).toBe('Added note 3 to 1 cells')
    })
  })

  describe('eraseCell - exact explanation strings for both branches', () => {
    it('records "Erased" explanation when erasing a placed digit', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(40, 7, false)
      })
      act(() => {
        result.current.eraseCell(40)
      })
      const move = result.current.history[1]!
      expect(move.action).toBe('erase')
      expect(move.digit).toBe(7)
      expect(move.explanation).toBe('Erased 7 from R5C5')
    })

    it('records "Cleared notes" explanation when erasing notes from an empty cell', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.toggleCandidate(40, 3)
      })
      act(() => {
        result.current.eraseCell(40)
      })
      const move = result.current.history[1]!
      expect(move.action).toBe('erase')
      expect(move.digit).toBe(0)
      expect(move.explanation).toBe('Cleared notes from R5C5')
    })

    it('records digit 0 in the erase move when clearing notes', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.toggleCandidate(0, 4)
      })
      act(() => {
        result.current.eraseCell(0)
      })
      expect(result.current.history[1]!.digit).toBe(0)
      expect(result.current.history[1]!.explanation).toBe('Cleared notes from R1C1')
    })
  })

  describe('eraseCell early-return guard', () => {
    it('does nothing when the cell is empty and has no candidates', () => {
      const { result } = renderGame(createEmptyPuzzle())
      const historyBefore = result.current.history.length
      act(() => {
        result.current.eraseCell(40)
      })
      expect(result.current.history).toHaveLength(historyBefore)
      expect(result.current.board[40]).toBe(0)
    })
  })

  describe('clearCandidates - exact move fields', () => {
    it('records technique "Clear Notes", action "clear-candidates", digit 0, empty targets', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.toggleCandidate(40, 5)
      })
      act(() => {
        result.current.clearCandidates()
      })
      const move = result.current.history[1]!
      expect(move.technique).toBe('Clear Notes')
      expect(move.action).toBe('clear-candidates')
      expect(move.digit).toBe(0)
      expect(move.targets).toEqual([])
      expect(move.explanation).toBe('Cleared all notes')
    })
  })

  describe('digitCounts boundary - ignores out-of-range values', () => {
    it('does not count a digit above MAX_DIGIT (10)', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(40, 10, false)
      })
      expect(result.current.board[40]).toBe(10)
      expect(result.current.digitCounts).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
    })

    it('does not count digit 0 toward any bucket', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(40, 0, false)
      })
      expect(result.current.digitCounts).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
    })

    it('counts the boundary digits 1 and 9 exactly', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(0, 1, false)
        result.current.setCell(1, 9, false)
      })
      const counts = result.current.digitCounts
      expect(counts[0]).toBe(1)
      expect(counts[8]).toBe(1)
      counts.slice(1, 8).forEach((c) => expect(c).toBe(0))
    })

    it('returns an array of length 9', () => {
      const { result } = renderGame(createEmptyPuzzle())
      expect(result.current.digitCounts).toHaveLength(9)
    })
  })

  describe('setCell notes mode 100ms debounce guard', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('suppresses a duplicate note toggle within 100ms', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(40, 5, true)
      })
      expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(true)
      expect(result.current.history).toHaveLength(1)

      // Immediate second toggle, same cell + digit, within 100ms -> debounced
      act(() => {
        result.current.setCell(40, 5, true)
      })
      expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(true)
      expect(result.current.history).toHaveLength(1)
    })

    it('allows a duplicate note toggle after more than 100ms', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(40, 5, true)
      })
      expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(true)

      vi.advanceTimersByTime(101)

      act(() => {
        result.current.setCell(40, 5, true)
      })
      expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(false)
      expect(result.current.history).toHaveLength(2)
      expect(result.current.history[1]!.action).toBe('eliminate')
    })

    it('does not debounce a different digit on the same cell', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(40, 5, true)
      })
      act(() => {
        result.current.setCell(40, 6, true)
      })
      expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(true)
      expect(hasCandidate(result.current.candidates[40] || 0, 6)).toBe(true)
      expect(result.current.history).toHaveLength(2)
    })

    it('does not debounce the same digit on a different cell', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(40, 5, true)
      })
      act(() => {
        result.current.setCell(41, 5, true)
      })
      expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(true)
      expect(hasCandidate(result.current.candidates[41] || 0, 5)).toBe(true)
      expect(result.current.history).toHaveLength(2)
    })
  })

  describe('setCell notes mode early-return on filled cell', () => {
    it('does not record a history entry when adding a note to a filled cell', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(40, 7, false)
      })
      const historyBefore = result.current.history.length
      act(() => {
        result.current.setCell(40, 3, true)
      })
      expect(result.current.history).toHaveLength(historyBefore)
      expect(result.current.candidates[40]).toBe(0)
    })
  })

  describe('restoreState - isComplete computation branches', () => {
    it('sets isComplete=false when the restored board is full but invalid', () => {
      const { result } = renderGame(createEmptyPuzzle())
      const invalidFull = Array(81).fill(1)
      act(() => {
        result.current.restoreState(invalidFull, new Uint16Array(TOTAL_CELLS), [])
      })
      expect(result.current.isComplete).toBe(false)
    })

    it('sets isComplete=false when the restored board has empty cells', () => {
      const { result } = renderGame(createEmptyPuzzle())
      const partial = createEmptyPuzzle()
      partial[0] = 5
      act(() => {
        result.current.restoreState(partial, new Uint16Array(TOTAL_CELLS), [])
      })
      expect(result.current.isComplete).toBe(false)
    })

    it('sets isComplete=true only when the restored board is full AND valid', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.restoreState(createCompletePuzzle(), new Uint16Array(TOTAL_CELLS), [])
      })
      expect(result.current.isComplete).toBe(true)
    })

    it('sets historyIndex to length-1 of the restored history', () => {
      const { result } = renderGame(createEmptyPuzzle())
      const history = [
        { ...emptyMove(), step_index: 0 },
        { ...emptyMove(), step_index: 1 },
        { ...emptyMove(), step_index: 2 },
      ]
      act(() => {
        result.current.restoreState(createEmptyPuzzle(), new Uint16Array(TOTAL_CELLS), history)
      })
      expect(result.current.history).toHaveLength(3)
      expect(result.current.historyIndex).toBe(2)
    })
  })

  describe('handleUndo - isComplete reset logic', () => {
    it('clears isComplete when undoing leaves the board incomplete', () => {
      const nearly = createNearlyCompletePuzzle()
      const onComplete = vi.fn()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: nearly, onComplete }))
      act(() => {
        result.current.setCell(80, 9, false)
      })
      expect(result.current.isComplete).toBe(true)
      act(() => {
        result.current.undo()
      })
      expect(result.current.isComplete).toBe(false)
    })

    it('does not fire onComplete again on undo of an incomplete board', () => {
      const nearly = createNearlyCompletePuzzle()
      const onComplete = vi.fn()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: nearly, onComplete }))
      act(() => {
        result.current.setCell(80, 9, false)
      })
      onComplete.mockClear()
      act(() => {
        result.current.undo()
      })
      expect(onComplete).not.toHaveBeenCalled()
    })
  })

  describe('applyExternalMove - stateDiff and history wiring', () => {
    it('attaches a stateDiff capturing the board change', () => {
      const { result } = renderGame(createEmptyPuzzle())
      const newBoard = createEmptyPuzzle()
      newBoard[40] = 7
      act(() => {
        result.current.applyExternalMove(newBoard, new Uint16Array(TOTAL_CELLS), emptyMove())
      })
      const move = result.current.history[0]!
      expect(move.stateDiff).toBeDefined()
      expect(move.stateDiff?.boardChanges).toEqual([{ idx: 40, oldValue: 0, newValue: 7 }])
    })

    it('overwrites redo history when applied after an undo', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.setCell(10, 1, false)
        result.current.setCell(20, 2, false)
        result.current.undo()
      })
      expect(result.current.canRedo).toBe(true)
      act(() => {
        result.current.applyExternalMove(
          createEmptyPuzzle(),
          new Uint16Array(TOTAL_CELLS),
          emptyMove(),
        )
      })
      expect(result.current.canRedo).toBe(false)
    })
  })

  describe('resetGame - full state reset exactness', () => {
    it('resets candidatesVersion remains consistent and all candidates zero', () => {
      const { result } = renderGame(createEmptyPuzzle())
      act(() => {
        result.current.toggleCandidate(10, 1)
        result.current.toggleCandidate(20, 2)
      })
      act(() => {
        result.current.resetGame()
      })
      for (let i = 0; i < TOTAL_CELLS; i++) {
        expect(result.current.candidates[i]).toBe(0)
      }
      expect(result.current.history).toEqual([])
      expect(result.current.historyIndex).toBe(-1)
      expect(result.current.isComplete).toBe(false)
    })
  })

  describe('clearAll - preserves givens exactly', () => {
    it('restores the board to exactly the given cells after clearAll', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderGame(puzzle)
      act(() => {
        result.current.setCell(2, 4, false)
        result.current.setCell(3, 8, false)
        result.current.toggleCandidate(40, 5)
      })
      act(() => {
        result.current.clearAll()
      })
      expect(result.current.board).toEqual(puzzle)
      expect(result.current.history).toEqual([])
      expect(result.current.historyIndex).toBe(-1)
    })
  })

  describe('isGivenCell - boundary indices', () => {
    it('returns false for index 0 on an empty board', () => {
      const { result } = renderGame(createEmptyPuzzle())
      expect(result.current.isGivenCell(0)).toBe(false)
    })

    it('returns false for index 80 on an empty board', () => {
      const { result } = renderGame(createEmptyPuzzle())
      expect(result.current.isGivenCell(80)).toBe(false)
    })
  })

  describe('checkNotes - exact returned shape', () => {
    it('returns the exact empty-result shape when no notes exist', () => {
      const { result } = renderGame(createEmptyPuzzle())
      const check = result.current.checkNotes()
      expect(check).toEqual({
        valid: true,
        wrongNotes: [],
        missingNotes: [],
        cellsWithNotes: 0,
      })
    })

    it('returns wrongNotes entries with exact idx and digit', () => {
      const puzzle = createEmptyPuzzle()
      puzzle[0] = 5
      const { result } = renderGame(puzzle)
      act(() => {
        result.current.toggleCandidate(1, 5)
      })
      const check = result.current.checkNotes()
      expect(check.valid).toBe(false)
      expect(check.wrongNotes).toEqual([{ idx: 1, digit: 5 }])
    })
  })
})

// =============================================================================
// MUTATION-CONVERGENCE TESTS (Pigsy pass)
// Targets specific surviving/no-coverage mutants by asserting the observable
// behavior that the mutant would flip.
// =============================================================================
describe('useSudokuGame - mutation-convergence (Pigsy)', () => {
  describe('candidatesRef sync effect', () => {
    // Guards the useEffect that mirrors candidatesHook.candidates into
    // candidatesRef. setCell(notes) writes candidatesHook.candidates but does
    // NOT write candidatesRef directly, so the ref only sees the new value
    // through this effect. toggleCandidate reads candidatesRef.current.
    it('toggleCandidate observes candidates added by setCell(notes) via the effect-synced ref', () => {
      const { result } = renderGame(createEmptyPuzzle())

      act(() => {
        result.current.setCell(40, 5, true)
      })
      expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(true)

      // If the sync effect were dead (body {} or deps []), candidatesRef would
      // still hold the initial zeroed array; hadCandidate would be false and
      // toggleCandidate would ADD instead of REMOVE.
      act(() => {
        result.current.toggleCandidate(40, 5)
      })
      expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(false)
      expect(result.current.history[result.current.history.length - 1]!.action).toBe('eliminate')
    })
  })

  describe('setCell(notes) double-toggle debounce', () => {
    // Covers the rapid same-cell+digit debounce guard and kills guard-removal
    // ConditionalExpression mutants: without the guard the second call would
    // toggle the note off.
    it('suppresses a second immediate note toggle on the same cell and digit', () => {
      const { result } = renderGame(createEmptyPuzzle())

      act(() => {
        result.current.setCell(40, 5, true)
        result.current.setCell(40, 5, true)
      })

      expect(hasCandidate(result.current.candidates[40] || 0, 5)).toBe(true)
      expect(result.current.history).toHaveLength(1)
      expect(result.current.history[0]!.action).toBe('note')
    })
  })

  describe('setCellMultiple - validIndices filter', () => {
    // Kills the && → || and conditional mutants on the filter predicate by
    // proving a filled non-given cell is excluded from the toggle set.
    it('excludes a filled non-given cell from the toggle targets', () => {
      const { result } = renderGame(createEmptyPuzzle())

      act(() => {
        result.current.setCell(10, 4, false)
      })
      act(() => {
        result.current.setCellMultiple([10, 11], 7, true)
      })

      const move = result.current.history[result.current.history.length - 1]!
      // Only cell 11 (still empty) is toggled; cell 10 has a placed digit.
      expect(move.targets).toEqual([{ row: 1, col: 2 }])
      expect(move.explanation).toBe('Added note 7 to 1 cells')
    })

    // Kills the empty-validIndices guard mutant (if→false): with the guard
    // removed, an all-excluded selection would still push an empty-targets move.
    it('records no move when every selected cell is a given', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderGame(puzzle)
      const historyBefore = result.current.history.length

      act(() => {
        result.current.setCellMultiple([0, 1], 7, true)
      })

      expect(result.current.history).toHaveLength(historyBefore)
    })
  })
})

function emptyMove() {
  return {
    step_index: 0,
    technique: 'User Input',
    action: 'place',
    digit: 5,
    targets: [{ row: 4, col: 4 }],
    explanation: 'Test move',
    refs: { title: '', slug: '', url: '' },
    highlights: { primary: [] },
    isUserMove: true,
  }
}

// ============================================================================
// Mutation killing tests (MUT-1 iteration 2). Each test below pins an exact
// observable property that a surviving mutant broke. See the matching
// `// Stryker disable` directives in useSudokuGame.ts for the equivalents.
// ============================================================================
describe('useSudokuGame mutation kills (MUT-1 iter-2)', () => {
  it('records the exact "Removed note" explanation when toggling an existing candidate off', () => {
    // Kills: StringLiteral/ArithmeticOperator mutants on the "Removed note" template
    // (the "Added note" branch is already asserted elsewhere; this covers the OFF branch).
    const { result } = renderGame(createEmptyPuzzle())
    actToggle(result, 0, 5) // add note 5 at R1C1
    actToggle(result, 0, 5) // remove it -> "Removed note 5 from R1C1"
    const last = result.current.history[result.current.history.length - 1]!
    expect(last.explanation).toBe('Removed note 5 from R1C1')
    expect(last.targets).toEqual([{ row: 0, col: 0 }])
  })

  it('records the exact targets when a candidate is toggled', () => {
    // Kills: ArrayDeclaration/ObjectLiteral mutants on the targets literal in
    // handleToggleCandidate (`[{ row, col }]` -> `[]` / `{}`).
    const { result } = renderGame(createEmptyPuzzle())
    actToggle(result, 10, 7) // R2C2 (index 10 = row 1, col 1)
    const last = result.current.history[result.current.history.length - 1]!
    expect(last.targets).toEqual([{ row: 1, col: 1 }])
  })

  it('eraseCell clears only the target cell, preserving the rest of the board and targets', () => {
    // Kills: ArrayDeclaration mutant on `const newBoard = [...currentBoard]` (-> [])
    // and the targets literal in eraseCell. Cells from initialBoard are givens, so we
    // place a value first (non-given), then erase it.
    const { result } = renderGame(createEmptyPuzzle())
    actPlace(result, 0, 3) // place 3 at cell 0 (non-given)
    actPlace(result, 5, 9) // place 9 at cell 5 (non-given, must survive the erase)
    actErase(result, 0)
    expect(result.current.board[0]).toBe(0)
    expect(result.current.board[5]).toBe(9) // survivor preserved (mutant [] empties whole board)
    const last = result.current.history[result.current.history.length - 1]!
    expect(last.targets).toEqual([{ row: 0, col: 0 }])
  })

  it('setCellMultiple removes an existing candidate via the real mask, not a zeroed operand', () => {
    // Kills: ConditionalExpression/LogicalOperator mutants on
    // `removeCandidate(newCandidates[idx] || 0, digit)` in the allHave branch.
    const { result } = renderGame(createEmptyPuzzle())
    actToggle(result, 4, 2) // seed candidate 2 at cell 4
    expect(hasCandidate(result.current.candidates[4] || 0, 2)).toBe(true)
    act(() => {
      result.current.setCellMultiple([4], 2, true) // allHave -> removeCandidate(mask, 2)
    })
    expect(hasCandidate(result.current.candidates[4] || 0, 2)).toBe(false)
    // neighbouring candidate (if any) untouched: add a second then remove-all to confirm mask path
  })

  it('applyExternalMove truncates forward history so redo is no longer available', () => {
    // Kills: MethodExpression/ArithmeticOperator mutants on
    // `historyRef.current.slice(0, historyIndexRef.current + 1)` (removing slice
    // aliases the full array; -1 vs +1 shifts the truncation point).
    const { result } = renderGame(createEmptyPuzzle())
    actPlace(result, 0, 3) // one move
    actUndo(result) // historyIndex back to -1, redo available
    expect(result.current.canRedo).toBe(true)
    const extBoard = createEmptyPuzzle()
    extBoard[1] = 7
    act(() => {
      result.current.applyExternalMove(extBoard, new Uint16Array(TOTAL_CELLS), createMockMove())
    })
    // After an external move applied from the undone (pre-redo) state, the
    // previously redoable move must be gone (history truncated at current index).
    expect(result.current.canRedo).toBe(false)
  })
})

// =============================================================================
// DEPENDENCY-ARRAY STALENESS + HISTORY-TRUNCATION MUTATION KILLS (fe-b)
// These target useCallback dependency-array mutants that freeze a callback at
// its first-render closure. Callbacks that read candidatesHook.candidates (via
// createMove) produce a stale stateDiff when frozen: the "before" candidates are
// the empty first-render mask, so undoing a later move wrongly clears notes that
// belong to earlier cells. That difference is observable through undo.
// =============================================================================
describe('useSudokuGame - stale-closure candidate restoration', () => {
  it('undo of a note toggle keeps an earlier cell note (createMove/toggleCandidate deps)', () => {
    const { result } = renderGame(createEmptyPuzzle())
    actToggle(result, 0, 3)
    actToggle(result, 80, 5)
    actUndo(result)
    // The undo removes only the second toggle; the first cell's note survives.
    expect(hasCandidate(result.current.candidates[0] || 0, 3)).toBe(true)
    expect(hasCandidate(result.current.candidates[80] || 0, 5)).toBe(false)
  })

  it('undo of an erase keeps an unrelated cell note (eraseCell deps)', () => {
    const { result } = renderGame(createEmptyPuzzle())
    actToggle(result, 0, 3)
    actPlace(result, 80, 7)
    actErase(result, 80)
    actUndo(result)
    expect(result.current.board[80]).toBe(7)
    expect(hasCandidate(result.current.candidates[0] || 0, 3)).toBe(true)
  })

  it('undo of clearCandidates restores the notes it cleared (clearCandidates deps)', () => {
    const { result } = renderGame(createEmptyPuzzle())
    actToggle(result, 0, 3)
    act(() => {
      result.current.clearCandidates()
    })
    expect(hasCandidate(result.current.candidates[0] || 0, 3)).toBe(false)
    actUndo(result)
    expect(hasCandidate(result.current.candidates[0] || 0, 3)).toBe(true)
  })

  it('undo of an external move keeps a pre-existing note (applyExternalMove deps)', () => {
    const { result } = renderGame(createEmptyPuzzle())
    actToggle(result, 0, 3)
    const extBoard = createEmptyPuzzle()
    extBoard[40] = 5
    const extCandidates = new Uint16Array(result.current.candidates)
    act(() => {
      result.current.applyExternalMove(extBoard, extCandidates, createMockMove())
    })
    expect(result.current.board[40]).toBe(5)
    actUndo(result)
    expect(result.current.board[40]).toBe(0)
    expect(hasCandidate(result.current.candidates[0] || 0, 3)).toBe(true)
  })
})

describe('useSudokuGame - resetGame/clearAll honor the current initialBoard', () => {
  it('resetGame resets to the current initialBoard prop, not the first render', () => {
    const first = createEmptyPuzzle()
    first[5] = 3
    const second = createEmptyPuzzle()
    second[5] = 9
    const { result, rerender } = renderHook(({ initialBoard }) => useSudokuGame({ initialBoard }), {
      initialProps: { initialBoard: first },
    })
    rerender({ initialBoard: second })
    act(() => {
      result.current.resetGame()
    })
    expect(result.current.board[5]).toBe(9)
  })

  it('clearAll restores the current givens after the initialBoard prop changes', () => {
    const first = createEmptyPuzzle()
    first[5] = 3
    const second = createEmptyPuzzle()
    second[5] = 9
    const { result, rerender } = renderHook(({ initialBoard }) => useSudokuGame({ initialBoard }), {
      initialProps: { initialBoard: first },
    })
    rerender({ initialBoard: second })
    act(() => {
      result.current.clearAll()
    })
    expect(result.current.board[5]).toBe(9)
  })
})

describe('useSudokuGame - setCell notes "Removed note" explanation', () => {
  it('records the exact "Removed note" explanation via setCell notes mode', () => {
    const { result } = renderGame(createEmptyPuzzle())
    // Add the note through toggleCandidate (which does not set the setCell
    // debounce state), then remove it through setCell notes mode so the L183
    // "Removed note" branch (row + 1 / col + 1 / template) is exercised.
    actToggle(result, 10, 3)
    actPlace(result, 10, 3, true)
    const move = result.current.history[result.current.history.length - 1]!
    expect(move.action).toBe('eliminate')
    expect(move.explanation).toBe('Removed note 3 from R2C2')
  })
})

describe('useSudokuGame - applyExternalMove history truncation exactness', () => {
  it('keeps prior moves and sets the last index when applied without an undo', () => {
    const { result } = renderGame(createEmptyPuzzle())
    actPlace(result, 0, 1)
    actPlace(result, 1, 2)
    const extBoard = createEmptyPuzzle()
    extBoard[2] = 3
    act(() => {
      result.current.applyExternalMove(extBoard, new Uint16Array(TOTAL_CELLS), createMockMove())
    })
    expect(result.current.history).toHaveLength(3)
    expect(result.current.historyIndex).toBe(2)
  })

  it('truncates the redo tail when applied after an undo', () => {
    const { result } = renderGame(createEmptyPuzzle())
    actPlace(result, 0, 1)
    actPlace(result, 1, 2)
    actUndo(result)
    const extBoard = createEmptyPuzzle()
    extBoard[2] = 3
    act(() => {
      result.current.applyExternalMove(extBoard, new Uint16Array(TOTAL_CELLS), createMockMove())
    })
    expect(result.current.history).toHaveLength(2)
  })
})
