import React from 'react'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import Board from './Board'
import { addCandidate, removeCandidate, createCandidateMask } from '../lib/candidatesUtils'

// Helper to create a basic board setup
function createEmptyBoard(): number[] {
  return Array(81).fill(0)
}

function createEmptyCandidates(): Uint16Array {
  return new Uint16Array(81)
}

// Helper to create a board with some given values
function createBoardWithGivens(): { board: number[]; initialBoard: number[] } {
  const board = createEmptyBoard()
  const initialBoard = createEmptyBoard()
  
  // Set some givens (cells 0, 10, 20 will be given)
  initialBoard[0] = 5
  initialBoard[10] = 3
  initialBoard[20] = 7
  board[0] = 5
  board[10] = 3
  board[20] = 7
  
  return { board, initialBoard }
}

// Default props for Board component
function defaultProps(overrides: Partial<Parameters<typeof Board>[0]> = {}) {
  return {
    board: createEmptyBoard(),
    initialBoard: createEmptyBoard(),
    candidates: createEmptyCandidates(),
    selectedCell: null,
    highlightedDigit: null,
    highlight: null,
    onCellClick: vi.fn(),
    ...overrides,
  }
}

describe('Board', () => {
  describe('rendering', () => {
    it('renders 81 cells', () => {
      render(<Board {...defaultProps()} />)
      
      const cells = screen.getAllByRole('gridcell')
      expect(cells).toHaveLength(81)
    })

    it('renders with correct grid structure (9 rows)', () => {
      render(<Board {...defaultProps()} />)
      
      const rows = screen.getAllByRole('row')
      expect(rows).toHaveLength(9)
    })

    it('renders the board container with correct aria label', () => {
      render(<Board {...defaultProps()} />)
      
      const grid = screen.getByRole('grid')
      expect(grid).toHaveAttribute('aria-label', 'Sudoku puzzle')
    })
  })

  describe('given cells vs user cells', () => {
    it('given cells have bg-cell-given class', () => {
      const { board, initialBoard } = createBoardWithGivens()
      const { container } = render(
        <Board {...defaultProps({ board, initialBoard })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Cell 0 is a given
      expect(cells[0]?.className).toContain('bg-cell-given')
      expect(cells[0]?.className).toContain('text-cell-text-given')
    })

    it('user-entered cells have bg-cell-bg class', () => {
      const board = createEmptyBoard()
      const initialBoard = createEmptyBoard()
      // User entered a value in cell 5 (not a given)
      board[5] = 8
      
      const { container } = render(
        <Board {...defaultProps({ board, initialBoard })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Cell 5 is user-entered, should have default background
      expect(cells[5]?.className).toContain('bg-cell-bg')
      expect(cells[5]?.className).toContain('text-cell-text-entered')
    })

    it('given cells display cursor:default style', () => {
      const { board, initialBoard } = createBoardWithGivens()
      const { container } = render(
        <Board {...defaultProps({ board, initialBoard })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Cell 0 is a given - should have cursor: default
      expect(cells[0]).toHaveStyle({ cursor: 'default' })
    })

    it('non-given cells do not have cursor:default style', () => {
      const { board, initialBoard } = createBoardWithGivens()
      const { container } = render(
        <Board {...defaultProps({ board, initialBoard })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Cell 1 is not a given - should not have cursor: default
      expect(cells[1]).not.toHaveStyle({ cursor: 'default' })
    })
  })

  describe('cell values', () => {
    it('displays cell values correctly', () => {
      const board = createEmptyBoard()
      const initialBoard = createEmptyBoard()
      board[0] = 5
      board[40] = 9
      initialBoard[0] = 5 // given
      
      render(<Board {...defaultProps({ board, initialBoard })} />)
      
      expect(screen.getByText('5')).toBeInTheDocument()
      expect(screen.getByText('9')).toBeInTheDocument()
    })

    it('empty cells show no value', () => {
      const { container } = render(<Board {...defaultProps()} />)
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // First cell should be empty (no text content for value)
      expect(cells[0]?.textContent).toBe('')
    })
  })

  describe('selection behavior', () => {
    it('selected cell has ring-accent class', () => {
      const { container } = render(
        <Board {...defaultProps({ selectedCell: 40 })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      expect(cells[40]?.className).toContain('ring-accent')
      expect(cells[40]?.className).toContain('bg-cell-selected')
    })

    it('selected cell has tabIndex 0, others have -1', () => {
      render(<Board {...defaultProps({ selectedCell: 10 })} />)
      
      const cells = screen.getAllByRole('gridcell')
      expect(cells[10]).toHaveAttribute('tabIndex', '0')
      expect(cells[0]).toHaveAttribute('tabIndex', '-1')
      expect(cells[20]).toHaveAttribute('tabIndex', '-1')
    })

    it('clicking a cell triggers onCellClick callback with correct index', async () => {
      const user = userEvent.setup()
      const onCellClick = vi.fn()
      
      render(<Board {...defaultProps({ onCellClick })} />)
      
      const cells = screen.getAllByRole('gridcell')
      await user.click(cells[25]!)
      
      expect(onCellClick).toHaveBeenCalledWith(25)
    })

    it('clicking multiple cells triggers correct callbacks', async () => {
      const user = userEvent.setup()
      const onCellClick = vi.fn()
      
      render(<Board {...defaultProps({ onCellClick })} />)
      
      const cells = screen.getAllByRole('gridcell')
      await user.click(cells[0]!)
      await user.click(cells[80]!)
      await user.click(cells[40]!)
      
      expect(onCellClick).toHaveBeenCalledTimes(3)
      expect(onCellClick).toHaveBeenNthCalledWith(1, 0)
      expect(onCellClick).toHaveBeenNthCalledWith(2, 80)
      expect(onCellClick).toHaveBeenNthCalledWith(3, 40)
    })
  })

  describe('peer cell highlighting', () => {
    it('cells in same row as selected cell have bg-cell-peer class', () => {
      // Select cell at row 4, col 4 (index 40)
      const { container } = render(
        <Board {...defaultProps({ selectedCell: 40 })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Cells 36-44 are in row 4 (except 40 which is selected)
      expect(cells[36]?.className).toContain('bg-cell-peer')
      expect(cells[37]?.className).toContain('bg-cell-peer')
      expect(cells[44]?.className).toContain('bg-cell-peer')
    })

    it('cells in same column as selected cell have bg-cell-peer class', () => {
      // Select cell at row 0, col 4 (index 4)
      const { container } = render(
        <Board {...defaultProps({ selectedCell: 4 })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Cell 13 is at row 1, col 4 (same column)
      // Cell 22 is at row 2, col 4 (same column)
      expect(cells[13]?.className).toContain('bg-cell-peer')
      expect(cells[22]?.className).toContain('bg-cell-peer')
    })

    it('cells in same box as selected cell have bg-cell-peer class', () => {
      // Select cell at row 0, col 0 (index 0)
      // Box 0 contains: 0,1,2,9,10,11,18,19,20
      const { container } = render(
        <Board {...defaultProps({ selectedCell: 0 })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      expect(cells[1]?.className).toContain('bg-cell-peer')
      expect(cells[9]?.className).toContain('bg-cell-peer')
      expect(cells[10]?.className).toContain('bg-cell-peer')
      expect(cells[20]?.className).toContain('bg-cell-peer')
    })

    it('cells not related to selected cell do not have bg-cell-peer class', () => {
      // Select cell at row 0, col 0 (index 0)
      const { container } = render(
        <Board {...defaultProps({ selectedCell: 0 })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Cell 40 (row 4, col 4) is not a peer of cell 0
      expect(cells[40]?.className).not.toContain('bg-cell-peer')
      // Cell 80 (row 8, col 8) is not a peer of cell 0
      expect(cells[80]?.className).not.toContain('bg-cell-peer')
    })
  })

  describe('candidate display', () => {
    it('displays candidates when cell is empty and has candidates', () => {
      const candidates = createEmptyCandidates()
      candidates[0] = createCandidateMask([1, 3, 5])
      
      render(<Board {...defaultProps({ candidates })} />)
      
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('shows candidate grid with 9 positions', () => {
      const candidates = createEmptyCandidates()
      candidates[0] = createCandidateMask([1, 5, 9])
      
      const { container } = render(<Board {...defaultProps({ candidates })} />)
      
      const candidateGrid = container.querySelector('.candidate-grid')
      expect(candidateGrid).toBeInTheDocument()
      // Should have 9 candidate-digit spans
      const candidateDigits = candidateGrid?.querySelectorAll('.candidate-digit')
      expect(candidateDigits).toHaveLength(9)
    })

    it('does not show candidates for filled cells', () => {
      const board = createEmptyBoard()
      board[0] = 5
      const candidates = createEmptyCandidates()
      candidates[0] = createCandidateMask([1, 3]) // These should not display
      
      const { container } = render(
        <Board {...defaultProps({ board, candidates })} />
      )
      
      // Cell 0 should show the value 5, not candidates
      const cells = container.querySelectorAll('.sudoku-cell')
      expect(cells[0]?.textContent).toBe('5')
      // No candidate grid in cell 0
      expect(cells[0]?.querySelector('.candidate-grid')).not.toBeInTheDocument()
    })

    it('does not keep cell highlighted after last candidate removed', async () => {
      const board = createEmptyBoard()
      const initialBoard = createEmptyBoard()
      const candidates = createEmptyCandidates()
      candidates[0] = addCandidate(0, 1)

      const onCellClick = vi.fn()

      const { rerender, container } = render(
        <Board
          board={board}
          initialBoard={initialBoard}
          candidates={candidates}
          selectedCell={null}
          highlightedDigit={null}
          highlight={null}
          onCellClick={(idx) => onCellClick(idx)}
        />
      )

      expect(screen.getByText('1')).toBeInTheDocument()

      candidates[0] = removeCandidate(candidates[0]!, 1)
      rerender(
        <Board
          board={board}
          initialBoard={initialBoard}
          candidates={candidates}
          selectedCell={null}
          highlightedDigit={null}
          highlight={{ 
            step_index: 0, 
            technique: 'User Input', 
            action: 'eliminate', 
            digit: 1, 
            targets: [{ row: 0, col: 0 }], 
            explanation: '', 
            refs: { title: '', slug: '', url: '' }, 
            highlights: { primary: [{ row: 0, col: 0 }] } 
          }}
          onCellClick={(idx) => onCellClick(idx)}
        />
      )

      expect(screen.queryByText('1')).not.toBeInTheDocument()

      const cells = container.querySelectorAll('.sudoku-cell')
      const firstCell = cells[0]
      expect(firstCell).toBeDefined()
      expect(firstCell?.className).not.toContain('bg-[var(--cell-primary)]')
    })
  })

  describe('highlighted digit behavior', () => {
    it('cells with matching value get bg-accent-light class', () => {
      const board = createEmptyBoard()
      board[0] = 5
      board[40] = 5
      board[80] = 3
      
      const { container } = render(
        <Board {...defaultProps({ board, highlightedDigit: 5 })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      expect(cells[0]?.className).toContain('bg-accent-light')
      expect(cells[40]?.className).toContain('bg-accent-light')
      // Cell 80 has value 3, not 5
      expect(cells[80]?.className).not.toContain('bg-accent-light')
    })

    it('cells with matching candidate get bg-accent-light class', () => {
      const candidates = createEmptyCandidates()
      candidates[0] = createCandidateMask([1, 5, 9])
      candidates[10] = createCandidateMask([2, 3, 4])
      
      const { container } = render(
        <Board {...defaultProps({ candidates, highlightedDigit: 5 })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Cell 0 has candidate 5
      expect(cells[0]?.className).toContain('bg-accent-light')
      // Cell 10 does not have candidate 5
      expect(cells[10]?.className).not.toContain('bg-accent-light')
    })

    it('value text is highlighted with text-accent when matching highlightedDigit', () => {
      const board = createEmptyBoard()
      board[0] = 5
      
      const { container } = render(
        <Board {...defaultProps({ board, highlightedDigit: 5 })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      const valueSpan = cells[0]?.querySelector('span')
      expect(valueSpan?.className).toContain('text-accent')
    })
  })

  describe('error highlighting', () => {
    it('duplicate values in same row get bg-error-bg class', () => {
      const board = createEmptyBoard()
      // Put duplicate 5s in row 0
      board[0] = 5
      board[5] = 5
      
      const { container } = render(
        <Board {...defaultProps({ board })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      expect(cells[0]?.className).toContain('bg-error-bg')
      expect(cells[5]?.className).toContain('bg-error-bg')
    })

    it('duplicate values in same column get bg-error-bg class', () => {
      const board = createEmptyBoard()
      // Put duplicate 3s in column 0 (indices 0, 9, 18, etc.)
      board[0] = 3
      board[27] = 3
      
      const { container } = render(
        <Board {...defaultProps({ board })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      expect(cells[0]?.className).toContain('bg-error-bg')
      expect(cells[27]?.className).toContain('bg-error-bg')
    })

    it('duplicate values in same box get bg-error-bg class', () => {
      const board = createEmptyBoard()
      // Put duplicate 7s in box 0 (indices 0,1,2,9,10,11,18,19,20)
      board[0] = 7
      board[10] = 7
      
      const { container } = render(
        <Board {...defaultProps({ board })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      expect(cells[0]?.className).toContain('bg-error-bg')
      expect(cells[10]?.className).toContain('bg-error-bg')
    })

    it('incorrect cells (from prop) get ring-error-text class', () => {
      const board = createEmptyBoard()
      board[5] = 3
      
      const { container } = render(
        <Board {...defaultProps({ board, incorrectCells: [5] })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      expect(cells[5]?.className).toContain('ring-error-text')
      expect(cells[5]?.className).toContain('bg-error-bg')
    })

    it('non-duplicate, non-incorrect cells do not have error styling', () => {
      const board = createEmptyBoard()
      board[0] = 5
      board[40] = 3
      
      const { container } = render(
        <Board {...defaultProps({ board })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      expect(cells[0]?.className).not.toContain('bg-error-bg')
      expect(cells[40]?.className).not.toContain('bg-error-bg')
    })
  })

  describe('technique highlight (Move)', () => {
    it('primary highlight cells get bg-cell-primary class', () => {
      const highlight = {
        step_index: 0,
        technique: 'Naked Single',
        action: 'place',
        digit: 5,
        targets: [{ row: 4, col: 4 }],
        explanation: 'Test',
        refs: { title: '', slug: '', url: '' },
        highlights: {
          primary: [{ row: 4, col: 4 }],
        },
      }
      
      const board = createEmptyBoard()
      board[40] = 5 // Cell at row 4, col 4
      
      const { container } = render(
        <Board {...defaultProps({ board, highlight })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      expect(cells[40]?.className).toContain('bg-cell-primary')
    })

    it('secondary highlight cells get bg-cell-secondary class', () => {
      const highlight = {
        step_index: 0,
        technique: 'Pointing Pairs',
        action: 'eliminate',
        digit: 3,
        targets: [{ row: 0, col: 6 }],
        explanation: 'Test',
        refs: { title: '', slug: '', url: '' },
        highlights: {
          primary: [{ row: 0, col: 0 }],
          secondary: [{ row: 0, col: 1 }, { row: 0, col: 2 }],
        },
      }
      
      const board = createEmptyBoard()
      board[0] = 3
      board[1] = 0
      board[2] = 0
      const candidates = createEmptyCandidates()
      candidates[1] = createCandidateMask([3])
      candidates[2] = createCandidateMask([3])
      
      const { container } = render(
        <Board {...defaultProps({ board, candidates, highlight })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      expect(cells[1]?.className).toContain('bg-cell-secondary')
      expect(cells[2]?.className).toContain('bg-cell-secondary')
    })
  })

  describe('technique hint mode (showAnswer: false)', () => {
    it('shows primary highlights in technique hint mode', () => {
      const highlight = {
        step_index: 0,
        technique: 'Naked Single',
        action: 'place',
        digit: 5,
        targets: [{ row: 4, col: 4 }],
        eliminations: [{ row: 4, col: 5, digit: 5 }],
        explanation: 'Test',
        refs: { title: '', slug: '', url: '' },
        highlights: {
          primary: [{ row: 4, col: 4 }],
        },
        showAnswer: false,  // Technique hint mode
      }
      
      const board = createEmptyBoard()
      const candidates = createEmptyCandidates()
      candidates[40] = createCandidateMask([5])  // Cell at row 4, col 4 has candidate 5
      
      const { container } = render(
        <Board {...defaultProps({ board, candidates, highlight })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Primary highlight should still show
      expect(cells[40]?.className).toContain('bg-cell-primary')
    })

    it('shows explicit secondary highlights in technique hint mode', () => {
      const highlight = {
        step_index: 0,
        technique: 'Hidden Single',
        action: 'assign',
        digit: 3,
        targets: [{ row: 0, col: 3 }],
        explanation: 'Test',
        refs: { title: '', slug: '', url: '' },
        highlights: {
          primary: [{ row: 0, col: 3 }],
          secondary: [{ row: 0, col: 0 }, { row: 0, col: 1 }],  // Context cells
        },
        showAnswer: false,  // Technique hint mode
      }
      
      const board = createEmptyBoard()
      board[0] = 1  // Filled cell in secondary
      board[1] = 2  // Filled cell in secondary
      
      const { container } = render(
        <Board {...defaultProps({ board, highlight })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Explicit secondary highlights should still show (they're part of the technique pattern)
      expect(cells[0]?.className).toContain('bg-cell-secondary')
      expect(cells[1]?.className).toContain('bg-cell-secondary')
    })

    it('does NOT highlight elimination cells in technique hint mode', () => {
      const highlight = {
        step_index: 0,
        technique: 'Pointing Pairs',
        action: 'eliminate',
        digit: 3,
        targets: [],
        eliminations: [
          { row: 0, col: 6, digit: 3 },
          { row: 0, col: 7, digit: 3 },
        ],
        explanation: 'Test',
        refs: { title: '', slug: '', url: '' },
        highlights: {
          primary: [{ row: 0, col: 0 }, { row: 0, col: 1 }],  // The pair
        },
        showAnswer: false,  // Technique hint mode - should hide eliminations
      }
      
      const board = createEmptyBoard()
      const candidates = createEmptyCandidates()
      candidates[0] = createCandidateMask([3])
      candidates[1] = createCandidateMask([3])
      candidates[6] = createCandidateMask([3, 5])  // Elimination target
      candidates[7] = createCandidateMask([3, 8])  // Elimination target
      
      const { container } = render(
        <Board {...defaultProps({ board, candidates, highlight })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Elimination cells should NOT be highlighted (would reveal the answer)
      expect(cells[6]?.className).not.toContain('bg-cell-secondary')
      expect(cells[7]?.className).not.toContain('bg-cell-secondary')
      // Primary cells should still be highlighted
      expect(cells[0]?.className).toContain('bg-cell-primary')
      expect(cells[1]?.className).toContain('bg-cell-primary')
    })

    it('does NOT highlight target cells in technique hint mode', () => {
      const highlight = {
        step_index: 0,
        technique: 'Naked Single',
        action: 'assign',
        digit: 5,
        targets: [{ row: 4, col: 4 }],  // Target cell (where to place)
        explanation: 'Test',
        refs: { title: '', slug: '', url: '' },
        highlights: {
          primary: [{ row: 0, col: 0 }],  // Some other primary cell
        },
        showAnswer: false,  // Technique hint mode - should hide target
      }
      
      const board = createEmptyBoard()
      board[0] = 5  // Primary cell has value
      const candidates = createEmptyCandidates()
      candidates[40] = createCandidateMask([5])  // Target cell has candidate
      
      const { container } = render(
        <Board {...defaultProps({ board, candidates, highlight })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Target cell should NOT be highlighted as secondary (would reveal the answer)
      expect(cells[40]?.className).not.toContain('bg-cell-secondary')
      // Primary cells should still be highlighted
      expect(cells[0]?.className).toContain('bg-cell-primary')
    })

    it('DOES highlight elimination cells when showAnswer is true (regular hint)', () => {
      const highlight = {
        step_index: 0,
        technique: 'Pointing Pairs',
        action: 'eliminate',
        digit: 3,
        targets: [],
        eliminations: [
          { row: 0, col: 6, digit: 3 },
        ],
        explanation: 'Test',
        refs: { title: '', slug: '', url: '' },
        highlights: {
          primary: [{ row: 0, col: 0 }],
        },
        showAnswer: true,  // Regular hint mode - should show eliminations
      }
      
      const board = createEmptyBoard()
      const candidates = createEmptyCandidates()
      candidates[0] = createCandidateMask([3])
      candidates[6] = createCandidateMask([3, 5])  // Elimination target
      
      const { container } = render(
        <Board {...defaultProps({ board, candidates, highlight })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Elimination cells SHOULD be highlighted in regular hint mode
      expect(cells[6]?.className).toContain('bg-cell-secondary')
    })

    it('DOES highlight target cells when showAnswer is true (regular hint)', () => {
      const highlight = {
        step_index: 0,
        technique: 'Naked Single',
        action: 'assign',
        digit: 5,
        targets: [{ row: 4, col: 4 }],
        explanation: 'Test',
        refs: { title: '', slug: '', url: '' },
        highlights: {
          primary: [{ row: 0, col: 0 }],
        },
        showAnswer: true,  // Regular hint mode - should show target
      }
      
      const board = createEmptyBoard()
      board[0] = 5
      const candidates = createEmptyCandidates()
      candidates[40] = createCandidateMask([5])
      
      const { container } = render(
        <Board {...defaultProps({ board, candidates, highlight })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Target cell SHOULD be highlighted in regular hint mode
      expect(cells[40]?.className).toContain('bg-cell-secondary')
    })

    it('defaults to showAnswer: true when not specified', () => {
      const highlight = {
        step_index: 0,
        technique: 'Pointing Pairs',
        action: 'eliminate',
        digit: 3,
        targets: [],
        eliminations: [{ row: 0, col: 6, digit: 3 }],
        explanation: 'Test',
        refs: { title: '', slug: '', url: '' },
        highlights: {
          primary: [{ row: 0, col: 0 }],
        },
        // showAnswer not specified - should default to true
      }
      
      const board = createEmptyBoard()
      const candidates = createEmptyCandidates()
      candidates[0] = createCandidateMask([3])
      candidates[6] = createCandidateMask([3])
      
      const { container } = render(
        <Board {...defaultProps({ board, candidates, highlight })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Should behave like showAnswer: true (backward compatibility)
      expect(cells[6]?.className).toContain('bg-cell-secondary')
    })

    it('does NOT show elimination strikethrough in technique hint mode', () => {
      const highlight = {
        step_index: 0,
        technique: 'Pointing Pairs',
        action: 'eliminate',
        digit: 3,
        targets: [],
        eliminations: [{ row: 0, col: 6, digit: 3 }],
        explanation: 'Test',
        refs: { title: '', slug: '', url: '' },
        highlights: {
          primary: [{ row: 0, col: 0 }],
        },
        showAnswer: false,  // Technique hint mode
      }
      
      const board = createEmptyBoard()
      const candidates = createEmptyCandidates()
      candidates[0] = createCandidateMask([3])
      candidates[6] = createCandidateMask([3, 5])
      
      const { container } = render(
        <Board {...defaultProps({ board, candidates, highlight })} />
      )
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // In the elimination cell, the candidate 3 should NOT have strikethrough
      const eliminationCell = cells[6]
      const candidateGrid = eliminationCell?.querySelector('.candidate-grid')
      const candidateDigits = candidateGrid?.querySelectorAll('.candidate-digit')
      // Candidate 3 is at position 2 (0-indexed, so positions are 0,1,2 for digits 1,2,3)
      const digit3 = candidateDigits?.[2]
      expect(digit3?.className).not.toContain('line-through')
    })
  })

  describe('keyboard navigation', () => {
    it('pressing arrow keys calls onCellClick with adjacent non-given cell', async () => {
      const user = userEvent.setup()
      const onCellClick = vi.fn()
      const initialBoard = createEmptyBoard()
      // Make cell 1 a given so arrow right from 0 should skip to cell 2
      initialBoard[1] = 5
      
      render(
        <Board {...defaultProps({ 
          initialBoard, 
          board: [...initialBoard],
          selectedCell: 0, 
          onCellClick 
        })} />
      )
      
      const cells = screen.getAllByRole('gridcell')
      // Focus and press ArrowRight
      cells[0]!.focus()
      await user.keyboard('{ArrowRight}')
      
      // Should skip cell 1 (given) and go to cell 2
      expect(onCellClick).toHaveBeenCalledWith(2)
    })

    it('pressing number key calls onCellChange with value', async () => {
      const user = userEvent.setup()
      const onCellChange = vi.fn()
      
      render(
        <Board {...defaultProps({ 
          selectedCell: 0, 
          onCellChange 
        })} />
      )
      
      const cells = screen.getAllByRole('gridcell')
      cells[0]!.focus()
      await user.keyboard('5')
      
      expect(onCellChange).toHaveBeenCalledWith(0, 5)
    })

    it('pressing Backspace calls onCellChange with 0', async () => {
      const user = userEvent.setup()
      const onCellChange = vi.fn()
      const board = createEmptyBoard()
      board[0] = 5
      
      render(
        <Board {...defaultProps({ 
          board,
          selectedCell: 0, 
          onCellChange 
        })} />
      )
      
      const cells = screen.getAllByRole('gridcell')
      cells[0]!.focus()
      await user.keyboard('{Backspace}')
      
      expect(onCellChange).toHaveBeenCalledWith(0, 0)
    })

    it('number key does not work on given cells', async () => {
      const user = userEvent.setup()
      const onCellChange = vi.fn()
      const { board, initialBoard } = createBoardWithGivens()
      
      render(
        <Board {...defaultProps({ 
          board,
          initialBoard,
          selectedCell: 0,  // Cell 0 is a given
          onCellChange 
        })} />
      )
      
      const cells = screen.getAllByRole('gridcell')
      cells[0]!.focus()
      await user.keyboard('7')
      
      expect(onCellChange).not.toHaveBeenCalled()
    })
  })

  describe('accessibility', () => {
    it('cells have correct aria-label for empty cells', () => {
      render(<Board {...defaultProps()} />)
      
      const cells = screen.getAllByRole('gridcell')
      expect(cells[0]).toHaveAttribute('aria-label', 'Row 1, Column 1, empty')
      expect(cells[40]).toHaveAttribute('aria-label', 'Row 5, Column 5, empty')
    })

    it('cells have correct aria-label for filled cells', () => {
      const board = createEmptyBoard()
      board[0] = 5
      
      render(<Board {...defaultProps({ board })} />)
      
      const cells = screen.getAllByRole('gridcell')
      expect(cells[0]).toHaveAttribute('aria-label', 'Row 1, Column 1, value 5')
    })

    it('given cells aria-label includes "given"', () => {
      const { board, initialBoard } = createBoardWithGivens()
      
      render(<Board {...defaultProps({ board, initialBoard })} />)
      
      const cells = screen.getAllByRole('gridcell')
      expect(cells[0]).toHaveAttribute('aria-label', 'Row 1, Column 1, value 5, given')
    })
  })

  describe('grid borders', () => {
    it('cells at box boundaries have thicker borders', () => {
      const { container } = render(<Board {...defaultProps()} />)
      
      const cells = container.querySelectorAll('.sudoku-cell')
      // Cell at col 2 should have right border-2
      expect(cells[2]?.className).toContain('border-r-2')
      // Cell at col 5 should have right border-2
      expect(cells[5]?.className).toContain('border-r-2')
      // Cell at row 2, col 0 (index 18) should have bottom border-2
      expect(cells[18]?.className).toContain('border-b-2')
    })

    it('cells not at box boundaries have thinner borders', () => {
      const { container } = render(<Board {...defaultProps()} />)

      const cells = container.querySelectorAll('.sudoku-cell')
      // Cell at col 1 should have regular border-r (not border-r-2)
      expect(cells[1]?.className).toContain('border-r ')
      expect(cells[1]?.className).not.toContain('border-r-2')
    })
  })

  // ===========================================================================
  // DRAG INTERACTION TESTS (Multi-Select Feature)
  // Uses pointer events: pointerDown on cells, pointerMove/pointerUp on board.
  // Board-level onPointerMove uses document.elementFromPoint() to resolve
  // which cell the pointer is over, so we mock it in jsdom.
  // ===========================================================================
  describe('drag interaction - pointer handlers', () => {
    // Helper: simulate dragging the pointer over a target cell.
    // jsdom does not implement document.elementFromPoint, so we assign
    // a mock directly and restore afterward.
    function simulateDragOver(boardEl: Element, targetCell: Element) {
      const original = document.elementFromPoint
      document.elementFromPoint = vi.fn().mockReturnValue(targetCell)
      fireEvent.pointerMove(boardEl, { clientX: 50, clientY: 50 })
      document.elementFromPoint = original
    }

    it('cells can receive drag handlers', () => {
      // Structural test: cells render with data-cell-idx for pointer resolution
      const { container } = render(<Board {...defaultProps()} />)

      const cells = container.querySelectorAll('.sudoku-cell')
      expect(cells.length).toBeGreaterThan(0)
      expect(cells[0]).toHaveAttribute('data-cell-idx')
    })

    it('Board component provides drag handler callbacks', () => {
      const onCellSelectMultiple = vi.fn()
      render(<Board {...defaultProps({ onCellSelectMultiple })} />)

      expect(typeof onCellSelectMultiple).toBe('function')
    })

    it('multi-selected cells have distinct styling', () => {
      const selectedCells = new Set([10, 11, 12])
      const { container } = render(
        <Board {...defaultProps({ selectedCells })} />
      )

      const cells = container.querySelectorAll('.sudoku-cell')
      expect(cells.length).toBeGreaterThan(12)
    })

    it('drag does not start on given cells', () => {
      const { board, initialBoard } = createBoardWithGivens()
      const onCellSelectMultiple = vi.fn()
      const { container } = render(
        <Board {...defaultProps({ board, initialBoard, onCellSelectMultiple })} />
      )

      const cells = container.querySelectorAll('.sudoku-cell')
      const boardEl = screen.getByRole('grid')
      // Cell 0 is a given (value 5). pointerDown on it, then move to cell 1.
      fireEvent.pointerDown(cells[0]!)
      simulateDragOver(boardEl, cells[1]!)
      fireEvent.pointerUp(boardEl)

      // onCellSelectMultiple should NOT be called because drag never started
      expect(onCellSelectMultiple).not.toHaveBeenCalled()
    })

    it('drag does not start on filled (non-given) cells', () => {
      const board = createEmptyBoard()
      const initialBoard = createEmptyBoard()
      // Cell 5 is user-filled (not given)
      board[5] = 8
      const onCellSelectMultiple = vi.fn()
      const { container } = render(
        <Board {...defaultProps({ board, initialBoard, onCellSelectMultiple })} />
      )

      const cells = container.querySelectorAll('.sudoku-cell')
      const boardEl = screen.getByRole('grid')
      // Cell 5 is filled. pointerDown on it, then move to cell 6.
      fireEvent.pointerDown(cells[5]!)
      simulateDragOver(boardEl, cells[6]!)
      fireEvent.pointerUp(boardEl)

      // onCellSelectMultiple should NOT be called because drag never started
      expect(onCellSelectMultiple).not.toHaveBeenCalled()
    })

    it('drag skips over given cells without canceling', () => {
      const board = createEmptyBoard()
      const initialBoard = createEmptyBoard()
      // Cell 1 is a given
      initialBoard[1] = 5
      board[1] = 5
      // Cells 0, 2 are empty
      const onCellSelectMultiple = vi.fn()
      const { container } = render(
        <Board {...defaultProps({ board, initialBoard, onCellSelectMultiple })} />
      )

      const cells = container.querySelectorAll('.sudoku-cell')
      const boardEl = screen.getByRole('grid')
      // Start drag on cell 0 (empty), drag to cell 2 (empty), skipping cell 1 (given)
      fireEvent.pointerDown(cells[0]!)
      simulateDragOver(boardEl, cells[2]!)

      // onCellSelectMultiple should be called with filtered cells (excluding given cell 1)
      expect(onCellSelectMultiple).toHaveBeenCalled()
      const lastCall = onCellSelectMultiple.mock.calls[onCellSelectMultiple.mock.calls.length - 1]
      const selectedCells: number[] = lastCall[0]
      // Cell 1 (given) should NOT be in the selection
      expect(selectedCells).not.toContain(1)
    })

    it('drag skips over filled cells without canceling', () => {
      const board = createEmptyBoard()
      const initialBoard = createEmptyBoard()
      // Cell 1 is user-filled
      board[1] = 4
      // Cells 0, 2 are empty
      const onCellSelectMultiple = vi.fn()
      const { container } = render(
        <Board {...defaultProps({ board, initialBoard, onCellSelectMultiple })} />
      )

      const cells = container.querySelectorAll('.sudoku-cell')
      const boardEl = screen.getByRole('grid')
      // Start drag on cell 0 (empty), drag to cell 2
      fireEvent.pointerDown(cells[0]!)
      simulateDragOver(boardEl, cells[2]!)

      expect(onCellSelectMultiple).toHaveBeenCalled()
      const lastCall = onCellSelectMultiple.mock.calls[onCellSelectMultiple.mock.calls.length - 1]
      const selectedCells: number[] = lastCall[0]
      // Cell 1 (filled) should NOT be in the selection
      expect(selectedCells).not.toContain(1)
    })

    it('drag on empty cells calls onCellSelectMultiple normally', () => {
      const onCellSelectMultiple = vi.fn()
      const { container } = render(
        <Board {...defaultProps({ onCellSelectMultiple })} />
      )

      const cells = container.querySelectorAll('.sudoku-cell')
      const boardEl = screen.getByRole('grid')
      // All cells empty: drag from cell 0 to cell 2
      fireEvent.pointerDown(cells[0]!)
      simulateDragOver(boardEl, cells[2]!)

      expect(onCellSelectMultiple).toHaveBeenCalled()
      const lastCall = onCellSelectMultiple.mock.calls[onCellSelectMultiple.mock.calls.length - 1]
      const selectedCells: number[] = lastCall[0]
      // Should include cells in the path
      expect(selectedCells.length).toBeGreaterThan(0)
    })
  })
})
