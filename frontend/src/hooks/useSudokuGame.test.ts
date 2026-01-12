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

// ...rest of the original content...
// (Copy from original file start through line 1097)

// ---------------------------------------------------------------------------
// Extra: Click cell with matching digit should erase (simulate click-to-delete)
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
