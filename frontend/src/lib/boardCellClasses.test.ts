import { describe, it, expect } from 'vitest'
import {
  backgroundClass,
  cellHasHighlightedDigit,
  getCellAriaLabel,
  getCellClass,
  isInMultiSelection,
  isPeerOfSelected,
  isHighlightedPrimary,
  isHighlightedSecondary,
  normalBorderClasses,
  textClass,
  type BoardCellContext,
} from './boardCellClasses'
import { addCandidate } from './candidatesUtils'
import { createMockMoveHighlight } from '../test-utils'

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

function baseContext(overrides?: Partial<BoardCellContext>): BoardCellContext {
  return {
    board: emptyBoard(),
    initialBoard: emptyBoard(),
    candidates: new Uint16Array(81),
    selectedCell: null,
    selectedCells: new Set<number>(),
    highlight: null,
    highlightedDigit: null,
    incorrectCells: [],
    focusedCell: null,
    duplicateCells: new Set<number>(),
    ...overrides,
  }
}

function className(ctx: BoardCellContext, idx: number): string {
  return getCellClass(ctx, idx)
}

describe('getCellAriaLabel', () => {
  it('labels an empty cell with its position', () => {
    const label = getCellAriaLabel(baseContext(), IDX(2, 4))
    expect(label).toBe('Row 3, Column 5, empty')
  })

  it('labels a given cell with its value and the given marker', () => {
    const ctx = baseContext({
      board: boardWith([{ row: 0, col: 0, digit: 5 }]),
      initialBoard: boardWith([{ row: 0, col: 0, digit: 5 }]),
    })
    expect(getCellAriaLabel(ctx, IDX(0, 0))).toBe('Row 1, Column 1, value 5, given')
  })

  it('labels an entered cell with its value and no given marker', () => {
    const ctx = baseContext({ board: boardWith([{ row: 8, col: 8, digit: 7 }]) })
    expect(getCellAriaLabel(ctx, IDX(8, 8))).toBe('Row 9, Column 9, value 7')
  })
})

describe('isHighlightedPrimary', () => {
  it('returns false without a highlight', () => {
    expect(isHighlightedPrimary(baseContext(), 0, 0)).toBe(false)
  })

  it('returns false when the cell is not in the primary highlights', () => {
    const ctx = baseContext({
      highlight: createMockMoveHighlight({ highlights: { primary: [{ row: 0, col: 1 }] } }),
    })
    expect(isHighlightedPrimary(ctx, 0, 0)).toBe(false)
  })

  it('always highlights a filled primary cell', () => {
    const ctx = baseContext({
      board: boardWith([{ row: 0, col: 0, digit: 3 }]),
      highlight: createMockMoveHighlight({
        digit: 9,
        highlights: { primary: [{ row: 0, col: 0 }] },
      }),
    })
    expect(isHighlightedPrimary(ctx, 0, 0)).toBe(true)
  })

  it('always highlights a filled primary cell away from the first row and column', () => {
    const ctx = baseContext({
      board: boardWith([{ row: 4, col: 4, digit: 3 }]),
      highlight: createMockMoveHighlight({
        digit: 9,
        highlights: { primary: [{ row: 4, col: 4 }] },
      }),
    })
    expect(isHighlightedPrimary(ctx, 4, 4)).toBe(true)
  })

  it('keeps the highlight when the move carries no digit field at all', () => {
    const ctx = baseContext({
      highlight: createMockMoveHighlight({
        digit: undefined,
        highlights: { primary: [{ row: 0, col: 0 }] },
      }),
    })
    expect(isHighlightedPrimary(ctx, 0, 0)).toBe(true)
  })

  it('keeps the highlight on an empty primary cell when the move has no digit', () => {
    const ctx = baseContext({
      highlight: createMockMoveHighlight({
        digit: 0,
        highlights: { primary: [{ row: 0, col: 0 }] },
      }),
    })
    expect(isHighlightedPrimary(ctx, 0, 0)).toBe(true)
  })

  it('keeps the highlight on an empty primary cell for a user move with a digit', () => {
    const ctx = baseContext({
      highlight: createMockMoveHighlight({
        digit: 4,
        isUserMove: true,
        highlights: { primary: [{ row: 0, col: 0 }] },
      }),
    })
    expect(isHighlightedPrimary(ctx, 0, 0)).toBe(true)
  })

  it('keeps the highlight on an empty primary cell still holding the digit as a candidate', () => {
    const ctx = baseContext({
      candidates: candidatesWith([{ row: 0, col: 0, digits: [4] }]),
      highlight: createMockMoveHighlight({
        digit: 4,
        highlights: { primary: [{ row: 0, col: 0 }] },
      }),
    })
    expect(isHighlightedPrimary(ctx, 0, 0)).toBe(true)
  })

  it('drops the highlight from an empty primary cell that lost the digit candidate', () => {
    const firstRow = baseContext({
      highlight: createMockMoveHighlight({
        digit: 4,
        highlights: { primary: [{ row: 0, col: 0 }] },
      }),
    })
    expect(isHighlightedPrimary(firstRow, 0, 0)).toBe(false)
    const midGrid = baseContext({
      highlight: createMockMoveHighlight({
        digit: 4,
        highlights: { primary: [{ row: 4, col: 4 }] },
      }),
    })
    expect(isHighlightedPrimary(midGrid, 4, 4)).toBe(false)
  })
})

describe('isHighlightedSecondary', () => {
  it('returns false without a highlight', () => {
    expect(isHighlightedSecondary(baseContext(), 0, 0)).toBe(false)
  })

  it('highlights an explicit secondary cell', () => {
    const ctx = baseContext({
      highlight: createMockMoveHighlight({
        digit: 0,
        isUserMove: false,
        highlights: { primary: [{ row: 0, col: 2 }], secondary: [{ row: 0, col: 0 }] },
      }),
    })
    expect(isHighlightedSecondary(ctx, 0, 0)).toBe(true)
  })

  it('does not highlight cells that only share a row or a column with an explicit secondary', () => {
    const ctx = baseContext({
      highlight: createMockMoveHighlight({
        digit: 0,
        isUserMove: false,
        highlights: { primary: [{ row: 0, col: 2 }], secondary: [{ row: 0, col: 0 }] },
      }),
    })
    expect(isHighlightedSecondary(ctx, 1, 0)).toBe(false)
    expect(isHighlightedSecondary(ctx, 0, 1)).toBe(false)
  })

  it('keeps an explicit secondary highlight when the move carries no digit field', () => {
    const ctx = baseContext({
      highlight: createMockMoveHighlight({
        digit: undefined,
        highlights: { primary: [{ row: 0, col: 2 }], secondary: [{ row: 0, col: 0 }] },
      }),
    })
    expect(isHighlightedSecondary(ctx, 0, 0)).toBe(true)
  })

  it('keeps an explicit secondary highlight on an empty cell only while it holds the candidate', () => {
    const withCandidate = baseContext({
      candidates: candidatesWith([{ row: 0, col: 0, digits: [5] }]),
      highlight: createMockMoveHighlight(),
    })
    const withoutCandidate = baseContext({
      highlight: createMockMoveHighlight(),
    })
    expect(isHighlightedSecondary(withCandidate, 0, 0)).toBe(true)
    expect(isHighlightedSecondary(withoutCandidate, 0, 0)).toBe(false)
  })

  it('keeps an explicit secondary highlight for a user move regardless of candidate state', () => {
    const ctx = baseContext({
      highlight: createMockMoveHighlight({ isUserMove: true }),
    })
    expect(isHighlightedSecondary(ctx, 0, 0)).toBe(true)
  })

  it('highlights an elimination cell holding the eliminated digit as a candidate', () => {
    const ctx = baseContext({
      candidates: candidatesWith([{ row: 1, col: 1, digits: [4] }]),
      highlight: createMockMoveHighlight({
        action: 'eliminate',
        digit: 0,
        targets: [],
        highlights: { primary: [{ row: 0, col: 2 }] },
        eliminations: [{ row: 1, col: 1, digit: 4 }],
      }),
    })
    expect(isHighlightedSecondary(ctx, 1, 1)).toBe(true)
  })

  it('does not highlight an elimination cell that already lost the candidate', () => {
    const ctx = baseContext({
      highlight: createMockMoveHighlight({
        action: 'eliminate',
        digit: 0,
        targets: [],
        highlights: { primary: [{ row: 0, col: 2 }] },
        eliminations: [{ row: 1, col: 1, digit: 4 }],
      }),
    })
    expect(isHighlightedSecondary(ctx, 1, 1)).toBe(false)
  })

  it('evaluates the elimination for the probed cell, not an earlier elimination', () => {
    const ctx = baseContext({
      candidates: candidatesWith([{ row: 2, col: 2, digits: [5] }]),
      highlight: createMockMoveHighlight({
        action: 'eliminate',
        digit: 0,
        targets: [],
        highlights: { primary: [{ row: 0, col: 2 }] },
        eliminations: [
          { row: 2, col: 0, digit: 4 },
          { row: 2, col: 2, digit: 5 },
        ],
      }),
    })
    expect(isHighlightedSecondary(ctx, 2, 2)).toBe(true)
  })

  it('does not highlight a cell that only shares a column with an elimination', () => {
    const ctx = baseContext({
      candidates: candidatesWith([{ row: 4, col: 1, digits: [4] }]),
      highlight: createMockMoveHighlight({
        action: 'eliminate',
        digit: 0,
        targets: [],
        highlights: { primary: [{ row: 0, col: 2 }] },
        eliminations: [{ row: 1, col: 1, digit: 4 }],
      }),
    })
    expect(isHighlightedSecondary(ctx, 4, 1)).toBe(false)
  })

  it('highlights a target cell that is not primary in regular hint mode', () => {
    const ctx = baseContext({
      highlight: createMockMoveHighlight({
        digit: 0,
        highlights: { primary: [{ row: 4, col: 4 }] },
        targets: [{ row: 0, col: 0 }],
      }),
    })
    expect(isHighlightedSecondary(ctx, 0, 0)).toBe(true)
  })

  it('matches targets on the full cell coordinate, not row or column alone', () => {
    const rowShared = baseContext({
      highlight: createMockMoveHighlight({
        digit: 0,
        highlights: { primary: [{ row: 4, col: 4 }] },
        targets: [{ row: 0, col: 2 }],
      }),
    })
    const colShared = baseContext({
      highlight: createMockMoveHighlight({
        digit: 0,
        highlights: { primary: [{ row: 4, col: 4 }] },
        targets: [{ row: 2, col: 0 }],
      }),
    })
    const multiTarget = baseContext({
      highlight: createMockMoveHighlight({
        digit: 0,
        highlights: { primary: [{ row: 4, col: 4 }] },
        targets: [
          { row: 0, col: 0 },
          { row: 2, col: 2 },
        ],
      }),
    })
    const noTargets = baseContext({
      highlight: createMockMoveHighlight({
        digit: 0,
        highlights: { primary: [{ row: 4, col: 4 }] },
        targets: undefined,
      }),
    })
    expect(isHighlightedSecondary(rowShared, 2, 2)).toBe(false)
    expect(isHighlightedSecondary(colShared, 2, 2)).toBe(false)
    expect(isHighlightedSecondary(multiTarget, 2, 2)).toBe(true)
    expect(isHighlightedSecondary(noTargets, 0, 0)).toBe(false)
  })

  it('does not highlight a target cell that is already primary', () => {
    const ctx = baseContext({
      highlight: createMockMoveHighlight({
        digit: 0,
        highlights: { primary: [{ row: 0, col: 0 }] },
        targets: [{ row: 0, col: 0 }],
      }),
    })
    expect(isHighlightedSecondary(ctx, 0, 0)).toBe(false)
  })

  it('highlights elimination and target cells in technique hint mode', () => {
    const ctx = baseContext({
      candidates: candidatesWith([{ row: 1, col: 1, digits: [4] }]),
      highlight: createMockMoveHighlight({
        action: 'eliminate',
        digit: 0,
        showAnswer: false,
        targets: [{ row: 2, col: 2 }],
        highlights: { primary: [{ row: 0, col: 2 }] },
        eliminations: [{ row: 1, col: 1, digit: 4 }],
      }),
    })
    expect(isHighlightedSecondary(ctx, 1, 1)).toBe(true)
    expect(isHighlightedSecondary(ctx, 2, 2)).toBe(true)
  })
})

describe('cellHasHighlightedDigit', () => {
  it('returns false when no digit is highlighted', () => {
    expect(cellHasHighlightedDigit(baseContext(), IDX(0, 0))).toBe(false)
  })

  it('returns true when the cell is filled with the highlighted digit', () => {
    const ctx = baseContext({
      board: boardWith([{ row: 0, col: 0, digit: 6 }]),
      highlightedDigit: 6,
    })
    expect(cellHasHighlightedDigit(ctx, IDX(0, 0))).toBe(true)
  })

  it('returns true when the cell holds the highlighted digit as a candidate', () => {
    const ctx = baseContext({
      candidates: candidatesWith([{ row: 0, col: 0, digits: [6] }]),
      highlightedDigit: 6,
    })
    expect(cellHasHighlightedDigit(ctx, IDX(0, 0))).toBe(true)
  })

  it('returns false for a cell without the digit filled or noted', () => {
    const ctx = baseContext({
      board: boardWith([{ row: 0, col: 0, digit: 2 }]),
      highlightedDigit: 6,
    })
    expect(cellHasHighlightedDigit(ctx, IDX(0, 0))).toBe(false)
  })

  it('treats a 0 highlighted digit as no digit rather than matching empty cells', () => {
    // 0 is the no-specific-digit sentinel move highlights carry; an empty
    // cell holds 0, so forwarding the sentinel would light up every empty
    // cell as a digit match.
    const ctx = baseContext({ highlightedDigit: 0 })
    expect(cellHasHighlightedDigit(ctx, IDX(0, 0))).toBe(false)
  })
})

describe('isPeerOfSelected', () => {
  it('returns false when nothing is selected', () => {
    expect(isPeerOfSelected(baseContext(), IDX(0, 0))).toBe(false)
  })

  it('returns false for the selected cell itself', () => {
    const ctx = baseContext({ selectedCell: IDX(0, 0) })
    expect(isPeerOfSelected(ctx, IDX(0, 0))).toBe(false)
  })

  it('returns true for a cell in the same row', () => {
    const ctx = baseContext({ selectedCell: IDX(0, 0) })
    expect(isPeerOfSelected(ctx, IDX(0, 8))).toBe(true)
  })

  it('returns true for a cell in the same column', () => {
    const ctx = baseContext({ selectedCell: IDX(0, 0) })
    expect(isPeerOfSelected(ctx, IDX(8, 0))).toBe(true)
  })

  it('returns true for a cell in the same box outside row and column', () => {
    const ctx = baseContext({ selectedCell: IDX(0, 0) })
    expect(isPeerOfSelected(ctx, IDX(1, 1))).toBe(true)
  })

  it('returns false for a cell outside row, column, and box', () => {
    const ctx = baseContext({ selectedCell: IDX(0, 0) })
    expect(isPeerOfSelected(ctx, IDX(4, 4))).toBe(false)
  })

  it('requires both box coordinates to match, not just one', () => {
    const ctx = baseContext({ selectedCell: IDX(0, 0) })
    expect(isPeerOfSelected(ctx, IDX(4, 1))).toBe(false)
    expect(isPeerOfSelected(ctx, IDX(1, 4))).toBe(false)
  })

  it('recognises same-box peers when the selected cell is not in the first box', () => {
    const ctx = baseContext({ selectedCell: IDX(1, 1) })
    expect(isPeerOfSelected(ctx, IDX(0, 0))).toBe(true)
  })

  it('treats the multi-selection, not the primary cell, as the peer source', () => {
    const ctx = baseContext({
      selectedCell: IDX(4, 4),
      selectedCells: new Set([IDX(0, 0)]),
    })
    expect(isPeerOfSelected(ctx, IDX(0, 8))).toBe(true)
    expect(isPeerOfSelected(ctx, IDX(8, 8))).toBe(false)
  })
})

describe('isInMultiSelection', () => {
  it('returns true only for members of a selection with more than one cell', () => {
    const ctx = baseContext({
      selectedCells: new Set([IDX(0, 0), IDX(0, 1)]),
    })
    expect(isInMultiSelection(ctx, IDX(0, 0))).toBe(true)
    expect(isInMultiSelection(ctx, IDX(0, 2))).toBe(false)
  })

  it('returns false for a single-cell selection', () => {
    const ctx = baseContext({ selectedCells: new Set([IDX(0, 0)]) })
    expect(isInMultiSelection(ctx, IDX(0, 0))).toBe(false)
  })
})

describe('normalBorderClasses', () => {
  it('uses thick borders on 3x3 boundary columns and rows', () => {
    expect(normalBorderClasses(0, 2)).toEqual([
      'border-r-2 border-r-board-border',
      'border-b border-b-board-border-light',
    ])
    expect(normalBorderClasses(5, 5)).toEqual([
      'border-r-2 border-r-board-border',
      'border-b-2 border-b-board-border',
    ])
  })

  it('uses light borders away from 3x3 boundaries', () => {
    expect(normalBorderClasses(0, 0)).toEqual([
      'border-r border-r-board-border-light',
      'border-b border-b-board-border-light',
    ])
  })

  it('omits the right border on the last column and the bottom border on the last row', () => {
    expect(normalBorderClasses(0, 8)).toEqual(['border-b border-b-board-border-light'])
    expect(normalBorderClasses(8, 0)).toEqual(['border-r border-r-board-border-light'])
    expect(normalBorderClasses(8, 8)).toEqual([])
  })
})

describe('background precedence chain', () => {
  it('places error states above the primary highlight', () => {
    const ctx = baseContext({
      board: boardWith([{ row: 0, col: 0, digit: 5 }]),
      highlight: createMockMoveHighlight({ highlights: { primary: [{ row: 0, col: 0 }] } }),
      incorrectCells: [IDX(0, 0)],
    })
    const classes = className(ctx, IDX(0, 0))
    expect(classes).toContain('bg-error-bg')
    expect(classes).not.toContain('bg-cell-primary')
  })

  it('places duplicates in the error state above the primary highlight', () => {
    const ctx = baseContext({
      board: boardWith([{ row: 0, col: 0, digit: 5 }]),
      duplicateCells: new Set([IDX(0, 0)]),
      highlight: createMockMoveHighlight({ highlights: { primary: [{ row: 0, col: 0 }] } }),
    })
    expect(className(ctx, IDX(0, 0))).toContain('bg-error-bg')
  })

  it('places the primary highlight above an explicit secondary highlight', () => {
    const ctx = baseContext({
      board: boardWith([{ row: 0, col: 0, digit: 5 }]),
      highlight: createMockMoveHighlight({
        highlights: {
          primary: [{ row: 0, col: 0 }],
          secondary: [{ row: 0, col: 0 }],
        },
      }),
    })
    const classes = className(ctx, IDX(0, 0))
    expect(classes).toContain('bg-cell-primary')
    expect(classes).not.toContain('bg-cell-secondary')
  })

  it('colors an explicit secondary cell bg-cell-secondary', () => {
    const ctx = baseContext({
      highlight: createMockMoveHighlight({ isUserMove: true }),
    })
    expect(className(ctx, IDX(0, 0))).toContain('bg-cell-secondary')
  })

  it('colors a technique-hint secondary cell bg-cell-primary when it is not explicit', () => {
    const ctx = baseContext({
      candidates: candidatesWith([{ row: 1, col: 1, digits: [4] }]),
      highlight: createMockMoveHighlight({
        action: 'eliminate',
        digit: 0,
        showAnswer: false,
        targets: [],
        highlights: { primary: [{ row: 0, col: 2 }] },
        eliminations: [{ row: 1, col: 1, digit: 4 }],
      }),
    })
    expect(className(ctx, IDX(1, 1))).toContain('bg-cell-primary')
  })

  it('colors a technique-hint explicit secondary cell bg-cell-secondary', () => {
    const ctx = baseContext({
      highlight: createMockMoveHighlight({
        digit: 0,
        showAnswer: false,
        isUserMove: false,
        highlights: { primary: [{ row: 0, col: 2 }], secondary: [{ row: 0, col: 0 }] },
      }),
    })
    expect(className(ctx, IDX(0, 0))).toContain('bg-cell-secondary')
  })

  it('places selection above the highlighted-digit match', () => {
    const ctx = baseContext({
      board: boardWith([{ row: 0, col: 0, digit: 6 }]),
      highlightedDigit: 6,
      selectedCell: IDX(0, 0),
    })
    const classes = className(ctx, IDX(0, 0))
    expect(classes).toContain('bg-cell-selected')
    expect(classes).not.toContain('bg-accent-light')
  })

  it('colors multi-selected cells with the selection background', () => {
    const ctx = baseContext({
      selectedCells: new Set([IDX(0, 0), IDX(0, 1)]),
    })
    expect(className(ctx, IDX(0, 0))).toContain('bg-cell-selected')
  })

  it('places the digit match above the peer highlight', () => {
    const ctx = baseContext({
      candidates: candidatesWith([{ row: 0, col: 8, digits: [6] }]),
      highlightedDigit: 6,
      selectedCell: IDX(0, 0),
    })
    const classes = className(ctx, IDX(0, 8))
    expect(classes).toContain('bg-accent-light')
    expect(classes).not.toContain('bg-cell-peer')
  })

  it('places the peer highlight above the given background', () => {
    const ctx = baseContext({
      initialBoard: boardWith([{ row: 0, col: 8, digit: 3 }]),
      selectedCell: IDX(0, 0),
    })
    const classes = className(ctx, IDX(0, 8))
    expect(classes).toContain('bg-cell-peer')
    expect(classes).not.toContain('bg-cell-given')
  })

  it('colors a plain given cell bg-cell-given and a plain empty cell bg-cell-bg', () => {
    const givenCtx = baseContext({
      initialBoard: boardWith([{ row: 0, col: 0, digit: 3 }]),
    })
    expect(className(givenCtx, IDX(0, 0))).toContain('bg-cell-given')
    expect(className(baseContext(), IDX(0, 0))).toContain('bg-cell-bg')
  })
})

interface CellStateFlags {
  isIncorrect?: boolean
  isDuplicate?: boolean
  isPrimary?: boolean
  isSecondary?: boolean
  isSelected?: boolean
  inMultiSel?: boolean
  hasDigitMatch?: boolean
  isPeer?: boolean
  isGiven?: boolean
}

function backgroundClassWith(
  ctx: BoardCellContext,
  row: number,
  col: number,
  flags: CellStateFlags,
): string {
  return backgroundClass(
    ctx,
    row,
    col,
    flags.isIncorrect === true,
    flags.isDuplicate === true,
    flags.isPrimary === true,
    flags.isSecondary === true,
    flags.isSelected === true,
    flags.inMultiSel === true,
    flags.hasDigitMatch === true,
    flags.isPeer === true,
    flags.isGiven === true,
  )
}

describe('backgroundClass', () => {
  it('returns the error background for incorrect or duplicate flags', () => {
    expect(backgroundClassWith(baseContext(), 0, 0, { isIncorrect: true })).toBe('bg-error-bg')
    expect(backgroundClassWith(baseContext(), 0, 0, { isDuplicate: true })).toBe('bg-error-bg')
  })

  it('returns the entered background for a non-given plain cell', () => {
    expect(backgroundClassWith(baseContext(), 0, 0, {})).toBe('bg-cell-bg')
  })

  it('colors a secondary-flagged cell bg-cell-secondary when there is no highlight', () => {
    expect(backgroundClassWith(baseContext(), 0, 0, { isSecondary: true })).toBe(
      'bg-cell-secondary',
    )
  })

  it('colors technique-hint cells by explicit-secondary membership', () => {
    const explicit = baseContext({
      highlight: createMockMoveHighlight({
        digit: 0,
        showAnswer: false,
        isUserMove: false,
        highlights: { primary: [{ row: 0, col: 2 }], secondary: [{ row: 0, col: 0 }] },
      }),
    })
    const implicit = baseContext({
      candidates: candidatesWith([
        { row: 0, col: 1, digits: [4] },
        { row: 1, col: 0, digits: [4] },
      ]),
      highlight: createMockMoveHighlight({
        action: 'eliminate',
        digit: 0,
        showAnswer: false,
        targets: [],
        highlights: { primary: [{ row: 0, col: 2 }], secondary: [{ row: 0, col: 0 }] },
        eliminations: [
          { row: 0, col: 1, digit: 4 },
          { row: 1, col: 0, digit: 4 },
        ],
      }),
    })
    expect(backgroundClassWith(explicit, 0, 0, { isSecondary: true })).toBe('bg-cell-secondary')
    expect(backgroundClassWith(implicit, 0, 1, { isSecondary: true })).toBe('bg-cell-primary')
    expect(backgroundClassWith(implicit, 1, 0, { isSecondary: true })).toBe('bg-cell-primary')
  })
})

describe('text precedence chain', () => {
  it('places error text above the highlight text', () => {
    const ctx = baseContext({
      board: boardWith([{ row: 0, col: 0, digit: 5 }]),
      highlight: createMockMoveHighlight({ highlights: { primary: [{ row: 0, col: 0 }] } }),
      incorrectCells: [IDX(0, 0)],
    })
    const classes = className(ctx, IDX(0, 0))
    expect(classes).toContain('text-error-text')
    expect(classes).not.toContain('text-cell-text-on-highlight')
  })

  it('places highlight text above the given text', () => {
    const ctx = baseContext({
      board: boardWith([{ row: 0, col: 0, digit: 5 }]),
      initialBoard: boardWith([{ row: 0, col: 0, digit: 5 }]),
      highlight: createMockMoveHighlight({ highlights: { primary: [{ row: 0, col: 0 }] } }),
    })
    const classes = className(ctx, IDX(0, 0))
    expect(classes).toContain('text-cell-text-on-highlight')
    expect(classes).not.toContain('text-cell-text-given')
  })

  it('uses the highlight text for secondary cells too', () => {
    const ctx = baseContext({ highlight: createMockMoveHighlight({ isUserMove: true }) })
    expect(className(ctx, IDX(0, 0))).toContain('text-cell-text-on-highlight')
  })

  it('uses given text for givens and entered text otherwise', () => {
    const givenCtx = baseContext({
      initialBoard: boardWith([{ row: 0, col: 0, digit: 3 }]),
    })
    expect(className(givenCtx, IDX(0, 0))).toContain('text-cell-text-given')
    expect(className(baseContext(), IDX(0, 0))).toContain('text-cell-text-entered')
  })
})

describe('textClass', () => {
  it('returns the error text for incorrect or duplicate flags', () => {
    expect(textClass(true, false, false, false, false)).toBe('text-error-text')
    expect(textClass(false, true, false, false, false)).toBe('text-error-text')
  })

  it('returns the highlight text when primary or secondary', () => {
    expect(textClass(false, false, true, false, false)).toBe('text-cell-text-on-highlight')
    expect(textClass(false, false, false, true, false)).toBe('text-cell-text-on-highlight')
  })

  it('returns given and entered text otherwise', () => {
    expect(textClass(false, false, false, false, true)).toBe('text-cell-text-given')
    expect(textClass(false, false, false, false, false)).toBe('text-cell-text-entered')
  })
})

describe('multi-selection edge suppression', () => {
  it('drops the shared edge between horizontally adjacent selected cells', () => {
    const ctx = baseContext({
      selectedCells: new Set([IDX(0, 0), IDX(0, 1)]),
    })
    const left = className(ctx, IDX(0, 0))
    const right = className(ctx, IDX(0, 1))
    expect(left).toContain('multi-selected')
    expect(left).not.toContain('border-r-2 border-r-accent')
    expect(left).toContain('border-l-2 border-l-accent')
    expect(left).toContain('border-t-2 border-t-accent')
    expect(left).toContain('border-b-2 border-b-accent')
    expect(right).not.toContain('border-l-2 border-l-accent')
    expect(right).toContain('border-r-2 border-r-accent')
  })

  it('drops the shared edge between vertically adjacent selected cells', () => {
    const ctx = baseContext({
      selectedCells: new Set([IDX(0, 0), IDX(1, 0)]),
    })
    const top = className(ctx, IDX(0, 0))
    const bottom = className(ctx, IDX(1, 0))
    expect(top).not.toContain('border-b-2 border-b-accent')
    expect(top).toContain('border-t-2 border-t-accent')
    expect(bottom).not.toContain('border-t-2 border-t-accent')
    expect(bottom).toContain('border-b-2 border-b-accent')
    expect(bottom).toContain('border-l-2 border-l-accent')
  })

  it('keeps all four edges on non-adjacent selected cells', () => {
    const ctx = baseContext({
      selectedCells: new Set([IDX(0, 0), IDX(4, 4)]),
    })
    for (const idx of [IDX(0, 0), IDX(4, 4)]) {
      const classes = className(ctx, idx)
      expect(classes).toContain('border-r-2 border-r-accent')
      expect(classes).toContain('border-b-2 border-b-accent')
      expect(classes).toContain('border-l-2 border-l-accent')
      expect(classes).toContain('border-t-2 border-t-accent')
    }
  })

  it('does not treat a wrap-around neighbour as adjacent at the grid edge', () => {
    const ctx = baseContext({
      selectedCells: new Set([IDX(1, 0), IDX(0, 8)]),
    })
    expect(className(ctx, IDX(1, 0))).toContain('border-l-2 border-l-accent')
  })

  it('never draws selection borders on the last column or last row', () => {
    const ctx = baseContext({
      selectedCells: new Set([IDX(0, 8), IDX(1, 8)]),
    })
    const rightEdge = className(ctx, IDX(0, 8))
    expect(rightEdge).toContain('multi-selected')
    expect(rightEdge).not.toContain('border-r-2 border-r-accent')
    expect(rightEdge).not.toContain('border-b-2 border-b-accent')
    expect(rightEdge).toContain('border-l-2 border-l-accent')
    expect(rightEdge).toContain('border-t-2 border-t-accent')
    expect(className(ctx, IDX(1, 8))).not.toContain('border-r-2 border-r-accent')
    const bottomRow = baseContext({
      selectedCells: new Set([IDX(8, 0), IDX(8, 1)]),
    })
    expect(className(bottomRow, IDX(8, 0))).not.toContain('border-b-2 border-b-accent')
    expect(className(bottomRow, IDX(8, 1))).not.toContain('border-b-2 border-b-accent')
    expect(className(bottomRow, IDX(8, 1))).toContain('border-r-2 border-r-accent')
  })

  it('replaces the standard grid borders with the selection rectangle', () => {
    const ctx = baseContext({
      selectedCells: new Set([IDX(0, 0), IDX(0, 1)]),
    })
    expect(className(ctx, IDX(0, 0))).not.toContain('border-r-board-border')
    expect(className(ctx, IDX(0, 0))).not.toContain('border-r-board-border-light')
  })

  it('rings only incorrect cells inside a multi-selection', () => {
    const plain = baseContext({
      selectedCells: new Set([IDX(0, 0), IDX(0, 1)]),
    })
    const incorrect = baseContext({
      incorrectCells: [IDX(0, 0)],
      selectedCells: new Set([IDX(0, 0), IDX(0, 1)]),
    })
    expect(className(plain, IDX(0, 0))).not.toContain('ring-2')
    const incorrectClasses = className(incorrect, IDX(0, 0))
    expect(incorrectClasses).toContain('ring-error-text')
    expect(incorrectClasses).not.toContain('ring-accent')
  })

  it('rings the single selected cell with the accent color', () => {
    const ctx = baseContext({ selectedCell: IDX(0, 0) })
    expect(className(ctx, IDX(0, 0))).toContain('ring-accent')
  })
})

describe('getCellClass composition', () => {
  it('always starts from the sudoku-cell base class', () => {
    expect(className(baseContext(), IDX(3, 3))).toContain('sudoku-cell')
  })

  it('adds the focus indicator only to the focused cell', () => {
    const ctx = baseContext({ focusedCell: IDX(2, 2) })
    expect(className(ctx, IDX(2, 2))).toContain('cell-focused')
    expect(className(ctx, IDX(2, 3))).not.toContain('cell-focused')
  })
})
