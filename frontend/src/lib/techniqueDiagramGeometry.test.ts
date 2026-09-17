import { describe, expect, it } from 'vitest'
import {
  buildCellMap,
  candidateSubgridPlacement,
  cellKey,
  getCellFill,
  isCellHighlighted,
} from './techniqueDiagramGeometry'
import type { DiagramCell } from './techniques'

const cell = (overrides: Partial<DiagramCell> = {}): DiagramCell => ({
  row: 0,
  col: 0,
  ...overrides,
})

describe('cellKey', () => {
  it('keys a position by its row and column joined with a dash', () => {
    expect(cellKey(4, 7)).toBe('4-7')
  })
})

describe('buildCellMap', () => {
  it('indexes each cell under its row/column key', () => {
    const cellMap = buildCellMap([cell({ row: 2, col: 5, value: 3 })])
    expect(cellMap.get('2-5')).toMatchObject({ row: 2, col: 5, value: 3 })
  })

  it('keeps the last entry when two cells share a position', () => {
    const cellMap = buildCellMap([
      cell({ row: 1, col: 1, highlight: 'primary' }),
      cell({ row: 1, col: 1, highlight: 'secondary' }),
    ])
    expect(cellMap.get('1-1')?.highlight).toBe('secondary')
  })

  it('returns an empty map for an empty cell list', () => {
    expect(buildCellMap([]).size).toBe(0)
  })
})

describe('getCellFill', () => {
  it('fills a primary-highlighted cell with the primary color', () => {
    const cellMap = buildCellMap([cell({ highlight: 'primary' })])
    expect(getCellFill(cellMap, 0, 0)).toBe('var(--cell-primary)')
  })

  it('fills a secondary-highlighted cell with the secondary color', () => {
    const cellMap = buildCellMap([cell({ highlight: 'secondary' })])
    expect(getCellFill(cellMap, 0, 0)).toBe('var(--cell-secondary)')
  })

  it('fills an elimination-highlighted cell with the accent light color', () => {
    const cellMap = buildCellMap([cell({ highlight: 'elimination' })])
    expect(getCellFill(cellMap, 0, 0)).toBe('var(--accent-light)')
  })

  it('fills a cell without any highlight with the default background', () => {
    const cellMap = buildCellMap([cell({ value: 5 })])
    expect(getCellFill(cellMap, 0, 0)).toBe('var(--cell-bg)')
  })

  it('fills a position absent from the map with the default background', () => {
    const cellMap = buildCellMap([cell({ row: 8, col: 8, highlight: 'primary' })])
    expect(getCellFill(cellMap, 0, 0)).toBe('var(--cell-bg)')
  })
})

describe('isCellHighlighted', () => {
  it('treats a primary-highlighted cell as highlighted', () => {
    expect(isCellHighlighted(cell({ highlight: 'primary' }), false)).toBe(true)
  })

  it('treats a secondary-highlighted cell as highlighted', () => {
    expect(isCellHighlighted(cell({ highlight: 'secondary' }), false)).toBe(true)
  })

  it('treats an elimination-highlighted cell as highlighted only when asked', () => {
    expect(isCellHighlighted(cell({ highlight: 'elimination' }), true)).toBe(true)
    expect(isCellHighlighted(cell({ highlight: 'elimination' }), false)).toBe(false)
  })

  it('treats a cell without a highlight as not highlighted', () => {
    expect(isCellHighlighted(cell({ value: 5 }), true)).toBe(false)
  })

  it('treats an absent cell as not highlighted', () => {
    expect(isCellHighlighted(undefined, true)).toBe(false)
  })
})

describe('candidateSubgridPlacement', () => {
  const cases: Array<[number, { cRow: number; cCol: number }]> = [
    [1, { cRow: 0, cCol: 0 }],
    [3, { cRow: 0, cCol: 2 }],
    [5, { cRow: 1, cCol: 1 }],
    [7, { cRow: 2, cCol: 0 }],
    [9, { cRow: 2, cCol: 2 }],
  ]

  for (const [digit, placement] of cases) {
    it(`places digit ${digit} at sub-grid row ${placement.cRow}, column ${placement.cCol}`, () => {
      expect(candidateSubgridPlacement(digit)).toEqual(placement)
    })
  }

  it('keeps the sub-grid rows strictly increasing from the first to the last digit', () => {
    expect(candidateSubgridPlacement(1).cRow).toBeLessThan(candidateSubgridPlacement(4).cRow)
    expect(candidateSubgridPlacement(4).cRow).toBeLessThan(candidateSubgridPlacement(7).cRow)
  })
})
