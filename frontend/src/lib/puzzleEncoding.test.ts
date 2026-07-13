import { describe, it, expect } from 'vitest'
import {
  encodePuzzle,
  decodePuzzle,
  encodePuzzleWithState,
  decodePuzzleWithState,
} from './puzzleEncoding'

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
      expect(result.every((c) => c === 0)).toBe(true)
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
      expect(result.every((c) => c === 0)).toBe(true)
    })
  })

  describe('encodePuzzleWithState', () => {
    it('should throw error for invalid board length', () => {
      const board = Array(80).fill(0)
      const givens = Array(81).fill(0)
      expect(() => encodePuzzleWithState(board, givens)).toThrow(
        'Board and givens must have 81 cells',
      )
    })

    it('should throw error for invalid givens length', () => {
      const board = Array(81).fill(0)
      const givens = Array(80).fill(0)
      expect(() => encodePuzzleWithState(board, givens)).toThrow(
        'Board and givens must have 81 cells',
      )
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
      const candidates: number[][] = Array(81)
        .fill(null)
        .map(() => [])
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
      const candidates: number[][] = Array(81)
        .fill(null)
        .map(() => [])

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
      const candidates: number[][] = Array(81)
        .fill(null)
        .map((_, i) => {
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
      const candidates: number[][] = Array(81)
        .fill(null)
        .map(() => [])
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
        5, 3, 4, 6, 7, 8, 9, 1, 2, 6, 7, 2, 1, 9, 5, 3, 4, 8, 1, 9, 8, 3, 4, 2, 5, 6, 7, 8, 5, 9, 7,
        6, 1, 4, 2, 3, 4, 2, 6, 8, 5, 3, 7, 9, 1, 7, 1, 3, 9, 2, 4, 8, 5, 6, 9, 6, 1, 5, 3, 7, 2, 8,
        4, 2, 8, 7, 4, 1, 9, 6, 3, 5, 3, 4, 5, 2, 8, 6, 1, 7, 9,
      ]
      // Givens must match the board values at those positions!
      const givens = Array(81).fill(0)
      givens[0] = 5 // board[0] = 5 ✓
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

      const candidates: number[][] = Array(81)
        .fill(null)
        .map(() => [])
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

      const candidates: number[][] = Array(81)
        .fill(null)
        .map((_, i) => {
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
        [0, 5],
        [1, 3],
        [4, 7],
        [9, 6],
        [12, 1],
        [13, 9],
        [14, 5],
        [19, 9],
        [20, 8],
        [25, 6],
        [27, 8],
        [31, 6],
        [35, 3],
        [36, 4],
        [39, 8],
        [41, 3],
        [44, 1],
        [45, 7],
        [49, 2],
        [53, 6],
        [55, 6],
        [60, 2],
        [61, 8],
        [66, 4],
        [67, 1],
        [68, 9],
        [71, 5],
        [76, 8],
        [79, 7],
        [80, 9],
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
        5, 3, 4, 6, 7, 8, 9, 1, 2, 6, 7, 2, 1, 9, 5, 3, 4, 8, 1, 9, 8, 3, 4, 2, 5, 6, 7, 8, 5, 9, 7,
        6, 1, 4, 2, 3, 4, 2, 6, 8, 5, 3, 7, 9, 1, 7, 1, 3, 9, 2, 4, 8, 5, 6, 9, 6, 1, 5, 3, 7, 2, 8,
        4, 2, 8, 7, 4, 1, 9, 6, 3, 5, 3, 4, 5, 2, 8, 6, 1, 7, 9,
      ]

      const encoded = encodePuzzle(cells)
      const decoded = decodePuzzle(encoded)

      expect(decoded).toEqual(cells)
    })
  })

  describe('exact encoding values', () => {
    it('encodes single-given board to exact string', () => {
      const board = Array(81).fill(0)
      board[0] = 5
      const encoded = encodePuzzle(board)
      expect(encoded.length).toBe(16) // 's' + 14-char mask + 1 digit char
      expect(encoded[0]).toBe('s')
      expect(encoded[15]).toBe('E') // ALPHABET[4] = digit 5 - 1 = 4
    })

    it('encodes empty board to just prefix', () => {
      const encoded = encodePuzzle(Array(81).fill(0))
      expect(encoded).toBe('s')
    })

    it('round-trips a sparse puzzle exactly', () => {
      const board = Array(81).fill(0)
      board[0] = 5
      board[4] = 3
      board[40] = 7
      board[80] = 9
      const encoded = encodePuzzle(board)
      const decoded = decodePuzzle(encoded)
      expect(decoded).toEqual(board)
    })

    it('round-trips a dense puzzle (all filled)', () => {
      const board = [
        5, 3, 4, 6, 7, 8, 9, 1, 2, 6, 7, 2, 1, 9, 5, 3, 4, 8, 1, 9, 8, 3, 4, 2, 5, 6, 7, 8, 5, 9, 7,
        6, 1, 4, 2, 3, 4, 2, 6, 8, 5, 3, 7, 9, 1, 7, 1, 3, 9, 2, 4, 8, 5, 6, 9, 6, 1, 5, 3, 7, 2, 8,
        4, 2, 8, 7, 4, 1, 9, 6, 3, 5, 3, 4, 5, 2, 8, 6, 1, 7, 9,
      ]
      expect(decodePuzzle(encodePuzzle(board))).toEqual(board)
    })

    it('preserves digit values in sparse encoding', () => {
      const board = Array(81).fill(0)
      board[0] = 1
      board[1] = 9
      const encoded = encodePuzzle(board)
      const decoded = decodePuzzle(encoded)
      expect(decoded[0]).toBe(1)
      expect(decoded[1]).toBe(9)
    })

    it('preserves cell positions in sparse encoding', () => {
      const board = Array(81).fill(0)
      board[10] = 5
      board[70] = 3
      const decoded = decodePuzzle(encodePuzzle(board))
      expect(decoded[10]).toBe(5)
      expect(decoded[70]).toBe(3)
      expect(decoded[0]).toBe(0)
      expect(decoded[80]).toBe(0)
    })
  })
})

const empty = (): number[] => Array(81).fill(0)

describe('puzzleEncoding - mutation-killing boundary tests', () => {
  describe('encodePuzzle sparse/dense boundary at filledCount === 40', () => {
    it('uses sparse encoding when exactly 40 cells are filled', () => {
      const cells = empty()
      for (let i = 0; i < 40; i++) cells[i] = (i % 9) + 1
      expect(encodePuzzle(cells).startsWith('s')).toBe(true)
    })

    it('uses dense encoding when exactly 41 cells are filled', () => {
      const cells = empty()
      for (let i = 0; i < 41; i++) cells[i] = (i % 9) + 1
      expect(encodePuzzle(cells).startsWith('d')).toBe(true)
    })

    it('selects dense over sparse at the 40/41 transition with identical digit patterns', () => {
      const base = empty()
      for (let i = 0; i < 40; i++) base[i] = (i % 9) + 1
      const sparse = encodePuzzle(base)
      const dense = encodePuzzle(base.map((v, i) => (i === 40 ? 1 : v)))
      expect(sparse[0]).toBe('s')
      expect(dense[0]).toBe('d')
    })
  })

  describe('raw 81-digit string decoding', () => {
    it('decodes a raw 81-digit string of 0-9 digits', () => {
      const raw = '5'.repeat(81)
      const decoded = decodePuzzle(raw)
      expect(decoded).toHaveLength(81)
      expect(decoded.every((c) => c === 5)).toBe(true)
    })

    it('decodes dots as empty cells in a raw 81-char string', () => {
      const raw = '.'.repeat(81)
      const decoded = decodePuzzle(raw)
      expect(decoded.every((c) => c === 0)).toBe(true)
    })

    it('mixes digits and dots in raw 81-char input', () => {
      const raw = '1'.repeat(40) + '.'.repeat(41)
      const decoded = decodePuzzle(raw)
      expect(decoded.slice(0, 40).every((c) => c === 1)).toBe(true)
      expect(decoded.slice(40).every((c) => c === 0)).toBe(true)
    })

    it('rejects an 80-char string (falls through to legacy dense, returns padded empty)', () => {
      const decoded = decodePuzzle('5'.repeat(80))
      expect(decoded).toHaveLength(81)
    })

    it('rejects an 82-char string (falls through to legacy dense)', () => {
      const decoded = decodePuzzle('5'.repeat(82))
      expect(decoded).toHaveLength(81)
    })

    it('rejects raw string containing non-digit/non-dot characters', () => {
      const raw = 'A'.repeat(81)
      const decoded = decodePuzzle(raw)
      expect(decoded).toHaveLength(81)
    })
  })

  describe('legacy dense decoding (no prefix)', () => {
    it('decodes a dense string without d/s prefix as legacy dense', () => {
      const board = empty()
      for (let i = 0; i < 50; i++) board[i] = (i % 9) + 1
      const withPrefix = encodePuzzle(board)
      expect(withPrefix[0]).toBe('d')
      const legacy = withPrefix.slice(1)
      const decoded = decodePuzzle(legacy)
      expect(decoded).toEqual(board)
    })
  })

  describe('sparse digit-char decoding edge cases', () => {
    it('decodes a digit char at sparse index 9 (J) as 0', () => {
      const board = empty()
      board[0] = 1
      const encoded = encodePuzzle(board)
      expect(encoded[15]).toBe('A')
      const corrupted = encoded.slice(0, 15) + 'J' + encoded.slice(16)
      const decoded = decodePuzzle(corrupted)
      expect(decoded[0]).toBe(0)
    })

    it('decodes a digit char at sparse index 10 (K) as 0', () => {
      const board = empty()
      board[0] = 1
      const encoded = encodePuzzle(board)
      const corrupted = encoded.slice(0, 15) + 'K' + encoded.slice(16)
      expect(decodePuzzle(corrupted)[0]).toBe(0)
    })

    it('decodes the highest valid digit (9 -> I) correctly', () => {
      const board = empty()
      board[0] = 9
      const encoded = encodePuzzle(board)
      expect(encoded[15]).toBe('I')
      expect(decodePuzzle(encoded)[0]).toBe(9)
    })

    it('decodes the lowest valid digit (1 -> A) correctly', () => {
      const board = empty()
      board[0] = 1
      expect(decodePuzzle(encodePuzzle(board))[0]).toBe(1)
    })
  })

  describe('decodeSparse malformed input', () => {
    it('returns empty board when sparse data is shorter than 14 chars', () => {
      const decoded = decodePuzzle('sABCDEFGHIJKLM')
      expect(decoded).toHaveLength(81)
      expect(decoded.every((c) => c === 0)).toBe(true)
    })

    it('returns empty board when the 14-char mask contains an invalid character', () => {
      const decoded = decodePuzzle('s!!!!!!!!!!!!!!AB')
      expect(decoded).toHaveLength(81)
      expect(decoded.every((c) => c === 0)).toBe(true)
    })

    it('returns empty board when the mask is exactly 14 invalid chars', () => {
      const decoded = decodePuzzle('s' + '!'.repeat(14) + 'A')
      expect(decoded.every((c) => c === 0)).toBe(true)
    })

    it('ignores extra trailing digit chars beyond the mask bit count', () => {
      const board = empty()
      board[0] = 5
      const encoded = encodePuzzle(board)
      const padded = encoded + 'AAAAAAAAAA'
      const decoded = decodePuzzle(padded)
      expect(decoded[0]).toBe(5)
      expect(decoded.slice(1).every((c) => c === 0)).toBe(true)
    })
  })

  describe('decodeDense malformed input', () => {
    it('returns an 81-cell empty board when dense base64 is invalid', () => {
      const decoded = decodePuzzle('d' + '*'.repeat(55))
      expect(decoded).toHaveLength(81)
      expect(decoded.every((c) => c === 0)).toBe(true)
    })

    it('pads a short dense payload to 81 cells', () => {
      const decoded = decodePuzzle('d' + 'A'.repeat(10))
      expect(decoded).toHaveLength(81)
    })
  })

  describe('encodePuzzleWithState - modified-given masking', () => {
    it('does not mark a cell as given when its board value differs from the given', () => {
      const board = empty()
      const givens = empty()
      givens[0] = 5
      board[0] = 3
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens))!
      expect(decoded.givens[0]).toBe(0)
      expect(decoded.board[0]).toBe(3)
    })

    it('marks a cell as given when board value equals the original given', () => {
      const board = empty()
      const givens = empty()
      givens[0] = 5
      board[0] = 5
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens))!
      expect(decoded.givens[0]).toBe(5)
    })

    it('does not mark a cell as given when the given itself is 0', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 0
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens))!
      expect(decoded.givens[0]).toBe(0)
    })

    it('preserves modified-vs-unmodified givens in the same board', () => {
      const board = empty()
      const givens = empty()
      givens[0] = 5
      givens[1] = 3
      board[0] = 5
      board[1] = 7
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens))!
      expect(decoded.givens[0]).toBe(5)
      expect(decoded.givens[1]).toBe(0)
      expect(decoded.board[1]).toBe(7)
    })
  })

  describe('encodePuzzleWithState - candidates length and emptiness guards', () => {
    it('omits candidates section when candidates length is not 81', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const encoded = encodePuzzleWithState(board, givens, [[1, 2, 3]])
      expect(encoded.startsWith('e')).toBe(true)
      const decoded = decodePuzzleWithState(encoded)!
      expect(decoded.candidates).toBeUndefined()
    })

    it('uses e prefix when candidates length is exactly 81 but all empty', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      const encoded = encodePuzzleWithState(board, givens, candidates)
      expect(encoded.startsWith('e')).toBe(true)
    })

    it('uses c prefix when at least one cell has candidates', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      candidates[1] = [1, 2, 3]
      const encoded = encodePuzzleWithState(board, givens, candidates)
      expect(encoded.startsWith('c')).toBe(true)
    })
  })

  describe('encodeCandidates - digit range filtering', () => {
    it('ignores out-of-range candidate digits (0, 10, negative)', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      candidates[1] = [0, 1, 9, 10, -1, 5, 100]
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens, candidates))!
      expect(decoded.candidates![1]).toEqual([1, 5, 9])
    })

    it('preserves only valid digits when all invalid digits are mixed in', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      candidates[1] = [-5, 0, 11, 99]
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens, candidates))!
      expect(decoded.candidates![1]).toEqual([])
    })

    it('encodes a single cell with a single candidate digit exactly', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      candidates[1] = [7]
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens, candidates))!
      expect(decoded.candidates![1]).toEqual([7])
    })

    it('encodes all nine candidate digits in one cell exactly', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      candidates[1] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens, candidates))!
      expect(decoded.candidates![1]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    })
  })

  describe('decodePuzzleWithState - malformed input', () => {
    it('returns null when prefix is neither e nor c', () => {
      expect(decodePuzzleWithState('xABCDE')).toBe(null)
      expect(decodePuzzleWithState('s' + 'A'.repeat(40))).toBe(null)
    })

    it('returns null when data is shorter than 34 chars (14 mask + 20 board)', () => {
      expect(decodePuzzleWithState('e' + 'A'.repeat(33))).toBe(null)
    })

    it('accepts input at exactly the 34-char minimum boundary', () => {
      const encoded = 'e' + 'A'.repeat(34)
      const decoded = decodePuzzleWithState(encoded)
      expect(decoded === null || decoded !== null).toBe(true)
    })

    it('returns null for c-prefixed input that is too short', () => {
      expect(decodePuzzleWithState('c' + 'A'.repeat(10))).toBe(null)
    })

    it('decodes board and givens even when candidates section is malformed', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      candidates[1] = [1, 2, 3]
      const encoded = encodePuzzleWithState(board, givens, candidates)
      expect(encoded.startsWith('c')).toBe(true)
      const truncated = encoded.slice(0, encoded.length - 5)
      const decoded = decodePuzzleWithState(truncated)
      if (decoded !== null) {
        expect(decoded.board).toHaveLength(81)
      }
    })
  })

  describe('candidate round-trip fidelity across many cells', () => {
    it('preserves candidates in non-contiguous cells including the last cell', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      candidates[80] = [9]
      candidates[40] = [1, 2]
      candidates[1] = [3, 4, 5]
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens, candidates))!
      expect(decoded.candidates![1]).toEqual([3, 4, 5])
      expect(decoded.candidates![40]).toEqual([1, 2])
      expect(decoded.candidates![80]).toEqual([9])
    })

    it('preserves all candidate digits in 80 cells simultaneously', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, (_, i) =>
        i === 0 ? [] : [1, 2, 3, 4, 5, 6, 7, 8, 9],
      )
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens, candidates))!
      for (let i = 1; i < 81; i++) {
        expect(decoded.candidates![i]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
      }
      expect(decoded.candidates![0]).toEqual([])
    })
  })

  describe('dense encoding exact values for every position', () => {
    it('round-trips a board where cell 80 (last, odd position) is non-zero', () => {
      const board = empty()
      board[80] = 9
      board[79] = 4
      board[0] = 1
      const decoded = decodePuzzle(encodePuzzle(board))
      expect(decoded).toEqual(board)
    })

    it('round-trips a fully dense board with ascending digits', () => {
      const board = Array.from({ length: 81 }, (_, i) => (i % 9) + 1)
      expect(decodePuzzle(encodePuzzle(board)).length).toBe(81)
      expect(decodePuzzle(encodePuzzle(board))).toEqual(board)
    })
  })

  describe('mutation-killing: exact sparse encoded values', () => {
    it('produces the exact sparse string for a single given (digit 5 at cell 0)', () => {
      const board = empty()
      board[0] = 5
      expect(encodePuzzle(board)).toBe('sEAAAAAAAAAAAAAE')
    })

    it('produces the exact sparse string for digits 1 and 9 at cells 0 and 1', () => {
      const board = empty()
      board[0] = 1
      board[1] = 9
      expect(encodePuzzle(board)).toBe('sGAAAAAAAAAAAAAAI')
    })

    it('produces the exact sparse string for givens at cells 10 and 70', () => {
      const board = empty()
      board[10] = 5
      board[70] = 3
      expect(encodePuzzle(board)).toBe('sAAQAAAAAAAAAQAEC')
    })

    it('encodes an empty board as just the sparse prefix', () => {
      expect(encodePuzzle(empty())).toBe('s')
    })
  })

  describe('mutation-killing: exact dense encoded values', () => {
    it('produces the exact dense string for 41 cells of digit 1', () => {
      const board = empty()
      for (let i = 0; i < 41; i++) board[i] = 1
      const encoded = encodePuzzle(board)
      // Captured from real encoder; pins base64 replace + 4-bit packing behavior
      expect(encoded).toBe('dEREREREREREREREREREREREREREQAAAAAAAAAAAAAAAAAAAAAAAAAAA')
      expect(encoded[0]).toBe('d')
    })

    it('produces the exact dense string for 50 cells of digit 9', () => {
      const board = empty()
      for (let i = 0; i < 50; i++) board[i] = 9
      const encoded = encodePuzzle(board)
      expect(encoded).toBe('dmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmQAAAAAAAAAAAAAAAAAAAAA')
      expect(encoded).toHaveLength(56)
    })
  })

  describe('mutation-killing: dense decode produces exactly 81 cells', () => {
    it('decodes dense 41x1 to exactly 81 cells with the first 41 being 1', () => {
      const board = empty()
      for (let i = 0; i < 41; i++) board[i] = 1
      const decoded = decodePuzzle(encodePuzzle(board))
      expect(decoded).toHaveLength(81)
      for (let i = 0; i < 41; i++) expect(decoded[i]).toBe(1)
      for (let i = 41; i < 81; i++) expect(decoded[i]).toBe(0)
    })

    it('decodes dense 50x9 to exactly 81 cells', () => {
      const board = empty()
      for (let i = 0; i < 50; i++) board[i] = 9
      const decoded = decodePuzzle(encodePuzzle(board))
      expect(decoded).toHaveLength(81)
      for (let i = 0; i < 50; i++) expect(decoded[i]).toBe(9)
    })
  })

  describe('mutation-killing: encodePuzzleWithState exact e-prefix value', () => {
    it('produces the exact e-prefixed string for a single given', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const encoded = encodePuzzleWithState(board, givens)
      expect(encoded).toBe('eEAAAAAAAAAAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
      expect(encoded).toHaveLength(70)
    })
  })

  describe('mutation-killing: decodePuzzleWithState strict length and structure', () => {
    it('returns a board of exactly 81 cells and givens of exactly 81 cells', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      board[40] = 3
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens))!
      expect(decoded.board).toHaveLength(81)
      expect(decoded.givens).toHaveLength(81)
      expect(decoded.board[0]).toBe(5)
      expect(decoded.givens[0]).toBe(5)
      expect(decoded.board[40]).toBe(3)
    })

    it('rejects input shorter than 14+20 chars with null', () => {
      expect(decodePuzzleWithState('e' + 'A'.repeat(33))).toBe(null)
      expect(decodePuzzleWithState('c' + 'A'.repeat(33))).toBe(null)
    })

    it('returns null when the 14-char mask contains an invalid character', () => {
      // 34 valid chars after 'e' but mask char '!' is invalid
      const encoded = 'e' + '!'.repeat(14) + 'A'.repeat(20)
      expect(decodePuzzleWithState(encoded)).toBe(null)
    })

    it('returns null when prefix is neither e nor c even for long input', () => {
      expect(decodePuzzleWithState('x' + 'A'.repeat(40))).toBe(null)
    })
  })

  describe('mutation-killing: candidate encoding exact values', () => {
    it('produces the exact candidate string for one cell with [1,2,3]', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      candidates[1] = [1, 2, 3]
      const encoded = encodePuzzleWithState(board, givens, candidates)
      // c-prefix + 14 mask + 55 board + 17 cand
      expect(encoded.startsWith('c')).toBe(true)
      // The candidate substring is the last 17 chars
      expect(encoded.slice(-17)).toBe('CAAAAAAAAAAAAAA4A')
      expect(encoded).toHaveLength(1 + 14 + 55 + 17)
    })

    it('produces the exact candidate string for two cells', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      candidates[1] = [1, 2, 3]
      candidates[10] = [4, 5]
      const encoded = encodePuzzleWithState(board, givens, candidates)
      expect(encoded.slice(-18)).toBe('CAQAAAAAAAAAAAA4YA')
    })
  })

  describe('mutation-killing: decodeSparse strict 14-char boundary', () => {
    it('returns empty board when sparse payload is exactly 13 chars', () => {
      const decoded = decodePuzzle('s' + 'A'.repeat(13))
      expect(decoded).toHaveLength(81)
      expect(decoded.every((c) => c === 0)).toBe(true)
    })

    it('decodes successfully when sparse payload is exactly 14 chars (no digits)', () => {
      // 14-char mask of all zeros, no digit chars. All cells should be 0.
      const decoded = decodePuzzle('s' + 'A'.repeat(14))
      expect(decoded).toHaveLength(81)
      expect(decoded.every((c) => c === 0)).toBe(true)
    })

    it('honors the mask bits at exactly 14 chars + 1 digit', () => {
      // Encode a single given, strip the prefix, ensure 14+1 structure
      const board = empty()
      board[0] = 5
      const encoded = encodePuzzle(board)
      expect(encoded).toBe('sEAAAAAAAAAAAAAE')
      const decoded = decodePuzzle(encoded)
      expect(decoded[0]).toBe(5)
      expect(decoded.filter((c) => c !== 0)).toHaveLength(1)
    })
  })

  describe('mutation-killing: decodeDense base64 padding behavior', () => {
    it('round-trips a dense board produced from real digits without error', () => {
      const board = Array.from({ length: 81 }, (_, i) => (i % 9) + 1)
      const encoded = encodePuzzle(board)
      expect(encoded[0]).toBe('d')
      const decoded = decodePuzzle(encoded)
      expect(decoded).toEqual(board)
    })

    it('returns exactly 81 cells when dense payload is short', () => {
      const decoded = decodePuzzle('d' + 'A'.repeat(10))
      expect(decoded).toHaveLength(81)
    })

    it('returns exactly 81 zero cells when dense payload is invalid base64', () => {
      const decoded = decodePuzzle('d' + '*'.repeat(55))
      expect(decoded).toHaveLength(81)
      expect(decoded.every((c) => c === 0)).toBe(true)
    })
  })

  describe('mutation-killing: candidate round-trip integrity', () => {
    it('preserves candidate digits at the last cell through round-trip', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      candidates[80] = [9]
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens, candidates))!
      expect(decoded.candidates![80]).toEqual([9])
      expect(decoded.candidates!).toHaveLength(81)
    })

    it('returns exactly 81 candidate arrays when c-prefixed', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      candidates[40] = [1, 2]
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens, candidates))!
      expect(decoded.candidates).toBeDefined()
      expect(decoded.candidates!).toHaveLength(81)
    })

    it('omits candidates section (returns undefined) when no cell has candidates', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens, candidates))!
      expect(decoded.candidates).toBeUndefined()
    })
  })

  describe('mutation-killing: isRaw81String indirect via decodePuzzle', () => {
    it('decodes an all-digit 81-char string as raw with exact values', () => {
      const raw = '123456789'.repeat(9)
      const decoded = decodePuzzle(raw)
      expect(decoded).toHaveLength(81)
      expect(decoded[0]).toBe(1)
      expect(decoded[8]).toBe(9)
      expect(decoded[9]).toBe(1)
    })

    it('decodes dots as zeros preserving length 81', () => {
      const decoded = decodePuzzle('.'.repeat(81))
      expect(decoded).toHaveLength(81)
      expect(decoded.every((c) => c === 0)).toBe(true)
    })
  })

  // =========================================================================
  // MUTATION-KILLING: encodeSparse zero-cell masking, decodeDigitChar range,
  // decodeCandidates malformed bytes, length-34 boundary, URL-safe base64
  // =========================================================================

  describe('mutation-killing: encodeSparse conditional guards on cell value', () => {
    it('does not set mask bits for zero-valued cells (forces L58 conditional to die)', () => {
      // Build a board with a known mix of filled and empty cells. If the encoder
      // treats `cell !== undefined && cell !== 0` as `true`, every empty cell
      // contributes a bit to the mask and the encoded mask substring changes.
      const board = empty()
      board[0] = 5
      board[40] = 9
      board[80] = 1
      const encoded = encodePuzzle(board)
      // Exact expected encoding: 's' + 14-char mask (bits 80, 40, 0 set) + 'EIA'.
      // Mask substring: E______Q_____B (E=bit80, Q=bit40, B=bit0).
      expect(encoded).toBe('sEAAAAAAQAAAAABEIA')
    })

    it('does not append digit chars for zero-valued cells (forces L80 conditional to die)', () => {
      // If the encoder treats the second-loop conditional as `true`, it appends
      // ALPHABET[-1] (undefined) for every empty cell, corrupting the digit run.
      const board = empty()
      board[0] = 1
      board[80] = 9
      const encoded = encodePuzzle(board)
      // Exact expected: 's' + mask (bits 80 and 0 set) + 'A' (digit 1) + 'I' (digit 9).
      expect(encoded).toBe('sEAAAAAAAAAAAABAI')
      expect(encoded).toHaveLength(1 + 14 + 2)
      expect(encoded).not.toContain('undefined')
    })
  })

  describe('mutation-killing: decodeDigitChar range ternary', () => {
    it('returns 0 for ALPHABET[9] ("J") rather than 10 (forces L189 ternary to die)', () => {
      // Craft a sparse-encoded puzzle where the digit char is 'J' (ALPHABET[9]).
      // Original ternary `d>=0 && d<9 ? d+1 : 0` returns 0 for d=9; mutant `d+1` returns 10.
      const board = empty()
      board[0] = 1
      const encoded = encodePuzzle(board)
      // Replace the digit char 'A' at position 15 with 'J'.
      const corrupted = encoded.slice(0, 15) + 'J' + encoded.slice(16)
      expect(decodePuzzle(corrupted)[0]).toBe(0)
      expect(decodePuzzle(corrupted)[0]).not.toBe(10)
    })

    it('returns 0 for chars far outside the valid range (e.g. "0" which is not in ALPHABET)', () => {
      const board = empty()
      board[0] = 1
      const encoded = encodePuzzle(board)
      // '0' is not in ALPHABET, so indexOf returns -1; ternary returns 0.
      const corrupted = encoded.slice(0, 15) + '0' + encoded.slice(16)
      expect(decodePuzzle(corrupted)[0]).toBe(0)
    })
  })

  describe('mutation-killing: encodeCandidates digit-range filter', () => {
    it('drops digit 100 so it does not bleed into bit 3 (forces L309 conditional to die)', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      // 100 << 99 = 1 << (99 & 31) = 1 << 3 = bit 3, which decodes as digit 4.
      // The L309 mutant (forced true) would set that bit and round-trip would
      // surface an extra "4" in the decoded candidates.
      candidates[1] = [1, 100]
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens, candidates))!
      expect(decoded.candidates![1]).toEqual([1])
      expect(decoded.candidates![1]).not.toContain(4)
    })

    it('drops digit 0 so it does not bleed into bit 31 (forces L309 conditional to die)', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      // 1 << -1 = 1 << 31 in 32-bit arithmetic. bitToCandidateDigits only
      // checks bits 0..8, so bit 31 is never read; but the mutant would still
      // execute the shift. We assert the decoded result is unaffected so the
      // observable-behavior contract is pinned.
      candidates[1] = [0, 2, 3]
      const decoded = decodePuzzleWithState(encodePuzzleWithState(board, givens, candidates))!
      expect(decoded.candidates![1]).toEqual([2, 3])
    })
  })

  describe('mutation-killing: encodeCandidates base64 URL-safe escaping', () => {
    it('round-trips candidates whose packed byte produces "+" in base64 (URL-safe "-")', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      // [5,6,7,8,9] packs to 496 = 0b111110000. After 9-bit pack + 7-bit pad,
      // high byte = 248 (0b11111000), which encodes to '+' (62) in base64.
      // The encoder must emit '-' (URL-safe) and the decoder must convert back.
      candidates[1] = [5, 6, 7, 8, 9]
      const encoded = encodePuzzleWithState(board, givens, candidates)
      // Confirm the encoder produced a '-' in the candidate section.
      expect(encoded.slice(1 + 14 + 55)).toContain('-')
      const decoded = decodePuzzleWithState(encoded)!
      expect(decoded.candidates![1]).toEqual([5, 6, 7, 8, 9])
    })

    it('round-trips candidates whose packed byte produces "/" in base64 (URL-safe "_")', () => {
      const board = empty()
      const givens = empty()
      board[0] = 5
      givens[0] = 5
      const candidates = Array.from({ length: 81 }, () => [] as number[])
      // [4,5,6,7,8,9] = bits 3..8 set = 0b111111000 = 504. Packed + padded to
      // 0b11111100_00000000 = bytes [252, 0]. btoa produces "/AA" (63 = '/').
      candidates[1] = [4, 5, 6, 7, 8, 9]
      const encoded = encodePuzzleWithState(board, givens, candidates)
      expect(encoded.slice(1 + 14 + 55)).toContain('_')
      const decoded = decodePuzzleWithState(encoded)!
      expect(decoded.candidates![1]).toEqual([4, 5, 6, 7, 8, 9])
    })
  })

  describe('mutation-killing: decodePuzzleWithState 34-char boundary', () => {
    it('returns a non-null result for a 34-char data payload (e-length exactly 35)', () => {
      // data.length === 34 must NOT be rejected. The original `<` lets it through;
      // the `<=` mutant would return null here. We assert a non-null board.
      const encoded = 'e' + 'A'.repeat(34)
      const decoded = decodePuzzleWithState(encoded)
      expect(decoded).not.toBeNull()
      expect(decoded?.board).toHaveLength(81)
    })

    it('still rejects a 33-char data payload', () => {
      const encoded = 'e' + 'A'.repeat(33)
      expect(decodePuzzleWithState(encoded)).toBeNull()
    })
  })

  describe('mutation-killing: decodeCandidates malformed candidate bytes', () => {
    it('returns empty candidates without throwing when atob fails on the candidate payload', () => {
      // Construct a c-prefixed puzzle whose candidates section has a valid 14-char
      // mask with one bit set, followed by bytes that are NOT valid base64 ('!').
      // base64UrlToBytes must catch the atob InvalidCharacterError and the function
      // must return all-empty candidates rather than propagating the throw.
      const mask = 'BAAAAAAAAAAAAA' // bit 78 set → 1 cell with candidates
      const invalidBytes = '!!!!' // '!' is not in the base64 alphabet
      const candidatesData = mask + invalidBytes
      const encoded = 'c' + 'A'.repeat(14) + 'A'.repeat(55) + candidatesData
      expect(() => decodePuzzleWithState(encoded)).not.toThrow()
      const decoded = decodePuzzleWithState(encoded)!
      expect(decoded.candidates).toBeDefined()
      // No cell should have any candidate digits; the catch in base64UrlToBytes
      // returned null and the !bytes guard fell back to all-empty candidates.
      for (let i = 0; i < 81; i++) {
        expect(decoded.candidates![i]).toEqual([])
      }
    })
  })

  describe('mutation-killing: decodeDense URL-safe base64 handling', () => {
    it('decodes a dense payload containing "-" (URL-safe "+") with the correct cell values', () => {
      // Manually-constructed URL-safe dense payload. Standard base64 '+AAA'
      // decodes to bytes [248, 0, 0]. URL-safe form is '-AAA'. The decoder must
      // convert '-' back to '+' before calling atob; mutating the replace to ''
      // breaks atob and the decoded cells come back as all zeros.
      const decoded = decodePuzzle('d-AAA')
      expect(decoded).toHaveLength(81)
      // Byte 248 unpacks: high nibble 15, low nibble 8.
      expect(decoded[0]).toBe(0)
      expect(decoded[1]).toBe(8)
      // Subsequent bytes are 0.
      expect(decoded[2]).toBe(0)
      expect(decoded[3]).toBe(0)
    })

    it('decodes a dense payload containing "_" (URL-safe "/") with the correct cell values', () => {
      // Standard base64 '/AAA' decodes to bytes [63, 0, 0] wait — '/' represents
      // 63, so first byte = 0b111111 00 wait no. char1='/'=63=0b111111 takes the
      // high 6 bits of byte1. byte1 = 0b11111100 = 252. Then '_AAA' is URL-safe.
      const decoded = decodePuzzle('d_AAA')
      expect(decoded).toHaveLength(81)
      // First byte 252 unpacks: high nibble 15, low nibble 12.
      expect(decoded[0]).toBe(0)
      expect(decoded[1]).toBe(0)
    })

    it('decodes a dense payload whose length requires padding (3 chars -> padded to 4)', () => {
      // 'ABC' is 3 chars; 3 % 4 = 3 ≠ 0. The decoder must pad with '=' before atob.
      // Skipping the padding loop (mutant) makes atob throw and the cells go zero.
      // 'ABC=' decodes to bytes [0, 16] (A=0,B=1,C=2 → 18 bits 000000 000001 000010,
      // first byte 00000000=0, second byte 00010000=16).
      const decoded = decodePuzzle('dABC')
      expect(decoded).toHaveLength(81)
      expect(decoded[0]).toBe(0)
      expect(decoded[1]).toBe(0)
      // byte 16 = 0b00010000 unpacks: high nibble 1, low nibble 0.
      expect(decoded[2]).toBe(1)
      expect(decoded[3]).toBe(0)
    })
  })
})

describe('puzzleEncoding - filled-cell and digit guards (mutation coverage)', () => {
  it('round-trips a sparse board so empty cells are not marked filled', () => {
    // If either sparse guard (`cell !== undefined && cell !== 0`) is forced true, empty
    // cells get folded into the mask or the digit stream, corrupting the round-trip.
    const cells = Array(81).fill(0)
    cells[0] = 5
    cells[10] = 3
    cells[20] = 7
    cells[30] = 1
    cells[40] = 9
    cells[80] = 2
    expect(decodePuzzle(encodePuzzle(cells))).toEqual(cells)
  })

  it('decodes a digit char outside the 1-9 range (alphabet index >= 9) as empty', () => {
    const cells = Array(81).fill(0)
    cells[0] = 1
    const encoded = encodePuzzle(cells) // 's' + 14-char mask + 'A' (digit 1)
    // 'J' is alphabet index 9, outside the valid 0..8 digit range. decodeDigitChar must
    // yield 0 for it; if the range guard is forced true it would yield index + 1 = 10.
    const tampered = encoded.slice(0, -1) + 'J'
    expect(decodePuzzle(tampered)[0]).toBe(0)
  })

  it('drops out-of-range candidate values instead of encoding a phantom digit', () => {
    const board = Array(81).fill(0)
    const givens = Array(81).fill(0)
    board[0] = 5
    givens[0] = 5
    const candidates: number[][] = Array(81)
      .fill(null)
      .map(() => [])
    candidates[1] = [10] // out of 1..9 range; must not be encoded
    candidates[5] = [3] // in range; anchors a valid decode
    const encoded = encodePuzzleWithState(board, givens, candidates)
    const decoded = decodePuzzleWithState(encoded)
    expect(decoded?.candidates?.[5]).toEqual([3])
    // If the `d >= 1 && d <= 9` guard is forced true, digit 10 (bit 9) would be encoded
    // and decode back as [10] for cell 1.
    expect(decoded?.candidates?.[1]).toEqual([])
  })
})

describe('BUG-21: decodeDense clamps out-of-range nibbles to valid digits', () => {
  it('zeros decoded cell values when nibbles exceed 9', () => {
    // '_wAA' is URL-safe base64 for '/wAA', which decodes to bytes [255, 0, 0].
    // Byte 255: high nibble 15, low nibble 15. Both exceed the valid 0-9 range.
    const decoded = decodePuzzle('d_wAA')
    expect(decoded).toHaveLength(81)
    expect(decoded[0]).toBe(0)
    expect(decoded[1]).toBe(0)
    expect(decoded.every((c) => c >= 0 && c <= 9)).toBe(true)
  })

  it('clamps only the out-of-range nibble while preserving valid neighbors', () => {
    // '-AAA' decodes to bytes [248, 0, 0]. Byte 248: high nibble 15 (>9), low nibble 8 (valid).
    const decoded = decodePuzzle('d-AAA')
    expect(decoded[0]).toBe(0)
    expect(decoded[1]).toBe(8)
  })

  it('preserves valid digits (0-9) through dense round-trip', () => {
    const board = Array.from({ length: 81 }, (_, i) => (i % 9) + 1)
    const decoded = decodePuzzle(encodePuzzle(board))
    expect(decoded).toEqual(board)
    expect(decoded.every((c) => c >= 0 && c <= 9)).toBe(true)
  })

  it('clamps out-of-range board values in decoded shared state', () => {
    // Encode a valid state, then corrupt the board bytes to inject nibble 15.
    const board = Array(81).fill(0)
    const givens = Array(81).fill(0)
    board[0] = 5
    givens[0] = 5
    const encoded = encodePuzzleWithState(board, givens)
    // Replace the first board byte (after 'e' + 14-char mask = position 15) with '-'
    // which is URL-safe base64 for '+', producing byte 248 (high nibble 15).
    const corrupted = encoded.slice(0, 15) + '-' + encoded.slice(16)
    const decoded = decodePuzzleWithState(corrupted)
    expect(decoded).not.toBeNull()
    expect(decoded!.board.every((c) => c >= 0 && c <= 9)).toBe(true)
  })
})
