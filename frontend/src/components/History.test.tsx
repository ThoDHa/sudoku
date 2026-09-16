import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import History from './History'

type HistoryComponentProps = Parameters<typeof History>[0]

type HistoryTestMove = HistoryComponentProps['moves'][number]

const makeMove = (overrides: Partial<HistoryTestMove> = {}): HistoryTestMove => ({
  step_index: 0,
  technique: 'Naked Single',
  action: 'place',
  digit: 5,
  targets: [{ row: 0, col: 0 }],
  explanation: 'Only one candidate fits R1C1.',
  refs: { title: 'Naked Single', slug: 'naked-single', url: 'https://example.com/naked-single' },
  highlights: { primary: [{ row: 0, col: 0 }] },
  ...overrides,
})

type HistoryTestProps = Partial<HistoryComponentProps>

const makeProps = (overrides: HistoryTestProps = {}): HistoryComponentProps => ({
  moves: [],
  isOpen: true,
  onClose: vi.fn(),
  onMoveClick: vi.fn(),
  onTechniqueClick: vi.fn(),
  selectedMoveIndex: null,
  ...overrides,
})

const cell = (row: number, col: number) => ({ row, col })

// The move-action text is split across text nodes and a digit <span>, and RTL
// matches only an element's own text nodes, so assertions read the rendered
// textContent of the action button and the summary spans directly.
const actionText = (container: HTMLElement): string => {
  const button = container.querySelector('li button[type="button"]')
  if (!button) throw new Error('No move action button rendered')
  return button.textContent ?? ''
}

const summaryTexts = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('li span.text-sm')).map((el) => el.textContent ?? '')

describe('History', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<History {...makeProps({ isOpen: false })} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the empty-state message when open with no moves', () => {
    render(<History {...makeProps()} />)
    expect(
      screen.getByText('No moves yet. Use Hint or Next Step to see technique explanations.'),
    ).toBeInTheDocument()
  })

  it('renders the header title', () => {
    render(<History {...makeProps()} />)
    expect(screen.getByText('Move History')).toBeInTheDocument()
  })

  describe('move list order and numbering (reversed index arithmetic)', () => {
    it('shows the newest move first with the highest number and the oldest last with #1', () => {
      const moves = [
        makeMove({ step_index: 0, technique: 'First' }),
        makeMove({ step_index: 1, technique: 'Second' }),
        makeMove({ step_index: 2, technique: 'Third' }),
      ]
      render(<History {...makeProps({ moves })} />)
      const numbers = screen.getAllByText(/^#\d+$/).map((el) => el.textContent)
      expect(numbers).toEqual(['#3', '#2', '#1'])
    })

    it('numbers a two-move history from #2 down to #1', () => {
      const moves = [makeMove({ technique: 'First' }), makeMove({ technique: 'Second' })]
      render(<History {...makeProps({ moves })} />)
      const numbers = screen.getAllByText(/^#\d+$/).map((el) => el.textContent)
      expect(numbers).toEqual(['#2', '#1'])
    })

    it('numbers a single move #1', () => {
      render(<History {...makeProps({ moves: [makeMove()] })} />)
      expect(screen.getByText('#1')).toBeInTheDocument()
    })

    it('passes the original (pre-reversal) index to onMoveClick for the first and last rendered items', () => {
      const onMoveClick = vi.fn()
      const moves = [
        makeMove({ technique: 'First', action: 'erase', targets: [cell(0, 0)] }),
        makeMove({ technique: 'Middle', action: 'erase', targets: [cell(1, 1)] }),
        makeMove({ technique: 'Last', action: 'erase', targets: [cell(2, 2)] }),
      ]
      render(<History {...makeProps({ moves, onMoveClick })} />)
      const renderedItems = screen.getAllByText(/^#\d+$/)
      fireEvent.click(renderedItems[0]!.closest('li')!.querySelector('button[type="button"]')!)
      expect(onMoveClick).toHaveBeenCalledWith(moves[2], 2)
      expect(onMoveClick).toHaveBeenCalledTimes(1)
      fireEvent.click(renderedItems[2]!.closest('li')!.querySelector('button[type="button"]')!)
      expect(onMoveClick).toHaveBeenCalledWith(moves[0], 0)
    })

    it('renders three items for three moves', () => {
      const moves = [makeMove(), makeMove(), makeMove()]
      render(<History {...makeProps({ moves })} />)
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
    })
  })

  describe('cell formatting inside action text', () => {
    it('formats a single target cell as R<row+1>C<col+1>', () => {
      const { container } = render(
        <History
          {...makeProps({
            moves: [makeMove({ action: 'place', digit: 5, targets: [cell(0, 0)] })],
          })}
        />,
      )
      expect(actionText(container)).toBe('Place 5 at R1C1')
    })

    it('formats the maximum cell as R9C9', () => {
      const { container } = render(
        <History
          {...makeProps({
            moves: [makeMove({ action: 'place', digit: 9, targets: [cell(8, 8)] })],
          })}
        />,
      )
      expect(actionText(container)).toBe('Place 9 at R9C9')
    })

    it('joins multiple target cells with a comma and space', () => {
      const { container } = render(
        <History
          {...makeProps({
            moves: [makeMove({ action: 'place', targets: [cell(0, 0), cell(1, 1), cell(2, 2)] })],
          })}
        />,
      )
      expect(actionText(container)).toBe('Place 5 at R1C1, R2C2, R3C3')
    })
  })

  describe('action text per action kind', () => {
    it('renders solver place as "Place <digit> at <cells>"', () => {
      const { container } = render(
        <History {...makeProps({ moves: [makeMove({ action: 'place', isUserMove: false })] })} />,
      )
      expect(actionText(container)).toBe('Place 5 at R1C1')
    })

    it('renders user place as "Placed <digit> at <cells>"', () => {
      const { container } = render(
        <History {...makeProps({ moves: [makeMove({ action: 'place', isUserMove: true })] })} />,
      )
      expect(actionText(container)).toBe('Placed 5 at R1C1')
    })

    it('renders assign like place for a solver move', () => {
      const { container } = render(
        <History {...makeProps({ moves: [makeMove({ action: 'assign', isUserMove: false })] })} />,
      )
      expect(actionText(container)).toBe('Place 5 at R1C1')
    })

    it('renders solver note as "Add candidate <digit> at <cells>"', () => {
      const { container } = render(
        <History {...makeProps({ moves: [makeMove({ action: 'note', isUserMove: false })] })} />,
      )
      expect(actionText(container)).toBe('Add candidate 5 at R1C1')
    })

    it('renders user note as "Added candidate <digit> to <cells>"', () => {
      const { container } = render(
        <History {...makeProps({ moves: [makeMove({ action: 'note', isUserMove: true })] })} />,
      )
      expect(actionText(container)).toBe('Added candidate 5 to R1C1')
    })

    it('renders candidate like note', () => {
      const { container } = render(
        <History
          {...makeProps({ moves: [makeMove({ action: 'candidate', isUserMove: true })] })}
        />,
      )
      expect(actionText(container)).toBe('Added candidate 5 to R1C1')
    })

    it('renders erase as "Cleared <cells>"', () => {
      const { container } = render(
        <History
          {...makeProps({
            moves: [makeMove({ action: 'erase', targets: [cell(0, 0), cell(1, 1)] })],
          })}
        />,
      )
      expect(actionText(container)).toBe('Cleared R1C1, R2C2')
    })

    it('renders clear-candidates as "Cleared all candidates from <cells>"', () => {
      const { container } = render(
        <History {...makeProps({ moves: [makeMove({ action: 'clear-candidates' })] })} />,
      )
      expect(actionText(container)).toBe('Cleared all candidates from R1C1')
    })

    it('renders the eliminate fallback listing each elimination digit and cell', () => {
      const { container } = render(
        <History
          {...makeProps({
            moves: [
              makeMove({
                action: 'eliminate',
                eliminations: [
                  { row: 1, col: 2, digit: 4 },
                  { row: 7, col: 8, digit: 7 },
                ],
              }),
            ],
          })}
        />,
      )
      expect(actionText(container)).toBe('Eliminate 4 from R2C3, 7 from R8C9')
    })

    it('renders a bare "Eliminate" when an unknown action has no eliminations', () => {
      const { container } = render(
        <History {...makeProps({ moves: [makeMove({ action: 'eliminate' })] })} />,
      )
      expect(actionText(container).trim()).toBe('Eliminate')
    })
  })

  describe('auto-fill summary', () => {
    const autoFillMove = (cellCount: number): HistoryTestMove =>
      makeMove({
        technique: 'Fill Candidates',
        explanation: `Filled all candidates for ${cellCount} cells`,
      })

    it('summarises the auto-fill move with the cell count parsed from its explanation', () => {
      const { container } = render(
        <History {...makeProps({ moves: [autoFillMove(27)], autoFillUsed: true })} />,
      )
      expect(summaryTexts(container)).toContain('Auto-filled candidates for 27 cells')
    })

    it('falls back to zero cells when the explanation does not match the cells pattern', () => {
      const { container } = render(
        <History
          {...makeProps({
            moves: [
              makeMove({ technique: 'Fill Candidates', explanation: 'Filled all candidates' }),
            ],
            autoFillUsed: true,
          })}
        />,
      )
      expect(summaryTexts(container)).toContain('Auto-filled candidates for 0 cells')
    })

    it('falls back to the plain summary when no Fill Candidates move exists', () => {
      const { container } = render(
        <History {...makeProps({ moves: [makeMove()], autoFillUsed: true })} />,
      )
      expect(summaryTexts(container)).toContain('Auto-filled candidates')
    })

    it('pluralises zero cells', () => {
      const { container } = render(
        <History {...makeProps({ moves: [autoFillMove(0)], autoFillUsed: true })} />,
      )
      expect(summaryTexts(container)).toContain('Auto-filled candidates for 0 cells')
    })

    it('keeps one cell singular', () => {
      const { container } = render(
        <History {...makeProps({ moves: [autoFillMove(1)], autoFillUsed: true })} />,
      )
      expect(summaryTexts(container)).toContain('Auto-filled candidates for 1 cell')
    })

    it('pluralises two cells', () => {
      const { container } = render(
        <History {...makeProps({ moves: [autoFillMove(2)], autoFillUsed: true })} />,
      )
      expect(summaryTexts(container)).toContain('Auto-filled candidates for 2 cells')
    })

    it('does not render the auto-fill summary when autoFillUsed is false', () => {
      const { container } = render(
        <History {...makeProps({ moves: [autoFillMove(27)], autoFillUsed: false })} />,
      )
      expect(summaryTexts(container)).toEqual([])
    })
  })

  describe('auto-solve summary', () => {
    it('pluralises two autosolver moves', () => {
      const { container } = render(
        <History {...makeProps({ moves: [makeMove()], autoSolveStepsUsed: 2 })} />,
      )
      expect(summaryTexts(container)).toContain('The autosolver performed 2 moves')
    })

    it('keeps one autosolver move singular', () => {
      const { container } = render(
        <History {...makeProps({ moves: [makeMove()], autoSolveStepsUsed: 1 })} />,
      )
      expect(summaryTexts(container)).toContain('The autosolver performed 1 move')
    })

    it('does not render the auto-solve summary for zero steps', () => {
      const { container } = render(
        <History {...makeProps({ moves: [makeMove()], autoSolveStepsUsed: 0 })} />,
      )
      expect(summaryTexts(container)).toEqual([])
    })

    it('appends a singular fixed-error clause for one error', () => {
      const { container } = render(
        <History
          {...makeProps({ moves: [makeMove()], autoSolveStepsUsed: 2, autoSolveErrorsFixed: 1 })}
        />,
      )
      expect(summaryTexts(container)).toContain('The autosolver performed 2 moves, fixed 1 error')
    })

    it('pluralises the fixed-error clause for two errors', () => {
      const { container } = render(
        <History
          {...makeProps({ moves: [makeMove()], autoSolveStepsUsed: 2, autoSolveErrorsFixed: 2 })}
        />,
      )
      expect(summaryTexts(container)).toContain('The autosolver performed 2 moves, fixed 2 errors')
    })

    it('omits the fixed-error clause when no errors were fixed', () => {
      const { container } = render(
        <History
          {...makeProps({ moves: [makeMove()], autoSolveStepsUsed: 2, autoSolveErrorsFixed: 0 })}
        />,
      )
      expect(summaryTexts(container)).toContain('The autosolver performed 2 moves')
    })

    it('omits the fixed-error clause when the prop is undefined', () => {
      const { container } = render(
        <History {...makeProps({ moves: [makeMove()], autoSolveStepsUsed: 2 })} />,
      )
      expect(summaryTexts(container)).toContain('The autosolver performed 2 moves')
    })

    it('prefixes the completion celebration when the puzzle is complete', () => {
      const { container } = render(
        <History
          {...makeProps({ moves: [makeMove()], autoSolveStepsUsed: 3, isComplete: true })}
        />,
      )
      expect(summaryTexts(container)).toContain('Puzzle solved! The autosolver performed 3 moves')
    })
  })

  describe('badges and per-move extras', () => {
    it('shows the technique badge for a solver move', () => {
      render(<History {...makeProps({ moves: [makeMove({ technique: 'Hidden Pair' })] })} />)
      expect(screen.getByText('Hidden Pair')).toBeInTheDocument()
    })

    it('shows the You badge for a user move instead of the technique', () => {
      render(
        <History {...makeProps({ moves: [makeMove({ isUserMove: true, technique: 'Solve' })] })} />,
      )
      expect(screen.getByText('You')).toBeInTheDocument()
      expect(screen.queryByText('Solve')).not.toBeInTheDocument()
    })

    it('shows the explanation for a solver move and hides it for a user move', () => {
      const explanation = 'Only one candidate fits R1C1.'
      const { rerender } = render(
        <History {...makeProps({ moves: [makeMove({ isUserMove: false })] })} />,
      )
      expect(screen.getByText(explanation)).toBeInTheDocument()
      rerender(<History {...makeProps({ moves: [makeMove({ isUserMove: true })] })} />)
      expect(screen.queryByText(explanation)).not.toBeInTheDocument()
    })

    it('renders the Learn more button and calls onTechniqueClick with the ref data', () => {
      const onTechniqueClick = vi.fn()
      render(
        <History
          {...makeProps({
            moves: [makeMove({ refs: { title: 'Naked Single', slug: 'naked-single', url: 'x' } })],
            onTechniqueClick,
          })}
        />,
      )
      fireEvent.click(screen.getByText('Learn more: Naked Single'))
      expect(onTechniqueClick).toHaveBeenCalledWith({ title: 'Naked Single', slug: 'naked-single' })
    })

    it('marks the selected move item', () => {
      render(<History {...makeProps({ moves: [makeMove()], selectedMoveIndex: 0 })} />)
      const item = screen.getAllByRole('listitem')[0]!
      expect(item.className).toContain('border-accent')
    })
  })
})
