import { describe, expect, it } from 'vitest'
import {
  formatCell,
  formatCells,
  moveDisplayNumber,
  originalMoveIndex,
  parseAutoFillCellCount,
  pluralSuffix,
} from './historyMoveFormat'

describe('formatCell', () => {
  it('formats the top-left cell as R1C1', () => {
    expect(formatCell(0, 0)).toBe('R1C1')
  })

  it('formats the bottom-right cell as R9C9', () => {
    expect(formatCell(8, 8)).toBe('R9C9')
  })

  it('formats row and column offsets independently', () => {
    expect(formatCell(4, 2)).toBe('R5C3')
  })
})

describe('formatCells', () => {
  it('joins multiple cells with a comma and space', () => {
    expect(
      formatCells([
        { row: 0, col: 0 },
        { row: 1, col: 1 },
        { row: 8, col: 8 },
      ]),
    ).toBe('R1C1, R2C2, R9C9')
  })

  it('formats a single cell without a separator', () => {
    expect(formatCells([{ row: 2, col: 3 }])).toBe('R3C4')
  })

  it('formats an empty cell list as the empty string', () => {
    expect(formatCells([])).toBe('')
  })
})

describe('parseAutoFillCellCount', () => {
  it('parses the cell count from a matching explanation', () => {
    expect(parseAutoFillCellCount('Filled all candidates for 27 cells')).toBe(27)
  })

  it('parses the first count when the explanation contains several numbers', () => {
    expect(parseAutoFillCellCount('81 cells requested, took 3 cells over')).toBe(81)
  })

  it('returns 0 for an undefined explanation', () => {
    expect(parseAutoFillCellCount(undefined)).toBe(0)
  })

  it('returns 0 for an empty explanation', () => {
    expect(parseAutoFillCellCount('')).toBe(0)
  })

  it('returns 0 when the explanation has no count before "cells"', () => {
    expect(parseAutoFillCellCount('Filled all candidates for cells')).toBe(0)
  })

  it('returns 0 when the explanation mentions no cells at all', () => {
    expect(parseAutoFillCellCount('Filled all candidates')).toBe(0)
  })

  it('parses a zero count from the explanation', () => {
    expect(parseAutoFillCellCount('Filled all candidates for 0 cells')).toBe(0)
  })

  it('parses a single-digit count', () => {
    expect(parseAutoFillCellCount('Filled all candidates for 9 cells')).toBe(9)
  })

  it('requires the word "cells" rather than a bare number', () => {
    expect(parseAutoFillCellCount('Filled 42 candidates')).toBe(0)
  })
})

describe('pluralSuffix', () => {
  it('pluralises zero', () => {
    expect(pluralSuffix(0)).toBe('s')
  })

  it('keeps one singular', () => {
    expect(pluralSuffix(1)).toBe('')
  })

  it('pluralises two', () => {
    expect(pluralSuffix(2)).toBe('s')
  })

  it('pluralises a larger count', () => {
    expect(pluralSuffix(27)).toBe('s')
  })
})

describe('originalMoveIndex', () => {
  it('maps the first reversed position of a single-move history to index 0', () => {
    expect(originalMoveIndex(1, 0)).toBe(0)
  })

  it('maps the first reversed position of a three-move history to the last original index', () => {
    expect(originalMoveIndex(3, 0)).toBe(2)
  })

  it('maps the last reversed position of a three-move history to the first original index', () => {
    expect(originalMoveIndex(3, 2)).toBe(0)
  })

  it('maps the middle reversed position of a three-move history to the middle original index', () => {
    expect(originalMoveIndex(3, 1)).toBe(1)
  })

  it('maps both positions of a two-move history', () => {
    expect(originalMoveIndex(2, 0)).toBe(1)
    expect(originalMoveIndex(2, 1)).toBe(0)
  })
})

describe('moveDisplayNumber', () => {
  it('numbers the first original index as move 1', () => {
    expect(moveDisplayNumber(0)).toBe(1)
  })

  it('numbers the last original index as the move count', () => {
    expect(moveDisplayNumber(2)).toBe(3)
  })

  it('numbers consecutive indices consecutively', () => {
    expect(moveDisplayNumber(3)).toBe(4)
    expect(moveDisplayNumber(4)).toBe(5)
  })
})
