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
      const candidates = new Uint16Array([
        0b0000000000,
        0b0000000110,
        0b1111111110,
      ])

      const arrays = candidatesToArrays(candidates)
      expect(arrays).toEqual([
        [],
        [1, 2],
        [1, 2, 3, 4, 5, 6, 7, 8, 9]
      ])
    })

    it('converts arrays to candidates', () => {
      const arrays = [
        [],
        [1, 2],
        [1, 2, 3, 4, 5, 6, 7, 8, 9]
      ]

      const candidates = arraysToCandidates(arrays)
      expect(candidates[0]).toBe(0b0000000000)
      expect(candidates[1]).toBe(0b0000000110)
      expect(candidates[2]).toBe(0b1111111110)
    })

    it('roundtrips arrays to candidates and back', () => {
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
    it('converts sets to masks', () => {
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

    it('converts masks to sets', () => {
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

    it('roundtrips sets to masks and back', () => {
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
