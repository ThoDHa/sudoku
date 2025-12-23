import { describe, it, expect } from 'vitest'
import { encodePuzzle, decodePuzzle, encodePuzzleWithState, decodePuzzleWithState } from './puzzleEncoding'

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

  describe('encodePuzzleWithState', () => {
    it('should throw error for invalid board length', () => {
      const board = Array(80).fill(0)
      const givens = Array(81).fill(0)
      expect(() => encodePuzzleWithState(board, givens)).toThrow('Board and givens must have 81 cells')
    })

    it('should throw error for invalid givens length', () => {
      const board = Array(81).fill(0)
      const givens = Array(80).fill(0)
      expect(() => encodePuzzleWithState(board, givens)).toThrow('Board and givens must have 81 cells')
    })

    it('should encode board with givens marker', () => {
      const board = Array(81).fill(0)
      const givens = Array(81).fill(0)
      board[0] = 5
      givens[0] = 5
      board[10] = 3

      const encoded = encodePuzzleWithState(board, givens)
      expect(encoded.startsWith('e')).toBe(true)
      expect(encoded.length).toBeGreaterThan(14)
    })

    it('should encode board with candidates using c prefix', () => {
      const board = Array(81).fill(0)
      const givens = Array(81).fill(0)
      board[0] = 5
      givens[0] = 5
      const candidates: number[][] = Array(81).fill(null).map(() => [])
      candidates[1] = [1, 2, 3]
      candidates[10] = [4, 5]

      const encoded = encodePuzzleWithState(board, givens, candidates)
      expect(encoded.startsWith('c')).toBe(true)
      expect(encoded.length).toBeGreaterThan(14)
    })

    it('should use e prefix when no candidates provided', () => {
      const board = Array(81).fill(0)
      const givens = Array(81).fill(0)
      board[0] = 5
      givens[0] = 5

      const encoded = encodePuzzleWithState(board, givens)
      expect(encoded.startsWith('e')).toBe(true)
    })

    it('should use e prefix when candidates are all empty', () => {
      const board = Array(81).fill(0)
      const givens = Array(81).fill(0)
      board[0] = 5
      givens[0] = 5
      const candidates: number[][] = Array(81).fill(null).map(() => [])

      const encoded = encodePuzzleWithState(board, givens, candidates)
      expect(encoded.startsWith('e')).toBe(true)
    })

    it('should produce URLs within browser limits', () => {
      const board = Array(81).fill(0)
      const givens = Array(81).fill(0)
      for (let i = 0; i < 50; i++) {
        board[i] = (i % 9) + 1
        givens[i] = (i % 9) + 1
      }

      const encoded = encodePuzzleWithState(board, givens)
      // Browser URL limits are typically 2000-8000 characters
      expect(encoded.length).toBeLessThan(100)
    })

    it('should produce compact encoding even with many candidates', () => {
      const board = Array(81).fill(0)
      const givens = Array(81).fill(0)
      givens[0] = 5
      board[0] = 5
      // Add candidates to every empty cell
      const candidates: number[][] = Array(81).fill(null).map((_, i) => {
        if (givens[i] !== 0) return []
        return [1, 2, 3, 4, 5, 6, 7, 8, 9] // All possible candidates
      })

      const encoded = encodePuzzleWithState(board, givens, candidates)
      // Even with all candidates, should be reasonable length
      // 81 cells * 9 bits / 6 bits per char + overhead = ~170 chars max
      expect(encoded.length).toBeLessThan(250)
    })
  })

  describe('decodePuzzleWithState', () => {
    it('should return null for non-enhanced encoding', () => {
      const result = decodePuzzleWithState('sABC')
      expect(result).toBe(null)
    })

    it('should return null for invalid enhanced encoding', () => {
      const result = decodePuzzleWithState('eABC')
      expect(result).toBe(null)
    })

    it('should decode board and givens correctly', () => {
      const board = Array(81).fill(0)
      const givens = Array(81).fill(0)
      board[0] = 5
      givens[0] = 5
      board[10] = 3

      const encoded = encodePuzzleWithState(board, givens)
      const decoded = decodePuzzleWithState(encoded)

      expect(decoded).not.toBe(null)
      expect(decoded?.board).toEqual(board)
      expect(decoded?.givens).toEqual(givens)
    })

    it('should decode candidates correctly', () => {
      const board = Array(81).fill(0)
      const givens = Array(81).fill(0)
      board[0] = 5
      givens[0] = 5
      // Note: don't set board[1] or board[10] since those cells have candidates (empty cells)
      const candidates: number[][] = Array(81).fill(null).map(() => [])
      candidates[1] = [1, 2, 3]
      candidates[10] = [4, 5]

      const encoded = encodePuzzleWithState(board, givens, candidates)
      const decoded = decodePuzzleWithState(encoded)

      expect(decoded).not.toBe(null)
      expect(decoded?.board).toEqual(board)
      expect(decoded?.givens).toEqual(givens)
      expect(decoded?.candidates).toBeDefined()
      expect(decoded?.candidates?.[1]).toEqual([1, 2, 3])
      expect(decoded?.candidates?.[10]).toEqual([4, 5])
    })

    it('should handle encoding without candidates', () => {
      const board = Array(81).fill(0)
      const givens = Array(81).fill(0)
      board[0] = 5
      givens[0] = 5

      const encoded = encodePuzzleWithState(board, givens)
      const decoded = decodePuzzleWithState(encoded)

      expect(decoded).not.toBe(null)
      expect(decoded?.board).toEqual(board)
      expect(decoded?.givens).toEqual(givens)
      // candidates should be undefined when not encoded
      expect(decoded?.candidates).toBeUndefined()
    })
  })

  describe('enhanced encoding round-trip', () => {
    it('should preserve full state through encode/decode cycle', () => {
      const board = [
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
      // Givens must match the board values at those positions!
      const givens = Array(81).fill(0)
      givens[0] = 5  // board[0] = 5 ✓
      givens[10] = 7 // board[10] = 7 ✓
      givens[20] = 8 // board[20] = 8 ✓

      const encoded = encodePuzzleWithState(board, givens)
      const decoded = decodePuzzleWithState(encoded)

      expect(decoded).not.toBe(null)
      expect(decoded?.board).toEqual(board)
      expect(decoded?.givens).toEqual(givens)
    })

    it('should handle empty board with givens', () => {
      const board = Array(81).fill(0)
      const givens = Array(81).fill(0)
      // Set givens AND matching board values
      board[0] = 5
      givens[0] = 5
      board[10] = 3
      givens[10] = 3

      const encoded = encodePuzzleWithState(board, givens)
      const decoded = decodePuzzleWithState(encoded)

      expect(decoded).not.toBe(null)
      expect(decoded?.board).toEqual(board)
      expect(decoded?.givens).toEqual(givens)
    })

    it('should preserve candidates through encode/decode cycle', () => {
      const board = Array(81).fill(0)
      const givens = Array(81).fill(0)
      board[0] = 5
      givens[0] = 5
      
      const candidates: number[][] = Array(81).fill(null).map(() => [])
      candidates[1] = [1, 2, 3]
      candidates[2] = [7, 8, 9]
      candidates[10] = [4, 5]
      candidates[40] = [1, 5, 9]

      const encoded = encodePuzzleWithState(board, givens, candidates)
      const decoded = decodePuzzleWithState(encoded)

      expect(decoded).not.toBe(null)
      expect(decoded?.board).toEqual(board)
      expect(decoded?.givens).toEqual(givens)
      expect(decoded?.candidates?.[1]).toEqual([1, 2, 3])
      expect(decoded?.candidates?.[2]).toEqual([7, 8, 9])
      expect(decoded?.candidates?.[10]).toEqual([4, 5])
      expect(decoded?.candidates?.[40]).toEqual([1, 5, 9])
    })

    it('should handle all candidates in every cell', () => {
      const board = Array(81).fill(0)
      const givens = Array(81).fill(0)
      board[0] = 5
      givens[0] = 5
      
      const candidates: number[][] = Array(81).fill(null).map((_, i) => {
        if (i === 0) return [] // Given cell has no candidates
        return [1, 2, 3, 4, 5, 6, 7, 8, 9]
      })

      const encoded = encodePuzzleWithState(board, givens, candidates)
      const decoded = decodePuzzleWithState(encoded)

      expect(decoded).not.toBe(null)
      expect(decoded?.candidates).toBeDefined()
      for (let i = 1; i < 81; i++) {
        expect(decoded?.candidates?.[i]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
      }
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
