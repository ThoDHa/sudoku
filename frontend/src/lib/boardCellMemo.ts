import type React from 'react'

/**
 * Pre-computed data for a single cell - passed to Cell component
 */
export interface CellData {
  idx: number
  value: number
  cellCandidates: number
  isGiven: boolean
  isSelected: boolean
  tabIndex: number
  className: string
  ariaLabel: string
  // For renderCell logic
  highlightedDigit: number | null
  isPrimary: boolean
  isSecondary: boolean
  isTarget: boolean
  eliminations: { row: number; col: number; digit: number }[] | undefined
  /** When false, hides eliminations and target additions (technique hint mode) */
  showAnswer: boolean
  /** The digit being placed/eliminated by the current hint (from highlight.digit) */
  targetDigit?: number
}

export interface CellProps {
  data: CellData
  onCellClick: (idx: number) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, idx: number) => void
  cellRef: (el: HTMLDivElement | null) => void
  onPointerDown?: (idx: number) => void
}

/**
 * Memo comparator for the memoized Cell component: returns true to keep the
 * previous render, false to re-render. Only re-renders when this cell's data
 * actually changed, which prevents 80 cells from re-rendering when only 1
 * cell changes. Compares every CellData field that affects rendering, plus
 * the three callback references: onKeyDown captures notesMode in its
 * closure, so when notesMode changes, onKeyDown must update.
 */
export const areCellPropsEqual = (prevProps: CellProps, nextProps: CellProps): boolean => {
  const prevData = prevProps.data
  const nextData = nextProps.data

  // Quick reference checks first
  if (prevData === nextData) return true

  return (
    prevData.idx === nextData.idx &&
    prevData.value === nextData.value &&
    prevData.cellCandidates === nextData.cellCandidates &&
    prevData.isGiven === nextData.isGiven &&
    prevData.isSelected === nextData.isSelected &&
    prevData.tabIndex === nextData.tabIndex &&
    prevData.className === nextData.className &&
    prevData.ariaLabel === nextData.ariaLabel &&
    prevData.highlightedDigit === nextData.highlightedDigit &&
    prevData.isPrimary === nextData.isPrimary &&
    prevData.isSecondary === nextData.isSecondary &&
    prevData.isTarget === nextData.isTarget &&
    prevData.eliminations === nextData.eliminations &&
    prevData.showAnswer === nextData.showAnswer &&
    prevData.targetDigit === nextData.targetDigit &&
    prevProps.onKeyDown === nextProps.onKeyDown &&
    prevProps.onCellClick === nextProps.onCellClick &&
    prevProps.onPointerDown === nextProps.onPointerDown
  )
}
