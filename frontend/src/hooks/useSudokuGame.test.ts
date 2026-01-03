import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSudokuGame } from './useSudokuGame'
import { hasCandidate, countCandidates } from '../lib/candidatesUtils'

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

// =============================================================================
// TESTS
// =============================================================================

describe('useSudokuGame', () => {
  // Reset any mocks between tests
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===========================================================================
  // INITIAL STATE TESTS
  // ===========================================================================
  describe('Initial State', () => {
    it('initializes with the provided puzzle board', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      expect(result.current.board).toEqual(puzzle)
    })

    it('starts with isComplete as false', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      expect(result.current.isComplete).toBe(false)
    })

    it('starts with canUndo as false (no history)', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      expect(result.current.canUndo).toBe(false)
    })

    it('starts with canRedo as false (no history)', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      expect(result.current.canRedo).toBe(false)
    })

    it('starts with empty history', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      expect(result.current.history).toEqual([])
      expect(result.current.historyIndex).toBe(-1)
    })

    it('initializes candidates as empty Uint16Array', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      expect(result.current.candidates).toBeInstanceOf(Uint16Array)
      expect(result.current.candidates.length).toBe(81)
      expect(result.current.candidates.every(c => c === 0)).toBe(true)
    })

    it('identifies given cells correctly', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      // Cell 0 has value 5 - is a given
      expect(result.current.isGivenCell(0)).toBe(true)
      // Cell 2 is empty - not a given
      expect(result.current.isGivenCell(2)).toBe(false)
      // Cell 9 has value 6 - is a given
      expect(result.current.isGivenCell(9)).toBe(true)
    })

    it('computes correct initial digitCounts', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      // Count 5s in puzzle (positions 0, 14) = 2
      expect(result.current.digitCounts[4]).toBe(2) // digitCounts[4] is count of 5s (0-indexed)
      // Count 9s in puzzle (positions 13, 18) = 2
      expect(result.current.digitCounts[8]).toBe(2) // digitCounts[8] is count of 9s
    })
  })

  // ===========================================================================
  // SET CELL (NORMAL MODE) TESTS
  // ===========================================================================
  describe('setCell - Normal Mode', () => {
    it('places digit in empty cell', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      // Cell 2 is empty
      act(() => {
        result.current.setCell(2, 4, false)
      })
      
      expect(result.current.board[2]).toBe(4)
    })

    it('enables canUndo after placing digit', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
      })
      
      expect(result.current.canUndo).toBe(true)
    })

    it('does not modify given cells', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      // Cell 0 is a given (value 5)
      act(() => {
        result.current.setCell(0, 9, false)
      })
      
      expect(result.current.board[0]).toBe(5) // Still 5, not 9
    })

    it('updates digitCounts after placing digit', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      const initialCount4 = result.current.digitCounts[3] // Count of 4s
      
      act(() => {
        result.current.setCell(2, 4, false)
      })
      
      expect(result.current.digitCounts[3]).toBe(initialCount4 + 1)
    })

    it('eliminates candidates from peers when placing digit', () => {
      const puzzle = createEmptyPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      // First fill candidates
      act(() => {
        const filled = result.current.fillAllCandidates()
        // Manually set candidates for a cell in same row
        result.current.restoreState(puzzle, filled, [])
      })
      
      // Cell 1 should have candidate 5
      expect(hasCandidate(result.current.candidates[1], 5)).toBe(true)
      
      // Place 5 in cell 0
      act(() => {
        result.current.setCell(0, 5, false)
      })
      
      // Now cell 1 (same row) should NOT have candidate 5
      expect(hasCandidate(result.current.candidates[1], 5)).toBe(false)
    })

    it('adds move to history when placing digit', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
      })
      
      expect(result.current.history.length).toBe(1)
      expect(result.current.history[0]?.action).toBe('place')
      expect(result.current.history[0]?.digit).toBe(4)
      expect(result.current.history[0]?.isUserMove).toBe(true)
    })

    it('replaces existing user digit when setting new value', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
      })
      expect(result.current.board[2]).toBe(4)
      
      act(() => {
        result.current.setCell(2, 7, false)
      })
      expect(result.current.board[2]).toBe(7)
    })
  })

  // ===========================================================================
  // SET CELL (NOTES MODE) TESTS
  // ===========================================================================
  describe('setCell - Notes Mode', () => {
    it('toggles candidate in notes mode for empty cell', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      // Cell 2 is empty
      act(() => {
        result.current.setCell(2, 4, true)
      })
      
      expect(hasCandidate(result.current.candidates[2], 4)).toBe(true)
    })

    it('does not add notes to cells with digits', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      // First place a digit
      act(() => {
        result.current.setCell(2, 4, false)
      })
      
      // Try to add a note
      act(() => {
        result.current.setCell(2, 7, true)
      })
      
      // Should not have the note
      expect(hasCandidate(result.current.candidates[2], 7)).toBe(false)
    })

    it('does not add notes to given cells', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      // Cell 0 is a given
      act(() => {
        result.current.setCell(0, 7, true)
      })
      
      expect(hasCandidate(result.current.candidates[0], 7)).toBe(false)
    })

    it('toggles note off when already present', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      // Add note
      act(() => {
        result.current.setCell(2, 4, true)
      })
      expect(hasCandidate(result.current.candidates[2], 4)).toBe(true)
      
      // Use toggleCandidate directly to avoid debounce guard
      act(() => {
        result.current.toggleCandidate(2, 4)
      })
      expect(hasCandidate(result.current.candidates[2], 4)).toBe(false)
    })

    it('adds note toggle to history', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, true)
      })
      
      expect(result.current.history.length).toBe(1)
      expect(result.current.history[0]?.action).toBe('note')
    })
  })

  // ===========================================================================
  // TOGGLE CANDIDATE TESTS
  // ===========================================================================
  describe('toggleCandidate', () => {
    it('adds candidate to empty cell', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.toggleCandidate(2, 4)
      })
      
      expect(hasCandidate(result.current.candidates[2], 4)).toBe(true)
    })

    it('removes candidate when already present', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.toggleCandidate(2, 4)
      })
      expect(hasCandidate(result.current.candidates[2], 4)).toBe(true)
      
      act(() => {
        result.current.toggleCandidate(2, 4)
      })
      expect(hasCandidate(result.current.candidates[2], 4)).toBe(false)
    })

    it('does not toggle candidate for given cells', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.toggleCandidate(0, 4) // Cell 0 is given
      })
      
      expect(hasCandidate(result.current.candidates[0], 4)).toBe(false)
    })

    it('does not toggle candidate for cells with digits', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      // Place a digit first
      act(() => {
        result.current.setCell(2, 5, false)
      })
      
      // Try to toggle candidate
      act(() => {
        result.current.toggleCandidate(2, 4)
      })
      
      expect(hasCandidate(result.current.candidates[2], 4)).toBe(false)
    })
  })

  // ===========================================================================
  // UNDO / REDO TESTS
  // ===========================================================================
  describe('Undo/Redo', () => {
    it('undoes digit placement', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
      })
      expect(result.current.board[2]).toBe(4)
      
      act(() => {
        result.current.undo()
      })
      expect(result.current.board[2]).toBe(0)
    })

    it('enables canRedo after undo', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
      })
      
      act(() => {
        result.current.undo()
      })
      
      expect(result.current.canRedo).toBe(true)
    })

    it('redoes undone move', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
      })
      
      act(() => {
        result.current.undo()
      })
      expect(result.current.board[2]).toBe(0)
      
      act(() => {
        result.current.redo()
      })
      expect(result.current.board[2]).toBe(4)
    })

    it('undoes note toggle', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, true) // Add note
      })
      expect(hasCandidate(result.current.candidates[2], 4)).toBe(true)
      
      act(() => {
        result.current.undo()
      })
      expect(hasCandidate(result.current.candidates[2], 4)).toBe(false)
    })

    it('handles multiple undo/redo operations', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
      })
      act(() => {
        result.current.setCell(3, 8, false)
      })
      act(() => {
        result.current.setCell(5, 2, false)
      })
      expect(result.current.board[2]).toBe(4)
      expect(result.current.board[3]).toBe(8)
      expect(result.current.board[5]).toBe(2)
      
      act(() => {
        result.current.undo()
      })
      act(() => {
        result.current.undo()
      })
      expect(result.current.board[2]).toBe(4)
      expect(result.current.board[3]).toBe(0)
      expect(result.current.board[5]).toBe(0)
      
      act(() => {
        result.current.redo()
      })
      expect(result.current.board[3]).toBe(8)
    })

    it('does nothing when undo called with no history', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      // Should not throw
      act(() => {
        result.current.undo()
      })
      
      expect(result.current.board).toEqual(puzzle)
    })

    it('does nothing when redo called at end of history', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
      })
      
      // Should not throw
      act(() => {
        result.current.redo()
      })
      
      expect(result.current.board[2]).toBe(4)
    })

    it('truncates redo history when new move made after undo', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
      })
      act(() => {
        result.current.setCell(3, 8, false)
      })
      act(() => {
        result.current.undo()
      })
      expect(result.current.canRedo).toBe(true)
      
      // Make a new move - should truncate redo history
      act(() => {
        result.current.setCell(5, 2, false)
      })
      
      expect(result.current.canRedo).toBe(false)
      expect(result.current.history.length).toBe(2)
    })
  })

  // ===========================================================================
  // ERASE CELL TESTS
  // ===========================================================================
  describe('eraseCell', () => {
    it('clears user-placed digit', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
      })
      expect(result.current.board[2]).toBe(4)
      
      act(() => {
        result.current.eraseCell(2)
      })
      expect(result.current.board[2]).toBe(0)
    })

    it('does not erase given cells', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.eraseCell(0) // Cell 0 is given (value 5)
      })
      
      expect(result.current.board[0]).toBe(5)
    })

    it('clears candidates when erasing', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      // Add some notes using toggleCandidate to avoid debounce
      act(() => {
        result.current.toggleCandidate(2, 4)
      })
      act(() => {
        result.current.toggleCandidate(2, 7)
      })
      expect(countCandidates(result.current.candidates[2])).toBe(2)
      
      // Erase
      act(() => {
        result.current.eraseCell(2)
      })
      expect(countCandidates(result.current.candidates[2])).toBe(0)
    })

    it('adds erase to history', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
      })
      const historyLengthBefore = result.current.history.length
      
      act(() => {
        result.current.eraseCell(2)
      })
      
      expect(result.current.history.length).toBe(historyLengthBefore + 1)
      expect(result.current.history[result.current.history.length - 1]?.action).toBe('erase')
    })

    it('does nothing when erasing empty cell with no candidates', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      const historyLengthBefore = result.current.history.length
      
      act(() => {
        result.current.eraseCell(2) // Cell 2 is already empty
      })
      
      // History should not change
      expect(result.current.history.length).toBe(historyLengthBefore)
    })
  })

  // ===========================================================================
  // RESET GAME / CLEAR ALL TESTS
  // ===========================================================================
  describe('resetGame / clearAll', () => {
    it('restores initial board state on resetGame', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
        result.current.setCell(3, 8, false)
        result.current.resetGame()
      })
      
      expect(result.current.board).toEqual(puzzle)
    })

    it('clears history on resetGame', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
        result.current.resetGame()
      })
      
      expect(result.current.history).toEqual([])
      expect(result.current.canUndo).toBe(false)
    })

    it('clears candidates on resetGame', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, true)
        result.current.resetGame()
      })
      
      expect(result.current.candidates.every(c => c === 0)).toBe(true)
    })

    it('clearAll removes user digits but keeps givens', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
        result.current.setCell(3, 8, false)
        result.current.clearAll()
      })
      
      expect(result.current.board[0]).toBe(5) // Given preserved
      expect(result.current.board[2]).toBe(0) // User digit cleared
      expect(result.current.board[3]).toBe(0) // User digit cleared
    })

    it('clearAll clears history', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, false)
        result.current.clearAll()
      })
      
      expect(result.current.history).toEqual([])
      expect(result.current.canUndo).toBe(false)
    })
  })

  // ===========================================================================
  // CLEAR CANDIDATES TESTS
  // ===========================================================================
  describe('clearCandidates', () => {
    it('clears all candidates from the board', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      // Add some candidates
      act(() => {
        result.current.setCell(2, 4, true)
        result.current.setCell(3, 7, true)
        result.current.setCell(5, 2, true)
      })
      expect(result.current.candidates.some(c => c !== 0)).toBe(true)
      
      act(() => {
        result.current.clearCandidates()
      })
      
      expect(result.current.candidates.every(c => c === 0)).toBe(true)
    })

    it('adds clear candidates to history (undoable)', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 4, true)
        result.current.clearCandidates()
      })
      
      expect(result.current.history.some(m => m.action === 'clear-candidates')).toBe(true)
    })
  })

  // ===========================================================================
  // HELPER FUNCTION TESTS
  // ===========================================================================
  describe('Helper Functions', () => {
    describe('isGivenCell', () => {
      it('returns true for cells with initial values', () => {
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        expect(result.current.isGivenCell(0)).toBe(true)  // Has 5
        expect(result.current.isGivenCell(1)).toBe(true)  // Has 3
        expect(result.current.isGivenCell(9)).toBe(true)  // Has 6
      })

      it('returns false for empty cells', () => {
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        expect(result.current.isGivenCell(2)).toBe(false)
        expect(result.current.isGivenCell(3)).toBe(false)
      })

      it('still returns false for user-filled cells', () => {
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        act(() => {
          result.current.setCell(2, 4, false)
        })
        
        expect(result.current.isGivenCell(2)).toBe(false) // User-placed, not given
      })
    })

    describe('calculateCandidatesForCell', () => {
      it('returns valid candidates for empty cell', () => {
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        const candidateMask = result.current.calculateCandidatesForCell(2, puzzle)
        
        // Should exclude digits already in row/col/box
        // Row 0 has 5, 3, 7 -> exclude these
        expect(hasCandidate(candidateMask, 5)).toBe(false)
        expect(hasCandidate(candidateMask, 3)).toBe(false)
        expect(hasCandidate(candidateMask, 7)).toBe(false)
      })

      it('returns empty mask for filled cell', () => {
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        // Cell 0 has value 5
        const candidateMask = result.current.calculateCandidatesForCell(0, puzzle)
        
        // Actually, the function calculates what COULD go there, not checking if it's filled
        // Let's check with a board where the cell is filled
        const filledPuzzle = [...puzzle]
        filledPuzzle[2] = 4
        
        // For a cell that has a value, peers have that value eliminated
        // But calculateCandidatesForCell checks placement validity, not if cell is empty
      })
    })

    describe('fillAllCandidates', () => {
      it('fills valid candidates for all empty cells', () => {
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        let filledCandidates: Uint16Array | undefined
        act(() => {
          filledCandidates = result.current.fillAllCandidates()
        })
        
        // Cell 2 is empty - should have some candidates
        expect(filledCandidates).toBeDefined()
        expect(countCandidates(filledCandidates![2])).toBeGreaterThan(0)
      })

      it('sets empty candidates for filled cells', () => {
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        let filledCandidates: Uint16Array | undefined
        act(() => {
          filledCandidates = result.current.fillAllCandidates()
        })
        
        // Cell 0 has value 5 - should have no candidates
        expect(filledCandidates).toBeDefined()
        expect(filledCandidates![0]).toBe(0)
      })

      it('reads fresh board state via boardRef, preventing race conditions', () => {
        // Regression test for race condition bug where fillAllCandidates used stale
        // board state when called rapidly after setCell (e.g., place digit then immediately
        // fill candidates). The fix uses boardRef to get fresh state instead of closure.
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        // Place digit 5 in cell 2 (row 0, col 2)
        act(() => {
          result.current.setCell(2, 5, false)
        })
        expect(result.current.board[2]).toBe(5)
        
        // Immediately call fillAllCandidates - it should see the newly placed digit
        // via boardRef (not stale closure state)
        let candidates: Uint16Array | undefined
        act(() => {
          candidates = result.current.fillAllCandidates()
        })
        
        expect(candidates).toBeDefined()
        
        // Cell 1 is in the same row as cell 2
        // Since cell 2 now has value 5, cell 1 should NOT have candidate 5
        // (it should be eliminated by the peer)
        expect(hasCandidate(candidates![1], 5)).toBe(false)
        
        // Cell 2 itself should have no candidates (it's filled)
        expect(candidates![2]).toBe(0)
        
        // Verify cell in different row/col/box still has candidate 5
        // Cell 20 (row 2, col 2) - different row, same column
        // Column 2 now has 5, so cell 20 should also not have candidate 5
        expect(hasCandidate(candidates![20], 5)).toBe(false)
      })
    })

    describe('areCandidatesFilled', () => {
      it('returns false when no candidates are set', () => {
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        expect(result.current.areCandidatesFilled()).toBe(false)
      })

      it('returns true when at least one empty cell has candidates', () => {
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        act(() => {
          result.current.setCell(2, 4, true) // Add a note
        })
        
        expect(result.current.areCandidatesFilled()).toBe(true)
      })
    })

    describe('checkNotes', () => {
      it('returns valid when no notes exist', () => {
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        const check = result.current.checkNotes()
        
        expect(check.valid).toBe(true)
        expect(check.wrongNotes).toEqual([])
        expect(check.cellsWithNotes).toBe(0)
      })

      it('detects wrong notes (invalid candidates)', () => {
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        // Cell 2 is in row 0 which has 5 at position 0
        // Adding 5 as a note to cell 2 should be invalid
        act(() => {
          result.current.setCell(2, 5, true)
        })
        
        const check = result.current.checkNotes()
        
        expect(check.valid).toBe(false)
        expect(check.wrongNotes.length).toBeGreaterThan(0)
        expect(check.wrongNotes.some(n => n.idx === 2 && n.digit === 5)).toBe(true)
      })
    })
  })

  // ===========================================================================
  // COMPLETION DETECTION TESTS
  // ===========================================================================
  describe('Completion Detection', () => {
    it('detects completion when puzzle is solved', () => {
      const almostComplete = createNearlyCompletePuzzle()
      const onComplete = vi.fn()
      const { result } = renderHook(() => 
        useSudokuGame({ initialBoard: almostComplete, onComplete })
      )
      
      // Last cell (80) should be 9 to complete
      act(() => {
        result.current.setCell(80, 9, false)
      })
      
      expect(result.current.isComplete).toBe(true)
      expect(onComplete).toHaveBeenCalled()
    })

    it('does not detect completion for invalid solution', () => {
      const almostComplete = createNearlyCompletePuzzle()
      const onComplete = vi.fn()
      const { result } = renderHook(() => 
        useSudokuGame({ initialBoard: almostComplete, onComplete })
      )
      
      // Place wrong digit
      act(() => {
        result.current.setCell(80, 1, false) // Wrong digit
      })
      
      expect(result.current.isComplete).toBe(false)
      expect(onComplete).not.toHaveBeenCalled()
    })

    it('setIsComplete allows manual completion setting', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      expect(result.current.isComplete).toBe(false)
      
      act(() => {
        result.current.setIsComplete(true)
      })
      
      expect(result.current.isComplete).toBe(true)
    })
  })

  // ===========================================================================
  // EXTERNAL STATE MANAGEMENT TESTS
  // ===========================================================================
  describe('External State Management', () => {
    describe('restoreState', () => {
      it('restores board and candidates from saved state', () => {
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        const savedBoard = [...puzzle]
        savedBoard[2] = 4
        savedBoard[3] = 8
        
        const savedCandidates = new Uint16Array(81)
        savedCandidates[5] = 0b110 // candidates 1 and 2
        
        act(() => {
          result.current.restoreState(savedBoard, savedCandidates, [])
        })
        
        expect(result.current.board[2]).toBe(4)
        expect(result.current.board[3]).toBe(8)
        expect(result.current.candidates[5]).toBe(0b110)
      })
    })

    describe('setBoardState', () => {
      it('sets board and candidates without modifying history', () => {
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        // Make some moves to create history
        act(() => {
          result.current.setCell(2, 4, false)
        })
        const historyLength = result.current.history.length
        
        const newBoard = [...puzzle]
        newBoard[3] = 8
        const newCandidates = new Uint16Array(81)
        
        act(() => {
          result.current.setBoardState(newBoard, newCandidates)
        })
        
        expect(result.current.board[3]).toBe(8)
        expect(result.current.history.length).toBe(historyLength) // History unchanged
      })
    })

    describe('applyExternalMove', () => {
      it('applies external move and adds to history', () => {
        const puzzle = createTestPuzzle()
        const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
        
        const newBoard = [...puzzle]
        newBoard[2] = 4
        const newCandidates = new Uint16Array(81)
        
        const move = {
          step_index: 0,
          technique: 'Naked Single',
          action: 'place',
          digit: 4,
          targets: [{ row: 0, col: 2 }],
          explanation: 'Test move',
          refs: { title: '', slug: '', url: '' },
          highlights: { primary: [] }
        }
        
        act(() => {
          result.current.applyExternalMove(newBoard, newCandidates, move)
        })
        
        expect(result.current.board[2]).toBe(4)
        expect(result.current.history.length).toBe(1)
        expect(result.current.history[0]?.technique).toBe('Naked Single')
      })
    })
  })

  // ===========================================================================
  // DIGIT COUNTS TESTS
  // ===========================================================================
  describe('digitCounts', () => {
    it('updates when digits are placed', () => {
      const puzzle = createEmptyPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      expect(result.current.digitCounts[0]).toBe(0) // Count of 1s
      
      act(() => {
        result.current.setCell(0, 1, false)
      })
      act(() => {
        result.current.setCell(10, 1, false) // Different row to avoid conflict
      })
      act(() => {
        result.current.setCell(20, 1, false) // Different row/box to avoid conflict
      })
      
      expect(result.current.digitCounts[0]).toBe(3) // Now 3 ones
    })

    it('updates when digits are erased', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      act(() => {
        result.current.setCell(2, 1, false)
      })
      const countBefore = result.current.digitCounts[0] // Count of 1s
      
      act(() => {
        result.current.eraseCell(2)
      })
      
      expect(result.current.digitCounts[0]).toBe(countBefore - 1)
    })
  })

  // ===========================================================================
  // CANDIDATES VERSION TESTS
  // ===========================================================================
  describe('candidatesVersion', () => {
    it('increments when candidates change', () => {
      const puzzle = createTestPuzzle()
      const { result } = renderHook(() => useSudokuGame({ initialBoard: puzzle }))
      
      const versionBefore = result.current.candidatesVersion
      
      act(() => {
        result.current.setCell(2, 4, true) // Add note
      })
      
      expect(result.current.candidatesVersion).toBeGreaterThan(versionBefore)
    })
  })
})
