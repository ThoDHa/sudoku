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
  type CandidateMask
} from './candidatesUtils'

describe('candidatesUtils', () => {
  describe('basic operations', () => {
    it('should check if candidate is present', () => {
      const mask = 0b0000000110 // digits {1, 2}
      
      expect(hasCandidate(mask, 1)).toBe(true)
      expect(hasCandidate(mask, 2)).toBe(true)
      expect(hasCandidate(mask, 3)).toBe(false)
      expect(hasCandidate(mask, 9)).toBe(false)
    })

    it('should add candidates', () => {
      let mask = 0b0000000000 // empty
      
      mask = addCandidate(mask, 1)
      expect(mask).toBe(0b0000000010) // digit 1
      
      mask = addCandidate(mask, 5)
      expect(mask).toBe(0b0000100010) // digits {1, 5}
      
      // Adding same candidate should not change mask
      mask = addCandidate(mask, 1)
      expect(mask).toBe(0b0000100010) // still {1, 5}
    })

    it('should remove candidates', () => {
      let mask = 0b0000001110 // digits {1, 2, 3}
      
      mask = removeCandidate(mask, 2)
      expect(mask).toBe(0b0000001010) // digits {1, 3}
      
      mask = removeCandidate(mask, 1)
      expect(mask).toBe(0b0000001000) // digit {3}
      
      // Removing non-existent candidate should not change mask
      mask = removeCandidate(mask, 5)
      expect(mask).toBe(0b0000001000) // still {3}
    })

    it('should toggle candidates', () => {
      let mask = 0b0000000010 // digit {1}
      
      mask = toggleCandidate(mask, 2) // add 2
      expect(mask).toBe(0b0000000110) // digits {1, 2}
      
      mask = toggleCandidate(mask, 1) // remove 1
      expect(mask).toBe(0b0000000100) // digit {2}
      
      mask = toggleCandidate(mask, 2) // remove 2
      expect(mask).toBe(0b0000000000) // empty
    })

    it('should count candidates', () => {
      expect(countCandidates(0b0000000000)).toBe(0) // empty
      expect(countCandidates(0b0000000010)).toBe(1) // {1}
      expect(countCandidates(0b0000000110)).toBe(2) // {1, 2}
      expect(countCandidates(0b1111111110)).toBe(9) // {1, 2, 3, 4, 5, 6, 7, 8, 9}
    })

    it('should get candidates as array', () => {
      expect(getCandidatesArray(0b0000000000)).toEqual([]) // empty
      expect(getCandidatesArray(0b0000000010)).toEqual([1]) // {1}
      expect(getCandidatesArray(0b0000000110)).toEqual([1, 2]) // {1, 2}
      expect(getCandidatesArray(0b0000001010)).toEqual([1, 3]) // {1, 3}
      expect(getCandidatesArray(0b1111111110)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    })

    it('should create mask from array', () => {
      expect(createCandidateMask([])).toBe(0b0000000000) // empty
      expect(createCandidateMask([1])).toBe(0b0000000010) // {1}
      expect(createCandidateMask([1, 2])).toBe(0b0000000110) // {1, 2}
      expect(createCandidateMask([1, 3, 5])).toBe(0b0000101010) // {1, 3, 5}
      expect(createCandidateMask([9, 8, 7, 6, 5, 4, 3, 2, 1])).toBe(0b1111111110)
      
      // Should ignore invalid digits
      expect(createCandidateMask([0, 1, 10, 2, -1])).toBe(0b0000000110) // {1, 2}
    })
  })

  describe('utility functions', () => {
    it('should check if mask is empty', () => {
      expect(isEmpty(0b0000000000)).toBe(true)
      expect(isEmpty(0b0000000010)).toBe(false)
    })

    it('should check if mask is full', () => {
      expect(isFull(0b1111111110)).toBe(true) // all digits 1-9
      expect(isFull(0b1111111100)).toBe(false) // missing digit 1
      expect(isFull(0b0111111110)).toBe(false) // missing digit 9
      expect(isFull(0b0000000000)).toBe(false) // empty
    })

    it('should clear all candidates', () => {
      expect(clearAll()).toBe(0b0000000000)
    })

    it('should set all candidates', () => {
      expect(setAll()).toBe(0b1111111110)
    })
  })

  describe('set operations', () => {
    it('should intersect masks', () => {
      const mask1 = 0b0000001110 // {1, 2, 3}
      const mask2 = 0b0000000110 // {1, 2}
      
      expect(intersect(mask1, mask2)).toBe(0b0000000110) // {1, 2}
      
      const mask3 = 0b0000111000 // {3, 4, 5}
      expect(intersect(mask1, mask3)).toBe(0b0000001000) // {3}
      
      const mask4 = 0b1110000000 // {7, 8, 9}
      expect(intersect(mask1, mask4)).toBe(0b0000000000) // empty
    })

    it('should union masks', () => {
      const mask1 = 0b0000000110 // {1, 2}
      const mask2 = 0b0000001000 // {3}
      
      expect(union(mask1, mask2)).toBe(0b0000001110) // {1, 2, 3}
      
      const mask3 = 0b1110000000 // {7, 8, 9}
      expect(union(mask1, mask3)).toBe(0b1110000110) // {1, 2, 7, 8, 9}
    })

    it('should compute difference of masks', () => {
      const mask1 = 0b0000001110 // {1, 2, 3}
      const mask2 = 0b0000000110 // {1, 2}
      
      expect(difference(mask1, mask2)).toBe(0b0000001000) // {3}
      
      const mask3 = 0b0000111110 // {1, 2, 3, 4, 5}
      expect(difference(mask3, mask1)).toBe(0b0000110000) // {4, 5}
      
      expect(difference(mask2, mask1)).toBe(0b0000000000) // empty
    })
  })

  describe('serialization', () => {
    it('should convert candidates to arrays', () => {
      const candidates = new Uint16Array([
        0b0000000000, // empty
        0b0000000110, // {1, 2}
        0b1111111110, // all digits
      ])
      
      const arrays = candidatesToArrays(candidates)
      expect(arrays).toEqual([
        [],
        [1, 2],
        [1, 2, 3, 4, 5, 6, 7, 8, 9]
      ])
    })

    it('should convert arrays to candidates', () => {
      const arrays = [
        [],
        [1, 2],
        [1, 2, 3, 4, 5, 6, 7, 8, 9]
      ]
      
      const candidates = arraysToCandidates(arrays)
      expect(candidates[0]).toBe(0b0000000000) // empty
      expect(candidates[1]).toBe(0b0000000110) // {1, 2}
      expect(candidates[2]).toBe(0b1111111110) // all digits
    })

    it('should roundtrip arrays to candidates and back', () => {
      const originalArrays = [
        [],
        [1],
        [1, 2, 3],
        [5, 7, 9],
        [1, 2, 3, 4, 5, 6, 7, 8, 9]
      ]
      
      const candidates = arraysToCandidates(originalArrays)
      const roundtripArrays = candidatesToArrays(candidates)
      
      expect(roundtripArrays).toEqual(originalArrays)
    })
  })

  describe('Set conversion', () => {
    it('should convert sets to masks', () => {
      const sets = [
        new Set<number>([]),
        new Set<number>([1, 2]),
        new Set<number>([1, 2, 3, 4, 5, 6, 7, 8, 9])
      ]
      
      const masks = setsToMasks(sets)
      expect(masks[0]).toBe(0b0000000000)
      expect(masks[1]).toBe(0b0000000110)
      expect(masks[2]).toBe(0b1111111110)
    })

    it('should convert masks to sets', () => {
      const masks = new Uint16Array([
        0b0000000000,
        0b0000000110,
        0b1111111110
      ])
      
      const sets = masksToSets(masks)
      expect(sets[0]).toEqual(new Set([]))
      expect(sets[1]).toEqual(new Set([1, 2]))
      expect(sets[2]).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]))
    })

    it('should roundtrip sets to masks and back', () => {
      const originalSets = [
        new Set<number>([]),
        new Set<number>([1]),
        new Set<number>([1, 3, 5]),
        new Set<number>([2, 4, 6, 8]),
        new Set<number>([1, 2, 3, 4, 5, 6, 7, 8, 9])
      ]
      
      const masks = setsToMasks(originalSets)
      const roundtripSets = masksToSets(masks)
      
      expect(roundtripSets).toEqual(originalSets)
    })
  })

  describe('debugging utilities', () => {
    it('should format mask as string', () => {
      expect(maskToString(0b0000000000)).toBe('∅') // empty
      expect(maskToString(0b0000000010)).toBe('{1}')
      expect(maskToString(0b0000000110)).toBe('{1, 2}')
      expect(maskToString(0b0000101010)).toBe('{1, 3, 5}')
    })

    it('should format mask as binary', () => {
      expect(maskToBinary(0b0000000000)).toBe('0b0000000000')
      expect(maskToBinary(0b0000000010)).toBe('0b0000000010')
      expect(maskToBinary(0b1111111110)).toBe('0b1111111110')
    })
  })

  describe('edge cases', () => {
    it('should handle boundary digits correctly', () => {
      // Digit 0 should not be added (invalid)
      expect(createCandidateMask([0])).toBe(0b0000000000)
      
      // Digit 10 should not be added (invalid)
      expect(createCandidateMask([10])).toBe(0b0000000000)
      
      // Digits 1 and 9 should work (boundaries of valid range)
      expect(createCandidateMask([1, 9])).toBe(0b1000000010)
    })

    it('should handle large numbers gracefully', () => {
      const mask = 0b1111111110 // all digits
      
      // Operations with invalid digits should not crash
      expect(hasCandidate(mask, 0)).toBe(false)
      expect(hasCandidate(mask, 10)).toBe(false)
      expect(hasCandidate(mask, -1)).toBe(false)
      expect(hasCandidate(mask, 100)).toBe(false)
    })

    it('should maintain bit 0 as always clear', () => {
      // Ensure bit 0 is never set, even if we try to set it manually
      const mask = setAll()
      expect(mask & 1).toBe(0) // bit 0 should be clear
      
      // Check that all valid bits are set
      for (let d = 1; d <= 9; d++) {
        expect(hasCandidate(mask, d)).toBe(true)
      }
    })
  })
})