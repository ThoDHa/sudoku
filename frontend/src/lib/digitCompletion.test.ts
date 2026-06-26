import { describe, it, expect } from 'vitest'
import { isDigitComplete, DIGIT_COMPLETION_TARGET } from './digitCompletion'

describe('isDigitComplete', () => {
  describe('digit with all nine instances placed', () => {
    it('returns true when the digit count equals the completion target', () => {
      const digitCounts = [9, 0, 0, 0, 0, 0, 0, 0, 0]

      expect(isDigitComplete(1, digitCounts)).toBe(true)
    })

    it('returns true for a middle digit that has reached nine', () => {
      const digitCounts = [0, 0, 0, 0, 9, 0, 0, 0, 0]

      expect(isDigitComplete(5, digitCounts)).toBe(true)
    })
  })

  describe('digit with fewer than nine instances placed', () => {
    it('returns false when the count is one short of complete', () => {
      const digitCounts = [8, 0, 0, 0, 0, 0, 0, 0, 0]

      expect(isDigitComplete(1, digitCounts)).toBe(false)
    })

    it('returns false when the digit has not been placed at all', () => {
      const digitCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0]

      expect(isDigitComplete(7, digitCounts)).toBe(false)
    })
  })

  describe('missing or malformed counts', () => {
    it('returns false when digitCounts is undefined so blocking is skipped, not crashed', () => {
      expect(isDigitComplete(1, undefined)).toBe(false)
    })

    it('returns false when digitCounts is null', () => {
      expect(isDigitComplete(1, null)).toBe(false)
    })

    it('returns false for an out-of-range digit rather than reading a wrong index', () => {
      const digitCounts = [9, 9, 9, 9, 9, 9, 9, 9, 9]

      expect(isDigitComplete(0, digitCounts)).toBe(false)
      expect(isDigitComplete(10, digitCounts)).toBe(false)
    })
  })

  it('exposes the completion target as nine so the magic number stays named', () => {
    expect(DIGIT_COMPLETION_TARGET).toBe(9)
  })
})
