import { describe, it, expect } from 'vitest'
import {
  getRowCells,
  getColCells,
  getBoxCells,
  forEachUnit,
  findDuplicates,
  isValidSolution,
} from './validationUtils'

describe('validationUtils', () => {
  describe('getRowCells', () => {
    it('should return correct cell indices for row 0', () => {
      expect(getRowCells(0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    })

    it('should return correct cell indices for row 4', () => {
      expect(getRowCells(4)).toEqual([36, 37, 38, 39, 40, 41, 42, 43, 44])
    })

    it('should return correct cell indices for row 8', () => {
      expect(getRowCells(8)).toEqual([72, 73, 74, 75, 76, 77, 78, 79, 80])
    })

    it('should always return 9 cells', () => {
      for (let row = 0; row < 9; row++) {
        expect(getRowCells(row)).toHaveLength(9)
      }
    })
  })

  describe('getColCells', () => {
    it('should return correct cell indices for column 0', () => {
      expect(getColCells(0)).toEqual([0, 9, 18, 27, 36, 45, 54, 63, 72])
    })

    it('should return correct cell indices for column 4', () => {
      expect(getColCells(4)).toEqual([4, 13, 22, 31, 40, 49, 58, 67, 76])
    })

    it('should return correct cell indices for column 8', () => {
      expect(getColCells(8)).toEqual([8, 17, 26, 35, 44, 53, 62, 71, 80])
    })

    it('should always return 9 cells', () => {
      for (let col = 0; col < 9; col++) {
        expect(getColCells(col)).toHaveLength(9)
      }
    })
  })

  describe('getBoxCells', () => {
    it('should return correct cell indices for box 0 (top-left)', () => {
      expect(getBoxCells(0)).toEqual([0, 1, 2, 9, 10, 11, 18, 19, 20])
    })

    it('should return correct cell indices for box 4 (center)', () => {
      expect(getBoxCells(4)).toEqual([30, 31, 32, 39, 40, 41, 48, 49, 50])
    })

    it('should return correct cell indices for box 8 (bottom-right)', () => {
      expect(getBoxCells(8)).toEqual([60, 61, 62, 69, 70, 71, 78, 79, 80])
    })

    it('should always return 9 cells', () => {
      for (let box = 0; box < 9; box++) {
        expect(getBoxCells(box)).toHaveLength(9)
      }
    })

    it('should cover all 81 cells across all boxes', () => {
      const allCells = new Set<number>()
      for (let box = 0; box < 9; box++) {
        for (const cell of getBoxCells(box)) {
          allCells.add(cell)
        }
      }
      expect(allCells.size).toBe(81)
    })
  })

  describe('forEachUnit', () => {
    it('should iterate over 27 units (9 rows + 9 cols + 9 boxes)', () => {
      let count = 0
      forEachUnit(() => { count++ })
      expect(count).toBe(27)
    })

    it('should provide correct unit types in order', () => {
      const types: string[] = []
      forEachUnit((unitType) => {
        types.push(unitType)
      })
      expect(types.slice(0, 9)).toEqual(Array(9).fill('row'))
      expect(types.slice(9, 18)).toEqual(Array(9).fill('col'))
      expect(types.slice(18, 27)).toEqual(Array(9).fill('box'))
    })

    it('should stop iteration when callback returns false', () => {
      let count = 0
      forEachUnit((unitType, index) => {
        count++
        // Stop after 5 rows
        if (unitType === 'row' && index === 4) return false
      })
      expect(count).toBe(5)
    })

    it('should provide correct cells for each unit', () => {
      forEachUnit((unitType, index, cells) => {
        expect(cells).toHaveLength(9)
        
        if (unitType === 'row') {
          expect(cells).toEqual(getRowCells(index))
        } else if (unitType === 'col') {
          expect(cells).toEqual(getColCells(index))
        } else if (unitType === 'box') {
          expect(cells).toEqual(getBoxCells(index))
        }
      })
    })
  })

  describe('findDuplicates', () => {
    it('should return empty set for valid board with no duplicates', () => {
      // A valid solved Sudoku has no duplicates
      const validBoard = [
        5,3,4,6,7,8,9,1,2,
        6,7,2,1,9,5,3,4,8,
        1,9,8,3,4,2,5,6,7,
        8,5,9,7,6,1,4,2,3,
        4,2,6,8,5,3,7,9,1,
        7,1,3,9,2,4,8,5,6,
        9,6,1,5,3,7,2,8,4,
        2,8,7,4,1,9,6,3,5,
        3,4,5,2,8,6,1,7,9,
      ]
      expect(findDuplicates(validBoard).size).toBe(0)
    })

    it('should return empty set for empty board', () => {
      const emptyBoard = Array(81).fill(0)
      expect(findDuplicates(emptyBoard).size).toBe(0)
    })

    it('should find duplicates in a row', () => {
      const board = Array(81).fill(0)
      board[0] = 5  // row 0, col 0
      board[5] = 5  // row 0, col 5 - duplicate!
      
      const duplicates = findDuplicates(board)
      expect(duplicates.has(0)).toBe(true)
      expect(duplicates.has(5)).toBe(true)
      expect(duplicates.size).toBe(2)
    })

    it('should find duplicates in a column', () => {
      const board = Array(81).fill(0)
      board[0] = 3   // row 0, col 0
      board[54] = 3  // row 6, col 0 - duplicate!
      
      const duplicates = findDuplicates(board)
      expect(duplicates.has(0)).toBe(true)
      expect(duplicates.has(54)).toBe(true)
      expect(duplicates.size).toBe(2)
    })

    it('should find duplicates in a box', () => {
      const board = Array(81).fill(0)
      board[0] = 7   // row 0, col 0 (box 0)
      board[20] = 7  // row 2, col 2 (box 0) - duplicate!
      
      const duplicates = findDuplicates(board)
      expect(duplicates.has(0)).toBe(true)
      expect(duplicates.has(20)).toBe(true)
      expect(duplicates.size).toBe(2)
    })

    it('should find multiple sets of duplicates', () => {
      const board = Array(81).fill(0)
      // Two 5s in row 0
      board[0] = 5
      board[8] = 5
      // Two 3s in column 4
      board[4] = 3
      board[76] = 3
      
      const duplicates = findDuplicates(board)
      expect(duplicates.has(0)).toBe(true)
      expect(duplicates.has(8)).toBe(true)
      expect(duplicates.has(4)).toBe(true)
      expect(duplicates.has(76)).toBe(true)
    })

    it('should find triple duplicates', () => {
      const board = Array(81).fill(0)
      // Three 9s in row 0
      board[0] = 9
      board[4] = 9
      board[8] = 9
      
      const duplicates = findDuplicates(board)
      expect(duplicates.has(0)).toBe(true)
      expect(duplicates.has(4)).toBe(true)
      expect(duplicates.has(8)).toBe(true)
      expect(duplicates.size).toBe(3)
    })
  })

  describe('isValidSolution', () => {
    it('should return true for a valid complete solution', () => {
      const validBoard = [
        5,3,4,6,7,8,9,1,2,
        6,7,2,1,9,5,3,4,8,
        1,9,8,3,4,2,5,6,7,
        8,5,9,7,6,1,4,2,3,
        4,2,6,8,5,3,7,9,1,
        7,1,3,9,2,4,8,5,6,
        9,6,1,5,3,7,2,8,4,
        2,8,7,4,1,9,6,3,5,
        3,4,5,2,8,6,1,7,9,
      ]
      expect(isValidSolution(validBoard)).toBe(true)
    })

    it('should return false for board with empty cells', () => {
      const incompleteBoard = [
        5,3,4,6,7,8,9,1,2,
        6,7,2,1,9,5,3,4,8,
        1,9,8,3,4,2,5,6,7,
        8,5,9,7,6,1,4,2,3,
        4,2,6,8,5,3,7,9,1,
        7,1,3,9,2,4,8,5,6,
        9,6,1,5,3,7,2,8,4,
        2,8,7,4,1,9,6,3,5,
        3,4,5,2,8,6,1,7,0, // Last cell empty
      ]
      expect(isValidSolution(incompleteBoard)).toBe(false)
    })

    it('should return false for board with row duplicate', () => {
      const invalidBoard = [
        5,3,4,6,7,8,9,1,5, // Duplicate 5 in row 0
        6,7,2,1,9,5,3,4,8,
        1,9,8,3,4,2,5,6,7,
        8,5,9,7,6,1,4,2,3,
        4,2,6,8,5,3,7,9,1,
        7,1,3,9,2,4,8,5,6,
        9,6,1,5,3,7,2,8,4,
        2,8,7,4,1,9,6,3,5,
        3,4,5,2,8,6,1,7,9,
      ]
      expect(isValidSolution(invalidBoard)).toBe(false)
    })

    it('should return false for board with column duplicate', () => {
      const invalidBoard = [
        5,3,4,6,7,8,9,1,2,
        6,7,2,1,9,5,3,4,8,
        1,9,8,3,4,2,5,6,7,
        8,5,9,7,6,1,4,2,3,
        4,2,6,8,5,3,7,9,1,
        7,1,3,9,2,4,8,5,6,
        9,6,1,5,3,7,2,8,4,
        2,8,7,4,1,9,6,3,5,
        5,4,5,2,8,6,1,7,9, // 5 in col 0 duplicates row 0
      ]
      expect(isValidSolution(invalidBoard)).toBe(false)
    })

    it('should return false for board with box duplicate', () => {
      // Create a board that's valid for rows and columns but has box duplicate
      const invalidBoard = [
        1,2,3,4,5,6,7,8,9,
        4,5,6,7,8,9,1,2,3,
        7,8,1,1,2,3,4,5,6, // Box 1 has two 1s (position 18 and 21)
        2,3,4,5,6,7,8,9,1,
        5,6,7,8,9,1,2,3,4,
        8,9,1,2,3,4,5,6,7,
        3,4,5,6,7,8,9,1,2,
        6,7,8,9,1,2,3,4,5,
        9,1,2,3,4,5,6,7,8,
      ]
      expect(isValidSolution(invalidBoard)).toBe(false)
    })

    it('should return false for empty board', () => {
      const emptyBoard = Array(81).fill(0)
      expect(isValidSolution(emptyBoard)).toBe(false)
    })

    it('should return false for partially filled board', () => {
      const partialBoard = Array(81).fill(0)
      // Fill just the first row correctly
      for (let i = 0; i < 9; i++) {
        partialBoard[i] = i + 1
      }
      expect(isValidSolution(partialBoard)).toBe(false)
    })

    it('should handle sparse undefined values gracefully', () => {
      // Edge case: what if board has undefined values?
      const sparseBoard: (number | undefined)[] = Array(81).fill(undefined)
      // @ts-expect-error - Testing edge case with undefined values
      expect(isValidSolution(sparseBoard)).toBe(false)
    })
  })

  describe('integration tests', () => {
    it('findDuplicates and isValidSolution should agree on valid boards', () => {
      const validBoard = [
        5,3,4,6,7,8,9,1,2,
        6,7,2,1,9,5,3,4,8,
        1,9,8,3,4,2,5,6,7,
        8,5,9,7,6,1,4,2,3,
        4,2,6,8,5,3,7,9,1,
        7,1,3,9,2,4,8,5,6,
        9,6,1,5,3,7,2,8,4,
        2,8,7,4,1,9,6,3,5,
        3,4,5,2,8,6,1,7,9,
      ]
      
      expect(isValidSolution(validBoard)).toBe(true)
      expect(findDuplicates(validBoard).size).toBe(0)
    })

    it('findDuplicates should find issues that isValidSolution rejects', () => {
      const invalidBoard = [
        5,3,4,6,7,8,9,1,5, // Duplicate 5 in row
        6,7,2,1,9,5,3,4,8,
        1,9,8,3,4,2,5,6,7,
        8,5,9,7,6,1,4,2,3,
        4,2,6,8,5,3,7,9,1,
        7,1,3,9,2,4,8,5,6,
        9,6,1,5,3,7,2,8,4,
        2,8,7,4,1,9,6,3,5,
        3,4,5,2,8,6,1,7,9,
      ]
      
      expect(isValidSolution(invalidBoard)).toBe(false)
      expect(findDuplicates(invalidBoard).size).toBeGreaterThan(0)
    })

    it('all 27 units should cover entire board without overlap in each unit', () => {
      // Verify the unit functions create proper Sudoku constraints
      const coveredByRows = new Set<number>()
      const coveredByCols = new Set<number>()
      const coveredByBoxes = new Set<number>()
      
      for (let i = 0; i < 9; i++) {
        getRowCells(i).forEach(c => coveredByRows.add(c))
        getColCells(i).forEach(c => coveredByCols.add(c))
        getBoxCells(i).forEach(c => coveredByBoxes.add(c))
      }
      
      // Each type should cover all 81 cells
      expect(coveredByRows.size).toBe(81)
      expect(coveredByCols.size).toBe(81)
      expect(coveredByBoxes.size).toBe(81)
    })
  })
})
