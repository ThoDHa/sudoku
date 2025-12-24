import { describe, it, expect } from 'vitest'
import {
  solve,
  isValid,
  findConflicts,
  validateBoard,
  hasUniqueSolution,
  validatePuzzle,
} from './dp-solver'

// A valid solved Sudoku board
const VALID_SOLVED_BOARD = [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 2, 8, 6, 1, 7, 9,
]

// Nearly solved puzzle (2 empty cells)
const NEARLY_SOLVED = [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 0, 8, 0, 1, 7, 9, // 2 and 6 missing
]

// Puzzle with conflict (for isValid/findConflicts tests - NOT for solve())
const PUZZLE_WITH_CONFLICT = [
  1, 1, 0, 0, 0, 0, 0, 0, 0, // Two 1s in row - conflict
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
]

// Valid but unsolvable: cell 0 needs 9 (row has 1-8), but column 0 has 9 in row 1
// This is valid (no conflicts in existing values) but solve() returns null quickly
const UNSOLVABLE_PUZZLE = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, // cell 0 needs 9 but can't have it
  9, 4, 5, 6, 7, 8, 0, 1, 2, // 9 in column 0 blocks cell 0
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
]

const EMPTY_GRID = Array(81).fill(0)

// A valid puzzle with a unique solution (standard easy puzzle)
const VALID_UNIQUE_PUZZLE = [
  5, 3, 0, 0, 7, 0, 0, 0, 0,
  6, 0, 0, 1, 9, 5, 0, 0, 0,
  0, 9, 8, 0, 0, 0, 0, 6, 0,
  8, 0, 0, 0, 6, 0, 0, 0, 3,
  4, 0, 0, 8, 0, 3, 0, 0, 1,
  7, 0, 0, 0, 2, 0, 0, 0, 6,
  0, 6, 0, 0, 0, 0, 2, 8, 0,
  0, 0, 0, 4, 1, 9, 0, 0, 5,
  0, 0, 0, 0, 8, 0, 0, 7, 9,
]

// A puzzle with multiple solutions (too few clues - only 2 values set)
const MULTIPLE_SOLUTIONS_PUZZLE = [
  1, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 2, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
]

describe('dp-solver', () => {
  describe('solve', () => {
    it('should solve a nearly complete puzzle', () => {
      const result = solve(NEARLY_SOLVED)
      expect(result).not.toBeNull()
      expect(result).toEqual(VALID_SOLVED_BOARD)
    })

    it('should return null for unsolvable puzzle', () => {
      const result = solve(UNSOLVABLE_PUZZLE)
      expect(result).toBeNull()
    })

    it('should return same board for already solved grid', () => {
      const result = solve(VALID_SOLVED_BOARD)
      expect(result).toEqual(VALID_SOLVED_BOARD)
    })

    it('should not modify the original grid', () => {
      const original = [...NEARLY_SOLVED]
      solve(NEARLY_SOLVED)
      expect(NEARLY_SOLVED).toEqual(original)
    })
  })

  describe('isValid', () => {
    it('should return true for valid solved board', () => {
      expect(isValid(VALID_SOLVED_BOARD)).toBe(true)
    })

    it('should return true for valid partial board', () => {
      expect(isValid(NEARLY_SOLVED)).toBe(true)
    })

    it('should return true for empty board', () => {
      expect(isValid(EMPTY_GRID)).toBe(true)
    })

    it('should return false for board with row conflict', () => {
      const board = [...EMPTY_GRID]
      board[0] = 5
      board[8] = 5 // Same row
      expect(isValid(board)).toBe(false)
    })

    it('should return false for board with column conflict', () => {
      const board = [...EMPTY_GRID]
      board[0] = 3
      board[72] = 3 // Same column
      expect(isValid(board)).toBe(false)
    })

    it('should return false for board with box conflict', () => {
      const board = [...EMPTY_GRID]
      board[0] = 7 // Box 0, (0,0)
      board[20] = 7 // Box 0, (2,2)
      expect(isValid(board)).toBe(false)
    })
  })

  describe('findConflicts', () => {
    it('should return empty array for valid board', () => {
      expect(findConflicts(VALID_SOLVED_BOARD)).toEqual([])
    })

    it('should return empty array for empty board', () => {
      expect(findConflicts(EMPTY_GRID)).toEqual([])
    })

    it('should find row conflicts', () => {
      const board = [...EMPTY_GRID]
      board[0] = 5
      board[5] = 5

      const conflicts = findConflicts(board)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]).toMatchObject({
        cell1: 0,
        cell2: 5,
        value: 5,
        type: 'row',
      })
    })

    it('should find column conflicts', () => {
      const board = [...EMPTY_GRID]
      board[4] = 3
      board[76] = 3 // Same column

      const conflicts = findConflicts(board)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]).toMatchObject({
        cell1: 4,
        cell2: 76,
        value: 3,
        type: 'column',
      })
    })

    it('should find box conflicts', () => {
      const board = [...EMPTY_GRID]
      board[30] = 8 // Box 3, row 3
      board[49] = 8 // Box 3, row 5

      const conflicts = findConflicts(board)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]).toMatchObject({
        cell1: 30,
        cell2: 49,
        value: 8,
        type: 'box',
      })
    })
  })

  describe('validateBoard', () => {
    it('should return valid for correct entries', () => {
      const result = validateBoard(VALID_SOLVED_BOARD, VALID_SOLVED_BOARD)
      expect(result.valid).toBe(true)
      expect(result.message).toBe('All entries are correct so far!')
    })

    it('should return invalid for incorrect entries', () => {
      const incorrect = [...VALID_SOLVED_BOARD]
      incorrect[0] = 9 // Wrong value

      const result = validateBoard(incorrect, VALID_SOLVED_BOARD)
      expect(result.valid).toBe(false)
      expect(result.incorrectCells).toContain(0)
    })

    it('should return invalid for wrong length', () => {
      const result = validateBoard([1, 2, 3], VALID_SOLVED_BOARD)
      expect(result.valid).toBe(false)
      expect(result.message).toBe('Invalid board or solution length')
    })

    it('should ignore empty cells', () => {
      const partial = [...VALID_SOLVED_BOARD]
      partial[0] = 0

      const result = validateBoard(partial, VALID_SOLVED_BOARD)
      expect(result.valid).toBe(true)
    })

    it('should find multiple incorrect cells', () => {
      const incorrect = [...VALID_SOLVED_BOARD]
      incorrect[0] = 9
      incorrect[1] = 9
      incorrect[2] = 9

      const result = validateBoard(incorrect, VALID_SOLVED_BOARD)
      expect(result.valid).toBe(false)
      expect(result.incorrectCells).toHaveLength(3)
      expect(result.message).toBe('Found 3 incorrect cells')
    })
  })

  describe('integration', () => {
    it('should solve and produce valid result', () => {
      const result = solve(NEARLY_SOLVED)
      expect(result).not.toBeNull()
      expect(isValid(result!)).toBe(true)
      expect(findConflicts(result!)).toEqual([])
    })

    it('findConflicts and isValid should agree', () => {
      expect(isValid(VALID_SOLVED_BOARD)).toBe(true)
      expect(findConflicts(VALID_SOLVED_BOARD)).toEqual([])

      expect(isValid(PUZZLE_WITH_CONFLICT)).toBe(false)
      expect(findConflicts(PUZZLE_WITH_CONFLICT).length).toBeGreaterThan(0)
    })
  })

  describe('hasUniqueSolution', () => {
    it('should return true for puzzle with exactly one solution', () => {
      expect(hasUniqueSolution(VALID_UNIQUE_PUZZLE)).toBe(true)
    })

    it('should return false for puzzle with multiple solutions', () => {
      expect(hasUniqueSolution(MULTIPLE_SOLUTIONS_PUZZLE)).toBe(false)
    })

    it('should return false for puzzle with no solution', () => {
      expect(hasUniqueSolution(UNSOLVABLE_PUZZLE)).toBe(false)
    })

    it('should return true for already solved grid', () => {
      expect(hasUniqueSolution(VALID_SOLVED_BOARD)).toBe(true)
    })

    it('should return false for empty grid (many solutions)', () => {
      expect(hasUniqueSolution(EMPTY_GRID)).toBe(false)
    })
  })

  describe('validatePuzzle', () => {
    it('should return valid and unique for proper puzzle with solution', () => {
      const result = validatePuzzle(VALID_UNIQUE_PUZZLE)
      expect(result.valid).toBe(true)
      expect(result.unique).toBe(true)
      expect(result.solution).toBeDefined()
      expect(result.solution).toHaveLength(81)
      // Verify the solution is actually solved (no zeros)
      expect(result.solution!.every(v => v >= 1 && v <= 9)).toBe(true)
    })

    it('should return invalid for puzzle with conflicts', () => {
      const result = validatePuzzle(PUZZLE_WITH_CONFLICT)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('Puzzle has conflicting numbers')
      expect(result.solution).toBeUndefined()
    })

    it('should return valid but not unique for puzzle with multiple solutions', () => {
      const result = validatePuzzle(MULTIPLE_SOLUTIONS_PUZZLE)
      expect(result.valid).toBe(true)
      expect(result.unique).toBe(false)
      expect(result.reason).toBe('Puzzle has multiple solutions')
      // Still returns a solution (one of the possible ones)
      expect(result.solution).toBeDefined()
    })

    it('should return invalid for unsolvable puzzle', () => {
      const result = validatePuzzle(UNSOLVABLE_PUZZLE)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('Puzzle has no solution')
    })

    it('should handle empty grid (valid but not unique)', () => {
      const result = validatePuzzle(EMPTY_GRID)
      expect(result.valid).toBe(true)
      expect(result.unique).toBe(false)
      expect(result.reason).toBe('Puzzle has multiple solutions')
      expect(result.solution).toBeDefined()
    })

    it('should return valid and unique for already solved grid', () => {
      const result = validatePuzzle(VALID_SOLVED_BOARD)
      expect(result.valid).toBe(true)
      expect(result.unique).toBe(true)
      expect(result.solution).toEqual(VALID_SOLVED_BOARD)
    })
  })
})
