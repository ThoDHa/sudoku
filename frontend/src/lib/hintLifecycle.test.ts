import { describe, it, expect } from 'vitest'
import { shouldIncrementHintCounter } from './hintLifecycle'

describe('shouldIncrementHintCounter', () => {
  describe('incrementing on a real new move', () => {
    it('returns true for the first hint when none has been shown yet', () => {
      expect(shouldIncrementHintCounter('naked-single-1', null)).toBe(true)
    })

    it('returns true when the move signature differs from the last shown hint', () => {
      expect(shouldIncrementHintCounter('hidden-pair-3', 'naked-single-1')).toBe(true)
    })
  })

  describe('not incrementing on a repeat, error, or empty result', () => {
    it('returns false when the same hint signature is shown again so it is not double-counted', () => {
      const signature = 'naked-single-1'

      expect(shouldIncrementHintCounter(signature, signature)).toBe(false)
    })

    it('returns false for a repeated technique hint signature', () => {
      const signature = 'pointing-pair-5'

      expect(shouldIncrementHintCounter(signature, signature)).toBe(false)
    })
  })

  it('treats an empty-string signature as a real value that can be deduplicated', () => {
    expect(shouldIncrementHintCounter('', null)).toBe(true)
    expect(shouldIncrementHintCounter('', '')).toBe(false)
  })
})
