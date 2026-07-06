import { describe, it, expect } from 'vitest'
import {
  hasCandidate,
  addCandidate,
  removeCandidate,
  toggleCandidate,
  countCandidates,
  getCandidatesArray,
  createCandidateMask,
  isEmpty,
  isFull,
  clearAll,
  setAll,
  intersect,
  union,
  difference,
  candidatesToArrays,
  arraysToCandidates,
  setsToMasks,
  masksToSets,
  maskToString,
  maskToBinary,
  type CandidateMask,
} from './candidatesUtils'

describe('candidatesUtils', () => {
  describe('basic operations', () => {
    it('checks if candidate is present', () => {
      const mask = 0b0000000110

      expect(hasCandidate(mask, 1)).toBe(true)
      expect(hasCandidate(mask, 2)).toBe(true)
      expect(hasCandidate(mask, 3)).toBe(false)
      expect(hasCandidate(mask, 9)).toBe(false)
    })

    it('adds candidates to mask', () => {
      let mask = 0b0000000000

      mask = addCandidate(mask, 1)
      expect(mask).toBe(0b0000000010)

      mask = addCandidate(mask, 5)
      expect(mask).toBe(0b0000100010)

      mask = addCandidate(mask, 1)
      expect(mask).toBe(0b0000100010)
    })

    it('removes candidates from mask', () => {
      let mask = 0b0000001110

      mask = removeCandidate(mask, 2)
      expect(mask).toBe(0b0000001010)

      mask = removeCandidate(mask, 1)
      expect(mask).toBe(0b0000001000)

      mask = removeCandidate(mask, 5)
      expect(mask).toBe(0b0000001000)
    })

    it('toggles candidates add and remove', () => {
      let mask = 0b0000000010

      mask = toggleCandidate(mask, 2)
      expect(mask).toBe(0b0000000110)

      mask = toggleCandidate(mask, 1)
      expect(mask).toBe(0b0000000100)

      mask = toggleCandidate(mask, 2)
      expect(mask).toBe(0b0000000000)
    })

    it('counts candidates correctly', () => {
      expect(countCandidates(0b0000000000)).toBe(0)
      expect(countCandidates(0b0000000010)).toBe(1)
      expect(countCandidates(0b0000000110)).toBe(2)
      expect(countCandidates(0b1111111110)).toBe(9)
    })

    it('gets candidates as array', () => {
      expect(getCandidatesArray(0b0000000000)).toEqual([])
      expect(getCandidatesArray(0b0000000010)).toEqual([1])
      expect(getCandidatesArray(0b0000000110)).toEqual([1, 2])
      expect(getCandidatesArray(0b0000001010)).toEqual([1, 3])
      expect(getCandidatesArray(0b1111111110)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    })

    it('creates mask from array', () => {
      expect(createCandidateMask([])).toBe(0b0000000000)
      expect(createCandidateMask([1])).toBe(0b0000000010)
      expect(createCandidateMask([1, 2])).toBe(0b0000000110)
      expect(createCandidateMask([1, 3, 5])).toBe(0b0000101010)
      expect(createCandidateMask([9, 8, 7, 6, 5, 4, 3, 2, 1])).toBe(0b1111111110)

      expect(createCandidateMask([0, 1, 10, 2, -1])).toBe(0b0000000110)
    })
  })

  describe('utility functions', () => {
    it('checks if mask is empty', () => {
      expect(isEmpty(0b0000000000)).toBe(true)
      expect(isEmpty(0b0000000010)).toBe(false)
    })

    it('checks if mask is full', () => {
      expect(isFull(0b1111111110)).toBe(true)
      expect(isFull(0b1111111100)).toBe(false)
      expect(isFull(0b0111111110)).toBe(false)
      expect(isFull(0b0000000000)).toBe(false)
    })

    it('clears all candidates', () => {
      expect(clearAll()).toBe(0b0000000000)
    })

    it('sets all candidates', () => {
      expect(setAll()).toBe(0b1111111110)
    })
  })

  describe('set operations', () => {
    it('intersects masks', () => {
      const mask1 = 0b0000001110
      const mask2 = 0b0000000110

      expect(intersect(mask1, mask2)).toBe(0b0000000110)

      const mask3 = 0b0000111000
      expect(intersect(mask1, mask3)).toBe(0b0000001000)

      const mask4 = 0b1110000000
      expect(intersect(mask1, mask4)).toBe(0b0000000000)
    })

    it('unions masks', () => {
      const mask1 = 0b0000000110
      const mask2 = 0b0000001000

      expect(union(mask1, mask2)).toBe(0b0000001110)

      const mask3 = 0b1110000000
      expect(union(mask1, mask3)).toBe(0b1110000110)
    })

    it('computes difference of masks', () => {
      const mask1 = 0b0000001110
      const mask2 = 0b0000000110

      expect(difference(mask1, mask2)).toBe(0b0000001000)

      const mask3 = 0b0000111110
      expect(difference(mask3, mask1)).toBe(0b0000110000)

      expect(difference(mask2, mask1)).toBe(0b0000000000)
    })
  })

  describe('serialization', () => {
    it('converts candidates to arrays', () => {
      const candidates = new Uint16Array([0b0000000000, 0b0000000110, 0b1111111110])

      const arrays = candidatesToArrays(candidates)
      expect(arrays).toEqual([[], [1, 2], [1, 2, 3, 4, 5, 6, 7, 8, 9]])
    })

    it('converts arrays to candidates', () => {
      const arrays = [[], [1, 2], [1, 2, 3, 4, 5, 6, 7, 8, 9]]

      const candidates = arraysToCandidates(arrays)
      expect(candidates[0]).toBe(0b0000000000)
      expect(candidates[1]).toBe(0b0000000110)
      expect(candidates[2]).toBe(0b1111111110)
    })

    it('roundtrips arrays to candidates and back', () => {
      const originalArrays = [[], [1], [1, 2, 3], [5, 7, 9], [1, 2, 3, 4, 5, 6, 7, 8, 9]]

      const candidates = arraysToCandidates(originalArrays)
      const roundtripArrays = candidatesToArrays(candidates)

      expect(roundtripArrays).toEqual(originalArrays)
    })
  })

  describe('Set conversion', () => {
    it('converts sets to masks', () => {
      const sets = [
        new Set<number>([]),
        new Set<number>([1, 2]),
        new Set<number>([1, 2, 3, 4, 5, 6, 7, 8, 9]),
      ]

      const masks = setsToMasks(sets)
      expect(masks[0]).toBe(0b0000000000)
      expect(masks[1]).toBe(0b0000000110)
      expect(masks[2]).toBe(0b1111111110)
    })

    it('converts masks to sets', () => {
      const masks = new Uint16Array([0b0000000000, 0b0000000110, 0b1111111110])

      const sets = masksToSets(masks)
      expect(sets[0]).toEqual(new Set([]))
      expect(sets[1]).toEqual(new Set([1, 2]))
      expect(sets[2]).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]))
    })

    it('roundtrips sets to masks and back', () => {
      const originalSets = [
        new Set<number>([]),
        new Set<number>([1]),
        new Set<number>([1, 3, 5]),
        new Set<number>([2, 4, 6, 8]),
        new Set<number>([1, 2, 3, 4, 5, 6, 7, 8, 9]),
      ]

      const masks = setsToMasks(originalSets)
      const roundtripSets = masksToSets(masks)

      expect(roundtripSets).toEqual(originalSets)
    })
  })

  describe('debugging utilities', () => {
    it('formats mask as string', () => {
      expect(maskToString(0b0000000000)).toBe('∅')
      expect(maskToString(0b0000000010)).toBe('{1}')
      expect(maskToString(0b0000000110)).toBe('{1, 2}')
      expect(maskToString(0b0000101010)).toBe('{1, 3, 5}')
    })

    it('formats mask as binary', () => {
      expect(maskToBinary(0b0000000000)).toBe('0b0000000000')
      expect(maskToBinary(0b0000000010)).toBe('0b0000000010')
      expect(maskToBinary(0b1111111110)).toBe('0b1111111110')
    })
  })

  describe('edge cases', () => {
    it('handles boundary digits correctly', () => {
      expect(createCandidateMask([0])).toBe(0b0000000000)

      expect(createCandidateMask([10])).toBe(0b0000000000)

      expect(createCandidateMask([1, 9])).toBe(0b1000000010)
    })

    it('handles large numbers gracefully', () => {
      const mask = 0b1111111110

      expect(hasCandidate(mask, 0)).toBe(false)
      expect(hasCandidate(mask, 10)).toBe(false)
      expect(hasCandidate(mask, -1)).toBe(false)
      expect(hasCandidate(mask, 100)).toBe(false)
    })

    it('maintains bit 0 as always clear', () => {
      const mask = setAll()
      expect(mask & 1).toBe(0)

      for (let d = 1; d <= 9; d++) {
        expect(hasCandidate(mask, d)).toBe(true)
      }
    })
  })
})

const FULL_MASK = setAll()

describe('candidatesUtils - mutation-killing guard tests', () => {
  describe('addCandidate out-of-range digit guard', () => {
    it('returns the mask unchanged for digit 0', () => {
      const mask = 0b0000001010
      expect(addCandidate(mask, 0)).toBe(mask)
    })

    it('returns the mask unchanged for digit 10', () => {
      const mask = 0b0000001010
      expect(addCandidate(mask, 10)).toBe(mask)
    })

    it('returns the mask unchanged for negative digits', () => {
      const mask = 0b0000001010
      expect(addCandidate(mask, -1)).toBe(mask)
      expect(addCandidate(mask, -5)).toBe(mask)
    })

    it('adds boundary digit 1 (lowest valid) exactly', () => {
      expect(addCandidate(0, 1)).toBe(0b0000000010)
    })

    it('adds boundary digit 9 (highest valid) exactly', () => {
      expect(addCandidate(0, 9)).toBe(0b1000000000)
    })

    it('is idempotent when adding an already-present digit', () => {
      const mask = addCandidate(0, 5)
      expect(addCandidate(mask, 5)).toBe(mask)
    })
  })

  describe('removeCandidate out-of-range digit guard', () => {
    it('returns the mask unchanged for digit 0', () => {
      const mask = FULL_MASK
      expect(removeCandidate(mask, 0)).toBe(mask)
    })

    it('returns the mask unchanged for digit 10', () => {
      const mask = FULL_MASK
      expect(removeCandidate(mask, 10)).toBe(mask)
    })

    it('returns the mask unchanged for negative digits', () => {
      const mask = FULL_MASK
      expect(removeCandidate(mask, -1)).toBe(mask)
    })

    it('removes boundary digit 1 exactly', () => {
      expect(removeCandidate(FULL_MASK, 1)).toBe(0b1111111100)
    })

    it('removes boundary digit 9 exactly', () => {
      expect(removeCandidate(FULL_MASK, 9)).toBe(0b0111111110)
    })

    it('is idempotent when removing an absent digit', () => {
      const mask = 0b0000000010 // only digit 1
      expect(removeCandidate(mask, 5)).toBe(mask)
    })

    it('leaves bit 0 untouched for digit 0 when bit 0 is set (guard beats raw clear)', () => {
      // mask 0b111 has bit 0 set; without the range guard removeCandidate would clear it.
      expect(removeCandidate(0b111, 0)).toBe(0b111)
    })

    it('leaves bit 10 untouched for digit 10 when bit 10 is set', () => {
      expect(removeCandidate(0b10000000000, 10)).toBe(0b10000000000)
    })
  })

  describe('toggleCandidate out-of-range digit guard', () => {
    it('returns the mask unchanged for digit 0', () => {
      const mask = 0b0000001010
      expect(toggleCandidate(mask, 0)).toBe(mask)
    })

    it('returns the mask unchanged for digit 10', () => {
      const mask = 0b0000001010
      expect(toggleCandidate(mask, 10)).toBe(mask)
    })

    it('returns the mask unchanged for negative digits', () => {
      const mask = 0b0000001010
      expect(toggleCandidate(mask, -3)).toBe(mask)
    })

    it('toggles boundary digit 1 on', () => {
      expect(toggleCandidate(0, 1)).toBe(0b0000000010)
    })

    it('toggles boundary digit 9 on', () => {
      expect(toggleCandidate(0, 9)).toBe(0b1000000000)
    })

    it('toggles digit 1 off when present', () => {
      expect(toggleCandidate(0b0000000010, 1)).toBe(0)
    })
  })

  describe('hasCandidate boundary and out-of-range', () => {
    it('returns true for boundary digit 1 when present', () => {
      expect(hasCandidate(0b0000000010, 1)).toBe(true)
    })

    it('returns true for boundary digit 9 when present', () => {
      expect(hasCandidate(0b1000000000, 9)).toBe(true)
    })

    it('returns false for boundary digit 1 when absent', () => {
      expect(hasCandidate(0b0000000000, 1)).toBe(false)
    })

    it('returns false for boundary digit 9 when absent', () => {
      expect(hasCandidate(0b0000000000, 9)).toBe(false)
    })

    it('returns false for digit 0 even when bit 0 is set (guard beats raw bit read)', () => {
      // mask 0b1 has bit 0 set; without the range guard hasCandidate would read it as true.
      expect(hasCandidate(0b1, 0)).toBe(false)
    })

    it('returns false for digit 10 even when bit 10 is set', () => {
      expect(hasCandidate(0b10000000000, 10)).toBe(false)
    })
  })

  describe('bit 0 invariant', () => {
    it('never sets bit 0 when adding any valid digit', () => {
      let mask = 0
      for (let d = 1; d <= 9; d++) mask = addCandidate(mask, d)
      expect(mask & 0b1).toBe(0)
      expect(mask).toBe(FULL_MASK)
    })

    it('never sets bit 0 when toggling any valid digit', () => {
      let mask = 0
      for (let d = 1; d <= 9; d++) mask = toggleCandidate(mask, d)
      expect(mask & 0b1).toBe(0)
    })
  })

  describe('countCandidates exact counts', () => {
    it('returns 0 for the empty mask', () => {
      expect(countCandidates(0)).toBe(0)
    })

    it('returns 9 for the full mask', () => {
      expect(countCandidates(FULL_MASK)).toBe(9)
    })

    it('returns the exact count for a partial mask', () => {
      expect(countCandidates(0b1010101010)).toBe(5)
    })

    it('does not count bit 0', () => {
      expect(countCandidates(0b1)).toBe(0)
      expect(countCandidates(0b1111111111)).toBe(9)
    })
  })

  describe('getCandidatesArray exact contents', () => {
    it('returns an empty array for the empty mask', () => {
      expect(getCandidatesArray(0)).toEqual([])
    })

    it('returns all digits 1-9 in order for the full mask', () => {
      expect(getCandidatesArray(FULL_MASK)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    })

    it('excludes bit 0 from the result', () => {
      expect(getCandidatesArray(0b1)).toEqual([])
    })
  })

  describe('createCandidateMask out-of-range filtering', () => {
    it('filters out 0, 10, and negatives, keeping only valid digits', () => {
      expect(createCandidateMask([0, 1, 10, 2, -1, 9, 100])).toBe(0b1000000110)
    })

    it('returns 0 for an all-invalid array', () => {
      expect(createCandidateMask([0, -1, 10, 100])).toBe(0)
    })

    it('returns 0 for an empty array', () => {
      expect(createCandidateMask([])).toBe(0)
    })
  })

  describe('isFull exact behavior', () => {
    it('returns true only for the exact full mask', () => {
      expect(isFull(FULL_MASK)).toBe(true)
    })

    it('returns false when the highest digit (9) is missing', () => {
      expect(isFull(0b0111111110)).toBe(false)
    })

    it('returns false when the lowest digit (1) is missing', () => {
      expect(isFull(0b1111111100)).toBe(false)
    })

    it('returns false for the empty mask', () => {
      expect(isFull(0)).toBe(false)
    })
  })

  describe('isEmpty and clearAll', () => {
    it('isEmpty returns true only for 0', () => {
      expect(isEmpty(0)).toBe(true)
      expect(isEmpty(0b0000000010)).toBe(false)
    })

    it('clearAll returns exactly 0', () => {
      expect(clearAll()).toBe(0)
    })
  })

  describe('maskToString / maskToBinary exact strings', () => {
    it('formats the empty mask as the empty-set symbol', () => {
      expect(maskToString(0)).toBe('∅')
    })

    it('formats a single-digit mask exactly', () => {
      expect(maskToString(0b0000000010)).toBe('{1}')
    })

    it('formats the full mask exactly', () => {
      expect(maskToString(FULL_MASK)).toBe('{1, 2, 3, 4, 5, 6, 7, 8, 9}')
    })

    it('formats the empty mask binary exactly', () => {
      expect(maskToBinary(0)).toBe('0b0000000000')
    })

    it('formats the full mask binary exactly', () => {
      expect(maskToBinary(FULL_MASK)).toBe('0b1111111110')
    })

    it('always produces a 10-character binary payload', () => {
      expect(maskToBinary(0b1)).toBe('0b0000000001')
      expect(maskToBinary(0b10)).toBe('0b0000000010')
    })
  })
})
