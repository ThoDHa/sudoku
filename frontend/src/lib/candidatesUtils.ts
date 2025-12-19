/**
 * Utilities for managing Sudoku candidates using bitmask representation.
 * 
 * Bit Layout:
 * - Bit 0: unused (always 0)
 * - Bits 1-9: represent digits 1-9
 * 
 * Examples:
 * - 0b0000000010 = digit 1 only
 * - 0b0000001110 = digits {1, 2, 3}
 * - 0b1111111110 = digits {1, 2, 3, 4, 5, 6, 7, 8, 9} (all candidates)
 */

// Type alias for clarity
export type CandidateMask = number

/**
 * Check if a candidate digit is present in the mask
 */
export const hasCandidate = (mask: CandidateMask, digit: number): boolean => {
  if (digit < 1 || digit > 9) return false
  return (mask & (1 << digit)) !== 0
}

/**
 * Add a candidate digit to the mask
 */
export const addCandidate = (mask: CandidateMask, digit: number): CandidateMask => {
  if (digit < 1 || digit > 9) return mask
  return mask | (1 << digit)
}

/**
 * Remove a candidate digit from the mask
 */
export const removeCandidate = (mask: CandidateMask, digit: number): CandidateMask => {
  if (digit < 1 || digit > 9) return mask
  return mask & ~(1 << digit)
}

/**
 * Toggle a candidate digit in the mask
 */
export const toggleCandidate = (mask: CandidateMask, digit: number): CandidateMask => {
  if (digit < 1 || digit > 9) return mask
  return mask ^ (1 << digit)
}

/**
 * Count the number of candidates in the mask
 */
export const countCandidates = (mask: CandidateMask): number => {
  let count = 0
  for (let d = 1; d <= 9; d++) {
    if (mask & (1 << d)) count++
  }
  return count
}

/**
 * Get all candidate digits as an array
 */
export const getCandidatesArray = (mask: CandidateMask): number[] => {
  const candidates: number[] = []
  for (let d = 1; d <= 9; d++) {
    if (mask & (1 << d)) {
      candidates.push(d)
    }
  }
  return candidates
}

/**
 * Create a mask from an array of candidate digits
 */
export const createCandidateMask = (digits: number[]): CandidateMask => {
  let mask = 0
  for (const digit of digits) {
    if (digit >= 1 && digit <= 9) {
      mask |= (1 << digit)
    }
  }
  return mask
}

/**
 * Check if the mask is empty (no candidates)
 */
export const isEmpty = (mask: CandidateMask): boolean => {
  return mask === 0
}

/**
 * Check if the mask contains all possible candidates (1-9)
 */
export const isFull = (mask: CandidateMask): boolean => {
  return mask === 0b1111111110 // All bits 1-9 set
}

/**
 * Clear all candidates (return empty mask)
 */
export const clearAll = (): CandidateMask => {
  return 0
}

/**
 * Set all candidates (1-9)
 */
export const setAll = (): CandidateMask => {
  return 0b1111111110 // Bits 1-9 set, bit 0 clear
}

/**
 * Get the intersection of two candidate masks (candidates present in both)
 */
export const intersect = (mask1: CandidateMask, mask2: CandidateMask): CandidateMask => {
  return mask1 & mask2
}

/**
 * Get the union of two candidate masks (candidates present in either)
 */
export const union = (mask1: CandidateMask, mask2: CandidateMask): CandidateMask => {
  return mask1 | mask2
}

/**
 * Get the difference of two candidate masks (candidates in mask1 but not in mask2)
 */
export const difference = (mask1: CandidateMask, mask2: CandidateMask): CandidateMask => {
  return mask1 & ~mask2
}

// =============================================================================
// SERIALIZATION UTILITIES (for localStorage compatibility)
// =============================================================================

/**
 * Convert Uint16Array of candidate masks to number[][] for JSON serialization
 */
export const candidatesToArrays = (candidates: Uint16Array): number[][] => {
  const result: number[][] = []
  for (let i = 0; i < candidates.length; i++) {
    result.push(getCandidatesArray(candidates[i]))
  }
  return result
}

/**
 * Convert number[][] to Uint16Array of candidate masks
 */
export const arraysToCandidates = (arrays: number[][]): Uint16Array => {
  const result = new Uint16Array(arrays.length)
  for (let i = 0; i < arrays.length; i++) {
    result[i] = createCandidateMask(arrays[i])
  }
  return result
}

// =============================================================================
// CONVERSION UTILITIES (for migration from Set<number>[])
// =============================================================================

/**
 * Convert Set<number>[] to Uint16Array of candidate masks
 */
export const setsToMasks = (sets: Set<number>[]): Uint16Array => {
  const result = new Uint16Array(sets.length)
  for (let i = 0; i < sets.length; i++) {
    result[i] = createCandidateMask(Array.from(sets[i]))
  }
  return result
}

/**
 * Convert Uint16Array of candidate masks to Set<number>[]
 */
export const masksToSets = (masks: Uint16Array): Set<number>[] => {
  const result: Set<number>[] = []
  for (let i = 0; i < masks.length; i++) {
    result.push(new Set(getCandidatesArray(masks[i])))
  }
  return result
}

// =============================================================================
// DEBUGGING UTILITIES
// =============================================================================

/**
 * Convert a candidate mask to a readable string representation
 */
export const maskToString = (mask: CandidateMask): string => {
  if (mask === 0) return '∅' // Empty set
  const candidates = getCandidatesArray(mask)
  return `{${candidates.join(', ')}}`
}

/**
 * Convert a candidate mask to binary string for debugging
 */
export const maskToBinary = (mask: CandidateMask): string => {
  return '0b' + mask.toString(2).padStart(10, '0')
}