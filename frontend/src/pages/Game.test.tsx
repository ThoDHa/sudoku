import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import Game from './Game'
import { ThemeProvider } from '../lib/ThemeContext'
import { GameProvider } from '../lib/GameContext'
import { BackgroundManagerProvider } from '../lib/BackgroundManagerContext'
import { STORAGE_KEYS } from '../lib/constants'
import * as solverService from '../lib/solver-service'

// jsdom does not implement window.matchMedia; ThemeProvider reads it to pick
// the system color-scheme. Polyfill once per file before any render.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// Render-test harness for the Game page. The WASM solver and the static puzzle
// bank both live behind solver-service, so mocking that single module makes the
// harness fast and deterministic while still exercising every Game.tsx code
// path the braid refactor must preserve: render, selection, digit entry, undo,
// hint surfacing, modal open/close, and a keyboard shortcut.
//
// The five behaviors locked here are the critical path the input-handler /
// autoSolve-adapter braid touches; if any of them break during extraction, the
// harness fails before the slower e2e suite runs in CI.

// vi.hoisted runs before the vi.mock factory's evaluation, so the fixtures are
// available inside the factory. Both helpers are pure (they build fixed
// arrays), so hoisting them has no side effects. The arrays are inlined rather
// than imported because vi.hoisted runs before ESM imports resolve.
const { GIVENS, SOLUTION, TARGET_IDX, TARGET_DIGIT, CANDIDATES } = vi.hoisted(() => {
  // Same fixture as test-utils/gameFixtures.ts createEvidencePuzzle: a sparse
  // board with givens at known cells. Inlined (not imported) so the hoisted
  // closure has no module dependency.
  const givens = Array(81).fill(0)
  givens[0] = 5
  givens[4] = 3
  givens[8] = 7
  givens[9] = 6
  givens[18] = 8
  givens[20] = 3
  givens[27] = 1
  givens[35] = 9
  givens[36] = 8
  givens[44] = 2
  givens[45] = 4
  givens[53] = 5
  givens[54] = 7
  givens[62] = 3
  givens[63] = 2
  givens[71] = 6
  givens[72] = 9
  givens[80] = 1

  // Mirror of createEvidenceSolution: overlay givens, fill a known value at
  // idx 1, then pad the remainder with (i % 9) + 1 so isValidSolution can
  // never mis-classify the test board as already complete.
  const solution = [...givens]
  solution[1] = 4
  solution[2] = 2
  solution[3] = 9
  solution[5] = 1
  solution[6] = 6
  solution[7] = 8
  for (let i = 0; i < 81; i++) {
    if (solution[i] === 0) {
      solution[i] = (i % 9) + 1
    }
  }

  // Hint candidates: the target cell (idx 1) must carry TARGET_DIGIT (4) as a
  // candidate, or the Board's isHighlightedPrimary check (which only lights up
  // empty cells whose candidates include the hint digit) will refuse to render
  // the bg-cell-primary class. Every other cell is left empty.
  const targetIdx = 1
  const targetDigit = solution[targetIdx]
  const candidates: number[][] = Array.from({ length: 81 }, () => [])
  candidates[targetIdx] = [targetDigit]

  return {
    GIVENS: givens,
    SOLUTION: solution,
    TARGET_IDX: targetIdx,
    TARGET_DIGIT: targetDigit,
    CANDIDATES: candidates,
  }
})

vi.mock('../lib/solver-service', () => ({
  // Echo the requested seed back so the persisted puzzle uses a validateSeed-
  // passing prefix (the harness routes to /P-test). The static fixtures for
  // givens/solution come from the hoisted block above.
  getPuzzle: vi.fn(async (seed: string) => ({
    puzzle_id: 'test-puzzle',
    seed,
    difficulty: 'easy',
    givens: GIVENS,
    solution: SOLUTION,
    puzzle_index: 0,
  })),
  findNextMove: vi.fn().mockResolvedValue({
    move: {
      step_index: 0,
      technique: 'Naked Single',
      action: 'place',
      digit: TARGET_DIGIT,
      targets: [{ row: 0, col: TARGET_IDX }],
      explanation: 'Only candidate here',
      refs: { title: 'Naked Single', slug: 'naked-single', url: '' },
      highlights: { primary: [{ row: 0, col: TARGET_IDX }] },
      // isUserMove lets Board's isHighlightedPrimary highlight an empty cell
      // unconditionally, so the harness can assert the highlight braid without
      // having to first populate game candidates for the target digit.
      isUserMove: true,
    },
    board: GIVENS.slice(),
    candidates: CANDIDATES,
    solved: false,
  }),
  validateBoard: vi.fn(() => ({
    valid: true,
    message: 'All entries are correct!',
    incorrectCells: [],
  })),
  validateCustomPuzzle: vi.fn(),
  cleanupSolver: vi.fn(),
  checkAndFixWithSolution: vi.fn(),
  getDailySeed: vi.fn(() => ({
    date_utc: '2026-07-18',
    seed: 'daily-2026-07-18',
  })),
  isWasmReady: false,
  setWorkerMode: vi.fn(),
  isUsingWorkerMode: vi.fn(() => false),
  enableWorkerMode: vi.fn(),
  initializeSolver: vi.fn(() => Promise.resolve()),
  solveAll: vi.fn(),
}))

async function renderGame(route = '/P-test?d=easy') {
  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <GameProvider>
          <BackgroundManagerProvider>
            {/* Game reads useParams() for :seed, so it must render inside a
                matching Route. Mirrors the App.tsx wiring. */}
            <Routes>
              <Route path="/:seed" element={<Game />} />
            </Routes>
          </BackgroundManagerProvider>
        </GameProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )

  // Wait for the puzzle to load so the 81 cells render with the seeded givens.
  // The loading spinner disappears once usePuzzleLoader flips loading=false,
  // then a follow-up restore effect applies the givens to the board. Wait for
  // the first given cell to be populated so the harness sees the real board.
  await waitFor(() => {
    expect(screen.getAllByRole('gridcell')).toHaveLength(81)
  })
  await waitFor(() => {
    expect(cell(0).textContent).toContain('5')
  })
  return utils
}

function cell(idx: number) {
  return document.querySelector(`[data-cell-idx="${idx}"]`) as HTMLElement
}

function cellHasClass(idx: number, className: string): boolean {
  const el = cell(idx)
  return !!el && el.className.split(/\s+/).includes(className)
}

function pressKey(key: string, modifiers: { ctrlKey?: boolean; metaKey?: boolean } = {}) {
  fireEvent.keyDown(document, { key, bubbles: true, ...modifiers })
}

describe('Game page render-test harness', () => {
  beforeEach(() => {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true')
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify({ showDailyReminder: false }))
    // Ensure no leftover saved game pushes the board into "restored as complete".
    localStorage.clear()
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true')
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify({ showDailyReminder: false }))
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  describe('render and seeded givens', () => {
    it('renders 81 cells with the seeded givens visible', async () => {
      await renderGame()

      const cells = screen.getAllByRole('gridcell')
      expect(cells).toHaveLength(81)

      // Givens come straight from the mocked getPuzzle response; the first
      // given cell (idx 0) holds digit 5 in the evidence puzzle.
      expect(cell(0).textContent).toContain('5')
      // An empty cell renders no digit text.
      expect(cell(TARGET_IDX).textContent?.trim()).toBe('')
    })
  })

  describe('click selects with ring-accent', () => {
    it('selects an empty cell on click and marks it with the accent ring', async () => {
      await renderGame()

      expect(cellHasClass(TARGET_IDX, 'ring-accent')).toBe(false)
      fireEvent.click(cell(TARGET_IDX))
      expect(cellHasClass(TARGET_IDX, 'ring-accent')).toBe(true)
    })
  })

  describe('digit entry places and undo reverses', () => {
    it('places a digit on the selected cell and reverses via undo', async () => {
      await renderGame()

      // Select the empty cell, then enter the digit through the Controls pad.
      fireEvent.click(cell(TARGET_IDX))
      const digitBtn = screen.getByRole('button', {
        name: new RegExp(`Enter ${TARGET_DIGIT}, `),
      })
      fireEvent.click(digitBtn)

      // The placed digit must appear in the cell.
      await waitFor(() => {
        expect(cell(TARGET_IDX).textContent).toContain(String(TARGET_DIGIT))
      })

      // Undo through the Controls button reverses the placement.
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      await waitFor(() => {
        expect(cell(TARGET_IDX).textContent?.trim()).toBe('')
      })
    })
  })

  describe('hint path surfaces the mocked move', () => {
    it('renders the hint toast and the primary highlight on the target cell', async () => {
      await renderGame()

      // The hint button's accessible name is "Get a hint" when idle.
      const hintBtn = screen.getByRole('button', { name: 'Get a hint' })
      fireEvent.click(hintBtn)

      await waitFor(() => {
        expect(solverService.findNextMove).toHaveBeenCalledTimes(1)
      })

      // The technique explanation surfaces as a success toast.
      await waitFor(() => {
        expect(screen.getByText(/Only candidate here/i)).toBeInTheDocument()
      })

      // The toast is a polite live region (success => role=status) so screen
      // readers announce validation/hint messages instead of rendering them silent.
      await waitFor(() => {
        const toast = screen.getByRole('status')
        expect(toast).toHaveAttribute('aria-live', 'polite')
      })

      // The hint target (row 0, col TARGET_IDX -> idx TARGET_IDX) carries the
      // primary-highlight class, proving the highlight braid is intact.
      await waitFor(() => {
        expect(cellHasClass(TARGET_IDX, 'bg-cell-primary')).toBe(true)
      })
    })
  })

  describe('modal open/close', () => {
    it('opens the clear-all confirmation dialog and closes it on cancel', async () => {
      await renderGame()

      // Open the in-page menu, then fire the clear-all action. The menu
      // button is labelled "Menu" and the action button reads "Clear All".
      fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
      const clearAllBtn = await screen.findByText('Clear All')
      fireEvent.click(clearAllBtn)

      // The GameModals confirm dialog renders its title; the dialog body
      // appears once showClearConfirm flips on.
      await waitFor(() => {
        expect(screen.getByText(/Clear All Entries\?/i)).toBeInTheDocument()
      })

      // Cancel closes the dialog.
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await waitFor(() => {
        expect(screen.queryByText(/Clear All Entries\?/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('keyboard shortcut', () => {
    it('undoes via Ctrl+Z after a digit placement', async () => {
      await renderGame()

      fireEvent.click(cell(TARGET_IDX))
      const digitBtn = screen.getByRole('button', {
        name: new RegExp(`Enter ${TARGET_DIGIT}, `),
      })
      fireEvent.click(digitBtn)

      await waitFor(() => {
        expect(cell(TARGET_IDX).textContent).toContain(String(TARGET_DIGIT))
      })

      // jsdom's navigator.platform is non-Mac, so the hook treats Ctrl as the
      // undo modifier. Pressing Ctrl+Z undoes the placement.
      pressKey('z', { ctrlKey: true })
      await waitFor(() => {
        expect(cell(TARGET_IDX).textContent?.trim()).toBe('')
      })
    })
  })
})
