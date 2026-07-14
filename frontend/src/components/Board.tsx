import React, { memo, useCallback, useMemo, useRef } from 'react'
import { hasCandidate, countCandidates } from '../lib/candidatesUtils'
import { calculatePathCells } from '../lib/pathUtils'

const DATA_CELL_IDX = 'data-cell-idx'
const CELL_SELECTOR = `[${DATA_CELL_IDX}]`

// Trim a drag trail back to a revisited cell, dropping everything after it.
const backtrackTrail = (trail: number[], trailSet: Set<number>, idx: number): void => {
  const backtrackIdx = trail.indexOf(idx)
  const removed = trail.splice(backtrackIdx + 1)
  for (const r of removed) trailSet.delete(r)
}

// Extend a drag trail forward from its tip to `idx`, bridging any cells the
// pointer skipped between events. Skips givens/filled/already-tracked cells.
const extendTrailForward = (
  trail: number[],
  trailSet: Set<number>,
  idx: number,
  startCell: number | null,
  initialBoard: number[],
  board: number[],
): void => {
  let prevCell: number
  if (trail.length > 0) {
    const lastIdx = trail[trail.length - 1]
    if (lastIdx === undefined) return
    prevCell = lastIdx
  } else {
    if (startCell === null) return
    prevCell = startCell
  }
  for (const cellIdx of calculatePathCells(prevCell, idx)) {
    if (initialBoard[cellIdx] === 0 && board[cellIdx] === 0 && !trailSet.has(cellIdx)) {
      trail.push(cellIdx)
      trailSet.add(cellIdx)
    }
  }
}

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

// Find duplicates within a unit (row, column, or box) given cell indices
function findDuplicatesInUnit(board: number[], indices: number[]): Set<number> {
  const seen = new Map<number, number[]>()
  for (const idx of indices) {
    const val = board[idx] ?? 0
    if (val !== 0) {
      if (!seen.has(val)) seen.set(val, [])
      seen.get(val)?.push(idx)
    }
  }
  const duplicates = new Set<number>()
  seen.forEach((cellIndices) => {
    if (cellIndices.length > 1) cellIndices.forEach((i) => duplicates.add(i))
  })
  return duplicates
}

// Find all cells that have duplicate values in their row, column, or box
function findDuplicates(board: number[]): Set<number> {
  const duplicates = new Set<number>()

  // Check rows
  for (let row = 0; row < 9; row++) {
    const indices = Array.from({ length: 9 }, (_, col) => row * 9 + col)
    findDuplicatesInUnit(board, indices).forEach((i) => duplicates.add(i))
  }

  // Check columns
  for (let col = 0; col < 9; col++) {
    const indices = Array.from({ length: 9 }, (_, row) => row * 9 + col)
    findDuplicatesInUnit(board, indices).forEach((i) => duplicates.add(i))
  }

  // Check boxes
  for (let box = 0; box < 9; box++) {
    const boxRow = Math.floor(box / 3) * 3
    const boxCol = (box % 3) * 3
    const indices: number[] = []
    for (let r = boxRow; r < boxRow + 3; r++) {
      for (let c = boxCol; c < boxCol + 3; c++) {
        indices.push(r * 9 + c)
      }
    }
    findDuplicatesInUnit(board, indices).forEach((i) => duplicates.add(i))
  }

  return duplicates
}

// ============================================================
// CELL COMPONENT - Memoized for performance
// ============================================================

/** Pre-computed data for a single cell - passed to Cell component */
interface CellData {
  idx: number
  value: number
  cellCandidates: number
  isGiven: boolean
  isSelected: boolean
  tabIndex: number
  isMultiSelected: boolean
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

interface CellProps {
  data: CellData
  onCellClick: (idx: number) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, idx: number) => void
  cellRef: (el: HTMLDivElement | null) => void
  onPointerDown?: (idx: number) => void
}

/**
 * Memoized Cell component - only re-renders when its specific data changes.
 * This prevents 80 cells from re-rendering when only 1 cell changes.
 */
const Cell = memo(
  function Cell({ data, onCellClick, onKeyDown, cellRef, onPointerDown }: CellProps) {
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
              showAnswer &&
              eliminations?.some((e) => e.row === row && e.col === col && e.digit === d)

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
    const handleClick = useCallback(() => {
      onCellClick(idx)
      // Focus immediately for keyboard input (don't wait for useEffect + RAF)
      localRef.current?.focus()
    }, [onCellClick, idx])

    // Set both refs when the element mounts
    const setRefs = useCallback(
      (el: HTMLDivElement | null) => {
        ;(localRef as React.MutableRefObject<HTMLDivElement | null>).current = el
        cellRef(el)
      },
      [cellRef],
    )

    return (
      <div
        ref={setRefs}
        role="gridcell"
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        className={className}
        data-cell-idx={idx}
        onClick={handleClick}
        onKeyDown={(e) => onKeyDown(e, idx)}
        onPointerDown={() => onPointerDown?.(idx)}
        style={isGiven ? { cursor: 'default' } : undefined}
      >
        {content}
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison - only re-render if this cell's data actually changed
    // This is critical for performance - we compare to CellData object deeply
    const prevData = prevProps.data
    const nextData = nextProps.data

    // Quick reference checks first
    if (prevData === nextData) return true

    // Compare all fields that affect rendering
    // NOTE: We also compare callback references because onKeyDown captures
    // notesMode in its closure. When notesMode changes, onKeyDown must update.
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
      prevProps.onKeyDown === nextProps.onKeyDown &&
      prevProps.onCellClick === nextProps.onCellClick &&
      prevProps.onPointerDown === nextProps.onPointerDown
    )
  },
)

// ============================================================
// BOARD COMPONENT
// ============================================================

const Board = memo(function Board({
  board,
  initialBoard,
  candidates,
  candidatesVersion,
  selectedCell,
  selectedCells = new Set<number>(),
  highlightedDigit,
  highlight,
  onCellClick,
  onCellChange,
  onCellSelectMultiple,
  onDragEnd: onDragEndProp,
  incorrectCells = [],
  className = '',
}: BoardProps) {
  const cellRefs = React.useRef<(HTMLDivElement | null)[]>([])

  const [focusedCell, setFocusedCell] = React.useState<number | null>(null)

  const tabStopCell = useMemo(() => {
    if (selectedCell !== null) return selectedCell
    for (let i = 0; i < 81; i++) {
      if (initialBoard[i] === 0) return i
    }
    return 0
  }, [selectedCell, initialBoard])

  // Drag state for multi-select feature
  // Refs updated synchronously so drag callbacks always read the latest value
  // (setState is asynchronous, so handleDragEnter would see stale isDragging=false)
  const isDraggingRef = React.useRef(false)
  const dragStartCellRef = React.useRef<number | null>(null)
  // Ordered trail of cells the pointer has swept through. When the pointer
  // revisits a cell already in the trail, we trim back to that point
  // (backtracking removes cells). Uses an array for order + a set for O(1) lookup.
  const dragTrailRef = React.useRef<number[]>([])
  const dragTrailSetRef = React.useRef<Set<number>>(new Set())
  // Tracks whether a multi-select drag occurred, so the subsequent click event
  // (synthesized by the browser after pointerup) can be suppressed to avoid
  // overwriting the multi-select state with a single-cell selection.
  const suppressNextClickRef = React.useRef(false)

  // Ref for initialBoard to allow stable callbacks that always read the latest value
  // This is critical because Cell memoization doesn't compare onKeyDown callbacks,
  // so we need callbacks that don't go stale when initialBoard changes
  // IMPORTANT: Update the ref synchronously during render, NOT in useEffect!
  // useEffect runs after render, causing stale reads when initialBoard changes.
  const initialBoardRef = React.useRef(initialBoard)
  initialBoardRef.current = initialBoard

  // Focus the selected cell when it changes, blur when deselected
  // Guard against rapid state changes that cause race conditions with DOM updates
  React.useEffect(() => {
    const isComponentMounted = { current: true }

    if (selectedCell !== null && cellRefs.current[selectedCell]) {
      // Use requestAnimationFrame to ensure DOM has updated before focusing
      const animationFrameId = requestAnimationFrame(() => {
        if (isComponentMounted.current) {
          cellRefs.current[selectedCell]?.focus()
        }
      })

      return () => {
        cancelAnimationFrame(animationFrameId)
        isComponentMounted.current = false
      }
    } else if (selectedCell === null) {
      // When cell is deselected, blur any focused cell
      const activeElement = document.activeElement
      if (activeElement && 'blur' in activeElement) {
        const animationFrameId = requestAnimationFrame(() => {
          if (isComponentMounted.current) {
            ;(activeElement as HTMLElement).blur()
          }
        })

        return () => {
          cancelAnimationFrame(animationFrameId)
          isComponentMounted.current = false
        }
      }
    }

    return () => {
      isComponentMounted.current = false
    }
  }, [selectedCell])

  // Memoize the set of incorrect cells for efficient lookup
  const incorrectCellsSet = React.useMemo(() => new Set(incorrectCells), [incorrectCells])

  // Memoize the set of cells that have the highlighted digit
  // This ensures React properly tracks changes to candidates and triggers re-renders
  // candidatesVersion ensures this recomputes even when Uint16Array reference comparison fails
  const cellsWithHighlightedDigit = React.useMemo(() => {
    // Use candidatesVersion to force recomputation when candidates change
    // (Uint16Array mutations may not trigger re-renders on mobile without this)
    void candidatesVersion

    const result = new Set<number>()
    if (highlightedDigit === null) return result

    for (let idx = 0; idx < 81; idx++) {
      // Check if cell is filled with the highlighted digit
      if (board[idx] === highlightedDigit) {
        result.add(idx)
        continue
      }
      // Check if cell has the highlighted digit as a candidate
      const cellCandidates = candidates[idx]
      if (cellCandidates !== undefined && hasCandidate(cellCandidates, highlightedDigit)) {
        result.add(idx)
      }
    }
    return result
    // Note: candidatesVersion is intentionally included to force recomputation when Uint16Array mutates
    // (mutation is not detected by reference comparison on mobile devices)
  }, [board, candidates, highlightedDigit, candidatesVersion])

  // Find next non-given cell in a direction, returns null if none found
  // Reads from initialBoardRef to get latest value without stale closures
  const findNextNonGivenCell = useCallback(
    (startIdx: number, direction: 'up' | 'down' | 'left' | 'right'): number | null => {
      const currentInitialBoard = initialBoardRef.current
      let row = Math.floor(startIdx / 9)
      let col = startIdx % 9

      const move = () => {
        switch (direction) {
          case 'up':
            row--
            break
          case 'down':
            row++
            break
          case 'left':
            col--
            break
          case 'right':
            col++
            break
        }
      }

      const isValid = () => row >= 0 && row < 9 && col >= 0 && col < 9

      move()
      while (isValid()) {
        const idx = row * 9 + col
        if (currentInitialBoard[idx] === 0) {
          return idx
        }
        move()
      }
      return null
    },
    [],
  ) // No deps needed - reads from ref

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, idx: number) => {
      const currentInitialBoard = initialBoardRef.current
      const isGiven = currentInitialBoard[idx] !== 0

      // Arrow navigation: find the next non-given cell in the direction,
      // select it, and move focus synchronously (the selectedCell RAF effect
      // is too slow for rapid/directed arrows and lets the origin re-fire).
      const moveSelection = (direction: 'up' | 'down' | 'left' | 'right') => {
        e.preventDefault()
        const nextCell = findNextNonGivenCell(idx, direction)
        if (nextCell !== null) {
          onCellClick(nextCell)
          cellRefs.current[nextCell]?.focus()
        }
      }

      // Arrow key navigation - skip over givens
      switch (e.key) {
        case 'ArrowUp':
          moveSelection('up')
          break
        case 'ArrowDown':
          moveSelection('down')
          break
        case 'ArrowLeft':
          moveSelection('left')
          break
        case 'ArrowRight':
          moveSelection('right')
          break
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          e.preventDefault()
          if (!isGiven && onCellChange) {
            onCellChange(idx, parseInt(e.key, 10))
          }
          break
        case 'Backspace':
        case 'Delete': {
          e.preventDefault()
          if (!isGiven && onCellChange) {
            onCellChange(idx, 0)
          }
          break
        }
        case 'Enter':
        case ' ':
          e.preventDefault()
          onCellClick(idx)
          break
      }
    },
    [findNextNonGivenCell, onCellClick, onCellChange],
  ) // No initialBoard dep - reads from ref

  const getCellAriaLabel = (idx: number): string => {
    const row = Math.floor(idx / 9)
    const col = idx % 9
    const value = board[idx]
    const isGiven = initialBoard[idx] !== 0

    const position = `Row ${row + 1}, Column ${col + 1}`
    if (value === 0) {
      return `${position}, empty`
    }
    const givenText = isGiven ? ', given' : ''
    return `${position}, value ${value}${givenText}`
  }
  // Compute duplicates - memoized to avoid expensive recomputation on every render
  const duplicates = React.useMemo(() => findDuplicates(board), [board])

  const isHighlightedPrimary = (row: number, col: number): boolean => {
    if (!highlight) return false
    const inPrimary = highlight.highlights.primary.some((h) => h.row === row && h.col === col)
    if (!inPrimary) return false

    // Always highlight filled cells
    const idx = row * 9 + col
    if (board[idx] !== 0) return true

    // For empty cells, only highlight if the cell still has the relevant candidate
    // If no specific digit or user move, keep the highlight
    if (!highlight.digit || highlight.digit === 0 || highlight.isUserMove) return true

    return hasCandidate(candidates[idx] || 0, highlight.digit)
  }

  const isHighlightedSecondary = (row: number, col: number): boolean => {
    if (!highlight) return false

    const idx = row * 9 + col
    const isFilled = board[idx] !== 0

    // Helper to check if cell should still be highlighted based on candidate
    const shouldHighlight = (digit?: number): boolean => {
      // Always highlight filled cells
      if (isFilled) return true
      // If no specific digit or user move, keep highlight
      if (!digit || digit === 0 || highlight.isUserMove) return true
      // For empty cells, only highlight if cell still has relevant candidate
      return hasCandidate(candidates[idx] || 0, digit)
    }

    // Check explicit secondary highlights (these are part of technique pattern, always show)
    if (highlight.highlights.secondary?.some((h) => h.row === row && h.col === col)) {
      return shouldHighlight(highlight.digit)
    }

    // In technique hint mode (showAnswer: false), highlight ALL involved cells
    // In regular hint mode (showAnswer: true), also highlight eliminations and targets
    const showAnswer = highlight.showAnswer !== false

    if (showAnswer) {
      // Regular hint mode: highlight elimination cells as secondary (check specific elimination digit)
      const elimination = highlight.eliminations?.find((e) => e.row === row && e.col === col)
      if (elimination) {
        return shouldHighlight(elimination.digit)
      }
      // Highlight targets as secondary if not already primary
      if (
        highlight.targets?.some((t) => t.row === row && t.col === col) &&
        !isHighlightedPrimary(row, col)
      ) {
        return shouldHighlight(highlight.digit)
      }
    } else {
      // Technique hint mode: highlight all involved cells
      // Elimination cells (where candidates are removed)
      const elimination = highlight.eliminations?.find((e) => e.row === row && e.col === col)
      if (elimination) {
        return shouldHighlight(elimination.digit)
      }
      // Target cells (where digits are placed or added)
      if (
        highlight.targets?.some((t) => t.row === row && t.col === col) &&
        !isHighlightedPrimary(row, col)
      ) {
        return shouldHighlight(highlight.digit)
      }
    }
    return false
  }

  // Check if cell contains the highlighted digit (either filled or as candidate)
  // Uses the memoized set for proper React dependency tracking
  const cellHasHighlightedDigit = (idx: number): boolean => {
    return cellsWithHighlightedDigit.has(idx)
  }

  // Check if cell is a peer of any selected cell (same row, column, or box)
  const isPeerOfSelected = (idx: number): boolean => {
    // Determine which cells to check peers against
    const cellsToCheck =
      selectedCells.size > 0
        ? selectedCells
        : selectedCell !== null
          ? new Set([selectedCell])
          : null
    if (!cellsToCheck || cellsToCheck.size === 0) return false
    if (cellsToCheck.has(idx)) return false // Don't count self as peer

    const row = Math.floor(idx / 9)
    const col = idx % 9
    const boxRow = Math.floor(row / 3)
    const boxCol = Math.floor(col / 3)

    for (const selIdx of cellsToCheck) {
      const selRow = Math.floor(selIdx / 9)
      const selCol = selIdx % 9
      // Same row
      if (row === selRow) return true
      // Same column
      if (col === selCol) return true
      // Same box
      if (boxRow === Math.floor(selRow / 3) && boxCol === Math.floor(selCol / 3)) return true
    }

    return false
  }

  // Check if a cell index is part of the active multi-selection.
  // Both the primary selectedCell and other selectedCells members participate
  // in the unified selection rectangle when multiple cells are selected.
  const isInMultiSelection = (idx: number): boolean => {
    return selectedCells.size > 1 && selectedCells.has(idx)
  }

  // Multi-selection outline: adjacent selected cells form a unified accent
  // rectangle, so interior shared edges are dropped and only outer edges boxed.
  const multiSelectionClasses = (idx: number, row: number, col: number): string[] => {
    const hasRight = col < 8 && isInMultiSelection(idx + 1)
    const hasBelow = row < 8 && isInMultiSelection(idx + 9)
    const hasLeft = col > 0 && isInMultiSelection(idx - 1)
    const hasAbove = row > 0 && isInMultiSelection(idx - 9)
    const classes = ['multi-selected']
    if (!hasRight && col < 8) classes.push('border-r-2 border-r-accent')
    if (!hasBelow && row < 8) classes.push('border-b-2 border-b-accent')
    if (!hasLeft) classes.push('border-l-2 border-l-accent')
    if (!hasAbove) classes.push('border-t-2 border-t-accent')
    return classes
  }

  // Standard grid borders: thick lines at the 3x3 boundaries, light elsewhere.
  const normalBorderClasses = (row: number, col: number): string[] => {
    const classes: string[] = []
    if (col === 2 || col === 5) classes.push('border-r-2 border-r-board-border')
    else if (col < 8) classes.push('border-r border-r-board-border-light')
    if (row === 2 || row === 5) classes.push('border-b-2 border-b-board-border')
    else if (row < 8) classes.push('border-b border-b-board-border-light')
    return classes
  }

  // Background color by precedence: error states first, then highlights, then
  // selection/digit-match/peer/given/plain.
  const backgroundClass = (
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
      const isTechniqueHint = highlight?.showAnswer === false
      const isExplicitSecondary = highlight?.highlights.secondary?.some(
        (h) => h.row === row && h.col === col,
      )
      return isTechniqueHint && !isExplicitSecondary ? 'bg-cell-primary' : 'bg-cell-secondary'
    }
    if (isSelected || inMultiSel) return 'bg-cell-selected'
    if (hasDigitMatch) return 'bg-accent-light'
    if (isPeer) return 'bg-cell-peer'
    return isGiven ? 'bg-cell-given' : 'bg-cell-bg'
  }

  // Text color by precedence: error > highlight > given > entered.
  const textClass = (
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

  const getCellClass = (idx: number): string => {
    const row = Math.floor(idx / 9)
    const col = idx % 9
    const isGiven = initialBoard[idx] !== 0
    const isSelected = selectedCell === idx
    const inMultiSel = isInMultiSelection(idx)
    const isPrimary = isHighlightedPrimary(row, col)
    const isSecondary = isHighlightedSecondary(row, col)
    const isDuplicate = duplicates.has(idx)
    const hasDigitMatch = cellHasHighlightedDigit(idx)
    const isPeer = isPeerOfSelected(idx)
    const isIncorrect = incorrectCellsSet.has(idx)

    const classes: string[] = ['sudoku-cell']

    if (inMultiSel) {
      classes.push(...multiSelectionClasses(idx, row, col))
      // Ring only for incorrect cells in multi-select (keeps the box continuous).
      if (isIncorrect) classes.push('ring-2 ring-inset ring-error-text z-10')
    } else {
      classes.push(...normalBorderClasses(row, col))
      if (isIncorrect) classes.push('ring-2 ring-inset ring-error-text z-10')
      else if (isSelected) classes.push('ring-2 ring-inset ring-accent z-10')
    }

    classes.push(
      backgroundClass(
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

    if (idx === focusedCell) {
      classes.push('cell-focused outline outline-2 outline-offset-[-1px] outline-accent')
    }

    return classes.join(' ')
  }

  // REMOVED: renderCell function - now handled inside Cell component

  // Pre-compute all 81 cell data objects for memoization
  // This runs once per Board render (not per cell), and each cell only
  // re-renders if its specific CellData object changes
  const cellDataArray = useMemo((): CellData[] => {
    const result: CellData[] = []
    for (let idx = 0; idx < 81; idx++) {
      const row = Math.floor(idx / 9)
      const col = idx % 9
      const isGiven = initialBoard[idx] !== 0
      const isPrimary = isHighlightedPrimary(row, col)
      const isSecondary = isHighlightedSecondary(row, col)
      const isTarget = highlight?.targets?.some((t) => t.row === row && t.col === col) ?? false

      result.push({
        idx,
        value: board[idx] ?? 0,
        cellCandidates: candidates[idx] || 0,
        isGiven,
        isSelected: selectedCell === idx,
        tabIndex: idx === tabStopCell ? 0 : -1,
        isMultiSelected: selectedCells.has(idx) && selectedCell !== idx,
        className: getCellClass(idx),
        ariaLabel: getCellAriaLabel(idx),
        highlightedDigit,
        isPrimary,
        isSecondary,
        isTarget,
        eliminations: highlight?.eliminations,
        showAnswer: highlight?.showAnswer !== false, // Default to true for backward compatibility
        targetDigit: highlight?.digit, // Pass the hint's digit for candidate highlighting
      })
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Helper functions (getCellClass, etc.) read from state vars already in deps; adding them would cause unnecessary recreations
  }, [
    board,
    candidates,
    candidatesVersion,
    initialBoard,
    selectedCell,
    selectedCells,
    highlightedDigit,
    highlight,
    duplicates,
    incorrectCellsSet,
    cellsWithHighlightedDigit,
    focusedCell,
    tabStopCell,
  ])

  // Stable callback for cell clicks - doesn't change between renders
  const handleCellClick = useCallback(
    (idx: number) => {
      // After a multi-cell drag, the browser synthesizes a click event.
      // Suppress it so the multi-select state is not overwritten.
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false
        return
      }
      onCellClick(idx)
    },
    [onCellClick],
  )

  // Stable callback for keyboard events
  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, idx: number) => {
      handleKeyDown(e, idx)
    },
    [handleKeyDown],
  )

  // Drag handlers for multi-select feature
  const handleDragStart = useCallback(
    (idx: number) => {
      // Skip starting drag on given or filled cells
      if (initialBoard[idx] !== 0 || board[idx] !== 0) {
        return
      }
      isDraggingRef.current = true
      dragStartCellRef.current = idx
      // Initialize ordered trail with the start cell
      dragTrailRef.current = [idx]
      dragTrailSetRef.current = new Set([idx])
      // Record the start cell so handleBoardPointerMove skips redundant
      // handleDragEnter calls when the pointer stays on the same cell
      // (prevents selectMultipleCells from firing on a simple tap)
      lastEnteredCellRef.current = idx
    },
    [initialBoard, board],
  )

  const handleDragEnter = useCallback(
    (idx: number) => {
      if (!isDraggingRef.current || dragStartCellRef.current === null) return

      // If pointer moved to a different cell than the drag start, this is a real
      // multi-cell drag: suppress the click event that browser synthesizes after
      // pointerup to avoid overwriting the multi-select state.
      if (idx !== dragStartCellRef.current) {
        suppressNextClickRef.current = true
      }

      const trail = dragTrailRef.current
      const trailSet = dragTrailSetRef.current

      if (trailSet.has(idx)) {
        backtrackTrail(trail, trailSet, idx)
      } else {
        extendTrailForward(trail, trailSet, idx, dragStartCellRef.current, initialBoard, board)
      }

      // Update selection from the current trail
      if (onCellSelectMultiple) {
        onCellSelectMultiple([...trail])
      }
    },
    [initialBoard, board, onCellSelectMultiple],
  )

  const handleDragEnd = useCallback(() => {
    // Notify parent with the final set of selected cells before clearing trail
    if (onDragEndProp && dragTrailRef.current.length > 1) {
      onDragEndProp([...dragTrailRef.current])
    }
    isDraggingRef.current = false
    dragStartCellRef.current = null
    lastEnteredCellRef.current = null
    dragTrailRef.current = []
    dragTrailSetRef.current = new Set()
    // Safety net: clear the suppress flag after the current event cycle so that
    // a stale flag cannot block future clicks (e.g., if pointercancel fires instead
    // of a click). The click event fires synchronously after pointerup in the same
    // task, so it sees the flag before this timeout clears it.
    if (suppressNextClickRef.current) {
      setTimeout(() => {
        suppressNextClickRef.current = false
      }, 0)
    }
  }, [onDragEndProp])

  // Track the last cell the pointer entered to avoid redundant handleDragEnter calls
  const lastEnteredCellRef = React.useRef<number | null>(null)

  // Board-level pointer move handler: resolves which cell the pointer is over
  // using elementFromPoint. Works for both mouse and touch (pointer events unify both).
  const handleBoardPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return

      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el) return

      // Walk up to find the cell element with data-cell-idx
      const cellEl = (el as HTMLElement).closest(CELL_SELECTOR)
      if (!cellEl) return

      const idx = Number(cellEl.getAttribute(DATA_CELL_IDX))
      if (Number.isNaN(idx) || idx === lastEnteredCellRef.current) return

      // handleDragEnter reads lastEnteredCellRef to bridge from the previous
      // cell, so call it BEFORE updating the ref to the new cell.
      handleDragEnter(idx)
      lastEnteredCellRef.current = idx
    },
    [handleDragEnter],
  )

  // Board-level pointer up handler
  const handleBoardPointerUp = useCallback(() => {
    handleDragEnd()
  }, [handleDragEnd])

  const handleGridFocus = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.hasAttribute(DATA_CELL_IDX)) {
      const idx = Number(target.getAttribute(DATA_CELL_IDX))
      if (!Number.isNaN(idx)) setFocusedCell(idx)
    }
  }, [])

  const handleGridBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as HTMLElement | null
    if (!related || !related.hasAttribute(DATA_CELL_IDX)) {
      setFocusedCell(null)
    }
  }, [])

  // Stable ref callback factory - returns the same function for each cell index
  const cellRefCallbacks = useMemo(() => {
    const callbacks: ((el: HTMLDivElement | null) => void)[] = []
    for (let i = 0; i < 81; i++) {
      callbacks.push((el: HTMLDivElement | null) => {
        cellRefs.current[i] = el
      })
    }
    return callbacks
  }, []) // Empty deps - callbacks never change

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
