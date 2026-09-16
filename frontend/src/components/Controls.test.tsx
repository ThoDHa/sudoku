import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Controls from './Controls'

type ControlsTestProps = {
  notesMode: boolean
  onNotesToggle: () => void
  onDigit: (digit: number) => void
  onEraseMode: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  eraseMode: boolean
  digitCounts: number[]
  highlightedDigit: number | null
  isComplete: boolean
  isSolving?: boolean
}

const noop = () => {}

const makeProps = (overrides: Partial<ControlsTestProps> = {}): ControlsTestProps => ({
  notesMode: false,
  onNotesToggle: noop,
  onDigit: noop,
  onEraseMode: noop,
  onUndo: noop,
  onRedo: noop,
  canUndo: false,
  canRedo: false,
  eraseMode: false,
  digitCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  highlightedDigit: null,
  isComplete: false,
  isSolving: false,
  ...overrides,
})

// React's memo() returns an envelope object ({ $$typeof, type: inner, compare });
// a memo bailout is precisely a skipped invocation of `type`, so replacing it
// with a counting wrapper observes the bailout directly. React does not expose
// the envelope shape publicly, hence the structural cast.
type MemoEnvelope = { type: (props: ControlsTestProps) => unknown }

const pendingRestores: (() => void)[] = []

const renderCounting = (props: ControlsTestProps) => {
  const envelope = Controls as unknown as MemoEnvelope
  const inner = envelope.type
  const calls = vi.fn((p: ControlsTestProps) => inner(p))
  envelope.type = calls
  pendingRestores.push(() => {
    envelope.type = inner
  })
  const rendered = render(<Controls {...props} />)
  const rerenderWith = (next: ControlsTestProps) => rendered.rerender(<Controls {...next} />)
  return { calls, rerenderWith }
}

afterEach(() => {
  while (pendingRestores.length > 0) {
    pendingRestores.pop()!()
  }
})

const digitButton = (digit: number, remaining: number) =>
  screen.getByRole('button', { name: `Enter ${digit}, ${remaining} remaining` })

describe('Controls render paths', () => {
  it('renders all nine digit buttons with remaining counts derived from digitCounts', () => {
    render(<Controls {...makeProps({ digitCounts: [1, 0, 3, 0, 0, 9, 0, 0, 2] })} />)
    expect(digitButton(1, 8)).toHaveTextContent('1')
    expect(digitButton(2, 9)).toHaveTextContent('2')
    expect(digitButton(3, 6)).toHaveTextContent('3')
    expect(digitButton(4, 9)).toBeInTheDocument()
    expect(digitButton(5, 9)).toBeInTheDocument()
    expect(digitButton(6, 0)).toBeInTheDocument()
    expect(digitButton(7, 9)).toBeInTheDocument()
    expect(digitButton(8, 9)).toBeInTheDocument()
    expect(digitButton(9, 7)).toHaveTextContent('9')
  })

  it('renders the notes, erase, undo and redo action buttons', () => {
    render(<Controls {...makeProps()} />)
    expect(screen.getByRole('button', { name: 'Notes mode off' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Erase mode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument()
  })
})

describe('Controls digit-button derivation', () => {
  it('disables a digit whose count is nine and marks its badge complete', () => {
    render(<Controls {...makeProps({ digitCounts: [9, 0, 0, 0, 0, 0, 0, 0, 0] })} />)
    const complete = digitButton(1, 0)
    expect(complete).toBeDisabled()
    const badge = complete.querySelector('.digit-remaining-badge')
    expect(badge?.className).toContain('bg-accent text-btn-active-text')
    expect(badge?.className).not.toContain('bg-accent-light')
  })

  it('enables an incomplete digit and uses the light badge variant', () => {
    render(<Controls {...makeProps({ digitCounts: [8, 0, 0, 0, 0, 0, 0, 0, 0] })} />)
    const incomplete = digitButton(1, 1)
    expect(incomplete).toBeEnabled()
    const badge = incomplete.querySelector('.digit-remaining-badge')
    expect(badge?.className).toContain('bg-accent-light text-accent')
  })

  it('disables every digit when the puzzle is complete', () => {
    render(<Controls {...makeProps({ isComplete: true })} />)
    for (const digit of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(digitButton(digit, 9)).toBeDisabled()
    }
  })

  it('disables every digit while auto-solve runs', () => {
    render(<Controls {...makeProps({ isSolving: true })} />)
    for (const digit of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(digitButton(digit, 9)).toBeDisabled()
    }
  })

  it('shows the selected class for the highlighted digit', () => {
    render(<Controls {...makeProps({ highlightedDigit: 5 })} />)
    const selected = digitButton(5, 9)
    expect(selected.className).toContain(
      'bg-accent text-btn-active-text ring-2 ring-accent ring-offset-2 ring-offset-background',
    )
    expect(selected.className).not.toContain('opacity-60')
    expect(digitButton(4, 9).className).toContain('bg-btn-bg text-foreground')
  })

  it('lets the solving-muted selected state win over the disabled state', () => {
    render(<Controls {...makeProps({ highlightedDigit: 5, isSolving: true })} />)
    const muted = digitButton(5, 9)
    expect(muted.className).toContain(
      'bg-accent text-btn-active-text ring-2 ring-accent ring-offset-2 ring-offset-background opacity-60 cursor-not-allowed',
    )
    expect(muted.className).not.toContain('text-foreground-muted')
  })

  it('lets the disabled state win over the plain selected state when the puzzle is complete', () => {
    render(<Controls {...makeProps({ highlightedDigit: 5, isComplete: true })} />)
    const disabledSelected = digitButton(5, 9)
    expect(disabledSelected.className).toContain(
      'bg-btn-bg text-foreground-muted opacity-40 cursor-not-allowed',
    )
    expect(disabledSelected.className).not.toContain('bg-accent')
  })

  it('lets the disabled state win over the solving-muted state when the digit is complete', () => {
    render(
      <Controls
        {...makeProps({
          highlightedDigit: 5,
          isSolving: true,
          digitCounts: [0, 0, 0, 0, 9, 0, 0, 0, 0],
        })}
      />,
    )
    const muted = digitButton(5, 0)
    expect(muted.className).toContain(
      'bg-btn-bg text-foreground-muted opacity-40 cursor-not-allowed',
    )
    expect(muted.className).not.toContain('bg-accent')
  })
})

describe('Controls action-button states', () => {
  it('reflects notes mode with the active class and aria state', () => {
    render(<Controls {...makeProps({ notesMode: true })} />)
    const notes = screen.getByRole('button', { name: 'Notes mode on' })
    expect(notes).toHaveAttribute('aria-pressed', 'true')
    expect(notes.className).toContain(
      'bg-btn-active text-btn-active-text ring-2 ring-accent ring-offset-1 ring-offset-background',
    )
  })

  it('shows the muted notes variant while auto-solve runs with notes on', () => {
    render(<Controls {...makeProps({ notesMode: true, isSolving: true })} />)
    const notes = screen.getByRole('button', { name: 'Notes mode on' })
    expect(notes.className).toContain('opacity-60 cursor-not-allowed')
    expect(notes).toBeDisabled()
  })

  it('disables notes and erase when the puzzle is complete', () => {
    render(<Controls {...makeProps({ isComplete: true, eraseMode: true })} />)
    expect(screen.getByRole('button', { name: 'Notes mode off' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Erase mode' })).toBeDisabled()
  })

  it('shows the erase active class when erase mode is on', () => {
    render(<Controls {...makeProps({ eraseMode: true })} />)
    const erase = screen.getByRole('button', { name: 'Erase mode' })
    expect(erase.className).toContain('bg-accent text-btn-active-text')
    expect(erase).toHaveAttribute('aria-pressed', 'true')
  })

  it('disables undo and redo unless history allows them', () => {
    render(<Controls {...makeProps({ canUndo: false, canRedo: false })} />)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('enables undo and redo when history allows them', () => {
    render(<Controls {...makeProps({ canUndo: true, canRedo: true })} />)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled()
  })
})

describe('Controls memoization re-render behavior', () => {
  it('does not re-render when rerendered with identical props', () => {
    const { calls, rerenderWith } = renderCounting(makeProps())
    expect(calls).toHaveBeenCalledTimes(1)
    rerenderWith(makeProps())
    expect(calls).toHaveBeenCalledTimes(1)
  })

  it('does not re-render when digitCounts is a different reference with identical contents', () => {
    const { calls, rerenderWith } = renderCounting(makeProps())
    expect(calls).toHaveBeenCalledTimes(1)
    rerenderWith(makeProps({ digitCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0] }))
    expect(calls).toHaveBeenCalledTimes(1)
  })

  it('re-renders and updates the DOM when one digitCounts element changes', () => {
    const { calls, rerenderWith } = renderCounting(makeProps())
    expect(calls).toHaveBeenCalledTimes(1)
    rerenderWith(makeProps({ digitCounts: [0, 2, 0, 0, 0, 0, 0, 0, 0] }))
    expect(calls).toHaveBeenCalledTimes(2)
    expect(digitButton(2, 7)).toBeInTheDocument()
    expect(digitButton(1, 9)).toBeInTheDocument()
  })

  it('re-renders when digitCounts has a different length', () => {
    const { calls, rerenderWith } = renderCounting(makeProps())
    expect(calls).toHaveBeenCalledTimes(1)
    rerenderWith(makeProps({ digitCounts: [0, 0, 0, 0, 0, 0, 0, 0] }))
    expect(calls).toHaveBeenCalledTimes(2)
  })

  it('re-renders when a primitive prop changes', () => {
    const { calls, rerenderWith } = renderCounting(makeProps())
    expect(calls).toHaveBeenCalledTimes(1)
    rerenderWith(makeProps({ highlightedDigit: 3 }))
    expect(calls).toHaveBeenCalledTimes(2)
  })

  it('re-renders when a callback reference changes', () => {
    const { calls, rerenderWith } = renderCounting(makeProps())
    expect(calls).toHaveBeenCalledTimes(1)
    rerenderWith(makeProps({ onDigit: () => {} }))
    expect(calls).toHaveBeenCalledTimes(2)
  })
})
