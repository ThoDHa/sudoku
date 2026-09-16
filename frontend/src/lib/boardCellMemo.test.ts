import { describe, expect, it } from 'vitest'
import { areCellPropsEqual, type CellData, type CellProps } from './boardCellMemo'

const noop = () => {}

const elimination = { row: 0, col: 1, digit: 3 }

const makeCellData = (overrides: Partial<CellData> = {}): CellData => ({
  idx: 0,
  value: 0,
  cellCandidates: 0,
  isGiven: false,
  isSelected: false,
  tabIndex: -1,
  className: 'sudoku-cell',
  ariaLabel: 'Row 1, Column 1, empty',
  highlightedDigit: null,
  isPrimary: false,
  isSecondary: false,
  isTarget: false,
  eliminations: undefined,
  showAnswer: true,
  ...overrides,
})

const makeCellProps = (overrides: Partial<CellProps> = {}): CellProps => ({
  data: makeCellData(),
  onCellClick: noop,
  onKeyDown: noop,
  cellRef: noop,
  ...overrides,
})

describe('areCellPropsEqual', () => {
  describe('equality branches', () => {
    it('returns true for two distinct but fully equal props objects', () => {
      const prev = makeCellProps()
      const next = makeCellProps()
      expect(areCellPropsEqual(prev, next)).toBe(true)
    })

    it('returns true when every CellData field holds the same non-default value', () => {
      const sharedEliminations = [elimination]
      const data: CellData = makeCellData({
        idx: 40,
        value: 7,
        cellCandidates: 0b101,
        isGiven: true,
        isSelected: true,
        tabIndex: 0,
        className: 'sudoku-cell bg-cell-primary',
        ariaLabel: 'Row 5, Column 5, value 7, given',
        highlightedDigit: 7,
        isPrimary: true,
        isSecondary: true,
        isTarget: true,
        eliminations: sharedEliminations,
        showAnswer: false,
        targetDigit: 7,
      })
      expect(areCellPropsEqual(makeCellProps({ data }), makeCellProps({ data: { ...data } }))).toBe(
        true,
      )
    })
  })

  describe('memoization contract', () => {
    it('short-circuits to equal when the data object is identical by reference, even if callbacks changed', () => {
      const data = makeCellData({ value: 5 })
      const prev = makeCellProps({ data })
      const next = makeCellProps({ data, onCellClick: () => {} })
      expect(areCellPropsEqual(prev, next)).toBe(true)
    })
  })

  describe('inequality branches: one changed CellData field per case', () => {
    const changedDataCases: { name: string; next: Partial<CellData> }[] = [
      { name: 'idx', next: { idx: 1 } },
      { name: 'value', next: { value: 5 } },
      { name: 'cellCandidates', next: { cellCandidates: 0b11 } },
      { name: 'isGiven', next: { isGiven: true } },
      { name: 'isSelected', next: { isSelected: true } },
      { name: 'tabIndex', next: { tabIndex: 0 } },
      { name: 'className', next: { className: 'sudoku-cell bg-cell-selected' } },
      { name: 'ariaLabel', next: { ariaLabel: 'Row 1, Column 2, empty' } },
      { name: 'highlightedDigit (null to a digit)', next: { highlightedDigit: 3 } },
      { name: 'isPrimary', next: { isPrimary: true } },
      { name: 'isSecondary', next: { isSecondary: true } },
      { name: 'isTarget', next: { isTarget: true } },
      { name: 'eliminations (undefined to a new array)', next: { eliminations: [elimination] } },
      { name: 'showAnswer', next: { showAnswer: false } },
      { name: 'targetDigit (undefined to a digit)', next: { targetDigit: 3 } },
    ]

    for (const { name, next } of changedDataCases) {
      it(`returns false when only ${name} changed`, () => {
        const prev = makeCellProps()
        const nextProps = makeCellProps({ data: makeCellData(next) })
        expect(areCellPropsEqual(prev, nextProps)).toBe(false)
      })
    }

    it('returns false when highlightedDigit changed from a digit back to null', () => {
      const prev = makeCellProps({ data: makeCellData({ highlightedDigit: 3 }) })
      const next = makeCellProps()
      expect(areCellPropsEqual(prev, next)).toBe(false)
    })

    it('returns false when eliminations is a different array with identical contents', () => {
      const prev = makeCellProps({ data: makeCellData({ eliminations: [elimination] }) })
      const next = makeCellProps({ data: makeCellData({ eliminations: [{ ...elimination }] }) })
      expect(areCellPropsEqual(prev, next)).toBe(false)
    })

    it('returns true when eliminations is the same array reference', () => {
      const eliminations = [elimination]
      const prev = makeCellProps({ data: makeCellData({ eliminations }) })
      const next = makeCellProps({ data: makeCellData({ eliminations }) })
      expect(areCellPropsEqual(prev, next)).toBe(true)
    })

    it('returns false when targetDigit changed from one digit to another', () => {
      const prev = makeCellProps({ data: makeCellData({ targetDigit: 1 }) })
      const next = makeCellProps({ data: makeCellData({ targetDigit: 2 }) })
      expect(areCellPropsEqual(prev, next)).toBe(false)
    })

    it('returns false when targetDigit changed from a digit back to undefined', () => {
      const prev = makeCellProps({ data: makeCellData({ targetDigit: 1 }) })
      const next = makeCellProps()
      expect(areCellPropsEqual(prev, next)).toBe(false)
    })
  })

  describe('inequality branches: changed callback references', () => {
    it('returns false when onKeyDown changed', () => {
      const prev = makeCellProps()
      const next = makeCellProps({ onKeyDown: () => {} })
      expect(areCellPropsEqual(prev, next)).toBe(false)
    })

    it('returns false when onCellClick changed', () => {
      const prev = makeCellProps()
      const next = makeCellProps({ onCellClick: () => {} })
      expect(areCellPropsEqual(prev, next)).toBe(false)
    })

    it('returns false when onPointerDown changed from a function to another function', () => {
      const prev = makeCellProps({ onPointerDown: noop })
      const next = makeCellProps({ onPointerDown: () => {} })
      expect(areCellPropsEqual(prev, next)).toBe(false)
    })

    it('returns false when onPointerDown changed from undefined to a function', () => {
      const prev = makeCellProps()
      const next = makeCellProps({ onPointerDown: noop })
      expect(areCellPropsEqual(prev, next)).toBe(false)
    })

    it('returns true when onPointerDown is undefined on both sides', () => {
      const prev = makeCellProps()
      const next = makeCellProps()
      expect(areCellPropsEqual(prev, next)).toBe(true)
    })
  })
})
