import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSudokuGame, type Move } from './useSudokuGame'
import { hasCandidate, countCandidates, addCandidate } from '../lib/candidatesUtils'
import { TOTAL_CELLS, MAX_MOVE_HISTORY } from '../lib/constants'

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Create a minimal valid puzzle with some given cells
 * This is a partial puzzle - not a complete valid Sudoku, but sufficient for testing
 */
const createTestPuzzle = (): number[] => {
  const board = Array(81).fill(0)
  // Set some given cells in first row and column
  board[0] = 5  // R1C1
  board[1] = 3  // R1C2
  board[4] = 7  // R1C5
  board[9] = 6  // R2C1
  board[12] = 1 // R2C4
  board[13] = 9 // R2C5
  board[14] = 5 // R2C6
  board[18] = 9 // R3C1
  board[19] = 8 // R3C2
  board[25] = 6 // R3C8
  return board
}

/**
 * Create a complete valid Sudoku solution for testing completion detection
 */
const createCompletePuzzle = (): number[] => {
  // A known valid complete Sudoku
  return [
    5, 3, 4, 6, 7, 8, 9, 1, 2,
    6, 7, 2, 1, 9, 5, 3, 4, 8,
    1, 9, 8, 3, 4, 2, 5, 6, 7,
    8, 5, 9, 7, 6, 1, 4, 2, 3,
    4, 2, 6, 8, 5, 3, 7, 9, 1,
    7, 1, 3, 9, 2, 4, 8, 5, 6,
    9, 6, 1, 5, 3, 7, 2, 8, 4,
    2, 8, 7, 4, 1, 9, 6, 3, 5,
    3, 4, 5, 2, 8, 6, 1, 7, 9
  ]
}

/**
 * Create a nearly complete puzzle with one cell missing
 */
const createNearlyCompletePuzzle = (): number[] => {
  const complete = createCompletePuzzle()
  complete[80] = 0 // Make last cell empty
  return complete
}

/**
 * Create an empty puzzle for testing candidate operations
 */
const createEmptyPuzzle = (): number[] => Array(81).fill(0)

/**
 * Helper to create a mock Move object
 */
const createMockMove = (overrides?: Partial<Move>): Move => ({
  step_index: 0,
  technique: 'User Input',
  action: 'place',
  digit: 5,
  targets: [{ row: 4, col: 4 }],
  explanation: 'Test move',
  refs: { title: '', slug: '', url: '' },
  highlights: { primary: [] },
  isUserMove: true,
  ...overrides,
})

// =============================================================================
// HOOK INITIALIZATION TESTS
// =============================================================================

describe('useSudokuGame - Hook Initialization', () => {
  it('initializes with the provided board', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    expect(result.current.board).toEqual(puzzle)
  })

  it('initializes with empty candidates', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // All candidates should start at 0
    for (let i = 0; i < TOTAL_CELLS; i++) {
      expect(result.current.candidates[i]).toBe(0)
    }
  })

  it('starts with empty history', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    expect(result.current.history).toEqual([])
    expect(result.current.historyIndex).toBe(-1)
  })

  it('starts with canUndo=false and canRedo=false', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('starts with isComplete=false for incomplete puzzles', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    expect(result.current.isComplete).toBe(false)
  })

  it('initializes candidatesVersion to 0', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    expect(result.current.candidatesVersion).toBe(0)
  })

  it('handles empty initial board', () => {
    const emptyBoard = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: emptyBoard }))

    expect(result.current.board).toEqual(emptyBoard)
  })

  it('computes initial digitCounts correctly', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Verify digit counts match the puzzle
    const expectedCounts = Array(9).fill(0)
    puzzle.forEach(digit => {
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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Cell 0 has digit 5 (given)
    expect(result.current.isGivenCell(0)).toBe(true)
    expect(result.current.isGivenCell(1)).toBe(true)
    expect(result.current.isGivenCell(9)).toBe(true)
  })

  it('returns false for empty cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Cell 2 is empty in the test puzzle
    expect(result.current.isGivenCell(2)).toBe(false)
    expect(result.current.isGivenCell(3)).toBe(false)
    expect(result.current.isGivenCell(80)).toBe(false)
  })

  it('returns false for user-filled cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Place a digit in an empty cell
    act(() => {
      result.current.setCell(2, 4, false)
    })

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 7, false) // Center cell, digit 7
    })

    expect(result.current.board[40]).toBe(7)
  })

  it('adds move to history when placing a digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 7, false)
    })

    expect(result.current.history).toHaveLength(1)
    expect(result.current.historyIndex).toBe(0)
    expect(result.current.history[0]?.action).toBe('place')
    expect(result.current.history[0]?.digit).toBe(7)
  })

  it('does not modify given cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Cell 0 is given (has digit 5)
    act(() => {
      result.current.setCell(0, 9, false)
    })

    // Should not change
    expect(result.current.board[0]).toBe(5)
    expect(result.current.history).toHaveLength(0)
  })

  it('overwrites existing user-placed digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Place first digit
    act(() => {
      result.current.setCell(10, 3, false)
    })
    expect(result.current.board[10]).toBe(3)

    // Overwrite with different digit
    act(() => {
      result.current.setCell(10, 8, false)
    })
    expect(result.current.board[10]).toBe(8)
    expect(result.current.history).toHaveLength(2)
  })

  it('eliminates candidates from peers when placing digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // First fill candidates
    act(() => {
      const filled = result.current.fillAllCandidates()
      // Manually trigger candidate update via setCell in notes mode first
      result.current.setCell(1, 5, true) // Add note 5 to cell 1
    })

    // Now place digit 5 at cell 0 (R1C1)
    act(() => {
      result.current.setCell(0, 5, false)
    })

    // Candidates for 5 should be eliminated from row 1, col 1, and box 1
    // Cell 1 is in same row, so its candidate for 5 should be cleared
    expect(hasCandidate(result.current.candidates[1], 5)).toBe(false)
  })

  it('clears candidates for the placed cell', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Add candidates to cell 10
    act(() => {
      result.current.setCell(10, 1, true)
      result.current.setCell(10, 2, true)
      result.current.setCell(10, 3, true)
    })
    expect(countCandidates(result.current.candidates[10])).toBeGreaterThan(0)

    // Place digit
    act(() => {
      result.current.setCell(10, 5, false)
    })

    // Candidates should be cleared
    expect(result.current.candidates[10]).toBe(0)
  })

  it('updates digitCounts when placing digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    const initialCount = result.current.digitCounts[6] // Count of 7s (index 6)

    act(() => {
      result.current.setCell(40, 7, false)
    })

    expect(result.current.digitCounts[6]).toBe(initialCount + 1)
  })

  it('enables canUndo after placing digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    expect(result.current.canUndo).toBe(false)

    act(() => {
      result.current.setCell(40, 7, false)
    })

    expect(result.current.canUndo).toBe(true)
  })

  it('triggers onComplete when puzzle is solved', () => {
    const nearlyComplete = createNearlyCompletePuzzle()
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useSudokuGame({ initialBoard: nearlyComplete, onComplete })
    )

    // Place the final digit (cell 80 should be 9 in our complete puzzle)
    act(() => {
      result.current.setCell(80, 9, false)
    })

    expect(onComplete).toHaveBeenCalled()
    expect(result.current.isComplete).toBe(true)
  })

  it('does not trigger onComplete for invalid solution', () => {
    const nearlyComplete = createNearlyCompletePuzzle()
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useSudokuGame({ initialBoard: nearlyComplete, onComplete })
    )

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Add candidate
    act(() => {
      result.current.setCell(40, 5, true)
    })

    expect(hasCandidate(result.current.candidates[40], 5)).toBe(true)
  })

  it('removes candidate on second toggle using toggleCandidate', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Add candidate using toggleCandidate (not affected by debounce guard)
    act(() => {
      result.current.toggleCandidate(40, 5)
    })
    expect(hasCandidate(result.current.candidates[40], 5)).toBe(true)

    // Remove candidate (toggle off) - toggleCandidate doesn't have debounce
    act(() => {
      result.current.toggleCandidate(40, 5)
    })
    expect(hasCandidate(result.current.candidates[40], 5)).toBe(false)
  })

  it('does not add notes to filled cells', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Place digit
    act(() => {
      result.current.setCell(40, 7, false)
    })

    // Try to add note
    act(() => {
      result.current.setCell(40, 3, true)
    })

    // Should not have any candidates
    expect(result.current.candidates[40]).toBe(0)
  })

  it('does not add notes to given cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Cell 0 is given
    act(() => {
      result.current.setCell(0, 3, true)
    })

    expect(result.current.candidates[0]).toBe(0)
  })

  it('increments candidatesVersion when toggling notes', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    const initialVersion = result.current.candidatesVersion

    act(() => {
      result.current.setCell(40, 5, true)
    })

    expect(result.current.candidatesVersion).toBe(initialVersion + 1)
  })

  it('adds history entry for note toggle', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 5, true)
    })

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.toggleCandidate(40, 7)
    })

    expect(hasCandidate(result.current.candidates[40], 7)).toBe(true)
  })

  it('removes existing candidate', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Add then remove
    act(() => {
      result.current.toggleCandidate(40, 7)
    })
    act(() => {
      result.current.toggleCandidate(40, 7)
    })

    expect(hasCandidate(result.current.candidates[40], 7)).toBe(false)
  })

  it('does not toggle candidate for given cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.toggleCandidate(0, 3) // Cell 0 is given
    })

    expect(result.current.candidates[0]).toBe(0)
    expect(result.current.history).toHaveLength(0)
  })

  it('does not toggle candidate for filled cells', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Fill the cell first
    act(() => {
      result.current.setCell(40, 5, false)
    })

    const historyLength = result.current.history.length

    // Try to toggle candidate
    act(() => {
      result.current.toggleCandidate(40, 3)
    })

    expect(result.current.candidates[40]).toBe(0)
    expect(result.current.history).toHaveLength(historyLength) // No new history entry
  })

  it('adds toggle to history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.toggleCandidate(40, 7)
    })

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Place digit
    act(() => {
      result.current.setCell(40, 7, false)
    })
    expect(result.current.board[40]).toBe(7)

    // Erase
    act(() => {
      result.current.eraseCell(40)
    })

    expect(result.current.board[40]).toBe(0)
  })

  it('does not erase given cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.eraseCell(0) // Cell 0 is given (5)
    })

    expect(result.current.board[0]).toBe(5)
    expect(result.current.history).toHaveLength(0)
  })

  it('clears candidates when erasing empty cell with notes', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Add notes
    act(() => {
      result.current.toggleCandidate(40, 1)
      result.current.toggleCandidate(40, 2)
      result.current.toggleCandidate(40, 3)
    })
    expect(countCandidates(result.current.candidates[40])).toBe(3)

    // Erase (clears notes)
    act(() => {
      result.current.eraseCell(40)
    })

    expect(result.current.candidates[40]).toBe(0)
  })

  it('adds erase to history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 7, false)
    })

    act(() => {
      result.current.eraseCell(40)
    })

    expect(result.current.history).toHaveLength(2)
    expect(result.current.history[1]?.action).toBe('erase')
  })

  it('does nothing for empty cells without candidates', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.eraseCell(40)
    })

    expect(result.current.history).toHaveLength(0)
  })

  it('updates digitCounts when erasing', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 7, false)
    })
    const countBefore = result.current.digitCounts[6]

    act(() => {
      result.current.eraseCell(40)
    })

    expect(result.current.digitCounts[6]).toBe(countBefore - 1)
  })
})

// =============================================================================
// undo() TESTS
// =============================================================================

describe('useSudokuGame - undo()', () => {
  it('undoes digit placement', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 7, false)
    })
    expect(result.current.board[40]).toBe(7)

    act(() => {
      result.current.undo()
    })

    expect(result.current.board[40]).toBe(0)
  })

  it('undoes note toggle', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.toggleCandidate(40, 5)
    })
    expect(hasCandidate(result.current.candidates[40], 5)).toBe(true)

    act(() => {
      result.current.undo()
    })

    expect(hasCandidate(result.current.candidates[40], 5)).toBe(false)
  })

  it('does nothing when history is empty', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.undo()
    })

    expect(result.current.historyIndex).toBe(-1)
  })

  it('decrements historyIndex', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 7, false)
    })
    expect(result.current.historyIndex).toBe(0)

    act(() => {
      result.current.undo()
    })

    expect(result.current.historyIndex).toBe(-1)
  })

  it('enables canRedo after undo', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 7, false)
    })
    expect(result.current.canRedo).toBe(false)

    act(() => {
      result.current.undo()
    })

    expect(result.current.canRedo).toBe(true)
  })

  it('sets isComplete to false after undoing completion', () => {
    const nearlyComplete = createNearlyCompletePuzzle()
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useSudokuGame({ initialBoard: nearlyComplete, onComplete })
    )

    // Complete the puzzle
    act(() => {
      result.current.setCell(80, 9, false)
    })
    expect(result.current.isComplete).toBe(true)

    // Undo
    act(() => {
      result.current.undo()
    })

    expect(result.current.isComplete).toBe(false)
  })

  it('supports multiple undos', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 7, false)
    })
    act(() => {
      result.current.undo()
    })
    expect(result.current.board[40]).toBe(0)

    act(() => {
      result.current.redo()
    })

    expect(result.current.board[40]).toBe(7)
  })

  it('redoes note toggle', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.toggleCandidate(40, 5)
    })
    act(() => {
      result.current.undo()
    })
    expect(hasCandidate(result.current.candidates[40], 5)).toBe(false)

    act(() => {
      result.current.redo()
    })

    expect(hasCandidate(result.current.candidates[40], 5)).toBe(true)
  })

  it('does nothing when at end of history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 7, false)
    })

    act(() => {
      result.current.redo()
    })

    // Should still be at end
    expect(result.current.historyIndex).toBe(0)
    expect(result.current.canRedo).toBe(false)
  })

  it('increments historyIndex', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 7, false)
      result.current.undo()
    })
    expect(result.current.historyIndex).toBe(-1)

    act(() => {
      result.current.redo()
    })

    expect(result.current.historyIndex).toBe(0)
  })

  it('disables canRedo when at end of history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 7, false)
      result.current.undo()
    })
    expect(result.current.canRedo).toBe(true)

    act(() => {
      result.current.redo()
    })

    expect(result.current.canRedo).toBe(false)
  })

  it('supports multiple redos', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Make some changes
    act(() => {
      result.current.setCell(2, 4, false)
      result.current.setCell(3, 8, false)
    })

    act(() => {
      result.current.resetGame()
    })

    expect(result.current.board).toEqual(puzzle)
  })

  it('clears all candidates', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.toggleCandidate(40, 5)
      result.current.toggleCandidate(41, 6)
    })

    act(() => {
      result.current.resetGame()
    })

    expect(result.current.candidates[40]).toBe(0)
    expect(result.current.candidates[41]).toBe(0)
  })

  it('clears history', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(2, 4, false)
    })

    act(() => {
      result.current.resetGame()
    })

    expect(result.current.history).toEqual([])
    expect(result.current.historyIndex).toBe(-1)
  })

  it('resets isComplete to false', () => {
    const nearlyComplete = createNearlyCompletePuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: nearlyComplete }))

    act(() => {
      result.current.setCell(80, 9, false)
    })
    expect(result.current.isComplete).toBe(true)

    act(() => {
      result.current.resetGame()
    })

    expect(result.current.isComplete).toBe(false)
  })
})

// =============================================================================
// clearAll() TESTS
// =============================================================================

describe('useSudokuGame - clearAll()', () => {
  it('clears user entries but keeps givens', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(2, 4, false)
      result.current.setCell(3, 8, false)
    })

    act(() => {
      result.current.clearAll()
    })

    // Givens should remain
    expect(result.current.board[0]).toBe(5)
    expect(result.current.board[1]).toBe(3)

    // User entries should be cleared
    expect(result.current.board[2]).toBe(0)
    expect(result.current.board[3]).toBe(0)
  })

  it('clears all candidates', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.toggleCandidate(40, 5)
      result.current.toggleCandidate(41, 6)
    })

    act(() => {
      result.current.clearAll()
    })

    for (let i = 0; i < TOTAL_CELLS; i++) {
      expect(result.current.candidates[i]).toBe(0)
    }
  })

  it('clears history', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(2, 4, false)
    })

    act(() => {
      result.current.clearAll()
    })

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.toggleCandidate(40, 5)
    })

    act(() => {
      result.current.clearCandidates()
    })

    expect(result.current.history.some(m => m.action === 'clear-candidates')).toBe(true)
  })
})

// =============================================================================
// fillAllCandidates() TESTS
// =============================================================================

describe('useSudokuGame - fillAllCandidates()', () => {
  it('returns candidates for all empty cells', () => {
    const puzzle = createTestPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    let filledCandidates: Uint16Array

    act(() => {
      filledCandidates = result.current.fillAllCandidates()
    })

    // Empty cells should have candidates
    expect(countCandidates(filledCandidates![2])).toBeGreaterThan(0)

    // Given cells should have no candidates
    expect(filledCandidates![0]).toBe(0)
  })

  it('respects row constraints', () => {
    const puzzle = createEmptyPuzzle()
    puzzle[0] = 5 // R1C1 = 5
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    let filledCandidates: Uint16Array

    act(() => {
      filledCandidates = result.current.fillAllCandidates()
    })

    // Cell 1 (same row) should not have 5 as candidate
    expect(hasCandidate(filledCandidates![1], 5)).toBe(false)
  })

  it('respects column constraints', () => {
    const puzzle = createEmptyPuzzle()
    puzzle[0] = 7 // R1C1 = 7
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    let filledCandidates: Uint16Array

    act(() => {
      filledCandidates = result.current.fillAllCandidates()
    })

    // Cell 9 (same column) should not have 7 as candidate
    expect(hasCandidate(filledCandidates![9], 7)).toBe(false)
  })

  it('respects box constraints', () => {
    const puzzle = createEmptyPuzzle()
    puzzle[0] = 3 // R1C1 = 3
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    let filledCandidates: Uint16Array

    act(() => {
      filledCandidates = result.current.fillAllCandidates()
    })

    // Cell 10 (same box) should not have 3 as candidate
    expect(hasCandidate(filledCandidates![10], 3)).toBe(false)
  })
})

// =============================================================================
// areCandidatesFilled() TESTS
// =============================================================================

describe('useSudokuGame - areCandidatesFilled()', () => {
  it('returns false when no candidates are set', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    expect(result.current.areCandidatesFilled()).toBe(false)
  })

  it('returns true when at least one cell has candidates', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.toggleCandidate(40, 5)
    })

    expect(result.current.areCandidatesFilled()).toBe(true)
  })
})

// =============================================================================
// calculateCandidatesForCell() TESTS
// =============================================================================

describe('useSudokuGame - calculateCandidatesForCell()', () => {
  it('returns all possible candidates for empty board', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    const candidates = result.current.calculateCandidatesForCell(40, puzzle)

    // All digits 1-9 should be candidates
    for (let d = 1; d <= 9; d++) {
      expect(hasCandidate(candidates, d)).toBe(true)
    }
  })

  it('excludes digits from same row', () => {
    const puzzle = createEmptyPuzzle()
    puzzle[36] = 5 // Same row as cell 40
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    const candidates = result.current.calculateCandidatesForCell(40, puzzle)

    expect(hasCandidate(candidates, 5)).toBe(false)
  })

  it('excludes digits from same column', () => {
    const puzzle = createEmptyPuzzle()
    puzzle[4] = 7 // Same column as cell 40
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    const candidates = result.current.calculateCandidatesForCell(40, puzzle)

    expect(hasCandidate(candidates, 7)).toBe(false)
  })

  it('excludes digits from same box', () => {
    const puzzle = createEmptyPuzzle()
    puzzle[30] = 3 // Same box as cell 40
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    const move = createMockMove()

    act(() => {
      result.current.applyExternalMove(
        [...puzzle],
        new Uint16Array(TOTAL_CELLS),
        move
      )
    })

    expect(result.current.history).toHaveLength(1)
  })

  it('triggers completion check', () => {
    const nearlyComplete = createNearlyCompletePuzzle()
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useSudokuGame({ initialBoard: nearlyComplete, onComplete })
    )

    const completeBoard = createCompletePuzzle()
    const move = createMockMove({ digit: 9 })

    act(() => {
      result.current.applyExternalMove(
        completeBoard,
        new Uint16Array(TOTAL_CELLS),
        move
      )
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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    const savedCandidates = new Uint16Array(TOTAL_CELLS)
    savedCandidates[40] = addCandidate(0, 5)

    act(() => {
      result.current.restoreState(puzzle, savedCandidates, [])
    })

    expect(hasCandidate(result.current.candidates[40], 5)).toBe(true)
  })

  it('restores saved history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    const savedHistory = [createMockMove(), createMockMove({ step_index: 1 })]

    act(() => {
      result.current.restoreState(puzzle, new Uint16Array(TOTAL_CELLS), savedHistory)
    })

    expect(result.current.history).toHaveLength(2)
    expect(result.current.historyIndex).toBe(1)
  })

  it('sets isComplete for completed boards', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    const newCandidates = new Uint16Array(TOTAL_CELLS)
    newCandidates[40] = addCandidate(0, 3)

    act(() => {
      result.current.setBoardState(puzzle, newCandidates)
    })

    expect(hasCandidate(result.current.candidates[40], 3)).toBe(true)
    expect(result.current.history).toHaveLength(0)
  })
})

// =============================================================================
// checkNotes() TESTS
// =============================================================================

describe('useSudokuGame - checkNotes()', () => {
  it('returns valid=true when no notes exist', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    const check = result.current.checkNotes()

    expect(check.valid).toBe(true)
    expect(check.wrongNotes).toHaveLength(0)
    expect(check.missingNotes).toHaveLength(0)
    expect(check.cellsWithNotes).toBe(0)
  })

  it('detects wrong notes', () => {
    const puzzle = createEmptyPuzzle()
    puzzle[0] = 5 // R1C1 = 5
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Add invalid note (5 is in same row)
    act(() => {
      result.current.toggleCandidate(1, 5) // Cell 1 can't have 5
    })

    const check = result.current.checkNotes()

    expect(check.valid).toBe(false)
    expect(check.wrongNotes.some(n => n.idx === 1 && n.digit === 5)).toBe(true)
  })

  it('detects missing notes', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Add only one note when all digits 1-9 are valid
    act(() => {
      result.current.toggleCandidate(40, 1)
    })

    const check = result.current.checkNotes()

    // Should have missing notes (2-9 are all valid but not added)
    expect(check.missingNotes.length).toBeGreaterThan(0)
  })

  it('counts cells with notes', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    act(() => {
      result.current.setCell(40, 4, false)
    })

    // Redo history should be gone
    expect(result.current.canRedo).toBe(false)
    expect(result.current.history).toHaveLength(2) // Only first move + new move
  })

  it('stores stateDiff in moves for compact storage', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 5, false)
    })

    expect(result.current.history[0]?.stateDiff).toBeDefined()
    expect(result.current.history[0]?.stateDiff?.boardChanges).toHaveLength(1)
  })

  it('limits history to MAX_MOVE_HISTORY', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 0, false)
    })

    expect(result.current.board[40]).toBe(0)
  })

  it('handles out-of-range cell indices gracefully', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Count manually
    const expected = Array(9).fill(0)
    puzzle.forEach(d => {
      if (d >= 1 && d <= 9) expected[d - 1]++
    })

    expect(result.current.digitCounts).toEqual(expected)
  })

  it('updates when placing digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    expect(result.current.digitCounts[6]).toBe(0) // 7s

    act(() => {
      result.current.setCell(40, 7, false)
    })

    expect(result.current.digitCounts[6]).toBe(1)
  })

  it('updates when erasing digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    act(() => {
      result.current.setCell(40, 7, false)
    })
    expect(result.current.digitCounts[6]).toBe(1)

    act(() => {
      result.current.eraseCell(40)
    })

    expect(result.current.digitCounts[6]).toBe(0)
  })
})

// =============================================================================
// CLICK CELL WITH MATCHING DIGIT (Legacy Test)
// =============================================================================

describe('Click cell with matching digit', () => {
  it('erases a user-entered digit when clicked a second time with same digit', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
    // Place digit 7 in cell 10
    act(() => {
      result.current.setCell(10, 7, false)
    })
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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    expect(result.current.isComplete).toBe(false)

    act(() => {
      result.current.setIsComplete(true)
    })

    expect(result.current.isComplete).toBe(true)
  })

  it('allows resetting isComplete to false', () => {
    const nearlyComplete = createNearlyCompletePuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: nearlyComplete }))

    // Complete the puzzle
    act(() => {
      result.current.setCell(80, 9, false)
    })
    expect(result.current.isComplete).toBe(true)

    // Reset
    act(() => {
      result.current.setIsComplete(false)
    })

    expect(result.current.isComplete).toBe(false)
  })
})

// =============================================================================
// LEGACY UNDO/REDO BACKWARD COMPATIBILITY TESTS
// =============================================================================

describe('useSudokuGame - Legacy Move Format Compatibility', () => {
  it('handles undo when move has no stateDiff (legacy format)', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Place a digit normally (creates stateDiff)
    act(() => {
      result.current.setCell(40, 5, false)
    })
    expect(result.current.board[40]).toBe(5)

    // Undo should work via stateDiff
    act(() => {
      result.current.undo()
    })
    expect(result.current.board[40]).toBe(0)
  })

  it('handles restoreState with complete history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // First add candidates to several cells
    act(() => {
      result.current.toggleCandidate(1, 5)  // Same row as cell 0
      result.current.toggleCandidate(9, 5)  // Same column as cell 0
      result.current.toggleCandidate(10, 5) // Same box as cell 0
    })

    // Place digit 5 at cell 0
    act(() => {
      result.current.setCell(0, 5, false)
    })

    // All peer cells should have candidate 5 eliminated
    expect(hasCandidate(result.current.candidates[1], 5)).toBe(false)
    expect(hasCandidate(result.current.candidates[9], 5)).toBe(false)
    expect(hasCandidate(result.current.candidates[10], 5)).toBe(false)
  })

  it('handles cell in corner of box for elimination', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Add candidate to cell 80 (bottom-right corner)
    act(() => {
      result.current.toggleCandidate(80, 9)
    })

    // Place digit in same box (cell 60 - top-left of bottom-right box)
    act(() => {
      result.current.setCell(60, 9, false)
    })

    expect(hasCandidate(result.current.candidates[80], 9)).toBe(false)
  })
})

// =============================================================================
// VALIDATION EDGE CASES
// =============================================================================

describe('useSudokuGame - Validation Edge Cases', () => {
  it('detects invalid row in completed board', () => {
    const puzzle = createEmptyPuzzle()
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useSudokuGame({ initialBoard: puzzle, onComplete })
    )

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
    const { result } = renderHook(() =>
      useSudokuGame({ initialBoard: puzzle, onComplete })
    )

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    const v1 = result.current.candidatesVersion

    act(() => {
      result.current.toggleCandidate(40, 1)
    })
    expect(result.current.candidatesVersion).toBe(v1 + 1)

    act(() => {
      result.current.toggleCandidate(40, 2)
    })
    expect(result.current.candidatesVersion).toBe(v1 + 2)
  })

  it('setBoardState does not affect history', () => {
    const puzzle = createEmptyPuzzle()
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Add some history
    act(() => {
      result.current.setCell(10, 5, false)
    })
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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    // Place some digits
    act(() => {
      result.current.setCell(2, 4, false)
    })
    expect(result.current.board[2]).toBe(4)

    // Reset
    act(() => {
      result.current.resetGame()
    })

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
    const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))

    const firstBoard = result.current.board

    act(() => {
      result.current.setCell(40, 5, false)
    })

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
      const { result } = renderHook(() => useSudokuGame({
        initialBoard: createEmptyPuzzle(),
      }))

      expect(typeof result.current.setCellMultiple).toBe('function')
    })

    it('should add note to single cell in selection (behaves like setCell)', () => {
      const puzzle = createEmptyPuzzle()
      const { result } = renderHook(() => useSudokuGame({
        initialBoard: puzzle,
      }))

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
      const { result } = renderHook(() => useSudokuGame({
        initialBoard: puzzle,
      }))

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
      const { result } = renderHook(() => useSudokuGame({
        initialBoard: puzzle,
      }))

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

      const { result } = renderHook(() => useSudokuGame({
        initialBoard: puzzle,
      }))

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

      const { result } = renderHook(() => useSudokuGame({
        initialBoard: puzzle,
      }))

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
      const { result } = renderHook(() => useSudokuGame({
        initialBoard: puzzle,
      }))

      act(() => {
        result.current.setCellMultiple([10, 11], 7, true)
      })

      // History should have one new entry
      const history = result.current.history
      expect(history).toHaveLength(1)

      // Should be a note move (not place)
      const noteMove = history[0]
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
      const { result } = renderHook(() => useSudokuGame({
        initialBoard: puzzle,
      }))

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
      const { result } = renderHook(() => useSudokuGame({
        initialBoard: puzzle,
      }))

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
      const { result } = renderHook(() => useSudokuGame({
        initialBoard: puzzle,
      }))

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
      const { result } = renderHook(() => useSudokuGame({
        initialBoard: puzzle,
      }))

      // Add candidate 4 to cell 10 only
      act(() => {
        result.current.setCellMultiple([10], 4, true)
      })
      expect(result.current.history).toHaveLength(1)
      expect(result.current.history[0].action).toBe('note')

      // Select cells 10 and 11, press 4: cell 11 is missing it, so action is 'note' (fill)
      act(() => {
        result.current.setCellMultiple([10, 11], 4, true)
      })
      expect(result.current.history).toHaveLength(2)
      expect(result.current.history[1].action).toBe('note')

      // Now both cells have candidate 4: pressing 4 should be 'eliminate'
      act(() => {
        result.current.setCellMultiple([10, 11], 4, true)
      })
      expect(result.current.history).toHaveLength(3)
      expect(result.current.history[2].action).toBe('eliminate')
    })

    it('should not modify cells that already have the candidate during fill phase', () => {
      const puzzle = createEmptyPuzzle()
      const { result } = renderHook(() => useSudokuGame({
        initialBoard: puzzle,
      }))

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
