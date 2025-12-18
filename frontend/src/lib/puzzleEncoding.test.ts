import { describe, it, expect } from 'vitest'
import { encodePuzzle, decodePuzzle } from './puzzleEncoding'

describe('puzzleEncoding', () => {
  describe('encodePuzzle', () => {
    it('should throw error for invalid puzzle length', () => {
      expect(() => encodePuzzle([1, 2, 3])).toThrow('Puzzle must have 81 cells')
      expect(() => encodePuzzle([])).toThrow('Puzzle must have 81 cells')
    })

    it('should use sparse encoding for puzzles with <= 40 filled cells', () => {
      // Create a puzzle with 25 givens (typical sudoku)
      const cells = Array(81).fill(0)
      cells[0] = 5
      cells[10] = 3
      cells[20] = 7
      cells[30] = 1
      cells[40] = 9
      // Add more to get ~25 givens
      for (let i = 0; i < 20; i++) {
        cells[50 + i] = (i % 9) + 1
      }
      
      const encoded = encodePuzzle(cells)
      expect(encoded.startsWith('s')).toBe(true)
    })

    it('should use dense encoding for puzzles with > 40 filled cells', () => {
      // Create a nearly complete puzzle (50 filled)
      const cells = Array(81).fill(0)
      for (let i = 0; i < 50; i++) {
        cells[i] = (i % 9) + 1
      }
      
      const encoded = encodePuzzle(cells)
      expect(encoded.startsWith('d')).toBe(true)
    })

    it('should handle empty puzzle', () => {
      const cells = Array(81).fill(0)
      const encoded = encodePuzzle(cells)
      expect(encoded.startsWith('s')).toBe(true)
    })
  })

  describe('decodePuzzle', () => {
    it('should return empty puzzle for empty string', () => {
      const result = decodePuzzle('')
      expect(result).toHaveLength(81)
      expect(result.every(c => c === 0)).toBe(true)
    })

    it('should decode sparse encoded puzzles', () => {
      // Create a simple puzzle
      const cells = Array(81).fill(0)
      cells[0] = 5
      cells[10] = 3
      cells[20] = 7
      cells[30] = 1
      cells[40] = 9
      
      const encoded = encodePuzzle(cells)
      const decoded = decodePuzzle(encoded)
      
      expect(decoded).toHaveLength(81)
      expect(decoded[0]).toBe(5)
      expect(decoded[10]).toBe(3)
      expect(decoded[20]).toBe(7)
      expect(decoded[30]).toBe(1)
      expect(decoded[40]).toBe(9)
    })

    it('should decode dense encoded puzzles', () => {
      // Create a puzzle with many filled cells
      const cells = Array(81).fill(0)
      for (let i = 0; i < 50; i++) {
        cells[i] = (i % 9) + 1
      }
      
      const encoded = encodePuzzle(cells)
      const decoded = decodePuzzle(encoded)
      
      expect(decoded).toHaveLength(81)
      for (let i = 0; i < 50; i++) {
        expect(decoded[i]).toBe((i % 9) + 1)
      }
    })

    it('should handle invalid sparse encoding gracefully', () => {
      // Too short for sparse encoding
      const result = decodePuzzle('sABC')
      expect(result).toHaveLength(81)
      expect(result.every(c => c === 0)).toBe(true)
    })
  })

  describe('encode/decode round-trip', () => {
    it('should preserve puzzle data through encode/decode cycle', () => {
      // Create a realistic sudoku puzzle
      const cells = Array(81).fill(0)
      const givens = [
        [0, 5], [1, 3], [4, 7],
        [9, 6], [12, 1], [13, 9], [14, 5],
        [19, 9], [20, 8], [25, 6],
        [27, 8], [31, 6], [35, 3],
        [36, 4], [39, 8], [41, 3], [44, 1],
        [45, 7], [49, 2], [53, 6],
        [55, 6], [60, 2], [61, 8],
        [66, 4], [67, 1], [68, 9], [71, 5],
        [76, 8], [79, 7], [80, 9]
      ]
      
      for (const [idx, val] of givens) {
        if (idx !== undefined) {
          cells[idx] = val
        }
      }
      
      const encoded = encodePuzzle(cells)
      const decoded = decodePuzzle(encoded)
      
      expect(decoded).toEqual(cells)
    })

    it('should preserve empty puzzle through encode/decode', () => {
      const cells = Array(81).fill(0)
      const encoded = encodePuzzle(cells)
      const decoded = decodePuzzle(encoded)
      
      expect(decoded).toEqual(cells)
    })

    it('should preserve complete puzzle through encode/decode', () => {
      // Create a complete puzzle (all cells filled)
      const cells = [
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
      
      const encoded = encodePuzzle(cells)
      const decoded = decodePuzzle(encoded)
      
      expect(decoded).toEqual(cells)
    })
  })
})
