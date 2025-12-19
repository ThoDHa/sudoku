import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect } from 'vitest'
import Board from './Board'
import { addCandidate, removeCandidate } from '../lib/candidatesUtils'

// Minimal smoke test to ensure candidate highlight clears when last candidate removed
describe('Board candidate highlight behavior', () => {
  it('does not keep cell highlighted after last candidate removed', async () => {
    const board = Array(81).fill(0)
    const initialBoard = Array(81).fill(0)
    // Put a candidate (1) into cell 0
    const candidates = new Uint16Array(81)
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

    // Cell 0 should render a candidate digit '1'
    expect(screen.getByText('1')).toBeInTheDocument()

    // Now remove the candidate and rerender with a highlight that points to cell 0
    candidates[0] = removeCandidate(candidates[0], 1)
    rerender(
      <Board
        board={board}
        initialBoard={initialBoard}
        candidates={candidates}
        selectedCell={null}
        highlightedDigit={null}
        highlight={{ step_index: 0, technique: 'User Input', action: 'eliminate', digit: 1, targets: [{ row: 0, col: 0 }], explanation: '', refs: { title: '', slug: '', url: '' }, highlights: { primary: [{ row: 0, col: 0 }] } }}
        onCellClick={(idx) => onCellClick(idx)}
      />
    )

    // After removing, the candidate text should no longer be present
    expect(screen.queryByText('1')).not.toBeInTheDocument()

    // The cell should not have the primary highlight background class
    // Check that the first cell (R1C1) doesn't have the cell-primary class in its className
    const cells = container.querySelectorAll('.sudoku-cell')
    const firstCell = cells[0]
    expect(firstCell).toBeDefined()
    // The cell should NOT have bg-[var(--cell-primary)] class since the candidate was removed
    expect(firstCell?.className).not.toContain('bg-[var(--cell-primary)]')
  })
})
