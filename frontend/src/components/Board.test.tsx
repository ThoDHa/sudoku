import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Board from './Board'

// Minimal smoke test to ensure candidate highlight clears when last candidate removed
describe('Board candidate highlight behavior', () => {
  it('does not keep cell highlighted after last candidate removed', async () => {
    const board = Array(81).fill(0)
    const initialBoard = Array(81).fill(0)
    // Put a candidate (1) into cell 0
    const candidates = Array.from({ length: 81 }, (_, i) => new Set<number>())
    candidates[0].add(1)

    const onCellClick = jest.fn()

    const { rerender } = render(
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

    // Now remove the candidate and rerender
    candidates[0].delete(1)
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
    // We check that no element has class 'bg-[var(--cell-primary)]'
    const highlightedElements = document.querySelectorAll('.bg-[var(--cell-primary)]')
    expect(highlightedElements.length).toBe(0)
  })
})
