import { describe, it, expect } from 'vitest'
import type { MoveHighlight } from '../hooks/useHighlightState'
import {
  collectHintedItems,
  hasTrackableItems,
  isEliminationPending,
  isPlacementPerformed,
  countPendingHintedItems,
  resolvePersistentHighlight,
} from './persistentHighlight'
import { createMockMoveHighlight } from '../test-utils'
import { addCandidate } from './candidatesUtils'

const IDX = (row: number, col: number): number => row * 9 + col

function emptyBoard(): number[] {
  return Array<number>(81).fill(0)
}

function boardWith(cells: { row: number; col: number; digit: number }[]): number[] {
  const board = emptyBoard()
  for (const { row, col, digit } of cells) {
    board[IDX(row, col)] = digit
  }
  return board
}

function candidatesWith(notes: { row: number; col: number; digits: number[] }[]): Uint16Array {
  const candidates = new Uint16Array(81)
  for (const { row, col, digits } of notes) {
    let mask = candidates[IDX(row, col)] || 0
    for (const digit of digits) {
      mask = addCandidate(mask, digit)
    }
    candidates[IDX(row, col)] = mask
  }
  return candidates
}

function eliminationMove(overrides?: Partial<MoveHighlight>): MoveHighlight {
  return createMockMoveHighlight({
    action: 'eliminate',
    digit: 0,
    targets: [],
    highlights: { primary: [{ row: 0, col: 0 }] },
    eliminations: [
      { row: 1, col: 1, digit: 4 },
      { row: 2, col: 1, digit: 4 },
    ],
    ...overrides,
  })
}

describe('collectHintedItems', () => {
  it('collects eliminations as elimination items', () => {
    const move = eliminationMove()

    expect(collectHintedItems(move)).toEqual([
      { kind: 'elimination', row: 1, col: 1, digit: 4 },
      { kind: 'elimination', row: 2, col: 1, digit: 4 },
    ])
  })

  it('collects targets as placements for assign moves with a concrete digit', () => {
    const move = createMockMoveHighlight({
      action: 'assign',
      digit: 5,
      targets: [{ row: 0, col: 2 }],
      eliminations: [{ row: 3, col: 3, digit: 5 }],
    })

    expect(collectHintedItems(move)).toEqual([
      { kind: 'elimination', row: 3, col: 3, digit: 5 },
      { kind: 'placement', row: 0, col: 2, digit: 5 },
    ])
  })

  it('collects targets as placements for place moves with a concrete digit', () => {
    const move = createMockMoveHighlight({
      action: 'place',
      digit: 7,
      targets: [{ row: 4, col: 4 }],
    })

    expect(collectHintedItems(move)).toEqual([{ kind: 'placement', row: 4, col: 4, digit: 7 }])
  })

  it('collects targets as note additions for candidate moves (fill-candidate hint)', () => {
    const move = createMockMoveHighlight({
      action: 'candidate',
      digit: 6,
      targets: [{ row: 5, col: 5 }],
    })

    expect(collectHintedItems(move)).toEqual([{ kind: 'candidate', row: 5, col: 5, digit: 6 }])
  })

  it('ignores targets when the move digit is 0 (multi-digit technique)', () => {
    const move = eliminationMove({ targets: [{ row: 1, col: 1 }] })

    expect(collectHintedItems(move)).toEqual([
      { kind: 'elimination', row: 1, col: 1, digit: 4 },
      { kind: 'elimination', row: 2, col: 1, digit: 4 },
    ])
  })

  it('returns no items for unmodeled actions even with a digit and targets', () => {
    const stalled = createMockMoveHighlight({
      action: 'stalled',
      digit: 5,
      targets: [{ row: 1, col: 1 }],
    })
    const fixError = createMockMoveHighlight({
      action: 'fix-error',
      digit: 5,
      targets: [{ row: 1, col: 1 }],
    })
    const fixCandidate = createMockMoveHighlight({
      action: 'fix-candidate',
      digit: 5,
      targets: [{ row: 1, col: 1 }],
    })

    expect(collectHintedItems(stalled)).toEqual([])
    expect(collectHintedItems(fixError)).toEqual([])
    expect(collectHintedItems(fixCandidate)).toEqual([])
  })

  it('returns no items for a move without eliminations and non-placement actions', () => {
    const move = createMockMoveHighlight({ action: 'eliminate', digit: 3, eliminations: undefined })

    expect(collectHintedItems(move)).toEqual([])
  })
})

describe('hasTrackableItems', () => {
  it('is true for placement, elimination, and note-addition hints', () => {
    expect(hasTrackableItems(createMockMoveHighlight({ action: 'assign', digit: 5 }))).toBe(true)
    expect(hasTrackableItems(eliminationMove())).toBe(true)
    expect(
      hasTrackableItems(
        createMockMoveHighlight({ action: 'candidate', digit: 3, targets: [{ row: 0, col: 0 }] }),
      ),
    ).toBe(true)
  })

  it('is false for unmodeled hint classes so they keep the transient lifetime', () => {
    expect(
      hasTrackableItems(
        createMockMoveHighlight({ action: 'stalled', digit: 2, targets: [{ row: 0, col: 0 }] }),
      ),
    ).toBe(false)
    expect(hasTrackableItems(createMockMoveHighlight({ action: 'candidate', digit: 0 }))).toBe(
      false,
    )
  })
})

describe('isEliminationPending', () => {
  const item = { kind: 'elimination', row: 1, col: 1, digit: 4 } as const

  it('is pending while the empty cell still carries the candidate note', () => {
    expect(
      isEliminationPending(
        item,
        emptyBoard(),
        candidatesWith([{ row: 1, col: 1, digits: [4, 5] }]),
      ),
    ).toBe(true)
  })

  it('resolves when the note was removed explicitly', () => {
    expect(
      isEliminationPending(item, emptyBoard(), candidatesWith([{ row: 1, col: 1, digits: [5] }])),
    ).toBe(false)
  })

  it('is mooted when the cell was filled with any digit (the hinted one included)', () => {
    const filled = boardWith([{ row: 1, col: 1, digit: 4 }])
    const notes = candidatesWith([{ row: 1, col: 1, digits: [4] }])

    expect(isEliminationPending(item, filled, notes)).toBe(false)
    expect(isEliminationPending(item, boardWith([{ row: 1, col: 1, digit: 5 }]), notes)).toBe(false)
  })
})

describe('isPlacementPerformed', () => {
  it('is performed once the target cell holds the hinted digit', () => {
    expect(isPlacementPerformed(0, 2, 5, boardWith([{ row: 0, col: 2, digit: 5 }]))).toBe(true)
  })

  it('stays pending while the target cell is empty', () => {
    expect(isPlacementPerformed(0, 2, 5, emptyBoard())).toBe(false)
  })

  it('stays pending when the target cell holds a wrong digit', () => {
    expect(isPlacementPerformed(0, 2, 5, boardWith([{ row: 0, col: 2, digit: 3 }]))).toBe(false)
  })
})

describe('note-addition items (candidate action)', () => {
  const move = createMockMoveHighlight({
    action: 'candidate',
    digit: 6,
    targets: [{ row: 5, col: 5 }],
  })

  it('stays pending while the cell is empty and lacks the note', () => {
    expect(countPendingHintedItems(move, emptyBoard(), new Uint16Array(81))).toBe(1)
  })

  it('is performed once the note is present', () => {
    const candidates = candidatesWith([{ row: 5, col: 5, digits: [6, 7] }])

    expect(countPendingHintedItems(move, emptyBoard(), candidates)).toBe(0)
  })

  it('is mooted when the cell gets filled instead', () => {
    const board = boardWith([{ row: 5, col: 5, digit: 6 }])

    expect(countPendingHintedItems(move, board, new Uint16Array(81))).toBe(0)
  })
})

describe('countPendingHintedItems', () => {
  it('counts the mix of pending eliminations and unperformed placements', () => {
    const move = createMockMoveHighlight({
      action: 'assign',
      digit: 5,
      targets: [{ row: 0, col: 2 }],
      eliminations: [
        { row: 1, col: 1, digit: 4 },
        { row: 2, col: 1, digit: 4 },
      ],
    })
    // [1,1] keeps note 4 (pending), [2,1] holds digit 5 (elimination mooted),
    // target [0,2] holds 5 (performed).
    const board = boardWith([
      { row: 2, col: 1, digit: 5 },
      { row: 0, col: 2, digit: 5 },
    ])
    const candidates = candidatesWith([{ row: 1, col: 1, digits: [4, 5] }])

    expect(countPendingHintedItems(move, board, candidates)).toBe(1)
  })

  it('counts zero when every item is resolved', () => {
    const move = eliminationMove()
    const board = boardWith([
      { row: 1, col: 1, digit: 2 },
      { row: 2, col: 1, digit: 3 },
    ])

    expect(countPendingHintedItems(move, board, new Uint16Array(81))).toBe(0)
  })
})

describe('resolvePersistentHighlight', () => {
  it('drops resolved eliminations and performed placements, keeping pattern highlights', () => {
    const move = createMockMoveHighlight({
      action: 'assign',
      digit: 5,
      targets: [{ row: 0, col: 2 }],
      eliminations: [
        { row: 1, col: 1, digit: 4 },
        { row: 2, col: 1, digit: 4 },
      ],
      highlights: {
        primary: [{ row: 0, col: 0 }],
        secondary: [{ row: 0, col: 1 }],
      },
    })
    // [1,1] keeps note 4; [2,1] filled (mooted); target [0,2] filled (performed).
    const board = boardWith([
      { row: 2, col: 1, digit: 5 },
      { row: 0, col: 2, digit: 5 },
    ])
    const candidates = candidatesWith([{ row: 1, col: 1, digits: [4, 5] }])

    const resolved = resolvePersistentHighlight(move, board, candidates)

    expect(resolved.highlight.eliminations).toEqual([{ row: 1, col: 1, digit: 4 }])
    expect(resolved.highlight.targets).toEqual([])
    expect(resolved.pendingItemCount).toBe(1)
    // Technique pattern cells stay as context while pending items remain.
    expect(resolved.highlight.highlights).toEqual({
      primary: [{ row: 0, col: 0 }],
      secondary: [{ row: 0, col: 1 }],
    })
    // Everything else passes through unchanged.
    expect(resolved.highlight.technique).toBe(move.technique)
    expect(resolved.highlight.explanation).toBe(move.explanation)
    expect(resolved.highlight.showAnswer).toBe(move.showAnswer)
  })

  it('shrinks performed note additions from candidate-move targets', () => {
    const move = createMockMoveHighlight({
      action: 'candidate',
      digit: 6,
      targets: [
        { row: 5, col: 5 },
        { row: 6, col: 5 },
      ],
    })
    // [5,5] got its note; [6,5] still lacks it.
    const candidates = candidatesWith([{ row: 5, col: 5, digits: [6] }])

    const resolved = resolvePersistentHighlight(move, emptyBoard(), candidates)

    expect(resolved.highlight.targets).toEqual([{ row: 6, col: 5 }])
    expect(resolved.pendingItemCount).toBe(1)
  })

  it('keeps all items when nothing has been performed yet', () => {
    const move = eliminationMove()
    const candidates = candidatesWith([
      { row: 1, col: 1, digits: [4] },
      { row: 2, col: 1, digits: [4] },
    ])

    const resolved = resolvePersistentHighlight(move, emptyBoard(), candidates)

    expect(resolved.highlight.eliminations).toEqual(move.eliminations)
    expect(resolved.highlight.targets).toEqual(move.targets)
    expect(resolved.pendingItemCount).toBe(2)
  })

  it('keeps targets untouched for unmodeled-action moves regardless of board state', () => {
    const move = eliminationMove({ targets: [{ row: 1, col: 1 }] })
    const board = boardWith([{ row: 1, col: 1, digit: 4 }])

    const resolved = resolvePersistentHighlight(move, board, new Uint16Array(81))

    // The targets filter only applies to placement/note-addition actions; the
    // elimination itself is mooted (cell filled) so eliminations shrink to empty.
    expect(resolved.highlight.targets).toEqual([{ row: 1, col: 1 }])
    expect(resolved.highlight.eliminations).toEqual([])
    expect(resolved.pendingItemCount).toBe(0)
  })

  it('tolerates null-ish targets and eliminations', () => {
    const move = createMockMoveHighlight({
      action: 'assign',
      digit: 5,
      targets: undefined,
      eliminations: undefined,
    })

    const resolved = resolvePersistentHighlight(move, emptyBoard(), new Uint16Array(81))

    expect(resolved.highlight.targets).toEqual([])
    expect(resolved.highlight.eliminations).toEqual([])
    // With no targets the move collects no items at all, so useHints would not
    // even mark it persistent; resolve still behaves for the defensive path.
    expect(resolved.pendingItemCount).toBe(0)
    expect(hasTrackableItems(move)).toBe(false)
  })
})
