import type { MoveHighlight } from '../hooks/useHighlightState'
import { hasCandidate } from './candidatesUtils'

/**
 * The render-scope values the Board cell class derivation reads. One object is
 * built per Board render and threaded through every function here.
 */
export interface BoardCellContext {
  board: number[]
  initialBoard: number[]
  candidates: Uint16Array
  selectedCell: number | null
  selectedCells: Set<number>
  highlight: MoveHighlight | null
  highlightedDigit: number | null
  incorrectCells: number[]
  focusedCell: number | null
  /** findDuplicates(board), computed once per render in Board and threaded here. */
  duplicateCells: Set<number>
  /**
   * Cell indexes carrying the primary (respectively secondary) technique
   * highlight, derived once per render in Board and threaded here. When
   * absent, getCellClass derives them from the highlight predicates itself.
   */
  primaryCells?: Set<number>
  secondaryCells?: Set<number>
}

/** Human-readable gridcell label: position, then value with given/entered state. */
export const getCellAriaLabel = (ctx: BoardCellContext, idx: number): string => {
  const row = Math.floor(idx / 9)
  const col = idx % 9
  const value = ctx.board[idx]
  const isGiven = ctx.initialBoard[idx] !== 0

  const position = `Row ${row + 1}, Column ${col + 1}`
  if (value === 0) {
    return `${position}, empty`
  }
  const givenText = isGiven ? ', given' : ''
  return `${position}, value ${value}${givenText}`
}

/**
 * Whether the cell carries the technique's primary highlight. Filled primary
 * cells always highlight; empty ones keep it only while they still hold the
 * relevant candidate (or the move carries no specific digit / is a user move).
 */
export const isHighlightedPrimary = (ctx: BoardCellContext, row: number, col: number): boolean => {
  if (!ctx.highlight) return false
  const inPrimary = ctx.highlight.highlights.primary.some((h) => h.row === row && h.col === col)
  if (!inPrimary) return false

  const idx = row * 9 + col
  if (ctx.board[idx] !== 0) return true

  // No specific digit (undefined or the multi-digit 0) or a user move keeps the highlight
  if (!ctx.highlight.digit || ctx.highlight.isUserMove) return true

  return hasCandidate(ctx.candidates[idx] || 0, ctx.highlight.digit)
}

/**
 * Whether the cell carries a secondary highlight: explicit pattern cells,
 * elimination cells, and target cells not already primary, each filtered by
 * the same filled/candidate currency check as the primary highlight.
 */
export const isHighlightedSecondary = (
  ctx: BoardCellContext,
  row: number,
  col: number,
): boolean => {
  const highlight = ctx.highlight
  if (!highlight) return false

  const idx = row * 9 + col
  const isFilled = ctx.board[idx] !== 0

  const shouldHighlight = (digit?: number): boolean => {
    if (isFilled) return true
    // No specific digit (undefined or the multi-digit 0) or a user move keeps the highlight
    if (!digit || highlight.isUserMove) return true
    return hasCandidate(ctx.candidates[idx] || 0, digit)
  }

  // Explicit secondary highlights are part of the technique pattern, always show.
  if (highlight.highlights.secondary?.some((h) => h.row === row && h.col === col)) {
    return shouldHighlight(highlight.digit)
  }

  // Eliminations and targets not already primary mark their cells in both hint
  // modes; the mode-independent treatment is intentional.
  const elimination = highlight.eliminations?.find((e) => e.row === row && e.col === col)
  if (elimination) {
    return shouldHighlight(elimination.digit)
  }
  if (
    highlight.targets?.some((t) => t.row === row && t.col === col) &&
    !isHighlightedPrimary(ctx, row, col)
  ) {
    return shouldHighlight(highlight.digit)
  }
  return false
}

/** Whether the cell is filled with the highlighted digit or holds it as a note. */
export const cellHasHighlightedDigit = (ctx: BoardCellContext, idx: number): boolean => {
  const highlightedDigit = ctx.highlightedDigit
  // 0 is the no-specific-digit sentinel the rest of this module uses for move
  // highlights, so a null-ish highlight matches nothing.
  if (!highlightedDigit) return false
  return (
    ctx.board[idx] === highlightedDigit || hasCandidate(ctx.candidates[idx] || 0, highlightedDigit)
  )
}

/** Whether the cell shares a row, column, or box with any selected cell (self excluded). */
export const isPeerOfSelected = (ctx: BoardCellContext, idx: number): boolean => {
  const cellsToCheck =
    ctx.selectedCells.size > 0
      ? ctx.selectedCells
      : ctx.selectedCell !== null
        ? new Set([ctx.selectedCell])
        : null
  if (!cellsToCheck) return false
  if (cellsToCheck.has(idx)) return false

  const row = Math.floor(idx / 9)
  const col = idx % 9
  const boxRow = Math.floor(row / 3)
  const boxCol = Math.floor(col / 3)

  for (const selIdx of cellsToCheck) {
    const selRow = Math.floor(selIdx / 9)
    const selCol = selIdx % 9
    if (row === selRow) return true
    if (col === selCol) return true
    if (boxRow === Math.floor(selRow / 3) && boxCol === Math.floor(selCol / 3)) return true
  }

  return false
}

/**
 * Whether the cell index is part of the active multi-selection. Both the
 * primary selectedCell and other selectedCells members participate in the
 * unified selection rectangle when multiple cells are selected.
 */
export const isInMultiSelection = (ctx: BoardCellContext, idx: number): boolean => {
  return ctx.selectedCells.size > 1 && ctx.selectedCells.has(idx)
}

/**
 * Multi-selection outline: adjacent selected cells form a unified accent
 * rectangle, so interior shared edges are dropped and only outer edges boxed.
 */
export const multiSelectionClasses = (
  ctx: BoardCellContext,
  idx: number,
  row: number,
  col: number,
): string[] => {
  const hasRight = isInMultiSelection(ctx, idx + 1)
  const hasBelow = isInMultiSelection(ctx, idx + 9)
  const hasLeft = col > 0 && isInMultiSelection(ctx, idx - 1)
  const hasAbove = isInMultiSelection(ctx, idx - 9)
  const classes = ['multi-selected']
  if (!hasRight && col < 8) classes.push('border-r-2 border-r-accent')
  if (!hasBelow && row < 8) classes.push('border-b-2 border-b-accent')
  if (!hasLeft) classes.push('border-l-2 border-l-accent')
  if (!hasAbove) classes.push('border-t-2 border-t-accent')
  return classes
}

/** Standard grid borders: thick lines at the 3x3 boundaries, light elsewhere. */
export const normalBorderClasses = (row: number, col: number): string[] => {
  const classes: string[] = []
  if (col === 2 || col === 5) classes.push('border-r-2 border-r-board-border')
  else if (col < 8) classes.push('border-r border-r-board-border-light')
  if (row === 2 || row === 5) classes.push('border-b-2 border-b-board-border')
  else if (row < 8) classes.push('border-b border-b-board-border-light')
  return classes
}

/** Background color by precedence: error, highlights, selection, digit match, peer, given/plain. */
export const backgroundClass = (
  ctx: BoardCellContext,
  row: number,
  col: number,
  isIncorrect: boolean,
  isDuplicate: boolean,
  isPrimary: boolean,
  isSecondary: boolean,
  isSelected: boolean,
  inMultiSel: boolean,
  hasDigitMatch: boolean,
  isPeer: boolean,
  isGiven: boolean,
): string => {
  if (isIncorrect || isDuplicate) return 'bg-error-bg'
  if (isPrimary) return 'bg-cell-primary'
  if (isSecondary) {
    const isTechniqueHint = ctx.highlight?.showAnswer === false
    const isExplicitSecondary = ctx.highlight?.highlights.secondary?.some(
      (h) => h.row === row && h.col === col,
    )
    return isTechniqueHint && !isExplicitSecondary ? 'bg-cell-primary' : 'bg-cell-secondary'
  }
  if (isSelected || inMultiSel) return 'bg-cell-selected'
  if (hasDigitMatch) return 'bg-accent-light'
  if (isPeer) return 'bg-cell-peer'
  return isGiven ? 'bg-cell-given' : 'bg-cell-bg'
}

/** Text color by precedence: error > highlight > given > entered. */
export const textClass = (
  isIncorrect: boolean,
  isDuplicate: boolean,
  isPrimary: boolean,
  isSecondary: boolean,
  isGiven: boolean,
): string => {
  if (isIncorrect || isDuplicate) return 'text-error-text'
  if (isPrimary || isSecondary) return 'text-cell-text-on-highlight'
  return isGiven ? 'text-cell-text-given' : 'text-cell-text-entered'
}

/** Full class list for one cell: base, borders/ring, background, text, focus. */
export const getCellClass = (ctx: BoardCellContext, idx: number): string => {
  const row = Math.floor(idx / 9)
  const col = idx % 9
  const isGiven = ctx.initialBoard[idx] !== 0
  const isSelected = ctx.selectedCell === idx
  const inMultiSel = isInMultiSelection(ctx, idx)
  const isPrimary = ctx.primaryCells
    ? ctx.primaryCells.has(idx)
    : isHighlightedPrimary(ctx, row, col)
  const isSecondary = ctx.secondaryCells
    ? ctx.secondaryCells.has(idx)
    : isHighlightedSecondary(ctx, row, col)
  const isDuplicate = ctx.duplicateCells.has(idx)
  const hasDigitMatch = cellHasHighlightedDigit(ctx, idx)
  const isPeer = isPeerOfSelected(ctx, idx)
  const isIncorrect = ctx.incorrectCells.includes(idx)

  const classes: string[] = ['sudoku-cell']

  if (inMultiSel) {
    classes.push(...multiSelectionClasses(ctx, idx, row, col))
    if (isIncorrect) classes.push('ring-2 ring-inset ring-error-text z-10')
  } else {
    classes.push(...normalBorderClasses(row, col))
    if (isIncorrect) classes.push('ring-2 ring-inset ring-error-text z-10')
    else if (isSelected) classes.push('ring-2 ring-inset ring-accent z-10')
  }

  classes.push(
    backgroundClass(
      ctx,
      row,
      col,
      isIncorrect,
      isDuplicate,
      isPrimary,
      isSecondary,
      isSelected,
      inMultiSel,
      hasDigitMatch,
      isPeer,
      isGiven,
    ),
  )
  classes.push(textClass(isIncorrect, isDuplicate, isPrimary, isSecondary, isGiven))

  if (idx === ctx.focusedCell) {
    classes.push('cell-focused outline outline-2 outline-offset-[-1px] outline-accent')
  }

  return classes.join(' ')
}
