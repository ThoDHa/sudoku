import React, { memo } from 'react'
import { hasCandidate, countCandidates } from '../lib/candidatesUtils'

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
}

interface BoardProps {
  board: number[]
  initialBoard: number[]
  candidates: Uint16Array
  /** Version counter for candidates - ensures React detects changes to Uint16Array */
  candidatesVersion?: number
  selectedCell: number | null
  highlightedDigit: number | null
  highlight: Move | null
  onCellClick: (idx: number) => void
  onCellChange?: (idx: number, value: number) => void
  /** Cells that contain incorrect values (compared to the solution) */
  incorrectCells?: number[]
}

// Find all cells that have duplicate values in their row, column, or box
function findDuplicates(board: number[]): Set<number> {
  const duplicates = new Set<number>()

  // Check rows
  for (let row = 0; row < 9; row++) {
    const seen = new Map<number, number[]>()
    for (let col = 0; col < 9; col++) {
      const idx = row * 9 + col
      const val = board[idx] ?? 0
      if (val !== 0) {
        if (!seen.has(val)) {
          seen.set(val, [])
        }
        seen.get(val)?.push(idx)
      }
    }
    seen.forEach((indices) => {
      if (indices.length > 1) {
        indices.forEach((i) => duplicates.add(i))
      }
    })
  }

  // Check columns
  for (let col = 0; col < 9; col++) {
    const seen = new Map<number, number[]>()
    for (let row = 0; row < 9; row++) {
      const idx = row * 9 + col
      const val = board[idx] ?? 0
      if (val !== 0) {
        if (!seen.has(val)) {
          seen.set(val, [])
        }
        seen.get(val)?.push(idx)
      }
    }
    seen.forEach((indices) => {
      if (indices.length > 1) {
        indices.forEach((i) => duplicates.add(i))
      }
    })
  }

  // Check boxes
  for (let box = 0; box < 9; box++) {
    const boxRow = Math.floor(box / 3) * 3
    const boxCol = (box % 3) * 3
    const seen = new Map<number, number[]>()
    for (let r = boxRow; r < boxRow + 3; r++) {
      for (let c = boxCol; c < boxCol + 3; c++) {
        const idx = r * 9 + c
        const val = board[idx] ?? 0
        if (val !== 0) {
          if (!seen.has(val)) {
            seen.set(val, [])
          }
          seen.get(val)?.push(idx)
        }
      }
    }
    seen.forEach((indices) => {
      if (indices.length > 1) {
        indices.forEach((i) => duplicates.add(i))
      }
    })
  }

  return duplicates
}

const Board = memo(function Board({
  board,
  initialBoard,
  candidates,
  candidatesVersion,
  selectedCell,
  highlightedDigit,
  highlight,
  onCellClick,
  onCellChange,
  incorrectCells = [],
}: BoardProps) {
  const cellRefs = React.useRef<(HTMLDivElement | null)[]>([])

  // Focus the selected cell when it changes
  React.useEffect(() => {
    if (selectedCell !== null && cellRefs.current[selectedCell]) {
      cellRefs.current[selectedCell]?.focus()
    }
  }, [selectedCell])

  // Memoize the set of incorrect cells for efficient lookup
  const incorrectCellsSet = React.useMemo(() => new Set(incorrectCells), [incorrectCells])

  // Memoize the set of cells that have the highlighted digit
  // This ensures React properly tracks changes to candidates and triggers re-renders
  // candidatesVersion ensures this recomputes even when Uint16Array reference comparison fails
  const cellsWithHighlightedDigit = React.useMemo(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, candidates, highlightedDigit, candidatesVersion])

  // Find next non-given cell in a direction, returns null if none found
  const findNextNonGivenCell = (startIdx: number, direction: 'up' | 'down' | 'left' | 'right'): number | null => {
    let row = Math.floor(startIdx / 9)
    let col = startIdx % 9
    
    const move = () => {
      switch (direction) {
        case 'up': row--; break
        case 'down': row++; break
        case 'left': col--; break
        case 'right': col++; break
      }
    }
    
    const isValid = () => row >= 0 && row < 9 && col >= 0 && col < 9
    
    move()
    while (isValid()) {
      const idx = row * 9 + col
      if (initialBoard[idx] === 0) {
        return idx
      }
      move()
    }
    return null
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, idx: number) => {
    const isGiven = initialBoard[idx] !== 0

    // Arrow key navigation - skip over givens
    switch (e.key) {
      case 'ArrowUp': {
        e.preventDefault()
        const nextCell = findNextNonGivenCell(idx, 'up')
        if (nextCell !== null) onCellClick(nextCell)
        break
      }
      case 'ArrowDown': {
        e.preventDefault()
        const nextCell = findNextNonGivenCell(idx, 'down')
        if (nextCell !== null) onCellClick(nextCell)
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        const nextCell = findNextNonGivenCell(idx, 'left')
        if (nextCell !== null) onCellClick(nextCell)
        break
      }
      case 'ArrowRight': {
        e.preventDefault()
        const nextCell = findNextNonGivenCell(idx, 'right')
        if (nextCell !== null) onCellClick(nextCell)
        break
      }
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
      case 'Delete':
        e.preventDefault()
        if (!isGiven && onCellChange) {
          onCellChange(idx, 0)
        }
        break
    }
  }

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
    const inPrimary = highlight.highlights.primary.some(
      (h) => h.row === row && h.col === col
    )
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
      // If no specific digit or user move, keep the highlight
      if (!digit || digit === 0 || highlight.isUserMove) return true
      // For empty cells, only highlight if the cell still has the relevant candidate
      return hasCandidate(candidates[idx] || 0, digit)
    }
    
    // Check explicit secondary highlights
    if (highlight.highlights.secondary?.some((h) => h.row === row && h.col === col)) {
      return shouldHighlight(highlight.digit)
    }
    // Also highlight elimination cells as secondary (check specific elimination digit)
    const elimination = highlight.eliminations?.find((e) => e.row === row && e.col === col)
    if (elimination) {
      return shouldHighlight(elimination.digit)
    }
    // Highlight targets as secondary if not already primary
    if (highlight.targets?.some((t) => t.row === row && t.col === col) && 
        !isHighlightedPrimary(row, col)) {
      return shouldHighlight(highlight.digit)
    }
    return false
  }

  // Check if cell contains the highlighted digit (either filled or as candidate)
  // Uses the memoized set for proper React dependency tracking
  const cellHasHighlightedDigit = (idx: number): boolean => {
    return cellsWithHighlightedDigit.has(idx)
  }

  // Check if cell is a peer of the selected cell (same row, column, or box)
  const isPeerOfSelected = (idx: number): boolean => {
    if (selectedCell === null) return false
    if (idx === selectedCell) return false // Don't count self as peer
    
    const selectedRow = Math.floor(selectedCell / 9)
    const selectedCol = selectedCell % 9
    const row = Math.floor(idx / 9)
    const col = idx % 9
    
    // Same row
    if (row === selectedRow) return true
    // Same column
    if (col === selectedCol) return true
    // Same box
    const selectedBoxRow = Math.floor(selectedRow / 3)
    const selectedBoxCol = Math.floor(selectedCol / 3)
    const boxRow = Math.floor(row / 3)
    const boxCol = Math.floor(col / 3)
    if (boxRow === selectedBoxRow && boxCol === selectedBoxCol) return true
    
    return false
  }

  const getCellClass = (idx: number): string => {
    const row = Math.floor(idx / 9)
    const col = idx % 9
    const isGiven = initialBoard[idx] !== 0
    const isSelected = selectedCell === idx
    const isPrimary = isHighlightedPrimary(row, col)
    const isSecondary = isHighlightedSecondary(row, col)
    const isDuplicate = duplicates.has(idx)
    const hasDigitMatch = cellHasHighlightedDigit(idx)
    const isPeer = isPeerOfSelected(idx)
    const isIncorrect = incorrectCellsSet.has(idx)

    // Start with base CSS class
    const classes = ['sudoku-cell']

    // Borders - using theme colors
    if (col === 2 || col === 5) {
      classes.push('border-r-2 border-r-board-border')
    } else if (col < 8) {
      classes.push('border-r border-r-board-border-light')
    }

    if (row === 2 || row === 5) {
      classes.push('border-b-2 border-b-board-border')
    } else if (row < 8) {
      classes.push('border-b border-b-board-border-light')
    }

    // Incorrect cells get a red ring
    // Incorrect cells get an error ring
    if (isIncorrect) {
      classes.push('ring-2 ring-inset ring-error-text z-10')
    } else if (isSelected) {
      // Selected cell gets a prominent ring
      classes.push('ring-2 ring-inset ring-accent z-10')
    }

    // Background priority: incorrect > duplicate > selected > primary > secondary > digit match > peer > default
    if (isIncorrect) {
      classes.push('bg-error-bg')
    } else if (isDuplicate) {
      classes.push('bg-error-bg')
    } else if (isPrimary) {
      classes.push('bg-cell-primary')
    } else if (isSecondary) {
      classes.push('bg-cell-secondary')
    } else if (isSelected) {
      classes.push('bg-cell-selected')
    } else if (hasDigitMatch) {
      classes.push('bg-accent-light')
    } else if (isPeer) {
      classes.push('bg-cell-peer')
    } else if (isGiven) {
      classes.push('bg-cell-given')
    } else {
      classes.push('bg-cell-bg')
    }

    // Text color - incorrect and duplicates get error text
    if (isIncorrect) {
      classes.push('text-error-text')
    } else if (isDuplicate) {
      classes.push('text-error-text')
    } else if (isGiven) {
      classes.push('text-cell-text-given')
    } else {
      classes.push('text-cell-text-entered')
    }

    return classes.join(' ')
  }

  const renderCell = (idx: number) => {
    const row = Math.floor(idx / 9)
    const col = idx % 9
    const value = board[idx]
    const cellCandidates = candidates[idx] || 0

    // Filled cell
    if (value !== 0) {
      const isHighlighted = highlightedDigit === value
      return (
        <span className={isHighlighted ? 'text-accent font-bold' : ''}>
          {value}
        </span>
      )
    }

    if (cellCandidates && countCandidates(cellCandidates) > 0) {
      // Check if this cell is highlighted (primary or secondary)
      const isPrimary = isHighlightedPrimary(row, col)
      const isSecondary = isHighlightedSecondary(row, col)
      const isHighlightedCell = isPrimary || isSecondary
      
      // Check if this cell is a target
      const isTarget = highlight?.targets?.some(
        (t) => t.row === row && t.col === col
      )
      
      // For single-digit techniques, highlight.digit tells us which digit
      // For multi-digit techniques (pairs, triples), digit is 0 and we check eliminations
      const singleDigit = highlight?.digit && highlight.digit > 0 ? highlight.digit : null

      return (
        <div className="candidate-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
            const hasCandidate_ = hasCandidate(cellCandidates, d)
            
            // Check if this specific digit in this cell is being eliminated
            const isEliminated = highlight?.eliminations?.some(
              (e) => e.row === row && e.col === col && e.digit === d
            )
            
            // Check if this digit is the relevant one for highlighting
            // For single-digit techniques: only highlight if d matches the technique's digit
            // For multi-digit techniques: highlight all candidates in target cells
            const isRelevantDigit = singleDigit ? d === singleDigit : isTarget
            
            // Determine styling for this specific candidate
            let digitClass = "candidate-digit "
            
            if (hasCandidate_ && isEliminated) {
              // This candidate is being eliminated - show with error color and strikethrough
              digitClass += "text-error-text line-through font-bold"
            } else if (hasCandidate_ && isRelevantDigit && isTarget) {
              // This candidate is relevant to the technique - use contrasting color on highlighted bg
              digitClass += isHighlightedCell
                ? "text-cell-text-on-highlight font-bold"
                : "text-accent font-bold"
            } else if (isHighlightedCell) {
              // Normal candidate on highlighted background - use contrasting color
              digitClass += "text-cell-text-on-highlight"
            } else {
              // Normal candidate - always the same color regardless of digit selection
              digitClass += "text-cell-text-candidate"
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

    return null
  }

  return (
    <div className="sudoku-board aspect-square w-full max-h-full" role="grid" aria-label="Sudoku puzzle">
      {Array.from({ length: 9 }, (_, rowIdx) => (
        <div key={rowIdx} role="row" className="contents">
          {Array.from({ length: 9 }, (_, colIdx) => {
            const idx = rowIdx * 9 + colIdx
            const isGiven = initialBoard[idx] !== 0
            return (
              <div
                key={idx}
                ref={(el) => { cellRefs.current[idx] = el }}
                role="gridcell"
                tabIndex={selectedCell === idx ? 0 : -1}
                aria-label={getCellAriaLabel(idx)}
                className={getCellClass(idx)}
                onClick={() => onCellClick(idx)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                style={isGiven ? { cursor: 'default' } : undefined}
              >
                {renderCell(idx)}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
})

export default Board
