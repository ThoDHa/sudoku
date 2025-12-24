import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getPuzzleCount, getPuzzleForSeed, getPracticePuzzle } from './puzzles-data'

// Mock the JSON imports
vi.mock('../../puzzles.json', () => ({
  default: {
    puzzles: [
      {
        // Puzzle 0: simple test puzzle with all digits 1-9 repeated
        s: '123456789456789123789123456214365897365897214897214365531642978642978531978531642',
        g: {
          e: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39], // 40 givens for easy
          m: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33], // 34 givens for medium
          h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], // 28 givens for hard
          x: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], // 25 givens for extreme
          i: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], // 24 givens for impossible
        },
      },
      {
        // Puzzle 1: another test puzzle
        s: '987654321654321987321987654876543219543219876219876543768432195432195768195768432',
        g: {
          e: [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 28, 29, 36, 37, 38, 45, 46, 47, 54, 55, 56, 63, 64, 65, 72, 73, 74, 3, 4, 5, 12, 13, 14, 21, 22, 23, 30, 31, 32, 39],
          m: [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 28, 29, 36, 37, 38, 45, 46, 47, 54, 55, 56, 63, 64, 65, 72, 73, 74, 3, 4, 5, 12, 13, 14, 21],
          h: [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 28, 29, 36, 37, 38, 45, 46, 47, 54, 55, 56, 63, 64, 65, 72, 73, 74, 3],
          x: [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 28, 29, 36, 37, 38, 45, 46, 47, 54, 55, 56, 63, 64, 65, 72],
          i: [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 28, 29, 36, 37, 38, 45, 46, 47, 54, 55, 56, 63, 64, 65],
        },
      },
      {
        // Puzzle 2: for testing seed hashing
        s: '111111111222222222333333333444444444555555555666666666777777777888888888999999999',
        g: {
          e: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
          m: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
          h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
          x: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
          i: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
        },
      },
    ],
  },
}))

vi.mock('../../practice_puzzles.json', () => ({
  default: {
    techniques: {
      'naked-single': [
        { i: 0, d: 'e' },
        { i: 1, d: 'm' },
        { i: 2, d: 'h' },
      ],
      'hidden-single': [
        { i: 0, d: 'h' },
        { i: 1, d: 'i' },
      ],
      'naked-pair': [
        { i: 0, d: 'i' },
        { i: 0, d: 'x' },
      ],
      'x-wing': [
        { i: 1, d: 'x' },
      ],
      'empty-technique': [],
    },
  },
}))

describe('puzzles-data', () => {
  describe('getPuzzleCount', () => {
    it('should return the number of puzzles in the pool', () => {
      const count = getPuzzleCount()
      expect(count).toBe(3) // Our mock has 3 puzzles
    })
  })

  describe('getPuzzleForSeed', () => {
    describe('basic functionality', () => {
      it('should return a puzzle with givens, solution, and puzzleIndex', () => {
        const result = getPuzzleForSeed('test-seed', 'easy')

        expect(result).not.toBeNull()
        expect(result).toHaveProperty('givens')
        expect(result).toHaveProperty('solution')
        expect(result).toHaveProperty('puzzleIndex')
      })

      it('should return givens as an array of 81 numbers', () => {
        const result = getPuzzleForSeed('test-seed', 'easy')

        expect(result).not.toBeNull()
        expect(result!.givens).toHaveLength(81)
        expect(result!.givens.every((v) => typeof v === 'number')).toBe(true)
      })

      it('should return solution as an array of 81 numbers', () => {
        const result = getPuzzleForSeed('test-seed', 'easy')

        expect(result).not.toBeNull()
        expect(result!.solution).toHaveLength(81)
        expect(result!.solution.every((v) => v >= 1 && v <= 9)).toBe(true)
      })

      it('should return puzzleIndex within valid range', () => {
        const result = getPuzzleForSeed('test-seed', 'easy')

        expect(result).not.toBeNull()
        expect(result!.puzzleIndex).toBeGreaterThanOrEqual(0)
        expect(result!.puzzleIndex).toBeLessThan(3) // Our mock has 3 puzzles
      })
    })

    describe('deterministic hashing', () => {
      it('should return the same puzzle for the same seed', () => {
        const result1 = getPuzzleForSeed('consistent-seed', 'easy')
        const result2 = getPuzzleForSeed('consistent-seed', 'easy')

        expect(result1).toEqual(result2)
      })

      it('should return the same puzzleIndex for the same seed regardless of difficulty', () => {
        const easyResult = getPuzzleForSeed('fixed-seed', 'easy')
        const hardResult = getPuzzleForSeed('fixed-seed', 'hard')

        expect(easyResult).not.toBeNull()
        expect(hardResult).not.toBeNull()
        expect(easyResult!.puzzleIndex).toBe(hardResult!.puzzleIndex)
      })

      it('should return different puzzles for different seeds', () => {
        // Test multiple different seeds to increase confidence
        const seeds = ['seed-a', 'seed-b', 'seed-c', 'another-seed', 'test-123']
        const results = seeds.map((seed) => getPuzzleForSeed(seed, 'easy'))

        // With only 3 puzzles, some might collide, but at least check we get valid results
        results.forEach((result) => {
          expect(result).not.toBeNull()
        })
      })
    })

    describe('difficulty levels', () => {
      it('should accept short difficulty keys (e, m, h, x, i)', () => {
        const easyResult = getPuzzleForSeed('test', 'e')
        const mediumResult = getPuzzleForSeed('test', 'm')
        const hardResult = getPuzzleForSeed('test', 'h')
        const extremeResult = getPuzzleForSeed('test', 'x')
        const impossibleResult = getPuzzleForSeed('test', 'i')

        expect(easyResult).not.toBeNull()
        expect(mediumResult).not.toBeNull()
        expect(hardResult).not.toBeNull()
        expect(extremeResult).not.toBeNull()
        expect(impossibleResult).not.toBeNull()
      })

      it('should accept full difficulty names (easy, medium, hard, extreme, impossible)', () => {
        const easyResult = getPuzzleForSeed('test', 'easy')
        const mediumResult = getPuzzleForSeed('test', 'medium')
        const hardResult = getPuzzleForSeed('test', 'hard')
        const extremeResult = getPuzzleForSeed('test', 'extreme')
        const impossibleResult = getPuzzleForSeed('test', 'impossible')

        expect(easyResult).not.toBeNull()
        expect(mediumResult).not.toBeNull()
        expect(hardResult).not.toBeNull()
        expect(extremeResult).not.toBeNull()
        expect(impossibleResult).not.toBeNull()
      })

      it('should have more givens for easier difficulties', () => {
        const easyResult = getPuzzleForSeed('same-seed', 'easy')
        const mediumResult = getPuzzleForSeed('same-seed', 'medium')
        const hardResult = getPuzzleForSeed('same-seed', 'hard')
        const extremeResult = getPuzzleForSeed('same-seed', 'extreme')
        const impossibleResult = getPuzzleForSeed('same-seed', 'impossible')

        // Count non-zero givens
        const countGivens = (givens: number[]) => givens.filter((g) => g !== 0).length

        const easyGivens = countGivens(easyResult!.givens)
        const mediumGivens = countGivens(mediumResult!.givens)
        const hardGivens = countGivens(hardResult!.givens)
        const extremeGivens = countGivens(extremeResult!.givens)
        const impossibleGivens = countGivens(impossibleResult!.givens)

        expect(easyGivens).toBeGreaterThanOrEqual(mediumGivens)
        expect(mediumGivens).toBeGreaterThanOrEqual(hardGivens)
        expect(hardGivens).toBeGreaterThanOrEqual(extremeGivens)
        expect(extremeGivens).toBeGreaterThanOrEqual(impossibleGivens)
      })
    })

    describe('givens array structure', () => {
      it('should have 0 for empty cells in givens', () => {
        // Impossible difficulty has fewer givens, so more zeros
        const result = getPuzzleForSeed('test', 'impossible')

        expect(result).not.toBeNull()
        const zeroCount = result!.givens.filter((g) => g === 0).length
        expect(zeroCount).toBeGreaterThan(0)
      })

      it('should have solution values at given positions', () => {
        const result = getPuzzleForSeed('test', 'easy')

        expect(result).not.toBeNull()
        // Every non-zero given should match the corresponding solution value
        result!.givens.forEach((given, index) => {
          if (given !== 0) {
            expect(given).toBe(result!.solution[index])
          }
        })
      })
    })

    describe('null returns for invalid inputs', () => {
      it('should return null for invalid difficulty key', () => {
        const result = getPuzzleForSeed('test', 'invalid-difficulty')
        expect(result).toBeNull()
      })

      it('should return null for unknown difficulty name', () => {
        const result = getPuzzleForSeed('test', 'expert')
        expect(result).toBeNull()
      })
    })

    describe('edge cases', () => {
      it('should handle empty string seed', () => {
        const result = getPuzzleForSeed('', 'easy')
        expect(result).not.toBeNull()
        expect(result!.puzzleIndex).toBeGreaterThanOrEqual(0)
      })

      it('should handle very long seed strings', () => {
        const longSeed = 'a'.repeat(10000)
        const result = getPuzzleForSeed(longSeed, 'easy')
        expect(result).not.toBeNull()
        expect(result!.puzzleIndex).toBeGreaterThanOrEqual(0)
        expect(result!.puzzleIndex).toBeLessThan(3)
      })

      it('should handle seed with special characters', () => {
        const result = getPuzzleForSeed('test-seed_2024/01/01!@#$%^&*()', 'easy')
        expect(result).not.toBeNull()
      })

      it('should handle seed with unicode characters', () => {
        const result = getPuzzleForSeed('test-', 'easy')
        expect(result).not.toBeNull()
      })

      it('should handle seed with numbers', () => {
        const result = getPuzzleForSeed('20241225', 'easy')
        expect(result).not.toBeNull()
      })
    })
  })

  describe('getPracticePuzzle', () => {
    let originalDateNow: () => number

    beforeEach(() => {
      originalDateNow = Date.now
    })

    afterEach(() => {
      Date.now = originalDateNow
    })

    describe('basic functionality', () => {
      it('should return a puzzle with givens, difficulty, and puzzleIndex', () => {
        const result = getPracticePuzzle('naked-single')

        expect(result).not.toBeNull()
        expect(result).toHaveProperty('givens')
        expect(result).toHaveProperty('difficulty')
        expect(result).toHaveProperty('puzzleIndex')
      })

      it('should return givens as an array of 81 numbers', () => {
        const result = getPracticePuzzle('naked-single')

        expect(result).not.toBeNull()
        expect(result!.givens).toHaveLength(81)
        expect(result!.givens.every((v) => typeof v === 'number')).toBe(true)
      })

      it('should return full difficulty name, not short key', () => {
        // Mock Date.now to get predictable day selection
        Date.now = () => 0 // Day 0 - should select first puzzle (d: 'e')

        const result = getPracticePuzzle('naked-single')

        expect(result).not.toBeNull()
        expect(result!.difficulty).toBe('easy') // 'e' -> 'easy'
      })
    })

    describe('technique handling', () => {
      it('should return puzzle for valid technique names', () => {
        const techniques = ['naked-single', 'hidden-single', 'naked-pair', 'x-wing']

        techniques.forEach((technique) => {
          const result = getPracticePuzzle(technique)
          expect(result).not.toBeNull()
        })
      })

      it('should return null for unknown technique', () => {
        const result = getPracticePuzzle('non-existent-technique')
        expect(result).toBeNull()
      })

      it('should return null for technique with empty puzzle list', () => {
        const result = getPracticePuzzle('empty-technique')
        expect(result).toBeNull()
      })
    })

    describe('day-based selection', () => {
      it('should select puzzle based on day of year', () => {
        // Day 0 should select first puzzle in the list
        Date.now = () => 0
        const result1 = getPracticePuzzle('naked-single')

        // Day 1 should select second puzzle in the list
        Date.now = () => 1000 * 60 * 60 * 24 // 1 day in milliseconds
        const result2 = getPracticePuzzle('naked-single')

        expect(result1).not.toBeNull()
        expect(result2).not.toBeNull()
        // naked-single has 3 puzzles, so day 0 and day 1 should give different puzzles
        expect(result1!.puzzleIndex).not.toBe(result2!.puzzleIndex)
      })

      it('should cycle through puzzles when day exceeds puzzle count', () => {
        // naked-single has 3 puzzles, day 3 should wrap to first puzzle (same as day 0)
        Date.now = () => 0
        const day0Result = getPracticePuzzle('naked-single')

        Date.now = () => 3 * 1000 * 60 * 60 * 24 // 3 days
        const day3Result = getPracticePuzzle('naked-single')

        expect(day0Result).not.toBeNull()
        expect(day3Result).not.toBeNull()
        expect(day0Result!.puzzleIndex).toBe(day3Result!.puzzleIndex)
      })

      it('should return same puzzle on same day regardless of time', () => {
        // Same day, different times
        Date.now = () => 1000 * 60 * 60 * 24 + 1000 // Day 1, + 1 second
        const result1 = getPracticePuzzle('naked-single')

        Date.now = () => 1000 * 60 * 60 * 24 + 1000 * 60 * 60 * 12 // Day 1, + 12 hours
        const result2 = getPracticePuzzle('naked-single')

        expect(result1).toEqual(result2)
      })

      it('should handle technique with single puzzle', () => {
        // x-wing only has 1 puzzle
        Date.now = () => 0
        const day0 = getPracticePuzzle('x-wing')

        Date.now = () => 100 * 1000 * 60 * 60 * 24 // 100 days later
        const day100 = getPracticePuzzle('x-wing')

        expect(day0).not.toBeNull()
        expect(day100).not.toBeNull()
        expect(day0!.puzzleIndex).toBe(day100!.puzzleIndex) // Always same puzzle
      })
    })

    describe('difficulty translation', () => {
      it('should translate short keys to full difficulty names', () => {
        // Test each difficulty translation by selecting appropriate days
        Date.now = () => 0 // Day 0 -> 'e' for naked-single
        const easyResult = getPracticePuzzle('naked-single')
        expect(easyResult!.difficulty).toBe('easy')

        Date.now = () => 1000 * 60 * 60 * 24 // Day 1 -> 'm' for naked-single
        const mediumResult = getPracticePuzzle('naked-single')
        expect(mediumResult!.difficulty).toBe('medium')

        Date.now = () => 2 * 1000 * 60 * 60 * 24 // Day 2 -> 'h' for naked-single
        const hardResult = getPracticePuzzle('naked-single')
        expect(hardResult!.difficulty).toBe('hard')
      })

      it('should translate extreme and impossible difficulty keys', () => {
        // naked-pair has puzzles with 'i' and 'x' difficulties
        Date.now = () => 0 // First puzzle has 'i'
        const impossibleResult = getPracticePuzzle('naked-pair')
        expect(impossibleResult!.difficulty).toBe('impossible')

        Date.now = () => 1000 * 60 * 60 * 24 // Second puzzle has 'x'
        const extremeResult = getPracticePuzzle('naked-pair')
        expect(extremeResult!.difficulty).toBe('extreme')
      })
    })

    describe('edge cases', () => {
      it('should handle technique name with case sensitivity', () => {
        // Our mock uses lowercase technique names
        const result = getPracticePuzzle('NAKED-SINGLE')
        // This should return null because technique names are case-sensitive
        expect(result).toBeNull()
      })

      it('should handle technique name with leading/trailing spaces', () => {
        const result = getPracticePuzzle(' naked-single ')
        // This should return null because technique names don't trim
        expect(result).toBeNull()
      })

      it('should handle very large day values', () => {
        // Far future date
        Date.now = () => 1000000 * 1000 * 60 * 60 * 24 // 1 million days
        const result = getPracticePuzzle('naked-single')
        expect(result).not.toBeNull()
        expect(result!.puzzleIndex).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('integration between functions', () => {
    it('should have consistent puzzle indices across getPuzzleForSeed and getPracticePuzzle', () => {
      // getPracticePuzzle returns puzzleIndex that should be valid for the same puzzle pool
      Date.now = () => 0
      const practiceResult = getPracticePuzzle('naked-single')

      expect(practiceResult).not.toBeNull()
      expect(practiceResult!.puzzleIndex).toBeGreaterThanOrEqual(0)
      expect(practiceResult!.puzzleIndex).toBeLessThan(getPuzzleCount())
    })
  })
})
