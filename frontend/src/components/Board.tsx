import React from 'react'
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
  selectedCell: number | null
  highlightedDigit: number | null
  highlight: Move | null
  onCellClick: (idx: number) => void
  onCellChange?: (idx: number, value: number) => void
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
        seen.get(val)!.push(idx)
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
        seen.get(val)!.push(idx)
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
          seen.get(val)!.push(idx)
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

export default function Board({
  board,
  initialBoard,
  candidates,
  selectedCell,
  highlightedDigit,
  highlight,
  onCellClick,
  onCellChange,
}: BoardProps) {
  const cellRefs = React.useRef<(HTMLDivElement | null)[]>([])

  // Focus the selected cell when it changes
  React.useEffect(() => {
    if (selectedCell !== null && cellRefs.current[selectedCell]) {
      cellRefs.current[selectedCell]?.focus()
    }
  }, [selectedCell])

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
  const cellHasHighlightedDigit = (idx: number): boolean => {
    if (highlightedDigit === null) return false
    if (board[idx] === highlightedDigit) return true
    if (candidates[idx] !== undefined && hasCandidate(candidates[idx], highlightedDigit)) return true
    return false
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
    let isPrimary = isHighlightedPrimary(row, col)
    let isSecondary = isHighlightedSecondary(row, col)
    const isDuplicate = duplicates.has(idx)
    const hasDigitMatch = cellHasHighlightedDigit(idx)
    const isPeer = isPeerOfSelected(idx)

    // Start with base CSS class
    const classes = ['sudoku-cell']

    // Borders - using theme colors
    if (col === 2 || col === 5) {
      classes.push('border-r-2 border-r-[var(--border-strong)]')
    } else if (col < 8) {
      classes.push('border-r border-r-[var(--border-light)]')
    }

    if (row === 2 || row === 5) {
      classes.push('border-b-2 border-b-[var(--border-strong)]')
    } else if (row < 8) {
      classes.push('border-b border-b-[var(--border-light)]')
    }

    // Selected cell gets a prominent ring
    if (isSelected) {
      classes.push('ring-2 ring-inset ring-[var(--accent)] z-10')
    }

    // Background priority: duplicate > selected > primary > secondary > digit match > peer > default
    if (isDuplicate) {
      classes.push('bg-[var(--duplicate-bg-light)] dark:bg-[var(--duplicate-bg-dark)]')
    } else if (isPrimary) {
      classes.push('bg-[var(--cell-primary)]')
    } else if (isSecondary) {
      classes.push('bg-[var(--cell-secondary)]')
    } else if (isSelected) {
      classes.push('bg-[var(--cell-selected)]')
    } else if (hasDigitMatch) {
      classes.push('bg-[var(--accent-light)]')
    } else if (isPeer) {
      classes.push('bg-[var(--cell-peer)]')
    } else {
      classes.push('bg-[var(--cell-bg)] hover:bg-[var(--cell-hover)]')
    }

    // Text color - duplicates get red text
    if (isDuplicate) {
      classes.push('text-[var(--duplicate-text-light)] dark:text-[var(--duplicate-text-dark)]')
    } else if (isGiven) {
      classes.push('text-[var(--text-given)]')
    } else {
      classes.push('text-[var(--text-entered)]')
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
        <span className={isHighlighted ? 'text-[var(--accent)] font-bold' : ''}>
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
            
            // Check if this candidate matches the user's highlighted digit
            const isUserHighlighted = highlightedDigit === d && hasCandidate_
            
            // Determine styling for this specific candidate
            let digitClass = "candidate-digit "
            
            if (hasCandidate_ && isEliminated) {
              // This candidate is being eliminated - show in red with strikethrough
              // Use darker red on highlighted backgrounds for contrast
              digitClass += isHighlightedCell 
                ? "text-red-700 dark:text-red-200 line-through font-bold"
                : "text-[var(--elimination-text-light)] dark:text-[var(--elimination-text-dark)] line-through font-bold"
            } else if (hasCandidate_ && isRelevantDigit && isTarget) {
              // This candidate is relevant to the technique - use contrasting color on highlighted bg
              digitClass += isHighlightedCell
                ? "text-white dark:text-gray-900 font-bold drop-shadow-sm"
                : "text-[var(--accent)] font-bold"
            } else if (isUserHighlighted) {
              // User has this digit selected - show in accent color
              digitClass += "text-[var(--accent)] font-bold"
            } else if (isHighlightedCell) {
              // Normal candidate on highlighted background - use contrasting color
              digitClass += "text-gray-700 dark:text-gray-100"
            } else {
              // Normal candidate
              digitClass += "text-[var(--text-candidate)]"
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
    <div className="sudoku-board" role="grid" aria-label="Sudoku puzzle">
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
                onClick={() => !isGiven && onCellClick(idx)}
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
}
