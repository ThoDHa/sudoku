import { describe, it, expect } from 'vitest'
import { getHintSignature, getBoardSignature, formatTechniqueName } from './hintSignatures'

describe('hintSignatures', () => {
  describe('getHintSignature', () => {
    it('encodes technique, action, digit, and targets into a single string', () => {
      const signature = getHintSignature({
        technique: 'naked-single',
        action: 'place',
        digit: 5,
        targets: [{ row: 0, col: 1 }],
      })
      expect(signature).toBe('naked-single-place-5-[{"row":0,"col":1}]')
    })

    it('distinguishes moves that differ only by digit', () => {
      const base = { technique: 'hidden-single', action: 'assign', targets: [] }
      expect(getHintSignature({ ...base, digit: 3 })).not.toBe(
        getHintSignature({ ...base, digit: 4 }),
      )
    })

    it('distinguishes moves that differ only by their target list', () => {
      const a = getHintSignature({
        technique: 'pointing-pair',
        action: 'eliminate',
        digit: 2,
        targets: [{ row: 0, col: 0 }],
      })
      const b = getHintSignature({
        technique: 'pointing-pair',
        action: 'eliminate',
        digit: 2,
        targets: [
          { row: 0, col: 0 },
          { row: 1, col: 1 },
        ],
      })
      expect(a).not.toBe(b)
    })

    it('treats an empty-string technique as part of the signature rather than ignoring it', () => {
      const signature = getHintSignature({
        technique: '',
        action: 'assign',
        digit: 1,
        targets: [],
      })
      expect(signature).toBe('-assign-1-[]')
    })
  })

  describe('getBoardSignature', () => {
    it('joins board cells and candidate bitmask bytes', () => {
      const board = [1, 2, 3]
      const candidates = new Uint16Array([4, 8])
      expect(getBoardSignature(board, candidates)).toBe('1,2,3-4,8')
    })

    it('changes when a board cell changes but candidates stay the same', () => {
      const candidates = new Uint16Array([1])
      const a = getBoardSignature([0], candidates)
      const b = getBoardSignature([9], candidates)
      expect(a).not.toBe(b)
    })

    it('changes when candidates change but the board stays the same', () => {
      const board = [1, 2]
      const a = getBoardSignature(board, new Uint16Array([1, 2]))
      const b = getBoardSignature(board, new Uint16Array([1, 3]))
      expect(a).not.toBe(b)
    })

    it('stays stable across calls with identical inputs', () => {
      const board = [5, 0, 7]
      const candidates = new Uint16Array([0, 16, 32])
      expect(getBoardSignature(board, candidates)).toBe(getBoardSignature(board, candidates))
    })
  })

  describe('formatTechniqueName', () => {
    it('converts a hyphenated slug to title case', () => {
      expect(formatTechniqueName('naked-single')).toBe('Naked Single')
    })

    it('converts an underscored slug to title case', () => {
      expect(formatTechniqueName('hidden_single')).toBe('Hidden Single')
    })

    it('returns an empty string unchanged', () => {
      expect(formatTechniqueName('')).toBe('')
    })

    it('capitalizes every word in a multi-word slug', () => {
      expect(formatTechniqueName('pointing-pair-in-row')).toBe('Pointing Pair In Row')
    })
  })
})
