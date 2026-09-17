import React, { memo, useRef } from 'react'
import { hasCandidate, countCandidates } from '../lib/candidatesUtils'
import { findDuplicates } from '../lib/validationUtils'
import { TOTAL_CELLS } from '../lib/constants'
import { useBoardInteraction } from '../hooks/useBoardInteraction'
import { areCellPropsEqual, type CellData, type CellProps } from '../lib/boardCellMemo'
import {
  getCellAriaLabel,
  getCellClass,
  isHighlightedPrimary,
  isHighlightedSecondary,
  type BoardCellContext,
} from '../lib/boardCellClasses'

interface Move {
  step_index: number
  technique: string
  action: string
  digit: number
  targets: { row: number; col: number }[]
  eliminations?: { row: number; col: number; digit: number }[]
  explanation: string
  refs: { title: string; slug: string; url: string }
  highlights: {
    primary: { row: number; col: number }[]
    secondary?: { row: number; col: number }[]
  }
  isUserMove?: boolean
  /** When false, hides eliminations and target additions (technique hint mode) */
  showAnswer?: boolean
}

interface BoardProps {
  board: number[]
  initialBoard: number[]
  candidates: Uint16Array
  /** Version counter for candidates - ensures React detects changes to Uint16Array */
  candidatesVersion?: number
  selectedCell: number | null
  selectedCells: Set<number>
  highlightedDigit: number | null
  highlight: Move | null
  onCellClick: (idx: number) => void
  onCellChange?: (idx: number, value: number) => void
  /** Callback for multi-select - called when drag selects multiple cells */
  onCellSelectMultiple?: (cells: number[]) => void
  /** Callback when a multi-cell drag completes (pointerUp) with the final selected cells */
  onDragEnd?: (cells: number[]) => void
  /** Cells that contain incorrect values (compared to the solution) */
  incorrectCells?: number[]
  /** Additional CSS classes to apply to the board container */
  className?: string
}

// ============================================================
// CELL COMPONENT - Memoized for performance
// ============================================================

/**
 * Memoized Cell component - only re-renders when its specific data changes.
 * This prevents 80 cells from re-rendering when only 1 cell changes.
 */
const Cell = memo(function Cell({
  data,
  onCellClick,
  onKeyDown,
  cellRef,
  onPointerDown,
}: CellProps) {
  const localRef = useRef<HTMLDivElement>(null)
  const {
    idx,
    value,
    cellCandidates,
    isGiven,
    tabIndex,
    className,
    ariaLabel,
    highlightedDigit,
    isPrimary,
    isSecondary,
    isTarget,
    eliminations,
    showAnswer,
    targetDigit,
  } = data

  const row = Math.floor(idx / 9)
  const col = idx % 9

  // Render cell content
  let content: React.ReactNode = null

  if (value !== 0) {
    // Filled cell
    const isOnHighlightedBackground = isPrimary || isSecondary
    const isHighlightedDigit = highlightedDigit === value

    // Priority: background highlight needs contrast text, then digit highlighting
    const textClass = isOnHighlightedBackground
      ? 'text-cell-text-on-highlight font-bold'
      : isHighlightedDigit
        ? 'text-accent font-bold'
        : ''

    content = <span className={textClass}>{value}</span>
  } else if (cellCandidates && countCandidates(cellCandidates) > 0) {
    // Cell with candidates
    const isHighlightedCell = isPrimary || isSecondary
    const singleDigit = highlightedDigit && highlightedDigit > 0 ? highlightedDigit : null

    content = (
      <div className="candidate-grid">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
          const hasCandidate_ = hasCandidate(cellCandidates, d)

          // Check if this specific digit in this cell is being eliminated
          // Only show eliminations if showAnswer is true (regular hint mode)
          const isEliminated =
            showAnswer && eliminations?.some((e) => e.row === row && e.col === col && e.digit === d)

          // Check if this digit is the relevant one for highlighting
          // Use targetDigit (from hint) if available, otherwise fall back to singleDigit (user-selected)
          // For multi-digit techniques (digit === 0), check if digit is relevant to the technique
          let isRelevantDigit = false
          if (targetDigit !== undefined && targetDigit > 0) {
            // Single-digit technique: highlight only that digit
            isRelevantDigit = d === targetDigit
          } else if (targetDigit === 0 && isTarget) {
            // Multi-digit technique (naked pair, hidden pair, etc.):
            // Highlight candidates in target cells that are NOT being eliminated
            // For naked pair: all candidates in pair cells are the pair digits
            // For hidden pair: the pair digits remain (others are eliminated)
            const isBeingEliminatedHere = eliminations?.some(
              (e) => e.row === row && e.col === col && e.digit === d,
            )
            isRelevantDigit = !isBeingEliminatedHere
          } else if (singleDigit) {
            // User-selected digit highlighting
            isRelevantDigit = d === singleDigit
          }

          // Determine styling for this specific candidate
          let digitClass = 'candidate-digit '

          if (hasCandidate_ && isEliminated) {
            digitClass += 'text-error-text line-through font-bold'
          } else if (hasCandidate_ && isRelevantDigit && isTarget && showAnswer) {
            // Target cells show the digit to ADD in green (hint color)
            // Only highlight the specific targetDigit, not all candidates
            // Only show if showAnswer is true (regular hint mode)
            digitClass += 'text-hint-text font-bold'
          } else if (isHighlightedCell) {
            digitClass += 'text-cell-text-on-highlight'
          } else {
            digitClass += 'text-cell-text-candidate'
          }

          return (
            <span key={d} className={digitClass}>
              {hasCandidate_ ? d : ''}
            </span>
          )
        })}
      </div>
    )
  }

  // Combine local ref with callback ref, and focus synchronously on click
  const handleClick = () => {
    onCellClick(idx)
    // Focus immediately for keyboard input (don't wait for useEffect + RAF)
    localRef.current?.focus()
  }

  // Set both refs when the element mounts
  const setRefs = (el: HTMLDivElement | null) => {
    localRef.current = el
    cellRef(el)
  }

  return (
    <div
      ref={setRefs}
      role="gridcell"
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      className={className}
      data-cell-idx={idx}
      onClick={handleClick}
      onKeyDown={(e) => {
        onKeyDown(e, idx)
      }}
      onPointerDown={() => onPointerDown?.(idx)}
      style={isGiven ? { cursor: 'default' } : undefined}
    >
      {content}
    </div>
  )
}, areCellPropsEqual)

// ============================================================
// BOARD COMPONENT
// ============================================================

const Board = memo(function Board({
  board,
  initialBoard,
  candidates,
  candidatesVersion,
  selectedCell,
  selectedCells,
  highlightedDigit,
  highlight,
  onCellClick,
  onCellChange,
  onCellSelectMultiple,
  onDragEnd,
  incorrectCells = [],
  className = '',
}: BoardProps) {
  const {
    focusedCell,
    tabStopCell,
    cellRefCallbacks,
    handleCellClick,
    handleCellKeyDown,
    handleDragStart,
    handleBoardPointerMove,
    handleBoardPointerUp,
    handleGridFocus,
    handleGridBlur,
  } = useBoardInteraction({
    selectedCell,
    initialBoard,
    board,
    onCellClick,
    ...(onCellChange !== undefined ? { onCellChange } : {}),
    ...(onCellSelectMultiple !== undefined ? { onCellSelectMultiple } : {}),
    ...(onDragEnd !== undefined ? { onDragEnd } : {}),
  })

  // candidatesVersion is read (not just listed as a dep) so the React Compiler
  // keys recomputation on it: candidates is a Uint16Array mutated in place, so a
  // reference-only check would miss the in-place mutations signalled by a version bump.
  void candidatesVersion
  const duplicates = findDuplicates(board)

  // Per-cell technique highlights, derived once per render and consumed by
  // both the CellData fields and the class derivation. The context holds the
  // empty sets by reference; the pass below fills them before any consumer runs.
  const primaryCells = new Set<number>()
  const secondaryCells = new Set<number>()
  const cellContext: BoardCellContext = {
    board,
    initialBoard,
    candidates,
    selectedCell,
    selectedCells,
    highlight,
    highlightedDigit,
    incorrectCells,
    focusedCell,
    duplicateCells: duplicates,
    primaryCells,
    secondaryCells,
  }
  for (let idx = 0; idx < TOTAL_CELLS; idx++) {
    const row = Math.floor(idx / 9)
    const col = idx % 9
    if (isHighlightedPrimary(cellContext, row, col)) primaryCells.add(idx)
    if (isHighlightedSecondary(cellContext, row, col)) secondaryCells.add(idx)
  }

  // REMOVED: renderCell function - now handled inside Cell component

  // Pre-compute all 81 cell data objects. The React Compiler memoizes the array
  // on its full transitive read set; each Cell only re-renders when its specific
  // CellData fields change (see the custom comparator on the Cell memo wrapper).
  const cellDataArray: CellData[] = []
  for (let idx = 0; idx < TOTAL_CELLS; idx++) {
    const row = Math.floor(idx / 9)
    const col = idx % 9
    const isGiven = initialBoard[idx] !== 0
    const isPrimary = primaryCells.has(idx)
    const isSecondary = secondaryCells.has(idx)
    const isTarget = highlight?.targets?.some((t) => t.row === row && t.col === col) ?? false

    const targetDigit = highlight?.digit
    const cellData: CellData = {
      idx,
      value: board[idx] ?? 0,
      cellCandidates: candidates[idx] || 0,
      isGiven,
      tabIndex: idx === tabStopCell ? 0 : -1,
      className: getCellClass(cellContext, idx),
      ariaLabel: getCellAriaLabel(cellContext, idx),
      highlightedDigit,
      isPrimary,
      isSecondary,
      isTarget,
      eliminations: highlight?.eliminations,
      showAnswer: highlight?.showAnswer !== false, // Default to true for backward compatibility
    }
    if (targetDigit !== undefined) {
      cellData.targetDigit = targetDigit // Pass the hint's digit for candidate highlighting
    }
    cellDataArray.push(cellData)
  }

  return (
    <div
      className={`sudoku-board aspect-square w-full max-h-full ${className}`}
      role="grid"
      aria-label="Sudoku puzzle"
      style={{ touchAction: 'none' }}
      onPointerMove={handleBoardPointerMove}
      onPointerUp={handleBoardPointerUp}
      onPointerCancel={handleBoardPointerUp}
      onFocus={handleGridFocus}
      onBlur={handleGridBlur}
    >
      {Array.from({ length: 9 }, (_, rowIdx) => (
        <div key={rowIdx} role="row" className="contents">
          {Array.from({ length: 9 }, (_, colIdx) => {
            const idx = rowIdx * 9 + colIdx
            const cellData = cellDataArray[idx]
            const cellRef = cellRefCallbacks[idx]
            // These are guaranteed to exist for idx 0-80
            if (!cellData || !cellRef) return null
            return (
              <Cell
                key={idx}
                data={cellData}
                onCellClick={handleCellClick}
                onKeyDown={handleCellKeyDown}
                cellRef={cellRef}
                onPointerDown={handleDragStart}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
})

export default Board
