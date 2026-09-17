import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Custom from './Custom'
import { validateCustomPuzzle } from '../lib/solver-service'
import { encodePuzzle } from '../lib/puzzleEncoding'
import { MIN_GIVENS } from '../lib/constants'

vi.mock('../lib/solver-service', () => ({
  validateCustomPuzzle: vi.fn(),
}))

const mockValidate = vi.mocked(validateCustomPuzzle)

// Validate & Play ends in navigate('/c/<encoded>'), which unmounts Custom and
// renders this probe on the catch-all route, so the test can read the landing
// pathname instead of spying on the router.
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="navigated">{location.pathname}</div>
}

function renderCustom() {
  return render(
    <MemoryRouter initialEntries={['/custom']}>
      <Routes>
        <Route path="/custom" element={<Custom />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

const cell = (idx: number) => screen.getAllByRole('gridcell')[idx] as HTMLElement

const clickCell = (idx: number) => fireEvent.click(cell(idx))

const clickButton = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

// The error surface has no role; it is the single red banner div at the foot
// of the page, so "no error" assertions probe for that container directly.
const queryError = (container: HTMLElement) => container.querySelector('.bg-red-100')

type ReadText = (query: string) => Promise<string>

function stubClipboard(readText: ReadText | (() => Promise<never>)) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { readText },
    writable: true,
    configurable: true,
  })
}

// Wikipedia's example puzzle, written in the paste format (0 or . for empty).
const VALID_PASTE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079'

describe('Custom page', () => {
  const originalClipboard = navigator.clipboard

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    })
  })

  describe('render', () => {
    it('renders the heading, back link and paste-format hint', () => {
      renderCustom()

      expect(screen.getByText('Custom Puzzle')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '← Back to puzzles' })).toHaveAttribute('href', '/')
      expect(screen.getByText(/Paste format:/)).toBeInTheDocument()
      expect(screen.getByText(/81 digits \(0 or \. for empty\)/)).toBeInTheDocument()
    })

    it('renders the nine digit buttons and the action buttons', () => {
      renderCustom()

      for (const digit of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
        expect(screen.getByRole('button', { name: digit })).toBeInTheDocument()
      }
      expect(screen.getByRole('button', { name: 'Erase' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Clear All' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Paste' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Validate & Play' })).toBeInTheDocument()
    })

    it('renders all 81 cells empty', () => {
      renderCustom()

      const cells = screen.getAllByRole('gridcell')
      expect(cells).toHaveLength(81)
      expect(cell(0)).toHaveAttribute('aria-label', 'Row 1, Column 1, empty')
      expect(cell(80)).toHaveAttribute('aria-label', 'Row 9, Column 9, empty')
    })
  })

  describe('cell entry', () => {
    it('shows no error when a digit is pressed with no selected cell', () => {
      const { container } = renderCustom()

      clickButton('5')

      expect(queryError(container)).toBeNull()
      expect(cell(0)).toHaveAttribute('aria-label', 'Row 1, Column 1, empty')
    })

    it('fills the selected cell with the pressed digit', () => {
      renderCustom()

      clickCell(0)
      clickButton('5')

      expect(cell(0)).toHaveAttribute('aria-label', 'Row 1, Column 1, value 5')
    })

    it('Erase empties the selected filled cell', () => {
      renderCustom()

      clickCell(0)
      clickButton('5')
      clickButton('Erase')

      expect(cell(0)).toHaveAttribute('aria-label', 'Row 1, Column 1, empty')
    })

    it('Clear All empties every filled cell', () => {
      renderCustom()

      clickCell(0)
      clickButton('5')
      clickCell(40)
      clickButton('3')
      clickButton('Clear All')

      expect(cell(0)).toHaveAttribute('aria-label', 'Row 1, Column 1, empty')
      expect(cell(40)).toHaveAttribute('aria-label', 'Row 5, Column 5, empty')
    })

    it('clears a shown error when the board changes', () => {
      renderCustom()

      clickButton('Validate & Play')
      expect(
        screen.getByText(`Need at least ${MIN_GIVENS} givens for a valid Sudoku puzzle.`),
      ).toBeInTheDocument()

      clickCell(0)
      expect(screen.queryByText(/Need at least/)).not.toBeInTheDocument()
    })
  })

  describe('paste', () => {
    it('fills the board from an 81-symbol paste and shows no error', async () => {
      stubClipboard(vi.fn(() => Promise.resolve(VALID_PASTE)))
      const { container } = renderCustom()

      clickButton('Paste')

      await waitFor(() => {
        expect(cell(0)).toHaveAttribute('aria-label', 'Row 1, Column 1, value 5')
      })
      expect(cell(1)).toHaveAttribute('aria-label', 'Row 1, Column 2, value 3')
      expect(cell(3)).toHaveAttribute('aria-label', 'Row 1, Column 4, empty')
      expect(queryError(container)).toBeNull()
    })

    it('maps dot placeholders to empty cells', async () => {
      const dotted = `.${VALID_PASTE.slice(1)}`
      stubClipboard(vi.fn(() => Promise.resolve(dotted)))
      const { container } = renderCustom()

      clickButton('Paste')

      await waitFor(() => {
        expect(cell(0)).toHaveAttribute('aria-label', 'Row 1, Column 1, empty')
      })
      expect(cell(1)).toHaveAttribute('aria-label', 'Row 1, Column 2, value 3')
      expect(queryError(container)).toBeNull()
    })

    it('strips non-digit characters before parsing', async () => {
      const separated = `${VALID_PASTE.slice(0, 9)}\n${VALID_PASTE.slice(9)}`
      stubClipboard(vi.fn(() => Promise.resolve(separated)))
      const { container } = renderCustom()

      clickButton('Paste')

      await waitFor(() => {
        expect(cell(0)).toHaveAttribute('aria-label', 'Row 1, Column 1, value 5')
      })
      expect(queryError(container)).toBeNull()
    })

    it('rejects a paste shorter than 81 cells with the expected-count message', async () => {
      stubClipboard(vi.fn(() => Promise.resolve(VALID_PASTE.slice(0, 80))))
      renderCustom()

      clickButton('Paste')

      expect(
        await screen.findByText('Expected 81 digits, got 80. Use 0 or . for empty cells.'),
      ).toBeInTheDocument()
      expect(cell(0)).toHaveAttribute('aria-label', 'Row 1, Column 1, empty')
    })

    it('rejects a paste longer than 81 cells with the expected-count message', async () => {
      stubClipboard(vi.fn(() => Promise.resolve(VALID_PASTE + '5')))
      renderCustom()

      clickButton('Paste')

      expect(
        await screen.findByText('Expected 81 digits, got 82. Use 0 or . for empty cells.'),
      ).toBeInTheDocument()
      expect(cell(0)).toHaveAttribute('aria-label', 'Row 1, Column 1, empty')
    })

    it('shows the failed-to-read message when the clipboard read rejects', async () => {
      stubClipboard(() => Promise.reject(new Error('clipboard denied')))
      renderCustom()

      clickButton('Paste')

      expect(await screen.findByText('Failed to read clipboard')).toBeInTheDocument()
    })
  })

  describe('validate and play', () => {
    const pasteBoard = async (text: string) => {
      stubClipboard(vi.fn(() => Promise.resolve(text)))
      clickButton('Paste')
      await waitFor(() => {
        expect(cell(0)).toHaveAttribute('aria-label', 'Row 1, Column 1, value 5')
      })
    }

    it('errors without calling the service when givens are below the minimum', () => {
      renderCustom()

      clickButton('Validate & Play')

      expect(
        screen.getByText(`Need at least ${MIN_GIVENS} givens for a valid Sudoku puzzle.`),
      ).toBeInTheDocument()
      expect(mockValidate).not.toHaveBeenCalled()
    })

    it('navigates to the encoded custom URL for a valid unique puzzle', async () => {
      mockValidate.mockResolvedValue({
        valid: true,
        unique: true,
        puzzle_id: 'custom-abc',
        solution: Array<number>(81).fill(1),
      })
      renderCustom()
      await pasteBoard(VALID_PASTE)

      clickButton('Validate & Play')

      const expected = `/c/${encodePuzzle(VALID_PASTE.split('').map((c) => parseInt(c, 10)))}`
      await waitFor(() => {
        expect(screen.getByTestId('navigated')).toHaveTextContent(expected)
      })
      expect(mockValidate).toHaveBeenCalledTimes(1)
      const call = mockValidate.mock.calls[0]
      if (!call) throw new Error('validateCustomPuzzle was not called')
      const [boardArg, deviceIdArg] = call
      expect(boardArg).toEqual(VALID_PASTE.split('').map((c) => parseInt(c, 10)))
      expect(typeof deviceIdArg).toBe('string')
      expect(deviceIdArg.length).toBeGreaterThan(0)
    })

    it('shows the service reason for an invalid puzzle', async () => {
      mockValidate.mockResolvedValue({ valid: false, reason: 'Row 3 conflicts' })
      renderCustom()
      await pasteBoard(VALID_PASTE)

      clickButton('Validate & Play')

      expect(await screen.findByText('Row 3 conflicts')).toBeInTheDocument()
      expect(screen.queryByTestId('navigated')).not.toBeInTheDocument()
    })

    it('shows the multiple-solutions message for a non-unique puzzle', async () => {
      mockValidate.mockResolvedValue({ valid: true, unique: false })
      renderCustom()
      await pasteBoard(VALID_PASTE)

      clickButton('Validate & Play')

      expect(
        await screen.findByText(
          'Puzzle has multiple solutions. A valid Sudoku must have exactly one solution.',
        ),
      ).toBeInTheDocument()
      expect(screen.queryByTestId('navigated')).not.toBeInTheDocument()
    })

    it('shows the thrown error message when validation rejects with an Error', async () => {
      mockValidate.mockRejectedValue(new Error('solver exploded'))
      renderCustom()
      await pasteBoard(VALID_PASTE)

      clickButton('Validate & Play')

      expect(await screen.findByText('solver exploded')).toBeInTheDocument()
    })

    it('shows the generic failure message when validation rejects with a non-Error', async () => {
      mockValidate.mockRejectedValue('boom')
      renderCustom()
      await pasteBoard(VALID_PASTE)

      clickButton('Validate & Play')

      expect(
        await screen.findByText('Failed to validate puzzle. Please try again.'),
      ).toBeInTheDocument()
    })
  })
})
