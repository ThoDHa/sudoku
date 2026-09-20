import { describe, expect, it } from 'vitest'
import { createCandidateMask } from './candidatesUtils'
import { TOTAL_CELLS } from './constants'
import { describeNoteToggle, toggleCellNote } from './noteMove'

const emptyCandidates = (): Uint16Array => new Uint16Array(TOTAL_CELLS)

describe('toggleCellNote', () => {
  it('adds the digit on an empty cell and reports hadCandidate false', () => {
    const candidates = emptyCandidates()
    const result = toggleCellNote(candidates, 40, 5)
    expect(result.hadCandidate).toBe(false)
    expect(result.candidates[40]).toBe(createCandidateMask([5]))
  })

  it('removes the digit and reports hadCandidate true when the cell holds it', () => {
    const candidates = emptyCandidates()
    candidates[40] = createCandidateMask([3, 5, 7])
    const result = toggleCellNote(candidates, 40, 5)
    expect(result.hadCandidate).toBe(true)
    expect(result.candidates[40]).toBe(createCandidateMask([3, 7]))
  })

  it('leaves the other digits intact when adding', () => {
    const candidates = emptyCandidates()
    candidates[40] = createCandidateMask([3, 7])
    const result = toggleCellNote(candidates, 40, 5)
    expect(result.hadCandidate).toBe(false)
    expect(result.candidates[40]).toBe(createCandidateMask([3, 5, 7]))
  })

  it('does not mutate the input array', () => {
    const candidates = emptyCandidates()
    candidates[40] = createCandidateMask([5])
    const snapshot = Uint16Array.from(candidates)
    toggleCellNote(candidates, 40, 5)
    expect(Array.from(candidates)).toEqual(Array.from(snapshot))
  })

  it('toggles the first cell (idx 0) without disturbing its neighbour', () => {
    const candidates = emptyCandidates()
    candidates[1] = createCandidateMask([9])
    const result = toggleCellNote(candidates, 0, 9)
    expect(result.hadCandidate).toBe(false)
    expect(result.candidates[0]).toBe(createCandidateMask([9]))
    expect(result.candidates[1]).toBe(createCandidateMask([9]))
  })

  it('toggles the last cell (idx 80) in place', () => {
    const candidates = emptyCandidates()
    candidates[80] = createCandidateMask([2])
    const result = toggleCellNote(candidates, 80, 2)
    expect(result.hadCandidate).toBe(true)
    expect(result.candidates[80]).toBe(0)
  })
})

describe('describeNoteToggle', () => {
  it('describes an add with the exact "Added note" string', () => {
    expect(describeNoteToggle(false, 5, 4, 4)).toEqual({
      action: 'note',
      explanation: 'Added note 5 to R5C5',
    })
  })

  it('describes a removal with the exact "Removed note" string', () => {
    expect(describeNoteToggle(true, 5, 4, 4)).toEqual({
      action: 'eliminate',
      explanation: 'Removed note 5 from R5C5',
    })
  })

  it('labels the first cell R1C1 (1-based, not 0-based)', () => {
    expect(describeNoteToggle(false, 1, 0, 0).explanation).toBe('Added note 1 to R1C1')
    expect(describeNoteToggle(true, 1, 0, 0).explanation).toBe('Removed note 1 from R1C1')
  })

  it('labels the last cell R9C9', () => {
    expect(describeNoteToggle(false, 9, 8, 8).explanation).toBe('Added note 9 to R9C9')
  })
})
