import { describe, it, expect } from 'vitest'
import {
  cellIndexToCoords,
  coordsToCellIndex,
  calculatePathCells,
  isDragBlocked,
} from './pathUtils'

// =============================================================================
// TEST UTILITIES
// =============================================================================

function createInitialBoard(): number[] {
  const board = Array(81).fill(0)
  board[0] = 5
  board[10] = 3
  board[20] = 7
  return board
}

// =============================================================================
// TESTS
// =============================================================================

describe('cellIndexToCoords', () => {
  it('converts index 0 to (row 0, col 0)', () => {
    expect(cellIndexToCoords(0)).toEqual({ row: 0, col: 0 })
  })

  it('converts index 8 to (row 0, col 8)', () => {
    expect(cellIndexToCoords(8)).toEqual({ row: 0, col: 8 })
  })

  it('converts index 9 to (row 1, col 0)', () => {
    expect(cellIndexToCoords(9)).toEqual({ row: 1, col: 0 })
  })

  it('converts index 40 to (row 4, col 4)', () => {
    expect(cellIndexToCoords(40)).toEqual({ row: 4, col: 4 })
  })

  it('converts index 80 to (row 8, col 8)', () => {
    expect(cellIndexToCoords(80)).toEqual({ row: 8, col: 8 })
  })
})

describe('coordsToCellIndex', () => {
  it('converts (row 0, col 0) to index 0', () => {
    expect(coordsToCellIndex(0, 0)).toBe(0)
  })

  it('converts (row 0, col 8) to index 8', () => {
    expect(coordsToCellIndex(0, 8)).toBe(8)
  })

  it('converts (row 1, col 0) to index 9', () => {
    expect(coordsToCellIndex(1, 0)).toBe(9)
  })

  it('converts (row 4, col 4) to index 40', () => {
    expect(coordsToCellIndex(4, 4)).toBe(40)
  })

  it('converts (row 8, col 8) to index 80', () => {
    expect(coordsToCellIndex(8, 8)).toBe(80)
  })
})

describe('calculatePathCells', () => {
  describe('single cell (start equals end)', () => {
    it('returns array with single cell when start equals end', () => {
      const path = calculatePathCells(42, 42)
      expect(path).toEqual([42])
    })

    it('returns array with cell 0 only', () => {
      const path = calculatePathCells(0, 0)
      expect(path).toEqual([0])
    })

    it('returns array with cell 80 only', () => {
      const path = calculatePathCells(80, 80)
      expect(path).toEqual([80])
    })
  })

  describe('horizontal drag', () => {
    it('calculates horizontal path left to right', () => {
      const path = calculatePathCells(0, 8)
      expect(path).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    })

    it('calculates horizontal path right to left', () => {
      const path = calculatePathCells(8, 0)
      expect(path).toEqual([8, 7, 6, 5, 4, 3, 2, 1, 0])
    })

    it('calculates short horizontal path', () => {
      const path = calculatePathCells(10, 12)
      expect(path).toEqual([10, 11, 12])
    })

    it('calculates middle row horizontal path', () => {
      const path = calculatePathCells(36, 44)
      expect(path).toEqual([36, 37, 38, 39, 40, 41, 42, 43, 44])
    })
  })

  describe('vertical drag', () => {
    it('calculates vertical path top to bottom', () => {
      const path = calculatePathCells(0, 72)
      expect(path).toEqual([0, 9, 18, 27, 36, 45, 54, 63, 72])
    })

    it('calculates vertical path bottom to top', () => {
      const path = calculatePathCells(72, 0)
      expect(path).toEqual([72, 63, 54, 45, 36, 27, 18, 9, 0])
    })

    it('calculates short vertical path', () => {
      const path = calculatePathCells(0, 18)
      expect(path).toEqual([0, 9, 18])
    })

    it('calculates middle column vertical path', () => {
      const path = calculatePathCells(4, 76)
      expect(path).toEqual([4, 13, 22, 31, 40, 49, 58, 67, 76])
    })
  })

  describe('diagonal drag', () => {
    it('calculates diagonal path top-left to bottom-right', () => {
      const path = calculatePathCells(0, 80)
      expect(path).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80])
    })

    it('calculates diagonal path bottom-right to top-left', () => {
      const path = calculatePathCells(80, 0)
      expect(path).toEqual([80, 70, 60, 50, 40, 30, 20, 10, 0])
    })

    it('calculates short diagonal path', () => {
      const path = calculatePathCells(0, 10)
      expect(path).toEqual([0, 10])
    })

    it('calculates diagonal path in middle of board', () => {
      const path = calculatePathCells(31, 49)
      expect(path).toEqual([31, 40, 49])
    })
  })

  describe('path works in all directions', () => {
    it('works for top-right to bottom-left diagonal', () => {
      const path = calculatePathCells(8, 72)
      expect(path).toEqual([8, 16, 24, 32, 40, 48, 56, 64, 72])
    })

    it('works for bottom-left to top-right diagonal', () => {
      const path = calculatePathCells(72, 8)
      expect(path).toEqual([72, 64, 56, 48, 40, 32, 24, 16, 8])
    })
  })
})

describe('isDragBlocked', () => {
  it('returns true when current cell is a given', () => {
    const initialBoard = createInitialBoard()
    expect(isDragBlocked(0, initialBoard)).toBe(true)
    expect(isDragBlocked(10, initialBoard)).toBe(true)
    expect(isDragBlocked(20, initialBoard)).toBe(true)
  })

  it('returns false when current cell is not a given', () => {
    const initialBoard = createInitialBoard()
    expect(isDragBlocked(1, initialBoard)).toBe(false)
    expect(isDragBlocked(15, initialBoard)).toBe(false)
    expect(isDragBlocked(42, initialBoard)).toBe(false)
  })

  it('returns false when cell value is 0', () => {
    const board = Array(81).fill(0)
    expect(isDragBlocked(42, board)).toBe(false)
  })

  it('returns true when cell value is non-zero', () => {
    const board = Array(81).fill(0)
    board[42] = 5
    expect(isDragBlocked(42, board)).toBe(true)
  })
})
